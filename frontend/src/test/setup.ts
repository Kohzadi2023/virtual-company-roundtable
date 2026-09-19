import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(String(key)) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.values.set(String(key), String(value));
  }
}

function storageIsUsable(storage: Storage | undefined): storage is Storage {
  if (!storage) return false;
  try {
    const probe = '__virtual_company_vitest_storage_probe__';
    storage.setItem(probe, '1');
    const usable = storage.getItem(probe) === '1';
    storage.removeItem(probe);
    return usable && typeof storage.clear === 'function';
  } catch {
    return false;
  }
}

function ensureStorage(name: 'localStorage' | 'sessionStorage'): void {
  let current: Storage | undefined;
  try {
    current = globalThis[name];
  } catch {
    current = undefined;
  }

  if (storageIsUsable(current)) return;

  Object.defineProperty(globalThis, name, {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

ensureStorage('localStorage');
ensureStorage('sessionStorage');
