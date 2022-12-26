define(['Common', 'sqimitive/main', 'sqimitive/jquery'], function (Common, Sqimitive, jQuery) {
  "use strict"
  var _ = Common._

  //! +cl=DOM.Common
  //
  // Collection of base library classes and utility functions used throughout
  // HeroWO DOM-based UI.
  var Common = _.extend({}, Common, {
    // Simply an empty 1*1 GIF image, suitable for use in `[<img src>`].
    blankGIF: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',

    //= null if the browser doesn't support `'passive event listeners`,
    //  object `[{passive: true}`] if it does
    //?`[
    //  el.addEventListener('wheel', this._handleWheel, Common.passiveListener)
    //    // non-passive for IE and friends, passive for others
    // `]
    passiveListener: null,

    // A jQuery-compatible interface to DOM.
    $: jQuery.$,

    // Base framework class for DOM objects.
    jQuery: jQuery.extend('HeroWO.Sqimitive.jQuery', {
      mixIns: [Common.BaseMixIn],
    }),

    // Ensures that a DOM node has no classes of `'prefix except the given ones.
    //> classList native DOM node`, jQuery collection`, DOMTokenList
    //> prefix string
    //> * `- zero (to remove all) or more suffixes added to `'prefix in `'classList;
    //  `''' and `'false are added as just `'prefix while `'null values are not
    //  added at all (i.e. removed from `'classList)
    //= true if the class list was changed`, false
    //
    // ` `#oneClass() does not do any modifications to `'classList if it already contains the necessary classes. This is important because at least Chrome 98 doesn't batch these changes and does style recalculation even if set of classes remains essentially the same (try `[node.className += ' '`] or `[classList.add('foo').remove('foo')`]), killing performance on large DOM.
    //
    //?`[
    //   oneClass('some foo_bar_baz other', 'foo_bar_')
    //     //=> 'some other'
    //   oneClass('some foo_bar_baz other', 'foo_bar_', 'quux')
    //     //=> 'some other foo_bar_quux'
    //   oneClass('some foo_bar_baz other', 'foo_bar_', 'quux', 'xyz')
    //     //=> 'some other foo_bar_quux foo_bar_xyz'
    //   oneClass('some foo_bar_baz other', 'foo_bar_', false ? 'quux' : null)
    //     //=> 'some other'
    // `]
    oneClass: function (classList, prefix, newValue_1) {
      if (jQuery.is$(classList)) {
        var args = arguments
        var changed
        classList.each(function () {
          args[0] = this
          changed = Common.oneClass.apply(Common, args) || changed
        })
        return changed
      }

      if (_.isElement(classList)) {
        classList = classList.classList
      }

      var changed = false
      var add = new Set
      var remove = []

      for (var i = 2; i < arguments.length; i++) {
        var suffix = arguments[i]
        suffix == null || add.add(suffix === false ? '' : suffix)
      }

      // DOMTokenList omits duplicates except in its value property.
      classList.forEach(function (cls) {
        if (cls.substr(0, prefix.length) == prefix &&
            !add.delete(cls.substr(prefix.length))) {
          remove.push(cls)
        }
      })

      if (remove.length) {
        // Can't remove() from forEach() as later classes won't be iterated over.
        classList.remove.apply(classList, remove)
        changed = true
      }

      if (add.size) {
        add.forEach(function (suffix) {
          classList.add(prefix + suffix)
        })
        changed = true
      }

      return changed
    },

    // Hooks `'elEvents on `'el and ensures that they are unhooked when `'self
    // (usually a `#Module) is removed.
    //
    //> self object Sqimitive
    //> el object`, string selector `- as accepted by `@Common.jQuery`@
    //> elEvents object `- in `@Common.jQuery`@'s format; callbacks are called
    //  in the context of `'self
    //
    //= object with `'remove() method to unbind listeners prematurely
    //
    //?`[
    //   Common.jQuery.extend({
    //     mixIns: [Common.ScreenModule],
    //
    //     events: {
    //       attach: function () {
    //         Common.autoOffNode(this, document.body, {
    //           'click .sel': '_handleClick',
    //         })
    //       },
    //     },
    //
    //     _handleClick: function (e) {
    //       // ...
    //     },
    //   })
    // `]
    autoOffNode: function (self, el, elEvents) {
      for (var k in elEvents) {
        elEvents[k] = Common.ef(elEvents[k], self)
      }
      var res = (new (Common.jQuery.extend({
        events: {
          '=remove': function () {
            this.el.off('.sqim-' + this._cid)
            self.off(ev)
          },
        },
        elEvents: elEvents,
      }))({el: el}))
      var ev = self.once('-unnest', res.remove, res)
      return res.attach()
    },

    //+cl=Common.Ordered
    // Mix-in for enforcing order on `'el's of children of a jQuery sqimitive.
    Ordered: {
      mixIns: [Sqimitive.Ordered],
      _orderedParent: null,

      events: {
        init: function () {
          this._orderedParent = this._orderedParent || this.el
        },

        _repos: function (child, index) {
          // Can be null if this class is doing its own ordering, like DOM.Bits.Windows does.
          if (this._orderedParent) {
            index >= this.length - 1
              ? child.el.appendTo(this._orderedParent)
              : child.el.insertBefore(this._orderedParent.children()[index])
          }
        },
      },
    },
  })

  // https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#safely_detecting_option_support
  try {
    window.addEventListener('herowo', _, {
      get passive() {
        Common.passiveListener = {passive: true}    // not in IE
      },
    })
    window.removeEventListener('herowo', _)
  } catch (e) {}

  return Common
})