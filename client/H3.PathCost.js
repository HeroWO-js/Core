define(['Common', 'ObjectStore', 'Calculator'], function (Common, ObjectStore, Calculator) {
  "use strict"
  var _ = Common._

  // Avoid slower to/fromContiguous().
  function storeMul(store, map) {
    var mul = store.schemaLength()
    var size = store.size()

    if (size.x != map.get('width') ||
        size.y != map.get('height') ||
        size.z != map.get('levels')) {
      throw new Error('Unsupported ObjectStore layout.')
    }

    return mul
  }

  // Calculates action points needed to move a hero to a specific cell on square adventure map.
  var PathCost = Common.Sqimitive.extend('HeroWO.H3.PathCost', {
    OBJECT: -1,   // impassable due to a map.objects
    VEHICLE: -2,  // impassable due to incompatible vehicle/tile type
    GUARDED: -3,  // impassable due to a guarding monster nearby
    SHROUDED: -4, // impassable due to the spot being unexplored

    mixIns: [Common.ContextModule],
    delayRender: false,
    _hero: 0,
    _groundCalcs: null,
    _coordEffectCounter: null,
    _coordCalcs: null,
    _shared: null,
    _walkImpassable: null,
    _walkTerrain: null,
    _stopTerrain: null,

    _opt: {
      // If set, invisible bits in map.shroud for hero's owner are regarded as impassable; with fog though this doesn't fully work (XXX): DOM.Mini/Map hide non-permanent objects in fog (like heroes, not trees), yet info about which is leaked through PathCost, which checks byPassable and may report an explored tile as impassable even though there's no object shown standing on it in ADVMAP.
      //
      // This cannot be changed on run-time while any PathCost.Calculator depends on this PathCost (it doesn't rebind listeners). Otherwise changing it affects next costAt().
      //
      // Doesn't track Screen's mapShroud.
      shroud: true,
      calculators: 0,   // internal
    },

    _initToOpt: {
      hero: '._hero',
    },

    events: {
      init: function () {
        this._groundCalcs = new Map
        this._coordCalcs = new Map

        // Initializing _shared here rather than in attach() to allow calling calculatorAt() before Context render. Calculators still won't work (render) until then, but they can be hooked.
        //
        // XXX this is now !delayRender so no need for workaround
        this._shared = this.cx.shared(this.constructor.shared, function () {
          var rules = this.cx.modules.nested('HeroWO.H3.Rules')
          var terrainShift = Common.powerOf2(_.max(rules.constants.class.terrain) + 1)
          var riverShift = Common.powerOf2(_.max(rules.constants.class.river) + 1) + terrainShift
          var reachAtter = this.cx.map.bySpot.atter(['id', 'type', 'actionable'], {array: true})
          var reachTypes = [this.cx.map.constants.object.type.hero, this.cx.map.constants.object.type.boat]
          var shipwreck = rules.objectsID.shipwreck
          var guardedAtter = this.cx.map.bySpot.atter(['displayOrder', 'guarded'], {array: true})
          var guarded = this.cx.map.constants.spotObject.guarded.guarded

          return _.extend(this.cx.map.byPassable.schema(), {
            mul: storeMul(this.cx.map.byPassable, this.cx.map),
            ownerIndex: this.cx.map.objects.propertyIndex('owner'),
            vehicleIndex: this.cx.map.objects.propertyIndex('vehicle'),

            boat: function ($1, $2, $3, $4, l, n) {
              var at = reachAtter(n, l)
              return at[2] && at[1] == rules.map.constants.object.type.boat || null
            },

            horseReach: function ($1, $2, $3, $4, l, n) {
              var at = reachAtter(n, l)
              if (at[2] && (reachTypes.indexOf(at[1]) != -1 ||
                  // No need to listen to map.objects changes because $class cannot change.
                  shipwreck.indexOf(rules.map.objects.atCoords(at[0], 0, 0, 'class', 0)) != -1)) {
                return true
              }
            },

            guarded: function ($1, $2, $3, $4, l, n) {
              var at = guardedAtter(n, l)
              return at[0] >= 0 && at[1] === guarded || null
            },

            groundKey: function (terrain, river, road) {
              return terrain | river << terrainShift | road << riverShift
            },
          })
        }, this)
      },

      attach: function () {
        // This could be a TakeRelease but since it's impossible to imagine an
        // anyhow long game period without a single request to pathfinding, we're
        // keeping it around as a singleton. It would be too expensive to recreate
        // it from scratch instead of maintaining incremental updates in background.
        this._coordEffectCounter =
          this.cx.modules.nested(PathCost.CoordEffectCounter.name) ||
          this.cx.addModule('-', PathCost.CoordEffectCounter)

        var nHero = this.map.objects.toContiguous(this._hero, 0, 0, 0)

        this._walkImpassable = this.cx.listeningEffectCalculator({
          shared: false,
          update: !!this.get('calculators'),
          class: Calculator.Effect.GenericBool,
          target: this.rules.constants.effect.target.hero_walkImpassable,
          ifObject: this._hero,
        })
          .take()

        this._walkTerrain = this.cx.listeningEffectCalculator({
          shared: false,
          update: !!this.get('calculators'),
          class: Calculator.Effect.GenericIntArray,
          target: this.rules.constants.effect.target.hero_walkTerrain,
          ifObject: this._hero,
        })
          .take()

        this._stopTerrain = this.cx.listeningEffectCalculator({
          shared: false,
          update: !!this.get('calculators'),
          class: Calculator.Effect.GenericIntArray,
          target: this.rules.constants.effect.target.hero_stopTerrain,
          ifObject: this._hero,
        })
          .take()
      },

      change_calculators: function (now, old) {
        if (!!now != !!old) {
          function update(calc) {
            calc.set('update', !!now)
            now && calc.updateIfNeeded()
          }

          this._walkImpassable.batch([this._walkTerrain, this._stopTerrain], function () {
            update(this._walkImpassable)
            update(this._walkTerrain)
            update(this._stopTerrain)
          }, this)

          this._groundCalcs.forEach(update)
          this._coordCalcs.forEach(update)
        }
      },

      '-unnest': function () {
        // PathCost can be remove()'d before attach().
        if (this._parent && this._walkImpassable) {
          this._walkImpassable.release()
          this._walkTerrain.release()
          this._stopTerrain.release()
          this._groundCalcs.forEach(Common.p('release'))
          this._coordCalcs.forEach(Common.p('release'))
        }
      },
    },

    // Returns the cost of traveling from an adjacent cell to the given cell.
    //
    // Doesn't treat margin area specially, relying on the fact it should be unreachable due to absence of any terrain tiles.
    costAt: function (x, y, z, n, options, returnCalculator) {
      // XXX+I Pathfinder should take into account target object's passability. However, it is returned by triggerSpotEffects ('stand', 'stop', etc.) which is not known beforehand (and it may depend on arbitrary world properties, moreover - those set after part of the move route was traversed). For example, in SoD placing a Scholar and wearing Angel Wings or Boots of Levitation results in the following move route (¹ to ³):
      //
      //   [_²[S³[_]  _ = ground, S = scholar
      //   [ ¹[ ][ ]  water
      //   [_][H][_]  H = hero
      //
      // Interestingly, placing an actionable spot of some object (like Windmill) on the left of Scholar (in ²) makes the latter unreachable (even though ² itself is reachable and can be triggered as normal travel destination).
      //
      // For this to work, we likely need to move passability detection from triggerSpotEffects into a more specialized, almost constant method.

      // XXX+I,C Some diagonal movements (where any adjacent tile is a ground?) are prohibited on water. For example, one cannot interact with Mermaids after boarding [S] here (Mermaids shifted by one to the left are reachable):
      //
      //   [_][_][ ][ ]     _ = ground
      //   [ ][ ][ ][ ]     [ ] = water
      //   [ ][#][@][#]     [#@#] = Mermaids
      //   [ ][S][H][_]     S = ship, H = hero on ground
      //   [ ][ ][_][_]
      //
      // A simpler example where ² is only reachable via ¹:
      //
      //   [ ²[_]           _ = ground
      //   [ ¹[S]

      options = options || {}

      if (this._opt.shroud) {
        var owner = this.map.objects.atCoords(this._hero, 0, 0, this._shared.ownerIndex, 0)
        if (!(this.map.shroud.atCoords(x, y, z, owner) >= 0)) {
          return this.SHROUDED
        }
      }

      // bySpot has schemaLength() of 1 which we can use to convert between
      // map-wise contiguous n and map-wise coords.
      //
      // XXX here and in other places: replace such calls with map.to/fromContiguous?
      if (n == null) {
        n = this.map.effects.bySpot.toContiguous(x, y, z, 0)
      }

      var pn = n * this._shared.mul
      var walkImpassable = this._walkImpassable.updateIfNeeded()._opt.value
      var vehicle = this.map.objects.atCoords(this._hero, 0, 0, this._shared.vehicleIndex, 0)

      if ((options.isDestination || !walkImpassable) &&
          this.map.byPassable.atContiguous(pn + this._shared.impassable, 0) &&
          (!options.isDestination ||
           // Make normally impassable tiles passable if they are actionable and are hero's travel destination.
           !this.map.byPassable.atContiguous(pn + this._shared.actionable, 0) ||
           // ...Unless hero is on a ship and target is a (unoccupied) boat.
           (vehicle === this.rules.constants.object.vehicle.ship &&
            this.map.bySpot.findAtCoords(x, y, z, 0, this._shared.boat)) ||
           // ...Unless hero intends to travel from above onto the actionable or
           // from the actionable upwards (both restrictions also apply for diagonal move):
           // [ ][H]  cannot travel from H to @                  [ ][..]  dest
           // [ ¹[@]  but can travel from H to ¹ and then to @   [ ¹[H@]  via ¹
           // This is seemingly unaffected by Angel Wings ("seemingly" because
           // SoD has a bug with pathfinder sometimes not recognizing the
           // artifact when putting it on and off).
           (options.from && options.from[1] < y &&
            // ...But do allow direct trip if the only actionable object is a hero (or boat, monster, shipwreck, whirlpool, treasure: bonfire/skeleton/resource/scholar/chest/pandora's box, artifact/spell scroll, garrison), regardless of vehicle. This means two heroes can trade without detour unless any of them stands on an actionable:
            // [ ][1]   1 = hero on vacant spot
            // [ ¹[2]   2 = hero on Swan Pond
            // Above, for 1 to trade with 2 or vice-versa any must stand on ¹.
            this.map.byPassable.atContiguous(pn + this._shared.actionableNH, 0)))) {
        return this.OBJECT
      }

      // "from the actionable upwards"; [H@]; [2]→[1].
      if (!walkImpassable && options.from && options.from[1] > y) {
        var fpn = this.map.byPassable.toContiguous(options.from[0], options.from[1], options.from[2], 0)
        if (this.map.byPassable.atContiguous(fpn + this._shared.actionableNH, 0) &&
            this.map.byPassable.atContiguous(fpn + this._shared.impassable, 0)) {
          return this.OBJECT
        }
      }

      // tileType may be false within map margins because there are no terrain tiles.
      var tileType = this.map.byPassable.atContiguous(pn + this._shared.type, 0)

      // Disallow passing over actionable spots (except for Grail/Event) even if can normally pass otherwise (such as with Angel Wings) if those spots are on tiles that the hero cannot stand (land) onto. In SoD this can be tested by equipping Angel Wings and trying to walk from one shore to another, with Mermaids in between - two tiles on the sides are non-actionable impassable and ignored (flown over) by Angel Wings while the tile in between is impassable and treated as an obstacle:
      //
      //   [_][_][_]
      //   [#¹[M²[#¹  ¹ passable by Angel Wings
      //   [_][H][_]  ² impassable by it
      if (this.cx.get('classic') && !options.isDestination &&
          this.map.byPassable.atContiguous(pn + this._shared.actionable, 0) &&
          this.map.byPassable.atContiguous(pn + this._shared.impassable, 0) &&
          (options.walkTerrain || this._stopTerrain.updateIfNeeded()._opt.value).indexOf(tileType) == -1) {
        return this.OBJECT
      }

      // walkTerrain allows estimating cost over grounds impassable by hero's current vehicle. Resulting cost is not accurate because hero_actionCost calculators still use the hero's vehicle but it tells if the spot is potentially passable, which is useful when figuring if there is a path between two spots.
      if ((options.walkTerrain || (options.isDestination ? this._stopTerrain : this._walkTerrain).updateIfNeeded()._opt.value).indexOf(tileType) == -1) {
        var passable
        // XXX+RH vehicle characteristics
        if (options.isDestination) {
          switch (tileType) {
            case this.rules.constants.passable.type.ground:
              if (options.disembark) {
                passable = vehicle === this.rules.constants.object.vehicle.ship &&
                           // Forbid simultaneous "disembark & encounter" (while allowing "disembark & fight guarded") if target spot is an impassable actionable (the only passable actionable in SoD is water-based Whirlpool; allow disembarking on similar but ground-based passable actionables should they be added in the future).
                           // [S][_]    S = hero on ship
                           // [ ][@]    @ = monster, Garden of Revelation, etc.
                           !this.map.byPassable.atContiguous(pn + this._shared.impassable, 0)
              }
              break
            case this.rules.constants.passable.type.water:
              // XXX consider eliminating bySpot usage in PathCost, extending byPassable properties instead
              passable = vehicle === this.rules.constants.object.vehicle.horse &&
                this.map.bySpot.findAtCoords(x, y, z, 0, this._shared.horseReach)
              break
          }
        }
        if (!passable) {
          return this.VEHICLE
        }
      }

      // XXX+I Since a monster prevents movement around itself, it is impossible to encounter the monster's own actionable spot:
      //
      //   [ ][.][.][.]   [.] = guarded
      //   [H][.][@][.]   H = hero, @ = monster (unreachable in HeroWO)
      //   [ ][.][.][.]
      //
      // However, SoD makes an exception, allowing building route to [@] through any [.] (guarded by target [@] only) if [@] is the travel destination. This purportedly improves user experience even though technically it works exactly as if moving onto a [.] (the hero stops and combat starts without reaching [@]).
      if (!options.isDestination && !walkImpassable &&
          this.map.bySpot.findAtCoords(x, y, z, 0, this._shared.guarded)) {
        return this.GUARDED
      }

      var o = {
        hero: this._hero,
        x: x,
        y: y,
        z: z,
        n: n,
      }

      // It's okay if we prune a Calculator requested by returnCalculator - it'll
      // be released by us but if the caller needs it, it'll remain alive.
      function prune(map, max) {
        if (map.size > max) {
          var times = []
          map.forEach(function (calc, key) {
            times.push([calc._opt.pathTime, calc, key])
          })
          times.sort(function (a, b) { return a[0] - b[0] })
            .slice(0, map.size - max * 0.8)
            .forEach(function (a) {
              map.delete(a[2])
              a[1].release()
            })
        }
      }

      if (this._coordEffectCounter.hasAt(n)) {
        var calc = this._coordCalcs.get(n)
        if (!calc) {
          prune(this._coordCalcs, 100)
          this._coordCalcs.set(n, calc = this._makeCalcAtCoords(o))
        }
      } else {
        _.extend(o, {
          terrain:  this.map.byPassable.atContiguous(pn + this._shared.terrain, 0),
          river:    this.map.byPassable.atContiguous(pn + this._shared.river, 0),
          road:     this.map.byPassable.atContiguous(pn + this._shared.road, 0),
        })

        var gk = this._shared.groundKey(o.terrain, o.river, o.road)
        calc = this._groundCalcs.get(gk)
        if (!calc) {
          prune(this._groundCalcs, 100)
          this._groundCalcs.set(gk, calc = this._makeGroundCalc(o))
        }
      }

      calc.set('pathTime', Date.now())
      return returnCalculator == _ ? calc : calc.updateIfNeeded()._opt.value
    },

    _makeCalcAtCoords: function (o) {
      return this.cx.listeningEffectCalculator({
        shared:     false,
        update:     !!this.get('calculators'),
        target:     this.rules.constants.effect.target.hero_actionCost,
        ifObject:   o.hero,
        ifX:        o.x,
        ifY:        o.y,
        ifZ:        o.z,
      })
        .take()
    },

    _makeGroundCalc: function (o) {
      return this.cx.listeningEffectCalculator({
        shared:     false,
        update:     !!this.get('calculators'),
        target:     this.rules.constants.effect.target.hero_actionCost,
        ifObject:   o.hero,
        ifTerrain:  o.terrain,
        ifRiver:    o.river,
        ifRoad:     o.road,
      })
        .take()
    },

    // Returns a self-updating Calculator evaluating to movement cost of a particular cell.
    calculatorAt: function (x, y, z, n, options) {
      if (n == null) {
        n = this.cx.map.effects.bySpot.toContiguous(x, y, z, 0)
      }

      // Context will return an existing Calculator if it has the same PathCost config thanks to _keyOptions.
      return this.cx.calculator(PathCost.Calculator, _.extend({}, options, {
        id: this._hero,
        x: x,
        y: y,
        z: z,
        n: n,
        pn: n * this._shared.mul,
        cost: this,
      }))
    },
  }, {shared: {}})

  // Internal class that determines if there is any Effect affecting a specific map spot that could influence the cost of moving over it. Obtaining cost for such spots requires creating a Calculator, one per each evaluated spot and hero (their number can get quite high). PathCost optimizes this by creating a Calculator per one hero/terrain/river/road combination for spots not targeted by a positional Effect.
  PathCost.CoordEffectCounter = Common.Sqimitive.extend('HeroWO.H3.PathCost.CoordEffectCounter', {
    mixIns: [Common.ContextModule],
    delayRender: false,
    _counts: {},

    events: {
      attach: function () {
        if (storeMul(this.map.effects.bySpot, this.map) != 1) {
          // Currently effects' bySpot index consists of just Effect n and this
          // allows using bySpot's n directly as tile's n (as in map X*Y*Z) as
          // used by costAt().
          throw new Error('Unsupported ObjectStore layout.')
        }

        var target = this.rules.constants.effect.target.hero_actionCost
        var targetIndex = this.map.effects.propertyIndex('target')
        var tracked = new Set

        var add = function (nSpot, nEffect) {
          // target cannot change after Effect creation so not setting up any
          // hooks on nEffect.
          if (this.map.effects.atContiguous(nEffect + targetIndex, 0) == target) {
            tracked.add(nEffect)

            return ++this._counts[nSpot] ||
              // Was undefined, now NaN, pretend old value was 0.
              // Since -1 count is impossible, this is the only case.
              (this._counts[nSpot] = 1)
          }
        }.bind(this)

        this.autoOff(this.map.effects.bySpot, {
          oadd: function (n, $, props) {
            if (add(n, props[0]) === 1) {
              this.fire('has_' + nSpot, [true])
            }
          },

          oremove: function (n, $, props) {
            if (tracked.has(props[0])) {
              switch (this._counts[n]--) {
                case 0:
                  throw new Error('Broken integrity of ' + this)
                case 1:
                  this.fire('has_' + nSpot, [false])
              }
            }
          },
        })

        this.map.effects.bySpot.find(0, function (nEffect, $2, $3, $4, $5, n) {
          add(n, nEffect)
        })
      },
    },

    // Returns true if any positional Effect exists for the given map spot.
    hasAt: function (n) {
      return this._counts[n] > 0
    },

    // Below events are only fired for changes made after initialization (attach()),
    // not for spot Effects existing prior to it.
    // has_N(true)  - first spot-based Effect added for where there were none
    // has_N(false) - last spot-based Effect removed for where there were some
  })

  // Calculates action points needed to move a hero to a specific cell on square adventure map, updating itself as the cost changes letting client react to this fact.
  PathCost.Calculator = Calculator.extend('HeroWO.H3.PathCost.Calculator', {
    delayRender: false,
    _keyOptions: ['x', 'y', 'z', 'isDestination', 'from', 'walkTerrain', 'disembark'],
    _costAt: null,

    // Do not change these after attach().
    _opt: {
      //id: 0,  // Hero's, required for determining cx.calculator()'s key
      x: null,
      y: null,
      z: null,
      n: null,
      isDestination: null,
      from: null,
      walkTerrain: null,
      disembark: null,
      pn: null,
      cost: null,
    },

    events: {
      attach: function () {
        var cost = this.get('cost')
        cost.getSet('calculators', Common.inc())

        this._costAt = cost.costAt.bind(cost,
          this.get('x'), this.get('y'), this.get('z'), this.get('n'),
          this.get())

        cost.fuse('-unnest', 'remove-', this)

        this.autoOff(cost._walkImpassable, {change_value: 'update'})
        this.autoOff(cost._walkTerrain, {change_value: 'update'})
        this.autoOff(cost._stopTerrain, {change_value: 'update'})
        this.autoOff(this.map.byPassable, ['ochange_n_' + this.get('pn'), 'update'])
        this.autoOff(cost._coordEffectCounter, ['has_' + this.get('n'), 'update'])

        var nHero = this.map.objects.toContiguous(cost._hero, 0, 0, 0)

        if (this.get('from')) {
          var fpn = this.map.byPassable.toContiguous(this.get('from')[0], this.get('from')[1], this.get('from')[2], 0)
          this.autoOff(this.map.byPassable, ['ochange_n_' + fpn, 'update'])
        }

        if (!this.get('isDestination')) {
          var guardedIndex = this.map.bySpot.propertyIndex('guarded')
          var guarded = this.map.constants.spotObject.guarded.guarded
          this.autoOff(this.map.bySpot, [
            'ochange_n_' + this.map.bySpot.toContiguous(this.get('x'), this.get('y'), this.get('z'), 0),
            function ($1, $2, prop, now, old) {
                // Ignore changes between false/terrain.
              if (prop == guardedIndex && (now === guarded || old === guarded)) {
                this.update()
              }
            },
          ])
        }

        if (this.get('isDestination')) {
          this.autoOff(this.map.objects, [
            'ochange_p_' + cost._shared.vehicleIndex,
            function (n) {
              n == nHero && this.update()
            },
          ])
        }

        if (cost.get('shroud')) {
          var owner = this.map.objects.atCoords(cost._hero, 0, 0, cost._shared.ownerIndex, 0)
          var opt = this._opt

          this.autoOff(this.map.objects, [
            'ochange_p_' + cost._shared.ownerIndex,
            function (n, $2, prop, now) {
              if (n == nHero) {
                owner = now
                this.update()
              }
            },
          ])

          this.autoOff(this.map.shroud, {
            changes: function (tiles) {
              var found = tiles.some(function (tile) {
                return tile[6] && tile[0] == opt.x && tile[1] == opt.y &&
                       tile[2] == opt.z && tile[3] == owner
              })

              found && this.update()
            },
          })
        }
      },

      '+normalize_spotBased': function (res, value) {
        value === true && (value = this._costAt(_))
        // value can be negative if unreachable.
        return (value instanceof Object) ? value : null
      },

      change_spotBased: function (now, old) {
        old && this.autoOff(old)
        now && this.autoOff(now, {change_value: 'update'})
      },

      '+_calculate': function (res) {
        res.value = this._costAt()
        res.spotBased = true
      },

      '-unnest': function () {
        if (this._parent) {
          this.get('cost').getSet('calculators', Common.inc(-1))
        }
      },
    },
  }, {shared: {}})

  // Calculates action points (subtracted from creature's speed) needed to move a hero to a specific cell on hexagonal combat map.
  //
  // In SoD, all costs are 1 except for impassable cells.
  PathCost.Hex = Common.Sqimitive.extend('HeroWO.H3.PathCost.Hex', {
    mixIns: [Common.ContextModule],
    delayRender: false,
    _combat: null,
    _creature: null,    // Map.Combat.Creature
    _shared: null,
    _flying: null,

    _initToOpt: {
      combat: '._combat',
      creature: '._creature',
    },

    events: {
      attach: function () {
        this._shared = this.cx.shared(this.constructor.shared, function () {
        }, this)

        this._flying = this.cx.listeningEffectCalculator({
          shared: false,
          update: false,
          class: Calculator.Effect.GenericBool,
          target: this.rules.constants.effect.target.creature_flying,
          ifObject: this._creature.party.object && this._creature.party.object.get('id'),
          ifCreature: this._creature.get('creature'),
        })
          .take()
      },

      '-unnest': function () {
        this._parent && this._flying && this._flying.release()
      },
    },

    // Returns the cost of traveling from an adjacent cell to the given cell.
    //
    // This assumes x/y do not exceed map dimensions when added to creature's
    // width/height.
    costAt: function (x, y, z, n, options) {
      options = options || {}

      if (n == null) {
        n = this._combat.bySpot.toContiguous(x, y, z, 0)
      }

      // Cannot stand on impassable.
      if (options.isDestination || !this._flying.updateIfNeeded()._opt.value) {
        var sn = n
        var stride = this._combat._opt.width - (this._creature._opt.width - 1)
        var me = this._creature._parentKey
        var myTeam = this._creature.party.player._opt.team

        function cannotStep(cr) {
          if (cr != me) {
            cr = this._combat.objects.nested(cr)

            if (cr._opt.special != this.map.constants.creature.special.gate ||
                (!cr._opt.open && cr.party.player._opt.team != myTeam)) {
              return true
            }
          }
        }

        this.map.walkObjectBox(this._creature._opt, 0, function (o) {
          if (!o.ox && o.on) {
            sn += stride
          }
          if (this._creature._opt.passable[o.on] == '0' &&
              this._combat.bySpot.findAtContiguous(sn++, cannotStep, this)) {
            return sn = true
          }
        }, this)

        if (sn === true) {
          return Infinity
        }
      }

      return 1    // movement cost of 1 along any combat terrain
    },

    // No calculatorAt() because this class is used on the combat map for
    // calculating all possible paths and this would take a lot of calculators
    // (15*11 cells). One should listen to any changes to bySpot,
    // creature_flying, Player team, Creature open.
  }, {shared: {}})

  return PathCost
})