define(['nodash/main', 'nodash/extra', 'sqimitive/main', 'sqimitive/async'], function (NoDash, NoDashExtra, Sqimitive, Async) {
  "use strict"

  var _ = NoDash.extend({}, NoDash, NoDashExtra)

  Async.Fetch.defaultFunction = _.ajax

  var FetchAsync = Async.Fetch.extend('HeroWO.Sqimitive.Async.Fetch', {
    _opt: {
      headers: {},    // don't require preflight request for CORS
    },
  })

  //! +cl=Common
  //
  // Collection of base library classes and utility functions used throughout
  // HeroWO.
  var Common = {
    // HeroWO engine version.
    VERSION: '0.9',
    // Save and replay file format.
    SAVE_VERSION: 1,
    // NoDash utility function collection.
    _: _,
    // Base framework class for non-DOM objects.
    Sqimitive: Sqimitive.Base.extend(),
    // Represents an asynchronous process.
    Async: Async.extend('HeroWO.Sqimitive.Async', {
      _childClass: Async,

      _initToOpt: {
        owning: '._owning',
      },
    }),
    // Performs asynchronous loading of a generic remote resource.
    FetchAsync: FetchAsync,
    // Performs asynchronous loading of a remote JSON resource.
    JsonAsync: FetchAsync.extend('HeroWO.Sqimitive.Async.JSON', {
      _opt: {
        dataType: 'json',
      },
    }),
    // Stub (no-op) method for marking potential events and abstract methods.
    stub: Sqimitive.Core.stub,
    // Creates a proxy function to call another function with reordered arguments.
    m: Sqimitive.Core.masker,
    // Creates a function to call a method by name on run-time, possibly `#m'asked.
    ef: Sqimitive.Core.expandFunc,
    // Creates a function to retrieve a value of object's property given to it,
    // or call its method.
    p: Sqimitive.Core.picker,
    // Mix-in for enforcing array-like order on sqimitives.
    Ordered: Sqimitive.Ordered,

    // Mix-in for classes based on Sqimitive rather than HeroWO's base classes (like Common.Sqimitive above). See DOM.Common.jQuery for an example.
    BaseMixIn: {
      _wrapUndeclared: false,

      events: {
        nestEx: function (res) {
          res.changed && this.nestExNew(res)
        },

        '-autoOff': function (sqim, events) {
          if (arguments.length >= 2 && events !== true &&
              (!this._autoOff || !this._autoOff.has(sqim))) {
            // Allow garbage collection of sqim even if this remains alive.
            // Very useful for Transition-s.
            sqim.on('1^remove', function () { this.autoOff(sqim) }, this)
          }
        },

        remove: 'autoOff-',
      },

      nestExNew: Sqimitive.Core.stub,
    },

    // Removes event listeners.
    //
    //?`[
    // off(null)
    // off([])
    //
    // off([ev1, ev2, ...])
    //
    // off([sqim, ev])
    // off([evtgt, 'click', func])
    // `]
    //
    // items can be null or [] to not do anything (can be useful when maintaining a
    // large array where items can be removed without having to splice() and
    // shift array members when some objects are unhooked,
    // e.g. as in RPC).
    //
    // Note: all forms mutate input arrays to avoid re-off'ing the same hooks.
    off: function (items) {
      if (items && items.length) {
        if (_.isArray(items[0])) {
          _.each(items.splice(0), Common.off)
        } else {
          items[0].off.apply(items.shift(), items.splice(0))
        }
      }
    },

    // Returns the inverted value. Useful for callbacks.
    not: function (value) {
      return !value
    },

    // Returns a function that takes a number and returns it adjusted by delta.
    inc: function (delta) {
      return function (value) {
        return value + (delta == null ? 1 : +delta)
      }
    },

    // Returns a function that takes an array or falsy (= []) and returns it plus all concat()'s arguments.
    concat: function () {
      var values = arguments
      return function (value) {
        return Array.prototype.concat.apply(value || [], values)
      }
    },

    // Returns the value as string (falsy = ''). Used for `'+normalize_OPT.
    normStr: function ($, value) {
      return (value || '') + ''
    },

    // Returns the value as number (possibly `'NaN). Used for `'+normalize_OPT.
    normInt: function ($, value) {
      return parseInt(value)
    },

    // Returns the value as number (`'def in case of `'NaN). Used for `'+normalize_OPT.
    normIntOr: function (def) {
      return function normIntOr($, value) {
        value = parseInt(value)
        return isNaN(value) ? def : value
      }
    },

    // Returns the value as boolean. Used for `'+normalize_OPT.
    normBool: function ($, value) {
      return !!value
    },

    // Compares two arrays (new and existing `'_opt values) to avoid triggering
    // `'change events if they consist of the same strings.
    //> value array new provisionary value
    //> getter callback returning current (old) value
    //> glue missing `'\f
    //= array same as `'value`, array same as `'getter's result`,
    //  null if `'value is falsy
    // This assumes members when converted to strings cannot contain `'glue.
    normArrayCompare: function (value, getter, glue) {
      var old
      if (glue == null) { glue = '\f' }
      // Return current value so that change events are not fired (isEqual()).
      return (value && (old = getter()) && value.join(glue) == old.join(glue)) ? old : (value || null)
    },

    // Similar to `#normArrayCompare() but treats array members as integers.
    normIntArrayCompare: function (value, getter) {
      value = value && value.map(function (v) { return parseInt(v) })
      return Common.normArrayCompare(value, getter)
    },

    // Compares two objects where own keys and values are integers.
    normIntObjectCompare: function (value, getter) {
      function toArray(value) {
        return value && _.keys(value)
          .sort(function (a, b) { return +a - +b })
          .map(function (k) { return [+k, +value[k]] })
      }
      var arrayValue = toArray(value)
      var old, arrayOld
      var norm = Common.normArrayCompare(arrayValue, function () {
        return arrayOld = toArray(old = getter())
      })
      return norm == arrayValue ? value : (norm == arrayOld ? old : norm)
    },

    // Returns -1, +1 or 0 if `[a < b`], `[a > b`] or else.
    //
    // You can compare numbers by simply `[Math.sign(a - b)`]. `'sign() is not
    // required for standard functions like `[Array.sort()`] but remember 'sort()
    // compares by string form so `#compare() is needed to properly sort an array
    // of numbers.
    compare: function (a, b) {
      return a > b ? +1 : (a < b ? -1 : 0)
    },

    // Restricts `'n to be between `'min and `'max.
    //> n integer`, float`, string.
    //> min `- should be <= `'max but this isn't checked
    //> max
    //= type of `'n, `'min or `'max
    clamp: function (n, min, max) {
      n = +n
      return n > max ? max : (n < min ? min : n)
    },

    // Converts first character in `'s to upper case.
    capitalize: function (s) {
      s += ''
      return s[0].toUpperCase() + s.substr(1)
    },

    // Creates a tailored binary search function based on `@sq@Ordered::indexFor()`@.
    //> args missing `'value`, string list of returned function's arguments
    //> cmp string `- JS code snippet whose result is -1/0/+1; compares `[array[mid]`] (a member in `'array) with `'args (e.g. `'value)
    //= function taking `'array and `'args, returning position in `'array
    indexFor: function (args, cmp) {
      // XXX=R copy/paste of Sqimitive.Ordered.staticProps.indexFor(); could use toString() + replace() but that won't work when minified due to name mangling
      return new Function('array, ' + (args || 'value') + ', oldIndex', [
        'var high = array.length - (array.length - 1 == oldIndex)',
        'for (var low = 0, rel = 1; low < high && rel; ) {',
        '  var mid = low + high >>> 1',
        '  rel = ' + cmp,
        '  rel > 0 ? high = mid : low = mid + 1',
        '}',
        'return low',
      ].join('\n'))
    },

    // Calls `'func for every spot within `'radius of (`'cx;`'cy), in arbitrary order.
    //> cx int `- center of the circle being iterated over
    //> cy int
    //> radius int 0+`, falsy = 0 `- if 0, calls `'func just once, giving it
    //  `'cx/`'cy
    //> maxX int `- inclusive; `'func isn't called if any spot's coordinate
    //  is < 0 or its X (Y) is >= `'maxX (`'maxY)
    //> maxY int
    //> func `- receives `'x and `'y; result is ignored
    //> context `- the `'this for `'func
    // Use `#diffCircles() to compare two circles' coverages.
    //?`[
    //    var sz = 9
    //    var map = Array.from(Array(sz * sz)).map(v => '.')
    //    withinCircle(sz/2 | 0, sz/2 | 0, 3, sz-1, sz-1, (x, y) => map[x + y * sz] = '#')
    //    while (a.length) { console.log(map.splice(0, sz).join('')) }
    //
    //    /*
    //      .........
    //      ....#....
    //      ..#####..
    //      ..#####..
    //      .#######.
    //      ..#####..
    //      ..#####..
    //      ....#....
    //      .........
    //    */
    // `]
    withinCircle: function (cx, cy, radius, maxX, maxY, func, context) {
      if (!radius) {
        return func.call(context, cx, cy)
      }

      var y = Math.max(0, cy - radius)
      var dy = y - cy
      var y1 = Math.min(maxY, cy + radius)
      var r2 = radius * radius

      for (; y <= y1; y++, dy++) {
        var dy2 = dy * dy
        func.call(context, cx, y)

        for (var x, dx = 1; dx * dx + dy2 <= r2; dx++) {
          if (!(((x = cx - dx) >= 0    && (func.call(context, x, y), 1)) |
                ((x = cx + dx) <= maxX && (func.call(context, x, y), 1)))) {
            break
          }
        }
      }
    },

    // Calls `'onlyWithin2 for every spot covered by the 2nd circle but not
    // the 1st, and vice versa for `'onlyWithin1, in arbitrary order.
    //> cx1 int `- center of the first circle which coverage is being compared
    //> cy1 int
    //> r1 int `- radius of the first circle
    //> cx2 int `- center of the second circle
    //> cy2 int
    //> r2 int `- radius of the second circle
    //> maxX int `- inclusive; functions are not called if any spot's
    //  coordinate is < 0 or its X (Y) is >= `'maxX (`'maxY)
    //> maxY int
    //> onlyWithin2 `- receives `'x and `'y; result is ignored
    //> onlyWithin1
    //> context `- the `'this for both functions
    // Warning: X coordinates should be below 65536 (`'0x10000),
    // Y - below 32768 (`'0x8000).
    //?`[
    //    var sz = 9
    //    var map = Array.from(Array(sz * sz)).map(v => '.')
    //    withinCircle(sz/2-1 | 0, sz/2-1 | 0, 3, sz-1, sz-1, (x, y) => map[x + y * sz] = '#')
    //    diffCircles(
    //      sz/2-1 | 0, sz/2-1 | 0, 3,
    //      sz/2+1 | 0, sz/2+1 | 0, 3,
    //      sz-1, sz-1,
    //      (x, y) => map[x + y * sz] = '2',
    //      (x, y) => map[x + y * sz] = '1'
    //    )
    //    while (a.length) { console.log(map.splice(0, sz).join('')) }
    //
    //    /*
    //      ...1.....     (1) onlyWithin1
    //      .11111...     (2) onlyWithin2
    //      .1111#...     (#) intersection (none of onlyWithin1/2 called)
    //      111####2.
    //      .11###22.
    //      .1####222
    //      ...#2222.
    //      ...22222.
    //      .....2...
    //    */
    // `]
    diffCircles: function (cx1, cy1, r1, cx2, cy2, r2, maxX, maxY,
        onlyWithin2, onlyWithin1, context) {
      var gone = new Set

      Common.withinCircle(
        cx1, cy1, r1,
        maxX, maxY,
        function (x, y) {
          gone.add(x | y << 16)
        },
        this
      )

      Common.withinCircle(
        cx2, cy2, r2,
        maxX, maxY,
        function (x, y) {
          var n = x | y << 16
          gone.delete(n) || onlyWithin2.call(context, x, y)
        },
        this
      )

      gone.forEach(function (n) {
        onlyWithin1.call(context, n & 0xFFFF, n >>> 16)
      })
    },

    // Expands parameters for `'addModule() methods in various classes.
    //
    //= object = options
    //
    //> options object `- mutated; keys:
    //  `> key missing = ''`, str, mixed cast to str `- special: `''' = `'_defaultKey (`'_cid),
    //     `''-' = `[cls.name`] (resolved by this method; use for well-known/singleton modules)
    //  `> keyFunc missing`, function `- receives `[sqim, container.modules`],
    //     returns str; should be free of side effects (can be called multiple
    //     times, e.g. by Bits.Base's `'sinkOpt)
    //  `> cls object class
    //  `> options missing = {}`, object `- well-known keys:
    //     `> pos `- for `'Ordered `'listIn `'Module
    //     `> withinWindow `- for `[DOM.Windows`]
    //     `> context `- for `'ContextModule
    //     `> screen `- for `'ScreenModule
    //     `> attachPath null set to `[listIn.el`] if available and `[listIn._orderedParent`] is not`, mixed for `'jQuery
    //  `> args missing`, object array-like `- possible forms:
    //     `> simple `[[key,] cls [,options]`]; override
    //        `'options keys; `'key becomes `'listInKey if `'listIn is set
    //     `> advanced `[options`]; concats with `'init and `'options,
    //        overrides any other `'options key
    //  `> type missing don't check`, str to test Module.module
    //  `> listIn missing if nested to ModuleContainer`, object Module
    //  `> listInKey str `- same format as `'key but 2nd argument is `'listIn
    //  `> listInKeyFunc `- same format as `'keyFunc
    //  `> init missing = []`, array of function `- receive new instance; called before
    //     `'owned (hook new instance's `'attach, etc. to react to later events)
    expandAddModule: function (options) {
      options.init || (options.init = [])
      options.options || (options.options = {})

      var args = _.toArray(options.args || [])
      if (args[0] && args[0]._expanded == _) {
        args[0].init = options.init.concat(args[0].init || [])
        args[0].options = _.extend(options.options, args[0].options)
        _.extend(options, args[0])
      } else {
        options._expanded = _
        if (typeof args[0] != 'function' && args.length) {
          options.listIn ? options.listInKey = args.shift()
                         : options.key = args.shift()
        }
        if (args.length) {
          options.cls = args.shift()
          options.options = _.extend(options.options, args.shift())
        }
      }

      if (!options.cls) {
        throw new Error('Missing module class.')
      } else if (options.type && options.cls.module != options.type) {
        throw new Error('Incompatible module: ' + options.cls.module)
      }

      function setUpKey(prop, parent) {
        var key = options[prop] == null ? '' : (options[prop] + '')
        if (key == '-') {
          key = options.cls.name
        }
        options[prop] = key
        options[prop + 'Func'] = function (sqim, parent) {
          return key == '' ? parent._defaultKey(sqim) : key
        }
      }

      setUpKey('key')

      if (options.listIn) {
        setUpKey('listInKey')

        if (options.options.attachPath == null) {
          // DOM.Common.Ordered inserts new module's el before we call
          // attach() so no need to move el around manually.
          options.options.attachPath =
            options.listIn._orderedParent ? '' : options.listIn.el
        }
      }

      return options
    },

    // Returns the closest exponent of 2 which when raised is >= `'num.
    //
    //?`[
    //    powerOf2(1)   //=> 0
    //    powerOf2(2)   //=> 1
    //    powerOf2(9)   //=> 4
    // `]
    powerOf2: function (num) {
      return Math.ceil(Math.log2(num))
    },

    // Manipulates string of comma-separated items.
    //?`[
    // alterStringifiedArray('1,2,3')                     //=> [1, 2, 3]
    // alterStringifiedArray('1,2,3', 1)                  //=> '1,,3'
    // alterStringifiedArray('1,2,3', 1, 'z')             //=> '1,z,3'
    // alterStringifiedArray(false, 1, 'z')               //=> false
    // alterStringifiedArray('1,2,3', 1, s => s + 'z')    //=> '1,2z,3'
    // `]
    alterStringifiedArray: function (s, i, f) {
      if (s !== false) {    // no value in ObjectStore; e.g. AObject->$animation
        s = s.split(',')
        if (i != null) {
          s[i] = typeof f == 'function' ? f(s[i]) : f == null ? '' : f
          s = s.join()
        }
      }
      return s
    },

    // Returns a function that calls `'func only once per batch. See `@sq@Core::batchGuard()`@.
    batchGuard: function (index, func, options) {
      if (typeof index == 'string') {
        var events = {
          oc_: 5,       // ObjectStore ochange:
          oc:  5,       //   function (n, l, prop, now, old, options)
          oa_: 3,       // ObjectStore oadd:
          oa:  3,       //   function (n, l, props, options)
          or_: 3,       // ObjectStore oremove:
          or:  3,       //   function (n, l, props, options)
          sc:  1,       // Shroud changes: function (changes, options)
        }
        var match = index.match(/^([.+=]*)(o[car]_?|sc)$/)
        if (match) {
          index = match[1].length + events[match[2]]
        }
      }
      return Sqimitive.Core.batchGuard(index, func, options)
    },
  }

  Common.Async.mixIn(Common.BaseMixIn)
  Common.JsonAsync.mixIn(Common.BaseMixIn)
  Common.Sqimitive.mixIn(Common.BaseMixIn)

  // For RPC.Common.Serializable.
  Common.Sqimitive._mergeProps.push('unser')

  var oldRandom = _.random
  var seed = oldRandom(0x7FFFFFFF)
  var formatCache = new Map

  // Mutating NoDash to make shuffle() and others use the new random number generator. Should be safe even if external code uses it since we preserve its semantics.

  // Replacing Math.random() with a seedable pseudo random number generator.
  //
  // Unlike NoDash's `@no@random()`@ that is using `[Math.random()`],
  // HeroWO's `[_.random()`] uses a `#seed()'able `'mulberry32 implementation
  // from `@https://github.com/bryc/code/blob/master/jshash/PRNGs.md`@.
  //
  // The seed is global and is supposed to unpredictably change.
  // Use `#randomBySeed() if you need a predictable sequence.
  //
  // Call forms for `'random() are the same as in NoDash.
  _.random = NoDash.random = function () {
    if (arguments.length) {
      return oldRandom.apply(this, arguments)
    } else {
      var res = _.randomBySeed(seed)
      seed = res[0]
      return res[1]
    }
  }

  _.extend(_, {
    // Don't change on run-time.
    debug: false,

    //! `, +fna=function ([seed])
    // Gets or sets the seed number used by the next `'random() call.
    seed: function (change) {
      // This could be a field but it will stop function if Common is "extended"
      // (like DOM.Common) - changing _.seed = 123 in extended version won't
      // affect _.random() wheras function's context includes the shared variable.
      return arguments.length ? seed = change : seed
    },

    //! `, +fna=function (seed)
    // Takes a seed (number) and returns an array of new seed and random float
    // in range from 0 (inclusive) to 1 (exclusive).
    //
    // This is the actual PRNG backend used by `#random(). It doesn't depend on
    // the global seed. Given the same `'seed, result is always the same.
    //
    // Typical usage to obtain a number from 0 to `'max (exclusive) is to take
    // result's member 1, multiply it by `'max and call `[Math.floor()`] or
    // bit-or by 0 to remove the fractional part.
    //?`[
    //  alert(_.randomBySeed(123))        //=> [1831565936, 0.7872516233474016]
    //  alert(_.randomBySeed(1831565936)) //=> [-631835547, 0.1785435655619949]
    //  alert(_.randomBySeed(123)[1] * 3)       //=> 2.361754870042205
    //  alert(_.randomBySeed(123)[1] * 3 | 0)   //=> 2
    // `]
    //
    //# mulberry32
    // Credits: https://github.com/bryc/code/blob/master/jshash/PRNGs.md
    // From: https://stackoverflow.com/questions/521295/
    //
    // Another option would be Mersenne Twister but it's bigger:
    // https://github.com/pigulla/mersennetwister/
    // Which is based on: https://gist.github.com/banksean/300494
    randomBySeed: function mulberry32(seed) {
      seed = (seed | 0) + 0x6D2B79F5 | 0
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed)
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
      return [seed, ((t ^ t >>> 14) >>> 0) / 4294967296]
    },

    //! `, +fna=function ( [options,] str [, fmt[, ...]] )
    // NoDash's `'sprintf()-like `@nodash@format()`@ function, extended. Used by `#log().
    //
    //?`[
    //    _.format('Received message: %.20j', data)
    //      //=> 'Received message: {"jsonrpc": "2.0"...'
    // `]
    //
    // If using `[options.return`] of 2 (the default) and `'noCache is unset:
    //* if `'str doesn't contain `'% symbols then `'str is simply returned
    //* else it's compiled and transparently cached for efficiency
    //
    // Note: this may cause problems if you give the same `'str with a different
    // set of compile-time `'options - only the first (uncached) call's
    // `'options are used.
    //
    // Supported custom `'%specifiers:
    //> %j `- just like normal `'%s but preprocesses the argument with `[JSON.stringify()`];
    //  useful for logging complex values (but remember that JSON doesn't support `'Infinity, etc. and replaces them with `'null); use `'.p'recision to trim long values (as in the above example); mere `'. assumes 100 (like `'%.s: `'%.j)
    format: function (options, str) {
      if (!(options instanceof Object)) {
        str = options
        Array.prototype.unshift.call(arguments, options = {})
      }

      options.defaultPrecision || (options.defaultPrecision = {})
      options.defaultPrecision.j = 100

      options.specifiers || (options.specifiers = {})

      options.specifiers.j = options.specifiers.j || function (params, c) {
        return c.options.specifiers.s(params, c, 'JSON.stringify(c.next(' + params[2] + '))')
      }

      if ((options.return == null || options.return == 2) && !options.noCache) {
        if (str && str.indexOf('%') != -1) {
          var func = formatCache.get(str)
          if (!func) {
            options.return = 1
            formatCache.set(str, func = NoDashExtra.format(options, str))
          }
          str = func.apply(this, _.rest(arguments, 2 /*options, str*/))
        }
        return str
      } else {
        return NoDashExtra.format.apply(this, arguments)
      }
    },

    //! `, +fna=function ( msg [, ...fmt] )
    // Logs a message to browser's or server's console using `#format().
    //
    // ` `#log can be `'null if no console is available or one was disabled.
    // Because of this, call `#log like so: `[_.log && _.log('foo %s', ...)`] to remove
    // overhead of calculating arguments to `'log in such case. `[console.log()`] and the likes are quite slow.
    //
    //?`[
    //    _.log && _.log('%s: Now B00ted', 'J@red')
    // `]
    //
    // Note: `'msg is `#format'ted even without `'fmt arguments. `[log('100%')`]
    // is invalid and must be written as `[log('100%%')`].
    log: function (msg, arg_1) {
      // XXX+R: ll: Change "_.log && _.log(...)" paradigm to "_.L# && _.log(...)" where L# is a bunch of properties on _ (alike to _.debug) that toggle logging of specific channels (e.g. Map loading). This will also remove the need for oldLog() - log() will be always available.
      console && console.log(_.format.apply(this, arguments))
    },
  })

  // https://stackoverflow.com/questions/18638900/javascript-crc32
  /*
    function crc32Table() {
      var c
      var table = []
      for (var n = 0; n < 256; n++) {
        c = n
        for (var k = 0; k < 8; k++) {
          c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1))
        }
        table[n] = c
      }
      return table
    }
    var table = crc32Table()
  */
  var table = [0, 1996959894, -301047508, -1727442502, 124634137, 1886057615, -379345611, -1637575261, 249268274, 2044508324, -522852066, -1747789432, 162941995, 2125561021, -407360249, -1866523247, 498536548, 1789927666, -205950648, -2067906082, 450548861, 1843258603, -187386543, -2083289657, 325883990, 1684777152, -43845254, -1973040660, 335633487, 1661365465, -99664541, -1928851979, 997073096, 1281953886, -715111964, -1570279054, 1006888145, 1258607687, -770865667, -1526024853, 901097722, 1119000684, -608450090, -1396901568, 853044451, 1172266101, -589951537, -1412350631, 651767980, 1373503546, -925412992, -1076862698, 565507253, 1454621731, -809855591, -1195530993, 671266974, 1594198024, -972236366, -1324619484, 795835527, 1483230225, -1050600021, -1234817731, 1994146192, 31158534, -1731059524, -271249366, 1907459465, 112637215, -1614814043, -390540237, 2013776290, 251722036, -1777751922, -519137256, 2137656763, 141376813, -1855689577, -429695999, 1802195444, 476864866, -2056965928, -228458418, 1812370925, 453092731, -2113342271, -183516073, 1706088902, 314042704, -1950435094, -54949764, 1658658271, 366619977, -1932296973, -69972891, 1303535960, 984961486, -1547960204, -725929758, 1256170817, 1037604311, -1529756563, -740887301, 1131014506, 879679996, -1385723834, -631195440, 1141124467, 855842277, -1442165665, -586318647, 1342533948, 654459306, -1106571248, -921952122, 1466479909, 544179635, -1184443383, -832445281, 1591671054, 702138776, -1328506846, -942167884, 1504918807, 783551873, -1212326853, -1061524307, -306674912, -1698712650, 62317068, 1957810842, -355121351, -1647151185, 81470997, 1943803523, -480048366, -1805370492, 225274430, 2053790376, -468791541, -1828061283, 167816743, 2097651377, -267414716, -2029476910, 503444072, 1762050814, -144550051, -2140837941, 426522225, 1852507879, -19653770, -1982649376, 282753626, 1742555852, -105259153, -1900089351, 397917763, 1622183637, -690576408, -1580100738, 953729732, 1340076626, -776247311, -1497606297, 1068828381, 1219638859, -670225446, -1358292148, 906185462, 1090812512, -547295293, -1469587627, 829329135, 1181335161, -882789492, -1134132454, 628085408, 1382605366, -871598187, -1156888829, 570562233, 1426400815, -977650754, -1296233688, 733239954, 1555261956, -1026031705, -1244606671, 752459403, 1541320221, -1687895376, -328994266, 1969922972, 40735498, -1677130071, -351390145, 1913087877, 83908371, -1782625662, -491226604, 2075208622, 213261112, -1831694693, -438977011, 2094854071, 198958881, -2032938284, -237706686, 1759359992, 534414190, -2118248755, -155638181, 1873836001, 414664567, -2012718362, -15766928, 1711684554, 285281116, -1889165569, -127750551, 1634467795, 376229701, -1609899400, -686959890, 1308918612, 956543938, -1486412191, -799009033, 1231636301, 1047427035, -1362007478, -640263460, 1088359270, 936918000, -1447252397, -558129467, 1202900863, 817233897, -1111625188, -893730166, 1404277552, 615818150, -1160759803, -841546093, 1423857449, 601450431, -1285129682, -1000256840, 1567103746, 711928724, -1274298825, -1022587231, 1510334235, 755167117]

  // https://stackoverflow.com/questions/18638900/javascript-crc32
  //
  // CRC32 is not very well suited for checksumming strings but it's easy to
  // implement, doesn't require special support (like Crypt) and is fast and
  // available in many environments. This implementation matches PHP's crc32().
  // It uses only the lowest 8 bits of each symbol's code in str.
  //
  // Alternatives are BLAKE2s (https://github.com/dcposch/blakejs) and
  // MD5 (https://github.com/blueimp/JavaScript-MD5), both around 3 KiB minified. But
  // they work with numeric arrays so we'd have to convert already long
  // integrity strings or patch the sources.
  _.crc32 = function (str) {
    var crc = 0 ^ (-1)
    for (var i = 0; i < str.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ str.charCodeAt(i)) & 0xFF]
    }
    return (crc ^ (-1)) >>> 0
  }

  /* Mix-in declarations */

  //+cl=Common.ModuleContainer
  // Base mix-in for `#Context and `#Screen. Holds `#Module-s.
  Common.ModuleContainer = {
    // modules must be redefined by the class.
    staticProps: {modules: '?', trace: Common.stub},

    // Currently nested `#Module-s. See `#addModule().
    //#-ro
    modules: null,

    _unrendered: [],

    events: {
      init: function () {
        // Giving el so that modules with default attachPath get added to the container's el.
        this.modules = new Common.Sqimitive({el: this.el})
        this.modules.$ = this.$ && this.$.bind(this)  // for Sqimitive.jQuery
        Common.ModuleContainer.staticProps.trace(this)
      },

      '-unnest': function () {
        // Modules can have hooks on other objects. For example, Context nests
        // Screen and a ScreenModule has hooks on Context. If Screen is removed,
        // that module's hooks must be also removed.
        this.modules.invoke('remove')
      },

      // Calls `'attach() and `'render() on pending modules.
      //
      // `'attach() and `'render() only happen at the specific time but
      // Modules can be added at any point (even from within `'attach()
      // and `'render()). For this, `#addModule() accumulates
      // new members so that they are rendered when appropriate.
      render: function () {
        var list = this._unrendered
        var attach = 0
        for (var render = 0; render < list.length; render++) {
          if (_.log && attach < list.length) {
            // This shows which modules are attached/rendered as one group, i.e. first attach() occurs for all modules, then render(), in contrast with attach() occuring for module A, then render() for A, then attach() for B, render() for B, etc.
            _.log('ModuleContainer (%s) attaching %d modules : %s',
              this.constructor.name,
              list.length - attach,
              // Since Calculator.Effect doesn't rely on attach/render, grouping them under the same count for clarity.
              _.entries(_.countBy(list.slice(attach), function (m) { return m._subCalcDependingOn ? 'Calc.Effect' : m.constructor.name }))
                .sort(Common.compare)
                .map(function (i) { return i[0] + (i[1] > 1 ? ' * ' + i[1] : '') })
                .join(', '))
          }
          for (; attach < list.length; attach++) {
            // Checking for _parent to ensure the Module wasn't deleted before render.
            list[attach]._parent && list[attach].attach()
          }
          list[render]._parent && list[render].render()
        }
        this._unrendered.splice(0)
      },
    },

    // Propagates `'alterSchema to nested `#Module-s. See `#Context for details.
    alterSchema: function () {
      var args = arguments
      this.modules.each(function (m) { m.alterSchema.apply(m, args) })
    },

    // Internal method nesting a new `#Module. The class must define a public function on top of this.
    _addModule: function (o, defer) {
      var module = new o.cls(o.options)
      o.init && o.init.forEach(function (f) { f(module) })
      this.modules.nestEx({
        key: o.keyFunc(module, this.modules),
        child: module,
      })
      defer ? this._unrendered.push(module) : module.attach().render()
      return module
    },
  }

  // Module mix-in for object nested into any `#ModuleContainer.
  //
  // Most HeroWO implementation lives in modules, usually `#ScreenModule-s.
  //
  // It's important to respect the module's lifecycle:
  //* `'init - set properties on `'this, e.g. `[this._col = new Sqimitive`];
  //* `'owned - add modules to parents (and usually `'nest() them here); add
  //  hooks that have to be effective before `'attach
  //  (like `#Templates)
  //  to parents (`#Context/`#Screen, with `#autoOff()) or DOM nodes
  //  (`#autoOffNode()) -
  //  do not do this in `'init because `'addModule() will later call `'unnest,
  //  removing modules and hooks;
  //  `'queueLoading() asynchronous processes; core `#Map data is available (as `[this.cx.map`]) but module-specific may not be (e.g. `'shroud)
  //* `'alterSchema - Called on all modules after `#Map data was fully loaded, before starting to `'attach(), on master during initial map loading (new or saved game), hence available only for environment- and map-specific modules added in `'owned or earlier. This is the only place to mutate schemas of `#Map. Ensure not to mutate them again if it was already done (e.g. by another instance of this module in this Context, or before the game was saved). New property names must either begin with a "namespace" (unique prefix ending on an underscore: `[teamName_projectName_`]) or be anonymous (`'$prop, but you'll have to store them somewhere to retrieve after reload).
  //* `'attach - add event listeners to DOM nodes (`#autoOffNode()),
  //  sqimitives and modules (`#Map, `#Calculator, etc.; use `'autoOff() on shared modules; use `'autoOff() or `'fuse()/`'on() on
  //  modules exclusive to yours; `'autoOff() happens before removing children on removal of the parent thus preventing side effects, while other two trigger hooks even during removal); add mix-ins; add modules that depend
  //  on map info unavailable in `'owned; fetch `#shared and other frequently used data (`'atter(), `'n, etc.); before `'attach, do not store data that could be invalidated by changes in `#Map schemas (see implications of `'appendSchema())
  //* `'-render - populate `[this.el`] (possibly using `@Context.template()`@);
  //  `'-render is called before `'_update and while `'!rendered, `'render -
  //  after `'_update and when already `'rendered
  //* `'-unnest - remove event listeners other than `'autoOff()/`#autoOffNode()
  //  (those are removed automatically) but only when `'_parent is set; don't do this in response to `'remove
  //  because it isn't called sometimes (e.g. when doing `'addModule() with key
  //  already taken - that child is `'unnest'ed, not `'remove'd)
  //
  // All methods are called in the specified order. `'-unnest must be hooked in this form, not as `'unnest because during the latter `'_parent is already unset. `'alterSchema is called 0 (on slave or on master for late-added modules) or 1 (on master) times. `'init and `'owned are called exactly once. If `'attach gets called, it happens once, and then `'render is called, exactly once.
  //
  // `'alterSchema, `'attach and `'render are not called if module loading was aborted. This may happen for map-specific modules, if Context's `'screen change was cancelled, such as when user has joined a lobby game (`'game() was called and remained `'loading) but then decided to leave it (`'loading was never `'true), or when a server-side lobby Context was removed. This may also happen for specialized modules that may be removed at will (and their sub-modules, cascading), such as `@H3.PathCost`@ (caller can `'remove it without waiting for `'render to occur).
  //
  // `'unnest is called zero or more times. Order relative to other events is:
  //* `'unnest always happens after `'init
  //* once `'-unnest happens with a set `'_parent none of the
  //  following events occur anymore: `'owned, `'alterSchema, `'attach, `'render
  //* `'-unnest with a set `'_parent occurs either 0 or 1 times; again, it can occur many times with unset `'_parent (e.g. when called before `'owned)
  //* in the usual lifecycle, `'unnest is called once before `'owned and once after
  // `'render
  //* rule of thumb is to do nothing in `'unnest if `'_parent is unset
  //
  // The client must not call `'attach; if need to specify the parent for `'el,
  // give it as the `'attachPath option to `#addModule().
  //
  // For `#ContextModule and `#ScreenModule, `'attach and `'render are called
  // during `@Context.render()`@ or immediately, if the module is added after
  // the `#Context has rendered. An effort is made to call `'attach (in any order) on all unrendered modules before calling `'render (in any order) so that given two modules A and B where B is added by A during `'owned these calls take place in order: A.`'attach (or B.`'attach), B.`'attach (or A.`'attach), A.`'render (or B.`'render), B.`'render (or A.`'render). The order is similar if B is added by A during `'attach, except A.`'attach always occurs before B.`'attach. Modules added during a `'render have `'attach called (in any order) after that `'render returns.
  //
  // Grouping of `'attach/`'render calls can help with certain tasks although it complicates control flow and should be avoided. For example, it might be useful for optimizations (creating all DOM nodes in `'attach and then filling them in `'render). Or, if a `#ContextModule A's `'render has side effects in `#Map or other (as is the case with `@H3.Rules`@) and if another module B is added at the same time as A, B may set up hooks in `'attach and guarantee that they will be triggered by A.`'render unless loading a game (with already set values in `#Map). As such, the latter has limited usefulness since B still needs to trigger its logic after checking the actual values.
  //
  // Prior to `'attach, some `#Module properties (like `'map) are unset because the target
  // `#Context `'screen (like `'game) is not fully initialized. They are available from `'attach onwards.
  //
  // `#Module's `'alterSchema (start of `#Context's `'render) is called after fetching map
  // data (which is asynchronously done in `'owned). Remaining initialization starting with `'alterSchema is strictly
  // synchronous.
  //
  // Special method `'update is called zero or more times and in any order among
  // others. However, it calls `'_update only after `'render has been called.
  // `'render itself calls `'update in the end.
  //
  // If an `'_opt change affects `'el, use `[change_OPT: 'update'`]. This way,
  // changes prior to rendering are deferred (remember that options given to `'new
  // also trigger `'change during `'init), then `'render() populates `'el
  // according to the current `'_opt state and subsequent changes trigger
  // partial rendering via `'_update().
  //
  // If all rendering is simple then it can be done entirely in `'_update without
  // overriding `'render().
  //
  // You can also check for `[get('rendered')`] manually in such callbacks (value of `'1 indicates first-time `'render/`'_update, else `'false/`'true).
  //
  // Changes to data of `#Map and its objects (e.g. `'players and `'objects) must be done
  // from within `'alterSchema() or later, otherwise clients' data will become inconsistent
  // because `#RPC's hooks are added right before Context renders.
  //
  // If a module tracks `#Map changes (e.g. to maintain a single own child per every town), it should iterate over existing children (towns) in `'attach or `'render and set up hooks (e.g. `[this.autoOff(this.pl.towns, {...})`]) in the same place to reliably cover all objects. For example, see
  // `@DOM.Map`@ and `@Bits.ObjectList`@.
  //
  // XXX=R Previous rule was that Map doesn't change between first init and last render so it's possible to set up hooks in attach and iterate in render (like Bits.ObjectList does), but this is no longer correct and such old code (chiefly in DOM.Bits) should be updated.
  //
  // `#Module can produce "sub-modules". Each module is owned by a `#ModuleContainer
  // (such as `#Context or `#Screen), not the module that has produced it.
  // Children (`'nest()) of `#Module can be only other `#Module-s, not
  // unrelated classes (such as `@DOM.Slider`@) - these must be stored in `#Module's properties, possibly in a separate
  // `@Common.Sqimitive`@ collection.
  //
  // Submodules are automatically removed when `'this is removed and are
  // removed from `'this when removed from `#ModuleContainer. However, their
  // `'el can be attached to any point in DOM (by default it appends to
  // `#Module's `'el).
  //
  // This is how submodules are usually created:
  //[
  //   Common.jQuery.extend({
  //     mixIns: [Common.ScreenModule],
  //     _close: null,
  //
  //     events: {
  //       init: function () {
  //         this._close = this.addModule('close', Button, {
  //           attachPath: this.el,
  //           el: this.$('.foo'),
  //           el: {tag: 'li', className: 'bar'},
  //         })
  //
  //         this._close.on({clicked: ...})
  //       },
  //     },
  //   })
  //]
  Common.Module = {
    _owning: false,
    _childEvents: ['-unnest'],
    // Module-s usually inherit from Common.jQuery whose attach()
    // calls attach() of all children. However, Module's attach() must be only
    // called by ModuleContainer.
    _invokeAttach: false,
    _unnesting: [],

    //> attachPath `- defaults to `[.`] (unlike base `@Common.Sqimitive`@)
    //> rendered false `'render() not called yet`, int 1 `'render() called but
    //  `'update() is yet to return`, true `'render() and first `'update() done`,
    //  null after module was removed
    _opt: {
      attachPath: '.',
      rendered: false,
    },

    events: {
      '=render': function () {
        // =wrapping to disable inherited Common.Sqimitive.render() implementation
        // that does `[invoke('attach')`].
        this.getSet('rendered', function (cur) {
          if (cur !== false) {
            throw new Error('Module ' + this + ' rendering in invalid state.')
          }
          return 1
        })
        this.update()
        return this.set('rendered', true)
      },

      '=toString': function () {
        return this.constructor.name
      },

      '-nestEx': function (options) {
        if (!('module' in options.child.constructor)) {
          // This can cause various unexpected situations due to automatic
          // removal and prevention of attach()/render() propagation.
          throw new Error('Attempt to nest a non-Module into a Module.')
        }
        // instanceof ObjectStore.TakeRelease.
        if (typeof options.child.take == 'function') {
          // Don't do this because when this is removed, it removes all modules
          // it has nested and this is an error for modules like Calculators.
          throw new Error('Attempted to nest a shared module.')
        }
      },

      '-unnest': function () {
        if (this._parent) {
          this.autoOff()
          // Ignore subsequent update()-s.
          this.set('rendered', null)
          // Remove modules produced by this module.
          this.each(this.unlist, this)
        }
      },

      // When a child of this is removed, remove it from the ModuleContainer.
      //
      // The trick is that if it is called while the child is already being
      // removed from the ModuleContainer (because of our other hook on
      // .-unnest) we must not call remove(), otherwise -unnest with set _parent
      // will occur twice (first in response to child.unnest() before .-unnest
      // handling, second in response to unnested's remove(), violating Module
      // specification.
      //
      // To avoid this, we maintain list of in-removal children and skip remove()
      // if child is part of it.
      unnested: function (child) {
        var i = this._unnesting.indexOf(child)
        i == -1 ? child.remove() : this._unnesting.splice(i, 1)
      },

      // When a child of this is removed from the ModuleContainer, remove
      // it from this module.
      '.-unnest': function (child) {
        this._unnesting.push(child)
        this.unlist(child)
      },

      // Sets default options suitable for Module to allow quick and easy population of children based on a list of data.
      '=assignChildren': function (sup, data, options) {
        options || Array.prototype.splice.call(arguments, 2, 0, options = {})

        if (options.keyFunc) {
          // addModule() in newFunc below receives no key (= '') which stands for _defaultKey(). Using options.keyFunc in this case would result in the new Module being inserted second time into this (because of !_owning), under another key.
          //
          // This could be worked around by newFunc doing expandAddModule() on options and setting listInKeyFunc to options.keyFunc but calling expandAddModule() without the fields that addModule() itself adds may have unwanted side effects so this isn't implemented for now.
          throw new Error('Use _defaultKey() instead of options.keyFunc.')
        }

        options.newFunc = options.newFunc || function (options) {
          return this.addModule(this._childClass, options)
        }

        // By default unFunc = unlist() and it doesn't remove() child, just
        // unlists from this' children.
        options.unFunc = options.unFunc || Common.p('remove')

        // Used by Townscape.Tavern, Combat.Results.
        options.posFunc = options.posFunc || function ($, opt) {
          return opt.pos
        }

        return sup(this, arguments)
      },
    },

    // function (map)
    // See ModuleContainer.alterSchema().
    alterSchema: Common.stub,

    // Calls `#_update() if already `'rendered, else does nothing.
    //= this
    update: function () {
      this.get('rendered') && this._update()
      return this
    },

    // Place for custom module-specific update logic (changing `'el, etc.).
    //
    // Only called during/after `#render() (when the `'rendered `#_opt is set).
    _update: Common.stub,

    // function ([events,] cls[, options] | [events,] obj)
    //
    // Calls `#update() on self upon `'events in `'cls/`obj. Calls `#remove() on self upon
    // `'unnest. Restricts `'_update to be called only once the calculator is
    // `'rendered. If `'cls/`'obj is already `'rendered, immediately calls
    // `'update() on self.
    //
    //> events missing = `[['change_value']`]`, array of event names
    //> cls class a `#Calculator
    //> options `- only used if `'cls is a class, given to `@Context.calculator()`@
    //> obj object any `#Module instance
    //
    //= object `#Calculator, or at least `#Module
    updateOn: function (events, cls, options) {
      if (typeof events == 'function') {
        Array.prototype.unshift.call(arguments, events = ['change_value'])
      }

      var calc = arguments[1]

      if (calc.constructor == Function) {
        // XXX=R
        var cls = calc
        while (cls.__super__ && cls.name != 'HeroWO.Calculator') {
          if (cls.name == 'HeroWO.Calculator.Effect') {
            calc = this.cx.listeningEffectCalculator(_.extend({class: calc}, arguments[2]))
            break
          }
          cls = cls.__super__.constructor
        }
        if (calc == arguments[1]) {
          calc = this.cx.calculator(calc, arguments[2])
        }
      }

      events = _.fill(_.object(events), 'update')
      events.unnest = 'remove'
      calc = this.autoOff(calc, events)

      this.on('=update', function (sup) {
        return calc.get('rendered') ? sup(this, arguments) : this
      })

      calc.get('rendered') && this.update()
      return calc
    },

    // function ([events,] func [, cx])
    // Calls `'func immediately if `'this is `'rendered. Also calls it
    // whenever any of `'events happens.
    //> events missing = `['_update'`]`, string single event`, array `-
    //  if is `'render then just calls `'func once, immediately or on first render
    //> func `- receives no arguments if called immediately, else receives
    //  arguments given to the occurred `'events
    //> cx missing = `'this
    //= `'this if `'events is an array`, string off()'able event ID otherwise
    // Non-array `'events can be used together with `'autoOff():
    //[
    //   this.autoOff(this.cx.calculator('foo'), {})
    //     .whenRenders('change_value', ...)
    //]
    whenRenders: function (events, func, cx) {
      if (typeof events == 'function') {
        Array.prototype.unshift.call(arguments, events = '_update')
      }
      this.get('rendered') && arguments[1].call(arguments[2] || this)
      return _.isArray(events)
        ? this.on(_.fill(_.object(events), arguments[1]), arguments[2])
        : this.on(events, arguments[1], arguments[2])
    },

    // Expands parameters for public `'addModule() defined in this class.
    // See Common::expandAddModule() for details.
    expandAddModule: Common.expandAddModule,

    // Internal method nesting a new `#Module. The class must define a public function on top of this.
    _addModule: function (o, container) {
      // Remove the submodule before nesting it to container if nesting another submodule under the same key in self.
      //
      // Sqimitive automatically removes a child if another is nested under the same key. This may create unexpected side effects because submodules are owned by ModuleContainer, not their "real" parent, and are removed after a new submodule has been launched:
      //
      //  var module = Common.Sqimitive.extend({
      //    mixIns: [Common.ContextModule],
      //  })
      //
      //  module.addMOdule('sub', sub1)
      //
      //  module.addMOdule('sub', sub2)
      //    // 1. Module calls addModule() of its ModuleContainer (module._parent)
      //    //   2. ModuleContainer nests sub2 under a unique key; both sub1 and
      //    //      sub2 briefly co-exist
      //    // 2. Module nests sub2 to self
      //    //   3. Sqimitive's nextEx() unnests sub1 from self due to occupied key
      //    //   4. Module's 'unnested' hook calls remove() on sub1
      //    //   5. Then nestEx() adds sub2 to module
      //
      // This may create a problem if `'sub1 does some clean-up in `'-unnest, expecting the instance that's taking its place to start from scratch:
      //
      //  var Sub = Common.Sqimitive.extend({
      //    mixIns: [Common.ContextModule],
      //
      //    events: {
      //      render: function () {
      //        $('body').addClass('sub')
      //      },
      //
      //      '-unnest': function () {
      //        this._parent && $('body').removeClass('sub')
      //      },
      //    },
      //  })
      //
      //  module.addMOdule('sub', sub1 = new Sub)
      //    // 1. sub1: body.addClass('sub')
      //
      //  module.addMOdule('sub', sub1 = new Sub)
      //    // 1. sub2: body.addClass('sub')
      //    // 2. sub1: body.removeClass('sub')
      var key
      o.init.push(function (module) {
        key = o.listInKeyFunc(module, this)
        ;(module = this.nested(key)) && module.remove()
      }.bind(this))
      var module = container.addModule(o)
      // Checking because module could have removed self during attach or render.
      if (module._parent) {
        this.nestEx({
          key: key,
          child: module,
          pos: o.options.pos,
          withinWindow: o.options.withinWindow,
        })
        return module
      }
    },
  }

  // `#Module mix-in pluggable into a `#Context.
  Common.ContextModule = {
    staticProps: {module: 'context'},
    mixIns: [Common.Module],

    // References the parent `#Context.
    //##-ro
    cx: null,
    // Whether this `#Module survives `#Context `'screen changes. Affects `#delayRender.
    //= null let the client decide in `'new, false, true
    //##-ro
    persistent: null,
    // If unsetting, make sure own attach/render don't depend on potentially unavailable objects.
    //= true don't call attach/render until Context has finished loading`, call immediately after nesting the module `- if `'persistent, treated as always `'false
    delayRender: true,
    // References `#Map of the parent `#Context.
    //= `@Map.Indexed`@ same as `[this.cx.map`]`, null before `'attach() or when
    //  `'screen is not `'game
    //##-ro
    map: null,
    // References players on the `#map of the parent `#Context.
    //= `@Common.Sqimitive`@ with `@Map.Indexed.Player`@`, same as
    //  `[this.cx.map.players`]`, null before `#attach() or when
    //  `'screen is not `'game
    //#-ro
    players: null,

    _initToOpt: {
      context: '.cx',
      persistent: false,
    },

    events: {
      //! +ig +fn=constructor:opt
      // Possible `'opt keys:
      //> context `#Context `- required
      //> persistent `- only if module allows overriding
      //
      // Hooking -init allows using this.cx from change_OPT fired during _initToOpt assignment.
      '-init': function (opt) {
        if (this.persistent == null) {
          this.persistent = opt.persistent
        }
      },

      '-attach': function () {
        this.map = this.cx.map
        this.players = this.cx.map && this.cx.map.players
      },
    },

    // function ([key,] cls, options)
    // Adds a module to the parent `#cx (`@Context.addModule()`@) and to `'this.
    //> key string`, missing = `'_defaultKey(), `'_cid by default
    //> cls
    //> options missing/falsy, object `- adds `'attachPath of `[this.el`] if
    //  falsy and `'this has no `'_orderedParent; `'pos key can be used to specify `'Ordered position
    //= `#Module
    // Module's key in the parent `#cx is always unique (`'_cid).
    addModule: function (key, cls, options) {
      var o = this.expandAddModule({
        args: arguments,
        listIn: this,
      })
      return this._addModule(o, this.cx)
    },
  }

  // `#Module mix-in pluggable into a `#Screen.
  Common.ScreenModule = {
    staticProps: {module: 'screen'},
    mixIns: [Common.Module],

    cx: null,
    map: null,
    // References the parent `#Screen.
    //#-ro
    sc: null,
    // References the player of the parent `#Screen.
    //= `@Map.Indexed.Player`@`, same as `[this.sc.player`]`,
    //  null before `#attach()
    //#-ro
    pl: null,

    _initToOpt: {
      screen: '.sc',
    },

    events: {
      //! +ig +fn=constructor:opt
      // Possible `'opt keys:
      //> screen `#Screen `- required
      '-init': function (opt) {
        this.cx = opt.screen.cx
      },

      '-attach': function () {
        this.map = this.sc.map
        this.pl = this.sc.player
      },
    },

    // Adds a module to the parent (either `#sc or `#cx depending on `'cls) and to `'this.
    addModule: function (key, cls, options) {
      var o = this.expandAddModule({
        args: arguments,
        listIn: this,
      })
      return this._addModule(o, o.cls.module == 'screen' ? this.sc : this.cx)
    },
  }

  return Common
})