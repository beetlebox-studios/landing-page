// ── Sticker layer — draggable stickers on the games "table" ──────────────────
//
// To add stickers: put PNG filenames in STICKER_FILES below.
// Stickers are spawned with maximum spacing using Poisson-disc sampling
// (the "disk method") so they start well spread out.
//
// Layer order (bottom → top):
//   .work-table-bg       (wood texture, grayscale)
//   .work-sticker-layer  ← stickers live here
//   .work-table-overlay  (semi-black darkening div)
//   .section-inner       (games grid — the "glass pane")

// ── Config ────────────────────────────────────────────────────────────────────

const STICKER_FILES = [
  // Add PNG filenames here, e.g.:
  // 'sticker_beetle.png',
  // 'sticker_star.png',
  'rose.png',
  'mask.png',
  'bell.png',
  'sp_ship1.png',
  'enemy_slime.png',
  'enemy_bat.png',
  'enemy_maggot.png',
  'enemy_skeleton.png',
  'eel_egg_landed.png',
  'littlefish.png',
  'urchin2.png',
];

// STICKER_SIZE is computed at runtime as 1/3 of the container height
const STICKER_LERP   = 0.18; // drag follow smoothness (0 = instant, lower = laggier)
const STICKER_MARGIN = 24;   // px — minimum distance from section edges

// ── Poisson-disc placement ────────────────────────────────────────────────────
// Returns an array of {x, y} positions (top-left of each sticker),
// maximally spread using a simplified Poisson-disc approach.

function poissonDisc(count, width, height, minDist, size, margin) {
  const positions = [];
  const maxTries  = 60;

  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let t = 0; t < maxTries; t++) {
      const x = margin + Math.random() * (width  - size - margin * 2);
      const y = margin + Math.random() * (height - size - margin * 2);
      const tooClose = positions.some(p => {
        const dx = p.x - x, dy = p.y - y;
        return Math.sqrt(dx * dx + dy * dy) < minDist;
      });
      if (!tooClose) {
        positions.push({ x, y });
        placed = true;
        break;
      }
    }
    // If we couldn't place after maxTries, place anywhere valid (fallback)
    if (!placed) {
      positions.push({
        x: margin + Math.random() * (width  - size - margin * 2),
        y: margin + Math.random() * (height - size - margin * 2),
      });
    }
  }
  return positions;
}

// ── Sticker state ─────────────────────────────────────────────────────────────

const stickers = [];  // [{ el, cx, cy, tx, ty, rot, dragging }]

let dragTarget   = null;
let dragOffsetX  = 0;
let dragOffsetY  = 0;
let mouseX       = 0;
let mouseY       = 0;
let rafRunning   = false;

// ── Init ──────────────────────────────────────────────────────────────────────

async function initStickers() {
  if (!STICKER_FILES.length) return;

  const layer   = document.getElementById('sticker-layer');
  const section = document.getElementById('work');
  if (!layer || !section) return;

  const W = section.offsetWidth;
  const H = section.offsetHeight;

  // Each sticker's area = (total area * STICKER_FILL_RATIO) / count
  // targetSize is the longest side derived from that area (assuming ~square)
  const STICKER_FILL_RATIO = 0.15; // fraction of total div area all stickers combined should cover
  const totalArea    = W * H;
  const perStickerArea = (totalArea * STICKER_FILL_RATIO) / STICKER_FILES.length;
  const targetSize   = Math.sqrt(perStickerArea);

  // Load all images first so we know each one's natural aspect ratio
  const loaded = await Promise.all(STICKER_FILES.map(file => new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve({ file, w: img.naturalWidth,  h: img.naturalHeight });
    img.onerror = () => resolve({ file, w: 1, h: 1 }); // fallback square
    img.src = file;
  })));

  // Compute pixel dimensions for each sticker (longest side = targetSize)
  const dims = loaded.map(({ file, w, h }) => {
    const scale = targetSize / Math.max(w, h);
    return { file, pw: Math.round(w * scale), ph: Math.round(h * scale) };
  });

  // Use the average sticker size for Poisson spacing
  const avgSize = dims.reduce((s, d) => s + Math.max(d.pw, d.ph), 0) / dims.length;
  const minDist = avgSize * 1.4;

  const positions = poissonDisc(dims.length, W, H, minDist, avgSize, STICKER_MARGIN);

  dims.forEach(({ file, pw, ph }, i) => {
    const rot = (Math.random() * 40 - 20); // random -20° to +20° tilt

    const wrap = document.createElement('div');
    wrap.className = 'sticker';
    wrap.style.setProperty('--sticker-rot', `${rot}deg`);
    wrap.style.width  = `${pw}px`;
    wrap.style.height = `${ph}px`;
    wrap.style.left   = '0';
    wrap.style.top    = '0';
    wrap.style.transform = `translate(${positions[i].x}px, ${positions[i].y}px) rotate(${rot}deg)`;

    const img = document.createElement('img');
    img.src    = file;
    img.alt    = '';
    img.width  = pw;
    img.height = ph;
    img.setAttribute('draggable', 'false');
    wrap.appendChild(img);

    layer.appendChild(wrap);

    const state = {
      el:      wrap,
      cx:      positions[i].x,
      cy:      positions[i].y,
      tx:      positions[i].x,
      ty:      positions[i].y,
      rot,
      dragging: false,
    };
    stickers.push(state);

    // ── Drag start
    wrap.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      wrap.setPointerCapture(e.pointerId);

      dragTarget     = state;
      state.dragging = true;
      wrap.classList.add('dragging');

      const sRect = section.getBoundingClientRect();
      dragOffsetX = (e.clientX - sRect.left) - state.cx;
      dragOffsetY = (e.clientY - sRect.top)  - state.cy;

      startRaf();
    });
  });

  // ── Global pointer move
  window.addEventListener('pointermove', (e) => {
    if (!dragTarget) return;
    const sRect = section.getBoundingClientRect();
    dragTarget.tx = (e.clientX - sRect.left) - dragOffsetX;
    dragTarget.ty = (e.clientY - sRect.top)  - dragOffsetY;
  });

  // ── Drag end
  window.addEventListener('pointerup', () => {
    if (!dragTarget) return;
    dragTarget.dragging = false;
    dragTarget.el.classList.remove('dragging');
    dragTarget = null;
  });
}

// ── Animation loop (lerp) ─────────────────────────────────────────────────────

function startRaf() {
  if (rafRunning) return;
  rafRunning = true;
  requestAnimationFrame(tick);
}

function tick() {
  let anyActive = false;

  stickers.forEach(s => {
    if (!s.dragging) return;
    anyActive = true;

    const dx = s.tx - s.cx;
    const dy = s.ty - s.cy;

    // Only lerp when there's meaningful distance; snap when close
    if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) {
      s.cx = s.tx;
      s.cy = s.ty;
    } else {
      s.cx += dx * STICKER_LERP;
      s.cy += dy * STICKER_LERP;
      anyActive = true;
    }

    s.el.style.transform = `translate(${s.cx}px, ${s.cy}px) rotate(${s.rot}deg)`;
  });

  if (anyActive) {
    requestAnimationFrame(tick);
  } else {
    rafRunning = false;
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
// cards.js does an async fetch, so #work may not have its full height yet at
// DOMContentLoaded or even window load.  Wait until the section is tall enough
// before placing stickers (checks every 100 ms, gives up after 5 s).

function waitForHeight() {
  const section = document.getElementById('work');
  if (section && section.offsetHeight > 200) {
    initStickers();
    return;
  }
  // Check if we've already been waiting too long
  waitForHeight._tries = (waitForHeight._tries || 0) + 1;
  if (waitForHeight._tries < 50) {
    setTimeout(waitForHeight, 100);
  }
}

window.addEventListener('load', () => setTimeout(waitForHeight, 100));
