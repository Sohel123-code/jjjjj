import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useMembership } from '../context/MembershipContext.jsx';
import { getCollege, submitJoinRequest } from '../lib/firebase.js';

export default function StudentJoinForm() {
  const { user } = useAuth();
  const { membership, refresh } = useMembership();
  const [step, setStep] = useState('form'); // form | verifying | submitted
  const [collegeId, setCollegeId] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [branch, setBranch] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState('');
  const [collegeName, setCollegeName] = useState('');

  if (!user) return null;

  // Already has a membership
  if (membership) {
    return <div className="join-status-card">
      <div className={`join-status-badge status-${membership.status}`}>
        {membership.status === 'accepted' ? '✓ Membership Active' : membership.status === 'pending' ? '⏳ Request Pending' : '✗ Request Rejected'}
      </div>
      <div className="join-status-details">
        <p><strong>College:</strong> {membership.collegeId}</p>
        <p><strong>Roll No:</strong> {membership.rollNumber}</p>
        <p><strong>Branch:</strong> {membership.branch}</p>
        <p><strong>Year:</strong> {membership.year}</p>
      </div>
      {membership.status === 'pending' && <p className="join-status-message">
        Your request has been sent to the college dashboard. You'll get access once the college admin accepts your request.
      </p>}
      {membership.status === 'accepted' && <p className="join-status-message join-status-success">
        🎉 You're in! You now have access to your campus lost & found feed.
      </p>}
      {membership.status === 'rejected' && <p className="join-status-message join-status-error">
        Your request was not approved. Contact your college administration for help.
      </p>}
      <button className="text-button" style={{ marginTop: 12 }} onClick={refresh}>↻ Check status</button>
    </div>;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!collegeId.trim()) { setError('Enter your college ID.'); return; }
    if (!rollNumber.trim()) { setError('Enter your roll number.'); return; }
    if (!branch.trim()) { setError('Select your branch.'); return; }
    if (!year.trim()) { setError('Select your year.'); return; }

    setStep('verifying');
    try {
      // Verify college exists
      const college = await getCollege(collegeId.trim().toUpperCase());
      if (!college) {
        setError('No college found with this ID. Check the code and try again.');
        setStep('form');
        return;
      }
      setCollegeName(college.name);

      // Submit join request
      await submitJoinRequest({
        collegeId: college.collegeId,
        uid: user.uid,
        displayName: user.displayName || '',
        email: user.email || '',
        rollNumber: rollNumber.trim().toUpperCase(),
        branch: branch.trim(),
        year: year.trim(),
      });

      setStep('submitted');
      refresh();
    } catch (err) {
      console.error('Join request error:', err);
      setError('Something went wrong. Please try again.');
      setStep('form');
    }
  }

  if (step === 'submitted') {
    return <div className="join-submitted">
      <span className="join-submitted-icon">✓</span>
      <h3>Request Sent!</h3>
      <p>Your membership request has been sent to <strong>{collegeName}</strong>. The college admin will review your details and accept or reject your request.</p>
      <div className="join-submitted-summary">
        <span>Roll: {rollNumber.toUpperCase()}</span>
        <span>Branch: {branch}</span>
        <span>Year: {year}</span>
      </div>
      <button className="text-button" style={{ marginTop: 16 }} onClick={refresh}>↻ Check status</button>
    </div>;
  }

  return <form className="student-join-form dialog-form" onSubmit={handleSubmit}>
    <div className="join-form-header">
      <span className="join-form-icon">🎓</span>
      <div>
        <h3>Join your campus</h3>
        <p>Enter the College ID shared by your institution and your student details.</p>
      </div>
    </div>

    <label className="field">
      College ID
      <input
        value={collegeId}
        onChange={e => { setCollegeId(e.target.value.toUpperCase()); setError(''); }}
        placeholder="e.g. PG-DEMO01 or PG-A3X7KW"
        maxLength={12}
        spellCheck="false"
        autoComplete="off"
        required
        disabled={step === 'verifying'}
      />
      <small style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.78rem', marginTop: 4 }}>
        Default Demo College ID: <strong style={{ color: 'var(--primary, #3b82f6)', cursor: 'pointer' }} onClick={() => setCollegeId('PG-DEMO01')}>PG-DEMO01</strong> (Click to auto-fill)
      </small>
    </label>

    <label className="field">
      Roll Number
      <input
        value={rollNumber}
        onChange={e => { setRollNumber(e.target.value); setError(''); }}
        placeholder="e.g. 22CS101"
        maxLength={20}
        spellCheck="false"
        autoComplete="off"
        required
        disabled={step === 'verifying'}
      />
    </label>

    <div className="field-row">
      <label className="field">
        Branch
        <select value={branch} onChange={e => { setBranch(e.target.value); setError(''); }} required disabled={step === 'verifying'}>
          <option value="">Select branch</option>
          <option value="CSE">Computer Science (CSE)</option>
          <option value="ECE">Electronics & Communication (ECE)</option>
          <option value="EEE">Electrical & Electronics (EEE)</option>
          <option value="ME">Mechanical Engineering (ME)</option>
          <option value="CE">Civil Engineering (CE)</option>
          <option value="IT">Information Technology (IT)</option>
          <option value="AI/ML">AI & Machine Learning</option>
          <option value="DS">Data Science</option>
          <option value="CYS">Cyber Security</option>
          <option value="BT">Biotechnology</option>
          <option value="CHE">Chemical Engineering</option>
          <option value="Other">Other</option>
        </select>
      </label>

      <label className="field">
        Year
        <select value={year} onChange={e => { setYear(e.target.value); setError(''); }} required disabled={step === 'verifying'}>
          <option value="">Select year</option>
          <option value="1st Year">1st Year</option>
          <option value="2nd Year">2nd Year</option>
          <option value="3rd Year">3rd Year</option>
          <option value="4th Year">4th Year</option>
          <option value="5th Year">5th Year</option>
          <option value="PG 1st Year">PG 1st Year</option>
          <option value="PG 2nd Year">PG 2nd Year</option>
        </select>
      </label>
    </div>

    {error && <p className="auth-error" role="alert">{error}</p>}

    <button className="button button-dark" type="submit" disabled={step === 'verifying'}>
      {step === 'verifying' ? <><span className="auth-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Verifying…</> : <>Submit Request <span>↗</span></>}
    </button>
    <p className="dialog-help">Your request will be visible to the college admin for approval.</p>
  </form>;
}
