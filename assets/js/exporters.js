async function exportCurrentImage(type) {
  const question = state.questions[state.current];
  if (!question) return;

  setBusy(true);
  try {
    const canvas = await captureQuestion(question);
    const mime = type === "jpeg" ? "image/jpeg" : "image/png";
    const ext = type === "jpeg" ? "jpg" : "png";
    downloadDataUrl(canvas.toDataURL(mime, 0.94), `${makeExportBaseName()}_${pad(question.number)}.${ext}`);
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
  downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `${makeExportBaseName()}.txt`);
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
      zip.file(`${makeExportBaseName()}_${pad(question.number)}.png`, blob);
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${makeExportBaseName()}_images.zip`);
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

    pdf.save(`${makeExportBaseName()}.pdf`);
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
  await waitForImages(card);
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

function waitForImages(root) {
  const images = [...root.querySelectorAll("img")];
  return Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.onload = resolve;
        image.onerror = resolve;
      });
    })
  );
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    };
    reader.onerror = () => reject(new Error("Không đọc được ảnh để gửi AI"));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Cannot create blob"));
    }, type);
  });
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  return `${state.questions.map(formatQuestionText).join("\n\n")}\n`;
}

function formatQuestionText(question) {
  const lines = [`${question.number}. (${question.kind || "Choose 1 answer"})`];

  if (question.stem) {
    lines.push(question.stem);
  }

  if (question.imageName) {
    lines.push(`[Ảnh: ${question.imageName}]`);
  }

  for (const option of question.options) {
    lines.push(`${option.label}. ${option.text || ""}`.trimEnd());
  }

  lines.push(`Đáp án: ${question.answer || ""}`.trimEnd());

  if (question.rawOcr && !question.options.length) {
    lines.push("", "OCR RAW:", question.rawOcr.trim());
  }

  return lines.join("\n");
}

function makeBaseName() {
  return slugify(stripKnownExtension(state.fileName || "questions"));
}

function makeExportBaseName() {
  return sanitizeExportName(state.exportName || makeBaseName()).slice(0, 48) || "questions";
}

function stripKnownExtension(filename) {
  return String(filename || "").replace(/\.(pdf|jpe?g|png|webp|gif|bmp|tiff?)$/i, "");
}

function slugify(value) {
  return String(value || "questions")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function sanitizeExportName(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/[.\s]+$/g, "")
    .trimStart();
}
