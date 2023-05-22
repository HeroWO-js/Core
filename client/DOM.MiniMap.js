define(['DOM.Common', 'Canvas.MiniMap'], function (Common, CanvasMiniMap) {
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
  return CanvasMiniMap.extend('HeroWO.DOM.MiniMap', {
    _cellEls: [],   // [z] => [n] => Element

    //> sharedEl true shared and this MiniMap took over`, false shared but other MiniMap is primary `- a hack to make hotseat games playable to avoid the explosion of DOM nodes
    _opt: {
      sharedEl: null,
    },

    events: {
      '=attach': function (sup) {
        return sup(this, this.get('sharedEl') === false ? [null] : [])
      },

      '=change_hidden, =_update, =_mousedown, =_updateZ, =_updateRectPos': function (sup) {
        this.get('sharedEl') === false || sup(this, arguments)
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

      '=_createNodes': function () {
        var info = this.map.get()
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

          var random = Common.Sqimitive.unique('wr')
          var style = []
          _.each(this._miniMapColors, function (color, key) {
            style.push('.Hmmap__id_' + random + ' .Hmmap__cell_subtype_' + key +
                       '{background-color:#' + color + '}')
          })
          this.el.addClass('Hmmap__id_' + random)
            .append('<style>' + style.join(''))
        }
      },
    },

    // Called often so not made an =event.
    _set: function (coords, cell) {
      var el = this._cellEls[coords.z][coords.x + coords.y * this._mapWidth]

      Common.oneClass(el, 'Hmmap__cell_',
        !cell ? 'empty' :
          'type_' + cell.type,
          // XXX H3 subsystem?
          'subtype_' + cell.type + '_' + (cell.type == this._ownable || cell.type == this._movable ? cell.owner : cell.terrain))
    },

    // Called often so not made an =event.
    _updateShroud: function (x, y, z, player, visible) {
      if (this.get('sharedEl') === false) {
        return
      }

      if (!this.sc._opt.mapShroud) {
        visible = (this._fogBits || [0])[0]
      }

      var el = this._cellEls[z][x + y * this._mapWidth]
      el.style.display = visible >= 0 ? '' : 'none'

      // XXX=I:mmpso:
      if (visible >= 0 && this._fogBits) {
        el.classList.toggle('Hmmap__cell_fog', this._fogBits.indexOf(visible) == -1)
      }
    },
  })
})