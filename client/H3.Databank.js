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
        case 'audio':
          _.extend(current, values)
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
            // This is assuming non-layered store, i.e. where there's only 0 or
            // 1 objects per layer. New object (obj) may be either object or
            // array. If x is negative then the object is appended with X (ID) =
            // original store's max X + -x; negative x-s should start at -1 and
            // not have gaps.
            var self = this
            var append = []
            _.each(values, function (ys, z) {
              _.each(ys, function (xs, y) {
                _.each(xs, function (obj, x) {
                  obj = obj && self._packObject(current, obj)
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
            if (append.length) {
              switch (prop) {
                case 'artifactSlots':
                  // XXX=R:arbp:
                  throw new Error('Extending ' + prop + ' is currently disallowed.')
              }
            }
            _.each(append, function (obj) { current.append(obj) })
          } else {
            throw new Error('Unknown Databank property to append to: ' + prop)
          }
      }
    },

    // Returns obj in embedded format of store (readSub allowed), or obj itself
    // if it's already in this form (array). Unlike ObjectStorage.pack(),
    // recursively packs sub-stores.
    _packObject: function (store, obj) {
      if (_.isArray(obj)) {
        return obj
      } else {
        return store.pack(obj).map(function (value, prop) {
          if (value && store.isSubProperty(prop)) {
            var mz = 0
            var my = 0
            var mx = 0
            _.each(value, function (ys, z) {
              _.each(ys, function (xs, y) {
                mz = Math.max(mz, +z + 1)
                my = Math.max(my, +y + 1)
                mx = _.max([mx - 1].concat(_.keys(xs))) + 1
              })
            })
            var sub = store.readSub(prop)
            var len = sub.schemaLength()
            var res = Array(len * mz * my * mx)
            for (var z = 0; z < mz; z++) {
              for (var y = 0; y < my; y++) {
                for (var x = 0; x < mx; x++) {
                  var obj = ((value[z] || {})[y] || {})[x]
                  // null is useful to only define the strides (extendTo()).
                  if (obj) {
                    var n = (z * my * mx + y * mx + x) * len
                    res.splice.apply(res, [n, len].concat(this._packObject(sub, obj)))
                  }
                }
              }
            }
            value = res
          }
          return value
        }, this)
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
  }, {
    // Replaces constants (unquoted pa.th.key) and $"interpolates {pa.th.key}".
    // Values are inserted raw: {x: y} is incorrect (JSON keys must be quoted),
    // {$"{x}": y} (integer y) and {$"{x}": $"{y}"} (string y) are correct.
    // Implements and removes single-line comments: //.*$
    // Returns the parsed value. Throws if str is malformed.
    parseJSON: function (str, resolver, cx) {
      // path is { \w[\w.]* and not \d+|true|false|null } or [^}]* (if within $"{...}").
      // lastString is verbatim from str sans wrapping quotes: x\ny\"\\z.
      // If inside $"...", lastString is the part before path's '{'.
      // If outside and no string started yet, lastString is null.
      // Result is cast to string. If undefined/null, no replacement is done.
      resolver = resolver || function (path, lastString) {
        throw new Error('No resolver given.')
      }

      var inString = 0  // 0 = outside, 1 = regular string, 2 = $"interpolating"
      var string        // [start, end] within json
      var json = ''

      for (var i = 0; i < str.length; i++) {
        if (str[i] == '$' && !inString && str[i + 1] == '"') {
          continue  // skip copying '$'
        } else if (str[i] == '"') {
          if (inString) {
            string.push(json.length)
            inString = 0
          } else {
            string = [json.length + 1]
            inString = 1 + (str[i - 1] == '$')
          }
        } else if (str[i] == '\\' && inString && str[i + 1] == '"') {
          json += '\\'
          i++
        } else if (str[i] == '/' && !inString && str[i + 1] == '/') {
          do {
            i++
          } while (str[i + 1] != '\r' && str[i + 1] != '\n' && i + 1 < str.length)
          continue
        }

        var name = null
        var replace = true

        switch (inString) {
          case 0:
            if ((str[i] >= 'a' && str[i] <= 'z') ||
                (str[i] >= 'A' && str[i] <= 'Z') ||
                (str[i] >= '0' && str[i] <= '9') ||
                str[i] == '_') {
              name = str.substr(i).match(/^\w[\w.]*/)
              switch (name && name[0]) {
                default:
                  if (name[0].match(/\D/)) { break }
                case 'null':
                case 'true':
                case 'false':
                  replace = false
                case null:
              }
            }
            break

          case 2:
            if (str[i] == '{') {
              name = str.substr(i).match(/\{(.*?)\}/)
            }
        }

        if (name) {
          var value = !replace ? null :
            resolver.call(cx, _.last(name), string && ''.substring.apply(json, string))
          json += value == null ? name[0] : value
          i += name[0].length - 1
          continue
        }

        json += str[i]
      }

      return JSON.parse(json)
    },
  })
})