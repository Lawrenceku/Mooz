//DEPRECATED

// let chat = true
// let chat_btn = document.getSelection("")

// let ws = "ws://localhost:3000"
// let websocket = new WebSocket(ws)
// const pc = new RTCPeerConnection();
// let role = localStorage.getItem("role")
// let userId = localStorage.getItem("user")

// let remoteStream = new MediaStream()
// window.addEventListener("load", () => {
//   const video = document.getElementById("remoteVideo");
//   video.srcObject = remoteStream;
//   video.autoplay = true;
// video.playsInline = true;
// video.muted = true;
// video.play().catch(console.error);
// });

// pc.ontrack = (event) => {
//   event.streams[0].getTracks().forEach(track => {
//     remoteStream.addTrack(track) 
//   })

// }

// //EVENT LISTENERS
//     websocket.addEventListener("message", async (e)=>{
//     let data = JSON.parse(e.data)

//     if(data.type == "answer"){
//         await pc.setRemoteDescription(data.answer)
//     }
//     //the client now responds
//     if(data.type == "offer"){
//         await pc.setRemoteDescription(data.offer);
//         let answer = await pc.createAnswer()

//         await pc.setLocalDescription(answer)

//         websocket.send(JSON.stringify({
//             type: "answer",
//             answer: pc.localDescription,
//             to: data.from || "admin"
//         }))
//     }

//     if(data.type == "ice"){
//         if (data.candidate) {
//         await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
// }
//     }
// })

//             websocket.addEventListener("open", ()=>{
//             websocket.send(JSON.stringify({
//                 role: role,
//                 type: "register",
//                 id: userId
//             }))
//             console.log("connection open")
//             })  

//             //PUB/SUB
//             window.addEventListener("load", ()=>{role == 'client' ? joinRoom(): createRoom()})



//         async function createRoom(){
            
//             const stream = await navigator.mediaDevices.getUserMedia({
//                 video: true,
//                 audio: true
//             });

//                         //STREAMING 
//             stream.getTracks().forEach(track => {
//                 pc.addTrack(track, stream)
//             });
//               pc.onicecandidate = (event) => {
//             if (event.candidate) {
//             websocket.send(JSON.stringify({
//                 type: "ice",
//                 candidate: event.candidate,
//                 to: "client" 
//             }))
//             }
//         }


//             let offer = await pc.createOffer();
//             await pc.setLocalDescription(offer)

            
//                websocket.send(JSON.stringify({
//                 type: "offer",
//                 offer: pc.localDescription,
//                 to:"client"
//             }))
//         }

        


// async function joinRoom() {

//   const stream = await navigator.mediaDevices.getUserMedia({
//     video: true,
//     audio: true
//   })

//   stream.getTracks().forEach(track => {
//     pc.addTrack(track, stream)
//   })

//   pc.onicecandidate = (event) => {
//     if (event.candidate) {
//       websocket.send(JSON.stringify({
//         type: "ice",
//         candidate: event.candidate,
//         to: "admin"
//       }))
//     }
//   }
// }
const ws = "wss://mooz-obhv.onrender.com/ws";
const websocket = new WebSocket(ws);

const role = localStorage.getItem("role");
const userId = localStorage.getItem("user");
const userName = localStorage.getItem("name") || "User";

const peerConnections = new Map();
const remoteStreams = new Map();
const peerNames = new Map();

let localStream = null;
let audioEnabled = true;
let videoEnabled = true;
let screenStream = null;
let screenPeerId = null;

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" }
  ]
};

const AVATAR_COLORS = ["#e74c6f","#e7a23c","#3ca9e7","#8c3ce7","#3ce76f","#e7563c","#3ce7d4"];
function avatarColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// LAYOUT ENGINE
// Computes tile rects so they fill the container perfectly, Zoom/Meet style.
// In presenting mode: screen tile takes left half, participants fill right half.

function layoutTiles() {
  const area = document.getElementById("gridArea");
  const gap = 6;
  const pad = gap;
  const W = area.clientWidth - pad * 2;
  const H = area.clientHeight - pad * 2;

  if (screenStream && screenPeerId) {
    layoutPresenting(W, H, pad, gap);
  } else {
    layoutGrid(W, H, pad, gap);
  }
}

function bestGrid(count, W, H) {
  // Find cols/rows that best fills the area at 16:9 without wasting space
  let best = { cols: 1, rows: 1, tileW: 0, tileH: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const tileW = (W - (cols - 1) * 6) / cols;
    const tileH = tileW / (16 / 9);
    const totalH = tileH * rows + (rows - 1) * 6;
    if (totalH <= H) {
      // Check if scaling up by height gives a better fit
      const scaledH = (H - (rows - 1) * 6) / rows;
      const scaledW = scaledH * (16 / 9);
      const totalW = scaledW * cols + (cols - 1) * 6;
      const usedArea = totalW <= W
        ? scaledW * scaledH * count
        : tileW * tileH * count;
      if (usedArea > best.cols * best.tileW * best.tileH * best.rows) {
        best = { cols, rows, tileW, tileH };
      }
    }
  }
  return best;
}

function layoutGrid(W, H, pad, gap) {
  const tiles = getOrderedTiles();
  const count = tiles.length;
  if (!count) return;

  const { cols, rows } = bestFit(count, W, H, gap);
  const tileW = (W - (cols - 1) * gap) / cols;
  const tileH = (H - (rows - 1) * gap) / rows;

  tiles.forEach((tile, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Center the last incomplete row
    const rowCount = Math.ceil(count / cols);
    const tilesInThisRow = (row === rowCount - 1) ? count - row * cols : cols;
    const rowOffsetX = (cols - tilesInThisRow) * (tileW + gap) / 2;

    tile.style.left   = (pad + col * (tileW + gap) + rowOffsetX) + "px";
    tile.style.top    = (pad + row * (tileH + gap)) + "px";
    tile.style.width  = tileW + "px";
    tile.style.height = tileH + "px";
  });
}

function layoutPresenting(W, H, pad, gap) {
  const screenTile = document.getElementById(`wrapper-${screenPeerId}`);
  const participants = getOrderedTiles().filter(t => t.id !== `wrapper-${screenPeerId}`);
  const pCount = participants.length;

  if (!screenTile) return;

  if (pCount === 0) {
    // Full screen
    screenTile.style.left   = pad + "px";
    screenTile.style.top    = pad + "px";
    screenTile.style.width  = W + "px";
    screenTile.style.height = H + "px";
    return;
  }

  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    // Top 65% screen share, bottom strip
    const stripH = Math.min(110, H * 0.3);
    const screenH = H - stripH - gap;

    screenTile.style.left   = pad + "px";
    screenTile.style.top    = pad + "px";
    screenTile.style.width  = W + "px";
    screenTile.style.height = screenH + "px";

    const thumbW = (W - (pCount - 1) * gap) / pCount;
    const thumbH = stripH;
    participants.forEach((tile, i) => {
      tile.style.left   = (pad + i * (thumbW + gap)) + "px";
      tile.style.top    = (pad + screenH + gap) + "px";
      tile.style.width  = thumbW + "px";
      tile.style.height = thumbH + "px";
    });

  } else {
    // Left half screen share, right strip
    const stripW = Math.min(200, W * 0.25);
    const screenW = W - stripW - gap;

    screenTile.style.left   = pad + "px";
    screenTile.style.top    = pad + "px";
    screenTile.style.width  = screenW + "px";
    screenTile.style.height = H + "px";

    const thumbH = (H - (pCount - 1) * gap) / pCount;
    const thumbW = stripW;
    participants.forEach((tile, i) => {
      tile.style.left   = (pad + screenW + gap) + "px";
      tile.style.top    = (pad + i * (thumbH + gap)) + "px";
      tile.style.width  = thumbW + "px";
      tile.style.height = thumbH + "px";
    });
  }
}

// Find best cols/rows to fill W×H with `count` tiles at 16:9
function bestFit(count, W, H, gap) {
  let bestCols = 1, bestRows = count, bestArea = 0;

  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const tileW = (W - (cols - 1) * gap) / cols;
    const tileH = tileW / (16 / 9);
    const totalH = tileH * rows + (rows - 1) * gap;

    if (totalH > H) continue; // doesn't fit vertically

    const area = tileW * tileH * count;
    if (area > bestArea) {
      bestArea = area;
      bestCols = cols;
      bestRows = rows;
    }
  }

  // Also try fitting by height
  for (let rows = 1; rows <= count; rows++) {
    const cols = Math.ceil(count / rows);
    const tileH = (H - (rows - 1) * gap) / rows;
    const tileW = tileH * (16 / 9);
    const totalW = tileW * cols + (cols - 1) * gap;

    if (totalW > W) continue;

    const area = tileW * tileH * count;
    if (area > bestArea) {
      bestArea = area;
      bestCols = cols;
      bestRows = rows;
    }
  }

  return { cols: bestCols, rows: bestRows };
}

function getOrderedTiles() {
  const area = document.getElementById("gridArea");
  return Array.from(area.querySelectorAll(".video-wrapper"));
}

// Rerun layout on resize
const ro = new ResizeObserver(() => layoutTiles());
ro.observe(document.getElementById("gridArea"));

// VIDEO TILES

function addVideoElement(peerId, stream, label) {
  if (document.getElementById(`wrapper-${peerId}`)) return;

  const area = document.getElementById("gridArea");
  const wrapper = document.createElement("div");
  wrapper.id = `wrapper-${peerId}`;
  wrapper.className = "video-wrapper";

  const video = document.createElement("video");
  video.id = `video-${peerId}`;
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = false;

  const placeholder = document.createElement("div");
  placeholder.className = "cam-off-placeholder";
  const avatar = document.createElement("div");
  avatar.className = "cam-avatar";
  avatar.style.background = avatarColor(label || peerId);
  avatar.textContent = (label || "?")[0].toUpperCase();
  const nameSpan = document.createElement("span");
  nameSpan.textContent = label || peerId.slice(0, 6);
  placeholder.appendChild(avatar);
  placeholder.appendChild(nameSpan);

  const nameTag = document.createElement("span");
  nameTag.className = "video-label";
  nameTag.textContent = label || peerId.slice(0, 6);

  wrapper.appendChild(video);
  wrapper.appendChild(placeholder);
  wrapper.appendChild(nameTag);
  area.appendChild(wrapper);

  video.play().catch(console.error);
  layoutTiles();
}

function removeVideoElement(peerId) {
  const wrapper = document.getElementById(`wrapper-${peerId}`);
  if (wrapper) wrapper.remove();
  layoutTiles();
  updateParticipantCount();
}

function updateParticipantCount() {
  const count = document.querySelectorAll(".video-wrapper").length;
  document.getElementById("participantCount").textContent =
    `${count} Participant${count !== 1 ? "s" : ""}`;
}

function setTileCamState(peerId, on) {
  const wrapper = document.getElementById(`wrapper-${peerId}`);
  if (wrapper) wrapper.classList.toggle("cam-off", !on);
}

// PEER CONNECTIONS

function createPeerConnection(peerId, initiator) {
  if (peerConnections.has(peerId)) return peerConnections.get(peerId);

  const peer = new RTCPeerConnection(ICE_CONFIG);
  peerConnections.set(peerId, peer);

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      websocket.send(JSON.stringify({ type: "ice", candidate: event.candidate, to: peerId }));
    }
  };

  peer.ontrack = (event) => {
    let stream = remoteStreams.get(peerId);
    if (!stream) {
      stream = new MediaStream();
      remoteStreams.set(peerId, stream);
      const label = peerNames.get(peerId) || peerId.slice(0, 6);
      addVideoElement(peerId, stream, label);
    }
    event.streams[0].getTracks().forEach(track => {
      if (!stream.getTracks().find(t => t.id === track.id)) stream.addTrack(track);
    });
    if (event.track.kind === "video") setTileCamState(peerId, true);
  };

  peer.onconnectionstatechange = () => {
    if (["disconnected", "failed", "closed"].includes(peer.connectionState)) {
      peer.close();
      peerConnections.delete(peerId);
      remoteStreams.delete(peerId);
      peerNames.delete(peerId);
      removeVideoElement(peerId);
    }
  };

  if (localStream) localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

  if (initiator) {
    peer.createOffer()
      .then(offer => peer.setLocalDescription(offer))
      .then(() => websocket.send(JSON.stringify({ type: "offer", offer: peer.localDescription, to: peerId })))
      .catch(console.error);
  }

  return peer;
}

// WEBSOCKET

websocket.addEventListener("open", () => {
  websocket.send(JSON.stringify({ type: "register", role, id: userId, name: userName }));
});

websocket.addEventListener("message", async (e) => {
  const data = JSON.parse(e.data);

  if (data.type === "room_state") {
    for (const peer of data.peers) {
      peerNames.set(peer.id, peer.name);
      createPeerConnection(peer.id, true);
    }
  }

  if (data.type === "peer_joined") {
    peerNames.set(data.peerId, data.name);
  }

  if (data.type === "offer") {
    if (data.name) peerNames.set(data.from, data.name);
    const peer = createPeerConnection(data.from, false);
    await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    websocket.send(JSON.stringify({ type: "answer", answer: peer.localDescription, to: data.from }));
  }

  if (data.type === "answer") {
    const peer = peerConnections.get(data.from);
    if (peer) await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  if (data.type === "ice") {
    if (!data.candidate) return;
    try {
      const peer = peerConnections.get(data.from);
      if (peer) await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) { console.error("ICE error:", err); }
  }

  if (data.type === "peer_left") {
    const peer = peerConnections.get(data.peerId);
    if (peer) { peer.close(); peerConnections.delete(data.peerId); }
    remoteStreams.delete(data.peerId);
    peerNames.delete(data.peerId);
    removeVideoElement(data.peerId);
  }

  if (data.type === "mesg") {
    const container = document.getElementById("chatMessages");
    const msg = document.createElement("div");
    const name = document.createElement("b");
    name.textContent = data.name;
    msg.appendChild(name);
    msg.appendChild(document.createTextNode(data.mesg));
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }
});

// SETUP

async function setup() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

  const localVideo = document.getElementById("localVideo");
  if (localVideo) {
    localVideo.srcObject = localStream;
    localVideo.play().catch(console.error);
  }

  updateParticipantCount();
  layoutTiles();

  websocket.send(JSON.stringify({ type: "client_ready", id: userId, name: userName }));
}

websocket.addEventListener("open", () => setTimeout(setup, 100));

// CHAT

function sendMessage() {
  const input = document.getElementById("chatInput");
  if (!input.value.trim()) return;
  websocket.send(JSON.stringify({ type: "mesg", mesg: input.value, name: userName, id: userId }));
  input.value = "";
}

document.getElementById("chatInput")?.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});

// CONTROLS

document.getElementById("audioBtn")?.addEventListener("click", () => {
  if (!localStream) return;
  audioEnabled = !audioEnabled;
  localStream.getAudioTracks().forEach(t => (t.enabled = audioEnabled));
  document.getElementById("audioBtn").innerHTML = `Mic <b>${audioEnabled ? "On" : "Off"}</b>`;
});

document.getElementById("videoBtn")?.addEventListener("click", () => {
  if (!localStream) return;
  videoEnabled = !videoEnabled;
  localStream.getVideoTracks().forEach(t => (t.enabled = videoEnabled));
  document.getElementById("videoBtn").innerHTML = `Cam <b>${videoEnabled ? "On" : "Off"}</b>`;
  setTileCamState("local", videoEnabled);
});

document.getElementById("chatToggle")?.addEventListener("click", () => {
  document.querySelector(".main-container").classList.toggle("chat-open");
});

document.getElementById("chatClose")?.addEventListener("click", () => {
  document.querySelector(".main-container").classList.remove("chat-open");
});

document.getElementById("leaveBtn")?.addEventListener("click", () => {
  localStream?.getTracks().forEach(t => t.stop());
  websocket.close();
  window.location.href = "./connect.html";
});

// SCREEN SHARE

document.getElementById("presentBtn")?.addEventListener("click", async () => {
  if (screenStream) { stopPresenting(); return; }

  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: false });
    screenPeerId = "screen-" + userId;

    // Add screen tile into the grid area
    const area = document.getElementById("gridArea");
    const wrapper = document.createElement("div");
    wrapper.id = `wrapper-${screenPeerId}`;
    wrapper.className = "video-wrapper";
    const vid = document.createElement("video");
    vid.srcObject = screenStream;
    vid.autoplay = true;
    vid.playsInline = true;
    vid.muted = true;
    const lbl = document.createElement("span");
    lbl.className = "video-label";
    lbl.textContent = `${userName} (screen)`;
    wrapper.appendChild(vid);
    wrapper.appendChild(lbl);
    area.insertBefore(wrapper, area.firstChild); // screen first so layout puts it left/top
    vid.play().catch(console.error);

    for (const [peerId, peer] of peerConnections) {
      const sender = peer.getSenders().find(s => s.track?.kind === "video");
      if (sender) sender.replaceTrack(screenStream.getVideoTracks()[0]);
    }

    document.getElementById("presentBtn").innerHTML = "Stop";
    document.getElementById("presentBtn").classList.add("presenting-active");

    layoutTiles();

    screenStream.getVideoTracks()[0].addEventListener("ended", stopPresenting);

  } catch (err) {
    if (err.name !== "NotAllowedError") console.error("getDisplayMedia:", err);
    screenStream = null;
    screenPeerId = null;
  }
});

function stopPresenting() {
  if (!screenStream) return;

  screenStream.getTracks().forEach(t => t.stop());
  screenStream = null;

  const wrapper = document.getElementById(`wrapper-${screenPeerId}`);
  if (wrapper) wrapper.remove();
  screenPeerId = null;

  if (localStream) {
    const cam = localStream.getVideoTracks()[0];
    for (const [, peer] of peerConnections) {
      const sender = peer.getSenders().find(s => s.track?.kind === "video");
      if (sender && cam) sender.replaceTrack(cam);
    }
  }

  document.getElementById("presentBtn").innerHTML = "Present";
  document.getElementById("presentBtn").classList.remove("presenting-active");

  layoutTiles();
}