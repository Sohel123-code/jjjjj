const EARTH_M = 6371008.8;
const radians = degrees => degrees * Math.PI / 180;
const wrapLongitude = value => ((value + 540) % 360) - 180;
export const MAX_FIX_AGE_MS = 30000;
export const MAX_ACCURACY_M = 100;

export function validCoordinate(point) {
  return point && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}
export function distanceMetres(a, b) {
  const dLat = radians(b.latitude - a.latitude), dLng = radians(wrapLongitude(b.longitude - a.longitude));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return EARTH_M * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function validFix(fix, now = Date.now()) {
  return validCoordinate(fix) && Number.isFinite(fix.accuracy) && fix.accuracy >= 0 && Number.isFinite(fix.timestamp) && now - fix.timestamp <= MAX_FIX_AGE_MS && fix.timestamp <= now + 5000;
}

// Campus-scale tangent-plane approximation. Boundaries are limited to 10 km
// from their centre, below 85 degrees latitude; a 5 m edge margin is conservative.
function polygonPosition(point, zone) {
  const origin = zone.centre;
  const project = ([lng, lat]) => [radians(wrapLongitude(lng - origin.longitude)) * EARTH_M * Math.cos(radians(origin.latitude)), radians(lat - origin.latitude) * EARTH_M];
  const [x, y] = project([point.longitude, point.latitude]);
  const vertices = zone.vertices.map(project);
  let inside = false, edgeDistance = Infinity;
  for (let i = 0; i < vertices.length - 1; i++) {
    const [ax, ay] = vertices[i], [bx, by] = vertices[i + 1];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    const dx = bx - ax, dy = by - ay, lengthSq = dx * dx + dy * dy;
    const t = lengthSq ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq)) : 0;
    edgeDistance = Math.min(edgeDistance, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return { inside, edgeDistance };
}

export function evaluateZone(fix, zone, now = Date.now()) {
  if (!zone || !validCoordinate(zone.centre)) return { state: 'unconfigured' };
  if (!validFix(fix, now)) return { state: 'unknown' };
  const distance = distanceMetres(fix, zone.centre);
  if (fix.accuracy > MAX_ACCURACY_M) return { state: 'uncertain', reason:'accuracy', distance };
  if (zone.type === 'radius' && Number.isFinite(zone.radiusM) && zone.radiusM >= 50 && zone.radiusM <= 10000) {
    const margin = fix.accuracy + 2;
    return { state: distance + margin < zone.radiusM ? 'inside' : distance - margin > zone.radiusM ? 'outside' : 'uncertain', reason:'boundary', distance };
  }
  if (zone.type !== 'polygon' || !Array.isArray(zone.vertices) || zone.vertices.length < 4 || zone.vertices.some(p => !Array.isArray(p) || !validCoordinate({ longitude:p[0], latitude:p[1] })) || Math.abs(zone.centre.latitude) > 85) return { state:'unconfigured' };
  if (zone.vertices.some(([longitude,latitude]) => distanceMetres(zone.centre,{longitude,latitude}) > 10000)) return { state:'unconfigured' };
  if (zone.vertices[0][0] !== zone.vertices.at(-1)[0] || zone.vertices[0][1] !== zone.vertices.at(-1)[1]) return { state:'unconfigured' };
  const result = polygonPosition(fix, zone);
  return { state: result.edgeDistance <= fix.accuracy + 5 ? 'uncertain' : result.inside ? 'inside' : 'outside', reason:'boundary', distance };
}

export function centreFitsPolygon(zone) {
  if (Math.abs(zone.centre.latitude) > 85 || zone.vertices.some(([longitude,latitude]) => distanceMetres(zone.centre,{longitude,latitude}) > 10000)) return false;
  const result = polygonPosition(zone.centre, zone);
  return result.inside || result.edgeDistance < 1;
}
