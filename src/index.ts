import { cleanup, currentUser, logout, requireUser, startLogin, updateProfile, verifyCode, verifyLink } from "./auth";
import { createExpense, deleteExpense, updateExpense } from "./expenses";
import {
  addMember,
  createGroup,
  deleteGroup,
  exportCsv,
  getGroup,
  getInvite,
  joinInvite,
  leaveGroup,
  listGroups,
  removeMember,
  renameMember,
  resetInvite,
  updateGroup,
} from "./groups";
import { errorResponse, HttpError } from "./http";

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
  if (path === "/api/me" && method === "GET") return Response.json({ user: await currentUser(request, env) });

  const user = await requireUser(request, env);
  if (path === "/api/me" && method === "PATCH") return updateProfile(request, env, user);
  if (path === "/api/groups") {
    if (method === "GET") return listGroups(env, user);
    if (method === "POST") return createGroup(request, env, user);
  }

  let m = /^\/api\/invites\/([\w-]+)(\/join)?$/.exec(path);
  if (m) {
    if (!m[2] && method === "GET") return getInvite(env, user, m[1]);
    if (m[2] && method === "POST") return joinInvite(request, env, user, m[1]);
  }

  m = /^\/api\/groups\/([\w-]+)(?:\/(members|expenses|leave|invite|export\.csv)(?:\/([\w-]+))?)?$/.exec(path);
  if (m) {
    const [, groupId, sub, itemId] = m;
    switch (`${method} ${sub ?? ""}${itemId ? "/:id" : ""}`) {
      case "GET ":
        return getGroup(env, user, groupId);
      case "PATCH ":
        return updateGroup(request, env, user, groupId);
      case "DELETE ":
        return deleteGroup(env, user, groupId);
      case "POST leave":
        return leaveGroup(env, user, groupId);
      case "POST invite":
        return resetInvite(env, user, groupId);
      case "GET export.csv":
        return exportCsv(env, user, groupId);
      case "POST members":
        return addMember(request, env, user, groupId);
      case "PATCH members/:id":
        return renameMember(request, env, user, groupId, itemId);
      case "DELETE members/:id":
        return removeMember(env, user, groupId, itemId);
      case "POST expenses":
        return createExpense(request, env, user, groupId);
      case "PUT expenses/:id":
        return updateExpense(request, env, user, groupId, itemId);
      case "DELETE expenses/:id":
        return deleteExpense(env, user, groupId, itemId);
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
