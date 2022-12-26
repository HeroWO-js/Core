define(['Common'], function (Common) {
  "use strict"
  var _ = Common._

  // Compact storage for large number of spatial binary effects held in `'Uint8Array and, optionally, `#Effects (if using `@Shroud.Effects`@).
  //
  // ` `#Shroud usually stores bits identifying adventure map areas visible to each player. Each spot on the map (tile) has an associated bitfield (one or more physical bytes), each bit representing a particular Effect (such as "revealed by a Cartographer" or "concealed by a Cover of Darkness"). Most significant set bit determines the final spot's state.
  //
  // This implementation is built assuming Little Endian byte order on the target platform.
  //
  // In a way, `#Shroud is similar to the more generic `#ObjectStore. `#Shroud is entirely separate from the rest of HeroWO codebase (except Common.withinCircle()) and
  // can be used on its own. Its API is made intentionally similar to `#ObjectStore's but it has 4+1 dimensions (X, Y, Z, player number and byte index) rather than 3+1 (X, Y, Z and level).
  return Common.Sqimitive.extend('HeroWO.Shroud', {
    _buffer: null,
    _widthByHeight: 0,
    _lastBatch: null,
    _lastChanges: null,

    _opt: {
      width: 0,
      height: 0,
      levels: 0,
      players: 0,
      bytes: 0,
      visibleMask: 0,
    },

    _initToOpt: {
      buffer: false,
    },

    events: {
      //! +ig +fn=constructor:opt
      //
      // To finish initialization, call `'attach() before calling other methods (for both master and slaves).
      // Call `#unnest() to release resources.
      //
      // Possible `'opt keys (unless noted, all required and can't be changed after construction):
      //> width int `- the map's width (X)
      //> height int `- the map's height (Y)
      //> levels int `- the map's depth (underground levels; Z)
      //> players int `- number of players this `#Shroud tracks; typically omits the neutral
      //> bytes int `- number of bytes per every tile of every player; determines bitfields' length (number of bits available for storing visibility state) and may be any integer, even odd or above 4/8
      //> visibleMask int 8-bit `- tells which bits in each byte of the bitfield correspond to the "this tile is visible" state; affects only the sign of `#atContiguous() result
      //> buffer null start empty`, array of octets`, string comma-seprated octets `- initial state; see `#serialize()
      init: function (opt) {
        this._widthByHeight = opt.width * opt.height

        // XL = 144*144*2*8*2 ~ 663k.
        var length = this._widthByHeight * opt.levels * opt.players * opt.bytes
        if (!length) {
          throw new Error('Shroud cannot be empty.')
        }
        var buffer = typeof opt.buffer == 'string'
          ? opt.buffer.split(',') : opt.buffer
        if (buffer && buffer.length != length) {
          throw new Error('Invalid buffer length, must be ' + length + '.')
        }
        if (buffer && Uint8Array.from) {
          this._buffer = Uint8Array.from(buffer)
        } else {
          this._buffer = new Uint8Array(length)
          buffer && this._buffer.set(buffer)  // IE
        }
      },

      '-unnest': function () {
        this._buffer = null
      },

      _dispatchSet: function () {
        var changes = _.values(this._lastChanges)
        this._lastBatch = this._lastChanges = null

        // `'options for `'changes is not as useful as in Sqimitive because `'changes appears at
        // most once per batch, and there are no user options (setAtCoords() parameters). But they help match events of Shroud with other Sqimitives in case of inter-Sqimitive batch().
        changes.length && this.fire('changes', [changes, this._batchOptions()])
      },
    },

    //! +ig
    // Exactly `'false (not `'null/undefined) is taken for "all".
    _forRange: function (x, y, z, player, func) {
      var x0 = x === false ? 0 : x
      var x1 = x === false ? this._opt.width - 1 : x
      var y0 = y === false ? 0 : y
      var y1 = y === false ? this._opt.height - 1 : y
      var z0 = z === false ? 0 : z
      var z1 = z === false ? this._opt.levels - 1 : z
      var p1 = player === false ? this._opt.players - 1 : player

      for (; player <= p1; player++) {
        for (var z = z0; z <= z1; z++) {
          for (var y = y0; y <= y1; y++) {
            for (var x = x0; x <= x1; x++) {
              var value = func.call(this, x, y, z, player)
              if (value != null) { return value }
            }
          }
        }
      }
    },

    // Returns an object compatible with `'opt of `#Shroud's `#constructor.
    //
    // Serialization is instant but arrays/objects inside the resulting object
    // should not be mutated.
    //
    // If using `@Shroud.Effects`@, you also need to provide `'effects and `'context.
    //
    // Returned `'buffer member may be an array of bytes or a string. The `#constructor accepts both just fine.
    //[
    //  var shroud2 = new Shroud(shroud.serialize())
    //  shroud2.attach()
    //]
    serialize: function () {
      var res = _.pick(this.get(), 'width', 'height', 'levels', 'players',
        'bytes', 'visibleMask', _.forceObject)
      // XXX--O Would be interesting to learn which of the two (from() or toString()) is faster.
      res.buffer = Array.from ? Array.from(this._buffer) : this._buffer + ''
      return res
    },

    // Returns text representation of current `#Shroud's content.
    //= string of arbitrary format
    // ` `#contentHash() is used in HeroWO's multi-player integrity checks.
    //
    // See `@ObjectStore.contentHash()`@ for details.
    contentHash: function () {
      return this._buffer + ''
    },

    // Converts coordinates into a contiguous number according to this store's
    // configuration.
    //
    // Contiguous numbers are faster on access.
    //
    //#-bounds
    toContiguous: function (x, y, z, player) {
      return ((z * this._widthByHeight + y * this._opt.width + x)
             * this._opt.players + player) * this._opt.bytes
    },

    // Breaks down a contiguous number into coordinates and `'byte index.
    //
    //#-bounds
    fromContiguous: function (n) {
      var byte = n % this._opt.bytes
      n = (n - byte) / this._opt.bytes
      var player = n % this._opt.players
      n = (n - player) / this._opt.players
      var x = n % this._opt.width
      n = (n - x) / this._opt.width
      var y = n % this._opt.height
      n = (n - y) / this._opt.height
      return {z: n, y: y, x: x, player: player, byte: byte}
    },

    // Determines visibility state of specific spot by its coordinates.
    atCoords: function (x, y, z, player, restrict) {
      return this.atContiguous(this.toContiguous(x, y, z, player), restrict)
    },

    // Determines visibility state of specific spot by its contiguous number.
    //= undefined if invisible due to all spot's bits unset,
    //  int negative if invisible due to the set bit with index `'~result (i.e. two's complement of the returned integer)`,
    //  int 0+ visible due to the set bit with this index
    //> restrict omitted = null`, int bitmask to treat specific bits in `'n as unset
    //
    //#-bounds
    //
    // Returned value can be treated SoD-style as a simple flag (visible/invisible), tested like `[var visible = bit >= 0`] (but not `[bit < 0`] because of `'undefined), or RTS-style as a visibility modifier - for example, completely visible (if bit `'A is set), explored (if bit `'B) or completely invisible (if bit `'C or none - `'undefined). In the latter case in/visibility masks might not matter and you can set `'visibleMask to `'0xFF (causing `#atContiguous() to always return `'undefined or int 0+).
    //
    //?`[
    //  var visibleDueToBit = atCoords(1, 2, 3, 0)
    //  if (visibleDueToBit >= 0) {
    //    setAtCoords(1, 2, 3, 0, visibleDueToBit, false)
    //  }
    // `]
    atContiguous: function (n, restrict) {
      var mask
      var byte = this._opt.bytes

      if (restrict == null) {
        while ((mask = this._buffer[n + --byte]) == 0) {
          if (!byte) { return }   // no bits set, no visibility modifiers
        }
      } else if (byte <= 4) {
        while ((mask = this._buffer[n + --byte] & restrict >>> byte * 8) == 0) {
          if (!byte) { return }
        }
      } else {
        throw new Error('Shroud.atContiguous() doesn\'t support restrict with bytes > 4.')
      }

      var lz = this.constructor.clz32(mask)
      var bit = 31 - lz + (byte << 3)
      return (mask & 0x80000000 >>> lz & this._opt.visibleMask) ? bit : ~bit
    },

    // Calls `'func for every spot with matching state and coordinates.
    //> z false examine spots on all levels`, int
    //> player false examine spots of all players`, int
    //> onlyVisible null call `'func regardless of the spot's visibility state`,
    //  bool call only for visible/invisible spots (determined by sign of `#atContiguous())`,
    //  int call if exactly that bit is set and determines the state (is the MSB)
    //> func `- receives `'x/`'y/`'z/`'player and the MSB (result of
    //  `#atContiguous()); argument format matches first 5 members of `'changes' arrays
    //= mixed as returned by `'func
    //#-bounds
    // ` `#findWithin() returns as soon as `'func returns non-`'null.
    //
    // `'func may change `#Shroud contents at will; every spot is always visited exactly once.
    findWithin: function (z, player, onlyVisible, func, cx) {
      var chunk = this._opt.players * this._opt.bytes

      return this._forRange(0, 0, z, player, function ($1, $2, z, player) {
        var count = this._widthByHeight
        var n = this.toContiguous(0, 0, z, player)
        var x = 0
        var y = 0

        for (; count--; n += chunk) {
          var vis = this.atContiguous(n)

          if (onlyVisible == null ||
              (typeof onlyVisible == 'boolean'
                ? onlyVisible == (vis >= 0) : onlyVisible == vis)) {
            var value = func.call(cx || this, x, y, z, player, vis)
            if (value != null) { return value }
          }

          if (this._opt.width <= ++x) {
            x = 0
            y++
          }
        }
      })
    },

    // Modifies visibility bit of specific spot at given coordinates.
    //
    //= null bit already equals visible`,
    //  false bit changed but visibility state remains the same`,
    //  true bit and state were changed
    //
    //#-bounds
    //
    // ` `#setAtCoords() changes visibility managed by `#Shroud, not Effects (for that use the usual mechanisms - add/remove Effects or change properties of existing Effects).
    //
    // Return value of `#setAtCoords() reflects the immediate state change while `'changes track state from before the batch start:
    //[
    //  batch(null, function () {
    //    setAtCoords(1, 2, 3, 0, 4, true)     //=> true
    //      // batched changes = [[1, 2, 3, 0, 4, 0]]
    //    setAtCoords(1, 2, 3, 0, 4, false)    //=> true
    //      // batched changes = []
    //  })
    //    // no 'changes' fired
    //]
    //
    //# Events and batches
    // If `'bit was changed, `#setAtCoords() fires `'changes at the end of the batch. Because visibility is often changed en masse (e.g. via `#setWithin()), all changes are coalesced into one `'changes event that occurs once per batch at most. This is in contrast with traditional Sqimitive batching where events are delayed but still fired individually.
    //
    // `'changes is given two argument: an array of arrays of `[x, y, z, player, now, old, changed`] and regular `'options (with `'batchID, etc.). `'now and `'old are bit indexes or `'undefined as returned by `#atContiguous(). `'old may be `'null when using Effects and `@Shroud.Effects`@ couldn't determine the spot's original state. Members go in no particular order without duplicates (unique combinations of `'x/`'y/`'z/`'player) and represent only entries with `[now != old`]. If a later `#setAtCoords() within the same batch reverts visibility back to the pre-batch state (see the last example), the associated member is removed which may even cancel the event if there are no other changes.
    //
    // `'changes has entries that changed visibility bit, not necessary state
    // (a spot may be still in/visible, just due to another bit). Many clients only need updating if state has changed, not bit, so they filter the array by `'changed, which is `'true also if `'old is unknown (`'null, for Effects).
    setAtCoords: function (x, y, z, player, bit, visible) {
      var n = this.toContiguous(x, y, z, player)
      var nBuffer = n + (bit >>> 3)
      var old = this._buffer[nBuffer]
      var mask = 1 << (bit & 7)
      var now = visible ? old | mask : old & ~mask

      if (old != now) {
        old = this.atContiguous(n)
        this._buffer[nBuffer] = now

        if (old != (now = this.atContiguous(n))) {
          this._fire_changes([x, y, z, player, now, old, (now >= 0) != (old >= 0)])
          return true
        }

        return false
      }
    },

    _fire_changes: function (args) {
      this.batch(null, function (id) {
        if (this._lastBatch != id) {
          this._lastBatch = id
          this._lastChanges = {}
          this._batch.push(['_dispatchSet'])
        }

        var key = args.slice(0, 4).join()
        var existing = this._lastChanges[key]

        // First change on the spot or a change from Effects (old of null). In case
        // of the latter, setting old of the existing event to null to signal
        // an Effect origin.
        if (!existing || args[5] === null) {
          this._lastChanges[key] = args
        } else if (existing[5] == args[4]) {
          // Non-first change on the spot, new state equals pre-batch() state.
          delete this._lastChanges[key]
        } else {  // non-first change but new state is different from old
          existing[4] = args[4]
        }
      })
    },

    // Modifies visibility bit of all spots at given coordinates.
    //> z false affect spots on all levels`, int
    //> player false affect spots of all players`, int
    //> bit int `- the bit's index
    //> visible bool `- new state
    //#setall
    //= null if all spots had `'bit already set (unset)`,
    //  false if some spot(s) had `'bit different but on no spots `'bit determined
    //  the visibility state`,
    //  true if some spot(s) had `'bit different and new value changed a spot's state
    // Internally calls `#setAtCoords().
    //[
    //    #####   .....   ..#..   .###.     setWithin()
    //    #####   .###.   .###.   #####     setWithinBox(1, 1, 3, 3)
    //    #####   .###.   #####   #####     setWithinDiamond(2, 2, 2)
    //    #####   .###.   .###.   #####     setWithinCircle(2, 2, 2)
    //    #####   .....   ..#..   .###.
    //]
    //#-bounds
    setWithin: function (z, player, bit, visible) {
      var res

      this.batch(null, function () {
        this._forRange(false, false, z, player, function (x, y, z, player) {
          var changed = this.setAtCoords(x, y, z, player, bit, visible)
          if (changed != null) { res = res || changed }
        })
      })

      return res
    },

    // Modifies visibility bit of all spots within given rectangle.
    //#-setall
    //#-bounds
    //#boxinc
    // Coordinates are inclusive (if same, equals to 1x1 box).
    setWithinBox: function (x1, y1, x2, y2, z, player, bit, visible) {
      var res

      this.batch(null, function () {
        for (var y = y1; y <= y2; y++) {
          for (var x = x1; x <= x2; x++) {
            var changed = this.setAtCoords(x, y, z, player, bit, visible)
            if (changed != null) { res = res || changed }
          }
        }
      })

      return res
    },

    // Modifies visibility bit of all spots within given square rotated by 90°.
    //#swd
    //##-setall
    // Range of arguments is not checked except for `'x/`'y/`'radius.
    // `'radius is inclusive (if 0, equals to 1x1 circle).
    setWithinDiamond: function (x, y, radius, z, player, bit, visible) {
      var res

      this.batch(null, function () {
        var dx0 = Math.max(0, Math.min(radius, x))
        var dx1 = Math.min(radius, this.get('width') - x - 1)
        var dy0 = Math.max(0, Math.min(radius, y))
        var dy1 = Math.min(radius, this.get('height') - y - 1)

        for (var dy = -dy0; dy <= dy1; dy++) {
          for (var dx = -dx0; dx <= dx1; dx++) {
            if (Math.abs(dx) + Math.abs(dy) <= radius) {
              var changed = this.setAtCoords(x + dx, y + dy, z, player, bit, visible)
              if (changed != null) { res = res || changed }
            }
          }
        }
      })

      return res
    },

    // Modifies visibility bit of all spots within given (somewhat jagged) square.
    //#-swd
    setWithinCircle: function (x, y, radius, z, player, bit, visible) {
      var res

      this.batch(null, function () {
        Common.withinCircle(x, y, radius,
          this.get('width') - 1, this.get('height') - 1,
          function (x, y) {
            var changed = this.setAtCoords(x, y, z, player, bit, visible)
            if (changed != null) { res = res || changed }
          },
          this
        )
      })

      return res
    },

    // Checks if all spots have the same visibility state within given rectangle.
    //= null if spots have different states`, true if all spots are visible because of different bits`,
    //  int if all visible (>= 0) or invisible (two's complement) due to the same bit`,
    //  false if all invisible due to different bits`, undefined if all invisible due to no set bits in any spot
    //#-bounds
    //#-boxinc
    withinBox: function (x1, y1, x2, y2, z, player) {
      var res

      for (var y = y1; y <= y2; y++) {
        for (var x = x1; x <= x2; x++) {
          var vis = this.atCoords(x, y, z, player)
          if (res === vis) {
            // Keep current value.
          } else if (res === undefined) {
            res = vis   // first spot's value
          } else if (res !== null) {    // first pair of different values
            res = (res >= 0) == (vis >= 0) ? res >= 0 : null
          }
        }
      }

      return res
    },
  }, {
    // Counts the number of leading zero bits in `'n.
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32#polyfill
    clz32: Math.clz32 || function (n) {
      return 31 - (Math.log(n) / Math.LN2 | 0)
    },
  })
})