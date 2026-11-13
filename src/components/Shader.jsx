import { useEffect, useRef } from 'react';

/**
 * Stadium-at-night backdrop: sweeping floodlight beams through drifting haze,
 * a perspective pitch grid rolling toward the viewer, warm signal glow, grain and vignette.
 * Raw WebGL (no library). Renders at reduced resolution, pauses when off-screen or the tab
 * is hidden, and draws a single still frame when the user prefers reduced motion.
 */
const FRAG = `
precision mediump float;
uniform vec2 r;
uniform float t;
uniform vec2 m;
uniform float s;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
float beam(vec2 p, vec2 o, float ang, float w){
  vec2 d = p - o;
  float a = atan(d.x, -d.y);
  float q = (a - ang) / w;
  float k = exp(-q * q);
  return k * (1.0 - smoothstep(0.0, 2.2, length(d)));
}
void main(){
  vec2 uv = gl_FragCoord.xy / r;
  float asp = r.x / r.y;
  vec2 p = vec2(uv.x * asp, uv.y);

  vec3 ink = vec3(0.043, 0.043, 0.047);
  vec3 warm = vec3(1.0, 0.93, 0.80);
  vec3 sig = vec3(0.89, 0.07, 0.25);
  vec3 gold = vec3(1.0, 0.62, 0.22);

  float haze = fbm(p * 2.2 + vec2(t * 0.035, -t * 0.02) + m * 0.15);
  float b1 = beam(p, vec2(-0.15, 1.25), 0.62 + 0.10 * sin(t * 0.23) + m.x * 0.06, 0.15);
  float b2 = beam(p, vec2(asp + 0.15, 1.25), -0.62 + 0.10 * sin(t * 0.19 + 1.7) + m.x * 0.06, 0.15);
  float b3 = beam(p, vec2(asp * 0.5, 1.45), 0.08 * sin(t * 0.17 + 0.6), 0.07) * 0.6;
  float light = (b1 + b2 + b3) * (0.25 + 0.95 * haze);

  // Beams shift from warm white near the lamps to gold as they fall.
  vec3 beamCol = mix(gold, warm, smoothstep(0.2, 1.0, uv.y));
  vec3 col = ink + beamCol * light * 0.95 * s;

  // Perspective pitch grid below the horizon.
  float hor = 0.40;
  if (uv.y < hor) {
    float z = 0.22 / (hor - uv.y + 0.001);
    vec2 g = vec2((uv.x - 0.5) * asp * z * 1.6, z + t * 0.22);
    vec2 gl = abs(fract(g) - 0.5);
    float line = smoothstep(0.47, 0.5, max(gl.x, gl.y));
    float fade = (1.0 - smoothstep(0.0, hor, uv.y)) * smoothstep(0.0, 0.12, hor - uv.y);
    col += mix(warm, sig, 0.45) * line * fade * 0.2;
  }

  // Signal-to-gold bloom low in the frame.
  float gd = length((uv - vec2(0.5, -0.05)) * vec2(1.1, 2.6));
  float glow = exp(-gd * gd * 1.6);
  col += mix(sig, gold, uv.x) * glow * 0.3;

  float vig = 1.0 - smoothstep(0.25, 1.25, length((uv - 0.5) * vec2(asp * 0.75, 1.0)));
  col *= mix(0.55, 1.0, vig);
  col += (hash(gl_FragCoord.xy + fract(t) * 91.0) - 0.5) * 0.05;

  gl_FragColor = vec4(col, 1.0);
}`;

const VERT = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';

export default function Shader({ className = 'hero-canvas', intensity = 1 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    const hide = () => { if (canvas) canvas.style.display = 'none'; };
    if (!gl) { hide(); return undefined; }
    canvas.addEventListener('webglcontextlost', hide);

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { hide(); return undefined; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, 'r');
    const uT = gl.getUniformLocation(prog, 't');
    const uM = gl.getUniformLocation(prog, 'm');
    const uS = gl.getUniformLocation(prog, 's');

    const mobile = window.matchMedia('(max-width: 760px)').matches;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scale = mobile ? 0.45 : 0.6;
    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth * scale));
      const h = Math.max(1, Math.floor(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e) => {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
    io.observe(canvas);

    const start = performance.now();
    let raf = 0;
    let last = 0;
    const draw = (time) => {
      resize();
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, time);
      gl.uniform2f(uM, mouse.x, mouse.y);
      gl.uniform1f(uS, intensity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      if (mobile && now - last < 33) return; // ~30fps on phones
      last = now;
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      draw((now - start) / 1000);
    };
    if (still) draw(12);
    else raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [intensity]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
