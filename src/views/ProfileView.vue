<script setup lang="ts">
import { computed, ref } from "vue";
import { Icon } from "@iconify/vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useDevicesStore } from "../stores/devices";
import { fiberhomePost } from "../fiberhome";

const store = useDevicesStore();
const busy = ref(false);

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
      class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
      :body-style="{ padding: '32px 24px' }"
    >
      <div class="flex min-h-[180px] flex-col items-center justify-center text-center">
        <div class="mb-4 grid h-[76px] w-[76px] place-items-center rounded-3xl bg-[#eef5ff] text-[#2f6bff]">
          <Icon icon="mdi:account-circle-outline" width="48" />
        </div>
        <h2 class="mb-2 text-[18px]">预留页面</h2>
        <p class="m-0 max-w-[300px] text-slate-500">
          这里暂时留空，后续可放置应用设置、数据备份和关于信息。
        </p>
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
  </section>
</template>
