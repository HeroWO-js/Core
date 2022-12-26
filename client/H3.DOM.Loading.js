define(['DOM.Common'], function (Common) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // Splash screen for when the `'game is being `'loading in a `#Context.
  //
  //[
  //   var context = new DOM.Context
  //   ;(new DOM.Loading({context: context}))
  //     // Attaching to context.el allows scaling along with it.
  //     .attach(context.el)
  //     .render()
  //]
  return Common.jQuery.extend('HeroWO.H3.DOM.Loading', {
    el: {class: 'Hh3-loading'},
    _context: null,

    _opt: {
      visible: null,
    },

    _initToOpt: {
      context: '._context',
    },

    events: {
      attach: function () {
        this.autoOff(this._context, {
          'change_screen, change_loading': 'update',
        })
      },

      render: function () {
        this.el.html('<div class="Hh3-loading__bar-o">' +
                     '<div class="Hh3-loading__bar-i">')
        this.update()
      },

      change_visible: function (now) {
        this.el.toggle(now)
      },
    },

    update: function () {
      this.set('visible', this._context.get('loading') && this._context.get('screen') == 'game')
    },
  })
})