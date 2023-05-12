define([
  'Common', 'ObjectStore', 'Calculator', 'Effects', 'Shroud.Effects',
  'H3.Databank', 'H3.Rules.RPC', 'H3.Combat',
  'H3.AI.Trivial', 'H3.AI.Nop',
], function (
  Common, ObjectStore, Calculator, Effects, Shroud,
  Databank, RpcMixIn, Combat,
  AI, AI_Nop
) {
  "use strict"
  var _ = Common._

  // XXX=R review H3.*.js Bits and Calcs to check if owner changes are correctly listened to

  //# Hierarchy of Calculator classes
  //
  // `[(A)`] = abstract class.
  //[
  // Sqimitive
  // +Calculator (A)
  // |\
  // | +Effect
  // | |\
  // | | +Effect.GenericNumber
  // | |\
  // | | +Effect.GenericString
  // | |\
  // | | +Effect.GenericBool
  // |  \
  // |   +Effect.GenericIntArray
  // |   |\
  // |   | +Effect.GenericStrArray
  // |    \
  // |     +Effect.GenericIntHash
  // |\
  // | +H3.PathCost.Calculator
  // |\
  // | +H3.ObjectHash
  // |\
  // | +H3.HeroSpecialty
  // |\
  // | +H3.HeroPortrait
  // |\
  // | +H3.TownPortrait
  // |\
  // | +H3.TownIncome
  // |\
  // | +H3.TownBuildingLevel
  // |  \
  // |   +H3.TownBuildingProperty
  // |\
  // | +H3.BuildingU
  // |  \
  // |   +H3.BuildingU.Image
  // |\
  // | +H3.TownCountByHall
  // |  \
  // |   +H3.TownCountByFort
  // |\
  // | +H3.ShipState
  // |\
  // | +H3.TownBuildingState
  // |\
  // | +H3.TownHallBuildings
  // |\
  // | +H3.TownBuildingsWithUpgraded
  // |\
  // | +H3.ProducingBuildings
  // |\
  // | +H3.TownBuildingRequirements
  // |\
  // | +H3.TownBuildingDescription
  // |\
  // | +H3.PlayerBuildingCount
  //  \
  //   +H3.SubclassProperty
  //]

  function UPD_INC(options) {
    return {update: options.partial}
  }

  // This holds H3-specific extensions to generic Calculator's methods.
  var CalcOverride = {
    // Performs H3-specific modifier operations for targets like cost of surrender, spell strength, chance of a specific hero appearing in a Tavern, requirements for a quest, etc.
    //
    // Most of these operations are used in base Effects defined in databank as [$custom, 'rules'], [$check, ...], etc.
    //
    // XXX=R
    _applyModifier: function (o, operation, params) {
      var schema = this._schema
      var consts = this._constants
      switch (operation) {
        case consts.operation.custom:
          if (params[0] == 'rules') {
            switch (o.subCalc(schema.target).value) {
              case consts.target.player_town:
                var player = o.subCalc(schema.ifPlayer).value
                return o.value = o.subCalc('player:' + player + ':town').value
              case consts.target.randomSigns:
                return o.value = this.rules.randomSigns.concat()
              case consts.target.randomRumors:
                return o.value = this.rules.randomRumors.concat()
              case consts.target.surrenderCan:
                var surrender = true
              case consts.target.retreatCan:
                // Return true if ifObject is a hero and is not defending a town
                // (i.e. both ifGarrisoned and ifVisiting are unset). For surrender, also check if player owns a town. Specifically allowing retreat if there are no towns and other heroes (player loses in this case; SoD behaviour).
                return o.value = o.subCalc(schema.ifObjectType).value == this.map.constants.object.type.hero && !o.subCalc(schema.ifGarrisoned).value && !o.subCalc(schema.ifVisiting).value && (!surrender || o.subCalc('owned:' + o.subCalc(schema.ifPlayer).value + ':towns').value)
              case consts.target.bonus_experience:
                // XXX=C This doesn't take into account hero_experienceGain (Learning skill). As a result, visiting Tree of Knowledge will add more experience than needed to reach the next level. Conversely, if hero_experienceGain is < 1 then Tree will give less experience and no level up will occur - but maybe this is actually a good feature? Regardless, need to check how Tree + Learning works in SoD.
                var exp = o.subCalc('object::' + this._shared.objects.experience).value
                var levelUps = this.map.constants.levelUps
                for (var i = 0; i < levelUps.length - 1; i++) {
                  if (levelUps[i] > exp) {
                    return o.value = levelUps[i]
                  }
                }
                for (var last = levelUps.slice(-2); last[0] <= exp; ) {
                  last[0] *= last[1]
                }
                return o.value = last[0]
              case consts.target.bonus_spellPoints:
              case consts.target.hero_spellPoints:
                return o.value = Math.max(10, o.subCalc('knowledge').calc.updateIfNeeded().get('value') * 10) // XXX=RH consts
              case consts.target.spellDuration:
                return o.value = o.subCalc('spellPower').calc.updateIfNeeded().get('value')
              case consts.target.spellCost:
                var spell = o.subCalc(schema.ifSpell).value
                var schools = this.rules.spells.atCoords(
                  spell, 0, 0,
                  this._shared.spells.schools,
                  0)
                var mastered = o.subCalc('schoolMastered').value
                if (!_.includes(schools || [], mastered)) { return }
                var skill = this._shared.schoolToSkill[mastered]
                return o.value = this.rules.spells.atCoords(
                  spell, 0, 0,
                  this._shared.spells.spellPoints + o.subCalc('skillMastery::' + skill).calc.updateIfNeeded().get('value'),
                  0)
              case consts.target.spellEfficiency:
                var spell = o.subCalc(schema.ifSpell).value
                var schools = this.rules.spells.atCoords(
                  spell, 0, 0,
                  this._shared.spells.schools,
                  0)
                var mastered = o.subCalc('schoolMastered').value
                if (!_.includes(schools || [], mastered)) { return }
                var skill = this._shared.schoolToSkill[mastered]
                var masteryBase = this.rules.spells.atCoords(
                  spell, 0, 0,
                  this._shared.spells.skillEffect + o.subCalc('skillMastery::' + skill).calc.updateIfNeeded().get('value'),
                  0)
                var spellPower = o.subCalc('spellPower').calc.updateIfNeeded().get('value')
                var powerBase = this.rules.spells.atCoords(
                  spell, 0, 0,
                  this._shared.spells.powerEffect,
                  0)
                o.value = powerBase * spellPower + masteryBase
                // spellEfficiency was verified only for spell IDs:
                //   2 15 16 17 18 19 20 21 22 23 24 25 26 27 28 30 31 32 33 34 35 37 41 42 43
                //   44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 61 66 67 68 69
                switch (spell) {
                  // For spells below, spellEfficiency's calculated value is a $modifier used directly in an Effect.
                  case this.rules.spellsID.protectionFromAir:
                  case this.rules.spellsID.protectionFromEarth:
                  case this.rules.spellsID.protectionFromFire:
                  case this.rules.spellsID.protectionFromWater:
                  case this.rules.spellsID.shield:
                  case this.rules.spellsID.airShield:
                  case this.rules.spellsID.frenzy:  // $modifier for % of defense to increase attack; doesn't affect defense
                  case this.rules.spellsID.slow:
                  case this.rules.spellsID.blind:   // if 0 then no counter
                    o.value /= 100.0001   // float-fix
                    break
                  // For spells below, value is 'count' of new (summoned) Creature.
                  case this.rules.spellsID.airElemental:
                  case this.rules.spellsID.earthElemental:
                  case this.rules.spellsID.fireElemental:
                  case this.rules.spellsID.waterElemental:
                    o.value *= spellPower
                    break
                  case this.rules.spellsID.visions:
                    // Number of cells (range).
                    o.value < 3 && (o.value = 3)
                  // For unlisted others, value is...
                  // - Dispel - spellEfficiency is N/A
                  // - Forgetfulness - spellEfficiency is N/A
                  // - antiMagic - spellEfficiency is N/A
                  // - Remove Obstacle - spellEfficiency is N/A
                  // - (C) - $modifier
                  // - (A) - damage points
                  // - (F) - damage points
                  // - (R) - damage points
                  // - Cure - HP restored
                  // - Bless - additional damage points granted over damageMax (not $modifier); however, Bless currently uses hardcoded modifiers (see [$custom, 'spell'] below)
                  // - Curse - as Bless
                  // - Prayer - $modifier (same for all three of attack/defense/speed)
                  // - other (B) - $modifier
                  // - other (C) - $modifier
                }
                switch (spell) {
                  case this.rules.spellsID.disruptingRay:
                  case this.rules.spellsID.misfortune:
                  case this.rules.spellsID.sorrow:
                  case this.rules.spellsID.weakness:
                    o.value *= -1
                }
                return true
              case consts.target.hero_attackChance:
                var prop = 'chanceAttack'
              case consts.target.hero_defenseChance:
                prop = prop || 'chanceDefense'
              case consts.target.hero_spellPowerChance:
                prop = prop || 'chanceSpellPower'
              case consts.target.hero_knowledgeChance:
                prop = prop || 'chanceKnowledge'
                var level = o.subCalc('object::' + this._shared.objects.level).value
                var subclass = o.subCalc('object::' + this._shared.objects.subclass).value
                return o.value = this.rules.heroClasses.atCoords(
                  this.rules.heroes.atCoords(subclass, 0, 0, 'class', 0), 0, 0,
                  prop + (level + 1 < 10 ? 'L' : 'H'),    // XXX=RH 10
                  0
                ) / 100 * consts.multiplier
              case consts.target.creature_moveDistance:
                var speed = o.subCalc('creature_speed').calc.updateIfNeeded().get('value')
                return o.value += speed
              case consts.target.creature_damageMin:
              case consts.target.creature_damageMax:
                // These are used for tower damage boost during siege. ifCombatCreature is the tower.
                switch (o.subCalc(schema.ifObjectType).value) {
                  case this.map.constants.object.type.hero:
                    var id = o.subCalc(schema.ifVisiting).value || o.subCalc(schema.ifGarrisoned).value
                    break
                  case this.map.constants.object.type.town:
                    var id = o.subCalc(schema.ifObject).value
                }
                if (id) {
                  var buildings = o.subCalc('town_buildings:' + id).calc.updateIfNeeded().get('value')
                  // XXX+C
                  //
                  // Apparently, SoD adjusts tower damage based on buildings constructed in the town (base + upgraded count as one). For example, with Castle alone damages are 10-15/6-9 (main/other towers) but with Tavern they are 12-18/6-9, with Blacksmith 14-21/8-12. Based on tests with Castle (town type) in the editor, main tower's damage grows at +2/+3 min/max for every building (not counting the Castle/Citadel) while other towers' damage grows at the same rate but for every other building (Castle = 6/9, Tavern = same, Blacksmith = 8/12, Marketplace = same, Guardhouse = 10/15, etc.).
                  //
                  // However, there are either special exceptions or bugs. For example, Citadel + Griffin Tower + Bastion gives 14/21 as expected, but Citadel + Upgraded Griffin Tower + Bastion gives 12/18 (i.e. UGT is not counted as a building). For classic mode such exceptions should be determined and implemented (XXX=IC).
                  o.value += Math.floor((_.without(buildings, this.rules.buildingsID.hall).length - 1 /*Fort*/) / params[1]) * params[2]
                }
                return o.value
              case consts.target.heroChance:
                // Despite HCTRAITS.TXT listing hero probabilities per town types, because the hero-for-hire pool is one for all player's towns it's probably the player's original town ("race"/"alignment") that matters.
                var town = o.subCalc('player_town').calc.updateIfNeeded().get('value')
                return o.value = _.extend({}, this.rules._townChances[town])
              // XXX+C formulae
              case consts.target.surrenderCost:
                var cost = this.rules.creatures.propertyIndex('cost') + o.subCalc(schema.ifResource).value
                return o.value = this.map.combats.nested(o.subCalc(schema.ifCombat).value).parties.nested(o.subCalc(schema.ifCombatParty).value).reduce(function (cur, creature) {
                  return cur + this.rules.creatures.atCoords(creature.get('creature'), 0, 0, cost, 0) * creature.get('count')
                }.bind(this), 0)
              case consts.target.creature_costUpgrade:
                var from = o.subCalc(schema.ifCreature).value
                var to = o.subCalc(schema.ifTargetCreature).value
                var cost = this.rules.creatures.propertyIndex('cost') + o.subCalc(schema.ifResource).value
                return o.value += this.rules.creatures.atCoords(to, 0, 0, cost, 0) - this.rules.creatures.atCoords(from, 0, 0, cost, 0)
              case consts.target.tradeRate:
                var kind = function (res) {
                  switch (res) {
                    case this.rules.constants.resources.gold:
                      return 'g'
                    case this.rules.constants.resources.wood:
                    case this.rules.constants.resources.ore:
                      return 'c'
                    default:
                      return 'p'
                  }
                }.bind(this)
                var res = o.subCalc(schema.ifResource).value
                var resr = o.subCalc(schema.ifResourceReceive).value
                var give = kind(res)
                var take = kind(resr)
                if (o.subCalc(schema.ifObjectType).value == this.map.constants.object.type.town) {
                  var markets = o.subCalc('marketplaces').calc.get('value')
                } else {
                  var markets = 5   // Trading Post; XXX=RH to databank
                }
                if (!markets || (res == resr)) {
                  return true
                } else if (markets > 9) {
                  markets = 9
                }
                var rates = [     // XXX=RH to databank
                  null,
                  {   // 1 Marketplace
                    gc: 1/2500,       // gold to wood
                    gp: 1/5000,       // gold to gems
                    cg: 25,           // wood to gold
                    cc: 1/10,         // wood to ore
                    cp: 1/20,         // wood to gems
                    pg: 50,           // gems to gold
                    pc: 1/5,          // gems to wood
                    pp: 1/10,         // gems to crystal
                  },
                  {   // 2 Marketplaces
                    gc: 1/1667,       // gold to wood
                    gp: 1/3333,       // gold to gems
                    cg: 37,           // wood to gold
                    cc: 1/7,          // wood to ore
                    cp: 1/13,         // wood to gems
                    pg: 75,           // gems to gold
                    pc: 1/3,          // gems to wood
                    pp: 1/7,          // gems to crystal
                  },
                  {   // 3 Marketplaces
                    gc: 1/1250,       // gold to wood
                    gp: 1/2500,       // gold to gems
                    cg: 50,           // wood to gold
                    cc: 1/5,          // wood to ore
                    cp: 1/10,         // wood to gems
                    pg: 100,          // gems to gold
                    pc: 1/3,          // gems to wood
                    pp: 1/5,          // gems to crystal
                  },
                  {   // 4 Marketplaces
                    gc: 1/1000,       // gold to wood
                    gp: 1/2000,       // gold to gems
                    cg: 62,           // wood to gold
                    cc: 1/4,          // wood to ore
                    cp: 1/8,          // wood to gems
                    pg: 125,          // gems to gold
                    pc: 1/2,          // gems to wood
                    pp: 1/4,          // gems to crystal
                  },
                  {   // 5 Marketplaces
                    gc: 1/833,        // gold to wood
                    gp: 1/1667,       // gold to gems
                    cg: 75,           // wood to gold
                    cc: 1/3,          // wood to ore
                    cp: 1/7,          // wood to gems
                    pg: 150,          // gems to gold
                    pc: 1/2,          // gems to wood
                    pp: 1/3,          // gems to crystal
                  },
                  {   // 6 Marketplaces
                    gc: 1/714,        // gold to wood
                    gp: 1/1429,       // gold to gems
                    cg: 88,           // wood to gold
                    cc: 1/3,          // wood to ore
                    cp: 1/6,          // wood to gems
                    pg: 175,          // gems to gold
                    pc: 1/1,          // gems to wood
                    pp: 1/3,          // gems to crystal
                  },
                  {   // 7 Marketplaces
                    gc: 1/625,        // gold to wood
                    gp: 1/1250,       // gold to gems
                    cg: 100,          // wood to gold
                    cc: 1/3,          // wood to ore
                    cp: 1/5,          // wood to gems
                    pg: 200,          // gems to gold
                    pc: 1/1,          // gems to wood
                    pp: 1/3,          // gems to crystal
                  },
                  {   // 8 Marketplaces
                    gc: 1/556,        // gold to wood
                    gp: 1/1111,       // gold to gems
                    cg: 112,          // wood to gold
                    cc: 1/2,          // wood to ore
                    cp: 1/4,          // wood to gems
                    pg: 225,          // gems to gold
                    pc: 1/1,          // gems to wood
                    pp: 1/2,          // gems to crystal
                  },
                  {   // 9+ Marketplaces
                    gc: 1/500,        // gold to wood
                    gp: 1/1000,       // gold to gems
                    cg: 125,          // wood to gold
                    cc: 1/2,          // wood to ore
                    cp: 1/4,          // wood to gems
                    pg: 250,          // gems to gold
                    pc: 1/1,          // gems to wood
                    pp: 1/2,          // gems to crystal
                  },
                ]
                return o.value = rates[markets][give + take] * consts.multiplier
              case consts.target.tavernRumor:
                var id = o.subCalc(schema.ifBonusObject).value
                var calc = o.subCalc('objectHash:' + id + ':' + consts.target.randomRumors + ':' + (this.cx.get('classic') ? 'gw' : 'gwi')).calc
                return o.value = calc.get('strings')[calc.get('value')]
              case consts.target.tavernHeroes:
                return o.value = o.subCalc('tavernHeroes').value.concat()
              // XXX=R consider reworking ..._message into general purpose handlers with some kind of selectors/filters without a hardcoded mode number
              case consts.target.quest_message:
                // First argument specifies usage for other arguments:
                // 1 = an 'artifact' but no 'false'/'quest' checks failed; other; a 'false' or 'quest' check failed
                // 2 = other; 'false' check failed
                // 3 = other; 'quest' check failed
                // 4 = a 'skill' check failed; other
                // 5 = a non-'quest' check failed; other
                // questChecks _opt is private to GenericEncounter.
                // Handlers for quest_message and bonus_message are private, intended for one-shot calculations and not fully proper (for example, they don't listen to own _opt changes).
                switch (params[1]) {
                  case 2:
                    var falseFailed = _.some(this.get('questChecks') || [], function (c) { return c[0] == 'false' })
                    var msg = params[falseFailed ? 3 : 2]
                    break
                  case 3:
                    var questFailed = _.some(this.get('questChecks') || [], function (c) { return !c[1] && c[0] == 'quest' })
                    var msg = params[questFailed ? 3 : 2]
                    break
                  case 5:
                    var otherFailed = _.some(this.get('questChecks') || [], function (c) { return !c[1] && c[0] != 'quest' })
                    var msg = params[otherFailed ? 2 : 3]
                    break
                  case 4:
                    var skillFailed = _.some(this.get('questChecks') || [], function (c) { return !c[1] && c[0] == 'skill' })
                    var msg = params[skillFailed ? 2 : 3]
                    break
                  case 1:
                    var checks = this.get('questChecks') || []
                    var msg = 3
                    for (var i = 0; i < checks.length; i++) {
                      if (!checks[i][1]) {
                        switch (checks[i][0]) {
                          case 'artifact':
                            msg == 3 && (msg = 2)
                            break
                          case 'quest':
                          case 'false':
                            msg = 4
                        }
                      }
                    }
                    msg = params[msg]
                    break
                  default:
                    throw new Error("Inapplicable ['custom', 'rules'] quest_message mode: " + params[1])
                }
                msg == null || o.value.push(msg)
                return true
              case consts.target.bonus_message:
                // First argument specifies usage for other arguments:
                // 0 = bonuses consists of an entry for one artifact; other cases
                // 1 = have any rewards; have none
                // 2 = bonuses consists of an entry for resources_wood; have other combinations of bonuses; have no bonuses
                // 3 = have any 'experience' reward; positive 'spellPoints'; negative; *positive 'morale'; *negative; *positive 'luck'; *negative; positive 'resources' or an 'artifacts'; negative 'resources'; *single 'spell' learned; *multiple; single 'creatures' (1 creature with 1 count) given; multiple; other combination of rewards except none; no rewards
                // 3 is used for Pandora's Box. Conditions are matched in order. (*) are not implemented conditions because they are Effects and not tracked by addedBonuses (XXX+I).
                // questBonuses _opt is private to GenericEncounter.
                var keys = []
                _.each(this.get('questBonuses') || {}, function (bonuses, key) {
                  _.each(bonuses, function (bonuses, id) {
                    _.each(bonuses, function (bonuses, subkey) {
                      var ks = key + ',' + subkey
                      switch (ks) {
                        case 'heroes,artifacts':
                          return keys.push(bonuses.length == 1 ? 'art1' : 'art')
                        case 'heroes,spellPoints':
                          return keys.push(bonuses > 0 ? 'sp+' : 'sp-')
                        case 'heroes,creatures':
                          return keys.push(_.sum(bonuses, _.forceObject) == 1 ? 'cr1' : 'cr')
                        case 'heroes,experience':
                          return keys.push('exp')
                        default:
                          if (/^players,resources_/.test(ks)) {
                            keys.push(bonuses > 0 ? 'res+' : 'res-')
                            subkey == 'resources_wood' && keys.push('wood')
                          } else {
                            return keys.push('other')
                          }
                      }
                    })
                  })
                })
                switch (params[1]) {
                  case 0:
                    var msg = params[keys.join() == 'art1' ? 2 : 3]
                    break
                  case 1:
                    var msg = params[keys.length ? 2 : 3]
                    break
                  case 2:
                    var msg = params[/^res.,wood$/.test(keys.join()) ? 2 : keys.length ? 3 : 4]
                    break
                  case 3:
                    var i = [
                      _.includes(keys, 'exp'),
                      _.includes(keys, 'sp+'),
                      _.includes(keys, 'sp-'),
                      false,
                      false,
                      false,
                      false,
                      _.includes(keys, 'res+') || _.includes(keys, 'art1') || _.includes(keys, 'art'),
                      _.includes(keys, 'res-'),
                      false,
                      false,
                      _.includes(keys, 'cr1'),
                      _.includes(keys, 'cr'),
                      keys.length,
                      true,
                    ]
                    i = _.min(_.keys(_.compact(i, _.forceObject)))
                    var msg = params[2 + +i]
                    break
                  default:
                    throw new Error("Inapplicable ['custom', 'rules'] bonus_message mode: " + params[1])
                }
                msg == null || o.value.push(msg)
                return true
              default:
                throw new Error("Inapplicable ['custom', 'rules'] Effect target: " + o.subCalc(schema.target).value)
            }
          } else if (params[0] == 'spell') {
            switch (params[1]) {
              // Unlike other spells, effect of Bless/Curse should be calculated dynamically instead of once at cast time because creature's damage may change while this spell is active (due to other spells, position on the field, etc.).
              //
              // We're not using spellEfficiency here for simplicity, to avoid adding more sub-calculators.
              //
              // params = ['spell', bless|curse, multiplier, addition]
              case this.rules.spellsID.bless:
                var target = 'creature_damageMax'
              case this.rules.spellsID.curse:
                var target = target || 'creature_damageMin'
                var damage = o.subCalc(target).calc.updateIfNeeded().get('value')
                return o.value = damage * params[2] + params[3]
              default:
                throw new Error("Inapplicable ['custom', 'spells'] spell ID: " + params[1])
            }
          }
          return    // case consts.operation.custom
        case consts.operation.countAlignments:
          if (o.subCalc(schema.ifCreature).value == null) {
            // Preserve original SoD behaviour: when calculating morale for
            // the hero overall, alignments are not counted; as a result, hero's
            // morale can be neutral but if he has only one creature in the
            // garrison, that creature's info window will indicate good morale (+1).
            return true
          }
          var unique = new Set
          var paramGroups = params[1] || {}
          this.map.objects.readSub(this._shared.objects.garrison, o.subCalc('object::' + this._shared.objects.garrison).value)
            .find('creature', function (id) {
              var align = this.rules.creatures.atCoords(id, 0, 0, this._shared.alignmentIndex, 0)
              unique.add(paramGroups[align] || -align)
            }, this)
          return o.value += params[0] - unique.size
        case consts.operation.randomSign:
          // SoD seems to use a persistent algorithm independent of
          // particular map or level (Z) of the sign object. Signs placed
          // on the same X/Y coords show the same default message. Ocean bottles and land signs share the same random pool.
          //
          // XXX not sure if this should be a subcalc or if a one-off calculation is fine
          var id = o.subCalc(schema.ifBonusObject).value
          var calc = o.subCalc('objectHash:' + id + ':' + consts.target.randomSigns + ':' + (this.cx.get('classic') ? 'xy' : 'gxyz')).calc
          var value = calc.get('strings')[calc.get('value')]
          return o.value = _.isArray(o.value) ? [value] : value
        case consts.operation.databank:
          var value = this.rules[params[1]].atCoords(
            o.subCalc(schema[params[0]]).value, 0, 0,
            params[2] + (params[3] ? o.subCalc(schema[params[3]]).value : 0),
            0
          )
          o.value = params[5]
            // Databank holds multiplier, not absolute value (e.g. Creature->$critical).
            ? o.value * value
            : this.deepClone(value === false ? params[4] : value)
          return true
        case consts.operation.spellSpec:
          var level = o.subCalc('object::' + this._shared.objects.level).value
          return this._applyHeroSpecModifier(o, 0.05, this.rules.creatures.atCoords(o.subCalc(schema.ifCreature).value, 0, 0, 'level', 0), level)
        case consts.operation.check:
          var checkEntry
          switch (params[0]) {
            case undefined:
            case null:
            case false:
              var value = params[0] !== false
              checkEntry = [params[1]]    // user-provided label
              params[0] = value + ''
              break
            case 'quest':
              var mode = params[1]
              var value = {}
              if (_.includes(mode, 'S')) {
                // Regard the quest as unfulfilled if the encounterer (hero) has an Effect associated with him with a $source of the quest object (bonus).
                value.S = o.subCalc('byEncounter').value == null
              }
              if (_.includes(mode, 'O')) {
                value.O = o.subCalc('object:' + o.subCalc(schema.ifBonusObject).value + ':' + this._shared.objects.owner).value != o.subCalc('object::' + this._shared.objects.owner).value
              }
              checkEntry = [mode, value]
              value = _.size(_.compact(value)) == _.size(value)
              break
            case 'level':
              var value = o.subCalc('object::' + this._shared.objects.level).value
              break
            case 'attack':
            case 'defense':
            case 'spellPower':
            case 'knowledge':
              var value = o.subCalc(params[0]).calc.updateIfNeeded().get('value')
              break
            case 'spellPointsMax':
              var normal = o.subCalc('spellPoints').calc.updateIfNeeded().get('value')
              var cur = o.subCalc('object::' + this._shared.objects.spellPoints).value
              params = params.concat(1, 1)
              var min = params[1] * normal
              var max = params[2] * normal
              var value = cur >= min && cur < max
              checkEntry = [[min, max], cur]
              break
            case 'defeat':
              var value = !o.subCalc('objectExists:' + params[1]).value
              checkEntry = [params[1]]
              break
            case 'garrison':
              // XXX+C do upgraded versions count? e.g. quest needs 10 pikemen and hero has 10 halberdiers
              checkEntry = params[1]
              params = [params[0], params[2] || 1, params[3]]
              var value = 0
              this.map.objects.readSub(this._shared.objects.garrison, o.subCalc('object::' + this._shared.objects.garrison).value)
                .find(0, function ($, slot) {
                  if (this.atCoords(slot, 0, 0, 'creature', 0) == checkEntry) {
                    value += this.atCoords(slot, 0, 0, 'count', 0)
                  }
                })
              break
            case 'artifact':
              var value = this.map.objects.readSub(this._shared.objects.artifacts, o.subCalc('object::' + this._shared.objects.artifacts).value)
                .find('artifact', params[1]) != null
              checkEntry = [params[1]]
              break
            case 'skill':
              var cur = o.subCalc('skillMastery::' + params[1]).calc.updateIfNeeded().get('value')
              var min = params[2] == null ? 1 : params[2]
              var max = params[3]
              var value = cur >= min && (max == null || cur <= max)
              checkEntry = [[min, max], cur, params[1]]
              break
            case 'skillCount':
              var cur = o.subCalc('skills:').calc.updateIfNeeded().get('value').length
              var min = params[1]
              var max = params[2]
              var value = cur >= min && (max == null || cur <= max)
              checkEntry = [[min, max], cur]
              break
            default:
              if (params[0].match(/^resources_/)) {
                var player = o.subCalc(schema.ifPlayer).value
                var value = o.subCalc('player:' + player + ':' + params[0]).value
              } else {
                throw new Error("Inapplicable criterion: " + params)
              }
          }
          if (typeof value == 'number') {
            var calc = function (value) {
              return o.subCalc('quest_requirement:' + value).calc.updateIfNeeded().get('value')
            }.bind(this)
            var min = calc(params[1])
            var max = params[2] == null ? null : calc(params[2])
            if (params[0] == 'garrison') {
              checkEntry = [[min, max], value, checkEntry]
            } else if (!checkEntry) {
              checkEntry = [[min, max], value]
            }
            value = min <= value && (max == null || max >= value)
          }
          if (checkEntry) {
            // Calculator's _opt.checks holds details about checks performed by [$check, ...] modifiers during last calculation. Each member is an array with indexes: 'criterion', met, expected value, current value. Formats of "value" and extra members depend on the criterion and usually are just numbers.
            o.calculation.checks || (o.calculation.checks = [])
            o.calculation.checks.push([params[0], !!value].concat(checkEntry))
          }
          o.value = !!((o.value == null || o.value) && value)
          return true
      }
      return this._applyModifier_old.apply(this, arguments)
    },

    // H3-specific internal Calculators needed for the above operations.
    _readySubCalc: function (name) {
      var member = this._readySubCalc_old.apply(this, arguments)

      var schema = this._schema
      var target = this._constants.target

      if (typeof name == 'string' && name[0] != ':') {
        var parts = name.split(':')
        switch (parts.length + ',' + parts[0]) {
          case '1,attack':
          case '1,defense':
          case '1,knowledge':
          case '1,spellPower':
          case '1,spellPoints':
            member.calc = member.mcalceffect({
              target: target['hero_' + name],
              ifObject: member.subCalc(schema.ifObject).value
            })
            break
          case '1,creature_damageMin':
          case '1,creature_damageMax':
          case '1,creature_speed':
            member.calc = member.mcalceffect({
              target: target[parts[0]],
              ifCombat: member.subCalc(schema.ifCombat).value,
              ifCombatCreature: member.subCalc(schema.ifCombatCreature).value,
            })
            break
          case '1,marketplaces':
            member.calc = member.mcalc(Rules.PlayerBuildingCount, {
              player: this.map.players.nested(member.subCalc(schema.ifPlayer).value),
              buildings: [this.rules.buildingsID.marketplace],
            })
            break
          case '2,town_buildings':  // town_buildings : [AObject.id | ifObject]
            var id = parts[1] ? +parts[1] : member.subCalc(schema.ifObject).value
            member.calc = member.mcalceffect({
              class: Calculator.Effect.GenericIntArray,
              target: target.town_buildings,
              ifObject: id,
            })
            break
          case '3,owned':  // owned : <player> : <col>
            var col = this.map.players.nested(parts[1])[parts[2]]
            member.mgetreval(function () { return col.length > 0 })
            member.meventinval(col, 'nestExNew')
            member.meventinval(col, 'unnested')
            break
          case '4,objectHash':  // objectHash : [AObject.id | ifObject] : <target> : <persistence>
            var id = parts[1] ? +parts[1] : member.subCalc(schema.ifObject).value
            member.calc = member.mcalc(Rules.ObjectHash, {
              mcalcOpt: ['value', 'strings'],
              id: id,
              max: +parts[2],
              persistence: parts[3],
            })
            break
          case '1,tavernHeroes':  // value = tavern hero pool for ifPlayer (not cloned)
            var player = this.map.players.nested(member.subCalc(schema.ifPlayer).value)
            member.mgetreval(function () {
              return player.get('availableHeroes')
            })
            member.meventinval(player, 'change_availableHeroes', 2)
            break
          case '1,player_town':
            member.calc = member.mcalceffect({
              target: target.player_town,
              ifPlayer: member.subCalc(schema.ifPlayer).value,
            })
            break
          case '1,byEncounter':   // value = n of Effect with $source of ifBonusObject and one of heroShortcuts set to ifObject
            var atter = this._shared.encounterAtter
            var hero = member.subCalc(schema.ifObject).value
            var store = this.map.effects.byEncounter
            var en = store.toContiguous(member.subCalc(schema.ifBonusObject).value, 0, 0, 0)
            member.mgetreval(function () {
              return store.findAtContiguous(en, function (n) {
                if (atter(n, 0).indexOf(hero) != -1) { return n }
              })
            })
            if (this._opt.listen >= 2) {
              member.meventinval(store, 'oadd_n_'    + en, 3)
              member.meventinval(store, 'oremove_n_' + en, 3)

              this._shared.heroShortcuts.forEach(function (prop) {
                member.moff(this.map.effects, 'ochange_p_' + prop, function (n, $2, $3, $4, $5, options) {
                  if (store.findAtContiguous(en, n) != null) {
                    member.invalidateGuard(options, {update: true})
                  }
                })
              }, this)
            }
            break
          case '2,quest_requirement':   // quest_requirement : <initial>
            member.calc = member.mcalceffect({
              initial: +parts[1],
              target: target.quest_requirement,
              ifObject: member.subCalc(schema.ifObject).value,
              ifBonusObject: member.subCalc(schema.ifBonusObject).value,
            })
            break
          case '1,schoolMastered':
            // value = SpellSchool->$id which is one of _opt.ifSpellSchool members which corresponds to a magic mastery skill (Air Mastery, etc.) with the highest skill mastery (Advanced, etc.) learned by _opt.ifObject.
            var calc = member.subCalc(schema.ifSpellSchool, UPD_INC)
            var skills = []
            member.mgetreval(function () {
              if (calc.value.length < 2) {
                return calc.value[0]
              }
              return _.max(calc.value, function (school) {
                if (!skills[school]) {
                  skills[school] = member.subCalc('skillMastery::' + this._shared.schoolToSkill[school], UPD_INC)
                }
                return skills[school].calc.updateIfNeeded().get('value')
              }, this)
            })
            break
        }
      }

      return member
    },

    // H3-specific tests to determine if an Effect's selector matches Calculator's options.
    _test: function (selector, value, effect, subCalc) {
      switch (selector) {
        case this._schema.ifSpellSchool:
          // Match if Effect->$ifSpellSchool is unset (affects all schools) or
          // depending on _opt.ifSpellSchool (sv) mode:
          // - if not part of an object, sv must be an array - match if includes value
          // - if part of an object (ifObject set), compare highest-mastered school (schoolMastered is one of sv)
          var sv
          if (value === false) {
            return true
          } else if ((sv = subCalc(selector).value) == null) {
            return false
          } else if (!subCalc(this._schema.ifObject).value) {
            return sv.indexOf(value) != -1
          } else {
            return value == subCalc('schoolMastered').value
          }

        case this._schema.ifGrantedMin:
          var min = true
        case this._schema.ifGrantedMax:
          return this._matchMinMax(subCalc, this._schema.ifGrantedMin, value, min)
      }

      return this._test_old.apply(this, arguments)
    },

    _initShared: function () {
      var res = this._initShared_old.apply(this, arguments)

      var eff = this.map.effects
      res.heroShortcuts = Rules.GenericEncounter.heroShortcuts.map(eff.propertyIndex, eff)

      res.encounterAtter = eff.atter(Rules.GenericEncounter.heroShortcuts, {array: true})
      // If you get an error here, check if you're trying to calculate before map data (i.e. databank) was fetched.
      res.spells = this.rules.spells.schema()
      res.alignmentIndex = this.rules.creatures.propertyIndex('alignment')

      res.schoolToSkill = {}
      this.rules.spellSchools.find('skill', function (skill, school) {
        res.schoolToSkill[school] = skill
      })

      res.c2cf = _.extend([], _.fromEntries([
        [res.schema.ifCreatureLevel,            res.schema.ifCreature],
        [res.schema.ifCreatureAlignment,        res.schema.ifCreature],
        [res.schema.ifCreatureShooting,         res.schema.ifCreature],
        [res.schema.ifCreatureUndead,           res.schema.ifCreature],
        [res.schema.ifTargetCreatureLevel,      res.schema.ifTargetCreature],
        [res.schema.ifTargetCreatureAlignment,  res.schema.ifTargetCreature],
        [res.schema.ifTargetCreatureUndead,     res.schema.ifTargetCreature],
      ]))

      res.c2cd = _.extend([], _.fromEntries([
        [res.schema.ifCreatureLevel,            this.rules.creatures.propertyIndex('level')],
        [res.schema.ifCreatureAlignment,        this.rules.creatures.propertyIndex('alignment')],
        [res.schema.ifCreatureShooting,         this.rules.creatures.propertyIndex('shooting')],
        [res.schema.ifCreatureUndead,           this.rules.creatures.propertyIndex('undead')],
        [res.schema.ifTargetCreatureLevel,      this.rules.creatures.propertyIndex('level')],
        [res.schema.ifTargetCreatureAlignment,  this.rules.creatures.propertyIndex('alignment')],
        [res.schema.ifTargetCreatureUndead,     this.rules.creatures.propertyIndex('undead')],
      ]))

      res.s2sd = _.extend([], _.fromEntries([
        [res.schema.ifSpellSchool,  this.rules.spells.propertyIndex('schools')],
        [res.schema.ifSpellLevel,   this.rules.spells.propertyIndex('level')],
        [res.schema.ifAggression,   this.rules.spells.propertyIndex('aggression')],
      ]))

      return res
    },

    // Provides implicit value for H3-specific Calculator option based on other options. For example, client may supply only _opt.ifCreature and that is enough to match Effects with $ifCreatureLevel because ifCreature allows obtaining level from databank.
    _expandOption: function (member, selector) {
      var schema = this._schema

      switch (selector) {
        case schema.ifCreatureLevel:
        case schema.ifTargetCreatureLevel:
        case schema.ifCreatureAlignment:
        case schema.ifTargetCreatureAlignment:
        case schema.ifCreatureShooting:
        // No ifTargetCreatureShooting.
        case schema.ifCreatureUndead:
        case schema.ifTargetCreatureUndead:
          var cr = member.subCalc(this._shared.c2cf[selector], UPD_INC)

          member.mgetreval(function () {
            if (cr.value != null) {
              var value = this.rules.creatures.atCoords(cr.value, 0, 0, this._shared.c2cd[selector], 0)

              switch (selector) {
                case schema.ifCreatureAlignment:
                case schema.ifTargetCreatureAlignment:
                case schema.ifCreatureShooting:
                case schema.ifCreatureUndead:
                case schema.ifTargetCreatureUndead:
                  // Databank's Creature stores $shooting and others as boolean while $if... is integer (since ObjectStore can't store false values).
                  return +value
                default:
                  return value
              }
            }
          })

          return

        case schema.ifSpellSchool:
        case schema.ifSpellLevel:
        case schema.ifAggression:
          var spell = member.subCalc(schema.ifSpell, UPD_INC)

          member.mgetreval(function () {
            if (spell.value != null) {
              return this.rules.spells.atCoords(spell.value, 0, 0, this._shared.s2sd[selector], 0) || 0
            }
          })

          return
      }

      return this._expandOption_old.apply(this, arguments)
    },
  }

  // Internal class managing effects of a hero or town owned by a particular player.
  //
  // For example, a hero can "spy" onto nearby enemy (giving insight into their army); this adds such an Effect (coming from databank), replacing its placeholder $ifX/$ifY/$ifZ values with the hero's adventure map position.
  //
  // XXX=R
  var HeroItemCollection = Effects.Collection.extend({
    _listening: null,

    _opt: {
      objects: null,
      map: null,
      id: 0,
      n: 0,
      ifObjectIndex: 0,
      ifTargetObjectIndex: 0,
      ifTargetPlayerIndex: 0,
      ifGarrisonedIndex: 0,
      ifVisitingIndex: 0,
      ifPlayerIndex: 0,
      ownerIndex: 0,
      listenOwner: false, // internal
      listenCoords: false, // internal
      listening: false, // internal
    },

    events: {
      expandEffect: function (effect, member) {
        if (effect[this.get('ifObjectIndex')] === true) {
          effect[this.get('ifObjectIndex')] = this.get('id')
        }
        if (effect[this.get('ifTargetObjectIndex')] === true) {
          effect[this.get('ifTargetObjectIndex')] = this.get('id')
        }
        if (effect[this.get('ifTargetPlayerIndex')] === true) {
          effect[this.get('ifTargetPlayerIndex')] = this.get('objects').atContiguous(this.get('n') + this.get('ownerIndex'), 0)
          this.set('listenOwner', member.listenOwner = true)
        }
        if (effect[this.get('ifGarrisonedIndex')] === true) {
          effect[this.get('ifGarrisonedIndex')] = this.get('id')
        }
        if (effect[this.get('ifVisitingIndex')] === true) {
          effect[this.get('ifVisitingIndex')] = this.get('id')
        }
        if (effect[this.get('ifPlayerIndex')] === true) {
          effect[this.get('ifPlayerIndex')] = this.get('objects').atContiguous(this.get('n') + this.get('ownerIndex'), 0)
          this.set('listenOwner', member.listenOwner = true)
        }
        member.nIndex = member.nIndex + 1 || 0
        if (effect[this._effects.propertyIndex('ifX')] === true &&
            effect[this._effects.propertyIndex('ifY')] === true &&
            effect[this._effects.propertyIndex('ifZ')] === true) {
          var act = this.get('map').actionableSpot(this.get('id'))
          effect[this._effects.propertyIndex('ifX')] = act[0]
          effect[this._effects.propertyIndex('ifY')] = act[1]
          effect[this._effects.propertyIndex('ifZ')] = act[2]
          this.set('listenCoords', true)
          member.listenCoords = member.listenCoords || []
          member.listenCoords.push(member.nIndex)
        }
      },

      removeMember: function (member) {
        if (member.listenOwner &&
            _.every(this._members, function (m) { return m == member || !m.listenOwner })) {
          this.set('listenOwner', false)
        }

        if (member.listenCoords &&
            _.every(this._members, function (m) { return m == member || !m.listenCoords })) {
          this.set('listenCoords', false)
        }
      },

      'change_listenOwner, change_listenCoords': function () {
        this.set('listening', this.get('listenOwner') || this.get('listenCoords'))
      },

      change_listening: function (now) {
        if (!now) {
          this.get('objects').off(this._listening)
        } else {
          this._listening = this.autoOff(this.get('objects'), {}).on(
            'ochange_n_' + this.get('n'),
            Common.batchGuard(5, function ($1, $2, $3, $4, $5, options) {
              var listenOwner
              var listenCoords
              _.each(options.batch, function (event) {
                if (event[0] == 'ochange_n_' + this.get('n')) {
                  listenOwner = listenOwner || event[3] == this.get('ownerIndex')
                  listenCoords = listenCoords || event[3] == this.get('objects').propertyIndex('x') || event[3] == this.get('objects').propertyIndex('y') || event[3] == this.get('objects').propertyIndex('z') || event[3] == this.get('objects').propertyIndex('width') || event[3] == this.get('objects').propertyIndex('height') || event[3] == this.get('objects').propertyIndex('actionable')
                }
              }, this)
              this._effects.batch(null, function () {
                var act
                _.each(this._members, function (m) {
                  if (listenOwner && m.listenOwner) {
                    this.reAddMember(m.item)
                  } else if (listenCoords && m.listenCoords) {
                    // Effects has an optimized partial update when only ifX/ifY/ifZ/ifRadius change so doing that rather than readding the member.
                    act = act || this.get('map').actionableSpot(this.get('id'))
                    _.each(m.listenCoords, function (i) {
                      var n = m.nEffects[i]
                      this._effects.setAtContiguous(n + this._effects.propertyIndex('ifX'), 0, act[0])
                      this._effects.setAtContiguous(n + this._effects.propertyIndex('ifY'), 0, act[1])
                      this._effects.setAtContiguous(n + this._effects.propertyIndex('ifZ'), 0, act[2])
                    }, this)
                  }
                }, this)
              }, this)
            }),
            this
          )
        }
      },
    },
  })

  // Central class defining most gameplay rules for HoMM 3. Available as the rules property on most Module-s.
  //
  // Some of what it does:
  //* loading and serializing H3-specific map data (databank, shroud, fixup)
  //* handling hero movements over adventure map (triggerSpotEffects hook)
  //* regenerating dwellings, heroes, etc. on date change (new round)
  //* implementing AObject->$pending system of locked map objects - task queue
  //* processing most encounters (town/hero/GenericEncounter) and combats
  //* performing level-up, building construction, etc.
  //* maintaining Effects associated with mines, dwellings, heroes, towns, etc.
  //* maintaining state of Shroud (fog of war) based on own and allies' objects
  //* assigning default values (town name, monster count, random mine, etc.)
  //* checking win/loss conditions and ending the game
  //
  // A significant chunk of gameplay logic including complete combat mechanics is currently located in H3.Rules.RPC.
  var Rules = Common.Sqimitive.extend('HeroWO.H3.Rules', {
    mixIns: [Common.ContextModule],
    databank: null,
    // + databank properties except players (ContextModule.players)
    _dynamicIndex: 0,
    _townChances: {},   // Town->$id => Hero->$id => chance in %; for internal use by heroChance target calculator
    _heartbeatTimer: null,
    // Master RPC for neutral player ("administrative").
    rpc: null,
    _shroudInitialized: false,
    _encounters: {},
    fortBuildings: null,
    hallBuildings: null,
    _runningPending: null,    // Set

    events: {
      owned: function () {
        function hook(container, rules) {
          rules.autoOff(container.modules, {
            nestExNew: function (res) {
              // Make Rules available to every module in module.attach() and later
              // (not in owned() because it's called during nestEx(), not after).
              res.child.rules = rules
              if (res.child.constructor.modules) {
                hook(res.child, rules)
              }
              // Ideally we'd mix-into the declaration, not on run-time but we
              // can't simply extend the class because
              // it won't affect subclasses (GenericNumber, etc.) and will
              // in fact cause problems in Sqimitive's event system (because
              // base class is changed after a subclass was created).
              //
              // But then, we only need to override a few methods, and they also
              // happen to be called a lot so we do that directly rather than via
              // events (it doesn't seem to have as big improvement as one'd
              // reckon, but using events for something called tens of thousands
              // of times just doesn't feel right).
              //
              // Doing the extension here rather than, for example, upon cx' +_effectCalc because of !delayRender - _initShared must be replaced before the child's attach.
              if (res.child instanceof Calculator.Effect &&
                  !_.has(res.child, '_applyModifier_old')) {
                _.each(CalcOverride, function (func, name) {
                  res.child[name + '_old'] = res.child[name]
                  res.child[name] = func
                })
              }
            },
          })
        }

        hook(this.cx, this)
        // Hook already added modules (Screen is typically nested before H3).
        this.cx.modules.each(function (m) { m.modules && hook(m, this) }, this)

        this.autoOff(this.cx, {
          hookRPC: function (res) {
            if (!res.rules) {   // new instance (could be shared)
              res.mixIn(RpcMixIn)
              res.rules = this
            }
          },
        })

        if (this.cx.get('master')) {
          this._initializeMenu()
        }

        var map = this.cx.map

        this.autoOff(map, {
          // serialize() may be called early during configuring. In this situation databank is present but shroud may be not (since if it's missing from map files it won't be initialized until _initializeMap()).
          '+serialize': function (res) {
            map.shroud && (res.shroud = map.shroud.serialize())
            res.databank = this.databank.serialize()
          },
        })

        // Unlike other map data, shroud.json is not pre-generated by existing map convertors because it depends on many game mechanisms.
        //
        // This may be 404.
        this.cx.queueLoading(map.fetch('shroud.json')
          .set('ignoreError', true)
          .whenSuccess(function (async) {
            var options = _.extend({
              // effects is already available since H3.Rules is added by H3 which is added by Context in response to map's state change to 'loaded'.
              effects: map.effects,
              context: this.cx,
              width: map.get('width'),
              height: map.get('height'),
              levels: map.get('levels'),
              players: map.players.length,
            }, map.constants.shroud, async.get('status') && async.response)

            map.shroud = new Shroud(options)
            this._shroudInitialized = async.get('status')
          }, this))

        // Databank may be stored in full under the map's directory (url/databank/...; the case when loading over WebSocket) or it may be split into base databank files (separate directory) and map-specific extensions (url/databank/...; the case in single-player mode). Determine this by fetching constants.json and checking if it has the version key (only present in full databank data).
        this.databank = new Databank
        var props = []

        this.cx.queueLoading(map.fetch('databank/constants.json')
          .set('ignoreError', true)
          .whenSuccess(function (async) {
            if (async.get('status') && async.response.version) {
              this.databank.on({
                '=fetch': function (sup, file) {
                  return map.fetch('databank/' + file)
                },
              }, this)

              this.cx.queueLoading(this.databank.load(props))
                .whenSuccess(function () { this._initializeDatabank(props) }, this)
            } else {
              this.databank.on({
                '=fetch': function (sup, file) {
                  return this.cx.fetch(Databank.name, map.get('databank') + '/', file)
                },
              }, this)

              props.push('fixup')
              var extending = {}
              var async = this.cx.queueLoading(this.databank.load(props))

              _.log && _.log('Fetching databank extensions (disregard the following 404s/ENOENTs)')

              _.each(props, function (prop) {
                async.nest(map.fetch('databank/' + prop + '.json')
                  .set('ignoreError', true)
                  .whenSuccess(function (async) {
                    if (async.get('status')) {    // ignore ignoreError
                      extending[prop] = async.response

                      if (prop == 'constants' && map.get('databank') != extending.constants.version && console) {
                        console.warn(_.format('Map built with databank %s but loaded with %s. No telling how this will play along.',
                          map.get('databank'), extending.constants.version))
                      }
                    }
                  }))
              })

              async.whenSuccess(function () {
                if (!_.isEmpty(extending)) {
                  _.log && _.log('Fetched databank extensions: %s', _.keys(extending))
                  // When adding new entities to databank (e.g. new creatures), their run-time IDs are unknown because extensions are dynamic and others may add their own entities. fixup.json indicates which values in the extension's data should be replaced with final run-time IDs.
                  //
                  // fixup is an array of arrays. Each array's first member is property name (e.g. 'buildings'), last but one is extension's property ('creatures') and the last is the index of extension's added object in it (0). Items in between (at least one) are keys descending into the property; special value null indicates that two following items are extension's property and object index. If null appears as the last but two then the key itself is renamed (fixup entries are applied one after another so subsequent entries may reference the renamed key by its new name).
                  //
                  // For example, adding a new creature with a building that produces it requires defining the two in their stores (creatures.json, buildings.json) and replacing $produce value with the creature's actual ID using fixup.json:
                  //
                  //   [
                  //     "buildings",   // property being fixed-up
                  //     null, "buildings", 0,  // key = ID of added building 0
                  //     0, 0,  // Y/Z, not used since buildings is 1D
                  //     11,  // schema index of $produce
                  //     0,   // replace its first member...
                  //     "creatures", 0   // with index of added creature 0
                  //   ]
                  //
                  // producers.json should be also updated, first by renaming the key, then by writing new creature's ID:
                  //
                  //   [
                  //     "producers",
                  //     3,   // Town->$id of our new building, let's say Inferno
                  //     "temporary unique building key placeholder",
                  //     null,   // rename the key...
                  //     "buildings", 0,  // to new building's ID
                  //   ],
                  //   [
                  //     "producers",
                  //     3,
                  //     null, "buildings", 0,  // new building's ID (renamed)
                  //     0,   // replace first member...
                  //     "creatures", 0   // with new creature's ID
                  //   ]
                  //
                  // Given the above, it doesn't matter what value Building->$produce[0] is, and the same for producers.json. Extension of the latter (map/databank/producers.json) may look like this:
                  //
                  //   {
                  //     "3": {
                  //       "temporary unique building key placeholder": [null]
                  //     }
                  //   }
                  //
                  // JSON extensions cannot handle all cases. For example, it's impossible to add a creature to an existing building's $produce because fixup only affects extension's data, not databank (albeit after doing the fixup that data is merged into databank) and other extensions may have changed that building so their changes would be overridden. Such cases should be addressed by JavaScript code as JSONs intend to be simple, declarative and easy to load patches.
                  if (extending.fixup) {
                    // XXX fixups untested
                    var resolveID = function (ref) {
                      return this.databank[ref[0]].size().x + ref[1]
                    }.bind(this)
                    _.each(extending.fixup, function (fixup) {
                      var store = extending[fixup.shift()]
                      var value = resolveID(fixup.splice(-2))
                      var rename = _.last(fixup) == null
                      rename && fixup.pop()
                      while (true) {
                        var key = fixup[0] == null
                          ? resolveID(fixup.splice(0, 3).slice(1))
                          : fixup.shift()
                        if (!fixup.length) { break }
                        store = store[key]
                      }
                      if (rename) {
                        store[value] = store[key]
                        delete store[key]
                      } else {
                        store[key] = value
                      }
                    }, this)
                  }
                }

                _.each(props, function (prop) {
                  if (extending[prop]) {
                    this.databank.appendTo(prop, extending[prop])
                  }

                  this._initializeDatabank(props)
                }, this)
              }, this, 1)
            }
          }, this))
      },

      attach: function () {
        this._dynamicIndex = this.map.effects.propertyIndex('dynamic')
        var objectSchema = this.map.objects.schema()
        var atter = this.map.objects.atter(['type', 'displayOrder', 'texture', 'animation'])

        if (this.cx.get('master')) {
          this.rpc = this.cx.rpcFor(0)
          this.rpc.master = true
          this.rpc._startMaster()

          this.autoOff(this.map.objects, [
            'pending_townEncounter', '_triggerTownOrHeroEffects',
            'pending_combatEncounter', '_heroCombatRun',
            // unpending_encounter is hooked by _triggerObjectEffects().
            'pending_encounter', '_triggerObjectEffects',
            'unpending_townEncounter', function (town, hero) {
              // Town visit triggers encounter of every building and this should not be interrupted. If it was interrupted though, try resetting the state (the following might not be enough).
              this.map.players.some(function (player) {
                if (player.get('screen') == 'townscape' && player.get('screenTown') == town) {
                  return player.set('screen', '')
                }
              }, this)
            },
            'ochange_p_' + objectSchema.owner,
            function (n, $1, $2, now, old) {
              var id = this.map.objects.fromContiguous(n).x
              old = this.map.players.nested(old)
              old.getSet('screen', function (cur) {
                switch (cur) {
                  case 'townscape':
                    // Town captured while the original owner was looking at the townscape.
                    if (old.get('screenTown') == id) {
                      cur = ''
                    }
                    break
                  case 'hireDwelling':
                    if (old.get('screenHero') == id || old.get('screenDwelling') == id) {
                      cur = ''
                    }
                    break
                }
                return cur
              }, this)
            },
            'ochange_p_' + objectSchema.garrisoned + ', ' +
            'ochange_p_' + objectSchema.owner,
            function (n, $1, prop, now, old) {
              // $owner property exists for all $type-s, and it may only change if it's not false (i.e. non-ownable).
              //
              // $garrisoned exists for some, but here we need it for hero only.
              var obj = atter(n, 0)
              // SoD puts newly joined or un-garrisoned hero to the end of the hero list. We preserve the hero's original position. Same with captured towns.
              switch (obj.type) {
                case this.map.constants.object.type.hero:
                  // Reorder only when un-garrisoned... though user won't see this either way because in classic mode garrisoned heroes are hidden from UI lists, but less changes in the store is good.
                  if (prop == objectSchema.garrisoned && now) { break }
                case this.map.constants.object.type.town:
                  if (obj.type == this.map.constants.object.type.town &&
                      prop == objectSchema.garrisoned) {
                    break
                  }
                  this._bumpListOrder(this.map.objects.fromContiguous(n).x, null, this.cx.get('classic'))
                default:
              }
              switch (prop) {
                case objectSchema.garrisoned:
                  if (obj.type != this.map.constants.object.type.hero) {
                    return
                  }
                  obj.displayOrder = Math.abs(obj.displayOrder) * (now ? -1 : 1)
                  // Don't update texture when hero leaves the town because to revert to "moving" texture we need to know hero's direction. This will be set by _moveOpt().
                  if (now) {
                    var group = this.map.constants.animation.group.visiting
                    obj.texture = Common.alterStringifiedArray(obj.texture, 4, group)
                    obj.animation = Common.alterStringifiedArray(obj.animation, 4, group)
                  }
                  break
                case objectSchema.owner:
                  old = new RegExp('(^|-)' + _.indexOf(this.playersID, old) + 'Owner-')
                  now = now ? _.indexOf(this.playersID, now) + 'Owner-' : ''
                  obj.texture = Common.alterStringifiedArray(obj.texture, 3, function (s) { return s.replace(old, '$1') + now })
                  obj.animation = Common.alterStringifiedArray(obj.animation, 3, function (s) { return s.replace(old, '$1') + now })
              }
              this.map.objects.batch(null, function () {
                this.map.objects.setAtContiguous(n + objectSchema.displayOrder, 0, obj.displayOrder)
                this.map.objects.setAtContiguous(n + objectSchema.texture, 0, obj.texture)
                var changed = this.map.objects.setAtContiguous(n + objectSchema.animation, 0, obj.animation)
                if (changed && obj.animation) {
                  var anim = Common.alterStringifiedArray(obj.animation)
                  anim = this.animationsID[anim[1] + '_' + anim[4]]
                  var duration = this.animations.atCoords(anim, 0, 0, 'duration', 0)
                  this.map.objects.setAtContiguous(n + objectSchema.duration, 0, duration)
                }
              }, this)
            },
            '^oremove',   // "^" is for unsetting garrisoned/visiting
            function (n, $1, props) {
              var check = function (prop) {
                if (props[prop] && this.map.objects.anyAtCoords(props[prop], 0, 0)) {
                  this.map.objects.setAtCoords(props[prop], 0, 0, 0, prop, false)
                }
              }.bind(this)
              switch (props[objectSchema.type]) {
                case this.map.constants.object.type.town:
                case this.map.constants.object.type.hero:
                  check(objectSchema.garrisoned)
                  check(objectSchema.visiting)
              }
              // hireDwelling window remains after objects are unlocked so can't rely on unpending_... to occur if any is removed.
              //
              // XXX maybe require do=leave and keep dwelling and hero locked (GE alive), then hook just one unpending_... and do screen reset there, like done with townscape?
              var id = this.map.objects.fromContiguous(n).x
              this.map.players.some(function (player) {
                if (player.get('screen') == 'hireDwelling' && (player.get('screenHero') == id || player.get('screenDwelling') == id)) {
                  return player.set('screen', '')
                }
              }, this)
            },
          ])

          this.autoOff(this.cx, {
            '+triggerSpotEffects': function (res, x, y, z, actor, rem, from, transition) {
              if (res == 'remove') { return }
              if (!rem && from && actor && actor.isHero && actor.get('vehicle') == this.constants.object.vehicle.ship && this.map.byPassable.atCoords(x, y, z, 'type', 0) == this.constants.passable.type.ground) {
                this._disembark(x, y, z, actor, from, transition)
                res = res || 'break'
              }
              var event
              if (this.cx.get('classic')) {
                this.map.bySpot.findAtCoords(x, y, z, 'actionable', function (act, $1, $2, $3, l, n) {
                  if (act === this.constants.spotObject.actionable.actionable &&
                      this.map.bySpot.atContiguous(n - this.map.bySpot.propertyIndex('actionable') + this.map.bySpot.propertyIndex('displayOrder'), l) >= 0 &&
                      this.map.bySpot.atContiguous(n - this.map.bySpot.propertyIndex('actionable') + this.map.bySpot.propertyIndex('type'), l) === this.constants.object.type.event) {
                    return event = true
                  }
                }, this)
              }
              var objects = []
              var noGuards
              var withHero
              this.map.bySpot.findAtCoords(x, y, z, 'actionable', function (act, $1, $2, $3, l, n) {
                var guarded
                n -= this.map.bySpot.propertyIndex('actionable')
                if ((act === this.constants.spotObject.actionable.actionable ||
                    // SoD has a bug: normally guards do not trigger if passing by using Angel Wings or Boots of Levitation; however, if stepping on an event (on water or ground), the hero stops which triggers the guards.
                    (guarded = this.map.bySpot.atContiguous(n + this.map.bySpot.propertyIndex('guarded'), l) === this.constants.spotObject.guarded.guarded && (event || rem === 0))) &&
                    this.map.bySpot.atContiguous(n + this.map.bySpot.propertyIndex('displayOrder'), l) >= 0) {
                  var id = this.map.bySpot.atContiguous(n + this.map.bySpot.propertyIndex('id'), l)
                  var cls = this.map.objects.atCoords(id, 0, 0, 'class', 0)
                  if (actor && id == actor.get('id')) {
                    // Skip self.
                  } else {
                    // XXX+I Must ignore guards when the triggered spot effects resulted in the hero not stepping on this spot. This means guards around the entered and exited monoliths are ignored, as are guards when attacking/trading with a hero. As a special exception, water-based guards around the boat are ignored when embarking (but ground guards around the disembarkation spot are not). But, for example, a guarded Lean To can be only interacted after defeating the guards. Currently we ignore guards when there's anything that will be acted upon except actionable without impassable (Event). UI cursor detection should be updated too.
                    noGuards = noGuards || (act === this.constants.spotObject.actionable.actionable && this.map.byPassable.atCoords(x, y, z, 'impassable', 0))
                    // If trading/attacking a hero, ignore all other actionables.
                    withHero = withHero || (this.map.bySpot.atContiguous(n + this.map.bySpot.propertyIndex('type'), l) == this.map.constants.object.type.hero)
                    var prio = this.map.objects.atCoords(id, 0, 0, 'type', 0) == this.map.constants.object.type.monster ? 3 : _.includes(this.objectsID.event, cls)
                    // First fight a monster standing on the spot (3+1), then monsters guarding the spot (3+0), then trigger Event (1+1), then the rest (0+1).
                    objects.push([id, cls, prio + !guarded, guarded])
                  }
                }
              }, this)
              var priorities = [false, 'break', 'stand', 'stop']
              objects.sort(function (a, b) { return b[2] - a[2] })
                .some(function (item) {
                  var id = item[0]
                  var cls = item[1]
                  if (noGuards && item[3]) {
                    return
                  }
                  if (!rem && (_.includes(this.objectsID.town.concat(this.objectsID.randomTown), cls) || (_.includes(this.objectsID.hero.concat(this.objectsID.randomHero, this.objectsID.heroPlaceholder), cls) && actor && actor.isHero))) {
                    var r = this._triggerTownOrHeroEffects(id, actor && actor.get('id'), _.includes(this.objectsID.town.concat(this.objectsID.randomTown), cls), true) || false
                  } else if (!withHero && actor && actor.isHero &&
                             ((item[3] ? event || rem === 0 : !rem) || _.includes(this.objectsID.event, cls))) {
                    var r = this._triggerObjectEffects(id, actor.get('id'), true, transition) || false
                  }
                  if (r != null) {
                    if (item[3]) { r = 'stand' }
                    if (r == 'remove') { return res = r }
                    var i1 = priorities.indexOf(res)
                    var i2 = priorities.indexOf(r)
                    i2 > i1 && (res = r)
                    if (item[2] >= 3) {
                      // Even if there are multiple guards, SoD ignores all but one (no matter if there was a combat or the monster has fled/joined) and on victory allows hero to stand on it, with continued encounter.
                      //
                      // XXX+C,I which monster of multiple guards is chosen? with max object ID (closest to right-bottom map corner)?
                      noGuards = true
                    }
                  }
                }, this)
              return res
            },
          })
        }

        var pathCosts = []
        this.autoOff(this.cx, {
          '+pathCostFor': function (res, id) {
            if (this.map.objects.atCoords(id, 0, 0, 'type', 0) == this.constants.object.type.hero) {
              var cost = pathCosts[id]
              if (!cost) {
                pathCosts[id] = cost = this.cx.makePathCost({hero: id})
                var n = this.map.objects.toContiguous(id, 0, 0, 0)
                this.map.objects.once('oremove_n_' + n, function () {
                  cost.remove()
                  delete pathCosts[id]
                })
              }
              return cost
            }
          },
        })

        if (this.cx.get('master')) {
          this.autoOff(this.map, {
            change_date: function (now) {
              _.log && _.log('-- Day %d dawns (%dd%dw%dm) --', now + 1, this.map.date().day, this.map.date().week, this.map.date().month)
              this._initializeDay()
              now % 7  || this._initializeWeek()
              now % 28 || this._initializeMonth()
            },

            '^change_bonus': function (now) {
              now = now.split(',')

              switch (+now[0]) {
                case this.map.constants.map.bonus.growth:
                  return this._growth(function (creature, current, growth, dwelling) {
                    if (this.map.objects.atCoords(dwelling, 0, 0, 'type', 0) == this.map.constants.object.type.dwelling) {
                      // Cap dwelling to 1 week's worth of growth, unless the dwelling already has more than that (shouldn't be possible to achieve normally).
                      return Math.max(current, growth)
                    } else {
                      return current + growth
                    }
                  })

                case this.map.constants.map.bonus.horde:
                  var rates = _.object.apply(_, _.partition(now.slice(2), function ($, i) { return i % 2 == 0 }))
                  return this._growth(function (creature, current, growth, dwelling) {
                    if (this.map.objects.atCoords(dwelling, 0, 0, 'type', 0) == this.map.constants.object.type.dwelling) {
                      current = Math.max(current, growth)
                    } else {
                      current += growth
                    }
                    // XXX=C does doubling happen before or after adding creature growth?
                    //
                    // XXX=C does horde affect dwellings in the way it's implemented?
                    var rate = rates[creature]
                    if (rate) {
                      var times = _.includes(rate, '.')
                      current = times ? current * rate | 0 : current + +rate
                    }
                    return Math.max(0, current)
                  })

                case this.map.constants.map.bonus.plague:
                  var times = _.includes(now[2], '.')
                  return this._growth(function (creature, current, growth, dwelling) {
                    current = times ? current * now[2] | 0 : current + +now[2]
                    return Math.max(0, current)
                  })
              }
            },
          })
        }
      },

      render: '_initializeMap',

      '-unnest': function () {
        if (this._parent) {
          // Remember we can get removed during configuring, before attach.
          this.map && this.map.shroud.remove()
          clearInterval(this._heartbeatTimer)
        }
      },
    },

    // Called by environment from dataReady.
    //
    // In multi-player mode, this logic is part of WebSocket.Server.Client but unlike with most in-game commands it is very different in master and slave modes and cannot be part of `#RPC. Therefore in single-player mode, Rules acts as a "mini-server".
    initializeSinglePlayer: function () {
      if (!this.cx.players.some(Common.p('isHuman'))) {
        this.cx.players.some(function (pl) {
          var i = _.findIndex(pl.get('controllers'), function (c) {
            return c.type == 'human'
          })
          return i != -1 && pl.set('controller', i)
        })
      }

      this.cx.map.set('confirming', false)
      this.cx.players.invoke('assignResp', {connected: true, host: true})

      this.autoOff(this.cx, {
        '=clientCounts': function (sup, player) {
          return [0, +player.isHuman()]
        },
      })

      // clientCounts hooked, notify.
      this.cx.players.each(this.cx.clientCountsChanged, this.cx)

      this.autoOff(this.cx.players, {
        '.change': function (player, opt) {
          if (opt == 'controller' || opt == 'controllers') {
            this.cx.clientCountsChanged(player)
            // SoD doesn't allow picking hero for CPU. XXX=R Duplicates with WebSocket.Server.Client.
            player.isHuman() || player.set('heroes', [null])
          }
        },
      })
    },

    // Called from owned.
    _initializeMenu: function () {
      var cx = this.cx

      function updateLabel(player) {
        var clients = cx.clientCounts(player)
        // We don't know if H3.Rules' hook on dataReady is called before the environment sets up clientCounts...(). If so, do nothing yet; the environment will fire clientCountsChanged when it sets things up and we'll update then.
        if (!clients) { return }

        var labels = {
          'h,0,0': '???',
          'h,1,0': '???, Obs.',
          'h,2,0': '???, Obs. (' + clients[0] + ')',
          'h,0,1': 'Player',
          'h,1,1': 'Player, Obs.',
          'h,2,1': 'P., Obs. (' + clients[0] + ')',
          'h,0,2': 'Players (' + clients[1] + ')',
          'h,1,2': 'P. (' + clients[1] + '), Obs.',
          'h,2,2': 'P. (' + clients[1] + '), Obs. (' + clients[0] + ')',
          'c,0,0': 'Computer',
          'c,1,0': 'CPU, Obs.',
          'c,2,0': 'CPU, Obs. (' + clients[0] + ')',
          'c,0,1': '???',
          'c,1,1': '???, Obs.',
          'c,2,1': '???, Obs. (' + clients[0] + ')',
          'c,0,2': '??? (' + clients[1] + ')',
          'c,1,2': '??? (' + clients[1] + '), Obs.',
          'c,2,2': '??? (' + clients[1] + '), Obs. (' + clients[0] + ')',
        }

        var label = labels[[
          player.isHuman() ? 'h' : 'c',
          Math.min(2, clients[0]),
          Math.min(2, clients[1]),
        ]]

        // XXX=RH strings here and above
        player.set('label', (player.get('host') ? 'H. ' : '') + label)
      }

      function addAI() {
        cx.players.each(function (player) {
          var controller = player.get('controllers')[player.get('controller')]

          switch (controller.type) {
            default:
              console && console.warn('Unknown controller type: ' + controller.type)
            case 'ai':
            case 'neutralAI':
              var options = _.extend({}, controller, {
                rpc: cx.rpcFor(player.get('player')),
                player: player,
              })
              if (controller.type == 'neutralAI') {
                cx.addModule(AI.Neutral, options)
              } else {
                //return cx.addModule(AI_Nop, options)
                controller.behavior == 'nop' ? cx.addModule(AI_Nop, options)
                  : cx.addModule(AI, options)
              }
            case 'human':
          }
        })
      }

      this.autoOff(this.cx, {
        change_configuring: function (now, old) {
          if (!now && old.isSuccessful()) {
            addAI()
          }
        },

        dataReady: function () {
          this.cx.get('configuring') || addAI()
          cx.players.each(updateLabel)

          this.autoOff(cx, {
            clientCountsChanged: updateLabel,
          })

          this.autoOff(cx.players, {
            '.change': Common.batchGuard(4, function ($0, $1, $2, $3, options) {
              options.batched.forEach(function (item) {
                if (cx.players.nested(item[0])) {
                  var found = item[1].some(function (event) {
                    switch (event[1]) {
                      case 'controllers':
                      case 'controller':
                      case 'host':
                        return event[0] == 'change'
                    }
                  })

                  found && updateLabel(item[0])
                }
              })
            }),

            nestExNew: function (res) {
              updateLabel(res.child)
            },
          })
        },
      })
    },

    // If isTown then id is a town and actor is a hero or none. Else both id and actor are heroes.
    _triggerTownOrHeroEffects: function (id, actor, isTown, toPending) {
      if (actor && this.players.nested(this.map.objects.atCoords(id, 0, 0, 'owner', 0)).get('team') != this.players.nested(this.map.objects.atCoords(actor, 0, 0, 'owner', 0)).get('team')) {
        var action = 'combat'
      } else if (!isTown || toPending === 0) {
        var gar = this.map.objects.atCoords(id, 0, 0, 'garrisoned', 0)
        var vis = !gar && this.map.objects.atCoords(id, 0, 0, 'visiting', 0)
        if (gar || vis) {
          return
        }
        action = 'trade'
        isTown = [this.map.objects.atCoords(actor, 0, 0, 'visiting', 0)]
      } else {
        var vis = actor && this.map.objects.atCoords(id, 0, 0, 'visiting', 0)
        if (vis && vis != actor) {
          action = 'trade'
          isTown = [vis, this.map.objects.atCoords(actor, 0, 0, 'visiting', 0)]
        } else {
          action = 'visit'
        }
      }

      if (toPending) {
        if (action == 'combat') {
          return this._heroCombat(actor, id, isTown)
        } else if (action == 'visit') {
          this.map.players.nested(this.map.objects.atCoords(id, 0, 0, 'owner', 0))
            .assignResp({screen: 'townscape', screenTown: id})

          this.objectPending([id].concat(actor || []), ['townEncounter', actor, !actor])
          return
        } else {
          // Finished by do=heroTrade.
          this.objectPending([id, actor].concat(_.compact(isTown)), ['townEncounter', isTown.length == 1 ? 0 : null])
          return 'stop'
        }
      }

      if (action == 'visit') {
        var townscapeTransition = this.map.transitions.nest({
          type: 'townscape',
          town: id,
          hero: actor,
        })
          .collect()

        actor && this.map.objects.batch(null, function () {
          this.setAtCoords(id, 0, 0, 0, 'visiting', actor)
          this.setAtCoords(actor, 0, 0, 0, 'visiting', id)
        })

        // Towns are kind of encounters. Using GenericEncounter allows implementing buildings as encounter Effects (e.g. Stables). However, there are some nuances:
        // 1. ifBuilding selector is used to separate Effects of different buildings (e.g. Mana Vortex works once per week but Battle Scholar Academy works for every hero, once; one shouldn't prevent the other from triggering).
        // 2. quest_... targets except quest_fulfilled are generally misfit for towns and may malfunction.
        var buildings = this.cx.oneShotEffectCalculation({
          class: Calculator.Effect.GenericIntArray,
          target: this.constants.effect.target.town_buildings,
          ifObject: id,
        })

        var gar = this.map.objects.atCoords(id, 0, 0, 'garrisoned', 0)
        var vis = this.map.objects.atCoords(id, 0, 0, 'visiting', 0)
        buildings = [].concat(
          gar ? _.zip(buildings, _.fill(buildings, gar)) : [],
          vis ? _.zip(buildings, _.fill(buildings, vis)) : []
        )

        // XXX=I newly built building should also trigger its encounter, immediately
        var encounter = function () {
          var building = buildings.shift()

          if (building) {
            switch (building) {
              case this.buildingsID.mageGuild1:
              case this.buildingsID.mageGuild2:
              case this.buildingsID.mageGuild3:
              case this.buildingsID.mageGuild4:
              case this.buildingsID.mageGuild5:
                // XXX=C SoD usually automatically adds spells into visiting and garrisoned heroes' books but sometimes this happens only if explicitly opening Mage Guild. Research.
                //
                // XXX Spells should be also automatically transferred after building or upgrading Mage Guild (right?). Maybe remake do=openMageGuild into an encounter effect?
                this.rpc.do('openMageGuild', {town: id})
            }

            var options = {
              rules: this,
              bonus: id,
              hero: building[1],
              selectors: {ifBuilding: building[0]},
              transitionOptions: {
                townscapeTransition: townscapeTransition._parentKey,
              },
            }

            // As with other encounters, building's encounter effects must not remove town, hero or building during encounter.
            ;(new Rules.GenericEncounter(options))
              .on({
                '=_initializeRandom': Common.stub,
                // Don't mess with the town's $garrison.
                '=_handle_initGarrison': function () {
                  this.set('state', 'quest')
                },
                unnest: encounter,
              })
              .attach()
              .handle()
          } else {
            townscapeTransition.collectFinal()
            this.objectFinished([id].concat(actor || []))
          }
        }.bind(this)

        encounter()
      } else {
        isTown.length == 2 && (id = isTown[0])

        var examine = function (targetObject, target, from, to, availableSpells, scholarSpells) {
          var calc = this.cx.oneShotEffectCalculator({
            class: Calculator.Effect.GenericIntArray,
            target: this.map.constants.effect.target.hero_spells,
            ifObject: targetObject,
          }).takeRelease()
          var spells = calc.get('value')
          availableSpells.push.apply(availableSpells, spells)

          // XXX=R duplicates with H3.DOM.Bits
          var atter = this.map.effects.atter(['source', 'modifier'])
          var seen = []
          calc.get('affectors').forEach(function (n) {
            var effect = atter(n, 0)
            switch (effect.source) {
              case this.map.constants.effect.source.trade:
                scholarSpells.push.apply(scholarSpells, effect.modifier.slice(1))
              case this.map.constants.effect.source.initial:
              case this.map.constants.effect.source.initialize:
              case this.map.constants.effect.source.encounter:
              case this.map.constants.effect.source.level:
                seen.push.apply(seen, [].concat(effect.modifier.slice(1)))
            }
          }, this)
          spells = _.intersection(spells, seen)

          return spells.filter(function (spell) {
            var give = this.cx.oneShotEffectCalculation({
              class: Calculator.Effect.GenericBool,
              target: target,
              ifObject: from,
              ifSpell: spell,
            })

            if (give) {
              // Tested with SoD: two trading heroes; the giver has no Wisdom, Expert Scholar and a 4th level spell assigned via the editor; the receiver has Expert Wisdom, no Scholar - and he receives the spell.
              var learn = this.cx.oneShotEffectCalculation({
                target: this.map.constants.effect.target.spellLearn,
                ifObject: to,
                ifSpell: spell,
              })
              return learn && learn >= _.random(this.constants.effect.multiplier)
            }
          }, this)
        }.bind(this)

        var fromAvailableSpells = []
        var fromScolarSpells = []
        var fromGives = examine(actor, this.map.constants.effect.target.spellTradeGive, actor, id, fromAvailableSpells, fromScolarSpells)
        var fromTakes = examine(id, this.map.constants.effect.target.spellTradeTake, actor, actor, [], [])
        var toAvailableSpells = []
        var toScolarSpells = []
        var toGives = examine(id, this.map.constants.effect.target.spellTradeGive, id, actor, toAvailableSpells, toScolarSpells)
        var toTakes = examine(actor, this.map.constants.effect.target.spellTradeTake, id, id, [], [])
        var fromNew = _.difference(_.unique(fromTakes.concat(toGives)), fromScolarSpells)
        var toNew = _.difference(_.unique(fromGives.concat(toTakes)), toScolarSpells)

        // In case both heroes have Scholar, SoD picks one with the highest mastery (if both have the same mastery then it picks the actor) and ignores Scholar of the other hero - but what we do probably has the same effect as long as there is only one source of spellTrade* - the Scholar skill.

        // XXX+R combine with existing effect instead of always adding new (as in other places)
        fromNew.length && this.map.effects.append({
          source: this.map.constants.effect.source.trade,
          target: this.map.constants.effect.target.hero_spells,
          modifier: [this.map.constants.effect.operation.append].concat(fromNew),
          priority: this.map.effects.priority(this.map.constants.effect.operation.append, this.map.constants.effect.priority.mapSpecific),
          ifObject: actor,
        })

        toNew.length && this.map.effects.append({
          source: this.map.constants.effect.source.trade,
          target: this.map.constants.effect.target.hero_spells,
          modifier: [this.map.constants.effect.operation.append].concat(toNew),
          priority: this.map.effects.priority(this.map.constants.effect.operation.append, this.map.constants.effect.priority.mapSpecific),
          ifObject: id,
        })

        // Store all learned spells but show only previously unknown spells in the message.
        fromNew = _.difference(fromNew, fromAvailableSpells)
        toNew = _.difference(toNew, toAvailableSpells)

        if (fromNew.length || toNew.length) {
          // Scholar mastery is used informationally, to match hero order in the message with SoD's.
          var fromScholar = this.cx.oneShotEffectCalculation({
            target: this.map.constants.effect.target.skillMastery,
            ifObject: actor,
            ifSkill: this.skillsID.scholar,
          })
          var toScholar = this.cx.oneShotEffectCalculation({
            target: this.map.constants.effect.target.skillMastery,
            ifObject: id,
            ifSkill: this.skillsID.scholar,
          })
          this.map.transitions.nest({
            type: 'scholarMessage',
            from: fromScholar >= toScholar ? actor : id,
            fromNew: fromScholar >= toScholar ? fromNew : toNew,
            to: fromScholar < toScholar ? actor : id,
            toNew: fromScholar < toScholar ? fromNew : toNew,
          })
            .collectFinal()
        }

        this.map.transitions.nest({
          type: 'heroTrade',
          hero: actor,
          other: id,
        })
          .collectFinal()
      }
    },

    _heroCombat: function (attacker, defender, defenderTown) {
      if (!defenderTown) {
        var gar = this.map.objects.atCoords(defender, 0, 0, 'garrisoned', 0)
        var vis = !gar && this.map.objects.atCoords(defender, 0, 0, 'visiting', 0)
        if (gar || vis) {
          // Attacked hero may be garrisoned or visiting - in this case his spot is the same as the town he's in, and the attacker always interacts with 2 or 3 actionable objects in one move: town, garrisoned hero (if any), visiting hero (if any). If town is unprotected, attacker interacts with it only. This means we should skip interaction with garrisoned and visiting heroes since they are always accompanied by town interaction. Else we'd enqueue multiple combats.
          return 'stop'
        }
      } else {
        var gar = this.map.objects.atCoords(defender, 0, 0, 'garrisoned', 0)
        var vis = this.map.objects.atCoords(defender, 0, 0, 'visiting', 0)
        if (gar && vis) {
          defender = vis
          defenderTown = false
        } else if (!gar && !vis && !this.map.objects.readSubAtCoords(defender, 0, 0, 'garrison', 0).hasObjects()) {
          this._townCaptured(defender, this.map.objects.atCoords(attacker, 0, 0, 'owner', 0))
          this.map.objects.batch(null, function () {
            this.setAtCoords(defender, 0, 0, 0, 'visiting', attacker)
            this.setAtCoords(attacker, 0, 0, 0, 'visiting', defender)
          })
          this._triggerTownOrHeroEffects(defender, attacker, true, true)
          return
        } else {
          defenderTown = defender
          defender = gar || vis || defenderTown
        }
      }

      this.objectPending([attacker, defender].concat(!defenderTown || defender == defenderTown ? [] : [defenderTown]), ['combatEncounter', defenderTown])
      return 'stop'
    },

    // XXX+I SoD has special behaviour when defending a town with visiting hero but none garrisoned: it combines garrisons of town and hero; if there are more different creatures then slots then some algorithm is used to leave certain town creatures in town, i.e. omit from combat; if defender wins, those extra creatures remain in town intact; if he loses, they are removed (town's garrison is cleared upon defeat); we currently don't do any of this - if the hero loses, the attacker will have to attack the town's garrison next (both combats happen with fortifications)
    _heroCombatRun: function (attacker, defender, defenderTown) {
      var combat = this.map.combats.find(function (combat) {
        return combat.parties.some(function (party) {
          // Since we're $pending and since an object can be part of one combat at a time, it's enough to check just attacker or defender to find our combat.
          return party.object && party.object.get('id') == attacker
        })
      })

      if (!combat) {  // not resuming a loaded game
        var attackerTactics = this.cx.oneShotEffectCalculation({
          target: this.constants.effect.target.tacticsDistance,
          ifObject: attacker,
          ifBonusObject: defender,
        })

        var defenderTactics = this.cx.oneShotEffectCalculation({
          target: this.constants.effect.target.tacticsDistance,
          ifObject: defender,
          ifBonusObject: attacker,
        })

        var fortifications = this.cx.oneShotEffectCalculation({
          class: Calculator.Effect.GenericIntArray,
          target: this.constants.effect.target.fortifications,
          ifObject: defender,
          ifBonusObject: attacker,
        })

        var parties = [
          {
            object: this.map.representationOf(attacker),
            placement: 'l',
            tactics: attackerTactics >= defenderTactics ? attackerTactics : 0
          },
          {
            object: this.map.representationOf(defender),
            placement: 'r',
            tactics: attackerTactics < defenderTactics ? defenderTactics : 0,
            fortifications: fortifications,
            // Use Castle's graphics for fortifications if setting up fortifications outside of any town (non-SoD feature).
            fortificationsTown: defenderTown ? this.map.objects.atCoords(defenderTown, 0, 0, 'subclass', 0) : this.townsID.castle,
          },
        ]

        combat = (new Combat.Generator({
          map: this.map,
          rules: this,
          mapCoords: _.object(['x', 'y', 'z'], this.map.actionableSpot(defender)),
          parties: parties,
        }))
          .generate()
      }

      this.autoOff(combat, {
        change_state: function (now) {
          if (now == 'end' &&
              // If any was removed, unpending_... happened so no need to objectFinish().
              (!defenderTown || this.map.objects.anyAtCoords(defenderTown, 0, 0)) &&
              this.map.objects.anyAtCoords(attacker, 0, 0) &&
              this.map.objects.anyAtCoords(defender, 0, 0)) {
            defenderTown && this._townCaptured(defender, this.map.objects.atCoords(attacker, 0, 0, 'owner', 0))
            this.objectFinished([attacker, defender].concat(!defenderTown || defender == defenderTown ? [] : [defenderTown]))
          }
        },
      })

      this.rpc._startCombat(combat)
    },

    _townCaptured: function (town, owner) {
      var calc = this.cx.oneShotEffectCalculator({
        class: Calculator.Effect.GenericIntArray,
        target: this.constants.effect.target.town_buildings,
        ifObject: town,
      })
        .takeRelease()

      if (_.includes(calc.get('value'), this.buildingsID.capitol)) {
        // towns doesn't yet list the newly captured town.
        var found = this.map.players.nested(owner).towns.some(function (obj) {
          var buildings = this.cx.oneShotEffectCalculation({
            class: Calculator.Effect.GenericIntArray,
            target: this.constants.effect.target.town_buildings,
            ifObject: obj.get('id'),
          })

          return _.includes(buildings, this.buildingsID.capitol)
        }, this)

        if (found) {
          calc.get('affectors').some(function (n) {
            var src = this.map.effects.atContiguous(n + this.map.effects.propertyIndex('source'), 0)
            if (src == this.constants.effect.source.initialize) {
              var mod = this.map.effects.atContiguous(n + this.map.effects.propertyIndex('modifier'), 0)
              if (mod[0] == this.constants.effect.operation.append) {
                this.map.effects.setAtContiguous(n + this.map.effects.propertyIndex('modifier'), 0, [mod[0], this.buildingsID.cityHall].concat(_.without(mod.slice(1), this.buildingsID.capitol)))
                return true
              }
            }
          }, this)
        }
      }

      this.map.objects.setAtCoords(town, 0, 0, 0, 'owner', owner)
    },

    _disembark: function (x, y, z, actor, from, moveTransition) {
      var opt = this.rpc._moveOpt(actor, [x, y, z], {vehicle: this.constants.object.vehicle.horse})
      opt.actionPoints = this.cx.oneShotEffectCalculation({
        initial: actor.get('actionPoints'),
        target: this.constants.effect.target.hero_embarkCost,
        ifObject: actor.get('id'),
        ifBonusObject: 0,
        ifX: x,
        ifY: y,
        ifZ: z,
      })
      var cls = _.sample(this.objectsID['boat_' + (Common.alterStringifiedArray(opt.texture)[1].match(/\d+/)[0] - 1)])
      var catter = this.classes.atter([
        // XXX=R:clc:
        'type', 'texture', 'animation', 'duration', 'width', 'height', 'miniMap', 'passableType', 'passable', 'actionable', 'actionableFromTop'])
      var boat = catter(cls, 0, 0, 0)
      var act = this.map.actionableSpot(boat, true)
      _.extend(boat, {
        class: cls,
        subclass: false,
        x: from[0] - act[0],
        y: from[1] - act[1],
        z: from[2],
        mirrorX: opt.mirrorX,
        //mirrorY: opt.mirrorY,
        // XXX=R:dor:
        displayOrder: 1 << 26 | from[1] - act[1] + boat.height - 1 << 18 | 3 << 16 | (from[0] - act[0]) << 2,
      })
      _.each(['texture', 'animation'], function (prop) {
        boat[prop] = Common.alterStringifiedArray(boat[prop], 4,
          Common.alterStringifiedArray(opt[prop])[4])
      })
      var cls = this.heroes.atCoords(actor.get('subclass'), 0, 0, 'class', 0)
      // XXX=R: h3t:
      cls = _.sample(this.objectsID['hero_' + cls])
      _.each(['texture', 'animation'], function (prop) {
        opt[prop] = Common.alterStringifiedArray(opt[prop], 1,
          Common.alterStringifiedArray(this.classes.atCoords(cls, 0, 0, prop, 0))[1])
      }, this)
      var transition = this.map.transitions.nest({
        type: 'mapDisembark',
        object: actor.get('id'),
        x: x,
        y: y,
        z: z,
      })
      transition.collect()
      var id = this.rules.createObject(boat, transition.options())
      actor.assignResp(opt, transition.options())
      transition.set('boat', id)
      transition.collectFinal()
      moveTransition.set('mapDisembark', transition._parentKey)
    },

    _triggerObjectEffects: function (id, actor, toPending, moveTransition, unique) {
      var cls = this.map.objects.atCoords(id, 0, 0, 'class', 0)
      var h3subclass = this.classes.atCoords(this.map.objects.atCoords(id, 0, 0, 'class', 0), 0, 0, 'subclass', 0)

      if (_.includes(this.objectsID.monolithOneWayEntrance, cls) ||
          _.includes(this.objectsID.monolithTwoWay, cls) ||
          _.includes(this.objectsID.subterraneanGate, cls) ||
          _.includes(this.objectsID.whirlpool, cls)) {
        actor = this.map.representationOf(actor)
        var pool = _.toArray(this.map.objects.atCoords(id, 0, 0, 'destination', 0) || [])
        pool = pool.filter(function (id) {
          return this.map.objects.anyAtCoords(id, 0, 0)
        }, this)
        if (pool.length) {
          var deterministic = pool.length == 1
          // Specifically not triggering spot effects on dest.
          //
          // XXX=RH
          var obj = this.map._actionableAtter(_.sample(pool), 0, 0, 0)
          pool = []
          this.map.walkObjectBox(obj, 1, function (pos) {
            if (+obj.actionable[pos.on]) {
              pool.push([pos.mx, pos.my, pos.mz])
            }
          })
          pool.length || pool.push([obj.x, obj.y, obj.z])
          var dest = _.sample(pool)
          var transition = this.map.transitions.nest({
            type: 'mapTeleport',
            object: actor.get('id'),
            bonus: id,
            deterministic: deterministic,
          })
          transition.collect()
          var act = this.map.actionableSpot(actor.get('id'), true)
          actor.assignResp({
            x: dest[0] - act[0],
            y: dest[1] - act[0],
            z: dest[2],
            // XXX=R:dor:
            displayOrder: 1 << 26 | dest[1] + actor.get('height') - 1 << 18 | 3 << 16 | dest[0] << 2,
          }, transition.options())
          transition.collectFinal()
          if (_.includes(this.objectsID.whirlpool, cls)) {
            var gar = this.map.objects.subAtCoords(actor.get('id'), 0, 0, 'garrison', 0)
            try {
              var creature
              var count
              var level = Infinity
              var slot
              gar.find(0, function ($, s) {
                var cr = gar.atCoords(s, 0, 0, 'creature', 0)
                var n = count = gar.atCoords(s, 0, 0, 'count', 0)
                var lv = this.creatures.atCoords(cr, 0, 0, 'level', 0)
                // XXX=C recheck how SoD determines the "weakest" stack; it seems not by fightValue/aiValue but simply by level and then by creature ID
                if (lv < level || (lv == level && (creature > cr || count > n))) {
                  creature = cr
                  count = n
                  level = lv
                  slot = s
                }
              }, this)
              if (count > 1) {
                var now = this.cx.oneShotEffectCalculation({
                  initial: count,
                  target: this.constants.effect.target.creature_whirlpoolPenalty,
                  ifObject: actor.get('id'),
                  ifBonusObject: id,
                })
                // XXX currently we treat low number as "set count to 1" if original count is above 1; think how to extend creature_whirlpoolPenalty to be able to specify removal even if original is > 1
                now < 1 && (now = 1)
                if (now == count) {
                  count = null    // no penalty, no message
                } else {
                  gar.setAtCoords(slot, 0, 0, 0, 'count', count = now)
                }
              } else if (gar.countObjects(false, 2) > 1) {
                // XXX need to apply creature_whirlpoolPenalty to count == 1 as well to allow Effects cancel stack removal
                gar.removeAtCoords(slot, 0, 0, 0)
              } else {
                count = null
              }
            } finally {
              gar.release()
            }
            if (count != null || this.cx.get('classic')) {
              // XXX=IC SoD: not shown if have Admiral's Hat but shown if don't have it and no stack was reduced
              //
              // XXX=IC SoD plays the sound upon showing the message if message is shown, or upon mapTeleport if not (we play on mapTeleport always)
              this.map.transitions.nest({
                bonus: id,
                hero: actor.get('id'),
                type: 'encounterMessage',
                // ADVEVENT.TXT[168]
                message: '`## Whirlpool\n\nA whirlpool engulfs your ship.  Some of your army has fallen overboard.',
              })
                .collectFinal()
            }
          }
        } else if (_.includes(this.objectsID.subterraneanGate, cls)) {
          this.map.transitions.nest({
            bonus: id,
            hero: actor.get('id'),
            type: 'encounterMessage',
            // ADVEVENT.TXT[153]
            message: '`{Audio CAVEHEAD`}Just inside the entrance you find a large pile of rubble blocking the tunnel. You leave discouraged.',
          })
            .collectFinal()
        }
        return dest && 'break'
      }

      if (_.includes(this.objectsID.boat, cls)) {
        actor = this.map.representationOf(actor)
        var dest = this.map.actionableSpot(id)
        var opt = this.rpc._moveOpt(actor, dest, {vehicle: this.constants.object.vehicle.ship})
        opt.actionPoints = this.cx.oneShotEffectCalculation({
          initial: actor.get('actionPoints'),
          target: this.constants.effect.target.hero_embarkCost,
          ifObject: actor.get('id'),
          ifBonusObject: id,
          ifX: dest[0],
          ifY: dest[1],
          ifZ: dest[2],
        })
        _.each(['texture', 'animation'], function (prop) {
          var cur = Common.alterStringifiedArray(this.map.objects.atCoords(id, 0, 0, prop, 0))[1]
          opt[prop] = Common.alterStringifiedArray(opt[prop], 1, cur)
          if (prop == 'animation') {
            var anim = this.animationsID[cur + '_' + Common.alterStringifiedArray(opt.animation)[4]]
            opt.duration = this.animations.atCoords(anim, 0, 0, 'duration', 0)
          }
        }, this)
        var transition = this.map.transitions.nest({
          type: 'mapEmbark',
          object: actor.get('id'),
          boat: id,
        })
        transition.collect()
        this.map.objects.removeAtCoords(id, 0, 0, 0, transition.options())
        actor.assignResp(opt, transition.options())
        transition.collectFinal()
        moveTransition.set('mapEmbark', transition._parentKey)
        return 'break'
      }

      // XXX=I altarOfSacrifice
      // XXX=I blackMarket
      // XXX=I denOfThieves
      // XXX=I freelancerGuild
      // XXX+I hillFort
      // XXX=I obelisk
      // XXX+I refugeeCamp
      // XXX=I sirens
      // XXX+I tradingPost
      // XXX=I university
      var stepOn = 'abandonedMine alchemistLab arena borderGate cartographer corpse coverOfDarkness creatureBank crypt crystalMine derelictShip dragonUtopia event eyeOfMagi faerieRing fountainOfFortune fountainOfYouth gardenOfRevelation gemPond goldMine hutOfMagi idolOfFortune keymasterTent leanTo learningStone libraryOfEnlightenment lighthouse magicSpring magicWell marlettoTower mercenaryCamp mysticalGarden oasis orePit pillarOfFire pyramid rallyFlag redwoodObservatory sanctuary sawmill schoolOfMagic schoolOfWar seerHut shrineOfMagicGesture shrineOfMagicIncantation shrineOfMagicThought sign stables starAxis sulfurDune swanPond temple treeOfKnowledge wagon warriorTomb wateringHole waterWheel windmill witchHut monolithOneWayExit garrison antimagicGarrison warMachineFactory shipyard'

      var obstacle = 'artifact borderGuard buoy campfire flotsam mermaids monster oceanBottle pandoraBox prison questGuard randomArtifact randomMajorArtifact randomMinorArtifact randomMonster randomMonster1 randomMonster2 randomMonster3 randomMonster4 randomMonster5 randomMonster6 randomMonster7 randomRelic randomResource randomTreasureArtifact resource scholar seaChest shipwreck shipwreckSurvivor spellScroll treasureChest tavern'

      var isDwelling = this.map.objects.atCoords(id, 0, 0, 'type', 0) == this.map.constants.object.type.dwelling

      stepOn = _.some(stepOn.split(' '), function (name) {
        return this.objectsID[name].indexOf(cls) != -1
      }, this)

      obstacle = _.some(obstacle.split(' '), function (name) {
        return this.objectsID[name].indexOf(cls) != -1
      }, this)

      if (!isDwelling && !stepOn && !obstacle) { return }

      if (toPending) {
        if (this.objectsID.borderGate.indexOf(cls) != -1) {
          obstacle = !(new Rules.GenericEncounter({
            rules: this,
            bonus: id,
            hero: actor,
          }))
            .attach()
            .checkFulfilled()
          // XXX+I pathfinder should regard a fulfilled borderGate as fully passable (even though cursor shows it's interactive it does nothing)
        }

        // If changing list of objects, update _combat() checks for existence.
        this.objectPending([id, actor], ['encounter', null, moveTransition && moveTransition._parentKey, Common.Sqimitive.unique('toe')])

        if (_.includes(this.objectsID.event, cls)) {
          // See the comment in +triggerSpotEffects above.
          if (!this.cx.get('classic')) {
            var terrain = this.cx.oneShotEffectCalculation({
              class: Calculator.Effect.GenericIntArray,
              target: this.constants.effect.target.hero_stopTerrain,
              ifObject: actor,
            })
            var act = this.map.actionableSpot(actor)
            if (!_.includes(terrain, this.map.byPassable.atCoords(act[0], act[1], act[2], 'type', 0))) {
              return  // trigger Event and continue move if cannot stand on spot
            }
          }
          return 'stand'
        }

        return obstacle && 'stop'
      }

      // XXX+I: mof: implement monster fleeing
      var enc = new Rules.GenericEncounter({
        rules: this,
        bonus: id,
        hero: actor,
      })

      enc.autoOff(this.map.objects, {
        'unpending_encounter': function () {
          arguments[4] == unique && this.remove()
        },
      })

      // Extensions to encounter effects defined in databank-objects.php.
      if (_.includes(this.objectsID.pandoraBox, cls) ||
          _.includes(this.objectsID.event, cls) ||
          // Monsters.
          _.includes(this.objectsID.monster, cls) ||
          _.includes(this.objectsID.randomMonster, cls) ||
          _.includes(this.objectsID.randomMonster1, cls) ||
          _.includes(this.objectsID.randomMonster2, cls) ||
          _.includes(this.objectsID.randomMonster3, cls) ||
          _.includes(this.objectsID.randomMonster4, cls) ||
          _.includes(this.objectsID.randomMonster5, cls) ||
          _.includes(this.objectsID.randomMonster6, cls) ||
          _.includes(this.objectsID.randomMonster7, cls)) {
        if (_.includes(this.objectsID.pandoraBox, cls)) {
          enc.on('=_handle_prompt', function (sup) {
            if (this._bonus.proposal) {
              sup(this, arguments)
            } else {
              var msg = this.map.objects.atCoords(this.get('bonus'), 0, 0, 'message', 0)
              this.messageTransition({
                type: 'encounterPrompt',
                // ADVEVENT.TXT[14]
                prompt: 'Do you wish to open the box?' + (msg ? '' : '`{Audio MYSTERY`}'),
              })
            }
          })
          // XXX=IC SoD shows the message on ADVMAP's background, we show on combat
          enc.on('-_combat', function (sup) {
            this.messageTransition({
              type: 'encounterMessage',
              // ADVEVENT.TXT[16]
              // No audio in this message.
              message: 'You should have known better - you are attacked!',
            })
          })
        }
        enc.on('-_handle_prompt', function () {
          var msg = this.map.objects.atCoords(this.get('bonus'), 0, 0, 'message', 0)
          if (msg) {
            this.messageTransition({
              type: 'encounterMessage',
              message: msg,
            })
          }
        })
      } else if (_.includes(this.objectsID.warriorTomb, cls)) {
        enc.on('=_handle_prompt', function (sup) {
          if (this._bonus.proposal) {
            sup(this, arguments)
          } else {
            this.messageTransition({
              type: 'encounterPrompt',
              // ADVEVENT.TXT[161]
              prompt: '`{Audio GRAVEYARD`}You have come upon the resting place of a nameless warrior.  Do you wish to search the tomb?',
            })
          }
        })
      } else if (_.includes(this.objectsID.prison, cls)) {
        enc.on('-_handle_remove', function () {
          // XXX=I new hero object should respect quest removal transition (currently prison disappears when actor moves to it but new hero appears immediately, before that)
          var hero = this.map.objects.atCoords(id, 0, 0, 'subclass', 0)
          var cls = this.rules.heroes.atCoords(this.map.objects.atCoords(hero, 0, 0, 'subclass', 0), 0, 0, 'class', 0)
          // XXX=R:h3t:
          cls = _.sample(this.rules.objectsID['hero_' + cls])
          this.map.objects.batch(null, function () {
            var mirrorX = false
            _.each(['texture', 'animation', 'duration'], function (prop) {
              var cur = this.rules.classes.atCoords(cls, 0, 0, prop, 0)
              if (prop == 'texture' || prop == 'animation') {
                if (this.rules.cx.get('classic')) {
                  var ofActor = this.rules.constants.animation.group.visiting
                } else {
                  mirrorX = this.map.objects.atCoords(actor, 0, 0, 'mirrorX', 0)
                  var ofActor = this.map.objects.atCoords(actor, 0, 0, prop, 0)
                  ofActor = Common.alterStringifiedArray(ofActor)[4]
                  switch (+ofActor) {
                    case this.rules.constants.animation.group.up:
                      ofActor = this.rules.constants.animation.group.down
                      break
                    case this.rules.constants.animation.group.upRight:
                      ofActor = this.rules.constants.animation.group.downRight
                      mirrorX = !mirrorX
                      break
                    case this.rules.constants.animation.group.down:
                      ofActor = this.rules.constants.animation.group.up
                      break
                    case this.rules.constants.animation.group.downRight:
                      ofActor = this.rules.constants.animation.group.upRight
                      mirrorX = !mirrorX
                    case this.rules.constants.animation.group.right:
                      mirrorX = !mirrorX
                      break
                  }
                }
                cur = Common.alterStringifiedArray(cur, 4, ofActor)
              }
              this.map.objects.setAtCoords(hero, 0, 0, 0, prop, cur)
            }, this)
            this.map.objects.setAtCoords(hero, 0, 0, 0, 'mirrorX', mirrorX)
            var act = this.map.actionableSpot(hero, true)
            this.map.objects.setAtCoords(hero, 0, 0, 0, 'x', this._bonusSpot[0] - act[0])
            this.map.objects.setAtCoords(hero, 0, 0, 0, 'y', this._bonusSpot[1] - act[1])
            // XXX=R:dor:
            this.map.objects.setAtCoords(hero, 0, 0, 0, 'displayOrder', 1 << 26 | this._bonusSpot[1] + this.map.objects.atCoords(hero, 0, 0, 'height', 0) - 1 << 18 | 3 << 16 | this._bonusSpot[0] << 2)
            this.map.objects.setAtCoords(hero, 0, 0, 0, 'owner', this.map.objects.atCoords(actor, 0, 0, 'owner', 0))
            // Not setting vehicle, assuming Prison is always on land and h3m2json.php sets hero vehicle to horse (fromH3m_Hero()).
          }, this)
          this.rules._regenHero(this.map.representationOf(hero))
        })
      } else if (_.includes(this.objectsID.pyramid, cls)) {
        enc.on('=_handle_prompt', function (sup) {
          if (this._bonus.proposal) {
            sup(this, arguments)
          } else {
            this.messageTransition({
              type: 'encounterPrompt',
              // ADVEVENT.TXT[105]
              prompt: '`{Audio MYSTERY`}You come upon the pyramid of a great and ancient king.  You are tempted to search it for treasure, but all the old stories warn of fearful curses and magical guardians.  Will you search?',
            })
          }
        })
      } else if (_.includes(this.objectsID.creatureBank.concat(this.objectsID.shipwreck, this.objectsID.derelictShip, this.objectsID.crypt, this.objectsID.dragonUtopia), cls)) {
        enc.on('=_handle_prompt', function (sup) {
          if (!this._bonus.proposal) {
            if (_.includes(this.rules.objectsID.shipwreck, cls)) {
              // ADVEVENT.TXT[122]
              var msg = '`{Audio ROGUE`}`## Shipwreck\n\nThe rotting hulk of a great pirate ship creaks eerily as it is pushed against the rocks.  Do you wish to search the shipwreck?'
            } else if (_.includes(this.rules.objectsID.derelictShip, cls)) {
              // ADVEVENT.TXT[41]
              var msg = '`{Audio ROGUE`}`## Derelict Ship\n\nThe rotting hulk of a great pirate ship creaks eerily as it is pushed against the rocks.  Do you wish to search the ship?'
            } else if (_.includes(this.rules.objectsID.crypt, cls)) {
              // ADVEVENT.TXT[119]
              var msg = '`{Audio GRAVEYARD`}`## Crypt\n\nYou tentatively approach the burial crypt of ancient warriors.  Do you want to search the graves?'
            } else if (this._countCalc.get('value')) {
              // SoD doesn't show prompt for generic banks and Utopia if they have been already sacked. It shows for other 3 since they give negative Morale in such case.
            } else if (_.includes(this.rules.objectsID.dragonUtopia, cls)) {
              // ADVEVENT.TXT[47]
              var msg = '`{Audio DRAGON`}`## Dragon Utopia\n\nYou stand before the Dragon Utopia, a place off-limits to mere humans.  Do you wish to violate this rule and challenge the Dragons to a fight?'
            } else {
              var name = this.rules.banks.find(0, function ($1, id) {
                if (_.includes(this.atCoords(id, 0, 0, 'classes', 0), cls)) {
                  return this.atCoords(id, 0, 0, 'name', 0)
                }
              })
              // ADVEVENT.TXT[32]
              var msg = _.format(this.rules.cx.s('map', '`{Audio ROGUE`}You have found a %s.  Do you wish to attack the guards?'), name)
            }
          }
          if (msg == null) {
            sup(this, arguments)
          } else {
            this.messageTransition({
              type: 'encounterPrompt',
              prompt: msg,
            })
          }
        })
      } else if (isDwelling) {
        // SoD shows a prompt before the encounter if the dwelling has guardiants. We can't use $proposal/_handle_prompt() for that since garrison is not yet initialized and we don't know if it's empty or not.
        //
        // SoD also shows another prompt before hiring creatures (but after defeating the guards). It appears before checking if anyone is available for hire, so we can't use quest_choices (it goes after quest_fulfilled).
        enc.on('=_combat', function (sup, arg) {
          if (arg == _) {
            sup(this)
          } else {
            // Unlike the message for guarded object (like artifact, created in h3m2herowo.php), this one lists only the first creature, not strongest or all (tested on Golem Factory).
            var sub = this.map.objects.readSubAtCoords(this.get('bonus'), 0, 0, 'garrison', 0)
            // XXX=I count should be a word: "few", "several", etc. (XXX+C respecting garrisonSee?)
            var count
            var name
            sub.find(0, function ($1, slot) {
              var cr = sub.atCoords(slot, 0, 0, 'creature', 0)
              count = sub.atCoords(slot, 0, 0, 'count', 0)
              name = this.rules.creatures.atCoords(cr, 0, 0, count == 1 ? 'nameSingular' : 'namePlural', 0)
              return true
            }, this)

            // GENRLTXT.TXT[422]
            var msg = _.format(this.rules.cx.s('map', '`{Audio LOOPSWOR`}Much to your dismay, the %s is guarded by %s %s.\n\nDo you wish to fight the guards?'), this.rules.classes.atCoords(this.map.objects.atCoords(this.get('bonus'), 0, 0, 'class', 0), 0, 0, 'name', 0), count, name)

            this.messageTransition({
              type: 'encounterPrompt',
              prompt: msg,
            })
          }
        })
        enc.on('=promptAnswer', function (sup, accept) {
          switch (this.get('state')) {
            case 'initGarrison':
              return accept ? this._combat(_) : this.remove()
            case 'quest':
              return accept ? this._handle_quest(_)
                // Record granted and $owner.
                : this.set('state', 'remove')
            default:
              sup(this, arguments)
          }
        })
        // XXX=R duplicates with `{Checks`}
        function wordJoin(a, last) {
          for (var i = 0; i < a.length - 1; i++) {
            a[i] += i == a.length - 2 ? last : ', '
          }
          return a.join('')
        }
        enc.on('=_handle_quest', function (sup, arg) {
          if (arg == _) {
            sup(this)
          } else {
            var names = this._calc('GenericIntArray', 'hireAvailable')
              .map(function (cr) {
                return this.rules.creatures.atCoords(cr, 0, 0, 'namePlural', 0)
              }, this)

            // ADVEVENT.TXT[112] and 35, 36
            var msg = _.format(this.rules.cx.s('map', '`{Audio LOOPSWOR`}`## %s\n\nWould you like to recruit %s?'), this.rules.classes.atCoords(this.map.objects.atCoords(this.get('bonus'), 0, 0, 'class', 0), 0, 0, 'name', 0), wordJoin(names, ', or '))

            // XXX=IC SoD shows the message on ADVMAP's background, we show on combat
            this.messageTransition({
              type: 'encounterPrompt',
              prompt: msg,
            })
          }
        })

        enc.on('_handle_bonus', function () {
          // We are on master so can make changes to stores directly.

          var sub = this.map.objects.subAtCoords(this.get('bonus'), 0, 0, 'available', 0)
          var gar = this.map.objects.subAtCoords(this.get('hero'), 0, 0, 'garrison', 0)

          try {
            var creatures = _.partition(this._calc('GenericIntArray', 'hireAvailable'), function (cr) {
              sub.extendTo(cr)
              return this._calc('GenericBool', 'hireFree', {ifCreature: cr})
            }, this)

            var joined = []
            var noRoom = []
            var nobody = []

            gar.batch([sub], function () {
              gar.extendTo(7-1)   // XXX=RH

              _.each(creatures[0], function (cr) {
                if (sub.anyAtCoords(cr, 0, 0)) {
                  var count = sub.atCoords(cr, 0, 0, 0, 0)

                  if (count) {
                    var slot = 0

                    while (gar.anyAtCoords(slot, 0, 0) && gar.atCoords(slot, 0, 0, 'creature', 0) != cr) {
                      slot++
                    }

                    var name = this.rules.creatures.atCoords(cr, 0, 0, count == 1 ? 'nameSingular' : 'namePlural', 0)

                    if (slot >= 7) {  // XXX=RH
                      noRoom.push(name)
                    } else {
                      joined.push(_.format(this.rules.cx.s('map', '%d %s'), count, name))
                      sub.setAtCoords(cr, 0, 0, 0, 0, 0)

                      if (gar.anyAtCoords(slot, 0, 0)) {
                        gar.setAtCoords(slot, 0, 0, 0, 'count', gar.atCoords(slot, 0, 0, 'count', 0) + count)
                      } else {
                        gar.addAtCoords(slot, 0, 0, {
                          creature: cr,
                          count: count,
                        })
                      }
                    }

                    return
                  }
                }

                nobody.push(this.rules.creatures.atCoords(cr, 0, 0, 'namePlural', 0))
              }, this)
            }, this)

            joined.length && this.messageTransition({
              type: 'encounterMessage',
              // XXX=IC for single creature show: "A %s joins your army."
              //
              // ADVEVENT.TXT[186]
              message: _.format(this.rules.cx.s('map', '%s join your army.'), wordJoin(joined, ', and ')),
            })

            noRoom.length && this.messageTransition({
              type: 'encounterMessage',
              // GENRLTXT.TXT[426]
              message: _.format(this.rules.cx.s('map', "The %s would join your hero, but there aren't enough provisions to support them."), wordJoin(noRoom, ', and ')),
            })

            nobody.length && this.messageTransition({
              type: 'encounterMessage',
              // GENRLTXT.TXT[423]
              message: _.format(this.rules.cx.s('map', "There are no %s here to recruit."), wordJoin(nobody, ', or ')),
            })
          } finally {
            gar.release()
            sub.release()
          }

          if (creatures[1].length) {
            this.map.players.nested(this._hero.owner).assignResp({
              screen: 'hireDwelling',
              screenHero: actor,
              screenDwelling: id,
            })

            this.map.transitions.nest({
              type: 'hireDwelling',
              dwelling: id,
              hero: actor,
              moveTransition: moveTransition,
            })
              .collectFinal()
          }
        })
      } else if (_.includes(this.objectsID.abandonedMine, cls) && h3subclass == 7) {
        // Similarly to dwellings, SoD shows a prompt before combat if there guards. On win, it shows a confirmation. In any case (after win or if there were no guards), bonus_message (corresponding to the type of produced resources) is shown in the end as usual - that one is coming from labeled quest_chances Effects.
        var guarded = false
        enc.on('=_combat', function (sup, arg) {
          if (arg == _) {
            sup(this)
          } else {
            // Showing defeat confirmation message only if there was a combat. It's possible encounter was interrupted and we'd lose the guarded value and not show the confirmation, but it's a good trade off for simplisity.
            guarded = true
            this.messageTransition({
              type: 'encounterPrompt',
              // ADVEVENT.TXT[84]
              prompt: '`{Audio MYSTERY`}You come upon an abandoned mine.  The mine appears to be infested with Troglodytes.  Do you wish to enter?',
            })
          }
        })
        enc.on('=promptAnswer', function (sup, accept) {
          switch (this.get('state')) {
            case 'initGarrison':
              return accept ? this._combat(_) : this.remove()
            default:
              sup(this, arguments)
          }
        })
        enc.on('-_handle_quest', function () {
          if (guarded) {
            this.messageTransition({
              type: 'encounterMessage',
              // ADVEVENT.TXT[85]
              // No audio in this message.
              message: 'You beat the Troglodytes and are able to restore the mine to production.',
            })
          }
        })
        enc.on('+_initializeRandom', function (label) {
          var res = {
            abandM: this.map.constants.resources.mercury,
            abandC: this.map.constants.resources.crystal,
            abandJ: this.map.constants.resources.gems,
            abandG: this.map.constants.resources.gold,
            abandO: this.map.constants.resources.ore,
            abandS: this.map.constants.resources.sulfur,
          }
          if (res[label] == null) {
            throw new Error('Unknown Abandoned Mine quest_chances label')
          }
          this.map.objects.setAtCoords(this.get('bonus'), 0, 0, 0, 'subclass', res[label])
        })
      } else if (_.includes(this.objectsID.questGuard, cls) ||
                 _.includes(this.objectsID.seerHut, cls)) {
        var showFailure = true
        enc.on('-_handle_quest', function () {
          var calc = this._calcObject('GenericBool', 'quest_fulfilled')
          var found = (calc.get('checks') || []).some(function (check) { return check[0] != 'quest' })
          calc.release()
          if (found) {  // quest still active, no deadline
            // The task message should be shown only once per player and we need to store these flags somewhere so next time we know if to show it or not, and they should persist on reload. To avoid adding new fields into Map or elsewhere, peruse some target unneeded by this bonus object, like quest_placement.
            showFailure = this._calc('GenericString', 'quest_placement') == '$'
            if (!showFailure) {
              var msg = this.map.objects.atCoords(this.get('bonus'), 0, 0, 'message', 0)
              if (msg) {
                // msg may contain `{Checks`} which is normally only available after _handle_quest().
                this.questChecks = calc.get('checks') || []
                this.messageTransition({
                  type: 'encounterMessage',
                  message: msg,
                })
              }
              this.map.effects.append({
                target: this.map.constants.effect.target.quest_placement,
                ifBonusObject: this.get('bonus'),
                ifPlayer: this._hero.owner,
                modifier: '$',
                priority: this.map.effects.priority(this.map.constants.effect.operation.const, this.map.constants.effect.priority.mapSpecific),
              })
            }
          }
        })
        enc.on('=_questUnfulfilled', function (sup) {
          // Showing failure message only if this isn't the first encounter for the player. It'd be still shown if the encounter were interrupted, but it's a good trade off for simplisity.
          showFailure ? sup(this) : this.remove()
        })
        enc.on('_handle_bonus', function () {
          var creatures = {}
          var artifacts = new Set
          _.each(this.questChecks, function (check) {
            switch (check[0]) {
              case 'garrison':
                creatures[check[4]] = (creatures[check[4]] || 0) + check[2][0]
                break
              case 'artifact':
                artifacts.add(check[2])
            }
          })
          // We are on master so can make changes to stores directly.
          if (!_.isEmpty(creatures)) {
            var sub = this.map.objects.subAtCoords(this.get('hero'), 0, 0, 'garrison', 0)
            try {
              sub.batch(null, function () {
                sub.find(0, function ($1, slot) {
                  var cr = sub.atCoords(slot, 0, 0, 'creature', 0)
                  if (creatures[cr]) {
                    var count = sub.atCoords(slot, 0, 0, 'count', 0)
                    var left = Math.max(0, count - creatures[cr])
                    creatures[cr] -= count - left
                    if (left) {
                      sub.setAtCoords(slot, 0, 0, 0, 'count', left)
                    } else {
                      sub.removeAtCoords(slot, 0, 0, 0)
                    }
                  }
                })
              }, this)
            } finally {
              sub.release()
            }
          }
          if (artifacts.size) {
            var sub = this.map.objects.subAtCoords(this.get('hero'), 0, 0, 'artifacts', 0)
            try {
              sub.batch(null, function () {
                sub.find('artifact', function (art, slot) {
                  if (artifacts.delete(art)) {
                    sub.removeAtCoords(slot, 0, 0, 0)
                  }
                })
              }, this)
            } finally {
              sub.release()
            }
          }
        })
      } else if (_.includes(this.objectsID.garrison, cls) || _.includes(this.objectsID.antimagicGarrison, cls)) {
        enc.on('=promptAnswer', function (sup) {
          if (this.get('state') == 'bonus') {
            this._handle_bonus(_)
          } else {
            sup(this, arguments)
          }
        })
        enc.on('+_combatOptions', function (res) {
          // This allows custom user Effects create fortifications for defender of garrison object.
          res.parties[1].fortifications = this.rules.cx.oneShotEffectCalculation({
            class: Calculator.Effect.GenericIntArray,
            target: this.rules.constants.effect.target.fortifications,
            ifObject: id,
            ifBonusObject: actor,
          })
          res.parties[1].fortificationsTown = _.includes(this.rules.objectsID.antimagicGarrison, cls) ? this.rules.townsID.tower : this.rules.townsID.castle
        })
        enc.on('=_handle_bonus', function (sup, arg) {
          if (arg == _) {
            sup(this)
          } else {
            this.map.transitions.nest({
              type: 'garrison',
              garrison: id,
              hero: actor,
              moveTransition: moveTransition,
            })
              .collectFinal()
          }
        })
      } else if (_.includes(this.objectsID.tavern, cls)) {
        enc.on('=promptAnswer', function (sup) {
          if (this.get('state') == 'bonus') {
            this._handle_bonus(_)
          } else {
            sup(this, arguments)
          }
        })
        enc.on('=_handle_bonus', function (sup, arg) {
          if (arg == _) {
            sup(this)
          } else {
            this.map.transitions.nest({
              type: 'tavern',
              tavern: id,
              hero: actor,
              moveTransition: moveTransition,
            })
              .collectFinal()
          }
        })
      } else if (_.includes(this.objectsID.warMachineFactory, cls) || _.includes(this.objectsID.shipyard, cls)) {
        enc.on('=promptAnswer', function (sup) {
          if (this.get('state') == 'bonus') {
            this._handle_bonus(_)
          } else {
            sup(this, arguments)
          }
        })
        enc.on('=_handle_bonus', function (sup, arg) {
          if (arg == _) {
            sup(this)
          } else {
            this.map.transitions.nest({
              type: _.includes(this.rules.objectsID.warMachineFactory, cls) ? 'warMachineFactory' : 'shipyard',
              bonus: id,
              actor: actor,
              moveTransition: moveTransition,
            })
              .collectFinal()
          }
        })
      }

      enc.once('remove', function () {
        if (this.map.objects.anyAtCoords(id, 0, 0) && this.map.objects.anyAtCoords(actor, 0, 0)) {
          this.objectFinished([id, actor])
        }
      }, this)

      enc.attach().handle()
      return true
    },

    // Adds `'delta experience points to the hero's current experience and level-up(s) bonuses accrued from this.
    //= int 0+ `- experience points actually granted
    // XXX=R
    _grantExperience: function (hero, delta) {
      if (delta <= 0) { return 0 }

      var exp = hero.get('experience')

      delta = this.cx.oneShotEffectCalculation({
        target: this.constants.effect.target.hero_experienceGain,
        ifObject: hero.get('id'),
        initial: Math.round(exp + delta),
      }) - exp
      if (delta <= 0) { return 0 }

      var transition = this.map.transitions.nest({
        type: 'heroExperience',
        object: hero.get('id'),
        data: [],
      })
      var tick = 0

      var levelUps = this.constants.levelUps.concat()
      var skills = this.cx.oneShotEffectCalculation({
        class: Calculator.Effect.GenericIntArray,
        target: this.constants.effect.target.hero_skills,
        ifObject: hero.get('id'),
      })

      var stats = [
        [this.constants.stats.attack, 0, this.constants.effect.target.hero_attackChance, null, this.constants.effect.target.hero_attack],
        [this.constants.stats.defense, 0, this.constants.effect.target.hero_defenseChance, null, this.constants.effect.target.hero_defense],
        [this.constants.stats.spellPower, 0, this.constants.effect.target.hero_spellPowerChance, null, this.constants.effect.target.hero_spellPower],
        [this.constants.stats.knowledge, 0, this.constants.effect.target.hero_knowledgeChance, null, this.constants.effect.target.hero_knowledge],
      ]
      _.each(stats, function (item) {
        item[1] = this.cx.oneShotEffectCalculation({
          target: item[2],
          ifObject: hero.get('id'),
        })
      }, this)

      var res = delta

      while (delta > 0) {
        var nextMin = this.nextLevelUp(exp, levelUps)
        var thisDelta = Math.min(delta, nextMin - exp)
        exp += thisDelta
        delta -= thisDelta
        var level = exp >= nextMin ? hero.get('level') + 1 : null

        if (level != null) {
          var potential = []

          if (skills.length < 8) { // XXX=RH
            // Determined empirically.
            // In SoD, if hero has no skills to improve or add, the level-up
            // window hides skill choice, displaying only new level and primary skill.
            // If there's only one skill to improve or add, it's shown pre-selected.
            // If more skills, the game picks two from random-to-improve and random-to-add-using-chance and shows them without pre-selection, forcing user to choose.
            //
            // Currently we're taking 2 random skills from the combined to-improve and to-add pool according to their chances. For example, this means that for Knight Leadership has the best chance not only to be acquired as a new (Basic) skill, but also as an upgrade for an existing Leadership skill (to Advanced or Expert).

            var chances = []  // [Skill->$id, %, next mastery, Effect n]
            var total = 0

            _.each(this.skillsID, function (skill) {
              var skillChance = this.cx.oneShotEffectCalculation({
                target: this.constants.effect.target.hero_skillChance,
                ifObject: hero.get('id'),
                ifSkill: skill,
              })

              if (skillChance > 0) {
                if (skills.indexOf(skill) != -1) {  // upgrade for an existing skill
                  var masteryCalc = this.cx.oneShotEffectCalculator({
                    target: this.constants.effect.target.skillMastery,
                    ifObject: hero.get('id'),
                    ifSkill: skill,
                  }).takeRelease()
                  switch (masteryCalc.get('value')) {
                    case this.constants.skill.mastery.basic:
                      var mastery = this.constants.skill.mastery.advanced
                      break
                    case this.constants.skill.mastery.advanced:
                      var mastery = this.constants.skill.mastery.expert
                  }
                  var affector = false
                  masteryCalc.get('affectors').some(function (n) {
                    var src = this.map.effects.atContiguous(n + this.map.effects.propertyIndex('source'), 0)
                    switch (src) {
                      //case this.constants.effect.source.initial:
                      case this.constants.effect.source.level:
                        affector = n
                        return true
                    }
                  }, this)
                } else {  // new skill
                  var mastery = this.constants.skill.mastery.basic
                }
                if (mastery != null) {    // if not already at expert level
                  chances.push([skill, skillChance, mastery, affector])
                  total += skillChance
                }
              }
            }, this)

            while (potential.length < 2) {  // XXX=RH
              var item = this._pickFromChances(total, chances)
              if (!item) { break }
              total = item[0]
              potential.push(_.object(['', 'skill', '', 'mastery', 'affector'], item))
            }
          }

          var stat = this._pickFromChances(_.sum(_.pluck(stats, 1)), stats.concat())
        }

        hero.batch(null, function () {
          if (level != null) {
            transition.getSet('data', function (cur) {
              cur = cur.concat()
              cur[tick] = {   // tick may be != cur.length so no push()
                level: level,
                stat: stat[1],
                statDelta: +1,
                skills: potential,
              }
              return cur
            })
            transition.collect()
            hero.set('level', level, transition.options(tick))
            // XXX+R implement merging with previously set Effect as in _initializeTownSpells()
            this.map.effects.append({
              source: this.constants.effect.source.level,
              target: stat[5],
              modifier: +1,
              priority: this.map.effects.priority(this.constants.effect.operation.delta, this.constants.effect.priority.mapSpecific),
              ifObject: hero.get('id'),
            })
            switch (potential.length) {
              case 0:
                break
              case 1:
              default:
                var skills = this.map.objects.atCoords(hero.get('id'), 0, 0, 'skillSelect', 0)
                this.map.objects.setAtCoords(hero.get('id'), 0, 0, 0, 'skillSelect', (skills || []).concat([potential]))
                if (potential.length == 1) {
                  // XXX=RH
                  this.rpc.do_heroLevelSkill({hero: hero.get('id'), skill: potential[0].skill})
                }
            }
          }
          hero.set('experience', exp, transition.options(tick++))
        }, this)
      }
      transition.set('ticks', tick)
      transition.collectFinal()
      return res
    },

    // Returns the number of experience points needed to obtain the next hero
    // level, assuming he currently has exp XP.
    //
    // levelUps is mutated if given, removing leading entries for levels <= exp.
    nextLevelUp: function (exp, levelUps) {
      // [1000, 2000, 3200, ...]
      levelUps = levelUps || this.constants.levelUps.concat()

      // XXX=R duplicates with h3m2herowo.php
      while (true) {
        if (levelUps.length == 2) {
          // Last predetermined level's experience * multiplier.
          levelUps.splice(1, 0, Math.floor(levelUps[0] * levelUps[1]))
        }
        if (exp < levelUps[0]) { break }
        levelUps.shift()
      }

      return levelUps[0]
    },

    // Equips `'art'ifact on any empty slot it can be equipped on, or puts it to backpack (which is also a slot).
    _equipTrophy: function (sub, art) {
      // If the winner hero's art's slot is free, put it on immediately. If not, put it to the backpack (some artifacts don't permit this but combat trophies are exceptions).
      var slot = this.artifacts.atCoords(art, 0, 0, 'slots', 0)
        .find(function (slot) {
          return slot != this.artifactSlotsID.backpack &&
                 !sub.anyAtCoords(slot, 0, 0)
        }, this)

      if (slot == null) {
        sub.extendTo(this.artifactSlotsID.backpack)

        // Find first free backpack slot.
        for (var slot = this.artifactSlotsID.backpack; slot < sub.size().x; slot++) {
          if (!sub.anyAtCoords(slot, 0, 0)) {
            return sub.addAtCoords(slot, 0, 0, {artifact: art})
          }
        }

        // All backpack slots filled, add a new one.
        sub.append({artifact: art})
      } else {    // got a free suitable slot to wear on
        sub.addAtCoords(slot, 0, 0, {artifact: art})
      }
    },

    // Constructs a new building, removing those it upgrades.
    _erect: function (town, buildings, affectors) {
      var map = this.map
      var modifierIndex = map.effects.propertyIndex('modifier')
      var nAppend
      var nDiff
      if (!affectors) {
        affectors = this.cx.oneShotEffectCalculator({
          class: Calculator.Effect.GenericIntArray,
          target: map.constants.effect.target.town_buildings,
          ifObject: town,
        })
          .takeRelease()
          .get('affectors')
      }
      affectors.some(function (n) {
        var src = map.effects.atContiguous(n + map.effects.propertyIndex('source'), 0)
        if (src == map.constants.effect.source.initialize) {
          if (map.effects.atContiguous(n + modifierIndex, 0)[0] == map.constants.effect.operation.append) {
            nAppend = n
          } else {
            nDiff = n
          }
          return nAppend != null && nDiff != null
        }
      })
      var upgrade = []
      _.each(buildings, function (id) {
        upgrade.push.apply(upgrade, this.buildings.atCoords(id, 0, 0, 'upgrade', 0) || [])
      }, this)
      map.effects.batch(null, function () {
        if (!nAppend) {
          map.effects.append({
            source: map.constants.effect.source.initialize,
            target: map.constants.effect.target.town_buildings,
            modifier: [map.constants.effect.operation.append].concat(buildings),
            priority: map.effects.priority(map.constants.effect.operation.append, map.constants.effect.priority.mapSpecific),
            ifObject: town,
          })
        } else {
          var cur = map.effects.atContiguous(nAppend + modifierIndex, 0)
          cur = [cur[0]].concat(_.difference(cur.slice(1), upgrade), buildings)
          map.effects.setAtContiguous(nAppend + modifierIndex, 0, cur)
        }
        if (upgrade.length) {
          // Buildings can be supplied by other Effects. In this case remove base
          // buildings from the final list to avoid unexpected side effects of
          // having both base and upgraded buildings.
          if (!nDiff) {
            map.effects.append({
              source: map.constants.effect.source.initialize,
              target: map.constants.effect.target.town_buildings,
              modifier: [map.constants.effect.operation.diff].concat(upgrade),
              priority: map.effects.priority(map.constants.effect.operation.diff, map.constants.effect.priority.mapSpecific),
              ifObject: town,
            })
          } else {
            var cur = map.effects.atContiguous(nDiff + modifierIndex, 0)
            cur = [cur[0]].concat(_.unique(cur.slice(1).concat(upgrade)))
            map.effects.setAtContiguous(nDiff + modifierIndex, 0, cur)
          }
        }
      }, this)
      // SoD adds 1 week's worth of growth, no matter the current world bonus (horde, plague). For events, this happens after applying world bonus, i.e. new building always has the same available count.
      //
      // Doing this after changing Effects so that buildings' Effects are updated, including hireAvailable.
      var sub = map.objects.subAtCoords(town, 0, 0, 'available', 0)
      _.each(buildings, function (id) {
        if (!sub.anyAtCoords(id, 0, 0)) {
          var available = this.cx.oneShotEffectCalculation({
            class: Calculator.Effect.GenericIntArray,
            target: this.constants.effect.target.hireAvailable,
            ifBonusObject: town,
            ifBuilding: id,
          })

          if (available.length) {
            var max = 0

            available.forEach(function (creature) {
              max = Math.max(max, this.cx.oneShotEffectCalculation({
                target: this.constants.effect.target.creature_growth,
                ifObject: town,
                ifBuilding: id,
                ifCreature: creature,
              }))
            }, this)

            sub.addAtCoords(id, 0, 0, [max])
          }
        }
      }, this)
      sub.release()
    },

    // Advances the game date which sets all players interactive and has other side effects.
    endRound: function () {
      if (console) {
        var pending = this.map.objects.find('pending', function (p) {
          return p ? arguments : null
        })

        if (pending) {
          console.warn(_.format('Ending round despite pending %d : %.j', pending[1], pending[0]))
        }
      }

      this.map.getSet('date', Common.inc())
    },

    // Called when game date has changed.
    //
    // Is also called on day 1 (game start).
    _initializeDay: function () {
      if (this.map.get('date')) {
        this.map.effects.decrement('maxDays', this.constants.effect.timedIndex.maxDays)
      }

      if (!this.map.get('bonus')) {
        var bonus = this.map.constants.map.bonus.growth + ',Creation'
      } else if (this.map.get('date')) {
        var chances = this.cx.oneShotEffectCalculation({
          initial: {},
          class: Calculator.Effect,
          target: this.constants.effect.target.worldBonusChances,
        })

        var bonus = chances && this._pickFromChances(_.sum(chances), _.entries(chances))
        bonus = bonus && bonus[1] != '' ? bonus[1] : null
      }

      if (bonus) {
        // forceFire to notify even if new bonus is the same as current since most bonuses have side effects (like dwelling growth) every time they are chosen (contrary to '' which keeps current bonus without triggering its effects). Special bonuses may compare now/old to determine if this is the case.
        this.map.set('bonus', bonus, {forceFire: true})
      }

      this.map.players.each(function (player) {
        if (player.get('player')) {
          ;(new Rules.GenericEncounter({
            rules: this,
          }))
            .attach()
            .timedEvent(player.get('player'))
        }
      }, this)

      this.map.players.each(function (player) {
        if (player.get('player')) {
          if (this.map.get('date')) {
            var rem = this.cx.subtractResourcesByCalc(player.get(), {
              target: this.constants.effect.target.income,
              ifPlayer: player.get('player'),
            }, 'resources_', -1)
            player.assignResp(rem[0])
          }
        }
      }, this)

      this.map.byType.findAtCoords(this.constants.object.type.town, 0, 0, 0, function (town) {
        ;(new Rules.GenericEncounter({
          rules: this,
          hero: town,
        }))
          .attach()
          .timedEvent()
      }, this)

      // XXX=I,C SoD updates state of heroes at the beginning of their turn rather than the day. example: have P1, P2; P1's turn is before P2; do P2's spellpoints regen when P1 starts turn or this happens only after P1 ends turn and P2's turn starts?
      //
      // XXX=I,C same for timed events: they must occur at the beginning of turn (in non-simultaneous/classic turn mode), not daybreak
      this.map.byType.findAtCoords(this.constants.object.type.hero, 0, 0, 0, function (hero) {
        this._regenHero(this.map.representationOf(hero), true)

        var max = this.cx.oneShotEffectCalculation({
          target: this.constants.effect.target.hero_spellPoints,
          ifObject: hero,
        })

        var value = this.cx.oneShotEffectCalculation({
          target: this.constants.effect.target.hero_spellPointsDaily,
          ifObject: hero,
        })
        this.map.representationOf(hero).getSet('spellPoints', function (cur) {
          return Math.min(max, cur + value)
        })

        ;(new Rules.GenericEncounter({
          rules: this,
          hero: hero,
        }))
          .attach()
          .timedEvent()
      }, this)

      // Batching all players so that they start interacting after all
      // _opt.interactive were changed. Otherwise, if a player sets interactive
      // to false within change_interactive (like AI.Nop or Neutral do)
      // then round will end because other players' _opt.interactive wasn't yet
      // set.
      var players = this.players.toArray()
      players.pop().batch(players, function () {
        // Neutral also receives turn but neutralAI controller usually skips it.
        this.players[this.cx.get('classic') ? 'some' : 'forEach'](function (pl) {
          return pl.canTakeTurn() && pl.set('interactive', true)
        })
      }, this)
    },

    // Regenerates hero's APs and SPs either to full values or by daily increments.
    _regenHero: function (hero, onlyDaily) {
      var value = this.cx.oneShotEffectCalculation({
        target: this.constants.effect.target.hero_actionPoints,
        ifObject: hero.get('id'),
      })
      hero.set('actionPoints', value)

      if (!onlyDaily) {
        var value = this.cx.oneShotEffectCalculation({
          target: this.constants.effect.target.hero_spellPoints,
          ifObject: hero.get('id'),
        })
        hero.set('spellPoints', value)
      }
    },

    // Generic function for changing population of towns and standalone map dwellings.
    _growth: function (func) {
      this.map.byType.findAtCoords(this.constants.object.type.town, 0, 0, 0, function (town) {
        var grows = this.cx.oneShotEffectCalculation({
          class: Calculator.Effect.GenericBool,
          target: this.constants.effect.target.grows,
          ifObject: town,
        })
        if (!grows) { return }

        var buildings = this.cx.oneShotEffectCalculation({
          class: Calculator.Effect.GenericIntArray,
          target: this.constants.effect.target.town_buildings,
          ifObject: town,
        })

        var sub = this.map.objects.subAtCoords(town, 0, 0, 'available', 0)
        try {
          buildings.forEach(function (building) {
            var available = this.cx.oneShotEffectCalculation({
              class: Calculator.Effect.GenericIntArray,
              target: this.constants.effect.target.hireAvailable,
              ifBonusObject: town,
              ifBuilding: building,
            })

            if (available.length) {
              var cur = sub.atCoords(building, 0, 0, 0, 0)
              // XXX=C is this correct? since all creatures share the same count pool for buildings, we determine the best growth and increment the count by it; keep in mind this method is used for week/month bonus growth (and plague) too; same question applies to _erect()
              var max = cur || 0

              available.forEach(function (creature) {
                var growth = this.cx.oneShotEffectCalculation({
                  target: this.constants.effect.target.creature_growth,
                  ifObject: town,
                  ifBuilding: building,
                  ifCreature: creature,
                })

                max = Math.max(max, func.call(this, creature, cur || 0, growth, town))
              }, this)

              cur == null
                ? sub.addAtCoords(building, 0, 0, [max])
                : sub.setAtCoords(building, 0, 0, 0, 0, max)
            }
          }, this)
        } finally {
          sub.release()
        }
      }, this)

      this.map.byType.findAtCoords(this.constants.object.type.dwelling, 0, 0, 0, function (dwelling) {
        var grows = this.cx.oneShotEffectCalculation({
          class: Calculator.Effect.GenericBool,
          target: this.constants.effect.target.grows,
          ifObject: dwelling,
        })
        if (!grows) { return }

        var sub = this.map.objects.subAtCoords(dwelling, 0, 0, 'available', 0)
        try {
          var available = this.cx.oneShotEffectCalculation({
            class: Calculator.Effect.GenericIntArray,
            target: this.constants.effect.target.hireAvailable,
            ifBonusObject: dwelling,
          })

          available.forEach(function (creature) {
            var growth = this.cx.oneShotEffectCalculation({
              target: this.constants.effect.target.creature_growth,
              ifObject: dwelling,
              ifCreature: creature,
            })

            var cur = sub.atCoords(creature, 0, 0, 0, 0)
            growth = func.call(this, creature, cur || 0, growth, dwelling)

            cur == null
              ? sub.addAtCoords(creature, 0, 0, [growth])
              : sub.setAtCoords(creature, 0, 0, 0, 0, growth)
          }, this)
        } finally {
          sub.release()
        }
      }, this)

      // XXX=C on-map monsters should grow too but it has some uncertain algorithm as to when it happens (not every Monday and/or not for all; in fact, sometimes monsters diminish!); when implementing this, account for GenericEncounter's garrison renewal mechanism
      //
      // XXX=C what hordeGrowth in CRTRAITS.TXT (creature_hordeGrowth) is for? on 'horde' world bonus all counts supposedly just double
    },

    // Called when game date has changed.
    //
    // Is also called on day 1 (game start).
    _initializeWeek: function () {
    },

    // Called when game date has changed.
    //
    // Is also called on day 1 (game start).
    _initializeMonth: function () {
    },

    // XXX=R duplicates with Effects.Collection
    //> effects array`, null
    appendEmbeddedEffects: function (effects, expand) {
      var ns = []
      var label = this.map.effects.propertyIndex('label')
      var chunk = this.map.effects.schemaLength()
      this.map.effects.batch(null, function () {
        for (var i = 0; effects && i < effects.length; i += chunk) {
          var effect = effects.slice(i, i + chunk)
          if (effect[label] !== false) {
            this.map.effects.byLabel[effect[label]] = effect.concat()
          }
          if (expand(effect) !== false) {
            // map.effects and databank.effects must have the same schema.
            ns.push(this.map.effects.append(effect)[0])
          }
        }
      }, this)
      return ns
    },

    // Map's effects.json contains only permanent effects. $dynamic effects
    // that can go away are always added on run-time since it involves setting
    // up hooks to various in-game objects.
    _initializeEffects: function () {
      var idIndex = this.map.objects.propertyIndex('id')
      var typeIndex = this.map.objects.propertyIndex('type')
      var ifDateMaxIndex = this.map.effects.propertyIndex('ifDateMax')
      var atter = this.map.effects.atter([
        'ifGarrisoned', 'ifVisiting', 'ifTargetObject', 'whileObject',
        'ifBonusObject', 'whileOwned', 'ifCombat',
      ])

      // Remove Effects which selectors can never match because the referenced object (AObject->$id) is removed.
      this.autoOff(this.map.objects, {
        oremove: function ($1, $2, props) {
          var id = props[idIndex]
          // $ifObject.
          //
          // batch() prevents update of byObject immediately on remove. If not done, find() iteration of the same level would become unpredictable and may skip yet unvisited entries.
          this.map.effects.batch(null, function () {
            this.map.effects.byObject.findAtCoords(id, 0, 0, 0, function (n) {
              this.map.effects.removeAtContiguous(n, 0)
            }, this)
          }, this)
          // XXX=O
          this.map.effects.find(0, function ($1, $2, $3, $4, $5, n) {
            var effect = atter(n, 0)
            if (effect.ifGarrisoned == id ||
                effect.ifVisiting == id ||
                effect.ifTargetObject == id ||
                effect.whileObject == id ||
                effect.ifBonusObject == id ||
                effect.whileOwned == id) {
              _.log && _.log('Effect %d selector unmatchable due to object removal : %d', n, id)
              this.removeAtContiguous(n, 0)
            }
          })
        },
      })
      // Remove Effects depending on in-game date. It doesn't matter if any Calculator evaluates them after change_date but before we remove them because ifDateMax is a normal selector and will be tested as usual.
      this.autoOff(this.map, ['change_date', function (now) {
        this.map.effects.batch(null, function () {
          this.map.effects.byTimed.findAtCoords(this.constants.effect.timedIndex.ifDateMax, 0, 0, 0, function (n) {
            if (this.atContiguous(n + ifDateMaxIndex, 0) < now) {
              _.log && _.log('Effect %d selector unmatchable due to Map.date change : %d', n, now)
              this.removeAtContiguous(n, 0)
            }
          }, this.map.effects)
        }, this)
      }])
      // Remove combat Effects ($ifCombat). Keeping Effects of removed creatures for simplicity (they're bound to be removed with the combat anyway), although it might make sense to implement their removal too.
      this.autoOff(this.map.combats, {
        unnested: function (combat) {
          var id = combat._parentKey
          // If $ifCombatCreature/$ifCombatParty/$ifTargetCombatCreature is set, $ifCombat must be also set so it's enough to test only the latter.
          this.map.effects.find(0, function (n) {
            var effect = atter(n, 0)
            if (effect.ifCombat == id) {
              _.log && _.log('Effect %d selector unmatchable due to combat removal : %s', n, id)
              this.removeAtContiguous(n, 0)
            }
          })
        },
      })
      // Players should never be removed from the game (?) so not checking that.

      // Track AObject->$owned to remove no longer matching $whileOwned...
      var whileOwnedIndex = this.map.effects.propertyIndex('whileOwned')
      var owned = new Set
      this.map.effects.find(whileOwnedIndex, function (id, $1, $2, $3, $4, n) {
        id && owned.add(n - whileOwnedIndex)
      })
      this.autoOff(this.map.effects, [
        'oadd',
        function (n, $1, props) {
          props[whileOwnedIndex] && owned.add(n)
        },
        'oremove',
        function (n, $1, props) {
          props[whileOwnedIndex] && owned.delete(n)
        },
        'ochange_p_' + whileOwnedIndex,
        function (n, $1, prop, now, old) {
          if (!old != !now) {
            owned[now ? 'add' : 'delete'](n)
          }
        }
      ])
      this.autoOff(this.map.objects, [
        'ochange_p_' + this.map.objects.propertyIndex('owner'),
        function (n, $1, $2, owner) {
          var id = this.map.objects.fromContiguous(n).x
          owned.forEach(function (n) {
            if (this.map.effects.atContiguous(n + whileOwnedIndex, 0) == id) {
              var player = this.map.effects.atContiguous(n + this.map.effects.propertyIndex('whileOwnedPlayer'), 0)
              if (player === false ? owner == 0 : owner != player) {
                _.log && _.log('Effect %d removed due to $whileOwned... mismatching object %d\'s new $owner of P%d', id, n, owner)
                this.map.effects.removeAtContiguous(n, 0)
              }
            }
          }, this)
        },
      ])

      this._initializeEffectsTowns()
      this._initializeEffectsHeroes()
      this._initializeEffectsOwnableShroud()
      this._initializeEffectsSpot()
    },

    // Assigns internal values based on the just-loaded databank.
    //
    // Called from owned.
    _initializeDatabank: function (props) {
      _.each(props, function (prop) {
        this[prop] = this.databank[prop]
      }, this)

      this.fortBuildings = [
        this.buildingsID.fort,
        this.buildingsID.citadel,
        this.buildingsID.castle,
      ]

      this.hallBuildings = [
        this.buildingsID.hall,
        this.buildingsID.townHall,
        this.buildingsID.cityHall,
        this.buildingsID.capitol,
      ]

      // This could be pre-calculated by databank.php but heroChance still
      // has to be dynamic due to dependance on player's town (which can change
      // and which we can't test using Effect selectors).
      var heroesByClass = {}

      this.heroes.find('class', function (cls, hero) {
        (heroesByClass[cls] || (heroesByClass[cls] = [])).push(hero)
      })

      _.times(this.towns.size().x, function (town) {
        this._townChances[town] = {}
      }, this)

      this.heroClasses.find('townChances', function (chances, cls) {
        _.each(chances, function (chance, town) {
          // Unlike HeroWO, SoD specifies the chance by hero's class, not particular hero.
          // Divide this chance by the number of heroes belonging to a particular class to make all heroes in a class have an equal chance.
          // If there are too many heroes, make them share the minimal chance (depends on multiplier, for 100000 it's 0.001%).
          chance = Math.floor(chance / 100 / heroesByClass[cls].length * this.constants.effect.multiplier) || 1
          _.extend(this._townChances[town], _.fill(_.object(heroesByClass[cls]), chance))
        }, this)
      }, this)
    },

    // Maintains Effects provided by a town, its garrison, buildings, etc. - shroud, income, morale and other bonuses.
    _initializeEffectsTowns: function () {
      var self = this
      var objects = this.map.objects.schema()
      var effects = this.map.effects.schema()
      var buildings = this.buildings.schema()
      var creatures = this.creatures.schema()

      var townCollection = (new Effects.Collection({effects: this.map.effects, batchObjects: [this.map.effects]}))
        .on({
          expandEffect: function (effect, member) {
            effect[effects.source] = [self.constants.effect.source.town, member.item]
            if (effect[effects.ifObject] === true) {
              effect[effects.ifObject] = member.item
            }
            if (effect[effects.ifTargetObject] === true) {
              effect[effects.ifTargetObject] = member.item
            }
            if (effect[effects.ifTargetPlayer] === true) {
              effect[effects.ifTargetPlayer] = self.map.objects.atCoords(member.item, 0, 0, objects.owner, 0)
            }
            if (effect[effects.ifGarrisoned] === true) {
              effect[effects.ifGarrisoned] = member.item
            }
            if (effect[effects.ifVisiting] === true) {
              effect[effects.ifVisiting] = member.item
            }
            if (effect[effects.ifPlayer] === true) {
              effect[effects.ifPlayer] = self.map.objects.atCoords(member.item, 0, 0, objects.owner, 0)
            }
            if (effect[effects.whileObject] === true) {
              effect[effects.whileObject] = member.item
            }
          },

          '-removeMember': function (member) {
            _.log && _.log('Removing town %d Effects', member.item)
          },

          '+readyMember': function (res, id) {
            var n = self.map.objects.toContiguous(id, 0, 0, 0)

            var townItemCollection = HeroItemCollection.extend({
              events: {
                '-init': function (opt) {
                  opt.effects = self.map.effects
                  opt.objects = self.map.objects
                  opt.map = self.map
                  opt.id = id
                  opt.n = n
                  opt.ifObjectIndex = effects.ifObject
                  opt.ifTargetObjectIndex = effects.ifTargetObject
                  opt.ifTargetPlayerIndex = effects.ifTargetPlayer
                  opt.ifGarrisonedIndex = effects.ifGarrisoned
                  opt.ifVisitingIndex = effects.ifVisiting
                  opt.ifPlayerIndex = effects.ifPlayer
                  opt.ownerIndex = objects.owner
                },
              },
            })

            var subclass = self.map.objects.atContiguous(n + objects.subclass, 0)
            res.effects = self.towns.atCoords(subclass, 0, 0, 'effects', 0) || []

            var owner = self.map.objects.atContiguous(n + objects.owner, 0)
            if (owner != 0) {
              var remove = self._initializeShroudRevealer(
                self.constants.effect.target.town_shroud,
                self.constants.shroud.ownable_explored,
                self.constants.shroud.town_shroud,
                function () {
                  return self.map.players.nested(owner).towns.invoke('get', 'id')
                },
                id
              )
              res.release.push({release: remove})
            }

            res.garrison = self._initializeEffectsGarrison(
              id, n, townItemCollection,
              creatures.effects,
              creatures.effectsTown,
              objects.garrison
            )

            var fortless
            res.buildings = (new townItemCollection({batchObjects: [self.map.effects]}))
              .on({
                expandEffect: function (effect, member) {
                  // Needed for calculating TownIncome.
                  effect[effects.source] = [self.constants.effect.source.town, id]
                  if (effect[effects.ifBuilding] === true) {
                    effect[effects.ifBuilding] = member.item
                  }
                  if (effect[effects.ifBonusObject] === true) {
                    effect[effects.ifBonusObject] = id
                  }
                },
                '+readyMember': function (res, building) {
                  res.effects = self.buildings.atCoords(building, 0, 0, buildings.effects, 0) || []
                },
                change_list: function () {
                  var nowFortless = !self.fortBuildings.some(this.has, this) && !this.has(self.buildingsID.capitol)
                  if (fortless != nowFortless) {
                    fortless = nowFortless
                    // XXX=R to avoid conflicts there likely needs to be a central hook on all AObject fields affecting appearance, such as on subclass, that will update texture/animation; this is not implemented currently, as only the town fort/less factor affects object appearance in SoD
                    var cls = self.towns.atCoords(subclass, 0, 0, fortless ? 'fortlessClass' : 'fortClass', 0)
                    // XXX=R:h3t:
                    _.each(['texture', 'animation'], function (prop) {
                      var cur = self.map.objects.atCoords(id, 0, 0, prop, 0)
                      Common.alterStringifiedArray(self.classes.atCoords(cls, 0, 0, prop, 0), 1, function (value) {
                        self.map.objects.setAtCoords(id, 0, 0, 0, prop, Common.alterStringifiedArray(cur, 1, value))
                      })
                    })
                    // XXX=R:clc:
                    var props = ['type', 'duration', 'width', 'height', 'miniMap', 'passableType', 'passable', 'actionable', 'actionableFromTop']
                    _.each(props, function (prop) {
                      self.map.objects.setAtCoords(id, 0, 0, 0, prop,
                        self.classes.atCoords(cls, 0, 0, prop, 0))
                    })
                  }
                },
              })
              .bindCalculator(self.cx.listeningEffectCalculator({
                class: Calculator.Effect.GenericIntArray,
                target: self.constants.effect.target.town_buildings,
                ifObject: id,
              }).updateIfNeeded())

            // Since _initializeTownSpells() depends on town_spellChance present at the time of the call, and since the latter Effects are added via Town->$effects we have to defer until Effects are not only append()'ed (done by addMember()) but also indexes are updated (done at the end of the batch on map.effects created by _doBatchObjects()).
            this.once('initTS', function () {
              _.times(5 /*XXX=RH*/, function (level) {
                var countCalc = self.cx.listeningEffectCalculator({
                  target: self.constants.effect.target.town_spellCount,
                  ifObject: id,
                  ifSpellLevel: level + 1,
                })
                  .updateIfNeeded()
                res.off.push([countCalc, countCalc.whenRenders('change_value', function () {
                  var count = countCalc.get('value')
                  count && self._initializeTownSpells(id, level + 1, count)
                })])
              })
            })
          },

          _doBatchObjects: function () {
            this.fire('initTS')
          },
        })
        .bindStoreCoords(this.map.byType, this.constants.object.type.town)

      function reAddTown(n) {
        townCollection.reAddMember(self.map.objects.fromContiguous(n).x)
      }
      this.map.objects.on('ochange_p_' + objects.owner, reAddTown)
      this.map.objects.on('ochange_p_' + objects.subclass, reAddTown)

      this.once('-unnest', 'remove', townCollection)
    },

    // Maintains Effects to define available spells in a town based on Mage Guild's level.
    _initializeTownSpells: function (town, level, count) {
      var calc = this.cx.changeableEffectCalculator({
        target: this.constants.effect.target.town_spellChance,
        ifObject: town,
      })
        .take()
      var spellCalc = this.cx.oneShotEffectCalculator({
        class: Calculator.Effect.GenericIntArray,
        target: this.constants.effect.target.town_spells,
        ifObject: town,
      })
        .takeRelease()
      var source = this.map.effects.propertyIndex('source')
      var modifierIndex = this.map.effects.propertyIndex('modifier')
      var found
      spellCalc.get('affectors').some(function (n) {
        var src = this.map.effects.atContiguous(n + source, 0)
        if (src[0] == this.constants.effect.source.mageGuild && src[1] == level) {
          var modifier = this.map.effects.atContiguous(n + modifierIndex, 0)
          count -= modifier.length - 1
          return found = [n, modifier]
        }
      }, this)
      var chances = []
      var total = 0
      if (count > 0) {
        this.spells.find('level', function (spellLevel, spell) {
          if (spellLevel == level && spellCalc.get('value').indexOf(spell) == -1) {
            var chance = calc.set('ifSpell', spell).updateIfNeeded().get('value')
            if (chance > 0) {
              chances.push([spell, chance])
              total += chance
            }
          }
        })
      }
      var spells = found ? found[1].concat() : [this.constants.effect.operation.append]
      while (count-- > 0) {
        var spell = this._pickFromChances(total, chances)
        if (!spell) { break }
        total = spell[0]
        spells.push(spell[1])
      }
      if (spells.length > 1) {
        if (found) {
          this.map.effects.setAtContiguous(found[0] + modifierIndex, 0, spells)
        } else {
          // Mage Guild produces permanent (stored) effects.
          this.map.effects.append({
            source: [this.constants.effect.source.mageGuild, level],
            target: this.constants.effect.target.town_spells,
            modifier: spells,
            priority: this.map.effects.priority(this.constants.effect.operation.append, this.constants.effect.priority.building),
            ifObject: town,
          })
        }
      }
      calc.release()
    },

    // Maintains Effects provided by a hero, its garrison, specialty, artifacts, etc. - shroud, income, morale and other bonuses. Maintains correctness of provisional hero travel route drawn on adventure map.
    _initializeEffectsHeroes: function () {
      var self = this
      var objects = this.map.objects.schema()
      var artifacts = this.artifacts.schema()
      var heroes = this.heroes.schema()
      var heroClasses = this.heroClasses.schema()
      var effects = this.map.effects.schema()
      var skills = this.skills.schema()
      var creatures = this.creatures.schema()
      var backpack = this.artifactSlotsID.backpack

      var heroCollection = (new Effects.Collection({effects: this.map.effects, batchObjects: [this.map.effects]}))
        .on({
          expandEffect: function (effect, member) {
            effect[effects.source] = [self.constants.effect.source.hero, member.item]
            if (effect[effects.ifObject] === true) {
              effect[effects.ifObject] = member.item
            }
            if (effect[effects.ifTargetObject] === true) {
              effect[effects.ifTargetObject] = member.item
            }
            if (effect[effects.ifTargetPlayer] === true) {
              effect[effects.ifTargetPlayer] = self.map.objects.atCoords(member.item, 0, 0, objects.owner, 0)
            }
            if (effect[effects.ifGarrisoned] === true) {
              effect[effects.ifGarrisoned] = member.item
            }
            if (effect[effects.ifVisiting] === true) {
              effect[effects.ifVisiting] = member.item
            }
            if (effect[effects.ifPlayer] === true) {
              effect[effects.ifPlayer] = self.map.objects.atCoords(member.item, 0, 0, objects.owner, 0)
            }
            if (effect[effects.whileObject] === true) {
              effect[effects.whileObject] = member.item
            }
          },

          '-removeMember': function (member) {
            _.log && _.log('Removing hero %d Effects', member.item)
          },

          '+readyMember': function (res, id) {
            var n = self.map.objects.toContiguous(id, 0, 0, 0)

            var heroItemCollection = HeroItemCollection.extend({
              events: {
                '-init': function (opt) {
                  opt.effects = self.map.effects
                  opt.objects = self.map.objects
                  opt.map = self.map
                  opt.id = id
                  opt.n = n
                  opt.ifObjectIndex = effects.ifObject
                  opt.ifTargetObjectIndex = effects.ifTargetObject
                  opt.ifTargetPlayerIndex = effects.ifTargetPlayer
                  opt.ifGarrisonedIndex = effects.ifGarrisoned
                  opt.ifVisitingIndex = effects.ifVisiting
                  opt.ifPlayerIndex = effects.ifPlayer
                  opt.ownerIndex = objects.owner
                },
              },
            })

            var subclass = self.map.objects.atContiguous(n + objects.subclass, 0)
            var heroEffects = self.heroes.atCoords(subclass, 0, 0, heroes.effects, 0) || []
            var skillEffects = self.heroes.atCoords(subclass, 0, 0, heroes.skills, 0) || []
            var spellEffects = self.heroes.atCoords(subclass, 0, 0, heroes.spells, 0) || []
            var specialtyEffects = self.heroes.atCoords(subclass, 0, 0, heroes.specialty, 0) || []
            var classEffects = self.heroClasses.atCoords(self.heroes.atCoords(subclass, 0, 0, heroes.class, 0), 0, 0, heroClasses.effects, 0) || []
            res.effects = heroEffects.concat(classEffects, skillEffects, spellEffects, specialtyEffects)

            var owner = self.map.objects.atContiguous(n + objects.owner, 0)
            if (owner != 0) {   // no shroud for neutral
              var remove = self._initializeShroudRevealer(
                self.constants.effect.target.hero_shroud,
                self.constants.shroud.hero_explored,
                self.constants.shroud.hero_shroud,
                function () {
                  return self.map.players.nested(owner).heroes.invoke('get', 'id')
                },
                id
              )
              res.release.push({release: remove})
            }

            res.artifacts = (new heroItemCollection({batchObjects: [self.map.effects]}))
              .on({
                '+readyMember': function (res, artifact) {
                  if (artifact != null) {
                    res.effects = self.artifacts.atCoords(artifact, 0, 0, artifacts.effects, 0) || []
                  }
                },
              })
              .bindStoreValue(self.map.objects, n, objects.artifacts, function (list) {
                // Only equipped artifacts provide Effects.
                return list.slice(0, backpack)
              })

            res.garrison = self._initializeEffectsGarrison(
              id, n, heroItemCollection,
              creatures.effects,
              creatures.effectsHero,
              objects.garrison
            )

            res.skills = (new heroItemCollection({batchObjects: [self.map.effects]}))
              .on({
                '+readyMember': function (res, skill) {
                  res.mastery = (new heroItemCollection({batchObjects: [self.map.effects]}))
                    .on({
                      '+readyMember': function (res, mastery) {
                        res.effects = self.skills.atCoords(skill, 0, 0, skills.effects + mastery, 0) || []
                      },
                    })
                    .bindCalculator(
                      self.cx.listeningEffectCalculator({
                        target: self.constants.effect.target.skillMastery,
                        ifObject: id,
                        ifSkill: skill,
                      }).updateIfNeeded(),
                      function (mastery) {
                        return [mastery]
                      }
                    )
                },
              })
              .bindCalculator(self.cx.listeningEffectCalculator({
                class: Calculator.Effect.GenericIntArray,
                target: self.constants.effect.target.hero_skills,
                ifObject: id,
              }).updateIfNeeded())

            var routeSub = self.map.objects.subAtContiguous(n + objects.route, 0)
            res.release.push(routeSub)
            var routeOff = []
            res.off.push(routeOff)
            var routeCoster = self.cx.pathCostFor(id)
            var route = res.route = {
              calcs: [],
              sub: routeSub,
              atter: routeSub.atter(['x', 'y', 'z', 'direction']),

              update: function () {
                function update(cost) {
                  if (!this.map.objects.anyAtCoords(id, 0, 0)) {
                    // Ignore calc update in response to hero being removed.
                    return
                  }
                  if (cost == this.get('cost').OBJECT && this == route.calcs[0]) {
                    var hero = this.map.actionableSpot(id)
                    if (this.get('x') == hero[0] && this.get('y') == hero[1] && this.get('z') == hero[2]) {
                      // Do nothing if new cost is OBJECT (an object occupies the calculator's spot) and if the calculator is the first in route (path segment closest to the hero) and if the hero's current position is exactly the calculator's. This happens during heroMove and will be handled by shorten(). There's no guarantee which of the two will be fired first (if shorten() runs before the calculator updates or not). There's also no guarantee that the calculator will fire if the hero stands on that spot since the cost depends on hero_walkImpassable and other variables, so have to have both handlers.
                      return
                    }
                  }
                  route.rebuild()
                }

                var rest = 0
                var from = self.map.actionableSpot(id)

                route.sub.find(0, function ($1, i, $3, $4, $5, n) {
                  rest = i + 1
                  var comp = route.atter(n, 0)

                  var calc = routeCoster.calculatorAt(comp.x, comp.y, comp.z, null, {isDestination: !comp.direction, from: from, disembark: true})
                  if (calc != route.calcs[i]) {
                    route.calcs[i] = calc
                    Common.off(routeOff[i])
                    routeOff[i] = [calc, calc.on('change_value', update)]
                  }

                  from = [comp.x, comp.y, comp.z]
                })

                route.calcs.splice(rest)
                _.each(routeOff.splice(rest), Common.off)
              },

              // -1 to clear route.
              truncate: function (end) {
                route.sub.batch(null, function () {
                  route.sub.find(0, function ($1, i, $3, $4, $5, n) {
                    if (i > end) {
                      route.sub.removeAtContiguous(n, 0)
                    } else if (i == end) {
                      route.sub.setAtCoords(i, 0, 0, 0, 'direction', 0)
                    }
                  })
                })
              },

              shorten: function (coords) {
                route.sub.batch(null, function () {
                  var schema = route.sub.schema()
                  var reinsert
                  route.sub.find(0, function ($1, $2, $3, $4, $5, n) {
                    var segment = route.sub.removeAtContiguous(n, 0)
                    if (segment[schema.x] == coords[0] &&
                        segment[schema.y] == coords[1] &&
                        segment[schema.z] == coords[2]) {
                      // Hero's new position is somewhere on his current route.
                      // We assume the hero has moved and so shorten the route
                      // by removing segments near the start (not end!).
                      reinsert = []
                    } else if (reinsert) {
                      reinsert.push(segment)
                    }
                  })
                  if (reinsert) {
                    // reinsert is unset or [] if Hero's new position is somewhere outside of his old route.
                    // This can be because of the Teleport spell, Monolith or
                    // Whirlpool encounter, etc. Remove the route entirely.
                    _.each(reinsert, function (segment, i) {
                      route.sub.addAtCoords(i, 0, 0, segment)
                    })
                  }
                })
              },

              rebuild: function () {
                var last = _.last(route.calcs)
                if (last && !route.build(last.get('x'), last.get('y'), last.get('z'))) {
                  route.truncate(-1)
                }
              },

              // Keeps existing route if destination is unreachable.
              build: function (x, y, z) {
                var tb = {'-1': 'T', 0: '', 1: 'B'}
                var lr = {'-1': 'L', 0: '', 1: 'R'}

                var path = self.cx.pathFindFor(id, [x, y, z])

                if (path) {
                  route.sub.batch(null, function () {
                    var prev = path.shift()
                    route.sub.extendTo(path.length - 1)
                    var atter = route.sub.atter()

                    for (var comp, i = 0; comp = path[i]; i++) {
                      var segment = {
                        x: comp[0],
                        y: comp[1],
                        z: comp[2],
                        cost: comp[6],
                        direction: i == path.length - 1 ? 0
                          : self.map.constants.routeDirections[
                            '' +
                            tb[_.sign(prev[1] - comp[1])] +
                            lr[_.sign(prev[0] - comp[0])] +
                            '_' +
                            tb[_.sign(path[i + 1][1] - comp[1])] +
                            lr[_.sign(path[i + 1][0] - comp[0])]
                          ],
                      }

                      prev = path[i]

                      if (route.sub.anyAtCoords(i, 0, 0)) {
                        var existing = atter(i, 0, 0, 0)
                        var same = _.every(segment, function (v, k) {
                          return existing[k] === v
                        })
                        if (same) {
                          continue
                        }
                        route.sub.removeAtCoords(i, 0, 0, 0)
                      }

                      route.sub.addAtCoords(i, 0, 0, segment)
                    }

                    for (; i < route.sub.size().x; i++) {
                      route.sub.removeAtCoords(i, 0, 0, 0)
                    }
                  })

                  return path
                }
              },
            }

            res.route.update()
          },
        })
        .bindStoreCoords(this.map.byType, this.constants.object.type.hero)

      this.autoOff(this.map.objects, [
        // Shorten the route when hero's position has changed.
        'ochange_p_' + objects.x + ', ' +
        'ochange_p_' + objects.y + ', ' +
        'ochange_p_' + objects.z,
        Common.batchGuard(5, function (n) {
          var hero = heroCollection.member(this.map.objects.fromContiguous(n).x)
          hero && hero.route.shorten(this.map.actionableSpot(hero.item))
        }),

        'ochange_p_' + objects.actionable,
        Common.batchGuard(5, function (n) {
          var hero = heroCollection.member(this.map.objects.fromContiguous(n).x)
          hero && hero.route.rebuild()
        }),

        'ochange_p_' + objects.route,
        Common.batchGuard(5, function (n) {
          var hero = heroCollection.member(this.map.objects.fromContiguous(n).x)
          hero && hero.route.update()
        }),

        '+buildRoute',
        function (res, hero, x, y, z) {
          return heroCollection.member(hero).route.build(x, y, z)
        },

        // Both changes are rare so re-add everything for simplicity.
        'ochange_p_' + objects.owner + ', ' +
        'ochange_p_' + objects.subclass,
        Common.batchGuard(5, function (n) {
          heroCollection.reAddMember(self.map.objects.fromContiguous(n).x)
        }),
      ])

      this.once('-unnest', 'remove', heroCollection)
    },

    // Maintains shroud around map objects that can be owned by some player (e.g. mine or dwelling).
    _initializeEffectsOwnableShroud: function () {
      var self = this
      var typeIndex = this.map.objects.propertyIndex('type')

      var col = (new Effects.Collection({effects: this.map.effects}))
        .on({
          '+readyMember': function (res, id) {
            switch (self.map.objects.atCoords(id, 0, 0, typeIndex, 0)) {
              case self.map.constants.object.type.town:
              case self.map.constants.object.type.hero:
                return
            }
            res.handled = true
            self._initializeShroudRevealer(
              self.constants.effect.target.ownable_shroud,
              self.constants.shroud.ownable_explored,
              self.constants.shroud.ownable_shroud,
              function (owner) {
                var ids = []
                _.each(col.members(), function (member, id) {
                  if (member.handled &&
                      owner == self.map.objects.atCoords(id, 0, 0, 'owner', 0)) {
                    ids.push(id)
                  }
                })
                return ids
              },
              id
            )
          },
        })

      this.autoOff(this.map.byOwner, {
        'oadd, oremove': Common.batchGuard(3, function ($1, $2, $3, options) {
          var ids = new Set
          options.batch.forEach(function (event) {
            switch (event[0]) {
              case 'oadd':
              case 'oremove':
                ids.add(event[3][0])
            }
          })
          ids.forEach(function (id) {
            var owner = self.map.objects.atCoords(id, 0, 0, 'owner', 0)
            owner == null ? col.evict(id) : owner /*not neutral*/ && col.append(id)
          })
        }),
      })

      this.map.byOwner.findWithin(1, 0, 0, Infinity, 0, 0, 0, function (id) {
        col.append(id)
      })

      this.once('-unnest', 'remove', col)
    },

    // Maintains positional Effects defined in databank for adventure map objects.
    //
    // For example, Sanctuary prevents combats in its actionable spot while Fiery Fields bumps mastery of fire spells to expert level. Listens for new/deleted/moved objects and adjusts the Effects accordingly.
    _initializeEffectsSpot: function () {
      var effects = this.map.effects.schema()
      var classes = this.classes.schema()
      var objectsAtter = this.map.objects.atter(['class', 'x', 'y', 'z',
        'width', 'height', 'passable', 'actionable'])
      var spotEffects = new Map     // AClass->$id => n of $spotEffects
      var objectEffects = new Map   // AObject->$id => array of Effects' n

      this.classes.find(classes.spotEffects, function (value, cls, $1, $2, $3, n) {
        value && spotEffects.set(cls, n)
      })

      var add = function (obj, nObject, n) {
        // Apply $spotEffects to every actionable spot (e.g. Sanctuary) or,
        // if the object has none, to every passable spot (e.g. Fiery Fields).
        var ns = []
        objectEffects.set(nObject, ns)
        var append = this.classes.atContiguous(n, 0)
        var mask = obj.actionable /*always str*/ || obj.passable /*false or str*/
        this.map.walkObjectBox(obj, 1, function (pos) {
          if (+(mask[pos.on] || 1)) {
            ns.push.apply(ns, this.appendEmbeddedEffects(append, function (effect) {
              // Because Effect is bound to particular coords, we have to listen
              // for coords change and so can't just keep it "cold".
              effect[this._dynamicIndex] = true
              effect[effects.ifX] = pos.mx
              effect[effects.ifY] = pos.my
              effect[effects.ifZ] = obj.z
            }.bind(this)))
          }
        }, this)
      }.bind(this)

      var remove = function (nObject, ns) {
        objectEffects.delete(nObject)
        ns.forEach(function (n) {
          this.map.effects.removeAtContiguous(n, 0)
        }, this)
      }.bind(this)

      this.autoOff(this.map.objects, {
        oadd: function (nObject, $, props) {
          var n = spotEffects.get(props[objectsAtter.classIndex])
          if (n != null) {
            add(objectsAtter(props, 0), nObject, n)
          }
        },
        oremove: function (nObject, $, props) {
          var ns = objectEffects.get(nObject)
          ns && remove(nObject, ns)
        },
      })

      this.map.objects.find(objectsAtter.classIndex, function (cls, $1, $2, $3, $4, nProp) {
        var n = spotEffects.get(cls)
        if (n != null) {
          var nObject = nProp - objectsAtter.classIndex
          add(objectsAtter(nObject, 0), nObject, n)
        }
      })

      var change = function (nObject, prop, value, old) {
        var ns = objectEffects.get(nObject)
        ns && ns.forEach(function (n) {
          this.map.effects.setAtContiguous(n + prop, 0,
            this.map.effects.atContiguous(n + prop, 0) + value - old)
        }, this)
      }.bind(this)

      // Not listening for class changes since class assignment is permanent.
      this.autoOff(this.map.objects, [
        'ochange_p_' + objectsAtter.xIndex, function (n, $1, $2, value, old) {
          change(n, effects.ifX, value, old)
        },
        'ochange_p_' + objectsAtter.yIndex, function (n, $1, $2, value, old) {
          change(n, effects.ifY, value, old)
        },
        'ochange_p_' + objectsAtter.zIndex, function (n, $1, $2, value, old) {
          change(n, effects.ifZ, value, old)
        },
        // These change rarely, if ever, so just re-add $spotEffects.
        'ochange_p_' + objectsAtter.passableIndex + ', ' +
        'ochange_p_' + objectsAtter.actionableIndex, function (n) {
          var ns = objectEffects.get(n)
          if (ns) {
            remove(n, ns)
            var props = objectsAtter(n, 0)
            add(props, n, spotEffects.get(props.class))
          }
        },
      ])
    },

    // Maintains state of explored/revealed bits within Shroud according to state of specific Effects that define radius around the object's current position.
    //
    // There is one Effect target for both explored and revealed because this implementation assumes exploration and revealing radiuses are the same, i.e. that a hero with the scouting radius of 6 makes 6 tiles around him explored and 6 tiles revealed (fully visible). This matches most other games including SoD which is a subset of our implementation given it doesn't have the concept of "explored but not visible".
    _initializeShroudRevealer: function (target, exploredBit, revealedBit, repCol, id) {
      var objects = this.map.objects
      var player = objects.atCoords(id, 0, 0, 'owner', 0)
      var prevX
      var prevY
      var prevRadius
      var prevZ   // maintained by updater(), not update()

      // No arguments - shroud is deleted.
      // All arguments but no (null) prev... - shroud is added.
      // All arguments and all prev... - shroud is updated.
      var update = function (x, y, radius) {
        // Doing nothing during initial render because we need calculators of all heroes/towns created in order to determine visible regions. map.shroud may already have it all done (if the game was saved and then loaded) and if not, render will explicitly trigger recalculation after initializing all calculators.
        if (((prevX == x) && (prevY == y) && (prevRadius == radius))
            || this.get('rendered') !== true) {
          return
        }

        var z = objects.atCoords(id, 0, 0, 'z', 0)

        this.map.shroud.batch(null, function () {
          // Quick update if id just appeared (no prev...) or stayed on the same spot but its radius has increased (e.g. Lookout Tower erected or Speculum equipped).
          if (prevX == null ||  // prev... null, arguments not
              // None of prev... and arguments are null.
              (prevX == x && prevY == y && radius > prevRadius)) {
            _.log && _.log('Shroud revealer %d update Z=%d P%d : old (%d;%d) R=%d : new (%d;%d) R=%d', id, prevZ, player, prevX, prevY, prevRadius, x, y, radius)

            // Setting revealed bits before explored is a minor optimization: Shroud will call _fire_changes() only once per spot (not twice) because revealed is more significant.

            // Unlike exploration status, revealed (fully visible) status requires at least one actor overseeing the spot. If new radius is smaller (another branch), check viewers of all newly invisible spots and flip the bit if there are none. If the radius is larger (as here), no need to check that, just set the bit within the new radius.
            if (revealedBit != null) {
              _.log && _.log('Revealed shroud %d : (%d;%d;%d) R=%d P%d', id, x, y, z, radius, player)
              this.map.shroud.setWithinCircle(x, y, radius, z, player, revealedBit, true)
            }

            // Exploration status is permanent. If new scouting radius is larger (as here) or the object has moved (in another branch), always simply set exploration bits (an optimization of diffing old and new circles' coordinates is not done, not sure if it's worth it given Shroud doesn't fire if visibility hasn't changed).
            if (exploredBit != null) {
              _.log && _.log('Explored shroud %d : (%d;%d;%d) R=%d P%d', id, x, y, z, radius, player)
              this.map.shroud.setWithinCircle(x, y, radius, z, player, exploredBit, true)
            }
          } else {    // (moved and/or changed radius) or shrunk radius
            // prev... not null, arguments null or not.

            if (revealedBit != null) {
              var coords = []

              if (x == null) {   // id gone; arguments null, prev... not
                Common.withinCircle(
                  prevX, prevY, prevRadius,
                  this.map.get('width') - 1,
                  this.map.get('height') - 1,
                  function () { coords.push(arguments) }
                )
              } else {  // id moved or radius shrunk
                Common.diffCircles(
                  x, y, radius,
                  prevX, prevY, prevRadius,
                  this.map.get('width') - 1,
                  this.map.get('height') - 1,
                  function () { coords.push(arguments) },
                  function (x, y) {
                    _.log && _.log('Revealed shroud %d : (%d;%d;%d) P%d', id, x, y, z, player)
                    this.map.shroud.setAtCoords(x, y, z, player, revealedBit, true)
                  },
                  this
                )
              }

              if (coords.length) {
                var othersSee = new Set
                var others = repCol(player)

                _.log && _.log('Other shroud revealers %d : %s', id, others.join(' '))

                _.each(others, function (other) {
                  if (other != id) {
                    var calc = this.cx.oneShotEffectCalculation({
                      target: target,
                      ifObject: other,
                    })

                    Common.withinCircle(
                      objects.atCoords(other, 0, 0, 'x', 0),
                      objects.atCoords(other, 0, 0, 'y', 0),
                      calc,
                      this.map.get('width') - 1,
                      this.map.get('height') - 1,
                      function (x, y) {
                        othersSee.add(x | y << 16)
                      }
                    )
                  }
                }, this)

                _.each(coords, function (coords) {
                  if (!othersSee.has(coords[0] | coords[1] << 16)) {
                    _.log && _.log('Concealed shroud %d : (%d;%d;%d) P%d', id, coords[0], coords[1], prevZ, player)
                    this.map.shroud.setAtCoords(coords[0], coords[1], prevZ, player, revealedBit, false)
                  }
                }, this)
              }
            }

            if (x != null && (prevX != x || prevY != y)) {  // id moved
              if (exploredBit != null) {
                _.log && _.log('Explored shroud %d : (%d;%d;%d) R=%d P%d', id, x, y, z, radius, player)
                this.map.shroud.setWithinCircle(x, y, radius, z, player, exploredBit, true)
              }
            }
          }
        }, this)

        prevX = x
        prevY = y
        prevRadius = radius
      }.bind(this)

      var calc = this.cx.listeningEffectCalculator({
        shared: false,
        target: target,
        ifObject: id,
      })

      var updater = function () {
        // Once I have observed an exception stack trace that went like this:
        //
        // 1. combat state changing to 'end'
        // 2. removeFromStore() on one of the heroes (defeated)
        // 3. indexes of map.effects updated (objectRemoved())
        // 4. a Calculator invalidated
        // 5. updater() called when id no longer exists
        //
        // I haven't verified this supposition but it must be target's calc's
        // change_value triggering updater() before oremove has triggered off().
        // Hence this check for object existence.
        if (this.map.objects.anyAtCoords(id, 0, 0)) {
          var owner = objects.atCoords(id, 0, 0, 'owner', 0)
          if (owner != player) {
            _.log && _.log('Shroud revealer %d owner P%d <- P%d', id, owner, player)
            update()
            player = owner
          }

          var z = objects.atCoords(id, 0, 0, 'z', 0)
          if (prevZ != z) {
            _.log && _.log('Shroud revealer %d Z %d <- %d', id, z, prevZ)
            update()
            prevZ = z
          }

          var actionable = this.map.actionableSpot(id)
          update(actionable[0], actionable[1], calc.updateIfNeeded().get('value'))
        }
      }.bind(this)

      var events = []

      events.push([this, this.on('_initializeShroud', updater)])
      events.push([calc, calc.whenRenders('change_value', updater)])

      var guard = Common.batchGuard(0, updater)
      _.each(['x', 'y', 'z'], function (prop) {
        events.push([objects, objects.on('ochange_p_' + objects.propertyIndex(prop), function (n, $2, $3, $4, $5, options) {
          objects.fromContiguous(n, 0).x == id && guard(options)
        })])
      })

      events.push([objects, objects.on('ochange_p_' + objects.propertyIndex('actionable'), function (n) {
        objects.fromContiguous(n, 0).x == id && updater()
      })])

      events.push([objects, objects.on('ochange_p_' + objects.propertyIndex('owner'), function (n) {
        objects.fromContiguous(n, 0).x == id && updater()
      })])

      function remove() {
        _.log && _.log('Shroud revealer %d removed', id)
        update()
        Common.off(events)
      }

      events.push([objects, objects.on('oremove_n_' + objects.toContiguous(id, 0, 0, 0), remove)])

      this.once('-unnest', function () { Common.off(events) })

      // To avoid mistakes, there should be one persistent revealer per id and its hooks must remain bound for the lifetime of id (or Rules). For example, rather than making a collection of revealers per each player (potential owner), make a unified collection of revealers for all ownable objects. Otherwise it's easy to off() a revealer's hooks before it has done the final update() in response to object changing owner or being removed:
      //
      //   map.players.each(function (owner) {
      //     var col = new Effects.Collection
      //     col.on('+readyMember', function (member, id) {
      //       member.off = _initializeShroudRevealer(...id...)
      //     })
      //     col.bindStoreCoords(map.byOwner, owner)
      //   })
      //
      // If owner of id changes, bindStoreCoords() may see it first and removeMember() may unbind member.off before the revealer's ochange hook is called and old owner's shroud will remain as if id wasn't captured by another player.
      //
      // If several revealer instances are still needed, client must make sure to call the returned function (in the above example this would go to removeMember()).
      return remove
    },

    // Propagates state of Shroud bits set on one player as the corresponding allied bits for other players in his team. This lets allies share a common field of vision.
    //
    // Allied shroud works by determining top-rated (by visibility type - explored or revealed) player of each spot and reflecting that player's visibility type onto other players' allies... bits.
    //
    // For example, there is a team of two players (P1 and P2). A hero of P1 is placed with hero_shroud radius of 2:
    //
    //   [ ][ ][ ][1][ ][ ]   This causes alliesVisible to be set on P2's
    //   [ ][ ][1][1][1][ ]   map.shroud spots marked with (1) on the left.
    //   [ ][1][1][@][1][1]   (@) is equivalent of (1).
    //   [ ][ ][1][1][1][ ]
    //   [ ][ ][ ][1][ ][ ]
    //
    // Then a P2 hero is placed on the right side, with hero_shroud overlapping the P1's in (%) spots:
    //
    //   [ ][ ][ ][1][ ][ ][ ][ ]   This causes alliesVisible to be set on
    //   [ ][ ][1][1][1][2][ ][ ]   P1's map.shroud spots market with (2)
    //   [ ][1][1][@][%][%][2][ ]   and on P2's (@).
    //   [ ][ ][1][%][%][@][2][2]   Note that this bit is unset for (%) spots
    //   [ ][ ][ ][1][2][2][2][ ]   for P1 but set for P2, even though both
    //   [ ][ ][ ][ ][ ][2][ ][ ]   players oversee them.
    //
    // Then the first hero moves one tile to the left:
    //
    //   [ ][ ][1‡[-][ ][ ][ ][ ]   † former P1's hero spot
    //   [ ][1‡[1][1][-][2][ ][ ]   ‡ new spots, alliesVisible set for P2
    //   [1‡[1][@][1†[%][>][2][ ]   (1) (2) indicate original spot "discoverer"
    //   [ ][1‡[1][%][>][@][2][2]
    //   [ ][ ][1‡[-][2][2][2][ ]   (2), (%) and non-‡ (1) spots retain
    //   [ ][ ][ ][ ][ ][2][ ][ ]   the same state (no events fired)
    //
    // The real juice is happening with (-) and (>) spots. Due to P1's move, a changes was fired that listed those as changing state from visible to invisible on P1:
    //                         x  y  z      new MSB    old MSB      changed
    //   1. Top (-) entry:    [3, 0, 0, P1, undefined, hero_shroud, true]
    //   2. Lower (-) entry:  [4, 1, 0, P1, undefined, hero_shroud, true]
    //   3. Bottom (-) entry: [3, 4, 0, P1, undefined, hero_shroud, true]
    //   4. Top (>) entry:    [5, 2, 0, P1, undefined, hero_shroud, true]
    //   5. Bottom (>) entry: [4, 3, 0, P1, undefined, hero_shroud, true]
    //
    // This is so because P1 didn't have alliesVisible bits set on these spots (but P2 had) so in absence of others more significant overseers the hero_shroud bit, which was now cleared, were deciding the state.
    //
    // In further operation, for every (-) (>) spot for every allied player we clear alliesVisible and see what is now the "most significant state".
    //
    // For example, after clearing alliesVisible for 1. the spot is reported invisible by both players so we leave the bit cleared (allied vision is gone on that spot).
    //
    // But after clearing alliesVisible for 4. only P1 reports the spot invisible while P2 can see it. We set alliesVisible for all players except the overseer (i.e. set for P1 but not for P2).
    //
    // In the end, the new map looks like this:
    //
    //   [ ][ ][1][ ][ ][ ][ ][ ]   † spots under "ownership" of P1 (have
    //   [ ][1][1][1][ ][2][ ][ ]   alliesVisible set on P2)
    //   [1][1][@][1][%†[%‡[2][ ]
    //   [ ][1][1][%†[%‡[@][2][2]   ‡ newly "acquired" spots of P2 (have
    //   [ ][ ][1][ ][2][2][2][ ]   alliesVisible set on P1)
    //   [ ][ ][ ][ ][ ][2][ ][ ]
    //
    // Above demonstrates usage of just one allied bit. Using two (like we actually do, with added alliesExplored) or more bits is not much different except when determining the state all bits are cleared, and of all states the most "ranked" is chosen (i.e. invisible is lowest, explored is higher, revealed is highest).
    _initializeAlliedShroud: function (players) {
      var visible = this.map.constants.shroud.visible
      var alliesExplored = this.map.constants.shroud.alliesExplored
      var alliesVisible = this.map.constants.shroud.alliesVisible
      var restrict = ~(1 << alliesExplored | 1 << alliesVisible)

      this.autoOff(this.map.shroud, {
        changes: function (changes) {
          var state = new Map

          _.each(changes, function (coords) {
            if (coords[4] != alliesExplored &&
                coords[4] != alliesVisible &&
                players.indexOf(coords[3]) != -1) {
              // Giving 0 because particular player is not important as a key, we only store one entry per spot.
              var n = this.map.shroud.toContiguous(coords[0], coords[1], coords[2], 0)
              var prev = state.get(n)
              var cur = !(coords[4] >= 0) ? 0 : 1 + _.includes(visible, coords[4])
              if (!prev || prev[0] < cur) {
                state.set(n, [cur].concat(coords))
              }
            }
          }, this)

          if (_.log) {
            var msg = []
            state.forEach(function (cur) {
              msg.push(_.format('(%d;%d;%d) P%d bit=%d', cur[1], cur[2], cur[3], cur[4], cur[5]))
            })
            _.log('Allied shroud update : %s', msg.join(', '))
          }

          this.map.shroud.batch(null, function () {
            state.forEach(function (cur) {
              if (cur[0] == 2) {
                // The cur spot has seen a change to "fully visible". This means for all players it was previously explored or invisible (alliesVisible is greater than the max of visible) so we can outright set the bit on all players except the one where that change occurred, else we'd lock up that spot (it will never change state since state change depends on the just-changed bit which is less significant than alliesVisible).
                players.forEach(function (player) {
                  if (player != cur[4]) {
                    // Higher MSB so setting this before alliesExplored to avoid an intermediate changes entry (not <aV- aE+ 0+> --[MSB 0]-> <aV- aE- 0+> --[MSB aV]-> <aV+ aE- 0+> but <aV- aE+ 0+> --[MSB aV]-> <aV+ aE+ 0+> --[MSB aV]-> <aV+ aE- 0+>).
                    this.map.shroud.setAtCoords(cur[1], cur[2], cur[3], player, alliesVisible, true)
                  }

                  // Have only one allies... bit set at a time.
                  this.map.shroud.setAtCoords(cur[1], cur[2], cur[3], player, alliesExplored, false)
                }, this)
              } else {
                // There was a change to "explored" (or "invisible"). It doesn't imply the cur spot isn't "fully visible" (or "explored") in some ally (this player's visibility state may have lowered but another player may still oversee the spot) so gotta check that.
                var owner

                var revealed = players.some(function (p) {
                  var vis = p == cur[4]
                    // The change's player never has any of allies... bits set since he "owns" the spot.
                    // We know his state (either explored or invisible) so skip atCoords().
                    //
                    // It's important to have stable order of owning player selection in case multiple players oversee the same spot to avoid repeatedly flipping its ownership. Of all overseeing players, for "fully visible" we pick one with the smallest number (e.g. P2, P5 -> P2), for "explored" - the largest. In particular, we don't initialize the above var owner to cur[4] and add if (p != cur[4]) to this loop because in this case final value of owner will depend on the change's player. For example, if it's P5 and players = [2, 5], both overseeing as "explored", then owner is initialized to 5 and set to 2 in the loop; if the change's player is P2 then owner is initialized to 2 and set to 5 in the loop.
                    ? cur[0] == 1 ? 0.1 : -1
                    : this.map.shroud.atCoords(cur[1], cur[2], cur[3], p, restrict)
                  if (vis >= 0) {
                    owner = p
                    return visible.indexOf(vis) != -1
                  }
                }, this)

                var bit  =  revealed ? alliesVisible : alliesExplored
                var ibit = !revealed ? alliesVisible : alliesExplored

                players.forEach(function (p) {
                  this.map.shroud.setAtCoords(cur[1], cur[2], cur[3], p, bit, owner != p && owner != null)
                  this.map.shroud.setAtCoords(cur[1], cur[2], cur[3], p, ibit, false)
                }, this)
              }
            }, this)
          }, this)
        },
      })
    },

    // Maintains Effects provided by creatures in some object's garrison (like a town's). For example, boosts morale for the party if an Archangel is present.
    _initializeEffectsGarrison: function (
      id, n, collection,
      creaturesEffectsIndex,
      creaturesExtraEffectsIndex,
      objectsGarrisonIndex
    ) {
      return (new collection({effects: this.map.effects, batchObjects: [this.map.effects]}))
        .on({
          '+readyMember': function (res, creature) {
            res.effects = [].concat(
              this.creatures.atCoords(creature, 0, 0, creaturesEffectsIndex, 0) || [],
              this.creatures.atCoords(creature, 0, 0, creaturesExtraEffectsIndex, 0) || []
            )
          },
        }, this)
        .bindStoreValue(this.map.objects, n, objectsGarrisonIndex, function (garrison) {
          var res = []
          this.map.objects.readSub(objectsGarrisonIndex, garrison)
            .find('creature', function (creature) {
              if (res.indexOf(creature) == -1) {
                res.push(creature)
              }
            })
          return res
        }, this)
    },

    // Assigns default values to AObject properties of newly created objects (or all map objects when starting a new game). This includes town/hero name, hero gender/skills, count of roaming monsters, type of random treasure/town, etc.
    //
    // Also adds dynamic Effects for objects that start off as owned by some player. Normally, captured object receives Effects during GenericEncounter's processing.
    //
    // Other than initially owned, none of Effects added here are $dynamic. They are added once for each new
    // hero/town/etc., remembered in AObject->$initialized and not initialized again even on restart.
    _initializeObjects: function () {
      var self = this
      var objects = this.map.objects.schema()
      var heroes = this.heroes.schema()
      var heroClasses = this.heroClasses.schema()
      var effects = this.map.effects.schema()

      // This assumes no ownable objects have custom hooks on GenericEncounter.
      //
      // Town's buildings are not encountered until the player enters the town (townscape transition) so that the user sees relevant messages. This is per SoD. Still, most buildings have static effects (don't affect particular hero) that take effect immediately.
      function initEncounter(id, owner) {
        owner && self.objectPending([id], ['initiallyOwned'])
      }

      // Assuming that owner changes happen through GenericEncounter that takes care of bonus effects.
      this.autoOff(this.map.objects, {
        oadd: function (n, $, props) {
          initEncounter(props[objects.id], props[objects.owner])
        },
        pending_initiallyOwned: function (id) {
          ;(new Rules.GenericEncounter({rules: this, bonus: id}))
            .on({
              remove: function () {
                self.objectFinished([id])
              },
            })
            .attach()
            .handleInitiallyOwned()
        },
      })

      this.map.byOwner.find(0, initEncounter)

      // Initializers are called in order in funcs. This is important for random which needs to run before others (e.g. hero's name depends on the hero personality determined by random).
      //
      // If exists, funcs[-1] must be always first in funcs. It's called for every existing and new objects on every game start (or after load) regardless of AObject->$initialized. It isn't written to the latter.
      //
      // Before initializing every object, preFunc and postFunc are called. If there are multiple funcs then preFunc is called before calling the first from funcs and postFunc - after the last.
      //
      // However, when initializing existing objects, preFunc is called before calling the first funcs for the first object, and postFunc - after calling the last funcs for the last object. So instead of calling them N times where N = number of objects, each is called just once.
      var forExistingAndNew = function (type, funcs, preFunc, postFunc) {
        var setup = false     // whether preFunc was called for an object
        var teardown = false  // whether to postFunc after setup object

        var add = function ($1, $2, byTypeProps) {
          var n = self.map.objects.toContiguous(byTypeProps[0], 0, 0, 0)
          var props = self.map.objects.objectAtContiguous(n, 0)
          var id = props[objects.id]

          var initialized = (props[objects.initialized] || '').split('')
          var changed
          var thisFuncs = funcs.concat()

          var process = function () {
            if (thisFuncs.length) {
              if (initialized[thisFuncs[0]] != '1' && changed === undefined) {
                changed = null  // don't wrap into batch()
                return self.map.objects.batch(null, function () {
                  self.map.effects.batch(null, function () {
                    if (setup) {
                      process()
                    } else {
                      preFunc && preFunc()
                      process()
                      teardown ? postFunc && postFunc() : setup = true
                    }
                  })
                })
              }

              var bit = thisFuncs.shift()
              var func = thisFuncs.shift()

              if (initialized[bit] != '1') {
                var res = func(id, props, n)
                _.log && _.log('Initialized object %d.%d : %j', id, bit, res)
                if (res == 'remove') {
                  // Don't trigger set...() if the object was removed by funcs.
                  changed = -1
                  return self.map.objects.removeAtContiguous(n, 0)
                } else if (res !== false) {
                  // Don't trigger set...() if the -1 key is the only one that resulted in calling one of funcs.
                  changed = bit
                  initialized[bit] = '1'
                  while (bit-- > 0 && !initialized[bit]) { initialized[bit] = '0' }
                }
              }

              process()
            }
          }

          process()

          if (changed != null && changed != -1) {
            self.map.objects.setAtContiguous(n + objects.initialized, 0, initialized.join(''))
          }
        }

        self.map.byType.findAtCoords(type, 0, 0, 0, function (id) {
          add(null, null, [id])
        })
        setup && postFunc && postFunc()

        setup = false
        teardown = true
        // Assume that every added Effect is auto-removed when needed
        // because it has $ifObject or other auto-monitored selector so not
        // listening for oremove.
        self.autoOff(self.map.byType, ['oadd_n_' + type, add])
      }

      //forExistingAndNew(this.constants.object.type.other, [
      //])

      forExistingAndNew(this.constants.object.type.quest, [
        this.constants.object.initialized.name,
        function (id, props) {
          var cls = props[objects.class]
          if (_.includes(self.objectsID.seerHut, cls)) {
            // SEERHUT.TXT[50] onwards
            var names = 'Abraham Goldwyn Bryce Blain Engle Carsten Dulcie Donard Esslock Evander Frederick Fay Genevieve Horace Heather Ike Jhem Julius Joseph Kae Kendrick Lynwood Kyriell Marigold Norwood Clova Tim Gier Paige Pierce Rae Raphael Rex Hester Spiridion Skye Rival Timeus Sulmand Rizlav Violet Wendell Winston Xanthe Xavier Yvette Zaray Zoe'.split(' ')
            self.map.effects.append({
              source: self.constants.effect.source.initialize,
              target: self.constants.effect.target.name,
              modifier: _.sample(names),
              priority: self.map.effects.priority(self.constants.effect.operation.const, self.constants.effect.priority.mapSpecific),
              ifObject: id,
            })
          } else {
            return false
          }
        },
        this.constants.object.initialized.message,
        function (id, props) {
          var group
          _.each(['message', 'progress', 'completion'], function (prop) {
            prop = self.map.objects.propertyIndex(prop)
            var msg = props[prop]
            if (_.isArray(msg)) {
              group == null && (group = _.random(msg.length - 1))
              self.map.objects.setAtCoords(id, 0, 0, 0, prop, msg = msg[group])
            }
            if (prop == objects.progress && msg !== false) {
              self.map.effects.append({
                source: self.constants.effect.source.initial,
                target: self.map.constants.effect.target.quest_message,
                modifier: [self.constants.effect.operation.custom, 'rules', 5, msg],
                priority: self.map.effects.priority(self.constants.effect.operation.append, self.constants.effect.priority.mapSpecific),
                ifBonusObject: id,
              })
            }
          })
          var messages = [
            // SEERHUT.TXT[1]
            'This should be the home of `{SeerName`} the Seer, but it appears to have been abandoned for quite some time.',
            'The locals said this was the home of `{SeerName`}, but there is clearly no one here.',
            'You\'re convinced this was the home of `{SeerName`}, but it is clear it has been deserted for some time.',
          ]
          var cls = props[objects.class]
          if (_.includes(self.objectsID.seerHut, cls)) {
            // Seer's Hut has multiple random "deserted" messages and only one should be chosen for the duration of this game.
            self.map.effects.append({
              source: self.constants.effect.source.initial,
              target: self.map.constants.effect.target.quest_message,
              modifier: [self.constants.effect.operation.custom, 'rules', 5, null, _.sample(messages)],
              priority: self.map.effects.priority(self.constants.effect.operation.append, self.constants.effect.priority.mapSpecific),
              ifBonusObject: id,
            })
          }
        },
      ])

      var calc
      forExistingAndNew(
        this.constants.object.type.artifact,
        [
          this.constants.object.initialized.random,
          function (id, props) {
            var cls = props[objects.class]
            if (_.includes(self.objectsID.randomArtifact, cls)) {
              var rarity
            } else if (_.includes(self.objectsID.randomTreasureArtifact, cls)) {
              var rarity = self.constants.artifact.rarity.treasure
            } else if (_.includes(self.objectsID.randomMinorArtifact, cls)) {
              var rarity = self.constants.artifact.rarity.minor
            } else if (_.includes(self.objectsID.randomMajorArtifact, cls)) {
              var rarity = self.constants.artifact.rarity.major
            } else if (_.includes(self.objectsID.randomRelic, cls)) {
              var rarity = self.constants.artifact.rarity.relic
            } else {
              return false
            }
            calc.set('ifObject', id)
            var chances = calc.updateIfNeeded().get('value')
            var total = 0
            chances = _.filter(chances, function (c, id) {
              if (c > 0 && (rarity == null || rarity == self.artifacts.atCoords(id, 0, 0, 'rarity', 0))) {
                total += c
                return true
              }
            })
            // Artifacts can duplicate so picking item from full array every time.
            var art = self._pickFromChances(total, _.entries(chances))
            if (!art) {
              // No more artifacts to pick from, scrap the object.
              return 'remove'
            }
            self.map.effects.append({
              source: self.constants.effect.source.initial,
              target: self.map.constants.effect.target.bonus_artifacts,
              modifier: [self.constants.effect.operation.append, +art[1]],
              priority: self.map.effects.priority(self.constants.effect.operation.append, self.constants.effect.priority.mapSpecific),
              ifBonusObject: id,
            })
            // XXX=R:h3t:
            var cls = _.sample(self.objectsID['artifact_' + art[1]])
            _.each(['texture', 'animation', 'duration'], function (prop) {
              var value = self.classes.atCoords(cls, 0, 0, prop, 0)
              self.map.objects.setAtCoords(id, 0, 0, 0, prop, value)
            })
          },
        ],
        function () {
          calc = self.cx.changeableEffectCalculator({
            class: Calculator.Effect.GenericIntHash,
            target: self.constants.effect.target.artifactChance,
          }).take()
        },
        function () {
          calc.release()
        }
      )

      forExistingAndNew(this.constants.object.type.treasure, [
        this.constants.object.initialized.random,
        function (id, props) {
          var cls = props[objects.class]
          if (!_.includes(self.objectsID.randomResource, cls)) {
            return false
          }

          var type = _.sample(_.values(self.constants.resources))
          var quantity = props[objects.randomQuantity]

          if (quantity === false) {
            // XXX=RH taken from SoD editor's help
            switch (type) {
              case self.constants.resources.wood:
              case self.constants.resources.ore:
                quantity = [5, 10]
                break
              case self.constants.resources.gold:
                quantity = [5, 10, 100]
                break
              default:
                quantity = [3, 6]
            }
          } else if (type == self.constants.resources.gold) {
            quantity *= 100
          }

          self.map.effects.append({
            source: self.constants.effect.source.initial,
            target: self.map.constants.effect.target.bonus_resource,
            modifier: _.isArray(quantity)
              ? [self.map.constants.effect.operation.random].concat(quantity)
              : quantity,
            priority: self.map.effects.priority(self.constants.effect.operation.delta, self.constants.effect.priority.mapSpecific),
            ifBonusObject: id,
            ifResource: type,
            ifTargetPlayer: -1,
          })

          self.map.objects.setAtCoords(id, 0, 0, 0, 'subclass', type)
          // XXX=R:h3t:
          var cls = self.objectsID['resource_' + type]
          _.each(['texture', 'animation', 'duration'], function (prop) {
            var value = self.classes.atCoords(cls, 0, 0, prop, 0)
            self.map.objects.setAtCoords(id, 0, 0, 0, prop, value)
          })
        },
      ])

      forExistingAndNew(this.constants.object.type.monster, [
        this.constants.object.initialized.random,
        function (id, props) {
          if (props[objects.subclass] !== false) {
            return false
          }

          var potential = []
          var level = props[objects.randomLevel]
          if (typeof level == 'number') { level = [level] }

          self.creatures.find(0, function ($, id) {
            if ((level === false || _.includes(level, self.creatures.atCoords(id, 0, 0, 'level', 0))) && self.creatures.atCoords(id, 0, 0, 'mapMin', 0)) {
              potential.push(id)
            }
          })

          var creature = props[objects.subclass] = _.sample(potential)
          self.map.objects.setAtCoords(id, 0, 0, 0, 'subclass', creature)
          // XXX=R:h3t:
          var cls = _.sample(self.objectsID['monster_' + creature])
          _.each(['texture', 'animation', 'duration'], function (prop) {
            var value = self.classes.atCoords(cls, 0, 0, prop, 0)
            self.map.objects.setAtCoords(id, 0, 0, 0, prop, value)
          })
        },
        this.constants.object.initialized.garrison,
        function (id, props, n) {
          var creature = props[objects.subclass]
          var count = _.random(
            self.creatures.atCoords(creature, 0, 0, 'mapMin', 0),
            self.creatures.atCoords(creature, 0, 0, 'mapMax', 0)
          )
          var sub = self.map.objects.subAtContiguous(n + objects.garrison, 0)
          try {
            sub.batch(null, function () {
              sub.extendTo(0)
              sub.removeAtCoords(0, 0, 0, 0)
              sub.addAtCoords(0, 0, 0, {
                creature: creature,
                count: count,
              })
            })
          } finally {
            sub.release()
          }
        },
      ])

      forExistingAndNew(this.constants.object.type.town, [
        this.constants.object.initialized.random, function (id, props) {
          if (props[objects.subclass] !== false) {
            return false
          }

          if (props[objects.randomTypeOf] !== false || props[objects.owner] !== 0) {
            var town = self.cx.oneShotEffectCalculation({
              target: self.constants.effect.target.player_town,
              ifPlayer: props[objects.randomTypeOf] === false ? props[objects.owner] : props[objects.randomTypeOf],
            })
          } else {
            var town = _.sample(_.values(self.townsID))
          }

          props[objects.subclass] = town
          self.map.objects.setAtCoords(id, 0, 0, 0, 'subclass', town)
          // XXX=R:h3t:
          var cls = _.sample(self.objectsID['town_' + town])
          _.each(['texture', 'animation'], function (prop) {
            Common.alterStringifiedArray(self.classes.atCoords(cls, 0, 0, prop, 0), 1, function (value) {
              self.map.objects.setAtCoords(id, 0, 0, 0, prop, Common.alterStringifiedArray(props[objects[prop]], 1, value))
            })
          })
          // XXX=I update duration
        },
        this.constants.object.initialized.name,
        function (id, props) {
          self.map.effects.append({
            source: self.constants.effect.source.initialize,
            target: self.constants.effect.target.name,
            modifier: _.sample(self.towns.atCoords(props[objects.subclass], 0, 0, 'names', 0)),
            priority: self.map.effects.priority(self.constants.effect.operation.const, self.constants.effect.priority.mapSpecific),
            ifObject: id,
          })
        },
        this.constants.object.initialized.portrait,
        function (id, props) {
          self.map.effects.append({
            source: self.constants.effect.source.initialize,
            target: self.constants.effect.target.portrait,
            modifier: -1.0001 * self.towns.atCoords(props[objects.subclass], 0, 0, 'portrait', 0),
            priority: self.map.effects.priority(self.constants.effect.operation.const, self.constants.effect.priority.mapSpecific),
            ifObject: id,
          })
        },
        this.constants.object.initialized.buildings,
        function (id, props) {
          self.map.effects.append({
            source: self.constants.effect.source.initialize,
            target: self.constants.effect.target.town_buildings,
            // Minimally required for player to be able to do anything with the town.
            modifier: [self.constants.effect.operation.append, self.buildingsID.hall],
            priority: self.map.effects.priority(self.constants.effect.operation.append, self.constants.effect.priority.mapSpecific),
            ifObject: id,
          })
        },
        // available - initialized in _initializeWeek.
        // spells - initialized in _initializeEffectsTowns.
      ])

      var heroCopier = function (target, prop, floatFix) {
        return function heroCopier_(id, props) {
          var value = self.heroes.atCoords(props[objects.subclass], 0, 0, prop, 0)
          if (floatFix) { value *= floatFix }
          self.map.effects.append({
            source: self.constants.effect.source.initialize,
            target: target,
            modifier: value,
            priority: self.map.effects.priority(self.constants.effect.operation.const, self.constants.effect.priority.mapSpecific),
            ifObject: id,
          })
        }
      }

      var stats = [
        [heroClasses.attack, this.constants.effect.target.hero_attack],
        [heroClasses.defense, this.constants.effect.target.hero_defense],
        [heroClasses.spellPower, this.constants.effect.target.hero_spellPower],
        [heroClasses.knowledge, this.constants.effect.target.hero_knowledge],
      ]

      var garrisonAtter = this.heroes.atter(['garrison1Min', 'garrison1Max', 'garrison1', 'garrison2Min', 'garrison2Max', 'garrison2', 'garrison3Min', 'garrison3Max', 'garrison3', 'artifactSlot', 'artifact'])

      forExistingAndNew(this.constants.object.type.hero, [
        this.constants.object.initialized.random,
        function (id, props) {
          var player = self.map.players.nested(props[objects.owner])

          var cls = props[objects.class]
          if (_.includes(self.objectsID.heroPlaceholder, cls)) {
            if (player.get('startingHero') == id) {
              player.set('startingHeroClasses', null)
            }
            // XXX=I support hero placeholders
            return 'remove'
          } else if (!_.includes(self.objectsID.randomHero, cls)) {
            return false
          }

          var chances = self.cx.oneShotEffectCalculation({
            class: Calculator.Effect.GenericIntHash,
            target: self.constants.effect.target.heroChance,
            ifPlayer: props[objects.owner],
          })
          // Hero->$id => int %
          chances = _.filter(chances, function (c) { return c > 0 })

          // XXX=R duplicates with _initializePlayers()
          self.map.players.each(function (player) {
            player.heroes.each(function (hero) {
              delete chances[hero.get('subclass')]
            })
          })

          // If there is a user choice, take it, else pick a random hero from the same-race heroes, and if there are no such heroes available then pick from all available heroes.
          var index = player.getSet('-nextHero', Common.inc())
          var hero = (player.get('heroes') || [])[index]

          if (hero == null) {
            var race = self.cx.oneShotEffectCalculation({
              target: self.constants.effect.target.player_town,
              ifPlayer: props[objects.owner],
            })
            var raceChances = _.filter(chances, function (c, hero) {
              return race == self.heroClasses.atCoords(self.heroes.atCoords(hero, 0, 0, 'class', 0), 0, 0, 'town', 0)
            })
            _.isEmpty(raceChances) && (raceChances = chances)
            var hero = self._pickFromChances(_.sum(raceChances), _.entries(raceChances))
            if (!hero) {
              if (player.get('startingHero') == id) {
                player.set('startingHeroClasses', null)
              }
              return 'remove'   // shouldn't normally happen
            }
            hero = +hero[1]
          }

          player.getSet('heroes', function (cur) {
            cur = cur ? cur.concat() : []
            cur[index] = hero
            return cur
          })

          if (player.get('startingHero') == id) {
            player.set('startingHeroClasses', hero)
          }

          props[objects.subclass] = hero
          self.map.objects.setAtCoords(id, 0, 0, 0, 'subclass', hero)
          hero = self.heroes.atCoords(hero, 0, 0, 'class', 0)
          // XXX=R:h3t:
          var cls = _.sample(self.objectsID['hero_' + hero])
          // Need to only change the bitmap name, preserving features. If entire value is replaced, new texture/animation may lose ownership feature and hero won't bear the player's flag.
          _.each(['texture', 'animation'], function (prop) {
            var a = Common.alterStringifiedArray(props[objects[prop]])
            a[1] = Common.alterStringifiedArray(self.classes.atCoords(cls, 0, 0, prop, 0))[1]
            // Random hero's default group is 0 since it doesn't have others. Need to set it to normal hero's default group.
            a[4] = self.map.constants.animation.group.visiting
            self.map.objects.setAtCoords(id, 0, 0, 0, prop, a.join())
          })
          // XXX=I update duration
        },
        this.constants.object.initialized.name,
        heroCopier(this.constants.effect.target.name, heroes.name),
        this.constants.object.initialized.gender,
        heroCopier(this.constants.effect.target.hero_gender, heroes.gender, -1.0001),
        this.constants.object.initialized.biography,
        heroCopier(this.constants.effect.target.hero_biography, heroes.biography),
        this.constants.object.initialized.portrait,
        heroCopier(this.constants.effect.target.portrait, heroes.portrait),
        this.constants.object.initialized.combatImage,
        heroCopier(this.constants.effect.target.combatImage, heroes.combatImage),
        this.constants.object.initialized.experience,
        function (id, props, n) {
          // XXX++I this works if initial experience is < level 2; if not, SoD does some kind of (XXX=C random-based?) "unattended level-up" (automatically choosing stats and skills); at very least, $level should be bumped here
          //
          // XXX=C check what happens if experience is set for an on-map hero (not in custom heroes dialog) - maybe he also does the same unattended level-up, if so then h3m2herowo.php should be updated
          var exp = self.map.get('initialHeroExperiences')[props[objects.subclass]] ||
            _.random(30, 90)  // determined empirically
          self.map.objects.setAtContiguous(n + objects.experience, 0, exp)
          self.map.objects.setAtContiguous(n + objects.level, 0, 0)
        },
        this.constants.object.initialized.stats,
        function (id, props) {
          var cls = self.heroes.atCoords(props[objects.subclass], 0, 0, heroes.class, 0)
          _.each(stats, function (stat) {
            self.map.effects.append({
              source: self.constants.effect.source.initialize,
              target: stat[1],
              modifier: self.heroClasses.atCoords(cls, 0, 0, stat[0], 0),
              priority: self.map.effects.priority(self.constants.effect.operation.const, self.constants.effect.priority.mapSpecific),
              stack: self.constants.effect.stack.classStats,
              ifObject: id,
            })
          })
        },
        this.constants.object.initialized.garrison,
        function (id, props, n) {
          var hero = garrisonAtter(props[objects.subclass], 0, 0, 0)
          var garrison = [
            {creature: hero.garrison1, count: _.random(hero.garrison1Min, hero.garrison1Max)},
          ]
          if (_.random(2)) {    // 66% chance (determined empirically)
            if (hero.artifact !== false) {
              var current = self.map.objects.subAtContiguous(n + objects.artifacts, 0)
              try {
                current.batch(null, function () {
                  current.extendTo(hero.artifactSlot)
                  current.removeAtCoords(hero.artifactSlot, 0, 0, 0)
                  current.addAtCoords(hero.artifactSlot, 0, 0, {artifact: hero.artifact})
                })
              } finally {
                current.release()
              }
            } else if (hero.garrison2 !== false) {
              garrison.push({
                creature: hero.garrison2,
                count: _.random(hero.garrison2Min, hero.garrison2Max),
              })
            }
            if (!_.random(2) && hero.garrison3 !== false) {    // 33% chance on top of 66% (empirical)
              garrison.push({
                creature: hero.garrison3,
                count: _.random(hero.garrison3Min, hero.garrison3Max),
              })
            }
          } else if (hero.artifact !== false && !_.random(2) && hero.garrison3 !== false) { // 33% (empirical)
            // Unlike with non-artifact templates, the game can grant the hero
            // creatures from slots 1 and 3 even if the artifact (slot 2)
            // wasn't granted.
            garrison.push({
              creature: hero.garrison3,
              count: _.random(hero.garrison3Min, hero.garrison3Max),
            })
          }
          var sub = self.map.objects.subAtContiguous(n + objects.garrison, 0)
          try {
            sub.batch(null, function () {
              sub.extendTo(garrison.length - 1)
              _.each(garrison, function (item, i) {
                sub.removeAtCoords(i, 0, 0, 0)
                sub.addAtCoords(i, 0, 0, item)
              })
            })
          } finally {
            sub.release()
          }
        },
        this.constants.object.initialized.artifacts,
        function (id, props, n) {
          var give = self.heroes.readSubAtCoords(props[objects.subclass], 0, 0, heroes.artifacts, 0)
          var current = self.map.objects.subAtContiguous(n + objects.artifacts, 0)
          try {
            current.batch(null, function () {
              current.extendTo(give.size().x - 1)
              give.find('artifact', function (artifact, n) {
                current.removeAtCoords(n, 0, 0, 0)
                current.addAtCoords(n, 0, 0, {artifact: artifact})
              })
            })
          } finally {
            current.release()
          }
        },
      ])

      // Should go after initializer for towns as it depends on picked town types.
      forExistingAndNew(this.constants.object.type.dwelling, [
        this.constants.object.initialized.random,
        function (id, props) {
          var cls = props[objects.class]
          if (!_.includes(self.objectsID.randomDwelling, cls) &&
              !_.includes(self.objectsID.randomDwellingByLevel, cls) &&
              !_.includes(self.objectsID.randomDwellingByTown, cls)) {
            return false
          }

          var classes = props[objects.randomTypes]

          if (props[objects.randomTypeOf]) {
            var town = self.map.objects.atCoords(props[objects.randomTypeOf], 0, 0, 'subclass', 0)

            classes = classes.filter(function (cls) {
              return self.classes.atCoords(cls, 0, 0, 'produce', 0).some(function (cr) {
                return self.creatures.atCoords(cr, 0, 0, 'town', 0) == town
              })
            })
          }

          // Unlike with other random objects, random dwelling has to be
          // replaced because $class needs to change.
          //
          // Also unlike others, new dwelling may be smaller than the random placeholder (which is 3x3 with 2 actionable spots but, for example, Goblin Barracts is 2x2 with just one spot). XXX=C How does SoD adjust position of the new object?
          props = self.map.objects.atter()(id, 0, 0, 0)
          var cls = props.class = _.sample(classes)
          // XXX=R:clc:
          _.each(['type', 'texture', 'animation', 'duration', 'width', 'height', 'miniMap', 'passableType', 'passable', 'actionable', 'actionableFromTop'], function (prop) {
            props[prop] = self.classes.atCoords(cls, 0, 0, prop, 0)
          })
          cls == null || self.createObject(props)
          return 'remove'
        },
      ])

      // SoD seems to initially order towns and heroes by their identity
      // which is only known now that random objects are resolved.
      _.each(['hero', 'town'], function (type) {
        var order = []
        self.map.byType.findAtCoords(self.constants.object.type[type], 0, 0, 0, function (id) {
          var subclass = self.map.objects.atCoords(id, 0, 0, 'subclass', 0)
          order[subclass] ? order[subclass].push(id) : order[subclass] = [id]
        })
        self.map.objects.batch(null, function () {
          _.each(order, function (ids) {
            _.each(ids, function (id) {
              self._bumpListOrder(id)
            })
          })
        })
      })
    },

    // Initializes random objects. Currently only used to ensure map has exactly one (random) Grail object.
    //
    // This is different from random initializers in _initializeObjects() in that it's called on every game start or load (but funcs[-1] can do that too) and for multiple objects at once. One practical application of this is Grail placement - removing all but one random object.
    _initializeRandom: function () {
      var byClass = {
        grail: [],
        obelisk: [],
      }

      var classIndex = this.map.objects.propertyIndex('class')

      _.each(this.map.constants.object.type, function (type, name) {
        switch (name) {
          case 'terrain':
          case 'river':
          case 'road':
            return
        }
        this.map.byType.findAtCoords(type, 0, 0, 0, function (id, $2, $3, $4, $5) {
          var cls = this.map.objects.atCoords(id, 0, 0, classIndex, 0)
          _.some(byClass, function (list, name) {
            if (_.includes(this.objectsID[name], cls)) {
              return list.push(id)
            }
          }, this)
        }, this)
      }, this)

      this.map.objects.batch(null, function () {
        this.map.effects.batch(null, function () {
          this._initializeRandomGrail(byClass)
        }, this)
      }, this)
    },

    _initializeRandomGrail: function (byClass) {
      if (byClass.grail.length) {
        var grail = byClass.grail.splice(_.random(byClass.grail.length - 1), 1)

        _.log && _.log('Picked Grail %d at (%d;%d;%d) out of other %d objects',
          grail[0],
          this.map.objects.atCoords(grail[0], 0, 0, 'x', 0),
          this.map.objects.atCoords(grail[0], 0, 0, 'y', 0),
          this.map.objects.atCoords(grail[0], 0, 0, 'z', 0),
          byClass.grail.length)

        _.each(byClass.grail, function (id) {
          this.map.objects.removeAtCoords(id, 0, 0, 0)
        }, this)
      } else {
        if (byClass.obelisk.length) {
          // XXX=I:grl: create new grail object and place it anywhere if got no premade object, provided there is any obelisk object
          //_.log && _.log('Created Grail %d at (%d;%d;%d)', obj.id, obj.x, obj.y, obj.z)
        }
      }
    },

    // Initializes player properties (starting bonus like artifact, starting resources based on difficulty, handicap Effects). Maintains pool of available heroes for hire in the player's taverns (in-town and on-map).
    //
    // Every town with a tavern and every standalone tavern can be targeted
    // ($ifObject) by tavernHeroes Effects. SoD rules are (determined empirically):
    //* Available hero pool is one for all taverns for a given player
    //* Standalone taverns on the map use the pool of the visiting player
    //* Keep at least 2 heroes available for hire at all times, and ensure no two identical Hero->$id are offered
    //  (for one player or for all players as one, it's not clear)
    //* Randomize heroes every 7 days (on Mondays); nevermind if a hero is removed and random immediately selects adding another hero of the same class (Hero->$id)
    //* When own hero surrenders or retreats, replace a random available hero in the pool (most of the time 2nd) with the defeated one
    //* When hiring a hero, generate a new hero; hero removal (due to regeneration or hiring) is permanent
    //* Even if a player has no towns, if he has two heroes, one is defeated and another immediately captures a town - he can recruit the defeated hero
    // However, sometimes the game breaks these rules. For example, it occasionally randomizes one hero at any day, or defers making a retreated hero available for days or even weeks.
    //
    // XXX=IC after buying the first 2 heroes others must start with the garrison consisting of a single creature: https://forum.herowo.net/t/35
    _initializePlayers: function () {
      var size = 2    // XXX=RH to databank

      // Missing in AObject: id, mirrorX, mirrorY, x, y, z, displayOrder,
      // owner and the remainder to the bottom.
      var atter = this.classes.atter([
        // XXX=R:clc:
        'type', 'texture', 'animation', 'duration', 'width', 'height', 'miniMap', 'passableType', 'passable', 'actionable', 'actionableFromTop'])

      var players = this.map.players.omit('0')

      var update = function (player) {
        // Player's heroChance changes should affect next update of availableHeroes. It doesn't take effect immediately.
        //
        // Hero->$id => int %
        var chances = this.cx.oneShotEffectCalculation({
          class: Calculator.Effect.GenericIntHash,
          target: this.constants.effect.target.heroChance,
          ifPlayer: player.get('player'),
        })

        // SoD doesn't allow two active heroes with the same personality
        // (Hero->$id) in game. There are two ways to implement this in HeroWO:
        //
        // 1. Player A's availableHeroes may have duplicates compared to player B's
        //    but once A hires a hero, it is removed from B's. This means two players
        //    can be offered the same Hero->$id but they cannot hire it both.
        // 2. availableHeroes cannot have duplicates because update() checks
        //    all active heroes (this.map.players' heroes list). update() is triggered on any players' heroes list update.
        //    This is what we do.
        //
        // Note: below is walking all players, including the neutral (0).
        this.map.players.each(function (player) {
          player.heroes.each(function (hero) {
            delete chances[hero.get('subclass')]
          })
        })

        player.getSet('availableHeroes', function (cur) {
          // Remove already unavailable heroes. This also clones cur.
          // normalize_availableHeroes() ensures getSet() with unchanged cur doesn't cause another round of change_availableHeroes.
          cur = (cur || []).filter(function (hero) {
            return this.map.objects.atCoords(hero, 0, 0, 'owner', 0) === 0
          }, this)

          var total = 0
          chances = _.filter(chances, function (c) { return c > 0 && (total += c) })

          while (cur.length < size) {
            var hero = this._pickFromChances(total, _.entries(chances))
            if (!hero) { break }
            total = hero[0]
            delete chances[+hero[1]]
            var cls = _.sample(this.objectsID['hero_' + this.heroes.atCoords(hero[1], 0, 0, 'class', 0)])
            var props = atter(cls, 0, 0, 0)
            props.listOrder = []
            props.listOrder[player.get('player')] = this.map.getSet('-listOrder', Common.inc())
            _.extend(props, {
              class: cls,
              subclass: +hero[1],
              // Need to assign some X/Y/Z/vehicle values to avoid potential problems with other code that expects all hero objects to have coordinates. Placing all pooled heroes at (0;0) since h3m2herowo.php ensures there's a margin so that these heroes won't be reachable. Perhaps this should be revised though.
              //
              // Also, assigning vehicle = horse even though (0;0) may be impassable. This shouldn't cause any problems.
              x: 0,
              y: 0,
              z: 0,
              owner: 0,   // neutral
              level: 0,
              // XXX=R need to ensure artifacts has minimal strideX; this is set in core.php's AObject::$compact but we have to duplicate it here
              artifacts: Array((_.max(this.artifactSlotsID) + 1) * this.map.objects.readSub('artifacts').schemaLength()),
              formation: this.constants.object.formation.spread,  // default in SoD
              tactics: true,  // default in SoD
              resting: false,  // default in SoD
              vehicle: this.constants.object.vehicle.horse,
              // Set by _initializeObjects(): initialized, experience, garrison.
              // Leaving defaults for: route, actionPoints, spellPoints.
            })
            cur.push(this.createObject(props))
          }

          return cur
        }, this)
      }

      this.on('_initializeWeek', function () {
        _.each(players, function (player) {
          player.getSet('availableHeroes', function (cur) {
            // Every 7 days, remove all to-be-hired heroes from the game
            // and clear the list to trigger refill by update().
            _.each(cur, function (hero) {
              if (this.map.objects.atCoords(hero, 0, 0, 'owner', 0) === 0) {
                // Not hired? Beat it.
                this.map.objects.removeAtCoords(hero, 0, 0, 0)
              }
            }, this)
            return []
          }, this)
        }, this)
      })

      _.each(players, function (player) {
        initializeBonus.call(this, player)

        // XXX=C no idea how SoD handicap works since I have never seen it in the wild; is it even supported?
        var handicapEffects = []
        var updateHandicap = function () {
          var handicap = player.get('handicap')

          this.map.effects.batch(null, function () {
            _.each(handicapEffects.splice(0), function (n) {
              this.map.effects.removeAtContiguous(n, 0)
            }, this)

            if (handicap) {
              // So that float-fix works and handicap of 0.9999 doesn't "un-fix" modifiers.
              handicap = Math.round(handicap * 100) / 100

              handicapEffects.push(this.map.effects.append({
                source: this.map.constants.effect.source.handicap,
                target: this.map.constants.effect.target.town_buildingCost,
                dynamic: true,
                modifier: 1.0001 + handicap,  // float-fix
                priority: this.map.effects.priority(this.constants.effect.operation.relative, this.constants.effect.priority.default),
                ifPlayer: player.get('player'),
              })[0])

              handicapEffects.push(this.map.effects.append({
                source: this.map.constants.effect.source.handicap,
                target: this.map.constants.effect.target.creature_cost,
                dynamic: true,
                modifier: 1.0001 + handicap,  // float-fix
                priority: this.map.effects.priority(this.constants.effect.operation.relative, this.constants.effect.priority.default),
                ifPlayer: player.get('player'),
              })[0])

              handicapEffects.push(this.map.effects.append({
                source: this.map.constants.effect.source.handicap,
                target: this.map.constants.effect.target.creature_hitPoints,
                dynamic: true,
                modifier: 1.0001 - handicap,  // float-fix
                priority: this.map.effects.priority(this.constants.effect.operation.relative, this.constants.effect.priority.default),
                ifPlayer: player.get('player'),
              })[0])
            }
          }, this)
        }.bind(this)

        updateHandicap()
        this.autoOff(player, {
          change_availableHeroes: update.bind(this, player),
          change_handicap: updateHandicap,
        })
        // Remove the just added hero's personality from availableHeroes of any player.
        this.autoOff(player.heroes, {
          nestExNew: function () { _.each(players, update, this) },
        })
        update.call(this, player)
      }, this)

      function initializeBonus(player) {
        // Ensure 'heroes' has at least one member because if there was a startingHero then the actually picked hero needs to be shown in Scenario Information (see how _initializeObjects changes 'heroes').
        player.getSet('heroes', function (cur) {
          return !cur || !cur.length ? [null] : cur
        })

        player.getSet('town', function (cur) {
          if (cur === false) {
            cur = _.sample(player.get('towns') || _.values(this.townsID))
          }
          return cur
        }, this)

        // Disallow changing race when loading this game.
        player.set('towns', [player.get('town')])

        if (player.ifSet('bonusGiven', true)) {
          var bonus = player.get('bonus')

          if (bonus === false) {
            var potential = _.extend({}, this.constants.mapPlayer.bonus)
            if (!player.get('startingHero')) { delete potential.artifact }
            // Per SoD, resource bonus is always allowed even if there's no
            // starting town since player always has a race, random or not.
            player.set('bonus', bonus = _.sample(potential))
          }

          switch (bonus) {
            case this.constants.mapPlayer.bonus.artifact:
              var chances = this.cx.oneShotEffectCalculation({
                class: Calculator.Effect.GenericIntHash,
                target: this.constants.effect.target.artifactChance,
                ifObject: player.get('startingHero'),
              })
              var total = 0
              chances = _.filter(chances, function (c, id) {
                if (c > 0 && this.artifacts.atCoords(id, 0, 0, 'rarity', 0) == this.constants.artifact.rarity.common) {
                  return total += c
                }
              }, this)
              var art = this._pickFromChances(total, _.entries(chances))
              if (art) {
                var sub = this.map.objects.subAtCoords(player.get('startingHero'), 0, 0, 'artifacts', 0)
                try {
                  this._equipTrophy(sub, +art[1])
                } finally {
                  sub.release()
                }
              }
              break

            case this.constants.mapPlayer.bonus.gold:
              player.getSet('resources_gold', Common.inc(_.random(5, 10) * 100))
              break

            case this.constants.mapPlayer.bonus.resource:
              var race = this.cx.oneShotEffectCalculation({
                target: this.constants.effect.target.player_town,
                ifPlayer: player.get('player'),
              })
              var resources = this.towns.atCoords(race, 0, 0, 'resources', 0)
              // SoD gives out equal quantities of wood and ore (5,5, 7,7, etc.).
              var qty = resources[0] == this.constants.resources.wood
                ? _.random(5, 10) : _.random(3, 6)
              player.batch(null, function () {
                _.each(resources, function (res) {
                  player.getSet('resources_' + _.indexOf(this.constants.resources, res), Common.inc(qty))
                }, this)
              }, this)
              break
          }

          // XXX=RH to databank?
          //
          // Determined empirically.
          var resources = {
            easy_wood: 30,
            easy_mercury: 15,
            easy_ore: 30,
            easy_sulfur: 15,
            easy_crystal: 15,
            easy_gems: 15,
            easy_gold: 30000,
            normal_wood: 20,
            normal_mercury: 10,
            normal_ore: 20,
            normal_sulfur: 10,
            normal_crystal: 10,
            normal_gems: 10,
            normal_gold: 20000,
            hard_wood: 15,
            hard_mercury: 7,
            hard_ore: 15,
            hard_sulfur: 7,
            hard_crystal: 7,
            hard_gems: 7,
            hard_gold: 15000,
            expert_wood: 10,
            expert_mercury: 4,
            expert_ore: 10,
            expert_sulfur: 4,
            expert_crystal: 4,
            expert_gems: 4,
            expert_gold: 10000,
            impossible_wood: 0,
            impossible_mercury: 0,
            impossible_ore: 0,
            impossible_sulfur: 0,
            impossible_crystal: 0,
            impossible_gems: 0,
            impossible_gold: 0,
          }
          player.batch(null, function () {
            var diff = _.indexOf(this.constants.map.difficulty, this.map.get('difficultyMode'))
            _.each(this.constants.resources, function (res, name) {
              player.getSet('resources_' + name, function (cur) {
                return cur + resources[diff + '_' + name]
              })
            })
          }, this)
        }
      }
    },

    // Updates AObject->$listOrder for player (id's owner if null) so that the
    // id object becomes last in the player's list unless it was part of that
    // list before and forceBump isn't given.
    _bumpListOrder: function (id, player, forceBump) {
      if (player == null) {
        player = this.map.objects.atCoords(id, 0, 0, 'owner', 0)
      }
      var cur = this.map.objects.atCoords(id, 0, 0, 'listOrder', 0) || []
      if (cur[player] == null || forceBump) {
        cur = cur.concat()
        cur[player] = this.map.getSet('-listOrder', Common.inc())
        this.map.objects.setAtCoords(id, 0, 0, 0, 'listOrder', cur)
      }
    },

    // Creates a new adventure map objects.
    //
    // props must include all fields required by the object's type except $id.
    //
    // XXX add an atter to provide defaults to props by copying fields from AClass? like done in _initializePlayers()
    createObject: function (props, options) {
      props.id = this.map.objects.size().x
      this.map.objects.append(props, options)
      return props.id
    },

    // Given an array of entries [item, chance] and total = sum(pluck(0)), returns [reduced total, random item]. Mutates chances by removing the picked item.
    _pickFromChances: function (total, chances) {
      if (total) {
        var chance = _.random(total)
        for (var i = 0; (chance -= chances[i][1]) > 0; i++) ;
        total -= chances[i][1]
        return [total].concat(chances.splice(i, 1)[0])
      }
    },

    // Implements AObject->$pending. Starts already and newly queued tasks, fires pending_... and unpending_... as needed.
    _initializePending: function () {
      var ran = this._runningPending = new Set
      var pendingIndex = this.map.objects.propertyIndex('pending')

      var run = function (pending, id) {
        if (pending == null) {
          pending = this.map.objects.atCoords(id, 0, 0, pendingIndex, 0)
        }

        if (!pending) {
          // Nothing pending or the object was removed after ochange was queued.
          return
        }

        var top = pending[0]
        var unique = typeof top[0] == 'number' ? top[0] : null
        var i = 0
        var deleted

        _.log && _.log('Checking pending of %d, unique %d : %.j', id, unique || '<standalone>', pending)

        if (ran.has(unique || top /*if standalone*/)) {
          return
        } else if (unique == null) {   // main standalone
          var ready = [id]
        } else {
          var main = id

          if (top.length == 2) {    // secondary
            pending = this.map.objects.atCoords(main = top[1], 0, 0, pendingIndex, 0)
            _.log && _.log('...shared of %d : %.j', main, pending)

            if (!pending) {    // main object deleted, cancel
              this.objectFinished([id], true)
              return
            } else if ((top = pending[0])[0] != unique) {
              return
            }
          }

          var ready = [main]  // AObject->$id-s whose top unique match main's

          while (typeof top[++i] == 'number') {
            var other = top[i] == id ? [[unique]]
              : this.map.objects.atCoords(top[i], 0, 0, pendingIndex, 0)

            _.log && _.log('...shared with %d : %.j', top[i], other)

            if (other == null) {
              deleted = ready
            } else if (other[0][0] == unique) {
              ready.push(top[i])
            }
          }

          if (ready.length == i) {
            // All ready for pending_...
          } else if (!deleted) {
            return   // all existing but some not ready, just wait
          } else {
            // Secondary objects with unique somewhere in $pending (that we have skipped above) may remain. In order to cancel the operation early, we choose this rather than waiting for our unique to top out on their $pending. Such objects will clean up automatically as soon as the removed unique moves to top.
            ready = [main].concat(top.slice(1, i))
          }
        }

        var event = (deleted ? 'unpending_' : 'pending_') + top[i]
        ran[deleted ? 'delete' : 'add'](unique || top)
        _.log && _.log('...%s : %j : %.j', event, top.slice(i + 1), top)
        this.map.objects.fire(event, ready.concat(top.slice(i + 1)))
        // Ensure objectFinished()'s ochange fires after unpending_...
        deleted && this.objectFinished(deleted, true)
      }.bind(this)

      this.autoOff(this.map.objects, [
        'ochange_p_' + pendingIndex,
        function (n) {
          // This hook takes new $pending value but we're not using it, always fetching current $pending so that if this object was removed before run() its operations won't start.
          run(null, this.map.objects.fromContiguous(n).x)
        },
        'oremove',
        function (n, $, props) {
          var id = this.map.objects.fromContiguous(n).x
          _.each(props[pendingIndex] || [], function (top) {
            var main = id
            if (top.length == 2 && typeof top[0] == 'number') {
              var pending = this.map.objects.atCoords(main = top[1], 0, 0, pendingIndex, 0)
              if (!pending /*main removed*/ || top[0] != (top = pending[0])[0]) {
                return
              }
              // This will be delayed by Sqimitive's batch() at least until our hook returns so ochange, run() and new potential pending_... will be never called before we fire unpending_... below.
              this.map.objects.setAtCoords(main, 0, 0, 0, pendingIndex, pending.length > 1 ? pending.slice(1) : false)
            }
            for (var i = 0; typeof top[i] == 'number'; i++) ;
            ran.delete(i ? top[0] : top)
            top = top.concat()
            var event = top.splice(i, 1)[0]
            i ? top[0] = main : top.unshift(main)
            _.log && _.log('unpending_%s on removal of %d : %.j', event, id, top)
            this.map.objects.fire('unpending_' + event, top)
            while (--i > 0) {
              run(null, top[i])   // see if top is blocking secondary $id-s
            }
          }, this)
        },
      ])

      this.map.objects.find(pendingIndex, run)
    },

    // Queues a new AObject->$pending task named `'event that will start once queue clears on all `'ids objects.
    //
    // pending_... may be fired before this returns.
    objectPending: function (ids, event) {
      var unique = ids.length > 1 && this.map.sequentialKey()

      this.map.objects.batch(null, function () {
        _.each(ids, function (id, i) {
          unique && (event = i ? [unique, ids[0]] : [unique].concat(ids.slice(1), event))
          var cur = this.atCoords(id, 0, 0, 'pending', 0) || []
          this.setAtCoords(id, 0, 0, 0, 'pending', cur.concat([event]))
        }, this)
      })
    },

    // Signals that a started AObject->$pending task has just ended and another task can start.
    //
    // Must be called only if all ids have the same operation in $pending[0].
    //
    // ids can go in any order.
    objectFinished: function (ids, noRemove) {
      this.map.objects.batch(null, function () {
        var unique
        _.each(ids, function (id, i) {
          var cur = this.map.objects.atCoords(id, 0, 0, 'pending', 0)
          i || (unique = cur[0][0])
          if (!cur || cur[0][0] != unique) {
            throw new Error('Invalid pending operation.')
          }
          _.log && _.log('Finished pending of %d : %.j', id, cur)
          if (!i && !noRemove) {
            var key = typeof unique == 'number' ? unique : cur[0]
            if (!this._runningPending.delete(key)) {
              throw new Error('Bug: finished pending missing from _runningPending.')
            }
          }
          cur = cur.length > 1 ? cur.slice(1) : false
          this.map.objects.setAtCoords(id, 0, 0, 0, 'pending', cur)
        }, this)
      }, this)
    },

    // Listens to world changes that could satisfy map's win/loss conditions. Finishes the game (sets Map _opt.finished) when this happens. Maintains Player _opt.won flag, putting losers out of game and clearing their owned objects.
    //
    // Also looks for homeless heroes (i.e. players with heroes but no towns), ditching players who take too long to conquer a town.
    _initializeWinLoss: function () {
      var self = this

      function hookPlayer(pl) {
        if (!pl.get('player')) { return }

        self.autoOff(pl, {
          change_homeless: function (now) {
            if (now == 7) {   // XXX=RH
              pl.heroes.invoke('remove')
            }
          },
        })

        self.autoOff(pl.towns, {
          'nestExNew, unnested': update,
        })

        // XXX=IC In SoD, if you have no initial town on map, the warning message appears not immediately on game start but after a certain action (at least after a combat). If no action is done until end of the day, no initial warning message appears.
        update()

        function update() {
          var homeless = !pl.towns.length
          if (homeless != (pl.get('homeless') !== false)) {
            pl.set('homeless', homeless ? 0 : false)
          }
        }
      }

      this.autoOff(this.map, {
        change_date: function (now) {
          if (now) {    // if not initial date being set to 0
            this.map.players.each(function (pl) {
              if (pl.get('won') === false) {
                pl.getSet('homeless', function (cur) {
                  cur === false || cur++
                  return cur
                })
              }
            })
          }
        },
      })

      this.map.players.each(hookPlayer)

      var setFinishedTimer
      this.once('-unnest', function () { clearTimeout(setFinishedTimer) })

      this.autoOff(this.map.players, {
        nestExNew: function (res) {
          hookPlayer(res.child)
        },
        '.change': function (pl, name, now) {
          // Deferring to allow other victory/loss conditions be updated,
          // for example, precisely indicate several winning teams.
          // This should be mostly informational measure though.
          if (name == 'won' && !setFinishedTimer) {
            // It is possible that our deferred function won't be called in case of a tight loop. For example: one human player, one AI; human wins (won becomes 1), this triggers our .change and we schedule a timer. The only remaining player that canTakeTurn() is the AI and it may simply immediately skip turns (as H3.AI.Nop does) creating a loop: endRound() -> P2.set(interactive) -> endRound() -> ...
            var endRounds = 0
            var ev = self.on('=endRound', function () {
              _.log && _.log('Delaying endRound() until evaluating win/loss')
              endRounds++
            })
            setFinishedTimer = _.defer(function () {
              var players = _.groupBy(self.map.players.omit('0'), Common.p('get', 'won'))
              if (players[1] /*win*/ || !players.false /*undetermined*/) {
                // Somebody wins, his opponents lose. Also, if everyone loses (e.g. due to all MapVictory becoming impossible), the game finishes.
                batchPlayers(_.toArray(players.false || []), false)
                self.map.set('finished', true)
              } else if (!_.some(players.false, Common.p('isHuman'))) {
                // Human players lost, AI didn't. Good game, bad luck!
                batchPlayers(_.toArray(players.false), true)
                self.map.set('finished', true)
              } else {
                // Nobody won, somebody or nobody lost and the game continues. Clean up losers (not doing so on map finish to let players oversee the map as it was in the end).
                //
                // Also check if the just-lost players were interactive and end the turn of the one with the largest number (this is important for classic sequential turns but not for simultaneous).
                var lastPlayer = -1
                self.map.objects.batch(null, function () {
                  self.map.players.each(function (player) {
                    var wasInteractive = player.getSet('-justOver', null)
                    if (wasInteractive != null) {
                      if (wasInteractive) {
                        lastPlayer = Math.max(lastPlayer, player.get('player'))
                      }
                      self.map.byOwner.findAtCoords(player.get('player'), 0, 0, 0, function (id) {
                        switch (self.map.objects.atCoords(id, 0, 0, 'type', 0)) {
                          case self.map.constants.object.type.hero:
                            self.map.objects.removeAtCoords(id, 0, 0, 0)
                            break
                          default:
                            if (!self.cx.get('classic')) { break }
                          case self.map.constants.object.type.town:
                            self.map.objects.setAtCoords(id, 0, 0, 0, 'owner', 0)
                        }
                      })
                    }
                  })
                })
                endRounds += lastPlayer != -1 &&   // a player who was interactive has just lost
                  // XXX=RH
                  !!self.rpc._endTurn(self.cx, self.map.players.nested(lastPlayer))
                setFinishedTimer = null
                self.off(ev)
                while (endRounds--) { self.endRound() }
              }
            })
          }
        },
      })

      function batchPlayers(players, won) {
        if (players.length) {
          players[0].batch(players, function () {
            won = +!!won
            _.each(players, function (pl) {
              pl.getSet('won', function (cur) {
                return cur === false ? won : cur == won ? cur : 2
              })
              pl.set('justOver', pl.ifSet('interactive', false))
            })
          })
        }
      }

      var winCol = (new Effects.Collection)
        .on({
          '+readyMember': function (res, key) {
            var win = self.map.victory.nested(key)

            res.off.push([win, win.on('change', function (name, now) {
              switch (name) {
                default:
                  return winCol.reAddMember(key)
                case 'impossible':
                  if (self.map.victory.every(Common.p('get', 'impossible'))) {
                    batchPlayers(self.map.players.filter(function (pl) { return pl.get('won') === false }), false)
                  }
                  break
                case 'achieved':
                  var teams = new Set
                  // Victory achievement by one player wins his allies.
                  now.forEach(function (pl) {
                    teams.add(self.map.players.nested(pl).get('team'))
                  })
                  var players = self.map.players.filter(function (pl) {
                    return teams.has(pl.get('team'))
                  })
                  batchPlayers(players, true)
                  break
                case 'allowAI':
                  res.check()
              }
            })])

            switch (win.get('type')) {
              case self.map.constants.mapVictory.type.defeat:
                var obj = win.get('object')
                if (obj) {
                  res.check = function () {
                    win.set('impossible', !self.map.objects.anyAtCoords(obj, 0, 0))
                  }
                  res.off.push([self.map.objects, self.map.objects.on('oremove_n_' + self.map.objects.toContiguous(obj, 0, 0, 0), function ($1, $2, $3, options) {
                    if (_.has(options, 'encounterHeroOwner')) {
                      var owner = options.encounterHeroOwner
                      if (win.get('allowAI') || self.map.players.nested(owner).isHuman()) {
                        win.set('achieved', [owner])
                      }
                    }
                    win.set('impossible', true)
                  })])
                } else {
                  res.check = function () {
                    var teams = new Set
                    self.map.players.each(function (pl) {
                      if (pl.get('player')) {
                        if (pl.get('won') === false) {
                          teams.add(pl.get('team'))
                        } else if (pl.get('won') !== 0) {
                          // If somebody has won, remaining players (even if all are of the same team) must lose.
                          teams.add(-1)
                        }
                      }
                    })
                    if (teams.size == 1) {
                      self.map.players.each(function (pl) {
                        if (teams.has(pl.get('team'))) {
                          win.getSet('achieved', Common.concat(pl.get('player')))
                        }
                      })
                    }
                  }
                  res.off.push([self.map.players, self.map.players.on('.change', function ($, name) {
                    name == 'won' && res.check()
                  })])
                }
                break

              case self.map.constants.mapVictory.type.ownArtifact:
                var artifact = win.get('artifact')
                var town = win.get('object')
                function checkHero(hero) {
                  var owner = hero && self.map.objects.atCoords(hero, 0, 0, 'owner', 0)
                  if (owner &&
                      (win.get('allowAI') || self.map.players.nested(owner).isHuman()) &&
                      self.map.objects.readSubAtCoords(hero, 0, 0, 'artifacts', 0).find('artifact', artifact) != null) {
                    win.getSet('achieved', Common.concat(owner))
                  }
                }
                if (town) {
                  try {
                    var obj = self.map.representationOf(town)
                  } catch (e) {}   // deleted
                  res.check = function () {
                    if (!obj) {
                      win.set('impossible', true)
                    } else {
                      obj.getSet(['visiting', 'garrisoned']).forEach(checkHero)
                    }
                  }
                  if (obj) {
                    res.off.push([obj, obj.on('-unnest', function () {
                      win.set('impossible', true)
                    })])
                    res.off.push([obj, obj.on('change_visiting', res.check)])
                    res.off.push([obj, obj.on('change_garrisoned', res.check)])
                    res.off.push([self.map.objects, self.map.objects.on('ochange_p_' + self.map.objects.propertyIndex('artifacts'), function (n) {
                      var hero = self.map.objects.fromContiguous(n).x
                      if (obj.get('visiting') == hero || obj.get('garrisoned') == hero) {
                        res.check()
                      }
                    })])
                  }
                } else {
                  res.check = function () {
                    self.map.byType.findAtCoords(self.constants.object.type.hero, 0, 0, 0, checkHero)
                  }
                  res.off.push([self.map.objects, self.map.objects.on('ochange_p_' + self.map.objects.propertyIndex('artifacts'), function (n) {
                    if (self.map.objects.atContiguous(n + self.map.objects.propertyIndex('type'), 0) == self.constants.object.type.hero) {
                      checkHero(self.map.objects.fromContiguous(n).x)
                    }
                  })])
                }
                break

              case self.map.constants.mapVictory.type.ownCreatures:
                // SoD doesn't recognize creatures put (hired) in the town's own garrison (not hero's) but if you enter a visiting hero and then just close the town's screen, the condition will trigger. We don't have this quirk currently (XXX=IC).
                var cr = win.get('unit')
                function checkCreatures(pl) {
                  var total = 0
                  return (pl.isHuman() || win.get('allowAI')) &&
                    pl.towns.toArray().concat(pl.heroes.toArray()).some(function (obj) {
                      var gar = self.map.objects.readSubAtCoords(obj.get('id'), 0, 0, 'garrison', 0)
                      return gar.find(0, function ($, slot) {
                        if (gar.atCoords(slot, 0, 0, 'creature', 0) == cr) {
                          total += gar.atCoords(slot, 0, 0, 'count', 0)
                          return total >= win.get('unitCount') || null
                        }
                      })
                    })
                }
                res.check = function ($1, $2, $3, options) {
                  var players = _.toArray(_.filter(self.map.players.omit('0'), checkCreatures))
                  if (players.length) {
                    win.set('achieved', _.invoke(players, 'get', 'player'))
                  }
                }
                res.off.push([self.map.objects, self.map.objects.on('ochange_p_' + self.map.objects.propertyIndex('garrison'), function (n) {
                  switch (self.map.objects.atContiguous(n + self.map.objects.propertyIndex('type'), 0)) {
                    case self.constants.object.type.town:
                    case self.constants.object.type.hero:
                      var owner = self.map.objects.atContiguous(n + self.map.objects.propertyIndex('owner'), 0)
                      if (owner && checkCreatures(self.map.players.nested(owner))) {
                        win.getSet('achieved', Common.concat(owner))
                      }
                  }
                })])
                break

              case self.map.constants.mapVictory.type.ownResources:
                var rname = 'resources_' + _.indexOf(self.constants.resources, win.get('resource'))
                function checkRes(pl) {
                  var total = 0
                  return (pl.isHuman() || win.get('allowAI')) && pl.get(rname) >= win.get('resourceCount')
                }
                res.check = function ($1, $2, $3, options) {
                  var players = _.toArray(_.filter(self.map.players.omit('0'), checkRes))
                  if (players.length) {
                    win.set('achieved', _.invoke(players, 'get', 'player'))
                  }
                }
                res.off.push([self.map.players, self.map.players.on('.change', function (pl, name) {
                  if (name == rname && pl.get('player') && checkRes(pl)) {
                    win.getSet('achieved', Common.concat(pl.get('player')))
                  }
                })])
                break

              case self.map.constants.mapVictory.type.ownTown:
                var town = win.get('object')
                res.col = (new Effects.Collection)
                  .on({
                    '+readyMember': function (res, town) {
                      res.calc = self.cx.listeningEffectCalculator({
                        class: Calculator.Effect.GenericIntArray,
                        target: self.constants.effect.target.town_buildings,
                        ifObject: town,
                      })
                      res.off.push([res.calc, res.calc.on('change_value', function () { checkTown(town) })])
                    },
                  })
                var buildings = []
                if (win.get('townGrail')) {
                  // XXX=I:grl:
                  //buildings.push(self.grailBuildings)
                  town = -1
                }
                switch (win.get('townHall') || 0) {
                  case 0:
                    buildings.push(self.hallBuildings)
                    break
                  case self.constants.mapVictory.townHall.town:
                    buildings.push([self.buildingsID.townHall])
                    break
                  case self.constants.mapVictory.townHall.city:
                    buildings.push([self.buildingsID.cityHall])
                    break
                  case self.constants.mapVictory.townHall.capitol:
                    buildings.push([self.buildingsID.capitol])
                }
                switch (win.get('townCastle') || 0) {
                  case 0:
                    buildings.push(self.fortBuildings)
                    break
                  case self.constants.mapVictory.townCastle.fort:
                    buildings.push([self.buildingsID.fort])
                    break
                  case self.constants.mapVictory.townCastle.citadel:
                    buildings.push([self.buildingsID.citadel])
                    break
                  case self.constants.mapVictory.townCastle.castle:
                    buildings.push([self.buildingsID.castle])
                }
                function checkTown(town) {
                  var owner = self.map.objects.atCoords(town, 0, 0, 'owner', 0)
                  if (owner &&
                      (win.get('allowAI') || self.map.players.nested(owner).isHuman())) {
                    var cur = res.col.append(town).calc.updateIfNeeded().get('value')
                    if (buildings.every(function (b) { return _.intersection(cur, b).length })) {
                      win.getSet('achieved', Common.concat(owner))
                    }
                  }
                }
                if (town) {
                  try {
                    var obj = self.map.representationOf(town)
                  } catch (e) {}   // deleted
                  res.check = function () {
                    if (!obj) {
                      win.set('impossible', true)
                    } else {
                      checkTown(town)
                    }
                  }
                  if (obj) {
                    res.off.push([obj, obj.on('-unnest', function () {
                      win.set('impossible', true)
                    })])
                  }
                } else {
                  function checkLength() {
                    if (!res.col.get('list').length) {
                      win.set('impossible', true)
                    }
                  }
                  res.col.bindStoreCoords(self.map.byType, self.constants.object.type.town)
                  res.col.on('addMember', function (m) { checkTown(m.item) })
                  res.check = function () {
                    // check() is called in case of allowAI change.
                    res.col.get('list').forEach(checkTown)
                  }
                  res.col.on('change_list', checkLength)
                  checkLength()
                }
                break

              case self.map.constants.mapVictory.type.ownDwelling:
                var dwelling = true
              case self.map.constants.mapVictory.type.ownMine:
                var type = dwelling ? self.constants.object.type.dwelling : self.constants.object.type.mine
                var obj = win.get('object')
                if (obj) {
                  res.check = function () {
                    if (self.map.objects.atCoords(obj, 0, 0, 'type', 0) == type) {
                      var owner = self.map.objects.atCoords(obj, 0, 0, 'owner', 0)
                      if (owner && !win.get('allowAI') && !self.map.players.nested(owner).isHuman()) {
                        owner = 0
                      }
                    }
                    if (owner == null) {
                      win.set('impossible', true)
                    } else if (owner) {
                      win.set('achieved', [owner])
                    }
                  }
                  res.off.push([self.map.objects, self.map.objects.on('oremove_n_' + self.map.objects.toContiguous(obj, 0, 0, 0), function () {
                    win.set('impossible', true)
                  })])
                  res.off.push([self.map.objects, self.map.objects.on('ochange_n_' + self.map.objects.toContiguous(obj, 0, 0, 0), function ($1, $2, prop) {
                    if (prop == self.map.objects.propertyIndex('owner')) {
                      res.check()
                    }
                  })])
                } else {
                  res.check = function () {
                    var owners = new Set
                    self.map.byType.findAtCoords(type, 0, 0, 0, function (obj) {
                      owners.add(self.map.objects.atCoords(obj, 0, 0, 'owner', 0))
                      return owners.size > 1 || null
                    })
                    if (!owners.size) {
                      win.set('impossible', true)
                    } else if (owners.size == 1 && !owners.has(0)) {
                      owners.forEach(function (owner) {
                        if (win.get('allowAI') || self.map.players.nested(owner).isHuman()) {
                          win.set('achieved', [owner])
                        }
                      })
                    }
                  }
                  res.off.push([self.map.byType, self.map.byType.on('oremove_n_' + self.map.byType.toContiguous(type, 0, 0, 0), res.check)])
                  res.off.push([self.map.objects, self.map.objects.on('ochange_p_' + self.map.objects.propertyIndex('owner'), function (n) {
                    if (self.map.objects.atContiguous(n + self.map.objects.propertyIndex('type'), 0) == type) {
                      var owner = self.map.objects.atContiguous(n + self.map.objects.propertyIndex('owner'), 0)
                      owner && res.check()
                    }
                  })])
                }
                break
            }

            res.check()
          },
        })
        .bindNested(this.map.victory)

      var loseCol = (new Effects.Collection)
        .on({
          '+readyMember': function (res, key) {
            var loss = self.map.loss.nested(key)

            res.off.push([loss, loss.on('change', function (name, now) {
              switch (name) {
                default:
                  return loseCol.reAddMember(key)
                case 'impossible':
                  if (self.map.loss.every(Common.p('get', 'impossible'))) {
                    batchPlayers(self.map.players.filter(function (pl) { return pl.get('won') === false }), true)
                  }
                  break
                case 'achieved':
                  var players = self.map.players.filter(function ($, p) { return _.includes(now, +p) })
                  batchPlayers(players, false)
              }
            })])

            switch (loss.get('type')) {
              case self.map.constants.mapLoss.type.lose:
                var obj = loss.get('object')
                if (obj) {
                  var owner = self.map.objects.atCoords(obj, 0, 0, 'owner', 0)
                  res.check = function () {
                    if (owner == null) {    // initially no such object on map
                      loss.set('impossible', true)
                    } else if (owner && self.map.objects.atCoords(obj, 0, 0, 'owner', 0) != owner) {
                      loss.set('achieved', [owner])
                    }
                  }
                  res.off.push([self.map.objects, self.map.objects.on('oremove_n_' + self.map.objects.toContiguous(obj, 0, 0, 0), function () {
                    owner && loss.set('achieved', [owner])
                    loss.set('impossible', true)
                  })])
                  res.off.push([self.map.objects, self.map.objects.on('ochange_n_' + self.map.objects.toContiguous(obj, 0, 0, 0), function ($1, $2, prop, now) {
                    if (prop == self.map.objects.propertyIndex('owner')) {
                      owner ? res.check() : owner = now
                    }
                  })])
                } else {
                  function checkPlayer(player) {
                    if (player) {
                      var found = self.map.byOwner.findAtCoords(player, 0, 0, 0, function (obj) {
                        switch (self.map.objects.atCoords(obj, 0, 0, 'type', 0)) {
                          case self.constants.object.type.town:
                          case self.constants.object.type.hero:
                            return true
                        }
                      })
                      if (!found) {
                        loss.getSet('achieved', Common.concat(player))
                      }
                    }
                  }
                  res.check = function () {
                    self.map.players.keys().forEach(checkPlayer)
                  }
                  res.off.push([self.map.objects, self.map.byOwner.on('oremove', function (n) {
                    checkPlayer(self.map.byOwner.fromContiguous(n).x)
                  })])
                }
                break

              case self.map.constants.mapLoss.type.days:
                res.check = function () {
                  if (self.map.get('date') >= loss.get('time')) {
                    loss.set('achieved', self.map.players.invoke('get', 'player'))
                  }
                }
                res.off.push([self.map, self.map.on('change_date', res.check)])
                break
            }

            res.check()
          },
        })
        .bindNested(this.map.loss)

      this.once('-unnest', 'remove', winCol)
      this.once('-unnest', 'remove', loseCol)
    },

    // Main function kicking off the game. Calls other _initialize...() methods in specific order and only those suitable for client's role (master/slave).
    _initializeMap: function () {
      _.log && _.log('-- Initializing Rules --')

      if (this.cx.get('master')) {
        // Obtain players in groups of 2 or higher, i.e. who share vision.
        //
        // Should be called before _initializeShroud() so that the hooks _initializeAlliedShroud() sets up are triggered and allied vision is correctly updated after shroud initialization.
        _.each(
          _.groupBy(this.map.players.omit('0'), Common.p('get', 'team')),
          function (players) {
            players = _.values(players)
            if (players.length > 1) {
              this._initializeAlliedShroud(_.invoke(players, 'get', 'player'))
            }
          },
          this
        )
        this._initializeRandom()
        // _initializePlayers goes before _initializeObjects so that the former
        // resolves random MapPlayer->$towns/etc. (used by random
        // town and hero object initializers).
        this._initializePlayers()
        this._initializeObjects()
        this._initializeEffects()

        this._shroudInitialized || this._initializeShroud()
        this.off('_initializeShroud')   // allow GC'ing references
        this.map.shroud.attach()

        this.map.byType.findAtCoords(this.constants.object.type.hero, 0, 0, 0, function (hero) {
          this._regenHero(this.map.representationOf(hero))
        }, this)

        this._initializeWinLoss()

        // All players must start with interactive set to false so that stuff like
        // giving resources, determining random castles, etc. can happen prior to
        // them gaining control. This sets interactive and must happen in the end
        // of initialization.
        this.map.getSet('date', function (cur) { return cur === false ? 0 : cur })
        // ...But not before commencing pending activities since they are technically part of the (next) round.
        this._initializePending()
      } else {
        this.map.shroud.attach()
      }

      this._heartbeatTimer = setInterval(function () {
        console && console.info(_.format('Heartbeat: %d objects, %d effects, %d modules',
          this.map.objects.countObjects(),
          this.map.effects.countObjects(),
          this.cx.modules.length))
      }.bind(this), (_.debug ? 90 : 300) * 1000)
    },

    // Called when have loaded a map with initially undefined Shroud bits.
    _initializeShroud: Common.stub,
  })

  // Handles encounters (hero interaction) with most adventure map objects (Water Wheel, Temple, etc.). Extremely flexible.
  //
  // This class should be used on master only.
  //
  //# Generic encounter algorithm
  // When player's hero comes into contact with a map object ("encounters" it by stepping onto it or onto its adjacent spot), the following happens if that objects implements the generic encounter mechanism:
  //* If AObject->$proposal is set, user sees a message box with yes/no buttons. "No" choice prevents the encounter from continuing.
  //* quest_reset is evaluated. Effects produced by this object in the past (if any) are removed based on their Effect->$encounterLabel. $initialized['random'] and 'garrison' may also be reset. There are special values, see the target's description for details.
  //
  //  The encounter algorithm is generally idempotent meaning it doesn't matter if the encounter was interrupted - user can repeat the encounter and it will resume properly. quest_reset is an exception: it is not guarded by $initialized and runs even when repeating so it should be limited using $ifGrantedMin. For example, an object giving the hero an artifact but only if it was not visited by anyone before can be implemented using quest_chances (produces bonus_artifacts) + quest_reset. The first time it runs there are no bonus_artifacts to remove so it works. But if the encounter interrupts after quest_chances (e.g. due to server restart during a combat against quest_garrison), the following encounter's quest_reset will remove bonus_artifacts even though the reward was not yet claimed - unless quest_reset has $ifGrantedMin of 1. Other safeguarding means also exist, e.g. adding quest_reset by bonus_effects.
  //* If AObject->$initialized['random'] is unset:
  //  `* quest_chances is evaluated for that $ifBonusObject. Result is a hash of EffectLabel => chance.
  //  `* A random EffectLabel is picked and added into the world.
  //  `* AObject->$initialized['random'] is set.
  //* If AObject->$owner is different from the hero's owner (always so for non-ownable objects since their $owner is `'false):
  //  `* If AObject->$initialized['garrison'] is unset, AObject->$garrison is set to quest_garrison whose result is a hash of Creature->$id => count. Then $initialized['garrison'] is set.
  //
  //     For ownable objects, this bit is cleared on next Monday (SoD behavior which replenishes guards every week). This is achieved by adding an internal quest_reset Effect with $ifDateMin.
  //  `* If $garrison is non-empty, quest_placement is evaluated and hero faces the combat. Upon losing it, the encounter stops.
  //* quest_fulfilled is evaluated. False result prevents the encounter from continuing, often also showing a message (`'quest_message). The default quest_fulfilled Effect (`[[$check, 'quest']`]) implements generic protection against re-visiting the object in undue time. Fee check should be done here (like that of School of Magic).
  //* quest_choices is evaluated. Result is an array of EffectLabel that the player may freely pick from. Special label `'cancel stops the encounter. Player's choice is awaited. For example, Arena allows increasing hero's Attack or Defense.
  //
  //  Usually these Effects are applied anew on every encounter (so one hero may choose Attack, another Defense) but quest_reset makes it possible to keep only one instance of the choice ("reprofiling" the object on every encounter, e.g. choosing an anti-bonus for enemy players).
  //* Chosen EffectLabel is added into the world, unless quest_choices evaluated to an empty array.
  //* bonus_... are evaluated. bonus_effects may be used to override next encounter's outcome (such as making a Wagon always empty), although $ifGrantedMin is more straightforward. If quest_fulfilled had a fee check, this is when player's resources are reduced.
  //
  //  Unmatched bonus_... effects are lost for this encounter (or permanently, if restricted by quest_remove or $ifGranted...). If no bonus_... matched then all effects are lost.
  //* quest_remove is evaluated. If result is true, the object is deleted from the map (when/if user sees this happening, `'quest_removeAudio is played) and the encounter stops.
  //* If $owner is not `'false:
  //  `* AObject->$initialized['garrison'] is cleared. This causes another player capturing the dwelling on the same week to face the guards.
  //  `* Bonus' AObject->$owner is set to the hero's $owner.
  //
  // Specific objects may have slightly different behaviour in some aspects of the above algorithm, but it covers the majority of object classes. Differences mostly come from messages (such as in response to unmet quest_fulfilled).
  //
  //#-geex
  Rules.GenericEncounter = Common.Sqimitive.extend('HeroWO.H3.Rules.GenericEncounter', {
    rules: null,
    map: null,
    _shared: null,
    _date: null,
    _bonus: null,
    _bonusSpot: null,
    _hero: null,
    _initialized: null,
    _countCalc: null,
    // lists n of Effects added by quest_chances, quest_choices, bonus_effects
    // by the current encounter; quest_chances may be missing if encounter was interrupted
    addedEffects: [],
    // available after 'quest' state; in calculator's _opt.checks format
    questChecks: [],
    // available after 'bonus' state
    // players keys: resources_RESOURCE
    // heroes keys: experience, actionPoints, spellPoints, creatures/artifacts (only for _opt.hero)
    addedBonuses: {players: {}, heroes: {}},
    // available after 'initGarrison' state
    combat: null,

    _opt: {
      // These two objects must be locked to ensure other encounters don't run on them. If any object is removed, client must call remove() on this GE (if using $pending for locking, this should be done in unpending_...).
      bonus: 0,   // AObject->$id which was encountered
      hero: 0,  // AObject->$id that has interacted with bonus
      selectors: {},
      transitionOptions: {},
      state: 'init',    // internal
    },

    _initToOpt: {
      rules: '.',
    },

    events: {
      init: function () {
        this.map = this.rules.cx.map
      },

      attach: function () {
        this._shared = this.rules.cx.shared(this.constructor.shared, this._initShared, this)

        this.autoOff(this.map.objects, [
          '^ochange_n_' + this.map.objects.toContiguous(this.get('hero'), 0, 0, 0),
          function ($1, $2, prop) {
            switch (prop) {
              case this.map.objects.propertyIndex('owner'):
              case this.map.objects.propertyIndex('x'):
              case this.map.objects.propertyIndex('y'):
              case this.map.objects.propertyIndex('z'):
                this.remove()
            }
          },
        ])

        // XXX remove Effect target, make a field on AObject instead?
        this._countCalc = this.rules.cx.oneShotEffectCalculator(_.extend({
          target: this.map.constants.effect.target.quest_granted,
          ifBonusObject: this.get('bonus'),
        }, this.get('selectors')))
          .takeRelease()
        // value cannot change during encounter.
      },

      change_state: 'handle',

      '-unnest': function () {
        _.log && _.log('GenericEncounter %s -> unnested', this._cid)
        delete this.rules._encounters[this.get('hero')]
      },
    },

    _initShared: function () {
      return _.extend(this.map.effects.schema(), {
        const: this.map.constants.object.initialized,
        bonusAtter: this.map.objects.atter([
          'proposal', 'initialized', 'owner', 'garrison', 'x', 'y', 'z',
          'encounterEffects',
          // For actionableSpot().
          'width', 'height', 'actionable',
        ]),
        heroAtter: this.map.objects.atter(['owner']),
      })
    },

    // Initializes bonuses of objects that were assigned to a certain player in the map editor. Only goes through the 'bonus' state (and only partially). _opt.hero should be 0 (the default). Effects that should be ran on initial ownership can have ifObject = 0. Some Effect shortcuts may not work due to lack of interacting hero info (ifObject) except $owner.
    //
    // (new GenericEncounter({rules, bonus}))
    //   .attach()
    //   .handleInitiallyOwned()
    handleInitiallyOwned: function () {
      this.fuse('=handle', Common.stub)
      this._handle_init()
      this._hero = {owner: this._bonus.owner}
      if (!this._hero.owner) {
        // This may happen if the object has changed between adding pending initiallyOwned and it triggering initEncounter(). Not sure what to do in this case since simply skipping doesn't sound right (the encounter may have been supposed to produce important side effects).
        throw new Error('handleInitiallyOwned() called on no owner.')
      }
      this._initialize('owner', this._handle_bonus)
      this.remove()
    },

    // XXX+I Determines if hero's encounter with this object will be allowed to produce bonuses. This is currently used to check if a Windmill was visited this week, if Border Guard can be passed, etc. but it has several issues, like revealing info that the player shouldn't see until he carries the visit - like if a Shipwreck has been already sacked.
    checkFulfilled: function () {
      this.fuse('=handle', Common.stub)
      this._handle_init()
      var res = this._calc('GenericBool', 'quest_fulfilled')
      this.remove()
      return res
    },

    // Initializes bonuses of an event occurring based on current game date. Similar to handleInitiallyOwned(), only partially goes through the 'bonus' state.
    timedEvent: function (player) {
      this.fuse('=handle', Common.stub)
      this._handle_init()
      player && (this._hero = {owner: player})
      this._handle_bonus()
      this.remove()
    },

    // Commences the encounter.
    //
    // Technically this processes current `'state (that may in turn change to next `'state and call `'handle()) but client should call this only once to initiate the encounter.
    handle: function () {
      _.log && _.log('GenericEncounter %s -> %s : P%d %s %d at %s %d, granted=%d',
        this._cid,
        this.get('state'),
        this.map.objects.atCoords(this.get('hero'), 0, 0, 'owner', 0),
        _.indexOf(this.map.constants.object.type, this.map.objects.atCoords(this.get('hero'), 0, 0, 'type', 0)),
        this.get('hero'),
        _.indexOf(this.map.constants.object.type, this.map.objects.atCoords(this.get('bonus'), 0, 0, 'type', 0)),
        this.get('bonus'),
        this._countCalc.get('value')
      )

      this['_handle_' + this.get('state')]()
    },

    _handle_init: function () {
      this._date = this.map.date()
      this._bonus = this._shared.bonusAtter(this.get('bonus'), 0, 0, 0)
      this._bonusSpot = this.map.actionableSpot(this._bonus)
      this._hero = this._shared.heroAtter(this.get('hero'), 0, 0, 0)

      var max = Math.max(this._shared.const.random, this._shared.const.garrison)
      this._initialized = _.padEnd(this._bonus.initialized || '', max).split('')

      this.rules._encounters[this.get('hero')] = this

      this.set('state', 'prompt')
    },

    _handle_prompt: function () {
      if (this._bonus.proposal) {
        this.messageTransition({
          type: 'encounterPrompt',
          prompt: this._bonus.proposal,
        })
      } else {
        this.set('state', 'prompted')
      }
    },

    // Creates a Map.Transition used to show a message of some kind.
    //
    // By default, GenericEncounter shows messages in this order:
    //* AObject->$proposal, in the beginning
    //* quest_message, if the quest is unmet
    //* quest_choices, after fulfilling the quest
    //* bonus_message, in the end
    messageTransitionObject: function (options) {
      return this.map.transitions.nest(_.extend({
        bonus: this.get('bonus'),
        hero: this.get('hero'),
        // Providing as hero may be 0 during timedEvent().
        owner: this._hero.owner,
        effects: [this.addedEffects, this._bonus.encounterEffects],
        checks: this.questChecks,
        bonuses: this.addedBonuses,
        combat: !!this.combat,
      }, this.get('transitionOptions'), options))
    },

    // Creates a Map.Transition used to show a message of some kind and immediately finalizes it.
    messageTransition: function (options) {
      this.messageTransitionObject(options)
        .collectFinal()
    },

    // Called by external code when user provides an answer to an earlier prompt initiated by messageTransition...().
    //
    // Caller may override this to show rejection message:
    //[
    // this.map.transitions.nest({
    //   type: 'encounterPromptRejected',
    //   bonus: this.get('bonus'),
    //   hero: this.get('hero'),
    //   message: 'foo',
    // })
    //   .collectFinal()
    //
    // // Same as:
    // this.messageTransition({
    //   type: 'encounterPromptRejected',
    //   message: 'foo',
    // })
    //]
    promptAnswer: function (accept) {
      if (this.get('state') != 'prompt') {
        throw new Error('Invalid state')
      }

      _.log && _.log('GenericEncounter %s answer : %s', this._cid, accept)
      accept ? this.set('state', 'prompted') : this.remove()
    },

    _handle_prompted: function () {
      this.set('state', 'initRandom')
    },

    _handle_initRandom: function () {
      this._resetQuest()
      this._initialize('random', this._initializeRandom)
      this.set('state', 'initGarrison')
    },

    // Calls `'func if the specified `'bit feature wasn't initialized for this bonus object. For example, `'bit may represent dwelling's guards initialized on first encounter in game.
    _initialize: function (bit, func) {
      var init = this._initialized
      var clear = func === false

      if (clear == (init[this._shared.const[bit]] == '1') &&
          (clear || func.call(this) !== false)) {
        _.log && _.log('GenericEncounter %s initialized : %s <- %j', this._cid, bit, !clear)
        init[this._shared.const[bit]] = +!clear
        this.map.objects.setAtCoords(this.get('bonus'), 0, 0, 0, 'initialized', init.join(''))
      }
    },

    _resetQuest: function () {
      var labels = _.object(this._calc('GenericStrArray', 'quest_reset'))
      if (_.isEmpty(labels)) { return }

      _.log && _.log('GenericEncounter %s quest_reset : %s', this._cid, _.keys(labels))

      if ('R' in labels || '*' in labels) {
        // Will be written to store by _handle_initRandom().
        this._initialized[this._shared.const.random] = '0'
        delete labels.R
      }

      if ('G' in labels) {
        this._initialize('garrison', false)
        delete labels.G
      }

      // Effects' n may be reused. We need to either listen for oremove of
      // $encounterEffects (troublesome) or have a way to guarantee that the
      // Effect wasn't removed. The bonus' object ID prefix serves that purpose.
      var prefix = this.get('bonus') + '.'

      var effects = this.map.effects.batch(null, function () {
        return (this._bonus.encounterEffects || []).filter(function (n) {
          var nl = this.map.effects.atContiguous(n + this._shared.encounterLabel, 0)

          if (nl && nl.substr(0, prefix.length) == prefix) {
            if ('*' in labels || nl.substr(prefix.length) in labels) {
              _.log && _.log('GenericEncounter %s quest_reset : Effect %d', this._cid, n)
              this.map.effects.removeAtContiguous(n, 0)
            } else {
              // Keep Effects that were produced by this bonus object but have a
              // different $encounterLabel, for potential later quest_reset.
              return true
            }
          }
          // Remove Effects mismatching prefix from the list - this means they
          // were deleted between the encounters.
        }, this)
      }, this)

      if (effects.length != (this._bonus.encounterEffects || []).length) {
        this.map.objects.setAtCoords(this.get('bonus'), 0, 0, 0, 'encounterEffects', effects.length ? effects : false)
      }
    },

    _initializeRandom: function () {
      var chances = this._calc('', 'quest_chances', {initial: {}})
      var choice = this.rules._pickFromChances(_.sum(chances, _.forceObject), _.entries(chances))
      if (choice) {
        _.log && _.log('GenericEncounter %s quest_chances : %s <- %j', this._cid, choice[1], chances)
        this._appendEmbeddedEffects(this.map.effects.byLabel[choice[1]])
        return choice[1]
      }
    },

    // Obtains a Calculator object from Context.
    //> cls string empty generic Calculator.Effect, other subkey`, object class
    // Called prior to _handle_init() so cannot use _bonus, etc.
    _calcObject: function (cls, target, options) {
      if (typeof cls == 'string') {
        cls = cls ? Calculator.Effect[cls] : Calculator.Effect
      }
      var type = options && options.changeable
        ? 'changeableEffectCalculator' : 'oneShotEffectCalculator'
      return this.rules.cx[type](_.extend({
        class: cls,
        target: this.map.constants.effect.target[target],
        ifBonusObject: this.get('bonus'),
        ifObject: this.get('hero'),
        // Providing explicitly since during handleInitiallyOwned() hero is 0 and the calculator
        // cannot expand ifPlayer. Same during timedEvent().
        ifPlayer: this._hero.owner,
        ifGrantedMin: this._countCalc.get('value'),
        questChecks: this.questChecks,
        questBonuses: this.addedBonuses,
      }, this.get('selectors'), options))
        .take()
    },

    // Obtains a one-shot value from a Calculator provided by Context.
    _calc: function (cls, target, options) {
      return this._calcObject(cls, target, options)
        .release().get('value')
    },

    _handle_initGarrison: function () {
      if (this._bonus.owner !== this._hero.owner) {
        this._initialize('garrison', function () {
          var garrison = this._calc('GenericIntHash', 'quest_garrison')
          _.isEmpty(garrison) || this._initializeGarrison(garrison)

          if (this._bonus.owner !== false) {    // ownable, schedule reset
            this.map.effects.append({
              target: this.map.constants.effect.target.quest_reset,
              ifBonusObject: this.get('bonus'),
              // Next Monday onwards.
              ifDateMin: this.map.get('date') + 7 - this._date.day - 1,
              modifier: [this.map.constants.effect.operation.append, 'G'],
            })
          }
        })

        var sub = this.map.objects.readSubAtCoords(this.get('bonus'), 0, 0, 'garrison', 0)
        if (sub.hasObjects()) {
          return this._combat()
        }
      }

      this.set('state', 'quest')
    },

    _initializeGarrison: function (garrison) {
      var sub = this.map.objects.subAtCoords(this.get('bonus'), 0, 0, 'garrison', 0)
      try {
        sub.batch(null, function () {
          sub.extendTo(7 - 1)   // XXX=RH
          var slot = 0
          _.some(garrison, function (count, cr) {
            sub.removeAtCoords(slot, 0, 0, 0)
            var obj = {creature: +cr, count: count}
            sub.addAtCoords(slot, 0, 0, obj)
            return ++slot >= 7
          })
          // C1 C2 C3   existing  x == 3
          // C1 C2      new   garrison size (slot) == 2
          //  0  1  2-  i
          for (var i = sub.size().x; --i >= slot; ) {
            sub.removeAtCoords(i, 0, 0, 0)
          }
        }, this)
      } finally {
        sub.release()
      }
    },

    // Commences a combat between bonus' guards and hero's garrison.
    //
    // Server restart during combat should go unnoticed. If the encounter is part of $pending, it will find and connect to the existing combat on load. If it isn't, the encounter object will be missing so player will see no action after the combat completes. In this case he should just re-visit the object (perhaps spending some extra APs) - now that the guards are gone, the encounter will carry on to the next state.
    _combat: function () {
      var combat = this.map.combats.find(function (combat) {
        return combat.get('encounter') == this.get('bonus')
      }, this)

      combat = this.combat = combat ||
        (new Combat.Generator(this._combatOptions())).generate()

      this.autoOff(combat, {
        change_state: function (now) {
          // H3.Rules.RPC removes hero objects upon defeat, but our bonus object (such as monster) remains so we continue still within the scope of our $pending operation.
          //
          // But if hero is removed the client of GE must respond to unpending_encounter and call this.remove() so we do nothing if any of these objects (constituting the full list of $pending 'encounter' objects) is gone.
          if (now == 'end' &&
              this.map.objects.anyAtCoords(this.get('bonus'), 0, 0) &&
              this.map.objects.anyAtCoords(this.get('hero'), 0, 0)) {
            this.set('state', 'quest')
          }
        },
      })

      this.rules.rpc._startCombat(combat)
    },

    // Returns options that can be passed to Combat.Generator to create a new combat between bonus' guards and hero's garrison.
    _combatOptions: function () {
      var placement = this._calc('GenericString', 'quest_placement')

      this._balanceGarrison(placement)

      // XXX=IC guardians of objects owned by human players must be controlled by the AI and the combat screen shouldn't even be presented to the owning player (currently that player carries the combat as if his town or hero was attacked)
      switch (placement) {
        case 'random':
          var parties = [
            {object: this.map.representationOf(this.get('hero')), placement: 'random', tactics: 0},
            {object: this.map.representationOf(this.get('bonus')), placement: 'random', tactics: 0},
          ]
          break
        case 'middle':
          var parties = [
            {object: this.map.representationOf(this.get('hero')), placement: 'middle', formation: 0, tactics: 0},
            {object: this.map.representationOf(this.get('bonus')), placement: 'corners', formation: 0, tactics: 0},
          ]
          break
        default:
        //case 'l':
          var tactics = this._calc('GenericNumber', 'tacticsDistance')
          var parties = [
            {object: this.map.representationOf(this.get('hero')), placement: 'l', tactics: tactics},
            {object: this.map.representationOf(this.get('bonus')), placement: 'r', formation: true, tactics: 0},
          ]
      }

      return {
        map: this.map,
        rules: this.rules,
        encounter: this.get('bonus'),
        mapCoords: _.object(['x', 'y', 'z'], this._bonusSpot),
        parties: parties,
      }
    },

    // Arranges bonus' guards in preparation for combat against hero's garrison.
    //
    // For example, splits a party of archers into even stacks to make it harder for hero to block them to prevent shooting.
    _balanceGarrison: function (placement) {
      var sub = this.map.objects.subAtCoords(this.get('bonus'), 0, 0, 'garrison', 0)
      try {
        sub.batch(null, function () {
          // middle placement is only used for banks so split garrison into 5 parties like SoD does.
          //
          // In other placements leave all creatures joined except for archers who are split into as many even stacks as possible.

          var garrison = {}
          sub.find(0, function ($1, slot) {
            garrison[this.atCoords(slot, 0, 0, 'creature', 0)] = this.atCoords(slot, 0, 0, 'count', 0)
          })

          // XXX=RH
          var slots = placement == 'middle' ? 5 : 7

          if (_.size(garrison) < slots) {
            var cr
            var count = 0
            _.each(garrison, function (gc, gcr) {
              // XXX relying on databank data rather than creature_shots
              if ((placement == 'middle' || this.rules.creatures.atCoords(gcr, 0, 0, 'shooting', 0)) && count < gc) {
                count = gc
                cr = gcr
              }
            }, this)
            if (cr != null) {
              sub.extendTo(slots - 1)
              var split = slots - _.size(garrison) + 1
              _.log && _.log('GenericEncounter %s _balanceGarrison() of %d×%d into %d slots : %s', this._cid, count, cr, split, _.entries(garrison).map(function (i) { return i[1] + '×' + i[0] }).join(', '))
              count = Math.ceil(count / split)
              var slot = 0
              _.each(garrison, function (gc, gcr) {
                if (gcr == cr) {
                  while (split--) {
                    sub.removeAtCoords(slot, 0, 0, 0)
                    // Given count of 17, slots of 7, produce 5 slots with count
                    // of 3, 1 slot of 2 and 1 empty slot.
                    var obj = {creature: +gcr, count: Math.min(count, gc)}
                    gc -= obj.count
                    obj.count && sub.addAtCoords(slot++, 0, 0, obj)
                  }
                } else {
                  sub.removeAtCoords(slot, 0, 0, 0)
                  sub.addAtCoords(slot++, 0, 0, {creature: +gcr, count: gc})
                }
              })
              for (var i = sub.size().x; --i >= slot; ) {
                sub.removeAtCoords(i, 0, 0, 0)
              }
            }
          }
        }, this)
      } finally {
        sub.release()
      }
    },

    _handle_quest: function () {
      var calc = this._calcObject('GenericBool', 'quest_fulfilled')
      this.questChecks = calc.get('checks') || []
      calc.release()
      if (calc.get('value')) {
        this.set('state', 'choice')
      } else {
        this._questUnfulfilled()
      }
    },

    // Similarly to promptAnswer(), caller may override this to show custom rejection message.
    _questUnfulfilled: function () {
      var msg = this._calc('GenericStrArray', 'quest_message')
      _.each(msg, function (msg) {
        this.messageTransition({
          type: 'encounterMessage',
          message: msg,
        })
      }, this)

      this.remove()
    },

    _handle_choice: function () {
      var choices = this._calc('GenericStrArray', 'quest_choices')
      if (choices.length) {
        this.messageTransition({
          type: 'encounterChoice',
          choices: choices,
        })
      } else {
        this.set('state', 'bonus')
      }
    },

    // Called by external code when user provides an answer to an earlier choice initiated by messageTransition...().
    //
    // User must accept one of the choices. It is possible to "cancel" an encounter like with promptAnswer() but only if `'quest_choices lists `'cancel (or the game restarts). Some encounters offer a similar choice called `'nothing (e.g. Border Guard) but it continues with the encounter, bumping the granted counter, etc.
    choiceAnswer: function (choice) {
      if (this.get('state') != 'choice') {
        throw new Error('Invalid state')
      }

      var choices = this._calc('GenericStrArray', 'quest_choices')

      _.log && _.log('GenericEncounter %s quest_choices : %s <- %s', this._cid, choice, choices)

      if (choices.length) {
        if (!_.includes(choices, choice)) {
          // This condition is legit since choices are coming from Effects and the
          // latter are volatile. SoD doesn't have any such choices though.
          throw new Error('Invalid choice')
        }
        if (choice == 'cancel') {
          return this.remove()
        }
        this._appendEmbeddedEffects(this.map.effects.byLabel[choice])
      }

      this.set('state', 'bonus')
    },

    // This state processes bonuses associated with a successful encounter: erect/demolish town buildings, add/reduce creatures for hire, join creatures, artifacts, resources, experience, shroud update, messages, etc.
    //
    // Unlike most other states, handling of this one may occur out of normal sequence (see timedEvent(), for example) and may have unusual _opt values (e.g. `'hero may be a town).
    //
    // Should be synchronous because is used in handleInitiallyOwned() and timedEvent().
    _handle_bonus: function () {
      // Got to be first since bonus_effects may produce more bonus_... Effects
      // and we should evaluate them too in this method.
      //
      // Because bonus_effects may produce bonus_effects recursively, we have to iterate until no new entries appear (i.e. once per each nested bonus_effects depth). However, we don't know if an entry (embedded Effects, result of evaluating bonus_effects) is "new" because there is no "ID" or other field that uniquely identifies entries. Moreover, we need to avoid adding the "same" entry again on subsequent iterations. To work around this, we mark entries in evaluated modifiers with unique objects (more on this below) so we can track them when they appear in the result. Markers are stored in $dynamic which likely doesn't make sense to use with embedded Effects.
      //
      // This implementation had three revisions:
      //
      // 1. At first, plain objects ({}) were placed into $dynamic. This worked great (every read "{}" and "[]" in JSON results in a unique JS object) until I figured that Calculator should deepClone() all produced values (in _affect(), _applyModifiers(), etc.).
      // 2. I replaced objects replaced with unique numbers; I already had enough fun storing counters so I opted for _.random(1 << 29) + 1. However, expandModifier below does direct modification of map.effects layer data so clients don't see it and fail their integrity checks. Not that they should see it (it's internal to master) but unlike with "{}" and "[]", every distinct number shows distinct when JSON.stringify()'ed.
      // 3. To remove the discrepancy I decided to go back to objects but override deepClone() to not clone special objects used in $dynamic.
      //
      //    I had an idea of using Symbol-s in place of {} but they turn to "null" after stringify() which is a problem because, as any other field in ObjectStore, "unset" value is false (this is the main problem; even though null is not allowed in ObjectStore layer values but null/Symbol could only appear in $dynamic that is part of an Effect embedded into $modifier of bonus_effects; when a real Effect is created out of the embedded one, we would set $dynamic to false). An advantage is that typeof Symbol isn't 'object' so overriding deepClone() would be unnecessary. But another disadvantage is that Symbol cannot be cast to string so contentHash() would have to use stringify() rather than mere "_layers + ''" and the latter is a lot faster.
      //
      // XXX=R The fact that we are modifying entries when evaluating is against HeroWO's general rule that all data should stored already prepared. Ideally, entries should be marked right when they are added (possibly using a new Effects property); this would need updating of all places where bonus_effects are produced (or at least some generic mechanism on both PHP and JS sides). For now, the entry detection mechanism is an implementation detail that might change.
      var chunk = this.map.effects.schemaLength()
      var symbol = this.constructor.symbol
      var cls = Calculator.Effect.extend({
        events: {
          '+expandModifier': function (res) {
            if (res[0] == this._constants.operation.const) {
              var embedded = res[1]
              var i = 0
            } else {
              var embedded = res
              var i = 1   // skip the operation int
            }
            for (i += this._schema.dynamic; i < embedded.length; i += chunk) {
              if (!(embedded[i] || {})[symbol]) {
                // false + '' == [false] + '' == 'false'.
                var o = embedded[i] = [false]
                // Just as we need it, JSON.stringify() and toString() drop custom keys on Array even if they are not Symbol-s.
                o[symbol] = true
              }
            }
          },
        },
        deepClone: function (obj) {
          if (typeof obj == 'object' && obj && !obj[symbol]) {
            obj = _.map(obj, this.deepClone, this)
          }
          return obj
        },
      })
      var calc = this._calcObject(cls, 'bonus_effects', {shared: false, update: false, listen: 2, initial: []})
      var seen = new Set
      do {
        var effects = calc.updateIfNeeded().get('value') || []
        var ns = this._appendEmbeddedEffects(effects, function (effect) {
          var unique = effect[this._shared.dynamic]
          if (seen.size == seen.add(unique).size) {
            return false
          }
          effect[this._shared.dynamic] = false
          this._expandEffect(effect)
        })
        ns.length && _.log && _.log('GenericEncounter %s bonus_effects : %s', this._cid, ns)
      } while (ns.length)
      calc.release()

      if (!this.get('hero')) {
        // Skip certain bonuses during handleInitiallyOwned().
      } else if (this.map.objects.atCoords(this.get('hero'), 0, 0, 'type', 0) == this.map.constants.object.type.town) {
        // The only case when a town can be the encounterer is during timedEvent(). This enables town-only bonuses.
        var buildings = this._calc('GenericIntArray', 'bonus_buildings')
        // XXX+I SoD shows messages for both bonus buildings and available (but make sure to not show message for buildings created as a result of Random town initialization in h3m2herowo.php)
        if (buildings.length) {
          var current = this.rules.cx.changeableEffectCalculator({
            class: Calculator.Effect.GenericIntArray,
            target: this.map.constants.effect.target.town_buildings,
            ifObject: this.get('hero'),  // the town
          }).take()
          var n = current.updateIfNeeded().get('affectors').find(function (n) {
            var src = this.map.effects.atContiguous(n + this.map.effects.propertyIndex('source'), 0)
            return src == this.map.constants.effect.source.initialize &&
                   this.map.effects.atContiguous(n + this.map.effects.propertyIndex('modifier'), 0)[0] == this.map.constants.effect.operation.append
          }, this)
          var calc = this._calcObject('GenericBool', 'bonus_build', {
            changeable: true,
          })
          buildings.forEach(function (building) {
            var erect = calc.set('ifBuilding', building).updateIfNeeded().get('value')
            if (erect) {
              if (!_.includes(Rules.TownBuildingsWithUpgraded.calculateUsing(this.rules, current.reset().updateIfNeeded().get('value')), building)) {
                var towns = this.rules.buildings.atCoords(building, 0, 0, 'town', 0)
                if (towns === false || _.includes(towns, this.map.objects.atCoords(this.get('hero'), 0, 0, 'subclass', 0))) {
                  // Erecting one by one to allow the built list update so we can skip buildings that are inferior versions of earlier erected upgraded buildings.
                  //
                  // XXX This assumes all upgraded building forms have the same growth rate as is the case in SoD. If not, available count will use rate of an arbitrary building from bonus_buildings of this timed event.
                  this.rules._erect(this.get('hero'), [building], current.get('affectors'))
                }
              }
            } else if (n != null) {
              // Buildings can be supplied by Effects other than of normal do=townBuild. Timed event only alters the latter because overriding (with 'diff', etc.) may lead to unexpected results (user unable to erect anymore, etc.).
              var cur = this.map.effects.atContiguous(n + this.map.effects.propertyIndex('modifier'), 0)
              if (_.includes(cur.slice(1), building)) {
                cur = [cur[0]].concat(_.without(cur.slice(1), building))
                this.map.effects.setAtContiguous(n + this.map.effects.propertyIndex('modifier'), 0, cur)
              }
            }
          }, this)
          calc.release()
          current.release()
        }
        var available = this._calc('GenericIntArray', 'bonus_available')
        if (available.length) {
          var calc = this._calcObject('GenericNumber', 'bonus_availableCount', {
            changeable: true,
          })
          var sub = this.map.objects.subAtCoords(this.get('hero'), 0, 0, 'available', 0)
          try {
            sub.batch(null, function () {
              available.forEach(function (building) {
                var count = sub.atCoords(building, 0, 0, 0, 0)
                if (count != null) {    // is erected
                  calc.assignResp({ifBuilding: building, initial: count})
                  count = calc.updateIfNeeded().get('value')
                  sub.setAtCoords(building, 0, 0, 0, 0, count)
                }
              })
            })
          } finally {
            sub.release()
          }
          calc.release()
        }
      } else {
        // XXX=I currently we're pushing creatures to hero's garrison until it's full; the remainder is lost; implement SoD's exchange dialog (GARRISON) - but only for some encounters (like bank reward), not others (like 1-st level dwellings)
        var creatures = this._calc('GenericIntArray', 'bonus_creatures')
        if (creatures.length) {
          var record = {}
          var calc = this._calcObject('GenericNumber', 'bonus_creatureCount', {
            changeable: true,
          })
          var sub = this.map.objects.subAtCoords(this.get('hero'), 0, 0, 'garrison', 0)
          try {
            sub.batch(null, function () {
              sub.extendTo(7-1)   // XXX=RH
              var slot = 0
              _.some(_.unique(creatures), function (cr, i) {
                while (sub.anyAtCoords(slot, 0, 0)) { slot++ }
                if (slot >= 7 /*XXX=RH*/) { return true }
                var count = calc.set('ifCreature', cr).updateIfNeeded().get('value')
                record[cr] = count
                sub.addAtCoords(slot++, 0, 0, {
                  creature: cr,
                  count: count,
                })
              }, this)
            }, this)
          } finally {
            sub.release()
          }
          calc.release()
          if (!_.isEmpty(record)) {
            this._recordBonus('heroes', this.get('hero'), 'creatures', record)
          }
        }

        // XXX=C SoD's editor help suggests that artifacts may be lost due to full backpack but I have never seen this in game so not implementing it
        var artifacts = this._calc('GenericIntArray', 'bonus_artifacts')
        if (artifacts.length) {
          var sub = this.map.objects.subAtCoords(this.get('hero'), 0, 0, 'artifacts', 0)
          try {
            sub.batch(null, function () {
              _.each(artifacts, function (art) {
                this.rules._equipTrophy(sub, art)
              }, this)
            }, this)
          } finally {
            sub.release()
          }
          this._recordBonus('heroes', this.get('hero'), 'artifacts', artifacts)
        }
      }

      var opt      = {changeable: true}
      var optArray = {changeable: true, initial: []}
      var calcs = {
        resource:       this._calcObject('GenericNumber', 'bonus_resource', opt),
        exp:            this._calcObject('GenericNumber', 'bonus_experience', opt),
        ap:             this._calcObject('GenericNumber', 'bonus_actionPoints', opt),
        sp:             this._calcObject('GenericNumber', 'bonus_spellPoints', opt),
        shroud:         this._calcObject('', 'bonus_shroud', optArray),
        shroudTerrain:  this._calcObject('', 'bonus_shroudTerrain', optArray),
        shroudRiver:    this._calcObject('', 'bonus_shroudRiver', optArray),
        shroudRoad:     this._calcObject('', 'bonus_shroudRoad', optArray),
      }

      this.map.players.each(function (player) {
        if (player.get('player') == 0) { return }

        this._applyBonusShroudForPlayer(calcs, player)

        _.each(this.map.constants.resources, function (res, name) {
          var p = 'resources_' + name

          var values = player.getSet(p, p, ['-' + p, p], function (cur) {
            calcs.resource.assignResp({
              ifTargetPlayer: player.get('player'),
              ifResource: res,
              initial: cur,
            })
            // SoD prevents events from making negative balance.
            return Math.max(0, calcs.resource.updateIfNeeded().get('value'))
          }, this)

          this._recordBonus('players', player.get('player'), p, values[1] - values[0])
        }, this)

        player.heroes.each(function (hero) {
          var options = {
            ifTargetObject: hero.get('id'),
          }

          calcs.exp.assignResp(_.extend({
            initial: hero.get('experience'),
          }, options))
          var exp = calcs.exp.updateIfNeeded().get('value')
          // XXX=I granting during handleInitiallyOwned should be "non-interactive" (no transitions)
          exp = this.rules._grantExperience(hero, exp - hero.get('experience'))
          this._recordBonus('heroes', hero.get('id'), 'experience', exp)

          var p = 'actionPoints'
          var values = hero.getSet(p, p, ['-' + p, p], function (cur) {
            calcs.ap.assignResp(_.extend({initial: cur}, options))
            // XXX make min/max normalization universal in GenericNumber?
            return Math.max(0, calcs.ap.updateIfNeeded().get('value'))
          }, this)
          this._recordBonus('heroes', hero.get('id'), p, values[1] - values[0])

          var p = 'spellPoints'
          var values = hero.getSet(p, p, ['-' + p, p], function (cur) {
            calcs.sp.assignResp(_.extend({initial: cur}, options))
            return Math.max(0, calcs.sp.updateIfNeeded().get('value'))
          }, this)
          this._recordBonus('heroes', hero.get('id'), p, values[1] - values[0])
        }, this)
      }, this)

      // Showing for regular encounter and timedEvent() but not for handleInitiallyOwned().
      if (this.get('hero') || !this.get('bonus')) {
        // XXX=I should appear before levelup
        //
        // Messages are processed in the end, once all addedBonuses were filled.
        var msg = this._calc('GenericStrArray', 'bonus_message')
        _.each(msg, function (msg) {
          this.messageTransition({
            type: 'encounterMessage',
            message: msg,
          })
        }, this)
      }

      _.invoke(calcs, 'release')
      this.set('state', 'remove')
    },

    _recordBonus: function (group, entity, bonus, value) {
      if (value) {
        _.log && _.log('GenericEncounter %s bonus : %s[%s].%s += %s', this._cid, group, entity, bonus, value)

        group = this.addedBonuses[group]
        ;(group[entity] || (group[entity] = {}))[bonus] = value
      }
    },

    _applyBonusShroudForPlayer: function (calcs, player) {
      if (this.get('bonus')) {    // not during timedEvent()
        calcs.shroud.set('ifTargetPlayer', player.get('player'))
        var bonuses = calcs.shroud.updateIfNeeded().get('value')
        this._applyBonusShroud(bonuses, {
          x: this._bonusSpot[0],
          y: this._bonusSpot[1],
          z: this._bonusSpot[2],
          player: player.get('player'),
        })
      }

      var groundBonuses = {terrain: [], river: [], road: []}
      var notEmpty = false

      _.each(groundBonuses, function (bonuses, kind) {
        var options = {
          ifTargetPlayer: player.get('player'),
          initial: [],
        }

        var cap = Common.capitalize(kind)

        _.each(this.map.constants.class[kind], function (id) {
          options['if' + cap] = id
          var calc = calcs['shroud' + cap]
          calc.assignResp(options)
          var b = bonuses[id] = calc.updateIfNeeded().get('value')
          notEmpty |= b && b.length
        }, this)
      }, this)

      if (notEmpty) {
        var schema = this.map.byPassable.schema()

        this.map.byPassable.find(0, function ($1, x, y, z, $5, n) {
          var terrain = groundBonuses.terrain[this.map.byPassable.atContiguous(n + schema.terrain, 0)] || []
          var river = groundBonuses.river[this.map.byPassable.atContiguous(n + schema.river, 0)] || []
          var road = groundBonuses.road[this.map.byPassable.atContiguous(n + schema.road, 0)] || []

          if (terrain.length || river.length || road.length) {
            _.log && _.log('GenericEncounter %s bonus_shroud%s/%s/%s : (%d;%d;%d) P%d',
              this._cid,
              terrain.length ? 'Terrain' : '',
              river.length ? 'River' : '',
              road.length ? 'Road' : '',
              x, y, z, player)

            this._applyBonusShroud(terrain.concat(river, road), {
              x: x,
              y: y,
              z: z,
              player: player.get('player'),
            })
          }
        }, this)
      }
    },

    _applyBonusShroud: function (bonuses, options) {
      var defaults = {
        AtCoords: [options.x, options.y, options.z, options.player],
        Within: [options.z, options.player],
        WithinBox: [options.x, options.y, options.x, options.y, options.z, options.player],
        WithinDiamond: [options.x, options.y, 0, options.z, options.player],
        WithinCircle: [options.x, options.y, 0, options.z, options.player],
      }

      _.each(bonuses || [], function (area) {
        var args = area.slice(1).map(function (arg, i) {
          return arg == null || arg < 0 ? arg + defaults[area[0]][i] : arg
        })

        this.map.shroud['set' + area[0]].apply(this.map.shroud, args)
      }, this)
    },

    // Cleans-up the encounter, ending the process.
    _handle_remove: function () {
      this._recordGranted()

      if (this._calc('GenericBool', 'quest_remove')) {
        var transition = this.messageTransitionObject({
          type: 'encounterRemove',
          audio: this._calc('GenericString', 'quest_removeAudio'),
        })
        transition.collect()
        // This should trigger unpending_encounter that calls remove() so once removeAtCoords() returns, this is already unnested.
        this.map.objects.removeAtCoords(this.get('bonus'), 0, 0, 0, transition.options(0, {encounterHeroOwner: this._hero.owner}))
        transition.collectFinal()
      } else if (this._bonus.owner !== false) {
        // The added quest_reset Effect remains since we don't have its n at
        // this point, but that's fine - running it shouldn't have any side effects.
        this._initialize('garrison', false)
        this.map.objects.setAtCoords(this.get('bonus'), 0, 0, 0, 'owner', this._hero.owner)
      }

      this.remove()
    },

    _recordGranted: function () {
      var n = this._countCalc.get('affectors')
        .find(function (n) {
          var src = this.map.effects.atContiguous(n + this._shared.source, 0)
          return src && src[0] == this.map.constants.effect.source.quest_granted && src[1] == this.get('bonus')
        }, this)

      if (n == null) {  // first-time grant
        this.map.effects.append(_.extend({
          target: this.map.constants.effect.target.quest_granted,
          source: [this.map.constants.effect.source.quest_granted, this.get('bonus')],
          modifier: 1,
          ifBonusObject: this.get('bonus'),
        }, this.get('selectors')))
      } else {
        this.map.effects.setAtContiguous(n + this._shared.modifier, 0,
          this._countCalc.get('value') + 1)
      }
    },

    // Inserts serialized Effects into the world so they can take effect.
    _appendEmbeddedEffects: function (effects, func) {
      var ns = this.rules.appendEmbeddedEffects(effects, (func || this._expandEffect).bind(this))
      if (ns.length && this.get('bonus')) {
        this.addedEffects.push.apply(this.addedEffects, ns)
        var cur = (this._bonus.encounterEffects || []).concat(ns)
        this._bonus.encounterEffects = cur
        this.map.objects.setAtCoords(this.get('bonus'), 0, 0, 0, 'encounterEffects', cur)
      }
      return ns
    },

    //! +ig
    // Sets automatic values to serialized Effects being inserted into the world.
    //#geex
    // Effects added by EffectLabel support shortcuts (=== true and others) in these properties:
    //> encounterLabel `- always prefixed with the encountered object's ID
    //> ifDate... `- non-positive integer value; added by modulus to current date component (so `'$ifDateMax of 0 means "current date", -2 means "current date plus 2 days", etc.)
    //> maxDays `- negative value; until next week day (-1 for next Monday, -7 for Sunday)
    //> modifier `- only if expanding an Effect whose `'target is `'bonus_effects; leading array members of type string (in front of the integer operation) specify Effect `'$label-s to be appended to the modifier
    //> source `- exactly `'false (i.e. unset); set to `[[$encounter, encountered object]`] to facilitate the default "is visited" `'quest_fulfilled check (`[['check', 'quest']`])
    //> priority `- exactly `'false; set to `'mapSpecific
    //> ifBonusObject, whileOwned `- exactly `'true; set to the encountered object
    //> ifTargetPlayer, ifPlayer, whileOwnedPlayer `- exactly `'true; set to the hero's player
    //> ifGarrisoned, ifVisiting, ifObject, ifTargetObject, whileObject `- exactly `'true; set to the hero
    _expandEffect: function (effect) {
      if (this.get('bonus')) {
        effect[this._shared.encounterLabel] = this.get('bonus') + '.' + (effect[this._shared.encounterLabel] || '')
      }

      var short = {
        ifDateMin: this.map.get('date'),
        ifDateMax: this.map.get('date'),
        ifDateDay: this._date.day,
        ifDateWeek: this._date.week,
        ifDateMonth: this._date.month,
      }

      _.each(short, function (cur, prop) {
        var value = effect[this._shared[prop]]
        if (typeof value == 'number' && value <= 0) {
          effect[this._shared[prop]] = -value + cur
        }
      }, this)

      if (effect[this._shared.maxDays] < 0) {
        effect[this._shared.maxDays] = -effect[this._shared.maxDays] + 7 - this._date.day
      }

      if (effect[this._shared.target] == this.map.constants.effect.target.bonus_effects) {
        // No need to clone this because Calculator.Effect does deepClone().
        var mod = effect[this._shared.modifier]
        while (typeof mod[0] == 'string') {
          mod.push.apply(mod, this.map.effects.byLabel[mod.shift()])
        }
        // All supported modifiers except $const have the inserted value unwrapped.
        if (mod[0] == this.map.constants.effect.operation.const) {
          effect[this._shared.modifier] = [mod[0], mod.slice(1)]
        }
      }

      if (effect[this._shared.source] === false) {
        effect[this._shared.source] = [this.map.constants.effect.source.encounter, this.get('bonus')]
      }

      if (effect[this._shared.priority] === false) {
        // XXX=R need to implement generic priority calculation like in PHP
        var op = this.map.constants.effect.operation.const
        effect[this._shared.priority] = this.map.effects.priority(op, this.map.constants.effect.priority.mapSpecific)
      }

      var short = {
        ifBonusObject:      this.get('bonus'),
        whileOwned:         this.get('bonus'),
        ifPlayer:           this._hero.owner,
        ifTargetPlayer:     this._hero.owner,
        whileOwnedPlayer:   this._hero.owner,
      }

      _.extend(short, _.fill(_.flip(this.constructor.heroShortcuts), this.get('hero')))

      _.each(short, function (value, prop) {
        if (effect[this._shared[prop]] === true) {
          effect[this._shared[prop]] = value
        }
      }, this)
    },
  }, {
    shared: {},
    symbol: typeof Symbol == 'undefined' ? '_ge' : Symbol('GenericEncounter'),

    heroShortcuts: [
      'ifGarrisoned',
      'ifVisiting',
      'ifObject',
      'ifTargetObject',
      'whileObject',
    ],
  })

  // Provides value taken from databank based on AObject->$subclass.
  Rules.SubclassProperty = Calculator.extend('HeroWO.H3.Rules.SubclassProperty', {
    delayRender: false,
    _keyOptions: ['collection', 'subCollection', 'property', 'adjust'],

    _opt: {
      //id: 0,
      collection: '',
      subCollection: '',  // if '', read collection's property by id's $subclass; else read collection's $class property by $subclass and read subCollection's $property
      property: '', // int or str
      adjust: 0,  // useful when using with Bits.String, for outputting 0-based numbers as 1-based (e.g. AObject->$level)
    },

    events: {
      attach: function () {
        this.autoOff(this.map.objects, ['ochange_p_' + this.map.objects.propertyIndex('subclass'), 'update'])
      },

      '+_calculate': function (res) {
        var sc = this.map.objects.atCoords(this.get('id'), 0, 0, 'subclass', 0)
        if (!this.get('subCollection')) {
          res.value = this.rules[this.get('collection')].atCoords(sc, 0, 0, this.get('property'), 0)
        } else {
          sc = this.rules[this.get('collection')].atCoords(sc, 0, 0, 'class', 0)
          res.value = this.rules[this.get('subCollection')].atCoords(sc, 0, 0, this.get('property'), 0)
        }
        res.value += this.get('adjust')
      },
    },
  })

  // Provides a stable number based on game features like date or AObject->$id.
  //
  // Used to generate rumors that are the same during the same game week for all players in this game (but not another game instance of the same map).
  Rules.ObjectHash = Calculator.extend('HeroWO.H3.Rules.ObjectHash', {
    delayRender: false,
    _keyOptions: ['max', 'persistence'],

    _opt: {
      //id: 0,
      // array of strings or number - Effect target generating an array of strings
      max: null,
      // what affects the hash, set of symbols: g (game instance), D (game date), d (game day of week), w/m (game week/month), i (object ID), x/y/z (object coords); not all combinations are supported due to limited size of Number (currently only meant for random rumors and random signs); don't change
      persistence: 'gwi',

      // set after calculation if max is a number to the array generated by Effect
      strings: null,
    },

    events: {
      attach: function () {
        if (this.get('persistence').match(/[Ddwm]/)) {
          this.autoOff(this.map, {change_date: 'update'})
        }

        if (this.get('persistence').match(/[xyz]/)) {
          var n = this.map.objects.toContiguous(this.get('id'), 0, 0, 0)

          this.autoOff(this.map.objects, [
            'ochange_n_' + n,
            function ($1, $2, prop) {
              switch (prop) {
                case this.map.objects.propertyIndex('x'):
                case this.map.objects.propertyIndex('y'):
                case this.map.objects.propertyIndex('z'):
                  this.update()
              }
            }
          ])
        }
      },

      '+_calculate': function (res) {
        var max = this.get('max')
        res.strings = null

        if (!_.isArray(max)) {
          // Taking the value randomRumors has at the moment of calculating TavernRumor instead of listening to its change as with other calculators. This way, its change doesn't cause updates to all tavern rumors until they are recalculated because of other/normal conditions (such as because of change_date). Otherwise player might come up with a way to force refresh rumors which is against the design.
          res.strings = this.cx.oneShotEffectCalculation({
            class: Calculator.Effect.GenericStrArray,
            target: max,
          })
          max = res.strings.length
        }

        // Rumors are random for every combination of (game instance, map object, date) - when one component changes, the result changes. "Game instance" is a freshly started game, persisting on save and load.
        var seed = 0
        if (_.includes(this.get('persistence'), 'i')) {
          seed = this.get('id')
        }
        if (_.includes(this.get('persistence'), 'D')) {
          seed = seed << 11 | this.map.get('date')  // up to 2048th day
        }
        if (_.includes(this.get('persistence'), 'd')) {
          seed = seed << 3 | this.map.get('date') % 7
        }
        if (_.includes(this.get('persistence'), 'w')) {
          seed = seed << 9 | this.map.get('date') / 7
        }
        if (_.includes(this.get('persistence'), 'm')) {
          seed = seed << 7 | this.map.get('date') / 28
        }
        if (_.includes(this.get('persistence'), 'x')) {
          seed = seed << 8 | this.map.objects.atCoords(this.get('id'), 0, 0, 'x', 0)
        }
        if (_.includes(this.get('persistence'), 'y')) {
          seed = seed << 8 | this.map.objects.atCoords(this.get('id'), 0, 0, 'y', 0)
        }
        if (_.includes(this.get('persistence'), 'z')) {
          seed = seed << 2 | this.map.objects.atCoords(this.get('id'), 0, 0, 'z', 0)
        }
        if (_.includes(this.get('persistence'), 'g')) {
          seed ^= this.map.get('random') * 0x80000000
        }

        res.value = max ? _.randomBySeed(seed)[1] * max | 0 : null
      },
    },
  })

  // Provides properties dictated by a hero's specialty (e.g. in Ogres): icon, name, etc.
  Rules.HeroSpecialty = Calculator.extend('HeroWO.H3.Rules.HeroSpecialty', {
    delayRender: false,
    _keyOptions: ['large'],
    _calc: null,

    _opt: {
      //id: 0,    // do not change after attach()
      large: true,

      icon: null,    // array suitable for DefImage.Calculator or null if hero has no hero_specialty
      shortName: null,
      longName: null,
      description: null,
    },

    events: {
      attach: function () {
        this._calc = this.updateOn(Calculator.Effect, {
          target: this.map.constants.effect.target.hero_specialty,
          ifObject: this.get('id'),
        })
      },

      '+_calculate': function (res) {
        var spec = this._calc.get('value')

        _.extend(res, {
          icon: spec && [this.get('large') ? 'UN44' : 'UN32', 0, spec[0]],
          shortName: spec && spec[1],
          longName: spec && spec[2],
          description: spec && spec[3],
        })
      },
    },
  })

  // Provides name of bitmap representing a hero's "face".
  Rules.HeroPortrait = Calculator.extend('HeroWO.H3.Rules.HeroPortrait', {
    delayRender: false,
    _keyOptions: ['large'],
    _calc: null,

    _opt: {
      //id: 0,    // do not change after attach()
      large: true,
    },

    events: {
      attach: function () {
        this._calc = this.updateOn(Calculator.Effect.GenericString, {
          target: this.map.constants.effect.target.portrait,
          ifObject: this.get('id'),
        })
      },

      '+_calculate': function (res) {
        res.value = (this.get('large') ? 'HPL' : 'HPS') + this._calc.get('value')
      },
    },
  })

  // Provides name/group/frame of DEF representing a town's "face", considering town's state (Fort level and whether it has built something this round).
  Rules.TownPortrait = Calculator.extend('HeroWO.H3.Rules.TownPortrait', {
    delayRender: false,
    _keyOptions: ['large', 'canBuild'],
    _portrait: null,
    _fort: null,
    _canBuild: null,

    _opt: {
      //id: 0,    // do not change after attach()
      large: false,   // do not set
      canBuild: true, // do not set; whether to indicate town_hasBuilt or not
    },

    events: {
      attach: function () {
        this._portrait = this.updateOn(Calculator.Effect.GenericNumber, {
          target: this.map.constants.effect.target.portrait,
          ifObject: this.get('id'),
        })

        this._fort = this.updateOn(Rules.TownBuildingLevel, {
          id: this.get('id'),
          // SoD shows town as if it had Fort if it has Capitol on ADVMAP but in the list of towns it remains "fortless".
          buildings: this.rules.fortBuildings,
        })

        if (this.get('canBuild')) {
          this._canBuild = this.updateOn(Calculator.Effect.GenericNumber, {
            target: this.map.constants.effect.target.town_hasBuilt,
            ifObject: this.get('id'),
          })
        }
      },

      '+_initShared': function (res) {
      },

      '+_calculate': function (res) {
        // Original SoD layout for the ITPT (large)/ITPA DEF, group 0:
        // - ITPA has 2 extra frames at 0 and 1
        // - then paired images for each Town->$id follow, second image showing
        //   a cross (!canBuild); this is for towns with at least a Fort
        // - then another run of paired images follow, this one for Fort-less
        //   towns
        // - then ITPA has 1 extra frame at 38
        //
        // Due to the second run, it's impossible to put new (non-SoD) towns
        // without overlapping. We address this by adding new images after the
        // last above, each going in fours: no-Fort canBuild, no-Fort !canBuild,
        // Fort canBuild, Fort !canBuild. Schematically:
        //
        //   [ (ITPA frame 0)  (ITPA frame 1) ]
        //     (Castle F cB)   (Castle F !cB)
        //     ...
        //     (Conflux !F cB) (Conflux !F !cB)
        //   [ (ITPA frame 38) ]
        //   [ (extra town A, !F cB) (!F !cB) (F cB) (F !cB) ]
        //   [ (extra town B, !F cB) ... ]
        var portrait = this._portrait.get('value')
        var fort = this._fort.get('value')
        var cannotBuild = this._canBuild && this._canBuild.get('value') <= 0
        res.value = {
          def: this.get('large') ? 'ITPT' : 'ITPA',
          group: 0,
          frame: 2 * !this.get('large') + portrait +
            (portrait < 2*9
              ? cannotBuild + (fort == -1) * 9*2   // SoD's
              : (fort != -1) * 2 + cannotBuild),
        }
      },
    },
  }, {shared: {}})

  // Determines quantity of resources generated by town for its owner each round.
  Rules.TownIncome = Calculator.extend('HeroWO.H3.Rules.TownIncome', {
    delayRender: false,
    _keyOptions: ['resource'],
    _calc: null,

    _opt: {
      //player: null,    // do not change after attach()
      //id: 0,
      resource: 0,       // do not change after attach()
    },

    events: {
      attach: function () {
        this._calc = this.updateOn(Calculator.Effect.GenericNumber, {
          target: this.map.constants.effect.target.income,
          ifPlayer: this.get('player').get('player'),
          ifResource: this.get('resource'),
        })
      },

      '+_initShared': function (res) {
        res.atter = this.map.effects.atter(['source', 'modifier'])
      },

      '+_calculate': function (res) {
        res.value = 0

        this._calc.get('affectors').forEach(function (n) {
          var effect = this._shared.atter(n, 0)
          if (effect.source &&
              effect.source[0] == this.map.constants.effect.source.town &&
              effect.source[1] == this.get('id')) {
            // HeroWO's Effect system is way more complex than SoD's; a town
            // may affect income in various ways and we don't try to deduce the
            // exact number (this is often impossible, e.g. $clamp can't be simply
            // output as a number, $relative depends on Effects from other towns,
            // etc.). We only process simple effects ($const and $delta) that
            // are coming from standard SoD features (namely buildings - Hall,
            // Resource Silo, etc.).
            var mod = this._calc.expandModifier(effect.modifier)
            switch (mod[0]) {
              case this.map.constants.effect.operation.const:
                res.value = 0
              case this.map.constants.effect.operation.delta:
                res.value += mod[1]
            }
          }
        }, this)
      },
    },
  }, {shared: {}})

  // Determines if a boat can be or has been built at a certain spot. Used in town and on-map Shipyard.
  Rules.ShipState = Calculator.extend('HeroWO.H3.Rules.ShipState', {
    delayRender: false,
    _off: [],

    _opt: {
      //id: 0,    // town or shipyard; do not change after attach()

      x: null,
      y: null,
      z: null,
      //n: null,
    },

    events: {
      attach: function () {
        this.autoOff(this.map.objects, [
          'ochange_n_' + this.map.objects.toContiguous(this.get('id'), 0, 0, 0),
          'update',
        ])

        this.autoOff(this.map.byPassable, {})
        this.autoOff(this.map.bySpot, {})
      },

      '+_calculate': function (res) {
        Common.off(this._off)
        // 'terrain' - cannot build due to terrain type, 'ship' - due to spot already occupied by a ship, 'movable' - by an object that can be moved away (like a hero on ship), 'impassable' - by immovable object, 'able' - can build.
        _.extend(res, {x: null, y: null, z: null, value: 'terrain'})
        var potential = []
        var spot = this.map.actionableSpot(this.get('id'))
        // Determined empirically.
        switch (this.map.objects.atCoords(this.get('id'), 0, 0, 'type', 0)) {
          case this.rules.constants.object.type.town:
            potential.push([spot[0] - 1, spot[1] + 2, spot[2]])
            potential.push([spot[0] + 1, spot[1] + 2, spot[2]])
            break
          case this.rules.constants.object.type.other:  // must be a Shipyard
            potential.push([spot[0] - 2, spot[1], spot[2]])
            potential.push([spot[0] + 2, spot[1], spot[2]])
            potential.push([spot[0] - 2, spot[1] + 1, spot[2]])
            potential.push([spot[0] + 2, spot[1] + 1, spot[2]])
            potential.push([spot[0] - 2, spot[1] - 1, spot[2]])
            potential.push([spot[0] + 2, spot[1] - 1, spot[2]])
        }
        potential.some(function (spot) {
          if (spot[0] >= 0 && spot[0] < this.map.get('width') &&
              spot[1] >= 0 && spot[1] < this.map.get('height')) {
            this._off.push([this.map.byPassable, this.map.byPassable.on('ochange_p_' + this.map.byPassable.propertyIndex('type'), 'update', this)])
            // SoD seems to remember Shipyard's build spot when starting a new game (even save/load doesn't change it) based on impassable (including actionable) spots nearby. For example, place Shipwreck Survivor, then encounter it (it'll disappear) then visit Shipyard - it will continue to offer the old spot as if the Survivor still existed.
            //
            // Moreover, there is a bug: place 5 Survivors around the Shipyard (in potential ship building spots), then build a ship, board it and try building another ship - the game will allow doing so, creating a duplicate ship underneath (it will appear once you sail away from the Shipyard).
            //
            // We are not replicating these quirks.
            if (this.map.byPassable.atCoords(spot[0], spot[1], spot[2], 'type', 0) === this.map.constants.passable.type.water) {
              res.value = 'impassable'
              _.extend(res, _.object(['x', 'y', 'z'], spot))
              var n = this.map.bySpot.toContiguous(spot[0], spot[1], spot[2], 0)
              this._off.push([this.map.bySpot, this.map.bySpot.on('oadd_n_' + n, 'update', this)])
              this._off.push([this.map.bySpot, this.map.bySpot.on('ochange_n_' + n, 'update', this)])
              this._off.push([this.map.bySpot, this.map.bySpot.on('oremove_n_' + n, 'update', this)])
              var movable
              var immovable
              this.map.bySpot.findAtContiguous(n, function ($1, $2, $3, $4, l) {
                if (this.map.bySpot.atContiguous(n + this.map.bySpot.propertyIndex('actionable'), l) !== false) {
                  if (this.map.bySpot.atContiguous(n + this.map.bySpot.propertyIndex('type'), l) === this.rules.constants.object.type.boat) {
                    return res.value = 'ship'
                  } else if (this.rules.classes.atCoords(this.map.objects.atCoords(this.map.bySpot.atContiguous(n + this.map.bySpot.propertyIndex('id'), l), 0, 0, 'class', 0), 0, 0, 'ownable', 0) == this.rules.constants.class.ownable.movable) {
                    movable = true
                  } else {
                    immovable = true
                  }
                }
              }, this)
              if (res.value == 'ship') {
                return true
              } else if (!immovable) {
                return res.value = movable ? 'movable' : 'able'
              }
            }
          }
        }, this)
      },
    },
  })

  // Determines if a building can be or has been built at a certain town. Used by townscape's Hall screen. Provides detailed state of various construction prerequisites (cost, type of town and terrain, etc.).
  Rules.TownBuildingState = Calculator.extend('HeroWO.H3.Rules.TownBuildingState', {
    delayRender: false,
    _keyOptions: ['building', 'ignoreCanBuild'],
    _buildings: null,
    _canBuild: null,
    _canBuildThis: null,
    _canBuildThisReq: null,
    _cost: {},
    _info: null,
    _capitols: null,
    _ship: null,

    //> player null don't check resource <> cost`, `@ObjectRepresentation`@
    //> id int
    //> building int
    //> ignoreCanBuild true do not check this flag (town-wise)`, false
    //
    // Options set upon `'update:
    //> canBuild false if unable due to this flag (town-wise)`, true always if
    //  `'ignoreCanBuild is set
    //> resource array of Resource->$id which the player doesn't have enough
    //> require array of Building->$id which `'id doesn't have
    //> upgraded true if is 'built' because of an improved version already erected
    //> townType false if unable due to `'id class not supporting `'building`, true
    //> special false if unable due to custom `'building-specific requirements`, 0 if to building-specific `'town_canBuild`, true
    _opt: {
      //player: null,   // do not change after attach()
      //id: 0,    // do not change after attach()
      building: 0,    // do not change after attach()
      ignoreCanBuild: false,    // do not change after attach()

      canBuild: false,
      resource: [],
      require: [],
      upgraded: false,
      townType: false,
      special: false,
    },

    events: {
      attach: function () {
        this._canBuildThisReq = new Map

        this._buildings = this.updateOn(['change_value', 'change_built'], Rules.TownBuildingsWithUpgraded, {
          id: this.get('id'),
        })

        if (!this.get('ignoreCanBuild')) {
          this._canBuild = this.updateOn(Calculator.Effect.GenericNumber, {
            target: this.map.constants.effect.target.town_hasBuilt,
            ifObject: this.get('id'),
          })
        }

        this._canBuildThis = this.updateOn(Calculator.Effect.GenericBool, {
          target: this.map.constants.effect.target.town_canBuild,
          ifObject: this.get('id'),
          ifBuilding: this.get('building'),
        })

        if (this.get('player')) {
          _.each(this.rules.constants.resources, function (res, name) {
            this.autoOff(this.get('player'), ['change_resources_' + name, 'update'])

            this._cost[name] = this.updateOn(Calculator.Effect.GenericNumber, {
              target: this.map.constants.effect.target.town_buildingCost,
              ifObject: this.get('id'),
              ifBuilding: this.get('building'),
              ifResource: res,
            })
          }, this)
        }

        this._info = this._shared.atter(this.get('building'), 0, 0, 0)

        switch (this.get('building')) {
          case this.rules.buildingsID.capitol:
            var ownerIndex = this.map.objects.propertyIndex('owner')
            var nObject = this.map.objects.toContiguous(this.get('id'), 0, 0, 0)
            this.autoOff(this.map.objects, ['ochange_n_' + nObject, function ($1, $2, prop) {
              prop == ownerIndex && this.update()
            }])
            break

          case this.rules.buildingsID.shipyard:
            this._ship = this.updateOn(Rules.ShipState, {
              id: this.get('id'),
            })
            break
        }

        this.autoOff(this.map.objects, ['ochange_p_' + this.map.objects.propertyIndex('subclass'), 'update'])
      },

      '+_initShared': function (res) {
        res.atter = this.rules.buildings.atter(['require', 'town'])
        res.impassableIndex = this.map.byPassable.propertyIndex('impassable')
        res.typeIndex = this.map.byPassable.propertyIndex('type')
      },

      '+_calculate': function (res) {
        res.canBuild = this.get('ignoreCanBuild') || this._canBuild.get('value') > 0
        res.require = _.difference(this._info.require || [], this._buildings.get('value'))
        var subclass = this.map.objects.atCoords(this.get('id'), 0, 0, 'subclass', 0)
        res.townType = this._info.town === false || _.includes(this._info.town, subclass)
        res.special = !!this._specialMet()

        // Message priority in SoD is this: first building-specific requirements, then disabled flag in the map. Tested by disabling Shipyard in a town that is not near water - the game shows the "near water" message.
        if (res.special) {
          if (!this._canBuildThis.get('value')) {
            res.special = 0
          } else {
            function disabledRequired(id) {
              var calc = this._canBuildThisReq.get(id)
              if (!calc) {
                calc = this.cx.listeningEffectCalculator({
                  class: Calculator.Effect.GenericBool,
                  target: this.map.constants.effect.target.town_canBuild,
                  ifObject: this.get('id'),
                  ifBuilding: id,
                })
                this.autoOff(calc, {change_value: 'update'})
                this._canBuildThisReq.set(id, calc)
              }
              return !calc.get('value') || (this.rules.buildings.atCoords(id, 0, 0, 'require', 0) || []).some(disabledRequired, this)
            }

            if (res.require.some(disabledRequired, this)) {
              res.special = 0
            }
          }
        }

        res.resource = []

        if (this.get('player')) {
          _.each(this.rules.constants.resources, function (id, name) {
            if (this.get('player').get('resources_' + name) < this._cost[name].get('value')) {
              res.resource.push(id)
            }
          }, this)
        }

        res.upgraded = false
        if (_.includes(this._buildings.get('value'), this.get('building'))) {
          res.upgraded = !_.includes(this._buildings.get('built'), this.get('building'))
          res.value = 'built'
        } else if (!res.canBuild || res.resource.length || res.require.length ||
                   !res.townType || !res.special) {
          res.value = 'unable'
        } else {
          res.value = 'able'
        }
      },
    },

    _specialMet: function () {
      var building = this.get('building')

      switch (building) {
        default:
          return true

        case this.rules.buildingsID.capitol:
          var owner = this.map.players.nested(this.map.objects.atCoords(this.get('id'), 0, 0, 'owner', 0))
          if (this._capitols && this._capitols.get('player') != owner) {
            this.autoOff(this._capitols)
            this._capitols = null
          }
          if (!this._capitols) {
            this._capitols = this.cx.calculator(Rules.PlayerBuildingCount, {
              player: owner,
              buildings: [this.rules.buildingsID.capitol],
            })
            this.autoOff(this._capitols, {change_value: 'update'})
          }
          return !this._capitols.get('value')

        case this.rules.buildingsID.shipyard:
          return this._ship.get('value') != 'terrain' && this._ship.get('value') != 'impassable'
      }
    },
  }, {shared: {}})

  // Provides index of the building in the given array erected in a town.
  //
  // Used to determine the "level" of Hall (Fort) which has 3 (2) upgraded forms.
  Rules.TownBuildingLevel = Calculator.extend('HeroWO.H3.Rules.TownBuildingLevel', {
    delayRender: false,
    _keyOptions: ['buildings'],
    _calc: null,

    _opt: {
      //id: 0,    // do not change after attach()
      // array of Building->$id; i is expected a single town has either 0 or 1
      // of these
      buildings: [],  // do not set
    },

    events: {
      attach: function () {
        this._calc = this.updateOn(Calculator.Effect.GenericIntArray, {
          target: this.map.constants.effect.target.town_buildings,
          ifObject: this.get('id'),
        })
      },

      '+_calculate': function (res) {
        var have = this._calc.get('value')
        res.value = _.findIndex(this.get('buildings'), function (building) {
          return _.includes(have, building)
        })
      },
    },
  })

  // Provides databank property for a building from the given array erected in a town.
  //
  // For example, title of the Hall screen is based on the type of Hall building (one of four) in that town.
  Rules.TownBuildingProperty = Rules.TownBuildingLevel.extend('HeroWO.H3.Rules.TownBuildingProperty', {
    _keyOptions: ['property'],

    _opt: {
      property: 'name',
    },

    events: {
      '+_calculate': function (res) {
        res.value = res.value == -1 ? null
          : this.rules.buildings.atCoords(this.get('buildings')[res.value], 0, 0, this.get('property'), 0)
      },
    },
  })

  // Determines which property of a building should be used, for properties depending on the state of another building being erected in a town.
  //
  // For example, Griffin Bastion uses two different description texts depending if the town has the upgraded Griffin Tower.
  Rules.BuildingU = Calculator.extend('HeroWO.H3.Rules.BuildingU', {
    delayRender: false,
    _keyOptions: ['building', 'type'],
    _calc: null,
    _regular: 0,
    _upgraded: 0,
    _ifU: null,

    _opt: {
      //id: 0,    // do not change after attach()
      building: 0,    // do not change after attach()
      // this calculator has no normalize_value; add one if type evaluates to
      // an array value
      type: 'description',    // do not change after attach()

      upgraded: false,
    },

    events: {
      attach: function () {
        this._regular = this.rules.buildings.propertyIndex(this.get('type'))
        this._upgraded = this.rules.buildings.propertyIndex(this.get('type') + 'U')
        this._ifU = this.rules.buildings.atCoords(this.get('building'), 0, 0, 'ifU', 0)

        if (this._ifU) {
          this._calc = this.updateOn(Calculator.Effect.GenericIntArray, {
            target: this.map.constants.effect.target.town_buildings,
            ifObject: this.get('id'),
          })
        }
      },

      '+_calculate': function (res) {
        res.upgraded = false
        if (this._ifU) {
          var have = this._calc.get('value')
          res.upgraded = this._ifU.some(function (building) {
            return _.includes(have, building)
          })
        }
        res.value = this.rules.buildings.atCoords(this.get('building'), 0, 0,
          res.upgraded ? this._upgraded : this._regular, 0)
      },
    },
  })

  // Determines which BuildingImage property of a building should be used based on other buildings' state and town's type.
  Rules.BuildingU.Image = Rules.BuildingU.extend('HeroWO.H3.Rules.BuildingU.Image', {
    _keyOptions: ['property'],

    _opt: {
      type: 'image',
      property: 'hallImage',   // BuildingImage property

      sub: null,
    },

    events: {
      '+normalize_value': function (res, value) {
        if (_.isArray(value)) {
          value = Common.normArrayCompare(value, this.get.bind(this, 'value'))
        }
        return value
      },

      attach: function () {
        // Subclasses virtually never change so it's more efficient than hooking
        // ochange_n_N.
        this.autoOff(this.map.objects, ['ochange_p_' + this.map.objects.propertyIndex('subclass'), 'update'])
      },

      '+_calculate': function (res) {
        res.sub = this.rules.buildings.readSub(this.get('type'), res.value)

        res.value = res.sub.atCoords(
          this.map.objects.atCoords(this.get('id'), 0, 0, 'subclass', 0),
          0, 0, this.get('property'), 0)
      },
    },
  })

  // Provides a building's description text suitable for a town. Used in construction confirmation dialog in Hall screen.
  //
  // For example, Blacksmith's description depends on the artifact it sells (Ballista, etc.).
  Rules.TownBuildingDescription = Calculator.extend('HeroWO.H3.Rules.TownBuildingDescription', {
    delayRender: false,
    _keyOptions: ['building'],
    _calc: null,

    _opt: {
      //id: 0,    // do not change after attach()
      building: 0,    // do not change after attach()
    },

    events: {
      attach: function () {
        this._calc = this.updateOn(Rules.BuildingU, {
          id: this.get('id'),
          building: this.get('building'),
        })

        this.autoOff(this.map.objects, ['ochange_p_' + this.map.objects.propertyIndex('subclass'), 'update'])
      },

      '+_initShared': function (res) {
        res.blacksmith = this.rules.buildingsID.blacksmith
        res.townTypesIndex = this.rules.buildings.propertyIndex('townTypes')
        res.subclassIndex = this.map.objects.propertyIndex('subclass')

        res.typeToDesc = _.object(
          [
            this.map.constants.building.blacksmith.ballista,
            this.map.constants.building.blacksmith.firstAidTent,
            this.map.constants.building.blacksmith.ammoCart,
          ],
          [
            this.rules.buildings.propertyIndex('descriptionB'),
            this.rules.buildings.propertyIndex('descriptionT'),
            this.rules.buildings.propertyIndex('descriptionA'),
          ]
        )
      },

      '+_calculate': function (res) {
        var building = this.get('building')

        switch (building) {
          case this._shared.blacksmith:
            var subclass = this.map.objects.atCoords(this.get('id'), 0, 0, this._shared.subclassIndex, 0)
            var types = this.rules.buildings.atCoords(this.get('building'), 0, 0, this._shared.townTypesIndex, 0)
            var prop = this._shared.typeToDesc[types[subclass]]
            res.value = this.rules.buildings.atCoords(this.get('building'), 0, 0, prop, 0)
            break

          default:
            res.value = this._calc.get('value')
        }
      },
    },
  }, {shared: {}})

  // Provides map of hall level => town count for the current player. For example, hall => 0, capitol => 1.
  //
  // Used in adventure map screen's bottom right corner's Kingdom overview panel.
  Rules.TownCountByHall = Calculator.extend('HeroWO.H3.Rules.TownCountByHall', {
    delayRender: false,
    _childEvents: ['change_value'],
    _calcs: [],

    _opt: {
      //player: null,    // do not change after attach()
    },

    events: {
      '+normalize_value': function (res, value) {
        return Common.normIntArrayCompare(value, this.get.bind(this, 'value'))
      },

      attach: function () {
        var add = function (child) {
          // We don't want to remove this if calc is removed so not using
          // updateOn(). Restricting =update to when calc is rendered
          // won't cause problems in this._update so not doing that either.
          var calc = this.cx.calculator(Rules.TownBuildingLevel, {
            id: child.get('id'),
            buildings: this._shared.buildings,
          })

          this.autoOff(calc, {
            change_value: 'update',
            unnest: function () {
              delete this._calcs[child.get('id')]
              this.update()
            },
          })

          this._calcs[child.get('id')] = calc
          this.update()
        }.bind(this)

        this.get('player').towns.each(add)

        this.autoOff(this.get('player').towns, {
          nestExNew: function (res) {
            add(res.child)
          },
        })
      },

      '+_initShared': function (res) {
        res.buildings = this.rules.hallBuildings
      },

      '.change_value': 'update',

      '+_calculate': function (res) {
        var counts = _.countBy(this._calcs, function (calc) {
          return 1 + calc.get('value')
        })
        // Ensure all buildings default to 0.
        res.value = _.extend(_.fill(this._shared.buildings, 0).concat(0), counts)
      },
    },
  }, {shared: {}})

  // Provides map of fort level => town count for the current player.
  Rules.TownCountByFort = Rules.TownCountByHall.extend('HeroWO.H3.Rules.TownCountByFort', {
    events: {
      '+_initShared': function (res) {
        res.buildings = this.rules.fortBuildings
      },
    },
  }, {shared: {}})

  // Provides data needed to populate townscape's Hall screen - list of buildings that can be erected, or have been in absence of upgraded forms.
  Rules.TownHallBuildings = Calculator.extend('HeroWO.H3.Rules.TownHallBuildings', {
    delayRender: false,
    _townIndex: null,
    _upgradeIndex: null,
    _calc: null,

    _opt: {
      //id: 0,    // do not change after attach()
    },

    events: {
      '+normalize_value': function (res, value) {
        return Common.normIntArrayCompare(value, this.get.bind(this, 'value'))
      },

      attach: function () {
        this._calc = this.updateOn(['change_value', 'change_built'], Rules.TownBuildingsWithUpgraded, {
          id: this.get('id'),
        })

        this._townIndex = this.rules.buildings.propertyIndex('town')
        this._upgradeIndex = this.rules.buildings.propertyIndex('upgrade')

        this.autoOff(this.map.objects, ['ochange_p_' + this.map.objects.propertyIndex('subclass'), 'update'])
      },

      '+_calculate': function (res) {
        var subclass = this.map.objects.atCoords(this.get('id'), 0, 0, 'subclass', 0)
        var built = this._calc.get('built')
        res.value = built.concat()

        this.rules.buildings.find(this._townIndex, function (towns, id, $1, $2, $3, n) {
          if (towns === false /*any can build*/ || towns.indexOf(subclass) != -1) {
            // Databank must have buildings in order of upgrades, i.e. upgraded
            // forms come later, so this works.
            if (!_.includes(this._calc.get('value'), id)) {
              var upg = this.rules.buildings.atContiguous(n - this._townIndex + this._upgradeIndex, 0)
              if (!upg) {
                // Add a lowest-level building.
                res.value.push(id)
              } else if (upg.every(function (b) { return _.includes(built, b) })) {
                // Add a building that upgrades buildings, all of which are immediately (not improved forms) constructed, and remove them from Hall.
                res.value = _.difference(res.value, upg).concat(id)
              }
            }
          }
        }, this)
      },
    },
  })

  // Provides list of buildings erected in a town together with their inferior (pre-upgrade) forms, recursively.
  //
  // For example, if a town has Mage Guild level 3 then this will list Mage Guilds of levels 1, 2 and 3.
  //
  // Note: value members go in arbitrary order and may contain duplicates.
  Rules.TownBuildingsWithUpgraded = Calculator.extend('HeroWO.H3.Rules.TownBuildingsWithUpgraded', {
    delayRender: false,
    _calc: null,

    _opt: {
      //id: 0,    // do not change after attach()

      built: [],
    },

    events: {
      '+normalize_value': function (res, value) {
        return Common.normIntArrayCompare(value, this.get.bind(this, 'value'))
      },

      '+normalize_built': function (res, value) {
        return Common.normIntArrayCompare(value, this.get.bind(this, 'built'))
      },

      attach: function () {
        this._calc = this.updateOn(Calculator.Effect.GenericIntArray, {
          target: this.map.constants.effect.target.town_buildings,
          ifObject: this.get('id'),
        })
      },

      '+_initShared': function (res) {
      },

      '+_calculate': function (res) {
        res.built = this._calc.get('value')
        res.value = this.constructor.calculateUsing(this.rules, res.built)
      },
    },
  }, {
    shared: {},

    calculateUsing: function (rules, built) {
      var upgradeIndex = rules.buildings.propertyIndex('upgrade')
      var res = []
      _.each(built, add)
      return res

      function add(id) {
        res.push(id)
        _.each(rules.buildings.atCoords(id, 0, 0, upgradeIndex, 0) || [], add)
      }
    },
  })

  // Provides list of buildings that offer creatures for hire. Used by townscape's Fort screen.
  Rules.ProducingBuildings = Calculator.extend('HeroWO.H3.Rules.ProducingBuildings', {
    delayRender: false,
    _col: null,

    _opt: {
      //id: 0,    // do not change after attach()
    },

    events: {
      '+normalize_value': function (res, value) {
        return Common.normIntObjectCompare(value, this.get.bind(this, 'value'))
      },

      attach: function () {
        this._col = new Effects.Collection({effects: this.map.effects})

        this._col.fuse('+readyMember', function (res, building) {
          res.calc = this.cx.listeningEffectCalculator({
            class: Calculator.Effect.GenericIntArray,
            target: this.map.constants.effect.target.hireAvailable,
            ifBonusObject: this.get('id'),
            ifBuilding: building,
          })
          res.off.push(res.calc, res.calc.on('change_value', 'update', this))
        }, this)

        var calc = this.cx.listeningEffectCalculator({
          class: Calculator.Effect.GenericIntArray,
          target: this.map.constants.effect.target.town_buildings,
          ifObject: this.get('id'),
        })

        this._col.bindCalculator(calc)
        this.autoOff(this._col, {change_list: 'update'})
      },

      '-unnest': function () {
        this._parent && this._col.remove()
      },

      '+_calculate': function (res) {
        // Keys can't duplicate because buildings can't have duplicates, but
        // creature IDs in values can (if two buildings produce the same creature), and they can duplicate even within the same building's value.
        // {bu1: [cr1, cr2, cr1], bu2: [cr1, cr2]}
        res.value = {}

        this._col.get('list').forEach(function (building) {
          var creatures = this._col.member(building).calc.get('value')
          creatures.length && (res.value[building] = creatures)
        }, this)
      },
    },
  })

  // Provides text displayed in construction confirmation dialog in Hall screen, detailing what/if the player is missing some prerequisites like resources or base buildings.
  Rules.TownBuildingRequirements = Calculator.extend('HeroWO.H3.Rules.TownBuildingRequirements', {
    delayRender: false,
    _keyOptions: ['building'],
    _buildings: null,
    _state: null,
    _required: null,

    _opt: {
      //id: 0,    // do not change after attach()
      building: 0,    // do not change after attach()

      required: [],
    },

    events: {
      '+normalize_required': function (res, value) {
        return Common.normIntArrayCompare(value, this.get.bind(this, 'required'))
      },

      attach: function () {
        this._buildings = this.updateOn(Rules.TownBuildingsWithUpgraded, {
          id: this.get('id'),
        })

        this._state = this.updateOn(['change_special'], Rules.TownBuildingState, {
          id: this.get('id'),
          building: this.get('building'),
          ignoreCanBuild: true,
        })

        this._required = this.rules.buildings.atCoords(this.get('building'), 0, 0, this._shared.requireIndex, 0) || []
      },

      '+_initShared': function (res) {
        res.requireIndex = this.rules.buildings.propertyIndex('require')
        res.nameIndex = this.rules.buildings.propertyIndex('name')
      },

      '+_calculate': function (res) {
        var building = this.get('building')

        // Keeps ID order of 'require'd buildings from the databank (which in turn uses
        // canonical SoD order).
        res.required = _.difference(this._required, this._buildings.get('value'))

        if (this._state.get('special') === 0) {
          res.value = this.cx.s('map', 'This town ' + (this.cx.get('classic') ? 'can not' : 'cannot') + ' build this structure')
        } else if (!this._state.get('special')) {
          switch (building) {
            case this.rules.buildingsID.capitol:
              res.value = this.cx.s('map', 'Cannot build more than one Capitol')
              break
            case this.rules.buildingsID.shipyard:
              res.value = this.cx.s('map', 'This town is not near water')
              break
          }
        } else if (res.required.length) {
          var names = res.required.map(function (id) {
            return this.rules.buildings.atCoords(id, 0, 0, this._shared.nameIndex, 0)
          }, this)
          // The client should use white-space: pre-wrap to preserve \n and
          // double space after comma.
          res.value = _.format(this.cx.s('map', 'Requires:\n%s'),
            names.join(this.cx.s('map', ',  ')))
        } else {
          res.value = this.cx.s('map', 'All prerequisites for this building have been met.')
        }
      },
    },
  }, {shared: {}})

  // Determines number of player's towns having at least one of the listed buildings. Used in determining trading rate in town's Marketplace.
  Rules.PlayerBuildingCount = Calculator.extend('HeroWO.H3.Rules.PlayerBuildingCount', {
    delayRender: false,
    _keyOptions: ['buildings', 'withUpgraded'],
    _col: null,

    _opt: {
      //player: null,    // do not change after attach()
      buildings: [],  // if a town has multiple, only one is counted
      withUpgraded: false,    // do not change after attach()
    },

    events: {
      attach: function () {
        this._col = new Effects.Collection({effects: this.map.effects})

        this._col.fuse('+readyMember', function (res, town) {
          if (this.get('withUpgraded')) {
            res.calc = this.cx.calculator(Rules.TownBuildingsWithUpgraded, {
              id: town,
            })
          } else {
            res.calc = this.cx.listeningEffectCalculator({
              class: Calculator.Effect.GenericIntArray,
              target: this.map.constants.effect.target.town_buildings,
              ifObject: town,
            })
          }
          res.off.push(res.calc, res.calc.whenRenders('change_value', Common.ef('update', this)))
        }, this)

        this.autoOff(this.get('player').towns, {
          nestExNew: function (res) {
            this._col.getSet(Common.concat(res.child.get('id')))
          },
          unnested: function (town) {
            this._col.evict(town.get('id'))
          },
        })

        this._col.set('list', this.get('player').towns.map(Common.p('get', 'id')))
      },

      '-unnest': function () {
        this._parent && this._col.remove()
      },

      '+_calculate': function (res) {
        res.value = 0

        this._col.get('list').forEach(function (town) {
          var have = this._col.member(town).calc.get('value')
          if (_.intersection(have, this.get('buildings')).length) {
            res.value++
          }
        }, this)
      },
    },
  })

  return Rules
})