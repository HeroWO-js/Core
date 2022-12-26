<?php
$this->mediaPath = __DIR__.'/noXXXep.';
$readOnly = $this->readOnly = !is_writable(__FILE__);
if ($this->readOnly) {
  $this->cacheFile = sys_get_temp_dir().'/'.$this->cacheFile;
  $this->tempFile  = sys_get_temp_dir().'/'.random_int(0, PHP_INT_MAX);
}
$this->rootPath = '..';
$this->title = 'HeroWO';
$this->directoryMatcher = function ($full, $rel) use ($readOnly) {
  static $skip = [
    'client/r.js',
    'databank/h3m2json/references',
    'noXXXep',
    'server/node_modules',
  ];
  $readOnly and $skip[] = 'server';
  return basename($rel) !== '.git' and !in_array(str_replace('\\', '/', $rel), $skip);
};
$this->fileRE = '//';
$this->tagNames = [
  'B' => 'Bug. Just. Bug',
  'R' => 'Refactor: improve code quality',
  'RH' => 'Refactor hardcoded/private',
  'O' => 'Optimize code performance',
  'I' => 'Implement or is (in)complete',
  'ID' => 'Incomplete databank data',
  'C' => 'Check compatibility with HoMM',
  'IC' => 'Improve compatibility',
  'COMPATIBILITY' => 'COMPATIBILITY with HoMM',
];
$this->groupNames = [
  'ART' => 'ARTifact',
  'BLD' => 'Building in town',
  'CR' => 'CReature',
  'SP' => 'SPell',
  'SK' => 'SKill of hero',
  'OBJ' => 'OBJect on adv. map',
];
$this->fileURL = function ($file, $task) {
  $path = strtr(key($file->paths), '\\', '/');
  if (!strncmp($path, 'client/nodash/', 14) or
      !strncmp($path, 'client/PathAnimator/', 20) or
      !strncmp($path, 'client/r.js/', 12) or
      !strncmp($path, 'client/sqimitive/', 17) or
      !strncmp($path, 'Phiws/', 6)) {
    return;
  } elseif (!strncmp($path, 'databank/h3m2json/', 18)) {
    $url = 'https://github.com/HeroWO-js/h3m2json';
    $path = substr($path, 18);
  } else {
    $url = 'https://github.com/HeroWO-js/Core';
  }
  return "$url/blob/master/$path".
         '#L'.($task->startLine + 1).
         ($task->startLine === $task->endLine ? '' : '-L'.($task->endLine + 1));
};
