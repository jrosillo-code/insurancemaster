# Rosillo AI Platform — Design

**The descent theme.** One dark ground with a slow field moving behind it, one
accent spent only where a person acts or a value is verified, hairlines instead
of shadows, and three faces with three jobs.

The language is farwater's, re-pitched from sea to Rosillo's champagne gold. It
is not a skin over the old design: the material changed from frosted glass over
a cream field to flat surfaces separated by lightness on a near-black ground,
and every contrast pair was re-measured against it.

*SYNTHETIC DATA ONLY. Nothing in this document describes, or should be used to
justify, putting real client data into the prototype.*

---

## 1. Principles

| | |
|---|---|
| **One accent, spent deliberately** | Gold marks where a person acts or where a value has been verified. A page with gold in five places has spent it. |
| **Hairlines carry hierarchy** | No shadows anywhere. On a ground this dark a shadow is invisible, and a hairline says the same thing more precisely. The only `box-shadow` rules left in either app are focus and state rings. |
| **Real product UI is the only imagery** | No stock photography, no isometric robots, no illustration of an AI. What the product does is the picture. |
| **Headings are set, not sentenced** | `h1`/`h2` are uppercase in the condensed face with no terminal full stop, as farwater sets them. A full stop after uppercase condensed type reads as a typo rather than as a cadence. Sentence case with a full stop belongs to the prose beneath. |
| **One filled button per band** | Everything else is a link or an outline. |
| **Phone first** | 16px gutters, and no horizontal scroll at any width, ever. |
| **Nothing conveyed by colour alone** | Every state that has a colour also has a word, a shape or a label. |
| **Progressive** | Everything server-rendered — chrome, headings, prose, forms, the synthetic-data banner — is in the HTML and reads with JavaScript disabled. The chat itself is interactive and needs it. Motion is added on top and removed entirely by `prefers-reduced-motion`. |

---

## 2. Colour

All tokens live in `packages/brand/src/theme.css` and are shared by both apps.

### Grounds

| Token | Value | Use |
|---|---|---|
| `--ground` | `#14120f` | The page. Set on `<html>`, so it reaches the viewport canvas. |
| `--surface` | `#1c1916` | Cards, bubbles, panels. |
| `--surface-2` | `#232019` | Sticky chrome, table heads, and anything content scrolls beneath. |

Surfaces are separated by **lightness, not translucency**. A frosted panel over
near-black is a slightly different near-black; a step up the scale reads.

### Ink and accent

Ratios below are measured against all three grounds; **worst** is the lowest of
the three, which is the number that has to clear the threshold.

| Token | Value | on `--ground` | on `--surface` | on `--surface-2` | worst | Role |
|---|---|---|---|---|---|---|
| `--ink` | `#ece6dc` | 15.06 | 14.10 | 13.09 | **13.09** | Body and headings |
| `--ink-2` | `#b9b1a4` | 8.80 | 8.24 | 7.65 | **7.65** | Secondary prose |
| `--ink-3` | `#948d80` | 5.68 | 5.32 | 4.94 | **4.94** | Labels, captions, placeholders |
| `--accent` | `#c8a45d` | 7.95 | 7.44 | 6.91 | **6.91** | The one accent |
| `--accent-bright` | `#e0bd76` | 10.43 | 9.76 | 9.06 | **9.06** | Hover |
| `--accent-dim` | `#8a7038` | 3.97 | 3.71 | 3.45 | **3.45** | Non-text only |
| `--caution` | `#c89a3c` | 7.25 | 6.79 | 6.30 | **6.30** | Needs a person's attention |
| `--signal` | `#d4590a` | 4.66 | 4.36 | 4.05 | **4.05** | Fills and borders only |
| `--signal-ink` | `#e06a18` | 5.56 | 5.20 | 4.83 | **4.83** | Signal **text** |

`--accent-ink` (`#14120f`, the ground itself) is what sits **on** a gold fill:
7.95:1 on `--accent`, 10.43:1 on `--accent-bright`.

Two of these deserve their history:

- **`--ink-3` was `#8c8579` first.** That measures 5.12 on `--ground` and looks
  fine — but **4.45 on `--surface-2`**, under the 4.5 threshold on exactly the
  surface the densest labels sit on. Measuring against the page background alone
  would have shipped it.
- **`--signal` cannot carry text.** At 4.05 on `--surface-2` it is a fill and a
  border colour; `--signal-ink` is the one for words. Buoy orange is held back
  for safety semantics exactly as farwater holds it — a claim where somebody may
  be hurt, a response-time breach, a refusal. Never decoration, never a chart
  colour.

The brand gold is only usable here because the ground changed. On white it is
**2.35:1** and can never carry text, which is why the old light theme had to
keep a second, muddier gold (`#8a6a24`, 5.04:1 on white) for anything labelled.

### Lines

| Token | Value | worst ratio | Use |
|---|---|---|---|
| `--line` | `#36312a` | 1.26 | Decorative separation: card edges, rules, table borders |
| `--line-strong` | `#4d4640` | 1.75 | Emphasis within a group |
| `--line-control` | `#736a5f` | **3.06** | **Anything that delimits an input** |

WCAG 2.2 SC 1.4.11 asks 3:1 of a control boundary. `--line` does not clear it
and must never be used on an `input`, `select`, `textarea` or `button` border —
a rule the e2e suite enforces by measuring every control on the rendered page
(`tests/e2e/material.spec.ts`).

### The synthetic-data banner

`--banner` is **opaque** `#2a1a0d`, not a tint. A 10% wash was right over a
cream field; over a moving mesh it composites against whatever the shader
happens to be painting, which is neither stable nor under the stylesheet's
control. This is the one element on the page that must be legible at a glance
every single time — it is the notice saying no real client data goes in here —
so it gets a colour of its own. `--caution` on it measures 6.50:1.

---

## 3. Type

Three families, three jobs, all self-hosted.

| Role | Family | Where |
|---|---|---|
| **Display** | Big Shoulders Display (variable) | `h1`, `h2`, `.display`. Uppercase, `line-height: 0.94`. |
| **Narrative** | Spectral 400/600 | Body, prose, anything read as a sentence. 17px / 1.68. |
| **Instrument** | IBM Plex Mono 400/600 | `h3`, references, dates, amounts, state labels, account ids. |

`--sans` maps to **Spectral**, not to the display face. farwater does the same
(`--font-sans: 'Spectral'`) for the same reason: the condensed face is drawn for
three words at 64px, not for a page of Spanish prose. Pointing `--sans` at
`--display` typechecks, builds, and puts every paragraph in the wrong face. The
condensed face is reached through `--display` alone.

**Fonts are vendored, never fetched.** `scripts/vendor-fonts.sh` copies the
latin and latin-ext `woff2` subsets into each app's `public/fonts` with the OFL
licence beside them. This is not only a GDPR preference: the Content-Security-
Policy on both apps is **`font-src 'self'`**, so a Google Fonts URL would be
blocked outright and every heading would silently fall back to a system face.
The `@font-face` rules carry `unicode-range`, so a browser fetches a file only
when a glyph in that range is actually used.

---

## 4. The mesh

`packages/brand/src/Mesh.tsx` — a WebGL gradient field fixed behind the page at
`z-index: -1`. Three octaves of value noise push four palette colours around,
the accent surfaces only where the noise peaks and never above 10%, and a warm
pool follows the pointer. The period is measured in tens of seconds: it should
read as a room with light in it, not as an animation playing.

It is decoration on a tool people use all day, so it is built to be skippable:

- `prefers-reduced-motion: reduce` — never starts.
- No WebGL, no `highp` precision, a shader that will not compile, a context
  already lost — returns quietly. There is no error path a visitor can see.
- Off screen or in a background tab — the loop stops.
- Half resolution, capped at 1× DPR, `powerPreference: 'low-power'`.

**It ships hidden and reveals itself only after it has proved it can draw.** It
renders one frame, reads the centre pixel back, and checks that pixel against
the range the shader can actually produce — then sets `visibility: visible`.
Every other path leaves the CSS field showing: two radial blooms and the ground,
painted on the parent `div`, which is what the design is measured against anyway.

That check exists because four separate defects here rendered *without erroring* —
every shader compiled, `getError` stayed 0, every draw call succeeded:

1. The cleanup called `WEBGL_lose_context.loseContext()`. React keeps the same
   `<canvas>` node across a remount and a canvas only ever has one context, so
   the next mount got the dead one back. An `alpha: false` canvas with a lost
   context composites as **a solid white rectangle over the whole viewport**.
2. The context is now `alpha: true`, so a canvas that fails to draw is
   transparent rather than opaque white.
3. `resize()` set `u_res` only when the canvas *size* changed. On a remount the
   canvas is already the right size but the program is new and its uniforms are
   all zero, so `u_res` stayed `(0, 0)`, `gl_FragCoord.xy / u_res` went
   non-finite, and the field collapsed to one flat brown block.
4. The accent was mixed at 16% plus a 10% pointer pool over three near-identical
   dark stops, which reads as a tint rather than a field. Troughs now sink to
   half the ground; that is what gives it depth.

Nothing on the page depends on the mesh for legibility. Every contrast pair in
§2 is measured against the flat `--ground`, never against the shader.

---

## 5. Motion

Everything is inside `@media (prefers-reduced-motion: no-preference)`, and the
reduce branch collapses all durations to `0.01ms`.

| | |
|---|---|
| Transitions | 200ms `cubic-bezier(0.4, 0, 0.2, 1)` on colour, background, border, opacity, transform |
| Press | `button:active { transform: scale(0.985) }` |
| The mesh | ~60s visual period, paused off-screen and in background tabs |

---

## 6. Shape and space

| Token | Value |
|---|---|
| `--r` | `4px` |
| `--r-lg` | `6px` |
| `--r-frame` | `8px` |
| `--gutter` | `20px` (16px minimum at phone width) |
| `--measure` | `66ch` |

Small radii, following farwater's `--radius: .25rem`. A 14px radius belongs to
a softer design than this one.

---

## 7. What is enforced, and where

A design expressed through a build pipeline is only actually shipped if
something reads the computed value back. `tests/e2e/material.spec.ts` runs
against the **production build** and asserts, from the rendered page:

- the ground is dark — sampled as **painted pixels**, on both apps;
- the mesh is a **field and not a flat rectangle** (checking it is dark does not
  catch a collapsed noise lookup, because a flat brown block is dark);
- the canvas ships hidden and the fallback gradient is on its parent;
- reduced motion never reveals the canvas, and the field is still painted;
- all three faces are same-origin, return 200, are usable, and the narrative and
  display roles are the right way round;
- focus rings survive the build;
- every control boundary clears 3:1;
- nothing is frosted.

That file began as `glass.spec.ts`, asserting the opposite material, because
Lightning CSS collapsed a hand-written `-webkit-backdrop-filter` onto the
unprefixed declaration and Chrome had already dropped the alias — so the
shipped build had no blur at all while the source still read as though it did.
The material changed; the lesson did not.

---

## 8. Don't

- Don't add a shadow. If something needs separating, it needs a hairline or a
  different surface.
- Don't use `--line` on a control border. Use `--line-control`.
- Don't put text on `--signal`. Use `--signal-ink`.
- Don't use `--signal` for anything that is not a safety or refusal semantic.
- Don't point `--sans` at `--display`.
- Don't reference a font CDN. `font-src 'self'` will block it and the page will
  silently degrade.
- Don't rely on the mesh for contrast, ever.
- Don't add a second accent.
