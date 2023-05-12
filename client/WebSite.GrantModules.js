define(['require', 'DOM.Common'], function (require, Common) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // Asks for user confirmation before loading non-standard `#Context modules.
  return Common.jQuery.extend('HeroWO.WebSite.GrantModules', {
    _template: null,
    _shade: null,

    _opt: {
      context: null,
      location: false,
      modules: [],
      loaded: [],   // confirmed module names
    },

    events: {
      init: function (opt) {
        this._template = _.template(opt.template)
        this._shade = $('<div class=Hweb-gm-shade>').appendTo('body')
      },

      render: function () {
        this.el.html(this._template(this.get()))
      },

      remove: function () {
        this._shade.remove()
      },
    },

    elEvents: {
      'click button': function () {
        this.el.add(this._shade).hide()
        this.load(this.get('modules').map(Common.p('url')))
      },
    },

    run: function (urls) {
      var modules = urls.map(function (url) {
        url = this.get('context').expandModuleURL(url)
        return {
          host: (url.match(/\/\/([^\/]+)/) || [, location.host])[1]
            .replace(/[^\w.-]/g, '!'),  // stuff non-ASCII
          url: url,
          urlShort: url.length > 30 ? '…' + url.substr(-25) : url,
          hash: '',
        }
      }, this)

      this.set('modules', modules)

      if (typeof crypto == 'undefined' || !crypto.subtle || typeof TextEncoder == 'undefined') {
        this.show()
      } else {
        _.each(modules, function (module) {
          crypto.subtle.digest('sha-1', (new TextEncoder).encode(module.url))
            .then(function (hash) {
              hash = _.map(new Uint8Array(hash), function (s) {
                return s.toString(16)
              })

              module.hash = hash.join('').substr(0, 8)

              if (_.every(modules, Common.p('hash'))) {
                this.show()
              }
            }.bind(this))
        }, this)
      }
    },

    show: function () {
      this.attach().render()
      this.el.add(this._shade).show()
    },

    load: function (modules) {
      this.set('loaded', this.get('loaded').concat(modules))

      var self = this
      var successful = []
      var failed = []

      _.each(modules, function (url) {
        require([url], loaded(successful, url), loaded(failed, url))
      })

      function loaded(a, url) {
        return function () {
          a.push(url)

          if (successful.length + failed.length == modules.length) {
            if (failed.length) {
              var msg = successful.length
                ? 'Continuing without these modules that have failed to load:'
                : 'Continuing even though all modules have failed to load:'
              alert(msg + '\n\n' + failed.join('\n\n'))
            }

            if (self.get('location')) {
              _.each(successful, function (url) {
                var module = require(url)
                try {
                  // There are two kinds of modules: one is Map-bound, other is
                  // custom. The first are loaded by Context that calls
                  // autoAddModule() after fetching basic Map data. The second
                  // are loaded and unloaded at arbitrary times, when user
                  // decides to turn a module on and off.
                  //
                  // Custom modules may have start() and stop() methods (either
                  // both together or none) on the returned value. Both take
                  // Context as a parameter. start() is called on load and from
                  // there, the module's behaviour is undefined. stop() is
                  // called if user turns off the module.
                  //
                  // Normally, if start() provides a Module but one that is not
                  // required for Map functioning (else this would be a Map-bound
                  // module), it would add itself into the Context given to
                  // start(), and listen to change_screen in order to re-insert
                  // if the game restarts (because start() won't be called
                  // again). In stop() it would remove its Module(s), hooks and
                  // undo other modifications it has made to the environment.
                  module.start && module.start(self.get('context'))
                } catch (e) {
                  console.error(e)
                }
              })
            }

            self.granted()
          }
        }
      }
    },

    granted: Common.stub,
  })
})