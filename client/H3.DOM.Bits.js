define(['DOM.Common', 'Calculator', 'DOM.Bits', 'H3.Rules'], function (Common, Calculator, Bits, Rules) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // Contains HoMM 3-specific UI bits, extending generic `#Bits.
  //
  //# Hierarchy of Bit classes
  //
  // `[(A)`] = abstract class.
  //[
  // jQuery
  // +Base (A)
  // |\
  // | +Value
  // | |\
  // | | +String
  // | |\
  // | | +GameDate
  // | |\
  // | | +ObjectRepresentationProperty
  // | |  \
  // | |   +ResourceNumber
  // | |\
  // | | +ObjectStoreProperty
  // | |\
  // | | +H3.DatabankProperty
  // |  \
  // |   +H3.TownCountByHall
  // |    \
  // |     +H3.TownCountByFort
  // |\
  // | +Windows
  // |  \
  // |   +H3.Windows
  // |\
  // | +Window
  // |  \
  // |   +H3.Window
  // |\
  // | +H3.MessageBox
  // |\
  // | +H3.Button
  // |\
  // | +H3.Checkbox
  // |\
  // | +ResourceNumbers
  // |\
  // | +PlayerList
  // |  \
  // |   +H3.PlayerList
  // |\
  // | +PlayerFlag
  // |  \
  // |   +H3.PlayerFlag
  // |\
  // | +ObjectList (A)
  // | |\
  // | | +ObjectRepresentationList (A)
  // | |\
  // | | +H3.SkillList
  // | |  \
  // | |   +H3.SkillList.Calculator
  // |  \
  // |   +GarrisonList (A)
  // |    \
  // |     +H3.GarrisonList
  // |\
  // | +ObjectList.Item (A)
  // | |\
  // | | +H3.SkillList.Item
  // |  \
  // |   +GarrisonList.Item (A)
  // |    \
  // |     +H3.GarrisonList.Item
  // |\
  // | +H3.DefImage
  // | |\
  // | | +H3.DefImage.Calculator
  // | |  \
  // | |   +H3.DefImage.Portrait
  // | |\
  // | | +H3.CreatureImage
  // | |  \
  // | |   +H3.CreatureAnimation
  // | |\
  // | | +H3.CreatureOnBackground
  // | |\
  // | | +H3.Luck
  // | | \
  // | |  +H3.Morale
  // | |\
  // | | +H3.HeroAP
  // | | \
  // | |  +H3.HeroSP
  // | |\
  // | | +H3.HeroLevel
  // | |\
  // | | +H3.HeroClass
  // | |\
  // | | +H3.TownHallLevel
  // | | \
  // | |  +H3.TownFortLevel
  // | |\
  // | | +H3.SkillImage
  // | |\
  // | | +H3.StatImage
  // | |\
  // | | +H3.SpellImage
  // |  \
  // |   +H3.ArtifactImage
  // |\
  // | +H3.AffectorList (A)
  // |  \
  // |   +H3.SpellAffectorList
  // |\
  // | +H3.CreatureImageList (A)
  // |\
  // | +H3.Bitmap
  // | |\
  // | | +H3.Bitmap.Calculator
  // | |  \
  // | |   +H3.Bitmap.Portrait
  // |  \
  // |   +H3.TownBackground
  // |\
  // | +H3.BuildingList (A)
  // | |\
  // | | +H3.BuildingList.Calculator (A)
  // | |  \
  // | |   +H3.TownBuildingList
  // | |    \
  // | |     +H3.HallBuildingList
  // |  \
  // |   +H3.ProducingBuildingList (A)
  // |   |\
  // |   | +H3.GrowthBuildingList
  // |    \
  // |     +H3.FortBuildingList
  // |\
  // | +H3.BuildingList.Item
  // | |\
  // | | +H3.TownBuildingList.Item
  // |  \
  // |   +H3.HallBuildingList.Item
  // |\
  // | +H3.TownBuildingState
  // |\
  // | +H3.Resource
  //  \
  //   +H3.ResourceList
  //    \
  //     +H3.EntityCost
  var H3Bits = {}

  // Outputs a single `'property of the `'entity, from the databank's
  // `'collection.
  //
  // Since databank is expected to never change, this doesn't set up any listeners.
  H3Bits.DatabankProperty = Bits.Value.extend('HeroWO.H3.DOM.Bits.DatabankProperty', {
    //> collection str like `'creatures
    //> entity int `- `'x in `'collection
    //> property str like `'name`, int already resolved in schema
    _opt: {
      collection: '',
      entity: 0,
      property: '',
    },

    events: {
      change_collection: 'update',
      change_entity: 'update',
      change_property: 'update',

      _update: function () {
        var value = this.collection().atCoords(this.get('entity'), 0, 0, this.get('property'), 0)
        // Display empty value if there's no such entity or its property is unset
        // (like abilityText).
        this.set('value', (value == null || value === false) ? '' : value)
      },
    },

    // Returns the configured `'collection store.
    //= ObjectStore
    collection: function () {
      return this.rules.databank[this.get('collection')]
    },
  })

  // Displays an image in HoMM 3's `'.bmp (`'.pcx) format.
  //
  // HoMM 3's bitmaps are almost standard `'.bmp files except they allow masks
  // (transparency). In constrast, `#DefImage provides multiple pictures packed
  // into one `'.def file.
  //
  // Avoid referencing bitmaps directly in CSS for these reasons:
  //* base URL must be hardcoded
  //* often exact dimensions must be also hardcoded
  //* automatic recoloring does not occur (done with PLAYERS.PAL, bmp2png.php)
  H3Bits.Bitmap = Bits.Base.extend('HeroWO.H3.DOM.Bits.Bitmap', {
    //> file str like `'ADVMAP
    _opt: {
      file: null,
    },

    events: {
      change_file: '_updateFile',
      // No need to hook render() because if file wasn't set (changed from the
      // default '') then it's the same as no class on el (also the default).
    },

    _updateFile: function () {
      Common.oneClass(this.el, 'Hh3-bmp_id_', this.get('file'))
    },
  })

  // Displays an image in `'.bmp (`'.pcx) format provided by a `#Calculator.
  H3Bits.Bitmap.Calculator = H3Bits.Bitmap.extend('HeroWO.H3.DOM.Bits.Bitmap.Calculator', {
    //> class class `- the `#Calculator class
    //> * `- options for `#Calculator constructor
    _opt: {
      'class': null,
    },

    events: {
      attach: function () {
        this._calc = this.updateOn(this.get('class'), this.get())
      },

      _update: function () {
        this.set('file', this._calc.get('value'))
      },
    },
  })

  // Common ancestor for Bitmap/DefImage.Portrait used to display an adventure map object's image (hero's or town's). Sets CSS classes reflecting state of AObject->$pending/$resting.
  var PortraitMixIn = {
    _opt: {
      pending: false,    // do not set
      resting: false,    // do not set; only for hero
    },

    events: {
      attach: function () {
        var pending = this.get('pending') ? this.map.objects.propertyIndex('pending') : -1
        var resting = this.get('resting') ? this.map.objects.propertyIndex('resting') : -1

        if (pending >= 0 || resting >= 0) {
          var n = this.map.objects.toContiguous(this.get('id'), 0, 0, 0)

          this.autoOff(this.map.objects, [
            'ochange_n_' + n,
            function ($1, $2, prop, now) {
              prop == pending && this.el.toggleClass('Hh3-portrait_pending', !!now)
              prop == resting && this.el.toggleClass('Hh3-portrait_resting', !!now)
            },
          ])

          pending >= 0 && this.el.toggleClass('Hh3-portrait_pending', !!this.map.objects.atContiguous(n + pending, 0))
          resting >= 0 && this.el.toggleClass('Hh3-portrait_resting', !!this.map.objects.atContiguous(n + resting, 0))
        }
      },
    },
  }

  // Displays a hero's image. Unlike Calculator, provides default Calculator's class and sets extra CSS classes.
  H3Bits.Bitmap.Portrait = H3Bits.Bitmap.Calculator.extend('HeroWO.H3.DOM.Bits.Bitmap.Portrait', {
    mixIns: [PortraitMixIn],

    events: {
      init: function (opt) {
        opt.class || this.set('class', Rules.HeroPortrait)
      },
    },
  })

  // Displays an image in HoMM 3's `'.def format.
  //
  // A single DEF is a collection of multiple images (in constrast with `#Bitmap),
  // which can form animations, contain masks (transparency, outline, etc.) and
  // have other advanced features.
  H3Bits.DefImage = Bits.Base.extend('HeroWO.H3.DOM.Bits.DefImage', {
    _animationTimer: null,

    //> def str like `'AH00_
    //> group int `- image group (animation) number in `'def
    //> frame null treat `'group as an animation`, int display that frame statically
    //> features array of string `- like `'redOwner
    _opt: {
      def: null,
      group: 0,
      frame: null,
      features: [],
    },

    events: {
      '+normalize_features': function (res, value) {
        return Common.normArrayCompare(value, this.get.bind(this, 'features'))
      },

      change_def: '_updateImage',
      change_group: '_updateImage',
      change_frame: '_updateImage',
      change_features: '_updateImage',
      render: '_updateImage',

      unnest: function () {
        clearTimeout(this._animationTimer)
      },
    },

    _updateImage: function () {
      var frame = this.get('frame')
      var features = [this.get('def')]
        .concat(this.get('features'), this.get('group'))
        .join('-')
      // XXX=R duplicates with H3.Rules
      var animated = frame == null && this.get('def') != null
      Common.oneClass(this.el, 'Hh3-def_frame_', !animated ? features + '-' + frame : null)
      Common.oneClass(this.el, 'Hh3-anim_id_', animated ? features : null)
      this.el.toggleClass('Hanim', animated)
    },

    // Restarts the animation from the first `'frame.
    //
    // Only makes sense when the `'frame `#_opt is `'null.
    restartAnimation: function () {
      Common.oneClass(this.el, 'Hh3-anim_id_')
      _.redraw(this.el[0])
      this._updateImage()
    },

    // function (group [, options])
    // Starts playing an animation in a highly controlled manner.
    //
    //> group string
    //> options omitted = {}`, object`, callable/string = {done}`, number = {scale}
    //= null`, true
    // Stops old animation, if active (doesn't call old `'done).
    //
    // Specify `'interval if the animation consists of a single frame to pause for this long before calling `'done.
    // Useful if `'done immediately removes the animation and user
    // has no chance of seeing the only frame (`'duration is `'false for such entries in animations.json).
    //
    // Relies on CSS to do the actual animation (change frames).
    //
    // This does not respect the `'Hanim CSS class.
    //
    // stopAnimation/isPlayingAnimation treat this object as playing animation until last next is called. In particular, it's seen as "playing" if paused upon a frame but done is yet to call next. After stopAnimation calls to old next have no effect.
    playAnimation: function (group, options) {
      switch (typeof options) {
        case 'function':
        case 'string':
          options = {done: options}
          break
        case 'number':
          options = {scale: options}
          break
        default:
          options = options || {}
      }

      // Must keep the same options object between the calls.
      var defaults = {
        times: 1,   // <= 0: if old is set then stopAnimation() and apply old, else no-op; number, Infinity
        pauses: [],   // frame numbers to call done after
        done: null,   // function (next, frame), called for each of pauses and for last frame (if not listed in pauses); call next to continue animating (give exactly false to end animation)
        cx: this,   // for done
        autoEnd: 'call',   // if truthy, on last frame of last times done's next is Common.stub (can compare); calling it is optional because the real next was called before invoking done; if exactly true, done isn't called at all in that case
        old: null,    // [group, frame] to revert to after playing for times; null - take values from before playAnimation()
        frame: 0,  // starting/current frame number (will wait interval before switching to next frame after this one)
        frames: null,   // number of frames in this animation; null - from databank
        interval: null, // delay between each frame; null - from databank (N/A for single frame)
        scale: 1.0,   // factor for base duration; must match the appropriate --H CSS variable; normally comes from Screen options
      }

      _.each(defaults, function (v, k) {
        _.has(options, k) || (options[k] = v)
      })

      var duration = this.info('duration', {group: group})

      if (duration == null || options.times <= 0) {
        if (options.old) {
          this.stopAnimation()
          this.getSet(['group', 'frame'], function () { return options.old })
        }
        return
      }

      options.frames = options.frames || this.info('frameCount', {group: group})
      var interval = duration ? duration * options.scale / options.frames
        : /*duration === false*/ options.interval
      options.old = options.old || this.getSet(['group', 'frame'])
      this.stopAnimation()
      this.assignResp({group: group, frame: null})
      this.el.css('animationDelay', -options.frame * interval + 'ms')

      // https://developer.mozilla.org/en-US/docs/Web/CSS/animation-delay
      // "If you specify a negative value for the animation delay, but the starting value is implicit, the starting value is taken from the moment the animation is applied to the element."
      //
      // Apparently this explains why the animation has to be restarted (and resetting animation-iteration-count, i.e. Hanim doesn't do that). Here is a real example: hero's combat image changes during spell casting in such a way that it first animates from frame 0 to 4 and then from 5 to 7 (last). Frame 4 is listed in pauses.
      //
      // 1. Just before calling done, playAnimation() sets _opt.frame to 4. _updateImage() removes animation-related classes (Hanim and Hh3-anim_id_...).
      // 2. done() calls next. playAnimation() sets frame to null and sets animationDelay to show the 5th frame. _updateImage() brings back animation-related classes.
      //
      // If done() calls next during the same render frame, it's very likely the browser will batch style changes and not restart the animation since the node's classes were restored. As such, new animationDelay would count from the time the animation has started playing before (on step 1 or even earlier). To avoid that, we force redrawing the node to make sure animationDelay's "starting value" is "now".
      //
      // This surmise is supported by the fact that removing the next three lines from here and inserting only _.redraw() into done() prior to calling next solves the issue.
      this.el.css('animationName', 'none')
      _.redraw(this.el[0])
      this.el.css('animationName', '')

      // Fast mode: rely on CSS to play infinitely since there's no need to call done.
      if (options.times == Infinity && !options.done) {
        this._animationTimer = true
      } else {
        var nextFrame = options.frames - 1

        options.pauses.forEach(function (frame) {
          if (frame >= options.frame && frame < nextFrame) {
            nextFrame = frame
          }
        })

        if (options.frame >= nextFrame - 1) {
          // If we're going to wait for a single frame then don't use CSS animations due to potential timer inaccuracy (our timer may be called slightly after CSS causes browser to paint next frame and user might see it flicker).
          this.set('frame', options.frame)
        }

        var delay = interval * (nextFrame - options.frame + 1)

        var timer = this._animationTimer = setTimeout(function () {
          this.set('frame', options.frame = nextFrame)

          var next = function (res) {
            if (timer == this._animationTimer) {
              if (res === false) {
                options.times = 0
              } else if (++options.frame == options.frames) {
                options.times--
                options.frame = 0
              }
              this.playAnimation(group, options)
            }
          }.bind(this)

          if (options.done) {
            if (options.autoEnd && options.times == 1 && options.frame == options.frames - 1) {
              next()
              if (options.autoEnd === true) { return }
              options.frame = options.frames - 1    // done won't expect 0 here
              next = Common.stub
            }
            if (typeof options.done == 'string') {
              options.done = Common.ef(options.done)
            }
            options.done.call(options.cx, next, options.frame)
          } else {
            next()
          }
        }.bind(this), delay)
      }

      return true
    },

    // Stops an animation started earlier with `#playAnimation().
    //
    // This won't necessary revert to pre-animation group/frame since it doesn't trigger animation callbacks.
    stopAnimation: function () {
      if (this._animationTimer) {
        clearTimeout(this._animationTimer)
        this._animationTimer = null
        this.el.css('animationDelay', '')
        return true
      }
    },

    // Tells if there's an active animation started earlier with `#playAnimation().
    isPlayingAnimation: function () {
      return this._animationTimer != null
    },

    // Returns value of `'prop'erty in animations databank of the current DEF from `'_opt (or some other `'def/`'group if `'options is given).
    //
    // Note: duration is considering the default playing speed; may need to be multiplied by user's preference (like combatSpeed).
    info: function (prop, options) {
      options = _.extend(this.get(), options)
      var anim = this.rules.animationsID[options.def + '_' + options.group]
      if (anim != null) {
        return this.rules.animations.atCoords(anim, 0, 0, prop, 0)
      }
    },
  })

  // Displays an image in `'.def format provided by a `#Calculator.
  H3Bits.DefImage.Calculator = H3Bits.DefImage.extend('HeroWO.H3.DOM.Bits.DefImage.Calculator', {
    //> class class `- the `#Calculator class
    //> * `- options for `#Calculator constructor
    _opt: {
      'class': null,
    },

    events: {
      attach: function () {
        this._calc = this.updateOn(this.get('class'), this.get())
      },

      _update: function () {
        var value = this._calc.get('value')
        if (typeof value == 'string') {   // Effect target: combatImage
          value = {def: value, group: 0, frame: null}
        } else if (_.isArray(value)) {    // Rules.BuildingU.Image
          value = _.object(['def', 'group', 'frame'], value)
        }   // else object, Effect target: portrait
        this.assignResp(value)
      },
    },
  })

  // Displays a hero's image. Unlike Calculator, provides default Calculator's class and sets extra CSS classes.
  H3Bits.DefImage.Portrait = H3Bits.DefImage.Calculator.extend('HeroWO.H3.DOM.Bits.DefImage.Portrait', {
    mixIns: [PortraitMixIn],

    events: {
      init: function (opt) {
        opt.class || this.set('class', Rules.TownPortrait)
      },
    },
  })

  // Displays icon of a certain secondary hero skill (like Archery).
  H3Bits.SkillImage = H3Bits.DefImage.extend('HeroWO.H3.DOM.Bits.SkillImage', {
    //> size int 32, 82, 44, 58
    //> skill int ID
    //> mastery int `- Skill::mastery
    _opt: {
      size: 0,
      skill: 0,
      mastery: 0,
    },

    _masteries: null,

    events: {
      attach: function () {
        this._masteries = [
          this.map.constants.skill.mastery.basic,
          this.map.constants.skill.mastery.advanced,
          this.map.constants.skill.mastery.expert,
        ]
      },

      change_large: 'update',
      change_skill: 'update',
      change_mastery: 'update',

      _update: function () {
        var defs = {32: 'SECSK32', 82: 'SECSK82', 44: 'SECSKILL', 58: 'SSKILBON'}
        var mastery = this._masteries.indexOf(this.get('mastery'))
        this.assignResp({
          def: defs[this.get('size')],
          frame: mastery + this.get('skill') * 3 + (this.get('size') == 58 ? 0 : 3),
        })
      },
    },
  })

  // Displays icon of a certain primary hero skill (stat, like Knowledge).
  H3Bits.StatImage = H3Bits.DefImage.extend('HeroWO.H3.DOM.Bits.StatImage', {
    //> size int 32, 42, 58, 82
    //> stat int `- constants.stats value; `'experience and `'spellPoints are not supported by `'size 58
    _opt: {
      size: 0,
      stat: 0,
    },

    _frames: null,

    events: {
      attach: function () {
        this._frames = [
          this.map.constants.stats.attack,
          this.map.constants.stats.defense,
          this.map.constants.stats.spellPower,
          this.map.constants.stats.knowledge,
          this.map.constants.stats.experience,
          this.map.constants.stats.spellPoints,
        ]
      },

      change_size: 'update',
      change_stat: 'update',

      _update: function () {
        var frames = this._frames
        if (this.get('size') == 42) {
          frames = frames.concat()
          frames[3] = this.map.constants.stats.spellPoints
          frames[5] = this.map.constants.stats.knowledge
        }
        var defs = {32: 'PSKIL32', 42: 'PSKIL42', 58: 'PSKILBON', 82: 'PSKILL'}
        this.assignResp({
          def: defs[this.get('size')],
          frame: frames.indexOf(this.get('stat')),
        })
      },
    },
  })

  // Displays icon of a certain spell (like Magic Arrow).
  H3Bits.SpellImage = H3Bits.DefImage.extend('HeroWO.H3.DOM.Bits.SpellImage', {
    _imageIndex: 0,

    //> type str `- BON, INT (list of bufs), S (spell book), SCR (spell scroll)
    //> spell int ID
    _opt: {
      type: 'INT',
      spell: 0,
    },

    events: {
      attach: function () {
        this._imageIndex = this.rules.spells.propertyIndex('image')
      },

      change_type: 'update',
      change_spell: 'update',

      _update: function () {
        this.assignResp({
          def: 'SPELL' + this.get('type'),
          frame: (this.get('type') == 'INT') +
                 this.rules.spells.atCoords(this.get('spell'), 0, 0, this._imageIndex, 0),
        })
      },
    },
  })

  // Displays icon of a certain artifact (like Orb of Vulnerability).
  H3Bits.ArtifactImage = H3Bits.DefImage.extend('HeroWO.H3.DOM.Bits.ArtifactImage', {
    //> type str `- BON, ACT (message box)
    //> artifact int ID
    _opt: {
      type: 'ACT',
      artifact: 0,
    },

    events: {
      change_type: 'update',
      change_artifact: 'update',

      _update: function () {
        this.assignResp({
          def: 'ARTIF' + this.get('type'),
          frame: this.rules.artifacts.atCoords(this.get('artifact'), 0, 0, 'icon', 0),
        })
      },
    },
  })

  // Displays a resource's icon (like gold) and count.
  //
  // This is a simple non-reactive class.
  H3Bits.Resource = Bits.Base.extend('HeroWO.H3.DOM.Bits.Resource', {
    _opt: {
      resource: 0,
      count: 0,  // can be any string
      icon: '',  // do not set
    },

    events: {
      attach: function () {
        if (this.get('icon')) {
          this.addModule('icon', H3Bits.DefImage, {def: this.get('icon')})
        }

        this.el.append('<div class=Hh3-bit-res__count>')
      },

      change_resource: 'update',
      change_count: 'update',

      _update: function () {
        this.el.toggleClass('Hh3-bit-res_empty', !this.get('count'))
        this.$('.Hh3-bit-res__count').text(this.get('count'))

        if (this.get('icon')) {
          this.nested('icon').set('frame', this.get('resource'))
        }
      },
    },
  })

  // Displays a list of `#Resource-s (icons and counts).
  H3Bits.ResourceList = Bits.Base.extend('HeroWO.H3.DOM.Bits.ResourceList', {
    mixIns: [Common.Ordered],
    _childClass: H3Bits.Resource,
    _childEvents: ['change_count'],

    events: {
      'nestExNew, unnested, .change_count': function () {
        Common.oneClass(this.el, 'Hh3-bit-ress_len_',
          this.filter(Common.p('get', 'count')).length)
      },
    },

    // Checks if `'player has no fewer resources than displayed on this list.
    affordedBy: function (player) {
      return this.every(function (child) {
        if (child.get('count') <= player.get('resources_' + _.indexOf(this.map.constants.resources, child.get('resource')))) {
          return true
        }
      }, this)
    },
  })

  // Displays list of resources based on Calculator-s' values.
  //
  // This is used in hire creature and erect building windows.
  H3Bits.ResourceList.EntityCost = H3Bits.ResourceList.extend('HeroWO.H3.DOM.Bits.ResourceList.EntityCost', {
    _calcs: [],

    _opt: {
      multiplier: 1,
      // + Calculator options including target
    },

    events: {
      change_multiplier: 'update',

      attach: function () {
        _.each(this.map.constants.resources, function (id, name) {
          this.addModule(name, H3Bits.Resource, {resource: id, pos: id})

          this._calcs[id] = this.updateOn(Calculator.Effect.GenericNumber, _.extend(this.get(), {
            ifResource: id,
          }))
        }, this)
      },

      _update: function () {
        _.each(this.map.constants.resources, function (id, name) {
          this.nested(name).set('count', this._calcs[id].get('value') * this.get('multiplier'))
        }, this)
      },
    },
  })

  // Displays static or animated image of a single `'creature.
  //
  // This is used in town's screen's left-side panel (creature growth list).
  H3Bits.CreatureImage = H3Bits.DefImage.extend('HeroWO.H3.DOM.Bits.CreatureImage', {
    //> creature databank ID
    //> highlight null don't add CSS classes`, bool do add
    //> type str `- one of `'animation (looping animation of `[_opt.group`];
    //  default is 0 "Moving" and it can be missing from DEF),
    //  `'small (default), `'large
    _opt: {
      creature: null,
      highlight: null,
      type: 'small',  // do not set
    },

    events: {
      change_creature: 'update',

      change_highlight: function (now) {
        Common.oneClass(this.el, 'Hh3-bit-crim_hl',
          now == null ? null : now ? '_yes' : '_no')
      },

      _update: function () {
        var frame = this.get('creature')

        if (frame == null) {
          return this.set('def', null)
        }

        switch (this.get('type')) {
          default:
          case 'small':
            var def = 'CPRSMALL'
            frame += 2
            break
          case 'large':
            var def = 'TWCRPORT'
            frame += 2
            break
          case 'animation':
            var def = this.rules.creatureAnimations.atCoords(frame, 0, 0, 'image', 0)
            // Client can explicitly specify a frame to display it statically,
            // or leave it at null for animation.
            frame = this.get('frame')
        }

        this.assignResp({def: def, frame: frame})
      },
    },
  })

  // Displays big randomly changing animations (move, attack, etc.) of a single
  // `'creature.
  //
  // This is used to implement "creature information" window, town's Fort screen,
  // etc.
  H3Bits.CreatureAnimation = H3Bits.CreatureImage.extend('HeroWO.H3.DOM.Bits.CreatureAnimation', {
    // XXX DEF images are large (450x400) and the game somehow decides where the center is individually (compare how it shows CPKMAN and CABEHE and you'll see that their offsets are different, as seen in creature info animation)
    _groups: ['move', 'hover', 'stand', 'hit', 'defend', 'attackUp', 'attack', 'attackDown'],

    _opt: {
      group: null,  // used in the check in _update()
      type: 'animation',
    },

    events: {
      attach: function () {
        this._groups = _.values(_.pick(this.map.constants.animation.group, this._groups))
      },

      _update: function () {
        var groups = this._groups.concat()
        while (groups.length && !started) {
          var group = groups.splice(_.random(groups.length - 1), 1)[0]
          // Move animation consists of 3 parts: start moving, moving loop, stop
          // moving. Not all creatures have start and/or stop parts. We check if
          // last played animation was moving and, if so, switch to playing
          // stop moving instead of next randomly chosen animation - but only
          // on the first iteration (!looped), i.e. avoid endless loop if
          // there's no stop moving group.
          if (group != this.get('group')   // don't play start/stop moving if newly chosen group is moving (i.e. don't play start/stop between two moving animations)
              && !looped) {
            if (this.get('group') == this.map.constants.animation.group.move) {
              group = this.map.constants.animation.group.stop
            }
            if (group == this.map.constants.animation.group.move) {
              group = this.map.constants.animation.group.start
            }
          }
          var started = this.playAnimation(group, 'update')
          var looped = true
        }
      },
    },
  })

  // Displays a static or animated image of a single creature on its native town's background.
  //
  // This is a wrapper around `#CreatureAnimation if `'type is not given, or
  // around `#CreatureImage if it is given so see their options for configuration.
  H3Bits.CreatureOnBackground = Bits.Base.extend('HeroWO.H3.DOM.Bits.CreatureOnBackground', {
    _class: null,

    events: {
      init: function (opt) {
        this._class = opt.type ? H3Bits.CreatureImage : H3Bits.CreatureAnimation
      },

      change_highlight: function (now) {
        Common.oneClass(this.el, 'Hh3-bit-crim_hl',
          now == null ? null : now ? '_yes' : '_no')
      },

      attach: function () {
        this.addModule(H3Bits.Bitmap, {
          elClass: 'Hh3-bit-crob__bk',
          file: this.rules.creatures.atCoords(this.get('creature'), 0, 0, 'background', 0),
        })

        this.addModule(this._class, _.pick(this.get(), 'creature', 'highlight', 'type', 'group', 'frame', 'highlight', _.forceObject))
          .el.addClass('Hh3-bit-crob__cr')
      },
    },

    elEvents: {
      click: 'clicked',

      mousedown: function (e) {
        e.button == 2 && this.showTooltip()
      },
    },

    //#-clicked
    clicked: Common.stub,

    //#-showtt
    showTooltip: Common.stub,
  })

  // Base class for displaying a list of creature animations, optionally
  // selectable.
  //
  // This is used to implement dwelling hiring window, Blacksmith, etc.
  H3Bits.CreatureImageList = Bits.Base.extend('HeroWO.H3.DOM.Bits.CreatureImageList', {
    mixIns: [Common.Ordered],
    _childClass: H3Bits.CreatureOnBackground,
    _childEvents: ['change_highlight', 'clicked', 'showTooltip'],

    //> highlight false don't draw outline around children, don't allow selecting`,
    //  null do draw (ensure
    //  children's `[_opt.highlight`] is either `'true or `'false) and allow
    //  user to highlight (select) children`, true as `'null but ensure at least one child
    //  is always highlighted unless `'this is empty
    //> highlighted null`, object `- the child with `'highlight set
    _opt: {
      highlight: true,
      highlighted: null,
    },

    events: {
      nestExNew: function (res) {
        res.child.getSet('highlight', function (cur) {
          if (cur || (!this.get('highlighted') && this.get('highlight'))) {
            this.set('highlighted', res.child)
            return true
          } else if (this.get('highlight') != false) {
            return !!cur  // if drawing outlines then force child's highlight to bool
          }
        }, this)
      },

      unnested: function (child) {
        child.get('highlight') && this.set('highlighted', null)
      },

      '+normalize_highlighted': function (res, value) {
        if (!value && this.get('highlight')) {
          // If user tries to remove highlighting from current item, restore
          // it or highlight the first child (because the currently highlighted
          // child was unnested).
          value = this.nested(this.get('highlighted')) || this.first()
        }
        return value
      },

      change_highlighted: function (now, old) {
        old && old.set('highlight', false)
        now && now.set('highlight', true)
      },

      '.change_highlight': function (child, now) {
        if (now == null && this.get('highlight') != false) {
          child.set('highlight', !!now)   // force to bool
        } else {
          this.getSet('highlighted', function (cur) {
            return now ? child : (cur == child ? null : cur)
          })
        }
      },
    },
  })

  // Base class for displaying a list of town buildings.
  H3Bits.BuildingList = Bits.Base.extend('HeroWO.H3.DOM.Bits.BuildingList', {
    // Useful if _childClass is BuildingList.Item.
    _childEvents: ['clicked', 'showTooltip'],

    //> list array of `[Building->$id`] `- provides children
    _opt: {
      list: [],
    },

    events: {
      '+normalize_list': function (res, value) {
        return Common.normIntArrayCompare(value, this.get.bind(this, 'list'))
      },

      change_list: 'update',

      _update: function () {
        this.assignChildren(this.get('list').map(this._childOptions, this), {
          eqFunc: 'id',
          // Only used if Ordered is mixed-in.
          posFunc: this._childPos.bind(this),
        })
      },

      '=_defaultKey': function (sup, item) {
        return item.get('id')
      },
    },

    _childOptions: function (id) {
      return {id: id}
    },

    _childPos: Common.stub,
  })

  // Base class using a single-`'value `#Calculator to provide the building list.
  H3Bits.BuildingList.Calculator = H3Bits.BuildingList.extend('HeroWO.H3.DOM.Bits.BuildingList.Calculator', {
    _calc: null,

    events: {
      attach: function () {
        this._calc = this._makeCalc()

        this.autoOff(this._calc, {
          change_value: function (now) { this.set('list', now) },
          unnest: 'remove',
        })

        if (this._calc.get('rendered')) {
          this.set('list', this._calc.get('value'))
        }
      },
    },

    //= Calculator
    _makeCalc: Common.stub,
  })

  // Generic child of `#BuildingList used to display a single town building.
  H3Bits.BuildingList.Item = Bits.Base.extend('HeroWO.H3.DOM.Bits.BuildingList.Item', {
    elEvents: {
      click: 'clicked',

      mousedown: function (e) {
        e.button == 2 && this.showTooltip()
      },
    },

    //#-clicked
    clicked: Common.stub,

    //#-showtt
    showTooltip: Common.stub,
  })

  // Displays a list of buildings available for construction in a single town.
  //
  // This is used to implement the Hall screen.
  H3Bits.HallBuildingList = H3Bits.BuildingList.Calculator.extend('HeroWO.H3.DOM.Bits.HallBuildingList', {
    _childClass: [H3Bits, 'HallBuildingList.Item'],

    //> town `@ObjectRepresentation`@
    _opt: {
      town: null,
    },

    events: {
      '+_childOptions': function (res, id) {
        res.town = this.get('town')
      },

      '=_makeCalc': function () {
        return this.cx.calculator(Rules.TownHallBuildings, {
          id: this.get('town').get('id'),
        })
      },
    },
  })

  // Child of `#HallBuildingList used to display a single town building.
  H3Bits.HallBuildingList.Item = H3Bits.BuildingList.Item.extend('HeroWO.H3.DOM.Bits.HallBuildingList.Item', {
    //> town ObjectRepresentation
    //> id int Building->$id
    _opt: {
      town: null,
      id: 0,
    },

    events: {
      attach: function () {
        Common.oneClass(this.el, 'Hh3-hall__building_id_',
          _.indexOf(this.rules.buildingsID, this.get('id')))

        this.addModule('face', H3Bits.DefImage.Calculator, {
          class: Rules.BuildingU.Image,
          id: this.get('town').get('id'),
          building: this.get('id'),
        })

        var state = this.addModule('stateBar', H3Bits.TownBuildingState, {
          town: this.get('town'),
          building: this.get('id'),
          player: this.map.players.nested(this.get('town').get('owner')),
          def: 'TPTHBAR',
        })

        state.whenRenders(function () {
          Common.oneClass(this.el, 'Hh3-hall__building_s_', state._calc.get('value'))
        }, this)

        this.addModule('stateIcon', H3Bits.TownBuildingState, {
          town: this.get('town'),
          building: this.get('id'),
          player: this.map.players.nested(this.get('town').get('owner')),
          def: 'TPTHCHK',
        })

        this.addModule('name', H3Bits.DatabankProperty, {
          collection: 'buildings',
          entity: this.get('id'),
          property: 'name',
        })
      },
    },
  })

  // Displays a list of buildings currently constructed in a single town.
  //
  // This is used to implement town's main overview screen.
  //
  // The way `#TownBuildingList works with `[<map>`] is against all possible
  // standards but putting `[<area>`] and child nodes under the same `'map
  // makes things so much simpler because we can reorder all components of a
  // child together as one.
  H3Bits.TownBuildingList = H3Bits.BuildingList.Calculator.extend('HeroWO.H3.DOM.Bits.TownBuildingList', {
    mixIns: [Common.Ordered],
    el: {tag: 'map'},
    _childClass: [H3Bits, 'TownBuildingList.Item'],

    //> town `@ObjectRepresentation`@
    _opt: {
      town: null,
    },

    _initToOpt: {
      image: false,
    },

    events: {
      init: function (opt) {
        this.el.attr('name', this._cid)
        // This <img> must be outside of this.el to avoid problems with Ordered.
        opt.image.attr('usemap', '#' + this._cid)
      },

      '+_childOptions': function (res, id) {
        res.list = this

        res.calc = this.cx.calculator(Rules.BuildingU.Image, {
          id: this.get('town').get('id'),
          building: id,
          property: 'scapeImage',
        })
      },

      '=_makeCalc': function () {
        return this.cx.listeningEffectCalculator({
          class: Calculator.Effect.GenericIntArray,
          update: 'defer',
          target: this.map.constants.effect.target.town_buildings,
          ifObject: this.get('town').get('id'),
        })
      },

      '=_childPos': function (sup, child) {
        // <area> have inverse Z order: first overlays the following.
        return 100 - child._calc.get('sub')
          .atCoords(this.get('town').get('subclass'), 0, 0, 'scapeZ', 0)
      },
    },
  })

  // Child of `#TownBuildingList used to display a single town building.
  H3Bits.TownBuildingList.Item = H3Bits.BuildingList.Item.extend('HeroWO.H3.DOM.Bits.TownBuildingList.Item', {
    _list: null,
    _calc: null,
    _ship: null,
    _image: null,
    _hoverBitmap: null,

    _opt: {
      id: 0,
    },

    _initToOpt: {
      list: '._list',
      calc: false,
    },

    events: {
      init: function (opt) {
        this._calc = this.autoOff(opt.calc, {
          change_value: 'update',
          unnest: 'remove',
        })
      },

      attach: function () {
        this._hoverBitmap = this.addModule('hover', H3Bits.Bitmap)
        this._image = this.addModule('face', H3Bits.DefImage)
      },

      _update: function () {
        // In case Town's $id (subclass) or Building's "U" has changed.
        // Note that nestEx() may be called before nestEx() of addModule()
        // (i.e. _update() runs while this is not yet listed in this.list._children).
        // This shouldn't cause any problems, second nestEx() is just a no-op.
        this._list.nestEx({
          key: this.get('id'),    // must match _defaultKey of non-_owning TownBuildingList parent
          child: this,
          pos: this._list._childPos(this),
        })

        // Can't remember atter() once because sub may have changed together
        // with subclass or "U".
        var obj = this._calc.get('sub').atter(['scapeOutline', 'scapeShapes', 'scapeHoles', 'scapeX', 'scapeY', 'scapeZ'])(this._list.get('town').get('subclass'), 0, 0, 0)

        this._hoverBitmap.set('file', obj.scapeOutline)
        this._image.set('def', this._calc.get('value'))

        this.el.css({
          left: obj.scapeX,
          top: obj.scapeY,
          // Here's a trick: first <area> must be the top-most ("closest" to the
          // user) while default Z order of nodes is the inverse (last node
          // overlays preceding). So we're sorting TownBuildingList's children
          // in reverse while giving explicit non-reversed z-index to children.
          zIndex: obj.scapeZ,
        })

        this.$('area').remove()

        _.each(obj.scapeHoles, function (c) {
          $('<area>')
            .attr({shape: 'poly', coords: c})
            .appendTo(this.el)
        }, this)

        // TBCSDOCK.DEF is Shipyard's building image. TBCSBOAT.DEF is a variant shown when Shipyard exists and there is a ship near the town. TBCSBOAT must overlay TBCSDOCK but underlay the outline.
        switch (obj.scapeOutline) {
          case 'TOCSDKNN':
          case 'TONSHPNA':
          case 'TOFDCK1':
          case 'TOELDOCK':
            if (this._ship === true) {
              return
            } else if (!this._ship) {
              this._ship = true
              this._ship = this.updateOn(Rules.ShipState, {
                id: this._list.get('town').get('id'),
              })
            }
            // ship/movable condition is also defined in CSS.
            var boatPresent = this._ship.get('value') == 'ship' || this._ship.get('value') == 'movable'
        }

        _.each(obj.scapeShapes, function (c) {
          $('<area>')
            .attr({shape: 'poly', coords: c})
            .on('mouseenter mouseleave', function (e) {
              var enter = e.type == 'mouseenter'
              this._hoverBitmap.el[0].style.display = this.sc._opt.mapTownOutlines && enter ? 'block' : ''
              if (boatPresent) {
                this._hoverBitmap.el[0].style.zIndex = enter ? obj.scapeZ + 1 : ''
                this.el[0].style.zIndex = enter ? '' : obj.scapeZ
              }
            }.bind(this))
            .on('click', Common.ef('clicked', this))
            .on('mousedown', function (e) {
              e.button == 2 && this.showTooltip()
            }.bind(this))
            .appendTo(this.el)
        }, this)
      },
    },

    elEvents: {
      // Overriding to dispatch clicks coming from <area> only.
      click: Common.stub,
      mousedown: Common.stub,
    },
  })

  // Base class for displaying a list of buildings that produce creatures, in some
  // town.
  //
  // The list is ordered by level of arbitrary creature the building
  // produces.
  H3Bits.ProducingBuildingList = H3Bits.BuildingList.extend('HeroWO.H3.DOM.Bits.ProducingBuildingList', {
    mixIns: [Common.Ordered],
    _calc: null,
    _allCalc: null,

    //> town `@ObjectRepresentation`@
    //> potential true to display buildings that are not built but that can produce stuff in this town`, array of building IDs that will always be added
    _opt: {
      town: null,
      potential: false, // do not set
    },

    events: {
      init: function () {
      },

      '+normalize_list': function (built) {
        ;(this.get('potential') || []).forEach(function (potential) {
          if (!this._allCalc ||
              // Only add buildings that are not 1) lesser (non-upgraded)
              // versions of an already constructed one, and 2) that themselves
              // are not an upgraded version of a yet-to-be-constructed building.
              // 2nd point is checked in _updatePotential().
              this._allCalc.get('value').indexOf(potential) == -1) {
            built.push(potential)
          }
        }, this)
      },

      attach: function () {
        if (this.get('potential') === true) {
          this._allCalc = this.cx.calculator(Rules.TownBuildingsWithUpgraded, {
            id: this.get('town').get('id'),
          })

          this.autoOff(this._allCalc, {change_value: '_updateList'})
          this._updatePotential()

          this.autoOff(this.get('town'), {
            change_subclass: function () {
              this._updatePotential()
              this._updateList()
            },
          })
        }

        this._calc = this.cx.calculator(Rules.ProducingBuildings, {
          id: this.get('town').get('id'),
        })

        this.autoOff(this._calc, {unnest: 'remove'})
          .whenRenders('change_value', Common.ef('_updateList'), this)
      },

      '=_childPos': function (sup, child) {
        if (child.get('id') == this.rules.buildingsID.portalOfSummoning) {
          return Infinity
        } else {
          var cr = this.creatureOf(child.get('id'))
          return this.rules.creatures.atCoords(cr, 0, 0, 'level', 0)
        }
      },
    },

    _updatePotential: function () {
      var list = this.rules.producers[this.get('town').get('subclass')]

      list = _.keys(list || {})
        .map(function (id) { return parseInt(id) })
        .filter(function (id) {
          return !this.rules.buildings.atCoords(id, 0, 0, 'upgrade', 0)
        }, this)

      this.set('potential', list)
    },

    _updateList: function () {
      this.set('list', _.keys(this._calc.get('value')))
    },

    // Returns Creature->$id of arbitrary creature produced by `'building (either built or potential).
    creatureOf: function (building) {
      var cr = this._calc.get('value')[building] ||
               // Potential.
               this.rules.buildings.atCoords(building, 0, 0, 'produce', 0)
      return cr && _.last(cr)
    },
  })

  // Displays list of creatures produced in a single town, with their weekly
  // "+growth" numbers.
  //
  // This is used in town's screen's left-side panel (creature growth list).
  H3Bits.GrowthBuildingList = H3Bits.ProducingBuildingList.extend('HeroWO.H3.DOM.Bits.GrowthBuildingList', {
    _childClass: H3Bits.BuildingList.Item,

    events: {
      nestExNew: function (res) {
        res.child.el.addClass('Hh3-town__grower')

        var cr = this.creatureOf(res.child.get('id'))
        res.child.addModule('face', H3Bits.CreatureImage, {creature: cr})

        res.child.addModule('growth', Bits.String, {
          elClass: 'Hh3-town__growth-rate',
          format: '+%g',
        })
          .addCalculator('g', {
            target: this.map.constants.effect.target.creature_growth,
            ifObject: this.get('town').get('id'),
            ifCreature: cr,
          })
      },
    },
  })

  // Displays list of and information about creatures that a single town
  // could or does produce.
  //
  // This is used to implement the Fort screen.
  H3Bits.FortBuildingList = H3Bits.ProducingBuildingList.extend('HeroWO.H3.DOM.Bits.FortBuildingList', {
    _childClass: H3Bits.BuildingList.Item,

    events: {
      attach: function () {
        this._calc.on('change_value', function () {
          this.each(this._updatePotentialClass, this)
        }, this)
      },

      nestExNew: function (res) {
        var creature = this.creatureOf(res.child.get('id'))
        this._updatePotentialClass(res.child)

        res.child.addModule('name', H3Bits.DatabankProperty, {
          collection: 'creatures',
          entity: creature,
          property: 'namePlural',
        })

        res.child.addModule('building', H3Bits.DefImage.Calculator, {
          class: Rules.BuildingU.Image,
          id: this.get('town').get('id'),
          building: res.child.get('id'),
        })

        res.child.addModule('available', Bits.String, {format: this.cx.s('map', 'Available:  %a')})
          .addModule('a', Bits.ObjectStoreProperty, {
            el: false,
            store: this.map.objects.subAtCoords(this.get('town').get('id'), 0, 0, 'available', 0),
            take: true,
            x: res.child.get('id'),
            default: 0,
          })

        res.child.addModule('buildingName', H3Bits.DatabankProperty, {
          collection: 'buildings',
          entity: res.child.get('id'),
          property: 'name',
        })

        res.child.addModule('creature', H3Bits.CreatureOnBackground, {
          creature: creature,
        })

        res.child.addModule('icons', H3Bits.Bitmap, {file: 'TPCAINFO'})

        res.child.el.append(
          '<div class="Hh3-fort__l Hh3-fort__l_s_attack">' + this.cx.s('map', 'Attack') + '</div>' +
          '<div class="Hh3-fort__l Hh3-fort__l_s_defense">' + this.cx.s('map', 'Defense') + '</div>' +
          '<div class="Hh3-fort__l Hh3-fort__l_s_damage">' + this.cx.s('map', 'Damage') + '</div>' +
          '<div class="Hh3-fort__l Hh3-fort__l_s_hitPoints">' + this.cx.s('map', 'Health') + '</div>' +
          '<div class="Hh3-fort__l Hh3-fort__l_s_speed">' + this.cx.s('map', 'Speed') + '</div>' +
          '<div class="Hh3-fort__l Hh3-fort__l_s_growth">' + this.cx.s('map', 'Growth') + '</div>'
        )

        _.each(['attack', 'defense', 'hitPoints', 'speed'], function (property) {
          res.child.addModule(property, H3Bits.DatabankProperty, {
            elClass: 'Hh3-fort__stat',
            collection: 'creatures',
            entity: creature,
            property: property,
          })
        }, this)

        var damage = res.child.addModule('damage', Bits.String, {
          elClass: 'Hh3-fort__stat',
          format: this.cx.s('map', '%l-%h'),
        })
        damage.addModule('l', H3Bits.DatabankProperty, {
          el: false,
          collection: 'creatures',
          entity: creature,
          property: 'damageMin',
        })
        damage.addModule('h', H3Bits.DatabankProperty, {
          el: false,
          collection: 'creatures',
          entity: creature,
          property: 'damageMax',
        })

        res.child.addModule('growth', Bits.String, {
          elClass: 'Hh3-fort__stat',
          format: this.cx.s('map', '%g'),
        })
          .addCalculator('g', {
            target: this.map.constants.effect.target.creature_growth,
            ifObject: this.get('town').get('id'),
            ifCreature: creature,
          })
      },
    },

    _updatePotentialClass: function (child) {
      child.el.toggleClass('Hh3-fort__building_potential',
        !this._calc.get('value')[child.get('id')])
    },
  })

  // Displays icon corresponding to a hero's/town's general luck or a particular
  // creature in its garrison.
  H3Bits.Luck = H3Bits.DefImage.extend('HeroWO.H3.DOM.Bits.Luck', {
    _def: 'ILCK',
    _target: 'creature_luck',
    _calc: null,

    //> size int 22, 30, 42, 82`, str `'B, `'S
    _opt: {
      size: 0,
    },

    events: {
      attach: function () {
        this._calc = this.updateOn(Calculator.Effect.GenericNumber, _.extend(this.get(), {
          target: this.map.constants.effect.target[this._target],
        }))
      },

      change_size: 'update',

      _update: function () {
        this.assignResp({
          def: this._def + this.get('size'),
          frame: this._calc.get('value') + 3,
        })
      },
    },
  })

  // Displays icon corresponding to a hero's/town's general morale or a particular
  // creature in its garrison.
  H3Bits.Morale = H3Bits.Luck.extend('HeroWO.H3.DOM.Bits.Morale', {
    _target: 'creature_morale',
    _def: 'IMRL',
  })

  // Displays icon corresponding to current hero's action points (move points, APs).
  //
  // This is used in ADVMAP's right-side hero list.
  H3Bits.HeroAP = H3Bits.DefImage.extend('HeroWO.H3.DOM.Bits.HeroAP', {
    _prop: 'actionPoints',

    //> hero `@ObjectRepresentation`@
    _opt: {
      def: 'IMOBIL',
      hero: null,   // do not set
    },

    events: {
      attach: function () {
        this.autoOff(this.get('hero'), [
          'change_' + this._prop,
          function (now, $2, options) {
            this.sc.transitions.updateUsing(now, options, this)
          },
        ])
      },

      _update: function () {
        this._updateUsing(this.get('hero').get(this._prop))
      },
    },

    _updateUsing: function (value) {
      // Step determined empirically. Keyword: hero_actionCost.
      this.set('frame', Math.floor(Common.clamp(value / 67, 0, 25)))
    },
  })

  // Displays icon corresponding to current hero's spell points (casting points, SPs).
  H3Bits.HeroSP = H3Bits.HeroAP.extend('HeroWO.H3.DOM.Bits.HeroSP', {
    _prop: 'spellPoints',

    _opt: {
      def: 'IMANA',
    },
  })

  // Outputs 1-based level of a single hero.
  //
  // This is used in level-up and hero info/trade windows.
  H3Bits.HeroLevel = Bits.ObjectRepresentationProperty.extend('HeroWO.H3.DOM.Bits.HeroLevel', {
    _opt: {
      property: 'level',
    },

    events: {
      '+normalize_value': function (res, now) {
        return now + 1
      },
    },
  })

  // Outputs string hero class name (e.g. Knight) of a single hero.
  //
  // This is used in level-up and hero info/trade windows.
  H3Bits.HeroClass = Bits.ObjectRepresentationProperty.extend('HeroWO.H3.DOM.Bits.HeroClass', {
    _opt: {
      property: 'subclass',
    },

    events: {
      '+normalize_value': function (res, now) {
        return this.rules.heroClasses.atCoords(this.rules.heroes.atCoords(now, 0, 0, 'class', 0), 0, 0, 'name', 0)
      },
    },
  })

  // Displays graphics depending on a building's state in a town (can/cannot
  // be/already built).
  //
  // This is used in the Hall screen.
  H3Bits.TownBuildingState = Bits.Base.extend('HeroWO.H3.DOM.Bits.TownBuildingState', {
    _calc: null,
    _image: null,

    //> town `@ObjectRepresentation`@
    //> building Building->$id
    //> player Map.Player
    //> def null only update `'el's `'class; el can belong to another module`, string TPTHBAR/TPTHCHK
    _opt: {
      town: null,
      building: 0,
      player: null,
      def: null,  // do not set
    },

    events: {
      attach: function () {
        this._calc = this.updateOn(['change_value', 'change_canBuild', 'change_resource', 'change_require', 'change_special', 'change_townType'], Rules.TownBuildingState, {
          id: this.get('town').get('id'),
          building: this.get('building'),
          player: this.get('player'),
        })

        if (this.get('def')) {
          this._image = this.addModule(H3Bits.DefImage, {def: this.get('def')})
        }
      },

      _update: function () {
        var calc = this._calc.get()
        Common.oneClass(this.el, 'Hh3-bit-tbs_s_', calc.value)
        Common.oneClass(this.el, 'Hh3-bit-tbs_cb_', calc.canBuild ? 'yes' : 'no')
        Common.oneClass(this.el, 'Hh3-bit-tbs_tt_', calc.townType ? 'yes' : 'no')
        Common.oneClass(this.el, 'Hh3-bit-tbs_spec_', calc.special ? 'yes' : 'no')
        Common.oneClass(this.el, 'Hh3-bit-tbs_res_', calc.resource.length ? 'no' : 'yes')
        Common.oneClass(this.el, 'Hh3-bit-tbs_req_', calc.require.length ? 'no' : 'yes')

        this._image.el.show()
        switch (this.get('def')) {
          case 'TPTHBAR':
            switch (calc.value) {
              case 'built':
                return this._image.set('frame', 0)
              case 'able':
                return this._image.set('frame', 1)
              case 'unable':
                return this._image.set('frame', 2 + (!calc.townType || !calc.special))
            }
          case 'TPTHCHK':
            switch (calc.value) {
              case 'able':
                return this._image.el.hide()
              case 'built':
                return this._image.set('frame', 0)
              case 'unable':
                return this._image.set('frame', 1 + !!(calc.canBuild && calc.resource.length && !calc.require.length && calc.townType && calc.special))
            }
        }
      },
    },
  })

  // Outputs the number of towns having the particular level of Hall (or
  // its upgraded form).
  //
  // This is used in ADVMAP's right-side Kingdom overview panel.
  H3Bits.TownCountByHall = Bits.Value.extend('HeroWO.H3.Bits.TownCountByHall', {
    _calcClass: Rules.TownCountByHall,
    _calc: null,

    //> level int `- 0 (towns with no hall built), 1..4 (Hall..Capitol)
    _opt: {
      level: null,
    },

    events: {
      attach: function () {
        this._calc = this.updateOn(this._calcClass, {
          player: this.pl,
        })
      },

      change_level: 'update',

      _update: function () {
        this.set('value', this._calc.get('value')[this.get('level')])
      },
    },
  })

  // Outputs the number of towns having the particular level of Fort (or
  // its upgraded form).
  H3Bits.TownCountByFort = H3Bits.TownCountByHall.extend('HeroWO.H3.DOM.Bits.TownCountByFort', {
    _calcClass: Rules.TownCountByFort,
  })

  // Displays icon corresponding to current town's level of Hall (or
  // its upgraded form).
  //
  // This is used in ADVMAP's right-side Town overview panel.
  H3Bits.TownHallLevel = H3Bits.DefImage.extend('HeroWO.H3.DOM.Bits.TownHallLevel', {
    _buildings: null,
    _calc: null,

    _opt: {
      town: null,   // do not set
      large: false,
    },

    events: {
      attach: function () {
        this._buildings = this._buildings || this.rules.hallBuildings

        this._calc = this.updateOn(Rules.TownBuildingLevel, {
          id: this.get('town').get('id'),
          buildings: this._buildings,
        })
      },

      change_large: 'update',

      _update: function () {
        this.assignResp({
          def: 'ITMTL' + (this.get('large') ? '' : 'S'),
          frame: this._calc.get('value'),
        })
      },
    },
  })

  // Displays icon corresponding to current town's level of Fort (or
  // its upgraded form).
  H3Bits.TownFortLevel = H3Bits.TownHallLevel.extend('HeroWO.H3.DOM.Bits.TownFortLevel', {
    events: {
      '-attach': function () {
        this._buildings = this.rules.fortBuildings
      },

      '=_update': function () {
        var level = this._calc.get('value')
        this.assignResp({
          def: 'ITMCL' + (this.get('large') ? '' : 'S'),
          frame: level == -1 ? 3 : level,
        })
      },
    },
  })

  // Displays image corresponding to the town's class (e.g. Dungeon).
  //
  // This is used in town overview screen.
  H3Bits.TownBackground = H3Bits.Bitmap.extend('HeroWO.H3.DOM.Bits.TownBackground', {
    //> town `@ObjectRepresentation`@
    _opt: {
      town: null, // do not set
    },

    events: {
      attach: function () {
        this.autoOff(this.get('town'), {change_subclass: 'update'})
      },

      _update: function () {
        this.set('file', this.rules.towns.atCoords(this.get('town').get('subclass'), 0, 0, 'background', 0))
      },
    },
  })

  // Displays a list of player flags.
  //
  // This is used in ADVMAP's right-side Kingdom overview panel.
  H3Bits.PlayerList = Bits.PlayerList.extend('HeroWO.H3.DOM.Bits.PlayerList', {
    _childClass: [H3Bits, 'PlayerFlag'],
  })

  // Displays a single player's flag image.
  //
  // This is used in town overview's garrison list with no garrisoned hero.
  H3Bits.PlayerFlag = Bits.PlayerFlag.extend('HeroWO.H3.DOM.Bits.PlayerFlag', {
    _opt: {
      size: 15,   // 15, 38, 58; do not set
    },

    events: {
      attach: function () {
        var size = this.get('size')
        var value = this.rules.databank.players.atCoords(this.get('player').get('player'), 0, 0, 'image' + size, 0)
        if (value !== false) {
          var defs = {15: 'ITGFLAGS', 58: 'CREST58'}
          if (defs[size]) {
            this.addModule('image', H3Bits.DefImage, {
              def: defs[size],
              frame: value,
            })
          } else {
            this.addModule('image', H3Bits.Bitmap, {file: value})
          }
        }
      },
    },
  })

  // Displays list of hero's secondary skills.
  //
  // This is used in level-up and hero info/trade windows.
  H3Bits.SkillList = Bits.ObjectList.extend('HeroWO.H3.DOM.Bits.SkillList', {
    _childClass: 'Item',
  })

  // Displays list of hero's secondary skills provided by a `#Calculator.
  H3Bits.SkillList.Calculator = H3Bits.SkillList.extend('HeroWO.H3.DOM.Bits.SkillList.Calculator', {
    _calc: null,

    _opt: {
      object: 0,
      source: null,
    },

    events: {
      attach: function () {
        this._calc = this.updateOn(Calculator.Effect.GenericIntArray, {
          shared: false,
          target: this.rules.constants.effect.target.hero_skills,
          ifObject: this.get('object'),
        })
      },

      change_object: function (now) {
        this._calc && this._calc.set('ifObject', now)
      },

      change_source: 'update',

      _update: function () {
        var skills = this._calc.get('value')
        var src = this.get('source')

        // XXX=R duplicates with H3.Rules.RPC
        if (src) {
          // We should only display skills with certain sources to the user. For example, in hero info windows, user shouldn't see "bonus" skills coming from items, etc. (this seems logical at least, given SoD has no notion of bonus skills). There's no other reliable way to filter Effects - we have list of affectors but no info on which affector supplied which values. At the same time, re-evaluating only select affectors would give different result (imagine an affector does [$const, []] or [$intersect, [...]], we remove it and source=level skills that are not actually effective slip into evaluation). To not plunge into complex schemes, we could simply collect all skills provided by source=level and hide all hero's skills that are not part of this list.
          //
          // Anyway, filtering is not done for now (the only user of this class is HeroInfo which doesn't give source) because currently skills are coming from 3 sources: none (databank, Hero->$skills), map initialization (h3m2herowo.php) and level-ups. All three should appear in the hero info window and we don't have other sources yet.
          var atter = this.map.effects.atter(['source', 'modifier'])
          var seen = []
          this._calc.get('affectors').forEach(function (n) {
            var effect = atter(n, 0)
            if (src(effect.source)) {
              // Assuming the sources we're filtering on use strictly $const, $append, $intersect and such modifiers that have all skills in the same array as operation sans the first member.
              seen.push.apply(seen, [].concat(effect.modifier.slice(1)))
            }
          }, this)
          skills = _.intersection(skills, seen)
        }

        skills = skills.map(function (id) {
          return {
            id: this.get('object'),
            skill: id,
          }
        }, this)

        this.assignChildren(skills, {eqFunc: 'skill'})
      },
    },
  })

  // Displays a particular skill as part of a secondary skill list.
  H3Bits.SkillList.Item = Bits.ObjectList.Item.extend('HeroWO.H3.DOM.Bits.SkillList.Item', {
    _calc: null,

    _opt: {
      // Either id or mastery must be given. id enables dynamic mastery tracking for this object. If parent is SkillList.Calculator, it gives id automatically.
      id: 0,    // hero
      skill: 0,
      mastery: 0,
      // Inherited object is unused.
    },

    events: {
      attach: function () {
        this._calc = this.get('id') && this.updateOn(Calculator.Effect.GenericNumber, {
          shared: false,
          target: this.map.constants.effect.target.skillMastery,
          ifObject: this.get('id'),
          ifSkill: this.get('skill'),
        })

        this.addModule('face', H3Bits.SkillImage)

        // Using a module rather than a straightforward DOM node to allow
        // sinking of elClass and others from SkillList to Item.
        this.addModule('mastery', Bits.Value)

        this.addModule('name', H3Bits.DatabankProperty, {
          collection: 'skills',
          property: 'name',
        })
      },

      change_id: function (now) {
        this._calc && this._calc.set('ifObject', now)
      },

      change_skill: function (now) {
        this._calc && this._calc.set('ifSkill', now)
        this.update()
      },

      change_mastery: 'update',

      _update: function () {
        var mastery = this._calc ? this._calc.get('value') : this.get('mastery')

        this.nested('face').assignResp({
          skill: this.get('skill'),
          mastery: mastery,
        })

        var masteryName = _.fromEntries([
          [this.map.constants.skill.mastery.basic, this.cx.s('map', 'Basic')],
          [this.map.constants.skill.mastery.advanced, this.cx.s('map', 'Advanced')],
          [this.map.constants.skill.mastery.expert, this.cx.s('map', 'Expert')],
        ])

        this.nested('mastery').set('value', masteryName[mastery])
        this.nested('name').set('entity', this.get('skill'))
      },
    },
  })

  // Displays list of garrisoned creatures.
  //
  // This is used in town screen and hero info/trade windows.
  H3Bits.GarrisonList = Bits.GarrisonList.extend('HeroWO.H3.DOM.Bits.GarrisonList', {
    _childClass: 'Item',
    _childEvents: ['=showTooltip'],

    _opt: {
      selectable: true,  // do not change
    },

    events: {
      '+.+normalize_selected': function ($1, slot, $2, value) {
        return value && this.get('selectable')
      },

      '.=showTooltip': function (slot, sup) {
        if (this.get('selectable') || !this.cx.get('classic')) {
          return sup(slot, arguments)
        }
      },
    },
  })

  // Displays a particular creature as part of a garrison.
  H3Bits.GarrisonList.Item = Bits.GarrisonList.Item.extend('HeroWO.H3.DOM.Bits.GarrisonList.Item', {
    _image: null,

    _opt: {
      garrison: null, // for CreatureInfo
      details: null,  // constants.effect.garrisonDetails; null = full; do not change
    },

    events: {
      '+normalize_count': function ($, count) {
        if (typeof count == 'number') {
          switch (this.get('details')) {
            case this.cx.map.constants.effect.garrisonDetails.list:
              return ''
            case this.cx.map.constants.effect.garrisonDetails.approximate:
              // XXX=R duplicates with H3.DOM.UI
              var texts = {
                5:    'Few',
                10:   'Several',
                20:   'Pack',
                50:   'Lots',
                100:  'Horde',
                250:  'Throng',
                500:  'Swarm',
                1000: 'Zounds',
              }
              return this.cx.s('map', _.find(texts, function ($, max) { return count < max }) || 'Legion')
          }
        }
      },

      owned: function () {
        // normalize_count could have been called before _opt.details was assigned.
        this.getSet('count')
        this._image = this.addModule('face', H3Bits.CreatureImage)
      },

      _update: function () {
        // Display arbitrary creature's image in empty slots to avoid having to
        // supply exact dimensions in CSS. This image will be hidden in CSS.
        this._image.set('creature', this.isEmpty() ? _.first(this.rules.creaturesID) : this.get('creature'))
      },

      clicked: function () {
        if (this.get('selected')) {
          this._makeCreatureInfo({})
            .on('-unnest', function () {
              this.set('selected', false)
            }, this)
        }
      },

      showTooltip: function () {
        if (!this.isEmpty()) {
          this._makeCreatureInfo({
            tooltip: true,
            closeButton: false,
            dismissButton: false,
            animated: false,
          })
        }
      },
    },

    _makeCreatureInfo: function (options) {
      if (this.get('details') == null ||
          this.get('details') === this.map.constants.effect.garrisonDetails.full) {
        options.garrison = this.get('garrison')
        options.garrisonSlot = this.get('slot')
      }

      return this.sc.modules.nested('HeroWO.H3.DOM.UI').showCreatureInfo(_.extend({
        creature: this.get('creature'),
      }, options))
    },
  })

  // Extends generic container for UI dialogs and screens with `'H3-specific CSS classes and features.
  H3Bits.Windows = Bits.Windows.extend('HeroWO.H3.DOM.H3Bits.Windows', {
    _opt: {
      minZ: 50,
    },

    events: {
      init: function () {
        this.el.addClass('Hh3-win')
        this._bk.addClass('Hh3-win__bk')
      },

      _repos: function () {
        var first = this.first()

        if (first && first.constructor.name == 'HeroWO.H3.DOM.UI.AdventureMap') {
          // This z-index clearing and minZ are yet more hacks to support the whacky DOM.Map. Stuff like edge bars, mapcor and combat list should appear on top of adventure map objects and grid (provided by DOM.Map) but they are outside of this.el (due to the large number of nodes that hinter className updates). Normally, because AdventureMap is a Window its this.el will have a z-index (of 0, since it's the first Window created) meaning its content either fully overlay nodes with lower z-index or fully underlay those with higher z-index. However, DOM.Map's el must overlay the empty area inside AM while other AM elements must overlay DOM.Map.
          //
          // This could be worked around by moving nodes that should overlay DOM.Map out of AM but that's part of the presentation level and must be done with CSS whenever possible. The workaround we use is removing z-index from AM and reserving certain z-index range (1..minZ) for z-index of AM's children that they may use to overlay DOM.Map.
          first.el.css('zIndex', '')
        }
      },

      change_shade: function (now) {
        this.el.toggleClass('Hh3-win_shade', now)
      },

      change_shadeCloses: function (now) {
        this.el.toggleClass('Hh3-win_shade-closes', now)
      },

      change_topModal: function (now, old) {
        old && old.el.removeClass('Hh3-win__win_top-modal')
        now && now.el.addClass('Hh3-win__win_top-modal')
        this.el.toggleClass('Hh3-win_modal', !!now)
      },

      change_hasTooltips: function (now) {
        now = now && this.every(function (c) { return !c.get('tooltip') || c.get('modal') })
        this.el.toggleClass('Hh3-win_tooltips', now)
      },

      change_topNonTooltipModal: function (now) {
        // Tooltips are short-lived windows; show shade only for non-tooltip
        // modals to minimize contrasting flashes.
        Common.oneClass(this._bk, 'Hh3-win__bk_transp_', now ? 'no' : 'yes')
      },
    },
  })

  // Extends generic UI dialog or screen with `'H3-specific CSS classes and features.
  H3Bits.Window = Bits.Window.extend('HeroWO.H3.DOM.Bits.Window', {
    //> audio null`, str `- Only if this window may become topModal in Windows. May be set before or during that time. Is unset after playing. Will be terminated when this window closes (but not if it ceases to be topModal).
    //> audioLinger null true if classic, else false`, true don't terminate the sound when this window closes`, false `- Isn't unset when `'audio finishes playing.
    _opt: {
      audio: null,
      audioLinger: null,
    },

    events: {
      init: function () {
        this.el.addClass('Hh3-win__win')
        this.el.toggleClass('Hh3-win__win_fs', this.get('fullScreen'))
      },

      change_overlaid: function (now) {
        this.el.toggleClass('Hh3-win__win_overlaid', now)

        // SoD pauses animations whenever there is a dialog (be it persistent or transient caused by RMB).
        if (!this.sc.get('mapDragging')) {
          var ui = this.sc.modules.nested('HeroWO.DOM.UI')
          ui.pauseAnimations(now)
        }
      },
    },
  })

  // Displays a generic message window, composed of text, `#Button-s, `#Table-s
  // and any other `'Bit-s, often defined by a format string (`#addFromMarkup()).
  //
  // The message box starts empty. Fill it with desired content by calling
  // `#addText(), `'addModule() and other methods in display order. `'...This()
  // methods allow chaining (`#addModuleThis(), etc.).
  //
  // XXX=I support SoD help bar here and in all other windows/screens
  //
  // XXX+R add helper methods to quickly build MessageBox'es with frequently used layouts (e.g. OK/Cancel)
  H3Bits.MessageBox = H3Bits.Window.extend('HeroWO.H3.DOM.Bits.MessageBox', {
    el: {class: 'Hh3-msg'},
    _buttons: null,

    //> button null`, object `#Button `- set to the clicked button added via
    //  `#addButton() before calling `#addButton()'s `'func; for example, use this to determines
    //  a "Yes" or "No" was chosen
    //> selected null`, object SelectableIcons.Item `- available if `#addSelectableWithButtons() was called
    _opt: {
      center: true,
      button: null,
      selected: null,
    },

    // function ([cls,] str [, ...fmt])
    // Adds a plain text `[<p>`]aragraph `'str styled like `'cls.
    //> cls str CSS class name`, missing use `'toned `'text11
    //> str str `- either raw text or a `#format string, if `'fmt is given
    //> fmt mixed `- `#format arguments
    //= this
    addText: function (cls, str, fmt_1) {
      if (cls.indexOf('__') == -1) {
        Array.prototype.unshift.call(arguments, 'Hh3-menu__text11 Hh3-menu__text_toned')
      }
      $('<p>')
        .addClass(arguments[0])
        .text(arguments.length > 2 ? _.format.apply(null, _.rest(arguments)) : arguments[1])
        .appendTo(this.el)
      return this
    },

    // function ([cls, [func, [cx]]])
    // Adds a `'cls `#Button to the button bar (creating it if none) that
    // calls `'func on click.
    //> cls missing `'...IOKAY`, string
    //> func missing submit + cancel`, string method on `'cx`, function `-
    //  if function, calls when clicked, else removes window on click and on
    //  that method (e.g. `'submit), or on both `'submit and `'cancel - this
    //  means the method(s) are no longer on-close handlers and you should hook
    //  the button's `'remove if you want to alter `#MessageBox operation
    //> cx missing `'this`, object `- only used if `'func is a function
    //= object `#Button
    // Unlike other methods, `#addButton() fills the same bar Element with all buttons no matter when it's called.
    // First `#addButton() call specifies where that bar appears while subsequent
    // calls only affect button order within that bar, not within other `#MessageBox' children.
    //
    // When user clicks this button, `[_opt.button`] is changed and `'func is called.
    //
    // If `'func is a string, `[this[func]`] is overridden to act
    // as a click on this button. For example, `[mbox.addButton('submit')`]
    // creates a "submit" button that is triggered by either user clicking it or
    // by `[window.submit()`] (which is called in response to the Enter hotkey).
    //
    // If `'func is missing, the button handles both `'submit and `'cancel (Escape).
    //?`[
    //    addButton()     // default OK button for submit and cancel + close
    //    addButton('', 'submit')   // default OK button only for submit + close
    //    addButton('Hh3-btn_id_ICANCEL', 'cancel')  // button for cancel + close
    //    addButton('', () => alert('Nah!'))  // default OK, alerts and stays
    // `]
    addButton: function (cls, func, cx) {
      this._buttons || (this._buttons = $('<div class=Hh3-msg__btns>').appendTo(this.el))
      var btn = this.addModule(H3Bits.Button, {
        elClass: 'Hh3-msg__btn Hsfx__btn ' + (cls || 'Hh3-btn_id_IOKAY'),
        attachPath: this._buttons,
      })
        .on({clicked: function () { this.set('button', btn) }}, this)
      if (!func || typeof func == 'string') {
        btn.on({clicked: 'remove'}, this)
        this.on(_.object(['=' + (func || 'submit, =cancel')], ['clicked-']), btn)
      } else {
        btn.on({clicked: func}, cx || this)
      }
      return btn
    },

    // Adds a button and returns `'this.
    //#-addButton
    addButtonThis: function () {
      this.addButton.apply(this, arguments)
      return this
    },

    // Adds a `#Module and returns `'this.
    //#-addModule
    //?`[
    //  var row = msg.addModule(MessageBox.Table)
    //    .addModule(MessageBox.Table, {el: {tag: 'tr'}})
    //  row.addModule(MessageBox.Table, {el: {tag: 'td'}})
    //    .el.text('C1')
    //  row.addModule(MessageBox.Table, {el: {tag: 'td'}})
    //    .el.text('c2')
    // `]
    addModuleThis: function () {
      this.addModule.apply(this, arguments)
      return this
    },

    // Adds a list of items (usually icons with text) where exactly one may be selected. Adds an OK button that submits this dialog (disabled if no item is selected, as it initially is).
    //= SelectableIcons
    // Client may dynamically add/remove items, change `'selected, etc.
    //
    // When an item is selected, `[_opt.selected`] is set to reflect this fact.
    addSelectableWithButtons: function () {
      var icons = this.addModule(H3Bits.MessageBox.SelectableIcons, {
        elClass: 'Hh3-msg__sel',
        sink: {'*': {elClass: this._inlineBox().attr('class')}},
      })
        .on({
          '.change_selected, nestExNew, unnested': function () {
            ok.set('disabled', !this.hasCurrent())
          },
        })

      var ok = this.addButton('', 'submit')
        .set('disabled', true)

      ok.on('-clicked', function () {
        this.set('selected', icons.current())
      }, this)

      return icons
    },

    // Adds custom content (textual and not) based on a marked-up string.
    //
    //> str `- marked-up string
    //> options object `- keys: `'hero (ID), `'bonus (ID), `'effects (array [`'addedEffects, all Effects' `'n]), `'checks, `'bonuses in GenericEncounter's format; this object may be mutated (but objects it references may not be)
    //
    //# Markup format
    // Paragraphs (blocks of text - headlines, etc.) are separated by one or more blank lines. Line breaks within a paragraph are folded using one space.
    //
    // Markup format is inspired by Chemdoc where all special sequences begin with a backtick (``) followed by a special symbol (e.g. `[#`]). Double backtick (````) stands for itself. Unrecognized sequences are left as is. Valid symbols:
    //
    //> ``# `- Gold-colored headline. `'# is the largest, `'##### is the smallest. `'## is SoD's headline style (`'### is the same size but not bold).
    //> ``< and ``> `- Box positioned on one line with other boxes. The content is usually an image (created using ``{ ``}) with optional caption.
    //> ``{ and ``} `- Substitution (variable). Format of text in between: `[Function arg1``, arg2...`]. `'arg-s are optional. Valid `'Function-s:
    //  `> Audio `- sets `#Window's `'audio played when window gets user's attention; `'arg1 = file name/URL (prefix with `'= to stop the sound playing when window is closed, with `'~ to keep it until it plays through, else use the previously set value or the default based on classic mode), if `'arg2 is given, `'arg1 becomes subject to `#format() with a single numeric argument: random number from 0 to `'arg2 or from `'arg2 to `'arg3 (if given), inclusive
    //  `> Checks `- creates a string of `'quest_fulfilled checks (if `'arg1 is given then keeps only met or unmet)
    //  `> ChecksImages `- fills the line with boxes, one per each `'quest_fulfilled check, each box with an image and caption (accepts `'arg1 as `'Checks)
    //  `> Bonuses `- creates a string from `'bonus_... Effects; includes negative bonuses (like resources charged, with negative sign)
    //  `> BonusesImages `- fills the line with boxes: images and captions of `'bonus_... Effects
    //  `> StatImage `- `'arg1 = key in `[constants.stats`]
    //  `> LuckImage `- `'arg1 = -3..+3 ($encounterLabel)
    //  `> MoraleImage `- as `'LuckImage
    //  `> SpellImage `- creates a box with image and caption; `'arg1 = Spell->$id ($encounterLabel)
    //  `> SkillImage `- `'arg1 = Skill->$id ($encounterLabel), `'arg2 = key in `[constants.skills.mastery`]
    //  `> ArtifactImage `- `'arg1 = Artifact->$id ($encounterLabel)
    //  `> CreatureImage `- `'arg1 = Creature->$id ($encounterLabel)
    //  `> ResourceImage `- creates a box; `'arg1 = key in `[constants.resources`], `'arg2 = caption (optional)
    //  `> Databank `- `'arg1 is name of databank collection (e.g. `'spells), `'arg2 is property, `'arg3-`'arg5 are X-Z ($encounterLabel; missing default to 0; special `'subclass stands for `'bonus' `'$subclass; special `'artifacts stands for first member in first `'bonuses' `'artifacts entry)
    //  `> HeroName `- `'name Effect value for `'hero
    //  `> SeerName `- as `'HeroName but for `'bonus (only applicable for Seer's Hut)
    //
    //  Some `'Function-s accept $encounterLabel string to locate any Effect created by `'bonus with this $encounterLabel suffix and use its $modifier (if it's an array - its last member) in place of the immediate value. First Effect created during this encounter is used, else any Effect of other encounter is used, else the `'Function stands for no content.
    //
    // Constructed message is static (doesn't update when world changes). If calling this from a transition, do so on the `'collect step rather than `'final or `'play.
    //
    // XXX revise margins of inline boxes; currently it depends on whitespace between them but it's not ideal and not all boxes are split by whitespace
    //
    // XXX=R uniformize all format functions to create boxes with captions (like SpellImage), not only images
    addFromMarkup: function (str, options) {
      options = options || {}

      var classes = {
        '`#':     'Hh3-menu__text_toned Hh3-menu__text2',
        // Hh3-menu__text4 is using font color #efd67b while SoD is using #efd77b.
        '`##':    'Hh3-menu__text_toned Hh3-menu__text4',
        '`###':   'Hh3-menu__text_toned Hh3-menu__text9',
        '`####':  'Hh3-menu__text_toned Hh3-menu__text1',
        '`#####': 'Hh3-menu__text_toned Hh3-menu__text12',
        '':       'Hh3-menu__text_toned Hh3-menu__text11',
      }

      str.split(/(?:\r?\n){2,}/).forEach(function (line) {
        line = line.replace(/\s*\r?\n\s*/g, ' ')

        var root = $('<p>')
        var el = root
        var type = ''
        var func    // null outside of `{ `}, array of str args

        line.split(/(`#+|`[`<>{},])/g).forEach(function (token, i) {
          if (i % 2) {
            switch (token[1]) {
              case '#':
                return type = token
              case '`':
                token = token.substr(1)
                if (func) { break }
                return el.append(token)
              case '<':
                if (func) { break }
                return el = el.add(this._inlineBox())
                  .last()
                  .appendTo(el).end()
              case '>':
                if (func) { break }
                if (!el.end()[0]) {
                  _.log && _.log('Unmatched `>.')
                } else {
                  el = el.end().end()
                }
                return
              case '{':
                if (func) {
                  throw new Error('Nested `{Functions`} not supported.')
                }
                return func = ['']
              case ',':
                if (!func) {
                  _.log && _.log('The `, appears outside of `{Function`}.')
                  el.append(token)
                } else {
                  func.push('')
                }
                return
              case '}':
                if (!func) {
                  _.log && _.log('The `} appears outside of `{Function`}.')
                  return el.append(token)
                }
                func[0] = func[0].replace(/\s.+$/, function (arg) {
                  func.splice(1, 0, arg)
                  return ''
                })
                if (this[options.func = '_markUp_' + func.shift().trim()]) {
                  this[options.func](_.invoke(func, 'trim'), el, options)
                } else {
                  _.log && _.log('Unknown `{Function`} "' + options.func + '".')
                }
                return func = null
            }
          }
          if (func) {
            func[func.length - 1] += token
          } else {
            el.append(document.createTextNode(token))
          }
        }, this)

        if (el.end()[0]) {
          _.log && _.log('Unmatched `<.')
        }
        if (func) {
          _.log && _.log('Unmatched `{.')
        }

        if (/\S/.test(root.html())) {
          root
            .addClass(classes[type])
            .appendTo(this.el)
        }
      }, this)
    },

    _inlineBox: function () {
      return $('<div class="Hh3-msg__inline Hh3-menu__text3 Hh3-menu__text_toned">')
    },

    _markUp_Audio: function (args, el, options) {
      switch (args[0][0]) {
        case '=':
        case '~':
          this.set('audioLinger', args[0][0] == '~')
          args[0] = args[0].substr(1)
      }
      if (args.length > 1) {
        this.set('audio', _.format(args.shift(), _.random.apply(_, args)))
      } else {
        this.set('audio', args[0])
      }
    },

    _markUp_Checks: function (args, el, options) {
      var texts = []

      _.each(options.checks || [], function (check) {
        if (args[0] == null || !!args[0] == check[1]) {
          var text = this._checkText(check)
          text == null || texts.push(text)
        }
      }, this)

      for (var i = 0; i < texts.length - 1; i++) {
        texts[i] += this.cx.s('map', i == texts.length - 2 ? ' and ' : ', ')
      }

      el.append(document.createTextNode(texts.join('')))
    },

    _markUp_ChecksImages: function (args, el, options) {
      _.each(options.checks || [], function (check) {
        if (args[0] == null || !!args[0] == check[1]) {
          var box = this._inlineBox().appendTo(el.append(' '))

          switch (check[0]) {
            case 'spellPointsMax':
              this.addModule(H3Bits.StatImage, {
                attachPath: box,
                size: 82,
                stat: this.rules.constants.stats.spellPoints,
              })
              break
            case 'defeat':
              if (this.map.objects.atCoords(check[2], 0, 0, 'type', 0) == this.map.constants.object.type.monster) {
                this.addModule(H3Bits.CreatureImage, {
                  attachPath: box,
                  creature: this.map.objects.atCoords(check[2], 0, 0, 'subclass', 0),
                  type: 'large',
                })
                var count = 0
                // Assuming garrison is initialized or if not then it will be plural.
                this.map.objects.readSubAtCoords(check[2], 0, 0, 'garrison', 0)
                  .find('count', function (cur) {
                    count += cur
                  })
                var name = this.rules.creatures.atCoords(this.map.objects.atCoords(check[2], 0, 0, 'subclass', 0), 0, 0, count == 1 ? 'nameSingular' : 'namePlural', 0)
                box.append(document.createTextNode(name))
              }
              // SoD shows no image for other object types (hero).
              return
            case 'garrison':
              this.addModule(H3Bits.CreatureImage, {
                attachPath: box,
                creature: check[4],
                type: 'large',
              })
              break
            case 'artifact':
              var spell = this.rules.artifacts.atCoords(check[2], 0, 0, 'spell', 0)
              if (spell === false) {
                this.addModule(H3Bits.ArtifactImage, {
                  attachPath: box,
                  artifact: check[2],
                })
              } else {
                this.addModule(H3Bits.SpellImage, {
                  attachPath: box,
                  type: 'SCR',
                  spell: spell,
                })
              }
              var name = this.rules.artifacts.atCoords(check[3], 0, 0, 'name', 0)
              return box.append(document.createTextNode(name))
            case 'level':
              this.addModule(H3Bits.StatImage, {
                attachPath: box,
                size: 82,
                stat: this.rules.constants.stats.experience,
              })
              var max = check[2][1]
              max == null || max++
              return box.append(document.createTextNode(this._rangeText(check[2][0] + 1, max, '%d only', '%d-%d', '%d')))
            case 'attack':
            case 'defense':
            case 'spellPower':
            case 'knowledge':
              this.addModule(H3Bits.StatImage, {
                attachPath: box,
                size: 82,
                stat: this.rules.constants.stats[check[0]],
              })
              // SoD says "Skill #" in text and "# Skill" in caption. For simplicity, we show "Skill #" everywhere.
              break
            case 'skill':
              this.addModule(H3Bits.SkillImage, {
                attachPath: box,
                size: 82,
                skill: check[4],
                mastery: Math.max(check[2][0] || 0, this.map.constants.skill.mastery.basic),
              })
              break
            default:
              if (check[0].match(/^resources_/)) {
                this.addModule(H3Bits.Resource, {
                  attachPath: box,
                  resource: this.map.constants.resources[check[0].substr(10)],
                  count: this._rangeText(check[2][0], check[2][1], '%d only', '%d-%d', '%d'),
                  icon: 'RESOUR82',
                })
                return
              } else {
                return box.remove()
              }
          }

          box.append(document.createTextNode(this._checkText(check)))
        }
      }, this)
    },

    _checkText: function (check) {
      switch (check[0]) {
        case 'spellPointsMax':
          return this._rangeText(check[2][0], check[2][1], 'exactly %d spell points', '%d-%d spell points', '%d spell points')
        case 'defeat':
          if (!check[1]) {
            var obj = this.map.objects.atter(['type', 'class', 'subclass', 'x', 'y', 'z'])(check[2], 0, 0, 0)
            switch (obj.type) {
              case this.map.constants.object.type.hero:
              case this.map.constants.object.type.town:
                return this.cx.oneShotEffectCalculation({
                  class: Calculator.Effect.GenericString,
                  target: this.map.constants.effect.target.name,
                  ifObject: check[2],
                })
              case this.map.constants.object.type.monster:
                // Garrison may not be initialized yet. In this case assume plural count.
                var count = 0
                this.map.objects.readSubAtCoords(check[2], 0, 0, 'garrison', 0)
                  .find('count', function (cur) {
                    count += cur
                  })
                var name = this.rules.creatures.atCoords(obj.subclass, 0, 0, count == 1 ? 'nameSingular' : 'namePlural', 0)
                var size = this.map.sizeWithoutMargin()
                var region = this.cx.s('map', obj.y < size.height / 2 ? 'north' : 'south') +
                             this.cx.s('map', obj.x < size.width / 2 ? 'western' : 'eastern')
                return _.format(this.cx.s('map', 'the %s in the %s%s region'), name, obj.z ? this.cx.s('map', 'underground ') : '', this.cx.s('map', region))
              default:
                return this.rules.classes.atCoords(obj.class, 0, 0, 'name', 0)
            }
          }
          return
        case 'garrison':
          var name = this.rules.creatures.atCoords(check[4], 0, 0, check[2][0] == 1 ? 'nameSingular' : 'namePlural', 0)
          return this._rangeText(check[2][0], check[2][1], 'exactly %d %s', '%d-%d %s', '%d %s', name)
        case 'artifact':
          var name = this.rules.artifacts.atCoords(check[2], 0, 0, 'name', 0)
          return _.format(this.cx.s('map', 'the %s'), name)
        case 'level':
          var max = check[2][1]
          max == null || max++
          return this._rangeText(check[2][0] + 1, max, 'exactly %d experience level', '%d-%d experience level', 'experience level %d')
        case 'attack':
        case 'defense':
        case 'spellPower':
        case 'knowledge':
          var name = Common.capitalize(check[0])
          return this._rangeText(check[2][0], check[2][1], _.format(this.cx.s('map', '%s exactly %%d'), name), _.format(this.cx.s('map', '%s %%d-%%d'), name), _.format(this.cx.s('map', '%s %%d'), name))
        case 'skill':
          var min = _.indexOf(this.map.constants.skill.mastery, check[2][0])
          min = Common.capitalize(min == -1 ? 'no' : min)
          var max = _.indexOf(this.map.constants.skill.mastery, check[2][1])
          max = Common.capitalize(max == -1 ? 'no' : max)
          var name = this.rules.skills.atCoords(check[4], 0, 0, 'name', 0)
          return this._rangeText(check[2][0], check[2][1], _.format(this.cx.s('map', 'exactly %s %%s', min), _.format(this.cx.s('map', '%s to %s %%s'), min, max), _.format(this.cx.s('map', '%s %%s'), min), name))
        case 'skillCount':
          return this._rangeText(check[2][0], check[2][1], 'exactly %d skills', '%d to %d skills', '%d skills')
        default:
          if (check[0].match(/^resources_/)) {
            var name = Common.capitalize(check[0].substr(10))
            return this._rangeText(check[2][0], check[2][1], _.format(this.cx.s('map', 'exactly %%d %s'), name), _.format(this.cx.s('map', '%%d-%%d %s'), name), _.format(this.cx.s('map', '%%d %s'), name))
          }
      }
    },

    _rangeText: function (min, max, exact, range, above) {
      var args = _.rest(arguments, 5)
      return max == null ? _.format.apply(_, [this.cx.s('map', above), min].concat(args))
        : min == max ? _.format.apply(_, [this.cx.s('map', exact), min].concat(args))
        : _.format.apply(_, [this.cx.s('map', range), min, max].concat(args))
    },

    _markUp_Bonuses: function (args, el, options) {
      var texts = []

      _.each(options.bonuses && options.bonuses.players || [], function (bonuses, player) {
        _.each(bonuses, function (value, type) {
          switch (type) {
            default:
              if (type.match(/^resources_/)) {
                return texts.push(_.format(this.cx.s('map', '%d %s'), value, Common.capitalize(type.substr(10))))
              }
          }
        }, this)
      }, this)

      _.each(options.bonuses && options.bonuses.heroes || [], function (bonuses, hero) {
        _.each(bonuses, function (value, type) {
          switch (type) {
            case 'experience':
              return texts.push(_.format(this.cx.s('map', '%d experience points'), value))
            case 'spellPoints':
              return texts.push(_.format(this.cx.s('map', '%d spell points'), value))
            case 'artifacts':
              _.each(value, function (value, i) {
                var name = this.rules.artifacts.atCoords(value, 0, 0, 'name', 0)
                texts.push(_.format(i ? '%s' : this.cx.s('map', 'the %s'), name))
              }, this)
              return
            case 'creatures':
              _.each(value, function (count, cr) {
                var name = this.rules.creatures.atCoords(cr, 0, 0, count == 1 ? 'nameSingular' : 'namePlural', 0)
                texts.push(_.format(this.cx.s('map', '%d %s'), count, name))
              }, this)
              return
            // XXX+I: mmrl: morale, luck (sign() in classic), atk/def/knw/spp ("+# Defense [Skill]"), skill ("Advanced Wisdom"), spell
          }
        }, this)
      }, this)

      // XXX=R duplicates with `{Checks`}
      for (var i = 0; i < texts.length - 1; i++) {
        texts[i] += this.cx.s('map', i == texts.length - 2 ? ' and ' : ', ')
      }

      el.append(document.createTextNode(texts.join('')))
    },

    _markUp_BonusesImages: function (args, el, options) {
      _.each(options.bonuses && options.bonuses.players || [], function (bonuses, player) {
        _.each(bonuses, function (value, type) {
          var box = this._inlineBox().text(' ').appendTo(el.append(' '))

          switch (type) {
            default:
              if (type.match(/^resources_/)) {
                this.addModule(H3Bits.Resource, {
                  attachPath: box,
                  resource: this.map.constants.resources[type.substr(10)],
                  count: value,
                  icon: 'RESOUR82',
                })
                return
              } else {
                return box.remove()
              }
          }
        }, this)
      }, this)

      _.each(options.bonuses && options.bonuses.heroes || [], function (bonuses, hero) {
        _.each(bonuses, function (value, type) {
          var box = this._inlineBox().text(' ').appendTo(el.append(' '))

          switch (type) {
            case 'experience':
              this.addModule(H3Bits.StatImage, {
                attachPath: box,
                size: 82,
                stat: this.rules.constants.stats.experience,
              })
              break
            case 'spellPoints':
              this.addModule(H3Bits.StatImage, {
                attachPath: box,
                size: 82,
                stat: this.rules.constants.stats.spellPoints,
              })
              return box.append(document.createTextNode(_.format(this.cx.s('map', '%d Spell Points'), value)))
            case 'artifacts':
              _.each(value, function (value) {
                var spell = this.rules.artifacts.atCoords(value, 0, 0, 'spell', 0)
                if (spell === false) {
                  this.addModule(H3Bits.ArtifactImage, {
                    attachPath: box,
                    artifact: value,
                  })
                } else {
                  this.addModule(H3Bits.SpellImage, {
                    attachPath: box,
                    type: 'SCR',
                    spell: spell,
                  })
                }
                var name = this.rules.artifacts.atCoords(value, 0, 0, 'name', 0)
                box.append(document.createTextNode(name))
                box = this._inlineBox().text(' ').appendTo(el.append(' '))
              }, this)
              return box.remove()
            case 'creatures':
              _.each(value, function (count, cr) {
                this.addModule(H3Bits.CreatureImage, {
                  attachPath: box,
                  creature: +cr,
                  type: 'large',
                })
                var name = this.rules.creatures.atCoords(cr, 0, 0, count == 1 ? 'nameSingular' : 'namePlural', 0)
                box.append(document.createTextNode(_.format(this.cx.s('map', '%d %s'), count, name)))
                box = this._inlineBox().text(' ').appendTo(el.append(' '))
              }, this)
              return box.remove()
            // XXX+:mmrl:
            default:
              return box.remove()
          }

          box.append(document.createTextNode(value))
        }, this)
      }, this)
    },

    _markUp_StatImage: function (args, el, options) {
      this.addModule(H3Bits.StatImage, {
        attachPath: el,
        size: 82,
        stat: this.rules.constants.stats[args[0]],
      })
    },

    _markUp_LuckImage: function (args, el, options) {
      var value = this._effectValue(options.effects, args[0])
      if (!isNaN(value)) {
        // In non-classic mode show one icon with the frame according to the modifier (e.g. -2, 0, +3).
        //
        // In classic mode show N icons where N = modifier (one icon if it's 0).
        //
        // If showing luck, each icon shows either 0 value (if the modifier is 0
        // or below) or +1 (if positive). If morale, icons show -1, 0 or +1
        // values. Exception: in non-classic mode negative luck is still shown
        // as multiple images since we (SoD) lack negative images for now (XXX).
        var isLuck = options.func == '_markUp_LuckImage'
        if (this.cx.get('classic') || (isLuck && value < 0)) {
          _.times(Math.abs(value) || 1, function () {
            this.addModule(H3Bits.DefImage, {
              attachPath: el,
              def: isLuck ? 'ILCK82' : 'IMRL82',
              frame: 3 + (isLuck ? value > 0 : _.sign(value)),
            })
          }, this)
        } else {
          this.addModule(H3Bits.DefImage, {
            attachPath: el,
            def: isLuck ? 'ILCK82' : 'IMRL82',
            frame: 3 + value,
          })
        }
      }
    },

    _markUp_MoraleImage: function (args, el, options) {
      return this._markUp_LuckImage.apply(this, arguments)
    },

    _effectValue: function (effects, label) {
      if (!isNaN(label)) {
        return +label
      }

      var all = effects[1] || []
      var n
      label = new RegExp('^\\d+\\.' + _.escapeRegExp(label) + '$')

      for (var i = 0; i < all.length; i++) {
        if (label.test(this.map.effects.atContiguous(all[i] + this.map.effects.propertyIndex('encounterLabel'), 0))) {
          n = all[i]
          if ((effects[0] || []).indexOf(n) != -1) {
            break
          }
        }
      }

      if (n != null) {
        var mod = this.map.effects.atContiguous(n + this.map.effects.propertyIndex('modifier'), 0)
        return _.isArray(mod) ? _.last(mod) : mod
      }
    },

    _markUp_SpellImage: function (args, el, options) {
      var value = this._effectValue(options.effects, args[0])
      if (!isNaN(value)) {
        var box = this._inlineBox().appendTo(el)
        this.addModule(H3Bits.SpellImage, {
          attachPath: box,
          type: 'SCR',
          spell: value,
        })
        box.append(document.createTextNode(this.rules.spells.atCoords(value, 0, 0, 'name', 0)))
      }
    },

    _markUp_SkillImage: function (args, el, options) {
      var value = this._effectValue(options.effects, args[0])
      if (!isNaN(value)) {
        this.addModule(H3Bits.SkillImage, {
          attachPath: el,
          size: 82,
          skill: value,
          mastery: this.map.constants.skill.mastery[args[1]],
        })
      }
    },

    _markUp_ArtifactImage: function (args, el, options) {
      var value = this._effectValue(options.effects, args[0])
      if (!isNaN(value)) {
        this.addModule(H3Bits.ArtifactImage, {
          attachPath: el,
          artifact: value,
        })
      }
    },

    _markUp_CreatureImage: function (args, el, options) {
      var value = this._effectValue(options.effects, args[0])
      if (!isNaN(value)) {
        this.addModule(H3Bits.CreatureImage, {
          attachPath: el,
          creature: value,
          type: 'large',
        })
      }
    },

    _markUp_ResourceImage: function (args, el, options) {
      this.addModule(H3Bits.Resource, {
        attachPath: this._inlineBox().appendTo(el),
        resource: this.map.constants.resources[args[0]],
        count: args[1] == null ? '' : args[1],
        icon: 'RESOUR82',
      })
    },

    _markUp_Databank: function (args, el, options) {
      var resolve = function (value) {
        value = args[value]
        if (value == null) {
          return 0
        } else if (!isNaN(value)) {
          return +value
        } else if (value == 'subclass') {
          return options.bonus ? this.map.objects.atCoords(options.bonus, 0, 0, 'subclass', 0) : NaN
        } else if (value == 'artifacts') {
          var res = NaN
          _.some(options.bonuses && options.bonuses.heroes || [], function (bonuses) {
            if ((bonuses.artifacts || []).length) {
              res = bonuses.artifacts[0]
              return true
            }
          })
          return res
        } else {
          return this._effectValue(options.effects, value)
        }
      }.bind(this)

      var x = resolve(2)
      var y = resolve(3)
      var z = resolve(4)

      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        el.append(document.createTextNode(this.rules[args[0]].atCoords(x, y, z, args[1], 0)))
      }
    },

    _markUp_HeroName: function (args, el, options) {
      var id = options.func == '_markUp_HeroName' ? options.hero : options.bonus
      if (id) {
        var value = this.cx.oneShotEffectCalculation({
          class: Calculator.Effect.GenericString,
          target: this.map.constants.effect.target.name,
          ifObject: id,
        })
        el.append(document.createTextNode(value))
      }
    },

    _markUp_SeerName: function (args, el, options) {
      return this._markUp_HeroName.apply(this, arguments)
    },
  })

  // Simple wrapper around a `[<table>`] node for a `#MessageBox.
  //
  // Create `'tr/`'td by giving `[{el: {tag: 'tr|td'}}`] to `'addModule().
  H3Bits.MessageBox.Table = Bits.Base.extend('HeroWO.H3.DOM.Bits.MessageBox.Table', {
    el: {tag: 'table'},
  })

  // Container of items that can be selected. Created by `#addSelectableWithButtons().
  H3Bits.MessageBox.SelectableIcons = Bits.ObjectList.extend('HeroWO.H3.DOM.Bits.MessageBox.SelectableIcons', {
    _childClass: 'Item',

    events: {
      '-init': function (opt) {
        opt.slider = opt.slider || {}
        'requireCurrent' in opt.slider || (opt.slider.requireCurrent = false)
      },
    },
  })

  // Single item that can be selected in a list created by `#addSelectableWithButtons().
  H3Bits.MessageBox.SelectableIcons.Item = Bits.ObjectList.Item.extend('HeroWO.H3.DOM.Bits.MessageBox.SelectableIcons.Item', {
    //> face object with `'class (a Bit) and other keys - its options `- the icon
    //> name str `- subscript of the `'face
    _opt: {
      face: null,   // do not change (but can change options of nested module after attach)
      name: '',
    },

    events: {
      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-msg__sel-*'}}})

        if (this.get('face')) {
          this.addModule('face', this.get('face').class, this.get('face'))
        }

        this.el.append('<div class="Hh3-msg__sel-name"></div>')
      },

      _update: function () {
        this.$('.Hh3-msg__sel-name')
          .text(this.get('name'))
          .toggle(this.get('name') != '')
      },

      change_name: 'update',
    },
  })

  // Displays an interactive button.
  //
  // Can be subclassed or used directly by hooking `'clicked.
  H3Bits.Button = Bits.Base.extend('HeroWO.H3.DOM.Bits.Button', {
    //> disabled bool `- if set, user's clicks on this button are ignored (do
    //  not trigger `'clicked) and it may look differently because of `[.Hh3-btn_dis`]
    //> current bool `- supported by some button images; if set, draws an outline or other sort of indication
    _opt: {
      disabled: false,
      current: false,
    },

    events: {
      '+normalize_disabled': Common.normBool,
      '+normalize_current': Common.normBool,
      change_disabled: '_updateState',
      change_current: '_updateState',
      // Not needed currently because disabled/current default to false.
      //render: '_updateState',
    },

    elEvents: {
      click: function () {
        this.get('disabled') || this.clicked()
      },
    },

    // Called when user clicks on a non-`'disabled button.
    clicked: Common.stub,

    _updateState: function () {
      this.el.toggleClass('Hh3-btn_dis', this.get('disabled'))
      this.el.toggleClass('Hh3-btn_cur', this.get('current'))
    },
  })

  // Displays an interactive checkbox used in game options windows.
  H3Bits.Checkbox = Bits.Base.extend('HeroWO.H3.DOM.Bits.Checkbox', {
    el: {class: 'Hh3-chkbx'},

    //> disabled bool
    //> checked bool
    //> label str
    _opt: {
      disabled: false,
      checked: false,
      label: '',
    },

    events: {
      change_disabled: 'update',
      change_checked: 'update',
      change_label: 'update',

      attach: function () {
        this.autoOff(this.cx, {change_classic: 'update'})
      },

      '-render': function () {
        this.el.html(
          '<span class="Hh3-btn_id_SYSOPCHK"></span>' +
          '<span class="Hh3-chkbx__label Hh3-menu__text11 Hh3-menu__text_toned"></span>'
        )
      },

      _update: function () {
        this.$('.Hh3-chkbx__label').text(this.get('label'))
        this.el.toggleClass('Hsfx__btn', !this.cx.get('classic'))

        this.$('.Hh3-btn_id_SYSOPCHK')
          .toggleClass('Hsfx__btn', this.cx.get('classic'))
          .toggleClass('Hh3-btn_cur', this.get('checked'))
          .add(this.el)
            // Hh3-btn_dis on this.el to avoid sound when clicked on label in non-classic mode.
            .toggleClass('Hh3-btn_dis', this.get('disabled'))
      },
    },

    elEvents: {
      click: function (e) {
        if (!this.get('disabled') && (!this.cx.get('classic') || $(e.target).hasClass('Hh3-btn_id_SYSOPCHK'))) {
          this.getSet('checked', Common.not)
        }
      },
    },
  })

  // Base class for displaying a list of Effects affecting some target (e.g. morale level).
  //
  // Subclass should specify sort order (default is by _parentKey - Effect's n), child class, display(), optionally _atter (only fields needed by children).
  H3Bits.AffectorList = Bits.Base.extend('HeroWO.H3.DOM.Bits.AffectorList', {
    mixIns: [Common.Ordered],
    _atter: null,

    events: {
      attach: function () {
        this._atter = this.map.effects.atter()

        this.autoOff(this.map.effects, {
          oadd: function (n) {
            this.display(n) && this.addModule(n, this._childClass, this._atter(n, 0))
          },
          ochange: function (n) {
            var child = this.nested(n)
            child && child.assignResp(this._atter(n, 0))
          },
          oremove: 'unlist.',
        })
      },

      _update: function () {
        this.invoke('remove')

        this.map.effects.find(0, function ($1, $2, $3, $4, $5, n) {
          this.display(n) && this.addModule(n, this._childClass, this._atter(n, 0))
        }, this)
      },
    },

    // function (n)
    // Determines if the `'n Effect should be shown by `'this.
    //
    // Be careful when comparing _parentKey of Creature or Combat, such as with Effect fields. _parentKey is always a string, never empty `[''`] but possibly `['0'`]. In JavaScript, `[if ('0')`] will never match but `['0' == false`]! Use strict equality operators: `'=== and `'!== instead of `[==`].
    display: Common.stub,
  })

  // Displays list of spells affecting a single combat creature.
  //
  // This is used in "creature information" window during combat.
  H3Bits.SpellAffectorList = H3Bits.AffectorList.extend('HeroWO.H3.DOM.Bits.SpellAffectorList', {
    _childClass: H3Bits.SpellImage,
    _source: 0,
    _ifCombat: 0,
    _ifCombatCreature: 0,
    _ifTargetCombatCreature: 0,
    _empty: null,

    _opt: {
      combat: null,   // Combat to match
      creature: null,   // Combat.Creature to match
    },

    events: {
      attach: function () {
        this.sinkOpt({sink: {'*': {elClass: 'Hh3-spaf'}}})

        this._source = this.map.effects.propertyIndex('source')
        this._ifCombat = this.map.effects.propertyIndex('ifCombat')
        this._ifCombatCreature = this.map.effects.propertyIndex('ifCombatCreature')
        this._ifTargetCombatCreature = this.map.effects.propertyIndex('ifTargetCombatCreature')

        var atter = this.map.effects.atter(['source'])
        this._atter = function (n, l) {
          var res = atter(n, l)
          res.spell = res.source[1]
          return res
        }

        this._empty = $('<div class="Hh3-spafs__none">')
          .text(this.cx.s('combat', 'No active spells'))
          .appendTo(this.el)
      },

      '+display': function (res, n) {
        if (this.map.effects.atContiguous(n + this._ifCombat, 0) === this._opt.combat &&
            (this.map.effects.atContiguous(n + this._ifCombatCreature, 0) === this._opt.creature ||
             this.map.effects.atContiguous(n + this._ifTargetCombatCreature, 0) === this._opt.creature)) {
          var src = this.map.effects.atContiguous(n + this._source, 0)
          return src && src[0] == this.map.constants.effect.source.spell
        }
      },

      'nestExNew, unnested': function () {
        this._empty.toggle(!this.length)
        var seen = new Set

        // Only show one icon for all Effects of the same spell.
        this.each(function (spell) {
          spell.el.toggle(seen.size != seen.add(spell.get('spell')).size)
        })
      },
    },
  })

  return H3Bits
})