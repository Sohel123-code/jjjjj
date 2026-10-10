import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useMembership } from '../context/MembershipContext.jsx';
import { useCampusZone } from '../context/CampusZoneContext.jsx';
import { useLiveLocation } from '../lib/useLiveLocation.js';
import { locationMessages } from '../lib/locationWatcher.js';
import { MAX_ACCURACY_M, centreFitsPolygon } from '../lib/geofence.js';
import { validateCollege } from '../lib/validation.js';
import { registerCollege } from '../lib/firebase.js';

export default function CollegeSetup() {
  const { user } = useAuth();
  const { adminCollege, refresh } = useMembership();
  const { campusZone, setCampusZone } = useCampusZone();
  const [centre, setCentre] = useState(campusZone?.centre || null);
  const [zoneType, setZoneType] = useState(campusZone?.type || 'radius');
  const [status, setStatus] = useState('');
  const [registeredId, setRegisteredId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const location = useLiveLocation();
  const reading = location.position;

  useEffect(() => {
    if (reading && reading.accuracy <= MAX_ACCURACY_M) {
      setCentre({ latitude:reading.latitude, longitude:reading.longitude, accuracy:reading.accuracy });
      location.stop();
      setStatus('Campus coordinates captured. Review your details and register below.');
    }
  }, [reading]);

  // If admin already has a college, show it
  if (adminCollege) {
    return <div className="college-registered">
      <div className="college-registered-header">
        <span className="college-registered-icon">✓</span>
        <div>
          <h3>College Registered</h3>
          <p>{adminCollege.name}</p>
        </div>
      </div>
      <div className="college-id-display large">
        <span className="college-id-label">YOUR COLLEGE ID</span>
        <span className="college-id-value">{adminCollege.collegeId}</span>
        <button className="button button-small button-outline" onClick={() => {
          navigator.clipboard?.writeText(adminCollege.collegeId);
          setStatus('Copied to clipboard!');
          setTimeout(() => setStatus(''), 2000);
        }}>Copy ID</button>
      </div>
      <p className="account-notice">Share this ID with your students. They'll use it to request membership. Go to the Dashboard to view and manage student requests.</p>
      {status && <p className="form-status">{status}</p>}
    </div>;
  }

  async function handleRegister(event) {
    event.preventDefault();
    if (!user) { setStatus('Please sign in first.'); return; }
    if (!centre) { setStatus('Capture your campus location first.'); return; }

    const values = Object.fromEntries(new FormData(event.currentTarget));
    const failure = validateCollege(values);
    if (failure) { setStatus(failure); return; }

    setSubmitting(true);
    try {
      const zone = {
        type: zoneType,
        centre,
        ...(zoneType === 'radius' ? { radiusM: Number(values.radius) } : { vertices: JSON.parse(values.vertices) })
      };

      if (zoneType === 'polygon' && !centreFitsPolygon({ ...zone, centre })) {
        setStatus('The polygon must contain the captured campus centre.');
        setSubmitting(false);
        return;
      }

      const collegeId = await registerCollege({
        name: values.name.trim(),
        email: values.email.trim(),
        adminUid: user.uid,
        adminName: user.displayName || '',
        adminEmail: user.email || '',
        zone,
      });

      setRegisteredId(collegeId);
      setCampusZone({ name: values.name.trim(), ...zone, preview: true });
      setStatus(`College registered successfully! Your unique College ID is ${collegeId}. Share it with your students.`);
      refresh();
    } catch (err) {
      console.error('Registration error:', err);
      setStatus('Registration failed. Please try again. Error: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  }

  function invalidatePreview() { setStatus(''); }

  return <>
    <p className="preview-notice">Register your college to generate a unique Campus ID. Students will use this ID to request membership to your campus community.</p>
    <form className="dialog-form" onSubmit={handleRegister}>
      <label className="field">College name<input name="name" placeholder="Your institution" defaultValue={campusZone?.name || ''} onChange={invalidatePreview} required maxLength={120}/></label>
      <label className="field">Institutional email<input name="email" type="email" placeholder="admin@yourcollege.edu" required maxLength={254}/></label>
      <section className="location-panel" aria-label="Capture campus location">
        <div className="location-heading"><span>⌖</span><h3>Use your live campus location</h3></div>
        <p className="location-consent">Stand at the intended campus centre, then allow location. We'll fill the coordinates automatically once accuracy is within ±100 m and stop.</p>
        <div className="location-actions"><button className="button button-dark" type="button" disabled={location.active} onClick={() => {setCentre(null);invalidatePreview();location.start();}}>{centre ? 'Recapture live location' : 'Use my current location'}</button>{location.active && <button className="button button-outline" type="button" onClick={location.stop}>Cancel</button>}</div>
        <p className="location-feedback" role="status">{centre && !location.active ? `Coordinates captured · accuracy approximately ±${Math.ceil(centre.accuracy)} m` : locationMessages[location.phase]}</p>
        {reading && reading.accuracy > MAX_ACCURACY_M && <p className="dialog-help">Current accuracy is ±{Math.ceil(reading.accuracy)} m. Waiting for a better reading.</p>}
      </section>
      <div className="field-row"><label className="field">Campus latitude<input name="latitude" readOnly value={centre ? centre.latitude.toFixed(7) : ''} placeholder="Filled from live location"/></label><label className="field">Campus longitude<input name="longitude" readOnly value={centre ? centre.longitude.toFixed(7) : ''} placeholder="Filled from live location"/></label></div>
      <label className="field">Zone boundary<select name="zoneType" value={zoneType} onChange={event=>{setZoneType(event.target.value);invalidatePreview();}}><option value="radius">Circle (live centre + radius)</option><option value="polygon">Polygon (boundary vertices)</option></select></label>
      {zoneType === 'radius' ? <label className="field">Radius in metres<input name="radius" type="number" min="50" max="10000" defaultValue={campusZone?.radiusM || 500} onChange={invalidatePreview} required/></label> : <label className="field">Closed polygon · [longitude, latitude] pairs<textarea name="vertices" defaultValue={campusZone?.vertices ? JSON.stringify(campusZone.vertices) : ''} placeholder="Use coordinates for the corners of your campus" onChange={invalidatePreview} required/></label>}
      <button className="button button-dark" type="submit" disabled={!centre || location.active || submitting}>
        {submitting ? <><span className="auth-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Registering…</> : <>Register College & Get ID <span>↗</span></>}
      </button>
    </form>
    {status && <p className="form-status" role="status">{status}</p>}
    {registeredId && <div className="college-id-display large" style={{ marginTop: 20 }}>
      <span className="college-id-label">YOUR COLLEGE ID</span>
      <span className="college-id-value">{registeredId}</span>
      <button className="button button-small button-outline" onClick={() => navigator.clipboard?.writeText(registeredId)}>Copy</button>
    </div>}
  </>;
}
