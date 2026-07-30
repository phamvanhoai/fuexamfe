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
  els.cropImageBtn.disabled =
    state.busy || !question || !(question.sourceImageSrc || question.imageSrc);

  if (!question) {
    els.currentIndex.textContent = "-";
    els.answerInput.value = "";
    els.kindInput.value = "Choose 1 answer";
    els.footerInput.value = state.footer;
    els.exportNameInput.value = state.exportName;
    els.subjectCodeInput.value = state.subjectCode;
    els.stemInput.value = "";
    els.optionsInput.value = "";
    return;
  }

  els.questionMount.append(buildQuestionCard(question, { interactive: true }));
  els.currentIndex.textContent = `${state.current + 1}/${state.questions.length}`;
  els.answerInput.value = formatAnswerDisplay(question.answer);
  question.kind = normalizeKind(question.kind || "Choose 1 answer");
  ensureKindOption(question.kind);
  els.kindInput.value = question.kind;
  els.footerInput.value = state.footer;
  els.exportNameInput.value = state.exportName;
  els.subjectCodeInput.value = state.subjectCode;
  els.stemInput.value = question.stem || "";
  els.optionsInput.value = formatOptionsForEditor(question.options);
  refreshIcons();
}

function ensureKindOption(kind) {
  if (!kind) return;
  const exists = [...els.kindInput.options].some((option) => option.value === kind);
  if (exists) return;

  const option = document.createElement("option");
  option.value = kind;
  option.textContent = kind;
  els.kindInput.append(option);
}

function buildQuestionCard(question, options = {}) {
  const interactive = Boolean(options.interactive);
  const exportMode = Boolean(options.exportMode);
  const card = document.createElement("article");
  card.className = `exam-shot${exportMode ? " export-shot" : ""}${question.imageSrc ? " has-image" : ""}${state.showAnswerControls ? "" : " hide-answer-controls"}`;

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
    : "";
  const imageMarkup = question.imageSrc
    ? `
        <figure class="question-image-wrap">
          <img src="${escapeHtml(question.imageSrc)}" alt="${escapeHtml(question.imageName || `Câu ${question.number}`)}">
        </figure>
      `
    : "";

  card.innerHTML = `
    <header class="shot-header">
      <h2>Câu ${escapeHtml(question.number)}</h2>
      <div class="badges">
        ${state.subjectCode ? `<span class="badge subject-code">${escapeHtml(state.subjectCode)}</span>` : ""}
        <span class="badge answer-kind">${escapeHtml(question.kind || "Choose 1 answer")}</span>
        <span class="badge question-kind">${escapeHtml(question.type || "Multiple Choice")}</span>
      </div>
    </header>
    <div class="shot-body">
      ${state.showAnswerControls ? `<aside class="answer-rail">
        ${labels
          .map(
            (label) => `
              <span class="answer-dot${answerSet.has(label) ? " correct" : ""}${interactive ? " interactive" : ""}" data-answer="${escapeHtml(label)}">${escapeHtml(label)}</span>
            `
          )
          .join("")}
        ${question.answer ? `<span class="answer-label">Đáp án: ${escapeHtml(formatAnswerDisplay(question.answer))}</span>` : ""}
      </aside>` : ""}
      <section class="question-content">
        ${question.stem ? `<p class="question-text">${escapeHtml(question.stem || "")}</p>` : ""}
        ${imageMarkup}
        ${choiceRows ? `<div class="choices">${choiceRows}</div>` : ""}
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
  if (question.imageSrc && !question.options.length && !question.answer) return [];
  if (question.options.length) return question.options.map((option) => option.label);
  const answerLabels = (question.answer || "").split("").filter(Boolean);
  return answerLabels.length ? answerLabels : ["A", "B", "C", "D"];
}

function toggleAnswer(label) {
  const question = state.questions[state.current];
  if (!question || !label) return;

  const current = sanitizeAnswer(question.answer);
  const limit = getKindAnswerLimit(question.kind);

  if (limit !== 1) {
    const set = new Set(current.split(""));
    if (set.has(label)) {
      set.delete(label);
    } else if (Number.isFinite(limit) && set.size >= limit) {
      showToast(`Câu này chỉ chọn ${limit} đáp án`);
      return;
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

function getKindAnswerLimit(kind) {
  const normalized = normalizeKind(kind || "Choose 1 answer");
  const numeric = normalized.match(/\bchoose\s+(\d+)\s+answers?\b/i);
  if (numeric) return Math.max(1, Number(numeric[1]) || 1);
  if (/many|multiple/i.test(normalized)) return Infinity;
  return 1;
}

function sanitizeAnswerForKind(value, kind) {
  const answer = sanitizeAnswer(value);
  const limit = getKindAnswerLimit(kind);
  return Number.isFinite(limit) ? answer.slice(0, limit) : answer;
}

function handleQuestionKindChange() {
  const question = state.questions[state.current];
  if (!question) return;

  const previousAnswer = sanitizeAnswer(question.answer);
  question.kind = normalizeKind(els.kindInput.value);
  question.answer = sanitizeAnswerForKind(previousAnswer, question.kind);
  const removedCount = previousAnswer.length - question.answer.length;

  renderCurrentQuestion();
  renderQuestionList();
  if (removedCount > 0) {
    showToast(`Đã giới hạn còn ${question.answer.length} đáp án theo loại câu mới`);
  } else {
    const limit = getKindAnswerLimit(question.kind);
    showToast(
      Number.isFinite(limit)
        ? `Câu này cho phép chọn ${limit} đáp án`
        : "Câu này cho phép chọn nhiều đáp án"
    );
  }
}

function formatOptionsForEditor(options) {
  return (options || []).map((option) => `${option.label}. ${option.text || ""}`.trim()).join("\n");
}

function parseOptionsFromEditor(value) {
  const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(/^([A-H])\s*[\).:\-]?\s*(.*)$/i);
      if (match) {
        return {
          label: match[1].toUpperCase(),
          text: cleanParagraph(match[2] || ""),
        };
      }

      return {
        label: labels[index] || "A",
        text: cleanParagraph(line),
      };
    });
}

function applyEditorChanges() {
  const question = state.questions[state.current];
  if (!question) return;

  question.kind = normalizeKind(els.kindInput.value);
  question.answer = sanitizeAnswerForKind(els.answerInput.value, question.kind);
  question.stem = cleanParagraph(els.stemInput.value);
  question.options = parseOptionsFromEditor(els.optionsInput.value);
  setFooterName(els.footerInput.value);

  renderCurrentQuestion();
  renderQuestionList();
  showToast("Đã cập nhật câu hỏi");
}

function addManualQuestion() {
  const number = state.questions.length + 1;
  const kind = normalizeKind(els.kindInput.value || "Choose 1 answer");
  const question = {
    number,
    kind,
    type: "Multiple Choice",
    stem: cleanParagraph(els.stemInput.value) || `Câu ${number}`,
    options: parseOptionsFromEditor(els.optionsInput.value),
    answer: sanitizeAnswerForKind(els.answerInput.value, kind),
  };

  state.questions.push(question);
  renumberQuestions();
  state.current = state.questions.length - 1;
  state.pageCount = Math.max(state.pageCount, 1);
  render();
  showToast("Đã thêm câu hỏi thủ công");
}

function deleteCurrentQuestion() {
  if (!state.questions.length) return;

  const removed = state.questions.splice(state.current, 1);
  renumberQuestions();
  state.current = Math.min(state.current, Math.max(0, state.questions.length - 1));
  render();
  showToast(removed.length ? "Đã xóa câu hỏi" : "Không có câu để xóa");
}

function clearAllQuestions() {
  if (!state.questions.length) return;

  state.questions = [];
  state.filtered = [];
  state.current = 0;
  state.fileName = "";
  state.pageCount = 0;
  els.fileName.textContent = "Chưa import dữ liệu";
  render();
  showToast("Đã xóa tất cả câu hỏi");
}

function renumberQuestions() {
  state.questions.forEach((question, index) => {
    question.number = index + 1;
  });
}

function applyImportAnswerMode(questions) {
  if (state.importAnswerMode !== "blank") return questions;
  questions.forEach((question) => {
    question.answer = "";
  });
  return questions;
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

function handleExportNameChange() {
  setExportName(els.exportNameInput.value);
}

function handleSubjectCodeChange() {
  setSubjectCode(els.subjectCodeInput.value);
  renderCurrentQuestion();
}

function handleImportAnswerModeChange() {
  state.importAnswerMode = ["keep", "ai", "blank"].includes(els.importAnswerModeInput.value)
    ? els.importAnswerModeInput.value
    : "keep";
  saveSetting(IMPORT_ANSWER_MODE_STORAGE_KEY, state.importAnswerMode);
  if (state.importAnswerMode === "blank") {
    state.showAnswerControls = false;
    els.answerControlsInput.value = "hide";
    saveSetting(ANSWER_CONTROLS_STORAGE_KEY, "hide");
    renderCurrentQuestion();
  }
  const messages = {
    blank: "Import sẽ không chọn đáp án",
    ai: "Gemini sẽ tự giải và chọn đáp án",
    keep: "Import sẽ dùng đáp án được ghi sẵn trên đề",
  };
  showToast(messages[state.importAnswerMode]);
}

function handleAnswerControlsChange() {
  state.showAnswerControls = els.answerControlsInput.value !== "hide";
  saveSetting(ANSWER_CONTROLS_STORAGE_KEY, state.showAnswerControls ? "show" : "hide");
  renderCurrentQuestion();
  showToast(state.showAnswerControls ? "Đã hiện vùng chọn đáp án" : "Đã ẩn vùng chọn đáp án");
}
