import { state } from './state.js';
import {
  avatarColor,
  fitWithinBox,
  getTileAspectRatio,
  bestFit,
} from './utils.js';

export function updateRoomBadge() {
  const badge = document.getElementById('roomBadge');
  if (badge) {
    badge.textContent = `Room ${state.roomId || 'lobby'}`;
  }
}

export function layoutTiles() {
  const area = document.getElementById('gridArea');
  const gap = 6;
  const pad = gap;
  const W = area.clientWidth - pad * 2;
  const H = area.clientHeight - pad * 2;
  const presenterTileId = getPresentationTileId();

  setPresentationTileState(presenterTileId);

  if (presenterTileId) {
    layoutPresenting(W, H, pad, gap, presenterTileId);
  } else {
    layoutGrid(W, H, pad, gap);
  }
}

export function getPresentationTileId() {
  if (state.screenStream && state.screenPeerId) return state.screenPeerId;
  if (
    state.activePresenterId &&
    state.presentationStreams.has(state.activePresenterId)
  ) {
    return `presentation-${state.activePresenterId}`;
  }
  return null;
}

export function applyTileBox(tile, x, y, boxW, boxH) {
  const { width, height, offsetX, offsetY } = fitWithinBox(
    boxW,
    boxH,
    getTileAspectRatio(tile)
  );

  tile.style.left = x + offsetX + 'px';
  tile.style.top = y + offsetY + 'px';
  tile.style.width = width + 'px';
  tile.style.height = height + 'px';
  tile.style.display = 'block';
}

export function getTilePeerId(tile) {
  if (!tile || !tile.id) return '';
  if (tile.id === 'overflowTile') return 'overflow';
  return tile.id.replace(/^wrapper-/, '');
}

export function setPresentationTileState(presenterTileId) {
  document
    .querySelectorAll('.video-wrapper.presentation')
    .forEach((tile) => tile.classList.remove('presentation'));

  if (!presenterTileId) return;

  const tile =
    document.getElementById(presenterTileId) ||
    document.getElementById(`wrapper-${presenterTileId}`);
  if (tile) tile.classList.add('presentation');
}

export function isActivePresenterTile(tile) {
  const presenterTileId = getPresentationTileId();
  if (!presenterTileId) return false;
  const peerId = getTilePeerId(tile);
  return peerId === presenterTileId;
}

export function getOverflowTile() {
  const area = document.getElementById('gridArea');
  let tile = document.getElementById('overflowTile');

  if (!tile) {
    tile = document.createElement('div');
    tile.id = 'overflowTile';
    tile.className = 'video-wrapper overflow-tile';
    tile.setAttribute('data-overflow', 'true');

    const title = document.createElement('div');
    title.className = 'overflow-title';
    title.textContent = '+0 more';

    const subtitle = document.createElement('div');
    subtitle.className = 'overflow-subtitle';
    subtitle.textContent = 'Other participants are hidden';

    tile.appendChild(title);
    tile.appendChild(subtitle);
    area.appendChild(tile);
  }

  return tile;
}

export function hideOverflowTile() {
  const tile = document.getElementById('overflowTile');
  if (tile) tile.style.display = 'none';
}

export function showOverflowTile(hiddenCount, totalCount) {
  const tile = getOverflowTile();
  const title = tile.querySelector('.overflow-title');
  const subtitle = tile.querySelector('.overflow-subtitle');

  title.textContent = `+${hiddenCount} more`;
  subtitle.textContent = `${totalCount} total participants`;
  tile.style.display = 'flex';
}

export function measureGrid(count, W, H, gap) {
  const { cols, rows } = bestFit(count, W, H, gap);
  return {
    cols,
    rows,
    tileW: (W - (cols - 1) * gap) / cols,
    tileH: (H - (rows - 1) * gap) / rows,
  };
}

export function getMaxGridTiles(W, H, gap, totalCount) {
  let capacity = 1;

  for (let visibleCount = 1; visibleCount <= totalCount; visibleCount++) {
    const { tileW, tileH } = measureGrid(visibleCount, W, H, gap);
    if (
      tileW >= state.MIN_GRID_TILE_WIDTH &&
      tileH >= state.MIN_GRID_TILE_HEIGHT
    ) {
      capacity = visibleCount;
    }
  }

  return totalCount > 1 ? Math.max(2, capacity) : 1;
}

export function layoutGrid(W, H, pad, gap) {
  const tiles = getOrderedTiles();
  const count = tiles.length;
  if (!count) return;

  hideOverflowTile();

  const capacity = getMaxGridTiles(W, H, gap, count);
  const needsOverflow = count > capacity;
  const visibleTiles = tiles.slice(0, needsOverflow ? capacity - 1 : capacity);
  const tilesToLayout = needsOverflow
    ? [...visibleTiles, getOverflowTile()]
    : visibleTiles;
  const renderCount = tilesToLayout.length;

  if (needsOverflow) {
    showOverflowTile(count - visibleTiles.length, count);
  }

  const { cols, rows } = bestFit(renderCount, W, H, gap);
  const tileW = (W - (cols - 1) * gap) / cols;
  const tileH = (H - (rows - 1) * gap) / rows;

  tilesToLayout.forEach((tile, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Center the last incomplete row
    const rowCount = Math.ceil(renderCount / cols);
    const tilesInThisRow =
      row === rowCount - 1 ? renderCount - row * cols : cols;
    const rowOffsetX = ((cols - tilesInThisRow) * (tileW + gap)) / 2;

    const x = pad + col * (tileW + gap) + rowOffsetX;
    const y = pad + row * (tileH + gap);
    applyTileBox(tile, x, y, tileW, tileH);
  });

  tiles.slice(visibleTiles.length).forEach((tile) => {
    tile.style.display = 'none';
  });
}

export function layoutPresenting(W, H, pad, gap, presenterTileId) {
  const screenTile =
    document.getElementById(presenterTileId) ||
    document.getElementById(`wrapper-${presenterTileId}`);
  const participants = getOrderedTiles().filter(
    (t) => t.id !== presenterTileId && t.id !== `wrapper-${presenterTileId}`
  );
  const pCount = participants.length;

  if (!screenTile) return;

  if (pCount === 0) {
    // Full screen
    applyTileBox(screenTile, pad, pad, W, H);
    return;
  }

  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    // Top 65% screen share, bottom strip
    const stripH = Math.min(110, H * 0.3);
    const screenH = H - stripH - gap;
    const capacity = Math.max(
      2,
      Math.floor((W + gap) / (state.MIN_STRIP_TILE_WIDTH + gap))
    );
    const needsOverflow = pCount > capacity;
    const visibleParticipants = participants.slice(
      0,
      needsOverflow ? capacity - 1 : capacity
    );
    const stripTiles = needsOverflow
      ? [...visibleParticipants, getOverflowTile()]
      : visibleParticipants;

    applyTileBox(screenTile, pad, pad, W, screenH);

    if (needsOverflow) {
      showOverflowTile(pCount - visibleParticipants.length, pCount);
    } else {
      hideOverflowTile();
    }

    const thumbW = (W - (stripTiles.length - 1) * gap) / stripTiles.length;
    const thumbH = stripH;
    stripTiles.forEach((tile, i) => {
      const x = pad + i * (thumbW + gap);
      const y = pad + screenH + gap;
      applyTileBox(tile, x, y, thumbW, thumbH);
    });

    participants.slice(visibleParticipants.length).forEach((tile) => {
      tile.style.display = 'none';
    });
  } else {
    // Left half screen share, right strip
    const stripW = Math.min(200, W * 0.25);
    const screenW = W - stripW - gap;
    const capacity = Math.max(
      2,
      Math.floor((H + gap) / (state.MIN_STRIP_TILE_HEIGHT + gap))
    );
    const needsOverflow = pCount > capacity;
    const visibleParticipants = participants.slice(
      0,
      needsOverflow ? capacity - 1 : capacity
    );
    const stripTiles = needsOverflow
      ? [...visibleParticipants, getOverflowTile()]
      : visibleParticipants;

    applyTileBox(screenTile, pad, pad, screenW, H);

    if (needsOverflow) {
      showOverflowTile(pCount - visibleParticipants.length, pCount);
    } else {
      hideOverflowTile();
    }

    const thumbH = (H - (stripTiles.length - 1) * gap) / stripTiles.length;
    const thumbW = stripW;
    stripTiles.forEach((tile, i) => {
      const x = pad + screenW + gap;
      const y = pad + i * (thumbH + gap);
      applyTileBox(tile, x, y, thumbW, thumbH);
    });

    participants.slice(visibleParticipants.length).forEach((tile) => {
      tile.style.display = 'none';
    });
  }
}

export function getOrderedTiles() {
  const area = document.getElementById('gridArea');
  return Array.from(
    area.querySelectorAll('.video-wrapper:not([data-overflow="true"])')
  ).sort((a, b) => {
    const aActive = isActivePresenterTile(a);
    const bActive = isActivePresenterTile(b);

    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;

    const presenterTileId = getPresentationTileId();
    if (presenterTileId) {
      const aScreen =
        a.id === presenterTileId || a.id === `wrapper-${presenterTileId}`;
      const bScreen =
        b.id === presenterTileId || b.id === `wrapper-${presenterTileId}`;
      if (aScreen && !bScreen) return -1;
      if (!aScreen && bScreen) return 1;
    }

    if (a.id === 'wrapper-local') return -1;
    if (b.id === 'wrapper-local') return 1;

    return a.id.localeCompare(b.id);
  });
}

export function addPresentationElement(peerId, stream, label) {
  if (document.getElementById(`presentation-${peerId}`)) return;

  const area = document.getElementById('gridArea');
  const wrapper = document.createElement('div');
  wrapper.id = `presentation-${peerId}`;
  wrapper.className = 'video-wrapper presentation';

  const video = document.createElement('video');
  video.id = `presentation-video-${peerId}`;
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = false;
  video.controls = false;

  const labelTag = document.createElement('span');
  labelTag.className = 'video-label';
  labelTag.textContent = `${label || peerId.slice(0, 6)} (presentation)`;

  wrapper.appendChild(video);
  wrapper.appendChild(labelTag);
  area.appendChild(wrapper);

  syncTileAspectFromVideo(wrapper, video);
  video.play().catch(console.error);
  layoutTiles();
}

export function removePresentationElement(peerId) {
  const wrapper = document.getElementById(`presentation-${peerId}`);
  if (wrapper) wrapper.remove();
  state.presentationStreams.delete(peerId);
  state.peerPrimaryStreamIds.delete(peerId);
}

export function syncTileAspectFromVideo(wrapper, video) {
  if (!wrapper || !video) return;

  const update = () => {
    if (video.videoWidth && video.videoHeight) {
      wrapper.dataset.aspectRatio = String(
        video.videoWidth / video.videoHeight
      );
      layoutTiles();
    }
  };

  if (video.readyState >= 1) {
    update();
  } else {
    video.addEventListener('loadedmetadata', update, { once: true });
  }
}

export function getTileVideoElement(wrapper) {
  return wrapper ? wrapper.querySelector('video') : null;
}

export function ensureTileViewportObserver() {
  if (state.tileViewportObserver || !('IntersectionObserver' in window)) return;

  const gridArea = document.getElementById('gridArea');
  if (!gridArea) return;

  state.tileViewportObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const wrapper = entry.target;
        const video = getTileVideoElement(wrapper);
        if (!video) return;

        const ts = state.tileViewportState.get(wrapper) || {};

        if (entry.isIntersecting) {
          if (ts.detachedStream && !video.srcObject) {
            video.srcObject = ts.detachedStream;
            video.play().catch(console.error);
          }

          state.tileViewportState.set(wrapper, {
            detachedStream: null,
            visible: true,
          });
          return;
        }

        if (video.srcObject) {
          state.tileViewportState.set(wrapper, {
            detachedStream: video.srcObject,
            visible: false,
          });
          video.pause();
          video.srcObject = null;
        } else {
          state.tileViewportState.set(wrapper, {
            detachedStream: ts.detachedStream || null,
            visible: false,
          });
        }
      });
    },
    {
      root: gridArea,
      threshold: 0.15,
    }
  );
}

export function observeTileViewport(wrapper) {
  if (!wrapper || !('IntersectionObserver' in window)) return;

  ensureTileViewportObserver();
  if (state.tileViewportObserver) state.tileViewportObserver.observe(wrapper);
}

export function addVideoElement(peerId, stream, label) {
  if (document.getElementById(`wrapper-${peerId}`)) return;

  const area = document.getElementById('gridArea');
  const wrapper = document.createElement('div');
  wrapper.id = `wrapper-${peerId}`;
  wrapper.className = 'video-wrapper';
  wrapper.classList.add('cam-off');

  const video = document.createElement('video');
  video.id = `video-${peerId}`;
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = false;
  video.controls = false;

  const placeholder = document.createElement('div');
  placeholder.className = 'cam-off-placeholder';
  const avatar = document.createElement('div');
  avatar.className = 'cam-avatar';
  avatar.style.background = avatarColor(label || peerId);
  avatar.textContent = (label || '?')[0].toUpperCase();
  const nameSpan = document.createElement('span');
  nameSpan.textContent = label || peerId.slice(0, 6);
  placeholder.appendChild(avatar);
  placeholder.appendChild(nameSpan);

  const nameTag = document.createElement('span');
  nameTag.className = 'video-label';
  nameTag.textContent = label || peerId.slice(0, 6);

  wrapper.appendChild(video);
  wrapper.appendChild(placeholder);
  wrapper.appendChild(nameTag);
  area.appendChild(wrapper);

  syncTileAspectFromVideo(wrapper, video);
  observeTileViewport(wrapper);

  video.play().catch(console.error);
  layoutTiles();
  updateParticipantCount();
}

export function removeVideoElement(peerId) {
  const wrapper = document.getElementById(`wrapper-${peerId}`);
  if (wrapper) wrapper.remove();
  layoutTiles();
  updateParticipantCount();
}

export function updateParticipantCount() {
  const count = Math.max(1, state.roomMemberCount);
  document.getElementById('participantCount').textContent = `${count} Participant${
    count !== 1 ? 's' : ''
  }`;
}

export function updateRoomMemberCount(count) {
  if (Number.isFinite(count) && count > 0) {
    state.roomMemberCount = count;
  }
  updateParticipantCount();
}

export function setTileCamState(peerId, on) {
  const wrapper = document.getElementById(`wrapper-${peerId}`);
  if (wrapper) wrapper.classList.toggle('cam-off', !on);
}

export function updateUnreadCount() {
  const unreadCountElem = document.getElementById('unread-count');
  if (state.unreadCount > 0) {
    unreadCountElem.textContent = state.unreadCount;
    unreadCountElem.style.display = 'inline-block';
  } else {
    unreadCountElem.style.display = 'none';
  }
}
