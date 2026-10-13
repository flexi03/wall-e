<?php
// Gemeinsame Funktionen für status.php und test.php: Proxy zur go-e Cloud API.
// Seriennummer und Token kommen per POST (JSON) – nie in der URL, damit sie nicht in Server-Logs landen.

function send_json($statusCode, $data) {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    echo json_encode($data);
    exit();
}

// App und Proxy laufen auf derselben Domain: bewusst keine CORS-Freigabe,
// fremde Webseiten können die Antworten im Browser daher nicht lesen.
function handle_cors_and_method() {
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit();
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        header('Allow: POST, OPTIONS');
        send_json(405, ['error' => 'Nur POST erlaubt']);
    }
}

// Liest serial und token aus dem JSON-Body und prüft sie streng
function read_credentials() {
    $body = json_decode(file_get_contents('php://input'), true);
    $serial = is_array($body) ? trim((string)($body['serial'] ?? '')) : '';
    $token = is_array($body) ? trim((string)($body['token'] ?? '')) : '';

    // Die Seriennummer wird Teil des Hostnamens (<serial>.api.v3.go-e.io):
    // nur Buchstaben und Ziffern, sonst ließe sich eine beliebige Zieladresse einschleusen.
    if (!preg_match('/^[A-Za-z0-9]{1,20}$/', $serial)) {
        send_json(400, ['error' => 'Ungültige Seriennummer']);
    }
    if ($token === '' || strlen($token) > 200 || preg_match('/[\x00-\x1F\x7F]/', $token)) {
        send_json(400, ['error' => 'Ungültiger API-Token']);
    }
    return [$serial, $token];
}

// Fragt den Status bei der go-e Cloud ab; gibt [HTTP-Code, Antwort-Body] zurück
function fetch_goe_status($serial, $token) {
    $url = 'https://' . $serial . '.api.v3.go-e.io/api/status?token=' . rawurlencode($token);
    return fetch_with_retry($url, 10);
}

// HTTPS-GET ohne Weiterleitungen. Die go-e Cloud antwortet gelegentlich kurz mit 5xx oder gar nicht –
// dann einmal nach kurzer Pause erneut versuchen, bevor ein Fehler an die App geht.
function fetch_with_retry($url, $timeout) {
    for ($attempt = 1; $attempt <= 2; $attempt++) {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_ENCODING => '',
        ]);
        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $transient = $response === false || $httpCode >= 500;
        if (!$transient || $attempt === 2) break;
        usleep(700000);
    }
    if ($response === false) {
        send_json(502, ['error' => 'go-e Cloud nicht erreichbar']);
    }
    return [$httpCode, $response];
}

function goe_error_message($httpCode) {
    $messages = [
        401 => 'API-Token ungültig',
        403 => 'Wallbox offline oder Cloud API nicht aktiviert',
        404 => 'Wallbox nicht gefunden oder sendet keine Daten',
        422 => 'Ungültige Parameter',
        429 => 'Zu viele Anfragen – warte einen Moment',
        500 => 'go-e Cloud hatte einen kurzen Fehler',
        502 => 'go-e Cloud nicht erreichbar',
        503 => 'go-e Cloud gerade nicht verfügbar',
        504 => 'go-e Cloud antwortet nicht',
    ];
    return $messages[$httpCode] ?? "go-e API Fehler (HTTP $httpCode)";
}
