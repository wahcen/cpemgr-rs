import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";

export type ProxyMode = "none" | "system" | "custom";

export interface ProxyConfig {
  mode: ProxyMode;
  url: string;
  username: string;
  password: string;
}

export type ThemeMode = "system" | "light" | "dark";

export interface AppSettings {
  proxy: ProxyConfig;
  theme: ThemeMode;
  minimizeToTrayOnClose: boolean;
}

function defaultProxy(): ProxyConfig {
  return { mode: "none", url: "", username: "", password: "" };
}

function defaultSettings(): AppSettings {
  return { proxy: defaultProxy(), theme: "system", minimizeToTrayOnClose: false };
}

const darkMql =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const wantDark = mode === "dark" || (mode === "system" && !!darkMql?.matches);
  root.classList.toggle("dark", wantDark);
  // 同步给 Element Plus（其支持 html.dark 自动切换主题）
}

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<AppSettings>(defaultSettings());
  const loaded = ref(false);
  const loading = ref(false);

  let mqlListener: ((e: MediaQueryListEvent) => void) | null = null;
  function bindSystemListener() {
    if (!darkMql || mqlListener) return;
    mqlListener = () => {
      if (settings.value.theme === "system") applyTheme("system");
    };
    darkMql.addEventListener?.("change", mqlListener);
  }

  // 主题变更时立即应用到 DOM
  watch(
    () => settings.value.theme,
    (v) => applyTheme(v),
    { immediate: false },
  );

  async function load() {
    if (loaded.value || loading.value) return;
    loading.value = true;
    try {
      const data = await invoke<AppSettings>("settings_load");
      settings.value = {
        proxy: { ...defaultProxy(), ...(data?.proxy ?? {}) },
        theme: data?.theme ?? "system",
        minimizeToTrayOnClose: !!data?.minimizeToTrayOnClose,
      };
      loaded.value = true;
      applyTheme(settings.value.theme);
      bindSystemListener();
    } finally {
      loading.value = false;
    }
  }

  async function saveProxy(next: ProxyConfig) {
    const merged: AppSettings = { ...settings.value, proxy: { ...next } };
    await invoke("settings_save", { settings: merged });
    settings.value = merged;
    loaded.value = true;
  }

  async function setTheme(next: ThemeMode) {
    const merged: AppSettings = { ...settings.value, theme: next };
    await invoke("settings_save", { settings: merged });
    settings.value = merged;
    loaded.value = true;
    applyTheme(next);
    bindSystemListener();
  }

  async function setMinimizeToTrayOnClose(next: boolean) {
    const merged: AppSettings = { ...settings.value, minimizeToTrayOnClose: next };
    await invoke("settings_save", { settings: merged });
    settings.value = merged;
    loaded.value = true;
  }

  return { settings, loaded, loading, load, saveProxy, setTheme, setMinimizeToTrayOnClose };
});
