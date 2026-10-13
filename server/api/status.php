<?php
// Aktueller Wallbox-Status über die go-e Cloud API (POST {serial, token})
require __DIR__ . '/goe.php';

handle_cors_and_method();
[$serial, $token] = read_credentials();
[$httpCode, $response] = fetch_goe_status($serial, $token);

if ($httpCode !== 200) {
    send_json($httpCode >= 400 && $httpCode < 600 ? $httpCode : 502, ['error' => goe_error_message($httpCode)]);
}

$data = json_decode($response, true);
if (!is_array($data)) {
    send_json(502, ['error' => 'Unerwartete Antwort der go-e Cloud']);
}
send_json(200, $data);
