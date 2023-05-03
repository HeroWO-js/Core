define(['DOM.Common', 'Calculator', 'ObjectStore'], function (Common, Calculator, ObjectStore) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // Empty WAV is 44 bytes long, empty MP3 is over 1K full of NULLs. Duh. If anyone can construct a shorter MP3 be sure to send it to me.
  var r = _.repeat.bind(_, 'A')
  const EMPTY = 'data:audio/mp3;base64,//tgzAADw'+r(339)+'//sQzHgDw'+r(129)+'D/+xDMoYP'+r(130)+'P/7EMzLA8'+r(130)+'//sQzPSDw'+r(129)+'D/+xDM/4P'+r(130)+'P/7EMz/g8'+r(130)+'//sQzP+Dw'+r(129)+'D/+xDM/4P'+r(131)+'=='

  // Enables audio effects and background music using browser's `[<audio>`] and possibly WebAudio.
  //
  // Children of `#Audio are `#Channel-s - individual `[<audio>`] and/or `'AudioSourceNode wrappers. Multiple
  // `#Channel-s can be `'playing at the same time but attempt to play something
  // in an existing `#Channel stops its current playback.
  //
  // Channels (their `'_parentKey) are named. The only standard channel name is `'bgm
  // (background music).
  //
  // Channels also have `'kind, and that may be the same
  // for several channels (unlike channel's name). Standard kinds are `'bgm,
  // `'sfx (sound effects like button clicks), `'bgs (environmental effects on ADVMAP).
  var Audio = Common.Sqimitive.extend('HeroWO.H3.DOM.Audio', {
    // Using ContextModule because technically audio output is per-player, just like video output but it's
    // not clear how to really output it to one "screen" instead of entire browser tab
    // and whether this is ever needed.
    mixIns: [Common.ContextModule],
    // persistent allows smooth fading effects when changing players.
    _childClass: 'Channel',
    persistent: true,
    _buffers: null,
    _debouncedUpdate: Common.stub,
    _positions: {},

    //> bgm float`, 0 silent`, 1 full volume `- default volume for background
    //  music; changing on run-time causes volume in existing channels with this `'kind to adjust
    //> buttonDelay null`, integer ms `- the delay between user clicking a button and
    //  its sound effect being played; `'0 for no delay; `'null for `'classic
    _opt: {
      bgm: 0.5,   // SoD default = 1.0
      sfx: 1.0,   // SoD default = 1.0
      bgs: 0.25,  // linked to sfx in SoD by about this ratio
      bgsRatio: 0.25,
      buttonDelay: null,
      audio: null,    // value of H3.Databank's audio, if have no ready ui
      rpc: null,
      screen: null,   // Screen
      ui: null,    // internal
    },

    events: {
      init: function (opt) {
        this._debouncedUpdate = _.debounce(Common.ef('update', this), 50)

        try {
          this._buffers = new Audio.Nodes
        } catch (e) {
          // IE or FF with dom.webaudio.enabled off.
          _.log && _.log('Audio buffers not created : %s', e.message)
        }
      },

      change: function (name, value) {
        if (typeof value == 'number') {
          // Restart bgm/bgs.
          this._debouncedUpdate()

          this.each(function (channel) {
            if (channel.get('kind') == name) {
              channel.set('volume', value)
            }
          })
        }
      },

      'change_sfx, change_bgsRatio': function () {
        this.set('bgs', this.get('sfx') * this.get('bgsRatio'))
      },

      change_audio: 'update',

      change_rpc: function (now, old) {
        old && this.autoOff(old)

        now && this.autoOff(now, {
          serverEvent: function (event) {
            switch (event) {
              case 'connected':
                var sound = sound || 'PLAYCOME'
              case 'disconnected':
                var sound = sound || 'PLAYEXIT'
                this.playIfEnabled(sound, 'sfx', 'conn')
            }
          },
        })
      },

      change_screen: function (now, old) {
        _.log && _.log('Audio screen = P%d <- P%d', now && now.get('player'), old && old.get('player'))

        if (old) {
          old.set('audio', null)
          this.autoOff(old)
          this.set('ui', null)
        }

        if (now) {
          now.set('audio', this)

          this.autoOff(now, {
            '-unnest': function () {
              this.set('screen', null)
            },
          })
            .whenRenders('render', function () {
              this.set('ui', now.modules.nested('HeroWO.H3.DOM.UI'))
            }, this)
        }
      },

      change_ui: function (now, old) {
        if (old) {
          this.autoOff(old.sc.player)
          this.autoOff(old.sc.transitions)
          this.autoOff(old.sc.map.objects)
          this.autoOff(old.sc.map)
          this.autoOff(old.windows)
        }

        if (now) {
          var sc = now.sc
          var rules = now.rules

          this.autoOff(sc, {
            change_current: 'update',
          })

          this.autoOff(sc.player, {
            change_interactive: 'update',
            change_won: 'update',
          })

          var transitions = {
            mapTeleport: 'TELPTOUT',
            mapEmbark: 'KILLFADE',
            mapDisembark: 'KILLFADE',
          }

          this.autoOff(sc.transitions, [
            _.keys(transitions).map(function (s) { return 'nest_' + s }).join(', '),
            function (view) {
              var teleport
              var owner
              this.autoOff(view, {
                collect: function (tr, tick) {
                  if (!tick) {
                    switch (view.get('type')) {
                      case 'mapTeleport':
                        teleport = sc.map.objects.atCoords(view.get('bonus'), 0, 0, 'class', 0)
                      case 'mapEmbark':
                      case 'mapDisembark':
                        owner = sc.map.objects.atCoords(view.get('object'), 0, 0, 'owner', 0)
                    }
                  }
                },
                tick: function (async, tick) {
                  if (!tick) {
                    var sound = transitions[view.get('type')]
                    switch (view.get('type')) {
                      case 'mapTeleport':
                        if (_.includes(rules.objectsID.whirlpool, teleport)) {
                          sound = 'DANGER'
                        } else if (_.includes(rules.objectsID.subterraneanGate, teleport)) {
                          sound = 'CAVEHEAD'
                        }
                      case 'mapEmbark':
                      case 'mapDisembark':
                        if (owner != sc.get('player')) { return }
                        break
                    }
                    var chan = this.playIfEnabled(sound, 'sfx', '')
                    if (chan) {
                      chan.on('ended', async.nestDoner())
                      view.release(chan)
                    }
                  }
                },
              })
            },
            'nest_combatEnd',
            function (view) {
              var chan
              this.autoOff(view, {
                tick: function (async, tick) {
                  if (!tick && (chan = this.pause('bgm'))) {
                    chan.set('audioCombat', true)
                  }
                },
                end: function () {
                  if (chan) {
                    // combatEnd view end-s (in fact, abort-s) when the combat window closes, not just when Combat.Results are dismissed.
                    chan.set('audioCombat', false)
                    this.update()
                  }
                },
              })
            },
            'nest_mapMove',
            function (view) {
              var owner = sc.map.objects.atCoords(view.get('object'), 0, 0, 'owner', 0)
              if (owner == sc.get('player')) {
                var flying
                var types = []
                var channel
                view.set(this._cid, true)
                this.autoOff(view, {
                  collect: function (tr, tick) {
                    if (!tick) {
                      return
                    }
                    // Technically Angel Wings (or equivalent) could be changed during movement but for simplicity checking if they were on at the beginning, assuming they were on till the end if so.
                    if (flying == null) {
                      flying = sc.cx.oneShotEffectCalculation({
                        class: Calculator.Effect.GenericBool,
                        target: rules.constants.effect.target.hero_walkImpassable,
                        ifObject: view.get('object'),
                      })
                    }
                    if (flying) {
                      types.push(10)    // HORSE10.WAV
                    } else {
                      // SoD plays sound of the departed tile.
                      var pos = tr.get('path')[tick - 1]
                      // XXX+B got stack traces telling pos is null; shouldn't happen, research and remove && when figured out
                      var id = pos && sc.map.bySpot.findAtCoords(pos[0], pos[1], pos[2], 0,
                        function ($1, $2, $3, $4, l, n) {
                          if (this.atContiguous(n + sc.map.bySpot.propertyIndex('type'), l) == rules.constants.object.type.terrain) {
                            return this.atContiguous(n + sc.map.bySpot.propertyIndex('id'), l)
                          }
                        })
                      if (id) {
                        types.push(rules.classes.atCoords(sc.map.objects.atCoords(id, 0, 0, 'class', 0), 0, 0, 'class', 0))
                      }
                    }
                  },
                  tick: function (async, tick) {
                    // When disembarking, SoD sometimes plays the water traversal sound, sometimes not. We always play it.
                    if (tick) {
                      if (!sc.get('current') || sc.get('current').get('id') != view.get('object')) {
                        return channel && channel.remove()
                      }
                      this._update(_, view.get('path')[tick])
                      var type = types[tick - 1]
                      if (type != types[tick - 2]) {
                        channel && channel.remove()
                        if (type != null) {
                          channel = this.playIfEnabled(_.format('HORSE%02d', type), 'sfx', '')
                          if (channel) {
                            channel.set('loop',true)
                            view.release(channel)
                          }
                        }
                      }
                    }
                  },
                })
              }
            },
          ])

          this.autoOff(sc.map.objects, {
            ochange: Common.batchGuard(5, function ($1, $2, $3, $4, $5, options) {
              var cur = sc.get('current')
              if (cur) {
                var update = options.batch.some(function (item) {
                  if (item[0] == 'ochange' && item[1] == cur.get('n')) {
                    switch (item[3]) {
                      case sc.map.objects.propertyIndex('x'):
                      case sc.map.objects.propertyIndex('y'):
                      case sc.map.objects.propertyIndex('z'):
                      case sc.map.objects.propertyIndex('width'):
                      case sc.map.objects.propertyIndex('height'):
                      case sc.map.objects.propertyIndex('actionable'):
                        return true
                    }
                  }
                })
                if (update && !sc.transitions.of(options.transition, this._cid)) {
                  this._debouncedUpdate()
                }
              }
            }),
          })

          this.autoOff(sc.map, {
            change_finished: this._debouncedUpdate,
          })

          this.autoOff(now.windows, {
            change_topFullScreen: this._debouncedUpdate,
            change_topModal: '_playWindowAudio',
            '.change': function (win, name) {
              if (name == 'audio' && win == now.windows.get('topModal')) {
                this._playWindowAudio(win)
              }
            },
          })
        }

        this._debouncedUpdate()
      },

      attach: function () {
        this.autoOff(this.cx, {
          // Not debounced to accurately manage MainMenu music given that upon dataReady the JS engine becomes clogged with execution and our timer will run much later than we plan it for.
          'change_screen, change_loading, change_dataReady, change_configuring': 'update',
        })

        Common.autoOffNode(this, this.cx.el, {
          'mousedown .Hsfx__btn:not(.Hh3-btn_dis)': function () {
            // SoD has this curious little delay between pressing a button
            // and playing sound for it.
            var delay = this.get('buttonDelay')
            if (delay == null) { delay = this.cx.get('classic') ? 100 : 0 }
            setTimeout(this.playIfEnabled.bind(this, 'BUTTON', 'sfx', '', true), delay)
          },
        })

        // Modern browsers by default don't let playback to start before user clicks
        // somewhere within the page.
        var off = Common.autoOffNode(this, document.body, {
          mousedown: function (e) {
            _.log && _.log('Audio detected user interaction : %s', e.target)
            off.remove()

            this.each(function (chan) {
              if (chan.get('loop') && chan.get('notAllowed')) {
                chan.ifSet('playing', false) && chan.set('playing', true)
              }
            })
          },
        })
      },

      '-unnest': function () {
        this._debouncedUpdate.cancel()
        this.set('rpc', null)
        this.set('screen', null)
        this._buffers && this._buffers.remove()
      },

      _update: function (updateUsing, pos) {
        this._debouncedUpdate.cancel()

        var bgm
        var random
        var bgs = {}   // aka environmental sounds; sound => distance
        var opt = this.cx.get()
        var existingBGM = this.nested('bgm')

        if (opt.loading ? opt.configuring || !opt.dataReady : !opt.screen) {
          bgm = 'MAINMENU'
        } else if (opt.screen == 'game' && this.get('ui') /*means !loading*/) {
          if (this.get('ui').map.get('finished')) {
            // Playing no sound for mixed (won of 2).
            bgm = ['ULTIMATELOSE', 'WIN SCENARIO'][this.get('ui').pl.get('won')]
            var finished = true
            // This is followed by HSANIM/HSLOOP/LOSEGAME.SMK and highscores screen in SoD.
          } else if (!this.get('screen').player.get('interactive')) {
            bgm = 'AITHEME"'
            random = [0, 2]
          } else {
            var top = this.get('ui').windows.get('topFullScreen')
          }
          switch (top && top.constructor.name) {
            case 'HeroWO.H3.DOM.UI.Townscape':
            case 'HeroWO.H3.DOM.UI.Townscape.Fort':
            case 'HeroWO.H3.DOM.UI.Townscape.Hall':
            case 'HeroWO.H3.DOM.UI.Townscape.MageGuild':
              bgm = top.rules.towns.atCoords(top.get('town').get('subclass'), 0, 0, 'music', 0)
              break
            case 'HeroWO.H3.DOM.Combat':
              if (!existingBGM || !existingBGM.get('audioCombat')) {
                var combat = top
                bgm = 'COMBAT0"'
                random = [1, 4]
              }
              break
            case 'HeroWO.H3.DOM.UI.HeroTrade':
              var cur = top.get('right')
            case 'HeroWO.H3.DOM.UI.AdventureMap':
              var cur = cur || this.get('screen').get('current')
              // XXX=IC SoD plays last BGM (XXX=C) if there's no current object (e.g. after dismissing a hero, new object isn't automatically selected and previous sounds continue)
              if (cur) {
                updateUsing == _ || (pos = top.map.actionableSpot(cur.get('id')))
                var atter = top.map.objects.atter(['class', 'actionable', 'passable'])
                // Rules for audibility were determined empirically. Recheck (XXX=C).
                //
                // XXX=R it's probably more flexible and less hardcoded to define max audible distance in AClass on the per-object basis (rationale: big loud objects are heard from afar); add a new field to map.byPassable (or create a new index) telling which sounds (or objects) are heard on a given spot, and at what volume; this will allow very far-heard objects and Audio won't need to traverse the map on every update to determine them
                var max = 3
                var groups = {}
                // Scanning into map margins as well for simplicity.
                top.map.bySpot.findWithinRect(
                  Math.max(0, pos[0] - max), Math.max(0, pos[1] - max), pos[2],
                  pos[0] + max, pos[1] + max, pos[2],
                  0,
                  function ($1, x, y, z, l, n) {
                    var obj = atter(this.atContiguous(n + this.propertyIndex('id'), l), 0, 0, 0)
                    var heard = obj.actionable
                      ? this.atContiguous(n + this.propertyIndex('actionable'), l) == top.rules.constants.spotObject.actionable.actionable
                      : obj.passable
                        ? this.atContiguous(n + this.propertyIndex('actionable'), l) == top.rules.constants.spotObject.actionable.impassable
                        : true
                    if (!heard) { return }
                    var sub = top.rules.classes.readSubAtCoords(obj.class, 0, 0, 'sounds', 0)
                    sub.find(0, function ($1, i) {
                      var s = sub.atCoords(i, 0, 0, 'sound', 0)
                      var group = sub.atCoords(i, 0, 0, 'group', 0)
                      var dist = Math.max(Math.abs(x - pos[0]), Math.abs(y - pos[1]))
                      _.log && _.log('Audio %s bgs of %d, class %d, %d tiles away : %s : %s', group || '', this.atContiguous(n + this.propertyIndex('id'), l), obj.class, dist, s, top.map.objects.atCoords(this.atContiguous(n + this.propertyIndex('id'), l), 0, 0, 'texture', 0))
                      // 3 = 25% volume
                      // 2 = 50%
                      // 1 = 75%
                      // 0 = 100%
                      dist = 1 / (max + 1) * (max - dist + 1)
                      if (group === false) {
                        bgs[s] = _.has(bgs, s) ? Math.max(bgs[s], dist) : dist
                      } else {
                        switch (_.has(groups, group) && _.sign(dist - groups[group][1])) {
                          case 0:
                            if (groups[group][2] < obj._n) { break }
                          case 1:
                          case false:
                            groups[group] = [s, dist, obj._n]
                        }
                      }
                    }, this)
                  }
                )
                _.each(groups, function (g, group) {
                  if (!_.has(bgs, g[0]) || bgs[g[0]] < g[1]) {
                    bgs[g[0]] = g[1]
                    if (group == 'bgm') {
                      bgm = g[0]    // route playback to the bgm channel to take advantage of position resuming
                      delete bgs[bgm]
                      if (cur.isTown) {
                        // SoD continues to play town's music when leaving it, until you switch to (another non-town object) or (another town standing on another type of terrain) using the right panel's list.
                        //
                        // We play music until switch to non-town or to another town of different type (i.e. switch from Castle to Castle doesn't restart the track). XXX=IC implement as SoD in classic mode
                        var town = this.url(top.rules.towns.atCoords(cur.get('subclass'), 0, 0, 'music', 0))
                        if (this.nested('bgm') && this.nested('bgm').get('url') == town) {
                          bgm = town
                        }
                      }
                    }
                  }
                }, this)
              }
              break
          }
        }

        // Using " because bgm could be already an expanded url() and " must be escaped in any URL portion, unlike # or % (_.format()).
        var url = bgm && this.url(bgm.replace('"', _.random.apply(_, random))) || ''

        if (!url) {
          this.pause('bgm')
        } else {
          var bgmMuted = !this.get('bgm')

          if (existingBGM && existingBGM.get('url') /*not faded*/ &&
              existingBGM.get('audioRandom') == bgm) {
            // Don't restart win/lose track if UI state changes because user goes to town screen, etc.
            if (finished) { return }
            // Don't restart if new track is of the same random group (").
            url = existingBGM.get('url')
          }

          // If BGM is disabled, pretend it has played through by giving an empty sound (thankfully onended doesn't occur immediately). This way the hooks are called normally while browser doesn't download or decode the unused file.
          var chan = this.play(bgmMuted ? EMPTY : url, 'bgm')

          chan.assignResp({
            // XXX=IC In SoD, if you set music volume to 0 and then to non-0, you will hear the same combat track (not new random track picked) continuing from the same position. We should maintain a per-combat resumePositions, also because our combat window can be hidden and shown at will and it's best if showing a previously viewed window resumes the track rather than starts a random one from 0.
            resume: !combat,
            loop: !bgmMuted && !finished,
            audioRandom: !bgmMuted && bgm,
         })

          if (combat) {
            // XXX=IC SoD blocks any user interaction until BATTLE*.WAV is played (though I find it quite annoying). We should do this at least in classic mode.
            var cur = combat.get('audioBATTLE')
            cur = cur && cur[0] == combat.combat._parentKey ? cur[1] : null
            if (cur === false) {
              chan.pause()
            } else if (!cur) {
              // In SoD too this counts as a sound effect, not BGM (from game options' perspective).
              var sfx = this.playIfEnabled('BATTLE0' + _.random(7), 'sfx', '')
              if (sfx) {
                combat.set('audioBATTLE', [combat.combat._parentKey, false])
                chan.pause()
                sfx.on('ended', function () {
                  combat.set('audioBATTLE', [combat.combat._parentKey, true])
                  chan.set('playing', true)
                })
                chan.on({
                  '-unnest, change_url': function () {
                    combat.set('audioBATTLE', [combat.combat._parentKey, true])
                    sfx.remove()
                  },
                })
              } else {
                combat.set('audioBATTLE', [combat.combat._parentKey, true])
              }
            }
          }
        }

        if (this.get('bgs')) {
          _.log && _.log('Audio bgs : %.j', bgs)

          bgs = _.object(_.keys(bgs).map(this.url, this), _.values(bgs))

          this.each(function (chan) {
            if (chan.get('kind') == 'bgs') {
              var s = chan.get('url')
              if (_.has(bgs, s)) {
                chan.set('limiter', bgs[s])
                delete bgs[s]
              } else {
                chan.remove()
              }
            }
          })

          _.each(bgs, function (limiter, sound) {
            this.play(sound, 'bgs', '')
              .set('loop', true)
              .set('limiter', limiter)
          }, this)
        }
      },
    },

    _playWindowAudio: function (win) {
      win && win.getSet('audio', function (file) {
        if (file) {
          var chan = this.playIfEnabled(file, 'sfx', '')
          if (chan && (win.get('audioLinger') === false || (win.get('audioLinger') == null && !this.cx.get('classic')))) {
            win.on('unnest', 'remove', chan)
          }
        }
      }, this)
    },

    //! `, +fna=function ( src, kind[, channel] )
    // Starts playing an audio source.
    //
    //> src string `- URL or name in databank
    //> kind string `- type of the audio for volume control and other purposes
    //> channel string`, missing use `'kind `- audio slot; stops playing
    //  existing audio in that slot
    //
    //= `#Channel new or existing`, null if `'src isn't listed in databank
    //
    // If `'channel is empty then new channel is always created and is automatically removed
    // after it has `'ended.
    //
    // Else a channel is created if it doesn't exist. `'kind supplied for
    // the same `'channel should be the same for all such calls.
    //
    // Warning: this may return `'null. Be cautious about effects of passing `'null to other functions, like `'on():
    //[
    //  var chan = play('non-existent')
    //  transition.on('unnest', 'remove', chan)
    //    // X.on('Y', 'Z', null) listens to Y on X and calls X.Z; the above
    //    // reads "on own unnest, call own remove()" which is not what we
    //    // wanted and even creates a recursion because remove() itself calls unnest()
    //]
    play: function (src, kind, channel, noLog) {
      src = this.url(src)
      if (!src) {
        console && console.warn('Audio not found in databank: ' + arguments[0])
        return
      }
      var obj
      if (channel == '' || !(obj = this.nested(channel = channel || kind))) {
        var bgm = channel == 'bgm'
        obj = this.addModule(channel, this._childClass, {
          buffers: this._buffers,
          kind: kind,
          volume: this.get(kind),
          log: channel != '' || !noLog,
          resumePositions: bgm && this._positions,
          fade: bgm,
        })
        channel == '' && obj.on('1^ended', 'remove')
        if (!noLog) {
          _.log && _.log('Audio %s ++ %s/%s', obj._cid, kind, channel)
        }
      }
      obj.assignResp({url: src, playing: true})
      return obj
    },

    // Starts playing an audio source but only if `'kind isn't currently muted.
    //= null if this kind of sound is turned off in game options
    playIfEnabled: function (src, kind, channel, noLog) {
      return this.get(kind) ? this.play.apply(this, arguments) : null
    },

    // Returns absolute URL for an audio `'file.
    //> file string `- URL or name in databank
    //= null if no databank or missing file`, str
    url: function (file) {
      if (file && !/[.\/]/.test(file)) {
        if (this.get('ui')) {
          var bank = this.get('ui').rules.audio
          var path = this.cx.databankURL()
        } else {
          var bank = this.get('audio')
          var path = bank && bank['']
        }
        file = file.toUpperCase()   // databank.php normalizes keys in audio.json
        if (bank && _.has(bank, file)) {
          file = path + bank[file]
        } else {
          file = null
        }
      }
      return file
    },

    // Fades out or pauses `'channel, if it exists.
    //= null if `'channel doesn't exist`, Channel that was paused
    pause: function (channel) {
      if (channel = this.nested(channel)) {
        channel.get('fade') ? channel.set('url', '') : channel.pause()
        return channel
      }
    },
  })

  // Wrapper around browser's `[<audio>`] and possibly WebAudio to play a single audio source.
  //
  // This class can be used on its own separately from Audio.
  Audio.Channel = Common.jQuery.extend('HeroWO.H3.DOM.Audio.Channel', {
    mixIns: [Common.ContextModule],
    el: {tag: 'audio', class: 'Haudio__chan'},
    persistent: true,
    _gain: null,    // GainNode
    _source: null,  // AudioSourceNode
    _sourceURL: null,  // URL being/been decoded
    _sourcePlaying: null,
    _sourcePosition: null,    // [current, started at]

    //> kind `- type of channel for accounting in the parent (`#Audio)
    //> loop boolean `- whether to repeat the playback after it reaches the end
    //> url `- URL of the audio source
    //> playing bool `- whether the channel is currently playing audio
    //> volume float `- sound volume (`'0 silent, `'1 full)
    //> fade bool `- enables smooth fade in/out audio transition when `'url changes
    _opt: {
      kind: '',
      buffers: null,    // optionally give to new; don't change
      resume: true,   // only effective if resumePositions is set
      resumePositions: null,   // don't change
      loop: false,    // changing this will restart playback if WebAudio is enabled due to switching between that and <audio>; change it together with url for seamless experience
      url: '',  // changing to '' is same as pause if !fade, else as fade-out; rewinds on change
      playing: false,  // change this to make sound pause/resume; not necessary reflects if the sound is heard, e.g. set if notAllowed or decoding
      notAllowed: false,    // read-only
      volume: 1.0,  // default value from <audio>
      limiter: 1.0,   // multiplier for volume
      fade: false,  // if set, don't use limiter and remember that url may differ from playingURL
      fading: null,     // internal; [since, timer]
      playingURL: '',   // internal; cannot change to ''
      log: true,
    },

    events: {
      change: function (name, now, old) {
        if (this._parent /*not during init*/ && this.get('log') && _.log) {
          switch (name) {
            case 'playing':
              return _.log('Audio %s %s %s', this._cid, now ? '+' : '-',
                           this.get('url').replace(/^.*\//, ''))
            case 'url':
            case 'playingURL':
              if (!old) { return }
            case 'loop':
            case 'notAllowed':
            case 'volume':
            case 'limiter':
            case 'fade':
              return _.log('Audio %s.%s = %.j <- %.j', this._cid, name, now, old)
          }
        }
      },

      change_fade: function (now, old) {
        now || this.set('fading', null)
      },

      change_fading: function (now, old) {
        old && clearTimeout(old[1])
      },

      change_url: function (now) {
        this.get('fade') ? this._fade() :
          now ? this.set('playingURL', now) : this.pause()
      },

      change_playing: function () {
        this.get('fade') && this._fade(_)
      },

      'change_playingURL, change_loop, change_playing, change_volume, change_limiter': 'update',

      '-change_playingURL': function (now, old) {
        var pos = this.get('resume') && this.get('resumePositions') || {}
        if (this._source) {
          pos[old] = this._sourcePosition[0] +
                     (this._sourcePlaying && this.get('buffers').now() - this._sourcePosition[1])
        } else {
          pos[old] = this.el.prop('currentTime')
        }
        // Changing src here, not in _update() because currentTime resets when src changes, and we can't change currentTime in _update() because it's unknown if change_url has occurred.
        //
        // XXX=IC SoD seems to start certain BGM tracks from random position. For example, town themes start from 0 (unless already started in this game) while terrain isn't resumed, as if started from random position every time instead.
        this.el.prop({src: now, currentTime: _.has(pos, now) ? pos[now] : 0})
      },

      '+normalize_volume': function (res, value) {
        return Common.clamp(value, 0.0, 1.0)
      },

      '+normalize_resume': Common.normBool,
      '+normalize_loop': Common.normBool,
      '+normalize_playing': Common.normBool,
      '+normalize_fade': Common.normBool,
      '+normalize_log': Common.normBool,

      '-unnest': function () {
        if (this._parent) {
          this.pause()
          this.set('fade', false)
          this.set('loop', false)

          if (this.get('log')) {
            _.log && _.log('Audio %s -- %s/? : %s', this._cid, this.get('kind'), this.get('url'))
          }
        }
      },

      _update: function () {
        var opt = this.get()
        var buffers = this.get('buffers')
        var volume = opt.volume * opt.limiter

        if (!opt.playingURL) {
          // It might seem logical to also not start if this channel has volume at 0. However, we don't know if this condition is temporary or not, it must be decided on a higher level. If we don't start, we won't fire ended which may break the expected flow to the caller.
          return
        }

        // Playing with <audio> is okay for one-shot tracks (and doesn't involve
        // CORS) but for looped it has an audible gap when it wraps. For this
        // reason have to use WebAudio (it isn't supported by IE so leaving
        // the latter with <audio loop>). <audio> is still useful in modern
        // browsers because it doesn't require preloading the entire file and is in fact recommended for long tracks.
        //
        // The bulk of the solution is described here:
        // https://stackoverflow.com/questions/46926033/create-seamless-loop-of-audio-web
        if (opt.loop && buffers) {
          if (!this._gain && volume != 1) {
            this._gain = buffers.context.createGain()
            this._gain.connect(buffers.context.destination)

            if (this._source) {
              this._source.disconnect()
              this._source.connect(this._gain)
            }
          }

          if (this._sourceURL && this._sourceURL != opt.playingURL) {
            this._release()
          }

          var attach = !this._sourceURL
          this._sourceURL = opt.playingURL

          var buf = buffers.nested(opt.playingURL) || buffers.nest({url: opt.playingURL})
          attach && buf.take()

          if (!buf.get('node')) {
            if (attach) {
              this.autoOff(buf, {change_node: 'update'})
              buf.load()
            }
            // We could start playing the file with the <audio> until we have the SourceNode ready, but we'd need to start playing the SourceNode at the position that the <audio> has played to. We could pass SourceNode.start() the el.currentTime but I suspect this seeking may be audibly inaccurate. Waiting for decoding should be fleeting because looped files are very short¹ and browser should be fetching from cache and insantly decoding them.
            //
            // ¹BGM are long but the delay in decoding the track played for the first time is insignificant.
            return this.el[0].pause()
          }

          if (!this._source) {
            this._source = buffers.context.createBufferSource()
            this._source.buffer = buf.get('node')
            this._source.connect(this._gain || buffers.context.destination)
            // "You can only call this function once during the lifetime of an AudioBufferSourceNode."
            this._source.start(0, this.el.prop('currentTime'))
            this._sourcePlaying = null
            this._sourcePosition = [this.el.prop('currentTime'), buffers.now()]
          }
        } else if (this._sourceURL) {
          this._release()   // loop disabled, switch to <audio>
        }

        this.el[0].volume = volume
        this._gain && this._gain.gain.setValueAtTime(volume, 0)

        this.el.prop('loop', opt.loop)
        this._source && (this._source.loop = opt.loop)

        var promise = this.el[0][opt.playing && !this._source ? 'play' : 'pause']()
        if (promise) {    // not returned by IE
          this.set('notAllowed', false)
          promise.catch(function (e) {
            if (e.name == 'NotAllowedError') {
              this.set('notAllowed', true)
            } else if (e.name != 'AbortError') {    // happens on normal usage
              throw e
            }
          }.bind(this))
        }

        if (this._source) {
          // There's no pause method so have to emulate it by setting playback rate to 0.
          //
          // Here and elsewhere we could be checking playbackRate.value directly. However, it isn't guaranteed (and in fact doesn't) get updated immediately after setValueAtTime(), even if the latter is given 0 as startTime. Test: make several consecutive set('playing') calls from true to false and back and observe the sound sometimes continuing playing after playing was set to false.
          if (this._sourcePlaying != opt.playing) {
            this._sourcePlaying = opt.playing
            this._source.playbackRate.setValueAtTime(+opt.playing, 0)
            if (opt.playing) {
              this._sourcePosition[1] = buffers.now()
            } else {
              this._sourcePosition[0] += buffers.now() - this._sourcePosition[1]
            }
          }
        }
      },
    },

    elEvents: {
      ended: 'ended',
    },

    // Destroys WebAudio objects, if created.
    _release: function () {
      this.get('buffers').nested(this._sourceURL).release()
      if (this._source) {
        this._source.stop()
        this._source.disconnect()
      }
      this._sourceURL = this._source = null
    },

    // Called when the playback ends (DOM `'onended). Not called if `'this is removed before that happens, or if `'loop'ing.
    ended: function () {
      this.pause()
    },

    // Immediately stops playing sound regardless of `'fade. Use `@Audio.pause()`@ to respect `'fade, or set `'url to `[''`].
    pause: function () {
      return this.set('playing', false)
    },

    _fade: function (onlySchedule) {
      var delay = 20
      var step = delay / (this.cx.get('classic') ? 1500 /*ms*/ : 500)
      var nextURL = this.get('url')

      // If playingURL is '' (first time playing), do a fade-in from 0. If it
      // isn't and url is '' then fade-out to 0. If neither is '', do fade-in
      // then fade-out.
      if (this.get('playingURL')) {
        var out = nextURL != this.get('playingURL')
      } else {
        this.assignResp({playingURL: nextURL, limiter: 0})
      }

      if (onlySchedule != _) {
        this.getSet('fading', function (start) {
          this.getSet('limiter', function (lim) {
            var sign = out ? -1 : +1
            lim += sign * step * (start ? (Date.now() - start[0]) / delay : 1)
            return Common.clamp(lim, 0, 1)
          })
        })
      }

      if (this.get('playing')) {
        // Preload while fading.
        var buffers = this.get('buffers')
        if (out && this.get('loop') && buffers && !buffers.nested(nextURL)) {
          var buf = buffers.nest({url: nextURL})
          buf.take()
          // Release after change_node of _update().
          buf.once('1^change_node', 'release')
          buf.load()
        }

        // If volume is already lower than the reduction step, reduce the delay.
        var lim = this.get('limiter')
        var time = Math.min(delay, delay * ((out ? lim : 1 - lim) / step))
        if (time < 10) { time = 0 }

        if (time) {
          // BSTS. H&H. BTB.
        } else if (!out) {
          this.set('limiter', 1)
        } else if (nextURL) {
          this.set('playingURL', nextURL)
          time = delay
        } else {
           this.assignResp({limiter: 0, playing: false})
        }

        if (time) {
          this.set('fading', [Date.now(), setTimeout(this._fade.bind(this), time)])
        }
      }
    },
  })

  // MRU-based collection of WebAudio object wrappers with `#TakeRelease support, such as of `#Buffer-s.
  //
  // Constructor will fail if WebAudio is unavailable.
  Audio.Nodes = Common.Sqimitive.extend('HeroWO.H3.DOM.Audio.Nodes', {
    _childClass: 'Buffer',
    _childEvents: ['=released'],
    context: null,

    //> max int `- how many recent but currently unused (released) objects to keep alive
    _opt: {
      max: 100,
    },

    events: {
      init: function () {
        this.context = new (AudioContext || webkitAudioContext)
      },

      '=_defaultKey': function (sup, child) {
        return child.get('url')
      },

      '.=released': function (child) {
        child.set('timeReleased', Date.now())

        if (this.length > this.get('max')) {
          var children = this.reject(Common.p('_references'))
          children = _.sortBy(children, Common.p('get', 'timeReleased'))
          _.invoke(children.slice(0, this.length - this.get('max') * 0.9), 'remove')
        }
      },

      unnest: function () {
        if (this._parent) {
          this.invoke('remove')
          this.context.close()
        }
      },
    },

    // Returns current WebAudio `'AudioContext timestamp (float).
    now: function () {
      return this.context.currentTime
    },
  })

  // Represents a particular WebAudio `'AudioBuffer, with asynchronous AJAX fetching and decoding.
  Audio.Nodes.Buffer = Common.Sqimitive.extend('HeroWO.H3.DOM.Audio.Nodes.Buffer', {
    mixIns: [ObjectStore.TakeRelease],

    _opt: {
      timeReleased: 0,
      url: '',    // do not change after load()
      xhr: null,  // internal
      node: null, // AudioBuffer; do not change
    },

    events: {
      change_xhr: function (now, old) {
        old && old.abort()
      },

      '-unnest': function () {
        if (this._parent) {
          this.set('xhr', null)
          this.set('node', null)
          _.log && _.log('Audio -- buffer : %s', this._parentKey)
        }
      },
    },

    // Starts fetching and decoding of the `'url audio source.
    load: function () {
      this.getSet('xhr', function (cur) {
        if (!cur) {
          _.log && _.log('Audio ++ buffer : %s : %s', this._parentKey, this.get('url'))

          cur = _.ajax({
            url: this.get('url'),
            dataType: 'arraybuffer',
            headers: {},
            success: function (xhr) {
              // No need to decode if this Buffer child was deleted while it was
              // fetching the file.
              this._parent && this._decode(xhr)
            },
            error: function (xhr, e) {
              xhr == this.get('xhr') && this.error(e)
            },
            context: this,
          })
        }

        return cur
      })
    },

    _decode: function (xhr) {
      _.log && _.log('Audio buffer decoding : %s', this._parentKey)

      this._parent.context.decodeAudioData(
        xhr.response,
        function (buf) {
          _.log && _.log('Audio buffer ready : %s', this._parentKey)
          this.set('node', buf)
        }.bind(this),
        Common.ef('error', this)
      )

      this.set('xhr', null)   // free memory
    },

    // Called if loading or decoding has failed irreversibly.
    error: function (e) {
      // e.err is seen on MDN, no idea if it exists in reality:
      // https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData#sect1
      console && console.warn(_.format('Audio buffer error : %s : %s', this._parentKey, e && (e.message || e.err)))
    },
  })

  return Audio
})