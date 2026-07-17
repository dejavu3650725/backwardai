/**
 * RecordLinker.jsx — Step 5. 학교생활기록부 연계
 * ------------------------------------------------------------------
 * 4단계에서 승인된 학생별 평가·피드백 기록을, 2026학년도 초등학교
 * 학교생활기록부 기재요령을 엄수한 '교과학습발달상황' 문구 초안으로
 * 변환합니다.
 *
 *  - 개조식/명사형 종결('~함.', '~하는 모습이 돋보임.')
 *  - 점수·등수 등 정량 데이터, 수상 실적, 사교육 요인 금지
 *  - 객관적 관찰 근거 + 구체적 성장 사례 중심 서술
 *  - 목표 글자 수 설정 + 실시간 글자 수 카운터 + NEIS 복사 버튼
 *
 * 생성 결과는 초안이며, 최종 검토·기재 책임은 교사에게 있습니다.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  FileText,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Search,
  Users,
  WifiOff,
  AlertTriangle,
} from 'lucide-react';

import {
  firestoreReady,
  getSession,
  listenSubmissions,
  saveRecord,
  recallTeacherSession,
} from '../../lib/assessmentStore.js';
import { generateRecord } from '../../lib/aiClient.js';

const LEVEL_KO = { high: '상', mid: '중', low: '하' };

/** 성취기준 코드 첫 자리 → 학년군 */
function gradeFromCode(code) {
  const first = String(code || '').charAt(0);
  return { 2: '초등학교 1~2학년', 4: '초등학교 3~4학년', 6: '초등학교 5~6학년' }[first] || '초등학교';
}

export default function RecordLinker() {
  const [codeInput, setCodeInput] = useState('');
  const [session, setSession] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [maxLength, setMaxLength] = useState(400);
  const [generatingIds, setGeneratingIds] = useState(new Set());
  const [copiedId, setCopiedId] = useState(null);

  /* ── 4단계 세션 자동 복원 ─────────────────────────────── */
  useEffect(() => {
    if (!firestoreReady()) return;
    const saved = recallTeacherSession();
    if (saved && !session) {
      loadSession(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 제출 실시간 구독 ─────────────────────────────────── */
  useEffect(() => {
    if (!session?.code || !firestoreReady()) return undefined;
    return listenSubmissions(session.code, setSubmissions);
  }, [session?.code]);

  const loadSession = useCallback(async (code) => {
    setLoading(true);
    setError('');
    try {
      const s = await getSession(String(code).trim().toUpperCase());
      if (!s) {
        setError(`코드 '${code}'에 해당하는 평가를 찾을 수 없어요.`);
      } else {
        setSession(s);
      }
    } catch (err) {
      console.error(err);
      setError('평가 세션을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, []);

  /** 승인 완료된 제출만 생기부 대상 */
  const approved = useMemo(
    () => submissions.filter((s) => s.status === 'approved'),
    [submissions]
  );

  /* ── 생기부 문구 생성 ─────────────────────────────────── */
  const handleGenerate = useCallback(
    async (sub) => {
      setGeneratingIds((prev) => new Set(prev).add(sub.id));
      setError('');
      try {
        const answerByQid = new Map((sub.answers || []).map((a) => [a.qid, a]));
        const records = (sub.aiEval?.items || []).map((item) => {
          const q = (session.questions || []).find((qq) => qq.qid === item.qid);
          return {
            code: q?.code || '',
            element: q?.element || '',
            method: q?.method || '',
            level: item.level,
            feedback: item.feedback,
            answerExcerpt: (answerByQid.get(item.qid)?.text || '').slice(0, 200),
          };
        });
        const result = await generateRecord({
          grade: gradeFromCode(records[0]?.code),
          maxLength,
          records,
        });
        await saveRecord(session.code, sub.id, result.text);
      } catch (err) {
        console.error(err);
        setError('문구 생성에 실패했어요. 잠시 후 다시 시도해 주세요.');
      } finally {
        setGeneratingIds((prev) => {
          const next = new Set(prev);
          next.delete(sub.id);
          return next;
        });
      }
    },
    [session, maxLength]
  );

  /** 아직 문구가 없는 학생 전체 생성 (순차) */
  const handleGenerateAll = useCallback(async () => {
    for (const sub of approved.filter((s) => !s.record)) {
      // eslint-disable-next-line no-await-in-loop
      await handleGenerate(sub);
    }
  }, [approved, handleGenerate]);

  /** 문구 직접 수정 저장 */
  const handleEdit = useCallback(
    async (sub, text) => {
      await saveRecord(session.code, sub.id, text);
    },
    [session]
  );

  const handleCopy = useCallback(async (sub) => {
    try {
      await navigator.clipboard.writeText(sub.record || '');
      setCopiedId(sub.id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      /* 무시 */
    }
  }, []);

  /* ══════════════════ 렌더링 ══════════════════ */

  if (!firestoreReady()) {
    return (
      <EmptyCard
        icon={WifiOff}
        title="Firebase 연결이 필요해요"
        body="생기부 연계는 4단계 평가 기록(Firestore)을 사용합니다. 환경변수 설정 후 다시 열어주세요."
      />
    );
  }

  /* 세션 미선택: 자동 복원 실패 시 코드로 불러오기 */
  if (!session) {
    return (
      <section className="animate-fade-in-up">
        <div className="card px-6 py-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-emerald-100">
            <FileText className="h-7 w-7 text-indigo-600" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">생기부 연계</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
            4단계에서 진행한 평가의 <b>참여 코드</b>를 입력하면, 승인된 학생별 평가 기록을
            기재요령에 맞는 교과학습발달상황 문구로 변환합니다.
          </p>
          <div className="mx-auto mt-5 flex max-w-xs gap-2">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="참여 코드 (예: ABC123)"
              maxLength={6}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-center font-mono text-sm font-bold tracking-[0.2em] text-slate-800 placeholder-slate-300 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100"
            />
            <button
              type="button"
              onClick={() => loadSession(codeInput)}
              disabled={codeInput.trim().length < 4 || loading}
              className="btn-primary !px-4"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {error && <p className="mt-3 text-xs font-medium text-rose-500">{error}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="animate-fade-in-up space-y-6">
      {/* 헤더 카드 */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-400 to-emerald-500">
            <FileText className="h-4 w-4 text-white" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">{session.title}</h2>
            <p className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
              <Users className="h-3 w-3" aria-hidden="true" />
              승인 완료 {approved.length}명 / 전체 제출 {submissions.length}명 · 코드{' '}
              <span className="font-mono font-bold">{session.code}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            목표 글자 수
            <input
              type="number"
              value={maxLength}
              onChange={(e) =>
                setMaxLength(Math.min(Math.max(parseInt(e.target.value, 10) || 400, 100), 1500))
              }
              min={100}
              max={1500}
              step={50}
              className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-xs font-semibold text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
            자
          </label>
          {approved.some((s) => !s.record) && (
            <button type="button" onClick={handleGenerateAll} className="btn-primary !px-4 !py-2.5 text-xs">
              <Sparkles className="h-4 w-4" aria-hidden="true" /> 미생성 전체 AI 생성
            </button>
          )}
        </div>
      </div>

      {/* 기재요령 안내 */}
      <p className="rounded-xl bg-indigo-50/70 px-4 py-3 text-xs leading-relaxed text-slate-600 ring-1 ring-indigo-100">
        📌 <b>2026학년도 초등학교 생기부 기재요령 준수</b> — 개조식 종결('~함.'), 객관적 관찰
        근거의 긍정·구체 서술, 점수·등수 등 정량 데이터와 수상 실적·사교육 요인 기재 금지.
        생성 결과는 초안이며 최종 검토·기재 책임은 교사에게 있습니다.
      </p>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-500 ring-1 ring-rose-100">
          {error}
        </p>
      )}

      {/* 학생별 문구 카드 */}
      {approved.length === 0 ? (
        <EmptyCard
          icon={AlertTriangle}
          title="승인 완료된 평가가 아직 없어요"
          body="4단계에서 학생 제출을 AI 평가하고 [승인하고 학생에게 전송]까지 완료하면, 그 학생이 이 목록에 나타납니다."
        />
      ) : (
        <ul className="space-y-4">
          {approved.map((sub) => {
            const generating = generatingIds.has(sub.id);
            const levelSummary = (sub.aiEval?.items || [])
              .map((it) => LEVEL_KO[it.level])
              .join('·');
            return (
              <li key={sub.id} className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-emerald-100 text-sm font-extrabold text-indigo-700">
                      {(sub.studentName || '?').slice(0, 2)}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{sub.studentName}</p>
                      <p className="text-[11px] text-slate-400">성취수준 {levelSummary}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleGenerate(sub)}
                      disabled={generating}
                      className="btn-ghost !px-3.5 !py-2 text-xs"
                    >
                      {generating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> 생성 중…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" aria-hidden="true" />
                          {sub.record ? '다시 생성' : 'AI 문구 생성'}
                        </>
                      )}
                    </button>
                    {sub.record && (
                      <button
                        type="button"
                        onClick={() => handleCopy(sub)}
                        className="btn-primary !px-3.5 !py-2 text-xs"
                      >
                        {copiedId === sub.id ? (
                          <>
                            <Check className="h-4 w-4" aria-hidden="true" /> 복사됨!
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" aria-hidden="true" /> NEIS 복사
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="px-5 py-4">
                  {sub.record ? (
                    <>
                      <textarea
                        value={sub.record}
                        onChange={(e) => handleEdit(sub, e.target.value)}
                        rows={Math.max(3, Math.ceil(sub.record.length / 60))}
                        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                        aria-label={`${sub.studentName} 생기부 문구`}
                      />
                      <p
                        className={`mt-1.5 text-right text-[11px] font-semibold ${
                          sub.record.length > maxLength ? 'text-rose-500' : 'text-slate-400'
                        }`}
                      >
                        {sub.record.length}자 / 목표 {maxLength}자
                        {sub.record.length > maxLength && ' — 초과!'}
                      </p>
                    </>
                  ) : (
                    <p className="py-2 text-sm italic text-slate-300">
                      [AI 문구 생성]을 누르면 이 학생의 승인된 평가·피드백을 바탕으로 기재요령에
                      맞는 문구 초안이 만들어집니다.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function EmptyCard({ icon: Icon, title, body }) {
  return (
    <div className="card px-6 py-12 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-emerald-100">
        <Icon className="h-7 w-7 text-indigo-600" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-bold text-slate-800">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">{body}</p>
    </div>
  );
}
