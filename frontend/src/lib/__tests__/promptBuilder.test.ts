import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAgents, defaultRoles } from '@/lib/defaultCompany';
import { addSharedMemory } from '@/lib/memoryV2';
import { buildAgentPrompt, buildExternalChatTitleHint } from '@/lib/promptBuilder';
import { addAgentMemory } from '@/lib/workspaceSuite';
import { useWorkspaceStore } from '@/store/workspaceStore';

describe('external chat title hint', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('uses only the selected agent name as the requested chat title', () => {
    const hint = buildExternalChatTitleHint({ name: 'Emma' });

    expect(hint[0]).toBe('CHAT TITLE: Emma');
    expect(hint[1]).toContain('use exactly "Emma" as the conversation title');
    expect(hint[1]).toContain('Do not add the role, room name, project name, or task');
  });

  it('injects company, project and agent memory without leaking another project', () => {
    const agent = defaultAgents.find(item => item.id === 'agent-emma')!;
    const role = defaultRoles.find(item => item.id === agent.roleId)!;
    useWorkspaceStore.setState({
      agents: defaultAgents,
      roles: defaultRoles,
      projects: [{ id: 'project-a', name: 'Project A', description: '', emoji: '📁', createdAt: 1 }],
      rooms: [{
        id: 'room-a',
        name: 'Architecture',
        emoji: '🏗️',
        companyId: 'company-default',
        projectId: 'project-a',
        languageCode: 'en',
        agentIds: [agent.id],
        messages: [],
        createdAt: 1,
      }],
      activeRoomId: 'room-a',
    });

    addSharedMemory({
      scope: 'company',
      companyId: 'company-default',
      category: 'constraint',
      title: 'Company security principle',
      content: 'Security controls should default to least privilege.',
      status: 'active',
      importance: 'high',
    });
    addSharedMemory({
      scope: 'project',
      companyId: 'company-default',
      projectId: 'project-a',
      category: 'decision',
      title: 'Project persistence',
      content: 'Project A uses SQLite for local persistence.',
      status: 'active',
      importance: 'high',
    });
    addSharedMemory({
      scope: 'project',
      companyId: 'company-default',
      projectId: 'project-b',
      category: 'decision',
      title: 'Other project shared secret',
      content: 'Project B uses a different persistence system.',
      status: 'active',
      importance: 'high',
    });
    addAgentMemory({
      agentId: agent.id,
      companyId: 'company-default',
      category: 'constraint',
      title: 'Manual AI policy',
      content: 'Keep the external AI workflow manual.',
      status: 'active',
      importance: 'high',
    });
    addAgentMemory({
      agentId: agent.id,
      companyId: 'company-default',
      projectId: 'project-a',
      category: 'decision',
      title: 'Desktop shell',
      content: 'Use Tauri 2.',
      status: 'active',
      importance: 'medium',
    });
    addAgentMemory({
      agentId: agent.id,
      companyId: 'company-default',
      projectId: 'project-b',
      category: 'decision',
      title: 'Other project secret',
      content: 'Do not leak this into Project A.',
      status: 'active',
      importance: 'high',
    });

    const prompt = buildAgentPrompt(agent, role, []);
    expect(prompt).toContain('COMPANY MEMORY');
    expect(prompt).toContain('PROJECT MEMORY');
    expect(prompt).toContain('PERSISTENT AGENT MEMORY');
    expect(prompt).toContain('Company security principle');
    expect(prompt).toContain('Project persistence');
    expect(prompt).toContain('Manual AI policy');
    expect(prompt).toContain('Desktop shell');
    expect(prompt).not.toContain('Other project shared secret');
    expect(prompt).not.toContain('Other project secret');
  });
});
