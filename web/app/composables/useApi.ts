export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface ApiOptions {
  method?: string;
  body?: unknown;
}

/** Calls the Worker's JSON API (a FormData body is sent as a file upload). Errors carry the server's (translated) message and the HTTP status. */
export function useApi() {
  const { $i18n } = useNuxtApp();
  return async function api<T = any>(path: string, { method = "GET", body }: ApiOptions = {}): Promise<T> {
    const form = body instanceof FormData;
    const res = await fetch(`/api${path}`, {
      method,
      headers: { "Accept-Language": $i18n.locale.value, ...(body && !form ? { "Content-Type": "application/json" } : {}) },
      body: form ? body : body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || $i18n.t("error.requestFailed", { status: res.status }), res.status);
    return data as T;
  };
}
