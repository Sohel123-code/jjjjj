import { useEffect, useState } from 'react';
import { useMembership } from '../context/MembershipContext.jsx';
import { getJoinRequests, updateRequestStatus } from '../lib/firebase.js';

export default function CollegeDashboard() {
  const { adminCollege, refresh } = useMembership();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState('pending');

  async function loadRequests() {
    if (!adminCollege) return;
    setLoading(true);
    try {
      const data = await getJoinRequests(adminCollege.collegeId);
      data.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (b.status === 'pending' && a.status !== 'pending') return 1;
        return 0;
      });
      setRequests(data);
    } catch (err) {
      console.error('Failed to load requests:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadRequests(); }, [adminCollege]);

  async function handleAction(requestId, status) {
    setActionId(requestId);
    try {
      await updateRequestStatus(requestId, status);
      await loadRequests();
      refresh();
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setActionId(null);
    }
  }

  function handleCopy() {
    navigator.clipboard?.writeText(adminCollege.collegeId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!adminCollege) return null;

  const pending = requests.filter(r => r.status === 'pending');
  const accepted = requests.filter(r => r.status === 'accepted');
  const rejected = requests.filter(r => r.status === 'rejected');
  const tabData = tab === 'pending' ? pending : tab === 'accepted' ? accepted : rejected;

  return <section className="dash" aria-label="College dashboard">
    {/* ── Dashboard hero ── */}
    <div className="dash-hero">
      <div className="dash-hero-glow" />
      <div className="dash-hero-content">
        <div className="eyebrow" style={{ color: '#b8e89d' }}><span className="status-dot" style={{ background: '#8fce5a' }} /> COLLEGE DASHBOARD</div>
        <h2 className="dash-hero-title">{adminCollege.name}</h2>
        <p className="dash-hero-sub">Manage your campus community. Review and approve student membership requests.</p>
      </div>
      <div className="dash-hero-id">
        <span className="dash-id-label">YOUR COLLEGE ID</span>
        <span className="dash-id-value">{adminCollege.collegeId}</span>
        <button className="dash-copy-btn" onClick={handleCopy}>
          {copied ? '✓ Copied!' : '📋 Copy ID'}
        </button>
        <span className="dash-id-hint">Share this with students to join</span>
      </div>
    </div>

    {/* ── Stats cards ── */}
    <div className="dash-stats">
      <div className="dash-stat-card dash-stat-pending" onClick={() => setTab('pending')}>
        <span className="dash-stat-icon">⏳</span>
        <div>
          <span className="dash-stat-num">{pending.length}</span>
          <span className="dash-stat-label">Pending</span>
        </div>
      </div>
      <div className="dash-stat-card dash-stat-accepted" onClick={() => setTab('accepted')}>
        <span className="dash-stat-icon">✓</span>
        <div>
          <span className="dash-stat-num">{accepted.length}</span>
          <span className="dash-stat-label">Accepted</span>
        </div>
      </div>
      <div className="dash-stat-card dash-stat-rejected" onClick={() => setTab('rejected')}>
        <span className="dash-stat-icon">✗</span>
        <div>
          <span className="dash-stat-num">{rejected.length}</span>
          <span className="dash-stat-label">Rejected</span>
        </div>
      </div>
    </div>

    {/* ── Tab filters ── */}
    <div className="dash-tabs">
      {['pending', 'accepted', 'rejected'].map(t => (
        <button key={t} className={`dash-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
          {t === 'pending' ? '⏳' : t === 'accepted' ? '✓' : '✗'} {t.charAt(0).toUpperCase() + t.slice(1)}
          <span className="dash-tab-count">{(t === 'pending' ? pending : t === 'accepted' ? accepted : rejected).length}</span>
        </button>
      ))}
    </div>

    {/* ── Requests list ── */}
    {loading ? <div className="auth-loading" role="status"><span className="auth-spinner" /> Loading requests…</div> :
      tabData.length === 0 ? <div className="dash-empty">
        <span className="dash-empty-icon">{tab === 'pending' ? '📋' : tab === 'accepted' ? '🎉' : '📭'}</span>
        <h3>No {tab} requests</h3>
        <p>{tab === 'pending' ? 'No pending requests. Share your College ID with students to get started.' :
            tab === 'accepted' ? 'No accepted members yet.' : 'No rejected requests.'}</p>
      </div> :
        <div className="dash-requests">
          {tabData.map(r => (
            <div className={`dash-request-card ${r.status}`} key={r.id}>
              <div className="dash-req-top">
                <span className="dash-req-avatar">{(r.displayName || r.email || 'S')[0].toUpperCase()}</span>
                <div className="dash-req-info">
                  <strong>{r.displayName || 'Student'}</strong>
                  <span>{r.email}</span>
                </div>
                <span className={`dash-req-badge status-${r.status}`}>
                  {r.status === 'pending' ? '⏳ Pending' : r.status === 'accepted' ? '✓ Active' : '✗ Rejected'}
                </span>
              </div>
              <div className="dash-req-details">
                <div className="dash-req-field">
                  <span className="dash-req-field-label">Roll No.</span>
                  <span className="dash-req-field-value">{r.rollNumber}</span>
                </div>
                <div className="dash-req-field">
                  <span className="dash-req-field-label">Branch</span>
                  <span className="dash-req-field-value">{r.branch}</span>
                </div>
                <div className="dash-req-field">
                  <span className="dash-req-field-label">Year</span>
                  <span className="dash-req-field-value">{r.year}</span>
                </div>
              </div>
              <div className="dash-req-actions">
                {r.status === 'pending' ? <>
                  <button className="button button-dark button-small" disabled={actionId === r.id} onClick={() => handleAction(r.id, 'accepted')}>
                    {actionId === r.id ? <><span className="auth-spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /></> : '✓ Accept'}
                  </button>
                  <button className="button button-outline button-small" disabled={actionId === r.id} onClick={() => handleAction(r.id, 'rejected')}>
                    ✗ Reject
                  </button>
                </> : r.status === 'accepted' ?
                  <button className="button button-outline button-small" disabled={actionId === r.id} onClick={() => handleAction(r.id, 'rejected')}>Revoke Access</button>
                  : <button className="button button-outline button-small" disabled={actionId === r.id} onClick={() => handleAction(r.id, 'accepted')}>Re-accept</button>}
              </div>
            </div>
          ))}
        </div>
    }

    <button className="text-button" style={{ marginTop: 24, fontSize: 12 }} onClick={loadRequests}>↻ Refresh requests</button>
  </section>;
}
