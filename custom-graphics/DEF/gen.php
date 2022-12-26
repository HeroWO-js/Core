<?php
  foreach (['CS', 'RM', 'TW', 'IN', 'NC', 'DN', 'ST', 'FR', 'EL'] as $short) {
    foreach (['WA6', 'WA4', 'WA3', 'WA1', 'DRW', 'MOAT'] as $name) {
      if ($short.$name === 'TWMOAT') { continue; }
      $name = "SG$short$name";
      ob_start();
?>
[Data]
Type=2
Pictures Extension=<?=base_convert(mt_rand(0, 46655), 10, 36), PHP_EOL?>
Def Path Check=0
Lod Path Check=0
Def Path=C:\Program Files\3DO\Heroes3\custom\_<?=$name?>.def
Lod Path=
Bitmaps Check=0
Bitmaps Lod Check=0
Bitmaps Path=
Bitmaps Lod Path=
Standard Special Colors=0
Generate Mask Files=0
Frames Dir=
Shadow Dir=
; H3DefTool erroneously puts yellow outline on both shadow and image which trips
; def2png.php. Trench isn't interactive anyway.
Generate Selection=<?=(int) (substr($name, -4) !== 'MOAT'), PHP_EOL?>
Delete Contained Shadow=0
Faint Shadow=0
Shadow Type=0
Shadow Shift X=0
Shadow Shift Y=0
ColorsBox.AutoTransparent=0
ColorsBox.Colors=$FFFF00|$FF96FF|$FF64FF|$FF32FF|$FF00FF|$00FFFF|$FF00B4|$00FF00|
ColorsBox.ColorChecks=1|0|0|0|0|0|0|0|0|
ColorsBox.PlayerColors=$401F13|$4F2618|$552819|$5A2C1D|$632F1D|$69321F|$6D3320|$6D3420|$653828|$6E3420|$713521|$713622|$733622|$733722|$743722|$773823|$773923|$793923|$793A24|$7B3A24|$7D3B24|$7F3C25|$823D26|$833F27|$864027|$724232|$8B4128|$824A37|$90452A|$9C4B2F|$905B49|$A37A6C|
ColorsBox.Tolerance=0
ShadowColorsBox.AutoTransparent=0
ShadowColorsBox.Colors=$FFFF00|$FF96FF|$FF64FF|$FF32FF|$FF00FF|$00FFFF|$FF00B4|$00FF00|
ShadowColorsBox.ColorChecks=1|1|1|1|1|1|1|1|
Groups Number=22
<?php if (substr($name, -4) === 'MOAT') {?>
Group1=C:\Program Files\3DO\Heroes3\SG\<?=$name?>.bmp|
Group2=C:\Program Files\3DO\Heroes3\SG\<?=$name?>.bmp|
Group12=C:\Program Files\3DO\Heroes3\SG\<?=$name?>.bmp|
<?php } elseif (substr($name, -3) === 'DRW') {?>
Group1=C:\Program Files\3DO\Heroes3\SG\<?=$name?>2.bmp|
Group2=C:\Program Files\3DO\Heroes3\SG\<?=$name?>2.bmp|
Group5=C:\Program Files\3DO\Heroes3\SG\<?=$name?>3.bmp|
Group20=C:\Program Files\3DO\Heroes3\SG\<?=$name?>1.bmp|
<?php } else {?>
<?php if ($name === 'SGFRWA4') {?>
Group5=<?=__DIR__."\\$name"?>3.bmp|
<?php } elseif ($name === 'SGTWWA1') {?>
Group3=<?=__DIR__."\\$name"?>2.bmp|
<?php } elseif ($name === 'SGTWWA4') {?>
Group1=<?=__DIR__."\\$name"?>1.bmp|
Group2=<?=__DIR__."\\$name"?>1.bmp|
<?php }?>
Group1=C:\Program Files\3DO\Heroes3\SG\<?=$name?>1.bmp|
Group2=C:\Program Files\3DO\Heroes3\SG\<?=$name?>1.bmp|
Group3=C:\Program Files\3DO\Heroes3\SG\<?=$name?>2.bmp|
Group5=C:\Program Files\3DO\Heroes3\SG\<?=$name?>3.bmp|
<?php
      }

      file_put_contents("_$name.hdl", ob_get_clean());
    }
  }