# HeroWO's Game Core

Part of the HeroWO.js project - a JavaScript re-implementation of *Heroes of Might and Magic III*.

https://github.com/HeroWO-js/Workbench

https://herowo.game

## client

The main thing - JavaScript game engine with client side of the multi-player (server side that amounts to about 4% of Core is proprietary).

Dependencies are included as git submodules:

* NoDash - a utility library with `_.pick()` and 80+ other functions
  https://squizzle.me/js/nodash/
* Sqimitive - the backbone framework for everything
  https://squizzle.me/js/sqimitive/
* Require.js - a module system that doesn't get in the way
  https://requirejs.org
* PathAnimator - a teeny function converting arbitrary SVG curve to coordinates
  https://github.com/yairEO/pathAnimator
* Source Map - allows recreating non-minified stack traces in exception reports
  https://github.com/mozilla/source-map

...except for `jquery.js` that is bundled directly.
https://jquery.com

## databank

The, er, bank of game data - most of it coming from HoMM 3 TXT files. One way to create modifications ("mods"), and the easiest also, is by changing databank files - either prior to convertion (edit `databank-*.php` or supply already modded TXTs) or after it (edit `*.json`).

HoMM 3 map convertion is backed by `h3m2json.php`.
https://github.com/HeroWO-js/h3m2json

## noXXXep

HeroWO is a work in progress and includes hundreds of small and large to-do tasks (`XXX`). These are embedded directly in code to make them versioned, easy to modify en masse and tightly bound to their context. **noXXXep** is what [presents them nicely](https://herowo.io/noXXXep/).

https://github.com/ProgerXP/noXXXep

## Phiws, api.php and others

`api.php` is the server side coordinator of client side JavaScript engine, providing the latter with the list of lobby games, playable maps and chat messages.

**Phiws** is a *PHp WebSockets* implementation used by `api.php` to communicate with HeroWO servers and clients. Unauthenticated data (list of maps and global chat messages) is distributed over Server-Sent Events (SSE). One can use `api.php` to start local games or connect to games on external servers.

Other files and folders facilitate smaller aspects of running the game:

* `custom-graphics` - folder with custom graphics that wasn't taken from HoMM 3 files (i.e. isn't part of the databank) or that was transformed in some way
* `css-monitor.php` - watches local CSS files and refreshes styles without reloading the page; indispensible when developing HeroWO UI
* `herowo*.css` - technically part of the game client code
* `index.php` - user's entry point; bootstraps HeroWO environment in a web browser
* `maps.php` - provides insight into maps existing on the server and allows uploading new maps
