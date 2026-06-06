<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "@iconify/vue";

const appWindow = getCurrentWindow();

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
  <main
    class="relative h-screen w-screen overflow-hidden"
    style="background:
      radial-gradient(circle at top left, rgba(62, 111, 255, 0.16), transparent 32%),
      linear-gradient(180deg, #f8fbff 0%, #eef3f8 100%);"
  >
    <header
      class="fixed inset-x-0 top-0 z-30 flex h-[42px] select-none items-center justify-between bg-white/85 px-2 pl-3.5 backdrop-blur-lg"
      data-tauri-drag-region
      @mousedown="startDrag"
    >
      <div
        class="flex items-center gap-2 text-[12px] font-extrabold tracking-wider text-slate-700"
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
          class="!h-7 !w-[34px] !rounded-[9px] !text-slate-500"
          @click="minimizeWindow"
        >
          <Icon icon="mdi:window-minimize" width="16" />
        </el-button>
        <el-button
          text
          circle
          aria-label="关闭"
          class="!h-7 !w-[34px] !rounded-[9px] !text-slate-500 hover:!bg-red-500 hover:!text-white"
          @click="closeWindow"
        >
          <Icon icon="mdi:close" width="16" />
        </el-button>
      </div>
    </header>

    <RouterView />

    <nav
      class="fixed inset-x-3.5 bottom-3.5 z-10 grid grid-cols-4 gap-1.5 rounded-3xl border border-slate-400/15 bg-white/90 p-2 backdrop-blur-lg"
      style="box-shadow: 0 18px 42px rgba(39, 54, 85, 0.16);"
      aria-label="主导航"
    >
      <RouterLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-2xl text-[12px] font-bold text-slate-500 no-underline"
        active-class="!text-[#2f6bff] !bg-[#eef5ff]"
      >
        <Icon :icon="tab.icon" width="20" />
        {{ tab.label }}
      </RouterLink>
    </nav>
  </main>
</template>
