use std::sync::Mutex;

use tauri::{Manager, WindowEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct BackendProcess(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("virtual-company.db");

            let sidecar = app
                .shell()
                .sidecar("virtual-company-backend")?
                .env("AI_TEAM_DB", db_path.to_string_lossy().to_string())
                .env("DESKTOP_BACKEND_PORT", "8765")
                .env(
                    "CORS_ORIGINS",
                    "http://localhost:5173,http://127.0.0.1:5173,http://tauri.localhost,https://tauri.localhost,tauri://localhost",
                );

            let (_events, child) = sidecar.spawn()?;
            *app.state::<BackendProcess>().0.lock().expect("backend state lock poisoned") = Some(child);
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                if let Ok(mut process) = window.state::<BackendProcess>().0.lock() {
                    if let Some(child) = process.take() {
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Virtual Company desktop application");
}
