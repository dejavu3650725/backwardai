/**
 * api/_lib/providers.js — AI 공급자 공통 모듈 (서버 전용)
 * ==================================================================
 * Vercel은 api/ 안에서 밑줄(_)로 시작하는 폴더/파일을 라우트로
 * 만들지 않으므로, 여러 서버리스 함수가 공유하는 헬퍼를 여기에 둡니다.
 *
 * 🔐 API 키는 오직 process.env 에서만 읽습니다. (클라이언트 노출 불가)
 */

/** 사용 가능한 공급자 확인. 없으면 null 반환 */
export function pickProvider() {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  return null;
}

/**
 * 프롬프트를 실행하고 텍스트를 반환합니다.
 * @param {string} prompt
 * @param {{ maxTokens?: number, temperature?: number }} opts
 */
export async function runPrompt(prompt, opts = {}) {
  const provider = pickProvider();
  if (!provider) {
    const err = new Error(
      'AI API 키가 설정되지 않았습니다. Vercel 환경변수에 GEMINI_API_KEY 또는 ANTHROPIC_API_KEY를 등록하세요.'
    );
    err.statusCode = 503;
    throw err;
  }
  return provider === 'gemini'
    ? callGemini(process.env.GEMINI_API_KEY, prompt, opts)
    : callClaude(process.env.ANTHROPIC_API_KEY, prompt, opts);
}

/* ── Gemini (REST) ─────────────────────────────────────────────── */

/** 워밍된 람다 인스턴스 안에서 재사용되는 모델명 캐시 */
let cachedGeminiModel = null;

/** 이 키로 generateContent 가능한 모델 목록 조회 */
export async function listGeminiModels(apiKey) {
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=50',
    { headers: { 'x-goog-api-key': apiKey } }
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini 모델 목록 조회 실패 ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name || '').replace(/^models\//, ''))
    .filter(Boolean);
}

/** 시도할 모델 우선순위 (2026년 기준 현행 → 구형 순) */
const PREFERRED_MODELS = [
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
];

/**
 * 모델 후보 목록 구성
 * - GEMINI_MODEL 환경변수 → 성공 캐시 → (가능하면) 목록 조회 결과 → 정적 우선순위
 * - ⚠️ 신형 AQ. 키는 ListModels를 거부(401)하는 경우가 있으므로,
 *   목록 조회는 '실패해도 무시하는' 선택 단계다. 절대 여기서 죽지 않는다.
 */
export async function buildGeminiCandidates(apiKey) {
  const candidates = [];
  if (process.env.GEMINI_MODEL) candidates.push(process.env.GEMINI_MODEL);
  if (cachedGeminiModel) candidates.push(cachedGeminiModel);

  try {
    const models = await listGeminiModels(apiKey);
    const discovered =
      PREFERRED_MODELS.find((p) => models.includes(p)) ||
      models
        .filter((n) => n.includes('flash') && !/image|audio|live|tts|embedding/.test(n))
        .sort()
        .reverse()[0];
    if (discovered) candidates.push(discovered);
  } catch {
    // ListModels 미지원 키(AQ. 등) → 정적 우선순위로 진행
  }

  candidates.push(...PREFERRED_MODELS);
  return [...new Set(candidates)];
}

export async function callGemini(apiKey, prompt, { maxTokens = 4000, temperature = 0.4 } = {}) {
  const doCall = async (modelName, disableThinking) => {
    const generationConfig = {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
    };
    // ⚠️ 2.5+ 세대는 '생각(thinking)' 토큰이 출력 예산을 잠식해 JSON이
    //    중간에 잘릴 수 있다 → 생각 기능을 끈다. (미지원 모델은 400을
    //    반환하므로 아래에서 생각 설정 없이 1회 재시도)
    if (disableThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };

    // 인증은 x-goog-api-key 헤더 사용 (신형 AQ. 키 포함 공식 권장 방식)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      }),
    });
  };

  const candidates = await buildGeminiCandidates(apiKey);
  let lastError = null;

  for (const model of candidates) {
    let response = await doCall(model, true);

    // thinkingConfig 미지원 모델(구형)은 400 → 설정 없이 재시도
    if (response.status === 400) {
      response = await doCall(model, false);
    }

    if (response.ok) {
      cachedGeminiModel = model; // 성공한 모델을 기억해 다음 호출부터 바로 사용
      const data = await response.json();
      const candidate = data?.candidates?.[0];
      const text = candidate?.content?.parts?.map((p) => p.text || '').join('');
      if (!text) {
        throw new Error(
          `Gemini(${model}) 응답에 텍스트가 없습니다. (finishReason: ${
            candidate?.finishReason || '알 수 없음'
          })`
        );
      }
      return text;
    }

    const body = await response.text();
    lastError = `Gemini API ${response.status} (모델: ${model}): ${body.slice(0, 200)}`;

    // 404(존재하지 않는 모델)만 다음 후보로 넘어가고,
    // 401/403 등 인증·권한 오류는 모델을 바꿔도 소용없으므로 즉시 중단
    if (response.status !== 404) break;
    if (cachedGeminiModel === model) cachedGeminiModel = null;
  }

  throw new Error(lastError || '사용 가능한 Gemini 모델을 찾지 못했습니다.');
}

/* ── Claude (REST) ─────────────────────────────────────────────── */
export async function callClaude(apiKey, prompt, { maxTokens = 1500, temperature = 0.4 } = {}) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude API ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error('Claude 응답에 텍스트가 없습니다.');
  return text;
}

/* ── 관용적 JSON 파서 + 자동 수리 ─────────────────────────────── */
/**
 * AI 응답에서 JSON을 최대한 살려내는 다단계 파서.
 * 긴 과정안처럼 복잡한 응답에서 자주 생기는 두 가지 고장을 수리한다:
 *   1) 문자열 안의 원시 줄바꿈/탭 (JSON 규격 위반) → \\n 으로 이스케이프
 *   2) 끝이 잘린 응답 → 열린 따옴표/괄호를 자동으로 닫음
 */
export function extractJson(text) {
  const cleaned = String(text)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const start = cleaned.indexOf('{');
  const body = start === -1 ? cleaned : cleaned.slice(start);
  const lastBrace = body.lastIndexOf('}');

  const attempts = [cleaned, body];
  if (lastBrace > 0) attempts.push(body.slice(0, lastBrace + 1));

  const repaired = escapeControlCharsInStrings(body);
  const repairedLastBrace = repaired.lastIndexOf('}');
  attempts.push(repaired);
  if (repairedLastBrace > 0) attempts.push(repaired.slice(0, repairedLastBrace + 1));
  attempts.push(autoCloseJson(repaired));

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* 다음 후보 시도 */
    }
  }
  throw new Error('AI 응답에서 JSON을 파싱할 수 없습니다.');
}

/** 문자열 리터럴 내부의 원시 제어문자를 이스케이프 */
function escapeControlCharsInStrings(src) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of src) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
      } else if (ch === '\\') {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        inString = false;
        out += ch;
      } else if (ch === '\n') {
        out += '\\n';
      } else if (ch === '\r') {
        out += '\\r';
      } else if (ch === '\t') {
        out += '\\t';
      } else {
        out += ch;
      }
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  return out;
}

/** 끝이 잘린 JSON의 열린 따옴표·괄호를 자동으로 닫음 */
function autoCloseJson(src) {
  let inString = false;
  let escaped = false;
  const stack = [];
  for (const ch of src) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let out = src;
  if (inString) out += '"';
  out = out.replace(/,\s*$/, '');
  while (stack.length > 0) {
    out += stack.pop() === '{' ? '}' : ']';
  }
  return out;
}

/** 문자열 안전 변환 (+ 길이 제한) */
export function asString(value, maxLength = 2000) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

/**
 * 성취기준 코드 정규화 — AI가 "[6실04-05]"처럼 대괄호/공백을 붙여
 * 반환해도 "6실04-05"와 같은 코드로 인식되도록 한다.
 * (환각 방지용 화이트리스트 대조가 형식 차이로 오탐하는 것을 방지)
 */
export function normalizeCode(code) {
  return String(code || '').replace(/[\[\]\s]/g, '');
}

/** 성취기준 배열 입력 검증 — [{code, subject, description, ...}] */
export function validateStandards(standards, { min = 1, max = 12 } = {}) {
  if (!Array.isArray(standards)) return null;
  const safe = standards
    .filter(
      (s) =>
        s &&
        typeof s.code === 'string' &&
        typeof s.subject === 'string' &&
        typeof s.description === 'string'
    )
    .slice(0, max)
    .map((s) => ({
      code: s.code.slice(0, 20),
      grade: asString(s.grade, 20),
      subject: s.subject.slice(0, 20),
      area: asString(s.area, 40),
      description: s.description.slice(0, 300),
      core_idea: asString(s.core_idea, 600),
    }));
  return safe.length >= min ? safe : null;
}
