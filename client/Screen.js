define(['DOM.Common'], function (Common) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // Represents a single player's in-game display.
  //
  // A HeroWO game (represented by `#Context at large) can be entirely "headless"
  // (as it works on a multi-player server) or be output to one or more `#Screen-s. Not only that, there may be multiple
  // `#Screen-s per one player, and even then the player can be controlled from
  // any `#Screen (or no `#Screen - e.g. for AI).
  //
  // ` `#Screen is both a `#ContextModule and a `#ModuleContainer for
  // `#ScreenModules.
  var Screen = Common.jQuery.extend('HeroWO.Screen', {
    mixIns: [Common.ContextModule, Common.ModuleContainer],
    el: {class: 'Hsc'},
    // The player this `#Screen is bound to.
    //= `@Map.Indexed.Players`@`, null before `#attach()
    // This property is a shortcut to
    // `[context.map.players.nested(screen.get('player'))`].
    //#-ro
    player: null,
    rpc: null,   // null before attach()
    // Views of Map.Transitions displayed on this Screen.
    transitions: null,
    _currentEvent: null,

    //> player integer `- Number of the player to which this `#Screen is bound
    //  (always positive). After `#attach() this is the same as
    //  `[screen.player.get('player')`]. Do not change.
    //> interactive bool `- Enables control of the game from this `#Screen.
    //  If disabled, the user can still do actions that do not modify the world
    //  (like scrolling the map or viewing towns) so it's different from merely
    //  mirroring the real player's display. This value can be switched on run-time.
    //> mouseCell null`, array [x, y] `- Which adventure map cell the mouse is
    //  rolling over (if any, else `'null), within current `'z.
    //> z integer `- Which surface the adventure map is displaying (`'0 - overground level,
    //  `'1 = underground). A `#Screen is always displaying one interactive adventure map (mini-map not included) and thus
    //  one particular level.
    //> current object `#ObjectRepresentation `- Currently focused adventure map object
    //  (normally a hero or town).
    //> scaleFactor float `- Current scale multiplier applied to this `'.Hsc (usually coming from `'.Hcx). Used to adjust `[MouseEvent.pageX`] and other absolute coordinates.
    //> mapPosition array [x, y] `- Tile that the adventure map is currently centered on,
    //  within current `'z. This Can't exceed map dimensions and can be
    //  constrained (e.g. tiles near the edge cannot be centered on).
    //> mapPositionBoundaries array [left, top, right, bottom] `- Constraints on
    //  `'mapPosition.
    //> mapViewSize array [width, height] `- Viewport size in tiles. Do not set
    //  but can listen to for changes.
    //> mapAnimate bool `- Whether to animate the adventure map (and possibly
    //  other parts).
    //> mapMargin bool `- Whether to display hidden adventure map tiles on the sides.
    //> mapShroud bool `- Whether to obscure non-explored adventure map areas with
    //  invisible or partly visible shroud (aka fog of war).
    //> mapGrid bool `- Whether to display the grid over the adventure map.
    //> mapPassability bool `- Whether to highlight adventure map
    //  tiles according to their passability and actionability. Useful for
    //  debugging.
    //> mapPathFinding bool `- Whether to indicate pathfinding cost on the adventure map.
    //> mapDragging null not active`, string activator's identifier `-
    //  Internal value for use by modules that can repeatedly scroll the adventure map.
    //  For example, set during map scrolling by dragging or near the edge.
    //  If a module wants to start moving but this value is not null - the
    //  new move gesture (such as dragging) should not be started.
    _opt: {
      player: 0,
      interactive: true,
      audio: null,
      /* Options updated by modules */
      mouseCell: null,
      z: 0,
      current: null,
      /* Modules are expected to listen for change of these */
      scaleFactor: 1.0,
      mapPosition: [0, 0],
      mapPositionBoundaries: [],
      mapViewSize: [],
      mapAnimate: false,
      mapMargin: false,
      mapShroud: true,
      mapGrid: false,
      mapPassability: false,
      mapPathFinding: false,
      mapDragging: null,
      mapOwnSpeed: 1.0,   // SoD default = "canter" (medium); can be Infinity
      mapEnemySpeed: 0.5,   // SoD default = "gallop" (fast); can be Infinity
      // XXX=I
      mapHideEnemy: false,    // during enemy turn hides ADVMAP (shows fog of war everywhere) and shows shield in place of minimap, even when enemy moves in places explored by the player (makes mapEnemySpeed ineffective)
        // SoD default = off
      mapShowRoute: true,   // SoD default = on
      mapEndTurnAP: true,   // SoD default = on
      mapTownOutlines: true,   // SoD default = on
      spellBookPageAnimation: true,  // SoD default = on
      combatGrid: true,   // SoD default = off
      combatSpeed: 0.5,   // SoD default = slow
      combatHighlightMove: true,   // SoD default = off
      combatHighlightHover: true,   // SoD default = off
      combatCreatureInfo: true,   // false, 'spell', true (all)
        // SoD default = off
    },

    events: {
      init: function () {
        _.log && this.modules.fuse('unnested', function (module) {
          _.log('Removed ScreenModule.%d %s:%s',
                this.get('player'), module._cid, module)
        }, this)

        this.transitions = new Screen.Transitions({
          transitions: this.cx.map.transitions,
          map: this.cx.map,
        })

        // Allow processing transitions created during map loading. This chiefly concerns timedEvent's encounterMessage that appears on the first day in most HoMM 3 maps (including Tutorial). Screen and H3.DOM.UI are normal Module-s with delayed attach/render so if the below is placed into attach() then it may fire after H3.Rules' initial timed events.
        this.cx.get('dataReady') ? this.transitions.attach()
          : this.autoOff(this.cx, {dataReady: 'attach'}, this.transitions)
      },

      '+normalize_mapPosition': function (res, now) {
        var bounds = this.get('mapPositionBoundaries')
        var value = [
          Common.clamp(now[0], bounds[0], bounds[2]),
          Common.clamp(now[1], bounds[1], bounds[3]),
        ]
        return Common.normIntArrayCompare(value, this.get.bind(this, 'mapPosition'))
      },

      change_mapMargin: 'updateMapPositionBoundaries',

      change_mapDragging: function (now) {
        Common.oneClass(this.el, 'Hsc_dragging', now ? '' : null, now ? '_' + now : null)
      },

      change: function (name, now, old) {
        if (name.match(/^(map|combat)|^z$/) && name != 'mapPathFinding') {
          _.log && _.log('Screen.%d.%s = %j <- %j', this.get('player'), name, now, old)
        }
      },

      '+normalize_mouseCell': function (res, value) {
        return Common.normIntArrayCompare(value, this.get.bind(this, 'mouseCell'))
      },

      '+normalize_mapPositionBoundaries': function (res, value) {
        var margin = this.invisibleMapMargin()
        var left = Common.clamp(value[0], margin[0], this.map.get('width')  - 1 - margin[2])
        var top  = Common.clamp(value[1], margin[1], this.map.get('height') - 1 - margin[3])
        value = [
          left,
          top,
          Common.clamp(value[2], left, this.map.get('width')  - 1 - margin[2]),
          Common.clamp(value[3], top,  this.map.get('height') - 1 - margin[3]),
        ]
        return Common.normIntArrayCompare(value, this.get.bind(this, 'mapPositionBoundaries'))
      },

      change_mapPositionBoundaries: function () {
        this.getSet('mapPosition')    // re-apply normalize_mapPosition
      },

      change_current: function (now, old) {
        old && old.off(this._currentEvent)

        this._currentEvent = now && now.on('-unnest', function () {
          this.set('current', null)
        }, this)
      },

      '-attach': function () {
        this.player = this.cx.players.nested(this.get('player'))
        this.rpc = this.cx.rpcFor(this.get('player'))
        this.cx.map.get('finished') && this.set('mapShroud', false)

        this.autoOff(this.cx.map, {
          change_finished: function (now) {
            now && this.set('mapShroud', false)
          },
        })
      },

      render: function () {
        this.el.addClass('Hsc_player_' + this.get('player'))
        this.updateMapPositionBoundaries()
      },

      '-unnest': function () {
        this._currentEvent && this.get('current').off(this._currentEvent)
        this._parent && this.transitions.remove()
      },
    },

    // Adds a new module by its class object `'cls.
    //
    // See `@Context.addModule`@ for details.
    addModule: function (key, cls, options) {
      var options = Common.expandAddModule({
        args: arguments,
        type: this.constructor.modules,
        options: {screen: this},
        init: [function (module) {
          _.log && _.log('Added ScreenModule.%d %s:%s', this.get('player'),
                         module._cid, module)
        }.bind(this)],
      })
      return this._addModule(options, this.cx.get('loading'))
    },

    // Internal method to trigger recalculation of adventure map position constraints.
    //
    // See `#calcPositionBoundaries() and `'mapPositionBoundaries and
    // `'mapPosition `#_opt-s.
    updateMapPositionBoundaries: function () {
      this.set('mapPositionBoundaries', this.calcPositionBoundaries(
        [Infinity, Infinity, -Infinity, -Infinity]))
    },

    // Returns number of inaccessible adventure map cells on each side.
    //= array [left, top, right, bottom] `- do not mutate
    // Result is `[[0, 0, 0, 0`] if the `'mapMargin `#_opt is enabled (because
    // the user sees the hidden areas), else it matches `#Map's `'margin `'_opt.
    invisibleMapMargin: function () {
      return this.get('mapMargin') ? [0, 0, 0, 0] : this.map.get('margin')
    },

    // Centers the adventure map on `'obj's first actionable cell, or on its
    // top left corner if there's none.
    //
    //> obj integer ID (X) in `@Map.Indexed.objects`@`, object in actionableSpot() format
    //
    // `'set()'ing the `'mapPosition `#_opt centers on object's top left corner.
    scrollTo: function (obj) {
      var pos = this.map.actionableSpot(obj) ||
        [this.map.objects.atCoords(obj, 0, 0, 'x', 0),
         this.map.objects.atCoords(obj, 0, 0, 'y', 0),
         this.map.objects.atCoords(obj, 0, 0, 'z', 0)]
      this.assignResp({z: pos[2], mapPosition: pos})
    },

    /* Methods that must be overridden by modules */

    // Internal method to determine `'mapPositionBoundaries.
    //= array [top, left, right, bottom]
    calcPositionBoundaries: function (value) {
      var view = this.get('mapViewSize')
      var margin = this.invisibleMapMargin()

      return [
        Math.min(value[0], margin[0] + (view[0] >>> 1)),
        Math.min(value[1], margin[1] + (view[1] >>> 1)),
        Math.max(value[2], this.map.get('width')  - margin[2] - (view[0] >>> 1)),
        Math.max(value[3], this.map.get('height') - margin[3] - (view[1] >>> 1)),
      ]
    },

    // Event occurring when user clicks on a cell in the adventure map.
    //
    // Technically `'z can be any but practically it always matches the `'z `#_opt.
    cellClick: function (x, y, z) {
      _.log && _.log('P%d Click on (%d:%d:%d)', this.get('player'), x, y, z)
    },

    // Event occurring when user clicks using right mouse button, before release.
    cellRightClick: function (x, y, z) {
      _.log && _.log('P%d RMB click on (%d:%d:%d)', this.get('player'), x, y, z)
    },
  }, {
    modules: 'screen',
  })

  // Ordered collection of "views" of `#Map transitions that are meant for showing on a particular `#Screen.
  Screen.Transitions = Common.Sqimitive.extend('HeroWO.Screen.Transitions', {
    mixIns: [Common.Ordered],
    _childClass: [Screen, 'Transition'],

    _opt: {
      transitions: null,    // don't change
      map: null,    // for listenForObject(); don't change
      muted: [],    // list of channel string names whose transitions are never selected
    },

    events: {
      change_muted: function (now, old) {
        _.log && _.log('Transitions muted : %s <- %s', now, old)
      },

      attach: function () {
        this.autoOff(this.get('transitions'), {
          '.select': function (transition) {
            if (+transition._parentKey < (this.at(0) || {}).key) {
              // var tr1 = map.transitions.nest({})
              // var tr2 = map.transitions.nest({})
              // tr2.collect()
              // map.objects.setAtCoords(..., tr2.options())
              // tr1.collect()      // <- too late! do first collect before tr2
              throw new Error('An earlier Transition was selected after the newer.')
            }
            var selected = this.fire('select_' + transition.get('type'), [transition])
            if (selected) {
              var channel = selected[0] == '!' ? selected.substr(1) :
                _.includes(this.get('muted'), selected) ? false : selected
              if (channel) {
                transition.getSet('active', Common.inc())
                var view = this.nest(transition._parentKey, {
                  transition: transition,
                  channel: channel,
                }, {pos: +transition._parentKey})
                var options = _.filter(transition.get(), function (v, p) {
                  return !_.has(view._opt, p)
                })
                ;[].push.apply(view._reflecting, _.keys(options))
                view.assignResp(options)
                _.log && _.log('Transition %s selected into view %s : %s', transition._parentKey, view._cid, selected)
                this.fire('nest_' + options.type, [view, transition])
                view.attach()
                // Since Map fires select in response to first collect, imitate
                // that collect after nesting.
                view.collect(transition, options.collect)
              } else {
                _.log && _.log('Transition %s selected but muted : %s', transition._parentKey, selected)
              }
            }
          },

          unnested: function (transition, key) {
            this.unlist(key)
          },
        })
      },

      unnested: function (view) {
        view.get('transition').getSet('active', Common.inc(-1))
        this._playNext(view.get('channel'))
      },

      remove: function () {
        this.invoke('remove')   // detach
      },
    },

    _playNext: function (channel) {
      var parallel = []
      // First transition in the channel is implicitly parallel with itself.
      var nextParallel = 1

      this.some(function (view) {
        if (view.get('channel') == channel) {
          if (!view.get('final')) {
            return true
          }
          if (nextParallel-- <= 0) {
            var i = parallel.indexOf(view._parentKey)
            if (i == -1) {
              return true
            }
            parallel.splice(i, 1)
          }
          switch (view.get('parallel')) {
            case true:
              nextParallel = 1
            case null:
              break
            default:
              parallel.push.apply(parallel, view.get('parallel'))
          }
          view.get('aborting') || view.set('playing', true)
        }
      })
    },

    // Returns view of the transition `'id, if such a view exists and has a truthy value of `'opt.
    //
    // This is useful to check if a change will be handled by a transition. `'opt is typically `'_cid of the controller object who sets it in response to `'nest_TYPE.
    of: function (id, opt) {
      var view = this.nested(id)
      return view && view.get(opt) && view
    },

    // Performs a generic synchronous update for an UI object independent of a particular transition `'type.
    //
    //> value mixed `- data holding all the state necessary to perform the update by `'func
    //> options object `- as received from an event (`'change, etc.)
    //> sqim `- UI object reflecting the change
    //> func omitted = '_updateUsing'`, string`, callable `- receives `'value, context = '`sqim
    updateUsing: function (value, options, sqim, func) {
      function update() {
        if (typeof func != 'function') {
          func = sqim[func || '_updateUsing']
        }
        func.call(sqim, value)
      }
      var view = this.nested(options.transition)
      if (view) {
        if (view.get('collect') == null) {
          // var tr = map.transitions.nest({})
          // tr.collect()   // <- do not forget this!
          // map.objects.setAtCoords(..., tr.options())
          // tr.collect()
          throw new Error("Transition wasn't selected before first change event.")
        }
        sqim.autoOff(view, {
          change_aborting: update,
          tick: function (async, tick) {
            if (tick == options.transitionTick) {
              _.log && _.log('Transition %s/%d %s.%.j : %s', view._parentKey, tick, sqim._cid, func, sqim)
              update()
              // Ignore subsequent abort().
              func = Common.stub
            }
          },
        })
      } else {
        update()
      }
    },

    // Causes or cancels `'channel's transitions to be never selected by changing `#_opt.`'muted.
    //> channel str
    //> mute omitted = false`, bool
    mute: function (channel, mute) {
      this.getSet('muted', function (cur) {
        return mute || mute == null ? cur.concat(channel) : _.without(cur, channel)
      })
      return this
    },

    // Determines if a view should be created on this Screen to handle the newly added transition. Returns a non-empty string (channel name). If starts with '!', ignores `'muted ('!' alone is disallowed).
    //
    // Do not assume that `'nest_TYPE is always called following return of a truthy value (see `'muted).
    //
    // Avoid constant names - use them only if there may be never two objects alive at once using the same channel name. For example, instead of 'combat' use 'combat' + _cid so that if a second combat window is created while the first exists, it won't take another's views.
    //select_TYPE: function (transition)

    // Sets up the newly created view. Usually sets `'_cid (`#of()) and hooks `'tick, etc.
    //
    // Once nested, you should cancel and remove the view by abort() (at any time) or wait until it starts playing, finishes and removes itself.
    //nest_TYPE: function (view, transition)
  })

  // Represents a "view" of a `#Map transition that is meant for showing on a particular `#Screen.
  //
  // A single `#Map `'Transition has either 0 or 1 view on a given `#Screen.
  Screen.Transition = Common.Sqimitive.extend('HeroWO.Screen.Transition', {
    _reflecting: [],

    _opt: {
      // Map.Transition. Do not change.
      transition: null,
      // Transitions from different channels may play simultaneously (parallel affects transitions in the same channel only). Animators of different channels must be entirely isolated in terms of shared objects they use (DOM, etc.), or must employ a special locking mechanism as described in parallel. Do not change. Must not begin with '!'.
      //
      // Known channels: map (ADVMAP), combat* (H3). Private channels are commonly named after just _cid.
      channel: '',
      // Changed to true, 0 or 1 time.
      playing: false,
      // change_ending occurs once.
      ending: false,
      // change_aborting occurs 0 or 1 time between abort() and remove().
      // playing may be false or true when this changes.
      aborting: false,
      // May be changed to true (matches ID of next transition in queue) or an array of transition IDs (empty = null). When changed, every transition in the channel is checked in order (beginning with the first): if its ID matches, it is started (unless it's aborting) and next transition is checked, until the end or first non-matching ID or non-final transition. If a started transition itself becomes parallel, its list is added to the common check list.
      //
      // It's recommended that all changes to this include IDs of the previous lists, otherwise already started transitions won't be paused if their IDs are missing from the new value of parallel and it may get confusing; same applies to `'true.
      //
      // For example, assume this channel of 5 transitions (initially with empty parallel):
      //
      //   0[parallel=1,4]  1[parallel=2]  2[]  3[]  4[]
      //
      //   Channel is checked: 0 is first - play, check next,
      //   1 doesn't exist or isn't listed in 0's parallel - break.
      //   0 starts playing and sets own parallel to [1, 4].
      //   1 isn't playing but is listed in earlier parallel-s - start it.
      //   2 isn't listed - break.
      //   Then 1 sets parallel on itself to [2] and channel is again checked:
      //   0 and 1 are part of parallel lists, 2 isn't playing and is listed - start it.
      //   3 isn't listed - break.
      //   As a result, 4 is never started parallel even though it's listed in 0.
      //   3 is also played alone, when 0, 1 and 2 finish.
      //   If 0 ends before 1, 1 still continues to play. Same if 1 ends before 2.
      //
      // It's the client's job to ensure simultaneous transitions (using `'parallel) don't misuse shared resources. For example, if a creature is hit and then moves, you might normally want to animate the hit in background with other animations, but when a move is of the same creature - you need to wait until its hit ends before playing the movement. Do this by maintaining a map of object => array of running transition and delay tick of new transition affecting objects already in use.
      parallel: null,
      // + Map.Transition options (whose names don't conflict with existing _opt)
      // + local Screen-specific options
    },

    events: {
      '-change': function (name, now, old) {
        switch (name) {
          case 'playing':
          case 'ending':
          case 'aborting':
          case 'parallel':
            _.log && _.log('Transition %s view %s %s = %.j <- %.j : %s', this._parentKey, this._cid, name, now, old, this.get('channel'))
        }
      },

      change_collect: function (now, old) {
        // First-time collect() is called by _parent after nest_TYPE.
        old == null || this.collect(this.get('transition'), now)
      },

      change_final: function (now) {
        if (now) {    // not during init
          this.final(this.get('transition'))
          this._parent._playNext(this.get('channel'))
        }
      },

      change_parallel: function (now) {
        // parallel may be delayed due to batching and the view can be removed
        // (aborted or ended playing) before it's dispatched.
        this._parent && this._parent._playNext(this.get('channel'))
      },

      change_playing: function () {
        if (this.get('aborting')) {
          throw new Error('Cannot play an aborted Transition.')
        }
        this.listen()
        this.play()
      },

      change_ending: 'end',

      attach: function () {
        this.autoOff(this.get('transition'), {
          change: Common.batchGuard(3, function ($1, $2, $3, options) {
            var assign = {}
            options.batch.forEach(function (event) {
              if (event[0] == 'change') {
                var name = event[1]
                if (!_.has(this._opt, name)) {
                  this._reflecting.push(name)
                } else if (!_.includes(this._reflecting, name)) {
                  return
                }
                assign[name] = event[2]
              }
            }, this)
            this.assignResp(assign)
          }),
        })
      },

      '-unnest': function () {
        this._parent && this.set('ending', true)
      },
    },

    // Immediately cancels playback (started or queued) of this view.
    //
    // In most cases it is expected that transition jumps straight to final values upon remove, e.g. the animated element is moved into last position.
    //
    // Clients not overriding `'play should not call remove() directly. abort() can be called at any time.
    abort: function () {
      this.set('aborting', true)
      return this.remove()
    },

    // ` `#abort()-s self if `'id object is removed before this view ends playing.
    //
    // For calling when final is true (usually from `'listen). Assumes id exists.
    //
    // For transitions that have just one collect step and that use collectFinal(), calling this method from final guarantees abort if id is removed or have properties changed before/during playback.
    listenForObject: function (id, options) {
      options = options || {}
      var objects = this._parent.get('map').objects
      var n = objects.toContiguous(id, 0, 0, 0)
      var owner = objects.propertyIndex('owner')
      var props = _.values(_.pick(objects.schema(), options.props || ['owner', 'x', 'y', 'z'], _.forceObject))
      this.autoOff(objects, [
        'oremove_n_' + n,
        function () {
          _.log && _.log('Transition %s view %s aborted by oremove of %d : %s', this._parentKey, this._cid, id, this.get('channel'))
          this.abort()
        },
        'ochange_n_' + n,
        function ($1, $2, prop, now, old, opt) {
          if (_.includes(props, prop) &&
              !_.includes(options.allowTransitions || [], opt.transition) &&
              (prop != owner || now != options.allowOwner)) {
            _.log && _.log('Transition %s view %s aborted by ochange of %d.%d to %.j <- %.j : %s', this._parentKey, this._cid, id, prop, now, old, this.get('channel'))
            this.abort()
          }
        },
      ])
      return n
    },

    //! `, +fna=function ( [cur] )
    // Executes the transition in a generic way, calling `'remove() in the end.
    //
    //> cur int`, omitted = 0 `- first step to execute
    //
    // Calls `'tick() the number of times specified in `'ticks `'_opt'ion (default is coming from `@Map.Transition`@ but view's value may be changed). Each call receives a growing 0+ number in order - but not necessary all (or any) ticks will be called before `'end occurs (see `#abort()). For this reason do cleanup in `'end or `'change_aborting, not on last tick.
    //
    // Does nothing if this is `'aborting.
    //
    // Override this to implement a custom running routine.
    play: function (cur) {
      cur = cur || 0
      if (this.get('aborting')) {
        // Oh, aborting? Okawari!
      } else if (cur >= this.get('ticks')) {
        this.remove()
      } else {
        _.log && _.log('Transition %s view %s playing tick %d/%d : %s', this._parentKey, this._cid, cur, this.get('ticks'), this.get('channel'))
        var async = new Common.Async
        // Hooking abort rather than end so that async's on-abort executes while
        // transition is still playing. Otherwise clean-up on transition could
        // be performed before async's abort runs. For example, H3.DOM.Combat
        // has _lockCreatures() that ensures certain DOM nodes are used by one
        // transition at a time, allowing pending transitions to continue after
        // the locked transition end-s; however, the locked transition's abort
        // would likely access those nodes and this access should happen while
        // they are still locked (before the pending transition commences), i.e.
        // before end - that is, on abort (in non-reentrant change_aborting).
        var ev = this.on('change_aborting', function () {
          async.sink('abort', [], true)
        })
        async.fuse('abort', function () { async.set('status', false) })
        // A helper method for clients.
        async.sequence = Screen.Transition.Sequence.prototype.sequence
        this.tick(async, cur)
        async.whenSuccess(function () {
          this.off(ev)
          this.play(cur + 1)
        }, this, Infinity)
        async.whenError(this.abort, this, Infinity)
        async.doneIfEmpty()
      }
    },

    // When transition `'end-s, calls `'func (`'remove by default, subject to `'expandFunc) in `'sqim
    // context.
    //= sqim
    // A shortcut to hooking `'end and calling `[sqim.func()`] from there.
    release: function (sqim, func) {
      this.fuse('end', func || 'remove', sqim)
      return sqim
    },

    // function (transition, now)
    // Signals that world is about to change or has been changed and that the state needed for transition playback must be collected now.
    //
    // now is arbitrary, type-specific (but usually a 0+ number).
    collect: Common.stub,

    // function (transition)
    // Occurs when this transition can start playing.
    final: Common.stub,

    // Sets up hooks to abort() this view when objects it was meant for are gone in such a way that makes playing the view meaningless (e.g. level-up window for removed hero).
    //
    // This is done on client even though server could track this in a centralized manner to allow custom behaviour by Screen in lieu of invalidated transition.
    listen: Common.stub,

    // function (async, tick)
    // Occurs in the beginning of transition playing a particular `'tick.
    //
    // Note: `'async is `'_owning so don't nest an Async coming from another `'_owning collection, such as from `#RPC - create an intermediate object if you do:
    //[
    //  tick: function (async) {
    //    // Wrong: do() returns an Async that it owns.
    //    async.nest(this.rpc.do('foo'))
    //    // Correct:
    //    async.nest(new Common.Async({owning: false}))
    //      .nest(this.rpc.do('foo'))
    //  },
    //]
    tick: Common.stub,

    // Signals removal of this view.
    //
    // May trigger at any time. Called exactly once (even if remove() is called multiple times). At this point _parent and events are still present (autoOff() is called later). If a non-parallel transition is aborted, end is called before any other transition starts playing.
    end: Common.stub,
  })

  // Helper object for implementing complex asynchronous playback during `@Screen.Transition`@ `'tick.
  //
  // Can be created by calling `'sequence() on the `'Async object returned by `'run().
  //
  // Provides automatic `'abort with phase-based do/undo. For example, if there are 3 phases (`'tick-s) to play but only 2 were played before view was aborted then clean-up (in reverse order) occurs for 2 phases only.
  //
  // Allows nested `#Sequence-s (given this class is an `#Async).
  Screen.Transition.Sequence = Common.Async.extend('HeroWO.Screen.Transition.Sequence', {
    _done: -1,

    _opt: {
      playing: '',    //= '', do, undo
      tick: -1,
      arguments: [],    // tick => Arguments
    },

    events: {
      init: function () {
        this.next = this.next.bind(this)
        this.repeat = this.repeat.bind(this)
        this.end = this.end.bind(this)
      },

      // '^' guarantees we react to the change out of normal event order. It is particularly important because this is an Async owned by another Async (of play()); if this succeeds or fails, we must start emitting change_tick via assignResp() but without '^' they would be dispatched after draining the batch (with the success/error event fired first), triggering the parent's on-completion hook and change_tick getting to run and fire undo_TICK much later.
      '^change_tick': function (now, old) {
        _.log && _.log('Transition Sequence %s : %s_%d', this._cid, this.get('playing'), now)
        // This is not to call undo_TICK if do_TICK was queued but abort() somehow occured before it was fired.
        this._done += this.get('playing') == 'do' ? +1 : -1
        this.fire(this.get('playing') + '_' + now, this.get('arguments')[now])
      },

      'success, error': function () {
        while (this._done >= 0) {
          this.assignResp({
            playing: 'undo',
            tick: this._done,
          }, {forceFire: true})
        }
      },

      abort: function () {
        this.isLoading() && this.set('status', false)
      },
    },

    // If nesting new Sequence(s), use parent as a generic Async without next()/end().
    sequence: function () {
      return this.nest(new Screen.Transition.Sequence)
    },

    next: function (/*...args*/) {    // bound
      this.isLoading() && this.assignResp({
        playing: 'do',
        tick: this.get('tick') + 1,
        arguments: this.get('arguments').concat(arguments),
      })
    },

    repeat: function () {   // bound
      this.isLoading() && this.set('tick', this.get('tick'), {forceFire: true})
    },

    end: function () {  // bound
      _.log && _.log('Transition Sequence %s end', this._cid)
      this.isLoading() && this.assignResp({playing: '', status: true})
    },

    // Call this from within `'do_N to delay next tick for `'ms.
    timer: function (ms, func) {
      _.log && _.log('Transition Sequence %s timer on %d : %dms to %s', this._cid, this.get('tick'), ms, func || 'next')
      var timer = setTimeout(this[func || 'next'], ms)
      this.fuse('undo_' + this.get('tick'), function () { clearTimeout(timer) })
      return timer
    },

    // Performs the action associated with Nth tick.
    //
    // Possibly asynchronous. Must call next() or end() at some point.
    //do_N: function (...args)

    // Frees resources associated with the performed Nth tick.
    //
    // Must be synchronous (occurs in response to abort and Transition.play() expects abort to be sync).
    //undo_N: function (...args)
  })

  return Screen
})