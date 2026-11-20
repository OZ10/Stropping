// In-memory stand-ins for the three Firebase SDK modules sync.js imports.
// The browser tests serve these instead of gstatic.com. The page gets
// window.__fake = { store: Map(path -> data), set(path, data), del(path), writes }.
// Security rules are NOT enforced here; this tests the app's sync logic only.
module.exports = {
  app: 'export function initializeApp(cfg) { return { cfg }; }',

  auth: `
const listeners = [];
const auth = { currentUser: null };
const emit = () => listeners.forEach((cb) => setTimeout(() => cb(auth.currentUser)));
export function getAuth() { return auth; }
export class GoogleAuthProvider {}
export async function signInWithPopup() {
  auth.currentUser = { uid: window.__fakeUid || 'u1', displayName: window.__fakeName || 'Alex' };
  emit();
}
export async function signInWithRedirect() { return signInWithPopup(); }
export async function getRedirectResult() { return null; }
export async function signOut() { auth.currentUser = null; emit(); }
export function onAuthStateChanged(a, cb) { listeners.push(cb); setTimeout(() => cb(auth.currentUser)); return () => {}; }
`,

  firestore: `
const store = (window.__fake && window.__fake.store) || new Map();
const subs = new Set();
const SENT = Symbol('sentinel');
let autoId = 0;
window.__fake = {
  store,
  set(path, data) { store.set(path, JSON.parse(JSON.stringify(data))); notify(); },
  del(path) { store.delete(path); notify(); },
  writes: 0,
};
function notify() { setTimeout(() => subs.forEach((s) => s.check())); }
export function initializeFirestore() { return {}; }
export function getFirestore() { return {}; }
export function persistentLocalCache() { return {}; }
export function persistentMultipleTabManager() { return {}; }
export function collection(db, ...segs) { return { kind: 'col', path: segs.join('/') }; }
export function doc(dbOrCol, ...segs) {
  if (dbOrCol && dbOrCol.kind === 'col') {
    const path = dbOrCol.path + '/H' + (++autoId);
    return { kind: 'doc', path, id: path.split('/').pop() };
  }
  return { kind: 'doc', path: segs.join('/'), id: segs[segs.length - 1] };
}
const snapDoc = (path) => ({ id: path.split('/').pop(), exists: () => store.has(path), data: () => JSON.parse(JSON.stringify(store.get(path))) });
export function onSnapshot(ref, cb) {
  let last = null;
  const sub = {
    check() {
      if (ref.kind === 'doc') {
        const cur = JSON.stringify(store.get(ref.path) ?? null);
        if (cur !== last) { last = cur; cb(snapDoc(ref.path)); }
        return;
      }
      const prefix = ref.path + '/';
      const now = new Map([...store].filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/')).map(([k, v]) => [k, JSON.stringify(v)]));
      const prev = last || new Map();
      const changes = [];
      for (const [k, v] of now) if (prev.get(k) !== v) changes.push({ type: prev.has(k) ? 'modified' : 'added', doc: snapDoc(k) });
      for (const k of prev.keys()) if (!now.has(k)) changes.push({ type: 'removed', doc: { id: k.split('/').pop() } });
      if (changes.length || !last) { last = now; cb({ docChanges: () => changes }); }
    },
  };
  subs.add(sub);
  setTimeout(() => sub.check());
  return () => subs.delete(sub);
}
function resolve(prev, data) {
  const out = JSON.parse(JSON.stringify(prev || {}));
  for (const [k, v] of Object.entries(data)) {
    const parts = k.split('.');
    let o = out;
    for (const p of parts.slice(0, -1)) o = o[p] = o[p] || {};
    const key = parts[parts.length - 1];
    if (v && v[SENT] === 'union') o[key] = [...new Set([...(o[key] || []), ...v.items])];
    else if (v && v[SENT] === 'remove') o[key] = (o[key] || []).filter((x) => !v.items.includes(x));
    else if (v && v[SENT] === 'delete') delete o[key];
    else if (v && v[SENT] === 'ts') o[key] = Date.now();
    else o[key] = v && v.toMillis ? { ms: v.toMillis() } : JSON.parse(JSON.stringify(v));
  }
  return out;
}
export async function getDoc(ref) {
  const d = store.get(ref.path);
  return { exists: () => !!d, data: () => d && { ...d, expiresAt: d.expiresAt && { toMillis: () => d.expiresAt.ms } } };
}
export async function setDoc(ref, data) { store.set(ref.path, resolve(null, data)); window.__fake.writes++; notify(); }
export async function updateDoc(ref, data) {
  if (!store.has(ref.path)) throw Object.assign(new Error('not found'), { code: 'not-found' });
  store.set(ref.path, resolve(store.get(ref.path), data)); window.__fake.writes++; notify();
}
export function writeBatch() {
  const ops = [];
  return {
    set(ref, data) { ops.push(() => store.set(ref.path, resolve(null, data))); },
    delete(ref) { ops.push(() => store.delete(ref.path)); },
    async commit() { ops.forEach((f) => f()); window.__fake.writes += ops.length; notify(); },
  };
}
export const arrayUnion = (...items) => ({ [SENT]: 'union', items });
export const arrayRemove = (...items) => ({ [SENT]: 'remove', items });
export const deleteField = () => ({ [SENT]: 'delete' });
export const serverTimestamp = () => ({ [SENT]: 'ts' });
export const Timestamp = { fromMillis: (ms) => ({ toMillis: () => ms }) };
`,
};
