/**
 * Vercel Serverless Function — AI 백워드 수업 과정안 생성
 * ==================================================================
 * POST /api/generate-lesson
 * Body: {
 *   topic?: string,                          // 단원/수업 주제
 *   standards: Array<{ code, grade, subject, area, description, core_idea }>,
 *   rubric?: { title, items: [{ code, element, method, levels:{high,mid,low}, feedback }] }
 * }
 *
 * 응답 (학교 현장 결재 문서 표준 양식):
 * {
 *   "title": "수업 과정안 제목",
 *   "target": "대상 (예: 초등학교 3~4학년)",
 *   "overview": {
 *     "coreIdeas":       "교육과정 분석 — 핵심 아이디어 요약",
 *     "standards":       "교육과정 분석 — 성취기준 (코드+전문)",
 *     "inquiryQuestion": "탐구 질문",
 *     "objective":       "학습 목표",
 *     "theme":           "학습 주제",
 *     "intent":          "수업자의 의도 (수업·평가 주안점)"
 *   },
 *   "assessmentPlan": [{ "method", "element", "levels": {"high","mid","low"}, "feedback" }],
 *   "flow": [{ "stage": "도입|전개|정리", "teacher", "student", "time": "5'", "notes": "▣ …\n※ …\n☞ …" }]
 * }
 */
import { runPrompt, extractJson, asString, validateStandards } from './_lib/providers.js';

const STAGES = ['도입', '전개', '정리'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { topic, standards, rubric } = req.body || {};
  const safeStandards = validateStandards(standards, { min: 1, max: 8 });

  if (!safeStandards) {
    return res.status(400).json({ error: 'standards(성취기준 목록)가 올바르지 않습니다.' });
  }

  const safeRubric = sanitizeRubric(rubric);
  const prompt = buildPrompt({
    topic: asString(topic, 200),
    standards: safeStandards,
    rubric: safeRubric,
  });

  try {
    const raw = await runPrompt(prompt, { maxTokens: 8000, temperature: 0.5 });
    const parsed = extractJson(raw);
    const plan = sanitizePlan(parsed, { topic, standards: safeStandards, rubric: safeRubric });

    if (plan.flow.length === 0) {
      return res.status(502).json({ error: 'AI가 유효한 과정안을 생성하지 못했습니다.' });
    }

    return res.status(200).json(plan);
  } catch (err) {
    console.error('[generate-lesson] AI 호출 실패:', err);
    const status = err.statusCode || 502;
    return res.status(status).json({ error: err.message || '과정안 생성 중 오류가 발생했습니다.' });
  }
}

/* ------------------------------------------------------------------
 * 입력 루브릭 정제
 * ---------------------------------------------------------------- */
function sanitizeRubric(rubric) {
  if (!rubric || !Array.isArray(rubric.items)) return null;
  const items = rubric.items
    .filter((it) => it && typeof it.element === 'string')
    .slice(0, 10)
    .map((it) => ({
      code: asString(it.code, 20),
      element: asString(it.element, 120),
      method: asString(it.method, 40),
      levels: {
        high: asString(it?.levels?.high, 300),
        mid: asString(it?.levels?.mid, 300),
        low: asString(it?.levels?.low, 300),
      },
      feedback: asString(it.feedback, 300),
    }));
  return items.length > 0 ? { title: asString(rubric.title, 80), items } : null;
}

/* ------------------------------------------------------------------
 * 출력 과정안 정제 — 화면 표 렌더링이 절대 깨지지 않도록 강제
 * ---------------------------------------------------------------- */
function sanitizePlan(parsed, { topic, standards, rubric }) {
  const overview = parsed.overview || {};

  const assessmentPlan = (Array.isArray(parsed.assessmentPlan) ? parsed.assessmentPlan : [])
    .slice(0, 10)
    .map((row) => ({
      method: asString(row?.method, 40),
      element: asString(row?.element, 120),
      levels: {
        high: asString(row?.levels?.high, 300),
        mid: asString(row?.levels?.mid, 300),
        low: asString(row?.levels?.low, 300),
      },
      feedback: asString(row?.feedback, 300),
    }))
    .filter((row) => row.element);

  const flow = (Array.isArray(parsed.flow) ? parsed.flow : [])
    .slice(0, 14)
    .map((row) => ({
      stage: STAGES.includes(row?.stage) ? row.stage : '전개',
      teacher: asString(row?.teacher, 600),
      student: asString(row?.student, 600),
      time: asString(row?.time, 12),
      notes: asString(row?.notes, 500),
    }))
    .filter((row) => row.teacher || row.student);

  return {
    title: asString(parsed.title, 100) || `${topic || '프로젝트'} 수업 과정안`,
    target: asString(parsed.target, 60) || standards[0]?.grade || '',
    overview: {
      coreIdeas:
        asString(overview.coreIdeas, 1200) ||
        [...new Set(standards.map((s) => s.core_idea).filter(Boolean))].join('\n'),
      standards:
        asString(overview.standards, 1200) ||
        standards.map((s) => `[${s.code}] ${s.description}`).join('\n'),
      inquiryQuestion: asString(overview.inquiryQuestion, 300),
      objective: asString(overview.objective, 400),
      theme: asString(overview.theme, 200) || topic || '',
      intent: asString(overview.intent, 800),
    },
    assessmentPlan:
      assessmentPlan.length > 0
        ? assessmentPlan
        : (rubric?.items || []).map((it) => ({
            method: it.method,
            element: it.element,
            levels: it.levels,
            feedback: it.feedback,
          })),
    flow,
  };
}

/* ------------------------------------------------------------------
 * 프롬프트 구성 — 백워드 설계 관점 + 결재 문서 표준 양식 강제
 * ---------------------------------------------------------------- */
function buildPrompt({ topic, standards, rubric }) {
  const standardLines = standards
    .map((s) => `- [${s.code}] (${s.grade} ${s.subject}/${s.area}) ${s.description}`)
    .join('\n');

  const coreIdeaLines = [...new Set(standards.map((s) => s.core_idea).filter(Boolean))]
    .map((ci) => `- ${ci.slice(0, 300)}`)
    .join('\n');

  const rubricLines = rubric
    ? rubric.items
        .map(
          (it) =>
            `- [${it.code}] 평가 요소: ${it.element} / 방법: ${it.method}\n  상: ${it.levels.high}\n  중: ${it.levels.mid}\n  하: ${it.levels.low}\n  피드백: ${it.feedback}`
        )
        .join('\n')
    : '(루브릭 미확정 — 성취기준에서 평가 계획을 직접 도출할 것)';

  return `당신은 대한민국 초등학교 수업 컨설팅을 담당하는 수석교사입니다.
백워드 설계(Backward Design)에 따라, 이미 확정된 [성취기준]과 [평가 루브릭]으로부터
거꾸로 수업을 설계하여 학교 현장 결재 문서 표준 양식의 '수업 과정안'을 작성해 주세요.

## 수업 주제
"${topic || '성취기준 기반 프로젝트 수업'}"

## 1단계에서 확정된 성취기준
${standardLines}

## 핵심 아이디어 (교육과정 원문)
${coreIdeaLines || '(없음)'}

## 2단계에서 확정된 평가 루브릭
${rubricLines}

## 작성 지침
1. **백워드 원칙**: 모든 학습 활동은 루브릭의 평가 요소를 수행·증명하는 장면이 되도록 설계하세요. 평가와 무관한 활동을 넣지 마세요.
2. **탐구 질문**: 학생의 삶과 연결된, 정답이 열려 있는 본질적 질문 1개를 만드세요.
3. **학습 목표**: "~를 통해 ~할 수 있다" 형태로, 성취기준의 행동 동사를 살려 쓰세요.
4. **수업자의 의도**: 왜 이 순서로 수업·평가를 배치했는지(주안점)를 3~4문장으로 쓰세요.
5. **교수·학습 흐름(flow)**: 도입(1~2행) → 전개(3~5행) → 정리(1~2행), 총 40분 기준으로 시간을 배분하세요. (time은 "5'" 형식)
6. **flow의 notes 칸**: 다음 기호를 사용해 줄바꿈(\\n)으로 구분하여 쓰세요.
   - "▣ " 뒤에 수업 자료·준비물
   - "※ " 뒤에 지도상 유의점
   - "☞ " 뒤에 평가 장면 (루브릭의 어떤 평가 요소를 관찰하는지 명시) — 전개 단계에 최소 2회 포함
7. **교사 활동/학생 활동**: 발문과 예상 반응이 눈에 그려지도록 구체적으로 쓰세요. 여러 항목은 "· "로 시작하는 줄로 구분하세요.
8. 반드시 아래 JSON 형식으로만 답하세요. 다른 텍스트를 붙이지 마세요.

{
  "title": "과정안 제목 (예: 강낭콩과 함께 자라는 우리 — 관찰 프로젝트)",
  "target": "대상 학년 (예: 초등학교 3~4학년)",
  "overview": {
    "coreIdeas": "핵심 아이디어 요약 (2~3문장)",
    "standards": "[코드] 성취기준 전문 (줄바꿈으로 구분)",
    "inquiryQuestion": "탐구 질문",
    "objective": "학습 목표",
    "theme": "학습 주제",
    "intent": "수업자의 의도 (수업·평가 주안점)"
  },
  "assessmentPlan": [
    { "method": "평가 방법", "element": "평가 요소", "levels": { "high": "상", "mid": "중", "low": "하" }, "feedback": "피드백" }
  ],
  "flow": [
    { "stage": "도입", "teacher": "교사 활동", "student": "학생 활동", "time": "5'", "notes": "▣ …\\n※ …" },
    { "stage": "전개", "teacher": "…", "student": "…", "time": "15'", "notes": "▣ …\\n☞ …" },
    { "stage": "정리", "teacher": "…", "student": "…", "time": "5'", "notes": "※ …" }
  ]
}`;
}
