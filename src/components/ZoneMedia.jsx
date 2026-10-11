import { useEffect, useId, useRef, useState } from 'react';
import { compressImage } from '../lib/imageCompressor.js';
import { supabase } from '../lib/supabase.js';
import { Dialog } from './ZoneUI.jsx';

export function PhotoPicker({ value, onChange, onBusy, disabled = false, label = 'Attach photo' }) {
  const id = useId(), generation = useRef(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => () => { generation.current++; }, []);
  async function select(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    const attempt = ++generation.current;
    setBusy(true); onBusy?.(true); setError('');
    try { const result = await compressImage(file); if (attempt === generation.current) onChange(result.dataUrl); }
    catch (failure) { if (attempt === generation.current) setError(failure.message); }
    finally { if (attempt === generation.current) { setBusy(false); onBusy?.(false); } }
  }
  return <div className="photo-picker">
    <label className={disabled || busy ? 'photo-attach disabled' : 'photo-attach'} htmlFor={id}><span aria-hidden="true">＋</span> {busy ? 'Preparing photo…' : label}</label>
    <input className="visually-hidden" id={id} type="file" aria-label={label} accept="image/jpeg,image/png,image/webp" onChange={select} disabled={disabled || busy}/>
    {value && <div className="attachment-preview"><img src={value} alt="Selected photo"/><button type="button" disabled={disabled} onClick={() => onChange(null)}>Remove photo</button></div>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}

export function ContentImage({ content, alt = 'Community photo' }) {
  const [url, setUrl] = useState(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false, objectUrl;
    setUrl(null); setFailed(false);
    if (!content.imagePath) { setUrl(content.image || null); return; }
    // Authenticated downloads: no public bucket URLs or reusable signed links.
    supabase.storage.from(content.imageBucket || 'polygon-media').download(content.imagePath).then(({data, error}) => {
      if (disposed) return;
      if (error) { setFailed(true); return; }
      objectUrl = URL.createObjectURL(data); setUrl(objectUrl);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [content.image, content.imagePath, content.imageBucket]);
  if (!content.image && !content.imagePath) return null;
  return <div className="content-photo">{failed ? <p className="tiny">Photo unavailable.</p> : url ? <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)}/> : <div className="image-loading skeleton" aria-label="Loading photo"/>}</div>;
}

export function DeleteContent({ content, api, run, busy, onDeleted, children = 'Delete' }) {
  const [confirm, setConfirm] = useState(false);
  return <><button type="button" className="text-button danger-text" onClick={() => setConfirm(true)}>{children}</button>
    {confirm && <Dialog title={'Delete this ' + (content.kind || 'post') + '?'} onClose={() => setConfirm(false)}>
      <p>This removes it from the community. {content.kind === 'group' ? 'Its messages will also be hidden.' : content.kind === 'post' ? 'Its comments will also be hidden.' : ''} Reports and moderation records may remain for review.</p>
      <div className="dialog-actions"><button className="button secondary" onClick={() => setConfirm(false)}>Keep it</button><button className="button primary" disabled={busy} onClick={() => run(async () => { await api('deleteContent', { target: content.id }); setConfirm(false); onDeleted?.(); }, 'Content deleted.')}>Delete permanently from view</button></div>
    </Dialog>}
  </>;
}
