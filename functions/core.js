export const DEFAULT_DOMAINS = [
  { id:'study', name:'Study', icon:'📚', topics:['DSA','DBMS','OS','AI/ML','Web Development','Competitive Programming','Other subjects'] },
  { id:'hangouts', name:'Night Hangouts', icon:'🌙', topics:['Night walks','Food','Discussions','Local activities'] },
  { id:'projects', name:'Project Development', icon:'🚀', topics:['Hackathons','Web development','AI/ML','App development','Research','Team formation'] },
];
export const CATEGORIES = ['post','lost','found','question','offer','announcement','event'];
export const REASONS = ['Harassment','Abuse','Spam','Scam','Inappropriate content','Fraud','Other'];
export function fail(message, code='invalid-argument') { throw Object.assign(new Error(message),{code}); }
export function clean(value, max=2000, required=true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`Enter text between 1 and ${max} characters.`);
  return value.trim().normalize('NFKC');
}
export function id(value) { if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value || '')) fail('Invalid reference.'); return value; }
export function contactInfo(text) {
  const normalized=text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/[०-९]/g,c=>String(c.charCodeAt(0)-0x0966)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x0660));
  return /[\w.+-]+\s*@\s*[\w.-]+\s*\.\s*[a-z]{2,}/i.test(normalized)
    || /-?\d{1,3}\.\d{4,}\s*[,;]\s*-?\d{1,3}\.\d{4,}/.test(normalized)
    || /(?:\+?\d[\s().-]*){10,15}/.test(normalized)
    || /\b[\w.+-]+\s*(?:\[at\]|\(at\)| at )\s*[\w.-]+\s*(?:\[dot\]|\(dot\)| dot )\s*[a-z]{2,}\b/i.test(normalized);
}
const radians=d=>d*Math.PI/180;
export function distance(a,b) { const p=radians(b.latitude-a.latitude), q=radians(b.longitude-a.longitude); const h=Math.sin(p/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(q/2)**2;return 6371008.8*2*Math.asin(Math.min(1,Math.sqrt(h))); }
const coordinate=p=>p && Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<85&&Math.abs(p.longitude)<=180;
export function validateBoundary(b) {
  if (!coordinate(b?.centre)) fail('Choose a valid zone centre below 85° latitude.');
  if(b.type==='radius') { if(!Number.isFinite(b.radiusM)||b.radiusM<50||b.radiusM>10000)fail('Radius must be 50–10,000 metres.'); return {type:b.type,centre:b.centre,radiusM:b.radiusM}; }
  const v=b.vertices;
  if(b.type!=='polygon'||!Array.isArray(v)||v.length<4||v.length>101||v.some(p=>!Array.isArray(p)||p.length!==2||!coordinate({longitude:p[0],latitude:p[1]})||distance(b.centre,{longitude:p[0],latitude:p[1]})>10000))fail('Use a closed polygon with 3–100 vertices within 10 km of its centre.');
  if(JSON.stringify(v[0])!==JSON.stringify(v.at(-1))||new Set(v.slice(0,-1).map(p=>p.join(','))).size!==v.length-1)fail('Close the polygon and use distinct vertices.');
  const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const on=(a,b,p)=>Math.abs(orient(a,b,p))<1e-12&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);
  for(let i=0;i<v.length-1;i++)for(let j=i+2;j<v.length-1;j++) {if(i===0&&j===v.length-2)continue;const [a,b,c,d]=[v[i],v[i+1],v[j],v[j+1]];if(orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))fail('Polygon edges must not intersect.');}
  if(Math.abs(v.slice(0,-1).reduce((s,p,i)=>s+p[0]*v[i+1][1]-v[i+1][0]*p[1],0))<1e-10)fail('Polygon must enclose an area.');
  if(!polygonPoint(b.centre,b).inside)fail('Zone centre must lie inside its polygon.');
  return {type:'polygon',centre:b.centre,vertices:v};
}
function polygonPoint(p,b) {
  const project=([lng,lat])=>[radians(lng-b.centre.longitude)*6371008.8*Math.cos(radians(b.centre.latitude)),radians(lat-b.centre.latitude)*6371008.8];
  const [x,y]=project([p.longitude,p.latitude]);const v=b.vertices.map(project);let inside=false,edge=Infinity;
  for(let i=0;i<v.length-1;i++){const [ax,ay]=v[i],[bx,by]=v[i+1];if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));edge=Math.min(edge,Math.hypot(x-ax-t*dx,y-ay-t*dy));}
  return {inside,edge};
}
export function checkLocation(fix,b,now=Date.now()) {
  if(!coordinate(fix)||!Number.isFinite(fix.accuracy)||fix.accuracy<0||!Number.isFinite(fix.timestamp)||now-fix.timestamp>30000||fix.timestamp>now+5000)return 'unavailable';
  if(fix.accuracy>100)return 'inaccurate';
  if(b.type==='radius'){const d=distance(fix,b.centre),margin=fix.accuracy+2;return d+margin<b.radiusM?'inside':d-margin>b.radiusM?'outside':'inaccurate';}
  const p=polygonPoint(fix,b);return p.edge<=fix.accuracy+5?'inaccurate':p.inside?'inside':'outside';
}
export function expiry(hours,now=Date.now()) { const n=Number(hours);if(!Number.isFinite(n)||n<1/60||n>168)fail('Expiry must be between 1 minute and 7 days.');return now+n*3600000; }
export function canRead(member,session,now=Date.now(),management=false) {return member?.status==='active'&&(management?member.role==='admin':session?.expiresAt>now);}
export function visible(item,blocked,now=Date.now()) {return item.status==='active'&&item.expiresAt>now&&!blocked.has(item.authorId);}
export function safeMatches(result,candidates) {
  const ids=new Set(candidates.map(c=>c.id));
  return (Array.isArray(result.matches)?result.matches:[]).filter(m=>ids.has(m.id)&&Number.isFinite(m.confidence)&&m.confidence>=.55&&m.confidence<=1&&typeof m.reason==='string'&&!contactInfo(m.reason)).slice(0,3).map(m=>({id:m.id,confidence:m.confidence,reason:m.reason.slice(0,240)}));
}
