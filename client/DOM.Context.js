define(['DOM.Common', 'Context'], function (Common, Context) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // Represents an engine instance running in a web browser.
  return Context.Fetching.extend('HeroWO.DOM.Context', {
    mixIns: [Common.jQuery.MixIn],
    el: {class: 'Hcx'},
    _window: null,
    _timedScale: null,

    //> scale bool `- Enables automatic scaling of the entire UI
    //  (`#Context.`'el) to fit document width. See `#scale().
    _opt: {
      scale: false,
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