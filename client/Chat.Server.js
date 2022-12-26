define(['RPC.Common'], function (Common) {
  "use strict"
  var _ = Common._

  var Chat = {}

  // HOTRAITS.TXT
  var nickNames = 'Orrin Valeska Edric Sylvia Sorsha Christian Tyris Rion Adela Cuthbert Adelaide Ingham Sanya Loynis Caitlin Mephala Ufretin Jenova Ryland Thorgrim Ivor Clancy Kyrre Coronius Uland Elleshar Gem Malcom Melodia Alagar Aeris Piquedram Thane Josephine Neela Torosar Fafner Rissa Iona Astral Halon Serena Daremyth Theodorus Solmyr Cyra Aine Fiona Rashka Marius Ignatius Octavia Calh Pyre Nymus Ayden Xyron Axsis Olema Calid Ash Zydar Xarfax Straker Vokial Moandor Charna Tamika Isra Clavius Galthran Septienna Aislinn Sandro Nimbus Thant Xsi Vidomina Nagash Lorelei Arlach Dace Ajit Damacon Gunnar Synca Shakti Alamar Jaegar Malekith Jeddite Geon Deemer Sephinroth Darkstorn Yog Gurnisson Jabarkas Shiva Gretchin Krellion Tyraxor Gird Vey Dessa Terek Zubin Gundula Oris Saurug Bron Drakon Wystan Tazar Alkin Korbac Gerwulf Broghild Mirlanda Rosic Voy Verdish Merist Styg Andra Tiva Pasis Thunar Ignissa Lacus Monere Erdamon Fiur Kalt Luna Brissa Ciele Labetha Inteus Aenain Gelare Grindan Adrienne Catherine Dracon Gelu Kilgor Mutare Roland Boragus Xeron'.split(' ')

  Chat.nickName = function (actionSource) {
    return nickNames[_.crc32(actionSource) % nickNames.length]
  }

  // do=action: {screen, object: chat, channel, type: text|image|file, data}
  Chat.attachTo = function (server, homeURL, serverURL) {
    server.on('nestExNew', function (res) {
      var client = res.child

      if (_.has(client, 'do_lastChat')) {
        // Skip already hooked Client. This may happen after do=resume since it
        // nests Client from lingering back to server.
        return
      }

      client._observerMethods.push('chat', 'lastChat')

      client.do_lastChat = function () {
        if (!this.get('seat')) {
          throw new Common.ClientError('Player not selected')
        }
        var actions = this.get('seat').context().get('chat') || []
        _.each(actions, this._actionEvent, this)
        return new Common.Response({status: true})
      }

      client.on({
        '=do_action': function (sup, args) {
          if (args.object == 'chat') {
            args = _.pick(args, 'screen', 'object', 'channel', 'type', 'data', _.forceObject)
            args.date = Date.now()
          }
          return sup(this, [args])
        },
        _sendAction: function (args) {
          if (args.object == 'chat') {
            var cx = this.get('seat').context()

            if (JSON.stringify(args).length < 1.4 * 1024 * 1024) {
              cx.getSet('chat', function (cur) {
                cur = (cur || []).concat(_.extend({}, args, {history: true}))
                var counts = {}
                for (var i = cur.length; i--; ) {
                  var count = _.has(counts, cur[i].channel)
                    ? ++counts[cur[i].channel] : counts[cur[i].channel] = 1
                  count > 20 && cur.splice(i, 1)
                }
                return cur
              })
            }

            if (args.type == 'text') {
              var rules = cx.context.modules.nested('HeroWO.H3.Rules')
              switch (args.data.split(' ')[0]) {
                case '/p':
                  cx.context.players.each(function (pl) {
                    var clients = []
                    cx.players.people().forEach(function (client) {
                      if (client.get('player') == pl) {
                        clients.push(_.format('%s%s - %s', Chat.nickName(client.get('actionSource')), client.get('observer') ? ' (observer)' : '', client.isLingering() ? 'temporary offline' : 'online'))
                      }
                    })
                    if (!clients.length && pl.isHuman()) {
                      clients.push('EVERYONE HAS LEFT')
                    }
                    if (clients.length) {
                      var msg = rules.databank.players.atCoords(pl.get('player'), 0, 0, 'name', 0) + ': ' + clients.sort().join(', ')
                      cx.players.people().forEach(function (client) {
                        client._actionEvent({
                          object: 'chat',
                          channel: args.channel,
                          type: 'text',
                          data: msg,
                          // Client message sorting depends on date so using user's message time plus one to put our message below his, so he knows to which the server is replying.
                          //
                          // Note: using Date.now() alone (not + 1) would be wrong since it will usually be the same as args.date (set in do_action calling _sendAction), messing up sort order.
                          date: args.date + 1,
                        })
                      })
                    }
                  }, this)
                  break
              }
              if (!cx.context.get('loading') && this.get('player').get('host') && !client.get('observer')) {
                switch (args.data.split(' ')[0]) {
                  case '/k':
                    var nick = args.data.split(' ')[1].toLowerCase()
                    cx.players.people().some(function (other) {
                      if (Chat.nickName(other.get('actionSource')).toLowerCase() == nick && other != client) {
                        return other.get('seat').remove()
                      }
                    })
                    break
                  case '/j':
                  case '/jo':
                    var color = args.data.split(' ')[1].toLowerCase()
                    cx.context.players.some(function (pl) {
                      if (pl.isHuman() && rules.databank.players.atCoords(pl.get('player'), 0, 0, 'name', 0).toLowerCase() == color) {
                        var seat = cx.createSeat(pl, this.server)
                          .set('observer', args.data[2] == 'o')
                        this._actionEvent({
                          object: 'chat',
                          channel: args.channel,
                          type: 'text',
                          data: _.format('%s: %s#%s,%s', rules.databank.players.atCoords(pl.get('player'), 0, 0, 'name', 0), homeURL, btoa(serverURL).replace(/=/g, ''), seat.get('secret')),
                          date: args.date + 1,
                        })
                        return true
                      }
                    }, this)
                    break
                }
              }
            }
          }
        },
      })
    })

    server.contexts.on('nestExNew', function (res) {
      var cx = res.child

      cx.unser.chat = true

      cx.on({
        '+serialize': function (res) {
          res.chat = this.get('chat')
        },
      })

      cx.players.on({
        '.nestExNew': function ($, res) {
          if (!res.child.isSpecial()) {
            res.child.fuse('unnest', function () {
              // Deferring to know if client is lingering or not since unnest
              // may be called from within lingering.nest() or as client.remove().
              _.defer(function () {
                cx._parent && leaver(res.child)
              })
            })
          }
        },
      })

      function leaver(client) {
        if (client.get('context') == cx.context && !cx.context.get('loading')) {
          var notify
          cx.getSet('lastChatLeaver', function (cur) {
            return cur + 60000 > Date.now() ? cur : notify = Date.now()
          })
          if (notify) {
            var rules = cx.context.modules.nested('HeroWO.H3.Rules')
            var msg = _.format('%s of %s%s %s. Use the "/p" command to see current player statuses. Host players (%s) may use "/k NICKNAME" ("/k ivor") to kick somebody and "/j PLAYER" ("/j red") to generate an invitation link ("/jo PLAYER" for an observer). Ask around for interested people in the global chat or on the forum. Alternatively, anyone can save this game and then load it to create a new multi-player configuration.', Chat.nickName(client.get('actionSource')), rules.databank.players.atCoords(client.get('player').get('player'), 0, 0, 'name', 0), client.get('observer') ? ' (observer)' : '', client.isLingering() ? 'is temporary offline' : 'has closed the browser', cx.context.players.filter(Common.p('get', 'host')).map(function (pl) { return rules.databank.players.atCoords(pl.get('player'), 0, 0, 'name', 0) }).join(', '))

            cx.players.people().forEach(function (client) {
              client._actionEvent({
                object: 'chat',
                type: 'text',
                data: msg,
                date: Date.now(),
              })
            })
          }
        }
      }
    })
  }

  return Chat
})