// 5G NR / LTE 信号指标分级工具
// 颜色规则：
//   - emerald (绿)：质量好
//   - amber   (黄)：一般
//   - rose    (红)：差
//   - slate   (灰)：缺失 / 无法判断

export type Grade = "good" | "fair" | "poor" | "unknown";

const COLOR_TEXT: Record<Grade, string> = {
  good: "text-emerald-600",
  fair: "text-amber-600",
  poor: "text-rose-600",
  unknown: "text-slate-500",
};

const COLOR_BADGE: Record<Grade, string> = {
  good: "bg-emerald-100 text-emerald-700",
  fair: "bg-amber-100 text-amber-700",
  poor: "bg-rose-100 text-rose-700",
  unknown: "bg-slate-100 text-slate-500",
};

export function gradeColorText(g: Grade): string {
  return COLOR_TEXT[g];
}

export function gradeColorBadge(g: Grade): string {
  return COLOR_BADGE[g];
}

function toNum(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * 通用阈值评估。
 * higherIsBetter=true：值越大越好；good/fair/poor 是从高到低的两个分界点
 *   例：thresholds=[a, b]，higherIsBetter=true 时
 *       n ≥ a → good；a > n ≥ b → fair；n < b → poor
 * higherIsBetter=false：值越小越好；good/fair/poor 是从低到高的两个分界点
 *   例：thresholds=[a, b]
 *       n ≤ a → good；a < n ≤ b → fair；n > b → poor
 */
function grade(v: unknown, thresholds: [number, number], higherIsBetter = true): Grade {
  const n = toNum(v);
  if (n === null) return "unknown";
  const [good, fair] = thresholds;
  if (higherIsBetter) {
    if (n >= good) return "good";
    if (n >= fair) return "fair";
    return "poor";
  } else {
    if (n <= good) return "good";
    if (n <= fair) return "fair";
    return "poor";
  }
}

// ── 各指标的具体阈值（来自常用经验值） ─────────────────
// 5G NR RSRP（SSB-RSRP）：dBm，越大越好
//   ≥ -90 良；-90~-105 一般；< -105 差
export const gradeNrRsrp = (v: unknown) => grade(v, [-90, -105], true);

// 5G NR SINR（SSB-SINR）：dB，越大越好
//   ≥ 13 良；0~13 一般；< 0 差
export const gradeNrSinr = (v: unknown) => grade(v, [13, 0], true);

// 5G NR RSRQ：dB，越大（越接近 0）越好
//   ≥ -12 良；-12~-17 一般；< -17 差
export const gradeNrRsrq = (v: unknown) => grade(v, [-12, -17], true);

// 下行带宽 (MHz)，越大越好（NR 典型 100MHz）
//   ≥ 80 良；40~80 一般；< 40 差
export const gradeDlBw = (v: unknown) => grade(v, [80, 40], true);

// 上行带宽 (MHz)，越大越好（NR UL 典型 40~100MHz）
//   ≥ 40 良；20~40 一般；< 20 差
export const gradeUlBw = (v: unknown) => grade(v, [40, 20], true);

// PUSCH 发射功率 dBm：越高代表越费功率（说明覆盖差），所以越小越好
//   ≤ 0 良；0~15 一般；> 15 差
export const gradePusch = (v: unknown) => grade(v, [0, 15], false);

// PUCCH 发射功率 dBm：同 PUSCH
//   ≤ 0 良；0~15 一般；> 15 差
export const gradePucch = (v: unknown) => grade(v, [0, 15], false);

// NR DL MCS：0~27 (256QAM)，越大越好
//   ≥ 20 良；10~20 一般；< 10 差
export const gradeNrDlMcs = (v: unknown) => grade(v, [20, 10], true);

// NR UL MCS：0~27，越大越好
//   ≥ 18 良；8~18 一般；< 8 差
export const gradeNrUlMcs = (v: unknown) => grade(v, [18, 8], true);

// NR CQI：0~15，越大越好
//   ≥ 10 良；5~10 一般；< 5 差
export const gradeNrCqi = (v: unknown) => grade(v, [10, 5], true);

// LTE RSRP：dBm，比 NR 略宽
//   ≥ -95 良；-95~-110 一般；< -110 差
export const gradeLteRsrp = (v: unknown) => grade(v, [-95, -110], true);

// LTE SINR：dB
//   ≥ 13 良；0~13 一般；< 0 差
export const gradeLteSinr = (v: unknown) => grade(v, [13, 0], true);

// LTE RSRQ：dB
//   ≥ -10 良；-10~-15 一般；< -15 差
export const gradeLteRsrq = (v: unknown) => grade(v, [-10, -15], true);

// RSSI：dBm
//   ≥ -65 良；-65~-85 一般；< -85 差
export const gradeRssi = (v: unknown) => grade(v, [-65, -85], true);

// 通用导出：根据指标 key 取颜色
// 调用方：gradeOf("NR_RSRP", val) → Grade
export function gradeOf(metric: string, v: unknown): Grade {
  switch (metric) {
    case "NR_RSRP":
    case "SSB_RSRP":
      return gradeNrRsrp(v);
    case "NR_SINR":
    case "SSB_SINR":
      return gradeNrSinr(v);
    case "NR_RSRQ":
      return gradeNrRsrq(v);
    case "NR_DLBW":
    case "PCC_DlBandWidth":
      return gradeDlBw(v);
    case "NR_ULBW":
    case "PCC_UlBandWidth":
      return gradeUlBw(v);
    case "PUSCH":
    case "NR_Power":
    case "LTE_Power":
      return gradePusch(v);
    case "PUCCH":
    case "PCC_PucchTxPower":
      return gradePucch(v);
    case "NR_DLMCS":
    case "PCC_DlMCS":
      return gradeNrDlMcs(v);
    case "NR_ULMCS":
    case "PCC_UlMCS":
      return gradeNrUlMcs(v);
    case "NR_CQI":
    case "PCC_CQI":
      return gradeNrCqi(v);
    case "LTE_RSRP":
    case "RSRP":
      return gradeLteRsrp(v);
    case "LTE_SINR":
    case "SINR":
      return gradeLteSinr(v);
    case "RSRQ":
      return gradeLteRsrq(v);
    case "RSSI":
      return gradeRssi(v);
    default:
      return "unknown";
  }
}
