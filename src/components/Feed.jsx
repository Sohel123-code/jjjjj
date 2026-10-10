import { useState } from 'react';
import ItemArtwork from './ItemArtwork.jsx';

const posts = [
  { id: 'headphones', status: 'lost', title: 'A quiet campus. Too quiet.', description: 'Sage headphones, last seen near the library.', place: 'Central library', person: 'Ananya', initials: 'AK', expiry: 'Expires in 2 days' },
  { id: 'bottle', status: 'found', title: 'Someone’s hydration buddy.', description: 'Found this bottle at the student commons.', place: 'Student commons', person: 'Rohan', initials: 'RS', expiry: 'Expires in 1 day' },
  { id: 'keys', status: 'reunited', title: 'Back where they belong.', description: 'One set of keys. One very relieved human.', place: 'Main block', person: 'Meera', initials: 'MP', expiry: 'Reunited · sample' },
];

export default function Feed({ onOpen }) {
  const [filter, setFilter] = useState('all');
  const selected = posts.filter(post => filter === 'all' || post.status === filter);
  return <section className="discover-section" id="discover"><div className="section discover-inner">
    <div className="section-heading reveal"><div><div className="eyebrow">02 / LESS SCROLLING. MORE FINDING.</div><h2>Left behind.<br/><span>Not left alone.</span></h2></div><div className="discover-intro"><p>A campus-sized search party, in your pocket.<br/>Give lost things a way back to their people.</p><div className="sample-label"><span/> A peek at the feed · illustrative posts</div></div></div>
    <div className="feed-toolbar reveal"><div className="filter-tabs" role="group" aria-label="Filter sample posts">{['all', 'lost', 'found', 'reunited'].map(value => <button key={value} className={value === filter ? 'active' : ''} aria-pressed={value === filter} onClick={() => setFilter(value)}>{value === 'all' ? 'All items' : value.charAt(0).toUpperCase() + value.slice(1)}{value === 'all' && <span>3</span>}{value === 'reunited' && <span>♡</span>}</button>)}</div><span className="feed-zone">⌖ Within the campus</span></div>
    <div className="sr-only" role="status">{selected.length} sample {selected.length === 1 ? 'post' : 'posts'} shown</div>
    <div className="feed-grid" id="feed-grid">{selected.map(post => <article className="feed-card" key={post.id}>
      <button className="feed-photo" onClick={() => onOpen({ type:'item', post })} aria-label={`View sample post: ${post.title}`}><ItemArtwork item={post.id}/><span className={`post-status ${post.status}`}>{post.status === 'lost' ? '↗ LOST' : post.status === 'found' ? '⌕ FOUND' : '♡ REUNITED'}</span><span className="photo-count">⌖ {post.place}</span></button>
      <div className="post-body"><div className="post-top"><h3>{post.title}</h3><button className="post-more" onClick={() => onOpen({ type:'report', post })} aria-label={`Safety options for ${post.title}`}>···</button></div><p>{post.description}</p><div className="post-meta"><span className="post-person"><span className="avatar">{post.initials}</span><b>{post.person}</b></span><span>◷ {post.expiry}</span></div></div>
    </article>)}</div>
    <div className="reunion-note reveal"><span>✦</span><p><strong>A smarter way back.</strong> Match by item, place and time. Keep identifying details private until the owner can verify them.</p><button className="text-button" onClick={() => onOpen({ type:'claim' })}>Meet the claim flow <span>↗</span></button></div>
  </div></section>;
}
