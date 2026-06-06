mod fiberhome;
mod storage;

use serde_json::Value;
use tauri::AppHandle;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            devices_export
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
