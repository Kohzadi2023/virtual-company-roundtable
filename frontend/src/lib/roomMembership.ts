import type { Room, TeamDefinition } from '@/types/domain';

export type AgentRoomMembershipKind = 'none' | 'direct' | 'team' | 'direct-and-team';

export interface AgentRoomMembership {
  kind: AgentRoomMembershipKind;
  present: boolean;
  direct: boolean;
  teamIds: string[];
  teamNames: string[];
}

export function getAgentRoomMembership(
  room: Pick<Room, 'agentIds' | 'individualAgentIds' | 'teamIds'> | undefined,
  agentId: string,
  teams: TeamDefinition[],
): AgentRoomMembership {
  if (!room) {
    return { kind: 'none', present: false, direct: false, teamIds: [], teamNames: [] };
  }

  const teamById = new Map(teams.map(team => [team.id, team]));
  const selectedTeamIds = room.teamIds ?? [];
  const supplyingTeams = selectedTeamIds
    .map(teamId => teamById.get(teamId))
    .filter((team): team is TeamDefinition => Boolean(team?.agentIds.includes(agentId)));

  const suppliedByTeam = supplyingTeams.length > 0;
  const direct = room.individualAgentIds
    ? room.individualAgentIds.includes(agentId)
    : room.agentIds.includes(agentId) && !suppliedByTeam;

  const kind: AgentRoomMembershipKind = direct
    ? suppliedByTeam ? 'direct-and-team' : 'direct'
    : suppliedByTeam ? 'team' : 'none';

  return {
    kind,
    present: kind !== 'none',
    direct,
    teamIds: supplyingTeams.map(team => team.id),
    teamNames: supplyingTeams.map(team => team.name),
  };
}
