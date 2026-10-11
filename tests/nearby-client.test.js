import {beforeEach,expect,test,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../src/lib/supabase.js',()=>({supabase:{rpc:mocks.rpc}}));
let nearbyCall;
beforeEach(async()=>{
 vi.resetModules();mocks.rpc.mockReset();
 ({nearbyCall}=await import('../src/lib/nearby.js'));
});

test('a missing Nearby RPC stops polling, presence, typing and cleanup requests',async()=>{
 mocks.rpc.mockResolvedValue({error:{code:'PGRST202',message:'Function missing'}});
 await expect(nearbyCall('snapshot',{zoneId:'zone'})).rejects.toMatchObject({code:'PGRST202',message:expect.stringContaining('SUPABASE_SETUP.md')});
 for(const action of ['snapshot','presence','typing','hide','send']) {
   await expect(nearbyCall(action,{zoneId:'zone'})).rejects.toMatchObject({code:'PGRST202'});
 }
 expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

test('temporary and permission failures do not permanently disable Nearby',async()=>{
 for(const code of ['PGRST000','42501']) {
   mocks.rpc.mockResolvedValueOnce({error:{code,message:'Unavailable'}})
     .mockResolvedValueOnce({data:{people:[],messages:[],networks:[]},error:null});
   await expect(nearbyCall('snapshot',{})).rejects.toMatchObject({code});
   await expect(nearbyCall('snapshot',{})).resolves.toMatchObject({messages:[]});
 }
 expect(mocks.rpc).toHaveBeenCalledTimes(4);
});

test('reloading the client checks again after the migration is installed',async()=>{
 mocks.rpc.mockResolvedValueOnce({error:{code:'PGRST202',message:'Function missing'}});
 await expect(nearbyCall('snapshot',{})).rejects.toThrow();
 vi.resetModules();
 const reloaded=await import('../src/lib/nearby.js');
 mocks.rpc.mockResolvedValueOnce({data:{people:[],messages:[],networks:[]},error:null});
 await expect(reloaded.nearbyCall('snapshot',{})).resolves.toMatchObject({messages:[]});
 expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
