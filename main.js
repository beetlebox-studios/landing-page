// ─── WebGL metaball hero — viz sandbox ────────────────────────────────────────

const canvas   = document.getElementById('metaball-canvas');
const hero     = document.getElementById('hero');
const heroLogo = document.getElementById('hero-logo');
const vizLabel = document.getElementById('viz-label');

function resizeCanvas() {
  canvas.width  = hero.clientWidth;
  canvas.height = hero.clientHeight;
}

const gl = canvas.getContext('webgl2');
if (!gl) { hero.style.background = '#080b11'; throw new Error('WebGL2 not supported'); }

// ── Shaders ───────────────────────────────────────────────────────────────────

const VS = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// MAX_BALLS must be a compile-time constant in GLSL
const MAX_BALLS = 32;

const FS_METABALL = `#version 300 es
precision highp float;
in  vec2 v_uv;
out vec4 fragColor;
uniform vec2  u_res;
uniform float u_threshold;
uniform vec3  u_balls[${MAX_BALLS}];
uniform int   u_count;
void main() {
  vec2 px = v_uv * u_res;
  float field = 0.0;
  for (int i = 0; i < ${MAX_BALLS}; i++) {
    if (i >= u_count) break;
    vec2  d = px - u_balls[i].xy;
    float r = u_balls[i].z;
    field += (r * r) / dot(d, d);
  }
  float inside = step(u_threshold, field);
  // Slime color: #90E43C = rgb(144, 228, 60)
  fragColor = vec4(vec3(0.565, 0.894, 0.235) * inside, 1.0);
}`;

const FS_PIXEL = `#version 300 es
precision highp float;
in  vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_tex;
uniform vec2      u_res;
uniform float     u_pixel_size;
void main() {
  vec2 cell    = floor(v_uv * u_res / u_pixel_size) * u_pixel_size + u_pixel_size * 0.5;
  vec2 snapped = cell / u_res;
  fragColor    = texture(u_tex, snapped);
}`;

// Logo overlay — samples the logo image, snaps to the same pixel grid,
// outputs black where the logo is opaque and discards elsewhere.
const FS_LOGO = `#version 300 es
precision highp float;
in  vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_logo;
uniform vec2      u_res;
uniform float     u_pixel_size;
// Logo rect in canvas-space pixels (y from top)
uniform vec4      u_logo_rect; // x, y, w, h
void main() {
  // Snap to the same pixel grid as the slime pass
  vec2 cell    = floor(v_uv * u_res / u_pixel_size) * u_pixel_size + u_pixel_size * 0.5;
  vec2 snapped = cell / u_res;
  // Map snapped canvas uv → logo uv
  vec2 px      = snapped * u_res;
  vec2 logo_uv = (px - u_logo_rect.xy) / u_logo_rect.zw;
  // Discard outside the logo rect
  if (logo_uv.x < 0.0 || logo_uv.x > 1.0 || logo_uv.y < 0.0 || logo_uv.y > 1.0) discard;
  // Flip Y: texImage2D row-0 = image top, but logo_uv.y=0 is bottom in WebGL coords
  logo_uv.y = 1.0 - logo_uv.y;
  float alpha  = texture(u_logo, logo_uv).a;
  if (alpha < 0.1) discard;
  fragColor    = vec4(0.0, 0.0, 0.0, alpha);
}`;

// ── Compile / link ─────────────────────────────────────────────────────────────

function compileShader(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

function linkProgram(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compileShader(gl.VERTEX_SHADER,   vs));
  gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p));
  return p;
}

const progMetaball = linkProgram(VS, FS_METABALL);
const progPixel    = linkProgram(VS, FS_PIXEL);
const progLogo     = linkProgram(VS, FS_LOGO);

// Shared fullscreen quad — bind once per program call in bindQuad()
const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER,
  new Float32Array([-1,-1, 1,-1, -1,1,  1,-1, 1,1, -1,1]),
  gl.STATIC_DRAW);

function bindQuad(prog) {
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  const loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}

// Uniform locations — metaball pass
const uRes_mb       = gl.getUniformLocation(progMetaball, 'u_res');
const uBalls_mb     = gl.getUniformLocation(progMetaball, 'u_balls[0]');
const uCount_mb     = gl.getUniformLocation(progMetaball, 'u_count');
const uThreshold_mb = gl.getUniformLocation(progMetaball, 'u_threshold');

// Uniform locations — pixelate pass
const uTex_px       = gl.getUniformLocation(progPixel, 'u_tex');
const uRes_px       = gl.getUniformLocation(progPixel, 'u_res');
const uPixelSize_px = gl.getUniformLocation(progPixel, 'u_pixel_size');

// Uniform locations — logo overlay pass
const uLogo_lo      = gl.getUniformLocation(progLogo, 'u_logo');
const uRes_lo       = gl.getUniformLocation(progLogo, 'u_res');
const uPixelSize_lo = gl.getUniformLocation(progLogo, 'u_pixel_size');
const uLogoRect_lo  = gl.getUniformLocation(progLogo, 'u_logo_rect');

// Logo WebGL texture (uploaded once the image is decoded)
let logoTex = null;

function uploadLogoTexture() {
  if (!heroLogo || heroLogo.naturalWidth === 0) return;
  if (logoTex) gl.deleteTexture(logoTex);
  logoTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, logoTex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, heroLogo);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

// ── FBO ───────────────────────────────────────────────────────────────────────

let booted = false; // set true after P and friends are initialised
let fbo, fboTex;

function createFBO(w, h) {
  if (fboTex) gl.deleteTexture(fboTex);
  if (fbo)    gl.deleteFramebuffer(fbo);
  fboTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fboTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function resize() {
  resizeCanvas();
  gl.viewport(0, 0, canvas.width, canvas.height);
  createFBO(canvas.width, canvas.height);
  if (booted) buildLogoBalls();
}
window.addEventListener('resize', resize);
resize(); // called here — booted is false, so buildLogoBalls is skipped safely

// ── Mouse ─────────────────────────────────────────────────────────────────────

const mouse       = { x: canvas.width / 2, y: canvas.height / 2 };
const smoothMouse = { x: mouse.x, y: mouse.y };

window.addEventListener('mousemove', e => {
  const r = hero.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
});
window.addEventListener('touchmove', e => {
  const r = hero.getBoundingClientRect();
  mouse.x = e.touches[0].clientX - r.left;
  mouse.y = e.touches[0].clientY - r.top;
}, { passive: true });

// ── Dev params ────────────────────────────────────────────────────────────────

const P = {
  threshold     : 1.02,
  mouseR        : 59,
  lerp          : 0.85,
  pixelSize     : 8,
  // Logo body balls
  logoCols      : 0,    // 0 = auto from aspect ratio
  logoRows      : 0,    // 0 = auto
  logoRadiusMult: 0.75, // r = spacing * this
  // Slime physics
  gravity       : 0.250,
  viscosity     : 0.92,
  surfTension   : 0.03,
  detachDist    : 12,
  stretchFrames : 10,
  spawnInterval : 10,
  dripMin       : 5,
  dripMax       : 10,
};

function bindSlider(id, valId, key, decimals = 2) {
  const el = document.getElementById(id);
  const vl = document.getElementById(valId);
  if (!el) return;
  el.addEventListener('input', () => {
    P[key] = parseFloat(el.value);
    if (vl) vl.textContent = P[key].toFixed(decimals);
  });
}
function bindSliderRebuild(id, valId, key, decimals = 2) {
  bindSlider(id, valId, key, decimals);
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => buildLogoBalls());
}

bindSlider('s-threshold', 'v-threshold', 'threshold',     2);
bindSlider('s-mouse-r',   'v-mouse-r',   'mouseR',        0);
bindSlider('s-lerp',      'v-lerp',      'lerp',          2);
bindSlider('s-pixel',     'v-pixel',     'pixelSize',     0);
bindSliderRebuild('s-logo-cols',   'v-logo-cols',   'logoCols',       0);
bindSliderRebuild('s-logo-rows',   'v-logo-rows',   'logoRows',       0);
bindSliderRebuild('s-logo-rmult',  'v-logo-rmult',  'logoRadiusMult', 2);
bindSlider('s-gravity',   'v-gravity',   'gravity',       3);
bindSlider('s-viscosity', 'v-viscosity', 'viscosity',     2);
bindSlider('s-tension',   'v-tension',   'surfTension',   2);
bindSlider('s-detach',    'v-detach',    'detachDist',    0);
bindSlider('s-stretch',   'v-stretch',   'stretchFrames', 0);
bindSlider('s-spawn',     'v-spawn',     'spawnInterval', 0);
bindSlider('s-drip-min',  'v-drip-min',  'dripMin',       0);
bindSlider('s-drip-max',  'v-drip-max',  'dripMax',       0);

const devPanel = document.getElementById('dev-panel');
window.addEventListener('keydown', e => {
  if (e.key === '`') devPanel.classList.toggle('visible');
});

// ── Slime physics ─────────────────────────────────────────────────────────────

const MAX_DRIPS    = 13;
const MIN_R        = 7;
const FALL_DAMPING = 0.97;

let drips      = [];
let spawnTimer = 0;

// Logo edge points for drip spawn (populated after logo loads).
// Falls back to top-semicircle of a centered circle if logo unavailable.
let logoEdgeSamples = [];

function spawnDrip() {
  let ax, ay;
  if (logoEdgeSamples.length > 0) {
    // Only spawn from the lower half of the logo edge (so drips fall downward)
    const pool = logoEdgeSamples.filter(s => s.y >= canvas.height * 0.4);
    const src  = pool.length ? pool : logoEdgeSamples;
    const pt   = src[Math.floor(Math.random() * src.length)];
    ax = pt.x;
    ay = pt.y;
  } else {
    // Fallback: arc around screen center
    const cx    = canvas.width  * 0.5;
    const cy    = canvas.height * 0.5;
    const angle = -Math.PI * Math.random();
    ax = cx + Math.cos(angle) * 160;
    ay = cy + Math.sin(angle) * 160;
  }

  const targetR = P.dripMin + Math.random() * (P.dripMax - P.dripMin);
  drips.push({
    x: ax, y: ay, vx: 0, vy: 0,
    r: 0, targetR,
    growRate: targetR / 40,
    phase: 'growing',
    anchorX: ax, anchorY: ay,
    stretchTimer: 0,
  });
}

function updateDrips() {
  spawnTimer++;
  if (spawnTimer >= P.spawnInterval && drips.length < MAX_DRIPS) {
    spawnTimer = 0;
    spawnDrip();
  }

  for (let i = drips.length - 1; i >= 0; i--) {
    const d = drips[i];

    if (d.phase === 'growing') {
      d.r += d.growRate;
      if (d.r >= d.targetR) { d.r = d.targetR; d.phase = 'clinging'; }
      d.vy += P.gravity * 0.3;
      d.vy *= P.viscosity;
      d.y  += d.vy;
      d.anchorX = d.x;
      d.anchorY = d.y;

    } else if (d.phase === 'clinging') {
      d.vy += P.gravity;
      d.vx += (d.anchorX - d.x) * P.surfTension;
      d.vy += (d.anchorY - d.y) * P.surfTension;
      d.vx *= P.viscosity;
      d.vy *= P.viscosity;
      d.x  += d.vx;
      d.y  += d.vy;
      if (Math.hypot(d.x - d.anchorX, d.y - d.anchorY) > P.detachDist) {
        d.phase = 'stretching';
        d.stretchTimer = 0;
      }

    } else if (d.phase === 'stretching') {
      d.stretchTimer++;
      const fade = 1.0 - d.stretchTimer / P.stretchFrames;
      d.vx += (d.anchorX - d.x) * P.surfTension * fade;
      d.vy += (d.anchorY - d.y) * P.surfTension * fade;
      d.vy += P.gravity;
      d.vx *= P.viscosity;
      d.vy *= P.viscosity;
      d.x  += d.vx;
      d.y  += d.vy;
      d.r  *= 0.9982;
      if (d.stretchTimer >= P.stretchFrames) { d.phase = 'falling'; d.vy += 0.6; }

    } else if (d.phase === 'falling') {
      d.vy += P.gravity;
      d.vx *= FALL_DAMPING;
      d.vy *= P.viscosity;
      d.x  += d.vx;
      d.y  += d.vy;
      d.r  *= 0.9988;
    }

    if ((d.r < MIN_R && d.phase !== 'growing') || d.y > canvas.height + 60)
      drips.splice(i, 1);
  }
}

// ── Logo body balls ───────────────────────────────────────────────────────────
// The original used ONE ball with r=160 for the body.
// We replace it with a row of overlapping balls that trace the logo bounding box.
// Each ball has r chosen so adjacent balls fully merge at threshold=1.02.
//
// For two balls of radius r spaced D apart, field at midpoint = 2r²/(D/2)²= 8r²/D²
// We want field >= threshold=1.02, so r >= D * sqrt(1.02/8) ≈ D * 0.357
// Use r = D * 0.45 for solid fill with some overlap margin.

let logoBalls   = []; // [{x,y,r}]  — static body balls

// logoRect: bounding box of the logo in canvas-space, set after image load.
// Starts as a centered fallback so slime is visible immediately.
let logoRect = null;

function getLogoRect() {
  // If image is loaded, measure it from its rendered size
  if (heroLogo.naturalWidth > 0) {
    const W = canvas.width, H = canvas.height;
    const maxW = W * 0.54, maxH = H * 0.28;
    const scale = Math.min(maxW / heroLogo.naturalWidth, maxH / heroLogo.naturalHeight);
    const dw = heroLogo.naturalWidth  * scale;
    const dh = heroLogo.naturalHeight * scale;
    return { x: (W - dw) / 2, y: (H - dh) / 2, w: dw, h: dh };
  }
  // Fallback before image loads
  const W = canvas.width, H = canvas.height;
  return { x: W * 0.23, y: H * 0.36, w: W * 0.54, h: H * 0.28 };
}

function buildLogoBalls() {
  logoBalls = [];
  logoRect  = getLogoRect();
  const { x, y, w, h } = logoRect;

  // Fill the rectangle with a grid of balls.
  const SLOTS  = MAX_BALLS - 1 - MAX_DRIPS;
  const aspect = w / h;
  const cols = P.logoCols > 0
    ? P.logoCols
    : Math.max(2, Math.round(Math.sqrt(SLOTS * aspect)));
  const rows = P.logoRows > 0
    ? P.logoRows
    : Math.max(2, Math.round(SLOTS / cols));
  const dx = w / (cols - 1 || 1);
  const dy = h / (rows - 1 || 1);
  const D  = Math.min(dx, dy);
  const r  = D * P.logoRadiusMult;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      logoBalls.push({ x: x + col * dx, y: y + row * dy, r });
    }
  }
}

// ── Logo mask sampling (async, upgrades drip spawn points) ────────────────────

function sampleLogoMask() {
  if (!heroLogo || heroLogo.naturalWidth === 0) return;
  const rect = getLogoRect();
  const off  = document.createElement('canvas');
  off.width  = Math.round(rect.w);
  off.height = Math.round(rect.h);
  const ctx  = off.getContext('2d');
  ctx.drawImage(heroLogo, 0, 0, off.width, off.height);
  let data;
  try { data = ctx.getImageData(0, 0, off.width, off.height).data; }
  catch (e) { return; } // CORS taint — skip, fallback drip spawn still works

  const DENSITY = 8;
  logoEdgeSamples = [];
  for (let py = 0; py < off.height; py += DENSITY) {
    for (let px = 0; px < off.width; px += DENSITY) {
      if (data[(py * off.width + px) * 4 + 3] < 60) continue;
      const neighbors = [
        [px - DENSITY, py], [px + DENSITY, py],
        [px, py - DENSITY], [px, py + DENSITY],
      ];
      const isEdge = neighbors.some(([nx, ny]) => {
        if (nx < 0 || ny < 0 || nx >= off.width || ny >= off.height) return true;
        return data[(ny * off.width + nx) * 4 + 3] < 60;
      });
      if (isEdge) logoEdgeSamples.push({ x: rect.x + px, y: rect.y + py });
    }
  }
}

// ── Slime render ──────────────────────────────────────────────────────────────

const ballData = new Float32Array(MAX_BALLS * 3);

function renderSlime() {
  updateDrips();

  const h = canvas.height;

  // Ball list: logo body + mouse + drips  (shader y = h - canvas y)
  const all = [
    ...logoBalls.map(b => ({ x: b.x, y: h - b.y, r: b.r })),
    { x: smoothMouse.x, y: h - smoothMouse.y, r: P.mouseR },
    ...drips.map(d => ({ x: d.x, y: h - d.y, r: d.r })),
  ].slice(0, MAX_BALLS);

  for (let i = 0; i < MAX_BALLS; i++) {
    const b = all[i] || { x: -9999, y: -9999, r: 0 };
    ballData[i * 3]     = b.x;
    ballData[i * 3 + 1] = b.y;
    ballData[i * 3 + 2] = b.r;
  }

  // Pass 1 — metaball → FBO
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, canvas.width, h);
  gl.useProgram(progMetaball);
  bindQuad(progMetaball);
  gl.uniform2f(uRes_mb, canvas.width, h);
  gl.uniform1f(uThreshold_mb, P.threshold);
  gl.uniform3fv(uBalls_mb, ballData);
  gl.uniform1i(uCount_mb, all.length);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Pass 2 — pixelate → screen
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, h);
  gl.useProgram(progPixel);
  bindQuad(progPixel);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fboTex);
  gl.uniform1i(uTex_px, 0);
  gl.uniform2f(uRes_px, canvas.width, h);
  gl.uniform1f(uPixelSize_px, P.pixelSize);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Pass 3 — logo overlay → screen (black, pixelated, blended over slime)
  if (logoTex && logoRect) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(progLogo);
    bindQuad(progLogo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, logoTex);
    gl.uniform1i(uLogo_lo, 0);
    gl.uniform2f(uRes_lo, canvas.width, h);
    gl.uniform1f(uPixelSize_lo, P.pixelSize);
    // logoRect y is from canvas-top; shader UVs have y=0 at bottom, so flip y
    gl.uniform4f(uLogoRect_lo, logoRect.x, h - logoRect.y - logoRect.h, logoRect.w, logoRect.h);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);
  }
}

// ── Viz registry & switcher ───────────────────────────────────────────────────

const VIZZES = [
  {
    name:   'Slime',
    accent: '#90E43C',
    init()    { drips = []; spawnTimer = 0; buildLogoBalls(); sampleLogoMask(); },
    render()  { renderSlime(); },
    destroy() {},
  },
  // Future vizzes go here — add an `accent` color to each
];

let vizIndex = 0;

function setViz(idx) {
  VIZZES[vizIndex].destroy();
  vizIndex = ((idx % VIZZES.length) + VIZZES.length) % VIZZES.length;
  const viz = VIZZES[vizIndex];
  viz.init();
  vizLabel.textContent = viz.name;
  hero.style.setProperty('--accent', viz.accent || '#fff');
}

document.getElementById('viz-prev').addEventListener('click', () => setViz(vizIndex - 1));
document.getElementById('viz-next').addEventListener('click', () => setViz(vizIndex + 1));

// ── Render loop ───────────────────────────────────────────────────────────────

function frame() {
  smoothMouse.x += (mouse.x - smoothMouse.x) * P.lerp;
  smoothMouse.y += (mouse.y - smoothMouse.y) * P.lerp;
  VIZZES[vizIndex].render();
  requestAnimationFrame(frame);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

booted = true;
setViz(0);
requestAnimationFrame(frame);

// Once the logo image is decoded, upgrade drip spawn points.
// (buildLogoBalls already used naturalWidth if available at boot time.)
if (heroLogo.complete && heroLogo.naturalWidth > 0) {
  buildLogoBalls();
  sampleLogoMask();
  uploadLogoTexture();
} else {
  heroLogo.addEventListener('load', () => {
    buildLogoBalls();
    sampleLogoMask();
    uploadLogoTexture();
    drips = [];
    spawnTimer = 0;
  }, { once: true });
}
