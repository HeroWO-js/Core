define(['Common'], function (Common) {
  "use strict"
  var _ = Common._

  //! +cl=RPC.Common
  //
  // Collection of base library classes and utility functions used throughout
  // HeroWO client-server code.
  var Common = _.extend({}, Common)
  Common.PROTOCOL = 1
  Common.REPL_MAGIC = '2r}Ep*L-'

  // https://www.ietf.org/rfc/rfc6455.html#section-7.4
  // Status codes in the range 4000-4999 are reserved for private use.
  //
  // Warning: client codes must be in range 1000-1000 and 4000-4999 due to
  // Firefox bug #1467107.
  //
  // By convention, 10xx except 1000 are used for server conditions,
  // 40xx for conditions that map to RFC's 10xx code,
  // 41xx for custom conditions, 46xx for conditions that map to JSON-RPC's -326xx.
  Common.CODES = {
    badProtocol: 417, // only for HTTP Upgrade status code
    //normal: 1000,   // [client] unknown reason for disconnect
    rebooting: 1012,  // [server] endpoint is restarting; reason = info (JSON)
    stopping: 1012,   // [server] server is dropping all clients; reason = empty
    badJSON: 4002,    // [c/s] terminating due to a protocol error
    mustAuth: 1008,   // [server] a message that violates endpoint policy
    exception: 4011,  // [c/s] encountered an unexpected condition
    drop: 4001,       // [c/s] client disconnected without lingering; [s] JSON
    unload: 1001,     // [client] as drop but sent by browser on onunload; do not use
    resume: 4101,     // [c/s] another client took over the session
    badSend: 4102,    // [c/s] send() error, disconnecting to reconnect
    badMethod: 4601,  // [server] JSON-RPC 2.0 code -32601
  }

  // Base Error for expected exceptions in processing an `#RPC request (such as insufficient gold).
  //
  // https://stackoverflow.com/questions/1382107/
  Common.ClientError = function (msg, responseCode, responseData) {
    this.name = 'HeroWO.RPC.ClientError'
    this.stack = (new Error).stack
    this.message = msg
    this.responseCode = responseCode || null  // use generic code
    this.responseData = responseData
  }

  Common.ClientError.prototype = new Error

  // Represents a response (successful or not) to an `#RPC request.
  Common.Response = Common.Async.extend('HeroWO.RPC.Response', {
    // The server's response of arbitrary type.
    //
    // Is only set if `'status is true (but may be `'null even in this case),
    result: null,

    // Error information if the request has failed.
    //= null`, Error`, object `[{code, message[, data]}`] (JSON-RPC 2.0)
    // Is only set if `'status is false (but may be `'null even in this case),
    //
    // `'Error is converted to `'object when transferring over WebSocket so
    // it may be `'Error on the master's side only.
    //
    // Do not confuse `#errorResult with `'error that is an event (method) in Sqimitive.Async.
    errorResult: null,

    _opt: {
      errorHandlers: 0,
    },

    _respToOpt: {
      result: '.',
      errorResult: '.',
    },

    events: {
      '-whenError': function () {
        this.getSet('errorHandlers', Common.inc())
      },
    },

    // Triggers `'exception logic of this `'Async (`'throw by default) based on `#errorResponse/`#errorObject().
    rethrow: function () {
      this.exception(this.errorObject())
    },

    // Always returns an Error object or its subclass based on given `'e (`#errorResult if omitted).
    errorObject: function (e) {
      if (!arguments.length) {
        e = this.errorResult
      }
      if (!e) {
        e = new Common.ClientError('Unspecified Error')
      } else if (!(e instanceof Error)) {
        e = new Common.ClientError(e.message, e.code, e.data)
      }
      return e
    },

    // Reflects status changes of `'resp on `'this.
    //> resp RPC.Response
    // Caller must not add any children to this at any point. Allows linking two `#Async-s belonging to two different `'_owning parents.
    wrap: function (resp) {
      resp.on('-abort', 'abort', this)
      resp.getSet('errorHandlers', Common.inc(this.get('errorHandlers')))

      this.on('change_errorHandlers', function (now, old) {
        resp.getSet('errorHandlers', Common.inc(now - old))
      })

      resp.whenComplete(function () {
        this.result = resp.result
        this.errorResult = resp.errorResult
        this.assignResp(resp.get())   // method, args
      }, this, -1)

      return this.nest(resp)
    },
  })

  Common.Response.prototype._initToOpt = Common.Response.prototype._respToOpt

  // Collection of Request-s issued to the remote side having no responses received so far.
  Common.PendingResponses = Common.Sqimitive.extend('RPC.Common.PendingResponses', {
    _owning: false,    // can also be owning
    _childClass: Common.Response,
    _childEvents: ['complete'],

    events: {
      nestExNew: function (res) {
        _.log && _.log('<[%s]= %s %j', res.key, res.child.get('method'), res.child.get('params'))
      },

      '.complete': function (async) {
        _.log && _.log('=[%s]> %s : %s %s',
                       this.findKey(async),
                       async.get('method'),
                       async.get('status') ? 'SUCCESS' : 'ERROR',
                       async.get('status') ? '' : async.errorObject().message)

        this.unlist(async)

        // This assumes nested Request cannot fail before the caller nests it and sets up an error handler - otherwise rethrow() won't be called and the error will go unnoticed.
        if (!async.get('status') && !async.get('errorHandlers')) {
          async.rethrow()
        }
      },
    },
  })

  // Mix-in for objects that can be un/serialized to JSON.
  //
  // Defines `#serialize() and `#unser (unserialization schema for `'assignResp()). Makes `'assignResp()'s `'onlyDefined default to `'true if `'schema is `'unser.
  Common.Serializable = {
    // Listed in Common.Sqimitive._mergeProps.
    unser: {},

    events: {
      '=assignResp': function (sup, resp, options) {
        if (options && options.schema == 'unser') {
          options = _.extend({onlyDefined: true}, options)
        }
        return sup(this, [resp, options])
      },
    },

    // Packs this object's data into natively serializable (JSON) values.
    // To be overridden by subclasses.
    serialize: function () {
      return {}
    },

    // No unserialize() - use assignResp()/assignChildren() with schema = 'unser'.
  }

  return Common
})