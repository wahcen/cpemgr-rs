import { invoke } from "@tauri-apps/api/core";

export interface FiberhomePreparedPost {
  sessionid: string;
  key: string;
  body: string;
}

export function fiberhomeEncrypt(plaintext: string, key: string) {
  return invoke<string>("fiberhome_encrypt", { plaintext, key });
}

export function fiberhomeDecrypt(ciphertextHex: string, key: string) {
  return invoke<string>("fiberhome_decrypt", { ciphertextHex, key });
}

export function fiberhomePreparePostPayload(
  payload: Record<string, unknown>,
  sessionid: string,
) {
  return invoke<FiberhomePreparedPost>("fiberhome_prepare_post_payload", {
    payload,
    sessionid,
  });
}

/** 解密返回的 hex 密文为明文字符串 (对应 axios.js decryptFunc). */
export function fiberhomeDecryptResponse(ciphertextHex: string, sessionid: string) {
  return invoke<string>("fiberhome_decrypt_response", { ciphertextHex, sessionid });
}

/** 解密返回的 hex 密文并 JSON.parse. */
export function fiberhomeDecryptResponseJson<T = unknown>(ciphertextHex: string, sessionid: string) {
  return invoke<T>("fiberhome_decrypt_response_json", { ciphertextHex, sessionid });
}

/** 调用 /api/tmp/FHNCAPIS?ajaxmethod=get_refresh_sessionid 获取 token. */
export function fiberhomeGetSessionId(loginUrl: string) {
  return invoke<string>("fiberhome_get_sessionid", { loginUrl });
}

// ── $get / $post 高层封装 ────────────────────────────────────

export interface FiberhomeGetOptions {
  /** 设备登录地址，例如 http://192.168.8.1 */
  loginUrl: string;
  /** ajaxmethod 名称，例如 "get_ip"、"heartbeat" */
  ajaxmethod: string;
  /** true → FHNCAPIS (无需登录的接口)；默认 false 走 FHAPIS */
  nocheck?: boolean;
  /** 超时 (ms)，默认 30000，小于 5000 会被忽略 */
  timeoutMs?: number;
}

export interface FiberhomePostOptions {
  loginUrl: string;
  ajaxmethod: string;
  /** 业务参数，会被包装进 { dataObj } 字段 */
  dataObj?: unknown;
  nocheck?: boolean;
  /** 使用 /api/long/ 长连接路径，默认 false */
  longPath?: boolean;
  timeoutMs?: number;
  contentType?: string;
}

function toGetRequest(opts: FiberhomeGetOptions) {
  return {
    req: {
      login_url: opts.loginUrl,
      ajaxmethod: opts.ajaxmethod,
      nocheck: opts.nocheck ?? false,
      timeout_ms: opts.timeoutMs,
    },
  };
}

function toPostRequest(opts: FiberhomePostOptions) {
  return {
    req: {
      login_url: opts.loginUrl,
      ajaxmethod: opts.ajaxmethod,
      data_obj: opts.dataObj ?? null,
      nocheck: opts.nocheck ?? false,
      long_path: opts.longPath ?? false,
      timeout_ms: opts.timeoutMs,
      content_type: opts.contentType,
    },
  };
}

/** 对应 axios.js `$get(ajaxmethod, checkMode, timeout)` —— 返回原始响应文本. */
export function fiberhomeGet(opts: FiberhomeGetOptions) {
  return invoke<string>("fiberhome_get", toGetRequest(opts));
}

/** 对应 `$get` 并自动 JSON.parse. */
export function fiberhomeGetJson<T = unknown>(opts: FiberhomeGetOptions) {
  return invoke<T>("fiberhome_get_json", toGetRequest(opts));
}

/**
 * 对应 axios.js `$post(ajaxmethod, dataObj, checkMode, longPath, timeout, contentType)`.
 * 内部会自动取 token、加密 payload、解密响应（DO_WEB_LOGIN/LOGOUT 除外）.
 * 返回的是解密后的明文（通常是 JSON 字符串）.
 */
export function fiberhomePost(opts: FiberhomePostOptions) {
  return invoke<string>("fiberhome_post", toPostRequest(opts));
}

/** 同 `fiberhomePost` 但直接 JSON.parse 返回. */
export function fiberhomePostJson<T = unknown>(opts: FiberhomePostOptions) {
  return invoke<T>("fiberhome_post_json", toPostRequest(opts));
}
