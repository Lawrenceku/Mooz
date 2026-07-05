import { state } from './state.js';
import {
  layoutTiles,
  setTileCamState,
  updateUnreadCount,
  syncTileAspectFromVideo,
  observeTileViewport,
} from './ui.js';
import {
  setDebugPanelVisibility,
  refreshDebugMetrics,
  stopDebugMetrics,
} from './debug.js';
import {
  attachPresentationTrack,
  renegotiatePeerConnection,
} from './rtc.js';
import {
  setup,
  sendMessage,
  websocketSendJson,
  stopPresenting,
} from './handlers.js';

// Setup ResizeObserver for dynamic layout updates
const ro = new ResizeObserver(() => layoutTiles());
ro.observe(document.getElementById('gridArea'));

// Logging interval for debugging metrics
setInterval(
  () =>
    console.log(
      `Peer connections: ${state.peerConnections.size}, Remote streams: ${state.remoteStreams.size}, Peer names: ${state.peerNames.size}, Peer metric snapshots: ${state.peerMetricSnapshots.size}`
    ),
  5000
);

// Call setup when websocket opens
state.websocket.addEventListener('open', () => setTimeout(setup, 100));

// Chat Input Handlers
document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

document.getElementById('sendBtn')?.addEventListener('click', sendMessage);

// Controls Handlers
document.getElementById('audioBtn')?.addEventListener('click', () => {
  if (!state.localStream) return;
  state.audioEnabled = !state.audioEnabled;
  state.localStream.getAudioTracks().forEach((t) => (t.enabled = state.audioEnabled));
  document.getElementById('audioBtn').innerHTML =
    `Mic <b>${state.audioEnabled ? 'On' : 'Off'}</b>`;
});

document.getElementById('videoBtn')?.addEventListener('click', () => {
  if (!state.localStream) return;
  state.videoEnabled = !state.videoEnabled;
  state.localStream.getVideoTracks().forEach((t) => (t.enabled = state.videoEnabled));
  document.getElementById('videoBtn').innerHTML =
    `Cam <b>${state.videoEnabled ? 'On' : 'Off'}</b>`;
  setTileCamState('local', state.videoEnabled);
});

document.getElementById('chatToggle')?.addEventListener('click', () => {
  document.querySelector('.main-container').classList.toggle('chat-open');
  state.unreadCount = 0;
  updateUnreadCount();
});

document.getElementById('chatClose')?.addEventListener('click', () => {
  document.querySelector('.main-container').classList.remove('chat-open');
  state.unreadCount = 0;
  updateUnreadCount();
});

document.getElementById('debugBtn')?.addEventListener('click', () => {
  if (!state.debugEnabled) return;
  setDebugPanelVisibility(!state.metricsPanelOpen);
  if (state.metricsPanelOpen) {
    refreshDebugMetrics().catch(console.error);
  }
});

document.getElementById('leaveBtn')?.addEventListener('click', () => {
  state.localStream?.getTracks().forEach((t) => t.stop());
  stopDebugMetrics();
  state.websocket.close();
  window.location.href = './connect.html';
});

// Screen Share Handler
document.getElementById('presentBtn')?.addEventListener('click', async () => {
  if (state.screenStream) {
    stopPresenting();
    return;
  }

  if (state.activePresenterId && state.activePresenterId !== state.userId) {
    alert('someone is already presenting');
    return;
  }

  try {
    const response = await websocketSendJson({
      type: 'present_request',
      id: state.userId,
      name: state.userName,
    });

    if (!response.ok) {
      return;
    }

    state.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' },
      audio: false,
    });
    state.screenPeerId = 'screen-' + state.userId;
    state.presentationStreams.clear();

    // Add screen tile into the grid area
    const area = document.getElementById('gridArea');
    const wrapper = document.createElement('div');
    wrapper.id = `wrapper-${state.screenPeerId}`;
    wrapper.className = 'video-wrapper';
    wrapper.dataset.localScreen = 'true';
    const vid = document.createElement('video');
    vid.srcObject = state.screenStream;
    vid.autoplay = true;
    vid.playsInline = true;
    vid.muted = true;
    const lbl = document.createElement('span');
    lbl.className = 'video-label';
    lbl.textContent = `${state.userName} (screen)`;
    wrapper.appendChild(vid);
    wrapper.appendChild(lbl);
    area.insertBefore(wrapper, area.firstChild); // screen first so layout puts it left/top
    syncTileAspectFromVideo(wrapper, vid);
    vid.play().catch(console.error);
    observeTileViewport(wrapper);

    for (const [peerId, peer] of state.peerConnections) {
      attachPresentationTrack(peerId, peer);
      renegotiatePeerConnection(peerId);
    }

    document.getElementById('presentBtn').innerHTML = 'Stop';
    document.getElementById('presentBtn').classList.add('presenting-active');

    layoutTiles();

    state.screenStream.getVideoTracks()[0].addEventListener('ended', stopPresenting);
  } catch (err) {
    if (err.name !== 'NotAllowedError') console.error('getDisplayMedia:', err);
    state.screenStream = null;
    state.screenPeerId = null;
  }
});
