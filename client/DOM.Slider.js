define(['DOM.Common'], function (Common) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // Creates a generic slider control, scroll area and selectable list.
  //
  // ` `#Slider can be used as a logical backend for some kind of list, without
  // exposing `'el to the user or even with `'el of `'false.
  //
  // ` `#Slider is not a `#Module; It can be used in any context. For example:
  //[
  //   var slider = new DOM.Slider({height: 5})
  //   slider.attach('#root').render()
  //   slider.set('max', items.length)
  //   slider.on('change_position', function (now) {
  //     $('#list')[0].scrollTop = now * 24
  //   })
  //]
  //
  // ` `#Slider is separate from the rest of HeroWO codebase (except for a few helper methods in `#Common) and can be used on its own.
  return Common.jQuery.extend('HeroWO.DOM.Slider', {
    el: {class: 'Hslider'},

    _handleWheel: null,
    _buttonTimer: null,
    _attachedContent: [],
    _dragInfo: {},

    //> horizontal bool `- Orientation of the GUI. Vertical by default.
    //> max NaN`, integer `- Last value `'current can have. `'NaN means "empty"
    //  list (`#isEmpty()). Max `'position is `[max - height + 1`].
    //
    //  Make sure to set `'max prior to setting `'position and `'current, else
    //  they'd be capped.
    //> position NaN`, integer `- Current scroll position. When `'max is `'NaN,
    //  this is also `'NaN, else this is an integer.
    //> current NaN`, integer `- Currently selected item. When `'max is `'NaN,
    //  this is `'NaN, else this is
    //  `'NaN when there is nothing selected (only allowed if `'requireCurrent is unset)
    //  or an integer.
    //
    //  `'current is kept updated according to `'max but is not used otherwise
    //  by `#Slider. It's meant for listening to by the caller.
    //> requireCurrent bool `- If set, `'current can be `'NaN when `'max is not `'NaN, to indicate no selection.
    //> height integer `- Height of the viewport (max number of items fitting
    //  on screen without scrolling). Only useful if making use of `'current.
    //> wheelScroll 0 disable`, integer `- If enabled, allows user to scroll
    //  the list by changing `'position this many points per each wheel rotation.
    //  This also affects the attached content area (`#attachContent()).
    //> repeatSpeed integer ms `- When user holds down the button or presses on
    //  the track (part between buttons), scroll in that direction every so often.
    //> trackJump bool `- If unset, keeping mouse pressed on the track works like
    //  press on the up or down button. If set, `'position is set immediately
    //  like in SoD.
    //> thumbClass `- CSS class(es) added to the thumb node.
    //> upClass `- CSS class(es) added to the up button (left if `'horizontal).
    //> downClass `- CSS class(es) added to the down button (right if `'horizontal).
    //> disabledClass `- CSS class(es) added to up/down buttons and thumb when
    //  there's nothing to scroll (`#isEmpty or at extreme `'position).
    //> buttonSFX bool `- Whether to enable click sound effect on buttons.
    //  See `@H3.DOM.Audio`@.
    //> repeating bool `- Read-only; set while user is holding left mouse button to automatically scroll the list.
    _opt: {
      attachPath: '.',
      horizontal: false,
      max: NaN,
      position: NaN,
      current: NaN,
      requireCurrent: true,
      height: 1,
      wheelScroll: 1,   // XXX=IC should be disabled everywhere in classic mode
      repeatSpeed: 250,
      trackJump: false,
      thumbClass: '',
      upClass: '',
      downClass: '',
      disabledClass: '',
      buttonSFX: true,
      repeating: false,
    },

    events: {
      init: function () {
        this._handleWheel = Common.ef('handleWheel', this)
        this._drag = this._drag.bind(this, this._dragInfo)
        this._stopRepeat = this._stopRepeat.bind(this)
      },

      '+normalize_position': function (res, value) {
        return this.isEmpty() ? NaN : (Common.clamp(value || 0, 0, this.maxPosition()) || 0)
      },

      '+normalize_current': function (res, value) {
        if (this.get('requireCurrent')) {
          value = value || 0
        }
        return this.isEmpty() ? NaN : Common.clamp(value, 0, this.get('max'))
      },

      '+normalize_max': function (res, value) {
        value = parseInt(value)
        return value < 0 ? NaN : value
      },

      // Normally, Sqimitive's `'isEqual() (`[===`]) returns `'false if any argument is a `'NaN, meaning `'change_OPT fires even if both old and new values are `'NaN. `#Slider overrides `#isEqual() because `'NaN is a valid value for many of its `'_opt'ions and there's no need to fire in this case.
      '+isEqual': function (res, a, b) {
        return res || (a == NaN && b == NaN)
      },

      change_horizontal: 'render',
      change_position: 'update',
      change_thumbClass: 'render',
      change_upClass: 'render',
      change_downClass: 'render',
      change_disabledClass: 'update',
      change_buttonSFX: 'update',

      'change_max, change_height': function () {
        this.getSet('position')
        this.getSet('current')
        this.update()
      },

      change_requireCurrent: function () {
        this.getSet('current')
      },

      unnest: function () {
        this._stopRepeat()
        _.invoke(this._attachedContent.splice(0), 'remove')
      },

      render: function () {
        Common.oneClass(this.el, 'Hslider_dir_', this.get('horizontal') ? 'hor' : 'vert')

        this.el.html(
          '<div class="Hslider__btn Hslider__btn_dir_u ' + this.get('upClass') + '"></div>' +
          '<div class="Hslider__track">' +
            '<div class="Hslider__thumb ' + this.get('thumbClass') + '"></div>' +
          '</div>' +
          '<div class="Hslider__btn Hslider__btn_dir_d ' + this.get('downClass') + '"></div>'
        )

        this.update()
        this.attachContent(this.el[0])
      },
    },

    elEvents: {
      'mousedown .Hslider__btn,.Hslider__track': function (e) {
        var node = $(e.target)

        if (!node.hasClass('Hslider__track')) {
          var dir = $(e.target).hasClass('Hslider__btn_dir_u') ? -1 : +1
        } else if (!this.get('trackJump')) {
          // Click on the empty track on the left of the thumb to scroll left.
          // Click on the emtpy right-side track to do the reverse.
          var dir = (this.get('horizontal')
              ? e.pageX > this.$('.Hslider__thumb').offset().left
              : e.pageY > this.$('.Hslider__thumb').offset().top)
            ? +1 : -1
        } else {
          return
        }

        e.stopPropagation()   // prevent el-wise mousedown
        this._hookMouseUp()
        this.scrollBy(dir)

        clearInterval(this._buttonTimer)
        this._buttonTimer = setInterval(this.scrollBy.bind(this, dir),
                                        this.get('repeatSpeed'))
      },

      'mousedown .Hslider__thumb': function (e) {
        e.stopPropagation()   // don't start _buttonTimer, prevent el-wise mousedown
        this._hookMouseUp()
        this._startDrag(true)
      },

      // Usually el looks like this:
      //   [<]-(T)------++[>]   (T)humb (-) track (+) empty space
      // Empty space equals thumb's width and exists to avoid overlapping (T) on
      // [>] when position is close to the edge (or 100%). With trackJump enabled,
      // we cannot listen on the track only (-) because user expects [+] to be
      // also clickable (it's visually part of the track). Therefore we listen
      // to el-wise mousedown on .Hslider.
      mousedown: function (e) {
        if (this.get('trackJump')) {
          this._hookMouseUp()
          this._startDrag(true)
          this._drag(e)
        }
      },
    },

    // Returns maximum value the `'position `#_opt can have.
    //= NaN if `#isEmpty()`, integer at least 0
    maxPosition: function () {
      return Math.max(0, this.get('max') - this.get('height') + 1)
    },

    // Returns `'true if the `'max `#_opt is `'NaN.
    isEmpty: function () {
      return isNaN(this.get('max'))
    },

    // Determines if the item at `'pos is visible based on current `'position
    // and `'height `#_opt.
    //= bool
    isVisible: function (pos) {
      var scrollPos = this.get('position')
      return pos >= scrollPos && pos < scrollPos + this.get('height')
    },

    update: function () {
      this.el.toggleClass('Hslider__empty', this.isEmpty())

      this.$('.Hslider__thumb')
        .toggleClass(this.get('disabledClass'), this.isEmpty())
        .css(this.get('horizontal') ? 'left' : 'top',
             // Explicitly put the thumb to the left edge when isEmpty() or when
             // don't have enough content for scrolling, in case the slider's
             // max has changed from high to low and user has moved the thumb
             // while it was high.
             this.isEmpty() ? 0 : (this.get('position') / (this.maxPosition() || 1) * 100 + '%'))

      this.$('.Hslider__btn').each(function (i, node) {
        var isUp = $(node).hasClass('Hslider__btn_dir_u')
        var disable = this.isEmpty() ||
                      this.get('position') == (isUp ? 0 : this.maxPosition())
        $(node)
          .toggleClass(this.get('disabledClass'), disable)
          .toggleClass(this.get('buttonSFX') ? 'Hsfx__btn' : '', !disable)
      }.bind(this))
    },

    // Hooks the DOM node that is "scrolled" by this `#Slider.
    //
    //= object with `'remove function that unbinds the listeners
    //
    // ` `#Slider doesn't have to be child or parent of the area that it
    // appears to control. `#attachContent() binds the two together, allowing
    // better user experience. Multiple areas can be attaching at once.
    //
    // Currently `#attachContent() enables mouse wheel scrolling on `'el.
    attachContent: function (el) {
      // Can't use passiveListener here.
      el.addEventListener('wheel', this._handleWheel)
      var res = {
        remove: el.removeEventListener.bind(el, 'wheel', this._handleWheel),
      }
      this._attachedContent.push(res)
      return res
    },

    // "Scrolls" this `#Slider in response to an `'onwheel event by `'wheelScroll.
    handleWheel: function (e) {
      var step = this.get('wheelScroll')
      if (step) {
        this.scrollBy((e.originalEvent || e).deltaY > 0 ? step : -step)
        e.stopPropagation()   // don't scroll containers and/or the page
        e.preventDefault()
      }
    },

    _startDrag: function (onmousemove) {
      // Not binding in init or render to avoid forced reflow in case browser
      // is yet to calculate track's parameters.
      //
      // Recalculating before every drag in case scaling factor has changed.
      var track = this.$('.Hslider__track')
      // Unlike $.width(), getBoundingClientRect() adjusts result by scaling factor.
      var rect = track[0].getBoundingClientRect()
      _.extend(this._dragInfo, track.offset(), {width: rect.width, height: rect.height})

      onmousemove && document.body.addEventListener('mousemove', this._drag)
    },

    _drag: function (size, e) {   // bound
      // +----------------------+     document
      // |       L      R       |     track page coordinates
      // |    [<]---[O]--[>]    |     DOM.Slider
      //  ^^^^^^^  mouse pointer  outside track: position = 0
      //                 ^^^^^^^  outside track: position = max
      //         ^^^^^^^^  within track: position = (e.pageX - L) / (R - L)
      var pos = this.get('horizontal')
          ? (e.pageX - size.left) / size.width
          : (e.pageY - size.top)  / size.height

      // Rounding gives smoother scrolling.
      // normalize_position will cap the value.
      this.set('position', Math.round(pos * this.maxPosition()))
    },

    // Hooking on demand because there can be many DOM.Slider-s active in a
    // document (including in obscured Window-s) and having them all listening
    // on mouseup even when no repetition is happening would be a waste.
    _hookMouseUp: function () {
      this.set('repeating', true)
      document.body.addEventListener('mouseup', this._stopRepeat)
    },

    _stopRepeat: function () {    // bound
      this.set('repeating', false)
      clearInterval(this._buttonTimer)
      document.body.removeEventListener('mouseup', this._stopRepeat)
      document.body.removeEventListener('mousemove', this._drag)
    },

    // Changes `'position by the given value.
    //= integer new `'position`, NaN
    scrollBy: function (delta) {
      return this.getSet('position', Common.inc(delta))
    },
  })
})