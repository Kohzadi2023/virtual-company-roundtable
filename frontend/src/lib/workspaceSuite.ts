import { newId } from '@/lib/id';
import type { StorageSnapshot } from '@/types/domain';

const SUITE_KEY = 'virtual-company:workspace-suite:v1';
const BACKUP_KEY = 'virtual-company:auto-backups:v1';
const UNLOCK_KEY = 'virtual-company:session-unlocked';
export const WORKSPACE_SUITE_EVENT = 'virtual-company:workspace-suite-changed';

type NonEmptyArray<T> = [T, ...T[]];

export interface CompanyProfile {
  id: string;
  name: string;
  emoji: string;
  description: string;
  createdAt: number;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  builtIn?: boolean;
  createdAt: number;
}

export interface RoomTemplate {
  id: string;
  name: string;
  emoji: string;
  description: string;
  tags: string[];
  agenda: string[];
  objective: string;
  agentIds: string[];
  builtIn?: boolean;
  createdAt: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  details: string;
  createdAt: number;
}

export interface AppLockConfig {
  salt: string;
  verifier: string;
  createdAt: number;
}

export type AgentMemoryCategory =
  | 'decision'
  | 'assumption'
  | 'risk'
  | 'constraint'
  | 'preference'
  | 'fact'
  | 'open-question'
  | 'lesson'
  | 'protocol';

export type AgentMemoryStatus = 'active' | 'resolved' | 'superseded' | 'archived';
export type AgentMemoryImportance = 'low' | 'medium' | 'high';

export interface AgentMemoryEntry {
  id: string;
  agentId: string;
  companyId?: string | undefined;
  projectId?: string | undefined;
  category: AgentMemoryCategory;
  title: string;
  content: string;
  status: AgentMemoryStatus;
  importance: AgentMemoryImportance;
  sourceRoomId?: string | undefined;
  sourceMessageId?: string | undefined;
  expiresAt?: number | undefined;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceSuiteState {
  companies: NonEmptyArray<CompanyProfile>;
  activeCompanyId: string;
  promptTemplates: PromptTemplate[];
  roomTemplates: RoomTemplate[];
  auditLog: AuditEntry[];
  agentMemories: AgentMemoryEntry[];
  autoBackupEnabled: boolean;
  appLock?: AppLockConfig;
}

export interface WorkspaceBackup {
  format: 'virtual-company-backup';
  version: 1;
  createdAt: number;
  snapshot: StorageSnapshot;
  suite: WorkspaceSuiteState;
}

export interface AutomaticBackup {
  id: string;
  createdAt: number;
  snapshot: StorageSnapshot;
  suite: WorkspaceSuiteState;
}

const now = () => Date.now();

const defaultCompany: CompanyProfile = {
  id: 'company-default',
  name: 'Virtual Company',
  emoji: '🏢',
  description: 'Primary company workspace.',
  createdAt: 1,
};

const defaultPromptTemplates: PromptTemplate[] = [
  {
    id: 'prompt-architecture-review',
    name: 'Architecture Review',
    description: 'Review architecture, trade-offs, risks and implementation guardrails.',
    prompt: 'Review the supplied discussion as an architecture decision. Separate requirements from assumptions, identify boundaries and dependencies, compare the meaningful options, surface failure modes, and finish with implementable guardrails. Do not invent evidence.',
    builtIn: true,
    createdAt: 1,
  },
  {
    id: 'prompt-product-critique',
    name: 'Product Critique',
    description: 'Challenge scope, customer value, priority and success metrics.',
    prompt: 'Critique the supplied product discussion. Identify the customer problem, smallest valuable scope, assumptions, trade-offs, measurable success criteria, and what should be deferred. Do not invent customer evidence.',
    builtIn: true,
    createdAt: 1,
  },
  {
    id: 'prompt-brainstorm',
    name: 'Idea Lab Brainstorm',
    description: 'Generate distinct ideas before evaluating them.',
    prompt: 'Generate a diverse set of materially different ideas from the supplied context. First maximize option diversity; then group duplicates, identify assumptions, and compare the strongest concepts by customer value, novelty, feasibility, and evidence needed. Keep ideas clearly separated from decisions.',
    builtIn: true,
    createdAt: 1,
  },
  {
    id: 'prompt-decision-review',
    name: 'Decision Review',
    description: 'Turn a discussion into a decision-ready comparison.',
    prompt: 'Turn the supplied discussion into a decision-ready brief. State the decision to be made, constraints, options, evidence, unresolved risks, dependencies, and reversible versus irreversible consequences. Do not select a winner unless the supplied discussion already contains an approved decision.',
    builtIn: true,
    createdAt: 1,
  },
];

const defaultRoomTemplates: RoomTemplate[] = [
  {
    id: 'room-template-idea-lab',
    name: 'Idea Lab',
    emoji: '💡',
    description: 'Four-angle ideation with product, creative, research and architecture perspectives.',
    tags: ['brainstorm', 'ideas'],
    agenda: ['Define the opportunity', 'Diverge: generate alternatives', 'Challenge assumptions', 'Converge on testable concepts'],
    objective: 'Generate distinct, testable ideas without prematurely collapsing into one solution.',
    agentIds: ['agent-sophia', 'agent-adrian', 'agent-alex', 'agent-emma'],
    builtIn: true,
    createdAt: 1,
  },
  {
    id: 'room-template-architecture',
    name: 'Architecture Review',
    emoji: '🏗️',
    description: 'System design and risk review room.',
    tags: ['architecture', 'review'],
    agenda: ['Requirements and constraints', 'Current architecture', 'Options and trade-offs', 'Risks and guardrails', 'Decision / next experiment'],
    objective: 'Produce a technically coherent architecture direction with explicit trade-offs.',
    agentIds: ['agent-emma', 'agent-leo', 'agent-david', 'agent-ryan', 'agent-mike'],
    builtIn: true,
    createdAt: 1,
  },
  {
    id: 'room-template-gtm',
    name: 'GTM Working Session',
    emoji: '📈',
    description: 'ICP, positioning, acquisition and pipeline working room.',
    tags: ['gtm', 'sales', 'growth'],
    agenda: ['ICP and problem', 'Positioning', 'Acquisition channels', 'Outreach and objections', 'Metrics and next actions'],
    objective: 'Turn market context into an executable go-to-market plan.',
    agentIds: ['agent-tom', 'agent-sophia', 'agent-sarah', 'agent-adrian', 'agent-ella'],
    builtIn: true,
    createdAt: 1,
  },
  {
    id: 'room-template-incident',
    name: 'Incident Review',
    emoji: '🚨',
    description: 'Structured operational incident analysis.',
    tags: ['incident', 'reliability'],
    agenda: ['Impact and timeline', 'Detection', 'Contributing factors', 'Corrective actions', 'Owners and follow-up'],
    objective: 'Understand what happened and produce evidence-based corrective actions without blame.',
    agentIds: ['agent-olivia', 'agent-david', 'agent-nina', 'agent-ryan', 'agent-emma'],
    builtIn: true,
    createdAt: 1,
  },
];

function defaults(): WorkspaceSuiteState {
  return {
    companies: [defaultCompany],
    activeCompanyId: defaultCompany.id,
    promptTemplates: defaultPromptTemplates,
    roomTemplates: defaultRoomTemplates,
    auditLog: [],
    agentMemories: [],
    autoBackupEnabled: true,
  };
}

function mergeBuiltIns<T extends { id: string }>(saved: T[] | undefined, builtIns: T[]): T[] {
  const savedById = new Map((saved ?? []).map(item => [item.id, item]));
  const builtInIds = new Set(builtIns.map(item => item.id));
  return [
    ...builtIns.map(item => ({ ...savedById.get(item.id), ...item })),
    ...(saved ?? []).filter(item => !builtInIds.has(item.id)),
  ];
}

export function loadWorkspaceSuite(): WorkspaceSuiteState {
  const fallback = defaults();
  try {
    const raw = localStorage.getItem(SUITE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<WorkspaceSuiteState>;
    const companies: NonEmptyArray<CompanyProfile> = parsed.companies?.length
      ? parsed.companies
      : fallback.companies;
    const activeCompanyId = companies.some(company => company.id === parsed.activeCompanyId)
      ? parsed.activeCompanyId as string
      : companies[0].id;
    return {
      companies,
      activeCompanyId,
      promptTemplates: mergeBuiltIns(parsed.promptTemplates, defaultPromptTemplates),
      roomTemplates: mergeBuiltIns(parsed.roomTemplates, defaultRoomTemplates),
      auditLog: parsed.auditLog ?? [],
      agentMemories: Array.isArray(parsed.agentMemories) ? parsed.agentMemories : [],
      autoBackupEnabled: parsed.autoBackupEnabled ?? true,
      ...(parsed.appLock ? { appLock: parsed.appLock } : {}),
    };
  } catch {
    return fallback;
  }
}

export function saveWorkspaceSuite(state: WorkspaceSuiteState): void {
  localStorage.setItem(SUITE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(WORKSPACE_SUITE_EVENT));
}

export function updateWorkspaceSuite(updater: (state: WorkspaceSuiteState) => WorkspaceSuiteState): WorkspaceSuiteState {
  const next = updater(loadWorkspaceSuite());
  saveWorkspaceSuite(next);
  return next;
}

export function recordAudit(action: string, details: string): void {
  updateWorkspaceSuite(state => ({
    ...state,
    auditLog: [
      { id: newId(), action, details, createdAt: now() },
      ...state.auditLog,
    ].slice(0, 500),
  }));
}

export function addAgentMemory(input: Omit<AgentMemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): string | null {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!input.agentId || !title || !content) return null;
  const id = newId();
  const createdAt = now();
  const entry: AgentMemoryEntry = {
    ...input,
    id,
    title,
    content,
    createdAt,
    updatedAt: createdAt,
  };
  updateWorkspaceSuite(state => ({ ...state, agentMemories: [entry, ...state.agentMemories] }));
  recordAudit('agent-memory.created', `Created ${input.category} memory: ${title}.`);
  return id;
}

export function updateAgentMemory(
  id: string,
  patch: Partial<Omit<AgentMemoryEntry, 'id' | 'createdAt'>>,
): void {
  updateWorkspaceSuite(state => ({
    ...state,
    agentMemories: state.agentMemories.map(entry => {
      if (entry.id !== id) return entry;
      const title = patch.title === undefined ? entry.title : patch.title.trim();
      const content = patch.content === undefined ? entry.content : patch.content.trim();
      if (!title || !content) return entry;
      return { ...entry, ...patch, title, content, updatedAt: now() };
    }),
  }));
  recordAudit('agent-memory.updated', `Updated persistent memory ${id}.`);
}

export function deleteAgentMemory(id: string): void {
  updateWorkspaceSuite(state => ({ ...state, agentMemories: state.agentMemories.filter(entry => entry.id !== id) }));
  recordAudit('agent-memory.deleted', `Deleted persistent memory ${id}.`);
}

const importanceRank: Record<AgentMemoryImportance, number> = { high: 3, medium: 2, low: 1 };

export function relevantAgentMemories(
  agentId: string,
  projectId?: string,
  companyId?: string,
  limit = 24,
): AgentMemoryEntry[] {
  const currentTime = now();
  return loadWorkspaceSuite().agentMemories
    .filter(entry => entry.agentId === agentId)
    .filter(entry => entry.status === 'active')
    .filter(entry => !entry.expiresAt || entry.expiresAt > currentTime)
    .filter(entry => !entry.companyId || !companyId || entry.companyId === companyId)
    .filter(entry => !entry.projectId || entry.projectId === projectId)
    .sort((left, right) => {
      const importanceDifference = importanceRank[right.importance] - importanceRank[left.importance];
      return importanceDifference || right.updatedAt - left.updatedAt;
    })
    .slice(0, Math.max(1, limit));
}

export function loadAutomaticBackups(): AutomaticBackup[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? '[]') as AutomaticBackup[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAutomaticBackup(snapshot: StorageSnapshot): void {
  const suite = loadWorkspaceSuite();
  if (!suite.autoBackupEnabled) return;
  const existing = loadAutomaticBackups();
  const last = existing[0];
  if (last && now() - last.createdAt < 5 * 60 * 1000) return;
  const next: AutomaticBackup[] = [
    { id: newId(), createdAt: now(), snapshot, suite },
    ...existing,
  ].slice(0, 10);
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(next));
  } catch {
    // Attachments can make browser storage tight. Keep the live workspace usable even if backup fails.
  }
}

export function deleteAutomaticBackup(id: string): void {
  localStorage.setItem(BACKUP_KEY, JSON.stringify(loadAutomaticBackups().filter(item => item.id !== id)));
}

export function buildWorkspaceBackup(snapshot: StorageSnapshot): WorkspaceBackup {
  return {
    format: 'virtual-company-backup',
    version: 1,
    createdAt: now(),
    snapshot,
    suite: loadWorkspaceSuite(),
  };
}

export function downloadTextFile(filename: string, content: string, mediaType = 'application/json'): void {
  const blob = new Blob([content], { type: mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function exportWorkspaceBackup(snapshot: StorageSnapshot): void {
  const backup = buildWorkspaceBackup(snapshot);
  const stamp = new Date(backup.createdAt).toISOString().replace(/[:.]/g, '-');
  downloadTextFile(`virtual-company-backup-${stamp}.json`, JSON.stringify(backup, null, 2));
  recordAudit('backup.exported', 'Exported a full workspace backup.');
}

export async function parseWorkspaceBackup(file: File): Promise<WorkspaceBackup> {
  const parsed = JSON.parse(await file.text()) as WorkspaceBackup;
  if (parsed?.format !== 'virtual-company-backup' || parsed.version !== 1 || !parsed.snapshot) {
    throw new Error('This is not a supported Virtual Company backup.');
  }
  return parsed;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function deriveKey(passphrase: string, salt: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations: 180000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

export async function exportEncryptedWorkspaceBackup(snapshot: StorageSnapshot, passphrase: string): Promise<void> {
  if (passphrase.length < 6) throw new Error('Use a passphrase with at least 6 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ['encrypt']);
  const plaintext = new TextEncoder().encode(JSON.stringify(buildWorkspaceBackup(snapshot)));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plaintext),
  ));
  const envelope = {
    format: 'virtual-company-encrypted-backup',
    version: 1,
    kdf: 'PBKDF2-SHA256-180000',
    cipher: 'AES-256-GCM',
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    payload: bytesToBase64(encrypted),
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadTextFile(`virtual-company-encrypted-${stamp}.vcbackup`, JSON.stringify(envelope));
  recordAudit('backup.encrypted-exported', 'Exported an AES-GCM encrypted workspace backup.');
}

export async function parseEncryptedWorkspaceBackup(file: File, passphrase: string): Promise<WorkspaceBackup> {
  const envelope = JSON.parse(await file.text()) as {
    format?: string;
    salt?: string;
    iv?: string;
    payload?: string;
  };
  if (envelope.format !== 'virtual-company-encrypted-backup' || !envelope.salt || !envelope.iv || !envelope.payload) {
    throw new Error('This is not a supported encrypted Virtual Company backup.');
  }
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const key = await deriveKey(passphrase, salt, ['decrypt']);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(base64ToBytes(envelope.payload)),
    );
  } catch {
    throw new Error('Incorrect passphrase or damaged encrypted backup.');
  }
  const backup = JSON.parse(new TextDecoder().decode(plaintext)) as WorkspaceBackup;
  if (backup?.format !== 'virtual-company-backup' || backup.version !== 1) throw new Error('Decrypted data is not a valid backup.');
  return backup;
}

async function pinVerifier(pin: string, salt: Uint8Array): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations: 180000, hash: 'SHA-256' },
    material,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

export async function configureAppLock(pin: string): Promise<void> {
  if (!/^\d{4,12}$/.test(pin)) throw new Error('PIN must contain 4 to 12 digits.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const verifier = await pinVerifier(pin, salt);
  updateWorkspaceSuite(state => ({ ...state, appLock: { salt: bytesToBase64(salt), verifier, createdAt: now() } }));
  sessionStorage.setItem(UNLOCK_KEY, '1');
  recordAudit('security.lock-enabled', 'Enabled local application PIN lock.');
}

export async function verifyAppLock(pin: string): Promise<boolean> {
  const lock = loadWorkspaceSuite().appLock;
  if (!lock) return true;
  const verifier = await pinVerifier(pin, base64ToBytes(lock.salt));
  const ok = verifier === lock.verifier;
  if (ok) sessionStorage.setItem(UNLOCK_KEY, '1');
  return ok;
}

export function disableAppLock(): void {
  updateWorkspaceSuite(state => {
    const { appLock: _appLock, ...rest } = state;
    return rest as WorkspaceSuiteState;
  });
  sessionStorage.removeItem(UNLOCK_KEY);
  recordAudit('security.lock-disabled', 'Disabled local application PIN lock.');
}

export function appLockEnabled(): boolean {
  return Boolean(loadWorkspaceSuite().appLock);
}

export function sessionUnlocked(): boolean {
  return !appLockEnabled() || sessionStorage.getItem(UNLOCK_KEY) === '1';
}

export function lockSession(): void {
  sessionStorage.removeItem(UNLOCK_KEY);
  window.dispatchEvent(new CustomEvent('virtual-company:lock-now'));
}
