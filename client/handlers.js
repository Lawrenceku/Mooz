import { state } from './state.js';
import {
  updateRoomMemberCount,
  layoutTiles,
  removePresentationElement,
  updateRoomBadge,
  syncTileAspectFromVideo,
  updateParticipantCount,
  removeVideoElement,
  updateUnreadCount,
  observeTileViewport,
  setTileCamState,
} from './ui.js';
import {
  refreshDebugMetrics,
  setDebugButtonVisibility,
  setDebugPanelVisibility,
  startDebugMetrics,
} from './debug.js';
import {
  createPeerConnection,
  updateVideoBitrate,
  attachPresentationTrack,
  renegotiatePeerConnection,
  removePresentationTrack,
} from './rtc.js';

export async function setup() {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
  } catch (videoAudioErr) {
    console.warn('video+audio failed, trying audio-only:', videoAudioErr);
    try {
      state.localStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });
      setTileCamState('local', false);
    } catch (audioErr) {
      console.warn('audio-only also failed, joining without media:', audioErr);
      state.localStream = null;
      setTileCamState('local', false);
    }
  }

  updateRoomBadge();
  setDebugButtonVisibility(state.debugEnabled);
  setDebugPanelVisibility(state.debugEnabled && state.metricsPanelOpen);

  const localVideo = document.getElementById('localVideo');
  if (localVideo) {
    localVideo.srcObject = state.localStream;
    syncTileAspectFromVideo(
      document.getElementById('wrapper-local'),
      localVideo
    );
    localVideo.play().catch(console.error);
  }

  updateParticipantCount();
  layoutTiles();

  state.websocket.send(
    JSON.stringify({
      type: 'client_ready',
      id: state.userId,
      name: state.userName,
      room: state.roomId,
    })
  );

  if (state.debugEnabled) {
    startDebugMetrics();
  }
}

export function sendMessage() {
  const input = document.getElementById('chatInput');
  if (!input.value.trim()) return;
  state.websocket.send(
    JSON.stringify({
      type: 'mesg',
      mesg: input.value,
      name: state.userName,
      id: state.userId,
    })
  );
  input.value = '';
}

export function websocketSendJson(payload) {
  return new Promise((resolve, reject) => {
    if (state.websocket.readyState !== WebSocket.OPEN) {
      resolve({ ok: false });
      return;
    }

    const token = Math.random().toString(36).slice(2);
    const message = { ...payload, token };
    let timeoutId = null;

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.replyTo !== token) return;
        state.websocket.removeEventListener('message', handleMessage);
        if (timeoutId) clearTimeout(timeoutId);
        resolve(data);
      } catch (error) {
        state.websocket.removeEventListener('message', handleMessage);
        if (timeoutId) clearTimeout(timeoutId);
        reject(error);
      }
    };

    state.websocket.addEventListener('message', handleMessage);
    state.websocket.send(JSON.stringify(message));

    timeoutId = setTimeout(() => {
      state.websocket.removeEventListener('message', handleMessage);
      resolve({ ok: false });
    }, 3000);
  });
}

export function stopPresenting() {
  if (!state.screenStream) return;

  for (const peerId of Array.from(state.presentationSenders.keys())) {
    removePresentationTrack(peerId);
    renegotiatePeerConnection(peerId);
  }

  state.screenStream.getTracks().forEach((t) => t.stop());
  state.screenStream = null;

  const wrapper = document.getElementById(`wrapper-${state.screenPeerId}`);
  if (wrapper) wrapper.remove();
  state.screenPeerId = null;

  for (const peerId of Array.from(state.presentationStreams.keys())) {
    removePresentationElement(peerId);
  }

  if (state.localStream) {
    const cam = state.localStream.getVideoTracks()[0];
    for (const [, peer] of state.peerConnections) {
      const sender = peer
        .getSenders()
        .find((s) => s.track && s.track.kind === 'video');
      if (sender && cam) sender.replaceTrack(cam).catch(console.error);
    }
  }

  state.websocket.send(
    JSON.stringify({ type: 'present_release', id: state.userId, name: state.userName })
  );

  document.getElementById('presentBtn').innerHTML = 'Present';
  document.getElementById('presentBtn').classList.remove('presenting-active');

  layoutTiles();
}

// Websocket events
state.websocket.addEventListener('open', () => {
  state.websocket.send(
    JSON.stringify({
      type: 'register',
      role: state.role,
      id: state.userId,
      name: state.userName,
      room: state.roomId,
    })
  );
});

state.websocket.addEventListener('message', async (e) => {
  const data = JSON.parse(e.data);

  if (data.type === 'room_state') {
    updateRoomMemberCount(data.memberCount || data.peers.length + 1);
    if (data.presenter) {
      state.activePresenterId = data.presenter.id || null;
      state.activePresenterName = data.presenter.name || '';
    }
    for (const peer of data.peers) {
      state.peerNames.set(peer.id, peer.name);
      createPeerConnection(peer.id, true);
    }
    layoutTiles();
    if (state.debugEnabled) refreshDebugMetrics().catch(console.error);
  }
  //listen for when a peer joins
  if (data.type === 'peer_joined') {
    updateRoomMemberCount(data.memberCount || state.roomMemberCount + 1);
    state.peerNames.set(data.peerId, data.name);
  }

  if (data.type === 'present_state') {
    state.activePresenterId = data.presenter ? data.presenter.id : null;
    state.activePresenterName = data.presenter ? data.presenter.name || '' : '';

    if (!state.activePresenterId) {
      for (const peerId of Array.from(state.presentationStreams.keys())) {
        removePresentationElement(peerId);
      }
    }

    layoutTiles();
  }

  if (data.type === 'present_denied') {
    alert(data.message || 'someone is already presenting');
  }
  //for when a peer sends an offer
  if (data.type === 'offer') {
    if (data.name) state.peerNames.set(data.from, data.name);
    const peer = createPeerConnection(data.from, false);
    await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    state.websocket.send(
      JSON.stringify({
        type: 'answer',
        answer: peer.localDescription,
        to: data.from,
      })
    );
  }

  //response to my offer
  if (data.type === 'answer') {
    const peer = state.peerConnections.get(data.from);
    if (peer)
      await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  if (data.type === 'ice') {
    if (!data.candidate) return;
    try {
      const peer = state.peerConnections.get(data.from);
      if (peer) await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error('ICE error:', err);
    }
  }

  if (data.type === 'peer_left') {
    updateRoomMemberCount(data.memberCount || Math.max(1, state.roomMemberCount - 1));
    if (state.peerDisconnectTimers.has(data.peerId)) {
      clearTimeout(state.peerDisconnectTimers.get(data.peerId));
      state.peerDisconnectTimers.delete(data.peerId);
    }
    const peer = state.peerConnections.get(data.peerId);
    if (peer) {
      peer.close();
      state.peerConnections.delete(data.peerId);
    }
    state.remoteStreams.delete(data.peerId);
    state.peerNames.delete(data.peerId);
    removeVideoElement(data.peerId);
    updateVideoBitrate().catch(console.error);
    if (state.debugEnabled) refreshDebugMetrics().catch(console.error);
  }

  if (data.type === 'mesg') {
    const container = document.getElementById('chatMessages');
    const msg = document.createElement('div');
    const name = document.createElement('b');
    name.textContent = data.name;
    msg.appendChild(name);
    msg.appendChild(document.createTextNode(data.mesg));
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    if (data.from != state.userId) {
      state.unreadCount++;
      updateUnreadCount();
    }
  }
});
