/** An error shown to the user. `message` is English text with {placeholders} filled from `params`. */
export class HttpError extends Error {
  readonly status: number;
  readonly template: string;
  readonly params: Record<string, string | number>;
  constructor(status: number, message: string, params: Record<string, string | number> = {}) {
    super(message.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match)));
    this.status = status;
    this.template = message;
    this.params = params;
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Expected a JSON object");
  }
  return body as Record<string, unknown>;
}

export function text(value: unknown, field: string, { min = 1, max = 120 } = {}): string {
  if (typeof value !== "string") throw new HttpError(400, "{field} is required", { field });
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < min) throw new HttpError(400, "{field} is required", { field });
  if (trimmed.length > max) throw new HttpError(400, "{field} is too long (max {max} characters)", { field, max });
  return trimmed;
}

export function optionalText(value: unknown, field: string, max = 500): string {
  if (value === undefined || value === null || value === "") return "";
  return text(value, field, { min: 0, max });
}

export function cents(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new HttpError(400, "{field} must be a positive amount", { field });
  }
  if (value > 100_000_000_00) throw new HttpError(400, "{field} is too large", { field });
  return value;
}

export function randomId(bytes = 12): string {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buffer)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const now = () => Date.now();

/** Shortens invite tokens in app paths (e.g. /join/abcd…) for logs and the admin view. */
export const maskPath = (path: string) => path.replace(/(\/join\/[\w-]{4})[\w-]+/, "$1…");
