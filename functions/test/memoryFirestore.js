"use strict";

function randomId() {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

class MemoryDocRef {
  constructor(db, collectionName, id) {
    this._db = db;
    this._collectionName = collectionName;
    this.id = id;
    this.path = `${collectionName}/${id}`;
  }

  collection(subName) {
    return new MemoryCollection(this._db, `${this.path}/${subName}`);
  }

  async get() {
    const data = this._db.docs.get(this.path);
    return {
      id: this.id,
      exists: data !== undefined,
      data: () => (data ? { ...data } : undefined),
    };
  }

  async set(data, options) {
    const prev = this._db.docs.get(this.path) || {};
    const next = options && options.merge ? { ...prev, ...data } : { ...data };
    this._db.docs.set(this.path, next);
  }

  async update(data) {
    const prev = this._db.docs.get(this.path);
    if (!prev) {
      const err = new Error("NOT_FOUND");
      err.code = 5;
      throw err;
    }
    this._db.docs.set(this.path, { ...prev, ...data });
  }
}

class MemoryQuery {
  constructor(db, collectionName, filters, limitCount) {
    this._db = db;
    this._collectionName = collectionName;
    this._filters = filters || [];
    this._limitCount = limitCount || 100;
  }

  where(field, op, value) {
    return new MemoryQuery(
      this._db,
      this._collectionName,
      this._filters.concat([{ field, op, value }]),
      this._limitCount,
    );
  }

  limit(n) {
    return new MemoryQuery(this._db, this._collectionName, this._filters, n);
  }

  async get() {
    const prefix = `${this._collectionName}/`;
    const docs = [];
    for (const [path, data] of this._db.docs.entries()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (rest.includes("/")) continue;
      let ok = true;
      for (const filter of this._filters) {
        if (filter.op === "==" && data[filter.field] !== filter.value) ok = false;
      }
      if (ok) {
        const id = rest;
        docs.push({
          id,
          exists: true,
          data: () => ({ ...data }),
        });
      }
    }
    const sliced = docs.slice(0, this._limitCount);
    return {
      docs: sliced,
      empty: sliced.length === 0,
      size: sliced.length,
    };
  }
}

class MemoryCollection extends MemoryQuery {
  constructor(db, collectionName) {
    super(db, collectionName, [], 100);
  }

  doc(id) {
    return new MemoryDocRef(this._db, this._collectionName, id || randomId());
  }

  async add(data) {
    const ref = this.doc();
    await ref.set({ ...data, id: ref.id });
    return ref;
  }
}

class MemoryFirestore {
  constructor() {
    this.docs = new Map();
    this._tx = Promise.resolve();
  }

  collection(name) {
    return new MemoryCollection(this, name);
  }

  runTransaction(fn) {
    const run = async () => {
      const tx = {
        get: (ref) => ref.get(),
        set: (ref, data, options) => ref.set(data, options),
        update: (ref, data) => ref.update(data),
      };
      return fn(tx);
    };
    const next = this._tx.then(run, run);
    this._tx = next.then(() => undefined, () => undefined);
    return next;
  }
}

module.exports = { MemoryFirestore };
