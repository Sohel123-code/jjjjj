import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, setPersistence, browserSessionPersistence, inMemoryPersistence, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig.js';
import { createAuthService } from './authService.js';

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export const authService = createAuthService({
  setSessionPersistence: () => setPersistence(auth, browserSessionPersistence).catch(() => setPersistence(auth, inMemoryPersistence)),
  observe: (onChange, onError) => onAuthStateChanged(auth, onChange, onError),
  openGooglePopup: () => signInWithPopup(auth, provider),
  signOut: () => signOut(auth),
});

// ── Firestore helpers with localStorage fallback for dev permission mode ──

let firestorePermissionDenied = false;
export function getFirestorePermissionStatus() {
  return firestorePermissionDenied;
}

// Local storage fallback helpers
function getLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(`polygon_${key}`) || '[]');
  } catch {
    return [];
  }
}

function setLocal(key, data) {
  try {
    localStorage.setItem(`polygon_${key}`, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to update localStorage fallback:', e);
  }
}

// Generate a unique 8-character college ID (uppercase alphanumeric)
export function generateCollegeId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'PG-';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// College CRUD
export async function registerCollege(data) {
  const collegeId = generateCollegeId();
  const collegeObj = {
    ...data,
    collegeId,
    createdAt: new Date().toISOString(),
  };

  try {
    const ref = doc(db, 'colleges', collegeId);
    await setDoc(ref, {
      ...data,
      collegeId,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    if (err?.code === 'permission-denied' || err?.message?.includes('permissions')) {
      console.warn('Firestore write permission denied. Using local storage fallback for registration.', err);
      firestorePermissionDenied = true;
      const list = getLocal('colleges');
      list.push(collegeObj);
      setLocal('colleges', list);
    } else {
      throw err;
    }
  }

  return collegeId;
}

// Seed default demo college in localStorage if empty
function ensureSeedColleges() {
  const list = getLocal('colleges');
  if (list.length === 0) {
    const demo = {
      collegeId: 'PG-DEMO01',
      id: 'PG-DEMO01',
      name: 'Polygon Institute of Technology',
      email: 'admin@polygontech.edu',
      adminUid: 'demo_admin',
      adminName: 'Campus Admin',
      createdAt: new Date().toISOString(),
    };
    setLocal('colleges', [demo]);
  }
}

export async function getCollege(collegeId) {
  ensureSeedColleges();
  const raw = (collegeId || '').trim().toUpperCase();
  if (!raw) return null;

  // Standardize ID search variants (e.g. 'DEMO01' vs 'PG-DEMO01')
  const idsToTry = [raw];
  if (!raw.startsWith('PG-')) idsToTry.push(`PG-${raw}`);
  if (raw.startsWith('PG-')) idsToTry.push(raw.replace(/^PG-/, ''));

  // 1. Try Firestore direct doc lookups & field queries
  try {
    for (const targetId of idsToTry) {
      // Direct doc lookup
      const snap = await getDoc(doc(db, 'colleges', targetId));
      if (snap.exists()) return { id: snap.id, ...snap.data() };

      // Query by collegeId field
      const q = query(collection(db, 'colleges'), where('collegeId', '==', targetId));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        const d = querySnap.docs[0];
        return { id: d.id, ...d.data() };
      }
    }
  } catch (err) {
    if (err?.code === 'permission-denied' || err?.message?.includes('permissions')) {
      firestorePermissionDenied = true;
    }
  }

  // 2. Fallback search in localStorage
  const list = getLocal('colleges');
  for (const targetId of idsToTry) {
    const found = list.find(c => {
      const cId = (c.collegeId || c.id || '').trim().toUpperCase();
      return cId === targetId;
    });
    if (found) return found;
  }

  return null;
}

export async function getCollegeByAdmin(uid) {
  try {
    const q = query(collection(db, 'colleges'), where('adminUid', '==', uid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...d.data() };
    }
  } catch (err) {
    if (err?.code === 'permission-denied' || err?.message?.includes('permissions')) {
      firestorePermissionDenied = true;
    }
  }

  // Fallback
  const list = getLocal('colleges');
  return list.find(c => c.adminUid === uid) || null;
}

// Student join requests
export async function submitJoinRequest({ collegeId, uid, displayName, email, rollNumber, branch, year }) {
  const requestId = `${collegeId}_${uid}`;
  const reqObj = {
    id: requestId, collegeId, uid, displayName, email, rollNumber, branch, year,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'joinRequests', requestId), {
      collegeId, uid, displayName, email, rollNumber, branch, year,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    if (err?.code === 'permission-denied' || err?.message?.includes('permissions')) {
      console.warn('Firestore permission denied. Using local storage fallback for join request.');
      firestorePermissionDenied = true;
      const list = getLocal('joinRequests');
      const filtered = list.filter(r => r.id !== requestId);
      filtered.push(reqObj);
      setLocal('joinRequests', filtered);
    } else {
      throw err;
    }
  }

  return requestId;
}

export async function getJoinRequests(collegeId) {
  try {
    const q = query(collection(db, 'joinRequests'), where('collegeId', '==', collegeId));
    const snap = await getDocs(q);
    if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    if (err?.code === 'permission-denied' || err?.message?.includes('permissions')) {
      firestorePermissionDenied = true;
    }
  }

  // Fallback
  const list = getLocal('joinRequests');
  return list.filter(r => r.collegeId === collegeId);
}

export async function getStudentMembership(uid) {
  try {
    const q = query(collection(db, 'joinRequests'), where('uid', '==', uid));
    const snap = await getDocs(q);
    if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    if (err?.code === 'permission-denied' || err?.message?.includes('permissions')) {
      firestorePermissionDenied = true;
    }
  }

  // Fallback
  const list = getLocal('joinRequests');
  return list.filter(r => r.uid === uid);
}

export async function updateRequestStatus(requestId, status) {
  try {
    await updateDoc(doc(db, 'joinRequests', requestId), { status });
  } catch (err) {
    if (err?.code === 'permission-denied' || err?.message?.includes('permissions')) {
      firestorePermissionDenied = true;
    }
  }

  // Fallback update in local storage
  const list = getLocal('joinRequests');
  const updated = list.map(r => r.id === requestId ? { ...r, status } : r);
  setLocal('joinRequests', updated);
}

// Posts CRUD for the live feed
export async function createPost(data) {
  const postId = `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const postObj = {
    ...data,
    postId,
    id: postId,
    createdAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'posts', postId), {
      ...data,
      postId,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    if (err?.code === 'permission-denied' || err?.message?.includes('permissions')) {
      firestorePermissionDenied = true;
      const list = getLocal('posts');
      list.unshift(postObj);
      setLocal('posts', list);
    } else {
      throw err;
    }
  }

  return postId;
}

export async function getPosts(collegeId) {
  try {
    const q = query(collection(db, 'posts'), where('collegeId', '==', collegeId));
    const snap = await getDocs(q);
    if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    if (err?.code === 'permission-denied' || err?.message?.includes('permissions')) {
      firestorePermissionDenied = true;
    }
  }

  // Fallback
  const list = getLocal('posts');
  return list.filter(p => p.collegeId === collegeId);
}

export async function deletePost(postId) {
  try {
    await deleteDoc(doc(db, 'posts', postId));
  } catch (err) {
    if (err?.code === 'permission-denied' || err?.message?.includes('permissions')) {
      firestorePermissionDenied = true;
    }
  }

  const list = getLocal('posts');
  setLocal('posts', list.filter(p => p.postId !== postId && p.id !== postId));
}
