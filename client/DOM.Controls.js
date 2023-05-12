define(['DOM.Common', 'Calculator', 'H3.Databank'], function (Common, Calculator, Databank) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  function copyToClipboard(str) {
    var area = $('<textarea>')
      .text(str)
      .appendTo('body')
    // Focusing causes document scrolling. Copy seems to work without it.
    //area[0].focus()
    area[0].select()
    document.execCommand('copy')
    area.remove()
    return false
  }

  // Provides several debug buttons (mostly toggling Screen's _opt like mapShroud), draws various indicators on map (like passability and spot Effects), displays info about spot under mouse cursor and shows in-combat Effects.
  var Controls = Common.jQuery.extend('HeroWO.DOM.Controls', {
    mixIns: [Common.ContextModule],
    el: {class: 'Hcontrols'},
    // This class is dirty, combining both ContextModule and ScreenModule for
    // simplicity. But that's fine given it's only for debugging.
    sc: null,
    scMap: null,
    ui: null,
    am: null,

    _creatureProps: ['maxCombats', 'destroyArtifact', 'origin',
                     'defending', 'actions', 'perished', 'hitPoints', 'shots', 'retaliating', 'strikes'],

    _creatureTargets: {
      creature_attack: 'i',
      creature_defense: 'i',
      creature_damageMin: 'i',
      creature_damageMax: 'i',
      creature_critical: 'i',
      creature_criticalChance: 'i',
      creature_hitPoints: 'i',
      creature_speed: 'i',
      creature_moveDistance: 'i',
      creature_luck: 'i',
      creature_morale: 'i',
      creature_spellImmune: 'b',
      creature_dispelImmune: 'b',
      creature_spellEvade: 'i',
      creature_spells: 'a',
      creature_aiValue: 'i',
      creature_attackAndReturn: 'b',
      creature_attackAround: 'i',
      creature_attackDepth: 'i',
      creature_enemyRetaliating: 'b',
      creature_retaliating: 'i',
      creature_fightValue: 'i',
      creature_flying: 'b',
      creature_jousting: 'i',
      creature_absolute: 'b',
      creature_piercing: 'i',
      creature_queue: 'b',
      creature_reanimate: 'i',
      creature_reanimateAs: 'i',
      creature_regenerating: 'b',
      creature_strikes: 'i',
      creature_wallStrikes: 'i',
      creature_wallDamage: 'a',
      creature_meleePenalty: 'i',
      creature_shootBlocked: 'b',
      creature_shootingCloud: 'i',
      creature_shootPenalty: 'i',
      creature_shots: 'i',
      creature_canControl: 'b',
      spellCost: 'i',
      spellGlobal: 'b',
      spellMastery: 'i',
      spellEfficiency: 'i',
      spellDuration: 'i',
      spellAround: 'i',
      spellAroundEye: 'i',
    },

    _heroTargets: {
      name: 's',
      hero_attack: 'i',
      hero_defense: 'i',
      hero_spellPower: 'i',
      hero_knowledge: 'i',
      hero_spellPoints: 'i',
      hero_skills: 'a',
      hero_spells: 'a',
      combatCasts: 'i',
      retreatCan: 'b',
      surrenderCan: 'b',
      tacticsDistance: 'i',
    },

    _opt: {
      combat: null,   // last created and still active H3.DOM.Combat or null if none
      effects: false,
      displayOrder: false,
      effectSpots: false,
    },

    events: {
      init: function () {
        this.el.html(this.cx.template(this.constructor.name)())
      },

      attach: function () {
        this.sc = this.cx.screens()[0]

        if (!this.sc) { return }

        var map = this.scMap = this.sc.modules.nested('HeroWO.DOM.Map')

        this.autoOff(this.sc, {
          change_mouseCell: 'update',

          change_mapPassability: function (now) {
            Common.oneClass(this.cx.$('[class*="Hgrid__cell_pass"]'),
                            'Hgrid__cell_pass_')

            if (now) {
              var atter = this.map.byPassable.atter(['impassable', 'actionable'])

              this.map.byPassable.findWithin(
                0, 0, this.sc.get('z'),
                Infinity, Infinity, this.sc.get('z'),
                0,
                function ($1, x, y, z, $2, n) {
                  var pass = atter(n, 0)
                  var guarded
                  this.map.bySpot.findAtCoords(x, y, z, 0, function ($1, $2, $3, $4, l, n) {
                    if (this.map.bySpot.atContiguous(n + this.map.bySpot.propertyIndex('displayOrder'), l) >= 0) {
                      var res = this.map.bySpot.atContiguous(n + this.map.bySpot.propertyIndex('guarded'), l)
                      if (res !== false) {
                        guarded = res
                        return res === this.map.constants.spotObject.guarded.guarded || null
                      }
                    }
                  }, this)
                  Common.oneClass(
                    map.gridCellAt(x, y),
                    'Hgrid__cell_pass_',
                    pass.impassable ? 'impass' : null,
                    pass.actionable ? 'act' : null,
                    guarded === this.map.constants.spotObject.guarded.guarded ? 'guard'
                      : guarded === this.map.constants.spotObject.guarded.terrain ? 'guard-t'
                        : null,
                    this.map.bySpot.findAtCoords(x, y, z, 'displayOrder', function (d) { return d < 0 }) ? 'hidden' : null
                  )
                },
                this
              )

              var hide = this.sc.set.bind(this.sc, 'mapPassability', false)
              this.sc.once('change_z', hide)
              this.map.objects.once('oadd', hide)
              this.map.objects.once('ochange', hide)
              this.map.objects.once('oremove', hide)
            }
          },

          change_mapPathFinding: function (hero) {
            Common.oneClass(this.cx.$('.Hgrid__cell_path').text(''), 'Hgrid__cell_path')

            if (hero) {
              var coster = this.cx.pathCostFor(hero.get('id'))

              this.map.byPassable.findWithin(
                0, 0, this.sc.get('z'),
                Infinity, Infinity, this.sc.get('z'),
                0,
                function ($1, x, y, z, $2, $3) {
                  var cost = coster.costAt(x, y, z, null, {isDestination: true, disembark: true})
                  var el = map.gridCellAt(x, y)

                  Common.oneClass(
                    el,
                    'Hgrid__cell_path', '',
                    cost == coster.OBJECT     ? '_imp-obj' : null,
                    cost == coster.VEHICLE    ? '_imp-veh' : null,
                    cost == coster.GUARDED    ? '_imp-guard' : null,
                    cost == coster.SHROUDED   ? '_imp-shr' : null
                  )

                  switch (cost) {
                    case coster.OBJECT:     el.innerHTML = 'io'; break
                    case coster.VEHICLE:    el.innerHTML = 'iv'; break
                    case coster.GUARDED:    el.innerHTML = 'ig'; break
                    case coster.SHROUDED:   el.innerHTML = 'is'; break
                    default:                el.innerHTML = cost
                  }
                },
                this
              )

              this.sc.assignResp({mapGrid: true, mapPassability: true})

              this.sc.once('change_mapPassability', true, function (now) {
                return now || this.sc.set('mapPathFinding', null)
              }, this)
            }
          },
        })
      },

      render: function () {
        if (this.map) {
          this.cx.once('change_loading', function () {
            this.update()

            this.ui = this.sc.modules.nested('HeroWO.H3.DOM.UI')
            this.rules = this.ui.rules
            this.am = this.ui.windows.nested('map')

            this.autoOff(this.ui.windows, {
              nestExNew: function (res) {
                if (res.child.constructor.name == 'HeroWO.H3.DOM.Combat') {
                  res.child.whenRenders('render', this.set.bind(this, 'combat', res.child))
                }
              },
            })
          }, this)
        } else {
          this.$('.map-size').text(this.cx.get('screen'))
        }
      },

      _update: function () {
        var combatUI = this.get('combat')
        Common.oneClass(this.el, 'Hcontrols_state_', combatUI ? 'combat' : 'am')

        var effects

        if (combatUI) {
          var combat = combatUI.combat

          this.$('.map-size').text(_.format(
            '%d×%d',
            combat.get('width'),
            combat.get('height')))

          var curCell = combatUI.nested('map').get('mouseCell')
          var objects = []

          if (curCell) {
            this.el.find('.cur-pos').text(_.format(
              '(%d:%d) %s',
              curCell[0],
              curCell[1],
              (combatUI.nested('map').get('mouseSide') || '').toUpperCase()
            ))

            combat.bySpot.findAtCoords(
              curCell[0], curCell[1], 0,
              0,
              function (key) {
                var obj = combat.objects.nested(key)
                if (obj.get('creature') != null) {
                  effects = effects || obj
                  objects.push(_.format('%s:%s %d×%s',
                    obj._parentKey,
                    obj.get('defending') ? '#' : '',
                    obj.get('count'),
                    this.rules.creatures.atCoords(obj.get('creature'), 0, 0, 'nameSingular', 0)
                  ))
                } else {
                  objects.push(_.format('%s:%s %d×%d',
                    obj._parentKey,
                    obj.get('image'),
                    obj.get('width'),
                    obj.get('height')
                  ))
                }
              },
              this
            )
          } else if (!this.get('effects')) {
            effects = combatUI.state.get('interactive') ||
              combat.parties.find(function (party) {
                return party.player == this.sc.pl
              }, this)
          }

          this.el.find('.cur-pos').css('visibility', curCell ? '' : 'hidden')
          this.$('.cur-obj').text(objects.join(', '))
        } else if (this.map) {
          this.$('.map-size').text(_.format(
            '%d×%d',
            this.map.sizeWithoutMargin().width,
            this.map.sizeWithoutMargin().height))

          var curCell = this.sc.get('mouseCell')
          var objects = []

          if (curCell) {
            this.el.find('.cur-pos').text(_.format(
              '(%d:%d) +m(%d:%d)',
              curCell[0] - this.map.get('margin')[0],
              curCell[1] - this.map.get('margin')[1],
              curCell[0],
              curCell[1]
            ))

            var atter = this.map.bySpot.atter(['id', 'corner', 'actionable'])

            this.map.bySpot.findAtCoords(
              curCell[0], curCell[1], this.sc.get('z'),
              0,
              function ($1, $2, $3, $4, l, n) {
                var spot = atter(n, l)
                var texture = (this.map.objects.atCoords(spot.id, 0, 0, 'texture', 0) || ',' + this.rules.classes.atCoords(this.map.objects.atCoords(spot.id, 0, 0, 'class', 0), 0, 0, 'name', 0))
                  .split(',')[1]
                var corner = spot.corner == '1111' ? '⌧' :
                  spot.corner.split('').map(function (v, i) {
                    return v == 0 ? '' : '↖↗↘↙'[i]
                  }).join('')
                var actSym = {undefined: '', impassable: '#', actionable: '*'}
                objects.push(actSym[this.map.constants.spotObject.actionable[spot.actionable]] + spot.id + ':' + texture + corner)
              },
              this
            )

            this.map.effects.bySpot.findAtCoords(
              curCell[0], curCell[1], this.sc.get('z'),
              0,
              function (n) { objects.push(n) }
            )
          }

          this.el.find('.cur-pos').css('visibility', curCell ? '' : 'hidden')
          this.$('.cur-obj').text(objects.join(', '))

          if (this.get('displayOrder')) {
            this.scMap.$('.Hmap__obj_order-hover')
              .removeClass('Hmap__obj_order-hover')
              .next()
                .text(function (i, s) { return s.replace(/\s.*/, '') })

            if (curCell) {
              var objects = []
              this.map.bySpot.findAtCoords(
                curCell[0], curCell[1], this.sc.get('z'),
                0,
                function (id, x, y, z, l) {
                  switch (this.map.objects.atCoords(id, 0, 0, 'type', 0)) {
                    case this.map.constants.object.type.terrain:
                    case this.map.constants.object.type.river:
                    case this.map.constants.object.type.road:
                      return
                  }
                  objects.push([id, this.map.bySpot.atCoords(x, y, z, 'displayOrder', l)])
                },
                this
              )

              objects.sort(function (a, b) {
                return a[1] - b[1]
              }.bind(this))

              _.each(objects, function (id, i) {
                $(this.scMap.objectEl(id[0]))
                  .addClass('Hmap__obj_order-hover')
                  .next()
                    .text(function ($, s) { return s + ' ' + i })
              }, this)
            }
          }
        }

        this.getSet('effects', function (cur) {
          return cur !== false && effects ? effects : cur
        })
      },

      change_displayOrder: function (now) {
        var atter = this.map.objects.atter(['displayOrder', 'x', 'y'])

        this.map.objects.find('type', function (type, id) {
          switch (type) {
            case this.map.constants.object.type.terrain:
            case this.map.constants.object.type.river:
            case this.map.constants.object.type.road:
              return
          }

          var obj = atter(id, 0, 0, 0)
          var el = this.scMap.objectEl(id)

          Common.oneClass(el, 'Hmap__obj_order', now ? '' : null)

          var text = el.nextElementSibling && el.nextElementSibling.classList.contains('Hmap__obj-order-text') ? el.nextElementSibling : null

          if (now) {
            text = text || $('<span class=Hmap__obj-order-text>')
              .css($(el).position())
              .insertAfter(el)
              [0]
            text.innerText = _.format('%d;%d', obj.x, obj.y)
          } else {
            text && text.parentNode.removeChild(text)
          }
        }, this)
      },

      change_effectSpots: function (now) {
        this.cx.$('.Hgrid__cell_eff').removeClass('Hgrid__cell_eff')

        if (now) {
          var ev = this.sc.on('=cellClick', function (sup, x, y, z) {
            var nn = []
            this.map.effects.bySpot.findAtCoords(x, y, z, 0, function (n) { nn.push(n) })
            nn.length && copyToClipboard(nn.join('\n'))
          })

          this.map.effects.bySpot.findWithin(
            0, 0, this.sc.get('z'),
            Infinity, Infinity, this.sc.get('z'),
            0,
            function (n, x, y) {
              this.gridCellAt(x, y).classList.add('Hgrid__cell_eff')
            },
            this.scMap
          )

          function hide() {
            this.set('effectSpots', false)
            this.sc.off(ev)
          }

          this.once('change_effectSpots', hide)
          this.sc.once('change_z', hide, this)
          this.map.effects.bySpot.once('oadd', hide, this)
          this.map.effects.bySpot.once('ochange', hide, this)
          this.map.effects.bySpot.once('oremove', hide, this)
        }
      },

      change_combat: function (now, old) {
        old && this.autoOff(old.nested('map'))

        now && this.autoOff(now.nested('map'), {
          change_mouseCell: 'update',
          change_mouseSide: 'update',

          unnest: function () {
            this.getSet('combat', function (cur) {
              return cur == now ? null : cur
            })
          },
        })

        this.update()
      },

      change_effects: function (now, old) {
        this.$('.effects')
          .toggle(!!now)
          .empty()

        if (cx.dumpEffects) {
          $('<a href="#">')
            .appendTo(this.$('.effects'))
            .text('Copy all Effects to clipboard')
            .on('click', function () {
              return copyToClipboard(cx.dumpEffects())
            })
        }

        if (now) {
          var combatUI = this.get('combat')
          var effectsEl = $('<table>').appendTo(this.$('.effects'))

          if (now.constructor.name == 'HeroWO.Map.Combat.Creature') {
            _.each(this._creatureProps, function (prop) {
              $('<tr>')
                .append($('<th>').text('$ ' + prop))
                .append($('<td>').text(JSON.stringify(now.get(prop))))
                .appendTo(effectsEl)
            }, this)

            var selectors = {
              targets: this._creatureTargets,
              ifCombat: combatUI.combat._parentKey,
            }

            var spell = combatUI.nested('map').nested('mode').get('spell')
            spell = spell && spell.get('spell')

            if (spell == null) {
              selectors.ifCombatCreature = now._parentKey
              selectors.ifCombatParty = now.party._parentKey
            } else {
              selectors.ifTargetCombatCreature = now._parentKey
              selectors.ifCombatParty = combatUI.state.get('interactive')
              selectors.ifSpell = spell
            }
          } else if (now.constructor.name == 'HeroWO.Map.Combat.Party') {
            var selectors = {
              targets: this._heroTargets,
              ifCombatParty: now._parentKey,
              ifCombat: combatUI.combat._parentKey,
            }
          }

          var classes = {
            b: Calculator.Effect.GenericBool,
            i: Calculator.Effect.GenericNumber,
            s: Calculator.Effect.GenericString,
            a: Calculator.Effect.GenericIntArray,
          }

          _.each(selectors.targets, function (type, target) {
            var calc = this.cx.oneShotEffectCalculator(_.extend(selectors, {
              class: classes[type],
              target: this.map.constants.effect.target[target],
            }))
            calc.take()
            $('<tr>')
              .append(
                $('<th>')
                  .text(target + ' ')
                  .append(
                    $('<a href="#">')
                      .text(calc.get('affectors').length)
                      .toggle(calc.get('affectors').length > 0)
                      .on('click', function () {
                        prompt('Affectors of ' + target, calc.get('affectors').join(' '))
                        return false
                      })
                  )
              )
              .append($('<td>').text(_.format('%.25j', calc.get('value'))))
              .appendTo(effectsEl)
            calc.release()
          }, this)
        }
      },
    },

    elEvents: {
      'click .anim': function () {
        this.sc.getSet('mapAnimate', Common.not)
      },
      'click .grid': function () {
        this.sc.getSet('mapGrid', Common.not)
      },
      'click .pass': function () {
        this.sc.getSet('mapPassability', Common.not) &&
          this.sc.set('mapGrid', true)
      },
      'click .path': function () {
        this.sc.getSet('mapPathFinding', function (cur) {
          return cur ? null : this.currentHero()
        }, this)
      },
      'click .order': function () {
        this.getSet('displayOrder', Common.not)
      },
      'click .eff': function () {
        this.getSet('effectSpots', Common.not) &&
          this.sc.set('mapGrid', true)
      },
      'click .margin': function () {
        this.sc.getSet('mapMargin', Common.not)
      },
      'click .shroud': function () {
        this.sc.getSet('mapShroud', Common.not)
      },
      'click .edge': function () {
        this.am.getSet('mapEdge', Common.not)
      },
      'click .scale': function () {
        this.cx.getSet('scale', Common.not)
      },
      'click .classic': function () {
        this.cx.getSet('classic', Common.not)
      },
      'click .cgrid': function () {
        this.sc.getSet('combatGrid', Common.not)
      },
      'click .chlmove': function () {
        this.sc.getSet('combatHighlightMove', Common.not)
      },
      'click .chlhover': function () {
        this.sc.getSet('combatHighlightHover', Common.not)
      },
      'click .spanim': function () {
        this.sc.getSet('spellBookPageAnimation', Common.not)
      },
      'click .ccrinfo': function () {
        this.sc.getSet('combatCreatureInfo', function (cur) {
          switch (cur) {
            case false:
              return 'spell'
            case 'spell':
              return true
            case true:
              return false
          }
        })
      },
      'click .ccreff': function () {
        var cur = this.getSet('effects', function (cur) {
          return cur === false ? null : false
        })
        cur === false || this.update()
      },
      'click .log': function () {
        _.log ? delete _.log : _.log = _.oldLog
      },
    },

    currentHero: function () {
      var cur = this.sc.get('current')
      return cur && cur.isHero ? cur : null
    },
  })

  // Provides numerous debug controls: buttons for quick game actions (like instant victory or AP boost), including external scripts (to develop user modules) and monitor recent Transitions and Effects.
  //
  // XXX=I add list of AObject->$pending
  Controls.Modification = Common.jQuery.extend('HeroWO.DOM.Controls.Modification', {
    mixIns: [Common.ScreenModule],
    el: {class: 'Hcontrols-mod'},
    _template: null,
    _effectAtter: null,
    _effectConstants: null,
    _effectCode: null,
    _deletedTransitions: [],
    _debouncedUpdate: Common.stub,

    _opt: {
      scripts: [],      // {url, permalink, loading, lock, permanent, started}
      effectCode: '',
      effects: [],
      connector: null,  // RPC.WebSocket.Connector
    },

    events: {
      init: function () {
        this._template = this.cx.template(this.constructor.name)
        this._debouncedUpdate = _.debounce(Common.ef('update', this), 50)
        this.el.addClass('Hcontrols-mod_master_' + (this.cx.get('master') ? 'yes' : 'no'))
      },

      attach: function () {
        this._effectAtter = this.map.effects.atter()

        var consts = this.map.constants
        this._effectConstants = {
          ifObjectType:               consts.object.type,
          ifVehicle:                  consts.object.vehicle,
          ifWorldBonus:               consts.map.bonus,
          target:                     consts.effect.target,
          source:                     consts.effect.source,     // int/array[0]
          stack:                      consts.effect.stack,      // int/array[0]
          modifier:                   consts.effect.operation,  // any/array[0]
          ifResource:                 consts.resources,
          ifResourceReceive:          consts.resources,
          ifAggression:               consts.effect.aggression,
          ifContext:                  consts.effect.context,
          ifContextAggression:        consts.effect.aggression,
          ifTerrain:                  consts.class.terrain,
          ifRiver:                    consts.class.river,
          ifRoad:                     consts.class.road,
          ifCreatureAlignment:        consts.creature.alignment,
          ifCreatureUndead:           consts.creature.undead,
          ifTargetCreatureAlignment:  consts.creature.alignment,
          ifTargetCreatureUndead:     consts.creature.undead,
          isTargetAdjacent:           consts.effect.isAdjacent,
          whileOwnedPlayer:           this.rules.playersID,
          ifPlayer:                   this.rules.playersID,
          ifSkill:                    this.rules.skillsID,
          ifSpell:                    this.rules.spellsID,
          ifSpellSchool:              this.rules.spellSchoolsID,
          ifCreature:                 this.rules.creaturesID,
          ifTargetPlayer:             this.rules.playersID,
          ifArtifact:                 this.rules.artifactsID,
          ifBuilding:                 this.rules.buildingsID,
          ifHero:                     this.rules.heroesID,
        }

        this.autoOff(this.map.effects, {
          oadd: function (n, $, props) {
            var effect = this._effectAtter(props)
            effect._n = n
            // Don't show "false" in the table for clarity.
            effect = _.map(effect, function (v) { return v === false ? '' : v })

            effect._targetText = _.indexOf(this.map.constants.effect.target, effect.target)
            var src = _.toArray(effect.source)
            src[0] = _.indexOf(this.map.constants.effect.source, src[0])
            effect._sourceText = src.join()
            effect._ifObjectType = _.indexOf(this.map.constants.object.type, this.map.objects.atCoords(effect.ifObject, 0, 0, 'type', 0))

            var cur = this.get('effects')
            cur.length > 100 && cur.splice(80)
            this.set('effects', [effect].concat(cur))
          },

          oremove: function (n) {
            this.set('effects', this.get('effects').filter(function (eff) {
              return eff._n != n
            }))
          },
        })

        var ctl = this.cx.modules.nested('HeroWO.DOM.Controls')
        ctl && this.autoOff(ctl, {
          change_combat: function (cur) {
            this.el.toggleClass('Hcontrols-mod_combat', !!cur)
          },
        })

        this.autoOff(this.sc, {
          change_current: function (now, old) {
            if (!now != !old || (now && !now.isHero != !old.isHero)) {
              this.update()
            }
          },
        })

        this.autoOff(this.map.transitions, {
          'nestExNew, .change': '_debouncedUpdate',
          unnested: function (tr, key) {
            var opt = _.extend(tr.get(), {_deleted: true})
            this._deletedTransitions.unshift([key, opt])
            this._deletedTransitions.splice(20)
            this._debouncedUpdate()
          },
        })

        _.each(this.cx.screens(), function (screen) {
          this.autoOff(screen.transitions, {
            nestExNew: function (res) {
              var tr = res.child.get('transition')
              tr.getSet('_screens', Common.concat('P' + screen.get('player')))
            },
          })
        }, this)

        var playOrder = 1

        this.autoOff(this.sc.transitions, {
          nestExNew: function (res) {
            this._debouncedUpdate()
            // Using custom property to not trip the logging hook on transition change that assumes only simple objects are set to its options (as is normally the case).
            res.child.get('transition')._view = res.child
            this.autoOff(res.child, {
              change: '_debouncedUpdate',
              change_playing: function () {
                res.child.set('_playOrder', playOrder++)
              },
            })
          },
          unnested: function (child) {
            this._debouncedUpdate()
            this.autoOff(child)
          },
        })
      },

      '-unnest': function () {
        if (this._parent) {
          this._debouncedUpdate.cancel()
        }
      },

      _update: function () {
        this._debouncedUpdate.cancel()

        var cur = this.sc.get('current')
        Common.oneClass(this.el, 'Hcontrols-mod_current_', cur ? cur.isHero ? 'hero' : 'town' : 'no')

        var recent = this.get('effects')[0]
        recent && (recent._cut = true)

        if (this._effectCode) {
          // Such an exemplary piece of lazy software engineering deserves a monument. Wait, this was a joke!
          this.set('effectCode', this._effectCode.val())
          var height = this._effectCode.height()    // resize: vertical
          var focused = document.activeElement == this._effectCode[0]
          var range = [
            this._effectCode.prop('selectionStart'),
            this._effectCode.prop('selectionEnd'),
            this._effectCode.prop('selectionDirection'),
          ]
        }

        var vars = this.get()
        vars.scripts.permalink = vars.scripts.some(Common.p('permalink'))

        var schema = _.entries(this.map.effects.schema())
          .filter(function (a) { return a[0][0] != '_' })
          .sort(function (a, b) {
            return a[1] - b[1] || Common.compare(a[0], b[0])
          })
        vars.effectSchema = _.pluck(schema, 0)

        var tr = this.map.transitions.map(function (tr) {
          return _.extend(tr.get(), {_view: tr._view})
        })
        _.extend(tr, _.fromEntries(this._deletedTransitions))
        var prev = -Infinity
        tr = _.map(tr, function (tr, k) {
          var order = tr._view && tr._view.get('_playOrder')
          tr = _.extend({}, tr, {
            _key: k,
            _view: tr._view && tr._view.get(),
            _outOfOrder: order != null && prev >= order,
          })
          order == null || (prev = order)
          return tr
        })
        vars.transitions = _.values(tr).sort(function (a, b) { return b._key - a._key })

        this.el.html(this._template(vars))
        this._effectCode = this.$('textarea')

        if (range) {
          this._effectCode.height(height)
          focused && this._effectCode[0].focus()
          this._effectCode.prop('selectionStart', range[0])
          this._effectCode.prop('selectionEnd', range[1])
          this._effectCode.prop('selectionDirection', range[2])
        }
      },

      '+normalize_effectCode': Common.normStr,
      'change_scripts': 'update',
      change_effects: '_debouncedUpdate',
      change_connector: '_debouncedUpdate',

      change_effectCode: function (now) {
        this._effectCode && this._effectCode.val(now)
      },
    },

    //= [!, prop] or [+|-num, prop] or [, prop]
    _parseRes: function (s) {
      return s.match(/^([+-]\d+|!)?(\w+)$/).slice(1)
    },

    elEvents: {
      'click [data-Hwsdrop]': function () {
        this.get('connector')._client.get('ws').close(4999)
      },

      'click .odel': function () {
        try {
          var last = localStorage.getItem('lastODel')
        } catch (e) {}

        var id = ((prompt('Enter $id of the object to delete:', last || '') || '').match(/\d+/) || [])[0]

        if (id) {
          try {
            localStorage.setItem('lastODel', id)
          } catch (e) {}

          if (this.map.objects.anyAtCoords(+id, 0, 0)) {
            this.map.objects.removeAtCoords(+id, 0, 0, 0)
          } else {
            alert('There is no object with the $id of ' + id + '.')
          }
        }
      },

      'click [data-Hresmap]': function (e) {
        var prop = this._parseRes(e.target.getAttribute('data-Hresmap'))

        switch (prop[1]) {
          default:
            return this.map.getSet(prop[1], Common.inc(prop[0]))
          case 'random':
            return this.map.set('random', _.random())
          case 'turnLength':
            return this.map.getSet('turnLength', function (cur) {
              return cur ? 0 : 60
            })
        }
      },

      'click [data-Hresplayer]': function (e) {
        var prop = this._parseRes(e.target.getAttribute('data-Hresplayer'))

        switch (prop[1]) {
          default:
            return this.pl.getSet(prop[1], Common.not)
          case 'team':
            return this.pl.getSet('team', function (cur) {
              var all = _.unique(this.map.players.invoke('get', 'team'))
              // Skip neutral and always cycle through team 1, even if it isn't present on map (if an earlier team change resulted in team 1 having no players).
              all[1] == 1 ? all.splice(0, 1) : all[0] = 1
              var index = all.indexOf(cur) + 1
              if (index >= all.length) {
                index = 0
              }
              return all[index]
            }, this)
          case 'maxLevel':
            return this.pl.getSet('maxLevel', function (cur) {
              return cur ? 0 : 1
            })
          case 'res':
            return _.each(this.rules.constants.resources, function ($, name) {
              this.pl.getSet('resources_' + name, function (cur) {
                return cur + prop[0] * (name == 'gold' ? 100 : 1)
              })
            }, this)
          case 'handicap':
            return this.pl.getSet('handicap', function (cur) {
              return !cur ? 1.5 : cur == 1.5 ? 0.5 : 0
            })
          case 'screen':
            return this.pl.set('screen', '')
          case 'victory':
          case 'loss':
            return this.map[prop[1]].sample().getSet('achieved', function (cur) {
              return (cur || []).concat(this.pl.get('player'))
            }, this)
        }
      },

      'click [data-Hresobject]': function (e) {
        var prop = this._parseRes(e.target.getAttribute('data-Hresobject'))
        var obj = this.sc.get('current')
        if (!obj) { return }

        switch (prop[1]) {
          default:
            return obj.getSet(prop[1], function (cur) {
              return Math.max(cur + +prop[0], 0)
            })
          case 'owner':
            return obj.getSet('owner', function (cur) {
              var all = _.without(this.map.players.invoke('get', 'player'), 0)
              var index = all.indexOf(cur) + 1
              if (index >= all.length) {
                index = 0
              }
              return all[index]
            })
          case 'experience':
            return this.rules._grantExperience(obj, +prop[0])
          case 'listOrder':
            return this.rules._bumpListOrder(obj.get('id'), null, true)
          case 'artifacts':
            var sub = this.map.objects.subAtCoords(obj.get('id'), 0, 0, 'artifacts', 0)
            try {
              return this.rules._equipTrophy(sub, _.sample(this.rules.artifactsID))
            } finally {
              sub.release()
            }
          case 'available':
            var sub = this.map.objects.subAtCoords(obj.get('id'), 0, 0, 'available', 0)
            try {
              return sub.batch(null, function () {
                sub.find(0, function (count, $1, $2, $3, l, n) {
                  sub.setAtContiguous(n, l, count + +prop[0])
                })
              })
            } finally {
              sub.release()
            }
          case 'hasBuilt':    // XXX=I
            return
        }
      },

      'click [data-Hresgarrison]': function (e) {
        var prop = this._parseRes(e.target.getAttribute('data-Hresgarrison'))
        var obj = this.sc.get('current')
        if (!obj) { return }

        var sub = this.map.objects.subAtCoords(obj.get('id'), 0, 0, 'garrison', 0)
        try {
          sub.find(0, function ($, slot) {
            var cur = sub.atCoords(slot, 0, 0, prop[1], 0)

            switch (prop[1]) {
              default:
                cur = Math.max(cur + +prop[0], 0)
                break
              case 'hitPoints':
                cur = Math.max(cur + +prop[0], 1)
                break
              case 'count':
                cur += +prop[0]
                if (cur < 0) {
                  return sub.removeAtCoords(slot, 0, 0, 0)
                }
                break
            }

            sub.setAtCoords(slot, 0, 0, 0, prop[1], cur)
          })
        } finally {
          sub.release()
        }
      },

      'click .sc-add': function () {
        try {
          var last = localStorage.getItem('lastScript')
        } catch (e) {}
        var url = prompt('Enter an URL to require(): \n\n- WARNING - \nThis will run third party code and may make the page unsafe to browse.', last || '')
        if (url) {
          if (this.get('scripts').some(function (s) { return s.url == url })) {
            alert('This URL has already been require()\'d.\n\n' + url)
          } else {
            try {
              localStorage.setItem('lastScript', url)
            } catch (e) {}
            var info = {url: url, loading: true, lock: 0}
            this.set('scripts', this.get('scripts').concat(info))
            this._loadScript(info)
          }
        }
      },

      'click [data-Hsreload]': function (e) {
        var url = e.target.getAttribute('data-Hsreload')
        var info = this.get('scripts').find(function (s) { return s.url == url })
        info.started && require(url).stop(this.cx)
        require.undef(url)
        require.config({urlArgs: '_r=' + Math.random()})
        this._loadScript(info)
      },

      'click [data-Hsstart],[data-Hsstop]': function (e) {
        var url = e.target.getAttribute('data-Hsstart')
        var start = url
        start || (url = e.target.getAttribute('data-Hsstop'))
        require(url)[start ? 'start' : 'stop'](this.cx)
        this.get('scripts').forEach(function (s) {
          if (s.url == url) { s.started = !!start }
        })
        this.update()
      },

      'click [data-Hsdelete]': function (e) {
        var url = e.target.getAttribute('data-Hsdelete')
        var info = this.get('scripts').find(function (s) { return s.url == url })
        this.set('scripts', _.without(this.get('scripts'), info))
        info.started && require(url).stop(this.cx)
        require.undef(url)
      },

      'click .eff-copy': function () {
        copyToClipboard(this.cx.dumpEffects())
      },

      'click .eff-delete': function () {
        var last = this.get('effects')[0]._n
        var n = ((prompt('Enter n of the Effect to delete:', last) || '').match(/\d+/) || [])[0]

        if (n) {
          n = this.map.effects.toContiguous(this.map.effects.fromContiguous(n).x, 0, 0, 0)

          if (this.map.effects.anyAtContiguous(n)) {
            this.map.effects.removeAtContiguous(n, 0)
          } else {
            alert('There is no Effect at ' + n + '.')
          }
        }
      },

      'click .eff-add': function () {
        var code = this._effectCode.val()
        var items = []

        _.each(code.split(/\}\s*$/m), function (str) {
          try {
            // Supports generic placeholders of parseJSON(), property-specific
            // _effectConstants ("target": shroud) and the short form of
            // effect.priority.of... for "priority": append[.default].
            items.push(Databank.parseJSON(str + '}', function (path, prop) {
              if (prop == 'priority' && !_.startsWith(path, 'effect.')) {
                path = 'effect.priority.of.' + path
              }
              if (_.includes(path, '.')) {
                return this.rules.fixupResolver(path)
              } else {
                return this._effectConstants[prop][path]
              }
            }, this))
          } catch (e) {}
        }, this)

        if (!items.length) {
          this._effectCode[0].select()
          this._effectCode[0].focus()
        } else {
          this.map.effects.batch(null, function () {
            _.each(items, function (item) { this.append(item) }, this)
          })

          this.set('effectCode', '')
        }
      },

      'click .eff-ins select': function (e) {
        if (e.target.selectedIndex > 0) {
          var start = this._effectCode.prop('selectionStart')
          var end = this._effectCode.prop('selectionEnd')
          this._effectCode.val(function (i, s) {
            return s.substr(0, start) + e.target.value + s.substr(end)
          })
          this._effectCode.prop('selectionStart', start + (start == end && e.target.value.length))
          this._effectCode.prop('selectionEnd', start + e.target.value.length)
          this._effectCode[0].focus()
          e.target.selectedIndex = 0
        }
      },

      'click [data-Hedelete]': function (e) {
        var n = +e.target.getAttribute('data-Hedelete')
        this.map.effects.removeAtContiguous(n, 0)
      },

      'click [data-Hedeled]': function (e) {
        var n = +e.target.getAttribute('data-Hedeled')
        this.pushEffectCode(this._effectAtter(n, 0))
        this.map.effects.removeAtContiguous(n, 0)
      },

      'click [data-Heedit]': function (e) {
        var n = +e.target.getAttribute('data-Heedit')
        this.pushEffectCode(this._effectAtter(n, 0))
      },

      'click [data-Heemb]': function (e) {
        var n = +e.target.getAttribute('data-Heemb')
        copyToClipboard(JSON.stringify(this.map.effects.objectAtContiguous(n, 0)))
      },

      'click [data-Htrclear]': function (e) {
        this._deletedTransitions.splice(0)
        this._debouncedUpdate()
      },

      'click [data-Htrlog]': function (e) {
        var key = e.target.getAttribute('data-Htrlog')

        if (key[0] == 'd') {
          var tr = _.find(this._deletedTransitions, function (tr) { return tr[0] == key.substr(1) })[1]
          console.dir(window.tr = tr)
          console.log('window.tr = _opt of deleted transition #' + key.substr(1))
        } else {
          var tr = this.map.transitions.nested(key)
          var view = tr._view
          console.dir((window.tr = tr).get())
          view && console.dir((window.tv = view).get())
          view = view ? ' | window.tv = its view' : ''
          console.log('window.tr = transition #' + key + view)
        }
      },

      'click [data-Htrabort]': function (e) {
        var key = e.target.getAttribute('data-Htrabort')
        this.sc.transitions.nested(key).abort()
      },
    },

    _loadScript: function (info) {
      // require.js fires the success callback if a module has failed
      // (errback'd), undef()'d and then again require()'d. If user tried to
      // add a script which failed due to a server-side issue, then he fixed it
      // and adds it again - we need to handle the callback only once. Without
      // the lock the first attempt's callback would also start() the module.
      //
      // https://requirejs.org/docs/api.html#errbacks
      var lock = ++info.lock

      var caching = 'https://cache.herowo.net/'
      var host
      info.permalink = null
      if (!_.startsWith(info.url.toLowerCase(), caching.toLowerCase()) &&
          (host = info.url.match(/^(https?:\/\/[^\/]+)\/(.+)$/i))) {
        info.permalink = caching + encodeURI(host[2]) +
          (_.includes(info.url, '?') ? '&' : '?') +
          '_h=' + encodeURIComponent(host[1].toLowerCase())
      }

      info.loading = true
      this.update()

      require(
        [info.url],
        function (module) {
          if (lock == info.lock) {
            module.start && module.start(this.cx)
            info.loading = false
            info.permanent = !module.start || !module.stop
            info.started = !info.permanent
            this.update()
          }
        }.bind(this),
        function (e) {
          require.undef(info.url)
          this.set('scripts', _.without(this.get('scripts'), info))
          alert('require() has called the errback. ' + e + '\n\n' + info.url)
        }.bind(this)
      )
    },

    pushEffectCode: function (effect) {
      effect = _.filter(effect, function (v, k) {
        return k[0] != '_' && v !== false
      })

      var unique = '\x05\x52\x24\x75'
      var re = new RegExp('"?' + _.escapeRegExp(_.initial(JSON.stringify(unique).substr(1))) + '"?', 'g')

      function ref(values, v) {
        var name = _.indexOf(values, v)
        return name == null ? v : unique + name + unique
      }

      effect = _.map(effect, function (v, k) {
        var values
        if ((k != 'modifier' || _.isArray(v)) && (values = this._effectConstants[k])) {
          v = _.isArray(v) ? [ref(values, v[0])].concat(v.slice(1)) : ref(values, v)
        }
        return v
      }, this)

      var cur = this._effectCode.val()

      if (cur.match(/\S/)) {
        cur = _.trimEnd(cur) + '\n\n'
      }

      // We want single-line output for compactness but with spaces near
      // punctuation.
      cur += JSON.stringify(effect, null, 1)
        .replace(/\n\s*/g, ' ')
        .replace(re, '')

      cur += '\n'
      this.set('effectCode', cur)
      this._effectCode[0].focus()
    },
  })

  return Controls
})