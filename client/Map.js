define(['Common', 'ObjectStore', 'Effects'], function (Common, ObjectStore, Effects) {
  "use strict"
  var _ = Common._

  // Returns sqimitive _opt members except those not declared in its class' _opt.
  //
  //?`[
  // var sqim = new (Sqimitive.extend({
  //   _opt: {foo: 1, quux: 4}
  // }))
  // sqim.set('foo', 2)
  // sqim.set('bar', 3)
  // sqim.get()             //=> {foo: 2, quux: 4, bar: 3}
  // definedOptions(sqim)   //=> {foo: 2, quux: 4}
  // `]
  function definedOptions(obj) {
    return _.pick(obj.get(), _.keys(obj.constructor.prototype._opt), _.forceObject)
  }

  // Mix-in for sqimitive that maintains a growing 0-based counter for some purpose (usually to allow related sqimitives use it as their children's keys).
  //
  // Defines _opt.sequentialKey and provides unser'ialization entry for it.
  //
  // Used to ensure clients and server use the same keys for collections (transitions, combat objects, etc.), so that an entity can be later reached by its parents' keys.
  var SequentialKeyStore = {
    // Using finishMixIn() rather than just _opt: {...} to make sequentialKey
    // recognized by definedOptions().
    finishMixIn: function (proto) {
      ('sequentialKey' in proto._opt) || (proto._opt.sequentialKey = 0)
    },

    unser: {
      sequentialKey: false,
    },

    events: {
      init: function () {
        // Assign sequentialKey before subsequent unserialization involving
        // SequentialKeys to avoid resetting the counter. For example, Map's
        // assignResp() could go like this:
        // 1. loss.assignChildren() - generates keys like "0", "1", etc.
        //    incrementing Map's _opt.sequentialKey
        // 2. set('sequentialKey', 0) - called at some point by Map's
        //    assignResp(), resetting the counter and discarding increments
        //    done by assignChildren()
        var old = this.unser['']
        this.unser[''] = function (resp, options) {
          this.set('sequentialKey', resp.sequentialKey)
          return old && old.apply(this, arguments)
        }
      },
    },

    sequentialKey: function () {
      return this.getSet('-sequentialKey', Common.inc())
    },
  }

  // Mix-in for a collection whose children's keys are based on numbers provided by a SequentialKeyStore.
  //
  // Defines _defaultKey(), default keyFunc for assignChildren() and basic serialize().
  var SequentialKeys = {
    _serializer: null,

    _opt: {
      keyStore: null,   // don't change
    },

    events: {
      '=_defaultKey': function () {
        // If keyStore is an _opt this won't fire change but that's okay - slaves don't need to access the counter.
        return this._opt.keyStore.sequentialKey++
      },

      '-assignChildren': function (resp, options) {
        options.keyFunc = options.keyFunc || this.keyFunc
      },
    },

    keyFunc: function (child, opt) {
      return opt._key
    },

    serialize: function () {
      var func = this._serializer
      return this.map(function (child) {
        return _.extend(func ? child[func]()
          : definedOptions(child), {_key: child._parentKey})
      })
    },
  }

  // Root for data of a playable (or being played) map.
  //
  // ` `#_opt of the `#Map represent map fields such as map name
  // while `#Map's properties are accompanying complex structures like list of
  // map objects and players.
  //
  // ` `#Map is not merely a static store - it can be actively changed.
  // `@Map.Indexed`@ is particularly suited as a data backend for a running
  // `'game because it provides additional means for quick access to underlying
  // map info - for example, list of all objects owned by a given player.
  var Map = Common.Sqimitive.extend('HeroWO.Map', {
    mixIns: [SequentialKeyStore],
    // Maps symbolic names to their numerical representations.
    //= object of objects like `[constants = {class: {type: {hero: 1}}}`]`,
    //  null prior to `#load()
    // Numbers take up less memory and are faster to compare and can be used as indexes in arrays and ObjectStore-s. Additionally,
    // referring to things via constants (`[foo`]) rather than strings (`['foo'`])
    // allows early typo detection. As such, HeroWO is using numbers all around
    // - as player identifiers, game resources, object types, etc. Many constants
    // are specific to a particular ruleset (e.g. H3) and even map but core
    // constants must stay the same (their symbolic names are well-known but
    // numeric values may vary). `'constants holds such core constants, and
    // possibly others (the core engine simply doesn't use them).
    //#-ro
    constants: null,
    // Holds data of all objects on this map.
    //= ObjectStore 1D: id => object`, null prior to `#load()
    // A map "object" is everything from individual ground tiles to heroes and
    // castles.
    //#-ro
    objects: null,
    // List of victory conditions for this map, including basic like "defeat all enemies".
    //= Sqimitive of `@Map.Victory`@
    //#-ro
    victory: null,
    // List of loss conditions for this map, including basic like "lose all heroes and towns".
    //= Sqimitive of `@Map.Loss`@
    //#-ro
    loss: null,
    // List of players existing in this map; keys are player numbers (0-based, 0 for neutral).
    //= Sqimitive of `@Map.Player`@
    // In `@Map.Indexed`@ this contains `@Map.Indexed.Player`@'s.
    //#-ro
    players: null,
    // Holds data of all Effects on this map: morale bonuses, town income, etc.
    //= ObjectStore 1D: id => object`, null prior to `#load()
    // This property is used only if `[_opt.effects`] is set.
    //#-ro
    effects: null,
    combats: null,
    transitions: null,
    // Doesn't belong to Map. Set to a Shroud instance by H3.Rules. Defined here for uniformity with common properties.
    shroud: null,

    _xyzConvertor: null,
    _actionableAtter: null,

    //> state `- one of: `'created, `'loading (during `#load()), `'loaded
    //> url `- URL prefix of map resources; always using `'/ and ending on one;
    //  not used by Map itself, may be used by others; usually set prior to calling `#load()
    //> * `- see comments in databank/core.php for info on other fields
    _opt: {
      state: 'created',   // XXX=R replace with just 'loading' bool
      url: '',
      effects: true,

      // PHP's Map class properties:
      format: 0,
      id: '',
      revision: 0,
      modules: [],
      databank: '',
      width: 0,
      height: 0,
      levels: 0,
      margin: [],
      origin: '',
      difficulty: 0,
      title: '',
      description: '',
      date: false,    // parse with `#date()
      random: false,
      initialHeroExperiences: [],
      difficultyMode: 0,
      turnLength: 0,    // XXX+I
      confirming: false,
      pin: '',   // multi-player only
      private: false,   // multi-player only
      finished: false,
      bonus: false,
      listOrder: 0,
    },

    // assignResp() schema used when unserializing a Map from JSON.
    unser: {
      constants: function (value) {
        this.constants = value
      },
      victory: function (value) {
        this.victory.assignChildren(value, {schema: 'unser'})
      },
      loss: function (value) {
        this.loss.assignChildren(value, {schema: 'unser'})
      },
      players: function (value) {
        this.players.assignChildren(value, {schema: 'unser'})
      },
    },

    // assignResp() schema used when unserializing a Map packed in Maps ObjectStore.
    storeSchema: {
      modules: function (value, key) {
        return [key, value ? value.split(' ') : []]
      },
    },

    events: {
      init: function (opt) {
        this.victory = this.nest(new (Common.Sqimitive.extend({
          mixIns: [SequentialKeys],
          _childClass: Map.Victory,
        }))({keyStore: this._opt}))

        this.loss = this.nest(new (Common.Sqimitive.extend({
          mixIns: [SequentialKeys],
          _childClass: Map.Loss,
        }))({keyStore: this._opt}))

        this.players = this.nest(new (Common.Sqimitive.extend({
          _childClass: Map.Player,
          _childEvents: ['change'],

          events: {
            '=_defaultKey': function (sup, player) {
              return player.get('player')
            },
          },
        })))

        this.combats = this.nest(new Map.Combat.Combats({keyStore: this._opt}))
          .on({
            '+provideGarrison': function (res, id) {
              if (!res && typeof id == 'number') {
                res = this.objects.subAtCoords(id, 0, 0, 'garrison', 0)
              }
              if (!res) {
                throw new Error('Unable to obtain Party.garrison by: ' + id)
              }
              return res
            },
          }, this)

        this.transitions = this.nest(new (Common.Sqimitive.extend({
          mixIns: [SequentialKeys],
          _childClass: Map.Transition,
          _childEvents: ['select', 'change'],
          _serializer: 'get',
        }))({keyStore: this._opt}))
      },

      '+normalize_url': function (res, now) {
        if (now != null) {
          return now.replace(/\/+$|$/, '/')
        }
      },

      '+normalize_difficultyMode': Common.normInt,
      '+normalize_turnLength': Common.normInt,
      '+normalize_confirming': Common.normBool,
      '+normalize_private': Common.normBool,

      '+normalize_pin': function (res, now) {
        return now || (Math.random() + '').substr(2, 5)
      },

      change: function (name, now, old) {
        _.log && _.log('Map.%s = %j <- %j', name, now, old)
      },
    },

    serializeHeader: function () {
      return _.extend(
        _.omit(definedOptions(this), 'state', _.forceObject),
        {
          victory: this.victory.serialize(),
          loss: this.loss.serialize(),
          players: this.players.map(function (pl) {
            return _.filter(pl.get(), function (v, k) {
              return _.has(pl.constructor.prototype._opt, k) ||
                     _.startsWith(k, 'resources_')  // unrolled
            })
          }),
          constants: this.constants,
        }
      )
    },

    // Packs this Map's data into natively serializable (JSON) values. Used when saving a game, initializing a new multi-player client, etc.
    //
    // As with other such methods, data is not deeply cloned and may change if not serialized to string immediately.
    serialize: function (options) {
      return _.extend(
        {
          map: this.serializeHeader(),
          objects: this.objects.serialize(),
          combats: this.combats.serialize(),
          // There are type-specific _opt so not using definedOptions().
          //
          // XXX+I: mstr: rather than serializing no transitions, we should serialize those with unset collect (not yet selected); also, perhaps skipTransitions is unnecessary at all, and that all transitions should be serialized in all cases to allow the client to resume some of them (trsr)
          transitions: options.skipTransitions ? [] : this.transitions.serialize(),
        },
        this.effects && this.effects.serialize(_.extend({asFiles: true}, options))
      )
    },

    // Returns dimensions of the map the player can interact with.
    //= object with `'width, `'height keys
    sizeWithoutMargin: function () {
      var margin = this.get('margin')
      return {
        width:  this.get('width')  - margin[0] - margin[2],
        height: this.get('height') - margin[1] - margin[3],
      }
    },

    // Returns a single number corresponding to given coordinates suitable
    // as an array index.
    //
    // For example, given map size 3x3 and no underground, "contiguous" of
    // (1:2) is `[1 + 2 * 3 = 7`].
    toContiguous: function (x, y, z) {
      return this._xyzConvertor.toContiguous(x, y, z, 0)
    },

    // Decodes a number created with `#toContiguous() into coordinates.
    //= object with `'x/`'y/`'z keys
    fromContiguous: function (n) {
      return this._xyzConvertor.fromContiguous(n)
    },

    // Parses current in-game `'date `#_opt into components.
    //= object with `'day, `'week, `'month keys (1-based numbers)
    date: function () {
      var date = this.get('date')
      return {
        day:    date % 7 + 1,
        week:   Math.floor(date / 7) % 4 + 1,
        month:  Math.floor(date / 28) + 1,
      }
    },

    // Starts loading map data by retrieving it using own `#fetch() that should be overridden by client.
    //
    // Expects `'state to be `'created. Transitions to `'loading and, after
    // parsing all data, to `'loaded.
    //
    //= this `- listen to when done by hooking `'loading
    load: function () {
      if (this.get('state') != 'created') {
        throw new Error('Cannot load() again after loading.')
      }

      _.log && _.log('Fetching map from %s', this.get('url'))
      this.set('state', 'loading')

      this.fetch('map.json')
        .whenSuccess(function (async) {
          this.assignResp(async.response, {schema: 'unser'})

          this.getSet('pin')

          this.getSet('random', function (cur) {
            return cur === false ? _.random() : cur
          })

          this._xyzConvertor = new ObjectStore({
            strideX: this.get('width'),
            strideY: this.get('height'),
            strideZ: this.get('levels'),
            layers: [],
            schema: {v: 0},
          })

          if (this.get('format') != this.constructor.FORMAT_VERSION) {
            throw new Error(_.format('Wrong map format (%s, %d expected).',
              this.get('format'), this.constructor.FORMAT_VERSION))
          }

          var fetchAsync = new Common.Async
          this._fetch(fetchAsync)

          fetchAsync.whenSuccess(function () {
            this.effects.attachObjects(this.objects)

            this._actionableAtter = this.objects.atter(['x', 'y', 'z',
              'width', 'height', 'actionable'])

            this.set('state', 'loaded')
          }, this, Infinity)
        }, this)

       return this
    },

    // function (file)
    // Starts retrieving a piece of map data.
    //? If using `#DOM.Common:
    //  `[
    //    map.on('=fetch', function (sup, file) {
    //      return new Common.JsonAsync({url: 'maps/' + map.get('url') + file})
    //    })
    //  `]
    // Returned Async is usually tracked using Context.queueLoading().
    fetch: Common.stub,

    _fetch: function (async) {
      var co = new Common.Async({owning: false})

      co.nest(async.nest(this.fetch('objects.json')))
        .whenSuccess(function (async) {
          this.objects = new ObjectStore(async.response)
        }, this)

      var combats = co.nest(async.nest(this.fetch('combats.json')))

      // Need objects.json for functional provideGarrison().
      co.whenSuccess(function () {
        this.combats.assignChildren(combats.response, {
          map: this,
          schema: 'unser',
          newFunc: function (opt) {
            // Dimensions should be given to Combat constructor to initialize bySpot.
            return new this._childClass(_.pick(opt, 'width', 'height', _.forceObject))
          },
        })
      }, this)

      async.nest(this.fetch('transitions.json'))
        .whenSuccess(function (async) {
          this.transitions.assignChildren(async.response, {schema: 'unser'})
        }, this)

      if (this.get('effects')) {
        var effects = async.nest(new Common.Async)
        var files = _.extend({effects: '', eLabel: 'byLabel'}, Effects.prototype._indexes)

        _.each(files, function (prop, file) {
          effects.nest(this.fetch(file + '.json'))
            .whenSuccess(function (async) {
              prop ? files[file] = async.response
                : _.extend(files, async.response)
            })
        }, this)

        effects.whenSuccess(function () {
          files.constants = this.constants
          this.effects = new Effects(files)
        }, this)
      }
    },

    // Calls `'func for every cell within the `'obj's rectangle regardless of its passability/actionability.
    //
    //> obj object `- in `@Map.object`@ format, with at least these keys:
    //  width, height and (`'argLevel 1+) x, y, z; won't be mutated
    //> argLevel int `- affects the object passed to `'func; 0 gives fewest info
    //> func `- is given an object (below) and if returns anything but `'null
    //  then walking stops and `#walkObjectBox() returns that value
    //  `> ox 0+ `- X coordinate in scope of object (so left object's edge is `'0)
    //  `> oy 0+ `- Y coordinate
    //  `> on 0+ `- contiguous number in scope of object (so top left corner is `'0)
    //  `> mx 1+ `- X coordinate in scope of the map
    //  `> my 1+ `- Y coordinate
    //  `> mz 1+ `- Z coordinate; since objects don't usually span multiple levels,
    //     this always matches `[obj.z`]
    //  `> tl 2+ bool `- whether current spot is the top left object's corner
    //  `> tr 2+ bool `- whether it's top right corner
    //  `> bl 2+ bool `- whether it's bottom left corner
    //  `> br 2+ bool `- whether it's bottom right corner
    //  `> t  2+ bool `- whether it's on the top edge
    //  `> b  2+ bool `- whether it's on the bottom edge
    //  `> l  2+ bool `- whether it's on the left edge
    //  `> r  2+ bool `- whether it's on the right edge
    //
    //= mixed as returned by `'func
    walkObjectBox: function (obj, argLevel, func, cx) {
      // Note: Combat.walkImpassable() depends on this method to be static.

      var i = 0
      var x = 0
      var y = 0

      for (var end = obj.width * obj.height; i < end; i++) {
        var arg = {
          ox: x,    // object's X
          oy: y,
          on: i,    // object's contiguous (useful for passable[])
        }

        if (argLevel >= 1) {
          arg.mx = obj.x + x    // map's X for this object
          arg.my = obj.y + y
          arg.mz = obj.z
        }

        if (argLevel >= 2) {
          arg.tl = i == 0       // top left corner
          arg.t  = y == 0
          arg.tr = i == obj.width - 1
          arg.r  = x == obj.width - 1
          arg.br = i == end - 1
          arg.b  = y == obj.height - 1
          arg.bl = x == 0 && y == obj.height - 1
          arg.l  = x == 0
        }

        var res = func.call(cx || this, arg)
        if (res != null) { return res }

        if (++x == obj.width) {
          x = 0
          y++
        }
      }
    },

    // Returns first object's point (if any) that a hero may interact with.
    //
    //> obj object`, int ID `- object with keys required by `#walkObjectBox() (0 or 1) plus `'actionable
    //> objectBox `- if `'true, returns `[[x, y]`] in scope of object,
    //  else `[[x, y, z]`] in scope of map
    //
    // Note that `'x, `'width, `'passable and other object properties may change;
    // use this only for one-shot calculations.
    actionableSpot: function (obj, objectBox) {
      if (typeof obj == 'number') {
        obj = this._actionableAtter(obj, 0, 0, 0)
      }

      return this.walkObjectBox(obj, objectBox ? 0 : 1, function (pos) {
        if (+obj.actionable[pos.on]) {
          return objectBox ? [pos.ox, pos.oy] : [pos.mx, pos.my, pos.mz]
        }
      })
    },
  }, {FORMAT_VERSION: 1})

  // Specialized version of `#Map that allows quick access to certain data.
  Map.Indexed = Map.extend('HeroWO.Map.Indexed', {
    _reps: null,
    // Index grouping objects by their $type (hero, monster, etc.).
    //= ObjectStore 1D: type => id
    //#-ro
    byType: null,
    // Index grouping objects by their owning player (`'0 for neutral, `'1 for Red, etc.).
    //= ObjectStore 1D: owner => id
    //#-ro
    byOwner: null,
    // Index overlaying the map holding passability info about every tile.
    //= ObjectStore 3D: z y x => info
    //#-ro
    byPassable: null,
    // Index overlaying the map holding list of objects placed on a tile regardless of passability/actionability.
    //= ObjectStore 3D: z y x => info
    //#-ro
    bySpot: null,
    // Index overlaying the map telling how every tile should appear on the mini-map.
    //= ObjectStore 3D: z y x => info
    //#-ro
    miniMap: null,

    _indexes: {
      type:     'byType',
      owner:    'byOwner',
      passable: 'byPassable',
      spot:     'bySpot',
      mini:     'miniMap',
    },

    unser: {
      players: function (value) {
        var options = {map: this}
        this.players.assignChildren(value, {
          schema: 'unser',
          newFunc: function () {
            return new this._childClass(options)
          },
        })
      },
    },

    events: {
      init: function () {
        this.players._childClass = Map.Indexed.Player
      },

      '-_fetch': function () {
        // representationOf() is called during Combats unserialization so it has to be ready before _fetch() runs.
        this._reps = new Map.ObjectRepresentations
      },

      _fetch: function (async) {
        _.log && _.log('Fetching map indexes')

        _.each(this._indexes, function (prop, file) {
          async.nest(this.fetch(file + '.json'))
            .whenSuccess(function (async) {
              this[prop] = new ObjectStore(async.response)
            }, this)
        }, this)

        async.whenSuccess(function () {
          this.players.invoke('attach')
          this._attachIndexes()
        }, this, 1)
      },

      '+serialize': function (res) {
        _.each(this._indexes, function (prop, file) {
          res[file] = this[prop].serialize()
        }, this)
      },
    },

    // Adds listeners to keep `'byType and other indexes in sync with `'objects.
    _attachIndexes: function () {
      _.log && _.log('Object schema: \n%s', _.entries(this.objects.schema())
        .filter(function (a) { return a[0][0] != '_' })
        .sort(function (a, b) { return (a[1] - b[1]) || Common.compare(a[0], b[0]) })
        .map(function (a) { return _.padStart(a[1], 4) + ' = ' + a[0] })
        .join('\n'))

      var updater = new Effects.BatchIndexUpdater({
        store: this.objects,
        logPrefix: 'O ',

        // Changing type, miniMap after object creation is unsupported.
        objectProperties: [
          'id', 'type', 'owner', 'passable', 'actionable', 'width', 'height',
          'x', 'y', 'z', 'displayOrder', 'miniMap', 'passableType', 'actionableFromTop',
        ],

        indexProperties: [
          'owner', 'width', 'height', 'x', 'y', 'z', 'displayOrder', 'passable', 'actionable',
          'passableType',
        ].map(this.objects.propertyIndex, this.objects),
      })

      var spotSchema = this.bySpot.schema()

      var passableSchema = this.byPassable.schema()

      var miniMapIndex = updater.atter.miniMapIndex
      var miniSchema = this.miniMap.schema()
      var miniPassable = this.constants.miniMapTile.type.passable
      var miniImpassable = this.constants.miniMapTile.type.impassable
      var miniOwnable = this.constants.miniMapTile.type.ownable
      var miniMovable = this.constants.miniMapTile.type.movable

      function increment(store, n, delta, options) {
        // increment() is only used for byPassable. Like miniMap, it includes only entries for tiles where at least one object existed when the map was generated. On run-time, an object may be added into a spot where no other objects existed yet (usually happens with margin tiles, like when creating tavern heroes). In this case increment() creates a new entry in the store. Unlike miniMap, it doesn't to remove "empty" entries for simplicity sake.
        var cur = store.atContiguous(n, 0)
        if (cur == null) {
          if (delta < 0) {
            console && console.warn('New store entry starts off as ' + delta)
          }
          var coords = store.fromContiguous(n)
          store.addAtContiguous(n - coords.prop, _.object([coords.prop], [delta]), options)
        } else {
          store.setAtContiguous(n, 0, cur + delta, options)
        }
      }

/*
      // XXX-R Code is no longer used.

      var entryLength = this.byPassable.schemaLength()
      var rowLength = entryLength * this.byPassable._strideX
      var maxX = this.get('width') - 1
      var maxY = this.get('height') - 1

      var incrementGuarded = function (obj, delta) {
        // All guards in SoD are 'monster' objects protecting 3x3 area around
        // their only actionable spot. Here we support objects of any size,
        // protecting tiles adjacent to the smallest rectangle around their
        // actionable spots.
        //   +--+--+--+--+
        //   |..|..|..|  |
        //   +--+--+--+--+    given a 3x4 object which tiles are marked as .
        //   |g.|g.|g.|g |    and its actionable spots marked as A.
        //   +--+--+--+--+    protected spots around the 2x2 A. rectangle
        //   |g.|A.|A.|g |    are marked as g
        //   +--+--+--+--+    where g. mark spots within the
        //   |g.|A.|A.|g |    object's width*height box
        //   +--+--+--+--+
        //   |g |g |g |g |
        //   +--+--+--+--+

        // Determine the actionable rectangle.
        var x0 = Infinity
        var y0 = Infinity
        var x1 = -1
        var y1 = -1
        this.walkObjectBox(obj, 0, function (pos) {
          if (+obj.actionable[pos.on]) {
            x0 > pos.ox && (x0 = pos.ox)
            y0 > pos.oy && (y0 = pos.oy)
            x1 < pos.ox && (x1 = pos.ox)
            y1 < pos.oy && (y1 = pos.oy)
          }
        })
        obj.x = x0
        obj.y = y0
        obj.width  = x1 - x0 + 1
        obj.height = y1 - y0 + 1

        // Update guarded counters.
        var cn = -passableSchema.guarded + passableSchema.type
        this.walkObjectBox(obj, 2, function (pos) {
          if (+obj.actionable[pos.on]) {
            var n = this.byPassable.toContiguous(pos.mx, pos.my, pos.mz, 0)
            var type = this.byPassable.atContiguous(n + passableSchema.type, 0)
            n += passableSchema.guarded
            //     |    |    |    |        a | b | b | b | c   1..9 - object's box
            // ----+----+----+----+----   ---+===+===+===+---  a..h - guarded box
            //     |-s-1|-s  |-s+1|        h |-1-|-2-|-3-| d   a<-1
            // ----+----+----+----+----   ---+===+===+===+---  b<-1 2 3
            //     |  -1|obj |  +1|        h |-8-|-9-|-4-| d   c<-3
            // ----+----+----+----+----   ---+===+===+===+---  d<-3 4 5
            //     | s-1| s  | s+1|        h |-7-|-6-|-5-| d   e<-5
            // ----+----+----+----+----   ---+===+===+===+---  f<-5 6 7
            //     |    |    |    |        g | f | f | f | e   g<-7
            // sx = rowLength 1 = entryLength                  h<-7 8 1
            //    |   |   |   |              |   |   |   |
            // ---+===+===+===+---        ---+===+===+===+---  pos.ox : pos.oy
            //    |tl |t  |tr |              |0:0|1:0|2:0|
            // ---+===+===+===+---        ---+===+===+===+---
            //    | l |   | r |              |0:1|1:1|2:1|
            // ---+===+===+===+---        ---+===+===+===+---
            //    |bl |b  |br |              |0:2|1:2|2:2|
            // ---+===+===+===+---        ---+===+===+===+---
            //    |   |   |   |              |   |   |   |
            increment(this.byPassable, n, delta, cn, type)   // (9)
            if (pos.tl && pos.mx && pos.my) { // -s-1 (a)
              increment(this.byPassable, n - rowLength - entryLength, delta, cn, type)
            }
            if (pos.t && pos.my) { // -s (b)
              increment(this.byPassable, n - rowLength, delta, cn, type)
            }
            if (pos.tr && pos.mx != maxX && pos.my) { // -s+1 (C)
              increment(this.byPassable, n - rowLength + entryLength, delta, cn, type)
            }
            if (pos.r && pos.mx != maxX) { // +1 (d)
              increment(this.byPassable, n + entryLength, delta, cn, type)
            }
            if (pos.br && pos.mx != maxX && pos.my != maxY) { // s+1 (e)
              increment(this.byPassable, n + rowLength + entryLength, delta, cn, type)
            }
            if (pos.b && pos.my != maxY) { // s (f)
              increment(this.byPassable, n + rowLength, delta, cn, type)
            }
            if (pos.bl && pos.mx && pos.my != maxY) { // s-1 (g)
              increment(this.byPassable, n + rowLength - entryLength, delta, cn, type)
            }
            if (pos.l && pos.mx) { // -1 (h)
              increment(this.byPassable, n - entryLength, delta, cn, type)
            }
          }
        })
      }.bind(this)
*/

      var recalcGuarded = function (pos, options) {
        this.bySpot.findAtCoords(pos.mx, pos.my, pos.mz, spotSchema.guarded,
          function (guarded, $2, $3, $4, l, n) {
            if (guarded !== false) {
              n -= spotSchema.guarded
              var id = this.bySpot.atContiguous(n + spotSchema.id, l)
              var delta = this.bySpot.atContiguous(n + spotSchema.actionable, l) === this.constants.spotObject.actionable.actionable
              var guardedPos = delta ? [pos.mx, pos.my, pos.mz] : this.actionableSpot(id)
              var guardedType = this.byPassable.atCoords(guardedPos[0], guardedPos[1], guardedPos[2], passableSchema.type, 0)
              for (var y0 = pos.my - delta, y1 = pos.my + delta, y = y0; y <= y1; y++) {
                for (var x0 = pos.mx - delta, x1 = pos.mx + delta, x = x0; x <= x1; x++) {
                  this.bySpot.setAtCoords(
                    x, y, pos.mz,
                    this.bySpot.findAtCoords(x, y, pos.mz, spotSchema.id, id),
                    spotSchema.guarded,
                    this.byPassable.atCoords(x, y, pos.mz, passableSchema.type, 0) === guardedType
                      ? this.constants.spotObject.guarded.guarded
                      : this.constants.spotObject.guarded.terrain,
                    options
                  )
                }
              }
            }
          }, this)
      }.bind(this)

      var oadd_type = function (obj, options) {
        this.byType.addAtCoords(obj.type, 0, 0, [obj.id], options)
      }.bind(this)

      var oadd_owner = function (obj, options) {
        this.byOwner.addAtCoords(obj.owner, 0, 0, [obj.id], options)
      }.bind(this)

      // Should be called after oadd_spot().
      var oadd_passable = function (obj, options) {
        this.walkObjectBox(obj, 1, function (pos) {
          if (obj.displayOrder >= 0) {
            var n = this.byPassable.toContiguous(pos.mx, pos.my, pos.mz, 0)
            if (!+(obj.passable[pos.on] || 1)) {
              increment(this.byPassable, n + passableSchema.impassable, +1, options)
            }
            if (+obj.actionable[pos.on]) {
              increment(this.byPassable, n + passableSchema.actionable, +1, options)
              obj.actionableFromTop || increment(this.byPassable, n + passableSchema.actionableNH, +1, options)
            }
          }
          if (obj.passableType) {
            var recalc
            obj.passableType.forEach(function (value, prop) {
              if (value !== null) {
                // Assuming there's only 1 tile affecting byPassable.type (i.e.
                // no dirt + water).
                recalc |= this.byPassable.setAtCoords(pos.mx, pos.my, pos.mz, 0, prop, value, options) != null
              }
            }, this)
            recalc && recalcGuarded(pos, options)
          }
        })
        //if (obj.type == this.constants.object.type.monster) {
        //  incrementGuarded(obj, +1)
        //}
      }.bind(this)

      var oadd_spot = function (obj, options) {
        if (obj.type == this.constants.object.type.monster) {
          var guardedPos = this.actionableSpot(obj)
          var guardedType = this.byPassable.atCoords(guardedPos[0], guardedPos[1], guardedPos[2], passableSchema.type, 0)
        }
        this.walkObjectBox(obj, 2, function (pos) {
          this.bySpot.addAtCoords(pos.mx, pos.my, pos.mz, {
            id: obj.id,
            type: obj.type,
            displayOrder: obj.displayOrder,
            actionable: +obj.actionable[pos.on]
              ? this.constants.spotObject.actionable.actionable
              : +(obj.passable[pos.on] || 1) ? false
                : this.constants.spotObject.actionable.impassable,
            guarded:
              guardedPos &&
              Math.abs(pos.mx - guardedPos[0]) <= 1 &&
              Math.abs(pos.my - guardedPos[1]) <= 1
                ? guardedType === this.byPassable.atCoords(pos.mx, pos.my, pos.mz, passableSchema.type, 0)
                  ? this.constants.spotObject.guarded.guarded
                  : this.constants.spotObject.guarded.terrain
                : false,
            corner:
              (pos.tl ? '1' : '0') +
              (pos.tr ? '1' : '0') +
              (pos.br ? '1' : '0') +
              (pos.bl ? '1' : '0'),
          }, options)
        })
      }.bind(this)

      // obj_miniMap - object being added or removed. cell - current mini-map
      // cell state. Determines if that state needs to be changed.
      // Returns 0 (may refresh or not), 1 (need refresh), -1 (don't).
      //
      //   obj.miniMap | equ | cell_type    | if adding | if removing
      // | -2 movable  | 3 > | 0 passable   | yes       | N/A
      // | -2 movable  | 3 > | 1 impassable | yes       | N/A
      // | -2 movable  | 3 > | 2 ownable    | yes       | N/A
      // | -2 movable  | 3 = | 3 movable    | any       | yes
      // |  0 ownable  | 2 > | 0 passable   | yes       | N/A
      // |  0 ownable  | 2 > | 1 impassable | yes       | N/A
      // |  0 ownable  | 2 = | 2 ownable    | any       | yes
      // |  0 ownable  | 2 < | 3 movable    | no        | no
      // | -1 impass.  | 1 > | 0 passable   | yes       | N/A
      // | -1 impass.  | 1 = | 1 impassable | any       | yes
      // | -1 impass.  | 1 < | 2 ownable    | no        | no
      // | -1 impass.  | 1 < | 3 movable    | no        | no
      // | >0 passable | 0 = | 0 passable   | any       | yes
      // | >0 passable | 0 < | 1 impassable | any       | yes (!)
      // | >0 passable | 0 < | 2 ownable    | no        | no
      // | >0 passable | 0 < | 3 movable    | no        | no
      // (!) Impassable color depends on the underlying passable and if
      //     removing the latter then impassable may change color.
      // "any" means there's ambiguity which tile of the same type to display
      // on the map so "any" of them is good enough.
      function mmNeedRefresh(obj_miniMap, cell_type) {
        var equ = mmTypeFromObject(obj_miniMap)
        if (equ == 0 && cell_type == miniImpassable) {  // (!)
          return 0
        } else {
          return _.sign(equ - cell_type)
        }
      }

      function mmTypeFromObject(obj_miniMap) {
        switch (obj_miniMap) {
          case 0:   return miniOwnable
          case -2:  return miniMovable
          case -1:  return miniImpassable
          default:  return miniPassable
        }
      }

      var mmSetAt = function (n, obj, pos, options) {
        this.miniMap.setAtContiguous(n + miniSchema.type, 0, mmTypeFromObject(obj.miniMap), options)
        if (obj.miniMap == 0 || obj.miniMap == -2) {    // ownable/movable
          this.miniMap.setAtContiguous(n + miniSchema.owner, 0, obj.owner, options)
        } else if (obj.miniMap == -1) {   // impassable
          var terrain = this.bySpot.findAtCoords(pos.mx, pos.my, pos.mz, spotSchema.id,
            function (id) {
              var obj_miniMap = this.objects.atCoords(id, 0, 0, miniMapIndex, 0)
              if (obj_miniMap > 0) {  // existing and passable
                return obj_miniMap
              }
            }, this)
          this.miniMap.setAtContiguous(n + miniSchema.terrain, 0, terrain || 1 /*any passable terrain type if none found*/, options)
        } else {  // passable
          this.miniMap.setAtContiguous(n + miniSchema.terrain, 0, obj.miniMap, options)
        }
      }.bind(this)

      function mmAffectsCell(obj, on) {
        return obj.miniMap !== false &&
          // Mini-map always shows passable terrain tiles (but they have lowest
          // priority) while other objects (impassable terrain, ownable
          // structures, movable heroes) are shown only in their impassable points.
          (obj.miniMap > 0 || !+(obj.passable[on] || 1))
      }

      // Should be called after oadd_spot().
      var oadd_miniMap = function (obj, options) {
        if (obj.miniMap === false) { return }
        this.walkObjectBox(obj, 1, function (pos) {
          if (mmAffectsCell(obj, pos.on)) {
            var n = this.miniMap.toContiguous(pos.mx, pos.my, pos.mz, 0)
            var type = this.miniMap.atContiguous(n + miniSchema.type, 0)
            // Rare case when no mini-map cell exists yet. One example when
            // this happens is adding the first hero in availableHeroes at
            // the map margin.
            if (type == null) {
              // mmSetAt() will set all the fields.
              this.miniMap.addAtContiguous(n, {type: 0, terrain: 0}, options)
            } else if (mmNeedRefresh(obj.miniMap, type) != 1) {
              return
            }
            mmSetAt(n, obj, pos, options)
          }
        })
      }.bind(this)

      // Should be called after oremove_spot().
      var oremove_miniMap = function (obj, options) {
        if (obj.miniMap === false) { return }
        this.walkObjectBox(obj, 1, function (pos) {
          if (mmAffectsCell(obj, pos.on)) {
            var n = this.miniMap.toContiguous(pos.mx, pos.my, pos.mz, 0)
            var type = this.miniMap.atContiguous(n + miniSchema.type, 0)
            if (mmNeedRefresh(obj.miniMap, type) != -1) {
              // Determine which object at this spot should dictate cell
              // appearance on the mini-map. That is, object with highest
              // miniMap value.
              var anchors = []
              this.bySpot.findAtCoords(pos.mx, pos.my, pos.mz, spotSchema.id,
                function (id) {
                  var obj = updater.atter(id, 0, 0, 0)
                  // It may happen that one update batch contains a removed object and a changed object positioned on the box of the removed one. For example, if town owner changes and a visiting hero of that town is removed (as it happens when player loses). In this case town's change may be due for updating first; oremove_spot for hero (called by objectRemoved) is called after oremove_miniMap + oadd_miniMap for town (called by propertiesChanged) and bySpot (while walking the town's box) temporarily references a deleted object (the hero).
                  if (obj.id) {
                    var on = (pos.mx - obj.x) + (pos.my - obj.y) * obj.width
                    if (mmAffectsCell(obj, on)) {
                      anchors[mmTypeFromObject(obj.miniMap)] = obj
                    }
                  }
                }, this)
              if (anchors.length) {
                mmSetAt(n, anchors.pop(), pos, options)
              } else {  // no objects at this spot, remove the mini-map cell
                this.miniMap.removeAtContiguous(n, 0, options)
              }
            }
          }
        })
      }.bind(this)

      var oremove_type = function (obj, options) {
        this.byType.removeAtCoords(obj.type, 0, 0,
          this.byType.findAtCoords(obj.type, 0, 0, 0, obj.id),
          options)
      }.bind(this)

      var oremove_owner = function (obj, options) {
        if (obj.owner) {
          this.byOwner.removeAtCoords(obj.owner, 0, 0,
            this.byOwner.findAtCoords(obj.owner, 0, 0, 0, obj.id),
            options)
        }
      }.bind(this)

      // Should be called after oremove_spot().
      var oremove_passable = function (obj, options) {
        this.walkObjectBox(obj, 1, function (pos) {
          if (obj.displayOrder >= 0) {
            var n = this.byPassable.toContiguous(pos.mx, pos.my, pos.mz, 0)
            if (!+(obj.passable[pos.on] || 1)) {
              increment(this.byPassable, n + passableSchema.impassable, -1, options)
            }
            if (+obj.actionable[pos.on]) {
              increment(this.byPassable, n + passableSchema.actionable, -1, options)
              obj.actionableFromTop || increment(this.byPassable, n + passableSchema.actionableNH, -1, options)
            }
          }
          if (obj.passableType) {
            var recalc
            obj.passableType.forEach(function (value, prop) {
              if (value !== null) {
                // Given that SoD doesn't allow two terrains, two roads or two
                // rivers on the same spot, if the removed obj has provided
                // specific passableType prop then we assume no other object
                // on that spot has provided prop and set it to false.
                recalc |= this.byPassable.setAtCoords(pos.mx, pos.my, pos.mz, 0, prop, false, options) != null
              }
            }, this)
            recalc && recalcGuarded(pos, options)
          }
        })
        //if (obj.type == this.constants.object.type.monster) {
        //  incrementGuarded(obj, -1)
        //}
      }.bind(this)

      var oremove_spot = function (obj, options) {
        this.walkObjectBox(obj, 1, function (pos) {
          this.bySpot.removeAtCoords(pos.mx, pos.my, pos.mz,
            this.bySpot.findAtCoords(pos.mx, pos.my, pos.mz, spotSchema.id, obj.id),
            options)
        })
      }.bind(this)

      var indexes = _.map(_.values(this._indexes), function (p) { return this[p] }, this)

      updater.on({
        objectAdded: function (now, n, options) {
          indexes[0].batch(indexes, function () {
            oadd_type(now, options)
            oadd_owner(now, options)
            oadd_spot(now, options)
            oadd_passable(now, options)
            oadd_miniMap(now, options)
          })
        },

        objectRemoved: function (old, n, options) {
          indexes[0].batch(indexes, function () {
            oremove_type(old, options)
            oremove_owner(old, options)
            oremove_spot(old, options)
            oremove_passable(old, options)
            oremove_miniMap(old, options)
          })
        },

        '=propertiesChanged': function (sup, now, old, changed, n, options) {
          indexes[0].batch(indexes, function () {
            var owner = changed.has(updater.atter.ownerIndex)
            var width = changed.has(updater.atter.widthIndex) ||
                        changed.has(updater.atter.heightIndex)
            var x = changed.has(updater.atter.xIndex) ||
                    changed.has(updater.atter.yIndex) ||
                    changed.has(updater.atter.zIndex)
            var displayOrder = changed.has(updater.atter.displayOrderIndex)
            // If sign was changed (became in/visible).
            var doSign = displayOrder &&
                         (old.displayOrder >= 0) != (now.displayOrder >= 0)
            var passable = changed.has(updater.atter.passableIndex)
            var actionable = changed.has(updater.atter.actionableIndex)
            var passableType = changed.has(updater.atter.passableTypeIndex)
            var actionableFromTop = changed.has(updater.atter.actionableFromTopIndex)

            // Remember to update indexProperties if testing new properties.

            ;(width || x || displayOrder || actionable) && oremove_spot(old, options)
            ;(width || x || doSign || passable || actionable || passableType || actionableFromTop) && oremove_passable(old, options)
            owner && oremove_owner(old, options)
            ;(owner || width || x || passable) && oremove_miniMap(old, options)

            ;(width || x || displayOrder || actionable) && oadd_spot(now, options)
            ;(width || x || doSign || passable || actionable || passableType || actionableFromTop) && oadd_passable(now, options)
            owner && oadd_owner(now, options)
            ;(owner || width || x || passable) && oadd_miniMap(now, options)
          })
        },
      }, this)

      updater.attach()
    },

    // Returns an object-oriented (rather than array-oriented) representation of the `'id object in `[this.objects`] as a convenient object instance.
    //
    //> id int `- object's ID (X coordinate)
    //> create bool`, omitted = true `- if `'false, returns `'null if there's no
    //  representation for `'id yet, else always returns an object
    //= `#ObjectRepresentation`, null if `'create is `'false
    //
    // Returned instance is more convenient to work with than `#ObjectStore as
    // a whole. However, they are also slower and need more memory so do not
    // abuse this method.
    //
    // Returned objects remain alive until the underlying object is removed.
    // Do not call `'remove() on the result manually, but it's okay to listen
    // to it.
    representationOf: function (id, create) {
      return this._reps.nested(id) ||
             ((create || create == null) && this._makeRepresentationOf(id))
    },

    _makeRepresentationOf: function (id) {
      // XXX=R here and in other files: anyAtCoords doesn't check for bounds but very often need to check both in-bounds and "any object"; need to either add another method that checks for both or make any... check bounds
      if (!this.objects.anyAtCoords(id, 0, 0, 0)) {
        throw new Error('No such object.')
      }

      var type = this.objects.atCoords(id, 0, 0, 'type', 0)
      var cls

      switch (type) {
        case this.constants.object.type.hero:
          cls = Map.Indexed.Hero
          break
        case this.constants.object.type.town:
          cls = Map.Indexed.Town
          break
        case this.constants.object.type.mine:
          cls = Map.Indexed.Mine
          break
        case this.constants.object.type.dwelling:
          cls = Map.Indexed.Dwelling
          break
        default:
          cls = Map.ObjectRepresentation.OnMap.Common
      }

      return this._reps.nest(new cls({
        id: id,
        objects: this.objects,
        map: this,
      }))
    },
  })

  // Playable map player.
  Map.Player = Common.Sqimitive.extend('HeroWO.Map.Player', {
    // See comments in databank/core.php for info on these fields.
    _opt: {
      player: 0,    // 0 for neutral
        // XXX=R replace neutral checks that look like so: !p.get('player') with a new prop/method check: p.isNeutral
      team: 0,
      maxLevel: 0,
      controllers: [],
      controller: 0,
      homeless: false,
      towns: [],
      town: false,
      startingTown: false,
      startingHero: false,
      startingHeroClasses: false,
      heroes: [],
      nextHero: 0,
      bonus: false,
      bonusGiven: false,
      // + resources_RESOURCE: 0,
      connected: false,
      interactive: false,
      won: false,   // may change from false to non-false and from non-false to 2 (mixed win/loss)
      host: false,
      availableHeroes: [],    // internal to H3.Rules, don't use
      confirmed: false,
      handicap: 0.0,
      // XXX we should have a property for custom player names, to replace obtaining display name from rules (Player->$name)
      label: '',
      // For internal use by master RPC.
      //
      // Some actions can be performed when player's Screen is in a certain state. For example, it's impossible to exchange artifacts unless the hero trade window is opened, and opening it may require spending APs, hence it is important to track to disallow AP-free trading. Normally, change_screen is accompanied by new transition (always nested after the change). If adding new screen, make sure to reset it if user conditions change (for example, 'townscape' is reset when screenTown no longer exists or belongs to this player).
      //
      // Technically, combat could be a screen but it has its own state and checks so we allow room in the implementation to carry out simultaneous combats and/or unrestricted ADVMAP commandment (combating objects will be unavailable anyway thanks to AObject->$pending).
      screen: '',   // '' (ADVMAP), townscape (because triggers encounter on enter), hireDwelling (spends AP if hero cannot stand on the dwelling object)
      screenTown: 0,  // townscape
      screenHero: 0,  // hireDwelling
      screenDwelling: 0,   // hireDwelling
    },

    storeSchema: {},

    events: {
      '+normalize_availableHeroes': function (res, now) {
        return Common.normIntArrayCompare(now, this.get.bind(this, 'availableHeroes'))
      },

      '+normalize_bonusGiven': Common.normBool,
      '+normalize_connected': Common.normBool,
      '+normalize_interactive': Common.normBool,
      '+normalize_host': Common.normBool,
      '+normalize_confirmed': Common.normBool,
    },

    // Returns true if a human user is controlling this player, as opposed to an AI doing so.
    isHuman: function () {
      return this.get('controllers')[this.get('controller')].type == 'human'
    },

    // Returns true if this player is still in game and can become interactive in a new round (on game date change).
    //
    // Returning false for disconnected players to prevent online players from waiting for them.
    canTakeTurn: function () {
      return this.get('won') === false && (!this.isHuman() || this.get('connected'))
    },
  })

  // Conditions for player to win a map.
  Map.Victory = Common.Sqimitive.extend('HeroWO.Map.Victory', {
    // See comments in databank/core.php for info on these fields.
    _opt: {
      achieved: [],
      impossible: false,
      type: 0,
      allowAI: true,
      artifact: 0,
      unit: 0,
      unitCount: 0,
      resource: 0,
      resourceCount: 0,
      object: false,
      objectType: 0,
      townHall: 0,
      townCastle: 0,
      townGrail: false,
    },

    storeSchema: {},
  })

  // Conditions for player to lose a map.
  Map.Loss = Common.Sqimitive.extend('HeroWO.Map.Loss', {
    // See comments in databank/core.php for info on these fields.
    _opt: {
      achieved: [],
      impossible: false,
      type: 0,
      object: false,
      objectType: 0,
      time: 0,
    },

    storeSchema: {},
  })

  // Holds data for performing a smooth transition from one game state to another.
  //
  // When an object changes, the game UI reflects this change immediately unless it's part of a "transition" - then the user sees an animation or some other "visual" form of a gradual change. (Some transitions like `'combatMoraleGood never appear in change events but otherwise they are the same.)
  //
  // A single transition may group multiple changes (e.g. to X and to Y of a hero object on the adventure map). Master adds new placeholder transition before making the changes and passes unique ID under `'transition option of every such change (usually to events). The transition remains in preparatory phase until `'final is set at some point after all related changes have been made (for example, hero movement involves changing hero's position one step at a time, to account for side effects on the map, and transition gets `'final after the last step). `'_opt'ions holding transition details (e.g. traveled path) are only changed while `'final is unset. `'type is set when transition is created and does not change at all.
  //
  // On the client side, transitions are grouped under each `#Screen's `'transitions - an ordered collection of "views" of each `#Map transition that is meant for showing on this display. Transitions are played one by one in strict order of creation on the server side. Placeholder transitions (not `'final) block playing of remaining transitions, even if the latter are ready. Client UI usually ignores changes with set `[options.transition`] until it starts playing the associated transition (which, again, is always finalized after these changes arrive).
  //
  // A matching child always exists in `[map.transitions`] for all `[options.transition`] values (but not in a particular `#Screen's `'transitions). All transitions are eventually `'final'ized.
  //
  // This concept is similar to but separate from Sqimitive's `#batch() (`'batchID, `'operationID), Map's `'screen and AObject's $pending, dealing specifically with "visualized" changes. Unlike batch(), transition ID (keys of `[map.transitions`] children and `[options.transition`] values) is the same across master and all clients. ID is a growing number, always truthy and will never duplicate in this game.
  //
  // There's no need to handle all transitions - for example, if user has disabled map move animation or when a transition concerns another player (transitions may be broadcast across all players). Ignore transitions either by returning `'false from `'select or by doing nothing in Screen's `'tick (so that transition is removed immediately after `'tick returns, unless there are other listeners to `'tick).
  //
  //# Collecting data
  // Working with transitions is generally tricky because they lag behind the world's state, such as animating a creature that is already removed (dead). For this reason be ultra-careful when accessing the world (`#Map, etc.) during transition processing. If an event arrives that removes an entity and that event's `'options has `'transition, store DOM nodes and other data that you may need for animation and remove them when finishing processing the last transition that may use them (like 'combatDie').
  //
  // Same with "simple" values like X/Y (numbers, etc.) - store their original values when a "change" is triggered with `[options.transition`] set, and use them rather than current values when playing the transition (because current values may be well into the "future" and would cause desynchronization). Alternatively, store them in response to Screen's `'collect.
  //
  // Again, store values in response to change events and/or `'change_collect on `@Map.transitions`@ or `'collect on `@Screen.transitions`@. Do not use `'final or `'tick for that because they may happen much later after the change.
  //
  // For example, there is a transition already playing and a new `'combatDie transition is created and `'collect'ed, then the creature's object is removed and the transition is again `'collect'ed and then `'final'ized. `'combatDie is still not ready for playing because of the first transition. If you attempt accessing the object's values at any occasion except the first `'collect, you'll find the object already gone.
  //
  // Remember that transitions are proper sqimitives and can store arbitrary data (this mostly applies to their Screen views) that you don't event have to serialize because transitions start and finish entirely within the same session (page load).
  //[
  //    hero.on('change_experience', function (now, old, options) {
  //      if (options.transition) {
  //        this.sc.transitions.nested(options.transition).set('oldExperience', old)
  //      }
  //    })
  //]
  //
  // Remember that transition's properties may change before it becomes `'final.
  //[
  //    obj.on('change_foo', function (now, old, options) {
  //      if (options.transition) {
  //        // Transition are not final before its change events fire,
  //        // thus reading its _opt is an error - they may not be finalized yet.
  //        map.transitions.nested(options.transition).get('bar')
  //      }
  //    })
  //]
  //
  //# Ticks
  // Screen's `'transtiions acts as a central "controller" entity that runs each transitions in a generic manner by calling `'tick the `'ticks number of times. However, each `'tick is handled by specific `#Module, e.g. `'combatDie is handled by `@H3.DOM.Combat`@.
  //
  // However, certain transitions concern generic modules
  // (e.g. `#Bits) that know nothing of `'type-s they might be
  // part of. Instead, they attach to specific steps in playing that transition
  // and do their small job while the "controller" runs the overall execution.
  //
  // For example, moving a hero over the adventure map involves changing his
  // position (X/Y coords) and `'actionPoints. When a move happens, the object should start animating a one-cell move and decrement `'actionPoints just by one point, then wait until the animation completes and animate another one-cell move together with `'actionPoints decrease, and so on. Not only this asynchronicity complicates things, it's also the fact that position is controlled by `@DOM.Map`@ while `'actionPoints - by `@H3.DOM.Bits.HeroAP`@.
  //
  // To reduce code coupling, transitions are split into "ticks". Each `'tick() receives an
  // `#Async object that it may nest new children to, if it's using asynchronous
  // playing (like `'M below). The "controller"
  // calls `'tick(0) when it starts playing the transition and hooks completion (`#whenComplete()) of its main `#Async (which may be empty if all handlers were synchronous), calling `'tick(1), `'tick(2), etc. in the same fashion.
  //
  //[
  //    |          |  < change_playing
  //    ---step 1---  < tick(0)
  // T  | M   D    |  M - animate(move by 1 cell) - new Async
  //    | m        |  m - Async playing (status == null)
  // i  | m        |  D - decrement(AP) - sync
  //    | m        |
  // m  V--step 2--|  < tick(1)
  //    | M   D    |
  // e  | m        |
  //    | m        |
  // .  | m        |
  //    V--step 3--|  < tick(2)
  // .  | ...      |
  //]
  //
  // Every change event with `[options.transition`] includes `[options.transitionTick`] to link the change with the sub-step when it's time to play it.
  // Most `#Transition `'type-s support just one tick (`'tick(0)).
  // Some tick(s) may be skipped if the transition is aborted early.
  //
  // Typical synchronous on-change hook for a `'type-agnostic client looks like this:
  //[
  //  var MyBit = Bits.extend({
  //    events: {
  //      attach: function () {
  //        this.autoOff(this.get('object'), {
  //          change_foo: function (now, old, options) {
  //            if (options.transition) {
  //              // Collect all data needed to play the tick without
  //              // accessing objects on the outside:
  //              var data = {value: now}
  //              // The change is part of a transition, delay the update.
  //              this.autoOff(this.sc.transitions.nested(options.transition), [
  //                '-remove, tick_' + options.transitionTick,
  //                function () {
  //                  this._updateUsing(data)
  //                },
  //              ])
  //            } else {
  //              // Not part of a transition - update the UI immediately.
  //              this.update()
  //              //this._updateUsing(data)
  //            }
  //          },
  //        })
  //      },
  //
  //      // Inherited Bit's _update, called in response to render(), etc.
  //      _update: function () {
  //        this._updateUsing({value: this.get('object').get('foo')})
  //      },
  //    },
  //
  //    // Actual update logic, irrespective of the cause (transition or direct).
  //    // Again, it's imperative that it does not access any outside data to
  //    // avoid problems when playing a transition.
  //    _updateUsing: function (data) {
  //      this.el.css('left', data.value)
  //    },
  //  })
  //]
  // Screen provides `#updateUsing() to simplify this boilerplate:
  //[
  //  var MyBit = Bits.extend({
  //    events: {
  //      attach: function () {
  //        this.autoOff(this.get('object'), {
  //          change_foo: function (now, old, options) {
  //            var data = {value: now}
  //            this.sc.transitions.updateUsing(data, options, this)
  //          },
  //        })
  //      },
  //  // Remainder as before.
  //]
  //
  // Asynchronous update mechanism varies from client to client but the `'tick hook
  // often looks like this:
  //[
  //   transition.on('tick_' + options.transitionTick, function (async) {
  //     this.el.animate({left: value}, {
  //       complete: async.nestDoner()
  //     })
  //     // If playing needs special clean-up, hooking abort() is a wise move:
  //     async.on('abort', function () {
  //       this.el.stop()
  //     })
  //   })
  //]
  //
  //# Known transitions
  // Known transition `'type-s not supporting `'transitionTick:
  //> combatMoraleGood
  //> combatMoraleBad
  //> combatLuckGood
  //> combatDie
  //> combatDefend
  //> combatHit
  //> combatRegenerating
  //> combatShoot/Up/Down
  //> combatAttack/Up/Down
  //> combatHurl/Up/Down
  //> combatRam/Up/Down
  //> combatHurlHit/Miss
  //> combatRamHit/Miss
  //> combatEnd
  //> combatSurrenderAsk
  //> combatGate
  //> combatLog `- used when a log entry appears that can't be attached to any suitable combat... transition
  //> combatSpellArrow
  //> combatSpellArea
  //> combatSpellBuf
  //> combatSpellSummon
  //> heroArtifactSwap
  //> encounterPrompt
  //> encounterChoice
  //> encounterMessage
  //> encounterRemove
  //> townscape
  //> hireDwelling
  //> mapTeleport
  //> mapEmbark
  //> mapDisembark
  //> garrison
  //> tavern
  //> warMachineFactory
  //> shipyard
  //> heroTrade
  //> scholarMessage
  //
  // Known transition `'type-s supporting `'transitionTick:
  //> combatMove `- `'combat, `'creature (key in `'objects), `'path (array of `[x, y`], first = start spot, last = end, length at least 2); this occurs during tactics (but `'transitionTick is always 0) and combat
  //> mapMove
  //> heroExperience
  Map.Transition = Common.Sqimitive.extend('HeroWO.Map.Transition', {
    _opt: {
      // Changes one or more times when `'final is `'false. Signals to clients that world is about to change or has been changed and that the state needed for transition playback must be collected now. Exactly when this happens and what is/has changed and what this value signifies is `'type-dependent. Often, the value equals to the tick to be dispatched next, with maximum value being total ticks plus one. But again, `'collect may be anything.
      //
      // `'change_collect is never batched with another change of this transition's `'_opt.
      //
      // The fact this value is set doesn't imply `'_opt will no longer change.
      //
      // Clients must react to `'change_collect out of order (not only when the transition is on top).
      collect: null,
      // Tells if this transition can start playing. Non-first transitions may have this set but they'll still play in order. If set, no _opt that are not local to clients may change.
      final: false,
      // The number of steps in this transition (see Screen's play()). Most transitions are single-step so ticks defaults to 1. Not used by server. Some transition types may override this value on the client before or during play.
      ticks: 1,
      // Local to clients. In local game or slave mode tells how many Screen-s are not finished with the transition. In server master mode holds the number of server clients yet to do=tack it.
      active: 0,
      // Local to server.
      clients: [],
      // Rules-specific. Always set on construction to allow clients prepare for new transition based on its type.
      type: '',

      // + type-specific options

      // Options affecting Screen selection must be set before select (i.e.
      // collect changing from null).
    },

    unser: {},

    // Most responses to transition state changes are implemented via _opt change events. As a result, listeners to collect, select, final, etc. run within a common batch, delaying new events to changes to this transition generated by those listeners. This shouldn't pose any problem though.
    events: {
      init: function (opt) {
        if (!opt.type || opt.active || opt.collect != null || opt.final) {
          // XXX++B:mstr: Currently fails when loading certain saved games.
          throw new Error('Invalid initial Transition options.')
        }
      },

      '-change': function (name, now, old) {
        _.log && _.log('Transition %s.%s = %j <- %j', this._parentKey, name, now, old)
      },

      // Don't change world state during this.
      change_collect: function (now, old) {
        if (this.get('final')) {
          throw new Error('Cannot set collect after final.')
        }
        old == null && this.select()
      },

      change_final: function () {
        if (this.get('collect') == null) {
          throw new Error('Cannot set final before collect.')
        }
      },

      // "1^" priority allows clients to change active in response to final. At normal "0^" priority, if the client's incrementing hook runs after ours (and it will, unless it's prefixed by "-") then we'd see active is 0 and remove the transition in spite of the following hook making active non-0.
      //
      // Additionally, hooking generic change rather than change_active/final because the latter run first so 1^change_active occurs before first change (no matter the priorities of both), and client may listen to and alter active in change (e.g. AI listens to .change on map.transitions).
      '1^change': function () {
        // Remove the transition once it is no longer used anywhere. In local
        // game or slave mode this happens when all local Screen-s have played
        // it (and/or indicated they won't; the transition may remain on master
        // if other clients of this server are not done with it yet). In slave
        // mode environment must listen to this happening and call do=tack. In server
        // master mode this happens when all clients have reported having played
        // the transition.
        //
        // Removal only happens for final transitions since non-final are still
        // being modified.
        if (!this.get('active') && this.get('final')) {
          this.remove()
        }
      },

      unnest: function () {
        if (this._parent) {
          _.log && _.log('Transition %s removed', this._parentKey)

          if (this.get('active')) {
            throw new Error('Removed an active transition.')
          }
        }
      },
    },

    // Determine affected Screen-s and set _opt.active (synchronously, before
    // this returns). Called among other change_collect hooks (new hooks added
    // here won't be called for the original change_collect from null to non-null).
    //
    // Must happen before dispatching the first event with {transition} in
    // options, to allow determining at the time of change if the transition
    // will be later handled by our Screen or if the UI should be updated
    // immediately.
    //
    // Must happen before select of a later-created transition. If it selects
    // after, it's possible that the second transition will start playing
    // because it happens to be the first in a Screen's queue since the first
    // transition wasn't selected yet (i.e. inserted into the queue) and couldn't block it. When it
    // does become inserted, the second transition will continue to play even if
    // the first is not playing yet.
    select: Common.stub,

    // Triggers world data collection identified by `'tick on clients.
    //
    // May be called multiple times - each time will increment the `[_opt.collect`]
    // number (beginning with 0 when called for the first time).
    //
    //[
    // var tr = map.transitions.nest({type: 'foo', ...})
    // tr.collect()
    // pl.set('resources_gold', 123, tr.options(1, {forceFire: true}))
    // tr.collectFinal()
    //]
    collect: function (tick) {
      this.getSet('collect', function (cur) {
        if (tick == null) { tick = cur == null ? 0 : cur + 1 }
        if (this.isEqual(tick, cur)) {
          // This won't fire any events.
          throw new Error('New collect value is the same as old.')
        }
        return tick
      })
      return this
    },

    // Calls collect() and then sets final.
    collectFinal: function () {
      if (!this.collect().ifSet('final', true)) {
        throw new Error('Transition is already final.')
      }
      return this
    },

    // Use this to generate options for Sqimitive events (set(), etc.).
    //
    // Always returns `'transition and `'transitionTick (= `'tick or 0), plus optional {`'extra}.
    options: function (tick, extra) {
      return _.extend({transition: this._parentKey, transitionTick: tick || 0}, extra)
    },
  })

  // Playable map player, enchanced with indexes like all owned heroes.
  //
  // Unlike `@Map.Player`@, this one makes use of the parent's `@Map.Indexed`@
  // indexes to provide convenient access to heroes, castles, etc., their
  // properties, both for reading and writing (every write affects the master copy
  // in `@Map.objects`@).
  //
  // Client must call `'attach() either immediately if using this object separately
  // or after `'nest'ing.
  Map.Indexed.Player = Map.Player.extend('HeroWO.Map.Indexed.Player', {
    _map: null,     // Map.Indexed
    heroes: null,   // do not set; includes random/placeholder heroes
    towns: null,    // do not set; includes random towns
    mines: null,    // do not set; includes abandoned mines
    dwellings: null,  // do not set; includes random dwellings

    _initToOpt: {
      map: '._map',
    },

    events: {
      init: function () {
        this.heroes = this.nest(new Map.Indexed.Heroes)
        this.towns = this.nest(new Map.Indexed.Towns)
        this.mines = this.nest(new Map.Indexed.Mines)
        this.dwellings = this.nest(new Map.Indexed.Dwellings)
      },

      attach: function () {
        var number = this.get('player')
        this._map.byOwner.findAtCoords(number, 0, 0, 0, this._add, this)

        this.autoOff(this._map.byOwner, {
          'oadd, ochange': function (n, l, props, now) {
            var owner = this._map.byOwner.fromContiguous(n).x
            if (owner == number) {
              this._add(_.isArray(props) ? props[0] /*oadd*/ : now)
            }
          },

          'oremove, ochange': function (n, $, props, now) {
            var owner = this._map.byOwner.fromContiguous(n).x
            if (owner == number) {
              var id = _.isArray(props) ? props[0] /*oremove*/ : now
              var col = this._collectionOf(id)
              col && col.unlist(id)
            }
          },
        })
      },
    },

    _collectionOf: function (id) {
      var type = this._map.objects.atCoords(id, 0, 0, 'type', 0)

      switch (type) {
        case undefined:
        case null:    // object is already removed from store at this point
          return this.find(function (col) { return col.nested(id) })
        case this._map.constants.object.type.hero:
          return this.heroes
        case this._map.constants.object.type.town:
          return this.towns
        case this._map.constants.object.type.mine:
          return this.mines
        case this._map.constants.object.type.dwelling:
          return this.dwellings
      }
    },

    _add: function (id) {
      var col = this._collectionOf(id)
      col && col.nest(this._map.representationOf(id))
    },
  })

  // A read/write view into an object inside an `#ObjectStore.
  //
  // This is an abstract class. Extend it and override `'_properties to list
  // fields you want exposed in this object's `#_opt. Clients of this class can
  // work with object properties disregarding nuances of working with
  // `#ObjectStore. This is of course much less efficient than working with it
  // directly, so only use `#ObjectRepresentation for small number of objects
  // and/or low intensity of operations.
  //
  // Client must call `'attach() immediately or after `'nest.
  //
  // This instance `'remove()'s itself when `'oremove occurs, but it doesn't call
  // `'removeAt... when you call `'remove/`'unnest.
  //
  // Changes in ObjectStore properties are reflected in _opt and vice versa.
  // However, there is a gap between firing change/_OPT and updating the store
  // so do not access the store in response to these events because you may get
  // old values:
  //
  //   rep.on('change_x', function () {
  //     console.log('in store: ', this.get('objects').atCoords(this.get('id'), 0, 0, 'x', 0))
  //   })
  //   rep.getSet('x', x => x + 1)
  //     // assuming old x was 3, the above would log: "in store: 2"
  //   rep.get('objects').setAtCoords(rep.get('id'), 0, 0, 0, 'x', 999))
  //     // "in store: 999"
  Map.ObjectRepresentation = Common.Sqimitive.extend('HeroWO.Map.ObjectRepresentation', {
    // List of properties read from ObjectStore and exposed as `#_opt on `'this.
    //
    //= array of strings property names in `#ObjectStore's schema
    //
    // Only change when creating a new class.
    //
    // Don't list two properties residing on the same index (different members of
    // one union).
    //
    // Names here must not conflict with `#ObjectRepresentation's own `#_opt'ions
    // (`'id, `'removed, etc.).
    _properties: [],

    //> objects `#ObjectStore
    //> id integer `- object's ID, i.e. the X coordinate in `#ObjectStore;
    //  do not change it
    //> n integer`, null to set automatically
    //> removed `- read-only, set to options received from oremove; null if not removed from store yet; has nothing to do with this being nested in a Sqimitive or not
    //> * `- all properties listed in `#_properties
    _opt: {
      objects: null,
      id: 0,
      n: null,
      removed: null,
    },

    events: {
      init: function (opt) {
        if (opt.n == null && opt.objects) {
          this.set('n', opt.objects.toContiguous(opt.id, 0, 0, 0))
        }
      },

      attach: function () {
        this._attachTo(this.get('objects'), this.get('n'))
      },

      // ObjectRepresentation can be used on its own or as part of a collection.
      // In base implementation detaching doesn't happen on unnest because it's
      // unknown which mode is used. Client should call detach() manually.
      remove: 'detach',
    },

    // Adds listeners to keep `'_opt and ObjectStore values in sync.
    _attachTo: function (objects, me) {
      var atter = objects.atter(this._properties)
      var indexes = _.object(_.map(this._properties, objects.propertyIndex, objects), this._properties)
      this.assignResp(atter(me, 0))
      var ochangeForMe = 'ochange_n_' + me

      this.autoOff(objects, [
        // Reflect changes in the store in own _opt. Preserve batches so that
        // store.batch(() => {setAt...(x), setAt...(y)}) results in
        // this.assignResp({x, y}).
        '^' + ochangeForMe, Common.batchGuard(5, function (n, $, prop, now, old, options) {
          var batched = {}

          options.batch
            .forEach(function (event) {
              if (event[0] == ochangeForMe && event[6].rep !== this &&
                  (prop = indexes[event[3]]) != null) {
                // If the same property is changed again in the same batch,
                // override the key to set the latest value, only once.
                batched[prop] = event[4]
              }
            }, this)

          // Passing options through to preserve 'transition', etc.
          options.rep = this
          this.assignResp(batched, options)
        }),

        'oremove_n_' + me, function ($1, $2, $3, options) {
          this.set('removed', options)
          this.remove()
        },
      ])

      // Reflect changes in own _opt into the store. Preserve batches.
      this.fuse('^change', Common.batchGuard(3, function (name, now, old, options) {
        var batched = {}

        options.batch
          .forEach(function (event) {
            if (event[0] == 'change' && event[4].rep !== this) {
              var index = atter[event[1] + 'Index']
              if (index != null) {
                batched[me + index] = event[2] == null ? false : event[2]
              }
            }
          }, this)

        options.rep = this

        objects.batch(null, function () {
          _.each(batched, function (value, n) {
            objects.setAtContiguous(n, 0, value, options)
          })
        })
      }))
    },

    removeFromStore: function (options) {
      this.get('objects').removeAtContiguous(this.get('n'), 0, options)
    },

    detach: function () {
      this.autoOff()
    },
  })

  // A read/write view into an object inside map.objects.
  Map.ObjectRepresentation.OnMap = Map.ObjectRepresentation.extend('HeroWO.Map.ObjectRepresentation.OnMap', {
    map: null,
    _extra: null,

    _initToOpt: {
      map: '.',
    },

    events: {
      detach: function () {
        if (this._extra) {
          this._extra.release()
          this._extra = null
        }
      },
    },

    _extraSub: function () {
      return this._extra = this._extra || this.map.objects.subAtContiguous(this.get('n') + this.map.objects.propertyIndex('extra'), 0)
    },

    // Reads/writes a serializable value associated with this map object that isn't part of its normal ObjectStore schema.
    //
    // Custom user modules and H3.AI.Trivial use it for private data (e.g. heroes assigned to a town).
    //
    // Do not call release() on returned ObjectStore.
    //
    // value cannot be null since it's held in ObjectStore where null means "no object".
    // It cannot be a function either so it's used in get/set fashion.
    //
    // If prop is not null and current $extra store is empty, extra() returns null (if value is null) or automatically adds one object at (0;0;0). Most clients don't work with X > 0 but if you do, it's your job to keep it addressable (extendTo()).
    extra: function (prop, value, cx) {
      var sub = this._extraSub()
      if (prop == null) {
        return sub
      }
      var cur = sub.atCoords(0, 0, 0, prop, 0)
      if (value != null) {
        if (value instanceof Function) {
          value = value.call(cx || this, cur)
        }
        sub.isEmpty() && sub.append({})
        cur = sub.setAtCoords(0, 0, 0, 0, prop, value)
      }
      return cur
    },
  })

  // Collection of ObjectStore views. Automatically calls children's attach() and removeFromStore().
  //
  // Can be _owning and non-_owning.
  Map.ObjectRepresentations = Common.Sqimitive.extend('HeroWO.Map.ObjectRepresentations', {
    _childClass: Map.ObjectRepresentation.OnMap,

    events: {
      '=_defaultKey': function (sup, obj) {
        return obj.get('id')
      },

      nestExNew: function (res) {
        this._owning && res.child.attach()
      },

      // Client of ObjectRepresentations can also use obj.remove() to remove
      // with default options or removeFromStore() with custom options. Manual
      // removal won't break the collection.
      unnested: function (obj) {
        if (this._owning && !obj.get('removed')) {
          obj.removeFromStore()
        }
      },
    },
  })

  // Base class for non-ownable collections of object representations used in Map.Indexed.Player, like player.dwellings.
  Map.Indexed.ObjectList = Map.ObjectRepresentations.extend('HeroWO.Map.Indexed.ObjectList', {
    _owning: false,   // owned by _reps
    // Many Bits use this to listen to children.
    _childEvents: ['change'],
  })

  Map.Indexed.Heroes = Map.Indexed.ObjectList.extend('HeroWO.Map.Indexed.Heroes', {
    _childClass: [Map.Indexed, 'Hero'],
    // change_garrisoned is used by H3.DOM.UI.Bits.HeroList. change_listOrder - Bits.ObjectRepresentationList.
    _childEvents: ['change_garrisoned', 'change_listOrder'],

    movable: function () {
      return this.filter(Common.p('canMove'))
    },

    anyCanMove: function () {
      return this.movable().length > 0
    },
  })

  var commonOnMapRep = [
    'type', 'class', 'subclass', 'mirrorX', 'mirrorY', 'texture', 'width', 'height',
    'x', 'y', 'z', 'displayOrder', 'miniMap', 'animation',
    'duration', 'owner',
  ]

  Map.ObjectRepresentation.OnMap.Common = Map.ObjectRepresentation.OnMap.extend('Map.ObjectRepresentation.OnMap.Common', {
    _properties: commonOnMapRep.concat(),
  })

  Map.Indexed.Hero = Map.ObjectRepresentation.OnMap.extend('HeroWO.Map.Indexed.Hero', {
    // Omitted AObject properties:
    // * read-only: id, type
    // * complex value: passableType, passable, actionable, initialized,
    //   artifacts, garrison, route, extra
    _properties: commonOnMapRep.concat(
      'experience', 'level', 'formation', 'tactics',
      'actionPoints', 'spellPoints', 'resting', 'vehicle',
      'combatCasts',  // recurring
      'garrisoned', 'visiting', 'listOrder'
    ),

    isHero: true,   // to avoid long-winded instanceof

    // Returns true if hero is seen as not yet dealt with during a human's turn.
    canMove: function () {
      // XXX=IC,R 32 is the cost of moving over cobblestone road, i.e. the fastest terrain (see databank-effects.php); https://forum.herowo.net/t/27
      return this.get('actionPoints') > 32 && !this.get('resting') && !this.get('garrisoned')
    },
  })

  Map.Indexed.Towns = Map.Indexed.ObjectList.extend('HeroWO.Map.Indexed.Towns', {
    _childClass: [Map.Indexed, 'Town'],
    // change_listOrder - Bits.ObjectRepresentationList.
    _childEvents: ['change_listOrder'],
  })

  Map.Indexed.Town = Map.ObjectRepresentation.OnMap.extend('HeroWO.Map.Indexed.Town', {
    // Omitted AObject properties:
    // * complex value: available
    // + see Hero
    _properties: commonOnMapRep.concat(
      'formation', 'garrisoned', 'visiting', 'listOrder'
    ),

    isTown: true,
  })

  Map.Indexed.Mines = Map.Indexed.ObjectList.extend('HeroWO.Map.Indexed.Mines', {
    _childClass: [Map.Indexed, 'Mine'],
  })

  Map.Indexed.Mine = Map.ObjectRepresentation.OnMap.extend('HeroWO.Map.Indexed.Mine', {
    _properties: commonOnMapRep.concat(),
  })

  Map.Indexed.Dwellings = Map.Indexed.ObjectList.extend('HeroWO.Map.Indexed.Dwellings', {
    _childClass: [Map.Indexed, 'Dwelling'],
  })

  Map.Indexed.Dwelling = Map.ObjectRepresentation.OnMap.extend('HeroWO.Map.Indexed.Dwelling', {
    _properties: commonOnMapRep.concat(),
  })

  // Root for data of a combat between heroes, towns, monsters, bank guards, etc.
  Map.Combat = Common.Sqimitive.extend('HeroWO.Map.Combat', {
    mixIns: [SequentialKeyStore],
    // In order of turn preference during tactics (attackers first, defenders last). Defeated parties are here (can access _opt.surrendered, etc.) but their object lists are empty (thus not taking turns).
    parties: null,
    // First member - currently taking turn, second - next to move, etc.
    // When becomes empty, 'round' ends (and 'turn' too).
    queue: null,
    // List of combat objects - creatures, obstacles, corpses, etc.
    objects: null,
    // Only includes impassable spots.
    bySpot: null,
    // ObjectStore of combat messages in order of appearance.
    // X is sequential entry # (entries are not grouped by round or turn).
    log: null,

    unser: {
      '': function (resp, options) {
        // Unserialize parties before nesting objects because our index hook will nest Creature-s into corresponding Party.
        this.parties.assignChildren(resp.parties, {schema: 'unser', map: options.map})
        this.objects.assignChildren(resp.objects, {
          newFunc: this.objects.newFunc,
          schema: 'unser',
          keyFunc: function (obj) {
            // Must attach before nesting to not trigger .change of our index hook - it expects to find an already filled object changing, not changing from undefined to current values (as done by assignResp(atter()) in obj.attach()).
            obj.attach()
            return this.keyFunc.apply(this, arguments)
          },
          parties: this.parties,
        })
      },
      parties: false,
      objects: false,
      interactiveParty: function (key, opt) {
        this[opt] = this.parties.nested(key)
      },
      interactiveCreature: function (key, opt) {
        this[opt] = this.objects.nested(key)
      },
      queue: function (children) {
        _.each(children, function (at) {
          this.queue.nest(this.objects.nested(at.key), {pos: at.pos})
        }, this)
      },
      log: function (store, opt) {
        this[opt] = new ObjectStore(store)
      },
    },

    _opt: {
      background: null,  // n in rules.combatBackgrounds
      encounter: 0,   // if combat is part of a GenericEncounter, this is bonus ID
      width: 0,   // dimensions of the combat field in cells
      height: 0,
      x: null,   // set to adventure map coordinates if available
      y: null,
      z: null,
      // Set to Party when waiting for it to make the turn, only if state is 'tactics' or 'turn' - otherwise null.
      //
      // This usually means the first object in queue is moving.
      //
      // When this is non-null, interactiveCreature may or may not be null. When
      // this is null, interactiveCreature is always null.
      interactiveParty: null,
      // One of objects, belonging to one of parties (precisely, to interactiveParty).
      interactiveCreature: null,
      // Null if not started yet (waiting for clients to connect and render).
      state: null,
      round: 0,   // 1-based, first round is 1, 0 is before first 'round' Combat state
      // These three are internal to H3.Rules.RPC, used if tracing.
      logLevel: 0,
      logTimes: [],
      logTime: [],
    },

    events: {
      init: function (opt) {
        if (!opt.width || !opt.height) {
          // We need to construct bySpot with correct dimensions.
          throw new Error('Combat expects width/height given to constructor.')
        }

        this.parties = new Map.Combat.Parties({keyStore: this._opt})
        this.queue = new Map.Combat.Queue
        // Nesting is needed for RPC's combat_nest.
        this.objects = this.nest(new Map.Combat.Objects({keyStore: this._opt}))

        this.bySpot = new ObjectStore({
          strideX: opt.width,
          strideY: opt.height,
          strideZ: 1,
          schema: {key: 0},   // _parentKey in this.objects
          layers: [],
        })

        this.log = new ObjectStore({
          strideX: 0,
          strideY: 0,
          strideZ: 0,
          // XXX=R duplicates with CombatLog in databank.php but there's no way to transfer this schema given MapBuilder doesn't create any combats
          schema: {type: 0, message: 1, party: 2},
          layers: [],
        })

        this._attachIndexes()
      },

      change: function (name, now, old) {
        if (name.match(/^(state)$/)) {
          _.log && _.log('Combat %s.%s = %j <- %j', this._parentKey, name, now, old)
        } else if (name == 'interactiveParty') {
          _.log && _.log('Combat %s.%s = %j <- %j', this._parentKey, name,
                         now && now._parentKey, old && old._parentKey)
        } else if (name == 'interactiveCreature') {
          _.log && _.log('Combat %s.%s = %j <- %j', this._parentKey, name,
                         now && now.get('creature'), old && old.get('creature'))
        }
      },
    },

    // Adds listeners to keep `'bySpot index and `'Party children in sync with `'objects.
    _attachIndexes: function () {
      var bySpot = this.bySpot

      function updateBySpot(old, now, key) {
        if (now.x != old.x || now.y != old.y ||
            now.width != old.width || now.height != old.height) {
          old = objectContiguous(old)
          now = objectContiguous(now)

          // old  - 1 2 - 7 8 .   - remove
          // now  0 1 - 6 7 - .   - add
          bySpot.batch(null, function () {
            while (old.length || now.length) {
              while (old.length && (!now.length || now[now.length - 1] < old[old.length - 1])) {
                var on = old.pop()
                bySpot.removeAtContiguous(on, bySpot.findAtContiguous(on, key))
              }

              while (now.length && (!old.length || now[now.length - 1] > old[old.length - 1])) {
                bySpot.addAtContiguous(now.pop(), [key])
              }

              while (now.length && now[now.length - 1] == old[old.length - 1]) {
                now.pop()
                old.pop()
              }
            }
          })
        }
      }

      var mapWidth = this.get('width')

      // Result in ascending order.
      function objectContiguous(obj) {
        var res = []
        var on = 0

        for (var y = 0; y < obj.height; y++) {
          var yn = (obj.y + y) * mapWidth
          for (var x = 0; x < obj.width; x++) {
            if (!+obj.passable[on++]) {
              res.push(obj.x + x + yn)
            }
          }
        }

        return res
      }

      function reconstruct(cur, batch) {
        for (var event, i = batch.length; event = batch[--i]; ) {
          if (event[0] == 'change') {
            cur[event[1]] = event[3]
          }
        }

        return cur
      }

      this.objects.on({
        nestExNew: function (res) {
          updateBySpot({}, res.child.get(), res.key)

          if (res.child instanceof Map.Combat.Creature) {
            res.child.party.nest(res.child)
          }
        },

        '.-unnest': function (obj) {
          updateBySpot(obj.get(), {}, obj._parentKey)
        },

        '.change': Common.batchGuard(4, function (obj, name, now, old, options) {
          var oldObject = reconstruct(obj.get(), options.batch)

          updateBySpot(oldObject, obj.get(), obj._parentKey)
        }),
      })
    },

    serialize: function () {
      return _.extend(definedOptions(this), {
        interactiveParty: (this.get('interactiveParty') || {})._parentKey,
        interactiveCreature: (this.get('interactiveCreature') || {})._parentKey,
        parties: this.parties.serialize(),
        queue: this.queue.map(function ($, i) {
          return _.pick(this.at(i), 'key', 'pos', _.forceObject)
        }),
        objects: this.objects.serialize(),
        log: this.log.serialize(),
      })
    },

    // Calls `'func for every impassable cell occupied by `'obj.
    walkImpassable: function (obj, func, cx) {
      cx = cx || this

      if (obj instanceof Common.Sqimitive) {    // Combat.Creature/Object
        obj = obj.get()
      }

      return Map.prototype.walkObjectBox(obj, 1, function (pos) {
        if (!obj.passable || !+obj.passable[pos.on]) {
          return func.call(cx, pos)
        }
      })
    },
  })

  // Collection of active combats on map.
  Map.Combat.Combats = Common.Sqimitive.extend('HeroWO.Map.Combat.Combats', {
    mixIns: [SequentialKeys],
    _childClass: Map.Combat,
    _childEvents: ['change_state', 'change_interactiveParty'],
    _serializer: 'serialize',

    // See Party _opt.garrison. take() will be called by the caller.
    provideGarrison: Common.stub,
  })

  // Creature of a party (like hero object on map) that can be part of a combat.
  //
  // This corresponds to the Garrison class in databank/core.php.
  //
  // _opt.id is not Creature->$id but X in party.garrison's store (slot index).
  Map.Combat.Creature = Map.ObjectRepresentation.extend('HeroWO.Map.Combat.Creature', {
    _properties: [
      'creature', 'count', 'maxCombats', 'destroyArtifact','origin',
    ],

    party: null,

    _opt: {
      // Properties that must persist across combats go into ObjectStore (Garrison).
      // Properties specific to a particular combat go here.
      defending: false, // defending stance, lasts until next turn of this creature; n in map.effects if creature is defending
      facing: false,  // true if looking left
      actions: 0,   // number of times the creature has moved during this combat round (usually result of high morale)
      perished: 0,  // number of killed count-s in this stack during this combat
      open: false,  // only for gate; true if passable for enemies
      //mapCountImage*: null, // internal to H3.DOM.Combat
      // Recurring Effect values.
      hitPoints: 0,       // creature_hitPoints
      shots: 0,           // creature_shots
      retaliating: 0,     // creature_retaliating
      strikes: 0,         // creature_strikes

      // Used to determine queue order for creatures with the same speed.
      // Different for each combat but constant during the same combat.
      random: 0,

      queueMove: false, // true if this creature is due for movement in this round
      queueWait: false, // true if this creature has chosen to wait

      // + Map.Combat.Object _opt-s
    },

    _initToOpt: {
      party: '.',
    },

    unser: {
      party: function (value, opt, resp, options) {
        this.party = options.parties.nested(value)
        // For ObjectRepresentation's attach().
        return ['objects', this.party.garrison]
      },
    },

    events: {
      // attach() must be called manually by client.
      // remove() doesn't remove object from store, it only unbinds hooks.
    },

    serialize: function (full) {
      var res = _.extend(
        // removed is not serialized, it may contain non-scalars and should be only used during change_removed/remove().
        _.omit(definedOptions(this), 'objects', 'removed', _.forceObject),
        _.pick(this.get(), _.keys(Map.Combat.Object.prototype._opt).concat(full == _ ? this._properties : []), _.forceObject)
      )
      res.party = this.party._parentKey
      res._class = this.constructor.name
      return res
    },
  })

  // Base collection of sqimitives owned by another collection. Used for party's objects and queue (creatures' turn order).
  //
  // Automatically unnests children when they are removed from the main collection.
  Map.Combat.NonOwning = Common.Sqimitive.extend('HeroWO.Map.Combat.NonOwning', {
    _owning: false,
    _childEvents: ['-unnest'],

    events: {
      '.-unnest': 'unlist.',
    },
  })

  // Particular company taking part in a combat.
  //
  // Party (more precisely, _attachIndexes()) nests alive creatures but it's just an index for Combat's objects and it doesn't own them.
  Map.Combat.Party = Map.Combat.NonOwning.extend('HeroWO.Map.Combat.Party', {
    _childClass: Map.Combat.Creature,
    garrison: null,   // ObjectStore of Garrison
    object: null,     // ObjectRepresentation.OnMap or null (no on-map object)
    player: null,     // Map.Indexed.Player

    _opt: {
      ready: false, // whether client has confirmed that he's ready for first combat state transition (e.g. combat has started and client has loaded all needed resources and displayed combat UI)
      fortifications: null,  // array of Effect::fortification; only informational, doesn't reflect current combat objects, may have duplicates
      placement: null,   // used to determine how to align this Party's creatures and where to draw hero's image
      tactics: null,    // null or int (cell distance)
      // Locator allowing to restore this.garrison ObjectStore after unserializing. By default the only supported format is int (AObject->$id) but clients may set up an array where the first member is that client's unique ID (namespace) and hook `'provideGarrison of `[map.combats`].
      garrison: null,   // do not change
      formation: null,    // used by Generator; may be different from AObject->$formation
      margin: 0,    // used by Generator
      //mapImage*: null,  // internal to H3.DOM.Combat; not defined to be not serialized
      //mapFlagImage*: null,  // internal to H3.DOM.Combat
      //mapAlive*: null,  // internal to H3.DOM.Combat
      // XXX=R since these are mutually exclusive, combine into one option with 'r'/'s'/null (or numeric consts) values?
      retreated: false,
      surrendered: false,
      pendingSurrender: false,  // internal to master
    },

    _initToOpt: {
      object: '.',
      player: '.',
    },

    unser: {
      '': function (resp, options) {
        this.garrison = options.map.combats.provideGarrison(resp.garrison).take()
      },
      object: function (id, $1, $2, options) {
        this.object = id && options.map.representationOf(id)
      },
      player: function (player, $1, $2, options) {
        this.player = options.map.players.nested(player)
      },
    },

    events: {
      '=_defaultKey': function (sup, sqim) {
        return sqim._parentKey  // in Combat.objects
      },

      change: function (name, now, old) {
        _.log && _.log('Party %s.%s = %j <- %j', this._parentKey, name,
          now && typeof now == 'object' ? now + '' : now,
          old && typeof old == 'object' ? old + '' : old)
      },

      '-unnest': function () {
        if (this._parent) {
          this.garrison.release()
        }
      },
    },

    serialize: function () {
      return _.extend(definedOptions(this), {
        object: this.object && this.object.get('id'),
        player: this.player.get('player'),
        pendingSurrender: false,    // complex
        // Children (Creature-s) are not serialized, will be automatically added by _attachIndexes().
      })
    },
  })

  // Collection of companies participating in a combat.
  Map.Combat.Parties = Common.Sqimitive.extend('HeroWO.Map.Combat.Parties', {
    // Parties are ordered by their priority (attacker is typically first) and
    // the order may change so SequentialKeys is needed to not rely on child index to address it
    // (e.g. in $ifCombatParty).
    mixIns: [Common.Ordered, SequentialKeys],
    _childClass: Map.Combat.Party,
    _serializer: 'serialize',

    events: {
      _sorter: function (a, b) {
        // Default _sorter() compares key as strings (since they are strings) but we need them compared as numbers ("2" > "10").
        return b && a.key - b.key
      },
    },

    //> player Map.Indexed.Player`, null neutral party
    //= first `'player's party (there may be multiple per player)
    ofPlayer: function (player) {
      return this.find(function (party) {
        return party.player == player
      })
    },
  })

  // Collection of combat creatures in order of them taking turns during the current round.
  Map.Combat.Queue = Map.Combat.NonOwning.extend('HeroWO.Map.Combat.Queue', {
    mixIns: [Common.Ordered],   // order is based on pos
    _childClass: Map.Combat.Creature,

    events: {
      '=_defaultKey': function (sup, sqim) {
        return sqim._parentKey  // in Combat.objects
      },
    },
  })

  // This holds only objects participating in combat. There is some logical
  // intersection with each party's garrison sub-store but subtle:
  //* only Creature children appear in garrison, not Corpse, Obstacle, etc.
  //* killed creatures are removed from Objects and garrison; removeFromStore()
  //* creatures of retreated/surrendered parties are removed from Objects
  //  but remain in garrison; remove()
  //
  // Therefore Objects does not inherit ObjectRepresentations.
  //
  // child.attach() must be called by client manually. It often calls it and uses (get()) store-provided properties that attach() has set to fill in the remaining _opt before nesting to Objects.
  Map.Combat.Objects = Common.Sqimitive.extend('HeroWO.Map.Combat.Objects', {
    mixIns: [SequentialKeys],
    // Allow any class with compatible _opt, including Creature.
    //_childClass: Map.Combat.Object,
    _childEvents: ['-unnest', 'change'],
    _serializer: 'serialize',

    newFunc: function (opt) {
      var name = opt._class.replace(/.*\./, '')
      return new (name == 'Creature' ? Map.Combat.Creature : Map.Combat.Object[name])
    },
  })

  // Generic object participating in a combat, not necessary interactive.
  Map.Combat.Object = Common.Sqimitive.extend('HeroWO.Map.Combat.Object', {
    _opt: {
      x: null,
      y: null,
      original: null,   // [x, y] of where the object was initially placed; for creatures indicates positions prior to tactics
      width: 0,
      height: 0,
      passable: '',
      special: 0,   // Creature::special; cannot change
      //mapImage*: null,  // internal to H3.DOM.Combat
    },

    unser: {},

    serialize: function () {
      return _.extend(definedOptions(this), {_class: this.constructor.name})
    },
  })

  // Combat object whose sole purpose is to prevent interactive objects from standing on it (or moving across, if not flying).
  Map.Combat.Object.Obstacle = Map.Combat.Object.extend('HeroWO.Map.Combat.Object.Obstacle', {
    _opt: {
      image: '',
      imageType: 0,
      countGroup: 0,
      offsetX: 0,
      offsetY: 0,
    },
  })

  // Combat object marking place where a Creature has previously died.
  Map.Combat.Object.Corpse = Map.Combat.Object.extend('HeroWO.Map.Combat.Object.Corpse', {
    _opt: {
      creature: null,   // instance of Creature, already removed; cannot change
      creatureKey: '',  // old creature's _parentKey; cannot change
    },

    unser: {
      creature: function (cr, opt, resp, options) {
        var obj = new Map.Combat.Creature
        obj.assignResp(cr, options)
        // Not calling obj.attach(), it's not present in the store.
        return [opt, obj]
      },
    },

    events: {
      '+serialize': function (res) {
        // Serializing even properties coming from ObjectStore because this Creature is no longer there.
        res.creature = res.creature.serialize(_)
      },
    },
  })

  return Map
})