import { beforeEach, expect, test, vi } from 'vitest';
const mocks=vi.hoisted(()=>({
 getSession:vi.fn(),onAuthStateChange:vi.fn(),signInWithOAuth:vi.fn(),signOut:vi.fn(),
 rpc:vi.fn(),upload:vi.fn(),remove:vi.fn(),from:vi.fn(),
}));
vi.mock('../src/lib/supabase.js',()=>({supabase:{
 auth:{getSession:mocks.getSession,onAuthStateChange:mocks.onAuthStateChange,signInWithOAuth:mocks.signInWithOAuth,signOut:mocks.signOut},
 rpc:mocks.rpc,storage:{from:mocks.from},
}}));
import { authService } from '../src/lib/supabaseAuth.js';
import { zoneCall } from '../src/lib/supabaseBackend.js';
beforeEach(()=>{
 vi.resetAllMocks();localStorage.clear();
 mocks.from.mockReturnValue({upload:mocks.upload,remove:mocks.remove});
});
test('failed authentication propagates errors instead of inventing a guest',async()=>{
 mocks.getSession.mockResolvedValue({error:Error('Invalid API key')});
 await expect(authService.initialize()).rejects.toThrow('Invalid API key');
 mocks.signInWithOAuth.mockResolvedValue({error:Error('Provider disabled')});
 await expect(authService.signIn()).rejects.toThrow('Provider disabled');
 expect(localStorage.getItem('polygon-local-uid')).toBeNull();
});
test('signout and anonymous auth events clear the account',async()=>{
 let changed;const unsubscribe=vi.fn(),listener=vi.fn();
 mocks.onAuthStateChange.mockImplementation(fn=>{changed=fn;return {data:{subscription:{unsubscribe}}};});
 const stop=authService.subscribe(listener);
 changed('SIGNED_IN',{user:{id:'real-user',email:'student@example.test',is_anonymous:false}});
 expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({uid:'real-user'}));
 changed('SIGNED_OUT',null);expect(listener).toHaveBeenLastCalledWith(null);
 changed('SIGNED_IN',{user:{id:'anonymous',is_anonymous:true}});expect(listener).toHaveBeenLastCalledWith(null);
 stop();expect(unsubscribe).toHaveBeenCalledOnce();
 mocks.signOut.mockResolvedValue({error:null});await authService.signOut();
 expect(localStorage.getItem('polygon-local-uid')).toBeNull();
});
test('photo upload uses a reservation and cleans up a failed publication',async()=>{
 mocks.rpc.mockResolvedValueOnce({data:{path:'zone/user/reserved'},error:null}).mockResolvedValueOnce({error:{message:'Post was removed'}});
 mocks.upload.mockResolvedValue({error:null});mocks.remove.mockResolvedValue({error:null});
 await expect(zoneCall('comment',{zoneId:'zone',parentId:'parent',text:'',image:'data:image/jpeg;base64,cGhvdG8='})).rejects.toThrow('Post was removed');
 expect(mocks.rpc.mock.calls[0][1]).toEqual({action:'prepareImage',payload:{zoneId:'zone',parentId:'parent',text:'',contentAction:'comment',mime:'image/jpeg'}});
 expect(mocks.upload).toHaveBeenCalledWith('zone/user/reserved',expect.any(Blob),{contentType:'image/jpeg',upsert:false});
 expect(mocks.remove).toHaveBeenCalledWith(['zone/user/reserved']);
});
test('missing migration and failed storage uploads give actionable errors',async()=>{
 mocks.rpc.mockResolvedValueOnce({error:{code:'PGRST202',message:'Missing function'}});
 await expect(zoneCall('bootstrap')).rejects.toThrow('migration');
 mocks.rpc.mockResolvedValueOnce({data:{path:'reservation'},error:null});
 mocks.upload.mockResolvedValue({error:{message:'Upload denied'}});
 await expect(zoneCall('message',{text:'',image:'data:image/jpeg;base64,cGhvdG8='})).rejects.toThrow('Photo upload failed');
 expect(mocks.rpc).toHaveBeenCalledTimes(2);
 expect(mocks.remove).not.toHaveBeenCalled();
});
