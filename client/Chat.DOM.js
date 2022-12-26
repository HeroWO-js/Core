define(['DOM.Common', 'H3.DOM.Bits'], function (Common, Bits) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // XXX should not depend on H3 (Bits.Window)

  // There's actually CHAT.WAV in Heroes3.snd but it's 3 times larger. There's also DEFAULT.WAV that is suspiciously similar to the real ICQ sound (but more intrusive). Replace? XXX
  const STARPER_DETECTED = 'data:audio/mp3;base64,/+MyxAAYiOaVd0lgApAPqs5Jp+Huc9qc98IQyYIBhhMjFYreQATBufwGBgYRHYNBEPITs/X2OBLJ79FjnavPFnA+fBAHyhwTvvEBwEHLeXP8EHYjP/+uD/Ehzh/lHf/g//g//h/Lg4GIPn/EhyUG/+FVVZZ2lrpHa7GgJaSo0XlA1CtS58kuKSU4g8HANimmkVtVPDQYJlSeP+xqMP/jMMQtF1EO/ZeDSAadryhV7H1+ql7q3ZLTGbO7mZR/t23NffsORABI9CxsYOU12lJN78h/1Mt6S0q4RrqfiGtV/1YzHVCsfxmY4GAg6JQViIGgaBkFToiPSoK4NHgVBX/rBUNRVx2IjuGlgqd/5KJXawVBUNSoK//Bk6Ij2VrBbEQNHawVOgq4Gn+WBoGgaBoNb//////////////jMsReFQhWmNXDAAD///////////////////////////////////////////8gABttsRCIY6RiVClpphqgND1Ggs0Dk+QQ6VwU8ga9uCIt6ablcDhmwMVCA5BoGoz5cYnDNwHFwNaTAGEgPCAZoR+VzBjRbgmOAscAGBhbEPsDcz+bqtuFyg2wh4xo3xZA0v/tvyRGbIiVhzCLDML/4zLEmQqAAlwBQAAAJ7//qZBd9i+onybIOVT5cOIk+Wv//d9vvzdA2LiZ5OmUCcNi4x3/lQf6KUvA5uUAZAmqQ/9MWSXZTKalfd7bkkkBEbCIpyQ0BnrKxYEKJDBoEKAGnAUWTRaK62WBAYDKRYgwcTJw1SSMVKAygFDkDEoikk0kzQyTZFJZmRQiReM1lFV0WpPZxliXDVpgSpIm/+MyxP8pKyKtb5KgAky2OL9VdZsTSDnkWpI1VvUplV0ebWZFHdB0VoVWd7Ua6nS1PUpSSS0lopKpG6SjVJSfZV6Z1P9FkVL100UkVmFFzExUmo46kHTQamdWpk8Eo9iUbbv4gvWdpgU5I5///2XLrbXrLq16Zlk5MbkkSXWl0ISgRBcNBqbAszbCws0qMBUAsaHQNjpWihZV/1JFbP/jMMTqLMuOvbeJmAGRVdtRW5Wv1Vv/2bhr/72b+ChamZteGX//9V4uSRWwVOxK/Wd1A0oO1HtQNHWRKdBV0FR7iJUFtQNFg7+DTv4i4lO//iL////////////////////////////////////////////////////////////////////////////////////////////////////jMsTFHsIiUbXMQAD////////////////////////////////////////////SRVmmlIpGIxGo1Hepxkb+xHC8nWEMbrA+rAqU5jCxTIk0dAD0QAc1Ay4sBc0BnSAAIo0W7geawBymQBywARAEQQGXLAakgDezJuyYG0YAZ4ADawGQHAMCAMOAAwYgYwG1gMKEdk3uAASAzRQBQgH/4zLE2hrAAlwBQAAA7QAQAL6B/RAoekQUagWNP+HrA3YMgF/AsMDpBtDlC1h0BASGEONGTf8VoOAey4aJGjGZkO43JwrGJFSKttZtuRcnyiMuOMiBmT5UMzcnJqg6aSTGBsfb/7WY0ZBA0J83kXJ83KZFyfRdrJuiusxVR2azWb/5FyfNS+bol83Ki02WmyabJvXSWk6NJ1IoqTPG/+MyxP9AzAq1n5igAk9/D/X0EEMIccccsUCgUAJoAyT/Lhtj8ehHlvpkgPIxUd4CWAMIEqPYxYxR8OSIyOIfyUQXpfEtKOovJP/8dpGJFBJHUqr/Jwzk0uE9MwLTbXrr/8utQMy8YoIl1BH1r///MSVMTA+dJUnGKBJGKk0qv////SWkktaJqYnkjFA+6BuSR134utrf/JVK///////jMMSLIcNypZeLaAL//////////////////////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/jMsSTCQACXAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABUQUcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/w=='

  const SEAT = 'HeroWO Seat'

  // $.toggle() forces reflow.
  function toggle(el, visible) {
    el.length && (el[0].style.display = visible ? '' : 'none')
  }

  var ChatDOM = {}
  // GLobal since relates to the whole tab.
  var lastSound = 0

  try {
    if (!localStorage.getItem(SEAT)) {
      localStorage.setItem(SEAT, Math.random().toString(36).substr(2))
    }
  } catch (e) {}

  ChatDOM.Rooms = Common.jQuery.extend('HeroWO.Chat.DOM.Rooms', {
    mixIns: [Common.Ordered],
    el: {class: 'Hchat-rooms Hchat-rooms_hidden_no'},
    _childClass: [ChatDOM, 'Room'],
    _childEvents: ['change_alert', 'change_title', 'change_empty'],
    _template: null,

    _opt: {
      context: null,
      current: null,
      extraLinks: {},   // {"Forum": "http://..."}
      hidden: false,
    },

    events: {
      init: function () {
        // jQuery's append() forces reflow.
        this.el[0].innerHTML = '<div class="Hchat-rooms__tabs"></div>' +
                               '<div class="Hchat-rooms__rooms"></div>'

        this._orderedParent = this.$('.Hchat-rooms__rooms')
        this._template = this.get('context').template(this.constructor.name)
      },

      '+normalize_hidden': Common.normBool,

      change_hidden: function (now) {
        Common.oneClass(this.el, 'Hchat-rooms_hidden_', now ? 'yes' : 'no')
      },

      '+normalize_current': function (res, value) {
        return value || this.first()
      },

      nestExNew: function (res) {
        res.child.attach().render()
        toggle(res.child.el, false)
        this.getSet('current')
      },

      unnested: function (child) {
        this.getSet('current', function (cur) {
          return cur == child ? null : cur
        })
      },

      remove: function () {
        this.invoke('remove')
      },

      attach: function () {
        Common.autoOffNode(this, document.body, {
          paste: function (e) {
            var room = this.get('current')
            // In Firefox, pasting an image file (not image data) won't work for a mysterious reason.
            //
            // https://stackoverflow.com/questions/71796358/
            var file = e.originalEvent.clipboardData.files[0]
            if (room && !room.get('loading') &&
                (room.get('rpc') || room.get('sendURL')) && file &&
                confirm(_.format(this.get('context').s('mainMenu', 'Upload %s?'), file.name))) {
              room.upload(file)
            }
          },
        })
      },

      render: function () {
        var el = this.$('.Hchat-rooms__tabs')
        if (el.length) {
          var vars = this.get()
          vars.rooms = this.map(function (room) {
            return _.extend(room.get(), {
              current: room == vars.current,
              key: room._parentKey,
            })
          })
          el[0].innerHTML = this._template(vars)
        }
      },

      'change_current, change_hidden': function () {
        this.get('hidden') || this.getSet('current', function (cur) {
          if (cur && cur.ifSet('shown', true)) {
            // Scroll isn't operatable on invisible elements so
            // triggering that explicitly when a Room is first made visible.
            cur.scrollToLast()
          }
          return cur
        })
      },

      change_current: function (now) {
        this.each(function (child) {
          toggle(child.el, child == now)
        })

        now && now.clearAlert()
        this.render()
      },

      'nestExNew, unnested, .change_alert, .change_title, .change_empty, change_extraLinks': 'render',
    },

    elEvents: {
      'click [data-Hroom]': function (e) {
        var room = this.nested(e.target.getAttribute('data-Hroom'))
        this.set('current', room)
        room.focus()
      },

      'click .Hchat-rooms__hide': 'hide',

      keydown: function (e) {
        if (e.keyCode == 27) {
          this.hide()
          e.stopPropagation()   // MainMenu's handler
          e.preventDefault()
        }
      },
    },

    hide: function () {
      this.set('hidden', true)
    },
  })

  ChatDOM.Room = Common.jQuery.extend('HeroWO.Chat.DOM.Room', {
    mixIns: [Common.Ordered],
    el: {class: 'Hchat-room'},
    _childClass: [ChatDOM, 'Message'],
    _childEvents: ['+format', '+author'],

    _opt: {
      context: null,
      rpc: null,
      sse: null,    // EventSource
      sendURL: '',
      channel: null,
      title: '',
      alert: false,
      loading: null,
      empty: true,
      shown: false,   // internal to Rooms
      screen: null,
      spotting: false,  // only read
    },

    events: {
      '-init': function () {
        this._boundOnChat = function (e) {
          this._incoming(JSON.parse(e.data))
        }.bind(this)
      },

      init: function () {
        this.el[0].innerHTML = this.context().template(this.constructor.name)(this.get())
        toggle(this.$('.Hchat-room__paste-spot'), this.get('screen'))
        this._orderedParent = this.$('.Hchat-room__msgs')

        // Deferring until the browser calculates styles for newly appended nodes.
        this.scrollToLast = _.debounce(function () {
          if (this.length) {
            // If the page itself has scrollbars, scrollIntoView() would
            // annoyingly scroll the page every time a message is received.
            var top = 0
            for (var el = this.last().el; (el = el.prev())[0]; ) {
              top += el.outerHeight(true)
            }
            this._orderedParent.prop('scrollTop', top)
          }
        }, 0)
      },

      change_screen: function (now, old) {
        old && this.autoOff(old)

        now && this.autoOff(now, {
          change_z: function () {
            now.modules.nested('HeroWO.DOM.Map')
              // XXX direct DOM access bypassing gridCellAt()
              .$('.Hgrid__cell_chat').removeClass('Hgrid__cell_chat')
          },
        })

        toggle(this.$('.Hchat-room__paste-spot'), now)
        // XXX should also re-format() Message-s
      },

      change_rpc: function (now, old) {
        old && this.autoOff(old)

        now && this.autoOff(now, {
          serverEvent: function (event, data) {
            if (event == 'action' && data.object == 'chat') {
              this._incoming(data)
            }
          },
        })
      },

      change_sse: function (now, old) {
        old && old.removeEventListener('chat', this._boundOnChat)
        now && now.addEventListener('chat', this._boundOnChat)
      },

      remove: function () {
        this.scrollToLast.cancel()
        this.invoke('remove')   // revokeObjectURL()
        this.set('loading', null)
        this.set('sse', null)
      },

      change_loading: function (now, old) {
        try {
          // In Firefox, FileReader.abort() will fail if the read has finished.
          old.abort()
        } catch (e) {}
        var el = this.$('.Hchat-room__write').prop('disabled', !!now)
        now || el[0].focus()    // setting [disabled] clears it
        this.el.toggleClass('Hchat-room_loading', !!now)
      },

      'nestExNew, unnested': function () {
        this.set('empty', !this.length)
      },

      '+.+format': function ($1, $2, msg) {
        if (this.get('screen')) {
          var re = /<.*?>|\((\d+);(\d+)(;(\d+))?\)/g
          return msg.replace(re, function (full, x, y, $, z) {
            if (x != null) {
              full = '<span class="Hchat-msg__spot" data-Hspot="' +
                     [x, y, z || 1] + '">' + full + '</span>'
            }
            return full
          })
        }
      },
    },

    elEvents: {
      mousedown: 'clearAlert',

      keydown: function (e) {
        this.clearAlert()

        if (e.keyCode == 13) {
          e.preventDefault()
          var text = e.target.value.trim()

          if (!this.get('loading') && text.length) {
            this.send('text', text, function () {
              if (text == e.target.value.trim()) {
                e.target.value = ''
              }
            })
          }
        }
      },

      'change .Hchat-room__file': function (e) {
        var file = e.target.files[0]
        file && this.upload(file)
        e.target.value = ''
      },

      'click .Hchat-room__paste-sc': function () {
        alert(this.context().s('mainMenu', 'Upload any file from desktop or clipboard simply by pasting it. In other words, press Print Screen and then Ctrl+V.'))
      },

      'click .Hchat-room__paste-spot': function (e) {
        var el = this.$('.Hchat-room__write')
        if (!el.prop('disabled') && this.ifSet('spotting', true)) {
          var sc = this.get('screen')
          var margin = sc.map.get('margin')
          function format(x, y, z) {
            x -= margin[0] - 1
            y -= margin[1] - 1
            return _.format(' (%d;%d%s) ', x, y, z ? ';' + ++z : '')
          }
          var ev = sc.on('change_mouseCell', function (now) {
            this.$('.Hchat-room__paste-spot-pos')
              .text(now ? format(now[0], now[1], sc.get('z')) : '')
          }, this)
          sc.once('=cellClick', function (sup, x, y, z) {
            this.set('spotting', false)
            this.$('.Hchat-room__paste-spot-pos').text('')
            sc.off(ev)
            if (!el.prop('disabled')) {
              el[0].value += format(x, y, z)
            }
            this._parent.assignResp({
              current: this,
              hidden: false,
            })
            el[0].focus()
          }, this)
        }
      },

      'click .Hchat-msg__spot': function (e) {
        var margin = this.get('screen').map.get('margin')
        var coords = e.target.getAttribute('data-Hspot').split(',')
        var xy = [+coords[0] + margin[0] - 1, +coords[1] + margin[1] - 1]
        this.get('screen').assignResp({
          mapPosition: xy,
          z: coords[2] - 1,
        })
        this.get('screen').modules.nested('HeroWO.DOM.Map')
          .gridCellAt(xy[0], xy[1]).classList.add('Hgrid__cell_chat')
      },
    },

    _incoming: function (data) {
      // An earlier seen message may arrive in case of SSE reconnect. Messages
      // don't have a unique ID but we can treat date as one given it includes
      // microseconds.
      if (data.channel == this.get('channel') && !this.nested(data.date)) {
        var add = this._add.bind(this, data)
        var done = Common.stub

        if (data.type != 'text' && window.fetch) {
          // Since we embed binary data right into the HTML, for efficiency
          // convert data: into an object URL which is a short pointer into the
          // browser's memory.
          //
          // Kudos https://stackoverflow.com/questions/12168909
          fetch(data.data.data)
            .then(function (resp) {
              resp.blob()
                .then(function (blob) {
                  data.data.data = URL.createObjectURL(blob)
                  done = function (child) {
                    child.fuse('remove', function () {
                      URL.revokeObjectURL(data.data.data)
                    })
                  }
                  dataReady()
                }, dataReady)
            }, dataReady)
        } else {
          dataReady()
        }

        function dataReady() {
          if (data.type == 'image') {
            // Even though we're adding images from data URL, browser still doesn't immediately calculate its dimensions when added to DOM. As a result, when scrollToLast() calculates new position the <img> size may be yet zero and it will be expanded some time later (which can be 10, 50, 100 or more ms in the future, can be seen by logging this.$('img').toArray().map(i => i.offsetHeight) in scrollToLast()) but scroll position of msgs is not updated anymore so it is "at the bottom" no longer. This in turn causes the "do scroll" check in _add() to fail for subsequent messages, resulting in a chat window that is half-scrolled to the bottom while it must have been fully scrolled (such as when loading historical messages with Rooms _opt.hidden initially false).
            //
            // To work around this, we explicitly specify <img width/height> so the node's dimensions do not depend on the browser loading the picture.
            //
            // This can be tested by having a few dozens of chat messages, text/file randomly mixed with image. If Rooms is added on page load with the hidden of false, the last message's top edge must be aligned with the msgs' top edge, or if the message is shorter than scrollHeight then its bottom edge must be aligned with msgs' bottom edge.
            var img = new Image
            img.onerror = function () {
              data.type = 'file'
              done(add())
            }
            img.onload = function () {
              _.extend(data, {width: img.width, height: img.height})
              done(add())
            }
            img.src = data.data.data
          } else {
            done(add())
          }
        }
      }
    },

    _add: function (data) {
      if (!_.has(data, 'mySeat')) {
        try {
          data.mySeat = data.seat == localStorage.getItem(SEAT)
        } catch (e) {}
      }

      var root = this._orderedParent
      if (root.prop('scrollTop') >= root.prop('scrollHeight') - root.height() - 20) {
        this.scrollToLast()
      }

      var child = this.nest(data.date, data, {pos: data.date})
        .set('context', this.context())
        .attach()
        .render()

      if (!data.history && !data.mySeat) {
        this.set('alert', true)

        if (lastSound + 5000 < Date.now()) {
          lastSound = Date.now()

          var el = $('<audio>')
          try {
            el.attr('src', STARPER_DETECTED)
              .on('ended', function () { el.remove() })
              [0].play()
          } catch (e) {
            el.remove()
          }
        }
      }

      return child
    },

    context: function () {
      return this.get('context')
    },

    clearAlert: function () {
      this.set('alert', false)
    },

    upload: function (file) {
      if (file.size > 1024 * 1024) {   // +33% base64 data URL
        alert(_.format(this.context().s('mainMenu', 'Maximum file size is one Megabyte. Your file is %.1f MiB.'), file.size / 1024 / 1024))
      } else {
        var reader = new FileReader

        reader.onloadend = function () {
          this.send(_.startsWith(file.type, 'image/') ? 'image' : 'file', {
            name: file.name,
            size: file.size,
            data: reader.result,
          })
        }.bind(this)

        reader.readAsDataURL(file)
        this.set('loading', reader)
      }
    },

    // Cancels previous request if still loading.
    send: function (type, data, done) {
      done = done || Common.stub
      var rpc = this.get('rpc')

      if (rpc) {
        var loading = rpc.do('action', {
          object: 'chat',
          channel: this.get('channel'),
          type: type,
          data: data,
        })
          .whenSuccess(done, this)
          .whenComplete(complete, this)
      } else if (this.get('sendURL')) {
        var form = new FormData
        form.set('type', type)
        form.set('data', JSON.stringify(data))

        try {
          form.set('seat', localStorage.getItem(SEAT))
        } catch (e) {}

        var loading = _.ajax({
          url: this.get('sendURL'),
          type: 'POST',
          data: form,
          headers: {},
          context: this,
          success: done,
          complete: complete,
        })
      } else {
        throw new Error('Neither rpc nor sendURL is set.')
      }

      this.set('loading', loading)

      function complete() {
        this.set('loading', null)
      }
    },

    focus: function () {
      this.$('textarea')[0].focus()
    },
  })

  ChatDOM.Message = Common.jQuery.extend('HeroWO.Chat.DOM.Message', {
    el: {tag: 'p', class: 'Hchat-msg'},

    _opt: {
      context: null,
      width: 0,
      height: 0,

      // Only set for in-game messages. Server-cooked messages may miss some.
      screen: null,
      phase: 0,
      player: 0,
      observer: false,
      client: '',
      myPlayer: false,
      channel: null,

      // Set both for in-game and global chat messages.
      seat: '',     // global chat: random temporary ID given by client
      mySeat: false,
      history: false,
      date: 0,      // ms
      type: '',     // text/image/file
      data: null,   // depends on type; text: string; image/file: {name, size, data}
    },

    events: {
      render: function () {
        var cx = this.get('context')

        var template = cx.shared(this.constructor.shared, function () {
          return cx.template(this.constructor.name)
        }, this)

        var vars = this.get()
        vars.author = this.author()
        if (vars.type == 'text') {
          vars.html = this.format(vars.data)
        } else {
          var size = Math.round(vars.data.size / 1024, 1)
          vars.sizeText = size >= 0.9 ? size + ' KiB' : vars.data.size + ' B'
        }
        this.el[0].innerHTML = template(vars)

        this.el.addClass('Hchat-msg_observer_' + (vars.observer ? 'yes' : 'no'))
        // XXX=RH
        var players = ['', 'red', 'blue', 'tan', 'green', 'orange', 'purple', 'teal', 'pink']
        this.el.addClass('Hchat-msg_player_' + players[vars.player])
        this.el.addClass('Hchat-msg_myPlayer_' + (vars.myPlayer ? 'yes' : 'no'))
        this.el.addClass('Hchat-msg_mySeat_' + (vars.mySeat ? 'yes' : 'no'))
      },
    },

    format: function (str) {
      return _.escape(str).replace(/\bhttps?:\/\/[^\s()]+/gi, function (match) {
        match = match.match(/^(.*?)([,.?!]*)$/)
        var text = (match[1].match(/^https?:\/\/([^\/]+)/) || ['', match[1]])[1]
        return '<a href="' + match[1] + '" target="_blank">' + text + '</a>' + match[2]
      })
    },

    author: function () {
      return this.get('seat').substr(0, 4)
    },
  }, {shared: {}})

  ChatDOM.ShowButton = Common.jQuery.extend('HeroWO.Chat.DOM.ShowButton', {
    el: {tag: 'span', class: 'Hchat-btn'},
    rooms: null,

    _opt: {
      hideIfVisible: true,    // do not change
    },

    _initToOpt: {
      rooms: '.',
    },

    events: {
      attach: function () {
        this.get('hideIfVisible') && toggle(this.el, this.rooms.get('hidden'))

        this.autoOff(this.rooms, {
          change_hidden: function (now) {
            this.get('hideIfVisible') && toggle(this.el, now)
          },
          'nestExNew, unnested, .change_alert, .change_title, .change_empty': '_update',
        })
      },

      render: '_update',
    },

    elEvents: {
      'click [data-Hroom]': function (e) {
        var room = this.rooms.nested(e.target.getAttribute('data-Hroom'))

        // In !hideIfVisible mode allow user click on the room link while that
        // room is already visible to hide the chat box (still clearing the alert).
        if ((this.rooms.ifSet('current', room) | this.rooms.ifSet('hidden', false)) == 0) {
          this.rooms.set('hidden', true)
        }

        room.clearAlert()
        room.focus()
      },
    },

    _update: function () {
      this.el.empty().append(
        this.rooms.map(function (room) {
          return $('<span>')
            .attr({
              class: 'Hchat-btn__room Hchat-btn__alert_' + (room.get('alert') ? 'yes' : 'no') + ' Hchat-btn__empty_' + (room.get('empty') ? 'yes' : 'no'),
              'data-Hroom': room._parentKey,
            })
            .text(room.get('title'))
        })
      )
    },
  })

  ChatDOM.Window = Bits.Window.extend('HeroWO.Chat.DOM.Window', {
    mixIns: [Common.ScreenModule],
    el: {class: 'Hchat-win'},
    rooms: null,

    _opt: {
      modal: false,
      // + Room _opt
    },

    events: {
      attach: function () {
        this.rooms = new ChatDOM.Rooms(_.extend(this.get(), {
          context: this.cx,
          hidden: this.get('collapsed'),
        }))

        this.rooms.attach(this.el)

        this.autoOff(this.rooms, {
          change_hidden: function (now) {
            this.set('collapsed', now)
          },
        })
      },

      change_collapsed: function (now) {
        this.rooms && this.rooms.set('hidden', now)
      },

      render: function () {
        this.rooms.render()
      },

      '-unnest': function () {
        this._parent && this.rooms.remove()
      },

      '=cancel': function () {
        return this.set('collapsed', true)
      },
    },
  })

  ChatDOM.Window.ShowButton = ChatDOM.ShowButton.extend('HeroWO.Chat.DOM.Window.ShowButton', {
    mixIns: [Common.ScreenModule],

    _opt: {
      hideIfVisible: false,
    },

    // ScreenModule overrides this one.
    _update: function () {
      ChatDOM.ShowButton.prototype._update.call(this)
    },
  })

  return ChatDOM
})