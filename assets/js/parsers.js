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

function parseImageQuestions(rawText, fallbackNumber = 1) {
  const text = normalizeOcrText(rawText);
  const matcher = /(?:^|\n)\s*(?:Question|Câu|Cau)\s*[:#-]?\s*(\d{1,3})\b\s*(\([^)]*answer[^)]*\))?/gi;
  const matches = [...text.matchAll(matcher)];
  const questions = [];

  if (!matches.length) {
    const parsed = parseQuestionBlock(text);
    if (parsed.stem || parsed.options.length) {
      return [
        {
          number: fallbackNumber,
          kind: "Choose 1 answer",
          type: "Multiple Choice",
          stem: parsed.stem || `Câu ${fallbackNumber}`,
          options: parsed.options,
          answer: "",
        },
      ];
    }
    return [];
  }

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const next = matches[i + 1];
    const number = Number(match[1]) || fallbackNumber + i;
    let kind = normalizeKind((match[2] || "").replace(/[()]/g, ""));
    let block = text.slice(match.index + match[0].length, next ? next.index : text.length).trim();

    const inlineKind = block.match(/^\s*\(?\s*(Choose\s+\d+\s+answers?|Choose\s+one answer|Choose\s+many answers?)\s*\)?/i);
    if (inlineKind) {
      kind = normalizeKind(inlineKind[1]);
      block = block.slice(inlineKind[0].length).trim();
    }

    const inlineAnswer = parseInlineAnswer(block);
    const parsed = parseQuestionBlock(stripAnswerLines(block));

    if (!parsed.stem && !parsed.options.length) continue;

    questions.push({
      number,
      kind,
      type: "Multiple Choice",
      stem: parsed.stem || `Câu ${number}`,
      options: parsed.options,
      answer: sanitizeAnswer(inlineAnswer),
    });
  }

  return questions;
}

function normalizeOcrText(rawText) {
  return normalizeText(rawText)
    .replace(/\bQuest(?:lon|1on|ien)\b/gi, "Question")
    .replace(/\bQuest\s+ion\b/gi, "Question")
    .replace(/^\s*([A-H])\s+([^\n]+)$/gim, (line, label, rest) => {
      if (/^[).:]/.test(rest.trim())) return line;
      return `${label}. ${rest.trim()}`;
    });
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

function fallbackQuestion(text, number = 1) {
  return {
    number,
    kind: "Choose 1 answer",
    type: "Multiple Choice",
    stem: cleanParagraph(text).slice(0, 5000) || "Không có nội dung",
    options: [],
    answer: "",
  };
}
