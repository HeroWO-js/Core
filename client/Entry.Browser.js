// The entry point of require.js when running in a web browser.

define(
  [
    'module', 'sqimitive/main',
    'DOM.Common', 'DOM.Context', 'Strings', 'Templates', 'Screen.Tracker',
    'Debug', 'WebSite.TopBar', 'WebSite.GrantModules', 'Chat.DOM', 'Chat.Server',
    'Screen', 'DOM.UI', 'DOM.Map', 'DOM.MiniMap', 'Canvas.MiniMap', 'DOM.Controls',
    'H3.DOM.Audio', 'H3.DOM.MainMenu', 'H3.DOM.Loading', 'H3.DOM.UI',
    'H3.Combat', 'H3.DOM.Combat',
    'RPC.Common', 'RPC', 'RPC.WebSocket',
  ],
  function (
    module, Sqimitive,
    Common, Context, Strings, Templates, Screen_Tracker,
    Debug, WebSite_TopBar, WebSite_GrantModules, Chat_DOM, Chat_Server,
    Screen, DOM_UI, DOM_Map, DOM_MiniMap, Canvas_MiniMap, DOM_Controls,
    H3_DOM_Audio, H3_DOM_MainMenu, H3_DOM_Loading, H3_DOM_UI,
    H3_Combat, H3_DOM_Combat,
    RPC_Common, RPC, RPC_WebSocket
  ) {
    "use strict"
    var _ = Common._
    var $ = Common.$

    var config = module.config()
    // Levels: 0 production, 1 debug, 2 debug with tracing (slow).
    var debug = config.debug

    var debugCombat = false
    //debugCombat = true
    var time

    if (debug && location.search.match(/\?d(&|$)/)) {
      debug = debugCombat = false
    }

    _.oldLog = _.log
    delete _.log
    _.debug = debug > 0
    Sqimitive.Core.trace = debug >= 2
    // https://stackoverflow.com/questions/9931444
    // Chrome.exe --js-flags="--stack-trace-limit N"
    Error.stackTraceLimit = 100

    // Can be disabled by dom.enable_user_timing in FF <=52.
    performance.mark || (performance.mark = new Function)
    performance.measure || (performance.measure = new Function)

    var cx
    var menu
    var audio
    var topBar
    var chatWS
    var initScreen

    // We currently rely on templates embedded into the page so wait until HTML is ready.
    $(function () {
      // #log exists in debug environment only.
      if ($('#log').length) {
        var reset = _.debounce(function () { $('body').css('background', '') }, 5000)
        ;[[console, 'warn'], [console, 'error'], [window, 'onerror']]
          .forEach(function (item) {
            var old = item[0][item[1]]
            item[0][item[1]] = function () {
              reset()
              $('<p>').text(_.toArray(arguments)).appendTo('#log')
              $('body').css('background', 'yellow')
              return old && old.apply(this, arguments)
            }
          })
      }

      if (typeof document.body.style['-moz-animation'] == 'string') {
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1374994
        var detached = document.createElement('div')
        detached.style.display = 'inline'
        var ff52 = getComputedStyle(detached).display == 'block'
      }

      // IE doesn't support --var but it doesn't understand prop: unset either.
      $('body').toggleClass('Hanim_var', !ff52)

      cx = new Context({
        lingerCalc: debug ? 0 : 5000,
        // Since JSON parsing isn't parallel and since combined.json-s are huge,
        // fetching individual parts is probably better for user experience,
        // especially given HTTP/2 pipelining.
        fetchCombined: !debug,
        mapsURL: config.mapsURL,
        databanksURL: config.databanksURL,
        allowUserModules: config.allowUserModules,
        classic: !!location.search.match(/[?&]classic\b/),
        // Read by H3.Rules.
        noAI: !!location.search.match(/[?&]noai\b/),
      })

      var loading = new H3_DOM_Loading({context: cx})
        .attach(cx.el)
        .render()

      if (debug) {
        var profiler = window.profiler = new Debug.Profiler
        //profiler.attach()

        var seed = location.search.match(/[?&]s=(\d*)/)
        if (!seed) {
          _.seed(+('' + (new Date).getDate() + (new Date).getHours()))
        } else if (seed[1]) {   // ?s= w/o value forces random seed in debug mode
          _.seed(+seed[1])
        }
        // Independent of _.log to allow recovering the seed from the console to reproduce an unexpected problem.
        console && console.log('Random seed = %d', _.seed())

        var href
        ;(new EventSource('css-monitor.php?herowo.css,herowo-h3-menu.css'))
          .onmessage = function () {
            if (href) {
              monicss.href = href + '?' + Math.random()
            } else {
              href = monicss.href
            }
          }
      } else {
        $('html').addClass('exclusive')
        cx.set('scale', true)
        Common.oneClass($('body'), 'HLb_', 'animated')
        _.delay(function () { $('#loading').remove() }, 10000)

        function promptToLeave(e) {
          e.preventDefault()
          // Most users won't see this text.
          return e.returnValue = cx.s('mainMenu', 'Abandon this game? Any unsaved progress will be lost.')
        }
        cx.on('change_screen', updatePrompt)
        cx.on('change_loading', updatePrompt)
        cx.on('change_master', updatePrompt)
        cx.on('menu', function () {
          updatePrompt()
          menu.on('remove', updatePrompt)
          menu.on('change_options', function (now) {
            updatePrompt()
            now && now.on('change_host', updatePrompt)
          })
        })

        function updatePrompt(now) {
          // Prompt in-game. Or if loading a multi-player game. Or if configuring a multi-player game where we are a host.
          var prompt = cx.get('screen') == 'game' && (!cx.get('loading') || (cx.get('backend') == 'server' && (!menu || !menu.get('options') || menu.get('options').get('host'))))
          var func = prompt ? 'addEventListener' : 'removeEventListener'
          window[func]('beforeunload', promptToLeave)
        }

        // Prevent browser's menu from leaking due to accidental clicks.
        // Doing this in production only to clearly see which clicks are handled
        // by HeroWO and which are not and spot bugs. "Inspect Element" is also a
        // great help.
        cx.el.on('contextmenu', false)
      }

      cx.on('change_loading', function (now) {
        if (!now) {
          //console.log(profiler.dump()); throw 'x'

          performance.mark('Cx loaded')

          if (cx.get('screen') == 'game') {
            if (debug) {
              var pf = cx.modules.nested('HeroWO.PathFind.AStar.Module')
              window.pf = pf.print.bind(pf)
              _.defer(postRender)
            }

            console && _.defer(function () {
              console.log('Loading finished in ' + (Date.now() - time) / 1000 + 's')
              //$('.Hcontrols').prepend((Date.now() - time) / 1000 + 's')
            })
          } else {
            try {
              history.pushState(null, null, location.href.replace(/#.*/, ''))
            } catch (e) {}
            document.title = 'HeroWO'
          }
        }
      })

      cx.on('-game', function (options) {
        _.log && _.log('game() cause = %s', options.cause)
        time = Date.now()
      })

      cx.on('-change_screen', function () {
        performance.mark('screen')
      })

      cx.on('-dataReady', function () {
        performance.mark('dataReady')
      })

      cx.on('-render', function () {
        performance.mark('rendering')
      })

      cx.modules.on('nestExNew', function (res) {
        switch (res.key) {
          case 'HeroWO.H3.AI.Trivial':
          case 'HeroWO.H3.AI.Trivial.Neutral':
            res.child.set('trace', debug >= 2)
            break
        }
      })

      var ping = 0
      var sse

      // Even though the SSE spec says browsers to reconnect the stream virtually unconditionally, they don't do it properly. Chrome does it if the remote has closed the connection (e.g. server shut down) but not if network was temporary down (or if it does, it's taking a long time during which ES' readyState is 1 so you don't know if it's stalled unless server generates some events). Firefox doesn't reconnect at all (test in console: new EventSource(...), switch to Network tab, then turn Offline mode on and off).
      setInterval(function () {
        if (ping + config.ssePingInterval < Date.now()) {
          sse.close()
          startSSE()
          updaters.each(function (updater) {
            updater.get('es') && updater.set('es', sse)
          })
          globalRoom.set('sse', sse)
        }
      }, 10000)

      function startSSE() {
        sse = new EventSource(config.sseURL)

        'ping full add remove chat'.split(' ').forEach(function (event) {
          sse.addEventListener(event, function (e) { ping = Date.now() })
        })
      }

      startSSE()

      // This is separate from the MainMenu object to maintain the list of maps and lobby in background even as the user switches between the menu and the game. Otherwise we'd have to reopen the SSE and wait for 'full' every time user enters the menu.
      var updaters = new H3_DOM_MainMenu.ScenarioList.Updaters({
        //constantsURL: config.constantsURL,
        sse: sse,
      })

      updaters.nested('maps').on('_replaceAll', function () {
        if (!debug && menu && menu.get('screen') == 'newSingle' && !window.herowoAiMessage) {
          window.herowoAiMessage = true
          var res = confirm(cx.s('mainMenu', 'HeroWO\'s current AI is worthless. To have a decent experience, play small maps with special victory conditions and computer players that won\'t need to strategize. “Island of Fire” and “Knee Deep in the Dead” are two good options. Sort the map list by player count?'))
          if (res) {
            menu.list.assignResp({sort: 'playerCount', sortAsc: true})
            menu.list.matching().some(function (map) {
              switch (map.get('title')) {
                case 'Island of Fire':
                case 'Knee Deep in the Dead':
                  return menu.list.set('current', map)
              }
            })
          }
        }
      })

      // -menu to hook before promptToLeave()'s on('menu') hook.
      cx.on('-menu', function (sc, options) {
        if (!menu) {
          menu = cx.addModule('-', H3_DOM_MainMenu.Concrete, {
            updaters: updaters,
            mapsURL: 'maps.php',
            flat: debug,
          })

          menu.on({
            unnest: function () {
              menu = null
              cx.screens().forEach(function (sc) { sc.el.css('visibility', '') })
            },

            '+normalize_screen': function (res, value) {
              switch (value) {
                case 'highScores':    // XXX-I
                case 'newCampaign':   // XXX-I
                  return this.get('screen')
              }
            },

            '=normalize_screen, =normalize_section': function (sup, value, options) {
              if (!options.force &&
                  cx.get('backend') == 'server' &&
                  this.get('options') &&
                  (sup.name == 'normalize_screen'
                      ? value != this.get('screen') : value != 'options') &&
                  this.get('options').get('host') &&
                  !this.get('options').get('observer') &&
                  !confirm(cx.s('mainMenu', 'You are a host in this game. Still leave?'))) {
                return this.get(sup.name.replace(/.*_/, ''))
              } else {
                return sup(this, arguments)
              }
            },

            quit: function () {
              if (!debug) {
                location.href = 'https://herowo.io/forum'
              }
            },

            joinLobby: function (pin) {
              this.set('loading', true)
              api(
                'joinLobby&pin=' + encodeURIComponent(pin),
                start,
                function (msg) {
                  menu.assignResp({section: 'list', loading: false})
                  alert(msg)
                }
              )
            },

            newLobby: function (args) {
              this.set('loading', true)
              var data = new FormData
              _.each(args, function (v, k) { data.set(k, v || 0 /*false*/) })
              api(
                'newLobby&classic=' + (cx.get('classic') || ''),
                start,
                function (msg) {
                  menu.assignResp({section: 'list', loading: false}, {force: true})
                  alert(msg)
                },
                data
              )
            },

            loadSingle: function (data, configure) {
              var full = {url: data.map.url, data: {'HeroWO.Map': {}}, configure: configure}
              full.data['HeroWO.Map'][full.url] = data
              start(null, full)
            },

            newSingle: function (url, configure) {
              start(null, {url: url, configure: configure})
            },

            newTutorial: function () {
              this.newSingle('Tutorial')
            },
          })

          menu.autoOff(loading, {
            change_visible: updatePos,
          })

          updatePos(loading.get('visible'))

          function updatePos(now) {
            now
              ? menu.el.css('position', 'absolute').css(loading.el.position())
              : menu.el.css('position', '')
          }
        }

        switch (options) {
          case 'save':
            options = {
              screen: options + (cx.get('backend') == 'server' ? 'Multi' : 'Single'),
              section: 'list',
            }
            break
          case 'load':
            options = {screen: 'start', section: options}
            break
          case undefined:
          case null:
            options = {screen: 'start', section: ''}
        }

        menu.assignResp(options)

        if (!menu.get('screen').match(/^save/)) {
          cx.leave({final: _})
        }

        if (sc) {
          menu.el.css('position', 'absolute').css(sc.el.position())
          // Bits.Window-s have high z-index and would overlay menu.
          sc.el.css('visibility', 'hidden')
        }
      })    // end of cx.-menu

      var permittedOptions = _.fromEntries([
        // classic is controlled by ?classic and is not re/stored.
        [Screen.name, [
          // H3.DOM.UI.
          'mapOwnSpeed', 'mapEnemySpeed', 'mapHideEnemy', 'mapShowRoute', 'mapEndTurnAP', 'mapTownOutlines',
          // H3.DOM.Combat.
          'combatSpeed', 'combatGrid', 'combatHighlightMove', 'combatHighlightHover', 'combatCreatureInfo',
          // BaseOptions.
          'spellBookPageAnimation',
        ]],
        [DOM_Map.Edge.name, ['edgeScrollInterval']],
        [H3_DOM_Audio.name, ['bgm', 'sfx']],
      ])
      var gameOptions = {}
      if (!debug) {
        try {
          var cur = JSON.parse(localStorage.getItem('HeroWO Options'))
          _.each(permittedOptions, function (v, k) {
            gameOptions[k] = _.pick(cur[k] || {}, v, _.forceFire)
          })
        } catch (e) {}
      }

      _.log && _.log('Restored gameOptions : %.1500j', gameOptions)

      function storeOption(key, option, value) {
        if (!debug && _.includes(permittedOptions[key] || [], option)) {
          var cur = {}
          try {
            _.extend(cur, JSON.parse(localStorage.getItem('HeroWO Options')))
          } catch (e) {}
          _.log && _.log('Storing gameOptions.%s.%s = %.j', key, option, value)
          try {
            cur[key] = _.extend({}, cur[key])
            cur[key][option] = value
            localStorage.setItem('HeroWO Options', JSON.stringify(cur))
          } catch (e) {}
        }
      }

      // XXX this assumes human players are selected on game start/load and remain the same until game session ends or this page is unloaded
      initScreen = function (players, connector) {
        var hotSeat = players.length > 1

        if (hotSeat) {
          // Since it's usually impossible to input with two mice at once, disable
          // simultaneous mode. Sharing of Map/MiniMap el-s relies on this fact
          // as well. XXX=IC: clsi: When a separate _opt for simultaneous mode is created, do
          // disable it alone rather than classic.
          cx.set('classic', true)
        }

        if (debug) {
          cx.addModule('-', DOM_Controls, {attachPath: $('#controls')})
        }

        var mapEl
        var miniMapEl

        // XXX we are currently creating a Screen per each playable player, which is to support hot-seat, and it works but lagging due to inefficient DOM.Mini/Map implementations; for now try to reuse map instance (or at least DOM subtree) in different screens and hide all Screen-s except the one used for the first player of currently interactive-able players
        _.each(players, function (player, i) {
          var sc = cx.addModule(Screen, _.extend({
            player: player,
            mapAnimate: !debug,
            hideAM: debugCombat,
            // Useful when debugging transitions' animations.
            //combatSpeed: 2,
          }, gameOptions[Screen.name]))

          if (cx.map.get('url') == 'Tutorial/') {
            sc.set('mapEndTurnAP', false)
            //set('quickCombat', false)   // XXX=I
          }

          hotSeat || audio.set('screen', sc)

          sc.on('change', storeOption.bind(_, Screen.name))

          var ui = sc.addModule('-', DOM_UI)

          if (debug && !i) {
            sc.addModule('-', DOM_Controls.Modification, {
              attachPath: document.body,
              connector: connector,
            })
          }

          if (!debugCombat) {
            var map = sc.addModule('-', DOM_Map, {
              el: mapEl || DOM_Map.prototype.el,
              sharedEl: hotSeat ? !mapEl : null,
              attachPath: ui.mapEl,
            })

            var options = gameOptions[DOM_Map.Edge.name] || {}
            debug && (options.edgeScrollInterval = 500)
            sc.addModule('-', DOM_Map.Edge, options)
              .on('change', storeOption.bind(_, DOM_Map.Edge.name))

            if (location.search.match(/[?&]dom\b/)) {
              var miniMap = sc.addModule('-', DOM_MiniMap, {
                el: miniMapEl || DOM_MiniMap.prototype.el,
                sharedEl: hotSeat ? !miniMapEl : null,
                attachPath: ui.miniMapEl,
              })
            } else {
              var miniMap = sc.addModule('-', Canvas_MiniMap, {
                attachPath: ui.miniMapEl,
                alpha: debug,
              })
            }

            if (hotSeat) {
              mapEl = map.el
              miniMapEl = miniMap.el

              sc.autoOff(cx, {
                change_loading: function (now) {
                  if (!now) {
                    sc.autoOff(cx.players, {
                      '.change': function (p, n) {
                        n == 'interactive' && update()
                      },
                    })

                    sc.autoOff(cx.map.combats, {
                      '.change_interactiveParty, unnested': update,
                    })

                    cx.screens().forEach(function (other) {
                      sc.autoOff(other.transitions, {
                        'nestExNew, unnested': update,
                      })
                    })

                    update()

                    function update() {
                      var interactive
                      // Transitions like heroExperience can block subsequent actions so give user chance to resolve them when they arise.
                      cx.screens().some(function (sc) {
                        return interactive = sc.transitions.length && sc.player
                      })
                      if (interactive) {
                      } else if (cx.map.combats.length) {
                        cx.map.combats.some(function (c) {
                          var p = c.get('interactiveParty')
                          return interactive = p && p.player
                        })
                        // If there's an active combat, checking player 'interactive' is irrelevant.
                      } else {
                        interactive = cx.players.find(Common.p('get', 'interactive'))
                      }
                      // If no human players are interactive, keep the last
                      // enabled Mini/Map (sharedEl === true) and Screen instead
                      // of hiding all Screen-s. Those will be disabled when
                      // next player becomes interactive and update() is called again.
                      if (interactive && interactive.isHuman()) {
                        interactive = interactive == sc.player
                        // XXX keystrokes must be handled by currently visible Screen only
                        sc.el.add(ui.el).toggle(interactive)
                        interactive || sc.set('mouseCell', null)
                        interactive && ui._updateScroll()
                        map.set('sharedEl', interactive)
                        miniMap.set('sharedEl', interactive)
                        audio.set('screen', sc)
                      }
                    }
                  }
                },
              })
            }
          }

          if (cx.modules.nested('HeroWO.H3')) {
            // We're using DOM.UI so load H3's extension of it.
            sc.addModule('-', H3_DOM_UI, {
              mapViewSize: [18, 17],    // from CSS
              haveStyles: true,
            })
          }
        })
      }

      // XXX when running on the server (websocket server), strings will be delivered in server's language, for events generated on the server (like combat)
      cx.addModule('-', Strings, {persistent: true})
        //.append(HeroWO.strings)   // XXX finish localization

      cx.addModule('-', Templates, {sources: ['#templates']})

      audio = cx.addModule('-', H3_DOM_Audio, _.extend({
        audio: config.audio,
      }, gameOptions[H3_DOM_Audio.name]))

      audio.on('change', storeOption.bind(_, H3_DOM_Audio.name))

      if (debug) {
        cx.addModule('-', Debug, {trace: debug >= 2})
      } else {
        topBar = cx.addModule('-', WebSite_TopBar, {
          attachPath: $('#top'),
          exceptionURL: 'exception.php',
          updateURL: 'statistics.php',
          updateInterval: 10000,
          popularMapsURL: 'maps.php',
          discordURL: 'https://discord.gg/UcGCNhJEUx',
          forumURL: 'https://herowo.io/forum',
        })
      }

      var chat
      var extraLinks = _.object([cx.s('mainMenu', 'Forum')], ['https://herowo.io/forum'])

      // Keeping this static so that message history is not cleared when changing screens.
      var globalRoom = new Chat_DOM.Room({
        context: cx,
        sse: sse,
        sendURL: config.apiURL + '?do=chat',
        title: cx.s('mainMenu', 'Global'),
      })

      function initChat() {
        if (chat) {
          // Unnesting causes scroll position to be lost (set to 0). If we don't
          // preserve it then at least scroll to bottom after nesting (shown = false).
          globalRoom.unnest().set('shown', false)
          // jQuery's remove() called by Sqimitive's remove() forces reflow.
          chat.el[0].parentNode.removeChild(chat.el[0])
          chat.el = null
          chat.remove()
        }

        function keydown(e) {
          if (e.keyCode == 112) {    // F1
            this.set('hidden', false)
            this.get('current').clearAlert()
            this.get('current').focus()
            e.preventDefault()
          }
        }

        if (cx.get('screen') == 'game' && !cx.get('loading')) {
          var sc = cx.screens()[0]
          var hui = sc.modules.nested('HeroWO.H3.DOM.UI')

          chat = hui.windows.addModule('-', Chat_DOM.Window, {
            extraLinks: extraLinks,
            collapsed: true,
          })

          Common.autoOffNode(chat.rooms, document.body, {keydown: keydown})

          chat.rooms.nest(globalRoom, {pos: 0})

          if (cx.get('backend') == 'server') {
            chat.rooms.nest({context: cx, rpc: sc.rpc, title: cx.s('mainMenu', 'Game'), screen: sc}, {pos: 1})
              .fuse('+.+author', author)

            // XXX recreate on change_team, change_controller/s
            var myTeam = '' + sc.player.get('team')
            var humans = cx.players.filter(Common.p('isHuman'))
            var teams = _.groupBy(humans, Common.p('get', 'team'))
            for (var bits = 1 << _.size(teams); --bits; ) {
              var channel = []
              var title = []
              _.each(teams, function (humans, team) {
                if (bits & (1 << channel.length)) {
                  channel.push(team)
                  if (team == myTeam) {
                    title.push(cx.s('mainMenu', 'My Team'))
                  } else {
                    title.push(humans.map(function (player) {
                      return chat.rules.databank.players.atCoords(player.get('player'), 0, 0, 'name', 0)
                    }).sort().join('/'))
                  }
                }
              })
              // Create a room per each combination of this player's team with other teams with human player(s).
              if (_.includes(channel, myTeam)) {
                chat.rooms.nest({
                  context: cx,
                  rpc: sc.rpc,
                  channel: channel.join(),
                  title: title.sort().join(', '),
                  screen: sc,
                }, {pos: channel.join() == myTeam ? 3 : 10 + bits})
                  .fuse('+.+author', author)
              }
            }

            // Now that all rooms are listening for serverEvent...
            sc.rpc.do('lastChat')
          }

          var btnAM = hui.windows.nested('map')
            .addModule('-', Chat_DOM.Window.ShowButton, {
              attachPath: '.Hh3-am__botcom',
              rooms: chat.rooms,
            })

          btnAM.el.addClass('Hh3-menu__text1')

          var btn = new Chat_DOM.ShowButton({rooms: chat.rooms})
        } else {
          chat = new Chat_DOM.Rooms({
            context: cx,
            extraLinks: extraLinks,
            hidden: true,
          })

          Common.autoOffNode(chat, document.body, {keydown: keydown})

          chat.nest(globalRoom, {pos: 0})

          if (cx.get('screen') == 'game' && cx.get('backend') == 'server' && chatWS &&
              // When set, H3.Rules is available.
              cx.get('configuring')) {
            chat.nest({context: cx, rpc: chatWS, title: cx.s('mainMenu', 'Game')}, {pos: 1})
              .fuse('+.+author', author)

            chatWS.do('lastChat')
          }

          // This class should be added before render, else user will see chat.el momentarily in the old position.
          chat.el.addClass('Hchat-rooms_cx')
          chat.attach(cx.el).render()

          var btn = new Chat_DOM.ShowButton({rooms: chat})
        }

        btn.attach(cx.el).render().el.addClass('Hchat-btn_cx Hh3-menu__text9')
        chat.on('-remove', 'remove', btn)

        if (btnAM) {
          btn.el.addClass('Hchat-btn_cx_game')
          chat.on('-remove', 'remove', btnAM)
          updateButtons()
          btnAM.autoOff(hui.windows.nested('map'), {change_visible: updateButtons})

          function updateButtons() {
            function toggle(btn, visible) {
              // ShowButton itself is using style.display.
              btn.el.css({zIndex: visible ? '' : -1, visibility: visible ? '' : 'hidden'})
            }
            toggle(btn,  !hui.windows.nested('map').get('visible'))
            toggle(btnAM, hui.windows.nested('map').get('visible'))
          }
        }

        function author(res, msg) {
          if (msg.get('player')) {
            var rules = cx.modules.nested('HeroWO.H3.Rules')
            return _.format('%s (%s%s)', Chat_Server.nickName(msg.get('client')),rules.databank.players.atCoords(msg.get('player'), 0, 0, 'name', 0), msg.get('observer') ? ' observer' : '')
          } else {
            return 'System'
          }
        }
      }

      if (!debugCombat) {
        initChat()
        cx.on('change_screen', initChat)
        cx.on('change_loading', initChat)
        cx.on('change_configuring', initChat)
      }

      cx.attach('#context')

      if (!cx.get('allowUserModules')) {
        run()
      } else {
        var grant = new WebSite_GrantModules({
          el: '.Hweb-gm',
          context: cx,
          template: grantModulesTemplate,
        })

        cx.fuse('_fetchMap', function () {
          cx.map.fuse('_fetch', function (async) {
            var modules = _.reject(this.get('modules'), function (name) {
              return /^[\w.]+$/.test(name)
            })
            modules = _.difference(modules, grant.get('loaded'))
            if (modules.length) {
              grant.once('granted', async.nestDoner())
              grant.set('location', false).run(modules)
            }
          })
        })

        var modules = location.search.match(/[?&]modules\[\]=[^&]+/g) || []
        if (modules.length) {
          modules = modules.map(function (match) {
            return decodeURIComponent(match.replace(/.*?=/, ''))
          })
          grant.once('granted', run)
          grant.set('location', true).run(modules)
        } else {
          run()
        }
      }
    })

    function run() {
      var hash = location.hash.substr(1)
      if (hash.match(/^(start(_credits|_new|_load)?|(new|load)(Single|Multi)(_list)?)$/)) {
        hash = hash.split('_')
        cx.menu(null, {screen: hash[0], section: hash[1] || (_.includes(hash[0], 'Multi') ? 'list' : '')})
      } else if (hash.match(/^\d+$/)) {
        cx.menu(null, {screen: 'newMulti', section: 'list'})
        menu.joinLobby(hash)
      } else if (_.includes(hash, ',')) {
        // This #form is meant for connecting to an already configured game,
        // hence no menu is created.
        var parts = hash.split(',')
        try {
          var server = atob(parts[0])
        } catch (e) {
          return cx.menu(null, {screen: 'newMulti', section: 'list'})
        }
        start({server: server, player: parts[1]})
      } else if (hash) {
        try {
          var url = atob(hash)
        } catch (e) {
          return cx.menu(null, {screen: 'newSingle', section: 'list'})
        }
        start(null, {url: atob(hash)})
      } else if (!debug) {
        cx.menu()
      } else {
        //return start(null, {url: '../maps/Tutorial/'})
        //return start({server: 'ws://192.168.10.1:8081/v1', player: 'p1'})
        cx.menu()
      }
    }

    function start(multi, data) {
      if (cx.get('screen')) {
        // Hit a bug.
        throw new Error('start() called on a non-empty screen,')
      }

      menu && menu.set('loading', true)

      var hooks = []

      // XXX=I finish localization
      //;(new Common.JsonAsync({url: 'strings-game.json'}))
      //  .whenSuccess(function (async) {
      //    cx.modules.nested('HeroWO.Strings')
      //      .append(async.response)

          if (multi) {
            var client = chatWS = new RPC_WebSocket({context: cx})
            audio.set('rpc', client)

            // In non-master mode player == sc.player, else it can correspond to computer players too, especially the neutral.
            hooks.push([cx, cx.on('+makeRpcFor', function (res, player) {
              if (!res) {
                if (player != connector.get('player')) {
                  throw new Error('Cannot create RPC for another player in client mode.')
                }
                return client
              }
            })])

            hooks.push([cx, cx.on('change_loading', function (now) {
              if (!now) {
                // If we're an observer, still send our actions to let other observers observe us.
                cx.autoAddModule('-', Screen_Tracker.Master)

                cx.autoAddModule('-', Screen_Tracker.Slave, {
                  // Mirror any screen, any client as long as the acting player is ours and the actor is not an observer.
                  myPlayer: true,
                  observer: false,
                  // If our player isn't an observer, default to not mirroring anyone. Once he finishes his turn, he may want to see what his teammates are doing.
                  z: client.get('observer'),
                  current: client.get('observer'),
                  mapPosition: client.get('observer'),
                })
              }
            })])

            hooks.push([cx, cx.on('dataReady', dataReady)])
            hooks.push([cx, cx.on('change_configuring', configuring)])

            var connector = (new RPC_WebSocket.Connector({
              client: client,
              url: multi.server,
              playerSecret: multi.player,
            }))

            topBar && topBar.set('connector', connector)

            _.each(['change_url', 'change_playerSecret'], function (event) {
              hooks.push([connector, connector.on(event, updateHash)])
            })

            hooks.push([cx, cx.on('dataReady', function () {
              updateHash()
              hooks.push([cx, cx.on('change_configuring', updateHash)])
              hooks.push([cx.map, cx.map.on('change_pin', updateHash)])
              // Inform the server that all our Screen-s have no further use for the transition. This is part of the environment set-up because the engine doesn't know our modus operandi.
              hooks.push([cx.map.transitions, cx.map.transitions.on('unnested', function (tr, key) {
                client.do('tack', {id: key})
              })])
            })])

            function updateHash() {
              var now = cx.get('configuring')
                ? cx.map.get('pin')
                : btoa(connector.get('url')).replace(/=/g, '') + ',' + connector.get('playerSecret')

              if (location.hash.substr(1) != now) {
                try {
                  // Don't create new history entry if connected to a lobby and its PIN has just changed.
                  var replace = /^\d+$/.test(now + location.hash.substr(1))
                  history[replace ? 'replaceState' : 'pushState'](null, null, '#' + now)
                } catch (e) {}
              }

              if (cx.map.get('state') == 'loaded') {
                document.title = _.format('%s%s | HeroWO', cx.get('configuring') ? 'Lobby #' + now + ' -' : '', cx.map.get('title'))
              }
            }

            _.each(['noConnection', 'shutdown', 'takeover', 'badSecret'], function (event) {
              hooks.push([connector, connector.once(event, function () {
                disconnect()
                var configuring = cx.getSet('-configuring', function (cur) {
                  cur && cur.nested('rpc').set('status', false)
                  return cur
                })
                menu || cx.menu(null, {screen: 'newMulti', section: 'list'})
                var msg = {
                  noConnection: 'The HeroWO server cannot be reached. If your Internet connection is fine, try again in a few minutes or visit the forum for support. Visit it now?',
                  shutdown: 'The server you were connected to has been shut down. Your game was lost.',
                  takeover: 'Your session has been taken over by another browser tab or computer.',
                  badSecret: 'The game you are trying to connect to either no longer exists or does not let you in.',
                }
                msg = cx.s('mainMenu', msg[event])
                if (event == 'noConnection' ? confirm(msg) : alert(msg)) {
                  location.href = 'https://herowo.io/forum'
                }
              })])
            })

            hooks.push([cx, cx.on('leave', function (options) {
              if (options && options.final == _) {
                disconnect()
              }
            })])

            function disconnect() {
              _.log && _.log('WS disconnect()')
              audio.set('rpc', null)
              topBar && topBar.set('connector', null)
              chatWS = null
              client.remove()
              connector.remove()
              Common.off(hooks)

              if (menu) {
                menu.set('loading', false)
                menu.getSet('section', function (cur) {
                  return cur == 'options' ? 'list' : cur
                })
              }
            }

            var login
            hooks.push([client, client.on('logIn', function (l) { login = l })])
            hooks.push([cx, cx.on('menu', function () {
              menu.assignResp(_.pick(login, 'savesURL', 'replaysURL', _.forceObject))
            })])

            if (debug) {
              //_.log = _.oldLog
              window.ws = client    // ws.get('ws').close(4999)

              connector.on({
                'change_active, change_working': function () {
                  $('body').css('opacity', !connector.get('active') ? '' : 0.5 + (connector.get('working') && 0.5))
                },
              })
            }

            connector.set('active', true)
          } else {    // single player or hotseat
            var worker = (location.search.match(/[?&]worker=(\d)(&|$)/) || [, !debug && typeof Worker != 'undefined'])[1] != '0'
            var workerRPC

            if (worker) {
              _.log && _.log('Starting game using a WebWorker backend')

              // importScripts() rejects relative URLs if Worker's source is
              // blob: so find the <script> created by Require.js for data-main
              // and read its src (always absolute).
              var config = $(entryScript).attr('data-main')
              config = $('script[src="' + config + '.js"]').prop('src')
              // Minified bundle adds prefix ("namespace") to all
              // requirejs()/require() calls. It's set up in build.js; to avoid
              // hardcoding it here, use the fact r.js/build/jslib/pragma.js
              // does RegExp-based replacement on this particular string (unlike
              // parse.js using AST).
              var rjs = 'requirejs.config('.replace('.config(', '')
              var script = [
                _.format('importScripts(%j,%s);',
                  entryScript.src, config ? JSON.stringify(config) : ''),
                _.format('%s.config({baseUrl:%j});',
                  rjs, config ? config.replace(/[^\/]+$/, '') : ''),
                rjs + '(["Entry.Worker"]);',
              ]

              // Expands mapsURL/databanksURL that are normally relative to the game's entry point (index.php) to allow our Worker be loaded from blob:.
              function absoluteURL(url) {
                if (!/^(https?:)\/\//i.test(url)) {
                  url = location.href.replace(/[^\/]*(\?.*(#.*)?)?$/, '') + url
                }
                return url
              }

              worker = new Worker(URL.createObjectURL(new Blob(script, {type: 'text/javascript'})))

              worker.addEventListener('message', function (e) {
                //_.log && _.log('<-- %j', e.data)

                switch (e.data.event) {
                  case 'init':
                  case 'start':
                    _.log && _.log('Worker =[%s]>', e.data.event)
                }

                switch (e.data.event) {
                  default:
                    throw new Error('Invalid Worker message event: ' + e.data.event)

                  case 'init':
                    var transfer = []
                    var game = RPC.textEncode(data, transfer)
                    worker.postMessage({
                      event: 'newContext',
                      debug: debug,
                      seed: _.seed(),
                      context: _.extend(
                        {
                          mapsURL: absoluteURL(cx.get('mapsURL')),
                          databanksURL: absoluteURL(cx.get('databanksURL')),
                        },
                        _.pick(
                          cx.get(),
                          'lingerCalc', 'fetchCombined',
                          // XXX=I not permitted because Worker currently has no means to show GrantModules notifications; also, 3rd party modules may not expect to be run in Worker context without access to DOM
                          //'allowUserModules',
                          'classic',
                          _.forceObject
                        )
                      ),
                      game: game,
                    }, transfer)
                    break

                  case 'start':
                    game = RPC.textDecode(e.data.game)
                    cx.game({url: game.url, data: game, configure: game.configure, backend: 'worker', cause: 'rpc'})
                    workerRPC = new RPC.Client({context: cx})
                    break

                  case 'serverEvent':
                    _.each(localRPCs.concat(workerRPC), function (rpc) {
                      rpc.serverEvent(e.data.serverEvent, e.data.data)
                    })
                    break

                  case 'jsonrpc':
                    var found = _.some(localRPCs, function (rpc) {
                      var async = rpc._rpcAsyncs.nested(e.data.id)
                      if (!async) {
                        return false
                      } else if (e.data.error == null) {
                        async.result = e.data.result
                        return async.set('status', true)
                      } else {
                        async.errorResult = e.data.error
                        return async.set('status', false)
                      }
                    })

                    // Don't warn if no longer in game. Normally happens when cancelling 'configuring' (RPC_Worker.reset() occurs, cancels pending do=configuring, then 'jsonrpc' arrives for the already-cancelled Request).
                    if (!found && cx.get('screen') && console) {
                      console.warn('Worker Response to unknown Request ' + e.data.id)
                    }

                    break
                }
              })

              var RPC_Worker = RPC.extend({
                _rpcAsyncs: null,

                events: {
                  init: function () {
                    this._rpcAsyncs = new RPC_Common.PendingResponses
                  },

                  '=do': function (sup, method, args) {
                    var async = this._rpcAsyncs.nest({
                      // For debugging.
                      method: method,
                      params: args,
                    })

                    worker.postMessage({
                      event: 'rpc',
                      player: this.get('player').get('player'),
                      id: async._cid,
                      method: method,
                      params: args,
                    })

                    return async
                  },

                  reset: function () {
                    this._rpcAsyncs.each(function (async) {
                      async.errorResult = {code: RPC_Common.CODES.drop, message: 'Worker reset'}
                      async.set('status', false)
                    })
                  },
                },
              })
            }

            var localRPCs = []
            hooks.push([cx, cx.on('+makeRpcFor', function (res, player) {
              if (!res) {
                // Avoid creating new RPC for the same player. Although they won't conflict, it'd be just wasting memory since their state (hooks, etc.) will needlessly duplicate. This condition exists in single-player mode (H3.Rules creates a master RPC for player 0, and neutralAI creates one too), or when there are multiple Screen-s for one player.
                return localRPCs[player] ||
                  (localRPCs[player] = new (worker ? RPC_Worker : RPC)({context: cx, player: cx.players.nested(player)}))
              }
            })])

            hooks.push([cx, cx.on('-change_screen', function (now) {
              if (!now) {
                if (worker) {
                  workerRPC.remove()
                  worker.postMessage({event: 'close'})
                }
                _.invoke(localRPCs, 'remove')
                Common.off(hooks)
              }
            })])

            hooks.push([cx, cx.on('change_loading', function (now) {
              if (!now) {
                try {
                  var now = data.data ? '' : btoa(cx.map.get('url')).replace(/=/g, '')
                  if (location.hash.substr(1) != now) {
                    history.pushState(null, null, now ? '#' + now : location.href.replace(/#.*/, ''))
                  }
                } catch (e) {}

                cx.autoAddModule('-', Screen_Tracker.Master)
                // Can add other Screen's with Tracker.Slave to observe this Master.

                document.title = _.format('%s | HeroWO', cx.map.get('title'))
              }
            })])

            hooks.push([cx, cx.on('dataReady', dataReady)])
            hooks.push([cx, cx.on('change_configuring', configuring)])

            if (!worker) {
              // Doing this rather than set('timeQuota') to have old value reverted when hooks are off'd.
              //
              // Unlike single-player, in multi-player (server) mode tasks are executed asynchronously even if _.debug because a tight loop makes debugging nearly impossible due to overflowing maxEvents.
              _.debug && hooks.push([cx.idleTasks, cx.idleTasks.on('+get', function (res, name) {
                return name == 'timeQuota' ? Infinity : res
              })])

              hooks.push([cx, cx.on('-dataReady', function () {
                // Should be called before creating PlayerOptions since the latter
                // immediately does the switching on town/hero/bonus.
                cx.modules.nested('HeroWO.H3.Rules').initializeSinglePlayer()
              })])

              data.master = true
              data.backend = 'browser'
              cx.game(data)
            }
          }

          hooks.push([cx, cx.on('-alterSchema', function () {
            if (!debug && !window.herowoPreloadingMessage) {
              window.herowoPreloadingMessage = true
              alert(cx.s('mainMenu', 'HeroWO is going to load the map\'s data. However, external resources (images and sounds) will be loaded only when needed while you are playing. Fret not if you encounter temporary tearing or blank UI!'))
            }

            //menu && menu.remove()
            initScreen(multi ? [connector.get('player')] : cx.players.filter(Common.p('isHuman')).map(Common.p('get', 'player')), connector)
          })])

          function dataReady() {
            menu && menu.set('loading', false)

            // menu should be removed once Context continues loading (after configuring), such as from within -alterSchema. However, doing that has no visible effect, obviously because the browser gets no chance to redraw the screen due to the heavy synchronous execution until render() ends. To work around this, continue loading from defer(), after menu.remove(), redrawing the screen and showing the underneath H3.DOM.Loading.
            if (menu) {
              var menuAsync = cx.queueLoading()
              if (!cx.get('configuring')) {
                menu.remove()
                _.defer(function () { menuAsync.set('status', true) })
              } else {
                cx.once('change_configuring', function (now, old) {
                  if (old.isSuccessful()) {
                    menu.remove()
                    _.defer(function () { menuAsync.set('status', true) })
                  } else {
                    menuAsync.set('status', true)
                  }
                })
              }
            }

            // Prefetch databank styles and delay loading of other modules. If not done, browser will start loading it in parallel once H3.DOM.UI is attached, resulting in a lengthy reflow after render.
            //
            // However, during local development <link> to current databank's CSS is added directly in index.php. This saves about 1.5 seconds in loading time since browser finishes loading styles way earlier than we start the game.
            if (!window.dbcss) {
              var async = cx.queueLoading()
              var el = $('<link>')
                .attr({
                  rel: 'stylesheet',
                  href: cx.url('HeroWO.H3.Databank', cx.map.get('databank') + '/', 'combined.css'),
                })
                .appendTo('body')
                .on('load error', function () {
                  async.set('status', true)
                })
              cx.once('change_screen', function () {
                el.remove()
              })
            }
          }

          // Only fires if data.configure is set. If not, will transition straight to change_loading.
          function configuring(now) {
            if (!now) {
              menu.set('options', null)
            } else {
              cx.get('configuring').nest('rpc', {})

              if (multi) {
                // observer may change on the server but sans admin's intervention this may only happen via do=configure by host, and that involves resetting client's connection, carrying new observer state on reconnect. Therefore not listening to change_observer. XXX
                var opt = {
                  player: connector.get('player'),
                  clientSource: connector.get('clientSource'),
                  observer: client.get('observer'),
                }
              } else {
                var opt = {player: cx.players.find(Common.p('isHuman')).get('player')}
              }

              opt.menu = menu
              opt = menu.addModule(H3_DOM_MainMenu.PlayerOptions, opt)
              menu.set('options', opt)

              opt.once('unnest', function () {
                menu.set('loading', true)
                // If we are transitioning to a new game, menu will get removed
                // and thanks to autoOff() our change_screen hook will be also
                // removed. Else we are dropping a configuring game, then
                // change_screen will fire until screen becomes '' and the hook
                // is removed (the fact cx remains on menu's autoOff list is
                // irrelevant).
                menu.autoOff(cx, {}).once('change_screen', true, function (now) {
                  return now ? true : menu.set('loading', false)
                }, menu)
                // Must call this for both single- and multi-player modes.
                opt.rpc.do('configure', {do: 'leave'})
                  // Silence the error. do=leave is expected to fail after the
                  // game has begun, which happens normally after user clicks Begin.
                  .whenError(Common.stub)
              })
            }
          }
        //})
    }   // end of start()

    function api(params, done, error, post) {
      //params += '&DBGSESSID=1@127.0.0.1'

      function clean(resp) {
        // api.php outputs "<pre>Message" on failure.
        return resp.replace(/<.*?>/g, '').trim()
      }

      return _.ajax({
        type: post ? 'POST' : 'GET',
        data: post,
        // Using text so that on server error we can read plain text response.
        //dataType: 'json',
        url: config.apiURL + '?do=' + params,
        headers: {},    // CORS without preflight
        // With dataType of 'json' empty server response still triggers success.
        success: function (xhr) {
          try {
            var data = JSON.parse(xhr.response)
          } catch (e) {
            return error(clean(xhr.response) || 'Server Error')
          }
          done(data)
        },
        error: function (xhr, e) {
          error(e.message || clean(xhr.response) || 'Server Error: ' + xhr.statusText)
        },
      })
    }

    // Only called when debug is on and when screen is 'game'.
    function postRender() {
      // screen     -> dataReady -> rendering -> Cx loaded      -> ready
      // dR/ch_conf    dataReady    render()     change_loading    defer()
      performance.mark('ready')
      performance.measure('Map data', 'screen', 'dataReady')
      performance.measure('other data', 'dataReady', 'rendering')
      performance.measure('render', 'rendering', 'Cx loaded')
      performance.measure('post load', 'Cx loaded', 'ready')
      performance.measure('full', 'screen', 'ready')

      if (cx.get('backend') == 'server') {
        //_.log = _.oldLog
      }

      //debugCombat && cx.modules.nested('HeroWO.H3.Rules')._heroCombatRun(123, 456)
    //cx.modules.nested('HeroWO.H3.Rules')._grantExperience(cx.map.representationOf(123), 1000)

      //;(new Rules.GenericEncounter({
      //  rules: cx.modules.nested('HeroWO.H3.Rules'),
      //  bonus: 123,
      //  hero: 456,
      //  //selectors: {ifBuilding: 14},
      //})).attach().handle()
    }
  }
)