# Future OS Lab

Ten operating-system layout concepts drawn from VR subreddits, developer forums and science fiction, staged in 3D on an IT workstation, a car dashboard and a phone. The Build tab lets you remix any layout or create a new one, save it in your browser, and share it as JSON.

Live: https://joehillthunder.github.io/displayxr-future-os/
Deep links: `#rocinante`, `#sprawl.all`, `#mind.mobile` (layout id, then `it` / `auto` / `mobile` / `all`).

Part of [DisplayXR HQ](https://joehillthunder.github.io/) (Spatial UI/UX wing).

## 3D on Leia displays

- In the **DisplayXR Browser on a Leia display**, the preview is a woven inline-3D scene (`@displayxr/inline3d` 1.45.1, vendored in `vendor/inline3d/`, Apache-2.0): glasses-free 3D with head tracking. Display rig, `virtualDisplayHeight` 0.3 m.
- **Anywhere else** it is the same three.js scene through one camera, with drag-to-look. `?mono` forces this view on a 3D display.
- Each device is a shadow box: its glass is the zero-disparity plane, the layout's back wall sits behind it, and panels float in front or recede.

Tuned for lenticular panels:
- Text-bearing panels stay near the glass, where both eyes agree and type is sharpest. Only bold, soft-edged objects (orbs, radar blips, data towers, the radial wheel's active slice) come far out.
- Depth fog in each layout's own background colour lowers contrast on far layers, which keeps crosstalk ghosts faint. It is re-anchored to the tracked eye distance every frame.
- Glows are soft sprites drawn per eye (no screen-space bloom bleeding across the side-by-side halves).
- Motes at every depth give the eye disparity cues throughout the box.
- Depth slider: scales the scene's depth budget.

Follows `DisplayXR/displayxr-web` `docs/woven-canvas-rules.md`: one session, one persistent canvas that is never remounted, the canvas covered until `firstWoven`, no CSS effects on the canvas or its ancestors, a redraw on every frame (replaying the last good frame on a fallback frame), and `rectCover: 'auto'` on resize.

## Files

- `index.html`: page chrome and styles.
- `app.js`: layout list, details and builder.
- `data.js`: modules, presets and builder vocabularies.
- `stage3d.js`: the 3D stage, the ten layouts in 3D, and the woven and flat paths.

No build step and no keys. Saved layouts live in the viewer's `localStorage`; use Share as JSON to back them up.
