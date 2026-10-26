import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { ApiError } from "~/composables/useApi";

/**
 * Keeps loaded data fresh, Vue Query style (see composables/useLoad.ts): every query on screen refetches
 * when the tab becomes visible again, on every page or tab change, and every minute while the tab is visible.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        // Server answers (not found, no access) are final; only retry network failures.
        retry: (count, err) => !(err instanceof ApiError) && count < 2,
      },
    },
  });
  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient });

  // A new page mounts its own queries, which fetch then. Within a page (a group's tabs, filters in the query string)
  // nothing remounts, so refetch what's on screen. Already-running fetches are left alone.
  const router = useRouter();
  router.afterEach((to, from) => {
    if (to.path !== from.path || to.fullPath === from.fullPath) return;
    queryClient.refetchQueries({ type: "active", predicate: (q) => q.meta?.live !== false }, { cancelRefetch: false });
  });

  // Never show one account's cached data to the next one.
  const { me } = useSession();
  watch(() => me.value?.id, () => queryClient.clear(), { flush: "sync" });
});
