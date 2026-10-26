import { useQuery } from "@tanstack/vue-query";
import type { MaybeRefOrGetter } from "vue";

/**
 * Loads data for a page with Vue Query (set up in plugins/query.client.ts), cached under `key`, so it refetches
 * in the background on tab focus, page and tab changes, and every minute. `pending` is only true while there is
 * nothing to show yet (the first load, or a new `key` with nothing cached), so refreshes keep the page on screen.
 * `error` is only set when there is no data: a failed background refetch keeps showing the last data.
 * `live: false` turns the background refetches off (for pages that page through results).
 */
export function useLoad<T>(key: MaybeRefOrGetter<unknown>, fn: () => Promise<T>, { live = true } = {}) {
  const query = useQuery({
    queryKey: computed(() => ["load", toValue(key)]),
    queryFn: fn,
    shallow: true,
    meta: { live },
    ...(!live && { refetchInterval: false, refetchOnWindowFocus: false, refetchOnReconnect: false }),
  });
  const data = computed(() => (query.data.value as T | undefined) ?? null);
  const error = computed(() => (query.isLoadingError.value ? query.error.value : null));
  const pending = query.isPending;
  const refresh = async () => {
    await query.refetch();
  };
  return { data, error, pending, refresh };
}
