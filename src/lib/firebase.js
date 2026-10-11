import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, setPersistence, browserSessionPersistence, inMemoryPersistence, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { firebaseConfig } from './firebaseConfig.js';
import { createAuthService } from './authService.js';
export const firebaseApp=getApps().length?getApp():initializeApp(firebaseConfig);
export const auth=getAuth(firebaseApp), db=getFirestore(firebaseApp), functions=getFunctions(firebaseApp,'us-central1');
if(import.meta.env.VITE_USE_EMULATORS==='true'){
 connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
 connectFirestoreEmulator(db,'127.0.0.1',8080);connectFunctionsEmulator(functions,'127.0.0.1',5001);
} else if(import.meta.env.VITE_EMULATE_FUNCTIONS==='true'){
 connectFunctionsEmulator(functions,'127.0.0.1',5001);
}
if(import.meta.env.VITE_RECAPTCHA_SITE_KEY)initializeAppCheck(firebaseApp,{provider:new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),isTokenAutoRefreshEnabled:true});
const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
export const authService=createAuthService({
 setSessionPersistence:()=>setPersistence(auth,browserSessionPersistence).catch(()=>setPersistence(auth,inMemoryPersistence)),
 observe:(change,error)=>onAuthStateChanged(auth,change,error),
 openGooglePopup:()=>signInWithPopup(auth,provider),openGoogleRedirect:()=>signInWithRedirect(auth,provider),
 getRedirectResult:()=>getRedirectResult(auth),signOut:()=>signOut(auth)
});
const callable=httpsCallable(functions,'zoneApi',{timeout:120000});
export async function zoneCall(action,data={}){try{return (await callable({action,...data})).data;}catch(e){if(e.code==='functions/not-found'||e.code==='functions/unavailable'||e.code==='functions/internal')throw new Error('Zone backend is not reachable. Complete FIREBASE_SETUP.md or open the interactive demo.');throw e;}}
