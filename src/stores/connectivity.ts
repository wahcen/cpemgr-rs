import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { useDevicesStore, type DeviceConfig } from "./devices";
import { fiberhomePost } from "../fiberhome";

export interface ConnectivityEntry {
  /** null=未知, true=通过, false=失败 */
  ok: boolean | null;
  checkedAt: number | null;
  error: string;
  checking: boolean;
}

/** 1 分钟一次 */
const INTERVAL_MS = 60_000;

function deviceKey(d: DeviceConfig, index: number) {
  return `${index}|${d.url}|${d.name}`;
}

export const useConnectivityStore = defineStore("connectivity", () => {
  const entries = reactive<Record<string, ConnectivityEntry>>({});
  const running = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  function key(d: DeviceConfig, index: number) {
    return deviceKey(d, index);
  }

  function get(d: DeviceConfig, index: number): ConnectivityEntry | undefined {
    return entries[deviceKey(d, index)];
  }

  function ensure(k: string): ConnectivityEntry {
    if (!entries[k]) {
      entries[k] = { ok: null, checkedAt: null, error: "", checking: false };
    }
    return entries[k];
  }

  async function checkOne(device: DeviceConfig, index: number) {
    const k = deviceKey(device, index);
    const entry = ensure(k);
    if (entry.checking) return;
    entry.checking = true;
    try {
      const data = await fiberhomePost({
        loginUrl: device.url,
        ajaxmethod: "DO_WEB_LOGIN",
        dataObj: { username: device.username, password: device.password },
      });
      const ok = data.startsWith("0|");
      entry.ok = ok;
      entry.error = ok ? "" : "登录失败（密码错误或被锁定）";
    } catch (err) {
      entry.ok = false;
      entry.error = String(err);
    } finally {
      entry.checkedAt = Date.now();
      entry.checking = false;
    }
  }

  /** 串行检查所有设备（FiberHome 只支持串行请求） */
  async function checkAll() {
    const devicesStore = useDevicesStore();
    for (let i = 0; i < devicesStore.devices.length; i++) {
      await checkOne(devicesStore.devices[i], i);
    }
    pruneStale();
  }

  /** 清理列表里已不存在的设备条目 */
  function pruneStale() {
    const devicesStore = useDevicesStore();
    const live = new Set(devicesStore.devices.map((d, i) => deviceKey(d, i)));
    for (const k of Object.keys(entries)) {
      if (!live.has(k)) delete entries[k];
    }
  }

  /** 启动全局轮询；幂等 */
  function start() {
    if (running.value) return;
    running.value = true;
    // 立即跑一次，再按周期
    void checkAll();
    timer = setInterval(() => {
      void checkAll();
    }, INTERVAL_MS);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    running.value = false;
  }

  return {
    entries,
    running,
    key,
    get,
    checkOne,
    checkAll,
    pruneStale,
    start,
    stop,
  };
});
