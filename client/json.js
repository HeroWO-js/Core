// This file is currently unused.
//
// This loader plugin can be used like this:
// define(['json!foo/bar'], function (data) { ... })
define({
  load: function (name, req, onload, config) {
    var xhr = new XMLHttpRequest

    xhr.onreadystatechange = function () {
      if (xhr.readyState == 4) {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.responseType == 'json') {
          onload(xhr.response)
        } else {
          onload.error(xhr)
        }
      }
    }

    xhr.ontimeout = onload.error
    xhr.open(o.type, req.toUrl(name), true)
    xhr.timeout = config.timeout
    xhr.responseType = 'json'
    xhr.send(null)
  },
})