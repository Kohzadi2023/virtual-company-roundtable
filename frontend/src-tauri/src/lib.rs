use std::sync::Mutex;

use tauri::{Manager, WindowEvent};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct BackendProcess(Mutex<Option<CommandChild>>);

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let url = url.trim();
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://")) {
        return Err("Only http:// and https:// URLs can be opened.".to_string());
    }

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = std::process::Command::new("rundll32.exe");
        command.arg("url.dll,FileProtocolHandler").arg(url);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = std::process::Command::new("open");
        command.arg(url);
        command
    };

    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = std::process::Command::new("xdg-open");
        command.arg(url);
        command
    };

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    return Err("Opening external URLs is not supported on this platform.".to_string());

    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        command
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Could not open the system browser: {error}"))
    }
}

#[tauri::command]
fn read_clipboard_text(app: tauri::AppHandle) -> Result<String, String> {
    app.clipboard()
        .read_text()
        .map_err(|error| format!("Could not read clipboard text: {error}"))
}

#[tauri::command]
fn write_clipboard_text(app: tauri::AppHandle, text: String) -> Result<(), String> {
    if text.is_empty() {
        return Err("Nothing to copy.".to_string());
    }

    app.clipboard()
        .write_text(text)
        .map_err(|error| format!("Could not write clipboard text: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            open_external_url,
            read_clipboard_text,
            write_clipboard_text
        ])
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
