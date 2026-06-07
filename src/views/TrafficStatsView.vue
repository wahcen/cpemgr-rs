<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { useDevicesStore, type DeviceConfig } from "../stores/devices";
import { fetchTrafficStats, type TrafficStatsRaw } from "../fiberhome";

const REFRESH_INTERVAL_MS = 10_000;

const devicesStore = useDevicesStore();

const selectedIndex = ref<number | null>(null);
const selectedDevice = computed<DeviceConfig | null>(() =>
  selectedIndex.value === null ? null : devicesStore.devices[selectedIndex.value] ?? null,
);

const traffic = ref<TrafficStatsRaw | null>(null);
const loading = ref(false);
const errorMsg = ref("");
const lastUpdated = ref<number | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

// 实时速率（基于今日累计字节差分）
const rate = ref<{ down: number | null; up: number | null }>({ down: null, up: null });
let prevSample: { ts: number; tx: number; rx: number } | null = null;

onMounted(async () => {
  try {
    await devicesStore.load();
  } catch (err) {
    ElMessage.error(`加载设备失败：${String(err)}`);
  }
  if (devicesStore.devices.length > 0 && selectedIndex.value === null) {
    selectedIndex.value = 0;
  }
  refresh();
  timer = setInterval(refresh, REFRESH_INTERVAL_MS);
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});

watch(selectedIndex, () => {
  traffic.value = null;
  errorMsg.value = "";
  lastUpdated.value = null;
  prevSample = null;
  rate.value = { down: null, up: null };
  refresh();
});

async function refresh() {
  const dev = selectedDevice.value;
  if (!dev) return;
  if (loading.value) return;
  loading.value = true;
  try {
    const t = (await fetchTrafficStats(dev.url)) ?? {};
    traffic.value = t;

    const tx = toNumber(t.TodayTotalTxBytes) ?? 0;
    const rx = toNumber(t.TodayTotalRxBytes) ?? 0;
    const now = Date.now();
    if (prevSample) {
      const dt = (now - prevSample.ts) / 1000;
      if (dt > 0.5) {
        const dTx = Math.max(0, tx - prevSample.tx);
        const dRx = Math.max(0, rx - prevSample.rx);
        rate.value = {
          up: (dTx * 8) / dt,
          down: (dRx * 8) / dt,
        };
      }
    }
    prevSample = { ts: now, tx, rx };

    errorMsg.value = "";
    lastUpdated.value = Date.now();
  } catch (err) {
    errorMsg.value = String(err);
  } finally {
    loading.value = false;
  }
}

function toNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function fmtBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "--";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

function fmtRate(bps: number | null): string {
  if (bps === null || !Number.isFinite(bps)) return "--";
  const units = ["bps", "Kbps", "Mbps", "Gbps"];
  let v = bps;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

function fmtTime(ts: number | null): string {
  if (!ts) return "--";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 卡片数据
const todayRx = computed(() => toNumber(traffic.value?.TodayTotalRxBytes));
const todayTx = computed(() => toNumber(traffic.value?.TodayTotalTxBytes));
const todayTotal = computed(() =>
  toNumber(traffic.value?.TodayTotalBytes) ??
  (todayRx.value !== null && todayTx.value !== null ? todayRx.value + todayTx.value : null),
);
const monthRx = computed(() => toNumber(traffic.value?.MonthRxBytes));
const monthTx = computed(() => toNumber(traffic.value?.MonthTxBytes));
const monthTotal = computed(() =>
  toNumber(traffic.value?.MonthTotalBytes) ??
  (monthRx.value !== null && monthTx.value !== null ? monthRx.value + monthTx.value : null),
);

// 上下行占比
function ratio(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  const total = a + b;
  if (total <= 0) return null;
  return (a / total) * 100;
}
const todayUpRatio = computed(() => ratio(todayTx.value, todayRx.value));
const todayDownRatio = computed(() => ratio(todayRx.value, todayTx.value));
const monthUpRatio = computed(() => ratio(monthTx.value, monthRx.value));
const monthDownRatio = computed(() => ratio(monthRx.value, monthTx.value));
</script>

<template>
  <section class="h-screen overflow-y-auto px-[18px] pb-[104px] pt-[70px]">
    <header class="mb-4 flex items-center justify-between gap-2">
      <div class="min-w-0">
        <p class="mb-1 text-[13px] font-bold uppercase tracking-widest text-slate-500">流量统计</p>
        <h1 class="m-0 text-[24px] leading-tight">用量概览</h1>
      </div>
      <el-button
        circle
        size="default"
        class="!h-9 !w-9"
        :loading="loading"
        aria-label="刷新"
        @click="refresh"
      >
        <Icon icon="mdi:refresh" width="18" />
      </el-button>
    </header>

    <!-- 设备选择 -->
    <el-card
      shadow="never"
      class="!mb-3 !rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
      :body-style="{ padding: '14px 16px' }"
    >
      <div class="flex items-center gap-3">
        <Icon icon="mdi:router-wireless" width="20" class="text-[#2f6bff]" />
        <span class="shrink-0 text-[13px] font-semibold text-slate-700">设备</span>
        <el-select
          v-model="selectedIndex"
          placeholder="请选择设备"
          class="!flex-1"
          size="default"
          :disabled="devicesStore.devices.length === 0"
        >
          <el-option
            v-for="(d, idx) in devicesStore.devices"
            :key="idx"
            :value="idx"
            :label="`${d.name} · ${d.url}`"
          />
        </el-select>
      </div>
      <p
        v-if="devicesStore.devices.length === 0"
        class="m-0 mt-2 text-[12px] text-slate-500"
      >
        请先在「设备概览」添加设备。
      </p>
      <p v-else class="m-0 mt-2 text-right text-[11px] text-slate-400">
        上次更新 {{ fmtTime(lastUpdated) }}
      </p>
    </el-card>

    <el-alert
      v-if="errorMsg"
      type="error"
      show-icon
      :closable="false"
      :title="`数据获取失败：${errorMsg}`"
      class="!mb-3 !rounded-2xl"
    />

    <div class="grid gap-3.5">
      <!-- 实时速率 -->
      <el-card
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '14px 16px' }"
      >
        <div class="mb-2 flex items-center justify-between">
          <h3 class="m-0 text-[15px] font-semibold">实时速率</h3>
          <span class="text-[11px] text-slate-400">基于今日累计差分（约 {{ REFRESH_INTERVAL_MS / 1000 }}s 更新）</span>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-2xl bg-[#eef5ff] px-3 py-2 text-[#2f6bff]">
            <div class="flex items-center gap-1 text-[12px] font-semibold">
              <Icon icon="mdi:arrow-down-bold" width="14" /> 下行
            </div>
            <div class="mt-0.5 text-[22px] font-bold leading-tight">
              {{ fmtRate(rate.down) }}
            </div>
          </div>
          <div class="rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-700">
            <div class="flex items-center gap-1 text-[12px] font-semibold">
              <Icon icon="mdi:arrow-up-bold" width="14" /> 上行
            </div>
            <div class="mt-0.5 text-[22px] font-bold leading-tight">
              {{ fmtRate(rate.up) }}
            </div>
          </div>
        </div>
      </el-card>

      <!-- 今日 -->
      <el-card
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '16px' }"
      >
        <div class="flex items-center gap-3">
          <div
            class="grid h-[48px] w-[48px] shrink-0 place-items-center rounded-2xl bg-[#eef5ff] text-[#2f6bff]"
          >
            <Icon icon="mdi:clock-time-eight-outline" width="24" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="m-0 text-[13px] text-slate-500">今日</p>
            <p class="m-0 text-[28px] font-bold leading-tight text-[#172033]">
              {{ fmtBytes(todayTotal) }}
            </p>
          </div>
        </div>

        <!-- 上/下行进度条 -->
        <div class="mt-3 space-y-2">
          <div>
            <div class="mb-0.5 flex justify-between text-[12px]">
              <span class="text-slate-500">
                <Icon icon="mdi:arrow-down-bold" width="12" class="mr-0.5 inline" />
                下行
              </span>
              <span class="font-semibold text-slate-700">{{ fmtBytes(todayRx) }}</span>
            </div>
            <el-progress
              :percentage="todayDownRatio ?? 0"
              :stroke-width="6"
              color="#2f6bff"
              :show-text="false"
            />
          </div>
          <div>
            <div class="mb-0.5 flex justify-between text-[12px]">
              <span class="text-slate-500">
                <Icon icon="mdi:arrow-up-bold" width="12" class="mr-0.5 inline" />
                上行
              </span>
              <span class="font-semibold text-slate-700">{{ fmtBytes(todayTx) }}</span>
            </div>
            <el-progress
              :percentage="todayUpRatio ?? 0"
              :stroke-width="6"
              color="#10b981"
              :show-text="false"
            />
          </div>
        </div>
      </el-card>

      <!-- 本月 -->
      <el-card
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '16px' }"
      >
        <div class="flex items-center gap-3">
          <div
            class="grid h-[48px] w-[48px] shrink-0 place-items-center rounded-2xl bg-[#eef5ff] text-[#2f6bff]"
          >
            <Icon icon="mdi:calendar-month-outline" width="24" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="m-0 text-[13px] text-slate-500">本月</p>
            <p class="m-0 text-[28px] font-bold leading-tight text-[#172033]">
              {{ fmtBytes(monthTotal) }}
            </p>
          </div>
        </div>

        <div class="mt-3 space-y-2">
          <div>
            <div class="mb-0.5 flex justify-between text-[12px]">
              <span class="text-slate-500">
                <Icon icon="mdi:arrow-down-bold" width="12" class="mr-0.5 inline" />
                下行
              </span>
              <span class="font-semibold text-slate-700">{{ fmtBytes(monthRx) }}</span>
            </div>
            <el-progress
              :percentage="monthDownRatio ?? 0"
              :stroke-width="6"
              color="#2f6bff"
              :show-text="false"
            />
          </div>
          <div>
            <div class="mb-0.5 flex justify-between text-[12px]">
              <span class="text-slate-500">
                <Icon icon="mdi:arrow-up-bold" width="12" class="mr-0.5 inline" />
                上行
              </span>
              <span class="font-semibold text-slate-700">{{ fmtBytes(monthTx) }}</span>
            </div>
            <el-progress
              :percentage="monthUpRatio ?? 0"
              :stroke-width="6"
              color="#10b981"
              :show-text="false"
            />
          </div>
        </div>
      </el-card>

      <!-- 占位：未来可加月度趋势图 -->
      <el-card
        v-if="!traffic && !errorMsg"
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '32px 24px' }"
      >
        <div class="flex min-h-[120px] flex-col items-center justify-center text-center">
          <div
            class="mb-3 grid h-[60px] w-[60px] place-items-center rounded-2xl bg-[#eef5ff] text-[#2f6bff]"
          >
            <Icon icon="mdi:chart-areaspline" width="32" />
          </div>
          <p class="m-0 text-[13px] text-slate-500">等待数据…</p>
        </div>
      </el-card>
    </div>
  </section>
</template>
