import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCollege, validateInvite } from '../src/lib/validation.js';

const college = { name:'Demo college', email:'admin@example.edu', latitude:'17.1', longitude:'83.1', zoneType:'radius', radius:'500' };
test('accepts a valid campus circle and a closed polygon',()=>{
  assert.equal(validateCollege(college),null);
  assert.equal(validateCollege({...college,zoneType:'polygon',vertices:'[[83,17],[83.1,17],[83.1,17.1],[83,17]]'}),null);
});
test('rejects missing or impossible coordinates and excessive radius',()=>{
  for(const change of [{latitude:''},{latitude:'91'},{longitude:'-181'},{longitude:'Infinity'},{radius:'49'},{radius:'10001'}]) assert.ok(validateCollege({...college,...change}));
});
test('rejects unclosed, degenerate and crossing campus boundaries',()=>{
  for(const vertices of ['{}','[]','[[83,17],[83.1,17],[83.1,17.1]]','[[0,0],[1,1],[2,2],[0,0]]','[[0,0],[3,3],[0,2],[2,0],[0,0]]','[[0,0],[1,0],[1,1],[1,0],[0,0]]','[[181,0],[1,0],[1,1],[181,0]]']) assert.ok(validateCollege({...college,zoneType:'polygon',vertices}));
});
test('invite checking only validates the format, never authenticates',()=>{
  assert.equal(validateInvite('DEMO-ONLY-123'),null);
  assert.ok(validateInvite('abc'));
  assert.ok(validateInvite('<script>'));
});
