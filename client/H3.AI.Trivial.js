define(['Common', 'H3.AI.Nop', 'H3.AI.Trivial.Combat', 'Map', 'Calculator'], function (Common, Nop, Combat, HMap, Calculator) {
  "use strict"
  var _ = Common._
  var Rules   // listing it in define() would create a circular dependency

  // This class can be used as neutralAI controller.
  var Neutral = Nop.extend('HeroWO.H3.AI.Trivial.Neutral', {
    _opt: {
      trace: false,
    },

    events: {
      '=_hookCombat': function (sup, combat) {
        this.addModule(combat._cid, Combat, {
          rpc: this.rpc,
          player: this.player,
          combat: combat,
          // XXX=RH
          state: this.rpc._createCombatState(combat, this.player),
          trace: this.get('trace'),
        })
      },
    },
  })

  var AI = Neutral.extend('HeroWO.H3.AI.Trivial', {
    _shared: null,
    _async: null,   // for use during _controlMap()
    t: null,    // internal

    _opt: {
      panic: false,
      berserk: false,
    },

    events: {
      change_trace: function (now) {
        this.t = now && _.log
      },

      // Pausing is asynchronous.
      '=_pause': function (sup) {
        // _continueControlMap() is never called after endTurn.
        this.get('interactive') || sup(this, arguments)
      },

      '=_interactive': '_controlMap',

      attach: function () {
        Rules = this.rules.constructor
        //this.t = _.oldLog

        this._shared = this.cx.shared(this.constructor.shared, this._initShared, this)

        this.autoOff(this.player.heroes, {
          nestExNew: function (res) {
            if (this.player.get('interactive')) {
              this._hookHero(res.child)
            }
          },
          unnested: function (obj) {
            this.t && this.t('AI P%d: lost hero %d, have %d more', this.player.get('player'), obj.get('id'), this.player.heroes.length)
            if (this.map.objects.anyAtCoords(obj.get('id'), 0, 0)) {
              this.cx.pathCostFor(obj.get('id')).set('shroud', true)
            }
            // Iterating through existing towns rather than using hero's former _shared.town entry because if hero was already deleted then its sub-store is unavailable by now.
            this.player.towns.some(function (town) {
              var cur = town.extra(this._shared.heroes)
              return cur.some(function (id) {
                if (id == obj.get('id')) {
                  return town.extra(this._shared.heroes, _.without(cur, id))
                }
              }, this)
            }, this)
          },
        })

        this.autoOff(this.player.towns, {
          'nestExNew, unnested': function () {
            this.set('panic', !this.player.towns.length)
          },
          nestExNew: function (res) {
            if (this.player.get('interactive')) {
              this._hookTown(res.child)
            }
          },
          unnested: function (obj) {
            this.t && this.t('AI P%d: lost town %d, have %d more', this.player.get('player'), obj.get('id'), this.player.towns.length)
            this.player.heroes.some(function (hero) {
              if (hero.extra(this._shared.town) == obj.get('id')) {
                hero.extra(this._shared.town, false)
              }
            }, this)
          },
        })

        this._addEffects()
        this.set('panic', !this.player.towns.length)
      },

      '+normalize_panic': Common.normBOol,

      change_panic: function (now) {
        this.t && this.t('AI P%d: %s panic mode', this.player.get('player'), now ? 'enter' : 'leave')
        this.set('berserk', now)
      },

      change_berserk: function (now, old) {
        if (_.isArray(old)) {
          old.forEach(function (n) {
            this.map.effects.removeAtContiguous(n, 0)
          }, this)
        }

        if (!_.isArray(now)) {
          this.t && this.t('AI P%d: %s berserk mode', this.player.get('player'), now ? 'enter' : 'leave')

          if (now) {
            var ns = []

            var add = function (target, modifier, prOp, ifTarget) {
              ns.push(this.map.effects.append({
                target: this.map.constants.effect.target[target],
                dynamic: true,
                modifier: modifier,
                priority: this.map.effects.priority(this.map.constants.effect.operation[prOp], this.map.constants.effect.priority.default),
                ifPlayer: ifTarget ? false : this.player.get('player'),
                ifTargetPlayer: ifTarget ? this.player.get('player') : false,
              })[0])
            }.bind(this)

            // Ho-ho-ho!
            add('creature_wallStrikes', [this.map.constants.effect.operation.const, 1], 'const')
            add('creature_wallDamage', [this.map.constants.effect.operation.const, {2: this.map.constants.effect.multiplier}], 'const')
            add('creature_damageMax', 2.0 + 0.0001 /*float-fix*/, 'relative')
            add('creature_regenerating', true, 'const')
            add('creature_retaliating', +2, 'delta')
            add('creature_speed', +3, 'delta')
            add('creature_spellEvade', /*+60%*/ 0 | 0.6 * this.map.constants.effect.multiplier, 'delta', true)
            add('creature_strikes', 2.0 + 0.0001 /*float-fix*/, 'relative')
            add('hero_actionPoints', 2.0 + 0.0001 /*float-fix*/, 'relative')
            add('hero_embarkCost', 1.0 + 0.0001 /*float-fix*/, 'relative')
            add('combatCasts', +2, 'delta')
            // AI uses arrow-type spells most of the time so add only magicArrow which AI attempts after fireball which is more flashy.
            add('hero_spells', [this.map.constants.effect.operation.append, this.rules.spellsID.chainLightning, this.rules.spellsID.armageddon, this.rules.spellsID.fireball, this.rules.spellsID.magicArrow], 'append')
            add('spellCost', 0.1 + 0.0001 /*float-fix*/, 'relative')
            add('creature_morale', +3, 'delta')
            add('creature_luck', +3, 'delta')
            add('creature_criticalChance', /*+30%*/ 0 | 0.3 * this.map.constants.effect.multiplier, 'delta')
            add('hero_spellPointsDaily', +20, 'delta')
            add('hero_spellPoints', +80, 'delta')

            ns.push(this.map.effects.append({
              target: this.map.constants.effect.target.tavernHeroes,
              dynamic: true,
              modifier: [this.map.constants.effect.operation.const, []],
              priority: this.map.effects.priority(this.map.constants.effect.operation.const, this.map.constants.effect.priority.default),
            })[0])

            ns.push(this.map.effects.append({
              target: this.map.constants.effect.target.tavernRumor,
              dynamic: true,
              modifier: _.format(this.cx.s('map', 'Player %d is on fire!'), this.player.get('player')),
              priority: this.map.effects.priority(this.map.constants.effect.operation.const, this.map.constants.effect.priority.default),
            })[0])

            this.set('berserk', ns)
          }
        }
      },

      alterSchema: function (map) {
        // Schema must be altered just once, not for every AI.Trivial instance and not when loading a game where AI has altered it before (but must be altered when loading a game where no AI existed).

        var prefix = this.constructor.name.replace(/\W/g, '_') + '__'
        var sub = map.objects.readSub('extra')
        if (!_.has(sub.schema(), prefix + 'name')) {
          var i = 0
          var schema = {
            // For hero/town:
            name: i++,   // string, for debugging and acts as "is initialized" marker (must be truthy if so)
            processed: i++,   // bool/int
            // For hero:
            town: i + 0,   // AObject->$id
            role: i + 1,   // 'collector', 'explorer'
            embarks: i + 2,   // array of AObject->$id, most recent embarkation last; holds spots that should be traveled when 'return'ing
            // 'return' to town.
            // 'visit' a map object.
            task: i + 3,
            // 'return' - AObject->$id of town.
            // 'visit' - AObject->$id where this hero heads to.
            target: i + 4,
            lastTownVisit: i + 5,  // in-game day when last entered $town
            dailyAP: i + 6,  // int, estimation of hero_actionPoints
            maxSP: i + 7,  // int, estimation of hero_spellPoints
            boatMade: i + 8,   // bool
            // For town:
            buildings: i + 0,  // array of Building->$id, including upgraded
            heroes: i + 1,   // array of AObject->$id
            built: i + 2,   // bool
            builtTavern: i + 3,   // bool
          }
          schema = _.fromEntries(_.entries(schema).map(function (i) {
            i[0] = prefix + i[0]
            return i
          }))
          sub.appendSchema(schema)
        }
      },

      '+select_mapTeleport, +select_mapDisembark': function (res, tr) {
        return this.player.heroes.nested(tr.get('object'))
      },

      '+select_townscape': function (res, tr) {
        return this.player.heroes.nested(tr.get('hero'))
      },

      '-_transition': function (transition) {
        var async = this._async

        if (!async) {
          // Transitions may arrive during our turn or not. If not, run them untracked.
          async = new Common.Async({owning: false})
          this.t && this.t('AI P%d: process transition out of my turn', this.player.get('player'))
        }

        // XXX clumsy, need some unification of transitions' option names
        var hero = transition.get('hero') || transition.get('object') || transition.get('actor')
        hero = hero && this.obj(hero)

        switch (transition.get('type')) {
          default:
            return console && console.warn(_.format('AI P%d cannot handle transition : %s', this.player.get('player'), transition.get('type')))
          case 'mapDisembark':
            // This complements _controlHero.
            //
            // Creating boats out of thin air is already bad enough. Try to keep game balance by destroying them after leaving.
            if (hero.extra(this._shared.boatMade)) {
              hero.extra(this._shared.boatMade, false)
              this.t && this.t('AI P%d:     destroy phantom boat %d at (%s) : %d %s', this.player.get('player'), transition.get('boat'), this.map.actionableSpot(transition.get('boat')).join(';'), hero.get('id'), hero.extra(this._shared.name))
              this.map.objects.removeAtCoords(transition.get('boat'), 0, 0, 0)
            }
            return
          case 'mapTeleport':
            // When using "stable" gateways like Subterranean Gates, record the exit spot which must be used when returning.
            //
            // "Unstable" include one-way and two-way monoliths - to return you can't enter on the spot you have been transferred to (unless there's exactly two of the same type). So we're not recording them.
            transition.get('deterministic') && hero.extra(this._shared.embarks, Common.concat(transition.get('bonus')))
            // XXX Similarly, when changing vehicles, we should record the original vehicle type without spot since there is (usually) more than one spot to transfer between ground and water. But it seems to work fine?
          //hero.extra(this._shared.embarks).push(-this.map.constants.object.vehicle.horse)
          //hero.extra(this._shared.embarks).push(-this.map.constants.object.vehicle.ship)
            return
          case 'hireDwelling':
            var creatures = this.cx.oneShotEffectCalculation({
              class: Calculator.Effect.GenericIntArray,
              target: this.map.constants.effect.target.hireAvailable,
              ifBonusObject: transition.get('dwelling'),
              ifObject: hero.get('id'),
            })
            var town = hero.extra(this._shared.town)
            town = town && this.obj(town)
            var creature = _.max(creatures, function (cr) {
              var aiValue = this.rules.creatures.atCoords(cr, 0, 0, 'aiValue', 0)
              var crTown = this.rules.creatures.atCoords(cr, 0, 0, 'town', 0)
              var heroTown = town
                ? town.get('subclass')
                : this.rules.heroClasses.atCoords(this.rules.heroes.atCoords(hero.get('subclass'), 0, 0, 'class', 0), 0, 0, 'town', 0)
              // Prefer own-race creatures.
              return crTown == heroTown ? aiValue : -100000 + aiValue
            }, this)
            var count = this.map.objects.readSubAtCoords(transition.get('dwelling'), 0, 0, 'available', 0).atCoords(creature, 0, 0, 'count', 0)
            this.t && this.t('AI P%d:   hire %d × %d %s out of %s : %d %s', this.player.get('player'), count, creature, this.rules.creatures.atCoords(creature, 0, 0, 'nameSingular', 0), creatures.map(function (cr) { return cr + ' ' + this.rules.creatures.atCoords(cr, 0, 0, 'nameSingular', 0) }, this).join(', '), hero.get('id'), hero.extra(this._shared.name))
            // XXX=I currently buying the most suitable creature only; should check all other available creatures and buy multiple during one visit
            async.nest(this.do('hireDwelling', {
              hero: hero.get('id'),
              dwelling: transition.get('dwelling'),
              creature: creature,
              count: count,
            })
              .whenComplete(function () {
                async.nest(this.do('hireDwelling', {
                  hero: hero.get('id'),
                  dwelling: transition.get('dwelling'),
                  leave: true,
                }))
              }, this))
            return
          case 'warMachineFactory':
            var sub = this.map.objects.readSubAtCoords(hero.get('id'), 0, 0, 'artifacts', 0)
            // XXX use databank
            var slots = {warMachine1: this.rules.creaturesID.ballista, warMachine3: this.rules.creaturesID.firstAidTent, warMachine2: this.rules.creaturesID.ammoCart}
            var bought
            _.some(slots, function (cr, slot) {
              if (!sub.anyAtCoords(this.rules.artifactSlotsID[slot], 0, 0, 0)) {
                this.t && this.t('AI P%d:   buy %d %s : %d %s', this.player.get('player'), cr, this.rules.creatures.atCoords(cr, 0, 0, 'nameSingular', 0), hero.get('id'), hero.extra(this._shared.name))
                async.nest(this.do('warMachineFactory', {
                  actor: hero.get('id'),
                  object: transition.get('bonus'),
                  creature: cr,
                }))
                bought |= true
              }
            }, this)
            async.nest(this.do('encounterPrompt', {
              hero: hero.get('id'),
            }))
            return
          case 'shipyard':
            async.nest(this.do('shipyard', {
              actor: hero.get('id'),
              object: transition.get('bonus'),
            })
              .whenComplete(function () {
                async.nest(this.do('encounterPrompt', {
                  hero: hero.get('id'),
                }))
              }, this))
            return
          case 'townscape':
            // Only react to encounter by hero, skip if caused by _controlTown().
            if (hero) {
              // This ensures _async's whenComplete() isn't called before our
              // whenComplete().
              var done = async.nestDoner()
              this._townVisit(hero, this.obj(transition.get('town')))
                .whenComplete(function () {
                  async.nest(this.do('townscape', {town: transition.get('town'), leave: true}))
                }, this, 1)
              done()
            }
            return
          case 'encounterPrompt':
            return async.nest(this.do('encounterPrompt', {
              hero: transition.get('hero'),
              choice: true,
            }))
          case 'encounterChoice':
            var choices = transition.get('choices')
            if (choices.join() != 'cancel') {
              choices = _.without(choices, 'cancel')
            }
            var choice = _.sample(choices)
            this.t && this.t('AI P%d:   choose %s out of %s : %d %s', this.player.get('player'), choice, choices.join(' '), hero.get('id'), hero.extra(this._shared.name))
            return async.nest(this.do('encounterChoice', {
              hero: transition.get('hero'),
              choice: choice,
            }))
          case 'heroExperience':
            return transition.get('data').forEach(function (data) {
              if (data && data.skills.length > 1) {
                var skill = _.sample(data.skills).skill
                this.t && this.t('AI P%d:   choose %d %s out of %s : %d %s', this.player.get('player'), skill, this.rules.skills.atCoords(skill, 0, 0, 'name', 0), data.skills.map(function (skill) { return skill.skill + ' ' + this.rules.skills.atCoords(skill.skill, 0, 0, 'name', 0) }, this).join(', '), hero.get('id'), hero.extra(this._shared.name))
                async.nest(this.do('heroLevelSkill', {
                  hero: transition.get('object'),
                  skill: skill,
                }))
              }
            }, this)
          case 'garrison':
          case 'tavern':
            return async.nest(this.do('encounterPrompt', {
              hero: transition.get('hero'),
            }))
          case 'heroTrade':
            // Not handling this now.
            return async.nest(this.do('heroTrade', {from: transition.get('hero'), to: transition.get('other'), leave: true}))
        }
      },
    },

    _initShared: function () {
      var props = {}

      var sub = this.map.objects.readSub('extra')
      var prefix = this.constructor.name.replace(/\W/g, '_') + '__'
      _.each(sub.schema(), function (index, name) {
        if (_.startsWith(name, prefix)) {
          props[name.substr(prefix.length)] = index
        }
      })

      props.classActions = {}

      _.each(classActions, function (role, name) {
        role.collector = role.c
        role.explorer = role.e
        if (name == '_dwelling' || name == '_mine') {
          var ctype = this.rules.constants.object.type[name.substr(1)]
          this.rules.classes.find('type', function (type, cls) {
            if (type == ctype) {
              props.classActions[cls] = _.extend({
                id: cls,
                idName: name,
                name: this.atCoords(cls, 0, 0, 'name', 0),
              }, role)
            }
          })
        } else if (name == '_ground') {
          props.classActions[name] = _.extend({idName: name, name: name}, role)
        } else {
          _.each(this.rules.objectsID[name], function (cls) {
            props.classActions[cls] = _.extend({
              id: cls,
              idName: name,
              // For debugging.
              name: this.rules.classes.atCoords(cls, 0, 0, 'name', 0),
            }, role)
          }, this)
        }
      }, this)

      props.allTerrains = []
      _.each(this.map.constants.object.vehicle, function (vehicle) {
        var value = this.cx.oneShotEffectCalculation({
          class: Calculator.Effect.GenericIntArray,
          expand: false,  // we're providing ifVehicle and no ifObject
          target: this.rules.constants.effect.target.hero_walkTerrain,
          ifVehicle: vehicle,
        })
        props.allTerrains.push.apply(props.allTerrains, value)
      }, this)

      return _.extend(props, {
      })
    },

    // Since this AI is very weak, add some cheating Effects to make it anyhow more ominous.
    _addEffects: function () {
      var relative = {
        tavernCost: 0.5,
        town_buildingCost: 0.5,
        spellEfficiency: 2.0,
        spellDuration: 3.0,
        income: 2.5,
        hero_spellPoints: 2.0,
        hero_experienceGain: 3.0,
        hero_actionPoints: 2.0,
        hero_actionCost: 0.5,
        creature_speed: 1.2,
        creature_hitPoints: 1.5,
        creature_growth: 2.0,
        creature_damageMin: 1.2,
        creature_damageMax: 1.2,
        creature_cost: 0.5,
        creature_join: 5.0,
        quest_requirement: 0.2,
      }

      _.each(relative, function (multiplier, target) {
        // Easy 0.4, Normal 0.7, Hard 1.0, Expert 1.3, Impossible 1.6.
        // Adjust bonus based on difficulty, reducing if below Hard, increasing if above.
        // Examples:
        // - bonus (multiplier) of 2.0, Easy: 1 + (2.0-1) * ( (0-2)*0.3+1 ) = 1.4
        // - ...Expert: 1 + (2.0-1) * ( (3-2)*0.3+1 ) = 2.3
        // - bonus (multiplier) of 0.5, Easy: 1 + (0.5-1) * ( (0-2)*0.3+1 ) = 0.8
        // - ...Expert: 1 + (0.5-1) * ( (3-2)*0.3+1 ) = 0.35
        multiplier = 1 + (multiplier - 1) * ( ((this.get('difficulty') || 0) - 2) * 0.3 + 1 )
        this.map.effects.append({
          target: this.map.constants.effect.target[target],
          dynamic: true,
          modifier: multiplier + 0.0001,    // float-fix
          priority: this.map.effects.priority(this.map.constants.effect.operation.relative, this.map.constants.effect.priority.default),
          ifPlayer: this.player.get('player'),
        })
      }, this)

      this.map.effects.append({
        target: this.map.constants.effect.target.hero_spellPointsDaily,
        dynamic: true,
        modifier: +4,
        priority: this.map.effects.priority(this.map.constants.effect.operation.delta, this.map.constants.effect.priority.default),
        ifPlayer: this.player.get('player'),
      })

      this.map.effects.append({
        target: this.map.constants.effect.target.creature_morale,
        dynamic: true,
        modifier: +1,
        priority: this.map.effects.priority(this.map.constants.effect.operation.delta, this.map.constants.effect.priority.default),
        ifPlayer: this.player.get('player'),
      })

      this.map.effects.append({
        target: this.map.constants.effect.target.creature_luck,
        dynamic: true,
        modifier: +1,
        priority: this.map.effects.priority(this.map.constants.effect.operation.delta, this.map.constants.effect.priority.default),
        ifPlayer: this.player.get('player'),
      })

      this.map.effects.append({
        target: this.map.constants.effect.target.hireFree,
        dynamic: true,
        modifier: true,
        priority: this.map.effects.priority(this.map.constants.effect.operation.const, this.map.constants.effect.priority.default),
        ifPlayer: this.player.get('player'),
      })

      // Make Magic Arrow available for all AI heroes since using attack spells noticeably increases AI difficulty.
      this.map.effects.append({
        target: this.map.constants.effect.target.hero_spells,
        dynamic: true,
        modifier: [this.map.constants.effect.operation.append, this.rules.spellsID.magicArrow],
        priority: this.map.effects.priority(this.map.constants.effect.operation.append, this.map.constants.effect.priority.default),
        ifPlayer: this.player.get('player'),
      })
    },

    obj: function (id) {
      return this.map.representationOf(id)
    },

    //= 0 if to == from
    _pathCost: function (hero, to, from, options) {
      var path = this.cx.pathFindFor(hero.get('id'), to, from, options)
      if (path) {
        return _.sum(_.pluck(path, 6))
      } else {
        return path === false ? 0 : Infinity
      }
    },

    _controlMap: function () {
      this.t && this.t('AI P%d: begin control adventure map', this.player.get('player'))

      this.t && this.t('AI P%d:   begin inventorying own existing towns and heroes', this.player.get('player'))

      this.player.towns.each(function (town) {
        if (!town.extra(this._shared.name)) {
          this._hookTown(town)
        } else {
          this._refreshTown(town)
        }
      }, this)

      this.player.heroes.each(function (hero) {
        if (!hero.extra(this._shared.name)) {
          this._hookHero(hero)
        } else {
          this._refreshHero(hero)
        }
      }, this)

      var self = this

      this._async = new (Common.Async.extend({
        _owning: false,

        events: {
          nestExNew: function (res) {
            this._hookRecursively(res.child)
          },
        },

        _hookRecursively: function (async) {
          async.each(this._hookRecursively, this)

          // Assuming once an Async was nested into _async, it belongs to AI and
          // isn't going to be unnested during operation (when new children may
          // be added into it so we can hook them too).
          this.autoOff(async, {
            nestExNew: function (res) {
              this._hookRecursively(res.child)
            },
          })

          // Here's why this is all necessary.
          // Need this handler to avoid do()'s rethrow.
          async.whenError(function () {
            self.t && self.t('AI P%d:     ignore failed Async : %s : %s', self.player.get('player'), async, async.errorResult)
          })
        },
      }))

      this.t && this.t('AI P%d:   end inventorying existing own towns and heroes', this.player.get('player'))

      this._continueControlMap()
    },

    _endInteractive: function () {
      this.t && this.t('AI P%d: end control adventure map', this.player.get('player'))
      // Assuming it's empty (clear()'ed).
      this._async.remove()
      this._async = null
    },

    _continueControlMap: function () {
      this._async.forEach(this._async.unlist)    // to prevent abort by clear()
      this._async.clear()

      if (this._task.get('pause')) {
        this._endInteractive()
        return this._task.set('paused', true)
      }

      // interactive of AI player should be normally changed by AI only but it may happen due to game ending (e.g. if AI wins as a result of a combat by its hero).
      if (!this.player.get('interactive')) {
        return this._endInteractive()
      }

      if (this.t) {
        var str = []
        _.each(this.player.get(), function (value, name) {
          name = name.match(/^resources_(.+)$/)
          if (name) {
            str.push(value + ' ' + (name[1] == 'gems' ? 'J' : name[1][0].toUpperCase()))
          }
        })
        this.t('AI P%d: continue control adventure map : %s', this.player.get('player'), str.join(', '))
      }

      var filter = function (obj) {
        if (obj.extra(this._shared.processed) === true) {
          this.t && this.t('AI P%d:   skip control processed : %d %s', this.player.get('player'), obj.get('id'), obj.extra(this._shared.name))
        } else if (this.map.objects.atCoords(obj.get('id'), 0, 0, 'pending', 0)) {
          this.t && this.t('AI P%d:   skip control $pending : %d %s', this.player.get('player'), obj.get('id'), obj.extra(this._shared.name))
        } else {
          return true
        }
      }.bind(this)

      var remaining = this.player.towns
        .filter(filter)
      // Towns with more buildings are more valuable, process them first.
      var skip = _.sortBy(remaining, function (town) { return -town.extra(this._shared.buildings).length }, this)
        .some(this._controlTown, this)

      skip = skip || this.player.heroes
        .filter(filter)
        .some(this._controlHero, this)
        // _controlHero() may trigger townscape, changing screen to 'townscape'. However, it will be accompanied by an Async that only resolves after leaving this screen so remaining heroes in this tick will be skipped (due to some()) and next tick won't start until that Async is done.

      skip && this._async.doneIfEmpty()

      if (!this._async.length && !skip) {
        var pending = this.player.towns.invoke('get', 'id')
          .concat(this.player.heroes.invoke('get', 'id'))
          .filter(function (id) {
            return this.map.objects.atCoords(id, 0, 0, 'pending', 0)
          }, this)

        if (pending.length) {
          this.t && this.t('AI P%d: await any of %d $pending : %s', this.player.get('player'), pending.length, pending.join(' '))

          var checkPending = function (n, $2, prop, now) {
            if (_.isArray(prop) /*oremove*/ || !now) {
              var id = this.map.objects.fromContiguous(n).x
              if (_.includes(pending, id)) {
                this.map.objects.off(ev1)
                this.map.objects.off(ev2)
                this._continueControlMap()
              }
            }
          }.bind(this)

          this.autoOff(this.map.objects, {})
          var ev1 = this.map.objects.on('oremove', checkPending)
          var ev2 = this.map.objects.on('ochange_p_' + this.map.objects.propertyIndex('pending'), checkPending)
        } else {
          this._endInteractive()
          this.player.get('won') === false && this.do('endTurn')
        }
      } else if (!this._async.isLoading()) {
        this.t && this.t('AI P%d:   no Async\'s to await', this.player.get('player'))
        this._continueControlMap()
      } else {
        var loading = this._async.filter(Common.p('isLoading'))
        this.t && this.t('AI P%d:   await %d Async\'s : %s', this.player.get('player'), loading.length, loading.map(Common.p('get', 'method')).join(', '))

        this._async.whenComplete(function () {
          this.t && this.t('AI P%d:   all Async\'s completed', this.player.get('player'))
          this._continueControlMap()
        }, this, Infinity)
      }
    },

    _hookHero: function (hero) {
      this.t && this.t('AI P%d: initialize new hero %d', this.player.get('player'), hero.get('id'))

      // This implementation assumes the entire map is visible. Pathfinding should ignore shroud. Changing it on run-time is fine since this AI doesn't use PathCost.Calculator and if the hero's ownership changes, the AI sets PathCost's shroud back to true.
      this.cx.pathCostFor(hero.get('id')).set('shroud', false)

      // Some of $extra's fields may have remnant values if hero was added to tavern pool and AI bought it, in constrast with buying a fresh new object with empty $extra.
      hero.extra(this._shared.town, false)
      // It feels safe to keep 'role'.
      hero.extra(this._shared.embarks, [])
      hero.extra(this._shared.task, false)
      hero.extra(this._shared.lastTownVisit, false)
      hero.extra(this._shared.boatMade, false)

      var value = this.cx.oneShotEffectCalculation({
        class: Calculator.Effect.GenericString,
        target: this.map.constants.effect.target.name,
        ifObject: hero.get('id'),
      })
      hero.extra(this._shared.name, value || 'Unnamed')

      this._refreshHero(hero)
    },

    // XXX=R
    _refreshHero: function (hero) {
      var town = hero.extra(this._shared.town)
      town = town && this.obj(town)

      this.t && this.t('AI P%d:     refresh hero : %s %d %s of %s',
        this.player.get('player'),
        hero.extra(this._shared.role) || 'no role!',
        hero.get('id'),
        hero.extra(this._shared.name),
        town ? town.get('id') + ' ' + town.extra(this._shared.name) : 'no town!')

      hero.extra(this._shared.processed, false)

      var value = this.cx.oneShotEffectCalculation({
        target: this.map.constants.effect.target.hero_actionPoints,
        ifObject: hero.get('id'),
      })
      hero.extra(this._shared.dailyAP, value)

      var value = this.cx.oneShotEffectCalculation({
        target: this.map.constants.effect.target.hero_spellPoints,
        ifObject: hero.get('id'),
      })
      hero.extra(this._shared.maxSP, value)

      if (!hero.extra(this._shared.role)) {
        var explorers = this.player.heroes.some(function (hero) {
          return hero.extra(this._shared.role) == 'explorer'
        }, this)
        if (hero.get('level') || !explorers) {
          this.t && this.t('AI P%d:       give Explorer role thanks to level %d > 1 or first hero', this.player.get('player'), hero.get('level') + 1)
          hero.extra(this._shared.role, 'explorer')
        } else {
          this.t && this.t('AI P%d:       give Collector role due to level 1', this.player.get('player'))
          hero.extra(this._shared.role, 'collector')
        }
      }

      if (!town && this.player.towns.length) {
        this.t && this.t('AI P%d:       assign to town', this.player.get('player'))

        var total = 0
        var counts = {}
        this.player.towns.each(function (town) {
          var count = 0
          _.each(town.extra(this._shared.heroes), function (id) {
            count += this.obj(id).extra(this._shared.role) == hero.extra(this._shared.role)
          }, this)
          total += counts[town.get('id')] = count
        }, this)

        this.t && this.t('AI P%d:       have %d towns and %d %ss', this.player.get('player'), this.player.towns.length, total, hero.extra(this._shared.role))

        var sorted = []

        this.player.towns.each(function (town) {
          var cost = this._pathCost(hero, this.map.actionableSpot(town.get('id')))
          if (cost == Infinity) {
            this.t && this.t('AI P%d:       ...unreachable : %d %s', this.player.get('player'), town.get('id'), town.extra(this._shared.name))
          } else {
            var count = counts[town.get('id')] || 0
            this.t && this.t('AI P%d:       ...%d APs away, %d %ss : %d %s', this.player.get('player'), cost, count, hero.extra(this._shared.role), town.get('id'), town.extra(this._shared.name))
            // Try to make even number of heroes per town.
            cost *= count / (total / this.player.towns.length)
            sorted.push([town, cost])
          }
        }, this)

        sorted.sort(function (a, b) {
          return a[1] - b[1] || a[0].get('id') - b[0].get('id')
        })

        if (sorted.length) {
          town = sorted[0][0]
          hero.extra(this._shared.town, town.get('id'))
          town.extra(this._shared.heroes, Common.concat(hero.get('id')))
          this.t && this.t('AI P%d:       assign to : %d %s', this.player.get('player'), town.get('id'), town.extra(this._shared.name))
        } else {
          this.t && this.t('AI P%d:       keep unassigned - no reachable towns', this.player.get('player'))
        }
      }
    },

    _hookTown: function (town) {
      this.t && this.t('AI P%d: initialize new town %d', this.player.get('player'), town.get('id'))

      town.extra(this._shared.heroes, [])

      var value = this.cx.oneShotEffectCalculation({
        class: Calculator.Effect.GenericString,
        target: this.map.constants.effect.target.name,
        ifObject: town.get('id'),
      })
      town.extra(this._shared.name, value || 'Unnamed')

      // Not take()'ing, should remove itself automatically when town is gone.
      var calc = this.cx.calculator(Rules.TownBuildingsWithUpgraded, {
        id: town.get('id'),
      })
      this.autoOff(calc, {}).whenRenders('change_value', function () {
        town.extra(this._shared.buildings, calc.get('value').concat())
      }, this)

      this._refreshTown(town)
    },

    _refreshTown: function (town) {
      this.t && this.t('AI P%d:     refresh town : %d %s',
        this.player.get('player'),
        town.get('id'),
        town.extra(this._shared.name))

      town.extra(this._shared.processed, false)
      town.extra(this._shared.built, false)
      town.extra(this._shared.builtTavern, false)
    },

    // XXX=R
    _controlTown: function (town) {
      switch (this.player.get('screen')) {
        case '':
          return this._async.nest(this.do('townscape', {town: town.get('id')}))
        case 'townscape':
          if (this.player.get('screenTown') == town.get('id')) { break }
        default:
          this.t && this.t('AI P%d:   skip control another screen : %s %d : %d %s', this.player.get('player'), this.player.get('screen'), this.player.get('screenTown'), town.get('id'), town.extra(this._shared.name))
          return
      }

      this.t && this.t('AI P%d:   begin control town : %d %s', this.player.get('player'), town.get('id'), town.extra(this._shared.name))

      var leave = function () {
        this.t && this.t('AI P%d:   done something, continue on next tick : %d %s', this.player.get('player'), town.get('id'), town.extra(this._shared.name))
        return true
      }.bind(this)

      switch (town.extra(this._shared.processed)) {
        case false:
          // First things first.
          var counts = _.countBy(town.extra(this._shared.heroes), function (id) {
            return this.obj(id).extra(this._shared.role)
          }, this)

          this.t && this.t('AI P%d:     assigned heroes by role : %s', this.player.get('player'), _.entries(counts).map(function (item) { return item[0] + ' ' + item[1] }).sort().join(', '))

          if (!_.includes(town.extra(this._shared.buildings), this.rules.buildingsID.tavern) && !counts.collector && !town.extra(this._shared.built) && !town.extra(this._shared.builtTavern)) {
            town.extra(this._shared.builtTavern, true)
            this.t && this.t('AI P%d:     erect Tavern - need at least one collector', this.player.get('player'))

            this._async.nest(this.do('townBuild', {
              town: town.get('id'),
              building: this.rules.buildingsID.tavern,
            }))

            return leave()
          }

          if (!_.includes(town.extra(this._shared.buildings), this.rules.buildingsID.tavern)) {
            this.t && this.t('AI P%d:     not checking if need to hire - no Tavern', this.player.get('player'))
          } else {
            if (!counts.collector) {
              this.t && this.t('AI P%d:     hire a Collector', this.player.get('player'))
              // Hiring may fail, e.g. if a hero is visiting.
              this._hireHero(town)
            }

            // 2.1% gives 1 hero for S, 2 for M and L, 3 for XL.
            //
            // Buying heroes in waves, first wave in the first week, second in the second week and third in the third week.
            var week = this.map.get('date') / 7 | 0
            var max = Math.min(week, Math.round(this.map.sizeWithoutMargin().width * 0.021))
            max -= counts.explorer
            while (max-- > 0) {
              this.t && this.t('AI P%d:     hire an Explorer', this.player.get('player'))
              this._hireHero(town)
                .whenSuccess(function (async) {
                  this.t && this.t('AI P%d:     change role to Explorer : %d %s', this.player.get('player'), async.result, this.obj(async.result).extra(this._shared.name))
                  this.obj(async.result).extra(this._shared.role, 'explorer')
                }, this)
            }
          }

          // Ahoy, fresh meat?!
          var sorted = []

          this.map.objects.readSubAtCoords(town.get('id'), 0, 0, 'available', 0)
            .find(0, function (count, building) {
              if (count > 0) {
                var value = this.cx.oneShotEffectCalculation({
                  class: Calculator.Effect.GenericIntArray,
                  target: this.map.constants.effect.target.hireAvailable,
                  ifBonusObject: town.get('id'),
                  ifBuilding: building,
                })
                var creature = _.max(value, function (creature) {
                  return this.rules.creatures.atCoords(creature, 0, 0, 'level', 0)
                }, this)
                if (creature != -Infinity) {
                  sorted.push([building, count, creature, this.rules.creatures.atCoords(creature, 0, 0, 'level', 0)])
                }
              }
            }, this)

          sorted.sort(function (a, b) {
            return b[3] - a[3] || a[0] - b[0]
          })

          if (!sorted.length) {
            this.t && this.t('AI P%d:     no creatures for hire', this.player.get('player'))
          } else {
            this.t && this.t('AI P%d:     %d buildings with creatures for hire:', this.player.get('player'), sorted.length)

            sorted.forEach(function (item) {
              this.t && this.t('AI P%d:       %d %s : %d × L%d %d %s', this.player.get('player'), item[0], this.rules.buildings.atCoords(item[0], 0, 0, 'name', 0), item[1], item[3], item[2], this.rules.creatures.atCoords(item[2], 0, 0, 'nameSingular', 0))

              this._async.nest(this.do('hireDwelling', {
                town: town.get('id'),
                building: item[0],
                creature: item[2],
                count: item[1],
              }))
            }, this)
          }

          if (town.extra(this._shared.built)) {
            this.t && this.t('AI P%d:     skip erection, done today', this.player.get('player'))
          } else {
            town.extra(this._shared.built, true)

            // XXX rely on building features/effects rather than hardcoded IDs
            this.t && this.t('AI P%d:     examine buildings to erect', this.player.get('player'))
            var buildings = town.extra(this._shared.buildings)
            var sorted = []
            var producing = []

            // Most preferred first.
            var priorities = [
              this.rules.buildingsID.hall,
              this.rules.buildingsID.townHall,
              this.rules.buildingsID.cityHall,
              this.rules.buildingsID.capitol,

              this.rules.buildingsID.fort,

              this.rules.buildingsID.tavern,
              this.rules.buildingsID.blacksmith,
              this.rules.buildingsID.marketplace,
              this.rules.buildingsID.mageGuild1,

              this.rules.buildingsID.citadel,
              this.rules.buildingsID.castle,

              this.rules.buildingsID.stables,
              this.rules.buildingsID.griffinBastion,

              this.rules.buildingsID.minerGuild,
              this.rules.buildingsID.dendroidSaplings,

              this.rules.buildingsID.resourceSiloWO,
              this.rules.buildingsID.resourceSiloC,
              this.rules.buildingsID.resourceSiloM,
              this.rules.buildingsID.resourceSiloS,
              this.rules.buildingsID.resourceSiloJ,

              this.rules.buildingsID.mageGuild2,
              this.rules.buildingsID.mageGuild3,
            ]

            this.rules.buildings.find('town', function (towns, building) {
              if (towns === false || towns.indexOf(town.get('subclass')) != -1) {
                var produce = this.rules.buildings.atCoords(building, 0, 0, 'produce', 0)
                if (produce) {
                  produce = 1 /*make truthy*/ + _.max(produce.map(function (cr) {
                    return this.rules.creatures.atCoords(cr, 0, 0, 'level', 0)
                  }, this))
                }
                var calc = this.cx.calculator(Rules.TownBuildingState, {
                  player: this.player,
                  id: town.get('id'),
                  building: building,
                }).take()
                if (calc.get('value') != 'built' && produce) {
                  producing.push([building, produce])
                }
                if (calc.get('value') == 'able') {
                  if (produce || _.includes(priorities, building)) {
                    sorted.push([building, produce])
                  }
                }
                calc.release()
              }
            }, this)

            sorted.sort(function (a, b) {
              if (!a[1] ^ !b[1]) {    // one is producing, put it first
                return a[1] ? -1 : +1
              }
              if (a[1]) {   // both are producing, prefer one with the best creature
                return b[1] - a[1] || a[0] - b[0]
              }
              // None are producing, use hardcoded priority.
              var ai = priorities.indexOf(a[0])
              var bi = priorities.indexOf(b[0])
              if ((ai == -1) ^ (bi == -1)) {  // one is on the priority list
                return ai == -1 ? +1 : -1
              }
              return ai - bi   // both are on the list
            })

            if (sorted.length) {
              // XXX this is trying listed buildings in sequential order and presence of a permanently unavailable/disabled building will be a roadblock
              var building = sorted[0][0]

              this.t && this.t('AI P%d:       already can erect, in order of preference : %s', this.player.get('player'), sorted.map(function (b) { return b[0] + ' ' + this.rules.buildings.atCoords(b[0], 0, 0, 'name', 0) }, this).join(', '))

              this._async.nest(this.do('townBuild', {
                town: town.get('id'),
                building: building,
              }))

              return leave()
            } else {
              this.t && this.t('AI P%d:       can erect nothing right away', this.player.get('player'))

              var building = priorities.find(function (building) {
                if (!_.includes(buildings, building)) {
                  var calc = this.cx.calculator(Rules.TownBuildingState, {
                    player: this.player,
                    id: town.get('id'),
                    building: building,
                  }).take()
                  var res = calc.get()
                  res = res.value == 'unable' && res.townType && res.special
                  calc.release()
                  return res
                }
              }, this)

              if (building == null) {
                this.t && this.t('AI P%d:       all support erected, examine dwellings', this.player.get('player'))
                // This will aim for top-level dwelling that is currently unbuilt. If
                // it so happens that 7th level doesn't require 1-6 levels, sorted will
                // contain the unbuilt lower level dwelling so eventually all dwellings
                // will be erected.
                building = _.max(producing, Common.p(1))[0]
              }

              if (building == null) {
                this.t && this.t('AI P%d:       nothing to erect, everything is built', this.player.get('player'))
              } else {
                this.t && this.t('AI P%d:       erection goal : %d %s', this.player.get('player'), building, this.rules.buildings.atCoords(building, 0, 0, 'name', 0))

                var checkRequire = function (building) {
                  var reqs = this.rules.buildings.atCoords(building, 0, 0, 'require', 0) || []
                  var missing
                  reqs.forEach(function (req) {
                    this.t && this.t('AI P%d:       ...%d %s requires %d %s (%s)', this.player.get('player'), building, this.rules.buildings.atCoords(building, 0, 0, 'name', 0), req, this.rules.buildings.atCoords(req, 0, 0, 'name', 0), _.includes(buildings, req) ? 'have it' : 'need to erect')
                    if (missing == null && !_.includes(buildings, req)) {
                      missing = checkRequire(req)
                      missing == null && (missing = req)
                    }
                  }, this)
                  return missing
                }.bind(this)

                var missing = checkRequire(building)

                if (missing == null) {
                  // This means can't build due to other reasons (most likely resources). Doing nothing, checking next round.
                  this.t && this.t('AI P%d:       ...so have all required buildings but can\'t erect right now', this.player.get('player'))
                } else {
                  this.t && this.t('AI P%d:       ...so erect %d %s', this.player.get('player'), missing, this.rules.buildings.atCoords(missing, 0, 0, 'name', 0))

                  this._async.nest(this.do('townBuild', {
                    town: town.get('id'),
                    building: missing,
                  }))

                  return leave()
                }
              }
            }
          }
          // If execution has reached here, it means town processing is ready to be finished. For example, hireDwelling is called on every entry to _controlTown() but if hiring fails (no resources, garrison slots, etc.) - we should proceed to finalization rather than trying to hireDwelling repeatedly.
          town.extra(this._shared.processed, 1)
          break

        case 1:
          // Wait until earlier tasks (hireDwelling, townBuild, etc.) finish before
          // _townVisit() to allow the heroes take advantage of their results (such
          // as taking creatures just hired).

          // Merge creatures for hired heroes before they venture out.
          town.getSet(['garrisoned', 'visiting']).forEach(function (id) {
            var hero = this.player.heroes.nested(id)
            hero && this._townVisit(hero, town, true)
          }, this)
          town.extra(this._shared.processed, 2)
          break

        case 2:
          town.extra(this._shared.processed, true)
          this.t && this.t('AI P%d:   end control town : %d %s', this.player.get('player'), town.get('id'), town.extra(this._shared.name))

          this._async.nest(this.do('townscape', {town: town.get('id'), leave: true}))
          return true
      }

      return leave()
    },

    _hireHero: function (town) {
      var heroes = this.cx.oneShotEffectCalculation({
        class: Calculator.Effect.GenericIntArray,
        target: this.map.constants.effect.target.tavernHeroes,
        ifPlayer: this.player.get('player'),
        ifBonusObject: town.get('id'),
        ifBuilding: this.rules.buildingsID.tavern,
      })

      heroes = _.sortBy(heroes, function (id) {
        var hero = this.obj(id)
        var race = this.rules.heroClasses.atCoords(this.rules.heroes.atCoords(hero.get('subclass'), 0, 0, 'class', 0), 0, 0, 'town', 0)
        // Sort by experience except putting level 1 above all other level 1-s if its race matches the town's race.
        if (!hero.get('level') && race == town.get('subclass')) {
          return -(this.map.constants.levelUps[0] - 1)
        } else {
          return -hero.get('experience')
        }
      }, this)

      if (this.t) {
        var str = heroes.map(function (id, i) {
          var hero = this.obj(id)
          var race = this.rules.towns.atCoords(this.rules.heroClasses.atCoords(this.rules.heroes.atCoords(hero.get('subclass'), 0, 0, 'class', 0), 0, 0, 'town', 0), 0, 0, 'name', 0)
          return _.format('%d L%d of %s%s', id, hero.get('level') + 1, race, i ? '' : ' (will hire this)')
        }, this)

        this.t('AI P%d:       available heroes, in order of preference : %s', this.player.get('player'), str.join(', '))
      }

      // tavernHeroes is allowed to be [] and is [] during berserk, for example.
      if (heroes.length) {
        return this._async.nest(this.do('hireHero', {
          hero: heroes[0],
          object: town.get('id'),
          building: this.rules.buildingsID.tavern,
        }))
      }
    },

    // XXX=R
    _controlHero: function (hero) {
      if (this.player.get('screen') != '') {
        this.t && this.t('AI P%d:   skip control another screen : %s %d : %d %s', this.player.get('player'), this.player.get('screen'), this.player.get('screenTown'), hero.get('id'), hero.extra(this._shared.name))
        return
      }

      var town = hero.extra(this._shared.town)
      town = town && this.obj(town)

      this.t && this.t('AI P%d:   begin control hero : %d %s', this.player.get('player'), hero.get('id'), hero.extra(this._shared.name))
      this.t && this.t('AI P%d:     L%d %s of %d %s, AP %d/%d', this.player.get('player'), hero.get('level') + 1, hero.extra(this._shared.role), town && town.get('id'), town ? town.extra(this._shared.name) : 'no town!', hero.get('actionPoints'), hero.extra(this._shared.dailyAP))

      // XXX=RH move this and other constants to _opt
      var days = hero.extra(this._shared.role) == 'explorer' ? 12 : 4
      var objects = this._nearbyObjects(hero, this.map.actionableSpot((town || hero).get('id')), hero.extra(this._shared.dailyAP) * days)

      var baseline = objects.find(function (o) { return o.class.idName != '_ground' })
      if (baseline) {
        // Of all potential nearby objects, only consider top N where N has value lower than top 1's not more than by 80%, to pick up everything in vicinity before venturing farther.
        baseline = baseline.value * 1.8
        for (var i = 0; objects[++i]; ) {
          if (objects[i].value > baseline) {
            objects.splice(i)
            this.t && this.t('AI P%d:     keep top %d with sort <= %.-2f : %s', this.player.get('player'), i, baseline, _.pluck(objects, 'id').join(' '))
          }
        }
      }

      switch (hero.extra(this._shared.task)) {
        //default:
        //  hero.extra(this._shared.task, 'return')
        //  hero.extra(this._shared.town, 123)
        //  break

        case 'visit':
          var found = objects.some(function (o) { return o.id == hero.extra(this._shared.target) }, this)
          if (!found) {
            if (this.map.actionableSpot(hero.get('id')).join() == this.map.actionableSpot(hero.extra(this._shared.target))) {
              // ...Or if target is a _ground tile (no actionable spot).
              this.t && this.t('AI P%d:     standing on %s target, unassign task : %d %s', this.player.get('player'), hero.extra(this._shared.task), hero.extra(this._shared.target), this.rules.classes.atCoords(this.map.objects.atCoords(hero.extra(this._shared.target), 0, 0, 'class', 0), 0, 0, 'name', 0))
            } else {
              this.t && this.t('AI P%d:     abort %s - target missing from top %d : %d %s', this.player.get('player'), hero.extra(this._shared.task), objects.length, hero.extra(this._shared.target), this.rules.classes.atCoords(this.map.objects.atCoords(hero.extra(this._shared.target), 0, 0, 'class', 0), 0, 0, 'name', 0))
            }
            hero.extra(this._shared.task, false)
          }
          break

        case 'return':
          if (!hero.extra(this._shared.town)) {
            this.t && this.t('AI P%d:     abort %s - no longer assigned to town', this.player.get('player'), hero.extra(this._shared.task))
            hero.extra(this._shared.task, false)
          } else if (objects[0] && objects[0].value > hero.extra(this._shared.dailyAP) * 5) {
            // Abort return if a really high-ranking object is detected (such as enemy hero or empty town).
            this.t && this.t('AI P%d:     abort %s - got high-ranking target; doing visit : %d %s', this.player.get('player'), hero.extra(this._shared.task), objects[0].id, objects[0].class.name)
            hero.extra(this._shared.task, 'visit')
            hero.extra(this._shared.target, objects[0].id)
          }
          break
      }

      if (!hero.extra(this._shared.task)) {
        var wasBackOn = hero.extra(this._shared.lastTownVisit)
        // Allow returning to town every other day on first week, once per 4 days on second week and once per week on other weeks.
        var recent = [, 1, 3][this.map.get('date') / 7 | 0] || 6

        if (wasBackOn !== false && this.map.get('date') - wasBackOn < recent) {
          this.t && this.t('AI P%d:     not considering return to town - was there %j days ago', this.player.get('player'), wasBackOn && this.map.get('date') - wasBackOn)
        } else if (town && town.get('visiting')) {
          this.t && this.t('AI P%d:     not considering return to town - got visitor : %d', this.player.get('player'), town.get('visiting'))
        } else {
          this.t && this.t('AI P%d:     consider return to town - was there %j days ago', this.player.get('player'), wasBackOn && this.map.get('date') - wasBackOn)

          if (hero.extra(this._shared.role) == 'collector') {
            if (town) {
              // Collectors return to drop off creatures they've bought in dwellings.
              var slots = 0
              var value = 0
              var str = []
              var sub = this.map.objects.readSubAtCoords(hero.get('id'), 0, 0, 'garrison', 0)
              sub.find('creature', function (cr, slot) {
                slots++
                value += this.rules.creatures.atCoords(cr, 0, 0, 'aiValue', 0) * sub.atCoords(slot, 0, 0, 'count', 0)
                this.t && str.push(sub.atCoords(slot, 0, 0, 'count', 0) + ' × ' + this.rules.creatures.atCoords(cr, 0, 0, 'nameSingular', 0))
              }, this)
              if (slots >= 6) {
                this.t && this.t('AI P%d:       return to town - garrison slots almost full : %s', this.player.get('player'), str.join(', '))
                hero.extra(this._shared.task, 'return')
              } else {
                var explorer = town.extra(this._shared.heroes).find(function (hero) {
                  return this.obj(hero).extra(this._shared.role) == 'explorer'
                }, this)
                if (explorer) {
                  var baseline = 0
                  var str = []
                  var sub = this.map.objects.readSubAtCoords(explorer, 0, 0, 'garrison', 0)
                  sub.find('creature', function (cr, slot) {
                    baseline += this.rules.creatures.atCoords(cr, 0, 0, 'aiValue', 0) * sub.atCoords(slot, 0, 0, 'count', 0)
                    this.t && str.push(sub.atCoords(slot, 0, 0, 'count', 0) + ' × ' + this.rules.creatures.atCoords(cr, 0, 0, 'nameSingular', 0))
                  }, this)
                  if (value / baseline > 0.15) {
                    this.t && this.t('AI P%d:       return to town - garrison strength is %d%% of Explorer\'s : %s', this.player.get('player'), value / baseline * 100, str.join(', '))
                    hero.extra(this._shared.task, 'return')
                  } else {
                    this.t && this.t('AI P%d:       keep going - garrison strength is %d%% of Explorer\'s : %s', this.player.get('player'), value / baseline * 100, str.join(', '))
                  }
                }
              }
            }
          } else if (hero.extra(this._shared.role) == 'explorer') {
            // Explorers return to pick up new creatures and spells.
            if (town) {
              var res = this._combineHeroTownGarrisons(hero, town)
              var total = res[0]
              var heroTotal = res[2]
              if (total / heroTotal > 1.5) {
                this.t && this.t('AI P%d:       return to town - combined garrison strength would be %d%% : %s', this.player.get('player'), total / heroTotal * 100, _.pluck(res[1], 'aiValue').join(' '))
                hero.extra(this._shared.task, 'return')
              } else {
                this.t && this.t('AI P%d:       keep going - combined garrison strength would be %d%% : %s', this.player.get('player'), total / heroTotal * 100, _.pluck(res[1], 'aiValue').join(' '))

                var spkn = this.cx.oneShotEffectCalculation({
                  target: this.map.constants.effect.target.hero_spellPower,
                  ifObject: hero.get('id'),
                })

                spkn += this.cx.oneShotEffectCalculation({
                  target: this.map.constants.effect.target.hero_knowledge,
                  ifObject: hero.get('id'),
                })

                if (spkn >= 5) {
                  var heroSpells = this.cx.oneShotEffectCalculation({
                    class: Calculator.Effect.GenericIntArray,
                    target: this.map.constants.effect.target.hero_spells,
                    ifObject: hero.get('id'),
                  })

                  var townSpells = this.cx.oneShotEffectCalculation({
                    class: Calculator.Effect.GenericIntArray,
                    target: this.map.constants.effect.target.town_spells,
                    ifObject: town.get('id'),
                  })

                  var diff = _.difference(townSpells, heroSpells)
                  if (diff.length) {
                    this.t && this.t('AI P%d:       return to town - learn %d spells : %s', this.player.get('player'), diff.length, diff.sort().join(' '))
                    hero.extra(this._shared.task, 'return')
                  } else {
                    this.t && this.t('AI P%d:       keep going - no new spells to learn', this.player.get('player'))
                  }
                }
              }
            }
          }
        }
      }

      if (!hero.extra(this._shared.task) && objects.length) {
        var object = _.sample(objects)

        this.t && this.t('AI P%d:     assign visit to random object from top %d : %d %s', this.player.get('player'), objects.length, object.id, object.class.name)
        hero.extra(this._shared.task, 'visit')
        hero.extra(this._shared.target, object.id)
      }

      switch (hero.extra(this._shared.task)) {
        case false:
          // Move to a random spot rather than standing to avoid blocking the way or sitting in town forever.
          var pool = []
          var spot = this.map.actionableSpot(hero.get('id'))
          this.map.byPassable.findWithinRect(
            Math.max(0, spot[0] - 7), Math.max(0, spot[1] - 7), spot[2],
            Math.max(0, spot[0] + 7), Math.max(0, spot[1] + 7), spot[2],
            'impassable',
            function (impassable, x, y, z) {
              if (!impassable &&
                  !this.map.bySpot.findAtCoords(x, y, z, 'guarded', function (g) { return g == this.map.constants.spotObject.guarded.guarded || null }, this)) {
                pool.splice(_.random(pool.length), 0, [x, y, z])
              }
            },
            this
          )
          var path
          while (pool.length && !path) {
            path = this.cx.pathFindFor(hero.get('id'), spot = pool.pop())
          }
          if (path) {
            this.t && this.t('AI P%d:     move randomly to (%d;%d;%d)', this.player.get('player'), spot[0], spot[1], spot[2])
            this._async.nest(this.do('moveHero', {hero: hero.get('id'), path: path.slice(1)}))
          }
          break
        case 'return':
          var target = hero.extra(this._shared.town)
        case 'visit':
          var target = target || hero.extra(this._shared.target)
          var coords = _.object(['x', 'y', 'z'], this.map.actionableSpot(target))
          if (coords.x == null) {   // target is _ground, no actionable spot
            coords = this.map.objects.atter(['x', 'y', 'z'])(target, 0, 0, 0)
          }
          var path = this.cx.pathFindFor(hero.get('id'), [coords.x, coords.y, coords.z])
          // path can't be exactly false because it indicates we're standing on it but we must have unassigned this task earlier if this is the case.
          if (path) {
            path.shift()
          } else {
            // Can only happen for 'return' task since 'visit' targets are filtered by _nearbyObjects() for reachability. Means town is past water.
            this.t && this.t('AI P%d:     cannot reach target from (%d;%d;%d) : %d %s', this.player.get('player'), hero.get('x'), hero.get('y'), hero.get('z'), target, this.rules.classes.atCoords(this.map.objects.atCoords(target, 0, 0, 'class', 0), 0, 0, 'name', 0))

            // See if last embarkation spot (or the town, if none) is reachable using different vehicles. Resulting path isn't necessary most optimal (see the note in costAt()) but it should tell if we can reach the target at all.

            var embark = hero.extra(this._shared.embarks).slice(-1)[0] || target
            var coords = _.object(['x', 'y', 'z'], this.map.actionableSpot(embark))
            var path = this.cx.pathFindFor(hero.get('id'), [coords.x, coords.y, coords.z], null, {walkTerrain: this._shared.allTerrains})

            if (path === false) {
              this.t && this.t('AI P%d:     ...standing on %s : %d %s', this.player.get('player'), embark == target ? 'town' : hero.extra(this._shared.embarks).length + 'th embarkation spot', embark, this.rules.classes.atCoords(this.map.objects.atCoords(embark, 0, 0, 'class', 0), 0, 0, 'name', 0))
              hero.extra(this._shared.embarks, _.initial)
              return
            } else if (!path) {
              this.t && this.t('AI P%d:     ...and can\'t reach %s using whatever vehicles; postpone return : %d %s', this.player.get('player'), embark == target ? 'town' : hero.extra(this._shared.embarks).length + 'th embarkation spot', embark, this.rules.classes.atCoords(this.map.objects.atCoords(embark, 0, 0, 'class', 0), 0, 0, 'name', 0))
              hero.extra(this._shared.lastTownVisit, this.map.get('date') - 3)
              hero.extra(this._shared.task, false)
              return
            } else {
              this.t && this.t('AI P%d:     ...but can reach %s using whatever vehicles : %d %s', this.player.get('player'), embark == target ? 'town' : hero.extra(this._shared.embarks).length + 'th embarkation spot', embark, this.rules.classes.atCoords(this.map.objects.atCoords(embark, 0, 0, 'class', 0), 0, 0, 'name', 0))

              // Find path to embark using binary search.
              path.shift()

              var index = Common.Ordered.staticProps.indexFor(_.range(path.length), null, function (a, b) {
                if (arguments.length > 1) {
                  return this.cx.pathFindFor(hero.get('id'), path[a]) ? -1 : +1
                }
              }, this)

              // index = index of first segment that we cannot traverse.
              // index - 1 = last traversable segment.

              if (index == 0) {
                var coords = path[0]

                this.t && this.t('AI P%d:     ...standing on edge, %sembark on (%d;%d;%d)', this.player.get('player'), hero.get('vehicle') == this.map.constants.object.vehicle.ship ? 'dis' : '', coords[0], coords[1], coords[2])

                switch (hero.get('vehicle')) {
                  case this.map.constants.object.vehicle.horse:
                    // My other horse is a boat  ¬_¬
                    //
                    // SoD has 3 subclasses (0-2) which differ in look only.
                    var cls = _.sample(this.rules.objectsID.boat)
                    var catter = this.rules.classes.atter([
                      // XXX=R:clc:
                      'type', 'texture', 'animation', 'duration', 'width', 'height', 'miniMap', 'passableType', 'passable', 'actionable', 'actionableFromTop'])
                    var props = catter(cls, 0, 0, 0)
                    var act = this.map.actionableSpot(props, true)
                    _.extend(props, {
                      class: cls,
                      subclass: false,
                      x: coords[0] - act[0],
                      y: coords[1] - act[1],
                      z: coords[2],
                    })
                    var ship = this.rules.createObject(props)
                    hero.extra(this._shared.boatMade, true)
                    var embarkAsync = this.do('moveHero', {
                      hero: hero.get('id'),
                      path: [coords],
                    })
                    break
                  case this.map.constants.object.vehicle.ship:
                    // No need to handle ship-to-land transition specially because ground is a valid target for do=moveHero.
                }

                this._async.nest(embarkAsync.whenSuccess(function () {
                  this.t && this.t('AI P%d:     ...now on %s, continue : %d %s', this.player.get('player'), _.indexOf(this.map.constants.object.vehicle, hero.get('vehicle')), hero.get('id'), hero.extra(this._shared.name))
                }, this))
                return true
              } else {
                // path[index] is the first unreachable segment that requires switching vehicle. It means that path[0...index] is reachable using current vehicle but doesn't mean this is the optimal path. Consider this map:
                //
                // [+][H][~][~][~][~][~][~][~]   H hero  + ground  ~ water
                // [~†[~†[~][~][~][~][~][~][~]   † making ship and embarking
                // [~][~][~‡[~][~][~][~][~][~]
                // [~][~][~][~‡[~][~][~][~][~]
                // [~][~][~][~][~‡[~][~][~][~]
                // [~][~][~][~][~][~‡[~‡[~‡[~]
                //<<#][#][+][+][+][+][+¹[+][~‡   # impassable until left map edge
                // [~][~][+][#][#][#][+][+²[~‡   # town
                // [~][~][#][#][#][#][#][+³[~‡
                // [~][~][#][#][@][#][#][+‡[~]   ‡ disembarking
                // [~][~][+][+][+][+][+][+][~]   @ actionable
                //
                // The route†‡ reflects corrected path after executing next line. However, the original path (that was binary-searched) is shorter¹²³ because our path finder assumes (allTerrains) that both water and ground are passable for our hero without dis/embarking. If it so happens that index points to last ‡ then do=moveHero will fail if we give it the original path (via ¹).
                path = this.cx.pathFindFor(hero.get('id'), path[index - 1]).slice(1)

                this.t && this.t('AI P%d:     ...intermediate travel on %s : %s', this.player.get('player'), _.indexOf(this.map.constants.object.vehicle, hero.get('vehicle')), path.map(function (p) { return _.format('(%d;%d;%d)', p[0], p[1], p[2]) }).join(' -> '))

                if (this.t) {
                  var coords = _.last(path)
                  target = this.map.bySpot.findAtCoords(coords[0], coords[1], coords[2], 0, function ($1, $2, $3, $4, l, n) {
                    if (this.map.bySpot.atContiguous(n + this.map.bySpot.propertyIndex('type'), l) == this.map.constants.object.type.terrain) {
                      return this.map.bySpot.atContiguous(n + this.map.bySpot.propertyIndex('id'), l)
                    }
                  }, this)
                }
              }
            }
          }

          if (this.t) {
            var cost = _.sum(_.pluck(path, 6))
            this.t('AI P%d:     %s target is %d tiles, %d APs away (%.-1f days) : %d %s', this.player.get('player'), hero.extra(this._shared.task), path.length, cost, cost / hero.extra(this._shared.dailyAP), target, this.rules.classes.atCoords(this.map.objects.atCoords(target, 0, 0, 'class', 0), 0, 0, 'name', 0))
          }

          if (path[0][6] > hero.get('actionPoints')) {
            this.t && this.t('AI P%d:     can\'t travel anymore today (have %d APs, next step needs %d)', this.player.get('player'), hero.get('actionPoints'), path[0][6])
          } else {
            this._async.nest(this.do('moveHero', {hero: hero.get('id'), path: path}))
            return true   // may trigger transitions and change of screen
          }

          break
      }

      hero.extra(this._shared.processed, true)
      this.t && this.t('AI P%d:   end control hero : %d %s', this.player.get('player'), hero.get('id'), hero.extra(this._shared.name))
      // Could have reached here by random movement due to no assigned task. That may trigger stuff so for safety wait till the move ends.
      return true
    },

    _townVisit: function (hero, town, staying) {
      if (hero.extra(this._shared.town) == town.get('id')) {
        hero.extra(this._shared.task, false)
        hero.extra(this._shared.embarks, [])
        hero.extra(this._shared.lastTownVisit, this.map.get('date'))
      }

      var async = new Common.Async({owning: false, method: '_townVisit'})
      var done = async.nestDoner()

      this.t && async.whenComplete(function () {
        var str = []
        var sub = this.map.objects.readSubAtCoords(hero.get('id'), 0, 0, 'garrison', 0)
        sub.find('creature', function (cr, slot) {
          str.push(slot + ': ' + sub.atCoords(slot, 0, 0, 'count', 0) + ' × ' + this.rules.creatures.atCoords(cr, 0, 0, 'nameSingular', 0))
        }, this)
        this.t('AI P%d:       final own garrison : %s', this.player.get('player'), str.join(', '))

        var str = []
        var sub = this.map.objects.readSubAtCoords(town.get('id'), 0, 0, 'garrison', 0)
        sub.find('creature', function (cr, slot) {
          str.push(slot + ': ' + sub.atCoords(slot, 0, 0, 'count', 0) + ' × ' + this.rules.creatures.atCoords(cr, 0, 0, 'nameSingular', 0))
        }, this)
        this.t('AI P%d:       final town garrison : %s', this.player.get('player'), str.join(', '))
      }, this)

      // XXX=I would be good to exchange garrisons directly with heroes (heroTrade) without using town as a relay
      //
      // XXX this assumes garrison commands are executed in the same order as called (IdleTasks guarantees that but `#RPC doesn't)
      switch (hero.extra(this._shared.role)) {
        case 'collector':
          // 1. Hero has several creatures (A, B, C), town has none
          // 2. _townVisit() moves all creatures from hero except splitting one
          //    weakest stack (A) to 1 count to keep hero's garrison non-empty
          // 3. Hero has A(1), town has A(N-1), B, C
          // 4. _townVisit() occurs again and the first thing it does is
          //    _mergeHeroTownGarrisons(), turning hero's garrison to A(N)
          //    and town's to B, C
          // 5. _townVisit() continues and again makes hero's garrison A(1)
          //
          // Third and subsequent _townVisit() would endlessly loop at 4-5. To
          // avoid that, assume that if a collector hero has just one stack at
          // 1 count then he is in no need of unloading his garrison.
          //
          // XXX=I Ideally should check aiValue and swap with town's garrison if
          // hero's creature is stronger.
          var sub = this.map.objects.readSubAtCoords(hero.get('id'), 0, 0, 'garrison', 0)
          var cur
          sub.find('count', function (count) {
            if (cur || count > 1) {
              return cur = false
            } else {
              cur = true
            }
          })
          if (cur) {
            done()
            break
          }
          this.t && this.t('AI P%d:     unload garrison to town', this.player.get('player'))
          var res = this._mergeHeroTownGarrisons(hero, town)
          var heroSub = res[1]
          async.nest(res[2])
          // This should execute before res[2] is removed from this._async and thus before another iteration of _controlHero() happens.
          res[2].whenSuccess(function () {
            this.t && this.t('AI P%d:       merged same creatures, continue : %d %s', this.player.get('player'), hero.get('id'), hero.extra(this._shared.name))
            var res = this._combineHeroTownGarrisons(hero, town)
            // Ensure town garrison contains 7 strongest creatures. The rest goes to hero's garrison.
            //
            // Occupied slots go first to ensure that if all hero slots are to be moved (res[3].length == heroSlots) then 'swap' results in a town slot not part of the combined list landing in hero's garrison, preventing it from becoming empty (as it could happen if freeSlots[0] were an empty town slot).
            var freeSlots = _.sortBy([0, 1, 2, 3, 4, 5, 6], function (s) { return -res[4].some(function (slot) { return slot.slot == s }) })
            var townSlots = 0
            var heroSlots = 0
            res[1].forEach(function (slot) {
              if (slot.garrison == 'town') {
                freeSlots.splice(freeSlots.indexOf(slot.slot), 1)
                townSlots++
              } else {
                heroSlots++
              }
            })
            if (res[3].length == heroSlots && res[4].length == townSlots) {
              // combined list includes all slots of 'hero' and of 'town'. Because hero can't have empty garrison, split off the weakest creature into last freeSlots.
              //
              // freeSlots isn't empty if this executes.
              var weakest = Infinity
              var index = 0
              res[1].forEach(function (slot, i) {
                var value = this.rules.creatures.atCoords(slot.creature, 0, 0, 'aiValue', 0)
                if (weakest > value && slot.count > 1) {   // can't split if count is already 1
                  weakest = value
                  index = i
                }
              }, this)
              var slot = res[1].splice(index, 1)[0]
              for (var heroSlot = -1; heroSub.anyAtCoords(++heroSlot, 0, 0); ) ;
              if (weakest == Infinity) {
                // All creatures have the count of 1 - then simply do not move the weakest stack from hero to town.
                if (slot.garrison == 'town') {
                  async.nest(this.do('garrison', {
                    do: 'swap',
                    from: town.get('id'),
                    fromSlot: slot.slot,
                    to: hero.get('id'),
                    toSlot: heroSlot,
                  }))
                }
              } else {
                if (slot.garrison == 'town') {
                  async.nest(this.do('garrison', {
                    do: 'split',
                    from: town.get('id'),
                    fromSlot: slot.slot,
                    creature: slot.creature,
                    take: 1,
                    to: hero.get('id'),
                    toSlot: heroSlot,
                  }))
                } else {
                  async.nest(this.do('garrison', {
                    do: 'split',
                    from: hero.get('id'),
                    fromSlot: slot.slot,
                    creature: slot.creature,
                    take: slot.count - 1,
                    to: town.get('id'),
                    toSlot: freeSlots.pop(),
                  }))
                }
              }
            }
            res[1].forEach(function (slot) {
              if (slot.garrison == 'hero') {
                async.nest(this.do('garrison', {
                  do: 'swap',
                  from: hero.get('id'),
                  fromSlot: slot.slot,
                  to: town.get('id'),
                  toSlot: freeSlots.shift(),
                }))
              }
            }, this)
            done()
          }, this)
          break

        case 'explorer':
          this.t && this.t('AI P%d:     take garrison from town', this.player.get('player'))
          var res = this._mergeHeroTownGarrisons(hero, town)
          var heroSub = res[1]
          async.nest(res[2])
          res[2].whenSuccess(function () {
            this.t && this.t('AI P%d:       merged same creatures, continue : %d %s', this.player.get('player'), hero.get('id'), hero.extra(this._shared.name))
            // First, move same creatures from town's garrison to hero's.
            // Then combine garrisons so that hero has only strongest creatures.
            var res = this._combineHeroTownGarrisons(hero, town)
            var freeSlots = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]]
            heroSub.find('creature', function (cr, slot) {
              var value = this.rules.creatures.atCoords(cr, 0, 0, 'aiValue', 0) * heroSub.atCoords(slot, 0, 0, 'count', 0)
              freeSlots[slot][1] = value
            }, this)
            freeSlots = _.pluck(_.sortBy(freeSlots, Common.p(1)), 0)
            res[1].forEach(function (slot) {
              if (slot.garrison == 'hero') {
                freeSlots.splice(freeSlots.indexOf(slot.slot), 1)
              }
            })
            res[1].forEach(function (slot) {
              if (slot.garrison == 'town') {
                async.nest(this.do('garrison', {
                  do: 'swap',
                  from: town.get('id'),
                  fromSlot: slot.slot,
                  to: hero.get('id'),
                  toSlot: freeSlots.shift(),
                }))
              }
            }, this)
          }, this)

          // Because it includes upgraded buildings, if there is a higher-level Mage Guild then mageGuild1 is listed.
          var found = _.includes(town.extra(this._shared.buildings), this.rules.buildingsID.mageGuild1)
          if (found) {
            async.nest(this.do('buySpellBook', {
              hero: hero.get('id'),
              town: town.get('id'),
            })
              .whenSuccess(function () {
                async.nest(this.do('openMageGuild', {
                  hero: hero.get('id'),
                  town: town.get('id'),
                }))
              }, this))
            if (hero.get('spellPoints') < 50 && hero.get('spellPoints') < hero.extra(this._shared.maxSP) && hero.get('actionPoints') <= 500) {
              this.t && this.t('AI P%d:     stay in town to regenerate SPs (%d current, %d max)', this.player.get('player'), hero.get('spellPoints'), hero.extra(this._shared.maxSP))
              hero.extra(this._shared.processed, true)
            }
          }

          if (hero.get('actionPoints') <= 800 && this.map.date().day == 7) {
            this.t && this.t('AI P%d:     stay in town before new week growth', this.player.get('player'))
            hero.extra(this._shared.processed, true)
          }

          done()
          break
      }

      return this._async.nest(async)
    },

    // XXX=R
    //
    // This ensures combined garrisons of hero and town don't have duplicate
    // creature IDs. It doesn't reorder creatures in any particular way so
    // for example if hero and town had 1*C1 then town will have 0*C1, hero - 2*C1,
    // or if only town had two slots, each 1*C1 then it will have one slot 2*C1.
    // Reordering must be done later, once the returned async completes.
    _mergeHeroTownGarrisons: function (hero, town) {
      var async = new Common.Async({owning: false, method: '_mergeHeroTownGarrisons'})
      var heroCreatures = {}
      var heroSub = this.map.objects.readSubAtCoords(hero.get('id'), 0, 0, 'garrison', 0)
      heroSub.find('creature', function (cr, slot) {
        if (heroCreatures[cr] == null) {
          heroCreatures[cr] = slot
        } else {
          async.nest(this.do('garrison', {
            do: 'merge',
            from: hero.get('id'),
            fromSlot: slot,
            to: hero.get('id'),
            toSlot: heroCreatures[cr],
          }))
        }
      }, this)
      var townCreatures = {}
      this.map.objects.readSubAtCoords(town.get('id'), 0, 0, 'garrison', 0)
        .find('creature', function (cr, slot) {
          if (heroCreatures[cr] != null) {
            async.nest(this.do('garrison', {
              do: 'merge',
              from: town.get('id'),
              fromSlot: slot,
              to: hero.get('id'),
              toSlot: heroCreatures[cr],
            }))
          } else if (townCreatures[cr] == null) {
            townCreatures[cr] = slot
          } else {
            async.nest(this.do('garrison', {
              do: 'merge',
              from: town.get('id'),
              fromSlot: slot,
              to: town.get('id'),
              toSlot: townCreatures[cr],
            }))
          }
        }, this)
      async.doneIfEmpty()
      return [heroCreatures, heroSub, this._async.nest(async)]
    },

    // XXX=R
    //
    // Note: heroTotal, [2] is old (current) aiValue's of hero's garrison, not the
    // value it will have after combining (this value is total, [0]).
    _combineHeroTownGarrisons: function (hero, town) {
      var heroSlots = []
      var heroTotal = 0
      var str = []
      var sub = this.map.objects.readSubAtCoords(hero.get('id'), 0, 0, 'garrison', 0)
      sub.find('creature', function (cr, slot) {
        var cur = {garrison: 'hero', slot: slot, creature: cr, count: sub.atCoords(slot, 0, 0, 'count', 0), aiValue: this.rules.creatures.atCoords(cr, 0, 0, 'aiValue', 0) * sub.atCoords(slot, 0, 0, 'count', 0)}
        heroSlots.push(cur)
        heroTotal += cur.aiValue
        this.t && str.push(slot + ': ' + cur.aiValue + ' = ' + cur.count + ' × ' + this.rules.creatures.atCoords(cr, 0, 0, 'nameSingular', 0))
      }, this)
      this.t && this.t('AI P%d:       own garrison strength is %d : %s', this.player.get('player'), heroTotal, str.join(', '))

      var townSlots = []
      var townTotal = 0
      var str = []
      var sub = this.map.objects.readSubAtCoords(town.get('id'), 0, 0, 'garrison', 0)
      sub.find('creature', function (cr, slot) {
        var cur = {garrison: 'town', slot: slot, creature: cr, count: sub.atCoords(slot, 0, 0, 'count', 0), aiValue: this.rules.creatures.atCoords(cr, 0, 0, 'aiValue', 0) * sub.atCoords(slot, 0, 0, 'count', 0)}
        townSlots.push(cur)
        townTotal += cur.aiValue
        this.t && str.push(slot + ': ' + cur.aiValue + ' = ' + cur.count + ' × ' + this.rules.creatures.atCoords(cr, 0, 0, 'nameSingular', 0))
      }, this)
      this.t && this.t('AI P%d:       town\'s garrison strength is %d : %s', this.player.get('player'), townTotal, str.join(', '))

      var combined = _.sortBy(heroSlots.concat(townSlots), Common.p('aiValue')).slice(-7)
      var total = _.sum(_.pluck(combined, 'aiValue'))
      this.t && this.t('AI P%d:       combined strength is %d : %s', this.player.get('player'), total, combined.map(function (slot) { return slot.garrison[0].toUpperCase() + slot.slot + ' ' + this.rules.creatures.atCoords(slot.creature, 0, 0, 'nameSingular', 0) }, this).join(', '))
      this.t && this.t('AI P%d:       not part of combined : %s', this.player.get('player'), heroSlots.concat(townSlots).filter(function (s) { return !_.includes(combined, s) }).map(function (slot) { return slot.garrison[0].toUpperCase() + slot.slot + ' ' + this.rules.creatures.atCoords(slot.creature, 0, 0, 'nameSingular', 0) }, this).join(', '))
      return [total, combined, heroTotal, heroSlots, townSlots]
    },

    // XXX=R
    //
    //> maxCost `- from `'spot (the town), not `'hero, measured over any terrain and thus only an estimate
    //
    // To pump up the AI, it's made to cognize through the fog.
    _nearbyObjects: function (hero, spot, maxCost) {
      var objects = []
      var classIndex = this.map.objects.propertyIndex('class')
      var role = hero.extra(this._shared.role)

      this.t && this.t('AI P%d:     examine objects for %s %s up to %d APs away from (%d;%d;%d)', this.player.get('player'), role, hero.extra(this._shared.name), maxCost, spot[0], spot[1], spot[2])

      _.each(this.map.constants.object.type, function (type) {
        switch (type) {
          case this.map.constants.object.type.terrain:
          case this.map.constants.object.type.river:
          case this.map.constants.object.type.road:
            return
        }

        this.map.byType.findAtCoords(type, 0, 0, 'id', function (id) {
          var cls = this._shared.classActions[this.map.objects.atCoords(id, 0, 0, classIndex, 0)]
          if (id != hero.get('id') && cls) {
            // Ignore objects not handled by hero's role.
            if (!cls[role]) {
              this.t && this.t('AI P%d:     ...ignore due to no value to %s : %d %s', this.player.get('player'), role, id, this.rules.classes.atCoords(cls.id, 0, 0, 'name', 0))
              return
            }
            var coords = _.object(['x', 'y', 'z'], this.map.actionableSpot(id))
            // Measure over any terrain since hero could have ventured overseas. The fact he's out of reach from the town (spot) shall not get in the way of looting.
            var distance = this._pathCost(hero, [coords.x, coords.y, coords.z], spot, {walkTerrain: this._shared.allTerrains})
            if (distance < maxCost) {
              var dh = this._pathCost(hero, [coords.x, coords.y, coords.z])
              if (dh == Infinity) {
                // Can happen, since we're measuring path from spot over any terrain but from hero - over vehicle's allowed terrain.
                this.t && this.t('AI P%d:     ...object reachable by any terrain from town (%d;%d;%d) but unreachable from hero %d by %s : %d %s', this.player.get('player'), spot[0], spot[1], spot[2], hero.get('id'), _.indexOf(this.rules.constants.object.vehicle, hero.get('vehicle')), id, this.rules.classes.atCoords(cls.id, 0, 0, 'name', 0))
              } else if (dh) {
                // If distance is 0, it means hero is standing on this object and its spot effects were triggered. Exclude it from nearby objects; will also trigger unsetting hero's task.
                //
                // distanceFromSpot is currently unused outside of this function.
                objects.push({id: id, class: cls, distanceFromSpot: distance, distanceFromHero: dh})
              }
            }
          }
        }, this)
      }, this)

      var disembark = hero.get('vehicle') == this.rules.constants.object.vehicle.ship
      if (disembark) {
        this.t && this.t('AI P%d:     add disembarkation grounds - I\'m on sail', this.player.get('player'))
      }

      var ground = this.map.constants.passable.type.ground
      var from = this.map.actionableSpot(hero.get('id'))
      from[3] = this.map.toContiguous(from[0], from[1], from[2])
      var guardedIndex = this.map.bySpot.propertyIndex('guarded')
      var typeIndex = this.map.bySpot.propertyIndex('type')
      this.map.byPassable.find('type', function (type, x, y, z, l) {
        if (!this.map.byPassable.atCoords(x, y, z, 'impassable', l)) {
          var cost = this._pathCost(hero, [x, y, z], from)
          if (cost != Infinity) {
            // No meaning in measuring distance from town.
            //var td = this._pathCost(hero, [x, y, z], spot, {walkTerrain: this._shared.allTerrains})
            var guarded
            var id
            this.map.bySpot.findAtCoords(x, y, z, 0, function ($1, $2, $3, $4, l, n) {
              if (this.map.bySpot.atContiguous(n + guardedIndex, l) == this.map.constants.spotObject.guarded.guarded) {
                guarded = true
              }
              if (this.map.bySpot.atContiguous(n + typeIndex, l) == this.map.constants.object.type.terrain) {
                id = this.map.bySpot.atContiguous(n + this.map.bySpot.propertyIndex('id'), l)
              }
            }, this)
            // When on ship, add all terrain tiles that can be disembarked upon. In any case, add all guarded tiles - because our path finder currently doesn't allow building path to a monster through its impassable guarded area, the AI will never interact with monsters if we don't add them (XXX).
            if (guarded || (disembark && type == ground)) {
              objects.push({id: id, class: this._shared.classActions._ground, /*distanceFromSpot: td,*/ distanceFromHero: cost})
            }
          }
        }
      }, this)

      objects = objects.filter(function (obj) {
        var factor = this._canTargetForVisit(hero, obj.id, obj.class)
        if (factor != null) {
          obj.value = obj.distanceFromHero / obj.class[role] * factor
          if (this.get('panic') && (obj.class.idName == 'town' || obj.class.idName == 'randomTown')) {
            obj.value /= 10
          }
          return true
        }
      }, this)

      if (objects.length) {
        objects.sort(function (a, b) {
          return a.value - b.value || a.id - b.id
        }, this)

        this.t && this.t('AI P%d:     determined %d potential objects, in order of preference:', this.player.get('player'), objects.length)

        objects.forEach(function (obj) {
          this.t && this.t('AI P%d:     ...sort=%.-4f, %s %d APs away from hero, %d from town : %d %s', this.player.get('player'), obj.value, _.indexOf(this.map.constants.object.type, this.map.objects.atCoords(obj.id, 0, 0, 'type', 0)), obj.distanceFromHero, obj.distanceFromSpot, obj.id, obj.class.name)
        }, this)
      } else {
        this.t && this.t('AI P%d:     determined no potential objects', this.player.get('player'))
      }

      return objects
    },

    // XXX=R
    //
    // Doesn't check reachability.
    _canTargetForVisit: function (hero, id, cls) {
      if (this.map.objects.atCoords(id, 0, 0, 'displayOrder', 0) < 0) {
        this.t && this.t('AI P%d:     ...ignore invisible : %d %s', this.player.get('player'), id, cls.name)
        return
      }

      if (cls.ignore && cls.ignore.call(this, hero, id)) {
        this.t && this.t('AI P%d:     ...ignore due to class-specific function : %d %s', this.player.get('player'), id, cls.name)
        return
      }

      var enc = new Rules.GenericEncounter({
        rules: this.rules,
        bonus: id,
        hero: hero.get('id'),
      })

      if (!enc.attach().checkFulfilled()) {
        this.t && this.t('AI P%d:     ...ignore unfulfilled/visited : %d %s', this.player.get('player'), id, cls.name)
        return
      }

      if (cls.act == 'attack') {
        // Not all AObject-s are ownable but $owner is part of all-objects' schema so it should just return false for monsters, artifacts, etc.
        var owner = this.map.objects.atCoords(id, 0, 0, 'owner', 0)
        if (owner !== false && this.map.players.nested(owner).get('team') == this.player.get('team')) {
          this.t && this.t('AI P%d:     ...ignore already owned by ally P%d : %d %s', this.player.get('player'), owner, id, cls.name)
          return
        }
      }

      var garrisonStrength = function (target) {
        var guards = 0
        var str = []
        var sub = this.map.objects.readSubAtCoords(target, 0, 0, 'garrison', 0)
        sub.find('creature', function (cr, slot) {
          guards += this.rules.creatures.atCoords(cr, 0, 0, 'aiValue', 0) * sub.atCoords(slot, 0, 0, 'count', 0)
          this.t && str.push(sub.atCoords(slot, 0, 0, 'count', 0) + ' × ' + this.rules.creatures.atCoords(cr, 0, 0, 'nameSingular', 0))
        }, this)
        this.t && this.t('AI P%d:     ...garrison of %d : %d %s : %s', this.player.get('player'), id, target, this.rules.classes.atCoords(this.map.objects.atCoords(target, 0, 0, 'class', 0), 0, 0, 'name', 0), str.join(', '))
        return guards
      }.bind(this)

      var guards = 0

      // XXX _triggerSpotEffects() has more complex logic determining if there will be a fight when interacting with this tile; the check below works when disembarking but on land it erroneously treats an object that causes hero to stop rather than step on its tile as guarded, such as an artifact: [M][A][H] - Monster guards Artifact but Hero can pick it without a fight
      var coords = this.map.actionableSpot(id) ||
        // _ground.
        this.map.objects.atter(['x', 'y', 'z'], {array: true})(id, 0, 0, 0)
      this.map.bySpot.findAtCoords(coords[0], coords[1], coords[2], 0,
        function ($1, x, y, z, l) {
          if (this.map.bySpot.atCoords(x, y, z, 'guarded', l) == this.rules.constants.spotObject.guarded.guarded) {
            // XXX garrison may not be initialized before encounter?
            guards += garrisonStrength(this.map.bySpot.atCoords(x, y, z, 'id', l))
          }
        }, this)

      if (guards || cls.act == 'attack') {
        var factor = 1.5

        switch (cls.idName) {
          case 'town':
          case 'randomTown':
            var garrisoned = this.map.objects.atCoords(id, 0, 0, 'visiting', 0) || this.map.objects.atCoords(id, 0, 0, 'garrisoned', 0)

            // XXX hardcoded check for town's buildings; check the Effect target for fortifications instead
            var value = this.cx.oneShotEffectCalculation({
              class: Calculator.Effect.GenericIntArray,
              target: this.map.constants.effect.target.town_buildings,
              ifObject: id,
            })
            if (_.includes(value, this.rules.buildingsID.fort)) {
              factor += 0.5
            } if (_.includes(value, this.rules.buildingsID.citadel)) {
              factor += 1.5
            } if (_.includes(value, this.rules.buildingsID.castle)) {
              factor += 3.5
            }
          case 'hero':
          case 'heroPlaceholder':
          case 'randomHero':
            if (cls.idName.match(/hero/i)) { garrisoned = id }
            if (garrisoned) {
              var sumStats = function (id) {
                return _.reduce([this.map.constants.effect.target.hero_attack, this.map.constants.effect.target.hero_defense, this.map.constants.effect.target.hero_spellPower, this.map.constants.effect.target.hero_knowledge], function (cur, target) {
                  return cur += this.cx.oneShotEffectCalculation({
                    target: target,
                    ifObject: id,
                  })
                }.bind(this), 0)
              }.bind(this)
              factor += sumStats(garrisoned) / sumStats(hero.get('id'))
            }
          case 'antiMagicGarrison':
          case 'garrison':
          case 'monster':
          case 'randomMonster':
          case 'randomMonster1':
          case 'randomMonster2':
          case 'randomMonster3':
          case 'randomMonster4':
          case 'randomMonster5':
          case 'randomMonster6':
          case 'randomMonster7':
          case 'pandoraBox':
          case '_dwelling':   // XXX garrison isn't initialized before encounter
            guards += garrisonStrength(garrisoned || id)
            break

          case 'creatureBank':
          case 'crypt':
          case 'derelictShip':
          case 'dragonUtopia':
          case 'shipwreck':
            var bank = this.rules.banks.find('classes', function (classes, bank) {
              return _.includes(classes, cls.id)
            })
            guards += this.rules.banks.atCoords(bank, 0, 0, 'combatValue', 0) *
                      (this.rules.banks.atCoords(bank, 0, 0, 'garrison1Count', 0) +
                       this.rules.banks.atCoords(bank, 0, 0, 'garrison2Count', 0) +
                       this.rules.banks.atCoords(bank, 0, 0, 'garrison3Count', 0))
            break

          case 'abandonedMine':
            //if (this.map.objects.atCoords(id, 0, 0, 'subclass', 0) === false) {
            //  // Abandoned mine.
            // XXX=I check if guards were already defeated, if yes then set guards=0
              guards = 200 /*up to throng*/ * this.rules.creatures.atCoords(this.rules.creaturesID.troglodyte, 0, 0, 'aiValue', 0)
            //}
            break

          case 'pyramid':
            guards = 40 * this.rules.creatures.atCoords(this.rules.creaturesID.goldGolem, 0, 0, 'aiValue', 0) +
                     20 * this.rules.creatures.atCoords(this.rules.creaturesID.diamondGolem, 0, 0, 'aiValue', 0)
            break
        }

        if (this.get('panic') && hero.extra(this._shared.role) == 'explorer') {
          factor = 0
        }

        var me = 0
        var sub = this.map.objects.readSubAtCoords(hero.get('id'), 0, 0, 'garrison', 0)
        sub.find('creature', function (cr, slot) {
          me += this.rules.creatures.atCoords(cr, 0, 0, 'aiValue', 0) * sub.atCoords(slot, 0, 0, 'count', 0)
        }, this)

        if (me / guards < factor) {
          this.t && this.t('AI P%d:     ...ignore strongly (%.-1fX) guarded (%d, my %d, threshold %.-1fX) : %d %s', this.player.get('player'), me / guards, guards, me, factor, id, cls.name)
          return
        }

        // Increase cost (decrease likability) of this spot if hero's garrison isn't overwhelmingly stronger: if me is 1000, guards is 500 (me is 2X stronger) then by 15% (1.15).
        factor && (guards *= factor)
        return me / guards > 3 ? 1 : 1 + 3 / (me / guards) / 10
      }

      return 1
    },
  }, {shared: {}})

  AI.Neutral = Neutral

  // SoD tracks visits for every map object per visited hero (allied), in several lists: game-wise (any time in the past), during the current week (cleared on Monday), since last combat. GenericEncounter (H3.Rules) is using its own (slightly different at present) logic and we rely on that.
  //
  //> attack - attackable once per game (monster, bank) or ownable (flaggable - mine); ignored if allied owner or if visited game-wise; ignored if guards are too strong
  //> collect - collectable (chest) or visitable (cartographer) once per game; ignored if visited game-wise
  //> collectWeekly - visitable once per week; ignored if visited game-wise in current week
  //> combatBonus - visitable for temporary hero bonus until next combat; ignored if visited by hero since last combat
  //> portal - transition to another location
  //> skillBonus - visitable permanent bonus once per hero (shrine) or game (scholar); ignored if visited by hero game-wise (but only on success, e.g. if had a spell book for the shrine)
  //
  // All targets produce effects immediately as the hero steps on their actionable tile - AI does nothing special to trigger them. There may be transitions initiated by the server (such as when opening a chest) and AI handles them in _transition(), outside of _controlHero().
  var noSpellBook = function (h) {
    return !this.map.objects.readSubAtCoords(h.get('id'), 0, 0, 'artifacts', 0)
      .anyAtCoords(this.rules.artifactSlotsID.spellBook, 0, 0, 0)
  }
  var noAvailable = function (hero, object) {
    return !this.map.objects.readSubAtCoords(object, 0, 0, 'available', 0)
      .find('count', function (count) { return count || null })
  }
  var classActions = {
    creatureBank:             {act: 'attack', c: 0, e: 1}, // banks
    crypt:                    {act: 'attack', c: 0, e: 1}, // bank
    derelictShip:             {act: 'attack', c: 0, e: 1}, // bank
    dragonUtopia:             {act: 'attack', c: 0, e: 2}, // bank
    antiMagicGarrison:        {act: 'attack', c: 2, e: 2}, // garrison
    garrison:                 {act: 'attack', c: 2, e: 2}, // garrison
    hero:                     {act: 'attack', c: 0, e: 3}, // garrison
    heroPlaceholder:          {act: 'attack', c: 0, e: 3}, // garrison
    _mine:                    {act: 'attack', c: 3, e: 1},
    monster:                  {act: 'attack', c: 0, e: 2},
    pandoraBox:               {act: 'attack', c: 0, e: 1},
    pyramid:                  {act: 'attack', c: 0, e: 1},
    randomHero:               {act: 'attack', c: 0, e: 3}, // garrison
    randomMonster:            {act: 'attack', c: 0, e: 2},
    randomMonster1:           {act: 'attack', c: 0, e: 2},
    randomMonster2:           {act: 'attack', c: 0, e: 2},
    randomMonster3:           {act: 'attack', c: 0, e: 2},
    randomMonster4:           {act: 'attack', c: 0, e: 2},
    randomMonster5:           {act: 'attack', c: 0, e: 2},
    randomMonster6:           {act: 'attack', c: 0, e: 2},
    randomMonster7:           {act: 'attack', c: 0, e: 2},
    randomTown:               {act: 'attack', c: 4, e: 4}, // garrison
    shipwreck:                {act: 'attack', c: 0, e: 1}, // bank
    town:                     {act: 'attack', c: 4, e: 4}, // garrison

    lighthouse:               {act: 'attack', c: 2, e: 1},
    magicSpring:              {act: 'attack', c: 0, e: 2,
      ignore: function (h) {
        return h.get('spellPoints') > 100 || h.get('spellPoints') >= h.extra(this._shared.maxSP) * 2
      },
    },
    magicWell:                {act: 'attack', c: 0, e: 1.5,
      ignore: function (h) {
        return h.get('spellPoints') > 50 || h.get('spellPoints') >= h.extra(this._shared.maxSP)
      },
    },
    pillarOfFire:             {act: 'attack', c: 2, e: 1},
    shipyard:                 {act: 'portal', c: 0.5, e: 1,
      ignore: function (hero, object) {
        // XXX=R replace with ShipState?
        //
        // XXX check actionable spot?
        var box = this.map.objects.atter(['width', 'height', 'x', 'y', 'z'])(object, 0, 0, 0)
        var checked = {}

        return this.map.walkObjectBox(box, 1, function (o) {
          for (var dx = -1; dx < 2; dx++) {
            for (var dy = -1; dy < 2; dy++) {
              var box = [o.mx + dx, o.my + dy, o.mz]
              var n = this.bySpot.toContiguous(box[0], box[1], box[2], 'type')
              if (!checked[n]) {
                checked[n] = true
                return this.bySpot.findAtContiguous(n, this.constants.object.type.boat) != null
              }
            }
          }
        })
      },
    },
    warMachineFactory:        {act: 'attack', c: 0.25, e: 1,
      ignore: function (h) {
        var sub = this.map.objects.readSubAtCoords(h.get('id'), 0, 0, 'artifacts', 0)
        return sub.anyAtCoords(this.rules.artifactSlotsID.warMachine1, 0, 0, 0) &&
               sub.anyAtCoords(this.rules.artifactSlotsID.warMachine2, 0, 0, 0) &&
               sub.anyAtCoords(this.rules.artifactSlotsID.warMachine3, 0, 0, 0)
      },
    },

    artifact:                 {act: 'collect', c: 0, e: 2},
    campfire:                 {act: 'collect', c: 2, e: 0.5},
    cartographer:             {act: 'collect', c: 2, e: 1},
    corpse:                   {act: 'collect', c: 2, e: 0.5},
    flotsam:                  {act: 'collect', c: 2, e: 0.5},
    grail:                    {act: 'collect', c: 4, e: 4},
    keymasterTent:            {act: 'collect', c: 1, e: 3},
    leanTo:                   {act: 'collect', c: 2, e: 0.5},
    obelisk:                  {act: 'collect', c: 2, e: 2},
    prison:                   {act: 'collect', c: 3, e: 3},
    randomArtifact:           {act: 'collect', c: 0, e: 2.5},
    randomMajorArtifact:      {act: 'collect', c: 0, e: 3},
    randomMinorArtifact:      {act: 'collect', c: 0, e: 2.5},
    randomRelic:              {act: 'collect', c: 0, e: 4},
    randomResource:           {act: 'collect', c: 2, e: 0.5},
    randomTreasureArtifact:   {act: 'collect', c: 0, e: 2},
    redwoodObservatory:       {act: 'collect', c: 1, e: 2},
    resource:                 {act: 'collect', c: 2, e: 0.5},
    seaChest:                 {act: 'collect', c: 2, e: 0.5},
    seerHut:                  {act: 'collect', c: 1, e: 2},
    shipwreckSurvivor:        {act: 'collect', c: 2, e: 1},
    spellScroll:              {act: 'collect', c: 0, e: 2},
    treasureChest:            {act: 'collect', c: 1, e: 2},
    wagon:                    {act: 'collect', c: 2, e: 0.5},
    warriorTomb:              {act: 'collect', c: 0, e: 2},

    _dwelling:                {act: 'collectWeekly', c: 2, e: 0, ignore: noAvailable},
    mysticalGarden:           {act: 'collectWeekly', c: 1, e: 0},
    refugeeCamp:              {act: 'collectWeekly', c: 1, e: 0, ignore: noAvailable},
    stables:                  {act: 'collectWeekly', c: 1, e: 1},
    waterWheel:               {act: 'collectWeekly', c: 1, e: 0},
    windmill:                 {act: 'collectWeekly', c: 1, e: 0},

    buoy:                     {act: 'combatBonus', c: 0,  e: 1},
    faerieRing:               {act: 'combatBonus', c: 0,  e: 1},
    fountainOfFortune:        {act: 'combatBonus', c: 0,  e: 1},
    fountainOfYouth:          {act: 'combatBonus', c: 1,  e: 1},
    idolOfFortune:            {act: 'combatBonus', c: 0,  e: 1},
    mermaids:                 {act: 'combatBonus', c: 0,  e: 1},
    oasis:                    {act: 'combatBonus', c: 0,  e: 1},
    rallyFlag:                {act: 'combatBonus', c: 0,  e: 1},
    swanPond:                 {act: 'combatBonus', c: 0,  e: 1},
    temple:                   {act: 'combatBonus', c: 0,  e: 1},
    wateringHole:             {act: 'combatBonus', c: 0,  e: 1},

    // This is used for guarded spots and disembarkation (when on boat).
    _ground:                  {act: 'portal', c: 0.15, e: 0.15},
    boat:                     {act: 'portal', c: 0.5, e: 1.5},
    monolithOneWayEntrance:   {act: 'portal', c: 0.5, e: 0.5},
    monolithTwoWay:           {act: 'portal', c: 0.5, e: 1},
    subterraneanGate:         {act: 'portal', c: 0.5, e: 1.5},
    // Giving it very low priority so that Whirlpool is visited only if there is nothing else to do, such as to unstuck after entering it by accident.
    whirlpool:                {act: 'portal', c: 0.025, e: 0.025},

    arena:                    {act: 'skillBonus', c: 0.25,  e: 1.5},
    gardenOfRevelation:       {act: 'skillBonus', c: 0.25,  e: 1.5},
    learningStone:            {act: 'skillBonus', c: 0.5,   e: 1.5},
    libraryOfEnlightenment:   {act: 'skillBonus', c: 0.25,  e: 1.5},
    marlettoTower:            {act: 'skillBonus', c: 0.25,  e: 1.5},
    mercenaryCamp:            {act: 'skillBonus', c: 0.25,  e: 1.5},
    scholar:                  {act: 'skillBonus', c: 0.25,  e: 1.5},
    schoolOfMagic:            {act: 'skillBonus', c: 0,     e: 1},
    schoolOfWar:              {act: 'skillBonus', c: 0,     e: 1},
    shrineOfMagicGesture:     {act: 'skillBonus', c: 0.5,   e: 1, ignore: noSpellBook},
    shrineOfMagicIncantation: {act: 'skillBonus', c: 0.5,   e: 1, ignore: noSpellBook},
    shrineOfMagicThought:     {act: 'skillBonus', c: 0.5,   e: 1, ignore: noSpellBook},
    starAxis:                 {act: 'skillBonus', c: 0.25,  e: 1.5},
    treeOfKnowledge:          {act: 'skillBonus', c: 0.25,  e: 1,
                               ignore: function (h) { return h.get('level') < 6 }},
    university:               {act: 'skillBonus', c: 0,     e: 1},
    witchHut:                 {act: 'skillBonus', c: 0.5,   e: 0.5},
  }

  return AI
})