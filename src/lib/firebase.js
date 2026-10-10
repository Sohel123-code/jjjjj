import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, setPersistence, browserSessionPersistence, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from './firebaseConfig.js';
import { createAuthService } from './authService.js';

const appName = 'polygon';
export const firebaseApp = getApps().some(app => app.name === appName) ? getApp(appName) : initializeApp(firebaseConfig, appName);
const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export const authService = createAuthService({
  setSessionPersistence: () => setPersistence(auth, browserSessionPersistence),
  observe: (onChange, onError) => onAuthStateChanged(auth, onChange, onError),
  openGooglePopup: () => signInWithPopup(auth, provider),
  signOut: () => signOut(auth),
});

// No Firestore/Storage writes, Analytics calls, or location collection happen
// during sign-in. A Firebase user is not an approved college member.
