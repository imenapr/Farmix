import { boot } from "../app/boot.js";
import { initAppState, getCurrentUser } from "../app/auth-state.js";
import { escapeHtml, renderStateBlock, toast } from "../app/ui.js";
import {
  listConversations,
  getConversation,
  sendMessage,
  markConversationRead,
} from "../services/messages.service.js";
import { t, onLanguageChange, translatePageHead } from "../app/i18n.js";

boot();
translatePageHead("messages.pageTitle", "messages.pageSubtitle");

const root = document.getElementById("messages-root");
if (!root) throw new Error("Missing #messages-root");

await initAppState();

const user = getCurrentUser();
if (!user) {
  root.innerHTML = renderStateBlock({
    title: t("common.loginRequired"),
    description: t("messages.loginRequiredDesc"),
    actionsHtml: `<a class="btn btn-primary" href="/pages/login.html?next=/pages/messages.html">${t("common.login")}</a>`,
  });
  throw new Error("User not authenticated");
}

let conversations = [];
let activeKey = null;

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("common.justNow");
  if (m < 60) return t("common.minutesAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("common.hoursAgo", { n: h });
  return t("common.daysAgo", { n: Math.floor(h / 24) });
}

function shell() {
  root.innerHTML = `
    <div class="msg-layout card">
      <aside class="msg-sidebar" id="msg-sidebar">
        <div class="msg-sidebar-head">${t("messages.conversations")}</div>
        <div class="msg-convo-list" id="msg-convo-list">
          <div class="msg-empty">${t("common.loading")}</div>
        </div>
      </aside>
      <section class="msg-chat" id="msg-chat">
        <div class="msg-chat-empty" id="msg-chat-empty">
          <p>${t("messages.selectConversation")}</p>
        </div>
      </section>
    </div>
  `;
}

function renderConvoList() {
  const list = document.getElementById("msg-convo-list");
  if (!list) return;

  if (!conversations.length) {
    list.innerHTML = `<div class="msg-empty">${t("messages.none")}</div>`;
    return;
  }

  list.innerHTML = conversations
    .map((c) => `
      <button type="button" class="msg-convo-item${c.key === activeKey ? " is-active" : ""}" data-key="${escapeHtml(c.key)}">
        <div class="msg-convo-top">
          <span class="msg-convo-name">${escapeHtml(c.otherUserName || t("common.unknown"))}</span>
          ${c.unread > 0 ? `<span class="msg-convo-unread">${c.unread > 9 ? "9+" : c.unread}</span>` : ""}
        </div>
        ${c.listingTitle ? `<div class="msg-convo-listing">${escapeHtml(c.listingTitle)}</div>` : ""}
        <div class="msg-convo-preview">${escapeHtml(c.lastMessage || "")}</div>
        <div class="msg-convo-time">${timeAgo(c.lastAt)}</div>
      </button>
    `)
    .join("");

  list.querySelectorAll("[data-key]").forEach((btn) => {
    btn.addEventListener("click", () => openConversation(btn.dataset.key));
  });
}

function renderThread(convo, messages) {
  const chat = document.getElementById("msg-chat");
  if (!chat) return;

  const bubbles = messages
    .map((m) => {
      const mine = m.senderId === user.id;
      return `
        <div class="msg-bubble-row ${mine ? "mine" : "theirs"}">
          <div class="msg-bubble">
            <div class="msg-bubble-text">${escapeHtml(m.content || "")}</div>
            <div class="msg-bubble-time">${timeAgo(m.createdAt)}</div>
          </div>
        </div>
      `;
    })
    .join("");

  chat.innerHTML = `
    <header class="msg-chat-head">
      <div>
        <div class="msg-chat-name">${escapeHtml(convo.otherUserName || t("common.unknown"))}</div>
        ${convo.listingTitle ? `<div class="msg-chat-sub">${t("messages.re")} ${escapeHtml(convo.listingTitle)}</div>` : ""}
      </div>
      ${convo.listingId ? `<a class="btn btn-ghost btn-sm" href="/pages/product.html?id=${escapeHtml(convo.listingId)}">${t("messages.viewListing")}</a>` : ""}
    </header>
    <div class="msg-thread" id="msg-thread">
      ${bubbles || `<div class="msg-empty">${t("messages.noMessages")}</div>`}
    </div>
    <form class="msg-composer" id="msg-composer">
      <input class="input" id="msg-input" name="body" placeholder="${t("messages.typeMessage")}" autocomplete="off" required />
      <button class="btn btn-primary" type="submit" data-send>${t("messages.send")}</button>
    </form>
  `;

  const thread = document.getElementById("msg-thread");
  if (thread) thread.scrollTop = thread.scrollHeight;

  const form = document.getElementById("msg-composer");
  const input = document.getElementById("msg-input");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;

    const sendBtn = form.querySelector("[data-send]");
    sendBtn.disabled = true;

    const res = await sendMessage(user.id, convo.otherUserId, convo.listingId, body);
    if (!res.ok) {
      sendBtn.disabled = false;
      toast("error", res.error?.message ?? t("messages.sendFailed"));
      return;
    }

    input.value = "";
    sendBtn.disabled = false;
    await openConversation(convo.key, { silent: true });
    await refreshConversations();
  });
}

async function openConversation(key, { silent = false } = {}) {
  const convo = conversations.find((c) => c.key === key);
  if (!convo) return;
  activeKey = key;

  if (!silent) {
    const chat = document.getElementById("msg-chat");
    if (chat) chat.innerHTML = `<div class="msg-chat-empty"><p>${t("common.loading")}</p></div>`;
  }

  const res = await getConversation(user.id, convo.otherUserId, convo.listingId);
  if (!res.ok) {
    toast("error", res.error?.message ?? t("messages.loadFailed"));
    return;
  }

  renderThread(convo, res.data);
  renderConvoList();

  if (convo.unread > 0) {
    await markConversationRead(user.id, convo.otherUserId, convo.listingId);
    convo.unread = 0;
    renderConvoList();
  }
}

async function refreshConversations() {
  const res = await listConversations(user.id);
  if (!res.ok) {
    const list = document.getElementById("msg-convo-list");
    if (list) list.innerHTML = `<div class="msg-empty">${t("messages.loadConversationsFailed")}</div>`;
    return;
  }
  conversations = res.data;
  renderConvoList();
}

async function init() {
  shell();
  await refreshConversations();

  // Deep-link: ?user=<id>&listing=<id> opens (or focuses) a conversation.
  const params = new URLSearchParams(location.search);
  const targetUser = params.get("user");
  const targetListing = params.get("listing");
  if (targetUser) {
    const match = conversations.find(
      (c) => c.otherUserId === targetUser && (c.listingId ?? null) === (targetListing ?? null)
    );
    if (match) {
      await openConversation(match.key);
      return;
    }
  }

  if (conversations.length) await openConversation(conversations[0].key);
}

init();
onLanguageChange(async () => {
  translatePageHead("messages.pageTitle", "messages.pageSubtitle");
  const key = activeKey;
  shell();
  await refreshConversations();
  if (key) {
    const match = conversations.find((c) => c.key === key);
    if (match) await openConversation(match.key, { silent: true });
  }
});
