<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Icon } from "@iconify/vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useDevicesStore } from "../stores/devices";
import {
  useSettingsStore,
  type ProxyConfig,
  type ProxyMode,
  type ThemeMode,
} from "../stores/settings";
import { fiberhomePost } from "../fiberhome";
import { readLogTail, clearLog } from "../logger";

const store = useDevicesStore();
const settingsStore = useSettingsStore();
const busy = ref(false);

onMounted(async () => {
  try {
    await settingsStore.load();
    proxyForm.value = { ...settingsStore.settings.proxy };
  } catch (err) {
    ElMessage.error(`加载设置失败：${String(err)}`);
  }
});

// ── 调试发包工具 ───────────────────────────────
const showDebugDialog = ref(false);
const debugForm = ref({
  deviceIndex: 0,
  ajaxmethod: "get_value_by_xmlnode",
  nocheck: false,
  longPath: false,
  dataObjText: '{\n  "SoftwareVersion": "DeviceInfo.SoftwareVersion"\n}',
});
const debugLoading = ref(false);
const debugResult = ref<string>("");
const debugError = ref<string>("");

const selectedDevice = computed(() => store.devices[debugForm.value.deviceIndex]);

function openDebugDialog() {
  if (store.devices.length === 0) {
    ElMessage.warning("请先在「设备概览」中添加设备");
    return;
  }
  if (debugForm.value.deviceIndex >= store.devices.length) {
    debugForm.value.deviceIndex = 0;
  }
  debugResult.value = "";
  debugError.value = "";
  showDebugDialog.value = true;
}

async function sendDebugPost() {
  const device = selectedDevice.value;
  if (!device) {
    ElMessage.error("未选择设备");
    return;
  }
  const methodName = debugForm.value.ajaxmethod.trim();
  if (!methodName) {
    ElMessage.error("ajaxmethod 不能为空");
    return;
  }

  let dataObj: unknown = null;
  const raw = debugForm.value.dataObjText.trim();
  if (raw.length > 0) {
    try {
      dataObj = JSON.parse(raw);
    } catch (err) {
      ElMessage.error(`dataObj 不是合法 JSON：${String(err)}`);
      return;
    }
  }

  debugLoading.value = true;
  debugResult.value = "";
  debugError.value = "";
  try {
    const plain = await fiberhomePost({
      loginUrl: device.url,
      ajaxmethod: methodName,
      dataObj,
      nocheck: debugForm.value.nocheck,
      longPath: debugForm.value.longPath,
    });
    // 尝试美化 JSON，失败则原样展示
    try {
      debugResult.value = JSON.stringify(JSON.parse(plain), null, 2);
    } catch {
      debugResult.value = plain;
    }
    ElMessage.success("请求完成");
  } catch (err) {
    debugError.value = String(err);
    ElMessage.error("请求失败，详情见下方");
  } finally {
    debugLoading.value = false;
  }
}

async function copyResult() {
  if (!debugResult.value) return;
  try {
    await navigator.clipboard.writeText(debugResult.value);
    ElMessage.success("已复制到剪贴板");
  } catch (err) {
    ElMessage.error(`复制失败：${String(err)}`);
  }
}

// ── 应用设置 / 主题 ────────────────────────────
const themeOptions: { value: ThemeMode; label: string; icon: string }[] = [
  { value: "system", label: "跟随系统", icon: "mdi:theme-light-dark" },
  { value: "light", label: "浅色", icon: "mdi:white-balance-sunny" },
  { value: "dark", label: "深色", icon: "mdi:weather-night" },
];

const themeLabel = computed(
  () =>
    themeOptions.find((o) => o.value === settingsStore.settings.theme)?.label ?? "跟随系统",
);

async function chooseTheme(next: ThemeMode) {
  if (next === settingsStore.settings.theme) return;
  try {
    await settingsStore.setTheme(next);
  } catch (err) {
    ElMessage.error(`切换主题失败：${String(err)}`);
  }
}

async function onToggleMinimizeToTray(v: boolean) {
  try {
    await settingsStore.setMinimizeToTrayOnClose(v);
  } catch (err) {
    ElMessage.error(`保存失败：${String(err)}`);
  }
}

// ── 开发者选项 / 代理配置 ─────────────────────────
const showProxyDialog = ref(false);
const proxySaving = ref(false);
const proxyForm = ref<ProxyConfig>({
  mode: "none",
  url: "",
  username: "",
  password: "",
});

const proxyModeLabel = computed(() => {
  switch (settingsStore.settings.proxy.mode) {
    case "system":
      return "系统代理";
    case "custom":
      return `自定义：${settingsStore.settings.proxy.url || "(未填写)"}`;
    default:
      return "未启用";
  }
});

const proxyModes: { value: ProxyMode; label: string; desc: string }[] = [
  { value: "none", label: "不使用代理", desc: "所有请求直连，忽略系统环境变量" },
  { value: "system", label: "使用系统代理", desc: "读取系统/环境变量中的 HTTP(S)_PROXY" },
  { value: "custom", label: "自定义 HTTP 代理", desc: "手动填写代理地址（支持 http/https/socks5）" },
];

function openProxyDialog() {
  proxyForm.value = { ...settingsStore.settings.proxy };
  showProxyDialog.value = true;
}

async function saveProxy() {
  if (proxyForm.value.mode === "custom") {
    const url = proxyForm.value.url.trim();
    if (!url) {
      ElMessage.error("自定义代理时必须填写代理地址");
      return;
    }
    if (!/^(https?|socks5):\/\//i.test(url)) {
      ElMessage.error("代理地址需以 http:// / https:// / socks5:// 开头");
      return;
    }
  }
  proxySaving.value = true;
  try {
    await settingsStore.saveProxy({
      ...proxyForm.value,
      url: proxyForm.value.url.trim(),
    });
    ElMessage.success("代理配置已保存");
    showProxyDialog.value = false;
  } catch (err) {
    ElMessage.error(`保存失败：${String(err)}`);
  } finally {
    proxySaving.value = false;
  }
}

// ── 开发者选项 / 日志查看 ─────────────────────────
const showLogDialog = ref(false);
const logContent = ref("");
const logLoading = ref(false);
const logAutoRefresh = ref(true);
const logFilter = ref("");
let logTimer: ReturnType<typeof setInterval> | null = null;
const logBoxRef = ref<HTMLElement | null>(null);

const filteredLogLines = computed(() => {
  if (!logContent.value) return [] as string[];
  const lines = logContent.value.split(/\r?\n/);
  if (!logFilter.value.trim()) return lines;
  const kw = logFilter.value.trim().toLowerCase();
  return lines.filter((l) => l.toLowerCase().includes(kw));
});

async function refreshLog() {
  if (logLoading.value) return;
  logLoading.value = true;
  try {
    logContent.value = await readLogTail();
    // 等下一帧再滚到底
    requestAnimationFrame(() => {
      const el = logBoxRef.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  } catch (err) {
    ElMessage.error(`读取日志失败：${String(err)}`);
  } finally {
    logLoading.value = false;
  }
}

function openLogDialog() {
  showLogDialog.value = true;
  refreshLog();
  if (logAutoRefresh.value) startLogTimer();
}

function startLogTimer() {
  stopLogTimer();
  logTimer = setInterval(refreshLog, 2000);
}

function stopLogTimer() {
  if (logTimer) {
    clearInterval(logTimer);
    logTimer = null;
  }
}

function toggleAutoRefresh(v: boolean) {
  logAutoRefresh.value = v;
  if (v) startLogTimer();
  else stopLogTimer();
}

function handleLogDialogClose() {
  stopLogTimer();
}

async function handleClearLog() {
  try {
    await ElMessageBox.confirm("确定清空当前日志文件？", "清空日志", {
      type: "warning",
      confirmButtonText: "清空",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  try {
    await clearLog();
    logContent.value = "";
    ElMessage.success("日志已清空");
  } catch (err) {
    ElMessage.error(`清空失败：${String(err)}`);
  }
}

async function copyLog() {
  if (!logContent.value) return;
  try {
    await navigator.clipboard.writeText(logContent.value);
    ElMessage.success("日志已复制");
  } catch (err) {
    ElMessage.error(`复制失败：${String(err)}`);
  }
}

// ── 导入 / 导出 ────────────────────────────────
async function handleExport() {
  if (busy.value) return;
  busy.value = true;
  try {
    const path = await save({
      title: "导出设备配置",
      defaultPath: "cpemgr-devices.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    await store.exportToPath(path);
    ElMessage.success("已导出设备配置");
  } catch (err) {
    ElMessage.error(`导出失败：${String(err)}`);
  } finally {
    busy.value = false;
  }
}

async function handleImport() {
  if (busy.value) return;
  try {
    await ElMessageBox.confirm(
      "导入将覆盖当前所有设备配置，确认继续？",
      "导入设备配置",
      { type: "warning", confirmButtonText: "导入", cancelButtonText: "取消" },
    );
  } catch {
    return;
  }
  busy.value = true;
  try {
    const selected = await open({
      title: "选择设备配置文件",
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!selected || Array.isArray(selected)) return;
    await store.importFromPath(selected);
    ElMessage.success("已导入设备配置");
  } catch (err) {
    ElMessage.error(`导入失败：${String(err)}`);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="h-screen overflow-y-auto px-[18px] pb-[104px] pt-[70px]">
    <p class="mb-1 text-[13px] font-bold uppercase tracking-widest text-slate-500">我的</p>
    <h1 class="mb-6 text-[28px] leading-tight">个人中心</h1>

    <el-card
      shadow="never"
      class="!mb-4 !rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
      :body-style="{ padding: '18px' }"
    >
      <div class="mb-3 flex items-center gap-2">
        <Icon icon="mdi:tools" width="20" class="text-[#2f6bff]" />
        <h2 class="m-0 text-[16px] font-semibold">工具</h2>
      </div>

      <div class="flex items-center justify-between gap-3 py-2">
        <div class="min-w-0">
          <p class="m-0 text-[14px] font-semibold text-[#172033]">调试 $post 请求</p>
          <p class="m-0 text-[12px] text-slate-500">
            选择设备并填写 ajaxmethod，向 CPE 发送加密 POST 并查看解密结果。
          </p>
        </div>
        <el-button round type="primary" @click="openDebugDialog">
          <Icon icon="mdi:flask-outline" width="14" class="mr-1" />
          调试
        </el-button>
      </div>

      <el-divider class="!my-2" />

      <div class="flex items-center justify-between gap-3 py-2">
        <div class="min-w-0">
          <p class="m-0 text-[14px] font-semibold text-[#172033]">导入设备配置</p>
          <p class="m-0 text-[12px] text-slate-500">从 JSON 文件恢复设备列表，会覆盖当前数据。</p>
        </div>
        <el-button round :loading="busy" @click="handleImport">
          <Icon icon="mdi:tray-arrow-down" width="14" class="mr-1" />
          导入
        </el-button>
      </div>

      <el-divider class="!my-2" />

      <div class="flex items-center justify-between gap-3 py-2">
        <div class="min-w-0">
          <p class="m-0 text-[14px] font-semibold text-[#172033]">导出设备配置</p>
          <p class="m-0 text-[12px] text-slate-500">
            将当前 {{ store.devices.length }} 台设备保存为 JSON 文件。
          </p>
        </div>
        <el-button round type="primary" plain :loading="busy" @click="handleExport">
          <Icon icon="mdi:tray-arrow-up" width="14" class="mr-1" />
          导出
        </el-button>
      </div>
    </el-card>

    <el-card
      shadow="never"
      class="!mb-4 !rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
      :body-style="{ padding: '18px' }"
    >
      <div class="mb-3 flex items-center gap-2">
        <Icon icon="mdi:cog-outline" width="20" class="text-[#2f6bff]" />
        <h2 class="m-0 text-[16px] font-semibold">设置</h2>
      </div>

      <div class="flex items-center justify-between gap-3 py-2">
        <div class="min-w-0">
          <p class="m-0 text-[14px] font-semibold text-[#172033]">外观主题</p>
          <p class="m-0 truncate text-[12px] text-slate-500">
            当前：{{ themeLabel }}
          </p>
        </div>
        <el-radio-group
          :model-value="settingsStore.settings.theme"
          size="small"
          @update:model-value="(v) => chooseTheme(v as ThemeMode)"
        >
          <el-radio-button
            v-for="opt in themeOptions"
            :key="opt.value"
            :value="opt.value"
          >
            <span class="inline-flex items-center gap-1">
              <Icon :icon="opt.icon" width="14" />
              {{ opt.label }}
            </span>
          </el-radio-button>
        </el-radio-group>
      </div>

      <el-divider class="!my-2" />

      <div class="flex items-center justify-between gap-3 py-2">
        <div class="min-w-0">
          <p class="m-0 text-[14px] font-semibold text-[#172033]">关闭时缩小到托盘</p>
          <p class="m-0 truncate text-[12px] text-slate-500">
            打开后点击窗口关闭按钮会隐藏到系统托盘，可从托盘菜单恢复或退出。
          </p>
        </div>
        <el-switch
          :model-value="settingsStore.settings.minimizeToTrayOnClose"
          @update:model-value="(v) => onToggleMinimizeToTray(Boolean(v))"
        />
      </div>
    </el-card>

    <el-card
      shadow="never"
      class="!mb-4 !rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
      :body-style="{ padding: '18px' }"
    >
      <div class="mb-3 flex items-center gap-2">
        <Icon icon="mdi:code-tags" width="20" class="text-[#2f6bff]" />
        <h2 class="m-0 text-[16px] font-semibold">开发者选项</h2>
      </div>

      <div class="flex items-center justify-between gap-3 py-2">
        <div class="min-w-0">
          <p class="m-0 text-[14px] font-semibold text-[#172033]">网络代理</p>
          <p class="m-0 truncate text-[12px] text-slate-500">
            当前：{{ proxyModeLabel }}
          </p>
        </div>
        <el-button round @click="openProxyDialog">
          <Icon icon="mdi:server-network" width="14" class="mr-1" />
          配置
        </el-button>
      </div>

      <el-divider class="!my-2" />

      <div class="flex items-center justify-between gap-3 py-2">
        <div class="min-w-0">
          <p class="m-0 text-[14px] font-semibold text-[#172033]">查看日志</p>
          <p class="m-0 truncate text-[12px] text-slate-500">
            查看 fiberhome_post 加密前请求、解密后响应等运行时日志。
          </p>
        </div>
        <el-button round @click="openLogDialog">
          <Icon icon="mdi:text-box-search-outline" width="14" class="mr-1" />
          查看
        </el-button>
      </div>
    </el-card>

    <el-dialog
      v-model="showDebugDialog"
      title="调试 $post 请求"
      width="94%"
      align-center
      :close-on-click-modal="false"
      class="rounded-3xl"
    >
      <el-form :model="debugForm" label-position="top" size="default">
        <el-form-item label="目标设备">
          <el-select v-model="debugForm.deviceIndex" class="w-full">
            <el-option
              v-for="(d, idx) in store.devices"
              :key="idx"
              :value="idx"
              :label="`${d.name} · ${d.url}`"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="ajaxmethod">
          <el-input v-model="debugForm.ajaxmethod" placeholder="例如 get_value_by_xmlnode" />
        </el-form-item>

        <el-form-item label="dataObj (JSON)">
          <el-input
            v-model="debugForm.dataObjText"
            type="textarea"
            :rows="5"
            placeholder='{ "Name": "InternetGatewayDevice.DeviceInfo.SerialNumber" }'
          />
        </el-form-item>

        <div class="flex flex-wrap gap-4">
          <el-checkbox v-model="debugForm.nocheck">nocheck (使用 FHNCAPIS)</el-checkbox>
          <el-checkbox v-model="debugForm.longPath">longPath (使用 /api/long/)</el-checkbox>
        </div>
      </el-form>

      <el-divider />

      <div class="mb-2 flex items-center justify-between">
        <span class="text-[13px] font-semibold text-slate-600">响应（已解密）</span>
        <el-button
          v-if="debugResult"
          size="small"
          text
          @click="copyResult"
        >
          <Icon icon="mdi:content-copy" width="14" class="mr-1" />
          复制
        </el-button>
      </div>
      <el-alert
        v-if="debugError"
        type="error"
        show-icon
        :closable="false"
        :title="debugError"
        class="mb-2"
      />
      <pre
        v-if="debugResult"
        class="m-0 max-h-[260px] overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-50 p-3 font-mono text-[12px] text-slate-700"
      >{{ debugResult }}</pre>
      <p v-if="!debugResult && !debugError" class="m-0 text-[12px] text-slate-400">
        发送后这里会显示解密后的明文。
      </p>

      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button round @click="showDebugDialog = false">关闭</el-button>
          <el-button round type="primary" :loading="debugLoading" @click="sendDebugPost">
            <Icon icon="mdi:send" width="14" class="mr-1" />
            发送
          </el-button>
        </div>
      </template>
    </el-dialog>
    <el-dialog
      v-model="showProxyDialog"
      title="网络代理配置"
      width="92%"
      align-center
      :close-on-click-modal="false"
      class="rounded-3xl"
    >
      <el-form :model="proxyForm" label-position="top" size="default">
        <el-form-item label="代理模式">
          <el-radio-group v-model="proxyForm.mode" class="!flex !flex-col !items-start gap-2">
            <el-radio v-for="m in proxyModes" :key="m.value" :value="m.value">
              <span class="font-semibold">{{ m.label }}</span>
              <span class="ml-2 text-[12px] text-slate-500">{{ m.desc }}</span>
            </el-radio>
          </el-radio-group>
        </el-form-item>

        <template v-if="proxyForm.mode === 'custom'">
          <el-form-item label="代理地址">
            <el-input
              v-model="proxyForm.url"
              placeholder="http://127.0.0.1:7890"
              clearable
            />
          </el-form-item>
          <el-form-item label="用户名（可选）">
            <el-input v-model="proxyForm.username" placeholder="留空表示无需认证" clearable />
          </el-form-item>
          <el-form-item label="密码（可选）">
            <el-input
              v-model="proxyForm.password"
              type="password"
              show-password
              placeholder="留空表示无需认证"
            />
          </el-form-item>
        </template>

        <el-alert
          v-if="proxyForm.mode === 'system'"
          type="info"
          show-icon
          :closable="false"
          title="将读取系统环境变量 HTTP_PROXY / HTTPS_PROXY / ALL_PROXY 与平台代理配置。"
        />
        <el-alert
          v-else-if="proxyForm.mode === 'none'"
          type="info"
          show-icon
          :closable="false"
          title="所有 CPE 请求将直连设备，忽略系统代理设置。"
        />
      </el-form>

      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button round @click="showProxyDialog = false">取消</el-button>
          <el-button round type="primary" :loading="proxySaving" @click="saveProxy">
            <Icon icon="mdi:content-save-outline" width="14" class="mr-1" />
            保存
          </el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showLogDialog"
      title="应用日志"
      width="94%"
      align-center
      :close-on-click-modal="false"
      class="rounded-3xl"
      @close="handleLogDialogClose"
    >
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <el-input
          v-model="logFilter"
          size="small"
          placeholder="按关键字过滤（区分大小写无关）"
          clearable
          class="!w-[220px]"
        >
          <template #prefix>
            <Icon icon="mdi:filter-variant" width="14" />
          </template>
        </el-input>
        <el-checkbox
          :model-value="logAutoRefresh"
          @update:model-value="(v) => toggleAutoRefresh(Boolean(v))"
        >
          每 2s 自动刷新
        </el-checkbox>
        <span class="grow" />
        <el-button size="small" round :loading="logLoading" @click="refreshLog">
          <Icon icon="mdi:refresh" width="14" class="mr-1" />刷新
        </el-button>
        <el-button size="small" round :disabled="!logContent" @click="copyLog">
          <Icon icon="mdi:content-copy" width="14" class="mr-1" />复制
        </el-button>
        <el-button size="small" round type="danger" plain @click="handleClearLog">
          <Icon icon="mdi:trash-can-outline" width="14" class="mr-1" />清空
        </el-button>
      </div>

      <div
        ref="logBoxRef"
        class="max-h-[460px] min-h-[260px] overflow-auto rounded-xl bg-slate-900/95 p-3 font-mono text-[11.5px] leading-snug text-emerald-100"
      >
        <p v-if="!logContent" class="m-0 text-slate-400">
          暂无日志（应用启动后会自动写入；触发一次设备请求即可看到 fiberhome::post 记录）
        </p>
        <template v-else>
          <div
            v-for="(line, i) in filteredLogLines"
            :key="i"
            class="whitespace-pre-wrap break-all"
            :class="{
              'text-rose-300': /ERROR|WARN/i.test(line),
              'text-sky-200': /fiberhome::post/.test(line),
            }"
          >
            {{ line }}
          </div>
        </template>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button round @click="showLogDialog = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </section>
</template>
