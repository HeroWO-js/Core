define(['RPC.Common', 'Calculator', 'ObjectStore', 'Map'], function (Common, Calculator, ObjectStore, HMap) {
  "use strict"
  var _ = Common._

  // XXX=R

  // Offers methods that directly change the game world. Represents server-side view of a client.
  //
  // In single-player mode, each player has its own instance of `#RPC and calls its methods directly, simply bypassing server-client transport layer.
  //
  // In multi-player mode, clients send their requests to the master game server over some transport (such as `'WebSocket) that calls these methods on their behalf.
  var RPC = Common.Sqimitive.extend('HeroWO.RPC', {
    _worldHooks: [],
    _observerMethods: ['start', 'action'],

    _opt: {
      // Internal unique string across all clients past and future, including isSpecial(). Persists on server save/load. Doesn't change for the lifetime of this instance. Available only on master.
      id: '',
      context: null,  // Context
      player: null, // Map.Indexed.Player; when set, context is also set
      // Whether world diffs are being sent as serverEvent-s; available only on master.
      started: false,
      observer: false,
    },

    events: {
      change_started: function (now) {
        now ? this._hookWorld() : Common.off(this._worldHooks.splice(0))
      },

      '-remove': 'reset',
    },

    reset: function () {
      this.set('started', false)
    },

    // Clients call this to make a change to the world.
    //
    // This will never throw - if an exception occurs,
    // it will be stored in returned `'Async's `'errorResponse. If client intends to
    // handle failures, it must call `'whenError() immediately (during this tick).
    // If it doesn't, a `'ClientError will be thrown on the next tick (`#rethrow).
    do: function (method, args) {
      try {
        var func = 'do_' + method
        if (!this[func]) {
          throw new Common.ClientError('Unknown method', Common.CODES.badMethod)
        }
        if (this.get('observer') && !_.includes(this._observerMethods, method)) {
          throw new Common.ClientError('Disallowed for observer', Common.CODES.mustAuth)
        }
        var async = this[func](args || {})
        if (!(async instanceof Common.Response)) {
          throw new Error('RPC method ' + func + ' returned a non-Response object.')
        }
      } catch (e) {
        var async = new Common.Response({status: false, errorResult: e})
      }

      _.defer(function () {
        async.whenError(function () {
          async.get('errorHandlers') > 1 || async.rethrow()
        })
      })

      async.assignResp({method: method, args: args})   // mostly for diagnostic
      return async
    },

    // function (event[, data[, ...]])
    // Called when game server wants to send data back to client(s).
    //
    // data can be omitted (= null) or be any other type.
    // Extra parameters (...) can be used by subclasses.
    //
    // This format is suitable for transmission over WebSocket or EventSource (SSE).
    //
    //   {event: "change", data: {store: "objects", ...}}
    //
    // SSE can be useful e.g. for observer players that don't have control over
    // the world and can work with a r/o stream:
    //
    //   event: change
    //   data: {store: "objects", ...}
    //   id: 123
    //
    //   es.addEventListener('change', function (e) { e.data ... })
    serverEvent: Common.stub,

    do_start: function (args) {
      if (!this.get('context')) {
        throw new Common.ClientError('Context not selected')
      }
      if (!this.get('context').get('screen')) {
        throw new Common.ClientError('Context in invalid state')
      }
      if (!this.ifSet('started', true)) {
        throw new Common.ClientError('Already started')
      }
      var map = this.get('context').map
      var result = {url: map.get('url'), 'HeroWO.Map': {}, configure: !!this.get('context').get('configuring')}
      // Not removing $dynamic Effects but removing transitions (client cannot select a transition that he hasn't seen the creation of).
      result['HeroWO.Map'][map.get('url')] = map.serialize({skipTransitions: true})
      return new Common.Response({status: true, result: result})
    },

    do_stop: function (args) {
      if (!this.ifSet('started', false)) {
        throw new Common.ClientError('Not started')
      }
      return new Common.Response({status: true})
    },

    // For master in multi-player environment, sets up listeners on the world to send diffs to client (as `'serverEvent-s) to keep it up to date.
    _hookWorld: function () {
      var self = this

      // To correctly handle batch() across multiple sqimitives (as below), we need to
      // send a path to each of them to the client.
      //
      //   sqim1.batch([sqim2], function () {
      //     sqim1.set('foo', 1)
      //     sqim2.set('bar', 2)
      //   })
      //
      // After the function given to batch() above returns, RPC.Client must
      // not act as below:
      //
      //   sqim1.batch(null, function () {
      //     sqim1.set('foo', 1)
      //   })
      //   sqim2.batch(null, function () {
      //     sqim2.set('bar', 2)
      //   })
      var locators = new Map

      // Break own references so the removed object can be garbage collected.
      function unhookObject(sqim) {
        locators.delete(sqim)

        for (var i = self._worldHooks.length; i--; ) {
          var hook = self._worldHooks[i]
          if (hook && hook[0] == sqim) {
            Common.off(hook)
            // For stores, unhooking is not strictly necessary because ObjectStore
            // removes all hooks in remove(), but delete is needed, else
            // it'd reference the removed sub-store until RPC is removed.
            delete self._worldHooks[i]
          }
        }
      }

      function unhookStore(store) {
        // Unhook sub-sub-store children, recursively. Calling remove() in
        // this case is okay because the parent sub-store is already inactive.
        _.invoke(store._subStoresRO, 'remove')
        _.each(store._subStores, function (subs) {
          _.invoke(subs, 'remove')
        })
        unhookObject(store)
      }

      // These are individual and generated on every client's side. Don't
      // propagate them (should be harmless though).
      //
      // rep is added by Map.ObjectRepresentation; heavy object, not needed for RPC.Client.
      //
      // sub is added by super-store for events occuring in its sub-stores.
      var batchOptions = _.keys(this._batchOptions()).concat('rep', 'sub')

      function prepareOptions(options) {
        return _.omit(options, batchOptions, _.forceObject)
      }

      var batchGuard = {}

      function batch(event, optionsIndex) {
        return Common.batchGuard(optionsIndex, function () {
          var options = arguments[optionsIndex]
          var sqims = []

          _.each(options.batched, function (item) {
            var sqim = item[0]
            var events = []

            item[1]
              .forEach(function (item) {
                switch (item[0]) {
                  // Sqimitive.
                  case 'change':
                    if (sqim instanceof HMap.Transition) {
                      switch (item[1]) {
                        case 'collect':
                          if (item[3] == null /*select*/) {
                            sqim.getSet('active', Common.inc())
                            sqim.getSet('clients', Common.concat(self.get('id')))
                            break
                          }
                        default:
                          if (sqim.get('collect') == null /*no select yet*/ || _.includes(sqim.get('clients'), self.get('id'))) {
                            // Don't send updates of transition that the client has already tack'ed and removed from own map.objects. Because it removes only final transitions and because final cannot change, this should prevent client from trying to locate a non-existing transition.
                            break
                          }
                        case 'active':
                        case 'clients':
                          return
                      }
                    } else if (sqim instanceof HMap.Combat) {
                      switch (item[1]) {
                        case 'interactiveParty':
                        case 'interactiveCreature':
                          return events.push({
                            method: 'combat_set',
                            // For interactiveParty/interactiveCreature null is legit.
                            args: [item[1], item[2] && item[2]._parentKey, prepareOptions(item[4])],
                          })
                      }
                    } else if (sqim instanceof HMap.Combat.Creature) {
                      switch (item[1]) {
                        default:
                          // Skip ObjectRepresentation-provided properties.
                          if (!_.includes(sqim._properties, item[1])) {
                            break
                          }
                        // Not passing removed on to clients because Creature is removed by removeFromStore() with options, it is caught by our ochange, client receives it and its Map sets 'removed' on the Creature instance.
                        case 'removed':
                          return
                      }
                    }
                    return events.push({
                      method: 'set',
                      args: [item[1], item[2], prepareOptions(item[4])],
                    })
                  // ObjectStore.
                  case 'ochange':
                    if (item[6].sub && item[6].sub != sqim) {  // ignore simulated events
                      return
                    }
                    return events.push({
                      method: 'setAtContiguous',
                      args: [item[1] + item[3], item[2], item[4], prepareOptions(item[6])],
                    })
                  case 'oadd':
                    return events.push({
                      method: 'addAtContiguous',
                      args: [item[1], item[3], prepareOptions(item[4])],
                    })
                  case 'oremove':
                    return events.push({
                      method: 'removeAtContiguous',
                      args: [item[1], item[2], prepareOptions(item[4])],
                    })
                  // Shroud.
                  case 'dispatchRpcSet':
                    return events.push({
                      method: 'shroud_set',
                      args: item[1],
                    })
                }
              })

            // item[1] (sqim's batch) may be empty if sqim had no events of
            // interest to us and has finished firing its set of batched events.
            if (events.length) {
              var locator = locators.get(sqim)
              if (!locator) {
                // Don't mix updates of objects storing base data and dependent
                // objects (indexes) in one batch because the latter are updated
                // individually by every client in response to the formers'
                // updates.
                throw new Error('Batched Sqimitive is not part of the world.')
              }

              locator.updateLocator && locator.updateLocator()
              sqims.push({locator: locator, events: events})
            }
          })

          if (sqims.length) {
            self.serverEvent('batch', {phase: self._contextPhase(), batched: sqims})
          }
        }, batchGuard)
      }

      var change = batch('change', 3)

      function hookCollection(col, locator, prefix, hookChildren) {
        locators.set(col, locator)

        // All world hooks have negative priority to ensure they run before regular engine listeners (the engine doesn't use negative priority, relying solely on event prefixes like "-"). One example when this matters is Map object initialization in H3.Rules:
        // 1. First you call objects.append() (via createObject() or similar)
        // 2. This fires oadd on map.objects
        // 3. An initializer hook on oadd starts changing object and Effect properties
        // 4. Let's say initialization involved filling new hero's garrison; this fires various events on the sub-store
        // 5. RPC's world hook reacts to one of those sub-store events and sends the changeset to client
        // 6. Later, after initialization, RPC's hook on map.objects' oadd reacts to the original object creation (that step 3 predated)
        //
        // As you can see, the order of events is messed up: client sees change in object fields (garrison here) before the object is actually created. Adding priority to our hooks makes sure map.objects' oadd is called after step 6.
        //
        // For the same reason we're marking hooks as out-of-batch. There are several out-of-batch hooks in the engine though (notably those of Effects.BatchIndexUpdater).
        self._worldHooks.push([col, col.on('^-1^change', change)])

        if (hookChildren--) {
          // Hook children that were nested before _hookWorld() was called.
          col.each(function (child) {
            hookCollection(child, locator.concat(col.findKey(child)), prefix, hookChildren)
          })

          self._worldHooks.push([col, col.on('^-1^nestExNew', function (res) {
            // hookCollection() implies children are never re-nested (under a different key; ne-nesting with different pos is allowed) and their _opt are natively serializable into JSON. Therefore res.changed is set when a new child was nested (in which case this server event handles both creation and nesting) and is unset when pos of an existing child was changed.
            if (res.changed) {
              if (res.previous == res.child) {
                throw new Error('Re-nesting child under another key is unsupported.')
              }
              var options = res.child[res.child.serialize ? 'serialize' : 'get']()
              options.pos = res.pos
              var args = [res.key, options]
              self.serverEvent(prefix + 'nest', {phase: self._contextPhase(), locator: locator, args: args})

              hookCollection(res.child, locator.concat(res.key), prefix, hookChildren)
            } else {
              var args = [locators.get(res.child), res.key, res.pos]
              self.serverEvent('renest', {phase: self._contextPhase(), locator: locator, args: args})
            }
          })])

          self._worldHooks.push([col, col.on('^-1^unnested', function (sqim, key) {
            // Transitions are removed by each client as needed (not that sending `'unlist would hurt). Creatures are removed by removing them from ObjectStore.
            if (!(sqim instanceof HMap.Transition) && !(sqim instanceof HMap.Combat.Creature)) {
              self.serverEvent('unlist', {phase: self._contextPhase(), locator: locator, args: [key]})
            }

            sqim.invoke('remove')
            unhookObject(sqim)
          })])
        }
      }

      function hookCombats(combats, locator) {
        locators.set(combats, locator)

        combats.each(function (combat) {
          hookCombat(combat, locator.concat(combats.findKey(combat)))
        })

        self._worldHooks.push([combats, combats.on('^-1^nestExNew', function (res) {
          self.serverEvent('combat_nest', {phase: self._contextPhase(), locator: locator, args: [res.key, res.child.serialize()]})

          hookCombat(res.child, locator.concat(res.key))
        })])
      }

      function hookCombat(combat, locator) {
        locators.set(combat, locator)

        var hooks = []
        self._worldHooks.push(hooks)

        var ev = combat.on('^-1^remove', function () {
          self.serverEvent('remove', {phase: self._contextPhase(), locator: locator, args: []})

          Common.off(hooks.splice(0))
          locators.delete(combat)

          unhookStore(combat.log)

          combat.parties.invoke('remove')
          unhookObject(combat.parties)

          combat.objects.invoke('remove')
          unhookObject(combat.objects)
        })
        hooks.push([combat, ev])

        hooks.push([combat, combat.on('^-1^change', change)])

        hookStore(combat.log, locator.concat('log'))

        // bySpot and children of Party are automatically filled by _attachIndexes().
        hookCollection(combat.parties, locator.concat('parties'), 'combat_', 1)
        hookCollection(combat.objects, locator.concat('objects'), 'combat_', 1)

        hooks.push([combat.queue, combat.queue.on('^-1^nestExNew', function (res) {
          self.serverEvent('combat_queue', {phase: self._contextPhase(), locator: locator, args: [_.pick(res, 'key', 'pos', _.forceObject), res.key]})
        })])

        hooks.push([combat.queue, combat.queue.on('^-1^unnested', function (sqim, key) {
          self.serverEvent('combat_queue', {phase: self._contextPhase(), locator: locator, args: [key]})
        })])
      }

      var ochange = batch('ochange', 5)
      var oadd = batch('oadd', 3)
      var oremove = batch('oremove', 3)

      // Used for both normal and read sub-stores (prototype thereof). The latter can only emit appendSchema and readSub, has [prop, null, null] locator and no superStore (to make updateLocator() do nothing).
      function hookStore(store, locator, superStore) {
        locators.set(store, locator)

        self._worldHooks.push([store, store.on('^-1^ochange', ochange)])
        self._worldHooks.push([store, store.on('^-1^oadd', oadd)])
        self._worldHooks.push([store, store.on('^-1^oremove', oremove)])

        // Making it non-enumerable so that postMessage() in Entry.Worker.js
        // doesn't attempt to serialize it.
        Object.defineProperty(locator, 'updateLocator', {
          value: function () {
            if (superStore) {
              var size = store.size()
              var n = locator[locator.length - 3]
              var prop = superStore.propertyFromContiguous(n)[1]
              locator.pop()
              locator.push({
                // layered gets passed from subAt...() to constructor which copies it to _opt.
                layered: store.get('layered'),
                strideX: size.x,
                strideY: size.y,
                strideZ: size.z,
                // XXX=RH
                schema: store._schema == superStore._subSchemas[prop] ? null : store._schema,
                sub: store._subSchemas == superStore._subSchemas[superStore._schemaLength + prop] ? null : store._subSchemas,
              })
            }
          },
        })

        // Not hooking append() since it's just a combination of _extendBy() and oadd.
        var ev = store.on('^-1^_extendBy', function (x, y, z) {
          locator.updateLocator()
          self.serverEvent('_extendBy', {phase: self._contextPhase(), locator: locator, args: [x, y, z]})
        })
        self._worldHooks.push([store, ev])

        var ev = store.on('^-1^appendSchema', function (addProps) {
          locator.updateLocator()
          self.serverEvent('appendSchema', {phase: self._contextPhase(), locator: locator, args: [addProps]})
        })
        self._worldHooks.push([store, ev])

        function hookSubStore(res, n, l) {
          // subAtContiguous() and readSub() cache resulting object at n/l or prop (n). Need to hook only objects that this RPC hasn't seen yet (remember there may be other Clients hooking the world but each will have its own locators).
          if (!locators.has(res)) {
            hookStore(res, locator.concat(n, l, null), l == null ? null /*readSub*/ : store)

            // Priority is also necessary here because a removed sub's _events
            // and others are set to null.
            var ev = res.on('^-1^remove', function () {
              unhookStore(res)
            })
            self._worldHooks.push([res, ev])
          }
        }

        _.each(store._subStoresRO, function (sub, prop) {
          hookSubStore(sub, prop)
        })

        // Not adding ^-1^ because we need result of the original method and that would cause our hook to run first (with undefined sub). But since I don't expect any listeners on readSub and subAtContiguous that would be changing the world state, missing priority here is acceptable.
        var ev = store.on('+readSub', function (sub, prop) {
          if (sub._layerLength) { sub = sub.__proto__ }
          hookSubStore(sub, store.propertyIndex(prop))
        })
        self._worldHooks.push([store, ev])

        _.each(store._subStores, function (subs, l) {
          _.each(subs, function (sub, n) {
            hookSubStore(sub, n, l)
          })
        })

        var ev = store.on('+subAtContiguous', function (sub, n, l, options) {
          hookSubStore(sub, n, l)
        })
        self._worldHooks.push([store, ev])
      }

      var dispatchRpcSet = batch('dispatchRpcSet', 1)

      function hookShroud(col, locator) {
        locators.set(col, locator)

        // Cannot just listen to 'changes' because it isn't fired when setting a bit that has lower significance than an already set bit (when setAtCoords() returns false).
        function setAtCoords(sup) {
          var args = _.rest(arguments)
          return this.batch(null, function (id) {
            // Multiple Clients may wrap setAtCoords() but _dispatchRpcSet is one per Shroud (all listening Clients generate SE with the same parameters) and there should be only one entry per setAtCoords() call (not an entry per each listening RPC). For this, compare old and new lengths and record if they are the same (i.e. no other RPC has recoded). _dispatchRpcSet can only change as a result of another RPC's hook since we're inside batch() and we assume setAtCoords() and its subroutines are not reentrant.
            //
            // Comparing lengths is more stable than batch IDs. For example, if an RPC disconnects and unhooks setAtCoords() while a batch is running (shouldn't be possible, but still), another RPC (if any) will seamlessly carry on updating _dispatchRpcSet.
            var oldLength = (this._batch._dispatchRpcSet || []).length
            var res = sup(this, args)
            if (res != null) {
              var rpcArgs = this._batch._dispatchRpcSet
              if (oldLength == (rpcArgs || []).length) {
                if (!rpcArgs) {
                  rpcArgs = this._batch._dispatchRpcSet = []
                  // Options are needed for batchGuard() and for our batch().
                  this._batch.push(['dispatchRpcSet', rpcArgs, this._batchOptions(id)])
                }
                // Because we're hooking the method, not the event, _batchOptions may contain duplicate spots if the same spot is changed multiple times during a batch. This increases length of serialized server event but client-side setAtCoords() filters duplicates so it's not a big deal.
                rpcArgs.push(args)
              }
            }
            return res
          })
        }

        self._worldHooks.push([col, col.on('^-1^=setAtCoords', setAtCoords)])
        self._worldHooks.push([col, col.on('^-1^dispatchRpcSet', dispatchRpcSet)])
      }

      var map = this.get('context').map

      hookCollection(map, ['map'])
      // This is not hooked because making a rep part of a batch with its store
      // is useless. Example:
      //
      //   map.objects.batch([hero], function () {
      //     hero.assignResp({x: 1, y: 2})
      //     map.objects.setAtCoords(hero.get('id'), 0, 0, 0, 'visiting', false)
      //   })
      //
      // assignResp() returns, ObjectRepresentation's ^change fires, it does objects.setAtCoords() for 'x' and 'y' but that happens in a separate batch from 'visiting' because hero's batch ends simultaneously with object's so ^change runs after this common batch.
      //
      // In order to combine them into one batch, do this:
      //
      //   map.objects.batch(null, function () {
      //     hero.batch(null, function () {
      //       hero.assignResp(...)
      //       // This line can be moved one line down for the same effect.
      //       map.objects.setAtCoords(...)
      //     })
      //   })
      //hookCollection(map._reps, ['representationOf'], '', 1)
      hookCollection(map.victory, ['victory'], '', 1)
      hookCollection(map.loss, ['loss'], '', 1)
      hookCollection(map.players, ['players'], '', 1)
      hookCollection(map.transitions, ['transitions'], '', 1)

      hookCombats(map.combats, ['combats'])

      hookStore(map.objects, ['objects'])
      hookStore(map.effects, ['effects'])

      map.shroud && hookShroud(map.shroud, ['shroud'])

      function hookConfiguring(now, old) {
        if (!now && old) {
          self.serverEvent('configured', old.isSuccessful())
        }
      }
      var cx = this.get('context')
      this._worldHooks.push([cx, cx.on('^-1^change_configuring', hookConfiguring)])

      // Disable hooks when Context is about to leave 'game'.
      this._worldHooks.push([cx, cx.on('^-1^change_loading', function (now) {
        now && self.set('started', false)
      })])

      // If changing list of hooked objects, update RPC.Client.serverEvent().
    },

    _contextPhase: function () {
      // phase   >-0-------------|-1----------|-2--------------------|-3----->
      // screen  >-''----|-'game'-------------------------------------------->
      // loading >-false-|-true--------------------------------------|-false->
      // dataR-y >-false---------|-true-------------------------------------->
      // conf-ng >-null----------|-new Async--|-null------------------------->
      //                 | game()| dataReady()| conf succ| async succ|
      // conf succ  = _opt.configuring success
      // async succ = Context._async success (triggers alterSchema(), render())
      var cx = this.get('context')
      switch (cx.get('screen')) {
        case '':
        case 'game':
          return !cx.get('dataReady') ? 0
            : cx.get('configuring') ? 1 : cx.get('loading') ? 2 : 3
      }
    },

    /* Gameplay-specific actions. */

    do_action: function (args) {
      if (!this.get('player')) {
        throw new Common.ClientError('Player not selected')
      }
      // Unlike with world-changing events (_hookWorld()), some consumers of
      // 'action' SE may not check phase for simplicity.
      args.phase = this._contextPhase()
      // screen is client-provided (untrusted, may be anything including null).
      // Others are trusted (some exist only in multi-player mode).
      args.player = this.get('player').get('player')
      args.observer = this.get('observer')
      this._sendAction(args)
      return new Common.Response({status: true})
    },

    _sendAction: function (args) {
      // We're in single-player mode. If not, _sendAction is overridden (WebSocket.Server.Client).
      _.each(this.get('context').screens(), function (sc) {
        args.myPlayer = args.player == sc.get('player')
        // XXX=R more correct would be to have some kind of "mini-server" where clients could be attached, ot a list of all created syncs; current implementation works for visual clients (a client per Screen) but not for special clients (like Replay); "mini-server" might also allow cleaner rewrite of H3.Rules' "mini-server" (initializeSinglePlayer()), possibly merging some single/multi-player code
        sc.rpc.serverEvent('action', args)
      })
    },

    do_configure: function (args) {
      if (!this.get('player')) {
        throw new Common.ClientError('Player not selected')
      }
      var map = this.get('context').map
      var async = this.get('context').get('configuring')
      if (!async || map.get('confirming')) {
        throw new Common.ClientError('Game already started')
      }
      if (!this.get('player').get('host')) {
        throw new Common.ClientError('Must be host', Common.CODES.mustAuth)
      }
      switch (args.do) {
        default:
          // May also happen due to insufficient permissions - see
          // WebSocket.Server.Client's override of do_configure.
          throw new Common.ClientError('Invalid operation or context')
        case 'difficultyMode':
        case 'turnLength':
        case 'description':
          map.set(args.do, args.value)
          break
        case 'ai':
          // This is overridden by WebSocket.Server.Client.
          var player = map.players.nested(args.player)
          player.getSet('controller', function (cur) {
            return ++cur >= player.get('controllers').length ? 0 : cur
          })
          break
        case 'begin':
        case 'leave':
          async.nested('rpc').set('status', args.do == 'begin')
          break
      }
      return new Common.Response({status: true})
    },

    do_endTurn: function (args) {
      if (!this.get('player')) {
        throw new Common.ClientError('Player not selected')
      }
      if (this.get('player').get('won') !== false) {
        throw new Common.ClientError('Out of game')
      }
      if (!!args.value != this.get('player').get('interactive')) {
        // pending of _ allows some of AI types (Neutral and Nop) to skip turns regardless if any of objects owned by them is pending because they never initiate pending but other players do. Therefore no-pending-on-endTurn restriction remains enforced if other players are subject to this check.
        if (!args.value && args.pending != _) {
          var map = this.get('context').map
          // Lightweight check only for the player-owned objects. Other objects may still have $pending.
          map.byOwner.findAtCoords(this.get('player').get('player'), 0, 0, 0, function (id) {
            if (map.objects.atCoords(id, 0, 0, 'pending', 0)) {
              throw new Common.ClientError('Objects pending')
            }
          })
        }
        this.get('player').set('interactive', args.value)
        if (!args.value &&
            this._endTurn(this.get('context'), this.get('player'))) {
          this.rules.endRound()
        }
      }
      return new Common.Response({status: true})
    },

    _endTurn: function (cx, player) {
      var all = cx.players
      if (cx.get('classic')) {
        all = all.sort(function (a, b) { return a.get('player') - b.get('player') })
        for (var i = all.indexOf(player); ++i <= all.length; ) {
          if (i == all.length) {
            return true
          } else if (all[i].canTakeTurn()) {
            all[i].set('interactive', true)
            break
          }
        }
      } else {
        // If all connected players have finished making the turn, automatically
        // end turn for the disconnected ones.
        return all.every(function (pl) {
          return !pl.get('interactive') || (pl.isHuman() && !pl.get('connected'))
        })
      }
    },

    do_actHero: function (args) {
      this.checkPlayer({screen: ''})
      var map = this.get('context').map
      try {
        var hero = map.representationOf(args.hero)
      } catch (e) {}
      if (!hero || !hero.isHero || hero.get('owner') != this.get('player').get('player')) {
        throw new Common.ClientError('Invalid hero')
      }
      var actionable = map.actionableSpot(hero.get('id'))
      //var cost = this.get('context').pathCostFor(args.hero)
      //  .costAt(actionable[0], actionable[1], actionable[2], null, {isDestination: true})
      //if (cost != Infinity && cost >= 0) {
      //  hero.getSet('actionPoints', function (cur) {
      //    if (cur >= cost) {
            this.get('context').triggerSpotEffects(actionable[0], actionable[1], actionable[2], hero)
            //cur -= cost
            var cost = true
      //    }
      //    return cur
      //  }, this)
      //}
      return new Common.Response({status: true, result: cost === true})
    },

    do_garrison: function (args) {
      this.checkPlayer()
      var map = this.get('context').map
      var player = this.get('player').get('player')

      function garrisonOf(id, slot, func) {
        slot = parseInt(slot)
        if (isNaN(slot)) {
          throw new Common.ClientError('Invalid slot')
        }
        var type = map.objects.atCoords(id, 0, 0, 'type', 0)
        switch (type) {
          case map.constants.object.type.hero:
          case map.constants.object.type.town:
          case map.constants.object.type.garrison:
            // XXX=I require giving hero to be controller by current player but allow receiving hero to be anyone - except for 'swap' where both heroes must be controlled
            //
            // XXX=I check spatial relations of receiver/giver (if both are heroes - they must be adjacent, if one is town - another (hero) must be garrisoned or visiting)
            //
            // XXX=I check Player._opt.screen*
            //if (map.objects.atCoords(id, 0, 0, 'owner', 0) != player) {
            //  throw new Common.ClientError('Object not controlled')
            //}
            var sub = map.objects.subAtCoords(id, 0, 0, 'garrison', 0)
            try {
              return func(sub, slot, type)
            } finally {
              sub.release()
            }
          default:
            throw new Common.ClientError('Invalid object type')
        }
      }

      function ensureMultiple(sub, fromType) {
        if (fromType == map.constants.object.type.hero) {
          var filled = 0
          sub.find(0, function () { return ++filled >= 2 || null })
          if (filled < 2) {
            throw new Common.ClientError('Garrison would be left empty')
          }
        }
      }

      // XXX=I add checks
      //
      // XXX=I check that hero being entered/left and town are not $pending
      switch (args.do) {
        case 'heroSwap':
        case 'heroLeave':   // from garrisoned to visiting
          this.checkPlayer({screen: 'townscape', screenTown: args.town})
          var vis = map.objects.atCoords(args.town, 0, 0, 'visiting', 0)
          if (args.do == 'heroSwap' ? !vis : vis) {
            throw new Common.ClientError('Invalid town state')
          }
          if (args.do == 'heroSwap' && map.objects.atCoords(vis, 0, 0, 'owner', 0) != player) {
            throw new Common.ClientError('Cannot garrison non-owned hero')
          }
          map.objects.batch(null, function () {
            var gar = this.setAtCoords(args.town, 0, 0, 0, 'garrisoned', vis)
            this.setAtCoords(args.town, 0, 0, 0, 'visiting', gar)
            vis && this.setAtCoords(vis, 0, 0, 0, 'garrisoned', args.town)
            vis && this.setAtCoords(vis, 0, 0, 0, 'visiting', false)
            gar && this.setAtCoords(gar, 0, 0, 0, 'visiting', args.town)
            gar && this.setAtCoords(gar, 0, 0, 0, 'garrisoned', false)
          })
          return new Common.Response({status: true})

        case 'heroEnter':   // from visiting to garrisoned
          this.checkPlayer({screen: 'townscape', screenTown: args.town})
          var gar = map.objects.atCoords(args.town, 0, 0, 'garrisoned', 0)
          if (gar) {
            throw new Common.ClientError('Invalid town state')
          }
          var vis = map.objects.atCoords(args.town, 0, 0, 'visiting', 0)
          if (map.objects.atCoords(vis, 0, 0, 'owner', 0) != player) {
            throw new Common.ClientError('Cannot garrison non-owned hero')
          }
          garrisonOf(args.town, 0, function (town) {
            garrisonOf(vis, 0, function (hero) {
              map.objects.batch(null, function () {
                hero.batch(null, function () {
                  town.batch(null, function () {
                    var maxSlots = 7  // XXX=RH
                    var schema = hero.schema()
                    var heroCreatures = Array(maxSlots)
                    hero.find(schema.creature, function (cr, x) {
                      heroCreatures[x] = cr
                    })
                    town.find(schema.creature, function (cr, x) {
                      var heroX = heroCreatures.indexOf(cr)
                      if (heroX == -1) {
                        while (heroCreatures[++heroX] !== undefined) ;
                        heroCreatures[heroX] = cr
                      }
                    })
                    if (heroCreatures.length > maxSlots) {
                      throw new Common.ClientError('Hero has no room', null, 'noRoom')
                    }
                    hero.extendTo(heroCreatures.length)
                    town.find(0, function ($1, x, $2, $3, $4, n) {
                      var old = town.removeAtContiguous(n, 0)
                      var heroX = heroCreatures.indexOf(old[schema.creature])
                      if (hero.atCoords(heroX, 0, 0, 0, 0) == null) {
                        hero.addAtCoords(heroX, 0, 0, old)
                      } else {
                        var count = hero.atCoords(heroX, 0, 0, schema.count, 0)
                        hero.setAtCoords(heroX, 0, 0, 0, schema.count, count + old[schema.count])
                      }
                    })
                    map.objects.setAtCoords(args.town, 0, 0, 0, 'visiting', false)
                    map.objects.setAtCoords(args.town, 0, 0, 0, 'garrisoned', vis)
                    map.objects.setAtCoords(vis, 0, 0, 0, 'garrisoned', args.town)
                    map.objects.setAtCoords(vis, 0, 0, 0, 'visiting', false)
                  })
                })
              })
            })
          })
          return new Common.Response({status: true})
      }

      return garrisonOf(args.to, args.toSlot, function (to, toSlot) {
        return garrisonOf(args.from, args.fromSlot, function (from, fromSlot, fromType) {
          if (to == from && toSlot == fromSlot) {
            throw new Common.ClientError('Invalid slot')
          }

          return to.batch(from == to ? null : [from], function () {
            // SoD has fixed number of slots but HeroWO doesn't have such a
            // limit and 'garrison' sub-stores can be shorter than 7 slots (unless
            // you modify them, e.g. move a creature into an empty 7th slot).
            to.extendTo(toSlot)
            switch (args.do) {
              case 'split':
                // Source slot must be occupied.
                // Destination slot must be unoccupied or must have the same
                // creature.
                // Source slot must have at least args.take + 1 count.
                var creature = from.atCoords(fromSlot, 0, 0, 'creature', 0)
                var keep = from.atCoords(fromSlot, 0, 0, 'count', 0)
                keep -= args.take
                var toCreature = to.atCoords(toSlot, 0, 0, 'creature', 0)
                if (creature == null || (toCreature != null && toCreature != creature)) {
                  throw new Common.ClientError('Invalid slot')
                }
                if (creature != args.creature) {
                  throw new Common.ClientError('Mismatching creature')
                }
                if (keep <= 0 || !args.take) {
                  throw new Common.ClientError('Nothing to split')
                }
                if (toCreature == null) {
                  to.addAtCoords(toSlot, 0, 0, {
                    creature: creature,
                    count: parseInt(args.take),
                  })
                } else {
                  var toCount = to.atCoords(toSlot, 0, 0, 'count', 0)
                  to.setAtCoords(toSlot, 0, 0, 0, 'creature', creature)
                  to.setAtCoords(toSlot, 0, 0, 0, 'count', parseInt(args.take) + toCount)
                }
                from.setAtCoords(fromSlot, 0, 0, 0, 'count', keep)
                break
              case 'merge':
                // Source and destination slots must be occupied.
                // Creatures in source and destination slots must be the same..
                // Source garrison must have more than 1 filled slot or must not
                // belong to a hero.
                var toCount = to.atCoords(toSlot, 0, 0, 'count', 0)
                var fromCount = from.atCoords(fromSlot, 0, 0, 'count', 0)
                if (toCount == null || fromCount == null) {
                  throw new Common.ClientError('Invalid slot')
                }
                if (from.atCoords(fromSlot, 0, 0, 'creature', 0) != to.atCoords(toSlot, 0, 0, 'creature', 0)) {
                  throw new Common.ClientError('Mismatching creatures')
                }
                ensureMultiple(from, fromType)
                to.setAtCoords(toSlot, 0, 0, 0, 'count', fromCount + toCount)
                from.removeAtCoords(fromSlot, 0, 0, 0)
                break
              case 'swap':
                // Source slot must be occupied.
                // If destination slot is unoccupied, source garrison must have
                // more than 1 filled slot or must not belong a hero; this is
                // irrelevant if moving within the same garrison.
                if (to != from && to.atCoords(toSlot, 0, 0, 0, 0) == null) {
                  ensureMultiple(from, fromType)
                }
                var oldFrom = from.removeAtCoords(fromSlot, 0, 0, 0)
                if (!oldFrom) {
                  throw new Common.ClientError('Invalid slot')
                }
                var oldTo = to.removeAtCoords(toSlot, 0, 0, 0)
                oldTo && from.addAtCoords(fromSlot, 0, 0, oldTo)
                to.addAtCoords(toSlot, 0, 0, oldFrom)
                break
              default:
                throw new Common.ClientError('Invalid operation')
            }
            return new Common.Response({status: true})
          })
        })
      })
    },

    do_dismissHero: function (args) {
      this.checkPlayer()
      var hero = this.get('player').heroes.nested(args.hero)
      if (!hero || this.get('player').heroes.length < 2) {
        throw new Common.ClientError('Invalid hero')
      }
      hero.remove()
      return new Common.Response({status: true})
    },

    do_dismissCreature: function (args) {
      this.checkPlayer()
      var map = this.get('context').map
      try {
        var obj = map.representationOf(args.object)
      } catch (e) {}
      if (!obj || (!obj.isHero && !obj.isTown)) {
        throw new Common.ClientError('Invalid object')
      }
      var sub = map.objects.subAtCoords(args.object, 0, 0, 'garrison', 0)
      try {
        var creature = sub.atCoords(args.slot, 0, 0, 'creature', 0)
        var count = sub.atCoords(args.slot, 0, 0, 'count', 0)
        if (creature == null || creature != args.creature || count != args.count) {
          throw new Common.ClientError('Invalid slot')
        }
        if (obj.isHero && sub.countObjects(false, 2) < 2) {
          throw new Common.ClientError('The would-be empty garrison')
        }
        sub.removeAtCoords(args.slot, 0, 0, 0)
      } finally {
        sub.release()
      }
      return new Common.Response({status: true})
    },

    // XXX this triggers encounters with town's buildings and opens the town's view so user can manipulate it. but there are no checks on whether such manipulations come as a result of do_townscape or not. for SoD this is not a problem since buildings' encounters are all positive (more AP, SP, etc.) but technically this is not correct. it seems the master must track clients' open/close actions of townscapes and require that all town commands happen while a view is opened, and also prevent having more than one town views simultaneously opened
    do_townscape: function (args) {
      if (args.leave) {
        this.checkPlayer({screen: 'townscape', screenTown: args.town})
        this.get('player').set('screen', '')
      } else {
        this.checkPlayer({screen: ''})
        var town = this.get('player').towns.nested(args.town)
        if (!town) {
          throw new Common.ClientError('Invalid town')
        }
        var actionable = this.get('context').map.actionableSpot(town.get('id'))
        this.get('context').triggerSpotEffects(actionable[0], actionable[1], town.get('z'))
      }
      return new Common.Response({status: true})
    },

    checkPlayer: function (opt) {
      if (!this.get('player')) {
        throw new Common.ClientError('Player not selected')
      } else if (!this.get('player').get('interactive')) {
        throw new Common.ClientError('Player not interactive')
      } else if (opt && _.some(opt, function (v, k) { return this.get('player').get(k) != v }, this)) {
        throw new Common.ClientError('Invalid screen')
      }
    },

    do_hireDwelling: function (args) {
      this.checkPlayer()
      if (this.get('player').get('screen') == 'hireDwelling') {
        var standalone = true   // hiring from dwelling or hero
        this.checkPlayer({screenHero: args.hero, screenDwelling: args.dwelling})
        if (args.leave) {
          this.get('player').set('screen', '')
          return new Common.Response({status: true})
        }
      } else {
        this.checkPlayer({screen: 'townscape', screenTown: args.town})
      }
      var map = this.get('context').map
      try {
        var dw = map.representationOf(standalone ? args.dwelling : args.town)
        var obj = standalone ? map.representationOf(args.hero) : dw.get('garrisoned') ? map.representationOf(dw.get('garrisoned')) : dw
      } catch (e) {}
      if (!dw || (standalone ? dw.get('type') != map.constants.object.type.dwelling && dw.get('type') != map.constants.object.type.hero : dw.get('type') != map.constants.object.type.town)) {
        throw new Common.ClientError('Invalid dwelling')
      }
      if (!obj || (standalone && !obj.isHero) || obj.get('owner') != this.get('player').get('player') /*|| map.actionableSpot(obj.get('id')).join() != map.actionableSpot(dw.get('id')).join()*/) {
        throw new Common.ClientError('Invalid hero')
      }
      if (!standalone) {
        var value = this.get('context').oneShotEffectCalculation({
          class: Calculator.Effect.GenericIntArray,
          target: map.constants.effect.target.town_buildings,
          ifObject: dw.get('id'),
        })
        if (!_.includes(value, args.building)) {
          throw new Common.ClientError('Invalid building')
        }
      }
      var value = this.get('context').oneShotEffectCalculation({
        class: Calculator.Effect.GenericIntArray,
        target: map.constants.effect.target.hireAvailable,
        ifBonusObject: dw.get('id'),
        ifBuilding: standalone ? null : args.building,
        ifObject: obj.get('id'),
      })
      if (!_.includes(value, args.creature)) {
        throw new Common.ClientError('Invalid creature')
      }
      if (standalone) {
        var value = this.get('context').oneShotEffectCalculation({
          class: Calculator.Effect.GenericBool,
          target: map.constants.effect.target.hireFree,
          ifBonusObject: dw.get('id'),
          ifObject: obj.get('id'),
          ifCreature: args.creature,
        })
        if (value) {
          throw new Common.ClientError('Cannot hire free creature')
        }
      }
      var av = map.objects.subAtCoords(dw.get('id'), 0, 0, 'available', 0)
      var gar = map.objects.subAtCoords(obj.get('id'), 0, 0, 'garrison', 0)
      try {
        gar.extendTo(7-1)   // XXX=RH
        var slot = 0
        while (gar.anyAtCoords(slot, 0, 0, 0) && gar.atCoords(slot, 0, 0, 'creature', 0) != args.creature) {
          slot++
        }
        if (slot >= 7) {    // XXX=RH
          throw new Common.ClientError('No free slot')
        }
        var x = standalone ? args.creature : args.building
        if (x >= av.size().x || !av.anyAtCoords(x, 0, 0, 0) || av.atCoords(x, 0, 0, 0, 0) < args.count) {
          throw new Common.ClientError('No available creatures')
        }
        var rem = this.get('context').subtractResourcesByCalc(this.get('player').get(), {
          target: map.constants.effect.target.creature_cost,
          ifBonusObject: dw.get('id'),
          ifBuilding: standalone ? null : args.building,
          ifObject: obj.get('id'),
          ifCreature: args.creature,
        }, 'resources_', args.count)
        if (_.min(rem[0]) < 0) {
          throw new Common.ClientError('Insufficient resources')
        }
        this.get('player').assignResp(rem[0])
        gar.batch([av], function () {
          av.setAtCoords(x, 0, 0, 0, 'count', av.atCoords(x, 0, 0, 'count', 0) - args.count)
          if (gar.anyAtCoords(slot, 0, 0, 0)) {
            gar.setAtCoords(slot, 0, 0, 0, 'count', gar.atCoords(slot, 0, 0, 'count', 0) + args.count)
          } else {
            gar.addAtCoords(slot, 0, 0, {
              creature: args.creature,
              count: args.count,
            })
          }
        })
      } finally {
        gar.release()
        av.release()
      }
      return new Common.Response({status: true})
    },

    do_upgradeCreature: function (args) {
      this.checkPlayer()
      var map = this.get('context').map
      try {
        var obj = map.representationOf(args.object)
      } catch (e) {}
      if (!obj || obj.get('owner') != this.get('player').get('player')) {
        throw new Common.ClientError('Invalid object')
      }
      var gar = map.objects.subAtCoords(obj.get('id'), 0, 0, 'garrison', 0)
      try {
        if (!gar.anyAtCoords(args.slot, 0, 0)) {
          throw new Common.ClientError('Invalid slot')
        }
        var cr = gar.atCoords(args.slot, 0, 0, 'creature', 0)
        var value = this.get('context').oneShotEffectCalculation({
          class: Calculator.Effect.GenericIntArray,
          target: map.constants.effect.target.creature_upgradeCan,
          ifCreature: cr,
          ifObject: obj.get('id'),
        })
        if (!_.includes(value, args.upgraded)) {
          throw new Common.ClientError('Invalid creature')
        }
        var rem = this.get('context').subtractResourcesByCalc(this.get('player').get(), {
          target: map.constants.effect.target.creature_costUpgrade,
          ifObject: obj.get('id'),
          ifCreature: cr,
          ifTargetCreature: args.upgraded,
        }, 'resources_', gar.atCoords(args.slot, 0, 0, 'count', 0))
        if (_.min(rem[0]) < 0) {
          throw new Common.ClientError('Insufficient resources')
        }
        this.get('player').assignResp(rem[0])
        gar.setAtCoords(args.slot, 0, 0, 0, 'creature', args.upgraded)
      } finally {
        gar.release()
      }
      return new Common.Response({status: true})
    },

    do_buySpellBook: function (args) {
      this.checkPlayer({screen: 'townscape', screenTown: args.town})
      var map = this.get('context').map
      try {
        var town = map.representationOf(args.town)
        var obj = map.representationOf(args.hero)
      } catch (e) {}
      if (!town || town.get('type') != map.constants.object.type.town) {
        throw new Common.ClientError('Invalid town')
      }
      if (!obj || !obj.isHero) {
        throw new Common.ClientError('Invalid hero')
      }
      var value = this.get('context').oneShotEffectCalculation({
        class: Calculator.Effect.GenericIntArray,
        target: map.constants.effect.target.town_buildings,
        ifObject: town.get('id'),
      })
      var building = _.last(_.intersection([this.rules.buildingsID.mageGuild1, this.rules.buildingsID.mageGuild2, this.rules.buildingsID.mageGuild3, this.rules.buildingsID.mageGuild4, this.rules.buildingsID.mageGuild5], value))
      if (building == null) {
        throw new Common.ClientError('No Mage Guild')
      }
      if (!map.objects.readSubAtCoords(obj.get('id'), 0, 0, 'artifacts', 0).anyAtCoords(this.rules.artifactSlotsID.spellBook, 0, 0)) {
        var rem = this.get('context').subtractResourcesByCalc(this.get('player').get(), {
          target: map.constants.effect.target.artifactCost,
          ifBonusObject: town.get('id'),
          ifBuilding: building,
          ifObject: obj.get('id'),
          ifArtifact: this.rules.artifactsID.spellBook,
        })
        if (_.min(rem[0]) < 0) {
          throw new Common.ClientError('Insufficient resources')
        }
        this.get('player').assignResp(rem[0])
        // XX replace with _equipTrophy()?
        var sub = map.objects.subAtCoords(obj.get('id'), 0, 0, 'artifacts', 0)
        try {
          sub.addAtCoords(this.rules.artifactSlotsID.spellBook, 0, 0, {artifact: this.rules.artifactsID.spellBook})
        } finally {
          sub.release()
        }
      }
      return new Common.Response({status: true, bought: !!rem})
    },

    do_openMageGuild: function (args) {
      this.checkPlayer({screen: 'townscape', screenTown: args.town})
      var map = this.get('context').map
      try {
        var town = map.representationOf(args.town)
      } catch (e) {}
      if (!town || town.get('type') != map.constants.object.type.town) {
        throw new Common.ClientError('Invalid town')
      }
      var townSpells = this.get('context').oneShotEffectCalculation({
        class: Calculator.Effect.GenericIntArray,
        target: map.constants.effect.target.town_spells,
        ifObject: town.get('id'),
      })
      _.each([town.get('garrisoned'), town.get('visiting')], function (hero) {
        if (hero && map.objects.readSubAtCoords(hero, 0, 0, 'artifacts', 0).anyAtCoords(this.rules.artifactSlotsID.spellBook, 0, 0)) {
          var spellCalc = this.get('context').oneShotEffectCalculator({
            class: Calculator.Effect.GenericIntArray,
            target: map.constants.effect.target.hero_spells,
            ifObject: hero,
          })
            .takeRelease()
          var cur = []
          spellCalc.get('affectors').forEach(function (n) {
            var src = map.effects.atContiguous(n + map.effects.propertyIndex('source'), 0)
            if (src[0] == map.constants.effect.source.town) {
              cur.push.apply(cur, map.effects.atContiguous(n + map.effects.propertyIndex('modifier'), 0).slice(1))
            }
          })
          var spells = _.filter(townSpells, function (spell) {
            if (!_.includes(cur, spell)) {
              var learn = this.get('context').oneShotEffectCalculation({
                target: map.constants.effect.target.spellLearn,
                ifObject: hero,
                ifSpell: spell,
              })
              return learn && learn >= _.random(map.constants.effect.multiplier)
            }
          }, this)
          if (spells.length) {
            map.effects.append({
              source: [map.constants.effect.source.town, town.get('id')],
              target: map.constants.effect.target.hero_spells,
              modifier: [map.constants.effect.operation.append].concat(spells),
              priority: map.effects.priority(map.constants.effect.operation.append, map.constants.effect.priority.mapSpecific),
              ifObject: hero,
            })
          }
        }
      }, this)
      return new Common.Response({status: true})
    },
  }, {
    // If `'TextEncoder is supported, returns `'TypedArray with JSON representation of `'data, else returns `'data itself.
    //
    //> data mixed
    //> transfer omitted`, array to `'push() serialized buffer to
    //
    // `'textEncode() and `'textDecode() aid in passing large data without copying it by using `'postMessage()'s `'transfer parameter in browsers that support it.
    textEncode: function (data, transfer) {
      if (typeof TextEncoder != 'undefined') {
        data = (new TextEncoder).encode(JSON.stringify(data))
        transfer && transfer.push(data.buffer)
      }
      return data
    },

    // If `'TextDecoder is supported, returns `'TypedArray parsed as JSON, else returns `'data itself.
    textDecode: function (data) {
      if (typeof TextDecoder != 'undefined') {
        data = JSON.parse((new TextDecoder).decode(data))
      }
      return data
    },
  })

  RPC._mergeProps.push('_observerMethods')

  // Base representation of client's side of a multi-player connection, unrelated to a particular transport (such as `'WebSocket).
  //
  // Listens to server-generated `'serverEvent-s and applies incremental changes to the client's local world.
  RPC.Client = RPC.extend('HeroWO.RPC.Client', {
    _buffered: [],
    _phase: null,

    events: {
      change_context: function (now, old) {
        old && this.autoOff(old)
        this._phase = this._contextPhase()

        now && this.autoOff(now, {
          'dataReady, change_loading': function () {
            var phase = this._phase = this._contextPhase()

            while ((this._buffered[0] || [])[0] == phase) {
              var item = this._buffered.shift().slice(1)
              this.serverEvent.apply(this, item)
            }
          },
        })
      },

      reset: function () {
        this._buffered = []
      },

      serverEvent: function (event, data) {
        _.log && _.log('=[%s]> %.500j', event, data)

        var self = this

        var checkContext = function (phase) {
          if (!self.get('context')) {
            throw new Error('No context for handling server event: ' + event)
          }
          if (phase != null) {
            // Since game() is async, events may be incoming via WS faster than this RPC.Client's objects are ready to handle them. Defer events that should be processed in certain state (lobby events once loading is paused, active game events once rendered) to when our objects, listeners, etc. are fully initialized.
            phase % 2 || phase++    // if 0 or 2 then make 1 or 3
            if (phase != self._phase) {
              _.log && _.log('Delaying %dth serverEvent for phase %d received in phase %d : %s %.j', self._buffered.length + 1, phase, self._phase, event, data)
              return self._buffered.push([phase, event, data])
            }
          }
        }

        function locate(locator, func, current) {
          if (!locator || !locator.length) {
            return func(current)
          } else if (!current) {
            switch (locator[0]) {
              // Sqimitive.
              case 'map':
                current = self.get('context').map
                break
              case 'victory':
              case 'loss':
              case 'players':
              case 'transitions':
              case 'combats':
              // ObjectStore.
              case 'objects':
              case 'effects':
              // Shroud.
              case 'shroud':
                current = self.get('context').map[locator[0]]
            }
          } else if (current instanceof ObjectStore) {
            if (locator[1] == null) {
              // Since `#RPC hooks only appendSchema() in readSub..., it doesn't
              // matter which n/l the sub was originally created for on master.
              return locate(locator.slice(3), func, current.readSub(locator[0]))
            } else {
              var subStore = current.subAtContiguous(locator[0], locator[1], locator[2])
              try {
                return locate(locator.slice(3), func, subStore)
              } finally {
                subStore.release()
              }
            }
          } else if (current instanceof HMap.Combat) {
            switch (locator[0]) {
              case 'parties':
              case 'objects':
              case 'log':
                current = current[locator[0]]
            }
          } else {
            current = current.nested(locator[0])
          }
          if (!current) {
            throw new Error('Unable to locate object: ' + locator)
          }
          return locate(locator.slice(1), func, current)
        }

        function enterBatched(toBatch, batched, func) {
          if (!toBatch.length) {
            batched[0].batch(batched, func.bind(undefined, batched))
          } else {
            locate(toBatch[0].locator, function (sqim) {
              enterBatched(toBatch.slice(1), batched.concat(sqim), func)
            })
          }
        }

        switch (event) {
          case 'integrityCheck':
            if (checkContext(3)) { return }
            var hash = this.get('context').contentHash().join('\n')
            //console.log(hash, JSON.stringify(this.get('context').map.objects.serialize()))
            return this.do('integrity', {value: hash})

          case 'configured':
            if (checkContext(1)) { return }
            return this.get('context').get('configuring').nested('rpc').set('status', data)

          case '_extendBy':
          case 'appendSchema':
          case 'nest':
          case 'unlist':
          case 'remove':
            if (checkContext(data.phase)) { return }
            return locate(data.locator, function (obj) {
              var res = obj[event].apply(obj, data.args)
              if (event == 'unlist' && !res) {
                throw new Error('Slave is missing the child to unlist.')
              }
            })

          case 'renest':
            if (checkContext(data.phase)) { return }
            return locate(data.locator, function (col) {
              locate(data.args[0], function (obj) {
                col.nest(data.args[1], obj, {pos: data.args[2]})
              })
            })

          case 'combat_nest':
            if (checkContext(data.phase)) { return }
            var args = data.args
            return locate(data.locator, function (sqim) {
              // Specifically create new child, unserialize it and only then nest because hooks on nest expect a fully ready object.
              if (sqim instanceof HMap.Combat.Objects) {  // combat.objects
                var child = sqim.newFunc(args[2-1])
                child.assignResp(args[2-1], {
                  schema: 'unser',
                  // Required if Creature or Corpse.
                  parties: sqim._parent.parties,
                })
                child.attach()  // if Creature
                sqim.nest(args[1-1], child)
              } else {    // parties or combats
                // Combat expects these in init.
                var child = new sqim._childClass(_.pick(args[2-1], 'width', 'height', _.forceObject))
                child.assignResp(args[2-1], {
                  schema: 'unser',
                  // sqim is either combat.parties or combats and unser of both Party and Combat use map.
                  map: self.get('context').map,
                })
                sqim.nest(args[1-1], child)
              }
            })

          case 'combat_queue':
            if (checkContext(data.phase)) { return }
            return locate(data.locator, function (combat) {
              data.args.length > 1
                ? combat.queue.nestEx(_.extend({child: combat.objects.nested(data.args[1])}, data.args[0]))
                : combat.queue.unlist(data.args[0])
            })

          case 'batch':
            if (checkContext(data.phase)) { return }
            return enterBatched(data.batched, [], function (batched) {
              _.each(data.batched, function (item, i) {
                var sqim = batched[i]
                _.each(item.events, function (event) {
                  var args = event.args
                  switch (event.method) {
                    case 'combat_set':
                      switch (args[0]) {
                        case 'interactiveParty':
                          var obj = args[1] && sqim.parties.nested(args[1])
                          break
                        case 'interactiveCreature':
                          var obj = args[1] && sqim.objects.nested(args[1])
                          break
                      }
                      return sqim.set(args[0], obj, args[2])
                    case 'shroud_set':
                      return _.each(args, function (args) {
                        sqim.setAtCoords.apply(sqim, args)
                      })
                    default:
                      sqim[event.method].apply(sqim, args)
                  }
                })
              })
            })
        }
      },
    },
  })

  return RPC
})