import { appLockEnabled as hasConfiguredAppLock } from '@/lib/workspaceSuite';

const SECURITY_PREFERENCES_KEY = 'virtual-company:security-preferences:v1';
export const SECURITY_PREFERENCES_EVENT = 'virtual-company:security-preferences-changed';

export interface SecurityPreferences {
  /** Whether the configured local PIN should actually gate the application. */
  appLockEnabled: boolean;
  /** Whether encrypted backup controls are exposed in Settings. */
  encryptedBackupsEnabled: boolean;
}

function defaults(): SecurityPreferences {
  return {
    // Preserve the behavior of users who configured a PIN before this preference existed.
    appLockEnabled: hasConfiguredAppLock(),
    encryptedBackupsEnabled: false,
  };
}

export function loadSecurityPreferences(): SecurityPreferences {
  const fallback = defaults();
  try {
    const raw = localStorage.getItem(SECURITY_PREFERENCES_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SecurityPreferences>;
    return {
      appLockEnabled: parsed.appLockEnabled ?? fallback.appLockEnabled,
      encryptedBackupsEnabled: parsed.encryptedBackupsEnabled ?? false,
    };
  } catch {
    return fallback;
  }
}

export function saveSecurityPreferences(preferences: SecurityPreferences): void {
  localStorage.setItem(SECURITY_PREFERENCES_KEY, JSON.stringify(preferences));
  window.dispatchEvent(new CustomEvent(SECURITY_PREFERENCES_EVENT));
}

export function updateSecurityPreferences(
  updater: (current: SecurityPreferences) => SecurityPreferences,
): SecurityPreferences {
  const next = updater(loadSecurityPreferences());
  saveSecurityPreferences(next);
  return next;
}
