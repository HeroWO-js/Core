define(['RPC.Common'], function (Common) {
  "use strict"
  var _ = Common._

  var AI = Common.Sqimitive.extend('HeroWO.AI', {
    mixIns: [Common.ContextModule],
    rpc: null,
    player: null,
    _task: null,

    _opt: {
      // + keys from Map's controllers[controller] object
    },

    _initToOpt: {
      rpc: '.',
      player: '.',
    },

    events: {
      init: function () {
        this._task = this.cx.backgroundTasks.nest({})
      },

      render: function () {
        this._task.get('pause') && this._pause()

        this.autoOff(this._task, {
          change_pause: function (now) {
            if (now) {
              this._pause()
            } else {
              this._task.set('paused', false)
              this._checkInteractive()
            }
          },
        })

        this.autoOff(this.map.transitions, {
          '.change': function (transition, name, now) {
            if (name == 'final' && now && this._selectTransition(transition)) {
              _.log && _.log('AI P%d: transition selected%s : %s : %.j', this.player.get('player'), this.player.get('interactive') ? ' while non-interactive' : '', transition.get('type'), transition.get())
              // Remember that AI is running on master.
              transition.getSet('active', Common.inc())
              this._transition(transition)
            }
          },
        })

        this.autoOff(this.player, {
          change_interactive: Common.batchGuard(2, '_checkInteractive'),
        })

        this.autoOff(this.map.combats, {
          nestExNew: function (res) {
            this.autoOff(res.child, {
              change_state: function (now) {
                if (now == 'init') {
                  this.autoOff(res.child)
                  hookCombat(res.child)
                }
              },
            })
          },
        })

        var hookCombat = function (combat) {
          var found = combat.parties.some(function (party) {
            return party.player == this.player
          }, this)

          found && this._hookCombat(combat)
        }.bind(this)

        this.map.combats.each(hookCombat)

        this._checkInteractive()
      },

      '-unnest': function () {
        if (this._parent) {
          this._task.remove()
          this.cx.idleTasks.removeOfContext(this)
        }
      },

      // All selected here require some action from the client.
      '+select_encounterPrompt, +select_encounterChoice': function (res, tr) {
        return this.player.get('player') == tr.get('owner')
      },

      '+select_heroExperience': function (res, tr) {
        return this.player.heroes.nested(tr.get('object'))
      },

      '+select_garrison, +select_tavern, +select_hireDwelling': function (res, tr) {
        return this.player.heroes.nested(tr.get('hero'))
      },

      '+select_warMachineFactory, +select_shipyard': function (res, tr) {
        return this.player.heroes.nested(tr.get('actor'))
      },

      '+select_heroTrade': function (res, tr) {
        return this.player.heroes.nested(tr.get('hero')) ||
               this.player.heroes.nested(tr.get('other'))
      },
    },

    // Read up on idleTasks limitations.
    do: function (method, args) {
      var res = new Common.Response({owning: false, method: method /*for log*/})

      this.cx.idleTasks.queue(function () {
        _.log && _.log('AI P%d: call   %s %s : %.j', this.player.get('player'), method, res._cid, args)

        var resp = this.rpc.do(method, args)

        _.log && resp.whenComplete(function (async) {
          _.log('AI P%d: called %s %s : %.j', this.player.get('player'), method, res._cid, res.result || res.errorResult)
        }, this)

        // Must be after whenComplete() to ensure the log entry is emitted before client responds to RPC command completion (if it's already completed by this time).
        res.wrap(resp)
      }, this)

      return res
    },

    _checkInteractive: function () {
      if (!this._task.get('pause') && this.player.get('interactive')) {
        this._interactive()
      }
    },

    _selectTransition: function (transition) {
      return this.fire('select_' + transition.get('type'), [transition])
    },

    _transition: function (transition) {
      _.log && _.log('AI P%d: transition done : %s : %.j', this.player.get('player'), transition.get('type'), transition.get())
      transition.getSet('active', Common.inc(-1))
    },

    //select_TYPE: function (transition)

    // Must cease all activity and set paused. May be called during _interactive.
    _pause: Common.stub,
    _interactive: Common.stub,
    // Combat 'state' may be arbitrary if loading a game.
    _hookCombat: Common.stub,
  })

  // Combat doesn't have to respect background _task because its control ends soon enough.
  AI.Combat = AI.extend('HeroWO.AI', {
    combat: null,

    _initToOpt: {
      combat: '.',
    },

    events: {
      attach: function () {
        this.autoOff(this.combat, {
          '-unnest': 'remove',
        })
      },

      '=do': function (sup, action, args) {
        args = ['combat', _.extend({
          do: action,
          combat: this.combat._parentKey,
        }, args)]

        return sup(this, args)
      },

      // combatSurrenderAsk requires an action.
      '+_selectTransition': function (res, transition) {
        return res || transition.get('combat') == this.combat._parentKey
      },
    },
  })

  return AI
})