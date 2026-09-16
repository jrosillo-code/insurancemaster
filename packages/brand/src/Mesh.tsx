'use client';

import { useEffect, useRef } from 'react';

/**
 * The moving mesh.
 *
 * A WebGL gradient field behind the page: four palette colours pushed around by
 * value noise, with the accent surfacing only where the noise peaks, and a warm
 * pool that follows the pointer. It is the one piece of the design that moves on
 * its own, and it is deliberately slow — the period is measured in tens of
 * seconds, so it reads as a room with light in it rather than as an animation
 * playing.
 *
 * Everything about it is built to be skippable, because it is decoration on a
 * tool people use all day:
 *
 *   - `prefers-reduced-motion: reduce` — never starts, and the CSS fallback
 *     behind it stays.
 *   - no WebGL, or a context that fails to compile — returns quietly, same
 *     fallback. There is no error path a visitor can see.
 *   - off screen or tab hidden — the loop stops. A hidden canvas spinning a
 *     fragment shader is a laptop fan and nothing else.
 *   - half resolution, capped at 1× DPR, `powerPreference: 'low-power'`. The
 *     field is a soft gradient; nobody can see the pixels it is missing.
 *
 * The fallback is a static CSS radial-gradient painted on the same element by
 * `.mesh` in the stylesheet, so the canvas draws *over* something that already
 * looks right. Nothing here is load-bearing for legibility: every text/surface
 * pair meets contrast against the flat `--ground`, never against the mesh.
 *
 * On the CSP: this is a bundled module, not an inline script, so it runs under
 * `script-src 'self' 'nonce-…' 'strict-dynamic'` without an exception. WebGL
 * needs no `connect-src` and loads nothing.
 */

const VERTEX = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

/*
 * Value noise rather than a gradient/simplex implementation: three octaves of
 * smoothed hashes is enough for a field this soft, and it keeps the shader
 * short enough to compile fast on the integrated GPUs this will mostly run on.
 */
const FRAGMENT = `
/*
 * highp, not mediump, and the component refuses to start without it.
 *
 * The hash below is the usual fract(sin(dot(…)) * 43758.5) trick, and it needs
 * the mantissa. mediump carries about ten bits, so by the time you multiply into
 * the tens of thousands a whole neighbourhood of inputs lands on one float:
 * fract() then returns the same value everywhere, fbm() sums to a constant, and
 * the "field" comes out as one flat colour — which, because the accent surfaces
 * at the top of the range, is a flat gold-brown wash across the entire viewport.
 * It renders; it just isn't a mesh.
 */
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_pointer;
uniform vec3 u_ground;
uniform vec3 u_deep;
uniform vec3 u_warm;
uniform vec3 u_accent;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  v += 0.55 * noise(p);
  v += 0.30 * noise(p * 2.03);
  v += 0.15 * noise(p * 4.01);
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  // Correct for aspect so the cells stay round on a wide viewport.
  vec2 st = uv * vec2(u_res.x / u_res.y, 1.0);

  float t = u_time * 0.018;
  // Two fields drifting against each other: one slow, one slower and offset, so
  // the pattern never visibly repeats within a session.
  float a = fbm(st * 1.6 + vec2(t, t * 0.6));
  float b = fbm(st * 2.3 - vec2(t * 0.7, t * 0.45) + 11.3);
  float field = mix(a, b, 0.45);

  // The field ranges *below* the ground as well as above it. Three near-identical
  // dark stops mixed together give a flat tint, not a field — the eye reads the
  // page as brown rather than as lit. Sinking the troughs towards black is what
  // produces depth, and it costs no extra token: half the ground is the shadow.
  vec3 shadow = u_ground * 0.5;
  vec3 colour = mix(shadow, u_ground, smoothstep(0.10, 0.55, field));
  colour = mix(colour, u_deep, smoothstep(0.45, 0.80, field));
  colour = mix(colour, u_warm, smoothstep(0.70, 1.0, field) * 0.80);

  // The accent surfaces only at the very top of the range, and never above 10%.
  // It is the brand colour, not a wash; at 16% it hazed the entire viewport gold
  // and spent in the backdrop the one thing the design saves for actions.
  colour = mix(colour, u_accent, smoothstep(0.88, 1.0, field) * 0.10);

  // The two blooms the CSS fallback paints, in the same corners, so the shader
  // and the field behind it read as one design rather than as two. GL's y runs
  // from the bottom, hence 1.08 for the top-left one.
  vec2 aspect = vec2(u_res.x / u_res.y, 1.0);
  float bloom = (1.0 - smoothstep(0.0, 0.95, distance(st, vec2(0.06, 1.08) * aspect))) * 0.06
              + (1.0 - smoothstep(0.0, 0.80, distance(st, vec2(0.96, -0.05) * aspect))) * 0.035;
  colour = mix(colour, u_accent, bloom);

  // A warm pool under the pointer. Radius in aspect-corrected space so it stays
  // circular, squared so it falls off as a halo rather than washing the middle
  // of the screen, and it decays to nothing well before the edges.
  vec2 pointer = u_pointer * aspect;
  float pool = 1.0 - smoothstep(0.0, 0.34, distance(st, pointer));
  colour = mix(colour, u_accent, pool * pool * 0.05);

  // A little noise in the output kills the banding a smooth dark gradient shows
  // on 8-bit panels, which is exactly where this would otherwise look cheap.
  float dither = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(colour + dither, 1.0);
}
`;

/** '#14120f' → [0.078, 0.071, 0.059] */
function rgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace('#', ''), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function Mesh() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    /*
     * Hidden until proven, never hidden with `display`.
     *
     * The stylesheet ships the canvas `visibility: hidden`, and it is revealed
     * only after it has drawn a frame we have read back and checked. Every exit
     * below therefore leaves the CSS field showing, which is the thing we
     * actually want on every failure path.
     *
     * `visibility` rather than `display` because a `display: none` canvas has no
     * layout, so `clientWidth` is 0 and the buffer would be sized 1×1 before we
     * ever get to measure it.
     */
    const reveal = () => {
      canvas.style.visibility = 'visible';
    };
    const conceal = () => {
      canvas.style.visibility = 'hidden';
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const gl =
      (canvas.getContext('webgl', {
        // Deliberately not `alpha: false`. An opaque canvas that fails to draw
        // composites as a solid white rectangle over the whole viewport; a
        // transparent one composites as nothing at all, and the field behind it
        // shows. The shader writes alpha 1.0, so a working mesh looks identical
        // either way — this only changes what a broken one looks like.
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
      }) as WebGLRenderingContext | null) ?? null;
    // A context can already be lost when we get it — see the cleanup note below.
    if (!gl || gl.isContextLost()) return;

    // See the note at the top of the fragment shader: without highp the noise
    // degenerates and the "mesh" is a flat wash. Better no mesh than that.
    const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (!precision || precision.precision < 23) return;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = vertex && fragment ? gl.createProgram() : null;
    if (!vertex || !fragment || !program) return;

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    // One full-screen triangle. Two fewer vertices than a quad and no seam.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const uRes = uniform('u_res');
    const uTime = uniform('u_time');
    const uPointer = uniform('u_pointer');

    // Read the palette out of the stylesheet rather than repeating it here, so
    // the mesh cannot drift away from the theme it is supposed to belong to.
    const theme = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) =>
      rgb(theme.getPropertyValue(name).trim() || fallback);
    const ground = token('--ground', '#14120f');
    gl.uniform3fv(uniform('u_ground'), ground);
    gl.uniform3fv(uniform('u_deep'), token('--surface', '#1c1916'));
    gl.uniform3fv(uniform('u_warm'), token('--surface-2', '#232019'));
    gl.uniform3fv(uniform('u_accent'), token('--accent', '#c8a45d'));

    // Half resolution, and never above 1× DPR. A soft field does not need the
    // pixels, and this is the difference between a warm laptop and a cool one.
    const SCALE = 0.5;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1);
      const width = Math.max(1, Math.floor(canvas.clientWidth * dpr * SCALE));
      const height = Math.max(1, Math.floor(canvas.clientHeight * dpr * SCALE));
      // Assigning either dimension reallocates the drawing buffer, so that part
      // stays gated on an actual change.
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      /*
       * The viewport and u_res are set every time, not only on a change.
       *
       * They belong to the GL context and to the program, and the canvas they
       * describe outlives both: a remount builds a new program whose uniforms
       * are all zero while reusing a canvas that is already exactly the right
       * size — so a size-gated update never fires, and u_res stays (0, 0).
       * gl_FragCoord.xy / vec2(0.0) is not finite, every noise lookup collapses,
       * and the mesh renders as one flat rectangle. Nothing errors; the shader
       * compiles, the context is healthy, the draw call succeeds, and the page
       * just quietly looks like a solid brown block.
       */
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uRes, width, height);
    };
    resize();

    // Starts centred, so a visitor who never moves the pointer still gets the
    // pool rather than a flat corner.
    const pointer = { x: 0.5, y: 0.5 };
    const target = { x: 0.5, y: 0.5 };
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      target.x = event.clientX / window.innerWidth;
      target.y = 1 - event.clientY / window.innerHeight;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    let frame = 0;
    let running = true;
    const start = performance.now();

    const draw = (now: number) => {
      if (!running) return;
      resize();
      // Eased towards the pointer rather than snapped to it: the pool should
      // arrive a moment after the cursor, like light does.
      pointer.x += (target.x - pointer.x) * 0.04;
      pointer.y += (target.y - pointer.y) * 0.04;
      gl.uniform2f(uPointer, pointer.x, pointer.y);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      frame = requestAnimationFrame(draw);
    };

    const stop = () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    const play = () => {
      if (running && frame) return;
      running = true;
      frame = requestAnimationFrame(draw);
    };

    // Off screen or in a background tab, it stops entirely.
    const observer = new IntersectionObserver(
      ([entry]) => (entry?.isIntersecting ? play() : stop()),
      { threshold: 0 },
    );
    observer.observe(canvas);
    const onVisibility = () => (document.hidden ? stop() : play());
    document.addEventListener('visibilitychange', onVisibility);

    // A GPU can go away mid-session — a laptop waking from sleep, a driver
    // reset, a tab the browser decided to reclaim memory from. Put the CSS
    // field back rather than leaving a dead canvas on screen.
    const onLost = () => {
      stop();
      conceal();
    };
    canvas.addEventListener('webglcontextlost', onLost);

    /*
     * Prove it drew, or stay out of the way.
     *
     * A context that exists is not a context that renders, and the failure is
     * silent: `getContext` succeeds, every shader compiles, `getError` returns
     * 0, and the buffer stays empty. So rather than trust any of that, draw one
     * frame and read a pixel back.
     *
     * The test is that the pixel is near the ground colour, not merely that it
     * is non-zero. It is compared against the same `--ground` token the shader
     * was handed, so it cannot drift if the palette changes. The tolerance is
     * wide enough for the accent at its peak — the brightest the field ever
     * gets is roughly ground + 55 per channel — and nowhere near wide enough
     * for the white rectangle a broken canvas paints.
     */
    draw(performance.now());
    const probe = new Uint8Array(4);
    gl.readPixels(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      probe,
    );
    const drew =
      probe[3]! > 0 &&
      ground.every((channel, i) => {
        const expected = channel * 255;
        // The shader's own range, per the colour block above: troughs sink to
        // half the ground, peaks lift roughly 40 above it where the accent
        // surfaces. Anything outside that did not come from this shader — the
        // white rectangle a dead context composites, or the black one a buffer
        // nothing ever wrote.
        return probe[i]! >= expected * 0.35 && probe[i]! <= expected + 96;
      });
    if (!drew) {
      stop();
      conceal();
      return;
    }

    reveal();
    play();

    return () => {
      stop();
      conceal();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer);
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteBuffer(buffer);
      /*
       * Note what is deliberately *not* here: `WEBGL_lose_context.loseContext()`.
       *
       * It was, to free the drawing buffer immediately rather than at GC. It is
       * a trap. React keeps the same <canvas> node across a remount — StrictMode
       * in development, Fast Refresh, a replayed Suspense boundary — and a
       * canvas only ever has one context: `getContext` after `loseContext`
       * returns the same dead one, not a new one. So the effect would tear down
       * the context it was about to need, the second run would get a lost
       * context, nothing would draw, and the canvas would composite as a white
       * rectangle across the entire viewport. Which is exactly what it did.
       *
       * Dropping the canvas is enough: when React really unmounts this tree the
       * node is unreachable and the context goes with it.
       */
    };
  }, []);

  /*
   * A div carries the field; the canvas only paints over it.
   *
   * The canvas used to be the layer itself, with the ground and the fallback
   * gradient as its own CSS background. That does not survive contact with a
   * real browser: once a WebGL context exists, the drawing buffer composites
   * *over* the element's background, so the background is only ever a backup for
   * a canvas that has no context at all — not for one whose context died. A
   * plain element cannot fail that way, so the colour lives on one and the
   * shader is decoration on top of it.
   */
  return (
    <div className="mesh" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}
