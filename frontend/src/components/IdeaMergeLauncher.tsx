import { useEffect, useState } from 'react';
import { loadOperationsSuite, mergeIdeas, OPERATIONS_SUITE_EVENT } from '@/lib/operationsSuite';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function IdeaMergeLauncher() {
  const projects = useWorkspaceStore(state => state.projects);
  const activeRoom = useWorkspaceStore(state => state.rooms.find(room => room.id === state.activeRoomId));
  const [open, setOpen] = useState(false);
  const [ops, setOps] = useState(loadOperationsSuite);
  const [projectId, setProjectId] = useState(activeRoom?.projectId ?? projects[0]?.id ?? '');
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');

  useEffect(() => {
    const refresh = () => setOps(loadOperationsSuite());
    window.addEventListener(OPERATIONS_SUITE_EVENT, refresh);
    return () => window.removeEventListener(OPERATIONS_SUITE_EVENT, refresh);
  }, []);

  const ideas = ops.ideas.filter(item => item.projectId === projectId && !item.mergedIntoId);

  const submit = () => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    mergeIdeas([sourceId], targetId);
    setSourceId('');
    setTargetId('');
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-violet-50 hover:text-violet-700" title="Merge related ideas into one concept">⇄ Idea Merge</button>
      {open ? (
        <div className="fixed inset-0 z-[170] grid place-items-center bg-slate-950/45 p-5" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="w-[min(620px,92vw)] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-label="Idea Merge">
            <div className="flex items-center justify-between"><div><h2 className="text-base font-bold text-slate-900">Idea Merge</h2><p className="mt-1 text-xs text-slate-500">Merge a related source idea into a primary concept. The source remains traceable as merged.</p></div><button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">×</button></div>
            <label className="mt-4 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Project</label>
            <select value={projectId} onChange={event => { setProjectId(event.target.value); setSourceId(''); setTargetId(''); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs">{projects.map(project => <option key={project.id} value={project.id}>{project.emoji} {project.name}</option>)}</select>
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-3"><label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Source idea<select value={sourceId} onChange={event => setSourceId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs normal-case font-normal"><option value="">Select source</option>{ideas.map(idea => <option key={idea.id} value={idea.id}>{idea.title}</option>)}</select></label><span className="pb-2 text-slate-400">→</span><label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Primary concept<select value={targetId} onChange={event => setTargetId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs normal-case font-normal"><option value="">Select target</option>{ideas.filter(idea => idea.id !== sourceId).map(idea => <option key={idea.id} value={idea.id}>{idea.title}</option>)}</select></label></div>
            <button type="button" onClick={submit} disabled={!sourceId || !targetId || sourceId === targetId} className="mt-5 w-full rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">Merge into primary concept</button>
          </section>
        </div>
      ) : null}
    </>
  );
}
