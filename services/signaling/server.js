const express = require("express");
const http = require("http");
const { randomUUID } = require("crypto");

const app = express();
const server = http.createServer(app);

require("express-ws")(app, server);

let users = new Map(); // userId -> ws
let admin = null;

app.use(function (req, res, next) {
  req.testing = "testing";
  return next();
});

app.get("/", function (req, res) {
  res.send('ws running');
});

app.ws("/ws", function (ws, req) {
  ws.id = randomUUID();

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      console.error("bad JSON", e);
      return;
    }

    console.log("msg:", data.type, "from:", ws.id);

    // register
    if (data.type === "register") {
      ws.id = data.id;
      ws.role = data.role;
      ws.name = data.name || "User";
      users.set(ws.id, ws);

      if (ws.role === "admin") {
        admin = ws.id;
        console.log("registered admin:", ws.id);
      } else {
        console.log("registered client:", ws.id, ws.name, "| total users:", users.size);
      }
      return;
    }

    // client ready: send new client the room state, tell everyone else they joined
    if (data.type === "client_ready") {
      ws.name = data.name || ws.name || "User";

      // Build list of everyone already in the room (excluding this new client)
      const existingPeers = [];
      for (const [id, user] of users) {
        if (id !== ws.id) {
          existingPeers.push({ id, name: user.name, role: user.role });
        }
      }

      // Tell the new client who is already here so it can initiate peer connections
      ws.send(JSON.stringify({
        type: "room_state",
        peers: existingPeers
      }));

      // Tell everyone else a new peer joined
      for (const [id, user] of users) {
        if (id !== ws.id) {
          user.send(JSON.stringify({
            type: "peer_joined",
            peerId: ws.id,
            name: ws.name,
            role: ws.role
          }));
        }
      }

      console.log("client_ready:", ws.id, ws.name, "| notified", existingPeers.length, "peers");
      return;
    }

    // offer: route to specific target (any peer -> any peer)
    if (data.type === "offer") {
      const target = users.get(data.to);
      if (target) {
        target.send(JSON.stringify({
          type: "offer",
          offer: data.offer,
          from: ws.id,
          name: ws.name
        }));
        console.log("offer forwarded", ws.id, "->", data.to);
      } else {
        console.log("offer target not found:", data.to);
      }
      return;
    }

    // answer: route to specific target
    if (data.type === "answer") {
      const target = users.get(data.to);
      if (target) {
        target.send(JSON.stringify({
          type: "answer",
          answer: data.answer,
          from: ws.id
        }));
        console.log("answer forwarded", ws.id, "->", data.to);
      }
      return;
    }

    // ice: route by real ID, resolve "admin" alias
    if (data.type === "ice") {
      const toId = data.to === "admin" ? admin : data.to;
      const target = users.get(toId);
      if (target) {
        target.send(JSON.stringify({
          type: "ice",
          candidate: data.candidate,
          from: ws.id
        }));
      }
      console.log("ice forwarded to", toId);
      return;
    }

    // chat: broadcast to everyone in the room
    if (data.type === "mesg") {
      const outbound = JSON.stringify({
        type: "mesg",
        mesg: data.mesg,
        name: ws.name || data.name || "User",
        from: ws.id
      });
      for (const [id, user] of users) {
        user.send(outbound);
      }
      console.log("chat broadcast from", ws.id, ws.name);
      return;
    }
  });

  ws.on("close", () => {
    if (ws.id) {
      users.delete(ws.id);
      console.log("disconnected:", ws.id, "| remaining:", users.size);

      if (admin === ws.id) {
        admin = null;
        console.log("admin left");
      }

      // Notify everyone that this peer left
      for (const [id, user] of users) {
        user.send(JSON.stringify({
          type: "peer_left",
          peerId: ws.id
        }));
      }
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});