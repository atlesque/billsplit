// BillSplit front end: a small dependency-free SPA with history routing.

const app = document.getElementById("app");
const accountEl = document.getElementById("account");
let me = null;

// ---------- helpers ----------

class Raw {
  constructor(value) {
    this.value = value;
  }
}
const raw = (value) => new Raw(value);
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    if (v instanceof Raw) out += v.value;
    else if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.value : esc(x))).join("");
    else if (v === false || v === null || v === undefined) out += "";
    else out += esc(v);
    out += strings[i + 1];
  });
  return raw(out);
}
const render = (target, view) => (target.innerHTML = view.value);

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

let toastTimer;
function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

const money = (cents, currency) => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
};
/** "12,5" / "12.50" / "1 234,56" -> cents, or NaN. */
function parseAmount(input) {
  let s = String(input).trim().replace(/[\s']/g, "");
  if (!s) return NaN;
  const lastSep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  if (lastSep >= 0 && s.length - lastSep - 1 <= 2) {
    s = s.slice(0, lastSep).replace(/[.,]/g, "") + "." + s.slice(lastSep + 1);
  } else {
    s = s.replace(/[.,]/g, "");
  }
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100);
}
const centsToInput = (cents) => (cents / 100).toFixed(2);
const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
const today = () => new Date().toLocaleDateString("en-CA");
const formatDate = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "CNY", "INR", "BRL", "MXN", "ZAR", "NZD", "SGD", "HKD", "THB", "TRY"];
const CATEGORIES = ["", "Food & drinks", "Groceries", "Transport", "Accommodation", "Activities", "Shopping", "Bills", "Other"];

function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  route();
}
document.addEventListener("click", (event) => {
  const a = event.target.closest("a[data-link]");
  if (!a || event.metaKey || event.ctrlKey || event.shiftKey) return;
  event.preventDefault();
  navigate(a.getAttribute("href"));
});
window.addEventListener("popstate", () => route());

function formError(form, error) {
  const el = form.querySelector(".error");
  if (el) el.textContent = error ? error.message || String(error) : "";
}
async function withBusy(button, fn) {
  if (button) button.disabled = true;
  try {
    return await fn();
  } finally {
    if (button) button.disabled = false;
  }
}

// ---------- account header ----------

function renderAccount() {
  if (!me) {
    accountEl.innerHTML = "";
    return;
  }
  render(
    accountEl,
    html`<button class="btn ghost small" id="account-btn" title="${me.email}">${me.name || me.email}</button>`,
  );
  document.getElementById("account-btn").onclick = openAccountDialog;
}

function openDialog(content, onMount) {
  const dialog = document.createElement("dialog");
  render(dialog, content);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (e) => e.target === dialog && dialog.close());
  dialog.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => dialog.close()));
  dialog.showModal();
  onMount?.(dialog);
  return dialog;
}

function openAccountDialog() {
  openDialog(
    html`<form class="sheet" method="dialog">
      <div class="sheet-head"><h2>Your account</h2><button type="button" class="btn ghost small" data-close>Close</button></div>
      <p class="muted small">Signed in as ${me.email}</p>
      <div class="field"><label for="acc-name">Display name</label><input id="acc-name" name="name" value="${me.name}" maxlength="60" required /></div>
      <p class="error"></p>
      <div class="actions"><button class="btn primary" value="save">Save</button><button type="button" class="btn danger" id="logout">Sign out</button></div>
    </form>`,
    (dialog) => {
      const form = dialog.querySelector("form");
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          me = await api("/me", { method: "PATCH", body: { name: form.name.value } });
          renderAccount();
          dialog.close();
          toast("Saved");
        } catch (err) {
          formError(form, err);
        }
      };
      dialog.querySelector("#logout").onclick = async () => {
        await api("/auth/logout", { method: "POST" });
        me = null;
        dialog.close();
        renderAccount();
        navigate("/", { replace: true });
      };
    },
  );
}

// ---------- sign in ----------

function renderSignIn(next = location.pathname + location.search) {
  const isLanding = location.pathname === "/";
  render(
    app,
    html`${isLanding
        ? html`<section class="hero">
              <h1>Split bills, not friendships</h1>
              <p class="muted">Track shared expenses for trips, flats and nights out. BillSplit works out who owes whom.</p>
            </section>
            <div class="features">
              <div><strong>Groups</strong>Add friends by name, invite them with a link.</div>
              <div><strong>Flexible splits</strong>Equally, by shares, or exact amounts.</div>
              <div><strong>Settle up</strong>The fewest payments to get everyone even.</div>
            </div>`
        : html`<h1>Sign in</h1><p class="muted">Sign in to continue.</p>`}
      <div class="card" id="signin-card"></div>`,
  );
  const card = document.getElementById("signin-card");

  const showEmail = (email = "") => {
    render(
      card,
      html`<form id="email-form" novalidate>
        <h2>Sign in or create an account</h2>
        <p class="muted small">We'll email you a 6-digit code and a sign-in link. No password needed.</p>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" inputmode="email" value="${email}" required /></div>
        <p class="error"></p>
        <button class="btn primary block">Email me a code</button>
      </form>`,
    );
    const form = card.querySelector("form");
    form.email.focus();
    form.onsubmit = (e) => {
      e.preventDefault();
      formError(form);
      withBusy(form.querySelector("button"), async () => {
        try {
          const res = await api("/auth/start", { method: "POST", body: { email: form.email.value, next } });
          showCode(res);
        } catch (err) {
          formError(form, err);
        }
      });
    };
  };

  const showCode = ({ requestId, email }) => {
    render(
      card,
      html`<form id="code-form" novalidate>
        <h2>Check your inbox</h2>
        <p class="muted small">We sent a code to <strong>${email}</strong>. Enter it below, or tap the link in the email.</p>
        <div class="field"><label for="code">6-digit code</label><input id="code" name="code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required /></div>
        <p class="error"></p>
        <button class="btn primary block">Sign in</button>
        <div class="actions"><button type="button" class="btn ghost small" id="other-email">Use a different email</button></div>
      </form>`,
    );
    const form = card.querySelector("form");
    form.code.focus();
    form.code.oninput = () => {
      form.code.value = form.code.value.replace(/\D/g, "").slice(0, 6);
      if (form.code.value.length === 6) form.requestSubmit();
    };
    card.querySelector("#other-email").onclick = () => showEmail(email);
    form.onsubmit = (e) => {
      e.preventDefault();
      formError(form);
      withBusy(form.querySelector("button"), async () => {
        try {
          const res = await api("/auth/verify", { method: "POST", body: { requestId, code: form.code.value } });
          await signedIn(res);
        } catch (err) {
          formError(form, err);
          form.code.select();
        }
      });
    };
  };

  showEmail();
}

async function signedIn({ user, next }) {
  me = user;
  renderAccount();
  navigate(next && next !== "/signin" ? next : "/", { replace: true });
}

async function renderLinkSignIn() {
  const token = new URLSearchParams(location.search).get("token");
  // A button rather than auto-redeem, so email link scanners can't use up the link.
  render(
    app,
    html`<div class="card" style="max-width:420px;margin:2rem auto;text-align:center">
      <h1>Sign in to BillSplit</h1>
      <p class="muted">Tap the button to finish signing in on this device.</p>
      <p class="error"></p>
      <button class="btn primary block" id="go">Continue</button>
      <div class="actions" style="justify-content:center"><a href="/" data-link class="small">Back to start</a></div>
    </div>`,
  );
  const button = document.getElementById("go");
  button.onclick = () =>
    withBusy(button, async () => {
      try {
        await signedIn(await api("/auth/link", { method: "POST", body: { token } }));
        toast("Signed in");
      } catch (err) {
        app.querySelector(".error").textContent = err.message;
      }
    });
}

async function ensureName() {
  if (me.name) return;
  await new Promise((resolve) => {
    const dialog = openDialog(
      html`<form class="sheet">
        <h2>Welcome to BillSplit</h2>
        <p class="muted small">What should your friends see as your name?</p>
        <div class="field"><label for="first-name">Your name</label><input id="first-name" name="name" maxlength="60" autocomplete="given-name" required /></div>
        <p class="error"></p>
        <button class="btn primary block">Continue</button>
      </form>`,
      (d) => {
        const form = d.querySelector("form");
        form.name.focus();
        d.addEventListener("cancel", (e) => e.preventDefault());
        form.onsubmit = async (e) => {
          e.preventDefault();
          try {
            me = await api("/me", { method: "PATCH", body: { name: form.name.value } });
            renderAccount();
            d.close();
            resolve();
          } catch (err) {
            formError(form, err);
          }
        };
      },
    );
    dialog.addEventListener("close", resolve);
  });
}

// ---------- groups list ----------

async function renderGroups() {
  const groups = await api("/groups");
  render(
    app,
    html`<div class="group-head">
        <div><h1>Your groups</h1><p class="muted small">Trips, flatshares, dinners: anything you split.</p></div>
        <button class="btn primary" id="new-group">New group</button>
      </div>
      ${groups.length
        ? html`<ul class="list">
            ${groups.map(
              (g) => html`<li>
                <a class="row" href="/g/${g.id}" data-link>
                  <span class="avatar">${initials(g.name)}</span>
                  <span class="grow">
                    <span class="title">${g.name}</span>
                    <span class="muted small">${g.member_count} participants · ${money(g.total, g.currency)} spent</span>
                  </span>
                  <span class="amount ${g.my_balance > 0 ? "pos" : g.my_balance < 0 ? "neg" : "muted"}">
                    ${g.my_balance === 0 ? "settled" : `${g.my_balance > 0 ? "you're owed" : "you owe"} ${money(Math.abs(g.my_balance), g.currency)}`}
                  </span>
                </a>
              </li>`,
            )}
          </ul>`
        : html`<div class="card empty"><h2>No groups yet</h2><p>Create a group for your next trip or shared flat, then invite your friends.</p><button class="btn primary" id="new-group-2">Create a group</button></div>`}`,
  );
  app.querySelectorAll("#new-group, #new-group-2").forEach((b) => (b.onclick = openNewGroup));
}

function openNewGroup() {
  openDialog(
    html`<form class="sheet">
      <div class="sheet-head"><h2>New group</h2><button type="button" class="btn ghost small" data-close>Cancel</button></div>
      <div class="field"><label for="g-name">Name</label><input id="g-name" name="name" maxlength="80" placeholder="Weekend in Lisbon" required /></div>
      <div class="grid2">
        <div class="field"><label for="g-me">Your name in this group</label><input id="g-me" name="myName" maxlength="60" value="${me.name}" required /></div>
        <div class="field"><label for="g-cur">Currency</label><select id="g-cur" name="currency">${CURRENCIES.map((c) => html`<option ${c === "EUR" ? raw("selected") : ""}>${c}</option>`)}</select></div>
      </div>
      <div class="field"><label for="g-members">Other participants</label><textarea id="g-members" name="members" rows="3" placeholder="One name per line. You can also add people later, or invite them with a link."></textarea></div>
      <div class="field"><label for="g-desc">Description <span class="muted small">(optional)</span></label><input id="g-desc" name="description" maxlength="300" /></div>
      <p class="error"></p>
      <button class="btn primary block">Create group</button>
    </form>`,
    (dialog) => {
      const form = dialog.querySelector("form");
      form.name.focus();
      form.onsubmit = (e) => {
        e.preventDefault();
        withBusy(form.querySelector("button.primary"), async () => {
          try {
            const members = form.members.value.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
            const { id } = await api("/groups", {
              method: "POST",
              body: { name: form.name.value, myName: form.myName.value, currency: form.currency.value, description: form.description.value, members },
            });
            if (!me.name) me.name = form.myName.value.trim();
            renderAccount();
            dialog.close();
            navigate(`/g/${id}`);
          } catch (err) {
            formError(form, err);
          }
        });
      };
    },
  );
}

// ---------- group ----------

let groupTab = "expenses";

async function renderGroup(groupId) {
  const data = await api(`/groups/${groupId}`);
  const { group, members, expenses, settlements, meId } = data;
  const cur = group.currency;
  const byId = new Map(members.map((m) => [m.id, m]));
  const name = (id) => (id === meId ? "You" : byId.get(id)?.name ?? "?");
  const total = expenses.filter((e) => e.kind === "expense").reduce((a, e) => a + e.amount, 0);
  const mine = byId.get(meId);

  const tabs = html`<div class="segmented" role="group" aria-label="Sections">
    ${[
      ["expenses", "Expenses"],
      ["balances", "Balances"],
      ["settings", "Group"],
    ].map(([key, label]) => html`<button data-tab="${key}" aria-pressed="${groupTab === key}">${label}</button>`)}
  </div>`;

  let body;
  if (groupTab === "expenses") {
    const byDate = new Map();
    for (const e of expenses) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
    body = expenses.length
      ? html`${[...byDate].map(
          ([date, list]) => html`<div class="date-head">${formatDate(date)}</div>
            <ul class="list">
              ${list.map((e) => {
                const myShare = e.shares.find((s) => s.memberId === meId)?.amount ?? 0;
                const myNet = (e.paidBy === meId ? e.amount : 0) - myShare;
                const sub =
                  e.kind === "transfer"
                    ? `${name(e.paidBy)} paid ${name(e.shares[0]?.memberId)}`
                    : `Paid by ${name(e.paidBy)}${e.category ? ` · ${e.category}` : ""}`;
                return html`<li>
                  <button class="row" data-expense="${e.id}">
                    <span class="avatar ${e.kind === "transfer" ? "transfer" : ""}">${e.kind === "transfer" ? "⇄" : initials(e.title)}</span>
                    <span class="grow"><span class="title">${e.title}</span><span class="muted small">${sub}</span></span>
                    <span class="amount">${money(e.amount, cur)}<br /><span class="small ${e.kind === "transfer" ? "muted" : myNet > 0 ? "pos" : myNet < 0 ? "neg" : "muted"}">${
                      myNet === 0
                        ? ""
                        : e.kind === "transfer"
                          ? myNet > 0 ? `you gave ${money(myNet, cur)}` : `you received ${money(-myNet, cur)}`
                          : myNet > 0 ? `you lent ${money(myNet, cur)}` : `you owe ${money(-myNet, cur)}`
                    }</span></span>
                  </button>
                </li>`;
              })}
            </ul>`,
        )}`
      : html`<div class="card empty"><h2>No expenses yet</h2><p>Add the first expense with the button below.</p></div>`;
  } else if (groupTab === "balances") {
    const max = Math.max(1, ...members.map((m) => Math.abs(m.balance)));
    body = html`<h2>Balances</h2>
      <ul class="list">
        ${members.map(
          (m) => html`<li class="bar-wrap">
            <span class="name">${m.isMe ? `${m.name} (you)` : m.name}</span>
            <span class="bar-track" aria-hidden="true">
              <div>${m.balance < 0 ? html`<span class="bar neg" style="width:${(Math.abs(m.balance) / max) * 100}%"></span>` : ""}</div>
              <div>${m.balance > 0 ? html`<span class="bar pos" style="width:${(m.balance / max) * 100}%"></span>` : ""}</div>
            </span>
            <span class="amount ${m.balance > 0 ? "pos" : m.balance < 0 ? "neg" : "muted"}">${m.balance > 0 ? "+" : ""}${money(m.balance, cur)}</span>
          </li>`,
        )}
      </ul>
      <h2 style="margin-top:1.5rem">How to settle up</h2>
      ${settlements.length
        ? html`<ul class="list">
            ${settlements.map(
              (s, i) => html`<li class="row">
                <span class="grow"><strong>${name(s.from)}</strong> ${s.from === meId ? "pay" : "pays"} <strong>${name(s.to)}</strong></span>
                <span class="amount">${money(s.amount, cur)}</span>
                <button class="btn small" data-settle="${i}">Mark paid</button>
              </li>`,
            )}
          </ul>`
        : html`<div class="card empty">Everyone is settled up. 🎉</div>`}
      <h2 style="margin-top:1.5rem">Totals</h2>
      <ul class="list">
        ${members.map(
          (m) => html`<li class="row"><span class="grow">${m.name}</span><span class="muted small">paid ${money(m.paid, cur)} · share ${money(m.spent, cur)}</span></li>`,
        )}
      </ul>`;
  } else {
    const inviteUrl = `${location.origin}/join/${group.invite_token}`;
    body = html`<div class="card">
        <h2>Invite friends</h2>
        <p class="muted small">Anyone with this link can sign in, pick their name and see this group.</p>
        <div class="invite-box"><input readonly value="${inviteUrl}" id="invite-url" aria-label="Invite link" /><button class="btn" id="copy-invite">${navigator.share ? "Share" : "Copy"}</button></div>
        <div class="actions"><button class="btn small ghost" id="reset-invite">Reset link</button></div>
      </div>
      <h2>Participants</h2>
      <ul class="list">
        ${members.map(
          (m) => html`<li class="row">
            <span class="avatar">${initials(m.name)}</span>
            <span class="grow"><span class="title">${m.name}</span><span class="muted small">${m.isMe ? "You" : m.claimed ? m.email ?? "Joined" : "Not joined yet"}</span></span>
            <button class="btn small ghost" data-rename="${m.id}">Rename</button>
            ${m.isMe ? "" : html`<button class="btn small ghost danger" data-remove="${m.id}" aria-label="Remove ${m.name}">✕</button>`}
          </li>`,
        )}
      </ul>
      <form class="actions" id="add-member"><input name="name" placeholder="Add a participant" maxlength="60" style="flex:1" required /><button class="btn">Add</button></form>
      <p class="error" id="member-error"></p>
      <div class="card" style="margin-top:1rem">
        <h2>Group details</h2>
        <form id="group-form">
          <div class="field"><label for="gs-name">Name</label><input id="gs-name" name="name" value="${group.name}" maxlength="80" required /></div>
          <div class="grid2">
            <div class="field"><label for="gs-cur">Currency</label><select id="gs-cur" name="currency">${[...new Set([cur, ...CURRENCIES])].map((c) => html`<option ${c === cur ? raw("selected") : ""}>${c}</option>`)}</select></div>
            <div class="field"><label for="gs-desc">Description</label><input id="gs-desc" name="description" value="${group.description}" maxlength="300" /></div>
          </div>
          <p class="error"></p>
          <button class="btn primary">Save</button>
        </form>
      </div>
      <div class="actions">
        <a class="btn" href="/api/groups/${group.id}/export.csv" download>Export CSV</a>
        <button class="btn danger" id="leave-group">Leave group</button>
        ${group.isOwner ? html`<button class="btn danger" id="delete-group">Delete group</button>` : ""}
      </div>`;
  }

  render(
    app,
    html`<div class="group-head">
        <div><a href="/" data-link class="small">← All groups</a><h1>${group.name}</h1>${group.description ? html`<p class="muted small">${group.description}</p>` : ""}</div>
      </div>
      <div class="stats">
        <div class="stat"><div class="label">Total spent</div><div class="value">${money(total, cur)}</div></div>
        <div class="stat"><div class="label">Your balance</div><div class="value ${mine.balance > 0 ? "pos" : mine.balance < 0 ? "neg" : ""}">${mine.balance > 0 ? "+" : ""}${money(mine.balance, cur)}</div></div>
      </div>
      ${tabs}${body}
      <button class="btn primary fab" id="add-expense">+ Add expense</button>`,
  );

  const refresh = () => renderGroup(groupId).catch(showError);
  app.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => ((groupTab = b.dataset.tab), refresh())));
  app.querySelector("#add-expense").onclick = () => openExpense(data, null, refresh);
  app.querySelectorAll("[data-expense]").forEach(
    (b) => (b.onclick = () => openExpense(data, expenses.find((e) => e.id === b.dataset.expense), refresh)),
  );
  app.querySelectorAll("[data-settle]").forEach(
    (b) =>
      (b.onclick = () => {
        const s = settlements[Number(b.dataset.settle)];
        openExpense(data, { kind: "transfer", title: "Payment", amount: s.amount, paidBy: s.from, date: today(), splitMode: "equal", shares: [{ memberId: s.to, weight: 1 }] }, refresh, true);
      }),
  );

  if (groupTab === "settings") bindSettings(data, refresh);
}

function bindSettings({ group, members }, refresh) {
  const inviteUrl = document.getElementById("invite-url").value;
  document.getElementById("copy-invite").onclick = async () => {
    if (navigator.share) {
      navigator.share({ title: group.name, text: `Join "${group.name}" on BillSplit`, url: inviteUrl }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(inviteUrl);
      toast("Invite link copied");
    }
  };
  document.getElementById("reset-invite").onclick = async () => {
    if (!confirm("Reset the invite link? The old link will stop working.")) return;
    await api(`/groups/${group.id}/invite`, { method: "POST" });
    toast("New invite link created");
    refresh();
  };
  const addForm = document.getElementById("add-member");
  addForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(`/groups/${group.id}/members`, { method: "POST", body: { name: addForm.name.value } });
      refresh();
    } catch (err) {
      document.getElementById("member-error").textContent = err.message;
    }
  };
  app.querySelectorAll("[data-rename]").forEach(
    (b) =>
      (b.onclick = async () => {
        const m = members.find((x) => x.id === b.dataset.rename);
        const name = prompt("New name", m.name);
        if (!name || name === m.name) return;
        try {
          await api(`/groups/${group.id}/members/${m.id}`, { method: "PATCH", body: { name } });
          refresh();
        } catch (err) {
          toast(err.message);
        }
      }),
  );
  app.querySelectorAll("[data-remove]").forEach(
    (b) =>
      (b.onclick = async () => {
        const m = members.find((x) => x.id === b.dataset.remove);
        if (!confirm(`Remove ${m.name} from the group?`)) return;
        try {
          await api(`/groups/${group.id}/members/${m.id}`, { method: "DELETE" });
          refresh();
        } catch (err) {
          toast(err.message);
        }
      }),
  );
  const gForm = document.getElementById("group-form");
  gForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(`/groups/${group.id}`, { method: "PATCH", body: { name: gForm.name.value, currency: gForm.currency.value, description: gForm.description.value } });
      toast("Saved");
      refresh();
    } catch (err) {
      formError(gForm, err);
    }
  };
  document.getElementById("leave-group").onclick = async () => {
    if (!confirm("Leave this group? Your expenses stay in the group, but you'll no longer see it.")) return;
    await api(`/groups/${group.id}/leave`, { method: "POST" });
    navigate("/");
  };
  const del = document.getElementById("delete-group");
  if (del)
    del.onclick = async () => {
      if (prompt(`This deletes the group and all its expenses for everyone. Type the group name to confirm:`) !== group.name) return;
      await api(`/groups/${group.id}`, { method: "DELETE" });
      toast("Group deleted");
      navigate("/");
    };
}

// ---------- expense form ----------

function openExpense({ group, members, meId }, expense, onDone, isNewFromTemplate = false) {
  const isEdit = Boolean(expense?.id) && !isNewFromTemplate;
  const cur = group.currency;
  const state = {
    kind: expense?.kind ?? "expense",
    mode: expense?.splitMode ?? "equal",
    weights: new Map(members.map((m) => [m.id, 0])),
  };
  if (expense) {
    for (const s of expense.shares) state.weights.set(s.memberId, s.weight);
  } else {
    for (const m of members) state.weights.set(m.id, 1);
  }
  // Default for transfers: one recipient.
  const firstOther = members.find((m) => m.id !== meId)?.id;

  const dialog = openDialog(
    html`<form class="sheet" novalidate>
      <div class="sheet-head"><h2>${isEdit ? "Edit" : "Add"} ${state.kind === "transfer" ? "payment" : "expense"}</h2><button type="button" class="btn ghost small" data-close>Cancel</button></div>
      <div class="segmented" role="group" aria-label="Type">
        <button type="button" data-kind="expense" aria-pressed="${state.kind === "expense"}">Expense</button>
        <button type="button" data-kind="transfer" aria-pressed="${state.kind === "transfer"}">Money given</button>
      </div>
      <div class="field" id="title-field"><label for="x-title">Title</label><input id="x-title" name="title" maxlength="100" value="${expense?.title ?? ""}" placeholder="Dinner, tickets, groceries…" /></div>
      <div class="grid2">
        <div class="field"><label for="x-amount">Amount (${cur})</label><input id="x-amount" name="amount" inputmode="decimal" value="${expense ? centsToInput(expense.amount) : ""}" placeholder="0.00" required /></div>
        <div class="field"><label for="x-date">Date</label><input id="x-date" name="date" type="date" value="${expense?.date ?? today()}" required /></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="x-paid" id="paid-label">Paid by</label><select id="x-paid" name="paidBy">${members.map((m) => html`<option value="${m.id}" ${(expense?.paidBy ?? meId) === m.id ? raw("selected") : ""}>${m.id === meId ? `${m.name} (you)` : m.name}</option>`)}</select></div>
        <div class="field" id="category-field"><label for="x-cat">Category</label><select id="x-cat" name="category">${[...new Set([...(expense?.category ? [expense.category] : []), ...CATEGORIES])].map((c) => html`<option value="${c}" ${c === (expense?.category ?? "") ? raw("selected") : ""}>${c || "None"}</option>`)}</select></div>
        <div class="field" id="to-field"><label for="x-to">To</label><select id="x-to" name="to">${members.map((m) => html`<option value="${m.id}" ${(expense?.kind === "transfer" ? expense.shares[0]?.memberId : firstOther) === m.id ? raw("selected") : ""}>${m.id === meId ? `${m.name} (you)` : m.name}</option>`)}</select></div>
      </div>
      <div id="split-section">
        <label>Split</label>
        <div class="segmented" role="group" aria-label="Split mode">
          <button type="button" data-mode="equal" aria-pressed="${state.mode === "equal"}">Equally</button>
          <button type="button" data-mode="shares" aria-pressed="${state.mode === "shares"}">By shares</button>
          <button type="button" data-mode="amounts" aria-pressed="${state.mode === "amounts"}">By amount</button>
        </div>
        <div id="split-rows"></div>
        <p class="muted small" id="split-summary"></p>
      </div>
      <p class="error"></p>
      <div class="actions">
        <button class="btn primary" style="flex:1">${isEdit ? "Save" : "Add"}</button>
        ${isEdit ? html`<button type="button" class="btn danger" id="delete-expense">Delete</button>` : ""}
      </div>
    </form>`,
  );
  const form = dialog.querySelector("form");
  const rows = form.querySelector("#split-rows");
  const summary = form.querySelector("#split-summary");
  if (!isEdit && !isNewFromTemplate) form.title.focus();

  // In "amounts" mode weights are cents; convert when switching modes so the inputs stay sensible.
  function previewShares() {
    const amount = parseAmount(form.amount.value) || 0;
    const active = members.filter((m) => state.weights.get(m.id) > 0);
    const result = new Map();
    if (state.mode === "amounts") {
      for (const m of active) result.set(m.id, state.weights.get(m.id));
      return result;
    }
    const sum = active.reduce((a, m) => a + (state.mode === "equal" ? 1 : state.weights.get(m.id)), 0);
    for (const m of active) result.set(m.id, sum ? Math.round((amount * (state.mode === "equal" ? 1 : state.weights.get(m.id))) / sum) : 0);
    return result;
  }

  function drawRows() {
    const preview = previewShares();
    render(
      rows,
      html`${members.map((m) => {
        const w = state.weights.get(m.id);
        const input =
          state.mode === "equal"
            ? ""
            : state.mode === "shares"
              ? html`<input class="weight" type="number" min="0" step="1" inputmode="numeric" data-weight="${m.id}" value="${w}" aria-label="Shares for ${m.name}" />`
              : html`<input class="weight" inputmode="decimal" data-weight="${m.id}" value="${w ? centsToInput(w) : ""}" placeholder="0.00" aria-label="Amount for ${m.name}" />`;
        return html`<div class="split-row">
          <input type="checkbox" data-check="${m.id}" ${w > 0 ? raw("checked") : ""} aria-label="Include ${m.name}" />
          <span class="name">${m.id === meId ? `${m.name} (you)` : m.name}</span>
          ${input}
          <span class="share">${w > 0 ? money(preview.get(m.id) ?? 0, cur) : "—"}</span>
        </div>`;
      })}`,
    );
    updateSummary();
    rows.querySelectorAll("[data-check]").forEach(
      (c) =>
        (c.onchange = () => {
          const id = c.dataset.check;
          state.weights.set(id, c.checked ? (state.mode === "amounts" ? 0 : 1) : 0);
          if (state.mode === "amounts" && c.checked) {
            const amount = parseAmount(form.amount.value) || 0;
            const assigned = [...state.weights.values()].reduce((a, b) => a + b, 0);
            state.weights.set(id, Math.max(0, amount - assigned) || 1);
          }
          drawRows();
        }),
    );
    rows.querySelectorAll("[data-weight]").forEach(
      (input) =>
        (input.oninput = () => {
          const v = state.mode === "shares" ? parseInt(input.value, 10) : parseAmount(input.value);
          state.weights.set(input.dataset.weight, Number.isFinite(v) && v > 0 ? v : 0);
          const cb = rows.querySelector(`[data-check="${input.dataset.weight}"]`);
          cb.checked = state.weights.get(input.dataset.weight) > 0;
          const preview = previewShares();
          rows.querySelectorAll(".split-row").forEach((row, i) => {
            const m = members[i];
            row.querySelector(".share").textContent = state.weights.get(m.id) > 0 ? money(preview.get(m.id) ?? 0, cur) : "—";
          });
          updateSummary();
        }),
    );
  }

  function updateSummary() {
    const amount = parseAmount(form.amount.value) || 0;
    const active = members.filter((m) => state.weights.get(m.id) > 0).length;
    if (state.mode === "amounts") {
      const assigned = [...state.weights.values()].reduce((a, b) => a + b, 0);
      const left = amount - assigned;
      summary.innerHTML = "";
      summary.textContent = left === 0 ? `All ${money(amount, cur)} assigned.` : left > 0 ? `${money(left, cur)} left to assign.` : `${money(-left, cur)} too much assigned.`;
      summary.className = `small ${left === 0 ? "muted" : "neg"}`;
    } else {
      summary.className = "muted small";
      summary.textContent = active ? `Split between ${active} ${active === 1 ? "person" : "people"}.` : "Pick at least one person.";
    }
  }

  function applyKind() {
    const transfer = state.kind === "transfer";
    form.querySelectorAll("[data-kind]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === state.kind)));
    form.querySelector("#split-section").hidden = transfer;
    form.querySelector("#category-field").hidden = transfer;
    form.querySelector("#to-field").hidden = !transfer;
    form.querySelector("#title-field").hidden = transfer;
    form.querySelector("#paid-label").textContent = transfer ? "From" : "Paid by";
    dialog.querySelector(".sheet-head h2").textContent = `${isEdit ? "Edit" : "Add"} ${transfer ? "payment" : "expense"}`;
  }

  form.querySelectorAll("[data-kind]").forEach((b) => (b.onclick = () => ((state.kind = b.dataset.kind), applyKind())));
  form.querySelectorAll("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        const next = b.dataset.mode;
        if (next === state.mode) return;
        const preview = previewShares();
        for (const m of members) {
          const on = state.weights.get(m.id) > 0;
          state.weights.set(m.id, !on ? 0 : next === "amounts" ? preview.get(m.id) ?? 0 : 1);
        }
        state.mode = next;
        form.querySelectorAll("[data-mode]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.mode === next)));
        drawRows();
      }),
  );
  form.amount.oninput = () => drawRows();
  drawRows();
  applyKind();

  form.onsubmit = (e) => {
    e.preventDefault();
    formError(form);
    const amount = parseAmount(form.amount.value);
    if (!Number.isFinite(amount) || amount <= 0) return formError(form, new Error("Enter a valid amount"));
    const transfer = state.kind === "transfer";
    if (transfer && form.to.value === form.paidBy.value) return formError(form, new Error("Pick two different people"));
    const body = {
      kind: state.kind,
      title: transfer ? "Payment" : form.title.value,
      amount,
      date: form.date.value,
      paidBy: form.paidBy.value,
      category: transfer ? "" : form.category.value,
      splitMode: transfer ? "equal" : state.mode,
      shares: transfer
        ? [{ memberId: form.to.value, weight: 1 }]
        : members.filter((m) => state.weights.get(m.id) > 0).map((m) => ({ memberId: m.id, weight: state.weights.get(m.id) })),
    };
    withBusy(form.querySelector("button.primary"), async () => {
      try {
        if (isEdit) await api(`/groups/${group.id}/expenses/${expense.id}`, { method: "PUT", body });
        else await api(`/groups/${group.id}/expenses`, { method: "POST", body });
        dialog.close();
        toast(isEdit ? "Saved" : transfer ? "Payment recorded" : "Expense added");
        onDone();
      } catch (err) {
        formError(form, err);
      }
    });
  };
  const del = form.querySelector("#delete-expense");
  if (del)
    del.onclick = async () => {
      if (!confirm(`Delete "${expense.title}"?`)) return;
      await api(`/groups/${group.id}/expenses/${expense.id}`, { method: "DELETE" });
      dialog.close();
      toast("Deleted");
      onDone();
    };
}

// ---------- invite ----------

async function renderInvite(token) {
  const invite = await api(`/invites/${token}`);
  if (invite.alreadyMember) return navigate(`/g/${invite.group.id}`, { replace: true });
  const open = invite.members.filter((m) => !m.claimed);
  render(
    app,
    html`<div class="card" style="max-width:480px;margin:1rem auto">
      <p class="muted small">You're invited to</p>
      <h1>${invite.group.name}</h1>
      ${invite.group.description ? html`<p class="muted">${invite.group.description}</p>` : ""}
      <form id="join-form">
        <label>Which participant are you?</label>
        <ul class="list" style="margin-bottom:1rem">
          ${open.map(
            (m) => html`<li><label class="row" style="margin:0;font-weight:400"><input type="radio" name="who" value="${m.id}" style="width:auto;min-height:0" /> <span class="grow">${m.name}</span></label></li>`,
          )}
          <li><label class="row" style="margin:0;font-weight:400"><input type="radio" name="who" value="" ${open.length ? "" : raw("checked")} style="width:auto;min-height:0" /> <span class="grow">I'm not listed, add me as <input name="newName" value="${me.name}" maxlength="60" style="margin-top:.4rem" /></span></label></li>
        </ul>
        <p class="error"></p>
        <button class="btn primary block">Join group</button>
      </form>
    </div>`,
  );
  const form = document.getElementById("join-form");
  form.newName.onfocus = () => (form.querySelector('input[value=""][name="who"]').checked = true);
  form.onsubmit = (e) => {
    e.preventDefault();
    const who = form.querySelector('input[name="who"]:checked');
    if (!who) return formError(form, new Error("Pick your name, or add yourself"));
    withBusy(form.querySelector("button"), async () => {
      try {
        const body = who.value ? { memberId: who.value } : { name: form.newName.value };
        const { id } = await api(`/invites/${token}/join`, { method: "POST", body });
        toast("Welcome to the group!");
        navigate(`/g/${id}`, { replace: true });
      } catch (err) {
        formError(form, err);
      }
    });
  };
}

// ---------- router ----------

function showError(err) {
  if (err.status === 401) {
    me = null;
    renderAccount();
    return renderSignIn();
  }
  render(app, html`<div class="card empty"><h2>${err.status === 404 ? "Not found" : "Something went wrong"}</h2><p>${err.message}</p><a class="btn" href="/" data-link>Go to your groups</a></div>`);
}

let lastPath = "";
async function route() {
  const path = location.pathname;
  if (path !== lastPath) groupTab = "expenses";
  lastPath = path;
  render(app, html`<div class="spinner" aria-label="Loading"></div>`);
  try {
    if (path === "/signin") return await renderLinkSignIn();
    if (!me) return renderSignIn();
    await ensureName();
    let m;
    if (path === "/") return await renderGroups();
    if ((m = /^\/g\/([\w-]+)$/.exec(path))) return await renderGroup(m[1]);
    if ((m = /^\/join\/([\w-]+)$/.exec(path))) return await renderInvite(m[1]);
    showError(Object.assign(new Error("This page doesn't exist."), { status: 404 }));
  } catch (err) {
    showError(err);
  }
}

(async () => {
  try {
    ({ user: me } = await api("/me"));
  } catch {
    me = null;
  }
  renderAccount();
  route();
})();
