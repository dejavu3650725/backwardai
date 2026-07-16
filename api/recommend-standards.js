/**
 * Vercel Serverless Function — AI 융합 성취기준 추천
 * ==================================================================
 * POST /api/recommend-standards
 * Body: { topic: string, grade?: string, candidates: Array<{code, grade, subject, area, description}> }
 *
 * 🔐 보안 설계
 *  - AI API 키는 api/_lib/providers.js 를 통해 process.env 에서만 읽습니다.
 *  - 클라이언트는 이 엔드포인트만 알고 있으며, 키는 응답에 절대 포함되지 않습니다.
 *
 * 응답: { theme: string, summary: string, items: [{ code, reason }] }
 */
import { runPrompt, extractJson, asString } from './_lib/providers.js';

const MAX_CANDIDATES = 60;
const MAX_TOPIC_LENGTH = 200;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { topic, grade, candidates } = req.body || {};

  if (typeof topic !== 'string' || !topic.trim()) {
    return res.status(400).json({ error: 'topic(수업 주제)은 필수입니다.' });
  }
  if (topic.length > MAX_TOPIC_LENGTH) {
    return res.status(400).json({ error: `topic은 ${MAX_TOPIC_LENGTH}자 이내여야 합니다.` });
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({
      error: 'candidates(후보 성취기준 목록)가 비어 있습니다. 클라이언트 프리필터를 확인하세요.',
    });
  }

  const safeCandidates = candidates.slice(0, MAX_CANDIDATES).filter(
    (c) =>
      c &&
      typeof c.code === 'string' &&
      typeof c.subject === 'string' &&
      typeof c.description === 'string'
  );

  if (safeCandidates.length === 0) {
    return res.status(400).json({ error: '유효한 후보 성취기준이 없습니다.' });
  }

  const prompt = buildPrompt({ topic: topic.trim(), grade, candidates: safeCandidates });

  try {
    const raw = await runPrompt(prompt, { maxTokens: 4000, temperature: 0.4 });
    const parsed = extractJson(raw);

    // 출력 검증: 후보에 없는 코드는 제거(환각 방지)
    const allowedCodes = new Set(safeCandidates.map((c) => c.code));
    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((it) => it && allowedCodes.has(it.code))
      .slice(0, 6)
      .map((it) => ({ code: it.code, reason: asString(it.reason, 300) }));

    if (items.length === 0) {
      return res.status(502).json({ error: 'AI가 유효한 성취기준을 선택하지 못했습니다.' });
    }

    return res.status(200).json({
      theme: asString(parsed.theme, 80) || topic.trim(),
      summary: asString(parsed.summary, 500),
      items,
    });
  } catch (err) {
    console.error('[recommend-standards] AI 호출 실패:', err);
    const status = err.statusCode || 502;
    return res.status(status).json({ error: err.message || 'AI 추천 생성 중 오류가 발생했습니다.' });
  }
}

function buildPrompt({ topic, grade, candidates }) {
  const candidateLines = candidates
    .map((c) => `- [${c.code}] (${c.grade || ''} ${c.subject}/${c.area}) ${c.description}`)
    .join('\n');

  return `당신은 대한민국 2022 개정 교육과정에 정통한 초등 수석교사입니다.
교사가 계획 중인 수업 주제에 가장 적합한 '교과 융합' 성취기준 조합을 추천해 주세요.

## 수업 주제
"${topic}"${grade ? `\n(대상 학년군: ${grade})` : ''}

## 후보 성취기준 (이 목록 안에서만 선택할 것)
${candidateLines}

## 요구사항
1. 후보 중에서 주제와의 연계성이 높은 성취기준을 3~6개 선택하세요.
2. 가능하면 2개 이상의 과목이 포함되도록 '융합' 관점에서 조합하세요.
3. 각 성취기준마다 이 주제 수업에서 어떻게 구현되는지 1~2문장의 추천 사유를 쓰세요.
4. 반드시 아래 JSON 형식으로만 답하세요. 다른 텍스트를 붙이지 마세요.

{
  "theme": "융합 단원명 (예: 강낭콩과 함께 자라는 우리)",
  "summary": "이 조합이 왜 좋은 융합 단원이 되는지 2~3문장 설명",
  "items": [
    { "code": "성취기준 코드", "reason": "추천 사유" }
  ]
}`;
}
