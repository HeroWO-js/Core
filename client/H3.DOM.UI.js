define([
  'DOM.Common', 'Calculator', 'Effects', 'DOM.Slider', 'DOM.Bits',
  'H3.DOM.Bits', 'H3.DOM.Combat', 'H3.Rules'
], function (
  Common, Calculator, Effects, Slider, Bits,
  H3Bits, H3Combat, Rules
) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  var edgeSize = 288 // from CSS

  // DOM.Slider _opt'ions commonly used in adventure map, town and other UI.
  var commonTownSlider = {
    horizontal:     true,
    trackJump:      true,
    thumbClass:     'Hh3-def_frame_IGPCRDIV-0-4',
    upClass:        'Hh3-def_frame_IGPCRDIV-0-0',
    downClass:      'Hh3-def_frame_IGPCRDIV-0-2',
    disabledClass:  'Hh3-slider__dis',
  }

  // Most fullScreen Window-s have standard status bar with current date and player's resources.
  function addCommonStatusBarModules(parent, prefix, bar) {
    var cont = $('<div>')
      .addClass(prefix + 'stbar ' + (bar || ''))
      .appendTo(parent.el)

    parent.addModule('date', Bits.GameDate, {
      attachPath: cont,
      elClass: prefix + 'stbar__date Hh3-menu__text3',
      format: parent.cx.s('map', 'Month: %month, Week: %week, Day: %day'),
    })
      // Don't leave the container <div> orphant if status bar is deleted, as in Townscape.
      .once('unnest', 'remove', cont)

    parent.addModule('ress', Bits.ResourceNumbers, {
      attachPath: cont,
      elClass: prefix + 'stbar__ress Hh3-menu__text3',
      sink: {'*': {elClass: prefix + 'stbar__res ' + prefix + 'stbar__res_r_*'}},
    })
  }

  // Root of HoMM 3 user interface drawing backend that utilizes browser's DOM nodes.
  //
  // This module builds on top of `@DOM.UI`@ so both must be present together.
  //
  // Responsible for most of everything on screen except for combat. Shows global messages (e.g. when date changes or somebody loses). Creates combat windows when a combat commences with a player's party.
  var UI = Bits.Base.extend('HeroWO.H3.DOM.UI', {
    _removeEl: false,   // el = sc.el
    windows: null,
    _wonMessages: [],
    _lastInteractiveDate: null,

    _opt: {
      haveStyles: false,
    },

    events: {
      init: function () {
        // Using H3.DOM.UI is exclusive on a Screen, can't combine with other UI types.
        this.el = this.sc.el
        this.el.addClass('Hh3-sc')
        this.sc.modules.nested('HeroWO.DOM.UI').el.addClass('Hh3-root')
      },

      owned: function () {
        // Have to set up AdventureMap before attach to ensure no transitions are lost. See the comment in Screen.init.
        this.windows = this.addModule(H3Bits.Windows)

        // Screen's hideAM is a debug option that considerably speeds up page
        // loading if you don't need ADVMAP (for example, when working on a
        // combat or town screen).
        if (this.sc.get('hideAM')) {
          this.sc.modules.nested('HeroWO.DOM.UI').el.hide()
        } else {
          this.windows.addModule('map', UI.AdventureMap, {
            ui: this,
            dom: this.sc.modules.nested('HeroWO.DOM.UI'),
          })
        }
      },

      attach: function () {
        this.get('haveStyles') || $('<link>')
          .attr({
            rel: 'stylesheet',
            href: this.cx.url('HeroWO.H3.Databank', this.map.get('databank') + '/', 'combined.css'),
          })
          .appendTo(this.el)

        function update() {
          this.windows.set('shade', !this.cx.get('classic'))
          this.windows.set('shadeCloses', !this.cx.get('classic'))
        }
        this.autoOff(this.cx, {change_classic: update})
        update.call(this)

        this.autoOff(this.pl, {
          change_interactive: this._showTurnMessage,
          change_homeless: homelessMessage,
        })

        homelessMessage.call(this, this.pl.get('homeless'))

        function homelessMessage(now) {
          switch (now) {
            case false:
              return
            case 0:
              // GENRLTXT.TXT[7]
              var msg = _.format(this.cx.s('map', '%s, you have lost your last town.  If you do not conquer another town in the next week, you will be eliminated.'), this.rules.databank.players.atCoords(this.pl.get('player'), 0, 0, 'name', 0))
              break
            case 6:
              // ARRAYTXT.TXT[129]
              var msg = _.format(this.cx.s('map', '%s, this is your last day to capture a town or you will be banished from this land.'), this.rules.databank.players.atCoords(this.pl.get('player'), 0, 0, 'name', 0))
              break
            case 7:   // XXX=RH 7
              // GENRLTXT.TXT[8]
              var msg = _.format(this.cx.s('map', !this.cx.get('classic') ? '%s, your heroes abandon you, and you are banished from this land.' : "%s's heroes have abandoned him, and he is banished from this land."), this.rules.databank.players.atCoords(this.pl.get('player'), 0, 0, 'name', 0))
              break
            default:
              // ARRAYTXT.TXT[128]
              var msg = _.format(this.cx.s('map', '%s, you only have %d days left to capture a town or you will be banished from this land.'), this.rules.databank.players.atCoords(this.pl.get('player'), 0, 0, 'name', 0), 7 - now)   // XXX=RH
              break
          }

          var box = this.windows.addModule(H3Bits.MessageBox, {withinWindow: this.windows.nested('map')})
            .addText(msg)
          this._messageFlag(box, this.pl)
          box.addButton()
        }

        function lossMessage() {
          var players = new Set
          this._wonMessages.splice(0).forEach(function (pl, i) {
            // Before game finishes, show only messages about lost players.
            if (i && pl.get('player') && (pl.get('won') === 0 || pl.get('won') === 2)) {
              players.add(pl)
            }
          })
          players.forEach(this._wonMessage, this)
        }

        this.autoOff(this.map.players, {
          '.change': function (pl, name) {
            if (name == 'won') {
              // Deferring because won might be updated again if player has fulfilled both victory and loss conditions.
              this._wonMessages.length || this._wonMessages.push(_.defer(lossMessage.bind(this)))
              this._wonMessages.push(pl)
            }
          },
        })

        var finished = function () {
          Common.oneClass(this.el, 'Hh3-sc_finished_', 'yes')
          this.addModule(UI.Bits.WinnersAndLosers)
        }.bind(this)

        this.map.get('finished') ? finished()
          : this.el.addClass('Hh3-sc_finished_no')

        this.autoOff(this.map, {
          change_finished: function () {
            finished()

            this.map.players.each(function (pl) {
              if (pl.get('player') && pl.get('won') === 1) {
                // Don't show messages for players who won only thanks to their ally winning.
                var found = this.map.victory.some(function (v) {
                  return _.includes(v.get('achieved') || [], pl.get('player'))
                })
                found && this._wonMessage(pl)
              }
            }, this)
          },
          change_bonus: function (now) {
            // SoD doesn't give any bonus on the first game day. We give 'growth' to initialize creature counts but don't show any message.
            if (this.map.get('date')) {
              now = now.split(',')
              var date = this.map.date()
              // ARRAYTXT.TXT, various
              var box = this.windows.addModule(H3Bits.MessageBox, {withinWindow: this.windows.nested('map')})
              box.addText(this.cx.s('map', 'Astrologers proclaim %s of the %s.'), date.day != 1 ? 'day' : date.week == 1 ? 'month' : 'week', now[1])
              switch (+now[0]) {
                case this.map.constants.map.bonus.horde:
                  for (var i = 2; i < now.length; i += 2) {
                    var name = this.rules.creatures.atCoords(now[i], 0, 0, 'nameSingular', 0)
                    if (now[i + 1] == '2.0') {
                      box.addText(this.cx.s('map', '%s population doubles!'), name)
                    } else if (_.includes(now[i + 1], '.')) {
                      box.addText(this.cx.s('map', '%s growth %d%%.'), name, now[i + 1] * 100)
                    } else {
                      box.addText(this.cx.s('map', '%s growth %+d.'), name, now[i + 1])
                    }
                  }
                case this.map.constants.map.bonus.growth:
                  // XXX=IC ARRAYTXT.TXT has a message where there are 2 entries for "growth" and the last line says "...increase IN population." (can be seen after building Grail in Inferno)
                  box.addText(this.cx.s('map', 'All dwellings increase population.'))
                  break
                case this.map.constants.map.bonus.plague:
                  if (now[2] == '0.5') {
                    box.addText(this.cx.s('map', 'All populations are halved.'))
                  } else {
                    box.addText(this.cx.s('map', 'All populations deminish by %d%%.'), 100 - now[2] * 100)
                  }
              }
              box.addButton()
            }
          },
        })

        this.el.addClass('Hrecolor_' + _.indexOf(this.rules.playersID, this.sc.get('player')))

        var currentCombat

        // XXX=I upon monster encounter, replace its image with AVWATTAK.DEF until the combat ends (or possibly replace the image during any active $pending on the monster's AObject)
        var openCombat = function () {
          // It's generally okay to render DOM.Combat while loading but it's not ready for that: order of DOM nodes will be different depending if module (attach/render) is deferred or not. Test: disable (_.debug) async IdleTasks and make an AI to attack human on its first turn; this will cause immediate combat (openCombat() called from the end of this class' attach()).
          if (!currentCombat && !this.cx.get('loading') &&
              !this.sc.transitions.length /*wait for mapMove, etc.*/) {
            var com = this.map.combats.find(function (com) {
              return com.get('state') == 'init' &&
                com.parties.some(function (party) {
                  return party.player == this.pl
                }, this)
            }, this)

            if (com) {
              // If some parties' players are busy and don't start combat immediately, other players can minimize Combat until state changes from init as there's no reason to require them stare into the boring UI.
              var init = com.get('state') == 'init'
              currentCombat = this.windows.addModule(H3Combat, {combat: com, withinWindow: this.windows.nested('map')})
              if (init) {
                currentCombat.set('canClose', 'hide')
                currentCombat.autoOff(com, {
                  change_state: function () {
                    if (currentCombat.get('collapsed')) {
                      // The combat window appears abruptly so ignore user interaction for a second to let him realize the combat's up.
                      currentCombat.el.css('pointer-events', 'none')
                      this.windows.el.addClass('Hh3-cm_cursor_wait')
                      var timer = setTimeout(function () {
                        currentCombat.el.css('pointer-events', '')
                        this.windows.el.removeClass('Hh3-cm_cursor_wait')
                      }.bind(this), 10000)
                      currentCombat.on('-unnest', function () { clearTimeout(timer) })
                    }
                    currentCombat.assignResp({canClose: false, collapsed: false})
                  },
                }, this)
                currentCombat.whenRenders(['render'], function () {
                  this.sc.rpc.do('combat', {
                    do: 'ready',
                    combat: com._parentKey,
                  })
                })
              }
              this.autoOff(currentCombat, {
                // Because of "-", old currentCombat briefly remains on screen if there is another comat awaiting (seen by openCombat() called by -unnest). Troublous? I don't think so.
                '-unnest': function () {
                  currentCombat = null
                  if (!openCombat() && !com.get('state')) {
                    // Combat may be caused by two events: GenericEncounter and hero vs hero/town. Sound is played after closing the combat window and if there is no other pending combat (no new window has opened). Play KILLFADE if was fighting hero vs hero/town and the fight ended after any party was defeated (the only possibility in SoD). If was running a GE fight, play quest_removeAudio (the sound is played by a later hook if encounter that didn't initiate a fight ends).
                    var sound = com.get('uiAudio')
                    var audio = this.sc.get('audio')
                    sound && audio && audio.playIfEnabled(sound, 'sfx', '')
                  }
                }
              })
              return true
            }
          }
        }.bind(this)

        this.autoOff(this.cx, {
          'change_loading': openCombat,
        })

        this.autoOff(this.map.combats, {
          // combat.parties are empty on nesting so waiting for state to become at least 'init' before deciding if it's meant for us.
          '.change_state': openCombat,
        })

        this.autoOff(this.sc.transitions, {
          unnested: openCombat,
          '+select_encounterRemove': function (res, tr) {
            return this.pl.heroes.nested(tr.get('hero')) && '!map'
          },
          nest_encounterRemove: function (view) {
            this.autoOff(view, {
              tick: function (async) {
                var sound = view.get('audio')
                if (!sound) {
                  // No game, no life.
                } else if (!currentCombat) {  // encounter didn't ensue a fight
                  var audio = this.sc.get('audio')
                  var chan = audio && audio.playIfEnabled(sound, 'sfx', '')
                  if (chan) {
                    chan.on('ended', async.nestDoner())
                    view.release(chan)
                  }
                } else if (currentCombat.combat.get('encounter') == view.get('bonus')) {
                  // Checking encounter, not combat._parentKey as the latter is already null by this time.
                  currentCombat.combat.set('uiAudio', sound)
                }
              },
            })
          },
          nest_combatEnd: function (view) {
            var combat = this.map.combats.nested(view.get('combat'))
            if (!combat.get('encounter')) {   // hero vs hero/town
              this.autoOff(view, {
                collect: function (tr, tick) {
                  if (tick == 1) {
                    // XXX=IC SoD plays this sound N times where N = number of defeated parties (max 2 in SoD).
                    view.get('alive').length < combat.parties.length && combat.set('uiAudio', 'KILLFADE')
                    // If currently selected hero or town was defeated, select another one of that type, or of other type if none available.
                    var cur = this.sc.get('current')
                    if (cur) {
                      var party = combat.parties.find(function (p) { return p.object == cur })
                      if (party && !_.includes(view.get('alive'), party._parentKey)) {
                        var type    =  cur.isHero ? 'heroes' : 'towns'
                        var another = !cur.isHero ? 'heroes' : 'towns'
                        cur = this.windows.nested('map').nested(type)
                          .find(function (c) { return c.get('object') != cur })
                          // XXX=IC SoD seems to select 2nd (random?) town if had a single hero that was selected and now is gone
                          || this.windows.nested('map').nested(another).first()
                        this.sc.set('current', cur && cur.get('object'))
                        // XXX=C do we need to scroll immediately or wait (like until uiAudio ends?)?
                        cur && this.sc.scrollTo(cur.get('object').get('id'))
                      }
                    }
                  }
                },
              })
            }
            // else - handled by encounterRemove.
          },
        })

        openCombat()
      },

      render: function () {
        this._showTurnMessage(this.pl.get('interactive'))
      },

      '-unnest': function () {
        if (this._parent) {
          clearTimeout(this._wonMessages.splice(0)[0])
        }
      },
    },

    _showTurnMessage: function (now) {
      // interactive may change to true multiple times since in non-classic mode user is allowed to resume (become interactive again during the same round) if other players haven't yet finished.
      if (now && this._lastInteractiveDate != this.map.get('date') &&
          this.map.players.some(function (pl) { return pl.isHuman() && pl != this.pl }, this)) {
        this._lastInteractiveDate = this.map.get('date')
        var box = this.windows.addModule(H3Bits.MessageBox, {withinWindow: this.windows.nested('map')})
          .addText(this.cx.s('map', '%s\'s turn.'), this.rules.databank.players.atCoords(this.pl.get('player'), 0, 0, 'name', 0))
        this._messageFlag(box, this.pl)
        box.addButton()
      }
    },

    // Move currently selected hero along the provisional travel route (possible if Show Move Path is enabled),
    followRoute: function (dest) {
      var hero = this.sc.get('current')
      if (hero && hero.isHero) {
        if (!dest) {
          var sub = this.map.objects.readSubAtCoords(hero.get('id'), 0, 0, 'route', 0)
          var schema = sub.schema()
          sub.find(0, function ($1, $2, $3, $4, $5, n) {
            dest = [
              this.atContiguous(n + schema.x, 0),
              this.atContiguous(n + schema.y, 0),
            ]
          })
        }
        if (dest) {
          this.sc.rpc.do('buildRoute', {
            hero: hero.get('id'),
            destination: dest.concat(hero.get('z')),
          })
            .whenSuccess(function (async) {
              this.sc.rpc.do('moveHero', {
                hero: hero.get('id'),
                path: async.result.path,
              })
            }, this)
            .whenError(function () {
              // Unreachable, do nothing, keep existing route.
            })
        }
      }
    },

    // Shows the town's overview screen. Suitable for calling when the game has ended or player isn't interactive.
    showTownscape: function (town) {
      if (this.pl.get('interactive')) {
        this.sc.rpc.do('townscape', {
          town: town.get('id'),
        })
      } else {    // waiting for round or game finished
        this.windows.addModule(UI.Townscape, {
          ui: this,
          town: town,
        })
      }
    },

    showTownHire: function (town, building, withinWindow) {
      var calc = this.cx.listeningEffectCalculator({
        class: Calculator.Effect.GenericIntArray,
        update: 'defer',
        target: this.map.constants.effect.target.hireAvailable,
        ifBonusObject: town.get('id'),
        ifBuilding: building,
      })
      if (!calc.get('value').length) {
        calc.takeRelease()
        return
      }

      return this.windows.addModule(UI.HireCreature.Building, {
        withinWindow: withinWindow,
        town: town,
        building: building,
        calc: calc,
      })
    },

    showCreatureInfo: function (options) {
      return this.windows.addModule(UI.CreatureInfo, options)
    },

    _wonMessage: function (pl) {
      // Strings here are from GENRLTXT.TXT. Found and used the following:
      //
      // ---
      //
      // Congratulations! You have found the %s, and can claim victory!
      // %s found the %s, and can claim victory!
      // The enemy has found the %s, and can claim victory!
      //
      // Congratulations! You have reached your destination, precious cargo intact, and can claim victory!
      // Congratulations! %s has delivered the precious cargo intact. Your team claims victory!
      // %s has delivered the precious cargo intact, and can claim victory!
      // %s have delivered the precious cargo intact. Victory is theirs!
      // The enemy has delivered the precious cargo intact and claims victory!
      //
      // Congratulations! You have over %d %s in your armies. Your enemies have no choice but to bow down before your power!
      // %s has over %d %s, and can claim victory!
      // %s have over %d %s. Victory is theirs!
      // %s has over %d %s. You have no choice but to admit defeat!
      // %s have over %d %s. You have no choice but to admit defeat!
      // The enemy has gathered over %d %s. You have no choice but to admit defeat!
      //
      // Congratulations! You have collected over %d %s in your treasury. Victory is yours!
      // The enemy has collected over %d %s. Victory is theirs!
      //
      // Congratulations! You have constructed a permanent home for the Grail, and can claim victory!
      // %s has constructed a permanent home for the Grail, and claims victory!
      // %s have constructed a permanent home for the Grail. Victory is theirs!
      // The enemy has constructed a permanent home for the Grail, and claims victory!
      //
      // Congratulations! You have successfully upgraded your town, and can claim victory!
      // %s's town is successfully upgraded, and claims victory!
      // %s have successfully upgraded their town. Victory is theirs!
      // By upgrading their town, the enemy has claimed victory!
      //
      // Congratulations! You have completed your quest to kill the fearsome beast, and can claim victory!
      // %s has beaten you to your quest to kill a fearsome beast, and claims victory!
      // %s have beaten you to your quest to kill a fearsome beast. Victory is theirs!
      // The enemy has beaten you to your quest to kill the fearsome beast, and claims victory!
      //
      // Congratulations! You have completed your quest to defeat the enemy hero %s. Victory is yours!
      //
      // The enemy has captured %s, and claims victory!
      //
      // Congratulations! All your enemies have been defeated! Victory is yours!
      //
      // Congratulations! Your flag flies on the dwelling of every creature. Victory is yours!
      // %s's flag flies on the dwelling of every creature. Victory is theirs!
      // The enemy's flag flies on the dwelling of every creature. Victory is theirs!
      //
      // Congratulations! Your flag flies on every mine. Victory is yours!
      // %s's flag flies on every mine. Victory is theirs!
      // The enemy's flag flies on every mine. Victory is theirs!
      //
      // The hero, %s, has suffered defeat - your quest is over!
      // %s has lost the hero %s. Your quest is over.
      //
      // The town of %s has fallen - all is lost!
      //
      // %s, your heroes abandon you, and you are banished from this land.
      // %s's heroes have abandoned him, and he is banished from this land.
      //
      // Alas, time has run out on your quest. All is lost.
      // %s has failed to complete their quest in time. They have lost.
      //
      // All your forces have been defeated, and you are banished from this land!
      // You have been eliminated from the game!
      // %s has been vanquished!

      // XXX=C ensure message text and display of player flag shown in different cases by HeroWO and SoD match

      var won = pl.get('won')
      var me = pl == this.pl
      var name = this.rules.databank.players.atCoords(pl.get('player'), 0, 0, 'name', 0)
      var flag = !me && !this.cx.get('classic')
      var msg = []

      function achieved(v) {
        return _.includes(v.get('achieved') || [], pl.get('player'))
      }
      var win = this.map.victory.filter(achieved)
      var loss = this.map.loss.filter(achieved)

      if (!win.length && !loss.length) {
        // Don't show any message if no specific condition was fulfilled (won thanks to allies, lost due to another winning).
        return
      }

      win.length && won === 1 && me && msg.push('Congratulations!')

      win.forEach(function (cond) {
        switch (cond.get('type')) {
          case this.map.constants.mapVictory.type.ownArtifact:
            if (cond.get('object')) {
              msg.push(me ? 'You have reached your destination, precious cargo intact, and can claim victory!'
                : _.format('%s has delivered the precious cargo intact, and can claim victory!', name))
            } else {
              var art = this.rules.artifacts.atCoords(cond.get('artifact'), 0, 0, 'name', 0)
              msg.push(me ? _.format('You have found the %s, and can claim victory!', art)
                : _.format('%s found the %s, and can claim victory!', name, art))
            }
            break

          case this.map.constants.mapVictory.type.ownCreatures:
            var cr = this.rules.creatures.atCoords(cond.get('unit'), 0, 0, cond.get('unitCount') == 1 ? 'nameSingular' : 'namePlural', 0)
            msg.push(me ? _.format('You have over %d %s in your armies. Your enemies have no choice but to bow down before your power!', cond.get('unitCount'), cr)
              : _.format('%s has gathered over %d %s, and can claim victory!', name, cond.get('unitCount'), cr))
            break

          case this.map.constants.mapVictory.type.ownResources:
            var res = _.indexOf(this.rules.constants.resources, cond.get('resource'))
            msg.push(me ? _.format('You have collected over %d %s in your treasury. Victory is yours!', cond.get('resourceCount'), res)
              : _.format('%s has collected over %d %s, and can claim victory!', name, cond.get('resourceCount'), res))
            break

          case this.map.constants.mapVictory.type.ownTown:
            if (cond.get('townGrail')) {
              msg.push(me ? 'You have constructed a permanent home for the Grail, and can claim victory!'
                : _.format('%s has constructed a permanent home for the Grail, and claims victory!', name))
            } else {
              msg.push(me ? 'You have successfully upgraded your town, and can claim victory!'
                : _.format("%s's town is successfully upgraded, and he claims victory!", name))
            }
            break

          case this.map.constants.mapVictory.type.defeat:
            switch (cond.get('objectType')) {
              case this.map.constants.object.type.monster:
                msg.push(me ? 'You have completed your quest to kill the fearsome beast, and can claim victory!'
                  : _.format('%s has beaten you to your quest to kill a fearsome beast, and claims victory!', name))
                break
              case this.map.constants.object.type.hero:
                // XXX=IC: wmn: SoD message includes the hero's/town's name but it may be removed by now and we can't calculate it
                msg.push(me ? 'You have completed your quest to defeat the enemy hero. Victory is yours!'
                  : _.format('%s has beaten you to your quest to defeat the enemy hero, and claims victory!', name))
                break
              case this.map.constants.object.type.town:
                // XXX=IC:wmn:
                msg.push(me ? 'You have captured the designated town, and claim victory!'
                  : _.format('%s has captured the designated town, and claims victory!', name))
                break
              default:
                msg.push(me ? 'All your enemies have been defeated! Victory is yours!'
                  : _.format('All enemies of %s have been defeated! Victory is theirs!', name))
            }
            break

          case this.map.constants.mapVictory.type.ownDwelling:
            msg.push(me ? 'Your flag flies on the dwelling of every creature.'
              : _.format("%s's flag flies on the dwelling of every creature.", name))
            break

          case this.map.constants.mapVictory.type.ownMine:
            msg.push(me ? 'Your flag flies on every mine.'
              : _.format("%s's flag flies on every mine.", name))
            break
        }
      }, this)

      won === 2 && msg.push(this.cx.s('map', 'However!..'))    // Oh shi~
      var homeless

      loss.forEach(function (cond) {
        switch (cond.get('type')) {
          case this.map.constants.mapLoss.type.lose:
            switch (cond.get('objectType')) {
              case this.map.constants.object.type.hero:
                // XXX=IC:wmn:
                msg.push(me ? 'The hero under your protection has suffered defeat.'
                  : _.format('%s has lost the hero under their protection.', name))
                break
              case this.map.constants.object.type.town:
                // XXX=IC:wmn:
                msg.push(me ? 'The principal town has fallen.'
                  : _.format('%s has lost the principal town.', name))
                break
              default:
                // XXX=RH 7 hardcoded; to databank?
                if (pl.get('homeless') >= 7) {
                  homeless = true
                  msg.push(_.format(me && !this.cx.get('classic') ? '%s, your heroes abandon you, and you are banished from this land.' : "%s's heroes have abandoned him, and he is banished from this land.", name))
                } else {
                  msg.push(me ? ['All your forces have been defeated, and you are banished from this land!', 'You have been eliminated from the game!'][this.cx.get('classic') ? 1 : _.random(1)] : _.format('%s has been vanquished!', name))
                }
            }
            break

          case this.map.constants.mapLoss.type.days:
            homeless = !me    // this condition is global, only one message is enough
            msg.push(me ? 'Alas, time has run out on your quest.'
              : _.format('%s has failed to complete their quest in time.', name))
            break
        }
      }, this)

      if (!me && pl.get('team') == this.pl.get('team') && won === 1) {
        msg.push('Your team has won!')
      }

      if (!loss.length && won !== 1) {
        msg.push(_.sample(me
          ? ['You have no choice but to admit defeat!', 'All is lost!', 'Your quest is over.']
          : ['They have no choice but to admit defeat!', 'All is lost!', 'Their quest is over.']))
      }

      if (homeless && msg.length == 1) {
        // The same homeless message was already shown by change_homeless.
        return
      }

      // XXX make transition? window will overlap if an event occurs in background, or another player's won changes
      var box = this.windows.addModule(H3Bits.MessageBox, {withinWindow: this.windows.nested('map')})
      _.each(msg, function (s) { box.addText(s) })
      flag && this._messageFlag(box, pl)
      box.addButton()
    },

    _messageFlag: function (box, player) {
      var el = box._inlineBox().appendTo(box.el)  // XXX=RH
      // In single-player mode Context may be still rendering when we show the message. As a result, PlayerFlag's el will be added after we append() player's name so using an intermediate <div> that is added immediately.
      box.addModule(H3Bits.PlayerFlag, {attachPath: $('<div>').appendTo(el), player: player, size: 58})
      el.append(document.createTextNode(this.rules.databank.players.atCoords(player.get('player'), 0, 0, 'name', 0)))
    },
  })

  // Adventure map with decorations (mini-map, right-side panels, status bar, etc.).
  //
  // This is where player moves heroes around the world. Handles most transition types (e.g. level-up).
  UI.AdventureMap = H3Bits.Window.extend('HeroWO.H3.DOM.UI.AdventureMap', {
    el: {class: 'Hh3-am'},
    _domMap: null,
    _lastCursor: null,
    _route: null,

    _opt: {
      fullScreen: true,
      mapEdge: true,
      ui: null,    // do not set
      dom: null,    // do not set
      cursor: null,
    },

    events: {
      init: function () {
        this._domMap = this.sc.modules.nested('HeroWO.DOM.Map')

        // Hide edge drag bars when ADVMAP is hidden (e.g. in Townscape).
        var edge = this.sc.modules.nested('HeroWO.DOM.Map.Edge')
        edge && edge.el.appendTo(this.get('ui').windows.el)
      },

      '-unnest': function () {
        if (this._parent) {
          this.set('cursor', null)
        }
      },

      '=cancel': function () {
        if (this.map.get('finished')) {
          return this.cx.menu(this.sc)
        }
        var box = this.get('ui').windows.addModule(H3Bits.MessageBox)
          .addText(this.cx.s('map', 'Are you sure you want to quit?'))
        var okay = box.addButton('Hh3-btn_id_IOKAY', 'submit')
        box.addButtonThis('Hh3-btn_id_ICANCEL', 'cancel')
          .once('unnest', function () {
            if (box.get('button') == okay) {
              this.cx.menu(this.sc)
            }
          }, this)
      },

      change_visible: function (now) {
        // Not using toggle() as jQuery's show()/hide() may trigger style calculation to obtain the original display value. This would slow down initial loading too much.
        //
        // But on top of that, using visibility rather than display so that map scrolling works while it's concealed (e.g. scrolling done while Townscape is visible must be preserved when Townscape is closed).
        this.get('dom').el.css('visibility', now ? '' : 'hidden')
        this.sc.transitions.mute('map', !now)
      },

      '+normalize_cursor': function (res, now) {
        var num = parseInt(now)
        return now == null || num < 0 ? null : num
      },

      change_cursor: '_updateCursor',

      owned: function () {
        this._route = this.addModule(UI.AdventureMap.Route)
        this._route.fuse('+gridCellAt', 'gridCellAt-..', this)

        this.addModule(UI.AdventureMap.CursorPathFinder)
          .fuse('change_cursor', function (now) {
            this.set('cursor', now)
          }, this)

        // map/pl are set up by -attach. Our Module must be added only when dataReady so we can obtain them here. For why we specifically need owned, see the comment in UI's owned.
        this.map = this.cx.map
        this.pl = this.map.players.nested(this.sc.get('player'))
        // XXX+I there is currently no way to either cancel message on timeout or bring it up again for user to act (think of event log from AoW), which is a problem if user reloads the page (transitions added before the reload will be dropped, not reprocessed); for now, prefixing most channels here with '!' to ensure cleanup actions are always run (even if after some time, such as when user is in a combat) except if user reloads the page
        //
        // XXX+I: trsr: when saving a game, pending transitions are also saved; they must be picked up when loading and either resumed (if possible) or deleted (if can't resume without data lost at the collect step that happened before load); perhaps add a "resume_..." that fulfills the role of select_... and collect_... for such transitions
        var townscapes = {}
        this.autoOff(this.sc.transitions, {
          '+select_encounterMessage, +select_encounterPrompt, +select_encounterChoice': function (res, tr) {
            switch (tr.get('type')) {
              // XXX=I: huic: these require confirmation to close and confirmation is only possible to non-observer because it involves calling an RPC command; ideally observer should see choices the main player is making by means of a system similar to Tracker
              case 'encounterPrompt':
              case 'encounterChoice':
                if (this.sc.rpc.get('observer')) { return }
            }
            return this.pl.get('player') == tr.get('owner') && '!map'
          },
          'nest_encounterMessage, nest_encounterPrompt, nest_encounterChoice': function (view) {
            var cls
            var box
            var buttons
            this.autoOff(view, {
              collect: function () {
                cls = this.map.objects.atCoords(view.get('bonus'), 0, 0, 'class', 0)
                box = this.get('ui').windows.addModule(H3Bits.MessageBox, {collapsed: true})
                view.release(box)
                if (view.get('type') == 'encounterChoice') {
                  // XXX+R defining strings in code isn't ideal but quest_choices messages can't be part of effects since they often need custom MessageBox set up
                  var choices = view.get('choices')
                  if (_.includes(this.rules.objectsID.arena, cls)) {
                    // ADVEVENT.TXT[0]
                    box.addFromMarkup(this.cx.s('map', '`{Audio NOMAD`}You enter the arena and face a pack of vicious lions.  You handily defeat them, to the wild cheers of the crowd.  Impressed by your skill, the aged trainer of gladiators agrees to train you in a skill of your choice.'))
                    buttons = 'sel'
                  } else if (_.includes(this.rules.objectsID.borderGuard, cls)) {
                    // ADVEVENT.TXT[17]
                    box.addFromMarkup(this.cx.s('map', '`{Audio CAVEHEAD`}As you reign in your horse, a guard steps up to you, "Welcome.  I have received word of your arrival.  Do you wish to pass at this time?"'))
                    buttons = true
                  } else if (_.includes(this.rules.objectsID.warMachineFactory, cls)) {
                    // ADVEVENT.TXT[157]
                    box.addFromMarkup(this.cx.s('map', '`{Audio STORE`}`## War Machine Factory\n\nWould you like to purchase War Machines?'))
                    buttons = true
                  } else if (_.includes(this.rules.objectsID.cartographer, cls)) {
                    var messages = {
                      // ADVEVENT.TXT[25]
                      cartW: '`{Audio LIGHTHOUSE`}You find an old fisherman who has the most detailed maps of the seas that you have ever seen.  Would you like to purchase a set of maps for `{Checks`}?',
                      // ADVEVENT.TXT[26]
                      cartT: '`{Audio LIGHTHOUSE`}You find a cartographer who sells maps of the land for `{Checks`}.  Would you like to buy a map?',
                      // ADVEVENT.TXT[27]
                      cartU: '`{Audio LIGHTHOUSE`}You discover an old dwarven miner who has kept several sets of maps from his working days.  He is willing to sell you a map of the tunnels for `{Checks`}.  Do you agree?'
                    }
                    box.addFromMarkup(this.cx.s('map', messages[choices[0]]), view.get())
                    buttons = true
                  } else if (_.includes(this.rules.objectsID.schoolOfMagic, cls)) {
                    // ADVEVENT.TXT[71]
                    var msg = '`{Audio FAERIE`}`## School of Magic\n\nThe tingle of magic fills the air of this school of mystical arts.  An acolyte offers to sign you up for the next class for `{Checks`}.  You will have your choice of increasing your knowledge, or learning to better focus your powers.'
                    box.addFromMarkup(this.cx.s('map', msg), view.get())
                    buttons = 'sel'
                  } else if (_.includes(this.rules.objectsID.treasureChest, cls)) {
                    // ADVEVENT.TXT[146]
                    var msg = '`{Audio CHEST`}`## Chest\n\nAfter scouring the area, you fall upon a hidden treasure cache.  You may take the gold or distribute it to the peasants for experience.  Which do you choose?'
                    box.addFromMarkup(this.cx.s('map', msg))
                    buttons = 'sel'
                  } else if (_.includes(this.rules.objectsID.treeOfKnowledge, cls)) {
                    // ADVEVENT.TXT[149]
                    var msg = '`{Audio GAZEBO`}`## Tree of Knowledge\n\nUpon your approach, the tree opens its eyes in delight.  "Ahh, an adventurer! I will be happy to teach you a little of what I have learned over the ages for a mere `{Checks`}."  (Just bury it around my roots.)\n\n`< `{StatImage experience`} +1 Level `>'
                    box.addFromMarkup(this.cx.s('map', msg), view.get())
                    buttons = true
                  } else if (_.includes(this.rules.objectsID.schoolOfWar, cls)) {
                    // ADVEVENT.TXT[158]
                    var msg = '`{Audio MILITARY`}`## School of War\n\nThe battle-scarred instructor of this school of war grunts as you walk past.  For a fee of `{Checks`} he can teach you your choice of new attack or defense skills.'
                    box.addFromMarkup(this.cx.s('map', msg), view.get())
                    buttons = 'sel'
                  } else if (_.includes(this.rules.objectsID.questGuard, cls) || _.includes(this.rules.objectsID.seerHut, cls)) {
                    var msg = this.map.objects.atCoords(view.get('bonus'), 0, 0, 'completion', 0)
                    box.addFromMarkup(this.cx.s('map', msg), view.get())
                    buttons = true
                  } else {
                    _.each(choices, Common.p(box.addText, box))
                    buttons = true
                  }
                } else {
                  box.addFromMarkup(this.cx.s('map', view.get('message') || view.get('prompt')), view.get())
                }
              },
              tick: function (async) {
                async = async.nest({owning: false})
                // SoD shows town encounter messages on the town's screen, not ADVMAP.
                var win = townscapes[view.get('townscapeTransition')] || this
                this.get('ui').windows.nest(box, {withinWindow: win})
                switch (view.get('type')) {
                  case 'encounterMessage':
                    box.addButton()
                    break
                  case 'encounterPrompt':
                    var okay = box.addButton('Hh3-btn_id_IOKAY', 'submit')
                    box.addButton('Hh3-btn_id_ICANCEL', 'cancel')
                    break
                  case 'encounterChoice':
                    var choices = view.get('choices')
                    if (buttons == 'sel') {
                      switch (choices.join()) {
                        default:
                          buttons = true
                          break
                        case 'attack2,defense2':  // Arena
                          box.addSelectableWithButtons().assignChildren([
                            {choice: 'attack2', face: {class: H3Bits.StatImage, size: 82, stat: this.rules.constants.stats.attack}, name: this.cx.s('map', '+2 Attack Skill')},
                            {choice: 'defense2', face: {class: H3Bits.StatImage, size: 82, stat: this.rules.constants.stats.defense}, name: this.cx.s('map', '+2 Defense Skill')},
                          ])
                          // SoD shows OK/Cancel buttons but Cancel works essentially as OK + first choice selected.
                          box.addButton('Hh3-btn_id_ICANCEL', 'cancel')
                            .set('choice', choices[0])
                            .el.addClass('Hh3-msg__sel-cancel')
                          // Message closing without explicit selection is usually accidental so prevent that.
                          box.on('=cancel', Common.stub)
                          break
                        case 'spellPower,knowledge,cancel':   // School of Magic
                          box.addSelectableWithButtons().assignChildren([
                            {choice: 'spellPower', face: {class: H3Bits.StatImage, size: 82, stat: this.rules.constants.stats.spellPower}, name: this.cx.s('map', '+1 Spell Power')},
                            {choice: 'knowledge', face: {class: H3Bits.StatImage, size: 82, stat: this.rules.constants.stats.knowledge}, name: this.cx.s('map', '+1 Knowledge')},
                          ])
                          box.addButton('Hh3-btn_id_ICANCEL', 'cancel')
                            .set('choice', 'cancel')
                          break
                        case 'attack,defense,cancel':   // School of War
                          box.addSelectableWithButtons().assignChildren([
                            {choice: 'attack', face: {class: H3Bits.StatImage, size: 82, stat: this.rules.constants.stats.attack}, name: this.cx.s('map', '+1 Attack Skill')},
                            {choice: 'defense', face: {class: H3Bits.StatImage, size: 82, stat: this.rules.constants.stats.defense}, name: this.cx.s('map', '+1 Defense Skill')},
                          ])
                          box.addButton('Hh3-btn_id_ICANCEL', 'cancel')
                            .set('choice', 'cancel')
                          break
                        case 'gold1000,exp500':   // TReasure Chest
                        case 'gold1500,exp1000':
                        case 'gold2000,exp1500':
                          var res = box.addSelectableWithButtons().assignChildren([
                            {choice: choices[0], face: {class: H3Bits.Resource, resource: this.map.constants.resources.gold, count: '', icon: 'RESOUR82'}, name: choices[0].substr(4)},
                            {choice: choices[1], face: {class: H3Bits.StatImage, size: 82, stat: this.rules.constants.stats.experience}, name: choices[1].substr(3)},
                          ])
                          $('<div class="Hh3-msg__inline Hh3-menu__text6 Hh3-menu__text_toned" style="position: relative; top: -1.5em">' + this.cx.s('map', 'or') + '</div>')
                            .insertAfter(res[0][0].child.el)
                          box.on('=cancel', Common.stub)
                          break
                      }
                      buttons == 'sel' && box.once('unnest', function () {
                        if (box.get('selected')) {
                          box.get('button').set('choice', box.get('selected').get('choice'))
                        }
                      })
                    }
                    if (buttons === true) {
                      if (choices.length == 2) {
                        box.addButton('Hh3-btn_id_IOKAY', 'submit').set('choice', choices[0])
                        box.addButton('Hh3-btn_id_ICANCEL', 'cancel').set('choice', choices[1])
                      } else {
                        _.each(choices, function (choice) {
                          box.addButton('Hh3-btn_id_IOKAY').set('choice', choice)
                        })
                      }
                    }
                    break
                }
                box.set('collapsed', false)
                box.once('unnest', function () {
                  switch (view.get('type')) {
                    case 'encounterPrompt':
                      return async.nest(this.sc.rpc.do('encounterPrompt', {
                        hero: view.get('hero'),
                        choice: box.get('button') == okay,
                      }))
                    case 'encounterChoice':
                      return async.nest(this.sc.rpc.do('encounterChoice', {
                        hero: view.get('hero'),
                        choice: box.get('button').get('choice'),
                      }))
                    default:
                      async.set('status', true)
                  }
                })
              },
            })
          },
          '+select_heroExperience': function (res, tr) {
            // XXX=I:huic:
            if (this.sc.rpc.get('observer')) { return }
            return this.pl.heroes.nested(tr.get('object')) && '!map'
          },
          'nest_heroExperience': function (view) {
            var hero
            this.autoOff(view, {
              listen: function () {
                hero = this.pl.heroes.nested(view.get('object'))
                if (!hero) {
                  return view.abort()  // deleted while transition was preparing
                }
                view.autoOff(hero, {
                  '-unnest, change_owner': 'abort',
                })
              },
              tick: function (async, tick) {
                var data = view.get('data')[tick]
                if (!data) {
                  // Experience increased but level didn't.
                  return
                }
                async = async.nest({owning: false})
                var win = this.get('ui').windows.addModule(UI.HeroLevelUp, {
                  withinWindow: this,
                  hero: hero,
                  level: data.level,
                  stat: data.stat,
                  statDelta: data.statDelta,
                })
                view.release(win)
                win.nested('skills').assignChildren(data.skills)
                if (data.skills.length > 1) {
                  // Require explicit user choice.
                  win.on('=cancel', Common.stub)
                  win.on('picked', function (skill) {
                    async.nest(this.sc.rpc.do('heroLevelSkill', {
                      hero: hero.get('id'),
                      skill: skill.get('skill'),
                    }))
                  })
                } else {
                  if (data.skills.length == 1) {
                    win.nested('skills').first().set('selected', true)
                  }
                  win.on('unnest', async.nestDoner())
                  win.on('picked', 'cancel')
                }
              },
            })
          },
          '+select_townscape': function (res, tr) {
            return this.pl.towns.nested(tr.get('town')) && 'map'
          },
          'nest_townscape': function (view) {
            var town
            this.autoOff(view, {
              final: function () {
                view.autoOff(this.pl, {change_screen: 'abort'})
              },
              listen: function () {
                town = this.map.representationOf(view.get('town'))
                town || view.abort()
              },
              tick: function () {
                var win = this.get('ui').windows.addModule(UI.Townscape, {
                  withinWindow: this,
                  ui: this.get('ui'),
                  town: town,
                  leave: true,
                })
                var key = view._parentKey
                townscapes[key] = win
                this.autoOff(win, {
                  '-unnest': function () {
                    delete townscapes[key]
                  },
                })
              },
            })
          },
          '+select_garrison, +select_tavern, +select_hireDwelling': function (res, tr) {
            // XXX=I:huic:
            if (this.sc.rpc.get('observer')) { return }
            return this.pl.heroes.nested(tr.get('hero')) && '!map'
          },
          'nest_garrison': function (view) {
            this.autoOff(view, {
              final: function () {
                view.listenForObject(view.get('garrison'))
                view.listenForObject(view.get('hero'), {allowTransitions: [view.get('moveTransition')]})
              },
              tick: function (async) {
                var win = this.get('ui').windows.addModule(UI.Garrison, {
                  withinWindow: this,
                  garrison: view.get('garrison'),
                  hero: view.get('hero'),
                })
                win.on('-unnest', async.nestDoner())
                view.release(win)
              },
              end: function () {
                this.sc.rpc.do('encounterPrompt', {hero: view.get('hero')})
              },
            })
          },
          'nest_tavern': function (view) {
            this.autoOff(view, {
              final: function () {
                view.listenForObject(view.get('tavern'))
                view.listenForObject(view.get('hero'), {allowTransitions: [view.get('moveTransition')]})
              },
              tick: function (async) {
                async = async.nest({owning: false})
                var win = this.get('ui').windows.addModule(UI.Townscape.Tavern, {
                  withinWindow: this,
                  rumor: {
                    target: this.cx.map.constants.effect.target.tavernRumor,
                    ifObject: view.get('hero'),
                    ifBonusObject: view.get('tavern'),
                  },
                  cost: {
                    target: this.cx.map.constants.effect.target.tavernCost,
                    ifObject: view.get('hero'),
                    ifBonusObject: view.get('tavern'),
                  },
                  heroes: {
                    target: this.cx.map.constants.effect.target.tavernHeroes,
                    ifObject: view.get('hero'),
                    ifBonusObject: view.get('tavern'),
                  },
                })
                  .on({'-unnest': 'doneIfEmpty'}, async)
                  .on({
                    hire: function (hero) {
                      async.nest(this.sc.rpc.do('hireHero', {
                        object: view.get('tavern'),
                        byHero: view.get('hero'),
                        hero: hero.get('id'),
                      }))
                    },
                  })
                view.release(win)
                var coords = this.map.actionableSpot(view.get('tavern'))
                var update = function () {
                  win.set('occupied', this.map.byPassable.atCoords(coords[0], coords[1], coords[2], 'impassable', 0) > 1)
                }.bind(this)
                win.autoOff(this.map.byPassable, [
                  'ochange_n_' + this.map.byPassable.toContiguous(coords[0], coords[1], coords[2], 0),
                  update,
                ])
                update()
                if (this.cx.get('classic') && win.get('occupied')) {
                  win.cancel()
                }
              },
              end: function () {
                this.sc.rpc.do('encounterPrompt', {
                  hero: view.get('hero'),
                })
              },
            })
          },
          'nest_hireDwelling': function (view) {
            this.autoOff(view, {
              final: function () {
                view.autoOff(this.pl, {change_screen: 'abort'})
                // allowOwner is present here unlike other transitions because this one is added from _handle_bonus (where final occurs) and is immediately followed by _handle_remove (where owner is changed).
                view.listenForObject(view.get('dwelling'), {allowOwner: this.pl.get('player')})
                view.listenForObject(view.get('hero'), {allowTransitions: [view.get('moveTransition')]})
              },
              tick: function (async) {
                async = async.nest({})

                var col = new Effects.Collection({effects: this.map.effects})
                view.release(col)

                var updateCollection = function (res) {
                  var creatures = []
                  _.each(col.members(), function (member) {
                    member.calc.get('value') || creatures.push(member.item)
                  })
                  // SoD doesn't seem to sort these.
                  //creatures = _.sortBy(creatures, function (cr) {
                  //  return -1 * this.rules.creatures.atCoords(cr, 0, 0, 'level', 0)
                  //}, this)
                  win.set('creatures', creatures)
                }.bind(this)

                col.fuse('change_list', updateCollection)

                col.fuse('+readyMember', function (res, cr) {
                  res.calc = this.cx.listeningEffectCalculator({
                    class: Calculator.Effect.GenericBool,
                    update: 'defer',
                    target: this.map.constants.effect.target.hireFree,
                    ifBonusObject: view.get('dwelling'),
                    ifObject: view.get('hero'),
                    ifCreature: cr,
                  })

                  res.off.push([res.calc, res.calc.on('change_value', updateCollection)])
                }, this)

                var update = function () {
                  var res = {}
                  _.each(this.map.constants.resources, function (id, name) {
                    res[id] = this.pl.get('resources_' + name)
                  }, this)
                  win.set('resources', res)
                }.bind(this)

                var sub = this.map.objects.subAtCoords(view.get('dwelling'), 0, 0, 'available', 0)
                view.fuse('end', function () { win.autoOff(sub).release() })

                var updateAvailable = function () {
                  var cr = win.creature()
                  if (cr != null && !view.get('ending')) {
                    win.set('available', sub.anyAtCoords(cr, 0, 0, 0) && sub.atCoords(cr, 0, 0, 0, 0))
                  }
                }

                var win = this.get('ui').windows.addModule(UI.HireCreature, {
                  withinWindow: this,
                  cost: {
                    target: this.map.constants.effect.target.creature_cost,
                    ifBonusObject: view.get('dwelling'),
                    ifObject: view.get('hero'),
                  },
                  slider: commonTownSlider,
                })
                  .on({'-unnest': 'doneIfEmpty'}, async)
                  .on({
                    submit: function () {
                      if (this.get('hire') > 0) {
                        var sub = this.map.objects.readSubAtCoords(view.get('hero'), 0, 0, 'garrison', 0)
                        var slot = 0
                        // XXX=RH
                        while (slot < 7 && slot < sub.size().x && sub.anyAtCoords(slot, 0, 0, 0) && sub.atCoords(slot, 0, 0, 'creature', 0) != this.creature()) {
                          slot++
                        }
                        if (slot >= 7) {
                          this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox)
                            // GENRLTXT.TXT[426]
                            .addText(this.cx.s('map', "The %s would join your hero, but there aren't enough provisions to support them."), this.rules.creatures.atCoords(this.creature(), 0, 0, this.get('hire') == 1 ? 'nameSingular' : 'namePlural', 0))
                            .addButton()
                        } else {
                          var async = this.sc.rpc.do('hireDwelling', {
                            dwelling: view.get('dwelling'),
                            hero: view.get('hero'),
                            creature: this.creature(),
                            count: this.get('hire'),
                          })
                          win.autoOff(async, {})
                            .whenSuccess(function () {
                              win.get('creatures').length > 1 ? win.set('hire', 0) : win.cancel()
                            }, win)
                        }
                      }
                    },
                  })

                col.bindCalculator(this.cx.listeningEffectCalculator({
                  class: Calculator.Effect.GenericIntArray,
                  update: 'defer',
                  target: this.map.constants.effect.target.hireAvailable,
                  ifBonusObject: view.get('dwelling'),
                  ifObject: view.get('hero'),
                }))

                view.release(win)

                update()
                win.autoOff(this.pl, {change: update})

                updateAvailable()
                win.autoOff(sub, {ochange: updateAvailable})

                win.nested('faces').on({
                  change_highlighted: updateAvailable,
                })
              },
              end: function () {
                this.sc.rpc.do('hireDwelling', {
                  dwelling: view.get('dwelling'),
                  hero: view.get('hero'),
                  leave: true,
                })
              },
            })
          },
          '+select_warMachineFactory, +select_shipyard': function (res, tr) {
            // XXX=I:huic:
            if (this.sc.rpc.get('observer')) { return }
            return this.pl.heroes.nested(tr.get('actor')) && '!map'
          },
          'nest_warMachineFactory': function (view) {
            this.autoOff(view, {
              final: function () {
                view.listenForObject(view.get('bonus'))
                view.listenForObject(view.get('actor'), {allowTransitions: [view.get('moveTransition')]})
              },
              tick: function (async) {
                var update = function () {
                  var res = {}
                  _.each(this.map.constants.resources, function (id, name) {
                    res[id] = this.pl.get('resources_' + name)
                  }, this)
                  win.set('resources', res)
                }.bind(this)

                var sub = this.map.objects.subAtCoords(view.get('actor'), 0, 0, 'artifacts', 0)
                view.fuse('end', function () { win.autoOff(sub).release() })

                var updateAvailable = function () {
                  var cr = win.creature()
                  if (cr != null && !view.get('ending')) {
                    var slots = this.rules.artifacts.atCoords(this.rules.artifactsID[_.indexOf(this.rules.creaturesID, cr)], 0, 0, 'slots', 0)
                    win.set('available', +slots.some(function (slot) {
                      return slot == this.rules.artifactSlotsID.backpack || !sub.anyAtCoords(slot, 0, 0, 0)
                    }, this))
                  }
                }.bind(this)

                var win = this.get('ui').windows.addModule(UI.HireCreature, {
                  withinWindow: this,
                  creatures: [this.rules.creaturesID.ballista, this.rules.creaturesID.firstAidTent, this.rules.creaturesID.ammoCart],
                  cost: {
                    target: this.map.constants.effect.target.creature_cost,
                    ifBonusObject: view.get('bonus'),
                    ifObject: view.get('actor'),
                  },
                  slider: commonTownSlider,
                })
                  .on({'-unnest': async.nestDoner()})
                  .on({
                    submit: function () {
                      if (this.get('hire') > 0) {
                        this.sc.rpc.do('warMachineFactory', {
                          object: view.get('bonus'),
                          actor: view.get('actor'),
                          creature: this.creature(),
                        })
                      }
                    },
                  })

                view.release(win)

                update()
                win.autoOff(this.pl, {change: update})

                updateAvailable()
                win.autoOff(sub, {'ochange, oadd, oremove': updateAvailable})

                win.nested('faces').on({
                  change_highlighted: updateAvailable,
                })
              },
              end: function () {
                this.sc.rpc.do('encounterPrompt', {
                  hero: view.get('actor'),
                })
              },
            })
          },
          'nest_shipyard': function (view) {
            this.autoOff(view, {
              final: function () {
                view.listenForObject(view.get('bonus'))
                view.listenForObject(view.get('actor'), {allowTransitions: [view.get('moveTransition')]})
              },
              tick: function (async) {
                // XXX+I SoD also allows building ships on owned shipyard by merely clicking on it rather than encountering
                var win = this.get('ui').windows.addModule(UI.Townscape.Shipyard, {
                  withinWindow: this,
                  object: view.get('bonus'),
                  actor: view.get('actor'),
                  cost: {
                    target: this.cx.map.constants.effect.target.shipCost,
                    ifObject: view.get('actor'),
                    ifBonusObject: view.get('bonus'),
                  },
                })
                  .on({'-unnest': async.nestDoner()})
                view.release(win)
                switch (win.shipState()) {
                  case 'terrain':
                  case 'impassable':
                    win.cancel()
                    var name = this.cx.oneShotEffectCalculation({
                      class: Calculator.Effect.GenericString,
                      target: this.map.constants.effect.target.name,
                      ifObject: view.get('actor'),
                    })
                    this.get('ui').windows.addModule(H3Bits.MessageBox, {withinWindow: this})
                      .addText(this.cx.s('map', '%s encounters an abandoned shipyard.  Unfortunately the Ways are blocked, and it is not possible to build ships here.'), name)
                      .addButton()
                    break
                  case 'ship':
                  case 'movable':
                    if (this.cx.get('classic')) {
                      win.cancel()
                      this.get('ui').windows.addModule(H3Bits.MessageBox, {withinWindow: this})
                        .addText(this.cx.s('map', 'Cannot build another boat'))
                        .addButton()
                    }
                }
              },
              end: function () {
                this.sc.rpc.do('encounterPrompt', {
                  hero: view.get('actor'),
                })
              },
            })
          },
          '+select_heroTrade': function (res, tr) {
            // XXX=I:huic:
            if (this.sc.rpc.get('observer')) { return }
            if (this.pl.heroes.nested(tr.get('hero')) ||
                this.pl.heroes.nested(tr.get('other'))) {
              return '!map'
            }
          },
          'nest_heroTrade': function (view) {
            this.autoOff(view, {
              final: function () {
                view.autoOff(this.pl, {change_screen: 'abort'})
                view.listenForObject(view.get('hero'))
                view.listenForObject(view.get('other'))
              },
              tick: function (async) {
                var win = this.get('ui').windows.addModule(UI.HeroTrade, {
                  withinWindow: this,
                  left: this.map.representationOf(view.get('hero')),
                  right: this.map.representationOf(view.get('other')),
                })
                  .on({'-unnest': async.nestDoner()})
                view.release(win)
                // User can spend some time at this screen and it doesn't hurt showing messages or other stuff.
                view.set('parallel', true)
              },
              end: function () {
                this.sc.rpc.do('heroTrade', {from: view.get('hero'), to: view.get('other'), leave: true})
              },
            })
          },
          '+select_scholarMessage': function (res, tr) {
            if (this.pl.heroes.nested(tr.get('to')) ||
                this.pl.heroes.nested(tr.get('from'))) {
              return 'map'
            }
          },
          'nest_scholarMessage': function (view) {
            var msg = []
            var fromNew
            var toNew
            var fromScholar
            this.autoOff(view, {
              collect: function () {
                var sort = function (spells) {
                  return _.sortBy(spells, function (id) {
                    return _.format('%04d %s',
                      9999 - this.rules.spells.atCoords(id, 0, 0, 'level', 0),
                      this.rules.spells.atCoords(id, 0, 0, 'name', 0))
                  }, this)
                }.bind(this)
                var join = function (a) {
                  return a.map(function (id, i) {
                    id = this.rules.spells.atCoords(id, 0, 0, 'name', 0)
                    return (i ? i == a.length - 1 ? ' and ' : ', ' : '') + id
                  }, this).join('')
                }.bind(this)
                // GENRLTXT.TXT[140-145]
                //
                // %s, who has studied magic extensively, learns %s from %s, and teaches %s to %s.
                // ^ name      <spell>, <spell>, ... and <spell> ^       ^ name          ^ spells ^ name
                // %s, who has studied magic extensively, learns %s from %s.
                // %s, who has studied magic extensively, teaches %s to %s.
                msg.push(this.cx.s('map', view.get('fromNew').length ? view.get('toNew').length ? '%s, who has studied magic extensively, learns %s from %s, and teaches %s to %s.' : '%s, who has studied magic extensively, learns %s from %s.' : '%s, who has studied magic extensively, teaches %s to %s.'))
                msg.push(this.cx.oneShotEffectCalculation({
                  class: Calculator.Effect.GenericString,
                  target: this.map.constants.effect.target.name,
                  ifObject: view.get('from'),
                }))
                fromNew = sort(view.get('fromNew'))
                if (fromNew.length) {
                  msg.push(join(fromNew))
                  msg.push(this.cx.oneShotEffectCalculation({
                    class: Calculator.Effect.GenericString,
                    target: this.map.constants.effect.target.name,
                    ifObject: view.get('to'),
                  }))
                }
                toNew = sort(view.get('toNew'))
                if (toNew.length) {
                  msg.push(join(toNew))
                  msg.push(this.cx.oneShotEffectCalculation({
                    class: Calculator.Effect.GenericString,
                    target: this.map.constants.effect.target.name,
                    ifObject: view.get('to'),
                  }))
                }
                fromScholar = this.cx.oneShotEffectCalculation({
                  target: this.map.constants.effect.target.skillMastery,
                  ifObject: view.get('from'),
                  ifSkill: this.rules.skillsID.scholar,
                })
              },
              tick: function (async) {
                var box = this.get('ui').windows.addModule(H3Bits.MessageBox, {withinWindow: this})
                view.release(box)
                box.addText.apply(box, msg)
                var el = box._inlineBox().appendTo(box.el)  // XXX=RH
                this.addModule(H3Bits.SkillImage, {
                  attachPath: el,
                  size: 82,
                  skill: this.rules.skillsID.scholar,
                  mastery: fromScholar,
                })
                el.append(document.createTextNode(Common.capitalize(_.indexOf(this.map.constants.skill.mastery, fromScholar)) + ' ' + this.rules.skills.atCoords(this.rules.skillsID.scholar, 0, 0, 'name', 0)))
                _.each(fromNew.concat(toNew), function (spell) {
                  var el = box._inlineBox().appendTo(box.el)  // XXX=RH
                  this.addModule(H3Bits.SpellImage, {
                    attachPath: el,
                    type: 'SCR',
                    spell: spell,
                  })
                  el.append(document.createTextNode(this.rules.spells.atCoords(spell, 0, 0, 'name', 0)))
                }, this)
                box.addButton()
                box.once('unnest', async.nestDoner())
              },
            })
          },
        })
      },

      attach: function () {
        var moveGroups = _.fromEntries([
          [this.rules.constants.animation.group.up,
           this.rules.constants.animation.group.moveUp],
          [this.rules.constants.animation.group.upRight,
           this.rules.constants.animation.group.moveUpRight],
          [this.rules.constants.animation.group.right,
           this.rules.constants.animation.group.moveRight],
          [this.rules.constants.animation.group.downRight,
           this.rules.constants.animation.group.moveDownRight],
          [this.rules.constants.animation.group.down,
           this.rules.constants.animation.group.moveDown],
         ])

        this.autoOff(this._domMap, {
          change_sharedEl: function (now) {
            if (now === false) {
              this._route._unbind(0)
            } else {
              this._route.update()
            }
          },
          '=_set': function (sup, obj, el, options) {
            if (options.animating == 'mapMove') {
              obj = _.extend({}, obj)
              obj.animation = Common.alterStringifiedArray(obj.animation, 4, function (cur) { return moveGroups[+cur] })
              // In SoD all animation groups of $44 have the same length so not updating duration.
            }
            return sup(this._domMap, [obj, el, options])
          },
        })

        var spotSchema = this.map.bySpot.schema()
        var tipOrder = _.fromEntries([
          [false, 0],
          [this.map.constants.spotObject.actionable.impassable, 1],
          [this.map.constants.spotObject.actionable.actionable, 2],
        ])

        this.autoOff(this.sc, {
          '+calcPositionBoundaries': function (res, value) {
            if (this.get('mapEdge')) {
              value = res || value
              var view = this.sc.get('mapViewSize')
              var tileSize = this.map.constants.tileSize
              return [
                Math.min(value[0], Math.floor(view[0] / 2 - edgeSize / tileSize)),
                Math.min(value[1], Math.floor(view[1] / 2 - edgeSize / tileSize)),
                Math.max(value[2], Math.floor(this.map.get('width')  - view[0] / 2 + edgeSize / tileSize)),
                Math.max(value[3], Math.floor(this.map.get('height') - view[1] / 2 + edgeSize / tileSize)),
              ]
            }
          },
          change_mouseCell: '_updateCursor',
          cellRightClick: function (x, y, z) {
            var cell = this.gridCellAt(x, y, z)
            if (this.sc.get('mapShroud') && !(this.map.shroud.atCoords(x, y, z, this.pl.get('player')) >= 0)) {
              return this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox, {elClass: 'Hh3-msg_small', centerIn: cell, tooltip: true})
                .addText(this.cx.s('map', 'Uncharted Territory'))
            }
            var objects = [[], [], []]
            var atter = this.map.bySpot.atter(['id', 'type', 'displayOrder', 'actionable'])
            this.map.bySpot.findAtCoords(x, y, z, 0, function ($1, $2, $3, $4, l, n) {
              var spot = atter(n, l)
              // Do show if user clicked on an object's actionable or impassable spot or if he has clicked on a spot of a fully passable object (such as Flowers). Additionally, in classic mode ignore rivers and roads.
              if (spot.displayOrder >= 0 && (spot.actionable !== false || this.map.objects.atCoords(spot.id, 0, 0, 'passable', 0) === false) && (!this.cx.get('classic') || (spot.type != this.map.constants.object.type.river && spot.type != this.map.constants.object.type.road))) {
                objects[tipOrder[spot.actionable]].push(spot)
              }
            }, this)
            objects = _.sortBy(objects.filter(Common.p('length')).pop() || [], Common.p('displayOrder'))
            if (objects.length) {
              switch (_.last(objects).type) {
                case this.map.constants.object.type.monster:
                  var id = _.last(objects).id
                  // XXX=IC SoD uses currently selected hero's garrisonSee ability while we use combined of all heroes including allies (XXX=C do allies in SoD provide garrisonSee?)
                  var details = this.cx.oneShotEffectCalculation({
                    target: this.map.constants.effect.target.garrisonSee,
                    // Meaning of target/actor is reversed for the purpose of matching $ifX/Y/Z which currently exist for ifObject but not for ifTarget...
                    ifObject: id,
                    ifTargetPlayer: this.pl.get('player'),
                  })
                  var cr = this.map.objects.atCoords(id, 0, 0, 'subclass', 0)
                  if (!details) {
                    return this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox, {elClass: 'Hh3-msg_small', centerIn: cell, tooltip: true})
                      .addText(this.cx.s('map', 'Unclear Monster'))
                  } else if (details == this.map.constants.effect.garrisonDetails.list) {
                    var count = this.rules.creatures.atCoords(cr, 0, 0, 'namePlural', 0)
                  } else {
                    var count = 0
                    this.map.objects.readSubAtCoords(id, 0, 0, 'garrison', 0).find('count', function (c) { count += c })
                    if (details == this.map.constants.effect.garrisonDetails.approximate) {
                      // Determined empirically. XXX=RH to databank?
                      var texts = {
                        5:    'A few %s',
                        10:   'Several %s',
                        20:   'A pack of %s',
                        50:   'Lots of %s',
                        100:  'A Horde of %s',
                        250:  'A Throng of %s',
                        500:  'A Swarm of %s',
                        1000: 'Zounds... %s',
                      }
                      count = _.format(this.cx.s('map', _.find(texts, function ($, max) { return count < max }) || 'A Legion of %s'), this.rules.creatures.atCoords(cr, 0, 0, 'namePlural', 0))
                    } else {
                      count = _.format(this.cx.s('map', '%d %s'), count, this.rules.creatures.atCoords(cr, 0, 0, count == 1 ? 'nameSingular' : 'namePlural', 0))
                    }
                    // XXX=I add aggression info (likely to join, pay so much gold)
                  }
                  var msg = this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox, {elClass: 'Hh3-msg_small', centerIn: cell, tooltip: true})
                  msg.addModule(H3Bits.CreatureImage, {
                    creature: cr,
                    type: 'large',
                  })
                  return msg.addText('Hh3-menu__text3 Hh3-menu__text_toned', count)
                case this.map.constants.object.type.hero:
                  var cls = 'Hero'
                case this.map.constants.object.type.town:
                  cls = cls || 'Town'
                case this.map.constants.object.type.garrison:
                  cls = cls || 'Garrison'
                  var id = _.last(objects).id
                  // XXX=C at least with garrison, rogue's spying seems to take effect not only if it's close to the garrison's actionable spot but also to any of its impassable spots:
                  // [ ][#]
                  // [ ][@]     @ = Garrison
                  // [ ][#]
                  // [H][ ]     H = hero with Rogue
                  var details = this.cx.oneShotEffectCalculation({
                    target: this.map.constants.effect.target.garrisonSee,
                    ifObject: id,
                    ifTargetPlayer: this.pl.get('player'),
                  })
                  if (!details) {
                    return this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox, {elClass: 'Hh3-msg_small', centerIn: cell, tooltip: true})
                      .addText('Unclear ' + cls)
                  }
                  if (this.cx.get('classic')) {
                    // SoD centers the popup over the clicked cell. Since the
                    // popup is slightly wider than 6 cells, adding 3 gets it
                    // practically centered.
                    cell = this.gridCellAt(x + 3, y, z)
                  } else {
                    cell = this.map.actionableSpot(id)
                    cell = this.gridCellAt(cell[0], cell[1], cell[2])
                  }
                  return this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(UI.Bits.RightPanel[cls], {
                    elClass: 'Hh3-rp_tooltip',
                    hero: this.map.representationOf(id),
                    town: this.map.representationOf(id),
                    garrison: id,
                    tooltipFor: cell,
                    details: details,
                  })
              }
              if (this.cx.get('classic')) {
                objects = objects.slice(-1)
              }
              var msg = this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox, {elClass: 'Hh3-msg_small', centerIn: cell, tooltip: true})
              _.reverse(objects).forEach(function (spot) {
                var cur = this.sc.get('current')
                if (cur && !cur.isHero) { cur = null }
                if (cur && spot.actionable !== false && this.map.objects.atCoords(spot.id, 0, 0, 'actionable', 0)) {
                  var enc = new Rules.GenericEncounter({
                    rules: this.rules,
                    bonus: spot.id,
                    hero: cur.get('id'),
                  })
                  enc.attach()
                  // XXX+I this check is not accurate as certain objects (e.g. Warrior's Tomb, banks) do not disclose fulfillment status until encountered; perhaps add a selector to quest_fulfilled target like ifPeeking that will allow the object determine when it's being previewed and when it's encountered
                  var fulfilled = enc.checkFulfilled() ? '(Not visited)' : '(Visited)'
                }
                var cls = this.map.objects.atCoords(spot.id, 0, 0, 'class', 0)
                // XXX perhaps add a $name property to AObject, for $type-s other than ground/hero/town/monster?
                if (_.includes(this.rules.objectsID.creatureBank, cls)) {
                  this.rules.banks.find('classes', function (classes, bank) {
                    if (_.includes(classes, cls)) {
                      msg.addText(this.rules.banks.atCoords(bank, 0, 0, 'name', 0))
                      fulfilled && msg.addText(fulfilled)
                      return true
                    }
                  }, this)
                } else if (_.includes(this.rules.objectsID.randomResource, cls) ||
                           _.includes(this.rules.objectsID.resource, cls)) {
                  msg.addText(this.cx.s('map', Common.capitalize(_.indexOf(this.map.constants.resources, this.map.objects.atCoords(spot.id, 0, 0, 'subclass', 0)))))
                } else {
                  if (_.includes(this.rules.objectsID.randomArtifact, cls) ||
                      _.includes(this.rules.objectsID.randomMajorArtifact, cls) ||
                      _.includes(this.rules.objectsID.randomMinorArtifact, cls) ||
                      _.includes(this.rules.objectsID.randomRelic, cls) ||
                      _.includes(this.rules.objectsID.randomTreasureArtifact, cls)) {
                    cls = this.rules.objectsID.artifact[0]
                  }
                  // randomDwelling... are entirely replaced by H3.Rules and cannot appear here.
                  var info = []
                  var owner = this.map.objects.atCoords(spot.id, 0, 0, 'owner', 0)
                  if (owner) {
                    var pl = _.indexOf(this.rules.playersID, owner)
                    pl = this.cx.get('classic') ? pl + ' player' : Common.capitalize(pl)
                    info.push(_.format(this.cx.s('map', objects.length > 1 ? '(Owned by %s)' : 'Owned by %s'), pl))
                  }
                  fulfilled && info.push(fulfilled)
                  var s = objects.length > 1 ? info.splice(0).join(' ') : ''
                  msg.addText(this.rules.classes.atCoords(cls, 0, 0, 'name', 0) + ' ' + s)
                  info.forEach(function (s) { msg.addText(s) })
                }
              }, this)
            }
          },
        })

        this.el.append(
          '<div class="Hh3-am__mapcor1"></div>' +
          '<div class="Hh3-am__mapcor2"></div>' +
          '<div class="Hh3-am__botcom"></div>'
        )

        this.addModule(H3Bits.Bitmap, {file: 'ADVMAP'})

        /* Status panel */
        addCommonStatusBarModules(this, 'Hh3-', 'Hh3-bmp_id_ARESBAR')

        /* Right-side control block */
        var slider = {
          height: 5,
          upClass: 'Hh3-btn_id_IAM012',
          downClass: 'Hh3-btn_id_IAM013',
          disabledClass: 'Hh3-btn_dis',
          requireCurrent: false,
        }

        var heroList = this.addModule('heroes', UI.Bits.HeroList, {
          elClass: 'Hh3-am-ol Hh3-am-ol_hero',
          list: this.pl.heroes,
          slider: slider,
          sink: {'*': {options: {bars: true}}},
          scrollOnChange: true,
          hideGarrisoned: true,
        })

        var townList = this.addModule('towns', UI.Bits.TownList, {
          elClass: 'Hh3-am-ol Hh3-am-ol_town',
          list: this.pl.towns,
          sink: {'*': {sink: {face: {options: {canBuild: true}}}}},
          slider: _.extend({}, slider, {
            upClass: 'Hh3-btn_id_IAM014',
            downClass: 'Hh3-btn_id_IAM015',
          }),
          scrollOnChange: true,
        })

        this.autoOff(this.cx, {
          change_loading: function (now) {
            if (!now) {
              var cur = heroList.current() || townList.current() ||
                        heroList.first() || townList.first()
              if (cur) {
                cur.set('selected', true)
                panels.set('current', '')
                this.sc.scrollTo(cur.get('object').get('id'))
              }
            }
          },
        })

        this.autoOff(this.sc, {
          change_current: function (now, old, options) {
            function finder(child) {
              return child.get('object') == now
            }

            if (options.listChange) { return }

            var cur = heroList.current() || townList.current()

            if (!now) {
              cur && cur.set('selected', false)
            } else if (!cur || !finder(cur)) {  // now not already selected
              cur = heroList.find(finder) || townList.find(finder)
              cur && cur.set('selected', true)
            }
          },
        })

        function listChange(child, now) {
          if (now) {
            var cur = (this == heroList ? townList : heroList).current()
            cur && cur.set('selected', false)
            this.sc.set('current', child.get('object'))
            // XXX=IC SoD immediately switches to hero/town panel if no object was selected before.
            panels.cycle(false, true)
          } else if (this.sc.get('current') == child.get('object')) {
            // This happens if you have a town and a hero, select the hero, walk into the town (town screen opens without selecting the town first) and put the hero to garrison. Upon closing the townscape, observe that hero list is empty and no town is selected in the town list. Also, the bottom right panel immediately switches to and stays at the new day/week image without cycling to the kingdom view (but if switched to kingdom, cycles back to day).
            this.sc.set('current', null, {listChange: true})
            this.length || panels.cycle('', true)
          }
        }

        heroList.fuse('.change_selected', listChange)
        townList.fuse('.change_selected', listChange)

        heroList.on({
          '.clicked': function (item) {
            if (item.get('selected')) {
              this.get('ui').windows.addModule(UI.HeroInfo, {hero: item.get('object')})
            }
          },
        }, this)

        townList.on({
          '.clicked': function (item) {
            if (item.get('selected')) {
              this.get('ui').showTownscape(item.get('object'))
            }
          },
        }, this)

        this.fuse('submit', function () {
          var cur
          if (cur = heroList.currentObject()) {
            this.get('ui').windows.addModule(UI.HeroInfo, {hero: cur})
          } else if (cur = townList.currentObject()) {
            this.get('ui').showTownscape(cur)
          }
        })

        var buttons = $('<div class=Hh3-am-btns>').appendTo(this.el)
        this.addModule('kingdom', H3Bits.Button, {attachPath: buttons, elClass: 'Hh3-btn_id_IAM002'})
          .set('disabled', this.pl.get('won') !== false)
          .on('clicked', function () {
            // XXX=I Kingdom Overview
            var box = this.get('ui').windows.addModule(H3Bits.MessageBox)
              .addText('Hh3-menu__text9 Hh3-menu__text_toned', 'Daily income:')
            _.each(this.map.constants.resources, function (res, name) {
              var value = this.cx.oneShotEffectCalculation({
                target: this.map.constants.effect.target.income,
                ifPlayer: this.pl.get('player'),
                ifResource: res,
              })
              var cap = Common.capitalize(name)
              var mines = this.pl.mines.filter(function (m) { return m.get('subclass') === res })
              box.addText(this.cx.s('map', '%s %+d (%d mines%s)'), this.cx.s('map', cap), value, mines.length, name == 'gold' ? _.format(this.cx.s('map', ', %d towns'), this.pl.towns.length) : '')
            }, this)
            box.addButton()
          }, this)
        this.autoOff(this.pl, {
          change_won: function () {
            this.nested('kingdom').set('disabled', true)
          },
        })
        this.addModule('z', UI.Bits.Button.Z, {
          attachPath: buttons,
        })
        this.addModule('log', H3Bits.Button, {attachPath: buttons, elClass: 'Hh3-btn_id_IAM004 Hh3-btn_dis'})
        var restButton = this.addModule('rest', UI.Bits.Button.RestHero, {
          attachPath: buttons,
        })
        this.addModule('go', UI.Bits.Button.GoHero, {
          attachPath: buttons,
        })
        this.addModule('spells', H3Combat.SpellBook.Button.ScreenCurrent, {attachPath: buttons, elClass: 'Hh3-btn_id_IAM007', context: this.map.constants.spell.context.map, showEmpty: this.cx.get('classic')})
        this.autoOff(this.cx, {
          change_classic: function (now) {
            this.nested('spells').set('showEmpty', now)
          },
        })
        this.addModule('menu', H3Bits.Button, {attachPath: buttons, elClass: 'Hh3-btn_id_IAM008 Hh3-btn_dis'})
        this.addModule('options', H3Bits.Button, {attachPath: buttons, elClass: 'Hh3-btn_id_IAM009 Hsfx__btn'})
          .on('clicked', function () { this.get('ui').windows.addModule(UI.GameOptions) }, this)
        var nextButton = this.addModule('next', UI.Bits.Button.NextHero, {
          attachPath: buttons,
          heroList: heroList,
        })
        this.addModule('end', UI.Bits.Button.EndTurn, {
          attachPath: buttons,
        })

        this.autoOff(this.map, {
          change_date: function (now) {
            if (now && (now = nextButton.nextHero(Infinity))) {
              this.sc.set('current', now)
              this.sc.scrollTo(now.get('id'))
            }
          },
        })

        restButton.fuse('resting', function (hero) {
          var next = nextButton.nextHero()
          if (next) {
            this.sc.set('current', next)
            this.sc.scrollTo(next.get('id'))
          }
        }, this)

        /* Panel in the right-bottom corner */
        var panels = this.addModule('panels', UI.Bits.RightPanel.Multiple, {
          heroList: heroList,
          townList: townList,
        })

        /* Custom elements */
        if (!this.cx.get('classic')) {
          this.addModule('combats', UI.Bits.CombatList)
            .on('.clicked', function (child) {
              this.get('ui').windows.addModule(H3Combat, {
                combat: child.get('combat'),
                canClose: true,
              })
            }, this)
        }
      },

      render: function () {
        this.get('mapEdge') && this._updateAddedMapScroll()
      },

      change_mapEdge: function (now) {
        if (this.get('rendered')) {
          this.sc.updateMapPositionBoundaries()
          this.update()
          this._updateAddedMapScroll()
        }
      },

      _update: function () {
        this.get('dom').el.toggleClass('Hroot_edge', this.get('mapEdge'))
      },
    },

    _updateAddedMapScroll: function () {
      var size = this.get('mapEdge') ? edgeSize : -edgeSize
      this.get('dom').getSet('addedMapScroll', function (cur) {
        return [cur[0] + size, cur[1] + size]
      })
    },

    _updateCursor: function () {
      if (this._lastCursor) {
        this._lastCursor[0].classList.remove(this._lastCursor[1])
      }

      var cell = this.sc.get('mouseCell')
      var cursor = this.get('cursor')

      if (cell && cursor != null) {
        var el = this.gridCellAt(cell[0], cell[1])
        var cls = 'Hh3-root_cursor_a-' + cursor
        this._lastCursor = [el, cls]
        el.classList.add(cls)
      }
    },

    //= Element
    gridCellAt: function (x, y) {
      return this._domMap.gridCellAt(x, y)
    },
  })

  // Draws provisional hero move route and allows building it and moving along it.
  UI.AdventureMap.Route = Common.Sqimitive.extend('HeroWO.H3.DOM.UI.AdventureMap.Route', {
    mixIns: [Common.ScreenModule],
    _routeIndex: 0,
    _routeEl: [],
    _timer: null,

    _opt: {
      rebuildTimer: 5000,   // 0 to disable
    },

    events: {
      attach: function () {
        this._routeIndex = this.map.objects.propertyIndex('route')
        var spotSchema = this.map.bySpot.schema()

        this.autoOff(this.map.objects, [
          // Draw new route when it has changed in the store.
          'ochange_p_' + this._routeIndex,
          function (n) {
            var cur = this.sc.get('current')
            if (cur && cur.isHero && n == cur.get('n')) {
              this.update()
            }
          },
        ])

        this.autoOff(this.pl, {
          change_interactive: 'update',  // start _rebuild() timer
        })

        this.autoOff(this.sc, {
          change_z: 'update',
          change_mapShowRoute: 'update',

          cellClick: function (x, y, z) {
            var hero = this.sc.get('current')
            if (hero && hero.isHero) {
              var l = this.map.bySpot.findAtCoords(x, y, z, spotSchema.id, hero.get('id'))
              if (l != null && this.map.bySpot.atCoords(x, y, z, 'actionable', l) === this.map.constants.spotObject.actionable.actionable) {
                // In non-classic mode let user click on the hero spot to perform the action without moving, if there's any other actionable (can be only done by Space in SoD), except if the hero is visiting a town (then always open hero info).
                l = this.map.bySpot.findAtCoords(x, y, z, 'actionable', function (act, $2, $3, $4, ll) {
                  if (act === this.map.constants.spotObject.actionable.actionable && l != ll && this.map.bySpot.atCoords(x, y, z, 'displayOrder', ll) >= 0 && this.map.bySpot.atCoords(x, y, z, 'type', ll) != this.map.constants.object.type.town) {
                    return true
                  }
                }, this)
                if (this.cx.get('classic') || !l) {
                  this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(UI.HeroInfo, {hero: hero})
                } else {
                  this.sc.rpc.do('actHero', {
                    hero: hero.get('id'),
                  })
                }
                var impassable = true
              }
              impassable = impassable || this.map.bySpot.findAtCoords(x, y, z, spotSchema.actionable,
                function (act, $1, $2, $3, l, n) {
                  if (act === this.map.constants.spotObject.actionable.impassable && this.map.bySpot.atContiguous(n + spotSchema.displayOrder, l) >= 0) {
                    n -= spotSchema.actionable
                    if (this.map.bySpot.atContiguous(n + spotSchema.type, l) == this.map.constants.object.type.town) {
                      var id = this.map.bySpot.atContiguous(n + spotSchema.id, l)
                      var owner = this.map.objects.atCoords(id, 0, 0, 'owner', 0) || 0
                      if (this.map.players.nested(owner).get('team') == this.pl.get('team')) {
                        // Switch to town if it's our own. In non-classic mode, show town's view if it belongs to ally.
                        if (owner == this.pl.get('player')) {
                          this.sc.set('current', this.map.representationOf(id))
                          this.cx.get('classic') && this.sc.scrollTo(id)
                        } else if (!this.cx.get('classic')) {
                          this.sc.modules.nested('HeroWO.H3.DOM.UI').showTownscape(this.map.representationOf(id))
                        }
                      }
                    }
                    return true
                  }
                }, this)
              if (!impassable) {
                // Hidden Event's actionable on the shore. See CursorPathFinder.
                if (hero.get('vehicle') == this.map.constants.object.vehicle.ship &&
                    this.cx.get('classic') &&
                    this.map.byPassable.atCoords(x, y, z, 'type', 0) == this.map.constants.passable.type.ground &&
                    this.map.byPassable.atCoords(x, y, z, 'actionable', 0) /*&&
                    this.map.bySpot.findAtCoords(x, y, z, 'type', this.map.constants.object.type.artifact) == null*/) {
                  return
                }
                var sub = this.map.objects.readSubAtContiguous(hero.get('n') + this._routeIndex, 0)
                var schema = sub.schema()
                var at = sub.find(schema.x, function (rx, i, $3, $4, $5, n) {
                  if (rx == x &&
                      sub.atContiguous((n -= schema.x) + schema.y, 0) == y &&
                      sub.atContiguous(n + schema.z, 0) == z) {
                    return sub.atContiguous(n + schema.direction, 0) ? i : -1
                  }
                })
                if (at == -1) {
                  // If user has clicked on the destination segment of the route previously
                  // created, always move the hero.
                } else {
                  // If he has clicked on a segment other than the destination, rebuild the route. Then move the hero if "Show Move Path" is disabled.
                  if (this.sc.get('mapShowRoute')) {
                    return this.sc.rpc.do('buildRoute', {
                      hero: hero.get('id'),
                      destination: [x, y, z],
                    })
                      .whenError(function () {
                        // Unreachable, do nothing, keep existing route.
                      })
                  }
                  // If he has clicked on a cell outside of the existing route, try building a new route. Upon success, move the hero if "Show Move Path" is disabled.
                }
                this.sc.modules.nested('HeroWO.H3.DOM.UI').followRoute([x, y])
              }
            } else {
              // No current object or it isn't a hero. See if can open hero info or townscape.
              var town
              this.map.bySpot.findAtCoords(x, y, z, 0,
                function ($0, $1, $2, $3, l, n) {
                  if (this.map.bySpot.atContiguous(n + spotSchema.displayOrder, l) < 0) { return }
                  var id = this.map.bySpot.atContiguous(n + spotSchema.id, l)
                  switch (this.map.bySpot.atContiguous(n + spotSchema.actionable, l)) {
                    case this.map.constants.spotObject.actionable.actionable:
                      switch (this.map.bySpot.atContiguous(n + spotSchema.type, l)) {
                        case this.map.constants.object.type.hero:
                          var owner = this.map.objects.atCoords(id, 0, 0, 'owner', 0) || 0
                          if (this.map.players.nested(owner).get('team') == this.pl.get('team')) {
                            if (owner == this.pl.get('player')) {
                              this.sc.set('current', this.map.representationOf(id))
                              this.sc.scrollTo(id)
                            } else if (!this.cx.get('classic')) {
                              this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(UI.HeroInfo, {hero: this.map.representationOf(id)})
                            }
                          }
                          return town = false
                        case this.map.constants.object.type.town:
                          town = id
                      }
                      return
                    case this.map.constants.spotObject.actionable.impassable:
                      switch (this.map.bySpot.atContiguous(n + spotSchema.type, l)) {
                        case this.map.constants.object.type.town:
                          town = id
                      }
                      return true
                  }
                }, this)
              if (town) {
                var owner = this.map.objects.atCoords(town, 0, 0, 'owner', 0) || 0
                if (this.map.players.nested(owner).get('team') == this.pl.get('team')) {
                  if ((hero && town == hero.get('id')) || owner != this.pl.get('player')) {
                    this.sc.modules.nested('HeroWO.H3.DOM.UI').showTownscape(this.map.representationOf(town))
                  } else {
                    this.sc.set('current', this.map.representationOf(town))
                    this.cx.get('classic') && this.sc.scrollTo(town)
                  }
                }
              }
            }
          },

          change_current: function (now, old) {
            if (old && old.isHero) {
              this.autoOff(old)
            }
            if (now && now.isHero) {
              this.autoOff(now, {
                change_actionPoints: 'update',
              })
            }
            this.update()
          },
        })
      },

      _update: function () {
        var hero = this.sc.get('current')
        var rest = 0

        if (hero && hero.isHero && this.sc.get('z') == hero.get('z') && this.sc.get('mapShowRoute')) {
          var sub = this.map.objects.readSubAtContiguous(hero.get('n') + this._routeIndex, 0)
          var atter = sub.atter(['x', 'y', 'direction', 'cost'])
          var ap = hero.get('actionPoints')

          sub.find(0, function ($1, i, $3, $4, $5, n) {
            rest = i + 1
            var comp = atter(n, 0)

            ap -= comp.cost
            var cls = 'Hh3-def_frame_ADAG-0-' + (comp.direction + 25 * (ap < 0))
            var oldEl = this._routeEl[i]
            var newEl = this.gridCellAt(comp.x, comp.y)
            if (oldEl != newEl || !newEl.classList.contains(cls)) {
              oldEl && this._declass(oldEl)
              this._routeEl[i] = newEl
              newEl.classList.add(cls)
            }
          }, this)
        }

        this._unbind(rest)

        // Refresh optimal route from time to time. Unlike our normal policy, this update is not live but polling, otherwise we'd have to set up path cost calculators pretty much over the entire map. SoD does update the route but it's not clear when exactly (perhaps on action?).
        if (rest) {
          var delay = this.get('rebuildTimer')
          this._timer = delay && _.delay(this._rebuild.bind(this), delay)
        }
      },

      '-unnest': function () {
        this._unbind(0)
      },
    },

    gridCellAt: Common.stub,

    _unbind: function (start) {
      clearTimeout(this._timer)
      this._timer = null

      _.each(this._routeEl.splice(start), this._declass)
    },

    _declass: function (el) {
      Common.oneClass(el, 'Hh3-def_frame_ADAG-')
    },

    _rebuild: function () {
      if (!this.pl.get('interactive') || this.sc.rpc.get('observer')) { return }
      this._timer = null    // no need to clearTimeout() as _rebuild() is only called by _timer
      var hero = this.sc.get('current')
      var sub = this.map.objects.readSubAtCoords(hero.get('id'), 0, 0, 'route', 0)
      var schema = sub.schema()
      var dest
      sub.find(0, function ($1, $2, $3, $4, $5, n) {
        dest = [
          this.atContiguous(n + schema.x, 0),
          this.atContiguous(n + schema.y, 0),
        ]
      })
      if (dest) {
        this.sc.rpc.do('buildRoute', {
          hero: hero.get('id'),
          destination: dest.concat(hero.get('z')),
        })
          .whenSuccess(function (async) {
            // If route has changed, _update() has scheduled _timer. If it didn't, we'll schedule it unless there's no route (unreachable).
            if (async.result.path.length && !this._timer) {
              var delay = this.get('rebuildTimer')
              this._timer = delay && _.delay(this._rebuild.bind(this), delay)
            }
          }, this)
      }
    },
  })

  // Updates mouse cursor depending on the cell under it (e.g. an actionable object or a tradable hero).
  //
  // This and Route are using similar algorithms but not quite because numerous nuances differ.
  UI.AdventureMap.CursorPathFinder = Common.Sqimitive.extend('HeroWO.H3.DOM.UI.AdventureMap.CursorPathFinder', {
    mixIns: [Common.ScreenModule],
    _calc: null,

    _opt: {
      cursor: null,   // frame in group 0 of CRADVNTR.DEF
    },

    events: {
      attach: function () {
        var consts = this.map.constants
        var passableSchema = this.map.byPassable.schema()
        var spotSchema = this.map.bySpot.schema()
        var objectSchema = this.map.objects.schema()
        var guardedAtter = this.map.bySpot.atter(['displayOrder', 'guarded'], {array: true})

        this.autoOff(this.sc, {
          change_mouseCell: function (now) {
            var obj = this.sc.get('current')
            var cursor

            if (now) {
              var hero = obj && obj.isHero
              var x = now[0]
              var y = now[1]
              var z = this.sc.get('z')

              var impassables = this.map.byPassable.atCoords(x, y, z, passableSchema.impassable, 0)
              var actionables = this.map.byPassable.atCoords(x, y, z, passableSchema.actionable, 0)
              if (!this.cx.get('classic') && hero) {
                var l = this.map.bySpot.findAtCoords(x, y, z, 'id', obj.get('id'))
                if (l != null && this.map.bySpot.atCoords(x, y, z, 'actionable', l) === consts.spotObject.actionable.actionable) {
                  impassables--
                  actionables--
                  var heroSpot = true
                }
              }

              if (impassables && !actionables) {
                this.map.bySpot.findAtCoords(x, y, z, spotSchema.actionable,
                  function (act, $1, $2, $3, l, n) {
                    if (act === consts.spotObject.actionable.impassable &&
                        this.map.bySpot.atContiguous(n - spotSchema.actionable + spotSchema.type, l) === consts.object.type.town &&
                        this.map.bySpot.atContiguous(n - spotSchema.actionable + spotSchema.displayOrder, l) >= 0) {
                      var owner = this.map.objects.atCoords(this.map.bySpot.atContiguous(n - spotSchema.actionable + spotSchema.id, l), 0, 0, 'owner', 0) || 0
                      if (this.map.players.nested(owner).get('team') == this.pl.get('team') && (!this.cx.get('classic') || owner == this.pl.get('player'))) {
                        return cursor = 3
                      }
                    }
                  }, this)
              }

              if (impassables && actionables) {
                // Actionable spot of a non-passable actionable.
                var type
                var id
                var owner
                this.map.bySpot.findAtCoords(x, y, z, spotSchema.actionable,
                  function (act, $1, $2, $3, l, n) {
                    n -= spotSchema.actionable
                    if (act === consts.spotObject.actionable.actionable &&
                        this.map.bySpot.atContiguous(n + spotSchema.displayOrder, l) >= 0) {
                      if (this.cx.get('classic') || !hero || this.map.bySpot.atContiguous(n + spotSchema.id, l) != obj.get('id')) {
                        type = this.map.bySpot.atContiguous(n + spotSchema.type, l)
                        id = this.map.bySpot.atContiguous(n + spotSchema.id, l)
                        owner = this.map.objects.atCoords(id, 0, 0, objectSchema.owner, 0) || 0
                        // As there may be multiple actionables per spot, prioritize hero-typed.
                        return type === consts.object.type.hero || null
                      }
                    }
                  }, this)
                if (hero) {
                  cursor = obj.get('vehicle') == consts.object.vehicle.ship ? 28
                    : type == consts.object.type.boat ? 6 : 9
                  if (this.map.players.nested(owner).get('team') == this.pl.get('team')) {
                    if (type == consts.object.type.hero) {
                      cursor = id == obj.get('id') ? 2 : 8
                    } else if (heroSpot && type == consts.object.type.town) {
                      cursor = 2
                    }
                  } else {  // an enemy actionable
                    switch (type) {
                      case consts.object.type.town:
                      case consts.object.type.garrison:
                        this.map.objects.readSubAtCoords(id, 0, 0, objectSchema.garrison, 0).find(0, function () {
                          return cursor = 5
                        })
                        break
                      case consts.object.type.hero:
                      case consts.object.type.monster:
                        cursor = 5
                    }
                  }
                } else if (this.map.players.nested(owner).get('team') == this.pl.get('team') && (!this.cx.get('classic') || owner == this.pl.get('player'))) {
                  switch (type) {
                    case consts.object.type.town:
                      cursor = 3
                      break
                    case consts.object.type.hero:
                      cursor = 2
                      break
                  }
                }
              }

              if (!impassables && hero) {
                // Passable tile or passable actionable, or the current hero's own spot in non-classic mode.

                // Guards are not triggered by action without moving (Space) so use the helm cursor.
                var guarded = !heroSpot && null != this.map.bySpot.findAtCoords(x, y, z, 0, function ($1, $2, $3, $4, l, n) {
                  var at = guardedAtter(n, l)
                  return at[0] >= 0 && at[1] === consts.spotObject.guarded.guarded || null
                })

                var ship = obj.get('vehicle') == consts.object.vehicle.ship

                if (ship) {
                  if (this.map.byPassable.atCoords(x, y, z, passableSchema.type, 0) === consts.passable.type.ground) {
                    // SoD doesn't permit disembarking on top of an Event (which is the only ground object with passable actionable spot) but allows on top of Grail (which is hidden in HeroWO and ignored by pathfinder, cursor, spot effects, etc.). Currently this disembarking rule is an artificial limitation on the side of UI (XXX=I should be enforced in PathCost).
                    var found = actionables && this.cx.get('classic') //&& this.map.bySpot.findAtCoords(x, y, z, 'type', consts.object.type.artifact) == null
                    cursor = found ? null : (guarded && !this.cx.get('classic') ? 5 : 7)
                  } else if (guarded) {
                    cursor = 5
                  } else {
                    cursor = heroSpot ? 2 : 6
                  }
                } else {
                  if (guarded) {
                    cursor = 5
                  } else {
                    cursor = heroSpot ? 2 : 4
                  }
                }
              }

              switch (cursor) {
                case 4:
                case 5:
                case 6:
                case 7:
                case 8:
                case 9:
                case 28:    // all these are only when obj is a movable hero
                  var path
                  var act = this.map.actionableSpot(obj.get('id'))

                  if (act[0] == x && act[1] == y && act[2] == z) {
                    // Interacting with the object the hero is standing on is AP-free.
                    //var pathCost = this.cx.pathCostFor(obj.get('id'))
                    //  .costAt(act[0], act[1], act[2], null, {isDestination: true})
                    break
                  } else if (path = this.cx.pathFindFor(obj.get('id'), [x, y, z])) {
                    var pathCost = 0
                    path.forEach(function (item) { pathCost += item[6] })
                  } else {
                    cursor = null
                    break
                  }

                  var days = 0
                  var dayPoints = obj.get('actionPoints')
                  var maxDays = 3

                  while ((pathCost -= dayPoints) > 0 && days < maxDays) {
                    days++
                    dayPoints = this._dailyApCalc(obj.get('id')).get('value')
                    if (dayPoints < 0) {
                      days = maxDays
                    }
                  }

                  cursor += cursor == 28 ? days : (days * 6)
              }
            }

            this.set('cursor', cursor)
          },
        })
      },

      '-unnest': function () {
        this._parent && this._calc && this._calc.release()
      },
    },

    _dailyApCalc: function (hero) {
      if (this._calc) {
        this._calc.set('ifObject', hero)
      } else {
        this._calc = this.cx.listeningEffectCalculator({
          shared: false,
          update: false,
          target: this.map.constants.effect.target.hero_actionPoints,
          ifObject: hero,
        }).take()
      }

      return this._calc.updateIfNeeded()
    },
  })

  // Main town's overview screen, with large building graphics, access to Hall and Fort, garrisoned and visiting heroes' creatures, etc.
  UI.Townscape = H3Bits.Window.extend('HeroWO.H3.DOM.UI.Townscape', {
    el: {class: 'Hh3-town'},
    _swap: null,

    _opt: {
      fullScreen: true,
      ui: null,    // do not set
      town: null,  // do not set
      leave: false,
    },

    events: {
      '-unnest': function () {
        this._parent && this._swap.remove()
      },

      submit: 'cancel',

      cancel: function (options) {
        if (this.get('leave')) {
          this.sc.rpc.do('townscape', {town: this.get('town').get('id'), leave: true})
        }
        var hero = this.get('town').get('visiting')
        if (hero && (!options || options.scroll)) {
          this.sc.set('current', this.map.representationOf(hero))
          this.sc.scrollTo(hero)
        }
      },

      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-town__*'}}})
        var obj = this.get('town')

        this.autoOff(obj, {
          change_subclass: '_refreshClass',
          change_garrisoned: '_refreshHeroes',
          change_visiting: '_refreshHeroes',
          change_owner: function (now) {
            if (this.map.players.nested(now).get('team') == this.pl.get('team')) {
              this._refreshHeroes()
            } else {
              this.remove()
            }
          },
        })

        this.autoOff(obj, {'-unnest': 'cancel'})

        var state = this.cx.calculator(Rules.ShipState, {id: obj.get('id')})
        function updateState(now) {
          Common.oneClass(this.el, 'Hh3-town_ship_', now)
        }
        updateState.call(this, state.get('value'))
        this.autoOff(state, {change_value: updateState})

        /* Central area - must be first to not overlap others */
        this._refreshClass()

        this.addModule('bk', H3Bits.TownBackground, {town: obj})
        this.addModule('panel', H3Bits.Bitmap, {file: 'TOWNSCRN'})

        function updateList(now) {
          Common.oneClass(this.el, 'Hh3-town_shipyard_', _.includes(now, this.rules.buildingsID.shipyard) ? 'yes' : 'no')
        }
        this.addModule('buildings', H3Bits.TownBuildingList, {
          town: obj,
          image: $('<img class=Hh3-town__buildings-map>')
            // Without src the map works but Chrome displays a gray outline
            // around <img>.
            .attr('src', Common.blankGIF)
            .appendTo(this.el),
          sink: {'*': {elClass: 'Hh3-town__building', sink: {hover: {elClass: 'Hh3-town__building-hover'}}}},
        })
          .on({
            change_list: updateList,
            '.clicked': function (child) {
              this.showBuilding(child.get('id'))
            },
            '.showTooltip': function (child) {
              this.showBuilding(child.get('id'), true)
            },
          }, this)

        updateList.call(this, this.nested('buildings').get('list'))

        /* Status panel */
        addCommonStatusBarModules(this, 'Hh3-', 'Hh3-bmp_id_ARESBAR')

        /* Bottom panel - left */
        this.addModule('face', H3Bits.DefImage.Portrait, {
          id: obj.get('id'),
          canBuild: false,
          large: true,
        })

        var update = function (now) {
          Common.oneClass(this.el, 'Hh3-town_h_', now)
        }.bind(this)
        var hall = this.addModule('hall', H3Bits.TownHallLevel, {town: obj, large: true})
          .on({change_frame: update})
        update(hall.get('frame'))

        this.addModule('fort', H3Bits.TownFortLevel, {town: obj, large: true})

        this.addModule('name', Bits.String, {
          elClass: 'Hh3-menu__text6 Hh3-menu__text_toned',
          format: '%n',
        })
          .addCalculator('n', Calculator.Effect.GenericString, {
            target: this.cx.map.constants.effect.target.name,
            ifObject: obj.get('id'),
          })

        this.addModule('income', Bits.String, {
          elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
          format: '%g',
        })
          .addCalculator('g', Rules.TownIncome, {
            player: this.cx.players.nested(obj.get('owner')),
            id: obj.get('id'),
            resource: this.map.constants.resources.gold,
          })

        this.addModule('growth', H3Bits.GrowthBuildingList, {
          elClass: 'Hh3-menu__text3',
          town: obj,
        })
          .on({
            '.clicked': function (child) {
              if (!this.cx.get('classic')) {
                this.get('ui').showTownHire(this.get('town'), child.get('id'), this)
              }
            },
            '.showTooltip': function (child) {
              // XXX=I show growth affectors
            },
          }, this)

        /* Bottom panel - middle */
        this._refreshHeroes()

        /* Bottom panel - right */
        this.addModule('close', UI.Bits.Button.Close, {
          elClass: 'Hh3-def_frame_TSBTNS-0-4',
        })
          .on('clicked', 'cancel', this)

        var townList = this.addModule('towns', UI.Bits.TownList, {
          elClass: 'Hh3-town-ol',
          list: this.pl.towns,
          sink: {'*': {sink: {face: {options: {canBuild: true}}}}},
          slider: {
            height: 3,
            upClass: 'Hh3-btn_id_IAM014',
            downClass: 'Hh3-btn_id_IAM015',
            disabledClass: 'Hh3-btn_dis',
            // Select nothing if current town belongs to another player.
            requireCurrent: false,
          },
        })

        var cur = townList.nested(obj.get('id'))
        // If obj belongs to another player (ally) then it doesn't exist in this list.
        cur && cur.set('selected', true)

        townList.on({
          '.change_selected': function (town, now) {
            if (now) {
              this.cancel({scroll: false})
              this.get('ui').showTownscape(town.get('object'))
            }
          },
        }, this)
      },
    },

    _refreshClass: function () {
      var obj = this.get('town')

      Common.oneClass(this.el, 'Hh3-town_t_', _.indexOf(this.rules.townsID, obj.get('subclass')))

      this.each(function (m, k) {
        /^anim\d*$/.test(k) && m.remove()
      })

      switch (obj.get('subclass')) {
        case this.rules.townsID.castle:
          this.addModule('anim',  H3Bits.DefImage, {def: 'TBCSEXT2'})
          this.addModule('anim2', H3Bits.DefImage, {def: 'TBCSBOAT'})
          break
        case this.rules.townsID.rampart:
          this.addModule('anim3', H3Bits.DefImage, {def: 'TBRMEXT3'})
          this.addModule('anim',  H3Bits.DefImage, {def: 'TBRMEXT2'})
          this.addModule('anim4', H3Bits.DefImage, {def: 'TBRMEXT4'})
          this.addModule('anim5', H3Bits.DefImage, {def: 'TBRMEXT5'})
          break
        case this.rules.townsID.necropolis:
          this.addModule('anim',  H3Bits.DefImage, {def: 'TBNCEXT2'})
          this.addModule('anim3', H3Bits.DefImage, {def: 'TBNCEXT3'})
          this.addModule('anim4', H3Bits.DefImage, {def: 'TBNCEXT4'})
          this.addModule('anim5', H3Bits.DefImage, {def: 'TBNCEXT5'})
          this.addModule('anim2', H3Bits.DefImage, {def: 'TBNCBOAT'})
          break
        case this.rules.townsID.stronghold:
          this.addModule('anim',  H3Bits.DefImage, {def: 'TBSTEXT3'})
          break
        case this.rules.townsID.fortress:
          this.addModule('anim',  H3Bits.DefImage, {def: 'TBFREXT2'})
          this.addModule('anim2', H3Bits.DefImage, {def: 'TBFRBOAT'})
          break
        case this.rules.townsID.conflux:
          this.addModule('anim',  H3Bits.DefImage, {def: 'TBELEXT1'})
          this.addModule('anim3', H3Bits.DefImage, {def: 'TBELEXT2'})
          this.addModule('anim4', H3Bits.DefImage, {def: 'TBELEXT3'})
          this.addModule('anim5', H3Bits.DefImage, {def: 'TBELEXT4'})
          this.addModule('anim6', H3Bits.DefImage, {def: 'TBELEXT5'})
          this.addModule('anim2', H3Bits.DefImage, {def: 'TBELBOAT'})
          break
      }
    },

    _refreshHeroes: function () {
      var obj = this.get('town')
      var garrisoned = obj.get('garrisoned')
      var visiting = obj.get('visiting')

      if (this._swap) {
        this._swap.invoke('remove')
        this._swap.remove()
      }

      var swap = this._swap = new GarrisonSwap({town: obj, sc: this.sc})

      if (garrisoned) {
        this.unlist('garrison')
        var garList = this.addModule('garrisoned', UI.Bits.GarrisonList, {
          store: this.map.objects.subAtCoords(garrisoned, 0, 0, 'garrison', 0),
          sink: {'*': {options: {garrison: garrisoned}}},
        })
        garList._store.release()    // XXX=RH; also grep for other /\._store\./ occurrences
        var garFace = swap.nest(this.addModule('garrisonedFace', H3Bits.Bitmap.Portrait, {
          resting: true,
          id: garrisoned,
        }))
      } else {
        this.unlist('garrisoned')
        var garList = this.addModule('garrison', UI.Bits.GarrisonList, {
          store: this.map.objects.subAtCoords(obj.get('id'), 0, 0, 'garrison', 0),
          sink: {'*': {options: {garrison: obj.get('id')}}},
        })
        garList._store.release()
        swap.nest('town', this.addModule('flag', H3Bits.PlayerFlag, {
          player: this.cx.players.nested(obj.get('owner')),
          size: 58,
          interactiveClass: true,
        }))
      }

      if (visiting) {
        var visList = this.addModule('visiting', UI.Bits.GarrisonList, {
          store: this.map.objects.subAtCoords(visiting, 0, 0, 'garrison', 0),
          sink: {'*': {options: {garrison: visiting}}},
        })
        visList._store.release()
        var visFace = swap.nest(this.addModule('visitingFace', H3Bits.Bitmap.Portrait, {
          resting: true,
          id: visiting,
        }))
      } else {
        this.unlist('visiting')
        swap.nest('gates', this.addModule('gates', H3Bits.DefImage, {
          def: 'TWCRPORT',
          frame: 0,
        }))
      }

      ;[garFace, visFace].forEach(function (face) {
        face && face.el.on('mousedown', function (e) {
          if (e.button == 2) {
            this.get('ui').windows.addModule(UI.Bits.RightPanel.Hero, {
              elClass: 'Hh3-rp_tooltip',
              hero: this.map.representationOf(face.get('id')),
              // XXX=IC SoD shows on the right of the portrait
              tooltipFor: (garFace || this.nested('flag')).el,
              details: this.map.constants.effect.garrisonDetails.full,
            })
          }
        }.bind(this))
      }, this)

      /* Bottom panel - right */
      this.addModule('split', UI.Bits.Button.SplitGarrison, {
        elClass: 'Hh3-btn_id_TSBTNS',
        garrisonLists: [garList].concat(visList || []),
        garrisonIDs: [garrisoned || obj.get('id')].concat(visiting || []),
      })
    },

    // Performs the action associated with a particular building.
    showBuilding: function (building, tooltip) {
      var value = this.cx.oneShotEffectCalculation({
        class: Calculator.Effect.GenericIntArray,
        target: this.map.constants.effect.target.town_buildings,
        ifObject: this.get('town').get('id'),
      })

      if (value.indexOf(building) == -1) {
        return
      }

      // XXX=I auto-cancel windows if building gets deleted
      if (!tooltip) {
        switch (building) {
          case this.rules.buildingsID.marketplace:
            var market = this.get('ui').windows.addModule(UI.Townscape.Marketplace.Trade, {
              withinWindow: this,
              slider: commonTownSlider,
              object: this.get('town').get('id'),
            })
            var mul = this.rules.constants.effect.multiplier
            function update() {
              var rates = {}
              _.each(calcs, function (fc, from) {
                rates[from] = {}
                _.each(fc, function (calc, to) {
                  rates[from][to] = calc.get('value') / mul
                })
              })
              market.set('rate', rates)
            }
            var calcs = {}
            _.each(this.map.constants.resources, function (from) {
              calcs[from] = {}
              _.each(this.map.constants.resources, function (to) {
                var calc = this.cx.listeningEffectCalculator({
                  update: 'defer',
                  target: this.map.constants.effect.target.tradeRate,
                  ifPlayer: this.get('town').get('owner'),
                  ifObject: this.get('town').get('id'),
                  ifResource: from,
                  ifResourceReceive: to,
                })
                calcs[from][to] = calc
                market.autoOff(calc, {}).whenRenders('change_value', update)
              }, this)
            }, this)
            this.autoOff(market, {
              toTransfer: function () {
                var tfer = this.get('ui').windows.addModule(UI.Townscape.Marketplace.Transfer, {
                  withinWindow: this,
                  slider: commonTownSlider,
                  object: this.get('town').get('id'),
                })
                this.autoOff(tfer, {
                  toTrade: function () {
                    this.showBuilding(building)
                    tfer.cancel()
                  },
                })
                market.cancel()
              },
            })
            return market
          case this.rules.buildingsID.mageGuild1:
          case this.rules.buildingsID.mageGuild2:
          case this.rules.buildingsID.mageGuild3:
          case this.rules.buildingsID.mageGuild4:
          case this.rules.buildingsID.mageGuild5:
            // SoD doesn't prompt for buying for garrisoned.
            var hero = this.get('town').get('visiting')
            // XXX=I in SoD it only costs gold; show others in the UI too and make it use calc (artifactCost)
            var cost = this.rules.artifacts.atCoords(this.rules.artifactsID.spellBook, 0, 0, 'cost_gold', 0)
            if (hero && this.map.objects.readSubAtCoords(hero, 0, 0, 'artifacts', 0).atCoords(this.rules.artifactSlotsID.spellBook, 0, 0, 'artifact', 0) == null) {
              var msg = this.pl.get('resources_gold') < cost
                ? 'To cast spells, your hero must first buy a spell book for %d gold.  Unfortunately, you seem to be a little short of cash at the moment.'
                : 'To cast spells, your hero must first buy a spell book for %d gold.  Do you wish to buy one?'
              var book = this.rules.artifactsID.spellBook
              var box = this.get('ui').windows.addModule(H3Bits.MessageBox, {withinWindow: this})
                .addText(this.cx.s('map', msg), cost)
                .addModuleThis(H3Bits.MessageBox.Table, {
                  init: function (table) {
                    table.addModule(H3Bits.MessageBox.Table, {
                      el: {tag: 'tr'},
                      init: function (row) {
                        row.addModule(H3Bits.MessageBox.Table, {
                          el: {tag: 'td'},
                          init: function (cell) {
                            cell.addModule(H3Bits.ArtifactImage, {
                              artifact: book,
                            })
                          },
                        })
                      },
                    })
                    table.addModule(H3Bits.MessageBox.Table, {
                      el: {tag: 'tr'},
                      init: function (row) {
                        row.addModule(H3Bits.MessageBox.Table, {
                          el: {tag: 'td'},
                          init: function (cell) {
                            cell.addModule(H3Bits.DatabankProperty, {
                              elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
                              collection: 'artifacts',
                              entity: book,
                              property: 'name',
                            })
                          },
                        })
                      },
                    })
                  },
                })
              if (this.pl.get('resources_gold') < cost) {
                box.addButton('Hh3-btn_id_IOKAY', 'submit')
              } else {
                var okay = box.addButton('Hh3-btn_id_IOKAY', 'submit')
                box
                  .addButtonThis('Hh3-btn_id_ICANCEL', 'cancel')
                  .once('unnest', function () {
                    if (box.get('button') == okay) {
                      var async = this.sc.rpc.do('buySpellBook', {
                        town: this.get('town').get('id'),
                        hero: hero,
                      })
                      this.autoOff(async, {})
                        .whenSuccess(function () {
                          this.showBuilding(building)
                        }, this)
                    }
                  }, this)
              }
              return
            }
            this.sc.rpc.do('openMageGuild', {
              town: this.get('town').get('id'),
            })
            var win = this.get('ui').windows.addModule(UI.Townscape.MageGuild, {
              withinWindow: this,
              town: this.get('town'),
            })
            return
          case this.rules.buildingsID.blacksmith:
            var hero = this.get('town').get('visiting')
            if (!hero) {
              return this.get('ui').windows.addModule(H3Bits.MessageBox, {withinWindow: this})
                .addText(this.cx.s('map', 'Only visiting heroes may use the Blacksmith.'))
                .addButton()
            }
            // BLDGNEUT.TXT has an entry for providing multiple war machines and
            // we store it as $descriptionM but this isn't implemented since
            // SoD has no town with such a Blacksmith and the UI for that
            // window (war machine factory on map) is very different.
            var type = this.rules.buildings.atCoords(building, 0, 0, 'townTypes', 0)[this.get('town').get('subclass')]
            switch (type) {
              case this.map.constants.building.blacksmith.ballista:
                var artifact = this.rules.artifactsID.ballista
                var creature = this.rules.creaturesID.ballista
                break
              case this.map.constants.building.blacksmith.firstAidTent:
                var artifact = this.rules.artifactsID.firstAidTent
                var creature = this.rules.creaturesID.firstAidTent
                break
              case this.map.constants.building.blacksmith.ammoCart:
                var artifact = this.rules.artifactsID.ammoCart
                var creature = this.rules.creaturesID.ammoCart
            }
            var win = this.get('ui').windows.addModule(UI.Townscape.Blacksmith, {
              withinWindow: this,
              artifact: artifact,
              creature: creature,
              hero: hero,
              cost: {
                target: this.cx.map.constants.effect.target.artifactCost,
                ifObject: this.get('town').get('id'),
                ifBuilding: building,
                ifArtifact: artifact,
              },
            })
            win.on({
              submit: function () {
                if (!win._buyButton.get('disabled')) {
                  var async = win.sc.rpc.do('buyBlacksmith', {
                    town: this.get('town').get('id'),
                    artifact: artifact,
                    hero: hero,
                  })
                  win.autoOff(async, {})
                    .whenSuccess(function () {
                      win.cancel()
                      win.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox)
                        .addText(win.cx.s('map', '%s purchased'), win._name.get('value'))
                        .addButton()
                    })
                }
              },
            }, this)
            win.autoOff(this.get('town'), {'change_subclass, change_visiting': 'cancel'})
            return win
          case this.rules.buildingsID.shipyard:
            var win = this.get('ui').windows.addModule(UI.Townscape.Shipyard, {
              withinWindow: this,
              object: this.get('town').get('id'),
              actor: this.get('town').get('visiting') || this.get('town').get('garrisoned') || null,
              cost: {
                target: this.cx.map.constants.effect.target.shipCost,
                ifObject: this.get('town').get('visiting') || this.get('town').get('garrisoned') || null,
                ifBonusObject: this.get('town').get('id'),
                ifBuilding: building,
              },
            })
            win.autoOff(this.get('town'), {'change_visiting, change_garrisoned': 'cancel'})
            if (this.cx.get('classic') && (win.shipState() == 'ship' || win.shipState() == 'movable')) {
              win.cancel()    // SoD ignores the click
            }
            return
          case this.rules.buildingsID.tavern:
          case this.rules.buildingsID.brotherhoodOfSword:
            var win = this.get('ui').windows.addModule(UI.Townscape.Tavern, {
              withinWindow: this,
              rumor: {
                target: this.cx.map.constants.effect.target.tavernRumor,
                ifPlayer: this.pl.get('player'),
                ifObject: this.get('town').get('garrisoned') || null,
                ifBonusObject: this.get('town').get('id'),
                ifBuilding: building,
              },
              cost: {
                target: this.cx.map.constants.effect.target.tavernCost,
                ifPlayer: this.pl.get('player'),
                ifObject: this.get('town').get('garrisoned') || null,
                ifBonusObject: this.get('town').get('id'),
                ifBuilding: building,
              },
              heroes: {
                target: this.cx.map.constants.effect.target.tavernHeroes,
                ifPlayer: this.pl.get('player'),
                ifObject: this.get('town').get('garrisoned') || null,
                ifBonusObject: this.get('town').get('id'),
                ifBuilding: building,
              },
              occupied: !!this.get('town').get('visiting'),
            })
              .on({
                hire: function (hero) {
                  var async = this.sc.rpc.do('hireHero', {
                    object: this.get('town').get('id'),
                    building: building,
                    byHero: this.get('town').get('garrisoned'),
                    hero: hero.get('id'),
                  })
                  win.autoOff(async, {})
                    .whenSuccess(function () {
                      win.cancel()
                    }, win)
                },
              }, this)
            win.autoOff(this.get('town'), {
              change_visiting: function (now) {
                win.set('occupied', now)
              },
              change_garrisoned: 'cancel',
            })
            return win
          default:
            if (this.rules.hallBuildings.indexOf(building) != -1) {
              return this.get('ui').windows.addModule(UI.Townscape.Hall, {
                withinWindow: this,
                ui: this.get('ui'),
                town: this.get('town'),
              })
                .on({
                  built: function (building) {
                    var el = this.nested('buildings').nested(building).el
                    el.hide().addClass('Hh3-town__building_hover')
                      .fadeIn(function () {
                        if (this._parent) {  // stop(, false) calls our callback
                          this.off(ev)
                          var timer = setTimeout(function () {
                            el.removeClass('Hh3-town__building_hover')
                          }, 1000)
                          this.once('unnest', function () { clearTimeout(timer) })
                        }
                      }.bind(this))
                    var ev = this.once('unnest', function () { el.stop(false, true) })
                  },
                }, this)
            } else if (this.rules.fortBuildings.indexOf(building) != -1) {
              return this.get('ui').windows.addModule(UI.Townscape.Fort, {
                withinWindow: this,
                ui: this.get('ui'),
                town: this.get('town'),
              })
            } else if (this.rules.buildings.atCoords(building, 0, 0, 'produce', 0)) {
              return this.get('ui').showTownHire(this.get('town'), building, this)
            } else {
              var productionUpgrades = _.fromEntries([
                [this.rules.buildingsID.griffinBastion, [
                  this.rules.buildingsID.griffinTower,
                  this.rules.buildingsID.griffinTowerU,
                ]],
                [this.rules.buildingsID.minerGuild, [
                  this.rules.buildingsID.dwarfCottage,
                  this.rules.buildingsID.dwarfCottageU,
                ]],
                [this.rules.buildingsID.dendroidSaplings, [
                  this.rules.buildingsID.dendroidArches,
                  this.rules.buildingsID.dendroidArchesU,
                ]],
                [this.rules.buildingsID.sculptorWings, [
                  this.rules.buildingsID.parapet,
                  this.rules.buildingsID.parapetU,
                ]],
                [this.rules.buildingsID.birthingPools, [
                  this.rules.buildingsID.impCrucible,
                  this.rules.buildingsID.impCrucibleU,
                ]],
                [this.rules.buildingsID.cages, [
                  this.rules.buildingsID.kennels,
                  this.rules.buildingsID.kennelsU,
                ]],
                [this.rules.buildingsID.unearthedGraves, [
                  this.rules.buildingsID.cursedTemple,
                  this.rules.buildingsID.cursedTempleU,
                ]],
                [this.rules.buildingsID.mushroomRings, [
                  this.rules.buildingsID.warren,
                  this.rules.buildingsID.warrenU,
                ]],
                [this.rules.buildingsID.messHall, [
                  this.rules.buildingsID.goblinBarracks,
                  this.rules.buildingsID.goblinBarracksU,
                ]],
                [this.rules.buildingsID.captainQuarters, [
                  this.rules.buildingsID.gnollHut,
                  this.rules.buildingsID.gnollHutU,
                ]],
                [this.rules.buildingsID.gardenOfLife, [
                  this.rules.buildingsID.magicLantern,
                  this.rules.buildingsID.magicLanternU,
                ]],
              ])
              var producing = productionUpgrades[building]
              var found = _.some(producing || [], function (building) {
                if (_.includes(value, building)) {
                  this.get('ui').showTownHire(this.get('town'), building, this)
                  return true
                }
              }, this)
              if (found) { return }
            }
        }
      }

      var box = this.get('ui').windows.addModule(H3Bits.MessageBox, {
        tooltip: tooltip,
      })
      box.addText('Hh3-menu__text9 Hh3-menu__text_toned', this.rules.buildings.atCoords(building, 0, 0, 'name', 0))
      box.addModule(Bits.String, {
        elClass: 'Hh3-menu__text11 Hh3-menu__text_toned',
        format: '%d',
      })
        .addCalculator('d', Rules.TownBuildingDescription, {
          id: this.get('town').get('id'),
          building: building,
        })
      box.addModule(H3Bits.DefImage.Calculator, {
        class: Rules.BuildingU.Image,
        id: this.get('town').get('id'),
        building: building,
      })
      box.addText('Hh3-menu__text3 Hh3-menu__text_toned', this.rules.buildings.atCoords(building, 0, 0, 'name', 0))
      tooltip || box.addButton()

      // XXX=I for producing buildings and production upgrades SoD shows a different box with the creature's animation, cost and available count
    },
  })

  // Town's screen with list of creatures for hire.
  UI.Townscape.Fort = H3Bits.Window.extend('HeroWO.H3.DOM.UI.Townscape.Fort', {
    el: {class: 'Hh3-fort'},

    _opt: {
      fullScreen: true,
      ui: null,    // do not set
      town: null,  // do not set
    },

    events: {
      submit: 'cancel',

      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-fort__*'}}})
        var obj = this.get('town')

        var bk = this.addModule('bk', H3Bits.Bitmap)

        this.addModule('name', Bits.String, {
          elClass: 'Hh3-menu__text10 Hh3-menu__text_toned',
          format: '%n',
        })
          .addCalculator('n', Rules.TownBuildingProperty, {
            id: obj.get('id'),
            buildings: this.rules.fortBuildings,
          })

        this.addModule('buildings', H3Bits.FortBuildingList, {
          town: obj,
          potential: true,
          elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
          sink: {'*': {elClass: 'Hh3-fort__building', sink: {'*': {elClass: 'Hh3-fort__b-*'}}}},
        })
          .on({
            '.clicked, .showTooltip': function (child) {
              this.get('ui').showTownHire(this.get('town'), child.get('id'), this)
            },
          }, this)
          .whenRenders(function () {
            bk.set('file', 'TPCASTL' + Math.max(this.length, 7))   // TPCASTL7/8
          })

        addCommonStatusBarModules(this, 'Hh3-', 'Hh3-bmp_id_KRESBAR')

        this.addModule('close', UI.Bits.Button.Close, {
          elClass: 'Hh3-btn_id_TPMAGE1',
        })
          .on('clicked', 'cancel', this)
      },
    },
  })

  // Town's screen with list of buildings for construction.
  UI.Townscape.Hall = H3Bits.Window.extend('HeroWO.H3.DOM.UI.Townscape.Hall', {
    el: {class: 'Hh3-hall'},

    _opt: {
      fullScreen: true,
      ui: null,    // do not set
      town: null,  // do not set
    },

    events: {
      submit: 'cancel',

      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-hall__*'}}})
        var obj = this.get('town')

        var bk = this.addModule('bk', H3Bits.Bitmap)

        // XXX=R,I review all places where classic is accessed and add listening to change_classic (possibly after/together with #clsi)
        if (this.cx.get('classic')) {
          $('<div class="Hh3-hall__name Hh3-menu__text10 Hh3-menu__text_toned">')
            .text(this.cx.s('map', 'Hall'))
            .appendTo(this.el)
        } else {
          this.addModule('name', Bits.String, {
            elClass: 'Hh3-menu__text10 Hh3-menu__text_toned',
            format: '%n',
          })
            .addCalculator('n', Rules.TownBuildingProperty, {
              id: obj.get('id'),
              buildings: this.rules.hallBuildings,
            })
        }

        this.addModule('buildings', H3Bits.HallBuildingList, {
          town: obj,
          elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
          sink: {'*': {elClass: 'Hh3-hall__building', sink: {'*': {elClass: 'Hh3-hall__b-*'}}}},
        })
          .on({
            '.clicked': function (building) {
              var win = this.get('ui').windows.addModule(UI.Townscape.Construct, {
                ui: this.get('ui'),
                town: this.get('town'),
                building: building.get('id'),
              })
              this.autoOff(win, {
                built: function () {
                  win.cancel()
                  this.cancel()
                  this.built(building.get('id'))
                },
              })
            },
            '.showTooltip': function (building) {
              this.get('ui').windows.addModule(UI.Townscape.Construct, {
                tooltip: true,
                ui: this.get('ui'),
                town: this.get('town'),
                building: building.get('id'),
                buttons: false,
              })
            },
          }, this)
          .whenRenders(function () {
            var subclass = obj.get('subclass')
            Common.oneClass(this.el, 'Hh3-hall_t_', _.indexOf(this.rules.townsID, subclass))
            // XXX=RH
            var backgrounds = ['TPTHBKCS', 'TPTHBKRM', 'TPTHBKTW', 'TPTHBKIN',
                               // TPTHBKST is missing one box, using TPTHBKTW instead.
                               'TPTHBKNC', 'TPTHBKDG', 'TPTHBKTW', 'TPTHBKFR',
                               // XXX=ID same as Conflux (TPTHBKEL) but we don't have Complete version's resources yet so using that one
                               'TPTHBKFR']
            bk.set('file', backgrounds[subclass])
          }, this)

        addCommonStatusBarModules(this, 'Hh3-', 'Hh3-bmp_id_KRESBAR')

        this.addModule('close', UI.Bits.Button.Close, {
          elClass: 'Hh3-btn_id_TPMAGE1',
        })
          .on('clicked', 'cancel', this)
      },
    },

    // function (Building->$id)
    // Called when user clicks on a building to erect it.
    built: Common.stub,
  })

  // Town Hall's dialog shown when confirming construction of a new building.
  UI.Townscape.Construct = H3Bits.Window.extend('HeroWO.H3.DOM.UI.Townscape.Construct', {
    el: {class: 'Hh3-construct Hh3-bmp_id_TPUBUILD'},

    _opt: {
      ui: null,    // do not set
      town: null,  // do not set
      building: 0,
      buttons: true,
    },

    events: {
      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-construct__*'}}})
        var obj = this.get('town')

        this.addModule('name', Bits.String, {
          elClass: 'Hh3-menu__text2 Hh3-menu__text_toned',
          format: this.cx.s('map', 'Build %n'),
        })
          .addModule('n', H3Bits.DatabankProperty, {
            el: false,
            collection: 'buildings',
            entity: this.get('building'),
            property: 'name',
          })

        this.addModule('face', H3Bits.DefImage.Calculator, {
          class: Rules.BuildingU.Image,
          id: this.get('town').get('id'),
          building: this.get('building'),
        })

        this.addModule('desc', Bits.String, {
          elClass: 'Hh3-menu__text6 Hh3-menu__text_toned',
          format: this.cx.s('map', '%d'),
        })
          .addCalculator('d', Rules.TownBuildingDescription, {
            id: this.get('town').get('id'),
            building: this.get('building'),
          })

        this.addModule('req', Bits.String, {
          elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
          format: this.cx.s('map', '%r'),
        })
          .addCalculator('r', Rules.TownBuildingRequirements, {
            id: this.get('town').get('id'),
            building: this.get('building'),
          })

        this.addModule('cost', H3Bits.ResourceList.EntityCost, {
          elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
          sink: {'*': {elClass: 'Hh3-construct__res', options: {icon: 'RESOURCE'}}},
          target: this.cx.map.constants.effect.target.town_buildingCost,
          ifObject: this.get('town').get('id'),
          ifBuilding: this.get('building'),
        })

        if (this.get('buttons')) {
          var ok = this.addModule('ok', UI.Bits.Button.Close, {
            elClass: 'Hh3-btn_id_IBUY30',
          })
          ok.on('clicked', 'build', this)

          var req = this.cx.calculator(Rules.TownBuildingState, {
            player: this.pl,
            id: this.get('town').get('id'),
            building: this.get('building'),
          })
          this.autoOff(req, {}).whenRenders('change_value', function () {
            ok.set('disabled', req.get('value') != 'able')
          })

          this.addModule('close', UI.Bits.Button.Close, {
            elClass: 'Hh3-btn_id_ICANCEL',
          })
            .on('clicked', 'cancel', this)
        }
      },

      submit: 'build',
    },

    built: function () {
      var audio = this.sc.get('audio')
      audio && audio.playIfEnabled('BUILDTWN', 'sfx', '')
    },

    build: function () {
      if (!this.nested('ok').get('disabled')) {
        var async = this.sc.rpc.do('townBuild', {
          town: this.get('town').get('id'),
          building: this.get('building'),
        })
        this.autoOff(async, {}).whenSuccess(Common.ef('built'), this)
      }
    },
  })

  // Generic dialog shown when hiring one or multiple creatures from a standalone dwelling on adventure map.
  UI.HireCreature = H3Bits.Window.extend('HeroWO.H3.DOM.UI.HireCreature', {
    el: {class: 'Hh3-hire Hh3-bmp_id_TPRCRT'},
    _slider: null,
    _available: null,
    _hire: null,
    _cost: null,
    _total: null,
    _maxButton: null,
    _hireButton: null,
    _images: null,

    _opt: {
      creatures: [],  // array of IDs; can set; must be non-empty; may duplicate; order is preserved
      resources: null,  // {resource ID: 123, ...} of current player or null for unlimited
      available: 0,
      hire: 0,
      cost: null,   // options for EntityCost
      //slider: {...},    - for constructor; null to not create Slider
    },

    events: {
      // -init because need _slider created before change_available/hire.
      '-init': function (opt) {
        if (opt.slider) {
          this._slider = new Slider(opt.slider)
        }
      },

      '+normalize_creatures': function (res, now) {
        var seen = []
        var clean = []
        now.forEach(function (id) { seen[id] || (seen[id] = (clean.push(+id), 1)) })
        return clean.join() == this.get('creatures').join()
          ? this.get('creatures') : clean
      },

      '+normalize_resources': function (res, now) {
        var old = this.get('resources')
        return _.entries(now || [-1]).join() == (old || '0,-1') ? old : now
      },

      '+normalize_available': Common.normIntOr(0),

      '+normalize_hire': function (res, now) {
        var max = this.get('available')
        var resources = this.get('resources')
        if (resources && this._cost) {
          var afford = _.min(_.map(this.costPer(1), function (price, resource) {
            return price ? Math.floor((resources[+resource] || 0) / price) : Infinity
          }))
          if (max > afford) { max = afford }
        }
        return Common.clamp(now, 0, max) || 0
      },

      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-hire__*'}}})

        var name = this.addModule('name', Bits.String, {
          elClass: 'Hh3-menu__text2 Hh3-menu__text_toned',
          format: this.cx.s('map', 'Recruit %n'),
        })
          .addModule('n', H3Bits.DatabankProperty, {
            el: false,
            collection: 'creatures',
            property: 'namePlural',
          })

        this._total = this.addModule('total', H3Bits.ResourceList, {
          elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
          sink: {'*': {elClass: 'Hh3-hire__res', options: {icon: 'RESOURCE'}}},
        })

        this._maxButton = this.addModule('max', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_IRCBTNS'})
          .on({
            clicked: function () {
              this.set('hire', this.get('available'))
            },
          }, this)

        this._hireButton = this.addModule('hire', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_IBY6432'})
          .on({clicked: 'submit'}, this)

        this.addModule('close', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_ICN6432'})
          .on({clicked: 'cancel'}, this)

        this._images = this.addModule('faces', H3Bits.CreatureImageList)
          .on({
            '.clicked': function (child) {
              if (!child.ifSet('highlight', true)) {
                this.sc.modules.nested('HeroWO.H3.DOM.UI').showCreatureInfo({
                  creature: child.get('creature'),
                })
              }
            },
            '.showTooltip': function (child) {
              this.sc.modules.nested('HeroWO.H3.DOM.UI').showCreatureInfo({
                tooltip: true,
                creature: child.get('creature'),
                closeButton: false,
                animated: false,
              })
            },
            change_highlighted: function (now) {
              if (now) {
                this._cost && this._cost.remove()
                // XXX=IC: huig: put Gold first in classic (implement in EntityCost?)
                this._cost = this.addModule('cost', H3Bits.ResourceList.EntityCost, _.extend({
                  sink: {'*': {elClass: 'Hh3-hire__res', options: {icon: 'RESOURCE'}}},
                  elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
                  ifCreature: now.get('creature'),
                }, this.get('cost')))
                this._cost.whenRenders(this.update, this)
                // SoD resets "Recruit" # when switched.
                this.set('hire', 0)
                name.set('entity', now.get('creature'))
                //this.update()   // update _cost and _total; no need to thanks to whenRenders()
              }
            },
          }, this)
      },

      '-render': function () {
        this._available = $('<div class="Hh3-hire__av Hh3-menu__text3 Hh3-menu__text_toned">').appendTo(this.el)
        this._hire = $('<div class="Hh3-hire__cur Hh3-menu__text3 Hh3-menu__text_toned">').appendTo(this.el)

        this.el.append(
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-hire__t-av">' + this.cx.s('map', 'Available') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-hire__t-cur">' + this.cx.s('map', 'Recruit') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-hire__t-cost">' + this.cx.s('map', 'Cost Per Troop') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-hire__t-total">' + this.cx.s('map', 'Total Cost') + '</div>'
        )
      },

      change_resources: function () {
        this.getSet('hire')
      },

      change_available: function (now) {
        this._slider && this._slider.set('max', now || NaN)
        this.getSet('hire')
        this.update()
      },

      change_hire: function (now) {
        this._slider && this._slider.set('position', now)
        this.update()
      },

      change_creatures: 'populate',

      render: function () {
        this.autoOff(this._slider, {
          change_position: function (now) {
            this.set('hire', now)
          },
        })
          .attach(this.el).render()

        this.populate()
      },

      _update: function () {
        var available = this.get('available')
        var count = this.get('hire')
        Common.oneClass(this.el, 'Hh3-hire_av_', available ? 'yes' : 'no')
        this._available.text(available - count)
        this._maxButton.set('disabled', !available || (!this.cx.get('classic') && count >= available))
        this._hire.text(count)
        this._hireButton.set('disabled', !count)

        if (this._cost) {
          this.getSet('hire')   // clamp
          function toOpt(item) {
            return {resource: item[0], count: item[1]}
          }
          var cost = _.map(_.entries(this.costPer(1)), toOpt)
          this._cost.assignChildren(cost, {eqFunc: 'resource'})
          var cost = _.map(_.entries(this.costPer(count)), toOpt)
          this._total.assignChildren(cost, {eqFunc: 'resource'})
        }
      },

      '-unnest': function () {
        this._parent && this._slider.remove()
      },
    },

    creature: function () {
      var hl = this._images.get('highlighted')
      return hl && hl.get('creature')
    },

    populate: function () {
      if (this.get('rendered')) {
        var list = this.get('creatures').map(function (id) { return {creature: id} })
        this._images.assignChildren(list, {
          eqFunc: 'creature',
          posFunc: function (cr) {
            return 9999 - this.rules.creatures.atCoords(cr, 0, 0, 'level', 0) << 16 | cr.get('creature')
          },
        })
      }
    },

    // Calculates how much and which resources the selected number of creature costs in total.
    //
    // Returns only entries for resources that current creature costs. That is,
    // even if count is 0 if creature costs gold then {ID of gold: 0} is returned.
    costPer: function (count) {
      var cost = {}
      this._cost.each(function (res) {
        if (res.get('count')) {
          cost[res.get('resource')] = res.get('count') * count
        }
      })
      return cost
    },
  })

  // Dialog shown when hiring creatures from a town.
  UI.HireCreature.Building = UI.HireCreature.extend('HeroWO.H3.DOM.UI.HireCreature.Building', {
    _calc: null,

    _opt: {
      town: null,  // do not set
      building: 0, // do not set
    },

    events: {
      '-init': function (opt) {
        this._calc = opt.calc.take()
        opt.slider = commonTownSlider
      },

      '-attach': function () {
        this.set('cost', {
          target: this.cx.map.constants.effect.target.creature_cost,
          ifObject: this.get('town').get('id'),
          ifBuilding: this.get('building'),
        })
      },

      attach: function () {
        this.autoOff(this._calc, {}).whenRenders('change_value', function () {
          this.set('creatures', _.sortBy(this._calc.get('value'), function (cr) {
            return -1 * this.rules.creatures.atCoords(cr, 0, 0, 'level', 0)
          }, this))
        }, this)
        this._calc.release()

        function update(name, now) {
          var resource = name.match(/^resources_(.+)$/)
          if (resource) {
            this.getSet('resources', function (cur) {
              cur = _.extend({}, cur)
              cur[this.rules.constants.resources[resource[1]]] = now
              return cur
            })
          }
        }
        this.autoOff(this.pl, {change: update})
        _.each(this.pl.get(), Common.m(update, '21', this))

        var sub = this.map.objects.subAtCoords(this.get('town').get('id'), 0, 0, 'available', 0)
        var n = sub.toContiguous(this.get('building'), 0, 0, 0)
        this.autoOff(sub, ['ochange_n_' + n, function ($1, $2, $3, now) { this.set('available', now) }])
        this.once('unnest', 'release', sub)
        this.set('available', sub.atContiguous(n, 0))
      },

      submit: function () {
        if (this.get('hire') > 0) {
          var sub = this.map.objects.readSubAtCoords(this.get('town').get('garrisoned') || this.get('town').get('id'), 0, 0, 'garrison', 0)
          var slot = 0
          // XXX=RH
          while (slot < 7 && slot < sub.size().x && sub.anyAtCoords(slot, 0, 0, 0) && sub.atCoords(slot, 0, 0, 'creature', 0) != this.creature()) {
            slot++
          }
          if (slot >= 7) {
            this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox)
              // GENRLTXT.TXT[18]
              .addText(this.cx.s('map', 'There is no room in the garrison for this army.'))
              .addButton()
          } else {
            this.sc.rpc.do('hireDwelling', {
              town: this.get('town').get('id'),
              building: this.get('building'),
              creature: this.creature(),
              count: this.get('hire'),
            })

            this.cancel()
            return true
          }
        }
      },
    },
  })

  // Small info window with basic creature stats (count, attack, bufs, etc.).
  //
  // Shown on combat creature right-click, hero info/trade dialog's garrison's double click, dwelling hire dialog's creature list's right-click, etc.
  //
  // Depending on context, allows actions like dismissing (removing creature) and upgrading (in town with an improved dwelling).
  UI.CreatureInfo = H3Bits.Window.extend('HeroWO.H3.DOM.UI.CreatureInfo', {
    el: {class: 'Hh3-ci Hh3-bmp_id_CRSTKPU'},
    _count: null,

    _opt: {
      creature: 0,    // Creature->$id; do not set
      count: null,  // null - hide count, integer - show this (can be 0)
      garrison: null, // null - not part of garrison, else AObject->$id with 'garrison'; do not set; enables attack/defense/speed, morale/luck (on ADVMAP if no combatCreature)
      garrisonSlot: null, // non-null - enable automatic 'count' update, cancel() on slot creature ochange/oremove, 'dismissButton' operation (sync) and visibility (both only if dismissButton == null)
      combatCreature: null,   // [combat key, creature key]; do not set; enables shots, HP, bufs, in-combat attack/defense/speed, morale/luck; if garrison is set, it must match owner of combatCreature
      closeButton: true,  // do not set
      dismissButton: null, // can set; null == false if garrisonSlot is null
      animated: true,
    },

    events: {
      submit: 'cancel',

      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-ci__*'}}})
        this.el.addClass('Hh3-ci_shooting_' + (this.rules.creatures.atCoords(this.get('creature'), 0, 0, 'shooting', 0) ? 'yes' : 'no'))
        var garrison = this.get('garrison')
        var combatCreature = this.get('combatCreature')

        if (combatCreature) {
          combatCreature[2] = this.map.combats.nested(combatCreature[0]).objects.nested(combatCreature[1])

          this.el.addClass('Hh3-ci_combat')

          this.addModule('hitPointsLeft', Bits.ObjectRepresentationProperty, {
            elClass: 'Hh3-menu__text3 Hh3-menu__text_toned Hh3-ci__stat',
            object: combatCreature[2],
            property: 'hitPoints',
          })

          this.addModule('bufs', H3Bits.SpellAffectorList, {
            combat: combatCreature[0],
            creature: combatCreature[1],
          })
        }

        this.addModule('name', H3Bits.DatabankProperty, {
          elClass: 'Hh3-menu__text9',
          collection: 'creatures',
          entity: this.get('creature'),
        })

        // XXX=C in combat, SoD shows in brackets attack/defense adjusted by hero stats and terrain info (+1 for creatures native to combat terrain); need to research other bonuses and implement showing them
        var stats = {
          attack: this.map.constants.effect.target.creature_attack,
          defense: this.map.constants.effect.target.creature_defense,
          shots: null,
          speed: this.map.constants.effect.target.creature_speed,
        }
        _.each(stats, function (target, property) {
          var str = this.addModule(property, Bits.String, {
            elClass: 'Hh3-menu__text3 Hh3-menu__text_toned Hh3-ci__stat',
          })
          str.fuse('+normalize_value', function () {
            // Can't use var actual = addCalculator() below because it may get
            // calculated and str.update() called before addCalculator() returns
            // and assignment happens.
            var actual = str._calcs['act']
            var move = str._calcs['move']
            var bank = str.nested('db').get('value') + ''
            if (target == null &&
                str.nested('act') && str.nested('act').get('value') > 9000) {
              // 9999 is commonly used in HeroWO to make creature_shots effectively infinite.
              return this.cx.get('classic') ? 24 : this.cx.s('map', '∞')
            }
            // Walls and arrow towers with unset stats.
            var act = actual && actual.get('value') != null ? actual.get('value') + '' : ''
            move = move ? move.get('value') == act ? '' : (act == bank ? '' : ', ') + move.get('value') + 'C' : ''
            // 123(123) -> 123
            act == bank && (act = '')
            // 123() -> 123
            act = act == '' && !move ? '' : '(' + act + move + ')'
            return bank + act
          })
          str.addModule('db', H3Bits.DatabankProperty, {
            el: false,
            collection: 'creatures',
            entity: this.get('creature'),
            property: property,
          })
          if (target == null) {
            if (combatCreature) {
              str.addModule('act', Bits.ObjectRepresentationProperty, {
                el: false,
                object: combatCreature[2],
                property: 'shots',
              })
            }
          } else if (garrison || combatCreature) {
            str.addCalculator('act', {
              target: target,
              ifObject: combatCreature ? undefined : garrison,
              ifCombat: combatCreature ? combatCreature[0] : undefined,
              ifCombatCreature: combatCreature ? combatCreature[1] : undefined,
              ifCreature: this.get('creature'),
            })
            if (target == this.map.constants.effect.target.creature_speed && combatCreature) {
              str.addCalculator('move', {
                target: this.map.constants.effect.target.creature_moveDistance,
                ifCombat: combatCreature[0],
                ifCombatCreature: combatCreature[1],
              })
            }
          }
        }, this)

        this.addModule('hitPoints', Bits.String, {
          elClass: 'Hh3-menu__text3 Hh3-menu__text_toned Hh3-ci__stat',
          format: '%h',
        })
          .addModule('h', H3Bits.DatabankProperty, {
            el: false,
            collection: 'creatures',
            entity: this.get('creature'),
            property: 'hitPoints',
          })

        var damage = this.addModule('damage', Bits.String, {
          elClass: 'Hh3-menu__text3 Hh3-menu__text_toned Hh3-ci__stat',
          format: this.cx.s('map', '%l - %h'),
        })
        damage.fuse('+normalize_value', function () {
          var low = damage.nested('l')
          var high = damage.nested('h')
          if (low && high && low.get('value') == high.get('value')) {
            return low.get('value')     // 20-20 -> 20
          }
        })
        damage.addModule('l', H3Bits.DatabankProperty, {
          el: false,
          collection: 'creatures',
          entity: this.get('creature'),
          property: 'damageMin',
        })
        damage.addModule('h', H3Bits.DatabankProperty, {
          el: false,
          collection: 'creatures',
          entity: this.get('creature'),
          property: 'damageMax',
        })

        this.el.append(
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-ci__l Hh3-ci__l_s_attack">' + this.cx.s('map', 'Attack Skill') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-ci__l Hh3-ci__l_s_defense">' + this.cx.s('map', 'Defense Skill') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-ci__l Hh3-ci__l_s_shots">' + this.cx.s('map', 'Shots') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-ci__l Hh3-ci__l_s_damage">' + this.cx.s('map', 'Damage') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-ci__l Hh3-ci__l_s_hitPoints">' + this.cx.s('map', 'Health') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-ci__l Hh3-ci__l_s_hitPointsLeft">' + this.cx.s('map', 'Health Left') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-ci__l Hh3-ci__l_s_speed">' + this.cx.s('map', 'Speed') + '</div>'
        )

        if (this.get('animated')) {
          this.addModule('face', H3Bits.CreatureOnBackground, {
            creature: this.get('creature'),
          })
        } else {
          this.addModule('face', H3Bits.CreatureOnBackground, {
            creature: this.get('creature'),
            type: 'animation',
            group: this.map.constants.animation.group.stand,
            frame: this.cx.get('classic') ? 0 : null,
          })
        }

        if (garrison || combatCreature || !this.cx.get('classic')) {
          this.addModule('luck', H3Bits.Luck, {
            size: 42,
            ifObject: combatCreature ? undefined : garrison,
            ifCombat: combatCreature ? combatCreature[0] : undefined,
            ifCombatCreature: combatCreature ? combatCreature[1] : undefined,
            ifCreature: this.get('creature'),
          })

          this.addModule('morale', H3Bits.Morale, {
            size: 42,
            ifObject: combatCreature ? undefined : garrison,
            ifCombat: combatCreature ? combatCreature[0] : undefined,
            ifCombatCreature: combatCreature ? combatCreature[1] : undefined,
            ifCreature: this.get('creature'),
          })
        }

        if (this.get('closeButton')) {
          this.addModule('close', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_IOKAY'})
            .on({clicked: 'cancel'}, this)
        }

        this.addModule('dismiss', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_IVIEWCR2'})
          .on({clicked: 'dismiss'}, this)

        this.addModule('upgrade', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_IVIEWCR'})
          .on({clicked: 'upgrade'}, this)

        this.addModule('abilities', H3Bits.DatabankProperty, {
          elClass: 'Hh3-menu__text3',
          collection: 'creatures',
          entity: this.get('creature'),
          property: 'abilityText',
        })

        if (this.get('garrisonSlot') != null) {
          this.el.addClass('Hh3-ci_garrisoned')
          this._attachGarrison()
        }
      },

      '-render': function () {
        this._count = $('<div class="Hh3-ci__count Hh3-menu__text7">')
          .appendTo(this.el)
      },

      change_count: 'update',
      change_dismissButton: 'update',

      _update: function () {
        this._count.text(this.get('count'))
        this._count.toggle(this.get('count') != null)

        this.nested('name').set('property', this.get('count') == 1 ? 'nameSingular' : 'namePlural')

        this.nested('dismiss').el.toggle(this.get('dismissButton'))
        this.nested('upgrade').el.toggle(this.get('dismissButton'))
        this.nested('abilities').el.toggle(!this.get('dismissButton'))
      },
    },

    dismiss: Common.stub,
    upgrade: Common.stub,

    _attachGarrison: function () {
      var gar = this.get('garrison')
      var sub = this.map.objects.subAtCoords(gar, 0, 0, 'garrison', 0)
      var n = sub.toContiguous(this.get('garrisonSlot'), 0, 0, 0)

      this.autoOff(sub, [
        'oremove_n_' + n,
        'cancel',
        'ochange_n_' + n,
        function ($1, $2, prop, now) {
          switch (prop) {
            case sub.propertyIndex('creature'):
              return this.cancel()
            case sub.propertyIndex('count'):
              return this.set('count', now)
          }
        },
      ])

      this.once('unnest', 'release', sub)
      this.set('count', sub.atCoords(this.get('garrisonSlot'), 0, 0, 'count', 0))

      if (this.get('dismissButton') == null) {
        // SoD displays the dismiss and upgrade buttons if any of this is true:
        // 1. The creature is not part of a hero's garrison.
        // 2. The hero's garrison has more than one creature.
        // If it's displayed, the ability info text is hidden.
        if (this.map.objects.atCoords(gar, 0, 0, 'type', 0) == this.map.constants.object.type.hero) {
          function update() {
            this.set('dismissButton', sub.countObjects(false, 2) > 1)
          }
          this.autoOff(sub, {'oadd, oremove': update})
          update.call(this)
        } else {
          this.set('dismissButton', true)
        }

        this.on('dismiss', function () {
          var box = this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox)
            .addText(this.cx.s('map', 'Are you sure you want to dismiss this army?'))
          var okay = box.addButton('Hh3-btn_id_IOKAY', 'submit')
          box.addButtonThis('Hh3-btn_id_ICANCEL', 'cancel')
            .once('unnest', function () {
              if (box.get('button') == okay) {
                this.sc.rpc.do('dismissCreature', {
                  object: gar,
                  slot: this.get('garrisonSlot'),
                  creature: this.get('creature'),
                  count: this.get('count'),
                })
              }
            }, this)
        })

        // XXX=R refactor upgraded creature forms into a Rules Calculator
        var updateCollection = function () {
          var found = this.cx.get('classic')
            ? _.some(col.members(), function (m) { return m.cost.affordedBy(this.pl) }, this)
            : col.get('list').length
          // SoD shows the button if a building that can upgrade a creature exists, and disables it if player has no funds (we keep it enabled so that he can see the missing amount in the message box).
          this.nested('upgrade').el.css('visibility', col.get('list').length ? '' : 'hidden')
          this.nested('upgrade').set('disabled', !found)
        }.bind(this)

        var col = new Effects.Collection

        this.on('-unnest', function () {
          this._parent && col.remove()
        })

        this.on('change_count', function (now) {
          _.invoke(_.pluck(col.members(), 'cost'), 'set', 'multiplier', now)
        })

        col.fuse('change_list', updateCollection)

        col.fuse('+readyMember', function (res, cr) {
          res.cost = this.sc.addModule('cost', H3Bits.ResourceList.EntityCost, {
            elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
            sink: {'*': {options: {icon: 'RESOUR82'}}},
            multiplier: this.get('count'),
            target: this.cx.map.constants.effect.target.creature_costUpgrade,
            ifObject: gar,
            ifCreature: this.get('creature'),
            ifTargetCreature: cr,
          })

          res.cost.el.hide()
          res.off.push([res.cost, res.cost.on('.change_count', updateCollection)])
        }, this)

        col.fuse('removeMember', function (member) {
          member.cost.remove()
        })

        // Call once members() reflects new added members.
        col.fuse('_doBatchObjects', updateCollection)

        col.bindCalculator(this.cx.listeningEffectCalculator({
          class: Calculator.Effect.GenericIntArray,
          update: 'defer',
          target: this.map.constants.effect.target.creature_upgradeCan,
          ifCreature: this.get('creature'),
          ifObject: gar,
        }))

        this.on('upgrade', function () {
          var to = col.get('list').sort()
          switch (to.length) {
            case 0:
              return this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox)
                .addText(this.rules.cx.s('map', 'This creature can\'t be upgraded.'))
                .addButton()
            case 1:
              return upgradeTo(to[0])
            default:
              var box = this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox)
              to = to.map(function (cr) {
                return {creature: cr, face: {class: H3Bits.CreatureImage, creature: cr, type: 'large'}, name: this.rules.creatures.atCoords(cr, 0, 0, this.get('count') == 1 ? 'nameSingular' : 'namePlural', 0)}
              }, this)
              box.addSelectableWithButtons().assignChildren(to)
              box.addButton('Hh3-btn_id_ICANCEL', 'cancel')
              box.once('unnest', function () {
                if (box.get('selected')) {
                  upgradeTo(box.get('selected').get('creature'))
                }
              })
          }
        })

        var upgradeTo = function (cr) {
          var cost = col.member(cr).cost

          var box = this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox)
          box.el.addClass('Hh3-ci__upg')
          var affords = cost.affordedBy(this.pl)
          affords
            ? box.addText(this.cx.s('mao', 'In order to properly train your troops, you will have to spend some gold. Do you still wish them to be upgraded?'))
            : box.addText(this.cx.s('map', 'In order to properly train your troops, you will have to spend some gold. Unfortunately, your treasury lacks the necessary resources at the moment.'))
          cost.el.appendTo(box.el).show()
          var okay = box.addButton('Hh3-btn_id_IOKAY', 'submit')
          affords && box.addButton('Hh3-btn_id_ICANCEL', 'cancel')
          box.once('unnest', function () {
            cost.el.hide()
            if (affords && box.get('button') == okay) {
              this.sc.rpc.do('upgradeCreature', {
                object: gar,
                slot: this.get('garrisonSlot'),
                upgraded: cr,
              })
            }
          }, this)
        }.bind(this)
      }
    },
  })

  // Allows buying a single war machine (like Ammo Cart) from a town's Blacksmith (on-map Blacksmith is using HireCreature).
  UI.Townscape.Blacksmith = H3Bits.Window.extend('HeroWO.H3.DOM.UI.Townscape.Blacksmith', {
    el: {class: 'Hh3-blks Hh3-bmp_id_TPSMITH'},
    _name: null,
    _buyButton: null,
    _cost: null,

    _opt: {
      artifact: 0,
      creature: 0,
      hero: 0,
      cost: {},
    },

    events: {
      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-blks__*'}}})

        this._name = this.addModule('name', Bits.String, {
          elClass: 'Hh3-menu__text2 Hh3-menu__text_toned',
          format: 'Build a new %n',
        })
          .addModule('n', H3Bits.DatabankProperty, {
            el: false,
            collection: 'creatures',
            entity: this.get('creature'),
            property: 'nameSingular',
          })

        this.addModule('bk', H3Bits.Bitmap, {file: 'TPSMITBK'})

        this.addModule('face', this.cx.get('classic') ? H3Bits.CreatureImage : H3Bits.CreatureAnimation, {
          creature: this.get('creature'),
          type: 'animation',
          group: this.map.constants.animation.group.stand,
          frame: this.cx.get('classic') ? 0 : null,
        })

        this.el.append(
          '<div class="Hh3-menu__text6 Hh3-blks__t-cost">' + this.cx.s('map', 'Resource cost:') + '</div>'
        )

        this._cost = this.addModule('cost', H3Bits.ResourceList.EntityCost, _.extend({
          elClass: 'Hh3-menu__text3',
          sink: {'*': {elClass: 'Hh3-blks__res', options: {icon: 'RESOURCE'}}},
        }, this.get('cost')))
        this._cost.whenRenders(this.update, this)

        this._buyButton = this.addModule('buy', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_IBUY30'})
          .on({clicked: 'submit'}, this)

        this.addModule('close', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_ICANCEL'})
          .on({clicked: 'cancel'}, this)

        this.autoOff(this.pl, {change: 'update'})

        this.autoOff(this.map.objects, ['ochange_n_' + this.map.objects.toContiguous(this.get('hero'), 0, 0, 0), 'update'])
      },

      _update: function () {
        var artifacts = this.map.objects.readSubAtCoords(this.get('hero'), 0, 0, 'artifacts', 0)
        var slots = this.rules.artifacts.atCoords(this.get('artifact'), 0, 0, 'slots', 0)
        var freeSlot = slots.find(function (slot) {
          return artifacts.atCoords(slot, 0, 0, 'artifact', 0) == null
        })

        this._buyButton.set('disabled', !freeSlot || !this._cost.affordedBy(this.pl))
      },
    },
  })

  // Allows building a ship from a town's or on-map Shipyard.
  UI.Townscape.Shipyard = H3Bits.Window.extend('HeroWO.H3.DOM.UI.Townscape.Shipyard', {
    el: {class: 'Hh3-shya Hh3-bmp_id_TPSHIP'},
    _state: null,
    _buyButton: null,
    _cost: null,

    _opt: {
      object: 0,
      actor: 0,
      cost: {},
    },

    events: {
      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-shya__*'}}})

        $('<div>')
          .attr('class', 'Hh3-shya__name Hh3-menu__text2 Hh3-menu__text_toned')
          .text(this.cx.s('map', this.cx.get('classic') ? 'Build A New Ship' : 'Build a New Ship'))
          .appendTo(this.el)

        this.addModule('bk', H3Bits.Bitmap, {file: 'TPSHIPBK'})

        // XXX=IC SoD doesn't draw boat's shadow in this place
        var cls = this.cx.get('classic') ? this.rules.objectsID.boat_1[0] : _.sample(this.rules.objectsID.boat)
        var toClass = function (c) {
          if (!this.cx.get('classic')) {
            c = Common.alterStringifiedArray(c, 3, _.indexOf(this.rules.playersID, this.pl.get('player')) + 'Owner-')
          }
          return Common.alterStringifiedArray(c, 4, this.rules.constants.animation.group.moveRight).replace(/,/g, '')
        }.bind(this)
        $('<div>')
          .attr('class', 'Hh3-shya__face ' +
            toClass(this.rules.classes.atCoords(cls, 0, 0, 'texture', 0)) + ' ' +
            toClass(this.rules.classes.atCoords(cls, 0, 0, 'animation', 0)))
          .appendTo(this.el)

        this.el.append(
          '<div class="Hh3-menu__text6 Hh3-menu__text_toned Hh3-shya__t-cost">' + this.cx.s('map', 'Resource cost:') + '</div>'
        )

        this._cost = this.addModule('cost', H3Bits.ResourceList.EntityCost, _.extend({
          elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
          sink: {'*': {elClass: 'Hh3-shya__res', options: {icon: 'RESOURCE'}}},
        }, this.get('cost')))
        this._cost.whenRenders(this.update, this)
        // SoD puts Gold first (XXX=:huig:).
        this.cx.get('classic') && this._cost.el.children().last().prependTo(this._cost.el)

        this._state = this.updateOn(Rules.ShipState, {
          id: this.get('object'),
        })

        this._buyButton = this.addModule('buy', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_IBUY30'})
          .on({clicked: 'submit'}, this)

        this.addModule('close', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_ICANCEL'})
          .on({clicked: 'cancel'}, this)

        this.autoOff(this.pl, {change: 'update'})
      },

      _update: function () {
        this._buyButton.set('disabled', this._state.get('value') != 'able' || !this._cost.affordedBy(this.pl))
      },

      submit: function () {
        if (!this._buyButton.get('disabled')) {
          var async = this.sc.rpc.do('shipyard', {
            object: this.get('object'),
            actor: this.get('actor'),
          })
          this.autoOff(async, {})
            .whenSuccess(Common.ef('cancel'), this)
        }
      },
    },

    //= one of Rules.ShipState `'value values
    shipState: function () {
      return this._state.get('value')
    },
  })

  // Allows hiring a new hero and read a rumor. For town's and on-map's Tavern.
  UI.Townscape.Tavern = H3Bits.Window.extend('HeroWO.H3.DOM.UI.Townscape.Tavern', {
    el: {class: 'Hh3-tavern Hh3-bmp_id_TPTAVERN'},
    _rumor: null,
    _cost: null,
    _name: null,
    _buyButton: null,

    _opt: {
      rumor: {},
      cost: {},
      heroes: {},
      occupied: false,
      boundHero: null,  // internal
    },

    events: {
      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-tavern__*'}}})

        this.addModule('name', H3Bits.DatabankProperty, {
          elClass: 'Hh3-menu__text2 Hh3-menu__text_toned',
          collection: 'buildings',
          entity: this.rules.buildingsID.tavern,
          property: 'name',
        })

        this.el.append(
          '<div class="Hh3-tavern__anim"></div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-tavern__rumor-w">' +
          '  <div class="Hh3-tavern__t-rumor">' + this.cx.s('map', 'After a generous tip, the barkeep whispers:') + '</div>' +
          '  <div class="Hh3-tavern__rumor"></div>' +
          '</div>' +
          '<div class="Hh3-menu__text2 Hh3-menu__text_toned Hh3-tavern__t-hire">' + this.cx.s('map', 'Heroes for Hire') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-tavern__hire"></div>'
        )

        this._rumor = this.updateOn(Calculator.Effect.GenericString, this.get('rumor'))

        this._name = this.updateOn(Calculator.Effect.GenericString, {
          shared: false,
          target: this.cx.map.constants.effect.target.name,
        })

        this.addModule('heroes', UI.Townscape.Tavern.HeroList, {
          sink: {'*': {options: {large: true}}},
        })
        // Ensuring the hook isn't called during parent removal.
        // Otherwise it may happen that upon this.remove(), tavernRumor is released,
        // its removal triggers updateOn()'s hook calc.unnest => this.remove()
        // (causing reentry) which in turn unlists all children; HeroList is
        // first unnested from this (so nested('heroes') is undefined) and then
        // HeroList's own -unnest runs, which may cause .change_selected (by
        // unlisting own Item) and if .change_selected of this is still bound (such as by using on({}), i.e. fuse()),
        // the hook will be called while this is in a semi-removed state, failing on
        // missing 'heroes'.
        this.autoOff(this.nested('heroes'), {
          '.change_selected': function (now) {
            if (now) {
              createCost()
              this._name.set('ifObject', now.get('object').get('id'))
            } else {
              this.unlist('cost')
            }
            if (now) {
              // Listening to changes to: level, subclass, artifacts.
              var ev = this.map.objects.on('ochange_n_' + this.map.objects.toContiguous(now.get('object').get('id'), 0, 0, 0), 'update', this)
              this.set('boundHero', ev)
            }
            this.update()   // .Hh3-tavern__hire
          },
        })

        var createCost = function () {
          var hero = this.nested('heroes').currentObject()
          if (hero) {
            // This may nest a new module over existing 'cost' child of this, which causes removal of the latter from Screen's modules.
            this._cost = this.addModule('cost', H3Bits.ResourceList.EntityCost, _.extend({
              elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
              // In SoD all heroes cost the same amount of gold only. We allow
              // other resources too but the UI isn't suited for that so if this ends
              // up being used in the wild, it'll have to be updated to be pretty.
              sink: {'*': {elClass: 'Hh3-tavern__res', options: {icon: 'SMALRES'}}},
              ifTavernHero: hero.get('id'),
            }, this.get('cost')))
            this._cost.whenRenders(this.update, this)
          }
        }.bind(this)
        createCost()

        var o = _.extend({class: Calculator.Effect.GenericIntArray, update: 'defer'}, this.get('heroes'))
        var heroCalc = this.autoOff(this.cx.listeningEffectCalculator(o), {})
        heroCalc.whenRenders('change_value', function () {
          var children = []
          _.each(heroCalc.get('value'), function (id, i) {
            if (this.map.objects.atCoords(id, 0, 0, 'owner', 0) === 0) {
              children.push({object: this.map.representationOf(id), pos: i})
            }
          }, this)
          this.nested('heroes').assignChildren(children)
        }, this)

        this._buyButton = this.addModule('buy', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_TPTAV01'})
          .on({clicked: 'submit'}, this)

        this.addModule('close', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_ICANCEL'})
          .on({clicked: 'cancel'}, this)

        this.addModule('thieves', H3Bits.Button, {elClass: 'Hh3-btn_id_TPTAV02 Hh3-btn_dis'})

        // Updating cost.
        this.autoOff(this.pl, {change: 'update'})
        // Updating hero count limit.
        this.autoOff(this.pl.heroes, {'nestExNew, unnested': 'update'})
      },

      '+normalize_occupied': Common.normBool,
      change_occupied: 'update',

      change_boundHero: function (now, old) {
        old && this.map.objects.off(old)
      },

      '-unnest': function () {
        this.set('boundHero', null)
      },

      _update: function () {
        this.$('.Hh3-tavern__rumor').text(this._rumor.get('value'))

        var hero = this.nested('heroes').currentObject()
        this.$('.Hh3-tavern__hire').toggle(!!hero)
        if (hero) {
          var artifacts = 0
          this.map.objects.readSubAtCoords(hero.get('id'), 0, 0, 'artifacts', 0).find(0, function ($1, x) {
            switch (x) {
              // XXX+RH duplicates elsewhere; move "trophy exclusion list" to databank
              case this.rules.artifactSlotsID.warMachine1:
              case this.rules.artifactSlotsID.warMachine2:
              case this.rules.artifactSlotsID.warMachine3:
              case this.rules.artifactSlotsID.warMachine4:
              case this.rules.artifactSlotsID.spellBook:
                return
            }
            artifacts++
          }, this)
          this.$('.Hh3-tavern__hire').text(_.format(this.cx.s('map', '%s is a level %d %s\nwith %d artifacts.'),  // white-space: pre-wrap
            this._name.get('value'),
            hero.get('level') + 1,
            this.rules.heroClasses.atCoords(this.rules.heroes.atCoords(hero.get('subclass'), 0, 0, 'class', 0), 0, 0, 'name', 0),
            artifacts))
        }

        var can = !this.get('occupied') &&
          // XXX=RH move limit to databank
          this.pl.heroes.length < 8 &&
          this.nested('heroes').hasCurrent() &&
          this._cost.affordedBy(this.pl)

        this._buyButton.set('disabled', !can)
      },

      submit: function () {
        if (!this._buyButton.get('disabled')) {
          this.hire(this.nested('heroes').currentObject())
        }
      },
    },

    // function (ObjectRepresentation)
    // Called when user selects a hero for hiring.
    hire: Common.stub,
  })

  // List of heroes available for hire in the Tavern dialog.
  UI.Townscape.Tavern.HeroList = Bits.ObjectList.extend('HeroWO.H3.DOM.UI.Townscape.Tavern.HeroList', {
    _childEvents: ['=showTooltip'],
    _childClass: [UI, 'Bits.HeroList.Item'],

    events: {
      '.=showTooltip': function (child) {
        this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(UI.HeroInfo, {
          tooltip: true,
          hero: child.get('object'),
        })

        if (this.cx.get('classic')) {
          child.set('selected', true)
        }
      },
    },
  })

  // Shows revealed town spells organized by spell level.
  UI.Townscape.MageGuild = H3Bits.Window.extend('HeroWO.H3.DOM.UI.Townscape.MageGuild', {
    el: {class: 'Hh3-mgg Hh3-bmp_id_TPMAGE'},
    _window: null,
    _spells: null,
    _calc: null,
    _counts: [],

    _opt: {
      fullScreen: true,
      town: null,
    },

    events: {
      submit: 'cancel',

      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-mgg__*'}}})
        this._window = this.addModule('win', H3Bits.Bitmap)
        this._spells = this.addModule(Bits.Base)
        this._calc = this.updateOn(Calculator.Effect.GenericIntArray, {
          target: this.cx.map.constants.effect.target.town_spells,
          ifObject: this.get('town').get('id'),
        })

        _.times(5, function (level) { // XXX=RH
          this._counts[++level] = this.updateOn(Calculator.Effect.GenericNumber, {
            target: this.cx.map.constants.effect.target.town_spellCountable,
            ifObject: this.get('town').get('id'),
            ifSpellLevel: level,
          })
        }, this)

        this.autoOff(this.get('town'), {'change_subclass': 'update'})

        addCommonStatusBarModules(this, 'Hh3-', 'Hh3-bmp_id_KRESBAR')

        this.addModule('close', UI.Bits.Button.Close, {
          elClass: 'Hh3-btn_id_TPMAGE1',
        })
          .on('clicked', 'cancel', this)
      },

      _update: function () {
        // XXX=RH
        var windows = ['TPMAGECS', 'TPMAGERM', 'TPMAGETW', 'TPMAGEIN',
                       'TPMAGENC', 'TPMAGEDN', 'TPMAGEST', 'TPMAGEFR', 'TPMAGEEL']
        this._window.set('file', windows[this.get('town').get('subclass')])

        var spells = this._calc.get('value').map(function (id) {
          return {type: 'SCR', spell: id}
        }, this)
        this._spells.assignChildren(spells, {
          eqFunc: 'spell',
          newFunc: function (options) {
            return this.addModule(H3Bits.SpellImage, options)
          },
        })

        var byLevel = [0, 0, 0, 0, 0, 0]  // XXX=RH
        this._spells.each(function (child) {
          var level = this.rules.spells.atCoords(child.get('spell'), 0, 0, 'level', 0)
          child.el.addClass('Hh3-mgg__sp')
          Common.oneClass(child.el, 'Hh3-mgg__sp_',
            'l_' + level,
            'ln_' + ++byLevel[level])
        }, this)

        _.each(this._counts, function (calc, level) {
          var padding = calc.get('value') - byLevel[level]

          while (padding > 0) {
            this._spells.addModule(H3Bits.DefImage, {
              elClass: 'Hh3-mgg__sp Hh3-mgg__sp_ph Hh3-mgg__sp_l_' + level + ' Hh3-mgg__sp_ln_' + padding--,
              def: 'TPMAGES',
              frame: 1,
            })
          }
        }, this)
      },
    },
  })

  // Base dialog for managing player's resources (exchanging, sending to another player, etc.).
  UI.Townscape.Marketplace = H3Bits.Window.extend('HeroWO.H3.DOM.UI.Townscape.Marketplace', {
    _slider: null,

    _opt: {
      give: null,
      take: null,
      amount: 0,
      object: 0,    // for RPC
      haveTraded: false,
    },

    _initToOpt: {
      slider: false,
    },

    events: {
      init: function (opt) {
        this._slider = new Slider(opt.slider)
      },

      submit: 'cancel',

      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-mrk__*', sink: {icon: {elClass: 'Hh3-mrk__res-icon'}}}}})

        this.addModule('name', H3Bits.DatabankProperty, {
          elClass: 'Hh3-menu__text2 Hh3-menu__text_toned',
          collection: 'buildings',
          entity: this.rules.buildingsID.marketplace,
          property: 'name',
        })

        _.each(this.rules.constants.resources, function (res, name) {
          this.addModule('give_' + name, H3Bits.Resource, {
            elClass: 'Hh3-menu__text3 Hh3-menu__text_toned Hh3-mrk__res',
            resource: res,
            count: this.pl.get('resources_' + name),
            icon: 'RESOURCE',
          })
            .el.on('click', function () { this.set('give', res) }.bind(this))
        }, this)

        this.autoOff(this.pl, {
          change: function (name, now) {
            if (_.startsWith(name, 'resources_')) {
              this.getSet('amount')
              this.nested('give_' + name.substr(10)).set('count', now)
            }
          },
        })

        this.addModule('give', H3Bits.Resource, {elClass: 'Hh3-menu__text3 Hh3-menu__text_toned Hh3-mrk__res', icon: 'RESOURCE'})

        this.addModule('max', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_TPMRKB'})
          .on({
            clicked: function () {
              this.set('amount', Infinity)
            },
          }, this)

        this.addModule('trade', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_TPMRKB'})

        this.addModule('close', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_IOK6432'})
          .on({clicked: 'cancel'}, this)
      },

      change_give: function (now, old) {
        if (old != null) {
          this.nested('give_' + _.indexOf(this.rules.constants.resources, old)).el.removeClass('Hh3-mrk__res_hl')
        }

        if (now != null) {
          this.nested('give_' + _.indexOf(this.rules.constants.resources, now))
            .el.addClass('Hh3-mrk__res_hl')
          this.nested('give').set('resource', now)
        }

        this.set('amount', 0)
        this.update()
      },

      '+normalize_amount': function (res, value) {
        return Common.clamp(value, 0, this._slider.get('max') * this.step()) || 0
      },

      '+normalize_haveTraded': Common.normBool,

      change_amount: 'update',
      change_haveTraded: 'update',

      render: function () {
        this.autoOff(this._slider, {
          change_position: function (now) {
            this.set('amount', now * this.step())
          },
        })
          .attach(this.el).render()
      },

      '-unnest': function () {
        this._parent && this._slider.remove()
      },

      _update: function () {
        var max = Math.floor(this.pl.get('resources_' + _.indexOf(this.rules.constants.resources, this.get('give'))) / this.step())
        this._slider.set('max', max || NaN)
        this._slider.set('position', Math.floor(this.get('amount') / this.step()))

        var canTrade = !this._slider.isEmpty() && this.get('take') != null
        Common.oneClass(this.el, 'Hh3-mrk_can_', canTrade ? 'yes' : 'no')

        this.nested('max').set('disabled', !canTrade || (!this.cx.get('classic') && (!this._slider.get('max') || this._slider.get('position') >= this._slider.maxPosition())))
        this.nested('trade').set('disabled', !canTrade || (!this.cx.get('classic') && !this.get('amount')))

        this.nested('give').set('count', this.get('amount'))
      },
    },

    _haveTraded: function () {
      this.assignResp({
        give: null,
        take: null,
        haveTraded: true,
      })
    },

    step: Common.stub,
  })

  // Allows exchanging one type of resource for another. THe rate normally depends on how many towns with Marketplaces the player owns.
  UI.Townscape.Marketplace.Trade = UI.Townscape.Marketplace.extend('HeroWO.H3.DOM.UI.Townscape.Marketplace.Trade', {
    el: {class: 'Hh3-mrk Hh3-mrk_t_tr Hh3-bmp_id_TPMRKRES'},

    _opt: {
      rate: {}, // res give => res take => rate where 1.0 = 1:1, 0.5 = 1:2
    },

    events: {
      attach: function () {
        this.el.append(
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-mrk__t-give">' + this.cx.s('map', 'Kingdom Resources') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-mrk__t-take">' + this.cx.s('map', 'Available for Trade') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-mrk__t-memo"></div>'
        )

        _.each(this.rules.constants.resources, function (res, name) {
          this.addModule('take_' + name, H3Bits.Resource, {
            elClass: 'Hh3-menu__text3 Hh3-menu__text_toned Hh3-mrk__res',
            resource: res,
            icon: 'RESOURCE',
          })
            .el.on('click', function () { this.set('take', res) }.bind(this))
        }, this)

        this.addModule('take', H3Bits.Resource, {elClass: 'Hh3-menu__text3 Hh3-menu__text_toned Hh3-mrk__res', icon: 'RESOURCE'})

        this.addModule('toTransfer', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_TPMRKBU1'})
          .on({clicked: 'toTransfer'}, this)

        this.nested('trade').on({
          clicked: function () {
            var async = this.sc.rpc.do('marketplace', {
              object: this.get('object'),
              do: 'trade',
              give: this.get('give'),
              take: this.get('take'),
              amount: this.get('amount'),
            })
            this.autoOff(async, {}).whenComplete(this._haveTraded, this)
          },
        }, this)
      },

      change_take: function (now, old) {
        if (old != null) {
          this.nested('take_' + _.indexOf(this.rules.constants.resources, old)).el.removeClass('Hh3-mrk__res_hl')
        }

        if (now != null) {
          this.nested('take_' + _.indexOf(this.rules.constants.resources, now))
            .el.addClass('Hh3-mrk__res_hl')
          this.nested('take').set('resource', now)
        }

        this.set('amount', 0)
        this.update()
      },

      change_rate: 'update',

      _update: function () {
        var rates = this.get('rate')[this.get('give')] || {}
        _.each(this.rules.constants.resources, function (res, name) {
          var rate = rates[res]
          this.nested('take_' + name)
            .set('count', !rate ? this.cx.s('map', 'n/a') :
              (rate < 1 ? _.format(this.cx.s('map', '1/%d'), 1 / rate) : rate))
            .$('.Hh3-bit-res__count').toggle(this.get('give') != null)
        }, this)

        var canTrade = !this._slider.isEmpty() && this.get('take') != null
        var rate = rates[this.get('take')]
        this.nested('take').set('count', this.get('amount') * rate)

        if (!canTrade) {
          var s = this.get('haveTraded')
            ? this.cx.s('map', 'You have received quite a bargain.  I expect to make no profit on the deal.  Can I interest you in any of my other wares?')
            : this.cx.s('map', 'Please inspect our fine wares.  If you feel like offering a trade, click on the items you wish to trade with and for.')
        } else if (rate < 1) {
          s = _.format(this.cx.s('map', 'I can offer you 1 unit of %s for %d units of %s.'), Common.capitalize(_.indexOf(this.rules.constants.resources, this.get('take'))), 1 / rate, Common.capitalize(_.indexOf(this.rules.constants.resources, this.get('give'))))
        } else {
          s = _.format(this.cx.s('map', 'I can offer you %d units of %s for 1 unit of %s.'), rate, Common.capitalize(_.indexOf(this.rules.constants.resources, this.get('take'))), Common.capitalize(_.indexOf(this.rules.constants.resources, this.get('give'))))
        }
        this.$('.Hh3-mrk__t-memo').text(s)
      },

      '=step': function () {
        var rate = (this.get('rate')[this.get('give')] || {})[this.get('take')]
        return rate < 1 ? Math.floor(1 / rate) : (rate > 0 ? 1 : NaN)
      },
    },

    // Clicked when user wants to go to another dialog section.
    toTransfer: Common.stub,
  })

  // Allows sending resources to another player.
  UI.Townscape.Marketplace.Transfer = UI.Townscape.Marketplace.extend('HeroWO.H3.DOM.UI.Townscape.Marketplace.Transfer', {
    el: {class: 'Hh3-mrk Hh3-mrk_t_tf Hh3-bmp_id_TPMRKPTS'},

    events: {
      attach: function () {
        var self = this
        this.addModule('players', H3Bits.PlayerList, {
          filter: function (player) {
            return player != this.pl && player.get('won') === false
          }.bind(this),
          sink: {'*': {elClass: 'Hh3-menu__text3 Hh3-menu__text_toned Hh3-mrk__pl', options: {size: 58, interactiveClass: true}}},
          init: function (players) {
            players.fuse('nestExNew', function (res) {
              // XXX PlayerName calc to allow players specifying custom names rather than using hardcoded colors like in SoD?
              res.child.addModule('name', H3Bits.DatabankProperty, {
                elClass: 'Hh3-mrk__pl-name',
                collection: 'players',
                entity: res.child.get('player').get('player'),
                property: 'name',
              })
              res.child.el.on('click', function () {
                self.set('take', res.child.get('player').get('player'))
              })
            })
          },
        })

        this.autoOff(this.cx.players, {
          '.change': function (player, prop) {
            prop == 'won' && this.nested('players').update()
          },
        })

        this.el.append(
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-mrk__t-give">' + this.cx.s('map', 'Kingdom Resources') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-mrk__t-take">' + this.cx.s('map', 'Players') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-mrk__t-memo"></div>'
        )

        this.addModule('toTrade', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_TPMRKBU5'})
          .on({clicked: 'toTrade'}, this)

        this.nested('trade').on({
          clicked: function () {
            var async = this.sc.rpc.do('marketplace', {
              object: this.get('object'),
              do: 'transfer',
              give: this.get('give'),
              receiver: this.get('take'),
              amount: this.get('amount'),
            })
            this.autoOff(async, {}).whenComplete(this._haveTraded, this)
          },
        }, this)
      },

      change_take: function (now, old) {
        if (old != null) {
          this.nested('players').nested(old).el.removeClass('Hh3-mrk__res_hl')
        }

        if (now != null) {
          this.nested('players').nested(now).el.addClass('Hh3-mrk__res_hl')
        }

        this.set('amount', 0)
        this.update()
      },

      _update: function () {
        var player = this.cx.players.nested(this.get('take'))
        if (player) {
          this.addModule('take', H3Bits.PlayerFlag, {
            elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
            size: 58,
            player: player,
          })
            .addModule('name', H3Bits.DatabankProperty, {
              elClass: 'Hh3-mrk__pl-name',
              collection: 'players',
              entity: player.get('player'),
              property: 'name',
            })
        }

        var canTrade = !this._slider.isEmpty() && player

        if (canTrade) {
          var s = _.format(this.cx.s('map', 'I can give %s to the %s player.'), Common.capitalize(_.indexOf(this.rules.constants.resources, this.get('give'))), this.nested('take').nested('name').get('value'))
        } else {
          var s = this.get('haveTraded')
            ? this.cx.s('map', 'Are there any other resources you\'d like to give away?')
            : this.cx.s('map', 'If you\'d like to give any of your resources to another player, click on the item you wish to give and to whom.')
        }
        this.$('.Hh3-mrk__t-memo').text(s)
      },
    },

    step: function () {
      return this.cx.get('classic') ? 1 : (this.get('give') == this.rules.constants.resources.gold ? 50 : 1)
    },

    // Clicked when user wants to go to another dialog section.
    toTrade: Common.stub,
  })

  // Dialog appearing when a hero has gained experience enough to learn new primary skill and choose a new secondary skills.
  UI.HeroLevelUp = H3Bits.Window.extend('HeroWO.H3.DOM.UI.HeroLevelUp', {
    el: {class: 'Hh3-levelup Hh3-bmp_id_LVLUPBKG'},
    _closeButton: null,

    _opt: {
      audio: 'NWHEROLV',
      hero: null,
      level: 0,   // 0-based
      stat: 0,    // constants.stats value
      statDelta: 0,
    },

    events: {
      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-levelup__*'}}})

        this.addModule('name', Bits.String, {
          elClass: 'Hh3-menu__text6 Hh3-menu__text_toned',
          format: this.cx.s('map', '%n has gained a level.'),
        })
          .addCalculator('n', Calculator.Effect.GenericString, {
            target: this.cx.map.constants.effect.target.name,
            ifObject: this.get('hero').get('id'),
          })

        var level = this.addModule('level', Bits.String, {
          elClass: 'Hh3-menu__text6 Hh3-menu__text_toned',
          format: _.format(this.cx.s('map', '%%n is now a level %d %%c.'), this.get('level') + 1),
        })
        level.addCalculator('n', Calculator.Effect.GenericString, {
          target: this.cx.map.constants.effect.target.name,
          ifObject: this.get('hero').get('id'),
        })
        level.addModule('c', H3Bits.HeroClass, {
          el: false,
          object: this.get('hero'),
        })

        this.addModule('face', H3Bits.Bitmap.Portrait, {
          id: this.get('hero').get('id'),
        })

        this.addModule('statIcon', H3Bits.StatImage, {
          size: 42,
          stat: this.get('stat'),
        })

        var statName = _.fromEntries([
          [this.map.constants.stats.attack, this.cx.s('map', 'Attack Skill')],
          [this.map.constants.stats.defense, this.cx.s('map', 'Defense Skill')],
          [this.map.constants.stats.spellPower, this.cx.s('map', 'Spell Power')],
          [this.map.constants.stats.knowledge, this.cx.s('map', 'Knowledge')],
        ])

        $('<div class="Hh3-menu__text6 Hh3-menu__text_toned Hh3-levelup__t-stat">')
          .text(_.format(this.cx.s('map', '%s +%d'), statName[this.get('stat')], this.get('statDelta')))
          .appendTo(this.el)

        this.addModule('skills', H3Bits.SkillList.extend({_childClass: UI.Bits.SkillListItem}), {
          elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
          sink: {'*': {sink: {face: {elClass: 'Hh3-levelup__face', options: {size: 44}}}, options: {clickHelp: false}}},
          // Need to display skills, requiring user to select one of them, at the same time not pre-selecting any one.
          slider: {requireCurrent: false},
        })
          .on({
            '.change_selected, nestExNew, unnested': 'update',
            nestExNew: function (res) {
              res.child.el.append(
                '<div class="Hh3-menu__text6 Hh3-menu__text_toned Hh3-levelup__t-or">' + this.cx.s('map', 'or') + '</div>'
              )
            },
          }, this)

        this._closeButton = this.addModule('close', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_IOKAY'})
          .on({clicked: 'submit'}, this)
      },

      _update: function () {
        this._closeButton.set('disabled', this.nested('skills').length && !this.nested('skills').hasCurrent())
      },

      submit: function () {
        this._closeButton.get('disabled') || this.picked(this.nested('skills').current())
      },
    },

    // function (SkillList.Item)
    // Called when user selects a seconary skill he wants the hero to learn.
    picked: Common.stub,
  })

  // Dialog with some global game options (e.g. audio volume), map-specific controls (e.g. map scroll speed) and menu buttons (e.g. save game).
  UI.GameOptions = H3Combat.BaseOptions.extend('HeroWO.H3.DOM.UI.GameOptions', {
    el: {class: 'Hh3-gop_type_map Hh3-bmp_id_SYSOPBCK'},

    events: {
      attach: function () {
        this.el.append(
          '<div class="Hh3-menu__text2 Hh3-menu__text_toned Hh3-gop__t-head">' + this.cx.s('map', 'System Options') + '</div>' +
          '<div class="Hh3-menu__text4 Hh3-menu__text_toned Hh3-gop__t-hspd">' + this.cx.s('map', 'Hero Speed') + '</div>' +
          '<div class="Hh3-menu__text4 Hh3-menu__text_toned Hh3-gop__t-espd">' + this.cx.s('map', 'Enemy Speed') + '</div>' +
          '<div class="Hh3-menu__text4 Hh3-menu__text_toned Hh3-gop__t-mspd">' + this.cx.s('map', 'Map Scroll Speed') + '</div>' +
          '<div class="Hh3-menu__text4 Hh3-menu__text_toned Hh3-gop__t-ui">' + this.cx.s('map', 'User Interface') + '</div>'
        )

        this.addModule('heroSpeed1', H3Bits.Button, {elClass: 'Hh3-btn_id_SYSOPB1 Hsfx__btn'})
          .on('clicked', function () { this.sc.set('mapOwnSpeed', 2.0) }, this)
        this.addModule('heroSpeed2', H3Bits.Button, {elClass: 'Hh3-btn_id_SYSOPB2 Hsfx__btn'})
          .on('clicked', function () { this.sc.set('mapOwnSpeed', 1.0) }, this)
        this.addModule('heroSpeed3', H3Bits.Button, {elClass: 'Hh3-btn_id_SYSOPB3 Hsfx__btn'})
          .on('clicked', function () { this.sc.set('mapOwnSpeed', 0.5) }, this)
        this.addModule('heroSpeed4', H3Bits.Button, {elClass: 'Hh3-btn_id_SYSOPB4 Hsfx__btn'})
          .on('clicked', function () { this.sc.set('mapOwnSpeed', 0) }, this)

        this.addModule('enemySpeed1', H3Bits.Button, {elClass: 'Hh3-btn_id_SYSOPB5 Hsfx__btn'})
          .on('clicked', function () { this.sc.assignResp({mapEnemySpeed: 1.0, mapHideEnemy: false}) }, this)
        this.addModule('enemySpeed2', H3Bits.Button, {elClass: 'Hh3-btn_id_SYSOPB6 Hsfx__btn'})
          .on('clicked', function () { this.sc.assignResp({mapEnemySpeed: 0.5, mapHideEnemy: false}) }, this)
        this.addModule('enemySpeed3', H3Bits.Button, {elClass: 'Hh3-btn_id_SYSOPB7 Hsfx__btn'})
          .on('clicked', function () { this.sc.assignResp({mapEnemySpeed: 0, mapHideEnemy: false}) }, this)
        this.addModule('enemySpeed4', H3Bits.Button, {elClass: 'Hh3-btn_id_SYSOPB8 Hsfx__btn'})
          .on('clicked', function () { this.sc.set('mapHideEnemy', true) }, this)

        this.addModule('mapSpeed1', H3Bits.Button, {elClass: 'Hh3-btn_id_SYSOPB9 Hsfx__btn'})
          .on('clicked', function () { this.sc.modules.nested('HeroWO.DOM.Map.Edge').set('edgeScrollInterval', 90) }, this)
        this.addModule('mapSpeed2', H3Bits.Button, {elClass: 'Hh3-btn_id_SYSOB10 Hsfx__btn'})
          .on('clicked', function () { this.sc.modules.nested('HeroWO.DOM.Map.Edge').set('edgeScrollInterval', 43) }, this)
        this.addModule('mapSpeed3', H3Bits.Button, {elClass: 'Hh3-btn_id_SYSOB11 Hsfx__btn'})
          .on('clicked', function () { this.sc.modules.nested('HeroWO.DOM.Map.Edge').set('edgeScrollInterval', 18) }, this)

        // Disallow in multi-player because different classic setting on master/client may cause discrepancies. Also disallow in hotseat because hotseat is not compatible with simultaneous turns (see Entry.Browser.js).
        //
        // The first check also implicitly disallows in single-player mode with WebWorker.
        var disallowModes = !this.cx.get('master') || this.cx.screens().length > 1
        this.addModule('classic', H3Bits.Button, {elClass: 'Hh3-btn_id_SYSOB12 Hsfx__btn'})
          .set('disabled', disallowModes)
          .on('clicked', function () { this.cx.set('classic', true) }, this)
        this.addModule('nonClassic', H3Bits.Button, {elClass: 'Hh3-btn_id_SYSOB13 Hsfx__btn'})
          .set('disabled', disallowModes)
          .on('clicked', function () { this.cx.set('classic', false) }, this)

        this.addModule('movePath', H3Bits.Checkbox, {label: this.cx.s('map', 'Show Move Path')})
          .on('change_checked', function (now) { this.sc.set('mapShowRoute', now) }, this)
        this.addModule('heroReminder', H3Bits.Checkbox, {label: this.cx.s('map', 'Show Hero Reminder')})
          .on('change_checked', function (now) { this.sc.set('mapEndTurnAP', now) }, this)
        this.addModule('quickCombat', H3Bits.Checkbox, {label: this.cx.s('map', 'Quick Combat'), disabled: true})
        this.addModule('subtitles', H3Bits.Checkbox, {label: this.cx.s('map', 'Video Subtitles'), disabled: true})
        this.addModule('townOutlines', H3Bits.Checkbox, {label: this.cx.s('map', 'Town Building Outlines')})
          .on('change_checked', function (now) { this.sc.set('mapTownOutlines', now) }, this)
        // XXX=IC until we use SoD's font
        this.nested('townOutlines').el.css('fontSize', '0.88em')

        this.addModule('load', H3Bits.Button, {elClass: 'Hh3-btn_id_SOLOAD'})
          .on({
            clicked: function () {
              if (this.map.get('finished')) {
                return this.cx.menu(this.sc, 'load')
              }
              var box = this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox)
                .addText(this.cx.s('map', 'Are you sure you wish to do this?'))
                .addText(this.cx.s('map', '(Any unsaved games will be lost)'))
              var okay = box.addButton('Hh3-btn_id_IOKAY', 'submit')
              box.addButtonThis('Hh3-btn_id_ICANCEL', 'cancel')
                .once('unnest', function () {
                  if (box.get('button') == okay) {
                    this.cx.menu(this.sc, 'load')
                  }
                }, this)
            },
          }, this)
        this.addModule('save', H3Bits.Button, {elClass: 'Hh3-btn_id_SOSAVE'})
          .on({
            clicked: function () {
              this.cx.menu(this.sc, 'save')
            },
          }, this)
        this.addModule('restart', H3Bits.Button, {elClass: 'Hh3-btn_id_SORSTRT Hh3-btn_dis'})
        this.addModule('menu', H3Bits.Button, {elClass: 'Hh3-btn_id_SOMAIN'})
          .on({
            clicked: function () {
              if (this.map.get('finished')) {
                return this.cx.menu(this.sc)
              }
              var box = this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox)
                .addText(this.cx.s('map', 'Are you sure you wish to do this?'))
                .addText(this.cx.s('map', '(Any unsaved games will be lost)'))
              var okay = box.addButton('Hh3-btn_id_IOKAY', 'submit')
              box.addButtonThis('Hh3-btn_id_ICANCEL', 'cancel')
                .once('unnest', function () {
                  if (box.get('button') == okay) {
                    this.cx.menu(this.sc)
                  }
                }, this)
            },
          }, this)
        this.addModule('desktop', H3Bits.Button, {elClass: 'Hh3-btn_id_SOQUIT Hh3-btn_dis'})

        //this.autoOff(this.map, {
        //  change_finished: 'update',
        //})

        this.autoOff(this.sc, {
          'change_mapOwnSpeed, change_mapEnemySpeed, change_mapHideEnemy': 'update',
          'change_mapShowRoute, change_mapEndTurnAP, change_mapTownOutlines': 'update',
        })

        this.autoOff(this.sc.modules.nested('HeroWO.DOM.Map.Edge'), {
          'change_edgeScrollInterval': 'update',
        })

        this.autoOff(this.cx, {
          'change_classic': 'update',
        })
      },

      _update: function () {
        // XXX=C numbers determined arbitrarily
        var cur = this.sc.get('mapOwnSpeed')
        this.nested('heroSpeed1').set('current', cur == 2.0)
        this.nested('heroSpeed2').set('current', cur == 1.0)
        this.nested('heroSpeed3').set('current', cur == 0.5)
        this.nested('heroSpeed4').set('current', cur == 0)

        // XXX=C numbers determined arbitrarily
        var cur = this.sc.get('mapEnemySpeed')
        var hide = this.sc.get('mapHideEnemy')
        this.nested('enemySpeed1').set('current', !hide && cur == 1.0)
        this.nested('enemySpeed2').set('current', !hide && cur == 0.5)
        this.nested('enemySpeed3').set('current', !hide && cur == 0)
        this.nested('enemySpeed4').set('current', hide)

        // Determined empirically.
        var cur = this.sc.modules.nested('HeroWO.DOM.Map.Edge').get('edgeScrollInterval')
        this.nested('mapSpeed1').set('current', cur == 90)
        this.nested('mapSpeed2').set('current', cur == 43)
        this.nested('mapSpeed3').set('current', cur == 18)

        var cur = this.cx.get('classic')
        this.nested('classic').set('current', cur)
        this.nested('nonClassic').set('current', !cur)

        this.nested('movePath').set('checked', this.sc.get('mapShowRoute'))
        this.nested('heroReminder').set('checked', this.sc.get('mapEndTurnAP'))
        // XXX=I
        //this.nested('quickCombat').set('checked', this.sc.get('quickCombat'))
        // XXX=I
        //this.nested('subtitles').set('checked', this.sc.get('subtitles'))
        this.nested('townOutlines').set('checked', this.sc.get('mapTownOutlines'))

        // XXX=I determine if replay saving is available; if not, disable, else on click reroute directly to replay saving
        //this.nested('save').set('disabled', this.map.get('finished'))
      },
    },
  })

  // Dialog with a single hero's name, skills, artifacts, creatures, etc. Used as a tooltip window in places like Tavern. Shows list of current heroes for switching this dialog to another hero.
  UI.HeroInfo = H3Bits.Window.extend('HeroWO.H3.DOM.UI.HeroInfo', {
    el: {class: 'Hh3-hinfo Hh3-bmp_id_HEROSCR4'},

    _opt: {
      center: true,   // XXX=R use _opt.center on all other H3 windows and remove left/top from CSS?
      hero: null,
    },

    events: {
      submit: 'cancel',

      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-hinfo__*'}}})

        this.el.append(
          '<div class="Hh3-menu__text1 Hh3-menu__text_toned Hh3-hinfo__t-atk">' + this.cx.s('map', 'Attack') + '</div>' +
          '<div class="Hh3-menu__text1 Hh3-menu__text_toned Hh3-hinfo__t-def">' + this.cx.s('map', 'Defense') + '</div>' +
          '<div class="Hh3-menu__text1 Hh3-menu__text_toned Hh3-hinfo__t-pow">' + this.cx.s('map', 'Power') + '</div>' +
          '<div class="Hh3-menu__text1 Hh3-menu__text_toned Hh3-hinfo__t-knw">' + this.cx.s('map', 'Knowledge') + '</div>' +
          '<div class="Hh3-menu__text1 Hh3-hinfo__t-spec">' + this.cx.s('map', 'Specialty') + '</div>' +
          '<div class="Hh3-menu__text1 Hh3-hinfo__t-exp">' + this.cx.s('map', 'Experience') + '</div>' +
          '<div class="Hh3-menu__text1 Hh3-hinfo__t-sp">' + this.cx.s('map', 'Spell Points') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-hinfo__t-quests">' + this.cx.s('map', 'Quest Log') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-hinfo__t-dismiss">' + this.cx.s('map', 'Dismiss Hero') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-hinfo__spec"></div>'
        )

        /* Left panel */
        this.addModule('face', H3Bits.Bitmap.Portrait, {
          resting: true,
          id: this.get('hero').get('id'),
        })

        this.addModule('name', Bits.String, {
          elClass: 'Hh3-menu__text2 Hh3-menu__text_toned',
          format: '%n',
        })
          .addCalculator('n', Calculator.Effect.GenericString, {
            target: this.cx.map.constants.effect.target.name,
            ifObject: this.get('hero').get('id'),
          })

        var level = this.addModule('level', Bits.String, {
          elClass: 'Hh3-menu__text6 Hh3-menu__text_toned',
          format: this.cx.s('map', 'Level %l %c'),
        })
        level.addModule('l', H3Bits.HeroLevel, {
          el: false,
          object: this.get('hero'),
        })
        level.addModule('c', H3Bits.HeroClass, {
          el: false,
          object: this.get('hero'),
        })

        _.each(['attack', 'defense', 'spellPower', 'knowledge'], function (name) {
          this.addModule(name + 'Image', H3Bits.StatImage, {
            size: 42,
            stat: this.map.constants.stats[name],
          })
          this.addModule(name, Bits.String, {format: '%v', elClass: 'Hh3-menu__text3 Hh3-menu__text_toned'})
            .addCalculator('v', Calculator.Effect.GenericNumber, {
              target: this.cx.map.constants.effect.target['hero_' + name],
              ifObject: this.get('hero').get('id'),
            })
        }, this)

        this.addModule('specIcon', UI.Bits.SpecialtyIcon, {
          id: this.get('hero').get('id'),
        })

        function update() {
          this.$('.Hh3-hinfo__spec').text(calc.get('shortName'))
        }
        var calc = this.cx.calculator(Rules.HeroSpecialty, {
          id: this.get('hero').get('id'),
        })
        this.autoOff(calc, {}).whenRenders('change_shortName', update, this)

        this.addModule('morale', H3Bits.Morale, {
          size: 42,
          ifObject: this.get('hero').get('id'),
        })

        this.addModule('luck', H3Bits.Luck, {
          size: 42,
          ifObject: this.get('hero').get('id'),
        })

        this.addModule('experienceImage', UI.Bits.ExperienceImage, {
          size: 42,
          hero: this.get('hero'),
        })

        this.addModule('experience', Bits.ObjectRepresentationProperty, {
          elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
          object: this.get('hero'),
          property: 'experience',
        })

        this.addModule('spellPointsImage', H3Bits.StatImage, {
          size: 42,
          stat: this.rules.constants.stats.spellPoints,
        })

        var sp = this.addModule('spellPoints', Bits.String, {
          elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
          format: this.cx.s('combat', '%c/%m'),
        })
        sp.addModule('c', Bits.ObjectRepresentationProperty, {
          object: this.get('hero'),
          property: 'spellPoints',
        })
        sp.addCalculator('m', Calculator.Effect.GenericNumber, {
          target: this.cx.map.constants.effect.target.hero_spellPoints,
          ifObject: this.get('hero').get('id'),
        })

        this.addModule('skills', H3Bits.SkillList.Calculator.extend({_childClass: UI.Bits.SkillListItem}), {
          elClass: 'Hh3-hinfo__skills Hh3-menu__text3 Hh3-menu__text_toned',
          sink: {'*': {sink: {'*': {elClass: 'Hh3-hinfo__skill-*'}, face: {elClass: 'Hh3-hinfo__skill-face', options: {size: 44}}}}},
          object: this.get('hero').get('id'),
          //source: this.map.constants.effect.source.level,
        })

        /* Bottom panel */
        var garList = this.addModule('garrison', UI.Bits.GarrisonList, {
          elClass: 'Hh3-menu__text_toned',
          store: this.map.objects.subAtCoords(this.get('hero').get('id'), 0, 0, 'garrison', 0),
          sink: {'*': {options: {garrison: this.get('hero').get('id')}}},
        })
        garList._store.release()

        this.addModule('split', UI.Bits.Button.SplitGarrison, {
          elClass: 'Hh3-btn_id_HSBTNS9',
          garrisonLists: [garList],
          garrisonIDs: [this.get('hero').get('id')],
        })

        this.addModule('spreadFormation', UI.Bits.Button.Formation, {
          elClass: 'Hsfx__btn Hh3-btn_id_HSBTNS6',
          formation: this.map.constants.object.formation.spread,
          hero: this.get('hero'),
        })
        this.addModule('groupedFormation', UI.Bits.Button.Formation, {
          elClass: 'Hsfx__btn Hh3-btn_id_HSBTNS7',
          formation: this.map.constants.object.formation.grouped,
          hero: this.get('hero'),
        })

        this.addModule('tactics', UI.Bits.Button.Tactics, {
          elClass: 'Hsfx__btn Hh3-btn_id_HSBTNS8',
          hero: this.get('hero'),
        })

        /* Right panel */
        this.addModule('artifacts', UI.Bits.Artifacts, {
          hero: this.get('hero').get('id'),
          slider: {
            height: 5,
            horizontal: true,
            upClass: 'Hh3-btn_id_HSBTNS3',
            downClass: 'Hh3-btn_id_HSBTNS5',
            disabledClass: 'Hh3-btn_dis',
          },
        })

        var moving = new UI.Bits.Artifacts.Moving({sc: this.sc})
        moving.nest(this.nested('artifacts'))
        moving.attach()
        this.on('unnest', 'remove', moving)

        this.addModule('log', H3Bits.Button, {elClass: 'Hh3-btn_id_HSBTNS4 Hh3-btn_dis'})

        this.addModule('dismiss', UI.Bits.Button.DismissHero, {
          elClass: 'Hsfx__btn Hh3-btn_id_HSBTNS2',
          hero: this.get('hero'),
        })

        /* Right column */
        this.addModule('flag', H3Bits.PlayerFlag, {
          // owner can be 0 (when viewing hero info from tavern).
          player: this.cx.players.nested(this.get('hero').get('owner')),
          size: 58,
          interactiveClass: true,
        })

        var recreate = function (hero) {
          var ui = this.sc.modules.nested('HeroWO.H3.DOM.UI')
          ui.windows.addModule(UI.HeroInfo, {withinWindow: this, hero: hero})
          this.remove()
        }.bind(this)
        // Replace flag, hero list.
        this.autoOff(this.get('hero'), {
          '-unnest': 'cancel',
          change_owner: function (now) {
            if (this.map.players.nested(now).get('team') == this.pl.get('team')) {
              recreate(this.get('hero'))
            } else {
              this.remove()
            }
          },
        })

        if (this.get('hero').get('owner')) {
          var heroList = this.addModule('heroes', UI.Bits.HeroList, {
            list: this.map.players.nested(this.get('hero').get('owner')).heroes,
            slider: {
              height: 8,
              // XXX SoD doesn't permit more than 8 heroes per player; we do (sans the artificial limit) so display scroll buttons for future proofness (they won't look too good right now but they're easy to redraw)
              upClass: 'Hh3-btn_id_IAM014',
              downClass: 'Hh3-btn_id_IAM015',
              disabledClass: 'Hh3-btn_dis',
              requireCurrent: false,
            },
            hideGarrisoned: this.cx.get('classic'),
          })

          var cur = heroList.nested(this.get('hero').get('id'))
          // May be missing if hero is garrisoned and hideGarrisoned is on.
          // requireCurrent is required so that no hero is pre-selected in this case.
          cur && cur.set('selected', true)

          heroList.on({
            '.change_selected': function (item, now) {
              // .change_selected occurs twice: first for un-selected hero (equals to this._opt.hero), then for the one to switch to.
              now && recreate(item.get('object'))
            },
          }, this)
        }

        if (this.cx.get('classic') || !this.get('tooltip')) {
          this.addModule('close', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_HSBTNS'})
            .on({clicked: 'cancel'}, this)
        }
      },
    },

    elEvents: {
      'mousedown .Hh3-hinfo__face': function (e) {
        var box = this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox, {
          tooltip: e.button == 2,
        })
        box.addModule(Bits.String, {
          elClass: 'Hh3-menu__text11 Hh3-menu__text_toned',
          format: '%b',
        })
          .addCalculator('b', Calculator.Effect.GenericString, {
            target: this.cx.map.constants.effect.target.hero_biography,
            ifObject: this.get('hero').get('id'),
          })
        box.get('tooltip') || box.addButton()
      },
    },
  })

  // Screen with info on two heroes, with the ability to transfer creatures and artifacts between them.
  UI.HeroTrade = H3Bits.Window.extend('HeroWO.H3.DOM.UI.HeroTrade', {
    el: {class: 'Hh3-htrade Hh3-bmp_id_TRADE2'},

    _opt: {
      fullScreen: true,
      left: null,
      right: null,
    },

    events: {
      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-htrade__*'}}})

        /* Top panel */
        _.each(['left', 'right'], function (side) {
          var obj = this.get(side)

          this.autoOff(obj, {change_owner: 'remove'})

          this.addModule(side + 'Face', H3Bits.Bitmap.Portrait, {
            resting: true,
            id: obj.get('id'),
          })

          var level = this.addModule(side + 'Name', Bits.String, {
            elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
            format: this.cx.s('map', '%n, Level %l %c'),
          })
          level.addCalculator('n', Calculator.Effect.GenericString, {
            target: this.cx.map.constants.effect.target.name,
            ifObject: obj.get('id'),
          })
          level.addModule('l', H3Bits.HeroLevel, {
            el: false,
            object: obj,
          })
          level.addModule('c', H3Bits.HeroClass, {
            el: false,
            object: obj,
          })

          _.each(['attack', 'defense', 'spellPower', 'knowledge'], function (name) {
            if (side == 'left') {
              this.addModule(name + 'Image', H3Bits.StatImage, {
                size: 32,
                stat: this.map.constants.stats[name],
              })
            }
            this.addModule(side + Common.capitalize(name), Bits.String, {format: '%v', elClass: 'Hh3-menu__text3 Hh3-menu__text_toned'})
              .addCalculator('v', Calculator.Effect.GenericNumber, {
                target: this.cx.map.constants.effect.target['hero_' + name],
                ifObject: obj.get('id'),
              })
          }, this)

          this.addModule(side + 'Log', H3Bits.Button, {elClass: 'Hh3-btn_id_HSBTNS4 Hh3-btn_dis'})

          this.addModule(side + 'SpecIcon', UI.Bits.SpecialtyIcon, {
            id: obj.get('id'),
            large: false,
          })

          this.addModule(side + 'Morale', H3Bits.Morale, {
            size: 30,
            ifObject: obj.get('id'),
          })

          this.addModule(side + 'Luck', H3Bits.Luck, {
            size: 30,
            ifObject: obj.get('id'),
          })

          this.addModule(side + 'ExperienceImage', UI.Bits.ExperienceImage, {
            size: 32,
            hero: obj,
          })

          this.addModule(side + 'Experience', Bits.ObjectRepresentationProperty, {
            elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
            object: obj,
            property: 'experience',
          })
            .on({
              '+normalize_value': function (res, value) {
                if (value >= 10000) {
                  value = _.format(this.cx.s('map', '%dk'), value / 1000)
                }
                return value
              },
            })
            .getSet('value')

          this.addModule(side + 'SpellPointsImage', H3Bits.StatImage, {
            size: 32,
            stat: this.rules.constants.stats.spellPoints,
          })

          this.addModule(side + 'SpellPoints', Bits.ObjectRepresentationProperty, {
            elClass: 'Hh3-menu__text3 Hh3-menu__text_toned',
            object: obj,
            property: 'spellPoints',
          })

          this.addModule(side + 'Skills', H3Bits.SkillList.Calculator.extend({_childClass: UI.Bits.SkillListItem}), {
            elClass: 'Hh3-htrade__skills',
            sink: {'*': {sink: {'*': {elClass: 'Hh3-htrade__skill-*'}, face: {elClass: 'Hh3-htrade__skill-face', options: {size: 32}}}}},
            object: obj.get('id'),
            //source: this.map.constants.effect.source.level,
          })

          var garList = this.addModule(side + 'Garrison', UI.Bits.GarrisonList, {
            store: this.map.objects.subAtCoords(obj.get('id'), 0, 0, 'garrison', 0),
            sink: {'*': {options: {garrison: obj.get('id')}, sink: {face: {options: {type: 'small'}}}}},
            elClass: 'Hh3-menu__text_toned Hh3-town__gl_small',
          })
          garList._store.release()
          Common.oneClass(garList.el, 'Hh3-menu__text', '5')

          this.addModule(side + 'Artifacts', UI.Bits.Artifacts, {
            hero: obj.get('id'),
          })
        }, this)

        var moving = new UI.Bits.Artifacts.Moving({sc: this.sc})
        moving.nest(this.nested('leftArtifacts'))
        moving.nest(this.nested('rightArtifacts'))
        moving.attach()
        this.on('unnest', 'remove', moving)

        // There are 2 split buttons on either side. Instead of duplicating SplitGarrison and getting all kinds of interference, we create one such button and other "stub" button that entirely mirrors the former's state.
        var split = this.addModule('leftSplit', UI.Bits.Button.SplitGarrison, {
          elClass: 'Hh3-btn_id_TSBTNS',
          garrisonLists: [this.nested('leftGarrison'), this.nested('rightGarrison')],
          garrisonIDs: [this.get('left').get('id'), this.get('right').get('id')]
        })

        var mirror = this.addModule('rightSplit', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_TSBTNS'})

        mirror.on('clicked', 'clicked', split)
        mirror.assignResp(_.pick(split.get(), 'disabled', 'current'))

        split.on('change', function (prop, now) {
          switch (prop) {
            case 'disabled':
            case 'current':
              mirror.set(prop, now)
          }
        })

        /* Bottom panel */
        this.addModule('close', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_IOKAY'})
          .on({clicked: 'cancel'}, this)
      },
    },

    elEvents: {
      // As in Garrison.
      'mousedown .Hh3-htrade__leftFace,.Hh3-htrade__rightFace': function (e) {
        var hero = e.target.classList.contains('Hh3-htrade__leftFace') ? this.get('left') : this.get('right')
        this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(UI.HeroInfo, {
          tooltip: e.button == 2 && !this.cx.get('classic'),
          hero: hero,
        })
      },
    },
  })

  // Dialog with two creature lists: one on-map garrison gates object's, another hero's. Allows transferring creatures between them.
  UI.Garrison = H3Bits.Window.extend('HeroWO.H3.DOM.UI.Garrison', {
    el: {class: 'Hh3-garr Hh3-bmp_id_GARRISON'},

    _opt: {
      center: true,
      garrison: 0,    // when owner changes and hero can't trade with new owner, client must call remove()
      hero: 0,    // when no longer at garrison, must call remove()
    },

    events: {
      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-garr__*'}}})
        this.el.append('<div class=Hh3-garr__face>')

        this.autoOff(this.map.objects, [
          'ochange_n_' + this.map.objects.toContiguous(this.get('garrison'), 0, 0, 0),
          'update',
        ])

        this.addModule('name', H3Bits.DatabankProperty, {
          elClass: 'Hh3-menu__text2 Hh3-menu__text_toned',
          collection: 'classes',
          entity: this.cx.get('classic') ? this.rules.objectsID.garrison_0[0]
            : this.map.objects.atCoords(this.get('garrison'), 0, 0, 'class', 0),
          property: 'name',
        })

        var garList = this.addModule('garrison', UI.Bits.GarrisonList, {
          store: this.map.objects.subAtCoords(this.get('garrison'), 0, 0, 'garrison', 0),
          sink: {'*': {options: {garrison: this.get('garrison')}}},
        })
        garList._store.release()

        var visList = this.addModule('visiting', UI.Bits.GarrisonList, {
          store: this.map.objects.subAtCoords(this.get('hero'), 0, 0, 'garrison', 0),
          sink: {'*': {options: {garrison: this.get('hero')}}},
        })
        visList._store.release()
        this.addModule('visitingFace', H3Bits.Bitmap.Portrait, {
          id: this.get('hero'),
        })

        this.addModule('split', UI.Bits.Button.SplitGarrison, {
          elClass: 'Hh3-btn_id_IDV6432',
          garrisonLists: [garList, visList],
          garrisonIDs: [this.get('garrison'), this.get('hero')],
        })

        this.addModule('close', UI.Bits.Button.Close, {
          elClass: 'Hh3-btn_id_IOK6432',
        })
          .on('clicked', 'cancel', this)
      },

      _update: function () {
        if (this.cx.get('classic')) {
          var c = this.rules.objectsID.garrison_0[0]
          var cls = this.rules.classes.atCoords(c, 0, 0, 'texture', 0) + ' ' +
                    this.rules.classes.atCoords(c, 0, 0, 'animation', 0)
          // XXX=IC SoD draws transparent flags instead of gray, and no shadow
        } else {
          var cls = this.map.objects.atCoords(this.get('garrison'), 0, 0, 'texture', 0) + ' ' +
                    this.map.objects.atCoords(this.get('garrison'), 0, 0, 'animation', 0)
          cls = cls.replace(/AVCVG(R|ARM)/ig, function ($, m) {
            return m == 'R' ? 'AVCGAR10' : 'AVCGAR20' /*Anti-Magic*/
          })
        }

        this.$('.Hh3-garr__face').attr('class', 'Hh3-garr__face ' + cls.replace(/,/g, ''))

        this.addModule('flag', H3Bits.PlayerFlag, {
          player: this.map.players.nested(this.map.objects.atCoords(this.get('garrison'), 0, 0, 'owner', 0)),
          size: 58,
        })
      },
    },

    elEvents: {
      // As in HeroTrade.
      'mousedown .Hh3-garr__visitingFace': function (e) {
        this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(UI.HeroInfo, {
          tooltip: e.button == 2 && !this.cx.get('classic'),
          hero: this.map.representationOf(this.get('hero')),
        })
      },
    },
  })

  // Classes used in this file but more generic than classes above. Usually extensions of generic Bits.
  UI.Bits = {}

  // List of hero faces. May hide garrisoned heroes (e.g. adventure map's right-side hero list does so).
  UI.Bits.HeroList = Bits.ObjectRepresentationList.extend('HeroWO.H3.DOM.UI.Bits.HeroList', {
    _childClass: 'Item',

    _opt: {
      hideGarrisoned: false,
    },

    events: {
      attach: function () {
        if (this.get('hideGarrisoned')) {
          this.autoOff(this.get('list'), {
            '.change_garrisoned': function (obj, now, old) {
              if (!now != !old) {
                now ? this.unlist(obj.get('id')) : this._add(obj)
              }
            },
          })
        }
      },

      '=_add': function (sup, obj) {
        if (!this.get('hideGarrisoned') || !obj.get('garrisoned')) {
          sup(this, arguments)
        }
      },
    },
  })

  // Hero face with optional AP/SP gauges on the sides. Displays hero info window on right mouse button.
  UI.Bits.HeroList.Item = Bits.ObjectList.Item.extend('HeroWO.H3.DOM.UI.Bits.HeroList.Item', {
    //> bars true to display action and spell point bars`, false
    _opt: {
      bars: false,    // do not set
      large: false,   // do not set
    },

    events: {
      owned: function () {
        this.get('bars') && this.addModule('ap', H3Bits.HeroAP, {
          elClass: 'Hh3-ol__ap',
          hero: this.get('object')
        })

        this.addModule('face', H3Bits.Bitmap.Portrait, {
          elClass: 'Hh3-ol__face',
          pending: true,
          resting: true,
          id: this.get('object').get('id'),
          large: this.get('large'),
        })

        this.get('bars') && this.addModule('sp', H3Bits.HeroSP, {
          elClass: 'Hh3-ol__sp',
          hero: this.get('object'),
        })
      },

      showTooltip: function () {
        var details = this.cx.oneShotEffectCalculation({
          target: this.map.constants.effect.target.garrisonSee,
          ifObject: this.get('object').get('id'),
          ifTargetPlayer: this.pl.get('player'),
        })
        details && this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(UI.Bits.RightPanel.Hero, {
          elClass: 'Hh3-rp_tooltip',
          hero: this.get('object'),
          tooltipFor: this.el[0],
          details: details,
        })
      },
    },
  })

  // List of town faces. Nothing special except custom _childClass.
  UI.Bits.TownList = Bits.ObjectRepresentationList.extend('HeroWO.H3.DOM.UI.Bits.TownList', {
    _childClass: 'Item',
  })

  // Town face. Displays town info window on right mouse button.
  UI.Bits.TownList.Item = Bits.ObjectList.Item.extend('HeroWO.H3.DOM.UI.Bits.TownList.Item', {
    events: {
      owned: function () {
        this.addModule('face', H3Bits.DefImage.Portrait, {
          elClass: 'Hh3-ol__face',
          pending: true,
          id: this.get('object').get('id'),
        })
      },

      showTooltip: function () {
        var details = this.cx.oneShotEffectCalculation({
          target: this.map.constants.effect.target.garrisonSee,
          ifObject: this.get('object').get('id'),
          ifTargetPlayer: this.pl.get('player'),
        })
        details && this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(UI.Bits.RightPanel.Town, {
          elClass: 'Hh3-rp_tooltip',
          town: this.get('object'),
          tooltipFor: this.el[0],
          details: details,
        })
      },
    },
  })

  // Manageable list of creature - part of town, hero or garrison gates object.
  UI.Bits.GarrisonList = H3Bits.GarrisonList.extend('HeroWO.H3.DOM.UI.Bits.GarrisonList', {
    _opt: {
      singleSelection: false,
    },

    events: {
      '-init': function (opt) {
        opt.slider = {height: 7}    // XXX=RH
      },

      init: function () {
        this.sinkOpt({
          elClass: 'Hh3-menu__text7 Hh3-town__gl',
          sink: {
            '*': {
              elClass: 'Hh3-town__gl-cr',
              sink: {face: {options: {type: 'large'}}},
            },
          },
        })
      },
    },
  })

  // Enables making a town's visiting hero garrisoned and vice-versa.
  var GarrisonSwap = Common.Sqimitive.extend({
    _owning: false,

    _opt: {
      sc: null,
      town: null,
      selected: null,
    },

    events: {
      nestExNew: function (res) {
        res.child.el.on('click.' + this._cid, function () {
          this.clicked(res.child)
        }.bind(this))
      },

      unnested: function (child) {
        child.el.off('.' + this._cid)

        this.getSet('selected', function (cur) {
          return cur == child ? null : cur
        })
      },

      change_selected: function (now, old) {
        old && old.el.removeClass('Hh3-town__face-cur')
        now && now.el.addClass('Hh3-town__face-cur')
      },
    },

    clicked: function (child) {
      var hero = this.findKey(child)[0] == 'p'
      this.getSet('selected', function (cur) {
        if (cur == child) {
          this.get('sc').modules.nested('HeroWO.H3.DOM.UI').windows.addModule(UI.HeroInfo, {
            hero: this.get('sc').map.representationOf(child.get('id')),
          })
        } else if (!cur) {
          return hero ? child : null
        } else {
          this.get('sc').rpc.do('garrison', {
            town: this.get('town').get('id'),
            do: hero ? 'heroSwap' : (this.findKey(child) == 'gates' ? 'heroLeave' : 'heroEnter'),
          })
        }
        return null
      })
    },
  })

  // Non-interactive list of hero's artifacts including backpack.
  UI.Bits.Artifacts = Bits.Base.extend('HeroWO.H3.DOM.UI.Bits.Artifacts', {
    el: {class: 'Hh3-artifs'},
    slots: null,  // do not change
    backpack: null,  // do not change
    _store: null,

    _opt: {
      hero: 0,  // do not change
      slider: {
        height: 5,
        horizontal: true,
        upClass: 'Hh3-btn_id_HSBTNS3',
        downClass: 'Hh3-btn_id_HSBTNS5',
        disabledClass: 'Hh3-btn_dis',
      },
    },

    events: {
      owned: function () {
        this.slots = this.addModule(UI.Bits.Artifacts.Slots, {
          elClass: 'Hh3-artifs_equipped',
        })
        this.backpack = this.addModule(UI.Bits.Artifacts.Backpack, {
          elClass: 'Hh3-artifs_backpack',
          slider: this.get('slider'),
        })
        this.autoOff(this.slots, {'.clicked': 'clicked'})
        this.autoOff(this.backpack, {'.clicked': 'clicked'})
      },

      attach: function () {
        this._store = this.map.objects.subAtCoords(this.get('hero'), 0, 0, 'artifacts', 0)

        this.autoOff(this._store, {
          'ochange': function ($1, $2, $3, $4, $5, options) { this._storeChanged(options) },
          'oadd, oremove': function ($1, $2, $3, options) { this._storeChanged(options) },
        })
      },

      '-unnest': function () {
        // If not autoOff()'d beforehand, inherited -unnest will try to autoOff(), i.e. do store.off(this), stumbling
        // upon freed ObjectStore (with null _events, etc.).
        this._parent && this.autoOff(this._store).release()
      },

      _update: function () {
        var equipped = []
        var backpack = []

        var max = Math.max(_.max(this.rules.artifactSlotsID) + this.backpack._slider.get('height'), this._store.size().x + 1)

        for (var slot = 0; slot < max; slot++) {
          ;(slot < this.rules.artifactSlotsID.backpack ? equipped : backpack)
            .push({slot: slot, artifact: this._store.atCoords(slot, 0, 0, 'artifact', 0)})
        }

        this.slots.assignChildren(equipped, {eqFunc: 'slot'})
        this.backpack.assignChildren(backpack, {eqFunc: 'slot'})
      },
    },

    _storeChanged: function () {
      this.update()
    },

    // function (slot, e)
    // Called when user clicks on a filled or empty artifact slot.
    clicked: Common.stub,
  })

  // Adds ability to equip, put off and exchange artifacts between Artifacts nested in `'this. Highlights receiving slots when equipping. Shows artifact description when right-clicked.
  UI.Bits.Artifacts.Moving = Common.Sqimitive.extend('HeroWO.H3.DOM.UI.Bits.Artifacts.Moving', {
    _owning: false,
    _childClass: UI.Bits.Artifacts,
    _childEvents: ['clicked', '=_storeChanged'],
    _drag: null,
    _lastClickPos: {},
    _tradableCalc: [],
    rules: null,

    _opt: {
      sc: null,
      moving: null,  // child of slots or backpack of any child; only read
    },

    events: {
      init: function (opt) {
        this.rules = opt.sc.cx.modules.nested('HeroWO.H3.Rules')
      },

      attach: function () {
        this.autoOff(this.get('sc').transitions, {
          '+select_heroArtifactSwap': function (res, tr) {
            var i = 0
            i = this.some(function (p) {
              i += p.get('hero') == tr.get('fromHero')
              i += p.get('hero') == tr.get('toHero')
              return i == 2
            })
            if (i) {
              return this._cid
            }
          },
          'nest_heroArtifactSwap': function (view) {
            if (view.get('channel') != this._cid) {
              return
            }
            view.set(this._cid, true)
            this.autoOff(view, {
              tick: function () {
                var moving
                if (view.get('interim')) {
                  moving = this.find(function (p) { return p.get('hero') == view.get('fromHero') })
                  // Interim cannot happen with fromSlot of a backpack, it's always from moving.slots.
                  moving = moving.slots.nested(view.get('fromSlot'))
                  moving.set('interimSlot', view.get('toSlot'))
                }
                this.set('moving', moving)
              },
            })
          },
        })
      },

      '.=_storeChanged': function (child, sup, options) {
        // Update self if the event is not part of artifact fiddling by user or moving is finished.
        var view = this.get('sc').transitions.of(options.transition, this._cid)
        if (!view || !view.get('interim')) {
          this.set('moving', null)
          sup(child)
        }
      },

      '-unnest': function () {
        this.set('moving', null)
      },

      change_moving: function (now, old) {
        this.get('sc').el.css('cursor', now ? 'none' : '')
        old && old.el.removeClass('Hh3-artif_moving')
        this._drag && this._drag.remove()

        if (now) {
          now.el.addClass('Hh3-artif_moving')
          var face = now.nested('face').el
          var scaleFactor = this.get('sc').get('scaleFactor')
          // Position is relative to Screen when scaling is on.
          var scPos = this.get('sc').cx.get('scale')
            ? this.get('sc').el.offset() : {left: 0, top: 0}
          var drag = function (e) {
            face.css({
              left: (e.pageX - scPos.left) / scaleFactor,
              top:  (e.pageY - scPos.top)  / scaleFactor,
            })
          }
          drag(this._lastClickPos)
          this._drag = Common.autoOffNode(this, document.body, {mousemove: drag})

          this._updateTradableCalc(now)
          this._updateHighlight()
          _.invoke(this._tradableCalc, 'whenRenders', 'change_value', this._updateHighlight.bind(this))
        } else {
          this._tradableCalc.splice(0).forEach(function (c) { this.autoOff(c) }, this)
          this.each(function (child) {
            child.slots.invoke('set', 'highlight', false)
            child.backpack.invoke('set', 'highlight', false)
          })
        }

        this.each(function (child) {
          child.el.toggleClass('Hh3-artifs_moving', !!now)
        })
      },

      '.clicked': function (artifacts, child, e) {
        // Since _opt.moving is set indirectly by transition, it won't have last click position, and it needs it to avoid jumping when user starts moving mouse to drag the artifact.
        this._lastClickPos = e

        var moving = this.get('moving')

        if (moving) {
          if (!child.get('highlight')) {
            return
          }
        } else if (child.get('artifact') == null) {
          return
        } else {
          var fits = this.rules.artifacts.atCoords(child.get('artifact'), 0, 0, 'slots', 0)

          if (fits.length < 2) {
            this._updateTradableCalc(child)

            if (!this._tradableCalc.some(Common.p('get', 'value'))) {
              if (this._tradableCalc.length && (this.rules.cx.get('classic') || child.get('artifact') != this.rules.artifactsID.spellBook)) {
                this.get('sc').modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox)
                  .addText(this.rules.cx.s('map', 'This item can\'t be traded.'))
                  .addButton()
              } else {
                switch (child.get('artifact')) {
                  case this.rules.artifactsID.spellBook:
                    return this.get('sc').modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Combat.SpellBook, {
                      hero: this.get('sc').map.representationOf(this._parentOf(child).get('hero')),
                    })
                }

                // XXX=IC for ballista/FAT/ammo cart the message appears on attempt to drop to backpack while dragging starts successfully
                var msg = 'The `{Databank artifacts`, name`, %d`} must be equipped.\n\n`<`{ArtifactImage %1$d`} `{Databank artifacts`, name`, %1$d`}`>'
                var box = this.get('sc').modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox)
                box.addFromMarkup(_.format(this.rules.cx.s('map', msg), child.get('artifact')))
                box.addButton()
              }

              return
            }
          }
        }

        // When starting to move an equipped artifact, internally move it to the
        // backpack to undo its Effects and let the user see un-buf'd Attack, etc.
        // Obviously, this is not needed if starting to move an artifact that is
        // already in backpack.
        //
        // XXX=I This is fine except it allows bypassing Artifact->$slots requirement
        // of not accepting backpack. It's expected that the user has to put the
        // artifact back to some slot eventually, but he can easily avoid this
        // (e.g. by cancelling HeroInfo). It's probably a good idea to forcefully put
        // "in-progress" artifacts back after some timeout, upon change of Player._opt.screen, pending, etc. (but then what to do if another artifact already occupies that slot and that artifact can't fit into backpack either?).
        if (moving) {
          var toSlot = child.get('slot')
        } else if (child.get('slot') >= this.rules.artifactSlotsID.backpack) {
          child.set('interimSlot', child.get('slot'))
          return this.set('moving', child)
        } else {
          var toSlot = this.rules.artifactSlotsID.backpack
          var sub = this._parentOf(child)._store
          while (sub.anyAtCoords(toSlot, 0, 0, 0)) { toSlot++ }
        }

        this.get('sc').rpc.do('heroArtifactSwap', {
          fromHero: this._parentOf(moving || child).get('hero'),
          fromSlot: moving ? moving.get('interimSlot') : child.get('slot'),
          toHero: this._parentOf(child).get('hero'),
          toSlot: toSlot,
          interim: !moving,
        })
      },
    },

    _parentOf: function (slot) {
      return this.find(function (p) {
        return p.slots.nested(slot) || p.backpack.nested(slot)
      })
    },

    _updateTradableCalc: function (now) {
      var hero = this._parentOf(now).get('hero')

      this.each(function (child) {
        if (child.get('hero') != hero &&
          !this._tradableCalc.some(function (c) { return c.get('ifTargetHero') == child.get('hero') })) {
          var calc = this.get('sc').cx.listeningEffectCalculator({
            class: Calculator.Effect.GenericBool,
            update: 'defer',
            target: this.get('sc').map.constants.effect.target.artifactTrade,
            ifArtifact: now.get('artifact'),
            ifObject: hero,
            ifTargetHero: child.get('hero'),
          })

          this.autoOff(calc, {})
          this._tradableCalc.push(calc)
        }
      }, this)
    },

    _updateHighlight: function () {
      var moving = this.get('moving')
      var hero = this._parentOf(moving).get('hero')
      var fits = this.rules.artifacts.atCoords(moving.get('artifact'), 0, 0, 'slots', 0)

      this.each(function (child) {
        var tradable = child.get('hero') == hero ||
          this._tradableCalc.find(function (c) {
            return c.get('ifTargetHero') == child.get('hero')
          })
            .get('value')
        child.slots.each(function (slot) {
          var highlight = tradable && fits.indexOf(slot.get('slot')) != -1
          slot.set('highlight', highlight)
        }, this)
        var highlight = tradable && fits.indexOf(this.rules.artifactSlotsID.backpack) != -1
        child.backpack.invoke('set', 'highlight', highlight)
      }, this)
    },
  })

  // Single artifact slot, possibly empty.
  UI.Bits.Artifacts.Artifact = Bits.Base.extend('HeroWO.H3.DOM.UI.Bits.Artifacts.Artifact', {
    el: {class: 'Hh3-artif'},

    _opt: {
      slot: 0,   // in backpack if >= slot ID of backpack
      artifact: 0,  // Artifact->$id or null (only allowed in backpack)
      highlight: false, // when moving
      //interimSlot: 0,    // used by Moving
    },

    events: {
      change_artifact: 'update',
      change_highlight: 'update',

      attach: function () {
        this.addModule('face', H3Bits.ArtifactImage, {
          elClass: 'Hh3-artif__face',
        })
      },

      _update: function () {
        var id = this.get('artifact')
        Common.oneClass(this.el, 'Hh3-artif_slot_', _.indexOf(this.rules.artifactSlotsID, this.get('slot')))
        this.el.toggleClass('Hh3-artif_hili', this.get('highlight'))
        this.el.toggleClass('Hh3-artif_empty', id == null)
        this.nested('face').set('artifact', id)
      },
    },

    elEvents: {
      mousedown: function (e) {
        if (e.button == 2 && this.get('artifact') != null && (!this.cx.get('classic') || this.get('artifact') != this.rules.artifactsID.spellBook)) {
          // XXX=IC SoD shows this message in the top part of the screen rather than centered
          var box = this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox, {tooltip: true})
          box.addText('Hh3-menu__text9 Hh3-menu__text_toned', this.rules.artifacts.atCoords(this.get('artifact'), 0, 0, 'name', 0))
          box.addFromMarkup(this.rules.artifacts.atCoords(this.get('artifact'), 0, 0, 'description', 0))
          if (this.rules.artifacts.atCoords(this.get('artifact'), 0, 0, 'spell', 0) !== false || !this.cx.get('classic')) {
            // XXX=RH
            box._markUp_BonusesImages(null, box.el, {bonuses: {heroes: {0: {artifacts: [this.get('artifact')]}}}})
          }
        } else {
          this.clicked(e)
        }
      },
    },

    // function (e)
    //#-clicked
    clicked: Common.stub,
  })

  // List of artifact slots. Used for equipped artifacts. May have empty slots.
  UI.Bits.Artifacts.Slots = Bits.Base.extend('HeroWO.H3.DOM.UI.Bits.Artifacts.Slots', {
    _childClass: UI.Bits.Artifacts.Artifact,
    _childEvents: ['clicked'],  // used by UI.Bits.Artifacts

    events: {
      '+_defaultKey': function (res, child) {
        return child.get('slot')
      },
    },
  })

  // Scrollable list of non-equipped artifacts. May have empty slots.
  //
  // XXX=IC in SoD if backpack has visible scroll buttons then using them wraps around the artifact list (i.e. there's no start/end restrictions)
  UI.Bits.Artifacts.Backpack = UI.Bits.Artifacts.Slots.extend('HeroWO.H3.DOM.UI.Bits.Artifacts.Backpack', {
    mixIns: [Common.Ordered],
    _childClass: UI.Bits.Artifacts.Artifact,
    _slider: null,

    _initToOpt: {
      slider: false,
    },

    events: {
      init: function (opt) {
        this._slider = new Slider(opt.slider)
      },

      render: function () {
        this.autoOff(this._slider, {
          change_position: function (now) {
            if (!isNaN(now)) {
              this._orderedParent.parent()[0].scrollLeft = this.at(now).child.el[0].offsetLeft
            }
          },
        })
          .attach(this.el).render()

        this._orderedParent = $('<div class="Hh3-artifs__backpack-list">')
          .appendTo(this._slider.$('.Hslider__track'))
          // Because user can click on artifacts and artifacts are part of Slider's track, Slider would treat such clicks as navigation.
          .on('mousedown', false)
      },

      'nestExNew, unnested': function () {
        this._slider.set('max', this.length - 1)
      },

      '-unnest': function () {
        this._parent && this._slider.remove()
      },
    },
  })

  // Displays a list of active combats involving a party of the same team
  // as the player. This doesn't exist in SoD since its combats are synchronous.
  UI.Bits.CombatList = Bits.Base.extend('HeroWO.H3.DOM.UI.Bits.CombatList', {
    el: {class: 'Hh3-am-combats'},
    _childClass: 'Item',
    _childEvents: ['clicked'],

    events: {
      attach: function () {
        this.autoOff(this.map.combats, {
          nestExNew: function (res) {
            this._add(res.child)
          },
        })
        this.map.combats.each(this._add, this)
      },
    },

    _add: function (child) {
      this.autoOff(child.parties, {
        'nestExNew, unnested': function () {
          this._add(child)
        },
      })

      var display = child.parties.some(function (party) {
        return party.player.get('team') == this.pl.get('team')
      }, this)

      if (display == !!this.nested(child._parentKey)) {
        return
      } else if (display) {
        this.addModule(child._parentKey, this._childClass, {combat: child})
      } else {
        this.unlist(child._parentKey)
      }
    },
  })

  // Represents a single active combat. Shows involved parties.
  UI.Bits.CombatList.Item = Bits.Base.extend('HeroWO.H3.DOM.UI.Bits.CombatList.Item', {
    el: {class: 'Hh3-am-combats__combat'},

    _opt: {
      combat: null,   // Map.Combat
    },

    events: {
      attach: function () {
        this.autoOff(this.get('combat'), {
          '-unnest': 'remove',
          change_state: function (now) {
            if (!now || now == 'end') {
              this.remove()
            } else {
              this.update()
            }
          },
        })

        // Assuming Party's player cannot change.
        this.autoOff(this.get('combat').parties, {
          nestExNew: function (res) {
            this.autoOff(res.child, {
              'change_retreated, change_surrendered, nestExNew, unnested': 'update',
            })
            this.update()
          },
        })
      },

      // XXX=R Very lazy update.
      _update: function () {
        var combat = this.get('combat')

        Common.oneClass(this.el, 'Hh3-am-combats_c_',
          !combat.get('state') || combat.get('state') == 'init' ? 'init' : null,
          combat.parties.some(function (p) { return p.player == this.pl }, this) ? 'mine' : null)

        this.invoke('remove')
        this.el.empty()
        var lastTeam

        combat.parties.toArray()
          .sort(function (a, b) {
            return (
              // Parties (players) of different teams.
              a.player.get('team') - b.player.get('team') ||
              // Parties of the same team, different players.
              a.player.get('player') - b.player.get('player') ||
              // Different parties of the same player; sort by tactics phase order.
              a._parent.indexOf(a) - b._parent.indexOf(b)
            )
          })
          .map(function (party) {
            if (lastTeam != party.player.get('team')) {
              if (lastTeam != null) {
                $('<div class="Hh3-am-combats__team-sep">')
                  .appendTo(this.el)
              }
              lastTeam = party.player.get('team')
            }

            var title = party.get('retreated')
              ? this.cx.s('map', 'Retreated')
              : party.get('surrendered')
                  ? this.cx.s('map', 'Surrendered')
                  : _.format(this.cx.s('map', 'Fighting (creatures: %d)'), party.length)

            this.addModule(H3Bits.PlayerFlag, {
              elClass: 'Hh3-am-combats__flag',
              attachPath: el,
              player: party.player,
            })
              .el.attr('title', title)
              // If Context is still rendering (e.g. when joining a running multi-player game), force PlayerFlag into correct order in el. Else it will be added after _update() returns.
              .appendTo(this.el)

            var el = $('<div>')
              .appendTo(this.el)
              .attr('class', 'Hh3-am-combats__party Hh3-menu__text3')
              .toggleClass('Hh3-am-combats__party_defeated', party.get('retreated') || party.get('surrendered'))
              .text(party.get('retreated')
                ? this.cx.s('map', 'R')
                : party.get('surrendered')
                    ? this.cx.s('map', 'S')
                    : party.length)
              .attr('title', title)

            return el
          }, this)
      },
    },

    elEvents: {
      click: 'clicked',
    },

    //#-clicked
    clicked: Common.stub,
  })

  // Post-game statistics: players' win/lose status, resources, income, etc.
  UI.Bits.WinnersAndLosers = Bits.Base.extend('HeroWO.H3.DOM.UI.Bits.WinnersAndLosers', {
    el: {tag: 'table', class: 'Hh3-am-wal'},

    events: {
      attach: function () {
        var hooks = {
          nestExNew: function (res) {
            hook(res.child)
            this.update()
          },
          unnested: 'update',
        }

        this.autoOff(this.map.victory, hooks)
        this.autoOff(this.map.loss, hooks)
        this.autoOff(this.map.players, hooks)

        var hook = function (o) { this.autoOff(o, {change: 'update'}) }
        this.map.victory.each(hook, this)
        this.map.loss.each(hook, this)
        this.map.players.each(hook, this)
      },

      _update: function () {
        this.el.empty()

        // These collections are unordered so in non-array form we may theoretically iterate in different order for table header than for rows.
        var victory = this.map.victory.toArray()
        var loss = this.map.loss.toArray()

        var tr = $('<tr>')
          .appendTo($('<thead>').appendTo(this.el))

        $('<td colspan="2">')
          .append('<div class="Hh3-am-wal__toggle">Hide</div>')
          .appendTo(tr)

        var colspan = 2 + victory.length + loss.length + 1 + _.size(this.map.constants.resources)

        // XXX=RH icon detection logic is similar to H3.DOM.MainMenu's
        victory.forEach(function (cond) {
          switch (cond.get('type')) {
            case this.map.constants.mapVictory.type.ownArtifact:
              var frame = cond.get('object') ? 10 : 0
              break
            case this.map.constants.mapVictory.type.ownCreatures:
              var frame = 1
              break
            case this.map.constants.mapVictory.type.ownResources:
              var frame = 2
              break
            case this.map.constants.mapVictory.type.ownTown:
              var frame = cond.get('townGrail') ? 4 : 3
              break
            case this.map.constants.mapVictory.type.defeat:
              switch (cond.get('objectType')) {
                case this.map.constants.object.type.hero:
                  var frame = 5
                  break
                case this.map.constants.object.type.town:
                  var frame = 6
                  break
                case this.map.constants.object.type.monster:
                  var frame = 7
                  break
                default:
                  var frame = 11
              }
              break
            case this.map.constants.mapVictory.type.ownDwelling:
              var frame = 8
              break
            case this.map.constants.mapVictory.type.ownMine:
              var frame = 9
              break
          }

          this.addModule(H3Bits.DefImage, {
            attachPath: $('<th>').appendTo(tr),
            def: 'SCNRVICT',
            frame: frame,
          })
        }, this)

        loss.forEach(function (cond) {
          switch (cond.get('type')) {
            case this.map.constants.mapLoss.type.lose:
              switch (cond.get('objectType')) {
                case this.map.constants.object.type.hero:
                  var frame = 1
                  break
                case this.map.constants.object.type.town:
                  var frame = 0
                  break
                default:
                  var frame = 3
              }
              break
            case this.map.constants.mapLoss.type.days:
              var frame = 2
              break
          }

          this.addModule(H3Bits.DefImage, {
            attachPath: $('<th>').appendTo(tr),
            def: 'SCNRLOSS',
            frame: frame,
          })
        }, this)

        tr.append('<td>')

        _.each(this.map.constants.resources, function (id, name) {
          this.addModule(H3Bits.Resource, {
            attachPath: $('<td>').appendTo(tr),
            resource: id,
            count: '',
            icon: 'SMALRES',
          })
        }, this)

        var tbody = $('<tbody>').appendTo(this.el)

        var teams = _.groupBy(this.map.players.omit('0'), Common.p('get', 'team'))
        teams = _.entries(teams).sort(function (a, b) { return a[0] - b[0] })

        _.forEach(teams, function (item) {
          $('<td>')
            .attr('colspan', colspan)
            .text(_.format(this.cx.s('map', 'Team %d'), item[0]))
            .appendTo($('<tr>').appendTo(tbody))

          _.toArray(item[1])
            .sort(function (a, b) { return a.get('player') - b.get('player') })
            .forEach(function (pl) {
              var tr = $('<tr>').appendTo(tbody)
              var name = $('<th>').appendTo(tr)

              this.addModule(H3Bits.PlayerFlag, {
                attachPath: name,
                player: pl,
              })

              name.append(document.createTextNode(' ' + this.rules.databank.players.atCoords(pl.get('player'), 0, 0, 'name', 0)))

              var won = {false: 'Playing', 0: 'Lost', 1: 'Won', 2: 'Tied'}
              $('<td>')
                .addClass('Hh3-am-wal_won_' + pl.get('won'))
                .text(this.cx.s('map', won[pl.get('won')]))
                .appendTo(tr)

              victory.concat(loss).forEach(function (cond) {
                this.addModule(H3Bits.DefImage, {
                  attachPath: $('<th>').toggleClass('Hh3-am-wal_imp', !!cond.get('impossible')).appendTo(tr),
                  def: 'TPTHCHK',
                  frame: +!_.includes(cond.get('achieved') || [], pl.get('player')),
                })
              }, this)

              $('<td>')
                .text(_.format(this.cx.s('map', '%dT %dH'), pl.towns.length, pl.heroes.length))
                .appendTo(tr)

              function round(n) {
                return n >= 1000 ? Math.floor(n / 1000) + 'k' : n
              }

              _.each(this.map.constants.resources, function (id, name) {
                var quantity = round(pl.get('resources_' + name))

                var income = this.cx.oneShotEffectCalculation({
                  target: this.map.constants.effect.target.income,
                  ifPlayer: pl.get('player'),
                  ifResource: id,
                })
                income && (quantity += ' +' + round(income))

                $('<td>').text(quantity).appendTo(tr)
              }, this)
            }, this)
        }, this)
      },
    },

    elEvents: {
      'click .Hh3-am-wal__toggle': function (e) {
        $(e.target).text(this.el[0].classList.toggle('Hh3-am-wal_hidden') ? 'Statistics' : 'Hide')
      },
    },
  })

  // Displays specialty icon of a hero and shows its info on click.
  UI.Bits.SpecialtyIcon = H3Bits.SpecialtyIcon.extend('HeroWO.H3.DOM.UI.Bits.SpecialtyIcon', {
    elEvents: {
      mousedown: function (e) {
        var box = this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox, {
          tooltip: e.button == 2,
        })
        this.cx.get('classic') || box.addText('Hh3-menu__text9 Hh3-menu__text_toned', this._calc.get('longName'))
        box.addFromMarkup(this._calc.get('description'))
        box.get('tooltip') || box.addButton()
      },
    },
  })

  // Displays icon of experience points and shows info about hero's level on click.
  UI.Bits.ExperienceImage = H3Bits.StatImage.extend('HeroWO.H3.DOM.UI.Bits.ExperienceImage', {
    _opt: {
      hero: null,
    },

    events: {
      '-attach': function () {
        this.set('stat', this.rules.constants.stats.experience)
      },
    },

    elEvents: {
      mousedown: function (e) {
        var box = this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox, {
          tooltip: e.button == 2,
        })
        var template = '<p class="Hh3-menu__text9 Hh3-menu__text_toned">Level %l</p>' +
                       '<p>' +
                       '<span class="Hh3-menu__text9 Hh3-menu__text_toned">Next level:</span> <span class="Hh3-menu__text11 Hh3-menu__text_toned">%n</span>' +
                       '<br>' +
                       '<span class="Hh3-menu__text9 Hh3-menu__text_toned">Current experience:</span> <span class="Hh3-menu__text11 Hh3-menu__text_toned">%c</span>' +
                       '</p>'
        var String = Bits.String.extend({
          events: {
            '=_updateEl': function (sup, value) {
              this.el.html(value)
            },
          },
        })
        var str = box.addModule(String, {format: this.cx.s('map', template)})
        str.addModule('l', H3Bits.HeroLevel, {
          el: false,
          object: this.get('hero'),
        })
        str.addModule('n', Bits.Value, {
          el: false,
          value: this.rules.nextLevelUp(this.get('hero').get('experience')),
        })
        str.addModule('c', Bits.ObjectRepresentationProperty, {
          el: false,
          object: this.get('hero'),
          property: 'experience',
        })
        box.get('tooltip') || box.addButton()
      },
    },
  })

  // Displays a secondary skill list item and shows its info on click.
  UI.Bits.SkillListItem = H3Bits.SkillList.Item.extend('HeroWO.H3.DOM.UI.Bits.SkillListItem', {
    _opt: {
      clickHelp: true,
    },

    elEvents: {
      mousedown: function (e) {
        if (e.button != 2 && !this.get('clickHelp')) {
          return
        }
        var box = this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox, {
          tooltip: e.button == 2,
        })
        box.addText('Hh3-menu__text9 Hh3-menu__text_toned', this.nested('name').get('value'))
        var mastery = this._mastery()
        box.addFromMarkup(this.rules.skills.atCoords(this.get('skill'), 0, 0, this.rules.skills.propertyIndex('description') + mastery, 0))
        // SoD doesn't show skill icon if help is called from LevelUp window.
        if (this.get('clickHelp')) {
          box.addModule(H3Bits.SkillImage, {
            size: 82,
            skill: this.get('skill'),
            mastery: mastery,
          })
          box.addText('Hh3-menu__text3 Hh3-menu__text_toned', Common.capitalize(_.indexOf(this.map.constants.skill.mastery, mastery)) + ' ' + this.nested('name').get('value'))
        }
        box.get('tooltip') || box.addButton()
      },
    },
  })

  /* Buttons */

  UI.Bits.Button = {}

  // This button joins one or more Garrison-s to allow user split creatures
  // (create new party), merge (join two parties into one) and move (exchange
  // parties within or between garrisons).
  //
  // Split: select exactly one party with more than 1 member and ensure there
  // is at least one possible receiving slot, button becomes enabled, press on it,
  // receiving slots become highlighted (empty slots and slots with the same
  // Creature->$id, except the same slot as selected), click on a slot, enter
  // number of creatures in the new party, submit, button becomes disabled and
  // slots are unhighlighted and unselected.
  //
  // Merge: select exactly two parties of the same Creature->$id and which are
  // not the only parties in their garrisons.
  //
  // Move: select exactly two parties of different Creature->$id-s or
  // select one party and one empty slot.
  //
  // XXX+I account for garrison_reinforce/reduce
  UI.Bits.Button.SplitGarrison = H3Bits.Button.extend('HeroWO.H3.DOM.UI.Bits.Button.SplitGarrison', {
    el: {class: 'Hsfx__btn'},
    _selected: [],    // [list, child, i] of selected creatures in each list
    _receivers: [],   // [list, child, i] where newly split creature can go (same ID or empty)

    _opt: {
      garrisonLists: null,   // do not set; array of ObjectList.Garrison; must be !singleSelection
      garrisonIDs: null,     // do not set; array of AObject->$id to which each garrisonLists corresponds
      splitting: null,       // Creature->$id or null; requires that nobody else uses _opt.highlighted while this is set
    },

    events: {
      attach: function () {
        _.each(this.get('garrisonLists'), function (list, i) {
          this.autoOff(list, {
            'nestExNew, unnested': 'update',
            '+.+normalize_selected': function ($1, slot, $2, value) {
              if (value && slot.isEmpty()) {
                // Don't allow selecting empty slots unless an operation is pending.
                return this._selected.length > 0
              }
            },
            '.change_selected': function (slot, now) {
              // XXX=I don't allow garrison to consist only of creatures with maxCombats <> false; also update checks in RPC
              if (now && this._selected.length == 1) {
                var doRPC = function (options) {
                  this.sc.rpc.do('garrison', _.extend(options, {
                    to: this.get('garrisonIDs')[i],
                    toSlot: list.findKey(slot),
                    from: this.get('garrisonIDs')[sel[2]],
                    fromSlot: sel[0].findKey(sel[1]),
                  }))
                }.bind(this)
                var sel = this._selected[0]
                var splitting = this.get('splitting')
                // Split.
                if (splitting != null && this._receiverIndex(slot) != -1) {
                  // XXX=I draw popup
                  var splitOff = prompt(_.format(this.cx.s('map', 'Split %s'), this.rules.creatures.atCoords(splitting, 0, 0, 'name', 0)), 1)
                  var keep = sel[1].get('count') - splitOff
                  this.set('splitting', null)
                  slot.set('selected', false)
                  sel[1].set('selected', false)
                  if (splitOff > 0 && keep > 0) {
                    doRPC({
                      do: 'split',
                      creature: splitting,
                      take: splitOff,
                    })
                  }
                  return
                }
                this.set('splitting', null)
                // Merge.
                var type = this.map.objects.atCoords(this.get('garrisonIDs')[sel[2]], 0, 0, 'type', 0)
                if (!slot.isEmpty() && !sel[1].isEmpty() &&
                    slot.get('creature') == sel[1].get('creature')) {
                  slot.set('selected', false)
                  // If source is a town or if it's a hero and has more than one
                  // filled slot - then go ahead.
                  if (type != this.map.constants.object.type.hero ||
                      sel[0].filledLength() > 1) {
                    doRPC({do: 'merge'})
                  }
                  return
                }
                // Move.
                slot.set('selected', false)
                // Allow moving regardless if moving between slots of the same
                // hero (garrison). Or allow moving if destination is not empty
                // as this will cause another creature to swap into this slot.
                // Or allow moving if source garrison becomes empty as long as
                // it's not of a hero.
                if (list == sel[0] ||
                    !slot.isEmpty() ||
                    type != this.map.constants.object.type.hero ||
                    sel[0].filledLength() > 1) {
                  sel[1].set('selected', false)
                  doRPC({do: 'swap'})
                }
              }
              this.update()
            },
          })
        }, this)
      },

      '+normalize_splitting': Common.normIntOr(null),
      change_splitting: 'update',

      _update: function () {
        this._selected = []
        _.each(this.get('garrisonLists'), function (list, i) {
          list.each(function (slot) {
            slot.get('selected') && this._selected.push([list, slot, i])
          }, this)
        }, this)

        this._receivers = []
        if (this._selected.length == 1) {
          var toBeSplit = this._selected[0][1]

          if (!toBeSplit.isEmpty() && toBeSplit.get('count') > 1) {
            _.each(this.get('garrisonLists'), function (list, i) {
              list.each(function (slot) {
                if (slot.isEmpty() || (slot.get('creature') == toBeSplit.get('creature') && slot != this._selected[0][1])) {
                  this._receivers.push([list, slot, i])
                }
              }, this)
            }, this)
          }
        }

        var splitting = this.get('splitting')

        this.set('disabled', !this._receivers.length)
        this.set('current', splitting != null)

        _.each(this.get('garrisonLists'), function (list) {
          list.each(function (slot) {
            slot.set('highlighted', splitting != null && this._receiverIndex(slot) != -1)
          }, this)
        }, this)
      },

      clicked: function () {
        this.getSet('splitting', function (cur) {
          return (this.cx.get('classic') || cur == null) && this._receivers.length
            ? this._selected[0][1].get('creature') : null
        }, this)
        // XXX=IC SoD allows splitting even if stack count is 1
      },
    },

    _receiverIndex: function (slot) {
      return this._receivers.findIndex(function (r) { return r[1] == slot })
    },
  })

  // Generic button that does nothing except playing sound when clicked (as other SoD buttons do).
  UI.Bits.Button.Close = H3Bits.Button.extend('HeroWO.H3.DOM.UI.Bits.Button.Close', {
    el: {class: 'Hsfx__btn'},
  })

  // Cycles between adventure map levels (overground/underground).
  UI.Bits.Button.Z = H3Bits.Button.extend('HeroWO.H3.DOM.UI.Bits.Button.Z', {
    el: {class: 'Hsfx__btn'},

    events: {
      attach: function () {
        this.autoOff(this.map, {
          change_levels: 'update',
        })
        this.autoOff(this.sc, {
          change_z: 'update',
        })
      },

      _update: function () {
        this.set('disabled', this.map.get('levels') < 2)
        Common.oneClass(this.el, 'Hh3-btn_id_',
          this.sc.get('z') ? 'IAM003' : 'IAM010')
      },

      clicked: function () {
        this.sc.getSet('z', function (z) {
          return ++z >= this.map.get('levels') ? 0 : z
        }, this)
      },
    },
  })

  // Puts current hero to rest or wakes him up. Affects NextHero button.
  UI.Bits.Button.RestHero = H3Bits.Button.extend('HeroWO.H3.DOM.UI.Bits.Button.RestHero', {
    el: {class: 'Hsfx__btn'},

    events: {
      attach: function () {
        this.autoOff(this.sc, {
          change_current: 'update',
        })
        this.autoOff(this.pl, {
          change_interactive: 'update',
        })
        this.autoOff(this.pl.heroes, {
          '.change': function (hero, prop) {
            if (prop == 'resting') {
              this.update()
            }
          },
        })
      },

      _update: function () {
        var hero = this.pl.get('interactive') && this.sc.get('current')
        if (hero && !hero.isHero) {
          hero = null
        }
        this.set('disabled', !hero)
        Common.oneClass(this.el, 'Hh3-btn_id_',
          !hero || !hero.get('resting') ? 'IAM005' : 'IAM011')
      },

      clicked: function () {
        var hero = this.sc.get('current')
        if (hero && hero.isHero) {
          hero.getSet('resting', Common.not) && this.resting(hero)
        }
      },
    },

    resting: function (hero) {
      var sub = this.map.objects.subAtCoords(hero.get('id'), 0, 0, 'route', 0)
      try {
        sub.batch(null, function () {
          sub.find(0, function ($1, $2, $3, $4, $5, n) {
            sub.removeAtContiguous(n, 0)
          })
        })
      } finally {
        sub.release()
      }
    },
  })

  // Makes the hero follow provisional travel route, if any.
  UI.Bits.Button.GoHero = H3Bits.Button.extend('HeroWO.H3.DOM.UI.Bits.Button.GoHero', {
    el: {class: 'Hsfx__btn Hh3-btn_id_IAM006'},

    events: {
      attach: function () {
        var route = this.map.objects.propertyIndex('route')

        this.autoOff(this.map.objects, [
          'ochange_p_' + route,
          function (n) {
            var cur = this.sc.get('current')
            if (cur && cur.isHero && n == cur.get('n')) {
              this.update()
            }
          },
        ])

        this.autoOff(this.sc, {
          change_current: function (now, old) {
            if (old && old.isHero) {
              this.autoOff(old)
            }
            if (now && now.isHero) {
              this.autoOff(now, {
                change_actionPoints: 'update',
              })
            }
            this.update()
          },
        })
      },

      _update: function () {
        var hero = this.sc.get('current')
        if (hero && hero.isHero) {
          var empty = !this.map.objects.readSubAtCoords(hero.get('id'), 0, 0, 'route', 0).hasObjects()
          if (!empty) {
            return this.set('disabled', false)
          }
        }
        this.set('disabled', true)
        // XXX=I also disable when have no AP to travel first route segment
      },

      clicked: function () {
        this.sc.modules.nested('HeroWO.H3.DOM.UI').followRoute()
      },
    },
  })

  // Selects next non-resting hero, wrapping to the first if last.
  UI.Bits.Button.NextHero = H3Bits.Button.extend('HeroWO.H3.DOM.UI.Bits.Button.NextHero', {
    el: {class: 'Hsfx__btn Hh3-btn_id_IAM000'},

    _opt: {
      heroList: null,   // do not set
    },

    events: {
      attach: function () {
        this.autoOff(this.get('heroList'), {
          nestExNew: 'update',
          unnested: 'update',
        })
        this.autoOff(this.pl.heroes, {
          '.change': function (obj, prop) {
            if (prop == 'actionPoints' || prop == 'resting') {
              this.update()
            }
          },
        })
      },

      _update: function () {
        this.set('disabled', !this.nextHero())
      },

      clicked: function () {
        var obj = this.nextHero()
        if (obj) {
          this.get('heroList').nested(obj.get('id')).set('selected', true)
          this.sc.scrollTo(obj.get('id'))
        }
      },
    },

    nextHero: function (current) {
      var cur = current
      var objects = []
      this.get('heroList').each(function (item) {
        var obj = item.get('object')
        if (obj.canMove() && !obj.get('resting')) {
          objects.push(obj)
        }
        if (item.get('selected') && cur == null) {
          cur = objects.length
        }
      })
      return objects.splice(cur).concat(objects)[0]
    },
  })

  // Toggles player's interactivity. Once all players are non-interactive, day ends and next round begins.
  UI.Bits.Button.EndTurn = H3Bits.Button.extend('HeroWO.H3.DOM.UI.Bits.Button.EndTurn', {
    el: {class: 'Hsfx__btn Hh3-btn_id_IAM001'},

    events: {
      attach: function () {
        this.autoOff(this.pl, {change: 'update'})
      },

      _update: function () {
        this.set('disabled', (!this.pl.get('interactive') && this.cx.get('classic')) || !this.pl.canTakeTurn())
      },

      clicked: function () {
        var cur = this.pl.get('interactive')
        if (cur &&   // not resuming during the same turn
            this.sc.get('mapEndTurnAP') && this.pl.heroes.anyCanMove()) {
          var box = this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox)
            .addText(this.cx.s('map', 'One or more heroes may still move, are you sure you want to end your turn?'))
          var okay = box.addButton('Hh3-btn_id_IOKAY', 'submit')
          box.addButtonThis('Hh3-btn_id_ICANCEL', 'cancel')
            .once('unnest', function () {
              if (box.get('button') == okay) {
                this.sc.rpc.do('endTurn', {value: !cur})
              }
            }, this)
        } else {
          this.sc.rpc.do('endTurn', {value: !cur})
        }
      },
    },
  })

  // Changes garrison creatures' arrangement (e.g. to spread) for next combat involving `'hero.
  UI.Bits.Button.Formation = H3Bits.Button.extend('HeroWO.H3.DOM.UI.Bits.Button.Formation', {
    el: {class: 'Hsfx__btn'},

    _opt: {
      hero: null,   // do not set
      formation: 0,
    },

    events: {
      attach: function () {
        this.autoOff(this.get('hero'), {change_formation: 'update'})
      },

      _update: function () {
        this.set('current', this.get('hero').get('formation') == this.get('formation'))
      },

      clicked: function () {
        this.get('hero').set('formation', this.get('formation'))
      },
    },
  })

  // Toggles use of tactics phase for next combat involving `'hero.
  UI.Bits.Button.Tactics = H3Bits.Button.extend('HeroWO.H3.DOM.UI.Bits.Button.Tactics', {
    el: {class: 'Hsfx__btn'},
    _calc: null,

    _opt: {
      hero: null,   // do not set
    },

    events: {
      attach: function () {
        this.autoOff(this.get('hero'), {change_tactics: 'update'})

        this._calc = this.updateOn(Calculator.Effect.GenericNumber, {
          target: this.map.constants.effect.target.tacticsDistance,
          ifObject: this.get('hero').get('id'),
        })
      },

      _update: function () {
        var disabled = this._calc.get('value') < 1
        this.set('disabled', disabled)
        this.set('current', !disabled && this.get('hero').get('tactics'))
      },

      clicked: function () {
        this.get('hero').getSet('tactics', Common.not)
      },
    },
  })

  // Removes hero from the game.
  UI.Bits.Button.DismissHero = H3Bits.Button.extend('HeroWO.H3.DOM.UI.Bits.Button.DismissHero', {
    el: {class: 'Hsfx__btn'},

    _opt: {
      hero: null,   // do not set
    },

    events: {
      attach: function () {
        this.autoOff(this.get('hero'), {
          // XXX=R this old code was supposed to notify us when hero becomes or ceases to be garrisoned/visiting but it's flaky because hero can enter/leave town without moving on ADVMAP; we now have visiting/garrisoned properties for hero AObject-s so should instead hook ochange_p_VIS/GAR
          'change_x, change_y, change_z': 'update',
        })

        this.autoOff(this.pl.heroes, {'nestExNew, unnested': 'update'})
      },

      _update: function () {
        var disabled = this.pl.heroes.length < 2 ||
                       this.get('hero').get('visiting') ||
                       this.get('hero').get('garrisoned')
        this.set('disabled', !!disabled)
      },

      clicked: function () {
        var box = this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox)
          .addText(this.cx.s('map', 'Are you sure you want to dismiss this Hero?'))
        var okay = box.addButton('Hh3-btn_id_IOKAY', 'submit')
        box.addButtonThis('Hh3-btn_id_ICANCEL', 'cancel')
          .once('unnest', function () {
            if (box.get('button') == okay) {
              this.sc.rpc.do('dismissHero', {
                hero: this.get('hero').get('id'),
              })
                .whenSuccess(function () {
                  var audio = this.sc.get('audio')
                  audio && audio.playIfEnabled('KILLFADE', 'sfx', '')
                }, this)
            }
          }, this)
      },
    },
  })

  /* Panels on the adventure map */

  // Base panel appearing in adventure map's bottom right corner.
  //
  // This kind of panel is also shown on right mouse button click in the list of heroes, towns and elsewhere.
  UI.Bits.RightPanel = H3Bits.Window.extend('HeroWO.H3.DOM.UI.Bits.RightPanel', {
    _background: [],

    _opt: {
      tooltip: true,
      tooltipFor: null,   // do not change
    },

    events: {
      init: function (opt) {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-am-rp__*'}}})

        if (opt.tooltipFor) {
          // Need to obtain calculated styles but this.el is nested only much later because it's part of Ordered: first ModuleContainer calls owned/attach/render, then Windows' addModule() calls nestEx() which in turn calls _repos() but we can't hook it.
          this.el.hide()    // don't show unpositioned box in Hh3-rp
          _.defer(function () {
            this._parent && this.el.css(_.map($(opt.tooltipFor).offset(), function (v, k) {
              return Math.max(v, -parseInt(this.el.css('margin-' + k)) + this._windows.el.offset()[k])
            }, this)).show()
          }.bind(this))

          // ttw = (t)ool(t)ip (w)rapper, needed to shift absolutely positioned
          // content due to inner margin of Hh3-rp.
          var container = $('<div class=Hh3-rp__ttw>').appendTo(this.el)
          this.fuse('+expandAddModule', function (res) {
            if (!res.options.overrideAttachPath) {
              res.options.attachPath = container
            }
          })
        }
      },

      owned: function () {
        var bk = this._background[+!!this.get('tooltipFor')]
        bk && this.addModule('bk', H3Bits.Bitmap, {file: bk, overrideAttachPath: true})
      },
    },

    elEvents: {
      click: 'clicked',
    },

    //#-clicked
    clicked: Common.stub,
  })

  // Shows current day number with appropriate new week/month animation and sound.
  UI.Bits.RightPanel.Day = UI.Bits.RightPanel.extend('HeroWO.H3.DOM.UI.Bits.RightPanel.Day', {
    el: {class: 'Hh3-am-rp Hh3-am-rp_sect_day'},
    _animation: null,

    events: {
      owned: function () {
        this._animation = this.addModule('anim', H3Bits.DefImage)

        // Must be after anim (CSS).
        this.addModule('date', Bits.GameDate, {
          elClass: 'Hh3-menu__text6',
          format: this.cx.s('map', 'Day %day'),
        })
      },

      attach: function () {
        this.autoOff(this.map, {change_date: 'update'})
      },

      _update: function () {
        var date = this.map.date()
        var newWeek = date.day == 1 && (date.week != 1 || date.month != 1)
        this._animation.set('def', newWeek ? 'NEWWEEK' + date.week : 'NEWDAY')

        var audio = this.sc.get('audio')
        var sound = newWeek ? date.week == 1 ? 'NEWMONTH' : 'NEWWEEK' : 'NEWDAY'
        audio && audio.playIfEnabled(sound, 'sfx', '')
      },
    },

    restartAnimation: function () {
      this._animation.restartAnimation()
    },
  })

  // Shows basic hero info (primary skills, creatures, etc.). Also used as a tooltip in various places.
  UI.Bits.RightPanel.Hero = UI.Bits.RightPanel.extend('HeroWO.H3.DOM.UI.Bits.RightPanel.Hero', {
    el: {class: 'Hh3-menu__text3 Hh3-am-rp Hh3-am-rp_sect_hero'},
    _background: ['ADSTATHR', 'HEROQVBK'],

    _opt: {
      hero: null,
      details: 0,   // constants.effect.garrisonDetails
    },

    events: {
      owned: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-am-rp__*'}}})
        var hero = this.get('hero').get('id')

        if (this.get('details') != this.cx.map.constants.effect.garrisonDetails.list) {
          this.addModule('face', H3Bits.Bitmap.Portrait, {
            resting: true,
            id: hero,
          })

          this.addModule('name', Bits.String, {format: '%v'})
            .addCalculator('v', Calculator.Effect.GenericString, {
              target: this.cx.map.constants.effect.target.name,
              ifObject: hero,
            })
        }

        if (this.get('details') == this.cx.map.constants.effect.garrisonDetails.full) {
          this.addModule('luck', H3Bits.Luck, {
            size: 22,
            ifObject: this.get('hero').get('id'),
          })

          this.addModule('morale', H3Bits.Morale, {
            size: 22,
            ifObject: this.get('hero').get('id'),
          })

          this.addModule('spellPoints', Bits.ObjectStoreProperty, {
            store: this.cx.map.objects,
            x: hero,
            prop: 'spellPoints',
          })

          var stats = {
            attack:      this.cx.map.constants.effect.target.hero_attack,
            defense:     this.cx.map.constants.effect.target.hero_defense,
            spellPower:  this.cx.map.constants.effect.target.hero_spellPower,
            knowledge:   this.cx.map.constants.effect.target.hero_knowledge,
          }
          _.each(stats, function (target, property) {
            this.addModule(property, Bits.String, {format: '%v'})
              .addCalculator('v', Calculator.Effect.GenericNumber, {
                target: target,
                ifObject: hero,
              })
          }, this)
        }

        this.addModule('garrison', H3Bits.GarrisonList, {
          sink: {'*': {elClass: 'Hh3-am-rp__garrison-cr', options: {garrison: hero, details: this.get('details')}}},
          store: this.cx.map.objects.subAtCoords(hero, 0, 0, 'garrison', 0),
          selectable: false,
        })
          ._store.release()
      },
    },

    elEvents: {
      'click .Hh3-am-rp__face': function (e) {
        if (!this.cx.get('classic')) {
          this.sc.scrollTo(this.get('hero').get('id'))
          e.stopPropagation()
        }
      },
    },
  })

  // Shows basic town info (income, creatures, etc.). Also used as a tooltip in various places.
  UI.Bits.RightPanel.Town = UI.Bits.RightPanel.extend('HeroWO.H3.DOM.UI.Bits.RightPanel.Town', {
    el: {class: 'Hh3-menu__text3 Hh3-am-rp Hh3-am-rp_sect_town'},
    _background: ['ADSTATCS', 'TOWNQVBK'],

    _opt: {
      town: null,
      details: 0,   // constants.effect.garrisonDetails
    },

    events: {
      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-am-rp__*'}}})
        var town = this.get('town').get('id')
        this.get('town').on({change_garrisoned: 'update'}, this)

        if (this.get('details') != this.cx.map.constants.effect.garrisonDetails.list) {
          this.addModule('face', H3Bits.DefImage.Portrait, {
            id: town,
            canBuild: true,
            large: true,
          })

          this.addModule('name', Bits.String, {format: '%n'})
            .addCalculator('n', Calculator.Effect.GenericString, {
              target: this.cx.map.constants.effect.target.name,
              ifObject: town,
            })
        }

        if (this.get('details') == this.cx.map.constants.effect.garrisonDetails.full) {
          this.addModule('hall', H3Bits.TownHallLevel, {town: this.get('town')})
          this.addModule('fort', H3Bits.TownFortLevel, {town: this.get('town')})

          // SoD allows a limited combination of income: gold plus either one
          // type of precious resource or both wood and ore. HeroWO allows any
          // combination but if used, this won't look good due to CSS reflecting
          // SoD system.
          _.each(this.rules.constants.resources, function (res, name) {
            if (name != 'gold') {
              var image = this.addModule('income_' + name, H3Bits.DefImage, {
                def: 'SMALRES',
                frame: res,
              })
              var calc = this.cx.calculator(Rules.TownIncome, {
                player: this.cx.players.nested(this.get('town').get('owner')),
                id: town,
                resource: res,
              })
              this.autoOff(calc, {}).whenRenders('change_value', function () {
                image.el.toggle(calc.get('value') > 0)
              })
            }
          }, this)

          this.addModule('income', Bits.String, {format: '%g'})
            .addCalculator('g', Rules.TownIncome, {
              player: this.cx.players.nested(this.get('town').get('owner')),
              id: town,
              resource: this.cx.map.constants.resources.gold,
            })
        }
      },

      _update: function () {
        if (this.get('details') == this.cx.map.constants.effect.garrisonDetails.full) {
          var garrisoned = this.get('town').get('garrisoned')
          if (garrisoned) {
            this.addModule('garrison', H3Bits.GarrisonList, {
              sink: {'*': {elClass: 'Hh3-am-rp__garrison-cr', options: {garrison: garrisoned, details: this.get('details')}}},
              store: this.cx.map.objects.subAtCoords(garrisoned, 0, 0, 'garrison', 0),
              selectable: false,
            })
              ._store.release()
            this.addModule('gates', H3Bits.Bitmap, {file: 'TOWNQKGH'})
          } else {
            this.addModule('garrison', H3Bits.GarrisonList, {
              sink: {'*': {elClass: 'Hh3-am-rp__garrison-cr', options: {garrison: this.get('town').get('id'), details: this.get('details')}}},
              store: this.cx.map.objects.subAtCoords(this.get('town').get('id'), 0, 0, 'garrison', 0),
              selectable: false,
            })
              ._store.release()
            this.unlist('gates')
          }
        } else {
          this.unlist('garrison')
          this.unlist('gates')
        }
      },
    },

    elEvents: {
      'click .Hh3-am-rp__face': function (e) {
        if (!this.cx.get('classic')) {
          this.sc.scrollTo(this.get('town').get('id'))
          e.stopPropagation()
        }
      },
    },
  })

  // Tooltip shown when doing right-click on a garrison gates map object. Not shown in place of normal panels.
  UI.Bits.RightPanel.Garrison = UI.Bits.RightPanel.extend('HeroWO.H3.DOM.UI.Bits.RightPanel.Garrison', {
    el: {class: 'Hh3-menu__text3 Hh3-am-rp Hh3-am-rp_sect_town'},
    _background: [null, 'TOWNQVBK'],

    _opt: {
      garrison: 0,
      details: 0,   // constants.effect.garrisonDetails
    },

    events: {
      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-am-rp__*'}}})
        var id = this.get('garrison')

        this.addModule('name', H3Bits.DatabankProperty, {
          collection: 'classes',
          entity: this.cx.get('classic') ? this.rules.objectsID.garrison_0[0]
            : this.map.objects.atCoords(id, 0, 0, 'class', 0),
          property: 'name',
        })

        if (this.get('details') == this.cx.map.constants.effect.garrisonDetails.full) {
          this.addModule('garrison', H3Bits.GarrisonList, {
            sink: {'*': {elClass: 'Hh3-am-rp__garrison-cr', options: {garrison: id, details: this.get('details')}}},
            store: this.cx.map.objects.subAtCoords(id, 0, 0, 'garrison', 0),
            selectable: false,
          })
            ._store.release()
        }
      },
    },
  })

  // Panel showing basic game info (number of owned towns, allies and enemies, etc.).
  UI.Bits.RightPanel.Kingdom = UI.Bits.RightPanel.extend('HeroWO.H3.DOM.UI.Bits.RightPanel.Kingdom', {
    el: {class: 'Hh3-menu__text3 Hh3-am-rp Hh3-am-rp_sect_kingdom'},
    _background: ['ADSTATIN'],

    events: {
      owned: function () {
        _.times(4, function (level) {
          this.addModule(H3Bits.DefImage, {
            elClass: 'Hh3-am-rp__tci Hh3-am-rp__tc_l_' + (level + 1),
            def: 'ITMTL',
            frame: level,
          })
          this.addModule('count' + level, H3Bits.TownCountByHall, {
            level: level + 1,
            elClass: 'Hh3-am-rp__tc Hh3-am-rp__tc_l_' + (level + 1),
          })
        }, this)
      },

      attach: function () {
        var pl = this.pl
        var filterer = function (ally) {
          return function (player) {
            return ally == (player.get('team') == pl.get('team'))
          }
        }

        var sink = {'*': {elClass: 'Hh3-am-rp__flag', options: {interactiveClass: true}}}

        this.addModule('allies', H3Bits.PlayerList, {
          elClass: 'Hh3-am-rp__als',
          filter: filterer(true),
          sink: sink,
        })

        this.addModule('enemies', H3Bits.PlayerList, {
          elClass: 'Hh3-am-rp__ens',
          filter: filterer(false),
          sink: sink,
        })

        this.autoOff(this.cx.players, {
          '.change': function (player, prop) {
            prop == 'team' && this.update()
          },
        })
      },

      render: function () {
        $('<span class=Hh3-am-rp__al>').text(this.cx.s('map', 'Allies:')).appendTo(this.el)
        $('<span class=Hh3-am-rp__en>').text(this.cx.s('map', 'Enemies:')).appendTo(this.el)
      },

      _update: function () {
        this.invoke('update')   // refresh filterer
      },
    },
  })

  // Shows one of the normal Panel-s based on current context, allowing user to cycle through them. Used to fill adventure map's bottom right corner.
  UI.Bits.RightPanel.Multiple = Bits.Base.extend('HeroWO.H3.DOM.UI.Bits.RightPanel.Multiple', {
    _current: null,
    _backTimer: null,
    _childEvents: ['clicked'],

    _opt: {
      current: null,
      available: [],
      switchOnNewDay: true,
      heroList: null,   // do not set
      townList: null,   // do not set
    },

    events: {
      '+normalize_current': function (res, now) {
        var all = this.get('available')
        if (!now || all.indexOf(now) == -1) {
          now = all[0]
        }
        return now
      },

      '+normalize_available': function (res, now) {
        return Common.normArrayCompare(now, this.get.bind(this, 'available'))
      },

      '-unnest': function () {
        this._parent && clearTimeout(this._backTimer)
      },

      attach: function () {
        this.autoOff(this.get('heroList'), {'.change_selected': 'update'})
        this.autoOff(this.get('townList'), {'.change_selected': 'update'})

        this.autoOff(this.map, {
          change_date: function () {
            if (this.get('switchOnNewDay')) {
              this.cycle('day', true)
              this._current.restartAnimation()  // in case day panel was already current
            }
          },
        })
      },

      _update: function () {
        // XXX=IC in classic mode replace all available with hourglass panel indicating turn of another player (animated hourglass if AI's turn)
        var available = ['kingdom', 'day']
        var town = this.get('townList').currentObject()
        var hero = this.get('heroList').currentObject()
        town && available.splice(0, 0, 'town')
        hero && available.splice(0, 0, 'hero')
        if (this.cx.get('classic') && available.join() == 'kingdom,day') {
          // See the comment in listChange().
          available.reverse()   // day, kingdom
        }
        this.set('available', available)

        switch (this.get('current')) {
          case 'town':
            if (this._current.get('town') == town) { return }
          case 'hero':
            if (this._current.get('hero') == hero) { return }
            // User switched to another town/hero while town/hero panel was
            // current. Replace town/hero info there by recreating new panel.
            this._create(this.get('current'))
        }
      },

      change_available: function (now) {
        this.getSet('current')
      },

      change_current: '_create',

      '.clicked': function () {
        this.cycle(null, true)
      },
    },

    _create: function (panel) {
      this._current && this._current.remove()
      clearTimeout(this._backTimer)

      switch (panel) {
        case 'day':
          this._current = this.addModule('day', UI.Bits.RightPanel.Day, {})
          // restartAnimation() is unnecessary since the panel is constructed
          // from scratch (we do this because user predominantly sees just
          // 'hero' or 'town', others would be wasting resources listening
          // to events).
          break
        case 'kingdom':
          this._current = this.addModule('kingdom', UI.Bits.RightPanel.Kingdom, {})
          break
        case 'town':
          this._current = this.addModule('town', UI.Bits.RightPanel.Town, {
            town: this.get('townList').currentObject(),
            details: this.map.constants.effect.garrisonDetails.full,
          })
          break
        case 'hero':
          this._current = this.addModule('hero', UI.Bits.RightPanel.Hero, {
            hero: this.get('heroList').currentObject(),
            details: this.map.constants.effect.garrisonDetails.full,
          })
          break
      }

      Common.oneClass(this._current.el, 'Hh3-win__')
    },

    // Switches to another panel, with possible timeout of switching back.
    //
    //[
    // set('current', '') - switch to first panel, no delay
    // cycle()            - switch to next panel
    // cycle(null, true)  - switch to next panel and switch back after a short delay
    // cycle(false, true) - keep current panel but switch to first after a delay
    // cycle('day')       - switch to 'day' panel
    // cycle('day', true) - switch to 'day' panel and back after a delay
    //]
    cycle: function (toPanel, autoBack) {
      if (toPanel == false) {
        // Keep current.
      } else if (toPanel == null) {
        this.getSet(['current', 'available'], function (cur, all) {
          var pos = all.indexOf(cur) + 1
          return [all[pos == all.length ? 0 : pos], all]
        })
      } else {
        this.set('current', toPanel)
      }

      if (autoBack) {
        clearTimeout(this._backTimer)
        this._backTimer = setTimeout(function () {
          this.set('current', '')   // switch to the first available panel
        }.bind(this), autoBack == true ? 3500 : autoBack)
      }
    },
  })

  return UI
})