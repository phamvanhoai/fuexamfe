function loadFooterName() {
  try {
    return localStorage.getItem(FOOTER_STORAGE_KEY) || DEFAULT_FOOTER_NAME;
  } catch {
    return DEFAULT_FOOTER_NAME;
  }
}

function setFooterName(value) {
  state.footer = String(value || "").trim() || DEFAULT_FOOTER_NAME;
  try {
    localStorage.setItem(FOOTER_STORAGE_KEY, state.footer);
  } catch {
    // Ignore storage failures in private or restricted browser modes.
  }
}

function setExportName(value) {
  state.exportName = slugify(value || "questions").slice(0, 48) || "questions";
  els.exportNameInput.value = state.exportName;
  saveSetting(EXPORT_NAME_STORAGE_KEY, state.exportName);
}

async function loadGeminiEnvConfig() {
  try {
    const response = await fetch(`.env?_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;

    const env = parseEnv(await response.text());
    if (env.GEMINI_API_KEY && !hasStoredSetting(GEMINI_KEY_STORAGE_KEY) && !isPlaceholderValue(env.GEMINI_API_KEY)) {
      state.geminiApiKey = env.GEMINI_API_KEY;
    }
    if (env.GEMINI_MODEL && !hasStoredSetting(GEMINI_MODEL_STORAGE_KEY)) {
      state.geminiModel = env.GEMINI_MODEL;
    }
    if (env.IMPORT_ANSWER_MODE && !hasStoredSetting(IMPORT_ANSWER_MODE_STORAGE_KEY)) {
      state.importAnswerMode = env.IMPORT_ANSWER_MODE === "blank" ? "blank" : "keep";
    }
    if (env.PDF_ENGINE && !hasStoredSetting(PDF_ENGINE_STORAGE_KEY)) {
      state.pdfEngine = ["auto", "gemini", "text"].includes(env.PDF_ENGINE) ? env.PDF_ENGINE : "auto";
    }
    if (env.IMAGE_ENGINE && !hasStoredSetting(IMAGE_ENGINE_STORAGE_KEY)) {
      state.imageEngine = env.IMAGE_ENGINE === "tesseract" ? "tesseract" : "gemini";
    }
    syncGeminiInputs();
    showToast("Đã đọc cấu hình Gemini từ .env");
  } catch {
    // Opening index.html directly can block fetch('.env'); manual input still works.
  }
}

function parseEnv(text) {
  return String(text || "")
    .split(/\r?\n/)
    .reduce((values, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return values;
      const index = trimmed.indexOf("=");
      if (index === -1) return values;

      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      value = value.replace(/^['"]|['"]$/g, "");
      values[key] = value;
      return values;
    }, {});
}

function isPlaceholderValue(value) {
  return /your_|placeholder|api_key_here/i.test(String(value || ""));
}

function syncGeminiInputs() {
  els.importAnswerModeInput.value = state.importAnswerMode;
  els.pdfEngineInput.value = state.pdfEngine;
  els.imageEngineInput.value = state.imageEngine;
  els.geminiKeyInput.value = state.geminiApiKey;
  ensureGeminiModelOption(state.geminiModel || DEFAULT_GEMINI_MODEL);
  els.geminiModelInput.value = state.geminiModel || DEFAULT_GEMINI_MODEL;
}

function ensureGeminiModelOption(model) {
  if (!model) return;
  const exists = [...els.geminiModelInput.options].some((option) => option.value === model);
  if (exists) return;

  const option = document.createElement("option");
  option.value = model;
  option.textContent = model;
  els.geminiModelInput.append(option);
}

function handlePdfEngineChange() {
  state.pdfEngine = ["auto", "gemini", "text"].includes(els.pdfEngineInput.value)
    ? els.pdfEngineInput.value
    : "auto";
  saveSetting(PDF_ENGINE_STORAGE_KEY, state.pdfEngine);
  showToast(`Engine PDF: ${els.pdfEngineInput.options[els.pdfEngineInput.selectedIndex].textContent}`);
}

function handleImageEngineChange() {
  state.imageEngine = els.imageEngineInput.value === "tesseract" ? "tesseract" : "gemini";
  saveSetting(IMAGE_ENGINE_STORAGE_KEY, state.imageEngine);
  showToast(state.imageEngine === "gemini" ? "Import ảnh sẽ dùng Gemini" : "Import ảnh sẽ dùng Tesseract");
}

function saveGeminiSettings() {
  state.pdfEngine = ["auto", "gemini", "text"].includes(els.pdfEngineInput.value)
    ? els.pdfEngineInput.value
    : "auto";
  state.imageEngine = els.imageEngineInput.value === "tesseract" ? "tesseract" : "gemini";
  state.geminiApiKey = els.geminiKeyInput.value.trim();
  state.geminiModel = els.geminiModelInput.value.trim() || DEFAULT_GEMINI_MODEL;

  saveSetting(PDF_ENGINE_STORAGE_KEY, state.pdfEngine);
  saveSetting(IMAGE_ENGINE_STORAGE_KEY, state.imageEngine);
  saveSetting(GEMINI_MODEL_STORAGE_KEY, state.geminiModel);
  saveSetting(GEMINI_KEY_STORAGE_KEY, state.geminiApiKey);
  syncGeminiInputs();
  showToast("Đã lưu cấu hình AI");
}

async function loadGeminiModelsFromApi() {
  state.geminiApiKey = els.geminiKeyInput.value.trim() || state.geminiApiKey;
  if (!state.geminiApiKey) {
    showToast("Nhập API key trước khi tải model");
    return;
  }

  saveSetting(GEMINI_KEY_STORAGE_KEY, state.geminiApiKey);
  setBusy(true);
  try {
    showToast("Đang tải danh sách model...");
    const response = await fetch(`${GEMINI_API_BASE}?key=${encodeURIComponent(state.geminiApiKey)}`, {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw createGeminiError(payload?.error?.message || `HTTP ${response.status}`, response.status, payload);
    }

    const models = (payload.models || [])
      .filter((model) => (model.supportedGenerationMethods || []).includes("generateContent"))
      .map((model) => ({
        code: String(model.name || "").replace(/^models\//, ""),
        label: model.displayName || String(model.name || "").replace(/^models\//, ""),
      }))
      .filter((model) => model.code && !/embedding|tts|imagen|veo|lyria/i.test(model.code));

    replaceGeminiModelOptions(models);
    const currentExists = models.some((model) => model.code === state.geminiModel);
    if (!currentExists && models.length) {
      state.geminiModel = models[0].code;
      saveSetting(GEMINI_MODEL_STORAGE_KEY, state.geminiModel);
    }
    syncGeminiInputs();
    showToast(`Đã tải ${models.length} model khả dụng`);
  } catch (error) {
    console.warn(error);
    showToast(`Không tải được model: ${error.message || "lỗi không xác định"}`);
  } finally {
    setBusy(false);
  }
}

function replaceGeminiModelOptions(models) {
  if (!models.length) return;

  els.geminiModelInput.textContent = "";
  for (const model of models) {
    const option = document.createElement("option");
    option.value = model.code;
    option.textContent = model.label === model.code ? model.code : `${model.label} (${model.code})`;
    els.geminiModelInput.append(option);
  }
}

function saveSetting(key, value) {
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures in private or restricted browser modes.
  }
}

function sanitizeAnswer(value) {
  return [...new Set(String(value || "").toUpperCase().replace(/[^A-H]/g, "").split(""))]
    .sort()
    .join("");
}

function normalizeForSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function updateActionButtons() {
  const disabled = !state.questions.length || state.busy;
  [
    els.exportPngBtn,
    els.exportJpgBtn,
    els.exportTextBtn,
    els.exportZipBtn,
    els.exportPdfBtn,
    els.applyEditBtn,
    els.deleteQuestionBtn,
    els.clearQuestionsBtn,
  ].forEach((element) => {
    element.disabled = disabled;
  });

  els.answerInput.disabled = state.busy;
  els.kindInput.disabled = state.busy;
  els.stemInput.disabled = state.busy;
  els.optionsInput.disabled = state.busy;
  els.addQuestionBtn.disabled = state.busy;
  els.footerInput.disabled = state.busy;
  els.resetFooterBtn.disabled = state.busy;
  els.exportNameInput.disabled = state.busy;
  els.importAnswerModeInput.disabled = state.busy;
  els.pdfEngineInput.disabled = state.busy;
  els.imageEngineInput.disabled = state.busy;
  els.geminiKeyInput.disabled = state.busy;
  els.geminiModelInput.disabled = state.busy;
  els.saveGeminiBtn.disabled = state.busy;
  els.loadGeminiModelsBtn.disabled = state.busy;
  els.pdfInput.disabled = state.busy;
  els.imageInput.disabled = state.busy;
}

function setBusy(busy) {
  state.busy = busy;
  document.body.classList.toggle("busy", busy);
  updateActionButtons();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2200);
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
