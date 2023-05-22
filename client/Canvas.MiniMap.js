define(['DOM.Common'], function (Common) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // Uses browser's Canvas to draw a simplified tile-based adventure map.
  //
  // `'el is the node where new <canvas> are placed. Usually it matches
  // `@DOM.UI.miniMapEl`@.
  //
  // This class is using the following CSS classes:
  //* Hroot__mmap, Hmmap*
  return Common.jQuery.extend('HeroWO.Canvas.MiniMap', {
    mixIns: [Common.ScreenModule],
    el: {class: 'Hroot__mmap'},
    _rectEl: null,
    _levelEls: [],    // [z] => Canvas
    _contexts: [],    // [z] => CanvasRenderingContext2D
    _mapWidth: 0,
    _ownable: 0,
    _movable: 0,
    _miniMapColors: null,
    // Color of the node under this.el; black in production, and with unexplored
    // areas (taking most of the map on average) drawn in black this results in
    // less calls to fillRect().
    _background: null,
    _atter: null,
    _fogBits: null,
    _dragInfo: {},

    //> hidden bool `- if set, overlays mini-map with the shield image (happens in SoD during another player's turn)
    //> alpha bool `- argument to `'getContext(); enabling in production may
    //  improve performance:
    //  `@https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext#alpha`@
    _opt: {
      hidden: false,
      alpha: false,
    },

    events: {
      init: function () {
        this._drag = this._drag.bind(this, this.sc._opt, this._dragInfo)
      },

      '+normalize_alpha': Common.normBool,

      change_hidden: function (now) {
        this.el.toggleClass('Hmmap_hidden', now)
      },

      attach: function () {
        Common.autoOffNode(this, document.body, {
          mouseup: '_stopDrag',
        })

        this.autoOff(this.sc, {
          change_z: '_updateZ',
          change_mapShroud: '_updateShroudAll',
          change_mapMargin: 'update',
          change_mapViewSize: 'update',
          change_mapPosition: '_updateRectPos',
        })

        // XXX H3 subsystem
        if (this.cx.get('classic')) {
          this.autoOff(this.map.players, {
            '.change': function ($, opt) {
              switch (opt) {
                case 'interactive':
                case 'team':
                  this._updateShield()
              }
            },
          })

          this._updateShield()
        }
      },

      '-unnest': '_stopDrag',

      '-render': function () {
        this._mapWidth = this.map.get('width')
        this._ownable = this.map.constants.miniMapTile.type.ownable
        this._movable = this.map.constants.miniMapTile.type.movable
        this._miniMapColors = this.map.constants.miniMapColors
        this._background = this._opt.alpha ? '00ffff' /*cyan, from CSS*/ : '000000'
        this._createNodes()
        this._rectEl = this._rectEl || $('<div class=Hmmap_rect>').appendTo(this.el)[0]

        var atter = this._atter = this.map.miniMap.atter(['type', 'owner', 'terrain'])
        var first = true

        this.map.miniMap.find(0, function ($1, x, y, z, $5, n) {
          this._set({x: x, y: y, z: z}, atter(n, 0), first)
          first = false
        }, this)

        this.autoOff(this.map.miniMap, {
          oadd: function (n, $2, props, options) {
            this.sc.transitions.updateUsing(null, options, this, function () {
              this._set(this.map.miniMap.fromContiguous(n), atter(props))
            })
          },
          oremove: function (n, $2, props, options) {
            this.sc.transitions.updateUsing(null, options, this, function () {
              this._set(this.map.miniMap.fromContiguous(n))
            })
          },
          ochange: function (n, $2, $3, $4, $5, options) {
            var props = atter(n, 0)
            // XXX+B,R for mapMove this currently plays one tick earlier (two ticks at the beginning before DOM.Map starts animating the movement, then each tick at N-1 when Map is animating N, then completion one tick earlier while Map is still playing animation); either mapMove ticks should be adjusted (e.g. transitionFace with tick of N, subsequent coords change at N+1, then transitionFace before next move at N+1, coords at N+2, etc.) or DOM.Map should play them differently
            this.sc.transitions.updateUsing(null, options, this, function () {
              this._set(this.map.miniMap.fromContiguous(n), props)
            })
          },
        })
      },

      render: function () {
        if (this.map.shroud) {
          var player = this.pl.get('player')
          var fog = !this.cx.get('classic')
          // XXX H3-specific
          this._fogBits = fog ? this.map.constants.shroud.visible : null

          this._updateShroudAll()

          this.autoOff(this.map.shroud, {
            // XXX+I should respect transition ticks, i.e. gradually open the shroud during moveHero
            changes: function (tiles) {
              _.each(tiles, function (tile) {
                // [6] is true if visibility state (not bit) changed, i.e. if
                // old is negative and new is positive or vice versa. In classic
                // mode such tiles are skipped since there is no fog and hence
                // all positive bits are rendered the same, and all negative bits
                // too. In non-classic mode different positive bits may look
                // differenly (depending on _fogBits).
                if ((fog || tile[6]) && tile[3] == player) {
                  _.log && _.log('MiniMap shroud update : (%d;%d;%d)', tile[0], tile[1], tile[2])
                  this._updateShroud.apply(this, tile)
                }
              }, this)
            },
          })
        }
      },

      _update: function () {
        this.el.toggleClass('Hmmap_margin', this.sc.get('mapMargin'))

        var margin = this.sc.invisibleMapMargin()

        // Make the mini-map square, regardless of the outside this.el
        // or map dimensions (which can be non-square). Like in Warcraft 3.
        var w = this._mapWidth         - margin[0] - margin[2]
        var h = this.map.get('height') - margin[1] - margin[3]
        var largest = Math.max(w, h)

        this.el.css({
          left:     (largest - w) / 2 + 'em',
          top:      (largest - h) / 2 + 'em',
          right:    (largest - w) / 2 + 'em',
          bottom:   (largest - h) / 2 + 'em',
          // Using the same unit (%/em) to specify both horizontal and
          // vertical coordinates - this works as long as mmap-wr is square.
          // If it isn't, we will have to know wr's width and height in
          // pixels and calculate absolute values in this module rather
          // than having the browser do it using relative values.
          // Note that using % for font-size doesn't mean "width of the parent"
          // so font-size of the parent must be set to its width in the CSS.
          fontSize: 1 / largest * 100 + '%',
        })

        _.each(this._levelEls, function (node) {
          node.style.left = -margin[0] + 'em'
          node.style.top  = -margin[1] + 'em'
        })

        var view = this.sc.get('mapViewSize')

        this._rectEl.style.width      = view[0] + 'em'
        this._rectEl.style.height     = view[1] + 'em'
        this._rectEl.style.marginLeft = -(view[0] >>> 1) - margin[0] + 'em'
        this._rectEl.style.marginTop  = -(view[1] >>> 1) - margin[1] + 'em'

        this._updateZ(this.sc.get('z'))
        this._updateRectPos(this.sc.get('mapPosition'))
      },
    },

    elEvents: {
      mousedown: '_mousedown',
    },

    _createNodes: function () {
      var info = this.map.get()

      for (var z = info.levels; z--; ) {
        this._levelEls[z] = $('<canvas>')
          .attr({width: info.width, height: info.height})
          .css({width: info.width + 'em', height: info.height + 'em'})
          .appendTo(this.el)[0]

        this._contexts[z] = this._levelEls[z].getContext('2d', {alpha: this.get('alpha'), desynchronized: true})
      }
    },

    _mousedown: function (e) {
      var cur = this.sc.getSet('mapDragging', function (cur) {
        return cur || 'miniMap'
      })
      if (!this.get('hidden') && cur == 'miniMap') {
        _.extend(this._dragInfo, this.el.offset())
        this._dragInfo.cell = this.el[0].getBoundingClientRect().width / this._mapWidth
        document.body.addEventListener('mousemove', this._drag)
        this._drag(e)
      }
    },

    _stopDrag: function () {
      document.body.removeEventListener('mousemove', this._drag)
      this.sc.getSet('mapDragging', function (cur) {
        return cur == 'miniMap' ? null : cur
      })
    },

    _drag: function (scOpt, info, e) {   // bound
      var x = Math.round(Math.max(0, e.pageX - info.left) / info.cell)
      var y = Math.round(Math.max(0, e.pageY - info.top)  / info.cell)
      var cur = scOpt.mapPosition
      if (cur[0] != x || cur[1] != y) {
        this.sc.set('mapPosition', [x, y])
      }
    },

    _set: function (coords, cell, whole) {
      var visible = !this.sc._opt.mapShroud ? (this._fogBits || [0])[0]
        : cell && 'visible' in cell ? cell.visible
        : this.map.shroud.atCoords(coords.x, coords.y, coords.z, this.pl._opt.player)

      var color = this._background

      if (visible >= 0) {
        if (cell) {
          color = this._miniMapColors[cell.type + '_' + (cell.type == this._ownable || cell.type == this._movable ? cell.owner : cell.terrain)]
        }

        // XXX=I: mmpso: partial shroud currently reveals presence of objects like border guard, hero, boat (albeit not their ownership thanks to grayscale being applied); but they can't be simply hidden (like DOM.Map does) because map.miniMap stores info about either the impassable object or the terrain so if we hide the object we don't know what type of terrain to show; MiniMapTile can be (and should be) changed to store both fields
        if (this._fogBits && this._fogBits.indexOf(visible) == -1) {
          // https://en.wikipedia.org/wiki/Grayscale
          var c = +('0x' + color)
          c = ((c & 0xFF) * 0.114 + (c >> 8 & 0xFF) * 0.587 + (c >> 16) * 0.299 | 0).toString(16)
          c.length == 1 && (c = '0' + c)
          color = c + c + c
        }
      }

      if (whole === true) {
        this._contexts[coords.z].clearRect(0, 0, this._mapWidth, this.map.get('height'))
      }

      if (whole == null || color != this._background) {
        var cx = this._contexts[coords.z]
        cx.fillStyle = '#' + color
        cx.fillRect(coords.x, coords.y, 1, 1)
      }
    },

    _updateShield: function () {
      // Sequential turns in classic mode - exactly one interactive player
      // at a time.
      var cur = this.map.players.find(Common.p('get', 'interactive'))
      this.set('hidden', !cur || cur.get('team') != this.pl.get('team'))
    },

    _updateZ: function (now) {
      _.each(this._levelEls, function (el, z) {
        // Using visibility to control both _levelEls and individual cells (in DOM.MiniMap) makes _updateZ() much faster than when display is used.
        //el.style.visibility = z == now ? '' : 'hidden'
        el.style.zIndex = (z == now) - 1
      })
    },

    _updateRectPos: function (pos) {
      if (this.get('rendered')) {
        this._rectEl.style.left = pos[0] + 'em'
        this._rectEl.style.top  = pos[1] + 'em'
      }
    },

    _updateShroudAll: function () {
      this.map.shroud.findWithin(false, this.pl.get('player'), null,
        this._updateShroud, this)
    },

    _updateShroud: function (x, y, z, player, visible) {
      var cell = this._atter(x, y, z, 0)
      cell.visible = visible
      // type is null if there are no objects at spot, e.g. within margin.
      this._set({x: x, y: y, z: z}, cell.type == null ? null : cell, arguments.length == 5 /*from findWithin(), not 'changes'*/ ? !x && !y : null)
    },
  })
})