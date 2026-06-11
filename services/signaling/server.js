//DEPRECATED

// const express = require("express");
// const app = express();
// // Initializes express-ws
// const socket = require("express-ws")(app); 
// let users = new Map();

// let admin = null;

// app.use(function(req, res, next){
//     console.log("middleware");
//     req.testing = "testing";
//     return next();
// });

// app.get("/", function(req, res, next){
//     console.log("hello " + req.testing);
//     res.end();
// });

// app.ws('/', function(ws, req) {
//     console.log('socket', req.testing);
//     ws.id = randomUUID();

//     ws.on("connect", ()=>{
//         ws.id = null;
//         ws.role = "client" //defualt role

//         //all messages
//         ws.on("message", (msg)=>{
//         let data = JSON.parse(msg)

//         //register

//         if (data.type == "register"){
//             ws.id = data.id
//             ws.role = data.role 
//             users.set(ws.id, ws);

//             if(ws.role == "admin"){
//                 admin = ws.id
//             }
//             console.log(admin == ws.id? `registered admin`: `registered user`)
//         return
//         }

//         //offer
//         if (data.type == "offer"){
//             let target = users.get(data.to)
//             for (const [id, user] of users){
//                 if(user.role == "client"){
//                     target.send(JSON.stringify(
//                      {
//                         type: "offer",
//                         offer: data.offer,
//                         from: ws.id
//                     }))
//                     }  
//             }}

//         //answer
// if (data.type === "answer") {
//     const target = users.get(data.to);

//     if (target) {
//         target.send(JSON.stringify({
//             type: "answer",
//             answer: data.answer,
//             from: ws.id
//         }));
//     }
//     return;
// }

        

//         //ice candidate
//         if( data.type == "ice"){
//             let target = users.get(data.to)
//             if(users.get(data.to)){
//                 target.send(JSON.stringify({
//                     type: "ice",           
//                     candidate: data.candidate,
//                      from: ws.id
//                 }))
//             }

//             console.log("ice")

//             return;
//         }

//         })


//     })

//     ws.on("close", ()=>{
//         if(ws.id){
//             users.delete(ws.id)
//         }
//         if(ws.id == admin){
//             admin = null;
//         }
//     })
// });


// app.listen(3000, () => console.log("Server live on 3000"));


const express = require("express");
const http = require("http");
const { randomUUID } = require("crypto");

const app = express();
const server = http.createServer(app);

// attach websocket to HTTP server (important for deployment stability)
require("express-ws")(app, server);
let users = new Map(); // userId map to ws
let admin = null;      // admin userId

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
      users.set(ws.id, ws);

      if (ws.role === "admin") {
        admin = ws.id;
        console.log("registered admin:", ws.id);
      } else {
        console.log("registered client:", ws.id, "| total users:", users.size);
      }
      return;
    }

    // client ready: tell admin
    if (data.type === "client_ready") {
      const adminSocket = users.get(admin);
      if (adminSocket) {
        adminSocket.send(JSON.stringify({
          type: "client_ready",
          clientId: ws.id
        }));
        console.log("notified admin: client ready", ws.id);
      } else {
        // No admin yet — tell the client
        ws.send(JSON.stringify({ type: "error", message: "No admin in room yet" }));
        console.log("client_ready but no admin connected");
      }
      return;
    }

    // offer: admin → specific client
    if (data.type === "offer") {
      const target = users.get(data.to);
      if (target) {
        target.send(JSON.stringify({
          type: "offer",
          offer: data.offer,
          from: ws.id
        }));
        console.log("offer forwarded to", data.to);
      } else {
        console.log("offer target not found:", data.to);
      }
      return;
    }

    // answer: client → admin
    if (data.type === "answer") {
      const target = users.get(data.to);
      if (target) {
        target.send(JSON.stringify({
          type: "answer",
          answer: data.answer,
          from: ws.id
        }));
        console.log("answer forwarded to", data.to);
      }
      return;
    }

    // ice: route by real ID, resolve "admin" string
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
  });

  ws.on("close", () => {
    if (ws.id) {
      users.delete(ws.id);
      console.log("disconnected:", ws.id, "| remaining:", users.size);

      if (admin === ws.id) {
        admin = null;
        console.log("admin left");
      }

      // Notify admin that a client left so it can clean up the video tile
      const adminSocket = users.get(admin);
      if (adminSocket && ws.role === "client") {
        adminSocket.send(JSON.stringify({
          type: "client_left",
          clientId: ws.id
        }));
      }
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});