const express = require('express');
const http = require('http');
const { randomUUID } = require('crypto');

const app = express();
const server = http.createServer(app);

require('express-ws')(app, server);

const rooms = new Map();

function getRoom(roomId) {
  const normalizedRoomId = roomId || 'lobby';
  let room = rooms.get(normalizedRoomId);

  if (!room) {
    room = {
      users: new Map(),
      admin: null,
      activePresenter: null,
    };
    rooms.set(normalizedRoomId, room);
  }

  return room;
}

function removeRoomIfEmpty(roomId) {
  const room = rooms.get(roomId);
  if (room && room.users.size === 0) {
    rooms.delete(roomId);
  }
}

function broadcast(room, payload, exceptId = null) {
  const message = JSON.stringify(payload);
  for (const [id, user] of room.users) {
    if (exceptId && id === exceptId) continue;
    user.send(message);
  }
}

function roomMemberCount(room) {
  return room ? room.users.size : 0;
}

app.use(function (req, res, next) {
  req.testing = 'testing';
  return next();
});

app.get('/', function (req, res) {
  res.send('ws running');
});

app.ws('/ws', function (ws, req) {
  ws.id = randomUUID();
  ws.roomId = 'lobby';

  ws.on('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      console.error('bad JSON', e);
      return;
    }

    console.log('msg:', data.type, 'from:', ws.id);

    if (data.type === 'register') {
      ws.id = data.id;
      ws.role = data.role;
      ws.name = data.name || 'User';
      ws.roomId = data.room || ws.roomId || 'lobby';

      const room = getRoom(ws.roomId);
      room.users.set(ws.id, ws);

      if (ws.role === 'admin') {
        room.admin = ws.id;
        console.log('registered admin:', ws.id, 'room:', ws.roomId);
      } else {
        console.log(
          'registered client:',
          ws.id,
          ws.name,
          'room:',
          ws.roomId,
          '| total users:',
          room.users.size
        );
      }
      return;
    }

    const room = getRoom(ws.roomId);

    if (data.type === 'client_ready') {
      ws.name = data.name || ws.name || 'User';

      const existingPeers = [];
      for (const [id, user] of room.users) {
        if (id !== ws.id) {
          existingPeers.push({ id, name: user.name, role: user.role });
        }
      }

      ws.send(
        JSON.stringify({
          type: 'room_state',
          peers: existingPeers,
          presenter: room.activePresenter,
          memberCount: roomMemberCount(room),
        })
      );

      for (const [id, user] of room.users) {
        if (id !== ws.id) {
          user.send(
            JSON.stringify({
              type: 'peer_joined',
              peerId: ws.id,
              name: ws.name,
              role: ws.role,
              memberCount: roomMemberCount(room),
            })
          );
        }
      }

      console.log(
        'client_ready:',
        ws.id,
        ws.name,
        'room:',
        ws.roomId,
        '| notified',
        existingPeers.length,
        'peers'
      );
      return;
    }

    if (data.type === 'present_request') {
      if (room.activePresenter && room.activePresenter.id !== ws.id) {
        ws.send(
          JSON.stringify({
            type: 'present_denied',
            replyTo: data.token,
            message: 'someone is already presenting',
          })
        );
        return;
      }

      room.activePresenter = {
        id: ws.id,
        name: ws.name || data.name || 'User',
      };

      ws.send(
        JSON.stringify({
          type: 'present_ack',
          replyTo: data.token,
          ok: true,
        })
      );

      broadcast(room, {
        type: 'present_state',
        presenter: room.activePresenter,
        memberCount: roomMemberCount(room),
      });
      return;
    }

    if (data.type === 'present_release') {
      if (room.activePresenter && room.activePresenter.id === ws.id) {
        room.activePresenter = null;
        broadcast(room, {
          type: 'present_state',
          presenter: null,
          memberCount: roomMemberCount(room),
        });
      }
      return;
    }

    if (data.type === 'offer') {
      const target = room.users.get(data.to);
      if (target) {
        target.send(
          JSON.stringify({
            type: 'offer',
            offer: data.offer,
            from: ws.id,
            name: ws.name,
          })
        );
        console.log(
          'offer forwarded',
          ws.id,
          '->',
          data.to,
          'room:',
          ws.roomId
        );
      } else {
        console.log('offer target not found:', data.to, 'room:', ws.roomId);
      }
      return;
    }

    if (data.type === 'answer') {
      const target = room.users.get(data.to);
      if (target) {
        target.send(
          JSON.stringify({
            type: 'answer',
            answer: data.answer,
            from: ws.id,
          })
        );
        console.log(
          'answer forwarded',
          ws.id,
          '->',
          data.to,
          'room:',
          ws.roomId
        );
      }
      return;
    }

    if (data.type === 'ice') {
      const toId = data.to === 'admin' ? room.admin : data.to;
      const target = room.users.get(toId);
      if (target) {
        target.send(
          JSON.stringify({
            type: 'ice',
            candidate: data.candidate,
            from: ws.id,
          })
        );
      }
      console.log('ice forwarded to', toId, 'room:', ws.roomId);
      return;
    }

    if (data.type === 'mesg') {
      const outbound = JSON.stringify({
        type: 'mesg',
        mesg: data.mesg,
        name: ws.name || data.name || 'User',
        from: ws.id,
      });
      for (const [, user] of room.users) {
        user.send(outbound);
      }
      console.log('chat broadcast from', ws.id, ws.name, 'room:', ws.roomId);
      return;
    }
  });

  ws.on('close', () => {
    if (!ws.id) return;

    const room = rooms.get(ws.roomId);
    if (!room) return;

    room.users.delete(ws.id);
    console.log(
      'disconnected:',
      ws.id,
      '| remaining:',
      room.users.size,
      'room:',
      ws.roomId
    );

    if (room.activePresenter && room.activePresenter.id === ws.id) {
      room.activePresenter = null;
      broadcast(room, {
        type: 'present_state',
        presenter: null,
        memberCount: roomMemberCount(room),
      });
    }

    if (room.admin === ws.id) {
      room.admin = null;
      console.log('admin left room:', ws.roomId);
    }

    for (const [, user] of room.users) {
      user.send(
        JSON.stringify({
          type: 'peer_left',
          peerId: ws.id,
          memberCount: roomMemberCount(room),
        })
      );
    }

    removeRoomIfEmpty(ws.roomId);
  });
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
