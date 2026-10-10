export function validateCollege(values) {
  if (!values.name?.trim()) return 'Enter your college name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email?.trim() || '')) return 'Enter a valid institutional email address.';
  const lat = Number(values.latitude), lng = Number(values.longitude);
  if (!values.latitude?.trim() || !Number.isFinite(lat) || lat < -90 || lat > 90) return 'Latitude must be between -90 and 90.';
  if (!values.longitude?.trim() || !Number.isFinite(lng) || lng < -180 || lng > 180) return 'Longitude must be between -180 and 180.';
  if (values.zoneType === 'radius') {
    const radius = Number(values.radius);
    if (!Number.isFinite(radius) || radius < 50 || radius > 10000) return 'Choose a radius between 50 and 10,000 metres.';
  } else {
    let points;
    try { points = JSON.parse(values.vertices); } catch { return 'Enter polygon vertices as a JSON array of [longitude, latitude] pairs.'; }
    if (!Array.isArray(points) || points.length < 4 || points.length > 101) return 'Use 3–100 vertices, then repeat the first point to close the polygon.';
    if (points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) return 'Each vertex needs a valid [longitude, latitude] pair.';
    if (points[0][0] !== points.at(-1)[0] || points[0][1] !== points.at(-1)[1]) return 'Repeat the first vertex at the end to close the polygon.';
    if (new Set(points.slice(0,-1).map(p=>p.join(','))).size !== points.length-1) return 'Polygon vertices must be distinct, except for the closing point.';
    const area = points.slice(0,-1).reduce((sum,p,i)=>sum+p[0]*points[i+1][1]-points[i+1][0]*p[1],0);
    if (Math.abs(area) < 1e-10) return 'The polygon must enclose an area.';
    const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const onSegment=(a,b,p)=>Math.abs(orient(a,b,p))<1e-12 && p[0]>=Math.min(a[0],b[0])-1e-12 && p[0]<=Math.max(a[0],b[0])+1e-12 && p[1]>=Math.min(a[1],b[1])-1e-12 && p[1]<=Math.max(a[1],b[1])+1e-12;
    const crosses=(a,b,c,d)=> orient(a,b,c)*orient(a,b,d)<0 && orient(c,d,a)*orient(c,d,b)<0 || onSegment(a,b,c) || onSegment(a,b,d) || onSegment(c,d,a) || onSegment(c,d,b);
    for(let i=0;i<points.length-1;i++) for(let j=i+2;j<points.length-1;j++) {
      if(i===0 && j===points.length-2) continue;
      if(crosses(points[i],points[i+1],points[j],points[j+1])) return 'Polygon edges must not cross or overlap.';
    }
  }
  return null;
}

export function validateInvite(value) {
  return /^[A-Z0-9-]{6,40}$/i.test(value.trim()) ? null : 'Enter the 6–40 character invite code issued by your college.';
}
