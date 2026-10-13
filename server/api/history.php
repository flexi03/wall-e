<?php
// Ladeverlauf der Wallbox aus dem go-e Export (data.v3.go-e.io/api/v1/direct_json).
// POST {link, from?, to?, timezone?}. "link" ist der Export-Link der Wallbox (Status-Feld "dll"),
// aus dem nur der Zugangsschlüssel "e" übernommen wird. Die Zieladresse baut der Server selbst.
require __DIR__ . '/goe.php';

handle_cors_and_method();

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) {
    send_json(400, ['error' => 'Ungültige Anfrage']);
}

// Schlüssel aus dem Link holen (oder direkt übergeben)
$link = trim((string)($body['link'] ?? ''));
$key = '';
if (preg_match('/^[A-Za-z0-9_-]{20,300}$/', $link)) {
    $key = $link;
} else {
    $parts = parse_url($link);
    if ($parts && ($parts['scheme'] ?? '') === 'https' && strtolower($parts['host'] ?? '') === 'data.v3.go-e.io' && isset($parts['query'])) {
        parse_str($parts['query'], $query);
        $key = (string)($query['e'] ?? '');
    }
}
if (!preg_match('/^[A-Za-z0-9_-]{20,300}$/', $key)) {
    send_json(400, ['error' => 'Ungültiger Export-Link']);
}

$params = ['e' => $key];
foreach (['from', 'to'] as $name) {
    if (isset($body[$name])) {
        if (!is_int($body[$name]) || $body[$name] < 0) {
            send_json(400, ['error' => 'Ungültiger Zeitraum']);
        }
        $params[$name] = $body[$name];
    }
}
if (isset($body['timezone'])) {
    if (!is_string($body['timezone']) || !preg_match('#^[A-Za-z_/+-]{1,64}$#', $body['timezone'])) {
        send_json(400, ['error' => 'Ungültige Zeitzone']);
    }
    $params['timezone'] = $body['timezone'];
}

$url = 'https://data.v3.go-e.io/api/v1/direct_json?' . http_build_query($params);
[$httpCode, $response] = fetch_with_retry($url, 25);

if ($httpCode !== 200) {
    send_json($httpCode === 429 ? 429 : 502, ['error' => $httpCode === 429 ? 'Zu viele Anfragen – warte einen Moment' : "go-e Verlauf nicht abrufbar (HTTP $httpCode)"]);
}
$data = json_decode($response, true);
if (!is_array($data) || !isset($data['data']) || !is_array($data['data'])) {
    send_json(502, ['error' => 'Export-Link abgelaufen oder ungültig']);
}
send_json(200, ['data' => $data['data']]);
