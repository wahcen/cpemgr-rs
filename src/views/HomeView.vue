<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Icon } from "@iconify/vue";
import { useDevicesStore, type DeviceConfig, type Vendor } from "../stores/devices";
import { fiberhomePost } from "../fiberhome";

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
    if (!data.startsWith('9|')) {
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
        class="!rounded-3xl !border-slate-300/30 !bg-white/80 backdrop-blur-lg"
        :body-style="{ padding: '16px' }"
      >
        <div class="grid grid-cols-[54px_1fr] gap-3">
          <div class="grid h-[54px] w-[54px] place-items-center rounded-2xl bg-[#eef5ff] text-[#2f6bff]">
            <Icon icon="mdi:access-point-network" width="28" />
          </div>
          <div class="min-w-0">
            <h2 class="mb-0.5 truncate text-[16px] font-semibold">{{ device.name }}</h2>
            <p class="m-0 truncate text-[13px] text-slate-500">
              {{ device.vendor }} · {{ device.username }}
            </p>
            <span class="block truncate text-[13px] text-slate-500">{{ device.url }}</span>
          </div>
          <div class="col-span-2 flex justify-end gap-2 pt-2">
            <el-button size="small" round @click="openEditDevice(index)">
              <Icon icon="mdi:pencil-outline" width="14" class="mr-1" />修改
            </el-button>
            <el-button size="small" round @click="duplicateDevice(index)">
              <Icon icon="mdi:content-copy" width="14" class="mr-1" />复制
            </el-button>
            <el-button size="small" round type="danger" plain @click="deleteDevice(index)">
              <Icon icon="mdi:trash-can-outline" width="14" class="mr-1" />删除
            </el-button>
          </div>
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
