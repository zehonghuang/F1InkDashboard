import { createRouter, createWebHistory } from "vue-router";
import DefaultRedirect from "./views/DefaultRedirect.vue";
import ShareRoot from "./views/ShareRoot.vue";
import PageShell from "./views/PageShell.vue";
import GlobePage from "./pages/GlobePage.vue";
import RequestsByCountryPage from "./pages/RequestsByCountryPage.vue";

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", component: ShareRoot },
    { path: "/globe", component: GlobePage },
    { path: "/requests-by-country", component: RequestsByCountryPage },
    { path: "/compare-throttle", component: PageShell, props: { pageKey: "compare-throttle" } },
    { path: "/compare-brake", component: PageShell, props: { pageKey: "compare-brake" } },
    { path: "/compare-speed", component: PageShell, props: { pageKey: "compare-speed" } },
    { path: "/driver-telemetry", component: PageShell, props: { pageKey: "driver-telemetry" } },
    { path: "/lap-trace", component: PageShell, props: { pageKey: "lap-trace" } },
    { path: "/lap-times", component: PageShell, props: { pageKey: "lap-times" } },
    { path: "/speeds", component: PageShell, props: { pageKey: "speeds" } },
    { path: "/boxplot", component: PageShell, props: { pageKey: "boxplot" } },
    { path: "/:pathMatch(.*)*", component: DefaultRedirect }
  ]
});
