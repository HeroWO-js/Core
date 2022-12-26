define(['DOM.Common'], function (Common) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // Root of the drawing backend that utilizes browser's DOM nodes.
  //
  // This is a container with two extremely large groups of nodes: DOM.Map (W*H + O) and DOM.MiniMap (W*H*L) where W/H are map width/height, L is number of levels, O is map.objects count. Its node is nested directly into Context.el, not Screen.el as with normal ScreenModule-s because Screen.el's className often changes and this has terrific performance impact (browser has to recalculate styles for all Screen.el's children).
  //
  // This makes DOM.UI's display position and CSS class tree isolated. The position is usually specified for Screen in CSS so it needs to simultaneously cover DOM.UI's el (if using several Screen-s with DOM.UI-s in one Context, just assign the same CSS class to both Screen and its DOM.UI, e.g. ".Hsc__id_$cid", and position using that class). As for CSS classes, DOM.UI normally doesn't rely on any Screen's classes but if your module does, make sure to keep them in sync.
  //
  // Add any custom classes to DOM.UI or child modules before -render (e.g. in attach) while the child node count is low, otherwise browser will initiate another style recalculation after render.
  //
  // This class is using the following CSS classes:
  //* Hroot*
  //
  // H3.DOM.UI also changes classes of el
  //* Hroot_edge
  return Common.jQuery.extend('HeroWO.DOM.UI', {
    mixIns: [Common.ScreenModule],
    el: {class: 'Hroot'},

    // Exposed root node for `@DOM.Map`@ or compatible adventure map renderer.
    //#-ro
    mapEl: null,
    // Exposed root node for `@DOM.MiniMap`@ or compatible mini-map renderer.
    //#-ro
    miniMapEl: null,
    _mapWrapperEl: null,
    _overlayEl: null,
    _dragInfo: {},

    //> dragScrollSpeed float`, 0 disabled `- When user grabs at any point of the
    //  adventure map and drags, scroll map by this many tiles for travel
    //  distance of 1 tile. Thus, `'2 scrolls twice as fast, 0.5 - half as fast.
    //  `'0 disables scrolling by grabbing (which does not exist in SoD).
    //> addedMapScroll array [left, top] pixels `- Internal option to
    //  accommodate `@H3.DOM.UI`@'s `'mapEdge. It will work if multiple modules
    //  want to set the added map scroll as long as they add to this value, not
    //  override it (see `@H3.DOM.UI`@'s code for example).
    //> mapViewSize null`, array [width, height] in tiles `- only effective before render; determines Screen's mapViewSize; if null, will be calculated from this.el's dimensions but this will force reflow and be very slow
    _opt: {
      dragScrollSpeed: 2,
      addedMapScroll: [0, 0],
      mapViewSize: null,
    },

    events: {
      init: function () {
        this._drag = this._drag.bind(this, this._dragInfo, this.sc._opt)

        // These are exposed as public properties in init() so other modules
        // using them for their el can be created immediately after nesting DOM.UI.
        this._mapWrapperEl = $('<div class=Hroot__map-wr>')
          .append(this.mapEl = $('<div class=Hroot__map>'))
          .appendTo(this.el)
          [0]

        this.miniMapEl = $('<div class=Hroot__mmap-wr>')
          .appendTo(this.el)
      },

      '+normalize_addedMapScroll': function (res, value) {
        return Common.normIntArrayCompare(value, this.get.bind(this, 'addedMapScroll'))
      },

      change_addedMapScroll: function (now, old) {
        _.log && _.log('addedMapScroll = %j <- %j', now, old)
        this._updateScroll()
      },

      attach: function () {
        // .Hroot must be after .Hsc (and before any other .Hsc, such as of
        // other players) to be placed on top of the relevant .Hsc thanks to the
        // negative margin-top. Also, DOM.MiniMap in shared mode should overlay
        // the Screen.
        this.el.insertAfter(this.sc.el)

        Common.autoOffNode(this, document.body, {
          mouseup: '_stopDrag',
        })

        this.autoOff(this.sc, {
          change_mapMargin: '_updateScroll',
          change_mapPosition: '_updateScroll',
          change_mapDragging: function (now) {
            this._overlayEl.toggle(!!now)
            // SoD disables animations during scrolling.
            this.pauseAnimations(now)
          },
        })
      },

      '-unnest': '_stopDrag',

      render: function () {
        // This node overlays Hgrid in mapEl to allow quickly changing cursor when grid cells don't have to receive pointer events. Changing it on the root node triggers recalculation which is unbearably slow on this many nodes.
        //
        // For some reason, $('<div class=...>').appendTo(this.el) forces reflow.
        var el = document.createElement('div')
        el.className = 'Hroot__overlay'
        this.el.append(el)
        this._overlayEl = $(el)

        var size = this.get('mapViewSize')

        if (!size) {
          var el = $(this._mapWrapperEl)
          size = [
            Math.floor(el.width()  / this.map.constants.tileSize),
            Math.floor(el.height() / this.map.constants.tileSize)
          ]
        }

        this.sc.set('mapViewSize', size)
      },
    },

    elEvents: {
      'mousedown .Hroot__map-wr': function (e) {
        if (!this.cx.get('classic') && !e.button) {
          this._dragInfo.x = e.pageX
          this._dragInfo.y = e.pageY
          this._dragInfo.speed = this.get('dragScrollSpeed')
          this._dragInfo.cell = this.map.constants.tileSize
          this._dragInfo.pos = null
          document.body.addEventListener('mousemove', this._drag)
        }
      },
    },

    pauseAnimations: function (pause) {
      // XXX
      //
      // We'd use CSS to specify when animations should play and when not, but this is a no goer given it may affect thousands of nodes. One way would be to iterate over visible DOM.Map object nodes and set style.animationPlayState but that breaks into DOM.Map's domain (what is "object node"? when is it "visible"?) and besides, changing style still triggers partial reflow.
      //
      // Recent Web Animations draft (2020) helps but getAnimation/s() methods are extremely slow if results (i.e. animated map objects) are counted in hundreds.
      //
      // https://drafts.csswg.org/web-animations-1/#example-e7bbf635
      //
      // Update: this was a good try but it causes bizarre effects on hero animations (AH??_ objects): enable mapAnimate, then drag ADVMAP or open a dialog (these call pauseAnimations(true)), then stop/close (pauseAnimations(false)). Observe that heroes no longer reflect changes to className - they are always in idle animation group, and even disabling mapAnimate or meddling with CSS via the inspector doesn't prevent their idle animation!
      //
      // Update: another approach making animation-duration dependent on --var (as generated by def2png.php) works but is as slow as manipulating CSS classes.
      //
      //if (document.getAnimations) {
      //  _.invoke(document.getAnimations(), pause ? 'pause' : 'play')
      //}
      //
      //var func = pause ? 'setProperty' : 'removeProperty'
      //this.el[0].style[func]('--Ho', 0)
      //this.el[0].style[func]('--Hh', 0)
      //this.el[0].style[func]('--Ht', 0)
      //this.el[0].style[func]('--Hc', 0)
      //this.el[0].style[func]('--Hi', 0)
    },

    _stopDrag: function () {
      document.body.removeEventListener('mousemove', this._drag)
      this.sc.getSet('mapDragging', function (cur) {
        return cur == 'map' ? null : cur
      })
    },

    _drag: function (info, scOpt, e) {
      var dx = (e.pageX - info.x) * info.speed / info.cell
      var dy = (e.pageY - info.y) * info.speed / info.cell

      if (dx <= -1 || dx >= 1 || dy <= -1 || dy >= 1) {
        var pos = info.pos

        if (!pos) {  // first time scrolling during this drag gesture
          var cur = this.sc.getSet('mapDragging', function (cur) {
            return cur || 'map'
          })
          if (cur != 'map') {
            return document.body.removeEventListener('mousemove', this._drag)
          }
          pos = info.pos = this.sc.get('mapPosition')
        }

        var x = Math.round(pos[0] - dx)
        var y = Math.round(pos[1] - dy)
        var cur = scOpt.mapPosition
        if (cur[0] != x || cur[1] != y) {
          this.sc.set('mapPosition', [x, y])
        }
      }
    },

    _updateScroll: function () {
      var pos = this.sc.get('mapPosition')
      var view = this.sc.get('mapViewSize')
      var margin = this.sc.invisibleMapMargin()
      var added = this.get('addedMapScroll')
      // XXX+C,O doing in-thread has significant impact (100s of ms) on initial Context rendering; _.defer() would fix this
      this._mapWrapperEl.scrollLeft = added[0] + (pos[0] - (view[0] >>> 1) - margin[0]) * this.map.constants.tileSize
      this._mapWrapperEl.scrollTop  = added[1] + (pos[1] - (view[1] >>> 1) - margin[1]) * this.map.constants.tileSize
    },
  })
})