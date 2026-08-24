/**
 * SOURCE adapter — technically read-only. No create/update/delete methods.
 */
export function createReadOnlySourceAdapter(db, { uid }) {
  if (!uid) throw new Error('source uid is required');
  const sourceUid = String(uid);

  return Object.freeze({
    kind: 'SOURCE_READ_ONLY',
    uid: sourceUid,
    async getUserDoc() {
      const snap = await db.collection('users').doc(sourceUid).get();
      return snap.exists ? { id: snap.id, path: snap.ref.path, data: snap.data() } : null;
    },
    async listSubcollections() {
      const ref = db.collection('users').doc(sourceUid);
      const cols = await ref.listCollections();
      return cols.map((col) => col.id).sort();
    },
    async listDocuments(collectionName) {
      const snap = await db.collection('users').doc(sourceUid).collection(collectionName).get();
      return snap.docs.map((doc) => ({
        id: doc.id,
        path: doc.ref.path,
        data: doc.data(),
      }));
    },
    async listNestedCollections(collectionName, docId) {
      const ref = db.collection('users').doc(sourceUid).collection(collectionName).doc(docId);
      const cols = await ref.listCollections();
      return cols.map((col) => col.id).sort();
    },
    async listNestedDocuments(collectionName, docId, nestedCollection) {
      const snap = await db
        .collection('users')
        .doc(sourceUid)
        .collection(collectionName)
        .doc(docId)
        .collection(nestedCollection)
        .get();
      return snap.docs.map((doc) => ({
        id: doc.id,
        path: doc.ref.path,
        data: doc.data(),
      }));
    },
  });
}

/**
 * TARGET adapter — reads always; writes only when writeEnabled=true (APPLY).
 */
export function createTargetAdapter(db, { uid, writeEnabled = false } = {}) {
  if (!uid) throw new Error('target uid is required');
  const targetUid = String(uid);
  const writesAllowed = Boolean(writeEnabled);

  const api = {
    kind: writesAllowed ? 'TARGET_READ_WRITE' : 'TARGET_READ_ONLY',
    uid: targetUid,
    writeEnabled: writesAllowed,
    async getUserDoc() {
      const snap = await db.collection('users').doc(targetUid).get();
      return snap.exists ? { id: snap.id, path: snap.ref.path, data: snap.data() } : null;
    },
    async listSubcollections() {
      const ref = db.collection('users').doc(targetUid);
      const cols = await ref.listCollections();
      return cols.map((col) => col.id).sort();
    },
    async listDocuments(collectionName) {
      const snap = await db.collection('users').doc(targetUid).collection(collectionName).get();
      return snap.docs.map((doc) => ({
        id: doc.id,
        path: doc.ref.path,
        data: doc.data(),
      }));
    },
    async listNestedCollections(collectionName, docId) {
      const ref = db.collection('users').doc(targetUid).collection(collectionName).doc(docId);
      const cols = await ref.listCollections();
      return cols.map((col) => col.id).sort();
    },
    async listNestedDocuments(collectionName, docId, nestedCollection) {
      const snap = await db
        .collection('users')
        .doc(targetUid)
        .collection(collectionName)
        .doc(docId)
        .collection(nestedCollection)
        .get();
      return snap.docs.map((doc) => ({
        id: doc.id,
        path: doc.ref.path,
        data: doc.data(),
      }));
    },
  };

  api.documentExists = async (collectionName, docId) => {
    const snap = await db.collection('users').doc(targetUid).collection(collectionName).doc(docId).get();
    return snap.exists;
  };

  if (writesAllowed) {
    api.setDocument = async (collectionName, docId, data) => {
      await db.collection('users').doc(targetUid).collection(collectionName).doc(docId).set(data, { merge: false });
    };
    /** Create-only: fails if the document already exists (MISSING_ONLY safe). */
    api.createDocument = async (collectionName, docId, data) => {
      await db.collection('users').doc(targetUid).collection(collectionName).doc(docId).create(data);
    };
    api.setUserDoc = async (data) => {
      await db.collection('users').doc(targetUid).set(data, { merge: true });
    };
    api.createUserDoc = async (data) => {
      await db.collection('users').doc(targetUid).create(data);
    };
    api.setNestedDocument = async (collectionName, docId, nestedCollection, nestedId, data) => {
      await db
        .collection('users')
        .doc(targetUid)
        .collection(collectionName)
        .doc(docId)
        .collection(nestedCollection)
        .doc(nestedId)
        .set(data, { merge: false });
    };
  }

  return Object.freeze(api);
}

export function assertNoWriteMethods(adapter) {
  const forbidden = [
    'set',
    'setDocument',
    'createDocument',
    'setUserDoc',
    'createUserDoc',
    'setNestedDocument',
    'update',
    'delete',
    'create',
    'write',
  ];
  for (const name of forbidden) {
    if (typeof adapter[name] === 'function') {
      throw new Error(`Write method exposed on adapter: ${name}`);
    }
  }
}
