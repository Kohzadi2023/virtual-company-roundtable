import { openMemoryCenter } from '@/lib/memoryCenter';
import { loadMemoryV2, MEMORY_V2_EVENT } from '@/lib/memoryV2';
import { useEffect, useState } from 'react';

export function MemoryCenterLauncher() {
  const [pending, setPending] = useState(() => loadMemoryV2().suggestions.filter(item => item.status === 'pending').length);

  useEffect(() => {
    const refresh = () => setPending(loadMemoryV2().suggestions.filter(item => item.status === 'pending').length);
    window.addEventListener(MEMORY_V2_EVENT, refresh);
    return () => window.removeEventListener(MEMORY_V2_EVENT, refresh);
  }, []);

  return (
    <button
      type="button"
      onClick={() => openMemoryCenter({ tab: pending > 0 ? 'suggestions' : 'shared' })}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-violet-50 hover:text-violet-700"
      title="Company, project and memory intelligence"
    >
      <span aria-hidden="true">◈</span> Memory Center
      {pending > 0 ? <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">{pending}</span> : null}
    </button>
  );
}
