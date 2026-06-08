<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";
import { useDevicesStore } from "../stores/devices";
import {
  fetchDeviceFullSnapshot,
  fiberhomePost,
  fiberhomePostJson,
  type DeviceFullSnapshot,
} from "../fiberhome";
import { gradeOf, gradeColorText } from "../utils/signalGrade";

const props = defineProps<{ index: string | number }>();
const router = useRouter();
const store = useDevicesStore();

const REFRESH_INTERVAL_MS = 5_000;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

const idx = computed(() => Number(props.index));
const device = computed(() => store.devices[idx.value]);

const snapshot = ref<DeviceFullSnapshot | null>(null);
const loading = ref(false);
const errorMsg = ref("");
const lastUpdated = ref<number | null>(null);

// 实时速率：通过相邻两次流量样本的差分推算（bps）
const rate = reactive<{ down: number | null; up: number | null }>({ down: null, up: null });
let prevSample: { ts: number; tx: number; rx: number } | null = null;

const acting = reactive<{ reboot: boolean; airplane: boolean }>({
  reboot: false,
  airplane: false,
});

function goBack() {
  router.push({ name: "devices" });
}

async function refresh() {
  if (!device.value) return;
  if (loading.value) return;
  loading.value = true;
  try {
    const snap = await fetchDeviceFullSnapshot(device.value.url);
    snapshot.value = snap;
    errorMsg.value = "";
    lastUpdated.value = Date.now();

    // 实时速率推算：今日累计字节差分
    const tx = toNumber(snap.traffic.TodayTotalTxBytes) ?? 0;
    const rx = toNumber(snap.traffic.TodayTotalRxBytes) ?? 0;
    const now = Date.now();
    if (prevSample) {
      const dt = (now - prevSample.ts) / 1000;
      if (dt > 0.5) {
        const dTx = Math.max(0, tx - prevSample.tx);
        const dRx = Math.max(0, rx - prevSample.rx);
        rate.up = (dTx * 8) / dt;
        rate.down = (dRx * 8) / dt;
      }
    }
    prevSample = { ts: now, tx, rx };
  } catch (err) {
    errorMsg.value = String(err);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    await store.load();
  } catch (err) {
    ElMessage.error(`加载设备失败：${String(err)}`);
  }
  if (!device.value) {
    ElMessage.warning("设备不存在，返回设备列表");
    goBack();
    return;
  }
  refresh();
  refreshTimer = setInterval(refresh, REFRESH_INTERVAL_MS);
});

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
});

// ── 操作按钮 ──────────────────────────────────────
async function rebootDevice() {
  if (!device.value) return;
  try {
    await ElMessageBox.confirm("确定重启设备？设备将断开几分钟", "重启确认", {
      type: "warning",
      confirmButtonText: "重启",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  acting.reboot = true;
  try {
    await fiberhomePost({
      loginUrl: device.value.url,
      ajaxmethod: "do_cmd_web",
      dataObj: { "key": "REBOOT_WEB" },
    });
    ElMessage.success("重启指令已下发");
  } catch (err) {
    ElMessage.error(`重启失败：${String(err)}`);
  } finally {
    acting.reboot = false;
  }
}

async function toggleAirplane() {
  if (!device.value) return;
  const data = await fiberhomePostJson<{AirplaneEnable: string | undefined}>({
    loginUrl: device.value.url,
    ajaxmethod: "get_value_by_xmlnode",
    dataObj: {
      AirplaneEnable: "X_FH_MobileNetwork.NetworkSettings.airplan_on"
    },
  });
  const enabled = data.AirplaneEnable === "1";
  try {
    await ElMessageBox.confirm(`确定${enabled ? "关闭" : "打开"}飞行模式？`, "飞行模式确认", {
      type: "warning",
      confirmButtonText: "确认",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  try {
    await fiberhomePost({
      loginUrl: device.value.url,
      ajaxmethod: "set_single_by_xmlnode",
      dataObj: { 
        "url": "X_FH_MobileNetwork.NetworkSettings.airplan_on",
        "value": enabled ? 0 : 1,
      },
    });
    ElMessage.success(`飞行模式已${enabled ? "关闭" : "打开"}`);
  } catch (err) {
    ElMessage.error(`打开飞行模式失败：${String(err)}`);
  }
}

// ── 数据辅助 ──────────────────────────────────────
function toNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function fmtVal(v: unknown, suffix = ""): string {
  if (v === undefined || v === null || v === "") return "--";
  return `${v}${suffix}`;
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

function fmtTemp(v: number | null): string {
  return v === null ? "--" : `${v.toFixed(1)}°C`;
}

function tempColorClass(t: number | null): string {
  if (t === null) return "bg-slate-100 text-slate-500";
  if (t < 40) return "bg-emerald-100 text-emerald-700";
  if (t < 50) return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

function fmtTime(ts: number | null): string {
  if (!ts) return "--";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function metricClass(metric: string, v: unknown): string {
  return gradeColorText(gradeOf(metric, v));
}

// ── 邻区数据解析（RSRP_NBR / SINR_NBR / EARFCN_NBR / BAND_NBR / PCI_NBR 是同长数组的逗号串） ─
const neighbors = computed(() => {
  const r = snapshot.value?.radio;
  if (!r) return [];
  const split = (s: string | undefined) =>
    s ? s.split(/[,;|]/).map((x) => x.trim()).filter(Boolean) : [];
  const rsrp = split(r.RSRP_NBR);
  const sinr = split(r.SINR_NBR);
  const earfcn = split(r.EARFCN_NBR);
  const band = split(r.BAND_NBR);
  const pci = split(r.PCI_NBR);
  const max = Math.max(rsrp.length, sinr.length, earfcn.length, band.length, pci.length);
  const list: Array<{
    idx: number;
    rsrp: string;
    sinr: string;
    earfcn: string;
    band: string;
    pci: string;
  }> = [];
  for (let i = 0; i < max; i++) {
    list.push({
      idx: i + 1,
      rsrp: rsrp[i] ?? "--",
      sinr: sinr[i] ?? "--",
      earfcn: earfcn[i] ?? "--",
      band: band[i] ?? "--",
      pci: pci[i] ?? "--",
    });
  }
  return list;
});

// ── 卡片 1 字段 ───────────────────────────────────
const status = computed(() => snapshot.value?.status ?? null);
const basic = computed(() => snapshot.value?.basic ?? {});
const radio = computed(() => snapshot.value?.radio ?? {});
const traffic = computed(() => snapshot.value?.traffic ?? {});
const pcc = computed(() => snapshot.value?.pcc ?? {});
</script>

<template>
  <section class="h-screen overflow-y-auto px-[18px] pb-[104px] pt-[70px]">
    <header class="mb-4 flex items-center gap-3">
      <el-button
        circle
        size="default"
        class="!h-9 !w-9 !border-slate-200/60 !bg-white/70"
        aria-label="返回"
        @click="goBack"
      >
        <Icon icon="mdi:chevron-left" width="20" />
      </el-button>
      <div class="min-w-0 flex-1">
        <p class="mb-0.5 text-[12px] font-bold uppercase tracking-widest text-slate-500">
          设备详情
        </p>
        <h1 class="m-0 truncate text-[22px] leading-tight">
          {{ device?.name || "--" }}
        </h1>
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

    <el-alert
      v-if="errorMsg"
      type="error"
      show-icon
      :closable="false"
      :title="`数据获取失败：${errorMsg}`"
      class="!mb-3 !rounded-2xl"
    />

    <div class="grid gap-3.5">
      <!-- ── 卡片 1：设备基础信息 ──────────────────────── -->
      <el-card
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '16px' }"
      >
        <div class="flex items-start gap-3">
          <div
            class="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-2xl bg-[#eef5ff] text-[#2f6bff]"
          >
            <Icon icon="mdi:access-point-network" width="28" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <h2 class="mb-0.5 truncate text-[17px] font-semibold">
                  {{ basic.CarrierName || "未知运营商" }}
                </h2>
                <p class="m-0 truncate text-[13px] text-slate-500">
                  {{ status?.modelName || device?.vendor || "--" }}
                  ·
                  {{ device?.url }}
                </p>
              </div>
              <span
                class="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold"
                :class="tempColorClass(status?.temperatureC ?? null)"
              >
                <Icon icon="mdi:thermometer" width="14" />
                {{ fmtTemp(status?.temperatureC ?? null) }}
              </span>
            </div>
            <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-slate-600">
              <div class="truncate">
                <span class="text-slate-400">网络模式</span>
                <span class="ml-1">{{ basic.NetworkMode || radio.WorkMode || "--" }}</span>
              </div>
              <div class="truncate">
                <span class="text-slate-400">SIM</span>
                <span class="ml-1">{{ radio.PLMN || "--" }}</span>
              </div>
              <div class="truncate">
                <span class="text-slate-400">CPU</span>
                <span class="ml-1">{{ status?.cpuUsage !== null ? `${status?.cpuUsage}%` : "--" }}</span>
              </div>
              <div class="truncate">
                <span class="text-slate-400">内存</span>
                <span class="ml-1">
                  {{
                    status?.memoryUsage !== null && status?.memoryUsage !== undefined
                      ? `${status.memoryUsage.toFixed(0)}%`
                      : "--"
                  }}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-2 text-right text-[11px] text-slate-400">
          上次更新 {{ fmtTime(lastUpdated) }}
        </div>
      </el-card>

      <!-- ── 卡片 2：当前服务小区关键指标（信号核心区） ── -->
      <el-card
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '16px' }"
      >
        <div class="mb-2 flex items-center justify-between">
          <h3 class="m-0 text-[15px] font-semibold">服务小区信号</h3>
          <span class="text-[12px] text-slate-500">
            {{ radio.WorkMode || "--" }} · BAND {{ radio.NR_BAND || radio.BAND || "--" }}
          </span>
        </div>
        <div class="grid grid-cols-2 gap-2.5">
          <!-- 下行 -->
          <div class="rounded-2xl bg-slate-50 p-3">
            <p class="m-0 mb-2 text-[12px] font-semibold text-[#2f6bff]">
              <Icon icon="mdi:download-network-outline" width="14" class="mr-1 inline" />
              下行 DL
            </p>
            <div class="space-y-1 text-[12px]">
              <div class="flex justify-between">
                <span class="text-slate-400">NR_RSRP</span>
                <span :class="metricClass('NR_RSRP', radio.SSB_RSRP ?? radio.RSRP)">
                  {{ fmtVal(radio.SSB_RSRP || radio.RSRP, " dBm") }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">NR_SINR</span>
                <span :class="metricClass('NR_SINR', radio.SSB_SINR ?? radio.SINR)">
                  {{ fmtVal(radio.SSB_SINR || radio.SINR, " dB") }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">RSRQ</span>
                <span :class="metricClass('NR_RSRQ', radio.RSRQ)">
                  {{ fmtVal(radio.RSRQ, " dB") }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">带宽</span>
                <span :class="metricClass('NR_DLBW', pcc.PCC_DlBandWidth)">
                  {{ fmtVal(pcc.PCC_DlBandWidth, " MHz") }}
                </span>
              </div>
            </div>
          </div>
          <!-- 上行 -->
          <div class="rounded-2xl bg-slate-50 p-3">
            <p class="m-0 mb-2 text-[12px] font-semibold text-emerald-600">
              <Icon icon="mdi:upload-network-outline" width="14" class="mr-1 inline" />
              上行 UL
            </p>
            <div class="space-y-1 text-[12px]">
              <div class="flex justify-between">
                <span class="text-slate-400">发射功率</span>
                <span :class="metricClass('PUSCH', radio.NR_Power ?? radio.LTE_Power)">
                  {{ fmtVal(radio.NR_Power || radio.LTE_Power, " dBm") }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">PUCCH</span>
                <span :class="metricClass('PUCCH', pcc.PCC_PucchTxPower)">
                  {{ fmtVal(pcc.PCC_PucchTxPower, " dBm") }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">CQI</span>
                <span :class="metricClass('NR_CQI', radio.NR_CQI ?? radio.LTE_CQI)">
                  {{ fmtVal(radio.NR_CQI || radio.LTE_CQI) }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">带宽</span>
                <span :class="metricClass('NR_ULBW', pcc.PCC_UlBandWidth)">
                  {{ fmtVal(pcc.PCC_UlBandWidth, " MHz") }}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-3 grid grid-cols-3 gap-x-3 gap-y-1 border-t border-slate-200/60 pt-2 text-[11px] text-slate-500">
          <div>PCI <span class="text-slate-700">{{ radio.PCI || "--" }}</span></div>
          <div>TAC <span class="text-slate-700">{{ radio.TAC || "--" }}</span></div>
          <div>RSSI <span :class="metricClass('RSSI', radio.RSSI)">{{ fmtVal(radio.RSSI, " dBm") }}</span></div>
          <div class="col-span-3 truncate">
            NCGI <span class="text-slate-700">{{ radio.NCGI || radio.ECGI || "--" }}</span>
          </div>
        </div>
      </el-card>

      <!-- ── 卡片 3：实时速率 ──────────────────────────── -->
      <el-card
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '14px 16px' }"
      >
        <div class="flex items-center justify-between">
          <h3 class="m-0 text-[15px] font-semibold">实时速率</h3>
          <span class="text-[11px] text-slate-400">基于今日累计差分</span>
        </div>
        <div class="mt-2 grid grid-cols-2 gap-3">
          <div class="rounded-2xl bg-[#eef5ff] px-3 py-2 text-[#2f6bff]">
            <div class="flex items-center gap-1 text-[12px] font-semibold">
              <Icon icon="mdi:arrow-down-bold" width="14" /> 下行
            </div>
            <div class="mt-0.5 text-[20px] font-bold leading-tight">
              {{ fmtRate(rate.down) }}
            </div>
          </div>
          <div class="rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-700">
            <div class="flex items-center gap-1 text-[12px] font-semibold">
              <Icon icon="mdi:arrow-up-bold" width="14" /> 上行
            </div>
            <div class="mt-0.5 text-[20px] font-bold leading-tight">
              {{ fmtRate(rate.up) }}
            </div>
          </div>
        </div>
      </el-card>

      <!-- ── 卡片 4：快捷操作 ──────────────────────────── -->
      <el-card
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '14px 16px' }"
      >
        <h3 class="m-0 mb-2 text-[15px] font-semibold">快捷操作</h3>
        <div class="grid grid-cols-3 gap-2">
          <el-button
            round
            :loading="acting.reboot"
            class="!h-12 !flex-col !rounded-2xl"
            @click="rebootDevice"
          >
            <Icon icon="mdi:restart" width="20" />
            <span class="mt-0.5 text-[11px]">重启</span>
          </el-button>
          <el-button
            round
            :loading="acting.airplane"
            class="!h-12 !flex-col !rounded-2xl"
            @click="toggleAirplane"
          >
            <Icon icon="mdi:airplane" width="20" />
            <span class="mt-0.5 text-[11px]">飞行模式</span>
          </el-button>
          <el-button
            round
            :loading="loading"
            class="!h-12 !flex-col !rounded-2xl"
            @click="refresh"
          >
            <Icon icon="mdi:refresh" width="20" />
            <span class="mt-0.5 text-[11px]">刷新数据</span>
          </el-button>
        </div>
      </el-card>

      <!-- ── 流量统计 ─────────────────────────────────── -->
      <el-card
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '14px 16px' }"
      >
        <h3 class="m-0 mb-2 text-[15px] font-semibold">流量统计</h3>
        <div class="grid grid-cols-2 gap-3 text-[12px]">
          <div class="rounded-2xl bg-slate-50 p-3">
            <p class="m-0 mb-1 text-[12px] font-semibold text-slate-700">今日</p>
            <div class="flex justify-between">
              <span class="text-slate-400">下行</span>
              <span>{{ fmtBytes(toNumber(traffic.TodayTotalRxBytes)) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-400">上行</span>
              <span>{{ fmtBytes(toNumber(traffic.TodayTotalTxBytes)) }}</span>
            </div>
            <div class="flex justify-between font-semibold">
              <span class="text-slate-500">合计</span>
              <span>{{ fmtBytes(toNumber(traffic.TodayTotalBytes)) }}</span>
            </div>
          </div>
          <div class="rounded-2xl bg-slate-50 p-3">
            <p class="m-0 mb-1 text-[12px] font-semibold text-slate-700">本月</p>
            <div class="flex justify-between">
              <span class="text-slate-400">下行</span>
              <span>{{ fmtBytes(toNumber(traffic.MonthRxBytes)) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-400">上行</span>
              <span>{{ fmtBytes(toNumber(traffic.MonthTxBytes)) }}</span>
            </div>
            <div class="flex justify-between font-semibold">
              <span class="text-slate-500">合计</span>
              <span>{{ fmtBytes(toNumber(traffic.MonthTotalBytes)) }}</span>
            </div>
          </div>
        </div>
      </el-card>

      <!-- ── 载波 PCC 详情 ─────────────────────────────── -->
      <el-card
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '14px 16px' }"
      >
        <h3 class="m-0 mb-2 text-[15px] font-semibold">主载波 PCC</h3>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
          <div class="flex justify-between">
            <span class="text-slate-400">类型</span><span>{{ fmtVal(pcc.PCC_Type) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Band</span><span>{{ fmtVal(pcc.PCC_Band) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">PCI</span><span>{{ fmtVal(pcc.PCC_Pci) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">ARFCN</span><span>{{ fmtVal(pcc.PCC_Arfcn) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">DL-MIMO</span><span>{{ fmtVal(pcc.PCC_DlMimo) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">UL-MIMO</span><span>{{ fmtVal(pcc.PCC_UlMimo) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">DL-MCS</span>
            <span :class="metricClass('NR_DLMCS', pcc.PCC_DlMCS)">{{ fmtVal(pcc.PCC_DlMCS) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">UL-MCS</span>
            <span :class="metricClass('NR_ULMCS', pcc.PCC_UlMCS)">{{ fmtVal(pcc.PCC_UlMCS) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">DL-RB</span><span>{{ fmtVal(pcc.PCC_DlRB) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">UL-RB</span><span>{{ fmtVal(pcc.PCC_UlRB) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">调制 DL</span><span>{{ fmtVal(pcc.PCC_DlModulation) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">调制 UL</span><span>{{ fmtVal(pcc.PCC_UlModulation) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">RANK</span><span>{{ fmtVal(pcc.PCC_RANK) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">路损</span><span>{{ fmtVal(pcc.PCC_Loss, " dB") }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">CQI</span>
            <span :class="metricClass('NR_CQI', pcc.PCC_CQI)">{{ fmtVal(pcc.PCC_CQI) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">LTE-DlTM</span><span>{{ fmtVal(pcc.PCC_LTEDlTM) }}</span>
          </div>
        </div>
      </el-card>

      <!-- ── 邻区 ─────────────────────────────────────── -->
      <el-card
        v-if="neighbors.length > 0"
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '14px 16px' }"
      >
        <h3 class="m-0 mb-2 text-[15px] font-semibold">邻区信号 ({{ neighbors.length }})</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-[12px]">
            <thead class="text-slate-400">
              <tr class="border-b border-slate-200/60">
                <th class="py-1 text-left font-normal">#</th>
                <th class="py-1 text-left font-normal">PCI</th>
                <th class="py-1 text-left font-normal">EARFCN</th>
                <th class="py-1 text-left font-normal">Band</th>
                <th class="py-1 text-right font-normal">RSRP</th>
                <th class="py-1 text-right font-normal">SINR</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="n in neighbors"
                :key="n.idx"
                class="border-b border-slate-100/60 last:border-0"
              >
                <td class="py-1 text-slate-500">{{ n.idx }}</td>
                <td class="py-1">{{ n.pci }}</td>
                <td class="py-1">{{ n.earfcn }}</td>
                <td class="py-1">{{ n.band }}</td>
                <td class="py-1 text-right" :class="metricClass('NR_RSRP', n.rsrp)">{{ n.rsrp }}</td>
                <td class="py-1 text-right" :class="metricClass('NR_SINR', n.sinr)">{{ n.sinr }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </el-card>

      <!-- ── 基础网络 + 设备版本 ───────────────────────── -->
      <el-card
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '14px 16px' }"
      >
        <h3 class="m-0 mb-2 text-[15px] font-semibold">基础网络与设备</h3>
        <div class="grid grid-cols-1 gap-y-1 text-[12px]">
          <div class="flex justify-between">
            <span class="text-slate-400">SN</span>
            <span class="truncate">{{ status?.serialNumber || "--" }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">软件版本</span>
            <span class="truncate">{{ status?.softwareVersion || "--" }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">硬件版本</span>
            <span class="truncate">{{ status?.hardwareVersion || "--" }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">模组版本</span>
            <span class="truncate">{{ status?.mobileSoftVersion || "--" }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">MAC</span>
            <span class="truncate">{{ basic.MACAddress || "--" }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">IP</span>
            <span class="truncate">{{ status?.ipAddress || "--" }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">QCI</span>
            <span class="truncate">{{ radio.QCI || "--" }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">DL/UL AMBR</span>
            <span class="truncate">{{ radio.DL_AMBR || "--" }} / {{ radio.UL_AMBR || "--" }}</span>
          </div>
        </div>
      </el-card>
    </div>
  </section>
</template>
