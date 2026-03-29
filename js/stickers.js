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
  'images/stickers/rose.png',
  'images/stickers/mask.png',
  'images/stickers/bell.png',
  'images/stickers/sp_ship1.png',
  'images/stickers/enemy_slime.png',
  'images/stickers/enemy_bat.png',
  'images/stickers/enemy_maggot.png',
  'images/stickers/enemy_skeleton.png',
  'images/stickers/eel_egg_landed.png',
  'images/stickers/littlefish.png',
  'images/stickers/urchin2.png',
];

const STICKER_MARGIN      = 24;   // px — minimum distance from section edges
const STICKER_FILL_RATIO  = 0.30; // fraction of total div area all stickers combined cover
const OUTLINE_PX          = 3;    // white outline thickness in canvas pixels

// ── Poisson-disc placement ────────────────────────────────────────────────────

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
      if (!tooClose) { positions.push({ x, y }); placed = true; break; }
    }
    if (!placed) {
      positions.push({
        x: margin + Math.random() * (width  - size - margin * 2),
        y: margin + Math.random() * (height - size - margin * 2),
      });
    }
  }
  return positions;
}

// ── Outline baking ────────────────────────────────────────────────────────────
// Draws a pixel-perfect white outline around a sprite by sampling the alpha
// channel and flood-expanding it by OUTLINE_PX pixels, then compositing the
// original sprite on top.  Returns a data URL.
// The outline is rendered at 2× the display size then scaled down so it
// uses smooth sub-pixel edges at display resolution — no CSS blur needed.

function bakeOutline(srcImg, dispW, dispH) {
  const pad    = OUTLINE_PX * 2; // canvas padding around sprite
  const scale  = 2;              // oversample factor for smooth outline edges
  const cw     = (dispW + pad * 2) * scale;
  const ch     = (dispH + pad * 2) * scale;
  const sw     = dispW * scale;
  const sh     = dispH * scale;
  const sp     = pad  * scale;

  const canvas  = document.createElement('canvas');
  canvas.width  = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');

  // Draw sprite at 2× into the centre of the padded canvas
  ctx.imageSmoothingEnabled = false; // keep pixel art crisp
  ctx.drawImage(srcImg, sp, sp, sw, sh);

  // Read alpha channel, expand it outward by OUTLINE_PX*scale pixels
  const src  = ctx.getImageData(0, 0, cw, ch);
  const dst  = ctx.createImageData(cw, ch);
  const r    = OUTLINE_PX * scale;

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      // Check if any pixel within radius r has non-zero alpha
      let hit = false;
      outer: for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          if (src.data[(ny * cw + nx) * 4 + 3] > 0) { hit = true; break outer; }
        }
      }
      if (hit) {
        const i = (y * cw + x) * 4;
        dst.data[i]     = 255; // R
        dst.data[i + 1] = 255; // G
        dst.data[i + 2] = 255; // B
        dst.data[i + 3] = 255; // A — solid white
      }
    }
  }

  // Write outline, then composite original sprite on top
  ctx.putImageData(dst, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(srcImg, sp, sp, sw, sh);

  // Return a half-size canvas (down from 2×) — smooth anti-aliased outline
  const out    = document.createElement('canvas');
  out.width    = cw / scale;
  out.height   = ch / scale;
  const octx   = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(canvas, 0, 0, cw / scale, ch / scale);

  return { dataUrl: out.toDataURL(), fullW: cw / scale, fullH: ch / scale, padPx: pad };
}

// ── Sticker state ─────────────────────────────────────────────────────────────

const stickers = [];

let dragTarget  = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// ── Init ──────────────────────────────────────────────────────────────────────

async function initStickers() {
  if (!STICKER_FILES.length) return;

  const layer   = document.getElementById('sticker-layer');
  const section = document.getElementById('work');
  if (!layer || !section) return;

  const W = section.offsetWidth;
  const H = section.offsetHeight;

  const totalArea      = W * H;
  const perStickerArea = (totalArea * STICKER_FILL_RATIO) / STICKER_FILES.length;
  const targetSize     = Math.sqrt(perStickerArea);

  // Load source images
  const loaded = await Promise.all(STICKER_FILES.map(file => new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve({ file, img, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ file, img, w: 1, h: 1 });
    img.src = file;
  })));

  // Compute display dimensions (longest side = targetSize)
  const dims = loaded.map(({ file, img, w, h }) => {
    const scale = targetSize / Math.max(w, h);
    return { file, img, pw: Math.round(w * scale), ph: Math.round(h * scale) };
  });

  // Bake outlines — done once at init, not per-frame
  const baked = dims.map(({ file, img, pw, ph }) => ({
    file,
    ...bakeOutline(img, pw, ph),
    pw, ph,
  }));

  const avgSize = dims.reduce((s, d) => s + Math.max(d.pw, d.ph), 0) / dims.length;
  const minDist = avgSize * 1.4;
  const positions = poissonDisc(baked.length, W, H, minDist, avgSize, STICKER_MARGIN);

  baked.forEach(({ dataUrl, fullW, fullH, padPx }, i) => {
    const rot = (Math.random() * 40 - 20);

    // Position offset: the baked image has padding around it for the outline,
    // so shift left/up by padPx so the sprite itself lands at positions[i]
    const cx = positions[i].x - padPx;
    const cy = positions[i].y - padPx;

    const wrap = document.createElement('div');
    wrap.className = 'sticker';
    wrap.style.setProperty('--sticker-rot', `${rot}deg`);
    wrap.style.width     = `${fullW}px`;
    wrap.style.height    = `${fullH}px`;
    wrap.style.left      = '0';
    wrap.style.top       = '0';
    wrap.style.transform = `translate(${cx}px, ${cy}px) rotate(${rot}deg)`;

    const img = document.createElement('img');
    img.src    = dataUrl;
    img.alt    = '';
    img.width  = fullW;
    img.height = fullH;
    img.setAttribute('draggable', 'false');
    wrap.appendChild(img);

    layer.appendChild(wrap);

    const state = { el: wrap, cx, cy, rot };
    stickers.push(state);

    wrap.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      wrap.setPointerCapture(e.pointerId);
      dragTarget = state;
      wrap.classList.add('dragging');
      wrap.style.willChange = 'transform';

      const sRect = section.getBoundingClientRect();
      dragOffsetX = (e.clientX - sRect.left) - state.cx;
      dragOffsetY = (e.clientY - sRect.top)  - state.cy;
    });
  });

  window.addEventListener('pointermove', (e) => {
    if (!dragTarget) return;
    const sRect = section.getBoundingClientRect();
    dragTarget.cx = (e.clientX - sRect.left) - dragOffsetX;
    dragTarget.cy = (e.clientY - sRect.top)  - dragOffsetY;
    dragTarget.el.style.transform = `translate(${dragTarget.cx}px, ${dragTarget.cy}px) rotate(${dragTarget.rot}deg)`;
  });

  window.addEventListener('pointerup', () => {
    if (!dragTarget) return;
    dragTarget.el.classList.remove('dragging');
    dragTarget.el.style.willChange = 'auto';
    dragTarget = null;
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────

function waitForHeight() {
  const section = document.getElementById('work');
  if (section && section.offsetHeight > 200) { initStickers(); return; }
  waitForHeight._tries = (waitForHeight._tries || 0) + 1;
  if (waitForHeight._tries < 50) setTimeout(waitForHeight, 100);
}

window.addEventListener('load', () => setTimeout(waitForHeight, 100));
