// Require.js configuration and data-main script.

requirejs.config({
  enforceDefine: true,
  shim: {
    PathAnimator: {exports: 'PathAnimator'}
  },
  paths: {
    PathAnimator: 'PathAnimator/pathAnimator'
  }
})

// Used to silence the error require.js generates on config.js in non-minified
// build with enforceDefine enabled running directly in browser (not WebWorker).
if (typeof define == 'function' && typeof window != 'undefined') {
  define([], new Function)
}
