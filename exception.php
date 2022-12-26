<?php
require __DIR__.'/core.php';

// ['name' => 'TypeError', ...]
$exception = json_decode($_REQUEST['exception'], true);

mailAdmin('exception', 'Exception: '.($exception['name'] ?? ''),
          var_export($exception, true));

http_response_code(204);