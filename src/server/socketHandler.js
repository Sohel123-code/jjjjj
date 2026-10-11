import { Server } from 'socket.io';

// In-memory state for active connections and geofence rooms
const activeSockets = new Map(); // socket.id -> { socketId, zoneId, user, fix }
const conversations = new Map(); // pairKey (minId:maxId) -> Array of messages
const zoneMessages = new Map();  // zoneId -> Array of messages
const zoneFeeds = new Map();     // zoneId -> { posts, comments, likes }

function calculateDistanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getOrCreateZoneFeed(zoneId) {
  if (!zoneFeeds.has(zoneId)) {
    zoneFeeds.set(zoneId, {
      posts: [],
      comments: [],
      likes: new Map() // userId -> Set of postIds
    });
  }
  return zoneFeeds.get(zoneId);
}

function getOrCreateZoneMessages(zoneId) {
  if (!zoneMessages.has(zoneId)) {
    zoneMessages.set(zoneId, []);
  }
  return zoneMessages.get(zoneId);
}

function getPairKey(id1, id2) {
  return [id1, id2].sort().join(':::');
}

function getZoneCentre(boundary) {
  if (boundary?.centre?.latitude && boundary?.centre?.longitude) {
    return { lat: boundary.centre.latitude, lng: boundary.centre.longitude };
  }
  if (boundary?.vertices?.length) {
    const latSum = boundary.vertices.reduce((sum, v) => sum + v[1], 0);
    const lngSum = boundary.vertices.reduce((sum, v) => sum + v[0], 0);
    return { lat: latSum / boundary.vertices.length, lng: lngSum / boundary.vertices.length };
  }
  return { lat: 17.73, lng: 83.30 }; // Default campus reference
}

export function setupSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  function getGeofenceUsers(zoneId, boundary) {
    const centre = getZoneCentre(boundary);
    const radiusM = boundary?.radiusM || 1000;
    // Deduplicate by user ID — only real connected socket users for this zone
    const seen = new Map(); // userId -> entry
    for (const entry of activeSockets.values()) {
      if (entry.zoneId === zoneId && entry.user?.id) {
        seen.set(entry.user.id, entry);
      }
    }
    const realUsers = [];

    // ONLY real-time connected users inside this zone
    for (const entry of seen.values()) {
      const uLat = entry.fix?.latitude ?? centre.lat;
      const uLng = entry.fix?.longitude ?? centre.lng;
      const dist = calculateDistanceM(centre.lat, centre.lng, uLat, uLng);
      realUsers.push({
        id: entry.user.id,
        alias: entry.user.alias || 'Member',
        avatar: entry.user.avatar || '🦊',
        gender: entry.user.gender || '',
        profession: entry.user.profession || 'Active member',
        latitude: uLat,
        longitude: uLng,
        distance: Math.round(dist),
        inRadius: dist <= radiusM,
        isReal: true,
        status: 'online'
      });
    }

    return realUsers;
  }

  io.on('connection', socket => {
    // 1. Join campus geofence
    socket.on('join-geofence', data => {
      const { zoneId, user, fix, boundary } = data || {};
      if (!zoneId) return;

      socket.join(zoneId);
      activeSockets.set(socket.id, {
        socketId: socket.id,
        zoneId,
        user: user || { id: socket.id, alias: 'Visitor', avatar: '🦊' },
        fix: fix || null,
        boundary: boundary || null
      });

      // Broadcast updated geofence members to all sockets in this zone
      const people = getGeofenceUsers(zoneId, boundary);
      io.to(zoneId).emit('geofence-users', people);

      // Send recent zone public messages
      const recentZone = getOrCreateZoneMessages(zoneId);
      socket.emit('zone-history', recentZone.slice(-50));

      // Send initial live feed for this zone
      const feed = getOrCreateZoneFeed(zoneId);
      const myLikes = Array.from(feed.likes.get(user?.id || user?.publicId || 'me') || []);
      socket.emit('feed-data', {
        zoneId,
        posts: feed.posts,
        comments: feed.comments,
        myLikes
      });
    });

    // 1b. Request zone message history explicitly
    socket.on('get-zone-history', ({ zoneId }) => {
      if (!zoneId) return;
      const recentZone = getOrCreateZoneMessages(zoneId);
      socket.emit('zone-history', recentZone.slice(-50));
    });

    // 1c. Request live feed explicitly
    socket.on('get-feed', ({ zoneId, userId }) => {
      if (!zoneId) return;
      const feed = getOrCreateZoneFeed(zoneId);
      const myLikes = Array.from(feed.likes.get(userId || 'me') || []);
      socket.emit('feed-data', {
        zoneId,
        posts: feed.posts,
        comments: feed.comments,
        myLikes
      });
    });

    // 1c. Create new feed post
    socket.on('create-post', payload => {
      const { zoneId, post } = payload || {};
      if (!zoneId || !post) return;
      const feed = getOrCreateZoneFeed(zoneId);
      const newPost = {
        id: post.id || crypto.randomUUID(),
        authorId: post.authorId || 'me',
        alias: post.alias || 'You',
        avatar: post.avatar || '🦊',
        title: post.title,
        text: post.text,
        category: post.category || 'post',
        place: post.place || 'In your zone',
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + (post.hours ? Number(post.hours) * 3600000 : 86400000),
        likes: 0,
        image: post.image || null,
        startsAt: post.startsAt || null,
        registration: post.registration || null,
        itemCategory: post.itemCategory || null,
        approximateTime: post.approximateTime || null,
        additionalInfo: post.additionalInfo || null
      };
      feed.posts.unshift(newPost);
      io.to(zoneId).emit('feed-post-added', { zoneId, post: newPost });
    });

    // 1d. Create comment on post
    socket.on('create-comment', payload => {
      const { zoneId, comment } = payload || {};
      if (!zoneId || !comment) return;
      const feed = getOrCreateZoneFeed(zoneId);
      const newComment = {
        id: comment.id || crypto.randomUUID(),
        parentId: comment.parentId,
        replyTo: comment.replyTo || null,
        authorId: comment.authorId || 'me',
        alias: comment.alias || 'You',
        avatar: comment.avatar || '🦊',
        text: comment.text,
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + 86400000 * 7,
        image: comment.image || null
      };
      feed.comments.push(newComment);
      io.to(zoneId).emit('feed-comment-added', { zoneId, comment: newComment });
    });

    // 1e. Like/Unlike post
    socket.on('like-post', payload => {
      const { zoneId, target, userId } = payload || {};
      if (!zoneId || !target) return;
      const feed = getOrCreateZoneFeed(zoneId);
      const post = feed.posts.find(p => p.id === target);
      if (!post) return;

      const uKey = userId || 'me';
      if (!feed.likes.has(uKey)) feed.likes.set(uKey, new Set());
      const set = feed.likes.get(uKey);

      let isLiked = false;
      if (set.has(target)) {
        set.delete(target);
        post.likes = Math.max(0, (post.likes || 1) - 1);
        isLiked = false;
      } else {
        set.add(target);
        post.likes = (post.likes || 0) + 1;
        isLiked = true;
      }

      io.to(zoneId).emit('feed-like-updated', {
        zoneId,
        target,
        likes: post.likes,
        userId: uKey,
        isLiked
      });
    });

    // 1f. Delete post
    socket.on('delete-post', payload => {
      const { zoneId, target } = payload || {};
      if (!zoneId || !target) return;
      const feed = getOrCreateZoneFeed(zoneId);
      feed.posts = feed.posts.filter(p => p.id !== target);
      feed.comments = feed.comments.filter(c => c.parentId !== target);
      io.to(zoneId).emit('feed-post-deleted', { zoneId, target });
    });

    // 1g. Delete comment
    socket.on('delete-comment', payload => {
      const { zoneId, target } = payload || {};
      if (!zoneId || !target) return;
      const feed = getOrCreateZoneFeed(zoneId);
      feed.comments = feed.comments.filter(c => c.id !== target);
      io.to(zoneId).emit('feed-comment-deleted', { zoneId, target });
    });

    // 2. Request private conversation history with a peer
    socket.on('get-private-history', ({ peerId, myId }) => {
      if (!peerId || !myId) return;
      const key = getPairKey(myId, peerId);
      const history = conversations.get(key) || [];
      socket.emit('private-history', { peerId, messages: history });
    });

    // 3. Send 1-on-1 private message
    socket.on('private-message', payload => {
      const { to, text, clientId, sender, zoneId } = payload || {};
      if (!to || !text || !sender) return;

      const message = {
        id: crypto.randomUUID(),
        clientId: clientId || crypto.randomUUID(),
        authorId: sender.id,
        peerId: to,
        alias: sender.alias,
        avatar: sender.avatar,
        text: text.trim(),
        createdAt: new Date().toISOString()
      };

      // Store in conversation history
      const key = getPairKey(sender.id, to);
      if (!conversations.has(key)) conversations.set(key, []);
      conversations.get(key).push(message);

      // Confirm to sender
      socket.emit('private-message', message);

      // Find recipient socket(s) if connected in the SAME zone
      for (const entry of activeSockets.values()) {
        if (entry.user?.id === to && (!zoneId || entry.zoneId === zoneId)) {
          io.to(entry.socketId).emit('private-message', message);
        }
      }
    });

    // 4. Send campus / zone message
    socket.on('zone-message', payload => {
      const { zoneId, text, clientId, sender } = payload || {};
      if (!zoneId || !text || !sender) return;

      const message = {
        id: crypto.randomUUID(),
        clientId: clientId || crypto.randomUUID(),
        authorId: sender.id,
        alias: sender.alias,
        avatar: sender.avatar,
        text: text.trim(),
        createdAt: new Date().toISOString()
      };

      const list = getOrCreateZoneMessages(zoneId);
      list.push(message);

      io.to(zoneId).emit('zone-message', message);
    });

    // 5. Typing notification
    socket.on('typing', payload => {
      const { to, zoneId, isTyping, from } = payload || {};
      if (to) {
        for (const entry of activeSockets.values()) {
          if (entry.user?.id === to) {
            io.to(entry.socketId).emit('typing', { from, isTyping });
          }
        }
      } else if (zoneId) {
        socket.to(zoneId).emit('typing', { from, isTyping });
      }
    });

    // 6. Delete message
    socket.on('delete-message', payload => {
      const { targetId, peerId, myId, zoneId } = payload || {};
      if (peerId && myId) {
        const key = getPairKey(myId, peerId);
        const list = conversations.get(key) || [];
        conversations.set(key, list.filter(m => m.id !== targetId && m.clientId !== targetId));
        socket.emit('message-deleted', { targetId });
        for (const entry of activeSockets.values()) {
          if (entry.user?.id === peerId) {
            io.to(entry.socketId).emit('message-deleted', { targetId });
          }
        }
      } else if (zoneId) {
        const list = zoneMessages.get(zoneId) || [];
        zoneMessages.set(zoneId, list.filter(m => m.id !== targetId && m.clientId !== targetId));
        io.to(zoneId).emit('message-deleted', { targetId });
      }
    });

    // 7. Edit message
    socket.on('edit-message', payload => {
      const { targetId, text, peerId, myId, zoneId } = payload || {};
      if (!targetId || !text) return;
      const editedAt = new Date().toISOString();
      const newText = text.trim();

      const updateList = list => (list || []).map(m => {
        if (m.id === targetId || m.clientId === targetId) {
          return { ...m, text: newText, editedAt };
        }
        return m;
      });

      if (peerId && myId) {
        const key = getPairKey(myId, peerId);
        conversations.set(key, updateList(conversations.get(key)));
        socket.emit('message-edited', { targetId, text: newText, editedAt });
        for (const entry of activeSockets.values()) {
          if (entry.user?.id === peerId) {
            io.to(entry.socketId).emit('message-edited', { targetId, text: newText, editedAt });
          }
        }
      } else if (zoneId) {
        zoneMessages.set(zoneId, updateList(zoneMessages.get(zoneId)));
        io.to(zoneId).emit('message-edited', { targetId, text: newText, editedAt });
      }
    });

    // 8. Disconnection
    socket.on('disconnect', () => {
      const current = activeSockets.get(socket.id);
      if (current) {
        const { zoneId, boundary } = current;
        activeSockets.delete(socket.id);
        const people = getGeofenceUsers(zoneId, boundary);
        io.to(zoneId).emit('geofence-users', people);
      }
    });
  });

  return io;
}
