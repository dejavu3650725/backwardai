/**
 * Vercel Serverless Function — 학교생활기록부 문구 생성 (Step 5)
 * ==================================================================
 * POST /api/generate-record
 * Body: {
 *   grade?: string,
 *   maxLength?: number,          // 목표 글자 수 (기본 400자)
 *   records: [{ code, element, method, level('high'|'mid'|'low'),
 *               feedback, answerExcerpt? }]
 * }
 * 응답: { text: string }
 *
 * ⚠️ 2026학년도 초등학교 학교생활기록부 기재요령을 프롬프트 수준에서
 *    강제합니다. (개조식 '~함.' 종결, 정량 데이터·수상 실적 금지 등)
 *    생성 결과는 '초안'이며 최종 기재 책임은 교사에게 있습니다.
 */
import { runPrompt, extractJson, asString } from './_lib/providers.js';

const LEVEL_KO = { high: '상', mid: '중', low: '하' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { grade, maxLength, records } = req.body || {};
  const limit = Math.min(Math.max(parseInt(maxLength, 10) || 400, 100), 1500);

  const safeRecords = (Array.isArray(records) ? records : [])
    .filter((r) => r && typeof r.element === 'string')
    .slice(0, 10)
    .map((r) => ({
      code: asString(r.code, 20),
      element: asString(r.element, 120),
      method: asString(r.method, 40),
      level: ['high', 'mid', 'low'].includes(r.level) ? r.level : 'mid',
      feedback: asString(r.feedback, 500),
      answerExcerpt: asString(r.answerExcerpt, 300),
    }));

  if (safeRecords.length === 0) {
    return res.status(400).json({ error: 'records(평가 기록)가 비어 있습니다.' });
  }

  const recordLines = safeRecords
    .map(
      (r) =>
        `- [${r.code}] ${r.element} (${r.method}, 성취수준: ${LEVEL_KO[r.level]})
  교사 확정 피드백: ${r.feedback}${r.answerExcerpt ? `\n  학생 답변 발췌: ${r.answerExcerpt}` : ''}`
    )
    .join('\n');

  const prompt = `당신은 대한민국 초등학교 담임교사이며, 학교생활기록부 기재요령에 정통한 전문가입니다.
아래 과정 중심 평가 기록을 바탕으로 ${asString(grade, 20) || '초등학교'} 학생의
학교생활기록부 '교과학습발달상황(과목별 세부능력 및 특기사항)' 문구 초안을 작성해 주세요.

## 평가 기록 (교사가 승인한 결과)
${recordLines}

# 생기부 기재요령(2026학년도 초등학교 기준) 엄수 지침
학생의 평가 결과와 피드백을 바탕으로 문장을 생성할 때, 아래의 공식 기재요령을 절대적으로 준수할 것.

**[작성 원칙: Do's]**
- 교과 학습 발달 상황, 성취기준 도달 정도, 학습 참여도 및 태도를 객관적 관찰에 근거하여 긍정적이고 구체적인 언어로 서술할 것.
- 학생의 구체적인 성장 사례와 과정 중심 평가 결과를 명확히 드러낼 것.
- 문장의 끝맺음은 '~함.', '~하는 모습이 돋보임.', '~하는 능력이 우수함.' 등의 명사형/개조식 서술을 사용할 것.

**[절대 금지 사항: Don'ts]**
- 구체적인 점수, 등수, 지능지수, 모의고사 성적 등 수치화된 정량 데이터 기재 절대 금지.
- 교내외 대회 수상 실적, 인증 시험 성적, 영재교육원 교육 이수 사실 기재 절대 금지.
- 학원, 과외 등 사교육 유발 요인이 포함된 내용 절대 금지.
- 지나치게 과장된 표현이나 주관적인 감정 표현 배제.

## 추가 지침
1. 학생 이름을 문구에 넣지 마세요. (생기부는 이름 없이 서술)
2. '상/중/하' 같은 수준 표기를 문구에 직접 쓰지 마세요. 수준은 서술의 결로 드러내되,
   '하' 수준도 결핍이 아닌 관심·참여·성장 가능성 중심으로 긍정 서술하세요.
3. 학생 답변에서 드러난 구체적 행동·사고를 근거로 쓰세요. (막연한 칭찬 금지)
4. 전체 분량은 공백 포함 ${limit}자 이내로 작성하세요.
5. 반드시 아래 JSON 형식으로만 답하세요.

{ "text": "생기부 문구 초안" }`;

  try {
    const raw = await runPrompt(prompt, { maxTokens: 4000, temperature: 0.4 });
    const parsed = extractJson(raw);
    const text = asString(parsed.text, limit + 200).trim();

    if (!text) {
      return res.status(502).json({ error: 'AI가 유효한 문구를 생성하지 못했습니다.' });
    }
    return res.status(200).json({ text });
  } catch (err) {
    console.error('[generate-record] AI 호출 실패:', err);
    return res.status(err.statusCode || 502).json({ error: err.message || '문구 생성 중 오류' });
  }
}
