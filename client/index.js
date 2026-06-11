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


const ws = "https://mooz-obhv.onrender.com/";
const websocket = new WebSocket(ws);

const role = localStorage.getItem("role");
const userId = localStorage.getItem("user");
const userName = localStorage.getItem("name") || "User";

// Admin: one RTCPeerConnection per client { clientId -> pc }
const peerConnections = new Map();
const remoteStreams = new Map();

// Client: single pc to admin
let pc = null;
let localStream = null;
let currentClientId = null;

let audioEnabled = true;
let videoEnabled = true;

// ─── VIDEO GRID ───────────────────────────────────────────────────────────────

function addVideoElement(clientId, stream, label) {
  if (document.getElementById(`wrapper-${clientId}`)) return;

  const grid = document.getElementById("videoGrid");
  const wrapper = document.createElement("div");
  wrapper.id = `wrapper-${clientId}`;
  wrapper.className = "video-wrapper";

  const video = document.createElement("video");
  video.id = `video-${clientId}`;
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = false;

  const nameTag = document.createElement("span");
  nameTag.className = "video-label";
  nameTag.textContent = label || clientId.slice(0, 6);

  wrapper.appendChild(video);
  wrapper.appendChild(nameTag);
  grid.appendChild(wrapper);
  video.play().catch(console.error);

  updateParticipantCount();
}

function removeVideoElement(clientId) {
  const wrapper = document.getElementById(`wrapper-${clientId}`);
  if (wrapper) wrapper.remove();
  updateParticipantCount();
}

function updateParticipantCount() {
  const count = document.querySelectorAll(".video-wrapper").length;
  document.getElementById("participantCount").textContent = `${count} Participant${count !== 1 ? "s" : ""}`;
}

// ─── PEER CONNECTION FACTORY ──────────────────────────────────────────────────

function createPeerConnection(remoteId) {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      websocket.send(JSON.stringify({
        type: "ice",
        candidate: event.candidate,
        to: remoteId
      }));
    }
  };

  peer.ontrack = (event) => {
    console.log("ontrack from", remoteId);

    if (role === "admin") {
      let stream = remoteStreams.get(remoteId);
      if (!stream) {
        stream = new MediaStream();
        remoteStreams.set(remoteId, stream);
        addVideoElement(remoteId, stream);
      }
      event.streams[0].getTracks().forEach(track => stream.addTrack(track));
    } else {
      // Client sees admin's stream in remoteVideo
      const video = document.getElementById("remoteVideo");
      if (video) {
        if (!video.srcObject) video.srcObject = new MediaStream();
        event.streams[0].getTracks().forEach(t => video.srcObject.addTrack(t));
        video.play().catch(console.error);
      }
    }
  };

  peer.onconnectionstatechange = () => {
    console.log(`peer ${remoteId}:`, peer.connectionState);
    if (["disconnected", "failed", "closed"].includes(peer.connectionState)) {
      if (role === "admin") {
        peer.close();
        peerConnections.delete(remoteId);
        remoteStreams.delete(remoteId);
        removeVideoElement(remoteId);
      }
    }
  };

  return peer;
}

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────

websocket.addEventListener("open", () => {
  websocket.send(JSON.stringify({
    type: "register",
    role: role,
    id: userId,
    name: userName
  }));
  console.log("registered as", role);
  role === "admin" ? setupAdmin() : joinRoom();
});

websocket.addEventListener("message", async (e) => {
  const data = JSON.parse(e.data);
  console.log("received:", data.type, "from:", data.from || data.clientId);

  // Admin: client has tracks ready create a dedicated pc and send offer
  if (data.type === "client_ready") {
    if (role !== "admin") return;

    const peer = createPeerConnection(data.clientId);
    peerConnections.set(data.clientId, peer);

    if (localStream) {
      localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
    }

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    websocket.send(JSON.stringify({
      type: "offer",
      offer: peer.localDescription,
      to: data.clientId
    }));

    console.log("offer sent to", data.clientId);
  }

  // Client: receives offer from admin
  if (data.type === "offer") {
    if (role !== "client") return;
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    websocket.send(JSON.stringify({
      type: "answer",
      answer: pc.localDescription,
      to: data.from
    }));
  }

  // Admin: receives answer from a specific client
  if (data.type === "answer") {
    if (role !== "admin") return;
    const peer = peerConnections.get(data.from);
    if (peer) await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  // Both: ICE candidates
  if (data.type === "ice") {
    if (!data.candidate) return;
    try {
      if (role === "admin") {
        const peer = peerConnections.get(data.from);
        if (peer) await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (err) {
      console.error("ICE error:", err);
    }
  }

  // Admin: a client disconnected
  if (data.type === "client_left") {
    const peer = peerConnections.get(data.clientId);
    if (peer) {
      peer.close();
      peerConnections.delete(data.clientId);
    }
    remoteStreams.delete(data.clientId);
    removeVideoElement(data.clientId);
  }
});

// ─── ADMIN ────────────────────────────────────────────────────────────────────

async function setupAdmin() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

  const localVideo = document.getElementById("localVideo");
  if (localVideo) {
    localVideo.srcObject = localStream;
    localVideo.play().catch(console.error);
  }

  updateParticipantCount();
  console.log("admin ready, waiting for clients...");
}

// ─── CLIENT ───────────────────────────────────────────────────────────────────

async function joinRoom() {
  // Client only needs one remote video tile (the admin's stream)
  const grid = document.getElementById("videoGrid");
  const wrapper = document.createElement("div");
  wrapper.className = "video-wrapper";
  const remoteVideo = document.createElement("video");
  remoteVideo.id = "remoteVideo";
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;
  const label = document.createElement("span");
  label.className = "video-label";
  label.textContent = "Host";
  wrapper.appendChild(remoteVideo);
  wrapper.appendChild(label);
  grid.appendChild(wrapper);

  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

  const localVideo = document.getElementById("localVideo");
  if (localVideo) {
    localVideo.srcObject = localStream;
    localVideo.play().catch(console.error);
  }

  pc = createPeerConnection("admin");
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  websocket.send(JSON.stringify({
    type: "client_ready",
    id: userId,
    name: userName
  }));

  updateParticipantCount();
  console.log("client ready, waiting for offer...");
}

// ─── CONTROLS ────────────────────────────────────────────────────────────────

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