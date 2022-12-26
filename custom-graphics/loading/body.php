<?php
  // CWD and context = those of index.php.

  $mainColor = sprintf('%03b', mt_rand(1, 7));

  $color = function ($white, $black = '00') use ($mainColor) {
    return strtr($mainColor, [$black, $white]);
  };

  $image = array_rand(array_flip(glob('custom-graphics/loading/images/*.png')));
?>

<style>
  .HLb_ {
    background: black;
  }

  #loading,
  .HLbt,
  .HLbb,
  .HLgo,
  .HLi,
  .HLt {
    position: fixed;
    left: 0;
    right: 0;
  }

  .Hweb-top__menu {
    text-align: right;
    position: relative;   /* overlay #loading */
  }

  .Hweb-top__menu-label span,
  .Hweb-top__menu:not(:hover) .Hweb-top__menu-list {
    display: none;
  }

  .Hweb-top__menu,
  .Hweb-top__menu a {
    color: #<?=$color('FF', 'AA')?>;
  }

  body:not(.HLb_) .Hcx {
    <?php
      // For some reason, transition doesn't work here - target z-index is applied immediately as soon as HLb_ is removed.
      //
      // Changing z-index here rather than in JS produces smoother effect in sync with the browser's animation of #loading.
    ?>
    animation: .75s step-end Hcx-zIndex;
  }

  @keyframes Hcx-zIndex {
    from { z-index: -1; }
  }

  #loading {
    top: 0;
    bottom: 0;
    <?php
      // We could do with clip-path alone but need visibility for IE and FF < 54 that don't support clip-path (IE) or <basic-shape> (FF supports SVG early but it's not animatable). @supports for .HLbt/.HLbb is present to improve the visuals somewhat for these browsers.
    ?>
    transition: .75s clip-path, .75s visibility;
    clip-path: inset(50% 0);
  }

  .HLb_ #loading {
    clip-path: inset(0);
  }

  #loading,
  .HLbt,
  .HLbb {
    visibility: hidden;
  }

  @supports (clip-path: inset(0)) {
    .HLbt,
    .HLbb {
      height: 1px;
      background: #<?=$color('FF')?>;
      top: 50%;
      opacity: .2;
      transition: .75s top, .75s linear opacity, .75s visibility;
    }
  }

  .HLb_ .HLbt {
    top: 0;
  }

  .HLb_ .HLbb {
    top: calc(100% - 1px);
  }

  .HLb_ #loading,
  .HLb_ .HLbt,
  .HLb_ .HLbb {
    opacity: 1;
    visibility: visible;
  }

  .HLi, .HLt {
    filter: drop-shadow(1px 1px #<?=$color('FF')?>)
            drop-shadow(-1px -1px #<?=$color('80')?>);
  }

  .HLi {
    top: 0;
    bottom: 7.25vw;
    background: no-repeat 50%/contain;
    -ms-interpolation-mode: nearest-neighbor;
    image-rendering: -webkit-optimize-contrast;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    image-rendering: -moz-crisp-edges;
  }

  #loadingStatic {
    background-image: url(data:image/gif;base64,<?=base64_encode(file_get_contents(substr($image, 0, -3).'gif'))?>);
  }

  .HLb_animated .HLgo {
    top: 67vh;
    bottom: 0;
    border-top: 1px solid #<?=$color('60')?>;
    background: linear-gradient(0deg, black, #<?=$color('40')?>99);
  }

  .HLt {
    bottom: 0;
    text-align: center;
    font: 7vw PixelEmulator, monospace;
    animation: 1s infinite linear alternate loading-text;
  }

  @keyframes loading-text {
    from { color: #<?=$color('B0')?>; }
    to   { color: #<?=$color('90')?>; }
  }

  /* https://www.pixelsagas.com/?download=pixel-emulator */
  @font-face {
    font-family: PixelEmulator;
    src: url(data:application/font-woff;base64,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);
  }
</style>

<div id="loading">
  <div class="HLgi"></div>
  <div class="HLgo"></div>

  <?php foreach (range(1, mt_rand(3, 7)) as $i) {?>
    <div class="HLp"
         style="font-size: <?=mt_rand(1, 20) / 10?>px; background: #<?=$color(mt_rand(2, 7).'0')?>; animation-duration: <?=mt_rand(3, 8)?>s; animation-delay: -<?=mt_rand(0, 10)?>s"></div>
  <?php }?>

  <div class="HLi" id="loadingStatic"></div>
  <div class="HLi" id="loadingAnimation"></div>

  <?php
    // Relying on JS to hide the static placeholder once animation is ready and at the same time (even if the former could be somehow achieved with CSS) keep static if JS is off.
  ?>
  <script>
    document.write('<div class="HLt">LOADING</div>')

    var ImG = new Image
    ImG.src = <?=escapeHtmlScriptJSON(encodeJsonLine($image)), "\n"?>
    ImG.onload = function () {
      if (window.loadingAnimation) {    // #loading removed by Entry.Browser.js
        loadingAnimation.style.backgroundImage = 'url(' + ImG.src + ')'
        document.body.classList.replace('HLb_static', 'HLb_animated')
        loadingStatic.parentNode.removeChild(loadingStatic)
      }
    }
  </script>
</div>

<div class="HLbt"></div>
<div class="HLbb"></div>
