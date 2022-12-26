define(['Common', 'AI', 'Calculator'], function (Common, BaseAI, Calculator) {
  "use strict"
  var _ = Common._

  return BaseAI.Combat.extend('HeroWO.H3.AI.Trivial.Combat', {
    state: null,

    _opt: {
      trace: false,
      rejectSurrender: false,
      enemyCrossed: null,   // internal
      surrenderAskRound: -Infinity,   // internal
      retreatRound: -Infinity,   // internal
    },

    _initToOpt: {
      state: '.',
    },

    events: {
      init: function () {
        // Surrender is always accepted by AI in SoD.
        // XXX decision should be based on ally/enemy strength ratio
        this.set('rejectSurrender', !this.cx.get('classic') && !_.random(1))
      },

      render: function () {
        if (this.get('trace') && this.get('trace') && _.log) {
          _.log('AI P%d C%s: init combat', this.player.get('player'), this.combat._parentKey)
          this.combat.parties.forEach(function (party) {
            _.log('AI P%d C%s:   party %s P%d %d : %s', this.player.get('player'), this.combat._parentKey, party._parentKey, party.player.get('player'), party.object && party.object.get('id'), party.map(function (cr) { return _.format('%s: %d × %d %s', cr._parentKey, cr.get('count'), cr.get('creature'), this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'nameSingular', 0)) }, this).join(', '))
          }, this)
        }

        this.autoOff(this.state, {
          change_creature: Common.batchGuard(2, function () {
            if (this.state.get('creature')) {
              if (this.state.get('phase') == 'tactics') {
                // XXX=I
                this.do('tacticsEnd')
              } else if (this.state.canControl()) {
                this._controlCreature()
              }
            }
          }),
        })

        if (this.state.canControl()) {
          this._controlCreature()
        }

        this.combat.get('state') == 'init' && this.do('ready')
      },

      '-_transition': function (transition) {
        switch (transition.get('type')) {
          case 'combatSurrenderAsk':
            if (this.combat.parties.nested(transition.get('decisionMaker')).player == this.player) {
              this.do('surrenderAccept', {
                party: transition.get('party'),
                reject: this.get('rejectSurrender'),
              })
                .whenError(function (async) {
                  _.log && _.log('AI P%d C%s:   ...cannot accept surrender : %j', this.player.get('player'), this.combat._parentKey, async.errorResult)
                }, this)
            }
            return
        }
      },
    },

    // XXX=R
    //
    // XXX This is using databank stats (rules) for speed, instead of factual combat values. Should be revised in the future, once calculators are fast enough.
    _controlCreature: function () {
      var log = this.get('trace') && _.log
      //log = _.oldLog
      var creature = this.state.get('creature')
      var atter = this.rules.creatures.atter(['nameSingular', 'aiValue', 'shooting', 'damageGroup', 'speed', 'strikes', 'damageMin', 'damageMax', 'attack', 'defense', 'hitPoints', 'win'])

      log && log('AI P%d C%s: begin control creature on round %d : %s %s', this.player.get('player'), this.combat._parentKey, this.combat.get('round'), creature._parentKey, this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'nameSingular', 0))

      log && log('AI P%d C%s:   examining enemy creatures', this.player.get('player'), this.combat._parentKey)

      var enemies = []
      var ownStrength = 0
      var enemyStrength = 0
      var ownShooter
      var ownShooterStrength = 0
      var enemyShooterStrength = 0

      function isRegular(info) {
        return (!info.damageGroup || info.shooting) &&   // wall and not tower
               info.strikes !== 0     // Catapult
      }

      creature.party.each(function (own) {
        var info = atter(own.get('creature'), 0, 0, 0)
        if (!isRegular(info)) { return }

        ownStrength += info.aiValue * own.get('count')

        if (info.shooting) {
          ownShooterStrength += info.aiValue * own.get('count')

          if (!ownShooter || ownShooter.aiValue * ownShooter.object.get('count') < info.aiValue * own.get('count')) {
            ownShooter = _.extend(info, {object: own})
          }
        }
      }, this)

      this.combat.parties.each(function (party) {
        if (party.player.get('team') != this.player.get('team')) {
          party.each(function (enemy) {
            var info = atter(enemy.get('creature'), 0, 0, 0)
            if (!isRegular(info)) { return }

            enemyStrength += info.aiValue * enemy.get('count')
            if (info.shooting) {
              enemyShooterStrength += info.aiValue * enemy.get('count')
            }

            var checkDamage = function (spot, shoot) {
              if (info.damage = this.state.attackTargets.damageRange(enemy, spot, !shoot)) {
                info.damage[0] *= creature.get('strikes')
                info.damage[1] *= creature.get('strikes')
                info.damage.spot = spot
                info.damage.shoot = shoot
              }
            }.bind(this)

            if (this.state.get('canShoot')) {
              checkDamage(creature.getSet(['x', 'y']), true)
            }

            if (!info.damage) {
              checkDamage(creature.getSet(['x', 'y']), false)

              // XXX=R duplicates with _updateAttackable; XXX=R slow
              _.some(this.state.aroundDeepStand(enemy.get('x'), enemy.get('y'), 1, 0, enemy.get('width'), creature.get()), function (item) {
                return info.damage || checkDamage(item, false)
              })
            }

            info.strikes = info.strikes || 1    // databank default
            info.totalHP = info.hitPoints * (enemy.get('count') - 1) + enemy.get('hitPoints')
            info.object = enemy
            enemies.push(info)
          }, this)
        }
      }, this)

      if (enemyStrength > ownStrength) {
        log && log('AI P%d C%s:   use spell book: enemies are (%.-1fX) stronger (%d) than I (%d)', this.player.get('player'), this.combat._parentKey, enemyStrength / ownStrength, enemyStrength, ownStrength)
        var cast = this._castSpell(
          enemies,
          enemyStrength > ownStrength * 2 /*as with surrender*/,
          function () {
            if (creature == this.state.update().get('creature')) {
              this._controlCreature()
            }
          }
        )
        if (cast) { return }
      }

      switch (creature.get('special')) {
        case this.rules.constants.creature.special.catapult:
        case this.rules.constants.creature.special.firstAidTent:
          // XXX=RH
          return this.rpc._controlCreature(this.combat, creature)
      }

      enemies.forEach(function (enemy) {
        // If can reach, attack the one who will suffer the most damage,
        // favouring shooters. If can't reach, move towards the most vulnerable
        // (lowest attack and defense), again favouring shooters.
        //
        // "Favouring" means we'd have to deal over 3 times more damage to
        // a melee enemy than to a ranged for the melee to be selected.
        enemy.sort = {}
        enemy.sort.mul = !!enemy.shooting * 2 + 1
        //enemy.win || (enemy.sort.mul /= 3)
        enemy.win || (enemy.sort.mul = 0)
        enemy.sort.damage = enemy.damage
          ? (enemy.damage[0] + enemy.damage[1]) / 2  // strikes added by checkDamage()
          : Math.max(0, 1000 - enemy.attack - enemy.defense)
        // Account for enemy's count. If we can deal 100 damage but enemy has
        // just 3 units in stack, each with 10 HP then we actually deal 30 damage,
        // so better look for other candidates.
        //
        // Logically thinking, we should also cap if cannot reach for attack (!enemy.damage) but I'm not sure how. XXX
        enemy.sort.cap = enemy.damage ? enemy.totalHP : Infinity
        enemy.sort.value = enemy.sort.mul * Math.min(enemy.sort.damage, enemy.sort.cap)
      })

      enemies.sort(function (a, b) {
        // It only makes sense to compare creatures that can be both attacked or
        // both not attacked due to different value calculation.
        if (!a.damage ^ !b.damage) {
          return a.damage ? -1 : +1
        }
        return (b.sort.value - a.sort.value) ||
               Common.compare(a.object._cid, b.object._cid)
      }.bind(this))

      if (log) {
        log('AI P%d C%s:   found %d enemy creatures, in order of preference : %s', this.player.get('player'), this.combat._parentKey, enemies.length, _.pluck(_.pluck(enemies, 'object'), '_parentKey').join(' '))

        enemies.forEach(function (enemy, i) {
          log('AI P%d C%s:   %2d. P%d %2s %3d × %-15s   %s, AI value %4d, nominal damage %2d-%2d, %d strikes,',
            this.player.get('player'),
            this.combat._parentKey,
            i + 1,
            enemy.object.party.player.get('player'),
            enemy.object._parentKey,
            enemy.object.get('count'),
            enemy.nameSingular,
            enemy.shooting ? 'shoot' : 'melee',
            enemy.aiValue,
            enemy.damageMin,
            enemy.damageMax,
            enemy.strikes)

          log('AI P%d C%s:       attack %2d, defense %2d, %2d speed, HP %3d (%4d), %s, sort %d=%.-1f*%d|%d',
            this.player.get('player'),
            this.combat._parentKey,
            enemy.attack,
            enemy.defense,
            enemy.speed,
            enemy.hitPoints,
            enemy.totalHP,
            enemy.win ? 'wins' : 'does not win',
            enemy.sort.value,
            enemy.sort.mul,
            enemy.sort.damage,
            enemy.sort.cap)

          enemy.damage && log('AI P%d C%s:       can %s from (%d:%d) for %d-%d damage',
            this.player.get('player'),
            this.combat._parentKey,
            enemy.damage.shoot ? 'shoot' : 'strike',
            enemy.damage.spot[0],
            enemy.damage.spot[1],
            enemy.damage[0],
            enemy.damage[1])
        }, this)
      }

      if (enemyStrength > ownStrength * 2) {
        log && log('AI P%d C%s:   offering surrender: enemies are much (%.-1fX) stronger (%d) than I (%d)', this.player.get('player'), this.combat._parentKey, enemyStrength / ownStrength, enemyStrength, ownStrength)

        if (this.cx.get('classic')) {
          log && log('AI P%d C%s:   ...or not - classic mode', this.player.get('player'), this.combat._parentKey)
        } else if (this.get('surrenderAskRound') + 2 < this.combat.get('round')) {
          this.set('surrenderAskRound', this.combat.get('round'))

          return this.do('surrenderAsk')
            .whenError(function (async) {
              log && log('AI P%d C%s:   ...surrender declined : %j', this.player.get('player'), this.combat._parentKey, async.errorResult)
              if (creature == this.state.update().get('creature')) {
                this._controlCreature()
              }
            }, this)
        } else {
          log && log('AI P%d C%s:   ...or not - already tried recently (in round %d); trying to flee', this.player.get('player'), this.combat._parentKey, this.get('surrenderAskRound'))
        }

        // If have one creature, its strength may be high to allow retreat. If two then they must be two times weaker as the strongest creature allowed for retreat in single creature mode. If three then three times, etc. As a special case, also allow retreat if have just one creature with 1 count in stack no matter how strong it is (aside from general check for army strength above).
        //
        // Practically, allow retreat if remain with 2 Monks (750 value each), 4 Swordsmen (445), 5 Griffins (351), 12 Archers (126), 19 Pikemen (80).
        if (ownStrength / this.state.get('interactive').length > 1500 && (this.state.get('interactive').length > 1 || this.state.get('interactive').toArray()[0].get('count') > 1)) {
          log && log('AI P%d C%s:   ...or not - remaining forces are strong enough to try to deal some damage before fleeing', this.player.get('player'), this.combat._parentKey)
        } else if (!this.player.towns.length && this.player.heroes.length == 1) {
          log && log('AI P%d C%s:   ...or not - got no towns and last hero', this.player.get('player'), this.combat._parentKey)
        } else if (this.get('retreatRound') < this.combat.get('round')) {
          this.set('retreatRound', this.combat.get('round'))

          return this.do('retreat')
            .whenError(function (async) {
              log && log('AI P%d C%s:   ...couldn\'t flee : %j', this.player.get('player'), this.combat._parentKey, async.errorResult)
              if (creature == this.state.update().get('creature')) {
                this._controlCreature()
              }
            }, this)
        } else {
          log && log('AI P%d C%s:   ...or not - already tried recently (in round %d); carrying on', this.player.get('player'), this.combat._parentKey, this.get('retreatRound'))
        }
      }

      var attack = enemies[0]

      if (attack.damage) {
        log && log('AI P%d C%s:   going to attack : %s %s', this.player.get('player'), this.combat._parentKey, attack.object._parentKey, attack.nameSingular)
        return this.do(attack.damage.shoot ? 'shoot' : 'melee', {
          target: attack.object._parentKey,
          fromSpot: attack.damage.spot,
        })
          .whenSuccess(function () {
            // High morale, etc.
            if (creature == this.state.update().get('creature')) {
              this._controlCreature()
            }
          }, this)
      }

      log && log('AI P%d C%s:   can\'t attack anyone from current spot; top enemy ranked : %s %s', this.player.get('player'), this.combat._parentKey, attack.object._parentKey, attack.nameSingular)

      var moveTowards = attack.object.getSet(['x', 'y'])

      if (ownShooterStrength < 1000) {
        // Not good enough!
      } else if (enemyShooterStrength > ownShooterStrength) {
        log && log('AI P%d C%s:   offence mode: my shooters are not much (%.-1fX) stronger (%d) than enemies\' (%d) : %s %s', this.player.get('player'), this.combat._parentKey, ownShooterStrength / enemyShooterStrength, ownShooterStrength, enemyShooterStrength, ownShooter.object._parentKey, ownShooter.nameSingular)
      } else {
        log && log('AI P%d C%s:   defence mode: my shooters are much (%.-1fX) stronger (%d) than enemies\' (%d) : %s %s', this.player.get('player'), this.combat._parentKey, ownShooterStrength / enemyShooterStrength, ownShooterStrength, enemyShooterStrength, ownShooter.object._parentKey, ownShooter.nameSingular)

        if (this.get('enemyCrossed')) {
          log && log('AI P%d C%s:   ...or not - enemy has crossed my side on round %d', this.player.get('player'), this.combat._parentKey, this.get('enemyCrossed'))
        } else {
          var wd2 = this.combat.get('width') / 2
          var hd2 = this.combat.get('height') / 2

          var found = enemies.find(function (enemy) {
            var x = enemy.object.get('x')
            var y = enemy.object.get('y')

            switch (creature.party.get('placement')) {
              case 't':
                return y < hd2
              case 'b':
                return y > hd2
              case 'l':
                return x < wd2
              case 'r':
                return x > wd2
              default:
                return true     // corners, middle, etc.
            }
          })

          if (found) {
            log && log('AI P%d C%s:   ...or not - enemy is already on my side : %s %s', this.player.get('player'), this.combat._parentKey, found.object._parentKey, found.nameSingular)
            this.set('enemyCrossed', this.combat.get('round'))
          } else {
            if (this.combat.get('round') > 10) {
              this.set('enemyCrossed', -this.combat.get('round'))
            }
            var moveTowards = ownShooter.object.getSet(['x', 'y'])
          }
        }
      }

      if (moveTowards) {
        log && log('AI P%d C%s:   going to move towards (%d:%d)', this.player.get('player'), this.combat._parentKey, moveTowards[0], moveTowards[1])

        // Check if exactly the target spot is reachable, and if not then start checking nearby spots, farther and farther.
        var path = this.state.findPath(creature.getSet(['x', 'y']), moveTowards, Infinity)
        var checked = {}

        for (var depth = 1; !path && depth <= 3; depth++) {
          var around = this.state.aroundDeepStand(moveTowards[0], moveTowards[1], depth, null, creature.get('width'), creature.get())

          _.some(around, function (item) {
            if (!checked[item.join()]) {
              checked[item.join()] = true
              return path =
                (item[0] == creature.get('x') && item[1] == creature.get('y')) ||
                this.state.findPath(creature.getSet(['x', 'y']), item, Infinity)
            }
          }, this)
        }

        if (!path) {
          log && log('AI P%d C%s:   ...or not - unreachable', this.player.get('player'), this.combat._parentKey)
        } else if (path === true) {
          log && log('AI P%d C%s:   ...or not - already there or nearby', this.player.get('player'), this.combat._parentKey)
        } else {
          var last = _.last(path)
          if (last.slice(0, 2).join() != moveTowards.join()) {
            log && log('AI P%d C%s:   ...adjusted to (%d:%d)', this.player.get('player'), this.combat._parentKey, last[0], last[1])
          }

          log && log('AI P%d C%s:   ...move route: %s', this.player.get('player'), this.combat._parentKey, path.map(function (item) { return '(' + item[0] + ':' + item[1] + ')' }).join(' -> '))

          // Determine farthest path segment that creature can move to given its speed.
          var spot = path.reverse().find(function (item) {
            return this.state.pathTo(item[3])
          }, this)

          return this.do('move', {
            destination: spot,
          })
            .whenSuccess(function () {
              if (creature == this.state.update().get('creature')) {
                this._controlCreature()
              }
            }, this)
        }
      }

      log && log('AI P%d C%s:   ran out of options - will defend', this.player.get('player'), this.combat._parentKey)

      this.do('defend')
    },

    // XXX=R
    //
    // XXX=I check immunities when estimating targets
    //
    // XXX=I currently spells are checked in fixed order; they should be examined all together, sorted and best chosen based on damage to SP ratio (e.g. if spell A deals 10 damage and costs 5 SP while B deals 15 damage and costs 10 SP then A is better because for 10 SP during 2 turns we inflict 20 damage, not 15)
    _castSpell: function (enemies, allCost, done) {
      var log = this.get('trace') && _.log
      //log = _.oldLog
      var async

      if (!this.state.get('interactive').object) {
        log && log('AI P%d C%s:   ...or not - no hero present', this.player.get('player'), this.combat._parentKey)
        return
      }

      if (!this.state.get('interactive').object.get('combatCasts')) {
        log && log('AI P%d C%s:   ...or not - already cast this round', this.player.get('player'), this.combat._parentKey)
        return
      }

      var spells = this.cx.oneShotEffectCalculation({
        class: Calculator.Effect.GenericIntArray,
        target: this.map.constants.effect.target.hero_spells,
        ifCombat: this.combat._parentKey,
        ifCombatParty: this.state.get('interactive')._parentKey,
      })

      if (!spells.length) {
        log && log('AI P%d C%s:   ...or not - no spells', this.player.get('player'), this.combat._parentKey)
        return
      }

      if (log) {
        var str = spells
          .sort()
          .map(function (spell) {
            return spell + ' ' + this.rules.spells.atCoords(spell, 0, 0, 'name', 0)
          }, this)
          .join(', ')

        log('AI P%d C%s:     got %d spell points and %d spells: %s', this.player.get('player'), this.combat._parentKey, this.state.get('interactive').object.get('spellPoints'), spells.length, str)
      }

      enemies = _.filter(enemies, Common.p('win'))

      var ids = this.rules.spellsID
      spells = _.flip(spells)

      var canCast = function (spell, minDuration) {
        if (!async && spell in spells) {
          var res = this.cx.oneShotEffectCalculation({
            target: this.map.constants.effect.target.spellCost,
            ifCombat: this.combat._parentKey,
            ifCombatParty: this.state.get('interactive')._parentKey,
            ifSpell: spell,
          })
          if (res <= this.state.get('interactive').object.get('spellPoints')) {
            if (minDuration) {
              var duration = this.cx.oneShotEffectCalculation({
                target: this.map.constants.effect.target.spellDuration,
                ifCombat: this.combat._parentKey,
                ifCombatParty: this.state.get('interactive')._parentKey,
                ifSpell: spell,
              })
              if (duration < minDuration) { return }
            }
            return true
          }
        }
      }.bind(this)

      // XXX this is necessary until databank access here is replaced by calculating actual values so e.g. after applying slow the target's speed will drop so much that normal speed threshold check will (?) suffice
      var haveEffect = function (obj, spell, target) {
        var calc = this.cx.oneShotEffectCalculator({
          target: target,
          ifCombat: this.combat._parentKey,
          ifCombatCreature: obj._parentKey,
        }).takeRelease()
        return calc.get('affectors').some(function (n) {
          var src = this.cx.map.effects.atContiguous(n + this.cx.map.effects.propertyIndex('source'), 0)
          return src && src[0] == this.cx.map.constants.effect.source.spell && spell == src[1]
        }, this)
      }.bind(this)

      if (canCast(ids.chainLightning)) {
        var allies = 0
        this.combat.parties.each(function (party) {
          allies += party.player.get('team') == this.player.get('team') ? party.length : 0
        }, this)

        // XXX this is under assumption chain lightning strikes random creatures (as it currently does)
        if (enemies.length / allies > 1.2 || allCost) {
          log && log('AI P%d C%s:     Chain Lightning is good, enemy creatures are more (%.-1fX) numerous (%d) than allied (%d)', this.player.get('player'), this.combat._parentKey, enemies.length / allies, enemies.length, allies)
          async = this.do('cast', {
            spell: ids.chainLightning,
            // XXX this uses enemies order which is dependent on current creature and, for example, a less suitable enemy may be ranked top because it's within current creature's reach
            target: enemies[0].object._parentKey,
          })
        } else {
          log && log('AI P%d C%s:     Chain Lightning is nah, enemy creatures are not too (%.-1fX) numerous (%d) than allied (%d)', this.player.get('player'), this.combat._parentKey, enemies.length / allies, enemies.length, allies)
        }
      }

      var castArrow = function (spell) {
        if (canCast(spell)) {
          var damage = this.cx.oneShotEffectCalculation({
            target: this.map.constants.effect.target.spellEfficiency,
            ifCombat: this.combat._parentKey,
            ifCombatParty: this.state.get('interactive')._parentKey,
            ifSpell: spell,
          })

          var sorted = enemies.concat().sort(function (a, b) {
            var aDiff = a.totalHP - damage
            var bDiff = b.totalHP - damage
            if ((aDiff >= 0) ^ (bDiff >= 0)) {
              return aDiff >= 0 ? -1 : +1
            }
            if (aDiff >= 0) {   // both >= 0
              // Prioritize based on how many creatures perish, not only damage lost because this is permanent unlike mere HP reduction of top stack unit.
              function est(cr) {
                var hp = cr.object.get('hitPoints')
                return hp <= damage ? 1 + Math.floor((damage - hp) / cr.hitPoints) : 0
              }
              return est(b) - est(a) ||
                     b.aiValue - a.aiValue ||
                     Common.compare(a.object._cid, b.object._cid)
            }
            return -aDiff - -bDiff ||
                   Common.compare(a.object._cid, b.object._cid)
          })

          var first = sorted[0]

          if (damage - first.totalHP < 30 || allCost) {
            log && log('AI P%d C%s:     %s is good, of %d damage %d lost (%d%%) : %s %s', this.player.get('player'), this.combat._parentKey, this.rules.spells.atCoords(spell, 0, 0, 'name', 0), damage, Math.max(0, damage - first.totalHP), (damage - first.totalHP) / damage * 100, first.object._parentKey, sorted[0].nameSingular)
            return async = this.do('cast', {
              spell: spell,
              target: first.object._parentKey,
            })
          } else {
            log && log('AI P%d C%s:     %s is nah, of %d damage %d lost (%d%%) : %s %s', this.player.get('player'), this.combat._parentKey, this.rules.spells.atCoords(spell, 0, 0, 'name', 0), damage, Math.max(0, damage - first.totalHP), (damage - first.totalHP) / damage * 100, first.object._parentKey, sorted[0].nameSingular)
          }
        }
      }.bind(this)

      castArrow(ids.titanBolt)
      castArrow(ids.implosion)
      castArrow(ids.lightningBolt)
      castArrow(ids.iceBolt)
      // magicArrow is checked later.

      ;[ids.fireball, ids.frostRing, ids.inferno, ids.meteorShower]
        .forEach(function (spell) {
          if (canCast(spell)) {
            var around = this.cx.oneShotEffectCalculation({
              target: this.map.constants.effect.target.spellAround,
              ifCombat: this.combat._parentKey,
              ifCombatParty: this.state.get('interactive')._parentKey,
              ifSpell: spell,
            })

            var eye = this.cx.oneShotEffectCalculation({
              target: this.map.constants.effect.target.spellAroundEye,
              ifCombat: this.combat._parentKey,
              ifCombatParty: this.state.get('interactive')._parentKey,
              ifSpell: spell,
            })

            var sorted = []

            // XXX for simplicity only check casting with eye = enemy's spot; there may be more optimal cases when casting spot is shifted but they are not checked
            enemies.forEach(function (enemy) {
              var enemyDamage = 0
              var allyDamage = 0

              // XXX=R duplicates with H3.Rules.RPC
              var cells = this.state.aroundDeep(enemy.object.get('x'), enemy.object.get('y'), around, eye - 1)
              _.each(cells, function (box, n) {
                this.combat.bySpot.findAtContiguous(n, function (key) {
                  var obj = this.combat.objects.nested(key)
                  if (obj.constructor.name == 'HeroWO.Map.Combat.Creature' &&
                      !this.rules.creatures.atCoords(obj.get('creature'), 0, 0, 'damageGroup', 0)) {
                    var damage = this.cx.oneShotEffectCalculation({
                      target: this.map.constants.effect.target.spellEfficiency,
                      ifCombat: this.combat._parentKey,
                      ifCombatParty: this.state.get('interactive')._parentKey,
                      ifSpell: spell,
                      ifTargetCombatCreature: obj._parentKey,
                    })
                    damage = Math.min(damage, this.rules.creatures.atCoords(obj.get('creature'), 0, 0, 'hitPoints', 0) * (obj.get('count') - 1) + obj.get('hitPoints'))
                    if (obj.party.player.get('team') == this.player.get('team')) {
                      allyDamage += damage
                    } else {
                      enemyDamage += damage
                    }
                  }
                }, this)
              }, this)

              sorted.push([enemy, enemyDamage, allyDamage])
            }, this)

            sorted.sort(function (a, b) {
              var ar = a[1] / a[2]
              var br = b[1] / b[2]
              if (ar >= 3 && br >= 3) {
                return b[1] - a[1]
              } else {
                return ar >= 3 ? -1 : br >= 3 ? +1 : 0 // don't care for < 3
              }
            })

            if (sorted[0][1] / sorted[0][2] >= 3 || allCost) {
              log && log('AI P%d C%s:     %s is good, %d enemy damage (%.-1fX), %d ally damage : %s %s', this.player.get('player'), this.combat._parentKey, this.rules.spells.atCoords(spell, 0, 0, 'name', 0), sorted[0][1], sorted[0][1] / sorted[0][2], sorted[0][2], sorted[0][0].object._parentKey, sorted[0][0].nameSingular)
              return async = this.do('cast', {
                spell: spell,
                target: sorted[0][0].object.getSet(['x', 'y']),
              })
            } else {
              log && log('AI P%d C%s:     %s is nah, %d enemy damage (%.-1fX), %d ally damage : %s %s', this.player.get('player'), this.combat._parentKey, this.rules.spells.atCoords(spell, 0, 0, 'name', 0), sorted[0][1], sorted[0][1] / sorted[0][2], sorted[0][2], sorted[0][0].object._parentKey, sorted[0][0].nameSingular)
            }
          }
        }, this)

      if (canCast(ids.armageddon)) {
        var damage = this.cx.oneShotEffectCalculation({
          target: this.map.constants.effect.target.spellEfficiency,
          ifCombat: this.combat._parentKey,
          ifCombatParty: this.state.get('interactive')._parentKey,
          ifSpell: ids.armageddon,
        })
        // XXX=R may be merged with fireball's calculations
        var enemyDamage = 0
        var allyDamage = 0
        this.combat.parties.each(function (party) {
          party.each(function (obj) {
            var d = Math.min(damage, this.rules.creatures.atCoords(obj.get('creature'), 0, 0, 'hitPoints', 0) * (obj.get('count') - 1) + obj.get('hitPoints'))
            if (obj.party.player.get('team') == this.player.get('team')) {
              allyDamage += d
            } else {
              enemyDamage += d
            }
          }, this)
        }, this)

        if (enemyDamage / allyDamage >= 3 || allCost) {
          log && log('AI P%d C%s:     Armageddon is good, %d enemy damage (%.-1fX), %d ally damage', this.player.get('player'), this.combat._parentKey, enemyDamage, enemyDamage / allyDamage, allyDamage)
          return async = this.do('cast', {
            spell: ids.armageddon,
          })
        } else {
          log && log('AI P%d C%s:     Armageddon is nah, %d enemy damage (%.-1fX), %d ally damage', this.player.get('player'), this.combat._parentKey, enemyDamage, enemyDamage / allyDamage, allyDamage)
        }
      }

      ;[ids.deathRipple, ids.destroyUndead]
        .forEach(function (spell, damagesUndead) {
          if (canCast(spell)) {
            var damage = this.cx.oneShotEffectCalculation({
              target: this.map.constants.effect.target.spellEfficiency,
              ifCombat: this.combat._parentKey,
              ifCombatParty: this.state.get('interactive')._parentKey,
              ifSpell: spell,
            })
            // XXX=R may be merged with fireball's calculations
            var enemyDamage = 0
            var allyDamage = 0
            this.combat.parties.each(function (party) {
              party.each(function (obj) {
                var d = Math.min(damage, this.rules.creatures.atCoords(obj.get('creature'), 0, 0, 'hitPoints', 0) * (obj.get('count') - 1) + obj.get('hitPoints'))
                var u = this.rules.creatures.atCoords(obj.get('creature'), 0, 0, 'undead', 0)
                if (u && !--u == !damagesUndead) {
                  if (obj.party.player.get('team') == this.player.get('team')) {
                    allyDamage += d
                  } else {
                    enemyDamage += d
                  }
                }
              }, this)
            }, this)

            if (enemyDamage / allyDamage >= 3 || allCost) {
              log && log('AI P%d C%s:     %s is good, %d enemy damage (%.-1fX), %d ally damage', this.player.get('player'), this.combat._parentKey, this.rules.spells.atCoords(spell, 0, 0, 'name', 0), enemyDamage, enemyDamage / allyDamage, allyDamage)
              return async = this.do('cast', {
                spell: spell,
              })
            } else {
              log && log('AI P%d C%s:     %s is nah, %d enemy damage (%.-1fX), %d ally damage', this.player.get('player'), this.combat._parentKey, this.rules.spells.atCoords(spell, 0, 0, 'name', 0), enemyDamage, enemyDamage / allyDamage, allyDamage)
            }
          }
        }, this)

      if (canCast(ids.bless, 2)) {
        var sorted = []
        this.state.get('interactive').each(function (creature) {
          if (haveEffect(creature, ids.bless, this.rules.constants.effect.target.creature_damageMin)) {
            return
          }
          var res = {
            object: creature,
            damageMin: this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'damageMin', 0),
            damageMax: this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'damageMax', 0),
            strikes: this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'strikes', 0) || 1,    // databank default
          }
          res.diff = (res.damageMax - res.damageMin) * res.strikes * creature.get('count')
          sorted.push(res)
        }, this)
        sorted.sort(function (a, b) {
          return b.diff - a.diff || Common.compare(a.object._cid, b.object._cid)
        })

        if (sorted[0] && sorted[0].diff >= 40) {
          log && log('AI P%d C%s:     Bless is good, add %d damage : %s %s', this.player.get('player'), this.combat._parentKey, sorted[0].diff, sorted[0].object._parentKey, this.rules.creatures.atCoords(sorted[0].object.get('creature'), 0, 0, 'nameSingular', 0))
          async = this.do('cast', {
            spell: ids.bless,
            target: sorted[0].object._parentKey,
          })
        } else if (sorted[0]) {
          log && log('AI P%d C%s:     Bless is nah, add %d damage : %s %s', this.player.get('player'), this.combat._parentKey, sorted[0].diff, sorted[0].object._parentKey, this.rules.creatures.atCoords(sorted[0].object.get('creature'), 0, 0, 'nameSingular', 0))
        } else {
          log && log('AI P%d C%s:     Bless is nah, everyone Blessed', this.player.get('player'), this.combat._parentKey)
        }
      }

      if (canCast(ids.curse, 2)) {
        var sorted = enemies.concat()
          .filter(function (enemy) {
            return !haveEffect(enemy.object, ids.curse, this.rules.constants.effect.target.creature_damageMax)
          }, this)
          .map(function (enemy) {
            return _.extend({}, enemy, {
              diff: (enemy.damageMax - enemy.damageMin) * enemy.strikes * enemy.object.get('count'),
            })
          })
          .sort(function (a, b) {
            return b.diff - a.diff || Common.compare(a.object._cid, b.object._cid)
          })

        if (sorted[0].diff >= 40) {
          log && log('AI P%d C%s:     Curse is good, remove %d damage : %s %s', this.player.get('player'), this.combat._parentKey, sorted[0].diff, sorted[0].object._parentKey, sorted[0].nameSingular)
          async = this.do('cast', {
            spell: ids.curse,
            target: sorted[0].object._parentKey,
          })
        } else if (sorted[0]) {
          log && log('AI P%d C%s:     Curse is nah, remove %d damage : %s %s', this.player.get('player'), this.combat._parentKey, sorted[0].diff, sorted[0].object._parentKey, sorted[0].nameSingular)
        } else {
          log && log('AI P%d C%s:     Curse is nah, everyone Cursed', this.player.get('player'), this.combat._parentKey)
        }
      }

      if (canCast(ids.haste, 2)) {
        var found = enemies.some(Common.p('shooting'))
        if (!found) {
          log && log('AI P%d C%s:     Haste is nah, enemies can\'t shoot', this.player.get('player'), this.combat._parentKey)
        } else {
          var sorted = []
          this.state.get('interactive').each(function (creature) {
            var res = {
              object: creature,
              aiValue: this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'aiValue', 0),
              speed: this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'speed', 0),
              strikes: this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'strikes', 0) || 1,    // databank default
              shooting: this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'shooting', 0),
            }
            if (res.speed < 10 && !res.shooting && !haveEffect(creature, ids.haste, this.rules.constants.effect.target.creature_speed)) {
              res.value = res.aiValue * res.strikes * creature.get('count')
              sorted.push(res)
            }
          }, this)
          sorted.sort(function (a, b) {
            return b.value - a.value || Common.compare(a.object._cid, b.object._cid)
          })

          if (sorted[0] && sorted[0].value >= 3000) {
            log && log('AI P%d C%s:     Haste is good, enemies can shoot : %s %s', this.player.get('player'), this.combat._parentKey, sorted[0].object._parentKey, this.rules.creatures.atCoords(sorted[0].object.get('creature'), 0, 0, 'nameSingular', 0))
            async = this.do('cast', {
              spell: ids.haste,
              target: sorted[0].object._parentKey,
            })
          } else {
            log && log('AI P%d C%s:     Haste is nah, enemy can shoot but got no strong slow melee creatures', this.player.get('player'), this.combat._parentKey)
          }
        }
      }

      if (canCast(ids.slow, 2)) {
        var found = this.state.get('interactive').some(function (creature) {
          return this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'shooting', 0)
        }, this)

        if (!found) {
          log && log('AI P%d C%s:     Slow is nah, I don\'t shoot', this.player.get('player'), this.combat._parentKey)
        } else {
          var sorted = enemies.concat()
            .filter(function (enemy) {
              return enemy.speed >= 6 && !enemy.shooting && !haveEffect(enemy.object, ids.slow, this.rules.constants.effect.target.creature_speed)
            }, this)
            .sort(function (a, b) {
              return b.speed - a.speed || Common.compare(a.object._cid, b.object._cid)
            })

          if (sorted[0]) {
            log && log('AI P%d C%s:     Slow is good, I can shoot : %s %s', this.player.get('player'), this.combat._parentKey, sorted[0].object._parentKey, sorted[0].nameSingular)
            async = this.do('cast', {
              spell: ids.slow,
              target: sorted[0].object._parentKey,
            })
          } else {
            log && log('AI P%d C%s:     Slow is nah, I can shoot but got no fast enemies, or all overly fast', this.player.get('player'), this.combat._parentKey)
          }
        }
      }

      castArrow(ids.magicArrow)

      if (async) {
        return async.whenSuccess(function () {
          // Recalculate enemies.
          log && log('AI P%d C%s:   spell cast, continue combat : %s', this.player.get('player'), this.combat._parentKey, this.rules.spells.atCoords(async.get('args').spell, 0, 0, 'name', 0))
          done.call(this)
        }, this)
      } else {
        log && log('AI P%d C%s:   cast nothing, continue combat', this.player.get('player'), this.combat._parentKey)
      }
    },
  })
})