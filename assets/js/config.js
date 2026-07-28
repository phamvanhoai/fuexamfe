const DEFAULT_FOOTER_NAME = "FUEXAMFE";
const FOOTER_STORAGE_KEY = "fuexamfe.footerName";
const EXPORT_NAME_STORAGE_KEY = "fuexamfe.exportName";
const SUBJECT_CODE_STORAGE_KEY = "fuexamfe.subjectCode";
const QUESTION_FONT_SCALE_STORAGE_KEY = "fuexamfe.questionFontScale";
const GEMINI_KEY_STORAGE_KEY = "fuexamfe.geminiApiKey";
const GEMINI_MODEL_STORAGE_KEY = "fuexamfe.geminiModel";
const IMPORT_ANSWER_MODE_STORAGE_KEY = "fuexamfe.importAnswerMode";
const ANSWER_CONTROLS_STORAGE_KEY = "fuexamfe.answerControls";
const PDF_ENGINE_STORAGE_KEY = "fuexamfe.pdfEngine";
const IMAGE_ENGINE_STORAGE_KEY = "fuexamfe.imageEngine";
const DEFAULT_QUESTION_FONT_SCALE = 100;
const MIN_QUESTION_FONT_SCALE = 60;
const MAX_QUESTION_FONT_SCALE = 135;
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-3-flash-preview"];
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TESSERACT_PATHS = {
  workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
  corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5",
  langPath: "https://tessdata.projectnaptha.com/4.0.0",
};
let currentOcrLabel = "";

function loadFooterName() {
  try {
    return localStorage.getItem(FOOTER_STORAGE_KEY) || DEFAULT_FOOTER_NAME;
  } catch {
    return DEFAULT_FOOTER_NAME;
  }
}

function loadSetting(key, fallback = "") {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function hasStoredSetting(key) {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function normalizeQuestionFontScale(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_QUESTION_FONT_SCALE;
  return Math.min(MAX_QUESTION_FONT_SCALE, Math.max(MIN_QUESTION_FONT_SCALE, Math.round(number)));
}

const state = {
  questions: [],
  filtered: [],
  current: 0,
  fileName: "",
  pageCount: 0,
  footer: loadFooterName(),
  exportName: loadSetting(EXPORT_NAME_STORAGE_KEY, "questions"),
  subjectCode: loadSetting(SUBJECT_CODE_STORAGE_KEY, ""),
  questionFontScale: normalizeQuestionFontScale(loadSetting(QUESTION_FONT_SCALE_STORAGE_KEY, DEFAULT_QUESTION_FONT_SCALE)),
  importAnswerMode: loadSetting(IMPORT_ANSWER_MODE_STORAGE_KEY, "keep"),
  showAnswerControls: loadSetting(ANSWER_CONTROLS_STORAGE_KEY, "show") !== "hide",
  pdfEngine: loadSetting(PDF_ENGINE_STORAGE_KEY, "auto"),
  imageEngine: loadSetting(IMAGE_ENGINE_STORAGE_KEY, "gemini"),
  geminiApiKey: loadSetting(GEMINI_KEY_STORAGE_KEY, ""),
  geminiModel: loadSetting(GEMINI_MODEL_STORAGE_KEY, DEFAULT_GEMINI_MODEL),
  busy: false,
};

const els = {
  app: document.querySelector(".app-shell"),
  pdfInput: document.querySelector("#pdfInput"),
  imageInput: document.querySelector("#imageInput"),
  fileName: document.querySelector("#fileName"),
  questionCount: document.querySelector("#questionCount"),
  questionList: document.querySelector("#questionList"),
  questionMount: document.querySelector("#questionMount"),
  emptyState: document.querySelector("#emptyState"),
  searchInput: document.querySelector("#searchInput"),
  answerInput: document.querySelector("#answerInput"),
  kindInput: document.querySelector("#kindInput"),
  footerInput: document.querySelector("#footerInput"),
  resetFooterBtn: document.querySelector("#resetFooterBtn"),
  exportNameInput: document.querySelector("#exportNameInput"),
  subjectCodeInput: document.querySelector("#subjectCodeInput"),
  fontScaleInput: document.querySelector("#fontScaleInput"),
  fontScaleNumberInput: document.querySelector("#fontScaleNumberInput"),
  resetFontScaleBtn: document.querySelector("#resetFontScaleBtn"),
  importAnswerModeInput: document.querySelector("#importAnswerModeInput"),
  answerControlsInput: document.querySelector("#answerControlsInput"),
  pdfEngineInput: document.querySelector("#pdfEngineInput"),
  imageEngineInput: document.querySelector("#imageEngineInput"),
  geminiKeyInput: document.querySelector("#geminiKeyInput"),
  geminiModelInput: document.querySelector("#geminiModelInput"),
  saveGeminiBtn: document.querySelector("#saveGeminiBtn"),
  loadGeminiModelsBtn: document.querySelector("#loadGeminiModelsBtn"),
  stemInput: document.querySelector("#stemInput"),
  optionsInput: document.querySelector("#optionsInput"),
  applyEditBtn: document.querySelector("#applyEditBtn"),
  cropImageBtn: document.querySelector("#cropImageBtn"),
  addQuestionBtn: document.querySelector("#addQuestionBtn"),
  deleteQuestionBtn: document.querySelector("#deleteQuestionBtn"),
  clearQuestionsBtn: document.querySelector("#clearQuestionsBtn"),
  exportPngBtn: document.querySelector("#exportPngBtn"),
  exportJpgBtn: document.querySelector("#exportJpgBtn"),
  exportTextBtn: document.querySelector("#exportTextBtn"),
  exportZipBtn: document.querySelector("#exportZipBtn"),
  exportPdfBtn: document.querySelector("#exportPdfBtn"),
  currentIndex: document.querySelector("#currentIndex"),
  pageCount: document.querySelector("#pageCount"),
  parsedCount: document.querySelector("#parsedCount"),
  toast: document.querySelector("#toast"),
  exportSandbox: document.querySelector("#exportSandbox"),
  cropModal: document.querySelector("#cropModal"),
  cropStage: document.querySelector("#cropStage"),
  cropSourceImage: document.querySelector("#cropSourceImage"),
  cropSelection: document.querySelector("#cropSelection"),
  closeCropBtn: document.querySelector("#closeCropBtn"),
  cancelCropBtn: document.querySelector("#cancelCropBtn"),
  saveCropBtn: document.querySelector("#saveCropBtn"),
};

