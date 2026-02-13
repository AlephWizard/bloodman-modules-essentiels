const MODULE_ID = "bloodman-modules-essentiels";
const MODULE_SOCKET = `module.${MODULE_ID}`;
const MODULE_FLAG_KEY = MODULE_ID;
const REQUEST_CHAT_MARKUP = "<span style='display:none'>bloodman-modules-essentiels-request</span>";
const REQUEST_RETENTION_MS = 2 * 60 * 1000;
const OVERLAY_ID = "bjd-voyance-overlay";
const STYLE_ID = "bjd-voyance-style";
const DEFAULT_AUTO_CLOSE_MS = 6500;
const DEFAULT_ANSWER_DELAY_MS = 240;
const DEFAULT_BACKGROUND_SRC = "modules/bloodman-modules-essentiels/images/des_destin.png";
const GM_MACRO_NAME = "Bloodman - Jet du destin";
const GM_MACRO_ICON = `modules/${MODULE_ID}/images/icon_macro_des_destin.jpg`;
const GM_MACRO_FLAG = "autoJetDestinMacro";
const SETTING_ENABLE_GM_MACRO = "enableGmHotbarMacro";
const SETTING_GM_MACRO_SLOT = "gmHotbarMacroSlot";
const GM_MACRO_SLOT_DEFAULT = 1;
const GM_MACRO_SLOT_MIN = 1;
const GM_MACRO_SLOT_MAX = 50;
const TILE_MACRO_NAME = "Bloodman - Tuiles (Toggle)";
const TILE_MACRO_ICON = `modules/${MODULE_ID}/images/icon_macro_tuile.png`;
const TILE_MACRO_FLAG = "autoTileVisibilityMacro";
const TILE_VISIBILITY_STATE_FLAG = "tileVisibilityHiddenState";
const SETTING_ENABLE_TILE_MACRO = "enableTileVisibilityMacro";
const SETTING_TILE_MACRO_SLOT = "tileVisibilityMacroSlot";
const SETTING_ENABLE_TOKEN_RESIZE = "enableTokenResize";
const TILE_MACRO_SLOT_DEFAULT = 2;
const TOKEN_RESIZE_OVERLAY_ID = "bjd-token-resize-overlay";
const TOKEN_RESIZE_STATE_FLAG = "tokenResizeState";
const TOKEN_RESIZE_RENDER_SIZE = 512;
const TOKEN_SCALE_MIN_ABS = 0.05;
const TOKEN_SCALE_MAX_ABS = 4;
const TOKEN_OFFSET_MIN = -2;
const TOKEN_OFFSET_MAX = 2;
const TOKEN_TEXTURE_FIT = "contain";
const TOKEN_RESIZE_EXPORT_ROOT = `modules/${MODULE_ID}/images/token-resize`;
const TOKEN_RESIZE_ACTOR_TYPES = new Set(["personnage", "personnage-non-joueur"]);
const IMAGE_DISPLAY_RETRY_DELAYS = Object.freeze([0, 120, 260]);
const IMAGE_DISPLAY_CACHE_TTL_MS = 5 * 60 * 1000;
const IMAGE_DISPLAY_CACHE_MAX = 512;
const GM_MACRO_COMMAND = `const api = game.modules.get("${MODULE_ID}")?.api;
if (!api || typeof api.rollJetDestin !== "function") {
  ui.notifications?.warn("Module ${MODULE_ID} inactif ou API indisponible.");
} else {
  await api.rollJetDestin();
}`;
const TILE_MACRO_COMMAND = `const api = game.modules.get("${MODULE_ID}")?.api;
if (!api || typeof api.toggleCurrentSceneTilesVisibility !== "function") {
  ui.notifications?.warn("Module ${MODULE_ID} inactif ou API indisponible.");
} else {
  await api.toggleCurrentSceneTilesVisibility();
}`;

const PROCESSED_REQUESTS = new Map();
const DISPLAYABLE_IMAGE_CACHE = new Map();

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

function pruneDisplayableImageCache(now = Date.now()) {
  for (const [src, timestamp] of DISPLAYABLE_IMAGE_CACHE.entries()) {
    if (!Number.isFinite(timestamp) || (now - timestamp) > IMAGE_DISPLAY_CACHE_TTL_MS) {
      DISPLAYABLE_IMAGE_CACHE.delete(src);
    }
  }
  if (DISPLAYABLE_IMAGE_CACHE.size <= IMAGE_DISPLAY_CACHE_MAX) return;
  const overflow = DISPLAYABLE_IMAGE_CACHE.size - IMAGE_DISPLAY_CACHE_MAX;
  const oldest = Array.from(DISPLAYABLE_IMAGE_CACHE.entries())
    .sort((a, b) => a[1] - b[1])
    .slice(0, overflow);
  for (const [src] of oldest) DISPLAYABLE_IMAGE_CACHE.delete(src);
}

function rememberDisplayableImageSource(src) {
  const candidate = String(src || "").trim();
  if (!candidate) return;
  DISPLAYABLE_IMAGE_CACHE.set(candidate, Date.now());
  if (DISPLAYABLE_IMAGE_CACHE.size > IMAGE_DISPLAY_CACHE_MAX) pruneDisplayableImageCache();
}

function isDisplayableImageSourceCached(src) {
  const candidate = String(src || "").trim();
  if (!candidate) return false;
  pruneDisplayableImageCache();
  const timestamp = DISPLAYABLE_IMAGE_CACHE.get(candidate);
  if (!Number.isFinite(timestamp)) return false;
  if ((Date.now() - timestamp) > IMAGE_DISPLAY_CACHE_TTL_MS) {
    DISPLAYABLE_IMAGE_CACHE.delete(candidate);
    return false;
  }
  return true;
}

function waitMs(delayMs) {
  const timeout = Math.max(0, Math.floor(Number(delayMs) || 0));
  return new Promise(resolve => setTimeout(resolve, timeout));
}

async function canDisplayImageSourceWithRetry(src, retryDelays = IMAGE_DISPLAY_RETRY_DELAYS) {
  const candidate = String(src || "").trim();
  if (!candidate) return false;
  if (isDisplayableImageSourceCached(candidate)) return true;
  for (const delay of retryDelays) {
    if (delay > 0) await waitMs(delay);
    if (await canDisplayImageSource(candidate)) {
      rememberDisplayableImageSource(candidate);
      return true;
    }
  }
  return false;
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function normalizeTokenScale(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const sign = numeric < 0 ? -1 : 1;
  const absValue = clampNumber(Math.abs(numeric), TOKEN_SCALE_MIN_ABS, TOKEN_SCALE_MAX_ABS);
  return absValue * sign;
}

function normalizeTokenOffset(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clampNumber(numeric, TOKEN_OFFSET_MIN, TOKEN_OFFSET_MAX);
}

function getFilePickerImplementation() {
  const namespaced = foundry?.applications?.apps?.FilePicker?.implementation;
  if (typeof namespaced === "function") return namespaced;
  if (typeof globalThis.FilePicker === "function") return globalThis.FilePicker;
  return null;
}

function sanitizeFilenamePart(value, fallback = "item") {
  const raw = String(value || "").trim().toLowerCase();
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
  return (normalized || fallback).slice(0, 48);
}

function normalizeFoundryFilePath(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "");
}

async function dataUrlToBlob(dataUrl) {
  const raw = String(dataUrl || "").trim();
  if (!raw.startsWith("data:")) return null;

  try {
    const response = await fetch(raw);
    const blob = await response.blob();
    if (blob && Number(blob.size) > 0) return blob;
  } catch (_error) {
    // fallback below
  }

  const splitIndex = raw.indexOf(",");
  if (splitIndex <= 0) return null;
  const header = raw.slice(0, splitIndex);
  const payload = raw.slice(splitIndex + 1);
  const mimeMatch = header.match(/^data:([^;]+)/i);
  const mimeType = String(mimeMatch?.[1] || "image/png").trim().toLowerCase();
  const isBase64 = /;base64/i.test(header);
  if (!isBase64) return null;

  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  } catch (_error) {
    return null;
  }
}

function hashTokenResizeSeed(seed) {
  const input = String(seed || "");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function inferTokenTextureOutputFormat(sourceSrc) {
  void sourceSrc;
  return { mimeType: "image/png", extension: "png", quality: 1 };
}

function buildTokenResizeExportPath(actor, state, options = {}, format = {}) {
  const worldId = sanitizeFilenamePart(game.world?.id || "world", "world");
  const actorId = sanitizeFilenamePart(
    options?.actorId
    || actor?.token?.actorId
    || actor?.id
    || actor?.name
    || "actor",
    "actor"
  );
  const actorName = sanitizeFilenamePart(actor?.name || actor?.prototypeToken?.name || "token", "token");
  const tokenId = sanitizeFilenamePart(
    options?.tokenId
    || actor?.token?.id
    || actor?.parent?.id
    || "scene",
    "scene"
  );
  const seed = [
    state?.src,
    state?.scaleX,
    state?.scaleY,
    state?.offsetX,
    state?.offsetY,
    TOKEN_TEXTURE_FIT
  ].join("|");
  const seedHash = hashTokenResizeSeed(seed);
  const extension = String(format?.extension || "png").trim().toLowerCase() || "png";
  const directory = `${TOKEN_RESIZE_EXPORT_ROOT}/${worldId}/${actorId}`;
  const filename = `${actorName}-${tokenId}-${seedHash}.${extension}`;
  return { directory, filename };
}

async function ensureDirectoryPath(filePickerClass, source, directory) {
  const segments = String(directory || "").split("/").map(part => part.trim()).filter(Boolean);
  if (!segments.length) return;
  let current = "";
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    try {
      await filePickerClass.createDirectory(source, current);
    } catch (error) {
      const message = String(error?.message || error || "").toLowerCase();
      const alreadyExists = message.includes("exists")
        || message.includes("already")
        || message.includes("eexist")
        || message.includes("deja");
      if (!alreadyExists) throw error;
    }
  }
}

async function persistTokenTextureDataUrl(dataUrl, actor, state, options = {}, format = {}) {
  const sourceData = String(dataUrl || "").trim();
  if (!sourceData.startsWith("data:image/")) return sourceData;

  const filePickerClass = getFilePickerImplementation();
  if (!filePickerClass || typeof filePickerClass.upload !== "function") return sourceData;

  try {
    const blob = await dataUrlToBlob(sourceData);
    if (!(blob && Number(blob.size) > 0)) return sourceData;

    const output = buildTokenResizeExportPath(actor, state, options, format);
    await ensureDirectoryPath(filePickerClass, "data", output.directory);

    const mimeType = String(format?.mimeType || blob.type || "image/png").trim().toLowerCase();
    const file = new File([blob], output.filename, { type: mimeType });
    const uploadResult = await filePickerClass.upload("data", output.directory, file, {}).catch(error => {
      console.warn(`[${MODULE_ID}] token texture upload failed`, error);
      return null;
    });

    const uploadedPath = normalizeFoundryFilePath(
      uploadResult?.path
      || uploadResult?.files?.[0]
      || uploadResult?.uploaded
      || ""
    );
    const expectedPath = normalizeFoundryFilePath(`${output.directory}/${output.filename}`);
    if (uploadedPath && await canDisplayImageSourceWithRetry(uploadedPath)) return uploadedPath;
    if (uploadedPath) return uploadedPath;
    if (uploadResult && expectedPath && await canDisplayImageSourceWithRetry(expectedPath)) return expectedPath;

    if (uploadedPath) {
      console.warn(`[${MODULE_ID}] uploaded token texture path is not displayable`, {
        uploadedPath,
        expectedPath
      });
    }
  } catch (error) {
    console.warn(`[${MODULE_ID}] failed to persist generated token texture`, error);
  }
  return sourceData;
}

function isTokenResizeEnabled() {
  return Boolean(game.settings?.get?.(MODULE_ID, SETTING_ENABLE_TOKEN_RESIZE));
}

function isTokenResizeActor(actor) {
  const actorType = String(actor?.type || "").trim();
  return TOKEN_RESIZE_ACTOR_TYPES.has(actorType);
}

function getTokenResizeFlagCarrier(actor) {
  if (!actor) return null;
  if (actor.isToken && actor.token) return actor.token;
  return actor;
}

function resolveTokenDocumentFromContext(actor, options = {}) {
  const explicitToken = resolveTokenDocumentLike(
    options?.tokenDoc
    || options?.token
    || options?.app?.token
    || options?.app?.object
    || null
  );
  if (explicitToken?.documentName === "Token" && typeof explicitToken.update === "function") return explicitToken;

  const actorToken = resolveTokenDocumentLike(actor?.token || null);
  if (actorToken?.documentName === "Token" && typeof actorToken.update === "function") return actorToken;

  const actorUuid = String(options?.actorUuid || actor?.uuid || "").trim();
  const uuidMatch = actorUuid.match(/Scene\.([^.]+)\.Token\.([^.]+)/i);
  const tokenId = String(
    options?.tokenId
    || actor?.token?.id
    || actor?.parent?.id
    || uuidMatch?.[2]
    || ""
  ).trim();
  const preferredSceneId = String(
    options?.sceneId
    || actor?.token?.parent?.id
    || actor?.parent?.parent?.id
    || uuidMatch?.[1]
    || ""
  ).trim();

  if (tokenId) {
    const scenesToCheck = [];
    if (preferredSceneId) {
      const preferredScene = game.scenes?.get?.(preferredSceneId);
      if (preferredScene) scenesToCheck.push(preferredScene);
    }
    if (canvas?.scene && !scenesToCheck.includes(canvas.scene)) scenesToCheck.push(canvas.scene);

    for (const scene of scenesToCheck) {
      const byGet = resolveTokenDocumentLike(scene?.tokens?.get?.(tokenId) || null);
      if (byGet?.documentName === "Token" && typeof byGet.update === "function") return byGet;

      const byIter = getSceneTokenDocuments(scene).find(tokenDoc => (
        String(tokenDoc?.id || tokenDoc?._id || "").trim() === tokenId
      ));
      const byIterDoc = resolveTokenDocumentLike(byIter || null);
      if (byIterDoc?.documentName === "Token" && typeof byIterDoc.update === "function") return byIterDoc;
    }
  }

  const actorId = String(
    options?.actorId
    || actor?.token?.actorId
    || actor?.id
    || ""
  ).trim();
  if (!actorId || !canvas?.tokens?.placeables?.length) return null;

  const controlled = canvas.tokens.placeables.find(token => (
    token?.controlled === true
    && String(token?.document?.actorId || "").trim() === actorId
  ));
  if (controlled?.document?.documentName === "Token" && typeof controlled.document.update === "function") {
    return controlled.document;
  }

  const firstMatch = canvas.tokens.placeables.find(token => (
    String(token?.document?.actorId || "").trim() === actorId
  ));
  if (firstMatch?.document?.documentName === "Token" && typeof firstMatch.document.update === "function") {
    return firstMatch.document;
  }
  return null;
}

function sanitizeTokenResizeFlagState(rawState = {}, options = {}) {
  const fallbackSrc = String(options.fallbackSrc || "").trim() || "icons/svg/mystery-man.svg";
  const sourceSrc = String(rawState?.src || "").trim() || fallbackSrc;
  const scaleX = normalizeTokenScale(rawState?.scaleX, 1);
  const scaleYFallback = rawState?.scaleY != null ? rawState.scaleY : scaleX;
  const scaleY = normalizeTokenScale(scaleYFallback, scaleX);
  const offsetX = normalizeTokenOffset(rawState?.offsetX, 0);
  const offsetY = normalizeTokenOffset(rawState?.offsetY, 0);
  const lockScale = rawState?.lockScale !== false;

  return {
    src: sourceSrc,
    scaleX,
    scaleY,
    offsetX,
    offsetY,
    fit: TOKEN_TEXTURE_FIT,
    lockScale
  };
}

function buildPrototypeTokenTextureUpdateData(tokenSrc, fit = TOKEN_TEXTURE_FIT) {
  const source = String(tokenSrc || "").trim();
  if (!source) return null;
  return {
    "prototypeToken.texture.src": source,
    "prototypeToken.texture.scaleX": 1,
    "prototypeToken.texture.scaleY": 1,
    "prototypeToken.texture.offsetX": 0,
    "prototypeToken.texture.offsetY": 0,
    "prototypeToken.texture.fit": String(fit || TOKEN_TEXTURE_FIT).trim() || TOKEN_TEXTURE_FIT
  };
}

function buildTokenTextureUpdateData(tokenSrc, fit = TOKEN_TEXTURE_FIT, flagState = null) {
  const source = String(tokenSrc || "").trim();
  if (!source) return null;
  const updateData = {
    img: source,
    "texture.src": source,
    "texture.scaleX": 1,
    "texture.scaleY": 1,
    "texture.offsetX": 0,
    "texture.offsetY": 0,
    "texture.fit": String(fit || TOKEN_TEXTURE_FIT).trim() || TOKEN_TEXTURE_FIT
  };
  if (flagState && typeof flagState === "object") {
    updateData[`flags.${MODULE_ID}.${TOKEN_RESIZE_STATE_FLAG}`] = flagState;
  }
  return updateData;
}

function getStoredTokenResizeState(actor, options = {}) {
  const contextToken = resolveTokenDocumentFromContext(actor, options);
  const actorId = String(
    options?.actorId
    || contextToken?.actorId
    || actor?.token?.actorId
    || actor?.id
    || ""
  ).trim();
  const worldActor = actorId ? game.actors?.get?.(actorId) : null;
  const actorFlag = worldActor?.getFlag?.(MODULE_ID, TOKEN_RESIZE_STATE_FLAG);
  if (actorFlag && typeof actorFlag === "object") return actorFlag;

  const carrier = getTokenResizeFlagCarrier(actor);
  const directFlag = carrier?.getFlag?.(MODULE_ID, TOKEN_RESIZE_STATE_FLAG);
  if (directFlag && typeof directFlag === "object") return directFlag;

  const contextFlag = contextToken?.getFlag?.(MODULE_ID, TOKEN_RESIZE_STATE_FLAG);
  if (contextFlag && typeof contextFlag === "object") return contextFlag;
  return null;
}

function getActorTokenTextureState(actor, options = {}) {
  const contextToken = resolveTokenDocumentFromContext(actor, options);
  const tokenData = contextToken || (actor?.isToken ? (actor.token || actor) : actor);
  const texturePath = contextToken ? "texture" : (actor?.isToken ? "texture" : "prototypeToken.texture");
  const storedState = getStoredTokenResizeState(actor, options);
  const preferredSrc = String(options.preferredSrc || "").trim();
  const actorId = String(
    options?.actorId
    || contextToken?.actorId
    || actor?.token?.actorId
    || actor?.id
    || ""
  ).trim();
  const worldActor = actorId ? game.actors?.get?.(actorId) : null;
  const actorSrc = String(worldActor?.img || actor?.img || "").trim();
  const tokenSrc = String(foundry.utils.getProperty(tokenData, `${texturePath}.src`) || "").trim();
  const fallbackSrc = actorSrc || tokenSrc || preferredSrc || "icons/svg/mystery-man.svg";
  const normalizedStoredState = sanitizeTokenResizeFlagState(storedState || {}, { fallbackSrc });
  const sourceSrc = normalizedStoredState.src || preferredSrc || fallbackSrc;

  return sanitizeTokenResizeFlagState(
    {
      ...normalizedStoredState,
      src: sourceSrc
    },
    { fallbackSrc: sourceSrc }
  );
}

function clearTokenResizeOverlay() {
  document.getElementById(TOKEN_RESIZE_OVERLAY_ID)?.remove();
}

function openImageFinder(currentPath = "", onSelect = null) {
  const FilePickerClass = getFilePickerImplementation();
  if (typeof FilePickerClass !== "function") {
    ui.notifications?.warn(t("BJD.TokenResize.FilePickerUnavailable", "Finder d'image indisponible."));
    return;
  }

  const overlay = document.getElementById(TOKEN_RESIZE_OVERLAY_ID);
  overlay?.classList?.add("is-picker-open");
  const releaseOverlay = () => overlay?.classList?.remove("is-picker-open");

  const picker = new FilePickerClass({
    type: "imagevideo",
    current: String(currentPath || "").trim(),
    callback: path => {
      const nextPath = String(path || "").trim();
      if (!nextPath) return;
      if (typeof onSelect === "function") onSelect(nextPath);
      releaseOverlay();
    }
  });

  const originalClose = typeof picker.close === "function"
    ? picker.close.bind(picker)
    : null;
  if (originalClose) {
    picker.close = async (...args) => {
      releaseOverlay();
      return originalClose(...args);
    };
  }

  const elevatePicker = () => {
    const pickerElement = picker.element?.[0] || picker.element?.get?.(0) || null;
    if (pickerElement?.style) {
      pickerElement.style.zIndex = "32000";
      pickerElement.classList.add("bjd-token-picker-foreground");
    }
  };

  const renderResult = picker.render(true);
  Promise.resolve(renderResult).then(() => {
    elevatePicker();
    setTimeout(elevatePicker, 40);
  });
}

function resolveTokenDocumentLike(tokenLike) {
  return tokenLike?.document || tokenLike || null;
}

function updateTokenResizePreview(rootEl, state, options = {}) {
  const root = rootEl;
  if (!root) return;
  const previewImg = root.querySelector(".bjd-token-resize-preview-image");
  if (!previewImg) return;

  const normalizedScaleX = normalizeTokenScale(state.scaleX, 1);
  const normalizedScaleY = normalizeTokenScale(state.scaleY, 1);
  const normalizedOffsetX = normalizeTokenOffset(state.offsetX, 0);
  const normalizedOffsetY = normalizeTokenOffset(state.offsetY, 0);

  state.scaleX = normalizedScaleX;
  state.scaleY = normalizedScaleY;
  state.offsetX = normalizedOffsetX;
  state.offsetY = normalizedOffsetY;

  previewImg.style.transform = `translate(calc(-50% + ${normalizedOffsetX * 50}%), calc(-50% + ${normalizedOffsetY * 50}%)) scale(${normalizedScaleX}, ${normalizedScaleY})`;

  if (options.syncInputs !== true) return;
  const fields = ["scaleX", "scaleY", "offsetX", "offsetY"];
  for (const field of fields) {
    const value = Number(state[field]);
    for (const input of root.querySelectorAll(`[data-field="${field}"]`)) {
      if (input.type === "range") {
        input.value = String(value);
      } else {
        input.value = String(Number(value.toFixed(3)));
      }
    }
  }
}

async function loadImageElement(src) {
  const source = String(src || "").trim();
  if (!source) throw new Error("Missing image source.");
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      img.onload = null;
      img.onerror = null;
      resolve(img);
    };
    img.onerror = () => {
      img.onload = null;
      img.onerror = null;
      reject(new Error(`Unable to load image source: ${source}`));
    };
    img.src = source;
  });
}

async function buildTokenTextureSourceFromResizeState(state, options = {}) {
  const sourceSrc = String(state?.src || "").trim();
  if (!sourceSrc) return "icons/svg/mystery-man.svg";

  let image;
  try {
    image = await loadImageElement(sourceSrc);
  } catch (_error) {
    return sourceSrc;
  }

  const imageWidth = Number(image.naturalWidth || image.width || 0);
  const imageHeight = Number(image.naturalHeight || image.height || 0);
  if (!(Number.isFinite(imageWidth) && Number.isFinite(imageHeight) && imageWidth > 0 && imageHeight > 0)) {
    return sourceSrc;
  }

  const outputSize = Math.max(256, Math.floor(Number(options.outputSize) || TOKEN_RESIZE_RENDER_SIZE));
  const canvasEl = document.createElement("canvas");
  canvasEl.width = outputSize;
  canvasEl.height = outputSize;
  const context = canvasEl.getContext("2d");
  if (!context) return sourceSrc;

  const scaleX = normalizeTokenScale(state?.scaleX, 1);
  const scaleY = normalizeTokenScale(state?.scaleY, 1);
  const offsetX = normalizeTokenOffset(state?.offsetX, 0);
  const offsetY = normalizeTokenOffset(state?.offsetY, 0);

  const ratio = imageWidth / imageHeight;
  let baseWidth = outputSize;
  let baseHeight = outputSize;
  if (ratio >= 1) {
    baseHeight = outputSize / ratio;
  } else {
    baseWidth = outputSize * ratio;
  }

  const drawWidth = baseWidth * Math.abs(scaleX);
  const drawHeight = baseHeight * Math.abs(scaleY);
  const centerX = (outputSize / 2) + (offsetX * (outputSize / 2));
  const centerY = (outputSize / 2) + (offsetY * (outputSize / 2));
  const flipX = scaleX < 0 ? -1 : 1;
  const flipY = scaleY < 0 ? -1 : 1;
  const circleRadius = (outputSize / 2) * 0.995;

  context.clearRect(0, 0, outputSize, outputSize);
  context.save();
  context.beginPath();
  context.arc(outputSize / 2, outputSize / 2, circleRadius, 0, Math.PI * 2);
  context.closePath();
  context.clip();
  context.translate(centerX, centerY);
  context.scale(flipX, flipY);
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  context.restore();

  const requestedMime = String(options.outputMime || "image/png").trim().toLowerCase();
  const outputMime = requestedMime === "image/jpeg" ? "image/jpeg" : "image/png";
  const quality = Number.isFinite(Number(options.outputQuality))
    ? clampNumber(Number(options.outputQuality), 0.1, 1)
    : (outputMime === "image/jpeg" ? 0.92 : 1);
  try {
    return canvasEl.toDataURL(outputMime, quality);
  } catch (_error) {
    return sourceSrc;
  }
}

async function saveActorTokenTextureState(actor, state, options = {}) {
  if (!actor) return false;
  const sourceSrc = String(state?.src || "").trim() || "icons/svg/mystery-man.svg";
  const normalizedState = sanitizeTokenResizeFlagState(state, { fallbackSrc: sourceSrc });
  const outputFormat = inferTokenTextureOutputFormat(normalizedState.src);
  const tokenTextureData = await buildTokenTextureSourceFromResizeState(normalizedState, {
    outputMime: outputFormat.mimeType,
    outputQuality: outputFormat.quality
  });
  let tokenTextureSrc = await persistTokenTextureDataUrl(
    tokenTextureData,
    actor,
    normalizedState,
    options,
    outputFormat
  );
  tokenTextureSrc = String(tokenTextureSrc || "").trim() || String(tokenTextureData || "").trim();
  if (!tokenTextureSrc || !(await canDisplayImageSourceWithRetry(tokenTextureSrc))) {
    tokenTextureSrc = normalizedState.src;
  } else if (tokenTextureSrc.startsWith("data:image/")) {
    ui.notifications?.warn(
      t(
        "BJD.TokenResize.TokenTemporaryDataUrlWarning",
        "PNG token non persiste sur disque; utilisation temporaire en memoire."
      )
    );
  }

  const flagState = {
    src: normalizedState.src,
    tokenSrc: tokenTextureSrc,
    scaleX: normalizedState.scaleX,
    scaleY: normalizedState.scaleY,
    offsetX: normalizedState.offsetX,
    offsetY: normalizedState.offsetY,
    lockScale: normalizedState.lockScale
  };

  const payload = {
    sourceSrc: normalizedState.src,
    tokenSrc: tokenTextureSrc,
    fit: TOKEN_TEXTURE_FIT
  };

  try {
    const contextToken = resolveTokenDocumentFromContext(actor, options);
    const actorId = String(
      options?.actorId
      || contextToken?.actorId
      || actor?.token?.actorId
      || actor?.id
      || ""
    ).trim();
    const worldActor = actorId ? game.actors?.get?.(actorId) : null;
    const actorUpdateTarget = worldActor?.update ? worldActor : actor;
    const prototypeTextureUpdate = buildPrototypeTokenTextureUpdateData(payload.tokenSrc, payload.fit);

    if (!actorUpdateTarget?.update) return false;
    await actorUpdateTarget.update(
      {
        img: payload.sourceSrc,
        ...(prototypeTextureUpdate || {}),
        [`flags.${MODULE_ID}.${TOKEN_RESIZE_STATE_FLAG}`]: flagState
      },
      {
        bloodmanSkipPrototypeImageSync: true,
        bloodmanSkipSceneTokenImageSync: true
      }
    );

    const contextTokenId = String(contextToken?.id || "").trim();
    const tokensToUpdate = new Map();
    if (contextToken?.update && contextTokenId) tokensToUpdate.set(contextTokenId, contextToken);

    const activeScene = canvas?.scene || null;
    const activeTokenDocs = getSceneTokenDocuments(activeScene);
    for (const tokenDoc of activeTokenDocs) {
      const tokenDocId = String(tokenDoc?.id || tokenDoc?._id || "").trim();
      const tokenActorId = String(tokenDoc?.actorId || tokenDoc?.actor?.id || "").trim();
      const actorMatch = actorId && tokenActorId === actorId;
      const tokenMatch = contextTokenId && tokenDocId === contextTokenId;
      if (!actorMatch && !tokenMatch) continue;
      if (tokenDocId) tokensToUpdate.set(tokenDocId, tokenDoc);
    }

    let updatedSceneTokens = 0;
    for (const tokenDoc of tokensToUpdate.values()) {
      const tokenUpdateData = buildTokenTextureUpdateData(payload.tokenSrc, payload.fit, flagState);
      if (!tokenUpdateData) continue;
      const updatedDoc = await tokenDoc.update(
        tokenUpdateData,
        { bloodmanSkipActorImageSync: true }
      ).catch(error => {
        console.warn(`[${MODULE_ID}] token resize update failed for scene token ${tokenDoc?.id || "unknown"}`, error);
        return null;
      });
      if (updatedDoc) updatedSceneTokens += 1;
    }

    if (updatedSceneTokens === 0) {
      ui.notifications?.info(
        t(
          "BJD.TokenResize.NoActiveTokenFound",
          "Aucun token actif trouve. Le redimensionnement sera applique au prochain token place."
        )
      );
    }

    refreshTokenResizeDisplays(actorUpdateTarget);
    return true;
  } catch (error) {
    console.error(`[${MODULE_ID}] failed to save token resizing`, error);
    ui.notifications?.error(t("BJD.TokenResize.SaveFailed", "Impossible d'enregistrer le redimensionnement du token."));
    return false;
  }
}

function openTokenResizeModal(actor, options = {}) {
  if (!actor) return;
  clearTokenResizeOverlay();

  const textureState = getActorTokenTextureState(actor, options);
  const state = {
    src: textureState.src,
    scaleX: textureState.scaleX,
    scaleY: textureState.scaleY,
    offsetX: textureState.offsetX,
    offsetY: textureState.offsetY,
    fit: textureState.fit,
    lockScale: textureState.lockScale !== false
  };

  const actorName = String(actor.name || actor.prototypeToken?.name || "Acteur").trim() || "Acteur";
  const escapedActorName = foundry.utils?.escapeHTML
    ? foundry.utils.escapeHTML(actorName)
    : actorName.replace(/[&<>"']/g, chr => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[chr]));
  const escapedSrc = foundry.utils?.escapeHTML
    ? foundry.utils.escapeHTML(state.src)
    : state.src.replace(/[&<>"']/g, chr => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[chr]));

  const overlay = document.createElement("div");
  overlay.id = TOKEN_RESIZE_OVERLAY_ID;
  overlay.innerHTML = `
    <div class="bjd-token-resize-backdrop" data-action="close"></div>
    <section class="bjd-token-resize-dialog" role="dialog" aria-modal="true" aria-label="${t("BJD.TokenResize.Title", "Redimensionnement de token")}">
      <header class="bjd-token-resize-header">
        <div class="bjd-token-resize-title-wrap">
          <h2>${t("BJD.TokenResize.Title", "Redimensionnement de token")}</h2>
          <p>${escapedActorName}</p>
        </div>
        <div class="bjd-token-resize-header-actions">
          <button
            type="button"
            class="bjd-token-resize-find"
            data-action="browse-image"
            title="${t("BJD.TokenResize.Browse", "Choisir une image")}"
            aria-label="${t("BJD.TokenResize.Browse", "Choisir une image")}"
          >
            <i class="fa-solid fa-image" aria-hidden="true"></i>
          </button>
          <button type="button" class="bjd-token-resize-close" data-action="close" aria-label="${t("BJD.TokenResize.Close", "Fermer")}">x</button>
        </div>
      </header>
      <div class="bjd-token-resize-body">
        <div class="bjd-token-resize-preview-wrap">
          <div class="bjd-token-resize-preview-mask">
            <img class="bjd-token-resize-preview-image" src="${escapedSrc}" alt="${escapedActorName}" draggable="false" />
            <div class="bjd-token-resize-preview-ring" aria-hidden="true"></div>
          </div>
          <p class="bjd-token-resize-help">${t("BJD.TokenResize.DragHint", "Glisser l'image source; le cercle indique la zone visible du token.")}</p>
        </div>
        <div class="bjd-token-resize-controls">
          <label class="bjd-token-resize-control">
            <span>${t("BJD.TokenResize.ScaleX", "Echelle X")}</span>
            <input type="range" min="-4" max="4" step="0.01" data-field="scaleX" />
            <input type="number" min="-4" max="4" step="0.01" data-field="scaleX" />
          </label>
          <label class="bjd-token-resize-control">
            <span>${t("BJD.TokenResize.ScaleY", "Echelle Y")}</span>
            <input type="range" min="-4" max="4" step="0.01" data-field="scaleY" />
            <input type="number" min="-4" max="4" step="0.01" data-field="scaleY" />
          </label>
          <label class="bjd-token-resize-control">
            <span>${t("BJD.TokenResize.OffsetX", "Decalage X")}</span>
            <input type="range" min="-2" max="2" step="0.01" data-field="offsetX" />
            <input type="number" min="-2" max="2" step="0.01" data-field="offsetX" />
          </label>
          <label class="bjd-token-resize-control">
            <span>${t("BJD.TokenResize.OffsetY", "Decalage Y")}</span>
            <input type="range" min="-2" max="2" step="0.01" data-field="offsetY" />
            <input type="number" min="-2" max="2" step="0.01" data-field="offsetY" />
          </label>
          <label class="bjd-token-resize-lock">
            <input type="checkbox" data-action="lock-scale" ${state.lockScale ? "checked" : ""} />
            <span>${t("BJD.TokenResize.LockScale", "Lier X et Y")}</span>
          </label>
        </div>
      </div>
      <footer class="bjd-token-resize-footer">
        <button type="button" class="bjd-btn" data-action="reset">${t("BJD.TokenResize.Reset", "Reinitialiser")}</button>
        <div class="bjd-token-resize-footer-right">
          <button type="button" class="bjd-btn" data-action="close">${t("BJD.TokenResize.Cancel", "Annuler")}</button>
          <button type="button" class="bjd-btn bjd-btn-primary" data-action="save">${t("BJD.TokenResize.Apply", "Appliquer")}</button>
        </div>
      </footer>
    </section>
  `;
  document.body.appendChild(overlay);

  const onClose = () => {
    document.removeEventListener("keydown", onKeyDown);
    clearTokenResizeOverlay();
  };

  const onKeyDown = ev => {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    onClose();
  };
  document.addEventListener("keydown", onKeyDown);

  overlay.querySelectorAll("[data-action='close']").forEach(button => {
    button.addEventListener("click", onClose);
  });

  const refreshPreview = (syncInputs = false) => {
    updateTokenResizePreview(overlay, state, { syncInputs });
  };
  refreshPreview(true);

  const browseImageButton = overlay.querySelector("[data-action='browse-image']");
  browseImageButton?.addEventListener("click", () => {
    openImageFinder(state.src, nextPath => {
      const previousSrc = String(state.src || "").trim();
      state.src = nextPath;
      if (String(nextPath || "").trim() !== previousSrc) {
        state.scaleX = 1;
        state.scaleY = 1;
        state.offsetX = 0;
        state.offsetY = 0;
      }
      const previewImg = overlay.querySelector(".bjd-token-resize-preview-image");
      if (previewImg) previewImg.src = nextPath;
      refreshPreview(true);
    });
  });

  const bindFieldInputs = (field, normalize, onUpdate = null) => {
    const controls = overlay.querySelectorAll(`[data-field="${field}"]`);
    controls.forEach(control => {
      control.addEventListener("input", () => {
        const value = normalize(control.value, state[field]);
        if (typeof onUpdate === "function") onUpdate(value);
        else state[field] = value;
        refreshPreview(true);
      });
      control.addEventListener("change", () => {
        const value = normalize(control.value, state[field]);
        if (typeof onUpdate === "function") onUpdate(value);
        else state[field] = value;
        refreshPreview(true);
      });
    });
  };

  bindFieldInputs("scaleX", normalizeTokenScale, value => {
    state.scaleX = value;
    if (state.lockScale) state.scaleY = value;
  });
  bindFieldInputs("scaleY", normalizeTokenScale, value => {
    state.scaleY = value;
    if (state.lockScale) state.scaleX = value;
  });
  bindFieldInputs("offsetX", normalizeTokenOffset);
  bindFieldInputs("offsetY", normalizeTokenOffset);

  const lockScaleInput = overlay.querySelector("[data-action='lock-scale']");
  lockScaleInput?.addEventListener("change", () => {
    state.lockScale = Boolean(lockScaleInput.checked);
    if (!state.lockScale) return;
    state.scaleY = state.scaleX;
    refreshPreview(true);
  });

  const previewMask = overlay.querySelector(".bjd-token-resize-preview-mask");
  let dragState = null;
  previewMask?.addEventListener("pointerdown", ev => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    dragState = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      baseOffsetX: state.offsetX,
      baseOffsetY: state.offsetY
    };
    previewMask.classList.add("is-dragging");
    previewMask.setPointerCapture?.(ev.pointerId);
  });
  previewMask?.addEventListener("pointermove", ev => {
    if (!dragState || dragState.pointerId !== ev.pointerId) return;
    ev.preventDefault();
    const rect = previewMask.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const deltaX = ((ev.clientX - dragState.startX) / rect.width) * 2;
    const deltaY = ((ev.clientY - dragState.startY) / rect.height) * 2;
    state.offsetX = normalizeTokenOffset(dragState.baseOffsetX + deltaX, state.offsetX);
    state.offsetY = normalizeTokenOffset(dragState.baseOffsetY + deltaY, state.offsetY);
    refreshPreview(true);
  });
  const stopDragging = ev => {
    if (!dragState || dragState.pointerId !== ev.pointerId) return;
    dragState = null;
    previewMask.classList.remove("is-dragging");
    if (previewMask.hasPointerCapture?.(ev.pointerId)) {
      previewMask.releasePointerCapture(ev.pointerId);
    }
  };
  previewMask?.addEventListener("pointerup", stopDragging);
  previewMask?.addEventListener("pointercancel", stopDragging);

  const resetButton = overlay.querySelector("[data-action='reset']");
  resetButton?.addEventListener("click", () => {
    state.scaleX = 1;
    state.scaleY = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    refreshPreview(true);
  });

  const saveButton = overlay.querySelector("[data-action='save']");
  saveButton?.addEventListener("click", async () => {
    saveButton.disabled = true;
    const saved = await saveActorTokenTextureState(actor, state, options);
    saveButton.disabled = false;
    if (!saved) return;
    ui.notifications?.info(t("BJD.TokenResize.Saved", "Redimensionnement du token enregistre."));
    onClose();
    actor.sheet?.render(false);
  });
}

function bindTokenResizeToActorSheet(app, html) {
  const actor = app?.actor;
  if (!isTokenResizeActor(actor)) return;
  const portraitImages = html?.find?.("img.portrait[data-edit='img']");
  if (!portraitImages?.length) return;
  const contextToken = resolveTokenDocumentFromContext(actor, { app });
  const actorUuid = String(actor?.uuid || "").trim();
  const uuidMatch = actorUuid.match(/Scene\.([^.]+)\.Token\.([^.]+)/i);
  const contextTokenId = String(contextToken?.id || actor?.token?.id || actor?.parent?.id || uuidMatch?.[2] || "").trim();
  const contextSceneId = String(contextToken?.parent?.id || actor?.token?.parent?.id || actor?.parent?.parent?.id || uuidMatch?.[1] || "").trim();
  const contextActorId = String(contextToken?.actorId || actor?.token?.actorId || actor?.id || "").trim();

  portraitImages.each((_index, element) => {
    if (!element) return;
    if (typeof element.__bjdTokenResizeClickHandler === "function") {
      element.removeEventListener("click", element.__bjdTokenResizeClickHandler, true);
      delete element.__bjdTokenResizeClickHandler;
    }
    element.classList.remove("bjd-token-resize-enabled");
    if (!isTokenResizeEnabled()) return;

    element.classList.add("bjd-token-resize-enabled");
    const clickHandler = ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
      openTokenResizeModal(actor, {
        app,
        tokenDoc: contextToken,
        actorId: contextActorId,
        tokenId: contextTokenId,
        sceneId: contextSceneId,
        actorUuid
      });
    };
    element.__bjdTokenResizeClickHandler = clickHandler;
    element.addEventListener("click", clickHandler, true);
  });
}

function refreshOpenActorSheetsForTokenResize() {
  for (const app of Object.values(ui.windows || {})) {
    const actor = app?.actor;
    if (!isTokenResizeActor(actor)) continue;
    app.render(false);
  }
}

function refreshTokenResizeDisplays(actor) {
  refreshOpenActorSheetsForTokenResize();
  actor?.sheet?.render?.(false);
}

function getSceneTokenDocuments(scene) {
  const collection = scene?.tokens;
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection?.contents)) return collection.contents;
  try {
    return Array.from(collection);
  } catch (_error) {
    return [];
  }
}

async function applyStoredTokenResizeToTokenDocument(tokenDoc, options = {}) {
  const tokenDocument = resolveTokenDocumentLike(tokenDoc);
  if (!(tokenDocument?.documentName === "Token" && typeof tokenDocument.update === "function")) return false;

  const tokenActorId = String(tokenDocument?.actorId || tokenDocument?.actor?.id || "").trim();
  const worldActor = tokenActorId ? game.actors?.get?.(tokenActorId) : null;
  const actor = worldActor || tokenDocument?.actor || null;
  const actorUpdateTarget = worldActor?.update ? worldActor : actor;

  const actorFlag = actor?.getFlag?.(MODULE_ID, TOKEN_RESIZE_STATE_FLAG);
  const tokenFlag = tokenDocument?.getFlag?.(MODULE_ID, TOKEN_RESIZE_STATE_FLAG);
  const hasResizeFlag = (actorFlag && typeof actorFlag === "object")
    || (tokenFlag && typeof tokenFlag === "object");
  if (!hasResizeFlag && !isTokenResizeActor(actor)) return false;

  const rawState = (actorFlag && typeof actorFlag === "object")
    ? { ...actorFlag }
    : ((tokenFlag && typeof tokenFlag === "object") ? { ...tokenFlag } : null);
  if (!rawState?.src && !rawState?.tokenSrc) return false;

  const sourceFallback = String(rawState?.src || actor?.img || "icons/svg/mystery-man.svg").trim() || "icons/svg/mystery-man.svg";
  let desiredState = sanitizeTokenResizeFlagState(rawState, { fallbackSrc: sourceFallback });
  let tokenSrc = String(rawState?.tokenSrc || "").trim();

  if (!tokenSrc && desiredState.src) {
    const outputFormat = inferTokenTextureOutputFormat(desiredState.src);
    const tokenTextureData = await buildTokenTextureSourceFromResizeState(desiredState, {
      outputMime: outputFormat.mimeType,
      outputQuality: outputFormat.quality
    });
    tokenSrc = await persistTokenTextureDataUrl(
      tokenTextureData,
      actorUpdateTarget || actor,
      desiredState,
      options,
      outputFormat
    );
    tokenSrc = String(tokenSrc || "").trim() || String(tokenTextureData || "").trim();
    if (!tokenSrc || !(await canDisplayImageSourceWithRetry(tokenSrc))) tokenSrc = desiredState.src;

    const nextState = {
      ...desiredState,
      tokenSrc
    };
    const prototypeTextureUpdate = buildPrototypeTokenTextureUpdateData(tokenSrc);

    if (actorUpdateTarget?.update) {
      await actorUpdateTarget.update(
        {
          ...(prototypeTextureUpdate || {}),
          [`flags.${MODULE_ID}.${TOKEN_RESIZE_STATE_FLAG}`]: nextState
        },
        {
          bloodmanSkipPrototypeImageSync: true,
          bloodmanSkipSceneTokenImageSync: true
        }
      ).catch(() => null);
    }

    desiredState = sanitizeTokenResizeFlagState(nextState, { fallbackSrc: sourceFallback });
  }

  let desiredSrc = String(tokenSrc || desiredState.src || sourceFallback).trim();
  if (!desiredSrc) return false;
  if (!(await canDisplayImageSourceWithRetry(desiredSrc))) {
    const fallbackSource = String(desiredState.src || sourceFallback).trim();
    desiredSrc = (fallbackSource && await canDisplayImageSourceWithRetry(fallbackSource))
      ? fallbackSource
      : String(foundry.utils.getProperty(tokenDocument, "texture.src") || tokenDocument?.img || "").trim();
  }
  if (!desiredSrc) return false;

  const currentSrc = String(foundry.utils.getProperty(tokenDocument, "texture.src") || tokenDocument?.img || "").trim();
  const currentScaleX = normalizeTokenScale(foundry.utils.getProperty(tokenDocument, "texture.scaleX"), 1);
  const currentScaleY = normalizeTokenScale(foundry.utils.getProperty(tokenDocument, "texture.scaleY"), 1);
  const currentOffsetX = normalizeTokenOffset(foundry.utils.getProperty(tokenDocument, "texture.offsetX"), 0);
  const currentOffsetY = normalizeTokenOffset(foundry.utils.getProperty(tokenDocument, "texture.offsetY"), 0);
  const currentFit = String(foundry.utils.getProperty(tokenDocument, "texture.fit") || "").trim() || TOKEN_TEXTURE_FIT;

  const epsilon = 0.0001;
  const needsUpdate = currentSrc !== desiredSrc
    || Math.abs(currentScaleX - 1) > epsilon
    || Math.abs(currentScaleY - 1) > epsilon
    || Math.abs(currentOffsetX - 0) > epsilon
    || Math.abs(currentOffsetY - 0) > epsilon
    || currentFit !== TOKEN_TEXTURE_FIT;
  if (!needsUpdate) return false;

  const nextFlagState = {
    src: desiredState.src,
    tokenSrc: desiredSrc,
    scaleX: desiredState.scaleX,
    scaleY: desiredState.scaleY,
    offsetX: desiredState.offsetX,
    offsetY: desiredState.offsetY,
    lockScale: desiredState.lockScale
  };
  const updateData = buildTokenTextureUpdateData(desiredSrc, TOKEN_TEXTURE_FIT, nextFlagState);
  if (!updateData) return false;

  const updatedDoc = await tokenDocument.update(
    updateData,
    {
      bloodmanSkipActorImageSync: true
    }
  ).catch(() => null);
  return Boolean(updatedDoc);
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

function getCurrentViewedScene() {
  return canvas?.scene || game.scenes?.current || null;
}

function getNextTileHiddenState(scene) {
  const previousState = scene?.getFlag?.(MODULE_ID, TILE_VISIBILITY_STATE_FLAG);
  if (typeof previousState !== "boolean") return false; // First click: show all tiles.
  return !previousState;
}

async function toggleCurrentSceneTilesVisibility() {
  if (!game.user?.isGM) {
    ui.notifications?.warn(t("BJD.Notify.GMOnly", "Seul un GM peut modifier la visibilite de toutes les tuiles."));
    return null;
  }

  const scene = getCurrentViewedScene();
  if (!scene) {
    ui.notifications?.warn(t("BJD.Notify.NoActiveScene", "Aucune scene active trouvee."));
    return null;
  }

  const tileDocs = scene.tiles?.contents || [];
  const targetHidden = getNextTileHiddenState(scene);

  const updates = tileDocs
    .filter(tile => Boolean(tile.hidden) !== targetHidden)
    .map(tile => ({
      _id: tile.id,
      hidden: targetHidden
    }));

  if (updates.length > 0) {
    // Batch document updates keep Foundry sync and history behavior for scene changes.
    await scene.updateEmbeddedDocuments("Tile", updates);
  }

  await scene.setFlag(MODULE_ID, TILE_VISIBILITY_STATE_FLAG, targetHidden);

  const notificationKey = targetHidden ? "BJD.Notify.TilesHidden" : "BJD.Notify.TilesShown";
  const fallback = targetHidden
    ? "Toutes les tuiles de la scene sont maintenant cachees."
    : "Toutes les tuiles de la scene sont maintenant visibles.";
  ui.notifications?.info(t(notificationKey, fallback));

  return {
    sceneId: scene.id,
    hidden: targetHidden,
    totalTiles: tileDocs.length,
    updatedTiles: updates.length
  };
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

function registerModuleSettings() {
  game.settings.register(MODULE_ID, SETTING_ENABLE_TOKEN_RESIZE, {
    name: t("BJD.Settings.TokenResize.Name", "Redimensionnement de token"),
    hint: t(
      "BJD.Settings.TokenResize.Hint",
      "Cliquez le portrait pour ouvrir la fenetre d'ajustement. Utilisez l'icone image dans la fenetre pour ouvrir le Finder."
    ),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      clearTokenResizeOverlay();
      refreshOpenActorSheetsForTokenResize();
    }
  });

  game.settings.register(MODULE_ID, SETTING_ENABLE_GM_MACRO, {
    name: t("BJD.Settings.EnableGmMacro.Name", "Activer la macro automatique du destin"),
    hint: t("BJD.Settings.EnableGmMacro.Hint", "Cree ou met a jour la macro et l'attribue automatiquement au slot configure."),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: async () => {
      if (!game.ready || !game.user?.isGM) return;
      await ensureGmHotbarMacro({ forceTargetSlot: true });
    }
  });

  game.settings.register(MODULE_ID, SETTING_GM_MACRO_SLOT, {
    name: t("BJD.Settings.GmMacroSlot.Name", "Slot de la macro GM"),
    hint: t("BJD.Settings.GmMacroSlot.Hint", "Numero de slot (1 a 50) dans la hotbar GM pour attribuer la macro."),
    scope: "world",
    config: true,
    type: Number,
    default: GM_MACRO_SLOT_DEFAULT,
    onChange: async () => {
      if (!game.ready || !game.user?.isGM) return;
      await ensureGmHotbarMacro({ forceTargetSlot: true });
    }
  });

  game.settings.register(MODULE_ID, SETTING_ENABLE_TILE_MACRO, {
    name: t("BJD.Settings.EnableTileMacro.Name", "Activer la macro de visibilite des tuiles"),
    hint: t("BJD.Settings.EnableTileMacro.Hint", "Cree ou met a jour automatiquement la macro de toggle des tuiles et l'assigne a la hotbar du GM."),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: async () => {
      if (!game.ready || !game.user?.isGM) return;
      await ensureTileVisibilityHotbarMacro({ forceTargetSlot: true });
    }
  });

  game.settings.register(MODULE_ID, SETTING_TILE_MACRO_SLOT, {
    name: t("BJD.Settings.TileMacroSlot.Name", "Slot hotbar macro tuiles"),
    hint: t("BJD.Settings.TileMacroSlot.Hint", "Choisir le slot de hotbar (1 a 50) pour la macro de toggle des tuiles."),
    scope: "world",
    config: true,
    type: Number,
    default: TILE_MACRO_SLOT_DEFAULT,
    onChange: async () => {
      if (!game.ready || !game.user?.isGM) return;
      await ensureTileVisibilityHotbarMacro({ forceTargetSlot: true });
    }
  });
}

function isGmMacroAutomationEnabled() {
  return Boolean(game.settings?.get?.(MODULE_ID, SETTING_ENABLE_GM_MACRO));
}

function getConfiguredGmMacroSlot() {
  const rawValue = Number(game.settings?.get?.(MODULE_ID, SETTING_GM_MACRO_SLOT));
  if (!Number.isFinite(rawValue)) return GM_MACRO_SLOT_DEFAULT;
  const normalized = Math.floor(rawValue);
  return Math.max(GM_MACRO_SLOT_MIN, Math.min(GM_MACRO_SLOT_MAX, normalized));
}

function isTileMacroAutomationEnabled() {
  return Boolean(game.settings?.get?.(MODULE_ID, SETTING_ENABLE_TILE_MACRO));
}

function getConfiguredTileMacroSlot() {
  const rawValue = Number(game.settings?.get?.(MODULE_ID, SETTING_TILE_MACRO_SLOT));
  if (!Number.isFinite(rawValue)) return TILE_MACRO_SLOT_DEFAULT;
  const normalized = Math.floor(rawValue);
  return Math.max(GM_MACRO_SLOT_MIN, Math.min(GM_MACRO_SLOT_MAX, normalized));
}

async function clearUserHotbarSlots(slotNumbers = []) {
  const user = game.user;
  if (!user) return;

  const normalizedSlots = [...new Set(
    slotNumbers
      .map(value => Number(value))
      .filter(value => Number.isInteger(value) && value >= GM_MACRO_SLOT_MIN)
  )];
  if (normalizedSlots.length === 0) return;

  const hotbar = foundry.utils.deepClone(user.hotbar || {});
  let changed = false;
  for (const slot of normalizedSlots) {
    if (hotbar[slot] !== undefined) {
      delete hotbar[slot];
      changed = true;
    }
  }
  if (!changed) return;

  await user.update({ hotbar });
}

function getAssignedMacroSlots(macroId) {
  const id = String(macroId || "").trim();
  if (!id) return [];

  return Object.entries(game.user?.hotbar || {})
    .filter(([, assignedMacroId]) => String(assignedMacroId || "").trim() === id)
    .map(([slot]) => Number(slot))
    .filter(slot => Number.isInteger(slot) && slot >= GM_MACRO_SLOT_MIN);
}

async function detachManagedMacroFromHotbar() {
  const macro = findManagedJetDestinMacro();
  const macroId = String(macro?.id || "").trim();
  if (!macroId) return;

  const slotsToClear = getAssignedMacroSlots(macroId);

  await clearUserHotbarSlots(slotsToClear);
}

function findManagedJetDestinMacro() {
  const macros = game.macros?.contents || [];
  const byFlag = macros.find(macro => macro.getFlag(MODULE_ID, GM_MACRO_FLAG) === true);
  if (byFlag) return byFlag;

  return macros.find(macro => (
    macro?.type === "script"
    && macro?.name === GM_MACRO_NAME
    && String(macro?.command || "").includes(`game.modules.get("${MODULE_ID}")`)
  ));
}

async function getOrCreateJetDestinMacro() {
  let macro = findManagedJetDestinMacro();
  if (macro) {
    const updates = {};
    if (macro.name !== GM_MACRO_NAME) updates.name = GM_MACRO_NAME;
    if (macro.command !== GM_MACRO_COMMAND) updates.command = GM_MACRO_COMMAND;
    if (macro.img !== GM_MACRO_ICON) updates.img = GM_MACRO_ICON;
    if (Object.keys(updates).length > 0) {
      macro = await macro.update(updates);
    }

    if (macro.getFlag(MODULE_ID, GM_MACRO_FLAG) !== true) {
      await macro.setFlag(MODULE_ID, GM_MACRO_FLAG, true);
    }
    return macro;
  }

  return Macro.create({
    name: GM_MACRO_NAME,
    type: "script",
    img: GM_MACRO_ICON,
    command: GM_MACRO_COMMAND,
    flags: {
      [MODULE_ID]: {
        [GM_MACRO_FLAG]: true
      }
    }
  });
}

async function detachManagedTileMacroFromHotbar() {
  const macro = findManagedTileVisibilityMacro();
  const macroId = String(macro?.id || "").trim();
  if (!macroId) return;

  const slotsToClear = getAssignedMacroSlots(macroId);
  await clearUserHotbarSlots(slotsToClear);
}

function findManagedTileVisibilityMacro() {
  const macros = game.macros?.contents || [];
  const byFlag = macros.find(macro => macro.getFlag(MODULE_ID, TILE_MACRO_FLAG) === true);
  if (byFlag) return byFlag;

  return macros.find(macro => (
    macro?.type === "script"
    && macro?.name === TILE_MACRO_NAME
    && String(macro?.command || "").includes(`game.modules.get("${MODULE_ID}")`)
    && String(macro?.command || "").includes("toggleCurrentSceneTilesVisibility")
  ));
}

async function getOrCreateTileVisibilityMacro() {
  let macro = findManagedTileVisibilityMacro();
  if (macro) {
    const updates = {};
    if (macro.name !== TILE_MACRO_NAME) updates.name = TILE_MACRO_NAME;
    if (macro.command !== TILE_MACRO_COMMAND) updates.command = TILE_MACRO_COMMAND;
    if (macro.img !== TILE_MACRO_ICON) updates.img = TILE_MACRO_ICON;
    if (Object.keys(updates).length > 0) {
      macro = await macro.update(updates);
    }

    if (macro.getFlag(MODULE_ID, TILE_MACRO_FLAG) !== true) {
      await macro.setFlag(MODULE_ID, TILE_MACRO_FLAG, true);
    }
    return macro;
  }

  return Macro.create({
    name: TILE_MACRO_NAME,
    type: "script",
    img: TILE_MACRO_ICON,
    command: TILE_MACRO_COMMAND,
    flags: {
      [MODULE_ID]: {
        [TILE_MACRO_FLAG]: true
      }
    }
  });
}

async function ensureGmHotbarMacro(options = {}) {
  if (!game.user?.isGM) return;
  const forceTargetSlot = Boolean(options.forceTargetSlot);

  try {
    if (!isGmMacroAutomationEnabled()) {
      await detachManagedMacroFromHotbar();
      return;
    }

    const macro = await getOrCreateJetDestinMacro();
    if (!macro) return;

    const targetSlot = getConfiguredGmMacroSlot();
    const macroId = String(macro.id || "").trim();
    const assignedSlots = getAssignedMacroSlots(macroId);

    if (!forceTargetSlot && assignedSlots.length > 0 && !assignedSlots.includes(targetSlot)) {
      const currentSlot = assignedSlots[0];
      if (currentSlot !== targetSlot) {
        await game.settings.set(MODULE_ID, SETTING_GM_MACRO_SLOT, currentSlot);
      }
      return;
    }

    const slotsToClear = assignedSlots.filter(slot => slot !== targetSlot);
    await clearUserHotbarSlots(slotsToClear);

    const currentSlotMacroId = String(game.user?.hotbar?.[targetSlot] || "").trim();
    if (currentSlotMacroId === macroId) return;

    await game.user.assignHotbarMacro(macro, targetSlot);
  } catch (error) {
    console.error(`[${MODULE_ID}] failed to ensure GM hotbar macro`, error);
  }
}

async function ensureTileVisibilityHotbarMacro(options = {}) {
  if (!game.user?.isGM) return;
  const forceTargetSlot = Boolean(options.forceTargetSlot);

  try {
    if (!isTileMacroAutomationEnabled()) {
      await detachManagedTileMacroFromHotbar();
      return;
    }

    const macro = await getOrCreateTileVisibilityMacro();
    if (!macro) return;

    const targetSlot = getConfiguredTileMacroSlot();
    const macroId = String(macro.id || "").trim();
    const assignedSlots = getAssignedMacroSlots(macroId);

    if (!forceTargetSlot && assignedSlots.length > 0 && !assignedSlots.includes(targetSlot)) {
      const currentSlot = assignedSlots[0];
      if (currentSlot !== targetSlot) {
        await game.settings.set(MODULE_ID, SETTING_TILE_MACRO_SLOT, currentSlot);
      }
      return;
    }

    const slotsToClear = assignedSlots.filter(slot => slot !== targetSlot);
    await clearUserHotbarSlots(slotsToClear);

    const currentSlotMacroId = String(game.user?.hotbar?.[targetSlot] || "").trim();
    if (currentSlotMacroId === macroId) return;

    await game.user.assignHotbarMacro(macro, targetSlot);
  } catch (error) {
    console.error(`[${MODULE_ID}] failed to ensure tile visibility hotbar macro`, error);
  }
}

Hooks.once("init", () => {
  registerModuleSettings();

  const api = {
    rollJetDestin,
    emitVoyanceOverlayRequest,
    showVoyanceOverlay,
    handleVoyanceOverlayRequest,
    toggleCurrentSceneTilesVisibility
  };

  const module = game.modules?.get?.(MODULE_ID);
  if (module) module.api = api;
  globalThis.bloodmanJetDestin = api;
});

Hooks.once("ready", async () => {
  registerSocketHandler();
  await ensureGmHotbarMacro();
  await ensureTileVisibilityHotbarMacro();
});

Hooks.on("renderActorSheet", (app, html) => {
  bindTokenResizeToActorSheet(app, html);
});

Hooks.on("canvasReady", async () => {
  if (!isTokenResizeEnabled()) return;
  for (const token of canvas?.tokens?.placeables || []) {
    try {
      await applyStoredTokenResizeToTokenDocument(token?.document || token);
    } catch (error) {
      console.warn(`[${MODULE_ID}] failed to apply stored token resize on canvasReady`, error);
    }
  }
});

Hooks.on("createToken", async tokenDoc => {
  if (!isTokenResizeEnabled()) return;
  try {
    await applyStoredTokenResizeToTokenDocument(tokenDoc);
  } catch (error) {
    console.warn(`[${MODULE_ID}] failed to apply stored token resize on createToken`, error);
  }
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
  handleVoyanceOverlayRequest,
  toggleCurrentSceneTilesVisibility
};

