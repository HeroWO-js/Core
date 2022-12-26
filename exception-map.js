// Based on https://github.com/novocaine/sourcemapped-stacktrace (BSD).

var fs = require('fs')
var map = fs.readFileSync(process.argv[2], {encoding: 'utf8'})
var trace = fs.readFileSync(process.stdin.fd, {encoding: 'utf8'})

var consumer = require('./source-map/lib/source-map-consumer')
new consumer.SourceMapConsumer(map)
  .then(function (map) {
    trace = trace
      .split('\n')
      .map(function (line) {
        var match = line.trim().match(/(^at (\S*) \(|([^@]*)@)(.*?):(\d+):(\d+)/)
        if (match) {
          var pos = map.originalPositionFor({line: +match[5], column: +match[6]})
          var interest = pos.source.includes('/') || !/[A-Z]/.test(pos.source) ? ' ' : '*'
          line = `   ${interest}map at ${pos.name || '?'} (${pos.source}:${pos.line}:${pos.column})`
        }
        return line
      })
      .join('\n')

    process.stdout.write(trace)
  })