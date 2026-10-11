import { supabase } from './supabase.js';
async function rpc(action, payload) {
  const { data, error } = await supabase.rpc('polygon_api', { action, payload });
  if (error) {
    if (error.code === 'PGRST202') throw Error('The Polygon database update is not installed yet. Apply the migration in SUPABASE_SETUP.md.');
    throw Object.assign(Error(error.message || 'Could not reach your zone. Please retry.'), {code:error.code});
  }
  return data;
}
export async function zoneCall(action, data = {}) {
  const { image, ...payload } = data;
  if (!image) return rpc(action, payload);
  if (!['createPost', 'createGroup', 'comment', 'message'].includes(action)) throw Error('Photos are not supported for this action.');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) throw Error('Choose a JPEG, PNG or WebP photo.');
  const mime = image.slice(5, image.indexOf(';')), binary = atob(image.split(',')[1]);
  if (binary.length > 1024 * 1024) throw Error('Photo is too large. Please choose a smaller photo.');
  const blob = new Blob([Uint8Array.from(binary, c => c.charCodeAt(0))], { type: mime });
  const reservation = await rpc('prepareImage', { ...payload, contentAction: action, mime });
  let uploaded = false;
  try {
    const { error } = await supabase.storage.from('polygon-media').upload(reservation.path, blob, { contentType: mime, upsert: false });
    if (error) throw Error('Photo upload failed. ' + error.message);
    uploaded = true;
    return await rpc(action, { ...payload, imagePath: reservation.path });
  } catch (error) {
    if (uploaded) await supabase.storage.from('polygon-media').remove([reservation.path]);
    throw error;
  }
}
// Refreshes go through the same authorized RPC; no public activity channel.
export function subscribeSignal(zoneId, onChange) {
 const channel=supabase.channel('polygon-events-'+zoneId+'-'+crypto.randomUUID())
  .on('postgres_changes',{event:'*',schema:'public',table:'polygon_events',filter:'zone_id=eq.'+zoneId},onChange)
  .subscribe();
 return ()=>{supabase.removeChannel(channel);};
}
