define(['Common', 'Map', 'Calculator', 'require'], function (Common, HMap, Calculator, require) {
  "use strict"
  var _ = Common._

  // Collection of delayed asynchronous non-serializable (cancelable) functions (for example, a `'do() call on `#RPC). Available as `#Context.`'idleTasks.
  var IdleTasks = Common.Sqimitive.extend('HeroWO.Context.IdleTasks', {
    _tasks: null,
    _timer: null,
    _nextRun: 0,

    _opt: {
      timeQuota: 100,   // ms; Infinity to call synchronously
    },

    events: {
      '-unnest': 'clear',
    },

    clear: function () {
      _.log && _.log('Clearing %d IdleTasks', (this._tasks || {} /*NaN*/).length)
      this.stop()
      this._tasks = null
    },

    stop: function () {
      clearTimeout(this._timer)
    },

    removeOfContext: function (cx) {
      if (this._tasks) {
        this._tasks = this._tasks.filter(function (item) { return item[1] !== cx })
      }
    },

    // func is not guaranteed to be called and client won't be notified if it is cancelled (this happens when game is saved or screen changes to '') - world must retain integrity even in this case. These tasks are not serialized and therefore can use references to run-time objects. There may be arbitrary delay (beginning with an immediate call) before first scheduled func is called. Queue is flushed in order of scheduling. Exceptions within func are not caught. If a related object is removed, client must remove tasks it has queued (see removeOfContext()). Because this is meant for world-changing tasks, there should be no need to use this on slave.
    queue: function (func, cx) {
      // In debug mode, call the function immediately; in many cases (e.g. AI vs
      // AI combat) this will result in a tight loop allowing to catch various
      // bugs in handling Sqimitive events (wrong order, Module not yet
      // rendered, etc.). Plus it's faster and you get proper exception traces.
      //
      // In production, run tasks once in a while, observing how much time they take to minimize lags in the UI. Additionally, WebSocket.Server delays tasks by the number of accumulated events not yet ack'ed by clients to avoid overflowing the buffer when AI is generating lots of SEs in the beginning of its turn.
      if (this._tasks) {
        this._tasks.push(arguments)
      } else {
        this._tasks = [arguments]
        this._run()
      }
    },

    _run: function () {
      this.stop()
      var quota = Math.min(this.get('timeQuota'), this.now() - this._nextRun)

      while ((this._tasks || [] /*clear() called*/).length) {
        if (quota < 0) {
          _.log && _.log('Defer IdleTasks, over (%d) timeQuota (%d)', quota, this.get('timeQuota'))
          // Wait for at most timeQuota even if last _call() took more than that value (or even Infinity).
          this._nextRun = 0
          return this._timer = setTimeout(Common.ef('_run', this), this.get('timeQuota'))
        }
        quota -= this._call()
        this._nextRun = this.now() - quota
      }

      this._tasks = null
    },

    _call: function () {
      var time = this.now()
      var item = this._tasks.shift()
      item[0].call(item[1])
      return this.now() - time
    },

    now: function () {
      return Date.now()
    },
  })

  // Represents an engine instance.
  //
  // ` `#Context is a high-level abstraction that deals only
  // with the loaded `#Map (if a game has or is about to begin)
  // and root DOM node (`'el) - for all
  // presentation regardless of the drawing backend (like `#DOM or `'Canvas),
  // game style (e.g. HoMM 3's `@H3.UI`@), layout of `#Screen-s, etc.
  //
  // All engine objects are implemented as `#ContextModule-s and accessible
  // via `#modules property (see `#ModuleContainer). `#Screen, which is a "specialized
  // `'Context" for active game only, is both a `#ContextModule and a
  // `#ModuleContainer for nesting `#ScreenModule-s.
  //
  // Modules may be supplied by `#Map (`'modules `'_opt) or client. The first are added automatically by `#game() (such as
  // a SoD map specifying the `#H3 module). The second
  // are added by the client (such as `[Entry.Browser.js`] adding `#Screen) when there is a transition from the empty
  // `'screen to a non-empty `'screen like `'game:
  //[
  //  context.on('change_screen', function (now) {
  //    if (now == 'game') {
  //      screen.addModule('-', H3.DOM.UI)
  //    }
  //  })
  //]
  // It's equally possible to add modules during an active game
  // (in fact, this is happening all the time) - just remember that non-`'persistent modules (i.e. most of them) are
  // removed when changing `'screen.
  //
  // With `#Context being the ultimate root, the engine is split into two
  // main parts:
  //* data store - represented by a `#Map holding several `#ObjectStore-s,
  //  accessible via `[context.map`] after `#game()
  //* visual presentation - encapsulated by `#Screen-s, one per each human
  //  player or observer, created by the caller
  //
  // The `'game state (value of the `'screen `#_opt) is the main one.
  // Other states are supplimentary (there also used to be `'menu but none currently exist).
  // The empty `'screen represents uninitialized state.
  //
  //? The usual `#Context lifecycle:
  // `[
  //   var cx = new DOM.Context
  //   cx.on('change_screen', function (now) {
  //     if (now == 'game') {
  //       var sc = cx.addModule(Screen, {player: human_player_number})
  //       sc.addModule('ui', DOM.UI)
  //     // ...
  //   })
  //   cx.attach('#root')
  //   cx.menu()
  //   // And/or:
  //   cx.game({url: 'path/to/the/map/'})
  //   // when finished and want to clean up the document:
  //   cx.remove()
  // `]
  var Context = Common.Sqimitive.extend('HeroWO.Context', {
    mixIns: [Common.ModuleContainer],
    // The map being currently played.
    //= `@Map.Indexed`@`, null before `#game()
    //#ro
    // Do not change.
    map: null,
    // Convenient access to players on the current map.
    //= `@Common.Sqimitive`@ with `@Map.Indexed.Player`@`, null before `#game()
    // This property is a shortcut to `[context.map.players`].
    // Includes neutral player.
    //#-ro
    players: null,
    _async: null,
    _fetchData: null,
    _shared: null,
    _pathFindTimer: null,
    _pathFindStats: [],
    _lingerTimer: null,
    _loadingTime: 0,
    //= IdleTasks
    idleTasks: null,
    //= Common.Async where each child represents a parallel process such as an AI player taking turn, each with `'pause and `'paused `'_opt; see `'init below for details
    backgroundTasks: null,

    //> screen `- Global engine state, one of:
    //  `> empty `- `#leave(); uninitialized engine, ready to transition
    //  `> game `- `#game()
    //  Transition to empty `'screen clears all non-`'persistent modules resetting the engine.
    //  Transition from a non-empty `'screen to another non-empty `'screen is
    //  forbidden.
    //
    //  There is no reason to change this manually. Call the helpers instead.
    //
    //> loading bool `- Brings up a modal (blocking) loading screen.
    //  Can be combined with any `'screen. There is no reason to change this.
    //
    //> allowUserModules bool `- Enables loading of map-specific modules provided
    //  by the map, outside of `#Context's JavaScript code base.
    //  Affects only subsequent `#game() calls.
    //  User modules are specified as an URI rather than bare-bone identifier:
    //  `[
    //    "modules": ["Std.Module", "./map-module.js", "//out.side/module.js"]
    //  `]
    //
    //> classic bool `- if enabled, make the game behave as close to the original
    //  HoMM 3 series as possible by disabling interaction enchancements (mouse
    //  wheel, map dragging, etc.)
    //
    //> master bool `- Determines if this instance of the game can manipulate the world directly.
    //  If unset, some other `'Context (possibly remote `#RPC) does this.
    //  This does not have to match the game's "host" flag which is set for player(s) granted special
    //  powers like ability to kick players. If this is unset, it doesn't imply the game is in multi-player mode - it may be single-player (or hotseat) if a WebWorker is used to carry expensive calculations (test `'backend for that).
    //
    //  This must be set before calling `#game().
    //
    //> backend str `- Specifies the computational backend managing this game.
    //  `> browser `- Everything is running in a single web page session.
    //     `'master is always `'true. Single-player or hotseat game modes.
    //  `> worker `- Same as `'master but a WebWorker is handling most of the
    //     tasks. `'master is `'true inside the `'Worker and `'false on the
    //     user's initial web page.
    //  `> server - Different page sessions connected via `'WebSocket to a
    //     Node.js server. `'master is `'true on the server side and `'false in
    //     players' browsers. Multi-player game mode.
    //
    //> lingerCalc int `- If positive, a `'release()'d `#calculator() is not
    //  `'remove()'d immediately but kept for approximately this many ms and
    //  removed if nobody has `'take()'n it during this time. Do not change
    //  this option after construction.
    //
    //  Often a user's operation
    //  (like screen change) causes a `#Calculator to become released by the old
    //  screen and taken by the new one, and given a sole reference to that `#Calculator this
    //  process causes its removal and subsequent re-creation. `'lingerCalc is useful in
    //  production but should be disabled when debugging because it
    //  introduces non-determinism while asynchronicity makes step-through impossible.
    //
    //> configuring null`, Async `- If game() options.configure was set, this
    //  is set to Async on dataReady. Clients willing to pause map start-up
    //  should nest into Async on change_configuring. Allows the user to
    //  configure the new game. Once Async resolves, this option is set to null and
    //  the game either begins or is cancelled. This is only for optional configuration that the user may skip; if you need to do something while Map is not fully loaded, hook dataReady.
    //
    //> dataReady bool `- State of map data loading. See `#dataReady().
    _opt: {
      screen: '',
      loading: false,
      configuring: null,
      dataReady: false,
      allowUserModules: false,
      classic: false,   // XXX=R move to Screen?
      master: false,
      backend: '',
      lingerCalc: 0,
    },

    events: {
      init: function () {
        this._shared = new WeakMap
        this.idleTasks = new IdleTasks

        this.backgroundTasks = new (Common.Async.extend({
          _childEvents: ['change_paused'],

          _childClass: Common.Async.extend({
            _opt: {
              pause: false,   // signals the task to become paused
              paused: false,  // whether the task is running
            },

            events: {
              change: function (name, now, old) {
                switch (name) {
                  case 'pause':
                  case 'paused':
                    _.log && _.log('Background task %s = %.j <- %.j : %s', name, now, old, this._cid)
                }
              },
            },
          }),
        }))

        this.modules.fuse('unnested', function (module) {
          _.log && _.log('Removed ContextModule %s:%s', module._cid, module)
        })

        var time = this.get('lingerCalc')
        this._lingerTimer = time && setInterval(Common.ef('_releaseLingeringCalc', this), time)

        this._pathFindTimer = setInterval(function () {
          var stats = this._pathFindStats.splice(0)

          if (stats.length) {
            stats.sort(Common.compare)
            var mid = stats.length / 2
            var median = mid % 1 === 0 ? stats[mid]
              : (stats[mid -= 0.5] + stats[mid + 1]) / 2

            console && console.info(_.format('Pathfinding: %d requests, %d/%d/%d min/med/max ms',
              stats.length, _.min(stats), median, _.max(stats)))
          }
        }.bind(this), (_.debug ? 30 : 120) * 1000)
      },

      unnest: function () {
        // This clears _async, etc. and lets change_screen hooks treat Context removal as if it were first changing to empty 'screen'.
        this.set('screen', '')
        clearInterval(this._lingerTimer)
        clearTimeout(this._pathFindTimer)
      },

      '-render': function () {
        _.log && _.log('Rendering')
      },

      '+normalize_master': Common.normBool,

      normalize_screen: function (now) {
        if (now && this.get('screen')) {
          throw new Error('Cannot transition from a non-empty to a non-empty screen.')
        }
      },

      change_screen: function (now, old) {
        if (now) {
          _.log && _.log('Random seed = %d', Common._.seed())
        } else {
          this.idleTasks.clear()
          this.backgroundTasks.clear()
          this._async && this._async.clear()
          this.modules.each(function (m) { m.persistent || m.remove() })
          this.map && this.map.remove()
          this.map = null
          this.set('dataReady', false)
        }
        this._shared = new WeakMap
      },

      change_loading: function (now) {
        if (now) {
          this._loadingTime = Date.now()
        } else {
          _.log && _.log('Loading finished in %dms', Date.now() - this._loadingTime)
        }
      },

      change: function (name, now, old) {
        if (name == 'configuring') {
          now && (now = true)
          old && (old = true)
        }
        _.log && _.log('Context.%s = %j <- %j', name, now, old)
      },
    },

    // The purpose is to detect most common discrepancies. For this reason players,
    // victory, etc. are not checked but only objects, effects and shroud, which are the most often
    // updated stores.
    contentHash: function () {
      return [
        _.crc32(this.map.objects.contentHash()),
        _.crc32(this.map.effects.contentHash()),
        this.map.shroud && _.crc32(this.map.shroud.contentHash()),
      ]
    },

    // Makes a request for data.
    //> type - namespace
    //> root str`, null `- some kind of blackbox "root directory" (URI, path, etc.); usually includes trailing slash
    //> file - relative URL; must end on `'.json if data should be parsed as JSON
    //= Async with `'response property available after `'whenSuccess()
    // Well-known `'type-s:
    //> HeroWO.Map
    //> HeroWO.H3.Databank
    // Base implementation doesn't do any fetching. It looks data up in `'_fetchData, under these keys: `'type, `'root, then all path components (`[/`]) of `'file (if last component, the file name, ends on `'.json, the extension is removed). For example, `[databank/constants.json`] is read from `[_fetchData[type][root].databank.constants`]. If no key exists, returned `'Async has the ``status of `'false.
    //
    // This is only used for some data. Other data, like map images or JS modules, is retrieved separately (and may use options like `#Map's `'url or `'require).
    //
    // When running in browser, `#fetch() is overridden by `[DOM.Context`]'s AJAX-based implementation.
    fetch: function (type, root, file) {
      var data = this._fetchData
      var parts = [type].concat(file.split('/'))
      root == null || parts.splice(1, 0, root)

      while (data != null && parts.length) {
        var part = parts.shift()
        if (!parts.length) {
          part = part.replace(/\.json$/, '')
        }
        data = data[part]
      }

      // Setting these options for diagnostic.
      var res = new Common.Async({type: type, root: root, file: file})

      if (data == null) {
        _.log && _.log('Requested %s file %s from %s is missing in _fetchData', type, file, root)
        return res.set('status', false)
      } else {
        res.response = data
        return res.set('status', true)
      }
    },

    leave: function () {
      if (this.get('screen') != '') {
        if (!this.ifSet('loading', true)) {
          throw new Error('Context is currently loading.')
        }

        this.set('screen', '')
        this.set('loading', false)
      }
    },

    // Loads a `#Map and starts the `'game.
    //
    //> options `- object with keys:
    //  `> url string `- location of map files (`[map.json`] and others);
    //     mostly for fetch() and may be unused
    //  `> data object `- pre-fetched map data, for `'_fetchData; the way this
    //     is actually used depends on `'fetch(), which may be overridden
    //  `> cause string `- optional loading initiator; currently, `'rpc is given by `@RPC.WebSocket.Connector`@ and `@Entry.Browser`@ in WebWorker mode
    //  `> configure bool
    //  `> master bool
    //  `> backend bool
    //
    // `'game() transitions to empty `'screen (`#leave()), sets the `'loading `#_opt,
    // transitions to `'game, creates a new `@Map.Indexed`@ instance (later accesible
    // as `#map) and starts asynchronous tasks like `@Map.fetch()`@. After them,
    // loads modules required by the map (`#addModule()), becomes `#dataReady, does `#alterSchema(), renders
    // (`@ModuleContainer.render()`@) and finally disables `'loading.
    //
    // Doing `#game() on an already running game stops that game and restarts.
    // Thus, one `#Context can be used to enter and leave `'screen-s freely
    // but doing so resets it, requiring to add any user modules again which
    // the client typically does in response to `'change_screen.
    //
    // If any sub-`'Async fails (`'status becomes `'false), `'game() is cancelled and `'screen is reset to blank.
    game: function (options) {
      this.leave()
      this.set('loading', true)
      this.assignResp({
        screen: 'game',
        master: options.master,
        backend: options.backend,
      })

      this._async = new Common.Async
      this._fetchData = options.data
      this._fetchMap(options)

      this._async.whenSuccess(function () {
        this.dataReady(options)
      }, this, 1)

      this._async.whenSuccess(function () {
        this.alterSchema(this.map)
        this.render()
        this.set('loading', false)
      }, this, Infinity)

      this._async.whenError(function () {
        this.set('screen', '')
        this.set('loading', false)
      }, this, Infinity)
    },

    // Occurs when basic map data was loaded. Context may become paused at this point (`[options.configure`] given to `#game()) if waiting for user to configure the new game before continuing the start-up.
    //
    // Officially, (normal) modules should make changes to the world once alterSchema() fires. Changing from dataReady is possible but considered low level and to limit impact of future changes only menu modules should do this, in response to change_configuring (one of now/old is always null).
    //
    // queueLoading() in dataReady won't prevent other dataReady hooks from running - for this new Async should be queued before dataReady fires.
    //
    // One can listen to change_dataReady or dataReady. From the first one can determine if dataReady has already occurred in the past without hooking dataReady, and also butt in between dataReady and setting up of configuring (change_configuring from null to non-null). With the second one can obtain options given to game().
    dataReady: function (options) {
      _.log && _.log('Context dataReady in %dms : configure=%j', Date.now() - this._loadingTime, options.configure)

      this.set('dataReady', true)

      if (options.configure) {
        function unset() {
          this.set('configuring', null)
        }

        var async = this.queueLoading()
        async.whenComplete(unset, this)
        this._async.whenError(unset, this)
        this.set('configuring', async)
        async.doneIfEmpty()
      }
    },

    // Adds new `#Async object to the queue during initial `'screen `'loading.
    //
    //> async Async`, object for short `'nest() form`, missing = `'{}
    //
    // Can be used by `#Map modules to load resources or modules necessary for the game
    // (from `'owned).
    // This is an early pre-`'attach stage where only `#Context's `#map and
    // `#players are available but `#Module's properties are not.
    //
    // Note: this takes ownership of `'async. Do not use the same `'async in other `'_owning collections.
    //
    //?`[
    //     Common.Sqimitive.extend('MyCorp.MyMainModule', {
    //       mixIns: [Common.ContextModule],
    //
    //       events: {
    //         owned: function () {
    //           var async = this.cx.queueLoading()
    //
    //           require(
    //             ['MyCorp.MyMainModule.SomethingFishy'],
    //             function (SomethingFishy) {
    //               this.cx.autoAddModule('-', SomethingFishy)
    //               async.set('status', true)
    //             }.bind(this),
    //             function (error) {
    //               console && console.error(error)
    //               async.set('status', false)
    //             }
    //           )
    //         },
    //       },
    //     })
    // `]
    queueLoading: function (async) {
      if (!this.get('loading') || !this.get('screen')) {
        throw new Error('Invalid state to queue new async loading in.')
      }
      return this._async.nest(async || {})
    },

    //! +ig
    // Prepares resources for the upcoming game. Unlike subsequent
    // initialization (like render()), this is asynchronous.
    //
    // Base implementation simply fires off `@Map.load()`@.
    _fetchMap: function (options) {
      var async = this.queueLoading()

      var map = this.nest('map', this.map = new HMap.Indexed)
        .on({
          '=fetch': function (sup, file) {
            return this.fetch(HMap.name, map.get('url'), file)
          },
          change_state: function (now) {
            now == 'loaded' && this._mapLoaded(async)
          },
        }, this)

      map.set('url', options.url)
      map.load()
    },

    //! +ig
    // Called when `'_fetchMap() has finished loading map data. Base implementation sets `#Context.`'players and `'require()-s map's `'modules.
    _mapLoaded: function (async) {
      this.players = this.map.players

      this.players.each(function (player) {
        player.on({
          change: function (name, now, old) {
            _.log && _.log('Player %d.%s = %j <- %j',
              player.get('player'), name, now, old
            )
          },
        }, this)
      }, this)

      var modules = this.map.get('modules')

      if (!this.get('allowUserModules')) {
        modules = _.filter(modules, function (url) {
          return /^[\w.]+$/.test(url)
        })

        if (modules.length != this.map.get('modules').length && console) {
          console.warn('Inhibited loading user modules: ' +
            _.difference(this.map.get('modules'), modules).join(', '))
        }
      }

      // https://requirejs.org/docs/api.html#errbacks
      //
      // "errback" is not guaranteed to be called once for all failed modules, it may be called several times, with different requireModules. If it was called at least once then on-success will not be called at all. This makes it impossible to listen to "on-complete" because if a module has failed and another has succeeded, we get the errback triggered once, and that's all.
      var self = this
      var successful = []
      var failed = []

      if (modules.length) {
        modules = modules.map(this.expandModuleURL, this)
        _.each(modules, function (url) {
          require([url], loaded(successful, url), loaded(failed, url))
        })
      } else {
        async.set('status', true)
      }

      function loaded(a, url) {
        return function () {
          a.push(url)

          if (successful.length + failed.length == modules.length) {
            if (failed.length) {
              console && console.error('Failed to load map-specific modules: ' +
                                       failed.join(', '))
            } else {
              // Order in Map->$modules may be important since a module can
              // depend on an earlier loaded module.
              _.each(modules, function (url) {
                self.autoAddModule('-', require(url))
              })
            }

            async.set('status', !failed.length)
          }
        }
      }
    },

    // Resolves special syntax in a JavaScript module url for passing to require().
    // Overridden in Context.Fetching to replace leading './' with map's URL.
    expandModuleURL: function (url) {
      return url
    },

    // Entices the environment to display the main menu. Takes arbitrary arguments,
    // except the first is an optional `#Screen.
    menu: Common.stub,

    // Creates and returns a new or `'shared `#Calculator instance.
    //
    //> cls Calculator
    //> options `- special `[{shared: false}`] creates `#Calculator that is only
    //  used by the caller (like a module with `''' key)
    //= Calculator valid until `'screen changes
    //
    // Do not change any `'_opt that affects `#Calculator's key unless `'shared is `'false.
    //
    // `'Calculator is automatically released when no more
    // listeners remain (all have called `'off()).
    //
    // However, if you are doing a one-off calculation without calling `'on(),
    // call `'take()/`'release() manually.
    calculator: function (cls, options) {
      // '%' prevents conflict with regular module keys (which we expect to be
      // identifiers).
      //
      // XXX creating an instance every time calculator() is called just to normalize _opt, call key() and throw it away sounds wasteful
      var key = (options || {}).shared === false ? '' : '%' + (new cls(options)).key()
      var calc = this.modules.nested(key)

      if (!calc) {
        calc = this.addModule(key, cls, options)
        var linger = this.get('lingerCalc')

        if (linger) {
          calc.fuse('=release', function (sup) {
            if (this._references == 1) {
              this._references = 0
              this._releaseAfter = Date.now() + linger
              return this
            } else {
              return sup(this, arguments)
            }
          })
        }
      }

      return calc
    },

    // Creates a new or uses a suitable  Calculator.Effect that for only doing a single calculation.
    oneShotEffectCalculator: function (options) {
      var cls = options.class || Calculator.Effect.GenericNumber
      var key = '%' + (new cls(options)).key()
      if (this.modules.nested(key)) {
        var calc = this.listeningEffectCalculator(options)
      } else {
        var calc = this._effectCalc(_.extend({shared: false}, options))
      }
      return calc.updateIfNeeded()
    },

    // Returns resulting `'value of a single calculation done using a Calculator.Effect.
    oneShotEffectCalculation: function (options) {
      var calc = this.oneShotEffectCalculator(options)
      var res = calc.get('value')
      calc.takeRelease()
      return res
    },

    // Creates a new Calculator.Effect that you can use for multiple calculations, possibly with different selectors. It doesn't listen for world changes to update itself automatically (you can manually call `'updateIfNeeded()).
    changeableEffectCalculator: function (options) {
      return this._effectCalc(_.extend({shared: false, listen: 1}, options))
    },

    // Creates a new Calculator.Effect that listens for world changes and updates itself automatically.
    //
    // Don't pass options like `'update if creating a `'shared calculator.
    listeningEffectCalculator: function (options) {
      // XXX temporary, until counter-based _opt.update is implemented; client may specify desired mode and shared calc will adjust its _opt.update automatically since a user of listening calc with update = false can transparently use an existing calc with update = 'defer' or true (updateIfNeeded() will be a no-op in this case), and a user of update of 'defer' can work with update of true; removing requirement that shared listening calcs must have update of true will allow better calc sharing
      delete options.update

      options = _.extend({
        listen: 2,
        // Normally GUI works best with deferred while master (logic) requires immediate update. For example, Building->$effects are implemented with bindCalculator() on town_buildings; it is expected that adding/removing/changing a town_buildings brings building Effects up to date so that subsequent hireAvailable calculation works for the newly erected dwelling. Because 'defer' has potential to break things, we default to true to be on the safe side, but the caller can override it. Some callers may even use the update of false if they manually invoke updateIfNeeded() and don't listen to change_value.
        //update: _.debug ? true : 'defer',
        update: true,
        prune: _.debug ? 0 : 1,
      }, options)

      var calc = this._effectCalc(options)

      switch (options.update) {
        case 'defer':
          // Delaying update until done loading since 'defer' is usually used in the UI and the UI doesn't need their values until then anyway.
          if (this.get('loading')) {
            calc.fuse('render', 'updateIfNeeded')
            break
          }
        case true:
          calc.updateIfNeeded()
      }

      return calc
    },

    _effectCalc: function (options) {
      var cls = options.class || Calculator.Effect.GenericNumber
      options.map = this.map    // will be used if creating before Context renders
      return this.calculator(cls, options)
    },

    _releaseLingeringCalc: function () {
      var now = Date.now()
      this.modules.each(function (module) {
        if (module._releaseAfter < now) {
          if (module._references) {
            module._releaseAfter = undefined
          } else {
            module.remove()
          }
        }
      })
    },

    // If `'key was not requested during this session (`'screen), calls
    // `'func, remembers and returns its value.
    //
    //> key mixed `- any type valid for `'WeakMap, used as data identifier
    //> func `- called when `'key wasn't yet requested, to provide data to cache
    //> cx object`, mixxing = `'this
    //
    // ` `#shared() internally uses `'WeakMap which means data is automatically
    // evicted when `'key and `'value go out of scope. This also happens when
    // `'screen changes. `#shared() is great for caching `#ObjectStores'
    // `'propertyIndex(), databank features, etc.
    //
    // Use `#shared() only for simple values (plain objects, arrays, scalars),
    // not for sqimitives (`#Module-s, etc.) because their events won't be unhooked
    // when `'screen changes.
    //
    // Avoid using `[this.constructor`] as `'key because it's different for every subclass. Use a static field with a unique object:
    //[
    //  var Base = Common.Sqimitive.extend({
    //    _shared: null,
    //
    //    events: {
    //      init: function () {
    //        this._shared = this.cx.shared(this.constructor.shared, function () {
    //          return {...}
    //        }, this)
    //      },
    //    },
    //  }, {shared: {}})
    //]
    // Usually you'd move `'func to an event like `'_initShared to
    // allow subclasses add custom data. In this case every subclass that hooks
    // the event should override the static `'shared object as well, otherwise
    // the storage will be shared with the base class, leading to problems (sometimes
    // it will have only fields of the base class, sometimes the base class'
    // storage will have fields added by the subclass).
    //[
    //  var Base = Common.Sqimitive.extend({
    //    _shared: null,
    //
    //    events: {
    //      init: function () {
    //        this._shared = this.cx.shared(this.constructor.shared, this._initShared, this)
    //      },
    //    },
    //
    //    _initShared: function () {
    //      return {...}
    //    },
    //  }, {shared: {}})
    //
    //  var Child = Base.extend({
    //    events: {
    //      // Override shared() func:
    //      '+_initShared': function (res) {
    //        res.foo = 123
    //      },
    //    },
    //  // Create private storage:
    //  }, {shared: {}})
    //]
    // A global variable rather than static might be cleaner but subclasses cannot access it if they `'=override the inherited function:
    //[
    //  var sharedKey = {}
    //
    //  var Base = Common.Sqimitive.extend({
    //    events: {
    //      init: function () {
    //        this.cx.shared(sharedKey, ...)
    //      },
    //    },
    //  })
    //]
    //
    // Technically, shared data can be also stored in global variables (in module's scope):
    //[
    //  define(['Common'], function (Common) {
    //    var shared
    //
    //    return Common.Sqimitive.extend({
    //      events: {
    //        init: function () {
    //          shared = shared || ...
    //        },
    //      },
    //    })
    //  })
    //]
    // It will work because there is usually only one HeroWO instance per
    // page. However, this is not necessarily so and therefore global variables are
    // against HeroWO guidelines.
    shared: function (key, func, cx) {
      var value = this._shared.get(key)
      if (!value) { this._shared.set(key, value = func.call(cx || this)) }
      return value
    },

    // function ([key,] cls, options)
    // Adds a new module by its class object `'cls.
    //
    //> key missing = `'_cid`, string
    //> cls a class with a `#ContextModule mix-in
    //> options object extra `'init() `'_opt'ions for `'cls`, null = {} `- `'context is
    //  added automatically
    //
    //= object created `#Module instance
    //
    // Do not call `'attach()/`'render() manually, it's done by `#Context
    // when pertinent.
    //
    // ` `#addModule() can be called at any time and `'screen, even after
    // the `#map was loaded with `#game(). However, order of adding modules may
    // be important for some of them (a module may rely on another one being
    // already added).
    //
    // This calls the underlying implementation in `#ModuleContainer.
    //
    // See also `#Screen's `#addModule().
    addModule: function (key, cls, options) {
      var options = Common.expandAddModule({
        args: arguments,
        type: this.constructor.modules,
        options: {context: this},
        init: [function (module) {
          _.log && _.log('Added ContextModule %s:%s', module._cid, module)
        }],
      })
      return this._addModule(options, this.get('loading') && !options.cls.prototype.persistent && options.cls.prototype.delayRender)
    },

    // Adds a `#ContextModule into self or `#ScreenModule into all current `#Screen-s.
    //
    //= array of added `'cls instances
    //
    // `#addModule() only allows `#ContextModule-s while `#autoAddModule()
    // automatically calls `@Screen.addModule()`@. Call this after you have
    // added all needed `#Screen-s.
    //
    // ` `#Screen-s are usually only present when `'screen is `'game. If there
    // are no `#Screen-s nested, `#autoAddModule() returns `[[]`].
    autoAddModule: function (key, cls, options) {
      var o = Common.expandAddModule({args: arguments})
      if (o.cls.module == this.constructor.modules) {
        return [this.addModule.apply(this, arguments)]
      } else {
        var children = this.childContainers(o.cls.module)
        return _.invoke.apply(this, [children, 'addModule'].concat(_.toArray(arguments)))
      }
    },

    // Returns all nested `#Screen-s.
    //= array of `#Screen
    screens: function () {
      return this.childContainers('screen')
    },

    // Returns nested `#ModuleContainer-s with `'modules matching `'module.
    //> module string like `'screen
    //= array of ModuleContainer
    childContainers: function (module) {
      return this.modules.filter(function (m) {
        return m.constructor.modules == module
      })
    },

    // For every game resource, calculates the value according to `'options, subtracts it from the corresponding `'resources and returns two objects: remaining `'resources after subtraction and subtracted quantities (i.e. the calculated values).
    //
    // XXX move to a better place
    subtractResourcesByCalc: function (resources, options, prefix, mul) {
      prefix = prefix || 'resources_'
      var remaining = {}
      var taken = {}

      var calc = this.changeableEffectCalculator(options).take()
      try {
        _.each(this.map.constants.resources, function (res, name) {
          calc.set('ifResource', res).updateIfNeeded()
          remaining[prefix + name] = resources[prefix + name] - (taken[prefix + name] = calc.get('value') * (mul || 1))
        }, this)
      } finally {
        calc.release()
      }

      return [remaining, taken]
    },

    /* Methods that must be overridden by modules */

    //! +ig +fn=s:context:string
    // Returns localized version of `'string disambiguated by `'context.
    //
    //> context string `- used to disambiguate the translation of `'string,
    //  e.g. when "Yes" can mean different things in different sections of the UI
    //> string `- the string to be localized
    //
    //= string same as `'string if no translation exists
    //
    // The `#String module provides this.
    //
    //?`[
    //   alert(context.s('mainMenu', 'Welcome!'))
    // `]
    s: function (context, string) {
      return string
    },

    //! +ig +fn=template:name:options
    // Returns a compiled function used to format a template.
    //
    //> name `- template name, usually matching the class' name (`[Foo.Bar`])
    //> options object `- semantics is specific to the template engine in use;
    //  for example, the provided `#Templates gives this to `@no@template()`@
    //  (but only if the template wasn't yet compiled)
    //
    //= function accepting `'variables and `'options and returning a string
    //
    //?`[
    //   var tpl = context.template(this.constructor.name)
    //   this.el.html(tpl({Hello: 'World!'}))
    // `]
    template: Common.stub,

    // Finds the optimal path for object `'id from spot `'from (or `'id's actionable spot) to spot `'to.
    //> id
    //> to array `[[x, y, z, n]`] where either `'x/`'y/`'z or `'n may be missing
    //  (`'undefined) but giving all 4 is better for performance
    //> from array in `'to format`, missing to take `'id's current actionable spot
    //> options `- will be mutated
    //= array`, null if unsupported or unreachable`, false if `'from == `'to
    pathFindFor: function (id, to, from, options) {
      var time = Date.now()

      var norm = function (item) {
        if (item[0] == null) {
          var coords = this.map.fromContiguous(item[3])
          item.splice(0, 3, coords.x, coords.y, coords.z)
        } else if (item[3] == null) {
          item[3] = this.map.toContiguous(item[0], item[1], item[2])
        }
      }.bind(this)

// XXX should client include actionableSpot in from when giving this arg?
// XXX should pathFindFor return de-adjusted by act. spot?
// XXX it seems adjusting breaks AI
      from = from || this.map.actionableSpot(id)
      norm(from)
      norm(to)

      if (from[3] == to[3]) {
        return false
      }

      var pathCost = this.pathCostFor(id)
      options = options || {}
      _.has(options, 'disembark') || (options.disembark = true)
      function coster(item, from) {
        options.isDestination = item[3] == to[3] && !options.notDestination
        options.from = from
        return pathCost.costAt(item[0], item[1], item[2], item[3], options)
      }

      var res = this.findPath(from, to, coster)

      if (this._pathFindStats.length < (_.debug ? 50000 : 500)) {
        this._pathFindStats.push(Date.now() - time)
      }

      return res
    },

    //> from
    //> to
    //> costFunc
    //= array, null
    // This is an internal method for use by `#pathFindFor().
    findPath: Common.stub,

    // Used in combat. Provided by PathFind.AStar.Hex.
    makeHexPathFinder: Common.stub,

    // Objects measuring movement over square adventure map and hexagonal combat map. Both are provided by H3.PathCost.
    makePathCost: Common.stub,
    makePathCostHex: Common.stub,

    //> id hero
    //= object with `'costAt() returning < 0 if impassable, null if unsupported,
    //  with `'calculatorAt()
    // Implementers of this should cache the result.
    pathCostFor: Common.stub,

    //> player int
    //= `#RPC
    // May return earlier-created object (RPCs may be shared, e.g. neutralAI and master RPC of H3.Rules).
    makeRpcFor: Common.stub,

    rpcFor: function (player) {
      var rpc = this.makeRpcFor(player)
      this.hookRPC(rpc)
      return rpc
    },

    // May be called for already-hooked RPC.
    hookRPC: Common.stub,

    // Occurs when an object has moved on the adventure map.
    //> x
    //> y
    //> z
    //> actor ObjectRepresentation hero, null `-
    //> remainingCells null if not part of hero move`, int 0+ `- number of path components queued for move (0 means triggering destination's effects)
    //> from null if remainingCells is null`, [x, y, z]
    //> transition null if remainingCells is null`, Transition `- can be used to link with created transtiions
    //= false if can step on spot and continue moving`, 'stop' to stop without stepping`, 'stand' to step and stop`, 'break' to step and continue (triggering effects of next spot) but start new transition and don't update actor's _opt`, 'remove' to immediately skip other effects
    // This method is synchronous but it may produce async side effects by immediately adding new $pending operation(s) that will run before hero moving continues (or stops depending on the returned value).
    triggerSpotEffects: Common.stub,

    // function (Map.Player)
    clientCountsChanged: Common.stub,

    // function (Map.Player)
    //= [count of observers, count of human players]
    clientCounts: Common.stub,
  }, {
    modules: 'context',
  })

  // Represents an engine instance with `'fetch'ing performed by `#JsonAsync.
  //
  // Used as a WebWorker Context (`@Entry.Worker.js`@). Acts as a base class for
  // web browser Context (`@DOM.Context`@).
  Context.Fetching = Context.extend('HeroWO.Context.Fetching', {
    _combined: null,

    //> fetchCombined bool `- if unset, databank and map files are fetched individually (e.g. `[map.json`], `[spot.json`], etc.), else a single large `[combined.json`] file is fetched and others are extracted from it
    //> mapsURL str `- root URL for fetching maps' files (followed by relative map path)
    //> databanksURL str `- root URL for fetching databanks' files (followed by databank -v'ersion)
    _opt: {
      fetchCombined: true,
      mapsURL: '',
      databanksURL: '',
    },

    events: {
      '+expandModuleURL': function (res, url) {
        if (_.startsWith(url, './')) {
          return this.url('HeroWO.Map', this.map.get('url'), url.substr(2))
        }
      },

      change_loading: function () {
        // If now loading - remove old data, if !now - remove already unneeded data to allow GC.
        this._combined = {}
      },

      '=fetch': function (sup, type, root, file) {
        if (this._fetchData) {
          // game() caused by RPC.WebSocket.Connector, with all data provided over WebSocket.
          return sup(this, arguments)
        }

        if (!file.match(/\.json$/)) {
          var cls = Common.FetchAsync
        } else if (!this.get('fetchCombined')) {
          var cls = Common.JsonAsync
        } else {
          var key = type + ':' + root
          var combined = this._combined[key] ||
            (this._combined[key] = new Common.JsonAsync({
              url: this.url(type, root, 'combined.json'),
            }))
          var async = new Common.Async({type: type, root: root, file: file})
          combined.whenComplete(function () {
            async.response = (combined.response || {})[file]
            async.set('status', async.response != null)
          }, null, 1)
          return async
        }

        return new cls({url: this.url(type, root, file)})
      },
    },

    // Returns URL of a game resource relative to current page.
    // See Context.fetch() for the explanation of arguments.
    url: function (type, root, file) {
      // In server mode, non-standard type raises an error since server doesn't allow reading arbitrary files. But in client mode we treat type as an URL prefix which can be useful when tinkering around without the need to update the source code.
      switch (type) {
        case 'HeroWO.Map':
          type = this.get('mapsURL')
          break
        case 'HeroWO.H3.Databank':
          type = this.get('databanksURL')
          break
      }

      return type + (root || '') + file
    },
  })

  return Context
})