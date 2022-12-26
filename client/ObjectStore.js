define(['sqimitive/main'], function (Sqimitive) {
  "use strict"
  var _ = Sqimitive._

  // Works like splice() but receives items to insert as an array.
  function spliceArray(a, start, deleteCount, items) {
    var args = [start, deleteCount].concat(items)
    return Array.prototype.splice.apply(a, args)
  }

  // Compact storage for large number of objects organized into a 3D array.
  //
  // Identifier names used by convention:
  //* `'x/`'y/`'z - coordinates
  //* `'l - layer (depth)
  //* `'prop - property index (`#propertyIndex()) or property name
  //* `'n - contiguous index of `'x/`'y/`'z/`'prop combined (doesn't include `'l)
  //
  // Working with `#ObjectStore resembles programming in C: there are few
  // safety checks and it's very easy to break the store's integrity by passing
  // wrong values (for example, using contiguous number meant for one store in another
  // store).
  //
  // Use the included obst.php script to examine serialized store data, convert
  // it to JSON or regular array of key/values (objects), output as CSV, etc.
  //
  //[
  //  0 1 2   0 1 2     x
  // +-----+ +-----+
  // |a b c| |g h i| 0  y
  // |d e f| |j k l| 1
  // +-----+ +-----+
  //    0       1       z
  //
  // stride:  3 2
  // layers: [[a b c d e f g h i j k l]]
  //                           ^
  //                        (2;0;1)
  //                  2+0*3 +1*2 *3  = 8
  //                  x+y*sx+z*sy*sx
  //     max = (sx;sy;sz)
  //     sz = layers.length / sx/sz = 12/3/2 = 2
  //]
  //
  // ` `#ObjectStore is entirely separate from the rest of HeroWO codebase and
  // can be used on its own.
  //
  //# Volatility of `'l
  // If `#ObjectStore is used for read-only access, it preserves original order of
  // objects on one layer. If changing, it treats layer as an unordered collection
  // and freely reorders objects on the same coordinate. As such, previously
  // stored l values on same n should be discarded after oremove.
  //
  // Reorder is deterministic,
  // i.e. two identical `#ObjectStore-s will have same layer order after oremove
  // of the same object. HeroWO multi-player synchronization relies on this fact.
  //
  //# Sub-stores
  // It's possible to create sub-stores, i.e. array values that are themselves
  // compact `#ObjectStore data (consisting of `'layers only). This is recursive: sub-stores
  // can contain more sub-stores. Schema and stride are stored separately (schema
  // of all recursive sub-stores is usually part of the main `#ObjectStore while
  // stride is usually determined by properties stores elsewhere, e.g. an object's `'width/`'height).
  //
  // Non-`'read sub-store is slower than the main store because it has to dispatch all
  // change events to it, but it has negligible memory footprint
  // because its `'layers array is in fact the main store's value array.
  //
  // Internally, sub-stores (`#subAtContiguous() and prototypes of `#readSub()) are `'nest()'ed into
  // their parent but this is an implementation detail that should not be relied upon.
  //
  //# Empty store
  // ` `#ObjectStore can start empty, which is often found in 1D stores where X
  // is used as object ID and objects are added dynamically. "Emptiness" refers to
  // dimensions, not other properties (schema and sub-schemas must be
  // always provided, even if both are empty):
  //* With no layers at all `#size() has X/Y/Z = 0. Initial opt.layers = `[[]`].
  //  Using `'setAtContiguous/`'addAtContiguous/`'removeAtContiguous methods, as well as `'atContiguous/`'find/etc. is an error while `'append
  //  is allowed (`#readSub() is allowed but `'readSubAtContiguous is not because it calls `'atContiguous). This is called an *empty store* (`#isEmpty()).
  //* With one or more 0-length layers. `#size() is again 0 but opt.layer =
  //  `[[[], [], ...]`]. For an outside client of `'ObjectStore, this is identical
  //  to the first. This is also called an *empty store* (`#isEmpty()).
  //* With one or more non 0-length layers without members. Here, `#size() has X/Y/Z
  //  > 0. All methods are allowed. Because layers are not 0-length,
  //  this store is non-`#isEmpty but it is also non-`#hasObjects.
  //
  // Generally, `#ObjectStore is layout-agnostic (empty, 1D, 2D or 3D) and layout could
  // even change dynamically. However, for simplicity only 1D is allowed to change
  // size (X coordinate) and grow (via `'append). An empty store is treated
  // like 1D (e.g. by `'append) and has 1D optimizations applied.
  // HeroWO doesn't need growing 2D/3D stores and so this is not supported for now.
  //
  //# Events and batches
  // Being a Sqimitive, `#ObjectStore is extensively event-based. Three main
  // groups of events exist:
  //> oadd `- new object is added; `#addAtContiguous()
  //> ochange `- an existing object's property is changed; `#setAtContiguous()
  //> oremove an existing object is removed; `#removeAtContiguous()
  // Like with Sqimitive's `'change/`'change_OPT, these also fire more specific
  // "sub-events", like `'oadd_n_N.
  //
  // All object-related events are subject to Sqimitive `#batch()'ing. As with
  // `'change, `'options has `'batch, `'batchID and other keys (`#_batchOptions).
  var ObjectStore = Sqimitive.Base.extend('HeroWO.ObjectStore', {
    //! +ig
    // Sqimitive creates methods from events by default, so that adding a
    // hook on "foo" enables this.foo() to work as this.fire('foo') which blends
    // the difference between events and methods and is core to Sqimitive.
    // However, hooks on ObjectStore's "o"bject change events can get numerous
    // and they are never called as methods anyway, so disable this behaviour
    // for efficiency.
    _wrapUndeclared: false,
    _childClass: '',
    _schema: {},
    _schemaLength: 0, // 0 for empty schema
    _layers: [],  // [], [[]], [[], []], [[], [], []], etc. for empty store
    _layerLength: 0,  // 0 for empty store
    _maxLayer: -1,   // -1 if _layers is [], else >= 0; doesn't indicate isEmpty
    _strideX: 0,  // 0 for empty store
    _strideY: 0,  // 0 for empty store
    _strideXY: 0,  // simply _strideX * _strideY
    _strideZ: 0, // 0 for empty store
    _subSchemas: null,  // array, final null members optional
    _subStores: [],   // array l => object n => ObjectStore; subAtContiguous()
    _subStoresRO: [], // array prop => ObjectStore prototype; readSub()

    _opt: {
      optimize: null,   // can give to new, read (will only be true/false), change
    },

    _initToOpt: {
      schema: false,
      layers: false,
      sub: false,
      strideX: false,
      strideY: false,
      strideZ: false,
      optimize: false,
    },

    events: {
      //! +ig +fn=constructor:opt
      //
      // Possible `'opt keys (unless noted, all required and can't be changed after construction):
      //> schema object `- `[{prop1: 0, prop2: 1, prop3: 1}`] `- if empty `'{} then the only valid methods (at all!) are `#appendSchema() and `#schemaLength()
      //> sub array`, missing = `'[] `- sub-stores' schemas; members from 0 up to `[max(schema)`]
      //  are `'schema-s of those properties (0th member - of property at slot 0),
      //  members from `[max+1`] to `[max*2+1`] are `'sub for those properties,
      //  recursively; members for properties that are not sub-stores are `'undefined/`'null, others must be provided; sub-stores with empty schema must have `'{} for `'schema members and `'[] `'sub (the only valid usage for such sub-store is `#readSub() followed by `#appendSchema()); it's allowed to remove trailing `'null-s from this option
      //> layers array `- `[[ [o1p1, o1p2, o2p1, o2p2, ...], [false, o3p2, null, null] ]`] `- `'null indicates "no more objects at layer", `'false typically
      //  stands for "no value" (would use `'undefined but JSON doesn't support it);
      //  lengths of layers are adjusted after construction so they may
      //  be shorter if there are no objects in the end, to save space when
      //  serialized to JSON
      //> strideX integer 0 for empty store
      //> strideY integer 0 for empty store, 1 if not using Y and Z (1D array)
      //> strideZ integer 0 for empty store, 1 if not using Z (2D array)
      //> optimize missing = null`, null auto`, bool `- attempt to enable optimizations
      //  based on initial store features (schema length, etc.); `'null is currently equivalent to `'true;
      // `'false doesn't prevent optimization of sub-sub-stores when they're created, or later optimization of this store by changing this `'_opt
      //
      // Warning: passed values are not cloned. Clone manually
      // if planning to change `[opt.layers`], etc. on the outside.
      init: function (opt) {
        this._schema = opt.schema
        this._schemaLength = Math.max(0, _.max(this._schema) + 1) // max() returns -Infinity on empty schema
        this._layers = opt.layers
        this._maxLayer = this._layers.length - 1
        this._subSchemas = opt.sub || []

        if (opt.strideX) {
          this._extendBy(opt.strideX, opt.strideY, opt.strideZ)
        }

        while (this._subStores.length <= this._maxLayer) {
          this._subStores.push({})
        }

        this.set('optimize', opt.optimize)
      },

      '+normalize_optimize': function (res, value) {
        return value || value == null
      },

      change_optimize: function (now, old, options) {
        now ? this._optimize() : (old && this._deoptimize())
      },
    },

    // Returns an object compatible with `'opt of `#ObjectStore's `#constructor.
    //
    //= object `[{schema: {...}, sub: [...], strideX: 123, ...}`]
    //
    // Serialization is instant but arrays/objects inside the resulting object
    // should not be mutated. If needed, clone them before changing (but cloning
    // `'layers might be slow on a large store).
    //
    // ` `#ObjectStore is usually serialized to JSON - in this case it must not
    // contain `'Date and other unsupported types. If JSON is not a necessity,
    // `#ObjectStore can hold any type.
    serialize: function () {
      return {
        schema: this._schema,
        sub: this._subSchemas,
        strideX: this._strideX,
        strideY: this._strideY,
        strideZ: this._strideZ,
        layers: this._layers,
      }
    },

    // Returns text representation of current `#ObjectStore's content.
    //= string of arbitrary format
    //
    // Result is expected to be hashed for later comparison, not used for any
    // other purpose. It's not guaranteed to be unambiguous but only serve as a quick
    // way of determining if two stores are the same; certain differences in data may
    // produce the same result.
    //
    // ` `#contentHash() is used in HeroWO's multi-player integrity checks.
    //
    // Conveniently, `[Array.join()`] treats `'undefined and `'null the same
    // (like `#ObjectStore does). However, empty array is also the same. As
    // a result, hash of `[[[], []]`] will match that of `[[[[]]]`],
    // `[[[null`], Array(1)]`], etc.
    contentHash: function () {
      // toString() on _layers is quite faster than JSON.stringify().
      return this._layers.join('\f')
    },

    // Returns an object with broken-down dimensions of this store.
    //= object with `'x, `'y, `'z, `'layers keys (each is the maximum value + 1)
    size: function () {
      return {x: this._strideX, y: this._strideY, z: this._strideZ, layers: this._maxLayer + 1}
    },

    // Returns a copy of the schema this store is using.
    //= object with keys being properties and values being their indexes
    // ` `#schema() is useful if you need to get indexes of many properties at
    // once. Alternatively, see `#atter(), `#propertyIndex(), `#atCoords() and
    // others.
    schema: function () {
      return _.extend({}, this._schema)
    },

    // Returns length of a single object's entry in this store.
    //= 0 if schema is empty (see `#appendSchema())`, 1+ for normal store
    schemaLength: function () {
      return this._schemaLength
    },

    // Returns `'true if this store has 0x0x0 `#size.
    //
    // ` `#isEmpty doesn't check number of layers or members (see `#countObjects()). An empty `#ObjectStore
    // is one that disallows `'setAtContiguous and other methods, not one that has no members
    // in any of its slots (this can only be determined by iterating through the layers).
    isEmpty: function () {
      return this._strideX == 0
    },

    // Returns `'true if this store has ∀x1x1 `#size, or `#isEmpty.
    //
    // A 1D `#ObjectStore is one that allows calling the `'append() method and
    // has certain optimizations applied.
    is1D: function () {
      return this.isEmpty() || (this._strideY == 1 && this._strideZ == 1)
    },

    // Returns number of filled object slots by iterating through the
    // store (potentially slow).
    //
    //> layers true examine every layer`, false check only objects on the top layer (0th)
    //> max int`, missing Infinity `- return as soon as this number of objects was counted
    //= integer <= `'max
    // Use `#hasObjects() to determine if the store has any objects at all.
    countObjects: function (layers, max) {
      max = max || Infinity
      var res = 0
      for (var n = 0; n >= 0 && res < max; n = this.advance(n, +1)) {
        for (var value, l = 0; null != (value = this.atContiguous(n, l)) && (l == 0 || layers); l++) ;
        res += l
      }
      return res
    },

    // Determines if this store has any objects. A non-`#isEmpty() store may or may not have objects.
    //= bool
    // Use `#countObjects() to determine how many objects the store has.
    //
    // Speed of `#hasObject() depends on how close the first object
    // is to (0;0;0) and on the store's size if there's none.
    hasObjects: function () {
      return !!this.countObjects(false, 1)
    },

    // Determines position of property's value relative to start of object data in the store's layer.
    //
    //> prop - either already resolved to integer or a string name (must exist, not checked)
    //
    // ` `#propertyIndex() is used in other methods; numeric `'prop works
    // faster so pre-resolve property indexes when doing heavy calculations.
    //
    // There's no "propertyByIndex()" because multiple properties may live
    // on one index ("union").
    //
    //#optim
    // Do not manage this method using Sqimitive events, use traditional `'__super__ override.
    propertyIndex: function (prop) {
      return typeof prop == 'number' ? prop : this._schema[prop]
    },

    // Converts coordinates into a contiguous number according to this store's
    // configuration.
    //
    // COntiguous numbers are faster on access.
    //
    //#bounds
    // Unlike `#advance(), doesn't check if `'x/`'y/`'z/`'n are within the allowed
    // boundaries. If they are not, result is undefined (especially true if
    // optimizations are in place).
    //
    // XXX review and add missing "#-bounds".
    //
    //#-optim
    toContiguous: function (x, y, z, prop) {
      return (z * this._strideXY + y * this._strideX + x)
             * this._schemaLength + this.propertyIndex(prop)
    },

    // Breaks down a contiguous number into coordinates and `'prop index.
    //
    //#-bounds
    //#-optim
    fromContiguous: function (n) {
      var prop = n % this._schemaLength
      n = (n - prop) / this._schemaLength
      var x = n % this._strideX
      n = (n - x) / this._strideX
      var y = n % this._strideY
      n = (n - y) / this._strideY
      return {z: n, y: y, x: x, prop: prop}
    },

    // Breaks down a contiguous number into object's start `'n and `#propertyIndex.
    //
    // Similar to `#fromContiguous() but slightly faster.
    //
    //#-optim
    propertyFromContiguous: function (n) {
      var prop = n % this._schemaLength
      return [n - prop, prop]
    },

    //! +ig
    _deoptimize: function () {
      delete this.propertyIndex
      delete this.toContiguous
      delete this.fromContiguous
      delete this.propertyFromContiguous
      // When changing the list of functions, maintain #-optim in their documentation.
    },

    //! +ig
    _optimize: function () {
      if (this._schemaLength == 1) {
        this.propertyIndex = function () { return 0 }
      }

      // Optimize only 1D type of store since 2D/3D involve unavoidable
      // multiplications (for Y/Z).
      if (this.is1D()) {
        if (this._schemaLength == 1) {
          this._optimize1()
        } else {
          // https://stackoverflow.com/questions/30924280/
          var shift = Math.log2(this._schemaLength)
          if (shift % 1 === 0) {
            this._optimizeP2(shift, this._schemaLength - 1)
          }
        }
      }
    },

    //! +ig
    // Schema with a single property.
    _optimize1: function () {
      this.toContiguous = function (x) { return x }
      this.fromContiguous = function (n) { return {z: 0, y: 0, x: n, prop: 0} }
      this.propertyFromContiguous = function (n) { return [n, 0] }
    },

    //! +ig
    // Schema with the number of properties that is a power of 2.
    _optimizeP2: function (shift, mask) {
      this.toContiguous = new Function('x, y, z, prop',
        'return x << ' + shift + ' | this.propertyIndex(prop)')

      this.fromContiguous = new Function('n',
        'return {z: 0, y: 0, x: n >>> ' + shift + ', prop: n & ' + mask + '}')

      this.propertyFromContiguous = new Function('n',
        'return [n & ' + ~mask + ', n & ' + mask + ']')
    },

    // Returns contiguous number pointing to property of next object, or `'-1
    // in case there's no more objects.
    //
    // Wraps X/Y to the start of next Y/Z or end of the previous one.
    //
    // The caller must stop iterating when `#advance() returns a negative value.
    //
    //[
    // for (var n = toContiguous(1, 2, 3, 'foo'); n >= 0; n = advance(n, -2))
    //   for (var fooValue, l = 0; null != (fooValue = atContiguous(n, l)); l++)
    //     alert(fooValue)
    //]
    advance: function (n, by) {
      n += by * this._schemaLength
      return n >= this._layerLength ? -1 : n
    },

    // Calls `'func for every object within the given coordinate slice.
    //
    // Internally calls `#findAtContiguous(); see that method for `'func
    // invocation format.
    //
    // `'ex/`'ey/`'ez will be clamped if exceed max dimensions. Other boundaries
    // are not checked.
    //
    // Note: traversing is done in a snake-like manner: if `'sx is 2, `'ex is 3 and
    // `'sy is less than `'ey then `'func is called for `sx > 3 (assuming
    // this store's X dimensions is bigger than 3). Same if `'sz is less than `'ez. To
    // traverse a rectangular subset, check the passed `'x/`'y/`'z in `'func or use `#findWithinRect().
    //[
    //    y                                         Compare with:
    //  x 0 1 2 3 4   sx=2 sy=2 ex=3 ey=3           0 1 2 3 4
    //    1 - - - -   - func not called for cell    1 - - - -
    //    2 - # # #   # is called                   2 - # # -
    //    3 # # # -                                 3 - # # -
    //    4 - - - -                                 4 - - - -
    //]
    //
    // If need to retrieve multiple properties of the same object, give
    // `'prop = 0 and use the passed `'n:
    //[
    // var prop = propertyIndex('foo')
    // findWithin(..., 0, function (..., l, n) { atContiguous(n + prop, l) })
    //]
    findWithin: function (sx, sy, sz, ex, ey, ez, prop, func, cx) {
      if (ex > this._strideX - 1) { ex = this._strideX - 1 }
      if (ey > this._strideY - 1) { ey = this._strideY - 1 }
      if (ez > this._strideZ - 1) { ez = this._strideZ - 1 }
      for (var n = this.toContiguous(sx, sy, sz, prop);
           n >= 0;
           n = this.advance(n, +1)) {
        var value = this.findAtContiguous(n, func, cx, sx, sy, sz)
        if (value != null || (sx == ex && sy == ey && sz == ez)) {
          return value
        }
        if (this._strideX <= ++sx) {
          sx = 0
          if (this._strideY <= ++sy) {
            sy = 0
            sz++
          }
        }
      }
    },

    // Calls `'func for every object within the given coordinate rectangle.
    //
    // Internally calls `#findWithin() with a proxy that calls `'func only if received coordinates are inside the given rectangle.
    findWithinRect: function (sx, sy, sz, ex, ey, ez, prop, func, cx) {
      arguments[7] = function (value, x, y, z) {
        if (sx <= x && ex >= x && sy <= y && ey >= y && sz <= z && ez >= z) {
          return func.apply(this, arguments)
        }
      }
      return this.findWithin.apply(this, arguments)
    },

    // Calls `'func for every object at the given coordinate.
    //
    // Internally calls `#findWithin() with the equal start and end coordinates.
    findAtCoords: function (x, y, z, prop, func, cx) {
      return this.findWithin(x, y, z, x, y, z, prop, func, cx)
    },

    // Calls `'func for every object at the given spot by its contiguous number.
    //
    //> n
    //> func `- receives object property's value in this spot (which property is
    //  accessed depends on `'n), `'sx/`'sy/`'sz (as given to `#findAtContiguous();
    //  for methods like `#find() these are object's coordinates), `'l (level
    //  at `'n being read) and `'n itself (of the property, not object's start!)
    //
    //= mixed as returned by `'func
    //
    // ` `#findAtContiguous() reads all layers at `'n and returns as soon as
    // `'func returns non-`'null or there are no more levels.
    //
    // Alternatively, if `'func is non-`'Function then `#findAtContiguous()
    // returns `'l of the object whose property is `'=== to this value (i.e. the `'func). This shortcut is useful for `'removeAt...() + `'findAt...() combination, or with any `[find...()`] to see if a value appears anywhere in the search region (returned `'l is useless in this case, only check for it being `'undefined):
    //[
    //    store.removeAtCoords(1, 2, 3,
    //      store.findAtCoords(1, 2, 3, 'prop', 'value'))
    //
    //    var notFound = null == store.find('prop', 'value')
    //]
    //
    // The store can be changed from within `'func with one exception: `'removeAtContiguous
    // will cause unexpected results for the currently iterated `'l (i.e. `'func
    // may not be called for some objects or called twice for the same one).
    // It's fine to remove from another `'l or when there's only one object at `'l
    // (as it is the case for 1D store). Other methods (`'setAtContiguous, `'addAtContiguous, `#append)
    // are safe (but other code hooking `'ochange and others may incur the noted side effects).
    findAtContiguous: function (n, func, cx, sx, sy, sz) {
      for (var value, l = 0; null != (value = this.atContiguous(n, l)); l++) {
        if (func instanceof Function) {
          value = func.call(cx || this, value, sx, sy, sz, l, n)
          if (value != null) { return value }
        } else if (value === func) {
          return l
        }
      }
    },

    // Calls `'func for every object in the store.
    //
    // Internally calls `#findWithin().
    find: function (prop, func, cx) {
      return this.findWithin(0, 0, 0, Infinity, Infinity, Infinity, prop, func, cx)
    },

    // Returns value of the property of the object at given coordinates and level.
    atCoords: function (x, y, z, prop, l) {
      return this.atContiguous(this.toContiguous(x, y, z, prop), l)
    },

    // Returns value of the object's property by contiguous number and level.
    //
    // Returns `'null when there are no more objects at `'l and below.
    // `'n must be within boundaries.
    //
    // It is assumed that `'null/`'undefined are never used as values for any
    // schema properties.
    //
    // See also `#atter() which retrieves multiple properties at once.
    atContiguous: function (n, l) {
      return l > this._maxLayer ? null : this._layers[l][n]
    },

    // Determines if there is any object at the first level (or `'l) at given coordinates.
    anyAtCoords: function (x, y, z, l) {
      return this.atCoords(x, y, z, 0, l || 0) != null
    },

    // Determines if there is any object at the first level (or `'l) at given contiguous number.
    anyAtContiguous: function (n, l) {
      return this.atContiguous(n, l || 0) != null
    },

    // Determines how many objects are located at given coordinates.
    levelsAtCoords: function (x, y, z, startAt) {
      return this.levelsAtContiguous(this.toContiguous(x, y, z, 0), startAt)
    },

    // Determines how many objects are located at given spot by contiguous number.
    //
    // Returns index of the last filled layer plus 1, or 0 if there are no objects
    // at `'n.
    //
    // If it is known that there are at least N layers then giving N as
    // `'startAt will make the calculation faster. It is safe to give `'startAt
    // = (actual number of levels at `'n + 1) OR (max possible level in this store + 1) (in this case the
    // function determines `'startAt is free and returns it) but if the difference
    // is greater than 1 then the returned value will be incorrect.
    levelsAtContiguous: function (n, startAt) {
      for (var l = startAt || 0; this.atContiguous(n, l) != null; l++) ;
      return l
    },

    // Returns a function for convenient fetching of multiple object properties.
    //
    //> arg omitted pick all schema properties except `[_padding...`]`, array of property names`,
    //  string single property
    //> options object`, omitted `- keys:
    //  `> array bool `- if `'arg is an array, this changes return value of
    //     `'function from object to array (in order of `'arg), making it slightly faster; if fetching entire object, use the faster `#objectAtContiguous()
    //= function
    //
    // Returned function can be given either 1, 2 or 4 arguments: `[(props)`] (an array, suitable for resolving `'oadd or `'oremove events' `'props), `[(n, l)`] (`#atContiguous) or `[(x, y, z, l)`] (`#atCoords).
    //
    // Returned function returns a single value if `'arg is a string, else it returns an object with `'arg many properties, plus `'_n and `'_l, or an array. Multiple properties residing on the
    // same value (unions) have their values copied
    // to different object fields.
    //
    // Returned function only validates `'l, returning `'null if it's outside the boundaries.
    //
    // Additionally, the returned function itself has properties like `'...Index, one per each property being resolved.
    // This allows to avoid extra convertions from coords to `'n, at the same time
    // not bothering with calls to `#propertyIndex(). Example:
    //[
    //  var atter = store.atter(['foo', 'bar'])
    //  var n = store.fromCoords(x, y, z, 0)
    //  var obj = atter(n, l)    // {foo: val, bar: val}
    //  store.setAtContiguous(n + atter.fooIndex, l, 'newval')
    //]
    //  Another example:
    //[
    //  var atter = store.atter(['foo', 'bar'])
    //  on('ochange', function (n, l, prop) {
    //    if (prop == atter.fooIndex) {
    //      var obj = atter(n, l)
    //  // ...
    //]
    //
    // ` `#atter() compiles a function that directly accesses store data. Its performance should be comparable to `#propertyIndex(), `#atContiguous(), `#advance()
    // and others and might be even better if doing intensive
    // fetches or traversing since with that function it's all done in one call.
    atter: function (arg, options) {
      options = options || {}
      var unknown = _.reject(_.toArray(arg || []), _.has.bind(_, this._schema))

      if (unknown.length) {
        throw new Error('Unknown properties: ' + unknown)
      }

      if (options.array && !_.isArray(arg)) {
        throw new Error('options.array can be used with array arg only.')
      }

      function template() {
        switch (arguments.length) {
          default:
            throw new Error('Invalid number of arguments.')
          case 1:
            props_ = n
            n = 0
            break
          case 4:
            n = this.toContiguous(n, l, z, 0)
            l = l2
          case 2:
            if (l > this._maxLayer) { return }
            props_ = this._layers[l]
        }
      }

      // props_ is declared dynamically to make uglify think it's global and
      // cannot be dropped as unused or mangled.
      var code = ['var props_;', template.toString().replace(/[^{]+/,'')]

      if (typeof arg == 'string') {
        code.push('return props_[n + ' + this.propertyIndex(arg) + ']')
      } else if (!options.array) {
        code.push('return {')
        code.push('_n: n, _l: l,')

        var props = arg ? _.pick(this._schema, arg, _.forceObject)
          : _.reject(this._schema, function ($, prop) {
              return _.startsWith(prop, '_padding')
            }, _.forceObject)

        _.entries(props)
          // Read nearby array members together.
          .sort(function (a, b) { return a[1] - b[1] })
          .forEach(function (item) {
            code.push(JSON.stringify(item[0]) + ': props_[n + ' + item[1] + '],')
          })

        code.push('}')
      } else {
        var props = arg.map(this.propertyIndex, this)

        if (props.length > 1 &&
            !isNaN(props.reduce(function (c, p) { return p == ++c ? c : NaN }))) {
          var end = props.pop() + 1
          code.push('return props_.slice(n + ' + props[0] + ', n + ' + end + ')')
        } else {
          code.push('return [')
          _.each(props, function (p) { code.push('props_[n + ' + p + '],') })
          code.push(']')
        }
      }

      var func = (new Function('n, l, z, l2', code.join('\n'))).bind(this)

      var name = 'atter_' + _.toArray(arg).join('_').substr(0, 25)
      Object.defineProperty(func, 'name', {value: name})

      _.each(_.toArray(arg), function (prop) {
        func[prop + 'Index'] = this.propertyIndex(prop)
      }, this)

      return func
    },

    // Returns an array in `'schema format representing a complete object located
    // at given coordinates.
    objectAtCoords: function (x, y, z, l) {
      return this.objectAtContiguous(this.toContiguous(x, y, z, 0), l)
    },

    // Returns an array in `'schema format representing a complete object located at given contiguous number.
    //
    //= array
    //
    // Result of `#objectAtContiguous can be directly given to `'addAtContiguous or
    // `#append if schema of the store where this method is called matches schema
    // of the store receiving the new object.
    //
    // See also `#atter which retrieves an object as a JavaScript object.
    objectAtContiguous: function (n, l) {
      return l > this._maxLayer ? null : this._layers[l].slice(n, n + this._schemaLength)
    },

    // Very quick read-only accessor to a non-layered 1D sub-(sub-sub...)-store
    // residing at the given coordinates and level.
    readSubAtCoords: function (x, y, z, prop, l) {
      return this.readSub(prop, this.atCoords(x, y, z, prop, l))
    },

    // Very quick read-only accessor to a non-layered 1D sub-(sub-sub...)-store
    // residing at the `'n'th property in `'l.
    //
    //#-readSub
    //
    // Unlike `'subAtContiguous(), this returns a new `#ObjectStore instance every time.
    //
    // The main store doesn't hold references to the created read-only sub-stores.
    //
    // If the underlying object (at `'n/`'l) is removed or its value is replaced (via `'setAtContiguous on `'this), behaviour of the
    // returned instance is undefined. Listen to `'oremove_n_N/`'ochange_n_N on the main store (`'this)
    // to avoid this.
    //
    // Undefined behaviour also occurs if the underlying object is changed (by any means) in such a way that
    // any of the sub-store's `#size properties change (e.g. if `#append on `#subAtContiguous at the same `'n/`'l was called).
    // In other cases
    // the sub-store's `'layers is updated automatically. Any kind of changes in sub-sub-...-stores of this sub-store (via `#subAtContiguous() objects) are permitted and will likewise update its `'layers.
    //
    // No `'ochange/`'oadd/`'oremove
    // events on the changed member are emitted on this sub-store. Listen to
    // `'ochange_n_N on the main store or for the usual events on `#subAtContiguous() if needed.
    readSubAtContiguous: function (n, l) {
      var prop = this.propertyFromContiguous(n)[1]
      return this.readSub(prop, this.atContiguous(n, l))
    },

    // Very quick read-only accessor to a non-layered 1D sub-(sub-sub...)-store with explicitly provided data.
    //
    //> prop str`, int `- property whose (sub)schema is to be used for `'layer
    //> layer array`, null/undefined = `'[] `- direct layer's data (values of
    //  properties), not cloned (see `#readSubAtContiguous() for implications)
    //= ObjectStore `- limited, see below
    //
    // ` `#readSub() is convenient if `'layer data is not stored as a regular
    // property in this store - if it is then use `#readSubAtCoords or
    // `#readSubAtContiguous.
    //
    // Unlike `'subAtContiguous(), there is no need to call `'remove()/`'release() on the
    // result. `'readSubAtContiguous() creates just two new objects and sets up no new references
    // making it very easy on GC.
    //
    // Returned object allows `#propertyIndex(), `#atter(),
    // `#find() and all other methods that don't have side effects, including more `[readSub...()`].
    // The only allowed exception is `#appendSchema().
    // Do not call setAtContiguous() and similar!
    //
    // Do not access `'_cid (it is shared by other sub-stores but this is an internal detail).
    readSub: function (prop, layer) {
      prop = this.propertyIndex(prop)
      var store = this._subStoresRO[prop]
      if (!store) {
        // This object persists for the lifetime of the parent store. However,
        // external users (advanced) should listen for remove on __proto__ of readSub's result (similarly to
        // normal sub's remove) because it may be used in the future (see HeroWO's _hookWorld() for an example).
        store = this._subStoresRO[prop] = new this.constructor({
          schema: this._subSchemas[prop],
          sub: this._subSchemas[this._schemaLength + prop],
          strideX: 0,
          strideY: 0,
          strideZ: 0,
          layers: [[]],
        })
        this.nest(store)
        store.on({
          // The list of methods might not be exhaustive, it's just to catch
          // most common mistakes.
          '=setAtContiguous, =addAtContiguous, =removeAtContiguous, =_extendBy, =subAtContiguous, =remove, =release': function () {
            throw new Error('Disallowed operation for a read-only sub-store.')
          },
          '=_addSlotsUpstream': function (sup, undef, info) {
            info.push([prop, store._schemaLength])
            this._addSlotsUpstream(undef, info)
          },
        }, this)
      }
      if (!layer || !layer.length) {
        // Optimization: because readSub cannot be written to, if client gave empty layers then return the prototype itself since it is created as an empty store.
        return store
      }
      var context = function () {
        this._layers = [layer]
        this._layerLength = layer.length
        this._strideX = this._strideXY = layer.length / (this._schemaLength || -1)
        if (this._strideX % 1 !== 0) {
          throw new Error('Sub-store\'s length mismatches the schema.')
        }
        //this._subStoresRO = []    // shared
      }
      context.prototype = store
      return new context
    },

    // Returns `'true if `'prop is a sub-store (has an associated sub-schema).
    //> prop int`, str
    isSubProperty: function (prop) {
      return this._subSchemas[this.propertyIndex(prop)] != null
    },

    // Accessor to a sub-(sub-sub...)-store residing at the given coordinates.
    subAtCoords: function (x, y, z, prop, l, options) {
      return this.subAtContiguous(this.toContiguous(x, y, z, prop), l, options)
    },

    // Accessor to a sub-(sub-sub...)-store residing at the `'n property in `'l.
    //
    //> n
    //> l
    //> options object`, missing = `'{} `- possible keys (all optional):
    //  `> layered bool`, missing = false `- whether `'n's value is an
    //     array of layers or a "plain" array of layer data (values of objects'
    //     properties); non-layered sub-store disallows `'addAtContiguous() to a layer
    //     with an existing object (because new layers cannot be added in this mode)
    //  `> schema object`, missing take from this `#ObjectStore's `'sub for
    //     `'n's property index
    //  `> sub object`, missing same as `'schema
    //  `> strideX integer`, missing assume 1D, divide layer data by `'schema's length
    //  `> strideY integer`, missing = 1
    //  `> strideZ integer`, missing = 1
    //
    //  Sub-stores are usually used for plain 1D stores where `'layer data is padded to the number of objects and as such `'options
    //  can be omitted entirely.
    //
    // Do not call `#appendSchema() on the sub-store when it was given custom `'schema or any of its super-stores were given `'sub.
    //
    //= ObjectStore `- call `'release() when
    //  the sub-store is no longer needed (`'take() is called automatically by this method)
    //
    // Throws if there is no object at `'n/`'l or if they are out of boundaries.
    // If value at `'n (layer data) is `'false then it's treated as `'[] but remains
    // `'false until the sub-store is changed via `'addAtContiguous(). This allows more
    // efficient storage of many objects, most of which have empty sub-stores (= `'false).
    //
    // Returned instances are shared: if two clients request `#subAtContiguous
    // at the same `'n/`'l then a new `#ObjectStore is only created once and the same object is returned for both calls. When all clients
    // stop using it (call `'release()), the object is `'remove()'d.
    //
    // Note: `'options is only used if no sub-store is active for `'n/`'l yet.
    // Passing different options for the same `'n/`'l leads to undefined behaviour.
    //
    // While a sub-store instance is active:
    //* you can use it as a regular `#ObjectStore, including changing objects it contains
    //* it simulates property-wide `'ochange events for changes originating
    //  from the sub-store itself (`'setAtContiguous, `'addAtContiguous and others) so clients
    //  of the main store receive them
    //* simulated events' `'options is the same object given to the original
    //  event (can be mutated) and has `'sub set to the original
    //  sub-sub-...-store (to the result of `#subAtContiguous)
    //* the main store disallows changes to the property via its `'setAtContiguous
    //* if the object to which `'n belongs is removed (`'removeAtContiguous()), its sub-stores
    //  are automatically `'remove()'d (you can hook this event) and further method calls on them
    //  invoke undefined behaviour
    //
    // See also `#readSubAtContiguous() that provides a lightweight read-only accessor
    // without `'release() requirement and other implications of this method.
    subAtContiguous: function (n, l, options) {
      var store = this._subStores[l][n]

      if (!store) {
        options || (options = {})

        // Optimization: main store can have false in place of [] for empty
        // sub-stores (for efficiency reasons). An easy way would be to replace
        // false with [] when a sub-store was requested, but we defer this step
        // to when the store was changed (which can never happen). First ochange
        // still receives the original value (i.e. old can be false, not array).
        var lastValue = this.atContiguous(n, l)
        if (lastValue == null) {
          throw new Error('n or l is out of bounds or holds no object.')
        }
        // Note that it is not a copy and so `'this and `'store share the same array.
        // Thanks to this there's no need to specially sync them.
        options.layers = lastValue || []
        options.layered || (options.layers = [options.layers])
        var start = this.propertyFromContiguous(n)
        options.schema || (options.schema = this._subSchemas[start[1]])
        options.sub || (options.sub = this._subSchemas[this._schemaLength + start[1]])

        // Default to a 1D store.
        if (options.strideX == null) {
          options.strideX = options.layers[0].length / (_.max(options.schema) + 1)
          if (options.strideX % 1 !== 0) {
            throw new Error('Sub-store\'s length mismatches the schema.')
          }
        }

        options.strideY == null && (options.strideY = options.strideX ? 1 : 0)
        options.strideZ == null && (options.strideZ = options.strideX ? 1 : 0)
        store = this._subStores[l][n] = new this.constructor(options)
        this.nest(store)

        options.layered || store.fuse('=_addLayer', function () {
          throw new Error('Trying to extend a single-layered (sub)ObjectStore.')
        })

        // Below we're simulating ochange events on the parent store so listeners work
        // regardless of how the store is manipulated (via parent or via sub).
        //
        // One difficulty is that they must receive old (pre-set/add/remove)
        // value and this requires copying the entire value (layers). However,
        // sub-stores are typically very small (dozens of members)
        // so it should be fine, especially if browser employs CoW.
        //
        // Another difficulty is firing ochange-s within one batch on the main
        // store, if sub-store modifications are batched:
        //
        //    var sub = main.subAtContiguous(...)
        //    sub.batch(null, function () {
        //      sub.setAtContiguous(0, 0, 'p', 'v1')
        //      sub.setAtContiguous(0, 0, 'p', 'v2')
        //    })
        //      // main must fire two ochange in one batch
        //
        // The first problem (cloning) could be avoided in theory but in practice
        // reconstructing original value from oadd/ochange/oremove options.batch is tricky (especially preserving layer order after
        // removeAt...()), thus we're overriding the methods themselves rather than hooking those events.
        //
        // However, this means simulation doesn't work on parent's parent
        // (if we listen to set... on sub but fire ochange on main - main's parent's set... won't
        // be triggered as it listens for ochange). We also don't have batch info available via event
        // options. To combat this, the ultimate (closest) owner of the sub-store takes the role of notifying all super-stores (including self) and remembering old/new values (the batched variable below) until the sub's batch ends and events must be simulated. Internally, it bubbles 'subChange'
        // before calling the sub-store's set.../etc., bubbles 'subChanged' afterwards,
        // then adds
        // 'subBatched' to sub's batch (the same batch that sub has added the ochange/oadd/oremove to).
        // Once sub's batch ends, 'subBatched' fires on the parent which finally bubbles subSimulate
        // so that all super-stores (including the direct parent) can simulate ochange on themselves.
        var batched = {}

        store.on({
          '=setAtContiguous, =addAtContiguous, =removeAtContiguous, =extendTo': function (sup) {
            var args = arguments
            var funcOptions = sup.name[0] == 'e' ? {}   // extendTo(), no options
              : (arguments[3 + (sup.name[0] == 's')] || {})
            funcOptions.sub = store

            return store.batch(null, function (id) {
              var batch = batched[id] || (batched[id] = {id: id, old: [], now: [], count: 0, fired: 0})
              store.bubble('subChange', [batch], true)

              var res = sup(store, args)

              if (res == null) {  // nothing changed, roll back
                batch.old.pop()
                if (!batch.count) { delete batched[id] }
              } else {
                store.bubble('subChanged', [batch], true)
                batch.count++
                store._batch.push(['subBatched', funcOptions, batch])
              }

              return res
            })
          },

          // Fired up to the main instance (sub-store super-super-...-owner).
          subChange: function (batch) {
            batch.old.push(lastValue &&
              (options.layered ? _.invoke(lastValue, 'concat') : lastValue.concat()))
          },

          // Fired up to the main instance (sub-store super-super-...-owner).
          subChanged: function (batch) {
            // Read actually stored value to respect options.layered.
            batch.now.push(lastValue = this.atContiguous(n, l))
          },

          subBatched: function (funcOptions, batch) {
            // Fire accumulated simulated events all at once after last change event in
            // the sub-store. This changes the order of events (one might think main store's simulated ochange would fire after the sub-store's oadd/ochange/oremove) but the way batch() works makes it impossible. Besides, it's best not to rely on inter-sqimitive batch event order.
            if (++batch.fired == batch.count) {
              store.bubble('subSimulate', arguments, true)
              delete batched[batch.id]
            }
          },

          // Fired up to the main instance (sub-store super-super-...-owner).
          subSimulate: function (funcOptions, batch) {
            this.batch(null, function () {
              _.times(batch.count, function () {
                this._fire_ochange(5, [
                  start[0], l, start[1],
                  batch.now.shift(),
                  batch.old.shift(),
                  funcOptions,
                ])
              }, this)
            })
          },

          '=_addSlotsUpstream': function (sup, undef, info) {
            info.push([start[1], store._schemaLength, options.layered])
            this._addSlotsUpstream(undef, info)
          },
        }, this)

        // _extendBy() is called when a store ceases to be empty. If the main
        // store had no value yet (!lastValue), hook it and assign one as soon
        // as the sub-store changes (via append() or extendTo()). ochange on
        // the main store will be fired by the above hook.
        //
        // Only the immediate store's parent listens to this since it's
        // impossible to create a sub-store of a sub-store with empty layers.
        //
        // Note: _extendBy() is also called by the constructor in response to positive
        // _opt.strideX. For our purposes here, this is not considered a change:
        // ochange is not fired and _layers is not updated (the hook below isn't
        // fired because it's set up after the constructor returns).
        //
        // For example, creating an AObject with default (false) $artifacts
        // sub-store and ensuring it has 10 slots:
        //   var n = objects.append({artifacts: false})
        //   var sub = objects.subAtContiguous(n, 0)
        //   sub.extendTo(10 - 1)   // correct: updates objects._layers
        //   // Incorrect: only updates sub's _layers, not objects'.
        //   var sub = objects.subAtContiguous(n, 0, {strideX: 10 - 1})
        //   // Incorrect: 10 is n, not X.
        //   var n = objects.append({artifacts: Array(10)})
        //   // Correct:
        //   var n = objects.append({artifacts: Array(10 * objects.readSub('artifacts').schemaLength())})
        lastValue || store.once('_extendBy', function () {
          this._layers[l][n] = options.layered ? store._layers : store._layers[0]
        }, this)

        store.fuse('remove', function () {
          delete this._subStores[l][n]
          // Most methods access this property. Make it null so that they fail if
          // called and we can catch "use after free" bugs.
          store._layers = null
          // Remove references to allow GC'ing store.
          store._events = store._eventsByID = store._eventsByCx = null
        }, this)
      }

      return store.take()
    },

    //! +ig
    // Internal. Have to define these or bubble() won't work with _wrapUndeclared off.
    subChange: Sqimitive.Core.stub,
    subChanged: Sqimitive.Core.stub,
    subSimulate: Sqimitive.Core.stub,

    // Adds new properties to the schema.
    //
    //> addProps array add one after another`, object `[{prop: base index}`] - must not have gaps (not checked)
    //= object indexes of added properties
    //
    // ` `#appendSchema() is considered heavy because it checks and adds slots into every object's slice (for defined objects and not) recursively for every sub-store in all super-stores. Across sub-stores of this type in super-stores, `#appendSchema() invalidates previously:
    //* calculated contiguous `'n
    //* created `'readSub()-s
    //* created argument-less `'atter() (they will continue to return previous set of schema properties)
    //* `'n-based events (`'oadd_n_N, `'oremove_n_N, `'ochange_n_N) - an exception is thrown if any such listener exists
    //
    // If `#appendSchema() throws an exception, this store and/or other stores of this type have become inconsistent.
    //
    // `'addProps contains property names with special prefixes (removed from schema):
    //> . `- creates a sub-store; do `#readSub().`#appendSchema() to fill its properties
    //> $ `- creates a unique property with random name; rest of the key is for its key in `#appendSchema()'s result
    //
    // If `#schema() was originally empty, `#appendSchema() enables full usage of
    // `'this.
    //
    // To alter sub-...-store's schema, use `#readSub():
    //[
    //  main
    //    .readSub('subProp')
    //      .readSub('subSubProp')
    //        .appendSchema(...)
    //]
    //
    // ` `#subAtContiguous() also works like above unless the sub-store has no objects (preventing you from creating a normal sub-store).
    //
    // Creating new sub-sub-stores:
    //[
    //  main.appendSchema(['.subProp'])
    //  main.readSub('subProp').appendSchema('.subSubProp')
    //  // Note there's no dot when accessing subProp:
    //  main.propertyIndex('subProp')   //=> 11
    //  main.propertyIndex('.subProp')  //=> undefined
    //]
    //
    // "Anonymous" properties:
    //[
    //  main.appendSchema(['normal', '$anonymous', '.$anonSub'])
    //  main.propertyIndex('anonymous')   //=> undefined
    //  main.propertyIndex('$anonymous')  //=> undefined
    //
    //  var props = main.appendSchema({
    //    normal: 0, '$anonymous': 0,     // union.
    //    '.$anonSub': 1,
    //  })
    //    // props = {normal: 3, anonymous: 3, anonSub: 4}
    //    // main's schema = {..., normal: 3, A1: 3, A2: 4}
    //]
    appendSchema: function (addProps) {
      if (_.isArray(addProps)) {
        var len = addProps.length
        addProps = _.flip(addProps)
        if (_.size(addProps) != len) {
          throw new Error('Duplicate property names.')
        }
      }

      var addLength = _.max(addProps) + 1
      if (addLength == -Infinity) {
        throw new Error('No properties to add.')
      }

      // XXX=O an easy optimization would be possible: redefine _padding slots, if any; this will require no _layers shifting (but traversal is still needed to "zero them out", i.e. set values of former _padding slots to false or null)
      var slots = Array(addLength)

      if (this._subSchemas.length > this._schemaLength) {
        // Nulls at the end of _subSchemas can be truncated. If its length is
        // _schemaLength + 1, it means the first property slot is a sub-store
        // while other slots are not sub-stores (it's also possible nulls are not trimmed and all values in _subSchemas
        // are null but we don't care for this situation).
        // If it's that or longer, insert empty slots for new properties.
        spliceArray(this._subSchemas, this._schemaLength, 0, slots)
      }

      var res = {}

      _.each(addProps, function (index, prop) {
        var match = prop.match(/^(\.?)(\$?)(\w+)$/)
        if (!match) {
          throw new Error('Bad new property name: ' + prop)
        }

        var name = match[3]
        if (match[2]) {
          for (var i = 1; _.has(this._schema, name = 'A' + i++); ) ;
        } else if (_.has(this._schema, name)) {
          throw new Error('Property name already in use: ' + name)
        }

        // _padding properties could be overwritten instead of allocating new
        // slots but schema altering is chiefly used for sub-stores which are
        // not padded by default, i.e. most of the time.
        this._schema[name] = res[match[3]] = index += this._schemaLength

        if (match[1]) {
          this._subSchemas[index] = {}    // sub's schema
          this._subSchemas[this._schemaLength + addLength + index] = []   // sub's sub-schemas
        }
      }, this)

      // The above code updates objects (_schema and _subSchemas) meaning all related stores are simultaneously updated. Next thing is to update non-shared data: first we collect info on super-stores in a bubble() fashion, then we dig into each sub-...-store like sink().
      this._addSlotsUpstream(slots, [])

      return res
    },

    _addSlotsUpstream: function (undef, info) {
      var slots = _.fill(undef, false)

      if (!info.length) {
        // Empty info means appendSchema() was called on the root store. There are no readSub-s or sub-s to update.
        this._addSlots(slots, undef, this._schemaLength, this._layers, this)
      } else {
        this._addSlotsDownstream(this, this._layers, this._schemaLength, slots, undef, info)
      }
    },

/*
    // Here's some test case for incorporating into a test suite:

    var s = new ObjectStore({schema: {sp: 0}, sub: Array(2), layers: [[]]})
    s.AAA = 'main'
    s.append({sp:'SP1'})
    s.append({sp:'SP2'})
    s.appendSchema(['.ss'])
    s.append({sp:'SP3'})
    var ss=s.subAtCoords(0,0,0,'ss',0)
      ss.AAA = 'ss1'
    s.readSubAtCoords(0,0,0,'ss',0).__proto__.AAA = 'rss1'
      ss.appendSchema(['sssp','.sss'])
      ss.append({sssp:'SSSP1'})
      ss.append({sssp:'SSSP2'})
      var $sss=sss=ss.subAtCoords(0,0,0,'sss',0)
        sss.AAA = 'sss1'
        sss.appendSchema(['.ssss'])
        sss.append({})
        var ssss=sss.subAtCoords(0,0,0,'ssss',0)
          ssss.AAA = 'ssss1'
      var rsss1=ss.readSubAtCoords(0,0,0,'sss',0)
        rsss1.__proto__.AAA = 'rsss1'
      ss.subAtCoords(1,0,0,'sss',0).readSub(0).__proto__.AAA = 'rssss2'
          ssss.appendSchema(['sssssp'])
        sss.readSubAtCoords(0,0,0,'ssss',0).__proto__.AAA = 'rssss2'
          ssss.append(['SSSSSP1'])
        sss.append({})
    var ss=s.subAtCoords(1,0,0,'ss',0)
      ss.AAA='ss2'
      ss.append({sssp:'SSSP3'})
      var sss=ss.subAtCoords(0,0,0,'sss',0)
        sss.AAA='sss2'
        sss.append({})
        var ssss=sss.subAtCoords(0,0,0,'ssss',0)
          ssss.AAA='ssss4'
          ssss.append({sssssp:'SSSSSP'})
        $sss.appendSchema(['ssssp'])
*/
    _addSlotsDownstream: function (store, layers, schemaLength, slots, undef, info) {
      // Fix future-created readSub-s. Old non-isEmpty readSub-s remain broken due to new _layerLength (but parents of readSub-s on the property whose schema was altered are fine). _layerLength is used by advance() and consequently by find() and many others. Methods like objectAt...() (that depend on data coming from the prototype) will continue to work but it's best not to rely on this.
      //
      // We have to descend for info.length more levels because readSub-s can nest other readSub-s (but not normal sub-s). Separate loop makes it simpler because the underlying store may have no or empty layer data and _addSlotsDownstream() stops being called in such cases.
      //
      //   store.appendSchema(['.sub1'])
      //   var sub1 = store.readSub('sub1')
      //   sub1.appendSchema(['.sub2'])
      //   var sub2 = sub1.readSub('sub2')
      //
      // This task is simple because there is exactly one final readSub we're looking for (since readSub prototype is per property, not per property per object slice).
      var readSub = store    // remember info.length is never 0
      for (var i = info.length; readSub && i--; ) {
        readSub = readSub._subStoresRO[info[i][0]]
      }
      this._addSlots(slots, undef, 0, [], readSub)

      var thisInfo = info[info.length - 1]   // [prop, schemaLength, layered]
      info = info.slice(0, -1)
      var alterSelf = !info.length

      for (var l = layers.length; l--; ) {
        for (var n = layers[l].length + thisInfo[0]; (n -= schemaLength) >= 0; ) {
          // subLayers may be false or [] (empty sub-store). If this is the case, and if there is no created sub then we can skip the rest of this branch (info.length) since there's nothing else to update (readSub can live on empty layers for any depth but we have taken care of that in the dedicated loop above).
          var subLayers = layers[l][n] || []
          if (!thisInfo[2]) {
            subLayers = [subLayers]
          }
          var otherSub = store && store._subStores[l][n]
          if (alterSelf) {
            this._addSlots(slots, undef, thisInfo[1], subLayers, otherSub)
          } else if (otherSub || subLayers.some(function (a) { return a.length })) {
            this._addSlotsDownstream(otherSub, subLayers, thisInfo[1], slots, undef, info)
          }
        }
      }
    },

    // slots - values used for defined objects
    // undef - for undefined objects.
    // schemaLength - pre-appendSchema(). Can be 0.
    // layers - array of arrays: [ [slot1, slot2, ...], [layer2 slot1, ...] ]
    // store - may be null or an ObjectStore (root, sub or readSub).
    _addSlots: function (slots, undef, schemaLength, layers, store) {
      // schemaLength may be 0 if appendSchema() was initiated by a readSub (or readSub of readSub of ...) with initially empty schema. In this case layers is either empty or an array of empty arrays.
      //
      //   var store = new ObjectStore({schema: {sub: 0}, sub: [{}, []], ...})
      //   store.readSub(0, []).appendSchema(['newPropInSub'])
      //
      // Upstream stores cannot have it empty since you must have a property to create a sub-store.
      for (var l = layers.length; l--; ) {
        for (var n = layers[l].length; n > 0; n -= schemaLength) {
          spliceArray(layers[l], n, 0, layers[l][n - 1] == null ? undef : slots)
        }
      }

      if (store) {
        var found = _.find(store._events, function ($, event) {
          return /^(oadd|oremove|ochange)_n_/.test(event)
        })
        if (found) {
          // In theory, we could re-bind them by adjusting _N in the event name but this serisouly violates Sqimitive's domain and obscures the listener's code (you don't normally expect the event to change).
          throw new Error('Cannot appendSchema() of a store with a hook on ' + found.event)
        }
        store._layerLength  += slots.length * store._strideXY * store._strideZ
        store._schemaLength += slots.length
        var old = store.getSet('-optimize', function () { return false })
        store.set('optimize', old)
      }
    },

    // Modifies a property's value of the object at given coordinates.
    setAtCoords: function (x, y, z, l, prop, value, options) {
      return this.setAtContiguous(this.toContiguous(x, y, z, prop), l, value, options)
    },

    // Modifies a property's value of the object at given contiguous number.
    //
    //= mixed old value that was replaced, `'ochange fired`, undefined old and new values are the same (`@sq@isEqual()`@)
    //
    // Doesn't check for `'l validity. Doesn't do normalization on `'value
    // (no Sqimitive's `'normalize_OPT). Fails if `'value is `'null/`'undefined.
    //
    // Fails if `'n is a sub-store that was already initialized with a call to
    // `#sub().
    //
    // Does nothing if `'value is the same as `'old.
    //
    // Note: `'atContiguous and others
    // return non-cloned values; if you change it, you will change the value inside
    // `#ObjectStore. Moreover, if you pass it to `'setAtContiguous - it will be
    // seen as "the same" and events won't be fired:
    //[
    //   var array = store.atCoords(1, 2, 3, 'arrayProp', 0)
    //   array.push(123)    // don't do this!
    //   // Returns undefined:
    //   store.setAtCoords(1, 2, 3, 0, 'arrayProp', array)
    //
    //   // Do this:
    //   var array = store.atCoords(1, 2, 3, 'arrayProp', 0)
    //   array = array.concat()
    //   array.push(123)
    //   // Returns pre-concat() array:
    //   store.setAtCoords(1, 2, 3, 0, 'arrayProp', array)
    //
    //   // Same for {objects}:
    //   var object = store.atCoords(1, 2, 3, 'objectProp', 0)
    //   object = _.extend({}, object)
    //   // ...
    //]
    //
    // Fires `'ochange_n_N, `'ochange_p_PROP and `'ochange, with these arguments:
    //> n `- start of object's data
    //> l `- level of the object
    //> prop `- `#propertyIndex of the modified property
    //> value `- new value
    //> old `- original value; use with caution (see below)
    //> options `- as given by the caller; at least `'{}
    //
    // If hooking `'change_n_N on a non-1D store, check which `'l was changed.
    //
    // If you fetch properties of `'n from within `'ochange... and swap
    // `'old into `'prop, you won't necessary get the "old object" as it was
    // prior to `'ochange because of `#batch(). You can use `[options.batch`] to
    // backtrack and reconstruct it but this is advanced usage.
    //[
    //    var atter = atter(['x', 'y'])
    //    on('ochange', function (n, l, prop, value, old) {
    //      var oldObject = atter(n, l)
    //      oldObject[prop == propertyIndex('x') ? 'x' : 'y'] = old
    //      console.log(oldObject.x, oldObject.y)
    //    })
    //    addAtContiguous(..., {x: 1, y: 2})
    //    setAtContiguous(..., 'x', 3)        // logs '1, 2' which is correct
    //    batch(null, function () {
    //      setAtContiguous(..., 'x', 4)
    //      setAtContiguous(..., 'y', 5)      // ochange not fired yet
    //    })
    //      // ochange fired twice, logging:
    //      // '3, 5' (incorrect: old object's Y was 2)
    //      // '4, 2' (incorrect: old object's X was 3)
    //
    //    // Example of object reconstruction.
    //    on('ochange', function (n, l, prop, value, old, options) {
    //      var oldObject = atter(n, l)
    //      // Going from the end to let earlier ("older") ochange's override.
    //      for (var i = options.batch.length; i--; ) {
    //        var item = options.batch[i]
    //        if (item[0] == 'ochange' && item[1] == n && item[2] == l) {
    //          // You'll have to determine the changed property from its index.
    //          oldObject[propertyName(item[3])] = item[5]
    //        }
    //      }
    //      console.log(oldObject.x, oldObject.y)
    //    })
    //]
    //
    // If you're interested in particular object's changes use the first event;
    // if in particular property's - the second as it's more efficient then the
    // equivalent check inside the hook:
    //[
    //   on('ochange', function (n) {
    //     if (n == me) { ... }
    //   })
    //   on('ochange_n_' + me, function (n) {
    //     ...
    //   })
    //]
    //
    // Use `'ochange_p_PROP with caution: `'PROP can be part of a union and it
    // fires when any property of the union changes, not necessary the name you
    // have given to `#propertyIndex(). Always check that `'prop inside the callback
    // is indeed what you are listening to (e.g. by checking some kind of "type" property of the given `'n to determine which property of the union is used).
    setAtContiguous: function (n, l, value, options) {
      if (value == null) {
        throw new Error('Properties cannot have null/undefined values.')
      }
      if (this._subStores[l][n]) {
        // This is unsupported because new value can be incompatible with
        // currently created (sub)ObjectStore's layers - for example, different
        // number of layers. There are no means to update these properties after
        // ObjectStore creation (mainly because it'd greatly complicate client
        // logic that'd have to account for such changes).
        //
        // In addition, clients of
        // the sub-store will have to somehow update their state from scratch
        // bypassing normal oadd/ochange/oremove events.
        throw new Error('Trying to change a sub-store property.')
      }
      var old = this._layers[l][n]
      // Accessors don't have such checks because reading is a more frequent
      // operation. Modification methods are less common and this allows catching
      // various obscure bugs.
      if (old == null) {
        throw new Error(n >= this._layerLength || l > this._maxLayer ? 'n or l is out of bounds.' : 'There is no object at n/l. Use addAtContiguous().')
      }
      if (!this.isEqual(value, old)) {
        this._layers[l][n] = value
        var split = this.propertyFromContiguous(n)
        this._fire_ochange(5, [split[0], l, split[1], value, old, options])
        return old
      }
    },

    _fire_ochange: function (options, args) {
      this.batch(null, function (id) {
        args[options] = this._batchOptions(id, args[options])
        this._batch.push(['ochange_n_' + args[0]].concat(args))
        this._batch.push(['ochange_p_' + args[2]].concat(args))
        this._batch.push(['ochange'].concat(args))
      })
    },

    // Places a new object at given coordinates.
    addAtCoords: function (x, y, z, props, options) {
      return this.addAtContiguous(this.toContiguous(x, y, z, 0), props, options)
    },

    // Places a new object at given contiguous number.
    //
    //#atcn
    // `'n must point to the first property (start of data of object at that spot).
    //
    //#
    //
    //> props object key is property name or index, missing properties implied as `'false`,
    //  array all properties, in schema order, faster
    //  `- fails if any value is `'null/`'undefined
    //
    //= array new object's properties, `'oadd fired
    //
    // Fires `'oadd_n_N and `'oadd with these arguments:
    //> n `- new object's contiguous number
    //> l `- new object's level
    //> props `- new object's properties, as an array
    //> options `- as given by the caller; at least `'{}
    //
    //? Add object with all properties having default values:
    // `[
    //    sub.addAtCoords(0, 0, 0, {})
    //    sub.addAtContiguous(0, {})
    // `]
    addAtContiguous: function (n, props, options) {
      if (!_.isArray(props)) {
        var list = _.fill(Array(this._schemaLength), false)
        _.each(props, function (value, name) {
          list[this.propertyIndex(name)] = value
        }, this)
        props = list
      }
      if (props.length != this._schemaLength) {
        throw new Error('Added object has number of properties mismatching the schema.')
      }
      if (_.some(props, function (v) { return v == null })) {
        throw new Error('Properties cannot have null/undefined values.')
      }
      if (n >= this._layerLength) {
        throw new Error('n is out of bounds.')
      }
      var l = this.levelsAtContiguous(n)
      if (l > this._maxLayer) {
        this._addLayer()
      }
      spliceArray(this._layers[l], n, this._schemaLength, props)
      this._fire_oadd(3, [n, l, props, options])
      return props
    },

    _fire_oadd: function (options, args) {
      this.batch(null, function (id) {
        args[options] = this._batchOptions(id, args[options])
        this._batch.push(['oadd_n_' + args[0]].concat(args))
        this._batch.push(['oadd'].concat(args))
      })
    },

    _addLayer: function () {
      this._maxLayer++
      this._layers.push(Array(this._layerLength))
      this._subStores.push({})
    },

    // Creates a new object in a `#is1D store.
    //
    //> props object`, array`, missing just extend `- in `#addAtContiguous() format
    //> options unused if no `'props `- for `#addAtContiguous()
    //
    //= array `[[new object's `'n, null or props as returned by addAtContiguous]`]
    //
    // ` `#append() is different from `'addAtContiguous(): the former causes `'this.`#size()
    // to grow by 1 (X increases) and puts `'props as the only object at
    // new `'x, `'l = 0; the latter pushes `'props to the list of objects on
    // the given `'l without allocating new `'x, possibly creating a new layer at `'x.
    //
    // 1D `#ObjectStore usually contains objects accessed by unique IDs - their
    // `'x. In this case `#append() can be seen as returning a new unique ID.
    //
    // If `'props is not given then `#append() just extends the store by 1 slot,
    // doesn't add any object and returns `[[new_n, null]`] (fires no events). This makes `'new_n
    // valid for subsequent `#addAtContiguous(), `#find(), `#atContiguous(), etc.
    //
    // `'this ceases to be `#isEmpty() after `#append().
    append: function (props, options) {
      if (!this.is1D()) {
        throw new Error('Trying to append() to a non-is1D() ObjectStore.')
      }
      var n = this._layerLength
      this.isEmpty() ? this._extendBy(1, 1, 1) : this._extendBy(1, 0, 0)
      return [n, props && this.addAtContiguous(n, props, options)]
    },

    //! +ig
    //> x int `- if 0 then `'this must not be `#isEmpty()
    _extendBy: function (x, y, z) {
      this._strideX += x
      this._strideY += y
      this._strideXY = this._strideX * this._strideY
      this._strideZ += z
      this._layerLength = this._strideXY * this._strideZ * this._schemaLength

      for (var l = 0; l <= this._maxLayer; l++) {
        // Extend arrays using "sparse" slots. It's pretty convenient that in JS
        // undefined == null == sparse slot, and that they all are
        // JSON.stringify'ed as "null".
        this._layers[l].length = this._layerLength
      }
    },

    // Ensures the 1D store has enough members to make `'x addressable.
    //> x int `- does nothing if negative
    //= int `'n of first added (empty) object`,
    //  null if current size is sufficient, nothing changed
    extendTo: function (x) {
      x -= this._strideX - 1
      if (x > 0) {
        var n = this.append()[0]
        --x && this._extendBy(x, 0, 0)
        return n
      }
    },

    // Pulls an object from given coordinates.
    removeAtCoords: function (x, y, z, l, options) {
      return this.removeAtContiguous(this.toContiguous(x, y, z, 0), l, options)
    },

    // Pulls an object from given contiguous number.
    //
    //#-atcn
    //
    //= array deleted object's properties, `'oremove fired`, null if already removed
    //
    // If `'n is a sub-store, calls its `'remove(); you can hook it on the sub-store instance. Don't call
    // `'remove() manually, call `'release() instead (this ensures removal when
    // no other clients are listening to the sub-store).
    //
    // Removing the same object twice leads to undefined behaviour
    // except in 1D store (`'l always 0) with `'n not reused for new objects: in this sole case
    // if `'n has been already
    // removed `'removeAtContiguous() returns `'null and does nothing.
    //
    // Fires `'oremove_n_N and `'oremove with these arguments:
    //> n `- deleted object's contiguous number
    //> l `- original object's layer; avoid using it since layer members are
    //  reordered after change; the only valid use is when keeping in sync two stores,
    //  hooking oremove on one and calling removeAtContiguous() on another (as
    //  long as both have the same code revision, else reordering algorithm may differ)
    //> props `- deleted object's properties, as an array
    //> options `- as given by the caller; at least `'{}
    removeAtContiguous: function (n, l, options) {
      //  __       __
      // >L0|<,   |L0|  (L0 was L2)
      // |L1| |   |L1|
      // |L2|-'   |null
      // |null    |null
      //
      //  __
      // |L0|     same
      // >L1|<,   result
      // |L2|-'   as
      // |null    above
      //
      //  __       __
      // |L0|     |L0|
      // |L1|     |L1|
      // >L2|     |null
      // |null    |null

      // Optimization: if l is the _maxLayer then no need to count layers (but
      // do count in 1D because in 1D removeAtContiguous() is allowed to be
      // called on a removed object).
      //
      // Another, regarding startAt: we assume that the caller only calls
      // removeAtContigous() when l is known to be occupied (in this case there are at least as many levels as l)
      // or when it's a 1D store and l is always 0 (then levelsAtContiguous() can return 0 if n was already removed).
      var lastLayer = (!this.is1D() && l == this._maxLayer) ? l
        : (this.levelsAtContiguous(n, l) - 1)
      if (lastLayer != -1) {
        var props = spliceArray(this._layers[l], n, this._schemaLength,
          l != lastLayer
            ? spliceArray(this._layers[lastLayer], n, this._schemaLength,
                          Array(this._schemaLength))
            : Array(this._schemaLength)
        )
        var store = this._subStores[l][n]
        store && store.remove()
        this._fire_oremove(3, [n, l, props, options])
        return props
      }
    },

    _fire_oremove: function (options, args) {
      this.batch(null, function (id) {
        args[options] = this._batchOptions(id, args[options])
        this._batch.push(['oremove_n_' + args[0]].concat(args))
        this._batch.push(['oremove'].concat(args))
      })
    },

    // Sets up hooks to fire additional `[o...`] events based on value of
    // the affected object's property.
    //
    //> prop integer`, string `- may produce unexpected behaviour if part of a union
    //
    // For example, if all objects in this store have a `'class property then
    // calling `[store.fireBy('class')`] and then modifying any object whose
    // `'class equals `'FOO will fire `'oadd_FOO, `'ochange_FOO and/or
    // `'oremove_FOO.
    //
    //[
    //   store.on('oadd_FOO', function () { /* object with class=FOO added */ })
    //]
    fireBy: function (prop) {
      prop = this.propertyIndex(prop)
      _.each(['oadd', 'ochange', 'oremove'], function (event) {
        this.fuse(event, function (n, l, props) {
          var value = props ? props[prop] : /*ochange*/ this.atContiguous(n + prop, l)
          this.fire(event + '_' + value, arguments)
        })
      }, this)
    },
  })

  // Mix-in implementing reference counter-based ownership.
  //
  // Adds several new methods: `#take() (to be called when a client "connects" to
  // this instance), `#release() (calls `#released() if no other clients remain), `#released() (calls `'remove() by default) and `#takeRelease() (combination of the two).
  //
  // Tracks references via `#_references (starts at `'0).
  //
  //?`[
  //    var MyFoo = Sqimitive.Base.extend({
  //      mixIns: [ObjectStore.TakeRelease],
  //    })
  //    var foo = new MyFoo
  //    foo.take()        // _references = 1
  //    foo.take()        // _references = 2
  //    foo.release()     // _references = 1
  //    foo.release()     // _references = 0, released(), remove()
  //    foo.release()     // error
  // `]
  //
  // Typically, the calls to `#take() and `#release() go in pair, often using
  // `'try/`'finally to avoid "leaking" the reference counter:
  //[
  //  var foo = fooProvider().take()
  //  try {
  //    // do stuff
  //  } finally {
  //    foo.release()
  //  }
  //]
  //
  // `#TakeRelease should have been in `#Common because it's used by other HeroWO
  // classes but as we want `'ObjectStore to be self-sufficient it has to be here.
  //
  //## Why use this in JavaScript?
  // JavaScript's garbage collector (GC) takes care of low-level object
  // allocation, freeing memory if no variables holds a reference to an object.
  // However, it doesn't know that some references are "weak" - for example,
  // `#ObjectStore holds a repository of sub-stores (`#subAtContiguous) requested by its clients and
  // that should be removed once all clients of a given sub-store are removed.
  // The main store must hold such sub-stores in "cache" (to avoid creating
  // new sub-store instance if one already exists) and that already
  // creates persistent references preventing them from being GC'd.
  //
  // JavaScript offers `'WeakMap (and several other classes) but they won't work
  // if there are other "weak" references to the values (such as Sqimitive
  // event hooks from other objects to ones in "cache"). They also don't have
  // "ondestroy" events (such as to remove hooks), don't support enumeration,
  // `'clear(), etc.
  //
  // ` `#TakeRelease allows working with objects as usual, with an added burden
  // of requiring users to explicitly indicate when they start and end needing
  // them. This kind of manual memory management pays off when the "repository" is very large and users access
  // only small subsets of it, as with `#ObjectStore.
  //
  // ` `#Calculator implements a form of automatic take/release by tracking Sqimitive event hooks (see `'regHandler()).
  ObjectStore.TakeRelease = {
    staticProps: {trace: Sqimitive.Core.stub},

    // Holds number of references to `'this.
    //= int 0 at first, `'-Infinity after `'unnest() (`'remove())
    _references: 0,

    events: {
      // Specifically pushing this hook to the end of others (no "-") to allow clean-up of listeners on this instance before _references is invalidated. For example, if this were -unnest and there were another hook after it that does this.release(), we would first invalidate _references (warning about non-0 counter), then the other hook will try to decrement it (a valid action if the client has done take() earlier).
      '=unnest': function (sup) {
        var removal = this._parent
        var res = sup(this, arguments)
        // Calculators and sub-stores (users of this mix-in) have only one parent
        // ever (cannot be re-nested without constructing a new object). Moreover,
        // they become unusable after remove(). -Infinity ignores subsequent take()
        // and causes release() (even paired with take()) to log a warning.
        if (removal) {
          // If already -Infinity it just means unnest() was called from itself (reentered). No harm done.
          if (this._references && this._references != -Infinity) {
            console && console.warn(this.constructor.name + ' removed with reference counter at ' + this._references)
          }
          this._references = -Infinity
        }
        return res
      },
    },

    // To be called when an external object acquires a reference to `'this.
    //= this
    take: function () {
      ObjectStore.TakeRelease.staticProps.trace(this, 'take')
      this._references++
      return this
    },

    // To be called when an external object lets go of its reference to `'this.
    //= this
    // If there are no other clients, calls `#released().
    release: function () {
      ObjectStore.TakeRelease.staticProps.trace(this, 'release')
      if (!--this._references) {
        this.released()
      } else if (this._references < 0) {
        console && console.warn(this.constructor.name + ' reference counter got negative!')
      }
      return this
    },

    // Internally called when last client has released its reference to `'this.
    //
    // Base implementation calls `'remove(). For example, override it to retain released objects in cache for some time to instantly provide it to another (likely) near-future client.
    released: function () {
      this.remove()
    },

    // To be called when an external object won't need long-term reference to `'this.
    //
    // Consider a factory returning singleton objects that it creates. A client synchronously accessing such an object technically doesn't possess its reference (since no other code between it obtaining the object and releasing it can run):
    //[
    // var calc = cx.calculator('foo')
    // var value = calc.value
    // // calc no longer needed.
    //]
    // If `#take() isn't called on `'calc, the factory (`'cx above) would never free the object because its references are 0. Client could do this:
    //[
    // var calc = cx.calculator('foo')
    // calc.take()
    // var value = calc.value
    // calc.release()
    //]
    // ...But it's long-winded and can be often replaced with this:
    //[
    // var value = cx.calculator('foo').takeRelease().value
    //]
    // However, this may not be entirely identical to calling `#take() before the access and `#release() after it - such as if `'calc initializes `'value upon first reference or destroys its `'value upon removal.
    takeRelease: function () {
      // Would just call remove() if _references == 0 but take() and/or
      // release() could be overridden.
      return this.take().release()
    },
  }

  ObjectStore.mixIn(ObjectStore.TakeRelease)
  return ObjectStore
})