# 烽火 5G CPE 管理后台 API 公开资料整理

> 适用范围：基于公开文章对烽火 FiberHome LG6121F 5G CPE 管理后台接口的整理，用于自有设备管理、状态读取和后续客户端适配设计。
>
> 注意：不同固件版本、运营商定制版本可能存在差异。本文只记录公开资料中能确认或可合理归类的接口；涉及未授权读取敏感信息、命令注入、开启调试服务等高风险内容，仅做风险提示，不收录可直接复现的操作步骤。

## 资料来源

- Codming：`https://codming.com/posts/fiberhome-lg6121f-5g-cpe-research/`
  - 该站点当前证书过期，常规 HTTPS 校验会失败。
  - 文章包含 LG6121F Web API 调用流程、部分接口路径和安全研究内容。
- ACWiFi：`https://www.acwifi.net/17162.html`
  - Codming 文章中出现的外部参考链接。

## 基础地址与接口分组

默认管理地址常见为：

```text
http://192.168.8.1
```

公开资料中出现的 API 前缀：

| 路径 | 作用概述 |
| --- | --- |
| `/api/tmp/FHNCAPIS` | 非登录或通用配置读取类接口。公开资料中用于获取临时 `sessionid`，也出现过 XML 节点读取能力。 |
| `/api/sign/DO_WEB_LOGIN` | Web 登录接口。 |
| `/api/tmp/FHAPIS` | 登录后业务接口集合。公开资料中出现 `set_at_command`。 |
| `/api/tmp/FHTOOLAPIS` | 工具类接口集合。公开文章只列出路径，未确认具体 `ajaxmethod`。 |

接口通常通过 `ajaxmethod` 区分具体动作：

```text
GET  /api/tmp/FHNCAPIS?ajaxmethod=<method>
POST /api/tmp/FHNCAPIS
POST /api/tmp/FHAPIS
POST /api/sign/DO_WEB_LOGIN
```

## 请求加密与会话机制

公开文章显示，部分接口载荷不是明文 JSON，而是 AES 加密后的 HEX 字符串。

已公开的关键点：

| 项 | 公开资料中的描述 |
| --- | --- |
| AES 模式 | AES-128-CBC |
| Padding | PKCS#7 |
| IV | 固定字节序列 `0x70` 到 `0x7f`，即 `707172737475767778797a7b7c7d7e7f` |
| Key 来源 | 先获取 `sessionid`，取前 16 字节作为 AES key |
| 编码 | 加密结果以 HEX 形式传输；响应也可能需要使用同一 key 解密 |

### 获取临时 sessionid

```http
GET /api/tmp/FHNCAPIS?ajaxmethod=get_refresh_sessionid
```

用途：获取一次 Web API 调用链使用的 `sessionid`。

典型响应结构：

```json
{
  "sessionid": "xxxxxxxxxxxxxxxx..."
}
```

说明：

- `sessionid` 既作为请求字段传入，也用于派生 AES key。
- 公开资料显示 key 取 `sessionid[:16]`。

## 登录与凭证流程

### Web 登录

```http
POST /api/sign/DO_WEB_LOGIN
```

请求业务字段：

```json
{
  "dataObj": {
    "username": "<用户名>",
    "password": "<密码>"
  },
  "ajaxmethod": "DO_WEB_LOGIN",
  "sessionid": "<sessionid>"
}
```

用途：使用 Web 管理后台账号登录。

注意：

- 公开文章中示例账号为 `superadmin`，但实际账号、密码取决于设备和运营商固件。
- 该请求体通常需要按上文 AES 流程加密后提交。
- 后续 `/api/tmp/FHAPIS` 类接口通常依赖已登录会话。

### 获取 API 请求凭证

公开资料能确认的凭证链路：

1. 调用 `get_refresh_sessionid` 获取 `sessionid`。
2. 使用 `sessionid` 前 16 字节派生 AES key。
3. 加密登录请求调用 `/api/sign/DO_WEB_LOGIN`。
4. 登录成功后继续携带同一类 `sessionid` 字段，并按相同规则加密业务请求。

可建模为：

```text
sessionid -> AES key -> encrypted login -> encrypted API calls
```

## 配置读取类接口

### 读取 XML/配置节点

```http
POST /api/tmp/FHNCAPIS
ajaxmethod=get_value_by_xmlnode
```

公开资料中的用途：按 XML 节点名读取设备配置。

请求业务字段形态：

```json
{
  "dataObj": {
    "<xml-node-path>": ""
  },
  "ajaxmethod": "get_value_by_xmlnode",
  "sessionid": "<sessionid>"
}
```

安全备注：

- 公开文章提到该能力可能被用于读取敏感配置，例如管理员密码节点。
- 本项目如实现该接口，应限制为读取非敏感状态字段，并避免提供任意节点读取 UI。
- 不建议在客户端内置或展示敏感节点路径。

## 射频信号参数相关接口

公开文章没有直接列出一个专门的“获取射频信号参数” HTTP `ajaxmethod`，但从接口分组和 CPE 常见实现看，射频状态可能通过以下路径之一获得：

| 可能路径 | 可能方式 | 说明 |
| --- | --- | --- |
| `/api/tmp/FHAPIS` | 登录后 `ajaxmethod` | 业务 API 集合，可能包含网络状态、NR/LTE 信息读取方法。公开资料未列出具体方法名。 |
| `/api/tmp/FHNCAPIS` + `get_value_by_xmlnode` | 读取配置/状态节点 | 可能读取 TR-069 风格节点或厂商扩展节点。公开资料未确认射频节点名。 |
| `/api/tmp/FHAPIS` + AT 查询 | 通过模组 AT 命令读取 | 公开资料确认存在 `set_at_command`，但该接口有明显安全风险，见下文。 |

客户端适配时重点关注的字段：

| 字段 | 含义 |
| --- | --- |
| `RSRP` | 参考信号接收功率，越接近 0 通常越好。 |
| `RSRQ` | 参考信号接收质量。 |
| `SINR` / `SNR` | 信号与干扰噪声比，越高越好。 |
| `PCI` | 物理小区 ID。 |
| `EARFCN` / `ARFCN` / `NRARFCN` | LTE/NR 频点号。 |
| `band` / `n*` / `B*` | 连接频段，例如 NR n78、LTE B3 等。 |
| `cell_id` / `gNB ID` / `eNB ID` | 小区或基站标识。 |
| `rat` / `mode` | 接入制式，如 LTE、NR5G、NSA、SA。 |

## 锁小区、锁频段相关接口

公开文章未直接列出“锁小区”或“锁频段”的专用 HTTP `ajaxmethod` 名称。可确认的是：文章中出现了登录后的 AT 命令通道。

### AT 命令通道

```http
POST /api/tmp/FHAPIS
ajaxmethod=set_at_command
```

公开资料中的业务字段形态：

```json
{
  "dataObj": {
    "command": "<AT command>"
  },
  "ajaxmethod": "set_at_command",
  "sessionid": "<sessionid>"
}
```

用途归类：

- 向蜂窝模组发送 AT 命令。
- 可用于查询模组状态、网络注册状态、射频参数等。
- 某些模组支持通过 AT 命令设置锁频段、锁小区、网络模式等。

安全边界：

- 公开文章指出该接口存在命令注入风险。
- 本项目不应提供任意 AT 命令执行入口。
- 如需支持锁频段/锁小区，建议实现白名单化的高级配置接口：
  - 只允许固定模板命令。
  - 参数必须做严格枚举或数值范围校验。
  - 禁止管道符、命令替换、重定向、分号、换行等 shell 元字符。
  - UI 上明确提示可能导致断网，需要支持恢复默认配置。

### 锁频段建议抽象

由于公开资料没有确认设备 Web API 的专用锁频段方法，建议在代码层抽象为：

```ts
interface BandLockRequest {
  rat: "lte" | "nr";
  bands: string[];
}
```

然后由设备适配层决定具体实现：

| 实现方式 | 适用性 |
| --- | --- |
| 专用 Web API | 优先。需从固件前端 JS 或抓包确认 `ajaxmethod`。 |
| 白名单 AT 模板 | 仅限自有设备，并确认模组 AT 指令格式后使用。 |
| 不支持 | 无法确认接口时应隐藏功能。 |

### 锁小区建议抽象

```ts
interface CellLockRequest {
  rat: "lte" | "nr";
  pci: number;
  arfcn: number;
}
```

注意：

- 锁小区通常至少需要 `PCI` + `ARFCN/NRARFCN`。
- 锁定错误小区可能导致无法注册网络。
- 应提供“一键解除锁定/恢复自动”的能力。

## 已确认接口清单

| 方法 | 路径 | ajaxmethod | 登录 | 用途 | 备注 |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/tmp/FHNCAPIS` | `get_refresh_sessionid` | 否 | 获取 `sessionid` | 用于 AES key 派生和后续请求。 |
| POST | `/api/sign/DO_WEB_LOGIN` | `DO_WEB_LOGIN` | 否 | Web 登录 | 请求体通常加密。 |
| POST | `/api/tmp/FHNCAPIS` | `get_value_by_xmlnode` | 不确定 | 读取 XML/配置节点 | 有敏感信息泄露风险；客户端应限制用途。 |
| POST | `/api/tmp/FHAPIS` | `set_at_command` | 是 | 发送 AT 命令 | 有高风险；不建议暴露任意命令入口。 |

## 需要进一步从设备前端确认的接口

若后续对自有设备进行合法适配，建议优先分析管理后台静态资源，而不是盲扫接口：

1. 下载管理后台 JS/CSS/HTML 静态资源。
2. 搜索关键字：
   - `ajaxmethod`
   - `FHAPIS`
   - `FHNCAPIS`
   - `FHTOOLAPIS`
   - `rsrp`, `rsrq`, `sinr`, `pci`, `arfcn`, `band`
   - `lock`, `cell`, `freq`, `network`, `nr`, `lte`
3. 从前端 JS 中确认专用 `ajaxmethod` 名称和请求字段。
4. 仅对自有设备用浏览器开发者工具抓取正常 UI 操作产生的请求。

优先寻找的能力：

| 能力 | 关键词 |
| --- | --- |
| 登录 | `DO_WEB_LOGIN`, `sessionid`, `password`, `username` |
| 网络状态 | `network`, `wan`, `mobile`, `cell`, `signal`, `rsrp`, `sinr` |
| NR/LTE 信息 | `nr`, `lte`, `5g`, `rat`, `nsa`, `sa` |
| 锁频段 | `band`, `lockband`, `bandlock`, `freq`, `arfcn` |
| 锁小区 | `celllock`, `lockcell`, `pci`, `earfcn`, `nrarfcn` |
| AT 工具 | `set_at_command`, `at_command`, `atcmd` |

## 对本项目实现的建议

建议先实现只读能力：

1. `getSessionId()`
2. `login(username, password)`
3. `getSignalStatus()`
4. `getServingCell()`

对写操作分阶段实现：

1. `setBandLock()`：只接受枚举频段。
2. `setCellLock()`：只接受 `PCI + ARFCN/NRARFCN` 数值参数。
3. `clearLocks()`：恢复自动选频/自动小区。

实现原则：

- 不保存明文密码；如需保存，使用系统密钥链或 Tauri 安全存储插件。
- 不暴露任意 XML 节点读取。
- 不暴露任意 AT 命令。
- 写操作必须二次确认，并提供恢复自动配置入口。
- 所有请求都应设置超时，并区分认证失败、设备离线、接口不存在、加密解密失败。
