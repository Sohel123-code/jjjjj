// Firebase's web configuration identifies the project.
// Reads Vite environment variables VITE_FIREBASE_* with project defaults.
export const firebaseConfig = Object.freeze({
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || 'AIzaSyCxK9Cok0aCMvHnigMkAxcBf7QwPCU4Q5I',
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || 'polygon-6628c.firebaseapp.com',
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || 'polygon-6628c',
  storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || 'polygon-6628c.firebasestorage.app',
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '762255278822',
  appId: import.meta.env?.VITE_FIREBASE_APP_ID || '1:762255278822:web:e9ad3263fcb0b96cf93127',
  measurementId: import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID || 'G-357RK1JQCW',
});
