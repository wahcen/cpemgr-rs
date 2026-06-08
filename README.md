# CPEMGR-RS

> 一个用 **Tauri 2 + Vue 3 + Rust** 编写的 5G CPE 设备管理桌面应用。
> 当前已完整对接 **烽火（FiberHome）** 系列 CPE 的私有加密协议，提供设备概览、邻区/锁频/锁小区、流量统计、网络代理、日志查看等功能。

GitHub：<https://github.com/wahcen/cpemgr-rs>

---

## ✨ 功能一览

### 1. 设备概览 (HomeView)
- 支持新增 / 编辑 / 复制 / 删除多台 CPE
- 设备列表轮询（默认 5 秒/次）展示：
  - SN、软件版本
  - CPU / 内存使用率
  - 5G 模组温度（按阈值红/黄/绿三色显示）
  - 连通性状态（在线/离线/检测中）
- 表单内置「测试连通性」按钮，提交前可即时验证账号密码
- 默认仅启用「烽火」厂商，其他厂商占位显示

### 2. 邻区信号 / 锁频段 / 锁小区 (NeighborSignalView)
- 服务小区简要信息（WorkMode、Band、PCI、RSRP、SINR），关键指标按质量分档染色
- 邻区列表（解析后端的 `*_NBR` 数组），每行带 🔒 按钮一键预填锁小区
- **锁频段**：
  - 拉取 `LTELockBAND` / `NRLockBAND` / `LockBandEnable` 显示当前状态
  - 频段选项与烽火 web 端 `band4Arr / band5Arr` 完全一致（B1~B43，N1~N78）
  - 通过 `set_value_by_xmlnode` 一次性下发 enable + band4 + band5
- **锁小区**：
  - `get_xml_childnode_value` 查询多条锁定项，兼容 `{"data":[…]}` / 数组 / 数字键对象多种返回
  - `add_set_xmlnode` 新增（制式：act=1 4G / act=2 5G、ARFCN、PCI）
  - `del_xmlnode` 按 `child_node_idx` 删除
  - `set_value_by_xmlnode` 切换 `LockEnable`
- **互斥保护**：锁频段与锁小区不允许同时启用，UI 自动禁用对应开关并提示

### 3. 流量统计 (TrafficStatsView)
- 设备选择 + 10 秒/次轮询
- 实时上/下行速率：基于 `TodayTotalTx/RxBytes` 在两次采样间的差分计算
- 今日 / 本月用量卡，含总量、上下行进度条（按比例）
- 自动换算单位（B/KB/MB/GB/TB、bps/Kbps/Mbps/Gbps）

### 4. 我的 / 设置 (ProfileView)
- **工具**
  - 调试 `$post` 请求：直接对任意 ajaxmethod 下发 JSON dataObj，查看解密后的明文返回
  - 设备配置导入 / 导出（JSON）
- **设置**
  - 外观主题：跟随系统 / 浅色 / 深色（即时应用 `html.dark`）
  - 关闭时缩小到托盘开关（默认关闭：点 ❌ 直接退出；打开后 ❌ → 隐藏到托盘）
- **开发者选项**
  - 网络代理：不使用代理 / 系统代理 / 自定义 HTTP/HTTPS/SOCKS5
  - 查看日志：实时显示 `tauri-plugin-log` 写入的运行时日志，含关键字过滤、2 秒自动刷新、复制、清空，自动高亮 `fiberhome::post` 与 `ERROR/WARN`

### 5. 系统托盘
- 托盘菜单：显示主界面 / GitHub 项目主页 / 关于 v{version} / 退出
- 托盘左键 → 显示并聚焦主窗口
- 「关于」弹出原生对话框，显示版本号与仓库地址
- 关闭按钮行为由「关闭时缩小到托盘」开关控制

### 6. 全局连通性检查
- 应用启动后即在后台启动一个 1 分钟/次的连通性巡检任务
- 即便用户停留在「流量统计」「邻区信号」等页面，设备在线状态依旧持续更新
- 设备列表变化时自动清理已失效条目

### 7. UI / 体验
- 全局液态玻璃风格底部 Tab（药丸形选中态 + 半透明灰底）
- 主窗体大小固定为移动端比例（430 × 820），可放大但保持宽屏比例
- 全局隐藏滚动条但保留滚动行为，符合移动端观感
- 完整暗色主题适配

---

## 🧱 技术栈

| 层 | 技术 |
| --- | --- |
| 前端框架 | Vue 3 (Composition API) + `<script setup>` |
| 路由 / 状态 | Vue Router 4 + Pinia 3 |
| UI 组件 | Element Plus 2 + Iconify (MDI 图标集) |
| 样式 | Tailwind CSS v4（`@custom-variant dark`） |
| 构建 | Vite 6 + vue-tsc |
| 桌面 Shell | Tauri 2（自定义 decorations:false、托盘、log、opener、dialog 插件） |
| 后端语言 | Rust 2021 |
| HTTP 客户端 | reqwest 0.13（rustls + cookies + JSON） |
| 加密 | aes-cbc + cipher + hex（适配烽火 AES-CBC-128 协议） |

---

## 📁 目录结构

```
cpemgr-rs/
├── src/                       # 前端源码
│   ├── views/                 # 业务页面
│   │   ├── HomeView.vue           # 设备概览
│   │   ├── DeviceDetailView.vue   # 设备详情
│   │   ├── NeighborSignalView.vue # 邻区/锁频/锁小区
│   │   ├── TrafficStatsView.vue   # 流量统计
│   │   └── ProfileView.vue        # 我的（设置/日志/调试）
│   ├── stores/
│   │   ├── devices.ts            # 设备列表持久化
│   │   ├── settings.ts           # 应用设置 + 主题 + 托盘开关
│   │   └── connectivity.ts       # 1 分钟全局连通性巡检
│   ├── utils/signalGrade.ts      # 信号指标分档染色规则
│   ├── fiberhome.ts              # FiberHome 协议高层封装 + 串行队列
│   ├── logger.ts                 # 应用日志 invoke 包装
│   ├── App.vue                   # 顶栏 + 底部液态玻璃 Tab + 全局生命周期
│   └── styles.css                # Tailwind 入口 + 暗色主题覆盖
└── src-tauri/                 # Tauri / Rust 端
    ├── src/
    │   ├── lib.rs               # invoke 命令注册、托盘、窗口事件
    │   ├── fiberhome.rs         # 烽火协议：sessionid + AES + POST
    │   ├── settings.rs          # 应用设置持久化 + 运行时缓存
    │   └── storage.rs           # 设备列表读写 / 导入导出
    ├── capabilities/default.json # 主窗口权限清单
    ├── tauri.conf.json
    └── Cargo.toml
```

---

## 🚀 快速开始

### 环境
- Node.js ≥ 18
- pnpm ≥ 8
- Rust stable toolchain
- Windows / macOS / Linux 桌面端

### 安装依赖
```bash
pnpm install
```

### 开发模式（热重载 + Tauri 桌面壳）
```bash
pnpm tauri dev
```

### 仅启动前端（浏览器调试，部分 Tauri API 不可用）
```bash
pnpm dev
```

### 类型检查 / 构建
```bash
pnpm build              # vue-tsc --noEmit && vite build
pnpm tauri build        # 打包桌面安装包
```

---

## 🔌 与 FiberHome CPE 的协议要点

> 仅作技术说明，对接其他厂商需另行实现。

### 串行约束
- 烽火设备只支持串行 POST：并发会导致 sessionid 互相覆盖。
- 前端在 `src/fiberhome.ts` 内置全局 promise 队列（`enqueuePost`），所有 `fiberhomePost / fiberhomePostJson` 自动串行。
- 后端在 `src-tauri/src/fiberhome.rs` 内同样按串行流程：先取 token → 加密 payload → 发送 → 解密返回。

### 典型调用
| 用途 | ajaxmethod | dataObj 示例 |
| --- | --- | --- |
| 读取 XML 节点 | `get_value_by_xmlnode` | `{ "Foo": "DeviceInfo.Foo" }` |
| 写入 XML 节点 | `set_value_by_xmlnode` | `{ url:{...}, value:{...} }` |
| 新增列表条目 | `add_set_xmlnode` | `{ url:"...List.Item.", setNode:{url,value} }` |
| 删除列表条目 | `del_xmlnode` | `{ url:"...List.Item.", index: 2 }` |
| 查询列表 | `get_xml_childnode_value` | `{ url, node:{...} }` |
| 登录 | `DO_WEB_LOGIN` | `{ username, password }` |

### 加密
- 每次请求依赖 `get_refresh_sessionid` 拿到 16 字节 key
- payload 用 AES-128-CBC（IV = key）加密后 hex 编码
- 响应同样是 hex，解密后多为 JSON 字符串

---

## ⚙️ 应用数据 / 日志位置

- 设备列表：`{app_data_dir}/devices.json`
- 应用设置：`{app_data_dir}/settings.json`
- 运行日志：`{app_log_dir}/*.log`（2MB 滚动，由 `tauri-plugin-log` 管理）

Windows 默认为 `%APPDATA%\com.cpemgr.app\`。
日志在「我的 → 开发者选项 → 查看日志」中可直接查看 / 复制 / 清空。

---

## 📦 发版（GitHub Actions）

仓库内置两条 workflow，均为 **手动触发**（GitHub 仓库 → Actions → 选 workflow → Run workflow）：

| Workflow | 产物 | Runner |
| --- | --- | --- |
| `Release Desktop` | `cpemgr-rs_<ver>_x64-setup.exe`、`cpemgr-rs_<ver>_x64_en-US.msi`、`cpemgr-rs_<ver>_amd64.AppImage` | windows-latest / ubuntu-22.04 |
| `Release Android` | `cpemgr-rs-<ver>-android-arm64-v8a.apk`（debug 签名） | ubuntu-latest |

### 步骤
1. 进入 GitHub 仓库的 **Actions** 标签
2. 选择 **Release Desktop**，点击 **Run workflow**
   - `version`：填要发布的版本号，例如 `v0.1.0`（会作为 tag 与 release 名）
   - `draft`：默认 `true`，会创建草稿 release，方便审阅后再发布
3. 等桌面构建完成后，再以**相同的 version** 触发 **Release Android**，APK 会追加到同一个 release
4. 在 Releases 页面校对产物，去掉草稿状态即发布

### 关于 Android APK
- 仅构建 **arm64-v8a**（覆盖 99% 现役安卓设备）
- CI 使用 Android **debug keystore** 自动签名，可直接安装运行
- ⚠️ debug 签名 APK 与未来 release 签名 APK **不能互相覆盖升级**；如需正式分发，请改用自有 keystore（通过 GitHub Secrets 注入并调整 `android.yml`）

### 本地手动构建
```bash
# 桌面（当前平台）
pnpm tauri build

# 仅出 AppImage（Linux）
pnpm tauri build --bundles appimage

# Android（需本地配置 JDK17 + Android SDK + NDK + ANDROID_NDK_HOME）
pnpm tauri android init           # 首次执行
pnpm tauri android build --target aarch64 --apk --debug
```

---

## 🧭 路线图（未实现 / 待对接）

- 飞行模式开关、设备重启（接口已知，UI 占位）
- 月度流量趋势图（已有结构，待数据源）
- 其他厂商（华为 / 中兴 / 鲲鹏 / 联通）协议适配
- 多语言（当前简体中文）

---

## 📝 许可

MIT
