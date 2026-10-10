import { useCampusZone } from '../context/CampusZoneContext.jsx';
import { useLiveLocation } from '../lib/useLiveLocation.js';
import { evaluateZone } from '../lib/geofence.js';
import { locationMessages } from '../lib/locationWatcher.js';

export default function StudentZoneCheck() {
  const { campusZone } = useCampusZone();
  const location = useLiveLocation();
  const result = location.active ? evaluateZone(location.position, campusZone) : { state:'unknown' };
  const labels = { inside:'Inside the campus zone', outside:'Outside the campus zone', uncertain:'Location is uncertain', unknown:'Location not confirmed', unconfigured:'No campus boundary available' };
  return <section className="location-panel" aria-labelledby="zone-check-title">
    <div className="location-heading"><span>⌖</span><h3 id="zone-check-title">Your live campus check</h3><span className="location-chip">{location.active ? 'LIVE' : 'OFF'}</span></div>
    {!campusZone ? <p className="dialog-help">No campus boundary is configured yet. Use “For colleges” to capture a campus centre, set the zone, and apply a local preview. Your real college’s approved boundary will be used once registration is connected.</p> : <>
      <p className="dialog-help"><strong>{campusZone.name}</strong> · {campusZone.type === 'radius' ? `${campusZone.radiusM} m radius` : 'Polygon boundary'} · local preview only</p>
      <p className="location-consent">Starting asks your browser for location and keeps checking while this dialog is open and this tab is visible. Stop at any time. Your precise position stays in memory and is not sent to Firebase.</p>
      <div className="location-actions"><button className="button button-dark" type="button" onClick={location.start} disabled={location.active}>Start live location</button><button className="button button-outline" type="button" onClick={location.stop} disabled={!location.active}>Stop / leave zone</button></div>
      <div className={`zone-result zone-${result.state}`} role="status" aria-live="polite"><strong>{labels[result.state]}</strong><p>{locationMessages[location.phase]}</p>{location.position && <p>Accuracy: approximately ±{Math.ceil(location.position.accuracy)} m{Number.isFinite(result.distance) ? ` · ${Math.round(result.distance)} m from campus centre` : ''}</p>}{result.state === 'uncertain' && <p>{result.reason === 'accuracy' ? 'Accuracy is too low. Try outdoors or wait for a better reading.' : 'Your accuracy range overlaps the boundary. Move farther from the edge or wait for a better reading.'}</p>}</div>
      <p className="dialog-help">GPS is an estimate and can be spoofed. This local check does not grant campus access; management approval and server checks are still required.</p>
    </>}
  </section>;
}
