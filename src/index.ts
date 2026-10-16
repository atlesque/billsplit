import * as admin from "./admin";
import {
  cleanup,
  currentUser,
  isAdmin,
  logout,
  me,
  requireAdmin,
  requireUser,
  startLogin,
  updateBank,
  updateProfile,
  verifyCode,
  verifyLink,
} from "./auth";
import { addAttachment, deleteAttachment, getAttachment, removeStaleAttachments } from "./attachments";
import { createExpense, deleteExpense, updateExpense } from "./expenses";
import {
  addMember,
  archiveGroup,
  assertNotArchived,
  createGroup,
  deleteGroup,
  exportCsv,
  getGroup,
  leaveGroup,
  listGroups,
  removeMember,
  renameMember,
  reopenGroup,
  updateGroup,
} from "./groups";
import { HttpError } from "./http";
import { requestLang, tr, type Lang } from "./i18n";
import { getInvite, getOrCreateGroupLink, joinInvite, resetGroupLink, revokeInvite } from "./invites";
import { withPageMeta } from "./page-meta";
import { cancelPayment, confirmPayment, createPayment } from "./payments";

function errorResponse(error: unknown, lang: Lang): Response {
  if (error instanceof HttpError) {
    // Field names are English text too, so they are translated along with the message.
    const params = { ...error.params };
    if (typeof params.field === "string") params.field = tr(lang, params.field);
    return Response.json({ error: tr(lang, error.template, params) }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: tr(lang, "Something went wrong") }, { status: 500 });
}

const ARCHIVED_ALLOWED = new Set(["DELETE ", "POST leave", "POST archive", "DELETE archive"]);

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const { method } = request;
  const path = url.pathname;

  // Mutations must come from our own origin (defence in depth on top of SameSite cookies).
  if (method !== "GET" && method !== "HEAD") {
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) throw new HttpError(403, "Cross-origin request refused");
  }

  if (path === "/api/auth/start" && method === "POST") return startLogin(request, env);
  if (path === "/api/auth/verify" && method === "POST") return verifyCode(request, env);
  if (path === "/api/auth/link" && method === "POST") return verifyLink(request, env);
  if (path === "/api/auth/logout" && method === "POST") return logout(request, env);
  if (path === "/api/me" && method === "GET") {
    const user = await currentUser(request, env);
    return Response.json({ user: user && (await me(env, user)), isAdmin: isAdmin(env, user) });
  }

  // Invite preview is public so signed-out visitors see what they're joining.
  let m = /^\/api\/invites\/([\w-]+)(\/join)?$/.exec(path);
  if (m && !m[2] && method === "GET") return getInvite(request, env, m[1]);

  if (path.startsWith("/api/admin/")) {
    await requireAdmin(request, env);
    if (method !== "GET") throw new HttpError(405, "Method not allowed");
    const sub = path.slice("/api/admin/".length);
    if (sub === "overview") return admin.overview(env);
    if (sub === "users") return admin.listUsers(env, url);
    if (sub === "groups") return admin.listGroups(env, url);
    if (sub === "signins") return admin.listSignIns(env, url);
    if (sub === "audit") return admin.listAudit(env, url);
    const item = /^(users|groups)\/([\w-]+)$/.exec(sub);
    if (item) return item[1] === "users" ? admin.getUser(env, item[2]) : admin.getGroup(env, item[2]);
    throw new HttpError(404, "Not found");
  }

  const user = await requireUser(request, env);
  if (path === "/api/me" && method === "PATCH") return updateProfile(request, env, user);
  if (path === "/api/me/bank" && method === "PUT") return updateBank(request, env, user);
  if (path === "/api/groups") {
    if (method === "GET") return listGroups(env, user);
    if (method === "POST") return createGroup(request, env, user);
  }
  if (m && m[2] && method === "POST") return joinInvite(request, env, user, m[1]);

  m = /^\/api\/groups\/([\w-]+)\/expenses\/([\w-]+)\/attachments$/.exec(path);
  if (m && method === "POST") {
    await assertNotArchived(env, m[1]);
    return addAttachment(request, env, user, m[1], m[2]);
  }

  m = /^\/api\/groups\/([\w-]+)(?:\/(members|expenses|payments|invites|attachments|archive|leave|export\.csv)(?:\/([\w-]+))?)?$/.exec(path);
  if (m) {
    const [, groupId, sub, itemId] = m;
    const key = `${method} ${sub ?? ""}${itemId ? "/:id" : ""}`;
    // An archived group can only be read, left, deleted or reopened.
    if (method !== "GET" && !ARCHIVED_ALLOWED.has(key)) await assertNotArchived(env, groupId);
    switch (key) {
      case "GET ":
        return getGroup(env, user, groupId);
      case "PATCH ":
        return updateGroup(request, env, user, groupId);
      case "DELETE ":
        return deleteGroup(request, env, user, groupId);
      case "POST archive":
        return archiveGroup(request, env, user, groupId);
      case "DELETE archive":
        return reopenGroup(request, env, user, groupId);
      case "GET attachments/:id":
        return getAttachment(env, user, groupId, itemId);
      case "DELETE attachments/:id":
        return deleteAttachment(request, env, user, groupId, itemId);
      case "POST leave":
        return leaveGroup(request, env, user, groupId);
      case "GET export.csv":
        return exportCsv(request, env, user, groupId);
      case "POST members":
        return addMember(request, env, user, groupId);
      case "PATCH members/:id":
        return renameMember(request, env, user, groupId, itemId);
      case "DELETE members/:id":
        return removeMember(request, env, user, groupId, itemId);
      case "POST invites":
        return getOrCreateGroupLink(request, env, user, groupId);
      case "POST invites/:id":
        if (itemId === "reset") return resetGroupLink(request, env, user, groupId);
        break;
      case "DELETE invites/:id":
        return revokeInvite(request, env, user, groupId, itemId);
      case "POST expenses":
        return createExpense(request, env, user, groupId);
      case "PUT expenses/:id":
        return updateExpense(request, env, user, groupId, itemId);
      case "DELETE expenses/:id":
        return deleteExpense(request, env, user, groupId, itemId);
      case "POST payments":
        return createPayment(request, env, user, groupId);
      case "PATCH payments/:id":
        return confirmPayment(request, env, user, groupId, itemId);
      case "DELETE payments/:id":
        return cancelPayment(request, env, user, groupId, itemId);
    }
  }
  throw new HttpError(404, "Not found");
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return withPageMeta(await env.ASSETS.fetch(request), env.APP_URL, url.pathname);
    try {
      const response = await route(request, env, url);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      return errorResponse(error, requestLang(request));
    }
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(cleanup(env));
    ctx.waitUntil(removeStaleAttachments(env));
  },
} satisfies ExportedHandler<Env>;
