/**
 * App.jsx — 백워드 AI 루트 컴포넌트
 * ------------------------------------------------------------------
 * 담당:
 *  - 5단계 프로세스 화면 전환 상태 관리 (useState)
 *      1. 핵심 아이디어 & 성취기준 → 2. 평가 루브릭 → 3. 수업 과정안 설계
 *      → 4. 평가 및 피드백 → 5. 학교생활기록부
 *  - 상단 헤더 + 가로형 Stepper / 하단 [이전]·[다음 단계로] 내비게이션
 *  - 전체 단계가 공유하는 핵심 상태:
 *      selectedStandards (Step 1) → rubric (Step 2) → lessonPlan (Step 3)
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  BookOpenCheck,
  Table2,
  NotebookPen,
  MessageSquareHeart,
  FileText,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  LogIn,
  LogOut,
  Cloud,
  Loader2,
} from 'lucide-react';

import {
  authReady,
  watchAuth,
  signInWithGoogle,
  signOutUser,
  loadWorkspace,
  saveWorkspace,
  friendlyAuthError,
} from './lib/workspaceStore.js';

import Stepper from './components/Stepper.jsx';
import Footer from './components/Footer.jsx';
import StudentAssessment from './components/StudentAssessment.jsx';
import StandardsSelector from './components/StandardsSelector.jsx';
import RubricGenerator from './components/steps/RubricGenerator.jsx';
import LessonPlanGenerator from './components/steps/LessonPlanGenerator.jsx';
import AssessmentFeedback from './components/steps/AssessmentFeedback.jsx';
import RecordLinker from './components/steps/RecordLinker.jsx';

/** 프로세스 단계 정의 (백워드 설계: 목표 → 평가 → 수업 → 실행 → 기록) */
const STEPS = [
  { id: 'standards', title: '핵심 아이디어 & 성취기준', icon: BookOpenCheck },
  { id: 'rubric', title: '평가 루브릭', icon: Table2 },
  { id: 'lesson', title: '수업 과정안 설계', icon: NotebookPen },
  { id: 'assessment', title: '평가 및 피드백', icon: MessageSquareHeart },
  { id: 'record', title: '학교생활기록부', icon: FileText },
];

export default function App() {
  /**
   * 학생 참여 라우팅 — ?code=ABC123 으로 접속하면 교사용 화면 대신
   * 학생 평가 페이지를 렌더링합니다. (교사가 공유한 링크/QR)
   */
  const studentCode = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get('code');
    return raw ? raw.trim().toUpperCase() : null;
  }, []);

  /** 현재 단계 인덱스 (0 ~ 4) */
  const [currentStep, setCurrentStep] = useState(0);

  /** Step 1 — 선택된 성취기준 목록 */
  const [selectedStandards, setSelectedStandards] = useState([]);

  /**
   * Step 2 — 확정된 평가 루브릭
   * { source, title, items: [{ id, code, element, method, levels:{high,mid,low}, feedback }] }
   */
  const [rubric, setRubric] = useState(null);

  /**
   * Step 3 — 수업 과정안
   * { source, title, target, overview:{...}, assessmentPlan:[...], flow:[...] }
   */
  const [lessonPlan, setLessonPlan] = useState(null);

  /* ── 구글 로그인 + 작업 자동 저장 ─────────────────────── */
  const [user, setUser] = useState(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false); // 복원 완료 후에만 자동 저장
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const [authError, setAuthError] = useState('');
  const saveTimer = useRef(null);

  /** 로그인 상태 구독 */
  useEffect(() => {
    return watchAuth((u) => {
      setUser(u);
      if (!u) setWorkspaceLoaded(false);
    });
  }, []);

  /** 로그인 시 저장된 작업 복원 (현재 작업이 비어 있을 때만) */
  useEffect(() => {
    if (!user || workspaceLoaded) return;
    (async () => {
      try {
        const saved = await loadWorkspace(user.uid);
        const isEmpty =
          selectedStandards.length === 0 && !rubric && !lessonPlan && currentStep === 0;
        if (saved && isEmpty) {
          setSelectedStandards(saved.selectedStandards || []);
          setRubric(saved.rubric || null);
          setLessonPlan(saved.lessonPlan || null);
          setCurrentStep(Math.min(saved.currentStep || 0, STEPS.length - 1));
        }
      } catch (err) {
        console.warn('작업 복원 실패:', err?.message);
      } finally {
        setWorkspaceLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, workspaceLoaded]);

  /** 작업 내용 변경 시 1.5초 뒤 자동 저장 (디바운스) */
  useEffect(() => {
    if (!user || !workspaceLoaded) return undefined;
    clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        await saveWorkspace(user.uid, { selectedStandards, rubric, lessonPlan, currentStep });
        setSaveState('saved');
      } catch (err) {
        console.warn('자동 저장 실패:', err?.message);
        setSaveState('idle');
      }
    }, 1500);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, workspaceLoaded, selectedStandards, rubric, lessonPlan, currentStep]);

  const handleLogin = useCallback(async () => {
    setAuthError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error(err);
      setAuthError(friendlyAuthError(err));
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await signOutUser();
    setSaveState('idle');
  }, []);

  /** 성취기준 토글 (선택/해제) */
  const toggleStandard = useCallback((standard) => {
    setSelectedStandards((prev) => {
      const exists = prev.some((s) => s.code === standard.code);
      if (exists) return prev.filter((s) => s.code !== standard.code);
      return [...prev, standard];
    });
  }, []);

  const removeStandard = useCallback((code) => {
    setSelectedStandards((prev) => prev.filter((s) => s.code !== code));
  }, []);

  const clearStandards = useCallback(() => setSelectedStandards([]), []);

  /** 단계별 [다음 단계로] 활성화 조건 */
  const canProceed = useMemo(() => {
    if (currentStep >= STEPS.length - 1) return false;
    if (currentStep === 0) return selectedStandards.length > 0;
    if (currentStep === 1) return Boolean(rubric && rubric.items.length > 0);
    return true;
  }, [currentStep, selectedStandards.length, rubric]);

  /** 하단 안내 문구 */
  const footerHint = useMemo(() => {
    if (currentStep === 0 && selectedStandards.length === 0) {
      return '성취기준을 1개 이상 선택하면 다음 단계로 이동할 수 있어요';
    }
    if (currentStep === 1 && !rubric) {
      return '루브릭을 생성·확정하면 수업 과정안 설계로 이동할 수 있어요';
    }
    return `${currentStep + 1} / ${STEPS.length} 단계 — ${STEPS[currentStep].title}`;
  }, [currentStep, selectedStandards.length, rubric]);

  const goNext = useCallback(() => {
    setCurrentStep((step) => Math.min(step + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goPrev = useCallback(() => {
    setCurrentStep((step) => Math.max(step - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const jumpToStep = useCallback((index) => {
    setCurrentStep(index);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /** 현재 단계 화면 렌더링 */
  const renderStep = () => {
    switch (STEPS[currentStep].id) {
      case 'standards':
        return (
          <StandardsSelector
            selectedStandards={selectedStandards}
            onToggle={toggleStandard}
            onRemove={removeStandard}
            onClear={clearStandards}
          />
        );
      case 'rubric':
        return (
          <RubricGenerator
            selectedStandards={selectedStandards}
            rubric={rubric}
            onRubricChange={setRubric}
          />
        );
      case 'lesson':
        return (
          <LessonPlanGenerator
            selectedStandards={selectedStandards}
            rubric={rubric}
            lessonPlan={lessonPlan}
            onLessonPlanChange={setLessonPlan}
          />
        );
      case 'assessment':
        return <AssessmentFeedback rubric={rubric} />;
      case 'record':
        return <RecordLinker />;
      default:
        return null;
    }
  };

  /* 학생 모드: 참여 코드로 접속한 경우 */
  if (studentCode) {
    return <StudentAssessment code={studentCode} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* ── 헤더 (인쇄 시 숨김) ─────────────────────────────── */}
      <header className="no-print sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-sky-500 shadow-sm">
                <Sparkles className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-base font-extrabold tracking-tight text-slate-800">
                  백워드 <span className="text-emerald-500">AI</span>
                </h1>
                <p className="hidden text-[11px] text-slate-400 sm:block">
                  2022 개정 교육과정 기반 과정 중심 평가 도우미
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-600 ring-1 ring-emerald-100 md:flex">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                선택된 성취기준 {selectedStandards.length}개
              </div>

              {/* ── 구글 로그인 / 자동 저장 상태 ── */}
              {authReady() &&
                (user ? (
                  <div className="flex items-center gap-2">
                    <span
                      className="hidden items-center gap-1 text-[11px] font-medium text-slate-400 sm:inline-flex"
                      aria-live="polite"
                    >
                      {saveState === 'saving' ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> 저장 중…
                        </>
                      ) : saveState === 'saved' ? (
                        <>
                          <Cloud className="h-3 w-3 text-emerald-500" aria-hidden="true" /> 저장됨
                        </>
                      ) : null}
                    </span>
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || '프로필'}
                        title={`${user.displayName || ''} (${user.email || ''})`}
                        referrerPolicy="no-referrer"
                        className="h-8 w-8 rounded-full ring-2 ring-emerald-200"
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                        {(user.displayName || 'T').slice(0, 1)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                      title="로그아웃"
                      aria-label="로그아웃"
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogin}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-emerald-300 hover:text-emerald-600"
                  >
                    <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                    구글로 로그인
                  </button>
                ))}
            </div>
          </div>

          {authError && (
            <p role="alert" className="pb-2 text-right text-[11px] font-medium text-rose-500">
              {authError}
            </p>
          )}

          {/* ── 가로형 Stepper ─────────────────────────────── */}
          <div className="pb-4 pt-1">
            <Stepper steps={STEPS} currentStep={currentStep} onStepClick={jumpToStep} />
          </div>
        </div>
      </header>

      {/* ── 본문 (현재 단계 화면) ───────────────────────────── */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:p-0">
        {renderStep()}

        {/* ── 이용약관 · 개인정보처리방침 푸터 (인쇄 시 숨김) ── */}
        <Footer />
      </main>

      {/* ── 하단 내비게이션 바 (인쇄 시 숨김) ───────────────── */}
      <footer className="no-print sticky bottom-0 z-30 border-t border-slate-200/70 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={goPrev}
            disabled={currentStep === 0}
            className="btn-ghost"
            aria-label="이전 단계로 이동"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            이전 단계
          </button>

          <p className="hidden text-xs text-slate-400 sm:block" aria-live="polite">
            {footerHint}
          </p>

          <button
            type="button"
            onClick={goNext}
            disabled={!canProceed}
            className="btn-primary"
            aria-label="다음 단계로 이동"
          >
            다음 단계로
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </footer>
    </div>
  );
}
