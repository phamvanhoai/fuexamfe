const DEFAULT_FOOTER_NAME = "FUEXAMFE";
const FOOTER_STORAGE_KEY = "fuexamfe.footerName";

const state = {
  questions: [],
  filtered: [],
  current: 0,
  fileName: "",
  pageCount: 0,
  footer: loadFooterName(),
  busy: false,
};

const els = {
  app: document.querySelector(".app-shell"),
  pdfInput: document.querySelector("#pdfInput"),
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
  stemInput: document.querySelector("#stemInput"),
  applyEditBtn: document.querySelector("#applyEditBtn"),
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
};

function init() {
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  els.pdfInput.addEventListener("change", handleFileSelect);
  els.searchInput.addEventListener("input", renderQuestionList);
  els.applyEditBtn.addEventListener("click", applyEditorChanges);
  els.footerInput.addEventListener("input", handleFooterChange);
  els.resetFooterBtn.addEventListener("click", resetFooterName);
  els.exportPngBtn.addEventListener("click", () => exportCurrentImage("png"));
  els.exportJpgBtn.addEventListener("click", () => exportCurrentImage("jpeg"));
  els.exportTextBtn.addEventListener("click", exportAllText);
  els.exportZipBtn.addEventListener("click", exportAllImagesZip);
  els.exportPdfBtn.addEventListener("click", exportAllPdf);

  render();
  refreshIcons();
}

async function handleFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!window.pdfjsLib) {
    showToast("Không tải được PDF.js");
    return;
  }

  setBusy(true);
  try {
    showToast("Đang đọc PDF...");
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent({ normalizeWhitespace: true });
      pages.push(extractPageText(textContent.items));
    }

    const rawText = pages.join("\n\n");
    const questions = parseQuestions(rawText);

    state.questions = questions.length ? questions : [fallbackQuestion(rawText)];
    state.filtered = [];
    state.current = 0;
    state.fileName = file.name;
    state.pageCount = pdf.numPages;

    els.fileName.textContent = file.name;
    showToast(`Đã tách ${state.questions.length} câu hỏi`);
    render();
  } catch (error) {
    console.error(error);
    showToast("Không đọc được PDF này");
  } finally {
    setBusy(false);
    event.target.value = "";
  }
}

function extractPageText(items) {
  const rows = [];
  const tolerance = 3;

  for (const item of items) {
    const text = String(item.str || "").trim();
    if (!text) continue;

    const transform = item.transform || [0, 0, 0, 0, 0, 0];
    const x = Number(transform[4] || 0);
    const y = Number(transform[5] || 0);
    let row = rows.find((entry) => Math.abs(entry.y - y) <= tolerance);

    if (!row) {
      row = { y, tokens: [] };
      rows.push(row);
    }

    row.tokens.push({ x, text });
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) =>
      row.tokens
        .sort((a, b) => a.x - b.x)
        .map((token) => token.text)
        .join(" ")
        .replace(/\s+([,.;:%!?])/g, "$1")
        .replace(/\s{2,}/g, " ")
        .trim()
    )
    .filter(Boolean)
    .join("\n");
}

function parseQuestions(rawText) {
  const text = normalizeText(rawText);
  const answerKey = parseAnswerKey(text);
  const matcher = /(?:^|\n)\s*(\d{1,3})\.\s*(?:\(([^)]*answer[^)]*)\))?/gi;
  const matches = [...text.matchAll(matcher)];
  const questions = [];

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const next = matches[i + 1];
    const number = Number(match[1]);
    const kind = normalizeKind(match[2] || "Choose 1 answer");
    const start = match.index + match[0].length;
    const end = next ? next.index : text.length;
    const block = text.slice(start, end).trim();
    const inlineAnswer = parseInlineAnswer(block);
    const cleanBlock = stripAnswerLines(block);
    const parsed = parseQuestionBlock(cleanBlock);
    const answer = sanitizeAnswer(inlineAnswer || answerKey.get(number) || "");

    if (!parsed.stem && parsed.options.length === 0) continue;

    questions.push({
      number,
      kind,
      type: "Multiple Choice",
      stem: parsed.stem || `Câu ${number}`,
      options: parsed.options,
      answer,
    });
  }

  return questions;
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n")
    .trim();
}

function parseAnswerKey(text) {
  const key = new Map();
  const lines = text.split("\n");
  let inKeySection = false;
  let sawQuestionHeader = false;

  for (const line of lines) {
    const plain = normalizeForSearch(line);
    const isFormatLine =
      plain.includes("format") || plain.includes("trac nghiem") || plain.includes("nhieu dap an");
    const hasKeyTitle =
      plain.includes("dap an") || plain.includes("answer key") || /\banswers\b/.test(plain);
    const pairMatches = [
      ...line.matchAll(/(?:^|[\s,;|])(\d{1,3})\s*[\).:\-]?\s*([A-H]{1,8})(?=$|[\s,;|])/gi),
    ];

    if (/^\s*\d{1,3}\.\s*(?:\(|$)/.test(line)) {
      sawQuestionHeader = true;
    }

    if (hasKeyTitle && sawQuestionHeader && !isFormatLine) {
      inKeySection = true;
    }

    if ((!inKeySection && !hasKeyTitle) || isFormatLine) continue;

    for (const match of pairMatches) {
      key.set(Number(match[1]), sanitizeAnswer(match[2]));
    }
  }

  return key;
}

function parseInlineAnswer(text) {
  const match = text.match(/(?:đáp\s*án|answer|correct\s*answer)\s*[:：]\s*([A-H]{1,8})/i);
  return match ? match[1] : "";
}

function stripAnswerLines(text) {
  return text
    .split("\n")
    .filter((line) => !/^\s*(?:đáp\s*án|answer|correct\s*answer)\s*[:：]/i.test(line))
    .join("\n")
    .trim();
}

function parseQuestionBlock(block) {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const markers = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^([A-H])\s*[\).]\s*(.*)$/i);
    if (match) {
      markers.push({
        index: i,
        label: match[1].toUpperCase(),
        firstLine: match[2] || "",
      });
    }
  }

  if (!markers.length) {
    return {
      stem: cleanParagraph(lines.join(" ")),
      options: [],
    };
  }

  const firstOptionIndex = markers[0].index;
  const stem = cleanParagraph(lines.slice(0, firstOptionIndex).join(" "));
  const options = [];
  const seen = new Set();

  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i];
    const nextMarker = markers[i + 1];
    const end = nextMarker ? nextMarker.index : lines.length;
    const contentLines = [marker.firstLine, ...lines.slice(marker.index + 1, end)];
    const text = cleanParagraph(contentLines.join(" "));

    if (seen.has(marker.label)) continue;
    if (!text && markers.some((entry) => entry.label === marker.label && entry.index < marker.index)) continue;

    seen.add(marker.label);
    options.push({
      label: marker.label,
      text,
    });
  }

  return { stem, options };
}

function cleanParagraph(text) {
  return String(text || "")
    .replace(/\s+([,.;:%!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeKind(kind) {
  const cleaned = cleanParagraph(kind || "");
  if (/many|multiple|nhiều/i.test(cleaned) && !/choice/i.test(cleaned)) {
    return "Choose many answers";
  }
  return cleaned || "Choose 1 answer";
}

function fallbackQuestion(text) {
  return {
    number: 1,
    kind: "Choose 1 answer",
    type: "Multiple Choice",
    stem: cleanParagraph(text).slice(0, 5000) || "Không có nội dung",
    options: [],
    answer: "",
  };
}

function render() {
  const hasQuestions = state.questions.length > 0;
  els.emptyState.hidden = hasQuestions;
  els.questionMount.hidden = !hasQuestions;
  els.pageCount.textContent = state.pageCount;
  els.parsedCount.textContent = state.questions.length;
  els.questionCount.textContent = state.questions.length;

  updateActionButtons();
  renderQuestionList();
  renderCurrentQuestion();
}

function renderQuestionList() {
  const keyword = normalizeForSearch(els.searchInput.value);
  const items = state.questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => {
      if (!keyword) return true;
      return normalizeForSearch(`${question.number} ${question.stem} ${question.answer}`).includes(keyword);
    });

  state.filtered = items.map((item) => item.index);
  els.questionList.textContent = "";

  for (const { question, index } of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = index === state.current ? "active" : "";
    button.innerHTML = `
      <strong>${escapeHtml(question.number)}</strong>
      <span>${escapeHtml(question.stem || "Không có nội dung")}</span>
      ${question.answer ? `<em>${escapeHtml(question.answer)}</em>` : ""}
    `;
    button.addEventListener("click", () => {
      state.current = index;
      renderCurrentQuestion();
      renderQuestionList();
    });
    els.questionList.append(button);
  }
}

function renderCurrentQuestion() {
  els.questionMount.textContent = "";
  const question = state.questions[state.current];

  if (!question) {
    els.currentIndex.textContent = "-";
    els.answerInput.value = "";
    els.footerInput.value = state.footer;
    els.stemInput.value = "";
    return;
  }

  els.questionMount.append(buildQuestionCard(question, { interactive: true }));
  els.currentIndex.textContent = `${state.current + 1}/${state.questions.length}`;
  els.answerInput.value = question.answer || "";
  els.kindInput.value = question.kind === "Choose many answers" ? "Choose many answers" : "Choose 1 answer";
  els.footerInput.value = state.footer;
  els.stemInput.value = question.stem || "";
  refreshIcons();
}

function buildQuestionCard(question, options = {}) {
  const interactive = Boolean(options.interactive);
  const exportMode = Boolean(options.exportMode);
  const card = document.createElement("article");
  card.className = `exam-shot${exportMode ? " export-shot" : ""}`;

  const labels = getChoiceLabels(question);
  const answerSet = new Set((question.answer || "").split(""));
  const choiceRows = question.options.length
    ? question.options
        .map((option) => {
          const correct = answerSet.has(option.label);
          return `
            <div class="choice-row${correct ? " correct" : ""}">
              <span class="letter">${escapeHtml(option.label)}</span>
              <span class="choice-text">${escapeHtml(option.text || "")}</span>
            </div>
          `;
        })
        .join("")
    : `<div class="choice-row"><span class="letter">A</span><span class="choice-text"></span></div>`;

  card.innerHTML = `
    <header class="shot-header">
      <h2>Câu ${escapeHtml(question.number)}</h2>
      <div class="badges">
        <span class="badge answer-kind">${escapeHtml(question.kind || "Choose 1 answer")}</span>
        <span class="badge question-kind">${escapeHtml(question.type || "Multiple Choice")}</span>
      </div>
    </header>
    <div class="shot-body">
      <aside class="answer-rail">
        ${labels
          .map(
            (label) => `
              <span class="answer-dot${answerSet.has(label) ? " correct" : ""}${interactive ? " interactive" : ""}" data-answer="${escapeHtml(label)}">${escapeHtml(label)}</span>
            `
          )
          .join("")}
        ${question.answer ? `<span class="answer-label">Đáp án: ${escapeHtml(question.answer)}</span>` : ""}
      </aside>
      <section class="question-content">
        <p class="question-text">${escapeHtml(question.stem || "")}</p>
        <div class="choices">${choiceRows}</div>
      </section>
    </div>
    <footer class="shot-footer">${escapeHtml(state.footer || DEFAULT_FOOTER_NAME)}</footer>
  `;

  if (interactive) {
    card.querySelectorAll(".answer-dot").forEach((dot) => {
      dot.addEventListener("click", () => toggleAnswer(dot.dataset.answer || ""));
    });
  }

  return card;
}

function getChoiceLabels(question) {
  if (question.options.length) return question.options.map((option) => option.label);
  const answerLabels = (question.answer || "").split("").filter(Boolean);
  return answerLabels.length ? answerLabels : ["A", "B", "C", "D"];
}

function toggleAnswer(label) {
  const question = state.questions[state.current];
  if (!question || !label) return;

  const current = sanitizeAnswer(question.answer);
  const multi = question.kind === "Choose many answers" || current.length > 1;

  if (multi) {
    const set = new Set(current.split(""));
    if (set.has(label)) {
      set.delete(label);
    } else {
      set.add(label);
    }
    question.answer = [...set].sort().join("");
  } else {
    question.answer = current === label ? "" : label;
  }

  renderCurrentQuestion();
  renderQuestionList();
}

function applyEditorChanges() {
  const question = state.questions[state.current];
  if (!question) return;

  question.answer = sanitizeAnswer(els.answerInput.value);
  question.kind = els.kindInput.value;
  question.stem = cleanParagraph(els.stemInput.value);
  setFooterName(els.footerInput.value);

  renderCurrentQuestion();
  renderQuestionList();
  showToast("Đã cập nhật câu hỏi");
}

function handleFooterChange() {
  setFooterName(els.footerInput.value);
  renderCurrentQuestion();
}

function resetFooterName() {
  setFooterName(DEFAULT_FOOTER_NAME);
  renderCurrentQuestion();
  showToast("Đã reset footer");
}

async function exportCurrentImage(type) {
  const question = state.questions[state.current];
  if (!question) return;

  setBusy(true);
  try {
    const canvas = await captureQuestion(question);
    const mime = type === "jpeg" ? "image/jpeg" : "image/png";
    const ext = type === "jpeg" ? "jpg" : "png";
    downloadDataUrl(canvas.toDataURL(mime, 0.94), `${makeBaseName()}_cau_${question.number}.${ext}`);
    showToast(`Đã xuất câu ${question.number}`);
  } catch (error) {
    console.error(error);
    showToast("Không xuất được ảnh");
  } finally {
    setBusy(false);
  }
}

function exportAllText() {
  if (!state.questions.length) return;

  const text = formatAllQuestionsText();
  downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `${makeBaseName()}_questions.txt`);
  showToast("Đã tải text tất cả câu hỏi");
}

async function exportAllImagesZip() {
  if (!state.questions.length || !window.JSZip || !window.saveAs) return;

  setBusy(true);
  try {
    const zip = new JSZip();
    for (let i = 0; i < state.questions.length; i += 1) {
      const question = state.questions[i];
      showToast(`Đang xuất ảnh ${i + 1}/${state.questions.length}`);
      const canvas = await captureQuestion(question);
      const blob = await canvasToBlob(canvas, "image/png");
      zip.file(`${makeBaseName()}_cau_${pad(question.number)}.png`, blob);
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${makeBaseName()}_questions_png.zip`);
    showToast("Đã xuất ZIP ảnh");
  } catch (error) {
    console.error(error);
    showToast("Không xuất được ZIP");
  } finally {
    setBusy(false);
  }
}

async function exportAllPdf() {
  if (!state.questions.length || !window.jspdf) return;

  setBusy(true);
  try {
    let pdf = null;

    for (let i = 0; i < state.questions.length; i += 1) {
      const question = state.questions[i];
      showToast(`Đang xuất PDF ${i + 1}/${state.questions.length}`);
      const canvas = await captureQuestion(question);
      const width = canvas.width;
      const height = canvas.height;
      const image = canvas.toDataURL("image/png");

      if (!pdf) {
        pdf = new window.jspdf.jsPDF({
          orientation: "landscape",
          unit: "px",
          format: [width, height],
          hotfixes: ["px_scaling"],
        });
      } else {
        pdf.addPage([width, height], "landscape");
      }

      pdf.addImage(image, "PNG", 0, 0, width, height);
    }

    pdf.save(`${makeBaseName()}_questions.pdf`);
    showToast("Đã xuất PDF");
  } catch (error) {
    console.error(error);
    showToast("Không xuất được PDF");
  } finally {
    setBusy(false);
  }
}

async function captureQuestion(question) {
  if (!window.html2canvas) {
    throw new Error("html2canvas is not available");
  }

  const card = buildQuestionCard(question, { exportMode: true });
  els.exportSandbox.textContent = "";
  els.exportSandbox.append(card);
  await nextFrame();
  await nextFrame();

  const canvas = await html2canvas(card, {
    backgroundColor: "#ffffff",
    scale: 1,
    useCORS: true,
    width: 1600,
    height: 900,
    windowWidth: 1600,
    windowHeight: 900,
  });

  els.exportSandbox.textContent = "";
  return canvas;
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Cannot create blob"));
    }, type);
  });
}

function downloadDataUrl(dataUrl, filename) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatAllQuestionsText() {
  const title = state.fileName ? state.fileName.replace(/\.pdf$/i, "") : "questions";
  const answerLine = state.questions
    .filter((question) => question.answer)
    .map((question) => `${question.number}${question.answer}`)
    .join(" ");
  const parts = [
    `=== ${title} ===`,
    `Footer: ${state.footer || DEFAULT_FOOTER_NAME}`,
    `Tổng số câu: ${state.questions.length}`,
  ];

  if (answerLine) {
    parts.push("", "FORMAT ĐÁP ÁN:", answerLine);
  }

  parts.push("", ...state.questions.map(formatQuestionText));
  return `${parts.join("\n")}\n`;
}

function formatQuestionText(question) {
  const lines = [`${question.number}. (${question.kind || "Choose 1 answer"})`, "", question.stem || ""];

  for (const option of question.options) {
    lines.push(`${option.label}. ${option.text || ""}`.trimEnd());
  }

  if (question.answer) {
    lines.push(`Đáp án: ${question.answer}`);
  }

  return lines.join("\n");
}

function makeBaseName() {
  return slugify(state.fileName.replace(/\.pdf$/i, "") || "questions");
}

function slugify(value) {
  return String(value || "questions")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

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
    els.answerInput,
    els.kindInput,
    els.stemInput,
  ].forEach((element) => {
    element.disabled = disabled;
  });

  els.footerInput.disabled = state.busy;
  els.resetFooterBtn.disabled = state.busy;
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

document.addEventListener("DOMContentLoaded", init);
