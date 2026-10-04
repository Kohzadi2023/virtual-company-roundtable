import type { AgentMemoryCategory, AgentMemoryEntry } from '@/lib/workspaceSuite';

/**
 * Categories that describe how a specialist works rather than facts about a
 * particular project, so they stay useful in any meeting.
 */
const PORTABLE_CATEGORIES: ReadonlySet<AgentMemoryCategory> = new Set(['preference', 'lesson', 'protocol']);

export function isPortableMemoryCategory(category: AgentMemoryCategory): boolean {
  return PORTABLE_CATEGORIES.has(category);
}

export interface AgentMemoryScopeContext {
  activeRoomId?: string | undefined;
  activeProjectId?: string | undefined;
  /** Resolves a room id to that room's project. `found: false` means the room no longer exists. */
  lookupRoom: (roomId: string) => { found: boolean; projectId?: string | undefined };
}

export interface AgentMemoryScopePartition {
  /** Belongs to this project/meeting (or was deliberately saved as company-wide). */
  inScope: AgentMemoryEntry[];
  /** Captured in another project/meeting but describes professional practice; shown with a warning label. */
  carried: AgentMemoryEntry[];
  /** Captured in another project/meeting and describes project facts; never sent to the model. */
  withheld: AgentMemoryEntry[];
}

/**
 * relevantAgentMemories() only checks `entry.projectId`. Agent memories saved
 * without a project (every one captured in a project-less room, and the ones
 * auto-saved before projectId was recorded) therefore matched every room of
 * every project, and one meeting's facts surfaced in unrelated meetings as
 * "prior working context". The memory's source room is the only provenance
 * left on those entries, so use it to decide whether it belongs here.
 */
export function partitionAgentMemoriesByScope(
  entries: AgentMemoryEntry[],
  context: AgentMemoryScopeContext,
): AgentMemoryScopePartition {
  const result: AgentMemoryScopePartition = { inScope: [], carried: [], withheld: [] };
  for (const entry of entries) {
    if (belongsHere(entry, context)) result.inScope.push(entry);
    else if (isPortableMemoryCategory(entry.category)) result.carried.push(entry);
    else result.withheld.push(entry);
  }
  return result;
}

function belongsHere(entry: AgentMemoryEntry, context: AgentMemoryScopeContext): boolean {
  if (entry.projectId) return entry.projectId === context.activeProjectId;
  if (entry.crossProject || !entry.sourceRoomId) return true;
  if (entry.sourceRoomId === context.activeRoomId) return true;
  const source = context.lookupRoom(entry.sourceRoomId);
  // Same project means same body of work; two different project-less rooms do not.
  return source.found && Boolean(source.projectId) && source.projectId === context.activeProjectId;
}
