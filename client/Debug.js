define(['DOM.Common', 'Calculator', 'ObjectStore'], function (Common, Calculator, ObjectStore) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  var old_postInit = ObjectStore.prototype.postInit

  // This module and Entry.Browser.js provide the following features to aid in debugging:
  //* methods on `'window: `'sq(), `'pf()
  //* properties on `'window: `'Common, `'cx, `'_, `'$, `'sc, `'pl, `'ui, `'cm,
  //  `'profiler, `'ws
  //* methods on `'Context (`[window.cx`]): `'trace(), `'cid(), `'dumpNodes(),
  //  `'dumpEffects()
  //* marks in Chrome's Performance tab
  //* DOM.Controls toolbar
  //* DOM.Controls.Modification area
  //* automatic stylesheet reloading when changed on the server (css-monitor.php)
  //* initially disabled Adventure Map animations, for performance and better focus
  //* disabled `[_.log`], for improved page loading speed; it can be restored
  //  by assigning `'oldLog at any time, or via DOM.Controls
  //* the `'debug variable in Entry.Browser.js, to enable production, debug or tracing mode
  //* URL (`'location): `[?d[&...]`] (enable production mode for this page),
  //  `[(?|&)s=NUM`] (override `[_.seed`])
  //* `[_.seed`] set to a predictable, date/hour-based value
  //* various optimizations like delayed Calculator updates disabled, to make
  //  execution more deterministic
  var Debug = Common.Sqimitive.extend('HeroWO.Debug', {
    mixIns: [Common.ContextModule],
    persistent: true,
    _stores: null,
    _moduleContainers: null,

    _opt: {
      trace: false,
    },

    events: {
      '-init': function () {
        this._stores = new Set
        this._moduleContainers = new Set
      },

      init: function () {
        window.Common = Common
        window.cx = this.cx
        window._ = _
        window.$ = $
        window.sq = function (node) { return $(node).data('sqimitive') }

        $(document.body).addClass('debug')
      },

      change_trace: function (now) {
        var self = this

        ObjectStore.prototype.postInit = old_postInit
        this._stores.forEach(function (c) { self.autoOff(c) })
        this._stores.clear()
        this._moduleContainers.forEach(function (c) { self.autoOff(c) })
        this._moduleContainers.clear()

        Common.ModuleContainer.staticProps.trace = Common.stub
        ObjectStore.TakeRelease.staticProps.trace = Common.stub

        if (now) {
          function add(set, obj) {
            self.autoOff(obj, {
              '-unnest': function () {
                obj._parent && set.delete(obj)
              },
            }, null)

            set.add(obj)
          }

          ObjectStore.prototype.postInit = function () {
            add(self._stores, this)
            return old_postInit.apply(this, arguments)
          }

          this._moduleContainers.add(this.cx)

          Common.ModuleContainer.staticProps.trace = function (container) {
            add(self._moduleContainers, container)
          }

          ObjectStore.TakeRelease.staticProps.trace = function (obj, func) {
            obj._trace = obj._trace || []
            // First line is for class name, second for this staticProps.trace()
            // call, third for func().
            var stack = ((new Error).stack + '').split('\n').slice(3)
            obj._trace.push([Date.now(), func, obj._references, stack])
          }
        }
      },

      attach: function () {
        var self = this
        this.cx.autoAddModule(Debug.Screen)

        this.cx.mixIn({
          // Since Debug is persistent, its attach() is called immediately,
          // not when Context is loading a game() and there are no Screen-s yet.
          change_loading: function (now) {
            now || self.cx.autoAddModule(Debug.Screen)
          },

          // When `'debug in `[Entry.Browser.js`] is 2+, dumps active Module-s and stack traces of take()/release() calls (for TakeRelease objects). Use this to diff engine state before and after some action to validate proper clean-up of unused objects.
          trace: function (obj) {
            if (!obj) {
              var res = []
              var alive = []
              var moduleCount = []

              self._stores.forEach(function (store) {
                alive.push(store)
              })
              self._moduleContainers.forEach(function (container) {
                alive.push.apply(alive, container.modules.toArray())
                moduleCount.push(container.modules.length)
              })

              res.push(_.format('Stores: %d\tModules: %s',
                self._stores.size, moduleCount.join('+')))

              alive.sort(function (a, b) {
                return +a._cid.substr(1) - +b._cid.substr(1)
              })

              res.push.apply(res, alive.map(function (obj) {
                var res = [obj._cid]
                if (obj._parentKey != null) {
                  res.push('_pK=[' + obj._parentKey + ']')
                }
                if (obj._trace) {
                  res.push(obj._references + (obj._references < 0 ? '!!!' : ''))
                }
                res.push(obj.constructor.name.replace(/^HeroWO\./, ''))
                return res.join('\t')
              }))

              return res.join('\n')
            } else {
              if (typeof obj != 'object') {
                obj = this.cid(obj)
              }

              if (obj._trace) {
                var res = obj._trace.concat().reverse().map(function (call) {
                  return _.format('%s %s() (was %d before)\n%s',
                    call[0], call[1], call[2], call[3].join('\n'))
                })

                res.unshift(_.format('_references = %d %s',
                  obj._references, obj._references < 0 ? '!!!' : ''))
                return res.join('\n\n')
              }
            }
          },

          // Finds a module by its _cid (as seen in the console), no matter its
          // parent (`'Context or `'Screen).
          //
          //> cid string `'p123`, integer without leading `'p
          //
          // Tip: when debugging Calculators, set a breakpoint and trigger
          // update with `[window.cx.cid(123).update()`].
          cid: function (cid) {
            /^p/.test(cid) || (cid = 'p' + cid)
            var res

            var find = function (m) {
              if (m._cid == cid) {
                return res = m
              } else {
                return m.constructor.modules && m.modules.some(find)
              }
            }

            this.modules.some(find)
            return res
          },

          // Returns a textual representation of DOM subtree starting from
          // `'Context (if without `'el).
          //
          //> el Node`, missing = `[cx.el`]
          //> indent string`, missing
          dumpNodes: function (el, indent) {
            el = el || this.el[0]
            return _.format('%s%s %s\n%s',
              indent || '', el.tagName, el.className,
              _.map(el.children, function (child) {
                return this.dumpNodes(child, indent + '\t')
              }, this).join('')
            )
          },

          // Returns a textual representation of one or more Effects.
          //
          //> arg string `'p123 to display that Calculator's `'affectors`,
          //  integer an Effect's `'n (in `[map.effects`])`,
          //  array of integer `'n's
          dumpEffects: function (arg) {
            var res = ''

            if (/^p/.test(arg)) {
              arg = this.cid(arg)

              if (!arg) {
                return '<not found>'
              } else if (!(arg instanceof Calculator.Effect)) {
                return '<not a Calculator.Effect>'
              } else if (!arg.get('affectors')) {
                return '<not calculated yet>'
              }

              res += _.format('%s\n     v=%j t=%d/%s\n',
                arg._parentKey,
                arg.get('value'),
                arg.get('target'),
                _.indexOf(this.map.constants.effect.target, arg.get('target'))
              )

              arg = arg.get('affectors')
            } else if (typeof arg == 'number') {
              arg = [arg]
            } else {
              arg = []
              this.map.effects.find(0, function ($1, $2, $3, $4, $5, n) { arg.push(n) })
            }

            var props = [
              'test',
              'maxDays',
              'maxCombats',
              'maxRounds',
              'whileObject',
              'target',
              'dynamic',
              'source',
              'priority',
              'stack',
              'modify',
              'modifier',
            ]

            var atter = this.map.effects.atter()

            arg.forEach(function (n) {
              var effect = atter(n, 0)

              res += _.format('%6d. %s',
                n,
                props.map(function (prop) {
                  var res = ''
                  var value = effect[prop]
                  if (value !== false) {
                    if (prop == 'modifier') {
                      if (_.isArray(value)) {
                        value = _.indexOf(this.map.constants.effect.operation, value[0]) + '/' + value
                      } else if (value instanceof Object) {
                        value = JSON.stringify(value)
                      }
                    }
                    res += prop + '=' + value
                    var str = _.indexOf(this.map.constants.effect[prop] || {}, value)
                    if (str != null) { res += '/' + str }
                    res += ' '
                  }
                  return res
                }, this).join('')
              )

              var indented
              _.entries(effect).forEach(function (prop) {
                if (prop[0][0] != '_' /*_n _l*/ &&
                    props.indexOf(prop[0]) == -1 && prop[1] !== false) {
                  if (!indented) {
                    indented = res += '\n        '
                  }
                  res += prop[0].match(/^.|[A-Z][a-z]?/g).join('') + '=' + prop[1] + ' '
                }
              })

              res += '\n'
            }, this)

            return res
          },
        })
      },
    },
  })

  Debug.Screen = Common.Sqimitive.extend('HeroWO.Debug.Screen', {
    mixIns: [Common.ScreenModule],

    events: {
      init: function () {
        window.sc = this.sc
      },

      attach: function () {
        window.pl = this.pl
        var ui = window.ui = this.sc.modules.nested('HeroWO.H3.DOM.UI')

        this.autoOff(this.sc, {
          cellClick: function (x, y, z) {
            //var level = this.map.bySpot.levelsAtCoords(x, y, z) - 1
            //if (level >= 0) {
            //  var id = this.map.bySpot.atCoords(x, y, z, 'id', level)
            //  this.map.objects.removeAtCoords(id, 0, 0, 0)
            //}
          },
        })

        this.autoOff(ui.windows, {
          nestExNew: function (res) {
            if (res.child.constructor.name == 'HeroWO.H3.DOM.Combat') {
              window.cm = res.child
              res.child.once('unnest', function () {
                window.cm == res.child && (window.cm = null)
              })
            }
          },
        })
      },
    },
  })

  // Combine measurments by Profiler with console.profile/End() ("JavaScript Profilder" in Chrome) over interesting spots (like inside methods), as well as Performance tab (Chrome) with performance.mark/measure() (to determine interesting sub-regions within the large timeline).
  //
  // Enabling Sqimitive.Core.trace will provide details on event listeners (but will significantly slow down execution).
  Debug.Profiler = Common.Sqimitive.extend('HeroWO.Debug.Profiler', {
    _profilerWrapped: true,
    _startTime: 0,
    _wrappedClasses: 0,
    _wrappedMethods: 0,
    _calls: null,
    _functions: null,
    _fireStack: null,

    events: {
      attach: function () {
        this.restart()

        //this._wrapAll(this.constructor.__super__)   // more lightweight than below

        for (var cls = this.constructor.__super__; cls && this._wrapAll(cls); ) {
          cls = cls.constructor.__super__
        }
      },

      remove: function () {
        this.restart()
        // XXX=I proper unhooking
      },
    },

    restart: function () {
      this._startTime = Date.now()
      this._wrappedClasses = this._wrappedMethods = 0
      this._calls = [{children: []}]
      this._functions = new Map
      this._fireStack = []
    },

    _wrapAll: function (proto) {
      if (!_.has(proto, '_profilerWrapped')) {
        proto._profilerWrapped = true
        this._wrappedClasses++

        //console.log(proto.constructor.name)

        _.each(proto, function (func, prop) {
          if (typeof func == 'function' &&
              func.name != 'firer' && //func != Common.Sqimitive.prototype.firer &&
              func.name != 'profilerWrapped' &&
              !/^[A-Z]/.test(func.name) /*not a constructor - class reference*/) {
            this._wrappedMethods++

            if (func == Common.Sqimitive.prototype.fire) {
              this._wrap(proto, prop, this._fire)
            } else {
              this._wrap(proto, prop, this._call, {class: proto.constructor.name, method: prop})
            }
          }
        }, this, _.forceObject)

        _.each(proto.constructor, function (func, prop) {
          if (typeof func == 'function' &&
              func != Common.Sqimitive.fire &&
              func !== Common.Sqimitive.stub &&
              !/^[A-Z]/.test(func.name)) {
            this._wrappedMethods++
            this._wrap(proto.constructor, prop, this._call, {class: proto.constructor.name, method: '#' + prop})
          }
        }, this, _.forceObject)

        return true
      }
    },

    _wrap: function (obj, prop, func, info) {
      var self = this
      var sup = obj[prop]

      obj[prop] = function profilerWrapped() {
        return func.call(self, sup, this, arguments, info)
      }
    },

    _fire: function (sup, cx, args) {
      var self = this
      var eobjs = cx._events[args[0]] || []

      function enter(cx, eobj) {
        var call = self._enter(eobj.cx || cx, {
          event: self._fireStack[0][2],
          handler: self._funcInfo(eobj.func, {trace: eobj.trace}).id,
        })
        if (self._fireStack[0][1]) {
          throw new Error('Broken fire() stack')
        }
        self._fireStack[0][1] = call
      }

      function leave() {
        var call = self._fireStack[0][1]
        if (!call) {
          throw new Error('Broken fire() stack')
        }
        self._leave(call)
        self._fireStack[0][1] = null
      }

      _.each(eobjs, function (eobj, i) {
        if (!eobj.post) {
          eobj.post = function profilerPost(eobj, res) {
            leave()
            var i = self._fireStack[0][0].indexOf(eobj)
            if (i < self._fireStack[0][0].length - 1) {
              enter(this, self._fireStack[0][0][i + 1])
            }
            return res
          }
        }
      })

      this._fireStack.unshift([eobjs.concat(), null, args[0]])
      eobjs.length && enter(cx, eobjs[0])
      try {
        return sup.apply(cx, args)
      } finally {
        this._fireStack[0][1] && leave()
        this._fireStack.shift()
      }
    },

    _funcInfo: function (func, info) {
      var res = this._functions.get(func)
      res || this._functions.set(func, res = _.extend({id: this._functions.size}, info))
      return res
    },

    _call: function (sup, cx, args, info) {
      var call = this._enter(cx, info)
      try {
        //var res = this._time(Common.Sqimitive.__super__.fire, cx, args)
        return sup.apply(cx, args)
      } finally {
        this._leave(call)
      }
    },

    _enter: function (cx, info) {
      if (cx && cx.fire == Common.Sqimitive.prototype.fire) {
        for (var cls = cx.constructor.prototype; cls && this._wrapAll(cls); ) {
          cls = cls.constructor.__super__
        }
      }

      var call = {
        time: Date.now(),
        cx: cx ? cx.constructor.name : '?',
        children: [],
        total: 0,
        self: 0,
        finished: false,
      }

      _.extend(call, info)
      var i = this._calls.push(call)
      this._calls[i - 2].children.push(call)
      return call
    },

    _leave: function (checkCall) {
      var call = this._calls.pop()
      if (checkCall && checkCall != call) {
        throw new Error('Broken stack')
      }

      var total = call.total = Date.now() - call.time
      call.self += total
      call.finished = true
      _.last(this._calls).self -= total
      return call
    },

    _time: function (func, cx, args) {
      var time = Date.now()
      var res = func.apply(cx || this, args)
      return [Date.now() - time, res]
    },

    dump: function (options) {
      options = _.extend({
        minTotal: 0.005,    // %; 0 - show all
        minSelf: 0.001,   // same
      }, options)

      // Avoid negative numbers in self in _fire's fire() that haven't returned.
      for (var i = this._calls.length - 1; i >= 0; i--) {
        var call = this._calls[i]
        call.self += call.total = Date.now() - call.time
        i && (this._calls[i - 1].self -= call.total)
      }

      var stats = {
        totalSelf: 0,
        eventCalls: new Map,
      }

      this._statistics(stats, this._calls[0].children)

      var duration = Date.now() - this._startTime
      var unfinished = this._calls.length - 1
      var minTotal = stats.totalSelf * options.minTotal
      var minSelf =  stats.totalSelf * options.minSelf

      var res = _.format(
        'All numbers are milliseconds (1000 ms = 1 s)\n' +
        'Time from start: %d, total self: %d (%d%%), not covered: %d%s\n' +
        'Unfinished calls: %d, max-total/sum-self thresholds: %d/%d, wrapped classes/methods: %d/%d\n' +
        '\n',
        duration,
        stats.totalSelf,
        stats.totalSelf / duration * 100,
        duration - stats.totalSelf,
        stats.totalSelf / duration < 0.85 ? ' (!)' : '',
        unfinished,
        minTotal, minSelf,
        this._wrappedClasses,
        this._wrappedMethods
      )

      var calls = [[], [], []]
      var totalCount = stats.eventCalls.get('ALL CALLS').count
      var functions = new Set

      stats.eventCalls.forEach(function (callStats, name) {
        var total = avg(callStats.total)
        var self = avg(callStats.self)

        if (total.max >= minTotal || self.sum >= minSelf ||
            callStats.unfinished != null || callStats.special) {
          callStats.call.event && functions.add(callStats.call.handler)

          var format = '%s%50s  %5d calls (%2d%%), %5d/%5d/%5d total, %4d/%4d/%5d/%5d (%2d%%) self'

          if (callStats.special) {
            format = format.replace(/(%)(\d+)(d)/g, function ($, b, n, e) {
              return b + Math.round(+n * 1.3) + e
            })
          }

          var text = _.format(
            format,
            _.padEnd(callStats.unfinished == null || callStats.special ? '' : _.padStart('>', callStats.unfinished + 1, '-'), unfinished),
            name,
            callStats.count,
            callStats.count / totalCount * 100,
            total.min, total.med, total.max,
            self.min,  self.med,  self.max,  self.sum,
            self.sum / stats.totalSelf * 100
          )

          calls[callStats.special ? 0 : 1 + _.includes(name, ' ')].push([text, self.sum, name])
        }
      })

      _.each(calls, function (lines) {
        lines.sort(function (a, b) {
          return b[1] - a[1] || Common.compare(a[2], b[2])
        })
        res += _.pluck(lines, 0).join('\n') + '\n\n'
      })

      this._functions.forEach(function (info, func) {
        if (functions.has(info.id)) {
          res += _.format('Function %s %s\n%.s\n\n',
            info.id.toString(36),
            func.name,
            info.trace || func.toString().split('\n').slice(1, -1).join('\n').replace(/\n(\s*\n)+/g, '\n') || func)
        }
      })

      return res
    },

    _statistics: function (stats, calls) {
      var inc = function (call, key, special) {
        var cur = stats.eventCalls.get(key)

        if (!cur) {
          stats.eventCalls.set(key, cur = {count: 0, total: [], self: [],
                                           special: special, call: call})
        }

        if (cur.total.length > 100) {
          cur.total = [avg(cur.total).med]
          cur.self  = [avg(cur.self).med]
        }

        cur.count++
        cur.total.push(call.total)
        cur.self.push(call.self)

        call.finished || (cur.unfinished = this._calls.indexOf(call) - 1)
      }.bind(this)

      calls.forEach(function (call) {
        stats.totalSelf += call.self

        inc(call, 'ALL CALLS', 'A')
        inc(call, call.event ? 'ALL EVENTS' : 'ALL METHODS', call.event ? 'E' : 'M')

        var name = call.event ? call.event + '/' + call.handler.toString(36)
          : call.method + '()'
        inc(call, name)
        inc(call, _.format('%29.s%1s %-19.s', (call.class || call.cx).replace(/^HeroWO\./, '.'), call.class ? '' : '?', name))

        this._statistics(stats, call.children)
      }, this)

      return stats
    },
  })

  function avg(a) {
    a.sort(function (a, b) { return a - b })
    var sum = _.sum(a)
    var mid = a.length >>> 1

    return {
      min: a[0],
      max: a[a.length - 1],
      avg: sum / a.length,
      med: a.length & 1 && mid ? (a[mid] + a[mid + 1]) / 2 : a[mid],
      sum: sum,
    }
  }

  return Debug
})