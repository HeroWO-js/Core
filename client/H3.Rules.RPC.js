define(['RPC.Common', 'Map', 'Calculator', 'H3.Combat'], function (Common, HMap, Calculator, Combat) {
  "use strict"
  var _ = Common._

  // XXX+R we currently have a variety of tracing log methods: here, AI, Calculator, etc. try to unify them; also see ll
  var tc

  // This is a big mix-in for `#RPC, mixed-in to created syncs by H3.Rules.
  //
  // Main purpose of this is to make direct modifications to the world in response to player commands (after validating them): move hero on adventure map, trade at Marketplace, erect building, etc.
  //
  // Another purpose is to manage a combat (but this is due to refactoring), split in two methods: do_combat() (response to player command like cast spell or shoot enemy) and _startCombat() (general management of combat states - new turn, combat end, etc.).
  //
  // XXX=R refactor and move generic methods to `#RPC, extract and move logic to H3.Rules
  return {
    rules: null,
    // Whether this RPC is administrative, i.e. used for player 0 (neutral) on master. Set by H3.Rules.
    master: false,

    _opt: {
      traceCombatState: false,
    },

    // State of every active combat on map.
    //
    // Don't access state outside of this RPC's player context. For example, don't try to read 'morale' of current queue creature because state only tracks current player's creatures, and if another player is taking turn then this value is inaccessible.
    _combats: {},

    events: {
      change_traceCombatState: function (now) {
        now == true && (now = _.log)
        var rules = this.rules
        var id = 0

        var tracer = function (arg) {
          if (arg === +1 || arg == -1) {
            if ((this._opt.logLevel += arg) < 0) {
              console.warn('Negative logLevel')
            }
            arg > 0 ? this._opt.logTimes.push(Date.now())
              : this._opt.logTime.push(this._opt.logTimes.pop())
          } else {
            // If you see something strange in the output, you can change the
            // constant below, reload the page, do exactly what you did last
            // time and the debugger will break at the point that emits the "strange" entry.
            //if (id == 123) { debugger }
            var args = _.toArray(arguments)
            if (args[0] instanceof Combat.State) {
              args[1] = 'State %s/P%d ' + args[1]
              args.splice(1, 0, args.shift()._cid, arg.player.get('player'))
            }
            var time = Date.now() - (this._opt.logTime.pop() || Date.now())
            time = time < 50 ? '' : '+' + time
            args[0] = 'C%s/%04d %-6s%s' + args[0]
            args.splice(1, 0, this._parentKey, id++, time, _.repeat(' ', this.get('logLevel') * 2))
            return now.apply(this, args)
          }
        }

        this.get('context').map.combats.each(hookCombat)
        this.get('context').map.combats.on('nestExNew', hookCombat)

        function hookCombat(combat) {
          combat.child && (combat = combat.child)
          combat.tc = now && tracer

          function hookCreature(obj) {
            obj.on('-ifSet', function (opt, value) {
              if (combat.tc && !obj.isEqual(value, this._opt[opt])) {
                combat.tc('%s.%s = %s batch=%d : %s %s', obj.constructor.name.replace(/.*\./, ''), opt, value, this._batchID, obj._parentKey, (obj instanceof HMap.Combat.Creature) ? rules.creatures.atCoords(obj.get('creature'), 0, 0, 'namePlural', 0) : '')
              }
            })
          }

          combat.objects.each(hookCreature)

          combat.objects.on('nestExNew', function (res) {
            hookCreature(res.child)
          })
        }

        _.each(this._combats, function (state) {
          state.on('-ifSet', function (opt, value) {
            combat.tc && combat.tc(state, '%s = %s batch=%d', opt, value, this._batchID)
          })
        })
      },

      // Provides H3-specific values of AObject properties of a hero during its movement on adventure map.
      '+_moveOpt': function (res, hero, spot, override, faceOnly) {
        var opt = _.extend(hero.get(), override)
        var actionable = this.get('context').map.actionableSpot(opt.id, true)
        var dx = spot[0] - (opt.x + actionable[0])
        var dy = spot[1] - (opt.y + actionable[1])

        var group = this.rules.constants.animation.group[
          (dy < 0 ? 'up' : dy > 0 ? 'down' : '') +
          (!dx ? '' : dy ? 'Right' : 'right')
        ]

        // SoD doesn't mirror ADVMAP objects on Y axis.
        res.mirrorX = dx < 0

        res.texture = Common.alterStringifiedArray(opt.texture, 4, group)
        res.animation = Common.alterStringifiedArray(opt.animation, 4, group)
        var anim = this.rules.animationsID[Common.alterStringifiedArray(res.animation)[1] + '_' + group]
        res.duration = this.rules.animations.atCoords(anim, 0, 0, 'duration', 0)

        if (!faceOnly) {
          // XXX=R:dor:
          res.displayOrder = 1 << 26 | spot[1] + opt.height - 1 << 18 | 3 << 16 | spot[0] << 2
        }
      },

      // Handles H3-specific remote commands during configuration of new game (both single-player and multi-player).
      '=do_configure': function (sup, args) {
        switch (args.do) {
          case 'handicap':
          case 'town':
          case 'heroes':
          case 'bonus':
            var map
            if (!this.get('player') || !this.get('context').get('configuring')
                || (map = this.get('context').map).get('confirming')) {
              throw new Common.ClientError('Invalid state')
            }
            if (this.get('observer') || (!this.get('player').get('host') && args.player != this.get('player').get('player'))) {
              throw new Common.ClientError('Player not editable', Common.CODES.mustAuth)
            }
            var pl = map.players.nested(args.player)
            var consts = map.constants.mapPlayer.bonus
            var value = args.value
            switch (args.do) {
              case 'handicap':
                value = parseFloat(value) || false
                break
              case 'town':
                if (value !== false && !_.includes(pl.get('towns') || [], value)) {
                  value = false
                }
                pl.set('heroes', [])
                pl.getSet('bonus', function (cur) {
                  if (value === false && cur == consts.resource) {
                    cur = false
                  }
                  return cur
                })
                break
              case 'heroes':
                value = (value || []).map(function (value) {
                  if (value != null && (!pl.isHuman() || pl.get('town') === false || !_.includes(_.toArray(pl.get('startingHeroClasses')), value) || pl.get('town') != this.rules.heroClasses.atCoords(this.rules.heroes.atCoords(value, 0, 0, 'class', 0), 0, 0, 'town', 0))) {
                    value = null
                  }
                  return value
                }, this)
                break
              case 'bonus':
                switch (value) {
                  case consts.resource:
                    if (pl.get('town') === false) { value = false }
                    break
                  case consts.artifact:
                    if (pl.get('startingHeroClasses') == null ||
                        pl.get('startingHeroClasses') === false) {
                      value = false
                    }
                    break
                  default:
                    if (!_.includes(consts, value)) { value = false }
                }
            }
            pl.set(args.do, value)
            return new Common.Response({status: true})
        }

        return sup(this, arguments)
      },
    },

    // Performs hero adventure map movement along the designated route, triggering effects of visited spots.
    //
    // result is an array of untraveled path segments (slice of args.path).
    // result[0][6] is set to the cost, if one was available. Empty result means entire
    // requested route was traveled. No detours are allowed (moving stops) and args.path must be optimal (else the pathfinder will return a longer path - detour).
    do_moveHero: function (args) {
      this.checkPlayer({screen: ''})
      var map = this.get('context').map
      try {
        var hero = map.representationOf(args.hero)
      } catch (e) {}
      if (!args.path.length || !hero || !hero.isHero || hero.get('owner') != this.get('player').get('player')) {
        throw new Common.ClientError('Invalid hero')
      }
      var transition = map.transitions.nest({
        type: 'mapMove',
        object: hero.get('id'),
        path: [],
      })
      transition.collect()
      this.rules.objectPending([args.hero], ['moveHero', args.path, transition._parentKey, 0])
      // moveHero cannot return any meaningful result because it's asynchronous. If we delay resolving this Async then server will be unable to stop until everything triggered by move (e.g. combats) completes, and that can be lengthy.
      return new Common.Response({status: true})
    },

    _moveHero: function (hero, resPath, transition, resPathIndex) {
      var map = this.get('context').map
      transition = map.transitions.nested(transition)
      hero = map.representationOf(hero)
      function txPath(a) {
        var path = transition.getSet('-path', Common.concat([a.concat()]))
        // Don't collect if transition is new (collect was called immediately after nest).
        path.length && transition.collect()
      }
      var actionable = map.actionableSpot(hero.get('id'), true)
      var item = resPath[resPathIndex]
      // XXX=B Hero will pause over invalid spot (impassable, different terrain, etc.) if features change in such a way that continued movement is impossible (movement-triggered changes - a new impassable appears, terrain changes, etc.) or if client-supplied route is suboptimal. While some cases can be potentially solved by examining the move route ahead, it still won't protect against map changes unless we somehow lock certain map regions. Perhaps if this happens hero should be transported back to the last valid spot.
      //
      // XXX=B a similar problem is that PathCost is not aware of APs, they may run out over water with Boots of Levitation or over impassable with that or Angel Wings, and hero will also stop
      var path = this.get('context').pathFindFor(hero.get('id'), item.slice(0, 3), null, {notDestination: resPathIndex + 1 < resPath.length}) || []
      item[6] = (path[1] || [])[6]
      var remAP = hero.get('actionPoints') - item[6]
      // If remaining APs is 0, allow action if hero had some APs before starting the move.
      if (path.length == 2 && (remAP > 0 || (!remAP && hero.get('actionPoints') > 0))) {
        transition.get('path').length || txPath(path[0])
        // XXX=R should pathFindFor() adjust returned path to subtract actionableSpot? just like it automatically adds it.
        //item[0] -= actionable[0]
        //item[1] -= actionable[1]
        hero.assignResp(this._moveOpt(hero, item, {actionPoints: remAP}, true), transition.options(transition.get('path').length - 1, {transitionFace: true}))
        var res = this.get('context').triggerSpotEffects(item[0] /*+ actionable[0]*/, item[1] /*+ actionable[1]*/, item[2], hero, resPath.length - resPathIndex - 1, resPath[resPathIndex - 1] || path[0], transition)
        if (transition.get('final') || !map.objects.anyAtCoords(hero.get('id'), 0, 0, 0)) {
          // The hero was removed by spot effects (unpending_moveHero).
          return
        } else if (res == 'remove') {
          return hero.remove()  // will fire unpending_moveHero
        } else if (res == 'stop') {
          resPathIndex = resPath.length
        } else {
          txPath(item)
          if (res == 'break') {
            if (resPath[resPathIndex + 1]) {
              transition.collectFinal()
              transition = map.transitions.nest({
                type: 'mapMove',
                object: hero.get('id'),
                path: [],
              })
                .collect()
            }
          } else {
            map.objects.batch(null, function () {
              if (hero.get('visiting')) {
                map.objects.setAtCoords(hero.get('id'), 0, 0, 0, 'visiting', false, transition.options(transition.get('path').length - 2))
                map.objects.setAtCoords(hero.get('visiting'), 0, 0, 0, 'visiting', false, transition.options(transition.get('path').length - 2))
              }
              hero.assignResp(this._moveOpt(hero, item), transition.options(transition.get('path').length - 2))
            }, this)
            if (res == 'stand') {
              resPathIndex = resPath.length
            }
          }
        }
      } else {
        resPathIndex = resPath.length
      }
      // Making sure to finish if there's nothing to walk (as a result of entirely traversing resPath or because of 'stop') because triggerSpotEffects() may start an operation requiring user input and if we keep our top mapMove transition, other transitions will be delayed resulting in a deadlock.
      if (resPath[resPathIndex + 1]) {
        this.rules.objectPending([hero.get('id')], ['moveHero', resPath, transition._parentKey, resPathIndex + 1])
      } else {
        transition.collectFinal()
      }
      this.rules.objectFinished([hero.get('id')])
    },

    // spot - new coords of hero's actionable spot
    _moveOpt: function (hero, spot, override, faceOnly) {
      var actionable = this.get('context').map.actionableSpot(hero.get('id'), true)
      return _.extend({}, override, faceOnly ? {} : {
        x: spot[0] - actionable[0],
        y: spot[1] - actionable[1],
        z: spot[2],
        resting: false,
      })
    },

    _startMaster: function () {
      this.autoOff(this.get('context').map.objects, {
        pending_moveHero: '_moveHero',
        unpending_moveHero: function ($1, $2, transition) {
          this.get('context').map.transitions.nested(transition).collectFinal()
        },
      })
    },

    // XXX=R
    do_hireHero: function (args) {
      this.checkPlayer()
      var map = this.get('context').map
      try {
        var hero = map.representationOf(args.hero)
      } catch (e) {}
      if (!hero || !hero.isHero || hero.get('owner') !== 0) {
        throw new Common.ClientError('Invalid hero')
      }
      if (this.get('player').heroes.length >= 8) {    // XXX=RH limit
        throw new Common.ClientError('Hero limit reached')
      }
      // XXX=RH hardcoded class ID
      var standalone = map.objects.atCoords(args.object, 0, 0, 'type', 0) != map.constants.object.type.town
      if (standalone) {
        this.checkPlayer({screen: ''})
        if (!_.includes(this.rules.objectsID.tavern, map.objects.atCoords(args.object, 0, 0, 'class', 0))) {
          throw new Common.ClientError('Invalid tavern')
        }
        if (!args.byHero) {
          throw new Common.ClientError('byHero not provided')
        }
      } else {
        this.checkPlayer({screen: 'townscape', screenTown: args.object})
        var buildings = this.get('context').oneShotEffectCalculation({
          class: Calculator.Effect.GenericIntArray,
          target: map.constants.effect.target.town_buildings,
          ifObject: args.object,
        })
        // XXX=R hardcoded building ID, need to make an Effect target
        var found = buildings.indexOf(args.building) != -1 && args.building == this.rules.buildingsID.tavern
        if (!found) {
          throw new Common.ClientError('Invalid town')
        }
        if (map.objects.atCoords(args.object, 0, 0, 'visiting', 0)) {
          throw new Common.ClientError('Town occupied')
        }
      }
      var heroes = this.get('context').oneShotEffectCalculation({
        class: Calculator.Effect.GenericIntArray,
        target: map.constants.effect.target.tavernHeroes,
        ifObject: args.byHero,    // optional
        ifPlayer: args.byHero ? null : map.objects.atCoords(args.object, 0, 0, 'owner', 0),
        ifBonusObject: args.object,
        ifBuilding: args.building,
      })
      var found = heroes.indexOf(args.hero) != -1
      if (!found) {
        throw new Common.ClientError('Invalid hero')
      }
      var spot = map.actionableSpot(args.object)
      // XXX=R In SoD all types of taverns and towns are on solid ground so vehicle will be always horse. However, we allow water-based taverns in custom maps. This is still assuming only water terrain needs ship and others need horse because there's no terrain type -> vehicle index. We could figure that by iterating over all vehicle types and querying hero_walkTerrain Effect target but doesn't sound good either.
      var vehicle = map.bySpot.findAtCoords(spot[0], spot[1], spot[2], 'type', function (type, $2, $3, $4, l, n) {
        if (type == map.constants.object.type.terrain) {
          var id = map.bySpot.atContiguous(n - map.bySpot.propertyIndex('type') + map.bySpot.propertyIndex('id'), l)
          var cls = this.rules.classes.atCoords(map.objects.atCoords(id, 0, 0, 'class', 0), 0, 0, 'class', 0)
          return cls == map.constants.class.terrain.water
            ? map.constants.object.vehicle.ship
            : map.constants.object.vehicle.horse
        }
      }, this)
      if (vehicle == null) {
        throw new Common.ClientError('Invalid actionable spot')
      }
      var rem = this.get('context').subtractResourcesByCalc(this.get('player').get(), {
        target: map.constants.effect.target.tavernCost,
        ifObject: args.byHero,
        ifPlayer: args.byHero ? null : map.objects.atCoords(args.object, 0, 0, 'owner', 0),
        ifBonusObject: args.object,
        ifBuilding: args.building,
      })
      if (_.min(rem[0]) < 0) {
        throw new Common.ClientError('Insufficient resources')
      }
      this.get('player').assignResp(rem[0])
      var act = map.actionableSpot(hero.get('id'), true)
      map.objects.batch(null, function () {
        hero.batch(null, function () {
          hero.assignResp({
            owner: this.get('player').get('player'),
            x: spot[0] - act[0],
            y: spot[1] - act[1],
            z: spot[2],
            vehicle: vehicle,
            // XXX=R:dor:
            displayOrder: 1 << 26 | spot[1] + hero.get('height') - 1 << 18 | 3 << 16 | spot[0] << 2,
          })
          if (!standalone) {
            hero.set('visiting', args.object)
            map.objects.setAtCoords(args.object, 0, 0, 0, 'visiting', hero.get('id'))
          }
        }, this)
      }, this)
      this.rules._regenHero(hero)
      return new Common.Response({status: true, result: hero.get('id')})
    },

    // Passes user choice to a pending GenericEncounter.
    //
    // If server was restarted, encounter handlers are lost (they may have hooks or overridden methods and cannot be serialized) and this method may fail. In such rare cases the player can simply repeat the encounter.
    do_encounterPrompt: function (args) {
      this.checkPlayer()
      var handler = this.rules._encounters[args.hero]
      if (!handler || !this.get('player').heroes.nested(args.hero)) {
        throw new Common.ClientError('Invalid hero')
      }
      handler.promptAnswer(args.choice)
      return new Common.Response({status: true})
    },

    // Passes user choice to a pending GenericEncounter.
    //
    // Same note as in do_encounterPrompt().
    do_encounterChoice: function (args) {
      this.checkPlayer()
      var handler = this.rules._encounters[args.hero]
      if (!handler || !this.get('player').heroes.nested(args.hero)) {
        throw new Common.ClientError('Invalid hero')
      }
      handler.choiceAnswer(args.choice)
      return new Common.Response({status: true})
    },

    // XXX=R
    do_heroLevelSkill: function (args) {
      // Called on master when there's a single option (see _grantExperience()).
      this.master || this.checkPlayer()
      var map = this.get('context').map
      try {
        var hero = this.master ? map.representationOf(args.hero)
          : this.get('player').heroes.nested(args.hero)
      } catch (e) {}
      if (!hero) {
        throw new Common.ClientError('Invalid hero')
      }
      var select = map.objects.atCoords(args.hero, 0, 0, 'skillSelect', 0).concat()
      var found = _.some(select, function (levelChoices, li) {
        return _.some(levelChoices, function (choice) {
          if (choice.skill == args.skill) {
            switch (choice.affector) {
              case undefined:    // new skill
                map.effects.append({
                  source: map.constants.effect.source.level,
                  target: map.constants.effect.target.hero_skills,
                  modifier: [map.constants.effect.operation.append, choice.skill],
                  priority: map.effects.priority(map.constants.effect.operation.append, map.constants.effect.priority.mapSpecific),
                  ifObject: hero.get('id'),
                })
              case false:   // existing skill, new mastery, no affector (e.g. coming from hero class or map specifications)
                map.effects.append({
                  source: map.constants.effect.source.level,
                  target: map.constants.effect.target.skillMastery,
                  modifier: -1.0001 * choice.mastery,
                  priority: map.effects.priority(map.constants.effect.operation.const, map.constants.effect.priority.mapSpecific),
                  ifObject: hero.get('id'),
                  ifSkill: choice.skill,
                })
                break
              default:    // new mastery, change affector coming from previous level-up
                map.effects.setAtContiguous(choice.affector + map.effects.propertyIndex('modifier'), 0, -1.0001 * choice.mastery)
            }
            select.splice(li, 1)
            map.objects.setAtCoords(args.hero, 0, 0, 0, 'skillSelect', select.length && select)
            return true
          }
        })
      }, this)
      if (!found) {
        throw new Common.ClientError('Invalid skill')
      }
      return new Common.Response({status: true})
    },

    // XXX=R
    do_heroArtifactSwap: function (args) {
      this.checkPlayer()
      var map = this.get('context').map
      try {
        var fromHero = this.get('player').heroes.nested(args.fromHero)
      } catch (e) {}
      var toHero
      // XXX=I receiving hero must be adjacent or be garrisoned while other is visiting (same as in do=garrison, see comments there)
      //
      // XXX=I check Player._opt.screen*
      map.players.some(function (player) {
        return toHero = player.heroes.nested(args.toHero)
      })
      if (!fromHero || !toHero) {
        throw new Common.ClientError('Invalid hero')
      }

      var fromStore = map.objects.subAtCoords(fromHero.get('id'), 0, 0, 'artifacts', 0)
      try {
        var toStore = map.objects.subAtCoords(toHero.get('id'), 0, 0, 'artifacts', 0)
        try {
          var fromArtifact = fromStore.atCoords(args.fromSlot, 0, 0, 'artifact', 0)
          var toArtifact = toStore.atCoords(args.toSlot, 0, 0, 'artifact', 0)
          if (fromArtifact == null) {
            throw new Common.ClientError('Empty fromSlot')
          }
          var fits = function (art, slot) {
            return _.includes(this.rules.artifacts.atCoords(art, 0, 0, 'slots', 0), Math.min(slot, this.rules.artifactSlotsID.backpack))
          }.bind(this)
          if (!fits(fromArtifact, args.toSlot) && (args.toSlot < this.rules.artifactSlotsID.backpack || !args.interim)) {
            throw new Common.ClientError('Does not fit')
          }
          if (toArtifact != null && !fits(toArtifact, args.fromSlot)) {
            throw new Common.ClientError('Does not fit')
          }
          if (toHero.get('id') != fromHero.get('id')) {
            var tradable = this.get('context').oneShotEffectCalculation({
              class: Calculator.Effect.GenericBool,
              target: map.constants.effect.target.artifactTrade,
              ifArtifact: fromArtifact,
              ifObject: fromHero.get('id'),
              ifTargetObject: toHero.get('id'),
            })
            if (toArtifact != null) {
              tradable &= this.get('context').oneShotEffectCalculation({
                class: Calculator.Effect.GenericBool,
                target: map.constants.effect.target.artifactTrade,
                ifArtifact: toArtifact,
                ifObject: toHero.get('id'),
                ifTargetObject: fromHero.get('id'),
              })
            }
            if (!tradable) {
              throw new Common.ClientError('Not tradable')
            }
          }

          var transition = map.transitions.nest({
            type: 'heroArtifactSwap',
            fromHero: fromHero.get('id'),
            fromSlot: args.fromSlot,
            toHero: toHero.get('id'),
            toSlot: args.toSlot,
            interim: args.interim,
          })
          transition.collect()

          toStore.extendTo(args.toSlot)
          fromStore.extendTo(args.fromSlot)
          fromStore.batch(toStore == fromStore ? null : [toStore], function () {
            var old1 = toStore.removeAtCoords(args.toSlot, 0, 0, 0, transition.options())
            var old2 = fromStore.removeAtCoords(args.fromSlot, 0, 0, 0, transition.options())
            old2 && toStore.addAtCoords(args.toSlot, 0, 0, old2, transition.options())
            old1 && fromStore.addAtCoords(args.fromSlot, 0, 0, old1, transition.options())
          })
        } finally {
          toStore.release()
        }
      } finally {
        fromStore.release()
      }

      transition.collectFinal()
      return new Common.Response({status: true})
    },

    do_heroTrade: function (args) {
      if (args.leave) {
        this.rules.objectFinished([args.from, args.to]
          .concat(_.compact([
            this.get('context').map.objects.atCoords(args.from, 0, 0, 'visiting', 0),
            this.get('context').map.objects.atCoords(args.to, 0, 0, 'visiting', 0),
          ])))
      }
      return new Common.Response({status: true})
    },

    do_buyBlacksmith: function (args) {
      this.checkPlayer({screen: 'townscape', screenTown: args.town})
      var map = this.get('context').map
      var buildings = this.get('context').oneShotEffectCalculation({
        class: Calculator.Effect.GenericIntArray,
        target: map.constants.effect.target.town_buildings,
        ifObject: args.town,
      })
      if (buildings.indexOf(this.rules.buildingsID.blacksmith) == -1) {
        throw new Common.ClientError('Invalid town')
      }
      // XXX=IC SoD allows buying only if the slot is free
      if (args.hero &&
          args.hero != map.objects.atCoords(args.town, 0, 0, 'visiting', 0) &&
          args.hero != map.objects.atCoords(args.town, 0, 0, 'garrisoned', 0)) {
        throw new Common.ClientError('Invalid hero')
      }
      switch (this.rules.buildings.atCoords(this.rules.buildingsID.blacksmith, 0, 0, 'townTypes', 0)[map.objects.atCoords(args.town, 0, 0, 'subclass', 0)]) {
        case map.constants.building.blacksmith.ballista:
          var artifact = this.rules.artifactsID.ballista
          break
        case map.constants.building.blacksmith.firstAidTent:
          var artifact = this.rules.artifactsID.firstAidTent
          break
        case map.constants.building.blacksmith.ammoCart:
          var artifact = this.rules.artifactsID.ammoCart
      }
      var rem = this.get('context').subtractResourcesByCalc(this.get('player').get(), {
        target: map.constants.effect.target.artifactCost,
        ifObject: args.town,
        ifBuilding: this.rules.buildingsID.blacksmith,
        ifArtifact: artifact,
      })
      if (_.min(rem[0]) < 0) {
        throw new Common.ClientError('Insufficient resources')
      }
      this.get('player').assignResp(rem[0])
      var art = map.objects.subAtCoords(args.hero, 0, 0, 'artifacts', 0)
      try {
        this.rules._equipTrophy(art, artifact)
      } finally {
        art.release()
      }
      return new Common.Response({status: true})
    },

    do_warMachineFactory: function (args) {
      this.checkPlayer()
      // XXX=I check $pending for both bonus and hero objects; here and in other do_...
      var map = this.get('context').map
      try {
        var obj = map.representationOf(args.actor)
      } catch (e) {}
      if (!_.includes(this.rules.objectsID.warMachineFactory, map.objects.atCoords(args.object, 0, 0, 'class', 0))) {
        throw new Common.ClientError('Invalid object')
      }
      if (!obj || !obj.isHero || obj.get('owner') != this.get('player').get('player')) {
        throw new Common.ClientError('Invalid hero')
      }
      // XXX=IC SoD allows buying only 1 and only if the slot is free (since can't fit these into backpack)
      if (!_.includes([this.rules.creaturesID.ballista, this.rules.creaturesID.firstAidTent, this.rules.creaturesID.ammoCart], args.creature)) {
        throw new Common.ClientError('Invalid creature')
      }
      var rem = this.get('context').subtractResourcesByCalc(this.get('player').get(), {
        target: map.constants.effect.target.creature_cost,
        ifBonusObject: args.object,
        ifObject: args.actor,
        ifCreature: args.creature,
      }, 'resources_', args.count)
      if (_.min(rem[0]) < 0) {
        throw new Common.ClientError('Insufficient resources')
      }
      this.get('player').assignResp(rem[0])
      var art = map.objects.subAtCoords(args.actor, 0, 0, 'artifacts', 0)
      try {
        this.rules._equipTrophy(art, this.rules.artifactsID[_.indexOf(this.rules.creaturesID, args.creature)])
      } finally {
        art.release()
      }
      return new Common.Response({status: true})
    },

    do_shipyard: function (args) {
      this.checkPlayer()
      var map = this.get('context').map
      var standalone = map.objects.atCoords(args.object, 0, 0, 'type', 0) != map.constants.object.type.town
      if (standalone) {
        this.checkPlayer({screen: ''})
        if (!_.includes(this.rules.objectsID.shipyard, map.objects.atCoords(args.object, 0, 0, 'class', 0))) {
          throw new Common.ClientError('Invalid shipyard')
        }
        try {
          var obj = args.actor && map.representationOf(args.actor)
        } catch (e) {}
        if (obj && (!obj.isHero || obj.get('owner') != this.get('player').get('player'))) {
          throw new Common.ClientError('Invalid actor')
        }
      } else {
        this.checkPlayer({screen: 'townscape', screenTown: args.object})
        var buildings = this.get('context').oneShotEffectCalculation({
          class: Calculator.Effect.GenericIntArray,
          target: map.constants.effect.target.town_buildings,
          ifObject: args.object,
        })
        if (buildings.indexOf(this.rules.buildingsID.shipyard) == -1) {
          throw new Common.ClientError('Invalid town')
        }
        if (args.actor &&
            args.actor != map.objects.atCoords(args.object, 0, 0, 'visiting', 0) &&
            args.actor != map.objects.atCoords(args.object, 0, 0, 'garrisoned', 0)) {
          throw new Common.ClientError('Invalid actor')
        }
      }
      var state = this.get('context').calculator(this.rules.constructor.ShipState, {
        id: args.object,
      }).takeRelease()
      if (state.get('value') != 'able') {
        throw new Common.ClientError('Invalid state')
      }
      var rem = this.get('context').subtractResourcesByCalc(this.get('player').get(), {
        target: map.constants.effect.target.shipCost,
        ifBonusObject: args.object,
        ifBuilding: standalone ? null : this.rules.buildingsID.shipyard,
        ifObject: args.actor,
        ifPlayer: this.get('player').get('player'),
      }, 'resources_', args.count)
      if (_.min(rem[0]) < 0) {
        throw new Common.ClientError('Insufficient resources')
      }
      this.get('player').assignResp(rem[0])
      // XXX=R Very similar to _disembark().
      var cls = this.get('context').get('classic') ? this.rules.objectsID.boat_1[0] : _.sample(this.rules.objectsID.boat)
      var catter = this.rules.classes.atter([
        // XXX=R:clc:
        'type', 'texture', 'animation', 'duration', 'width', 'height', 'miniMap', 'passableType', 'passable', 'actionable', 'actionableFromTop'])
      var boat = catter(cls, 0, 0, 0)
      var act = map.actionableSpot(boat, true)
      _.extend(boat, {
        class: cls,
        subclass: false,
        x: state.get('x') - act[0],
        y: state.get('y') - act[1],
        z: state.get('z'),
        // XXX=R:dor:
        displayOrder: 1 << 26 | state.get('y') - act[1] + boat.height - 1 << 18 | 3 << 16 | (state.get('x') - act[0]) << 2,
      })
      if (!this.get('context').get('classic') && state.get('x') < map.actionableSpot(args.object)[0]) {
        boat.mirrorX = true
      }
      this.rules.createObject(boat)
      return new Common.Response({status: true})
    },

    do_marketplace: function (args) {
      this.checkPlayer()
      var map = this.get('context').map
      var standalone = map.objects.atCoords(args.object, 0, 0, 'type', 0) != map.constants.object.type.town
      if (standalone) {
        // XXX+I implement encounter of standalone tradingPost
        this.checkPlayer({screen: ''})
        if (!_.includes(this.rules.objectsID.tradingPost, map.objects.atCoords(args.object, 0, 0, 'class', 0))) {
          throw new Common.ClientError('Invalid marketplace')
        }
        try {
          var obj = args.actor && map.representationOf(args.actor)
        } catch (e) {}
        if (obj && (!obj.isHero || obj.get('owner') != this.get('player').get('player'))) {
          throw new Common.ClientError('Invalid actor')
        }
      } else {
        this.checkPlayer({screen: 'townscape', screenTown: args.object})
        var buildings = this.get('context').oneShotEffectCalculation({
          class: Calculator.Effect.GenericIntArray,
          target: map.constants.effect.target.town_buildings,
          ifObject: args.object,
        })
        if (buildings.indexOf(this.rules.buildingsID.marketplace) == -1) {
          throw new Common.ClientError('Invalid town')
        }
      }
      switch (args.do) {
        case 'trade':
          var rate = this.get('context').oneShotEffectCalculation({
            target: map.constants.effect.target.tradeRate,
            ifPlayer: standalone ? this.get('player').get('player') : map.objects.atCoords(args.object, 0, 0, 'owner', 0),
            ifObject: args.object,
            ifResource: args.give,
            ifResourceReceive: args.take,
          })
          var resource = _.indexOf(this.rules.constants.resources, args.give)
          var amount = Math.floor(rate / this.rules.constants.effect.multiplier * args.amount)
          if (args.give == args.take ||
              args.amount > this.get('player').get('resources_' + resource) ||
              amount < 1) {
            throw new Common.ClientError('Invalid amount')
          }
          this.get('player').batch(null, function () {
            this.getSet('resources_' + resource, Common.inc(-args.amount))
            this.getSet('resources_' + _.indexOf(map.constants.resources, args.take), Common.inc(amount))
          })
          break
        case 'transfer':
          var resource = _.indexOf(this.rules.constants.resources, args.give)
          if (args.amount > this.get('player').get('resources_' + resource)) {
            throw new Common.ClientError('Insufficient resources')
          }
          var recv = map.players.nested(args.receiver)
          this.get('player').batch([recv], function () {
            this.getSet('resources_' + resource, Common.inc(-args.amount))
            recv.getSet('resources_' + resource, Common.inc(+args.amount))
          })
          break
        default:
          throw new Common.ClientError('Invalid operation')
      }
      return new Common.Response({status: true})
    },

    do_townBuild: function (args) {
      this.checkPlayer({screen: 'townscape', screenTown: args.town})
      var map = this.get('context').map
      try {
        var town = map.representationOf(args.town)
      } catch (e) {}
      if (!town || town.get('type') != map.constants.object.type.town || town.get('owner') != this.get('player').get('player')) {
        throw new Common.ClientError('Invalid town')
      }
      var calc = this.get('context').calculator(this.rules.constructor.TownBuildingState, {
        player: this.get('player'),
        id: town.get('id'),
        building: args.building,
      }).takeRelease()
      if (calc.get('value') != 'able') {
        throw new Common.ClientError('Cannot erect')
      }
      this.rules._erect(town.get('id'), [args.building], calc._buildings._calc.get('affectors')) // XXX=RH
      map.effects.append({
        target: map.constants.effect.target.town_hasBuilt,
        modifier: -1,
        priority: map.effects.priority(map.constants.effect.operation.delta, map.constants.effect.priority.mapSpecific),
        ifObject: town.get('id'),
        maxDays: 1,
      })
      var rem = this.get('context').subtractResourcesByCalc(this.get('player').get(), {
        target: map.constants.effect.target.town_buildingCost,
        ifObject: town.get('id'),
        ifBuilding: args.building,
      })
      this.get('player').assignResp(rem[0])
      return new Common.Response({status: true})
    },

    do_buildRoute: function (args) {
      this.checkPlayer()
      var map = this.get('context').map
      try {
        var hero = map.representationOf(args.hero)
      } catch (e) {}
      if (!hero || !hero.isHero || hero.get('owner') != this.get('player').get('player')) {
        throw new Common.ClientError('Invalid hero')
      }
      // array of [x, y, z]
      var path = map.objects.fire('buildRoute', [hero.get('id')].concat(args.destination))
      return new Common.Response({status: !!path, result: {path: path}})
    },

    // Validates and returns context of this client's do=combat request.
    _checkCombat: function (args, handle) {
      var combat = this.get('context').map.combats.nested(args.combat)

      combat && combat.tc && combat.tc('P%d%s do=%s %j', this.get('player') && this.get('player').get('player'), this.master ? '!' : '', args.do, _.omit(args, 'do'))

      if (!this.get('player')) {
        throw new Common.ClientError('Player not selected')
      } else if (!combat) {
        throw new Common.ClientError('Combat not found')
      } else if (!combat.get('interactiveParty') ||
                 (!this.master && combat.get('interactiveParty').player != this.get('player'))) {
        throw new Common.ClientError('Player not interactive')
      }

      var state = this._createCombatState(combat, combat.get('interactiveParty').player)

      combat.tc && combat.tc(state, 'batch=%d', state && state.get('lastBatchID'))

      if (!this.master && !state.canControl()) {
        throw new Common.ClientError('Cannot control')
      }

      // Processing combat needs up to date State but it may lag behind combat updates, especially if clients may cause transition to another 'state' as it happens during 'turn' and 'tactics'. For example, imagine a single-player setup (when master RPC and Screen are running inside the same browser page) and a party that listens to change_state and calls 'defend' from there (this may happen indirectly, e.g. by listening to State's change_creature which State sets in response to Combat's change_state). At the same time, H3 RPC also listens to change_state (such as to start new 'turn' in response to 'turned') and it relies on State's options (like 'interactive' or 'creature'). Since the order in which events are dispatched is indeterminate, it may happen that 'defend' is called before H3 RPC's State is updated and H3 RPC uses State's options that correspond to the pre-change_state time:
      //
      //    Client         | Master RPC       | Queued events
      //                   | State creature = (A)
      //               -- state change to 'turn' --
      //                   |                  | (1) Client Combat change_state
      //                   |                  |     from 'turned' to 'turn'
      //                   |                  | (2) Master Combat change_state
      //                   |                  |     from 'turned' to 'turn'
      //    (1) dispatched |                  |
      //    -> rpc.defend  |                  | (2) .
      //                   | -> State.creature = old! (A)
      //
      // If 'defend' doesn't use obsolete State options then desync may carry on
      // until H3 RPC needs to handle state change:
      //
      //                   | creature.queueMove = false
      //                   | -> state = 'turned'
      //                   |                  | (2) .
      //                   |                  | (3) Client Combat change_state
      //                   |                  |     from 'turn' to 'turned'
      //                   |                  | (4) Master Combat change_state
      //                   |                  |     from 'turn' to 'turned'
      //              -- state change to 'turned' --
      //                   | (2) dispatched   |
      //                   |                  | (3) .
      //                   |                  | (4) .
      //
      // When (2) arrives at RPC, actual Combat state is 'turned' but (2) tells
      // it's 'turn', and of course RPC's State is out of sync even more.
      //
      // Here's a practical case: a party with one undamaged creature and one First Aid Tent, controllable by owner (thanks to First Aid skill). There is one Combat instance but two Combat.State instances (one belongs to the master RPC, another to player's H3.DOM.Combat) and both are listening to change_interactive. At some point, the combat proceeds as follows:
      //
      // 1. The creature does 'defend'. Master sets its 'queueMove' to false which causes Combat's 'state' to become 'turned'.
      // 2. In response to the transition to 'turned', _creatureTurn() picks next object from queue which is the FAT. It sets combat's 'interactiveCreature' to FAT.
      // 3. As mentioned, two State's have hooks on change_interactiveCreature. It happens so that the H3.DOM.Combat's State is notified first, and the problem arises...
      // 4. Combat._updateMode() sees the newly interactive creature is a FAT and creates Mode.FirstAid.
      // 5. Mode.FirstAid's render() checks creatures that can be healed, finds none and immediately calls do_combat('defend') on RPC.
      // 6. do_combat() attempts to handle 'defend' but one of the sanity checks fails (at best) because it's based on RPC's own State and this State is yet to be notified of change_interactiveCreature, meaning that State's 'phase' and other _opt'ions are invalid.
      //
      // This is solved, first, by batchGuard()'ed listener of RPC's change_phase so that it's always using current values rather than event-provided, and, second, by deferring client actions until RPC's State catches up, which is determined by comparing ID of batch used when setting Combat's _opt and ID of batch seen at the time State's update has ran.
      //
      // XXX=R see if this conundrum can be eased by using the new "^" event prefix in Sqimitive
      if (state.get('lastBatchID') != combat._lastBatchID) {
        combat.tc && combat.tc(state, 'deferring until batch=%d', combat._lastBatchID)
        combat.tc && combat.tc(+1)

        state.once('change_lastBatchID', function (id) {
          combat.tc && combat.tc(state, 'now batch=%d, Combat\'s=%d', id, combat._lastBatchID)

          if (id == combat._lastBatchID) {
            this._checkCombat(args, handle)
          } else {
            // I'm not sure but this should never happen normally - no new changes (batches) should take place between on(change_lastBatchID) and until State finishes _update.
            throw new Error('Combat State is deferring again.')
          }

          combat.tc && combat.tc(-1)
          combat.tc && combat.tc(state, 'end deferred')
        }, this)
        return
      }

      combat.tc && combat.tc(state, 'begin handle do=%s', args.do)
      combat.tc && combat.tc(+1)

      var c = {
        cx: this.get('context'),  // Context
        rules: this.rules,  // H3.Rules
        combat: combat,   // Map.Combat
        state: state,  // H3.Combat.State
        party: combat.get('interactiveParty'),  // Map.Combat.Party
        creature: combat.get('interactiveCreature'),    // Map.Combat.Creature
      }

      // Delaying changes to combat state (_opt) until the command processing
      // ends. This is what can happen if its events are dispatched immediately:
      //
      // 1. Client calls 'defend' on creature A.
      // 2. The command does set() on creature A, starting a batch() on A.
      // 3. A is the last creature in queue and when 'queueMove' is set to
      //    false, queue is emptied. queue.unnested() hook is triggered and it
      //    does combat.set('state', 'turned') to indicate that current creature
      //    has ended turn. (This starts a batch on combat.)
      // 4. combat's 'state' changes from 'turn' to 'turned'. The handler
      //    sees empty queue and changes 'state' to 'round'. (Because combat has
      //    a batch, this event is deferred but it doesn't matter.)
      // 5. The handler of 'round' refills the queue by setting 'queueMove' of
      //    every alive creature to true. However, creature A has a batch active
      //    so 'queueMove' is changed but queue's hook on change_queueMove is
      //    not called immediately.
      // 6. 'round' calls change to 'turned' to initiate a new turn. Queue state
      //    at this point is broken because it doesn't have creature A.
      // 7. Moreover, after new round has begun, processing of 'defend' ends
      //    and deferred events on A are dispatched, but they are out of phase:
      //    they are not running during A's 'turn'!
      //
      // Wrapping command in combat.batch() makes its events to only dispatch
      // after the command is done, putting A's events in phase:
      //
      // 1. Client calls 'defend' on creature A.
      // 2. A batch is started on combat.
      // 3. The command does set() on creature A.
      // 4. Queue is emptied, queue.unnested() is triggered and combat 'state'
      //    is changed to 'turned', but change_state is not dispatched yet.
      // 5. Command processing ends. combat batch also ends and dispatches
      //    accumulated change_state and others.
      // 7. change_state to 'turned' is processed, transitioning to 'round'
      //    and proper queue refilling because there is no longer an active
      //    batch on A.
      //
      // The only nuance is that the client doesn't receive confirmation of
      // command completion until new round begins (because queue refilling and
      // all these transitions happen during 'defend' processing).
      //
      // Technically, set()-s can be used instead of assignResp() since we're
      // inside the batch, but using the latter for clarity.
      combat.batch(null, function () {
        handle(c)

        if (combat.tc) {
          combat.tc(state, 'end do=%s batch, now firing:', args.do)
          combat.tc && combat.tc(+1)

          combat._batches.forEach(function (batch, i) {
            combat.tc(state, '  Batch %d', i)

            batch.forEach(function (event) {
              if (event[0] != 'change') {
                combat.tc(state, '    %.s', event.join(' '))
              }
            })
          })
        }
      })

      combat.tc && combat.tc(-1)
      combat.tc && combat.tc(-1)
      combat.tc && combat.tc(state, 'end handle do=%s', args.do)
    },

    _createCombatState: function (combat, player) {
      var state = this._combats[combat._parentKey + '.' + player.get('player')]

      if (!state) {
        combat.tc && combat.tc('creating State for P%d', player.get('player'))
        combat.tc && combat.tc(+1)

        var cls = Combat.State.extend({
          events: {
            _update: function () {
              // XXX=R logically, this should be moved to:
              //   Combat.State = Common.Sqimitive.extend('HeroWO.H3.Combat.State', {
              //     _update: function () {
              //       this.batch(null, function () {
              //         <here>
              //       })
              // this way, changes done after batch() ends but before _update's override handler is reached will be noticed
              this.set('lastBatchID', combat._lastBatchID)
            },
          },
        })
        state = this._combats[combat._parentKey + '.' + player.get('player')] = this.get('context').addModule(cls, {
          combat: combat,
          player: player,
          pathCosts: [],
        })
        combat.fuse('remove', function () {
          state.remove()
          delete this._combats[combat._parentKey + '.' + player.get('player')]
        }, this)

        combat.tc && combat.tc(-1)
        combat.tc && combat.tc(state, 'created')
      }

      return state
    },

    // XXX=R this and all other combat-related methods do not need to be part of RPC, they are not using anything except _opt.context plus do_combat can be called for player different from H3 RPC's player; make a separate class
    //
    // This assumes AObject-s of all parties are frozen with $pending.
    do_combat: function (args) {
      var self = this

      function handle(c) {
        // Returns true if movement was interrupted, false if reached the destination.
        function doMove(path) {
          path = path.concat()
          var transition = c.cx.map.transitions.nest({
            type: 'combatMove',
            combat: c.combat._parentKey,
            creature: c.creature._parentKey,
            path: path.splice(0, 1),
          })
          transition.collect()
          if (c.state.calculate('creature_flying').updateIfNeeded().get('value')) {
            path = [path.pop()]   // just straight to the destination
          }
          var prev = []
          c.combat.walkImpassable(c.creature, function (o) { prev.push(o) })
          // Hop from one cell to another, causing side effects along the way.
          // The common transition smoothes it out for user's UI.
          for (var spot; spot = path.shift(); ) {
            c.creature.assignResp({x: spot[0], y: spot[1]}, transition.options(transition.get('path').length - 1))
            transition.getSet('path', function (cur) {
              return cur.concat([spot])
            })
            transition.collect()
            var cur = []
            c.combat.walkImpassable(c.creature, function (o) { cur.push(o) })
            var txBreak = c.combat.fire('triggerSpotEffects', [c.creature, cur, prev])
            prev = cur
            if (c.combat.get('interactiveCreature') != c.creature) {
              // Land mine, quicksands, etc.
              spot = true
              break
            }
            if (txBreak && path.length) {
              transition.set('ticks', transition.get('path').length)
              transition.collectFinal()
              transition = c.cx.map.transitions.nest({
                type: 'combatMove',
                combat: c.combat._parentKey,
                creature: c.creature._parentKey,
                path: [spot],
              })
              transition.collect()
            }
          }
          transition.set('ticks', transition.get('path').length)
          transition.collectFinal()
          return spot === true
        }

        function endCreatureQueue() {
          if (self._checkCombatEnd(c.combat)) {
            // Why do good things always have to end?..
          } else if (c.combat.get('interactiveCreature') == c.creature) {
            // % determined empirically.
            if (c.creature.get('actions') == 1 /* allow morale affect only the first action in turn */ && _.random(9) < c.state.calculate('creature_morale').updateIfNeeded().get('value')) {
              var transition = c.cx.map.transitions.nest({
                type: 'combatMoraleGood',
                combat: c.combat._parentKey,
                creature: c.creature._parentKey,
              })
                .collect()
              c.combat.log.append({
                type: c.cx.map.constants.combatLog.type.moraleGood,
                party: c.party._parentKey,
                message: [
                  'High morale enables the %s to attack again.',
                  c.rules.creatures.atCoords(c.creature.get('creature'), 0, 0, c.creature.get('count') > 1 ? 'namePlural' : 'nameSingular', 0),
                ],
              }, transition.options())
              transition.collectFinal()
            } else {
              c.creature.set('queueMove', false)
            }
          }
        }

        function isRegular(cr) {
          return cr instanceof HMap.Combat.Creature && !c.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'damageGroup', 0)
        }

        switch (args.do) {
          case 'tacticsNext':
            if (c.state.get('phase') != 'tactics') {
              throw new Common.ClientError('Invalid state')
            }
            var cur = c.combat.queue.at(c.combat.queue.indexOf(c.creature))
            c.combat.queue.nest(c.creature, {pos: cur.pos + c.combat.queue.length})
            c.combat.set('interactiveCreature', c.combat.queue.first())
            break

          case 'tacticsEnd':
            if (c.state.get('phase') != 'tactics') {
              throw new Common.ClientError('Invalid state')
            }
            c.party.set('tactics', null)
            c.combat.assignResp({
              state: 'ready',
              interactiveParty: null,
              interactiveCreature: null,
            })
            break

          case 'surrenderAsk':
            if (c.state.get('phase') != 'tactics' && c.state.get('phase') != 'combat') {
              throw new Common.ClientError('Invalid state')
            }
            if (!c.state.calculateHero('surrenderCan').updateIfNeeded().get('value')) {
              throw new Common.ClientError('Cannot surrender')
            }
            if (c.party.get('pendingSurrender')) {
              throw new Common.ClientError('Surrender already pending')
            }
            // XXX=I allow decisionMaker make a counter-offer with up to +30% difference from the counted price
            //
            // Normally, pendingSurrender cannot be serialized as part of Party because surrenderAsk's Async is part of WS pending until surrenderAccept is called, which unsets pendingSurrender.
            c.party.set('pendingSurrender', resp)
            var decisionMaker = c.combat.parties.find(function (party) {
              return party.player.get('team') != c.party.player.get('team')
            })
            if (!c.cx.get('classic')) {  // SoD doesn't ask the counter-party for decision
              c.cx.map.transitions.nest({
                type: 'combatSurrenderAsk',
                combat: c.combat._parentKey,
                party: c.party._parentKey,
                decisionMaker: decisionMaker._parentKey,
              })
                .collectFinal()
              return    // delay resolving resp
            } else {
              surrenderAccept.call(self, c.combat, c.party, decisionMaker)
            }
            break

          case 'retreat':
            if (c.state.get('phase') != 'tactics' && c.state.get('phase') != 'combat') {
              throw new Common.ClientError('Invalid state')
            }
            if (!c.state.calculateHero('retreatCan').updateIfNeeded().get('value')) {
              throw new Common.ClientError('Cannot retreat')
            }
            c.party.set('retreated', true)
            c.party.invoke('remove')
            retreated(c.combat, c.party)
            break

          case 'wait':
            if (c.state.get('phase') != 'combat') {
              throw new Common.ClientError('Invalid state')
            }
            var transition = c.cx.map.transitions.nest({
              type: 'combatLog',
              combat: c.combat._parentKey,
            })
              .collect()
            c.combat.log.append({
              type: c.cx.map.constants.combatLog.type.wait,
              party: c.party._parentKey,
              message: c.creature.get('count') > 1
                ? [
                  'The %s pause, and wait for a better time to act.',
                  c.rules.creatures.atCoords(c.creature.get('creature'), 0, 0, 'namePlural', 0),
                ]
                : [
                  'The %s pauses, and waits for a better time to act.',
                  c.rules.creatures.atCoords(c.creature.get('creature'), 0, 0, 'nameSingular', 0),
                ],
            }, transition.options())
            transition.collectFinal()
            c.creature.set('queueWait', true)
            c.combat.assignResp({
              state: 'turned',
              interactiveParty: null,
              interactiveCreature: null,
            })
            break

          case 'defend':
            if (c.state.get('phase') != 'combat') {
              throw new Common.ClientError('Invalid state')
            }
            // Since defending increases creature_defense which is only applied to normal $damageGroup, for walls, etc. this action simply skips turn.
            if (isRegular(c.creature) &&
                // For these SoD doesn't boost creature_defense either.
                c.creature.get('special') != self.rules.constants.creature.special.catapult &&
                c.creature.get('special') != self.rules.constants.creature.special.ballista &&
                c.creature.get('special') != self.rules.constants.creature.special.firstAidTent &&
                c.creature.get('special') != self.rules.constants.creature.special.ammoCart) {
              // XXX=C giving bonus = 20% of defense
              var bonus = Math.max(1, Math.round((c.state.calculate('creature_defense').updateIfNeeded().get('value') + c.state.calculateHero('hero_defense').updateIfNeeded().get('value')) / 5))
              var transition = c.cx.map.transitions.nest({
                type: 'combatLog',
                combat: c.combat._parentKey,
              })
                .collect()
              c.combat.log.append({
                type: c.cx.map.constants.combatLog.type.defend,
                party: c.party._parentKey,
                message: c.creature.get('count') > 1
                  ? [
                    'The %s take a defensive stance, and gain +%d defense skill',
                    c.rules.creatures.atCoords(c.creature.get('creature'), 0, 0, 'namePlural', 0),
                    bonus
                  ]
                  : [
                    'The %s takes a defensive stance, and gains +%d defense skill',
                    c.rules.creatures.atCoords(c.creature.get('creature'), 0, 0, 'nameSingular', 0),
                    bonus
                  ],
              }, transition.options())
              transition.collectFinal()
              var effect = c.cx.map.effects.append({
                source: c.cx.map.constants.effect.source.stance,
                target: c.cx.map.constants.effect.target.creature_defense,
                modifier: bonus,
                ifObject: c.party.object && c.party.object.get('id'),
                ifCombatCreature: c.creature._parentKey,
                priority: c.cx.map.effects.priority(c.cx.map.constants.effect.operation.delta, c.cx.map.constants.effect.priority.combat),
              })
            }
            // XXX=C does SoD allow defending artifact creatures (Ballista, etc.)? in-combat log says it isn't gaining +N defense but DEF do have defending animation
            c.creature.assignResp({
              queueMove: false,
              defending: effect && effect[0],
            })
            break

          case 'move':
            var path = c.state.pathTo(args.destination)
            if (!path) {
              throw new Common.ClientError('Unreachable destination')
            }
            if (c.state.get('phase') == 'tactics') {
              var transition = c.cx.map.transitions.nest({
                type: 'combatMove',
                combat: c.combat._parentKey,
                creature: c.creature._parentKey,
                path: path,
              })
              transition.collect()
              var spot = _.last(path)
              c.creature.assignResp({x: spot[0], y: spot[1]}, transition.options())
              transition.collect()    // to match doMove()
              transition.collectFinal()
              // XXX=R duplicates with tacticsNext
              var cur = c.combat.queue.at(c.combat.queue.indexOf(c.creature))
              c.combat.queue.nest(c.creature, {pos: cur.pos + c.combat.queue.length})
              c.combat.set('interactiveCreature', c.combat.queue.first())
            } else if (c.state.get('phase') != 'combat') {
              throw new Common.ClientError('Invalid state')
            } else {
              doMove(path)
              c.creature.getSet('actions', Common.inc())
              endCreatureQueue()
            }
            break

          // Implemented spell IDs:
          //   2 15 16 17 18 19 20 21 22 23 24 25 26 27 28 30 31 32 33 34 35 37 41 42 43
          //   44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 61 66 67 68 69
          case 'cast':
            if (c.state.get('phase') != 'combat') {
              throw new Common.ClientError('Invalid state')
            }
            if (!c.party.object || !c.party.object.isHero) {
              throw new Common.ClientError('Invalid party')
            }
            var heroName = c.cx.oneShotEffectCalculation({
              class: Calculator.Effect.GenericString,
              target: c.cx.map.constants.effect.target.name,
              ifCombat: c.combat._parentKey,
              ifCombatParty: c.party._parentKey,
            })

            function doCalc(cls, target, options) {
              return c.cx.oneShotEffectCalculation(_.extend(options || {}, {
                class: cls,
                target: target,
                ifCombat: c.combat._parentKey,
                ifCombatParty: c.party._parentKey,
                ifSpell: args.spell,
              }))
            }
            function spellLog(global, cr, transition) {
              if (_.isArray(cr)) {
                if (global || !(cr.length || c.cx.get('classic'))) {
                  c.combat.log.append({
                    type: c.cx.map.constants.combatLog.type.spellCast,
                    party: c.party._parentKey,
                    message: [(cr.length || c.cx.get('classic')) ? '%s casts \'%s\'.' : '%s casts \'%s\' but it affects no one!', heroName, c.rules.spells.atCoords(args.spell, 0, 0, 'name', 0)],
                  }, transition.options())
                }
              } else if (!global) {
                c.combat.log.append({
                  type: c.cx.map.constants.combatLog.type.spellCast,
                  party: c.party._parentKey,
                  message: ['%s casts \'%s\' on the %s.', heroName, c.rules.spells.atCoords(args.spell, 0, 0, 'name', 0), c.rules.creatures.atCoords(cr.get('creature'), 0, 0, cr.get('count') > 1 ? 'namePlural' : 'nameSingular', 0)],
                }, transition.options())
              }
            }
            function rollEfficiency(targets, global, transition, noCalcDamages) {
              var damaged = []
              var evaded = []
              var damages = []
              _.each(targets, function (cr) {
                var cr = c.combat.objects.nested(cr)
                var immune = doCalc(Calculator.Effect.GenericBool, c.cx.map.constants.effect.target.creature_spellImmune, {
                  ifTargetCombatCreature: cr._parentKey,
                })
                if (immune) {
                  return
                }
                var evade = doCalc(Calculator.Effect.GenericNumber, c.cx.map.constants.effect.target.creature_spellEvade, {
                  ifTargetCombatCreature: cr._parentKey,
                })
                // && - if creature_spellEvade is 0, don't give any one chance.
                if (evade && evade >= _.random(c.rules.constants.effect.multiplier)) {
                  // SoD doesn't add evasion ("resist") log entry to global spells.
                  if (!global) {
                    c.combat.log.append({
                      type: c.cx.map.constants.combatLog.type.spellEvade,
                      party: c.party._parentKey,
                      message: [
                        'The %s %s the spell!',
                        c.rules.creatures.atCoords(cr.get('creature'), 0, 0, cr.get('count') > 1 ? 'namePlural' : 'nameSingular', 0),
                        cr.get('count') > 1 ? 'resist' : 'resists',
                      ],
                    }, transition.options())
                  }
                  // ...It also doesn't show evasion animation but we leave this for the UI to handle.
                  evaded.push(cr._parentKey)
                  return
                }
                if (noCalcDamages) {
                  var damage = 1
                } else {
                  var damage = doCalc(Calculator.Effect.GenericNumber, c.cx.map.constants.effect.target.spellEfficiency, {
                    ifTargetCombatCreature: global ? undefined : cr._parentKey,
                  })
                }
                if (damage > 0) {
                  damaged.push(cr._parentKey)
                  damages.push(damage)
                }
              })
              return {evaded: evaded, damaged: damaged, damages: damages}
            }

            function doDamage(eff, avg, transition) {
              avg = avg == null ? Math.round(_.sum(eff.damages) / eff.damages.length) : avg
              var res = self._makeDamage(c, eff.damages, eff.damaged.map(c.combat.objects.nested, c.combat.objects), [], {})
              _.extend(eff, _.pick(res, 'dieTransitions', 'hitTransitions', _.forceObject))
              if (isNaN(avg)) {   // no one damaged
                spellLog(false, [], transition)   // log this fact unless in classic mode
              } else {    // got details on damaged dudes
                var msg = c.cx.get('classic') ? [''] : res.msg
                // XXX=R,I:rrl:
                //
                // SoD has different messages for ripple-type spells:
                // - The Death spell does %d damage \n to all living creatures.
                // - The %s spell does %d damage \n to all undead creatures.
                // - The Armageddon does %d damage.
                // We're using the same message for ripple- and arrow-type spells since HeroWO has a complex system of deciding which creature is hit (livind, undead, etc.), and we also explain how many targets perished.
                msg[0] = 'The %s does %d damage.' + msg[0]
                msg.splice(1, 0,
                  c.rules.spells.atCoords(args.spell, 0, 0, 'name', 0),
                  // Display average of real damages dealt instead of nominal damage as found in the databank.
                  avg
                )
                c.combat.log.append({
                  type: c.cx.map.constants.combatLog.type.spellCast,
                  party: c.party._parentKey,
                  message: msg,
                }, transition.options())
              }
              return eff
            }

            if (doCalc(Calculator.Effect.GenericIntArray, c.cx.map.constants.effect.target.hero_spells).indexOf(args.spell) == -1) {
              throw new Common.ClientError('Invalid spell')
            }
            var cost = doCalc(Calculator.Effect.GenericNumber, c.cx.map.constants.effect.target.spellCost)
            if (c.party.object.get('spellPoints') < cost) {
              throw new Common.ClientError('No spell points')
            }
            if (!c.party.object.get('combatCasts')) {
              throw new Common.ClientError('Already cast')
            }
            switch (args.spell) {
              default:
                throw new Common.ClientError('Invalid spell')

              case c.rules.spellsID.magicArrow:      // (A)
              case c.rules.spellsID.iceBolt:
              case c.rules.spellsID.lightningBolt:
              case c.rules.spellsID.titanBolt:
              case c.rules.spellsID.implosion:
              case c.rules.spellsID.deathRipple:     // (R)
              case c.rules.spellsID.destroyUndead:
              case c.rules.spellsID.armageddon:
                var global = doCalc(Calculator.Effect.GenericBool, c.cx.map.constants.effect.target.spellGlobal)
                var cr = c.combat.objects.nested(args.target)
                if (!global && (!cr || !isRegular(cr))) {
                  throw new Common.ClientError('Invalid target')
                }
                var transition = c.cx.map.transitions.nest({
                  type: 'combatSpellArrow',
                  combat: c.combat._parentKey,
                  caster: c.party._parentKey,
                  spell: args.spell,
                  global: global,
                  target: args.target,
                })
                transition.collect()
                var targets = global ? c.combat.objects.filter(isRegular).map(Common.p('_parentKey')) : [args.target]
                var res = doDamage(rollEfficiency(targets, global, transition), null, transition)
                transition.assignResp(_.pick(res, 'evaded', 'damaged', 'dieTransitions', 'hitTransitions', _.forceObject))
                transition.collectFinal()
                break

              case c.rules.spellsID.fireball:    // (F)
              case c.rules.spellsID.frostRing:
              case c.rules.spellsID.inferno:
              case c.rules.spellsID.meteorShower:
                var global = doCalc(Calculator.Effect.GenericBool, c.cx.map.constants.effect.target.spellGlobal)
                var pos = args.target
                if (!global && (!pos || pos[0] < 0 || pos[0] >= c.combat.get('width') || pos[1] < 0 || pos[1] >= c.combat.get('height'))) {
                  throw new Common.ClientError('Invalid target')
                }
                var touchedCells = []  // lists all cells in AoE, doesn't mean there were creatures that were damaged
                var transition = c.cx.map.transitions.nest({
                  type: 'combatSpellArea',
                  combat: c.combat._parentKey,
                  caster: c.party._parentKey,
                  spell: args.spell,
                  global: global,
                  cell: pos,
                })
                transition.collect()
                if (global) {
                  var targets = c.combat.objects.filter(isRegular).map(Common.p('_parentKey'))
                } else {
                  var targets = []
                  var cells = c.state.aroundDeep(pos[0], pos[1], doCalc(Calculator.Effect.GenericNumber, c.cx.map.constants.effect.target.spellAround), doCalc(Calculator.Effect.GenericNumber, c.cx.map.constants.effect.target.spellAroundEye) - 1)
                  _.each(cells, function (box, n) {
                    touchedCells.push(box)
                    c.combat.bySpot.findAtContiguous(n, function (key) {
                      var obj = c.combat.objects.nested(key)
                      isRegular(obj) && targets.push(obj)
                    })
                  })
                }
                var res = doDamage(rollEfficiency(targets, global, transition), null, transition)
                transition.assignResp(_.pick(res, 'evaded', 'damaged', 'dieTransitions', 'hitTransitions', 'touchedCells', _.forceObject))
                transition.collectFinal()
                break

              case c.rules.spellsID.chainLightning:
                // According to my tests, Chain Lightning respects spellImmune (tried on Black Dragons) and respects spellEvade only of the targeted creature (tried on Dwarves) - if that creature resists, the spell fails, but if it succeeds, spellEvade of subsequent creatures it hits is ignored.
                var global = doCalc(Calculator.Effect.GenericBool, c.cx.map.constants.effect.target.spellGlobal)
                if (global) {
                  // Not sure how that should work.
                  throw new Common.ClientError('Chain Lightning cannot be spellGlobal')
                }
                var cr = c.combat.objects.nested(args.target)
                if (!cr || !isRegular(cr)) {
                  throw new Common.ClientError('Invalid target')
                }
                cr = cr._parentKey
                var immune = doCalc(Calculator.Effect.GenericBool, c.cx.map.constants.effect.target.creature_spellImmune, {
                  ifTargetCombatCreature: cr,
                })
                if (immune) {
                  throw new Common.ClientError('Invalid target')
                }

                var transition = c.cx.map.transitions.nest({
                  type: 'combatSpellArrow',
                  combat: c.combat._parentKey,
                  caster: c.party._parentKey,
                  spell: args.spell,
                  target: args.target,
                  dieTransitions: [],
                  hitTransitions: [],
                })
                transition.collect()
                var res = rollEfficiency([args.target], false, transition)
                spellLog(false, res.damaged, transition)
                // XXX=RH
                var max = doCalc(Calculator.Effect.GenericNumber, c.cx.map.constants.effect.target.spellMastery) >= c.cx.map.constants.spell.mastery.advanced ? 5 : 4
                if (res.damaged.length && max > 0) {
                  // XXX=IC SoD seeks nearest, not random
                  var potential = _.shuffle(c.combat.objects.filter(isRegular).map(Common.p('_parentKey')).filter(function (cr) {
                    var immune = doCalc(Calculator.Effect.GenericBool, c.cx.map.constants.effect.target.creature_spellImmune, {
                      ifTargetCombatCreature: cr,
                    })
                    return !immune && cr != res.damaged[0]
                  }))
                  var damage = res.damages[0]
                  while (--max && (cr = potential.shift())) {
                    res.damaged.push(cr)
                    res.damages.push((damage /= 2) || 1)
                  }
                  var dr = doDamage(res, res.damages[0], transition)
                  transition.getSet('dieTransitions', Common.concat(dr.dieTransitions))
                  transition.getSet('hitTransitions', Common.concat(dr.hitTransitions))
                }
                transition.set('evaded', res.evaded)
                transition.set('damaged', res.damaged)
                transition.collectFinal()
                break

              case c.rules.spellsID.disruptingRay:
              case c.rules.spellsID.bless:       // (B)
              case c.rules.spellsID.bloodlust:
              case c.rules.spellsID.haste:
              case c.rules.spellsID.protectionFromWater:
              case c.rules.spellsID.protectionFromFire:
              case c.rules.spellsID.shield:
              case c.rules.spellsID.stoneSkin:
              case c.rules.spellsID.fortune:
              case c.rules.spellsID.precision:
              case c.rules.spellsID.protectionFromAir:
              case c.rules.spellsID.airShield:
              case c.rules.spellsID.mirth:
              case c.rules.spellsID.protectionFromEarth:
              case c.rules.spellsID.counterstrike:
              case c.rules.spellsID.prayer:
              case c.rules.spellsID.frenzy:
              case c.rules.spellsID.slayer:
              case c.rules.spellsID.curse:     // (C)
              case c.rules.spellsID.forgetfulness:
              case c.rules.spellsID.misfortune:
              case c.rules.spellsID.slow:
              case c.rules.spellsID.sorrow:
              case c.rules.spellsID.weakness:
                var global = doCalc(Calculator.Effect.GenericBool, c.cx.map.constants.effect.target.spellGlobal)
                var cr = c.combat.objects.nested(args.target)
                if (!global && (!cr || !isRegular(cr))) {
                  throw new Common.ClientError('Invalid target')
                }
                var transition = c.cx.map.transitions.nest({
                  type: 'combatSpellBuf',
                  combat: c.combat._parentKey,
                  caster: c.party._parentKey,
                  spell: args.spell,
                  global: global,
                  target: args.target,
                })
                transition.collect()
                var targets = global ? c.combat.objects.filter(isRegular).map(Common.p('_parentKey')) : [args.target]
                var cancel = c.rules.spells.atCoords(args.spell, 0, 0, 'cancel', 0) || []
                var res = rollEfficiency(targets, global, transition, true)
                _.each(res.damaged, function (cr) {
                  if (cancel.length) {
                    // XXX=O
                    c.cx.map.effects.find(0, function ($, effect) {
                      if (c.cx.map.effects.atCoords(effect, 0, 0, 'ifCombat', 0) == c.combat._parentKey && (c.cx.map.effects.atCoords(effect, 0, 0, 'ifCombatCreature', 0) === cr || c.cx.map.effects.atCoords(effect, 0, 0, 'ifTargetCombatCreature', 0) === cr)) {
                        var src = c.cx.map.effects.atCoords(effect, 0, 0, 'source', 0)
                        if (src && src[0] == c.cx.map.constants.effect.source.spell && cancel.indexOf(src[1]) != -1) {
                          c.cx.map.effects.removeAtCoords(effect, 0, 0, 0)
                        }
                      }
                    })
                  }
                  cr = c.combat.objects.nested(cr)
                  var effects = c.rules.spells.atCoords(args.spell, 0, 0, c.rules.spells.propertyIndex('effects') + doCalc(Calculator.Effect.GenericNumber, c.cx.map.constants.effect.target.spellMastery), 0)
                  c.rules.appendEmbeddedEffects(effects, function (effect) {
                    if (effect[c.cx.map.effects.propertyIndex('modifier')] === true) {
                      var modifier = effect[c.cx.map.effects.propertyIndex('modifier')] = doCalc(Calculator.Effect /*mixed type*/, c.cx.map.constants.effect.target.spellEfficiency, {
                        ifTargetCombatCreature: cr._parentKey,
                      })
                      // Need to change new Effect's priority based on the modifier we're swapping in because the placeholder value (=== true) is a $const while modifier may now be $delta or other operation.
                      //
                      // XXX=R calc is removed but expandModifier() is semi-static so can use it like that
                      modifier = Calculator.Effect.expandModifier(modifier, c.rules.constants.effect)
                      // XXX=R this partially matches Effect::fromShort() and it only supports some modifier formats (which our spells currently evaluate to); need to implement generic priority calculation like in PHP
                      effect[c.cx.map.effects.propertyIndex('priority')] = c.cx.map.effects.priority(modifier[0], modifier[0] == c.rules.constants.effect.operation.relative ? c.rules.constants.effect.priority.default : c.rules.constants.effect.priority.combat)
                    }
                    if (effect[c.cx.map.effects.propertyIndex('ifCombatCreature')] === true) {
                      effect[c.cx.map.effects.propertyIndex('ifCombatCreature')] = cr._parentKey
                    }
                    if (effect[c.cx.map.effects.propertyIndex('ifTargetCombatCreature')] === true) {
                      effect[c.cx.map.effects.propertyIndex('ifTargetCombatCreature')] = cr._parentKey
                    }
                    if (effect[c.cx.map.effects.propertyIndex('maxRounds')] === false) {
                      effect[c.cx.map.effects.propertyIndex('ifCombat')] = c.combat._parentKey
                      effect[c.cx.map.effects.propertyIndex('maxRounds')] = doCalc(Calculator.Effect.GenericNumber, c.cx.map.constants.effect.target.spellDuration)
                    }
                  })
                  spellLog(global, cr, transition)
                })
                spellLog(global, res.damaged, transition)
                transition.set('evaded', res.evaded)
                transition.set('damaged', res.damaged)
                transition.collectFinal()
                break

              case c.rules.spellsID.cure:
                var global = doCalc(Calculator.Effect.GenericBool, c.cx.map.constants.effect.target.spellGlobal)
                var cr = c.combat.objects.nested(args.target)
                if (!global && (!cr || !isRegular(cr))) {
                  throw new Common.ClientError('Invalid target')
                }
                var transition = c.cx.map.transitions.nest({
                  type: 'combatSpellBuf',
                  combat: c.combat._parentKey,
                  caster: c.party._parentKey,
                  spell: args.spell,
                  global: global,
                  target: args.target,
                })
                transition.collect()
                var targets = global ? c.combat.objects.filter(isRegular).map(Common.p('_parentKey')) : [args.target]
                var res = rollEfficiency(targets, global, transition)
                _.each(res.damaged, function (cr) {
                  // XXX=O
                  c.cx.map.effects.find(0, function ($, effect) {
                    if (c.cx.map.effects.atCoords(effect, 0, 0, 'ifCombat', 0) == c.combat._parentKey && (c.cx.map.effects.atCoords(effect, 0, 0, 'ifCombatCreature', 0) === cr || c.cx.map.effects.atCoords(effect, 0, 0, 'ifTargetCombatCreature', 0) === cr)) {
                      var src = c.cx.map.effects.atCoords(effect, 0, 0, 'source', 0)
                      if (src && src[0] == c.cx.map.constants.effect.source.spell && c.rules.spells.atCoords(src[1], 0, 0, 'aggression', 0) == c.cx.map.constants.spell.aggression.offense) {
                        c.cx.map.effects.removeAtCoords(effect, 0, 0, 0)
                      }
                    }
                  })
                  cr = c.combat.objects.nested(cr)
                  cr.getSet('hitPoints', function (cur) {
                    var full = c.cx.oneShotEffectCalculation({
                      target: c.cx.map.constants.effect.target.creature_hitPoints,
                      ifCombat: c.combat._parentKey,
                      ifCombatCreature: cr._parentKey,
                    })
                    return Math.min(full, cur + res.damages.shift())
                  })
                  spellLog(global, cr, transition)
                })
                spellLog(global, res.damaged, transition)
                transition.set('evaded', res.evaded)
                transition.set('damaged', res.damaged)
                transition.collectFinal()
                break

              case c.rules.spellsID.dispel:
                var global = doCalc(Calculator.Effect.GenericBool, c.cx.map.constants.effect.target.spellGlobal)
                var cr = c.combat.objects.nested(args.target)
                if (!global && (!cr || !isRegular(cr))) {
                  throw new Common.ClientError('Invalid target')
                }
                var transition = c.cx.map.transitions.nest({
                  type: 'combatSpellBuf',
                  combat: c.combat._parentKey,
                  caster: c.party._parentKey,
                  spell: args.spell,
                  global: global,
                  target: args.target,
                })
                transition.collect()
                // According to my tests, Dispel can't be evaded (tried on enemy Dawrves) and it ignores immunity (tried on own Green Dragons).
                var targets = global ? c.combat.objects.filter(isRegular).map(Common.p('_parentKey')) : [args.target]
                c.cx.map.effects.batch(null, function () {
                  _.each(targets, function (cr) {
                    if (doCalc(Calculator.Effect.GenericBool, c.cx.map.constants.effect.target.creature_dispelImmune, {ifTargetCombatCreature: cr})) {
                      return
                    }
                    // XXX=O
                    c.cx.map.effects.find(0, function ($, effect) {
                      if (c.cx.map.effects.atCoords(effect, 0, 0, 'ifCombat', 0) == c.combat._parentKey && (c.cx.map.effects.atCoords(effect, 0, 0, 'ifCombatCreature', 0) === cr || c.cx.map.effects.atCoords(effect, 0, 0, 'ifTargetCombatCreature', 0) === cr)) {
                        var src = c.cx.map.effects.atCoords(effect, 0, 0, 'source', 0)
                        if (src && src[0] == c.cx.map.constants.effect.source.spell) {
                          c.cx.map.effects.removeAtCoords(effect, 0, 0, 0)
                        }
                      }
                    })
                    spellLog(global, c.combat.objects.nested(cr), transition)
                  })
                })
                spellLog(global, targets, transition)
                transition.set('evaded', [])
                transition.set('damaged', targets)
                transition.collectFinal()
                break

              case self.rules.spellsID.airElemental:      // (S)
                var cr = cr == null ? c.rules.creaturesID.airElemental : cr
              case self.rules.spellsID.earthElemental:
                var cr = cr == null ? c.rules.creaturesID.earthElemental : cr
              case self.rules.spellsID.fireElemental:
                var cr = cr == null ? c.rules.creaturesID.fireElemental : cr
              case self.rules.spellsID.waterElemental:
                var cr = cr == null ? c.rules.creaturesID.waterElemental : cr
                var cur = c.party.find(function (cr) { return cr.get('origin') && cr.get('origin')[0] == c.cx.map.constants.garrison.origin.spell })
                if (cur && cur[1] != args.spell) {
                  throw new Common.ClientError('Already summoned another type')
                }
                var count = doCalc(Calculator.Effect.GenericNumber, c.cx.map.constants.effect.target.spellEfficiency)
                if (count > 0) {
                  var transition = c.cx.map.transitions.nest({
                    type: 'combatSpellSummon',
                    combat: c.combat._parentKey,
                    caster: c.party._parentKey,
                    spell: args.spell,
                  })
                  transition.collect()
                  cr = (new Combat.Generator({map: c.cx.map, rules: c.rules, combat: c.combat}))
                    .addCreatures(c.party, [{
                      maxCombats: 1,
                      origin: [self.rules.constants.garrison.origin.spell, args.spell],
                      creature: cr,
                      count: count,
                    }])
                  cr = cr[0]
                  c.combat.log.append({
                    type: c.cx.map.constants.combatLog.type.spellSummon,
                    party: c.party._parentKey,
                    message: ['%s summons %d %s', heroName, cr.get('count'), c.rules.creatures.atCoords(cr.get('creature'), 0, 0, cr.get('count') > 1 ? 'namePlural' : 'nameSingular', 0)],
                  }, transition.options())
                  transition.set('summoned', cr._parentKey)
                  transition.collectFinal()
                } else {
                  c.combat.log.append({
                    type: c.cx.map.constants.combatLog.type.spellSummon,
                    party: c.party._parentKey,
                    message: ['%s summons no %s!', heroName, c.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'namePlural', 0)],
                  }, transition.options())
                }
                break
            }
            c.party.object.getSet('spellPoints', Common.inc(-cost))
            c.party.object.getSet('combatCasts', Common.inc(-1))
            self._checkCombatEnd(c.combat)
            break

          case 'heal':
            if (c.state.get('phase') != 'combat') {
              throw new Common.ClientError('Invalid state')
            }
            // XXX=R First aid should be reworked: add a new creature-only spell "heal" (similar to dispel <-> dispel helpful) and add it to FAT's creature_spells. This way there will be no stat interference (currently what affects damageMin/Max also affects FAT's efficiency) and no checks for creature type (like one below) or team will be needed (can use spellImmune), plus other spell targets will be possible to use (like making healing global using spellGlobal). This is not done now because creature spells are not implemented yet.
            if (c.creature.get('special') != self.rules.constants.creature.special.firstAidTent) {
              throw new Common.ClientError('Invalid creature')
            }
            // XXX=I add check or Effects for disabling healing Ballista and other artifacts
            var target = c.combat.objects.nested(args.target)
            if (!isRegular(target) || target.party.player.get('team') != c.party.player.get('team') || target == c.creature) {
              throw new Common.ClientError('Invalid target')
            }
            var calc2 = self.get('context').oneShotEffectCalculation({
              target: self.get('context').map.constants.effect.target.creature_hitPoints,
              ifCombat: c.combat._parentKey,
              ifCombatCreature: target._parentKey,
            })
            var damage = _.random(c.state.calculate('creature_damageMin').updateIfNeeded().get('value'), c.state.calculate('creature_damageMax').updateIfNeeded().get('value'))
            var delta = Math.min(calc2 - target.get('hitPoints'), damage)
            if (delta) {
              var transition = self.get('context').map.transitions.nest({
                type: 'combatRegenerating',
                combat: c.combat._parentKey,
                creature: target._parentKey,
              })
                .collect()
              c.combat.log.append({
                type: self.get('context').map.constants.combatLog.type.regenerating,
                party: c.party._parentKey,
                message: ['The %s heals the %s removing %d points of damage.', self.rules.creatures.atCoords(c.creature.get('creature'), 0, 0, 'nameSingular', 0), self.rules.creatures.atCoords(target.get('creature'), 0, 0, target.get('count') > 1 ? 'namePlural' : 'nameSingular', 0), delta],
              }, transition.options())
              transition.collectFinal()
              target.getSet('hitPoints', Common.inc(delta))
            }
            c.creature.getSet('actions', Common.inc())
            endCreatureQueue()
            break

          case 'hurl':
            var shoot = true
          case 'ram':
            if (c.state.get('phase') != 'combat') {
              throw new Common.ClientError('Invalid state')
            }
            var attacker = c.creature
            var target = c.combat.objects.nested(args.target)
            if (!(target instanceof HMap.Combat.Creature) || target.party.player.get('team') == attacker.party.player.get('team') || c.rules.creatures.atCoords(target.get('creature'), 0, 0, 'damageGroup', 0) != c.rules.constants.creature.damageGroup.wall) {
              throw new Common.ClientError('Invalid target')
            }
            var strikes = c.state.calculate('creature_wallStrikes').updateIfNeeded().get('value')
            if (!strikes) {
              throw new Common.ClientError('Cannot attack walls')
            }
            var path = c.state.attackTargets.canDamage(target, shoot ? [attacker.get('x'), attacker.get('y')] : args.fromSpot, !shoot)
            if (!path) {
              throw new Common.ClientError('Unreachable target')
            }
            if (shoot || !path[0] || !doMove(path[0])) {
              var others = c.combat.objects.filter(function (obj) {
                return obj != target && (obj instanceof HMap.Combat.Creature) && obj.party.player.get('team') != c.combat.get('interactiveCreature').party.player.get('team') && c.rules.creatures.atCoords(obj.get('creature'), 0, 0, 'damageGroup', 0) == c.rules.constants.creature.damageGroup.wall
              })
              var hitChanceCalc = c.cx.changeableEffectCalculator({
                class: Calculator.Effect.GenericIntHash,
                target: c.cx.map.constants.effect.target.creature_hitChance,
                ifCombat: c.combat._parentKey,
                ifCombatCreature: attacker._parentKey,
              }).take()
              function hitChance(tar) {
                var chances = hitChanceCalc
                  .set('ifTargetCombatCreature', tar._parentKey)
                  .updateIfNeeded().get('value')
                chances = _.filter(chances, function (c) { return c > 0 })
                if (!shoot || (others.length + !target.get('removed') == 1)) {
                  delete chances[1]
                }
                return c.rules._pickFromChances(_.sum(chances), _.entries(chances)) || [, 0]
              }
              var damageCalc = c.cx.changeableEffectCalculator({
                class: Calculator.Effect.GenericIntHash,
                target: c.cx.map.constants.effect.target.creature_wallDamage,
                ifCombat: c.combat._parentKey,
                ifCombatCreature: attacker._parentKey,
              }).take()
              while (strikes-- && c.combat.get('interactiveCreature') == c.creature && (!target.get('removed') || others.length)) {
                var curTarget = target.get('removed') ? _.sample(others) : target
                var hit = hitChance(curTarget)
                if (hit[1] == 1) {
                  var chances = []
                  var total = 0
                  _.each(others, function (cr) {
                    var ch = hitChanceCalc
                      .set('ifTargetCombatCreature', cr._parentKey)
                      .updateIfNeeded().get('value')
                    if (ch[2] > 0) {
                      chances.push([cr, ch[2]])
                      total += ch[2]
                    }
                  })
                  curTarget = c.rules._pickFromChances(total, chances)
                  if (!curTarget) { break }
                  curTarget = curTarget[1]
                }
                if (hit[1] == 0) {
                  var damage = 0
                } else {
                  var chances = damageCalc
                    .set('ifTargetCombatCreature', curTarget._parentKey)
                    .updateIfNeeded().get('value')
                  chances = _.filter(chances, function (c) { return c > 0 })
                  var damage = +(c.rules._pickFromChances(_.sum(chances), _.entries(chances)) || [, 0])[1]
                }
                // XXX=R:ang:
                var angle = Math.atan2(curTarget.get('y') - attacker.get('y'), curTarget.get('x') - curTarget.get('y') % 2 / 2 - attacker.get('x') + attacker.get('y') % 2 / 2) * (180 / Math.PI)
                var hurlTr = c.cx.map.transitions.nest({
                  type: (shoot ? 'combatHurl' : 'combatRam') + (Math.abs(angle) < 30 ? '' : (Math.abs(angle) < 150 ? (angle < 0 ? 'Up' : 'Down') : '')),
                  combat: c.combat._parentKey,
                  creature: attacker._parentKey,
                  target: curTarget._parentKey,
                  angle: angle,
                })
                  .collect()
                if (!damage) {
                  var hitTr = c.cx.map.transitions.nest({
                    type: shoot ? 'combatHurlMiss' : 'combatRamMiss',
                    combat: c.combat._parentKey,
                    creature: attacker._parentKey,
                    target: curTarget._parentKey,
                  })
                    .collectFinal()
                } else {
                  var hitTr = c.cx.map.transitions.nest({
                    type: shoot ? 'combatHurlHit' : 'combatRamHit',
                    combat: c.combat._parentKey,
                    creature: attacker._parentKey,
                    target: curTarget._parentKey,
                  })
                    .collect()
                  // This creates combatHit but on the targeted creature.
                  var dmg = self._makeDamage(c, [damage], [curTarget], [], {
                    attacker: attacker._parentKey,
                  })
                  hitTr.set('hitTransitions', dmg.dieTransitions.concat(dmg.hitTransitions))
                  hitTr.collect()
                  // XXX=I refresh the others var since _makeDamage() (hooks) could have some side effects on arbitrary creatures
                  if (curTarget.get('removed')) {
                    if (!c.cx.get('classic')) {
                      c.combat.log.append({
                        type: c.cx.map.constants.combatLog.type.attack,
                        party: attacker.party._parentKey,
                        message: ['The %s crumbles following the attack of %s.', c.rules.creatures.atCoords(curTarget.get('creature'), 0, 0, 'namePlural', 0), c.rules.creatures.atCoords(attacker.get('creature'), 0, 0, attacker.get('count') > 1 ? 'namePlural' : 'nameSingular', 0)],
                      }, hitTr.options())
                    }
                    if (target != curTarget) {
                      others.splice(others.indexOf(curTarget), 1)
                    }
                  }
                  hitTr.collectFinal()
                }
                hurlTr.set('hitTransitions', [hitTr._parentKey])
                hurlTr.collectFinal()
              }
              hitChanceCalc.release()
              damageCalc.release()
              if (shoot && !c.cx.get('classic')) {
                // In SoD, attack on fortifications doesn't use shots (can do even if 0, and attack doesn't decrement it) and isn't affected by adjacent enemy (it still prevents normal ranged attack, just not a siege attack).
                c.creature.getSet('shots', Common.inc(-1))
              }
            }
            c.creature.getSet('actions', Common.inc())
            endCreatureQueue()
            break

          case 'shoot':
            var shoot = true
          case 'melee':
            if (c.state.get('phase') != 'combat') {
              throw new Common.ClientError('Invalid state')
            }
            var target = c.combat.objects.nested(args.target)
            if (!isRegular(target)) {
              throw new Common.ClientError('Invalid target')
            }
            function damageRangeWithLuck(state, attacker, damage) {
              // % determined empirically.
              if (_.random(9) < state.calculate('creature_luck').updateIfNeeded().get('value')) {
                var transition = c.cx.map.transitions.nest({
                  type: 'combatLuckGood',
                  combat: c.combat._parentKey,
                  creature: c.creature._parentKey,
                })
                  .collect()
                c.combat.log.append({
                  type: c.cx.map.constants.combatLog.type.luckGood,
                  party: attacker.party._parentKey,
                  message: [
                    'Good luck shines on the %s' + (c.cx.get('classic') ? '' : '.'),
                    c.rules.creatures.atCoords(attacker.get('creature'), 0, 0, attacker.get('count') > 1 ? 'namePlural' : 'nameSingular', 0),
                  ],
                }, transition.options())
                transition.collectFinal()
                // Determined empirically.
                damage[0] *= 2
                damage[1] *= 2
              }
              // Tested Ballista with Expert Artillery and Expert Luck in SoD.
              // First the log says "Good luck shines", then "...double damage!".
              // Luck affects only the first shot, as expected - this is the same with regular creatures like Marksmen.
              //
              // I have observed Luck shining two times per turn, one for every shot, as well as one time for the second shot. In other words, Luck can affect any shot and any number thereof during one turn.
              var crit = c.state.calculate('creature_criticalChance').updateIfNeeded().get('value')
              if (crit && crit >= _.random(c.rules.constants.effect.multiplier)) {
                var orig = damage.concat()
                damage[0] = c.state.calculate('creature_critical').set('initial', damage[0]).updateIfNeeded().get('value')
                damage[1] = c.state.calculate('creature_critical').set('initial', damage[1]).updateIfNeeded().get('value')
                var mul = ((damage[0] / orig[0]) + (damage[1] / orig[1])) / 2
                var transition = c.cx.map.transitions.nest({
                  type: 'combatLog',
                  combat: c.combat._parentKey,
                })
                  .collect()
                c.combat.log.append({
                  type: c.cx.map.constants.combatLog.type.critical,
                  party: attacker.party._parentKey,
                  message: [
                    'The %s %s %s damage!',
                    c.rules.creatures.atCoords(attacker.get('creature'), 0, 0, attacker.get('count') > 1 ? 'namePlural' : 'nameSingular', 0),
                    attacker.get('count') > 1 ? 'do' : 'does',
                    mul == 2.0 ? c.cx.s('combat', 'double') : _.format(c.cx.s('combat', '%1.-1fX'), mul)
                  ],
                }, transition.options())
                transition.collectFinal()
              }
              return damage
            }
            if (!shoot && (args.fromSpot[0] < 0 || args.fromSpot[1] < 0 || args.fromSpot[0] >= c.combat.get('width') || args.fromSpot[1] >= c.combat.get('height'))) {
              throw new Common.ClientError('Invalid fromSpot')
            }
            var damage =
              shoot
                ? c.state.attackTargets.damageRange(target, [c.creature.get('x'), c.creature.get('y')], false)
                : c.state.attackTargets.damageRange(target, args.fromSpot, true)
            if (!damage) {
              throw new Common.ClientError('Unreachable target')
            }
            var strikes = c.state.calculate('creature_strikes').updateIfNeeded().get('value')
            var enemyRetaliating = c.cx.oneShotEffectCalculation({
              class: Calculator.Effect.GenericBool,
              target: c.cx.map.constants.effect.target.creature_enemyRetaliating,
              ifCombat: c.combat._parentKey,
              ifCombatCreature: c.creature._parentKey,
            })
            var attackAndReturn = c.state.calculate('creature_attackAndReturn').updateIfNeeded().get('value') && damage[2]
            if (!shoot && damage[2] && doMove(damage[2])) {
              strikes = attackAndReturn = 0   // melee attack's move interrupted (land mine, etc.)
            }
            function findAround(creature, depth) {
              var res = []
              _.each(c.state.aroundDeep(creature.get('x'), creature.get('y'), depth, 0), function ($, n) {
                c.combat.bySpot.findAtContiguous(n, function (key) {
                  var obj = c.combat.objects.nested(key)
                  isRegular(obj) && res.push(obj)
                })
              })
              return res
            }
            function doStrike(state, attacker, target, damage, shoot) {
              damage = damageRangeWithLuck(c.state, attacker, damage)
              // Remove duplicate targets that can appear as a result of calculations below.
              var targets = new Set
              targets.add(target)
              if (shoot) {
                // XXX+C,I looks like in SoD some creatures' cloud (Magog) has friendly fire, some (Lich) doesn't
                var dist = c.cx.oneShotEffectCalculation({
                  target: c.cx.map.constants.effect.target.creature_shootingCloud,
                  ifCombat: c.combat._parentKey,
                  ifCombatCreature: attacker._parentKey,
                })
                if (dist > 0) {
                  findAround(target, depth).forEach(function (t) { targets.add(t) })
                }
              } else {
                //     attackAround | attackDepth | Effect        | Example
                // 1 | 0            | 0           | normal attack | Pikeman
                // 2 | 1            | 0           | round attack  | Hydra
                // 3 | -1           | any         | wide attack   | Cerberus
                // 4 | 0            | 1           | deep attack   | Firebird
                // 5 | 1            | 1           | round attack, two cells around
                //
                //   / / / / / /  / / / / / /  / / / / / /
                //   \ \ \ \ \ \  \ \x\x\x\ \  \ \ \ \x\ \    # - original target
                //   / / /1/#/ /  / /x/2/#/ /  / / /3/#/ /
                //   \ \ \ \ \ \  \ \x\x\x\ \  \ \ \ \x\ \    x - additionally
                //   / / / / / /  / / / / / /  / / / / / /        affected
                //
                //   / / / / / /  /x/x/x/x/x/
                //   \ \ \ \ \ \  \x\x\x\x\x\
                //   / / /4/#/x/  /x/x/5/x/x/
                //   \ \ \ \ \ \  \x\x\x\x\x\
                //   / / / / / /  /x/x/x/x/x/
                var around = c.cx.oneShotEffectCalculation({
                  target: c.cx.map.constants.effect.target.creature_attackAround,
                  ifCombat: c.combat._parentKey,
                  ifCombatCreature: attacker._parentKey,
                }) || 0
                var depth = c.cx.oneShotEffectCalculation({
                  target: c.cx.map.constants.effect.target.creature_attackDepth,
                  ifCombat: c.combat._parentKey,
                  ifCombatCreature: attacker._parentKey,
                }) || 0
                switch (_.sign(around)) {
                  case -1:  // (3)
                    var adjacent = new Set
                    state.findAdjacent(attacker.get(), function (key) {
                      var obj = c.combat.objects.nested(key)
                      isRegular(obj) && adjacent.add(obj)
                    })
                    state.findAdjacent(target.get(), function (key) {
                      var obj = c.combat.objects.nested(key)
                      isRegular(obj) && adjacent.has(obj) && targets.add(obj)
                    })
                    break
                  case 0:   // (1) (4)
                    var box = {x: target.get('x'), y: target.get('y')}
                    while (depth-- > 0) {
                      box.x += target.get('x') - attacker.get('x')
                      box.y += target.get('y') - attacker.get('y')
                      c.combat.bySpot.findAtCoords(box.x, box.y, 0, 'key', function (key) {
                        var obj = c.combat.objects.nested(key)
                        isRegular(obj) && targets.add(obj)
                      })
                    }
                    break
                  case 1:   // (2) (5)
                    findAround(attacker, depth).forEach(function (t) { targets.add(t) })
                    break
                }
              }
              // Since we have a hex grid, when mapped to square grid cells in odd rows are "in between" their even counterparts, so add 0.5.
              //
              // XXX=R: ang:
              var angle = Math.atan2(target.get('y') - attacker.get('y'), target.get('x') - target.get('y') % 2 / 2 - attacker.get('x') + attacker.get('y') % 2 / 2) * (180 / Math.PI)
              var strikeTr = c.cx.map.transitions.nest({
                type: (shoot ? 'combatShoot' : 'combatAttack') + (Math.abs(angle) < 30 ? '' : (Math.abs(angle) < 150 ? (angle < 0 ? 'Up' : 'Down') : '')),
                combat: c.combat._parentKey,
                creature: attacker._parentKey,
                target: target._parentKey,
                angle: angle,
              })
                .collect()
              damage = _.random(damage[0], damage[1])
              var damages = []
              targets.forEach(function (target) {
                // No friendly fire.
                if (target.party.player.get('team') == attacker.party.player.get('team')) {
                  targets.delete(target)
                } else {
                  damages.push(damage)
                }
              })
              var res = self._makeDamage(c, damages, targets, [target], {
                attacker: attacker._parentKey,
              })
              strikeTr.set('hitTransitions', res.dieTransitions.concat(res.hitTransitions))
              strikeTr.collect()
              var msg = res.msg
              // XXX=R,I: rrl: as it stands now, msg[0] cannot be localized because it joins many targets together: "The ... do ... damage. [Target1 perish] [Target2 perish] ..."
              msg[0] = (attacker.get('count') > 1 ? 'The %s do %d damage.' : 'The %s does %d damage.') + msg[0]
              msg.splice(1, 0,
                c.rules.creatures.atCoords(attacker.get('creature'), 0, 0, attacker.get('count') > 1 ? 'namePlural' : 'nameSingular', 0),
                damage
              )
              c.combat.log.append({
                type: c.cx.map.constants.combatLog.type.attack,
                party: attacker.party._parentKey,
                message: msg,
              }, strikeTr.options())
              strikeTr.collectFinal()
              return res.killedKA.length && c.cx.map.transitions.nested(res.killedKA[0][1])
            }
            var transition
            for (var strike = strikes; strike--; ) {
              if (transition = doStrike(c.state, c.creature, target, damage, shoot)) {
                target.removeFromStore(transition.options(0, {corpse: true}))
                transition.collectFinal()
                break   // targeted creature killed
              }
              if (!shoot && enemyRetaliating) {
                var attackerDead
                var retaliations = target.get('retaliating')
                if (retaliations > 0) {
                  var targetState = self._createCombatState(c.combat, target.party.player)
                  // This is fine as long as all users of _createCombatState() set and unset special options (like forceCreature) and there are no nested calls (e.g. one user sets option1, then before it is unset another user occurs and sets option2, now they're in conflict).
                  targetState.set('forceCreature', target)
                  try {
                    var damageR = targetState.attackTargets.damageRange(c.creature, [target.get('x'), target.get('y')], true)
                    attackerDead = doStrike(targetState, target, c.creature, damageR, false)
                  } finally {
                    targetState.set('forceCreature', null)
                    // targetState() will be removed on combat end.
                  }
                  target.set('retaliating', retaliations - 1)
                }
                // Attacking creature was killed or lost turn due to other reasons (e.g.
                // a skill of creature A that allows doing just one attack on A).
                if (attackerDead || c.combat.get('interactiveCreature') != c.creature) {
                  break
                }
              }
            }
            if (attackerDead) {
              c.creature.removeFromStore(attackerDead.options(0, {corpse: true}))
              attackerDead.collectFinal()
            } else {
              if (shoot && strikes) {
                // SoD counts shots during the same turn as one shot (e.g. Marksmen).
                c.creature.getSet('shots', Common.inc(-1))
              }
              if (!shoot && attackAndReturn && c.creature._parent) {
                doMove(attackAndReturn.concat().reverse())
              }
              c.creature.getSet('actions', Common.inc())
              endCreatureQueue()
            }
            break

          default:
            throw new Common.ClientError('Invalid operation')
        }

        resp.set('status', true)
      }

      if (args.do == 'ready') {
        this.get('context').map.combats.nested(args.combat)
          .parties.each(function (party) {
            if (party.player == this.get('player')) {
              party.set('ready', true)
            }
          }, this)
        return new Common.Response({status: true})
      }

      if (args.do == 'surrenderAccept') {   // happens out of interactive order
        var combat = this.get('context').map.combats.nested(args.combat)
        if (!this.get('player')) {
          throw new Common.ClientError('Player not selected')
        } else if (!combat) {
          throw new Common.ClientError('Combat not found')
        }
        var party = combat.parties.nested(args.party)
        var pending = party && party.get('pendingSurrender')
        if (!pending) {
          throw new Common.ClientError('Invalid party')
        }
        var decisionMaker = combat.parties.find(function (p) {
          return p.player.get('team') != party.player.get('team')
        })
        if (decisionMaker.player != this.get('player')) {
          throw new Common.ClientError('Invalid party')
        }
        party.set('pendingSurrender', false)
        if (args.reject) {
          pending.set('status', false)
        } else {
          //if (!c.state.calculateHero('surrenderCan').updateIfNeeded().get('value')) {
          //  throw new Common.ClientError('Cannot surrender')
          //}
          try {
            surrenderAccept.call(this, combat, party, decisionMaker)
            pending.set('status', true)
          } catch (e) {
            pending.assignResp({
              status: false,
              errorResult: e,
            })
            throw e
          }
        }
        return new Common.Response({status: true})
      }

      function surrenderAccept(combat, party, decisionMaker) {
        var rem = this.get('context').subtractResourcesByCalc(party.player.get(), {
          target: this.get('context').map.constants.effect.target.surrenderCost,
          ifCombat: combat._parentKey,
          ifCombatParty: party._parentKey,
        })
        if (_.min(rem[0]) < 0) {
          throw new Common.ClientError('Insufficient resources')
        }
        var res = decisionMaker.player.get()
        _.each(this.get('context').map.constants.resources, function ($, name) {
          res['resources_' + name] += rem[1]['resources_' + name]
        })
        party.player.batch([decisionMaker], function () {
          party.player.assignResp(rem[0])
          decisionMaker.player.assignResp(res)
        })
        party.set('surrendered', true)
        party.invoke('remove')
        retreated(combat, party)
      }

      function retreated(combat, party) {
        if (combat.get('interactiveParty') == party) {
          party.set('tactics', null)  // let next party with tactics proceed
          combat.assignResp({
            state: combat.get('state') == 'tactics' ? 'ready' : 'turned',
            interactiveParty: null,
            interactiveCreature: null,
          })
        } else {
          self._checkCombatEnd(combat)
        }
      }

      var resp = new Common.Response
      this._checkCombat(args, function (c) {
        // Exceptions during do() are just a convenient form of assigning status and error to the associated Response.
        //
        // Unlike with other RPC commands, do=combat calls are queued to be executed sequentially. This means a command may execute in context of another command (do() call). As a result, exception caught during this time would be assigned to another command's Response by try/catch in do() unless we catch it here.
        try {
          handle(c)
        } catch (e) {
          resp.assignResp({status: false, errorResult: e})
        }
      })
      return resp
    },

    // XXX=R
    //= targets array`, Set
    _makeDamage: function (c, damages, targets, keepAlive, transitionOptions) {
      var msg = ['']
      var killedKA = []
      var dtr = []
      var htr = []
      targets.forEach(function (target) {
        var hp = target.get('hitPoints') - damages.shift()
        if (hp <= 0) {
          var full = c.cx.oneShotEffectCalculation({
            target: c.cx.map.constants.effect.target.creature_hitPoints,
            ifCombat: c.combat._parentKey,
            ifCombatCreature: target._parentKey,
          })
          // Count = 4       ____   HP = 10  stack top  [X] damage = 50
          // HP = 10        |____|  HP = 20             [X] damage = 30
          // Full = 20      |____|  HP = 20             [X] damage = 10
          // Damage = 60    |____|  HP = 20              V  HP = 10, Count = 1
          var perishCount = Math.min(target.get('count'), Math.floor(-hp / full) + 1)
          hp = full - -hp % full
          // XXX=IC SoD logs different messages for artifact creatures (First Aid Tent, etc.)
          msg[0] += perishCount > 1 ? ' %d %s perish.' : ' One %s perishes.'
          perishCount > 1
            ? msg.push(perishCount, c.rules.creatures.atCoords(target.get('creature'), 0, 0, 'namePlural', 0))
            : msg.push(c.rules.creatures.atCoords(target.get('creature'), 0, 0, 'nameSingular', 0))
        } else {
          var perishCount = 0
        }

        var count = target.get('count') - perishCount
        var killed = count <= 0
        if (killed) {
          if (target.get('destroyArtifact') && target.party.object) {
            var sub = c.cx.map.objects.subAtCoords(target.party.object.get('id'), 0, 0, 'artifacts', 0)
            try {
              sub.find('artifact', function (art, $1, $2, $3, l, n) {
                if (art == target.get('destroyArtifact')) {
                  return sub.removeAtContiguous(n, l)
                }
              })
            } finally {
              sub.release()
            }
          }
          var transition = c.cx.map.transitions.nest(_.extend({
            type: 'combatDie',
            combat: c.combat._parentKey,
            creature: target._parentKey,
          }, transitionOptions))
            .collect()
          target.set('perished', target.get('perished') + perishCount, transition.options())
          // Not removing original target immediately because it has associated State (original target of doStrike() is either original command's target creature or its attacker (c.creature) when retaliating).
          if (keepAlive.indexOf(target) != -1) {
            killedKA.push([target, transition._parentKey])
          } else {
            target.removeFromStore(transition.options(0, {corpse: true}))
            transition.collectFinal()
          }
          dtr.push(transition._parentKey)
        } else {
          var txHit = c.cx.map.transitions.nest(_.extend({
            type: target.get('defending') ? 'combatDefend' : 'combatHit',
            combat: c.combat._parentKey,
            creature: target._parentKey,
          }, transitionOptions))
            .collect()
          target.assignResp({
            count: count,
            perished: target.get('perished') + perishCount,
            hitPoints: Math.round(hp),
          }, txHit.options())
          txHit.collectFinal()
          htr.push(txHit._parentKey)
        }
      })
      return {msg: msg, killedKA: killedKA, dieTransitions: dtr, hitTransitions: htr}
    },

    // Internal method called on the master after a new combat was created using other
    // methods, to make it move.
    //
    // Must be only called on master RPC.
    //
    // While a combat is active, adventure map object listed in a Party's `'object may not be removed or have owner altered. If needed, client must first remove all Party-s having that map object in their `'object property and let the combat continue (or end in absence of adversary). Or it can set state to 'end' and wait until it becomes null. On top of this, AObject->$pending's considerations apply.
    //
    // XXX=R
    _startCombat: function (combat) {
      var c = {combat: combat, rules: this.rules, cx: this.get('context')}
      //this.set('traceCombatState', _.oldLog)

      combat.tc && combat.tc('starting')
      if (combat.tc) {
        combat.on('-ifSet', function (opt, value) {
          combat.tc && combat.tc('%s = %s batch=%d', opt, value, this._batchID)
        })
      }

      // Normal transitions:
      //
      //   null ->
      //     init ->
      //       (ready -> tactics -> r...)* ->
      //       (combat -> round -> (turn -> turned -> t...)+ -> c...)+ ->
      //     end ->
      //   null       - remove()
      //
      // 'turn' may directly transition to 'end' if all opposing
      // creatures have been defeated without exhausting current creature's
      // turn (such as by use of magic).
      //
      //    1 | null
      //    2 |   init
      //    3 |     ready
      //    4 |       tactics
      //    5 |     ready
      //    6 |       tactics
      //    7 |     combat
      //    8 |       round
      //    9 |         turn        -> end
      //   10 |           turned
      //   11 |         turn        -> end
      //   12 |           turned
      //   13 |       round
      //   14 |         turn        -> end
      //   15 |           turned
      //   16 |   end
      //   17 V null

      var batchGuard = Common.batchGuard(2, function () {
        var now = combat.get('state')
        combat.tc && combat.tc('begin handle state change to %j', now)
        combat.tc && combat.tc(+1)

        switch (now) {
          default:
            throw new Error('Invalid Combat state: ' + now)

          // Combat just created. Wait for all involved players to signal readiness.
          case 'init':
            function readied() {
              switch (combat.get('state')) {
                case 'init':
                  if (combat.parties.every(Common.p('get', 'ready'))) {
                    combat.set('state', 'ready')
                  }
              }
            }
            combat.parties.each(function (party) {
              this.autoOff(party, {
                change_ready: readied,
              })
            }, this)
            readied()   // AI may be already ready

            break

          // Let all parties with tactics arrange their armies, then proceed to first round.
          case 'ready':
            while (true) {    // process tactics of parties
              combat.queue.assignChildren([])

              // Not hooking change_tactics, assuming it can't change during
              // the round of this party.
              var party = combat.parties.find(Common.p('get', 'tactics'))

              if (!party) { break }

              party.each(function (obj, i) {
                var calc = this.get('context').oneShotEffectCalculation({
                  class: Calculator.Effect.GenericBool,
                  target: this.get('context').map.constants.effect.target.creature_canControl,
                  ifCombat: combat._parentKey,
                  ifCombatCreature: obj._parentKey,
                })

                if (calc) {
                  // Disallow moving creatures that are not movable during combat (such as Ballista), even if player can control them.
                  var calc = this.get('context').oneShotEffectCalculation({
                    class: Calculator.Effect.GenericNumber,
                    target: this.get('context').map.constants.effect.target.creature_moveDistance,
                    ifCombat: combat._parentKey,
                    ifCombatCreature: obj._parentKey,
                  })

                  // In constrast with SoD, use simple garrison index-based
                  // order during tactics phase.
                  calc && combat.queue.nest(obj, {pos: i})
                }
              }, this)

              if (combat.queue.length) {
                // Reset hitPoints during tactics to use the correct image for walls (else they start with 0 HP and show up as destroyed and change to full-health when tactics ends).
                combat.objects.each(function (creature) {
                  if (creature instanceof HMap.Combat.Creature) {
                    this._hookCombatCreature(combat, creature, true)
                  }
                }, this)
                combat.assignResp({
                  state: 'tactics',
                  interactiveParty: party,
                  interactiveCreature: combat.queue.first(),
                })
                break
              }
            }

            if (combat.queue.length) { break }

            // Nobody with tactics remains, bring up the fight.
            combat.tc && combat.tc('no pending tactics left')

            this.autoOff(combat.queue, {
              unnested: function (creature) {
                combat.tc && combat.tc('queue unnest : %s %s', creature._parentKey, this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'namePlural', 0))

                // If creature was dropped off the queue during its turn (killed, etc.),
                // end the turn now to avoid having to explicitly do this
                // in every spot. However, this requires that dropping happens
                // in the very end of processing creature's turn.
                if (combat.get('interactiveCreature') == creature &&
                    combat.get('state') == 'turn') {
                  combat.tc && combat.tc('...it was interactive, begin end turn')
                  combat.tc && combat.tc(+1)

                  combat.assignResp({
                    state: 'turned',
                    interactiveParty: null,
                    interactiveCreature: null,
                  })

                  combat.tc && combat.tc(-1)
                  combat.tc && combat.tc('end end turn : %s %s', creature._parentKey, this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'namePlural', 0))
                }
              },
            })

            this.autoOff(combat.objects, {
              nestExNew: function (res) {
                combat.tc && combat.tc('new combat object : %s %s', res.key, res.child)

                if (res.child instanceof HMap.Combat.Creature) {
                  this._hookCombatCreature(combat, res.child)
                }
              },
              unnested: function () {
                // Not listening here to avoid transitioning mid-state to
                // another state, likely causing problems. And
                // theoretically there might be valid cases when all creatures are
                // temporary removed.
                //this._checkCombatEnd(combat)
              },
              '.change': function (child, name, now) {
                if (name == 'removed' && now.corpse) {
                  // Call removeFromStore() with options.corpse set to create a corpse
                  // for the deleted object. options.transition is passed on to nest().
                  // Corpses are not only visual, they allow determining perished creatures
                  // for the purposes of experience and Battle Casualties, as well as resurrection spells.
                  combat.objects.nest(new HMap.Combat.Object.Corpse(_.extend(
                    _.pick(child.get(), 'x', 'y', 'width', 'height', _.forceObject),
                    {
                      original: [child.get('x'), child.get('y')],
                      passable: _.repeat('1', child.get('width') * child.get('height')),
                      creature: child,
                      creatureKey: child._parentKey,
                    }
                  )), _.pick(now, 'transition', 'transitionTick', _.forceObject))
                }
              },
            })

            combat.objects.each(function (creature) {
              if (creature instanceof HMap.Combat.Creature) {
                this._hookCombatCreature(combat, creature)
              }
            }, this)

            combat.set('state', 'combat')
            break

          case 'tactics':
            // Nothing to do.
            break

          case 'combat':
            combat.set('state', 'round')
            break

          // Regenerate certain properties like players' number of cast spells and creatures' has-moved flag. Happens during 'combat', queue empty.
          case 'round':
            combat.getSet('round', Common.inc())
            var transition = c.cx.map.transitions.nest({
              type: 'combatLog',
              combat: c.combat._parentKey,
            })
              .collect()
            combat.log.append({
              type: this.get('context').map.constants.combatLog.type.newRound,
              message: this.get('context').get('classic') ? ['Next round begins.'] : ['Round %d begins.', combat.get('round')],
            }, transition.options())
            transition.collectFinal()
            c.cx.map.effects.decrement('maxRounds', c.cx.map.constants.effect.timedIndex.maxRounds, 'ifCombat', [c.combat._parentKey])
            combat.parties.each(function (party) {
              if (party.object && party.object.isHero) {
                var reset = {}
                _.each(['combatCasts'], function (target) {
                  reset[target] = c.cx.oneShotEffectCalculation({
                    target: c.cx.map.constants.effect.target[target],
                    ifCombat: c.combat._parentKey,
                    ifCombatParty: party._parentKey,
                  })
                }, this)
                party.object.assignResp(reset)
              }
            })
            combat.objects.each(function (creature) {
              if (creature instanceof HMap.Combat.Creature) {
                if (creature._batches) {
                  // This can occur if doing changes to a creature during its
                  // turn not inside a batch() on Combat. As a result,
                  // change_queueMove won't be dispatched immediately, queue
                  // won't be refilled by the time each() ends and changing
                  // state to 'turned' will result in starting a round with
                  // empty (or partially filled) queue.
                  throw new Error("Bug: creature has active batch in 'round'.")
                }

                var reset = {retaliating: null}

                _.each(reset, function ($, target) {
                  reset[target] = c.cx.oneShotEffectCalculation({
                    target: c.cx.map.constants.effect.target['creature_' + target],
                    ifCombat: combat._parentKey,
                    ifCombatCreature: creature._parentKey,
                  })
                })

                _.extend(reset, {
                  queueMove: true,
                  queueWait: false,
                  actions: 0,
                })

                creature.assignResp(reset)
              }
            })
            combat.set('state', 'turned')
            break

          // Start of a creature's turn.
          case 'turn':
            var value = this.get('context').oneShotEffectCalculation({
              class: Calculator.Effect.GenericBool,
              target: this.get('context').map.constants.effect.target.creature_canControl,
              ifCombat: combat._parentKey,
              ifCombatCreature: combat.get('interactiveCreature')._parentKey,
            })
            if (!value) {
              this._controlCreature(c.combat, c.combat.get('interactiveCreature'))
            }
            break

          // End of interactive creature's turn during 'combat', change interactive to next in queue (which may be empty or not).
          case 'turned':
            c.combat.parties.each(function (party) {
              party.getSet('pendingSurrender', function (cur) {
                cur && cur.set('status', false)
              })
            })
            this._creatureTurn(combat)
            break

          // End of combat, determine winners/losers/tie by checking combat.objects.
          case 'end':
            // XXX=C If a garrison (creature.party) entirely consists of creatures
            // due for un-summoning (maxCombats < 2) then such a party loses
            // (not part of alive). Perhaps it should not lose, but then
            // it's unclear how to address the now-empty garrison
            // (perhaps can give one first-level creature as when fleeing).
            //
            // Empty alive indicates a tie.
            var txAlive = []
            var transition = c.cx.map.transitions.nest({
              type: 'combatEnd',
              combat: c.combat._parentKey,
            })
            transition.collect()
            var alive = new Set
            combat.objects.each(function (creature) {
              if (creature instanceof HMap.Combat.Creature) {
                var max = creature.get('maxCombats')
                if (max == null || max === false) {
                  // Okay.
                } else if (max < 2) {
                  return creature.removeFromStore(transition.options())
                } else {
                  creature.set('maxCombats', max - 1, transition.options())
                }
                if (this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'win', 0)) {
                  if (alive.size != alive.add(creature.party).size) {
                    txAlive.push(creature.party._parentKey)
                  }
                }
              }
            }, this)
            transition.set('alive', txAlive)
            transition.collect()
            var objects = []
            c.combat.parties.each(function (p) {
              p.object && objects.push(p.object.get('id'))
            })
            c.cx.map.effects.decrement('maxCombats', this.rules.constants.effect.timedIndex.maxCombats, 'ifObject', objects)
            var txArtifacts = {}    // player number => array of artifact IDs
            var txExperiences = {}  // player number => exp delta
            combat.parties.each(function (party) {
              if (party.object) {
                if (alive.has(party)) {
                  if (party.object.isHero) {
                    // XXX=C sum up all fallen enemy creatures' aiValue 5% and divide by number of alive heroes
                    var exp = combat.objects.reduce(function (cur, obj) {
                      if (obj instanceof HMap.Combat.Object.Corpse &&
                          obj.get('creature').party.player.get('team') != party.player.get('team')) {
                        cur += c.rules.creatures.atCoords(obj.get('creature').get('creature'), 0, 0, 'aiValue', 0) * 0.05
                      }
                      return cur
                    }, 0)
                    var countHeroes = 0
                    alive.forEach(function (p) { countHeroes += p.object && party.object.isHero })
                    exp /= countHeroes
                    // This generates new transitions but because combatEnd transition has been already inserted, they will be played only after combatEnd ends playing - as intended.
                    exp = c.rules._grantExperience(party.object, exp)
                    txExperiences[party.player.get('player')] = (txExperiences[party.player.get('player')] || 0) + exp
                  }
                } else if (party.object.isTown) {
                  // Change ownership of the defeated town to the first alive party, where first is determined by combat.parties order.
                  var winner = c.combat.parties.find(function (p) { return alive.has(p) })
                  // If somehow there is a tie, make the town unowned.
                  party.object.set('owner', winner ? winner.player.get('player') : 0)
                } else if (party.object.isHero &&
                           (party.get('retreated') || party.get('surrendered'))) {
                  // Add escaped hero to his former owner's tavern.
                  party.object.assignResp({
                    x: 0,
                    y: 0,
                    z: 0,
                    owner: 0,
                  })
                  // Replace the army of retreated heroes with one 1st level creature of the hero's race.
                  if (party.get('retreated')) {
                    var sub = c.cx.map.objects.subAtCoords(party.object.get('id'), 0, 0, 'garrison', 0)
                    try {
                      sub.find(0, function ($1, $2, $3, $4, l, n) {
                        sub.removeAtContiguous(n, l)
                      })
                      var cr = c.rules.heroClasses.atCoords(c.rules.heroes.atCoords(party.object.get('subclass'), 0, 0, 'class', 0), 0, 0, 'town', 0)
                      cr = c.rules.creatures.find(0, function ($1, id, $3, $4, $5, n) {
                        if (c.rules.creatures.atCoords(id, 0, 0, 'town', 0) == cr && c.rules.creatures.atCoords(id, 0, 0, 'level', 0) == 1) {
                          return id
                        }
                      })
                      if (cr == null) { cr = c.rules.creaturesID.peasant }
                      sub.addAtCoords(0, 0, 0, {creature: cr, count: 1})
                    } finally {
                      sub.release()
                    }
                  }
                  party.player.getSet('availableHeroes', function (cur) {
                    // Remove a random hero from the pool but keep order of other heroes in the pool (thus not cur=shuffle()).
                    cur = cur.concat()
                    var shuffled = _.shuffle(cur)
                    var found = _.some(shuffled, function (hero) {
                      if (c.cx.map.objects.atCoords(hero, 0, 0, 'owner', 0) === 0) {
                        c.cx.map.objects.removeAtCoords(hero, 0, 0, 0, transition.options())
                        cur[cur.indexOf(hero)] = party.object.get('id')
                        return true
                      }
                    })
                    found || cur.push(party.object.get('id'))
                    return cur
                  })
                } else {
                  // object is not a Town or a Hero which has retreated/surrendered.
                  if (party.object.isHero) {
                    // Distribute defeated hero's artifact among the winners, if any.
                    var artifacts = []
                    c.cx.map.objects.readSubAtCoords(party.object.get('id'), 0, 0, 'artifacts', 0)
                      .find('artifact', function (art, x) {
                        switch (x) {
                          // XXX+RH
                          //
                          // XXX=I this currently examines slots where the artifact is in, allowing blacklisted artifacts if they're in backpack (e.g. editor allows placing Ballista in Backpack)
                          case c.rules.artifactSlotsID.warMachine1:
                          case c.rules.artifactSlotsID.warMachine2:
                          case c.rules.artifactSlotsID.warMachine3:
                          case c.rules.artifactSlotsID.warMachine4:
                          case c.rules.artifactSlotsID.spellBook:
                            return
                        }
                        artifacts.push(art)
                      })
                    artifacts = _.shuffle(artifacts)
                    var winners = 0
                    alive.forEach(function (party) {
                      if (party.object.isHero) {
                        winners++
                      }
                    })
                    var handled = 0
                    alive.forEach(function (party) {
                      if (party.object.isHero) {
                        var sub = c.cx.map.objects.subAtCoords(party.object.get('id'), 0, 0, 'artifacts', 0)
                        try {
                          // Give all remaining artifacts to the last winner, in case the number is odd (e.g. 10 artifacts, 3 winners, receive 3-3-4).
                          //
                          // XXX=I this rounding creates a disparity because artifacts are distributed from each hero's pool: suppose there are 3 defeated heroes, each with 10 artifacts, and 3 alive heroes; 3rd alive hero receives 4*3=12 artifacts while others - 3*3=9; if we were to collect all enemy artifacts in a common pool and only then distribute, then every hero would receive the same amount of artifacts (3*10/3=10)
                          sub.batch(null, function () {
                            artifacts.splice(0, ++handled == winners ? Infinity : Math.floor(artifacts.length / winners))
                              .forEach(function (art) {
                                c.rules._equipTrophy(sub, art)
                                ;(txArtifacts[party.player.get('player')] || (txArtifacts[party.player.get('player')] = [])).push(art)
                              })
                          })
                        } finally {
                          sub.release()
                        }
                      }
                    })
                  }
                  switch (party.object.get('type')) {
                    // Bonus combat is handled by GenericEncounter which makes sure to remove the defeated object (like monster) if necessary.
                    //case this.rules.constants.object.type.monster:
                    case this.rules.constants.object.type.hero:
                      party.object.removeFromStore(transition.options())
                  }
                }
              }
            }, this)
            transition.set('experiences', txExperiences)
            transition.set('artifacts', txArtifacts)
            transition.collectFinal()
            combat.set('state', null)
            break

          // Deallocate combat resources.
          case null:
            // Unhook and let the GC free combat's objects.
            //
            // Doing this in a separate state so that interested parties can
            // gather info about combat's outcome in 'end'. No objects should
            // be accessed when state is null.
            combat.objects.invoke('remove')
            combat.parties.invoke('remove')
            combat.remove()
            break
        }

        combat.tc && combat.tc(-1)
        combat.tc && combat.tc('end handle state change to %j', now)
      })

      this.autoOff(combat, {
        '=_batchOptions': function (sup, id, options) {
          combat.tc && combat.tc('_lastBatchID = %d', id)
          combat._lastBatchID = id
          return sup(combat, arguments)
        },

        // Making sure our hook runs before any client's hook. Without "-", it would run after the hook in this example:
        //
        //   var combat = generator...
        //   this.autoOff(combat, {
        //     change_state: function ...
        //   })
        //   this.rpc._startCombat(combat)
        '-change_state': function (now, old) {
          _.log && _.log('C%s %s <- %s', combat._parentKey, now, old)
          batchGuard.apply(this, arguments)
        },
      })

      combat.set('state', 'init')
    },

    _hookCombatCreature: function (combat, creature, recurringOnly) {
      var reset = {
        // actions is reset in 'round' but this needs to be set in case a creature was summoned and receives turn before new 'round' starts.
        actions: 0,
      }

      _.each(['hitPoints', 'shots'], function (target) {
        reset[target] = this.get('context').oneShotEffectCalculation({
          target: this.get('context').map.constants.effect.target['creature_' + target],
          ifCombat: combat._parentKey,
          ifCombatCreature: creature._parentKey,
        })
      }, this)

      creature.assignResp(reset)

      if (recurringOnly) { return }

      var speedCalc

      var queueCalc = this.get('context').listeningEffectCalculator({
        class: Calculator.Effect.GenericBool,
        target: this.get('context').map.constants.effect.target.creature_queue,
        ifCombat: combat._parentKey,
        ifCombatCreature: creature._parentKey,
      })

      var nestToQueue = function () {
        if (creature.get('queueMove') && queueCalc.updateIfNeeded().get('value')) {
          if (!speedCalc) {
            speedCalc = this.get('context').listeningEffectCalculator({
              target: this.get('context').map.constants.effect.target.creature_speed,
              ifCombat: combat._parentKey,
              ifCombatCreature: creature._parentKey,
            })
            creature.autoOff(speedCalc, {change_value: nestToQueue})
          }
          // queue:   -S9 -S5 -S1 S1 S5 S5
          // Normally, creature with highest (S)peed moves first, but when
          // waiting it moves last.
          var pos = speedCalc.updateIfNeeded().get('value') << 7 | creature.get('random')
          if (!creature.get('queueWait')) { pos *= -1 }
          combat.queue.nest(creature, {pos: pos})
        } else {
          combat.queue.unlist(creature)
        }
      }.bind(this)

      nestToQueue()

      creature.on({
        change_random: nestToQueue,
        change_queueWait: nestToQueue,
        change_queueMove: nestToQueue,
        '-unnest': function () {
          combat.queue.unlist(creature)
        },
      })

      creature.autoOff(queueCalc, {change_value: nestToQueue})

      switch (creature.get('special')) {
        case this.rules.constants.creature.special.trench:
          var spots = [10, 10, 9, 9, 8, null, 8, 9, 9, 10, 10]  // XXX=RH
          creature.autoOff(combat, {
            '+triggerSpotEffects': function (res, cr, now) {
              if (cr instanceof HMap.Combat.Creature &&
                  !this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'damageGroup', 0)) {
                return now.some(function (pos) {
                  if (spots[pos.my] == pos.mx) {
                    var min = this.get('context').oneShotEffectCalculation({
                      target: this.get('context').map.constants.effect.target.creature_damageMin,
                      ifCombat: combat._parentKey,
                      ifCombatCreature: creature._parentKey,
                    })
                    var max = this.get('context').oneShotEffectCalculation({
                      target: this.get('context').map.constants.effect.target.creature_damageMax,
                      ifCombat: combat._parentKey,
                      ifCombatCreature: creature._parentKey,
                    })
                    var damage = _.random(min, max)
                    var res = this._makeDamage({cx: this.get('context'), rules: this.rules, combat: combat}, [damage], [cr], [], {
                      attacker: creature._parentKey,
                    })
                    var msg = res.msg
                    msg[0] = 'The %s does %d damage.' + msg[0]
                    msg.splice(1, 0,
                      this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'namePlural', 0),
                      damage
                    )
                    var transition = this.get('context').map.transitions.nest({
                      type: 'combatLog',
                      combat: combat._parentKey,
                    })
                      .collect()
                    combat.log.append({
                      type: this.get('context').map.constants.combatLog.type.attack,
                      party: creature.party._parentKey,
                      message: msg,
                    }, transition.options())
                    transition.collectFinal()
                    return true
                  }
                }, this) || res
              }
            },
          }, this)
          break

        case this.rules.constants.creature.special.gate:
          creature.autoOff(combat, {
            triggerSpotEffects: function (cr, now, old) {
              var sx = creature.get('x') - 1  // XXX=RH
              var ex = creature.get('x') + 1
              if (!creature.get('open')) {
                if (creature.party.player.get('team') == cr.party.player.get('team')) {
                  now.some(function (pos) {
                    if (pos.my == creature.get('y') && pos.mx >= sx && pos.mx <= ex) {
                      var tr = this.get('context').map.transitions.nest({
                        type: 'combatGate',
                        combat: combat._parentKey,
                        creature: creature._parentKey,
                        open: true,
                      })
                        .collect()
                      creature.set('open', true, tr.options())
                      return tr.collectFinal()
                    }
                  }, this)
                }
              } else {
                var open = combat.bySpot.findWithin(
                  sx, creature.get('y'), 0,
                  ex, creature.get('y'), 0,
                  0,
                  function (cr) {
                    // Any object type blocks the gate.
                    return cr != creature._parentKey || null
                  }
                )
                if (!open) {
                  var tr = this.get('context').map.transitions.nest({
                    type: 'combatGate',
                    combat: combat._parentKey,
                    creature: creature._parentKey,
                    open: false,
                  })
                    .collect()
                  creature.set('open', false, tr.options())
                  tr.collectFinal()
                }
              }
            },
          }, this)
          break
      }
    },

    //= true if ended`, false if fight continues
    _checkCombatEnd: function (combat) {
      var teamsAlive = new Set

      combat.objects.some(function (obj) {
        if (obj instanceof HMap.Combat.Creature &&
            this.rules.creatures.atCoords(obj.get('creature'), 0, 0, 'win', 0)) {
          teamsAlive.add(obj.party.player.get('team'))
          return teamsAlive.size > 1
        }
      }, this)

      if (teamsAlive.size < 2) {
        return combat.assignResp({
          state: 'end',
          interactiveParty: null,
          interactiveCreature: null,
        })
      }
    },

    // Called when current state is 'turned'.
    _creatureTurn: function (combat) {
      if (this._checkCombatEnd(combat)) {
        return
      }

      var cur = combat.queue.first()
      if (!cur) {
        return combat.assignResp({
          state: 'round',
          interactiveParty: null,
          interactiveCreature: null,
        })
      }

      combat.tc && combat.tc('prepare new turn for : %s %s', cur._parentKey, this.rules.creatures.atCoords(cur.get('creature'), 0, 0, 'namePlural', 0))

      var reset = {strikes: null}

      _.each(reset, function ($, target) {
        reset[target] = this.get('context').oneShotEffectCalculation({
          target: this.get('context').map.constants.effect.target['creature_' + target],
          ifCombat: combat._parentKey,
          ifCombatCreature: cur._parentKey,
        })
      }, this)

      if (cur.get('defending')) {
        this.get('context').map.effects.removeAtContiguous(cur.get('defending'), 0)
        reset.defending = null
      }

      var value = this.get('context').oneShotEffectCalculation({
        target: this.get('context').map.constants.effect.target.creature_regenerating,
        ifCombat: combat._parentKey,
        ifCombatCreature: cur._parentKey,
      })
      if (value) {
        var calc2 = this.get('context').oneShotEffectCalculation({
          target: this.get('context').map.constants.effect.target.creature_hitPoints,
          ifCombat: combat._parentKey,
          ifCombatCreature: cur._parentKey,
        })
        if (cur.get('hitPoints') < calc2) {
          var transition = this.get('context').map.transitions.nest({
            type: 'combatRegenerating',
            combat: combat._parentKey,
            creature: cur._parentKey,
          })
            .collect()
          combat.log.append({
            type: this.get('context').map.constants.combatLog.type.regenerating,
            party: cur.party._parentKey,
            message: cur.get('count') > 1
              ? [
                'The wounds of the %s close, and they are whole again.',
                this.rules.creatures.atCoords(cur.get('creature'), 0, 0, 'namePlural', 0),
              ]
              : [
                'The wounds of the %s close, and it is whole again.',
                this.rules.creatures.atCoords(cur.get('creature'), 0, 0, 'nameSingular', 0),
              ],
          }, transition.options())
          transition.collectFinal()
          reset.hitPoints = calc2
        }
      }

      cur.assignResp(reset)

      var morale = this.get('context').oneShotEffectCalculation({
        target: this.get('context').map.constants.effect.target.creature_morale,
        ifCombat: combat._parentKey,
        ifCombatCreature: cur._parentKey,
      })
      // If morale is positive, this will never match. If it's negative,
      // each point signifies a 10% increase in chance, where -10 stands for
      // 100%.
      //
      // % determined empirically.
      if (_.random(-9) > morale) {
        cur.set('queueMove', false)
        var transition = this.get('context').map.transitions.nest({
          type: 'combatMoraleBad',
          combat: combat._parentKey,
          creature: cur._parentKey,
        })
          .collect()
        combat.log.append({
          type: this.get('context').map.constants.combatLog.type.moraleBad,
          party: cur.party._parentKey,
          message: [
            'Low morale causes the %s to freeze in panic.',
            this.rules.creatures.atCoords(cur.get('creature'), 0, 0, cur.get('count') > 1 ? 'namePlural' : 'nameSingular', 0),
          ],
        }, transition.options())
        transition.collectFinal()
        return this._creatureTurn(combat)
      }

      combat.assignResp({
        state: 'turn',
        interactiveParty: cur.party,
        interactiveCreature: cur,
      })
    },

    // Carries turn of a creature that its owner can't control (like arrow tower or Ballista).
    //
    // Must be only called on master RPC.
    _controlCreature: function (combat, creature, defaultAction) {
      combat.tc && combat.tc('begin control creature : %s %s', creature._parentKey, this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'namePlural', 0))
      combat.tc && combat.tc(+1)

      var async

      switch (!defaultAction && creature.get('special')) {
        case this.rules.constants.creature.special.catapult:
          var enemies = combat.objects.filter(function (obj) {
            return (obj instanceof HMap.Combat.Creature) && obj.party.player.get('team') != combat.get('interactiveCreature').party.player.get('team') && this.rules.creatures.atCoords(obj.get('creature'), 0, 0, 'damageGroup', 0) == this.rules.constants.creature.damageGroup.wall
          }, this)
          async = enemies.length && this.do('combat', {
            do: 'hurl',
            combat: combat._parentKey,
            target: _.sample(enemies)._parentKey,
          })
          break

        case this.rules.constants.creature.special.middleTower:
        case this.rules.constants.creature.special.upperTower:
        case this.rules.constants.creature.special.lowerTower:
        case this.rules.constants.creature.special.ballista:
          // XXX=C SoD doesn't seem to choose random enemy for every shot, instead it picks some (random one?) at the beginning and shoots it until it dies (or for several turns at least)
          var enemies = combat.objects.filter(function (obj) {
            return (obj instanceof HMap.Combat.Creature) && obj.party.player.get('team') != combat.get('interactiveCreature').party.player.get('team') && !this.rules.creatures.atCoords(obj.get('creature'), 0, 0, 'damageGroup', 0) && !obj.get('special') /*don't attack catapult, etc.*/
          }, this)
          async = enemies.length && this.do('combat', {
            do: 'shoot',
            combat: combat._parentKey,
            target: _.sample(enemies)._parentKey,
          })
          break

        case this.rules.constants.creature.special.firstAidTent:
          // XXX=C if FAT and Ammo Cart affect allies too; currently they affect their own party only.
          var creatures = []
          creature.party.each(function (cr) {
            var delta = this.get('context').oneShotEffectCalculation({
              target: this.get('context').map.constants.effect.target.creature_hitPoints,
              ifCombat: combat._parentKey,
              ifCombatCreature: cr._parentKey,
            }) - cr.get('hitPoints')
            if (delta > 0 && cr != combat.get('interactiveCreature')) {
              creatures[delta] = cr
            }
          }, this)
          async = creatures.length && this.do('combat', {
            do: 'heal',
            combat: combat._parentKey,
            target: creatures.pop()._parentKey,
          })
          break
      }

      async = async || this.do('combat', {
        do: 'defend',
        combat: combat._parentKey,
      })

      async.whenError(function () {   // no shots, etc.
        combat.tc && combat.tc('error control creature : %s %s : %.j', creature._parentKey, this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'namePlural', 0), async.errorResult)

        this._controlCreature(combat, creature, true)
      }, this)

      async.whenSuccess(function () {
        combat.tc && combat.tc('success control creature : %s %s', creature._parentKey, this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'namePlural', 0))

        if (combat.get('interactiveCreature') == creature) {
          this._controlCreature(combat, creature)
        }
      }, this)

      combat.tc && combat.tc(-1)
      combat.tc && combat.tc('end control creature : %s %s', creature._parentKey, this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'namePlural', 0))
    },
  }
})