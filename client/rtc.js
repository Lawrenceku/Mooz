import { state } from './state.js';
import {
  setTileCamState,
  addVideoElement,
  removeVideoElement,
  addPresentationElement,
  updateParticipantCount,
} from './ui.js';

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }, //google's free stun server
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject', //metered's free turn server
      credential: 'openrelayproject', //try using your own credentials, if this fails
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject', //try using your own credentials, if this fails
    },
  ],
};

export function getActiveOutboundStream() {
  return state.localStream;
}

export function attachPresentationTrack(peerId, peer) {
  if (!state.screenStream || state.screenPeerId !== `screen-${state.userId}`)
    return;

  const screenTrack = state.screenStream.getVideoTracks()[0];
  if (!screenTrack) return;

  if (state.presentationSenders.has(peerId)) return;

  const sender = peer.addTrack(screenTrack, state.screenStream);
  state.presentationSenders.set(peerId, sender);
}

export async function renegotiatePeerConnection(peerId) {
  const peer = state.peerConnections.get(peerId);
  if (!peer || peer.connectionState === 'closed') return;

  try {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    state.websocket.send(
      JSON.stringify({
        type: 'offer',
        offer: peer.localDescription,
        to: peerId,
      })
    );
  } catch (err) {
    console.error('renegotiate error:', err);
  }
}

export function removePresentationTrack(peerId) {
  const sender = state.presentationSenders.get(peerId);
  if (!sender) return;

  sender.replaceTrack(null).catch(() => {});
  state.presentationSenders.delete(peerId);
}

export async function updateVideoBitrate() {
  let participantCount = Math.max(1, state.roomMemberCount);

  let bitrate;

  if (participantCount <= 2) {
    bitrate = 2_000_000;
  } else if (participantCount <= 6) {
    bitrate = 1_000_000;
  } else {
    bitrate = 500_000;
  }

  for (const peer of state.peerConnections.values()) {
    const sender = peer.getSenders().find((s) => s.track?.kind === 'video');

    if (!sender) continue;

    const params = sender.getParameters();

    if (!params.encodings) {
      params.encodings = [{}];
    }

    params.encodings[0].maxBitrate = bitrate;

    await sender.setParameters(params).catch(console.error);
  }
}

export function createPeerConnection(peerId, initiator) {
  if (state.peerConnections.has(peerId))
    return state.peerConnections.get(peerId);

  const peer = new RTCPeerConnection(ICE_CONFIG);
  state.peerConnections.set(peerId, peer);

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      state.websocket.send(
        JSON.stringify({ type: 'ice', candidate: event.candidate, to: peerId })
      );
    }
  };

  peer.ontrack = (event) => {
    const incomingStream = event.streams[0];
    if (!incomingStream) return;

    const primaryStreamId = state.peerPrimaryStreamIds.get(peerId);
    if (!primaryStreamId) {
      state.peerPrimaryStreamIds.set(peerId, incomingStream.id);
    }

    const isPresentationTrack =
      state.activePresenterId === peerId &&
      event.track.kind === 'video' &&
      incomingStream.id !== state.peerPrimaryStreamIds.get(peerId);

    if (isPresentationTrack) {
      let stream = state.presentationStreams.get(peerId);
      if (!stream) {
        stream = new MediaStream();
        state.presentationStreams.set(peerId, stream);
        const label = state.peerNames.get(peerId) || peerId.slice(0, 6);
        addPresentationElement(peerId, stream, label);
      }

      incomingStream.getTracks().forEach((track) => {
        if (!stream.getTracks().find((t) => t.id === track.id)) {
          stream.addTrack(track);
        }
      });
      return;
    }

    if (event.track.kind === 'video') {
      setTileCamState(peerId, true);
      event.track.onmute = () => setTileCamState(peerId, false);
      event.track.onunmute = () => setTileCamState(peerId, true);
      event.track.onended = () => setTileCamState(peerId, false);
    }

    let stream = state.remoteStreams.get(peerId);
    if (!stream) {
      stream = new MediaStream();
      state.remoteStreams.set(peerId, stream);
      const label = state.peerNames.get(peerId) || peerId.slice(0, 6);
      addVideoElement(peerId, stream, label);
    }
    incomingStream.getTracks().forEach((track) => {
      if (!stream.getTracks().find((t) => t.id === track.id)) {
        stream.addTrack(track);
      }
    });
    if (event.track.kind === 'video') setTileCamState(peerId, true);
  };

  peer.onconnectionstatechange = () => {
    const connState = peer.connectionState;

    if (
      state.peerDisconnectTimers.has(peerId) &&
      connState !== 'disconnected'
    ) {
      clearTimeout(state.peerDisconnectTimers.get(peerId));
      state.peerDisconnectTimers.delete(peerId);
    }

    if (connState === 'disconnected') {
      if (state.peerDisconnectTimers.has(peerId)) return;

      const disconnectTimer = setTimeout(() => {
        if (peer.connectionState !== 'disconnected') return;

        peer.close();
        state.peerConnections.delete(peerId);
        state.remoteStreams.delete(peerId);
        state.peerNames.delete(peerId);
        removeVideoElement(peerId);
        state.peerDisconnectTimers.delete(peerId);
        updateParticipantCount();
      }, 8000);

      state.peerDisconnectTimers.set(peerId, disconnectTimer);
      return;
    }

    if (['failed', 'closed'].includes(connState)) {
      if (state.peerDisconnectTimers.has(peerId)) {
        clearTimeout(state.peerDisconnectTimers.get(peerId));
        state.peerDisconnectTimers.delete(peerId);
      }

      peer.close();
      state.peerConnections.delete(peerId);
      state.remoteStreams.delete(peerId);
      state.peerNames.delete(peerId);
      removeVideoElement(peerId);
      updateParticipantCount();
    }
  };

  const outboundStream = getActiveOutboundStream();
  if (outboundStream) {
    outboundStream.getTracks().forEach((track) => {
      const sender = peer.addTrack(track, outboundStream);

      if (track.kind === 'video') {
        const params = sender.getParameters();

        if (!params.encodings) {
          params.encodings = [{}];
        }

        params.encodings[0].maxBitrate = 2_000_000;

        sender.setParameters(params).catch(console.error);
      }
    });
  }

  if (state.screenStream && state.screenPeerId === `screen-${state.userId}`) {
    attachPresentationTrack(peerId, peer);
  }

  if (initiator) {
    peer
      .createOffer()
      .then((offer) => peer.setLocalDescription(offer))
      .then(() =>
        state.websocket.send(
          JSON.stringify({
            type: 'offer',
            offer: peer.localDescription,
            to: peerId,
          })
        )
      )
      .catch(console.error);
  }

  updateVideoBitrate().catch(console.error);

  return peer;
}
