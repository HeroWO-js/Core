define(['Common', 'ObjectStore', 'Map'], function (Common, ObjectStore, Map) {
  "use strict"
  var _ = Common._

  // List of `#Map-s in compact `#ObjectStore format.
  //
  // Currently is not used.
  return Common.Sqimitive.extend('HeroWO.Maps', {
    // List of basic `#Map properties.
    //= ObjectStore 1D: index => map
    maps: null,
    // List of each map's victory conditions.
    //= ObjectStore 1D: map index => victory
    victory: null,
    // List of each map's loss conditions.
    //= ObjectStore 1D: map index => loss
    loss: null,
    // List of each map's player lists.
    //= ObjectStore 1D: map index => player
    players: null,

    _toMapAtter: null,
    _toVictoryAtter: null,
    _toLossAtter: null,
    _toPlayerAtter: null,

    events: {
      init: function (combined) {
        if (combined.format != Map.FORMAT_VERSION) {
          throw new Error(_.format('Wrong map format %.j (%d expected).',
            combined.format, Map.FORMAT_VERSION))
        }

        this.maps = new ObjectStore(combined)
        this.victory = new ObjectStore(combined.victory)
        this.loss = new ObjectStore(combined.loss)
        this.players = new ObjectStore(combined.players)

        this._toMapAtter = this.maps.atter()
        this._toVictoryAtter = this.victory.atter()
        this._toLossAtter = this.loss.atter()
        this._toPlayerAtter = this.players.atter()
      },
    },

    // Returns the number of maps contained in this list.
    count: function () {
      return this.maps.size().x
    },

    // Obtains a "real" Map object from this store.
    //= `#Map
    // Note that a non-`'Indexed map is returned because the data store doesn't
    // contain all the indexes (they need to be fetched or generated separately).
    // Similarly, returned `'Map-s have `'constants unset.
    mapAt: function (index) {
      function allAtter(store, atter) {
        var res = []
        for (var item, l = 0; item = atter(index, 0, 0, l++); ) { res.push(item) }
        return res
      }
      var map = new Map({format: Map.FORMAT_VERSION})
      map.assignResp(this._toMapAtter(index, 0, 0, 0), {schema: 'storeSchema'})
      map.victory.assignChildren(allAtter(this.victory, this._toVictoryAtter),
                                 {schema: 'storeSchema'})
      map.loss.assignChildren(allAtter(this.loss, this._toLossAtter),
                              {schema: 'storeSchema'})
      map.players.assignChildren(allAtter(this.players, this._toPlayerAtter),
                                 {schema: 'storeSchema'})
      return map
    },
  })
})