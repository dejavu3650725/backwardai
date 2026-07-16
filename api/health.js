/**
 * Vercel Serverless Function — AI 연결 진단
 * ==================================================================
 * GET /api/health
 *
 * 브라우저에서 https://<도메인>/api/health 를 열면 AI 연결 상태를
 * JSON으로 보여줍니다. 키 값 자체는 절대 노출하지 않습니다.
 *
 * 진단 항목:
 *  - listModels : 모델 목록 조회 가능 여부 (신형 AQ. 키는 실패할 수
 *                 있으며, 실패해도 본 호출에는 지장 없음 — 참고용)
 *  - ok/sample  : 실제 generateContent 호출 성공 여부 (이게 핵심)
 */
import { pickProvider, listGeminiModels, runPrompt } from './_lib/providers.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const geminiKey = process.env.GEMINI_API_KEY || '';
  const out = {
    provider: pickProvider(),
    geminiKeySet: Boolean(geminiKey),
    anthropicKeySet: Boolean(process.env.ANTHROPIC_API_KEY),
    keyPrefix: geminiKey ? geminiKey.slice(0, 4) : null,
    keyLength: geminiKey ? geminiKey.length : 0,
    modelOverride: process.env.GEMINI_MODEL || null,
  };

  if (!out.provider) {
    return res.status(200).json({
      ...out,
      ok: false,
      error: 'AI API 키가 설정되지 않았습니다. (GEMINI_API_KEY 또는 ANTHROPIC_API_KEY)',
    });
  }

  // 1) 모델 목록 조회 (참고용 — 실패해도 계속 진행)
  if (out.provider === 'gemini') {
    try {
      const models = await listGeminiModels(geminiKey);
      out.listModels = `성공 (${models.length}개)`;
      out.flashModels = models.filter((m) => m.includes('flash')).slice(0, 6);
    } catch (err) {
      out.listModels = `실패(참고용, 본 호출과 무관): ${String(err?.message || err).slice(0, 200)}`;
    }
  }

  // 2) 실제 생성 호출 테스트 (핵심 진단)
  try {
    const text = await runPrompt(
      '아무 설명 없이 정확히 다음 JSON만 출력하세요: {"status":"ok"}',
      { maxTokens: 1000, temperature: 0 }
    );
    out.ok = true;
    out.sample = String(text).slice(0, 100);
  } catch (err) {
    out.ok = false;
    out.error = String(err?.message || err).slice(0, 400);
  }

  return res.status(200).json(out);
}
