define(['DOM.Common', 'PathAnimator', 'Calculator', 'Effects', 'Map', 'DOM.Slider', 'DOM.Bits', 'H3.DOM.Bits', 'H3.Combat', 'H3.Rules'], function (Common, PathAnimator, Calculator, Effects, HMap, Slider, Bits, H3Bits, H3Combat, Rules) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // Determined empirically.
  var heroAnimTime = 4000
  var creatureFidgetInterval = 12000
  var hexWidth = 44
  var hexWidth_d2 = hexWidth / 2
  var hexHeight = 42

  // Root of combat drawing backend that utilizes browser's DOM nodes.
  var Combat = H3Bits.Window.extend('HeroWO.H3.DOM.Combat', {
    el: {class: 'Hh3-cm'},
    combat: null,
    ui: null,
    _timers: [],
    state: null,
    _info: null,

    _opt: {
      fullScreen: true,
      canClose: false,    // false, true (cancel()), 'hide'
      mouseParty: null,
      infoObject: null,   // for internal use by Mode
    },

    _initToOpt: {
      combat: '.',
    },

    events: {
      init: function () {
        this.ui = this.sc.modules.nested('HeroWO.H3.DOM.UI')
      },

      change_canClose: function (now) {
        if (!now) {
          return this.unlist('close')
        }

        this.addModule('close', H3Bits.Button, {
          el: $('<span class="Hsfx__btn Hh3-btn_id_GSPEXIT Hh3-cm__cancel">'),
        })
          .on('clicked', function () {
            switch (now) {
              case true:
                return this.cancel()
              case 'hide':
                return this.set('collapsed', true)
            }
          }, this)
      },

      change_visible: function (now) {
        // If user isn't looking at the combat window then no need to burn cycles playing the animations.
        this.sc.transitions.mute(this.nested('map')._transitions.channel, !now)
      },

      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-cm__*'}}})

        this.state = this.cx.addModule(H3Combat.State, {
          combat: this.combat,
          player: this.pl,
          pathCosts: [],
        })

        // This module is also used as a parent for castAnimationType = total.
        this.addModule('bk', H3Bits.Bitmap, {
          file: this.rules.combatBackgrounds.atContiguous(this.combat.get('background') + this.rules.combatBackgrounds.propertyIndex('image'), 0),
        })

        this.combat.parties.each(function (party) {
          if (party.object && party.object.isHero) {
            // This is animated independently of the hero image (easy to spot
            // when casting a spell).
            // It must be inserted before the hero which must overlay it.
            var image = this.addModule(H3Bits.DefImage, {
              elClass: 'Hh3-cm__hero-flag Hh3-cm__hero Hh3-cm__hero_pos_' + party.get('placement'),
              // CMFLAGL/CMFLAGR.
              def: 'CMFLAG' + (party.get('placement').indexOf('r') == -1 ? 'L' : 'R'),
              features: [_.indexOf(this.rules.playersID, party.player.get('player'))],
            })

            party.set('mapFlagImage' + this._cid, image)
            var duration = image.info('duration')
            image.el.css('animationDelay', _.random(duration * 2 - 1) + 'ms')
              // CMFLAGL/R are of DEF type 0, subject to combatSpeed but this usually results in an overly fast animation. They seem to be independent of this option in SoD too.
              .css('--HS', 2)

            var image = this.addModule(H3Bits.DefImage.Calculator, {
              class: Calculator.Effect.GenericString,
              target: this.cx.map.constants.effect.target.combatImage,
              ifObject: party.object.get('id'),
              elClass: 'Hh3-cm__hero Hh3-cm__hero_pos_' + party.get('placement'),
            })

            image.el.on('mousedown', function (e) {
              // Ignore clicks when combat has ended.
              return this.combat._parent && this._partyClicked(party, e)
            }.bind(this))
            image.el.on('mouseenter', function () {
              this.set('mouseParty', party)
              Common.oneClass(image.el, 'Hh3-cm_cursor_', this.combat._parent ? party.player == this.pl && party == this.combat.get('interactiveParty') ? 'hero' : 'help' : null)
            }.bind(this))
            image.el.on('mouseleave', function () {
              this.getSet('mouseParty', function (cur) {
                return cur == party ? null : cur
              })
            }.bind(this))

            party.set('mapImage' + this._cid, image)
          }
        }, this)

        /* Bottom panel */
        var panel = this.addModule('panel', H3Bits.Bitmap)
        var buttons = $('<div class=Hh3-cm-btns>').appendTo(this.el)

        this.addModule('options', H3Bits.Button, {attachPath: buttons, elClass: 'Hh3-btn_id_ICM003'})
          .on('clicked', function () {
            this.ui.windows.addModule(Combat.Options, {
              withinWindow: this,
              variablesSupported: !!this.el.css('--HC'),
            })
          }, this)
        this.addModule('surrender', Combat.Button.Surrender, {attachPath: buttons, combat: this})
        this.addModule('retreat', Combat.Button.Retreat, {attachPath: buttons, combat: this})
        this.addModule('auto', H3Bits.Button, {attachPath: buttons, elClass: 'Hh3-btn_id_ICM004 Hh3-btn_dis'})

        this.addModule('tacticsNext', Combat.Button.TacticsNext, {attachPath: buttons, combat: this})
        this.addModule('tacticsEnd', Combat.Button.TacticsEnd, {attachPath: buttons, combat: this})
        this.addModule('log', Combat.Log, {attachPath: buttons, combat: this.combat})

        this.addModule('spells', Combat.SpellBook.Button.Combat, {attachPath: buttons, elClass: 'Hh3-btn_id_ICM005', context: this.map.constants.spell.context.combat, combatState: this.state})
          .on('cast', '_cast', this)
        this.addModule('wait', Combat.Button.Wait, {attachPath: buttons, combat: this})
        this.addModule('defend', Combat.Button.Defend, {attachPath: buttons, combat: this})

        this.addModule('queue', Combat.Queue, {combat: this})
        // Needs Log to be already nested.
        this.addModule('map', Combat.Map, {window: this})

        this._preload()

        var updateState = function () {
          var now = this.combat.get('state')
          this.el.toggleClass('Hh3-cm_cursor_wait', now == null || now == 'init')

          panel.set('file', now == 'tactics' ? 'COPLACBR' : 'CBAR')

          this.nested('tacticsNext').el
            .add(this.nested('tacticsEnd').el)
            .toggle(now == 'tactics')

          this.nested('log').el
            .add(this.nested('log')._slider.el)
            .toggle(now != 'tactics')

          if (now == 'tactics' && this.ifSet('tacticsMessage', true)) {
            var box = this.ui.windows.addModule(H3Bits.MessageBox, {withinWindow: this})
            box.addFromMarkup(this.cx.s('combat', '`## Tactics Phase\n\nIn the Tactics Phase, a hero with superior Tactics skill may arrange his armies before combat begins.'))
            box.addButton()
          }
        }.bind(this)

        updateState()
        this.autoOff(this.combat, {
          change_state: updateState,
        })

        var options = {cx: this}
        this.autoOff(this.state, {
          // _updateMode() only depends on change_creature/interactive but
          // change_phase occurs before all other change_OPT of State; if not
          // hooked and when nesting a Mode hooking it (e.g. Mode.Attack), that
          // Mode's update would be called in response to change_phase, before
          // could _updateMode() run and possibly remove the Mode (such as due to
          // combat ending).
          'change_creature, change_interactive, change_phase': Common.batchGuard(2, '_updateMode', options),
        })

        this.autoOff(this.nested('map')._transitions, {
          change_pending: '_updateMode',
        })

        var updateSpeed = function () {
          var speed = this.sc.get('combatSpeed')
          this.el.css({'--HS': speed, '--HC': speed, '--HH': speed})
        }.bind(this)
        this.autoOff(this.sc, {
          change_combatSpeed: updateSpeed,
        })
        updateSpeed()
      },

      render: function () {
        function add(party) {
          this._animateHero(party, true)
        }

        this.combat.parties.on({
          nestExNew: function (res) {
            add.call(this, res.child)
          },

          unnested: function (party, key) {
            // Keeping image nodes if removal is caused by combat end. We wait for transitions to finish before closing the window so if we remove these, hero animation initiated as part of a transition won't ever finish (playAnimation() won't call done).
            //
            // XXX=I that's still a problem if a party is removed mid-combat (e.g. due to fleeing); we don't have this feature yet so not addressing it
            //
            // Also not clearing _animateHero timers because that method is playing cheers animation in non-classic mode upon combat end.
            if (this.combat.get('state')) {
              clearTimeout(this._timers[key])
              party.get('mapImage' + this._cid) && party.get('mapImage' + this._cid).remove()
              party.get('mapFlagImage' + this._cid) && party.get('mapFlagImage' + this._cid).remove()
            }
          },
        }, this)

        this.combat.parties.each(add, this)
      },

      '-unnest': function () {
        if (this._parent) {
          this.sc.transitions.mute(this.nested('map')._transitions.channel, false)
          _.each(this._timers, clearTimeout)
          this.state.remove()
          this._info && this._info.remove()
        }
      },

      '=cancel': function (sup) {
        return this.get('canClose') ? sup(this, arguments) : null
      },

      change_infoObject: function (now) {
        this._info && this._info.remove()
        this._info = null

        // Not listening to change_combatCreatureInfo since this box appears on
        // creature hover and this setting can't be changed without hovering
        // off the creature or hero.
        if (now && this.sc.get('combatCreatureInfo')) {
          if (now instanceof HMap.Combat.Party) {
            if (now.object && now.object.isHero) {
              this._info = this.ui.windows.addModule(Combat.PartyInfo, {withinWindow: this, combat: this.combat, party: now, hero: now.object})
              this._info.el.addClass('Hh3-cm-info_pos_' + now.get('placement'))
            }
          } else {
            this._info = this.sc.get('combatCreatureInfo') == 'spell'
              ? this.ui.windows.addModule(Combat.CreatureSpellInfo, {withinWindow: this, combat: this.combat, creature: now})
              : this.ui.windows.addModule(Combat.CreatureInfo, {withinWindow: this, combat: this.combat, creature: now})
            this._info.el.addClass('Hh3-cm-info_pos_' + now.party.get('placement'))
          }
        }
      },
    },

    elEvents: {
      mousedown: function () {
        // Not aborting transitions that have just started playing.
        //
        // XXX=I aborting doesn't work well ATM (at least on combatMove), likely due to improper handling of transitions abort
        //this.cx.get('classic') || this.nested('map')._transitions.abortPlaying(750)
      },
    },

    _updateMode: function () {
      // _updateMode() can be called from several hooks after the combat window was removed (_parent might be still set though) so checking for presence of map.
      //
      // It may also be called during attach but only after map is already nested so no need to account for that.
      if (!this.nested('map')) {
        return
      }

      if (!this.state.canControl() ||
          // XXX=I even though mode is disabled while transitions are pending, bottom panel buttons are currently kept enabled
          //
          // XXX=IC SoD also hides active outline (yellow) of current creature during animations
          this.nested('map')._transitions.get('pending')) {
        if (this.combat._parent) {
          // If combat is still going on, let user examine creature info while he's waiting. If combat's destroyed, that's pretty useless since we can't even show stats of alive creatures, so no Mode in that case.
          var cls = Combat.Map.Mode.Informational
        } else {
          return this.nested('map').unlist('mode')
        }
      } else if (this.state.get('creature').get('special') == this.rules.constants.creature.special.firstAidTent) {
        var cls = Combat.Map.Mode.FirstAid
      } else {
        var cls = Combat.Map.Mode.Attack
      }

      var cur = this.nested('map').nested('mode')
      if (!cur || !(cur instanceof cls)) {
        this.nested('map').addModule('mode', cls, {map: this.nested('map')})
      }
    },

    _animateHero: function (party, first) {
      if (!first) {
        var image = party.get('mapImage' + this._cid)
        if (!image) { return }

        if (!image.isPlayingAnimation()) {
          if (this.combat.get('state')) {
            var anim = this.map.constants.animation.group.heroShuffle
          } else if (!this.cx.get('classic')) {
            var anim = this.map.constants.animation.group[party.get('mapAlive' + this._cid) ? 'heroWin' : 'heroLose']
          }
          anim && image.playAnimation(anim, this.sc.get('combatSpeed'))
        }
      }

      var time = (!this.combat.get('state') + 1) * heroAnimTime
      var timer = setTimeout(this._animateHero.bind(this, party), _.random(time / 2, time))
      this._timers[party._parentKey] = timer
    },

    _partyClicked: function (party, e) {
      if (party.object && party.object.isHero) {
        if (e.button == 2) {
          // If user has disabled "creature info" then party (hero) info box is not
          // shown on hover but shown on RMB click (temporarily). If "info"
          // is enabled then it's shown on hover and RMB click does nothing.
          if (!this._info) {
            this._info = this.ui.windows.addModule(Combat.PartyInfo, {
              withinWindow: this,
              tooltip: true,
              combat: this.combat,
              party: party,
              hero: party.object,
            })

            this._info.el.addClass('Hh3-cm-info_pos_' + party.get('placement'))

            $(window).one('contextmenu', function () {
              if (this._info) {
                this._info.remove()
                this._info = null
                return false
              }
            }.bind(this))
          }
        } else if (party.player == this.pl && !this.nested('spells').get('disabled')) {
          var book = this.ui.windows.addModule(Combat.SpellBook, {
            withinWindow: this,
            hero: party.object,
            context: this.map.constants.spell.context.combat,
          })
          this.autoOff(book, {
            cast: function () {
              this._cast.apply(this, [book].concat(_.toArray(arguments)))
            },
          })
        }
      }
    },

    // XXX=R
    _cast: function (book, spell) {
      var map = this.nested('map')

      // SoD closes the book even if selected spell can't be cast because it won't affect anyone.
      if (this.cx.get('classic') && book) {
        book.cancel()
        book = null
      }

      // Spells are logically split into such groups:
      // (B)less     - affect one or all (Expert) allies for spell-specific bonus
      // (C)urse     - as (B) but affect enemy
      // (A)rrow     - make damage to one enemy
      // (R)ipple    - make damage to all creatures by condition
      // (F)ireball  - make damage to all creatures in spot
      // (S)ummon    - ...a creature, preventing other summon spells for this party in this combat

      // Implemented spell IDs:
      //   2 15 16 17 18 19 20 21 22 23 24 25 26 27 28 30 31 32 33 34 35 37 41 42 43
      //   44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 61 66 67 68 69
      switch (spell) {
        default:
          this.ui.windows.addModule(H3Bits.MessageBox, {withinWindow: this})
            .addText(this.cx.s('combat', 'HeroWO doesn\'t yet support this spell. Sorry!'))
            .addButton()
          break

        // disruptingRay, etc. and (B) and (C) are essentially the same as (A) as far as the UI is concerned - user needs to pick one creature which is targeted by an "arrow". It's Effects of that arrow that vary (straight damage or something else) but it's the domain of RPC. So using Mode.Arrow to handle all of these.
        case this.rules.spellsID.disruptingRay:
        case this.rules.spellsID.cure:
        case this.rules.spellsID.bless:       // (B)
        case this.rules.spellsID.antiMagic:
        case this.rules.spellsID.bloodlust:
        case this.rules.spellsID.haste:
        case this.rules.spellsID.protectionFromWater:
        case this.rules.spellsID.protectionFromFire:
        case this.rules.spellsID.shield:
        case this.rules.spellsID.stoneSkin:
        case this.rules.spellsID.fortune:
        case this.rules.spellsID.precision:
        case this.rules.spellsID.protectionFromAir:
        case this.rules.spellsID.airShield:
        case this.rules.spellsID.mirth:
        case this.rules.spellsID.protectionFromEarth:
        case this.rules.spellsID.counterstrike:
        case this.rules.spellsID.prayer:
        case this.rules.spellsID.frenzy:
        case this.rules.spellsID.slayer:
        case this.rules.spellsID.curse:   // (C)
        case this.rules.spellsID.slow:
        case this.rules.spellsID.weakness:
        case this.rules.spellsID.forgetfulness:
        case this.rules.spellsID.misfortune:
        case this.rules.spellsID.sorrow:
        case this.rules.spellsID.magicArrow:      // (A)
        case this.rules.spellsID.iceBolt:
        case this.rules.spellsID.lightningBolt:
        case this.rules.spellsID.titanBolt:
        case this.rules.spellsID.implosion:   // kick-ass
        case this.rules.spellsID.deathRipple:     // (R)
        case this.rules.spellsID.destroyUndead:
        case this.rules.spellsID.armageddon:
          map.addModule('mode', Combat.Map.Mode.Spell.Arrow, {
            map: map,
            spell: spell,
            book: book,
          })
          break
        case this.rules.spellsID.fireball:    // (F)
        case this.rules.spellsID.frostRing:
        case this.rules.spellsID.inferno:
        case this.rules.spellsID.meteorShower:
          map.addModule('mode', Combat.Map.Mode.Spell.Area, {
            map: map,
            spell: spell,
            book: book,
          })
          break
        case this.rules.spellsID.dispel:
          var mode = map.addModule('mode', Combat.Map.Mode.Spell.Dispel, {
            map: map,
            spell: spell,
            book: book,
          })
          break
        case this.rules.spellsID.chainLightning:
          var mode = map.addModule('mode', Combat.Map.Mode.Spell.ChainLightning, {
            map: map,
            spell: spell,
            book: book,
          })
          break
        case this.rules.spellsID.airElemental:      // (S)
        case this.rules.spellsID.earthElemental:
        case this.rules.spellsID.fireElemental:
        case this.rules.spellsID.waterElemental:
          var cur = this.state.get('interactive').find(function (cr) { return cr.get('origin') && cr.get('origin')[0] == this.map.constants.garrison.origin.spell }, this)
          if (cur && cur[1] != spell) {
            var name = this.cx.oneShotEffectCalculation({
              class: Calculator.Effect.GenericString,
              target: this.cx.map.constants.effect.target.name,
              ifObject: this.state.get('interactive').object.get('id'),
            })
            var gender = this.cx.oneShotEffectCalculation({
              target: this.map.constants.effect.target.hero_gender,
              ifObject: this.state.get('interactive').object.get('id'),
            })
            var genders = {male: 'his', female: 'her'}
            this.ui.windows.addModule(H3Bits.MessageBox, {withinWindow: this})
              .addText(this.cx.s('combat', 'Because %s has already summoned %s, no other elementals will come to %s aid.'), name, this.rules.creatures.atCoords(cur.get('creature'), 0, 0, 'namePlural', 0), this.cx.s('combat', genders[_.indexOf(this.rules.constants.hero.gender, gender)] || 'its'))
              .addButton()
          } else {
            book.cancel()
            map.unlist('mode')

            var async = this.sc.rpc.do('combat', {
              combat: this.combat._parentKey,
              do: 'cast',
              spell: spell,
            })

            this.autoOff(async, {}).whenComplete(function () {
              this._updateMode()
            }, this)
          }

          break
      }
    },

    // Barely adequate (XXX=I) preloading. Without this animations even with local server are horrid.
    _preload: function () {
      var audio = new Set
      var classes = new Set

      'WALLMISS WALLHIT GOODMRLE BADMRLE GOODLUCK REGENER DRAWBRG MAGICRES'.split(' ').forEach(function (sound) {
        audio.add(sound)
      })

      this.combat.parties.each(function (party) {
        var image = party.get('mapImage' + this._cid)

        if (image) {
          'heroStand heroShuffle heroLose heroWin heroCast'.split(' ').forEach(function (group) {
            classes.add(image.get('def') + '-' + this.rules.constants.animation.group[group])
          }, this)

          var spells = this.cx.oneShotEffectCalculation({
            class: Calculator.Effect.GenericIntArray,
            target: this.map.constants.effect.target.hero_spells,
            ifObject: party.object.get('id'),
          })

          _.each(spells, function (spell) {
            audio.add(this.rules.spells.atCoords(spell, 0, 0, 'castSound', 0))

            _.each([].concat(this.rules.spells.atCoords(spell, 0, 0, 'castAnimation', 0)), function (def) {
              classes.add(def + '-0')
            })
          }, this)
        }
      }, this)

      this.combat.objects.each(function (obj) {
        if (obj instanceof HMap.Combat.Creature) {
          'ATTK ATK2 DFND KILL MOVE SHOT WNCE'.split(' ').forEach(function (suffix) {
            audio.add(this.rules.creatures.atCoords(obj.get('creature'), 0, 0, 'sound', 0) + suffix)
          }, this)

          'move hover stand hit defend die turnLeft turnRight attackUp attack attackDown shootUp shoot shootDown castUp cast castDown start stop'.split(' ').forEach(function (group) {
            classes.add(this.rules.creatureAnimations.atCoords(obj.get('creature'), 0, 0, 'image', 0) + '-' + this.rules.constants.animation.group[group])
          }, this)
        }
      }, this)

      var module = this.sc.get('audio')
      if (module && module.get('sfx')) {
        audio.forEach(function (sound) {
          var url = module.url(sound)
          url && $('<audio>').attr('src', url).hide().appendTo(this.el)
        }, this)
      }

      classes.forEach(function (cls) {
        $('<span>').addClass('Hh3-anim_id_' + cls).hide().appendTo(this.el)
      }, this)
    },
  })

  // Base class for floating left/right-side information windows (party/creature info).
  Combat.InfoBox = H3Bits.Window.extend({
    _opt: {
      combat: null,   // Combats key
      modal: false,
      hoist: false,
    },

    events: {
      init: function () {
        this.el.addClass('Hh3-cm-info')
      },
    },
  })

  Combat.PartyInfo = Combat.InfoBox.extend('HeroWO.H3.DOM.Combat.PartyInfo', {
    el: {class: 'Hh3-cm-pinfo Hh3-menu__text5'},

    _opt: {
      party: null,
      hero: null,
    },

    events: {
      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-cm-pinfo__*'}}})
        var hero = this.get('hero')

        this.el.addClass('Hrecolor_' + _.indexOf(this.rules.playersID, this.get('party').player.get('player')))

        this.addModule('bk', H3Bits.Bitmap, {file: 'CHRPOP'})

        this.el.append(
          '<div class="Hh3-cm-pinfo__l Hh3-cm-pinfo__l_s_attack">' + this.cx.s('combat', 'Att:') + '</div>' +
          '<div class="Hh3-cm-pinfo__l Hh3-cm-pinfo__l_s_defense">' + this.cx.s('combat', 'Def:') + '</div>' +
          '<div class="Hh3-cm-pinfo__l Hh3-cm-pinfo__l_s_spellPower">' + this.cx.s('combat', 'Pwr:') + '</div>' +
          '<div class="Hh3-cm-pinfo__l Hh3-cm-pinfo__l_s_knowledge">' + this.cx.s('combat', 'Know:') + '</div>' +
          '<div class="Hh3-cm-pinfo__l Hh3-cm-pinfo__l_s_morale Hh3-menu__text_toned">' + this.cx.s('combat', 'Morale:') + '</div>' +
          '<div class="Hh3-cm-pinfo__l Hh3-cm-pinfo__l_s_luck Hh3-menu__text_toned">' + this.cx.s('combat', 'Luck:') + '</div>' +
          '<div class="Hh3-cm-pinfo__l_s_spellPoints">' + this.cx.s('combat', 'Spell Points') + '</div>'
        )

        this.addModule('face', H3Bits.Bitmap.Portrait, {
          id: hero.get('id'),
        })

        this.addModule('luck', H3Bits.Luck, {
          size: 22,
          ifCombat: this.get('combat')._parentKey,
          ifCombatParty: this.get('party')._parentKey,
        })

        this.addModule('morale', H3Bits.Morale, {
          size: 22,
          ifCombat: this.get('combat')._parentKey,
          ifCombatParty: this.get('party')._parentKey,
        })

        var stats = {
          attack:      this.cx.map.constants.effect.target.hero_attack,
          defense:     this.cx.map.constants.effect.target.hero_defense,
          spellPower:  this.cx.map.constants.effect.target.hero_spellPower,
          knowledge:   this.cx.map.constants.effect.target.hero_knowledge,
        }
        _.each(stats, function (target, property) {
          this.addModule(property, Bits.String, {format: '%v'})
            .addCalculator('v', Calculator.Effect.GenericNumber, {
              target: target,
              ifObject: hero.get('id'),
            })
        }, this)

        var sp = this.addModule('spellPoints', Bits.String, {format: this.cx.s('combat', '%c/%m')})
        sp.addModule('c', Bits.ObjectRepresentationProperty, {
          object: hero,
          property: 'spellPoints',
        })
        sp.addCalculator('m', Calculator.Effect.GenericNumber, {
          target: this.cx.map.constants.effect.target.hero_spellPoints,
          ifObject: hero.get('id'),
        })
      },
    },
  })

  Combat.CreatureSpellInfo = Combat.InfoBox.extend('HeroWO.H3.DOM.Combat.CreatureSpellInfo', {
    el: {class: 'Hh3-cm-cinfo Hh3-cm-cinfo_sp'},

    _opt: {
      creature: null,
    },

    events: {
      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-cm-cinfo__*'}}})
        var creature = this.get('creature')

        this.el.addClass('Hrecolor_' + _.indexOf(this.rules.playersID, this.get('creature').party.player.get('player')))

        this.addModule('bk', H3Bits.Bitmap, {file: 'SPELLINF'})

        this.addModule('bufs', H3Bits.SpellAffectorList, {
          elClass: 'Hh3-menu__text5 Hh3-menu__text_toned',
          combat: this.get('combat')._parentKey,
          creature: creature._parentKey,
        })
      },
    },
  })

  Combat.CreatureInfo = Combat.CreatureSpellInfo.extend('HeroWO.H3.DOM.Combat.CreatureInfo', {
    el: {class: 'Hh3-cm-cinfo Hh3-cm-cinfo_full'},

    events: {
      attach: function () {
        var creature = this.get('creature')

        this.nested('bk').set('file', 'CCRPOP')

        this.el.append(
          '<div class="Hh3-cm-cinfo__l Hh3-cm-cinfo__l_s_attack Hh3-menu__text5">' + this.cx.s('combat', 'Att:') + '</div>' +
          '<div class="Hh3-cm-cinfo__l Hh3-cm-cinfo__l_s_defense Hh3-menu__text5">' + this.cx.s('combat', 'Def:') + '</div>' +
          '<div class="Hh3-cm-cinfo__l Hh3-cm-cinfo__l_s_damage Hh3-menu__text5">' + this.cx.s('combat', 'Dmg:') + '</div>' +
          '<div class="Hh3-cm-cinfo__l Hh3-cm-cinfo__l_s_hitPoints Hh3-menu__text5">' + this.cx.s('combat', 'Health:') + '</div>' +
          '<div class="Hh3-cm-cinfo__l Hh3-cm-cinfo__l_s_morale Hh3-menu__text5">' + this.cx.s('combat', 'Morale:') + '</div>' +
          '<div class="Hh3-cm-cinfo__l Hh3-cm-cinfo__l_s_luck Hh3-menu__text5">' + this.cx.s('combat', 'Luck:') + '</div>'
        )

        this.addModule('face', H3Bits.CreatureImage, {
          creature: creature.get('creature'),
          type: 'large',
        })

        this.addModule('count', Bits.ObjectRepresentationProperty, {
          elClass: 'Hh3-menu__text7',
          object: creature,
          property: 'count',
        })

        var stats = {
          attack:      this.cx.map.constants.effect.target.creature_attack,
          defense:     this.cx.map.constants.effect.target.creature_defense,
        }
        _.each(stats, function (target, property) {
          var str = this.addModule(property, Bits.String, {
            elClass: 'Hh3-menu__text5',
            format: this.cx.s('combat', '%db(%act)'),
          })
          str.addModule('db', H3Bits.DatabankProperty, {
            el: false,
            collection: 'creatures',
            entity: creature.get('creature'),
            property: property,
          })
          str.addCalculator('act', Calculator.Effect.GenericNumber, {
            target: target,
            ifCombat: this.get('combat')._parentKey,
            ifCombatCreature: creature._parentKey,
          })
        }, this)

        var damage = this.addModule('damage', Bits.String, {
          elClass: 'Hh3-menu__text5',
          format: this.cx.s('combat', '%l-%h'),
        })
        // XXX=R duplicates with CreatureInfo's
        damage.fuse('+normalize_value', function () {
          var low = damage.nested('l')
          var high = damage.nested('h')
          if (low && high && low.get('value') == high.get('value')) {
            return low.get('value')     // 20-20 -> 20
          }
        })
        damage.addModule('l', H3Bits.DatabankProperty, {
          el: false,
          collection: 'creatures',
          entity: creature.get('creature'),
          property: 'damageMin',
        })
        damage.addModule('h', H3Bits.DatabankProperty, {
          el: false,
          collection: 'creatures',
          entity: creature.get('creature'),
          property: 'damageMax',
        })

        // XXX=I show total "(hp)" of top stack in nonclassic mode
        this.addModule('hitPoints', Bits.String, {
          elClass: 'Hh3-menu__text5',
          format: this.cx.s('combat', '%v'),
        })
          .addCalculator('v', Calculator.Effect.GenericNumber, {
            target: this.map.constants.effect.target.creature_hitPoints,
            ifObject: creature.party.object.get('id'),
            ifCreature: creature.get('creature'),
          })

        this.addModule('luck', H3Bits.Luck, {
          size: 22,
          ifCombat: this.get('combat')._parentKey,
          ifCombatCreature: creature._parentKey,
        })

        this.addModule('morale', H3Bits.Morale, {
          size: 22,
          ifCombat: this.get('combat')._parentKey,
          ifCombatCreature: creature._parentKey,
        })
      },
    },
  })

  // Base class for buttons used in combat.
  Combat.Button = H3Bits.Button.extend({
    combat: null,   //= H3.DOM.Combat

    _initToOpt: {
      combat: '.',
    },
  })

  // Displays a button for surrendering a combat. Used in the status bar.
  Combat.Button.Surrender = Combat.Button.extend('HeroWO.H3.DOM.Combat.Button.Surrender', {
    el: {class: 'Hsfx__btn Hh3-btn_id_ICM001'},

    events: {
      attach: function () {
        this.autoOff(this.combat.state, {
          change_phase: 'update',
          change_interactive: 'update',
        })
      },

      _update: function () {
        this.set('disabled',
          !this.combat.state.get('interactive') ||
          !this.combat.state.get('interactive').object ||
          !this.combat.state.get('interactive').object.isHero ||
          !this.enemy())
      },

      // XXX=R
      clicked: function () {
        var name = this.cx.oneShotEffectCalculation({
          class: Calculator.Effect.GenericString,
          target: this.cx.map.constants.effect.target.name,
          ifObject: this.enemy().object.get('id'),
        })
        var ress = []
        var shortage = []
        _.each(this.rules.constants.resources, function (res, name) {
          var cost = this.cx.oneShotEffectCalculation({
            target: this.cx.map.constants.effect.target.surrenderCost,
            ifObject: this.combat.state.get('interactive').object.get('id'),
            ifOpponent: this.enemy().object.get('id'),
            ifResource: res,
            ifCombatParty: this.combat.state.get('interactive')._parentKey,
            ifCombat: this.combat.combat._parentKey,
          })
          if (cost) {
            ress.push(_.format(this.cx.s('combat', '%d %s'), cost, this.cx.s('combat', name)))
            if (this.pl.get('resources_' + name) < cost) {
              shortage.push(this.cx.s('combat', name))
            }
          }
        }, this)
        var box = this.combat.ui.windows.addModule(H3Bits.MessageBox, {withinWindow: this.combat})
        if (this.cx.get('classic')) {
          box.addText(this.cx.s('combat', '%s states:'), name)
          box.addText(this.cx.s('combat', '"I will accept your surrender and grant you and your troops safe passage for the price of %s."'), ress.join(this.cx.s('combat', ', ')))
        } else {
          box.addText(this.cx.s('combat', 'Ask %s to grant safe passage to your troops for the price of %s?'), name, ress.join(this.cx.s('combat', ', ')))
        }
        var okay = box.addButton('Hh3-btn_id_IOKAY', 'submit')
        box
          .addButtonThis('Hh3-btn_id_ICANCEL', 'cancel')
          .once('unnest', function () {
            if (box.get('button') == okay) {
              if (shortage.length) {
                this.combat.ui.windows.addModule(H3Bits.MessageBox, {withinWindow: this.combat})
                  .addText(this.cx.s('combat', 'You don\'t have enough %s!'), shortage.join(this.cx.s('combat', ', ')))
                  .addButton()
              } else if (!this.combat.state.calculateHero('surrenderCan').updateIfNeeded().get('value')) {
                var name = this.cx.oneShotEffectCalculation({
                  class: Calculator.Effect.GenericString,
                  target: this.cx.map.constants.effect.target.name,
                  ifObject: this.combat.state.get('interactive').object.get('id'),
                })
                // SoD displays a more detailed message:      XXX=IC
                //   The Shackles of War are present.  %s can not %s!
                this.combat.ui.windows.addModule(H3Bits.MessageBox, {withinWindow: this.combat})
                  .addText(this.cx.s('combat', 'Mysterious forces prevent %s from surrendering!'), name)
                  .addButton()
              } else {
                this.sc.rpc.do('combat', {
                  combat: this.combat.combat._parentKey,
                  do: 'surrenderAsk',
                })
                  .whenError(function () {
                    this.combat.ui.windows.addModule(H3Bits.MessageBox, {withinWindow: this.combat})
                      .addText(this.cx.s('combat', 'Your offer was rejected!'))
                      .addButton()
                  }, this)
              }
            }
          }, this)
      },
    },

    // May return the neutral.
    enemy: function () {
      return this.combat.combat.parties.find(function (party) {
        return party.player.get('team') != this.pl.get('team')
      }, this)
    },
  })

  // Displays a button for fleeing from combat. Used in the status bar.
  Combat.Button.Retreat = Combat.Button.extend('HeroWO.H3.DOM.Combat.Button.Retreat', {
    el: {class: 'Hsfx__btn Hh3-btn_id_ICM002'},

    events: {
      attach: function () {
        this.autoOff(this.combat.state, {
          change_phase: 'update',
          change_interactive: 'update',
        })
      },

      _update: function () {
        this.set('disabled',
          !this.combat.state.get('interactive') ||
          !this.combat.state.get('interactive').object ||
          !this.combat.state.get('interactive').object.isHero)
      },

      clicked: function () {
        var box = this.combat.ui.windows.addModule(H3Bits.MessageBox, {withinWindow: this.combat})
          .addText(this.cx.s('combat', 'Are you sure you want to retreat?'))
        var okay = box.addButton('Hh3-btn_id_IOKAY', 'submit')
        box
          .addButtonThis('Hh3-btn_id_ICANCEL', 'cancel')
          .once('unnest', function () {
            if (box.get('button') == okay) {
              if (!this.combat.state.calculateHero('retreatCan').updateIfNeeded().get('value')) {
                var name = this.cx.oneShotEffectCalculation({
                  class: Calculator.Effect.GenericString,
                  target: this.cx.map.constants.effect.target.name,
                  ifObject: this.combat.state.get('interactive').object.get('id'),
                })
                // SoD displays a more detailed message:      XXX=IC
                //   The Shackles of War are present.  %s can not %s!
                this.combat.ui.windows.addModule(H3Bits.MessageBox, {withinWindow: this.combat})
                  .addText(this.cx.s('combat', 'Mysterious forces prevent %s from retreating!'), name)
                  .addButton()
              } else {
                this.sc.rpc.do('combat', {
                  combat: this.combat.combat._parentKey,
                  do: 'retreat',
                })
              }
            }
          }, this)
      },
    },
  })

  // Displays a button for putting current creature in defensive stance. Used in the status bar.
  Combat.Button.Defend = Combat.Button.extend('HeroWO.H3.DOM.Combat.Button.Defend', {
    el: {class: 'Hsfx__btn Hh3-btn_id_ICM007'},

    events: {
      attach: function () {
        this.autoOff(this.combat.state, {
          change_phase: 'update',
          change_interactive: 'update',
        })
      },

      _update: function () {
        this.set('disabled',
          this.combat.state.get('phase') != 'combat' ||
          !this.combat.state.get('interactive'))
      },

      clicked: function () {
        this.sc.rpc.do('combat', {
          combat: this.combat.combat._parentKey,
          do: 'defend',
        })
      },
    },
  })

  // Displays a button for skipping current creature's turn. Used in the status bar.
  Combat.Button.Wait = Combat.Button.Defend.extend('HeroWO.H3.DOM.Combat.Button.Wait', {
    el: {class: 'Hsfx__btn Hh3-btn_id_ICM006'},

    events: {
      attach: function () {
        this.autoOff(this.combat.state, {
          change_creature: function (now, old) {
            old && this.autoOff(old)
            now && this.autoOff(now, {change_queueWait: 'update'})
            this.update()
          },
        })
      },

      _update: function () {
        this.getSet('disabled', function (cur) {
          return cur ||   // inherited Combat.Button.Defend's
                 this.combat.state.get('creature').get('queueWait')
        })
      },

      '=clicked': function () {
        this.sc.rpc.do('combat', {
          combat: this.combat.combat._parentKey,
          do: 'wait',
        })
      },
    },
  })

  // Displays a button for starting combat. Used in the status bar during tactics only.
  Combat.Button.TacticsEnd = Combat.Button.extend('HeroWO.H3.DOM.Combat.Button.TacticsEnd', {
    el: {class: 'Hsfx__btn Hh3-btn_id_ICM012'},

    events: {
      attach: function () {
        this.autoOff(this.combat.state, {
          change_phase: 'update',
          change_interactive: 'update',
        })
      },

      _update: function () {
        this.set('disabled', this.combat.state.get('phase') != 'tactics' || !this.combat.state.get('interactive'))
      },

      clicked: function () {
        this.sc.rpc.do('combat', {
          combat: this.combat.combat._parentKey,
          do: 'tacticsEnd',
        })
      },
    },
  })

  // Displays a button for proceeding to next creature during tactics phase. Used in the status bar during tactics only.
  Combat.Button.TacticsNext = Combat.Button.TacticsEnd.extend('HeroWO.H3.DOM.Combat.Button.TacticsNext', {
    el: {class: 'Hsfx__btn Hh3-btn_id_ICM011'},

    events: {
      _update: function () {
        this.getSet('disabled', function (cur) {
          return cur ||   // inherited Combat.Button.TacticsEnd's
            // Disable the "Next Creature" button if the party has just one creature.
            (this.cx.get('classic') && this.combat.combat.queue.length < 2)
        })
      },

      '=clicked': function () {
        this.sc.rpc.do('combat', {
          combat: this.combat.combat._parentKey,
          do: 'tacticsNext',
        })
      },
    },
  })

  // Returns current value of sqimitive's `'prop if it's the "same" as new `'value. Used for `'+normalize_OPT.
  //
  // Treats null/false as []. Always returns an array.
  //
  // Keeps duplicates but treats them as one ([A, A] == [A] and won't fire change).
  function normalizeCreatureArray(self, value, prop) {
    value || (value = [])

    var old = new Set
    self.get(prop).forEach(function (cr) { old.add(cr) })

    if (value.some(function (cr) { return !old.delete(cr) }) || old.size) {
      return value
    } else {
      return self.get(prop)
    }
  }

  // Uses browser's DOM to draw combat objects and create a square grid.
  Combat.Map = Bits.Base.extend('HeroWO.H3.DOM.Combat.Map', {
    combat: null,   // Map.Combat
    objects: null,  // Map.Combat.Objects
    state: null,    // Combat.State
    _objectsEl: null,
    _cellEls: null,   // array x*y => Element
    _timers: [],
    _fullHexHeight: 0,
    _fullHexHeight_d3: 0,
    // Array n (w*h) => [x, y] of reachable spot (state.pathTo() == true).
    _canStandOn: null,
    _transitions: null,

    _opt: {
      window: null,
      hoveredCreatures: [],    // array of Map.Combat.Creature; for internal use by Mode, affects image outline only
      mouseCursor: null,    // for internal use by Mode
      mouseCell: null,
      //  tl /\ tr
      //    /..\       ... = mouse pointer position
      // l |....| r          (insides of mouseCell)
      //   |....|
      //    \../
      //  bl \/ br
      mouseSide: null,
      // Assuming there is 0 or 1 Main building per combat, this is null or that Creature.
      middleTower: null,
    },

    events: {
      init: function (opt) {
        this.combat = opt.window.combat
        this.objects = opt.window.combat.objects
        this.state = opt.window.state
      },

      '+normalize_hoveredCreatures': function (res, value) {
        return normalizeCreatureArray(this, value, 'hoveredCreatures')
      },

      '+normalize_mouseCell': function (res, value) {
        return Common.normIntArrayCompare(value, this.get.bind(this, 'mouseCell'))
      },

      change_middleTower: function (now) {
        // XXX=IC SoD also has a similar off-field area for hovering of the top tower; currently we only allow hovering of it by the impassable cell it stands on (11;0) - while in SoD hovering it produces impassable cursor without targeting the tower
        this.$('.Hh3-cm__map-keep').toggle(!!now)
      },

      owned: function () {
        this._transitions = this.addModule(Combat.Map.Transitions, {
          combat: this.combat,
          map: this,
        })
      },

      attach: function () {
        var dimensions = this.combat.get()

        this.autoOff(this.combat, {
          change_interactiveCreature: function (now, old) {
            if (old && old._parent) {
              this._setImageFeatures(old,
                this.get('hoveredCreatures').indexOf(old) == -1 ? [] : ['hover'])
            }
            now && this._setImageFeatures(now, ['activeTurn'])
          },
        })

        this.fuse('change_hoveredCreatures', function (now, old) {
          _.each(old || [], function (old) {
            if (old != this.combat.get('interactiveCreature') && old._parent) {
              this._setImageFeatures(old, [])
            }
          }, this)
          _.each(now || [], function (now) {
            if (now != this.combat.get('interactiveCreature')) {
              this._setImageFeatures(now, ['hover'])
            }
            if (!now.get('mapImage' + this.get('window')._cid).isPlayingAnimation() && !now.get('mapImage' + this.get('window')._cid).get('preserveAnimation')) {
              // SoD doesn't play creature animations ('stand') while idling but it plays
              // 'hover' on mouse over. We (in non-classic mode) do play 'stand' periodically,
              // and we also explicitly play 'hover' on hover.
              now.get('mapImage' + this.get('window')._cid).playAnimation(this.map.constants.animation.group.hover, this.sc.get('combatSpeed'))
            }
          }, this)
        })

        this.autoOff(this.sc, {
          change_combatGrid: 'update',
        })

        this.el
          .css({
            // Longer by half due to the shift in odd rows.
            width: dimensions.width * hexWidth + hexWidth_d2,
            height: dimensions.height * hexHeight,
          })

        this._objectsEl = $('<div class=Hh3-cm__map-ims>').appendTo(this.el)[0]
        var map = $('<map>').attr('name', this._cid).appendTo(this.el)[0]
        var cells = Array(dimensions.width * dimensions.height)
        var areas = Array(dimensions.width * dimensions.height)

        var self = this
        var opt = this._opt
        var random = '$' + Common.Sqimitive.unique('wr')
        window['M' + random] = function (el, e) { self._gridMouseMove(el, e, opt) }
        window['L' + random] = this._gridMouseLeave.bind(this, map)
        window['D' + random] = function (el, e) {
          var xy = el.getAttribute('data-Hxy').split(',')
          self.cellClick(+xy[0], +xy[1], e)
        }
        window['C' + random] = function (el, e) {
          var xy = el.getAttribute('data-Hxy').split(',')
          self.cellContextMenu(+xy[0], +xy[1], e)
        }
        this.once('unnest', function () {
          delete window['M' + random]
          delete window['L' + random]
          delete window['D' + random]
          delete window['C' + random]
        })

        var listeners = ' onmousemove=M' + random + '(this,event)' +
                        ' onmouseleave=L' + random + '(event)' +
                        ' onmousedown=D' + random + '(this,event)' +
                        ' oncontextmenu=C' + random + '(this,event)'

        for (var x = 0; x < dimensions.width; x++) {
          for (var y = 0; y < dimensions.height; y++) {
            var pos = this.hexToSquare(x, y)
            var left = pos[0]
            var top = pos[1]

            var n = x + y * dimensions.width

            cells[n] =
              '<div class=Hh3-cm__grid-cell style="' +
              'left:' + left + 'px;' +
              'top:'  + top  + 'px;' +
              'z-index:' + this._zIndexFor('cell', x, y) +
              '"></div>'

            // Shape of CCELLGRD. It is important that the resulting <map>
            // doesn't have gaps to avoid mis-triggering onmouseleave.
            var coords = [
              left + 19, top + 0,
              left + 25, top + 0,
              left + 44, top + 10,
              left + 44, top + 41,
              left + 25, top + 51,
              left + 19, top + 51,
              left + 0,  top + 41,
              left + 0,  top + 10,
            ]
            areas[n] =
              '<area shape=poly coords=' + coords +
              ' data-Hxy=' + x + ',' + y +
              ' data-Hx2=' + (left + hexWidth_d2) +
              ' data-Hy0=' + top +
              listeners +
              '></area>'
          }
        }

        this._objectsEl.innerHTML = cells.join('')
        this._cellEls = this._objectsEl.children

        map.innerHTML = areas.join('')

        var gridSize = 1 + dimensions.width % 2   // 1 if even, 2 if odd
        if ((dimensions.height - 1) % 4 == 0) {   // 1 5 9 ...
          // Okay.
        } else if ((dimensions.height + 1) % 4 == 0) {   // 3 7 11 ...
          gridSize += 2
        } else {
          console && console.warn('No grid background variant for this combat field dimensions.')
        }

        $('<div class=Hh3-cm__map-grid>')
          .addClass('Hh3-cm__map-grid_size_' + gridSize)
          .css('zIndex', this._zIndexFor('grid'))
          .appendTo(this._objectsEl)

        $('<img class=Hh3-cm__map-map>')
          .attr('src', Common.blankGIF)
          .attr('usemap', '#' + this._cid)
          .appendTo(this.el)

        // Middle Tower (Main Building) is fully passable and beyond the right edge of the field and therefore not selectable normally.
        $('<div class=Hh3-cm__map-keep>').hide().appendTo(this.el)
      },

      render: function () {
        this.objects.on({
          nestExNew: function (res) {
            this._addObject(res.child, res)
          },

          unnested: function (obj, key) {
            clearTimeout(this._timers[key])
          },
        }, this)

        this.objects.each(this._addObject, this)
      },

      unnest: function () {
        _.each(this._timers, clearTimeout)
      },

      '+normalize_mouseCursor': function (value) {
        // Keep 'wait' cursor set by Combat during combat initialization.
        return this.state.get('phase') ? value : null
      },

      change_mouseCursor: function (now, old) {
        function css(name) {
          // Special cursor using animation (CRSPELL.DEF).
          return name == 'cast' ? 'Hh3-anim_id_CRSPELL-0'
            : 'Hh3-cm_cursor_' + name
        }

        if (now && old) {
          this.el[0].classList.replace(css(old), css(now))
        } else {
          old ? this.el.removeClass(css(old)) : this.el.addClass(css(now))
        }
      },

      _update: function () {
        this.el.toggleClass('Hh3-cm__map_grid', this.sc.get('combatGrid'))
      },
    },

    elEvents: {
      'mouseenter .Hh3-cm__map-keep': 'middleTowerHovered',
      'mouseleave .Hh3-cm__map-keep': 'middleTowerHovered',
      'mousedown .Hh3-cm__map-keep': 'middleTowerClicked',
    },

    cellClick: Common.stub,
    cellContextMenu: Common.stub,

    // function (e)
    middleTowerHovered: Common.stub,
    middleTowerClicked: Common.stub,

    // function (n | x,y)
    //= Element
    gridCellAt: function (x, y) {
      return this._cellEls[y == null ? x : x + y * this.combat._opt.width]
    },

    // Places a new combat object onto the field.
    _addObject: function (obj, options) {
      var classes = ['Hh3-cm__map-cr']

      if (obj instanceof HMap.Combat.Object.Corpse) {
        classes.push('Hh3-cm__map-cr_name_' + _.indexOf(this.rules.creaturesID, obj.get('creature').get('creature')))

        obj.get('creature').get('facing') && classes.push('Hh3-cm__map-im_mirror')

        var image = this.addModule(H3Bits.CreatureImage, {
          attachPath: this._objectsEl,
          elClass: classes.join(' '),
          creature: obj.get('creature').get('creature'),
          type: 'animation',
          group: this.map.constants.animation.group.die,
        })

        image.set('frame', image.info('frameCount') - 1)
        image.el.css('fontSize', obj.get('width'))

        if (this.sc.transitions.of(options.transition, this._transitions._cid)) {
          image.el.hide()   // part of combatDie
        }
      } else if (obj instanceof HMap.Combat.Creature) {
        classes.push('Hh3-cm__map-cr_name_' + _.indexOf(this.rules.creaturesID, obj.get('creature')))

        obj.get('facing') && classes.push('Hh3-cm__map-im_mirror')

        var image = this.addModule(H3Bits.CreatureImage, {
          attachPath: this._objectsEl,
          elClass: classes.join(' '),
          creature: obj.get('creature'),
          type: 'animation',
          group: this.map.constants.animation.group.stand,
          frame: this.cx.get('classic') ? 0 : null,
        })

        image.el.css('fontSize', obj.get('width'))

        switch (obj.get('special')) {
          case this.rules.constants.creature.special.gate:
            image.el.toggle(obj.get('open'))
            break
          case this.rules.constants.creature.special.upperWall:
          case this.rules.constants.creature.special.lowerWall:
          case this.rules.constants.creature.special.midUpperWall:
          case this.rules.constants.creature.special.midLowerWall:
            var full = this.cx.oneShotEffectCalculation({
              target: this.map.constants.effect.target.creature_hitPoints,
              ifCombat: this.combat._parentKey,
              ifCombatCreature: obj._parentKey,
            })
            var opt = function (damaged) {
              return {
                group: this.map.constants.animation.group[damaged ? 'hit' : 'stand'],
                features: damaged ? [] : this._creatureImageFeatures(obj),
              }
            }.bind(this)
            if (obj.get('hitPoints') < full) {
              image.assignResp(opt(true))
            }
            obj.on('change_hitPoints', function (now, old, options) {
              this.sc.transitions.updateUsing(opt(now < full), options, image, 'assignResp')
            }, this)
            break
        }

        obj.on({
          change_facing: function (now) {
            image.el.toggleClass('Hh3-cm__map-im_mirror', !!now)
          },
        })

        var countImage = $('<div>')
          .addClass('Hh3-cm__map-cr-count')
          // Hide counts for walls/towers and catapult/etc.
          .toggle(!this.rules.creatures.atCoords(obj.get('creature'), 0, 0, 'damageGroup', 0) && (_.toArray(obj.get('origin'))[0] !== this.rules.constants.garrison.origin.artifact || obj.get('count') > 1))
          .appendTo(this._objectsEl)

        // XXX=R SpellAffectorList's logic must be extracted into a H3.Rules calculator and used here
        var affectors = this.addModule(H3Bits.SpellAffectorList, {
          combat: this.combat._parentKey,
          creature: obj._parentKey,
        })
        affectors.el.hide()

        var _updateCount = function (data) {
          var spells = _.fill(this.rules.constants.spell.aggression, 0)
          data.affectors.forEach(function (image) {
            var aggr = this.rules.spells.atCoords(image.get('spell'), 0, 0, 'aggression', 0)
            aggr && spells[_.indexOf(this.rules.constants.spell.aggression, aggr)]++
          }, this)

          if (!_.isEmpty(_.compact(spells))) {
            var feature = spells.offense && spells.defense ? 'confused' : spells.offense ? 'afflicted' : 'solaced'
          } else if (data.party.player == this.pl) {
            var feature = 'own'
          } else if (data.partyTeam == data.myTeam) {
            var feature = 'ally'
          } else {
            var feature = 'enemy'
          }
          Common.oneClass(countImage, 'Hh3-cm__map-cr-count_f_', feature)
          // XXX=IC SoD employs some uncertain logic in regards to the Y coord (sometimes the box is on top of the hex cell, sometimes on the bottom)
          var pos = this.hexToSquare(data.x + (data.facing ? 0 : data.width), data.y)
          var textOffset = this.rules.creatureAnimations.atCoords(data.creature, 0, 0, 'textOffset', 0)
          countImage
            .text(data.count)
            .css({
              // 1 is there to add border-width to hexWidth (which doesn't
              // include right cell's border).
              left: pos[0] + (data.facing ? -countImage.width() : 1) + textOffset * (data.facing ? -1 : +1),
              top: pos[1] + hexHeight / 2,
            })
        }

        var updateCount = function ($1, $2, options) {
          var data = _.extend(obj.get(), {
            affectors: affectors.toArray(),
            party: obj.party,
            partyTeam: obj.party.player.get('team'),
            myTeam: this.pl.get('team'),
          })
          // XXX=I currently affectors are not updated within a transition
          this.sc.transitions.updateUsing(data, options || {}, this, _updateCount)
        }.bind(this)

        obj.on({
          'change_count, change_x, change_y, change_facing': Common.batchGuard(2, updateCount),
        }, this)
        affectors.on({'nestExNew, unnested': updateCount})
        updateCount()
        countImage.on('-unnest', 'remove', affectors)
        obj.set('mapCountImage' + this.get('window')._cid, countImage)

        this._animateCreature(obj, true)

        if (obj.get('special') == this.rules.constants.creature.special.middleTower) {
          this.set('middleTower', obj)

          obj.on('unnest', function () {
            this.set('middleTower', null)
          }, this)
        }
      } else if (obj instanceof HMap.Combat.Object.Obstacle) {
        // Changing imageType/image of an Obstacle is possible in theory but
        // not supported for now.
        switch (obj.get('imageType')) {
          case this.map.constants.combatObstacle.imageType.bmp:
            var image = this.addModule(H3Bits.Bitmap, {
              attachPath: this._objectsEl,
              file: obj.get('image'),
            })
            break

          case this.map.constants.combatObstacle.imageType.def:
            var image = this.addModule(H3Bits.DefImage, {
              attachPath: this._objectsEl,
              def: obj.get('image'),
            })
            break

          default:
            throw new Error('Unknown $imageType.')
        }

        image.el
          .addClass('Hh3-cm__map-ob')
          .css({
            marginLeft: obj.get('offsetX'),
            marginTop: obj.get('offsetY'),
          })
      } else {
        throw new Error('Unknown object class.')
      }

      obj.set('mapImage' + this.get('window')._cid, image)

      this.autoOff(obj, {'change_x, change_y': function (now, old, options) {
        if (!this.sc.transitions.of(options.transition, this._transitions._cid)) {
          this._updateObject(obj)
        }
      }})

      this._updateObject(obj)
    },

    _updateObject: function (obj) {
      var square = this.hexToSquare(obj.get('x'), obj.get('y'))

      var el = obj.get('mapImage' + this.get('window')._cid).el[0]
      el.style.left = square[0] + 'px'
      el.style.top  = square[1] + 'px'

      this._updateObjectZIndex(obj, obj.get('x'), obj.get('y'))
    },

    _updateObjectZIndex: function (obj, x, y) {
      // Should overlay creatures standing in the corner near it.
      const lowerTowerZ = 10000
      // XXX=I Lower and mid-lower walls should use a kind of "inverse Z": unlike normal order, they overlay creatures standing on the right of them and underlay those on the left. This troublesome exception isn't implemented currently except for lower wall that overlays creatures both on the right (good) and left (bad).
      const lowerWallZ = lowerTowerZ - 1
      var add = 0
      if (obj instanceof HMap.Combat.Creature || obj instanceof HMap.Combat.Object.Corpse) {
        switch (obj.get('special')) {
          case this.map.constants.creature.special.trench:
            var type = 'trench'
            break
          case this.map.constants.creature.special.gate:
            var type = 'gate'
            break
          case this.map.constants.creature.special.lowerWall:
            add = lowerWallZ
          case this.map.constants.creature.special.lowerTower:
            add = add || lowerTowerZ
          default:
            var type = 'creature'
        }
      } else {
        switch (obj.get('countGroup')) {
          case this.map.constants.combatObstacle.countGroup.mlip:
            var type = 'trench'
            break
          case this.map.constants.combatObstacle.countGroup.tpwl:
            // TPWL (top wall) must overlay the upper tower but underly the creature standing on the same spot as TPWL (12;0).
            add = -1
          case this.map.constants.combatObstacle.countGroup.tw1:
            add = add || lowerTowerZ
          case this.map.constants.combatObstacle.countGroup.arch:
          case this.map.constants.combatObstacle.countGroup.wa2:
          case this.map.constants.combatObstacle.countGroup.wa5:
          case this.map.constants.combatObstacle.countGroup.tw2:
            var type = 'creature'
            break
          default:
            var type = 'obstacle'
        }
      }

      obj.get('mapImage' + this.get('window')._cid).el[0].style.zIndex = this._zIndexFor(type, x, y) + add

      var el = obj.get('mapCountImage' + this.get('window')._cid)
      if (el) {
        el[0].style.zIndex = this._zIndexFor('count', x, y)
      }
    },

    _zIndexFor: function (type, x, y) {
      var stride = this.combat.get('width')
      var n = x + y * stride + 1 /*for obstacle*/ + 1 /*for grid*/
      // SoD has strange rules for what overlays what. Sometimes cell
      // overlays obstacle, sometimes not. We don't try to be 100% authentic here.
      switch (type) {
        case 'trench':
          return -3
        case 'gate':
          return -2
        case 'grid':
          return -1
        case 'cell':
          return n
        case 'obstacle':
          return 0
        case 'creature':
        case 'count':
          // Multiplying by 2 to allocate 1 z-index that overlays x/y but underlays x+1/y. This is used for TPWL (top wall) - see _updateObjectZIndex().
          return (this.combat.get('height') * stride + 2) + n * 2
      }
    },

    _creatureImageFeatures: function (creature) {
      return this.combat.get('interactiveCreature') == creature
        ? ['activeTurn'] : this.get('hoveredCreatures').indexOf(creature) != -1 ? ['hover'] : []
    },

    // Calculates pixel-based coordinates for hexagon-based position on the field.
    hexToSquare: function (x, y) {
      return [x * hexWidth + (y + 1) % 2 * hexWidth_d2, y * hexHeight]
    },

    _animateCreature: function (creature, first) {
      // XXX=IC in classic mode arrow towers should not play idle (shuffle) and on-hover animations

      if (!first) {
        var image = creature.get('mapImage' + this.get('window')._cid)
        if (!image) { return }

        if (!image.isPlayingAnimation() && !image.get('preserveAnimation')) {
          // Note: animation can be resumed because of hover or activeTurn.
          // This is not the only place where playAnimation() is called.
          image.playAnimation(this.map.constants.animation.group.hover, this.sc.get('combatSpeed'))
        }
      }

      var delay = creatureFidgetInterval * (this.rules.creatureAnimations.atCoords(creature.get('creature'), 0, 0, 'fidgetInterval', 0) / 1000)

      if (delay) {
        var timer = setTimeout(this._animateCreature.bind(this, creature), _.random(delay / 2, delay))
        this._timers[creature._parentKey] = timer
      }
    },

    _gridMouseMove: function (el, e, opt) {
      // This needs node dimensions that is not available in attach/render
      // because the parent DOM.Combat's el is not yet part of the DOM
      // (Module's attach() is called before jQuery's attach()).
      if (!this._fullHexHeight) {
        this._fullHexHeight = $(this._cellEls[0]).height()   // bigger than hexHeight
        // In non-classic mode let more space in the middle work as an edge
        // cursor (l/r) rather than corner because user typically approaches
        // corner from top or bottom (where there is no l/r option).
        //   /\                       ^ tr
        //  /  \   v                  | r
        // |    |  | more space here: | r
        //  \  /   ^                  | r
        //   \/                       v br
        this._fullHexHeight_d3 = this._fullHexHeight / (this.cx.get('classic') ? 3.5 : 4)
      }
      var xy = el.getAttribute('data-Hxy').split(',')
      var cur = opt.mouseCell
      // Treat the cell as if it were a rectangle and split its insides into 2x3
      // sub-cells (whether equal or not depends on _fullHexHeight_d3).
      //
      // Browser adjusts offsetX/Y by current scaling factor so can use them as provided.
      var y = e.offsetY - el.getAttribute('data-Hy0')
      var side =
        (y < this._fullHexHeight_d3 ? 't' : y < this._fullHexHeight - this._fullHexHeight_d3 ? '' : 'b')
        +
        (e.offsetX < el.getAttribute('data-Hx2') ? 'l' : 'r')
      if (side != opt.mouseSide ||
          !cur || xy[0] != cur[0] || xy[1] != cur[1]) {
        this.batch(null, function () {
          this.set('mouseCell', xy)
          this.set('mouseSide', side)
        })
      }
    },

    _gridMouseLeave: function (map, e) {
      if (!e.relatedTarget || e.relatedTarget.parentNode != map) {
        this.batch(null, function () {
          this.set('mouseCell', null)
          this.set('mouseSide', null)
        })
      }
    },

    // Creature animation can be either 'hover' (randomly initiated, may be missing)
    // or 'stand'. These two groups (and no others) have variations by
    // activeTurn and hover features. We see if there's any current
    // animation and how far it's progressed, then interrupt it and
    // replace former group with 'stand' + feature and, if the animation
    // was running, start another one with 'hover' + feature but with
    // such delay that the outline would appear during the previous
    // animation.
    //
    // JavaScript doesn't allow learning the phase of a CSS animation,
    // but we can detect it indirectly by checking current value of
    // the animated property. Given that we know duration of each frame
    // in background-image, we can infer how much time the animation has
    // been running. We don't get 100% accurate timing this way -
    // given the interval of 100 ms:
    //
    //   0%  { background-image: url(...-0.png); }      0-99 ms
    //   33% { background-image: url(...-1.png); }    100-199 ms
    //   66% { background-image: url(...-3.png); }    200-299 ms
    //
    // Thus an attentive user might notice that the animation wasn't
    // restarted exactly as it were (such as if it was at 33% + 50 ms,
    // it would be rolled back to 100 ms, not 150 ms) but this is good
    // enough for now.
    //
    // To make this much more accurate we could introduce a second
    // animated property that we don't use (like font-size), that
    // would progress from 0.0 (0%) to 1.0 (100%). However, our .Hanim
    // are discrete (animation-timing-function: step-end) and we'd
    // have to add another node (or use a pseudo-element like
    // :before) and animate it separately while keeping both nodes'
    // animations in sync.
    //
    // XXX=I outlines of activeTurn and hover must be pulsating like in SoD
    _setImageFeatures: function (cr, features) {
      var image = cr.get('mapImage' + this.get('window')._cid)
      if (image.get('preserveAnimation')) { return }
      if (!image.el.css('backgroundImage')) {
        return console && console.warn("No background-image on Creature's mapImage node!")
      }
      switch (cr.get('special')) {
        case this.rules.constants.creature.special.trench:
          // SG*MOAT-s have "Generate Selection" disabled (see custom-graphics/DEF/gen.php).
          return
      }
      var frame = image.el.css('backgroundImage').match(/-(\d+)\.\w+['"]?\)\s*$/)[1]
      frame = frame * (image.info('duration') * this.sc.get('combatSpeed') / image.info('frameCount'))
      image.el.css('animationDelay', -frame + 'ms')
      image.assignResp({
        group: this.map.constants.animation.group.stand,
        features: features,
      })
      if (image.stopAnimation()) {
        // hover may not exist and animation won't be started (although we
        // are here when it was playing meaning it did exist... but just in case).
        frame = image.playAnimation(this.map.constants.animation.group.hover, this.sc.get('combatSpeed')) || frame
      }
      var lock = ++image._lock || (image._lock = 1)
      setTimeout(function () {
        if (image._lock == lock) {
          image.el.css('animationDelay', '')
        }
      }, frame)
    },
  })

  // Internal class implementing transitions of objects on the combat field (e.g. movement or dying).
  Combat.Map.Transitions = Common.jQuery.extend('HeroWO.H3.DOM.Combat.Map.Transitions', {
    mixIns: [Common.ScreenModule],
    combat: null,   // Map.Combat
    cmap: null,    // Combat.Map
    channel: '',  // only read
    _lingeringCreatures: {},    // former _parentKey => Creature
    _parallel: {},    // creatureKey (or former) => last locked Screen Transition

    typeGroups: {
      combatSpellArrow:   'spell',
      combatSpellArea:    'spell',
      combatSpellBuf:     'spell',
      combatSpellSummon:  'spell',
      combatRamHit:       'hit',
      combatDefend:       'hit',
      combatHit:          'hit',
      combatRamMiss:      'hit',
      combatAttack:       'hit',
      combatRam:          'hit',
      combatAttackUp:     'hit',
      combatRamUp:        'hit',
      combatAttackDown:   'hit',
      combatRamDown:      'hit',
      combatHurlMiss:     'status',
      combatHurlHit:      'status',
      combatMoraleGood:   'status',
      combatMoraleBad:    'status',
      combatLuckGood:     'status',
      combatRegenerating: 'status',
      combatShoot:        'shoot',
      combatHurl:         'shoot',
      combatShootUp:      'shoot',
      combatHurlUp:       'shoot',
      combatShootDown:    'shoot',
      combatHurlDown:     'shoot',
      combatLog:          '',
      combatMove:         '',
      combatSurrenderAsk: '',
      combatDie:          '',
      combatGate:         '',
      combatEnd:          '',
    },

    _opt: {
      pending: 0,
      removing: false,
    },

    _initToOpt: {
      combat: '.',
      map: '.cmap',
    },

    events: {
      init: function () {
        this.channel = 'combat' + this._cid
      },

      attach: function () {
        var typeGroups = this.typeGroups

        function all(prefix) {
          return _.keys(typeGroups)
            .map(function (s) { return prefix + s })
            .join(', ')
        }

        this.autoOff(this.sc.transitions, [
          all('+select_'), function (res, tr) {
            if (tr.get('combat') == this.combat._parentKey) {
              var muteable = tr.get('type') != 'combatSurrenderAsk'
              return (muteable ? '' : '!') + this.channel
            }
          },
          all('nest_'), function (view) {
            if (view.get('channel') == this.channel) {
              view.set(this._cid, true)
              view.once('-tick', function () { view.set(this._cid, Date.now()) }, this)
              var prefix = typeGroups[view.get('type')] || view.get('type')
              this._forward(prefix + '_', ['collect', 'tick'], view)
              this.getSet('pending', Common.inc())
            }
          },
          'unnested', function (view) {
            if (view.get(this._cid)) {
              this.getSet('pending', Common.inc(-1))
            }
          },
        ])

        this.autoOff(this.combat.objects, {
          unnested: function (obj, key) {
            if (obj.get('mapImage' + this.cmap.get('window')._cid)) {
              var view = this.sc.transitions.of((obj.get('removed') || {}).transition, this._cid)

              switch (view ? view.get('type') : !this.combat.get('state')) {
                case 'combatDie':
                case 'combatEnd':   // keep summoned (maxCombats: Ballista, etc.)
                case true:    // !state, combat destroying
                  this._lingeringCreatures[key] = obj
                  this.autoOff(obj.get('mapImage' + this.cmap.get('window')._cid), {
                    '-unnest': function () {
                      delete this._lingeringCreatures[key]
                    },
                  })
                  break
                case false:   // combat continuing
                  // Like with party images, keeping images of creatures removed as a result of destroying objects at combat end.
                  obj.get('mapImage' + this.cmap.get('window')._cid).remove()
                  obj.get('mapCountImage' + this.cmap.get('window')._cid).remove()
              }
            }
          },
        })
      },

      '-unnest': function () {
        if (this._parent) {
          this.set('removing', true)
          this.sc.transitions.each(function (view) {
            if (view.get('channel') == this.channel) {
              view.abort()
            }
          }, this)
        }
      },

      hit_tick: function (view, async) {
        switch (view.get('type')) {
          case 'combatRamHit':   // XXX=ID draw animations for this group
            return
          case 'combatDefend':
            var anim = anim || this.map.constants.animation.group.defend
            var sound = sound || 'DFND'
          case 'combatHit':
            var sound = sound || 'WNCE'
            // XXX=ID we lack impact animations for walls so not playing them (group.hit is used for damaged wall)
            var cr = this._lingeringCreature(view.get('creature'))
            // XXX+B got stack traces with null cr; remove ||
            if (!cr || this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'damageGroup', 0) == this.rules.constants.creature.damageGroup.wall) {
              return
            }
          case 'combatRamMiss':   // XXX=ID draw animations for this group
            var anim = anim || this.map.constants.animation.group.hit
            // The above animations are played together with others.
            var sound = sound || 'XXX=ID'
          case 'combatAttack':
          case 'combatRam':
            var anim = anim || this.map.constants.animation.group.attack
          case 'combatAttackUp':
          case 'combatRamUp':
            var anim = anim || this.map.constants.animation.group.attackUp
          case 'combatAttackDown':
          case 'combatRamDown':
            var anim = anim || this.map.constants.animation.group.attackDown
            var sound = sound || 'ATTK'
            async = async.nest({})
            this._lockCreatures(view, [view.get('creature')], function (unlock, creature) {
              if (sound) {
                if (sound == 'ATTK' && creature.get('creature') == this.rules.creaturesID.lich) {
                  sound = 'ATK2'    // XXX=RH exceptions to file names should be defined in databank, not in code
                }
                var prefix = this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'sound', 0)
                // No sound for walls.
                prefix && this.sfx(prefix + sound, [view, async])
              }
              var image = creature.get('mapImage' + this.cmap.get('window')._cid)
              image.assignResp({preserveAnimation: true, features: []})
              image.playAnimation(anim, {done: async.nestDoner(), interval: 50, scale: this.sc.get('combatSpeed')})
              this.autoOff(view, {
                end: function () {
                  image.stopAnimation()
                  image.assignResp({
                    preserveAnimation: false,
                    group: this.map.constants.animation.group.stand,
                    features: this.cmap._creatureImageFeatures(creature),
                  })
                },
              })
              if (view.get('type').match(/Attack|Ram/)) {
                view.set('parallel', view.get('hitTransitions'))
              }
            })
            // Historical note why parallel=true is no longer used.
            //
            // We should be accurate to link a parallel transition with transitions it is meant to parallel. In other words, a parallel=true transition may last longer than the related transitions and unrelated transitions (of other types) may start playing while it's still active.
            //
            // For example, when casting a total spell like Armageddon and affecting a creature it's possible that creatures start moving while the spell's animation is playing because combatHit's duration is shorter than combatSpellArea's (not to mention that combatHit itself can be parallel):
            //
            //   >-------->
            //   >SP----E|    combatSpellArea (S)tarts (P)arallel (E)nds
            //   > S--E| ]    combatHit
            //   >     S-->   unrelated transition (while Armageddon is playing)
            //
            // "|" marks where a transition currently ends, in contrast with "]" where combatHit would end should it be linked with the "main" transition (spell animation) thus delaying the start of the unrelated transition.
        }
      },

      'shoot_collect, status_collect': function (view, tr, tick) {
        if (!tick) {
          var cr = this._lingeringCreature(view.get('creature'))
          view.set('cell', [cr.get('x'), cr.get('y'), cr.get('width')])
          var cr = this._lingeringCreature(view.get('target'))
          cr && view.set('targetCell', [cr.get('x'), cr.get('y'), cr.get('width')])
        }
      },

      shoot_tick: function (view, async) {
        switch (view.get('type')) {
          case 'combatShoot':
          case 'combatHurl':
            var anim = anim || this.map.constants.animation.group.shoot
            var adjust = adjust || ['missileX', 'missileY']
          case 'combatShootUp':
          case 'combatHurlUp':
            var anim = anim || this.map.constants.animation.group.shootUp
            var adjust = adjust || ['missileTX', 'missileTY']
          case 'combatShootDown':
          case 'combatHurlDown':
            var anim = anim || this.map.constants.animation.group.shootDown
            var adjust = adjust || ['missileBX', 'missileBY']
            var seq = async.sequence()
            var unlock
            var image
            var info
            var missile
            var continueShooting
            var animator

            this.autoOff(seq, {
              do_0: function () {
                this._lockCreatures(view, [view.get('creature'), view.get('target')], seq.next)
              },

              do_1: function (unlock_, creature) {
                unlock = unlock_
                this.sfx(this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'sound', 0) + 'SHOT', [view, async])
                image = creature.get('mapImage' + this.cmap.get('window')._cid)
                info = this.rules.creatureAnimations.atter(adjust.concat('missileFrame', 'missileAngles', 'missileImage'))(creature.get('creature'), 0, 0, 0)
                var angle = view.get('angle')
                if (angle < -90 || angle > +90) {
                  // XXX+I shooter must turn before and after shooting if target is on the left (like in combatMove)
                  var flip = true
                  angle = -(angle + 180 * _.sign(-angle))
                }
                var i = _.findIndex(info.missileAngles, function (a) { return a >= angle })
                missile = this.cmap.addModule(H3Bits.DefImage, {def: info.missileImage, frame: i})
                missile.el
                  .hide()
                  .css({
                    // XXX=C adjusting by TXT-provided X seems to cause more problems than good
                    left: parseInt(image.el.css('left')) - (flip ? missile.info('width') : 0), //+ info[adjust[0]] * (flip ? -1 : 1),
                    top: parseInt(image.el.css('top')) + info[adjust[1]],
                    zIndex: this.cmap._zIndexFor('creature', view.get('targetCell')[0], view.get('targetCell')[1]),
                    transform: 'scale(' + (flip ? '-' : '') + '1,1)',
                  })
                image.assignResp({preserveAnimation: true, features: []})
                image.playAnimation(anim, {
                  pauses: [info.missileFrame],
                  // Is called twice.
                  done: seq.next,
                  scale: this.sc.get('combatSpeed'),
                })
              },

              undo_1: function (unlock, creature) {
                image.stopAnimation()
                image.assignResp({
                  preserveAnimation: false,
                  group: this.map.constants.animation.group.stand,
                  features: this.cmap._creatureImageFeatures(creature),
                })
                missile.remove()
              },

              do_2: function (next) {
                continueShooting = next
                missile.el.show()
                var pos = this.cmap.hexToSquare(view.get('targetCell')[0], view.get('targetCell')[1])
                var pos2 = this.cmap.hexToSquare(view.get('cell')[0], view.get('cell')[1])
                var duration = Math.max(Math.abs(pos[0] - pos2[0]), Math.abs(pos[1] - pos2[1])) * 3 * this.sc.get('combatSpeed')
                pos[1] -= hexHeight / 2
                if (_.startsWith(view.get('type'), 'combatHurl')) {
                  // Kudos pathAnimator, such a nifty tiny library!
                  // Our job is constructing a path with 3 points that essentially form a triangle and that will be smoothed out by SVG:
                  //                       2
                  // M 1 1 Q 2 2 3 3      / \
                  //                     1   3
                  // It's okay if 2 temporary runs off screen, SoD does that too when shooting walls/tower near the top.
                  //var path = 'M 0 100 Q 100 0 200 100'
                  var sx = parseInt(missile.el.css('left'))
                  var sy = parseInt(missile.el.css('top'))
                  var path = _.format('M %s %s Q %s %s %s %s',
                    sx, sy,
                    (pos[0] - sx) / 2, Math.min(pos[1], sy) - Math.abs(pos[1] - sy) / 2 - this.cmap.el.height() / 2,
                    pos[0], pos[1])
                  animator = new PathAnimator(path, {
                    duration: duration / 1000,
                    step: function (point) {
                      missile.el.css({left: point.x, top: point.y})
                    },
                    onDone: seq.next,
                  })
                  animator.start()
                } else {
                  missile.el.animate({left: pos[0], top: pos[1]}, duration, 'linear', seq.next)
                }
              },

              undo_2: function () {
                animator && animator.stop()
                image.set('frame', null)
              },

              do_3: function () {
                // XXX++I add shootingCloud effect at this point and wait for completion before continuing execution below (+ DEATHCLD sfx)

                // Let on-hit animations play immediately.
                unlock([view.get('target')])
                // XXX=IC for catapult, SoD pauses at hurling climax frame and waits until impact animation ends playing, then finishes hurling animation (we play this ending in parallel with impact)
                view.set('parallel', view.get('hitTransitions'))
                missile.remove()
                continueShooting()
              },

              do_4: function () {
                seq.end()
              },
            })

            seq.next()
        }
      },

      status_tick: function (view, async) {
        switch (view.get('type')) {
          case 'combatHurlMiss':    // played after combatHurl/Up/Down in 'shoot'
            var def = def || 'CSGRCK' // XXX=RH
            var sound = sound || 'WALLMISS'
          case 'combatHurlHit':     // ditto
            var def = def || 'SGEXPL' // XXX=RH
            var sound = sound || 'WALLHIT'  // XXX=RH
            var target = true
          case 'combatMoraleGood':  // XXX+B should play over creature's spot at the time of transition, not current
            var def = def || 'C09SPW0'    // XXX=RH
            var sound = sound || 'GOODMRLE' // XXX=RH
          case 'combatMoraleBad':
            var def = def || 'C14SPE0'  // XXX=RH
            var sound = sound || 'BADMRLE'    // XXX=RH
            // XXX=C if need to play on-hit animation for bad morale and other similar statuses
          case 'combatLuckGood':
            var def = def || 'C09SPA0'  // XXX=RH
            var sound = sound || 'GOODLUCK'   // XXX=RH
            var pos = 'Hh3-cm__map-buf_overhead'
          case 'combatRegenerating':
            var def = def || 'SP12_'  // XXX=RH
            var sound = sound || 'REGENER'  // XXX=RH
            var pos = pos || 'Hh3-cm__map-buf_center'
            async = async.nest({})
            this._lockCreatures(view, [view.get(target ? 'target' : 'creature')], function (unlock) {
              this.sfx(sound, [view, async])
              // Showing hurl impact animation on top of all other creatures.
              this._playTransitionCreatureOverlay(_.object(['x', 'y', 'width'], view.get(target ? 'targetCell' : 'cell')), def, [view, async], pos, false, target && {x: this.combat.get('width'), y: this.combat.get('height')})
              // When a wall or tower was hit, let it react immediately while impact animation is playing. Else player will see wall changing appearance or tower dying after impact animation ends which is not how SoD renders it.
              if (view.get('type') == 'combatHurlHit') {
                // XXX=I for better effect unlock/parallel should happen in impact's climax frame (some point in the middle of playing it), not immediately
                unlock()
                view.set('parallel', view.get('hitTransitions'))
              }
            })
        }
      },

      combatMove_collect: function (view, tr, tick) {
        if (!tick) {
          var cr = this._lingeringCreature(view.get('creature'))
          view.set('facing', cr.get('facing'))
        }
      },

      combatMove_tick: function (view, async, tick) {
        // XXX=R this is walking the entire view.path on tick 0 but more correct is to walk one step at a time at the specific tick to allow other consumers of combatMove update precisely in sync with the creature move animation; there are no such consumers currently (except mapCountImage but it's hidden until last tick)
        if (tick) { return }

        var seq = async.sequence()
        var consts = this.map.constants.animation.group
        var path = view.get('path')
        var pathIndex = 0
        var pathFind
        var turn
        var image
        var duration

        this.autoOff(seq, {
          do_0: function () {
            this._lockCreatures(view, [view.get('creature')], seq.next)
          },

          do_1: function (unlock, creature) {
            this.sfx(this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'sound', 0) + 'MOVE', [view, async])
            // Keep original facing after move animation finishes. This means if
            // creature was initially facing left, need to turn if moving right.
            turn = view.get('facing') != (path[0][0] > _.last(path)[0])
            image = creature.get('mapImage' + this.cmap.get('window')._cid)
            var pos = this.cmap.hexToSquare(path[pathIndex][0], path[pathIndex++][1])
            // XXX=I update Z index during move (not so trivial for flying)
            image.el.css({left: pos[0], top: pos[1]})
            creature.get('mapCountImage' + this.cmap.get('window')._cid).hide()
            view.release(creature.get('mapCountImage' + this.cmap.get('window')._cid), 'show')
            pathFind = this.cx.makeHexPathFinder({
              mapWidth: this.combat.get('width'),
              mapHeight: this.combat.get('height'),
            })
            image.assignResp({preserveAnimation: true, features: []})
            image.playAnimation(consts.start, {done: seq.next, scale: this.sc.get('combatSpeed')}) || seq.next()
          },

          undo_1: function (unlock, creature) {
            image.stopAnimation()
            image.assignResp({
              preserveAnimation: false,
              features: this.cmap._creatureImageFeatures(creature),
              group: consts.stand,
            })
            pathFind.remove()
            if (!this.get('removing')) {
              var last = _.last(path)
              this.cmap._updateObjectZIndex(creature, last[0], last[1])
            }
          },

          do_2: function () {
            // Calls next() if !turn or if there's no animation.
            turn && image.playAnimation(view.get('facing') ? consts.turnRight : consts.turnLeft, {done: seq.next, scale: this.sc.get('combatSpeed')}) || seq.next()
          },

          do_3: function () {
            turn && image.el.toggleClass('Hh3-cm__map-im_mirror')
            image.set('group', consts.move)
            // XXX=I It appears making perfect move animation requires too much time
            // so using quick and dirty method for now: force 70 ms per walk frame
            // and 0.1 second per moved cell, then adjust movement speed
            // ($.animate()) so that move animation ends on the last frame.
            // SoD is using a more complex and fluent approach which remains to
            // be researched.
            //
            // XXX Use CreatureAnimation's walkTime/attackTime to reduce animation interval used by def2png.php and remember about --HC.
            duration = image.info('frameCount', {group: consts.move}) * 70
            image.el.css('animationDuration', duration + 'ms')
            seq.next()
          },

          undo_3: function () {
            image.el.css('animationDuration', '')
            image.el.toggleClass('Hh3-cm__map-im_mirror', !!view.get('facing'))
          },

          do_4: function () {
            if (pathIndex < path.length) {
              // XXX=RH
              var distance = pathFind._heuristic(path[pathIndex - 1], path[pathIndex])
              var mseconds = distance / 10 * 1000
              var pos = this.cmap.hexToSquare(path[pathIndex][0], path[pathIndex++][1])
              image.el.animate({left: pos[0], top: pos[1]}, duration * Math.ceil(mseconds / duration) * this.sc.get('combatSpeed'), 'linear', seq.repeat)
            } else {
              image.el.css('animationDuration', '')
              turn && image.el.toggleClass('Hh3-cm__map-im_mirror')
              turn && image.playAnimation(view.get('facing') ? consts.turnLeft : consts.turnRight, {done: seq.next, scale: this.sc.get('combatSpeed')}) || seq.next()
            }
          },

          undo_4: function () {
            // jumpToEnd = true, leading to one more call to seq.repeat(). However, at the point undo_N executes seq is no longer isLoading() so repeat() ignores the call.
            image.el.stop(false, true)
          },

          do_5: function () {
            image.playAnimation(consts.stop, {done: seq.end, scale: this.sc.get('combatSpeed')}) || seq.end()
          },
        })

        seq.next()
      },

      combatSurrenderAsk_collect: function (view) {
        var party = this.combat.parties.nested(view.get('party'))
        if (party.object && (party.object.isHero || party.object.isTown)) {
          var name = this.cx.oneShotEffectCalculation({
            class: Calculator.Effect.GenericString,
            target: this.cx.map.constants.effect.target.name,
            ifObject: party.object.get('id'),
          })
        } else {
          var name = this.rules.databank.players.atCoords(party.player.get('player'), 0, 0, 'name', 0)
        }
        view.set('heroName', name)
        view.set('myDecision', this.combat.parties.nested(view.get('decisionMaker')).player == this.pl)
      },

      combatSurrenderAsk_tick: function (view, async) {
        if (!view.get('myDecision')) {
          return
        }
        var rem = this.cx.subtractResourcesByCalc({}, {
          target: this.cx.map.constants.effect.target.surrenderCost,
          ifCombat: this.combat._parentKey,
          ifCombatParty: view.get('party'),
        }, '.')
        var cost = _.entries(rem[1])
          .filter(function (i) { return i[1] > 0 })
          .map(function (i) { return i[1] + ' ' + Common.capitalize(i[0].substr(1)) })
        var box = this.cmap.get('window').ui.windows.addModule(H3Bits.MessageBox, {withinWindow: this.cmap.get('window')})
          .addText(this.cx.s('combat', '%s is asking you for surrender in exchange for %s. Accept the offer?'), view.get('heroName'), cost.join(', '))
        view.release(box)
        var okay = box.addButton('Hh3-btn_id_IOKAY', 'submit')
        box
          .addButtonThis('Hh3-btn_id_ICANCEL', 'cancel')
          .once('unnest', async.nestDoner())
        this.autoOff(view, {
          end: function () {
            if (!this.get('removing')) {
              this.sc.rpc.do('combat', {
                combat: this.combat._parentKey,
                do: 'surrenderAccept',
                party: view.get('party'),
                reject: box.get('button') != okay,
              })
            }
          },
        })
      },

      combatDie_collect: function (view, tr, tick) {
        if (tick == 1) {
          // Corpses are currently never removed so we don't remove their mapImage.
          var corpse = this.combat.objects.find(function (obj) {
            return obj instanceof HMap.Combat.Object.Corpse && obj.get('creatureKey') == view.get('creature')
          })
          view.set('corpse', corpse.get('mapImage' + this.cmap.get('window')._cid).el)
        }
      },

      combatDie_tick: function (view, async) {
        async = async.nest({})
        // XXX=I when a creature is hit or is dying, it should turn to face the attacker
        this._lockCreatures(view, [view.get('creature')], function (unlock, creature) {
          if (view.get('attacker') && !this.cx.get('classic')) {
            var hero = this._lingeringCreature(view.get('attacker')).party.get('mapImage' + this.cmap.get('window')._cid)
            if (this._canAnimateHero(hero)) {
              hero.stopAnimation()    // if heroShuffle'ing
              // Reset so that playAnimation() uses correct old values it'll revert to after playthrough.
              hero.assignResp({group: this.map.constants.animation.group.heroStand, frame: null})
              hero.playAnimation(this.map.constants.animation.group.heroWin, this.sc.get('combatSpeed'))
            }
          }
          var hero = creature.party.get('mapImage' + this.cmap.get('window')._cid)
          if (this._canAnimateHero(hero)) {
            hero.stopAnimation()
            hero.assignResp({group: this.map.constants.animation.group.heroStand, frame: null})
            hero.playAnimation(this.map.constants.animation.group.heroLose, this.sc.get('combatSpeed'))
          }
          creature.get('mapCountImage' + this.cmap.get('window')._cid).remove()
          var image = creature.get('mapImage' + this.cmap.get('window')._cid)
          view.release(image)
          view.release(view.get('corpse'), 'show')
          image.assignResp({preserveAnimation: true, features: []})
          var doner = async.nestDoner()
          image.playAnimation(this.map.constants.animation.group.die, {
            done: function () {
              // In case the KILL sound ends after the animation, remove the image (else creature would suddenly "stand up" and disappear when sound ends).
              image.remove()
              view.get('corpse').show()
              doner()
            },
            interval: 50,
            scale: this.sc.get('combatSpeed'),
          })
          var prefix = this.rules.creatures.atCoords(creature.get('creature'), 0, 0, 'sound', 0)
          // No sound for walls.
          prefix && this.sfx(prefix + 'KILL', [view, async])
        })
      },

      combatGate_tick: function (view, async) {
        var seq = async.sequence()
        var image

        this.autoOff(seq, {
          do_0: function () {
            this._lockCreatures(view, [view.get('creature')], seq.next)
          },

          do_1: function (unlock, creature) {
            this.sfx('DRAWBRG', [view, async])
            image = creature.get('mapImage' + this.cmap.get('window')._cid)
            image.assignResp({preserveAnimation: true, features: []})
            image.el.show()
            image.playAnimation(this.map.constants.animation.group.start, {done: seq.end, interval: 50, scale: this.sc.get('combatSpeed')})
          },

          undo_1: function (unlock, creature) {
            image.stopAnimation()
            image.el.toggle(view.get('open'))
            image.assignResp({
              preserveAnimation: false,
              features: this.cmap._creatureImageFeatures(creature),
              group: this.map.constants.animation.group.stand,
            })
          },
        })

        seq.next()
      },

      combatEnd_collect: function (view, tr, tick) {
        view.getSet('combatResults', function (cur) {
          return _.extend({}, cur, Combat.Results.collect(tick, this.cmap.get('window'), tr))
        }, this)

        if (tick) {
          // Detach hero images from their party object so that they remain after combat is purged. We do this at tick 1 (occurring after setting alive but before removing defeated heroes) for non-alive heroes and at tick 2 for winners, to allow room for customization (e.g. having combatImage depend on hero level, and having it updated on combat end if hero receives a level-up as a result of the victory like in Disciples).
          //
          // Detaching involves removing hooks set up by updateOn() (see DefImage's attach()) on the calculator. Whilst doing so, making sure to prevent the calculator from being removed because it may trigger removal of the image (since updateOn() sets up such a hook):
          //
          // 1. autoOff() unbinds change_... before unbinding unnest
          // 2. Calculator decrements its references
          // 3. Calculator removes itself
          // 4. The still-bound unnest triggers image.remove()
          // 5. autoOff() unbinds unnest
          this.combat.parties.each(function (party) {
            var alive = _.includes(tr.get('alive'), party._parentKey)
            if (tick == 1 + alive) {
              var image = party.get('mapImage' + this.cmap.get('window')._cid)
              if (image) {
                image.autoOff(image._calc.take()).release()
                party.set('mapAlive' + this.cmap.get('window')._cid, alive)
              }
            }
          }, this)
        }
      },

      combatEnd_tick: function (view, async) {
        var results = view.get('combatResults')
        var ui = this.cmap.get('window').ui
        results.withinWindow = this.cmap.get('window')
        var win = ui.windows.addModule(Combat.Results, results)
        _.each(['attackers', 'defenders'], function (prop) {
          win.nested(prop).assignChildren(results[prop])
        })
        view.release(win)
        if (!this.cx.get('classic')) {
          var btn = win.addModule('hide', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_IHM002'})
          this.autoOff(btn, {
            clicked: function () {
              btn = true
              win.cancel()
            },
          })
        }
        // combatEnd persists until combat window is closed (calling abort() on all pending transitions including ours).
        async.nest({})
        var closed = function () {
          win.remove()
          var ui = this.cmap.get('window')
          btn === true ? ui.set('canClose', true) : ui.remove()
        }.bind(this)
        this.autoOff(win, {
          '=cancel': function () {
            if (!this.get('removing') && results.artifacts.length) {
              var msg = ui.windows.addModule(H3Bits.MessageBox, {withinWindow: this.cmap.get('window')})
                .set('audio', 'PICKUP0' + _.random(1, 7))
                .addText('Hh3-menu__text6 Hh3-menu__text_toned', this.cx.s('combat', (this.cx.get('classic') || results.artifacts.length == 1) ? 'You have captured an enemy artifact!' : 'You have captured enemy artifacts!'))
              msg.addModule(Combat.Results.Artifacts).assignChildren(results.artifacts)
              msg.addButton()
                .on('clicked', closed)
              view.release(msg)
            } else {
              closed()
            }
          },
        })
      },

      spell_collect: function (view, tr, tick) {
        if (tick == 1) {
          view.set('casterParty', this.combat.parties.nested(view.get('caster')))
          if (!view.get('cell')) {
            var cr = this._lingeringCreature(view.get('target'))
            cr && view.set('cell', cr.getSet(['x', 'y']))
          }
          _.each(['damaged', 'evaded'], function (p) {
            var creatures = view.get(p)
            var cells = !creatures ? [] : creatures.map(function (cr) {
              return this._lingeringCreature(cr).getSet(['x', 'y', 'width'])
            }, this)
            view.set(p + 'Cells', cells)
          }, this)
        }
      },

      spell_tick: function (view, async) {
        async = async.nest({})
        var run = function (unlock) {
          // Play spell evasion animations in parallel with main combat animation.
          //
          // SoD shows them only when spell is not global; we show always, in non-classic mode.
          if (!view.get('global') || !this.cx.get('classic')) {
            _.each(view.get('evadedCells'), function (cell, i) {
              cell = _.object(['x', 'y', 'width'], cell)
              var asyncA = async.nest({})
              if (view.get('casterParty').get('placement').match(/l/)) {
                var pos = 'Hh3-cm__map-buf_mirror'
              }
              // XXX=RH 'SP09_'
              var image = this._playTransitionCreatureOverlay(cell, 'SP09_', [view, asyncA], pos)
              asyncA.whenSuccess(image.remove, image)
              i || this.sfx('MAGICRES', [view, async])
            }, this)
          }

          this.sfx(this.rules.spells.atCoords(view.get('spell'), 0, 0, 'castSound', 0), [view, async])

          // In SoD, hero cast animation pauses on the fifth (XXX=C) frame and waits until other cast animations finish.
          var hero = view.get('casterParty').get('mapImage' + this.cmap.get('window')._cid)
          // Cancel current hero animation of any type. Spellcasting is the only place where we do this.
          hero.stopAnimation()
          // Prevent heroShuffle by _animateHero().
          var ev = hero.on('=isPlayingAnimation', function () { return true })
          this.autoOff(view, {
            end: function () {
              hero.off(ev)
              hero.stopAnimation()
              hero.assignResp({group: this.map.constants.animation.group.heroStand, frame: null})
            },
          })
          var heroDone = async.nestDoner()
          var finishAnimation
          async.whenSuccess(function () {
            heroDone = async.nestDoner()
            finishAnimation()
          })
          hero.playAnimation(this.map.constants.animation.group.heroCast, {
            // All CH*.DEF have 8 frames in this group and 5th is the climax frame.
            pauses: [4],
            done: function (next, frame) {
              // done is called twice:
              // 1. First when the hero's image is paused at the climax frame (4); until that happens we keep unfulfilled async doner (first value of heroDone) so that if cast_... ends playing this transition faster than we reach the climax frame the transition waits for our animation to pause.
              // 2. After the first call the main async is no longer delayed by heroDone. mapImage remains paused at the climax frame and we wait for asyncs added by cast_... to fulfill, therefore fulfilling the main async that we have here.
              // 3. When whenSuccess() is called, we add another doner (second value of heroDone), therefore interrupting async completion (it becomes isLoading() again) with the purpose of seeing our animation finish (climax_frame..last_frame) before finishing the transition. We continue the previously paused hero animation by calling the stored next callback. When the animation ends, done is called again (frame == last, not 4), and we fulfill the second doner, which usually leads to async completing and transition entirely ending.
              if (frame == 4) {
                finishAnimation = next
                callCast && callCast()
              }
              heroDone()
            },
            scale: this.sc.get('combatSpeed'),
          })

          var type = this.rules.spells.atCoords(view.get('spell'), 0, 0, 'castAnimationType', 0)
          var anim = this.rules.spells.atCoords(view.get('spell'), 0, 0, 'castAnimation', 0)
          var func = 'cast_' + _.indexOf(this.map.constants.spell.castAnimationType, type)
          if (this[func]) {
            // missileEvery waits for hero's casting animation to climax before running. Others don't.
            var callCast = this[func].bind(this, anim, view, async, unlock)
            if (func != 'cast_missileEvery') {
              callCast()
              callCast = null
            }
          }
        }.bind(this)

        // No creatures may be affected by some spells, like casting Fireball onto an empty area.
        var cr = view.get('damaged').concat(view.get('evaded'))
        cr.length ? this._lockCreatures(view, cr, run) : run(Common.stub)
      },
    },

    // Aborts transitions of own combat that started playing earlier than time.
    abortPlaying: function (time) {
      time = time ? Date.now() - time : Infinity
      this.sc.transitions.each(function (view) {
        // If the view isn't ours, started would be undefined leading to time > started being false. If started is true, the transition was selected but hasn't started playing yet so we're not aborting it.
        var started = view.get(this._cid)
        if (started !== true && time > started && !view.get('ending') && view.get('type') != 'combatEnd') {
          view.abort()
        }
      }, this)
    },

    _canAnimateHero: function (image) {
      switch (image && image.get('group')) {
        case this.map.constants.animation.group.heroStand:
        case this.map.constants.animation.group.heroShuffle:
          return true
      }
    },

    _playTransitionCreatureOverlay: function (cr, def, viewAsync, cls, bottom, zIndex) {
      var square = this.cmap.hexToSquare(cr.x, cr.y)
      var image = this.cmap.addModule(H3Bits.DefImage, {def: def})
      image.el
        .addClass('Hh3-cm__map-buf ' + (cls || ''))
        .css({
          // bottom is only set for lightEvery and the only spell using this cast type is Prayer, and its animation is erroneously shifted too far to the right.
          left: square[0] + ((cr.width - !!bottom) * hexWidth) / 2,
          top: bottom ? '' : square[1],
          bottom: bottom ? this.cmap.el.height() - square[1] : '',
          zIndex: this.cmap._zIndexFor('creature', (zIndex || cr).x, (zIndex || cr).y),
        })
        .appendTo(this.cmap._objectsEl)
      viewAsync[0].release(image)
      var async = viewAsync[1].nest({})
      async.whenComplete(image.remove, image)
      image.playAnimation(0, {done: async.nestDoner(), interval: 50, scale: this.sc.get('combatSpeed')})
      return image
    },

    sfx: function (name, viewAsync) {
      var audio = this.sc.get('audio')
      if (name && audio) {
        var chan = audio.playIfEnabled(name, 'sfx', '')
        if (chan) {
          // It appears that in SoD combat sounds are not restricted by animation duration and continue to play even after it ends. This is logical because animation speed can be adjusted while sounds play at constant pace.
          this.on('-unnest', 'remove', chan)
          //viewAsync[0].release(chan)
          //chan.on('ended', viewAsync[1].nestDoner())
        }
      }
    },

    // Calls func when no other transitions besides view are being played for the given creatures. func receives N+1 arguments where N=creatures.length. First argument is an unlock callback that receives array (possibly empty) of creature keys that will no longer be accessed by this view; it may be called any number of times; every creature must be given only once and it must be listed in `'creatures. Calling unlock with no arguments equals `'creatures and therefore inhibits other calls to unlock (earlier and later). Other `'func's arguments are Creature-s, in order.
    //
    // When view end-s, all non-unlock'ed creatures are unlocked implicitly and no more calls to unlock are permitted. _lockCreatures() can be called several times per one view as long as all creatures are either unlocked or locked by another view. func won't be called if view aborts.
    //
    // Making view 'parallel' is allowed but that option must be set after or while locking, otherwise next transition may be able to lock `'creatures between set() returning and this method executing.
    _lockCreatures: function (view, creatures, func) {
      if (!creatures.length) {
        throw new Error('_lockCreatures() was given no creatures.')
      }

      // creature => null/view.
      var views = _.extend(_.fill(_.flip(creatures)), _.pick(this._parallel, creatures, _.forceObject))
      var rem = 1
      var event = '_lockCreatures'

      _.each(views, function (busy, creature) {
        if (busy) {
          rem++
          var ev1 = this.autoOff(busy, {}).once(event + creature, check, this)
        }
        this._parallel[creature] = view
        // Hooking change_ending rather than end to ensure user hooks on end finish before we unlock. Consider this example:
        //
        //   _lockCreatures(view, [cr], ...)
        //   view.on('end', () => crImage.foo() ...)     // (2)
        //
        // If _lockCreatures() were to hook end, it would unlock(cr) before the callback of (2) runs. If there is a waiting view on cr that accesses cr in its func, (2) will run after it leading to a conflict in the shared resource of cr (the crImage).
        var ev2 = view.on('change_ending', function () {
          unlock([creature])
        }, this)
        this.autoOff(view, [
          event + creature, function () {
            busy && busy.off(ev1)
            view.off(ev2)
            if (this._parallel[creature] == view) {
              delete this._parallel[creature]
            }
          },
        ])
      }, this)

      check.call(this)

      function check() {
        if (!this.get('removing') && !--rem) {
          var objects = creatures.map(this._lingeringCreature, this)
          func.apply(this, [unlock].concat(objects))
        }
      }

      function unlock(partial) {
        _.each(partial || creatures, function (creature) {
          view.fire(event + creature)
        })
      }
    },

    _lingeringCreature: function (key) {
      return this._lingeringCreatures[key] || this.combat.objects.nested(key)
    },

    cast_overlay: function (anim, view, async) {
      // Unlike other spells, SoD plays this one sequentially with subsequent combatHit/combatDie and, as usual, audio doesn't delay its completion (i.e. first Fireball animation finishes, then cast sound continues to play while damaged creatures - all creatures at once - start animating).
      var cell = view.get('cell')
      cell = _.object(['x', 'y'], cell)
      cell.width = 1
      // Spells like Fireball should be drawn over creatures in their AoE. _playTransitionCreatureOverlay uses z-index of cell which is the middle of the AoE and doesn't overlay creatures that stand below it.
      var z = view.get('touchedCells')
      if (z) {
        z = _.object(['x', 'y'], _.max(z, function (box) { return box[1] * 1000 + box[0] }))
      }
      this._playTransitionCreatureOverlay(cell, anim, [view, async], 'Hh3-cm__map-buf_center', false, z)
      async.whenComplete(function () {
        view.set('parallel', (view.get('dieTransitions') || []).concat(view.get('hitTransitions')))
      })
    },

    cast_overlayEvery: function (anim, view, async, unlock, lightEvery) {
      var cells = view.get('damagedCells')
      _.each(cells, function (cell, i) {
        cell = _.object(['x', 'y', 'width'], cell)
        this._playTransitionCreatureOverlay(cell, anim, [view, async], lightEvery ? 'Hh3-cm__map-light' : 'Hh3-cm__map-buf_center', lightEvery)
      }, this)
      // For attacking spells overlayEvery is played in parallel with creature damage animations (see Death Ripple).
      unlock(view.get('damaged'))
      view.set('parallel', (view.get('dieTransitions') || []).concat(view.get('hitTransitions')))
    },

    cast_lightEvery: function () {
      return this.cast_overlayEvery.apply(this, _.toArray(arguments).concat(true))
    },

    cast_total: function (anim, view, async, unlock) {
      var image = this.cmap.get('window').nested('bk').addModule(H3Bits.DefImage, {def: anim})
      image.el
        .addClass('Hh3-cm__map-total')
      view.release(image)
      async = async.nest({})
      async.whenComplete(image.remove, image)
      image.playAnimation(0, {done: async.nestDoner(), interval: 50, scale: this.sc.get('combatSpeed')})
      // For attacking spells total is played in parallel with creature damage animations (see Armageddon).
      unlock(view.get('damaged'))
      view.set('parallel', (view.get('dieTransitions') || []).concat(view.get('hitTransitions')))
    },

    cast_missileEvery: function (anim, view, async, unlock) {
      var cells = view.get('damagedCells')
      _.each(cells, function (cell, i) {
        var done = async.nestDoner()
        cell = _.object(['x', 'y', 'width'], cell)
        // XXX=R partially duplicates with _playTransitionCreatureOverlay()
        var square = this.cmap.hexToSquare(cell.x, cell.y)
        var image = this.cmap.addModule(H3Bits.DefImage, {def: anim[1]})
        view.release(image)
        var party = view.get('casterParty')
        if (anim.length > 2) {
          // According to CSS classes Hh3-cm__hero_pos_*.
          //
          // Here we treat hero as standing outside of the field (position outside of combat dimensions).
          //    H      H
          //     +----+
          //     |    |
          //     +----+
          //    H      H
          switch (party.get('placement')) {
            case 't':   var attacker = [this.combat.get('width') / 2, -1]; break
            case 'b':   var attacker = [this.combat.get('width') / 2, this.combat.get('height')]; break
            case 'corners':
            case 'tr':
            case 'r':   var attacker = [this.combat.get('width'), -1]; break
            case 'bl':  var attacker = [-1, this.combat.get('height')]; break
            case 'br':  var attacker = [this.combat.get('width'), this.combat.get('height')]; break
            default:    var attacker = [-1, -1]
          }
          // XXX=R:ang:
          var angle = Math.atan2(cell.y - attacker[1], cell.x - cell.y % 2 / 2 - attacker[0] - attacker[1] % 2 / 2) * (180 / Math.PI)
          var flipY = angle < 0
          if (angle < -90 || angle > +90) {
            var flipX = true
            angle = Math.abs(angle + 180 * _.sign(-angle))
          }
          // XXX=RH
          var ai = !angle ? 1 : angle <= 27 ? 2 : angle <= 45 ? 3 : angle <= 72 ? 4 : 5
          image.set('def', anim[ai])
        }
        var caster = party.get('mapImage' + this.cmap.get('window')._cid).el.position()
        var from = {
          left: caster.left,
          top: caster.top,
          zIndex: this.cmap._zIndexFor('creature', cell.x, cell.y),
          transform: 'scale(' + (flipX ? '-' : '') + '1,' + (flipY ? '-' : '') + '1)',
        }
        var to = {
          left: square[0],
          top: square[1] - hexHeight,   // strike the creature's torso or head
        }
        var flyingRight = _.includes(party.get('placement'), 'l')
        ;(flyingRight ? to : from).left -= image.info('width')
        flyingRight && (to.left += cell.width * hexWidth)
        image.el
          .css(from)
          .appendTo(this.cmap._objectsEl)
        // XXX=I duration depends on pixels, not the best concept for portability
        var duration = square[1] * 5 * this.sc.get('combatSpeed')
        image.el.animate(to, duration, 'linear', function () {
          if (!view.get('aborting')) {
            image.remove()
            this._playTransitionCreatureOverlay(cell, anim[0], [view, async], 'Hh3-cm__map-buf_center')
            // For attacking spells impact animation is played in parallel with creature damage animations (see Magic Arrow).
            //
            // Unlike other cast_...(), the trick is to unlock targets one by one at the time the corresponding arrow hits one.
            unlock([view.get('damaged')[i]])
            ;(view.get('dieTransitions') || []).concat(view.get('hitTransitions'))
              .some(function (id) {
                var other = this.sc.transitions.of(id, this._cid)
                if (other && other.get('creature') == view.get('damaged')[i]) {
                  return view.getSet('parallel', Common.concat(other._parentKey))
                }
              }, this)
            done()
          }
        }.bind(this))
      }, this)
    },

    cast_dropEvery: function (anim, view, async, unlock) {
      var cells = view.get('damagedCells')
      _.each(cells, function (cell, i) {
        var done = async.nestDoner()
        cell = _.object(['x', 'y', 'width'], cell)
        // XXX=R partially duplicates with _playTransitionCreatureOverlay
        var square = this.cmap.hexToSquare(cell.x, cell.y)
        var image = this.cmap.addModule(H3Bits.DefImage, {def: anim[1]})
        view.release(image)
        image.el
          .addClass('Hh3-cm__map-drop')
          .css({
            left: square[0] + (cell.width * hexWidth) / 2,
            bottom: 560,    // XXX=RH
            zIndex: this.cmap._zIndexFor('creature', cell.x, cell.y),
          })
          .appendTo(this.cmap._objectsEl)
        var duration = 50 * this.sc.get('combatSpeed')
        var to = {bottom: this.cmap.el.height() - square[1]}
        image.el.animate(to, duration, 'linear', function () {
          if (!view.get('aborting')) {
            // XXX=R Duplicates with cast_missileEvery().
            unlock([view.get('damaged')[i]])
            ;(view.get('dieTransitions') || []).concat(view.get('hitTransitions'))
              .some(function (id) {
                var other = this.sc.transitions.of(id, this._cid)
                if (other && other.get('creature') == view.get('damaged')[i]) {
                  return view.getSet('parallel', Common.concat(other._parentKey))
                }
              }, this)
            image.remove()
            this._playTransitionCreatureOverlay(cell, anim[0], [view, async], 'Hh3-cm__map-buf_center')
            done()
          }
        }.bind(this))
      }, this)
    },
  })

  // Guides and accepts user's interactive actions according to current combat state (e.g. melee attack or spell casting). Changes mouse cursor and status bar help text (e.g. "Attack <Foo>").
  //
  // A Mode remains nested in Map as long as interactive party remains the same. It remains even if interactive creature changes, if new creature belongs to the same party.
  Combat.Map.Mode = Bits.Base.extend('HeroWO.H3.DOM.Combat.Map.Mode', {
    _removeEl: false,
    cmap: null,    // Combat.Map
    combat: null,
    state: null,

    _opt: {
      highlightHover: null,   // null - from options, else bool
      highlightedCells: [],
    },

    events: {
      '-init': function (opt) {
        this.cmap = opt.map
        this.el = opt.map.el
        this.combat = opt.map.combat
        this.state = opt.map.state
      },

      '+normalize_highlightedCells': function (res, value) {
        return Common.normArrayCompare(value, this.get.bind(this, 'highlightedCells')) || []
      },

      attach: function () {
        this.autoOff(this.sc, {
          change_combatHighlightHover: '_updateHoverOption',
        })

        this.autoOff(this.cmap, {
          change_mouseCell: '_updateHover',
          cellClick: 'cellClick',
          cellContextMenu: 'cellContextMenu',
        })
      },

      change_highlightHover: '_updateHoverOption',

      change_highlightedCells: function (now, old) {
        var cls = 'Hh3-cm__grid-cell_hover'
        old = _.object(old, old)    // {'x,y': [x, y]}

        now.forEach(function (xy) {
          if (_.has(old, xy)) {
            delete old[xy]
          } else {
            this.gridCellAt(xy[0], xy[1]).classList.add(cls)
          }
        }, this.cmap)

        _.each(old, function (xy) {
          this.gridCellAt(xy[0], xy[1]).classList.remove(cls)
        }, this.cmap)
      },

      '-unnest': function () {
        this._parent && this.reset()
      },

      _update: function () {
        this._updateHoverOption()
        this._updateHover(this.cmap.get('mouseCell'), null)
      },
    },

    // function (x, y, e)
    cellClick: Common.stub,
    cellContextMenu: Common.stub,

    reset: function () {
      this.setCursorAndHelp()
      this.cmap.get('window').set('infoObject', null)

      this._updateHoverOption(_)
      this._updateHover(null, this.cmap.get('mouseCell'))

      // _creatureImageFeatures() uses this option but it's maintained by Mode. For example, during spell casting, click on a creature leads to _updateMode() which removes the Mode that has set hoveredCreatures, leaving the latter at non-empty (until another Mode is constructed) - as a result, _creatureImageFeatures() would always return ['hover'] for the clicked creature and have it drawn with an outline.
      this.cmap.set('hoveredCreatures', [])
    },

    _updateHoverOption: function (remove) {
      this.el.toggleClass('Hh3-cm__map_hl-hover', remove == _ ? false : this.get('highlightHover') == null ? this.sc.get('combatHighlightHover') : this.get('highlightHover'))
    },

    _updateHover: function (now, old) {
      this.set('highlightedCells', now && [now])
    },

    setCursorAndHelp: function (cursor, help) {
      this.cmap.set('mouseCursor', cursor || null)
      // If Mode is being removed along with other window children due to UI.Combat remove(), log may be missing at this point.
      var log = this.cmap.get('window').nested('log')
      log && log.set('help', help || '')
    },
  })

  // Mix-in for Mode drawing highlight over cells current creature may step on.
  Combat.Map.Mode.HighlightMove = {
    events: {
      attach: function () {
        this.autoOff(this.sc, {
          change_combatHighlightMove: 'update',
        })

        this.autoOff(this.state, {
          change_pathCosts: 'update',
          change_creature: 'update',
        })
      },

      _update: function () {
        this.el.toggleClass('Hh3-cm__map_hl-move', this.sc.get('combatHighlightMove'))

        this._canStandOn = []
        var cr = this.state.get('creature') && this.state.get('creature').get()

        for (var x = this.combat.get('width'); x--; ) {
          for (var y = this.combat.get('height'); y--; ) {
            var reachable = cr && !!this.state.pathTo([x, y])
            this.cmap.gridCellAt(x, y).classList.toggle('Hh3-cm__grid-cell_move', reachable)
            if (reachable) {
              cr.x = x
              cr.y = y
              this.combat.walkImpassable(cr, function (o) {
                if (!this.state.pathTo([o.mx, o.my])) {
                  this._canStandOn[o.mx + o.my * this.combat._opt.width] = [x, y]
                }
              }, this)
            }
          }
        }

        for (var n = this.combat.get('width') * this.combat.get('height'); n--; ) {
          this.cmap.gridCellAt(n).classList.toggle('Hh3-cm__grid-cell_move-oc', !!this._canStandOn[n])
        }
      },

      reset: function () {
        this.el.removeClass('Hh3-cm__map_hl-move')
        this.$('.Hh3-cm__grid-cell_move').removeClass('Hh3-cm__grid-cell_move')
        this.$('.Hh3-cm__grid-cell_move-oc').removeClass('Hh3-cm__grid-cell_move-oc')
      },
    },
  }

  // Mix-in for Mode with support for changing mouse cursor.
  Combat.Map.Mode.UpdateCursor = {
    events: {
      render: function () {
        // Only call if not removed from render (as happens with spells, result of _castGlobally()).
        this._parent && this._updateCursor()
      },
    },

    _updateCursor: function () {
      this.setCursorAndHelp('deny')
    },
  }

  // Mix-in for Mode changing mouse cursor according to creatures under its position.
  Combat.Map.Mode.CursorCreatures = {
    _opt: {
      mouseCreatures: [],   // only Creature-s
    },

    events: {
      attach: function () {
        this.autoOff(this.combat.bySpot, {
          'oadd, ochange, oremove': '_updateMouseCell',
        })

        this.autoOff(this.cmap, {
          change_mouseCell: '_updateMouseCell',
        })
      },

      render: '_updateMouseCell',

      '+normalize_mouseCreatures': function (res, value) {
        value && (value = this._filterMouseCreatures(value))
        return normalizeCreatureArray(this, value, 'mouseCreatures')
      },
    },

    _updateMouseCell: function () {
      var now = this.cmap.get('mouseCell')
      var list = now && this._findMouseCreatures(now)
      this.set('mouseCreatures', list)
    },

    // Default implementation finds all Creature-s exactly at pos. Given there should be only one Creature per spot, result's length is either 0 or 1.
    //
    // Is allowed to return duplicates.
    _findMouseCreatures: function (pos) {
      var res = []

      this.combat.bySpot.findAtCoords(pos[0], pos[1], 0, 'key', function (key) {
        var obj = this.combat.objects.nested(key)
        if (obj instanceof HMap.Combat.Creature) {
          res.push(obj)
        }
      }, this)

      return res
    },

    _filterMouseCreatures: function (value) {
      return value.filter(function (cr) {
        return !this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'damageGroup', 0)
      }, this)
    },
  }

  // Mix-in for Mode somehow "targeting" creatures under mouse pointer (e.g. for attacking).
  Combat.Map.Mode.MouseTarget = {
    mixIns: [Combat.Map.Mode.UpdateCursor, Combat.Map.Mode.CursorCreatures],
    _mouseTarget: null,

    events: {
      attach: function () {
        this.autoOff(this.state, {
          change_interactive: '_updateCursor',
        })

        this.autoOff(this.cmap.get('window'), {
          change_mouseParty: '_updateInfo',
        })
      },

      change_mouseCreatures: function () {
        this._updateInfo()
        this._updateCursor()
      },

      '=_updateCursor': function (sup) {
        var found = this._mouseCreaturesForHelp().some(function (cr) {
          // If current creature is not Catapult, SoD shows info for towers and own non-fortification creatures. For Catapult, it shows info for towers only.
          if (!this.cx.get('classic') || cr.get('special') == this.rules.constants.creature.special.upperTower || cr.get('special') == this.rules.constants.creature.special.middleTower || cr.get('special') == this.rules.constants.creature.special.lowerTower || (cr.party == this.state.get('interactive') && this.state.get('creature').get('special') != this.rules.constants.creature.special.catapult && !this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'damageGroup', 0))) {
            var log = _.format(this.cx.s('combat', 'View %s info.'),
              this.rules.creatures.atCoords(cr.get('creature'), 0, 0, cr.get('count') > 1 ? 'namePlural' : 'nameSingular', 0)
            )
            this._mouseTarget = {do: 'help', creature: cr._parentKey}
            this.setCursorAndHelp('help', log)
            return true
          }
        }, this)

        if (!found) {
          this._mouseTarget = null
          sup(this)
        }
      },

      cellClick: function (x, y, e) {
        var map = this.cmap

        if (!map.get('mouseCell') || x != map.get('mouseCell')[0] || y != map.get('mouseCell')[1]) {
          // XXX=B user clicked before Map has reacted to mousemove and updated mouseCell which is a problem because it means mouseSide (any others) that we need here are out of date; need to figure why there is a delay
          return
        }

        if (e.button == 2) {
          this._mouseCreaturesForHelp().some(function (cr) {
            this.showCreatureInfo(cr, true)
            return true
          }, this)
          return
        }

        if (this._mouseTarget) {
          if (this._mouseTarget.do == 'help') {
            var cr = this.combat.objects.nested(this._mouseTarget.creature)
            this.showCreatureInfo(cr)
          } else {
            this.sc.rpc.do('combat', _.extend({
              combat: this.combat._parentKey,
            }, this._mouseTarget))
          }
        }
      },
    },

    _mouseCreaturesForHelp: function () {
      var res = this.mouseCreaturesSorted()
      var pos
      if (!res.length && (pos = this.cmap.get('mouseCell'))) {
        // mouseCreatures is filtered by damageGroup. if there are none suitable, can show help for any other creature under cursor, like wall or tower.
        res = this._findMouseCreatures(pos)
      }
      return res
    },

    mouseCreaturesSorted: function () {
      var cr = this.get('mouseCreatures')
      return _.sortBy(cr, function (cr) {
        return this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'damageGroup', 0) || 0
      }, this)
    },

    showCreatureInfo: function (cr, tooltip) {
      if (this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'damageGroup', 0) && this.cx.get('classic')) {
        switch (cr.get('special')) {
          case this.rules.constants.creature.special.middleTower:
          case this.rules.constants.creature.special.upperTower:
          case this.rules.constants.creature.special.lowerTower:
            this.showTowersInfo(tooltip)
        }
      } else {
        // XXX=IC SoD shows creature info at a fixed position outside of combat but (unlike us) inside of combat it shows info near the creature
        this.cmap.get('window').ui.showCreatureInfo({
          withinWindow: this.cmap.get('window'),
          tooltip: tooltip,
          creature: cr.get('creature'),
          garrison: cr.party.object && cr.party.object.get('id'),
          garrisonSlot: cr.get('id'),
          combatCreature: [this.combat._parentKey, cr._parentKey],
          closeButton: !tooltip,
          dismissButton: false,
          animated: !tooltip,
        })
      }
    },

    showTowersInfo: function (tooltip) {
      var order = [this.rules.constants.creature.special.middleTower,
                   this.rules.constants.creature.special.upperTower,
                   this.rules.constants.creature.special.lowerTower]

      var msg = []

      this.combat.objects.each(function (cr) {
        var orig = cr instanceof HMap.Combat.Object.Corpse
          ? cr.get('creature') : cr

        var i = order.indexOf(orig.get('special'))

        if (i != -1) {
          var name = this.rules.creatures.atCoords(orig.get('creature'), 0, 0, 'namePlural', 0)
          if (orig == cr) {
            var attack = this.cx.oneShotEffectCalculation({
              target: this.cx.map.constants.effect.target.creature_attack,
              ifCombat: this.combat._parentKey,
              ifCombatCreature: orig._parentKey,
            })
            var max = this.cx.oneShotEffectCalculation({
              target: this.cx.map.constants.effect.target.creature_damageMax,
              ifCombat: this.combat._parentKey,
              ifCombatCreature: orig._parentKey,
            })
            var min = this.cx.oneShotEffectCalculation({
              target: this.cx.map.constants.effect.target.creature_damageMin,
              ifCombat: this.combat._parentKey,
              ifCombatCreature: orig._parentKey,
            })
            msg[i] = _.format(this.cx.s('combat', 'The %s has an attack skill of %d and does %d-%d damage.'), name, attack, min, max)
          } else {
            msg[i] = _.format(this.cx.s('combat', 'The %s is destroyed.'), name)
          }
        }
      }, this)

      if ((msg = _.compact(msg)).length) {
        var box = this.cmap.get('window').ui.windows.addModule(H3Bits.MessageBox, {withinWindow: this.cmap.get('window'), tooltip: tooltip})
        _.each(msg, function (msg) { box.addText(msg) })
        tooltip || box.addButton()
        return box
      }
    },

    _updateInfo: function () {
      this.cmap.get('window').set('infoObject', this.combat._parent ? this.get('mouseCreatures').find(function (cr) { return !this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'damageGroup', 0) }, this) || this.cmap.get('window').get('mouseParty') : null)
    },
  }

  // Mode that just lets the player view creatures' info without doing any actions (usually because it's not his turn).
  Combat.Map.Mode.Informational = Combat.Map.Mode.extend('HeroWO.H3.DOM.Combat.Map.Mode.Informational', {
    mixIns: [Combat.Map.Mode.MouseTarget],
  })

  // Mode for selecting a target creature for attack by any means (melee, shoot, siege, etc.).
  Combat.Map.Mode.Attack = Combat.Map.Mode.extend('HeroWO.H3.DOM.Combat.Map.Mode.Attack', {
    mixIns: [Combat.Map.Mode.HighlightMove, Combat.Map.Mode.MouseTarget],
    _calcs: {},

    _opt: {
      middleTowerHovered: false,
    },

    events: {
      attach: function () {
        this.autoOff(this.state, {
          'change_phase, change_creature, change_interactive': '_updateCursor',
          // There are plenty of other properties (canShoot) and objects (calculate()) in state that affect cursor and/or help message. Not sure if it's worth hooking all of them.
        })

        this.autoOff(this.cmap, {
          change_mouseSide: '_updateCursor',

          change_middleTower: function (now) {
            // Remove middleTower from this mode's hovered list when the object is removed such as following a Catapult's attack.
            now || this.set('middleTowerHovered', false)
          },

          middleTowerHovered: function (e) {
            var enter = e.type == 'mouseenter'
            if (this._opt.middleTowerHovered != enter) {
              this.set('middleTowerHovered', enter)
            }
          },

          middleTowerClicked: function (e) {
            if (e.button == 2) {
              this.showCreatureInfo(this.cmap.get('middleTower'), true)
            } else if (!this._mouseTarget) {
              return
            } else if (this._mouseTarget.do == 'help') {
              this.showCreatureInfo(this.cmap.get('middleTower'))
            } else {
              this.sc.rpc.do('combat', _.extend({
                combat: this.combat._parentKey,
              }, this._mouseTarget))
            }
          },
        })

        this.autoOff(this.combat.bySpot, {
          'oadd, ochange, oremove': '_updateAttackable',
        })
        this.autoOff(this.state, {
          'change_phase, change_creature, change_pathCosts, change_canShoot': '_updateAttackable',
        })

        this._calcs.creature_flying = this.cx.listeningEffectCalculator({
          class: Calculator.Effect.GenericBool,
          update: 'defer',
          target: this.cx.map.constants.effect.target.creature_flying,
          shared: false,
          ifCombat: this.combat._parentKey,
          ifCombatCreature: this.state.get('creature')._parentKey,
        })

        this._calcs.creature_strikes = this.cx.listeningEffectCalculator({
          update: 'defer',
          target: this.cx.map.constants.effect.target.creature_strikes,
          shared: false,
          ifCombat: this.combat._parentKey,
          ifCombatCreature: this.state.get('creature')._parentKey,
        })

        this._calcs.creature_wallStrikes = this.cx.listeningEffectCalculator({
          update: 'defer',
          target: this.cx.map.constants.effect.target.creature_wallStrikes,
          shared: false,
          ifCombat: this.combat._parentKey,
          ifCombatCreature: this.state.get('creature')._parentKey,
        })

        this.autoOff(this._calcs.creature_flying, {
          change_value: '_updateCursor',
        })

        var updateDamageGroups = function () {
          this._updateMouseCell()
          this._updateAttackable()
        }.bind(this)

        this.autoOff(this._calcs.creature_strikes, {
          change_value: updateDamageGroups,
        })

        this.autoOff(this._calcs.creature_wallStrikes, {
          change_value: updateDamageGroups,
        })

        this.autoOff(this.state, {
          change_creature: function (now) {
            _.invoke(this._calcs, 'set', 'ifCombatCreature', now._parentKey)
          },
        })
      },

      change_mouseCreatures: function (now) {
        if (this.cx.get('classic')) {
          now = now.filter(function (cr) {
            return !this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'damageGroup', 0)
          }, this)
        }

        // In SoD, when you hover over a target for attack by a creature with round attack (Hydra) the target alone is highlighted, without others who will be affected.
        //
        // XXX=IC SoD draws on-hover outline for creatures of different damageGroup (e.g. if currently active creature is Griffin, hover of Catapult is outlined in SoD but not in HeroWO; same if active is Catapult and hovered is Griffin)
        this.cmap.set('hoveredCreatures', now)
      },

      reset: function () {
        var clsM = 'Hh3-cm__grid-cell_route'
        var clsA = 'Hh3-cm__grid-cell_attack'
        this.$('.' + clsM).removeClass(clsM)
        this.$('.' + clsA).removeClass(clsA)

        var clsS = 'Hh3-cm__grid-cell_shoot'
        this.$('.' + clsS).removeClass(clsS)
        var clsO = 'Hh3-cm__grid-cell_starting'
        this.$('.' + clsO).removeClass(clsO)
      },

      render: '_updateAttackable',

      change_middleTowerHovered: function (now) {
        this._updateMouseCell()
        this._updateCursor()
      },

      '+_findMouseCreatures': function (res, pos) {
        if (pos[0] == 12 && pos[1] == 10) { // XXX=RH
          // Lower tower is fully passable because it's located beyond the field. SoD allows targeting it by pointing at the upper-right cell (upper-left is occupied by the lower wall).
          this.combat.objects.some(function (cr) {
            if (cr.get('special') == this.rules.constants.creature.special.lowerTower && cr.get('x') == pos[0] && cr.get('y') == pos[1]) {
              return res.push(cr)
            }
          }, this)
        }
      },

      '=_updateMouseCell': function (sup) {
        if (this.get('middleTowerHovered')) {
          this.set('mouseCreatures', [this.cmap.get('middleTower')])
        } else {
          sup(this, arguments)
        }
      },

      '+_mouseCreaturesForHelp': function (res) {
        if (this.get('middleTowerHovered')) {
          return [this.cmap.get('middleTower')]
        }
      },

      '=_filterMouseCreatures': function (sup, value) {
        var groups = this._damageGroups()

        return value.filter(function (cr) {
          return _.includes(groups, this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'damageGroup', 0))
        }, this)
      },

      setCursorAndHelp: function (cursor) {
        if (this.get('middleTowerHovered')) {
          Common.oneClass(this.cmap.$('.Hh3-cm__map-keep'), 'Hh3-cm_cursor_', cursor)
        }
      },

      // XXX=R
      '=_updateCursor': function (sup) {
        if (!this.get('rendered')) { return }

        var cur = this.cmap._opt.mouseCell
        var state = this.state

        var clsM = 'Hh3-cm__grid-cell_route'
        var clsA = 'Hh3-cm__grid-cell_attack'
        this.$('.' + clsM).removeClass(clsM)
        this.$('.' + clsA).removeClass(clsA)

        var formatDamage = function (damageRange) {
          if (damageRange[0] > 900) {   // determined empirically
            var round = function (n) {
              n = Math.round(n / 100)
              // Using separate format strings to allow localizing decimal point.
              return n % 10
                ? _.format(this.cx.s('combat', '%d.%dk'), n / 10, n % 10)
                : _.format(this.cx.s('combat', '%dk'), n / 10)
            }.bind(this)

            damageRange[0] = round(damageRange[0])
            damageRange[1] = round(damageRange[1])
          }

          return damageRange[0] + (damageRange[0] == damageRange[1] ? '' : this.cx.s('combat', '-') + damageRange[1])
        }.bind(this)

        if (cur) {
          if (state.get('phase') == 'combat') {
            var all = _.partition(this.mouseCreaturesSorted(), function (cr) {
              return !this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'damageGroup', 0)
            }, this)

            var creatures = all[0]
            var walls = all[1]

            if (this.cx.get('classic')) {
              if (cur[0] == 9 && cur[1] == 5) { // XXX=RH
                // Gate's hotspot in SoD is the right cell only.
                walls = []
              }
            } else if (walls.length && ((cur[0] == 10 && cur[1] == 5) || (cur[0] == 12 && cur[1] == 10)) && this.cmap._opt.mouseSide == 'bl') {  // XXX=RH
              // SoD doesn't allow attacking gate (or lower tower) if somebody is standing on (or above) it. We allow this by pointing cursor at the bottom left corner - it's vacant because attacking melee from that side is impossible due to the permanent obstacle (or field edge), and shooting can be directed from other corners.
              creatures = []
            }

            var found = creatures.concat(walls).some(function (cr, i) {
              if (cr.party.player.get('team') != this.pl.get('team')) {
                var wall = i >= creatures.length
                var damageRange = state.attackTargets[wall ? 'canDamage' : 'damageRange'](cr, [state._opt.creature._opt.x, state._opt.creature._opt.y], false)
                if (damageRange) {
                  if (wall) {
                    var log = _.format(this.cx.s('combat', 'Attack %s'),
                      this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'namePlural', 0))
                    this._mouseTarget = {do: 'hurl', target: cr._parentKey}
                    this.setCursorAndHelp('catapult', log)
                    return true
                  }
                  if (state._opt.creature.get('shots') > 1) {
                    var log = _.format(this.cx.s('combat', 'Shoot %s (%d shots left, %s damage)'),
                      this.rules.creatures.atCoords(cr.get('creature'), 0, 0, cr.get('count') > 1 ? 'namePlural' : 'nameSingular', 0),
                      // Display creature's native max shots at most, for situations when Ammo Cart is present (it has +9999 modifier on creature_shots).
                      Math.min(this.rules.creatures.atCoords(state._opt.creature.get('creature'), 0, 0, 'shots', 0), state._opt.creature.get('shots')),
                      formatDamage(damageRange)
                    )
                  } else {
                    var log = _.format(this.cx.s('combat', 'Shoot %s (1 shot left, %s damage)'),
                      this.rules.creatures.atCoords(cr.get('creature'), 0, 0, cr.get('count') > 1 ? 'namePlural' : 'nameSingular', 0),
                      formatDamage(damageRange)
                    )
                  }
                  this._mouseTarget = {do: 'shoot', target: cr._parentKey}
                  this.setCursorAndHelp(damageRange[3] ? 'shoot' : 'shootFar', log)
                  return true
                }

                // Find possible attack side from interactiveCreature to cr. First test user's mouseSide and if cannot attack from this spot, try others giving priority to mouseSide in such a way that if it's close to top (t*) then test t* first, etc.
                var sides = ['tl', 'bl', 'tr', 'br', 'l', 'r']
                var userSide = this.cmap._opt.mouseSide
                function score(side) {
                  var score = 0
                  for (var i = side.length; i--; ) {
                    // Each testing side's letter that exists in user's side improves
                    // the testing side's score. Each mismatching letter reduces it.
                    // This way exactly matching side (e.g. 'r' == 'r') will have
                    // the highest score. If we were to count only matching letters,
                    // 'tr' would rank higher than 'r' given user's side of 'r'.
                    score += userSide.indexOf(side[i]) == -1 ? -1 : 1
                  }
                  return score
                }
                sides.sort(function (a, b) {
                  return score(b.split('')) - score(a.split(''))
                })
                return _.some(sides, function (side) {
                  var me = state._opt.creature._opt
                  // See diagrams in PathFinder.AStar.
                  switch (side) {
                    case 'l':
                      var pos = [cur[0] - me.width, cur[1]]
                      break
                    case 'r':
                      var pos = [cur[0] + 1, cur[1]]
                      break
                    case 'tl':
                      var pos = [cur[0] - 1 + (cur[1] - me.height) % 2, cur[1] - me.height]
                      break
                    case 'bl':
                      var pos = [cur[0] - 1 + (cur[1] + 1) % 2, cur[1] + 1]
                      break
                    case 'tr':
                      var pos = [cur[0]     + (cur[1] - me.height) % 2, cur[1] - me.height]
                      break
                    case 'br':
                      var pos = [cur[0]     + (cur[1] + 1) % 2, cur[1] + 1]
                      break
                  }
                  var damageRange
                  if (!(pos[0] < 0 || pos[1] < 0 || pos[0] >= this.combat.get('width') || pos[1] >= this.combat.get('height'))) {
                    if ((pos[0] != me.x || pos[1] != me.y) && // no pathTo() but attacking from standing spot, okay
                        !state.pathTo(pos)) {
                      // Find possible standing spot for the attack. This is not as trivial as it sounds because creatures may occupy more than 1 cell (2 in SoD, arbitrary passability in HeroWO). For this, check if the spot indicated by the user is reachable (can walk to) and if not, see if any nearby spot (as in mouseSide) intersects with the creature standing somewhere else (i.e. not exactly on the user's spot). If found one, pretend the "user's spot" is the one which intersects it.
                      pos = this._canStandOn[pos[0] + pos[1] * this.combat.get('width')]
                    }
                    if (pos) {
                      damageRange = state.attackTargets[wall ? 'canDamage' : 'damageRange'](cr, pos, true)
                    }
                  }
                  if (damageRange) {
                    var box = state._opt.creature.get()
                    box.x = pos[0]
                    box.y = pos[1]
                    this.combat.walkImpassable(box, function (o) {
                      this.cmap.gridCellAt(o.mx, o.my).classList.add(clsA)
                    }, this)
                    if (wall) {
                      var log = _.format(this.cx.s('combat', 'Attack %s'),
                        this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'namePlural', 0))
                      this._mouseTarget = {do: 'ram', target: cr._parentKey}
                      this.setCursorAndHelp('catapult', log)
                    } else {
                      if (damageRange[2]) {
                        damageRange[2].slice(1, -1).forEach(function (item) {
                          this.cmap.gridCellAt(item[0], item[1]).classList.add(clsM)
                        }, this)
                      }
                      var log = _.format(this.cx.s('combat', 'Attack %s (%s damage)'),
                        this.rules.creatures.atCoords(cr.get('creature'), 0, 0, cr.get('count') > 1 ? 'namePlural' : 'nameSingular', 0),
                        formatDamage(damageRange)
                      )
                      this._mouseTarget = {do: 'melee', target: cr._parentKey, fromSpot: pos}
                      this.setCursorAndHelp(side, log)
                    }
                    return true
                  }
                }, this)
              }
            }, this)
            if (found) { return }
          }

          // At this point phase is either 'tactics' or null (i.e. waiting)
          // or it's 'combat' while cur can't be attacked.

          var path = state.pathTo(cur)
          if (state._opt.creature && path) {
            path.slice(1, -1).forEach(function (item) {
              this.cmap.gridCellAt(item[0], item[1]).classList.add(clsM)
            }, this)
            var log = _.format(this.cx.s('combat', this._calcs.creature_flying.get('value') ? 'Fly %s here.' : 'Move %s here.'),
              this.rules.creatures.atCoords(state._opt.creature.get('creature'), 0, 0, state._opt.creature.get('count') > 1 ? 'namePlural' : 'nameSingular', 0)
            )
            this._mouseTarget = {do: 'move', destination: cur}
            return this.setCursorAndHelp(this._calcs.creature_flying.get('value') ? 'fly' : 'walk', log)
          }
        } else if (this.get('middleTowerHovered')) {
          var cr = this.cmap.get('middleTower')
          if (this.get('mouseCreatures')[0] == cr &&
              state.attackTargets.canDamage(cr, [state._opt.creature._opt.x, state._opt.creature._opt.y], false)) {
            var log = _.format(this.cx.s('combat', 'Attack %s'),
              this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'namePlural', 0))
            this._mouseTarget = {do: 'hurl', target: cr._parentKey}
            return this.setCursorAndHelp('catapult', log)
          }
        }

        sup(this)
      },
    },

    _updateAttackable: function () {
      if (!this.get('rendered')) { return }

      var clsS = 'Hh3-cm__grid-cell_shoot'
      this.$('.' + clsS).removeClass(clsS)
      var clsO = 'Hh3-cm__grid-cell_starting'
      this.$('.' + clsO).removeClass(clsO)

      // SoD always highlights creature's own (starting) cell(s), both for melee and shooting. It also highlights target creature's cell(s). Below, we're chopping first and last segments off found paths (slice(1, -1)) to allow using different CSS classes on start and end spots.
      this.combat.walkImpassable(this.state.get('creature'), function (o) {
        this.cmap.gridCellAt(o.mx, o.my).classList.add(clsO)
      }, this)

      if (this.state.get('phase') == 'combat') {
        var groups = this._damageGroups()
        this.combat.parties.each(function (p) {
          if (p.player.get('team') != this.pl.get('team')) {
            p.each(function (cr) {
              var dg = this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'damageGroup', 0)
              if (_.includes(groups, dg) && (!this.cx.get('classic') || !dg)) {
                var can
                // Try from the spot we're standing on (for shooters).
                can = can || this.state.attackTargets.canDamage(cr, this.state.get('creature').getSet(['x', 'y']))
                // Try from all spots around the enemy (slow). XXX=O
                can = can || _.some(this.state.aroundDeepStand(cr.get('x'), cr.get('y'), 1, 0, cr.get('width'), cr.get()), function (item) {
                  return this.state.attackTargets.canDamage(cr, item)
                }, this)
              }
              if (can) {
                this.combat.walkImpassable(cr, function (o) {
                  this.cmap.gridCellAt(o.mx, o.my).classList.add(clsS)
                }, this)
              }
            }, this)
          }
        }, this)
      }
    },

    _damageGroups: function () {
      var groups = []
      this._calcs.creature_strikes.updateIfNeeded().get('value') === 0 || groups.push(0, false)
      this._calcs.creature_wallStrikes.updateIfNeeded().get('value') && groups.push(this.rules.constants.creature.damageGroup.wall)
      return groups
    },
  })

  // Mode for selecting a creature for healing.
  Combat.Map.Mode.FirstAid = Combat.Map.Mode.extend('HeroWO.H3.DOM.Combat.Map.Mode.FirstAid', {
    mixIns: [Combat.Map.Mode.MouseTarget],

    events: {
      attach: function () {
        this.autoOff(this.sc, {
          change_combatHighlightMove: 'update',
        })

        this.autoOff(this.state.get('creature'), {
          'change_x, change_y': '_updateOwnSpot',
        })
      },

      change_mouseCreatures: function (now) {
        this.cmap.set('hoveredCreatures', now)
      },

      reset: function () {
        var clsS = 'Hh3-cm__grid-cell_starting'
        this.$('.' + clsS).removeClass(clsS)
      },

      // XXX=I also highlight cells under creatures that can be healed (in non-classic mode)
      _update: function () {
        this.el.toggleClass('Hh3-cm__map_hl-move', this.sc.get('combatHighlightMove'))
      },

      render: function () {
        var found = this.state.get('interactive').some(function (cr) {
          var full = this.cx.oneShotEffectCalculation({
            target: this.cx.map.constants.effect.target.creature_hitPoints,
            ifObject: cr.party.object && cr.party.object.get('id'),
            ifCreature: cr.get('creature'),
          })
          return cr.get('hitPoints') < full
        }, this)

        if (!found) {
          return this.sc.rpc.do('combat', {
            do: 'defend',
            combat: this.combat._parentKey,
          })
        }

        this._updateOwnSpot()
      },

      '=_updateCursor': function (sup) {
        var cr = this.get('mouseCreatures')[0]

        if (cr && cr.party.player.get('team') == this.pl.get('team')) {
          switch (cr.get('special')) {   // XXX=RH
            case this.rules.constants.creature.special.catapult:
            case this.rules.constants.creature.special.ballista:
            case this.rules.constants.creature.special.ammoCart:
            case this.rules.constants.creature.special.firstAidTent:
            case this.rules.constants.creature.special.lowerTower:
            case this.rules.constants.creature.special.upperTower:
            case this.rules.constants.creature.special.middleTower:
              break
            default:
              var full = this.cx.oneShotEffectCalculation({
                target: this.cx.map.constants.effect.target.creature_hitPoints,
                ifObject: cr.party.object && cr.party.object.get('id'),
                ifCreature: cr.get('creature'),
              })
              if (cr.get('hitPoints') < full) {
                var log = _.format(this.cx.s('combat', 'Apply first aid to the %s'), this.rules.creatures.atCoords(cr.get('creature'), 0, 0, cr.get('count') > 1 ? 'namePlural' : 'nameSingular', 0))
                this._mouseTarget = {do: 'heal', target: cr._parentKey}
                return this.setCursorAndHelp('heal', log)
              }
          }
        }

        sup(this)
      },
    },

    _updateOwnSpot: function () {
      var clsS = 'Hh3-cm__grid-cell_starting'
      this.$('.' + clsS).removeClass(clsS)

      this.combat.walkImpassable(this.state.get('creature'), function (o) {
        this.cmap.gridCellAt(o.mx, o.my).classList.add(clsS)
      }, this)
    },
  })

  // Base Mode used after selecting a spell in Spell Book but before (and for) casting.
  Combat.Map.Mode.Spell = Combat.Map.Mode.extend('HeroWO.H3.DOM.Combat.Map.Mode.Spell', {
    _potential: null,
    _immunityTarget: 'creature_spellImmune',

    _opt: {
      book: null, // optional, SpellBook which was used to trigger casting
      spell: 0,   // do not change
      global: false,  // reflects calculator
      // + Spell properties
    },

    events: {
      attach: function () {
        // XXX=IC condition: if classic && targeting 1 cell
        this.set('highlightHover', this.cx.get('classic') ? false : null)

        var atter = this.cx.shared(this.constructor.shared, function () {
          return this.cmap.rules.spells.atter()
        }, this)

        this.assignResp(atter(this.get('spell'), 0, 0, 0))

        this._calcToOpt('global', Calculator.Effect.GenericBool, {
          target: this.cx.map.constants.effect.target.spellGlobal,
        })

        this._potential = new Effects.Collection({effects: this.cx.map.effects})

        this.autoOff(this.state, {
          change_interactive: function (now) {
            _.each(this._potential.members(), function (m) {
              m.calc.set('ifCombatParty', now._parentKey)
            })
          },
        })

        this._potential.fuse('+readyMember', function (res, creature) {
          creature = this.combat.objects.nested(creature)
          res.calc = this.cx.listeningEffectCalculator({
            class: Calculator.Effect.GenericBool,
            update: 'defer',
            target: this.cx.map.constants.effect.target[this._immunityTarget],
            shared: false,
            ifCombat: this.combat._parentKey,
            ifCombatParty: this.state.get('interactive')._parentKey,
            ifSpell: this.get('spell'),
            ifTargetCombatCreature: creature._parentKey,
          })
          res.off.push(res.calc, res.calc.on('change_value', function (now) { this.fire('immunityChanged', [creature, now]) }, this))
          res.off.push(res.calc, res.calc.on('change_affectors', function (now) { this.fire('immunityAffectorsChanged', [creature, now]) }))
        }, this)

        this._potential.bindNested(this.combat.objects, null, function (obj) {
          return obj instanceof HMap.Combat.Creature && !this.rules.creatures.atCoords(obj.get('creature'), 0, 0, 'damageGroup', 0)
        }.bind(this))
      },

      render: function () {
        if (_.every(this._potential.members(), function (m) { return m.calc.get('value') })) {
          this.cmap.get('window').ui.windows.addModule(H3Bits.MessageBox, {withinWindow: this.cmap.get('window')})
            .addText(this.cx.s('combat', 'That spell will affect no one!'))
            .addButton()
          return this.cancel()
        }

        this.getSet('book', function (cur) {
          cur && cur.cancel()
        })

        if (this.get('global')) {
          this._castGlobally()
        }
      },

      '+cellClick': function (res, x, y, e) {
        return e.button != 2
      },

      '+cellContextMenu': function (x, y, e) {
        this.cancel()
        return false
      },
    },

    _calcToOpt: function (name, cls, options) {
      var calc = this.cx.listeningEffectCalculator(_.extend(options, {
        class: cls,
        update: 'defer',
        shared: false,
        ifCombat: this.combat._parentKey,
        ifCombatParty: this.state.get('interactive')._parentKey,
        ifSpell: this.get('spell'),
      }))
      this.autoOff(this.state, {
        change_interactive: function (now) {
          calc.set('ifCombatParty', now._parentKey)
        },
      })
      this.autoOff(calc, {}).whenRenders('change_value', function () {
        this.set(name, calc.get('value'))
      }, this)
    },

    // Can be called when this is already unnested (e.g. as a delayed callback).
    cancel: function () {
      this.remove()
      this.cmap.get('window')._updateMode()
    },

    _castGlobally: function () {
      this._cast()
    },

    _cast: function (args) {
      this.remove()

      var async = this.sc.rpc.do('combat', _.extend(args || {}, {
        combat: this.combat._parentKey,
        do: 'cast',
        spell: this.get('spell'),
      }))

      this.autoOff(async, {}).whenComplete(this.cancel, this)
    },

    // function (creature, nowImmune)
    immunityChanged: Common.stub,
    // function (creature, nowAffectors)
    immunityAffectorsChanged: Common.stub,
  }, {shared: {}})

  // Base Mode for selecting spell target (be it a single creature, an area or other).
  Combat.Map.Mode.Spell.Targeted = Combat.Map.Mode.Spell.extend('HeroWO.H3.DOM.Combat.Map.Mode.Spell.Targeted', {
    mixIns: [Combat.Map.Mode.UpdateCursor, Combat.Map.Mode.CursorCreatures],

    events: {
      '+_filterMouseCreatures': function (now) {
        return now.filter(function (cr) {
          return !this._potential.member(cr._parentKey).calc.get('value')
        }, this)
      },

      change_mouseCreatures: function (now) {
        // In SoD, hovering by a spell outlines all affected creatures, not just the one in the hovered cell (e.g. Fireball) - except the active creature (whose turn it is) who remains outlined in yellow - EXCEPT when casting an area-based spell (like Fireball).
        //
        // XXX=IC currently HeroWO always keeps active turn's outline even for area spells (Fireball)
        this.cmap.set('hoveredCreatures', now)
        this._updateCursor()
      },

      'immunityChanged, immunityAffectorsChanged': function (creature) {
        if (_.includes(this.get('mouseCreatures'), creature._parentKey)) {
          this._updateCursor()
        }
      },
    },
  })

  // Mode for selecting a single target creature (not necessary enemy) for a spell.
  Combat.Map.Mode.Spell.Arrow = Combat.Map.Mode.Spell.Targeted.extend('HeroWO.H3.DOM.Combat.Map.Mode.Spell.Arrow', {
    // SoD highlights move cells for all (?) spells except area-based.
    mixIns: [Combat.Map.Mode.HighlightMove],

    events: {
      attach: function () {
        this.autoOff(this.cmap, {
          // Need to hook this in order to show immunity reason.
          change_mouseCell: '_updateCursor',
        })
      },

      '=_updateCursor': function () {
        var cr = this.get('mouseCreatures')[0]

        if (cr) {
          // Got outlined - can cast, that's nice.
          return this.setCursorAndHelp('cast', _.format(this.cx.s('combat', 'Cast %s on %s'), this.get('name'), this.rules.creatures.atCoords(cr.get('creature'), 0, 0, cr.get('count') == 1 ? 'nameSingular' : 'namePlural', 0)))
        }

        // No outlined creature, but perhaps it's due to immunity?
        var pos = this.cmap.get('mouseCell')
        if (pos) {
          cr = this.combat.bySpot.findAtCoords(pos[0], pos[1], 0, 'key', function (key) {
            var obj = this.combat.objects.nested(key)
            if (obj instanceof HMap.Combat.Creature && !this.rules.creatures.atCoords(obj.get('creature'), 0, 0, 'damageGroup', 0)) {
              return obj
            }
          }, this)
        }

        if (cr) {
          var calc = this._potential.member(cr._parentKey).calc
          if (calc.get('value')) {
            // Creature is immune to this spell. Find out why.
            var found
            calc.get('affectors').concat().reverse().some(function (n) {
              var src = this.cx.map.effects.atContiguous(n + this.cx.map.effects.propertyIndex('source'), 0)
              switch (src) {
                case this.cx.map.constants.effect.source.spellDefense:
                case this.cx.map.constants.effect.source.spellOffense:
                case this.cx.map.constants.effect.source.spellImmune:
                  found = src
                  return true
                default:
                  if (src[0] == this.cx.map.constants.effect.source.spell) {
                    return found = src
                  }
              }
            }, this)
            if (_.isArray(found)) {
              return this.setCursorAndHelp('deny', _.format(this.cx.s('combat', '%s protects the %s'), this.rules.spells.atCoords(src[1], 0, 0, 'name', 0), this.rules.creatures.atCoords(cr.get('creature'), 0, 0, cr.get('count') == 1 ? 'nameSingular' : 'namePlural', 0)))
            } else {
              switch (found) {
                case this.cx.map.constants.effect.source.spellDefense:
                  return this.setCursorAndHelp('deny', _.format(this.cx.s('combat', '%s can only be cast on friendly creatures'), this.get('name')))
                case this.cx.map.constants.effect.source.spellOffense:
                  return this.setCursorAndHelp('deny', _.format(this.cx.s('combat', '%s can only be cast on hostile creatures'), this.get('name')))
                case this.cx.map.constants.effect.source.spellImmune:
                  var msg = cr.get('count') == 1
                    ?  _.format(this.cx.s('combat', '%s is immune to %s'), this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'nameSingular', 0), this.get('name'))
                    :  _.format(this.cx.s('combat', '%s are immune to %s'), this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'namePlural', 0), this.get('name'))
                  return this.setCursorAndHelp('deny', msg)
                default:
                  // Nothing specific found, fall through and don't show any details message (SoD behaviour, e.g. when casting Beginner's Dispel on enemy).
              }
            }
          }
        }

        this.setCursorAndHelp('deny', this.cx.s('combat', this.cx.get('classic') ? 'Select Spell Target' : 'Select Spell Target (right-click to cancel)'))
      },

      '+cellClick': function (res, x, y, e) {
        var cr = this.get('mouseCreatures')[0]

        if (res !== false && cr) {
          this._cast({
            target: cr._parentKey,
          })
        }
      },
    },
  })

  // Specialized Mode for selecting a single target for a Dispel-like spell.
  Combat.Map.Mode.Spell.Dispel = Combat.Map.Mode.Spell.Arrow.extend('HeroWO.H3.DOM.Combat.Map.Mode.Spell.Dispel', {
    _immunityTarget: 'creature_dispelImmune',

    events: {
      '+_filterMouseCreatures': function (now) {
        return now.filter(function (cr) {
          // XXX=O
          var source = this.cx.map.effects.propertyIndex('source')
          var ifCombat = this.cx.map.effects.propertyIndex('ifCombat')
          var ifCombatCreature = this.cx.map.effects.propertyIndex('ifCombatCreature')
          var ifTargetCombatCreature = this.cx.map.effects.propertyIndex('ifTargetCombatCreature')
          var found = this.cx.map.effects.find(source, function (src, $1, $2, $3, $4, n) {
            if (src && src[0] == this.cx.map.constants.effect.source.spell && this.cx.map.effects.atContiguous(n - source + ifCombat, 0) === this.combat._parentKey && (this.cx.map.effects.atContiguous(n - source + ifCombatCreature, 0) === cr._parentKey || this.cx.map.effects.atContiguous(n - source + ifTargetCombatCreature, 0) === cr._parentKey)) {
              return true
            }
          }, this)
          return found
        }, this)
      },
    },
  })

  // Mode for selecting a single starting target enemy creature for a spell that bounces off to other creatures.
  Combat.Map.Mode.Spell.ChainLightning = Combat.Map.Mode.Spell.Arrow.extend('HeroWO.H3.DOM.Combat.Map.Mode.Spell.ChainLightning', {
    events: {
      '+_filterMouseCreatures': function (now) {
        return now.filter(function (cr) {
          // Unlike with other spells, can't use spellImmune to specify valid target because friendly creatures can get hit by Chain Lightning as long as they're not first to be hit. If spellImmune were used, this would prevent them from getting hit at all (which is still a valid case for some creatures like dragons).
          return cr.party.player.get('team') != this.state.get('interactive').player.get('team')
        }, this)
      },
    },
  })

  // Mode for selecting a target spot for an area-based spell (like Fireball).
  Combat.Map.Mode.Spell.Area = Combat.Map.Mode.Spell.Targeted.extend('HeroWO.H3.DOM.Combat.Map.Mode.Spell.Area', {
    _opt: {
      spellAround: null,  // reflects calculator
      spellAroundEye: null, // reflects calculator
    },

    events: {
      attach: function () {
        this._calcToOpt('spellAround', Calculator.Effect.GenericNumber, {
          target: this.cx.map.constants.effect.target.spellAround,
        })
        this._calcToOpt('spellAroundEye', Calculator.Effect.GenericNumber, {
          target: this.cx.map.constants.effect.target.spellAroundEye,
        })

        this.autoOff(this.cmap, {
          // _updateCursor() is called on render (UpdateCursor), mouseCreatures and immunity changes (Targeted). However, Area's AoE depends on exact mouseCell, not mouseCreatures (for a wide creature, the latter may remain unchanged while the hovered cell changes).
          change_mouseCell: '_updateCursor',
        })
      },

      'change_spellAround, change_spellAroundEye': function () {
        this._updateHover(this.cmap.get('mouseCell'))
      },

      // Note: base _updateHover() expects old as 2nd argument, we're not giving it.
      '=_updateHover': function (sup, now) {
        if (now) {
          // SoD doesn't draw hovered effect on cells which are under immune creatures.
          var around = this._around(now[0], now[1])
          this._findMouseCreatures(now).forEach(function (cr) {
            if (!this.rules.creatures.atCoords(cr.get('creature'), 0, 0, 'damageGroup', 0) &&
                this._potential.member(cr._parentKey).calc.get('value')) {
              // Got an immune one.
              this.combat.walkImpassable(cr, function (o) {
                delete around[this.bySpot.toContiguous(o.mx, o.my, 0, 0)]
              })
            }
          }, this)
          now = _.values(around)
        }

        this.set('highlightedCells', now)
      },

      '=_findMouseCreatures': function (sup, pos) {
        var res = []

        _.each(this._around(pos[0], pos[1]), function ($, n) {
          this.combat.bySpot.findAtContiguous(n, function (key) {
            var obj = this.combat.objects.nested(key)
            if (obj instanceof HMap.Combat.Creature) {
              res.push(obj)
            }
          }, this)
        }, this)

        return res
      },

      '=_updateCursor': function () {
        if (this.cmap.get('mouseCell')) {
          this.setCursorAndHelp('cast', _.format(this.cx.s('combat', 'Cast %s'), this.get('name')))
        } else {
          this.setCursorAndHelp('deny', this.cx.s('combat', this.cx.get('classic') ? 'Select Spell Target' : 'Select Spell Target (right-click to cancel)'))
        }
      },

      '+cellClick': function (res, x, y, e) {
        var pos = this.cmap.get('mouseCell')

        if (res !== false && pos) {
          this._cast({
            target: pos,
          })
        }
      },
    },

    _around: function (x, y) {
      return this.state.aroundDeep(x, y, this.get('spellAround'), this.get('spellAroundEye') - 1)
    },
  })

  // Scrollable list of recent actions displayed in the middle of the status bar.
  // Replaces messages with help text when pertinent.
  Combat.Log = Bits.Base.extend('HeroWO.H3.DOM.Combat.Log', {
    el: {class: 'Hh3-menu__text3'},
    _alert: null,
    _help: null,
    _lineHeight: 0,
    _slider: null,
    _lastNew: null,

    _opt: {
      help: '',
    },

    events: {
      init: function () {
        // updateState() relies on _.slider.el to be available before attach.
        this._slider = new Slider({
          height: 2,    // as per CSS
          upClass: 'Hh3-btn_id_COMSLIDE',
          downClass: 'Hh3-btn_id_COMSLIDE',
        })
      },

      attach: function () {
        this.autoOff(this.cx, {
          change_classic: function () {
            this._slider.getSet('position')
          },
        })

        this.autoOff(this.get('combat'), {
          change_state: 'update',
        })

        this.get('combat').parties.each(function (party) {
          this.autoOff(party, {
            change_ready: 'update',
          })
        }, this)

        var atter = this.get('combat').log.atter(['type', 'message', 'party'])

        // Assuming log entries cannot be changed or removed after being added.
        this.autoOff(this.get('combat').log, {
          oadd: function ($1, $2, props, options) {
            this.sc.transitions.updateUsing(null, options, this, function () {
              var log = atter(props)
              var party = this.get('combat').parties.nested(log.party)

              var msg = log.message.concat()
              msg[0] = this.cx.s('combat', msg[0])
              var el = $('<div>')
                .text(_.format.apply(_, msg))

              Common.oneClass(el, 'Hh3-cm__log-entry', '',
                '_type_' + log.type,
                !party ? '_of_none' :
                  (party.player == this.pl ? '_of_me'
                    : party.player.get('team') == this.pl.get('team') ? '_of_ally' : '_of_enemy'))

              if (log.type == this.map.constants.combatLog.type.newRound) {
                this.$('.Hh3-cm__log-entry').addClass('Hh3-cm__log-entry_past')
                this._lastNew = el[0]
              }

              el.appendTo(this.el)
              this._updateHeight()
            })
          },
        })
      },

      change_help: function () {
        this.update()
        this._updateHeight()
      },

      '-render': function () {
        this._slider.el.addClass('Hh3-cm__log-slider').insertAfter(this.el)

        this._alert = $('<div class=Hh3-cm__log-alert>').appendTo(this.el)
        this._help = $('<div class=Hh3-cm__log-help>').appendTo(this.el)
      },

      render: function () {
        this.autoOff(this._slider, {
          '+normalize_position': function (res) {
            // XXX=IC if there is a log entry from previous turn and _lastNew's height is 1, last line of that entry is displayed; need to add padding
            //
            // ---------------------------------------
            // | "Some entry from the previous turn" |    << this should not be visible
            // |        "Next round begins."         |
            // ---------------------------------------
            // ---------------------------------------
            // |        "Next round begins."         |    << should look like this
            // |                                     |
            // ---------------------------------------
            if (this.cx.get('classic')) {
              return Math.max(res, this._lastNew && this._lastNew.offsetTop)
            }
          },
          change_position: '_scrollTo',
        })
          .attach(null)
          .render()
          .attachContent(this.el[0])

        this._updateHeight()
      },

      '-unnest': function () {
        this._parent && this._slider.remove()
      },

      _update: function () {
        var pending = this.get('combat').parties.reject(Common.p('get', 'ready'))
        this._alert.toggle(pending.length > 0)

        if (pending.length) {
          this._alert.text(_.format(
            this.cx.s('combat', 'Waiting for %s'),
            pending
              .map(function (p) {
                return this.rules.databank.players.atCoords(p.player.get('player'), 0, 0, 'name', 0)
              }, this)
              .join(this.cx.s('combat', ', '))
          ))
        }

        var help = this.get('help')
        this.el.toggleClass('Hh3-cm__log_help', help != '')
        this._help.text(help)
        // When entries are hidden, scroll position resets.
        help == '' && this._scrollTo(this._slider.get('position'))
      },
    },

    _scrollTo: function (now) {
      this.el[0].scrollTop = now * this._lineHeight
    },

    _updateHeight: function () {
      if (this._slider) {
        // Since the CSS is configured to show exactly 2 lines in the log,
        // dividing el's height by 2 gets us the height of one line.
        this._lineHeight = this._lineHeight || this.el.innerHeight() / 2
        // When help is visible, entries are hidden and this.el[0].scrollHeight
        // as well as entry.offsetHeight are 0. jQuery's height() gives correct
        // result even in this case.
        var scrollHeight = _.reduce(this.$('.Hh3-cm__log-entry'), function (cur, node) { return cur + $(node).height() }, 0)
        this._slider.set('max', scrollHeight / this._lineHeight - 1)
        this._slider.set('position', Infinity)  // scroll to bottom
      }
    },
  })

  // Ordered list of creatures due for movement in this round.
  // Shown on top of the screen in non-classic mode.
  Combat.Queue = Bits.Base.extend('HeroWO.H3.DOM.Combat.Queue', {
    mixIns: [Common.Ordered],

    _opt: {
      combat: null,
    },

    events: {
      attach: function () {
        var queue = this.get('combat').combat.queue

        this.autoOff(this.get('combat').combat, {
          change_interactiveCreature: 'update',
        })

        this.autoOff(queue, {
          unnested: 'unlist-.',

          // Called before nestExNew().
          _repos: function (child, index) {
            child = queue.at(index)
            var own = this.nested(child.key) || this._add(child)
            own && this.nest(child.key, own, {pos: child.pos})
          },
        })

        queue.each(function (child, index) {
          child = queue.at(index)
          var own = this._add(child)
          own && this.nest(child.key, own, {pos: child.pos})
        }, this)
      },

      nestExNew: 'update',
      unnested: 'update',

      _update: function () {
        var current = this.get('combat').combat.get('interactiveCreature')
        this.each(function (creature) {
          creature.set('features', creature.get('combatCreature') == current ? ['activeTurn'] : [])
        }, this)
      },
    },

    _add: function (child) {
      switch (child.child.get('special')) {
        case this.map.constants.creature.special.trench:
        case this.map.constants.creature.special.upperTower:
        case this.map.constants.creature.special.middleTower:
        case this.map.constants.creature.special.lowerTower:
        case this.map.constants.creature.special.gate:
        case this.map.constants.creature.special.upperWall:
        case this.map.constants.creature.special.midUpperWall:
        case this.map.constants.creature.special.midLowerWall:
        case this.map.constants.creature.special.lowerWall:
          return
      }

      var module = this.addModule(child.key, H3Bits.CreatureImage, {
        elClass: 'Hh3-cm__queue-im',
        creature: child.child.get('creature'),
        type: 'animation',
        group: this.map.constants.animation.group.stand,
        frame: 0,
        combatCreature: child.child,
      })

      module.el.css('fontSize', child.child.get('width'))

      if (child.child.party.player != this.pl) {
        module.el.addClass('Hh3-cm__map-im_mirror')
      }

      return module
    },
  })

  // Dialog appearing upon combat end. Shows the parties involved and perished creatures.
  Combat.Results = H3Bits.Window.extend('HeroWO.H3.DOM.Combat.Results', {
    el: {class: 'Hh3-cm-res Hh3-bmp_id_CPRESULT'},

    _opt: {
      audio: 'LOSECOMBAT',
      objects: null,   // Map.Combat.Objects prior to clean-up of state==null
      outcome: '',    // win, lose, tie
      myObjects: null,   // array of Party
      enemyObjects: null,   // same
      townDefender: false,
      experience: 0,   // delta
      lingering: null,    // object id => {name, portrait}
    },

    events: {
      // XXX=R
      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-cm-res__*'}}})

        this.el.append(
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-cm-res__t-my">' + this.cx.s('combat', this.get('outcome') == 'win' ? 'Victorious' : 'Defeated') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-cm-res__t-enemy">' + this.cx.s('combat', this.get('outcome') == 'lose' ? 'Victorious' : 'Defeated') + '</div>' +
          '<div class="Hh3-menu__text3 Hh3-cm-res__t-outcome">' +
            '<div class="Hh3-cm-res__t-state"></div>' +
            '<div class="Hh3-cm-res__t-exp"></div>' +
          '</div>' +
          '<div class="Hh3-menu__text2 Hh3-cm-res__t-cas">' + this.cx.s('combat', 'Battlefield Casualties') + '</div>' +
          '<div class="Hh3-menu__text10 Hh3-cm-res__t-cas-a">' + this.cx.s('combat', 'Attacker') + '</div>' +
          '<div class="Hh3-menu__text10 Hh3-cm-res__t-cas-b">' + this.cx.s('combat', 'Defender') + '</div>'
        )

        var isTown = this.get('townDefender') || this.get('myObjects').some(Common.p('object.isTown'))
        var state
        if (this.get('outcome') == 'tie' && !this.cx.get('classic')) {
          state = 'Nobody claimed the victory!'
        } else if (this.get('outcome') == 'win') {
          this.set('audio', isTown ? 'DEFEND CASTLE' : 'WIN BATTLE')
          var found
          this.get('enemyObjects').some(function (p) {
            if (p.get('retreated') || p.get('surrendered')) {
              if (found != null && found != !!p.get('retreated')) {
                found = null  // some retreated, some surrendered, show generic text
                return true
              } else {
                found = !!p.get('retreated')
              }
            }
          })
          state = found ? 'The enemy has fled!'
            : found === false ? 'The enemy has surrendered!'
            : 'A glorious victory!'   // other/mixed conditions
        } else {    // tie/lose
          var found
          this.get('myObjects').some(function (p) {
            if (p.get('retreated') || p.get('surrendered')) {
              if (found) {
                found = null  // multiple retreated and/or surrendered, show generic text
                return true
              } else {
                found = p
              }
            } else if (p.object && p.object.isHero) {
              found = p
            }
          })
          this.set('audio', isTown ? 'LOSECASTLE' :
            found && found.get('retreated') ? 'RETREAT BATTLE' :
            found && found.get('surrendered') ? 'SURRENDER BATTLE' :
            this.get('audio'))
          if (!found) {
            state = this.cx.s('combat', 'Your forces suffer a bitter defeat.')
          } else {
            state = _.format(this.cx.s('combat', found.get('retreated') ? 'The cowardly %s flees from battle.' : found.get('surrendered') ? '%s surrenders to the enemy, and departs in shame.' : 'Your forces suffer a bitter defeat, and %s abandons your cause.'), this.get('lingering')[found.object.get('id')].name)
          }
        }
        this.$('.Hh3-cm-res__t-state').text(state)

        var anim = 'myHeroDefeat'    // catch-all animation for non-standard conditions; LBSTART.BIK
        if (this.get('outcome') == 'win') {
          anim = 'myHeroWin'   // WIN3.BIK
          this.get('myObjects').some(function (p) {
            if (this.get('townDefender') || (p.object && p.object.isTown)) {
              return anim = 'myTownWin'  // DEFENDALL.BIK
            }
          }, this)
        } else if (this.get('outcome') == 'lose') {
          this.get('myObjects').some(function (p) {
            if (this.get('townDefender') || (p.object && p.object.isTown)) {
              // SoD shows this animation even if hero has fled via Escape Tunnel.
              return anim = 'myTownLose'   // LOSECSTL.BIK
            } else if (p.get('retreated')) {
              return anim = 'myHeroRetreat'   // RTSTART.BIK
            } else if (p.get('surrendered')) {
              return anim = 'myHeroSurrender'   // SURRENDER.BIK
            }
          }, this)
        }
        this.el.addClass('Hh3-cm-res_outcome_' + this.get('outcome'))
        this.el.append('<div class="Hh3-cm-res_anim Hh3-cm-res_anim_' + anim + '">')

        if (this.get('experience')) {
          var name
          this.get('myObjects').some(function (p) {
            if (p.player == this.pl && p.object && p.object.isHero) {
              if (name != null) {  // multiple own heroes participated, show combined experience points for everyone
                name = this.cx.s('combat', 'everyone')
                return true
              } else {
                name = this.get('lingering')[p.object.get('id')].name
              }
            }
          }, this)
          this.$('.Hh3-cm-res__t-exp')
            .text(_.format(this.cx.s('combat', 'For valor in combat, %s receives %d experience'), name, this.get('experience')))
        }

        _.each(['myObjects', 'enemyObjects'], function (who) {
          // For heroes and towns display that hero's/town's face and name.
          // For other types of parties (dwellings, roaming monsters, etc.)
          // display face/name of the most powerful creature in the party.
          // In classic mode, do the latter for town too.
          var first = (this.get(who) || [])[0]
          if (first && first.object && (first.object.isHero || (first.object.isTown && !this.cx.get('classic')))) {
            first = first.object
          } else if (first) {
            // Find a fallen creature or an alive creature of that party.
            var cr
            var aiValue = 0
            this.get('objects').forEach(function (obj) {
              if (obj instanceof HMap.Combat.Object.Corpse) {
                obj = obj.get('creature')
              }
              if (obj.party == first) {
                var av = this.rules.creatures.atCoords(obj.get('creature'), 0, 0, 'aiValue', 0)
                if (aiValue < av) {
                  aiValue = av
                  cr = obj
                }
              }
            }, this)
          }

          var my = this.addModule(who, Bits.String, {
            elClass: 'Hh3-menu__text3',
            format: this.cx.s('combat', '%n%%a'),
          })

          if (!first) {
            my.addModule('n', Bits.Value, {el: false, value: this.cx.s('combat', who == 'myObjects' ? 'Upholder' : 'Oppugnant')})
          } else if (first.isHero || first.isTown) {
            my.addModule('n', Bits.Value, {
              el: false,
              value: this.get('lingering')[first.get('id')].name,
            })
          } else {
            // XXX::ccrx: remove && once fixed
            cr && my.addModule('n', H3Bits.DatabankProperty, {
              el: false,
              collection: 'creatures',
              // XXX+B: ccrx: got many stack traces pointing out that cr is null; not sure how that's possible that no this.get('objects') had any matching obj.party == first
              entity: cr.get('creature'),
              property: cr.get('count') == 1 || this.cx.get('classic') ? 'nameSingular' : 'namePlural',
            })
          }

          my.addModule('a', Bits.Value, {
            el: false,
            value: (this.get(who) || []).length > 1 ? this.cx.s('combat', ' and Co.') : '',
          })

          if (!first) {
            // Show no face.
          } else if (first.isHero) {
            this.addModule(who + 'Face', H3Bits.Bitmap, {
              file: this.get('lingering')[first.get('id')].portrait,
            })
          } else if (first.isTown) {
            this.addModule(who + 'Face', H3Bits.DefImage, this.get('lingering')[first.get('id')].portrait)
          } else {
            // XXX::ccrx: remove && once fixed
            cr && this.addModule(who + 'Face', H3Bits.CreatureImage, {
              creature: cr.get('creature'),
              type: 'large',
            })
              .el.toggleClass('Hh3-cm__map-im_mirror', who == 'enemyObjects')
          }
        }, this)

        this.addModule('attackers', Combat.Results.Casualties)
        this.addModule('defenders', Combat.Results.Casualties)

        this.addModule('close', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_IOKAY'})
          .on({clicked: 'cancel'}, this)
      },
    },
  })

  // Usually combat logically ends while the UI is still playing the remaining transitions. This function must be called during combatEnd's collect phase, and its result must be stored and given to Combat.Results constructor when combat ends on screen.
  //
  //> tick int `- tick of combatEnd's collect
  //> window H3.DOM.Combat
  //> transition `- combatEnd Map.Transition
  Combat.Results.collect = function (tick, window, transition) {
    switch (tick) {
      case 1:
        var results = {
          objects: window.combat.objects.toArray(),
          outcome: '',
          myObjects: [],
          enemyObjects: [],
          lingering: {},  // object id => {name, portrait}

          attackers: [],
          defenders: [],
        }

        transition.get('alive').forEach(function (p) {
          p = window.combat.parties.nested(p)
          if (p.player.get('team') == window.pl.get('team')) {
            results.outcome = 'win'
          } else {
            results.outcome = results.outcome || 'lose'
          }
        })
        results.outcome = results.outcome || 'tie'  // no allies and enemies alive - tie

        // Parties may be removed before Results is shown (transition is ran) but we can still access them to read _opt.
        window.combat.parties.each(function (p) {
          ;(p.player.get('team') == window.pl.get('team') ? results.myObjects : results.enemyObjects).push(p)
        })

        results.townDefender = results.myObjects.some(function (p) {
          return p.object.isHero && p.object.get('garrisoned') ||
            (p.object.get('visiting') && !window.cx.map.objects.atCoords(p.object.get('visiting'), 0, 0, 'garrisoned', 0))
        })

        window.combat.parties.each(function (party) {
          if (party.object && (party.object.isHero || party.object.isTown)) {
            var id = party.object.get('id')
            var lingering = results.lingering[id] = {}
            lingering.name = window.cx.oneShotEffectCalculation({
              class: Calculator.Effect.GenericString,
              target: window.cx.map.constants.effect.target.name,
              ifObject: id,
            })
            var calc = party.object.isHero
              ? window.cx.calculator(Rules.HeroPortrait, {id: id})
              : window.cx.calculator(Rules.TownPortrait, {id: id, large: true, canBuild: false})
            lingering.portrait = calc.take().get('value')
            calc.release()
          }
        })

        window.combat.objects.each(function (obj) {
          if (obj instanceof HMap.Combat.Object.Corpse &&
              !window.rules.creatures.atCoords(obj.get('creature').get('creature'), 0, 0, 'damageGroup', 0)) {
            // Attacker = first party in order.
            var isAttacker = obj.get('creature').party.player.get('team') == window.combat.parties.first().player.get('team')
            // Sorting: [party 1's creature 1] [p1c2] [p1c...] [p2c1] ...
            // where creatures inside parties are ordered by their garrison slot index, i.e. id (as SoD does), and same-type creatures merged into the first occurrence.
            var pos = obj.get('creature').party._parentKey * 100 + obj.get('creature').get('id')
            var list = results[isAttacker ? 'attackers' : 'defenders']
            list.some(function (slot) {
              if (slot.creature == obj.get('creature').get('creature')) {
                return slot.count += obj.get('creature').get('count')
              }
            }) || list.push(_.extend(obj.get('creature').get(), {pos: pos}))
          }
        })

        return results

      case 2:
        return {
          experience: transition.get('experiences')[window.pl.get('player')],
          artifacts: (transition.get('artifacts')[window.pl.get('player')] || [])
            .map(function (a) { return {artifact: a} }),
        }
    }
  }

  // List of perished creatures shown in Combat.Results.
  Combat.Results.Casualties = Bits.Base.extend('HeroWO.H3.DOM.Combat.Results.Casualties', {
    // Client must supply pos.
    mixIns: [Common.Ordered],
    _childClass: Bits.Base,
    el: {class: 'Hh3-cm-res__cas'},

    events: {
      nestExNew: function (res) {
        res.child.el.addClass('Hh3-cm-res__casi Hh3-menu__text3 Hh3-menu__text_toned')

        res.child.addModule('face', H3Bits.CreatureImage, {
          creature: res.child.get('creature'),
        })

        $('<div class="Hh3-cm-res__casi-c">')
          .text(res.child.get('count'))
          .appendTo(res.child.el)
      },

      'nestExNew, unnested': 'update',

      render: function () {
        this.el.append(
          '<div class="Hh3-menu__text3 Hh3-menu__text_toned Hh3-cm-res__casin">' + this.cx.s('combat', 'None') + '</div>'
        )
      },

      _update: function () {
        Common.oneClass(this.el, 'Hh3-cm-res__cas_empty_', this.length ? 'no' : 'yes')
      },
    },
  })

  // List of artifacts captured by winners shown in a MessageBox upon closing Combat.Results.
  Combat.Results.Artifacts = Bits.Base.extend('HeroWO.H3.DOM.Combat.Results.Artifacts', {
    mixIns: [Common.Ordered],
    _childClass: Bits.Base,
    el: {class: 'Hh3-cm-res__arts Hh3-menu__text3 Hh3-menu__text_toned'},

    events: {
      nestExNew: function (res) {
        res.child.el.addClass('Hh3-cm-res__art')

        res.child.addModule('face', H3Bits.ArtifactImage, {
          artifact: res.child.get('artifact'),
        })

        res.child.addModule('name', H3Bits.DatabankProperty, {
          collection: 'artifacts',
          entity: res.child.get('artifact'),
          property: 'name',
        })
      },

      '=_sorter': function (sup, a, b, posB) {
        var id = a.child.get('artifact')
        var name  = this.rules.artifacts.atCoords(id, 0, 0, 'name', 0)
        var slots = this.rules.artifacts.atCoords(id, 0, 0, 'slots', 0)
        var posA = {id: id, name: name, slot: _.min(slots)}

        if (arguments.length == 2) {
          return posA
        } else {
          // SoD seems to order artifacts by their slot ID, followed by artifacts in backpack sorted by name.
          return posA.slot - posB.slot ||
            Common.compare(posA.name, posB.name) ||
            posA.id - posB.id
        }
      },
    },
  })

  // Base dialog with some global game options common to both combat and adventure map option dialogs.
  Combat.BaseOptions = H3Bits.Window.extend('HeroWO.H3.DOM.Combat.BaseOptions', {
    events: {
      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-gop__*'}}})

        this.el.addClass('Hh3-gop')

        this.el.append(
          '<div class="Hh3-menu__text4 Hh3-menu__text_toned Hh3-gop__t-mvol">' + this.cx.s('map', 'Music Volume') + '</div>' +
          '<div class="Hh3-menu__text4 Hh3-menu__text_toned Hh3-gop__t-svol">' + this.cx.s('map', 'Effects Volume') + '</div>'
        )

        _.each(['bgm', 'sfx'], function (kind) {
          _.times(10, function (volume) {
            this.addModule(kind + volume, H3Bits.Button, {elClass: 'Hh3-gop__vol Hh3-gop__vol_vol_' + volume + ' Hh3-def_frame_SYSLB-0-' + volume})
              .on('clicked', function () {
                var audio = this.sc.get('audio')
                audio && audio.set(kind, volume / 9)
              }, this)
          }, this)
        }, this)

        this.addModule('spellAnimation', H3Bits.Checkbox, {label: this.cx.s('combat', 'Spell Book Animation')})
          .on('change_checked', function (now) { this.sc.set('spellBookPageAnimation', now) }, this)

        this.addModule('close', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_SORETRN'})
          .on({clicked: 'cancel'}, this)

        this.autoOff(this.sc, {
          change_spellBookPageAnimation: 'update',
        })

        // XXX=R audio may technically change so must update hooks when it happens
        var audio = this.sc.get('audio')
        audio && this.autoOff(audio, {
          change: 'update',
        })
      },

      _update: function () {
        _.each(['bgm', 'sfx'], function (kind) {
          var audio = this.sc.get('audio')
          if (!audio) { return }
          var cur = audio.get(kind)
          var found
          _.times(10, function (volume) {
            // bar0 = 0..0
            // bar1 = 0.01..0.11
            // bar2 = 0.111..0.22
            // bar3 = 0.221..0.33
            // ...
            // bar9 = 0.881..0.99   + ||volume==9 for 0.99..1.0
            this.nested(kind + volume).set('current', !found && (found = cur <= (volume == 9 ? 1 : volume / 9)))
          }, this)
        }, this)

        this.nested('spellAnimation').set('checked', this.sc.get('spellBookPageAnimation'))
      },
    },
  })

  // Dialog with some global game options (e.g. audio volume) and combat-specific controls (e.g. visibility of grid).
  Combat.Options = Combat.BaseOptions.extend('HeroWO.H3.DOM.Combat.Options', {
    el: {class: 'Hh3-gop_type_combat Hh3-bmp_id_COMOPBCK'},

    _opt: {
      // XXX=I if not supported, must additionally reset Screen's speed options to 1.0 on start; while implementing, remember they're not supported in FF <57, not just in IE
      variablesSupported: false,
    },

    events: {
      attach: function () {
        this.el.append(
          '<div class="Hh3-menu__text2 Hh3-menu__text_toned Hh3-gop__t-head">' + this.cx.s('combat', 'Combat Options') + '</div>' +
          '<div class="Hh3-menu__text4 Hh3-menu__text_toned Hh3-gop__t-canim">' + this.cx.s('combat', 'Animation Speed') + '</div>' +
          '<div class="Hh3-menu__text4 Hh3-menu__text_toned Hh3-gop__t-cauto">' + this.cx.s('combat', 'Auto-Combat Options') + '</div>' +
          '<div class="Hh3-menu__text4 Hh3-menu__text_toned Hh3-gop__t-cinfo">' + this.cx.s('combat', 'Creature Info') + '</div>'
        )

        this.addModule('grid', H3Bits.Checkbox, {label: this.cx.s('combat', 'View Hex Grid')})
          .on('change_checked', function (now) { this.sc.set('combatGrid', now) }, this)
        this.addModule('move', H3Bits.Checkbox, {label: this.cx.s('combat', 'Movement Shadow')})
          .on('change_checked', function (now) { this.sc.set('combatHighlightMove', now) }, this)
        this.addModule('hover', H3Bits.Checkbox, {label: this.cx.s('combat', 'Cursor Shadow')})
          .on('change_checked', function (now) { this.sc.set('combatHighlightHover', now) }, this)

        this.addModule('animationSpeed1', H3Bits.Button, {elClass: 'Hh3-btn_id_SYSOPB9 Hsfx__btn'})
          .set('disabled', !this.get('variablesSupported'))
          .on('clicked', function () { this.sc.set('combatSpeed', 2.0) }, this)
        this.addModule('animationSpeed2', H3Bits.Button, {elClass: 'Hh3-btn_id_SYSOB10 Hsfx__btn'})
          .set('disabled', !this.get('variablesSupported'))
          .on('clicked', function () { this.sc.set('combatSpeed', 1.0) }, this)
        this.addModule('animationSpeed3', H3Bits.Button, {elClass: 'Hh3-btn_id_SYSOB11 Hsfx__btn'})
          .set('disabled', !this.get('variablesSupported'))
          .on('clicked', function () { this.sc.set('combatSpeed', 0.5) }, this)

        this.addModule('autoCreatures', H3Bits.Checkbox, {label: this.cx.s('combat', 'Creatures'), disabled: true})
        this.addModule('autoSpells', H3Bits.Checkbox, {label: this.cx.s('combat', 'Spells'), disabled: true})
        this.addModule('autoCatapult', H3Bits.Checkbox, {label: this.cx.s('combat', 'Catapult'), disabled: true})
        this.addModule('autoBallista', H3Bits.Checkbox, {label: this.cx.s('combat', 'Ballista'), disabled: true})
        this.addModule('autoFirstAidTent', H3Bits.Checkbox, {label: this.cx.s('combat', 'First Aid Tent'), disabled: true})

        this.addModule('infoAll', H3Bits.Checkbox, {label: this.cx.s('combat', 'All Statistics')})
          .on('change_checked', function (now, old, options) { options.skip || this.sc.set('combatCreatureInfo', now && true) }, this)
        this.addModule('infoSpells', H3Bits.Checkbox, {label: this.cx.s('combat', 'Spells Only')})
          .on('change_checked', function (now, old, options) { options.skip || this.sc.set('combatCreatureInfo', now && 'spell') }, this)

        this.addModule('defaults', H3Bits.Button, {elClass: 'Hsfx__btn Hh3-btn_id_CODEFAUL'})
          .on({
            clicked: function () {
              // The reset button doesn't affect audio options in SoD.
              var classic = this.cx.get('classic')
              this.sc.assignResp({
                combatGrid: !classic,
                combatHighlightMove: !classic,
                combatHighlightHover: !classic,
                spellBookPageAnimation: true,
                combatSpeed: classic ? 2.0 : 0.5,
                combatCreatureInfo: !classic,
                // XXX=I implement quick combat/auto combat and enable all Auto-Combat Options checkboxes
              })
            },
          }, this)

        this.autoOff(this.sc, {
          'change_combatGrid, change_combatHighlightMove, change_combatHighlightHover, change_combatSpeed, change_combatCreatureInfo': 'update',
        })
      },

      _update: function () {
        // XXX=C numbers determined arbitrarily
        var cur = this.sc.get('combatSpeed')
        this.nested('animationSpeed1').set('current', cur == 2.0)
        this.nested('animationSpeed2').set('current', cur == 1.0)
        this.nested('animationSpeed3').set('current', cur == 0.5)

        this.nested('grid').set('checked', this.sc.get('combatGrid'))
        this.nested('move').set('checked', this.sc.get('combatHighlightMove'))
        this.nested('hover').set('checked', this.sc.get('combatHighlightHover'))

        var cur = this.sc.get('combatCreatureInfo')
        this.nested('infoAll').set('checked', cur == true, {skip: true})
        this.nested('infoSpells').set('checked', cur == 'spell', {skip: true})
      },
    },
  })

  // Allows user to select a spell known to his hero for subsequent casting (possibly outside of combat). The list is paged and can be filtered by spell school (e.g. Earth).
  //
  // XXX=B must hide duplicate spells
  //
  // XXX=IC in combat, if hero has spells (set in editor) but no spell book (no artifact), SoD disables the button in the bottom panel but allows clicking on the hero image in the corner to open the book, and upon selecting a spell there it says "%s recites the incantations but they seem to have no effect." XXX=C also check if this spends SP or not
  Combat.SpellBook = H3Bits.Window.extend('HeroWO.H3.DOM.Combat.SpellBook', {
    el: {class: 'Hh3-spbk Hh3-bmp_id_SPELBACK'},
    _perPage: 12,
    _minusFirstPage: 2,

    _opt: {
      hero: null,
      calc: null,
      school: null,   // filter
      context: null,   // filter; Spell::context, not Effect::context!
      page: 0,  // 0-based
      maxPage: 0,   // internal
    },

    events: {
      init: function () {
        this.getSet('calc', function (cur) {
          return cur == null ? {ifObject: this.get('hero').get('id')} : cur
        }, this)
      },

      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-spbk__*'}}})

        this.el.append(
          '<div class="Hh3-spbk__turn-anim"></div>' +
          '<div class="Hh3-spbk__tab-any"></div>' +
          '<div class="Hh3-spbk__combat"></div>' +
          '<div class="Hh3-spbk__map"></div>' +
          '<div class="Hh3-spbk__page-left Hh3-bmp_id_SPELTRNL"></div>' +
          '<div class="Hh3-spbk__page-right Hh3-bmp_id_SPELTRNR"></div>'
        )

        _.each(this.rules.spellSchoolsID, function (id, name) {
          $('<div class="Hh3-spbk__tab-' + name + '">')
            .appendTo(this.el)
            .on('click', function () {
              if (this.get('school') != id) {
                this._animate('right')
                this.assignResp({page: 0, school: id})
              }
            }.bind(this))
        }, this)

        this.addModule('tabs', H3Bits.DefImage, {def: 'SPELTAB'})
        this.addModule('logo', H3Bits.DefImage, {def: 'SCHOOLS'})

        this.addModule('spellPoints', Bits.ObjectRepresentationProperty, {
          elClass: 'Hh3-menu__text1 Hh3-menu__text_toned',
          object: this.get('hero'),
          property: 'spellPoints',
        })

        this.addModule('spells', Combat.SpellBook.Spells, {
          sink: {'*': {options: {calc: this.get('calc'), heroSpellPoints: this.get('hero')}}},
          calc: this.get('calc'),
        })
          .on({
            'nestExNew, unnested': 'update',
            '.clicked': function (s) {
              if (s.get('canCast')) {
                this.cast(s.get('spell'))
              } else {
                // XXX=IC don't show in wrong context (combat spell on advmap, etc.); SoD shows spell info in this case
                this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(H3Bits.MessageBox, {withinWindow: this})
                  .addText(this.cx.s('map', "That spell costs %d spell points.  Your hero only has %d spell points, and therefore can't cast the spell."), s.get('cost'), this.get('hero').get('spellPoints'))
                  .addButton()
              }
            },
          }, this)

        this.addModule('close', H3Bits.Button)
          .on({clicked: 'cancel'}, this)
      },

      '+normalize_page': function (res, cur) {
        return Common.clamp(cur, 0, this.get('maxPage'))
      },

      // SoD closes spell book on Enter.
      submit: 'cancel',
      change_school: 'update',
      change_context: 'update',
      change_page: '_updateVisible',

      change_maxPage: function () {
        this.getSet('page')
      },

      _update: function () {
        this._updateMaxPage()
        this._updateVisible()

        var name = this.get('school') == null ? null : _.indexOf(this.rules.spellSchoolsID, this.get('school'))
        name && this.nested('logo').set('frame', this.rules.spellSchools.atCoords(this.get('school'), 0, 0, 'image', 0))
        this.nested('spells').invoke('set', 'defaultSchool', name && this.get('school'))
        Common.oneClass(this.el, 'Hh3-spbk_school_', name || 'any')
        this.nested('tabs').set('frame', name == null ? 4 : (3 - this.get('school')))
      },
    },

    elEvents: {
      'click .Hh3-spbk__turn-anim': function (e) {
        // Skip playing animation if it's clicked on (which is only possible
        // while it's playing, then it hides).
        this._animate('')
      },

      'click .Hh3-spbk__tab-any': function () {
        if (this.get('school') != null) {
          this._animate('right')
          this.assignResp({page: 0, school: null})
        }
      },

      'click .Hh3-spbk__combat': function () {
        if (this.get('context') != this.map.constants.spell.context.combat) {
          this._animate('left')
          this.assignResp({page: 0, context: this.map.constants.spell.context.combat})
        }
      },

      'click .Hh3-spbk__map': function () {
        if (this.get('context') != this.map.constants.spell.context.map) {
          this._animate('right')
          this.assignResp({page: 0, context: this.map.constants.spell.context.map})
        }
      },

      'click .Hh3-spbk__page-left,.Hh3-spbk__page-right': function (e) {
        this.getSet('page', function (cur) {
          var delta = $(e.target).hasClass('Hh3-spbk__page-left') ? -1 : +1
          this._animate(delta < 0 ? 'left' : 'right')
          return cur + delta
        })
      },
    },

    // function (spell ID)
    // Called once user selects a spell.
    cast: Common.stub,

    _animate: function (dir) {
      if (this.sc.get('spellBookPageAnimation')) {
        // XXX=B as with other CSS animations based on APNG, Chrome behaves strangely: it seems to "play" APNG in background even after the animation ends, so that when the animation is restarted, it "continues" playing APNG instead of playing it from the first frame. likely need to ditch APNG and use CSS animations like doing with DEF animations - possibly putting them to the same animations.css in the databank
        var el = this.$('.Hh3-spbk__turn-anim')[0]
        Common.oneClass(el, 'Hh3-spbk__turn-anim_dir_')
        _.redraw(el, 'Hh3-spbk__turn-anim_dir_' + dir)
      }
    },

    _updateMaxPage: function () {
      var school = this.get('school')
      var context = this.get('context')
      this.nested('spells').each(function (spell) {
        spell.set('matching',
          (school == null || this.rules.spells.atCoords(spell.get('spell'), 0, 0, 'schools', 0).indexOf(school) != -1) &&
          (context == null || this.rules.spells.atCoords(spell.get('spell'), 0, 0, 'context', 0) == context)
        )
      }, this)

      var count = this.nested('spells').filter(Common.p('get', 'matching')).length
      // Top 2 slots in the first page of school-specific spells are taken
      // by the logo.
      var max = Math.floor((count + (school != null) * this._minusFirstPage) / this._perPage)
      this.set('maxPage', max < 0 ? 0 : max)
    },

    _updateVisible: function () {
      var filteredBySchool = this.get('school') != null
      this.$('.Hh3-spbk__page-left').toggle(this.get('page') > 0)
      this.$('.Hh3-spbk__page-right').toggle(this.get('page') < this.get('maxPage'))
      this.nested('logo').el.toggle(filteredBySchool && !this.get('page'))

      var start = this.get('page') * this._perPage
      var end = start + this._perPage - 1
      if (filteredBySchool) {
        this.get('page') && (start -= this._minusFirstPage)
        end -= this._minusFirstPage
      }
      var count = 0
      this.nested('spells').toArray().forEach(function (spell) {
        spell.set('visible', spell.get('matching') && count <= end && count++ >= start)
        spell.el.toggleClass('Hh3-spbki_pad', filteredBySchool && count == 1)
      }, this)
      this.el.toggleClass('Hh3-spbk_paged', count > this._perPage / 2 - (filteredBySchool && this._minusFirstPage))
    },
  })

  // Bare-bone non-paged list of spells shown inside the decorated SpellBook.
  Combat.SpellBook.Spells = Bits.Base.extend('HeroWO.H3.DOM.Combat.SpellBook.Spells', {
    mixIns: [Common.Ordered],
    _childClass: 'Item',
    _childEvents: ['clicked'],
    _calc: null,

    _opt: {
      calc: {},
    },

    events: {
      attach: function () {
        this._calc = this.updateOn(Calculator.Effect.GenericIntArray, _.extend({
          target: this.map.constants.effect.target.hero_spells,
        }, this.get('calc')))
      },

      _update: function () {
        var spells = this._calc.get('value')
        this.assignChildren(spells.map(function (s) { return {spell: s} }), {
          eqFunc: 'spell',
        })
      },

      // SoD seems to sort by level, then school, then name. Schools are reverse-sorted by ID, not name.
      '=_sorter': function (sup, a, b, posB) {
        var posA = {
          id: a.child.get('spell'),
          // SoD has just two multi-school spells (Visions and Magic Arrow) and they have fancy sorting. When browsing combat Water spells, Magic Arrow is sorted together with others (by name). When browsing other schools it always goes first (although Earth is unclear because there are no other 1st level combat spells whose names go before "M"). When browsing "any" it goes together with Air spells.
          //
          // We don't retain this behaviour, always sorting by spell's max school ID (then by name) if browsing "any" and by name if browsing specific school.
          school: a.child.get('defaultSchool') == null ? _.max(this.rules.spells.atCoords(a.child.get('spell'), 0, 0, 'schools', 0)) : 0,
          level: this.rules.spells.atCoords(a.child.get('spell'), 0, 0, 'level', 0),
          name: this.rules.spells.atCoords(a.child.get('spell'), 0, 0, 'name', 0),
        }

        if (arguments.length == 2) {
          return posA
        } else {
          return posA.level - posB.level ||
            posB.school - posA.school ||
            Common.compare(posA.name, posB.name) ||
            posA.id - posB.id
        }
      },
    },
  })

  // Single spell entry (icon with text), respecting spell mastery ("Adv." text and number of corners around the icon) and school (type of corners).
  Combat.SpellBook.Spells.Item = Bits.Base.extend('HeroWO.H3.DOM.Combat.SpellBook.Spells.Item', {
    el: {class: 'Hh3-spbki'},
    _col: null,
    _calc: null,

    _opt: {
      spell: 0,
      calc: {},
      canCast: true,
      heroSpellPoints: null,
      defaultSchool: null,  // overrides mastery corners' type normally taken from spell's highest mastery (or first school)
      cost: 0,  // can read, don't set
      matching: true,   // used by SpellBook to mark spells fitting filters (except page)
      visible: true,    // show or hide this.el; a matching spell may be hidden if it doesn't belong to current page
    },

    events: {
      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-spbki__*'}}})

        this.el.addClass('Hh3-spbki_spell_' + this.get('spell'))

        this.addModule('mastery', H3Bits.DefImage)

        this.addModule('face', H3Bits.SpellImage, {
          type: 'S',
          spell: this.get('spell'),
        })
          .el.on('click', Common.ef('clicked', this))

        this.addModule('name', H3Bits.DatabankProperty, {
          collection: 'spells',
          entity: this.get('spell'),
          property: 'name',
        })

        var level = this.addModule('level', Bits.String, {
          format: this.cx.s('map', '%l lev%m'),
        })
        level.addModule('l', H3Bits.DatabankProperty, {
          el: false,
          collection: 'spells',
          entity: this.get('spell'),
          property: 'level',
        })
          .on({
            '+normalize_value': function (res, cur) {
              var suffixed = ['', '1st', '2nd', '3rd', '4th', '5th']
              return this.cx.s('map', suffixed[cur])
            },
          })
          .getSet('value')
        level.addModule('m', Bits.Value)

        this._col = new Effects.Collection({effects: this.map.effects})
        this._col.on({
          '+readyMember': function (res, skill) {
            res.calc = this.cx.listeningEffectCalculator(_.extend({
              update: 'defer',
              target: this.map.constants.effect.target.skillMastery,
              ifSkill: skill,
            }, this.get('calc')))
            res.off.push([res.calc, res.calc.on('change_value', 'update', this)])
          },
        }, this)
        // XXX+ got many stack traces telling SpellBook is trying to show a spell with false schools (i.e. special/of creatures); this isn't supposed to happen and unsure how to properly handle that; for now just putting ||[]
        var schools = this.rules.spells.atCoords(this.get('spell'), 0, 0, 'schools', 0) || []
        this.rules.spellSchools.find('skill', function (skill, school) {
          if (_.includes(schools, school)) {
            this._col.append(skill)
              .school = school
          }
        }, this)

        // SoD has two quirks in regards to drawing mastery corners:
        // 1. If spell book is filtered by school (a particular school's tab
        //    is selected) then the type (Air, etc.) of corners is taken of the school which this hero
        //    has the highest mastery at.
        // 2. The number of corners (Basic, etc.) is taken from the highest-mastered school, regardless if filtering by school. This means if the hero has Expert Air Magic and is browsing Fire school spells, Magic Arrow will be drawn using four Fire corners no matter the hero's mastery of Fire.
        // Calculation of spell cost, level suffix ("/Exp") and strength is done on the highest-mastered school as well.
        var calc = this.cx.listeningEffectCalculator(_.extend({
          update: 'defer',
          target: this.map.constants.effect.target.spellMastery,
          ifSpell: this.get('spell'),
        }, this.get('calc')))

        var corners = _.fromEntries([
          [this.map.constants.spell.mastery.basic, [1, '/Bas']],
          [this.map.constants.spell.mastery.advanced, [2, '/Adv']],
          [this.map.constants.spell.mastery.expert, [3, '/Exp']],
        ])
        this.autoOff(calc, {}).whenRenders('change_value', function () {
          var frame = corners[calc.get('value')] || [0, '']
          // 0 frame - no mastery, 1/2/3 - basic/advanced/expert.
          this.nested('mastery').set('frame', frame[0])
          level.nested('m').set('value', frame[1] && this.cx.s('map', frame[1]))
        }, this)

        this._calc = this.addModule('spellPoints', Bits.String, {
          format: this.cx.s('map', 'Spell Points: %p'),
        })
          .addCalculator('p', Calculator.Effect.GenericNumber, _.extend({
            target: this.map.constants.effect.target.spellCost,
            ifSpell: this.get('spell'),
            // ifSpellSchool is added by _expandOptios(). Calculator properly accounts for minimal (most favourable) spell points.
          }, this.get('calc')))

        this.autoOff(this._calc, {}).whenRenders('change_value', function () {
          this.set('cost', this._calc.get('value'))
        }, this)

        if (this.get('heroSpellPoints')) {
          var updateSP = function () {
            this.set('canCast', this.get('heroSpellPoints').get('spellPoints') >= this._calc.get('value'))
          }.bind(this)

          updateSP()
          this.on('change_cost', updateSP)

          this.autoOff(this.get('heroSpellPoints'), {
            change_spellPoints: updateSP,
          })
        }
      },

      '-unnest': function () {
        this._col && this._col.remove()
      },

      change_canCast: 'update',
      change_defaultSchool: 'update',

      _update: function () {
        if (this.get('defaultSchool') == null) {
          // SoD has a very clear relation between school mastery and spell power. HeroWO does not because of Effects. As in other places, we take a simple approach: we don't know which Effect has caused calculated cost and mastery so we just take the strongest of the hero's mastery skills (Air Magic, etc.).
          var school = _.max(this._col.members(), function (member) {
            return member.calc.get('value')
          }).school
        } else {
          var school = this.get('defaultSchool')
        }
        this.nested('mastery').set('def', this.rules.spellSchools.atCoords(school, 0, 0, 'masteryImage', 0))

        var now = this.get('canCast')
        this.nested('name').el
          .toggleClass('Hh3-menu__text12', now)
          .toggleClass('Hh3-menu__text5', !now)
        this.nested('level').el
          .add(this.nested('spellPoints').el)
          .toggleClass('Hh3-menu__text5 Hh3-menu__text_toned', now)
          .toggleClass('Hh3-menu__text12', !now)
      },

      change_visible: function (now) {
        this.el.toggle(now)
      },
    },

    clicked: Common.stub,
  })

  // Generic button that calls up spell book dialog.
  Combat.SpellBook.Button = H3Bits.Button.extend('HeroWO.H3.DOM.Combat.SpellBook.Button', {
    el: {class: 'Hsfx__btn'},
    _sub: null,

    _opt: {
      context: null,
      hero: null,
      showEmpty: false,
      hasBook: false,
      bound: null,  // internal
    },

    events: {
      change_hero: function (now) {
        this.set('bound', now)
      },

      change_bound: function (now, old) {
        if (old) {
          this.autoOff(this._sub)
          this._sub.release()
        }

        if (now) {
          this._sub = this.map.objects.subAtCoords(now.get('id'), 0, 0, 'artifacts', 0)
          var n = this._sub.toContiguous(this.rules.artifactSlotsID.spellBook, 0, 0, 'artifact')
          this.autoOff(this._sub, [
            'ochange_n_' + n,
            function ($1, $2, prop, now) {
              this.set('hasBook', now != null)
            },
          ])

          this.set('hasBook', this._sub.anyAtContiguous(n, 0))
        }

        this.update()
      },

      '-unnest': function () {
        this.set('bound', null)
      },

      change_hasBook: 'update',
      change_showEmpty: 'update',

      _update: function () {
        var hero = this.get('bound')
        if (!hero || (!this.get('showEmpty') && !this.get('hasBook'))) {
          return this.set('disabled', true)
        }
        this.set('disabled', false)
      },

      clicked: function () {
        var book = this.sc.modules.nested('HeroWO.H3.DOM.UI').windows.addModule(Combat.SpellBook, {
          hero: this.get('bound'),
          context: this.get('context'),
        })
        this.autoOff(book, {
          cast: function () {
            this.cast.apply(this, [book].concat(_.toArray(arguments)))
          },
        })
      },
    },

    // function (SpellBook, Spell->$id)
    // Called once user selects a spell.
    cast: Common.stub,
  })

  // Button that calls up world spell book of the currently selected hero object. Used in adventure map's right-side panel.
  Combat.SpellBook.Button.ScreenCurrent = Combat.SpellBook.Button.extend('HeroWO.H3.DOM.Combat.SpellBook.Button.ScreenCurrent', {
    events: {
      attach: function () {
        var update = function () {
          var now = this.sc.get('current')
          this.set('hero', now && now.isHero && this.pl.get('interactive') ? now : null)
        }.bind(this)

        this.autoOff(this.pl, {
          change_interactive: update,
        })

        this.autoOff(this.sc, {
          change_current: update,
        })

        update()
      },
    },
  })

  // Button that calls up combat spell book dialog for currently interactive party. Used in combat's status bar.
  Combat.SpellBook.Button.Combat = Combat.SpellBook.Button.extend('HeroWO.H3.DOM.Combat.SpellBook.Button.Combat', {
    _opt: {
      combatState: null,
    },

    events: {
      attach: function () {
        var update = function () {
          var hero
          if (this.get('combatState').get('phase') == 'combat' &&
              this.get('combatState').get('interactive')) {
            var int = this.get('combatState').get('interactive')
            if (int.object && int.object.isHero) {
              hero = int.object
            }
          }
          this.set('hero', hero)
        }.bind(this)

        this.autoOff(this.get('combatState'), {
          change_phase: update,
          change_interactive: update,
        })

        update()
      },

      change_bound: function (now, old) {
        old && this.autoOff(old)
        now && this.autoOff(now, {change_combatCasts: 'update'})
      },

      '=_update': function (sup) {
        var hero = this.get('bound')
        if (!hero || !hero.get('combatCasts')) {
          return this.set('disabled', true)
        }
        sup(this)
      },
    },
  })

  return Combat
})