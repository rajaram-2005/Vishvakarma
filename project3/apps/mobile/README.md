# Aetherion Mobile (Expo / React Native)

**The AI control center — not a shrunken desktop.**

What the phone is *for*:

- **Core** — system status (privacy mode, backends, models) at a glance
- **Chat** — stream from the routed model, route decision shown
- **Approvals** — the mobile superpower: whatever your agents want to run
  (terminal, deploy, db write) lands here; *Allow once / Allow session /
  Inspect / Deny* from your pocket. Pending count badges the tab.
- **Guard** — command risk classification + secret scan (location & kind
  only, never the value)
- **Tasks** — quick capture into the same task store the Projects surface
  uses

The full workspace (IDE, RAG editor, workflows, teams, marketplace) stays on
web/desktop — intentionally.

## Run

```bash
cd apps/mobile
npm install
npm start          # Expo Go on your phone
```

**Settings → server URL** (in-app, and `src/lib/api.ts`): point at the
service API on your LAN — `http://<your-machine-ip>:8000`. For Expo Go, use
your LAN IP, not `localhost`. The app only ever talks to that one server.

## Design rules

- Dark `#050510` canvas, glass panels, purple/cyan/magenta accents — same
  universe as web.
- Every destructive decision is a large, labeled button. No swipe-to-delete
  traps.
- Offline = honest: if the API is unreachable, the screen says so; no fake
  data.
