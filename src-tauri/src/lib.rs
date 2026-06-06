mod fiberhome;
mod settings;
mod storage;

use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_log::{Target, TargetKind};

#[tauri::command]
fn fiberhome_encrypt(plaintext: String, key: String) -> Result<String, String> {
    fiberhome::encrypt_with_key(&plaintext, &key).map_err(|err| err.to_string())
}

#[tauri::command]
fn fiberhome_decrypt(ciphertext_hex: String, key: String) -> Result<String, String> {
    fiberhome::decrypt_with_key(&ciphertext_hex, &key).map_err(|err| err.to_string())
}

#[tauri::command]
fn fiberhome_prepare_post_payload(
    payload: Value,
    sessionid: String,
) -> Result<fiberhome::PreparedPost, String> {
    fiberhome::prepare_post_payload(payload, sessionid).map_err(|err| err.to_string())
}

#[tauri::command]
fn fiberhome_decrypt_response(
    ciphertext_hex: String,
    sessionid: String,
) -> Result<String, String> {
    fiberhome::decrypt_response(&ciphertext_hex, &sessionid).map_err(|err| err.to_string())
}

#[tauri::command]
fn fiberhome_decrypt_response_json(
    ciphertext_hex: String,
    sessionid: String,
) -> Result<Value, String> {
    fiberhome::decrypt_response_json(&ciphertext_hex, &sessionid).map_err(|err| err.to_string())
}

#[tauri::command]
async fn fiberhome_get_sessionid(login_url: String) -> Result<String, String> {
    fiberhome::fetch_sessionid(&login_url)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn fiberhome_get(req: fiberhome::FiberhomeGetRequest) -> Result<String, String> {
    fiberhome::fiberhome_get(req)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn fiberhome_get_json(req: fiberhome::FiberhomeGetRequest) -> Result<Value, String> {
    let body = fiberhome::fiberhome_get(req)
        .await
        .map_err(|err| err.to_string())?;
    serde_json::from_str(&body).map_err(|err| format!("parse response JSON failed: {err}"))
}

#[tauri::command]
async fn fiberhome_post(req: fiberhome::FiberhomePostRequest) -> Result<String, String> {
    fiberhome::fiberhome_post(req)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn fiberhome_post_json(req: fiberhome::FiberhomePostRequest) -> Result<Value, String> {
    let body = fiberhome::fiberhome_post(req)
        .await
        .map_err(|err| err.to_string())?;
    if body.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(&body).map_err(|err| format!("parse response JSON failed: {err}"))
}

#[tauri::command]
fn devices_load(app: AppHandle) -> Result<Value, String> {
    storage::read_devices(&app).map_err(|err| err.to_string())
}

#[tauri::command]
fn devices_save(app: AppHandle, devices: Value) -> Result<(), String> {
    storage::write_devices(&app, &devices).map_err(|err| err.to_string())
}

#[tauri::command]
fn devices_import(app: AppHandle, path: String) -> Result<Value, String> {
    storage::import_from_path(&app, &path).map_err(|err| err.to_string())
}

#[tauri::command]
fn devices_export(app: AppHandle, path: String) -> Result<(), String> {
    storage::export_to_path(&app, &path).map_err(|err| err.to_string())
}

#[tauri::command]
fn settings_load(app: AppHandle) -> Result<settings::AppSettings, String> {
    settings::read_settings(&app).map_err(|err| err.to_string())
}

#[tauri::command]
fn settings_save(app: AppHandle, settings: settings::AppSettings) -> Result<(), String> {
    settings::write_settings(&app, &settings).map_err(|err| err.to_string())?;
    settings::set_proxy_runtime(settings.proxy);
    Ok(())
}

/// 读取应用日志文件尾部，供「开发者选项 → 查看日志」展示。
/// `max_bytes` 限制最多读取的尾部字节数（默认 256KB）。
#[tauri::command]
fn read_log_tail(app: AppHandle, max_bytes: Option<usize>) -> Result<String, String> {
    use std::io::{Read, Seek, SeekFrom};
    let cap = max_bytes.unwrap_or(256 * 1024).max(1024);
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|err| format!("get app log dir failed: {err}"))?;

    // tauri-plugin-log 默认文件名 = app name (来自 tauri.conf.json) + ".log"
    // 这里直接扫描 log_dir 下所有 *.log 找到最新一个
    let mut newest: Option<(std::path::PathBuf, std::time::SystemTime)> = None;
    if let Ok(entries) = std::fs::read_dir(&log_dir) {
        for ent in entries.flatten() {
            let path = ent.path();
            if path.extension().and_then(|s| s.to_str()) != Some("log") {
                continue;
            }
            if let Ok(meta) = ent.metadata() {
                let modified = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
                if newest.as_ref().map(|(_, m)| modified > *m).unwrap_or(true) {
                    newest = Some((path, modified));
                }
            }
        }
    }

    let path = match newest {
        Some((p, _)) => p,
        None => return Ok(String::new()),
    };

    let mut file = std::fs::File::open(&path)
        .map_err(|err| format!("open log file {}: {}", path.display(), err))?;
    let len = file
        .metadata()
        .map_err(|err| format!("stat log file: {err}"))?
        .len();
    let start = len.saturating_sub(cap as u64);
    file.seek(SeekFrom::Start(start))
        .map_err(|err| format!("seek log file: {err}"))?;
    let mut buf = Vec::with_capacity((len - start) as usize);
    file.read_to_end(&mut buf)
        .map_err(|err| format!("read log file: {err}"))?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// 清空当前应用日志文件。
#[tauri::command]
fn clear_log(app: AppHandle) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|err| format!("get app log dir failed: {err}"))?;
    if let Ok(entries) = std::fs::read_dir(&log_dir) {
        for ent in entries.flatten() {
            let path = ent.path();
            if path.extension().and_then(|s| s.to_str()) == Some("log") {
                let _ = std::fs::OpenOptions::new()
                    .write(true)
                    .truncate(true)
                    .open(&path);
            }
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .level(log::LevelFilter::Info)
                .max_file_size(2 * 1024 * 1024) // 2MB rotate
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            settings::init_runtime(&app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fiberhome_encrypt,
            fiberhome_decrypt,
            fiberhome_prepare_post_payload,
            fiberhome_decrypt_response,
            fiberhome_decrypt_response_json,
            fiberhome_get_sessionid,
            fiberhome_get,
            fiberhome_get_json,
            fiberhome_post,
            fiberhome_post_json,
            devices_load,
            devices_save,
            devices_import,
            devices_export,
            settings_load,
            settings_save,
            read_log_tail,
            clear_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
