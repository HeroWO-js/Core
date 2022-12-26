define(['DOM.Common', 'DOM.Slider', 'Map', 'Calculator', 'Chat.Server'], function (Common, Slider, HMap, Calculator, Chat) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // Base root of main menu shown when `#Context `'screen is empty (no game is active).
  // Shows filtered list of maps, server lobby, saved games, etc.
  //
  // Menu state depends on general `'screen (e.g. new single-player game) and its `'section (e.g. list of maps or list of options).
  var MainMenu = Common.jQuery.extend('HeroWO.H3.DOM.MainMenu', {
    mixIns: [Common.ContextModule],
    el: {class: 'Hh3-menu'},
    persistent: true,
    list: null,   // ScenarioList; do not set
    _listEl: null,
    _listSlider: null,
    _infoAllies: null,  // PlayerList
    _infoEnemies: null,
    _template: null,

    _opt: {
      // Possible screens:
      // - start, highScores
      // - (new|load|save)(Single|Multi)
      // - newCampaign
      // There are no load/saveCompaign, they are aliases of new/loadSingle.
      // save... are not reachable from start but can be set by the caller
      // (like from the in-game system menu).
      screen: 'start',
      // Possible sections ("section" is a minor variations on "screen"):
      // - start: '', new, load, credits
      // - new(Single|Multi): '', list, options
      // - others: ''
      section: '',
      listScrolled: false,
      mapSize: '',    // filter; s/m/l/xl or '' (any)
      mapPath: '',    // filter; key prefix
      flat: false,  // if set, maps with matching mapPath (i.e. in subfolders thereof) are shown along with the folder's own maps
      canChange: false,   // description
      canOptions: false,
      canBegin: false,
      current: null,    // can be set to an Item that is not part of list's children; can be null
    },

    events: {
      '+normalize_screen': Common.normStr,
      '+normalize_flat': Common.normBool,

      '+normalize_section': function (res, now, options) {
        if (!options.force && !this.get('canOptions') && now == 'options') {
          return this.get('section')
        } else {
          return Common.normStr.apply(this, arguments)
        }
      },

      change_screen: function () {
        this.set('listScrolled', false)
        this.update()
      },

      change_canChange: 'update',
      change_canOptions: 'update',
      change_canBegin: 'update',

      'change_mapSize, change_flat': function () {
        this.update()
        this.refilter()
      },

      change_mapPath: function (now, old) {
        this.list.nested(this.dirname(old)).set('goUp', false)
        this.refilter()
        this.list.nested(this.dirname(now)).set('goUp', true)
      },

      change_section: function (now) {
        this.update()

        if (now == 'credits') {
          this._startCredits()
        } else if (now == 'list' && this.get('screen').match(/^(new|load|save)/)
                   && this.ifSet('listScrolled', true)) {
          // Scroll position can't be set before browser renders the table.
          this.getSet('current', function (cur) {
            cur && this._scrollIntoView(cur)
            return cur
          })
        }
      },

      change: function (name, now, old) {
        if (name == 'screen' || name == 'section') {
          _.log && _.log('Menu %s/%s <- %s', this.get('screen'), this.get('section'), old)
        }
      },

      init: function () {
        this.list = new MainMenu.ScenarioList({context: this.cx})

        this.list.on({
          change_sort: 'update',
          nestExNew: function (res) {
            res.child.set('goUp', res.key == this.dirname(this.get('mapPath')))
          },
          '.clicked': '_enter',
          '.doubleClicked': '_submit-',
          '+childMatches': function (res, map) {
            return this._childMatches(map)
          },
          change_matchingCount: function (now) {
            this._listSlider.set('max', now - 1)
          },
          '.-unnest': function (child) {
            if (child instanceof MainMenu.ScenarioList.Map) {
              // If there are no maps in the current folder anymore, backtrack to the first parent folder with at least one map. Consider maps hidden by other filters (like mapSize) as existing.
              var prefix = this.get('mapPath')
              while (true) {
                var found = this.list.some(function (other) {
                  return _.startsWith(other.get('key'), prefix) &&
                         other instanceof MainMenu.ScenarioList.Map &&
                         other != child
                })
                if (found || prefix == '') {
                  return this.set('mapPath', prefix)
                }
                prefix = this.dirname(prefix)
                child = null
              }
            }
          },
          change_current: function (now, old) {
            this.getSet('current', function (c) {
              old && old.el.removeClass('Hh3-menu-sli_cur')
              now && now.el.addClass('Hh3-menu-sli_cur')

              if (c == old) {
                now && this._scrollIntoView(now, old)
                c = now
              }

              return c
            })
          },
        }, this)

        this._listSlider = new Slider({
          height: 18,   // size of the list's background-image
          disabledClass: 'Hh3-menu__sdis',
          thumbClass: 'MHh3-btn_id_SCNRBSL Hh3-btn_act_no',
          upClass: 'MHh3-btn_id_SCNRBUP',
          downClass: 'MHh3-btn_id_SCNRBDN',
          buttonSFX: false,
          wheelScroll: 6,
          repeatSpeed: 25,
          trackJump: this.cx.get('classic'),
        })

        var rowHeight
        this.autoOff(this._listSlider, {
          change_position: function (now) {
            if (!isNaN(now)) {
              rowHeight = rowHeight || this.list.find(Common.p('get', 'matching')).el.height()
              this._listEl[0].scrollTop = now * rowHeight
            }
          },
        })
      },

      change_current: function (cur, old) {
        if (old) {
          this.autoOff(old)
          this._infoAllies.invoke('remove')
          this._infoEnemies.invoke('remove')
        }

        if (cur) {
          this.autoOff(cur, {
            change: '_updateInfo',
          })

          this._updateInfo()
        }
      },

      attach: function () {
        Common.autoOffNode(this, document.body, {
          keydown: '_handleKey',
        })
      },

      '-render': function () {
        this.el
          .addClass('Hh3-menu_random_' + _.random(1))
          .append('<div class=Hh3-menu__render></div>')

        this._listEl = $('<div class=Hh3-menu-ns__list>')
          .appendTo(this.el)

        this._infoAllies = (new MainMenu.PlayerList)
          .attach($('<div class=Hh3-menu-ns__al>').appendTo(this.el))

        this._infoEnemies = (new MainMenu.PlayerList)
          .attach($('<div class=Hh3-menu-ns__en>').appendTo(this.el))

        this._listSlider.el.addClass('Hh3-menu__slis')
        this._listSlider.attach(this.el).render()
        this._listSlider.attachContent(this._listEl[0])

        this.list.attach(this._listEl).render()
      },

      _update: function () {
        var ratings = ['80%', '100%', '130%', '160%', '200%']
        var map = this.get('current')
        var vars = {
          classic: this.cx.get('classic'),
          flat: this.get('flat'),
          map: map && map.get(),
          // \n is present in, for example, "Viking We Shall Go!".
          descriptionHTML: map && map.get('description').trim().replace(/\n\r?(\n?)[\r\n]*/g, function (m, n2) {
            return '<br>' + (n2 ? '<br>' : '')
          }),
          mapMap: map instanceof MainMenu.ScenarioList.Map,
          mapSize: this.get('mapSize'),
          ratingText: this.s(ratings[map && map.get('difficultyMode')]),
          sort: this.list.get('sort'),
          screen: this.get('screen'),
          canChange: this.get('canChange'),
          canOptions: this.get('canOptions'),
          canBegin: this.get('canBegin'),
        }

        this._template = this._template || this.cx.template(this.constructor.name)

        this.$('.Hh3-menu__render')
          .html(this._template(vars))

        var screenShort = this.get('screen')
          // 'newSinglePlayer' -> 'nsp'.
          .replace(/([A-Z]|^.)[^A-Z]*/g, '$1')
          .toLowerCase()

        Common.oneClass(this.el, 'Hh3-menu_sc_', screenShort)
        Common.oneClass(this.el, 'Hh3-menu_sect_', this.get('section'))

        this.$('.Hh3-menu__screen').each(function () {
          $(this).toggle($(this).hasClass('Hh3-menu-' + screenShort))
        })

        this._infoAllies.el.add(this._infoEnemies.el)
          .toggle(!!this.get('screen').match(/^(new|load|save)/))
      },

      '-unnest': function () {
        if (this._parent) {
          this.list.remove()
          this._infoAllies && this._infoAllies.remove()
          this._infoEnemies && this._infoEnemies.remove()
        }
      },
    },

    elEvents: {
      /* Start screen */
      mousedown: function () {
        if (this.get('screen') == 'start' && this.get('section') == 'credits') {
          this.set('section', '')
        }
      },

      'click .Hh3-menu-s__new': function () {
        this.set('section', 'new')
      },

      'click .Hh3-menu-s__load': function () {
        this.set('section', 'load')
      },

      'click .Hh3-menu-s__hisc': function () {
        // Caller can override change_screen to prevent access to some screens.
        this.ifSet('screen', 'highScores') &&
          this.set('section', '')
      },

      'click .Hh3-menu-s__cred': function () {
        this.set('section', 'credits')
      },

      'click .Hh3-menu-s__quit': 'quit',

      'click .Hh3-menu-s__single': function () {
        this.ifSet('screen', this.get('section') + 'Single') &&
          this.set('section', this.get('section') == 'new' ? '' : 'list')
      },

      'click .Hh3-menu-s__multi': function () {
        this.ifSet('screen', this.get('section') + 'Multi') &&
          this.set('section', 'list')
      },

      'click .Hh3-menu-s__camp': function () {
        this.ifSet('screen', this.get('section') + 'Campaign') &&
          this.set('section', '')
      },

      'click .Hh3-menu-s__tut': function () {
        if (this.get('section') == 'new') {
          this.newTutorial()
        } else {
          this.ifSet('screen', 'loadSingle') &&
            this.set('section', 'list')
        }
        // XXX=I when replay playback is implemented, replace the useless Load > Tutorial button with load replay button
      },

      'click .Hh3-menu-s__back': function () {
        this.set('section', '')
      },

      /* New/load/save single/multi player */
      'change .Hh3-menu-ns__mfl': function (e) {
        this.set('flat', e.target.checked)
      },

      'click .Hh3-menu-ns__t-list': function () {
        this.getSet('section', function (now) {
          return now == 'list' ? '' : 'list'
        })
      },

      'click .Hh3-menu-ns__t-opt': function () {
        this.getSet('section', function (now) {
          return now == 'options' ? '' : 'options'
        })
      },

      'click .Hh3-menu-ns__begin': '_submit-',

      'click .Hh3-menu-ns__back': function () {
        if (this.get('screen').match(/^save/)) {
          this.remove()
        } else {
          var match = this.get('screen').match(/^(new|load)?/)[0]
          this.ifSet('screen', 'start') &&
            this.set('section', match)
        }
      },

      'click .Hh3-menu-ns__s-btn': function (e) {
        this.set('mapSize', $(e.target).attr('data-Hsize'))
      },

      'click .Hh3-menu-ns__t-btn': function (e) {
        var field = $(e.target).attr('data-Hcol')
        this.list.getSet(['sort', 'sortAsc'], function (sort, asc) {
          return [field, sort == field ? !asc : true]
        })
        this.update()   // update button classes
      },

      'click .Hh3-menu__t-desc': 'editDescription',
    },

    // XXX=C,I recheck this and other game screens (ADVMAP, SpellBook, Combat, etc.), add missing hotkeys
    _handleKey: function (e) {
      if (e.target.tagName == 'TEXTAREA') { return }

      switch (this.get('screen') + '_' + this.get('section')) {
        case 'start_':
          var sect = {n: 'new', l: 'load', c: 'credits'}
          if (sect[e.key]) {
            this.set('section', sect[e.key])
          } else if (e.key == 'h') {
            this.ifSet('screen', 'highScores') && this.set('section', '')
          }
          break
        case 'start_new':
          if (e.key == 't') {
            this.newTutorial()
          }
        case 'start_load':
          var scr = {s: 'Single', m: 'Multi', c: 'Campaign'}
          if (scr[e.key]) {
            this.ifSet('screen', this.get('section') + scr[e.key]) &&
              this.set('section', 'list')
          }
          break
      }

      switch (e.keyCode) {
        case 13:    // Enter
          return this._enter()

        case 65:    // a
        case 83:    // s
        case 66:    // b
          if (this.get('screen').match(/^(new|load)(Single|Multi)$/)) {
            if (e.keyCode == 66) {
              this._submit()
            } else {
              this.getSet('section', function (cur) {
                var now = e.keyCode == 65 ? 'options' : 'list'
                return cur == now ? '' : now
              })
            }
          }
          break

        case 37:    // Left
        case 39:    // Right
          break

        case 38:    // Up
          var delta = -1
        case 40:    // Down
          var delta = delta || 1
        case 36:    // Home
          var delta = delta || -Infinity
        case 35:    // End
          var delta = delta || Infinity
        case 33:    // Page Up
          var delta = delta || -this._listSlider.get('height')
        case 34:    // Page Down
          var delta = delta || this._listSlider.get('height')
          if (this.get('screen').match(/^(new|load|save)(Single|Multi)$/)) {
            if (this.get('section') == 'list') {
              function firstOrLast(list) {
                var child
                for (var i = delta < 0 ? list.length - 1 : 0; child = (list.at(i) || {}).child; i += _.sign(delta)) {
                  if (child.get('matching')) {
                    return child
                  }
                }
              }

              this.list.getSet('current', function (cur) {
                if (cur == this.get('current')) {
                  if (!cur && this.list.get('matchingCount')) {
                    cur = firstOrLast(this.list)
                  }

                  if (cur) {
                    var index = this.list.indexOf(cur)
                    if (index != -1) {
                      for (var iter = Math.abs(delta); iter; ) {
                        cur = (this.list.at(index += _.sign(delta)) || {}).child
                        if (!cur) {
                          if (Math.abs(delta) != 1 || this.cx.get('classic')) {
                            delta *= -1   // wrap around, for Up/Down only
                          }
                          cur = firstOrLast(this.list)
                          break
                        }
                        cur.get('matching') && iter--
                      }
                    }
                  }
                }

                return cur
              }, this)
            }
          }
          break

        case 27:
          if (this.get('screen').match(/^save/)) {
            return this.remove()
          }
          this.getSet(['screen', 'section'], function (screen, section) {
            if (screen == 'start') {
              // defer() is there to avoid side effects of the subsequent keyup.
              // For example, if quit() changes location.href then Esc keyup
              // immediately stops the navigation.
              section ? section = '' : _.defer(this.quit.bind(this))
            } else {
              if (section = screen.match(/^(new|load)/)) {
                section = section[0]
              }
              screen = 'start'
            }
            return [screen, section]
          }, this)
          break
      }
    },

    _startCredits: function () {
      // Timeout must match duration of the animation in CSS.
      var timer = setTimeout(this.set.bind(this, 'section', ''), 180000 + 4000)
      var el = this.el

      function showLogo(imageSrc, audioSrc, done) {
        var async = (new Common.Async)
          .whenSuccess(function () {
            if (timer) {
              el.find('.Hh3-menu-s__logo').empty().append(img).append(audio)
              // XXX=R use H3.DOM.Audio
              audio.play()
            }
          })
        var img = new Image
        img.onload = async.nestDoner()
        // Strangely, when adding a new <img> with the same src to DOM, the
        // animation doesn't restart.
        img.src = imageSrc + '?' + Math.random()
        var audio = new Audio
        audio.oncanplaythrough = async.nestDoner()
        audio.src = audioSrc
        audio.onended = function () {
          $(img).fadeOut(200, function () {
            el.find('.Hh3-menu-s__logo').empty()
            done()
          })
        }
      }

      function stopLogo() {
        el.find('.Hh3-menu-s__logo').empty()
      }

      function stopAll() {
        stopLogo()
        clearTimeout(timer)
        timer = null
      }

      showLogo('custom-graphics/3DOLOGO-z2-200p.png', '../BIK-WAV-OGG/3DOLOGO.ogg', function () {
          showLogo('custom-graphics/NWCLOGO-SMK-z2-200p.png', '../CDROM-BIK-WAV-OGG/NWCLOGO-SMK.ogg', stopLogo)
        })

      this.once('change_screen',  stopAll)
      this.once('change_section', stopAll)
      this.once('-remove', stopAll)
    },

    // Evaluates rules for maps visible in the list. For example, hides maps in folders different from the current one.
    refilter: function () {
      if (this.get('rendered')) {
        var all = this.list.toArray()

        all[0].batch(all, function () {
          _.each(all, function (map) {
            map.set('matching', this.list.childMatches(map))
          }, this)
        }, this)
      }
    },

    _scrollIntoView: function (now, old) {
      var top = this._listEl[0].scrollTop
      var height = this._listEl.height()

      if (top > now.el[0].offsetTop ||
          top + height < now.el[0].offsetTop + now.el[0].offsetHeight) {
        var index = this.list.indexOf(now)
        if (index != -1) {
          var oi = this.list.indexOf(old)
          // Leave some scroll margin.
          var margin = oi == -1 ? -this._listSlider.get('height') / 2 /*current not in list*/ : index < oi ? -this._listSlider.get('height') + 2 /*scrolling up*/ : -3 /*down*/
          this.list.some(function (child) {
            child.get('matching') && margin++
            return child == now
          })
          this._listSlider.set('position', margin)
        }
      }
    },

    _updateInfo: function () {
      this.update()

      var cur = this.get('current')

      if (cur instanceof MainMenu.ScenarioList.Map) {
        this._infoAllies.assignChildren(cur.get('allies'))
        this._infoAllies.invoke('render')
        this._infoEnemies.assignChildren(cur.get('enemies'))
        this._infoEnemies.invoke('render')
      }
    },

    // Called on double click or Begin/Load/Save.
    _submit: Common.stub,

    // Called on click or Enter.
    _enter: function () {
      var cur = this.get('current')

      if (cur instanceof MainMenu.ScenarioList.Folder) {
        this.set('current', null)   // don't _updateInfo while refiltering
        this.set('mapPath', cur.get('key'))
        this.list.autoSelect()
        return this.set('current', this.list.get('current'))
      }
    },

    //> path - only empty or of form a/b/c/
    dirname: function (path) {
      return path.replace(/[^\/]+\/$/, '')
    },

    _childMatches: function (map) {
      var type = map instanceof MainMenu.ScenarioList.Folder
        ? 'f' : map instanceof MainMenu.ScenarioList.Map ? 'm' : 'o'
      if ((type == 'f' || type == 'm') && (_.startsWith(map.get('key'), this.get('mapPath')) ? map.get('key') == this.get('mapPath') : map.get('key') != this.dirname(this.get('mapPath')))) {
        return false
      }
      if (this.get('flat') ? type == 'f' && map.get('key') != this.dirname(this.get('mapPath')) :
          (type != 'o' && map.get('key').substr(this.get('mapPath').length).replace(/\/$/, '').indexOf('/') != -1)) {
        return false
      }
      if (type == 'm' && this.get('mapSize') && this.get('mapSize') != map.get('sizeType')) {
        return false
      }
      return true
    },

    // Returns localized version of `'str, or `'str itself if there's none.
    s: function (str) {
      return this.cx.s('mainMenu', str)
    },

    // Called when user clicks on last button in the main section.
    quit: Common.stub,
    // Called when user clicks on New > Tutorial.
    newTutorial: Common.stub,
    // Called when user clicks on the link next to map's description. Used in lobby games.
    editDescription: Common.stub,
  })

  // List of players existing in a particular map.
  MainMenu.PlayerList = Common.jQuery.extend({
    mixIns: [Common.Ordered],
    el: {class: 'Hh3-menu-pll'},
    _childClass: 'Item',

    events: {
      '=_defaultKey': function (sup, player) {
        return player.get('player')
      },
    },
  })

  // Particular player in the player list of a map.
  MainMenu.PlayerList.Item = Common.jQuery.extend({
    el: {tag: 'span', class: 'Hh3-menu-pll__item'},

    _opt: {
      attachPath: '.',
      player: 0,
    },

    events: {
      render: function () {
        this.el.addClass('Hh3-menu-pll__item_player_' + this.get('player'))
      },
    },
  })

  // Off-DOM node for selecting game/replay to load.
  var fileEl = $('<input type="file" accept=".json,.herowo">')[0]

  // Main menu that works with HeroWO server API (list of maps delivered over SSE, replay download URL, etc.).
  MainMenu.Concrete = MainMenu.extend({
    updaters: null,

    _opt: {
      mapsURL: '',
      updater: null,
      options: null,   // PlayerOptions; do not set
      // Both only for saveMulti, coming from connector's login info. Cannot change.
      savesURL: '',
      replaysURL: '',
      loading: false,
    },

    _initToOpt: {
      updaters: '.',
    },

    events: {
      '-remove': function () {
        this.set('options', null)
      },

      change_updater: function (now, old) {
        old && old.set('list', null)
        now && now.set('list', this.list)
      },

      change_loading: function (now) {
        this.el.toggleClass('Hh3-menu_loading', now)
      },

      'change_loading, change_screen, change_options, change_current': '_updateCan',

      '+normalize_screen': function () {
        if (this.get('loading')) {
          return this.get('screen')
        }
      },

      '+normalize_section': function (now, $, options) {
        if (options.force) {
          return
        } else if (this.get('loading')) {
          return this.get('section')
        } else if (!now && this.get('screen').match(/^(load|save)/)) {
          return 'list'
        }
      },

      change_screen: function () {
        this.getSet('section')
        this._setUpdater()
      },

      change_section: function (now) {
        var match = this.get('screen').match(/^(new|load)(Single|Multi)$/)
        if (!match || now != 'options') {
          this.set('options', null)
        } else if (!this.get('options')) {
          this._submit(true)
        }
      },

      attach: function () {
        this.autoOff(this.updaters.nested('maps'), {
          '-_replaceAll': function (list, maps) {
            if (this.get('mapsURL')) {
              maps['/UploadMap'] = {key: '/UploadMap', type: 'UploadMap'}
            }
            if (this.get('screen') == 'newMulti') {
              maps['/ExitNewLobby'] = {key: '/ExitNewLobby', type: 'NewLobby', title: 'Return to Lobby'}
            }
          },
          _replaceAll: function (list) {
            // Select random map upon loading the initial scenario list. Don't
            // select another one if SSE has just reconnected (list.length > 0).
            if (this.get('screen') == 'newSingle' && !list.length) {
              var cur = _.sample(list.matching().filter(function (child) {
                return child instanceof MainMenu.ScenarioList.Map
              }))
              cur && list.set('current', cur)
            }
          },
        })

        this.autoOff(this.updaters.nested('lobby'), {
          '-_replaceAll': function (list, maps) {
            maps['/NewLobby'] = {key: '/NewLobby', type: 'NewLobby'}
            maps['/JoinLobby'] = {key: '/JoinLobby', type: 'JoinLobby'}
          },
        })

        this.autoOff(this.updaters.nested('saves'), {
          '-_replaceAll': function (list, maps) {
            if (this.get('screen') == 'loadSingle' ||
                this.get('screen') == 'loadMulti') {
              maps['/UploadSaved'] = {key: '/UploadSaved', type: 'UploadSaved'}
            } else if (this.get('screen') == 'saveSingle' ||
                       this.get('screen') == 'saveMulti') {
              maps['/SaveToFile'] = {key: '/SaveToFile', type: 'SaveToFile'}
              maps['/SaveToLocalStorage'] = {key: '/SaveToLocalStorage', type: 'SaveToLocalStorage'}
              maps['/SaveURL'] = {key: '/SaveURL', type: 'SaveURL', matching: this.get('savesURL')}
              maps['/ReplayURL'] = {key: '/ReplayURL', type: 'ReplayURL', matching: this.get('replaysURL')}
            }
          },
        })

        this.autoOff(this.updaters, {
          change_ready: '_setUpdater',
        })
      },

      change_savesURL: function (now) {
        var child = this.list.nested('/SaveURL')
        child && child.set('matching', now, {schema: 'mapSchema'})
      },

      change_replaysURL: function (now) {
        var child = this.list.nested('/ReplayURL')
        child && child.set('matching', now, {schema: 'mapSchema'})
      },

      render: '_setUpdater',

      '+_enter': function (handled) {
        var cur = this.get('current')

        if (handled || !cur) { return }

        switch (cur.constructor) {
          case MainMenu.ScenarioList.UploadMap:
            return open(this.get('mapsURL'))

          case MainMenu.ScenarioList.NewLobby:
            return this.getSet('updater', function (cur) {
              return cur == this.updaters.nested('maps')
                ? this.updaters.nested('lobby') : this.updaters.nested('maps')
            })

          case MainMenu.ScenarioList.JoinLobby:
            var pin = prompt(this.s('Enter PIN code of the game you want to join:'))
            return pin && this.joinLobby(pin)

          case MainMenu.ScenarioList.UploadSaved:
            if (!window.herowoSaveMessage) {
              window.herowoSaveMessage = true
              alert(this.s('You can pick a save file or a replay file. As of now, playback of replays is not implemented in HeroWO, but you can (re)start a normal game by picking a replay file.'))
              // XXX=I playback of replays
            }
            fileEl.onchange = function () {
              fileEl.files[0] && this._uploadSaved(fileEl.files[0])
              fileEl.value = ''
            }.bind(this)
            // XXX showPicker() often fails with "blocked due to lack of user activation" or "requires a user gesture" for unknown reason.
            return /*fileEl.showPicker ? fileEl.showPicker() :*/ fileEl.click()

          case MainMenu.ScenarioList.SaveToFile:
            if (this.cx.map.get('finished')) {
              return alert(this.get('replaysURL') ? this.s('The game has finished. You cannot save it but you can download the replay.') : this.s('The game has finished. You cannot save it.'))
            }

            switch (this.get('screen')) {
              case 'saveSingle':
                var data = this.cx.map.serialize({removeDynamic: 'clone'})
                data.version = Common.SAVE_VERSION
                // Format string taken from WebSocket.Server.HTTP.js.
                var name = _.format(this.s('%Y-%1$02M-%1$02D %1$02H-%1$02I %s.herowo'), new Date, this.cx.map.get('title'))
                return this._downloadJSON(data, name)

              case 'saveMulti':
                var url = this.get('savesURL')
                if (url) {
                  open(url + '?dl=1')
                } else {
                  alert(this.s('Server does not allow saving this game.'))
                }
                return
            }

            return

          case MainMenu.ScenarioList.SaveToLocalStorage:
            var format = new Intl.DateTimeFormat([], {dateStyle: 'short', timeStyle: 'short'})
            var name = prompt(this.s('Enter a name for the new save slot (the map\'s title will be added):'), format.format(new Date))
            return name && this._saveToLocalStorage(name)

          case MainMenu.ScenarioList.SaveURL:
            return open(this.get('savesURL'))
          case MainMenu.ScenarioList.ReplayURL:
            return open(this.get('replaysURL'))
        }
      },

      '+_submit': function (handled, configure) {
        var cur = this.get('current')

        if (handled || !this.get('canBegin') || !cur) { return }

        switch (cur.constructor) {
          case MainMenu.ScenarioList.LobbyMap:
            return this.joinLobby(cur.get('pin'))

          case MainMenu.ScenarioList.SavedMap:
            switch (this.get('screen')) {
              case 'loadSingle':
                var data = this.updaters.nested('saves').readSave(cur.get('key'))
                // XXX=R duplicates with _uploadSaved()
                try {
                  var match = atob(data.substr(0, 28))
                    .match(/^HeroWO (save|replay) file\n/)
                } catch (e) {}
                if (!match) {
                  try {
                    data = JSON.parse(data)
                  } catch (e) {
                    return alert(this.s('This save slot cannot be read.'))
                  }
                  this.loadSingle(data, configure === true)
                } else if (match[1] == 'save') {
                  alert(this.s('This save file is encrypted so that only the server can read it. You can only load it in multi-player mode.'))
                } else {
                  alert(this.s('This is a compressed replay file. For now, it can be loaded in multi-player mode only.'))
                }
                return

              case 'loadMulti':
                var data = this.updaters.nested('saves').readSave(cur.get('key'))
                if (data) {
                  this.newLobby({load: data, private: true})
                } else {
                  alert(this.s('This save slot cannot be read.'))
                }
                return

              case 'saveSingle':
              case 'saveMulti':
                return this._saveToLocalStorage(cur.get('fileName'), cur.get('key'))
            }
            return

          case MainMenu.ScenarioList.ConfiguringMap:
            var value = !this.cx.map.get('confirming') || !this.cx.players.nested(this.get('options').get('player')).get('confirmed')
            return this.get('options').rpc.do('configure', {do: 'begin', value: value})

          case MainMenu.ScenarioList.Map:
            switch (this.get('screen')) {
              case 'newSingle':
                return this.newSingle(cur.get('key'), configure === true)
              case 'newMulti':
                return this.newLobby({url: cur.get('key'), private: false})
            }
            return
        }
      },

      change_options: function (now, old) {
        if (old) {
          old.remove()

          var cur = this.get('current')
          if (cur instanceof MainMenu.ScenarioList.ConfiguringMap) {
            this.set('current', this.list.get('current'))
            cur.remove()
          }
        }

        if (now) {
          var cur = new MainMenu.ScenarioList.ConfiguringMap({context: this.cx})
          cur.attach().render()

          this.assignResp({
            section: 'options',
            current: cur,
          }, {force: true})
        }
      },
    },

    elEvents: {
      'click .Hh3-menu__t-del': function () {
        if (confirm(_.format(this.s('Permanently delete %s?'), this.get('current').get('title')))) {
          this.updaters.nested('saves').deleteSave(this.get('current').get('key'))
        }
      },
    },

    _setUpdater: function () {
      if (this.updaters.get('ready') && this.get('rendered')) {
        switch (this.get('screen')) {
          case 'newSingle':
            return this.set('updater', this.updaters.nested('maps'))
          case 'newMulti':
            return this.set('updater', this.updaters.nested('lobby'))
          case 'loadSingle':
          case 'loadMulti':
          case 'saveSingle':
          case 'saveMulti':
            return this.set('updater', this.updaters.nested('saves'))
          default:
            this.set('updater', null)
        }
      }
    },

    _uploadSaved: function (file) {
      var self = this

      var reader = new FileReader
      reader.onloadend = readHeader
      reader.readAsText(file.slice(0, 256))

      // Same logic as in api.php.
      function readHeader() {
        // Whitespace may appear in pretty-printed JSON produced when not encrypting or HMAC'ing.
        var match = this.result.match(/^\s*\{\s*"|^HeroWO (save|replay) file\n/)

        if (!match) {
          return alert(self.s('This doesn\'t look like a HeroWO save or replay file.'))
        }

        switch (self.get('screen')) {
          case 'loadMulti':
            return self.newLobby({load: file, private: true})

          case 'loadSingle':
            if (match[1] == 'save') {
              alert(self.s('This save file is encrypted so that only the server can read it. You can only load it in multi-player mode.'))
            } else if (match[1] == 'replay') {
              // (When implemented:) HMAC'd replay file. Since we can't verify the HMAC, just skip to loading the map.
              alert(self.s('This is a compressed replay file. For now, it can be loaded in multi-player mode only.'))
              // XXX=I not implemented because decompression API is recent (Chrome 80+, no FF) and its compatibility with gzencode() is unknown
            } else {
              var reader = new FileReader
              reader.onloadend = readFullSingle
              // Replay files can be huge. We only need the header but its length is unknown and reading it partially using FileReader is too cumbersome. I don't expect any map to be over 40 MiB in size (currently 144x144x2 XL takes up 20 MiB).
              // May be improved in the future (XXX=R).
              reader.readAsText(file.slice(0, 40 * 1024 * 1024))
            }

            return
        }
      }

      function readFullSingle() {
        var result = this.result
        try {
          var data = JSON.parse(result)
        } catch (e) {
          var pos = result.indexOf('\n')
          if (pos != -1) {
            try {
              data = JSON.parse(result.substr(0, pos))
            } catch (e) {}
          }
        }

        if (!data) {
          return alert(self.s('This doesn\'t look like a HeroWO save or replay file.'))
        } else if (data.startTime) {
          var REPLAY_VERSION = 1    // XXX=RH
          if (data.version != REPLAY_VERSION) {
            return alert(_.format(self.s('Replay file version (%s) is unsupported (expected to be %s).'), data.version, REPLAY_VERSION))
          }

          var next = result.indexOf('\n', pos + 1)
          data = JSON.parse(result.substr(pos, next - pos))
        } else if (data.version != Common.SAVE_VERSION) {
          return alert(_.format(self.s('Save file version (%s) is unsupported (expected to be %s).'), data.version, Common.SAVE_VERSION))
        }

        self.loadSingle(data, true)
      }
    },

    _saveToLocalStorage: function (name, key) {
      if (this.cx.map.get('finished')) {
        return alert(this.get('replaysURL') ? this.s('The game has finished. You cannot save it but you can download the replay.') : this.s('The game has finished. You cannot save it.'))
      }

      var info = this.cx.map.serializeHeader()
      info.fileName = name

      switch (this.get('screen')) {
        case 'saveSingle':
          var data = this.cx.map.serialize({removeDynamic: 'clone'})
          data.version = Common.SAVE_VERSION
          key = this.updaters.nested('saves').writeSave(info, JSON.stringify(data), key)
          if (key) {
            this.remove()
          } else {
            alert(this.s('Your browser rejected saving our data, probably because it is too large or you have used up the quota. Overwrite an existing slot or try Save to Local File.'))
          }
          return

        case 'saveMulti':
          var url = this.get('savesURL')

          if (url) {
            _.ajax({
              url: url + '?dl=base64',
              headers: {},    // no preflight
              context: this,
              success: function (xhr) {
                key = this.updaters.nested('saves').writeSave(info, xhr.response, key)
                if (key) {
                  this.remove()
                } else {
                  alert(this.s('Your browser rejected saving our data, probably because it is too large or you have used up the quota. Overwrite an existing slot or try Save to Local File.'))
                }
              },
              error: function (xhr, e) {
                if (confirm(this.s('Could not fetch save data from the server. Try Save to Local File?') + '\n\n' + (e.message || xhr.response || xhr.statusText))) {
                  open(url)
                }
              },
            })
          } else {
            alert(this.s('Server does not allow saving this game.'))
          }

          return
      }
    },

    _downloadJSON: function (data, name) {
      // MIME is required for IE, according to MDN.
      data = new Blob([JSON.stringify(data)], {type: 'application/javascript'})
      var url = URL.createObjectURL(data)
      var el = $('<a>')
      try {
        el
          .attr({download: name, href: url})
          .appendTo('body')
          [0].click()
      } finally {
        el.remove()
        URL.revokeObjectURL(url)
      }
    },

    _updateCan: function () {
      var cur = this.get('current')
      var loading = this.get('loading')
      this.set('canChange', this.get('options') && this.get('options').get('editable'))
      this.set('canOptions', !loading && cur instanceof MainMenu.ScenarioList.Map && !_.startsWith(this.get('screen'), 'save'))
      this.set('canBegin', !loading && cur instanceof MainMenu.ScenarioList.Map && (!this.get('screen').match(/^(new|load)Multi/) || !this.get('options') || ((this.get('options').get('host') && !this.get('options').get('observer')) || this.cx.map.get('confirming'))))
    },

    // function (pin)
    // Called when user selects a game from server lobby.
    joinLobby: Common.stub,
    // function ( {url|load, private} )
    // Called when user selects a map for creating as a server game.
    newLobby: Common.stub,
    // function (data, configure)
    // Called when user selects a saved single-player game for loading.
    loadSingle: Common.stub,
    // function (url, configure)
    // Called when user selects a map for starting a single-player game.
    newSingle: Common.stub,
  })

  // Internal object created when user has selected a map and wants to configure it. This happens when clicking on Advanced Options button for single-player game (new or loading) or when creating (or loading) a multi-player game.
  //
  // Main menu's map list is made invisible and current map can't be changed until configuration is cancelled.
  //
  // Has a child per each player in the selected map nested, to allow configuring player-specific options (e.g. starting town).
  MainMenu.PlayerOptions = Common.jQuery.extend({
    mixIns: [Common.ContextModule, Common.Ordered],
    el: {class: 'Hh3-menu-ns__left Hh3-menu-ns__options'},
    persistent: true,
    _childClass: 'Item',
    rpc: null,
    rules: null,
    _headerTemplate: null,
    _turnLengthSlider: null,

    // Seconds, 0 = unlimited.
    _turnLengths: [60, 120, 240, 360, 480, 600, 900, 1200, 1500, 1800, 0],

    _opt: {
      player: 0,  // do not change after new
      host: false,
      editable: false,
      observer: false,
      clientSource: '',
      menu: null, // must be given to constructor; must match the MainMenu whose _opt.options this object is set to; do not change
    },

    events: {
      '-init': function (opt) {
        this.rpc = opt.context.rpcFor(opt.player)
        // Rules is added by H3.js on owned so hookRPC() is effective.
        this.rules = this.rpc.rules
      },

      init: function () {
        this._headerTemplate = this.cx.template('HeroWO.H3.DOM.MainMenu.PlayerOptions.Header')

        this._turnLengthSlider = new Slider({
          horizontal: true,
          max: this._turnLengths.length - 1,
          disabledClass: 'Hh3-menu__sdis',
          thumbClass: 'MHh3-btn_id_SCNRBSL Hh3-btn_act_no',
          upClass: 'MHh3-btn_id_SCNRBLF',
          downClass: 'MHh3-btn_id_SCNRBRT',
          buttonSFX: false,
          trackJump: this.cx.get('classic'),
        })

        this.autoOff(this._turnLengthSlider, {
          change_position: function (now, old, options) {
            if (!options.rpc /*it's the user dragging*/ && !isNaN(now)) {
              this.rpc.do('configure', {do: 'turnLength', value: this._turnLengths[now]})
            }
          },
        })
      },

      owned: function () {
        this._updateHost()
        this._updateEditable()
      },

      change_observer: '_updateEditable',

      'change_host, change_editable, change_observer, change_clientSource': 'update',

      change_host: function () {
        this.get('menu')._updateCan()
        this._updateEditable()
      },

      change_editable: function () {
        this.get('menu')._updateCan()
      },

      attach: function () {
        this.autoOff(this.get('menu'), {
          editDescription: function () {
            var value = prompt(this.cx.s('mainMenu', 'Enter new map description that other players will see and that will be written to the save file:'), this.cx.map.get('description')) || ''
            if (value = value.trim()) {
              this.rpc.do('configure', {do: 'description', value: value})
            }
          },
        })

        this.autoOff(this.cx.map, {
          change_pin: 'update',
          change_private: 'update',
          change_difficultyMode: 'update',
          change_turnLength: function () {
            this._updateTurnLengthSlider()
            // This updates the duration text, separately from _turnLengthSlider
            // whose update is deferred if dragging.
            this.update()
          },
          change_confirming: function () {
            this.get('menu')._updateCan()
            this._updateEditable()
          },
        })

        this.autoOff(this.cx.players.nested(this.get('player')), {
          change_host: '_updateHost',
        })
      },

      '-render': function () {
        this.el.append(this.cx.template('HeroWO.H3.DOM.MainMenu.PlayerOptions')(this.get()))

        this._updateTurnLengthSlider()
        this._turnLengthSlider.el.addClass('Hh3-menu__turd')
        this._turnLengthSlider.attach(this.el).render()

        this.autoOff(this.cx.players, {
          'nestExNew, unnested': '_populate',
        })

        this._orderedParent = this.$('.Hh3-menu-plo')
        this._populate()
      },

      _update: function () {
        var vars = {
          host: this.get('host'),
          editable: this.get('editable'),
          pin: this.cx.get('backend') == 'server' && this.cx.map.get('pin'),
          private: this.cx.map.get('private'),
          myself: _.format(this.cx.s('mainMenu', 'You are %s%s, %s %s'), Chat.nickName(this.get('clientSource')), this.get('host') ? ', a host' : '', this.get('observer') ? 'observing' : 'playing', this.rules.databank.players.atCoords(this.get('player'), 0, 0, 'name', 0)),
        }
        this.$('.Hh3-menu-ns__options-header').html(this._headerTemplate(vars))

        var len = this.cx.map.get('turnLength')
        len = len ? _.format(this.cx.s('mainMenu', '%d Minutes'), len / 60)
          : this.cx.s('mainMenu', 'Unlimited')
        this.$('.Hh3-menu-ns__tl').text(len)

        var diff = this.cx.map.get('difficultyMode')
        this.$('[data-Hdiff]').each(function () {
          var el = $(this)
          el.toggleClass('Hh3-btn_cur', el.attr('data-Hdiff') == diff)
          el.toggleClass('Hh3-btn_dis', !vars.editable)
        })

        this._turnLengthSlider.el.toggle(vars.editable)
      },

      '=_defaultKey': function (sup, player) {
        return player.get('player').get('player')
      },
    },

    elEvents: {
      'click .Hh3-menu-ns__lobby-pub,.Hh3-menu-ns__lobby-priv': function (e) {
        this.rpc.do('configure', {
          do: 'private',
          value: !_.includes(e.target.className, 'lobby-priv'),
        })
      },

      'click .Hh3-menu-ns__lobby-pin': function (e) {
        this.rpc.do('configure', {do: 'pin'})
      },

      'click .Hh3-menu-ns__d-btn': function (e) {
        this.rpc.do('configure', {do: 'difficultyMode', value: $(e.target).attr('data-Hdiff')})
      },
    },

    _populate: function () {
      var data = _.values(this.cx.players.omit('0'))
        .map(function (p) { return {player: p, options: this} }, this)

      var res = this.assignChildren(data, {
        eqFunc: 'player',
      })
    },

    _updateHost: function () {
      this.set('host', this.cx.players.nested(this.get('player')).get('host'))
    },

    _updateEditable: function () {
      this.set('editable', !this.get('observer') && this.get('host') && !this.cx.map.get('confirming'))
    },

    _updateTurnLengthSlider: function () {
      // do=configure is fired each time user has dragged the thumb to a new
      // position. If user hasn't released the mouse button by the time server
      // diff is received, changing slider's position will cause the thumb to
      // jump back. That would look confusing.
      if (this._turnLengthSlider.get('repeating')) {
        return this._turnLengthSlider.once('change_repeating', '_updateTurnLengthSlider', this)
      }

      var len = this._turnLengths.indexOf(this.cx.map.get('turnLength') || 0)

      this._turnLengthSlider.assignResp({
        max: len == -1 ? NaN : this._turnLengths.length - 1,
        position: len,
      }, {rpc: true})
    },
  })

  // Configurable options for a particular map's player. Read-only if user isn't a host (as with other PlayerOptions), isn't assigned to this player, or is an observer.
  MainMenu.PlayerOptions.Item = Common.jQuery.extend('HeroWO.H3.DOM.MainMenu.PlayerOptions.Item', {
    mixIns: [Common.ContextModule],
    el: {class: 'Hh3-menu-plo__item'},
    persistent: true,
    _towns: null,     // Starting Town options
    _heroes: null,    // Starting Hero options
    _bonuses: null,   // Starting Bonus options

    _opt: {
      options: null,   // do not set; PlayerOptions
      player: null,   // do not set
      playerText: '',
      editable: false,
    },

    events: {
      change_editable: 'update',

      attach: function () {
        var opt = {
          options: this.get('options'),
          player: this.get('player'),
        }
        this._towns   = this.addModule(MainMenu.PlayerOptions.TownSelector, opt)
        this._heroes  = this.addModule(MainMenu.PlayerOptions.HeroSelector, opt)
        this._bonuses = this.addModule(MainMenu.PlayerOptions.BonusSelector, opt)

        this.set('playerText', this.get('options').rules.databank.players.atCoords(this.get('player').get('player'), 0, 0, 'name', 0))

        this._updateEditable()

        this.autoOff(this.get('options'), {
          change_editable: '_updateEditable',
          change_observer: '_updateEditable',
        })

        this.autoOff(this.cx.map, {
          change_confirming: function () {
            this.update()
            this._updateEditable()
          },
        })

        this.autoOff(this.get('player'), {
          change: 'update',
        })
      },

      '-render': function () {
        this.el.append(this.cx.template(this.constructor.name)())
      },

      _update: function () {
        var player = this.get('player')
        var controllers = _.pluck(player.get('controllers'), 'type')

        this.$('.Hh3-menu-plo__controller').text(player.get('label'))

        var text = controllers
          .map(function (ctl) {
            return this.cx.s('mainMenu', ({human: 'Human', ai: 'CPU'})[ctl])
          }, this)
          .sort()
          .join(this.cx.s('mainMenu', ' or '))
        this.$('.Hh3-menu-plo__controllers').text(text)

        this.$('.Hh3-menu-plo__handicap').text(this.handicap())

        var el = this.$('.Hh3-menu-plo__flag')
        var flag = 'AOFLGB' + '.RBYGOPTS'[player.get('player')]  // AOFLGBR, etc.
        Common.oneClass(el, 'MHh3-btn_id_', flag)
        // For observer too, show the non-disabled flag for own player (clicks will do nothing if not editable anyway), not responding to :active (Hh3-btn_act_no).
        Common.oneClass(el, 'Hh3-btn_', this.cx.get('classic') || this.get('editable') || player.get('player') == this.get('options').get('player') ? 'hov' : 'dis')
        el.toggleClass('Hh3-btn_act_no', !this.cx.get('classic') && !this.get('editable'))

        Common.oneClass(this.el, 'Hh3-menu-plo__player_', player.get('player'))

        Common.oneClass(this.el, 'Hh3-menu-plo_edit_', this.get('editable') ? 'yes' : 'no')

        Common.oneClass(this.el, 'Hh3-menu-plo_conf_', this.cx.map.get('confirming') ? !player.get('connected') || player.get('confirmed') ? 'yes' : 'no' : null)

        Common.oneClass(this.el, 'Hh3-menu-plo_can_',
          _.includes(controllers, 'human')  ? 'human' : null,
          _.includes(controllers, 'ai')     ? 'ai' : null)
      },
    },

    elEvents: {
      'click .Hh3-menu-plo__handicap': function () {
        if (this.get('editable')) {
          var msg = this.cx.s('mainMenu', 'This changes the handicap of %s.\n\nHandicap affects cost of buildings and cost and health of creatures. For example, at 50%% the player\'s buildings and creatures are twice as expensive as normal (100%%), and health of his creatures is halved. In contrast, 125%% makes buildings and creatures cheaper by a quarter, and increases health of creatures by the same degree.')
          var handicap = prompt(_.format(msg, this.get('playerText')), this.handicap())
          if (handicap) {
            handicap = (parseFloat(handicap) || 100) / 100
            // 50% = 1.0    125% = -0.25
            handicap = (handicap >= 1 ? 1 - handicap : 1 / handicap - 1)
            this.get('options').rpc.do('configure', {
              do: 'handicap',
              player: this.get('player').get('player'),
              value: handicap,
            })
          }
        }
      },

      'click .Hh3-menu-plo__flag': function () {
        if (this.cx.get('backend') != 'server') {
          if (this.get('player').isHuman() && this.cx.players.every(function (pl) { return pl == this.get('player') || !pl.isHuman() }, this)) {
            // This is the only human player, leave it alone.
            return
          }
          this.get('options').rpc.do('configure', {
            do: 'ai',
            player: this.get('player').get('player'),
          })
        } else if (this.get('options').get('editable')) {
          this.get('options').rpc.do('configure', {do: 'clients'})
            .whenSuccess(function (async) {
              var msg = [this.cx.s('mainMenu', 'These clients exist in your lobby:')]
              var clients = async.result
                .map(function (client) {
                  client.nickName = Chat.nickName(client.actionSource)
                  return client
                })
                .sort(function (a, b) {
                  return Common.compare(a.nickName, b.nickName)
                })
              clients.forEach(function (client, i) {
                msg.push(_.format(this.cx.s('mainMenu', '#%d. %s%s, currently %s %s'),
                  i + 1,
                  client.nickName,
                  client.observer ? this.cx.s('mainMenu', ', an observer') : '',
                  this.get('options').rules.databank.players.atCoords(client.player, 0, 0, 'name', 0),
                  client.actionSource == this.get('options').get('clientSource') ? this.cx.s('mainMenu', '(yourself)') : ''
                ))
              }, this)
              msg.push('', _.format(this.cx.s('mainMenu', 'Type a command:\n- Number of the client who will become %s\n- Number followed by letter "o" - observer of %1$s\n- Number followed by "k" - kick\n- Just letter "h" - grant admin powers to all clients of %1$s\n- Letter "p" - revoke admin powers from %1$s\n- Letter "c" - make %1$s a Computer'), this.get('playerText')))
              var num = prompt(msg.join('\n')) || ''
              if (num = num.trim().match(/^[hpc]$|^(\d+)\s*([ok]?)$/i)) {
                if (num[0] == 'h' || num[0] == 'p') {
                  return this.get('options').rpc.do('configure', {
                    do: 'host',
                    player: this.get('player').get('player'),
                    value: num[0] == 'h',
                  })
                }
                if (num[0] == 'c') {
                  return this.get('options').rpc.do('configure', {
                    do: 'ai',
                    player: this.get('player').get('player'),
                  })
                }
                var client = clients[num[1] - 1]
                if (!client) {
                  return alert(this.cx.s('mainMenu', 'Wrong client number: ' + num[0]))
                }
                switch (num[2].toLowerCase()) {
                  case '':
                  case 'o':
                    return this.get('options').rpc.do('configure', {
                      do: 'assign',
                      actionSource: client.actionSource,
                      player: this.get('player').get('player'),
                      observer: num[2] == 'o',
                    })
                  case 'k':
                    return this.get('options').rpc.do('configure', {
                      do: 'kick',
                      actionSource: client.actionSource,
                    })
                  default:
                    alert(this.cx.s('mainMenu', 'Wrong command suffix: ' + num[2]))
                }
              }
            }, this)
        }
      },
    },

    handicap: function () {
      var handicap = this.get('player').get('handicap') || 0
      return Math.round((handicap < 0 ? -handicap + 1 : 1 / (handicap + 1)) * 100) + '%'
    },

    _updateEditable: function () {
      this.set('editable', this.get('options').get('editable') || (!this.get('options').get('observer') && this.get('player').get('player') == this.get('options').get('player') && !this.cx.map.get('confirming')))
    },
  })

  // Base switch used in particular player's configurable options (e.g. Starting Town).
  MainMenu.PlayerOptions.Selector = Common.jQuery.extend({
    mixIns: [Common.ContextModule],
    persistent: true,
    _command: null,

    _opt: {
      options: null,
      player: null,
      choices: [],    // cannot be empty; 'value' must be unique and must be compared with ===
      editable: false,
    },

    events: {
      attach: function () {
        this._updateEditable()

        this.autoOff(this.get('options'), {
          change_editable: '_updateEditable',
        })

        this.autoOff(this.get('player'), [
          'change_' + this._command,
          'update',
        ])
      },

      '+normalize_choices': function (res, value) {
        var old = this.get('choices')
        if (_.pluck(value, 'class').join() == _.pluck(old, 'class').join()) {
          value = old
        }
        return value
      },

      change_choices: function () {
        this._updateEditable()
        this.update()
      },

      change_editable: 'update',

      '-render': function () {
        this.el.append(
          '<span class="Hsfx__btn Hh3-menu-plos__prev MHh3-btn_id_ADOPLFA">',
          '<span class="Hh3-menu-plos__face">',
          '<span class="Hsfx__btn Hh3-menu-plos__next MHh3-btn_id_ADOPRTA">',
          '<div class="Hh3-menu-plos__text Hh3-menu__text5">'
        )
      },

      _update: function () {
        Common.oneClass(this.el, 'Hh3-menu-plos_editable_', this.get('editable') ? 'yes' : 'no')

        var value = this.value()
        var cur = this.get('choices').find(function (c) { return c.value === value })

        if (cur) {
          this.$('.Hh3-menu-plos__face').attr('class', function (i, cls) {
            return cls.replace(/ .*/, '') + ' ' + cur.class
          })

          this.$('.Hh3-menu-plos__text').text(cur.text)
        }
      },
    },

    elEvents: {
      'click .Hh3-menu-plos__prev,.Hh3-menu-plos__next': function (e) {
        var value = this.value()
        var choices = this.get('choices')
        var cur = _.findIndex(choices, function (c) { return c.value === value })
        cur += e.target.classList.contains('Hh3-menu-plos__next') || -1
        cur = cur < 0 ? choices.length - 1 : cur >= choices.length ? 0 : cur
        if (choices[cur].value !== value) {
          this.switch(choices[cur].value)
        }
      },
    },

    _updateEditable: function () {
      this.set('editable', this.get('options').get('editable') && this.get('choices').length > 1)
    },

    value: function () {
      return this.get('player').get(this._command)
    },

    switch: function (value) {
      this.get('options').rpc.do('configure', {
        do: this._command,
        player: this.get('player').get('player'),
        value: value,
      })
    },
  })

  // The Starting Town switch in player's configurable options. Offers enabled map's towns and Random.
  MainMenu.PlayerOptions.TownSelector = MainMenu.PlayerOptions.Selector.extend({
    el: {class: 'Hh3-menu-plo__town'},
    _command: 'town',

    events: {
      attach: function () {
        this.autoOff(this.get('player'), {
          change_towns: '_updateChoices',
        })

        this._updateChoices()
      },

      change_choices: function (now) {
        // Technically, given $towns of [$id] the $town of false (random) is the same as of 0 ($id). But we hide "Random" in the UI if choices.length == 1 so switch to [0] immediately, else false value() will have no matching member in choices.
        if (now[0].value !== false && this.value() === false) {
          this.switch(now[0].value)
        }
      },
    },

    _updateChoices: function () {
      var choices = (this.get('player').get('towns') || [])
        .map(function (town) {
          return {
            value: town,
            class: 'MHh3-def_frame_ITPA-0-' + (2 + this.get('options').rules.towns.atCoords(town, 0, 0, 'portrait', 0)),
            text: this.get('options').rules.towns.atCoords(town, 0, 0, 'name', 0),
          }
        }, this)

      if (choices.length != 1) {
        choices.unshift({
          value: false,
          class: 'MHh3-bmp_id_HPSRAND0',
          text: this.cx.s('mainMenu', 'Random'),
        })
      }

      this.set('choices', choices)
    },
  })

  // The Starting Hero switch in player's configurable options. Offers enabled map's heroes and Random, or None.
  MainMenu.PlayerOptions.HeroSelector = MainMenu.PlayerOptions.Selector.extend({
    el: {class: 'Hh3-menu-plo__hero'},
    _command: 'heroes',

    events: {
      '+value': function (res) {
        var starting = this.get('player').get('startingHeroClasses')
        return _.isArray(starting) ? (res || []).length ? res[0] : null : starting
      },

      '=switch': function (sup, value) {
        return sup(this, [[value]])
      },

      attach: function () {
        this.autoOff(this.get('player'), {
          'change_controllers, change_controller': '_updateEditable',
          change_town: '_updateEditable',
          'change_town, change_startingHeroClasses': '_updateChoices',
        })

        this._updateChoices()
      },

      change_choices: function (now) {
        this.switch(now[0].value)
      },

      _updateEditable: function () {
        this.getSet('editable', function (cur) {
          return cur && this.get('player').get('town') !== false &&
                 // SoD doesn't allow picking hero for CPU.
                 this.get('player').isHuman()
        })
      },
    },

    _updateChoices: function () {
      var town = this.get('player').get('town')
      var heroes = this.get('player').get('startingHeroClasses')

      if (heroes != null && heroes !== false) {
        var choices = []

        if (_.isArray(heroes)) {
          if (town !== false) {
            choices = heroes
              .filter(function (hero) {
                return town == this.get('options').rules.heroClasses.atCoords(this.get('options').rules.heroes.atCoords(hero, 0, 0, 'class', 0), 0, 0, 'town', 0)
              }, this)
              .map(function (hero) {
                return {
                  value: hero,
                  class: 'MHh3-bmp_id_HPS' + this.get('options').rules.heroes.atCoords(hero, 0, 0, 'portrait', 0),
                  text: this.get('options').rules.heroes.atCoords(hero, 0, 0, 'name', 0),
                }
              }, this)
          }

          choices.unshift({
            value: null,
            class: 'MHh3-bmp_id_HPSRAND1',
            text: this.cx.s('mainMenu', 'Random'),
          })
        } else {
          // When there's a fixed starting hero, displaying the object's properties rather than databank's because they may be overridden in the object (see "Adventures of Jared Haret" for example). However, if they were not overridden, calculators will return falsy values (_opt.initial) since H3.Rules' _initializeObjects() hasn't run yet and hasn't copied databank's name/portrait as a hero-specific Effect.

          // For simplicity, not listening to changes since these are not supposed to change prior to map start-up.
          var name = this.cx.oneShotEffectCalculation({
            class: Calculator.Effect.GenericString,
            target: this.cx.map.constants.effect.target.name,
            ifObject: this.get('player').get('startingHero'),
          })
          name === '' && (name = this.get('options').rules.heroes.atCoords(heroes, 0, 0, 'name', 0))
          var portrait = this.cx.oneShotEffectCalculation({
            class: Calculator.Effect.GenericString,
            target: this.cx.map.constants.effect.target.portrait,
            ifObject: this.get('player').get('startingHero'),
          })
          portrait === '' && (portrait = this.get('options').rules.heroes.atCoords(heroes, 0, 0, 'portrait', 0))

          choices.push({
            value: heroes,
            class: 'MHh3-bmp_id_HPS' + portrait,
            text: name,
          })
        }
      }

      if (!choices || !choices.length) {
        // Either heroes is null/false or
        // it is a non-array and doesn't match player's town.
        choices = [{
          value: null,
          class: 'MHh3-bmp_id_HPSRAND6',
          text: this.cx.s('mainMenu', 'None'),
        }]
      }

      this.set('choices', choices)

      // When there is one possible hero, SoD shows his face or, sometimes, "None" (see h3m-The-Corpus.txt and h3m2herowo.php). We always show his face, even if the hero mismatches the player's starting town.
      //
      // Overall, Advanced Options behaviour was only briefly checked against SoD (as described in h3m-The-Corpus.txt under starting_hero_is_random). Same goes for H3.Rules hero creation logic.
    },
  })

  // The Starting Bonus switch in player's configurable options. Offers Artifact, Resource, Random, etc.
  MainMenu.PlayerOptions.BonusSelector = MainMenu.PlayerOptions.Selector.extend({
    el: {class: 'Hh3-menu-plo__bonus'},
    _command: 'bonus',

    events: {
      attach: function () {
        this.autoOff(this.get('player'), {
          change_town: '_updateChoices',
          change_startingHeroClasses: '_updateChoices',
          change_bonusGiven: '_updateChoices',
        })

        this._updateChoices()
      },

      change_choices: function (now, old) {
        var value = this.value()
        var ni = _.findIndex(now, function (i) { return i.value === value })
        var oi = _.findIndex(old, function (i) { return i.value === value })
        if (ni != oi) {
          this.switch(now[0].value)
        }
      },
    },

    _updateChoices: function () {
      var consts = this.get('options').rules.constants

      var choices = [
        {
          value: false,
          class: 'MHh3-def_frame_SCNRSTAR-0-10',
          text: this.cx.s('mainMenu', 'Random'),
        },
        {
          value: consts.mapPlayer.bonus.artifact,
          class: 'MHh3-def_frame_SCNRSTAR-0-9',
          text: this.cx.s('mainMenu', 'Artifact'),
        },
        {
          value: consts.mapPlayer.bonus.gold,
          class: 'MHh3-def_frame_SCNRSTAR-0-8',
          text: this.cx.s('mainMenu', 'Gold'),
        },
      ]

      var heroes = this.get('player').get('startingHeroClasses')
      if (heroes == null || heroes === false) {
        choices.splice(1, 1)
      }

      var town = this.get('player').get('town')

      if (town !== false) {
        var frames = [
          consts.resources.wood,
          consts.resources.crystal,
          consts.resources.gems,
          consts.resources.mercury,
          consts.resources.wood,
          consts.resources.sulfur,
          consts.resources.wood,
          consts.resources.wood,
          consts.resources.mercury,
        ]

        choices.push({
          value: consts.mapPlayer.bonus.resource,
          class: 'MHh3-def_frame_SCNRSTAR-0-' + frames.indexOf(this.get('options').rules.towns.atCoords(town, 0, 0, 'resources', 0)[0]),
          text: this.cx.s('mainMenu', 'Resource'),
        })
      }

      if (this.get('player').get('bonusGiven')) {
        var value = this.value()
        choices = choices.filter(function (c) { return c.value === value })
      }

      this.set('choices', choices)
    },
  })

  // List of entries (maps, lobby, saved games, etc.) shown in left-side panel of most menu sections (new, load, multi-player, etc.).
  //
  // Client must be providing the list of maps. The easiest way to do this is
  // by assignChildren() with `[options.auto`] set. Then each member can be either,
  // if `'type key doesn't exist or is subclass of Map, an object in `'unser format, or just an object. If it's an object (regardless of `'type), `'newOpt key specifies the argument for `'new and allows passing data to constructor of a non-Map Item, as well as holding custom data that is not part of Map.serializeHeader().
  //
  // If the source list is in the store format (Maps), it can be converted to
  // list of Map like this:
  //
  //   var maps = new Maps([{...}, {...}, ...])
  //   maps = _.times(maps.count(), maps.mapAt, maps)
  //   menu.list.assignChildren(maps)
  MainMenu.ScenarioList = Common.jQuery.extend({
    mixIns: [Common.Ordered],
    el: {tag: 'table', class: 'Hh3-menu-sl'},
    _childClass: 'Item',
    _childEvents: ['clicked', 'doubleClicked', 'change', 'change_matching', '-unnest'],

    _opt: {
      context: null,
      sort: 'title',
      sortAsc: true,
      matchingCount: 0,   // only read
      current: null,
    },

    events: {
      init: function () {
        this.fuse('.change', Common.batchGuard(4, '_childChanged', {cx: this}))
      },

      change_sort: 'resort',
      change_sortAsc: 'resort',

      '.change': function (child, opt) {
        switch (opt) {
          case 'key':   // usually cannot change since it provides _defaultKey
          case 'sortGroup':
          case this.get('sort'):
            this.nest(child, {repos: true})
        }
      },

      '=_sorter': function (sup, a, b, posB) {
        var posA = [a.child._opt.sortGroup, a.child._opt[this._opt.sort]]
        if (typeof posA[1] == 'string') {
          posA[1] = posA[1].trim().toLowerCase()
        }
        if (arguments.length == 2) {
          return posA
        } else {
          return posA[0] - posB[0] ||
                 (Common.compare(posA[1], posB[1]) || Common.compare(a.key, b.key))
                   * (this._opt.sortAsc ? 1 : -1)
        }
      },

      '=_defaultKey': function (sup, child) {
        return child.get('key')
      },

      '=assignChildren': function (sup, resp, options) {
        if (options && options.auto) {
          options.schema = 'mapSchema'
          options.eqFunc = 'key'

          options.newFunc = function (resp) {
            var cls = MainMenu.ScenarioList[resp.type || 'Map']
            return new cls(_.extend({context: this.get('context')}, resp.newOpt))
          }

          resp = _.map(resp, function (map) {
            if (!map.type ||
                MainMenu.ScenarioList[map.type].prototype instanceof MainMenu.ScenarioList.Map) {
              var obj = new HMap
              obj.assignResp(map, {schema: 'unser'})
              map = _.extend(obj.serializeHeader(), map.newOpt, _.pick(map, 'type', 'key', _.forceObject))
            }

            return map
          })
        }

        var res = sup(this, [resp, options])

        if (options && options.auto) {
          _.each(res[0], function (res) {
            var child = res.child
            child.set('matching', this.childMatches(child))
            child.attach().render()
          }, this)
        }

        return res
      },

      nestExNew: function (res) {
        if (res.child.get('matching')) {
          this.getSet('matchingCount', Common.inc())
        }
      },

      unnested: function (child) {
        if (child.get('matching')) {
          this.getSet('matchingCount', Common.inc(-1))
        }
      },

      '.change_matching': function (child, now) {
        this.getSet('matchingCount', Common.inc(now ? 1 : -1))
      },

      '.-unnest, .change_matching': function (child, now) {
        if (!now && this.get('current') == child) {
          var index = this.indexOf(child)

          for (var i = index, delta = +1; (i += delta) >= 0; ) {
            if (i == this.length) {
              i = index
              delta = -1
            } else if (this.at(i).child.get('matching')) {
              return this.set('current', this.at(i).child)
            }
          }
        }
      },

      change_current: function (child) {
        if (child && (child._parent !== this || !child.get('matching'))) {
          throw new Error('Invalid current child set.')
        }
      },

      '.clicked': function (child) {
        this.set('current', child)
      },
    },

    // This collection calls childMatches() when a child's _opt changes. If childMatches()
    // changes its internal logic (criteria), client should manually re-set
    // _opt.matching on all children.
    childMatches: function (child) {
      return true
    },

    _childChanged: function (child, $1, $2, $3, options) {
      var found = options.batched.some(function (item) {
        return this.nested(item[0]) &&
               item[1].some(function (event) {
                 return event[0] == 'change' && event[1] != 'matching'
               })
      }, this)

      found && child.set('matching', this.childMatches(child))
    },

    matching: function () {
      return this.filter(Common.p('get', 'matching'))
    },

    autoSelect: function () {
      var cur

      this.some(function (child) {
        if (child.get('matching')) {
          cur = cur || child
          if (child instanceof MainMenu.ScenarioList.Map) {
            return cur = child
          }
        }
      })

      this.set('current', cur)
    },
  })

  // Base entry (map, game, etc.) shown in left-side panel's list.
  //
  // This object holds all map info in flat values in own _opt (see
  // ScenarioList.Map) rather than taking it from a Map instance to simplify
  // making changes (assignResp() is enough) and listening for them ('change'
  // hook is enough).
  MainMenu.ScenarioList.Item = Common.jQuery.extend({
    el: {tag: 'tr', class: 'Hh3-menu-sli Hh3-menu__text3'},

    _opt: {
      attachPath: '.',
      matching: false,  // set by parent; true if childMatches() returned true for this
      key: '',    // unique identifier of ScenarioList child
      context: null,
      sortGroup: 0,

      // Exist in the base class because are used in _updateInfo().
      title: '',
      description: '',
    },

    events: {
      '+normalize_matching': Common.normBool,

      change_matching: function (now) {
        this.el.toggle(now)
      },

      render: function () {
        this.el.toggle(this.get('matching'))
      },
    },

    mapSchema: {
    },

    elEvents: {
      click: 'clicked',
      dblclick: 'doubleClicked',
    },

    clicked: Common.stub,
    doubleClicked: Common.stub,   // clicked is also called before this one

    serialize: function () {
      return _.extend(this.get(), {
        type: this.constructor.name.replace(/.*\./, ''),
      })
    },
  })

  // Base entry that doesn't contain map properties (e.g. a link to uploading a local save file).
  MainMenu.ScenarioList.Special = MainMenu.ScenarioList.Item.extend('HeroWO.H3.DOM.MainMenu.ScenarioList.Special', {
    _opt: {
      matching: true,   // not filterable by default
      icon: '',
    },

    events: {
      '=normalize_matching': function (sup, $, options) {
        // Allow overriding matching when explicitly given to ScenarioList's
        // assignChildren().
        return options.schema == 'mapSchema'
          ? sup(this, arguments) : this.get('matching')
      },

      render: function () {
        this.el.html(this.get('context').template(this.constructor.name)(this.get()))
      },

      '+serialize': function () {
        return false
      },
    },
  })

  MainMenu.ScenarioList.UploadMap = MainMenu.ScenarioList.Special.extend({
    _opt: {
      title: 'Upload Your Map',
      icon: 'upload',
    },
  })

  MainMenu.ScenarioList.NewLobby = MainMenu.ScenarioList.Special.extend({
    _opt: {
      title: 'Create New Game',
      icon: 'create',
    },
  })

  MainMenu.ScenarioList.JoinLobby = MainMenu.ScenarioList.Special.extend({
    _opt: {
      title: 'Join Game by PIN',
      icon: 'join',
    },
  })

  MainMenu.ScenarioList.UploadSaved = MainMenu.ScenarioList.Special.extend({
    _opt: {
      title: 'Load From File',
      icon: 'upload',
    },
  })

  MainMenu.ScenarioList.SaveToFile = MainMenu.ScenarioList.Special.extend({
    _opt: {
      title: 'Save to Local File',
      icon: 'saveFile',
    },
  })

  MainMenu.ScenarioList.SaveToLocalStorage = MainMenu.ScenarioList.Special.extend({
    _opt: {
      title: 'Create New Save',
      icon: 'create',
    },
  })

  MainMenu.ScenarioList.SaveURL = MainMenu.ScenarioList.Special.extend({
    _opt: {
      sortGroup: 1,
      title: 'Public Save Download',
      icon: 'url',
    },
  })

  MainMenu.ScenarioList.ReplayURL = MainMenu.ScenarioList.SaveURL.extend({
    _opt: {
      title: 'Public Replay Download',
    },
  })

  // Entry that changes MainMenu's filter to show maps in another folder (parent or subfolder).
  MainMenu.ScenarioList.Folder = MainMenu.ScenarioList.Item.extend('HeroWO.H3.DOM.MainMenu.ScenarioList.Folder', {
    _opt: {
      sortGroup: 4,   // 3 if goUp
      count: 0,   // count of maps, recursive
      goUp: false,
    },

    events: {
      change_goUp: function (now) {
        this.getSet('sortGroup', Common.inc(-now || +1))
        this.render()
      },

      render: function () {
        this.el.html(this.get('context').template(this.constructor.name)(this.get()))

        if (measureText(this.get('title'), this.el)) {
          this.$('.Hh3-menu-sli__title-wrap').addClass('Hh3-menu-sli__title-wrap_long')
        }
      },
    },
  })

  // Returns width of text rendered using the map list's font. Used to decrease font size for long map titles, allowing more symbols to fit before the rest is ellipsized.
  var measureTextWidth
  var measureTextEl = $('<span class=Hh3-menu__text3>')
    .css({whiteSpace: 'nowrap', position: 'absolute', left: -9999})
  function measureText(str, el) {
    if (!measureTextWidth) {
      measureTextWidth = el.find('.Hh3-menu-sli__title').width()
    }
    var root = $('.Hh3-menu')[0]
    if (root != measureTextEl.parent()[0]) {
      measureTextEl.appendTo(root)
    }
    return measureTextEl.text(str).width() > measureTextWidth
  }

  // Returns current value of sqimitive's `'opt if it's the "same" as new `'array value. Used for `'+normalize_OPT.
  function normArrayOfObjects(opt) {
    return function ($, array) {
      var cur = this.get(opt)
      return JSON.stringify(cur) == JSON.stringify(array) ? cur : array
    }
  }

  // Entry representing a particular map with map's base properties (and maybe others). This one is used for local map.
  MainMenu.ScenarioList.Map = MainMenu.ScenarioList.Item.extend('HeroWO.H3.DOM.MainMenu.ScenarioList.Map', {
    _template: null,

    _opt: {
      sortGroup: 5,

      id5: '',
      size: 0,
      sizeType: '',
      sizeText: '',
      victoryCount: 0,
      lossCount: 0,
      playerCount: 0,
      victoryType: '',
      victoryText: '',
      lossType: '',
      lossText: '',
      difficultyText: '',
      humanCount: 0,
      teams: {},    // team number => array of Map.Player._opt, except neutral
      allies: [],   // array of _opt, includes the player (human) himself
      enemies: [],

      // + Map.serializeHeader()
    },

    events: {
      '+normalize_teams': normArrayOfObjects('teams'),
      '+normalize_allies': normArrayOfObjects('allies'),
      '+normalize_enemies': normArrayOfObjects('enemies'),

      '+normalize_victory': normArrayOfObjects('victory'),
      '+normalize_loss': normArrayOfObjects('loss'),
      '+normalize_players': normArrayOfObjects('players'),

      render: function () {
        this.fuse('change', Common.batchGuard(3, function ($1, $2, $3, options) {
          var found = options.batch.some(function (event) {
            return event[0] == 'change' && event[1] != 'matching'
          })
          found && this.update()
        }, {cx: this}))

        this._template = this.get('context').shared(this.constructor.shared, function () {
          return this.get('context').template(this.constructor.name)
        }, this)

        this.update()
      },
    },

    update: function () {
      this.batch(null, this._update)
      this.el.html(this._template(this.get()))

      this.$('.Hh3-menu-sli__title-wrap').toggleClass(
        'Hh3-menu-sli__title-wrap_long', measureText(this.get('title'), this.el))
    },

    _update: function () {
      var cx = this.get('context')
      var consts = this.get('constants')

      this.set('id5', this.get('id').substr(0, 5))

      this.set('size', Math.max(
        this.get('width')  - this.get('margin')[0] - this.get('margin')[2],
        this.get('height') - this.get('margin')[1] - this.get('margin')[3]
      ))
      var type = _.find({36: 's', 72: 'm', 108: 'l'}, function (type, value) {
        return this.get('size') <= value && type
      }, this)
      this.set('sizeType', type || 'xl')
      this.set('sizeText', cx.s('mainMenu', this.get('sizeType').toUpperCase()))
      this.set('victoryCount', this.get('victory').length)
      this.set('lossCount', this.get('loss').length)
      this.set('playerCount', this.get('players').length - 1 /*neutral*/)

      var isRegular = function (victory) {
        // Signifies defeat of all enemy heroes and castles.
        return victory.type == consts.mapVictory.type.defeat && !victory.object
      }

      var victory = 'custom'
      var custom = _.reject(this.get('victory'), isRegular)
      // Standard are:
      // - exactly 1 condition and that isRegular()
      // - exactly 1 condition and that is not isRegular()
      // - exactly 2 conditions, one isRegular(), other tested below
      if (this.get('victory').length == 1 && custom.length == 0) {
        victory = '-'
      } else if ((this.get('victory').length == 1 || this.get('victory').length == 2) && custom.length == 1) {
        custom = custom[0]
        switch (_.indexOf(consts.mapVictory.type, custom.type)) {
          case 'ownArtifact':
            victory = custom.object ? 'ta' : 'oa'
            break
          case 'ownCreatures':
            victory = 'oc'
            break
          case 'ownResources':
            victory = 'or'
            break
          case 'ownTown':
            // object can be falsy for any.
            victory = custom.townGrail ? 'gt' : 'ut'
            break
          case 'defeat':
            if (custom.object) {
              var conv = _.object([consts.object.type.hero, consts.object.type.town, consts.object.type.monster], ['dh', 'dt', 'dm'])
              victory = conv[custom.objectType] || 'custom'
            }
            break
          case 'ownDwelling':
            if (!custom.object) {
              victory = 'od'
            }
            break
          case 'ownMine':
            if (!custom.object) {
              victory = 'om'
            }
            break
        }
        if (victory != 'custom' && this.get('victory').length == 2) {
          victory += '-'    // and regular victory
        }
      }

      // XXX=IC some of these texts are different in Main Menu and in scenario info window (in-game); for example, 'oc' says: 'Accumulate %d %s in your kingdom's armies.'
      var texts = {
        custom: 'Non-standard victory conditions',
        '-': 'Defeat All Enemies',
        oa: 'Acquire Artifact',
        ta: 'Transport Artifact',
        oc: 'Accumulate Creatures',
        or: 'Accumulate Resources',
        gt: 'Build a Grail Structure',
        ut: 'Upgrade Town',
        dh: 'Defeat Hero',
        dt: 'Capture Town',
        dm: 'Defeat Monster',
        od: 'Flag All Creature Dwellings',
        om: 'Flag All Mines',
        'oa-': 'Acquire Artifact or Defeat All Enemies',
        'ta-': 'Transport Artifact or Defeat All Enemies',
        'oc-': 'Accumulate Creatures or Defeat All Enemies',
        'or-': 'Accumulate Resources or Defeat All Enemies',
        'gt-': 'Build a Grail Structure or Defeat All Enemies',
        'ut-': 'Upgrade Town or Defeat All Enemies',
        'dh-': 'Defeat Hero or Defeat All Enemies',
        'dt-': 'Capture Town or Defeat All Enemies',
        'dm-': 'Defeat Monster or Defeat All Enemies',
        'od-': 'Flag All Creature Dwellings or Defeat All Enemies',
        'om-': 'Flag All Mines or Defeat All Enemies',
      }
      this.set('victoryText', cx.s('mainMenu', texts[victory]))
      this.set('victoryType', victory)

      var isRegular = function (loss) {
        // Signifies loss of all player's heroes and castles.
        return loss.type == consts.mapLoss.type.lose && !loss.object
      }

      var loss = 'custom'
      // Standard are:
      // - exactly 1 condition and that isRegular()
      // - exactly 2 conditions, one isRegular(), other tested below
      var custom = _.reject(this.get('loss'), isRegular)
      if (this.get('loss').length  == 1 && custom.length == 0) {
        loss = '-'
      } else if (this.get('loss').length == 2 && custom.length == 1) {
        custom = custom[0]
        switch (_.indexOf(consts.mapLoss.type, custom.type)) {
          case 'lose':
            var conv = _.object([consts.object.type.hero, consts.object.type.town], ['lh', 'lt'])
            loss = conv[custom.objectType] || 'custom'
            break
          case 'days':
            loss = 'te'
            break
        }
        if (loss != 'custom') {
          loss += '-'
        }
      }

      var texts = {
        custom: 'Non-standard loss conditions',
        '-': 'Lose All Your Towns and Heroes',
        'lt-': 'Lose Town',
        'lh-': 'Lose Hero',
        'te-': 'Time Expires',
      }
      this.set('lossText', cx.s('mainMenu', texts[loss]))
      this.set('lossType', loss)

      var diffs = ['Easy', 'Normal', 'Hard', 'Expert', 'Impossible']
      this.set('difficultyText', cx.s('mainMenu', diffs[this.get('difficulty')]))

      var noNeutral = this.get('players').filter(Common.p('player'))
      var humans = noNeutral.filter(function (p) {
        return p.controllers.some(function (c) { return c.type == 'human' })
      })
      this.set('humanCount', humans.length)
      var teams = _.groupBy(noNeutral, Common.p('team'))
      this.set('teams', teams)
      var parts = _.partition(noNeutral, function (p) {
        return p.team == humans[0].team
      })
      this.set('allies',  parts[0])
      this.set('enemies', parts[1])
    },
  }, {shared: {}})

  // Entry of a lobby game (which is a kind of map) coming from remote server.
  MainMenu.ScenarioList.LobbyMap = MainMenu.ScenarioList.Map.extend({
    _opt: {
      mapTitle: '',
      pin: '',
      seats: 0,
      seated: 0,
      humans: 0,    // humanCount = potentially human-playable; humans = isHuman()
      classic: false,
    },

    events: {
      '+serialize': function (res) {
        res.type = 'LobbyMap'
        res.newOpt = _.pick(res, 'mapTitle', 'pin', 'seats', 'seated', 'classic', _.forceObject)
      },

      _update: function () {
        var humans = this.get('players').filter(function (p) {
          return p.controllers[p.controller].type == 'human'
        })
        this.set('humans', humans.length)
        this.set('title', _.format('(%s, %d/%d) %s', this.get('pin'), this.get('seated'), this.get('humans'), this.get('mapTitle')))
      },
    },
  })

  // Entry of a locally saved game, for lists on Load and Save menu screens.
  MainMenu.ScenarioList.SavedMap = MainMenu.ScenarioList.Map.extend({
    _opt: {
      mapTitle: '',
      fileName: '',
    },

    events: {
      '+serialize': function (res) {
        res.type = 'SavedMap'
        res.newOpt = _.pick(res, 'mapTitle', 'fileName', _.forceObject)
      },

      _update: function () {
        this.set('title', _.format('%s (%s)', this.get('fileName'), this.get('mapTitle')))
      },
    },
  })

  // Internal invisible entry set to MainMenu's _opt.current when PlayerOptions exists (a map is being configured).
  MainMenu.ScenarioList.ConfiguringMap = MainMenu.ScenarioList.Map.extend({
    _opt: {
      attachPath: '',   // off-DOM
      matching: true,
      classic: false,
    },

    events: {
      attach: function () {
        var cx = this.get('context')
        this.assignResp(cx.map.serializeHeader())
        this.set('classic', cx.get('classic'))

        this.autoOff(cx.map, {
          change: Common.batchGuard(3, function () {
            this.assignResp(cx.map.serializeHeader())
          }),
        })
      },

      '-unnest': 'autoOff-',

      '=normalize_matching': function () {
        return this.get('matching')
      },
    },
  })

  // Collection of updaters that populate ScenarioList with entries (maps, saves and others). Configures standard Updater-s (local maps, server lobby, saved games) and makes them available as own children.
  MainMenu.ScenarioList.Updaters = Common.Sqimitive.extend({
    _childClass: [MainMenu.ScenarioList, 'Updater'],

    _opt: {
      ready: true,
    },

    _initToOpt: {
      sseURL: false,
    },

    events: {
      init: function (opt) {
        // Creating updaters immediately because sse may be a just-opened
        // EventSource. If we create them after ES fires the initial events
        // (like 'full') then they will miss the events and the map list
        // will be blank.
        this._createUpdaters(opt.sse)
      },

      remove: function () {
        this.invoke('remove')
      },
    },

    _createUpdaters: function (sse) {
      if (sse) {
        this.nest('maps', new MainMenu.ScenarioList.Updater.SSE({
          es: sse,
        }))

        this.nest('lobby', new MainMenu.ScenarioList.Updater.SSE.Lobby({
          es: sse,
        }))
      }

      this.nest('saves', new MainMenu.ScenarioList.Updater.LocalStorage)

      this.invoke('attach')
    },
  })

  // Base provider of ScenarioList entries. Can be used together with Updaters or on its own.
  //
  // Can be attached to ScenarioList to keep it updated according to the underlying (remote) list changes, or detached to keep updating incrementally in background, making the complete list available instantly as needed (e.g. if user goes from local maps to server lobby).
  MainMenu.ScenarioList.Updater = Common.Sqimitive.extend({
    _full: {},  // null if list is non-null, else non-null

    _opt: {
      // Can be changed, including to/from null. When becomes null, existing
      // content is saved and can be reapplied (to the same or different list)
      // by setting to non-null later. Old list's content remains (it's not cleared on change_list).
      list: null,
    },

    events: {
      change_list: function (now, old) {
        if (old) {
          var full = this._full = {}

          old.each(function (child) {
            var opt = child.serialize()
            if (opt) {
              full[opt.key] = opt
            }
          })
        }

        if (now) {
          this._replaceAll(now, this._full)
          this._full = null
        }
      },
    },

    replaceAll: function (maps) {
      _.keys(maps).forEach(function (key) {
        var map = maps[key]

        if (!map.type ||
            MainMenu.ScenarioList[map.type].prototype instanceof MainMenu.ScenarioList.Map) {
          map.key = key
          this._extendMap(map)

          this.walkPath(key, function (path, last) {
            var folder = maps[path]

            if (folder) {
              folder.count++
            } else {
              maps[path] = this._folderOptions(path, last)
            }
          })
        }
      }, this)

      var list = this.get('list')

      if (list) {
        this._replaceAll(list, maps)
      } else {
        this._full = maps
      }
    },

    // Will mutate maps.
    _replaceAll: function (list, maps) {
      list.assignChildren(maps, {
        auto: true,
      })

      list.autoSelect()
    },

    _folderOptions: function (path, last) {
      return {
        type: 'Folder',
        key: path,
        description: decodeURI(path).replace(/\/$/, '').replace(/\//g, ' / '),
        title: last == '' ? 'Root' : last,
        count: 1,
      }
    },

    replaceMap: function (map) {
      this._extendMap(map)
      var list = this.get('list')

      if (list) {
        list.assignChildren([map], {auto: true, keepMissing: true})

        this.walkPath(map.key, function (path, last) {
          var obj = list.nested(path)
          if (obj) {
            obj.getSet('count', Common.inc())
          } else {
            list.assignChildren([this._folderOptions(path, last)], {auto: true, keepMissing: true})
          }
        }, this)
      } else {
        this._full[map.key] = map

        this.walkPath(map.key, function (path, last) {
          var folder = this._full[path]

          if (folder) {
            folder.count++
          } else {
            this._full[path] = this._folderOptions(path, last)
          }
        }, this)
      }
    },

    removeMap: function (key) {
      var list = this.get('list')

      if (list) {
        this.get('list').unlist(key)

        this.walkPath(key, function (path) {
          this.get('list').nested(path).getSet('count', function (cur) {
            cur == 1 ? this.remove() : cur--
            return cur
          })
        })
      } else {
        delete this._full[key]

        this.walkPath(key, function (path) {
          if (!--this._full[path].count) {
            delete this._full[path]
          }
        }, this)
      }
    },

    walkPath: function (key, func) {
      var path = ''
      func.call(this, '', '')

      key.split('/').slice(0, -1).forEach(function (last) {
        func.call(this, path += last + '/', decodeURI(last))
      }, this)
    },

    // function (resp)
    _extendMap: Common.stub,
  })

  // Updater that receives initial list of maps and its changes over SSE (Server-Sent Events).
  MainMenu.ScenarioList.Updater.SSE = MainMenu.ScenarioList.Updater.extend({
    _opt: {
      es: '',    //= EventSource
      group: 'maps',
    },

    events: {
      '-init': function () {
        this._boundFull   = Common.ef('_onFull', this)
        this._boundAdd    = Common.ef('_onAdd', this)
        this._boundRemove = Common.ef('_onRemove', this)
      },

      change_es: function (now, old) {
        if (old) {
          old.removeEventListener('full',   this._boundFull)
          old.removeEventListener('add',    this._boundAdd)
          old.removeEventListener('remove', this._boundRemove)
        }

        if (now) {
          now.addEventListener('full',   this._boundFull)
          now.addEventListener('add',    this._boundAdd)
          now.addEventListener('remove', this._boundRemove)
        }
      },

      remove: function () {
        this.set('es', null)
      },
    },

    _onFull: function (e) {
      this.replaceAll(JSON.parse(e.data)[this.get('group')])
    },

    _onAdd: function (e) {
      var data = JSON.parse(e.data)
      if (data[0] == this.get('group')) {
        data[2].key = data[1]
        this.replaceMap(data[2])
      }
    },

    _onRemove: function (e) {
      var data = JSON.parse(e.data)
      data[0] == this.get('group') && this.removeMap(data[1])
    },
  })

  // Variant of SSE Updater that receives list of server lobby games.
  MainMenu.ScenarioList.Updater.SSE.Lobby = MainMenu.ScenarioList.Updater.SSE.extend({
    _opt: {
      group: 'lobby',
    },

    _extendMap: function (map) {
      map.type = 'LobbyMap'
      map.newOpt = _.pick(map, 'pin', 'seats', 'seated', 'classic', _.forceObject)
      map.newOpt.mapTitle = map.title
    },
  })

  // Updater that reads list of saved games from browser's `'localStorage.
  //
  // XXX=I storing binary stuff in localStorage is inefficient, IndexedDB is much better and has no quota but the API is troublous
  MainMenu.ScenarioList.Updater.LocalStorage = MainMenu.ScenarioList.Updater.extend({
    _opt: {
      prefix: 'HeroWO Save ',
    },

    events: {
      init: function () {
        this._boundStorageEvent = Common.ef('_storageEvent', this)
      },

      attach: function () {
        var prefix = this.get('prefix') + 'i'
        var saves = {}

        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i)

          if (_.startsWith(key, prefix)) {
            try {
              saves[key] = JSON.parse(localStorage.getItem(key))
            } catch (e) {
              console && console.warn(e)
            }
          }
        }

        this.replaceAll(saves)

        window.addEventListener('storage', this._boundStorageEvent)  // from other tabs
        window.addEventListener('herowostorage', this._boundStorageEvent)  // from ours
      },

      remove: function () {
        window.removeEventListener('storage', this._boundStorageEvent)
        window.removeEventListener('herowostorage', this._boundStorageEvent)
      },
    },

    _storageEvent: function (e) {
      if (_.startsWith(e.key, this.get('prefix') + 'i')) {
        try {
          var data = e.newValue && JSON.parse(e.newValue)
        } catch (e) {}

        if (data) {
          data.key = e.key
          this.replaceMap(data)
        } else {
          this.removeMap(e.key)
        }
      }
    },

    readSave: function (key) {
      var parts = key.split(this.get('prefix'))

      if (parts[0] == '' && parts[1][0] == 'i') {
        key = this.get('prefix') + 'd' + parts[1].substr(1)
        try {
          return localStorage.getItem(key)
        } catch (e) {
          console && console.error(e)
        }
      }
    },

    // key must start with prefix + 'i'.
    writeSave: function (info, data, key) {
      try {
        if (!key) {
          do {
            key = this.get('prefix') + 'i' + Math.random()
          } while (localStorage.getItem(key))
        }

        // Try writing the largest data first. If fails, won't write the info.
        // Writing 'i' also signals via the storage event that the data is ready.
        localStorage.setItem(this.get('prefix') + 'd' + key.substr(this.get('prefix').length + 1), data)
        localStorage.setItem(key, info = JSON.stringify(info))
      } catch (e) {
        console && console.error(e)
        return
      }

      // onstorage doesn't happen for the page making the change so have to simulate it. Using another event name to avoid confusing other listeners that expect onstorage not to occur in this case. Alternatively, could dispatch a generic Event with custom fields but a StorageEvent seems cleaner.
      var e = document.createEvent('storageevent')
      e.initStorageEvent('herowostorage', false, false, key, null, info, location.href, localStorage)
      window.dispatchEvent(e)

      return key
    },

    // key must start with prefix + 'i'.
    deleteSave: function (key) {
      try {
        localStorage.removeItem(this.get('prefix') + 'd' + key.substr(this.get('prefix').length + 1))
        localStorage.removeItem(key)
      } catch (e) {
        console && console.error(e)
        return
      }

      var e = document.createEvent('storageevent')
      e.initStorageEvent('herowostorage', false, false, key, null, null, location.href, localStorage)
      window.dispatchEvent(e)
    },

    _extendMap: function (map) {
      map.type = 'SavedMap'
      map.newOpt = _.pick(map, 'fileName', _.forceObject)
      map.newOpt.mapTitle = map.title
    },
  })

  return MainMenu
})