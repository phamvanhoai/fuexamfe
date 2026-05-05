async function extractQuestionsWithGeminiRetry(imageBlob, label, fallbackNumber) {
  const models = getGeminiModelCandidates();
  let lastError = null;

  for (const model of models) {
    try {
      return await extractQuestionsWithGemini(imageBlob, label, fallbackNumber, model);
    } catch (error) {
      lastError = error;
      if (!isGeminiQuotaError(error) && !isGeminiModelUnavailableError(error)) {
        throw error;
      }

      const nextModel = models[models.indexOf(model) + 1];
      if (nextModel) {
        const reason = isGeminiModelUnavailableError(error) ? "không khả dụng" : "hết quota";
        showToast(`${model} ${reason}, thử ${nextModel}`);
        continue;
      }

      const waitMs = getGeminiRetryDelay(error);
      showToast(`Gemini hết quota tạm thời, đợi ${Math.ceil(waitMs / 1000)}s rồi thử lại`);
      await sleep(waitMs);
      return extractQuestionsWithGemini(imageBlob, label, fallbackNumber, model);
    }
  }

  throw lastError || new Error("Gemini không xử lý được ảnh");
}

async function extractQuestionsWithGemini(imageBlob, label, fallbackNumber, modelName = state.geminiModel) {
  const imageData = await blobToBase64(imageBlob);
  const model = encodeURIComponent(modelName || DEFAULT_GEMINI_MODEL);
  const endpoint = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(state.geminiApiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: getGeminiMimeType(imageBlob),
                data: imageData,
              },
            },
            {
              text: buildGeminiExtractionPrompt(label),
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: getQuestionSchema(),
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `HTTP ${response.status}`;
    throw createGeminiError(message, response.status, payload);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const parsed = safeJsonParse(text);
  const questions = Array.isArray(parsed?.questions) ? parsed.questions : Array.isArray(parsed) ? parsed : [];
  return normalizeGeminiQuestions(questions, fallbackNumber);
}

function buildGeminiExtractionPrompt(label) {
  return [
    "Extract every multiple-choice question visible in this exam image or PDF.",
    `Image label: ${label}.`,
    "Return only valid JSON matching the schema.",
    "Keep the original question text and answer option text exactly as much as possible.",
    "If the image shows a selected/correct answer, put uppercase letters in answer, for example C or AB.",
    "If no correct answer is visible, answer must be an empty string.",
    "For kind, use text like Choose 1 answer or Choose 3 answers.",
    "Use option labels A-H only. Ignore watermarks, page titles, and decorative text.",
  ].join("\n");
}

function getQuestionSchema() {
  return {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            number: { type: "integer" },
            kind: { type: "string" },
            stem: { type: "string" },
            options: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  text: { type: "string" },
                },
                required: ["label", "text"],
              },
            },
            answer: { type: "string" },
          },
          required: ["number", "kind", "stem", "options", "answer"],
        },
      },
    },
    required: ["questions"],
  };
}

function normalizeGeminiQuestions(questions, fallbackNumber) {
  return questions
    .map((question, index) => {
      const number = Number(question.number) || fallbackNumber + index;
      const options = Array.isArray(question.options)
        ? question.options
            .map((option) => ({
              label: sanitizeOptionLabel(option.label),
              text: cleanParagraph(option.text || ""),
            }))
            .filter((option) => option.label)
        : [];

      return {
        number,
        kind: normalizeKind(question.kind || "Choose 1 answer"),
        type: "Multiple Choice",
        stem: cleanParagraph(question.stem || `Câu ${number}`),
        options,
        answer: sanitizeAnswer(question.answer || ""),
      };
    })
    .filter((question) => question.stem || question.options.length);
}

function sanitizeOptionLabel(value) {
  const match = String(value || "").toUpperCase().match(/[A-H]/);
  return match ? match[0] : "";
}

function getGeminiMimeType(blob) {
  if (blob?.type) return blob.type;
  const name = blob?.name || "";
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  return "image/png";
}

function getGeminiModelCandidates() {
  return [
    state.geminiModel || DEFAULT_GEMINI_MODEL,
    ...GEMINI_FALLBACK_MODELS,
  ].filter((model, index, models) => model && models.indexOf(model) === index);
}

function createGeminiError(message, status, payload) {
  const error = new Error(message);
  error.status = status;
  error.payload = payload;
  return error;
}

function isGeminiQuotaError(error) {
  const status = error?.status || error?.payload?.error?.code;
  const statusName = error?.payload?.error?.status || "";
  return status === 429 || statusName === "RESOURCE_EXHAUSTED" || /quota|rate limit/i.test(error?.message || "");
}

function isGeminiModelUnavailableError(error) {
  const status = error?.status || error?.payload?.error?.code;
  return status === 404 || /not found|not supported for generateContent/i.test(error?.message || "");
}

function getGeminiRetryDelay(error) {
  const details = error?.payload?.error?.details || [];
  const retryInfo = details.find((item) => item?.["@type"]?.includes("RetryInfo") && item.retryDelay);
  const retryDelay = retryInfo?.retryDelay || "";
  const retrySeconds = Number(String(retryDelay).replace(/s$/, ""));
  if (Number.isFinite(retrySeconds) && retrySeconds > 0) {
    return Math.min(90000, Math.ceil(retrySeconds * 1000) + 1000);
  }

  const messageMatch = String(error?.message || "").match(/retry in\s+([0-9.]+)s/i);
  const messageSeconds = Number(messageMatch?.[1]);
  if (Number.isFinite(messageSeconds) && messageSeconds > 0) {
    return Math.min(90000, Math.ceil(messageSeconds * 1000) + 1000);
  }

  return 45000;
}
