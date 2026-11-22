<?php
// Web-Push ohne Inhalt (nur "es gibt etwas Neues") mit VAPID, ohne Zusatz-Bibliotheken.
// Der Inhalt bleibt Ende-zu-Ende verschlüsselt: Das Handy holt die Nachricht nach dem Push selbst ab
// und entschlüsselt sie. Der Server schickt nie Klartext an Apple/Google/Mozilla.

function b64u($bytes) {
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

// VAPID-Schlüssel des Servers (einmal erzeugt, liegt im gesperrten Datenordner)
function vapid_keys($dir) {
    $file = $dir . '/vapid.pem';
    $lock = fopen($dir . '/vapid.lock', 'c');
    flock($lock, LOCK_EX);
    if (!is_file($file) || filesize($file) === 0) {
        $key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        openssl_pkey_export($key, $pem);
        file_put_contents($file, $pem);
        @chmod($file, 0600);
    }
    $pem = file_get_contents($file);
    flock($lock, LOCK_UN);
    fclose($lock);
    $details = openssl_pkey_get_details(openssl_pkey_get_private($pem));
    $public = "\x04" . str_pad($details['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($details['ec']['y'], 32, "\0", STR_PAD_LEFT);
    return [$pem, b64u($public)];
}

// OpenSSL liefert ECDSA-Signaturen als DER, JWT (ES256) braucht r||s mit je 32 Byte
function der_to_raw($der) {
    $pos = 2;
    if (ord($der[1]) & 0x80) $pos += ord($der[1]) & 0x7f;
    $parts = [];
    for ($i = 0; $i < 2; $i++) {
        $len = ord($der[$pos + 1]);
        $int = ltrim(substr($der, $pos + 2, $len), "\0");
        $parts[] = str_pad($int, 32, "\0", STR_PAD_LEFT);
        $pos += 2 + $len;
    }
    return $parts[0] . $parts[1];
}

// Nur echte Push-Dienste der Browser – sonst ließe sich der Server als Sprungbrett missbrauchen
function push_endpoint_allowed($endpoint) {
    if (!is_string($endpoint) || strlen($endpoint) > 1000) return false;
    $p = parse_url($endpoint);
    if (!$p || ($p['scheme'] ?? '') !== 'https' || isset($p['port']) || isset($p['user'])) return false;
    return (bool)preg_match('/(^|\.)(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/i', $p['host'] ?? '');
}

function vapid_jwt($endpoint, $pem, $subject) {
    $p = parse_url($endpoint);
    $header = b64u(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $claims = b64u(json_encode(['aud' => 'https://' . $p['host'], 'exp' => time() + 12 * 3600, 'sub' => $subject]));
    $input = $header . '.' . $claims;
    openssl_sign($input, $der, $pem, OPENSSL_ALGO_SHA256);
    return $input . '.' . b64u(der_to_raw($der));
}

// Schickt einen leeren Push. Gibt den HTTP-Code zurück (404/410 = Abo ungültig, entfernen).
function send_webpush($endpoint, $pem, $publicKey, $subject) {
    if (!push_endpoint_allowed($endpoint)) return 400;
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $endpoint,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => '',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_TIMEOUT => 6,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_HTTPHEADER => [
            'TTL: 86400',
            'Urgency: normal',
            'Content-Length: 0',
            'Authorization: vapid t=' . vapid_jwt($endpoint, $pem, $subject) . ', k=' . $publicKey,
        ],
    ]);
    curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code;
}
