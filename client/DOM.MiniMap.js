define(['DOM.Common'], function (Common) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // Uses browser's DOM to draw a simplified tile-based adventure map.
  //
  // `'el is the node where tile nodes are placed. Usually it matches
  // `@DOM.UI.miniMapEl`@.
  //
  // This class is using the following CSS classes:
  //* Hroot__mmap, Hmmap*
  return Common.jQuery.extend('HeroWO.DOM.MiniMap', {
    mixIns: [Common.ScreenModule],
    el: {class: 'Hroot__mmap'},
    _rectEl: null,
    _levelEls: [],
    _cellEls: [],   // [z] => [n] => Element
    _mapWidth: 0,
    _ownable: 0,
    _movable: 0,
    _fogBits: null,
    _dragInfo: {},

    //> hidden bool `- if set, overlays mini-map with the shield image (happens in SoD during another player's turn)
    //> sharedEl true shared and this MiniMap took over`, false shared but other MiniMap is primary `- a hack to make hotseat games playable to avoid the explosion of DOM nodes
    _opt: {
      hidden: false,
      sharedEl: null,
    },

    events: {
      init: function () {
        this._drag = this._drag.bind(this, this.sc._opt, this._dragInfo)
      },

      change_hidden: function (now) {
        if (this.get('sharedEl') !== false) {
          this.el.toggleClass('Hmmap_hidden', now)
        }
      },

      change_sharedEl: function (now) {
        _.log && _.log('MiniMap P%d sharedEl : %j', this.sc.get('player'), now)

        if (now && this.get('rendered')) {
          this.get('attachPath').append(this.el)
          this.el.toggleClass('Hmmap_hidden', this.get('hidden'))
          this.update()
          this._updateShroudAll()
        }
      },

      '=attach': function (sup) {
        return sup(this, this.get('sharedEl') === false ? [null] : [])
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
        var info = this.map.get()
        this._mapWidth = info.width
        this._ownable = this.map.constants.miniMapTile.type.ownable
        this._movable = this.map.constants.miniMapTile.type.movable
        this._rectEl = this.el.children('.Hmmap_rect')[0]

        if (this._rectEl) {
          for (var z = 0; z < info.levels; z++) {
            var el = this._levelEls[z] = this.el[0].children[z]
            this._cellEls[z] = el.children
          }
        } else {
          var html = Array(info.width * info.height)

          for (var x = 0; x < info.width; x++) {
            for (var y = 0; y < info.height; y++) {
              html[x + y * info.width] =
                '<span class="Hmmap__cell Hmmap__cell_empty" style="' +
                'left:' + x + 'em;' +
                'top:' + y + 'em' +
                '"></span>'
            }
          }

          for (var z = 0; z < info.levels; z++) {
            if (!z) {
              var el = document.createElement('div')
              el.innerHTML = html.join('')
            } else {
              el = el.cloneNode(true)
            }
            this._levelEls[z] = el
            this._cellEls[z] = el.children
          }

          this.el.append(this._levelEls)
          this._rectEl = $('<div class=Hmmap_rect>').appendTo(this.el)[0]
        }

        var atter = this.map.miniMap.atter(['type', 'owner', 'terrain'])

        this.map.miniMap.find(0, function ($1, x, y, z, $5, n) {
          this._set({x: x, y: y, z: z}, atter(n, 0))
        }, this)

        this.autoOff(this.map.miniMap, {
          oadd: function (n, $2, props, options) {
            this.sc.transitions.updateUsing(null, options, this, function () {
              this._set(this.map.miniMap.fromContiguous(n), atter(props))
            })
          },
          oremove: function (n, $2, props, options) {
            this.sc.transitions.updateUsing(null, options, this, function () {
              var coords = this.map.miniMap.fromContiguous(n)
              var el = this._cellEls[coords.z][coords.x + coords.y * this._mapWidth]
              Common.oneClass(el, 'Hmmap__cell_', 'empty')
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
        if (this.get('sharedEl') === false) {
          return
        }

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
      mousedown: function (e) {
        if (this.get('sharedEl') !== false) {
          var cur = this.sc.getSet('mapDragging', function (cur) {
            return cur || 'miniMap'
          })
          if (!this.get('hidden') && cur == 'miniMap') {
            _.extend(this._dragInfo, this.el.offset())
            this._dragInfo.cell = this.el[0].getBoundingClientRect().width / this._mapWidth
            document.body.addEventListener('mousemove', this._drag)
            this._drag(e)
          }
        }
      },
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

    _set: function (coords, cell) {
      var el = this._cellEls[coords.z][coords.x + coords.y * this._mapWidth]

      Common.oneClass(el, 'Hmmap__cell_',
        'type_' + cell.type,
        // XXX H3 subsystem?
        'subtype_' + cell.type + '_' + (cell.type == this._ownable || cell.type == this._movable ? cell.owner : cell.terrain))
    },

    _updateShield: function () {
      // Sequential turns in classic mode - exactly one interactive player
      // at a time.
      var cur = this.map.players.find(Common.p('get', 'interactive'))
      this.set('hidden', !cur || cur.get('team') != this.pl.get('team'))
    },

    _updateZ: function (now) {
      if (this.get('sharedEl') !== false) {
        _.each(this._levelEls, function (el, z) {
          // Using visibility to control both _levelEls and individual cells makes _updateZ() much faster than when display is used.
          //el.style.visibility = z == now ? '' : 'hidden'
          el.style.zIndex = (z == now) - 1
        })
      }
    },

    _updateRectPos: function (pos) {
      if (this.get('sharedEl') !== false && this.get('rendered')) {
        this._rectEl.style.left = pos[0] + 'em'
        this._rectEl.style.top  = pos[1] + 'em'
      }
    },

    _updateShroudAll: function () {
      this.map.shroud.findWithin(false, this.pl.get('player'), null,
        this._updateShroud, this)
    },

    _updateShroud: function (x, y, z, player, visible) {
      if (this.get('sharedEl') === false) {
        return
      }

      if (!this.sc._opt.mapShroud) {
        visible = (this._fogBits || [0])[0]
      }

      var el = this._cellEls[z][x + y * this._mapWidth]
      el.style.display = visible >= 0 ? '' : 'none'

      // XXX=I partial shroud currently reveals presence of objects like border guard, hero, boat (albeit not their ownership thanks to grayscale(100%)); but they can't be simply hidden (like DOM.Map does) because map.miniMap stores info about either the impassable object or the terrain so if we hide the object we don't know what type of terrain to show; MiniMapTile can be (and should be) changed to store both fields
      if (visible >= 0 && this._fogBits) {
        el.classList.toggle('Hmmap__cell_fog', this._fogBits.indexOf(visible) == -1)
      }
    },
  })
})