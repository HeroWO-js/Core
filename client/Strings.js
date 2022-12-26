define(['Common'], function (Common) {
  "use strict"
  var _ = Common._

  // Provides string translation to `#Context (`@Context.s()`@).
  //
  // Translations are stored in an internal `'Map where keys are original strings,
  // as well as those strings prefixed with `[context! `] (e.g. "cx! str").
  // The prefixed version takes precedence.
  //
  // Multiple `#String-s can be present at a time. Some may be `'persistent
  // (like texts for the loading screen and main menu; in-game `#Strings may be added
  // only when `'screen is `'game).
  return Common.Sqimitive.extend('HeroWO.Strings', {
    mixIns: [Common.ContextModule],
    _strings: null,

    events: {
      init: function () {
        this._strings = new Map
      },

      owned: function () {
        this.autoOff(this.cx, {
          '=s': function (sup, context, string) {
            context += '! '
            // Given "foocx" and "str", fetch "foocx! str", else "str".
            return this._strings.has(context + string)
              ? this._strings.get(context + string)
              : (this._strings.has(string) ? this._strings.get(string)
                  : sup(this, arguments))
          },
        })
      },
    },

    // Adds strings to own list of translations.
    //> strings object `[{from: "to"}`], Map, `#Strings
    //= this
    append: function (strings) {
      var set = Common.m(this._strings.set, '21', this._strings)

      if (strings instanceof this.constructor) {
        strings._strings.forEach(set)
      } else if (strings.forEach instanceof Function) {
        strings.forEach(set)
      } else {
        _.each(strings, set)
      }

      return this
    },
  })
})