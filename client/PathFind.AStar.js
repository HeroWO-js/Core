define(['Common', 'ObjectStore'], function (Common, ObjectStore) {
  "use strict"
  var _ = Common._

  // Finds the optimal path from one spot to another using A* algorithm. Relies on external cost function which incapsulates the underlying square-grid map structure and movement rules.
  //
  // XXX=I This implementation supports pathfinding within the same Z only.
  var PathFind = Common.Sqimitive.extend('HeroWO.PathFind.AStar', {
    _wh: 0,
    _log: null,   // debug: set to [] or call print() to enable logging

    _opt: {
      mapWidth: 0,    // do not set
      mapHeight: 0,   // ditto
    },

    events: {
      attach: function () {
        this._wh = this.get('mapWidth') * this.get('mapHeight')
      },
    },

    // Finds the optimal path from spot `'from to spot `'to with segments weighted by `'costFunc.
    //
    //> from array `[[x, y, z, n]`]
    //> to array `- must correspond to the same Z as `'from and must be different from `'from
    //> costFunc `- receives two arrays: desired target spot and source spot, returns int or Infinity/negative (= impassable)
    //> maxCost int`, omitted `'Infinity `- stops evaluating routes that exceed this cost (0 only
    //  makes routes that don't require any cost, i.e. cost zero)
    //
    //= array, can be mutated`, null
    //
    // Returned array has first member = `'from, last = `'to (these may or may not
    // be `[===`] to `'from/`'to). Each member is `[[x, y, z, n, , , cost]`]; other
    // indexes may be present and should be ignored. `'from has `'cost of 0.
    //
    // Reference: `@https://en.wikipedia.org/wiki/A*_search_algorithm`@.
    findPath: function (from, to, costFunc, maxCost) {
      maxCost == null && (maxCost = Infinity)

      if (from[3] == to[3] || from[2] != to[2] || maxCost < 0) {
        // This pathfinder doesn't support requested configuration.
        return
      }

      // Since this supports pathfinding within the same Z only, cap from and to
      // to 2D rather than 3D. This allows shorter arrays and simplified X/Y
      // deduction in _heuristic().
      var zn = to[2] * this._wh
      to   = to.concat(to[3] - zn)  // [x, y, z, n, n z=0, heur, cost]
                                    //  0  1  2  3  4      5     6
      from = from.concat(from[3] - zn, 0, 0)

      var queue = [from]
      var came = Array(this._wh)
      var gScore = Array(this._wh)
      gScore[from[4]] = 0

      var log = this._log
      log && log.splice(0)

      while (true) {
        var current = queue.pop()

        log && log.push(['Top = %s:%s',
          current ? current[0] : 'NO', current ? current[1] : 'NE'])

        if (current == undefined) {
          log && log.push(['End: found no path'])
          return
        }

        if (current[4] == to[4]) {
          var res = []

          do {
            res.push(current)
          } while (undefined !== (current = came[current[4]]))

          log && log.push(['End: %s', res.map(function (item) {
            return item[0] + ':' + item[1]
          }).join(' ← ')])

          // One reverse() once should be more efficient than many unshift()-s.
          return res.reverse()
        }

        this._neighboursOf(current).forEach(function (neigh) {
          // XXX+C Is it okay for the algorithm that costFunc's result varies per
          // neigh depending on current (as in H3.PathCost)?
          var cost = costFunc(neigh, current)

          if (cost >= 0 && cost != Infinity) {
            var nn = neigh[4]
            var neighScore = gScore[nn]
            var tentative = gScore[current[4]] + cost

            if ((neighScore == null || tentative < neighScore) && tentative <= maxCost) {
              came[nn] = current
              gScore[nn] = tentative

              if (neighScore == null) {   // not in queue yet
                // Break ties (choose from equally optimal paths) by preferring
                // straight lines. This also makes sorting deterministic.
                // Below, one could choose any path from F to T from the three:
                //    |.|F|.|   |.|F|.|   |.|F|.|
                //    |.|.|>|   |.|v|.|   |<|.|.|
                //    |.|T|.|   |.|T|.|   |.|T|.|
                // << 3 allows up to 3 bits (0-7 inclusive), as used in _neighboursOf().
                //
                // XXX+B This still does not work in all cases.
                var fScore = neigh[5] = -((tentative + this._heuristic(neigh, to)) << 3 | neigh[5])
                neigh[6] = cost
                queue.splice(this._indexFor(queue, fScore, neigh[7]), 0, neigh)
                log && log.push(['%02d:%02d queued, cost %d, heur %d',
                  neigh[0], neigh[1], tentative, -fScore - tentative])
              } else if (log) {
                log.push(['%02d:%02d skip: already queued', neigh[0], neigh[1]])
              }
            } else if (log) {
              log.push(['%02d:%02d skip: gScore my %d < other %d',
                neigh[0], neigh[1], tentative, neighScore])
            }
          } else if (log) {
            log.push(['%02d:%02d skip: impassable', neigh[0], neigh[1]])
          }
        }, this)

        log && log.push(['Queue: %s', _.map(queue, function (item) {
          return item[0] + ':' + item[1] + '+' + (-item[5] >>> 3) + '+' + -item[5]
        }).join(' ')])
      }
    },

    _heuristic: function (from, to) {
      // XXX+C likely not good enough
      return Math.max(Math.abs(from[0] - to[0]), Math.abs(from[1] - to[1]))
    },

    _neighboursOf: function (spot) {
      var res = []
      var sx = this._opt.mapWidth
      var sy = this._opt.mapHeight

      //     |    |    |    |
      // ----+----+----+----+----     s = strideX
      //     |-s-1|-s  |-s+1|         spot = n
      // ----+----+----+----+----
      //     |  -1|spot|  +1|
      // ----+----+----+----+----
      //     | s-1| s  | s+1|
      // ----+----+----+----+----
      //     |    |    |    |

      function add(tieWeight, dx, limx, dy, limy, dn) {
        var sp = [spot[0] + dx, spot[1] + dy, spot[2], spot[3] + dn, spot[4] + dn,
                  tieWeight]
        if (sp[0] != limx && sp[1] != limy) {
          res.push(sp)
        }
      }

      // Note: if changing tieWeight of the below, update PathFind.Hex.
      add(0, -1,    -1,  0, null, -1)      //   -1
      add(1, +1,    sx,  0, null, +1)      //   +1
      add(2,  0,  null, -1,   -1, -sx)     // -s
      add(3,  0,  null, +1,   sy,  sx)     //  s
      add(4, -1,    -1, -1,   -1, -sx-1)   // -s-1
      add(5, +1,    sx, -1,   -1, -sx+1)   // -s+1
      add(6, -1,    -1, +1, sy,    sx-1)   //  s-1
      add(7, +1,    sx, +1, sy,    sx+1)   //  s+1

      return res
    },

    _indexFor: Common.indexFor('fScore', 'array[mid][5] - fScore'),

    // First call enables logging messages to an internal buffer. Second call flushes that buffer's content to console and clears it.
    print: function () {
      if (this._log) {
        this._log.splice(0).forEach(function (entry) {
          console && console.log(_.format.apply(_, entry))
        })
      } else {
        this._log = []
      }
      return this
    },
  })

  // Exposes this pathfinding implementation to `#Context.
  PathFind.Module = PathFind.extend('HeroWO.PathFind.AStar.Module', {
    mixIns: [Common.ContextModule],

    events: {
      attach: function () {
        this.assignResp({
          mapWidth:  this.map.get('width'),
          mapHeight: this.map.get('height'),
        })

        this.cx.findPath = this.findPath.bind(this)
      },
    },
  })

  // Modification of this pathfinding implementation for use with hexagonal map (in combat).
  //
  // This class is using "classic"/native JavaScript inheritance rather than
  // Sqimitive's for performance reasons. Methods are defined directly as
  // object properties and call their `'super via `#PathFind.`'prototype.
  PathFind.Hex = PathFind.extend('HeroWO.PathFind.AStar.Hex', {
    // XXX+C
    //
    //   /\ /\ /\ /\ /\                hex     square
    //  |  |3.|4.|  |  |  < odd      1 L     = L
    // /\ /\./\./\ /\ /              2 R     = R
    //|  |1.|ME|2.|  |    < even     3 TL    = TL   (diagonal move)
    // \/ \/.\/.\/ \/ \              4 TR    = T
    //  |  |5.|6.|  |  |  < odd      5 BL    = BL   (diagonal move)
    //   \/ \/ \/ \/ \/              6 BR    = B
    //
    //  / /././ / /     | |3|4|X| |
    //  \ \.\F\.\ \   | |1|F|2| |     < even
    //  / /././ / /     | |5|6|X| |   X - impossible direct move from F
    //  \T\ \ \ \ \   |T| | | | |     F -> T = BL, B
    //
    // /\ /\ /\ /\ /\ /                hex     square
    //|  |  |3.|4.|  |    < even     1 L     = L    (same as above)
    // \/ \/ \/ \/ \/ \              2 R     = R    (same as above)
    //  |  |1.|ME|2.|  |  < odd      3 TL    = T
    // /\ /\ /\ /\ /\ /              4 TR    = TR
    //|  |  |5.|6.|  |    < even     5 BL    = B
    // \/ \/ \/ \/ \/                6 BR    = BR
    //
    //  \ \ \.\.\ \   | |X|3|4| |
    //  / /./F/./ /     | |1|F|2| |   < odd
    //  \ \ \.\.\ \   | |X|5|6| |
    //
    // Mapped to square grid:    | |3|4|X| |     | |X|3|4| |
    //                           | |1|F|2| |     | |1|F|2| |
    //                           | |5|6|X| |     | |X|5|6| |
    //                            F on even       F on odd
    //
    // Movement in hex grid is the same as in square grid except movement from
    // ODD rows to two corners on the left is impossible and costs 2 points
    // (first L, then T or B) instead of 1. Same with movement from EVEN rows to
    // two corners on the right.
    //
    // That is, can move from rows 1, 3, 5, ... (1-based) to the right and from
    // rows 2, 4, 6, ... to the left.
    //
    // (This is assuming first row is shifted to the right, second - to the left.)
    //_heuristic: function (from, to) {
    //},

    _neighboursOf: function (spot) {
      var odd = spot[1] & 1
      return PathFind.prototype._neighboursOf.call(this, spot)
        .filter(function (item) { return item[5] != odd + 4 && item[5] != odd + 6 })
    },
  })

  return PathFind
})