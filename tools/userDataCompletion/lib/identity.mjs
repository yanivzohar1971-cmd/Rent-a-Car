export class IdentityMismatchError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'IdentityMismatchError';
    this.details = details;
  }
}

/**
 * Verify Auth UID + email. UID is authoritative; email is mandatory cross-check.
 * Never logs tokens.
 */
export async function verifyAuthIdentity(auth, {
  uid,
  expectedEmail,
  label = 'user',
} = {}) {
  const expectedUid = String(uid || '').trim();
  const expected = String(expectedEmail || '').trim().toLowerCase();
  if (!expectedUid) throw new IdentityMismatchError(`${label}: uid is required`);
  if (!expected) throw new IdentityMismatchError(`${label}: expected email is required`);

  let record;
  try {
    record = await auth.getUser(expectedUid);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      throw new IdentityMismatchError(`${label}: UID does not exist`, {
        uid: expectedUid,
      });
    }
    throw error;
  }

  const actualEmail = String(record.email || '').trim().toLowerCase();
  if (actualEmail !== expected) {
    throw new IdentityMismatchError(`${label}: email does not match UID`, {
      uid: expectedUid,
      expectedEmail: expected,
      actualEmail: actualEmail || null,
    });
  }

  return {
    uid: record.uid,
    email: record.email || null,
    disabled: Boolean(record.disabled),
    customClaims: record.customClaims && typeof record.customClaims === 'object'
      ? Object.keys(record.customClaims)
      : [],
    providerCount: Array.isArray(record.providerData) ? record.providerData.length : 0,
  };
}

export async function verifySourceAndTarget(auth, profile) {
  const source = await verifyAuthIdentity(auth, {
    uid: profile.sourceUid,
    expectedEmail: profile.sourceEmail,
    label: 'SOURCE',
  });
  const target = await verifyAuthIdentity(auth, {
    uid: profile.targetUid,
    expectedEmail: profile.targetEmail,
    label: 'TARGET',
  });
  return { source, target };
}
