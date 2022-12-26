define(['DOM.Common'], function (Common) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // "11:58".
  var clockFormat = Intl.DateTimeFormat([], {hour: 'numeric', minute: 'numeric'})

  // Creates a top menu bar. Sends and receives some statistics to/from the server.
  return Common.jQuery.extend('HeroWO.WebSite.TopBar', {
    mixIns: [Common.ContextModule],
    el: {class: 'Hweb-top'},
    persistent: true,
    _updateTimer: null,
    _clockTimer: null,
    _playTimer: null,

    _opt: {
      exceptionURL: '',
      // Changing this will start fetching so set this after updateURL or in batch().
      updateInterval: 0,  // ms; 0 to disable
      updateURL: '',
      fullscreen: false,
      onlineCount: 0,    // coming from server
      popularMapsURL: '',
      popularMapText: '',   // coming from server
      forumURL: '',
      lastForumURL: '',   // coming from server
      lastForumText: '',  // coming from server
      clock: '',
      playTime: 0,
      playing: false,
      connector: null,
    },

    events: {
      '+normalize_fullscreen': Common.normBool,

      change_fullscreen: function (now, options) {
        if (now != this._isFullscreen()) {
          if (now) {
            // This is terrific. See https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API/Guide#prefixing
            var n = document.documentElement
            ;(n.requestFullscreen || n.webkitRequestFullscreen || n.mozRequestFullScreen || n.msRequestFullscreen).call(n)
          } else {
            var n = document
            ;(n.exitFullscreen || n.webkitExitFullscreen || n.mozCancelFullScreen || n.msExitFullscreen).call(n)
          }
          _.defer(this.updateFullscreen.bind(this)) // request may fail
        }
      },

      change_updateInterval: function (now) {
        clearInterval(this._updateTimer)
        if (now) {
          this._fetch()
          this._updateTimer = setInterval(this._fetch.bind(this), now + _.random(now * 0.3))
        }
      },

      attach: function () {
        Common.autoOffNode(this, window, {
          error: function (e) {
            var data = new FormData

            data.set('configuring', !!this.cx.get('configuring'))
            this.cx.map && data.set('map', this.cx.map.get('url'))
            data.set('screens', this.cx.screens().map(Common.p('get', 'player')))

            _.each(['screen', 'loading', 'dataReady', 'allowUserModules',
                    'classic', 'master', 'backend'], function (opt) {
              data.set(opt, this.cx.get(opt))
            }, this)

            data.set('exception', JSON.stringify({
              colno:      e.originalEvent.colno,
              lineno:     e.originalEvent.lineno,
              filename:   e.originalEvent.filename,
              message:    e.originalEvent.message,
              error: e.originalEvent.error && {
                message:  e.originalEvent.error.message,
                name:     e.originalEvent.error.name,
                stack:    e.originalEvent.error.stack,
              },
            }))

            _.ajax({
              url: this.get('exceptionURL'),
              type: 'POST',
              data: data,
              headers: {},
            })

            var msg = 'Uh-oh! HeroWO has run into a problem. If this is happening for the first time and you notice the game has started to behave strange, reload the page. If this is repeating, please notify the developers via the forum. The error message is:'
            try {
              var tl = this.cx.s('website', msg)
            } catch (ex) {}
            alert((tl || msg) + '\n\n' + e.originalEvent.message)
          },
        })

        var updatePlaying = function () {
          this.set('playing', this.cx.get('screen') == 'game' && !this.cx.get('loading'))
        }.bind(this)

        this.autoOff(this.cx, {
          'change_screen, change_loading': updatePlaying,
        })

        updatePlaying()

        $(document)   // XXX=I no off()
          .on(
            'fullscreenchange webkitfullscreenchange mozfullscreenchange msfullscreenchange ' +
            'fullscreenerror webkitfullscreenerror mozfullscreenerror msfullscreenerror',
            this.updateFullscreen.bind(this)
          )
          .on('visibilitychange', this._updatePlayTimer.bind(this))

        this._clockTimer = setInterval(this._updateTime.bind(this), 55000)

        this.updateFullscreen()
        this._updateTime()
        this._updatePlayTimer()
      },

      change: 'update',

      _update: function () {
        var vars = this.get()
        vars.onlineText = _.format(this.cx.s('webTop', '%d users online'), vars.onlineCount)
        vars.showPlayTime = vars.playTime > 5*60
        vars.playTime = _.format(
          '%d:%02d',
          vars.playTime / 3600,
          Math.floor(vars.playTime / 60) % 60
        )
        vars.connector = vars.connector && vars.connector.get()
        this.el.html(this.cx.template(this.constructor.name)(vars))
      },

      '-unnest': function () {
        this.set('playing', false)
        this.set('connector', null)
      },

      change_playing: '_updatePlayTimer',

      change_connector: function (now, old) {
        old && this.autoOff(old)

        now && this.autoOff(now, {
          'change_active, change_working': 'update',
        })

        this.update()
      },
    },

    elEvents: {
      'click .Hweb-top__fullsc': function () {
        this.getSet('fullscreen', Common.not)
      },
    },

    updateFullscreen: function () {
      this.set('fullscreen', this._isFullscreen())
    },

    _isFullscreen: function () {
      var n = document
      return !!(n.fullscreenElement || n.webkitFullscreenElement || n.mozFullScreenElement || n.msFullscreenElement)
    },

    _updateTime: function () {
      this.set('clock', clockFormat.format())
    },

    _updatePlayTimer: function () {
      var interval = 55

      var update = function (init) {
        var now = new Date
        var item = ['' + now.getDate() + now.getMonth(), init ? 0 : interval]
        try {
          var history = localStorage.getItem('HeroWO Play Time').split(',')
        } catch (e) {}
        if (history && history[0] == item[0]) {
          item[1] += parseInt(history[1])
        }
        try {
          localStorage.setItem('HeroWO Play Time', item)
        } catch (e) {}
        this.set('playTime', item[1])
      }.bind(this)

      this.get('playTime') || update(true)
      clearInterval(this._playTimer)

      if (this.get('playing') && document.visibilityState == 'visible') {
        this._playTimer = setInterval(update, interval * 1000)
      }

      Common.oneClass(this.el, 'Hweb-top_playing_', this.get('playing') ? 'yes' : 'no')
    },

    _fetch: function () {
      _.ajax({
        dataType: 'json',
        url: this.get('updateURL') +
          '?map=' + encodeURIComponent(this.cx.map ? this.cx.map.get('url') : ''),
        timeout: 10000,
        headers: {},
        context: this,
        success: function (xhr) {
          try {
            this.assignResp(xhr.response)
          } catch (e) {}
        },
      })
    },
  })
})