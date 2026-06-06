use anyhow::{Context, Result};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const DEVICES_FILE: &str = "devices.json";

fn devices_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .context("failed to resolve app data dir")?;
    if !dir.exists() {
        fs::create_dir_all(&dir).with_context(|| format!("create app data dir {:?}", dir))?;
    }
    Ok(dir.join(DEVICES_FILE))
}

pub fn read_devices(app: &AppHandle) -> Result<Value> {
    let path = devices_path(app)?;
    if !path.exists() {
        return Ok(Value::Array(vec![]));
    }
    let raw = fs::read_to_string(&path).with_context(|| format!("read {:?}", path))?;
    if raw.trim().is_empty() {
        return Ok(Value::Array(vec![]));
    }
    let value: Value = serde_json::from_str(&raw).with_context(|| format!("parse {:?}", path))?;
    Ok(value)
}

pub fn write_devices(app: &AppHandle, devices: &Value) -> Result<()> {
    let path = devices_path(app)?;
    let serialized = serde_json::to_string_pretty(devices).context("serialize devices")?;
    fs::write(&path, serialized).with_context(|| format!("write {:?}", path))?;
    Ok(())
}

pub fn import_from_path(app: &AppHandle, src: &str) -> Result<Value> {
    let raw = fs::read_to_string(src).with_context(|| format!("read import file {}", src))?;
    let value: Value = serde_json::from_str(&raw).context("parse import file")?;
    write_devices(app, &value)?;
    Ok(value)
}

pub fn export_to_path(app: &AppHandle, dest: &str) -> Result<()> {
    let value = read_devices(app)?;
    let serialized = serde_json::to_string_pretty(&value).context("serialize devices")?;
    fs::write(dest, serialized).with_context(|| format!("write export file {}", dest))?;
    Ok(())
}
