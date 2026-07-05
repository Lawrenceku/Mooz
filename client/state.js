const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const defaultSignalingUrl = isLocalHost
  ? 'ws://localhost:8080/ws'
  : 'wss://mooz-obhv.onrender.com/ws';

export const state = {
  isLocalHost,
  defaultSignalingUrl,
  ws: localStorage.getItem('signalingUrl') || defaultSignalingUrl,
  websocket: null,
  role: localStorage.getItem('role'),
  userId: localStorage.getItem('user'),
  userName: localStorage.getItem('name') || 'Anonymous',
  roomId: '',
  debugEnabled: sessionStorage.getItem('meetingDebugEnabled') === 'true',
  metricsPanelOpen: sessionStorage.getItem('meetingMetricsOpen') === 'true',

  peerConnections: new Map(),
  remoteStreams: new Map(),
  presentationStreams: new Map(),
  presentationSenders: new Map(),
  peerPrimaryStreamIds: new Map(),
  peerNames: new Map(),
  peerMetricSnapshots: new Map(),
  peerDisconnectTimers: new Map(),

  localStream: null,
  audioEnabled: true,
  videoEnabled: true,
  screenStream: null,
  screenPeerId: null,
  activePresenterId: null,
  activePresenterName: '',

  unreadCount: 0,
  metricsTimer: null,
  roomMemberCount: 1,

  tileViewportObserver: null,
  tileViewportState: new WeakMap(),

  MIN_GRID_TILE_WIDTH: 220,
  MIN_GRID_TILE_HEIGHT: 124,
  MIN_STRIP_TILE_WIDTH: 180,
  MIN_STRIP_TILE_HEIGHT: 100,
};

const roomFromQuery = new URLSearchParams(window.location.search).get('room');
state.roomId = (roomFromQuery || localStorage.getItem('roomId') || '')
  .trim()
  .toLowerCase();

if (!state.roomId) {
  window.location.href = './connect.html';
  throw new Error('Missing room id');
}

localStorage.setItem('roomId', state.roomId);

state.websocket = new WebSocket(state.ws);
