define(['DOM.Common'], function (Common) {
  "use strict"
  var _ = Common._
  var $ = Common.$

  // Provides template formatting to `#Context (`@Context.template()`@).
  //
  // ` `#Templates uses NoDash's `@no@template()`@ - a simple extensible
  // formatter with `[{{if}}`] and other common directives.
  //
  // Compiled templates are stored indefinitely and subsequent formatting of the
  // same template (by `'name) is as fast as doing the string math manually.
  //
  // `'sources `'_opt must be set to node(s) containing nodes with
  // `[data-Htemplate`] attribute whose value matches name of the template
  // to be formatted:
  //[
  //   <div id="templates">
  //     <template data-Htemplate="foo">
  //       Hello, {{ world }}!
  //     </template>
  //   </div>
  //
  //   context.addModule(Templates, {sources: ['#templates']})
  //   context.format('foo')({world: 'HERO WOrld!'})
  //]
  //
  // XXX=R check existing code and extract HTML <chunks> (usually fed to el.html()) into templates
  //
  // XXX consider putting HTML and CSS (extracted from herowo.css) into separate files retireved and bundled using require.js
  return Common.Sqimitive.extend('HeroWO.Templates', {
    mixIns: [Common.ContextModule],
    persistent: true,
    _compiled: null,

    _opt: {
      sources: [],
    },

    events: {
      init: function () {
        this._compiled = new Map
      },

      '+normalize_sources': function (res, now) {
        return $.apply($, now)
      },

      owned: function () {
        this.autoOff(this.cx, {
          '+template': function (res, name, options) {
            if (res == null) {
              if (!this._compiled.has(name)) {
                options = _.extend({}, options, this.templateOptions())
                var tpl = this.get('sources').find('[data-Htemplate="' + name + '"]').html()
                this._compiled.set(name, _.template(tpl, options))
              }
              return this._compiled.get(name)
            }
          },
        })
      },
    },

    // Returns `@no@template()`@ options for subsequent compilation.
    //
    // This can be overridden to implement custom `[{{blocks}}`. By default
    // `#Template sets `'escaper to escape HTML and adds these blocks:
    //
    //> T       `[{{ T:[!]context ST RI NG }}`]
    //  `- Emits the translated version of string. `'! prevents HTML-escaping.
    //  Removes 1 whitespace from the end of the string, if present.
    //
    //> cur     `[{{ cur[:cl-a_ss] condi == 'tion' }}`]
    //  `- Emits "cl-a_ss" if the condition (a JavaScript expression) holds.
    templateOptions: function () {
      var context = this.cx
      return {
        backslash: true,
        prepare: {o: {escaper: _.escape}},

        blocks: {
          T: function (param, value, c) {
            return {
              start: (param[0] == '!' ? '' : 'E') + '(' +
                     JSON.stringify(context.s(param.replace(/^!/, ''), value.replace(/\s$/, ''))) + ')',
            }
          },

          cur: function (param, value, c) {
            param = param || 'Hh3-btn_cur'    // XXX H3 subsystem
            return {
              start: '(' + c.ref(value) + ' ? ' + JSON.stringify(param) + ' : "")',
            }
          },
        },
      }
    },
  })
})