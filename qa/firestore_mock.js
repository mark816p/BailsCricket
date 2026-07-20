// Minimal but faithful in-memory Firestore mock — supports exactly the API
// surface the real page files use (collection/doc/where/orderBy/limit/get/
// set/update/delete/batch/runTransaction/FieldValue), so REAL unmodified
// page JS can run against it unmodified.
function createMockFirestore(seedData) {
  // seedData: { collectionName: { docId: {...fields} }, ... }
  const store = JSON.parse(JSON.stringify(seedData));
  // subcollections stored as store[`${collection}/${docId}/${subcollection}`]

  function applyFieldValues(existing, updates) {
    const out = { ...existing };
    for (const [key, val] of Object.entries(updates)) {
      if (val && val.__fieldValueType === 'increment') {
        const parts = key.split('.');
        setDeep(out, parts, (getDeep(out, parts) || 0) + val.amount);
      } else if (val && val.__fieldValueType === 'arrayUnion') {
        const parts = key.split('.');
        const cur = getDeep(out, parts) || [];
        const merged = [...cur];
        val.items.forEach(it => { if (!merged.some(x=>JSON.stringify(x)===JSON.stringify(it))) merged.push(it); });
        setDeep(out, parts, merged);
      } else if (val && val.__fieldValueType === 'arrayRemove') {
        const parts = key.split('.');
        const cur = getDeep(out, parts) || [];
        setDeep(out, parts, cur.filter(x => !val.items.some(it=>JSON.stringify(it)===JSON.stringify(x))));
      } else if (val && val.__fieldValueType === 'delete') {
        const parts = key.split('.');
        deleteDeep(out, parts);
      } else if (val && val.__fieldValueType === 'serverTimestamp') {
        const parts = key.split('.');
        setDeep(out, parts, { toDate: () => new Date(), toMillis: () => Date.now(), seconds: Math.floor(Date.now()/1000) });
      } else if (key.includes('.')) {
        const parts = key.split('.');
        setDeep(out, parts, val);
      } else {
        out[key] = val;
      }
    }
    return out;
  }
  function getDeep(obj, parts) { let c=obj; for (const p of parts) { if (c==null) return undefined; c=c[p]; } return c; }
  function setDeep(obj, parts, val) { let c=obj; for (let i=0;i<parts.length-1;i++){ if (c[parts[i]]==null) c[parts[i]]={}; c=c[parts[i]]; } c[parts[parts.length-1]]=val; }
  function deleteDeep(obj, parts) { let c=obj; for (let i=0;i<parts.length-1;i++){ if (c[parts[i]]==null) return; c=c[parts[i]]; } delete c[parts[parts.length-1]]; }

  function docRef(collection, id) {
    return {
      id,
      async get() {
        const data = store[collection] && store[collection][id];
        return { exists: !!data, id, data: () => data ? JSON.parse(JSON.stringify(data)) : undefined };
      },
      async set(data, opts) {
        if (!store[collection]) store[collection] = {};
        if (opts && opts.merge) store[collection][id] = { ...(store[collection][id]||{}), ...JSON.parse(JSON.stringify(data)) };
        else store[collection][id] = JSON.parse(JSON.stringify(data));
      },
      async update(updates) {
        if (!store[collection] || !store[collection][id]) throw new Error(`No document to update: ${collection}/${id}`);
        store[collection][id] = applyFieldValues(store[collection][id], updates);
      },
      async delete() { if (store[collection]) delete store[collection][id]; },
      collection(sub) { return collectionRef(`${collection}/${id}/${sub}`); }
    };
  }

  function collectionRef(collection) {
    let filters = [];
    let orderField = null, orderDir = 'asc';
    let limitN = null;

    const api = {
      doc(id) { return docRef(collection, id || `auto_${Math.random().toString(36).slice(2)}`); },
      where(field, op, value) { filters.push({field, op, value}); return api; },
      orderBy(field, dir='asc') { orderField = field; orderDir = dir; return api; },
      limit(n) { limitN = n; return api; },
      async add(data) {
        const id = `auto_${Math.random().toString(36).slice(2)}`;
        if (!store[collection]) store[collection] = {};
        store[collection][id] = JSON.parse(JSON.stringify(data));
        return { id };
      },
      async get() {
        const all = store[collection] || {};
        let docs = Object.entries(all).map(([id, data]) => ({ id, data: () => JSON.parse(JSON.stringify(data)) }));
        docs = docs.filter(d => filters.every(f => {
          const dv = getDeep(d.data(), f.field.split('.'));
          if (f.op === '==') return dv === f.value;
          if (f.op === 'array-contains') return Array.isArray(dv) && dv.includes(f.value);
          if (f.op === '>=') return dv >= f.value;
          if (f.op === '<=') return dv <= f.value;
          return true;
        }));
        if (orderField) docs.sort((a,b) => {
          const av = getDeep(a.data(), orderField.split('.')), bv = getDeep(b.data(), orderField.split('.'));
          return orderDir === 'desc' ? (bv>av?1:bv<av?-1:0) : (av>bv?1:av<bv?-1:0);
        });
        if (limitN) docs = docs.slice(0, limitN);
        return { docs, empty: docs.length===0, size: docs.length };
      }
    };
    return api;
  }

  const db = {
    collection: collectionRef,
    batch() {
      const ops = [];
      return {
        update(ref, data) { ops.push(async () => ref.update(data)); },
        set(ref, data, opts) { ops.push(async () => ref.set(data, opts)); },
        delete(ref) { ops.push(async () => ref.delete()); },
        async commit() { for (const op of ops) await op(); }
      };
    },
    async runTransaction(fn) {
      const tx = {
        async get(ref) { return ref.get(); },
        set(ref, data, opts) { ref.set(data, opts); },
        update(ref, data) { ref.update(data); }
      };
      return fn(tx);
    }
  };

  const FieldValue = {
    increment: n => ({ __fieldValueType:'increment', amount:n }),
    arrayUnion: (...items) => ({ __fieldValueType:'arrayUnion', items }),
    arrayRemove: (...items) => ({ __fieldValueType:'arrayRemove', items }),
    delete: () => ({ __fieldValueType:'delete' }),
    serverTimestamp: () => ({ __fieldValueType:'serverTimestamp' })
  };

  return { db, firebase: { firestore: { FieldValue } } };
}
module.exports = { createMockFirestore };
