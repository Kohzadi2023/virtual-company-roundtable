export type OperationsTab = 'registers' | 'ideas' | 'deliverables' | 'execution' | 'dashboards' | 'room' | 'export';

export const OPEN_OPERATIONS_CENTER_EVENT = 'virtual-company:open-operations-center';

export function openOperationsCenter(tab: OperationsTab = 'dashboards'): void {
  window.dispatchEvent(new CustomEvent(OPEN_OPERATIONS_CENTER_EVENT, { detail: { tab } }));
}
