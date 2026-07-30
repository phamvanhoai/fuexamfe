async function createImageSlices(file) {
  const sourceUrl = URL.createObjectURL(file);
  const image = await loadImage(sourceUrl);
  const canvas = document.createElement("canvas");
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);

  const rows = detectQuestionRows(context, width, height);
  if (rows.length < 2) {
    return [
      {
        blob: file,
        url: sourceUrl,
        name: file.name,
        sourceName: file.name,
      },
    ];
  }

  URL.revokeObjectURL(sourceUrl);
  const slices = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const crop = document.createElement("canvas");
    crop.width = width;
    crop.height = row.height;
    crop
      .getContext("2d")
      .drawImage(canvas, 0, row.y, width, row.height, 0, 0, width, row.height);
    const blob = await canvasToBlob(crop, "image/png");
    slices.push({
      blob,
      url: URL.createObjectURL(blob),
      name: `${stripKnownExtension(file.name)}_q${index + 1}.png`,
      sourceName: file.name,
    });
  }

  return slices;
}

function detectQuestionRows(context, width, height) {
  const data = context.getImageData(0, 0, width, height).data;
  const sampledWidth = Math.ceil(width / 2);
  const darkThreshold = Math.max(80, sampledWidth * 0.62);
  const lineRows = [];

  for (let y = 0; y < height; y += 1) {
    let darkPixels = 0;
    for (let x = 0; x < width; x += 2) {
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3];
      const luminance = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
      if (alpha > 20 && luminance < 190) {
        darkPixels += 1;
      }
    }

    if (darkPixels > darkThreshold) {
      lineRows.push(y);
    }
  }

  const lines = mergeNearbyRows(lineRows);
  if (lines.length < 3) return [];

  const minHeight = Math.max(54, height * 0.06);
  const rows = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const y = lines[index] + 2;
    const bottom = lines[index + 1] - 2;
    const rowHeight = bottom - y;
    if (rowHeight >= minHeight) {
      rows.push({ y, height: rowHeight });
    }
  }

  return rows;
}

function mergeNearbyRows(rows) {
  if (!rows.length) return [];

  const merged = [];
  let cluster = [rows[0]];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row - cluster.at(-1) <= 3) {
      cluster.push(row);
    } else {
      merged.push(Math.round(cluster.reduce((sum, value) => sum + value, 0) / cluster.length));
      cluster = [row];
    }
  }

  merged.push(Math.round(cluster.reduce((sum, value) => sum + value, 0) / cluster.length));
  return merged;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Không tải được ảnh"));
    image.src = src;
  });
}

function createImageQuestion(slice, number, rawOcr) {
  return {
    number,
    kind: "Choose 1 answer",
    type: "Image Question",
    stem: slice.name || `Câu ${number}`,
    options: [],
    answer: "",
    imageSrc: slice.url,
    sourceImageSrc: slice.url,
    cropRegion: { x: 0, y: 0, width: 1000, height: 1000 },
    imageName: slice.name,
    rawOcr,
  };
}

function createTextFallbackQuestion(number, message) {
  return {
    number,
    kind: "Choose 1 answer",
    type: "Multiple Choice",
    stem: message || `Câu ${number}`,
    options: [],
    answer: "",
  };
}

async function attachQuestionVisuals(file, questions) {
  const visualQuestions = questions.filter(
    (question) =>
      question.hasVisual &&
      question.imageRegion?.width >= 20 &&
      question.imageRegion?.height >= 20
  );
  if (!visualQuestions.length) return questions;

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;

    for (const question of visualQuestions) {
      const region = question.imageRegion;
      const paddingX = Math.max(8, Math.round(region.width * 0.06));
      const paddingY = Math.max(8, Math.round(region.height * 0.06));
      const x = Math.max(0, Math.floor(((region.x - paddingX) / 1000) * sourceWidth));
      const y = Math.max(0, Math.floor(((region.y - paddingY) / 1000) * sourceHeight));
      const right = Math.min(
        sourceWidth,
        Math.ceil(((region.x + region.width + paddingX) / 1000) * sourceWidth)
      );
      const bottom = Math.min(
        sourceHeight,
        Math.ceil(((region.y + region.height + paddingY) / 1000) * sourceHeight)
      );
      if (right - x < 10 || bottom - y < 10) continue;

      const crop = document.createElement("canvas");
      crop.width = right - x;
      crop.height = bottom - y;
      crop
        .getContext("2d")
        .drawImage(image, x, y, crop.width, crop.height, 0, 0, crop.width, crop.height);

      const blob = await canvasToBlob(crop, "image/png");
      question.imageSrc = URL.createObjectURL(blob);
      question.imageName = `${stripKnownExtension(file.name)}_q${question.number}_visual.png`;
      question.sourceImageSrc ||= URL.createObjectURL(file);
      question.cropRegion = { ...region };
      question.type = "Image Question";
    }
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }

  return questions;
}

const cropEditorState = {
  question: null,
  region: null,
  interaction: null,
};

function openCropEditor() {
  const question = state.questions[state.current];
  const sourceImage = question?.sourceImageSrc || question?.imageSrc;
  if (!sourceImage) {
    showToast("Câu này không có ảnh gốc để chỉnh");
    return;
  }

  question.sourceImageSrc = sourceImage;
  cropEditorState.question = question;
  cropEditorState.region = { ...(question.cropRegion || { x: 0, y: 0, width: 1000, height: 1000 }) };
  els.cropSourceImage.onload = updateCropSelection;
  els.cropSourceImage.src = sourceImage;
  els.cropModal.hidden = false;
  els.removeQuestionImageBtn.disabled = !question.imageSrc;
  document.body.style.overflow = "hidden";
  refreshIcons();
  if (els.cropSourceImage.complete) updateCropSelection();
}

function closeCropEditor() {
  cropEditorState.question = null;
  cropEditorState.interaction = null;
  els.cropModal.hidden = true;
  document.body.style.overflow = "";
}

function updateCropSelection() {
  const region = cropEditorState.region;
  if (!region) return;
  els.cropSelection.style.left = `${region.x / 10}%`;
  els.cropSelection.style.top = `${region.y / 10}%`;
  els.cropSelection.style.width = `${region.width / 10}%`;
  els.cropSelection.style.height = `${region.height / 10}%`;
}

function startCropInteraction(event) {
  if (!cropEditorState.region) return;
  event.preventDefault();
  els.cropSelection.setPointerCapture?.(event.pointerId);
  cropEditorState.interaction = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    handle: event.target.dataset.handle || "move",
    initial: { ...cropEditorState.region },
  };
}

function moveCropInteraction(event) {
  const interaction = cropEditorState.interaction;
  if (!interaction || interaction.pointerId !== event.pointerId) return;

  const rect = els.cropStage.getBoundingClientRect();
  const dx = ((event.clientX - interaction.startX) / rect.width) * 1000;
  const dy = ((event.clientY - interaction.startY) / rect.height) * 1000;
  const next = { ...interaction.initial };
  const minSize = 40;

  if (interaction.handle === "move") {
    next.x = Math.min(1000 - next.width, Math.max(0, interaction.initial.x + dx));
    next.y = Math.min(1000 - next.height, Math.max(0, interaction.initial.y + dy));
  } else {
    if (interaction.handle.includes("w")) {
      const right = interaction.initial.x + interaction.initial.width;
      next.x = Math.min(right - minSize, Math.max(0, interaction.initial.x + dx));
      next.width = right - next.x;
    }
    if (interaction.handle.includes("e")) {
      next.width = Math.min(1000 - next.x, Math.max(minSize, interaction.initial.width + dx));
    }
    if (interaction.handle.includes("n")) {
      const bottom = interaction.initial.y + interaction.initial.height;
      next.y = Math.min(bottom - minSize, Math.max(0, interaction.initial.y + dy));
      next.height = bottom - next.y;
    }
    if (interaction.handle.includes("s")) {
      next.height = Math.min(1000 - next.y, Math.max(minSize, interaction.initial.height + dy));
    }
  }

  cropEditorState.region = Object.fromEntries(
    Object.entries(next).map(([key, value]) => [key, Math.round(value)])
  );
  updateCropSelection();
}

function endCropInteraction(event) {
  if (cropEditorState.interaction?.pointerId === event.pointerId) {
    cropEditorState.interaction = null;
  }
}

async function saveCropEditor() {
  const question = cropEditorState.question;
  const region = cropEditorState.region;
  if (!question || !region) return;

  const image = await loadImage(question.sourceImageSrc);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const x = Math.round((region.x / 1000) * width);
  const y = Math.round((region.y / 1000) * height);
  const cropWidth = Math.max(1, Math.round((region.width / 1000) * width));
  const cropHeight = Math.max(1, Math.round((region.height / 1000) * height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(cropWidth, width - x);
  canvas.height = Math.min(cropHeight, height - y);
  canvas.getContext("2d").drawImage(
    image,
    x,
    y,
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const blob = await canvasToBlob(canvas, "image/png");
  question.imageSrc = URL.createObjectURL(blob);
  question.imageName ||= `question_${question.number}_visual.png`;
  question.cropRegion = { ...region };
  question.hasVisual = true;
  question.type = "Image Question";
  closeCropEditor();
  renderCurrentQuestion();
  showToast("Đã lưu vùng hình");
}

function removeQuestionImage() {
  const question = cropEditorState.question || state.questions[state.current];
  if (!question?.imageSrc) {
    showToast("Câu này không có hình để xóa");
    return;
  }

  question.imageSrc = "";
  question.imageName = "";
  question.hasVisual = false;
  question.type = "Multiple Choice";
  closeCropEditor();
  renderCurrentQuestion();
  updateActionButtons();
  showToast("Đã xóa hình khỏi câu; ảnh gốc vẫn được giữ để có thể thêm lại");
}
