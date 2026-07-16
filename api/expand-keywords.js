/**
 * Vercel Serverless Function — 주제 → 교과 키워드 확장
 * ==================================================================
 * POST /api/expand-keywords
 * Body: { topic: string, grade?: string }
 * 응답: { keywords: string[] }
 *
 * '선관위', '월드컵', '크리스마스'처럼 교육과정 문서에 직접 등장하지
 * 않는 창의적 소재를, 성취기준 문장에 실제로 쓰이는 교과 개념어로
 * 번역해 주는 1단계 AI 호출입니다. 클라이언트는 이 키워드로
 * 성취기준을 재검색한 뒤 2단계(recommend-standards)로 넘어갑니다.
 */
import { runPrompt, extractJson, asString } from './_lib/providers.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { topic, grade } = req.body || {};
  if (typeof topic !== 'string' || !topic.trim()) {
    return res.status(400).json({ error: 'topic(수업 주제)은 필수입니다.' });
  }
  if (topic.length > 200) {
    return res.status(400).json({ error: 'topic은 200자 이내여야 합니다.' });
  }

  const prompt = `당신은 대한민국 2022 개정 초등 교육과정 전문가입니다.
교사가 "${topic.trim()}"${grade ? ` (${grade})` : ''} 소재로 수업을 계획하려고 합니다.

이 소재와 연결될 수 있는 초등 성취기준을 찾기 위한 검색 키워드를 8~15개 뽑아 주세요.

## 규칙
1. 키워드는 성취기준 문장에 실제로 등장할 법한 교과 개념어(명사)로 쓰세요.
   예) "선관위" → 선거, 민주주의, 투표, 시민, 주권, 대표, 규칙, 공동체, 의사 결정
   예) "월드컵" → 경쟁, 협동, 규칙, 세계, 문화, 운동, 신체 활동, 응원, 존중
2. 여러 과목(국어·사회·도덕·체육·미술 등)에 걸치도록 다양하게 뽑으세요.
3. 반드시 아래 JSON 형식으로만 답하세요.

{ "keywords": ["키워드1", "키워드2", "..."] }`;

  try {
    const raw = await runPrompt(prompt, { maxTokens: 1500, temperature: 0.5 });
    const parsed = extractJson(raw);
    const keywords = (Array.isArray(parsed.keywords) ? parsed.keywords : [])
      .map((k) => asString(k, 20).trim())
      .filter((k) => k.length >= 2)
      .slice(0, 15);

    if (keywords.length === 0) {
      return res.status(502).json({ error: 'AI가 키워드를 생성하지 못했습니다.' });
    }
    return res.status(200).json({ keywords });
  } catch (err) {
    console.error('[expand-keywords] AI 호출 실패:', err);
    const status = err.statusCode || 502;
    return res.status(status).json({ error: err.message || '키워드 확장 중 오류가 발생했습니다.' });
  }
}
