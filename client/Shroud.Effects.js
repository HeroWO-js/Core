define(['Common', 'Calculator', 'Shroud'], function (Common, Calculator, Shroud) {
  "use strict"
  var _ = Common._

  // Compact storage for large number of spatial binary effects held in `'Uint8Array and `#Effects.
  //
  // The base `#Shroud class is standalone (where all data is held in bitfields). This subclass integrates with `#Map's `'effects, allowing manipulation of visibility state using the Effect system. This has the following consequences:
  //* one bit (`'effectsMask) is reserved and must not be accessed directly
  //* read operations (`'at...) on spots affected by any `'shroud Effect are much slower
  //* presence of any `'shroud Effect with any of `'$ifX/Y/Z unset has devastating performance impact because `'Effects' `'bySpot index can no longer be relied upon
  //* `'changes is fired on any Effect change and with `'old = `'null; visibility state might not have truly changed (because `#Shroud doesn't store old state for Effects), especially in non`'bySpot mode (above)
  //* generally, the fewer `'shroud Effects there are, the lower the difference with `#Shroud's performance; if there are no such Effects, the difference is negligible
  //
  // Generally, relying on `'shroud Effects in production is discouraged but it may be useful during development where run-time costs less significant than ease of tinkering.
  //
  // XXX=C operation of target=shroud Effects was not tested
  var Effects = Shroud.extend('HeroWO.Shroud.Effects', {
    _schema: null,
    _effects: null,
    _effectsBit: 0,
    _effectCalc: null,
    _targetIndex: null,
    _shroudTarget: null,
    _globalEffects: false,
    _byTargetN: 0,

    _opt: {
      effectsMask: 0,
    },

    _initToOpt: {
      context: false,
      effects: '._effects',
    },

    events: {
      //! +ig +fn=constructor:opt
      //
      // Required `'opt keys specific to `@Shroud.Effects`@ (none may be changed after construction):
      //> effects Effects
      //> context Context for creating calculators and determining `'master
      //> effectsMask int 8-bit with one set bit `- determines which bit of the last (MSB) byte is reserved to indicate there are Effect(s) affecting the tile
      init: function (opt) {
        if (!this._effects || !opt.effectsMask) {
          throw new Error('Mandatory options not provided.')
        }

        this._schema = this._effects.schema()
        this._effectsBit = 31 - this.constructor.clz32(opt.effectsMask) + 8 * (this.get('bytes') - 1)

        if (opt.effectsMask & this.get('visibleMask') == 0) {
          this._effectsBit = ~this._effectsBit
        }

        if (!opt.context.get('master')) {
          this._setEffectsMask = Common.stub
        }
      },

      attach: function () {
        var targetIndex = this._targetIndex = this._effects.propertyIndex('target')
        var shroudTarget = this._shroudTarget = this._effects.constants.effect.target.shroud

        this.autoOff(this._effects, {
          // Not hooking oadd/oremove, hooks on bySpot/byTarget handle that.
          ochange: Common.batchGuard(5, '_effectsChanged'),
        })

        this._byTargetN = this._effects.byTarget.toContiguous(
          this._effects.constants.effect.targetIndex.spot,
          shroudTarget,
          0,
          0
        )

        this._globalEffects = this._effects.byTarget.anyAtContiguous(this._byTargetN)

        var byTargetGuard = {}
        this.autoOff(this._effects.byTarget, [
          'oadd_n_' + this._byTargetN + ', ' +
          'oremove_n_' + this._byTargetN,
          Common.batchGuard(3, '_byTargetChanged', byTargetGuard),
          'ochange_n_' + this._byTargetN,
          Common.batchGuard(5, '_byTargetChanged', byTargetGuard),
        ])

        // effectsMask marks spots with potential Effects; it doesn't try to be precise. This class aims at treating some spots without Effects as Effect-enabled rather than the opposite (i.e. be on the safe side). Otherwise it'd have to reimplement the entire Calculator.Effect logic, with Effect->$tester, $ifRadius, $isAlly, etc. That's why it bails out and uses Calculator to process every spot if there are any non-bySpot Effects (byTarget[spot][shroud].length > 0).
        //
        // This bit is set for all players; we don't try to infer to which players an Effect applies because it again depends on specialized logic ($isAlly, etc.).
        this._effects.bySpot.find(0, function (n, x, y, z, l) {
          if (this._effects.atContiguous(n + targetIndex, 0) == shroudTarget) {
            this._forRange(x, y, z, false, function (x, y, z, player) {
              this._setEffectsMask(x, y, z, player, true)
            }, this)
          }
        }, this)

        var bySpotGuard = {}
        this.autoOff(this._effects.bySpot, {
          'oadd, oremove': Common.batchGuard(3, '_bySpotChanged', bySpotGuard),
          ochange: Common.batchGuard(5, '_bySpotChanged', bySpotGuard),
        })
      },

      '-unnest': function () {
        if (this._effectCalc) {
          this._effectCalc.release()
          this._effectCalc = null
        }
      },

      // Serialized data retains the `'effectsMask bit. When unserializing, `'new must
      // be given an Effects instance
      // that already contains exactly the same set of `'shroud Effects.
      //
      // Alternatively, if Effects are different, you may call
      // `#setWithin`[(false, false, effectsMask, false)`] after `'new but before `'attach() (it sets `'effectsMask based on existing Effects) - this is a special case of normally illegal usage. This option works no matter if you give `'effects to `'new or not.
      //
      // Doing one of the above is required to keep the
      // `'effectsMask bit in sync and not cause inconsistences.
      '+serialize': function (res) {
        res.effectsMask = this.get('effectsMask')
      },
    },

    atContiguous: function (n, restrict) {
      var res = this._globalEffects ? this._effectsBit
        // Point of contention, classical inheritance.
        : Shroud.prototype.atContiguous.apply(this, arguments)

      if (res == this._effectsBit) {
        var coords = this.fromContiguous(n)
        res = this._calculate(coords.x, coords.y, coords.z, coords.player, n)
      }

      return res
    },

    _calculate: function (x, y, z, player, n) {
      this._effectCalc = this._effectCalc || opt.context
        .changeableEffectCalculator({
          class: Effects.Calculator,
          target: opt.effects.constants.effect.target.shroud,
        })
          .take()

      this._effectCalc.assignResp({
        ifX: x,
        ifY: y,
        ifZ: z,
        ifPlayer: player,
        bytes: this._buffer.slice(n, this.get('bytes')),
      })

      this._effectCalc._subCalcs.evict(Calculator.Effect.AFFECTORS)
      return this._effectCalc.updateIfNeeded().get('value')
    },

    _setEffectsMask: function (x, y, z, player, set) {
      var index = this.toContiguous(x, y, z, player) + this._opt.bytes - 1

      set ? this._buffer[index] |= this._opt.effectsMask
        : this._buffer[index] &= ~this._opt.effectsMask
    },

    _byTargetChanged: function () {
      this._globalEffects = this._effects.byTarget.anyAtContiguous(this._byTargetN)

      this.batch(null, function () {
        this._forRange(false, false, false, false, function (x, y, z, player) {
          this._fire_changes([x, y, z, player, this.atCoords(x, y, z, player), null, true])
        }, this)
      })
    },

    _bySpotChanged: function () {
      var changed = new Set   // of bySpot's n
      var options = arguments[5] || arguments[3]

      _.each(options.batch, function (event) {
        switch (event[0]) {
          case 'oadd':
            if (this._effects.atContiguous(event[3][0] + this._targetIndex, 0) != this._shroudTarget) {
              return
            }
            // Can't test target if oremove/ochange because the Effect might have been already removed from this._effects. Just queue this spot for later check.
          case 'oremove':
          case 'ochange':
            changed.add(event[1])
        }
      }, this)

      this.batch(null, function () {
        changed.forEach(this._refreshSpot, this)
      })
    },

    _refreshSpot: function (bySpotN) {
      var spot = this._effects.bySpot.findAtContiguous(bySpotN, function (n) {
        if (this._effects.atContiguous(n + this._targetIndex, 0) == this._shroudTarget) {
          return true
        }
      }, this)

      var c = this._effects.bySpot.fromContiguous(bySpotN)
      this._forRange(c.x, c.y, c.z, false, function (x, y, z, player) {
        this._setEffectsMask(x, y, z, player, spot)
        this._fire_changes([x, y, z, player, this.atCoords(x, y, z, player), null, true])
      }, this)
    },

    _effectsChanged: function ($1, $2, $3, $4, $5, options) {
      var effects = new Set
      var spots = new Set

      var global = options.batch.some(function (event) {
        if (event[0] == 'ochange') {
          switch (event[3]) {
            default:
              var n = event[1]
              if (effects.size != effects.has(n).size) {
                var global = true
                this._effects.bySpot.find(0, function (other, x, y, z, l, bySpotN) {
                  if (other == n) {
                    spots.add(bySpotN)
                    global = false
                  }
                })
                return !global
              }
            case this._schema.ifX:
            case this._schema.ifY:
            case this._schema.ifZ:
            case this._schema.ifRadius:
              // Albeit this class is not optimized for Effects, it does one optimization, namely ignoring changes to properties that should trigger events in bySpot or byTarget, be caught by our listener and do _fire_changes(). Not doing this would double the number of fired 'changes'.
              //
              // For example, if a radial 'shroud' event moves by just one tile (changes $ifX or other), this should cause update only in spots that it left (/) and entered (#), ignoring intersecting (=) spots:
              //
              //    [ ][=][=][ ] > [ ][/][=][#][ ]  (=) still covered (no update)
              //    [=][=][=][=] > [/][=][=][=][#]  (/) abandoned (to update)
              //    [=][=][=][=] > [/][=][=][=][#]  (#) newly covered (update)
              //    [ ][=][=][ ] > [ ][/][=][#][ ]
              //
              // XXX=R This works for bySpot because every change (i.e. assignment of value different from old) causes ochange on bySpot. However, it is fragile with byTarget and depends on implementation details of Effects' BatchIndexUpdater: if $ifX is set while $ifY is not, and $ifY is being set while $ifX is unset - such Effect is still part of byTarget but as of now the updater does remove + add so we still receive ochange. If the updater becomes more intelligent, we would skip change in this switch without receiving ochange in byTarget and doing _fire_changes().
          }
        }
      }, this)

      if (global) {
        this._byTargetChanged()
      } else {
        this.batch(null, function () {
          spots.forEach(this._refreshSpot, this)
        })
      }
    },
  })

  // Supplies set visibility bits of the currently calculated Shroud spot as `'const modifiers with specific priority.
  //
  // For example, if there is a `'shroud Effect with priority 5 and two set `'bit-s 0 and 10, the 10th `'bit overrides the Effect. But if there's be only 0th `'bit, the Effect will determine the calculation's result.
  Effects.Calculator = Calculator.Effect.extend('HeroWO.Shroud.Effects.Calculator', {
    _opt: {
      bytes: null,    // invalidate AFFECTORS after changing this
    },

    events: {
      _staticAffectors: function (affectors) {
        var bytes = this.get('bytes')

        for (var byteIndex = 0; byteIndex < bytes.length; byteIndex++) {
          var bit = byteIndex << 3
          var bits = bytes[byteIndex]

          for (; bits; bit++, bits >>>= 1) {
            if (bits & 1) {
              var priority = this._effects.priority(this._constants.operation.const, bit)
              var ns = affectors[priority] = []
              ns.priority = priority  // needed by AFFECTORS
              ns.affectBit = bit
            }
          }
        }
      },

      '=_affect': function (sup, res, ns) {
        var bit = ns.affectBit
        // $const operation can't combine with other modifiers of the same priority. Since our bit acts as a $const, it means if it's set then it alone determines the result.
        bit == null ? sup(this, arguments) : res.value = bit
      },
    },
  })

  return Effects
})