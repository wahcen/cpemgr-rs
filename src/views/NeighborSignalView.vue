<script setup lang="ts">
import { Icon } from "@iconify/vue";
</script>

<template>
  <section class="h-screen overflow-y-auto px-[18px] pb-[104px] pt-[70px]">
    <p class="mb-1 text-[13px] font-bold uppercase tracking-widest text-slate-500">邻区信号</p>
    <h1 class="mb-6 text-[28px] leading-tight">附近基站扫描</h1>
    <el-card
      shadow="never"
      class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
      :body-style="{ padding: '32px 24px' }"
    >
      <div class="flex min-h-[260px] flex-col items-center justify-center text-center">
        <div class="mb-4 grid h-[76px] w-[76px] place-items-center rounded-3xl bg-[#eef5ff] text-[#2f6bff]">
          <Icon icon="mdi:radar" width="42" />
        </div>
        <h2 class="mb-2 text-[18px]">暂无扫描结果</h2>
        <p class="m-0 max-w-[300px] text-slate-500">
          选择设备后，可在这里展示邻区 PCI、频点、频段和信号强度。
        </p>
      </div>
    </el-card>
  </section>
</template>
