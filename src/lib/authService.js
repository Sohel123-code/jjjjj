export function authErrorMessage(error) {
  const code = error?.code || '';
  switch (code) {
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups for this site and retry.';
    case 'auth/popup-closed-by-user':
      return 'Sign-In Cancelled: The Google sign-in window was closed before completing. Please click sign-in again.';
    case 'auth/unauthorized-domain':
      return 'Unauthorized Domain: This website domain (e.g., localhost or Vercel URL) is not listed in Firebase Console > Authentication > Settings > Authorized Domains.';
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return 'The Google provider is not enabled. Enable it in Firebase Authentication > Sign-in method.';
    case 'auth/network-request-failed':
      return 'Network Error: Unable to reach Google sign-in servers. Please check your internet connection and try again.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in window is already open. Please finish or close that window first.';
    case 'auth/too-many-requests':
      return 'Too many failed sign-in attempts. Please wait a moment and try again.';
    case 'auth/user-disabled':
      return 'This user account has been disabled by an administrator.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with the same email address under a different sign-in method.';
    case 'auth/web-storage-unsupported':
      return 'Web storage is disabled in this browser. Please enable cookies and storage to sign in.';
    case 'auth/invalid-api-key':
    case 'auth/app-not-authorized':
      return 'Invalid Firebase API Key or App credentials. Check your firebaseConfig settings.';
    case 'auth/not-ready':
      return 'Authentication service is initializing. Please try clicking sign-in again in a moment.';
    case 'auth/operation-in-progress':
      return 'Sign-in is currently in progress. Please complete the open sign-in popup.';
    default:
      return 'Could not complete Google sign-in. Please try again.';
  }
}

// Adapter boundary for testability and clean execution
export function createAuthService(adapter) {
  let initialization = null;
  let ready = false;
  let action = null;

  function run(kind, operation) {
    if (!ready) return Promise.reject(Object.assign(new Error('Auth is initializing'), { code:'auth/not-ready' }));
    if (action) {
      return action.kind === kind
        ? action.promise
        : Promise.reject(Object.assign(new Error('Auth action in progress'), { code: 'auth/operation-in-progress' }));
    }
    // Synchronously execute inside click handler to preserve browser popup user gesture activation
    let result;
    try {
      result = operation();
    } catch (error) {
      return Promise.reject(error);
    }
    const promise = Promise.resolve(result).finally(() => {
      action = null;
    });
    action = { kind, promise };
    return promise;
  }

  return {
    initialize() {
      if (!initialization) {
        
        initialization = Promise.resolve()
          .then(() => adapter.setSessionPersistence())
          .then(() => { ready = true; })
          .catch((error) => {
            ready = false;
            initialization = null;
            throw error;
          });
      }
      return initialization;
    },
    subscribe(onChange, onError) {
      return adapter.observe(onChange, onError);
    },
    signIn(useRedirect = false) {
      return run('sign-in', () => (useRedirect ? adapter.openGoogleRedirect() : adapter.openGooglePopup()));
    },
    signOut() {
      return run('sign-out', () => adapter.signOut());
    },
    getRedirectResult() {
      return adapter.getRedirectResult ? adapter.getRedirectResult() : Promise.resolve(null);
    }
  };
}
