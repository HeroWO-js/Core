<?php
// Gathers and exposes some statistics about clients of this server.

require __DIR__.'/core.php';

$map = $_REQUEST['map'] ?? '';

$pdo = require 'api-db.php';
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$pdo->exec('
  CREATE TABLE IF NOT EXISTS s_online (
    ip VARCHAR(15) NOT NULL PRIMARY KEY,
    time INTEGER NOT NULL,
    map TEXT
  )
');

$args = [time(), $map, $_SERVER['REMOTE_ADDR']];
try {
  $pdo->prepare('INSERT INTO s_online (time, map, ip) VALUES (?, ?, ?)')
    ->execute($args);
} catch (PDOException $e) {
  $pdo->prepare('UPDATE s_online SET time = ?, map = ? WHERE ip = ?')
    ->execute($args);
}

if (!mt_rand(0, 100)) {
  $pdo->exec('DELETE FROM s_online WHERE time < '.(time() - 60));
}

$stmt = $pdo->prepare('SELECT COUNT(1) FROM s_online WHERE time > ?');
$stmt->execute([time() - 60]);
$onlineCount = (int) $stmt->fetchColumn();
$stmt->closeCursor();

$stmt = $pdo->prepare('SELECT map, COUNT(1) c FROM s_online WHERE map <> "" GROUP BY map HAVING c > 2 ORDER BY c DESC LIMIT 1');
$stmt->execute();
$popularMapText = urldecode(rtrim($stmt->fetchColumn(), '/'));
$stmt->closeCursor();

$lastForumURL = 'https://herowo.io/forum';
$lastForumText = '';    // XXX

header('Content-Type: application/json; charset=utf-8');
echo encodeJsonLine(compact('onlineCount', 'popularMapText', 'lastForumURL', 'lastForumText'));