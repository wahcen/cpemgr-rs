use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{OnceLock, RwLock};
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProxyMode {
    /// 不使用代理（直连）
    None,
    /// 使用系统代理（读取系统环境变量 / 注册表）
    System,
    /// 使用自定义 HTTP/HTTPS 代理
    Custom,
}

impl Default for ProxyMode {
    fn default() -> Self {
        ProxyMode::None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProxyConfig {
    #[serde(default)]
    pub mode: ProxyMode,
    /// custom 模式下使用的代理 URL，例如 http://127.0.0.1:7890
    #[serde(default)]
    pub url: String,
    /// 可选的用户名（custom 模式）
    #[serde(default)]
    pub username: String,
    /// 可选的密码（custom 模式）
    #[serde(default)]
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    /// 跟随系统主题
    System,
    /// 强制浅色
    Light,
    /// 强制深色
    Dark,
}

impl Default for ThemeMode {
    fn default() -> Self {
        ThemeMode::System
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppSettings {
    #[serde(default)]
    pub proxy: ProxyConfig,
    #[serde(default)]
    pub theme: ThemeMode,
}

// ── persistent store ─────────────────────────────────────────────

fn settings_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .context("failed to resolve app data dir")?;
    if !dir.exists() {
        fs::create_dir_all(&dir).with_context(|| format!("create app data dir {:?}", dir))?;
    }
    Ok(dir.join(SETTINGS_FILE))
}

pub fn read_settings(app: &AppHandle) -> Result<AppSettings> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let raw = fs::read_to_string(&path).with_context(|| format!("read {:?}", path))?;
    if raw.trim().is_empty() {
        return Ok(AppSettings::default());
    }
    let value: AppSettings =
        serde_json::from_str(&raw).with_context(|| format!("parse {:?}", path))?;
    Ok(value)
}

pub fn write_settings(app: &AppHandle, settings: &AppSettings) -> Result<()> {
    let path = settings_path(app)?;
    let serialized = serde_json::to_string_pretty(settings).context("serialize settings")?;
    fs::write(&path, serialized).with_context(|| format!("write {:?}", path))?;
    Ok(())
}

// ── runtime cache ────────────────────────────────────────────────

fn proxy_cell() -> &'static RwLock<ProxyConfig> {
    static CELL: OnceLock<RwLock<ProxyConfig>> = OnceLock::new();
    CELL.get_or_init(|| RwLock::new(ProxyConfig::default()))
}

/// 应用启动时调用，把磁盘里保存的配置载入运行时缓存
pub fn init_runtime(app: &AppHandle) {
    if let Ok(settings) = read_settings(app) {
        set_proxy_runtime(settings.proxy);
    }
}

pub fn current_proxy() -> ProxyConfig {
    proxy_cell()
        .read()
        .map(|guard| guard.clone())
        .unwrap_or_default()
}

pub fn set_proxy_runtime(proxy: ProxyConfig) {
    if let Ok(mut guard) = proxy_cell().write() {
        *guard = proxy;
    }
}
