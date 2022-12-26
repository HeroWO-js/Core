define(['Common', 'ObjectStore'], function (Common, ObjectStore) {
  "use strict"
  var _ = Common._

  var indexFor = Common.indexFor('', 'array[mid] - value')

  // Stores modifiers (e.g. gold income or combat morale) affecting every part of gameplay in such a way that a particular affector (e.g. mine or artifact) may be easily added and removed, with great flexibility as to what it affects (e.g. all human players on Mondays or all undead creatures when underground).
  //
  // See the large comment in Effect class in databank/core.php for details.
  //
  // This class is internal to Map, hence it has no own FORMAT_VERSION or fetching methods
  // (caller is expected to fetch necessary files).
  //
  // Effect IDs (X) may be reused: if an Effect is removed, a new Effect may be
  // placed into its position. Clients handling a particular x or n should stop doing that
  // after the appropriate oremove occurs. This is in constrast with Map's objects
  // where IDs of removed objects are never occupied again - in part because
  // comparatively few objects are created and removed, in part because IDs don't
  // have to match x - they do now but this may change in the future (hence a
  // dedicated AObject->$id property).
  //
  // However, such reusage may only happen in separate batches. It is guaranteed that if an Effect is removed, its n will not be reused for any added Effect until the batch ends. Otherwise clients will have no way to know if n is an Effect that existed pre-batch or if this pre-batch Effect was removed and another one was added in its place (during the same batch).
  var Effects = ObjectStore.extend('HeroWO.Effects', {
    constants: null,
    _free: null,    // null no gaps, negative last added at ~_free, positive the gap
    _freeRemoved: [],   // sorted array of Effect n that were removed during the current batch

    //= ObjectStore 2D: prop => target => id; $any prop holds all Effects with target, other prop holds Effects with target that have the corresponding selector unset (i.e. match in all cases) and complements with bySpot/byObject
    byTarget: null, // $target

    //= ObjectStore 3D: z y x => id
    bySpot: null, // $ifX/Y/Z, optionally with $ifRadius

    //= ObjectStore 1D: Effect::timed => id
    byTimed: null, // $maxDays/Combats/Rounds/$ifDateMax

    //= ObjectStore 1D: $ifObject => id
    byObject: null,

    //= ObjectStore 1D: AObject->$id => id
    // Tracks $source = 'encounter'; X is $source[1] (the bonus object). Used for "visited" checks.
    byEncounter: null,

    //= hash 'label' => [embedded Effect(s)]
    // Effects added directly with append() are not reflected here because this should contain original (non-expanded) Effects while append() receives already expanded version.
    //
    // Value may be zero, one or more Effects. Value of an entry automatically added because of Effect->$label always has just one Effect (the one with the $label - it evicts the old value). But this doesn't apply to entries added directly (commonly done by map and databank generators).
    byLabel: null,

    _indexes: {
      eTarget:   'byTarget',
      eSpot:     'bySpot',
      eTimed:    'byTimed',
      eEncounter:'byEncounter',
      eObject:   'byObject',
    },

    _opt: {
      cleaning: false,   // internal, informational
    },

    events: {
      init: function (opt) {
        this.constants = opt.constants
        this.byLabel = opt.eLabel
        this._free = this._scanForFree(0)

        _.each(this._indexes, function (prop, file) {
          this[prop] = new ObjectStore(opt[file])
        }, this)

        this._attachIndexes()
      },

      '=serialize': function (sup, options) {
        options = options || {}

        // Remove $dynamic from this._layers and also from indexes (done by clone's BatchIndexUpdater). Value can be false (keep, return self), true (remove and return self), clone (create new Effects copy, remove there and return it).
        //
        // When a client connects to the server, it receives current world state including all Effects. When server saves a game, it removes $dynamic because when the game is later loaded, its master H3.Rules will recreate them. 'clone' is used when saving "online" (with active game which data should not be touched) for a fresh server instance with fresh clients (complete reload where master will restore $dynamic). true is used when data is migrated from a shutting down server so that clients may reconnect and do_resume with their existing state without loading the map from scratch ($dynamic are removed on self and clients receive these oremove events, later followed by oadd for restored $dynamic once the new server loads such data).
        var clean = options.removeDynamic

        // This prevents cloned ObjectStore from sharing this._layers
        // (= serialized.layers).
        // deepClone() is unnecessary since we're only modifying direct layer data.
        function copy(o) {
          if (clean == 'clone') {
            o.layers = _.map(o.layers.concat(), Common.p('concat'))
          }
          return o
        }

        function removeDynamic(store) {
          var dynamicIndex = store.propertyIndex('dynamic')
          store.batch(null, function () {
            store.find(dynamicIndex, function (dynamic, $1, $2, $3, $4, n) {
              dynamic && store.removeAtContiguous(n - dynamicIndex, 0)
            })
          })
        }

        var serialized = _.extend(
          {eLabel: this.byLabel},
          _.map(this._indexes, function (p) {
            return copy(this[p].serialize())
          }, this)
        )

        if (clean == 'clone' || !options.asFiles) {
          _.extend(serialized, copy(sup(this, arguments)))
        } else {
          // Effects' own storage is held in effects.json, not in a big file
          // holding that and all indexes. However, constructor (since it's
          // inherited from ObjectStore) receives it all merged.
          serialized.effects = sup(this, arguments)
        }

        if (clean === true) {
          removeDynamic(this)
        } else if (clean == 'clone') {
          serialized.cleaning = true
          serialized.constants = this.constants
          var clone = new this.constructor(serialized)
          removeDynamic(clone)
          options.removeDynamic = false
          serialized = clone.serialize(options)
        }

        return serialized
      },

      '-_fire_oremove': function (options, args) {
        // No need to check for uniqueness since the same Effect (n) cannot be removed twice per batch.
        this._freeRemoved.splice(indexFor(this._freeRemoved, args[0]), 0, args[0])
      },
    },

    _scanForFree: function (free) {
      // Skip over Effects removed during this batch, if any.
      var removed = this._freeRemoved
      var ri = 0
      next:
      while ((free = this.advance(free, +1)) != -1) {
        if (!this.anyAtContiguous(free)) {
          while (removed[ri] < free) {
            if (removed[ri++] == free) { continue next }
          }
          return free
        }
      }
      this._free = null
    },

    // This method is very much like Map.Indexed._attachIndexes(). See the latter
    // for comments.
    _attachIndexes: function () {
      var consts = this.constants.effect
      var encounterSource = consts.source.encounter
      // We need map dimensions to clip $ifRadius properly. Even though we
      // don't have access to Map, bySpot's size is exactly the same so
      // using that.
      var mapSize = this.bySpot.size()

      var updater = new Effects.BatchIndexUpdater({
        store: this,
        logPrefix: 'E ',

        // Changing this after object creation is unsupported: target.
        objectProperties: [
          'target', 'maxDays', 'maxCombats', 'maxRounds', 'ifDateMax', 'ifObject', 'ifX', 'ifY', 'ifZ', 'ifRadius', 'source',
        ],

        indexProperties: [
          'maxDays', 'maxCombats', 'maxRounds', 'ifDateMax', 'ifObject', 'ifX', 'ifY', 'ifZ', 'ifRadius', 'source',
        ].map(this.propertyIndex, this),
      })

      var oadd_target = function (n, obj, options) {
        this.byTarget.addAtCoords(obj.target, consts.targetIndex.any, 0, [n], options)
      }.bind(this)

      var oremove_target = function (n, obj, options) {
        this.byTarget.removeAtCoords(obj.target, consts.targetIndex.any, 0,
          this.byTarget.findAtCoords(obj.target, consts.targetIndex.any, 0, 0, n),
          options)
      }.bind(this)

      var oadd_object = function (n, obj, options) {
        if (obj.ifObject !== false) {   // may be 0
          this.byObject.addAtCoords(obj.ifObject, 0, 0, [n], options)
        } else {
          this.byTarget.addAtCoords(obj.target, consts.targetIndex.object, 0, [n], options)
        }
      }.bind(this)

      var oremove_object = function (n, obj, options) {
        if (obj.ifObject !== false) {
          this.byObject.removeAtCoords(obj.ifObject, 0, 0,
            this.byObject.findAtCoords(obj.ifObject, 0, 0, 0, n),
            options)
        } else {
          this.byTarget.removeAtCoords(obj.target, consts.targetIndex.object, 0,
            this.byTarget.findAtCoords(obj.target, consts.targetIndex.object, 0, 0, n),
            options)
        }
      }.bind(this)

      var oadd_spot = function (n, obj, options) {
        if (obj.ifX !== false && obj.ifY !== false && obj.ifZ !== false) {
          Common.withinCircle(
            obj.ifX, obj.ifY, obj.ifRadius,
            mapSize.x - 1, mapSize.y - 1,
            function (x, y) {
              this.bySpot.addAtCoords(x, y, obj.ifZ, [n], options)
            },
            this
          )
        } else {
          this.byTarget.addAtCoords(obj.target, consts.targetIndex.spot, 0, [n], options)
        }
      }.bind(this)

      var oremove_spot = function (n, obj, options) {
        if (obj.ifX !== false && obj.ifY !== false && obj.ifZ !== false) {
          Common.withinCircle(
            obj.ifX, obj.ifY, obj.ifRadius,
            mapSize.x - 1, mapSize.y - 1,
            function (x, y) {
              this.bySpot.removeAtCoords(x, y, obj.ifZ,
                this.bySpot.findAtCoords(x, y, obj.ifZ, 0, n),
                options)
            },
            this
          )
        } else {
          this.byTarget.removeAtCoords(obj.target, consts.targetIndex.spot, 0,
            this.byTarget.findAtCoords(obj.target, consts.targetIndex.spot, 0, 0, n),
            options)
        }
      }.bind(this)

      var ochange_spot = function (n, old, now, options) {
        Common.diffCircles(
          old.ifX, old.ifY, old.ifRadius,
          now.ifX, now.ifY, now.ifRadius,
          mapSize.x - 1, mapSize.y - 1,
          function (x, y) {
            this.bySpot.addAtCoords(x, y, old.ifZ, [n], options)
          },
          function (x, y) {
            this.bySpot.removeAtCoords(x, y, old.ifZ,
              this.bySpot.findAtCoords(x, y, old.ifZ, 0, n),
              options)
          },
          this
        )
      }.bind(this)

      var oadd_timed = function (n, obj, options) {
        obj.maxDays    && this.byTimed.addAtCoords(consts.timedIndex.maxDays, 0, 0, [n], options)
        obj.maxCombats && this.byTimed.addAtCoords(consts.timedIndex.maxCombats, 0, 0, [n], options)
        obj.maxRounds  && this.byTimed.addAtCoords(consts.timedIndex.maxRounds, 0, 0, [n], options)
        if (obj.ifDateMax !== false) {
          this.byTimed.addAtCoords(consts.timedIndex.ifDateMax, 0, 0, [n], options)
        }
      }.bind(this)

      var oremove_timed = function (n, obj, options) {
        if (obj.maxDays) {
          this.byTimed.removeAtCoords(consts.timedIndex.maxDays, 0, 0,
            this.byTimed.findAtCoords(consts.timedIndex.maxDays, 0, 0, 0, n),
            options)
        }
        if (obj.maxCombats) {
          this.byTimed.removeAtCoords(consts.timedIndex.maxCombats, 0, 0,
            this.byTimed.findAtCoords(consts.timedIndex.maxCombats, 0, 0, 0, n),
            options)
        }
        if (obj.maxRounds) {
          this.byTimed.removeAtCoords(consts.timedIndex.maxRounds, 0, 0,
            this.byTimed.findAtCoords(consts.timedIndex.maxRounds, 0, 0, 0, n),
            options)
        }
        if (obj.ifDateMax !== false) {
          this.byTimed.removeAtCoords(consts.timedIndex.ifDateMax, 0, 0,
            this.byTimed.findAtCoords(consts.timedIndex.ifDateMax, 0, 0, 0, n),
            options)
        }
      }.bind(this)

      var oadd_encounter = function (n, obj, options) {
        if (obj.source && obj.source[0] == encounterSource) {
          this.byEncounter.addAtCoords(obj.source[1], 0, 0, [n], options)
        }
      }.bind(this)

      var oremove_encounter = function (n, obj, options) {
        if (obj.source && obj.source[0] == encounterSource) {
          this.byEncounter.removeAtCoords(obj.source[1], 0, 0,
            this.byEncounter.findAtCoords(obj.source[1], 0, 0, 0, n),
            options)
        }
      }.bind(this)

      var indexes = _.values(_.pick(this, _.values(this._indexes), _.forceObject))

      updater.on({
        _processBatch: function () {
          // There are many static (permanent) Effects at the beginning of this store. To avoid scanning the store from the beginning to locate a free n whenever an object is deleted, we track the earliest deleted object's n, use that n when adding an object and set _free to ~n. If adding another object before one was removed (negative _free), scan for the closest following free slot (if any) and update _free (again, negative). If there's none free, _free is null and we know to avoid scanning.
          //
          // But there's a catch - we have to keep n removed until the batch drains (all hooks were called, i.e. _processBatch() returned). When adding, we just skip over these when scanning but when the batch's over, we have to back-track to determine the correct _free by choosing the smallest of current _free and all removed n. If there was no batch, doing just the same. Outside of batch, _free is updated only when adding and it may only increase (or become null).
          var min = this._freeRemoved[0]
          this._freeRemoved = []

          if (this._free == null || (this._free >= 0 ? this._free : ~this._free) > min) {
            this._free = min
          }
        },

        objectAdded: function (now, n, options) {
          indexes[0].batch(indexes, function () {
            oadd_target(n, now, options)
            oadd_spot(n, now, options)
            oadd_timed(n, now, options)
            oadd_object(n, now, options)
            oadd_encounter(n, now, options)
          })
        },

        // Note: oremove of index stores happens after oremove of the main store
        // meaning there is no longer any object at effect's n and it's impossible
        // to access properties of the removed effect in response to oremove on
        // an index (not on the main store). See CoordEffectCounter for a workaround.
        objectRemoved: function (old, n, options) {
          indexes[0].batch(indexes, function () {
            oremove_target(n, old, options)
            oremove_spot(n, old, options)
            oremove_timed(n, old, options)
            oremove_object(n, old, options)
            oremove_encounter(n, old, options)
          })
        },

        propertyChanged: function (prop, name, now, old, changed, n, options) {
          switch (prop) {
            case updater.atter.maxDaysIndex:
            case updater.atter.maxCombatsIndex:
            case updater.atter.maxRoundsIndex:
            case updater.atter.ifDateMaxIndex:
              /* byTimed */
              if ((old[name] > 0) == (now[name] > 0)) { // ignore decrements
                return
              }

              changed.delete(updater.atter.maxDaysIndex)
              changed.delete(updater.atter.maxCombatsIndex)
              changed.delete(updater.atter.maxRoundsIndex)
              changed.delete(updater.atter.ifDateMaxIndex)

              return indexes[0].batch(indexes, function () {
                oremove_timed(n, old, options)
                oadd_timed(n, now, options)
              })

            case updater.atter.ifObjectIndex:
              /* byObject */
              return indexes[0].batch(indexes, function () {
                oremove_object(n, old, options)
                oadd_object(n, now, options)
              })

            case updater.atter.ifXIndex:
            case updater.atter.ifYIndex:
            case updater.atter.ifZIndex:
            case updater.atter.ifRadiusIndex:
              changed.delete(updater.atter.ifXIndex)    // updated as one
              changed.delete(updater.atter.ifYIndex)
              changed.delete(updater.atter.ifZIndex)
              changed.delete(updater.atter.ifRadiusIndex)

              /* bySpot */
              return indexes[0].batch(indexes, function () {
                // Optimized update: if both old and new versions used the same index (i.e. both present in byTarget or both present in bySpot) then update only different coordinates instead of full re-adding.
                var oldBySpot = old.ifX !== false && old.ifY !== false && old.ifZ !== false
                if (oldBySpot != (now.ifX !== false && now.ifY !== false && now.ifZ !== false)
                    || (oldBySpot && old.ifZ != now.ifZ)
                    // XXX if old and new are in byTarget, there's no need to update anything because $target cannot change; however, this breaks Shroud.Effects because it no longer detects changes in Effects in non-bySpot mode (when global Effects exist); see the comment in _effectsChanged()'s switch; fixing it is not trivial because Shroud doesn't reconstruct old object to see if the change would be handled by _byTargetChanged(), moreover, byTarget's ochange may occur both before and after _effectsChanged() so it needs to defer the decision smartly
                    || !oldBySpot) {
                  oremove_spot(n, old, options)
                  oadd_spot(n, now, options)
                } else if (oldBySpot) {
                  ochange_spot(n, old, now, options)
                }   // else - nothing to update if old and new are in byTarget
              })

            case updater.atter.source:
              /* byEncounter */
              return indexes[0].batch(indexes, function () {
                oremove_encounter(n, old, options)
                oadd_encounter(n, now, options)
              })

            // Remember to update indexProperties if adding new cases.
          }
        },
      }, this)

      updater.attach()
    },

    // Decrements specific byTimed-type property (e.g. $maxDays), removing Effects who have this value dropping below 1.
    //> prop str`, int
    //> key Effect::timed
    //> filterProp null don't check`, str`, int `- decrements only Effects with this property set to one of `'filterValues members
    //> filterValues array
    decrement: function (prop, key, filterProp, filterValues) {
      prop = this.propertyIndex(prop)
      filterProp == null || (filterProp = this.propertyIndex(filterProp))
      this.batch(null, function () {
        this.byTimed.findAtCoords(key, 0, 0, 0, function (n) {
          var counter = this.atContiguous(n + prop, 0)
          if (counter !== false && (filterProp == null ||
               filterValues.indexOf(this.atContiguous(n + filterProp, 0)) != -1)) {
            counter > 1 ? this.setAtContiguous(n + prop, 0, counter - 1)
              : this.removeAtContiguous(n, 0)
          }
        }, this)
      }, this)
    },

    attachObjects: function (objects) {
      this.autoOff(objects, {
        '^-oadd': function (n) {
          // objects is a Map.objects store on which add...() are not called directly,
          // only through append(), and append() is always called to add a new object
          // (not just extend†). In this case it would be enough to simply
          // {oadd: () => byObjects.append()} but we choose not to rely on this†
          // to make it future-proof.
          var max = objects.fromContiguous(n).x
          this.byObject.extendTo(max)
        },
      })
    },

    //> operation integer
    //> priority integer delta
    //
    // If `'operation is `'relative or if it's `'heroSpec/`'spellSpec and `'mul is float,
    // change arguments to `['relative', constants.effect.priority.default`].
    // If it's randomArray then to append or const. If random then to delta.
    // Matches calculations in Effect::fromShort() in databank/core.php.
    priority: function (operation, priority) {
      var hi = this.constants.effect.priority.highest
      var lo = this.constants.effect.priority.lowest
      if (priority > hi || priority < lo) {
        throw new Error('Effect\'s priority is outside of the operation\'s range.')
      }
      var range = Math.abs(hi) + Math.abs(lo)
      return priority + operation * range + range / 2
    },
  })

  // Object changes are processed by batch, not individually. Main reason
  // is the need to know old property values to determine location of that
  // object in indexes (that we are updating). But this also allows
  // optimizations like collapsing changes into one, i.e. when property P
  // is changed from V to V' and then from V' to V (resulting in no change
  // and no update necessary), or when it's changed from V to V' to V''
  // (resulting in one update from V to V'', skipping V').
  Effects.BatchIndexUpdater = Common.Sqimitive.extend('HeroWO.Effects.BatchIndexUpdater', {
    atter: null,
    _propToName: [],

    _opt: {
      store: null,
      logPrefix: '',

      // Must list all properties used by index update functions. Must include
      // indexProperties.
      // As of now, they must not be members of unions, otherwise processBatch()
      // will need to be rewritten.
      objectProperties: [],

      // Must list all properties used as case of the big switch in propertyChanged().
      indexProperties: [],
    },

    events: {
      init: function (opt) {
        this.atter = opt.store.atter(opt.objectProperties)

        var unions = _.countBy(opt.store.schema(), function (p) { return p })

        _.each(opt.objectProperties, function (name) {
          var prop = opt.store.propertyIndex(name)
          this._propToName[prop] = name

          if (unions[prop] > 1) {
            // See the comment in _opt.
            throw new Error('Property used in BatchIndexUpdater is part of a union.')
          }
        }, this)
      },

      attach: function () {
        var guard = {}
        this.get('store').on({
          '^oadd':      Common.batchGuard(3, this._processBatch.bind(this, 'oadd'), guard),
          '^oremove':   Common.batchGuard(3, this._processBatch.bind(this, 'oremove'), guard),
          '^ochange':   Common.batchGuard(5, this._processBatch.bind(this, 'ochange'), guard),
        })
      },
    },

    objectAdded: Common.stub,
    objectRemoved: Common.stub,
    // May delete members from changed to skip them.
    propertyChanged: Common.stub,

    propertiesChanged: function (now, old, changed, n, options) {
      changed.forEach(function (prop) {
        // May delete members from changed to skip them:
        // "callback is not invoked for values deleted before being visited."
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/forEach
        this.propertyChanged(prop, this._propToName[prop], now, old, changed, n, options)
      }, this)
    },

    _processBatch: function (event) {
      var options = event[1] == 'c' ? arguments[6] : arguments[4]
      var ip = this._opt.indexProperties

      var byObject = new Map   // n => array of [must_update, ...events]
        // must_update is a quick check only; even if it's true, an object
        // may need no update if properties have custom update logic, e.g.
        // "ignore decrements" in Effects' maxDays.

      for (var i = 0; i < options.batch.length; i++) {
        var event = options.batch[i]
        var name = event[0]

        switch (name) {
          case 'oadd':
          case 'oremove':
          case 'ochange':
            var n = event[1]
            var item
            ;(item = byObject.get(n)) ? item.push(event)
              : byObject.set(n, item = [false, event])
            if (!item[0] && (name[1] != 'c' || ip.indexOf(event[3]) != -1)) {
              item[0] = true
            }
        }

        if (_.log && !this._opt.store._opt.cleaning) {
          var id = event[1] + '/' + this._opt.store.fromContiguous(event[1]).x
          var transition = (event[event[0][1] == 'c' ? 6 : 4] || {}).transition
          transition = transition ? ' T' + transition : ''

          switch (event[0]) {
            case 'oadd':
              _.log('%s+ %s%s', this._opt.logPrefix, id, transition)
              break
            case 'oremove':
              _.log('%s- %s%s', this._opt.logPrefix, id, transition)
              break
            case 'ochange':
              var names = _.intersection(this._opt.store.schema(), [event[3]])
              names = _.keys(names).join(' ')
              if (this._opt.store.isSubProperty(event[3])) {
                _.log('%s%s.%s sub = ...%s : %s', this._opt.logPrefix, id, event[3], transition, names)
              } else {
                _.log('%s%s.%s = %j <- %j%s : %s', this._opt.logPrefix, id, event[3], event[4], event[5], transition, names)
              }
          }
        }
      }

      byObject.forEach(function (events, n) {
        if (events[0]) {
          var old
          var now
          var changed = new Set

          for (var event, i = 1; event = events[i++]; ) {
            // Assuming correct ordering of events, oadd occurs either 0
            // or 1 times before others, then ochange occurs 0 or more times,
            // then oremove occurs either 0 or 1 times. Possible cases:
            //
            //     oadd > ochange > oremove |
            // 1 | no   | no      | no      | impossible
            // 2 | no   | no      | yes     |
            // 3 | no   | yes     | no      | update indexes prop by prop
            // 4 | no   | yes     | yes     | just remove using old values
            // 5 | yes  | no      | no      |
            // 6 | YES  | no      | YES     | nothing to update
            // 7 | yes  | yes     | no      | just add using new values
            // 8 | YES  | yes     | YES     | nothing to update
            switch (event[0][1]) {
              case 'a':
                now = this.atter(event[3])
                changed = true
                break

              case 'r':
                old /*(4)(8)*/ || (old = this.atter(event[3]) /*(2)*/)
                changed = true
                break

              case 'c':
                now || (now = this.atter(event[1], 0))
                old || (old = _.pick(now, this._opt.objectProperties, _.forceObject))
                var name = this._propToName[event[3]]
                // Need to obtain oldest value for name. Considering we're
                // going from oldest events to newest, set name the first time
                // we see it (!changed.has()). Or, if the object was oadd'ed
                // during this batch, keep properties given to oadd !=== true).
                if (changed !== true && !changed.has(event[3])) {
                  old[name] = event[5]
                }
                changed === true
                  // New object added, now is properties at the time of
                  // addition, possibly outdated. (7) (8)
                  ? (now[name] = event[4])
                  // oadd didn't happen, this.atter() retrieved up to date
                  // properties, leave now as is. (3) (4)
                  : changed.add(event[3])
            }
          }

          // A batch should have the same transition options for the same object
          // so we're examining the last event only.
          var event = events[i - 2]
          var options = event[event[0][1] == 'c' ? 6 : 4]
          var transition = !options.transition ? {} :
            {transition: options.transition, transitionTick: options.transitionTick}

          if (changed !== true) {   // existing object changed (3)
            changed.forEach(function (prop) {
              var name = this._propToName[prop]

              if (this.isEqual(old[name], now[name])) {
                changed.delete(prop)
              }
            }, this)

            changed.size && this.propertiesChanged(now, old, changed, n, transition)
          } else if (now && old) {  // new object added and removed (6) (8)
            // Do nothing.
          } else if (now) {  // new object added (5) (7)
            this.objectAdded(now, n, transition)
          } else {    // existing object removed (2) (4)
            this.objectRemoved(old, n, transition)
          }
        }
      }, this)
    },
  })

  // Helper class for tracking side effects of multiple entities.
  //
  // Entities are specified as arbitrary integers and/or strings set to `'list.
  // `#Collection tracks that option and calls `'addMember() for new entries
  // and `'removeMember() for old ones.
  //
  // Members are represented as plain objects created from `'list items using
  // `#readyMember(), accessible after `#addMember() by `#member(). They should
  // never change after `#addMember() because there is no way to listen to such
  // changes, but `#reAddMember() may be a solution.
  //
  // Thus, "entity" (or "`'item") is a scalar entry in `'list while "member" is an
  // object returned by `#member().
  //
  // ` `#Collection recognizes these special member keys:
  //> nEffects array of int `- `'n-s in `#Effects store produced by the member,
  //  given to `'removeAtContiguous()
  //> effects array store slice `- serialized `#Effects members, given to
  //  `#appendEffects() when adding a member, with new `'n-s set to `'nEffects
  //> off array `- array of Sqimitive event IDs, given to `@Common.off`@
  //> release array of object `- will invoke `'release() on every entry; usually but not necessary used to pair objects with `'take() called by the member
  //> * `- other keys may be of such special types:
  //  `> `#Collection `- nested side effect collection, simply `#remove()'d
  Effects.Collection = Common.Sqimitive.extend('HeroWO.Effects.Collection', {
    _members: {},
    _effects: null,
    _dynamicIndex: 0,
    _labelIndex: 0,
    _batchObjects: null,

    //> list array of int/str`, null disable certain methods, slightly speeding up `'append() and `'evict() `- duplicates are removed
    _opt: {
      list: [],
    },

    _initToOpt: {
      effects: '._effects',
      batchObjects: '._batchObjects',
    },

    events: {
      //> effects null`, Effects `- enable automatic management of members'
      //  `#Effects (special `'nEffects and `'effects keys)
      //> batchObjects null`, array of Sqimitive `- whenever a mass-change
      //  occurs (e.g. `#evict() is called), perform it within a `'batch() on
      //  these objects
      init: function (opt) {
        if (this._effects) {
          this._dynamicIndex = this._effects.propertyIndex('dynamic')
          this._labelIndex = this._effects.propertyIndex('label')
        }
      },

      '+normalize_list': function (res, value, options) {
        if (!options.init && value) {
          var seen = new Set
          return value.filter(function (v) { return !seen.has(v) && seen.add(v) })
        }
      },

      change_list: function (now, old, options) {
        if (!options.init) {
          var old = _.extend({}, this._members)

          this._doBatchObjects(function () {
            ;(now || []).forEach(function (item) {
              if (_.has(old, item)) {
                delete old[item]
              } else {
                this._append(item)
              }
            }, this)

            _.keys(old).forEach(this._evict, this)
          })
        }
      },

      unnest: function () {
        var members = this._members
        this._members = {}
        this._doBatchObjects(function () {
          _.each(members, this.removeMember, this)
        })
      },
    },

    // Returns a member object corresponding to `'item.
    //= object do not mutate`, null if not found
    // Use this between calling `#addMember() and `#removeMember() on
    // `'item.
    //
    // To get all members and iterate through them use `[col.get('list')`] (if need only items) or
    // `#members().
    member: function (item) {
      return this.has(item) && this._members[item]
    },

    // Returns `'true if a `#member corresponding to `'item exists.
    has: function (item) {
      return _.has(this._members, item)
    },

    // Returns all member objects and their keys (`'item-s).
    //= object key = `'item, value = member object
    // Members of the returned object must not be mutated. The object itself can be mutated.
    members: function () {
      return _.extend({}, this._members)
    },

    // Internally performs removal of `'member.
    //
    // This is the place in subclasses to deallocate side effects of `'member.
    //
    // `'member must exist. Doesn't update `'list and `'_members.
    removeMember: function (member) {
      Common.off(member.off)
      _.invoke(member.release, 'release')

      _.each(member.nEffects, function (n) {
        this.removeAtContiguous(n, 0)
      }, this._effects)

      _.each(member, function (value, key) {
        if (value instanceof Effects.Collection) {
          value.remove()
        }
      })
    },

    // Internally creates a plain member object from its `'item in `'list.
    //
    //= object with keys:
    //  `> item `- equals `'item
    //  `> effects array empty
    //  `> nEffects array empty
    //  `> off array empty
    //  `> release array empty
    //
    // This is the place in subclasses to store information about a new `'member.
    //
    // Do not allocate side effects here, use `#addMember() for that.
    readyMember: function (item) {
      return {item: item, effects: [], nEffects: [], off: [], release: []}
    },

    // Internally adds a new member to self, prepared by `#readyMember().
    //
    // This is the place in subclasses to allocate side effects of `'member.
    //
    // ` `#Collection creates Effects here if `'effects key exists (`#appendEffects()).
    addMember: function (member) {
      if (member.effects.length) {
        member.nEffects.push.apply(member.nEffects, this.appendEffects(member.effects, member))
      }
    },

    // Adds serialized `'effects into the `#Effects store, expanding each with
    // `#expandEffect() of self.
    //> effects array in sub-store format `- flat array of object properties
    //> member `- a yet-to-be-added member which is producing `'effects, for passing to `#expandEffect()
    //= array of created `'n
    appendEffects: function (effects, member) {
      var ns = []
      var chunk = effects.length && this._effects.schemaLength()
      this._effects.batch(null, function () {
        for (var i = 0; i < effects.length; i += chunk) {
          var effect = effects.slice(i, i + chunk)
          if (effect[this._labelIndex] !== false) {
            this._effects.byLabel[effect[this._labelIndex]] = effect.concat()
          }
          if (effect = this.expandEffect(effect, member)) {
            var free = this._effects._free
            if (free < 0) {   // last added there, look for gaps on the right
              free = this._effects._scanForFree(~free)
            }
            if (free == null) {   // dang, no gaps
              // map.effects and databank.effects must have the same schema.
              ns.push(this._effects.append(effect)[0])
            } else {
              this._effects.addAtContiguous(free, effect)
              ns.push(free)
              this._effects._free = ~free
            }
          }
        }
      }, this)
      return ns
    },

    // Calls `'func within batch on `'batchObjects given to `#Collection constructor, if any.
    _doBatchObjects: function (func) {
      var objects = this._batchObjects
      return objects && objects.length
        ? objects[0].batch(objects.length == 1 ? null : objects, func, this)
        : func.call(this)
    },

    // Internally mutates properties of a serialized `'effect object before `'append()'ing to
    // the `#Effects store.
    //> effects array in sub-store format `- single Effect object's properties
    //> member `- a yet-to-be-added member which is producing this `'effect, informational
    //= array/object same as `'effects or new `- meant for `@ObjectStore.append()`@
    // This is the place in subclasses to set specific fields on `'Effect before it's inserted
    // into the world.
    //
    // Labeled `'effect is stored prior to expansion. It is shallow-copied;
    // changing nested arrays and other objects (e.g. here) will affect the copy.
    //
    // ` `#Collection just sets `'dynamic to `'true.
    expandEffect: function (effect, member) {
      effect[this._dynamicIndex] = true
      return effect
    },

    // Adds `'items to `'list, returning newly created members.
    //> items array`, scalar single member
    //= array of members for array `'items`, object member for scalar `'items
    // Doesn't re-add existing `'items members (`#reAddMember), just returns them verbatim.
    //
    // Returned objects must not be mutated.
    //#qa
    // Unlike changing _opt.list, this method operates on members directly, allowing it to be called from within change_list. It's also faster because it doesn't have to diff old and new `'list values.
    append: function (items) {
      var res = {}
      var appended = []

      this._doBatchObjects(function () {
        _.toArray(items).forEach(function (item) {
          res[item] = this.member(item) || (appended.push(item), this._append(item))
        }, this)
      })

      var list = this.get('list')
      list && this.set('list', list.concat(appended), {init: true})

      return _.isArray(items) ? res : res[items]
    },

    _append: function (item) {
      var member = this._members[item] = this.readyMember(item)
      this.addMember(member)
      return member
    },

    // Removes `'items from `'list, leading to removal of the associated members.
    //= this
    // Ignores `'items that are not part of `'list.
    //#-qa
    evict: function (items) {
      var list = this.get('list')
      if (list) { list = list.concat() }

      this._doBatchObjects(function () {
        _.toArray(items).forEach(function (item) {
          if (this.has(item)) {
            this._evict(item)
            list && list.splice(list.indexOf(item), 1)
          }
        }, this)
      })

      list && this.set('list', list, {init: true})
      return this
    },

    _evict: function (item) {
      this.removeMember(this._members[item])
      delete this._members[item]
    },

    // Re-applies side effects of `'item without actually `#evict()'ing it.
    //= true if `'item existed`, false if it was not in `'list (did nothing)
    // Calls `#removeMember() followed by `#readyMember() + `#addMember().
    // This does not fire `'change_list.
    reAddMember: function (item) {
      if (this.member(item)) {
        this.removeMember(this._members[item])
        this.addMember(this._members[item] = this.readyMember(item))
        return true
      }
    },

    // function ([items])
    // Re-applies side effects of `'items already in `'list.
    //> items missing use all current items`, array of `'item `- ignores
    //  non-existing members
    //= array of bool indicating existed members `- index = index in `'items
    reAddMembers: function (items) {
      return this._doBatchObjects(function () {
        return _.map(items || this.get('list'), this.reAddMember, this)
      })
    },

    // Re-applies side effects of all current `'list items.
    //= this
    // This causes `'change_list to fire twice. If your code doesn't depend on
    // `'change_list firing, call `#reAddMembers() with no argument.
    reAddItems: function () {
      var cur = this.get('list')
      return this.set('list', []).set('list', cur)
    },

    // function (calc [, converter [, cx]])
    // Takes own `'list from `'calc's `'value, updating as it changes.
    //> calc object `#Calculator
    //> converter callable`, missing  `- receives current `'calc's `'value,
    //  returns an array set as `'list; if missing, use `'value as is
    //> cx object`, missing = `'this
    //= this
    // Because this sets up hooks on `'calc, there's no need to manually
    // call `'take()/`'release().
    //
    // `'calc options may be changed, the `#Collection will update accordingly.
    //
    // First update of `#Collection happens once `'calc becomes rendered (or immediately, if it already is). For `@Calculator.Effect`@, you can call `'updateIfNeeded() to ensure the update happens immediately.
    bindCalculator: function (calc, converter, cx) {
      converter = converter || function (v) { return v }

      var ev = calc.whenRenders('change_value', function () {
        this.set('list', converter.call(cx || this, calc.get('value')))
      }, this)

      this.on('unnest', function () { calc.off(ev) })
      return this
    },

    // function (store, n [, prop [, converter [, cx]]])
    // Takes own `'list from `'store's ''prop'erty of object `'n, updating as
    // it changes.
    //> store object `#ObjectStore `- 1D only (because listens to `'ochange_n_N
    //  and doesn't check `'l)
    //> n int `- object's `'n in `'store
    //> prop str`, int`, missing = 0
    //> converter callable`, missing `- receives current `'prop's value (remember
    //  sub-stores can be `'false as well as an array),
    //  returns an array set as `'list; if missing, use it as is (`'prop
    //  must point to an array or `'false - empty array)
    //> cx object`, missing = `'this
    //= this
    // This listens to `'prop changes in `'n but not to entire `'n removal -
    // when this happens, `#Collection must be removed or undefined behaviour
    // occurs.
    bindStoreValue: function (store, n, prop, converter, cx) {
      converter = converter || function (v) { return v || [] }
      prop = store.propertyIndex(prop || 0)

      var update = function (value) {
        this.set('list', converter.call(cx || this, value))
      }.bind(this)

      var ev = store.on('ochange_n_' + n, function ($1, $2, propChanged, value) {
        if (propChanged == prop) {
          update(value)
        }
      })

      this.on('unnest', function () { store.off(ev) })
      update(store.atContiguous(n + prop, 0))
      return this
    },

    // function (store, x [, y [, z [, prop [, filter]]]])
    // Takes own `'list from layer objects at `'store, updating as new objects
    // are added and old ones removed.
    //> store object `#ObjectStore
    //> x int
    //> y int`, missing = 0
    //> z int`, missing = 0
    //> prop str`, int`, missing = 0
    //> filter
    //= this
    //#bcomb
    // `#bindStoreCoords() and `#bindNested() can be used multiple times on one `#Collection, in any combination as long as items they add are unique per each function's data source (i.e. one bind... won't add or remove items that might appear in other bind...).
    //
    // Don't use `'filter if it depends on mutable data. For example, object's properties may change but `'filter only checks them (is called) when adding new members.
    bindStoreCoords: function (store, x, y, z, prop, filter) {
      prop = store.propertyIndex(prop || 0)
      filter = filter || function () { return true }
      var n = store.toContiguous(x, y || 0, z || 0, prop)

      var guard = Common.batchGuard(3, function ($1, $2, $3, options) {
        var append = []
        var evict = []
        _.each(options.batch, function (event) {
          switch (event[0]) {
            case 'oadd_n_' + n:
              var add = true
            case 'oremove_n_' + n:
              var item = event[3][prop]
              // Not calling filter for oremove because it may access data in map.objects but it's already unavailable.
              if (add ? filter(item) : this.has(item)) {
                ;(add ? append : evict).push(item)
              }
          }
        }, this)
        this._doBatchObjects(function () {
          append.forEach(this._append, this)
          evict.forEach(this._evict, this)
        })
      })

      var ev1 = store.on('oadd_n_' + n, guard, this)
      var ev2 = store.on('oremove_n_' + n, guard, this)
      this.on('unnest', function () { store.off(ev1).off(ev2) })

      var list = []
      store.findAtContiguous(n, function (id) { filter(id) && list.push(id) })
      this.append(list)

      return this
    },

    // function (store, x [, y [, z [, prop [, filter]]]])
    // Takes own `'list from Sqimitive `'_children, updating as new children
    // are nested and old ones unnested.
    //> col object `#Sqimitive
    //> key callable `- receives child, returns `'item
    //> filter
    //= this
    //#-bcomb
    bindNested: function (col, key, filter) {
      key = key || Common.p('_parentKey')
      filter = filter || function () { return true }

      var ev1 = col.on('nestExNew', function (res) {
        filter(res.child) && this.append(key(res.child))
      }, this)

      var ev2 = col.on('unnested', function (obj) {
        this.evict(key(obj))
      }, this)

      this.on('unnest', function () { col.off(ev1).off(ev2) })
      this.append(col.filter(filter).map(key))
      return this
    },
  })

  return Effects
})