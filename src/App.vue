<script setup lang="ts">
import { onMounted } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "@iconify/vue";
import { useSettingsStore } from "./stores/settings";

const appWindow = getCurrentWindow();
const settingsStore = useSettingsStore();

onMounted(() => {
  // 应用启动时立刻加载设置（含主题），无需等待用户进入“我的”页
  settingsStore.load().catch(() => {});
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
        class="liquid-nav-item flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-2xl text-[12px] font-bold text-slate-600 no-underline transition-colors dark:text-slate-300"
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
  background: rgba(255, 255, 255, 0.42);
  backdrop-filter: saturate(180%) blur(24px);
  -webkit-backdrop-filter: saturate(180%) blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.55);
  box-shadow:
    0 18px 42px rgba(39, 54, 85, 0.18),
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 -1px 0 rgba(255, 255, 255, 0.25) inset;
  position: fixed;
}

.liquid-nav::before {
  content: "";
  position: absolute;
  inset: 1px 1px auto 1px;
  height: 40%;
  border-radius: 22px 22px 0 0;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.55) 0%,
    rgba(255, 255, 255, 0) 100%
  );
  pointer-events: none;
}

.liquid-nav-item {
  position: relative;
  z-index: 1;
}

.liquid-nav-item:hover {
  color: #1f2937;
}

.liquid-nav-item-active {
  color: #2f6bff !important;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.75) 0%,
    rgba(238, 245, 255, 0.85) 100%
  );
  box-shadow:
    0 0 0 1px rgba(47, 107, 255, 0.18),
    0 6px 16px rgba(47, 107, 255, 0.22),
    0 1px 0 rgba(255, 255, 255, 0.9) inset;
}

/* 深色玻璃 */
:where(html.dark) .liquid-nav {
  background: rgba(28, 32, 44, 0.45);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow:
    0 18px 42px rgba(0, 0, 0, 0.45),
    0 1px 0 rgba(255, 255, 255, 0.18) inset,
    0 -1px 0 rgba(0, 0, 0, 0.4) inset;
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
  color: #6ea1ff !important;
  background: linear-gradient(
    180deg,
    rgba(47, 107, 255, 0.28) 0%,
    rgba(47, 107, 255, 0.14) 100%
  );
  box-shadow:
    0 0 0 1px rgba(110, 161, 255, 0.35),
    0 6px 16px rgba(47, 107, 255, 0.32),
    0 1px 0 rgba(255, 255, 255, 0.12) inset;
}
</style>
