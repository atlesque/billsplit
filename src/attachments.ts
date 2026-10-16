// Receipts and invoices attached to expenses. Files live in the FILES R2 bucket and are only served
// through the API, to the members of the expense's group. Anyone who may change an expense (see
// canEditExpense) may add or remove its attachments.

import { audit } from "./audit";
import type { User } from "./auth";
import { editableExpense } from "./expenses";
import { groupForUser } from "./groups";
import { cleanName, sniffType } from "./files";
import { HttpError, now, randomId } from "./http";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PER_EXPENSE = 10;
/** Archived groups keep their attachments until they have been quiet for this long. */
export const ATTACHMENTS_KEPT_FOR = 90 * 24 * 3600 * 1000;

type AttachmentRow = { id: string; expense_id: string; key: string; name: string; content_type: string; size: number; created_at: number };

/** Attachments for the group page, per expense. */
export async function attachmentsByExpense(env: Env, groupId: string) {
  const { results } = await env.DB.prepare(
    "SELECT id, expense_id, name, content_type, size, created_at FROM attachments WHERE group_id = ? ORDER BY created_at",
  )
    .bind(groupId)
    .all<Omit<AttachmentRow, "key">>();
  const map = new Map<string, { id: string; name: string; contentType: string; size: number; createdAt: number }[]>();
  for (const a of results) {
    const list = map.get(a.expense_id) ?? [];
    list.push({ id: a.id, name: a.name, contentType: a.content_type, size: a.size, createdAt: a.created_at });
    map.set(a.expense_id, list);
  }
  return map;
}

export async function addAttachment(request: Request, env: Env, user: User, groupId: string, expenseId: string): Promise<Response> {
  await editableExpense(env, user, groupId, expenseId);
  if (Number(request.headers.get("Content-Length") ?? 0) > MAX_FILE_BYTES + 64 * 1024) {
    throw new HttpError(413, "Files can be at most {max} MB", { max: MAX_FILE_BYTES / 1024 / 1024 });
  }
  let file: unknown;
  try {
    file = (await request.formData()).get("file");
  } catch {
    throw new HttpError(400, "Choose a file to attach");
  }
  if (!(file instanceof File) || !file.size) throw new HttpError(400, "Choose a file to attach");
  if (file.size > MAX_FILE_BYTES) throw new HttpError(413, "Files can be at most {max} MB", { max: MAX_FILE_BYTES / 1024 / 1024 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffType(bytes);
  if (!contentType) throw new HttpError(415, "Attach a PDF or an image (JPEG, PNG, WebP or GIF)");

  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM attachments WHERE expense_id = ?").bind(expenseId).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_PER_EXPENSE) throw new HttpError(400, "An expense can have at most {max} attachments", { max: MAX_PER_EXPENSE });

  const id = randomId();
  const key = `${groupId}/${expenseId}/${id}`;
  const name = cleanName(file.name, contentType);
  await env.FILES.put(key, bytes, { httpMetadata: { contentType } });
  try {
    await env.DB.prepare(
      `INSERT INTO attachments (id, group_id, expense_id, key, name, content_type, size, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, groupId, expenseId, key, name, contentType, bytes.byteLength, user.id, now())
      .run();
  } catch (error) {
    await env.FILES.delete(key);
    throw error;
  }
  await audit(env, request, user, "attachment.added", { groupId, target: expenseId, details: { name, size: bytes.byteLength } });
  return Response.json({ id, name, contentType, size: bytes.byteLength }, { status: 201 });
}

async function loadAttachment(env: Env, groupId: string, attachmentId: string) {
  const row = await env.DB.prepare(
    "SELECT id, expense_id, key, name, content_type, size, created_at FROM attachments WHERE id = ? AND group_id = ?",
  )
    .bind(attachmentId, groupId)
    .first<AttachmentRow>();
  if (!row) throw new HttpError(404, "Attachment not found");
  return row;
}

/** Opens the file in the browser (inline), for members of the group only. */
export async function getAttachment(env: Env, user: User, groupId: string, attachmentId: string): Promise<Response> {
  await groupForUser(env, groupId, user);
  const row = await loadAttachment(env, groupId, attachmentId);
  const object = await env.FILES.get(row.key);
  if (!object) throw new HttpError(404, "Attachment not found");
  return new Response(object.body, {
    headers: {
      "Content-Type": row.content_type,
      "Content-Length": String(object.size),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      // Only PDFs and images are stored (checked on upload), and the browser must not guess otherwise.
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function deleteAttachment(request: Request, env: Env, user: User, groupId: string, attachmentId: string): Promise<Response> {
  const row = await loadAttachment(env, groupId, attachmentId);
  await editableExpense(env, user, groupId, row.expense_id);
  await env.DB.prepare("DELETE FROM attachments WHERE id = ?").bind(row.id).run();
  await env.FILES.delete(row.key);
  await audit(env, request, user, "attachment.removed", { groupId, target: row.expense_id, details: { name: row.name, size: row.size } });
  return new Response(null, { status: 204 });
}

/** Deletes the stored files for attachment rows that were (or are about to be) removed. */
export async function deleteFiles(env: Env, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) await env.FILES.delete(keys.slice(i, i + 1000));
}

/**
 * Runs daily: removes the attachments of archived groups that have had no activity (new or changed
 * expenses, payments, or the archiving itself) for ATTACHMENTS_KEPT_FOR. The expenses stay.
 */
export async function removeStaleAttachments(env: Env, at = now()): Promise<number> {
  let removed = 0;
  for (let round = 0; round < 20; round++) {
    const { results } = await env.DB.prepare(
      `SELECT a.id, a.key, a.group_id FROM attachments a JOIN groups g ON g.id = a.group_id
       WHERE g.archived_at IS NOT NULL
         AND MAX(g.archived_at,
                 COALESCE((SELECT MAX(updated_at) FROM expenses WHERE group_id = g.id), 0),
                 COALESCE((SELECT MAX(updated_at) FROM payments WHERE group_id = g.id), 0)) < ?
       LIMIT 500`,
    )
      .bind(at - ATTACHMENTS_KEPT_FOR)
      .all<{ id: string; key: string; group_id: string }>();
    if (!results.length) break;
    await deleteFiles(env, results.map((r) => r.key));
    const groups = [...new Set(results.map((r) => r.group_id))];
    await env.DB.batch([
      ...results.map((r) => env.DB.prepare("DELETE FROM attachments WHERE id = ?").bind(r.id)),
      ...groups.map((g) => env.DB.prepare("UPDATE groups SET attachments_removed_at = ? WHERE id = ?").bind(at, g)),
    ]);
    removed += results.length;
  }
  if (removed) console.log(`Removed ${removed} attachments from archived groups`);
  return removed;
}
