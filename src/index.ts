import * as admin from "./admin";
import {
  cleanup,
  currentUser,
  isAdmin,
  logout,
  requireAdmin,
  requireUser,
  startLogin,
  updateProfile,
  verifyCode,
  verifyLink,
} from "./auth";
import { createExpense, deleteExpense, updateExpense } from "./expenses";
import {
  addMember,
  createGroup,
  deleteGroup,
  exportCsv,
  getGroup,
  leaveGroup,
  listGroups,
  removeMember,
  renameMember,
  updateGroup,
} from "./groups";
import { errorResponse, HttpError } from "./http";
import { getInvite, getOrCreateGroupLink, joinInvite, resetGroupLink, revokeInvite } from "./invites";

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
    return Response.json({ user, isAdmin: isAdmin(env, user) });
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
  if (path === "/api/groups") {
    if (method === "GET") return listGroups(env, user);
    if (method === "POST") return createGroup(request, env, user);
  }
  if (m && m[2] && method === "POST") return joinInvite(request, env, user, m[1]);

  m = /^\/api\/groups\/([\w-]+)(?:\/(members|expenses|invites|leave|export\.csv)(?:\/([\w-]+))?)?$/.exec(path);
  if (m) {
    const [, groupId, sub, itemId] = m;
    switch (`${method} ${sub ?? ""}${itemId ? "/:id" : ""}`) {
      case "GET ":
        return getGroup(env, user, groupId);
      case "PATCH ":
        return updateGroup(request, env, user, groupId);
      case "DELETE ":
        return deleteGroup(request, env, user, groupId);
      case "POST leave":
        return leaveGroup(request, env, user, groupId);
      case "GET export.csv":
        return exportCsv(env, user, groupId);
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
    }
  }
  throw new HttpError(404, "Not found");
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      const response = await route(request, env, url);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(cleanup(env));
  },
} satisfies ExportedHandler<Env>;
