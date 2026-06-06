use aes::Aes128;
use anyhow::{anyhow, Context, Result};
use cbc::{Decryptor, Encryptor};
use cipher::{block_padding::Pkcs7, BlockModeDecrypt, BlockModeEncrypt, KeyIvInit};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

use crate::settings::{current_proxy, ProxyMode};

type Aes128CbcEnc = Encryptor<Aes128>;
type Aes128CbcDec = Decryptor<Aes128>;

const IV: [u8; 16] = [
    112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127,
];

const REQUEST_PATH: &str = "/api/tmp/";
const REQUEST_LONG_PATH: &str = "/api/long/";
const LOGINOUT_PATH: &str = "/api/sign/";
const REQUEST_CHECK_APIS: &str = "FHAPIS";
const REQUEST_NO_CHECK_API: &str = "FHNCAPIS";
const GET_SESSION_AJAX_METHOD: &str = "get_refresh_sessionid";

#[derive(Debug, Serialize)]
pub struct PreparedPost {
    pub sessionid: String,
    pub key: String,
    pub body: String,
}

#[derive(Debug, Deserialize)]
struct SessionResponse {
    sessionid: String,
}

// ── public parameter types ──────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct FiberhomeGetRequest {
    pub login_url: String,
    pub ajaxmethod: String,
    /// true → FHNCAPIS (no-check); false → FHAPIS (check); "heartbeat" method auto-overrides.
    #[serde(default)]
    pub nocheck: bool,
    /// timeout in milliseconds (default 30000)
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct FiberhomePostRequest {
    pub login_url: String,
    pub ajaxmethod: String,
    pub data_obj: Option<Value>,
    #[serde(default)]
    pub nocheck: bool,
    #[serde(default)]
    pub long_path: bool,
    pub timeout_ms: Option<u64>,
    pub content_type: Option<String>,
}

// ── crypto primitives ───────────────────────────────────────────────

pub fn derive_key(sessionid: &str) -> Result<[u8; 16]> {
    let key = sessionid
        .as_bytes()
        .get(..16)
        .ok_or_else(|| anyhow!("sessionid must be at least 16 bytes"))?;
    key.try_into()
        .map_err(|_| anyhow!("sessionid key derivation failed"))
}

fn parse_key(key: &str) -> Result<[u8; 16]> {
    key.as_bytes()
        .try_into()
        .map_err(|_| anyhow!("AES key must be exactly 16 bytes"))
}

pub fn encrypt_with_key(plaintext: &str, key: &str) -> Result<String> {
    let key = parse_key(key)?;
    let mut buffer = plaintext.as_bytes().to_vec();
    let block_size = 16;
    let msg_len = buffer.len();
    let padded_len = ((msg_len / block_size) + 1) * block_size;
    buffer.resize(padded_len, 0);

    let ciphertext = Aes128CbcEnc::new(&key.into(), &IV.into())
        .encrypt_padded::<Pkcs7>(&mut buffer, msg_len)
        .map_err(|err| anyhow!("encrypt failed: {err}"))?;

    Ok(hex::encode(ciphertext))
}

pub fn decrypt_with_key(ciphertext_hex: &str, key: &str) -> Result<String> {
    let key = parse_key(key)?;
    let mut buffer = hex::decode(ciphertext_hex).context("invalid hex")?;

    let plaintext = Aes128CbcDec::new(&key.into(), &IV.into())
        .decrypt_padded::<Pkcs7>(&mut buffer)
        .map_err(|err| anyhow!("decrypt failed: {err}"))?;

    String::from_utf8(plaintext.to_vec()).context("invalid utf-8")
}

/// Decrypt a hex-encoded AES-CBC response payload using a sessionid.
/// Mirrors `decryptFunc(a, key.substring(0,16), iv)` in axios.js.
pub fn decrypt_response(ciphertext_hex: &str, sessionid: &str) -> Result<String> {
    let key = String::from_utf8(derive_key(sessionid)?.to_vec())
        .context("sessionid key is not utf-8")?;
    decrypt_with_key(ciphertext_hex, &key)
}

/// Decrypt and parse JSON. Convenience for `JSON.parse(decryptFunc(...))`.
pub fn decrypt_response_json(ciphertext_hex: &str, sessionid: &str) -> Result<Value> {
    let plain = decrypt_response(ciphertext_hex, sessionid)?;
    serde_json::from_str(&plain).context("response is not valid JSON")
}

pub fn prepare_post_payload(mut payload: Value, sessionid: String) -> Result<PreparedPost> {
    let object = payload
        .as_object_mut()
        .ok_or_else(|| anyhow!("payload must be a JSON object"))?;
    object.insert("sessionid".to_string(), Value::String(sessionid.clone()));

    let key = String::from_utf8(derive_key(&sessionid)?.to_vec())
        .context("sessionid key is not utf-8")?;
    let plaintext = serde_json::to_string(&payload).context("json encode failed")?;
    let body = encrypt_with_key(&plaintext, &key)?;

    Ok(PreparedPost {
        sessionid,
        key,
        body,
    })
}

// ── HTTP helpers ────────────────────────────────────────────────────

fn build_client(timeout_secs: u64) -> Result<Client> {
    let mut builder = Client::builder()
        .cookie_store(true)
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(timeout_secs));

    // Apply proxy config from app settings.
    // - None   → 显式禁用代理（忽略系统环境变量）
    // - System → 让 reqwest 走默认行为（读取 HTTP_PROXY / HTTPS_PROXY / 系统设置）
    // - Custom → 使用用户配置的代理 URL
    let proxy_cfg = current_proxy();
    match proxy_cfg.mode {
        ProxyMode::None => {
            builder = builder.no_proxy();
        }
        ProxyMode::System => {
            // reqwest 默认会从 env / 平台 API 读取系统代理，无需额外设置
        }
        ProxyMode::Custom => {
            let url = proxy_cfg.url.trim();
            if url.is_empty() {
                return Err(anyhow!("custom proxy URL is empty"));
            }
            let mut proxy =
                reqwest::Proxy::all(url).with_context(|| format!("invalid proxy URL {url}"))?;
            if !proxy_cfg.username.is_empty() || !proxy_cfg.password.is_empty() {
                proxy = proxy.basic_auth(&proxy_cfg.username, &proxy_cfg.password);
            }
            builder = builder.proxy(proxy);
        }
    }

    builder.build().context("build http client failed")
}

/// Default FiberHome request headers (matching axios defaults).
fn default_headers() -> reqwest::header::HeaderMap {
    let mut h = reqwest::header::HeaderMap::new();
    h.insert(
        reqwest::header::HeaderName::from_static("x-requested-with"),
        reqwest::header::HeaderValue::from_static("XMLHttpRequest"),
    );
    h.insert(
        reqwest::header::HeaderName::from_static("user-agent"),
        reqwest::header::HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"),
    );
    h.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static(
            "application/json, text/javascript, */*; q=0.01",
        ),
    );
    h
}

/// Normalize a device login address into a base URL (scheme + host[:port]).
/// Accepts `192.168.8.1`, `http://192.168.8.1`, `http://192.168.8.1/api/`, etc.
pub fn normalize_base_url(input: &str) -> Result<String> {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(anyhow!("login address is empty"));
    }
    let with_scheme = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };
    let parsed = reqwest::Url::parse(&with_scheme).context("invalid login URL")?;
    let host = parsed
        .host_str()
        .ok_or_else(|| anyhow!("login URL missing host"))?;
    let mut base = format!("{}://{}", parsed.scheme(), host);
    if let Some(port) = parsed.port() {
        base.push(':');
        base.push_str(&port.to_string());
    }
    Ok(base)
}

fn rand_marker() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("0.{nanos}")
}

// ── session token ───────────────────────────────────────────────────

/// Fetch a fresh sessionid from a FiberHome CPE.
/// Mirrors `getToken()` in axios.js — GET `/api/tmp/FHNCAPIS?ajaxmethod=get_refresh_sessionid`.
/// Uses the supplied `client` so cookies carry over to subsequent requests.
async fn fetch_sessionid_with_client(client: &Client, login_url: &str) -> Result<String> {
    let base = normalize_base_url(login_url)?;
    let url = format!(
        "{base}{REQUEST_PATH}{REQUEST_NO_CHECK_API}?ajaxmethod={GET_SESSION_AJAX_METHOD}&_={ts}",
        ts = rand_marker()
    );

    let resp = client
        .get(&url)
        .headers(default_headers())
        .send()
        .await
        .with_context(|| format!("request {url}"))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!("get_refresh_sessionid HTTP {status}: {body}"));
    }

    let body = resp.text().await.context("read response body")?;
    let parsed: SessionResponse =
        serde_json::from_str(&body).with_context(|| format!("parse session response: {body}"))?;
    if parsed.sessionid.is_empty() {
        return Err(anyhow!("empty sessionid in response: {body}"));
    }
    Ok(parsed.sessionid)
}

/// Standalone sessionid fetch (creates its own client).
pub async fn fetch_sessionid(login_url: &str) -> Result<String> {
    let client = build_client(30)?;
    fetch_sessionid_with_client(&client, login_url).await
}

// ── $get ────────────────────────────────────────────────────────────

/// Mirrors `$get(ajaxmethod, checkMode, timeout)` from axios.js.
/// Returns the raw response body (JSON string).
pub async fn fiberhome_get(req: FiberhomeGetRequest) -> Result<String> {
    let base = normalize_base_url(&req.login_url)?;
    let timeout = req.timeout_ms.unwrap_or(30000).max(5000);
    let client = build_client((timeout / 1000).max(5))?;

    let (path, params) = if req.ajaxmethod == "heartbeat" {
        // heartbeat uses bare /api/tmp/heartbeat with no ajaxmethod param
        let path = format!("{base}{}heartbeat", REQUEST_PATH);
        let params = json!({ "_": rand_marker() });
        (path, params)
    } else {
        let api = if req.nocheck {
            REQUEST_NO_CHECK_API
        } else {
            REQUEST_CHECK_APIS
        };
        let path = format!("{base}{REQUEST_PATH}{api}");
        let params = json!({
            "ajaxmethod": req.ajaxmethod,
            "_": rand_marker()
        });
        (path, params)
    };

    let resp = client
        .get(&path)
        .headers(default_headers())
        .query(&params)
        .send()
        .await
        .with_context(|| format!("$get {path}"))?;

    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(anyhow!("$get HTTP {status}: {body}"));
    }
    Ok(body)
}

// ── $post ───────────────────────────────────────────────────────────

/// Mirrors `$post(ajaxmethod, dataObj, checkMode, longPath, timeout, contentType)`.
///
/// Internally fetches a token, encrypts the payload with `sessionid[:16]`,
/// POSTs to the correct endpoint, and decrypts the response (unless it's a
/// login/logout call). Uses a shared cookie jar so the CPE session persists.
pub async fn fiberhome_post(req: FiberhomePostRequest) -> Result<String> {
    let base = normalize_base_url(&req.login_url)?;
    let timeout = req.timeout_ms.unwrap_or(30000).max(5000);
    let client = build_client((timeout / 1000).max(5))?;

    // 1. Get token + session cookie
    let sessionid = fetch_sessionid_with_client(&client, &req.login_url).await?;

    // 2. Determine URL path (mirrors $post logic)
    let (path_prefix, api_segment) =
        if req.ajaxmethod == "DO_WEB_LOGIN" || req.ajaxmethod == "DO_WEB_LOGOUT" {
            (LOGINOUT_PATH.to_string(), req.ajaxmethod.clone())
        } else {
            let prefix = if req.long_path {
                REQUEST_LONG_PATH.to_string()
            } else {
                REQUEST_PATH.to_string()
            };
            let api = if req.nocheck {
                REQUEST_NO_CHECK_API.to_string()
            } else {
                REQUEST_CHECK_APIS.to_string()
            };
            (prefix, api)
        };
    let url = format!("{base}{path_prefix}{api_segment}?_{}", rand_marker());

    // 3. Build the payload object. Order must match axios.js so any signature
    //    check that depends on serialization order passes:
    //      $post:                 g.dataObj = b; g.ajaxmethod = a;
    //      complatePostConfig:    d.sessionid = c;  ← appended last
    //    Result on the wire: {"dataObj":...,"ajaxmethod":...,"sessionid":...}
    let data_obj_value = req.data_obj.unwrap_or(Value::Null);
    let mut payload = serde_json::Map::new();
    payload.insert("dataObj".to_string(), data_obj_value);
    payload.insert(
        "ajaxmethod".to_string(),
        Value::String(req.ajaxmethod.clone()),
    );
    payload.insert("sessionid".to_string(), Value::String(sessionid.clone()));
    let payload = Value::Object(payload);

    log::info!(
        target: "fiberhome::post",
        "→ {} {} | plaintext payload: {}",
        req.ajaxmethod,
        url,
        payload
    );

    // 4. Encrypt payload with sessionid[:16]
    let key = String::from_utf8(derive_key(&sessionid)?.to_vec())
        .context("sessionid key is not utf-8")?;
    let plaintext = serde_json::to_string(&payload).context("json encode failed")?;
    let body = encrypt_with_key(&plaintext, &key)?;

    // 5. POST the encrypted hex body
    let content_type = req
        .content_type
        .unwrap_or_else(|| "application/json; charset=utf-8".into());

    let resp = client
        .post(&url)
        .headers(default_headers())
        .header(reqwest::header::CONTENT_TYPE, content_type)
        .body(body.clone())
        .send()
        .await
        .with_context(|| format!("$post {url}"))?;

    let status = resp.status();
    let resp_body = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        log::warn!(
            target: "fiberhome::post",
            "← {} HTTP {} body={}",
            req.ajaxmethod, status, resp_body
        );
        return Err(anyhow!("$post HTTP {status}: {resp_body}"));
    }

    // 6. Decrypt response if needed (skip for login/logout)
    let is_login_or_logout = req.ajaxmethod == "DO_WEB_LOGIN"
        || req.ajaxmethod == "DO_WEB_LOGOUT"
        || url.contains(LOGINOUT_PATH);

    if is_login_or_logout {
        log::info!(
            target: "fiberhome::post",
            "← {} (login/logout, plain) {}",
            req.ajaxmethod, resp_body
        );
        Ok(resp_body)
    } else {
        // response body is hex-encoded ciphertext
        let decrypted = decrypt_response(&resp_body, &sessionid)?;
        log::info!(
            target: "fiberhome::post",
            "← {} decrypted: {}",
            req.ajaxmethod, decrypted
        );
        Ok(decrypted)
    }
}
