import type { StorageSnapshot, WorkspaceExtensionSnapshot } from '@/types/domain';

type ExtensionField = Exclude<keyof WorkspaceExtensionSnapshot, 'version'>;

interface ExtensionSource {
  field: ExtensionField;
  key: string;
  event: string;
}

const SOURCES: ExtensionSource[] = [
  {
    field: 'workspaceSuite',
    key: 'virtual-company:workspace-suite:v1',
    event: 'virtual-company:workspace-suite-changed',
  },
  {
    field: 'memoryV2',
    key: 'virtual-company:memory-v2:v1',
    event: 'virtual-company:memory-v2-changed',
  },
  {
    field: 'memoryIntelligence',
    key: 'virtual-company:memory-intelligence:v1',
    event: 'virtual-company:memory-intelligence-changed',
  },
  {
    field: 'meetingOrchestration',
    key: 'virtual-company:meeting-orchestration:v1',
    event: 'virtual-company:meeting-orchestration-changed',
  },
  {
    field: 'operationsSuite',
    key: 'virtual-company:operations-suite:v1',
    event: 'virtual-company:operations-suite-changed',
  },
  {
    field: 'securityPreferences',
    key: 'virtual-company:security-preferences:v1',
    event: 'virtual-company:security-preferences-changed',
  },
];

export const WORKSPACE_EXTENSION_EVENTS = SOURCES.map(source => source.event) as readonly string[];

function readJson(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? null : JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function captureWorkspaceExtensions(): WorkspaceExtensionSnapshot {
  const bundle: WorkspaceExtensionSnapshot = { version: 1 };
  for (const source of SOURCES) {
    bundle[source.field] = readJson(source.key);
  }
  return bundle;
}

export function withWorkspaceExtensions(snapshot: StorageSnapshot): StorageSnapshot {
  return { ...snapshot, extensions: captureWorkspaceExtensions() };
}

/**
 * Restores extension state captured inside a v4 workspace snapshot.
 * Missing `extensions` means a legacy snapshot, so existing local extension
 * state is intentionally preserved during upgrade/migration.
 */
export function restoreWorkspaceExtensions(value: unknown): boolean {
  if (!isRecord(value) || value.version !== 1) return false;

  for (const source of SOURCES) {
    if (!Object.prototype.hasOwnProperty.call(value, source.field)) continue;
    const next = value[source.field];
    try {
      if (next == null) localStorage.removeItem(source.key);
      else localStorage.setItem(source.key, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(source.event));
    } catch {
      // Keep the rest of the workspace restorable even if one extension is damaged.
    }
  }
  return true;
}
