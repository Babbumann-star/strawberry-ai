
const API_URL =
  window.BACKEND_URL ||
  "https://strawberry-ai.onrender.com/chat";

let conversation = [];

let generation = null;

let generationId = 0;

const input =
  document.getElementById("input");

const sendBtn =
  document.getElementById("sendBtn");

const messages =
  document.getElementById("messages");

const chat =
  document.getElementById("chat");

const history =
  document.getElementById("history");

const sidebar =
  document.getElementById("sidebar");

const themeButton =
  document.getElementById("themeButton");

const themeIcon =
  document.getElementById("themeIcon");

const drawerBackdrop =
  document.getElementById("drawerBackdrop");

const drawerClose =
  document.getElementById("drawerClose");

const mobileMenuButton =
  document.getElementById("mobileMenuButton");

/*
  Captured while still in the DOM so the welcome
  screen can be rebuilt without duplicating markup.
*/

const welcomeTemplate =
  document.getElementById("welcome")
    .cloneNode(true);


function toggleTheme() {

  document.body.classList.toggle("light");

  const isLight =
    document.body.classList.contains("light");

  themeButton.innerHTML =
    isLight ? "☀️ Light mode" : "🌙 Dark mode";

  themeIcon.innerHTML =
    isLight ? "☀️" : "🌙";

  localStorage.setItem(
    "novaTheme",
    isLight ? "light" : "dark"
  );

}


function loadTheme() {

  if (
    localStorage.getItem("novaTheme") === "light"
  ) {

    document.body.classList.add("light");

    themeButton.innerHTML = "☀️ Light mode";

    themeIcon.innerHTML = "☀️";

  }

}


loadTheme();


function resizeInput() {

  input.style.height = "auto";

  input.style.height =
    Math.min(
      input.scrollHeight,
      150
    ) + "px";

  if (!isGenerating()) {
    sendBtn.disabled = !input.value.trim();
  }

}


input.addEventListener("input", resizeInput);


input.addEventListener(
  "keydown",
  (event) => {

    if (event.key === "Enter" && !event.shiftKey) {

      event.preventDefault();

      if (!isGenerating()) {
        document.getElementById("chatForm").requestSubmit();
      }

    }

  }
);


function useSuggestion(text) {

  input.value = text;

  resizeInput();

  input.focus();

}


function scrollToBottom() {

  requestAnimationFrame(() => {
    chat.scrollTop = chat.scrollHeight;
  });

}


/* ================= MESSAGES ================= */

function addMessage(text, type) {

  const message =
    document.createElement("div");

  message.className =
    type === "user"
      ? "message user-message"
      : "message";

  const avatar =
    document.createElement("div");

  avatar.className =
    type === "user"
      ? "avatar user-avatar"
      : "avatar ai-avatar";

  avatar.textContent =
    type === "user" ? "Y" : "✦";

  const bubble =
    document.createElement("div");

  bubble.className =
    type === "user"
      ? "bubble user-bubble"
      : "bubble";

  if (type === "ai") {

    renderMarkdown(bubble, text);

  } else {

    bubble.textContent = text;

  }

  message.appendChild(avatar);

  message.appendChild(bubble);

  messages.appendChild(message);

  scrollToBottom();

}


function showTyping() {

  removeTyping();

  const message =
    document.createElement("div");

  message.className = "message";

  message.id = "typingMessage";

  message.innerHTML =
    '<div class="avatar ai-avatar">✦</div>' +
    '<div class="bubble"><div class="typing">' +
    '<span></span><span></span><span></span>' +
    '</div></div>';

  messages.appendChild(message);

  scrollToBottom();

  return message;

}


function removeTyping() {

  const typing =
    document.getElementById("typingMessage");

  if (typing) typing.remove();

}


/* ================= GENERATION ================= */

function isGenerating() {

  return Boolean(
    generation && generation.active
  );

}


function setGeneratingState(active) {

  if (active) {

    sendBtn.classList.add("stop-btn");

    sendBtn.textContent = "■";

    sendBtn.title = "Stop generating";

    sendBtn.setAttribute(
      "aria-label",
      "Stop generating"
    );

    sendBtn.disabled = false;

  } else {

    sendBtn.classList.remove("stop-btn");

    sendBtn.textContent = "↑";

    sendBtn.title = "Send message";

    sendBtn.setAttribute(
      "aria-label",
      "Send message"
    );

    sendBtn.disabled = !input.value.trim();

  }

}


function finishGeneration(id) {

  if (!generation || generation.id !== id) {
    return;
  }

  generation.active = false;

  generation = null;

  setGeneratingState(false);

}


function stopGeneration(options = {}) {

  const current = generation;

  if (!current) {

    if (!options.silent) {
      setGeneratingState(false);
    }

    return;

  }

  current.active = false;

  /*
    Roll back here rather than in the abort
    handler. The rejection arrives on a later
    tick, by which point a new generation may
    already have pushed its own turn, and
    truncating then would delete that message.
  */

  if (current.pendingUser) {

    conversation.length =
      current.rollbackIndex;

    current.pendingUser = false;

  }

  if (current.timer !== null) {

    clearTimeout(current.timer);

    current.timer = null;

  }

  if (current.controller) {

    current.controller.abort();

  }

  if (current.typing && current.typing.isConnected) {

    current.typing.remove();

  }

  if (generation && generation.id === current.id) {

    generation = null;

  }

  setGeneratingState(false);

}


async function startGeneration(question) {

  stopGeneration({ silent: true });

  const id = ++generationId;

  const controller = new AbortController();

  const state = {

    id,

    active: true,

    controller,

    timer: null,

    typing: showTyping(),

    /*
      Snapshot taken before the user turn is
      appended, so a cancelled or failed request
      can be rolled back instead of leaving an
      unanswered user message in memory.
    */

    rollbackIndex: conversation.length,

    pendingUser: false

  };

  generation = state;

  setGeneratingState(true);

  conversation.push({
    role: "user",
    content: question
  });

  state.pendingUser = true;

  try {

    const response = await fetch(API_URL, {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        messages: conversation
      }),

      signal: controller.signal

    });

    const data = await response.json();

    if (!response.ok) {

      throw new Error(
        data.error || "Server request failed"
      );

    }

    if (!generation || generation.id !== id) {
      return;
    }

    state.typing.remove();

    conversation.push({
      role: "assistant",
      content: data.reply
    });

    state.pendingUser = false;

    addMessage(data.reply, "ai");

    finishGeneration(id);

  } catch (error) {

    const cancelled =
      error.name === "AbortError";

    /*
      A cancelled or failed request must not
      leave its user turn behind. Only the
      generation that still owns the slot may
      truncate, otherwise a late rejection from
      a superseded request would erase the
      message the user just sent.
    */

    if (
      state.pendingUser &&
      generation &&
      generation.id === id
    ) {

      conversation.length =
        state.rollbackIndex;

      state.pendingUser = false;

    }

    if (!generation || generation.id !== id) {
      return;
    }

    state.typing.remove();

    if (cancelled) {

      finishGeneration(id);

      return;

    }

    addMessage(
      "Error: " + error.message,
      "ai"
    );

    console.error(error);

    finishGeneration(id);

  }

}


/* ================= SEND ================= */

function sendMessage() {

  const text = input.value.trim();

  if (!text) return;

  const welcome =
    document.getElementById("welcome");

  if (welcome) welcome.remove();

  addMessage(text, "user");

  input.value = "";

  resizeInput();

  addHistory(text);

  startGeneration(text);

}


document
  .getElementById("chatForm")
  .addEventListener(
    "submit",
    (event) => {

      event.preventDefault();

      if (isGenerating()) {

        stopGeneration();

      } else {

        sendMessage();

      }

    }
  );


function addHistory(text) {

  const item =
    document.createElement("button");

  item.type = "button";

  item.textContent = text;

  item.addEventListener(
    "click",
    () => {

      closeSidebar();

      input.value = text;

      resizeInput();

      input.focus();

    }
  );

  history.prepend(item);

}


function newChat() {

  stopGeneration({ silent: true });

  closeSidebar();

  conversation = [];

  messages.replaceChildren(
    welcomeTemplate.cloneNode(true)
  );

  input.value = "";

  resizeInput();

  chat.scrollTop = 0;

}


/* ================= DRAWER ================= */

function openSidebar() {

  if (window.innerWidth > 750) return;

  sidebar.classList.add("open");

  drawerBackdrop.classList.add("visible");

  document.body.classList.add("drawer-open");

  drawerBackdrop.setAttribute("aria-hidden", "false");

  mobileMenuButton.setAttribute("aria-expanded", "true");

}


function closeSidebar() {

  sidebar.classList.remove("open");

  drawerBackdrop.classList.remove("visible");

  document.body.classList.remove("drawer-open");

  drawerBackdrop.setAttribute("aria-hidden", "true");

  mobileMenuButton.setAttribute("aria-expanded", "false");

}


function toggleSidebar() {

  if (sidebar.classList.contains("open")) {

    closeSidebar();

  } else {

    openSidebar();

  }

}


mobileMenuButton.addEventListener(
  "click",
  toggleSidebar
);

drawerClose.addEventListener(
  "click",
  closeSidebar
);

drawerBackdrop.addEventListener(
  "click",
  closeSidebar
);

document.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key === "Escape" &&
      sidebar.classList.contains("open")
    ) {

      closeSidebar();

    }

  }
);

window.addEventListener(
  "resize",
  () => {

    if (window.innerWidth > 750) {

      closeSidebar();

    }

  }
);


window.addEventListener(
  "beforeunload",
  () => stopGeneration({ silent: true })
);
