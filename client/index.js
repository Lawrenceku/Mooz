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

// All roles use the same maps now — full mesh topology
const peerConnections = new Map(); // peerId -> RTCPeerConnection
const remoteStreams = new Map();   // peerId -> MediaStream
const peerNames = new Map();       // peerId -> display name

let localStream = null;
let audioEnabled = true;
let videoEnabled = true;

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ]
};

// VIDEO GRID

function addVideoElement(peerId, stream, label) {
  if (document.getElementById(`wrapper-${peerId}`)) return;

  const grid = document.getElementById("videoGrid");
  const wrapper = document.createElement("div");
  wrapper.id = `wrapper-${peerId}`;
  wrapper.className = "video-wrapper";

  const video = document.createElement("video");
  video.id = `video-${peerId}`;
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = false;

  const nameTag = document.createElement("span");
  nameTag.className = "video-label";
  nameTag.textContent = label || peerId.slice(0, 6);

  wrapper.appendChild(video);
  wrapper.appendChild(nameTag);
  grid.appendChild(wrapper);
  video.play().catch(console.error);

  updateParticipantCount();
}

function removeVideoElement(peerId) {
  const wrapper = document.getElementById(`wrapper-${peerId}`);
  if (wrapper) wrapper.remove();
  updateParticipantCount();
}

function updateParticipantCount() {
  const count = document.querySelectorAll(".video-wrapper").length;
  document.getElementById("participantCount").textContent = `${count} Participant${count !== 1 ? "s" : ""}`;
}

// PEER CONNECTION FACTORY
// initiator=true means WE send the offer; initiator=false means we wait for their offer

function createPeerConnection(peerId, initiator) {
  // Don't create duplicate connections
  if (peerConnections.has(peerId)) return peerConnections.get(peerId);

  const peer = new RTCPeerConnection(ICE_CONFIG);
  peerConnections.set(peerId, peer);

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      websocket.send(JSON.stringify({
        type: "ice",
        candidate: event.candidate,
        to: peerId
      }));
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

  // Add our local tracks to the connection
  if (localStream) {
    localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
  }

  // If we're the initiator, create and send an offer
  if (initiator) {
    peer.createOffer()
      .then(offer => peer.setLocalDescription(offer))
      .then(() => {
        websocket.send(JSON.stringify({
          type: "offer",
          offer: peer.localDescription,
          to: peerId
        }));
        console.log("offer sent to", peerId);
      })
      .catch(console.error);
  }

  return peer;
}

// WEBSOCKET

websocket.addEventListener("open", () => {
  websocket.send(JSON.stringify({
    type: "register",
    role: role,
    id: userId,
    name: userName
  }));
  console.log("registered as", role, userId);
});

websocket.addEventListener("message", async (e) => {
  const data = JSON.parse(e.data);
  console.log("received:", data.type, "from:", data.from || data.peerId || "server");

  // After register+getUserMedia, server sends us the current room participants
  if (data.type === "room_state") {
    console.log("room_state: existing peers =", data.peers.map(p => p.name));
    for (const peer of data.peers) {
      peerNames.set(peer.id, peer.name);
      // We initiate the offer to every existing peer (they wait for us)
      createPeerConnection(peer.id, true);
    }
  }

  // Someone new joined — they will send us an offer, so we just note their name
  if (data.type === "peer_joined") {
    console.log("peer_joined:", data.name, data.peerId);
    peerNames.set(data.peerId, data.name);
    // Do NOT initiate here — the new peer initiates to us via room_state
  }

  // Received an offer from another peer — answer it
  if (data.type === "offer") {
    console.log("offer from", data.from);
    if (data.name) peerNames.set(data.from, data.name);

    // createPeerConnection with initiator=false (we answer, don't offer)
    const peer = createPeerConnection(data.from, false);

    await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    websocket.send(JSON.stringify({
      type: "answer",
      answer: peer.localDescription,
      to: data.from
    }));
  }

  // Received an answer to our offer
  if (data.type === "answer") {
    console.log("answer from", data.from);
    const peer = peerConnections.get(data.from);
    if (peer) await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  // ICE candidate from any peer
  if (data.type === "ice") {
    if (!data.candidate) return;
    try {
      const peer = peerConnections.get(data.from);
      if (peer) await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error("ICE error:", err);
    }
  }

  // A peer disconnected
  if (data.type === "peer_left") {
    const peer = peerConnections.get(data.peerId);
    if (peer) {
      peer.close();
      peerConnections.delete(data.peerId);
    }
    remoteStreams.delete(data.peerId);
    peerNames.delete(data.peerId);
    removeVideoElement(data.peerId);
  }

  // Chat message
  if (data.type === "mesg") {
    const container = document.getElementById("chatMessages");
    const msg = document.createElement("div");
    const name = document.createElement("b");
    name.textContent = data.name + ": ";
    msg.appendChild(name);
    msg.appendChild(document.createTextNode(data.mesg));
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    console.log("chat from", data.name);
  }
});

// SETUP — get media first, then send client_ready

async function setup() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

  const localVideo = document.getElementById("localVideo");
  if (localVideo) {
    localVideo.srcObject = localStream;
    localVideo.play().catch(console.error);
  }

  updateParticipantCount();

  // Now that we have media, announce ourselves so room_state comes back
  // with peers we can immediately connect to
  websocket.send(JSON.stringify({
    type: "client_ready",
    id: userId,
    name: userName
  }));

  console.log(role, "ready");
}

// Wait for websocket open before getting media, but only run setup once
websocket.addEventListener("open", () => {
  // Small delay to ensure register message is processed first
  setTimeout(setup, 100);
});

// CHAT

function sendMessage() {
  const chatInput = document.getElementById("chatInput");
  if (!chatInput.value.trim()) return;

  websocket.send(JSON.stringify({
    type: "mesg",
    mesg: chatInput.value,
    name: userName,
    id: userId
  }));
  chatInput.value = "";
}

// CONTROLS

document.getElementById("audioBtn")?.addEventListener("click", () => {
  if (!localStream) return;
  audioEnabled = !audioEnabled;
  localStream.getAudioTracks().forEach(t => (t.enabled = audioEnabled));
  document.getElementById("audioBtn").innerHTML = `Audio: <b>${audioEnabled ? "On" : "Off"}</b>`;
});

document.getElementById("videoBtn")?.addEventListener("click", () => {
  if (!localStream) return;
  videoEnabled = !videoEnabled;
  localStream.getVideoTracks().forEach(t => (t.enabled = videoEnabled));
  document.getElementById("videoBtn").innerHTML = `Video: <b>${videoEnabled ? "On" : "Off"}</b>`;
});

document.getElementById("chatToggle")?.addEventListener("click", () => {
  const chat = document.getElementById("chatContainer");
  chat.style.display = chat.style.display === "none" ? "flex" : "none";
});

document.getElementById("leaveBtn")?.addEventListener("click", () => {
  localStream?.getTracks().forEach(t => t.stop());
  websocket.close();
  window.location.href = "./connect.html";
});