import { now } from "./http";

export type Actor = { id: string; email: string } | null;

/** Appends one entry to the audit log. Never throws: auditing must not break the action itself. */
export async function audit(
  env: Env,
  request: Request,
  actor: Actor,
  action: string,
  { groupId, target, details }: { groupId?: string | null; target?: string | null; details?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO audit_log (at, actor_id, actor_email, action, group_id, target, details, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        now(),
        actor?.id ?? null,
        actor?.email ?? null,
        action,
        groupId ?? null,
        target ?? null,
        JSON.stringify(details ?? {}),
        request.headers.get("CF-Connecting-IP"),
      )
      .run();
  } catch (error) {
    console.error("Audit write failed", action, error);
  }
}
