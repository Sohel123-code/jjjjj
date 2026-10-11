/**
 * Campus LAN gateway. Chat stays in authorized Supabase RPCs.
 * This server attests the TCP peer's configured subnet; it never trusts X-Forwarded-For.
 * Serve HTTPS directly on the campus LAN. Do not proxy through a public tunnel.
 */
const {createServer}=require('node:http');
const {BlockList,isIP}=require('node:net');
function compileNetworks(networks){
 if(!Array.isArray(networks)||!networks.length)throw Error('Configure LAN_NETWORKS with gateway IDs, secrets and allowed CIDRs.');
 return networks.map(n=>{
   if(!/^[0-9a-f-]{36}$/i.test(n.id)||!/^[0-9a-f-]{36}$/i.test(n.zoneId)||typeof n.secret!=='string'||n.secret.length<32||!n.cidrs?.length)throw Error('Invalid LAN network configuration.');
   const block=new BlockList();
   for(const cidr of n.cidrs){const [address,bits]=cidr.split('/');const family=isIP(address);const prefix=Number(bits);
     if(!family||bits===undefined||!Number.isInteger(prefix)||prefix<1||prefix>(family===4?32:128))throw Error('Invalid or overly broad LAN CIDR.');
     block.addSubnet(address,prefix,family===4?'ipv4':'ipv6');
   }
   return {...n,block};
 });
}
function findNetwork(networks,address,zoneId){
 const ip=address?.startsWith('::ffff:')?address.slice(7):address,version=isIP(ip||'');
 if(!version)return null;
 return networks.find(n=>n.zoneId===zoneId&&n.block.check(ip,version===4?'ipv4':'ipv6'))||null;
}
function createGateway({networks,origins,supabaseUrl,publicKey,tls,fetchImpl=fetch}){
 const configured=compileNetworks(networks),allowed=new Set(origins||[]),rates=new Map();
 if(!allowed.size||allowed.has('*'))throw Error('LAN_ALLOWED_ORIGINS must contain the exact website origins.');
 if(!supabaseUrl?.startsWith('https://')||!publicKey)throw Error('Configure a Supabase HTTPS URL and public key.');
 return (tls?handler=>require('node:https').createServer(tls,handler):createServer)(async(req,res)=>{
   const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
   if(req.url==='/health'&&req.method==='GET')return reply(200,{status:'ok'});
   if(!allowed.has(req.headers.origin))return reply(403,{error:'Website origin is not allowed.'});
   res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');
   if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','POST');return reply(204,{});}
   if(req.url!=='/attest'||req.method!=='POST')return reply(404,{error:'Not found.'});
   const ip=req.socket.remoteAddress,now=Date.now(),rate=rates.get(ip);
   if(rate&&rate.until>now&&rate.count>=60)return reply(429,{error:'Too many network checks.'});
   rates.set(ip,{until:rate?.until>now?rate.until:now+60000,count:rate?.until>now?rate.count+1:1});
   if(rates.size>5000)rates.delete(rates.keys().next().value);
   const token=req.headers.authorization;
   if(typeof token!=='string'||!token.startsWith('Bearer ')||token.length>8192)return reply(401,{error:'Sign in first.'});
   try{
     let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2048)return reply(413,{error:'Request too large.'});}
     const {zoneId}=JSON.parse(body);
     const network=findNetwork(configured,ip,zoneId);
     if(!network)return reply(403,{error:'Connect to the configured campus network.'});
     // Supabase verifies the JWT; the gateway never trusts a client-supplied identity.
     const auth=await fetchImpl(supabaseUrl+'/auth/v1/user',{headers:{apikey:publicKey,Authorization:token},signal:AbortSignal.timeout(8000)});
     if(!auth.ok)return reply(401,{error:'Your sign-in session is invalid.'});
     const user=await auth.json();if(!user.id||user.is_anonymous)return reply(401,{error:'A registered account is required.'});
     const result=await fetchImpl(supabaseUrl+'/rest/v1/rpc/polygon_nearby',{method:'POST',headers:{apikey:publicKey,Authorization:token,'Content-Type':'application/json'},body:JSON.stringify({action:'networkAttest',payload:{zoneId,networkId:network.id,secret:network.secret}}),signal:AbortSignal.timeout(8000)});
     if(!result.ok)return reply(403,{error:'Network verification was denied. Verify your campus location and membership first.'});
     const verified=await result.json();return reply(200,{networkId:verified.networkId,name:verified.name,expiresAt:verified.expiresAt});
   }catch{return reply(503,{error:'Network verification is unavailable. Please retry.'});}
 });
}
module.exports={createGateway,compileNetworks,findNetwork};
if(require.main===module){
 try{
   try{process.loadEnvFile('.env');}catch{}
   const host=process.env.LAN_BIND_HOST||'127.0.0.1';
   const tls=process.env.LAN_TLS_CERT&&process.env.LAN_TLS_KEY?{cert:require('node:fs').readFileSync(process.env.LAN_TLS_CERT),key:require('node:fs').readFileSync(process.env.LAN_TLS_KEY)}:undefined;
   if(!tls&&!['127.0.0.1','::1','localhost'].includes(host))throw Error('LAN access requires LAN_TLS_CERT and LAN_TLS_KEY for direct HTTPS.');
   const server=createGateway({tls,networks:JSON.parse(process.env.LAN_NETWORKS||'[]'),origins:(process.env.LAN_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean),
     supabaseUrl:process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,publicKey:process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY});
   const port=Number(process.env.NEARBY_PORT||3001);
   server.listen(port,host,()=>console.log('Campus LAN gateway listening on '+host+':'+port+'. Chat is handled by Supabase.'));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
