/**
 * AssessmentFeedback.jsx — Step 4. 평가 및 피드백 (교사 대시보드)
 * ------------------------------------------------------------------
 * 이 웹앱의 심장: 루브릭에서 설정한 '평가 방법'이 그대로 학생 평가로
 * 구현되는 화면입니다.
 *
 *  [세션 준비]  루브릭 → 평가 방법별 학생 문항 자동 구성 (수정 가능)
 *              → 수업별 참여 코드 + QR + 링크 발급
 *  [실시간 수합] 학생 제출이 실시간으로 쌓임 (Firestore onSnapshot)
 *  [AI 평가]    답안을 루브릭 상/중/하 기준으로 AI가 판정 + 피드백 초안
 *  [교사 승인]  수준·피드백을 검토/수정한 뒤 승인 → 학생 화면으로 전송
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  MessageSquareHeart,
  Sparkles,
  Loader2,
  QrCode,
  Copy,
  Check,
  Users,
  Send,
  RefreshCw,
  StopCircle,
  PlusCircle,
  WifiOff,
  Table2,
} from 'lucide-react';
import QRCode from 'qrcode';

import {
  firestoreReady,
  createSession,
  getSession,
  setSessionStatus,
  listenSubmissions,
  saveEvaluation,
  approveSubmission,
  buildQuestionsFromRubric,
  joinUrl,
  rememberTeacherSession,
  recallTeacherSession,
  forgetTeacherSession,
} from '../../lib/assessmentStore.js';
import { evaluateSubmission } from '../../lib/aiClient.js';
import EditableCell from '../EditableCell.jsx';

const LEVEL_KO = { high: '상', mid: '중', low: '하' };
const LEVEL_CHIP = {
  high: 'bg-emerald-500 text-white',
  mid: 'bg-sky-500 text-white',
  low: 'bg-amber-500 text-white',
};
const TYPE_LABEL = { written: '서술형', self: '자기평가형', peer: '동료평가형' };

export default function AssessmentFeedback({ rubric }) {
  const [session, setSession] = useState(null); // { code, title, questions, rubric, status }
  const [submissions, setSubmissions] = useState([]);
  const [title, setTitle] = useState('');
  const [draftQuestions, setDraftQuestions] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [evaluatingIds, setEvaluatingIds] = useState(new Set());

  /* ── 루브릭 → 문항 초안 구성 ───────────────────────────── */
  useEffect(() => {
    if (rubric && !draftQuestions) {
      setDraftQuestions(buildQuestionsFromRubric(rubric));
      setTitle((t) => t || `${rubric.title.replace(/ \(참고용 초안\)/, '')}`);
    }
  }, [rubric, draftQuestions]);

  /* ── 이전 세션 복원 (새로고침 대비) ────────────────────── */
  useEffect(() => {
    if (!firestoreReady()) return;
    const saved = recallTeacherSession();
    if (!saved || session) return;
    (async () => {
      const s = await getSession(saved);
      if (s) setSession(s);
      else forgetTeacherSession();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 제출 실시간 구독 ──────────────────────────────────── */
  useEffect(() => {
    if (!session?.code || !firestoreReady()) return undefined;
    const unsub = listenSubmissions(session.code, setSubmissions);
    return unsub;
  }, [session?.code]);

  /* ── QR 생성 ───────────────────────────────────────────── */
  useEffect(() => {
    if (!session?.code) return;
    QRCode.toDataURL(joinUrl(session.code), { margin: 1, width: 240 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [session?.code]);

  /* ── 세션 시작 ─────────────────────────────────────────── */
  const handleCreate = useCallback(async () => {
    if (!rubric || !draftQuestions) return;
    setCreating(true);
    setError('');
    try {
      const code = await createSession({
        title: title.trim() || rubric.title,
        rubric,
        questions: draftQuestions,
      });
      const s = await getSession(code);
      setSession(s);
      rememberTeacherSession(code);
    } catch (err) {
      console.error(err);
      setError(err?.message || '세션 생성에 실패했어요. Firebase 설정을 확인해 주세요.');
    } finally {
      setCreating(false);
    }
  }, [rubric, draftQuestions, title]);

  /* ── 링크 복사 ─────────────────────────────────────────── */
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(joinUrl(session.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 클립보드 미지원 → 무시 */
    }
  }, [session]);

  /* ── AI 평가 ───────────────────────────────────────────── */
  const handleEvaluate = useCallback(
    async (sub) => {
      setEvaluatingIds((prev) => new Set(prev).add(sub.id));
      try {
        const result = await evaluateSubmission({
          studentName: sub.studentName,
          questions: session.questions,
          answers: sub.answers,
        });
        await saveEvaluation(session.code, sub.id, {
          items: result.items,
          overall: result.overall,
          source: result.source,
        });
      } catch (err) {
        console.error(err);
        setError('AI 평가 저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
      } finally {
        setEvaluatingIds((prev) => {
          const next = new Set(prev);
          next.delete(sub.id);
          return next;
        });
      }
    },
    [session]
  );

  /** 아직 평가 전인 제출 전체 AI 평가 */
  const handleEvaluateAll = useCallback(async () => {
    const pending = submissions.filter((s) => !s.aiEval && s.status === 'submitted');
    for (const sub of pending) {
      // 순차 실행 — 서버리스 함수 과부하 방지
      // eslint-disable-next-line no-await-in-loop
      await handleEvaluate(sub);
    }
  }, [submissions, handleEvaluate]);

  /* ── 평가 결과 수정 (승인 전) ──────────────────────────── */
  const patchEvalItem = useCallback(
    async (sub, qid, patch) => {
      const aiEval = {
        ...sub.aiEval,
        items: sub.aiEval.items.map((it) => (it.qid === qid ? { ...it, ...patch } : it)),
      };
      await saveEvaluation(session.code, sub.id, aiEval);
    },
    [session]
  );

  /* ── 승인 → 학생에게 전송 ──────────────────────────────── */
  const handleApprove = useCallback(
    async (sub) => {
      await approveSubmission(session.code, sub.id, sub.aiEval);
    },
    [session]
  );

  /* ── 세션 마감 / 새 세션 ───────────────────────────────── */
  const handleClose = useCallback(async () => {
    await setSessionStatus(session.code, 'closed');
    setSession((s) => ({ ...s, status: 'closed' }));
  }, [session]);

  const handleNewSession = useCallback(() => {
    forgetTeacherSession();
    setSession(null);
    setSubmissions([]);
    setDraftQuestions(rubric ? buildQuestionsFromRubric(rubric) : null);
  }, [rubric]);

  /* ══════════════════ 렌더링 ══════════════════ */

  /* Firebase 미설정 */
  if (!firestoreReady()) {
    return (
      <EmptyCard
        icon={WifiOff}
        title="Firebase 연결이 필요해요"
        body="학생 평가 수합 기능은 Firestore에 데이터를 저장합니다. .env(로컬)와 Vercel 환경변수에 VITE_FIREBASE_* 6개 값을 등록한 뒤 다시 열어주세요."
      />
    );
  }

  /* 루브릭 미확정 */
  if (!rubric && !session) {
    return (
      <EmptyCard
        icon={Table2}
        title="먼저 2단계에서 평가 루브릭을 확정해 주세요"
        body="루브릭의 '평가 방법'(서술·자기평가·동료평가 등)에 따라 학생 평가 문항이 자동으로 구성됩니다."
      />
    );
  }

  /* ── [A] 세션 준비 화면 ─────────────────────────────────── */
  if (!session) {
    return (
      <section className="animate-fade-in-up space-y-6">
        <div className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-sky-500">
              <MessageSquareHeart className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">평가 세션 만들기</h2>
              <p className="text-[11px] text-slate-400">
                루브릭의 평가 방법대로 학생 문항이 자동 구성됩니다 — 문구는 클릭해서 수정하세요
              </p>
            </div>
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="평가 제목 (학생 화면에 표시됩니다)"
            maxLength={80}
            aria-label="평가 제목"
            className="mb-4 w-full rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3.5 text-sm font-semibold text-slate-800 placeholder-slate-400 shadow-sm transition-all focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100"
          />

          {/* 문항 미리보기 (평가 방법별) */}
          <ul className="space-y-2.5">
            {(draftQuestions || []).map((q, i) => (
              <li key={q.qid} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                    {i + 1}
                  </span>
                  <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 ring-1 ring-emerald-200">
                    {q.method} → {TYPE_LABEL[q.type]}
                  </span>
                  <span className="text-[10px] font-bold tracking-wide text-slate-400">
                    {q.code}
                  </span>
                </div>
                <div className="text-sm text-slate-700">
                  <EditableCell
                    value={q.prompt}
                    onChange={(v) =>
                      setDraftQuestions((prev) =>
                        prev.map((qq) => (qq.qid === q.qid ? { ...qq, prompt: v } : qq))
                      )
                    }
                    placeholder="학생에게 보여줄 질문"
                  />
                </div>
              </li>
            ))}
          </ul>

          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-500 ring-1 ring-rose-100">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !draftQuestions?.length}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-sky-500 px-6 py-4 text-sm font-bold text-white shadow-sm transition-all hover:from-emerald-600 hover:to-sky-600 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? (
              <>
                <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> 세션 만드는 중…
              </>
            ) : (
              <>
                <QrCode className="h-[18px] w-[18px]" aria-hidden="true" /> 평가 시작 — 참여 코드 만들기
              </>
            )}
          </button>
        </div>
      </section>
    );
  }

  /* ── [B] 실시간 수합 대시보드 ───────────────────────────── */
  const pendingCount = submissions.filter((s) => s.status === 'submitted').length;

  return (
    <section className="animate-fade-in-up space-y-6">
      {/* 참여 코드 카드 */}
      <div className="gradient-border">
        <div className="flex flex-col items-center gap-5 rounded-[calc(1rem-1.5px)] bg-white p-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="text-center sm:text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500">
              {session.title} · 참여 코드
            </p>
            <p className="my-1 font-mono text-5xl font-extrabold tracking-[0.3em] text-slate-800">
              {session.code}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <button type="button" onClick={handleCopy} className="btn-ghost !px-3 !py-2 text-xs">
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" /> 복사됨!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" /> 참여 링크 복사
                  </>
                )}
              </button>
              {session.status === 'closed' ? (
                <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
                  마감됨
                </span>
              ) : (
                <button type="button" onClick={handleClose} className="btn-ghost !px-3 !py-2 text-xs">
                  <StopCircle className="h-3.5 w-3.5" aria-hidden="true" /> 제출 마감
                </button>
              )}
              <button type="button" onClick={handleNewSession} className="btn-ghost !px-3 !py-2 text-xs">
                <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" /> 새 평가
              </button>
            </div>
            <p className="mt-2 break-all text-[11px] text-slate-400">{joinUrl(session.code)}</p>
          </div>
          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt={`참여 QR 코드 (${session.code})`}
              className="h-36 w-36 shrink-0 rounded-xl ring-1 ring-slate-200"
            />
          )}
        </div>
      </div>

      {/* 제출 현황 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
          <Users className="h-4 w-4 text-emerald-500" aria-hidden="true" />
          제출 {submissions.length}명
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600 ring-1 ring-amber-200">
              AI 평가 대기 {pendingCount}
            </span>
          )}
        </p>
        {pendingCount > 0 && (
          <button type="button" onClick={handleEvaluateAll} className="btn-primary !px-4 !py-2.5 text-xs">
            <Sparkles className="h-4 w-4" aria-hidden="true" /> 대기 중 전체 AI 평가
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-500 ring-1 ring-rose-100">
          {error}
        </p>
      )}

      {/* 제출 목록 */}
      {submissions.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <div className="mx-auto mb-3 flex justify-center">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
          </div>
          <p className="text-sm font-medium text-slate-500">학생 제출을 기다리는 중이에요</p>
          <p className="mt-1 text-xs text-slate-400">
            학생들이 코드 <b className="font-mono">{session.code}</b> 또는 QR로 접속해 제출하면
            실시간으로 나타납니다
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {submissions.map((sub) => (
            <SubmissionCard
              key={sub.id}
              sub={sub}
              questions={session.questions}
              evaluating={evaluatingIds.has(sub.id)}
              onEvaluate={() => handleEvaluate(sub)}
              onPatchItem={(qid, patch) => patchEvalItem(sub, qid, patch)}
              onApprove={() => handleApprove(sub)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ==================================================================
 * 제출 카드 — 답안 + AI 평가(수정 가능) + 승인 버튼
 * ================================================================== */
function SubmissionCard({ sub, questions, evaluating, onEvaluate, onPatchItem, onApprove }) {
  const [open, setOpen] = useState(sub.status !== 'approved');
  const evalByQid = useMemo(
    () => new Map((sub.aiEval?.items || []).map((it) => [it.qid, it])),
    [sub.aiEval]
  );

  const statusBadge =
    sub.status === 'approved' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-600 ring-1 ring-emerald-200">
        <Check className="h-3 w-3" aria-hidden="true" /> 전송 완료
      </span>
    ) : sub.status === 'evaluated' ? (
      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-600 ring-1 ring-sky-200">
        승인 대기
      </span>
    ) : (
      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-600 ring-1 ring-amber-200">
        AI 평가 전
      </span>
    );

  return (
    <li className="card overflow-hidden">
      {/* 카드 헤더 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50/70"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-sky-100 text-sm font-extrabold text-emerald-700">
            {(sub.studentName || '?').slice(0, 2)}
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800">{sub.studentName}</p>
            <p className="text-[11px] text-slate-400">
              {sub.submittedAt?.toDate ? sub.submittedAt.toDate().toLocaleTimeString('ko-KR') : ''}
            </p>
          </div>
        </div>
        {statusBadge}
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-5 py-4">
          {questions.map((q) => {
            const answer = (sub.answers || []).find((a) => a.qid === q.qid);
            const ev = evalByQid.get(q.qid);
            return (
              <div key={q.qid} className="rounded-xl bg-slate-50/70 p-3.5">
                <p className="mb-1 text-[11px] font-bold text-slate-400">
                  [{q.code}] {q.element} · {q.method}
                </p>
                {/* 학생 답안 */}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {q.type === 'self' && answer?.level && (
                    <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[11px] font-bold ${LEVEL_CHIP[answer.level]}`}>
                      자기평가 {LEVEL_KO[answer.level]}
                    </span>
                  )}
                  {q.type === 'peer' && answer?.target && (
                    <span className="mr-1.5 text-xs font-semibold text-slate-500">
                      [대상: {answer.target}]
                    </span>
                  )}
                  {answer?.text || <span className="italic text-slate-300">(답변 없음)</span>}
                </p>

                {/* AI 평가 결과 (수준 토글 + 피드백 인라인 수정) */}
                {ev && (
                  <div className="mt-2.5 rounded-lg border border-emerald-100 bg-white p-3">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      {['high', 'mid', 'low'].map((lv) => (
                        <button
                          key={lv}
                          type="button"
                          disabled={sub.status === 'approved'}
                          onClick={() => onPatchItem(q.qid, { level: lv })}
                          className={`h-7 w-9 rounded-lg text-xs font-bold transition-all ${
                            ev.level === lv
                              ? LEVEL_CHIP[lv]
                              : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          } ${sub.status === 'approved' ? 'cursor-default' : ''}`}
                          aria-pressed={ev.level === lv}
                        >
                          {LEVEL_KO[lv]}
                        </button>
                      ))}
                      <span className="ml-1 text-[11px] text-slate-400" title={ev.reason}>
                        {ev.reason ? `근거: ${ev.reason}` : ''}
                      </span>
                    </div>
                    <div className="text-sm leading-relaxed text-slate-700">
                      {sub.status === 'approved' ? (
                        <p className="whitespace-pre-wrap">💌 {ev.feedback}</p>
                      ) : (
                        <EditableCell
                          value={ev.feedback}
                          onChange={(v) => onPatchItem(q.qid, { feedback: v })}
                          placeholder="학생에게 보낼 피드백"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {sub.aiEval?.overall && (
            <p className="rounded-xl bg-sky-50/70 px-3.5 py-2.5 text-xs leading-relaxed text-slate-600 ring-1 ring-sky-100">
              📋 <b>종합(교사 참고)</b> {sub.aiEval.overall}
              {sub.aiEval.source === 'local-fallback' && (
                <span className="ml-1 font-semibold text-amber-600">— AI 미연결 임시 초안</span>
              )}
            </p>
          )}

          {/* 액션 */}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {sub.status !== 'approved' && (
              <button
                type="button"
                onClick={onEvaluate}
                disabled={evaluating}
                className="btn-ghost !px-4 !py-2.5 text-xs"
              >
                {evaluating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> AI 평가 중…
                  </>
                ) : sub.aiEval ? (
                  <>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> AI 다시 평가
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" aria-hidden="true" /> AI 평가하기
                  </>
                )}
              </button>
            )}
            {sub.status === 'evaluated' && (
              <button type="button" onClick={onApprove} className="btn-primary !px-4 !py-2.5 text-xs">
                <Send className="h-4 w-4" aria-hidden="true" /> 승인하고 학생에게 전송
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/* ==================================================================
 * 빈 상태 카드
 * ================================================================== */
function EmptyCard({ icon: Icon, title, body }) {
  return (
    <section className="animate-fade-in-up">
      <div className="card px-6 py-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-indigo-100">
          <Icon className="h-7 w-7 text-sky-600" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">{body}</p>
      </div>
    </section>
  );
}
