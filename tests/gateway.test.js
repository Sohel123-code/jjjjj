import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createGateway,compileNetworks,findNetwork}=createRequire(import.meta.url)('../nearby-server.cjs');
const network={id:'11111111-1111-4111-8111-111111111111',zoneId:'22222222-2222-4222-8222-222222222222',secret:'a'.repeat(64),cidrs:['127.0.0.0/8']};
test('LAN subnet matching rejects outsiders and overly broad configurations',()=>{
 const networks=compileNetworks([network]);
 assert.equal(findNetwork(networks,'::ffff:127.0.0.1',network.zoneId).id,network.id);
 assert.equal(findNetwork(networks,'10.0.0.1',network.zoneId),null);
 assert.throws(()=>compileNetworks([{...network,cidrs:['0.0.0.0/0']}]));
});
test('gateway verifies identity and grants scoped proof without disclosing secret',async()=>{
 const calls=[];
 const server=createGateway({networks:[network],origins:['https://polygon.example'],supabaseUrl:'https://project.supabase.co',publicKey:'public',fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.includes('/auth/')?{id:'user',is_anonymous:false}:{networkId:network.id,name:'Campus',expiresAt:123}};}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
 const url='http://127.0.0.1:'+server.address().port;
 const options={method:'POST',headers:{Origin:'https://polygon.example',Authorization:'Bearer signed-token','Content-Type':'application/json'},body:JSON.stringify({zoneId:network.zoneId})};
 const response=await fetch(url+'/attest',options);assert.equal(response.status,200);
 assert.equal((await response.text()).includes(network.secret),false);
 assert.equal(JSON.parse(calls[1].options.body).payload.secret,network.secret);
 assert.equal((await fetch(url+'/attest',{...options,headers:{...options.headers,Origin:'https://evil.example'}})).status,403);
 assert.equal((await fetch(url+'/attest',{...options,headers:{Origin:'https://polygon.example'}})).status,401);
 assert.equal((await fetch(url+'/debug/users',{headers:{Origin:'https://polygon.example'}})).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
