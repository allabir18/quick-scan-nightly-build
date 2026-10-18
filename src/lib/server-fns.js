import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getServerInfo = createServerFn({ method: "GET" }).handler(async () => ({
  renderedAt: new Date().toISOString(),
}));

const ScanInput = z.object({
  file_uri: z.string().min(1),
  question_count: z.number().int().min(1).max(200),
  options_count: z.number().int().min(2).max(6),
});

const AnswersSchema = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "number" },
          option: { type: "string" },
        },
        required: ["question", "option"],
      },
    },
  },
  required: ["answers"],
};

const isLetter = (v) => /^[A-Z]$/.test(v || "");

// Builds a personalized calibration note from the user's past corrections,
// injected into the detection prompt so the scanner adapts to their marking style.
const buildLearnedGuidance = (corrections) => {
  if (!corrections.length) return "";
  const missed = corrections.filter((c) => c.from_option === "BLANK" && isLetter(c.to_option));
  const falsePositives = corrections.filter((c) => isLetter(c.from_option) && c.to_option === "BLANK");
  const wrongLetters = corrections.filter((c) => isLetter(c.from_option) && isLetter(c.to_option));
  const lines = [
    `PERSONALIZED CALIBRATION — learned from ${corrections.length} corrections the user made on their own past sheets:`,
  ];
  if (missed.length)
    lines.push(
      `- ${missed.length} times a filled bubble was wrongly reported as BLANK: this user often marks lightly (pencil/faint fills). Examine faint and partial fills very closely before reporting BLANK.`
    );
  if (falsePositives.length)
    lines.push(
      `- ${falsePositives.length} times a bubble was reported as filled but was actually BLANK: do not mistake stray smudges, fingerprints, or printing artifacts for marks.`
    );
  if (wrongLetters.length)
    lines.push(
      `- ${wrongLetters.length} times the wrong bubble letter was reported: read bubble columns very carefully, especially adjacent letters and the edges of the grid.`
    );
  const examples = corrections
    .slice(0, 15)
    .map((c) => `Q${c.question}: read ${c.from_option}, actually ${c.to_option}`)
    .join("; ");
  lines.push(`Recent correction examples: ${examples}.`);
  return `\n${lines.join("\n")}\n`;
};

export const processOMRScan = createServerFn({ method: "POST" })
  .validator(ScanInput)
  .handler(async ({ data, context }) => {
    const b44 = context.getBase44();
    const admin = b44.asServiceRole;

    const { signed_url } = await admin.integrations.Core.CreateFileSignedUrl({
      file_uri: data.file_uri,
      expires_in: 600,
    });

    const optionLetters = Array.from({ length: data.options_count }, (_, i) =>
      String.fromCharCode(65 + i)
    );
    const lastOption = optionLetters[optionLetters.length - 1];

    const correctionPage = await admin.entities.Correction.filter(
      {},
      { sort: "-created_date", limit: 40 }
    );
    const learnedGuidance = buildLearnedGuidance(correctionPage.items || []);

    const prompt = `You are a precise OMR (Optical Mark Recognition) system. Analyze the attached image of a filled multiple-choice OMR answer sheet.

The sheet contains exactly ${data.question_count} questions, numbered 1 to ${data.question_count}. Each question has ${data.options_count} options labeled ${optionLetters.join(", ")} (A through ${lastOption}).

For EACH question, identify which single option bubble the respondent has clearly filled in or darkened. A marked bubble is noticeably darker and filled compared to unmarked (empty) bubbles, which appear as light outlines.

Rules:
- Return exactly one entry per question, for every question from 1 to ${data.question_count}.
- "option" must be the letter of the marked bubble (e.g. "A", "B", "C").
- If no bubble is marked for a question, use "BLANK".
- If multiple bubbles appear marked for a question, use "MULTIPLE".
- If it is genuinely ambiguous which bubble is marked, use "UNCLEAR".
- Account for lighting, slight scan rotation, and pencil or pen marks.
${learnedGuidance}
Return JSON matching the schema: an object with an "answers" array where each item has "question" (number) and "option" (string).`;

    const result = await admin.integrations.Core.InvokeLLM({
      prompt,
      file_urls: [signed_url],
      response_json_schema: AnswersSchema,
    });

    const answers = Array.isArray(result?.answers) ? result.answers : [];

    const scan = await b44.entities.Scan.create({
      file_uri: data.file_uri,
      question_count: data.question_count,
      options_count: data.options_count,
      answers,
    });

    return { scan_id: scan.id, answers };
  });

export const listScans = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  const b44 = context.getBase44();
  const page = await b44.entities.Scan.filter({}, { sort: "-created_date", limit: 50 });
  return { items: page.items || [], has_more: page.has_more };
});

export const getScan = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data, context }) => {
    const b44 = context.getBase44();
    const scan = await b44.entities.Scan.get(data.id).catch((e) => {
      if (e?.status === 404) return null;
      throw e;
    });
    if (!scan) return null;
    let image_url = null;
    try {
      const r = await b44.asServiceRole.integrations.Core.CreateFileSignedUrl({
        file_uri: scan.file_uri,
        expires_in: 600,
      });
      image_url = r.signed_url;
    } catch {
      /* image may be unavailable */
    }
    return { ...scan, image_url };
  });

export const correctAnswer = createServerFn({ method: "POST" })
  .validator(
    z.object({
      scan_id: z.string().min(1),
      question: z.number().int().min(1).max(200),
      new_option: z.string().min(1).max(10),
    })
  )
  .handler(async ({ data, context }) => {
    const b44 = context.getBase44();
    const scan = await b44.entities.Scan.get(data.scan_id);
    const answers = [...(scan.answers || [])];
    const idx = answers.findIndex((a) => a.question === data.question);
    const from = idx >= 0 ? answers[idx].option : "BLANK";
    if (from === data.new_option) return { answers };

    if (idx >= 0) {
      answers[idx] = { question: data.question, option: data.new_option };
    } else {
      answers.push({ question: data.question, option: data.new_option });
    }
    await b44.entities.Scan.update(scan.id, { answers });
    await b44.entities.Correction.create({
      scan_id: scan.id,
      question: data.question,
      from_option: from,
      to_option: data.new_option,
      question_count: scan.question_count,
      options_count: scan.options_count,
    });
    return { answers };
  });

export const deleteScan = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data, context }) => {
    await context.getBase44().entities.Scan.delete(data.id);
    return { ok: true };
  });