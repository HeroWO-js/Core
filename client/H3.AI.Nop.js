define(['Common', 'AI'], function (Common, BaseAI) {
  "use strict"
  var _ = Common._

  var AI = BaseAI.extend('HeroWO.H3.AI.Nop', {
    events: {
      _pause: function () {
        this._task.set('paused', true)
      },

      _interactive: function () {
        this.do('endTurn', {pending: _})
      },

      _hookCombat: function (combat) {
        this.addModule(combat._cid, AI.Combat, {
          rpc: this.rpc,
          player: this.player,
          combat: combat,
          // XXX=RH
          state: this.rpc._createCombatState(combat, this.player),
        })
      },
    },
  })

  AI.Combat = BaseAI.Combat.extend('HeroWO.H3.AI.Nop.Combat', {
    state: null,

    _initToOpt: {
      state: '.',
    },

    events: {
      attach: function () {
        this.autoOff(this.state, {
          change_creature: Common.batchGuard(2, function () {
            if (this.state.get('creature')) {
              if (this.state.get('phase') == 'tactics') {
                this.do('tacticsEnd')
              } else if (this.state.canControl()) {
                this.do('defend')
              }
            }
          }),
        })
      },

      render: function () {
        this.do('ready')
      },

      '-_transition': function (transition) {
        switch (transition.get('type')) {
          case 'combatSurrenderAsk':
            if (this.combat.parties.nested(transition.get('decisionMaker')).player == this.player) {
              this.do('surrenderAccept', {
                party: transition.get('party'),
                reject: true,
              })
            }
            return
        }
      },
    },
  })

  return AI
})