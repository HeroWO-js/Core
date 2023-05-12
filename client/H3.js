define(
  [
    'Common', 'PathFind.AStar', 'H3.Rules', 'H3.PathCost',
  ],
  function (
    Common, PathFind, Rules, PathCost
  ) {
    "use strict"

    // This module is referenced in modules of maps converted from .h3m or meant for HoMM 3 gameplay.
    return Common.Sqimitive.extend('HeroWO.H3', {
      mixIns: [Common.ContextModule],

      events: {
        owned: function () {
          // Mandatory Module that the H3 subsystem cannot work without.
          this.cx.autoAddModule('-', Rules)

          // Default feature providers. May be overridden by environment.
          var pathfind = this.cx.addModule('-', PathFind.Module)
          // XXX=R: mk: refactor other methods to uniform "makeXXX"
          this.cx.fuse('+makeHexPathFinder', function (res, opt) { return res || new PathFind.Hex(opt) })
          this.cx.fuse('+makePathCost', function (res, opt) { return res || this.addModule(PathCost, opt) })
          this.cx.fuse('+makePathCostHex', function (res, opt) { return res || this.addModule(PathCost.Hex, opt) })
        },
      },
    })
  }
)