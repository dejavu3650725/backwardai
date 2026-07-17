/**
 * Vercel Serverless Function — 피드백 다국어 번역 (다문화 학생 지원)
 * ==================================================================
 * POST /api/translate-feedback
 * Body: { language: string, texts: [{ id, text }] }
 * 응답: { items: [{ id, text }] }
 */
import { runPrompt, extractJson, asString } from './_lib/providers.js';

const LANGUAGES = {
  en: 'English(영어)',
  zh: '中文(중국어 간체)',
  vi: 'Tiếng Việt(베트남어)',
  ru: 'Русский(러시아어)',
  ja: '日本語(일본어)',
  th: 'ภาษาไทย(태국어)',
  mn: 'Монгол(몽골어)',
  tl: 'Filipino(필리핀어)',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { language, texts } = req.body || {};
  const langName = LANGUAGES[language];
  if (!langName) {
    return res.status(400).json({ error: `지원하지 않는 언어입니다: ${language}` });
  }

  const safeTexts = (Array.isArray(texts) ? texts : [])
    .filter((t) => t && typeof t.id === 'string' && typeof t.text === 'string' && t.text.trim())
    .slice(0, 12)
    .map((t) => ({ id: t.id, text: asString(t.text, 600) }));

  if (safeTexts.length === 0) {
    return res.status(400).json({ error: 'texts(번역할 문장)가 비어 있습니다.' });
  }

  const lines = safeTexts.map((t) => `- id: ${t.id}\n  원문: ${t.text}`).join('\n');

  const prompt = `당신은 한국 초등학교의 다문화 학생을 돕는 전문 번역가입니다.
담임교사가 학생에게 보내는 아래 피드백을 ${langName}로 번역해 주세요.

## 번역할 피드백
${lines}

## 규칙
1. 초등학생이 읽는 글입니다 — 따뜻하고 쉬운 표현으로 자연스럽게 번역하세요.
2. 학생 이름(호칭)은 그대로 유지하세요.
3. 격려의 어조를 살리고, 의역이 자연스러우면 의역하세요.
4. 반드시 아래 JSON 형식으로만 답하세요.

{ "items": [ { "id": "...", "text": "번역문" } ] }`;

  try {
    const raw = await runPrompt(prompt, { maxTokens: 4000, temperature: 0.3 });
    const parsed = extractJson(raw);
    const validIds = new Set(safeTexts.map((t) => t.id));
    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((it) => it && validIds.has(it.id) && typeof it.text === 'string')
      .map((it) => ({ id: it.id, text: asString(it.text, 800) }));

    if (items.length === 0) {
      return res.status(502).json({ error: 'AI가 번역을 생성하지 못했습니다.' });
    }
    return res.status(200).json({ items });
  } catch (err) {
    console.error('[translate-feedback] AI 호출 실패:', err);
    return res.status(err.statusCode || 502).json({ error: err.message || '번역 중 오류' });
  }
}
