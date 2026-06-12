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

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" }
  ]
};

// Deterministic avatar color from a string
const AVATAR_COLORS = ["#e74c6f","#e7a23c","#3ca9e7","#8c3ce7","#3ce76f","#e7563c","#3ce7d4"];
function avatarColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// VIDEO GRID

function addVideoElement(peerId, stream, label) {
  if (document.getElementById(`wrapper-${peerId}`)) return;

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

  video.play().catch(console.error);

  placeInGrid(peerId, wrapper);
  updateParticipantCount();
}

function placeInGrid(peerId, wrapper) {
  const gridArea = document.getElementById("gridArea");
  const strip = document.getElementById("participantStrip");

  if (gridArea.classList.contains("presenting") && strip && peerId !== "screen-" + userId) {
    strip.appendChild(wrapper);
  } else {
    document.getElementById("videoGrid").appendChild(wrapper);
  }
}

function removeVideoElement(peerId) {
  const wrapper = document.getElementById(`wrapper-${peerId}`);
  if (wrapper) wrapper.remove();
  updateParticipantCount();
}

function updateParticipantCount() {
  const count = document.querySelectorAll(".video-wrapper").length;
  document.getElementById("participantCount").textContent =
    `${count} Participant${count !== 1 ? "s" : ""}`;
}

// Mark a tile cam-on or cam-off
function setTileCamState(peerId, on) {
  const wrapper = document.getElementById(`wrapper-${peerId}`);
  if (!wrapper) return;
  wrapper.classList.toggle("cam-off", !on);
}

// PEER CONNECTION FACTORY

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
    console.log("ontrack from", peerId);
    let stream = remoteStreams.get(peerId);
    if (!stream) {
      stream = new MediaStream();
      remoteStreams.set(peerId, stream);
      const label = peerNames.get(peerId) || peerId.slice(0, 6);
      addVideoElement(peerId, stream, label);
    }
    event.streams[0].getTracks().forEach(track => {
      if (!stream.getTracks().find(t => t.id === track.id)) {
        stream.addTrack(track);
      }
    });
    // A video track arriving means cam is on
    if (event.track.kind === "video") setTileCamState(peerId, true);
  };

  peer.onconnectionstatechange = () => {
    console.log(`peer ${peerId}:`, peer.connectionState);
    if (["disconnected", "failed", "closed"].includes(peer.connectionState)) {
      peer.close();
      peerConnections.delete(peerId);
      remoteStreams.delete(peerId);
      peerNames.delete(peerId);
      removeVideoElement(peerId);
    }
  };

  if (localStream) {
    localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
  }

  if (initiator) {
    peer.createOffer()
      .then(offer => peer.setLocalDescription(offer))
      .then(() => {
        websocket.send(JSON.stringify({ type: "offer", offer: peer.localDescription, to: peerId }));
        console.log("offer sent to", peerId);
      })
      .catch(console.error);
  }

  return peer;
}

// WEBSOCKET

websocket.addEventListener("open", () => {
  websocket.send(JSON.stringify({ type: "register", role, id: userId, name: userName }));
  console.log("registered as", role, userId);
});

websocket.addEventListener("message", async (e) => {
  const data = JSON.parse(e.data);
  console.log("received:", data.type, "from:", data.from || data.peerId || "server");

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
    } catch (err) {
      console.error("ICE error:", err);
    }
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

  websocket.send(JSON.stringify({ type: "client_ready", id: userId, name: userName }));
  console.log(role, "ready");
}

websocket.addEventListener("open", () => {
  setTimeout(setup, 100);
});

// CHAT

function sendMessage() {
  const chatInput = document.getElementById("chatInput");
  if (!chatInput.value.trim()) return;
  websocket.send(JSON.stringify({ type: "mesg", mesg: chatInput.value, name: userName, id: userId }));
  chatInput.value = "";
}

document.getElementById("chatInput")?.addEventListener("keydown", (e) => {
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
  // Toggle own local tile
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

const screenPeerId = "screen-" + userId;

document.getElementById("presentBtn")?.addEventListener("click", async () => {
  if (screenStream) {
    stopPresenting();
    return;
  }

  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always" },
      audio: false
    });

    enterPresentingLayout(screenStream);

    for (const [peerId, peer] of peerConnections) {
      const screenTrack = screenStream.getVideoTracks()[0];
      const sender = peer.getSenders().find(s => s.track?.kind === "video");
      if (sender) sender.replaceTrack(screenTrack);
    }

    document.getElementById("presentBtn").innerHTML = "Stop";
    document.getElementById("presentBtn").classList.add("presenting-active");

    screenStream.getVideoTracks()[0].addEventListener("ended", stopPresenting);

  } catch (err) {
    if (err.name !== "NotAllowedError") console.error("getDisplayMedia error:", err);
    screenStream = null;
  }
});

function enterPresentingLayout(stream) {
  const gridArea = document.getElementById("gridArea");
  const videoGrid = document.getElementById("videoGrid");

  gridArea.classList.add("presenting");

  // Screen tile
  const screenWrapper = document.createElement("div");
  screenWrapper.id = `wrapper-${screenPeerId}`;
  screenWrapper.className = "video-wrapper screen-tile";
  const screenVideo = document.createElement("video");
  screenVideo.id = `video-${screenPeerId}`;
  screenVideo.srcObject = stream;
  screenVideo.autoplay = true;
  screenVideo.playsInline = true;
  screenVideo.muted = true;
  const screenLabel = document.createElement("span");
  screenLabel.className = "video-label";
  screenLabel.textContent = `${userName} (screen)`;
  screenWrapper.appendChild(screenVideo);
  screenWrapper.appendChild(screenLabel);
  gridArea.insertBefore(screenWrapper, videoGrid);
  screenVideo.play().catch(console.error);

  // Participant strip
  const strip = document.createElement("div");
  strip.id = "participantStrip";
  strip.className = "participant-strip";

  // Move all existing remote tiles into the strip
  const tiles = videoGrid.querySelectorAll(".video-wrapper");
  tiles.forEach(t => strip.appendChild(t));

  // Move local tile into strip too
  const localWrapper = document.getElementById("wrapper-local");
  if (localWrapper) strip.appendChild(localWrapper);

  gridArea.appendChild(strip);
}

function exitPresentingLayout() {
  const gridArea = document.getElementById("gridArea");
  const videoGrid = document.getElementById("videoGrid");
  const strip = document.getElementById("participantStrip");

  // Move tiles back to videoGrid
  if (strip) {
    const tiles = strip.querySelectorAll(".video-wrapper");
    tiles.forEach(t => {
      if (t.id === "wrapper-local") {
        // local goes back before videoGrid
        gridArea.insertBefore(t, videoGrid);
      } else {
        videoGrid.appendChild(t);
      }
    });
    strip.remove();
  }

  removeVideoElement(screenPeerId);
  gridArea.classList.remove("presenting");
}

function stopPresenting() {
  if (!screenStream) return;
  screenStream.getTracks().forEach(t => t.stop());
  screenStream = null;

  exitPresentingLayout();

  if (localStream) {
    const cameraTrack = localStream.getVideoTracks()[0];
    for (const [peerId, peer] of peerConnections) {
      const sender = peer.getSenders().find(s => s.track?.kind === "video");
      if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
    }
  }

  document.getElementById("presentBtn").innerHTML = "Present";
  document.getElementById("presentBtn").classList.remove("presenting-active");
}