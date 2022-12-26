define(['Common'], function (Common) {
  "use strict"
  var _ = Common._

  var Tracker = {}

  // Produces server events to reflect local `#Screen state (adventure map position, etc.) to allow another client watch it in real-time or to replay the game later.
  Tracker.Master = Common.Sqimitive.extend('HeroWO.Screen.Tracker.Master', {
    mixIns: [Common.ScreenModule],
    _timedScreenChange: null,
    _id: null,

    //> screenSource `- arbitrary scalar identifier, for a client with multiple Screen-s to determine where the action occurred
    _initToOpt: {
      screenSource: '._id',
    },

    events: {
      attach: function () {
        var func = this._timedScreenChange =
          _.throttle(Common.ef('_screenChange', this), 200, {leading: true, trailing: true})

        this.autoOff(this.sc, {
          'change_z, change_current, change_mapPosition': func,
        })
      },

      '-unnest': function () {
        this._timedScreenChange && this._timedScreenChange.cancel()
      },
    },

    _screenChange: function () {
      this.sc.rpc.do('action', {
        screen: this._id,
        object: 'screen',
        state: {
          z: this.sc.get('z'),
          current: this.sc.get('current') && this.sc.get('current').get('id'),
          mapPosition: this.sc.get('mapPosition'),
        },
      })
    },
  })

  // Changes local Screen state in response to server events produced by Tracker.Mastr.
  //
  // XXX=I Add more features, such as: add switching buttons on the right panel of ADVMAP (a button per observable player - neutral observer = all players, others = players in their team). All buttons are in one group and only 0 or 1 in the group must be pressed; if all are off then automatic following of the player's screen is disabled, if 1 then restore() is called.
  Tracker.Slave = Common.Sqimitive.extend('HeroWO.Screen.Tracker.Slave', {
    mixIns: [Common.ScreenModule],
    _last: {},

    _opt: {
      // Filters. Determine whose actions are mirrored. null = don't test.
      // Can be changed on run-time; this is usually followed by restore().
      //
      // screen is a viewport created on a client. All client's Screen-s share
      // exactly the same view (map position, active game screen, etc.) and have
      // exactly the same capabilities and permissions (move hero, hire, etc.). The server
      // sees all screen-s as the same client.
      //
      // client is a particular WebSocket connection, part of seat (defines
      // capabilities of all its clients, e.g.e observer mode). A seat is
      // attached to an in-game map's player (can browse and control it).
      // Finally, players and the map are part of the same Context.
      screen: null,
      player: null,   // number
      myPlayer: null, // bool
      observer: null,   // true/false to mirror only/none of observer actions
      // Only for slave.
      seat: null,
      mySeat: null,   // bool
      client: null,

      // What properties to mirror.
      z: true,
      current: true,
      mapPosition: true,  // only enable together with z
    },

    events: {
      attach: function () {
        this.autoOff(this.sc.rpc, {
          serverEvent: function (event, data) {
            if (event == 'action' && data.object == 'screen') {
              this._last[data.client + '.' + data.screen] = data
              this.restore([data])
            }
          },
        })
      },
    },

    // Snaps back to last view received from the server. Useful after changing _opt.
    restore: function (last) {
      var filters = this.get()
      function check(data, opt) {
        return filters[opt] == null || data[opt] == filters[opt]
      }
      _.some(last || this._last, function (data) {
        if (check(data, 'screen') &&
            check(data, 'player') && check(data, 'myPlayer') &&
            check(data, 'observer') &&
            check(data, 'seat') && check(data, 'mySeat') &&
            check(data, 'client')) {
          this._changeScreen(data.state)
          return true
        }
      }, this)
    },

    _changeScreen: function (state) {
      this.sc.batch(null, function () {
        this.get('z') && this.sc.set('z', state.z)
        this.get('current') && this.sc.set('current', state.current && this.map.representationOf(state.current))
        this.get('mapPosition') && this.sc.set('mapPosition', state.mapPosition)
      }, this)
    },
  })

  return Tracker
})