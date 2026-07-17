/**
 * Vercel Serverless Function — 학생 눈높이 평가 문항 다듬기
 * ==================================================================
 * POST /api/generate-questions
 * Body: { grade?: string, items: [{ qid, element, method, type }] }
 * 응답: { items: [{ qid, prompt }] }
 *
 * 루브릭의 평가 요소는 교사용 전문 용어("~ 이해 및 흥미도")라서
 * 학생에게 그대로 물으면 어렵습니다. 이 함수는 각 문항을
 * 해당 학년 초등학생이 바로 이해할 수 있는 쉬운 질문으로 바꿉니다.
 */
import { runPrompt, extractJson, asString } from './_lib/providers.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { grade, items } = req.body || {};
  const safeItems = (Array.isArray(items) ? items : [])
    .filter((it) => it && typeof it.qid === 'string' && typeof it.element === 'string')
    .slice(0, 10)
    .map((it) => ({
      qid: it.qid,
      element: asString(it.element, 120),
      method: asString(it.method, 40),
      type: asString(it.type, 10),
    }));

  if (safeItems.length === 0) {
    return res.status(400).json({ error: 'items(문항 목록)가 올바르지 않습니다.' });
  }

  const itemLines = safeItems
    .map(
      (it) =>
        `- qid: ${it.qid} / 평가 요소: ${it.element} / 유형: ${
          it.type === 'self' ? '자기평가(수준 선택+까닭)' : it.type === 'peer' ? '동료평가' : '서술형'
        }`
    )
    .join('\n');

  const prompt = `당신은 ${asString(grade, 20) || '초등학교'} 담임교사입니다.
아래 평가 요소들을 학생이 태블릿으로 직접 답하는 평가 문항으로 바꿔 주세요.

## 평가 요소 목록
${itemLines}

## 작성 규칙
1. 해당 학년 초등학생이 한 번에 이해할 수 있는 쉬운 낱말만 쓰세요. (교육과정 용어·한자어 금지: "작동 원리 이해 및 흥미도" ❌ → "로봇이 어떻게 움직이는지 알게 된 점" ⭕)
2. 학생의 실제 경험을 떠올리게 하는 구체적 질문으로 쓰세요. 1~2문장, 부드러운 존댓말("~해 보세요", "~써 보세요").
3. 유형별 형식:
   - 서술형: 활동에서 한 일 + 알게 된 점 + 그렇게 생각한 까닭을 쓰도록 유도
   - 자기평가: "스스로 평가해 봅시다. 나의 수준을 고르고 까닭을 써 보세요"로 끝맺기
   - 동료평가: 친구의 잘한 점 + 도와주고 싶은 점을 쓰도록 유도
4. 반드시 아래 JSON 형식으로만 답하세요.

{ "items": [ { "qid": "q1", "prompt": "쉬운 말로 바꾼 문항" } ] }`;

  try {
    const raw = await runPrompt(prompt, { maxTokens: 3000, temperature: 0.5 });
    const parsed = extractJson(raw);
    const validQids = new Set(safeItems.map((it) => it.qid));
    const out = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((it) => it && validQids.has(it.qid) && typeof it.prompt === 'string')
      .map((it) => ({ qid: it.qid, prompt: asString(it.prompt, 300) }));

    if (out.length === 0) {
      return res.status(502).json({ error: 'AI가 유효한 문항을 생성하지 못했습니다.' });
    }
    return res.status(200).json({ items: out });
  } catch (err) {
    console.error('[generate-questions] AI 호출 실패:', err);
    return res.status(err.statusCode || 502).json({ error: err.message || '문항 생성 중 오류' });
  }
}
