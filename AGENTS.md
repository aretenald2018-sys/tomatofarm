# Tomato Project Codex Rules

- Apply all rules in `CLAUDE.md` for this project before making changes.
- Project Root: `C:\Users\USER\Desktop\Tomato Project\tomatofarm(for lite version)`
- Always run `python`, `node`, and `git` commands from the project root.
- Dev Server: Default local server command is `bash scripts/dev-start.sh` from the project root. The script handles port conflicts automatically: it kills only the previous Python http.server on the same port, and falls back to 5501, 5502, ... if another program holds the port.
- After making changes, start the dev server yourself with `bash scripts/dev-start.sh`, verify with `curl`, and report the actual port the script chose. Do NOT tell the user to run the server — you must do it yourself.
- Do NOT run `python -m http.server` directly. Do NOT use `taskkill //F //IM python.exe` or any blanket Python kill — it terminates unrelated Python processes from other projects (e.g. the biz project). The dev-start.sh script handles port reclamation safely.
- CRITICAL: If you modify any file included in `sw.js` `STATIC_ASSETS`, you must bump `CACHE_VERSION` in `sw.js` in the same change.
- Firebase access must go through `data.js`. Do not call Firestore directly from views or feature modules.
- Treat `setDoc` as a full overwrite. Preserve all existing fields, especially photo fields such as `bPhoto`, `lPhoto`, `dPhoto`, `sPhoto`, and `workoutPhoto`.
- Deployment is forbidden for the agent. Do not push or deploy. The user pushes to the `tomatofarm` remote directly after local verification.
- Keep the project in vanilla JavaScript. Do not introduce frameworks, bundlers, or build tooling.
- Final verification must include changed files, the local URL or flow to test, and the exact server command.
