/**
 * Vercel Serverless Function — AI 평가 루브릭 생성
 * ==================================================================
 * POST /api/generate-rubric
 * Body: {
 *   topic?: string,                      // 단원/평가 장면 (예: "강낭콩 키우기 프로젝트")
 *   standards: Array<{ code, grade, subject, area, description, core_idea }>
 * }
 *
 * 응답: {
 *   title: string,                       // 평가 명칭
 *   items: [{
 *     code: string,                      // 근거 성취기준 코드
 *     element: string,                   // 평가 요소
 *     method: string,                    // 평가 방법 (관찰, 구술, 서술, 포트폴리오 등)
 *     levels: { high, mid, low },        // 성취수준 상/중/하 기술
 *     feedback: string                   // 수준별 피드백 방향
 *   }]
 * }
 */
import { runPrompt, extractJson, asString, validateStandards } from './_lib/providers.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { topic, standards } = req.body || {};
  const safeStandards = validateStandards(standards, { min: 1, max: 8 });

  if (!safeStandards) {
    return res.status(400).json({ error: 'standards(성취기준 목록)가 올바르지 않습니다.' });
  }

  const prompt = buildPrompt({ topic: asString(topic, 200), standards: safeStandards });

  try {
    const raw = await runPrompt(prompt, { maxTokens: 6000, temperature: 0.4 });
    const parsed = extractJson(raw);

    const allowedCodes = new Set(safeStandards.map((s) => s.code));
    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((it) => it && allowedCodes.has(it.code))
      .slice(0, 10)
      .map((it) => ({
        code: it.code,
        element: asString(it.element, 120),
        method: asString(it.method, 40),
        levels: {
          high: asString(it?.levels?.high, 300),
          mid: asString(it?.levels?.mid, 300),
          low: asString(it?.levels?.low, 300),
        },
        feedback: asString(it.feedback, 300),
      }))
      .filter((it) => it.element && it.levels.high);

    if (items.length === 0) {
      return res.status(502).json({ error: 'AI가 유효한 루브릭을 생성하지 못했습니다.' });
    }

    return res.status(200).json({
      title: asString(parsed.title, 80) || '과정 중심 평가 루브릭',
      items,
    });
  } catch (err) {
    console.error('[generate-rubric] AI 호출 실패:', err);
    const status = err.statusCode || 502;
    return res.status(status).json({ error: err.message || '루브릭 생성 중 오류가 발생했습니다.' });
  }
}

function buildPrompt({ topic, standards }) {
  const standardLines = standards
    .map((s) => `- [${s.code}] (${s.grade} ${s.subject}/${s.area}) ${s.description}`)
    .join('\n');

  return `당신은 대한민국 2022 개정 교육과정과 과정 중심 평가에 정통한 초등 수석교사입니다.
아래 성취기준에 대한 '평가 루브릭'을 설계해 주세요.

## 수업/평가 장면
"${topic || '성취기준 기반 프로젝트 수업'}"

## 성취기준
${standardLines}

## 설계 지침
1. 성취기준마다 1개의 평가 요소를 도출하세요. (성취기준 코드를 반드시 함께 표기)
2. 평가 방법은 초등 과정 중심 평가에 적합한 것을 고르세요. (관찰평가, 구술평가, 서술평가, 실기평가, 포트폴리오, 자기평가, 동료평가 중)
3. 성취수준은 상/중/하 3단계로, 학생의 수행 모습이 눈에 그려지도록 구체적 행동 동사로 기술하세요.
   - '상'은 단순히 '~를 매우 잘한다'가 아니라 질적으로 구별되는 수행 특성을 담을 것
   - '하'는 결핍 서술("~를 못한다")이 아니라 교사 지원 조건("도움을 받아 ~한다")으로 기술할 것
4. 피드백은 '중/하' 수준 학생을 '상'으로 끌어올리기 위한 구체적 지도 방향으로 1~2문장 쓰세요.
5. 반드시 아래 JSON 형식으로만 답하세요. 다른 텍스트를 붙이지 마세요.

{
  "title": "평가 명칭 (예: 강낭콩 한살이 관찰 프로젝트 평가)",
  "items": [
    {
      "code": "성취기준 코드",
      "element": "평가 요소",
      "method": "평가 방법",
      "levels": { "high": "상 수준 기술", "mid": "중 수준 기술", "low": "하 수준 기술" },
      "feedback": "피드백 방향"
    }
  ]
}`;
}
