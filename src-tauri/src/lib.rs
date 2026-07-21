use std::collections::HashMap;
use std::sync::Mutex;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{
    AppHandle, Emitter, Manager, State,
};

#[cfg(target_os = "windows")]
use windows::UI::ViewManagement::{UIColorType, UISettings};

struct WatchRegistry(Mutex<HashMap<String, RecommendedWatcher>>);

#[tauri::command]
fn set_window_title(app: AppHandle, title: String) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_title(&format!("{title} — Z-GL Shadertoy"));
    }
}

#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[tauri::command]
fn open_shader_file(app: AppHandle, path: String) -> Result<(), String> {
    let text = std::fs::read_to_string(&path)
        .map_err(|e| format!("Cannot read \"{path}\": {e}"))?;

    if let Some(win) = app.get_webview_window("main") {
        win.emit("zgl://open-file", serde_json::json!({ "path": path, "text": text }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn watch_file(
    app: AppHandle,
    path: String,
    registry: State<'_, WatchRegistry>,
) -> Result<(), String> {
    use notify::EventKind;
    use std::path::Path;

    let mut map = registry.0.lock().map_err(|e| e.to_string())?;

    if map.contains_key(&path) {
        return Ok(());
    }

    let app_clone = app.clone();
    let path_clone = path.clone();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            match event.kind {
                EventKind::Modify(_) | EventKind::Create(_) => {
                    if let Some(win) = app_clone.get_webview_window("main") {
                        let _ = win.emit(
                            "zgl://file-changed",
                            serde_json::json!({ "path": path_clone }),
                        );
                    }
                }
                _ => {}
            }
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(&path), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    map.insert(path, watcher);
    Ok(())
}

#[tauri::command]
fn unwatch_file(path: String, registry: State<'_, WatchRegistry>) -> Result<(), String> {
    let mut map = registry.0.lock().map_err(|e| e.to_string())?;
    map.remove(&path);
    Ok(())
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Cannot read \"{path}\": {e}"))
}

// WARN-04 — Crash logger offline (écrit dans %APPDATA%\com.zgl.editor\logs\crash.log)
#[tauri::command]
fn log_crash(app: tauri::AppHandle, report: serde_json::Value) -> Result<(), String> {
    use std::io::Write;

    let log_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("z-gl"))
        .join("logs");

    std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;

    let log_path = log_dir.join("crash.log");
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| e.to_string())?;

    let line = format!("{}\n", report);
    file.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

// BUG-08 — Git versioning commands
#[tauri::command]
fn git_diff_file(path: String) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(["diff", "HEAD", "--", &path])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[derive(serde::Serialize)]
struct BlameHunk {
    sha:     String,
    author:  String,
    summary: String,
    line_no: u32,
}

#[tauri::command]
fn git_blame_file(path: String) -> Result<Vec<BlameHunk>, String> {
    let output = std::process::Command::new("git")
        .args(["blame", "--porcelain", "--", &path])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    let text = String::from_utf8_lossy(&output.stdout);
    let mut hunks = Vec::new();
    let mut sha = String::new();
    let mut author = String::new();
    let mut summary = String::new();
    let mut line_no: u32 = 0;
    for line in text.lines() {
        if line.starts_with("author ") && !line.starts_with("author-") {
            author = line[7..].to_owned();
        } else if line.starts_with("summary ") {
            summary = line[8..].to_owned();
        } else if line.len() > 40 && line.chars().next().map(|c| c.is_ascii_hexdigit()).unwrap_or(false) {
            let parts: Vec<&str> = line.splitn(4, ' ').collect();
            if parts.len() >= 3 {
                sha = parts[0][..40.min(parts[0].len())].to_owned();
                line_no = parts[2].parse().unwrap_or(0);
            }
        } else if line.starts_with('\t') {
            hunks.push(BlameHunk { sha: sha.clone(), author: author.clone(), summary: summary.clone(), line_no });
        }
    }
    Ok(hunks)
}

#[tauri::command]
fn get_cli_args() -> Vec<String> {
    std::env::args().collect()
}

#[tauri::command]
fn get_accent_color() -> Option<[u8; 3]> {
    #[cfg(target_os = "windows")]
    {
        let settings = UISettings::new().ok()?;
        let color = settings.GetColorValue(UIColorType::Accent).ok()?;
        Some([color.R, color.G, color.B])
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

/// Wipes all Z-GL user data from disk — called by the uninstaller confirmation
/// dialog (NSIS) and exposed to JS so the Settings page can offer a
/// "Reset everything" option without needing to uninstall.
///
/// Paths removed:
///   %APPDATA%\com.zgl.editor          Tauri store
///   %LOCALAPPDATA%\com.zgl.editor     WebView2 data partition (localStorage, cache)
///
/// The function returns a list of paths that were actually deleted so the
/// caller can log or display them.
#[tauri::command]
fn clear_app_data(app: AppHandle) -> Result<Vec<String>, String> {
    use std::path::PathBuf;

    let mut removed: Vec<String> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    // Resolve well-known directories via Tauri's path API.
    let dirs: Vec<PathBuf> = {
        let mut v = Vec::new();
        if let Ok(p) = app.path().app_data_dir() { v.push(p); }       // %APPDATA%\com.zgl.editor
        if let Ok(p) = app.path().app_local_data_dir() { v.push(p); } // %LOCALAPPDATA%\com.zgl.editor
        if let Ok(p) = app.path().app_cache_dir() { v.push(p); }      // %LOCALAPPDATA%\com.zgl.editor\cache
        if let Ok(p) = app.path().app_log_dir() { v.push(p); }        // logs sub-directory
        v
    };

    for dir in dirs {
        if dir.exists() {
            match std::fs::remove_dir_all(&dir) {
                Ok(_) => removed.push(dir.display().to_string()),
                Err(e) => errors.push(format!("{}: {e}", dir.display())),
            }
        }
    }

    if errors.is_empty() {
        Ok(removed)
    } else {
        Err(errors.join("\n"))
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            set_window_title,
            app_version,
            open_shader_file,
            watch_file,
            unwatch_file,
            read_file_bytes,
            log_crash,
            git_diff_file,
            git_blame_file,
            get_cli_args,
            get_accent_color,
            clear_app_data,
        ])
        .manage(WatchRegistry(Mutex::new(HashMap::new())))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
