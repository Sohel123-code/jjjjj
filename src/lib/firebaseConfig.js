// Firebase's web configuration identifies the project; it is not an admin secret.
// Access to campus data must still be enforced by backend authorisation and rules.
export const firebaseConfig = Object.freeze({
  apiKey: 'AIzaSyCxK9Cok0aCMvHnigMkAxcBf7QwPCU4Q5I',
  authDomain: 'polygon-6628c.firebaseapp.com',
  projectId: 'polygon-6628c',
  storageBucket: 'polygon-6628c.firebasestorage.app',
  messagingSenderId: '762255278822',
  appId: '1:762255278822:web:e9ad3263fcb0b96cf93127',
  measurementId: 'G-357RK1JQCW',
});

// Analytics is intentionally not imported or initialised. The measurement ID
// alone does not enable collection. Add consent before enabling analytics later.
