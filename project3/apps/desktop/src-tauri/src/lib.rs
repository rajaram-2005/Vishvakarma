// Aetherion desktop — Tauri v2 shell.
// The web app is the product; this shell adds OS integration on top:
// tray, deep links, and local file-system access *through the security gateway*.
use tauri::Manager;

#[tauri::command]
fn sutra_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn system_locale(app: tauri::AppHandle) -> Result<String, String> {
    let w = app.get_webview_window("main").ok_or("no main window")?;
    w.scale_factor().map(|f| format!("{f:.2}")).map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![sutra_version, system_locale])
        .run(tauri::generate_context!())
        .expect("error while running Aetherion desktop");
}
