import { invoke } from "@tauri-apps/api/core";

export function readLogTail(maxBytes?: number): Promise<string> {
  return invoke<string>("read_log_tail", { maxBytes: maxBytes ?? null });
}

export function clearLog(): Promise<void> {
  return invoke<void>("clear_log");
}
