define(['Common', 'Map', 'Calculator', 'Effects'], function (Common, HMap, Calculator, Effects) {
  "use strict"
  var _ = Common._

  var Combat = {}

  // Creates a new combat field, with obstacles, special creatures (Catapult, etc.), fortifications and so on. May also alter an existing combat (often used to add new creatures).
  Combat.Generator = Common.Sqimitive.extend('HeroWO.H3.Combat.Generator', {
    map: null,
    rules: null,
    // The object given to constructor or new Combat created by generate().
    combat: null,
    _obstaclesAtter: null,

    // Options given to constructor:
    //  `> map
    //  `> rules
    //  `> encounter - optional, see Combat _opt.encounter
    //  `> width
    //  `> height
    //  `> mapCoords
    //  `> combat `- if missing, call generate() to produce a new Combat, else call other methods (placeObjects(), etc.) to alter a running Combat
    //  `> parties `- order is important (attacker is first, defender is last)
    //     `> object ObjectRepresentation.OnMap reflecting AObject with $garrison (Hero, Town, etc.)`, null if the party doesn't correspond to any on-map object
    //     `> garrison mixed locator `- only if `'object is `'null; see Party _opt.garrison
    //     `> owner Player `- only if `'object is `'null
    //     `> placement `- values not supporting `'fortifications and `'formation:
    //        spread, random
    //     `> margin `- optional
    //     `> formation `- defaults to object->$formation
    //     `> fortifications `- array of Effect::fortification
    //     `> fortificationsTown `- only if fortifications is not empty; Town->$id
    //     `> tactics int `- cell count, 0 to disable tactics, if multiple parties
    //        has this they get turns in their order in parties[]
    // XXX++I tactics for distance from combat field edge (currently only implemented for distance from creature's original position)
    _opt: {
      width: 15,
      height: 11,
    },

    _initToOpt: {
      map: '.',
      rules: '.',
      combat: '.',
    },

    events: {
      init: function () {
        if (this.combat) {
          this.assignResp({
            width: this.combat.get('width'),
            height: this.combat.get('height'),
            mapCoords: _.pick(this.combat.get(), 'x', 'y', 'z', _.forceObject),
          })
        }
      },
    },

    // When creating a new combat (constructor was given no `'combat), nests a new object in map.combats and populates it with objects.
    //= object the created Combat, also available as `#combat property
    generate: function () {
      this._obstaclesAtter = this.rules.combatObstacles.atter([
        'countGroup', 'backgroundGroup',
        'image', 'imageType', 'passable',
        'offsetX', 'offsetY', 'x', 'y', 'width', 'height'])

      var combat = this.combat = this.map.combats.nest({
        encounter: this.get('encounter'),
        width: this.get('width'),
        height: this.get('height'),
        x: this.get('mapCoords').x,
        y: this.get('mapCoords').y,
        z: this.get('mapCoords').z,
      })

      _.each(this.get('parties'), function (party, i) {
        party = combat.parties.nest({
          fortifications: party.fortifications,
          placement: party.placement,
          tactics: party.tactics,
          garrison: party.garrison == null ? party.object.get('id') : party.garrison,
          object: party.object,
          player: party.owner || this.map.players.nested(party.object.get('owner') || 0 /*unownable - belongs to neutral*/),
          // Default to AObject->$formation in such a way that if it's const.spread then assume true (distribute evenly), if not then assume 1 (separate by 1 cell).
          formation: party.formation == null ? (party.object.get('formation') == this.rules.constants.object.formation.spread || 1) : party.formation,
          margin: party.margin,
        }, {pos: i})
        party.garrison = this.map.combats.provideGarrison(party.get('garrison')).take()
      }, this)

      var sieged = new Set
      combat.parties.each(function (party) {
        if ((party.get('fortifications') || []).length) {
          sieged.add(party.player.get('team'))
        }
      })

      var besiegers = new Set
      sieged.size && combat.parties.each(function (party) {
        if (!sieged.has(party.player.get('team'))) {
          besiegers.add(party)
        }
      })

      // XXX=C First Aid Tent's shadow is much more dark than in SoD. Check def2png.php?

      // x/y are not part of the Garrison schema but for correct placement they have to be passed to new Creature-s that Generator creates below.
      var positions = {}

      combat.parties.each(function (party, i) {
        var create = []
        var fortifications = party.get('fortifications') || []

        if (fortifications.length) {
          // XXX=RH to databank?
          var coords = {
            gate: [9, 5],
            lowerTower: [12, 10],
            lowerWall: [11, 10],
            middleTower: [14, 8],
            midLowerWall: [10, 7],
            midUpperWall: [10, 3],
            trench: [8, 0],
            upperTower: [11, 0],
            upperWall: [11, 1],
          }

          var town = _.indexOf(this.rules.townsID, this.get('parties')[i].fortificationsTown)
          var dedup = {}

          _.each(fortifications, function (id) {
            var name = _.indexOf(this.rules.constants.effect.fortification, id).replace(/\d+$/, '')
            dedup[name] = Math.max(_.has(dedup, name) ? dedup[name] : -1, id)
          }, this)

          _.each(dedup, function (id, name) {
            var fort = ['Fort', 'Citadel', 'Castle'][(_.indexOf(this.rules.constants.effect.fortification, id).match(/\d+$/) || [1]) - 1]

            var cr = {
              creature: this.rules.creaturesID[town + fort + Common.capitalize(name)],
              count: 1,
              maxCombats: 1,
              origin: [this.rules.constants.garrison.origin.fortification, id],
              x: coords[name][0],
              y: coords[name][1],
            }

            create.push(cr)
          }, this)

          var obstacles = []

          if (_.has(dedup, 'upperWall') && !_.has(dedup, 'middleTower')) {
            obstacles.push({
              countGroup: this.rules.constants.combatObstacle.countGroup.man1,
              backgroundGroups: [
                this.rules.constants.combatObstacle.backgroundGroup[town],
              ],
              min: 1,
              max: 1,
            })
          }

          if (_.has(dedup, 'trench')) {
            obstacles.push({
              // Expectedly missing for some town types.
              countGroup: this.rules.constants.combatObstacle.countGroup.mlip,
              backgroundGroups: [
                this.rules.constants.combatObstacle.backgroundGroup[town],
              ],
              min: 1,
              max: 1,
            })
          }

          if (_.has(dedup, 'upperWall') && !_.has(dedup, 'upperTower')) {
            obstacles.push({
              countGroup: this.rules.constants.combatObstacle.countGroup.tw2,
              backgroundGroups: [
                this.rules.constants.combatObstacle.backgroundGroup[town],
              ],
              min: 1,
              max: 1,
            })
          }

          if (_.has(dedup, 'lowerWall') && !_.has(dedup, 'lowerTower') &&
              this.rules.cx.get('classic')) {
            obstacles.push({
              countGroup: this.rules.constants.combatObstacle.countGroup.tw1,
              backgroundGroups: [
                this.rules.constants.combatObstacle.backgroundGroup[town],
              ],
              min: 1,
              max: 1,
            })
          }

          this.placeObstacles(obstacles)
        }

        if (party.object && party.object.isHero &&
            // Treat other placements as "surprise attack" (robbing a bank) and
            // don't create Ballista, etc.
            //
            // XXX add Generator constructor options to control this behaviour in detail
            party.get('placement').match(/^[tb]?[lr]?$/)) {
          this.map.objects.readSubAtCoords(party.object.get('id'), 0, 0, 'artifacts', 0)
            .find('artifact', function (art, slot) {
              if (slot < this.rules.artifactSlotsID.backpack) {
                var cr = this.rules.artifacts.atCoords(art, 0, 0, 'combat', 0)
              }

              // XXX=RH artifact ID
              if (cr && cr.creature == this.rules.creaturesID.catapult && !besiegers.has(party)) {
                cr = null   // don't create Catapults when can't bombard anything
              }

              if (cr) {
                cr = _.extend({
                  maxCombats: 1,
                  origin: [this.rules.constants.garrison.origin.artifact, art],
                }, cr)

                if (typeof cr.x == 'number') {
                  switch (party.get('placement')) {
                    case 'b':
                      cr.y = this.combat.get('height') - 1
                    case 't':
                      break
                    case 'r':
                      cr.y = cr.x
                      cr.x = this.combat.get('width') - 1
                      break
                    case 'l':
                      cr.y = cr.x
                      cr.x = 0
                      break
                    default:
                      cr.x = null
                  }
                }

                create.push(cr)
              }
            }, this)
        }

        // Create artifacts before regular creatures because Ballista, Catapult and First Aid Tent take up 1 cell logically but 2 cells visually (1 cell is artificially shifted off the field). As such, they should not be moved to another spot if their original spot is occupied by a regular creature.
        positions[party._parentKey] = {}
        _.each(create, function (creature) {
          var n = party.garrison.append(creature)[0]
          var id = party.garrison.fromContiguous(n).x
          positions[party._parentKey][id] = _.pick(creature, 'x', 'y', _.forceObject)
        })
      }, this)

      // We place objects in multiple passes:
      // 1. First obstacles with specific positions, including fortifications
      // 2. Then creatures with specific positions (fortifications, artifacts)
      // 3. Then creatures with any position
      // 4. Then obstacles with any position
      var unplaced = []

      combat.parties.each(function (party) {
        var ids = []
        party.garrison.find(0, function ($1, id) { ids.push(id) })
        var res = this._makePartyCreatures(party, ids, positions[party._parentKey])
        unplaced.push([party, res[0]])

        // combat.queue is updated by Rules, not Generator, since it depends
        // on Effects and other aspects of state.
      }, this)

      _.each(unplaced, function (item) {
        this.placeObjects(item[1], item[0].get())
      }, this)

      var bk = this.determineBackground()
      combat.set('background', bk._n)

      var sub = this.rules.combatBackgrounds.readSubAtContiguous(bk._n +
        this.rules.combatBackgrounds.propertyIndex('obstacles'), 0)
      var atter = sub.atter(['countGroup', 'backgroundGroups', 'min', 'max'])
      var groups = []
      sub.find(0, function ($1, $2, $3, $4, $5, n) { groups.push(atter(n, 0)) })
      this.placeObstacles(groups)

      return combat
    },

    // Places new Creature-s onto an existing Combat field.
    //> party Combat.Party
    //> creatures array of array/object in Garrison format
    //= array of Creature that had fixed and yet unoccupied coordinates
    addCreatures: function (party, creatures) {
      var ids = _.map(creatures, function (creature) {
        var n = party.garrison.append(creature)[0]
        return party.garrison.fromContiguous(n).x
      }, this)

      var res = this._makePartyCreatures(party, ids, {})
      this.placeObjects(res[0], party.get())
      return res[1]
    },

    _makePartyCreatures: function (party, ids, positions) {
      var placed = []
      var unplaced = []
      var atCreature = this.rules.creatures.atter(['width', 'height', 'passable', 'special'])

      _.each(ids, function (id) {
        var creature = new HMap.Combat.Creature({
          objects: party.garrison,
          id: id,
          n: party.garrison.toContiguous(id, 0, 0, 0),
          party: party,
          // See _hookCombatCreature().
          random: _.random(Math.pow(2, 7) - 1),
        })

        creature.attach()

        var props = atCreature(creature.get('creature'), 0, 0, 0)
        _.extend(props, positions[id])
        props.width = props.width || 1    // databank defaults; XXX=R: ddd: why do we need them? just put 1 into databank (also check other similar places)
        props.height = props.height || 1
        props.passable = props.passable || _.repeat('0', props.width * props.height)
        creature.assignResp(props)

        if (creature.get('x') != null && !this.isOccupied(creature.get('x'), creature.get('y'), creature.get('width'), creature.get('height'), creature.get('passable'))) {
          creature.set('original', [creature.get('x'), creature.get('y')])
          placed.push(this.combat.objects.nest(creature))
          this._setFacing(creature, party.get())
        } else {
          unplaced.push(creature)
        }
      }, this)

      return [unplaced, placed]
    },

    // Places new objects or creatures onto an existing Combat field.
    //
    //> creatures object `- Sqimitives with width, height, passable
    //> options
    //  `> placement `- 4 sides (t b l r) and 4 corners (tl tr bl br),
    //     corners, middle, spread, random
    //  `> margin `- when `'placement is `'random: distance from map boundaries
    //     that is never occupied
    //  `> formation `- allowed per `'placement:
    //     `> T B L R `- int distance between objects, true make it even
    //     `> TL TR BL BR corners `- int distance
    //     `> middle `- int distance
    //     `> spread random `- ignored
    //
    // Order of creatures is respected. `'formation adds gaps, then creatures
    // are centered according to `'placement (if applicable) and added on empty
    // spots. If a spot is impassable, puts creature anywhere nearby.
    //
    // This function is very limited: it checks passability when determining if
    // a cell is occupied but when calculating distance between members of
    // creatures it assumes the creature is a rectangle (width*height) which may
    // result in superfluous gaps.
    //
    // XXX+C review and make more in line with SoD
    placeObjects: function (creatures, options) {
      var self = this

      function nest(creature, xy) {
        xy.original = [xy.x, xy.y]
        creature.assignResp(xy)
        self.combat.objects.nest(creature)  // update bySpot
        if (creature instanceof HMap.Combat.Creature) {
          self._setFacing(creature, options)
        }
      }

      function placeStraight(widthName, heightName, xName, yName, y) {
        //X:  0 1 2 3 4 5 6 7 8 9    width = 10
        //  /_/_/_/_/_/_/_/_/_/_/    formation = spread
        //  \_\_\C\_\_\C\_\_\C\_\_   creatures.length = 3
        // step = floor(10 / 3) = 3  x = round((10 - 3 * (3-1) - 1) / 2) = 1.5
        //
        //  /_/_/_/_/_/C/_/_/_/_/    length = 1   step = 10   x = 4.5
        //  \_\_\C\_\_\_\_\C\_\_\_   length = 2   step = 5    x = 2
        var step = options.formation === true
          ? Math.floor(self.get(widthName) / creatures.length)
          : options.formation + 1
        var x = Math.round((self.get(widthName) - step * (creatures.length - 1) - 1) / 2)
        _.each(creatures, function (creature) {
          var unoc = self.findUnoccupied(
            xName == 'x' ? x : y,
            xName == 'x' ? y : x,
            creature.get('width'),
            creature.get('height'),
            creature.get('passable')
          )
          if (!unoc) {
            throw new Error('No room for placing a creature.')
          }
          nest(creature, _.object(['x', 'y'], unoc))
          x += step
        })
      }

      function placeInCorner(widthName, heightName, xName, yName,
          sx, sy, ex, ey, dx, dy) {
        //TL ___________      1 = (0;0)
        //  /1/2/4/7/_/_      2 = (1;0)  3 = (0;1)
        //  \3\5\8\_\_\_      4 = (2;0)  5 = (1;1)  6 = (0;2)
        //  /6/9/_/_/_/_      7 = (3;0)  8 = (2;1)  9 = (1;2)  10 = (0;3)
        var x = sx
        var y = sy
        _.each(creatures, function (creature) {
          var unoc = self.findUnoccupied(
            xName == 'x' ? x : y,
            xName == 'x' ? y : x,
            creature.get('width'),
            creature.get('height'),
            creature.get('passable')
          )
          if (!unoc) {
            throw new Error('No room for placing a creature.')
          }
          nest(creature, _.object(['x', 'y'], unoc))
          if (x != ex) {
            x -= (options.formation + 1) * dx
            y += (options.formation + 1) * dy * creature.get(heightName)
          } else if (y == ey) {
            //  ______    We have filled 1/2 of the map. We could go ahead
            // /x/x/x/    trying to fill the remaining half but for simplicity
            // \x\x\ \    bailing out now.
            // /!/_/_/
            throw new Error('No room for placing a creature.')
          } else {
            x = y + (options.formation + 1) * dy * creature.get(widthName)
            y = sy
          }
        })
      }

      function placeInCorner_tl() {
        return placeInCorner('width', 'height', 'x', 'y',
          0, 0, 0, h, +1, +1)
      }

      function placeInCorner_tr() {
        return placeInCorner('width', 'height', 'x', 'y',
          w, 0, w, h, -1, +1)
      }

      function placeInCorner_bl() {
        //  /4/8/_/_/_/_
        //  \2\5\9\_\_\_
        //  /1/3/6/0/_/_
        return placeInCorner('width', 'height', 'x', 'y',
          0, h, 0, 0, +1, -1)
      }

      function placeInCorner_br() {
        //  _/_/_/_/8/4/
        //  _\_\_\9\5\2\
        //  _/_/0/6/3/1/
        return placeInCorner('width', 'height', 'x', 'y',
          w, h, 0, h, -1, -1)
      }

      var w = this.get('width') - 1
      var h = this.get('height') - 1

      switch (options.placement) {
        default:
          throw new Error('Invalid placement mode.')

        case 't':
          return placeStraight('width', 'height', 'x', 'y', 0)
        case 'b':
          return placeStraight('width', 'height', 'x', 'y', h)
        case 'l':
          return placeStraight('height', 'width', 'y', 'x', 0)
        case 'r':
          return placeStraight('height', 'width', 'y', 'x', w)

        case 'tl':
          return placeInCorner_tl()
        case 'tr':
          return placeInCorner_tr()
        case 'bl':
          return placeInCorner_bl()
        case 'br':
          return placeInCorner_br()

        case 'corners':
          //  ________
          // /1/5/ /2/
          // \ \ \ \ \
          // /4/_/_/3/
          var corners = [[], [], []]
          _.each(corners, function (array) {
            for (var i = 0; i < creatures.length; i += 4) {
              array.push(creatures.splice(i, 1)[0])
            }
          })
          corners.push(creatures)
          _.each(corners, function (array, i) {
            creatures = array
            switch (i) {
              case 0:   return placeInCorner_tl()
              case 1:   return placeInCorner_tr()
              case 2:   return placeInCorner_bl()
              case 3:   return placeInCorner_br()
            }
          })
          return

        case 'middle':
          // This algorithm matches the one used by findUnoccupied() when target
          // cell is occupied.
          _.each(creatures, function (creature) {
            // XXX=I options.formation
            var unoc = self.findUnoccupied(
              w >>> 1,
              h >>> 1,
              creature.get('width'),
              creature.get('height'),
              creature.get('passable')
            )
            if (!unoc) {
              throw new Error('No room for placing a creature.')
            }
            nest(creature, _.object(['x', 'y'], unoc))
          })
          return

        case 'spread':
          //  /_/C/_/C/_/C/_/_/    8x2    creatures.length = 5
          //  \_\_\C\_\_\_\C\_\_   5/2=2.5  8/3=2  8/2=4
          var rowLength = Math.ceil(creatures.length / this.get('height'))
          var yStep = Math.floor(this.get('height') / Math.ceil(creatures.length / rowLength))
          var y = Math.round(yStep / 2)
          options.formation = true
          _.chunk(creatures, rowLength).forEach(function (chunk) {
            creatures = chunk
            placeStraight('width', 'height', 'x', 'y', y)
            y += yStep
          })
          return

        case 'random':
          var margin = options.margin || 0
          var pool = []
          for (var y = this.get('height') - margin; y-- > margin; ) {
            for (var x = this.get('width') - margin; x-- > margin; ) {
              pool.push([x, y])
            }
          }
          _.each(creatures, function (creature) {
            var thisPool = pool.concat()
            while (thisPool.length) {
              var item = thisPool.splice(_.random(thisPool.length - 1), 1)[0]
              if (item[0] + creature.get('width') > this.get('width') - margin ||
                  item[1] + creature.get('height') > this.get('height') - margin) {
                continue
              }
              var oc = self.isOccupied(
                item[0],
                item[1],
                creature.get('width'),
                creature.get('height'),
                creature.get('passable')
              )
              if (oc === false) {
                return nest(creature, _.object(['x', 'y'], item))
              }
            }
            if (!options.skipRoom) {
              throw new Error('No room for placing a creature.')
            }
          }, this)
          return
      }
    },

    _setFacing: function (creature, options) {
      switch (options.placement) {
        case 'r':
        case 'tr':
        case 'br':
          creature.set('facing', true)
          break
        case 'corners':
          //  ______     ______
          // /</ /</    />/ /</
          // \ \ \ \    \ \ \ \
          // /</_/</    />/_/</
          // classic    HeroWO
          creature.set('facing', this.rules.cx.get('classic')
            ? true : creature.get('x') > this.get('width') / 2)
          break
        case 'middle':
          //  __________     __________
          // / / / / / /    / / / / / /
          // \ \>\>\>\ \    \ \<\>\>\ \
          // / />/>/>/ /    / /</>/>/ /
          // \ \>\>\>\ \    \ \<\>\>\ \
          // /_/_/_/_/_/    /_/_/_/_/_/
          //   classic         HeroWO
          creature.set('facing', this.rules.cx.get('classic')
            ? false : creature.get('x') < this.get('width') / 2)
          break
        case 'spread':
        case 'random':
          creature.set('facing', !_.random(1))
      }
    },

    // Returns the closest spot to the desired position where the object will fit.
    //= array [x, y]`, null if no spot found on entire field
    findUnoccupied: function (x, y, width, height, passable) {
      var queue = [[x, y]]
      var tested = []
      var fieldWidth = this.get('width')
      var nMax = this.get('height') * fieldWidth

      function push(dx, dy) {
        var nx = qx + dx
        var ny = qy + dy
        var n = nx + ny * fieldWidth
        if (n >= 0 && n < nMax && !tested[n]) {
          tested[n] = true
          queue.push([nx, ny])
        }
      }

      while (queue.length) {
        var item = queue.shift()
        var qx = item[0]
        var qy = item[1]

        if (this.isOccupied(qx, qy, width, height, passable) === false) {
          return [qx, qy]
        }

        //   __________
        //  /_/_/0/_/_/
        //  \_\9\2\6\_\
        //  /_/5/1/3/_/
        //  \_\8\4\7\_\
        //  /_/_/_/_/_/
        //push(0, 0)    - have just tested this one
        push(-1, 0)
        push(+1, 0)
        push(0, -1)
        push(0, +1)
        push(-1, -1)
        push(-1, +1)
        push(+1, -1)
        push(+1, +1)
      }
    },

    // Checks if the object would overlap others when placed onto `'x/`'y.
    //= undefined out of bounds`, false not occupied`, true occupied
    isOccupied: function (x, y, width, height, passable) {
      if (x >= 0 &&
          y >= 0 &&
          x + width <= this._opt.width &&
          y + height <= this._opt.height) {
        var on = 0
        for (; width--; x++) {
          for (var h = height; h--; y++) {
            if (passable[on++] == '0' && this.combat.bySpot.anyAtCoords(x, y, 0)) {
              return true
            }
          }
        }
        return false
      }
    },

    // Returns a CombatBackground store object which fits best the Combat's environment (e.g. terrain).
    determineBackground: function () {
      var sorted = []
      var prio = this.rules.combatBackgrounds.propertyIndex('priority')

      this.rules.combatBackgrounds.find(prio, function (p, $2, $3, $4, $5, n) {
        sorted.push([p, n - prio])
      })

      sorted.sort(function (a, b) { return a[0] - b[0] })

      var atter = this.rules.combatBackgrounds.atter(['ifOn', 'ifNear',
        'ifNearDistance', 'ifVehicle', 'ifFortification', 'ifFortifications'])

      for (var item; item = sorted.pop(); ) {
        var bk = atter(item[1], 0)

        if (this.matchBackground(bk)) {
          return bk
        }
      }
    },

    // Checks if Combat and its environment satisfies conditions of the given CombatBackground (e.g. specific fortifications).
    matchBackground: function (bk) {
      var match = true
      var coords = this.combat.get()

      if (match) {
        var any = bk.ifFortification || []
        match = !any.length || this.combat.parties.some(function (party) {
          return _.intersection(any, party.get('fortifications') || []).length
        })
      }

      if (match) {
        var all = bk.ifFortifications || []
        match = !all.length || this.combat.parties.some(function (party) {
          return _.intersection(all, party.get('fortifications') || []).length == all.length
        })
      }

      if (match && bk.ifVehicle !== false) {
        match &= _.some(bk.ifVehicle, function (vehicle) {
          if (vehicle < 0) {
            // Assuming the "attacked party" is last in the party list.
            var obj = this.combat.parties.last().object
            return this.matchVehicle(~vehicle, obj)
          } else {
            return this.combat.parties.some(function (party) {
              return this.matchVehicle(vehicle, party.object)
            }, this)
          }
        }, this)
      }

      var classIndex = this.map.objects.propertyIndex('class')
      var subclassIndex = this.map.objects.propertyIndex('subclass')

      var includes = function (classes, objectID) {
        var cls = this.map.objects.atCoords(objectID, 0, 0, classIndex, 0)
        var sub

        for (var i = 0; i < classes.length; i += 2) {
          if (classes[i] == cls && (classes[i + 1] === false || classes[i + 1] == (sub == null ? sub = this.map.objects.atCoords(objectID, 0, 0, subclassIndex, 0) : sub))) {
            return true
          }
        }
      }.bind(this)

      if (match && bk.ifOn) {
        match &= this.map.bySpot.findAtCoords(coords.x, coords.y, coords.z, 'id',
          function (id, x, y, z, l) {
            if (includes(bk.ifOn, id)) {
              var passable = this.map.objects.atCoords(id, 0, 0, 'passable', 0)
              if (!passable || this.map.bySpot.atCoords(x, y, z, 'actionable', l) == this.rules.constants.spotObject.actionable.actionable) {
                return true
              }
            }
          }, this)
      }

      if (match && bk.ifNear) {
        // +--+--+--+-
        // |1 |1 |1 |1
        // +--+--+--+-    0 - matching ifNear if ifNearDistance >= 0
        // |1 |0 |0 |0    1 - ... >= 1
        // +--+--+--+-
        // |1 |0 |X |0    X - combat spot
        // +--+--+--+-    X - never matching ifNear
        // |1 |0 |0 |0
        var dist = bk.ifNearDistance + 1

        // SoD doesn't check passability of the object, checking distance
        // to its solid box. So do we.
        match &= this.map.bySpot.findWithinRect(
          Math.max(0, coords.x - dist),
          Math.max(0, coords.y - dist),
          coords.z,
          coords.x + dist,
          coords.y + dist,
          coords.z,
          'id',
          function (id, x, y) {
            if (x != coords.x && y != coords.y) {
              return includes(bk.ifNear, id)
            }
          },
          this
        )
      }

      return match
    },

    matchVehicle: function (vehicle, obj) {
      return obj && obj.isHero && obj.get('vehicle') == vehicle
    },

    // Attempts to place all requested new obstacle objects onto an existing Combat field. Desired position and count are specified by `'groups.
    //> groups array of CombatBackgroundObstacle store object
    placeObstacles: function (groups) {
      var atObs = this._obstaclesAtter
      var unplaced = []

      _.each(groups, function (gen) {
        var count = _.random(gen.min, gen.max)

        if (count) {
          var pool = []

          this.rules.combatObstacles.find(atObs.backgroundGroupIndex,
            function (group, $2, $3, $4, $5, n) {
              n -= atObs.backgroundGroupIndex
              if (gen.backgroundGroups.indexOf(group) != -1 &&
                  gen.countGroup == this.atContiguous(n + atObs.countGroupIndex, 0)) {
                pool.push(n)
              }
            })

          while (pool.length && count--) {
            var obstacle = new HMap.Combat.Object.Obstacle(atObs(_.sample(pool), 0))
            if (obstacle.get('x') === false) {
              unplaced.push(obstacle)
            } else if (!this.isOccupied(obstacle.get('x'), obstacle.get('y'), obstacle.get('width'), obstacle.get('height'), obstacle.get('passable'))) {
              obstacle.set('original', [obstacle.get('x'), obstacle.get('y')])
              this.combat.objects.nest(obstacle)
            }
          }
        }
      }, this)

      this.placeObjects(unplaced, {placement: 'random', skipRoom: true, margin: 2})
    },
  })

  // Internal collection used by Combat.State and StateAttackTargets to maintain Calculator-s of various combat features provided on-demand.
  var Calculators = Effects.Collection.extend({
    _classes: {},

    _opt: {
      context: null,
      // + Calculator options
    },

    events: {
      init: function (opt) {
        var targets = [
          'retreatCan',
          'surrenderCan',
          'creature_attackAndReturn',
          'creature_absolute',
          'creature_flying',
          'creature_regenerating',
          'creature_shootBlocked',
          'creature_spellImmune',
          'creature_canControl',
        ]

        targets.forEach(function (target) {
          this._classes[opt.context.map.constants.effect.target[target]] = Calculator.Effect.GenericBool
        }, this)

        this._classes[opt.context.map.constants.effect.target.creature_spells] = Calculator.Effect.GenericIntArray
      },

      '+readyMember': function (res, target) {
        target = this.get('context').map.constants.effect.target[target]
        var options = _.extend(this.get(), {
          shared: false,
          update: false,
          target: target,
          class: this._classes[target] || null,
        })
        res.calc = this.get('context').listeningEffectCalculator(options)
        res.calc.take()
        res.release.push(res.calc)
      },
    },
  })

  // Allows users of Combat.State (via state.attackTargets) to calculate damage, penalties and other combat values related to a particular enemy creature.
  var StateAttackTargets = Effects.Collection.extend({
    _opt: {
      state: null,
    },

    events: {
      '+readyMember': function (res, creature) {
        var state = this.get('state')
        res.calcs = new Calculators({context: state.cx, ifCombat: state.combat._parentKey, ifCombatCreature: creature})
      },
    },

    // Checks if State's creature can shoot at `'creature at all, with a penalty or with full strength.
    //= null if cannot shoot`, true if full strength`, false if far shot
    shotState: function (creature) {
      if (this.get('state').get('canShoot')) {
        // XXX=C currently assuming shoot penalty if distance (diagonal) is >= half of the combat field's width
        //
        // XXX+I check for obstacles/fortifications along the trajectory
        var distance = Math.max(Math.abs(this.get('state').get('creature').get('x') - creature.get('x')), Math.abs(this.get('state').get('creature').get('y') - creature.get('y')))
        return distance < this.get('state').combat.get('width') / 2
      }
    },

    // Checks if State's creature can shoot at `'creature and at which strength ratio.
    //= null if cannot shoot at `'creature`, float strength (1.0 = full)
    // Result is only an approximation; don't use it for final damage calculation
    // (use damageRange()).
    shootRate: function (creature) {
      var state = this.shotState(creature)
      if (state != null) {
        return state ? 1 : (this.append(creature._parentKey).calcs.append('creature_shootPenalty').calc.set('initial', 100).updateIfNeeded().get('value') / 100)
      }
    },

    // Checks if State's creature standing at `'fromSpot can damage `'creature, either by shot or melee.
    //
    //> melee true`, false shoot`, null first try shooting, then melee
    //= array [null/array path, bool if will shoot]
    //
    // fromSpot must not be out of bounds.
    //
    // Returned path is null if fromSpot is creature's current spot (no move needed), else it has at least length of 2 (when moving to adjacent cell). This can be both when shooting and melee.
    //
    // Can be used for any damageGroup.
    canDamage: function (creature, fromSpot, melee) {
      var state = this.get('state')

      if (state.get('creature').get('x') != fromSpot[0] ||
          state.get('creature').get('y') != fromSpot[1]) {
        var path = state.pathTo(fromSpot)
        if (!path) {
          return    // no route to attack spot
        }
      }

      if (!melee) {
        if (this.get('state').cx.get('classic') &&
            this.get('state').rules.creatures.atCoords(creature.get('creature'), 0, 0, 'damageGroup', 0)) {
          var shot = true
        } else {
          var shot = this.shotState(creature)  // can't hurl if no shots left
        }
      }

      if (shot == null) {
        if (melee === false) {
          return    // shooting requested but impossible
        }
        var box = state.get('creature').get()
        box.x = fromSpot[0]
        box.y = fromSpot[1]
        if (!state.findAdjacent(box, function (key) { return key == creature._parentKey })) {
          return    // melee attack, attack spot not adjacent to target creature
        }
      }

      return [path, shot]
    },

    // Calculates the precise damage State's creature will inflict onto `'creature.
    //
    //= null if unreachable`, array `[damageMin, damageMax, path, shot`] where `'path can be null if attacking from the spot the attacker is standing on, `'shot is null if melee or bool if shooting
    //
    // Resulting numbers are rounded down since SoD doesn't work with fractional damage.
    //
    // This doesn't check if creature is an enemy.
    //
    // Used for regular damageGroup.
    //
    // XXX=C formulae
    damageRange: function (creature, fromSpot, melee) {
      function reduceByCalc(calc, value) {
        var calc = state.calculate(calc).set('initial', value)
        return calc.updateIfNeeded().get('value')
      }

      var state = this.get('state')
      var canDamage = state.calculate('creature_strikes').updateIfNeeded().get('value') !== 0 &&
                      this.canDamage(creature, fromSpot, melee)

      if (!canDamage) {
        return
      }

      var factor = 0

      if (melee == null) {
        melee = canDamage[1] == null
      }

      if (!state.calculate('creature_absolute').updateIfNeeded().get('value')) {
        var member = this.append(creature._parentKey)

        var defense =
          (state.calculateEnemyHero('hero_defense') ? state.calculateEnemyHero('hero_defense').updateIfNeeded().get('value') : 0) +
          //(state._calcs.enemy_defense && state._calcs.enemy_defense.get('value')) +
          member.calcs.append('creature_defense').calc.updateIfNeeded().get('value')
        defense = reduceByCalc('creature_piercing', defense)

        factor += (
          state.calculateHero('hero_attack').updateIfNeeded().get('value') +
          state.calculate('creature_attack').updateIfNeeded().get('value') -
          defense
        ) / 100   // 1 point in attack skill = 1% damage increase
      }

      if (melee && canDamage[0]) {
        factor += (canDamage[0].length - 2) * state.calculate('creature_jousting').updateIfNeeded().get('value') / 100
      }

      factor = Math.max(0, 1 + factor)

      var min = state.calculate('creature_damageMin').updateIfNeeded().get('value') * state.get('creature').get('count') * factor
      var max = state.calculate('creature_damageMax').updateIfNeeded().get('value') * state.get('creature').get('count') * factor

      if (!melee) {
        if (!canDamage[1]) {
          min = reduceByCalc('creature_shootPenalty', min)
          max = reduceByCalc('creature_shootPenalty', max)
        } else {
          min = Math.floor(min)
          max = Math.floor(max)
        }
      } else {
        min = reduceByCalc('creature_meleePenalty', min)
        max = reduceByCalc('creature_meleePenalty', max)
      }

      return [Math.max(1, min), Math.max(1, max)].concat(canDamage)
    },
  })

  // Provides various helper properties and routines for waging a combat, from the perspective of a particular player.
  Combat.State = Common.Sqimitive.extend('HeroWO.H3.Combat.State', {
    mixIns: [Common.ContextModule],
    _owning: false,
    // As AI can initiate combats really early during Context render, State and related objects must not be delayed. This is generally correct anyway because they shouldn't rely on anything except Calculator-s.
    delayRender: false,
    combat: null,
    player: null,
    attackTargets: null,
    _pathFind: null,
    // XXX=R this calculator thing remains from pre-rewrite of Calc.Effect where Calc was much less flexible in terms of listen and update; it's likely that members of _calcs and calcs of attackTargets can be merged or have their options optimized (e.g. might not need to listen on WS server)
    _calcs: null,
    _heroCalcs: null,
    _enemyHeroCalcs: null,
    _creatureCalcs: null,

    _opt: {
      phase: null,    // null, tactics, combat
      interactive: null,   // if current player can do actions; null or Party
      enemy: null,  // Party, null if Party has no object; compared with this.player

      // Options below reflect current party (interactive above). They only make sense when interactive is set.
      // One player can
      // command multiple parties so interactive can have more than 2 unique values
      // (null and 1+ Party's). However, current implementation is suboptimal as
      // it recreates all calculators when party changes (works okay if one player has one party).

      creature: null, // from queue, only if 'interactive'

      canShoot: false,  // creature_shootBlocked + creature_shots
      pathCosts: null,   // if given as [] to constructor maintains pathfinding costs for all cells in the field as [n => path], missing = cannot reach; do not change
      pathCost: null, // current creature's PathCost instance; do not set

      forceCreature: null,    // overrides automatic _opt.interactive/creature
    },

    _initToOpt: {
      combat: '.',
      player: '.',
    },

    events: {
      init: function (opt) {
        this.attackTargets = new StateAttackTargets({state: this})
        this._heroCalcs = new Calculators({context: this.cx, ifCombat: this.combat._parentKey})
        this._enemyHeroCalcs = new Calculators({context: this.cx, ifCombat: this.combat._parentKey})
        this._creatureCalcs = new Calculators({context: this.cx, ifCombat: this.combat._parentKey})
      },

      attach: function () {
        var options = {cx: this}

        this.autoOff(this.map.players, {
          '.change': function (player, name) {
            // team is used by PathCost.Hex.
            name == 'team' && this.update()
          },
        })

        this.autoOff(this.combat.objects, {
          '.change': function (player, name) {
            // open is used by PathCost.Hex.
            name == 'open' && this._updatePathCosts()
          },
        })

        this.autoOff(this.combat, {
          change_state: Common.batchGuard(2, 'update', options),
          change_interactiveParty: Common.batchGuard(2, 'update', options),
          change_interactiveCreature: Common.batchGuard(2, 'update', options),
        })

        this.autoOff(this.combat.queue, {
          _repos: 'update',
        })

        // For pathCosts, canShoot.
        this.autoOff(this.combat.bySpot, {
          'oadd, oremove': Common.batchGuard(3, 'update', options),
          ochange: Common.batchGuard(5, 'update', options),
          'ochange, oadd, oremove': '_updatePathCosts',
        })

        this._pathFind = this.cx.makeHexPathFinder({
          mapWidth: this.combat.get('width'),
          mapHeight: this.combat.get('height'),
        })
      },

      change_forceCreature: 'update',

      _update: function () {
        this.combat.tc && this.combat.tc(this, 'begin _update')
        this.combat.tc && this.combat.tc(+1)

        this.batch(null, function () {
          if (this.combat.tc) {
            var mark = Common.Sqimitive.unique('csm')
            performance.mark('_update+' + mark)
            this.combat.tc(this, 'begin _update batch')
            this.combat.tc(+1)
          }

          var state = this.combat.get('state')
          var party = this.get('forceCreature') ? this.get('forceCreature').party : this.combat.get('interactiveParty')

          this.set('phase', state == 'tactics' ? state : state == 'turn' ? 'combat' : null)
          var int = this.get('forceCreature') || (this.get('phase') && party && party.player == this.player) ? party : null
          if (this.ifSet('interactive', int) && int) {
            this._heroCalcs.set('list', [])
            this._heroCalcs.set('ifCombatParty', party._parentKey)
          }
          // XXX In SoD there's always exactly 2 parties so determining which party's
          // stats affect whom is trivial. Not so in HeroWO since we allow arbitrary
          // combat configuration. Currently we take just the first enemy's stats.
          var enemy = this.combat.parties.find(function (party) {
            return party.player.get('team') != this.player.get('team') && party.object
          }, this)
          if (this.ifSet('enemy', enemy) && enemy) {
            this._enemyHeroCalcs.set('list', [])
            this._enemyHeroCalcs.set('ifCombatParty', enemy._parentKey)
          }
          var old = this.get('creature')
          this.set('creature', this.get('forceCreature') || (this.get('interactive') && this.combat.get('interactiveCreature')))
          this._updateCreature(this.get('creature'), old)

          if (this.combat.tc) {   // XXX=R duplicates in H3.Rules.RPC
            performance.mark('_update-' + mark)
            performance.measure('_update ' + mark, '_update+' + mark, '_update-' + mark)
            this.combat.tc(-1)
            var nothing = this._batches.length == 1 && !this._batches[0].length ? 'nothing!' : ''
            this.combat.tc(this, 'end _update batch, now firing: %s', nothing)

            nothing || this._batches.forEach(function (batch, i) {
              this.combat.tc(this, '  Batch %d', i)

              batch.forEach(function (event) {
                if (event[0] != 'change') {    // accompanied by change_OPT
                  this.combat.tc(this, '    %.s', event.join(' '))
                }
              }, this)
            }, this)
          }
        })

        this.combat.tc && this.combat.tc(-1)
        this.combat.tc && this.combat.tc(this, 'end _update')
      },

      '-unnest': function () {
        if (this._parent) {
          this._enemyHeroCalcs.remove()
          this._heroCalcs.remove()
          this._creatureCalcs.remove()
          this.set('pathCost', null)
          this._pathFind && this._pathFind.remove()
          this.attackTargets.remove()
        }
      },

      '+normalize_pathCosts': function (res, now) {
        return Common.normArrayCompare(now, this.get.bind(this, 'pathCosts'))
      },

      '+normalize_canShoot': Common.normBool,

      change_pathCost: function (now, old) {
        old && old.remove()
      },
    },

    // Can't do this in change_creature because need to do as part of _update's
    // batch().
    _updateCreature: function (now, old) {
      if (now == old /*|| !this._calcs.creature_meleePenalty /*not initialized*/) { return }

      old && this.autoOff(old)
      this._creatureCalcs.set('list', [])

      if (now) {
        this._creatureCalcs.set('ifCombatCreature', now._parentKey)

        if (!this._calcs) {
          this._calcs = {}

          this._calcs.creature_flying = this.cx.listeningEffectCalculator({
            class: Calculator.Effect.GenericBool,
            shared: false,
            target: this.map.constants.effect.target.creature_flying,
            ifCombat: this.combat._parentKey,
            ifCombatCreature: now._parentKey,
          })

          this._calcs.creature_moveDistance = this.cx.listeningEffectCalculator({
            shared: false,
            target: this.map.constants.effect.target.creature_moveDistance,
            ifCombat: this.combat._parentKey,
            ifCombatCreature: now._parentKey,
          })

          this._calcs.creature_shootBlocked = this.cx.listeningEffectCalculator({
            class: Calculator.Effect.GenericBool,
            shared: false,
            target: this.map.constants.effect.target.creature_shootBlocked,
            ifCombat: this.combat._parentKey,
            ifCombatCreature: now._parentKey,
          })

          _.each(this._calcs, function (calc) {
            this.autoOff(calc, {
              change_value: function () {
                this._calcsUpdating || this._updatePathCosts()
              },
            })
          }, this)
        } else {
          // Don't trigger _updatePathCosts() in response to iCC change, it will be called down the road in any case.
          this._calcsUpdating = true
          _.invoke(this._calcs, 'set', 'ifCombatCreature', now._parentKey)
          this._calcsUpdating = false
        }

        this.autoOff(now, {
          'change_width, change_height, change_original, change_x, change_y': '_updatePathCosts',
        })

        this.attackTargets.set('list', [])
        this._updatePathCosts()
      }
    },

    _updatePathCosts: function () {
      var now = this.get('creature')
      if (!now || !this._calcs /*not initialized*/) { return }

      this.combat.tc && this.combat.tc(this, 'begin update pathCosts : %s %s', now.get('creature'), this.rules.creatures.atCoords(now.get('creature'), 0, 0, 'namePlural', 0))
      this.combat.tc && this.combat.tc(+1)

      this.getSet('pathCosts', function (cur) {
        if (cur) {
          var n = this.combat.bySpot.toContiguous(this.combat.get('width') - 1, this.combat.get('height') - now.get('height'), 0, 0) + 1
          cur = Array(n)
          var from = this.get('phase') == 'tactics'
            ? [now.get('original')[0], now.get('original')[1], 0, this.combat.bySpot.toContiguous(now.get('original')[0], now.get('original')[1], 0, 0)]
            : [now.get('x'), now.get('y'), 0, this.combat.bySpot.toContiguous(now.get('x'), now.get('y'), 0, 0)]
          var maxCost = this.get('phase') == 'tactics'
            // Assuming 'tactics' cannot change.
            ? this.get('interactive').get('tactics')
            : this._calcs.creature_moveDistance.get('value')
          // XXX=R:mk: move to make...() factory on cx
          var coster = this.cx.makePathCostHex({
            combat: this.combat,
            creature: now,
          })
          this.set('pathCost', coster)
          for (var y = this.combat.get('height') - now.get('height') + 1; y--; ) {
            n -= now.get('width') - 1
            for (var x = this.combat.get('width') - now.get('width') + 1; x--; ) {
              var path = this.findPath(from, [x, y, 0, --n], maxCost)
              if (path) {
                cur[n] = path
              }
            }
          }
          return cur
        }
      })

      this.getSet('canShoot', function () {
        if (now.get('shots') > 0) {
          return this._calcs.creature_shootBlocked.get('value') ||
            !this.findAdjacent(this.get('creature').get(), function (key) {
              var obj = this.combat.objects.nested(key)
              return obj instanceof HMap.Combat.Creature &&
                     !this.rules.creatures.atCoords(obj.get('creature'), 0, 0, 'damageGroup', 0) &&
                     obj.party.player.get('team') != this.player.get('team')
            })
        }
      })

      this.combat.tc && this.combat.tc(-1)
      this.combat.tc && this.combat.tc(this, 'end update pathCosts')
    },

    // Calls `'func for every combat.objects `'x that is adjacent to `'creature, until `'func returns truthyness (that is returned by `#findAdjacent()).
    //
    // Can be used on any `'creature regardless to which creature this `'State is initialized.
    findAdjacent: function (creature, func) {
      return this.combat.walkImpassable(creature, function (o) {
        return _.some(this.neighboursOf(o.mx, o.my), function (neigh) {
          return this.combat.bySpot.findAtContiguous(neigh[3], func, this)
        }, this) || null
      }, this)
    },

    // Returns list of coordinates at the certain distance near the specified spot (which can be wider than 1 cell if `'width is used).
    //> depth int 1+
    //> exclude null/-1 don't exclude anything`, 0 exclude own box only, 1+
    //> width int`, falsy = 1
    //= hash n => [x, y]
    aroundDeep: function (x, y, depth, exclude, width) {
      function enqueue(x, y, width) {
        queue.push({x: x, y: y, z: 0, width: width, height: 1})
      }
      var queue = []
      enqueue(x, y, width || 1)
      var neigh = {}
      var res = {}
      exclude == null && (exclude = -1)

      while (depth-- > 0) {
        queue.splice(0).forEach(function (box) {
          // Not walkImpassable() since having gaps is probably undesired.
          this.map.walkObjectBox(box, 1, function (o) {
            var n = this.combat.bySpot.toContiguous(o.mx, o.my, 0, 0)
            var cur = neigh[n] = [o.mx, o.my]
            if (exclude < 0) {
              res[n] = cur
            }
            this.neighboursOf(o.mx, o.my).forEach(function (ns) {
              if (!neigh[ns[3]]) {
                var cur = neigh[ns[3]] = [ns[0], ns[1]]
                if (exclude <= 0) {
                  res[ns[3]] = cur
                }
                enqueue(ns[0], ns[1], 1)
              }
            })
          }, this)
        }, this)
        exclude--
      }

      return res
    },

    // Returns list of coordinates at the certain distance near the specified spot where a creature with `'ownSize `'width/`'height may step on, considering field's dimensions.
    //
    // Doesn't return out-of-bounds coords and coords near map edges
    // that the creature can't step on due to ownSize (but returns coords near x/y where ownSize doesn't fit due to T standing, as ':' in the second example below).
    //
    // Unlike aroundDeep() this returns array, not object.
    //
    //# Rationale
    // Since attacker must be adjacent to its target, large creatures have
    // several potential standing spots for each adjacent spot. Example for a
    // width=2 height=1 creature attacking a 1x1 creature near map edge:
    //
    // / /_/./|   '.' are in aroundDeep() result but our attacker can't stand
    // \_\.\T\|   on them. Rather, it can stand on '_' and reach still T.
    // / /_/./|
    //
    // / /_/./ / /  If target is not near the edge, the attacker can
    // \_\:\T\.\ \  stand either on the adjacent spot '.' (but not ':') or
    // / /_/./ / /  on the spot to the left of it, i.e. on '_'.
    aroundDeepStand: function (x, y, depth, exclude, width, ownSize) {
      var res = []
      var width = this.combat._opt.width - ownSize.width
      var height = this.combat._opt.height - ownSize.height
      _.each(this.aroundDeep(x, y, depth, exclude, width), function (spot) {
        for (var dy = 1 - ownSize.height; dy <= 0; dy++) {
          for (var dx = 1 - ownSize.width; dx <= 0; dx++) {
            var x = spot[0] + dx
            var y = spot[1] + dy
            if (x >= 0 && x <= width && y >= 0 && y <= height) {
              res.push([x, y])
            }
          }
        }
      }, this)
      return res
    },

    // Returns mapped square coordinates of cells around `'x/`'y, considering the hexagonal nature of the combat field.
    neighboursOf: function (x, y) {
      // XXX=RH
      return this._pathFind._neighboursOf([
        x, y, 0,
        this.combat.bySpot.toContiguous(x, y, 0, 0),
      ])
    },

    // Finds the optimal path for current State's creature to `'spot considering its `'combat_speed.
    //> spot array `[[x, y]`] coords on combat map`, int n
    //= null unreachable`, array do not mutate
    pathTo: function (spot) {
      return this._opt.pathCosts[_.isArray(spot) ? spot[0] + spot[1] * this.combat._opt.width : spot]
    },

    // Finds the optimal path for current State's creature from and to arbitrary spots using arbitrary speed.
    //
    // Use pathTo() if from = current creature's spot and maxCost = its speed.
    findPath: function (from, to, maxCost) {
      if (to[0] + this._opt.creature._opt.width  - 1 >= this.combat._opt.width ||
          to[1] + this._opt.creature._opt.height - 1 >= this.combat._opt.height) {
        return
      }
      if (from.length < 4) {
        from = [from[0], from[1], 0, this.combat.bySpot.toContiguous(from[0], from[1], 0, 0)]
      }
      if (to.length < 4) {
        to = [to[0], to[1], 0, this.combat.bySpot.toContiguous(to[0], to[1], 0, 0)]
      }
      var coster = this._opt.pathCost
      var costFunc = function (item) {
        var isDestination = item[3] == to[3]
        return coster.costAt(item[0], item[1], item[2], item[3], {isDestination: isDestination})
      }
      return this._pathFind.findPath(from, to, costFunc, maxCost)
    },

    // Returns a Calculator for obtaining `'target value on the enemy hero. Call `'updateIfNeeded().
    calculateEnemyHero: function (target) {
      if (this.get('enemy')) {
        return this._enemyHeroCalcs.append(target).calc
      }
    },

    // Returns a Calculator for obtaining `'target value on the currently interactive (own) hero. Call `'updateIfNeeded().
    calculateHero: function (target) {
      if (this.get('interactive')) {
        return this._heroCalcs.append(target).calc
      }
    },

    // Returns a Calculator for obtaining `'target value on the currently interactive (own) creature. Call `'updateIfNeeded().
    calculate: function (target) {
      if (this.get('creature')) {
        return this._creatureCalcs.append(target).calc
      }
    },

    // Checks if (own) player can issue orders for the currently interactive creature.
    canControl: function () {
      var calc = this.calculate('creature_canControl')
      return calc && calc.updateIfNeeded().get('value')
    },
  })

  return Combat
})