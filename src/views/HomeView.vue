<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";
import { useDevicesStore, type DeviceConfig, type Vendor } from "../stores/devices";
import { useConnectivityStore } from "../stores/connectivity";
import {
  fetchDeviceStatus,
  fiberhomePost,
  type DeviceStatus,
} from "../fiberhome";

const vendors: { value: Vendor; disabled: boolean }[] = [
  { value: "烽火", disabled: false },
  { value: "华为", disabled: true },
  { value: "中兴", disabled: true },
  { value: "鲲鹏", disabled: true },
  { value: "联通", disabled: true },
];

const defaultForm = (): DeviceConfig => ({
  name: "",
  vendor: "烽火",
  url: "http://192.168.8.1",
  username: "superadmin",
  password: "F1ber$dm",
  logo: "5G",
});

const store = useDevicesStore();
const connectivity = useConnectivityStore();
const router = useRouter();

const showAddDevice = ref(false);
const form = ref<DeviceConfig>(defaultForm());
const editingIndex = ref<number | null>(null);
const testing = ref(false);

const unsupportedVendor = computed(() => form.value.vendor !== "烽火");
const dialogTitle = computed(() => (editingIndex.value === null ? "添加 CPE 设备" : "编辑 CPE 设备"));

onMounted(async () => {
  try {
    await store.load();
  } catch (err) {
    ElMessage.error(`加载设备失败：${String(err)}`);
  }
  syncStatusMap();
  refreshAll();
  pollTimer = setInterval(refreshAll, REFRESH_INTERVAL_MS);
});

function openAddDevice() {
  form.value = defaultForm();
  editingIndex.value = null;
  showAddDevice.value = true;
}

function openEditDevice(index: number) {
  const src = store.devices[index];
  if (!src) return;
  form.value = { ...src };
  editingIndex.value = index;
  showAddDevice.value = true;
}

async function submitForm() {
  const payload: DeviceConfig = { ...form.value, name: form.value.name || "烽火 5G CPE" };
  try {
    if (editingIndex.value === null) {
      await store.add(payload);
      ElMessage.success("设备已添加");
    } else {
      await store.update(editingIndex.value, payload);
      ElMessage.success("设备已更新");
    }
    showAddDevice.value = false;
  } catch (err) {
    ElMessage.error(`保存失败：${String(err)}`);
  }
}

async function testConnectivity() {
  if (testing.value) return;
  testing.value = true;
  try {
    const data = await fiberhomePost({
      loginUrl: form.value.url,
      ajaxmethod: "DO_WEB_LOGIN",
      dataObj: {
        username: form.value.username,
        password: form.value.password,
      },
    });
    if (!data.startsWith('0|')) {
      throw new Error('密码错误或连续失败，请稍后重试')
    }
    ElMessage.success("连通性测试通过（登录成功）");
  } catch (err) {
    ElMessage.error(`连接失败：${String(err)}`);
  } finally {
    testing.value = false;
  }
}

async function duplicateDevice(index: number) {
  try {
    await store.duplicate(index);
  } catch (err) {
    ElMessage.error(`复制失败：${String(err)}`);
  }
}

async function deleteDevice(index: number) {
  try {
    await ElMessageBox.confirm("确定删除该设备？", "删除确认", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  try {
    await store.remove(index);
    ElMessage.success("已删除");
  } catch (err) {
    ElMessage.error(`删除失败：${String(err)}`);
  }
}

function openDeviceDetail(index: number) {
  router.push({ name: "device-detail", params: { index: String(index) } });
}

// ── 设备状态轮询 ───────────────────────────────────────────────
interface DeviceStatusEntry {
  status: DeviceStatus | null;
  loading: boolean;
  error: string;
}

const REFRESH_INTERVAL_MS = 5_000;

const statusMap = reactive<Record<string, DeviceStatusEntry>>({});
let pollTimer: ReturnType<typeof setInterval> | null = null;

function deviceKey(d: DeviceConfig, index: number) {
  return `${index}|${d.url}|${d.name}`;
}

function ensureEntry(key: string): DeviceStatusEntry {
  if (!statusMap[key]) {
    statusMap[key] = { status: null, loading: false, error: "" };
  }
  return statusMap[key];
}

async function refreshDeviceStatus(device: DeviceConfig, key: string) {
  const entry = ensureEntry(key);
  if (entry.loading) return;
  entry.loading = true;
  try {
    const status = await fetchDeviceStatus(device.url);
    entry.status = status;
    entry.error = "";
  } catch (err) {
    entry.error = String(err);
  } finally {
    entry.loading = false;
  }
}

async function refreshAll() {
  // FiberHome 只支持串行请求，依次刷新每台设备
  for (let i = 0; i < store.devices.length; i++) {
    const d = store.devices[i];
    await refreshDeviceStatus(d, deviceKey(d, i));
  }
}

function syncStatusMap() {
  const liveKeys = new Set(store.devices.map((d, i) => deviceKey(d, i)));
  for (const key of Object.keys(statusMap)) {
    if (!liveKeys.has(key)) delete statusMap[key];
  }
  // 新加入的设备立即触发一次状态拉取
  store.devices.forEach((d, i) => {
    const key = deviceKey(d, i);
    if (!statusMap[key]) {
      ensureEntry(key);
      refreshDeviceStatus(d, key);
    }
  });
}

watch(
  () => store.devices.map((d, i) => deviceKey(d, i)).join(","),
  () => syncStatusMap(),
);

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});

// ── 连通性辅助（数据来自全局 connectivity store） ──────────────
function connectivityClass(device: DeviceConfig, index: number): string {
  const ok = connectivity.get(device, index)?.ok;
  if (ok === true) return "bg-emerald-100 text-emerald-700";
  if (ok === false) return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-500";
}

function connectivityLabel(device: DeviceConfig, index: number): string {
  const ok = connectivity.get(device, index)?.ok;
  if (ok === true) return "在线";
  if (ok === false) return "离线";
  return "检测中";
}

function connectivityIcon(device: DeviceConfig, index: number): string {
  const ok = connectivity.get(device, index)?.ok;
  if (ok === true) return "mdi:check-circle";
  if (ok === false) return "mdi:close-circle";
  return "mdi:dots-horizontal-circle-outline";
}

// ── 状态格式化辅助 ────────────────────────────────────────────
function tempColorClass(t: number | null): string {
  if (t === null) return "bg-slate-100 text-slate-500";
  if (t < 40) return "bg-emerald-100 text-emerald-700";
  if (t < 50) return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

function fmtPercent(v: number | null): string {
  return v === null ? "--" : `${v.toFixed(0)}%`;
}

function fmtTemp(v: number | null): string {
  return v === null ? "--" : `${v.toFixed(1)}°C`;
}
</script>

<template>
  <section class="h-screen overflow-y-auto px-[18px] pb-[104px] pt-[70px]">
    <header class="mb-6 flex items-center justify-between gap-4">
      <div>
        <p class="mb-1 text-[13px] font-bold uppercase tracking-widest text-slate-500">设备管理</p>
        <h1 class="m-0 text-[28px] leading-tight">设备概览</h1>
      </div>
      <el-button
        type="primary"
        circle
        size="large"
        class="!h-11 !w-11"
        style="background: linear-gradient(135deg, #2f6bff, #24c8db); border: 0; box-shadow: 0 12px 24px rgba(47, 107, 255, 0.28);"
        aria-label="添加设备"
        @click="openAddDevice"
      >
        <Icon icon="mdi:plus" width="22" />
      </el-button>
    </header>

    <el-card
      v-if="store.devices.length === 0"
      shadow="never"
      class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
      :body-style="{ padding: '32px 24px' }"
    >
      <div class="flex min-h-[300px] flex-col items-center justify-center text-center">
        <div class="mb-4 grid h-[76px] w-[76px] place-items-center rounded-3xl bg-[#eef5ff] text-[#2f6bff]">
          <Icon icon="mdi:router-wireless" width="42" />
        </div>
        <h2 class="mb-2 text-[18px]">请添加设备</h2>
        <p class="m-0 mb-5 max-w-[300px] text-slate-500">
          添加你的 CPE 后，可在这里查看设备信息、进入详情并管理配置。
        </p>
        <el-button type="primary" round size="large" @click="openAddDevice">
          <Icon icon="mdi:plus" width="16" class="mr-1" />
          添加设备
        </el-button>
      </div>
    </el-card>

    <div v-else class="grid gap-3.5">
      <el-card
        v-for="(device, index) in store.devices"
        :key="`${device.name}-${index}`"
        shadow="never"
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg cursor-pointer transition-shadow hover:!shadow-md"
        :body-style="{ padding: '16px' }"
        @click="openDeviceDetail(index)"
      >
        <div class="flex items-start gap-3">
          <div class="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-2xl bg-[#eef5ff] text-[#2f6bff]">
            <Icon icon="mdi:access-point-network" width="28" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <h2 class="mb-0.5 truncate text-[16px] font-semibold">{{ device.name }}</h2>
                <p class="m-0 truncate text-[13px] text-slate-500">
                  {{ device.vendor }} · {{ device.username }}
                </p>
                <span class="block truncate text-[13px] text-slate-500">{{ device.url }}</span>
              </div>
              <span
                class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold"
                :class="tempColorClass(statusMap[deviceKey(device, index)]?.status?.temperatureC ?? null)"
              >
                <Icon icon="mdi:thermometer" width="14" />
                {{ fmtTemp(statusMap[deviceKey(device, index)]?.status?.temperatureC ?? null) }}
              </span>
              <span
                class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold"
                :class="connectivityClass(device, index)"
              >
                <Icon :icon="connectivityIcon(device, index)" width="12" />
                {{ connectivityLabel(device, index) }}
              </span>
            </div>

            <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-slate-600">
              <div class="flex items-center gap-1 truncate">
                <Icon icon="mdi:identifier" width="13" class="shrink-0 text-slate-400" />
                <span class="shrink-0 text-slate-400">SN</span>
                <span class="truncate">
                  {{ statusMap[deviceKey(device, index)]?.status?.serialNumber || "--" }}
                </span>
              </div>
              <div class="flex items-center gap-1 truncate">
                <Icon icon="mdi:tag-outline" width="13" class="shrink-0 text-slate-400" />
                <span class="shrink-0 text-slate-400">软件</span>
                <span class="truncate">
                  {{ statusMap[deviceKey(device, index)]?.status?.softwareVersion || "--" }}
                </span>
              </div>
              <div class="flex items-center gap-1 truncate">
                <Icon icon="mdi:chip" width="13" class="shrink-0 text-slate-400" />
                <span class="shrink-0 text-slate-400">CPU</span>
                <span class="truncate">
                  {{ fmtPercent(statusMap[deviceKey(device, index)]?.status?.cpuUsage ?? null) }}
                </span>
              </div>
              <div class="flex items-center gap-1 truncate">
                <Icon icon="mdi:memory" width="13" class="shrink-0 text-slate-400" />
                <span class="shrink-0 text-slate-400">内存</span>
                <span class="truncate">
                  {{ fmtPercent(statusMap[deviceKey(device, index)]?.status?.memoryUsage ?? null) }}
                </span>
              </div>
            </div>

            <div
              v-if="statusMap[deviceKey(device, index)]?.error"
              class="mt-1 truncate text-[11px] text-rose-500"
              :title="statusMap[deviceKey(device, index)]?.error"
            >
              <Icon icon="mdi:alert-circle-outline" width="12" class="mr-0.5 inline" />
              状态获取失败
            </div>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-200/50 pt-3" @click.stop>
          <el-button
            size="small"
            round
            :loading="statusMap[deviceKey(device, index)]?.loading"
            @click.stop="refreshDeviceStatus(device, deviceKey(device, index))"
          >
            <Icon icon="mdi:refresh" width="14" class="mr-1" />刷新
          </el-button>
          <el-button size="small" round @click.stop="openEditDevice(index)">
            <Icon icon="mdi:pencil-outline" width="14" class="mr-1" />修改
          </el-button>
          <el-button size="small" round @click.stop="duplicateDevice(index)">
            <Icon icon="mdi:content-copy" width="14" class="mr-1" />复制
          </el-button>
          <el-button size="small" round type="danger" plain @click.stop="deleteDevice(index)">
            <Icon icon="mdi:trash-can-outline" width="14" class="mr-1" />删除
          </el-button>
        </div>
      </el-card>
    </div>

    <el-dialog
      v-model="showAddDevice"
      :title="dialogTitle"
      width="92%"
      align-center
      :close-on-click-modal="false"
      class="rounded-3xl"
    >
      <el-form :model="form" label-position="top" size="large">
        <el-form-item label="厂商">
          <el-select v-model="form.vendor" class="w-full">
            <el-option
              v-for="v in vendors"
              :key="v.value"
              :value="v.value"
              :label="v.value"
              :disabled="v.disabled"
            />
          </el-select>
        </el-form-item>
        <el-alert
          v-if="unsupportedVendor"
          type="warning"
          show-icon
          :closable="false"
          title="当前仅支持烽火设备，其他厂商后续接入。"
          class="mb-3"
        />
        <el-form-item label="设备名称">
          <el-input v-model="form.name" placeholder="例如：客厅 5G CPE" />
        </el-form-item>
        <el-form-item label="登录 IP 或 URL">
          <el-input v-model="form.url" placeholder="http://192.168.8.1" />
        </el-form-item>
        <el-form-item label="登录用户名">
          <el-input v-model="form.username" placeholder="superadmin" />
        </el-form-item>
        <el-form-item label="登录密码">
          <el-input v-model="form.password" type="password" show-password placeholder="F1ber$dm" />
        </el-form-item>
        <el-form-item label="Logo">
          <el-input v-model="form.logo" maxlength="2" placeholder="5G" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="flex justify-between gap-2">
          <el-button round :loading="testing" @click="testConnectivity">
            <Icon icon="mdi:lan-connect" width="14" class="mr-1" />测试连通性
          </el-button>
          <el-button
            type="primary"
            round
            :disabled="unsupportedVendor"
            @click="submitForm"
          >
            {{ editingIndex === null ? "确认添加" : "保存修改" }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </section>
</template>
