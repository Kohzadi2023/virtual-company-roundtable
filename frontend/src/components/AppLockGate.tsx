import { useEffect, useState, type ReactNode } from 'react';
import { appLockEnabled, sessionUnlocked, verifyAppLock } from '@/lib/workspaceSuite';

interface AppLockGateProps {
  children: ReactNode;
}

export function AppLockGate({ children }: AppLockGateProps) {
  const [locked, setLocked] = useState(() => appLockEnabled() && !sessionUnlocked());
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const lock = () => {
      setPin('');
      setError('');
      setLocked(appLockEnabled());
    };
    window.addEventListener('virtual-company:lock-now', lock);
    return () => window.removeEventListener('virtual-company:lock-now', lock);
  }, []);

  const unlock = async () => {
    if (!pin) return;
    setChecking(true);
    setError('');
    try {
      if (await verifyAppLock(pin)) {
        setLocked(false);
        setPin('');
      } else {
        setError('Incorrect PIN.');
      }
    } finally {
      setChecking(false);
    }
  };

  if (!locked) return <>{children}</>;

  return (
    <div className="grid min-h-screen place-items-center bg-[#0f172a] p-6 text-slate-100">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/20 text-2xl">🔐</div>
        <h1 className="mt-4 text-center text-xl font-bold">Virtual Company is locked</h1>
        <p className="mt-2 text-center text-sm leading-6 text-slate-400">Enter your local PIN to open this workspace.</p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 12))}
          onKeyDown={event => { if (event.key === 'Enter') void unlock(); }}
          placeholder="PIN"
          aria-label="Application PIN"
          className="mt-5 w-full rounded-xl border border-white/15 bg-slate-950/50 px-4 py-3 text-center text-lg tracking-[0.35em] text-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
        />
        {error ? <p className="mt-2 text-center text-xs font-semibold text-rose-300">{error}</p> : null}
        <button type="button" disabled={!pin || checking} onClick={() => void unlock()} className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40">
          {checking ? 'Checking…' : 'Unlock'}
        </button>
        <p className="mt-4 text-center text-[10px] leading-5 text-slate-500">The PIN is verified locally. For at-rest protection, use the encrypted backup option in Workspace Suite.</p>
      </div>
    </div>
  );
}
