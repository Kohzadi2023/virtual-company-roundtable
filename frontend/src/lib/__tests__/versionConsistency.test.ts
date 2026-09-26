import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('application version consistency', () => {
  it('keeps frontend, Tauri, Rust and visible fallback versions aligned', () => {
    const packageJson = JSON.parse(read('package.json')) as { version: string };
    const tauriConfig = JSON.parse(read('src-tauri/tauri.conf.json')) as { version: string };
    const cargoToml = read('src-tauri/Cargo.toml');
    const appSource = read('src/App.tsx');

    const cargoVersion = cargoToml.match(/^version = "([^"]+)"/m)?.[1];
    const visibleFallback = appSource.match(/VITE_APP_VERSION\?\.trim\(\) \|\| '([^']+)'/)?.[1];

    expect(packageJson.version).toBe('2.8.9');
    expect(tauriConfig.version).toBe(packageJson.version);
    expect(cargoVersion).toBe(packageJson.version);
    expect(visibleFallback).toBe(packageJson.version);
  });
});
