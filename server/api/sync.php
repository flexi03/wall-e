<?php
// Gemeinsam nutzen (ab Wall-E 2.1): reicht verschlüsselte Änderungen zwischen Geräten weiter.
//
// Der Server sieht nur zufällige Kennungen und verschlüsselte Päckchen. Der Schlüssel entsteht auf dem Handy
// und wird nur per Teilen-Link/QR-Code (hinter dem "#", nie an den Server) weitergegeben.
// Eine Nachricht wird gelöscht, sobald alle anderen Geräte sie übernommen oder abgelehnt haben
// (spätestens nach 30 Tagen). Geräte, die sich 60 Tage nicht melden, werden entfernt.
//
// POST {action, group, auth, device, ...}
//   join       Gerät anmelden (legt die Gruppe beim ersten Gerät an) {meta?: {iv, data}} – Name/Gerät verschlüsselt
//   devices    alle Geräte mit verschlüsselten Namen
//   remove     ein anderes Gerät entfernen {target} – es kann danach nicht wieder beitreten
//   subscribe  Push-Abo setzen/entfernen {endpoint|null}
//   send       Nachricht an alle anderen Geräte {event: {id, iv, data}}
//   pull       offene Nachrichten für dieses Gerät
//   ack        Nachrichten erledigt (übernommen oder abgelehnt) {ids: [...]}
//   leave      Gerät abmelden
require __DIR__ . '/goe.php';
require __DIR__ . '/webpush.php';

const SYNC_DIR = __DIR__ . '/sync-data';
const MAX_EVENT_CHARS = 400000;
const MAX_EVENTS = 500;
const MAX_DEVICES = 20;
const EVENT_TTL = 30 * 86400;
const DEVICE_TTL = 60 * 86400;

handle_cors_and_method();

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) send_json(400, ['error' => 'Ungültige Anfrage']);
$action = (string)($body['action'] ?? '');
$group = (string)($body['group'] ?? '');
$auth = (string)($body['auth'] ?? '');
$device = (string)($body['device'] ?? '');

if (!in_array($action, ['join', 'subscribe', 'send', 'pull', 'ack', 'leave', 'devices', 'remove'], true)) send_json(400, ['error' => 'Unbekannte Aktion']);
if (!preg_match('/^[A-Za-z0-9_-]{43}$/', $group) || !preg_match('/^[A-Za-z0-9_-]{43}$/', $auth)) send_json(400, ['error' => 'Ungültige Gruppe']);
if (!preg_match('/^[A-Za-z0-9_-]{16,64}$/', $device)) send_json(400, ['error' => 'Ungültiges Gerät']);

// Datenordner anlegen und von außen sperren
if (!is_dir(SYNC_DIR)) mkdir(SYNC_DIR, 0700, true);
if (!is_file(SYNC_DIR . '/.htaccess')) file_put_contents(SYNC_DIR . '/.htaccess', "Require all denied\n");

$file = SYNC_DIR . '/' . $group . '.json';
if ($action !== 'join' && !is_file($file)) send_json(404, ['error' => 'Gruppe nicht gefunden']);

$fp = fopen($file, 'c+');
if (!$fp) send_json(500, ['error' => 'Speicher nicht verfügbar']);
flock($fp, LOCK_EX);
$raw = stream_get_contents($fp);
$state = $raw ? json_decode($raw, true) : null;
$authHash = hash('sha256', $auth);

function finish($fp, $file, $state, $code, $response) {
    if ($state !== null) {
        if (count($state['devices']) === 0) {
            ftruncate($fp, 0);
            flock($fp, LOCK_UN);
            fclose($fp);
            @unlink($file);
        } else {
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode($state));
            fflush($fp);
            flock($fp, LOCK_UN);
            fclose($fp);
        }
    } else {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
    if ($code !== null) send_json($code, $response);
}

if (!is_array($state)) {
    if ($action !== 'join') finish($fp, $file, null, 404, ['error' => 'Gruppe nicht gefunden']);
    $state = ['auth' => $authHash, 'devices' => [], 'events' => [], 'removed' => []];
}
if (!isset($state['removed'])) $state['removed'] = [];
if (!hash_equals($state['auth'], $authHash)) finish($fp, $file, null, 403, ['error' => 'Kein Zugriff']);

// Aufräumen: alte Nachrichten, verschwundene Geräte, erledigte Nachrichten
$now = time();
foreach ($state['devices'] as $id => $d) {
    if ($d['seen'] < $now - DEVICE_TTL) unset($state['devices'][$id]);
}
foreach ($state['removed'] as $id => $at) {
    if ($at < $now - DEVICE_TTL) unset($state['removed'][$id]);
}
if (isset($state['removed'][$device])) finish($fp, $file, $state, 403, ['error' => 'Gerät wurde entfernt']);
$state['events'] = array_values(array_filter(array_map(function ($e) use ($state) {
    $e['pending'] = array_values(array_filter($e['pending'], fn($id) => isset($state['devices'][$id])));
    return $e;
}, $state['events']), fn($e) => $e['at'] >= $now - EVENT_TTL && count($e['pending']) > 0));

if ($action !== 'join' && !isset($state['devices'][$device])) finish($fp, $file, $state, 409, ['error' => 'Gerät nicht angemeldet']);

switch ($action) {
    case 'join':
        if (!isset($state['devices'][$device]) && count($state['devices']) >= MAX_DEVICES) finish($fp, $file, $state, 409, ['error' => 'Zu viele Geräte']);
        $meta = $body['meta'] ?? null;
        if ($meta !== null && (!is_array($meta) || !preg_match('/^[A-Za-z0-9_-]{16}$/', (string)($meta['iv'] ?? '')) || !is_string($meta['data'] ?? null) || strlen($meta['data']) > 2000 || !preg_match('/^[A-Za-z0-9_-]+$/', $meta['data']))) {
            finish($fp, $file, $state, 400, ['error' => 'Ungültige Geräteangaben']);
        }
        $previous = $state['devices'][$device] ?? [];
        $state['devices'][$device] = ['seen' => $now, 'since' => $previous['since'] ?? $now, 'push' => $previous['push'] ?? null, 'meta' => $meta ?? ($previous['meta'] ?? null)];
        [, $vapidPublic] = vapid_keys(SYNC_DIR);
        finish($fp, $file, $state, 200, ['devices' => count($state['devices']), 'vapidKey' => $vapidPublic]);

    case 'subscribe':
        $endpoint = $body['endpoint'] ?? null;
        if ($endpoint !== null && !push_endpoint_allowed($endpoint)) finish($fp, $file, $state, 400, ['error' => 'Ungültiges Push-Abo']);
        $state['devices'][$device]['push'] = $endpoint;
        $state['devices'][$device]['seen'] = $now;
        finish($fp, $file, $state, 200, ['ok' => true]);

    case 'send':
        $event = $body['event'] ?? null;
        if (!is_array($event)
            || !preg_match('/^[A-Za-z0-9_-]{8,64}$/', (string)($event['id'] ?? ''))
            || !preg_match('/^[A-Za-z0-9_-]{16}$/', (string)($event['iv'] ?? ''))
            || !is_string($event['data'] ?? null) || strlen($event['data']) > MAX_EVENT_CHARS || !preg_match('/^[A-Za-z0-9_-]+$/', $event['data'])) {
            finish($fp, $file, $state, 400, ['error' => 'Ungültige Nachricht']);
        }
        $state['devices'][$device]['seen'] = $now;
        $others = array_values(array_filter(array_keys($state['devices']), fn($id) => $id !== $device));
        // Niemand sonst da → nichts zu speichern (neue Geräte bekommen den Stand per Teilen-Link)
        if (count($others) === 0) finish($fp, $file, $state, 200, ['stored' => false, 'recipients' => 0]);
        foreach ($state['events'] as $e) {
            if ($e['id'] === $event['id']) finish($fp, $file, $state, 200, ['stored' => true, 'recipients' => count($e['pending'])]);
        }
        if (count($state['events']) >= MAX_EVENTS) finish($fp, $file, $state, 507, ['error' => 'Zu viele offene Änderungen']);
        $state['events'][] = ['id' => $event['id'], 'from' => $device, 'at' => $now, 'iv' => $event['iv'], 'data' => $event['data'], 'pending' => $others];
        $targets = [];
        foreach ($others as $id) {
            if (!empty($state['devices'][$id]['push'])) $targets[$id] = $state['devices'][$id]['push'];
        }
        finish($fp, $file, $state, null, null);

        // Push erst nach dem Speichern (Lock ist frei). Ungültige Abos danach entfernen.
        $gone = [];
        if ($targets) {
            [$pem, $vapidPublic] = vapid_keys(SYNC_DIR);
            $host = preg_match('/^[A-Za-z0-9.-]{1,253}$/', $_SERVER['HTTP_HOST'] ?? '') ? $_SERVER['HTTP_HOST'] : 'localhost';
            foreach ($targets as $id => $endpoint) {
                $code = send_webpush($endpoint, $pem, $vapidPublic, 'https://' . $host);
                if ($code === 404 || $code === 410) $gone[] = $id;
            }
        }
        if ($gone) {
            $fp = fopen($file, 'c+');
            flock($fp, LOCK_EX);
            $state = json_decode(stream_get_contents($fp), true);
            if (is_array($state)) {
                foreach ($gone as $id) {
                    if (isset($state['devices'][$id])) $state['devices'][$id]['push'] = null;
                }
            }
            finish($fp, $file, is_array($state) ? $state : null, null, null);
        }
        send_json(200, ['stored' => true, 'recipients' => count($others), 'pushed' => count($targets) - count($gone)]);

    case 'pull':
        $state['devices'][$device]['seen'] = $now;
        $mine = [];
        foreach ($state['events'] as $e) {
            if (in_array($device, $e['pending'], true)) $mine[] = ['id' => $e['id'], 'at' => $e['at'], 'iv' => $e['iv'], 'data' => $e['data']];
        }
        finish($fp, $file, $state, 200, ['events' => $mine, 'devices' => count($state['devices'])]);

    case 'ack':
        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || count($ids) > MAX_EVENTS) finish($fp, $file, $state, 400, ['error' => 'Ungültige Liste']);
        $state['devices'][$device]['seen'] = $now;
        $state['events'] = array_values(array_filter(array_map(function ($e) use ($ids, $device) {
            if (in_array($e['id'], $ids, true)) $e['pending'] = array_values(array_filter($e['pending'], fn($id) => $id !== $device));
            return $e;
        }, $state['events']), fn($e) => count($e['pending']) > 0));
        finish($fp, $file, $state, 200, ['ok' => true]);

    case 'devices':
        $state['devices'][$device]['seen'] = $now;
        $list = [];
        foreach ($state['devices'] as $id => $d) {
            $list[] = ['id' => $id, 'seen' => $d['seen'], 'since' => $d['since'] ?? $d['seen'], 'push' => !empty($d['push']), 'meta' => $d['meta'] ?? null];
        }
        finish($fp, $file, $state, 200, ['devices' => $list]);

    case 'remove':
        $target = (string)($body['target'] ?? '');
        if (!isset($state['devices'][$target]) || $target === $device) finish($fp, $file, $state, 400, ['error' => 'Gerät nicht gefunden']);
        unset($state['devices'][$target]);
        $state['removed'][$target] = $now;
        $state['events'] = array_values(array_filter(array_map(function ($e) use ($target) {
            $e['pending'] = array_values(array_filter($e['pending'], fn($id) => $id !== $target));
            return $e;
        }, $state['events']), fn($e) => count($e['pending']) > 0));
        finish($fp, $file, $state, 200, ['ok' => true]);

    case 'leave':
        unset($state['devices'][$device]);
        $state['events'] = array_values(array_filter(array_map(function ($e) use ($device) {
            $e['pending'] = array_values(array_filter($e['pending'], fn($id) => $id !== $device));
            return $e;
        }, $state['events']), fn($e) => count($e['pending']) > 0));
        finish($fp, $file, $state, 200, ['ok' => true]);
}
