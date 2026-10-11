import { supabase } from './supabase.js';
// A missing RPC needs a database deployment, not another polling request.
// Keep this across hook remounts, presence updates and cleanup calls. Reload
// the page after deploying the migration to check the backend again.
let missingRpcError;
export async function nearbyCall(action, payload) {
 if(missingRpcError) throw missingRpcError;
 const {data,error}=await supabase.rpc('polygon_nearby',{action,payload});
 if(error) {
   if(error.code==='PGRST202') {
     missingRpcError=Object.assign(Error('Nearby is unavailable because its database update is missing. Ask the project administrator to complete the Nearby setup in SUPABASE_SETUP.md, then reload this page.'),{code:error.code});
     throw missingRpcError;
   }
   throw Object.assign(Error(error.message),{code:error.code});
 }
 return data;
}
export async function attestNetwork(zoneId) {
 const gateway=import.meta.env.VITE_LAN_GATEWAY_URL;
 if(!gateway) throw Error('This campus LAN gateway is not configured yet.');
 const url=new URL(gateway);
 if(url.protocol!=='https:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw Error('The campus gateway needs HTTPS.');
 const {data,error}=await supabase.auth.getSession();
 if(error||!data?.session) throw Error('Sign in before connecting to the campus network.');
 const response=await fetch(new URL('/attest',url),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({zoneId}),signal:AbortSignal.timeout(8000)});
 const result=await response.json();
 if(!response.ok) throw Error(result.error||'Unable to verify this campus network.');
 return result;
}
