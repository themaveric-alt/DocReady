#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{path::PathBuf, sync::Mutex};
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
#[derive(Default)]
struct Incoming(Mutex<Option<PathBuf>>);
#[derive(serde::Serialize)]
struct PdfFile { name: String, bytes: Vec<u8> }
fn accept(app: &tauri::AppHandle, paths: impl Iterator<Item = PathBuf>) {
    if let Some(path) = paths.filter(|p| p.extension().is_some_and(|s| s.eq_ignore_ascii_case("pdf"))).next() {
        *app.state::<Incoming>().0.lock().unwrap() = Some(path);
        let _ = app.emit("pdf-available", ());
    }
}
#[tauri::command]
async fn take_launch_pdf(state: State<'_, Incoming>) -> Result<Option<PdfFile>, String> {
    let path = state.0.lock().map_err(|_| "Could not open launch file.")?.take();
    let Some(path) = path else { return Ok(None); };
    let info = std::fs::metadata(&path).map_err(|_| "The selected PDF is unavailable.")?;
    if !info.is_file() || info.len() > 80 * 1024 * 1024 { return Err("Choose a PDF up to 80 MB.".into()); }
    let bytes = std::fs::read(&path).map_err(|_| "Could not read the selected PDF.")?;
    if !bytes.iter().take(1024).copied().collect::<Vec<_>>().windows(5).any(|w| w == b"%PDF-") { return Err("The selected file is not a PDF.".into()); }
    Ok(Some(PdfFile { name: path.file_name().unwrap_or_default().to_string_lossy().into_owned(), bytes }))
}
#[tauri::command]
async fn save_pdf(app: tauri::AppHandle, name: String, bytes: Vec<u8>) -> Result<bool, String> {
    if bytes.len() > 180 * 1024 * 1024 || !bytes.starts_with(b"%PDF-") { return Err("Invalid PDF output.".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = app.dialog().file().add_filter("PDF", &["pdf"]).set_file_name(name).blocking_save_file() else { return Ok(false); };
        let path = path.into_path().map_err(|_| "Choose a local output file.")?;
        std::fs::write(path, bytes).map_err(|_| "Could not save this PDF. Check disk space and permissions.")?;
        Ok(true)
    }).await.map_err(|_| "The save operation stopped.".to_string())?
}
fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            accept(app, args.into_iter().skip(1).map(PathBuf::from));
            if let Some(window) = app.get_webview_window("main") { let _ = window.set_focus(); }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(Incoming::default())
        .setup(|app| { accept(app.handle(), std::env::args_os().skip(1).map(PathBuf::from)); Ok(()) })
        .invoke_handler(tauri::generate_handler![take_launch_pdf, save_pdf])
        .build(tauri::generate_context!()).expect("Could not start DocReady");
    app.run(|app, event| {
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = event { accept(app, urls.into_iter().filter_map(|url| url.to_file_path().ok())); }
        #[cfg(not(any(target_os = "macos", target_os = "ios")))]
        let _ = (app, event);
    });
}
