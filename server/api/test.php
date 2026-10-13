<?php
// Verbindungstest beim Einrichten der Wallbox (POST {serial, token})
require __DIR__ . '/goe.php';

handle_cors_and_method();
[$serial, $token] = read_credentials();
[$httpCode, $response] = fetch_goe_status($serial, $token);

if ($httpCode !== 200) {
    send_json(200, ['success' => false, 'error' => goe_error_message($httpCode), 'http_code' => $httpCode]);
}

$data = json_decode($response, true);
if (!is_array($data)) {
    send_json(200, ['success' => false, 'error' => 'Unerwartete Antwort der go-e Cloud']);
}
send_json(200, ['success' => true, 'serial_number' => $serial, 'data' => $data]);
