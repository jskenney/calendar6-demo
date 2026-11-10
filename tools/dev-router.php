<?php
// Router for PHP's built-in server, for local development only:
//   php -S localhost:8000 tools/dev-router.php      (run from the course directory)
// It refuses what the .htaccess files refuse on Apache, so the front end is tested
// the way it is deployed: course material is only reachable through calendar/php/.
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
$deny = preg_match('#^/(class|lab|project|exam|pages|shared|config|tools|setup|SD321)(/|$)#', $path)
     || preg_match('#/\.#', $path)
     || preg_match('#\.(ini|md|sh)$#i', $path)
     || (preg_match('#\.(php\d*|phtml?|phar|inc)(/|$)#i', $path) && !preg_match('#^/calendar/php/[a-z]+\.php$#', $path));
if ($deny) {
    http_response_code(403);
    header('Content-Type: text/plain');
    echo "403 Forbidden\n";
    return true;
}
return false;
