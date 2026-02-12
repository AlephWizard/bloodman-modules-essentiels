const MODULE_ID = "bloodman-jet-destin";
const MODULE_SOCKET = `module.${MODULE_ID}`;
const MODULE_FLAG_KEY = MODULE_ID;
const REQUEST_CHAT_MARKUP = "<span style='display:none'>bloodman-jet-destin-request</span>";
const REQUEST_RETENTION_MS = 2 * 60 * 1000;
const OVERLAY_ID = "bjd-voyance-overlay";
const STYLE_ID = "bjd-voyance-style";
const DEFAULT_AUTO_CLOSE_MS = 6500;
const DEFAULT_ANSWER_DELAY_MS = 240;
const DEFAULT_BACKGROUND_SRC = "modules/bloodman-jet-destin/images/des_destin.png";

const PROCESSED_REQUESTS = new Map();

function t(key, fallback, data = null) {
  const localized = data
    ? game?.i18n?.format?.(key, data)
    : game?.i18n?.localize?.(key);
  if (localized && localized !== key) return localized;
  return fallback;
}

function rememberRequest(requestId) {
  const id = String(requestId || "").trim();
  if (!id) return;
  const now = Date.now();
  PROCESSED_REQUESTS.set(id, now);
  for (const [key, value] of PROCESSED_REQUESTS.entries()) {
    if (now - value > REQUEST_RETENTION_MS) PROCESSED_REQUESTS.delete(key);
  }
}

function wasRequestProcessed(requestId) {
  const id = String(requestId || "").trim();
  if (!id) return false;
  return PROCESSED_REQUESTS.has(id);
}

function normalizeVoyanceAnswer(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "oui" ? "oui" : "non";
}

function normalizeDelay(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.floor(numeric);
}

async function canDisplayImageSource(src) {
  const candidate = String(src || "").trim();
  if (!candidate) return false;
  return new Promise(resolve => {
    const img = new Image();
    const done = ok => {
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = candidate;
  });
}

function clearVoyanceOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

function ensureVoyanceOverlayStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${OVERLAY_ID} {
      position: fixed;
      inset: 0;
      z-index: 15000;
      display: grid;
      place-items: center;
    }
    #${OVERLAY_ID} .bjd-backdrop {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at center, rgba(10, 8, 12, 0.45), rgba(0, 0, 0, 0.82));
      backdrop-filter: blur(2px);
    }
    #${OVERLAY_ID} .bjd-panel {
      position: relative;
      width: min(72vh, 52vw, 640px);
      max-width: 90vw;
      animation: bjdFadeUp 320ms ease-out;
    }
    #${OVERLAY_ID} .bjd-bg,
    #${OVERLAY_ID} .bjd-bg-fallback {
      width: 100%;
      height: auto;
      display: block;
      user-select: none;
      filter: drop-shadow(0 18px 28px rgba(0, 0, 0, 0.55));
    }
    #${OVERLAY_ID} .bjd-bg-fallback {
      aspect-ratio: 1 / 1;
      border-radius: 20px;
      background:
        radial-gradient(circle at 40% 35%, rgba(255, 247, 189, 0.34), rgba(64, 20, 80, 0.66)),
        radial-gradient(circle at 72% 72%, rgba(87, 158, 255, 0.28), rgba(24, 8, 34, 0.88));
    }
    #${OVERLAY_ID} .bjd-crystal {
      position: absolute;
      left: 50%;
      top: 49.1%;
      width: 17.8%;
      aspect-ratio: 1;
      transform: translate(-50%, -50%);
      display: grid;
      place-items: center;
      pointer-events: none;
    }
    #${OVERLAY_ID} .bjd-answer-text {
      position: relative;
      display: block;
      --bjd-oracle-x: 0px;
      color: #1a1423;
      font-family: "Cinzel Decorative", "Georgia", serif;
      font-size: clamp(28px, 4.1vw, 50px);
      font-weight: 700;
      letter-spacing: 0.06em;
      line-height: 0.88;
      text-align: center;
      text-transform: uppercase;
      text-shadow:
        0 0 6px rgba(255, 255, 255, 0.95),
        0 0 14px rgba(255, 228, 150, 0.9),
        0 0 24px rgba(151, 224, 255, 0.6);
      filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4));
      animation: bjdBounceIn 760ms cubic-bezier(.2,.8,.2,1) both, bjdOracleFloat 2.5s ease-in-out 820ms infinite;
    }
    #${OVERLAY_ID} .bjd-answer-text.is-oui {
      --bjd-oracle-x: -1px;
    }
    #${OVERLAY_ID} .bjd-answer-text.is-non {
      --bjd-oracle-x: -5px;
    }
    @keyframes bjdFadeUp {
      from { opacity: 0; transform: translateY(12px) scale(0.99); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes bjdBounceIn {
      0% { transform: translateX(var(--bjd-oracle-x, 0px)) scale(0.2); opacity: 0; }
      45% { transform: translateX(var(--bjd-oracle-x, 0px)) scale(1.18); opacity: 1; }
      72% { transform: translateX(var(--bjd-oracle-x, 0px)) scale(0.88); }
      100% { transform: translateX(var(--bjd-oracle-x, 0px)) scale(1); opacity: 1; }
    }
    @keyframes bjdOracleFloat {
      0%, 100% { transform: translateX(var(--bjd-oracle-x, 0px)) translateY(0) scale(1); }
      50% { transform: translateX(var(--bjd-oracle-x, 0px)) translateY(-2px) scale(1.01); }
    }
  `;
  document.head.appendChild(style);
}

async function showVoyanceOverlay(payload = {}) {
  const backgroundSrc = String(payload.backgroundSrc || DEFAULT_BACKGROUND_SRC).trim();
  const hasBackground = backgroundSrc ? await canDisplayImageSource(backgroundSrc) : false;

  clearVoyanceOverlay();
  ensureVoyanceOverlayStyles();

  const answer = normalizeVoyanceAnswer(payload.answer);
  const answerUpper = answer === "oui" ? "OUI" : "NON";

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div class="bjd-backdrop"></div>
    <div class="bjd-panel">
      ${hasBackground
        ? `<img class="bjd-bg" src="${backgroundSrc}" alt="Automate de voyance" />`
        : `<div class="bjd-bg-fallback" aria-hidden="true"></div>`
      }
      <div class="bjd-crystal" aria-live="polite"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const answerDelayMs = normalizeDelay(payload.answerDelayMs, DEFAULT_ANSWER_DELAY_MS);
  await new Promise(resolve => setTimeout(resolve, answerDelayMs));

  const crystal = overlay.querySelector(".bjd-crystal");
  if (!crystal) {
    clearVoyanceOverlay();
    return false;
  }

  const text = document.createElement("div");
  text.className = `bjd-answer-text ${answer === "non" ? "is-non" : "is-oui"}`;
  text.textContent = answerUpper;
  crystal.appendChild(text);

  const close = () => clearVoyanceOverlay();
  overlay.addEventListener("click", close, { once: true });
  const autoCloseMs = normalizeDelay(payload.autoCloseMs, DEFAULT_AUTO_CLOSE_MS);
  setTimeout(close, autoCloseMs);
  return true;
}

async function handleVoyanceOverlayRequest(data, source = "socket") {
  const requestId = String(data?.requestId || "").trim();
  if (requestId && wasRequestProcessed(requestId)) return false;
  if (requestId) rememberRequest(requestId);

  const payload = {
    answer: data?.answer,
    backgroundSrc: data?.backgroundSrc,
    autoCloseMs: data?.autoCloseMs,
    answerDelayMs: data?.answerDelayMs
  };

  const shown = await showVoyanceOverlay(payload);
  if (!shown) {
    console.warn(`[${MODULE_ID}] voyance overlay display failed`, { source, requestId, payload });
  }
  return shown;
}

function isCurrentUserChatMessageAuthor(message) {
  const localUserId = String(game.user?.id || "").trim();
  const messageUserId = String(message?.user?.id || message?.user || message?.author?.id || "").trim();
  if (localUserId && messageUserId) return localUserId === messageUserId;
  return Boolean(message?.isAuthor);
}

function scheduleTransientChatMessageDeletion(message, delayMs = 250) {
  const messageId = String(message?.id || "").trim();
  if (!messageId) return;
  if (!isCurrentUserChatMessageAuthor(message)) return;
  const timeout = Math.max(0, Math.floor(Number(delayMs) || 250));
  setTimeout(() => {
    const existing = game.messages?.get(messageId);
    if (!existing) return;
    if (!isCurrentUserChatMessageAuthor(existing)) return;
    existing.delete().catch(() => null);
  }, timeout);
}

async function emitVoyanceOverlayRequest(payload = {}) {
  const requestId = String(payload.requestId || "").trim()
    || (foundry.utils?.randomID ? foundry.utils.randomID() : Math.random().toString(36).slice(2));

  const packet = {
    type: "voyanceOverlay",
    requestId,
    answer: normalizeVoyanceAnswer(payload.answer),
    backgroundSrc: String(payload.backgroundSrc || DEFAULT_BACKGROUND_SRC).trim(),
    senderId: String(game.user?.id || ""),
    autoCloseMs: normalizeDelay(payload.autoCloseMs, DEFAULT_AUTO_CLOSE_MS),
    answerDelayMs: normalizeDelay(payload.answerDelayMs, DEFAULT_ANSWER_DELAY_MS)
  };

  await handleVoyanceOverlayRequest(packet, "local");

  if (game.socket) {
    game.socket.emit(MODULE_SOCKET, packet);
  } else {
    ui.notifications?.warn(t("BJD.Notify.SocketUnavailable", "Socket Foundry indisponible: diffusion globale non effectuee."));
  }

  await ChatMessage.create({
    content: REQUEST_CHAT_MARKUP,
    flags: {
      [MODULE_FLAG_KEY]: {
        voyanceOverlayRequest: packet
      }
    }
  }).catch(() => null);

  return packet;
}

async function rollJetDestin(options = {}) {
  try {
    const formula = String(options.formula || "1d20").trim() || "1d20";
    const thresholdRaw = Number(options.threshold);
    const threshold = Number.isFinite(thresholdRaw) ? Math.max(1, Math.floor(thresholdRaw)) : 10;

    const roll = await new Roll(formula).evaluate({ async: true });
    const total = Number(roll.total || 0);
    const answer = total <= threshold ? "oui" : "non";
    const answerUpper = answer.toUpperCase();

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker(),
      flavor: `<strong>${t("BJD.Chat.Title", "Automate de voyance")}</strong><br>${t("BJD.Chat.ResultLabel", "Resultat")}: <strong>${answerUpper}</strong>`
    });

    const packet = await emitVoyanceOverlayRequest({
      answer,
      backgroundSrc: options.backgroundSrc,
      autoCloseMs: options.autoCloseMs,
      answerDelayMs: options.answerDelayMs
    });

    return { roll, total, answer, requestId: packet.requestId };
  } catch (error) {
    console.error(`[${MODULE_ID}] roll failed`, error);
    ui.notifications?.error(t("BJD.Notify.RollFailed", "Impossible de lancer le jet du destin."));
    return null;
  }
}

function registerSocketHandler() {
  if (!game.socket) return;

  const previousHandler = globalThis.__bjdVoyanceSocketHandler;
  if (previousHandler && typeof game.socket.off === "function") {
    try {
      game.socket.off(MODULE_SOCKET, previousHandler);
    } catch (_error) {
      // non-fatal
    }
  }

  const handler = async data => {
    if (!data || data.type !== "voyanceOverlay") return;
    await handleVoyanceOverlayRequest(data, "socket");
  };

  game.socket.on(MODULE_SOCKET, handler);
  globalThis.__bjdVoyanceSocketHandler = handler;
}

Hooks.once("init", () => {
  const api = {
    rollJetDestin,
    emitVoyanceOverlayRequest,
    showVoyanceOverlay,
    handleVoyanceOverlayRequest
  };

  const module = game.modules?.get?.(MODULE_ID);
  if (module) module.api = api;
  globalThis.bloodmanJetDestin = api;
});

Hooks.once("ready", () => {
  registerSocketHandler();
});

Hooks.on("createChatMessage", async message => {
  const payload = message?.flags?.[MODULE_FLAG_KEY]?.voyanceOverlayRequest;
  if (!payload) return;
  await handleVoyanceOverlayRequest(payload, "chat");
  scheduleTransientChatMessageDeletion(message, 250);
});

export {
  rollJetDestin,
  emitVoyanceOverlayRequest,
  showVoyanceOverlay,
  handleVoyanceOverlayRequest
};

