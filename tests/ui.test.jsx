import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
vi.mock('../src/context/AuthContext.jsx',()=>({useAuth:()=>({user:null,loading:false,pending:false,error:'',signIn:vi.fn(),signOut:vi.fn()})}));
vi.mock('../src/lib/supabaseBackend.js',()=>({zoneCall:vi.fn().mockRejectedValue(new Error('Live backend is disconnected in DOM tests.')),subscribeSignal:()=>()=>{}}));
vi.mock('../src/lib/imageCompressor.js',()=>({compressImage:vi.fn().mockResolvedValue({dataUrl:'data:image/jpeg;base64,cGhvdG8='})}));
vi.mock('../src/lib/firebase.js',()=>({db:{},zoneCall:vi.fn().mockRejectedValue(new Error('Live Firebase is intentionally disconnected in DOM tests.'))}));
vi.mock('firebase/firestore',()=>({doc:vi.fn(),onSnapshot:vi.fn(()=>()=>{})}));
import App from '../src/App.jsx';
afterEach(()=>{cleanup();localStorage.clear();});
const click=(name,root=screen)=>fireEvent.click(root.getByRole('button',{name,exact:true}));
const demo=async()=>{render(<App/>);click('Explore the interactive demo');await screen.findByRole('heading',{name:/Around your zone/});};
const nav=name=>fireEvent.click(within(screen.getByRole('navigation',{name:'Main navigation'})).getByRole('button',{name}));
describe('zone prototype interactions',()=>{
 test('photos can be posted and the author can delete their post',async()=>{
  await demo();click('Create a post');const dialog=screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Title'),{target:{value:'My photo post'}});
  fireEvent.change(within(dialog).getByLabelText('Post photo'),{target:{files:[new File(['photo'],'campus.jpg',{type:'image/jpeg'})]}});
  await within(dialog).findByAltText('Selected photo');click('Share with your zone',within(dialog));
  const title=await screen.findByRole('heading',{name:'My photo post'}),article=title.closest('article');
  expect((await within(article).findByAltText('My photo post')).src).toContain('data:image/jpeg');
  click('Post options',within(article));click('Delete post',within(article));click('Delete permanently from view');
  await waitFor(()=>expect(screen.queryByRole('heading',{name:'My photo post'})).toBeNull());
 });
 test('comments accept image-only replies and authors can delete them',async()=>{
  await demo();const article=screen.getAllByRole('article')[0];click('View comments',within(article));
  fireEvent.change(within(article).getByLabelText('Comment photo'),{target:{files:[new File(['photo'],'reply.png',{type:'image/png'})]}});
  await within(article).findByAltText('Selected photo');click('Send comment',within(article));
  await within(article).findByAltText('Comment photo');click('Delete comment',within(article));click('Delete permanently from view');
  await waitFor(()=>expect(within(article).queryByAltText('Comment photo')).toBeNull());
 });
 test('chat expands, accepts photos, and the author can delete messages',async()=>{
  await demo();nav('Groups');click(/Study/);click('Join group');
  await screen.findByLabelText('Message');click('Full screen chat');
  expect(document.querySelector('.chat-fullscreen')).toBeTruthy();expect(document.querySelector('.right-column')).toBeNull();
  fireEvent.change(screen.getByLabelText('Message photo'),{target:{files:[new File(['photo'],'note.jpg',{type:'image/jpeg'})]}});
  await screen.findByAltText('Selected photo');click('Send message');
  const photo=await screen.findByAltText('Shared in this conversation');
  fireEvent.click(within(photo.closest('.message-row')).getByLabelText('Message options'));
  click('Delete message',within(photo.closest('.message-row')));click('Delete permanently from view');
  await waitFor(()=>expect(screen.queryByAltText('Shared in this conversation')).toBeNull());
  click('Exit full screen chat');expect(document.querySelector('.chat-fullscreen')).toBeNull();
 });
 test('management keeps the same visible invite token across navigation',async()=>{
  await demo();fireEvent.change(screen.getByLabelText('Demo role'),{target:{value:'admin'}});
  expect((await screen.findByLabelText('Private zone token')).textContent).toBe('DEMO-ZONE-TOKEN');
  click('Copy invite token');await waitFor(()=>expect(navigator.clipboard.writeText).toHaveBeenCalledWith('DEMO-ZONE-TOKEN'));
  click('Users');click('Overview');expect(screen.getByLabelText('Private zone token').textContent).toBe('DEMO-ZONE-TOKEN');
 });
 test('replaces college login with token entry and generic zone registration',()=>{
  render(<App/>);expect(screen.getByLabelText('Zone token')).toBeTruthy();expect(screen.queryByText('Join your campus')).toBeNull();click('Register a zone');expect(screen.getByRole('dialog',{name:'Give your place a Polygon.'})).toBeTruthy();expect(screen.getByText('Sign in to manage your zone')).toBeTruthy();
 });
 test('demo opens scrolling feed; likes and comments work without exposing identities',async()=>{
  await demo();expect(screen.getByText('A little closer. A lot more connected.')).toBeTruthy();
  const first=screen.getAllByRole('article')[0];fireEvent.click(within(first).getByRole('button',{name:'Like post'}));await waitFor(()=>expect(within(first).getByRole('button',{name:'Unlike post'})).toBeTruthy());
  fireEvent.click(within(first).getByRole('button',{name:'View comments'}));fireEvent.change(within(first).getByLabelText('Your comment'),{target:{value:'Happy to be part of this zone.'}});fireEvent.click(within(first).getByRole('button',{name:'Send comment'}));await screen.findByText('Happy to be part of this zone.');
  expect(document.body.textContent).not.toContain('demo-user');
 });
 test('all location failure scenarios lock the feed and explicit verification restores it',async()=>{
  await demo();const select=screen.getByLabelText('Simulate location');
  for(const [value,title] of [['denied','Your location is your choice.'],['outside','You’re outside this zone.'],['inaccurate','A clearer location, please.'],['unavailable','We couldn’t find your location.'],['spoofing','GPS isn’t proof of presence.']]){fireEvent.change(select,{target:{value}});await screen.findByRole('heading',{name:title});expect(screen.queryByText('A black wallet. A little help?')).toBeNull();}
  click('Verify location');await screen.findByRole('heading',{name:/Around your zone/});
 });
 test('group membership, chat sending and contact protection',async()=>{
  await demo();nav('Groups');click(/Study/);click('Join group');await screen.findByRole('heading',{name:'DSA — Graph Algorithms'});const input=await screen.findByLabelText('Message');
  fireEvent.change(input,{target:{value:'My number is 9876543210'}});expect(screen.getByRole('button',{name:'Send message'}).disabled).toBe(true);expect(screen.getByText(/Private information hidden/)).toBeTruthy();
  fireEvent.change(input,{target:{value:'Let’s try BFS together.'}});click('Send message');await screen.findByText('Let’s try BFS together.');click('Leave group');await screen.findByRole('heading',{name:/Shared interests/});
 });
 test('reports appear in management and management can approve and remove content',async()=>{
  await demo();const first=screen.getAllByRole('article')[0];fireEvent.click(within(first).getByRole('button',{name:'Post options'}));click('Report post');click('Send report');await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.change(screen.getByLabelText('Demo role'),{target:{value:'admin'}});await screen.findByRole('heading',{name:/starts with care/});click('Reports');await screen.findByText('post report');click('Review content');expect(screen.getByRole('dialog',{name:'Reported content'})).toBeTruthy();click('Close dialog');click('Remove content');click('Confirm action');await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  click('Users');const user=screen.getByText('@PixelDev').closest('.admin-row');fireEvent.click(within(user).getByRole('button',{name:'Approve / restore'}));await waitFor(()=>expect(within(user).getByText('active')).toBeTruthy());
  fireEvent.change(screen.getByLabelText('Demo role'),{target:{value:'member'}});await screen.findByRole('heading',{name:/Around your zone/});expect(screen.queryByText('A little closer. A lot more connected.')).toBeNull();
 });
 test('ordinary users cannot select announcements; blocked drafts never show success',async()=>{
  await demo();click('Create a post');const dialog=screen.getByRole('dialog');expect(within(dialog).queryByRole('option',{name:'Announcement'})).toBeNull();fireEvent.change(within(dialog).getByLabelText('Title'),{target:{value:'A test post'}});fireEvent.change(within(dialog).getByLabelText('Description'),{target:{value:'You are an idiot'}});click('Share with your zone',within(dialog));await screen.findAllByText(/Blocked by the demo safety filter/);expect(screen.queryByText('Post submitted.')).toBeNull();
 });
 test('profile avatar change, theme and disabling location',async()=>{
  await demo();nav('Profile');click('Choose 🐯 avatar');fireEvent.change(screen.getByLabelText('Your pseudonym'),{target:{value:'OrangeTiger'}});click('Save your look');await waitFor(()=>expect(screen.getByRole('heading',{name:'@OrangeTiger'})).toBeTruthy());click(/Switch to dark appearance/);expect(document.documentElement.dataset.theme).toBe('dark');click(/Disable location access/);await screen.findByRole('heading',{name:'Location is off.'});expect(screen.queryByText('@OrangeTiger')).toBeNull();
 });
});
