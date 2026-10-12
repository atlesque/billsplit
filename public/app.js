// BillSplit front end: a small dependency-free SPA with history routing.

import { LANGUAGES, getLanguage, getLocale, hasTranslation, setLanguage, t } from "/i18n.js";

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
/** A translation whose text contains HTML; placeholder values are escaped. */
const th = (key, params = {}) => raw(t(key, Object.fromEntries(Object.entries(params).map(([k, v]) => [k, esc(v)]))));
const $ = (sel, root = app) => root.querySelector(sel);
const $$ = (sel, root = app) => [...root.querySelectorAll(sel)];

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Accept-Language": getLanguage(), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || t("error.requestFailed", { status: res.status }));
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
    return new Intl.NumberFormat(getLocale(), { style: "currency", currency }).format(cents / 100);
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
  new Date(`${iso}T12:00:00`).toLocaleDateString(getLocale(), { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const formatTime = (ms) =>
  ms ? new Date(ms).toLocaleString(getLocale(), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const formatDay = (ms) => (ms ? new Date(ms).toLocaleDateString(getLocale(), { day: "numeric", month: "short", year: "numeric" }) : "—");
const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "CNY", "INR", "BRL", "MXN", "ZAR", "NZD", "SGD", "HKD", "THB", "TRY"];
// Categories are stored in English and translated for display; custom values show as typed.
const CATEGORIES = ["", "Food & drinks", "Groceries", "Transport", "Accommodation", "Activities", "Shopping", "Bills", "Other"];
const categoryLabel = (c) => (hasTranslation(`category.${c}`) ? t(`category.${c}`) : c);
// Payments are stored with the English title "Payment".
const expenseTitle = (e) => (e.kind === "transfer" && e.title === "Payment" ? t("expense.payment") : e.title);
const peopleCount = (count) => t("people", { count });
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

async function copy(text, message = t("link.copied")) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    prompt(t("link.copyPrompt"), text);
  }
}

// ---------- header ----------

function renderAccount() {
  const switcher = html`<label for="lang-select" class="visually-hidden">${t("lang.label")}</label>
    <select id="lang-select" class="lang-select" title="${t("lang.label")}">
      ${Object.entries(LANGUAGES).map(([code, label]) => html`<option value="${code}" lang="${code}" ${code === getLanguage() ? raw("selected") : ""}>${label}</option>`)}
    </select>`;
  render(
    accountEl,
    me
      ? html`${switcher}${meIsAdmin ? html`<a class="btn ghost small" href="/admin">${t("account.admin")}</a>` : ""}
          <button class="btn ghost small" id="account-btn" title="${me.email}">${me.name || me.email}</button>`
      : switcher,
  );
  document.getElementById("lang-select").onchange = (e) => {
    setLanguage(e.target.value);
    renderAccount();
    route({ refresh: true });
  };
  if (me) document.getElementById("account-btn").onclick = openAccountDialog;
}

function openAccountDialog() {
  openDialog(
    html`<form class="sheet">
      <div class="sheet-head"><h2>${t("account.title")}</h2><button type="button" class="btn ghost small" data-close>${t("action.close")}</button></div>
      <p class="muted small">${t("account.signedInAs", { email: me.email })}</p>
      <div class="field"><label for="acc-name">${t("account.yourName")}</label><input id="acc-name" name="name" value="${me.name}" maxlength="60" required /></div>
      <p class="error"></p>
      <div class="actions"><button class="btn primary">${t("action.save")}</button><button type="button" class="btn danger" id="logout">${t("account.signOut")}</button></div>
    </form>`,
    (dialog) => {
      const form = dialog.querySelector("form");
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          me = await api("/me", { method: "PATCH", body: { name: form.name.value } });
          renderAccount();
          dialog.close();
          toast(t("toast.saved"));
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
function signInForm(card, { next = "/", title = t("signin.title"), button = t("action.continue") } = {}) {
  const showEmail = (email = "") => {
    render(
      card,
      html`<form novalidate>
        <h2>${title}</h2>
        <p class="muted small">${t("signin.intro")}</p>
        <div class="field"><label for="email">${t("signin.email")}</label><input id="email" name="email" type="email" autocomplete="email" inputmode="email" value="${email}" required /></div>
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
        <h2>${t("signin.checkEmail")}</h2>
        <p>${th("signin.sent", { email })}</p>
        <div class="field"><label for="code">${t("signin.codeLabel")}</label><input id="code" name="code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required /></div>
        <p class="error"></p>
        <button class="btn primary block">${t("signin.submit")}</button>
        <div class="actions">
          <button type="button" class="btn ghost small" id="resend">${t("signin.resend")}</button>
          <button type="button" class="btn ghost small" id="other-email">${t("signin.otherEmail")}</button>
        </div>
        <p class="muted small">${t("signin.spam")}</p>
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
          toast(t("signin.resent"));
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
        <p class="muted">${t("app.tagline")}</p>
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
      <h1>${t("signin.submit")}</h1>
      <p class="muted">${t("signin.linkHelp")}</p>
      <p class="error"></p>
      <button class="btn primary block" id="go">${t("signin.finish")}</button>
      <div class="actions center"><a href="/" data-link class="small">${t("signin.newLink")}</a></div>
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
      <p class="step-label">${t("name.created")}</p>
      <h1>${t("name.title")}</h1>
      <p class="muted small">${t("name.help")}</p>
      <form>
        <div class="field"><label for="first-name">${t("account.yourName")}</label><input id="first-name" name="name" maxlength="60" autocomplete="name" required /></div>
        <p class="error"></p>
        <button class="btn primary block">${t("action.continue")}</button>
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
        <h1>${t("groups.firstTitle")}</h1>
        <ol class="steps-plain">
          <li>${t("groups.step1")}</li>
          <li>${t("groups.step2")}</li>
          <li>${t("groups.step3")}</li>
        </ol>
        <a class="btn primary block" href="/new" data-link>${t("groups.create")}</a>
        <p class="muted small" style="margin-top:1rem">${t("groups.gotLink")}</p>
      </div>`,
    );
    return;
  }
  render(
    app,
    html`<div class="page-head">
        <h1>${t("nav.yourGroups")}</h1>
        <a class="btn primary" href="/new" data-link>${t("groups.new")}</a>
      </div>
      <ul class="list">
        ${groups.map(
          (g) => html`<li>
            <a class="row" href="/g/${g.id}" data-link>
              <span class="avatar">${initials(g.name)}</span>
              <span class="grow">
                <span class="title">${g.name}</span>
                <span class="muted small">${peopleCount(g.member_count)} · ${t("groups.spent", { amount: money(g.total, g.currency) })}</span>
              </span>
              <span class="amount small ${g.my_balance > 0 ? "pos" : g.my_balance < 0 ? "neg" : "muted"}">
                ${g.my_balance === 0 ? t("balance.settled") : t(g.my_balance > 0 ? "balance.owedAmount" : "balance.oweAmount", { amount: money(Math.abs(g.my_balance), g.currency) })}
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
    html`<div class="narrow"><a href="/" data-link class="small back">${t("nav.backToGroups")}</a>
      <div class="card">
        <h1>${t("groups.create")}</h1>
        <p class="muted small">${t("newGroup.help")}</p>
        <form id="new-group" novalidate>
          <div class="field"><label for="g-name">${t("newGroup.name")}</label><input id="g-name" name="name" maxlength="80" placeholder="${t("newGroup.namePlaceholder")}" required /></div>
          <div class="grid2">
            <div class="field"><label for="g-me">${t("account.yourName")}</label><input id="g-me" name="myName" maxlength="60" value="${me.name}" required /></div>
            <div class="field"><label for="g-cur">${t("field.currency")}</label><select id="g-cur" name="currency">${CURRENCIES.map((c) => html`<option ${c === "EUR" ? raw("selected") : ""}>${c}</option>`)}</select></div>
          </div>
          <p class="error"></p>
          <button class="btn primary block">${t("newGroup.submit")}</button>
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

const TABS = ["expenses", "balances", "people", "settings"];

async function renderGroup(groupId) {
  const tab = TABS.includes(new URLSearchParams(location.search).get("tab"))
    ? new URLSearchParams(location.search).get("tab")
    : "expenses";
  const data = await api(`/groups/${groupId}`);
  const { group, members, expenses, settlements, meId } = data;
  const cur = group.currency;
  const byId = new Map(members.map((m) => [m.id, m]));
  // `object` gives the form used after a verb ("paid you" rather than "paid You").
  const name = (id, { object = false } = {}) => (id === meId ? t(object ? "youObject" : "you") : byId.get(id)?.name ?? "?");
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
    html`<a href="/" data-link class="small back">${t("nav.backToGroups")}</a>
      <div class="page-head">
        <div><h1>${group.name}</h1><p class="muted small">${peopleCount(members.length)} · ${cur}${group.description ? ` · ${group.description}` : ""}</p></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="label">${t("group.totalSpent")}</div><div class="value">${money(total, cur)}</div></div>
        <div class="stat"><div class="label">${t(mine.balance >= 0 ? "balance.owed" : "balance.owe")}</div><div class="value ${mine.balance > 0 ? "pos" : mine.balance < 0 ? "neg" : ""}">${money(Math.abs(mine.balance), cur)}</div></div>
      </div>
      ${shareCard}
      <nav class="segmented" aria-label="${t("group.sections")}">
        ${TABS.map((key) => html`<a href="/g/${group.id}?tab=${key}" data-link aria-current="${tab === key ? "page" : "false"}">${t(`tab.${key}`)}</a>`)}
      </nav>
      ${body}
      ${tab === "expenses" || tab === "balances" ? html`<button class="btn primary fab" data-add-expense>${t("group.addExpense")}</button>` : ""}`,
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
    return html`<div class="card empty"><p>${t("expenses.empty")}</p><button class="btn primary" data-add-expense>${t("expenses.addFirst")}</button></div>`;
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
          const paidBy = e.paidBy === meId ? t("expenses.paidByYou") : t("expenses.paidBy", { name: name(e.paidBy) });
          const sub = transfer
            ? t("expenses.transferSub", { from: name(e.paidBy), to: name(e.shares[0]?.memberId, { object: true }) })
            : `${paidBy}${e.category ? ` · ${categoryLabel(e.category)}` : ""}`;
          const note =
            myNet === 0
              ? ""
              : t(transfer ? (myNet > 0 ? "expenses.youGave" : "expenses.youReceived") : myNet > 0 ? "expenses.youLent" : "expenses.youOwe", {
                  amount: money(Math.abs(myNet), cur),
                });
          return html`<li>
            <button class="row" data-expense="${e.id}">
              <span class="avatar ${transfer ? "transfer" : ""}">${transfer ? "⇄" : initials(e.title)}</span>
              <span class="grow"><span class="title">${expenseTitle(e)}</span><span class="muted small">${sub}</span></span>
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
  return html`<h2>${t("balances.title")}</h2>
    <ul class="list">
      ${members.map(
        (m) => html`<li class="bar-wrap">
          <span class="name">${m.isMe ? t("nameYou", { name: m.name }) : m.name}</span>
          <span class="bar-track" aria-hidden="true">
            <div>${m.balance < 0 ? html`<span class="bar neg" style="width:${(Math.abs(m.balance) / max) * 100}%"></span>` : ""}</div>
            <div>${m.balance > 0 ? html`<span class="bar pos" style="width:${(m.balance / max) * 100}%"></span>` : ""}</div>
          </span>
          <span class="amount ${m.balance > 0 ? "pos" : m.balance < 0 ? "neg" : "muted"}">${m.balance > 0 ? "+" : ""}${money(m.balance, cur)}</span>
        </li>`,
      )}
    </ul>
    <h2 class="section">${t("balances.settleUp")}</h2>
    ${settlements.length
      ? html`<p class="muted small">${t("balances.settleHelp")}</p>
          <ul class="list">
            ${settlements.map(
              (s, i) => html`<li class="row">
                <span class="grow">${s.from === meId ? th("balances.youPay", { to: name(s.to, { object: true }) }) : th("balances.pays", { from: name(s.from), to: name(s.to, { object: true }) })}</span>
                <span class="amount">${money(s.amount, cur)}</span>
                <button class="btn small" data-settle="${i}">${t("balances.markPaid")}</button>
              </li>`,
            )}
          </ul>`
      : html`<div class="card empty">${t("balances.allSettled")}</div>`}
    <h2 class="section">${t("balances.totals")}</h2>
    <ul class="list">
      ${members.map(
        (m) => html`<li class="row"><span class="grow">${m.name}</span><span class="muted small">${t("balances.paidShare", { paid: money(m.paid, cur), share: money(m.spent, cur) })}</span></li>`,
      )}
    </ul>`;
}

const groupLinkUrl = (group) => (group.shareToken ? inviteUrl(group.shareToken) : "");

/** The group's share link: one link for everyone, e.g. dropped into a group chat. */
function groupLinkCard(group, { compact } = {}) {
  return html`<div class="card share-card">
    <h2>${t("link.inviteTitle", { name: group.name })}</h2>
    <p class="muted small">${t("link.inviteHelp")}</p>
    <div class="link-row">
      <label for="group-link-${compact ? "b" : "a"}" class="visually-hidden">${t("link.groupLink")}</label>
      <input id="group-link-${compact ? "b" : "a"}" readonly value="${groupLinkUrl(group)}" data-link-input />
      <button class="btn primary" data-copy-link>${t("link.copy")}</button>
      ${navigator.share ? html`<button class="btn" data-share-link>${t("link.share")}</button>` : ""}
    </div>
    ${compact && group.isOwner ? html`<button class="btn ghost small danger" data-reset-link>${t("link.reset")}</button>` : ""}
  </div>`;
}

function shareGroupLink(group) {
  const url = groupLinkUrl(group);
  navigator.share({ title: group.name, text: t("link.shareText", { name: group.name }), url }).catch(() => {});
}

function bindGroupLink(group, refresh) {
  $$("[data-link-input]").forEach((input) => (input.onfocus = () => input.select()));
  $$("[data-copy-link]").forEach((b) => (b.onclick = () => copy(groupLinkUrl(group))));
  $$("[data-share-link]").forEach((b) => (b.onclick = () => shareGroupLink(group)));
  $$("[data-reset-link]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm(t("link.resetConfirm"))) return;
        try {
          await api(`/groups/${group.id}/invites/reset`, { method: "POST" });
          toast(t("link.resetDone"));
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
      <div class="sheet-head"><h2>${t("share.created")}</h2><button type="button" class="btn ghost small" data-close>${t("action.done")}</button></div>
      <p>${th("share.help", { name: group.name })}</p>
      <div class="field"><label for="share-link" class="visually-hidden">${t("link.groupLink")}</label><input id="share-link" readonly value="${url}" /></div>
      <div class="actions">
        <button class="btn primary" id="dlg-copy">${t("link.copy")}</button>
        ${navigator.share ? html`<button class="btn" id="dlg-share">${t("link.share")}</button>` : ""}
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
    <h2 class="section">${t("people.title")}</h2>
    <ul class="list">
      ${members.map(
        (m) => html`<li class="row">
          <span class="avatar">${initials(m.name)}</span>
          <span class="grow"><span class="title">${m.name}</span><span class="muted small">${
            m.isMe
              ? t(m.isOwner ? "people.youOwner" : "you")
              : m.claimed
                ? m.email
                  ? t("people.joinedEmail", { email: m.email })
                  : t("people.joined")
                : t("people.notJoined")
          }</span></span>
          <button class="btn small ghost" data-edit="${m.id}" aria-label="${t("people.editName", { name: m.name })}">${t("action.edit")}</button>
        </li>`,
      )}
    </ul>
    <p class="muted small">${t("people.help")}</p>
    <form class="add-row" id="add-member">
      <label for="new-person" class="visually-hidden">${t("field.name")}</label>
      <input id="new-person" name="name" placeholder="${t("field.name")}" maxlength="60" required />
      <button class="btn">${t("people.add")}</button>
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
            <div class="sheet-head"><h2>${t("people.editName", { name: m.name })}</h2><button type="button" class="btn ghost small" data-close>${t("action.cancel")}</button></div>
            <div class="field"><label for="m-name">${t("field.name")}</label><input id="m-name" name="name" value="${m.name}" maxlength="60" required /></div>
            <p class="error"></p>
            <div class="actions">
              <button class="btn primary">${t("action.save")}</button>
              ${m.isMe ? "" : html`<button type="button" class="btn danger" id="remove-member">${t("people.remove")}</button>`}
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
                if (!confirm(t("people.removeConfirm", { name: m.name }))) return;
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
      <h2>${t("settings.details")}</h2>
      <div class="field"><label for="gs-name">${t("field.name")}</label><input id="gs-name" name="name" value="${group.name}" maxlength="80" required /></div>
      <div class="grid2">
        <div class="field"><label for="gs-cur">${t("field.currency")}</label><select id="gs-cur" name="currency">${[...new Set([cur, ...CURRENCIES])].map((c) => html`<option ${c === cur ? raw("selected") : ""}>${c}</option>`)}</select></div>
        <div class="field"><label for="gs-desc">${t("field.description")}</label><input id="gs-desc" name="description" value="${group.description}" maxlength="300" /></div>
      </div>
      <p class="error"></p>
      <button class="btn primary">${t("action.save")}</button>
    </form>
    <div class="card">
      <h2>${t("settings.export")}</h2>
      <p class="muted small">${t("settings.exportHelp")}</p>
      <a class="btn" href="/api/groups/${group.id}/export.csv?lang=${getLanguage()}" download>${t("settings.downloadCsv")}</a>
    </div>
    <div class="card">
      <h2>${t("settings.leaveOrDelete")}</h2>
      <p class="muted small">${t("settings.leaveHelp")} ${group.isOwner ? t("settings.deleteHelp") : ""}</p>
      <div class="actions">
        <button class="btn danger" id="leave-group">${t("settings.leave")}</button>
        ${group.isOwner ? html`<button class="btn danger" id="delete-group">${t("settings.delete")}</button>` : ""}
      </div>
    </div>`;
}

function bindSettings({ group }, refresh) {
  const gForm = $("#group-form");
  gForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(`/groups/${group.id}`, { method: "PATCH", body: { name: gForm.name.value, currency: gForm.currency.value, description: gForm.description.value } });
      toast(t("toast.saved"));
      refresh();
    } catch (err) {
      formError(gForm, err);
    }
  };
  $("#leave-group").onclick = async () => {
    if (!confirm(t("settings.leaveConfirm"))) return;
    await api(`/groups/${group.id}/leave`, { method: "POST" });
    navigate("/");
  };
  const del = $("#delete-group");
  if (del)
    del.onclick = async () => {
      if (prompt(t("settings.deleteConfirm")) !== group.name) return;
      await api(`/groups/${group.id}`, { method: "DELETE" });
      toast(t("settings.deleted"));
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
  const label = (m) => (m.id === meId ? t("nameYou", { name: m.name }) : m.name);
  const heading = (kind) => t(`expense.${isEdit ? "edit" : "add"}${kind === "transfer" ? "Payment" : "Expense"}`);

  const dialog = openDialog(
    html`<form class="sheet" novalidate>
      <div class="sheet-head"><h2>${heading(state.kind)}</h2><button type="button" class="btn ghost small" data-close>${t("action.cancel")}</button></div>
      <div class="segmented" role="group" aria-label="${t("expense.type")}">
        <button type="button" data-kind="expense" aria-pressed="${state.kind === "expense"}">${t("expense.expense")}</button>
        <button type="button" data-kind="transfer" aria-pressed="${state.kind === "transfer"}">${t("expense.transfer")}</button>
      </div>
      <div class="field" id="title-field"><label for="x-title">${t("expense.what")}</label><input id="x-title" name="title" maxlength="100" value="${expense?.title ?? ""}" placeholder="${t("expense.whatPlaceholder")}" /></div>
      <div class="grid2">
        <div class="field"><label for="x-amount">${t("expense.amount", { currency: cur })}</label><input id="x-amount" name="amount" inputmode="decimal" value="${expense ? centsToInput(expense.amount) : ""}" placeholder="0.00" required /></div>
        <div class="field"><label for="x-date">${t("expense.date")}</label><input id="x-date" name="date" type="date" value="${expense?.date ?? today()}" required /></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="x-paid" id="paid-label">${t("expense.paidBy")}</label><select id="x-paid" name="paidBy">${members.map((m) => html`<option value="${m.id}" ${(expense?.paidBy ?? meId) === m.id ? raw("selected") : ""}>${label(m)}</option>`)}</select></div>
        <div class="field" id="category-field"><label for="x-cat">${t("expense.category")}</label><select id="x-cat" name="category">${[...new Set([...(expense?.category ? [expense.category] : []), ...CATEGORIES])].map((c) => html`<option value="${c}" ${c === (expense?.category ?? "") ? raw("selected") : ""}>${c ? categoryLabel(c) : t("expense.noCategory")}</option>`)}</select></div>
        <div class="field" id="to-field"><label for="x-to">${t("expense.to")}</label><select id="x-to" name="to">${members.map((m) => html`<option value="${m.id}" ${(expense?.kind === "transfer" ? expense.shares[0]?.memberId : firstOther) === m.id ? raw("selected") : ""}>${label(m)}</option>`)}</select></div>
      </div>
      <div id="split-section">
        <label>${t("expense.splitBetween")}</label>
        <div class="segmented" role="group" aria-label="${t("expense.splitMode")}">
          <button type="button" data-mode="equal" aria-pressed="${state.mode === "equal"}">${t("expense.equally")}</button>
          <button type="button" data-mode="shares" aria-pressed="${state.mode === "shares"}">${t("expense.byShares")}</button>
          <button type="button" data-mode="amounts" aria-pressed="${state.mode === "amounts"}">${t("expense.byAmount")}</button>
        </div>
        <div id="split-rows"></div>
        <p class="muted small" id="split-summary"></p>
      </div>
      <p class="error"></p>
      <div class="actions">
        <button class="btn primary" style="flex:1">${t(isEdit ? "action.save" : "action.add")}</button>
        ${isEdit ? html`<button type="button" class="btn danger" id="delete-expense">${t("action.delete")}</button>` : ""}
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
              ? html`<input class="weight" type="number" min="0" step="1" inputmode="numeric" data-weight="${m.id}" value="${w}" aria-label="${t("expense.sharesFor", { name: m.name })}" />`
              : html`<input class="weight" inputmode="decimal" data-weight="${m.id}" value="${w ? centsToInput(w) : ""}" placeholder="0.00" aria-label="${t("expense.amountFor", { name: m.name })}" />`;
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
      summary.textContent = t(left === 0 ? "expense.allAssigned" : left > 0 ? "expense.leftToAssign" : "expense.tooMuch", {
        amount: money(left === 0 ? amount : Math.abs(left), cur),
      });
      summary.className = `small ${left === 0 ? "muted" : "neg"}`;
    } else {
      summary.className = "muted small";
      summary.textContent = active ? t("expense.splitCount", { count: active }) : t("expense.pickOne");
    }
  }

  function applyKind() {
    const transfer = state.kind === "transfer";
    $$("[data-kind]", form).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === state.kind)));
    $("#split-section", form).hidden = transfer;
    $("#category-field", form).hidden = transfer;
    $("#to-field", form).hidden = !transfer;
    $("#title-field", form).hidden = transfer;
    $("#paid-label", form).textContent = t(transfer ? "expense.from" : "expense.paidBy");
    $(".sheet-head h2", dialog).textContent = heading(state.kind);
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
    if (!Number.isFinite(amount) || amount <= 0) return formError(form, new Error(t("expense.invalidAmount")));
    const transfer = state.kind === "transfer";
    if (!transfer && !form.title.value.trim()) return formError(form, new Error(t("expense.titleRequired")));
    if (transfer && form.to.value === form.paidBy.value) return formError(form, new Error(t("expense.samePerson")));
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
        toast(t(isEdit ? "toast.saved" : transfer ? "expense.paymentRecorded" : "expense.added"));
        onDone();
      } catch (err) {
        formError(form, err);
      }
    });
  };
  const del = $("#delete-expense", form);
  if (del)
    del.onclick = async () => {
      if (!confirm(t("expense.deleteConfirm", { title: expenseTitle(expense) }))) return;
      await api(`/groups/${group.id}/expenses/${expense.id}`, { method: "DELETE" });
      dialog.close();
      toast(t("toast.deleted"));
      onDone();
    };
}

// ---------- invite landing page ----------

async function renderInvite(token) {
  const invite = await api(`/invites/${token}`);
  if (invite.alreadyMember) return navigate(`/g/${invite.groupId}`, { replace: true });

  const heading = html`<p class="step-label">${invite.invitedBy ? t("invite.invitedBy", { name: invite.invitedBy }) : t("invite.invited")}</p>
    <h1>${invite.group.name}</h1>
    ${invite.group.description ? html`<p class="muted">${invite.group.description}</p>` : ""}`;

  if (invite.status !== "active") {
    render(
      app,
      html`<div class="card narrow">${heading}<p>${th("invite.dead")}</p>
        <a class="btn" href="/" data-link>${t("invite.home")}</a></div>`,
    );
    return;
  }

  if (!invite.signedIn) {
    render(app, html`<div class="card narrow">${heading}<div id="signin-card"></div></div>`);
    signInForm($("#signin-card"), { next: `/join/${token}`, title: t("signin.toJoin") });
    return;
  }

  const open = invite.openPeople;
  render(
    app,
    html`<div class="card narrow">${heading}
      <form id="join-form">
        ${open.length
          ? html`<fieldset>
              <legend>${t("invite.onList")}</legend>
              <ul class="list choose">
                ${open.map(
                  (p) => html`<li><label class="row"><input type="radio" name="who" value="${p.id}" ${p.id === invite.suggestedMemberId ? raw("checked") : ""} /> <span class="grow">${t("invite.iAm", { name: p.name })}</span></label></li>`,
                )}
                <li><label class="row"><input type="radio" name="who" value="" ${invite.suggestedMemberId ? "" : raw("checked")} /> <span class="grow">${t("invite.notOnList")}</span></label></li>
              </ul>
            </fieldset>`
          : html`<input type="hidden" name="who" value="" />`}
        <div class="field" id="name-field"><label for="new-name">${t("invite.nameInGroup")}</label><input id="new-name" name="newName" value="${me.name}" maxlength="60" /></div>
        <p class="error"></p>
        <button class="btn primary block">${t("invite.join")}</button>
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
        toast(t("invite.joined"));
        navigate(`/g/${id}`, { replace: true });
      } catch (err) {
        formError(form, err);
      }
    });
  };
}

// ---------- admin ----------

const ADMIN_TABS = [
  ["/admin", "admin.overview"],
  ["/admin/users", "admin.users"],
  ["/admin/groups", "admin.groups"],
  ["/admin/signins", "admin.signins"],
  ["/admin/audit", "admin.audit"],
];
const actionLabel = (action) => (hasTranslation(`audit.${action}`) ? t(`audit.${action}`) : action);
const STATUS_PILL = { verified: "ok", used: "ok", sent: "ok", active: "warn", pending: "warn", failed: "bad", locked: "bad" };
const pill = (status) =>
  html`<span class="pill ${STATUS_PILL[status] ?? ""}">${status ? (hasTranslation(`status.${status}`) ? t(`status.${status}`) : status) : "—"}</span>`;

function adminShell(current, body) {
  render(
    app,
    html`<div class="admin">
      <h1>${t("admin.title")}</h1>
      <nav class="tabs" aria-label="${t("admin.sections")}">
        ${ADMIN_TABS.map(([href, key]) => html`<a href="${href}" data-link aria-current="${current === href ? "page" : "false"}">${t(key)}</a>`)}
      </nav>
      ${body}
    </div>`,
  );
}

function auditTable(entries, { showGroup = true } = {}) {
  if (!entries.length) return html`<p class="muted">${t("admin.noEntries")}</p>`;
  return html`<div class="table-wrap"><table>
    <thead><tr><th>${t("admin.time")}</th><th>${t("admin.action")}</th><th>${t("admin.by")}</th>${showGroup ? html`<th>${t("admin.group")}</th>` : ""}<th>${t("admin.details")}</th></tr></thead>
    <tbody>
      ${entries.map((a) => {
        const details = JSON.parse(a.details || "{}");
        return html`<tr>
          <td class="nowrap">${formatTime(a.at)}</td>
          <td><span title="${a.action}">${actionLabel(a.action)}</span></td>
          <td>${a.actor_id ? html`<a href="/admin/users/${a.actor_id}" data-link>${a.actor_email}</a>` : html`<span class="muted">${details.email ?? "—"}</span>`}</td>
          ${showGroup ? html`<td>${a.group_id ? html`<a href="/admin/groups/${a.group_id}" data-link>${a.group_name ?? t("admin.deleted")}</a>` : "—"}</td>` : ""}
          <td class="details"><code>${Object.keys(details).length ? JSON.stringify(details) : ""}</code>${a.ip ? html`<span class="muted small"> · ${a.ip}</span>` : ""}</td>
        </tr>`;
      })}
    </tbody></table></div>`;
}

function signInsTable(rows, { showEmail = true } = {}) {
  if (!rows.length) return html`<p class="muted">${t("admin.noSignins")}</p>`;
  return html`<div class="table-wrap"><table>
    <thead><tr><th>${t("admin.requested")}</th>${showEmail ? html`<th>${t("admin.email")}</th>` : ""}<th>${t("admin.verification")}</th><th>${t("admin.delivery")}</th><th>${t("admin.wrongCodes")}</th><th>${t("admin.wentTo")}</th></tr></thead>
    <tbody>
      ${rows.map(
        (r) => html`<tr>
          <td class="nowrap">${formatTime(r.created_at)}</td>
          ${showEmail ? html`<td>${r.user_id ? html`<a href="/admin/users/${r.user_id}" data-link>${r.email}</a>` : r.email}${r.registered ? html` <span class="pill ok">${t("admin.newAccount")}</span>` : ""}</td>` : ""}
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
        ${tile(t("admin.users"), o.users, t("admin.usersSub", { new: o.users_7d, active: o.active_7d }))}
        ${tile(t("admin.groups"), o.groups, t("admin.expensesCount", { count: o.expenses }))}
        ${tile(t("admin.peopleInGroups"), o.people, t("admin.withAccount", { count: o.joined_people }))}
        ${tile(t("admin.linkJoins"), o.link_joins, t("admin.activeLinks", { count: o.open_invites }))}
        ${tile(t("admin.signins24h"), o.signins_24h, t("admin.verifiedCount", { count: o.signins_verified_24h }))}
        ${tile(t("admin.emails24h"), o.emails_24h, html`<span class="${o.emails_failed_24h ? "neg" : ""}">${t("admin.failedCount", { count: o.emails_failed_24h })}</span>`)}
      </div>`,
    );
  }
  if (path === "/admin/users") {
    const users = await api(`/admin/users`);
    return adminShell(
      path,
      html`<div class="table-wrap"><table>
        <thead><tr><th>${t("admin.email")}</th><th>${t("admin.name")}</th><th>${t("admin.registered")}</th><th>${t("admin.lastSignin")}</th><th>${t("admin.groups")}</th><th>${t("admin.sessions")}</th></tr></thead>
        <tbody>${users.map(
          (u) => html`<tr><td><a href="/admin/users/${u.id}" data-link>${u.email}</a></td><td>${u.name || html`<span class="muted">—</span>`}</td>
            <td class="nowrap">${formatTime(u.created_at)}</td><td class="nowrap">${formatTime(u.last_login_at)}</td>
            <td>${u.groups}${u.owned_groups ? html` <span class="muted small">${t("admin.owned", { count: u.owned_groups })}</span>` : ""}</td><td>${u.sessions}</td></tr>`,
        )}</tbody></table></div>`,
    );
  }
  if ((m = /^\/admin\/users\/([\w-]+)$/.exec(path))) {
    const d = await api(`/admin/users/${m[1]}`);
    return adminShell(
      "/admin/users",
      html`<h2>${d.user.email}</h2>
        <p class="muted">${t("admin.userMeta", { name: d.user.name || t("admin.noName"), registered: formatTime(d.user.created_at), lastSignin: formatTime(d.user.last_login_at) })}</p>
        <h3>${t("admin.groups")}</h3>
        ${d.groups.length
          ? html`<div class="table-wrap"><table><thead><tr><th>${t("admin.group")}</th><th>${t("admin.as")}</th><th>${t("admin.role")}</th><th>${t("admin.created")}</th></tr></thead><tbody>
              ${d.groups.map((g) => html`<tr><td><a href="/admin/groups/${g.id}" data-link>${g.name}</a></td><td>${g.member_name}</td><td>${t(g.is_owner ? "admin.owner" : "admin.member")}</td><td class="nowrap">${formatTime(g.created_at)}</td></tr>`)}
            </tbody></table></div>`
          : html`<p class="muted">${t("admin.noGroups")}</p>`}
        <h3>${t("admin.signinsTitle")}</h3>${signInsTable(d.signins, { showEmail: false })}
        <h3>${t("admin.activity")}</h3>${auditTable(d.audit)}`,
    );
  }
  if (path === "/admin/groups") {
    const groups = await api(`/admin/groups`);
    return adminShell(
      path,
      html`<div class="table-wrap"><table>
        <thead><tr><th>${t("admin.group")}</th><th>${t("admin.owner")}</th><th>${t("admin.people")}</th><th>${t("admin.expenses")}</th><th>${t("admin.total")}</th><th>${t("admin.openInvites")}</th><th>${t("admin.created")}</th></tr></thead>
        <tbody>${groups.map(
          (g) => html`<tr><td><a href="/admin/groups/${g.id}" data-link>${g.name}</a></td><td>${g.owner_email ?? "—"}</td>
            <td>${t("admin.joinedOf", { joined: g.joined, people: g.people })}</td><td>${g.expenses}</td><td class="nowrap">${money(g.total, g.currency)}</td><td>${g.open_invites}</td><td class="nowrap">${formatTime(g.created_at)}</td></tr>`,
        )}</tbody></table></div>`,
    );
  }
  if ((m = /^\/admin\/groups\/([\w-]+)$/.exec(path))) {
    const d = await api(`/admin/groups/${m[1]}`);
    const g = d.group;
    return adminShell(
      "/admin/groups",
      html`<h2>${g.name}</h2>
        <p class="muted">${g.currency} · ${t("admin.createdBy", { time: formatTime(g.created_at) })} ${g.owner_id ? html`<a href="/admin/users/${g.owner_id}" data-link>${g.owner_email}</a>` : "—"}</p>
        <h3>${t("admin.people")}</h3>
        <div class="table-wrap"><table><thead><tr><th>${t("admin.name")}</th><th>${t("admin.account")}</th><th>${t("admin.lastSignin")}</th><th>${t("admin.balance")}</th><th>${t("admin.added")}</th></tr></thead><tbody>
          ${d.people.map(
            (p) => html`<tr><td>${p.name}</td><td>${p.user_id ? html`<a href="/admin/users/${p.user_id}" data-link>${p.email}</a>` : html`<span class="pill">${t("admin.notJoined")}</span>`}</td>
              <td class="nowrap">${formatTime(p.last_login_at)}</td><td class="nowrap">${money(p.balance, g.currency)}</td><td class="nowrap">${formatTime(p.created_at)}</td></tr>`,
          )}
        </tbody></table></div>
        <h3>${t("admin.invites")}</h3>
        ${d.invites.length
          ? html`<div class="table-wrap"><table><thead><tr><th>${t("admin.link")}</th><th>${t("admin.status")}</th><th>${t("admin.joins")}</th><th>${t("admin.created")}</th><th>${t("admin.by")}</th><th>${t("admin.lastUsed")}</th></tr></thead><tbody>
              ${d.invites.map(
                (i) => html`<tr><td>${i.multi_use ? t("link.groupLink") : i.label ? t("admin.personalLabel", { label: i.label }) : t("admin.personal")}</td><td>${pill(i.status)}</td><td>${i.use_count}</td><td class="nowrap">${formatTime(i.created_at)}</td>
                  <td>${i.created_by_email ?? "—"}</td><td>${i.used_by_email ? html`${i.used_by_email} <span class="muted small">${formatTime(i.used_at)}</span>` : formatTime(i.last_used_at)}</td></tr>`,
              )}
            </tbody></table></div>`
          : html`<p class="muted">${t("admin.noInvites")}</p>`}
        <h3>${t("admin.activity")}</h3>${auditTable(d.audit, { showGroup: false })}`,
    );
  }
  if (path === "/admin/signins") {
    const rows = await api(`/admin/signins`);
    return adminShell(path, html`<p class="muted small">${t("admin.signinsHelp")}</p>${signInsTable(rows)}`);
  }
  if (path === "/admin/audit") {
    const params = new URLSearchParams(location.search);
    const filters = { action: params.get("action") ?? "", actor: params.get("actor") ?? "" };
    const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    const first = await api(`/admin/audit?${query}`);
    adminShell(
      path,
      html`<form class="filters" id="audit-filters">
          <label>${t("admin.action")} <select name="action"><option value="">${t("admin.all")}</option>
            ${["auth", "user", "group", "member", "invite", "expense"].map((p) => html`<option value="${p}." ${filters.action === `${p}.` ? raw("selected") : ""}>${p}</option>`)}
          </select></label>
          <label>${t("admin.user")} <input name="actor" value="${filters.actor}" placeholder="${t("admin.userPlaceholder")}" /></label>
          <button class="btn small">${t("admin.filter")}</button>
        </form>
        <div id="audit-rows">${auditTable(first.entries)}</div>
        <div class="actions center">${first.next ? html`<button class="btn" id="more">${t("admin.loadMore")}</button>` : ""}</div>`,
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
  showError(Object.assign(new Error(t("error.noPage")), { status: 404 }));
}

// ---------- router ----------

function showError(err) {
  // Admin pages sit behind Cloudflare Access. Without an Access session the API call is
  // redirected to the Access login (a network error for fetch); a full page load signs in.
  if (location.pathname.startsWith("/admin") && (err instanceof TypeError || err.status === 403)) {
    render(
      app,
      html`<div class="card narrow center"><h2>${t("admin.confirmTitle")}</h2><p class="muted">${t("admin.confirmHelp")}</p>
        <button class="btn primary" id="access-login">${t("action.continue")}</button></div>`,
    );
    $("#access-login").onclick = () => location.assign(location.pathname + location.search);
    return;
  }
  if (err.status === 401) {
    me = null;
    renderAccount();
    return renderHomeSignedOut();
  }
  render(app, html`<div class="card empty"><h2>${t(err.status === 404 ? "error.notFound" : "error.generic")}</h2><p>${err.message}</p><a class="btn" href="/" data-link>${t("nav.toGroups")}</a></div>`);
}

/** `refresh` re-renders the current page in place (e.g. after switching language). */
async function route({ refresh = false } = {}) {
  const path = location.pathname;
  if (!refresh) {
    window.scrollTo(0, 0);
    render(app, html`<div class="spinner" aria-label="${t("loading")}"></div>`);
  }
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
    showError(Object.assign(new Error(t("error.noPage")), { status: 404 }));
  } catch (err) {
    showError(err);
  }
}

(async () => {
  document.documentElement.lang = getLanguage();
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
