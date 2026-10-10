export function authErrorMessage(error) {
  switch (error?.code) {
    case 'auth/popup-closed-by-user': return 'The Google window was closed. You can try again whenever you’re ready.';
    case 'auth/popup-blocked': return 'Your browser blocked the Google window. Allow pop-ups for this site, then try again.';
    case 'auth/cancelled-popup-request': return 'Another sign-in window is already open. Complete that window or try again.';
    case 'auth/unauthorized-domain': return 'Google sign-in is not enabled for this website address yet. The project administrator needs to add this domain in Firebase Authentication settings.';
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found': return 'Google sign-in hasn’t been enabled in Firebase yet. The project administrator needs to enable the Google provider.';
    case 'auth/network-request-failed': return 'We couldn’t reach Google sign-in. Check your connection and try again.';
    case 'auth/too-many-requests': return 'There have been too many attempts. Please wait a little before trying again.';
    case 'auth/user-disabled': return 'This account has been disabled. Contact the project administrator for help.';
    case 'auth/account-exists-with-different-credential': return 'This email already uses another sign-in method. Contact the project administrator to recover access.';
    case 'auth/web-storage-unsupported': return 'This browser is blocking session storage. Allow storage for this site to use Google sign-in.';
    case 'auth/invalid-api-key':
    case 'auth/app-not-authorized': return 'The Firebase project configuration needs attention. Contact the project administrator.';
    case 'auth/not-ready': return 'Sign-in is still getting ready. Please try again in a moment.';
    case 'auth/operation-in-progress': return 'Please wait for the current account action to finish.';
    default: return 'We couldn’t complete that account action. Please try again.';
  }
}

// Small adapter boundary keeps session policy and popup concurrency testable
// without sending test credentials to the real Firebase project.
export function createAuthService(adapter) {
  let initialization;
  let ready = false;
  let action = null;
  function run(kind, operation) {
    if (!ready) return Promise.reject(Object.assign(new Error('Auth not ready'), { code:'auth/not-ready' }));
    if (action) return action.kind === kind ? action.promise : Promise.reject(Object.assign(new Error('Auth action in progress'), { code:'auth/operation-in-progress' }));
    // Invoke synchronously inside the click handler, preserving popup activation.
    let result;
    try { result = operation(); } catch (error) { return Promise.reject(error); }
    const promise = Promise.resolve(result).finally(() => { action = null; });
    action = { kind, promise };
    return promise;
  }
  return {
    initialize() {
      if (!initialization) {
        initialization = Promise.resolve().then(() => adapter.setSessionPersistence()).then(() => { ready = true; }).catch(error => { initialization = null; throw error; });
      }
      return initialization;
    },
    subscribe(onChange, onError) { return adapter.observe(onChange, onError); },
    signIn() { return run('sign-in', () => adapter.openGooglePopup()); },
    signOut() { return run('sign-out', () => adapter.signOut()); },
  };
}
