export const OPEN_MEMORY_CENTER_EVENT = 'virtual-company:open-memory-center';

export type MemoryCenterTab = 'shared' | 'suggestions' | 'conflicts' | 'relations' | 'digest' | 'timeline';

export interface OpenMemoryCenterDetail {
  tab?: MemoryCenterTab;
}

export function openMemoryCenter(detail: OpenMemoryCenterDetail = {}): void {
  window.dispatchEvent(new CustomEvent<OpenMemoryCenterDetail>(OPEN_MEMORY_CENTER_EVENT, { detail }));
}
