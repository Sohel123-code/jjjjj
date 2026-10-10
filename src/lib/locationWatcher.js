import { validFix, MAX_FIX_AGE_MS } from './geofence.js';

export function createLocationWatcher(environment, notify) {
  const { geolocation, permissions, document: page, secure = true, now = Date.now, setInterval: every = globalThis.setInterval, clearInterval: cancel = globalThis.clearInterval } = environment;
  let watchId = null, interval = null, permission = null, generation = 0, active = false, disposed = false, startedAt = 0;
  let position = null, hasFix = false;
  const emit = (phase, nextPosition = null) => { position = nextPosition; if (!disposed) notify({ phase, position, active }); };
  const permissionChange = () => { if (permission?.state === 'denied') stop('denied'); };
  function clear() {
    generation++; active = false;
    if (watchId !== null) geolocation.clearWatch(watchId);
    if (interval !== null) cancel(interval);
    permission?.removeEventListener('change', permissionChange);
    watchId = null; interval = null; permission = null; position = null;
  }
  function stop(phase = 'stopped') { clear(); emit(phase); }
  function start() {
    if (disposed) return;
    clear();
    if (!secure) { emit('insecure'); return; }
    if (!geolocation?.watchPosition) { emit('unsupported'); return; }
    if (page?.hidden) { emit('paused'); return; }
    active = true; startedAt = now(); hasFix = false;
    const token = generation;
    emit('requesting');
    try {
      const id = geolocation.watchPosition(reading => {
        if (!active || token !== generation || disposed) return;
        const next = { latitude: reading.coords.latitude, longitude: reading.coords.longitude, accuracy: reading.coords.accuracy, timestamp: reading.timestamp };
        if (position && next.timestamp < position.timestamp) return;
        if (!validFix(next, now())) { emit('stale'); return; }
        hasFix = true; emit('live', next);
      }, failure => {
        if (!active || token !== generation || disposed) return;
        stop(({ 1:'denied', 2:'unavailable', 3:'timeout' })[failure.code] || 'error');
      }, { enableHighAccuracy:true, maximumAge:0, timeout:15000 });
      // Also handle a synchronous callback from a platform adapter/test double.
      if (active && token === generation) watchId = id;
      else geolocation.clearWatch(id);
    } catch { if (active && token === generation) stop('error'); }
    if (!active) return;
    interval = every(() => {
      if (position && now() - position.timestamp > MAX_FIX_AGE_MS) emit('stale');
      else if (!hasFix && now() - startedAt > 20000) stop('timeout');
    },1000);
    if (permissions?.query) {
      Promise.resolve().then(() => permissions.query({ name:'geolocation' })).then(result => {
        if (!active || disposed || token !== generation) return;
        permission = result;
        permission.addEventListener('change', permissionChange);
        permissionChange();
      }).catch(() => { /* Safari/older browsers may not implement this query. */ });
    }
  }
  const visibilityChange = () => { if (page.hidden && active) stop('paused'); };
  const pageHide = () => { if (active) stop('paused'); };
  page?.addEventListener('visibilitychange', visibilityChange);
  page?.defaultView?.addEventListener('pagehide', pageHide);
  return { start, stop, dispose() {
    disposed = true; clear();
    page?.removeEventListener('visibilitychange', visibilityChange);
    page?.defaultView?.removeEventListener('pagehide', pageHide);
  } };
}

export const locationMessages = {
  idle: 'Location is off. Start when you are ready.',
  requesting: 'Waiting for location permission and a fresh reading…',
  live: 'Live location is active.',
  stale: 'The last reading is too old. Waiting for a fresh location…',
  stopped: 'Location stopped. The live reading has been cleared.',
  paused: 'Location stopped when this tab was hidden. Start again to resume.',
  denied: 'Location permission is blocked. Allow it in your browser’s site settings, then retry.',
  unavailable: 'Your device could not determine its location. Check device location settings or try outdoors.',
  timeout: 'A fresh location could not be obtained in time. Move near a window or outdoors, then retry.',
  unsupported: 'This browser does not support location. Try a supported browser on your phone.',
  insecure: 'Location needs HTTPS or localhost. Open the secure site to continue.',
  error: 'The location check could not start. Check your browser settings and retry.',
};
