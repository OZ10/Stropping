/*
 * Stropping — optional household sharing with Firebase (Google sign-in + Firestore).
 *
 * Only runs when firebase-config.js has a config. Talks to app.js through
 * window.StroppingApp: it hands over an adapter (write, signIn, …) and reports
 * back with onSyncStatus(status) and onRemote(docs).
 *
 * Firestore layout:
 *   users/{uid}                       { householdId }
 *   households/{hid}                  { name, members: [uid], memberInfo: {uid: {name}}, createdBy, createdAt }
 *   households/{hid}/{collection}/{id} one document per entity (see logic.js → toDocs)
 *   invites/{code}                    { householdId, createdBy, createdAt, expiresAt }
 */
const FB = 'https://www.gstatic.com/firebasejs/10.14.1';
const INVITE_DAYS = 7;

const app = window.StroppingApp;
const config = window.STROPPING_FIREBASE_CONFIG;
const L = window.StroppingLogic;

if (app && config && config.apiKey && config.projectId) {
  start().catch((err) => {
    console.error(err);
    app.onSyncStatus({ configured: true, ready: false, error: 'Couldn’t load sharing. Check your connection and reload.' });
  });
}

async function start() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-auth.js`),
    import(`${FB}/firebase-firestore.js`),
  ]);
  const fbApp = initializeApp(config);
  const auth = A.getAuth(fbApp);
  let db;
  try {
    db = F.initializeFirestore(fbApp, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch (e) {
    db = F.getFirestore(fbApp); // e.g. private browsing without IndexedDB
  }

  const status = { configured: true, ready: false, user: null, householdLoaded: false, householdId: null, household: null, pending: 0, error: null };
  const emit = () => app.onSyncStatus(JSON.parse(JSON.stringify(status)));

  let householdId = null;
  let unsubs = [];
  let userUnsub = null;
  let docs = new Map();
  let seen = new Set();
  let deliverTimer = null;
  let creating = false;

  const name = () => {
    const u = auth.currentUser;
    // Shown to other household members; firestore.rules caps it at 100 chars.
    return ((u && (u.displayName || (u.email || '').split('@')[0])) || 'Someone').slice(0, 100);
  };

  function fail(err) {
    console.error(err);
    if (err && err.code === 'permission-denied' && householdId) {
      stopHousehold();
      status.error = 'You no longer have access to that household.';
    } else {
      status.error = err && err.message ? err.message : String(err);
    }
    emit();
  }

  function stopHousehold() {
    unsubs.forEach((u) => u());
    unsubs = [];
    householdId = null;
    docs = new Map();
    seen = new Set();
    status.householdId = null;
    status.household = null;
  }

  // Wait until every collection has reported once, so the app never sees
  // (and then saves) a half-loaded household.
  function deliver() {
    clearTimeout(deliverTimer);
    deliverTimer = setTimeout(() => {
      if (seen.size === L.SYNC_COLLECTIONS.length) app.onRemote(new Map(docs));
    }, 40);
  }

  function watchHousehold(hid) {
    if (hid === householdId) return;
    stopHousehold();
    if (!hid) { emit(); return; }
    householdId = hid;
    status.householdId = hid;
    status.householdLoaded = true;
    status.error = null;
    emit();
    unsubs.push(F.onSnapshot(F.doc(db, 'households', hid), (snap) => {
      if (!snap.exists()) { stopHousehold(); emit(); return; }
      const d = snap.data();
      const info = d.memberInfo || {};
      status.household = {
        id: hid,
        name: d.name || 'Household',
        members: (d.members || []).map((uid) => ({ uid, name: (info[uid] && info[uid].name) || 'Someone' })),
      };
      emit();
    }, fail));
    for (const coll of L.SYNC_COLLECTIONS) {
      unsubs.push(F.onSnapshot(F.collection(db, 'households', hid, coll), (snap) => {
        for (const ch of snap.docChanges()) {
          const key = `${coll}/${ch.doc.id}`;
          if (ch.type === 'removed') docs.delete(key);
          else docs.set(key, ch.doc.data());
        }
        seen.add(coll);
        deliver();
      }, fail));
    }
  }

  function writeTo(hid, changes) {
    const ops = [...changes.set.map(([k, v]) => ['set', k, v]), ...changes.del.map((k) => ['del', k])];
    const commits = [];
    for (let i = 0; i < ops.length; i += 400) {
      const batch = F.writeBatch(db);
      for (const [op, k, v] of ops.slice(i, i + 400)) {
        const ref = F.doc(db, 'households', hid, ...k.split('/'));
        if (op === 'set') batch.set(ref, v);
        else batch.delete(ref);
      }
      status.pending++;
      emit();
      // Resolves when the server has it; offline, Firestore queues it and
      // applies it to local reads straight away.
      commits.push(batch.commit().catch((e) => { fail(e); throw e; }).finally(() => { status.pending--; emit(); }));
    }
    return Promise.all(commits);
  }

  function randomCode() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes, (b) => abc[b % abc.length]).join('');
  }

  const adapter = {
    write(changes) {
      if (householdId) writeTo(householdId, changes).catch(() => {});
    },

    async signIn() {
      const provider = new A.GoogleAuthProvider();
      try {
        await A.signInWithPopup(auth, provider);
      } catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
          await A.signInWithRedirect(auth, provider);
        } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
          throw e;
        }
      }
    },

    signOut: () => A.signOut(auth),

    /** Create a household and upload this device's data into it. */
    async createHousehold(householdName, localDocs) {
      const u = auth.currentUser;
      if (!u) throw new Error('Sign in first.');
      creating = true;
      try {
        const ref = F.doc(F.collection(db, 'households'));
        const batch = F.writeBatch(db);
        batch.set(ref, {
          name: householdName, members: [u.uid], memberInfo: { [u.uid]: { name: name() } },
          createdBy: u.uid, createdAt: F.serverTimestamp(),
        });
        batch.set(F.doc(db, 'users', u.uid), { householdId: ref.id });
        await batch.commit();
        await writeTo(ref.id, { set: [...localDocs], del: [] });
        watchHousehold(ref.id);
      } finally {
        creating = false;
      }
    },

    /** Join with an invite code. */
    async join(code) {
      const u = auth.currentUser;
      if (!u) throw new Error('Sign in first.');
      const c = String(code || '').trim().toUpperCase();
      const inv = await F.getDoc(F.doc(db, 'invites', c));
      if (!inv.exists()) throw new Error('That invite code isn’t valid.');
      const { householdId: hid, expiresAt } = inv.data();
      if (expiresAt && expiresAt.toMillis() < Date.now()) throw new Error('That invite has expired. Ask for a new one.');
      if (householdId && householdId !== hid) await adapter.leave();
      await F.updateDoc(F.doc(db, 'households', hid), {
        members: F.arrayUnion(u.uid),
        [`memberInfo.${u.uid}`]: { name: name() },
        joinCode: c,
      });
      await F.setDoc(F.doc(db, 'users', u.uid), { householdId: hid });
    },

    /** Create an invite code for the current household. */
    async invite() {
      const u = auth.currentUser;
      if (!u || !householdId) throw new Error('You’re not in a household.');
      const code = randomCode();
      await F.setDoc(F.doc(db, 'invites', code), {
        householdId, createdBy: u.uid, createdAt: F.serverTimestamp(),
        expiresAt: F.Timestamp.fromMillis(Date.now() + INVITE_DAYS * 864e5),
      });
      return code;
    },

    /** Leave the household. This device keeps its copy of the data. */
    async leave() {
      const u = auth.currentUser;
      const hid = householdId;
      if (!u || !hid) return;
      stopHousehold();
      emit();
      await F.updateDoc(F.doc(db, 'households', hid), {
        members: F.arrayRemove(u.uid),
        [`memberInfo.${u.uid}`]: F.deleteField(),
      });
      await F.setDoc(F.doc(db, 'users', u.uid), { householdId: null });
    },
  };

  app.attachSync(adapter);
  A.getRedirectResult(auth).catch((e) => fail(e));

  A.onAuthStateChanged(auth, (user) => {
    if (userUnsub) { userUnsub(); userUnsub = null; }
    stopHousehold();
    status.ready = true;
    status.error = null;
    status.user = user ? { uid: user.uid, name: name() } : null;
    status.householdLoaded = !user;
    emit();
    if (!user) return;
    userUnsub = F.onSnapshot(F.doc(db, 'users', user.uid), (snap) => {
      if (creating) return; // createHousehold starts watching once the upload is done
      status.householdLoaded = true;
      watchHousehold(snap.exists() ? snap.data().householdId || null : null);
      emit();
    }, fail);
  });
}
