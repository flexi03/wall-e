// Node ab Version 25 bringt ein eigenes (leeres) localStorage mit, das jsdom überdeckt.
// Für die Tests ein einfacher Speicher im Arbeitsspeicher.
class MemoryStorage {
  #data = new Map();
  get length() { return this.#data.size; }
  key(i) { return [...this.#data.keys()][i] ?? null; }
  getItem(k) { return this.#data.has(k) ? this.#data.get(k) : null; }
  setItem(k, v) { this.#data.set(k, String(v)); }
  removeItem(k) { this.#data.delete(k); }
  clear() { this.#data.clear(); }
}
Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true });
