import type { WatchSource } from "vue";

/**
 * Loads data for a page. `pending` is only true for the first load (or after `source` changes),
 * so refreshing after an edit keeps the page on screen.
 */
export function useLoad<T>(fn: () => Promise<T>, source?: WatchSource) {
  const data = shallowRef<T | null>(null);
  const error = shallowRef<unknown>(null);
  const pending = ref(true);

  async function refresh() {
    try {
      data.value = await fn();
      error.value = null;
    } catch (err) {
      error.value = err;
    } finally {
      pending.value = false;
    }
  }
  if (source)
    watch(source, () => {
      pending.value = true;
      data.value = null;
      refresh();
    });
  refresh();
  return { data, error, pending, refresh };
}
