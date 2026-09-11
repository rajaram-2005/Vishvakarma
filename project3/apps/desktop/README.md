# Aetherion Desktop (Tauri v2)

A thin, secure shell around the Aetherion web app — the desktop is **not** a
re-implementation. Tauri v2 (Rust) gives: native window, CSP-locked webview
(only `localhost` origins for API calls), tray, deep links, and OS-level
integration while the security gateway in the app keeps every dangerous
action behind a human approval.

## Layout

```
apps/desktop/
├── package.json            # @tauri-apps/cli + api
└── src-tauri/
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json     # window, CSP, bundle config
    ├── capabilities/default.json
    └── src/{main.rs,lib.rs}
```

## Build

Requires Rust (stable) + the platform webview (WebKit on macOS/Linux, WebView2 on Windows):

```bash
cd apps/desktop
npm install
cargo tauri dev      # dev: web on :3000, hot reload
cargo tauri build    # installers: .dmg / .app / .msi / .deb / .AppImage
```

> This scaffold is code-complete for `tauri build`; it is not compiled in
> CI here (no Rust toolchain). The window loads `apps/web` — run the web
> surface first (`npm run dev` in `apps/web`).

## Window

- 1440×900 default, min 1024×700, background `#050510` (Aetherion dark)
- CSP: `connect-src 'self' http://localhost:*` — the desktop webview can
  only talk to local services (Ollama, service API), matching local-mode
  privacy.
