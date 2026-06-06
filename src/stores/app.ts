import { defineStore } from "pinia";
import { ref } from "vue";

export const useAppStore = defineStore("app", () => {
  const title = ref("Tauri + Vue 3 + Vite");

  return { title };
});
