/**
 * ProjectsModal.jsx — 내 수업 목록 모달 + 첫 방문 로그인 안내 알림창
 * ------------------------------------------------------------------
 * - ProjectsModal : 교사 계정의 수업(프로젝트) 목록. 열기/새로 만들기/
 *                   삭제(2단계 확인)를 지원하며 수업별 진행 단계 표시.
 * - WelcomeNotice : 접속 화면 알림창 — 구글 로그인 시 작업 저장·여러
 *                   수업 제작이 가능함을 안내.
 */
import React, { useEffect, useState } from 'react';
import {
  X,
  BookMarked,
  Plus,
  Trash2,
  FolderOpen,
  Loader2,
  Sparkles,
  LogIn,
  CloudUpload,
  Layers,
} from 'lucide-react';

const STEP_TITLES = ['성취기준', '루브릭', '과정안', '평가·피드백', '생기부'];

/** Firestore Timestamp → 표시용 문자열 */
function formatDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : null;
    return d
      ? d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
  } catch {
    return '';
  }
}

/* ==================================================================
 * 내 수업 목록 모달
 * ================================================================== */
export function ProjectsModal({ projects, currentProjectId, loading, onOpen, onCreate, onDelete, onClose }) {
  const [confirmingId, setConfirmingId] = useState(null);

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="내 수업 목록"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="inline-flex items-center gap-2 text-base font-extrabold text-slate-800">
            <Layers className="h-4.5 w-4.5 h-[18px] w-[18px] text-emerald-500" aria-hidden="true" />
            내 수업 목록
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="닫기"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> 불러오는 중…
            </p>
          ) : projects.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">아직 만든 수업이 없어요.</p>
          ) : (
            <ul className="space-y-2">
              {projects.map((p) => {
                const isCurrent = p.id === currentProjectId;
                const step = Math.min(p.currentStep || 0, STEP_TITLES.length - 1);
                return (
                  <li
                    key={p.id}
                    className={`flex items-center gap-3 rounded-xl border p-3.5 transition-colors ${
                      isCurrent
                        ? 'border-emerald-300 bg-emerald-50/50'
                        : 'border-slate-100 bg-white hover:border-emerald-200'
                    }`}
                  >
                    <BookMarked
                      className={`h-5 w-5 shrink-0 ${isCurrent ? 'text-emerald-500' : 'text-slate-300'}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800">
                        {p.title || '이름 없는 수업'}
                        {isCurrent && (
                          <span className="ml-1.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            작업 중
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {STEP_TITLES[step]} 단계 진행 중
                        {p.selectedStandards?.length
                          ? ` · 성취기준 ${p.selectedStandards.length}개`
                          : ''}
                        {formatDate(p.updatedAt) ? ` · ${formatDate(p.updatedAt)}` : ''}
                      </p>
                    </div>
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => onOpen(p.id)}
                        className="btn-ghost !px-3 !py-2 text-xs"
                      >
                        <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" /> 열기
                      </button>
                    )}
                    {confirmingId === p.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(p.id);
                          setConfirmingId(null);
                        }}
                        className="rounded-lg bg-rose-500 px-2.5 py-2 text-xs font-bold text-white hover:bg-rose-600"
                      >
                        정말 삭제
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingId(p.id)}
                        className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                        aria-label={`${p.title} 삭제`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-100 px-4 py-3">
          <button type="button" onClick={onCreate} className="btn-primary w-full !py-3 text-sm">
            <Plus className="h-4 w-4" aria-hidden="true" /> 새 수업 만들기
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================
 * 접속 화면 로그인 안내 알림창
 * ================================================================== */
export function WelcomeNotice({ onLogin, onDismiss }) {
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="로그인 안내"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="bg-gradient-to-r from-emerald-500 to-sky-500 px-6 py-5 text-white">
          <div className="mb-1.5 flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-extrabold">백워드 AI에 오신 것을 환영해요!</h2>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm leading-relaxed text-slate-600">
            <b className="text-slate-800">구글 계정으로 로그인</b>하면 이런 것들이 가능해져요:
          </p>
          <ul className="mt-3 space-y-2.5">
            <li className="flex items-start gap-2.5 text-sm text-slate-600">
              <CloudUpload className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
              성취기준·루브릭·수업 과정안 등 <b>모든 작업 내용이 자동 저장</b>됩니다
            </li>
            <li className="flex items-start gap-2.5 text-sm text-slate-600">
              <Layers className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
              <b>여러 개의 수업을 만들고</b> 각각의 진행 상황을 이어서 작업할 수 있습니다
            </li>
          </ul>
          <div className="mt-5 flex flex-col gap-2">
            <button type="button" onClick={onLogin} className="btn-primary w-full !py-3">
              <LogIn className="h-4 w-4" aria-hidden="true" /> 구글 계정으로 로그인
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="w-full rounded-xl py-2.5 text-xs font-medium text-slate-400 hover:text-slate-600"
            >
              로그인 없이 둘러보기 (저장되지 않아요)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
