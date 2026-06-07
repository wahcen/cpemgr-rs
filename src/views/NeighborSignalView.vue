<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { useDevicesStore, type DeviceConfig } from "../stores/devices";
import {
  fetchRadioSignal,
  fiberhomePost,
  type RadioSignalRaw,
} from "../fiberhome";
import { gradeOf, gradeColorText } from "../utils/signalGrade";

const REFRESH_INTERVAL_MS = 10_000;

const devicesStore = useDevicesStore();

const selectedIndex = ref<number | null>(null);
const selectedDevice = computed<DeviceConfig | null>(() =>
  selectedIndex.value === null ? null : devicesStore.devices[selectedIndex.value] ?? null,
);

const radio = ref<RadioSignalRaw | null>(null);
const loading = ref(false);
const errorMsg = ref("");
const lastUpdated = ref<number | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

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
  fetchLockState();
  fetchLockCells();
  timer = setInterval(refresh, REFRESH_INTERVAL_MS);
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});

watch(selectedIndex, () => {
  radio.value = null;
  errorMsg.value = "";
  lastUpdated.value = null;
  lockState.value = { band4: [], band5: [], enable: false, lockCellEnable: false };
  mobileState.value = null;
  lockCells.value = [];
  refresh();
  fetchLockState();
  fetchLockCells();
});

async function refresh() {
  const dev = selectedDevice.value;
  if (!dev) return;
  if (loading.value) return;
  loading.value = true;
  try {
    radio.value = (await fetchRadioSignal(dev.url)) ?? {};
    errorMsg.value = "";
    lastUpdated.value = Date.now();
  } catch (err) {
    errorMsg.value = String(err);
  } finally {
    loading.value = false;
  }
}

function fmtTime(ts: number | null): string {
  if (!ts) return "--";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 邻区表格：把 PCI_NBR / EARFCN_NBR / BAND_NBR / RSRP_NBR / SINR_NBR 同长度数组打包
const neighbors = computed(() => {
  const r = radio.value;
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
    pci: string;
    earfcn: string;
    band: string;
    rsrp: string;
    sinr: string;
  }> = [];
  for (let i = 0; i < max; i++) {
    list.push({
      idx: i + 1,
      pci: pci[i] ?? "--",
      earfcn: earfcn[i] ?? "--",
      band: band[i] ?? "--",
      rsrp: rsrp[i] ?? "--",
      sinr: sinr[i] ?? "--",
    });
  }
  return list;
});

function metricClass(metric: string, v: unknown): string {
  return gradeColorText(gradeOf(metric, v));
}

// ── 锁频段 ─────────────────────────────────────────────
// 烽火 CPE 支持的频段（与 web 端 band4Arr/band5Arr 对齐）
const nrBandOptions: { name: string; value: string }[] = [
  { name: "N1", value: "1" },
  { name: "N3", value: "3" },
  { name: "N5", value: "5" },
  { name: "N7", value: "7" },
  { name: "N8", value: "8" },
  { name: "N20", value: "20" },
  { name: "N28", value: "28" },
  { name: "N38", value: "38" },
  { name: "N40", value: "40" },
  { name: "N41", value: "41" },
  { name: "N77", value: "77" },
  { name: "N78", value: "78" },
];
const lteBandOptions: { name: string; value: string }[] = [
  { name: "B1", value: "1" },
  { name: "B3", value: "3" },
  { name: "B5", value: "5" },
  { name: "B7", value: "7" },
  { name: "B8", value: "8" },
  { name: "B20", value: "20" },
  { name: "B28", value: "28" },
  { name: "B32", value: "32" },
  { name: "B38", value: "38" },
  { name: "B40", value: "40" },
  { name: "B41", value: "41" },
  { name: "B42", value: "42" },
  { name: "B43", value: "43" },
];

const nrBandLabel = (v: string) =>
  nrBandOptions.find((b) => b.value === v)?.name ?? `N${v}`;
const lteBandLabel = (v: string) =>
  lteBandOptions.find((b) => b.value === v)?.name ?? `B${v}`;

const LOCK_STATE_XMLNODE = {
  band4: "X_FH_MobileNetwork.NetworkSettings.LTELockBAND",
  band5: "X_FH_MobileNetwork.NetworkSettings.NRLockBAND",
  enable: "X_FH_MobileNetwork.NetworkSettings.LockBandEnable",
  LockCellEnable: "X_FH_MobileNetwork.LockCellList.LockEnable",
} as const;

const MOBILE_STATE_XMLNODE = {
  AirplaneEnable: "X_FH_MobileNetwork.NetworkSettings.airplan_on",
  CarrierLockEnable: "X_FH_MobileNetwork.NetworkSettings.CarrierLockEnable",
  CarrierSerialNum: "X_FH_MobileNetwork.NetworkSettings.CarrierSerialNum",
  IMSI: "X_FH_MobileNetwork.SIM.1.IMSI",
} as const;

interface LockState {
  band4: string[]; // ["41","3"]
  band5: string[];
  enable: boolean;
  lockCellEnable: boolean;
}

const lockState = ref<LockState>({
  band4: [],
  band5: [],
  enable: false,
  lockCellEnable: false,
});
const lockStateLoading = ref(false);
const lockStateError = ref("");

const mobileState = ref<{
  airplane: boolean;
  carrierLock: boolean;
  carrierSerial: string;
  imsi: string;
} | null>(null);

const showLockBandDialog = ref(false);
const lockBandForm = reactive<{
  enable: boolean;
  band4: string[];
  band5: string[];
}>({
  enable: false,
  band4: [],
  band5: [],
});
const lockBandSaving = ref(false);

function parseBandList(s: unknown): string[] {
  if (s === undefined || s === null) return [];
  return String(s)
    .split(/[,;|\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseBool(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

async function fetchLockState() {
  const dev = selectedDevice.value;
  if (!dev) return;
  lockStateLoading.value = true;
  lockStateError.value = "";
  try {
    const raw = await fiberhomePost({
      loginUrl: dev.url,
      ajaxmethod: "get_value_by_xmlnode",
      dataObj: LOCK_STATE_XMLNODE,
    });
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* 后端可能返回非 JSON，留空走默认值 */
    }
    lockState.value = {
      band4: parseBandList(parsed.band4),
      band5: parseBandList(parsed.band5),
      enable: parseBool(parsed.enable),
      lockCellEnable: parseBool(parsed.LockCellEnable),
    };
  } catch (err) {
    lockStateError.value = String(err);
  } finally {
    lockStateLoading.value = false;
  }

  // 串行再拉移动网络状态（飞行模式等），失败不阻塞主流程
  try {
    const raw2 = await fiberhomePost({
      loginUrl: dev.url,
      ajaxmethod: "get_value_by_xmlnode",
      dataObj: MOBILE_STATE_XMLNODE,
    });
    const parsed2: Record<string, unknown> = JSON.parse(raw2 || "{}");
    mobileState.value = {
      airplane: parseBool(parsed2.AirplaneEnable),
      carrierLock: parseBool(parsed2.CarrierLockEnable),
      carrierSerial: String(parsed2.CarrierSerialNum ?? ""),
      imsi: String(parsed2.IMSI ?? ""),
    };
  } catch {
    mobileState.value = null;
  }
}

function openLockBandDialog() {
  if (!selectedDevice.value) {
    ElMessage.warning("请先选择设备");
    return;
  }
  // 用最新状态预填表单
  lockBandForm.enable = lockState.value.enable;
  lockBandForm.band4 = [...lockState.value.band4];
  lockBandForm.band5 = [...lockState.value.band5];
  showLockBandDialog.value = true;
}

async function saveLockBand() {
  const dev = selectedDevice.value;
  if (!dev) return;
  if (lockBandForm.enable && lockBandForm.band4.length === 0 && lockBandForm.band5.length === 0) {
    ElMessage.error("启用锁频段时至少选择 1 个 4G/5G 频段");
    return;
  }
  if (lockBandForm.enable && lockState.value.lockCellEnable) {
    ElMessage.warning("锁小区已开启，请先关闭锁小区后再启用锁频段");
    return;
  }
  lockBandSaving.value = true;
  try {
    await fiberhomePost({
      loginUrl: dev.url,
      ajaxmethod: "set_value_by_xmlnode",
      dataObj: {
        url: {
          band4: LOCK_STATE_XMLNODE.band4,
          band5: LOCK_STATE_XMLNODE.band5,
          enable: LOCK_STATE_XMLNODE.enable,
        },
        value: {
          band4: lockBandForm.band4.join(","),
          band5: lockBandForm.band5.join(","),
          enable: lockBandForm.enable ? "1" : "0",
        },
      },
    });
    ElMessage.success(lockBandForm.enable ? "锁频段已下发" : "已关闭锁频段");
    showLockBandDialog.value = false;
    await fetchLockState();
  } catch (err) {
    ElMessage.error(`下发失败：${String(err)}`);
  } finally {
    lockBandSaving.value = false;
  }
}

async function unlockBand() {
  const dev = selectedDevice.value;
  if (!dev) return;
  try {
    await ElMessageBox.confirm("确定解除频段锁定？", "解除锁频段", {
      type: "warning",
      confirmButtonText: "解除",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  lockBandSaving.value = true;
  try {
    await fiberhomePost({
      loginUrl: dev.url,
      ajaxmethod: "set_value_by_xmlnode",
      dataObj: {
        url: {
          band4: LOCK_STATE_XMLNODE.band4,
          band5: LOCK_STATE_XMLNODE.band5,
          enable: LOCK_STATE_XMLNODE.enable,
        },
        value: {
          band4: lockState.value.band4.join(","),
          band5: lockState.value.band5.join(","),
          enable: "0",
        },
      },
    });
    ElMessage.success("已解除锁频段");
    await fetchLockState();
  } catch (err) {
    ElMessage.error(`解除失败：${String(err)}`);
  } finally {
    lockBandSaving.value = false;
  }
}

// ── 锁小区 ─────────────────────────────────────────────
// act: "1"=4G LTE, "2"=5G NR
type CellAct = "1" | "2";

interface LockCellItem {
  /** 在 LockCellList.LockCell. 中的 1-based 索引，用于删除 */
  index: number;
  act: CellAct;
  arfcn: string;
  pci: string;
}

const LOCK_CELL_URL = "X_FH_MobileNetwork.LockCellList.LockCell.";

const lockCells = ref<LockCellItem[]>([]);
const lockCellsLoading = ref(false);
const lockCellsError = ref("");

const showLockCellDialog = ref(false);
const lockCellForm = reactive<{
  act: CellAct;
  arfcn: string;
  pci: string;
}>({
  act: "2",
  arfcn: "",
  pci: "",
});
const lockCellSaving = ref(false);

function actLabel(act: string): string {
  return act === "2" ? "5G NR" : act === "1" ? "4G LTE" : `act=${act}`;
}

function normalizeCellAct(v: unknown): CellAct {
  return String(v ?? "").trim() === "1" ? "1" : "2";
}

async function fetchLockCells() {
  const dev = selectedDevice.value;
  if (!dev) return;
  lockCellsLoading.value = true;
  lockCellsError.value = "";
  try {
    const raw = await fiberhomePost({
      loginUrl: dev.url,
      ajaxmethod: "get_xml_childnode_value",
      dataObj: {
        url: LOCK_CELL_URL,
        node: { act: "act", arfcn: "arfcn", pci: "pci" },
      },
    });
    // 后端返回形如 {"data":[{"child_node_idx":1,"act":"2","arfcn":"504990","pci":"279"}]}
    // 兼容：数组、{data:[...]}、{ "1": {...}, "2": {...} } 三种
    let arr: Array<Record<string, unknown>> = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          arr = parsed;
        } else if (parsed && typeof parsed === "object") {
          if (Array.isArray((parsed as { data?: unknown }).data)) {
            arr = (parsed as { data: Array<Record<string, unknown>> }).data;
          } else {
            arr = Object.keys(parsed)
              .sort((a, b) => Number(a) - Number(b))
              .map((k) => (parsed as Record<string, Record<string, unknown>>)[k]);
          }
        }
      } catch {
        /* 非 JSON 留空 */
      }
    }
    lockCells.value = arr.map((it, i) => ({
      index: Number(it?.child_node_idx ?? i + 1),
      act: normalizeCellAct(it?.act),
      arfcn: String(it?.arfcn ?? ""),
      pci: String(it?.pci ?? ""),
    }));
  } catch (err) {
    lockCellsError.value = String(err);
    lockCells.value = [];
  } finally {
    lockCellsLoading.value = false;
  }
}

function openLockCellDialog(prefill?: { arfcn?: string; pci?: string; act?: CellAct }) {
  if (!selectedDevice.value) {
    ElMessage.warning("请先选择设备");
    return;
  }
  lockCellForm.act = prefill?.act ?? lockCellForm.act ?? "2";
  lockCellForm.arfcn = prefill?.arfcn ?? "";
  lockCellForm.pci = prefill?.pci ?? "";
  showLockCellDialog.value = true;
}

async function addLockCell() {
  const dev = selectedDevice.value;
  if (!dev) return;
  const arfcn = Number(lockCellForm.arfcn);
  const pci = Number(lockCellForm.pci);
  if (!Number.isFinite(arfcn) || arfcn <= 0) {
    ElMessage.error("ARFCN/EARFCN 必须是正整数");
    return;
  }
  if (!Number.isFinite(pci) || pci < 0 || pci > 1007) {
    ElMessage.error("PCI 范围 0~1007");
    return;
  }
  lockCellSaving.value = true;
  try {
    await fiberhomePost({
      loginUrl: dev.url,
      ajaxmethod: "add_set_xmlnode",
      dataObj: {
        url: LOCK_CELL_URL,
        setNode: {
          url: { act: "act", arfcn: "arfcn", pci: "pci" },
          value: {
            act: lockCellForm.act,
            arfcn,
            pci: String(pci),
          },
        },
      },
    });
    ElMessage.success("已添加锁小区");
    showLockCellDialog.value = false;
    await fetchLockCells();
  } catch (err) {
    ElMessage.error(`添加失败：${String(err)}`);
  } finally {
    lockCellSaving.value = false;
  }
}

async function deleteLockCell(item: LockCellItem) {
  const dev = selectedDevice.value;
  if (!dev) return;
  try {
    await ElMessageBox.confirm(
      `确定删除第 ${item.index} 条锁小区（${actLabel(item.act)} ARFCN=${item.arfcn} PCI=${item.pci}）？`,
      "删除锁小区",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" },
    );
  } catch {
    return;
  }
  try {
    await fiberhomePost({
      loginUrl: dev.url,
      ajaxmethod: "del_xmlnode",
      dataObj: { url: LOCK_CELL_URL, index: item.index },
    });
    ElMessage.success("已删除");
    await fetchLockCells();
  } catch (err) {
    ElMessage.error(`删除失败：${String(err)}`);
  }
}

async function setLockCellEnable(enable: boolean) {
  const dev = selectedDevice.value;
  if (!dev) return;
  if (enable && lockCells.value.length === 0) {
    ElMessage.warning("请先添加至少 1 个锁小区，再启用功能");
    return;
  }
  if (enable && lockState.value.enable) {
    ElMessage.warning("锁频段已启用，请先关闭锁频段后再启用锁小区");
    return;
  }
  try {
    await fiberhomePost({
      loginUrl: dev.url,
      ajaxmethod: "set_value_by_xmlnode",
      dataObj: {
        url: { Enable: LOCK_STATE_XMLNODE.LockCellEnable },
        value: { Enable: enable ? "1" : "0" },
      },
    });
    lockState.value = { ...lockState.value, lockCellEnable: enable };
    ElMessage.success(enable ? "锁小区已启用" : "锁小区已关闭");
    // 同步一次状态，以防后端联动改了其他字段
    await fetchLockState();
  } catch (err) {
    ElMessage.error(`操作失败：${String(err)}`);
  }
}

function lockNeighborCell(n: { pci: string; earfcn: string; band: string }) {
  // band 字符串包含 'n' / 'N' 视为 5G NR
  const act: CellAct = /n/i.test(n.band) ? "2" : "1";
  openLockCellDialog({ act, arfcn: n.earfcn, pci: n.pci });
}
</script>

<template>
  <section class="h-screen overflow-y-auto px-[18px] pb-[104px] pt-[70px]">
    <header class="mb-4 flex items-center justify-between gap-2">
      <div class="min-w-0">
        <p class="mb-1 text-[13px] font-bold uppercase tracking-widest text-slate-500">邻区信号</p>
        <h1 class="m-0 text-[24px] leading-tight">附近基站扫描</h1>
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
      <!-- 服务小区简要 -->
      <el-card
        v-if="radio"
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '14px 16px' }"
      >
        <div class="mb-2 flex items-center justify-between">
          <h3 class="m-0 text-[15px] font-semibold">服务小区</h3>
          <span class="text-[12px] text-slate-500">
            {{ radio.WorkMode || "--" }} · BAND {{ radio.NR_BAND || radio.BAND || "--" }}
          </span>
        </div>
        <div class="grid grid-cols-3 gap-x-3 gap-y-1 text-[12px]">
          <div class="flex justify-between">
            <span class="text-slate-400">PCI</span>
            <span>{{ radio.PCI || "--" }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">RSRP</span>
            <span :class="metricClass('NR_RSRP', radio.SSB_RSRP ?? radio.RSRP)">
              {{ radio.SSB_RSRP || radio.RSRP || "--" }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">SINR</span>
            <span :class="metricClass('NR_SINR', radio.SSB_SINR ?? radio.SINR)">
              {{ radio.SSB_SINR || radio.SINR || "--" }}
            </span>
          </div>
        </div>
      </el-card>

      <!-- 邻区表格 -->
      <el-card
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '14px 16px' }"
      >
        <div class="mb-2 flex items-center justify-between">
          <h3 class="m-0 text-[15px] font-semibold">
            邻区列表 ({{ neighbors.length }})
          </h3>
        </div>
        <div v-if="!selectedDevice" class="py-6 text-center text-[13px] text-slate-500">
          请选择设备
        </div>
        <div
          v-else-if="neighbors.length === 0 && !loading"
          class="py-6 text-center text-[13px] text-slate-500"
        >
          暂无邻区数据
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-[12px]">
            <thead class="text-slate-400">
              <tr class="border-b border-slate-200/60">
                <th class="py-1 text-left font-normal">#</th>
                <th class="py-1 text-left font-normal">PCI</th>
                <th class="py-1 text-left font-normal">EARFCN</th>
                <th class="py-1 text-left font-normal">Band</th>
                <th class="py-1 text-right font-normal">RSRP</th>
                <th class="py-1 text-right font-normal">SINR</th>
                <th class="py-1 text-right font-normal"></th>
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
                <td class="py-1 text-right" :class="metricClass('NR_RSRP', n.rsrp)">
                  {{ n.rsrp }}
                </td>
                <td class="py-1 text-right" :class="metricClass('NR_SINR', n.sinr)">
                  {{ n.sinr }}
                </td>
                <td class="py-1 text-right">
                  <el-button
                    size="small"
                    text
                    type="primary"
                    class="!h-6 !px-1"
                    @click="lockNeighborCell(n)"
                  >
                    <Icon icon="mdi:lock-outline" width="14" />
                  </el-button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </el-card>

      <!-- 锁频段 -->
      <el-card
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '14px 16px' }"
      >
        <div class="mb-2 flex items-center justify-between">
          <h3 class="m-0 text-[15px] font-semibold">
            <Icon icon="mdi:antenna" width="16" class="mr-1 inline text-[#2f6bff]" />
            锁频段
          </h3>
          <el-button
            text
            size="small"
            :loading="lockStateLoading"
            class="!h-6 !px-1 !text-slate-400"
            @click="fetchLockState"
          >
            <Icon icon="mdi:refresh" width="14" />
          </el-button>
        </div>

        <el-alert
          v-if="lockStateError"
          type="error"
          show-icon
          :closable="false"
          :title="`状态获取失败：${lockStateError}`"
          class="!mb-2 !rounded-xl"
        />

        <div class="mb-2 flex flex-wrap items-center gap-2">
          <el-tag
            size="small"
            round
            :type="lockState.enable ? 'primary' : 'info'"
            :effect="lockState.enable ? 'dark' : 'plain'"
          >
            <Icon
              :icon="lockState.enable ? 'mdi:lock' : 'mdi:lock-open-variant-outline'"
              width="12"
              class="mr-0.5 inline"
            />
            {{ lockState.enable ? "已启用" : "未启用" }}
          </el-tag>
          <el-tag
            v-if="lockState.lockCellEnable"
            size="small"
            round
            type="warning"
            effect="plain"
          >
            <Icon icon="mdi:cellphone-marker" width="12" class="mr-0.5 inline" />
            锁小区已开启
          </el-tag>
          <el-tag
            v-if="mobileState?.airplane"
            size="small"
            round
            type="danger"
            effect="plain"
          >
            <Icon icon="mdi:airplane" width="12" class="mr-0.5 inline" />
            飞行模式
          </el-tag>
        </div>

        <div class="grid grid-cols-2 gap-3 text-[12px]">
          <div class="rounded-xl bg-[#eef5ff] px-3 py-2">
            <p class="m-0 mb-1 text-[11px] text-[#2f6bff]">5G NR 频段</p>
            <div v-if="lockState.band5.length === 0" class="text-slate-400">--</div>
            <div v-else class="flex flex-wrap gap-1">
              <el-tag
                v-for="b in lockState.band5"
                :key="`nr-${b}`"
                size="small"
                round
                type="primary"
              >
                {{ nrBandLabel(b) }}
              </el-tag>
            </div>
          </div>
          <div class="rounded-xl bg-emerald-50 px-3 py-2">
            <p class="m-0 mb-1 text-[11px] text-emerald-700">4G LTE 频段</p>
            <div v-if="lockState.band4.length === 0" class="text-slate-400">--</div>
            <div v-else class="flex flex-wrap gap-1">
              <el-tag
                v-for="b in lockState.band4"
                :key="`lte-${b}`"
                size="small"
                round
                type="success"
              >
                {{ lteBandLabel(b) }}
              </el-tag>
            </div>
          </div>
        </div>

        <div class="mt-3 flex justify-end gap-2">
          <el-button
            size="small"
            round
            :disabled="!lockState.enable"
            :loading="lockBandSaving"
            @click="unlockBand"
          >
            <Icon icon="mdi:lock-open-variant-outline" width="14" class="mr-1" />解锁
          </el-button>
          <el-button size="small" round type="primary" @click="openLockBandDialog">
            <Icon icon="mdi:tune-variant" width="14" class="mr-1" />配置
          </el-button>
        </div>
      </el-card>

      <!-- 锁小区 -->
      <el-card
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '14px 16px' }"
      >
        <div class="mb-2 flex items-center justify-between">
          <h3 class="m-0 text-[15px] font-semibold">
            <Icon icon="mdi:cellphone-marker" width="16" class="mr-1 inline text-[#2f6bff]" />
            锁小区
          </h3>
          <div class="flex items-center gap-2">
            <el-tooltip
              v-if="lockState.enable"
              content="锁频段已开启，无法同时启用锁小区"
              placement="top"
            >
              <el-switch
                :model-value="lockState.lockCellEnable"
                disabled
              />
            </el-tooltip>
            <el-switch
              v-else
              :model-value="lockState.lockCellEnable"
              :disabled="!selectedDevice"
              @update:model-value="(v) => setLockCellEnable(Boolean(v))"
            />
            <el-button
              text
              size="small"
              :loading="lockCellsLoading"
              class="!h-6 !px-1 !text-slate-400"
              @click="fetchLockCells"
            >
              <Icon icon="mdi:refresh" width="14" />
            </el-button>
          </div>
        </div>

        <el-alert
          v-if="lockCellsError"
          type="error"
          show-icon
          :closable="false"
          :title="`列表获取失败：${lockCellsError}`"
          class="!mb-2 !rounded-xl"
        />

        <p class="m-0 mb-2 text-[12px] text-slate-500">
          列表支持多条，启用开关后设备会强制驻留以下小区之一。
        </p>

        <div v-if="!selectedDevice" class="py-4 text-center text-[12px] text-slate-400">
          请先选择设备
        </div>
        <div
          v-else-if="lockCells.length === 0"
          class="py-4 text-center text-[12px] text-slate-400"
        >
          暂无锁小区，请添加
        </div>
        <div v-else class="space-y-1.5">
          <div
            v-for="item in lockCells"
            :key="item.index"
            class="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[12px]"
          >
            <span class="w-6 shrink-0 text-slate-400">#{{ item.index }}</span>
            <el-tag
              size="small"
              round
              :type="item.act === '2' ? 'primary' : 'success'"
              effect="plain"
            >
              {{ actLabel(item.act) }}
            </el-tag>
            <span class="grow truncate">
              <span class="text-slate-400">ARFCN</span>
              <span class="ml-1 font-semibold">{{ item.arfcn || "--" }}</span>
              <span class="ml-3 text-slate-400">PCI</span>
              <span class="ml-1 font-semibold">{{ item.pci || "--" }}</span>
            </span>
            <el-button
              size="small"
              text
              type="danger"
              class="!h-6 !px-1"
              @click="deleteLockCell(item)"
            >
              <Icon icon="mdi:trash-can-outline" width="14" />
            </el-button>
          </div>
        </div>

        <div class="mt-3 flex justify-end">
          <el-button size="small" round type="primary" @click="openLockCellDialog()">
            <Icon icon="mdi:plus" width="14" class="mr-1" />添加锁小区
          </el-button>
        </div>
      </el-card>
    </div>

    <!-- 锁频段对话框 -->
    <el-dialog
      v-model="showLockBandDialog"
      title="锁频段"
      width="92%"
      align-center
      :close-on-click-modal="false"
      class="rounded-3xl"
    >
      <el-alert
        type="warning"
        show-icon
        :closable="false"
        title="若锁定的频段无覆盖，设备将无法上网，请谨慎操作。"
        class="!mb-3"
      />
      <el-form :model="lockBandForm" label-position="top" size="default">
        <el-alert
          v-if="lockState.lockCellEnable"
          type="info"
          show-icon
          :closable="false"
          title="锁小区当前已开启，与锁频段互斥，无法同时启用。请先在「锁小区」卡片关闭后再启用。"
          class="!mb-3"
        />
        <el-form-item label="启用锁频段">
          <el-switch
            v-model="lockBandForm.enable"
            :disabled="lockState.lockCellEnable"
          />
          <span class="ml-2 text-[12px] text-slate-500">
            关闭后清单仍保留，但设备将自由接入所有频段。
          </span>
        </el-form-item>

        <el-form-item label="5G NR 频段（多选）">
          <el-select
            v-model="lockBandForm.band5"
            multiple
            filterable
            placeholder="例如 N41, N78"
            class="w-full"
            :disabled="!lockBandForm.enable"
          >
            <el-option
              v-for="b in nrBandOptions"
              :key="b.value"
              :value="b.value"
              :label="b.name"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="4G LTE 频段（多选）">
          <el-select
            v-model="lockBandForm.band4"
            multiple
            filterable
            placeholder="例如 B3, B41"
            class="w-full"
            :disabled="!lockBandForm.enable"
          >
            <el-option
              v-for="b in lteBandOptions"
              :key="b.value"
              :value="b.value"
              :label="b.name"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button round @click="showLockBandDialog = false">取消</el-button>
          <el-button round type="primary" :loading="lockBandSaving" @click="saveLockBand">
            <Icon icon="mdi:content-save-outline" width="14" class="mr-1" />下发
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 锁小区对话框 -->
    <el-dialog
      v-model="showLockCellDialog"
      title="锁小区"
      width="92%"
      align-center
      :close-on-click-modal="false"
      class="rounded-3xl"
    >
      <el-alert
        type="warning"
        show-icon
        :closable="false"
        title="若指定的小区不可达，设备将断网，请谨慎操作。"
        class="!mb-3"
      />
      <el-form :model="lockCellForm" label-position="top" size="default">
        <el-form-item label="制式">
          <el-radio-group v-model="lockCellForm.act">
            <el-radio value="2">5G NR (act=2)</el-radio>
            <el-radio value="1">4G LTE (act=1)</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="ARFCN / EARFCN（频点）">
          <el-input v-model="lockCellForm.arfcn" placeholder="例如 627264" clearable />
        </el-form-item>
        <el-form-item label="PCI (0~1007)">
          <el-input v-model="lockCellForm.pci" placeholder="例如 123" clearable />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button round @click="showLockCellDialog = false">取消</el-button>
          <el-button round type="primary" :loading="lockCellSaving" @click="addLockCell">
            <Icon icon="mdi:plus" width="14" class="mr-1" />添加
          </el-button>
        </div>
      </template>
    </el-dialog>
  </section>
</template>
