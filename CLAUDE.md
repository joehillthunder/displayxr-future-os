# CLAUDE.md: Future OS Lab (displayxr-future-os)

Ten future operating-system layouts, staged in 3D on an IT workstation, a car dashboard and a phone, with a builder for new ones. It renders glasses-free 3D on Leia displays through DisplayXR. Live at https://joehillthunder.github.io/displayxr-future-os/ (GitHub Pages serves `main` from the repo root). It is a room in DisplayXR HQ (`joehillthunder/joehillthunder.github.io`, Spatial UI/UX wing), and HQ only links here.

## Files
- `index.html`: page chrome, all CSS, the import map, the stage markup (canvas, cover, HUD).
- `app.js`: layout list, details panel, builder, full-screen HUD, keyboard, click handling, deep links (`#<layoutId>.<it|auto|mobile|all>`).
- `data.js`: `LIB` (modules per device), `PRESETS` (the ten layouts), `ARCH` (layout engines), `FONTS`, `INPUTS`.
- `stage3d.js`: the three.js stage. `A.<archetype>(c)` builds one layout inside one device; `buildDevice` builds the shadow box and hardware; `createStage` owns the renderer, the woven and flat paths, and interaction.
- `vendor/inline3d/`: `@displayxr/inline3d` 1.45.1, vendored (Apache-2.0, same copy as HQ). three.js 0.161.0 comes from jsDelivr via the import map.

No build step, no keys, no server code. Custom layouts live in the viewer's `localStorage` (`future-os-lab.layouts`).

## DisplayXR rules this code depends on
Read `DisplayXR/displayxr-web` `docs/woven-canvas-rules.md` before touching the canvas, its ancestors, or anything layered over it. In short:
- One `createInline3D()` session and one canvas for the life of the page. Never remount `#os3d`; swap content inside it (`stage.show` rebuilds the scene graph, not the canvas).
- `#os3d` gets no border, radius, shadow, opacity, filter or transform, and neither do its ancestors. `will-change: transform` comes from the stylesheet.
- The cover stays on top until `handle.firstWoven`, and comes off as a hard cut. Resizes, including full screen, are covered by `rectCover: 'auto'`.
- Draw on every `onFrame`. On a short view list or a bad viewport, replay the last good frame (`drawGood`) instead of clearing.
- Anything over the canvas (`.hud`, `.hud-hint`, the toast) is smaller than the canvas, uses a plain `rgba()` tint, never `backdrop-filter`, and carries `data-inline3d-overlay`.
- No sticky or moving ancestor while woven: `.woven .stage-wrap` and `.dxr-immersive .stage-wrap` are `position: static`.
- The SBS backing store is sized within `MAX_TEXTURE_SIZE`, `MAX_RENDERBUFFER_SIZE` and `MAX_VIEWPORT_DIMS`.

## Leia tuning (keep it when adding layouts)
- Units are device units: glass at `z = 0`, +z toward the viewer, back wall at `-D`. `frame()` fits the devices to a 0.3 m virtual display; `depthRoot` squashes depth into the `depth × VDH` budget.
- Text-bearing panels stay near the glass (about `0.02 H` to `0.06 H`). Only bold, soft-edged objects (orbs, blips, towers, the active wedge) come far out. Crosstalk ghosting scales with contrast × edge sharpness × distance from the glass.
- Glows are additive sprites drawn per eye (`glow()`), never a screen-space post pass: it would bleed across the two eye halves.
- Depth fog uses the layout's background colour. In woven mode it is re-anchored to the tracked eye distance every frame.
- `PointsMaterial.size` ignores parent scale; `frame()` rescales motes from `userData.baseSize`.

## Interaction model
- Drag rotates the `spin` group (yaw ±1.1 rad, pitch ±0.6 rad, with momentum). Wheel zooms in full screen only (inline, it scrolls the page) or with Ctrl. Two-finger pinch zooms.
- Click: `pickAt` raycasts from `cam` (flat) or `pickCam` (woven: the midpoint of the two tracked eyes). The nearest object with `userData.pick.key` wins; otherwise the device (`key: null`). Points and sprites are skipped.
- Tag new clickable things with `pickable(c, obj, key, lift)`. Tiles from `tile()` are tagged automatically.
- A picked module becomes the spotlight: `buildDevice` moves `opts.focus[dev]` to index 0, and every archetype gives index 0 the hero spot. `opts.detail` adds the detail card (`detailCard`) with a scrim; both carry the key `__close`.
- First click on the inline stage enters immersive mode (`requestFullscreen` on `#stage`, with a CSS fallback). In "All three", a click opens that device on its own.

## Adding a layout engine
1. Add `ARCH.<id>` in `data.js` and `A.<id> = (c) => { … }` in `stage3d.js`. Start with `backdrop(c)`; build into `c.g`.
2. Give `c.mods[0]` the hero spot, use `tile()` or tag with `pickable()`, and push per-frame motion to `c.anim` (gate it on `c.motion`).
3. Check it on all three devices (`c.tall` is the phone) and in "All three".

## Testing on this PC
- Node 24 is installed. Serve the repo with a tiny static server (any port except 8765, the Muse bridge, and 8791, Battle School). Use `127.0.0.1`/`localhost`; module scripts need HTTP, not `file://`.
- Screenshot with headless Edge: `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1500,950 --virtual-time-budget=16000 --screenshot=…`, launched with PowerShell `Start-Process -Wait` and its own `--user-data-dir`. Deep links pick the layout and device.
- Give the budget at least 16 s when a test triggers a rebuild: the fly-in runs about 2 s, and an earlier capture shows panels still behind the back wall.
- `--dump-dom` does not run animation frames, so anything driven by the render loop reads as stale there.
- Headless has no DisplayXR session, so it only checks the flat path. Real 3D needs the DisplayXR Browser on the Leia panel; ask the user to look. `?mono` forces the flat path on the panel.

## Git
- Commit straight to `main` here (single-app repo); Pages redeploys in about a minute. Changes to the HQ room (`home/demos.js`, `home/office.js` in the HQ repo) go through a PR there, from a worktree, per that repo's CLAUDE.md.
- End commit messages with the Co-Authored-By trailer.
