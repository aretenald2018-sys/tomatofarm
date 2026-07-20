# Life-zone asset contract

Read this file only for life-zone/NPC/room art work.

## One active implementation

Before editing, inspect active branches and worktrees that touch `home/life-zone*`, `assets/home/life-zone`, its feature CSS, `runtime-assets.js`, or `sw.js`. Continue the existing unfinished life-zone branch for follow-up requirements. Do not create a parallel implementation of the same scene.

## One scene source

The legacy `assets/home/life-zone/manifest.json` is validator-only and is not the runtime SSOT. `home/life-zone-state.js`, `home/life-zone.js`, CSS coordinates, and the manifest already disagree, so adding another entry there does not guarantee a visible result.

Before adding a room, slot, actor, or NPC, establish one runtime-consumed scene contract on the selected active branch. It must own:

- world and renderer metadata;
- actor/NPC IDs, actions, slots, coordinates, sizes, and z-order;
- home, modal, fallback, source, and generated asset references;
- every asset required by runtime precache and Android verification.

The renderer, state assignment, validator, fallback, preview/contact sheet, and runtime asset generation must derive from that contract. Do not keep a second legacy-to-new ID map or duplicate coordinates in CSS; pass layout through scene data and CSS variables.

## Generation and fallback

- Keep reproducible source art separate from runtime-generated files.
- Generate into a temporary directory, validate schema/PNG/atlas output, then replace the destination atomically. A failed build must leave the previous runtime intact.
- Verification is read-only and fails on missing, unreachable, duplicate, or untracked life-zone assets.
- A renderer failure must still show the complete static/DOM scene, including actors and NPC controls. A base-room-only fallback is not complete.

## Visual gate

Use `node scripts/dev-start.mjs` and verify at least 390px and 768px widths. Exercise every actor/NPC/wardrobe/action control, reduced motion, image failure, and forced renderer fallback. Validate the composed scene—not isolated PNG dimensions—and keep screenshots outside tracked source directories.
