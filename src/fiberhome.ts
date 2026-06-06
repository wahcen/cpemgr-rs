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

// ── 设备状态 / 概览信息 ────────────────────────────────────────

/** 设备状态字段映射（XML 节点路径），与 FiberHome get_value_by_xmlnode 协议对应. */
export const DEVICE_STATUS_NODES = {
  SerialNumber: "DeviceInfo.SerialNumber",
  SoftwareVersion: "DeviceInfo.SoftwareVersion",
  HardwareVersion: "DeviceInfo.HardwareVersion",
  IPInterfaceIPAddress:
    "LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress",
  CPUUsage: "DeviceInfo.ProcessStatus.CPUUsage",
  MemoryTotal: "DeviceInfo.MemoryStatus.Total",
  MemoryFree: "DeviceInfo.MemoryStatus.Free",
  ModelName: "DeviceInfo.ModelName",
  mobileSoftversion: "DeviceInfo.MobileModuleSoftwareVersion",
  Modem5GTemperature: "X_FH_MobileNetwork.Temperature.Modem5GTemperature",
} as const;

export interface DeviceStatusRaw {
  SerialNumber?: string;
  SoftwareVersion?: string;
  HardwareVersion?: string;
  IPInterfaceIPAddress?: string;
  CPUUsage?: string;
  MemoryTotal?: string;
  MemoryFree?: string;
  ModelName?: string;
  mobileSoftversion?: string;
  Modem5GTemperature?: string;
}

export interface DeviceStatus {
  raw: DeviceStatusRaw;
  serialNumber: string;
  softwareVersion: string;
  hardwareVersion: string;
  modelName: string;
  mobileSoftVersion: string;
  ipAddress: string;
  /** CPU 使用率，单位 %，无数据时为 null */
  cpuUsage: number | null;
  /** 内存总量 (KB)，无数据时为 null */
  memoryTotalKb: number | null;
  /** 内存空闲 (KB)，无数据时为 null */
  memoryFreeKb: number | null;
  /** 内存使用率，单位 %，无数据时为 null */
  memoryUsage: number | null;
  /** 5G 模组温度 (摄氏度)，无数据时为 null */
  temperatureC: number | null;
}

function toNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeStatus(raw: DeviceStatusRaw): DeviceStatus {
  const total = toNumber(raw.MemoryTotal);
  const free = toNumber(raw.MemoryFree);
  const memoryUsage =
    total && total > 0 && free !== null
      ? Math.max(0, Math.min(100, ((total - free) / total) * 100))
      : null;
  const tempRaw = toNumber(raw.Modem5GTemperature);
  return {
    raw,
    serialNumber: raw.SerialNumber ?? "",
    softwareVersion: raw.SoftwareVersion ?? "",
    hardwareVersion: raw.HardwareVersion ?? "",
    modelName: raw.ModelName ?? "",
    mobileSoftVersion: raw.mobileSoftversion ?? "",
    ipAddress: raw.IPInterfaceIPAddress ?? "",
    cpuUsage: toNumber(raw.CPUUsage),
    memoryTotalKb: total,
    memoryFreeKb: free,
    memoryUsage,
    // 烽火返回的温度单位是 m°C（毫摄氏度），除以 1000 转换为摄氏度
    temperatureC: tempRaw === null ? null : tempRaw / 1000,
  };
}

/**
 * 拉取设备概览状态（通过 get_value_by_xmlnode）.
 * 返回标准化后的字段（包含计算好的内存使用率）.
 */
export async function fetchDeviceStatus(
  loginUrl: string,
  timeoutMs?: number,
): Promise<DeviceStatus> {
  const raw = await fiberhomePostJson<DeviceStatusRaw>({
    loginUrl,
    ajaxmethod: "get_value_by_xmlnode",
    dataObj: { ...DEVICE_STATUS_NODES },
    timeoutMs,
  });
  return normalizeStatus(raw ?? {});
}
