const AVATAR_COLORS = [
  '#e74c6f',
  '#e7a23c',
  '#3ca9e7',
  '#8c3ce7',
  '#3ce76f',
  '#e7563c',
  '#3ce7d4',
];

export function avatarColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(digits);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function fitWithinBox(boxW, boxH, aspectRatio) {
  if (!aspectRatio || !isFinite(aspectRatio) || aspectRatio <= 0) {
    return { width: boxW, height: boxH, offsetX: 0, offsetY: 0 };
  }

  let width = boxW;
  let height = width / aspectRatio;

  if (height > boxH) {
    height = boxH;
    width = height * aspectRatio;
  }

  return {
    width,
    height,
    offsetX: (boxW - width) / 2,
    offsetY: (boxH - height) / 2,
  };
}

export function getTileAspectRatio(tile) {
  const video = tile?.querySelector('video');
  const aspectRatio = Number(tile?.dataset.aspectRatio);
  if (aspectRatio > 0) return aspectRatio;
  if (video?.videoWidth && video?.videoHeight) {
    return video.videoWidth / video.videoHeight;
  }
  return 16 / 9;
}

// Find best cols/rows to fill W×H with `count` tiles at 16:9
export function bestFit(count, W, H, gap) {
  let bestCols = 1,
    bestRows = count,
    bestArea = 0;

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

export function bestGrid(count, W, H) {
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
      const usedArea =
        totalW <= W ? scaledW * scaledH * count : tileW * tileH * count;
      if (usedArea > best.cols * best.tileW * best.tileH * best.rows) {
        best = { cols, rows, tileW, tileH };
      }
    }
  }
  return best;
}
