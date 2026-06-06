import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./views/HomeView.vue";
import NeighborSignalView from "./views/NeighborSignalView.vue";
import ProfileView from "./views/ProfileView.vue";
import TrafficStatsView from "./views/TrafficStatsView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "devices", component: HomeView },
    { path: "/signals", name: "signals", component: NeighborSignalView },
    { path: "/traffic", name: "traffic", component: TrafficStatsView },
    { path: "/profile", name: "profile", component: ProfileView },
  ],
});
