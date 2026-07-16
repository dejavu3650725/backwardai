/**
 * Vercel Serverless Function — AI 연결 진단
 * ==================================================================
 * GET /api/health
 *
 * 브라우저에서 https://<도메인>/api/health 를 열면 AI 연결 상태를
 * JSON으로 보여줍니다. 키 값 자체는 절대 노출하지 않습니다.
 *
 * 응답 예:
 * {
 *   "ok": true,
 *   "provider": "gemini",
 *   "geminiKeySet": true,
 *   "keyPrefix": "AQ.A",
 *   "model": "gemini-3.5-flash",
 *   "sample": "{\"status\":\"ok\"}"
 * }
 */
import { pickProvider, pickGeminiModel, runPrompt } from './_lib/providers.js';

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

  try {
    if (out.provider === 'gemini') {
      out.model = await pickGeminiModel(geminiKey);
    }
    const text = await runPrompt(
      '아무 설명 없이 정확히 다음 JSON만 출력하세요: {"status":"ok"}',
      { maxTokens: 200, temperature: 0 }
    );
    out.ok = true;
    out.sample = String(text).slice(0, 100);
  } catch (err) {
    out.ok = false;
    out.error = String(err?.message || err).slice(0, 400);
  }

  return res.status(200).json(out);
}
