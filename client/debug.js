import { state } from './state.js';
import { formatNumber } from './utils.js';

export function setDebugPanelVisibility(visible) {
  const panel = document.getElementById('debugPanel');
  if (!panel) return;

  panel.hidden = !visible;
  state.metricsPanelOpen = visible;
  sessionStorage.setItem('meetingMetricsOpen', String(visible));
  const button = document.getElementById('debugBtn');
  if (button) {
    button.innerHTML = visible ? 'Metrics <b>On</b>' : 'Metrics <b>Off</b>';
  }
}

export function setDebugButtonVisibility(visible) {
  const button = document.getElementById('debugBtn');
  if (!button) return;
  button.classList.toggle('debug-toggle-hidden', !visible);
}

export function renderDebugSummary(rows) {
  const summary = document.getElementById('debugSummary');
  if (!summary) return;

  if (!rows.length) {
    summary.innerHTML =
      '<div class="debug-peer">No live stats yet. Wait for peer connections.</div>';
    return;
  }

  const averages = rows.reduce(
    (accumulator, row) => {
      accumulator.bitrate += row.bitrate || 0;
      accumulator.fps += row.fps || 0;
      accumulator.rtt += row.rtt || 0;
      accumulator.packetLoss += row.packetLoss || 0;
      return accumulator;
    },
    { bitrate: 0, fps: 0, rtt: 0, packetLoss: 0 }
  );

  const count = rows.length;
  summary.innerHTML = `
    <div class="debug-peer">
      <b>Average across ${count} peer${count !== 1 ? 's' : ''}</b>
      <div>Bitrate: ${formatNumber(averages.bitrate / count, 0)} kbps</div>
      <div>FPS: ${formatNumber(averages.fps / count, 1)}</div>
      <div>RTT: ${formatNumber(averages.rtt / count, 0)} ms</div>
      <div>Packet loss: ${formatNumber(averages.packetLoss / count, 1)}%</div>
    </div>
  `;
}

export async function collectPeerMetrics(peerId, peer) {
  const report = await peer.getStats();
  let outboundVideo = null;
  let remoteInboundVideo = null;
  let selectedPair = null;

  report.forEach((entry) => {
    if (
      entry.type === 'outbound-rtp' &&
      entry.kind === 'video' &&
      !entry.isRemote
    ) {
      outboundVideo = entry;
    }

    if (entry.type === 'remote-inbound-rtp' && entry.kind === 'video') {
      remoteInboundVideo = entry;
    }

    if (entry.type === 'transport' && entry.selectedCandidatePairId) {
      selectedPair = report.get(entry.selectedCandidatePairId) || selectedPair;
    }

    if (
      entry.type === 'candidate-pair' &&
      entry.state === 'succeeded' &&
      entry.nominated &&
      !selectedPair
    ) {
      selectedPair = entry;
    }
  });

  const previous = state.peerMetricSnapshots.get(peerId) || {};
  let bitrate = 0;
  let fps = 0;

  if (outboundVideo) {
    const timeDelta = previous.timestamp
      ? (outboundVideo.timestamp - previous.timestamp) / 1000
      : 0;
    const bytesDelta =
      previous.bytesSent != null
        ? outboundVideo.bytesSent - previous.bytesSent
        : 0;
    bitrate = timeDelta > 0 ? (bytesDelta * 8) / timeDelta / 1000 : 0;

    fps = outboundVideo.framesPerSecond || 0;
    if (!fps && previous.framesEncoded != null && timeDelta > 0) {
      fps = (outboundVideo.framesEncoded - previous.framesEncoded) / timeDelta;
    }

    state.peerMetricSnapshots.set(peerId, {
      bytesSent: outboundVideo.bytesSent,
      timestamp: outboundVideo.timestamp,
      framesEncoded: outboundVideo.framesEncoded,
    });
  }

  const rttSeconds =
    selectedPair?.currentRoundTripTime ||
    remoteInboundVideo?.roundTripTime ||
    0;
  const packetLoss = remoteInboundVideo
    ? (() => {
        const lost = remoteInboundVideo.packetsLost || 0;
        const received = remoteInboundVideo.packetsReceived || 0;
        const total = lost + received;
        if (total > 0) return (lost / total) * 100;
        if (typeof remoteInboundVideo.fractionLost === 'number') {
          return remoteInboundVideo.fractionLost * 100;
        }
        return 0;
      })()
    : 0;

  return {
    label: state.peerNames.get(peerId) || peerId.slice(0, 6),
    bitrate,
    fps,
    rtt: rttSeconds * 1000,
    packetLoss,
  };
}

export async function refreshDebugMetrics() {
  if (!state.debugEnabled) return;

  const rows = [];
  for (const [peerId, peer] of state.peerConnections) {
    if (!peer || peer.connectionState === 'closed') continue;
    try {
      rows.push(await collectPeerMetrics(peerId, peer));
    } catch (error) {
      console.error('debug metrics error:', error);
    }
  }

  renderDebugSummary(rows);
}

export function startDebugMetrics() {
  if (!state.debugEnabled || state.metricsTimer) return;
  state.metricsTimer = setInterval(() => {
    refreshDebugMetrics().catch(console.error);
  }, 1000);
  refreshDebugMetrics().catch(console.error);
}

export function stopDebugMetrics() {
  if (!state.metricsTimer) return;
  clearInterval(state.metricsTimer);
  state.metricsTimer = null;
}
