import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useMembership } from '../context/MembershipContext.jsx';
import { getPosts, createPost, deletePost, db } from '../lib/firebase.js';
import { updateDoc, doc } from 'firebase/firestore';

const STATUS_META = {
  lost:     { emoji: '🔍', label: 'Lost',     color: '#a57849', bg: '#fff6e7' },
  found:    { emoji: '📦', label: 'Found',    color: '#4a7a3b', bg: '#e2ecd2' },
  reunited: { emoji: '🤝', label: 'Reunited', color: '#6b5088', bg: '#e8e2f0' },
};

export default function LiveFeed() {
  const { user } = useAuth();
  const { membership } = useMembership();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState('');
  const collegeId = membership?.collegeId;

  const loadPosts = useCallback(async () => {
    if (!collegeId) return;
    setLoading(true);
    try {
      const data = await getPosts(collegeId);
      data.sort((a, b) => {
        const ta = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const tb = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return tb - ta;
      });
      setPosts(data);
    } catch (err) {
      console.error('Failed to load posts:', err);
    } finally {
      setLoading(false);
    }
  }, [collegeId]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  }

  async function handleDelete(postId) {
    if (!confirm('Delete this post?')) return;
    try {
      await deletePost(postId);
      showToast('Post deleted.');
      loadPosts();
    } catch (err) { console.error(err); }
  }

  async function handleReunite(postId) {
    try {
      await updateDoc(doc(db, 'posts', postId), { status: 'reunited' });
    } catch { /* fallback */ }
    // Also update local
    const stored = JSON.parse(localStorage.getItem('polygon_posts') || '[]');
    const updated = stored.map(p => (p.id === postId || p.postId === postId) ? { ...p, status: 'reunited' } : p);
    localStorage.setItem('polygon_posts', JSON.stringify(updated));
    showToast('Marked as reunited! 🎉');
    loadPosts();
  }

  async function handleLike(postId) {
    // Local-only like toggle for now
    const key = `polygon_likes_${user.uid}`;
    const likes = JSON.parse(localStorage.getItem(key) || '{}');
    if (likes[postId]) { delete likes[postId]; } else { likes[postId] = true; }
    localStorage.setItem(key, JSON.stringify(likes));
    setPosts(prev => [...prev]); // trigger re-render
  }

  function isLiked(postId) {
    const key = `polygon_likes_${user.uid}`;
    const likes = JSON.parse(localStorage.getItem(key) || '{}');
    return !!likes[postId];
  }

  const filtered = posts.filter(p => filter === 'all' || p.status === filter);

  return <div className="insta-feed">
    {/* ── Feed header ── */}
    <div className="insta-feed-header">
      <div className="insta-feed-hero">
        <div className="insta-feed-hero-glow" />
        <div className="insta-feed-hero-text">
          <div className="eyebrow"><span className="status-dot" /> LIVE CAMPUS FEED</div>
          <h2>Lost & Found</h2>
          <p>Your campus community. Post, discover, and help reunite.</p>
        </div>
        <div className="insta-feed-hero-stats">
          <div className="insta-stat">
            <span className="insta-stat-num">{posts.length}</span>
            <span className="insta-stat-label">Posts</span>
          </div>
          <div className="insta-stat">
            <span className="insta-stat-num">{posts.filter(p => p.status === 'reunited').length}</span>
            <span className="insta-stat-label">Reunited</span>
          </div>
          <div className="insta-stat">
            <span className="insta-stat-num">{posts.filter(p => p.status === 'lost').length}</span>
            <span className="insta-stat-label">Active</span>
          </div>
        </div>
      </div>

      <div className="insta-toolbar">
        <div className="insta-filters">
          {['all', 'lost', 'found', 'reunited'].map(v => (
            <button key={v} className={`insta-filter-chip ${v === filter ? 'active' : ''}`} onClick={() => setFilter(v)}>
              {v === 'all' ? '✦ All' : `${STATUS_META[v].emoji} ${STATUS_META[v].label}`}
              <span className="insta-chip-count">{v === 'all' ? posts.length : posts.filter(p => p.status === v).length}</span>
            </button>
          ))}
        </div>
        <div className="insta-toolbar-actions">
          <button className="button button-dark insta-compose-btn" onClick={() => setShowCompose(!showCompose)}>
            {showCompose ? '✕ Cancel' : <><span>+</span> New Post</>}
          </button>
          <button className="insta-refresh-btn" onClick={loadPosts} title="Refresh feed">↻</button>
        </div>
      </div>
    </div>

    {/* ── Compose form ── */}
    {showCompose && <ComposeForm
      user={user}
      collegeId={collegeId}
      onPost={() => { setShowCompose(false); showToast('Post created! 🎉'); loadPosts(); }}
      onCancel={() => setShowCompose(false)}
    />}

    {/* ── Feed content ── */}
    {loading ? <FeedSkeleton /> :
      filtered.length === 0 ? <div className="insta-empty">
        <div className="insta-empty-icon">{filter === 'all' ? '📋' : STATUS_META[filter]?.emoji}</div>
        <h3>{filter === 'all' ? 'No posts yet' : `No ${filter} items`}</h3>
        <p>{filter === 'all' ? 'Be the first to post something on your campus feed!' : `No ${filter} items right now. Check back later.`}</p>
        {filter === 'all' && <button className="button button-dark" onClick={() => setShowCompose(true)}>
          <span>+</span> Create First Post
        </button>}
      </div> :
        <div className="insta-grid">
          {filtered.map((post, i) => (
            <PostCard
              key={post.id}
              post={post}
              user={user}
              index={i}
              liked={isLiked(post.id || post.postId)}
              onLike={() => handleLike(post.id || post.postId)}
              onReunite={() => handleReunite(post.id || post.postId)}
              onDelete={() => handleDelete(post.id || post.postId)}
            />
          ))}
        </div>
    }

    <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
  </div>;
}

/* ── Compose Form with image upload ── */
function ComposeForm({ user, collegeId, onPost, onCancel }) {
  const [formData, setFormData] = useState({ title: '', description: '', status: 'lost', place: '' });
  const [imagePreview, setImagePreview] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be under 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target.result);
      setImageData(ev.target.result);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.title.trim() || !formData.description.trim() || !formData.place.trim()) return;
    setSubmitting(true);
    try {
      await createPost({
        ...formData,
        title: formData.title.trim(),
        description: formData.description.trim(),
        place: formData.place.trim(),
        imageData: imageData || null,
        collegeId,
        authorUid: user.uid,
        authorName: user.displayName || 'Anonymous',
        authorEmail: user.email || '',
        authorPhoto: user.photoURL || '',
      });
      onPost();
    } catch (err) {
      console.error('Post creation error:', err);
      alert('Failed to create post. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="insta-compose" onSubmit={handleSubmit}>
    <div className="insta-compose-header">
      <div className="insta-compose-avatar">
        {user.photoURL
          ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
          : <span>{(user.displayName || 'A')[0].toUpperCase()}</span>}
      </div>
      <div>
        <strong>{user.displayName || 'You'}</strong>
        <span>Creating a new post</span>
      </div>
    </div>

    <div className="insta-compose-type">
      <button type="button" className={`insta-type-btn ${formData.status === 'lost' ? 'active lost' : ''}`}
        onClick={() => setFormData({ ...formData, status: 'lost' })}>
        🔍 I lost something
      </button>
      <button type="button" className={`insta-type-btn ${formData.status === 'found' ? 'active found' : ''}`}
        onClick={() => setFormData({ ...formData, status: 'found' })}>
        📦 I found something
      </button>
    </div>

    <div className="insta-compose-fields">
      <input
        value={formData.title}
        onChange={e => setFormData({ ...formData, title: e.target.value })}
        placeholder="What is the item?"
        maxLength={100}
        required
        className="insta-input"
      />
      <textarea
        value={formData.description}
        onChange={e => setFormData({ ...formData, description: e.target.value })}
        placeholder="Describe the item, when and where you saw it..."
        maxLength={500}
        required
        className="insta-textarea"
      />
      <div className="insta-compose-row">
        <div className="insta-input-wrap">
          <span className="insta-input-icon">⌖</span>
          <input
            value={formData.place}
            onChange={e => setFormData({ ...formData, place: e.target.value })}
            placeholder="Campus location (e.g. Library, Block A)"
            maxLength={80}
            required
            className="insta-input insta-input-icon-pad"
          />
        </div>
      </div>
    </div>

    {/* Image upload */}
    <div className="insta-compose-image-section">
      {imagePreview ? (
        <div className="insta-compose-preview">
          <img src={imagePreview} alt="Preview" />
          <button type="button" className="insta-preview-remove" onClick={() => { setImagePreview(null); setImageData(null); if (fileRef.current) fileRef.current.value = ''; }}>✕</button>
        </div>
      ) : (
        <button type="button" className="insta-add-image" onClick={() => fileRef.current?.click()}>
          <span className="insta-add-image-icon">📷</span>
          <span>Add a photo</span>
          <small>JPG, PNG · Max 2 MB</small>
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleImageSelect} />
    </div>

    <div className="insta-compose-actions">
      <button type="button" className="button button-outline" onClick={onCancel}>Cancel</button>
      <button type="submit" className="button button-dark" disabled={submitting}>
        {submitting ? <><span className="auth-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Posting…</> : <>Post to feed <span>↗</span></>}
      </button>
    </div>
  </form>;
}

/* ── Post Card (Instagram-like) ── */
function PostCard({ post, user, index, liked, onLike, onReunite, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[post.status] || STATUS_META.lost;
  const isOwner = post.authorUid === user?.uid;

  const timestamp = post.createdAt?.seconds
    ? post.createdAt.seconds * 1000
    : new Date(post.createdAt || Date.now()).getTime();

  return <article className="insta-card" style={{ animationDelay: `${index * 0.06}s` }}>
    {/* Card header: avatar + name */}
    <div className="insta-card-top">
      <div className="insta-card-author">
        {post.authorPhoto
          ? <img className="insta-card-avatar" src={post.authorPhoto} alt="" referrerPolicy="no-referrer" />
          : <span className="insta-card-avatar insta-card-avatar-fallback">{(post.authorName || 'A')[0].toUpperCase()}</span>}
        <div>
          <strong>{post.authorName || 'Anonymous'}</strong>
          <span>⌖ {post.place}</span>
        </div>
      </div>
      <span className="insta-card-badge" style={{ background: meta.bg, color: meta.color }}>
        {meta.emoji} {meta.label}
      </span>
    </div>

    {/* Image */}
    {post.imageData && (
      <div className="insta-card-image">
        <img src={post.imageData} alt={post.title} loading="lazy" />
      </div>
    )}

    {/* Actions row */}
    <div className="insta-card-actions">
      <button className={`insta-action-btn ${liked ? 'insta-liked' : ''}`} onClick={onLike} title="Like">
        {liked ? '❤️' : '🤍'}
      </button>
      {isOwner && post.status !== 'reunited' && (
        <button className="insta-action-btn" onClick={onReunite} title="Mark as reunited">🤝</button>
      )}
      {isOwner && (
        <button className="insta-action-btn insta-action-delete" onClick={onDelete} title="Delete">🗑</button>
      )}
      <span className="insta-card-time">{timeAgo(timestamp)}</span>
    </div>

    {/* Body */}
    <div className="insta-card-body">
      <h3>{post.title}</h3>
      <p className={expanded || post.description.length <= 120 ? '' : 'insta-truncated'}>
        {expanded || post.description.length <= 120 ? post.description : post.description.slice(0, 120) + '…'}
      </p>
      {post.description.length > 120 && !expanded && (
        <button className="insta-read-more" onClick={() => setExpanded(true)}>more</button>
      )}
    </div>
  </article>;
}

/* ── Skeleton loader ── */
function FeedSkeleton() {
  return <div className="insta-grid">
    {[0, 1, 2].map(i => (
      <div className="insta-skeleton" key={i}>
        <div className="insta-skel-header">
          <div className="insta-skel-circle" />
          <div className="insta-skel-lines"><div /><div /></div>
        </div>
        <div className="insta-skel-image" />
        <div className="insta-skel-body"><div /><div /><div /></div>
      </div>
    ))}
  </div>;
}

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
