import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Message } from '@/types/domain';

export interface OliviaStaffingHire {
  agentName: string;
  roleName: string;
  description: string;
  skills: string[];
  systemPrompt: string;
  emoji?: string;
}

export interface OliviaStaffingPlan {
  teamName: string;
  teamDescription: string;
  existingAgentIds: string[];
  hires: OliviaStaffingHire[];
  rationale?: string;
}

export interface AppliedStaffingPlan {
  teamId: string;
  teamName: string;
  reusedAgentIds: string[];
  hiredAgentIds: string[];
}

const MAX_EXISTING_AGENTS = 20;
const MAX_HIRES = 8;
const MAX_SKILLS_PER_HIRE = 12;

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function uniqueStrings(value: unknown, maxItems: number, maxLength = 120): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = cleanText(item, maxLength);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function defaultSystemPrompt(roleName: string, skills: string[]): string {
  const specialty = skills.length > 0 ? ` Focus on ${skills.join(', ')}.` : '';
  return `Respond as the company's ${roleName}. Give only relevant professional analysis, recommendations, risks, and implementation guidance.${specialty}`;
}

export function parseOliviaStaffingPlan(content: string): OliviaStaffingPlan | null {
  const match = content.match(/VC_STAFFING_PLAN\s*```(?:json)?\s*([\s\S]*?)```/i);
  if (!match?.[1]) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const raw = parsed as Record<string, unknown>;
  const teamName = cleanText(raw.teamName, 100);
  if (!teamName) return null;

  const hires: OliviaStaffingHire[] = Array.isArray(raw.hires)
    ? raw.hires.slice(0, MAX_HIRES).flatMap(item => {
        if (!item || typeof item !== 'object') return [];
        const hire = item as Record<string, unknown>;
        const agentName = cleanText(hire.agentName, 80);
        const roleName = cleanText(hire.roleName, 100);
        if (!agentName || !roleName) return [];
        const skills = uniqueStrings(hire.skills, MAX_SKILLS_PER_HIRE, 80);
        const description = cleanText(hire.description, 400)
          || `${roleName} created for the current meeting's specialist needs.`;
        const systemPrompt = cleanText(hire.systemPrompt, 1200)
          || defaultSystemPrompt(roleName, skills);
        const emoji = cleanText(hire.emoji, 8);
        return [{
          agentName,
          roleName,
          description,
          skills,
          systemPrompt,
          ...(emoji ? { emoji } : {}),
        }];
      })
    : [];

  const rationale = cleanText(raw.rationale, 800);
  return {
    teamName,
    teamDescription: cleanText(raw.teamDescription, 500) || `Meeting team selected by Olivia for ${teamName}.`,
    existingAgentIds: uniqueStrings(raw.existingAgentIds, MAX_EXISTING_AGENTS, 120),
    hires,
    ...(rationale ? { rationale } : {}),
  };
}

export function findLatestOliviaStaffingPlan(
  messages: Array<Pick<Message, 'authorType' | 'authorId' | 'content'>>,
  oliviaAgentId: string,
): OliviaStaffingPlan | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.authorType !== 'agent' || message.authorId !== oliviaAgentId) continue;
    const plan = parseOliviaStaffingPlan(message.content);
    if (plan) return plan;
  }
  return null;
}

export function isOliviaStaffingPlanApplied(roomId: string, plan: OliviaStaffingPlan): boolean {
  const state = useWorkspaceStore.getState();
  const room = state.rooms.find(item => item.id === roomId);
  if (!room) return false;
  const team = state.teams.find(item => normalize(item.name) === normalize(plan.teamName));
  if (!team || !(room.teamIds ?? []).includes(team.id)) return false;

  const requiredExisting = plan.existingAgentIds.filter(id => state.agents.some(agent => agent.id === id));
  if (!requiredExisting.every(id => team.agentIds.includes(id))) return false;

  return plan.hires.every(hire => {
    const role = state.roles.find(item => normalize(item.name) === normalize(hire.roleName));
    if (!role) return false;
    const agent = state.agents.find(item => normalize(item.name) === normalize(hire.agentName) && item.roleId === role.id);
    return Boolean(agent && team.agentIds.includes(agent.id));
  });
}

export function applyOliviaStaffingPlan(roomId: string, plan: OliviaStaffingPlan): AppliedStaffingPlan | null {
  const initial = useWorkspaceStore.getState();
  if (!initial.rooms.some(room => room.id === roomId)) return null;

  const reusedAgentIds = plan.existingAgentIds.filter(id => initial.agents.some(agent => agent.id === id));
  const hiredAgentIds: string[] = [];

  for (const hire of plan.hires) {
    let state = useWorkspaceStore.getState();
    let role = state.roles.find(item => normalize(item.name) === normalize(hire.roleName));
    if (!role) {
      const roleId = state.addRole({
        name: hire.roleName,
        description: hire.description,
        skills: hire.skills,
        systemPrompt: hire.systemPrompt,
      });
      state = useWorkspaceStore.getState();
      role = state.roles.find(item => item.id === roleId)
        ?? state.roles.find(item => normalize(item.name) === normalize(hire.roleName));
    }
    if (!role) continue;

    state = useWorkspaceStore.getState();
    let agent = state.agents.find(item => normalize(item.name) === normalize(hire.agentName) && item.roleId === role.id);
    if (!agent) {
      const agentId = state.addAgent({
        name: hire.agentName,
        roleId: role.id,
        emoji: hire.emoji || '🧑‍💼',
        color: '#0F766E',
      });
      state = useWorkspaceStore.getState();
      agent = state.agents.find(item => item.id === agentId)
        ?? state.agents.find(item => normalize(item.name) === normalize(hire.agentName) && item.roleId === role!.id);
    }
    if (agent) hiredAgentIds.push(agent.id);
  }

  let state = useWorkspaceStore.getState();
  const desiredAgentIds = Array.from(new Set([...reusedAgentIds, ...hiredAgentIds]));
  let team = state.teams.find(item => normalize(item.name) === normalize(plan.teamName));

  if (!team) {
    const teamId = state.addTeam({
      name: plan.teamName,
      description: plan.teamDescription,
      emoji: '🧭',
      agentIds: desiredAgentIds,
    });
    state = useWorkspaceStore.getState();
    team = state.teams.find(item => item.id === teamId)
      ?? state.teams.find(item => normalize(item.name) === normalize(plan.teamName));
  } else {
    const mergedIds = Array.from(new Set([...team.agentIds, ...desiredAgentIds]));
    if (mergedIds.length !== team.agentIds.length) {
      const teamId = team.id;
      useWorkspaceStore.setState(current => ({
        teams: current.teams.map(item => item.id === teamId ? { ...item, agentIds: mergedIds } : item),
      }));
      team = { ...team, agentIds: mergedIds };
    }
  }

  if (!team) return null;

  useWorkspaceStore.getState().addTeamToRoom(roomId, team.id);

  const teamId = team.id;
  useWorkspaceStore.setState(current => ({
    teams: current.teams.map(item => item.id === teamId
      ? { ...item, description: plan.teamDescription || item.description }
      : item),
  }));

  return {
    teamId: team.id,
    teamName: team.name,
    reusedAgentIds,
    hiredAgentIds: Array.from(new Set(hiredAgentIds)),
  };
}

export function staffingPlanFingerprint(plan: OliviaStaffingPlan): string {
  return [
    normalize(plan.teamName),
    ...plan.existingAgentIds.slice().sort(),
    ...plan.hires.map(hire => `${normalize(hire.agentName)}:${normalize(hire.roleName)}`).sort(),
  ].join('|');
}
