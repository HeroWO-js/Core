define(['DOM.Common'], function (Common) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  function toggle(el, visible) {
    el.style.display = visible ? '' : 'none'
  }

  // Uses browser's DOM to draw adventure map objects and create a square grid.
  //
  // `'el is the node where object nodes are placed. Usually it matches
  // `@DOM.UI.mapEl`@.
  //
  // Renders in an infinitely large container. Doesn't handle scrolling
  // (this is done by `@DOM.UI`@).
  //
  // This class is using the following CSS classes:
  //* Hgrid*, Hmaps, Hmap*, Hroot__map*
  //* content of AObject->$texture (Hh3-def_frame_*)
  //* content of AObject->$animation (Hanim, Hh3-anim_id_*)
  //* content of shroud.edge const (Hh3-def_frame_*)
  //
  // H3.DOM.UI also changes classes of
  //* Hgrid children (Hh3-root_cursor_a-*; Route: Hh3-def_frame_ADAG-*)
  //
  // XXX=I DOM.Map draws shadows incorrectly: SoD separates shadow from picture while def2png.php combines them. If an object overlaps another, its shadow should be drawn behind the other, not on top of it like it currently happens. This won't be fixed in DOM.Map (as it will double the required number of nodes).
  var DomMap = Common.jQuery.extend('HeroWO.DOM.Map', {
    mixIns: [Common.ScreenModule],
    _mapsEl: null,
    _gridEl: null,
    _levelEls: null,  // array z => Element
    _cellEls: null,   // array x*y => Element
    _objectEls: null,
    _tileSize: 0,
    _mapWidth: 0,
    _shroudAll: null,
    _objectAtter: null,

    // SoD AClass->$name-s that should be hidden when a tile is explored but not visible (has partial fog). Lists objects that may either change position (hero) or disappear (monster, artifact, etc.). Ownable objects are not listed, they are shown but as of the neutral $owner.
    //
    // XXX+C    XXX=R maybe add a databank property and move there
    _foggedClasses: 'artifact boat borderGuard campfire event flotsam grail hero heroPlaceholder monster pandoraBox prison questGuard randomArtifact randomHero randomMajorArtifact randomMinorArtifact randomMonster randomMonster1 randomMonster2 randomMonster3 randomMonster4 randomMonster5 randomMonster6 randomMonster7 randomRelic randomResource randomTreasureArtifact resource scholar seaChest shipwreckSurvivor spellScroll treasureChest',

    _opt: {
      // See DOM.MiniMap for the explanation.
      sharedEl: null,
    },

    events: {
      change_sharedEl: function (now) {
        _.log && _.log('Map P%d sharedEl : %j', this.sc.get('player'), now)

        if (now && this.get('rendered')) {
          this.get('attachPath').append(this.el)
          this.map.objects.find('id', function (id) {
            var cur = this._objectEls[id]
            if (!cur) {
              this._objectEls[id] = this.el.find('[data-Hid="' + id + '"]')[0]
            } else if (!cur.parentNode) {
              delete this._objectEls[id]
            }
          }, this)
          this.update()
          this._updateShroudAll()

          var self = this
          var scOpt = this.sc._opt
          var random = this._gridEl.firstElementChild
            .getAttribute('onmouseenter').match(/^E([^(]+)/)[1]
          window['E' + random] = function (el) { self._gridMouseEnter(el, scOpt) }
          window['L' + random] = this._gridMouseLeave.bind(this, scOpt, this._gridEl)
        }
      },

      '=attach': function (sup) {
        return sup(this, this.get('sharedEl') === false ? [null] : [])
      },

      attach: function () {
        this._tileSize = this.map.constants.tileSize

        this.autoOff(this.sc, {
          change_z: function (now) {
            this._updateZ(now)
            this.map.shroud && this._updateShroudAll()
          },
          change_mapShroud: '_updateShroudAll',
          change_classic: '_updateShroudAll',
          change_mapGrid: 'update',
          change_mapAnimate: 'update',
          change_mapMargin: 'update',
          change_mapDragging: function (now) {
            // Having to update current cell during dragging is non-informative
            // and slow.
            now && this.sc.set('mouseCell', null)
          },
        })
      },

      '-render': function () {
        var info = this.map.get()
        this._mapWidth = info.width
        this._mapsEl = this.el.children('.Hmaps')[0]

        if (this._mapsEl) {
          this._gridEl = this.el.children('.Hgrid')[0]
        } else {
          // Should go before Hgrid so that the latter has higher z-index.
          this._mapsEl = $('<div class=Hmaps>')
            .append(_.repeat('<div class=Hmap></div>', info.levels))
            .appendTo(this.el)
            [0]

          this._gridEl = $('<div class=Hgrid>').appendTo(this.el)[0]

          var self = this
          var scOpt = this.sc._opt
          var random = '$' + Common.Sqimitive.unique('wr')
          window['E' + random] = function (el) { self._gridMouseEnter(el, scOpt) }
          window['L' + random] = this._gridMouseLeave.bind(this, scOpt, this._gridEl)
          this.once('unnest', function () {
            delete window['E' + random]
            delete window['L' + random]
          })

          // Unlike onmouseover/out, these don't bubble and are supposedly faster.
          //
          // "The attribute value can remain unquoted if it doesn't contain ASCII whitespace or any of " ' ` = < or >."
          // https://html.spec.whatwg.org/multipage/introduction.html#a-quick-introduction-to-html:syntax-attributes
          var listeners = ' onmouseenter=E' + random + '(this) onmouseleave=L' + random + '(event)'

          var html = Array(info.width * info.height)

          for (var x = 0; x < info.width; x++) {
            for (var y = 0; y < info.height; y++) {
              html[x + y * info.width] =
                '<div class="Hgrid__cell' +
                  (x < info.margin[0] || x >= info.width  - info.margin[2] ||
                   y < info.margin[1] || y >= info.height - info.margin[3]
                    ? ' Hgrid__cell_margin' : '') +
                '" style="' +
                'left:' + x * this._tileSize + 'px;' +
                'top:'  + y * this._tileSize + 'px;' +
                'width:'  + this._tileSize + 'px;' +
                'height:' + this._tileSize + 'px' +
                '" data-Hxy=' + x + ',' + y +
                listeners +
                '></div>'
            }
          }

          this._gridEl.innerHTML = html.join('')
        }

        this._levelEls = this._mapsEl.children
        this._cellEls = this._gridEl.children
        this._objectEls = Array(this.map.objects * 1.1 | 0)

        var reflect = ['x', 'y', 'z', 'width', 'height', 'displayOrder',
                       'mirrorX', 'mirrorY', 'texture', 'animation']

        // Not updating the UI when 'duration' changes since it specifies just the
        // starting animation-delay. It certainly changes together with 'animation'
        // and then we update.
        //
        // owner is needed to determine animation duration (my/enemy's).
        var atter = this._objectAtter = this.map.objects.atter(reflect.concat('id', 'class', 'type', 'duration', 'owner',
          // Needed for actionableSpot() called by scrollTo() and tick.
          'width', 'height', 'x', 'y', 'z', 'actionable'))
        reflect = reflect.map(this.map.objects.propertyIndex, this.map.objects)

        if (this.get('sharedEl') !== false) {
          this.map.objects.find(0, function ($1, $2, $3, $4, $5, n) {
            this._add(atter(n, 0))
          }, this)
        }

        this.autoOff(this.sc.transitions, {
          '+select_mapMove': function (res, tr) {
            return this.get('sharedEl') !== false && 'map'
          },
          '+select_mapDisembark, +select_mapEmbark, +select_mapTeleport': function (res, tr) {
            return this.get('sharedEl') !== false &&
                   /*this.pl.heroes.nested(tr.get('object')) &&*/ 'map'
          },
          'nest_mapDisembark, nest_mapEmbark, nest_mapMove, nest_mapTeleport': function (view) {
            var props = []
            view.set(this._cid, true)
            this.autoOff(view, {
              collect: function (tr, tick) {
                switch (view.get('type')) {
                  case 'mapMove':
                    var path = tr.get('path')[tick]
                    if (path) {   // not first or last tick
                      var pos = this.map.actionableSpot(tr.get('object'), true)
                      path = {x: path[0] - pos[0], y: path[1] - pos[1]}
                    }
                }
                props.push(_.extend(atter(tr.get('object'), 0, 0, 0), path))
              },
              final: function (tr) {
                switch (view.get('type')) {
                  case 'mapMove':
                    return view.set('ticks', props.length - 1)
                }
              },
              tick: function (async, tick) {
                var obj = props[tick]
                switch (view.get('type')) {
                  case 'mapMove':
                    var el = this._objectEls[view.get('object')]
                    // Not animating original position.
                    if (!tick || !el) { return }
                    // mapMove collect and play tick: 0 = original position,
                    // zero or more {after spot effects but before position
                    // change}, last = after all changes (has no associated path
                    // entry).
                    //
                    // Other transitions' collect tick: 0 = original, 1 = after
                    // changes; play has 1 tick.
                    if (this.map.shroud && this.sc.get('mapShroud')) {
                      var visible = this.cx.get('classic') ? _.values(this.map.constants.shroud) : this.map.constants.shroud.visible
                      var pos = this.map.actionableSpot(obj)
                      var vis = this.map.shroud.atCoords(pos[0], pos[1], pos[2], this.pl.get('player'))
                      if (!(vis >= 0) || !_.includes(visible, vis)) {
                        pos = this.map.actionableSpot(props[tick - 1])
                        var vis = this.map.shroud.atCoords(pos[0], pos[1], pos[2], this.pl.get('player'))
                        if (!(vis >= 0) || !_.includes(visible, vis)) {
                          // Don't show or animate if original and new object spots are not revealed.
                          return this._set(obj, el, {shroudState: false})
                        }
                      }
                    }
                    if (this.cx.get('classic')) {
                      // Sequential turns, follow own and other players' heroes on map.
                      //
                      // XXX+I SoD does smooth scroll (not tile-by-tile) - add "mapLockMove" to Screen, set it during transition and manually animate scroll position
                      this.sc.scrollTo(obj)
                    }
                    if (tick == props.length - 2) {  // last animation
                      if (view.get('mapDisembark')) {
                        view.set('parallel', [view.get('mapDisembark')])
                      } else if (view.get('mapEmbark')) {
                        obj.texture = Common.alterStringifiedArray(obj.texture, 1,
                          Common.alterStringifiedArray(props[tick - 1].texture)[1])
                        obj.animation = Common.alterStringifiedArray(obj.animation, 1,
                          Common.alterStringifiedArray(props[tick - 1].animation)[1])
                        obj.duration = props[tick - 1].duration
                        var boat = this.sc.transitions.nested(view.get('mapEmbark')).get('mapBoat')
                        // +-+-+-+    from N to B(oat):
                        // |1|2|3|    1 upRight/mirrorX, 2 up, 3 upRight,
                        // |4|B|6|    4 right/mirrorX, 6 right,
                        // |7|8|9|    7 downRight/mirrorX, 8 down, 9 downRight
                        // +-+-+-+
                        var heroSpot = this.map.actionableSpot(props[tick - 1])
                        var boatSpot = this.map.actionableSpot(boat)
                        // XXX=R duplicates with _moveOpt()
                        // XXX H3 subsystem
                        var dx = heroSpot[0] - boatSpot[0]
                        var dy = heroSpot[1] - boatSpot[1]
                        var group = this.rules.constants.animation.group[
                          (dy < 0 ? 'up' : dy > 0 ? 'down' : '') +
                          (!dx ? '' : dy ? 'Right' : 'right')
                        ]
                        boat.mirrorX = dx < 0
                        boat.texture = Common.alterStringifiedArray(boat.texture, 4, group)
                        boat.animation = Common.alterStringifiedArray(boat.animation, 4, group)
                        this._set(boat, this._objectEls[boat.id], {animating: 'mapEmbark'})
                      }
                    }
                    this._transition(obj, el, async)
                    return
                  case 'mapTeleport':
                    if (this.pl.heroes.nested(view.get('object'))) {
                      this.sc.scrollTo(props[1])
                    }
                    return
                }
              },
              end: function () {
                // Apply final properties to el, in case somebody changed el
                // while animation was running (as H3.DOM.UI does).
                var el = this._objectEls[view.get('object')]
                // el could have been removed by oremove that wasn't part of any transition.
                // This is technically incorrect but XXX+I transitions currently don't
                // cover most of the code so doing nothing if this has happened.
                el && this._set(props.pop(), el, {})
              },
            })
          },
        })

        this.autoOff(this.map.objects, {
          '^oadd': function ($1, $2, props, options) {
            if (this.get('sharedEl') !== false) {
              this._add(atter(props), this._opt.rendered)
              var el = this._objectEls[props[atter.idIndex]]
              el.style.visibility = 'hidden'
              this.sc.transitions.updateUsing(null, options, this, function () {
                el.style.visibility = ''
              })
            }
          },
          '^oremove': function ($1, $2, props, options) {
            if (this.get('sharedEl') !== false) {
              this.sc.transitions.updateUsing(null, options, this, function () {
                var el = this._objectEls[props[atter.idIndex]]
                el.parentNode.removeChild(el)
                delete this._objectEls[props[atter.idIndex]]
              })
              var view = this.sc.transitions.of(options.transition, this._cid)
              if (view && view.get('type') == 'mapEmbark') {
                view.set('mapBoat', atter(props))
              }
            }
          },
          // '^' is necessary to obtain object properties (atter()) exactly at the time of change.
          '^ochange': Common.batchGuard(5, function ($1, $2, $3, $4, $5, options) {
            if (this.get('sharedEl') === false) {
              return
            }

            var objects = new Set

            options.batch
              .forEach(function (event) {
                if (event[0] == 'ochange' &&
                    reflect.indexOf(event[3]) != -1 &&
                    !this.sc.transitions.of(event[6].transition, this._cid) &&
                    objects.size != objects.add(event[1]).size) {
                  var obj = atter(event[1], 0)
                  this._set(obj, this._objectEls[obj.id], {})
                }
              }, this)
          }),
        })
      },

      render: function () {
        // XXX=R shroud logic is H3-specific; refactor it to a subclass or, more likely, to a dynamic mixin since DOM.Map is nested by environment
        if (this.map.shroud) {
          var player = this.pl.get('player')
          var mapWidth = this._mapWidth
          var mapHeight = this.map.get('height')

          var rules = this.cx.modules.nested('HeroWO.H3.Rules')
          var names = this._foggedClasses
          this._foggedClasses = new Set
          _.each(names.split(' '), function (name) {
            _.each(rules.objectsID[name],
                   this._foggedClasses.add, this._foggedClasses)
           }, this)

          var all = this._shroudAll = Array(mapWidth * mapHeight)
          var n = 0

          for (var y = 0; y < mapHeight; y++) {
            all[y] = Array(mapWidth)

            for (var x = 0; x < mapWidth; x++) {
              all[y][x] = [x, y, n++]
            }
          }

          this._updateShroudAll()

          this.autoOff(this.map.shroud, {
            // XXX+I should respect transition ticks, i.e. gradually open the shroud during moveHero
            changes: function (tiles) {
              var z = this.sc.get('z')
              var fog = !this.cx.get('classic')

              var toUpdate = []
              var added = new Map

              tiles.forEach(function (tile) {
                if ((fog || tile[6]) && tile[3] == player && tile[2] == z) {
                  // Since tile frame depends on adjacent tiles, changing state
                  // of one tile causes refresh of 8 tiles around it.
                  var x0 = Math.max(0, tile[0] - 1)
                  var x1 = Math.min(mapWidth - 1, tile[0] + 1)
                  var y0 = Math.max(0, tile[1] - 1)
                  var y1 = Math.min(mapHeight - 1, tile[1] + 1)
                  var nTile = tile[0] + tile[1] * mapWidth

                  for (var x = x0; x <= x1; x++) {
                    for (var y = y0; y <= y1; y++) {
                      var n = x + y * mapWidth
                      var nAdded = added.get(n)
                      if (nAdded === undefined) {
                        // [4] null = "state unknown", undefined = "no bits set", other int = "that bit set"
                        added.set(n, toUpdate.push([x, y, n, , nTile == n ? tile[4] : null]))
                      } else if (nTile == n) {
                        toUpdate[nAdded - 1][4] = tile[4]
                      }
                    }
                  }
                }
              })

              this._updateShroud(toUpdate)
            },
          })
        }
      },

      _update: function () {
        if (this.get('sharedEl') === false) {
          return
        }

        this.el
          .toggleClass('Hroot__map_grid',   this.sc.get('mapGrid'))
          .toggleClass('Hroot__map_margin', this.sc.get('mapMargin'))

        this.el.toggleClass('Hroot__map_anim_no', !this.sc.get('mapAnimate'))
        this.el.toggleClass('Hroot__map_anim_yes', this.sc.get('mapAnimate'))

        var margin = this.sc.invisibleMapMargin()

        this.el.css({
          width:  (this.map.get('width')  - margin[0] - margin[2]) * this._tileSize,
          height: (this.map.get('height') - margin[1] - margin[3]) * this._tileSize,
        })

        function setMargin(el, tile) {
          el.style.marginLeft = margin[0] * -tile + 'px'
          el.style.marginTop  = margin[1] * -tile + 'px'
        }

        setMargin(this._gridEl, this._tileSize)
        setMargin(this._mapsEl, this._tileSize)

        this._updateZ(this.sc.get('z'))
      },
    },

    elEvents: {
      'mousedown .Hgrid__cell': '_click',
      'click .Hgrid__cell': '_click',
    },

    _click: function (e) {
      if (this.get('sharedEl') === false ||
          // DOM.UI enables scroll-by-dragging in non-classic mode. In this case we can't react to mousedown and have to wait until click (when it's clear that mousedown is not a drag). In classic mode react to mousedown immediately.
          (!e.button && (e.type == 'mousedown') != this.cx.get('classic')) ||
          (e.button && e.button != 2)) {
        return
      }
      var xy = e.target.getAttribute('data-Hxy').split(',')
      this.sc[['cellClick', , 'cellRightClick'][e.button]](+xy[0], +xy[1], this.sc.get('z'))
    },

    //= Element
    objectEl: function (id) {
      return this._objectEls[id]
    },

    //= Element
    gridCellAt: function (x, y) {
      return this._cellEls[x + y * this._mapWidth]
    },

    _add: function (obj, rendered) {
      var el = this._objectEls[obj.id] = document.createElement('div')
      el.setAttribute('data-Hid', obj.id)   // used if sharedEl
      this._set(obj, el, {add: true, shroudState: rendered ? null : 0})
    },

    // Must not access data outside of obj (used in transition).
    _set: function (obj, el, options) {
      if (this.get('sharedEl') === false) {
        return
      }

      if (el.parentNode != this._levelEls[obj.z]) {
        if (!options.add && !el.parentNode) { return }    // removed while in transition
        this._levelEls[obj.z].appendChild(el)
      }

      if (options.animating) {
        toggle(el, true)
      } else {
        // Hide objects fully covered in shroud, for performance. Show objects
        // on the shroud edge since edge is partially visible.
        //
        // If fog (partial shroud) is enabled, still hide fully shrouded objects,
        // but if some parts are visible, check their bits: if any set bit is
        // part of revealed bit list then show the object in full, else check
        // _foggedClasses and hide it if not listed, or show as neutral if it is.
        if (this.map.shroud) {
          var show = options.shroudState

          if (show != null) {
            // Use the provided value.
          } else if (!this.sc.get('mapShroud')) {
            show = 2
          } else {
            var visible = this.cx.get('classic') ? null : this.map.constants.shroud.visible
            var player = this.pl.get('player')

            this._walkAroundObjectBox(_.extend({}, obj), function (o) {
              var vis = this.map.shroud.atCoords(o.mx, o.my, o.mz, player)
              if (!(vis >= 0)) {
                // Invisible.
              } else if (!visible || visible.indexOf(vis) != -1) {
                return show = 2   // fully visible spot, break
              } else {
                show = 1          // explored
              }
            })
          }

          if (show === 1) {
            if (this._foggedClasses.has(obj.class)) {
              show = 0
            } else {    // explored at most, show object as owned by neutral
              // XXX=R duplicates with H3.Rules
              obj = _.extend({}, obj, {
                texture: Common.alterStringifiedArray(obj.texture, 3, function (s) { return s.replace(/(^|-)\w+Owner-/, '$1') }),
                animation: Common.alterStringifiedArray(obj.animation, 3, function (s) { return s.replace(/(^|-)\w+Owner-/, '$1') }),
                // Assuming all possible owners' animations have the same duration.
              })
            }
          }
        } else {
          var show = true
        }

        toggle(el, show && obj.displayOrder >= 0)

        el.style.left = obj.x * this._tileSize + 'px'
        var shift = obj.type == this.map.constants.object.type.road
          ? this._tileSize / 2 : 0
        el.style.top  = obj.y * this._tileSize + shift + 'px'
      }

      el.style.width  = obj.width  * this._tileSize + 'px'
      el.style.height = obj.height * this._tileSize + 'px'
      el.style.zIndex = obj.displayOrder

      el.style.transform = !obj.mirrorX && !obj.mirrorY ? ''
        : 'scale(' + (obj.mirrorX ? '-' : '') + '1,' +
                     (obj.mirrorY ? '-' : '') + '1)'

      el.style.setProperty('--Hh', '')

      var cls = 'Hmap__obj ' + ((obj.texture || '') + ' ' + (obj.animation || '')).replace(/,/g, '')
      // Change animation-delay only if texture or animation changed to avoid
      // leaps in playing animation. duration by itself cannot change.
      if (el.className != cls) {
        el.style.animationDelay = obj.duration && !options.animating ? _.random(obj.duration - 1) + 'ms' : ''
        el.className = cls
      }
    },

    _walkAroundObjectBox: function (obj, func) {
      obj.x > 0 && (obj.x--, obj.width++)
      obj.y > 0 && (obj.y--, obj.height++)
      obj.x + obj.width  < this._mapWidth && obj.width++
      obj.y + obj.height < this.map.get('height') && obj.height++
      return this.map.walkObjectBox(obj, 1, func, this)
    },

    _transition: function (obj, el, async) {
      this._set(obj, el, {animating: 'mapMove'})
      var options = this._transitionOptions(obj)
      options.complete = async.nestDoner()
      $(el).css('--Hh', options.scale).animate(options.properties, options)
    },

    _transitionOptions: function (obj) {
      // DEF's duration is too long so take 67% of it to obtain some normalized, good for defaults duration. XXX fix def2png.php?
      var scale = 0.67 * this.sc.get(obj.owner == this.pl.get('player') ? 'mapOwnSpeed' : 'mapEnemySpeed')
      return {
        properties: {
          left:       obj.x * this._tileSize,
          top:        obj.y * this._tileSize,
        },
        scale: scale,
        duration: obj.duration * scale,
        easing: 'linear',
      }
    },

    _gridMouseEnter: function (el, scOpt) {
      if (!scOpt.mapDragging) {
        var xy = el.getAttribute('data-Hxy').split(',')
        var cur = scOpt.mouseCell
        if (!cur || xy[0] != cur[0] || xy[1] != cur[1]) {
          this.sc.set('mouseCell', xy)
        }
      }
    },

    _gridMouseLeave: function (scOpt, gridEl, e) {
      if (!scOpt.mapDragging && (!e.relatedTarget || e.relatedTarget.parentNode != gridEl)) {
        this.sc.set('mouseCell', null)
      }
    },

    _updateZ: function (now) {
      if (this.get('sharedEl') === false) {
        return
      }
      _.each(this._levelEls, function (el, z) {
        //toggle(el, z == now)
        // If invisible, make -1. If visible, make 0 to be overlaid by Hgrid.
        el.style.zIndex = (z == now) - 1
      })
    },

    _updateShroudAll: function () {
      this.get('rendered') && this._updateShroudSorted(this._shroudAll, [])
    },

    _updateShroud: function (tiles) {
      var mapHeight = this.map.get('height')
      // array y => array of tile, in any order, without duplicates
      var byRow = Array(mapHeight)
      var visibility = Array(this._mapWidth * mapHeight)   // XL ~ 21k

      for (var i = 0; i < tiles.length; i++) {
        var tile = tiles[i]   // array of  x, y, n, , [visible]
        ;(byRow[tile[1]] || (byRow[tile[1]] = [])).push(tile)
        visibility[tile[2]] = tile[4] === undefined ? -1 /*no bits set*/ : tile[4]
      }

      i && this._updateShroudSorted(byRow, visibility)
    },

    _updateShroudSorted: function (byRow, visibility) {
      if (this.get('sharedEl') === false) {
        return
      }

      var player = this.pl.get('player')
      var z = this.sc.get('z')
      var mapWidth = this._mapWidth
      var mapHeight = this.map.get('height')
      var classic = this.cx.get('classic')
      var fog = !classic
      var visible = fog ? this.map.constants.shroud.visible : null
      var repeatRandom = this.map.get('random') * 0x80000000 | 0
      var rules = this.cx.modules.nested('HeroWO.H3.Rules')
      var repeatFrames = rules.animations.atCoords(rules.animationsID.TSHRC_0, 0, 0, 'frameCount', 0)

      var repeat  = this.map.constants.shroud.repeat
      var edge    = this.map.constants.shroud.edge
      var key     = this.map.constants.shroud.edgeKey

      var objects = new Map

      if (this.sc.get('mapShroud')) {
        var isVisible = function (tile, dx, dy) {
          var x = dx + tile[0]
          var y = dy + tile[1]

          if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) {
            // See Images.txt. Checking tile outside of map boundaries.
            // Always invisible if have both dx/dy non-0 (corner tile), else
            // (side tile) take state of main tile:   ---_---    (_) side
            //                                       |   T   |   (T) byRow's
            return !dx || !dy ? isVisible(tile, 0, 0) : -1
          }

          var n = tile[2] + dx + dy * mapWidth
          var vis = visibility[n]

          if (vis == null) {
            vis = this.atCoords(x, y, z, player)
            if (vis === undefined) { vis = -1 }
            visibility[n] = vis
          }

          return vis
        }.bind(this.map.shroud)
      } else {
        var isVisible = new Function('return ' + (fog ? visible[0] : 0))
      }

      for (var y = 0; y < byRow.length; y++) {
        var row = byRow[y] || []

        _.log && row.length && _.log('Map shroud update : %d Xs at Y=%d Z=%d', row.length, y, z)

        for (var i = 0; i < row.length; i++) {
          var tile = row[i]
          var vis = isVisible(tile, 0, 0)

          var fogClass = null
          var mirrorClass = null
          var frameClass = null

          if (vis >= 0) {
            fogClass = fog && visible.indexOf(vis) == -1
          } else {
            var frame = edge[
              (isVisible(tile,  0, -1) >= 0) << key.t  |
              (isVisible(tile,  0, +1) >= 0) << key.b  |
              (isVisible(tile, -1,  0) >= 0) << key.l  |
              (isVisible(tile, -1, -1) >= 0) << key.tl |
              (isVisible(tile, -1, +1) >= 0) << key.bl |
              (isVisible(tile, +1,  0) >= 0) << key.r  |
              (isVisible(tile, +1, -1) >= 0) << key.tr |
              (isVisible(tile, +1, +1) >= 0) << key.br |
              tile[0] & 1 << key.oddX |
              tile[1] & 1 << key.oddY
            ]

            if (frame == null) {    // fully shrouded
              if (classic) {
                frame = tile[0] ? repeat[tile[1] % 4][(tile[0] - 1) % 3] : tile[1] % 4
              } else {
                // XXX=R Take Z into account on small maps only. On over/underworld switching, relying on Z causes much bigger amount of nodes to be updated, making the switch very slow.
                var fz = mapWidth > 40 ? 0 : z
                frame = _.randomBySeed(repeatRandom ^ (tile[2] << 4 | fz))[1] * repeatFrames | 0
              }

              frameClass = 'C-0-' + frame
            } else {
              if (frame < 0) {
                mirrorClass = true
                frame = ~frame
              }
              frameClass = 'E-0-' + frame
              fogClass = fog
            }
          }

          // Make sure not to touch classes if they don't need to be changed. Every touched class adds new node to browser's recalculation list, considerably slowing up over/underworld switching.
          var el = this._cellEls[tile[2]]
          el.classList[fogClass    ? 'add' : 'remove']('Hgrid__cell_fog')
          el.classList[mirrorClass ? 'add' : 'remove']('Hgrid__cell_mirror')
          Common.oneClass(el, 'Hh3-def_frame_TSHR', frameClass)   // TSHRC/TSHRE

          // Update visibility of map objects (see _set()).
          //
          // An optimization is possible since byRow given to _updateShroudSorted() includes edge tiles (i.e. adjacent to tiles which visibility was updated): if tile became visible (or fully visible in non-classic mode) then we can show intersecting objects immediately, without checking state of other tiles they intersect.
          //
          // In case an object spans two tiles that are part of byRow, one of which became visible and another became invisible, we can also skip the above check since we already know there is a visible tile.
          this.map.bySpot.findAtCoords(tile[0], tile[1], z, 'id', function (id) {
            objects.set(id, !fogClass || objects.get(id))
          })
        }
      }

      objects.forEach(function (fullyVisible, id) {
        var obj = this._objectAtter(id, 0, 0, 0)
        var el = this._objectEls[id]
        var show = fullyVisible ? 2 : 0

        show || this._walkAroundObjectBox(_.extend({}, obj), function (o) {
          var vis = isVisible([o.mx, o.my, o.mx + o.my * mapWidth], 0, 0)
          if (!(vis >= 0)) {
            // Invisible.
          } else if (!fog || visible.indexOf(vis) != -1) {
            return show = 2
          } else {
            show = 1
          }
        })

        if (fog && show === 1) {
          // Fully refresh the element because partial shroud affects multiple attributes.
          this._set(obj, el, {shroudState: show})
        } else {
          // If partial shroud is not used can refresh just 'display'.
          toggle(el, show && obj.displayOrder >= 0)
        }
      }, this)
    },
  })

  // Enables scrolling the adventure map by moving mouse pointer near its edge.
  DomMap.Edge = Common.jQuery.extend('HeroWO.DOM.Map.Edge', {
    mixIns: [Common.ScreenModule],
    _timer: null,

    //> edgeScrollInterval integer ms `- When user moves mouse to the screen
    //  edge, scroll the adventure map by 1 tile every this so often.
    _opt: {
      edgeScrollInterval: 43,   // SoD default = medium
    },

    events: {
      '-unnest': '_stopDrag',

      render: function () {
        var edges = [
          [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1],
          [1, -1], [-1, 1],
        ]

        _.each(edges, function (side) {
          $('<div class=Hroot__edge>')
            .addClass('Hroot__edge_side_' + side.join('_'))
            .attr('data-Hedge', side)
            .appendTo(this.el)
        }, this)
      },
    },

    elEvents: {
      mouseenter: function (e) {
        var edge = e.target.getAttribute('data-Hedge').split(',')
        this._stopDrag()
        var scOpt = this.sc._opt
        var self = this

        this._timer = setInterval(function () {
          if (!scOpt.mapDragging) {
            self.sc.set('mapDragging', 'mapEdge')
          } else if (scOpt.mapDragging != 'mapEdge') {
            return self._stopDrag()
          }
          var cur = scOpt.mapPosition
          self.sc.set('mapPosition', [cur[0] + +edge[0], cur[1] + +edge[1]])
        }, this.get('edgeScrollInterval'))
      },

      mouseleave: '_stopDrag',
    },

    _stopDrag: function () {
      clearInterval(this._timer)
      this.sc.getSet('mapDragging', function (cur) {
        return cur == 'mapEdge' ? null : cur
      })
    },
  })

  return DomMap
})