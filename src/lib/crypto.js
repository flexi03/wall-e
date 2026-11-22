// Verschlüsselung für „Gemeinsam nutzen“ (WebCrypto, AES-256-GCM).
//
// Aus einem zufälligen Gruppenschlüssel (32 Byte) werden per HKDF drei Dinge abgeleitet:
//   group – Kennung der Gruppe für den Server (verrät nichts über den Schlüssel)
//   auth  – Zugangsnachweis für den Server (der Server speichert nur dessen SHA-256)
//   aes   – Schlüssel zum Ver- und Entschlüsseln; verlässt nie das Gerät
// public/sw.js enthält dieselbe Ableitung (nur Entschlüsseln) für Push-Benachrichtigungen.

const enc = new TextEncoder();
const dec = new TextDecoder();
const SALT = enc.encode('wall-e-sync-v1');

export function toB64u(bytes) {
  let binary = '';
  new Uint8Array(bytes).forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64u(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function randomId(bytes = 16) {
  return toB64u(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function newGroupKey() {
  return randomId(32);
}

export function isGroupKey(key) {
  return typeof key === 'string' && /^[A-Za-z0-9_-]{43}$/.test(key);
}

const hkdf = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: enc.encode(info) });

export async function deriveGroup(key) {
  const base = await crypto.subtle.importKey('raw', fromB64u(key), 'HKDF', false, ['deriveBits', 'deriveKey']);
  const [group, auth, aes] = await Promise.all([
    crypto.subtle.deriveBits(hkdf('group'), base, 256),
    crypto.subtle.deriveBits(hkdf('auth'), base, 256),
    crypto.subtle.deriveKey(hkdf('aes'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  ]);
  return { group: toB64u(group), auth: toB64u(auth), aes };
}

// Die Gruppen-Kennung wird mit verschlüsselt (als Zusatzdaten): ein Päckchen passt nur in seine Gruppe
export async function encryptJson({ aes, group }, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(group) }, aes, enc.encode(JSON.stringify(value)));
  return { iv: toB64u(iv), data: toB64u(data) };
}

export async function decryptJson({ aes, group }, { iv, data }) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(iv), additionalData: enc.encode(group) }, aes, fromB64u(data));
  return JSON.parse(dec.decode(plain));
}
