/**
 * Vercel Serverless Function — 학생 답안 AI 평가·피드백
 * ==================================================================
 * POST /api/evaluate-answer
 * Body: {
 *   studentName: string,
 *   questions: [{ qid, code, element, method, type, prompt,
 *                 levels: { high, mid, low } }],
 *   answers:   [{ qid, text?, level?('high'|'mid'|'low'), target? }]
 * }
 *
 * 응답: {
 *   items: [{ qid, level: 'high'|'mid'|'low',
 *             feedback: string,   // 학생에게 전송될 성장 중심 피드백
 *             reason: string }],  // 교사용 판정 근거
 *   overall: string               // 종합 코멘트 (교사 참고)
 * }
 *
 * ⚠️ 이 결과는 '초안'입니다. 교사가 검토·수정·승인해야 학생에게
 *    전송됩니다. (교사의 평가권 보장)
 */
import { runPrompt, extractJson, asString } from './_lib/providers.js';

const LEVELS = ['high', 'mid', 'low'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { studentName, questions, answers } = req.body || {};

  const safeQuestions = (Array.isArray(questions) ? questions : [])
    .filter((q) => q && typeof q.qid === 'string' && typeof q.element === 'string')
    .slice(0, 10)
    .map((q) => ({
      qid: q.qid,
      code: asString(q.code, 20),
      element: asString(q.element, 120),
      method: asString(q.method, 40),
      type: asString(q.type, 10),
      prompt: asString(q.prompt, 300),
      levels: {
        high: asString(q?.levels?.high, 300),
        mid: asString(q?.levels?.mid, 300),
        low: asString(q?.levels?.low, 300),
      },
    }));

  const safeAnswers = (Array.isArray(answers) ? answers : [])
    .filter((a) => a && typeof a.qid === 'string')
    .slice(0, 10)
    .map((a) => ({
      qid: a.qid,
      text: asString(a.text, 2000),
      level: LEVELS.includes(a.level) ? a.level : null,
      target: asString(a.target, 60),
    }));

  if (safeQuestions.length === 0 || safeAnswers.length === 0) {
    return res.status(400).json({ error: 'questions/answers가 올바르지 않습니다.' });
  }

  const prompt = buildPrompt({
    studentName: asString(studentName, 30) || '학생',
    questions: safeQuestions,
    answers: safeAnswers,
  });

  try {
    const raw = await runPrompt(prompt, { maxTokens: 6000, temperature: 0.3 });
    const parsed = extractJson(raw);

    const validQids = new Set(safeQuestions.map((q) => q.qid));
    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((it) => it && validQids.has(it.qid) && LEVELS.includes(it.level))
      .map((it) => ({
        qid: it.qid,
        level: it.level,
        feedback: asString(it.feedback, 500),
        reason: asString(it.reason, 300),
      }));

    if (items.length === 0) {
      return res.status(502).json({ error: 'AI가 유효한 평가 결과를 생성하지 못했습니다.' });
    }

    return res.status(200).json({
      items,
      overall: asString(parsed.overall, 500),
    });
  } catch (err) {
    console.error('[evaluate-answer] AI 호출 실패:', err);
    const status = err.statusCode || 502;
    return res.status(status).json({ error: err.message || 'AI 평가 중 오류가 발생했습니다.' });
  }
}

function buildPrompt({ studentName, questions, answers }) {
  const answerByQid = new Map(answers.map((a) => [a.qid, a]));

  const blocks = questions
    .map((q) => {
      const a = answerByQid.get(q.qid);
      if (!a) return null;
      const answerLine =
        q.type === 'self'
          ? `학생 자기평가 선택: ${a.level ? { high: '상', mid: '중', low: '하' }[a.level] : '(미선택)'}\n선택 이유: ${a.text || '(없음)'}`
          : q.type === 'peer'
            ? `평가 대상: ${a.target || '(미기재)'}\n학생 답변: ${a.text || '(없음)'}`
            : `학생 답변: ${a.text || '(없음)'}`;

      return `### 문항 ${q.qid} [${q.code}] (평가 방법: ${q.method})
평가 요소: ${q.element}
질문: ${q.prompt}
성취수준 기준:
- 상: ${q.levels.high}
- 중: ${q.levels.mid}
- 하: ${q.levels.low}
${answerLine}`;
    })
    .filter(Boolean)
    .join('\n\n');

  return `당신은 대한민국 초등학교 담임교사이자 과정 중심 평가 전문가입니다.
'${studentName}' 학생의 평가 답안을 아래 루브릭에 따라 평가하고, 학생에게 보낼 피드백 초안을 작성해 주세요.

${blocks}

## 평가 지침
1. 각 문항마다 성취수준 기준(상/중/하)과 학생 답변을 대조하여 level을 판정하세요. (high=상, mid=중, low=하)
2. 자기평가 문항은 학생이 선택한 수준을 참고하되, 선택 이유의 구체성을 근거로 최종 판정하세요.
3. feedback은 학생에게 직접 전송되는 글입니다:
   - "${studentName} 님" 하고 이름을 부르며 시작
   - 초등학생이 이해하기 쉬운 따뜻한 존댓말("~했어요", "~해 보세요")
   - 잘한 점 1가지 + 성장을 위한 구체적 제안 1가지, 총 2~3문장
   - 점수나 등급 언급 금지, 답변에 실제로 쓴 내용을 인용하며 칭찬할 것
4. reason은 교사만 보는 판정 근거 1문장입니다. (루브릭 기준과 연결하여)
5. overall은 이 학생의 전반적 성취와 지도 방향 1~2문장입니다. (교사 참고용)
6. 반드시 아래 JSON 형식으로만 답하세요.

{
  "items": [
    { "qid": "q1", "level": "high", "feedback": "학생 피드백", "reason": "판정 근거" }
  ],
  "overall": "종합 코멘트"
}`;
}
