define(['RPC.Common', 'RPC'], function (Common, RPC) {
  "use strict"
  var _ = Common._

  // Represents client's side of a multi-player connection based on browser's native `'WebSocket transport.
  //
  // Caller must listen to close or use `#Connector.
  //[
  // ws.addEventListener('close', function (e) {
  //   e.code == Common.CODES.drop ? client.remove() : reconnect()
  // })
  //]
  //
  // Note: browser's WebSocket's onclose gives a CloseEvent object and onmessage gives a MessageEvent. WebSocket of the "ws" npm package gives (code, reason) and (data, isBinary) arguments, respectively.
  var WS = RPC.Client.extend('HeroWO.RPC.WebSocket', {
    _rpcAsyncs: null,
    _resumptionAsync: null,
    _eventID: 0,  // last seen serverEvent id
    _boundHandleClose: null,
    _boundHandleError: null,
    _boundHandleMessage: null,
    _queue: [],
    _sendQueued: null,
    _sendQueuedAck: 0,    // max event ID present in _sendQueued

    _opt: {
      // Delay in ms during which all WebSocket send()-s are batched into one.
      // This should be more efficient than calling it after every event (but
      // I haven't benchmarked).
      //
      // Batching like this is safe since RPC operations are asynchronous.
      //
      // 0 makes _send() synchronous.
      batchInterval: 25,    // do not set after init()
      ws: null,   // browser's WebSocket instance
      repl: false,
    },

    events: {
      // Must be given opt.context (_opt.context is defined in RPC).
      '-init': function () {
        this._rpcAsyncs = new Common.PendingResponses
        this._boundHandleClose = this.handleClose.bind(this)
        this._boundHandleError = this.handleError.bind(this)
        this._boundHandleMessage = this.handleMessage.bind(this)

        var interval = this.get('batchInterval')
        this._sendQueued = interval
          ? _.throttle(this._flush.bind(this), interval, {leading: false})
          : this._flush
      },

      change_ws: function (now, old) {
        _.log && _.log('RPC WebSocket = %s <- %s', now && now.url, old && old.url)
        if (old) {
          old.removeEventListener('close', this._boundHandleClose)
          old.removeEventListener('error', this._boundHandleError)
          old.removeEventListener('message', this._boundHandleMessage)
        }
        if (now) {
          now.addEventListener('close', this._boundHandleClose)
          now.addEventListener('error', this._boundHandleError)
          now.addEventListener('message', this._boundHandleMessage)
        }
      },

      // Call this when no longer interested in this session (and won't need to
      // resume it). Remember that there may be _queue'd data that will be lost
      // (and associated Async-s will be marked as failed) if remove() is
      // called immediately after _send(). Normally you'd wait until responses
      // arrive for all operations so this is not a problem (only ack's may be
      // lost but they are meaningless if drop'ing the session anyway).
      remove: function () {
        // Don't linger on server.
        var ws = this.get('ws')
        ws && ws.close(Common.CODES.drop, 'RPC.WebSocket removed')
      },

      '=do': function (sup, method, args) {
        var async = this._rpcAsyncs.nest({
          // For debugging.
          method: method,
          params: args,
        })

        // This relies on the fact _send() can't throw, else the caller won't have
        // chance to set up async.whenError(). Additionally, as specified by base do(), we should never throw.
        this._send(JSON.stringify({
          jsonrpc: '2.0',
          id: async._cid,
          method: method,
          params: args,
        }), async)

        return async
      },

      serverEvent: function (event, data) {
        switch (event) {
          case 'resume':
            var async = this._resumptionAsync
            if (async && async._cid == data.id) {
              async.assignResp(data)     // usually indicates success
            }
        }
      },

      reset: function () {
        this._resumptionAsync && this._resumptionAsync.set('status', false)

        // It is probably useless to try to send queued data after the reconnect
        // so clear the queue, triggering error callbacks. This also cancels _sendQueued.
        this._flush('Connection Reset')

        // We know server has removed our peer-facing Client instance. If we reconnect,
        // we'll get a new one created, starting with the initial event ID.
        this._eventID = 0

        // Request responses are stored as serverEvent-s but since we're dropping
        // the session, we will never get those responses. This doesn't mean
        // operations didn't finish (or did finish) - if they did, world diffs
        // were broadcasted so it's atomic (integrity-safe).
        this._rpcAsyncs.each(function (async) {
          async.errorResult = {code: Common.CODES.drop, message: 'WebSocket closed'}
          try {
            async.set('status', false)
          } catch (e) {
            console && console.warn('JSON-RPC cancellation error: ' + e.message)
          }
        })
      },
    },

    // Processes WebSocket's onclose.
    handleClose: function (e) {
      if (e.code == Common.CODES.drop) {
        this.reset()
      } else {
        this._resumptionAsync && this._resumptionAsync.set('status', false)
      }
    },

    // Processes WebSocket's onerror.
    handleError: function (e) {
      // e coming from WebSocket.onerror contains absolutely no specifics, not even a message.
      console && console.warn('WebSocket error: ' + e.message)
    },

    // Processes WebSocket's onmessage.
    handleMessage: function (e) {
      var data = e.data
      //_.log && _.log('<-- %s', data)
      try {
        var data = JSON.parse(data)
      } catch (e) {
        if (!this.get('repl')) {
          this.get('ws').close(Common.CODES.badJSON, 'Malformed JSON')
        }
        return
      }
      // REPL may print 'null' or 'undefined' in response to user commands and they will pass try/catch above but fail at object access.
      if (data && data.event == 'repl') {
        // In REPL mode incoming data may be arbitrary. Special string allows figuring when a seemingly valid message is indeed a signal to turn this mode off.
        this.set('repl', data.data != Common.REPL_MAGIC)
      } else if (this.get('repl')) {
        return    // during REPL only handle events for stopping REPL
      } else if (data.id <= this._eventID) {
        _.log && _.log('Already seen event ID %d <= my %d', data.id, this._eventID)
        var async = this._resumptionAsync
        if (data.event == 'resume' && async && async._cid == data.data.id) {
          async.assignResp(data.data)    // usually indicates error
        }
      } else {
        this._eventID = this._sendQueuedAck = data.id
        // To avoid the cycle of ack'ing ack's, not giving any id (hence creating
        // a Notification). Also not spamming in client's log with do().
        this._send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'ack',
          params: {id: data.id},
        }))
        this._queue.length && _.last(this._queue).push(data.id)
        if (data.event == 'jsonrpc') {
          [].concat(data.data).forEach(function (data) {
            try {
              this.handleJsonRpcMessage(data)
            } catch (e) {   // process all responses even if one of them fails
              console && console.warn('JSON-RPC response error: ' + e.message)
            }
          }, this)
        } else {
          this.serverEvent(data.event, data.data)
        }
      }
    },

    // Processes a JSON-RPC message arrived by WebSocket.
    handleJsonRpcMessage: function (data) {
      if (!data || data.jsonrpc != '2.0') {
        this.get('ws').close(Common.CODES.badJSON, 'Unsupported JSON-RPC version')
        return
      }
      var async = this._rpcAsyncs.nested(data.id)
      if (!async) {
        // Might happen if operations were cancelled due to remove() (and so they
        // were unlisted from _rpcAsyncs) but a response has slipped through
        // before the connection was closed (and handleJsonMessage() tried to
        // find it in _rpcAsyncs).
        console && console.warn('JSON-RPC Response to unknown Request ' +
          data.id + ': ' + (data.error && data.error.message))
      } else if (!data.error) {
        async.result = data.result
        async.set('status', true)
      } else {
        async.errorResult = data.error
        async.set('status', false)
      }
    },

    // Queues data for sending to the server over WebSocket.
    _send: function (data, async) {
      this._queue.push([data, async, /*event ID if ack*/])
      this._sendQueued()
    },

    // Sends queued remote method calls to the server over WebSocket.
    _flush: function (fail) {
      this._sendQueued.cancel && this._sendQueued.cancel()

      this._queue.splice(0).forEach(function (item) {
        try {
          if (fail) {
            throw new Error(fail)
          }
          // For efficiency, only send the last of multiple ack's in the queue.
          if (!item[2] || item[2] >= this._sendQueuedAck) {
            this.get('ws').send(item[0])
          }
        } catch (e) {
          if (item[1]) {
            // Presence of this handler also prevents rethrow() by do().
            item[1].whenError(function () {
              // _rpcAsyncs members (added by do()) emit logs in change_status.
              if (!this._rpcAsyncs.nested(item[1])) {
                _.log && _.log('=[]> %s : %.s', e.message, item[0])
              }
            }, this)
            item[1].errorResult = e
            item[1].set('status', false)
          } else {
            this.handleError(e)
          }
        }
      }, this)

      this._sendQueuedAck = 0
    },

    // Connects to remote Context and starts receiving world diffs.
    //
    //[
    // var clientSecret
    // rpcws.start('secret-from-lobby...')
    //   .whenSuccess(function () {
    //     rpcws.do('info')
    //       .whenSuccess(function (info) {
    //         clientSecret = info.result.secret
    //       })
    //   })
    // // ...
    // rpcws.resumeOrRestart('secret-from-lobby...', clientSecret)
    //]
    start: function (playerSecret) {
      function newAsync(child) {
        return child.whenError(function () {
          async.errorResult = child.errorResult
          async.set('status', false)
        })
      }
      var async = new Common.Response
      var cx = this.get('context')
      // A restart may happen while our Context is loading but paused at
      // configuring. If so, fail the loading, wait and then start().
      if (cx.get('configuring')) {
        cx.once('change_loading', function () {
          newAsync(this.start(playerSecret))
            .whenSuccess(function () {
              async.set('status', true)
            })
        }, this)
        _.log && _.log('RPC forcing Context re-start')
        cx.get('configuring').set('status', false)
      } else {
        newAsync(this.do('player', {secret: playerSecret}))
          .whenSuccess(function (player) {
            this.logIn(player.result)
            newAsync(this.do('start'))
              .whenSuccess(function (start) {
                cx.on('dataReady', function () {
                  async.set('status', true)
                })
                cx.game({url: start.result.url, data: start.result, configure: start.result.configure, backend: 'server', cause: 'rpc'})
              })
          }, this)
      }
      return async
    },

    // Attempts to resume an existing Client session on the server, start()'ing a new one if could not.
    resumeOrRestart: function (playerSecret, clientSecret) {
      this._resumptionAsync && this._resumptionAsync.set('status', false)
      var async = this._resumptionAsync = new Common.Response

      var commandAsync = this.do('resume', {
        secret: clientSecret,
        detach: true,
        id: async._cid,
      })

      // Presence of this handler also prevents rethrow() by do().
      // Shouldn't be called at all but just in case...
      commandAsync.whenError(function () {
        async.set('status', false)
      })

      async.whenComplete(function () {
        if (this._resumptionAsync == async) {
          this._resumptionAsync = null
        }
        // Normally, commandAsync won't change status by itself since to resume
        // we connect over a new server client, with event ID lower than _eventID.
        //
        // Even if this new session has a higher event ID for some unexpected reason, commandAsync status will be changed by handleJsonRpcMessage() but it should match _resumptionAsync's status.
        //
        // In any case, _resumptionAsync should always resolve (by serverEvent()) while commandAsync might or might not automatically resolve, and this listener will resolve it always.
        commandAsync.set('status', async.get('status'))
      }, this)

      var result = new Common.Response

      async.whenSuccess(function () {
        result.set('status', true)    // resumed
      })

      async.whenError(function () {
        // If client session has expired, start from scratch.
        if ((async.errorResult || {}).code == Common.CODES.mustAuth) {
          // Simulate reconnect while reusing existing WS - reset _eventID, etc.
          this.reset()
          this.start(playerSecret)
            .whenSuccess(function () {
              result.set('status', true)    // re-started
            })
            .whenError(function (player) {
              result.errorResult = player.errorResult
              result.set('status', false)
            })
        } else {
          result.errorResult = async.errorResult
          result.set('status', false)
        }
      }, this)

      return result
    },

    // Called after connecting to remote Context but before enabling world diffs.
    //
    // Not fired for resumeOrRestart().
    //
    // May be fired if resumeOrRestart() was called, to indicate expired clientSecret and successful re-start().
    logIn: function (info) {
      // User can still change this later but doing so at his own risk. Different classic setting on client/server might or might not cause problems.
      this.get('context').set('classic', info.classic)
    },
  })

  // Helps set up and maintain client's side of a multi-player connection offered by `@RPC.WebSocket`@.
  //
  // This takes over _opt.ws so don't change it while 'active'.
  // Note: onclose may be fired at will while 'active'.
  // `'client given to new must have a set _opt.context.
  WS.Connector = Common.Sqimitive.extend('HeroWO.RPC.WebSocket.Connector', {
    _client: null,
    _timer: null,
    _boundHandleOpen: null,
    _boundHandleClose: null,

    _opt: {
      reconnectDelay: 1000,   // interval for trying to connect again after WebSocket closing; some conditions use their own delay
      url: '',    // changing will affect next connection attempt only
      playerSecret: '', // ditto
      player: null,  // can read; is set after open to player's number of the secret
      clientSecret: '', // do not set
      seatSource: '',   // as player; actionSource of our Server.Context.Player
      clientSource: '', // as seatSource
      // After stopping you may want to close() _opt.ws (consider supplying code/reason to ease in troubleshooting).
      active: false,
      // Whether the connection is operational (i.e. not reconnecting, etc.).
      working: false,   // do not set
      // Whether WebSocket has fired onopen even once.
      everOpened: false,    // do not set
    },

    _initToOpt: {
      client: '._client',
    },

    events: {
      '-init': function (opt) {
        this._boundHandleOpen = this.handleOpen.bind(this)
        this._boundHandleClose = this.handleClose.bind(this)

        var cx = opt.client.get('context')
        this.autoOff(cx, {
          render: function () {
            this._client.set('player', cx.players.nested(this.get('player')))
          },
        })
      },

      // this.remove() is similar to set('active', false) but permanent.
      // After this, _client remains connected; may want to remove() it too.
      remove: function () {
        this.set('active', false)
      },

      change: function (name, now, old) {
        _.log && _.log('RPC %s.%s = %s <- %s', this._cid, name, now, old)
      },

      change_active: function (now) {
        this.autoOff(this._client)
        this._hookWS(null, this._client.get('ws'))
        clearTimeout(this._timer)
        this.set('working', false)
        now && this._start()
      },
    },

    noConnection: Common.stub,  // early connection issue (e.g. bad PROTOCOL)
    shutdown: Common.stub,      // server shut down
    takeover: Common.stub,      // another client resumed same session
    badSecret: Common.stub,     // invalid playerSecret

    _start: function () {
      if (!this._client || !this.get('url') || !this.get('playerSecret')) {
        throw new Error('Required Connector options were not set.')
      }

      this.autoOff(this._client, {
        change_ws: '_hookWS',

        logIn: function (info) {
          this.assignResp({
            player: info.player,
            clientSecret: info.secret,
            seatSource: info.seatSource,
            clientSource: info.clientSource,
          })

          this._client.assignResp({
            observer: info.observer,
          })
        },
      })

      this._client.getSet('ws', function (ws) {
        if (ws) {
          throw new Error('WebSocket is already connected.')
        }
        return new WebSocket(this.get('url'))
      }, this)
    },

    _hookWS: function (now, old) {
      if (old) {
        old.removeEventListener('open', this._boundHandleOpen)
        old.removeEventListener('close', this._boundHandleClose)
      }
      if (now) {
        now.addEventListener('open', this._boundHandleOpen)
        now.addEventListener('close', this._boundHandleClose)
      }
    },

    // Processes WebSocket's onopen. Resumes an existing session or starts a new one.
    handleOpen: function () {
      // According to the standard and RFC 6455, onopen happens when connection was indeed successfully established, so if it fails with 1006 after that we know it isn't due to PROTOCOL, etc.
      //
      // https://websockets.spec.whatwg.org/#feedback-from-the-protocol
      this.set('everOpened', true)
      var func = this.get('clientSecret') ? 'resumeOrRestart' : 'start'
      this._client[func](this.get('playerSecret'), this.get('clientSecret'))
        .whenSuccess(function () {
          // If resumed, set after last resubmitted message was processed.
          // If started, set after dataReady (Context may be still loading).
          this.set('working', true)
        }, this)
        .whenError(function (async) {
          if (async.errorResult && async.errorResult.code == Common.CODES.mustAuth) {
            // Looks like our playerSecret was banned.
            this.set('active', false)
            this.badSecret()
          } else {  // probably a network issue, try to reconnect
            this._client.get('ws').close(Common.CODES.drop, 'Reconnecting due to start/resume error')
          }
        }, this)
    },

    // Processes WebSocket's onclose. Attempts to reconnect unless facing a permanent condition.
    handleClose: function (e) {
      _.log && _.log('RPC %s closed: %d %s', this._cid, e.code, e.reason)
      this.set('working', false)

      try {
        var data = JSON.parse(e.reason)
      } catch (exception) {
        data = {}
      }

      var delay = this.get('reconnectDelay')

      switch (e.code) {
        // There appears to be no way to obtain detailed information about the
        // error, such as a HTTP status to determine if indeed PROTOCOL is different.
        // Thus we treat all 1006 as if this was the case. Same happens if server
        // doesn't listen on 'url' or has different /v (version).
        //
        // 1006 is also used if server has abruptly closed an active WebSocket connection or if client's network disconnected. But we can detect these since everOpened will be true.
        case 1006:
          if (this.get('everOpened')) {
            break   // reconnect after a delay
          }
          this.set('active', false)
          return this.noConnection()

        // Reasons may vary but usually it means we can try with a fresh connection.
        case Common.CODES.drop:
          // Server has changed our seat or secret (e.g. do=configure doing assign).
          data.secret && this.set('playerSecret', data.secret)
          this.getSet('clientSecret', function (cur) {
            // If were successfully connected before, retry immediately, once.
            if (cur) { delay = 0 }
            return null
          })
          break

        case Common.CODES.rebooting:
          if (data.newURL) {
            this.set('url', data.newURL)
            delay = 0
            break
          } else {
            this.set('active', false)
            return this.shutdown()
          }

        case Common.CODES.resume:
          this.set('active', false)
          return this.takeover()
      }

      this._timer = setTimeout(function () {
        this._client.set('ws', new WebSocket(this.get('url')))
      }.bind(this), _.random(delay, delay * 1.25))
    },
  })

  return WS
})