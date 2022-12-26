define(['Common', 'ObjectStore'], function (Common, ObjectStore) {
  "use strict"
  var _ = Common._

  return Common.Sqimitive.extend('HeroWO.H3.Databank', {
    // {item}.json = this.{item} : ObjectStore
    _stores: [
      'creatureAnimations',
      'classes',
      'combatObstacles',
      'combatBackgrounds',
    ],

    // {item}.json = this.{item} : ObjectStore
    // {item}ID.json = this.{item}ID : {str idName: int id}
    _storesWithIdIndex: [
      'players',      // write_misc
      'animations',   // write_misc
      'artifacts',
      'artifactSlots',
      'heroes',
      'heroClasses',
      'skills',
      'spells',
      'spellSchools',
      'towns',
      'creatures',
      'banks',
      'buildings',
    ],

    // {item}ID.json = this.{item}ID : {str AClass idName: array of int id}
    //    + objectsID : {str idName_subclass: array of int id}
    //    + others    : {str idName_subclass: int id}
    _idIndexes: [
      // write_classes
      'objects', 'terrains', 'rivers', 'roads',
    ],

    // {item}.json = this.{item}
    _other: [
      'audio',
      // write_misc
      'constants',      // {group: {str: int}}
      'randomSigns',    // ['str', 'str2', ...]
      'randomRumors',   // same
      // write_buildings
      'producers',      // {town_id: {building_id: [creature_id, c2_id, ...]}
      // write_effects
      // This file is a raw (non-packed) array of Effects. It's not used on the JS
      // side, only by PHP map convertors.
      //'staticEffects',
    ],

    serialize: function () {
      var res = _.pick(
        this,
        this._storesWithIdIndex
          .concat(this._idIndexes)
          .map(function (s) { return s + 'ID' })
          .concat(this._other),
        _.forceObject
      )

      this._stores
        .concat(this._storesWithIdIndex)
        .forEach(function (name) {
          res[name] = this[name].serialize()
        }, this)

      return res
    },

    // Alters the databank data (the fixup.json fetched by H3.Rules).
    //
    // Call this only after all load() Async-s have succeeded.
    appendTo: function (prop, values) {
      var current = this[prop]
      switch (prop) {
        case 'constants':
          var extend = function (to, values) {
            _.each(values, function (k, v) {
              if (typeof v == 'object') {
                extend(to[k] || (to[k] = {}), v)
              } else {
                to[k] = v
              }
            })
          }
          extend(current, values)
          break
        case 'randomSigns':
        case 'randomRumors':
          // Old strings are kept. To override them use Effects.
          current.push.apply(current, values)
          break
        case 'producers':
          // This entirely replaces old building list to allow removing $produce
          // entries from buildings.json which would be impossible if we were to
          // concat here. Extension value must include old buildings if it needs
          // to keep them.
          _.each(values, function (buildings, town) {
            current[town] = _.extend(current[town] || current[town], buildings)
          })
          break
        default:
          if (prop.match(/ID$/) && this._idIndexes.concat(this._storesWithIdIndex).indexOf(prop.replace(/ID$/, '')) != -1) {
            _.extend(current, values)
          } else if (this._stores.concat(this._storesWithIdIndex).indexOf(prop) != -1) {
            // {z: {y: {x: null | obj}}}
            // This is assuming non-layered store, i.e. where there's only 0 or 1
            // objects per layer. New object (obj) may be either object or array.
            // If x is negative then the object is
            // appended with X (ID) = original store's max X + -x; negative x-s should start at -1 and not have gaps.
            var append = []
            _.each(values, function (ys, z) {
              _.each(ys, function (xs, y) {
                _.each(xs, function (obj, x) {
                  if (x < 0) {
                    // JS objects are unordered so force order on append().
                    append[~x] = obj
                  } else {
                    current.extendTo(x)
                    current.removeAtCoords(x, y, z, 0)
                    obj && current.addAtCoords(x, y, z, obj)
                  }
                })
              })
            })
            _.each(append, function (obj) { current.append(obj) })
          } else {
            throw new Error('Unknown Databank property to append to: ' + prop)
          }
      }
    },

    // Starts loading databank data.
    //> props missing`, array `- optional list that is filled with names of
    //  properties on `'this populated by `#load()'s tasks
    //= Async with nested `#fetch() tasks
    load: function (props) {
      props = props || []
      var async = new Common.Async

      _.log && _.log('Fetching databank')

      this._stores
        .concat(this._storesWithIdIndex)
        .forEach(function (name) {
          props.push(name)
          async.nest(this.fetch(name + '.json'))
            .whenSuccess(function (async) {
              this[name] = new ObjectStore(async.response)
            }, this)
        }, this)

      this._idIndexes
        .concat(this._storesWithIdIndex)
        .map(function (s) { return s + 'ID' })
        .concat(this._other)
        .forEach(function (name) {
          props.push(name)
          async.nest(this.fetch(name + '.json'))
            .whenSuccess(function (async) {
              this[name] = async.response
            }, this)
        }, this)

      return async
    },

    // function (file)
    // Returns an `#Async whose `'response is set to the retrieved content of `'file.
    fetch: Common.stub,
  })
})