import { useEffect, useState } from 'react';
import {
  appLockEnabled as hasConfiguredAppLock,
  configureAppLock,
  disableAppLock,
  exportEncryptedWorkspaceBackup,
  lockSession,
  parseEncryptedWorkspaceBackup,
  recordAudit,
  saveWorkspaceSuite,
  type WorkspaceBackup,
} from '@/lib/workspaceSuite';
import {
  loadSecurityPreferences,
  SECURITY_PREFERENCES_EVENT,
  updateSecurityPreferences,
  type SecurityPreferences,
} from '@/lib/securityPreferences';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { StorageSnapshot } from '@/types/domain';

function snapshotNow(): StorageSnapshot {
  const state = useWorkspaceStore.getState();
  return {
    version: 4,
    rooms: state.rooms,
    roles: state.roles,
    agents: state.agents,
    teams: state.teams,
    projects: state.projects,
    decisions: state.decisions,
    actionItems: state.actionItems,
    agentContext: state.agentContext,
    activeRoomId: state.activeRoomId,
    savedAt: Date.now(),
  };
}

function restoreBackup(backup: WorkspaceBackup): void {
  const snapshot = { ...backup.snapshot, savedAt: Date.now() };
  localStorage.setItem('ai-team-chat:snapshot:v4', JSON.stringify(snapshot));
  saveWorkspaceSuite(backup.suite);
  window.location.reload();
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-violet-600' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'start-[22px]' : 'start-0.5'}`} />
    </button>
  );
}

export function SecuritySettingsLauncher() {
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState<SecurityPreferences>(() => loadSecurityPreferences());
  const [pin, setPin] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [status, setStatus] = useState('');
  const configuredLock = hasConfiguredAppLock();

  useEffect(() => {
    const refresh = () => setPreferences(loadSecurityPreferences());
    window.addEventListener(SECURITY_PREFERENCES_EVENT, refresh);
    return () => window.removeEventListener(SECURITY_PREFERENCES_EVENT, refresh);
  }, []);

  const setPreference = (key: keyof SecurityPreferences, enabled: boolean) => {
    const next = updateSecurityPreferences(current => ({ ...current, [key]: enabled }));
    setPreferences(next);
    recordAudit('security.preference', `${key} ${enabled ? 'enabled' : 'disabled'} in Settings.`);
    setStatus('Security setting saved.');
  };

  const savePin = async () => {
    try {
      await configureAppLock(pin);
      const next = updateSecurityPreferences(current => ({ ...current, appLockEnabled: true }));
      setPreferences(next);
      setPin('');
      setStatus('App Lock is configured and enabled.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not configure App Lock.');
    }
  };

  const forgetPin = () => {
    if (!window.confirm('Remove the saved local PIN?')) return;
    disableAppLock();
    const next = updateSecurityPreferences(current => ({ ...current, appLockEnabled: false }));
    setPreferences(next);
    setPin('');
    setStatus('Saved PIN removed.');
  };

  const exportEncrypted = async () => {
    try {
      await exportEncryptedWorkspaceBackup(snapshotNow(), passphrase);
      setStatus('Encrypted backup exported.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not export encrypted backup.');
    }
  };

  const importEncrypted = async (file: File | undefined) => {
    if (!file) return;
    try {
      const backup = await parseEncryptedWorkspaceBackup(file, passphrase);
      if (!window.confirm('Restore this encrypted backup? The current workspace will be replaced after reload.')) return;
      restoreBackup(backup);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not import encrypted backup.');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        title="Application Settings"
      >
        <span aria-hidden="true">⚙</span> Settings
      </button>

      {open ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/40 p-5" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Settings">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Settings</h2>
                <p className="mt-0.5 text-xs text-slate-500">Security features are optional and disabled unless you choose to use them.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close Settings">✕</button>
            </header>

            <div className="space-y-4 p-5">
              <section className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">App Lock</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">Optional</span>
                    </div>
                    <p className="mt-1 max-w-lg text-xs leading-5 text-slate-500">Require a local PIN when Virtual Company is opened. Turning this option off bypasses the lock without deleting the saved PIN.</p>
                  </div>
                  <Toggle checked={preferences.appLockEnabled} onChange={enabled => setPreference('appLockEnabled', enabled)} label="Enable App Lock" />
                </div>

                {preferences.appLockEnabled ? (
                  <div className="mt-4 rounded-lg bg-slate-50 p-3">
                    {configuredLock ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="me-auto text-xs font-semibold text-emerald-700">✓ PIN configured</span>
                        <button type="button" onClick={lockSession} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Lock Now</button>
                        <button type="button" onClick={forgetPin} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600">Remove PIN</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          inputMode="numeric"
                          autoComplete="new-password"
                          value={pin}
                          onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 12))}
                          placeholder="Create 4–12 digit PIN"
                          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                        />
                        <button type="button" disabled={pin.length < 4} onClick={() => void savePin()} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Set PIN</button>
                      </div>
                    )}
                  </div>
                ) : configuredLock ? (
                  <p className="mt-3 text-[11px] text-slate-400">A PIN is stored locally, but App Lock is currently disabled in Settings.</p>
                ) : null}
              </section>

              <section className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">Encrypted Backups</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">Optional</span>
                    </div>
                    <p className="mt-1 max-w-lg text-xs leading-5 text-slate-500">Enable passphrase-protected workspace export/import. Encrypted backups use PBKDF2 and AES-256-GCM; this setting does not encrypt the normal SQLite database.</p>
                  </div>
                  <Toggle checked={preferences.encryptedBackupsEnabled} onChange={enabled => setPreference('encryptedBackupsEnabled', enabled)} label="Enable encrypted backups" />
                </div>

                {preferences.encryptedBackupsEnabled ? (
                  <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3">
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={passphrase}
                      onChange={event => setPassphrase(event.target.value)}
                      placeholder="Encryption passphrase (minimum 6 characters)"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={passphrase.length < 6} onClick={() => void exportEncrypted()} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Export Encrypted Backup</button>
                      <label className={`rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 ${passphrase.length < 6 ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-slate-50'}`}>
                        Import Encrypted Backup
                        <input type="file" accept=".vcbackup" disabled={passphrase.length < 6} className="hidden" onChange={event => void importEncrypted(event.target.files?.[0])} />
                      </label>
                    </div>
                  </div>
                ) : null}
              </section>

              {status ? <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">{status}</div> : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
