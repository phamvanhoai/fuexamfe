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
