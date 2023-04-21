<?php
  // Bootstraps HeroWO environment in a web browser so visitors can start playing the game.

  require __DIR__.'/api.php';

  foreach (['sseURL', 'mapsURL', 'databanksURL'] as $key) {
    $all = explode(' ', keyValue($key));
    $$key = $all[crc32(ip2long($_SERVER['REMOTE_ADDR'])) % count($all)];
  }

  $databanks = keyValue('databanks');
  $currentDatabank = keyValue('databank');
  $dev = keyValue('production') < 1;
  $minified = (!$dev or array_key_exists('d', $_GET));

  $dev or header('Cache-Control: max-age=30');

  // This allows sending  expires max;  in nginx.
  $timeRef = function ($file) use ($databanksURL, $currentDatabank) {
    $time = filemtime(keyValue('databanks')."/$currentDatabank/$file");
    return $databanksURL.$currentDatabank."/$file?".
           base_convert($time - strtotime('2022-01-01'), 10, 32);
  };

  // Shred off a few KiB to make #loading appear earlier.
  // Preserving first whitespace symbol (\n) to not break semicolon-less JS.
  ob_start(function ($buf, $phase) {
    return preg_replace('/\\\\[\\r\\n]\\s*|(\\s)\\s+/u', '\\1', $buf);
  });
?>
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>HeroWO</title>
  </head>
  <body class="<?=$minified ? 'HLb_ HLb_static' : ''?>">
    <?php
      if ($minified) {
        // Main styles will block initial page render if included before loading
        // animations (such as in <head>).
        require 'custom-graphics/loading/body.php';
      }
    ?>

    <?php ob_start()?>
      <div class="Hweb-top__menu">
        <span class="Hweb-top__menu-label">
          <img src="data:image/gif;base64,R0lGODlhEAAaALMMANu5XunFau/LcPfTeP3qsvzjm+TAZf7bgP/uw/PPdPrWewAAAP///wAAAAAAAAAAACH5BAEAAAwALAAAAAAQABoAAASCkEm2qq1zWsTJUZa2cNaRCIGBVRyyUAtqAMDWrosx0yxCFIcXZQdQjX4f4YKmE1SQg4RSFxBIK58rzBBIDIKwECXQVYCEGZhVEUSnF4kEG5OWVAZz9zuvfx/AdX50gRqAhCJ9h4qIg4EVZmeHC5AKUpJmUZaEk5kBiXZwCZ6foGIZEQA7" alt="?">
          <span>?</span>
        </span>
        <div class="Hweb-top__menu-list">
          <p>Powered by HeroWO.js</p>
          <?php if ($dev) {?>
            <p><a href="https://herowo.game">Main gaming website</a></p>
            <p class="Hweb-top__menu-forum"><a href="https://herowo.io/forum">Community forum</a></p>
            <p><a href="#XXX=:url:">Modding samples</a></p>
          <?php } else {?>
            <p class="Hweb-top__menu-forum"><a href="https://herowo.io/forum">Community forum</a></p>
            <p><a href="https://herowo.io">Modding platform</a></p>
          <?php }?>
          <p><a href="maps.php">Maps (+ upload)</a></p>
          <p><a href="#XXX=:url:">Documentation</a></p>
          <p><a href="noXXXep/?tag=COMPATIBILITY">What’s done?</a></p>
          <p><a href="https://herowo.io/dl">Downloads</a></p>
          <p><a href="https://github.com/HeroWO-js">GitHub</a></p>
        </div>
      </div>
    <?php $menu = ob_get_flush()?>

    <noscript>
      <p>HeroWO is a purely JavaScript game. Please <a href="https://enable-javascript.com">enable JavaScript</a> in order to play it!</p>
    </noscript>

    <?php if ($minified) {?>
      <link rel="stylesheet" href="<?=htmlspecialchars($timeRef('herowo.min.css'))?>">
    <?php } else {?>
      <link rel="stylesheet" href="herowo.css" id="monicss">
      <link rel="stylesheet" href="<?=htmlspecialchars($databanksURL.$currentDatabank.'/menu.css')?>">

      <?php if (!keyValue('production')) { // see Entry.Browser.js ?>
        <link rel="stylesheet" href="<?=htmlspecialchars($databanksURL.$currentDatabank.'/combined.css')?>" id="dbcss">
      <?php }?>
    <?php }?>

    <script>
      var <?=$minified ? 'H' /*namespace set in build.js*/ : 'require'?> = {
        deps: ['Entry.Browser'],
        config: {
          'Entry.Browser': {
            /*strings: < ?=escapeHtmlScriptJSON(file_get_contents('strings-menu.json'))?>,*/
            sseURL: <?=escapeHtmlScriptJSON(encodeJsonLine($sseURL))?>,
            ssePingInterval: <?=WatchdogSSE::$pingInterval * 1000 + 3000?>,
            mapsURL: <?=escapeHtmlScriptJSON(encodeJsonLine($mapsURL))?>,
            databanksURL: <?=escapeHtmlScriptJSON(encodeJsonLine($databanksURL))?>,
            apiURL: <?=escapeHtmlScriptJSON(encodeJsonLine(keyValue('apiURL')))?>,
            allowUserModules: <?=$dev ? 'true' : 'false'?>,
            debug: <?=$dev ? 1 : 0?>,
            audio: {
              '': <?=escapeHtmlScriptJSON(encodeJsonLine("$databanksURL$currentDatabank/"))?>,
            <?=escapeHtmlScriptJSON(substr(file_get_contents("$databanks/$currentDatabank/menuAudio.json"), 1))?>
          },
        },
      }
    </script>

    <?php if ($minified) {
      // Without crossorigin, if <script>'s src points to another domain then
      // exceptions thrown within it will show up as merely "Script error." in
      // window.onerror. With this, the server must send proper
      // Access-Control-Allow-Origin in response.
      //
      // https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/crossorigin
    ?>
      <script id="entryScript" async crossorigin src="<?=htmlspecialchars($timeRef('herowo.min.js'))?>"></script>
    <?php } else {?>
      <!-- Client code should technically include requirejs/requirejs (that is the main repo?) rather than requirejs/r.js (that is meant for Node) but they both have the same ./require.js while r.js also has the optimizer used by update.php. Having r.js thus saves the user from installing r.js separately. -->
      <script id="entryScript" async data-main="client/config" src="client/r.js/require.js"></script>
    <?php }?>

    <div id="top"></div>
    <div id="controls"></div>
    <div id="context"></div>
    <?php if ($dev) {?>
      <div id="log"></div>
    <?php }?>
    <div class="Hweb-gm"></div>

    <script type="text/html" id="grantModulesTemplate">
      <h2>Grant Loading Custom Modules</h2>

      <p>
        {{if loaded.length}}
          The map being started wants to load the following <mark><b>new</b></mark> custom modules.
        {{else}}
          The link you have opened requests that the following custom modules were loaded.
        {{/if}}
      </p>

      <p>
        <b>This is unverified third party code that may make the page unsafe to browse.</b>
      </p>

      <p>
        For example, it may try to mimic your online bank's website, or ask to enter your Google account password, or just harmlessly broadcast your HeroWO screen to your opponents.
      </p>

      <table>
        <tr>
          <th>Website</th>
          <th>Module's URL</th>
          <th>URL Hash</th>
        </tr>
        {{for modules}}
          <tr>
            <td>{{ m.host }}</td>
            <td>
              <a href="{{ m.url }}" target="_blank">{{ m.urlShort }}</a>
            </td>
            <td>
              {{if m.hash}}
                <kbd>{{ m.hash }}</kbd>
              {{else}}
                —
              {{/if}}
            </td>
          </tr>
        {{/for}}
      </table>

      <button type="button">Allow these modules to run</button>

      <p>
        If you wish to cancel, simply close or navigate away from this page.
      </p>

      <p>
        You are on <a href="https://herowo.io">herowo.io</a> which is for module developers and testers.
        Visit <a href="https://herowo.game">herowo.game</a> to play in a trusted environment (arguably less fun!).
      </p>
    </script>

    <div id="templates">
      <!--
        <script>'s advantage over <template> is that it's not interpreted as
        HTML, keeping {{ }} constructs literal. This:

          <template>
            <input type="checkbox" {{if flag}}checked{{/if}}>

        ...in reality becomes:

            <input type="checkbox" {{if="" flag}}checked...
      -->

      <script type="text/html" data-Htemplate="HeroWO.WebSite.TopBar">
        <span class="Hweb-top__fullsc {{if fullscreen}}Hweb-top__fullsc_cur{{/}}">\
          {{ T:webTop Fullscreen }}\
        </span>
        &nbsp;
        {{if connector}}
          {{if !connector.active}}
            <span class="Hweb-top__conn">{{ T:webTop Disconnected }}</span>
          {{elseif !connector.working}}
            <span class="Hweb-top__conn">{{ T:webTop Connecting… }}</span>
          {{/if}}
        {{/if}}
        {{if !connector || connector.working}}
          {{if onlineCount > 2}}
            <span>{{ onlineText }}</span>
            &nbsp;
          {{/if}}
          {{if popularMapText}}
            <a class="Hweb-top__lb" href="{{ popularMapsURL }}" target="_blank">\
              {{ T:webTop Most popular: }}\
            </a>
            <span class="Hweb-top__map">{{ popularMapText }}</span>
            &nbsp;
          {{/if}}
          <a class="Hweb-top__lb" href="{{ forumURL }}" target="_blank">\
            {{ T:webTop Forum }}\
          </a>
<!--
          <a class="Hweb-top__lb" href="{{ forumURL }}" target="_blank">\
            {{ T:webTop Now discussing: }}\
          </a>
          <a class="Hweb-top__topic" href="{{ lastForumURL }}" target="_blank">\
            {{ lastForumText }}\
          </a>
-->
        {{/if}}
        &nbsp;
        <span class="Hweb-top__clock">{{ clock }}</span>
        &nbsp;
        <span class="Hweb-top__time {{if showPlayTime}}Hweb-top__time_big{{/}}"
              title="{{ T:webTop Today's in-game play time }}">
          {{ playTime }}
        </span>
        <?=$menu?>
      </script>

      <script type="text/html" data-Htemplate="HeroWO.DOM.Controls">
        Toggle:
        <button type="button" class="anim">anim</button>
        <button type="button" class="grid">grid</button>
        <button type="button" class="pass">passable</button>
        <button type="button" class="path">pathfind</button>
        <button type="button" class="order">order</button>
        <button type="button" class="eff">effects</button>
        <button type="button" class="margin">margin</button>
        <button type="button" class="edge">edge</button>
        <button type="button" class="shroud">shroud</button>
        <button type="button" class="scale">scale</button>
        <button type="button" class="classic">classic</button>
        <button type="button" class="cgrid">grid</button>
        <button type="button" class="chlmove">move</button>
        <button type="button" class="chlhover">hover</button>
        <button type="button" class="spanim">spell</button>
        <button type="button" class="ccrinfo">info</button>
        <button type="button" class="ccreff">effects</button>
        <button type="button" class="log">log</button>
        <span class="map-size"></span>
        <span class="cur-pos"></span>
        <div class="cur-obj"></div>
        <div class="effects"></div>
      </script>

      <script type="text/html" data-Htemplate="HeroWO.DOM.Controls.Modification">
        <div class="sc">
          <div class="res">
            <button type="button" class="odel">del</button>

            <button type="button" data-Hresmap="+1date">+day</button>
            <button type="button" data-Hresmap="random">rand</button>
            <button type="button" data-Hresmap="turnLength">turn len</button>

            <p>
              <button type="button" data-Hresplayer="team">team</button>
              <button type="button" data-Hresplayer="maxLevel">max lv</button>
              <button type="button" data-Hresplayer="+5res">+res</button>
              <button type="button" data-Hresplayer="-3res">-res</button>
              <button type="button" data-Hresplayer="!host">host</button>
              <button type="button" data-Hresplayer="handicap">handic</button>
              <button type="button" data-Hresplayer="screen">screen</button>
              <button type="button" data-Hresplayer="victory">win</button>
              <button type="button" data-Hresplayer="loss">lose</button>
            </p>

            <p>
              <button type="button" data-Hresobject="owner">owner</button>
              <button type="button" data-Hresobject="+1000experience">+exp</button>
              <button type="button" data-Hresobject="artifacts">art</button>
              <button type="button" data-Hresobject="+1000actionPoints">+AP</button>
              <button type="button" data-Hresobject="-300actionPoints">-AP</button>
              <button type="button" data-Hresobject="+10spellPoints">+SP</button>
              <button type="button" data-Hresobject="-3spellPoints">-SP</button>
              <button type="button" data-Hresobject="+1combatCasts">casts</button>
              <button type="button" data-Hresobject="+10available">grow</button>
              <button type="button" data-Hresobject="+1listOrder">order</button>
              <button type="button" data-Hresobject="hasBuilt">built</button>
            </p>

            <p>
              <button type="button" data-Hresgarrison="+10count">gar +count</button>
              <button type="button" data-Hresgarrison="-3count">-count</button>
              <button type="button" data-Hresgarrison="+10hitPoints">+HP</button>
              <button type="button" data-Hresgarrison="-3hitPoints">-HP</button>
              <button type="button" data-Hresgarrison="+10shots">+shots</button>
              <button type="button" data-Hresgarrison="-3shots">-shots</button>
            </p>
          </div>

          <button type="button" class="sc-add">Add script</button>
          {{if connector}}
            <button type="button" data-Hwsdrop>WS drop</button>
          {{/if}}

          <p>
            Use your browser's console (F12) to execute arbitrary code.
          </p>

          <p>
            Available variables:
            <b>_</b> (<a href="https://squizzle.me/js/nodash" target="_blank">NoDash</a>),
            <b>$</b> (<a href="https://api.jquery.com" target="_blank">jQuery</a>),
            <!--https://XXX=doc/docs/map.html#Context-->
            <b>cx</b> (<a href="https://github.com/HeroWO-js/Core/blob/master/client/Context.js" target="_blank">Context</a>),
            <b>sc</b> (<a href="https://github.com/HeroWO-js/Core/blob/master/client/Screen.js" target="_blank">Screen</a>),
            <b>pl</b> (<a href="https://github.com/HeroWO-js/Core/blob/master/client/Map.js" target="_blank">Player</a>),
            <b>ui</b> (<a href="https://github.com/HeroWO-js/Core/blob/master/client/H3.DOM.UI.js" target="_blank">H3.DOM.UI</a>),
            <b>cm</b> (<a href="https://github.com/HeroWO-js/Core/blob/master/client/H3.DOM.Combat.js" target="_blank">H3.DOM.Combat</a>).
          </p>

          {{if scripts.length}}
            {{if scripts.permalink}}
              <p>
                Consider providing your users with the permalink URL rather than your origin's URL. It points to a HeroWO caching server that will serve your script even if the origin is down.
              </p>
            {{/if}}

            <table>
              {{for scripts}}
                <tr>
                  <td>
                    {{if m.permalink}}
                      <a href="{{ m.permalink }}" target="_blank">Permalink</a>
                    {{/if}}
                    <a href="{{ m.url }}" target="_blank">{{ m.url }}</a>
                  </td>
                  <td>
                    {{if m.loading}}
                      Loading…
                    {{elseif m.permanent}}
                      No <b>start()</b> and/or <b>stop()</b>
                    {{else}}
                      <button type="button" data-Hsreload="{{ m.url }}">Reload</button>
                      <button type="button" data-Hsdelete="{{ m.url }}">Delete</button>
                      {{if m.started}}
                        <button type="button" data-Hsstop="{{ m.url }}">Stop</button>
                      {{else}}
                        <button type="button" data-Hsstart="{{ m.url }}">Start</button>
                      {{/if}}
                    {{/if}}
                  </td>
                </tr>
              {{/for}}
            </table>
          {{/if}}

          <table class="trans">
            <tr>
              <td colspan="8">
                <button type="button" data-Htrclear>Clear deleted transitions</button>
              </td>
            </tr>
            {{for transitions}}
              <tr class="
                    {{if m._deleted}}deleted{{/}}
                    {{if m._view.playing}}playing{{/}}
                    {{if m._view.aborting}}aborting{{/}}
                  ">
                <th>
                  {{ m._key }}
                  {{if m._view._playOrder}}
                    #{{ m._view._playOrder }}
                  {{/if}}
                  {{if m._outOfOrder}}!!!{{/if}}
                </th>
                <td>{{ m.type }}</td>
                <td>
                  {{if m._view.parallel}}
                    ||{{ m._view.parallel }}
                  {{/if}}
                </td>
                <td>
                  {{if m.final}}
                    <b>F</b>
                  {{/if}}
                  {{if m.collect != null}}
                    {{ m.collect }}C
                  {{/if}}
                  {{if m.ticks != 1}}
                    {{ m.ticks }}T
                  {{/if}}
                </td>
                <td>{{ m.active }}A</td>
                <td>{{ m._screens }}</td>
                <td>{{ m._view.channel }}</td>
                <td>
                  <button type="button"
                          data-Htrlog="{{if m._deleted}}d{{/}}{{ m._key }}">
                    Log
                  </button>
                  {{if m._view && m.final && !m._view.aborting && !m._view.ending}}
                    <button type="button" data-Htrabort="{{ m._key }}">
                      Abort
                    </button>
                  {{/if}}
                </td>
              </tr>
            {{/for}}
          </table>
        </div>

        <div class="eff">
          <button type="button" class="eff-copy">Copy effects</button>
          <button type="button" class="eff-delete">Delete</button>
          <button type="button" class="eff-add">Create:</button>

          <textarea>{{ effectCode }}</textarea>

          <table>
            <tr>
              <th>n</th>
              <th>target</th>
              <th>source</th>
              <th>label</th>
              <th>encL</th>
              <th>ifObject</th>
              <th>ifBonusO</th>
              <th></th>
            </tr>
            {{for effects}}
              {{if m._cut && i}}
                <tr>
                  <td colspan="8">---</td>
                </tr>
              {{/if}}
              <tr>
                <th>{{ m._n }}</th>
                <td>{{ m._targetText }}</td>
                <td>{{ m._sourceText }}</td>
                <td>{{ m.label }}</td>
                <td>{{ m.encounterLabel }}</td>
                <td>{{ m.ifObject }} {{ m._ifObjectType }}</td>
                <td>{{ m.ifBonusObject }}</td>
                <td>
                  <button type="button" data-Hedelete="{{ m._n }}">Delete</button>
                  <button type="button" data-Hedeled="{{ m._n }}">...and edit</button>
                  <button type="button" data-Heedit="{{ m._n }}">Edit</button>
                  <button type="button" data-Heemb="{{ m._n }}">Embed</button>
                </td>
              </tr>
            {{/for}}
          </table>
        </div>
      </script>

      <script type="text/html" data-Htemplate="HeroWO.Chat.DOM.Rooms">
        <span class="Hchat-rooms__hide Hh3-menu__text11">{{ T:mainMenu Hide }}</span>

        {{for rooms}}
          <span data-Hroom="{{ m.key }}"
                class="Hchat-rooms__tab Hh3-menu__text9
                       Hchat-rooms__tab_cur_{{if m.current}}yes{{else}}no{{/}}
                       Hchat-rooms__tab_alert_{{if m.alert}}yes{{else}}no{{/}}
                       Hchat-rooms__tab_empty_{{if m.empty}}yes{{else}}no{{/}}">
            {{ m.title }}
          </span>
        {{/for}}

        {{for extraLinks}}
          <a class="Hchat-rooms__tab Hchat-rooms__tab_extra Hh3-menu__text9"
             href="{{ m }}" target="_blank">
            {{ k }}</a>
        {{/for}}
      </script>

      <script type="text/html" data-Htemplate="HeroWO.Chat.DOM.Room">
        <div class="Hchat-room__msgs Hh3-menu__text11"></div>

        {{if rpc || sendURL}}
          <div class="Hchat-room__upload">
            <!-- ic_file_upload_48px.svg | http://google.github.io/material-design-icons/ | Apache License 2.0 -->
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M18 32h12V20h8L24 6 10 20h8zm-8 4h28v4H10z"/></svg>
            <input type="file" class="Hchat-room__file">
          </div>

          <textarea class="Hchat-room__write Hh3-menu__text11"
                    placeholder="{{ title }}"></textarea>

          <div class="Hchat-room__paste-wr Hh3-menu__text1">
            <span class="Hh3-menu__text11">
              <span title="Show chat window">F1</span>
              <span title="Hide chat window">Esc</span>
            </span>

            <span class="Hchat-room__paste Hchat-room__paste-sc">
              Screenshot
            </span>

            <span class="Hchat-room__paste Hchat-room__paste-spot">
              Map Spot
              <span class="Hchat-room__paste-spot-pos"></span>
            </span>
          </div>
        {{/if}}
      </script>

      <script type="text/html" data-Htemplate="HeroWO.Chat.DOM.Message">
        <b>{{ author }}:</b>

        {{if type == 'text'}}
          {{ = html }}
        {{else}}
          <!-- target=_blank needed for IE who doesn't understand download. -->
          <a href="{{ data.data }}" target="_blank"
             {{if type != 'image'}}download="{{ data.name }}"{{/}}>
            {{if type == 'image'}}
              <img src="{{ data.data }}" alt="{{ data.name }}"
                   width="{{ width }}" height="{{ height }}">
            {{/if}}
            <!-- ic_file_download_48px.svg | http://google.github.io/material-design-icons/ | Apache License 2.0 -->
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M38 18h-8V6H18v12h-8l14 14 14-14zM10 36v4h28v-4H10z"/></svg>{{ data.name }}</a>
        {{/if}}
      </script>

      <script type="text/html" data-Htemplate="HeroWO.H3.DOM.MainMenu">
        <div class="Hh3-menu__screen Hh3-menu-s">
          <span class="Hh3-menu-s__sect"></span>
          <span class="Hh3-menu-s__grave"></span>
          <span class="Hsfx__btn MHh3-btn_id_MMENUNG Hh3-btn_hov Hh3-menu-s__btn Hh3-menu-s__new"></span>
          <span class="Hsfx__btn MHh3-btn_id_MMENULG Hh3-btn_hov Hh3-menu-s__btn Hh3-menu-s__load"></span>
          <span class="Hsfx__btn MHh3-btn_id_MMENUHS Hh3-btn_hov Hh3-menu-s__btn Hh3-menu-s__hisc"></span>
          <span class="Hsfx__btn MHh3-btn_id_MMENUCR Hh3-btn_hov Hh3-menu-s__btn Hh3-menu-s__cred"></span>
          <span class="Hsfx__btn MHh3-btn_id_MMENUQT Hh3-btn_hov Hh3-menu-s__btn Hh3-menu-s__quit"></span>
          <span class="Hsfx__btn MHh3-btn_id_GTSINGL Hh3-btn_hov Hh3-menu-s__btn Hh3-menu-s__single"></span>
          <span class="Hsfx__btn MHh3-btn_id_GTMULTI Hh3-btn_hov Hh3-menu-s__btn Hh3-menu-s__multi"></span>
          <span class="Hsfx__btn MHh3-btn_id_GTCAMPN Hh3-btn_hov Hh3-menu-s__btn Hh3-menu-s__camp"></span>
          <span class="Hsfx__btn MHh3-btn_id_GTTUTOR Hh3-btn_hov Hh3-menu-s__btn Hh3-menu-s__tut"></span>
          <span class="Hsfx__btn MHh3-btn_id_GTBACK  Hh3-btn_hov Hh3-menu-s__btn Hh3-menu-s__back"></span>
          <div class="Hh3-menu-s__logo"></div>
          <div class="Hh3-menu-s__roll-wr">
            <div class="Hh3-menu-s__roll">
<b>HeroWO Engine</b>
Proger_XP
www.proger.me

<b>***</b>

Original Game Credits
<b>Heroes of Might and Magic III &reg;</b>
The Shadow of Death

<!-- From CREDITS.TXT in SoD's *.lod. -->
<b>Created By:</b>
Jon Van Caneghem



<b>Executive Producer:</b>
Mark Caldwell



<b>Producer:</b>
Jeff Blattner



<b>Director:</b>
David Mullich


<b>Associate Director:</b>
Christian Vanover


<b>Designers:</b>
Jennifer Bullard
Gregory Fulton
Jon Van Caneghem


<b>Lead Programmers:</b>
John Bolton
David Richey


<b>Programmers:</b>
Mark Caldwell
John Krause
Jeff Leggett
George Ruof
Gus Smedstad


<b>Lead Artists:</b>
Joseph McGuffin
Phelan Sykes


<b>Artists:</b>
George Almond
Jeff Bigman
Fernando Castillo
Rebecca Christel
Brian DeMetz
John E. Gibson IV
Louis Henderson
Edward Hudson
Tracy Iwata
Steve Jasper
Brian Kemper
April Lee
Bonita Long-Hemsath
Adam McCarthy
Kurt McKeever
Nowa Morisaku
Kenneth Thomson, Jr.
Tony Rizo
Bill Stoneham
Julia Ulano
Steve Wasaff
Scott White
Charles Zilm


<b>Asset Coordinator:</b>
Jack Russell


<b>Level Designers:</b>
Benjamin Bent
Dave Botan
Ryan Den
Walter Johnson
Marcus Pregent
Christian Vanover
Lisa Whitman
Mike Wolf


<b>Music Producer:</b>
Rob King


<b>Town Themes:</b>
Paul Romero


<b>Music:</b>
Paul Romero
Rob King
Steve Baca


<b>Sound Design:</b>
Rob King
Steve Baca
Chuck Russom


<b>Voice Production:</b>
Rob King
Green Street Studios
South Pasadena, Ca.


<b>Voice Talent:</b>
Catherine Battistone
Aric Devone
Mari Devon
Richard Epcar
Danny Fehsenfeld
Lex Lang
Wendee Lee
Laird Macintosh
Sy Prescott
Mike Sorich
Dan Woren


<b>Lead Tester:</b>
Karl Drown


<b>Testers:</b>
Jesse Anacleto
Mary Ellen Babson
Devin Chapman
William Choulos
John Cloud
Gavan Cook
Karl Fischer
Ernie Gallardo
Benjamin Goldhammer
Rich Holmes
Yoshiyuki Maeda
Lance Page
Bryce Verdier
Eric Williamson
Sean Wyman
Thomas Zeliff


<b>Special Thanks:</b>
Cyberlore Studios
Hypnotix
Equinoxe
Rad Game Tools
Sonic Foundry
Sound Forge
Soundscape
Riki Corredera
John Machin
Scott McDaniel
Michele Mitchel
John Slowsky


<b>Webmaster:</b>
Joshua “Guthwulf” Milligan


<b>Web Artist:</b>
Aaron Castro


<b>Web Programmers:</b>
Robert Belknap
Peter Hillier


<b>Visit us on the Web:</b>
www.3do.com
            </div>
          </div>
          <div class="Hh3-menu-s__copy">
            {{ T:mainMenu Copyright 2000, The 3DO Company. All Rights Reserved. 3DO, Heroes, Heroes of Might and Magic, New World Computing, The Shadow of Death, and their respective logos are trademarks and/or service marks of The 3DO Company in the U.S. and other Countries. All other trademarks belong to their respective owners. New World Computing is a division of The 3DO Company. }}
          </div>
        </div>

        <div class="Hh3-menu__screen Hh3-menu-ns Hh3-menu-nm Hh3-menu-ls
                    Hh3-menu-lm Hh3-menu-ss Hh3-menu-sm">
          <div class="Hh3-menu-ns__right"></div>

          <div class="Hh3-menu-ns__left Hh3-menu-ns__list-wr">
            <span class="Hh3-menu__text1 Hh3-menu-ns__p16">
              {{ T:mainMenu Select a Scenario to Play }}
            </span>

            <label class="Hh3-menu__text1 Hh3-menu-ns__p17">
              {{if classic}}
                {{ T:mainMenu Map Sizes }}
              {{else}}
                <input class="Hh3-menu-ns__mfl" type="checkbox" {{if flat}}checked{{/}}>
                {{ T:mainMenu Flat Folder }}
              {{/if}}
            </label>

            <span class="Hsfx__btn MHh3-btn_id_SCSMBUT Hh3-menu-ns__s-btn {{if !classic}}{{cur mapSize == 's'}}{{/}}" data-Hsize="s"></span>
            <span class="Hsfx__btn MHh3-btn_id_SCMDBUT Hh3-menu-ns__s-btn {{if !classic}}{{cur mapSize == 'm'}}{{/}}" data-Hsize="m"></span>
            <span class="Hsfx__btn MHh3-btn_id_SCLGBUT Hh3-menu-ns__s-btn {{if !classic}}{{cur mapSize == 'l'}}{{/}}" data-Hsize="l"></span>
            <span class="Hsfx__btn MHh3-btn_id_SCXLBUT Hh3-menu-ns__s-btn {{if !classic}}{{cur mapSize == 'xl'}}{{/}}" data-Hsize="xl"></span>
            <span class="Hsfx__btn MHh3-btn_id_SCALBUT Hh3-menu-ns__s-btn {{if !classic}}{{cur !mapSize}}{{/}}" data-Hsize=""></span>

            <span class="Hsfx__btn MHh3-btn_id_SCBUTT1 Hh3-menu-ns__t-btn {{if !classic}}{{cur sort == 'playerCount'}}{{/}}" data-Hcol="playerCount"></span>
            <span class="Hsfx__btn MHh3-btn_id_SCBUTT2 Hh3-menu-ns__t-btn {{if !classic}}{{cur sort == 'width'}}{{/}}" data-Hcol="width"></span>
            <span class="Hsfx__btn MHh3-btn_id_SCBUTCP Hh3-menu-ns__t-btn {{if !classic}}{{cur sort == 'origin'}}{{/}}" data-Hcol="origin"></span>
            <span class="Hsfx__btn MHh3-btn_id_SCBUTT3 Hh3-menu-ns__t-btn {{if !classic}}{{cur sort == 'title'}}{{/}}" data-Hcol="title"></span>
            <span class="Hsfx__btn MHh3-btn_id_SCBUTT4 Hh3-menu-ns__t-btn {{if !classic}}{{cur sort == 'victoryType'}}{{/}}" data-Hcol="victoryType"></span>
            <span class="Hsfx__btn MHh3-btn_id_SCBUTT5 Hh3-menu-ns__t-btn {{if !classic}}{{cur sort == 'lossType'}}{{/}}" data-Hcol="lossType"></span>
          </div>

          <div class="Hh3-menu-ns__left Hh3-menu-ns__opt-wr">
            <span class="Hh3-menu__text1 Hh3-menu-ns__p22">
              {{ T:mainMenu Player Name }}
            </span>
            <span class="Hh3-menu__text1 Hh3-menu-ns__p23">
              {{ T:mainMenu Handicap Type }}
            </span>
            <span class="Hh3-menu__text1 Hh3-menu-ns__p24">
              {{ T:mainMenu Starting Town }}
            </span>
            <span class="Hh3-menu__text1 Hh3-menu-ns__p25">
              {{ T:mainMenu Starting Hero }}
            </span>
            <span class="Hh3-menu__text1 Hh3-menu-ns__p26">
              {{ T:mainMenu Starting Bonus }}
            </span>

            <span class="Hh3-menu__text1 Hh3-menu-ns__p20">
              {{ T:mainMenu Player Turn Duration }}
            </span>
          </div>

          <!-- Right panel's contents -->
          <span class="Hsfx__btn Hh3-menu-ns__btn MHh3-btn_id_GSPBUTT Hh3-menu__text3 Hh3-menu-ns__t-list">
            {{ T:mainMenu Show Available Scenarios }}
          </span>

          <span class="Hh3-menu-ns__mdi Hh3-menu-ns__mdi_dim_{{ map.sizeType }}"></span>
          <span class="Hh3-menu__text1 Hh3-menu-ns__p1">
            {{if mapMap}}
              {{ T:mainMenu Scenario Name: }}
            {{/if}}
          </span>
          <span class="Hh3-menu__text2 Hh3-menu-ns__p10">
            {{if map.mapTitle}} {{ map.mapTitle }} {{else}} {{ map.title }} {{/}}
          </span>

          <span class="Hh3-menu__text1 Hh3-menu-ns__p2">
            {{if mapMap}}
              {{ T:mainMenu Scenario Description: }}
            {{/if}}
          </span>
          <span class="Hh3-menu__text3 Hh3-menu-ns__p11">
            {{if map.classic}}
              <span class="Hh3-menu__text9">{{ T:mainMenu Classic }}</span>
              <br>
            {{/if}}
            {{if canChange}}
              <span class="Hh3-menu__text9 Hh3-menu__t-desc">{{ T:mainMenu Change }}</span>
            {{/if}}
            {{ = descriptionHTML }}
            {{if mapMap}}
              <span class="Hh3-menu__text9">{{ map.id5 }}&nbsp;R{{ map.revision }}</span>
            {{/if}}
            {{if map.fileName}}
              <!-- A saved game. -->
              <br>
              <span class="Hh3-menu__text9 Hh3-menu__t-del">{{ T:mainMenu Delete This Save }}</span>
            {{/if}}
          </span>

          {{if mapMap}}
            <span class="Hh3-menu__text1 Hh3-menu-ns__p3">
              {{ T:mainMenu Victory Condition: }}
            </span>
            <span class="Hh3-menu-ns__vci Hh3-menu-sli__victory_type_{{ map.victoryType }}"></span>
            <span class="Hh3-menu__text3 Hh3-menu-ns__p12">
              {{ map.victoryText }}
            </span>
            <span class="Hh3-menu__text1 Hh3-menu-ns__p4">
              {{ T:mainMenu Loss Condition: }}
            </span>
            <span class="Hh3-menu-ns__lci Hh3-menu-sli__loss_type_{{ map.lossType }}"></span>
            <span class="Hh3-menu__text3 Hh3-menu-ns__p13">
              {{ map.lossText }}
            </span>

            <span class="Hh3-menu__text3 Hh3-menu-ns__p5">
              {{ T:mainMenu Allies: }}
            </span>
            <span class="Hh3-menu__text3 Hh3-menu-ns__p6">
              {{ T:mainMenu Enemies: }}
            </span>

            <span class="Hh3-menu__text1 Hh3-menu-ns__p7">
              {{ T:mainMenu Map Diff: }}
            </span>
            <span class="Hh3-menu__text1 Hh3-menu-ns__p8">
              {{ T:mainMenu Player Difficulty: }}
            </span>
            <span class="Hh3-menu__text1 Hh3-menu-ns__p9">
              {{ T:mainMenu Rating:: }}
            </span>
            <span class="Hh3-menu__text3 Hh3-menu-ns__p14">
              {{ map.difficultyText }}
            </span>

            {{if:not options}}
              <!-- SoD allows customizing difficulty mode without opening Advanced Options. XXX=I -->
              <span class="Hsfx__btn MHh3-btn_id_GSPBUT3 Hh3-menu-ns__d-btn {{if map.difficultyMode == 0}}Hh3-btn_cur{{else}}Hh3-btn_dis{{/}}" data-Hdiff="0"></span>
              <span class="Hsfx__btn MHh3-btn_id_GSPBUT4 Hh3-menu-ns__d-btn {{if map.difficultyMode == 1}}Hh3-btn_cur{{else}}Hh3-btn_dis{{/}}" data-Hdiff="1"></span>
              <span class="Hsfx__btn MHh3-btn_id_GSPBUT5 Hh3-menu-ns__d-btn {{if map.difficultyMode == 2}}Hh3-btn_cur{{else}}Hh3-btn_dis{{/}}" data-Hdiff="2"></span>
              <span class="Hsfx__btn MHh3-btn_id_GSPBUT6 Hh3-menu-ns__d-btn {{if map.difficultyMode == 3}}Hh3-btn_cur{{else}}Hh3-btn_dis{{/}}" data-Hdiff="3"></span>
              <span class="Hsfx__btn MHh3-btn_id_GSPBUT7 Hh3-menu-ns__d-btn {{if map.difficultyMode == 4}}Hh3-btn_cur{{else}}Hh3-btn_dis{{/}}" data-Hdiff="4"></span>
            {{/if}}

            <span class="Hh3-menu__text3 Hh3-menu-ns__p15 Hh3-menu-ns__rating">
              {{ ratingText }}
            </span>
          {{/if}}

          {{if canOptions}}
            <span class="Hsfx__btn Hh3-menu-ns__btn MHh3-btn_id_GSPBUTT Hh3-menu__text3 Hh3-menu-ns__t-opt">
              {{ T:mainMenu Show Advanced Options }}
            </span>
          {{/if}}

          {{if canBegin}}
            <span class="Hsfx__btn MHh3-btn_id_{{if _.startsWith(screen, 'save')}}SCNRSAV{{elseif _.startsWith(screen, 'load')}}SCNRLOD{{else}}SCNRBEG{{/}} Hh3-menu-ns__begin"></span>
          {{/if}}

          <span class="Hsfx__btn MHh3-btn_id_SCNRBACK Hh3-menu-ns__back"></span>
        </div>
      </script>

      <script type="text/html" data-Htemplate="HeroWO.H3.DOM.MainMenu.ScenarioList.Map">
        <td class="Hh3-menu-sli__playerCount">
          {{if date}}
            <!-- A saved game. -->
            {{ date + 1 }} {{ T:mainMenu d. }}
          {{else}}
            {{ playerCount }}/{{ humanCount }}
          {{/if}}
        </td>
        <td class="Hh3-menu-sli__size">{{ sizeText }}</td>
        <td class="Hh3-menu-sli__origin Hh3-menu-sli__origin_id_{{ origin }}"></td>
        <td class="Hh3-menu-sli__title">
          <div class="Hh3-menu-sli__title-wrap">{{ title }}</div>
        </td>
        <td class="Hh3-menu-sli__victory Hh3-menu-sli__victory_type_{{ victoryType }}"></td>
        <td class="Hh3-menu-sli__loss Hh3-menu-sli__loss_type_{{ lossType }}"></td>
      </script>

      <script type="text/html" data-Htemplate="HeroWO.H3.DOM.MainMenu.ScenarioList.Special">
        <td class="Hh3-menu-sli__playerCount"></td>
        <td class="Hh3-menu-sli__size"></td>
        <td class="Hh3-menu-sli__origin Hh3-menu-sli__origin_id_{{ icon }}"></td>
        <td class="Hh3-menu-sli__title">{{ title }}</td>
        <td class="Hh3-menu-sli__victory"></td>
        <td class="Hh3-menu-sli__loss"></td>
      </script>

      <script type="text/html" data-Htemplate="HeroWO.H3.DOM.MainMenu.ScenarioList.Folder">
        <td class="Hh3-menu-sli__playerCount">{{ count }}</td>
        <td class="Hh3-menu-sli__size"></td>
        <td class="Hh3-menu-sli__origin Hh3-menu-sli__origin_id_folder{{if goUp}}-up{{/}}"></td>
        <td class="Hh3-menu-sli__title">
          <div class="Hh3-menu-sli__title-wrap">{{ title }}</div>
        </td>
        <td class="Hh3-menu-sli__victory"></td>
        <td class="Hh3-menu-sli__loss"></td>
      </script>

      <script type="text/html" data-Htemplate="HeroWO.H3.DOM.MainMenu.PlayerOptions">
        <!-- Visually part of the right panel. -->
        <span class="Hsfx__btn MHh3-btn_id_GSPBUT3 Hh3-menu-ns__d-btn" data-Hdiff="0"></span>
        <span class="Hsfx__btn MHh3-btn_id_GSPBUT4 Hh3-menu-ns__d-btn" data-Hdiff="1"></span>
        <span class="Hsfx__btn MHh3-btn_id_GSPBUT5 Hh3-menu-ns__d-btn" data-Hdiff="2"></span>
        <span class="Hsfx__btn MHh3-btn_id_GSPBUT6 Hh3-menu-ns__d-btn" data-Hdiff="3"></span>
        <span class="Hsfx__btn MHh3-btn_id_GSPBUT7 Hh3-menu-ns__d-btn" data-Hdiff="4"></span>

        <div class="Hh3-menu-ns__options-header"></div>
        <div class="Hh3-menu-plo"></div>

        <span class="Hh3-menu__text3 Hh3-menu-ns__p21 Hh3-menu-ns__tl"></span>
      </script>

      <script type="text/html" data-Htemplate="HeroWO.H3.DOM.MainMenu.PlayerOptions.Header">
        <span class="Hh3-menu__text2 Hh3-menu-ns__p18">
          {{if pin}}
            {{if private}}
              {{if editable}}
                <span class="Hh3-menu-ns__lobby-priv">
                  {{ T:mainMenu Private }}</span>
              {{else}}
                {{ T:mainMenu Private }}
              {{/if}}
            {{else}}
              {{if editable}}
                <span class="Hh3-menu-ns__lobby-pub">
                  {{ T:mainMenu Public }}</span>
              {{else}}
                {{ T:mainMenu Public }}
              {{/if}}
            {{/if}}
            {{ T:mainMenu Lobby }}
            {{ T:mainMenu (PIN: }}
            {{if editable}}
              <span class="Hh3-menu-ns__lobby-pin">
                {{ pin }}</span>)
            {{else}}
              {{ pin }})
            {{/if}}
          {{else}}
            {{ T:mainMenu Advanced Options }}
          {{/if}}
        </span>

        <span class="Hh3-menu__text3 Hh3-menu-ns__p19">
          {{if pin}}
            {{ myself }}
            <br>
            {{if host}}
              {{ T:mainMenu Click on flags to arrange players }}
            {{else}}
              {{ T:mainMenu Ask the host via chat to change players }}
            {{/if}}
          {{else}}
            {{ T:mainMenu Select starting options, handicap, and name for each player in the game. }}
          {{/if}}
        </span>
      </script>

      <script type="text/html" data-Htemplate="HeroWO.H3.DOM.MainMenu.PlayerOptions.Item">
        <div class="Hsfx__btn Hh3-menu-plo__flag"></div>
        <div class="Hh3-menu-plo__controller Hh3-menu__text3"></div>
        <div class="Hh3-menu-plo__controllers-wr Hh3-menu__text5">
          <div class="Hh3-menu-plo__controllers"></div>
        </div>
        <div class="Hh3-menu-plo__handicap Hh3-menu__text3"></div>
        <div class="Hh3-menu-plo__town Hh3-menu__text5"></div>
        <div class="Hh3-menu-plo__hero Hh3-menu__text5"></div>
        <div class="Hh3-menu-plo__bonus Hh3-menu__text5"></div>
      </script>
    </div>
  </body>
</html>