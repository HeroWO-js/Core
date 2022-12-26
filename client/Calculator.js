define(['Common', 'ObjectStore', 'Effects'], function (Common, ObjectStore, Effects) {
  "use strict"
  var _ = Common._

  function returnObject() {
    return {}
  }

  // Listen to all related objects' changes in attach, as usual. If any object is
  // remove()'d, either remove() self or set that object to null (if allowed by
  // the algorithm).
  //
  // A removed Calculator won't update itself anymore, which is useful if you
  // call release() from `'-update.
  //
  // First calculation may occur immediately or not. Check `'rendered to determine this.
  var Calculator = Common.Sqimitive.extend('HeroWO.Calculator', {
    mixIns: [Common.ContextModule, ObjectStore.TakeRelease],
    _keyOptions: ['id', 'player.player'],
    _shared: null,
    _skipRegRef: false,

    _opt: {
      // Coming from Context.calculator(). This class doesn't use it except for error checking and debug purposes.
      shared: true,   // do not change

      // Subclasses don't have to use this. If they do, this can mean various
      // things. Typical meaning is map.objects ID or dataset entity ID. It exists
      // for base key() implementation.
      id: null,
      // Most subclasses evaluate to one value (this option's value) but this isn't a requirement.
      value: null,
      // Used by most subclasses, when calculation is related to some player
      // (e.g. whether he has enough resources to build a structure).
      //= Map.Indexed.Player`, null
      player: null,
    },

    events: {
      init: function () {
        if (this.constructor.name == Calculator.name) {
          // name is used in key().
          throw new Error('Calculator.extend() was not given a name.')
        }

        if (this.get('shared')) {
          this.fuse('change', function (opt, $2, $3, options) {
            if (!options.calculated) {
              switch (opt) {
                default:
                  // First, the calculator would no longer be in the correct position of Context's pool due to a different key(). But even if opt is not part of key(), changing anything on a shared instance may still lead to unexpected behaviour in other clients using it.
                  throw new Error('Changing ' + opt + ' of a shared ' + this.constructor.name + '.')
                case 'rendered':
                case 'changed':   // Calculator.Effect
                case 'trace':
              }
            }
          })
        }
      },

      attach: function () {
        if (this._initShared != returnObject) {
          this._shared = this.cx.shared(this.constructor.shared, this._initShared, this)
        }
      },

      _update: function () {
        _.log && _.log('Updating %s:%s', this._cid, this)
        this.assignResp(this._calculate(), {calculated: true})
      },
    },

    _calculate: returnObject,
    _initShared: returnObject,

    key: function () {
      var res = [this.constructor.name]

      _.each(this._keyOptions, function (path) {
        // XXX=R replace with picker()/at() of _/Sqimitive?
        path = path.split('.')
        var cur = this
        for (var part; cur && null != (part = path.shift()); ) {
          cur = (cur.get instanceof Function) ? cur.get(part) : cur[part]
        }
        // Differentiate between 'a.b.c' when a is null, when b is null and when
        // neither of them is null because this may affect calculation (generally).
        res.push(path.length + ':' + cur)
      }, this)

      return res.join()
    },

    _regHandler: function (eobj) {
      if (eobj.event.substr(0, 7) == 'change_') {
        this._skipRegRef ? eobj._srr = this._skipRegRef = false : this.take()
      }

      return Common.Sqimitive.prototype._regHandler.apply(this, arguments)
    },

    _unregHandler: function (options, eobj) {
      Common.Sqimitive.prototype._unregHandler.apply(this, arguments)

      if (eobj.event.substr(0, 7) == 'change_' && eobj._srr !== false) {
        // The only case when release() should be called manually is when doing a one-off
        // calculation, without setting up change hooks.
        this.release()
      }
    },
  }, {shared: {}})

  Calculator._mergeProps.push('_keyOptions')

  // This class is built around data validity tree. When calculation is requested, it asks for the 'result' sub-calc which in turn asks for 'affectors' (list of Effects that match the selectors) which asks for 'indexes' (stores with Effect coordinates for traversal) and 'match:n' (whether an Effect matches the selectors) and so on. Each sub-calc listens for changes in data it depends on and invalidates itself, fully (sub-calc is immediately removed and recreated on next calculation) or partially (sub-calc updates itself on the fly). This triggers cascade invalidation of dependent sub-calcs. Multiple sub-calcs may depend on one common sub-calc.
  //
  // For example, invalidation of "selector:ifO" leads to invalidation of everything up the tree, i.e. all sub-calcs except 'indexes':
  //[
  //            result
  //              /
  //          affectors
  //        /    \      \
  //   indexes  match:0  match:1
  //               \      \
  //                \    selector:ifX
  //                 \     /
  //              selector:ifO
  //]
  //
  // When a new calculation is requested, all sub-calcs are created again (except those which invalidated partially) but result of 'indexes' is used immediately, speeding up the calculation.
  //
  // This caching is only one advantage of the system. Another advantage is lazy data providing. For example, some Effects are spatial, i.e. selected by coordinates ($ifX/$ifY/$ifZ). To figure their selectors we need to do some calculations involving the type, coordinates and actionable mask of an object being matched (often _opt.ifObject). Doing that for every calculation would be a waste so we do that on demand, when evaluating any Effect that has those properties set.
  Calculator.Effect = Calculator.extend('HeroWO.Calculator.Effect', {
    delayRender: false,
    // Calculator.Effect's key() also adds all effectProperties _opt'ions.
    _keyOptions: ['initial', 'expand'],

    map: null,
    _effects: null,
    _subCalcs: null,
    _affectors: null,
    _epoch: 0,    // during _calculate(), 1+; this object's update cycle counter
    _schema: null,
    _constants: null,
    _changedTimer: null,
    // Bitfield:
    //> 1 - _invalidate() running
    //> 2 - invalidateGuard called for a batch that's still running
    //> 4 - RESULT invalidated
    _invalidating: 0,

    _initToOpt: {
      map: '.',  // see updateIfNeeded()
    },

    // Calculator.Effect doesn't use inherited id and player but they are still part of _keyOptions and subclasses may use them (you may want to update() when they change).
    //
    // Not changeable options below may be set only prior to first calculation.
    _opt: {
      //= null no updates done on this instance yet`, false value is up to date`, true needs update
      changed: null,   // do not change

      // Controls hooks set up to change `'changed when data this calculation depends on changes.
      //> 0 `- no hooks at all, `'update() does a complete recalculation; fastest for one-time calculation with the same set of selectors when `'update() is never called
      //> 1 `- hooks on own _opt changes only; _opt.changes tracks own selectors but not Effects or other external objects (like ifObject's AObject features used when _opt.expand) which the caller must ensure are not changing; `'update() does partial recalculation of _opt-affected Effects; fastest for one-time calculations with different set of selectors in a tight loop when global object changes in between `'update()-s are known not to affect the calculator
      //> 2 `- hooks on everything, _opt.changed is always up to date, `'update() does nothing (if a calculation was done before); suitable for long-term background tracking
      //
      // This mode also affects sub-calcs of type Calculator.Effect: if listen is 2, they will use 2, else 0.
      listen: 0,    // do not change

      // Threshold determining Effect change listening mechanism. If potential candidate number is below this value, each Effect sets up an ochange listener, else a single listener is set up and indexes are searched for the changed Effect. 0 always uses a single store-wise listener.
      //
      // Also used for changes in $modify/$modifier properties, for Effects that are part of affectors.
      manyListeners: 50,    // do not change

      // Automatically calls `'update() whenever `'changed changes. `'true guarantees up to date `[_opt.value`] and other calculated fields whenever thay are accessed. `'false expects explicit update calls (use `'false when you need `'value on demand and can route all access through `'updateIfNeeded()). `'defer automatically updates about once per frame so `'value is not necessary up to date, unless read in response to `'change_changed and before other changes have invalidated it (use `'defer in GUI, with `'listen of 2).
      //
      // `'true accurately produces change events once per every batch of data changes. This can be potentially taxing and unwanted. For example, if data is meant for reflecting in the UI, it makes sense to ''defer it to skip intermediate changes that the user won't notice anyway. Or, if data is read once and discarded, `'false ensures updates happen only when required.
      //
      // If `'listen is 2, `'update of `'Effect sub-calcs is `'defer if this is `'defer (at the time of sub-calc creation), else `'true.
      //> true
      //> false
      //> 'defer' `- cancelled by subsequent `'updateIfNeeded()
      update: false,    // can change

      // Controls "garbage collection" of sub-calcs not used in this many last calculations. If false, sub-calcs persist until reset() (called by update() if listen is 0). 0 evicts sub-calcs not used in the last calculation (epoch distance of 0), 1 - in the last or previous calculations, etc. Use 0+ with listen of 2 (since such calculators are usually long-term and may potentially accumulate a lot of unused sub-calcs over time). Use false with 0 or 1.
      prune: false, // do not change

      initial: undefined,   // can be changed

      // Enable detailed logging of value calculation. Produces loads of output, use only on individual instances.
      //
      // Can be set via constructor's opt. In this case there will be two set of _opt changes - first for the temporary instance created to determine key(), then for the actually nested module (unless found a shared instance).
      trace: false,   // can be changed, even in the middle of _calculate() (but enabling will happen when change_trace is dispatched; to enable immediately, call _enableTrace())

      // Enables automatic deriving of certain selectors based on other data (e.g. `'ifX based on `'ifObject). With this unset, caller must provide fully qualified selectors (`'_opt) and keep them up to date for the calculation to produce accurate results.
      expand: true,   // do not change

      // List of Effect->$id that affected last calculation (without mismatched Effects), set along with
      // _opt.value and others. Numbers go in groups, groups are ordered by
      // evaluated priority (most priority - last) but group members are unordered.
      //= null before first update`, array of n in map.effects
      affectors: null,  // do not change

      // + selectors: Effect->$if... (null/undefined may be missing)
      //
      // It is the caller's responsibility to monitor removals of entities referenced as fixed selectors (like _opt.ifObject) and either set the associated selector to null or remove the calculator when an ID ceases to be valid.
      //
      // Effect->$test is called as function (calc), in context of calc, returning truthy to match. _opt.test is unused.
      //
      // _opt.target may be null to match Effects with every $target. However, this mode is inefficient because of full traversal of all Effects (no indexes can be used) and a big number of hooks created (so consider also setting listen to not 2, and possibly update to not true).
      //
      // _opt.ifDateMin is an integer matched against $ifDateMin/Max. _opt.ifDateMax is unused.
      //
      // _opt.ifRadius must be unset. Calculator relies on bySpot that correctly places all Effects with $ifX/Y/Z and $ifRadius.
      //
      // To match in combat mode, set _opt.isOpponent/isSupporter/isSupporterSamePlayer to IDs of opposing heroes
      // or towns (not to true). Always set ifCombat if setting ifCombatCreature/Party. In non-combat mode, leave them at null/false.
      // In both modes, set _opt.ifObject to the
      // "own" hero or town. Technically, isObject isn't tested if one of is... is set but it's used if expand is enabled, so if you disable expand and supply is... yourself then isObject can be any value (still, this is an internal detail).
      //
      // _opt.isTargetAdjacent is similar but an array of [creatureID, constants.isAdjacent]
      // listing all creatures near _opt.isCreature and their relationship (such
      // as enemy).
      //
      // H3.Rules additions:
      // * Effect->$ifSpellSchool is an integer but _opt.ifSpellSchool is an array.
      //   See the comment of databank.php's Spell->$schools property.
      // * _opt.ifGrantedMin is an integer matched against $ifGrantedMin/Max. _opt.ifGrantedMax is unused.
    },

    // Caller should override normalize_value if target evaluates to array or other object to avoid firing change_value on no real change (Calculator may sometimes do excessive update()-s in response to multiple data changes if it cannot coalesce them, even though both resulted in the "same" final value).
    events: {
      // This can be overridden by clients, e.g. to call updateIfNeeded().
      '=render': function () {
        return this
      },

      '=update': function () {
        this._opt.listen || this.reset()
        return this.updateIfNeeded()
      },

      '-unnest': function () {
        if (this._parent) {
          clearTimeout(this._changedTimer)
          this._subCalcs && this._subCalcs.remove()
        }
      },

      change_trace: function (now, old) {
        if (now === true) {
          this.set('trace', this._enableTrace())
        } else if (now === false && old) {
          Common.off(old)
          delete this.L
        }
      },

      change_changed: function (now) {
        if (now) {
          switch (this._opt.update) {
            case true:
              return this.updateIfNeeded()
            case 'defer':
              if (!this._changedTimer) {
                this._changedTimer = _.defer(Common.ef('updateIfNeeded', this))
              }
          }
        }
      },

      'invalidated_-1': function () {   // RESULT
        this._invalidatingAdd(4)
      },

      '+key': function (res) {
        _.each(this._opt, function (value, key) {
          if (effectRE.test(key) && value != null) {    // can't use _shared in key()
            res += ';' + key + ',' + value
          }
        })

        return res
      },

      '+toString': function (res) {
        res += ' c=' + this.get('changed')

        _.each(this._schema || {}, function ($, prop) {
          var value = this._opt[prop]

          if (value != null) {
            res += ' ' + prop + '=' + value
            var str = _.indexOf(this._constants[prop] || {}, value)
            if (str != null) { res += '/' + str }
          }
        }, this)

        return res
      },

      '+_initShared': function (res) {
        res.schema = this.map.effects.schema()
        res.objects = this.map.objects.schema()

        res.affectorAtter = this.map.effects.atter(['stack', 'priority'], {array: true})
        res.modifyAtter   = this.map.effects.atter(['modify', 'modifier'], {array: true})

        // Effect's schema's properties _test()'ed for every Effect. These are
        // listed in index[3].
        res.indexSelectors = []

        // Non-null _opt's added to key(); selectors (fixed from _opt or from _expandOption()); Effect properties that invalidate MATCH on change.
        res.effectProperties = []

        _.each(res.schema, function (propIndex, name) {
          var match = name.match(effectRE)

          if (match) {
            // Doesn't include $is... because they are company to regular $if... and are not tested alone.
            //
            // Doesn't include target because it's hardcoded as the first to test (see _updateContext()).
            if (match[1] != 'target' && match[2] != 'is') {   // test|if[A-Z]
              res.indexSelectors[propIndex] = name
            }

            res.effectProperties[propIndex] = name
          }
        })

        res.indexSelectorsByName = _.flip(res.indexSelectors)

        if (_.size(res.indexSelectorsByName) != _.size(res.indexSelectors)) {
          // This has various minor problems in the current implementation because there's no "type" property (yet?) that allows determining which parts of a union apply in a particular Effect's case.
          throw new Error('Unions are not supported.')
        }

        res.v2f = _.extend([], _.fromEntries([
          [res.schema.ifCreature,         res.schema.ifCombatCreature],
          [res.schema.ifCombatParty,      res.schema.ifCombatCreature],
          [res.schema.ifTargetCreature,   res.schema.ifTargetCombatCreature],
          [res.schema.ifTargetPlayer,     res.schema.ifTargetCombatCreature],
          [res.schema.ifTargetObject,     res.schema.ifTargetCombatCreature],
        ]))

        res.d2f = _.extend([], _.fromEntries([
          [res.schema.ifDateDay,    'day'],
          [res.schema.ifDateWeek,   'week'],
          [res.schema.ifDateMonth,  'month'],
        ]))

        res.gv2p = _.extend([], _.fromEntries([
          [res.schema.ifGarrisoned,   res.objects.garrisoned],
          [res.schema.ifVisiting,     res.objects.visiting],
        ]))

        res.xyz2f = _.extend([], _.fromEntries([
          [res.schema.ifX,  'x'],
          [res.schema.ifY,  'y'],
          [res.schema.ifZ,  'z'],
        ]))

        res.xyz2i = _.extend([], _.fromEntries([
          [res.schema.ifX,  0],
          [res.schema.ifY,  1],
          [res.schema.ifZ,  2],
        ]))

        res.xyz2p = _.extend([], _.fromEntries([
          [res.schema.ifX,  res.objects.x],
          [res.schema.ifY,  res.objects.y],
          [res.schema.ifZ,  res.objects.z],
        ]))

        res.h2p = _.extend([], _.fromEntries([
          [res.schema.ifVehicle,  res.objects.vehicle],
          [res.schema.ifHero,     res.objects.subclass],
        ]))

        res.g2pp = _.extend([], _.fromEntries([
          [res.schema.ifTerrain,  this.map.byPassable.propertyIndex('terrain')],
          [res.schema.ifRiver,    this.map.byPassable.propertyIndex('river')],
          [res.schema.ifRoad,     this.map.byPassable.propertyIndex('road')],
        ]))
      },

      '+_calculate': function (res) {
        var epoch = ++this._epoch

        if (!this._subCalcs) {
          // Do _initShared(). Calling attach() multiple times (like once
          // before rendering, once during) doesn't harm.
          this.attach()

          this._effects = this.map.effects
          this._schema = this._shared.schema
          this._constants = this.map.constants.effect

          // When listen is 0, Collection could be replaced by a boiled-down
          // _subCalcs that looks like this:
          //   var members = new Map
          //   this._subCalcs = {...}
          // ...with minimal set of member functions: remove (stub), has
          // (of Map) and append (Map.get() || set(this._readySubCalc())).
          //
          // Indeed this seems to bring some small performance benefit but
          // not enough to justify such an ugly optimization.
          var col = this._subCalcs = new Effects.Collection({
            effects: this._effects,
            list: null,
          })

          col.readyMember = Common.ef('_readySubCalc', this)

          this.L && this.L.attached()
        }

        _.extend(res, this._subCalc(RESULT).result)
        res.changed = false
        // Allows using generic methods like whenRenders() to listen to first calculation.
        res.rendered = true

        var prune = this._opt.prune
        if (prune !== false) {
          this.L && this.L.tree()
          epoch -= prune

          if (epoch >= 2) {
            this.L && this.L('pruning epoch < %d', epoch)

            _.each(this._subCalcs._members, function (member, item) {
              epoch > member.epoch && this.evict(item)
            }, this._subCalcs)
          }
        }
      },
    },

    L: null,
    _staticAffectors: Common.stub,

    _enableTrace: function () {
      var self = this
      var off = []

      function itemName(item) {
        var name = _.indexOf(Calculator.Effect, item) || self._shared.effectProperties[item]
        return name ? item + '/' + name : item
      }

      var log = this.L = function (msg) {
        var args = [
          'Calc %s: %s' + msg,
          self._cid,
          // level may drop below 0 if tracing was enabled during an update.
          _.repeat(log.level < 0 ? '<' : '  ', Math.abs(log.level)),
        ].concat(_.rest(arguments))

        ;(_.log || _.oldLog).apply(_, args)
      }

      _.extend(log, {
        level: 0,

        in: function (a) {
          a && log.apply(_, arguments)
          log.level++
        },

        out: function (a) {
          log.level--
          a && log.apply(_, arguments)
        },

        attached: function () {
          var subCalcs = self._subCalcs

          off.push([subCalcs, subCalcs.on('=append', function (sup, items) {
            _.each(_.toArray(items), function (item) {
              log('+%s sub-calc %s', this.has(item) ? ' EXISTING' : '', itemName(item))
            }, this)

            log.in()
            var res = sup(this, arguments)
            log.out()
            return res
          })])

          off.push([subCalcs, subCalcs.on('-evict', function (items) {
            _.each(_.toArray(items), function (item) {
              log('-%s sub-calc %s', this.has(item) ? '' : ' NON-EXISTING', itemName(item))
            }, this)
          })])
        },

        tree: function () {
          var dep = []
          var unseen = _.extend({}, self._subCalcs._members)

          // +==+ RESULT
          //    +--+ AFFECTORS
          //    |  +--- AFFECTORS_IN
          //    +--- VALUE
          function draw(member, indent, last) {
            dep.push(_.format(
              '%s%s+%s%-1$s%s %s%s',
              _.repeat(' ', 5 + self._cid.length + 2 + 2 * log.level),
              indent,
              unseen[member.item] ? '=' : '-',
              member.depends.length ? '+' : unseen[member.item] ? '=' : '-',
              itemName(member.item),
              unseen[member.item] ? ' *' : ''
            ))

            delete unseen[member.item]

            _.each(member.depends, function (m, i) {
              draw(m, indent + (last ? '   ' : '|  '), i == member.depends.length - 1)
            })
          }

          if (unseen[RESULT]) {
            var size = _.size(unseen)
            draw(unseen[RESULT], '', true)
            log('Invalidation tree (%d, * - first seen):\n\n%s', size - _.size(unseen), dep.join('\n'))
          }

          var unreferencedCount = _.size(unseen)
          // Includes counts for unseen members as well as for seen members they reference (but they don't have 0 as the initial value and so won't appear in the unused tree).
          var counts = _.fill(unseen, 0)

          // Sort branches not part of RESULT by their depth. For this, first
          // collect the number of references to each member.
          _.each(unseen, function (member) {
            member.depends.forEach(function (dep) {
              counts[dep.item] = (counts[dep.item] || 0) + 1
            })
          })

          dep = []

          // Now keep unreferenced members only, sum up numbers of all members
          // that they reference (recursively) and sort.
          _.entries(counts)
            .filter(function (a) { return !a[1] })
            .map(function (a) {
              a[1] = unseen[a[0]].depends.reduce(function (sum, dep) {
                return sum + counts[dep.item]
              }, 0)
              return a
            })
            .sort(function (a, b) { return b[1] - a[1] })
            .forEach(function (a) {
              draw(unseen[a[0]], '', true)
              dep.push('')
            })

          dep.length && log('Unused sub-calcs (%d):\n\n%s', unreferencedCount, dep.join('\n'))
        },
      })

      off.push([this, this.on('=_calculate', function (sup) {
        log.in('begin calculation, epoch %d : %s', this._epoch + 1, this)
        var res = sup(this, arguments)
        // We'd also measure time the calculation has taken but this data in trace mode is useless because of the extra-high logging overhead.
        log.out('end calculation, %d members : %s', _.size(this._subCalcs._members), this)
        return res
      })])

      off.push([this, this.on('change', function (name, now, old) {
        switch (name) {
          default:
            log('%s = %.j <- %.j', name, now, old)
          case 'trace':   // contains references to complex objects
        }
      })])

      off.push([this, this.on('-_invalidatingAdd', function (mask) {
        log('invalidating + %03b = %03b <- %03b', mask, this._invalidating | mask, this._invalidating)
      })])

      off.push([this, this.on('-_invalidatingRemove', function (mask) {
        log('invalidating - %03b = %03b <- %03b', ~mask, this._invalidating & mask, this._invalidating)
      })])

      this._subCalcs && log.attached()
      return off
    },

    deepClone: Common.Sqimitive.deepClone,

    _invalidatingAdd: function (mask) {
      this._invalidating |= mask
    },

    _invalidatingRemove: function (mask) {
      // In case _opt.update is true, delay the update until the outermost invalidation and batch(es) given to invalidateGuard() have finished, to avoid calculation in between invalidate_RESULT and invalidated_RESULT.
      //
      // _invalidating could be an _opt instead and could make use of change_OPT but the overhead of normalize, etc. turns out to be high.
      if ((this._invalidating &= mask) == 4 && !this._opt.changed) {
        this.set('changed', true)
      }
    },

    // Internal method to signal change of subCalc values.
    //
    // Only call if subCalc is part of _subCalcs (has()). Only call during _calculate(). options will be mutated; do not reuse.
    //
    // Remember that invalidate_.../invalidated_... occur in scope of the member and may be fired multiple times per member's lifetime (if it does partial invalidation) so don't call _subCalcDependingOn() inside, or ensure to do so at most once like commonly done in _expandOption():
    //
    //   var sub1 = subCalc(S1, o => o.partial)
    //   var sub2
    //
    //   mreval(function () {
    //     if (sub1.value) {
    //       // S2 could have been initialized outside of mreval() like S1, but
    //       // doing it here is more efficient since it's done only when S1's
    //       // value is set. Given this set-up, whichever of S1 or S2 changes,
    //       // this function will re-run and partially update as long as neither
    //       // is fully invalidated (evicted).
    //       sub2 = sub2 || subCalc(S2, o => o.partial)
    //       return sub1.value + sub2.value
    //     }
    //   })
    //
    // Calling _subCalc(SUBCALC) is okay as long as you guarantee that _subCalcDependingOn() was already called before for SUBCALC in scope of your member, i.e. that the dependency has been established.
    //
    // Calling _subCalc() inside the listener after _subCalcDependingOn() on the outside can be useful to implement a partial update in view of fully invalidated (evicted) SUBCALC (initializing a sub-calc is costly and invalidate_... is meant for quick updates so do this only if the cost of re-initializing DEPENDENT is much bigger):
    //
    //   // Handling _readySubCalc() of DEPENDENT:
    //   var sub = this._subCalcDependingOn(SUBCALC, function (o) {
    //     return {evicted: !o.partial}
    //   })
    //
    //   this.on('+invalidate_DEPENDENT', function (res, options) {
    //     if (options.evicted) { sub = this._subCalc(SUBCALC) }
    //     member.value = sub.value + 123
    //     return true
    //   })
    //
    // Do not retain references to sub-calc members if DEPENDENT may do a partial update in response to them being evicted:
    //
    //   var sub = this._subCalcDependingOn(SUBCALC)
    //
    //   this.on('+invalidate_DEPENDENT', () => true)
    //
    //   mreval(function () {
    //     return sub.value + 123
    //     // Wrong! sub may have been evicted and this object no longer corresponds to any member in _subCalcs.
    //   })
    //
    //   // Would be okay if the listener is replaced by this one:
    //   this.on('+invalidate_DEPENDENT', o => o.partial)
    //
    // First invalidate_... is fired (usually hooked only by the sub-calc, to determine the mode and update itself if it's partial), then invalidated_... (for its dependents so that they may determine if the update was partial or full and read the new values if partial). In case of full invalidation, the sub-calc is already removed by the time invalidated_... occurs (undoing its hooks, etc.).
    //
    // Avoid calling _invalidate() several times per one subCalc per batch (although what is "batch" may be unclear) because if subCalc evict()-s after the first invalidate_..., the second will be on an empty spot; and even if not, different set of options of each invalidate_... may confuse it. This is easier done if you avoid calling _invalidate() directly and only call member.invalidateGuard.
    //
    // Normally, invalidation graph works like this. First, you request a sub-calc using _subCalcDependingOn() which sets up an invalidated_REQUESTED hook that calls _invalidate() on your main sub-calc (which requested that one). invalidate_.../invalidated_... events receive an options object (that invalidate_... often changes to propagate data to invalidated_...) that holds the reason and possibly info needed for partial update (as opposed to fully update by evict()). That object is not propagated to dependent sub-calcs, but _subCalcDependingOn() takes an argument that it will give to _invalidate() of your main sub-calc so that it knows why it's being invalidated so you may "tag" the event and the sub-calc depending on your sub-calc may also tag it, etc.
    //
    // Another reason for invalidation is custom hooks on external objects. For example, if a sub-calc reads Map's date, it should listen to change_date and call _invalidate() on self.
    //
    // Second, to handle partial invalidation you hook +invalidate_SUBCALC and return truthy if partial invalidation was performed (no evict() necessary). A sub-calc depending on your SUBCALC will respond to the invalidated_SUBCALC where it may examine the options and in turn perform a partial update by passing certain options to its own _invalidate(DEPENDENT).
    //
    // One common examine is partial update when list of set/unset selectors (_opt) changes. The AFFECTORS sub-calc determines list of Effects matching our selectors. It uses INDEXES to walk each Effect store and call AFFECTORS_IN. INDEXES internally depends on SELECTORS which provides properties to be matched against selectors, grouped into two arrays (set/unset). When an _opt changes, SELECTORS is invalidated which causes invalidation of INDEXES (it does a partial update) and AFFECTORS. However, AFFECTORS doesn't use the properties so if INDEXES was invalidated for that reason, AFFECTORS should be partially updated, else it should be evicted.
    //
    //   // Handling _readySubCalc() of AFFECTORS:
    //   var affectors = this._subCalcDependingOn(INDEXES, member, AFFECTORS, function (options) {
    //     // invalidated_INDEXES occurred; see why. Return {update: true} if invalidated_INDEXES' options.selectors is set, else return null (empty options).
    //     return options.selectors ? {update: true} : null
    //   })
    //
    //   this.on('+invalidate_AFFECTORS', function (res, options) {
    //     // invalidate_AFFECTORS occurred. If the reason is options.selectors from above, report that we've done partial update. If not (no options.update), let the default handler evict() AFFECTORS to perform full update.
    //     return res || options.update
    //   })
    _invalidate: function (subCalc, options) {
      options || (options = {})

      var first = (this._invalidating & 1) == 0
      first && this._invalidatingAdd(1)

      this.L && this.L.in('begin%s invalidate %s : %.j', first ? ' FIRST' : '', subCalc, options)

      var part = options.partial = !!this.fire('invalidate_' + subCalc, [options])
      part || this._subCalcs.evict(subCalc)
      this.fire('invalidated_' + subCalc, [options])

      first && this._invalidatingRemove(~1)

      this.L && this.L.out('end%s invalidate %s : %s', first ? ' LAST' : '', subCalc, part ? 'partially updated' : 'evicted')
    },

    // Should be only called once per member's lifetime (until removeMember()) to avoid setting up several invalidated_... hooks.
    //
    // invalidate can return an object (always a new one!), false (do not invalidate dependent) or undefined/null (same as {}). Use false when the update of name does not change any single bit in dependent.
    _subCalcDependingOn: function (name, member, dependent, invalidate) {
      if (this._opt.listen) {
        member.moff(this, 'invalidated_' + name, function (options) {
          if (invalidate) {
            var depOptions = invalidate(options)
            if (depOptions === false) {
              this.L && this.L('skip propagating invalidation from %s to %s : %.j', name, dependent, options)
              return
            }
          }

          this.L && this.L('dependency %s has invalidated %s : %.j', name, dependent, options)
          this._invalidate(dependent, depOptions)
        })
      }

      var res = this._subCalc(name)

      // Since _subCalcDependingOn() is called when dependent hasn't bound name yet, member.depends doesn't yet list res.
      member.depends && member.depends.push(res)

      this.L && this.L(
        '%s added as a dependency of %s : %.j : %.j',
        name,
        dependent,
        invalidate instanceof Function ? invalidate.name || 'function' : invalidate,
        _.pluck(member.depends || [], 'item')
      )

      return res
    },

    // May be called from any context during _calculate() any number of times. Will create name if doesn't exist yet.
    _subCalc: function (name) {
      var member = this._subCalcs.append(name)

      if (member.depends) {
        var epoch = this._epoch

        if (!member.epoch) {    // newly created
          member.epoch = epoch
        } else if (member.epoch != epoch) {
          // Created before the current calculation.
          var L = this.L

          function touch(other) {
            var log = L && (member == other || other.depends.length)
            log && L.in('touching epoch of %s : %s', other.item, _.pluck(other.depends, 'item'))

            other.epoch = epoch
            other.depends.forEach(touch)

            log && L.out()
          }

          touch(member)
        }
      }

      return member
    },

    reset: function () {
      if (this._subCalcs) {
        this._subCalcs.has(RESULT) && this._invalidate(RESULT)
        this._subCalcs.set('list', [])
        // If prune is a number, resetting epoch saves a bit of looping for prune+1 calculations after reset().
        this._epoch = 0
      }

      return this
    },

    // Calculator.Effect can be used before it's attach()'ed or render()'ed
    // by Context. For this, call this method and provide the Map instance (cx.map).
    // If calling it after attach(), providing map is optional.
    //
    // Alternatively, give map to the constructor (new Calculator.Effect).
    updateIfNeeded: function (map) {
      if (map) { this.map = map }

      if (this.L) {
        switch (this.get('changed')) {
          case true:    var changed = 'NEEDED'; break
          case false:   var changed = 'not needed'; break
          default:      var changed = 'NEEDED (first calculation)'
        }

        this.L('update %s, defer timer %s', changed, this._changedTimer ? 'running' : 'not set')
      }

      if (this._changedTimer) {
        this._changedTimer = null
        clearTimeout(this._changedTimer)
      }

      this._opt.changed === false || this._update()
      return this
    },

    // "Me" (this._opt.ifObject = selector[1]) against "him"
    // (this._opt.isOpponent):
    //
    //   _opt.isOpp| Effect->$isOpp| Effect->$ifObject | Match?
    // | Him       | false         | false             | yes (**)
    // | Him       | false         | Me                | yes (*)
    // | Him       | false         | Him               | no
    // | Him       | true          | false             | (invalid)
    // | Him       | true          | Me                | no
    // | Him       | true          | Him               | yes
    // | null      | false         | false             | yes (**)
    // | null      | false         | Me                | yes (*)
    // | null      | false         | (other)           | no
    // | null      | true          | (any)             | no
    _matchOpponent: function (
        subCalc,
        effect_ifObject,
        ifObjectIndex,
        n,
        isOpponentIndex,
        isSupporterIndex,
        isSupporterSamePlayerIndex
    ) {
      // Evaluate quickly since can't have any two set at once.
      if (this._effects.atContiguous(n + isOpponentIndex, 0)) {
        var opt = subCalc(isOpponentIndex).value
      } else if (this._effects.atContiguous(n + isSupporterIndex, 0)) {
        var opt = subCalc(isSupporterIndex).value
      } else if (this._effects.atContiguous(n + isSupporterSamePlayerIndex, 0)) {
        var opt = subCalc(isSupporterSamePlayerIndex).value
      } else {
        return effect_ifObject === false || effect_ifObject == subCalc(ifObjectIndex).value
      }

      // Assuming teams cannot change during a combat so unlike _matchPlayer()
      // not setting up the hooks.
      return !!opt && opt.indexOf(effect_ifObject) != -1
    },

    _matchPlayer: function (
      subCalc,
      selector_ifPlayer,
      effect_ifPlayer,
      n,
      isAllyIndex,
      isEnemyIndex
    ) {
      if (effect_ifPlayer === false) {
        // $ifPlayer cannot be unset while $isAlly/$isEnemy are set so no need
        // to check further - this selector is in "any value matches" state.
        return true
      }

      // $ifPlayer is set but _opt.ifPlayer is unset - doesn't match.
      if (selector_ifPlayer) {
        var isAlly = this._effects.atContiguous(n + isAllyIndex, 0)

        // && - optimization since can't have both set.
        if (!isAlly && !this._effects.atContiguous(n + isEnemyIndex, 0)) {
          // Simple - match if $ifPlayer equals _opt.ifPlayer.
          return selector_ifPlayer._opt.player == effect_ifPlayer
        }

        // Match if _opt.ifPlayer is ally/enemy with $ifPlayer and is not that player himself.
        if (selector_ifPlayer._opt.player != effect_ifPlayer) {
          subCalc('playerTeams')
          return isAlly == (this.map.players.nested(effect_ifPlayer)._opt.team == selector_ifPlayer._opt.team)
        }
      }

      return false
    },

    _matchMinMax: function (subCalc, selector, value, isValueMin) {
      var sv
      return value === false ||
        ((sv = subCalc(selector).value) != null && (isValueMin ? value <= sv : value >= sv))
    },

    //> sp - selector property index in Effect schema
    //> sv - selector value to match against this._opt
    //> value - Effect's value for sp
    //> n - Effect's n which sp is being matched
    //= null use default matching`,
    //  false ignore Effect (selector doesn't match)`,
    //  true selector matches
    // Be mindful of JavaScript's && and || return value: it's not always bool:
    //[
    //    var member = this._foo[selector]
    //    return member && member.includes(value)
    //      // If _foo has no selector, member would be undefined and && will stand for, and return, undefined, leading to _test() result treated as "default matching", not "not matched"
    //]
    //
    // Calculator takes care of changes in most Effect properties (effectProperties) so no need to listen to them. Changes to other data used in the test should be hooked (respecting _opt.listen; use m...() helpers) - this is similar to _expandOption() but invalidation must be always full (call invalidateGuard with no options) because all selectors are grouped into one MATCH sub-calc per Effect so if two sub-calcs of two tests are changed during one batch and both tests want different kind of invalidation (e.g. one part, one full or both part but with different options), they'll call invalidateGuard twice with different options but the second call will be ignored (same batch). The idea is that _test() by itself is fast enough to re-run for the whole Effect on any change. This restriction only applies to _test() and not its sub-calcs - they can do partial invalidation and next _test() run will quickly pick their new values.
    _test: function (selector, value, n, subCalc) {
      // XXX++O Optimization idea: store a compiled test closure within Effect that does all the tests and returns a result indicating if the Effect matches current Calculator options or not. Or implement calculation in webasm.

      // "Selector" - expanded value in _opt, to match against.
      // "Value" - Effect's value, to make Effect effective only when it matches.
      var schema = this._schema

      switch (selector) {
        case schema.test:
          // XXX There is currently no way to signal recalculation if whatever data test() depends on has changed.
          return !value || !!value.call(this, this)

        // If _opt.target is unset then an index with implied target is set up
        // so when matching this selector, _opt.target may be never null and
        // the default matching can be used.
        //case schema.target:
        //  var sv = subCalc(selector).value
        //  return value == sv || sv == null

        case schema.ifDateMin:
          var min = true
        case schema.ifDateMax:
          return this._matchMinMax(subCalc, schema.ifDateMin, value, min)

        case schema.ifObject:
          return this._matchOpponent(
            subCalc,
            value,
            schema.ifObject,
            n,
            schema.isOpponent,
            schema.isSupporter,
            schema.isSupporterSamePlayer
          )

        case schema.ifCreature:
          // +--+--+--+ (*) null or He: ally, Me: any, Any: any, etc.
          // |  |HE|  | _opt.ifCre|_opt.isAdj|Eff->ifCre|Eff->isAdj|Match
          // +--+==+--01| Me      | He: enemy| Me       | false   | yes
          // |  [ME]  02> Me      | He: enemy| Me       | (other) | no
          // +--+==+--03| Me      | He: enemy| false    | false   | yes
          // |  |  |  04> Me      | He: enemy| false    | (other) | invalid
          // +--+--+--05| Me      | He: enemy| He       | false   | no
          //          06> Me      | He: enemy| He       | enemy   | yes
          //          07> Me      | He: enemy| He       | (other) | no
          //          08| Me      | null *   | Me       | false   | yes
          //          09| Me      | null *   | Me       | (other) | no
          //          10| Me      | null *   | false    | false   | yes
          //          11| Me      | null *   | false    | (other) | invalid
          //          12| Me      | null *   | He       | false   | no
          //          13| Me      | null *   | He       | enemy   | no (<>)
          //          14| Me      | null *   | He       | (other) | no
          //          15| He      | Me: enemy| Me       | false   | no
          //          16> He      | Me: enemy| Me       | enemy   | yes
          //          17> He      | Me: enemy| Me       | (other) | no
          //          18| He      | Me: enemy| false    | false   | yes
          //          19> He      | Me: enemy| false    | (other) | invalid
          //          20| He      | Me: enemy| He       | false   | yes
          //          21> He      | Me: enemy| He       | (other) | no
          var effectRelation = this._effects.atContiguous(n + schema.isTargetAdjacent, 0)
          var sv = subCalc(schema.isTargetAdjacent).value
          if (!sv || !effectRelation) {
            // If Effect->$isTargetAdjacent is unset (01 03 05 08 10 12 15 18 20)
            // then test Effect->$ifTargetCreature is either unset or equals _opt.ifTargetCreature.
            //
            // If _opt.isTargetAdjacent is unset (08 09 10 11 12 13 14) then test
            // Effect->$isTargetAdjacent is unset and Effect->$ifTargetCreature is either unset or equals _opt.ifTargetCreature.
            return !(
              (effectRelation && !sv) ||
                !(value === false || value == subCalc(selector).value)
            )
          } else {  // 02 04 06-y 07 16-y 17 19 21
            return _.some(sv, function (item) {
              return item[0] == value /*E.isC*/ && item[1] == effectRelation
            })
          }

        case schema.ifPlayer:
          var matchPlayer = subCalc(selector).value
          matchPlayer == null || (matchPlayer = this.map.players.nested(matchPlayer))
          return this._matchPlayer(subCalc, matchPlayer, value, n, schema.isAlly, schema.isEnemy)

        case schema.ifTargetPlayer:
          // Effect->$ifPlayer cannot be null if $isAlly or $isEnemy is true. Same with $ifTargetPlayer, except it's got special -1 value.
          if (value == -1 && (value = subCalc(schema.ifPlayer).value) == null) {
            console && console.warn('$ifTargetPlayer = -1 but _opt.ifPlayer is unset')
            return false
          }
          var matchTargetPlayer = subCalc(selector).value
          matchTargetPlayer == null || (matchTargetPlayer = this.map.players.nested(matchTargetPlayer))
          return this._matchPlayer(subCalc, matchTargetPlayer, value, n, schema.isTargetAlly, schema.isTargetEnemy)

        case schema.ifTargetObject:
          if (value == -1) {
            value = subCalc(schema.ifObject).value
          }
          return value === false || value == subCalc(selector).value
      }
    },

    _readySubCalc: function (name) {
      var self = this

      var member = {
        epoch: 0,
        depends: this._opt.prune === false ? null : [],

        L: function (msg) {
          self.L.apply(_, ['[%s] ' + msg, name].concat(_.rest(arguments)))
        },

        in: function (a) {
          a && L.apply(_, arguments)
          self.L.level++
        },

        out: function (a) {
          self.L.level--
          a && L.apply(_, arguments)
        },

        // cx isn't given to on() to make hooking/unhooking slightly faster. If you
        // need it, bind func.
        moff: function (obj, event, func) {
          member.off.push([obj, obj.on(event, func)])
        },

        mgetreval: function (func) {
          member.value = func.call(self)
          member.mreval(func)
        },

        mreval: function (func) {
          if (self._opt.listen >= 2) {
            member.mreval_(func)
          }
        },

        // Do not call subCalc() from func because func may be called multiple times. See _invalidate() for more gotchas.
        mreval_: function (func) {
          member.moff(self, '+invalidate_' + name, function (res, options) {
            if (options.update) {
              member.value = func.call(self, options)
              self.L && L('mreval : %.j', member.value)
              return true
            }
          })
        },

        mstoreinval: function (store, n, prop) {
          if (self._opt.listen >= 2) {
            member.moff(store, 'ochange_n_' + n, function ($1, $2, p, $4, $5, options) {
              if (prop == p) {
                self.L && L('mstoreinval %d.%d, batch %d', n, prop, options.batchID)
                member.invalidateGuard(options, {update: true})
              }
            })
          }
        },

        meventinval: function (sqim, event, optionsIndex, options) {
          if (self._opt.listen >= 2) {
            member.moff(sqim, event, function () {
              self.L && L('meventinval %s.%s, batch %s', sqim, event, (arguments[optionsIndex] || {batchID: '???'}).batchID)

              options = options ? _.extend({}, options) : {update: true}

              optionsIndex == null
                ? self._invalidate(name, options)
                : member.invalidateGuard(arguments[optionsIndex], options)
            })
          }
        },

        // XXX Detect circular dependency between sub-mcalc'ulators (e.g. when calculating creature_damageMin/Max - first has a modifier [custom, rules, damageMax] while second has [..., damageMin] so they continue to create calculators infinitely (if using oneShotEffectCalculator()).
        mcalc: function (cls, options) {
          var calc = self.cx.calculator(cls, options)
          // Non-Effect calculators' options may contain complex objects.
          self.L && L('mcalc %s %s : %.j', calc._cid, cls.name, _.map(options, function (v) { return v && typeof v == 'object' && !_.isArray(o) ? '...' : v }))

          if (!calc.get('rendered')) {
            throw new Error('Calculation involves reading values of a non-Effect Calculator before render: ' + calc)
          }

          if (self._opt.listen < 2) {
            calc.take()
            member.release.push(calc)
          } else {
            // If something has caused removal of calc, remove self. This usually
            // happens on Context screen change and ignoring it will cause
            // reference counter lapse:
            //
            // 1. Calculator A is created
            // 2. A updates and creates a sub-calc B, incrementing its _references
            // 3. Context calls remove() on all nested modules
            // 4. ...iteration order is unspecified and it may so happen that
            //    B's remove() is called before A's
            // 5. B.remove() sets _references to -Infinity to indicate a
            //    disposed instance
            // 6. Then, A.remove() is called which calls _subCalcs.remove() which
            //    in turn does B.off() of A's hooks
            // 7. B.off() sees the _references of -Infinity and emits a warning
            //
            // While this condition does not always mean a problem, using the
            // instance after remove() is bad in any case.
            //
            // XXX=: rm: the same applies pretty much to every other calculator user (in Bits, etc.); need to review and add cascade remove where needed (some places like updateOn() already do it properly)
            member.moff(calc, '-unnest', function () { self.remove() })

            // Order of moff() is important - see mcalceffect().
            member.moff(self, '+invalidate_' + name, function (res, options) {
              return res || options.calc == calc._cid
            })

            ;(options.mcalcOpt || ['value']).forEach(function (opt) {
              // Could pass calc as an object rather than its _cid but that would trip up the log's %j.
              member.meventinval(calc, 'change_' + opt, 2, {calc: calc._cid})
            })
          }

          return calc
        },

        // Call updateIfNeeded() before reading _opt's for the first time in an update iteration of your sub-calc.
        mcalceffect: function (options) {
          options.map = self.map

          if (self._opt.listen < 2) {
            // listen of 1 tracks _opt but selectors of the calculator we're making can't change (it's meant as a member's "return value" so it's linked to member.item) so new calculator's listen is still 0.
            var calc = self.cx.oneShotEffectCalculator(options)
          } else {
            if (!_.has(options, 'update')) {
              options.update = self._opt.update || true
            }
            var calc = self.cx.listeningEffectCalculator(options)
          }

          self.L && L('mcalceffect %s %s : %.j', calc._cid, options.class || 'GenericNumber', _.omit(options, 'map'))

          if (self._opt.listen < 2) {
            calc.take()
            member.release.push(calc)
          } else {
            // This hook is pushed to member.off specifically before the change_... one to not be called during invalidation of calc because invalidation involves off'ing and that may trigger release of calc which in turn could unnecessarily trigger this -unnest (unless it is off'ed before like done here).
            //
            // For example, creature_moveDistance defaults to the value of creature_speed; it may be that the latter has _references of 1 (i.e. only used by this Calculator). Change of _opt.ifCombatCreature (as it happens with Combat.State) invalidates creature_speed that depends on it; _subCalcs' removeMember() does Common.off(member.off), in order of added hooks (moff() here). If it first unhooks change_changed, _unregHandler() of creature_speed calls release() which calls remove() which triggers ours (creature_moveDistance's) -unnest.
            member.moff(calc, '-unnest', function () { self.remove() })

            member.moff(self, '+invalidate_' + name, function (res, options) {
              return res || options.calc == calc._cid
            })

            member.moff(calc, 'change_changed', function (now, $, options) {
              self.L && L('mcalceffect %s changed = %j', calc._cid, now)
              now === true && member.invalidateGuard(options, {calc: calc._cid})
            })
          }

          return calc
        },

        invalidateGuard: Common.batchGuard(0, function (options, invalidate) {
          // Wait until all batch events have dispatched (even if _opt.update is true, there is no meaning in updating in-batch).
          //
          // For example, calc.assignResp({ifX: 1, ifY: 2}) would trigger two invalidateGuard-s but each of its own sub-calc `'member (despite options.batchID being the same) so _invalidate() will be called twice. Without the mechanism here, if update is true then both _invalidate() will go through the usual cycle: invalidating 0->1, 1->5 (RESULT invalidated), 5->4 (outermost _invalidate() returns), change_invalidating calls update(). We cause invalidating to be 2, 3 (not 1), 7 (not 5), 6 (_invalidate() returns), 7 (second outermost _invalidate() enters), 7 (RESULT already invalidated), 6 (_invalidate() returns), 4 (batch ends).
          //
          // This optimization is disabled because it seems to slow down map loading by ~15%. XXX
          //var old = invalidateBatches.size
          //if (old != invalidateBatches.add(options.batchID).size) {
          //  old || self._invalidatingAdd(2)
          //  var rem = options.batched.length
          //  function ended() {
          //    self.L && L('invalidateGuard batch %d end, %d/%d to go', options.batchID, rem - 1, invalidateBatches.size - 1)
          //    if (!--rem) {
          //      invalidateBatches.delete(options.batchID)
          //      invalidateBatches.size || self._invalidatingRemove(~2)
          //    }
          //  }
          //  options.batched.forEach(function (b) {
          //    b[0].once(self._cid, ended)
          //    b[1].push([self._cid])
          //  })
          //}
          self.L && L('invalidateGuard, batch %d : %.j', /*rem ? 'unseen' : 'seen',*/ options.batchID, invalidate)
          self._invalidate(name, invalidate)
        }),

        subCalc: function (dependOn, invalidate) {
          return self._subCalcDependingOn(dependOn, member, name, invalidate)
        },

        subCalcGuard: function () {
          var seen = new Set

          return function (name) {
            return seen.size == seen.add(name).size
              ? self._subCalc(name) : member.subCalc(name)
          }
        },
      }

      var L = member.L
      _.extend(member, Effects.Collection.prototype.readyMember(name))

      // Used by sub-calcs for which selector order change in INDEXES is irrelevant. They do not propagate this invalidation to their dependents (e.g. INDEXES -> AFFECTORS -> RESULT).
      function subCalc_INDEXES(o) {
        return member.subCalc(INDEXES, function subCalc_INDEXES(options) {
          return options.selectors || (o && o.skipBySpot && options.bySpot) ? false : {}
        })
      }

      if (typeof name == 'number') {
        switch (name) {
          case RESULT:
            // array of (array of n), sorted by priority. Sub-arrays are never empty unless made so by _staticAffectors().
            var affectors = this._affectors = member.subCalc(AFFECTORS).affectors

            // VALUE should have been divided into "VALUE_OF:affectors" but
            // affectors can be very long and it'd be impractical to first cram
            // them into a string and then split to get the array of n. Instead,
            // VALUE reads the array from _affectors. However, we no longer know
            // if it's up to date (since it can't invalidate itself based on
            // affector list change) so we retrieve it, compare affectors it was
            // made for with our current _affectors and if they differ, force
            // recalculation of VALUE.
            var checkValue = this._subCalcs.has(VALUE)
            var value = member.subCalc(VALUE).result

            if (checkValue) {
              var va = value.affectors

              // First quickly compare array lengths, then compare content.
              var sum = va.length

              for (var ai = 0; ai < affectors.length; ai++) {
                if ((sum -= affectors[ai].length) < 0) { break }
              }

              sum = sum == 0 && !_.some(affectors, function (a) {
                for (var ai = 0; ai < a.length; ai++) {
                  if (a[ai] /*n*/ != va[sum++]) { return true }
                }
              })

              self.L && L(sum === true ? 'same affectors, keeping VALUE' : 'different affectors, re-VALUE')

              if (sum !== true) {
                this._subCalcs.reAddMember(VALUE)
                value = this._subCalc(VALUE).result
              }
            }

            member.result = value
            this._invalidatingRemove(~4)
            break

          case AFFECTORS:
            var stackMax = new Map
            var indexes = []

            for (var a = subCalc_INDEXES({skipBySpot: true}).indexes, i = 0; i < a.length; i++) {
              var aff = member.subCalc(AFFECTORS_IN + i, function (options) {
                return options.sameAffectors ? false : {}
              })

              indexes.push(aff)

              aff.stacks.forEach(function (list, stack) {
                var cur = stackMax.get(stack)
                var p = list.stackPriority
                if (cur == null || cur < p) {
                  stackMax.set(stack, p)
                }
              })
            }

            var affectors = member.affectors = []
            this._staticAffectors(affectors)

            function merge(ns, priority) {
              var i = indexFor_p(affectors, priority)
              var list = affectors[i - 1]

              if (list && list.priority == priority) {
                list.push.apply(list, ns)
              } else {
                ns = ns.concat()
                ns.priority = priority
                affectors.splice(i, 0, ns)
              }
            }

            _.each(indexes, function (index, i) {
              self.L && L('merge affectors from index %d : %.j', i, Array.from && Array.from(index.plain))

              index.plain.forEach(merge)

              index.stacks.forEach(function (list, stack) {
                var max = stackMax.get(stack)

                self.L && L('%s stack %d priority %d (must be %d) from index %d : %.j', list.stackPriority == max ? 'merge' : 'DROP', stack, list.stackPriority, max, i, Array.from && Array.from(list))

                if (list.stackPriority == max) {
                  list.forEach(merge)
                }
              })
            })

            break

          case INDEXES:
            this._attachIndex(member)
            break

          case SELECTORS:
            this._updateContext(member)
            break

          case VALUE:
            var result = member.result = {}

            // Avoid unnecessary cloning by invalidating INITIAL only when there
            // was at least one affector and the value is not a scalar.
            if (this._affectors.length && this._subCalcs.has(INITIAL) &&
                this._subCalc(INITIAL).value instanceof Object) {
              self.L && L('re-clone complex INITIAL : %.j', this._subCalc(INITIAL).value)
              this._invalidate(INITIAL)
            }

            var value = result.value = member.subCalc(INITIAL).value
            var affectors = result.affectors = []

            // Same rationale for minimizing the number of listeners as in _attachIndex().
            if (this._opt.listen >= 2) {
              var est = this._opt.manyListeners

              var many = member.manyListeners = this._affectors.some(function (ns) {
                return (est -= ns.length) <= 0
              })

              self.L && L('%s listeners, estimated at %s %d', many ? 'MANY' : 'few', many ? 'least' : 'most', many ? -est : this._opt.manyListeners - est)

              if (many) {
                member.moff(this._effects, 'ochange', Common.batchGuard(5, function ($1, $2, $3, $4, $5, options) {
                  var changed = new Set

                  options.batch.forEach(function (event) {
                    if (event[0] == 'ochange') {
                      switch (event[3]) {
                        case self._schema.modify:
                        case self._schema.modifier:
                          changed.add(event[1])
                      }
                    }
                  })

                  if (changed.size) {
                    var invalidate = self._affectors.some(function (ns) {
                      for (var i = 0; i < ns.length; i++) {
                        if (changed.delete(ns[i])) {
                          self.L && L('ochange modify/ier of Effect %d', ns[i])
                          return true
                        }
                      }
                    })

                    invalidate && member.invalidateGuard(options)
                  }
                }))
              }
            }

            this._affectors.forEach(function (ns) {
              this._affect(member, result, ns)
              affectors.push.apply(affectors, ns)
            }, this)

            break

          case INITIAL:
            member.value = this.deepClone(this._opt.initial)

            if (this._opt.listen) {
              member.mreval_(function () {
                return this.deepClone(this._opt.initial)
              })

              // Normally each change_... hook bumps _references but we are
              // hooking self and this should not change the counter, else self
              // won't be freed even after all external users call release().
              this._skipRegRef = true
              member.moff(this, 'change_initial', function ($1, $2, options) {
                member.invalidateGuard(options, {update: true})
              })
            }

            break

          default:    // selector
            var sel = this._shared.effectProperties[name]

            if (sel) {
              var value = member.value = _.has(this._opt, sel) ? this._opt[sel] : null
              self.L && L('%sfixed selector %d/%s = %j', value == null ? (this._opt.expand ? 'expanding unset ' : 'KEEPING unset ') : '', name, sel, value)

              if (value == null && this._opt.expand) {
                self.L && member.in()
                this._expandOption(member, name)
                self.L && member.out('expanded selector %d/%s : %j', name, sel, member.value)
              }

              if (this._opt.listen) {
                member.moff(this, '+invalidate_' + name, function (res, options) {
                  if (options.opt) {
                    var value = _.has(this._opt, sel) ? this._opt[sel] : null
                    if (value != null || !this._opt.expand) {
                      member.value = value
                      // Evict if selector was removed from _opt and have expand on
                      // because to update we need to re-expand which is costly.
                      return true
                    }
                  }
                })

                this._skipRegRef = true
                member.moff(this, 'change_' + sel, function ($1, $2, options) {
                  // Other invalidation options on this member may be used by _expandOptions().
                  member.invalidateGuard(options, {opt: true})
                })
              }
            }
        }
      } else if (name[0] == ':') {
        switch (name[1]) {
          case AFFECTORS_IN[1]:
            var skip = {}
            skip.skipBySpot = !this._affectorsIn(member, subCalc_INDEXES(skip).indexes, name)
            break

          case MATCH[1]:
            var i = name.lastIndexOf(':')
            var indexIndex = +name.substr(i + 1)
            var n = +name.substr(2, i - 2)
            var indexes = subCalc_INDEXES({skipBySpot: true})

            if (this._opt.listen >= 2) {
              if (!indexes.manyListeners) {
                // More correctly in theory would be to set up Effect change hooks when matching each selector (in _test()) but this will result in a large number of listeners (see the comment in AFFECTORS_IN), thus we re-test the Effect if any of its property changes which is fast enough.
                var func = function ($1, $2, prop, $4, $5, options) {
                  if (_.has(self._shared.effectProperties, prop)) {
                    member.invalidateGuard(options)
                  }
                }

                member.moff(this._effects, 'ochange_n_' + n, func)

                // Ensure that previously calculated MATCH result isn't reused
                // when an Effect at n is removed, then a new Effect is added at
                // the same n.
                member.moff(this._effects, 'oremove_n_' + n, function () {
                  self._subCalcs.evict(name)
                })
              }

              // oremove is listened to by AFFECTORS_IN, one hook for all.
            }

            // All selectors are _test()'ed within the scope of one sub-calc (MATCH) and different selectors' tests may rely on the same sub-calc (e.g. of ifObject). To allow treating each test as isolated in this regard, provide it with a subCalc() function that checks if the sub-calc wasn't yet initialized by another test. _test() needs no access to member other than this subCalc() because it can't use partial invaidation.
            var subCalc = member.subCalcGuard()

            // Since indexes can't change individually, no need to divide INDEXES into "INDEX_AT".
            var index = indexes.indexes[indexIndex]
            var selectors = index[3]
            // See _updateContext() for the explanation on why target is special.
            if (index[4]) {
              var selector = this._schema.target
              var si = -1
            } else {
              selector = selectors[si = 0]
            }
            self.L && L('do%s test target', si ? '' : ' NOT')
            do {
              var value = this._effects.atContiguous(n + selector, 0)
              self.L && member.in('test %d/%s : %.j', selector, this._shared.effectProperties[selector], value)

              var match = this._test(selector, value, n, subCalc)
              var defaultTest = match == null

              if (defaultTest) {
                match = value === false || value == subCalc(selector).value
              }

              if (self.L) {
                if (!defaultTest || value !== false) {
                  member.out('tested %d/%s, %s : %.j', selector, this._shared.effectProperties[selector], match ? 'match' : 'MISMATCH', match)
                } else {
                  member.out()
                }
              }

              if (!match) {
                member.match = false
                member.selector = selector
                return member
              }
            } while (null != (selector = selectors[++si]))

            self.L && L('all selectors match')
            member.match = true
            break
        }
      } else {
        var parts = name.split(':')

        switch (parts.length + ',' + parts[0]) {
          case '1,playerTeams':   // invalidates when any player changes his team
            this.map.players.each(function (player) {
              member.meventinval(player, 'change_team', 2)
            }, this)
            break

          case '2,skills':  // skills : [AObject.id | ifObject]
            var id = parts[1] ? +parts[1] : member.subCalc(this._schema.ifObject).value
            member.calc = member.mcalceffect({
              class: Calculator.Effect.GenericIntArray,
              target: this._constants.target.hero_skills,
              ifObject: id,
            })
            break

          case '3,skillMastery':  // skillMastery : [AObject.id | ifObject] : <Skill.id>
            var id = parts[1] ? +parts[1] : member.subCalc(this._schema.ifObject).value
            member.calc = member.mcalceffect({
              target: this._constants.target.skillMastery,
              ifSkill: +parts[2],
              ifObject: id,
            })
            break

          case '3,object':    // object : [AObject.id | ifObject] : <prop index>
            var id = parts[1] ? +parts[1] : member.subCalc(this._schema.ifObject).value
            var n = this.map.objects.toContiguous(id, 0, 0, 0)
            var prop = +parts[2]
            member.mgetreval(function () {
              return this.map.objects.atContiguous(n + prop, 0)
            })
            member.mstoreinval(this.map.objects, n, prop)
            break

          case '3,player':    // player : <Player player> : <opt>
            var player = this.map.players.nested(parts[1])
            member.mgetreval(function () {
              return player.get(parts[2])
            })
            member.meventinval(player, 'change_' + parts[2], 2)
            break

          case '2,objectExists':  // objectExists : <Object.id>
            var n = this.map.objects.toContiguous(parts[1], 0, 0, 0)
            member.value = this.map.objects.anyAtContiguous(n)
            if (member.value) {
              member.mreval(Common.stub)
              member.meventinval(this.map.objects, 'oremove_n_' + n, 3)
            }
            break
        }
      }

      return member
    },

    _affect: function (member, res, ns) {
      this.L && this.L.in('affect value %.j : %.s', res, ns)
      var atter = this._shared.modifyAtter
      var modifiers = []

      for (var i = ns.length; i--; ) {
        var n = ns[i]
        var effect = atter(n, 0)

        if (effect[0]) {
          effect[0].call(this, this, res)
        }

        if (effect[1] !== false) {
          modifiers.push(effect[1])
        } else if (!effect[0]) {
          // In the future more complex Effects with some other "affection" properties can exist, but for now this helps tracking wrongly created Effects.
          console && console.warn('Effect ' + n + ' has neither $modify nor $modifier.')
        }

        if (this._opt.listen >= 2 && !member.manyListeners) {
          var func = function ($1, $2, prop, $4, $5, options) {
            switch (prop) {
              case atter.modifyIndex:
              case atter.modifierIndex:
                member.invalidateGuard(options)
            }
          }

          member.moff(this._effects, 'ochange_n_' + n, func)
        }
      }

      res.value = this._applyModifiers(member, modifiers, res.value, res)
      this.L && this.L.out('affected value : %.j', res)
    },

    expandModifier: function (modifier) {
      return Calculator.Effect.expandModifier(modifier, this._constants)
    },

    // All operations in modifiers are typically the same but not always (e.g.
    // relative and heroSpec can be mixed together).
    // Don't mutate modifiers.
    // Be careful to clone all objects (coming from Effects properties such as $modifier) made part of o.value.
    _applyModifiers: function (member, modifiers, value, calculation) {
      var isString = typeof value == 'string'

      var o = {
        intermediate: null,   // +undefined is NaN while +null is 0
        // Holds an object that will be assignResp()'d after _calculate().
        // Null when doing sub-calculation (e.g. for override).
        // Hense don't access calculation.value, manipulate o.value instead.
        calculation: calculation,
        subCalc: member.subCalcGuard(),
      }

      for (var i = modifiers.length; i--; ) {
        var modifier = this.expandModifier(modifiers[i])

        this.L && this.L('apply %s to%s %.j : %.j', _.indexOf(this._constants.operation, modifier[0], _.forceObject), calculation ? '' : ' AD-HOC VALUE', value, modifier.slice(1))

        switch (modifier[0]) {
          default:
            this.L && this.L.in()
            // May mutate o.value and o.calculation. May mutate immediate params members but not their children (shallow copy).
            o.value = value
            var handled = this._applyModifier(o, modifier[0], modifier.slice(1))
            if (handled === undefined) {
              throw new Error('Unknown or unhandled modifier operation: ' + modifier)
            }
            value = o.value
            this.L && this.L.out()
            break
          case this._constants.operation.const:
            return this.deepClone(modifier[1])
          // Number.
          case this._constants.operation.delta:
            value += modifier[1]
            break
          case this._constants.operation.relative:
            o.intermediate += modifier[1] - 1
            break
          case this._constants.operation.clamp:
            var min = modifier[1]
            var max = modifier[2]
            if (min == null ) { min = -Infinity }
            if (max == null ) { max = Infinity }
            if (min <= max) {   // [$clamp, 1, 5] - allow 1 2 3 4 5
              value = value < min ? min : (value > max ? max : value)
            } else if (min == max ||  // [$clamp, 1, 1] - allow 1
                       // [$clamp, 5, 1] - allow ... -1 0 1 6 7 ...
                       value > max && value <= min /*note reverse min/max*/) {
              value = max
            }
            break
          // Array or string.
          case this._constants.operation.prepend:
            isString ? value = modifier[1] + value
              : value.unshift.apply(value, this.deepClone(modifier.slice(1)))
            break
          case this._constants.operation.append:
            isString ? value += modifier[1]
              : value.push.apply(value, this.deepClone(modifier.slice(1)))
            break
          // Array.
          case this._constants.operation.intersect:
            var func = 'filter'
            if (modifier.length == 1) {
              value = []
              break
            }
          case this._constants.operation.diff:
            var seen = new Set
            modifier.slice(1).forEach(seen.add, seen)
            value = _[func || 'reject'](value, function (item) {
              return seen.has(item)
            })
            break
          case this._constants.operation.override:
            // This correctly works with any combination of Array/Object:
            //   typeof value == Array  && typeof modifier == Array
            //   typeof value == Array  && typeof modifier == Object
            //   typeof value == Object && typeof modifier == Array
            //   typeof value == Object && typeof modifier == Object
            // This is important because PHP uses heurestics in deciding if
            // an array is associative (Object) or indexed (Array).
            _.each(modifier[1], function (item, key) {
              if (item == null) {
                delete value[key]
              } else {
                var modifier = this.expandModifier(item)
                var full = modifier == item
                if (full) {  // full form, index 0 = initial value
                  var initial = this.deepClone(modifier[0])
                  modifier = modifier.slice(1)
                }
                if (_.has(value, key)) {
                  var initial = value[key]
                } else if (!full) {
                  var initial = 0
                }
                this.L && this.L.in()
                value[key] = this._applyModifiers(member, [modifier], initial)
                this.L && this.L.out('overrode key %s : %.j', key, value[key])
              }
            }, this)
            break
          case this._constants.operation.random:
            value += _.random.apply(_, modifier.slice(1, 3)) * (modifier[3] || 1)
            break
          case this._constants.operation.randomArray:
            var potential = modifier.slice(2)
            if (modifier[1]) {
              value.push.apply(value, this.deepClone(_.shuffle(potential, modifier[1])))
            } else {
              return this.deepClone(_.sample(potential))
            }
            break
        }
      }

      if (o.intermediate !== null) {
        switch (modifier[0]) {
          case this._constants.operation.relative:
          case this._constants.operation.heroSpec:
          case this._constants.operation.spellSpec:   // XXX H3 subsystem
            value = o.intermediate > -1 ? value * (o.intermediate + 1) : 0
        }
      }

      return value
    },

    // Similarly to _test(), do not trigger partial invalidation on VALUE.
    _applyModifier: function (o, operation, params) {
      switch (operation) {
        case this._constants.operation.heroSpec:
          return this._applyHeroSpecModifier(o, params[0], params[1], o.subCalc('object::' + this._shared.objects.level).value)

        case this._constants.operation.heroSpecSkill:
          var level = o.subCalc('object::' + this._shared.objects.level).value
          var mastery = o.subCalc('skillMastery::' + params[1]).calc.updateIfNeeded().get('value')
          return o.value += params[mastery + 2] * (1 + params[0] * level)
      }
    },

    _applyHeroSpecModifier: function (o, mul, minLevel, level) {
      var bonus = mul * (level - (minLevel || 0))

      // max() checks are for when level >= minLevel.
      if (mul % 1 === 0) {
        o.value += Math.max(0, bonus)
      } else {
        // + 1 is for adjusting bonus vs handicap, - 1 is for 'relative' formula
        // calculation (see normal operation.relative handling).
        //
        // Adjusting: let's assume 5% magic resistance, that is 95% efficiency
        // of enemy's spells (so 5% handicap), defined as ['heroSpec', -0.05],
        // result: (bonus=-0.05*(1)) + 1 - 1 = -0.05 (o.intermediate change),
        // final result: o.value * (o.intermediate + 1) = 100*(-0.05+1) = 95.
        //
        // Now let's assume 5% magic bonus, that is 105% efficiency of own spells:
        // ['heroSpec', 0.05], (bonus=0.05*(1)) + 1 - 1 = 0.05 (o.intermediate),
        // final: 100*(0.05+1) = 105.
        o.intermediate += Math.max(0, bonus + 1 - 1)
      }

      return true
    },

    _attachIndex: function (member) {
      member.indexes = []

      var selectors = member.subCalc(SELECTORS, function (o) {
        return {selectors: o.partial}
      })

      var invalidateXYZ = function (o) {
        if (o.opt /*set()*/ || o.update /*_expandOption()*/) {
          var now = ifX.value != null && ifY.value != null && ifZ.value != null
          if (bySpot == now) {
            if (bySpot) {
              this._useIndex(member, selectors, this._effects.bySpot,
                ifX.value, ifY.value, ifZ.value, 0,
                [this._schema.ifX, this._schema.ifY, this._schema.ifZ, this._schema.ifRadius], false, 0)
              Common.off(bySpotEvent)
              bySpotEvent = member.off[member.off.length - 1]
            }
            return {bySpot: true}
          }
        }
      }.bind(this)

      var ifX = member.subCalc(this._schema.ifX, invalidateXYZ)
      var ifY = member.subCalc(this._schema.ifY, invalidateXYZ)
      var ifZ = member.subCalc(this._schema.ifZ, invalidateXYZ)
      // If all three are set, always examine bySpot first to correctly test ifRadius. Effects also appearing in later indexes will be skipped.
      var bySpot = ifX.value != null && ifY.value != null && ifZ.value != null
      var bySpotEvent
      invalidateXYZ({update: true})

      var target = member.subCalc(this._schema.target).value

      if (target == null) {
        this._useIndex(member, selectors, this._effects, null, null, null, null, [], true)
      } else {
        var ifObject = member.subCalc(this._schema.ifObject).value

        // If using bySpot and ifObject is also provided, set up these indexes: bySpot, byObject (once per set is... and ifObject), byTarget (for unset ifObject). If ifObject isn't provided, set up bySpot and bySpot (for unset ifX, ifY or ifZ).
        //
        // Combining bySpot with byObject is important to correctly test ifRadius: Effects with one will be listed in bySpot and tested before Effects in byObject/byTarget (if an ifRadius Effect wasn't tested prior to them, because Calculator._opt.ifRadius is always null _test() always fails comparing null with non-null).
        //
        // Since bySpot/byTarget and byObject/byTarget are complementary, it is equally possible to always use bySpot with byTarget without byObject, but the cardinality of bySpot is much higher than of byObject (i.e. there should be fewer Effects with unset ifObject rhan with unset ifX, ifY or ifZ).
        if (ifObject != null) {
          if (ifObject) {   // may be 0
            ;(member.subCalc(this._schema.isOpponent).value || [])
              .concat(member.subCalc(this._schema.isSupporter).value || [])
              .concat(member.subCalc(this._schema.isSupporterSamePlayer).value || [])
              .forEach(function (id) {
                this._useIndex(member, selectors, this._effects.byObject, id, 0, 0, 0, [])
              }, this)
          }

          // Cannot make ifObject implied even if all _opt.is... are unset because an
          // Effect having $ifObject == _opt.ifObject but also having one of $is...
          // set must not match.
          this._useIndex(member, selectors, this._effects.byObject, ifObject, 0, 0, 0, [])

          this._useIndex(member, selectors, this._effects.byTarget,
            target, this._constants.targetIndex.object, 0, 0, [], true)
        } else if (ifZ != null) {
          // If ifObject is not provided but ifX/ifY/ifZ are, test the
          // complementary all-with-either-of-these-three-unset index.
          this._useIndex(member, selectors, this._effects.byTarget,
            target, this._constants.targetIndex.spot, 0, 0, [], true)
        } else {
          this._useIndex(member, selectors, this._effects.byTarget,
            target, this._constants.targetIndex.any, 0, 0, [], true)
        }
      }

      if (this._opt.listen >= 2) {
        var est = this._opt.manyListeners

        var many = member.manyListeners = member.indexes.some(function (index) {
          var n = index[1]
          index = index[0]

          // Estimate the number of Effects to be matched as follows: for _effects (full scan), take strideX (pretend there are no empty objects, shouldn't be too numerous); for indexes, take three samples in a binary search fashion (levelsAtContiguous() would be more accurate but it walks all layers).
          if (n == null) {
            est -= index.size().x
          } else {
            //est += index[0].levelsAtContiguous(index[1])

            var half    = est >>> 1
            var quarter = est >>> 2
            var eighth  = est >>> 3
            var thisEst = 0

            if (index.anyAtContiguous(n, half)) {
              thisEst += half
            }
            if (thisEst < est && index.anyAtContiguous(n, thisEst + quarter)) {
              thisEst += quarter
            }
            if (thisEst < est && index.anyAtContiguous(n, thisEst + quarter + eighth)) {
              thisEst += eighth
            }

            est -= thisEst + (est >>> 4)
          }

          return est <= 0
        })

        this.L && this.L('%s listeners, estimated at %s %d', many ? 'MANY' : 'few', many ? 'least' : 'most', many ? -est : this._opt.manyListeners - est)

        // "many" is not kept updated as indexes change because it's an estimate only, and we don't want to re-add all MATCH sub-calcs to add or remove their ochange_n_N depending on the value of "many" (it's unlikely that it will cross the threshold so badly during a lifetime of INDEXES sub-calc of a given calculator that it will affect performance).
        if (many) {
          var effectProperties = this._shared.effectProperties
          var indexCount = member.indexes.length

          member.moff(this._effects, 'ochange', Common.batchGuard(5, function ($1, $2, $3, $4, $5, options) {
            var changed = new Set

            options.batch.forEach(function (event) {
              if (event[0] == 'ochange' && _.has(effectProperties, event[3])) {
                changed.add(event[1])
              }
            })

            changed.forEach(function (n) {
              for (var i = 0; i < indexCount; i++) {
                var member = this._subCalcs.member(MATCH + n + ':' + i)
                if (member) {
                  this.L && this.L('ochange effectProperties of Effect %d, index %d', n, i)
                  return member.invalidateGuard(options)
                }
              }
            }, this)
          }, {cx: this}))

          member.moff(this._effects, 'oremove', Common.batchGuard(3, function ($1, $2, $3, options) {
            var removed = []

            options.batch.forEach(function (event) {
              if (event[0] == 'oremove') {
                for (var i = 0; i < indexCount; i++) {
                  removed.add(MATCH + event[1] + ':' + i)
                }
              }
            })

            this.L && this.L('oremove Effect-s : %s', removed)
            this._subCalcs.evict(removed)
          }, {cx: this}))
        }
      }
    },

    // store should be an ObjectStore (1D, 2D or 3D) with property prop being
    // n in _effects, or it should be Effects wholly traversed.
    //
    // impliedSelectors will not be tested for Effects in
    // store because their values are guaranteed to match with _opt (selectors).
    //
    // For efficiency, indexes with longer implied selectors should be first so that when Effects are examined, if an Effect appears in two indexes it will be first matched in index requiring less selector tests (more implied selectors), then cached and when met in the other index that value will be used right away, without checking selectors that are not implied in that other index.
    _useIndex: function (
      member, selectors,
      store, x, y, z, prop,
      impliedSelectors, impliedTarget, myIndex
    ) {
      if (this._opt.listen) {
        // INDEXES consists of several indexes, each of which sets up this hook.
        member.moff(this, '+invalidate_' + INDEXES, function (res, options) {
          if (options.selectors) {
            member.indexes[myIndex][3] = indexSelectors()
            this.L && this.L('refresh index %d selectors : %s', myIndex, member.indexes[myIndex][3])
            return true
          } else if (options.bySpot) {
            return true
          }
        })
      }

      function indexSelectors() {
        if (impliedSelectors.length) {
          var set = selectors.set.concat()
          var unset = selectors.unset.concat()

          impliedSelectors.forEach(function (propIndex) {
            var i = indexFor(set, propIndex)
            set[i - 1] == propIndex
              ? set.splice(i - 1, 1)
              : unset.splice(indexFor(unset, propIndex) - 1, 1)
          })

          return set.concat(unset)
        } else {
          return selectors.set.concat(selectors.unset)
        }
      }

      var props = indexSelectors()
      var n = prop == null ? null : store.toContiguous(x, y, z, prop)
      if (myIndex == null) { myIndex = member.indexes.length }
      member.indexes[myIndex] = [store, n, null, props, !impliedTarget]

      this.L && this.L('add index %d = %s : %starget %s', myIndex, this._effects == store ? 'FULL SCAN' : _.format('%s at (%d;%d;%d), n %d, prop %d', _.indexOf(this._effects, store, _.forceObject), x, y, z, n, prop), impliedTarget ? '-' : '+', props)
    },

    _updateContext: function (member) {
      // Members of set and unset are sorted. target is missing.
      var set = member.set = []
      var unset = member.unset = []

      var selectors = this._shared.indexSelectors
      var byName = this._shared.indexSelectorsByName
      var opt = this._opt

      // Optimization: first check selectors that the caller has supplied a
      // value for, then check other selectors (a mismatch here is usually
      // a bug and unlikely to happen so avoid looping over such
      // selectors before hitting a mismatching set selector, which is a much
      // more likely occurrence). And always check target first since it is the
      // most distinctive.
      _.each(selectors, function (key, propIndex) {
        // Note that _opt doesn't necessary contain all $if... - missing are
        // assumed to be null/undefined and require Effect->$if... to be the
        // same. In other words, unset Effect->$if... means "any value" but
        // unset _opt.if... means "unset selector", not "any selector".
        //
        // As this is a small and dirty optimization, it doesn't consider _opt.expand (but we assume the most distinctive selectors are fixed) and custom-tested (_test()) selectors like $ifDateMax (that is based on _opt.ifDateMin).
        ;(_.has(opt, key) && opt[key] != null ? set : unset).push(propIndex)
      }, this)

      if (opt.listen) {
        member.moff(this, '+invalidate_' + SELECTORS, function (res, options) {
          return res || options.update
        })

        member.moff(this, 'change', Common.batchGuard(3, function ($1, $2, $3, options) {
          var changed = new Map   // index => now unset

          options.batch.forEach(function (event) {
            if (event[0] == 'change') {
              var now
              if ((now = event[2] /*now*/ == null) != (event[3] /*old*/ == null) &&
                  _.has(byName, event[1])) {
                changed.set(byName[event[1]], now)
              }
            }
          })

          var invalidate = false

          changed.forEach(function (nowUnset, propIndex) {
            var a, b
            nowUnset ? (a = set, b = unset) : (a = unset, b = set)
            var i = indexFor(a, propIndex)
            if (a[i - 1] == propIndex) {
              a.splice(i - 1, 1)
              b.splice(indexFor(b, propIndex), 0, propIndex)
              invalidate = true
            }
            // else - propIndex is already in the array it should be in.
          })

          invalidate && member.invalidateGuard(options, {update: true})
        }))
      }
    },

    _expandOption: function (member, selector) {
      var schema = this._schema
      var shared = this._shared
      var objects = this._shared.objects
      var consts = this.map.constants
      var subCalc = member.subCalc

      switch (selector) {
        case schema.ifTerrain:
        case schema.ifRiver:
        case schema.ifRoad:
          var ifX = subCalc(schema.ifX).value
          var ifY = ifX != null && subCalc(schema.ifY).value
          var ifZ = ifY != null && subCalc(schema.ifZ).value

          if (ifZ != null) {
            // Some targets (e.g. bonus_shroud...) may use $ifTerrain/... unrelated to the tile at $ifX. These targets will have _opt explicitly set.
            var n = this.map.byPassable.toContiguous(ifX, ifY, ifZ, 0)
            var prop = shared.g2pp[selector]

            member.mgetreval(function () {
              return this.map.byPassable.atContiguous(n + prop, 0)
            })

            member.mstoreinval(this.map.byPassable, n, prop)
          }

          return

        case schema.ifX:
        case schema.ifY:
        case schema.ifZ:
          // Either may be 0.
          var id = subCalc(schema.ifObject).value || subCalc(schema.ifBonusObject).value

          if (id) {
            // XXX=RH
            var obj = this.map._actionableAtter(id, 0, 0, 0)
            var spot = this.map.actionableSpot(obj)
            var old = obj[shared.xyz2f[selector]]
            member.value = spot ? spot[shared.xyz2i[selector]] : old

            member.mreval(function () {
              var now = this.map.objects.atContiguous(obj._n + shared.xyz2p[selector], 0)
              member.value += (now - old)
              old = now
              return member.value
            })

            if (this._opt.listen >= 2) {
              member.moff(this.map.objects, 'ochange_n_' + obj._n,
                function ($1, $2, prop, $4, $5, options) {
                  switch (prop) {
                    case shared.xyz2p[selector]:
                      return member.invalidateGuard(options, {update: true})
                    case objects.width:
                    case objects.height:
                    case objects.actionable:
                      member.invalidateGuard(options)
                  }
                })
            }

            return
          }

          var id = subCalc(schema.ifCombat).value

          if (id != null) {
            var rep = this.map.combats.nested(id)

            member.mgetreval(function () {
              return rep.get(shared.xyz2f[selector])
            })

            member.meventinval(rep, 'change_' + shared.xyz2f[selector], 2)
            return
          }

          return

        case schema.ifContext:
          var combat = subCalc(schema.ifCombat, UPD_INC)

          member.mgetreval(function () {
            return combat.value == null ? consts.effect.context.map
              : consts.effect.context.combat
          })

          return

        case schema.ifPlayerController:
          var player = subCalc(schema.ifPlayer).value

          if (player != null) {
            var rep = this.map.players.nested(player || 0)

            member.mgetreval(function () {
              return rep.get('controllers')[rep.get('controller')]['type']
            })

            member.meventinval(rep, 'change_controllers', 2)
            member.meventinval(rep, 'change_controller', 2)
          }

          return

        case schema.ifDateMin:    // matched against Effect->$ifDateMin..Max
        case schema.ifDateDay:
        case schema.ifDateWeek:
        case schema.ifDateMonth:
          member.mgetreval(function () {
            return selector == schema.ifDateMin
              ? this.map.get('date')
              : this.map.date()[shared.d2f[selector]]
          })

          member.meventinval(this.map, 'change_date', 2)
          return

        case schema.ifWorldBonus:
          member.mgetreval(function () {
            var bonus = this.map.get('bonus')
            if (bonus) {
              var i = bonus.indexOf(',')
              return i == -1 ? +bonus : +bonus.substr(0, i)
            } else {
              return consts.map.bonus.none
            }
          })

          member.meventinval(this.map, 'change_bonus', 2)
          return

        case schema.ifObject:
          var party = subCalc(schema.ifCombatParty, UPD_INC)
          var combat

          member.mgetreval(function () {
            if (party.value != null) {
              combat = combat || subCalc(schema.ifCombat, UPD_INC)
              var rep = this.map.combats.nested(combat.value)
              var obj = rep.parties.nested(party.value).object
              return obj && obj.get('id')
            }
          })

          return

        case schema.ifBonusObjectClass:
          var id = subCalc(schema.ifBonusObject, UPD_INC)

          member.mgetreval(function () {
            if (id.value) {   // may be 0
              return this.map.objects.atCoords(id.value, 0, 0, objects.class, 0)
              // class cannot change.
            }
          })

          return

        case schema.ifContextAggression:
        case schema.isOpponent:
        case schema.isSupporter:
        case schema.isSupporterSamePlayer:
          var combat = subCalc(schema.ifCombat).value

          if (combat != null) {
            var rep = this.map.combats.nested(combat)

            member.meventinval(rep, 'nestExNew')
            member.meventinval(rep, 'unnested')

            if (selector == schema.ifContextAggression) {
              var player = subCalc(schema.ifPlayer, UPD_INC)

              member.mgetreval(function () {
                if (player.value != null) {
                  var attacker = rep.parties.first().player.get('team')
                  // For combat against some objects (e.g. Crypt), $owner may be false (non-ownable) and ifPlayer will be false too.
                  var me = this.map.players.nested(player.value || 0).get('team')

                  return me == attacker
                    ? consts.effect.aggression.attacker
                    : consts.effect.aggression.defender
                }
              })
            } else {  // is...
              var obj = subCalc(schema.ifObject, UPD_INC)
              var player

              member.mgetreval(function () {
                player = player || (obj.value && subCalc(schema.ifPlayer, UPD_INC))

                if (obj.value && player.value != null) {
                  var value = []

                  rep.parties.each(function (party) {
                    if (party.object && party.object.get('id') != obj.value) {
                      if (party.player.get('player') == player.value) {
                        if (selector != schema.isSupporterSamePlayer) { return }
                      } else if (party.player.get('team') == this.map.players.nested(player.value || 0).get('team')) {
                        if (selector != schema.isSupporter) { return }
                      } else {
                        if (selector != schema.isOpponent) { return }
                      }

                      value.push(party.object.get('id'))
                    }
                  }, this)

                  return value
                }
              })
            }

            // team cannot change during combat.
          }

          return

        case schema.ifCreature:
        case schema.ifCombatParty:
        case schema.ifTargetCreature:
        case schema.ifTargetPlayer:
        case schema.ifTargetObject:
          var cr = subCalc(shared.v2f[selector], UPD_INC)
          var rep

          member.mgetreval(function () {
            if (cr.value != null) {
              rep = rep || subCalc(schema.ifCombat, UPD_INC)
              var obj = this.map.combats.nested(rep.value).objects.nested(cr.value)

              switch (selector) {
                case schema.ifCreature:
                case schema.ifTargetCreature:
                  return obj.get('creature')
                case schema.ifCombatParty:
                  return obj.party._parentKey
                case schema.ifTargetPlayer:
                  return obj.party.player._parentKey
                case schema.ifTargetObject:
                  return obj.party.object && obj.party.object.get('id')
              }

              // XXX party, creature cannot change?
            }
          })

          return

        case schema.isTargetAdjacent:
          var cr = subCalc(schema.ifTargetCombatCreature).value

          if (cr != null) {
            var rep = this.map.combats.nested(subCalc(schema.ifCombat).value)
            cr = rep.objects.nested(cr)
            var value = member.value = []
            // XXX As explained in rm, technically we should not expect that an object explicitly specified as _opt.iCC is not present in combat - client of this calc must remove calc when iCC is removed; however, this is not properly done ATM and causes failure in walkImpassable() below (for example, try casting Armageddon - Combat.State's _calcs holds creature_flying and others with explicit iCC and are not removed at all).
            if (!cr) { return }

            var pathFind = this.cx.makeHexPathFinder({
              mapWidth: rep.get('width'),
              mapHeight: rep.get('height'),
            })
            // width, height cannot change.

            // XXX=R
            rep.walkImpassable(cr, function (o) {
              pathFind._neighboursOf([
                o.mx, o.my, 0,
                rep.bySpot.toContiguous(o.mx, o.my, 0, 0),
              ])
                .forEach(function (neigh) {
                  rep.bySpot.findAtContiguous(neigh[3], function (adjacent) {
                    adjacent = rep.objects.nested(adjacent)

                    // XXX instanceof would be better but needs module require; add "isCreature" like in other Map classes?
                    if (adjacent.constructor.name == 'HeroWO.Map.Combat.Creature') {
                      if (adjacent.player == cr.player) {
                        var relation = consts.effect.isAdjacent.own
                      } else if (adjacent.player.get('team') == cr.player.get('team')) {
                        var relation = consts.effect.isAdjacent.ally
                      } else {
                        var relation = consts.effect.isAdjacent.enemy
                      }

                      value.push([adjacent._parentKey, relation])
                    }
                  }, this)
                }, this)
            }, this)

            pathFind.remove()

            // team cannot change during combat.

            // Hooks on bySpot already handle these.
            //member.meventinval(cr, 'change_x', 2)
            //member.meventinval(cr, 'change_y', 2)
            //member.meventinval(cr, 'change_z', 2)
            //member.meventinval(cr, 'change_width', 2)
            //member.meventinval(cr, 'change_height', 2)

            member.meventinval(rep.bySpot, 'oadd', 3)
            member.meventinval(rep.bySpot, 'ochange', 5)
            member.meventinval(rep.bySpot, 'oremove', 3)
          }

          return

        case schema.ifPlayer:
          var id = subCalc(schema.ifObject).value

          if (id) {
            var n = this.map.objects.toContiguous(id, 0, 0, 0, 0)

            member.mgetreval(function () {
              return this.map.objects.atContiguous(n + objects.owner, 0)
            })

            member.mstoreinval(this.map.objects, n, objects.owner)
          }

          return

        case schema.ifObjectType:
          var id = subCalc(schema.ifObject, UPD_INC)

          member.mgetreval(function () {
            if (id.value) {
              return this.map.objects.atCoords(id.value, 0, 0, objects.type, 0)
            }
          })

          return

        case schema.ifGarrisoned:
        case schema.ifVisiting:
          var id = subCalc(schema.ifObject).value
          var type = id && subCalc(schema.ifObjectType).value

          if (id && (type == consts.object.type.hero ||
                     type == consts.object.type.town)) {
            var prop = shared.gv2p[selector]
            var n = this.map.objects.toContiguous(id, 0, 0, 0)

            member.mgetreval(function () {
              return this.map.objects.atContiguous(n + prop, 0) || 0
            })

            member.mstoreinval(this.map.objects, n, prop)
          }

          return

        case schema.ifVehicle:
        case schema.ifHero:
          var id = subCalc(schema.ifObject).value
          var type = id && subCalc(schema.ifObjectType).value

          if (id && type == consts.object.type.hero) {
            var n = this.map.objects.toContiguous(id, 0, 0, 0, 0)
            var prop = shared.h2p[selector]

            member.mgetreval(function () {
              return this.map.objects.atContiguous(n + prop, 0)
            })

            member.mstoreinval(this.map.objects, n, prop)
          }

          return
      }

      // XXX many of the above is H3 subsystem
    },

    _affectorsIn: function (member, indexes, name) {
      var self = this

      var indexIndex = +name.substr(2)
      var indexInfo = indexes[indexIndex]
      var fullScan = indexInfo[1] == null

      var atter = this._shared.affectorAtter

      function priority(n) {
        var effect = atter(n, 0)
        var stack = effect[0]
        var priority = effect[1] || 0

        return _.isArray(stack)
          ? {stack: stack[0], stackPriority: stack[1], priority: priority}
          : {stack: stack, stackPriority: 0, priority: priority}
      }

      var plain = member.plain = new Map    // Map priority => array of n
      var stacks = member.stacks = new Map  // Map stack => Map like plain, with stackPriority property
      // Relation between this, affector lists (plain and stacks) and MATCH members is as such: MATCH count >= priorities >= affectors. All three have the same count if no different stackPriorities for the same stack were met. Else, if the highest priority was met first, priority count = affectors, if later than any lower priority then priority count > affectors. Note that order in which Effects are "met" is generally unpredictable.
      //
      // In other words, priorities may contain members that are not part of final affectors of this AFFECTORS_IN, but never fewer.
      var priorities = new Map    // Map n => priority()
      var L = this.L

      function matchEffect(n) {
        L && L('test Effect %d', n)
        var matchAt_n = MATCH + n + ':'

        // It's easily possible to further sub-divide matching of Effect into matching of selector of Effect (e.g. 'match:N:SEL') but this will create an explosion in the number of _subCalcs. Even at this form, we'll have a member for every tested Effect (which can be hundreds); changing one selector leads to invalidation of Effects that used it. Multiplied by selector count (several hundreds), and also by one-two events set up by most, such fine-grained recalculation (re-matching only the changed selector, not all selectors of an Effect) is unlikely to give serious performance benefits since matching selectors is must be already very fast.
        for (var i = 0; i < indexes.length; i++) {
          if (i != indexIndex && self._subCalcs.has(matchAt_n + i)) {
            // Skip Effects already tested by another index' AFFECTORS_IN
            // (no matter if it has matched or not).
            L && L('skip, already tested by index %d (%s)', i, self._subCalc(matchAt_n + i).match ? 'matched' : 'mismatched')
            return
          }
        }

        if (member.subCalc(matchAt_n + indexIndex).match) {
          var ssp = priority(n)
          L && L('store matched Effect %d : %j', n, ssp)

          if (ssp.stack === false) {
            var list = plain.get(ssp.priority)
            list ? list.push(n) : plain.set(ssp.priority, [n])
          } else {
            var list = stacks.get(ssp.stack)
            if (!list) {
              var list = new Map
              list.stackPriority = ssp.stackPriority
              list.set(ssp.priority, [n])
              stacks.set(ssp.stack, list)
            } else {
              var lp = list.stackPriority
              if (lp > ssp.stackPriority) {
                return
              } else if (lp < ssp.stackPriority) {
                list.clear()
                list.stackPriority = ssp.stackPriority
                list.set(ssp.priority, [n])
              } else {
                var l = list.get(ssp.priority)
                l ? l.push(n) : list.set(ssp.priority, [n])
              }
            }
          }

          priorities.set(n, ssp)

          // undefined and null don't stop ObjectStore's find...(). Using null to signal revalidate().
          return null
        }
      }

      function invalidate($1, $2, $3, options) {
        var added = new Set
        var removed = []

        options.batch.forEach(function (event) {
          switch (event[0]) {
            case 'oadd':
              var n = fullScan ? event[1] : event[3][0]
              self.L && self.L('oadd Effect %d : %j', n, _.filter(self._effects.atter()(n, 0), function (v) { return v !== false }, _.forceObject))
              added.add(n)
              break
            case 'oremove':
              var n = fullScan ? event[1] : event[3][0]
              if (!added.delete(n)) {
                var ssp = priorities.get(n)
                if (ssp) {
                  priorities.delete(n)
                  ssp.n = n
                  removed.push(ssp)
                }
              }
          }
        })

        if (added.size || removed.length) {
          // With tracing enabled, the log will always have added: {} after
          // serialization to JSON but it doesn't mean added is empty.
          member.invalidateGuard(options, {added: added, removed: removed})
        }
      }

      function revalidate(res, options) {
        if (options.added) {
          var invalidate = false

          // First processing removed in case we meet one that will cause full invalidation. It also makes it faster to scan arrays while they are smaller.
          options.removed.forEach(function (ssp) {
            if (invalidate !== 1) {
              self.L && self.L('oremove matched Effect %d : %j', ssp.n, ssp)

              if (ssp.stack === false) {
                var list = plain.get(ssp.priority)
                list.length == 1
                  ? plain.delete(ssp.priority)
                  : list.splice(list.indexOf(ssp.n), 1)
              } else {
                var list = stacks.get(ssp.stack)
                if (list.stackPriority != ssp.stackPriority) {
                  return
                }
                var l = list.get(ssp.priority)
                if (l.length != 1) {
                  l.splice(l.indexOf(ssp.n), 1)
                } else if (list.size != 1) {
                  list.delete(ssp.priority)
                } else if (ssp.stackPriority) {
                  // The removed Effect provided the only value for ssp.stack of ssp.stackPriority. Have to reprocess the index because there may have been lower-stackPriority Effects that will make into result now that the higher priority stack is gone.
                  self.L && self.L('removed sole highest-priority stack member, force full invalidation')
                  invalidate = 1
                  return
                } else {
                  // Can't have stackPriority < 0, just means no other Effects in that stack exist.
                  stacks.delete(ssp.stack)
                }
              }

              invalidate = true
            }
          })

          if (invalidate !== 1) {
            // Matching Effect on addition is at odds with the ideal purpose of partial invalidation (quick updates) and may have some serious side effects (like selector expansion). However, we assume that if listen is at 2+ then the client will want the result anyway and this matching will happen sooner or later, so doing it sooner and saving on complete eviction of AFFECTORS_IN.
            options.added.forEach(function (n) {
              invalidate |= matchEffect(n) === null
            })

            options.sameAffectors = !invalidate
            return true
          }
        }
      }

      if (fullScan) {
        indexInfo[0].find(0, function ($1, $2, $3, $4, $5, n) { matchEffect(n) })
      } else {
        indexInfo[0].findAtContiguous(indexInfo[1], matchEffect)
      }

      if (this._opt.listen >= 2) {
        member.moff(this, '+invalidate_' + name, revalidate)

        var guard = Common.batchGuard(3, invalidate)
        var n = fullScan ? '' : '_n_' + indexInfo[1]
        member.moff(indexInfo[0], 'oadd'    + n, guard)
        member.moff(indexInfo[0], 'oremove' + n, guard)

        function invalidatePriority(n, $1, $2, $3, $4, $5, options) {
          // priorities might have extra members missing from plain/stacks but checking that isn't worth the trouble here.
          priorities.has(n) && member.invalidateGuard(options)
        }

        // priority and stack rarely change so just evict AFFECTORS_IN.
        //
        // If a change in priority or stack occurs followed by oremove in the same batch, AFFECTORS_IN will have been evicted by the time oremove fires and won't respond to it (just what we need).
        member.moff(this._effects, 'ochange_p_' + atter.priorityIndex, invalidatePriority)
        member.moff(this._effects, 'ochange_p_' + atter.stackIndex, invalidatePriority)
      }

      return indexInfo[0] == this._effects.bySpot
    },
  }, {shared: {}})

  Calculator.Effect.expandModifier = function (modifier, constants) {
    if (!_.isArray(modifier)) {
      switch (typeof modifier) {
        case 'number':
          return modifier % 1 === 0 ? [constants.operation.delta, modifier]
            : (modifier < 0 ? [constants.operation.const, -modifier]
                : [constants.operation.relative, modifier])
        case 'object':
          return [constants.operation.override, modifier]
        default:  // boolean, string
          return [constants.operation.const, modifier]
      }
    } else if (typeof modifier[0] != 'number') {
      return [constants.operation.override, modifier]
    } else {
      return modifier   // already full form
    }
  }

  const effectRE = /^(?:(target|test)$|(i[fs])[A-Z])/

  // Common ideom: perform a partial update in response to a sub-calc's partial update, or evict if the sub-calc was fully invalidated.
  const UPD_INC = function (options) {
    return {update: options.partial}
  }

  const indexFor   = Common.indexFor('', 'array[mid] - value')
  const indexFor_p = Common.indexFor('', 'array[mid].priority - value')

  // Constants for _readySubCalc(). Negative values to avoid conflicts with Effects schema property indexes.
  const RESULT        = Calculator.Effect.RESULT        = -1
  const INITIAL       = Calculator.Effect.INITIAL       = -2
  const INDEXES       = Calculator.Effect.INDEXES       = -3
  const SELECTORS     = Calculator.Effect.SELECTORS     = -4
  const VALUE         = Calculator.Effect.VALUE         = -5
  const AFFECTORS     = Calculator.Effect.AFFECTORS     = -6
  const AFFECTORS_IN  = Calculator.Effect.AFFECTORS_IN  = ':a'   // :a<index index>
  const MATCH         = Calculator.Effect.MATCH         = ':m'   // :m<Effect n>:<index index>

  Calculator.Effect.GenericNumber = Calculator.Effect.extend('HeroWO.Calculator.Effect.GenericNumber', {
    _opt: {
      initial: 0,
    },

    events: {
      '+normalize_value': Common.normIntOr(null),
    },
  })

  Calculator.Effect.GenericString = Calculator.Effect.extend('HeroWO.Calculator.Effect.GenericString', {
    _opt: {
      initial: '',
    },

    events: {
      '+normalize_value': function (res, now) {
        return now + ''
      },
    },
  })

  Calculator.Effect.GenericBool = Calculator.Effect.extend('HeroWO.Calculator.Effect.GenericBool', {
    _opt: {
      // No initial value allows an Effect determine if it's the
      // first to match. This is used by 'check' modifier operation and others.
      // Using null rather than undefined allows using number modifiers.
      //
      // This doesn't affect _opt.value which is forced to bool after
      // calculation; test affectors' length to detect this condition.
      initial: null,
    },

    events: {
      '+normalize_value': Common.normBool,
    },
  })

  Calculator.Effect.GenericIntArray = Calculator.Effect.extend('HeroWO.Calculator.Effect.GenericIntArray', {
    _comparator: Common.normIntArrayCompare,

    _opt: {
      initial: [],
    },

    events: {
      '+normalize_value': function (res, now) {
        return this._comparator(now, this.get.bind(this, 'value'))
          // Return []/{} if there were no modifiers to apply (now is null).
          || new this.get('value').constructor
      }
    },
  })

  Calculator.Effect.GenericStrArray = Calculator.Effect.GenericIntArray.extend('HeroWO.Calculator.Effect.GenericStrArray', {
    _comparator: Common.normArrayCompare,
  })

  Calculator.Effect.GenericIntHash = Calculator.Effect.GenericIntArray.extend('HeroWO.Calculator.Effect.GenericIntHash', {
    _opt: {
      initial: {},
    },

    _comparator: Common.normIntObjectCompare,
  })

  return Calculator
})