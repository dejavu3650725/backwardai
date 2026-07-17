/**
 * StudentAssessment.jsx — 학생 평가 참여 페이지
 * ------------------------------------------------------------------
 * 접속: https://<도메인>/?code=ABC123  (교사가 공유한 링크/QR)
 *
 * 흐름:
 *   1) 세션 확인 → 이름(번호) 입력
 *   2) 루브릭 평가 방법에 따라 자동 구성된 문항에 응답
 *      - written: 서술형  - self: 상/중/하 자기 선택 + 이유  - peer: 동료평가
 *   3) 제출 → 실시간 대기 → 교사가 승인하면 피드백 표시
 *
 * 새로고침해도 localStorage로 자기 제출을 기억해 이어서 봅니다.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  Clock,
  PartyPopper,
  AlertTriangle,
  User,
} from 'lucide-react';

import {
  firestoreReady,
  getSession,
  submitAnswers,
  listenSubmission,
  rememberStudentSubmission,
  recallStudentSubmission,
} from '../lib/assessmentStore.js';

/** 자기평가 선택지 (학생 친화 라벨) */
const SELF_LEVELS = [
  { key: 'high', label: '잘할 수 있어요', emoji: '🌟', chip: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { key: 'mid', label: '어느 정도 할 수 있어요', emoji: '🌱', chip: 'border-sky-300 bg-sky-50 text-sky-700' },
  { key: 'low', label: '아직 조금 어려워요', emoji: '💪', chip: 'border-amber-300 bg-amber-50 text-amber-700' },
];

const LEVEL_KO = { high: '상', mid: '중', low: '하' };
const LEVEL_CHIP = {
  high: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
  mid: 'bg-sky-50 text-sky-600 ring-sky-200',
  low: 'bg-amber-50 text-amber-600 ring-amber-200',
};

export default function StudentAssessment({ code }) {
  const [session, setSession] = useState(null);
  const [loadState, setLoadState] = useState('loading'); // loading | ready | notfound | error
  const [studentName, setStudentName] = useState('');
  const [phase, setPhase] = useState('name'); // name | answer | done
  const [answers, setAnswers] = useState({}); // qid → { text, level, target }
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState(null); // 실시간 구독 결과
  const [error, setError] = useState('');

  /* ── 세션 로드 + 이전 제출 복원 ─────────────────────────── */
  useEffect(() => {
    if (!firestoreReady()) {
      setLoadState('error');
      return;
    }
    let unsub = null;
    (async () => {
      try {
        const s = await getSession(code);
        if (!s) {
          setLoadState('notfound');
          return;
        }
        setSession(s);
        setLoadState('ready');

        // 이 기기에서 이미 제출했다면 → 바로 대기/피드백 화면으로
        const saved = recallStudentSubmission(code);
        if (saved?.submissionId) {
          setStudentName(saved.studentName || '');
          setPhase('done');
          unsub = listenSubmission(code, saved.submissionId, setSubmission);
        }
      } catch (err) {
        console.error(err);
        setLoadState('error');
      }
    })();
    return () => unsub && unsub();
  }, [code]);

  const questions = session?.questions || [];

  /* ── 답안 입력 ─────────────────────────────────────────── */
  const setAnswer = useCallback((qid, patch) => {
    setAnswers((prev) => ({ ...prev, [qid]: { ...prev[qid], ...patch } }));
  }, []);

  /** 모든 문항이 응답되었는지 */
  const isComplete = useMemo(
    () =>
      questions.length > 0 &&
      questions.every((q) => {
        const a = answers[q.qid];
        if (!a) return false;
        if (q.type === 'self') return Boolean(a.level) && (a.text || '').trim().length >= 2;
        return (a.text || '').trim().length >= 5;
      }),
    [questions, answers]
  );

  /* ── 제출 ─────────────────────────────────────────────── */
  const handleSubmit = useCallback(async () => {
    if (!isComplete || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const payload = questions.map((q) => ({
        qid: q.qid,
        text: (answers[q.qid]?.text || '').trim(),
        level: q.type === 'self' ? answers[q.qid]?.level || null : null,
        target: q.type === 'peer' ? (answers[q.qid]?.target || '').trim() : '',
      }));
      const submissionId = await submitAnswers(code, {
        studentName: studentName.trim(),
        answers: payload,
      });
      rememberStudentSubmission(code, submissionId, studentName.trim());
      setPhase('done');
      listenSubmission(code, submissionId, setSubmission);
    } catch (err) {
      console.error(err);
      setError('제출 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }, [isComplete, submitting, questions, answers, code, studentName]);

  /* ══════════════════════════════════════════════════════ */
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* 헤더 */}
      <header className="border-b border-slate-200/70 bg-white/90">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-2.5 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-sky-500">
            <Sparkles className="h-4 w-4 text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">
              {session?.title || '백워드 AI 평가'}
            </p>
            <p className="text-[11px] text-slate-400">참여 코드: {code}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {/* ── 로딩/오류 상태 ─────────────────────────────── */}
        {loadState === 'loading' && (
          <div className="card flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            평가지를 불러오고 있어요…
          </div>
        )}
        {loadState === 'notfound' && (
          <StatusCard
            icon={AlertTriangle}
            tone="amber"
            title="평가를 찾을 수 없어요"
            body={`코드 '${code}'에 해당하는 평가가 없어요. 선생님께 코드를 다시 확인해 주세요.`}
          />
        )}
        {loadState === 'error' && (
          <StatusCard
            icon={AlertTriangle}
            tone="rose"
            title="접속에 문제가 있어요"
            body="네트워크 상태를 확인하고 새로고침해 주세요."
          />
        )}

        {/* ── 1) 이름 입력 ───────────────────────────────── */}
        {loadState === 'ready' && phase === 'name' && (
          <div className="card animate-fade-in-up p-6 sm:p-8">
            {session.status === 'closed' ? (
              <StatusCard
                icon={AlertTriangle}
                tone="amber"
                title="마감된 평가예요"
                body="이 평가는 선생님이 마감했어요."
                plain
              />
            ) : (
              <>
                <div className="mb-5 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-sky-100">
                    <User className="h-7 w-7 text-emerald-600" aria-hidden="true" />
                  </div>
                  <h1 className="text-lg font-extrabold text-slate-800">{session.title}</h1>
                  <p className="mt-1 text-sm text-slate-500">
                    문항 {questions.length}개 · 생각을 담아 정성껏 답해 주세요
                  </p>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-500">
                    이름 (또는 번호와 이름)
                  </span>
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && studentName.trim().length >= 2) setPhase('answer');
                    }}
                    placeholder="예: 12번 김하늘"
                    maxLength={30}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3.5 text-center text-base font-semibold text-slate-800 placeholder-slate-300 shadow-sm transition-all focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setPhase('answer')}
                  disabled={studentName.trim().length < 2}
                  className="btn-primary mt-4 w-full !py-3.5"
                >
                  평가 시작하기
                </button>
              </>
            )}
          </div>
        )}

        {/* ── 2) 문항 응답 ───────────────────────────────── */}
        {loadState === 'ready' && phase === 'answer' && (
          <div className="animate-fade-in-up space-y-4">
            <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 ring-1 ring-emerald-100">
              {studentName} 님, 반가워요! 문항 {questions.length}개에 답해 주세요.
            </p>

            {questions.map((q, index) => (
              <section key={q.qid} className="card p-5">
                <div className="mb-3 flex items-start gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-sky-500 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold leading-relaxed text-slate-800">
                      {q.prompt}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {q.method} · {q.code}
                    </p>
                  </div>
                </div>

                {/* 자기평가: 상/중/하 선택 + 이유 */}
                {q.type === 'self' && (
                  <>
                    <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {SELF_LEVELS.map((lv) => {
                        const selected = answers[q.qid]?.level === lv.key;
                        return (
                          <button
                            key={lv.key}
                            type="button"
                            onClick={() => setAnswer(q.qid, { level: lv.key })}
                            aria-pressed={selected}
                            className={`rounded-xl border-2 px-3 py-3 text-center text-sm font-semibold transition-all ${
                              selected
                                ? `${lv.chip} shadow-sm`
                                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                            }`}
                          >
                            <span className="mb-0.5 block text-xl">{lv.emoji}</span>
                            {lv.label}
                          </button>
                        );
                      })}
                    </div>
                    <textarea
                      value={answers[q.qid]?.text || ''}
                      onChange={(e) => setAnswer(q.qid, { text: e.target.value })}
                      placeholder="그렇게 생각한 까닭을 써 보세요"
                      rows={2}
                      maxLength={1000}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3 text-sm leading-relaxed text-slate-700 placeholder-slate-300 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100"
                    />
                  </>
                )}

                {/* 동료평가: 대상 + 서술 */}
                {q.type === 'peer' && (
                  <>
                    <input
                      type="text"
                      value={answers[q.qid]?.target || ''}
                      onChange={(e) => setAnswer(q.qid, { target: e.target.value })}
                      placeholder="평가할 친구(모둠) 이름"
                      maxLength={30}
                      className="mb-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100"
                    />
                    <textarea
                      value={answers[q.qid]?.text || ''}
                      onChange={(e) => setAnswer(q.qid, { text: e.target.value })}
                      placeholder="친구의 잘한 점과 도와주고 싶은 점을 써 보세요"
                      rows={3}
                      maxLength={2000}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3 text-sm leading-relaxed text-slate-700 placeholder-slate-300 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100"
                    />
                  </>
                )}

                {/* 서술형 */}
                {q.type === 'written' && (
                  <textarea
                    value={answers[q.qid]?.text || ''}
                    onChange={(e) => setAnswer(q.qid, { text: e.target.value })}
                    placeholder="나의 생각과 활동 과정을 자세히 써 보세요"
                    rows={4}
                    maxLength={2000}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3 text-sm leading-relaxed text-slate-700 placeholder-slate-300 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100"
                  />
                )}
              </section>
            ))}

            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-500 ring-1 ring-rose-100">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!isComplete || submitting}
              className="btn-primary w-full !py-4 text-base"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> 제출 중…
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" aria-hidden="true" /> 선생님께 제출하기
                </>
              )}
            </button>
            {!isComplete && (
              <p className="text-center text-xs text-slate-400">
                모든 문항에 답하면 제출할 수 있어요
              </p>
            )}
          </div>
        )}

        {/* ── 3) 제출 완료 → 피드백 대기/수신 ─────────────── */}
        {phase === 'done' && (
          <div className="animate-fade-in-up space-y-4">
            {submission?.status === 'approved' ? (
              <>
                <div className="card p-6 text-center">
                  <PartyPopper className="mx-auto mb-2 h-9 w-9 text-emerald-500" aria-hidden="true" />
                  <h2 className="text-lg font-extrabold text-slate-800">
                    선생님의 피드백이 도착했어요!
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">{studentName} 님, 수고했어요 👏</p>
                </div>
                {(submission.aiEval?.items || []).map((item) => {
                  const q = questions.find((qq) => qq.qid === item.qid);
                  return (
                    <div key={item.qid} className="card p-5">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-bold ring-1 ${LEVEL_CHIP[item.level]}`}
                        >
                          {LEVEL_KO[item.level]}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">
                          {q?.element || item.qid}
                        </span>
                      </div>
                      <p className="rounded-xl bg-gradient-to-r from-emerald-50/80 to-sky-50/80 px-4 py-3 text-sm leading-relaxed text-slate-700">
                        💌 {item.feedback}
                      </p>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="card p-8 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" aria-hidden="true" />
                <h2 className="text-lg font-extrabold text-slate-800">제출 완료!</h2>
                <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-500">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  선생님이 확인하면 이 화면에 피드백이 도착해요. 잠시 기다려 주세요.
                </p>
                <div className="mt-4 flex justify-center">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200/70 py-4 text-center text-[11px] text-slate-400">
        백워드 AI — 과정 중심 평가 도우미
      </footer>
    </div>
  );
}

/** 상태 안내 카드 */
function StatusCard({ icon: Icon, tone, title, body, plain }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-500',
  };
  const content = (
    <div className="p-8 text-center">
      <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full ${tones[tone]}`}>
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="text-base font-bold text-slate-800">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{body}</p>
    </div>
  );
  return plain ? content : <div className="card">{content}</div>;
}
