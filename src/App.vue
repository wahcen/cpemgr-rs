<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "@iconify/vue";
import { useSettingsStore } from "./stores/settings";
import { useDevicesStore } from "./stores/devices";
import { useConnectivityStore } from "./stores/connectivity";

const appWindow = getCurrentWindow();
const settingsStore = useSettingsStore();
const devicesStore = useDevicesStore();
const connectivityStore = useConnectivityStore();

onMounted(async () => {
  // 应用启动时立刻加载设置（含主题），无需等待用户进入"我的"页
  settingsStore.load().catch(() => {});
  // 加载设备列表后启动全局连通性检查（1 分钟一次）
  try {
    await devicesStore.load();
  } catch {
    /* 错误由对应页面提示 */
  }
  connectivityStore.start();
});

// 设备列表变动时，清理失效的连通性条目
watch(
  () => devicesStore.devices.map((d, i) => `${i}|${d.url}|${d.name}`).join(","),
  () => connectivityStore.pruneStale(),
);

onUnmounted(() => {
  connectivityStore.stop();
});

function startDrag(event: MouseEvent) {
  if (event.button !== 0) return;
  void appWindow.startDragging();
}

function minimizeWindow() {
  void appWindow.minimize();
}

function closeWindow() {
  void appWindow.close();
}

const tabs = [
  { to: "/", label: "设备概览", icon: "mdi:router-wireless" },
  { to: "/signals", label: "邻区信号", icon: "mdi:signal-cellular-3" },
  { to: "/traffic", label: "流量统计", icon: "mdi:chart-areaspline" },
  { to: "/profile", label: "我的", icon: "mdi:account-circle-outline" },
];
</script>

<template>
  <main class="app-bg relative h-screen w-screen overflow-hidden">
    <header
      class="app-header fixed inset-x-0 top-0 z-30 flex h-[42px] select-none items-center justify-between px-2 pl-3.5 backdrop-blur-lg"
      data-tauri-drag-region
      @mousedown="startDrag"
    >
      <div
        class="flex items-center gap-2 text-[12px] font-extrabold tracking-wider text-slate-700 dark:text-slate-200"
        data-tauri-drag-region
      >
        <span
          class="grid h-[22px] w-[22px] place-items-center rounded-[7px] text-white"
          style="background: linear-gradient(135deg, #2f6bff, #24c8db);"
          data-tauri-drag-region
        >C</span>
        <span data-tauri-drag-region>CPEMGR-RS</span>
      </div>
      <div class="flex gap-1" @mousedown.stop>
        <el-button
          text
          circle
          aria-label="最小化"
          class="!h-7 !w-[34px] !rounded-[9px] !text-slate-500 dark:!text-slate-300"
          @click="minimizeWindow"
        >
          <Icon icon="mdi:window-minimize" width="16" />
        </el-button>
        <el-button
          text
          circle
          aria-label="关闭"
          class="!h-7 !w-[34px] !rounded-[9px] !text-slate-500 hover:!bg-red-500 hover:!text-white dark:!text-slate-300"
          @click="closeWindow"
        >
          <Icon icon="mdi:close" width="16" />
        </el-button>
      </div>
    </header>

    <RouterView />

    <nav
      class="liquid-nav fixed inset-x-3.5 bottom-3.5 z-10 grid grid-cols-4 gap-1.5 rounded-3xl p-2"
      aria-label="主导航"
    >
      <RouterLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="liquid-nav-item flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[12px] font-bold text-slate-600 no-underline transition-colors dark:text-slate-300"
        active-class="liquid-nav-item-active"
      >
        <Icon :icon="tab.icon" width="20" />
        {{ tab.label }}
      </RouterLink>
    </nav>
  </main>
</template>

<style scoped>
/* ── 全局背景 / 头部（主题感知） ────────────────────── */
.app-bg {
  background:
    radial-gradient(circle at top left, rgba(62, 111, 255, 0.16), transparent 32%),
    linear-gradient(180deg, #f8fbff 0%, #eef3f8 100%);
}
:where(html.dark) .app-bg {
  background:
    radial-gradient(circle at top left, rgba(62, 111, 255, 0.22), transparent 36%),
    linear-gradient(180deg, #0b1220 0%, #060a13 100%);
}

.app-header {
  background: rgba(255, 255, 255, 0.85);
}
:where(html.dark) .app-header {
  background: rgba(15, 22, 38, 0.7);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

/* ── Apple Liquid Glass 底部导航 ─────────────────────────── */
.liquid-nav {
  background: rgba(255, 255, 255, 0.38);
  backdrop-filter: saturate(180%) blur(28px);
  -webkit-backdrop-filter: saturate(180%) blur(28px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow:
    0 20px 48px rgba(39, 54, 85, 0.2),
    0 1px 0 rgba(255, 255, 255, 0.95) inset,
    0 -1px 0 rgba(255, 255, 255, 0.3) inset;
  position: fixed;
}

.liquid-nav::before {
  content: "";
  position: absolute;
  inset: 1px 1px auto 1px;
  height: 45%;
  border-radius: 22px 22px 0 0;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.62) 0%,
    rgba(255, 255, 255, 0) 100%
  );
  pointer-events: none;
}

.liquid-nav-item {
  position: relative;
  z-index: 1;
  border-radius: 9999px;
  transition: color 0.2s ease, background-color 0.25s ease;
}

.liquid-nav-item:hover {
  color: #1f2937;
}

/* 选中态：药丸形 + 灰色半透明背景，无任何阴影 */
.liquid-nav-item-active {
  color: #2f6bff !important;
  background: rgba(120, 130, 150, 0.18);
  box-shadow: none;
}

/* 深色玻璃 */
:where(html.dark) .liquid-nav {
  background: rgba(28, 32, 44, 0.45);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow:
    0 20px 48px rgba(0, 0, 0, 0.5),
    0 1px 0 rgba(255, 255, 255, 0.2) inset,
    0 -1px 0 rgba(0, 0, 0, 0.45) inset;
}
:where(html.dark) .liquid-nav::before {
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.18) 0%,
    rgba(255, 255, 255, 0) 100%
  );
}
:where(html.dark) .liquid-nav-item:hover {
  color: #f1f5f9;
}
:where(html.dark) .liquid-nav-item-active {
  color: #8ab4ff !important;
  background: rgba(200, 210, 230, 0.14);
  box-shadow: none;
}
</style>
