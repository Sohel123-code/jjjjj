import { useEffect, useRef, useState } from 'react';
import { createLocationWatcher } from './locationWatcher.js';

export function useLiveLocation() {
  const [state, setState] = useState({ phase:'idle', position:null, active:false });
  const watcher = useRef(null);
  useEffect(() => {
    watcher.current = createLocationWatcher({ geolocation:navigator.geolocation, permissions:navigator.permissions, document, secure:window.isSecureContext },setState);
    return () => { watcher.current?.dispose(); watcher.current = null; };
  },[]);
  return { ...state, start:() => watcher.current?.start(), stop:() => watcher.current?.stop() };
}
