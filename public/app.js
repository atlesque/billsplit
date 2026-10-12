// BillSplit front end: a small dependency-free SPA with history routing.

const app = document.getElementById("app");
const accountEl = document.getElementById("account");
let me = null;
let meIsAdmin = false;

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
const $ = (sel, root = app) => root.querySelector(sel);
const $$ = (sel, root = app) => [...root.querySelectorAll(sel)];

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
  String(name)
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
const today = () => new Date().toLocaleDateString("en-CA");
const formatDate = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const formatTime = (ms) =>
  ms ? new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const formatDay = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "CNY", "INR", "BRL", "MXN", "ZAR", "NZD", "SGD", "HKD", "THB", "TRY"];
const CATEGORIES = ["", "Food & drinks", "Groceries", "Transport", "Accommodation", "Activities", "Shopping", "Bills", "Other"];
const inviteUrl = (token) => `${location.origin}/join/${token}`;

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

async function copy(text, message = "Link copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    prompt("Copy this link:", text);
  }
}

// ---------- header ----------

function renderAccount() {
  if (!me) {
    accountEl.innerHTML = "";
    return;
  }
  render(
    accountEl,
    html`${meIsAdmin ? html`<a class="btn ghost small" href="/admin">Admin</a>` : ""}
      <button class="btn ghost small" id="account-btn" title="${me.email}">${me.name || me.email}</button>`,
  );
  document.getElementById("account-btn").onclick = openAccountDialog;
}

function openAccountDialog() {
  openDialog(
    html`<form class="sheet">
      <div class="sheet-head"><h2>Your account</h2><button type="button" class="btn ghost small" data-close>Close</button></div>
      <p class="muted small">Signed in as ${me.email}</p>
      <div class="field"><label for="acc-name">Your name</label><input id="acc-name" name="name" value="${me.name}" maxlength="60" required /></div>
      <p class="error"></p>
      <div class="actions"><button class="btn primary">Save</button><button type="button" class="btn danger" id="logout">Sign out</button></div>
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
        meIsAdmin = false;
        dialog.close();
        renderAccount();
        navigate("/", { replace: true });
      };
    },
  );
}

// ---------- sign in (one flow for new and existing accounts) ----------

/** Email -> link/code form. `next` is where the user lands after signing in, on any device. */
function signInForm(card, { next = "/", title = "Sign in or create an account", button = "Continue" } = {}) {
  const showEmail = (email = "") => {
    render(
      card,
      html`<form novalidate>
        <h2>${title}</h2>
        <p class="muted small">Enter your email. We'll send you a sign-in link. New here? This creates your account.</p>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" inputmode="email" value="${email}" required /></div>
        <p class="error"></p>
        <button class="btn primary block">${button}</button>
      </form>`,
    );
    const form = $("form", card);
    form.email.focus();
    form.onsubmit = (e) => {
      e.preventDefault();
      formError(form);
      withBusy($("button", form), async () => {
        try {
          showSent(await api("/auth/start", { method: "POST", body: { email: form.email.value, next } }));
        } catch (err) {
          formError(form, err);
        }
      });
    };
  };

  const showSent = ({ requestId, email }) => {
    render(
      card,
      html`<form novalidate>
        <h2>Check your email</h2>
        <p>We sent a sign-in link to <strong>${email}</strong>. Open it on any device to continue.</p>
        <div class="field"><label for="code">Or enter the 6-digit code from the email</label><input id="code" name="code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required /></div>
        <p class="error"></p>
        <button class="btn primary block">Sign in</button>
        <div class="actions">
          <button type="button" class="btn ghost small" id="resend">Send a new email</button>
          <button type="button" class="btn ghost small" id="other-email">Use a different email</button>
        </div>
        <p class="muted small">No email after a minute? Check your spam folder.</p>
      </form>`,
    );
    const form = $("form", card);
    form.code.focus();
    form.code.oninput = () => {
      form.code.value = form.code.value.replace(/\D/g, "").slice(0, 6);
      if (form.code.value.length === 6) form.requestSubmit();
    };
    $("#other-email", card).onclick = () => showEmail(email);
    $("#resend", card).onclick = (e) =>
      withBusy(e.currentTarget, async () => {
        try {
          showSent(await api("/auth/start", { method: "POST", body: { email, next } }));
          toast("New email sent");
        } catch (err) {
          formError(form, err);
        }
      });
    form.onsubmit = (e) => {
      e.preventDefault();
      formError(form);
      withBusy($("button.primary", form), async () => {
        try {
          signedIn(await api("/auth/verify", { method: "POST", body: { requestId, code: form.code.value } }));
        } catch (err) {
          formError(form, err);
          form.code.select();
        }
      });
    };
    // If the link is opened in another tab of this browser, pick up the new session here too.
    const poll = setInterval(async () => {
      if (!card.isConnected) return clearInterval(poll);
      const res = await api("/me").catch(() => null);
      if (res?.user) {
        clearInterval(poll);
        signedIn({ user: res.user, isAdmin: res.isAdmin, next });
      }
    }, 4000);
  };

  showEmail();
}

function signedIn({ user, isAdmin, next }) {
  me = user;
  meIsAdmin = Boolean(isAdmin);
  renderAccount();
  navigate(next && next !== "/signin" ? next : "/", { replace: true });
}

function renderHomeSignedOut() {
  const next = location.pathname === "/" ? "/" : location.pathname + location.search;
  render(
    app,
    html`<section class="intro">
        <h1>BillSplit</h1>
        <p class="muted">Track shared expenses with a group and see who owes whom.</p>
      </section>
      <div class="card narrow" id="signin-card"></div>`,
  );
  signInForm($("#signin-card"), { next });
}

function renderLinkSignIn() {
  const token = new URLSearchParams(location.search).get("token");
  // A button rather than signing in on page load, so email link scanners can't use up the link.
  render(
    app,
    html`<div class="card narrow center">
      <h1>Sign in</h1>
      <p class="muted">Tap the button to finish signing in on this device.</p>
      <p class="error"></p>
      <button class="btn primary block" id="go">Finish signing in</button>
      <div class="actions center"><a href="/" data-link class="small">Request a new link</a></div>
    </div>`,
  );
  const button = $("#go");
  button.focus();
  button.onclick = () =>
    withBusy(button, async () => {
      try {
        signedIn(await api("/auth/link", { method: "POST", body: { token } }));
      } catch (err) {
        $(".error").textContent = err.message;
      }
    });
}

/** First sign-in: ask for a display name before anything else. */
function renderNameStep() {
  render(
    app,
    html`<div class="card narrow">
      <p class="step-label">Account created</p>
      <h1>What's your name?</h1>
      <p class="muted small">People in your groups will see this name.</p>
      <form>
        <div class="field"><label for="first-name">Your name</label><input id="first-name" name="name" maxlength="60" autocomplete="name" required /></div>
        <p class="error"></p>
        <button class="btn primary block">Continue</button>
      </form>
    </div>`,
  );
  const form = $("form");
  form.name.focus();
  form.onsubmit = (e) => {
    e.preventDefault();
    withBusy($("button", form), async () => {
      try {
        me = await api("/me", { method: "PATCH", body: { name: form.name.value } });
        renderAccount();
        route();
      } catch (err) {
        formError(form, err);
      }
    });
  };
}

// ---------- groups ----------

async function renderGroups() {
  const groups = await api("/groups");
  if (!groups.length) {
    render(
      app,
      html`<div class="card narrow">
        <h1>Create your first group</h1>
        <ol class="steps-plain">
          <li>Create a group.</li>
          <li>Share the group link in your group chat.</li>
          <li>Add expenses. BillSplit works out who owes whom.</li>
        </ol>
        <a class="btn primary block" href="/new" data-link>Create a group</a>
        <p class="muted small" style="margin-top:1rem">Got a group link from a friend? Open it to join their group.</p>
      </div>`,
    );
    return;
  }
  render(
    app,
    html`<div class="page-head">
        <h1>Your groups</h1>
        <a class="btn primary" href="/new" data-link>New group</a>
      </div>
      <ul class="list">
        ${groups.map(
          (g) => html`<li>
            <a class="row" href="/g/${g.id}" data-link>
              <span class="avatar">${initials(g.name)}</span>
              <span class="grow">
                <span class="title">${g.name}</span>
                <span class="muted small">${g.member_count} ${g.member_count === 1 ? "person" : "people"} · ${money(g.total, g.currency)} spent</span>
              </span>
              <span class="amount small ${g.my_balance > 0 ? "pos" : g.my_balance < 0 ? "neg" : "muted"}">
                ${g.my_balance === 0 ? "Settled" : `${g.my_balance > 0 ? "You're owed" : "You owe"} ${money(Math.abs(g.my_balance), g.currency)}`}
              </span>
            </a>
          </li>`,
        )}
      </ul>`,
  );
}

function renderNewGroup() {
  render(
    app,
    html`<div class="narrow"><a href="/" data-link class="small back">← Your groups</a>
      <div class="card">
        <h1>Create a group</h1>
        <p class="muted small">Next you'll get one link to share with everyone in the group.</p>
        <form id="new-group" novalidate>
          <div class="field"><label for="g-name">Group name</label><input id="g-name" name="name" maxlength="80" placeholder="e.g. Lisbon trip" required /></div>
          <div class="grid2">
            <div class="field"><label for="g-me">Your name</label><input id="g-me" name="myName" maxlength="60" value="${me.name}" required /></div>
            <div class="field"><label for="g-cur">Currency</label><select id="g-cur" name="currency">${CURRENCIES.map((c) => html`<option ${c === "EUR" ? raw("selected") : ""}>${c}</option>`)}</select></div>
          </div>
          <p class="error"></p>
          <button class="btn primary block">Create group</button>
        </form>
      </div></div>`,
  );
  const form = $("#new-group");
  form.name.focus();
  form.onsubmit = (e) => {
    e.preventDefault();
    formError(form);
    withBusy($("button.primary", form), async () => {
      try {
        const { id } = await api("/groups", {
          method: "POST",
          body: { name: form.name.value, myName: form.myName.value, currency: form.currency.value },
        });
        if (!me.name) me.name = form.myName.value.trim();
        renderAccount();
        navigate(`/g/${id}?share=1`, { replace: true });
      } catch (err) {
        formError(form, err);
      }
    });
  };
}

// ---------- group ----------

const TABS = [
  ["expenses", "Expenses"],
  ["balances", "Balances"],
  ["people", "People"],
  ["settings", "Settings"],
];

async function renderGroup(groupId) {
  const tab = TABS.some(([k]) => k === new URLSearchParams(location.search).get("tab"))
    ? new URLSearchParams(location.search).get("tab")
    : "expenses";
  const data = await api(`/groups/${groupId}`);
  const { group, members, expenses, settlements, meId } = data;
  const cur = group.currency;
  const byId = new Map(members.map((m) => [m.id, m]));
  const name = (id) => (id === meId ? "You" : byId.get(id)?.name ?? "?");
  const total = expenses.filter((e) => e.kind === "expense").reduce((a, e) => a + e.amount, 0);
  const mine = byId.get(meId);
  const others = members.filter((m) => !m.isMe);

  // Until someone else has joined, the share link is the main call to action.
  const joined = members.filter((m) => m.claimed).length;
  const shareCard = joined < 2 && tab !== "people" ? groupLinkCard(group, { compact: false }) : "";

  let body;
  if (tab === "expenses") body = expensesTab(data, name);
  else if (tab === "balances") body = balancesTab(data, name);
  else if (tab === "people") body = peopleTab(data);
  else body = settingsTab(data);

  render(
    app,
    html`<a href="/" data-link class="small back">← Your groups</a>
      <div class="page-head">
        <div><h1>${group.name}</h1><p class="muted small">${members.length} ${members.length === 1 ? "person" : "people"} · ${cur}${group.description ? ` · ${group.description}` : ""}</p></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="label">Total spent</div><div class="value">${money(total, cur)}</div></div>
        <div class="stat"><div class="label">${mine.balance >= 0 ? "You're owed" : "You owe"}</div><div class="value ${mine.balance > 0 ? "pos" : mine.balance < 0 ? "neg" : ""}">${money(Math.abs(mine.balance), cur)}</div></div>
      </div>
      ${shareCard}
      <nav class="segmented" aria-label="Group sections">
        ${TABS.map(([key, label]) => html`<a href="/g/${group.id}?tab=${key}" data-link aria-current="${tab === key ? "page" : "false"}">${label}</a>`)}
      </nav>
      ${body}
      ${tab === "expenses" || tab === "balances" ? html`<button class="btn primary fab" data-add-expense>+ Add expense</button>` : ""}`,
  );

  const refresh = () => renderGroup(groupId).catch(showError);
  $$("[data-add-expense]").forEach((b) => (b.onclick = () => openExpense(data, null, refresh)));
  $$("[data-expense]").forEach((b) => (b.onclick = () => openExpense(data, expenses.find((e) => e.id === b.dataset.expense), refresh)));
  $$("[data-settle]").forEach(
    (b) =>
      (b.onclick = () => {
        const s = settlements[Number(b.dataset.settle)];
        openExpense(data, { kind: "transfer", title: "Payment", amount: s.amount, paidBy: s.from, date: today(), splitMode: "equal", shares: [{ memberId: s.to, weight: 1 }] }, refresh, true);
      }),
  );
  bindGroupLink(group, refresh);
  if (new URLSearchParams(location.search).get("share") === "1") {
    history.replaceState(null, "", `/g/${group.id}`);
    showShareDialog(group);
  }
  if (tab === "people") bindPeople(data, refresh);
  if (tab === "settings") bindSettings(data, refresh);
}

function expensesTab({ expenses, meId, group }, name) {
  const cur = group.currency;
  if (!expenses.length) {
    return html`<div class="card empty"><p>No expenses yet.</p><button class="btn primary" data-add-expense>Add the first expense</button></div>`;
  }
  const byDate = new Map();
  for (const e of expenses) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  return html`${[...byDate].map(
    ([date, list]) => html`<div class="date-head">${formatDate(date)}</div>
      <ul class="list">
        ${list.map((e) => {
          const myShare = e.shares.find((s) => s.memberId === meId)?.amount ?? 0;
          const myNet = (e.paidBy === meId ? e.amount : 0) - myShare;
          const transfer = e.kind === "transfer";
          const sub = transfer ? `${name(e.paidBy)} paid ${name(e.shares[0]?.memberId)}` : `Paid by ${name(e.paidBy)}${e.category ? ` · ${e.category}` : ""}`;
          const note =
            myNet === 0
              ? ""
              : transfer
                ? myNet > 0
                  ? `you gave ${money(myNet, cur)}`
                  : `you received ${money(-myNet, cur)}`
                : myNet > 0
                  ? `you lent ${money(myNet, cur)}`
                  : `you owe ${money(-myNet, cur)}`;
          return html`<li>
            <button class="row" data-expense="${e.id}">
              <span class="avatar ${transfer ? "transfer" : ""}">${transfer ? "⇄" : initials(e.title)}</span>
              <span class="grow"><span class="title">${e.title}</span><span class="muted small">${sub}</span></span>
              <span class="amount">${money(e.amount, cur)}<br /><span class="small ${transfer ? "muted" : myNet > 0 ? "pos" : myNet < 0 ? "neg" : "muted"}">${note}</span></span>
            </button>
          </li>`;
        })}
      </ul>`,
  )}`;
}

function balancesTab({ members, settlements, meId, group }, name) {
  const cur = group.currency;
  const max = Math.max(1, ...members.map((m) => Math.abs(m.balance)));
  return html`<h2>Balances</h2>
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
    <h2 class="section">Settle up</h2>
    ${settlements.length
      ? html`<p class="muted small">Make these payments, then tap “Mark paid” to record them.</p>
          <ul class="list">
            ${settlements.map(
              (s, i) => html`<li class="row">
                <span class="grow"><strong>${name(s.from)}</strong> ${s.from === meId ? "pay" : "pays"} <strong>${name(s.to)}</strong></span>
                <span class="amount">${money(s.amount, cur)}</span>
                <button class="btn small" data-settle="${i}">Mark paid</button>
              </li>`,
            )}
          </ul>`
      : html`<div class="card empty">Everyone is settled up.</div>`}
    <h2 class="section">Totals</h2>
    <ul class="list">
      ${members.map(
        (m) => html`<li class="row"><span class="grow">${m.name}</span><span class="muted small">paid ${money(m.paid, cur)} · share ${money(m.spent, cur)}</span></li>`,
      )}
    </ul>`;
}

const groupLinkUrl = (group) => (group.shareToken ? inviteUrl(group.shareToken) : "");

/** The group's share link: one link for everyone, e.g. dropped into a group chat. */
function groupLinkCard(group, { compact } = {}) {
  return html`<div class="card share-card">
    <h2>Invite people to ${group.name}</h2>
    <p class="muted small">Share this link in your group chat. Anyone who opens it can sign in or create an account, then join this group.</p>
    <div class="link-row">
      <label for="group-link-${compact ? "b" : "a"}" class="visually-hidden">Group link</label>
      <input id="group-link-${compact ? "b" : "a"}" readonly value="${groupLinkUrl(group)}" data-link-input />
      <button class="btn primary" data-copy-link>Copy link</button>
      ${navigator.share ? html`<button class="btn" data-share-link>Share…</button>` : ""}
    </div>
    ${compact && group.isOwner ? html`<button class="btn ghost small danger" data-reset-link>Reset link</button>` : ""}
  </div>`;
}

function shareGroupLink(group) {
  const url = groupLinkUrl(group);
  navigator.share({ title: group.name, text: `Join "${group.name}" on BillSplit to split expenses`, url }).catch(() => {});
}

function bindGroupLink(group, refresh) {
  $$("[data-link-input]").forEach((input) => (input.onfocus = () => input.select()));
  $$("[data-copy-link]").forEach((b) => (b.onclick = () => copy(groupLinkUrl(group))));
  $$("[data-share-link]").forEach((b) => (b.onclick = () => shareGroupLink(group)));
  $$("[data-reset-link]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("Reset the group link? The current link stops working, and you'll need to share the new one.")) return;
        try {
          await api(`/groups/${group.id}/invites/reset`, { method: "POST" });
          toast("New link created");
          refresh();
        } catch (err) {
          toast(err.message);
        }
      }),
  );
}

function showShareDialog(group) {
  const url = groupLinkUrl(group);
  openDialog(
    html`<div class="sheet">
      <div class="sheet-head"><h2>Group created</h2><button type="button" class="btn ghost small" data-close>Done</button></div>
      <p>Share this link in your group chat. Everyone who opens it can sign in and join <strong>${group.name}</strong>.</p>
      <div class="field"><label for="share-link" class="visually-hidden">Group link</label><input id="share-link" readonly value="${url}" /></div>
      <div class="actions">
        <button class="btn primary" id="dlg-copy">Copy link</button>
        ${navigator.share ? html`<button class="btn" id="dlg-share">Share…</button>` : ""}
      </div>
    </div>`,
    (dialog) => {
      const input = $("#share-link", dialog);
      input.onfocus = () => input.select();
      $("#dlg-copy", dialog).onclick = () => copy(url);
      const share = $("#dlg-share", dialog);
      if (share) share.onclick = () => shareGroupLink(group);
    },
  );
}

function peopleTab({ group, members }) {
  return html`${groupLinkCard(group, { compact: true })}
    <h2 class="section">People</h2>
    <ul class="list">
      ${members.map(
        (m) => html`<li class="row">
          <span class="avatar">${initials(m.name)}</span>
          <span class="grow"><span class="title">${m.name}</span><span class="muted small">${
            m.isMe ? `You${m.isOwner ? " · created this group" : ""}` : m.claimed ? `Joined${m.email ? ` · ${m.email}` : ""}` : "Not joined"
          }</span></span>
          <button class="btn small ghost" data-edit="${m.id}" aria-label="Edit ${m.name}">Edit</button>
        </li>`,
      )}
    </ul>
    <p class="muted small">Add someone who won't use the app, or add people now so they can pick their name when they join.</p>
    <form class="add-row" id="add-member">
      <label for="new-person" class="visually-hidden">Name</label>
      <input id="new-person" name="name" placeholder="Name" maxlength="60" required />
      <button class="btn">Add person</button>
    </form>
    <p class="error" id="member-error"></p>`;
}

function bindPeople({ group, members }, refresh) {
  const addForm = $("#add-member");
  addForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(`/groups/${group.id}/members`, { method: "POST", body: { name: addForm.name.value.trim() } });
      await refresh();
      $("#new-person")?.focus();
    } catch (err) {
      $("#member-error").textContent = err.message;
    }
  };
  $$("[data-edit]").forEach(
    (b) =>
      (b.onclick = () => {
        const m = members.find((x) => x.id === b.dataset.edit);
        openDialog(
          html`<form class="sheet">
            <div class="sheet-head"><h2>Edit ${m.name}</h2><button type="button" class="btn ghost small" data-close>Cancel</button></div>
            <div class="field"><label for="m-name">Name</label><input id="m-name" name="name" value="${m.name}" maxlength="60" required /></div>
            <p class="error"></p>
            <div class="actions">
              <button class="btn primary">Save</button>
              ${m.isMe ? "" : html`<button type="button" class="btn danger" id="remove-member">Remove from group</button>`}
            </div>
          </form>`,
          (dialog) => {
            const form = $("form", dialog);
            form.onsubmit = async (e) => {
              e.preventDefault();
              try {
                if (form.name.value.trim() !== m.name) await api(`/groups/${group.id}/members/${m.id}`, { method: "PATCH", body: { name: form.name.value } });
                dialog.close();
                refresh();
              } catch (err) {
                formError(form, err);
              }
            };
            const remove = $("#remove-member", dialog);
            if (remove)
              remove.onclick = async () => {
                if (!confirm(`Remove ${m.name} from the group?`)) return;
                try {
                  await api(`/groups/${group.id}/members/${m.id}`, { method: "DELETE" });
                  dialog.close();
                  refresh();
                } catch (err) {
                  formError(form, err);
                }
              };
          },
        );
      }),
  );
}

function settingsTab({ group }) {
  const cur = group.currency;
  return html`<form class="card" id="group-form">
      <h2>Group details</h2>
      <div class="field"><label for="gs-name">Name</label><input id="gs-name" name="name" value="${group.name}" maxlength="80" required /></div>
      <div class="grid2">
        <div class="field"><label for="gs-cur">Currency</label><select id="gs-cur" name="currency">${[...new Set([cur, ...CURRENCIES])].map((c) => html`<option ${c === cur ? raw("selected") : ""}>${c}</option>`)}</select></div>
        <div class="field"><label for="gs-desc">Description</label><input id="gs-desc" name="description" value="${group.description}" maxlength="300" /></div>
      </div>
      <p class="error"></p>
      <button class="btn primary">Save</button>
    </form>
    <div class="card">
      <h2>Export</h2>
      <p class="muted small">Download all expenses with each person's share.</p>
      <a class="btn" href="/api/groups/${group.id}/export.csv" download>Download CSV</a>
    </div>
    <div class="card">
      <h2>Leave or delete</h2>
      <p class="muted small">Leaving keeps your expenses in the group. ${group.isOwner ? "Deleting removes the group and all expenses for everyone." : ""}</p>
      <div class="actions">
        <button class="btn danger" id="leave-group">Leave group</button>
        ${group.isOwner ? html`<button class="btn danger" id="delete-group">Delete group</button>` : ""}
      </div>
    </div>`;
}

function bindSettings({ group }, refresh) {
  const gForm = $("#group-form");
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
  $("#leave-group").onclick = async () => {
    if (!confirm("Leave this group? You'll no longer see it. Your expenses stay in the group.")) return;
    await api(`/groups/${group.id}/leave`, { method: "POST" });
    navigate("/");
  };
  const del = $("#delete-group");
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
  const firstOther = members.find((m) => m.id !== meId)?.id;
  const label = (m) => (m.id === meId ? `${m.name} (you)` : m.name);

  const dialog = openDialog(
    html`<form class="sheet" novalidate>
      <div class="sheet-head"><h2>${isEdit ? "Edit" : "Add"} ${state.kind === "transfer" ? "payment" : "expense"}</h2><button type="button" class="btn ghost small" data-close>Cancel</button></div>
      <div class="segmented" role="group" aria-label="Type">
        <button type="button" data-kind="expense" aria-pressed="${state.kind === "expense"}">Expense</button>
        <button type="button" data-kind="transfer" aria-pressed="${state.kind === "transfer"}">Payment between people</button>
      </div>
      <div class="field" id="title-field"><label for="x-title">What was it for?</label><input id="x-title" name="title" maxlength="100" value="${expense?.title ?? ""}" placeholder="e.g. Dinner" /></div>
      <div class="grid2">
        <div class="field"><label for="x-amount">Amount (${cur})</label><input id="x-amount" name="amount" inputmode="decimal" value="${expense ? centsToInput(expense.amount) : ""}" placeholder="0.00" required /></div>
        <div class="field"><label for="x-date">Date</label><input id="x-date" name="date" type="date" value="${expense?.date ?? today()}" required /></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="x-paid" id="paid-label">Paid by</label><select id="x-paid" name="paidBy">${members.map((m) => html`<option value="${m.id}" ${(expense?.paidBy ?? meId) === m.id ? raw("selected") : ""}>${label(m)}</option>`)}</select></div>
        <div class="field" id="category-field"><label for="x-cat">Category</label><select id="x-cat" name="category">${[...new Set([...(expense?.category ? [expense.category] : []), ...CATEGORIES])].map((c) => html`<option value="${c}" ${c === (expense?.category ?? "") ? raw("selected") : ""}>${c || "None"}</option>`)}</select></div>
        <div class="field" id="to-field"><label for="x-to">To</label><select id="x-to" name="to">${members.map((m) => html`<option value="${m.id}" ${(expense?.kind === "transfer" ? expense.shares[0]?.memberId : firstOther) === m.id ? raw("selected") : ""}>${label(m)}</option>`)}</select></div>
      </div>
      <div id="split-section">
        <label>Split between</label>
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
  const form = $("form", dialog);
  const rows = $("#split-rows", form);
  const summary = $("#split-summary", form);
  if (!isEdit && !isNewFromTemplate) form.title.focus();

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
          <input type="checkbox" id="chk-${m.id}" data-check="${m.id}" ${w > 0 ? raw("checked") : ""} />
          <label class="name" for="chk-${m.id}">${label(m)}</label>
          ${input}
          <span class="share">${w > 0 ? money(preview.get(m.id) ?? 0, cur) : "—"}</span>
        </div>`;
      })}`,
    );
    updateSummary();
    $$("[data-check]", rows).forEach(
      (c) =>
        (c.onchange = () => {
          const id = c.dataset.check;
          state.weights.set(id, c.checked ? 1 : 0);
          if (state.mode === "amounts" && c.checked) {
            const amount = parseAmount(form.amount.value) || 0;
            const assigned = [...state.weights].filter(([k]) => k !== id).reduce((a, [, b]) => a + b, 0);
            state.weights.set(id, Math.max(0, amount - assigned) || 1);
          }
          drawRows();
        }),
    );
    $$("[data-weight]", rows).forEach(
      (input) =>
        (input.oninput = () => {
          const v = state.mode === "shares" ? parseInt(input.value, 10) : parseAmount(input.value);
          state.weights.set(input.dataset.weight, Number.isFinite(v) && v > 0 ? v : 0);
          $(`[data-check="${input.dataset.weight}"]`, rows).checked = state.weights.get(input.dataset.weight) > 0;
          const p = previewShares();
          $$(".split-row", rows).forEach((row, i) => {
            const m = members[i];
            $(".share", row).textContent = state.weights.get(m.id) > 0 ? money(p.get(m.id) ?? 0, cur) : "—";
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
      summary.textContent = left === 0 ? `All ${money(amount, cur)} assigned.` : left > 0 ? `${money(left, cur)} left to assign.` : `${money(-left, cur)} too much assigned.`;
      summary.className = `small ${left === 0 ? "muted" : "neg"}`;
    } else {
      summary.className = "muted small";
      summary.textContent = active ? `Split between ${active} ${active === 1 ? "person" : "people"}.` : "Pick at least one person.";
    }
  }

  function applyKind() {
    const transfer = state.kind === "transfer";
    $$("[data-kind]", form).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === state.kind)));
    $("#split-section", form).hidden = transfer;
    $("#category-field", form).hidden = transfer;
    $("#to-field", form).hidden = !transfer;
    $("#title-field", form).hidden = transfer;
    $("#paid-label", form).textContent = transfer ? "From" : "Paid by";
    $(".sheet-head h2", dialog).textContent = `${isEdit ? "Edit" : "Add"} ${transfer ? "payment" : "expense"}`;
  }

  $$("[data-kind]", form).forEach((b) => (b.onclick = () => ((state.kind = b.dataset.kind), applyKind())));
  $$("[data-mode]", form).forEach(
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
        $$("[data-mode]", form).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.mode === next)));
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
    if (!transfer && !form.title.value.trim()) return formError(form, new Error("Enter what the expense was for"));
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
    withBusy($("button.primary", form), async () => {
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
  const del = $("#delete-expense", form);
  if (del)
    del.onclick = async () => {
      if (!confirm(`Delete "${expense.title}"?`)) return;
      await api(`/groups/${group.id}/expenses/${expense.id}`, { method: "DELETE" });
      dialog.close();
      toast("Deleted");
      onDone();
    };
}

// ---------- invite landing page ----------

async function renderInvite(token) {
  const invite = await api(`/invites/${token}`);
  if (invite.alreadyMember) return navigate(`/g/${invite.groupId}`, { replace: true });

  const heading = html`<p class="step-label">${invite.invitedBy ? `${invite.invitedBy} invited you to join` : "You're invited to join"}</p>
    <h1>${invite.group.name}</h1>
    ${invite.group.description ? html`<p class="muted">${invite.group.description}</p>` : ""}`;

  if (invite.status !== "active") {
    render(
      app,
      html`<div class="card narrow">${heading}<p><strong>This link no longer works.</strong> Ask the group for the current link.</p>
        <a class="btn" href="/" data-link>Go to BillSplit</a></div>`,
    );
    return;
  }

  if (!invite.signedIn) {
    render(app, html`<div class="card narrow">${heading}<div id="signin-card"></div></div>`);
    signInForm($("#signin-card"), { next: `/join/${token}`, title: "Sign in to join", button: "Continue" });
    return;
  }

  const open = invite.openPeople;
  render(
    app,
    html`<div class="card narrow">${heading}
      <form id="join-form">
        ${open.length
          ? html`<fieldset>
              <legend>Are you already on the list?</legend>
              <ul class="list choose">
                ${open.map(
                  (p) => html`<li><label class="row"><input type="radio" name="who" value="${p.id}" ${p.id === invite.suggestedMemberId ? raw("checked") : ""} /> <span class="grow">I'm ${p.name}</span></label></li>`,
                )}
                <li><label class="row"><input type="radio" name="who" value="" ${invite.suggestedMemberId ? "" : raw("checked")} /> <span class="grow">I'm not on the list</span></label></li>
              </ul>
            </fieldset>`
          : html`<input type="hidden" name="who" value="" />`}
        <div class="field" id="name-field"><label for="new-name">Your name in this group</label><input id="new-name" name="newName" value="${me.name}" maxlength="60" /></div>
        <p class="error"></p>
        <button class="btn primary block">Join group</button>
      </form>
    </div>`,
  );
  const form = $("#join-form");
  const selected = () => $('input[name="who"]:checked', form) ?? $('input[name="who"]', form);
  const sync = () => ($("#name-field").hidden = Boolean(selected()?.value));
  $$('input[name="who"]', form).forEach((r) => (r.onchange = sync));
  sync();
  form.onsubmit = (e) => {
    e.preventDefault();
    const who = selected()?.value;
    withBusy($("button.primary", form), async () => {
      try {
        const { id } = await api(`/invites/${token}/join`, { method: "POST", body: who ? { memberId: who } : { name: form.newName.value } });
        toast("You joined the group");
        navigate(`/g/${id}`, { replace: true });
      } catch (err) {
        formError(form, err);
      }
    });
  };
}

// ---------- admin ----------

const ADMIN_TABS = [
  ["/admin", "Overview"],
  ["/admin/users", "Users"],
  ["/admin/groups", "Groups"],
  ["/admin/signins", "Sign-ins & emails"],
  ["/admin/audit", "Audit log"],
];
const ACTIONS = {
  "auth.email_sent": "Sign-in email sent",
  "auth.email_failed": "Sign-in email failed",
  "auth.rate_limited": "Sign-in rate limited",
  "auth.code_wrong": "Wrong sign-in code",
  "auth.signed_in": "Signed in",
  "auth.signed_out": "Signed out",
  "user.registered": "Account registered",
  "user.renamed": "Changed name",
  "group.created": "Created group",
  "group.updated": "Updated group",
  "group.deleted": "Deleted group",
  "member.added": "Added person",
  "member.renamed": "Renamed person",
  "member.removed": "Removed person",
  "member.left": "Left group",
  "invite.created": "Created invite",
  "invite.revoked": "Cancelled invite",
  "invite.reset": "Reset group link",
  "invite.used": "Joined via invite",
  "expense.created": "Added expense",
  "expense.updated": "Edited expense",
  "expense.deleted": "Deleted expense",
};
const STATUS_PILL = { verified: "ok", used: "ok", sent: "ok", active: "warn", pending: "warn", failed: "bad", locked: "bad" };
const pill = (status) => html`<span class="pill ${STATUS_PILL[status] ?? ""}">${status ?? "—"}</span>`;

function adminShell(current, body) {
  render(
    app,
    html`<div class="admin">
      <h1>Admin</h1>
      <nav class="tabs" aria-label="Admin sections">
        ${ADMIN_TABS.map(([href, label]) => html`<a href="${href}" data-link aria-current="${current === href ? "page" : "false"}">${label}</a>`)}
      </nav>
      ${body}
    </div>`,
  );
}

function auditTable(entries, { showGroup = true } = {}) {
  if (!entries.length) return html`<p class="muted">No entries.</p>`;
  return html`<div class="table-wrap"><table>
    <thead><tr><th>Time</th><th>Action</th><th>By</th>${showGroup ? html`<th>Group</th>` : ""}<th>Details</th></tr></thead>
    <tbody>
      ${entries.map((a) => {
        const details = JSON.parse(a.details || "{}");
        return html`<tr>
          <td class="nowrap">${formatTime(a.at)}</td>
          <td><span title="${a.action}">${ACTIONS[a.action] ?? a.action}</span></td>
          <td>${a.actor_id ? html`<a href="/admin/users/${a.actor_id}" data-link>${a.actor_email}</a>` : html`<span class="muted">${details.email ?? "—"}</span>`}</td>
          ${showGroup ? html`<td>${a.group_id ? html`<a href="/admin/groups/${a.group_id}" data-link>${a.group_name ?? "(deleted)"}</a>` : "—"}</td>` : ""}
          <td class="details"><code>${Object.keys(details).length ? JSON.stringify(details) : ""}</code>${a.ip ? html`<span class="muted small"> · ${a.ip}</span>` : ""}</td>
        </tr>`;
      })}
    </tbody></table></div>`;
}

function signInsTable(rows, { showEmail = true } = {}) {
  if (!rows.length) return html`<p class="muted">No sign-ins.</p>`;
  return html`<div class="table-wrap"><table>
    <thead><tr><th>Requested</th>${showEmail ? html`<th>Email</th>` : ""}<th>Verification</th><th>Email delivery</th><th>Wrong codes</th><th>Then went to</th></tr></thead>
    <tbody>
      ${rows.map(
        (r) => html`<tr>
          <td class="nowrap">${formatTime(r.created_at)}</td>
          ${showEmail ? html`<td>${r.user_id ? html`<a href="/admin/users/${r.user_id}" data-link>${r.email}</a>` : r.email}${r.registered ? html` <span class="pill ok">new account</span>` : ""}</td>` : ""}
          <td>${pill(r.status)}${r.used_at ? html` <span class="muted small">${formatTime(r.used_at)}</span>` : ""}</td>
          <td>${pill(r.email_status)}${r.email_error ? html` <span class="neg small">${r.email_error}</span>` : ""}</td>
          <td>${r.attempts}</td>
          <td><code>${r.next_path}</code></td>
        </tr>`,
      )}
    </tbody></table></div>`;
}

async function renderAdmin(path) {
  let m;
  if (path === "/admin") {
    const o = await api("/admin/overview");
    const tile = (label, value, sub) => html`<div class="stat"><div class="label">${label}</div><div class="value">${value}</div>${sub ? html`<div class="muted small">${sub}</div>` : ""}</div>`;
    return adminShell(
      path,
      html`<div class="stats four">
        ${tile("Users", o.users, `${o.users_7d} new · ${o.active_7d} active in 7 days`)}
        ${tile("Groups", o.groups, `${o.expenses} expenses`)}
        ${tile("People in groups", o.people, `${o.joined_people} with an account`)}
        ${tile("Joins via links", o.link_joins, `${o.open_invites} active links`)}
        ${tile("Sign-ins (24h)", o.signins_24h, `${o.signins_verified_24h} verified`)}
        ${tile("Emails (24h)", o.emails_24h, html`<span class="${o.emails_failed_24h ? "neg" : ""}">${o.emails_failed_24h} failed</span>`)}
      </div>`,
    );
  }
  if (path === "/admin/users") {
    const users = await api(`/admin/users`);
    return adminShell(
      path,
      html`<div class="table-wrap"><table>
        <thead><tr><th>Email</th><th>Name</th><th>Registered</th><th>Last sign-in</th><th>Groups</th><th>Sessions</th></tr></thead>
        <tbody>${users.map(
          (u) => html`<tr><td><a href="/admin/users/${u.id}" data-link>${u.email}</a></td><td>${u.name || html`<span class="muted">—</span>`}</td>
            <td class="nowrap">${formatTime(u.created_at)}</td><td class="nowrap">${formatTime(u.last_login_at)}</td>
            <td>${u.groups}${u.owned_groups ? html` <span class="muted small">(${u.owned_groups} owned)</span>` : ""}</td><td>${u.sessions}</td></tr>`,
        )}</tbody></table></div>`,
    );
  }
  if ((m = /^\/admin\/users\/([\w-]+)$/.exec(path))) {
    const d = await api(`/admin/users/${m[1]}`);
    return adminShell(
      "/admin/users",
      html`<h2>${d.user.email}</h2>
        <p class="muted">${d.user.name || "No name yet"} · registered ${formatTime(d.user.created_at)} · last sign-in ${formatTime(d.user.last_login_at)}</p>
        <h3>Groups</h3>
        ${d.groups.length
          ? html`<div class="table-wrap"><table><thead><tr><th>Group</th><th>As</th><th>Role</th><th>Created</th></tr></thead><tbody>
              ${d.groups.map((g) => html`<tr><td><a href="/admin/groups/${g.id}" data-link>${g.name}</a></td><td>${g.member_name}</td><td>${g.is_owner ? "Owner" : "Member"}</td><td class="nowrap">${formatTime(g.created_at)}</td></tr>`)}
            </tbody></table></div>`
          : html`<p class="muted">Not in any groups.</p>`}
        <h3>Sign-ins</h3>${signInsTable(d.signins, { showEmail: false })}
        <h3>Activity</h3>${auditTable(d.audit)}`,
    );
  }
  if (path === "/admin/groups") {
    const groups = await api(`/admin/groups`);
    return adminShell(
      path,
      html`<div class="table-wrap"><table>
        <thead><tr><th>Group</th><th>Owner</th><th>People</th><th>Expenses</th><th>Total</th><th>Open invites</th><th>Created</th></tr></thead>
        <tbody>${groups.map(
          (g) => html`<tr><td><a href="/admin/groups/${g.id}" data-link>${g.name}</a></td><td>${g.owner_email ?? "—"}</td>
            <td>${g.joined}/${g.people} joined</td><td>${g.expenses}</td><td class="nowrap">${money(g.total, g.currency)}</td><td>${g.open_invites}</td><td class="nowrap">${formatTime(g.created_at)}</td></tr>`,
        )}</tbody></table></div>`,
    );
  }
  if ((m = /^\/admin\/groups\/([\w-]+)$/.exec(path))) {
    const d = await api(`/admin/groups/${m[1]}`);
    const g = d.group;
    return adminShell(
      "/admin/groups",
      html`<h2>${g.name}</h2>
        <p class="muted">${g.currency} · created ${formatTime(g.created_at)} by ${g.owner_id ? html`<a href="/admin/users/${g.owner_id}" data-link>${g.owner_email}</a>` : "—"}</p>
        <h3>People</h3>
        <div class="table-wrap"><table><thead><tr><th>Name</th><th>Account</th><th>Last sign-in</th><th>Balance</th><th>Added</th></tr></thead><tbody>
          ${d.people.map(
            (p) => html`<tr><td>${p.name}</td><td>${p.user_id ? html`<a href="/admin/users/${p.user_id}" data-link>${p.email}</a>` : html`<span class="pill">not joined</span>`}</td>
              <td class="nowrap">${formatTime(p.last_login_at)}</td><td class="nowrap">${money(p.balance, g.currency)}</td><td class="nowrap">${formatTime(p.created_at)}</td></tr>`,
          )}
        </tbody></table></div>
        <h3>Invites</h3>
        ${d.invites.length
          ? html`<div class="table-wrap"><table><thead><tr><th>Link</th><th>Status</th><th>Joins</th><th>Created</th><th>By</th><th>Last used</th></tr></thead><tbody>
              ${d.invites.map(
                (i) => html`<tr><td>${i.multi_use ? "Group link" : i.label ? `Personal: ${i.label}` : "Personal"}</td><td>${pill(i.status)}</td><td>${i.use_count}</td><td class="nowrap">${formatTime(i.created_at)}</td>
                  <td>${i.created_by_email ?? "—"}</td><td>${i.used_by_email ? html`${i.used_by_email} <span class="muted small">${formatTime(i.used_at)}</span>` : formatTime(i.last_used_at)}</td></tr>`,
              )}
            </tbody></table></div>`
          : html`<p class="muted">No invites.</p>`}
        <h3>Activity</h3>${auditTable(d.audit, { showGroup: false })}`,
    );
  }
  if (path === "/admin/signins") {
    const rows = await api(`/admin/signins`);
    return adminShell(path, html`<p class="muted small">Every sign-in request: whether the email was delivered and whether the person verified it.</p>${signInsTable(rows)}`);
  }
  if (path === "/admin/audit") {
    const params = new URLSearchParams(location.search);
    const filters = { action: params.get("action") ?? "", actor: params.get("actor") ?? "" };
    const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    const first = await api(`/admin/audit?${query}`);
    adminShell(
      path,
      html`<form class="filters" id="audit-filters">
          <label>Action <select name="action"><option value="">All</option>
            ${["auth", "user", "group", "member", "invite", "expense"].map((p) => html`<option value="${p}." ${filters.action === `${p}.` ? raw("selected") : ""}>${p}</option>`)}
          </select></label>
          <label>User <input name="actor" value="${filters.actor}" placeholder="email" /></label>
          <button class="btn small">Filter</button>
        </form>
        <div id="audit-rows">${auditTable(first.entries)}</div>
        <div class="actions center">${first.next ? html`<button class="btn" id="more">Load more</button>` : ""}</div>`,
    );
    const form = $("#audit-filters");
    form.onsubmit = (e) => {
      e.preventDefault();
      const q = new URLSearchParams([...new FormData(form)].filter(([, v]) => v));
      navigate(`/admin/audit${q.size ? `?${q}` : ""}`, { replace: true });
    };
    let next = first.next;
    let all = first.entries;
    const more = $("#more");
    if (more)
      more.onclick = () =>
        withBusy(more, async () => {
          query.set("before", next);
          const page = await api(`/admin/audit?${query}`);
          all = all.concat(page.entries);
          next = page.next;
          render($("#audit-rows"), auditTable(all));
          if (!next) more.remove();
        });
    return;
  }
  showError(Object.assign(new Error("This page doesn't exist."), { status: 404 }));
}

// ---------- router ----------

function showError(err) {
  // Admin pages sit behind Cloudflare Access. Without an Access session the API call is
  // redirected to the Access login (a network error for fetch); a full page load signs in.
  if (location.pathname.startsWith("/admin") && (err instanceof TypeError || err.status === 403)) {
    render(
      app,
      html`<div class="card narrow center"><h2>Confirm it's you</h2><p class="muted">The admin area needs a Cloudflare Access sign-in.</p>
        <button class="btn primary" id="access-login">Continue</button></div>`,
    );
    $("#access-login").onclick = () => location.assign(location.pathname + location.search);
    return;
  }
  if (err.status === 401) {
    me = null;
    renderAccount();
    return renderHomeSignedOut();
  }
  render(app, html`<div class="card empty"><h2>${err.status === 404 ? "Not found" : "Something went wrong"}</h2><p>${err.message}</p><a class="btn" href="/" data-link>Go to your groups</a></div>`);
}

async function route() {
  const path = location.pathname;
  window.scrollTo(0, 0);
  render(app, html`<div class="spinner" aria-label="Loading"></div>`);
  try {
    let m;
    if (path === "/signin") return renderLinkSignIn();
    // Invite pages work signed out: they show the group and the sign-in form.
    if ((m = /^\/join\/([\w-]+)$/.exec(path)) && (!me || me.name)) return await renderInvite(m[1]);
    if (!me) return renderHomeSignedOut();
    if (!me.name) return renderNameStep();
    if (path === "/") return await renderGroups();
    if (path === "/new") return renderNewGroup();
    if ((m = /^\/g\/([\w-]+)$/.exec(path))) return await renderGroup(m[1]);
    if (path.startsWith("/admin")) return await renderAdmin(path);
    showError(Object.assign(new Error("This page doesn't exist."), { status: 404 }));
  } catch (err) {
    showError(err);
  }
}

(async () => {
  try {
    const res = await api("/me");
    me = res.user;
    meIsAdmin = res.isAdmin;
  } catch {
    me = null;
  }
  renderAccount();
  route();
})();
