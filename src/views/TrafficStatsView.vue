<script setup lang="ts">
import { Icon } from "@iconify/vue";
</script>

<template>
  <section class="h-screen overflow-y-auto px-[18px] pb-[104px] pt-[70px]">
    <p class="mb-1 text-[13px] font-bold uppercase tracking-widest text-slate-500">流量统计</p>
    <h1 class="mb-6 text-[28px] leading-tight">用量概览</h1>
    <div class="grid gap-3.5">
      <el-card
        v-for="item in ([
          { label: '今日', key: 'today' },
          { label: '本月', key: 'month' },
          { label: '今年', key: 'year' },
        ] as const)"
        :key="item.key"
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
      >
        <div class="flex items-center gap-3 py-1">
          <div
            class="grid h-[48px] w-[48px] shrink-0 place-items-center rounded-2xl text-[#2f6bff]"
            style="background: #eef5ff;"
          >
            <Icon
              :icon="item.key === 'today' ? 'mdi:clock-time-eight-outline' : item.key === 'month' ? 'mdi:calendar-month-outline' : 'mdi:calendar-star-outline'"
              width="24"
            />
          </div>
          <div class="min-w-0 flex-1">
            <p class="m-0 text-[13px] text-slate-500">{{ item.label }}</p>
            <p class="m-0 text-[30px] font-bold leading-tight text-[#172033]">--</p>
            <p class="m-0 truncate text-[13px] text-slate-500">上传 / 下载</p>
          </div>
        </div>
      </el-card>
    </div>
  </section>
</template>