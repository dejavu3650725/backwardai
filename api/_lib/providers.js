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

/**
 * 사용할 Gemini 모델 자동 선택
 * - GEMINI_MODEL 환경변수가 있으면 그것을 최우선 사용
 * - 없으면 키로 실제 사용 가능한 모델 목록을 조회해 flash 계열 중
 *   최신 버전을 선택 (모델명 하드코딩으로 인한 404를 원천 차단)
 */
export async function pickGeminiModel(apiKey) {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (cachedGeminiModel) return cachedGeminiModel;

  const models = await listGeminiModels(apiKey);
  const preferred = [
    'gemini-3.5-flash',
    'gemini-3-flash',
    'gemini-2.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
  ];
  let chosen = preferred.find((p) => models.includes(p));
  if (!chosen) {
    // 선호 목록에 없으면: 특수 모델(이미지/오디오 등)을 제외한
    // flash 계열 중 이름 정렬상 최신 버전을 선택
    chosen = models
      .filter(
        (n) =>
          n.includes('flash') &&
          !/image|audio|live|tts|embedding|preview/.test(n)
      )
      .sort()
      .reverse()[0] || models.find((n) => !/embedding/.test(n));
  }
  if (!chosen) {
    throw new Error('이 API 키로 사용 가능한 Gemini 생성 모델이 없습니다.');
  }
  cachedGeminiModel = chosen;
  return chosen;
}

export async function callGemini(apiKey, prompt, { maxTokens = 1500, temperature = 0.4 } = {}) {
  const model = await pickGeminiModel(apiKey);

  const doCall = async (modelName) => {
    // 인증은 x-goog-api-key 헤더 사용 (신형 AQ. 키 포함 공식 권장 방식)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
        },
      }),
    });
  };

  let response = await doCall(model);

  // 모델이 그 사이 종료된 경우(404) 캐시를 비우고 한 번 재탐색
  if (response.status === 404 && !process.env.GEMINI_MODEL) {
    cachedGeminiModel = null;
    const retryModel = await pickGeminiModel(apiKey);
    if (retryModel !== model) response = await doCall(retryModel);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || '')
    .join('');
  if (!text) throw new Error('Gemini 응답에 텍스트가 없습니다.');
  return text;
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

/* ── 관용적 JSON 파서 ──────────────────────────────────────────── */
export function extractJson(text) {
  const cleaned = String(text)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('AI 응답에서 JSON을 파싱할 수 없습니다.');
  }
}

/** 문자열 안전 변환 (+ 길이 제한) */
export function asString(value, maxLength = 2000) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
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
