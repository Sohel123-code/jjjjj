import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService, authErrorMessage } from '../src/lib/authService.js';

function deferred() { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }
function makeService(overrides={}) {
  return createAuthService({setSessionPersistence:async()=>{},observe:()=>()=>{},openGooglePopup:async()=>({user:{uid:'test'}}),signOut:async()=>{},...overrides});
}

test('does not open Google before the session persistence policy is ready',async()=>{
  let calls=0;const persistence=deferred();const service=makeService({setSessionPersistence:()=>persistence.promise,openGooglePopup:()=>{calls++;}});
  const ready=service.initialize();
  await assert.rejects(service.signIn(),{code:'auth/not-ready'});
  assert.equal(calls,0);persistence.resolve();await ready;await service.signIn();assert.equal(calls,1);
});
test('deduplicates concurrent sign-ins and prevents racing logout against a popup',async()=>{
  let calls=0;const popup=deferred();const service=makeService({openGooglePopup:()=>{calls++;return popup.promise;}});
  await service.initialize();const first=service.signIn(),second=service.signIn();
  assert.equal(first,second);assert.equal(calls,1);
  await assert.rejects(service.signOut(),{code:'auth/operation-in-progress'});
  popup.resolve({user:{uid:'test'}});await first;await service.signOut();
});
test('a cancelled Google popup can be retried without reloading',async()=>{
  let calls=0;const service=makeService({openGooglePopup:async()=>{if(calls++===0)throw {code:'auth/popup-closed-by-user'};return {user:{uid:'test'}};}});
  await service.initialize();await assert.rejects(service.signIn(),{code:'auth/popup-closed-by-user'});
  assert.equal((await service.signIn()).user.uid,'test');assert.equal(calls,2);
});
test('failed persistence setup stays closed and can be retried',async()=>{
  let attempts=0;const service=makeService({setSessionPersistence:async()=>{if(attempts++===0)throw {code:'auth/web-storage-unsupported'};}});
  await assert.rejects(service.initialize(),{code:'auth/web-storage-unsupported'});
  await assert.rejects(service.signIn(),{code:'auth/not-ready'});
  await service.initialize();assert.equal((await service.signIn()).user.uid,'test');
});
test('initialization is shared by React StrictMode subscriptions',async()=>{
  let calls=0;const service=makeService({setSessionPersistence:async()=>{calls++;}});
  const first=service.initialize(),second=service.initialize();assert.equal(first,second);await first;assert.equal(calls,1);
});
test('errors distinguish console setup from cancellation and hide raw backend detail',()=>{
  assert.match(authErrorMessage({code:'auth/unauthorized-domain'}),/domain/);
  assert.match(authErrorMessage({code:'auth/operation-not-allowed'}),/Google provider/);
  assert.match(authErrorMessage({code:'auth/popup-blocked'}),/pop-ups/);
  assert.doesNotMatch(authErrorMessage({code:'unknown',message:'private debug payload'}),/private debug/);
});
