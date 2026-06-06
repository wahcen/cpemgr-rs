import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

export type Vendor = "烽火" | "华为" | "中兴" | "鲲鹏" | "联通";

export interface DeviceConfig {
  name: string;
  vendor: Vendor;
  url: string;
  username: string;
  password: string;
  logo: string;
}

export const useDevicesStore = defineStore("devices", () => {
  const devices = ref<DeviceConfig[]>([]);
  const loaded = ref(false);
  const loading = ref(false);

  async function load() {
    if (loaded.value || loading.value) return;
    loading.value = true;
    try {
      const data = await invoke<DeviceConfig[]>("devices_load");
      devices.value = Array.isArray(data) ? data : [];
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function persist() {
    await invoke("devices_save", { devices: devices.value });
  }

  async function add(device: DeviceConfig) {
    devices.value.push(device);
    await persist();
  }

  async function remove(index: number) {
    devices.value.splice(index, 1);
    await persist();
  }

  async function update(index: number, device: DeviceConfig) {
    devices.value.splice(index, 1, device);
    await persist();
  }

  async function duplicate(index: number) {
    const src = devices.value[index];
    if (!src) return;
    devices.value.push({ ...src, name: `${src.name} 副本` });
    await persist();
  }

  async function reorder(next: DeviceConfig[]) {
    devices.value = next;
    await persist();
  }

  async function importFromPath(path: string) {
    const data = await invoke<DeviceConfig[]>("devices_import", { path });
    devices.value = Array.isArray(data) ? data : [];
    loaded.value = true;
  }

  async function exportToPath(path: string) {
    await invoke("devices_export", { path });
  }

  return {
    devices,
    loaded,
    loading,
    load,
    add,
    remove,
    update,
    duplicate,
    reorder,
    importFromPath,
    exportToPath,
  };
});
