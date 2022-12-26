define(['DOM.Common', 'DOM.Slider', 'Calculator'], function (Common, Slider, Calculator) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // Contains generic UI bits that are not specified to H3 subsystem.
  var Bits = {}

  // Base class for UI bits.
  //
  // Any `'Bit is a `#ScreenModule.
  //
  // Clients can change `'el of any `'Bit arbitrarily via `'new. `'false `'el
  // is not supported unless mentioned otherwise.
  Bits.Base = Common.jQuery.extend('HeroWO.DOM.Bits.Base', {
    mixIns: [Common.ScreenModule],

    _initToOpt: {
      options: false,
      elClass: false,
      init: false,
      sink: false,
    },

    events: {
      //! +ig +fn=constructor:opt
      // It's possible to tap into `'this and its children (recursively) by
      // giving special keys in `'opt:
      //> options object `- change defaults for `'addModule() calls; only works
      //  for 1) children with explicitly specified `'key or 2) for children
      //  with `[key == ''`] and a catch-all `'* key
      //> elClass string `- add CSS class(es) to `'el, with `'* replaced
      //  by the matched string (see `'sink)
      //> init function `- called after `'child was early constructed (see `'init of `#expandAddModule); receives `'child or parent
      //  object; `'this = parent; same key note as for `'options above
      //> sink object `- options for children;
      //  keys are child's keys (supports one `'* wildcard), values are
      //  objects with keys listed above
      init: function (opt) {
        this.sinkOpt(opt)
      },
    },

    sinkOpt: function (opt, child) {
      opt.elClass && (child || this).el.addClass(opt.elClass.replace('*', opt.match))
      opt.init && opt.init.call(this, child || this)

      if (!_.isEmpty(opt.sink)) {
        var exact = new Map
        var re = []

        _.each(opt.sink, function (options, key) {
          key += ''
          if (key.indexOf('*') == -1) {
            exact.set(key, options)
          } else {
            var expr = '^' + _.escapeRegExp(key).replace('\\*', '(.+?)') + '$'
            re.push([new RegExp(expr), options])
          }
        }, this)

        // Test longer regexps first, assuming shorter REs match a broader set of
        // expressions.
        re.sort(function (a, b) { return b.source.length - a.source.length })

        var events = {
          '=addModule': function (sup, key, cls, options) {
            // Note: this = child!

            var o = Common.expandAddModule({
              args: _.rest(arguments),
              listIn: this,   // affects listInKey
            })

            var ov = this._findSink(exact, re, o.listInKey)

            // Apply options.options.
            for (var k in ov && ov.options) {
              if (!(k in o.options)) {
                o.options[k] = ov.options[k]
              }
            }

            o.init.push(function (module) {
              // Apply options.elClass, init, sink.
              var ov = this._findSink(exact, re, o.listInKeyFunc(module, this))
              ov && this.sinkOpt(ov, module)
            }.bind(this))

            return sup(this, [o])
          },
        }

        child ? this.autoOff(child, events, null) : this.on(events)
      }
    },

    _findSink: function (exact, re, key) {
      key += ''

      // Chicken and egg problem here: some options (like options) are passed
      // to new module's constructor; however, determining key of that new module
      // requires that module to be already constructed (_defaultKey()'s argument).
      // Therefore if new module's key was not explicitly specified ('') make it
      // only match the {'*': ...} key.
      if (key == '') { key = '?' }

      var options = exact.get(key)

      if (!options) {
        re.some(function (item) {
          var match = key.match(item[0])
          if (match) {
            return options = _.extend(item[1], {match: match[1]})
          }
        })
      }

      return options
    },
  })

  // Base UI bit outputting a single string or number.
  //
  // `'el can be `'false to only update `[_opt.value`] - useful for if nesting
  // to `#String.
  Bits.Value = Bits.Base.extend('HeroWO.DOM.Bits.Value', {
    //> hideEmpty true hide `'el if `'value is falsy`, false output stringified
    //  `'value
    //> value scalar `- current value being output as `[el.text()`]; subclasses
    //  change it when needed but external clients can also do this
    _opt: {
      hideEmpty: false,
      value: '',
    },

    events: {
      change_value: function (value) {
        this.el && this._updateEl(value)
      },

      render: function () {
        this.el && this._updateEl(this.get('value'))
      },
    },

    //! +ig
    // Only called when this.el is set.
    _updateEl: function (value) {
      this.el.text(value)
      this.get('hideEmpty') && this.el.toggle(!!value)
      Common.oneClass(this.el, 'Hbit-value_empty_', value ? 'no' : 'yes')
    },
  })

  // Outputs (`'text()) a string formatted using simple value providers.
  //
  // ` `#String evalutes the `'format `#_opt by interpolating `'%sequences,
  // each being own nested `#Module's value. If any child has `'hideEmpty set
  // and no value, `#String itself is hidden (this is applicable to `#Value-s).
  //
  // No CSS classes and other `'el
  // properties are propagated from children to `#String.
  //
  // ` `#String can contain any `#Module that offers `[_opt.value`]. Most used
  // ones are `@Bit.Value`@'s subclasses and `#Calculator-s. But don't directly `'nest() any shared `#Module-s like `#Calculator-s because they'll be directly `'remove()'d - use
  // `#addCalculator() for that one.
  //
  // It's possible to nest one `#String into another `#String as `#String itself is a
  // `#Value.
  //
  //[
  //  var str = this.addModule(Bits.String, {
  //    format: 'Current date: %date',
  //  })
  //  str.addModule('date', Bits.GameDate, {
  //    el: false,
  //    format: 'd:%day w:%week m:%month',
  //  })
  //  alert(str.get('value'))   // Current date: d:3 w:2 m:1
  //]
  Bits.String = Bits.Value.extend('HeroWO.DOM.Bits.String', {
    _childEvents: ['change_value', 'change_hideEmpty'],
    _calcs: {},

    //> format string `- format: `[%[key][%]`], where
    //  `> % `- literal `'%
    //  `> %% `- literal `'%
    //  `> %key[%] `- `[this.nested(key).get('value')`] or empty if there's no
    //     such child; `'key - alphanumeric
    _opt: {
      format: '',
    },

    events: {
      change_format: 'update',
      '.change_value': 'update',
      '.change_hideEmpty': 'update',
      nestExNew: 'update',
      unnested: 'update',
      _updateEl: '_updateVisibility',

      _update: function () {
        var str = this.get('format').replace(/%(\w*)%?/g, function ($, m) {
          var child
          return !m ? '%' : !(child = this.nested(m) || this._calcs[m]) ? '' : child.get('value')
        }.bind(this))

        this.set('value', str)
        this._updateVisibility()
      },
    },

    _updateVisibility: function () {
      // Conrol this.el's visibility by own value if hideEmpty is set, else
      // control it by children's values but only if any child has hideEmpty
      // set (to avoid adding explicit display style to work better with CSS).
      if (this.get('hideEmpty')) {
        var vis = !!this.get('value')
      } else {
        this.some(function (child) {
          return child.get('hideEmpty') && !(vis = !!child.get('value'))
        })
      }

      if (typeof vis == 'boolean') {
        this.el.toggle(vis)
      }
    },

    // function (key, [cls,] options)
    //
    // Nests a `#Calculator which provides `[_opt.value`] (most of them do).
    //
    //> key string `- the name to nest under, affecting the `'format `#_opt
    //> cls class`, missing `@Effect.GenericNumber`@
    //> options object
    //
    //= new `'cls instance
    addCalculator: function (key, cls, options) {
      if (!options) {
        Array.prototype.splice.call(arguments, 1, 0, Calculator.Effect.GenericNumber)
      }
      var calc = this._calcs[key] = this.updateOn(arguments[1], arguments[2])
      this.update()
      return calc
    },
  })

  // Outputs formatted in-game date (`@Map._opt`@`'.date).
  //
  // This is used in most H3's status bars.
  Bits.GameDate = Bits.Value.extend('HeroWO.DOM.Bits.GameDate', {
    //> format string `- replaces `'%day, `'%week, `'%month (1-based)
    _opt: {
      format: '',
    },

    events: {
      attach: function () {
        this.autoOff(this.map, {
          change_date: 'update',
        })
      },

      change_format: 'update',

      _update: function () {
        var date = this.map.date()
        var str = this.get('format').replace(/%(day|week|month)/g, function ($, m) {
          return date[m]
        })

        this.set('value', str)

        if (this.el) {
          Common.oneClass(this.el, 'Hbit-game-date_day_', date.day)
          Common.oneClass(this.el, 'Hbit-game-date_week_', date.week)
          Common.oneClass(this.el, 'Hbit-game-date_month_', date.month)
        }
      },
    },
  })

  // Outputs a single `'property of an `#ObjectRepresentation (`'object).
  Bits.ObjectRepresentationProperty = Bits.Value.extend('HeroWO.DOM.Bits.ObjectRepresentationProperty', {
    _opt: {
      object: null,     // do not set
      property: '',     // do not set
    },

    events: {
      attach: function () {
        this.autoOff(this.get('object'), ['change_' + this.get('property'), 'update'])
      },

      _update: function () {
        this.set('value', this.get('object').get(this.get('property')))
      },
    },
  })

  // Outputs a single `'property of an `#ObjectStore, possibly a sub-store.
  //
  // When the store's object is removed, behaviour of this instance
  // becomes undefined. For regular sub-store (`#subAtCoords()) one can hook
  // `[on('remove', bit.remove, bit)`] but for a read-only sub-store
  // (`#readSubAtCoords) use other means (e.g. `'oremove or `'remove of an
  // `#ObjectRepresentation).
  Bits.ObjectStoreProperty = Bits.Value.extend('HeroWO.DOM.Bits.ObjectStoreProperty', {
    _store: null,
    _n: 0,
    _prop: 0,

    _opt: {
      store: null,
      take: false,  // only has effect in constructor
      release: null,  // null - equals take
      //default: undefined,   // give to opt to use this value when store returns undefined/null or false
    },

    _initToOpt: {
      n: false,
      x: false,
      y: false,
      z: false,
      prop: false,
    },

    events: {
      //> store
      //> take
      //> prop int`, str`, missing = 0
      //
      //> n int
      // or
      //> x int
      //> y int`, missing = 0
      //> z int`, missing = 0
      init: function (opt) {
        this._store = opt.store
        this.get('take') && opt.store.take()
        this._n = ('n' in opt) ? opt.n : opt.store.toContiguous(opt.x, opt.y || 0, opt.z || 0, 0)
        this._prop = opt.store.propertyIndex(opt.prop || 0)
      },

      '-unnest': function () {
        var rel = this.get('release')
        if (this._parent && (rel == null ? this.get('take') : rel)) {
          this._store.release()
        }
      },

      attach: function () {
        this.autoOff(this.get('store'), ['ochange_' + this._n, function ($1, $2, prop) {
          this._prop == prop && this.update()
        }])
      },

      _update: function () {
        var value = this._store.atContiguous(this._n + this._prop, 0)
        if ((value == null || value === false) && ('default' in this._opt)) {
          value = this.get('default')
        }
        this.set('value', value)
      },
    },
  })

  // Outputs amount of a single resource (`'property) currently in the parent
  // `#Screen's player's treasury.
  Bits.ResourceNumber = Bits.ObjectRepresentationProperty.extend('HeroWO.DOM.Bits.ResourceNumber', {
    //> property int (resource constant: `'0)`, str (name: `'wood)
    _opt: {
      property: '',
    },

    events: {
      '-attach': function () {
        var res = this.get('property')
        if (typeof res == 'number') {
          res = _.indexOf(this.cx.map.constants.resources, res)
        }
        this.assignResp({
          object: this.sc.player,    // this.pl is not available here
          property: 'resources_' + res,
        })
      },
    },
  })

  // Displays list of all resources in the parent `#Screen's player's treasury.
  //
  // This is used in H3's ADVMAP status bar.
  Bits.ResourceNumbers = Bits.Base.extend('HeroWO.DOM.Bits.ResourceNumbers', {
    events: {
      attach: function () {
        _.each(this.map.constants.resources, function ($, res) {
          this.addModule(res, Bits.ResourceNumber, {property: res})
        }, this)
      },
    },
  })

  // Displays an ordered list of current map's players, optionally `'filter'ed.
  Bits.PlayerList = Bits.Base.extend('HeroWO.DOM.Bits.PlayerList', {
    mixIns: [Common.Ordered],
    _childClass: [Bits, 'PlayerFlag'],

    //> filter `- receives `@Map.Indexed.Player`@, returns truthyness to display;
    //  the caller should listen for changes to fields it uses and call `'update()
    //  when necessary
    _opt: {
      filter: null,
    },

    events: {
      attach: function () {
        this.autoOff(this.cx.players, {
          nestExNew: 'update',
          unnested: 'update',
        })
      },

      change_filter: 'update',

      '+_defaultKey': function (res, child) {
        return child.get('player').get('player')
      },

      _update: function () {
        var players = this.cx.players
          .filter(function (pl) {
            return pl.get('player') && this.get('filter')(pl)
          }, this)
          .map(function (player) {
            return {
              player: player,
              pos: player.get('player'),
            }
          }, this)

        this.el.toggleClass('Hbit-pl_empty', !players.length)

        this.assignChildren(players, {
          eqFunc: 'player',
        })
      },
    },
  })

  // Abstract display of a single player's "flag" (or anything else).
  //
  // Can be used as a `#PlayerList `'_childClass or on its own, e.g. in "hero
  // information" window.
  Bits.PlayerFlag = Bits.Base.extend('HeroWO.DOM.Bits.PlayerFlag', {
    //> player `@Map.Indexed.Player`@
    //> interactiveClass true add extra CSS classes depending on player's
    //  `'interactive, `'won, `'controller, etc.`, false
    _opt: {
      player: null,   // do not set
      interactiveClass: false,  // if initially true, can toggle on run-time, else can't change to true; always off for neutral player
    },

    events: {
      attach: function () {
        if (this.get('interactiveClass') && this.get('player').get('player')) {
          this.autoOff(this.get('player'), {'change_won, change_interactive, change_controllers, change_controller, change_connected': 'update'})
        }
      },

      change_interactiveClass: 'update',

      _update: function () {
        var player = this.get('player')

        if (this.get('interactiveClass') && player.get('player')) {
          var won = ['lose', 'win', 'tie'][player.get('won')] || 'pending'
          Common.oneClass(this.el, 'Hbit-player-flag_won_', won)
          Common.oneClass(this.el, 'Hbit-player-flag_interactive_', (player.get('interactive') ? 'yes' : 'no'))
          Common.oneClass(this.el, 'Hbit-player-flag_connected_', (!player.isHuman() || player.get('connected') ? 'yes' : 'no'))
        } else {
          Common.oneClass(this.el, 'Hbit-player-flag_')
        }
      },
    },
  })

  // Base class for displaying a scrollable and selectable list of something.
  //
  // Children _opt.selected can be changed but keep in mind that unless Slider's requireCurrent is false, at least one child must have selected set, or there will be discrepancy between current() and actual (visual) selection state (current() will return non-null since it relies on Slider and requireCurrent is false, but visually all children will be unselected due to having selected unset).
  Bits.ObjectList = Bits.Base.extend('HeroWO.DOM.Bits.ObjectList', {
    mixIns: [Common.Ordered],
    _childEvents: ['clicked', 'showTooltip', '+normalize_selected', 'change_selected'],
    _slider: null,    // DOM.Slider
    _orderedParent: null,

    //> positionOnChange true scroll the slider when another child is selected`,
    //  false retain original scroll position
    //> singleSelection bool `- if disabled, `'current...() methods and
    //  `'_slider's `'current return any
    //  of selected children (possibly different each time) and un-selecting children is
    //  not possible unless coded in a subclass
    _opt: {
      positionOnChange: true,
      singleSelection: true,    // do not set
    },

    _initToOpt: {
      slider: false,
    },

    events: {
      init: function (opt) {
        this._slider = new Slider(opt.slider)
      },

      attach: function () {
        // autoOff() prevents firing of change_current when ObjectList is removed (Common.Module causes unlisting of all children which changes _slider's max which in turn may change current).
        this.autoOff(this._slider, {
          change_position: function (now) {
            // XXX+C,O doing this in-thread has significant impact (100s of ms) on initial Context rendering; _.defer() fixes that
            this._orderedParent[0][this._slider.get('horizontal') ? 'scrollLeft' : 'scrollTop'] = now * this._orderedParent.children().first()[this._slider.get('horizontal') ? 'width' : 'height']()
          },

          change_current: function (now) {
            if (!this.get('singleSelection')) {
              return
            } else if (!isNaN(now)) {
              this.at(now).child.set('selected', true)
            } else {
              // set(selected, true) will unset selected for other items but
              // only if there's a newly selected item (now <> NaN).
              // Not using old current value because this position can be wrong
              // if a child was removed.
              this.some(function (child) {
                if (child.get('selected')) {
                  return child.set('selected', false)
                }
              })
            }
          },
        })
      },

      render: function () {
        this._slider.attach(this.el).render()
        this._slider.attachContent(this.el[0])
        this._orderedParent = $('<div class=Hbit-ol__scroll>').appendTo(this.el)
      },

      '-unnest': function () {
        this._parent && this._slider.remove()
      },

      'nestExNew, unnested': function () {
        this._slider.set('max', this.length - 1)
      },

      '-unnested': function (child) {
        child.set('selected', false)
      },

      '.change_selected': function (item, now) {
        this._slider.getSet('current', function (cur) {
          // If item was selected, set Slider's current to item's index.
          // If it was deselected, set current to NaN only if current points to
          // item and keep if otherwise.
          return now ? this.indexOf(item) : this.at(cur).child == item ? NaN : cur
        }, this)

        if (now && this.get('singleSelection')) {
          this.some(function (child) {
            if (child.get('selected') && child != item) {
              return child.set('selected', false)
            }
          })
        }

        if (now && this.get('positionOnChange')) {
          var itemPos = this.indexOf(item)
          if (!this._slider.isVisible(itemPos)) {
            this._slider.set('position', itemPos)
          }
        }
      },
    },

    // Returns `'true if any member is selected (`'current).
    hasCurrent: function () {
      return !isNaN(this._slider.get('current'))
    },

    // Returns currently selected member.
    //= a `'_childClass instance`, false
    current: function () {
      var cur = this._slider.get('current')
      return !isNaN(cur) && this.at(cur).child
    },

    // Returns currently selected member's `'object `'_opt.
    //= mixed often `@Map.Indexed.Hero`@`, false no selection or `'_childClass
    //  allows `'object to be `'null
    currentObject: function () {
      var cur = this.current()
      return cur && cur.get('object')
    },
  })

  // Base class for `#ObjectList members.
  Bits.ObjectList.Item = Bits.Base.extend('HeroWO.DOM.Bits.ObjectList.Item', {
    el: {className: 'Hbit-ol__item'},

    //> selected true if `'this is "selected" in the UI`, false
    //> highlighted true if `'this has some special form of indication (independent of `'selected)`, false
    //> object mixed `- anything, for use by subclasses
    _opt: {
      selected: false,
      highlighted: false,
      object: null,   // do not set
    },

    events: {
      attach: function () {
        if (this.get('object')) {
          this.autoOff(this.get('object'), {
            '-unnest': 'remove',
          })
        }
      },

      change_selected: 'update',
      change_highlighted: 'update',

      _update: function () {
        this.el.toggleClass('Hbit-ol__item_cur', this.get('selected'))
        this.el.toggleClass('Hbit-ol__item_hili', this.get('highlighted'))
      },
    },

    elEvents: {
      click: function () {
        this.clicked()
        this.set('selected', true)
      },

      mousedown: function (e) {
        e.button == 2 && this.showTooltip()
      },
    },

    //#clicked
    // Fired when user clicks within `'this' area.
    //
    //#
    // This class updates the `'selected `#_opt after the click.
    clicked: Common.stub,

    //#showtt
    // Fired when user clicks within `'this' area using right mouse button, before release.
    showTooltip: Common.stub,
  })

  // Base class for an `#ObjectList holding `#ObjectRepresentation-s.
  //
  // This is usually used for lists of heroes, towns and other `@Map.Indexed`@
  // objects.
  Bits.ObjectRepresentationList = Bits.ObjectList.extend('HeroWO.DOM.Bits.ObjectRepresentationList', {
    _childClass: Bits.ObjectList.Item,
    _nextPosition: 0,   // sort position for next nested child

    //> scrollOnChange true scroll the adventure map when another member is
    //  selected`, false
    //> list Sqimitive `- provides list members; children are
    //  `#ObjectRepresentation-s
    //> persistentPosition bool `- if `'false, each instance of `#ObjectRepresentationList will use its own order even if the underlying list store is the same
    _opt: {
      scrollOnChange: false,
      list: null,   // do not set
      persistentPosition: true,    // do not set
    },

    events: {
      attach: function () {
        this.autoOff(this.get('list'), {
          nestExNew: function (res) {
            this._add(res.child)
          },
          // ObjectList.Item removes itself when the underlying objct is removed. However, it may happen that the object is gone from our list without being removed (e.g. capturing a town leads to it being removed from P1.towns and added to P2.towns).
          unnested: function (obj) {
            this.unlist(obj.get('id'))
          },
          '.change_listOrder': function (obj, now) {
            if (this.get('persistentPosition')) {
              this.nest(obj.get('id'), this.nested(obj.get('id')), {pos: now})
            }
          },
        })
      },

      render: function () {
        this.get('list').each(this._add, this)
      },

      '.clicked': function (item) {
        if (!item.get('selected') && this.get('scrollOnChange')) {
          this.sc.scrollTo(item.get('object').get('id'))
        }
      },
    },

    _add: function (object) {
      var options = {
        object: object,
        pos: this.get('persistentPosition') ? object.get('listOrder') : this._nextPosition++,
      }

      this.addModule(object.get('id'), this._childClass, options)
    },
  })

  // Base class for displaying list of garrisoned creatures for heroes and towns.
  //
  // This instance should be removed when `'store is removed!
  Bits.GarrisonList = Bits.ObjectList.extend('HeroWO.DOM.Bits.GarrisonList', {
    _childClass: 'Item',
    _props: ['creature', 'count'],
    _store: null,
    _atter: null,

    _initToOpt: {
      store: false,
    },

    events: {
      //> opt
      //  `> store `#ObjectStore in `'Garrison (`[AObject->$garrison`]) format
      init: function (opt) {
        this._store = opt.store.take()
      },

      attach: function () {
        this.autoOff(this._store, {
          oadd: function (n, $, props) {
            // HeroWO's garrison length is dynamic; if an object was added into
            // a slot that we don't yet have, create it.
            for (var i = this.minLength(); --i >= this.length; ) {
              this._add(i, {})
            }
            this._add(this._store.fromContiguous(n).x, this._atter(props))
          },
          oremove: function (n) {
            this._add(this._store.fromContiguous(n).x, {})
          },
        })

        this._atter = this._store.atter(this._props)

        _.each(this._props, function (name) {
          this.autoOff(this._store, [
            'ochange_p_' + this._atter[name + 'Index'],
            function (n, $1, $2, value) {
              this.nested(this._store.fromContiguous(n).x)
                .set(name, value)
            },
          ])
        }, this)
      },

      '-unnest': function () {
        this._parent && this.autoOff(this._store).release()
      },

      render: function () {
        var prev = -1

        this._store.find(0, function ($1, x, $2, $3, $4, n) {
          while (++prev < x) {
            this._add(prev, {})
          }
          this._add(x, this._atter(n, 0))
        }, this)

        // Don't draw empty slots past standard garrison length. Such slots could be created for temporary creatures during combat, for example.
        while (this.length && this.last().isEmpty()) {
          this.pop()
        }

        while (++prev < this.minLength()) {
          this._add(prev, {})
        }
      },
    },

    _add: function (index, obj) {
      this.addModule(index, this._childClass, {
        pos: index,
        creature: obj.creature, // can be null/false for empty slot
        count: obj.count,
        slot: index,
      })
    },

    // Returns number of slots occupied by creatures (not `'isEmpty()).
    filledLength: function () {
      return this.reject(Common.p('isEmpty')).length
    },

    minLength: function () {
      return this._slider.get('height')
    },
  })

  // Base class for displaying a particular creature as part of a garrison.
  //
  // Can be used as a `#Garrison `'_childClass or on its own, e.g. in "creature
  // information" window.
  Bits.GarrisonList.Item = Bits.ObjectList.Item.extend('HeroWO.DOM.Bits.GarrisonList.Item', {
    //> creature null empty slot`, int
    //> count int `- ignored if `'creature is `'null
    //> slot int `- index (`'x) in the parent's `'store (if parent exists)
    //> object `- inherited from `@ObjectList.Item`@; unused by this implementation
    //  but can be used in subclasses
    _opt: {
      creature: null,
      count: 0,
      slot: 0,
    },

    events: {
      // creature is not used by this class but is meant for subclasses.
      // For example, H3 uses CreatureImage and refreshes it in _update.
      change_creature: 'update',
      change_count: 'update',

      '-render': function () {
        this.el.append('<span class=Hbit-cr__count>')
      },

      _update: function () {
        this.el.toggleClass('Hbit-cr_empty', this.isEmpty())
        // Output &nbsp; in empty slot's count to avoid shifting the layout.
        this.$('.Hbit-cr__count').text(this.isEmpty() ? ' ' : this.get('count'))
      },
    },

    // Returns `'true if this slot is not occupied by any creature.
    isEmpty: function () {
      return typeof this.get('creature') != 'number'
    },
  })

  // Flexible stack-like container for `#Window-s - UI dialogs and screens. Allows overlaying screens and overlapping dialogs that can be modal, hidden, etc.
  Bits.Windows = Bits.Base.extend('HeroWO.DOM.Bits.Windows', {
    mixIns: [Common.Ordered],
    _childClass: [Bits, 'Window'],
    _childEvents: ['interacted', 'change'],
    _bk: null,
    _z: 0,

    //> minZ int `- minimal `[z-index`] value assigned to any managed `#Window; see `'_repos() for details
    //> shade bool `- whether to draw a semi-black backdrop if any modal dialog exists
    //> shadeCloses bool `- if `'shade is set, whether clicking on it closes the top-most dialog
    _opt: {
      minZ: 0,
      shade: false,
      shadeCloses: false,
      topModal: null, // 'visible' 'modal' child with max Z
      topNonTooltipModal: null, // 'visible' 'modal' non-'tooltip' child with max Z; may equal to topModal
      topFullScreen: null,  // 'visible' 'fullScreen' child with max Z
      topVisible: null, // 'visible' child with max Z
      hasTooltips: false, // do not set; whether there is any non-concealed 'tooltip' window
    },

    events: {
      init: function () {
        // We manage order by z-index so don't renest nodes on order change (see _repos for the reason).
        this._orderedParent = null
        this._bk = $('<div>').hide().appendTo(this.el)

        // Browser fires events in this order: mousedown, mouseup, click|contextmenu
        // (depending on e.button: 0 = LMB, 2 = RMB). The trick is that cancelling
        // mouseup and mousedown has no effect on contextmenu, it has to be cancelled
        // explicitly - but only when we have shown the tooltip. Another trick is
        // that we display it as soon as mousedown happens, so these two events must
        // be handled together.
        //
        // SoD closes help box as soon as LMB is pressed or RMB is released.
        //
        // Help windows are typically added during mousedown, which results in
        // bk being added immediately and mouseup/contextmenu being dispatched to
        // it rather than to the original element. Thus we cancel them.
        //
        // These two hooks must be accompanied with same hooks in tooltip children.
        this._bk.on('contextmenu mousedown', Common.ef('_cancelTooltips', this))

        this._bk.on('click', function () {
          if (this.get('shadeCloses')) {
            var modal = this.get('topModal')
            modal && modal.cancel()
          }
        }.bind(this))
      },

      '+normalize_shade': Common.normBool,
      '+normalize_shadeCloses': Common.normBool,
      '+normalize_hasTooltips': Common.normBool,

      change_topModal: function (now, old) {
        this.each(function (child) {
          // Pause animations if there's a modal window in all windows except the
          // top-modal one.
          //
          // XXX this doesn't affect CreatureAnimation because it's using a timer, not CSS
          child.set('overlaid', now && child != now)
        })
      },

      change_topFullScreen: function (now) {
        now && this.each(function (child) {
          if (child.get('hoist') && !child.get('fullScreen')) {
            this._topZ(child)
          }
        }, this)
      },

      attach: function () {
        Common.autoOffNode(this, document.body, {
          keydown: '_handleKey',
        })
      },

      '+expandAddModule': function (res) {
        res.options.windows = this
      },

      '-nestEx': function (options) {
        // withinWindow restricts new child's top to be less than the next
        // fullScreen Window after withinWindow (if any). It's meant for cases
        // when there are several screens (fullScreen windows, like ADVMAP and
        // combat(s)) and an overlaid window may produce windows that should not
        // overlay the currently visible screen. It does that by specifying
        // itself in their withinWindow. This allows user to see background
        // messages upon leaving the topmost screen.
        //
        // Rule of a thumb is to specify it for windows that don't occur in
        // response to direct user interaction. For example, "Player A has lost"
        // message should be shown on top of ADVMAP while "Do you want to quit?"
        // should appear on top of all windows (i.e. no withinWindow given).
        options.pos = ++this._z
        if (options.withinWindow) {
          var i = this.indexOf(options.withinWindow)
          if (i == -1) {
            throw new Error('withinWindow not found.')
          }
          var shifting
          while (++i < this.length) {
            var entry = this.at(i)
            if (!shifting && entry.child.get('fullScreen')) {
              shifting = true
              options.pos = entry.pos
            }
            shifting && this.nestEx(_.extend({}, entry, {pos: entry.pos + 1}))
          }
        }
      },

      '.interacted': function (child) {
        // Not updating Z index if child is already top-most to save a little bit of resources. This should be
        // harmless anyway.
        // Never updating Z for fullScreen since they're always in background and
        // can't overlap other windows.
        if (!child.get('fullScreen') && child != this.last()) {
          this._topZ(child)
        }
      },

      _repos: function () {
        // Windows has previously used a different implementation: all but the top-most windows had the same z-index while their nodes were inserted into specific positions in DOM according to their pos causing browser to stack them correctly
        //
        // This posed a problem: first click on a non-top Window led to it being moved in DOM and losing onmouseup and onclick.
        var i = this.get('minZ')
        this.each(function (win) { win.el.css('zIndex', i++) })
        this._updateTop()
      },

      'nestExNew, unnested': '_updateTop',

      '.change': function (child, name, now, old, options) {
        switch (name) {
          case 'visible':
          case 'fullScreen':
          case 'modal':
          case 'tooltip':
            options._updateTop || this._updateTop()
        }
      },
    },

    _topZ: function (child) {
      this.nestEx({key: this.findKey(child), child: child})
    },

    _cancelTooltips: function (e) {
      if (this.get('hasTooltips')) {
        this.each(function (child) {
          child.get('tooltip') && child.cancel()
        })
        return false
      }
    },

    _updateTop: function () {
      for (var tips, tv, tf, tm, tn, i = this.length; !tf && i--; ) {
        var child = this.at(i).child
        tips = tips || child.get('tooltip')
        child.set('concealed', false, {_updateTop: true})

        if (child.get('visible')) {
          tv = tv || child

          if (child.get('fullScreen')) {
            tf = child
          } else if (child.get('modal')) {
            tm = tm || child
            child.get('tooltip') || (tn = tn || child)
          }
        }
      }

      this.assignResp({
        hasTooltips: tips,
        topVisible: tv,
        topFullScreen: tf,
        topModal: tm,
        topNonTooltipModal: tn,
      })

      tm && this._bk.insertBefore(tm.el).css('zIndex', tm.el.css('zIndex'))
      this._bk.toggle(!!tm)

      while (i-- > 0) {
        this.at(i).child.set('concealed', true, {_updateTop: true})
      }
    },

    _handleKey: function (e) {
      switch (e.key) {
        case 'Enter':
        case 'Escape':
          // SoD doesn't react to keys while showing a tooltip window.
          if (!this.get('hasTooltips') && this.length &&
              e.target.tagName != 'TEXTAREA') {
            var win = this.get('topVisible')
            if (win && win[e.key == 'Enter' ? 'submit' : 'cancel']()) {
              return false
            }
          }
          break
      }
    },
  })

  // Represents an UI dialog (e.g. message box) or a full screen (e.g. adventure map).
  //
  // `'el must have non-`'static `'position, else `[z-index`] won't be properly applied (`#Window contents won't be restricted by `#Window's `[z-index`], overlaying other `#Window-s).
  //
  // Must not have `[z-index`] on `'el, else will break stacking in `#Windows and its `'_bk.
  Bits.Window = Bits.Base.extend('HeroWO.DOM.Bits.Window', {
    _windows: null,
    _observer: null,

    //> center bool `- positions self in the middle of parent `#Windows; needs `[position: absolute`] in CSS
    //> centerIn null = Windows.el`, jQuery selector or node `- used if `'center
    //> modal bool `- if set, prevents user from interacting with `#Window-s of lower indexes
    //> fullScreen bool `- if set, `#Window is expected to take up all visual area and work as background for non-`'fullScreen `#Window-s with higher indexes
    //> hoist bool `- whether `#Window will be automatically put on top of current `'fullScreen `#Window (Chat window is a good example) or if it will remain above the one which existed when this `#Window was added; ignored if `'fullScreen
    //> collapsed bool `- whether user has "hidden" `#Window (if `#Window supports existing-but-invisible state, like Chat)
    //> tooltip bool `- if set, makes `#Window go away when right mouse button is released
    _opt: {
      center: false,
      centerIn: null,   // do not set
      modal: true,  // do not set
      fullScreen: false,  // do not set
      hoist: true,  // do not set
      visible: true, // do not set; controlled by Windows; whether el is visible
      collapsed: false,
      concealed: false, // do not set; controlled by Windows; whether there is a fullScreen window with higher Z
      overlaid: false, // do not set; controlled by Windows; whether there are 'modal' windows with higher Z
      tooltip: false, // do not set
    },

    _initToOpt: {
      windows: '._windows',
    },

    events: {
      '+normalize_center': Common.normBool,
      '+normalize_modal': Common.normBool,
      '+normalize_fullScreen': Common.normBool,
      '+normalize_hoise': Common.normBool,
      '+normalize_visible': Common.normBool,
      '+normalize_collapsed': Common.normBool,
      '+normalize_concealed': Common.normBool,
      '+normalize_overlaid': Common.normBool,
      '+normalize_tooltip': Common.normBool,

      'change_collapsed, change_concealed': function () {
        // Optimization: hide windows invisible due to being below the top-most
        // fullScreen window.
        this.set('visible', !this.get('collapsed') && !this.get('concealed'))
      },

      change_visible: function (now) {
        this.el.toggle(now)
      },

      change_center: function (now, old) {
        if (old) {
          this.el.removeClass('Hbit-win_center')
          this._observer && this._observer.unobserve(this.el[0])
          this._observer = null
        }
        if (now) {
          this._startCentering()
        }
      },

      attach: function () {
        // These must useCapture to be dispatched before children can react. Imagine a child creates a window in response to mousedown - it will be nested with _topZ, then our mousedown will fire interacted which will _topZ too, putting our Window above the one created by child.
        this.el[0].addEventListener('mousedown', Common.ef('_mousedown', this), true)
        this.el[0].addEventListener('contextmenu', Common.ef('_contextmenu', this), true)
      },

      render: function () {
        if (this.get('center') && !this._observer) {
          this._startCentering()
        }
      },

      '-unnest': function () {
        this._parent && this.set('center', false)
      },
    },

    _mousedown: function () {
      this.interacted()
      this._cancelTooltips()
    },

    // Windows' own hooks on this and mousedown work if the tooltip Window is small enough
    // and click lands on bk. If it lands within the Window, this and mousedown will catch
    // it.
    _contextmenu: function (e) {
      if (this._cancelTooltips() === false) {
        e.stopPropagation()
        e.preventDefault()
      }
    },

    // Should return truthyness if closed.
    submit: Common.stub,
    interacted: Common.stub,

    // Can do nothing if cannot cancel. Should return truthyness if closed.
    cancel: function () {
      return this.remove()
    },

    _cancelTooltips: function () {
      if (this.get('tooltip') && this._windows) {
        return this._windows._cancelTooltips()
      }
    },

    // It's a shame we have to use JavaScript to center the content but
    // because _windows.el contains multiple overlapping elements
    // positioned independently of others normal CSS centering can't deal
    // with this - except using  transform: translate(50%, 50%)  and that works
    // but adds subpixel rendering which looks bad on some non-textual content.
    _startCentering: function () {
      if (!window.ResizeObserver) {
        return this.el.addClass('Hbit-win_center')
      }

      var centerIn = $(this.get('centerIn') || this._windows.el)
      var top  = centerIn.offset().top  - this._windows.el.offset().top
      var left = centerIn.offset().left - this._windows.el.offset().left
      var center = function () {
        this.el.css({
          // XXX=IC Difference: in SoD RMB info box on ADVMAP never leaves the active area of the map, i.e. never overlaps EDG, right-side panel and the bottom help bar.
          top:  Common.clamp(top  + ((centerIn.height() - this.el.outerHeight()) / 2), 0, this._windows.el.height() - this.el.outerHeight()),
          left: Common.clamp(left + ((centerIn.width()  - this.el.outerWidth())  / 2), 0, this._windows.el.width() - this.el.outerWidth()),
        })
      }.bind(this)

      this._observer = new ResizeObserver(center)
      this._observer.observe(this._windows.el[0])
      this._observer.observe(this.el[0])
    },
  })

  return Bits
})