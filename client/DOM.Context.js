define(['DOM.Common', 'Context'], function (Common, Context) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // Represents an engine instance running in a web browser.
  return Context.extend('HeroWO.DOM.Context', {
    mixIns: [Common.jQuery.MixIn],
    el: {class: 'Hcx'},
    _window: null,
    _combined: null,
    _timedScale: null,

    //> scale bool `- Enables automatic scaling of the entire UI
    //  (`#Context.`'el) to fit document width. See `#scale().
    //> fetchCombined bool `- if unset, databank and map files are fetched individually (e.g. `[map.json`], `[spot.json`], etc.), else a single large `[combined.json`] file is fetched and others are extracted from it
    //> mapsURL str `- root URL for fetching maps' files (followed by relative map path)
    //> databanksURL str `- root URL for fetching databanks' files (followed by databank -v'ersion)
    _opt: {
      scale: false,
      fetchCombined: true,
      mapsURL: '',
      databanksURL: '',
    },

    events: {
      init: function () {
        this._window = $(window)
        this._updateClassic()
      },

      change_scale: 'scale',

      'change_loading, menu': function () {
        // Different states can have different content dimensions.
        _.defer(Common.ef('scale', this))
      },

      change_loading: function () {
        // If now loading - remove old data, if !now - remove already unneeded data to allow GC.
        this._combined = {}
      },

      change_classic: '_updateClassic',

      // Can be called multiple times.
      attach: function () {
        this._timedScale = _.throttle(Common.ef('scale', this), 100)

        this._window
          .off('.' + this._cid)
          .on('resize.' + this._cid, this._timedScale)
      },

      unnest: function () {
        this._timedScale.cancel()
        this._window.off('.' + this._cid)
      },

      '=fetch': function (sup, type, root, file) {
        if (this._fetchData) {
          // game() caused by RPC.WebSocket.Connector, with all data provided over WebSocket.
          return sup(this, arguments)
        }

        // In server mode, non-standard type raises an error since server doesn't allow reading arbitrary files. But in client mode we treat type as an URL prefix which can be useful when tinkering around without the need to update the source code.
        switch (type) {
          case 'HeroWO.Map':
            type = this.get('mapsURL')
            break
          case 'HeroWO.H3.Databank':
            type = this.get('databanksURL')
            break
        }

        if (!file.match(/\.json$/)) {
          throw new Error('Fetching of non-.json files is not implemented yet.')
        } else if (!this.get('fetchCombined')) {
          var cls = Common.JsonAsync
        } else {
          var key = type + ':' + root
          var combined = this._combined[key] ||
            (this._combined[key] = new Common.JsonAsync({
              url: type + (root || '') + 'combined.json',
            }))
          var async = new Common.Async({type: type, root: root, file: file})
          combined.whenComplete(function () {
            async.response = (combined.response || {})[file]
            async.set('status', async.response != null)
          }, null, 1)
          return async
        }

        return new cls({url: type + '/' + (root || '') + file})
      },
    },

    // Returns normalized URL of the databank used by current `#map, with trailing slash.
    databankURL: function () {
      // Chrome doesn't normalize path separators in URL (foo//bar => foo/bar). With such a path in <link href>, relative url() is resolved incorrectly: href=a//b/c/d.css, url(../../foo.png) resolves to a/b/foo.png, not a/foo.png. Same with AJAX: /foo//../bar is /foo/bar, not /bar.
      return this.get('databanksURL').replace(/\/+$/, '') +
             '/' + this.map.get('databank') + '/'
    },

    // Updates the root `'el's scaling according to the node's and window's sizes.
    //
    // ` `#scale() is called automatically if the `'scale `#_opt is enabled
    // whenever window is resized. Usually the root `'el has the same size
    // no matter current game state but you can call this method manually if
    // this is not the case.
    scale: function () {
      this.el.toggleClass('Hcx_scale', this.get('scale'))
      Common.oneClass(this.el, 'Hcx_scale_')
      if (!this.get('scale')) {
        var ratio = 1
      } else {
        var ratio = Math.min(this._window.width() / this.el.width(),
                             this._window.height() / (this.el.height() + this.el.offset().top))
        this.el.addClass('Hcx_scale_' + (ratio < 1 ? 'down' : 'up'))
      }
      this.el.css('transform', ratio == 1 ? '' : 'scale(' + ratio + ')')
      _.invoke(this.screens(), 'set', 'scaleFactor', ratio)
    },

    _updateClassic: function () {
      Common.oneClass(this.el, 'Hcx_classic_', this.get('classic') ? 'yes' : 'no')
    },
  })
})