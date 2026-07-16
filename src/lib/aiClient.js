/**
 * AI 클라이언트 (프론트엔드 → Vercel Serverless 브리지)
 * ------------------------------------------------------------------
 * ⚠️ 보안 원칙: Gemini/Claude API 키는 절대 브라우저에 존재하지 않습니다.
 *    이 모듈은 오직 자체 백엔드(/api/recommend-standards)만 호출하며,
 *    실제 AI API 호출과 키 관리는 서버리스 함수가 전담합니다.
 *
 * 동작 흐름:
 *   1) localKeywordSearch 로 611건 중 관련 후보 상위 N건을 추립니다.
 *      (전체 데이터를 프롬프트에 싣지 않아 토큰 비용/지연 최소화)
 *   2) 주제어 + 후보군을 /api/recommend-standards 에 POST 합니다.
 *   3) 백엔드(AI)가 융합 단원에 적합한 성취기준 조합과 추천 사유를 반환합니다.
 *   4) 백엔드가 없거나(로컬 미리보기) 오류가 나면, 로컬 점수 기반
 *      폴백 결과를 만들어 UI가 끊기지 않도록 합니다.
 */
import { localKeywordSearch, getBalancedSample, findByCode, truncate } from './standardsData.js';

const API_ENDPOINT = '/api/recommend-standards';
const RUBRIC_ENDPOINT = '/api/generate-rubric';
const LESSON_ENDPOINT = '/api/generate-lesson';
const REQUEST_TIMEOUT_MS = 25000;
const LONG_REQUEST_TIMEOUT_MS = 55000;

/** 공통 POST 헬퍼 (타임아웃 포함) */
async function postJson(endpoint, body, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API 응답 오류 (${res.status})`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * AI 융합 성취기준 추천
 * @param {string} topic  교사가 입력한 수업 소재/주제 (예: "강낭콩 키우기")
 * @param {object} opts   { grade?: '3~4학년' }
 * @returns {Promise<{
 *   source: 'ai' | 'local-fallback',
 *   theme: string,
 *   summary: string,
 *   items: Array<{ code, grade, subject, area, core_idea, description, reason }>
 * }>}
 */
export async function recommendStandards(topic, opts = {}) {
  const trimmed = String(topic || '').trim();
  if (!trimmed) {
    throw new Error('주제를 입력해 주세요.');
  }

  // 1) 후보군 프리필터 (상위 40건)
  let candidates = localKeywordSearch(trimmed, { grade: opts.grade || null, limit: 40 });

  // 1-1) 키워드 매칭이 빈약한 주제(예: '월드컵')는 과목별 균형 샘플로
  //      후보 풀을 보강하여, AI가 넓은 풀에서 직접 선별할 수 있게 한다.
  //      (보강 없이는 후보 0건 → AI 호출 자체가 불가능했던 문제 해결)
  if (candidates.length < 12) {
    const seen = new Set(candidates.map((c) => c.code));
    for (const s of getBalancedSample(opts.grade || null, 4)) {
      if (candidates.length >= 48) break;
      if (!seen.has(s.code)) {
        seen.add(s.code);
        candidates.push(s);
      }
    }
  }

  // 2) 백엔드 호출
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        topic: trimmed,
        grade: opts.grade || null,
        candidates: candidates.map((c) => ({
          code: c.code,
          grade: c.grade,
          subject: c.subject,
          area: c.area,
          description: c.description,
        })),
      }),
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`API 응답 오류 (${res.status})`);
    }

    const data = await res.json();
    if (!Array.isArray(data.items)) {
      throw new Error('API 응답 형식이 올바르지 않습니다.');
    }

    // 코드 기준으로 원본 데이터와 병합 (AI가 요약한 필드 대신 원문 보장)
    const items = data.items
      .map((item) => {
        const std = findByCode(item.code);
        return std ? { ...std, reason: item.reason || '' } : null;
      })
      .filter(Boolean);

    if (items.length === 0) throw new Error('추천 결과가 비어 있습니다.');

    return {
      source: 'ai',
      theme: data.theme || trimmed,
      summary: data.summary || '',
      items,
    };
  } catch (err) {
    // 3) 폴백: 로컬 점수 기반 추천 (개발 환경/오프라인에서도 UI 동작 보장)
    console.warn('[백워드 AI] AI 백엔드 호출 실패, 로컬 폴백 사용:', err?.message);
    return buildLocalFallback(trimmed, candidates);
  }
}

/* ==================================================================
 * Phase 3 — 평가 루브릭 생성
 * ================================================================== */

/**
 * AI 평가 루브릭 생성
 * @param {Array} standards  선택된 성취기준 (원본 객체 배열)
 * @param {string} topic     평가 장면/단원 주제 (선택)
 * @returns {Promise<{ source, title, items: [{ id, code, element, method, levels:{high,mid,low}, feedback }] }>}
 */
export async function generateRubric(standards, topic = '') {
  if (!Array.isArray(standards) || standards.length === 0) {
    throw new Error('성취기준을 먼저 선택해 주세요.');
  }

  const payload = {
    topic: String(topic || '').trim(),
    standards: standards.map(pickStandardFields),
  };

  try {
    const data = await postJson(RUBRIC_ENDPOINT, payload, LONG_REQUEST_TIMEOUT_MS);
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error('루브릭 응답이 비어 있습니다.');
    }
    return {
      source: 'ai',
      title: data.title || '과정 중심 평가 루브릭',
      items: data.items.map((it, i) => ({ id: `r${Date.now()}-${i}`, ...it })),
    };
  } catch (err) {
    console.warn('[백워드 AI] 루브릭 API 호출 실패, 로컬 폴백 사용:', err?.message);
    return buildLocalRubricFallback(standards, payload.topic);
  }
}

/** 과목 → 기본 평가 방법 매핑 (폴백용) */
const DEFAULT_METHODS = {
  국어: '구술·서술평가',
  수학: '서술평가(문제 해결 과정)',
  과학: '관찰평가(탐구 과정)',
  사회: '포트폴리오',
  영어: '구술평가',
  체육: '실기평가',
  음악: '실기평가',
  미술: '실기평가(작품·과정)',
  도덕: '자기평가·서술평가',
  실과: '실기평가(수행 과정)',
};

function buildLocalRubricFallback(standards, topic) {
  const items = standards.slice(0, 8).map((s, i) => {
    const element = `${firstClause(s.description)} 능력`;
    return {
      id: `r-fallback-${i}`,
      code: s.code,
      element,
      method: DEFAULT_METHODS[s.subject] || '관찰평가',
      levels: {
        high: `${firstClause(s.description)}의 과정과 이유를 스스로 설명하며 정확하게 수행한다.`,
        mid: `${firstClause(s.description)}을(를) 대체로 수행하나 일부 과정에서 정확성이 부족하다.`,
        low: `교사나 친구의 도움을 받아 ${firstClause(s.description)}의 기초 단계를 수행한다.`,
      },
      feedback: `수행 과정을 단계별로 나누어 시범을 보이고, '${topic || '수업 활동'}' 장면에서 재도전 기회를 제공한다.`,
    };
  });

  return {
    source: 'local-fallback',
    title: `${topic || '프로젝트'} 평가 루브릭 (참고용 초안)`,
    items,
  };
}

/* ==================================================================
 * Phase 3 — 수업 과정안 생성
 * ================================================================== */

/**
 * AI 백워드 수업 과정안 생성
 * @param {object} params { standards, rubric, topic }
 * @returns {Promise<{ source, title, target, overview, assessmentPlan, flow }>}
 */
export async function generateLessonPlan({ standards, rubric, topic = '' }) {
  if (!Array.isArray(standards) || standards.length === 0) {
    throw new Error('성취기준을 먼저 선택해 주세요.');
  }

  const payload = {
    topic: String(topic || '').trim(),
    standards: standards.map(pickStandardFields),
    rubric: rubric
      ? {
          title: rubric.title,
          items: rubric.items.map(({ code, element, method, levels, feedback }) => ({
            code,
            element,
            method,
            levels,
            feedback,
          })),
        }
      : null,
  };

  try {
    const data = await postJson(LESSON_ENDPOINT, payload, LONG_REQUEST_TIMEOUT_MS);
    if (!Array.isArray(data.flow) || data.flow.length === 0) {
      throw new Error('과정안 응답이 비어 있습니다.');
    }
    return { source: 'ai', ...withRowIds(data) };
  } catch (err) {
    console.warn('[백워드 AI] 과정안 API 호출 실패, 로컬 폴백 사용:', err?.message);
    return buildLocalLessonFallback({ standards, rubric, topic: payload.topic });
  }
}

/** flow/assessmentPlan 행에 클라이언트용 id 부여 */
function withRowIds(plan) {
  return {
    ...plan,
    assessmentPlan: (plan.assessmentPlan || []).map((row, i) => ({
      id: `a${Date.now()}-${i}`,
      ...row,
    })),
    flow: (plan.flow || []).map((row, i) => ({ id: `f${Date.now()}-${i}`, ...row })),
  };
}

function buildLocalLessonFallback({ standards, rubric, topic }) {
  const theme = topic || rubric?.title?.replace(/ 평가 루브릭.*/, '') || '프로젝트 수업';
  const uniqueCoreIdeas = [...new Set(standards.map((s) => s.core_idea).filter(Boolean))];
  const rubricItems = rubric?.items || [];
  const mainSubjects = [...new Set(standards.map((s) => s.subject))].join('·');

  const developRows = standards.slice(0, 3).map((s, i) => {
    const relatedRubric = rubricItems.find((r) => r.code === s.code);
    return {
      stage: '전개',
      teacher: `· [활동 ${i + 1}] '${firstClause(s.description)}' 활동을 안내하고 모둠을 순회하며 발문한다.\n· "어떻게 하면 더 정확하게 할 수 있을까?"라고 질문하며 사고를 확장한다.`,
      student: `· ${firstClause(s.description)} 활동을 모둠별로 수행한다.\n· 활동 결과를 기록지에 정리하고 모둠 친구와 비교하며 이야기 나눈다.`,
      time: i === 0 ? "10'" : "8'",
      notes: [
        `▣ 활동지, 기록판${i === 0 ? `, ${theme} 관련 실물 자료` : ''}`,
        `※ 모든 학생이 수행 기회를 가지도록 역할을 순환한다.`,
        relatedRubric
          ? `☞ [${s.code}] '${relatedRubric.element}' 관찰평가 (루브릭 ${i + 1}번 요소)`
          : `☞ [${s.code}] 수행 과정 관찰평가`,
      ].join('\n'),
    };
  });

  const plan = {
    source: 'local-fallback',
    title: `${theme} — 백워드 설계 수업 과정안 (참고용 초안)`,
    target: standards[0]?.grade ? `초등학교 ${standards[0].grade}` : '',
    overview: {
      coreIdeas:
        uniqueCoreIdeas.length > 0
          ? uniqueCoreIdeas.map((ci) => truncate(ci, 150)).join('\n')
          : '(핵심 아이디어 정보 없음)',
      standards: standards.map((s) => `[${s.code}] ${s.description}`).join('\n'),
      inquiryQuestion: `${theme} 활동에서 우리는 무엇을 발견하고, 어떻게 표현할 수 있을까?`,
      objective: `${theme} 활동을 통해 ${firstClause(standards[0].description)}할 수 있다.`,
      theme: `${theme} (${mainSubjects} 융합)`,
      intent: `본 수업은 백워드 설계에 따라 평가 루브릭의 평가 요소를 학습 활동 장면으로 구현하였다. 학생이 활동 중 자연스럽게 수행 증거를 드러내도록 하고, 교사는 순회 관찰과 즉각적 피드백으로 과정 중심 평가를 실시한다. (AI 서버 미연결 상태의 참고용 초안입니다)`,
    },
    assessmentPlan: rubricItems.map(({ method, element, levels, feedback }) => ({
      method,
      element,
      levels,
      feedback,
    })),
    flow: [
      {
        stage: '도입',
        teacher: `· ${theme}와 관련된 사진(영상)을 보여주며 경험을 묻는다.\n· 탐구 질문을 제시하고 학습 목표를 함께 확인한다.`,
        student: `· 자신의 경험을 자유롭게 발표한다.\n· 학습 목표를 소리 내어 읽고 활동 순서를 확인한다.`,
        time: "5'",
        notes: '▣ 동기 유발 사진(영상), 학습 목표 판\n※ 허용적인 분위기에서 모든 발표를 수용한다.',
      },
      ...developRows,
      {
        stage: '정리',
        teacher: `· 오늘 활동에서 새롭게 알게 된 점을 묻고 배움을 정리한다.\n· 다음 차시 활동을 예고하고 자기평가를 안내한다.`,
        student: `· 배움 공책에 알게 된 점·더 알고 싶은 점을 기록한다.\n· 자기평가 체크리스트에 스스로 표시한다.`,
        time: "5'",
        notes: '▣ 배움 공책, 자기평가 체크리스트\n☞ 자기평가 결과를 누가 기록에 반영',
      },
    ],
  };

  return withRowIds(plan);
}

/* ==================================================================
 * 공통 헬퍼
 * ================================================================== */

/** 서버로 보낼 성취기준 필드만 추림 */
function pickStandardFields(s) {
  return {
    code: s.code,
    grade: s.grade,
    subject: s.subject,
    area: s.area,
    description: s.description,
    core_idea: s.core_idea,
  };
}

/** 성취기준 문장에서 핵심 구절 추출 (문장 끝 어미 제거 근사) */
function firstClause(description) {
  return String(description || '')
    .replace(/[.。]\s*$/, '')
    .replace(/(한다|을 안다|를 안다|할 수 있다|가진다|기른다)$/u, '')
    .trim();
}

/** 로컬 폴백 결과 생성: 과목 다양성을 고려해 상위 후보에서 최대 5건 선별 */
function buildLocalFallback(topic, candidates) {
  const picked = [];
  const usedSubjects = new Map();

  // 균형 샘플로 보강된 후보(_score 없음)는 로컬 폴백에서 제외 —
  // 폴백은 키워드 근거가 있는 항목만 보여준다 (AI 없이 무관한 추천 방지)
  const scored = candidates.filter((c) => typeof c._score === 'number' && c._score > 0);

  for (const c of scored) {
    const count = usedSubjects.get(c.subject) || 0;
    if (count >= 2) continue; // 과목당 최대 2건 → 융합(교과 통합) 성격 유지
    picked.push(c);
    usedSubjects.set(c.subject, count + 1);
    if (picked.length >= 5) break;
  }

  return {
    source: 'local-fallback',
    theme: topic,
    summary:
      picked.length > 0
        ? `'${topic}' 주제와 관련성이 높은 성취기준을 키워드 분석으로 선별했습니다. (AI 서버 미연결 상태의 참고용 결과입니다)`
        : `'${topic}'와 직접 연결되는 성취기준을 찾지 못했습니다. 다른 표현으로 다시 검색하거나 아래 드롭다운에서 직접 선택해 보세요.`,
    items: picked.map((c) => ({
      ...c,
      reason: `성취기준 문구가 '${truncate(topic, 20)}' 활동과 직접 연결됩니다. (키워드 일치도 ${c._score}점)`,
    })),
  };
}
