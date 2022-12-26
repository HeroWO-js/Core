// The entry point of require.js when running in a WebWorker.

define(['sqimitive/main', 'Common', 'Context', 'RPC'], function (Sqimitive, Common, Context, RPC) {
  "use strict"
  var _ = Common._

  _.oldLog = _.log
  delete _.log
  Error.stackTraceLimit = 100

  var lock = 0
  var debug
  var cx
  var rpc

  addEventListener('message', function (e) {
    //_.log && _.log('--> %j', e.data)

    switch (e.data.event) {
      case 'newContext':
      case 'deleteContext':
      case 'close':
        _.log && _.log('Worker <[%s]= %d : %.j', e.data.event, lock, e.data)
    }

    switch (e.data.event) {
      default:
        throw new Error('Invalid Worker message event: ' + e.data.event)

      case 'rpc':
        var locked = lock
        cx.rpcFor(e.data.player)
          .do(e.data.method, e.data.params)
            .whenComplete(function () {
              if (locked != lock) {
                return console && console.warn('Worker RPC completed with different lock')
              }
              postMessage({
                event: 'jsonrpc',
                id: e.data.id,
                error: this.get('status') ? null : (this.errorObject().message || ''),
                result: this.result,
              })
            })
        break

      case 'newContext':
        cx && cx.remove()
        lock++

        debug = e.data.debug
        _.debug = debug > 0
        Sqimitive.Core.trace = debug >= 2

        _.seed(e.data.seed)
        cx = new Context.Fetching(e.data.context)

        cx.modules.on('nestExNew', function (res) {
          switch (res.key) {
            case 'HeroWO.H3.AI.Trivial':
            case 'HeroWO.H3.AI.Trivial.Neutral':
              res.child.set('trace', debug >= 2)
              break
          }
        }, self)

        var localRPCs = []

        cx.on('+makeRpcFor', function (res, player) {
          if (!res) {
            return localRPCs[player] ||
              (localRPCs[player] = new RPC({context: cx, player: cx.players.nested(player)}))
          }
        }, self)

        cx.on('-remove', function (now) {
          _.log && _.log('Worker Context remove')
          lock++
          cx.autoOff(self)
          cx.modules.autoOff(self)
          _.invoke(localRPCs, 'remove')
          rpc.remove()
          rpc = cx = null
        }, self)

        cx.once('change_configuring', function (now) {
          now && now.nest('rpc', {})
        }, self)

        cx.on('dataReady', function () {
          _.log && _.log('Worker Context dataReady')
          cx.modules.nested('HeroWO.H3.Rules').initializeSinglePlayer()

          var locked = lock
          rpc = new RPC({context: cx})

          rpc.on('serverEvent', function (event, data) {
            if (locked != lock) {
              return console && console.warn('Worker serverEvent with different lock')
            }
            postMessage({event: 'serverEvent', serverEvent: event, data: data})
          })

          rpc.do('start')
            .whenSuccess(function () {
              if (locked != lock) {
                return console && console.warn('Worker Client started with different lock')
              }
              var transfer = []
              var start = RPC.textEncode(this.result, transfer)
              postMessage({event: 'start', game: start}, transfer)
            })
        }, self)

        var game = RPC.textDecode(e.data.game)
        game.master = true
        game.backend = 'worker'
        cx.game(game)
        break

      case 'deleteContext':
        cx && cx.remove()
        break

      case 'close':
        close()
        break
    }
  })

  postMessage({event: 'init'})
})