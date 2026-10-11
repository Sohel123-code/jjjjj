import { test, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { io as Client } from 'socket.io-client';
import { setupSocketServer } from '../src/server/socketHandler.js';

let httpServer, ioServer, port;

beforeAll(async () => {
  httpServer = createServer();
  ioServer = setupSocketServer(httpServer);
  await new Promise(resolve => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

afterAll(async () => {
  ioServer.close();
  await new Promise(resolve => httpServer.close(resolve));
});

test('Socket.io: geofence users are broadcast to users inside the zone', async () => {
  const client1 = Client(`http://localhost:${port}`);
  const client2 = Client(`http://localhost:${port}`);

  await Promise.all([
    new Promise(res => client1.on('connect', res)),
    new Promise(res => client2.on('connect', res))
  ]);

  const zoneId = 'test-campus-zone';
  const boundary = { type: 'radius', centre: { latitude: 17.73, longitude: 83.3 }, radiusM: 500 };

  const peopleReceived = new Promise(resolve => {
    client1.on('geofence-users', users => {
      // Must contain campus members with coordinates inside geofence
      if (users && users.length >= 2) {
        resolve(users);
      }
    });
  });

  client1.emit('join-geofence', {
    zoneId,
    user: { id: 'user-alice', alias: 'Alice', avatar: '👩‍💻' },
    fix: { latitude: 17.731, longitude: 83.301 },
    boundary
  });

  client2.emit('join-geofence', {
    zoneId,
    user: { id: 'user-bob', alias: 'Bob', avatar: '🧑‍🎓' },
    fix: { latitude: 17.729, longitude: 83.299 },
    boundary
  });

  const users = await peopleReceived;
  expect(users.length).toBeGreaterThanOrEqual(2);
  // Coordinates are finite numbers within the geofence
  expect(users.every(u => Number.isFinite(u.latitude) && Number.isFinite(u.longitude))).toBe(true);

  client1.disconnect();
  client2.disconnect();
});

test('Socket.io: individual 1-on-1 private messaging delivers in real time', async () => {
  const alice = Client(`http://localhost:${port}`);
  const bob = Client(`http://localhost:${port}`);

  await Promise.all([
    new Promise(res => alice.on('connect', res)),
    new Promise(res => bob.on('connect', res))
  ]);

  const zoneId = 'test-campus-zone';

  alice.emit('join-geofence', {
    zoneId,
    user: { id: 'alice-id', alias: 'Alice', avatar: '👩‍💻' }
  });

  bob.emit('join-geofence', {
    zoneId,
    user: { id: 'bob-id', alias: 'Bob', avatar: '🧑‍🎓' }
  });

  // Bob waits for 1-on-1 message from Alice
  const messageForBob = new Promise(resolve => {
    bob.on('private-message', msg => {
      if (msg.text === 'Hey Bob, are you in the geofence?') {
        resolve(msg);
      }
    });
  });

  // Alice sends individual message to Bob
  alice.emit('private-message', {
    to: 'bob-id',
    text: 'Hey Bob, are you in the geofence?',
    clientId: 'msg-123',
    sender: { id: 'alice-id', alias: 'Alice', avatar: '👩‍💻' },
    zoneId
  });

  const received = await messageForBob;
  expect(received.authorId).toBe('alice-id');
  expect(received.peerId).toBe('bob-id');
  expect(received.text).toBe('Hey Bob, are you in the geofence?');

  alice.disconnect();
  bob.disconnect();
});

test('Socket.io: message editing and deletion updates peers in real time', async () => {
  const alice = Client(`http://localhost:${port}`);
  const bob = Client(`http://localhost:${port}`);

  await Promise.all([
    new Promise(res => alice.on('connect', res)),
    new Promise(res => bob.on('connect', res))
  ]);

  const zoneId = 'test-edit-delete-zone';

  alice.emit('join-geofence', {
    zoneId,
    user: { id: 'alice-id', alias: 'Alice', avatar: '👩‍💻' }
  });

  bob.emit('join-geofence', {
    zoneId,
    user: { id: 'bob-id', alias: 'Bob', avatar: '🧑‍🎓' }
  });

  await new Promise(res => setTimeout(res, 100));

  const editedPromise = new Promise(resolve => {
    bob.on('message-edited', payload => resolve(payload));
  });

  const deletedPromise = new Promise(resolve => {
    bob.on('message-deleted', payload => resolve(payload));
  });

  // Edit message
  alice.emit('edit-message', {
    targetId: 'msg-123',
    text: 'Edited message text',
    peerId: 'bob-id',
    myId: 'alice-id',
    zoneId
  });

  const edited = await editedPromise;
  expect(edited.targetId).toBe('msg-123');
  expect(edited.text).toBe('Edited message text');

  // Delete message
  alice.emit('delete-message', {
    targetId: 'msg-123',
    peerId: 'bob-id',
    myId: 'alice-id',
    zoneId
  });

  const deleted = await deletedPromise;
  expect(deleted.targetId).toBe('msg-123');

  alice.disconnect();
  bob.disconnect();
});

test('Socket.io: users sharing the same zone ID receive the same live feed updates in real time', async () => {
  const alice = Client(`http://localhost:${port}`);
  const bob = Client(`http://localhost:${port}`);

  await Promise.all([
    new Promise(res => alice.on('connect', res)),
    new Promise(res => bob.on('connect', res))
  ]);

  const uniqueZoneId = 'campus-unique-zone-101';

  alice.emit('join-geofence', {
    zoneId: uniqueZoneId,
    user: { id: 'alice-id', alias: 'Alice', avatar: '👩‍💻' }
  });

  bob.emit('join-geofence', {
    zoneId: uniqueZoneId,
    user: { id: 'bob-id', alias: 'Bob', avatar: '🧑‍🎓' }
  });

  await new Promise(res => setTimeout(res, 100));

  const postPromise = new Promise(resolve => {
    bob.on('feed-post-added', payload => resolve(payload));
  });

  const likePromise = new Promise(resolve => {
    bob.on('feed-like-updated', payload => resolve(payload));
  });

  const deletePromise = new Promise(resolve => {
    bob.on('feed-post-deleted', payload => resolve(payload));
  });

  // 1. Alice creates a post in this unique zone ID
  alice.emit('create-post', {
    zoneId: uniqueZoneId,
    post: {
      id: 'post-test-456',
      title: 'Found Laptop Charger at Library Desk',
      text: '65W USB-C charger left on Level 3.',
      category: 'found',
      place: 'Library Level 3'
    }
  });

  const receivedPost = await postPromise;
  expect(receivedPost.zoneId).toBe(uniqueZoneId);
  expect(receivedPost.post.title).toBe('Found Laptop Charger at Library Desk');

  // 2. Alice likes the post
  alice.emit('like-post', {
    zoneId: uniqueZoneId,
    target: 'post-test-456',
    userId: 'alice-id'
  });

  const receivedLike = await likePromise;
  expect(receivedLike.zoneId).toBe(uniqueZoneId);
  expect(receivedLike.target).toBe('post-test-456');
  expect(receivedLike.likes).toBe(1);

  // 3. Alice deletes the post
  alice.emit('delete-post', {
    zoneId: uniqueZoneId,
    target: 'post-test-456'
  });

  const receivedDelete = await deletePromise;
  expect(receivedDelete.zoneId).toBe(uniqueZoneId);
  expect(receivedDelete.target).toBe('post-test-456');

  alice.disconnect();
  bob.disconnect();
});

test('Socket.io: particular zone live chat broadcasts messages and syncs history between peers in real time', async () => {
  const alice = Client(`http://localhost:${port}`);
  const bob = Client(`http://localhost:${port}`);

  await Promise.all([
    new Promise(res => alice.on('connect', res)),
    new Promise(res => bob.on('connect', res))
  ]);

  const testZoneId = 'campus-zone-chat-999';

  // 1. Join geofence room for testZoneId
  alice.emit('join-geofence', {
    zoneId: testZoneId,
    user: { id: 'alice-chat-id', alias: 'AliceChat', avatar: '👩‍💻' }
  });

  bob.emit('join-geofence', {
    zoneId: testZoneId,
    user: { id: 'bob-chat-id', alias: 'BobChat', avatar: '🧑‍🎓' }
  });

  await new Promise(res => setTimeout(res, 50));

  // 2. Bob listens for live zone message from Alice
  const zoneMessagePromise = new Promise(resolve => {
    bob.on('zone-message', msg => {
      if (msg.text === 'Welcome everyone to our campus zone live chat!') {
        resolve(msg);
      }
    });
  });

  // 3. Alice sends live zone message
  alice.emit('zone-message', {
    zoneId: testZoneId,
    text: 'Welcome everyone to our campus zone live chat!',
    clientId: 'client-msg-zone-1',
    sender: { id: 'alice-chat-id', alias: 'AliceChat', avatar: '👩‍💻' }
  });

  const broadcastMsg = await zoneMessagePromise;
  expect(broadcastMsg.text).toBe('Welcome everyone to our campus zone live chat!');
  expect(broadcastMsg.authorId).toBe('alice-chat-id');
  expect(broadcastMsg.alias).toBe('AliceChat');

  // 4. Client Charlie joins and explicitly requests get-zone-history
  const charlie = Client(`http://localhost:${port}`);
  await new Promise(res => charlie.on('connect', res));

  const historyPromise = new Promise(resolve => {
    charlie.on('zone-history', history => {
      if (history && history.some(m => m.text === 'Welcome everyone to our campus zone live chat!')) {
        resolve(history);
      }
    });
  });

  charlie.emit('get-zone-history', { zoneId: testZoneId });
  const fetchedHistory = await historyPromise;
  expect(fetchedHistory.length).toBeGreaterThanOrEqual(1);
  expect(fetchedHistory.some(m => m.text === 'Welcome everyone to our campus zone live chat!')).toBe(true);

  alice.disconnect();
  bob.disconnect();
  charlie.disconnect();
});

