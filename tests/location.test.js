import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceMetres, evaluateZone, centreFitsPolygon, MAX_FIX_AGE_MS } from '../src/lib/geofence.js';
import { createLocationWatcher } from '../src/lib/locationWatcher.js';

const now = 100000;
const fix = (latitude=0,longitude=0,accuracy=5) => ({latitude,longitude,accuracy,timestamp:now});
const circle = {type:'radius',centre:{latitude:0,longitude:0},radiusM:500};
const polygon = {type:'polygon',centre:{latitude:0,longitude:0},vertices:[[-.005,-.005],[.005,-.005],[.005,.005],[-.005,.005],[-.005,-.005]]};
test('distance uses metres and wraps longitude across the date line',()=>{
  assert.ok(Math.abs(distanceMetres({latitude:0,longitude:0},{latitude:1,longitude:0})-111195)<2);
  assert.ok(distanceMetres({latitude:0,longitude:179.999},{latitude:0,longitude:-179.999})<230);
});
test('circle check accounts for accuracy at inside, outside and boundary',()=>{
  assert.equal(evaluateZone(fix(),circle,now).state,'inside');
  assert.equal(evaluateZone(fix(.01),circle,now).state,'outside');
  assert.equal(evaluateZone(fix(.00449,0,20),circle,now).state,'uncertain');
  assert.equal(evaluateZone(fix(0,0,400),circle,now).state,'uncertain');
});
test('missing, stale, malformed and future fixes never establish presence',()=>{
  for(const reading of [null,{...fix(),timestamp:now-MAX_FIX_AGE_MS-1},{...fix(),timestamp:now+10000},{...fix(),accuracy:-1},{...fix(),latitude:91},{...fix(),longitude:NaN}]) assert.equal(evaluateZone(reading,circle,now).state,'unknown');
  assert.equal(evaluateZone(fix(),null,now).state,'unconfigured');
});
test('polygon evaluates its actual edges, not only distance from centre',()=>{
  assert.equal(evaluateZone(fix(),polygon,now).state,'inside');
  assert.equal(evaluateZone(fix(0,.006),polygon,now).state,'outside');
  assert.equal(evaluateZone(fix(0,.005),polygon,now).state,'uncertain');
  assert.equal(centreFitsPolygon(polygon),true);
  assert.equal(centreFitsPolygon({...polygon,centre:{latitude:.02,longitude:.02}}),false);
});
test('concave campus excludes its inward notch',()=>{
  const zone={type:'polygon',centre:{latitude:.001,longitude:.001},vertices:[[0,0],[.01,0],[.01,.003],[.003,.003],[.003,.01],[0,.01],[0,0]]};
  assert.equal(evaluateZone(fix(.007,.001),zone,now).state,'inside');
  assert.equal(evaluateZone(fix(.007,.007),zone,now).state,'outside');
  assert.equal(evaluateZone(fix(),{...polygon,vertices:[[0,0],[1,0],[1,1],[0,0]]},now).state,'unconfigured');
});

function harness(extra={}) {
  let time=now, success, failure, timer;const states=[],cleared=[];
  const page=new EventTarget();page.hidden=false;page.defaultView=new EventTarget();
  const permission=new EventTarget();permission.state='granted';
  const environment={
    geolocation:{watchPosition(onSuccess,onError,options){success=onSuccess;failure=onError;assert.equal(options.maximumAge,0);return 0;},clearWatch(id){cleared.push(id);}},
    permissions:{query:async()=>permission},document:page,secure:true,now:()=>time,
    setInterval(fn){timer=fn;return 0;},clearInterval(){timer=null;},...extra,
  };
  const watcher=createLocationWatcher(environment,state=>states.push(state));
  return {watcher,states,cleared,page,permission,emit:(reading=fix())=>success({coords:reading,timestamp:reading.timestamp}),fail:code=>failure({code}),tick:(ms)=>{time+=ms;timer?.();},last:()=>states.at(-1)};
}
test('tracking is opt-in and stop clears watcher ID zero and drops late callbacks',()=>{
  const h=harness();assert.equal(h.states.length,0);
  h.watcher.start();h.emit();assert.equal(h.last().phase,'live');h.watcher.stop();
  assert.deepEqual(h.cleared,[0]);assert.equal(h.last().position,null);
  const count=h.states.length;h.emit();assert.equal(h.states.length,count);h.watcher.dispose();
});
test('an old reading loses inside status while a new reading can restore the check',()=>{
  const h=harness();h.watcher.start();h.emit();h.tick(31000);
  assert.equal(h.last().phase,'stale');assert.equal(h.last().position,null);assert.equal(h.last().active,true);
  h.emit({...fix(),timestamp:now+31000});assert.equal(h.last().phase,'live');h.watcher.dispose();
});
test('hiding the tab stops location and returning does not restart it',()=>{
  const h=harness();h.watcher.start();h.emit();h.page.hidden=true;h.page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.last().phase,'paused');assert.equal(h.last().position,null);assert.equal(h.last().active,false);
  h.page.hidden=false;h.page.dispatchEvent(new Event('visibilitychange'));assert.equal(h.last().phase,'paused');h.watcher.dispose();
});
test('permission revocation stops a running watcher and clears its position',async()=>{
  const h=harness();h.watcher.start();h.emit();await new Promise(resolve=>setImmediate(resolve));
  h.permission.state='denied';h.permission.dispatchEvent(new Event('change'));
  assert.equal(h.last().phase,'denied');assert.equal(h.last().active,false);assert.equal(h.last().position,null);h.watcher.dispose();
});
test('timeout, denied and unavailable errors stop the watch and support explicit retry',()=>{
  for(const [code,phase] of [[1,'denied'],[2,'unavailable'],[3,'timeout']]) {
    const h=harness();h.watcher.start();h.fail(code);assert.equal(h.last().phase,phase);assert.equal(h.last().active,false);
    h.watcher.start();h.emit();assert.equal(h.last().phase,'live');h.watcher.dispose();
  }
});
test('unmount drops updates and a permission response arriving after stop is ignored',async()=>{
  let resolve;const query=new Promise(r=>{resolve=r;});const h=harness({permissions:{query:()=>query}});
  h.watcher.start();h.emit();h.watcher.dispose();const count=h.states.length;
  resolve(h.permission);await new Promise(r=>setImmediate(r));h.emit();h.permission.dispatchEvent(new Event('change'));
  assert.equal(h.states.length,count);assert.deepEqual(h.cleared,[0]);
});
test('insecure and unsupported environments never request location',()=>{
  for(const [extra,phase] of [[{secure:false},'insecure'],[{geolocation:null},'unsupported']]) {
    const h=harness(extra);h.watcher.start();assert.equal(h.last().phase,phase);assert.equal(h.last().active,false);h.watcher.dispose();
  }
});
test('initial location requests time out even if the browser never calls back',()=>{
  const h=harness();h.watcher.start();h.tick(21000);assert.equal(h.last().phase,'timeout');assert.equal(h.last().position,null);h.watcher.dispose();
});
