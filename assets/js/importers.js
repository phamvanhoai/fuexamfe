async function handlePdfSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!window.pdfjsLib && state.pdfEngine !== "gemini") {
    showToast("Không tải được PDF.js");
    return;
  }

  setBusy(true);
  try {
    showToast(state.pdfEngine === "gemini" ? "Đang đọc PDF bằng Gemini..." : "Đang đọc PDF...");
    const { questions, pageCount, rawText, source } = await extractQuestionsFromPdf(file);

    const importedQuestions = applyImportAnswerMode(
      questions.length ? questions : [fallbackQuestion(rawText.trim() || "Không đọc được nội dung PDF")]
    );
    state.questions = importedQuestions;
    state.filtered = [];
    state.current = 0;
    state.fileName = file.name;
    state.pageCount = pageCount;

    els.fileName.textContent = file.name;
    showToast(`Đã tách ${state.questions.length} câu hỏi từ ${source}`);
    render();
  } catch (error) {
    console.error(error);
    showToast("Không đọc được PDF này");
  } finally {
    setBusy(false);
    event.target.value = "";
  }
}

async function extractQuestionsFromPdf(file) {
  if (state.pdfEngine === "gemini") {
    return extractQuestionsFromPdfWithGemini(file);
  }

  const textResult = await extractQuestionsFromPdfText(file);
  if (state.pdfEngine === "text" || textResult.questions.length) {
    return textResult;
  }

  if (state.geminiApiKey) {
    showToast("PDF text lỗi, chuyển sang Gemini...");
    return extractQuestionsFromPdfWithGemini(file, textResult);
  }

  showToast("PDF text lỗi và chưa có Gemini API key");
  return textResult;
}

async function extractQuestionsFromPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent({ normalizeWhitespace: true });
    pages.push(extractPageText(textContent.items));
  }

  const rawText = pages.join("\n\n");
  return {
    questions: parseQuestions(rawText),
    pageCount: pdf.numPages,
    rawText,
    source: "PDF text",
  };
}

async function extractQuestionsFromPdfWithGemini(file, textFallback = null) {
  if (!state.geminiApiKey) {
    throw new Error("Chưa có Gemini API key để đọc PDF bằng AI");
  }

  const label = `PDF ${file.name}`;
  const questions = await extractQuestionsWithGeminiRetry(file, label, 1);
  return {
    questions,
    pageCount: textFallback?.pageCount || 1,
    rawText: textFallback?.rawText || "",
    source: "Gemini PDF",
  };
}

async function handleImageSelect(event) {
  const files = [...(event.target.files || [])].filter(isImageFile);
  if (!files.length) {
    showToast("Không nhận được file ảnh");
    event.target.value = "";
    return;
  }

  setBusy(true);
  try {
    const names = [];
    files.forEach((file) => names.push(file.name));
    const allQuestions = await extractQuestionsFromImages(files, "ảnh");
    const importedQuestions = applyImportAnswerMode(
      allQuestions.length ? allQuestions : [fallbackQuestion("Không đọc được nội dung ảnh", state.questions.length + 1)]
    );
    const previousCount = state.questions.length;

    state.questions.push(...importedQuestions);
    renumberQuestions();
    state.filtered = [];
    state.current = previousCount;
    state.fileName = state.fileName
      ? `${state.fileName} + ${files.length === 1 ? files[0].name : `${files.length}_images`}`
      : files.length === 1
        ? files[0].name
        : `${files.length}_images`;
    state.pageCount += files.length;
    els.fileName.textContent = names.length === 1 ? names[0] : `${names.length} ảnh đã import`;

    showToast(`Đã thêm ${importedQuestions.length} câu hỏi từ ảnh`);
    render();
  } catch (error) {
    console.error(error);
    showToast(`Không xử lý được ảnh: ${error.message || "lỗi không xác định"}`);
  } finally {
    setBusy(false);
    event.target.value = "";
  }
}

async function extractQuestionsFromImages(files, unitLabel) {
  const allQuestions = [];
  const useGemini = state.imageEngine === "gemini" && Boolean(state.geminiApiKey);
  const canOcr = !useGemini && Boolean(window.Tesseract);
  let worker = null;

  if (state.imageEngine === "gemini" && !state.geminiApiKey) {
    showToast("Chưa có Gemini API key, dùng Tesseract OCR");
  }

  if (canOcr && window.Tesseract.createWorker) {
    try {
      worker = await createOcrWorker();
    } catch (error) {
      console.warn(error);
      showToast("OCR worker lỗi, chuyển sang chế độ dự phòng");
    }
  }

  try {
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const fileLabel = `${unitLabel} ${i + 1}/${files.length}`;

      if (useGemini) {
        showToast(`Đang đọc bằng Gemini ${fileLabel}`);
        try {
          const parsed = await extractQuestionsWithGeminiRetry(file, fileLabel, allQuestions.length + 1);
          await attachQuestionVisuals(file, parsed);
          if (parsed.length) {
            allQuestions.push(...parsed);
          } else {
            allQuestions.push(createTextFallbackQuestion(allQuestions.length + 1, "Gemini không tách được câu hỏi từ ảnh này."));
          }
        } catch (error) {
          console.warn(error);
          allQuestions.push(
            createTextFallbackQuestion(
              allQuestions.length + 1,
              `Gemini lỗi khi xử lý ${file.name}: ${error.message || "lỗi không xác định"}`
            )
          );
        }
        continue;
      }

      const slices = await createImageSlices(file);

      for (let sliceIndex = 0; sliceIndex < slices.length; sliceIndex += 1) {
        const slice = slices[sliceIndex];
        const label =
          slices.length > 1
            ? `${unitLabel} ${i + 1}/${files.length}, vùng ${sliceIndex + 1}/${slices.length}`
            : `${unitLabel} ${i + 1}/${files.length}`;

        if (!canOcr) {
          if (!useGemini) {
            allQuestions.push(createImageQuestion(slice, allQuestions.length + 1, ""));
            continue;
          }
        }

        let rawText = "";
        showToast(`Đang OCR ${label}`);
        try {
          rawText = await recognizeImage(slice.blob, worker, label);
        } catch (error) {
          console.warn(error);
          showToast(`OCR lỗi ở ${label}, giữ lại dạng ảnh`);
        }
        const parsed = parseImageQuestions(rawText, allQuestions.length + 1);

        if (parsed.length) {
          parsed.forEach((question) => {
            question.rawOcr = rawText;
          });
          allQuestions.push(...parsed);
        } else {
          allQuestions.push(createImageQuestion(slice, allQuestions.length + 1, rawText));
        }
      }
    }
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // OCR cleanup can fail if the worker already stopped.
      }
    }
  }

  return allQuestions;
}

function isImageFile(file) {
  return Boolean(file?.type?.startsWith("image/")) || /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(file?.name || "");
}

async function createOcrWorker() {
  return window.Tesseract.createWorker("eng", 1, {
    ...TESSERACT_PATHS,
    logger: handleOcrLog,
  });
}

async function recognizeImage(image, worker, label) {
  currentOcrLabel = label;

  if (worker) {
    const result = await worker.recognize(image);
    return result.data?.text || "";
  }

  if (window.Tesseract?.recognize) {
    const result = await window.Tesseract.recognize(image, "eng", {
      ...TESSERACT_PATHS,
      logger: handleOcrLog,
    });
    return result.data?.text || "";
  }

  return "";
}

