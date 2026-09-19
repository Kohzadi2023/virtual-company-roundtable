import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadSecurityPreferences,
  saveSecurityPreferences,
} from '@/lib/securityPreferences';

const SUITE_KEY = 'virtual-company:workspace-suite:v1';

describe('security preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps security features opt-in for a new workspace', () => {
    expect(loadSecurityPreferences()).toEqual({
      appLockEnabled: false,
      encryptedBackupsEnabled: false,
    });
  });

  it('preserves an app lock that was configured before security preferences existed', () => {
    localStorage.setItem(SUITE_KEY, JSON.stringify({
      appLock: {
        salt: 'legacy-salt',
        verifier: 'legacy-verifier',
        createdAt: 1,
      },
    }));

    expect(loadSecurityPreferences().appLockEnabled).toBe(true);
  });

  it('persists explicit choices', () => {
    saveSecurityPreferences({
      appLockEnabled: false,
      encryptedBackupsEnabled: true,
    });

    expect(loadSecurityPreferences()).toEqual({
      appLockEnabled: false,
      encryptedBackupsEnabled: true,
    });
  });
});
