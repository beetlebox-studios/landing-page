// ─── WebGL metaball hero — viz sandbox ────────────────────────────────────────

const canvas   = document.getElementById('metaball-canvas');
const hero     = document.getElementById('hero');
const heroLogo = document.getElementById('hero-logo');
const vizLabel = document.getElementById('viz-label');

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

const MAX_BALLS = 16;

// Metaball pass — logo contribution via pre-dilated texture (1 sample/fragment).
const FS_METABALL = `#version 300 es
precision highp float;
in  vec2 v_uv;
out vec4 fragColor;
uniform vec2      u_res;
uniform float     u_threshold;
uniform vec3      u_balls[${MAX_BALLS}];
uniform int       u_count;
uniform sampler2D u_logo_dilated;
uniform vec4      u_logo_rect;
uniform float     u_logo_str;
void main() {
  vec2 px = v_uv * u_res;
  float field = 0.0;
  for (int i = 0; i < ${MAX_BALLS}; i++) {
    if (i >= u_count) break;
    vec2  d = px - u_balls[i].xy;
    float r = u_balls[i].z;
    field += (r * r) / dot(d, d);
  }
  vec2 logo_uv = (px - u_logo_rect.xy) / u_logo_rect.zw;
  if (logo_uv.x >= 0.0 && logo_uv.x <= 1.0 && logo_uv.y >= 0.0 && logo_uv.y <= 1.0) {
    float raw = texture(u_logo_dilated, vec2(logo_uv.x, 1.0 - logo_uv.y)).r;
    // Smooth the edge: remap so the outermost fringe is a gradient rather than a cliff.
    // smoothstep creates a soft ramp from 0 at the expand fringe to 1 at the solid core,
    // giving metaballs a gradual surface to merge into instead of a hard wall.
    float a = smoothstep(0.0, 0.55, raw);
    field += a * u_logo_str;
  }
  float inside = step(u_threshold, field);
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

const FS_LOGO = `#version 300 es
precision highp float;
in  vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_logo;
uniform vec2      u_res;
uniform float     u_pixel_size;
uniform vec4      u_logo_rect;
void main() {
  vec2 cell    = floor(v_uv * u_res / u_pixel_size) * u_pixel_size + u_pixel_size * 0.5;
  vec2 snapped = cell / u_res;
  vec2 px      = snapped * u_res;
  vec2 logo_uv = (px - u_logo_rect.xy) / u_logo_rect.zw;
  if (logo_uv.x < 0.0 || logo_uv.x > 1.0 || logo_uv.y < 0.0 || logo_uv.y > 1.0) discard;
  float alpha = texture(u_logo, vec2(logo_uv.x, 1.0 - logo_uv.y)).a;
  if (alpha < 0.1) discard;
  fragColor = vec4(0.0, 0.0, 0.0, alpha);
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

// ── VAOs ──────────────────────────────────────────────────────────────────────

const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER,
  new Float32Array([-1,-1, 1,-1, -1,1,  1,-1, 1,1, -1,1]),
  gl.STATIC_DRAW);

function makeVAO(prog) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  const loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

const vaoMetaball = makeVAO(progMetaball);
const vaoPixel    = makeVAO(progPixel);
const vaoLogo     = makeVAO(progLogo);

// ── Uniform locations ─────────────────────────────────────────────────────────

const uRes_mb         = gl.getUniformLocation(progMetaball, 'u_res');
const uBalls_mb       = gl.getUniformLocation(progMetaball, 'u_balls[0]');
const uCount_mb       = gl.getUniformLocation(progMetaball, 'u_count');
const uThreshold_mb   = gl.getUniformLocation(progMetaball, 'u_threshold');
const uLogoDilated_mb = gl.getUniformLocation(progMetaball, 'u_logo_dilated');
const uLogoRect_mb    = gl.getUniformLocation(progMetaball, 'u_logo_rect');
const uLogoStr_mb     = gl.getUniformLocation(progMetaball, 'u_logo_str');

const uTex_px         = gl.getUniformLocation(progPixel, 'u_tex');
const uRes_px         = gl.getUniformLocation(progPixel, 'u_res');
const uPixelSize_px   = gl.getUniformLocation(progPixel, 'u_pixel_size');

const uLogo_lo        = gl.getUniformLocation(progLogo, 'u_logo');
const uRes_lo         = gl.getUniformLocation(progLogo, 'u_res');
const uPixelSize_lo   = gl.getUniformLocation(progLogo, 'u_pixel_size');
const uLogoRect_lo    = gl.getUniformLocation(progLogo, 'u_logo_rect');

// ── Dev params (declared early so everything below can reference P) ────────────

const P = {
  threshold     : 1.92,
  mouseR        : 59,
  lerp          : 0.85,
  pixelSize     : 6,
  logoStr       : 30.0,
  logoExpand    : 36,
  gravity       : 0.300,
  viscosity     : 0.99,
  surfTension   : 0.01,
  detachDist    : 22,
  stretchFrames : 22,
  spawnInterval : 10,
  dripMin       : 8,
  dripMax       : 16,
};

// ── Textures ───────────────────────────────────────────────────────────────────

let logoTex           = null;
let logoDilatedTex    = null;
let logoDilatedExpand = -1;

// CPU two-pass separable max-filter dilation — O(w*h*r) not O(w*h*r²)
function buildDilatedAlpha(img, expand) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const src = document.createElement('canvas');
  src.width = iw; src.height = ih;
  const sctx = src.getContext('2d');
  sctx.drawImage(img, 0, 0);
  let srcData;
  try { srcData = sctx.getImageData(0, 0, iw, ih).data; }
  catch (e) { return null; }

  const alpha = new Float32Array(iw * ih);
  for (let i = 0; i < iw * ih; i++) alpha[i] = srcData[i * 4 + 3] / 255;

  const r = Math.round(expand);
  if (r <= 0) {
    const out = new Uint8Array(iw * ih);
    for (let i = 0; i < iw * ih; i++) out[i] = srcData[i * 4 + 3];
    return { data: out, width: iw, height: ih };
  }

  // Horizontal pass
  const hPass = new Float32Array(iw * ih);
  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      let best = 0;
      const x0 = Math.max(0, x - r), x1 = Math.min(iw - 1, x + r);
      for (let kx = x0; kx <= x1; kx++) best = Math.max(best, alpha[y * iw + kx]);
      hPass[y * iw + x] = best;
    }
  }

  // Vertical pass
  const out = new Uint8Array(iw * ih);
  for (let x = 0; x < iw; x++) {
    for (let y = 0; y < ih; y++) {
      let best = 0;
      const y0 = Math.max(0, y - r), y1 = Math.min(ih - 1, y + r);
      for (let ky = y0; ky <= y1; ky++) best = Math.max(best, hPass[ky * iw + x]);
      out[y * iw + x] = Math.round(best * 255);
    }
  }

  return { data: out, width: iw, height: ih };
}

function rebuildDilatedTex() {
  if (!heroLogo || heroLogo.naturalWidth === 0) return;
  const expand = P.logoExpand;
  if (expand === logoDilatedExpand) return;

  const result = buildDilatedAlpha(heroLogo, expand);
  if (!result) return;

  if (logoDilatedTex) gl.deleteTexture(logoDilatedTex);
  logoDilatedTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, logoDilatedTex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, result.width, result.height, 0,
                gl.RED, gl.UNSIGNED_BYTE, result.data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  logoDilatedExpand = expand;
}

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
  logoDilatedExpand = -1;
  rebuildDilatedTex();
}

// ── FBO ───────────────────────────────────────────────────────────────────────

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

// ── Resize ────────────────────────────────────────────────────────────────────

let logoRect = null; // {x, y, w, h} in canvas-space, cached

function getLogoRect() {
  if (heroLogo.naturalWidth > 0) {
    const W = canvas.width, H = canvas.height;
    const maxW = W * 0.54, maxH = H * 0.28;
    const scale = Math.min(maxW / heroLogo.naturalWidth, maxH / heroLogo.naturalHeight);
    const dw = heroLogo.naturalWidth  * scale;
    const dh = heroLogo.naturalHeight * scale;
    return { x: (W - dw) / 2, y: (H - dh) / 2, w: dw, h: dh };
  }
  const W = canvas.width, H = canvas.height;
  return { x: W * 0.23, y: H * 0.36, w: W * 0.54, h: H * 0.28 };
}

function resize() {
  canvas.width  = hero.clientWidth;
  canvas.height = hero.clientHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
  createFBO(canvas.width, canvas.height);
  if (heroLogo.naturalWidth > 0) logoRect = getLogoRect();
}
window.addEventListener('resize', resize);
resize();

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

// ── Slider bindings ───────────────────────────────────────────────────────────

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

const rebuildDilatedDebounced = debounce(rebuildDilatedTex, 80);

function bindSlider(id, valId, key, decimals = 2, onChange) {
  const el = document.getElementById(id);
  const vl = document.getElementById(valId);
  if (!el) return;
  el.addEventListener('input', () => {
    P[key] = parseFloat(el.value);
    if (vl) vl.textContent = P[key].toFixed(decimals);
    if (onChange) onChange();
  });
}

bindSlider('s-threshold',   'v-threshold',   'threshold',     2);
bindSlider('s-mouse-r',     'v-mouse-r',     'mouseR',        0);
bindSlider('s-lerp',        'v-lerp',        'lerp',          2);
bindSlider('s-pixel',       'v-pixel',       'pixelSize',     0);
bindSlider('s-logo-str',    'v-logo-str',    'logoStr',       2);
bindSlider('s-logo-expand', 'v-logo-expand', 'logoExpand',    0, rebuildDilatedDebounced);
bindSlider('s-gravity',     'v-gravity',     'gravity',       3);
bindSlider('s-viscosity',   'v-viscosity',   'viscosity',     2);
bindSlider('s-tension',     'v-tension',     'surfTension',   2);
bindSlider('s-detach',      'v-detach',      'detachDist',    0);
bindSlider('s-stretch',     'v-stretch',     'stretchFrames', 0);
bindSlider('s-spawn',       'v-spawn',       'spawnInterval', 0);
bindSlider('s-drip-min',    'v-drip-min',    'dripMin',       0);
bindSlider('s-drip-max',    'v-drip-max',    'dripMax',       0);

const devPanel = document.getElementById('dev-panel');
window.addEventListener('keydown', e => {
  if (e.key === '`') devPanel.classList.toggle('visible');
});

// ── Performance diagnostics ────────────────────────────────────────────────────

const perf = { frameCount: 0, fpsSmooth: 0, frameSmooth: 0, lastTime: performance.now() };
const vFps     = document.getElementById('v-fps');
const vFrameMs = document.getElementById('v-frame-ms');
const vDrips   = document.getElementById('v-drips');
const vFragPx  = document.getElementById('v-frag-px');
const vResW    = document.getElementById('v-res-w');
const vResH    = document.getElementById('v-res-h');

function updatePerfDisplay(now) {
  const dt  = now - perf.lastTime;
  perf.lastTime = now;
  const fps = dt > 0 ? 1000 / dt : 0;
  perf.fpsSmooth   += (fps - perf.fpsSmooth)   * 0.1;
  perf.frameSmooth += (dt  - perf.frameSmooth) * 0.1;
  perf.frameCount++;
  if (perf.frameCount % 15 === 0) {
    if (vFps)     vFps.textContent     = perf.fpsSmooth.toFixed(1);
    if (vFrameMs) vFrameMs.textContent = perf.frameSmooth.toFixed(2);
    if (vDrips)   vDrips.textContent   = drips.length;
    const fragPx = Math.round((canvas.width * canvas.height) / (P.pixelSize * P.pixelSize));
    if (vFragPx)  vFragPx.textContent  = (fragPx / 1000).toFixed(1) + 'k';
    if (vResW)    vResW.textContent    = canvas.width;
    if (vResH)    vResH.textContent    = canvas.height;
  }
}

// ── Slime physics ─────────────────────────────────────────────────────────────

const MAX_DRIPS    = 24;
const MIN_R        = 7;
const FALL_DAMPING = 0.97;

let drips      = [];
let spawnTimer = 0;
let logoEdgeSamples = [];

function spawnDrip() {
  let ax, ay;
  if (logoEdgeSamples.length > 0) {
    const pool = logoEdgeSamples.filter(s => s.y >= canvas.height * 0.4);
    const src  = pool.length ? pool : logoEdgeSamples;
    const pt   = src[Math.floor(Math.random() * src.length)];
    ax = pt.x; ay = pt.y;
  } else {
    const cx = canvas.width * 0.5, cy = canvas.height * 0.5;
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

  const h = canvas.height;
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

    if ((d.r < MIN_R && d.phase !== 'growing') || d.y > h + 60)
      drips.splice(i, 1);
  }
}

// ── Logo mask sampling (drip spawn points) ────────────────────────────────────

function sampleLogoMask() {
  if (!heroLogo || heroLogo.naturalWidth === 0) return;
  logoRect = getLogoRect();
  const off = document.createElement('canvas');
  off.width  = Math.round(logoRect.w);
  off.height = Math.round(logoRect.h);
  const ctx  = off.getContext('2d');
  ctx.drawImage(heroLogo, 0, 0, off.width, off.height);
  let data;
  try { data = ctx.getImageData(0, 0, off.width, off.height).data; }
  catch (e) { return; }

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
      if (isEdge) logoEdgeSamples.push({ x: logoRect.x + px, y: logoRect.y + py });
    }
  }
}

// ── Slime render ──────────────────────────────────────────────────────────────

const ballData = new Float32Array(MAX_BALLS * 3);

function renderSlime() {
  updateDrips();

  const h   = canvas.height;
  const cur = logoRect || getLogoRect();
  const lrX = cur.x, lrY = h - cur.y - cur.h, lrW = cur.w, lrH = cur.h;

  // Build ball list directly into pre-allocated array
  ballData[0] = smoothMouse.x;
  ballData[1] = h - smoothMouse.y;
  ballData[2] = P.mouseR;
  let count = 1;
  for (let i = 0; i < drips.length && count < MAX_BALLS; i++, count++) {
    ballData[count * 3]     = drips[i].x;
    ballData[count * 3 + 1] = h - drips[i].y;
    ballData[count * 3 + 2] = drips[i].r;
  }

  // Pass 1 — metaball + logo → FBO
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, canvas.width, h);
  gl.useProgram(progMetaball);
  gl.bindVertexArray(vaoMetaball);
  gl.uniform2f(uRes_mb, canvas.width, h);
  gl.uniform1f(uThreshold_mb, P.threshold);
  gl.uniform3fv(uBalls_mb, ballData);
  gl.uniform1i(uCount_mb, count);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, logoDilatedTex || null);
  gl.uniform1i(uLogoDilated_mb, 1);
  gl.uniform4f(uLogoRect_mb, lrX, lrY, lrW, lrH);
  gl.uniform1f(uLogoStr_mb, logoDilatedTex ? P.logoStr : 0.0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Pass 2 — pixelate → screen
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, h);
  gl.useProgram(progPixel);
  gl.bindVertexArray(vaoPixel);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fboTex);
  gl.uniform1i(uTex_px, 0);
  gl.uniform2f(uRes_px, canvas.width, h);
  gl.uniform1f(uPixelSize_px, P.pixelSize);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Pass 3 — black logo overlay
  if (logoTex) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(progLogo);
    gl.bindVertexArray(vaoLogo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, logoTex);
    gl.uniform1i(uLogo_lo, 0);
    gl.uniform2f(uRes_lo, canvas.width, h);
    gl.uniform1f(uPixelSize_lo, P.pixelSize);
    gl.uniform4f(uLogoRect_lo, lrX, lrY, lrW, lrH);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);
  }
}

// ── Viz registry & switcher ───────────────────────────────────────────────────

const VIZZES = [
  {
    name:   'Slime',
    accent: '#90E43C',
    init()    { drips = []; spawnTimer = 0; sampleLogoMask(); },
    render()  { renderSlime(); },
    destroy() {},
  },
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

function frame(now) {
  smoothMouse.x += (mouse.x - smoothMouse.x) * P.lerp;
  smoothMouse.y += (mouse.y - smoothMouse.y) * P.lerp;
  VIZZES[vizIndex].render();
  updatePerfDisplay(now);
  requestAnimationFrame(frame);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

setViz(0);
requestAnimationFrame(frame);

function onLogoReady() {
  logoRect = getLogoRect();
  sampleLogoMask();
  uploadLogoTexture();
  drips = [];
  spawnTimer = 0;
}

if (heroLogo.complete && heroLogo.naturalWidth > 0) {
  onLogoReady();
} else {
  heroLogo.addEventListener('load', onLogoReady, { once: true });
}
