/**
 * LessonPlanGenerator.jsx — Step 3. 백워드 기반 수업 과정안 설계
 * ------------------------------------------------------------------
 * Step 1의 성취기준(핵심 아이디어 포함) + Step 2의 확정 루브릭을
 * /api/generate-lesson 에 보내 학교 현장 결재 문서 표준 양식의
 * 수업 과정안을 자동 생성합니다.
 *
 *  [1. 수업 개요 및 평가 계획]
 *    - 교육과정 분석(핵심 아이디어·성취기준) / 탐구 질문 / 학습 목표
 *      / 학습 주제 / 수업자의 의도 / 평가 계획표(범주·요소·상중하·피드백)
 *  [2. 교수·학습 과정안]
 *    - 학습 단계(도입-전개-정리) | 교사 활동 | 학생 활동 | 시간
 *      | 자료(▣) 및 유의점(※) 및 평가(☞)
 *
 * 모든 셀은 클릭 즉시 수정(EditableCell)되며, [인쇄하기]는
 * @media print CSS로 A4 결재 문서 레이아웃을 출력합니다.
 */
import React, { useMemo, useState, useCallback } from 'react';
import {
  NotebookPen,
  Sparkles,
  Loader2,
  RefreshCw,
  Printer,
  Plus,
  Trash2,
  WifiOff,
} from 'lucide-react';

import { generateLessonPlan } from '../../lib/aiClient.js';
import EditableCell from '../EditableCell.jsx';

/** 학습 단계별 파스텔 스타일 */
const STAGE_STYLES = {
  도입: 'bg-teal-50 text-teal-700',
  전개: 'bg-sky-50 text-sky-700',
  정리: 'bg-indigo-50 text-indigo-700',
};

/** 개요 항목 행 정의 (라벨 → overview 키) */
const OVERVIEW_ROWS = [
  { key: 'inquiryQuestion', label: '탐구 질문' },
  { key: 'objective', label: '학습 목표' },
  { key: 'theme', label: '학습 주제' },
];

const LEVEL_COLUMNS = [
  { key: 'high', label: '상' },
  { key: 'mid', label: '중' },
  { key: 'low', label: '하' },
];

export default function LessonPlanGenerator({
  selectedStandards,
  rubric,
  lessonPlan,
  onLessonPlanChange,
}) {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /* ── AI 생성 ───────────────────────────────────────────── */
  const handleGenerate = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const result = await generateLessonPlan({
        standards: selectedStandards,
        rubric,
        topic: topic || rubric?.title?.replace(/ 평가 루브릭.*/u, '') || '',
      });
      onLessonPlanChange(result);
    } catch (err) {
      setError(err?.message || '과정안 생성 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }, [selectedStandards, rubric, topic, onLessonPlanChange]);

  /* ── 인라인 수정 핸들러 ────────────────────────────────── */
  const updateField = useCallback(
    (patch) => onLessonPlanChange({ ...lessonPlan, ...patch }),
    [lessonPlan, onLessonPlanChange]
  );

  const updateOverview = useCallback(
    (key, value) =>
      onLessonPlanChange({
        ...lessonPlan,
        overview: { ...lessonPlan.overview, [key]: value },
      }),
    [lessonPlan, onLessonPlanChange]
  );

  const updateAssessment = useCallback(
    (id, patch) =>
      onLessonPlanChange({
        ...lessonPlan,
        assessmentPlan: lessonPlan.assessmentPlan.map((row) =>
          row.id === id
            ? { ...row, ...patch, levels: { ...row.levels, ...(patch.levels || {}) } }
            : row
        ),
      }),
    [lessonPlan, onLessonPlanChange]
  );

  const updateFlow = useCallback(
    (id, patch) =>
      onLessonPlanChange({
        ...lessonPlan,
        flow: lessonPlan.flow.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      }),
    [lessonPlan, onLessonPlanChange]
  );

  /** 특정 행 아래에 같은 단계의 새 행 추가 */
  const addFlowRow = useCallback(
    (afterId, stage) => {
      const idx = lessonPlan.flow.findIndex((r) => r.id === afterId);
      const newRow = {
        id: `f-new-${Date.now()}`,
        stage,
        teacher: '',
        student: '',
        time: "5'",
        notes: '',
      };
      const flow = [...lessonPlan.flow];
      flow.splice(idx + 1, 0, newRow);
      onLessonPlanChange({ ...lessonPlan, flow });
    },
    [lessonPlan, onLessonPlanChange]
  );

  const removeFlowRow = useCallback(
    (id) =>
      onLessonPlanChange({
        ...lessonPlan,
        flow: lessonPlan.flow.filter((row) => row.id !== id),
      }),
    [lessonPlan, onLessonPlanChange]
  );

  /* ── 학습 단계 rowSpan 그룹 계산 (연속된 동일 단계 병합) ── */
  const flowWithSpans = useMemo(() => {
    if (!lessonPlan?.flow) return [];
    return lessonPlan.flow.map((row, i, arr) => {
      const isGroupStart = i === 0 || arr[i - 1].stage !== row.stage;
      let span = 0;
      if (isGroupStart) {
        span = 1;
        for (let j = i + 1; j < arr.length && arr[j].stage === row.stage; j += 1) span += 1;
      }
      return { ...row, isGroupStart, span };
    });
  }, [lessonPlan]);

  const totalTime = useMemo(() => {
    if (!lessonPlan?.flow) return 0;
    return lessonPlan.flow.reduce((sum, r) => sum + (parseInt(r.time, 10) || 0), 0);
  }, [lessonPlan]);

  /* ══════════════════════════════════════════════════════════ */
  return (
    <section className="animate-fade-in-up space-y-6">
      {/* ── 생성 컨트롤 카드 (인쇄 시 숨김) ──────────────────── */}
      <div className="card no-print p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-sky-500">
              <NotebookPen className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">AI 수업 과정안 설계</h2>
              <p className="text-[11px] text-slate-400">
                성취기준 {selectedStandards.length}개
                {rubric ? ` + 루브릭 평가 요소 ${rubric.items.length}개` : ''}를 바탕으로 백워드
                설계합니다
              </p>
            </div>
          </div>

          {/* 우측 상단 [인쇄하기] */}
          {lessonPlan && (
            <button type="button" onClick={() => window.print()} className="btn-ghost !py-2.5">
              <Printer className="h-4 w-4" aria-hidden="true" />
              인쇄하기
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={
              rubric?.title
                ? `단원/수업 주제 (비워두면 '${rubric.title}' 기준으로 설계)`
                : '단원/수업 주제를 입력해 주세요. 예: 강낭콩 키우기'
            }
            maxLength={200}
            aria-label="단원 또는 수업 주제"
            className="flex-1 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition-all focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100"
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || selectedStandards.length === 0}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-sky-500 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:from-emerald-600 hover:to-sky-600 hover:shadow-card-hover focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
                과정안 설계 중…
              </>
            ) : lessonPlan ? (
              <>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                다시 생성하기
              </>
            ) : (
              <>
                <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
                AI 과정안 생성
              </>
            )}
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-500 ring-1 ring-rose-100">
            {error}
          </p>
        )}
      </div>

      {/* ── 로딩 스켈레톤 ────────────────────────────────────── */}
      {loading && (
        <div className="card no-print space-y-3 p-6" aria-hidden="true">
          <div className="skeleton h-7 w-1/2" />
          <div className="skeleton h-28 w-full" />
          <div className="skeleton h-40 w-full" />
          <div className="skeleton h-40 w-full" />
        </div>
      )}

      {/* ── 빈 상태 ──────────────────────────────────────────── */}
      {!loading && !lessonPlan && (
        <div className="card no-print px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-sky-100">
            <NotebookPen className="h-7 w-7 text-emerald-600" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-slate-800">아직 설계된 과정안이 없어요</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
            위의 <b className="text-emerald-600">[AI 과정안 생성]</b> 버튼을 누르면 확정된
            루브릭으로부터 거꾸로 수업을 설계하여, 결재 문서 표준 양식의 수업 과정안을 한 번에
            작성해 드립니다.
          </p>
        </div>
      )}

      {/* ══════════ 과정안 문서 (인쇄 영역) ══════════ */}
      {!loading && lessonPlan && (
        <div className="print-area animate-fade-in-up space-y-6">
          {/* 문서 제목 */}
          <div className="card p-5 text-center sm:p-6">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500">
              백워드 설계 기반 교수·학습 과정안
            </p>
            <div className="text-xl font-extrabold text-slate-800">
              <EditableCell
                value={lessonPlan.title}
                onChange={(v) => updateField({ title: v })}
                placeholder="과정안 제목"
                textClassName="text-center block"
              />
            </div>
            <div className="mt-1 text-xs text-slate-500">
              <EditableCell
                value={lessonPlan.target}
                onChange={(v) => updateField({ target: v })}
                placeholder="대상 학년"
                textClassName="text-center block"
              />
            </div>
            {lessonPlan.source === 'local-fallback' && (
              <p className="no-print mt-2 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-600 ring-1 ring-amber-100">
                <WifiOff className="h-3 w-3" aria-hidden="true" />
                AI 서버 미연결 — 루브릭 기반 참고용 초안입니다
              </p>
            )}
          </div>

          {/* ── [1] 수업 개요 및 평가 계획 ─────────────────────── */}
          <div className="card overflow-hidden">
            <h3 className="border-b border-slate-100 bg-teal-50/80 px-5 py-3 text-sm font-extrabold text-teal-700 sm:px-6">
              1. 수업 개요 및 평가 계획
            </h3>

            {/* 교육과정 분석 + 개요 항목 표 */}
            <table className="w-full border-collapse text-sm">
              <tbody>
                <tr className="align-top">
                  <th className="w-32 border-b border-r border-slate-100 bg-teal-50/50 px-4 py-3 text-left text-xs font-bold text-slate-600 sm:w-40">
                    교육과정 분석
                    <span className="mt-0.5 block text-[10px] font-medium text-slate-400">
                      핵심 아이디어
                    </span>
                  </th>
                  <td className="border-b border-slate-100 px-4 py-3 text-xs leading-relaxed text-slate-600">
                    <EditableCell
                      value={lessonPlan.overview.coreIdeas}
                      onChange={(v) => updateOverview('coreIdeas', v)}
                      placeholder="핵심 아이디어"
                    />
                  </td>
                </tr>
                <tr className="align-top">
                  <th className="border-b border-r border-slate-100 bg-teal-50/50 px-4 py-3 text-left text-xs font-bold text-slate-600">
                    교육과정 분석
                    <span className="mt-0.5 block text-[10px] font-medium text-slate-400">
                      성취기준
                    </span>
                  </th>
                  <td className="border-b border-slate-100 px-4 py-3 text-xs leading-relaxed text-slate-600">
                    <EditableCell
                      value={lessonPlan.overview.standards}
                      onChange={(v) => updateOverview('standards', v)}
                      placeholder="성취기준"
                    />
                  </td>
                </tr>
                {OVERVIEW_ROWS.map((row) => (
                  <tr key={row.key} className="align-top">
                    <th className="border-b border-r border-slate-100 bg-teal-50/50 px-4 py-3 text-left text-xs font-bold text-slate-600">
                      {row.label}
                    </th>
                    <td className="border-b border-slate-100 px-4 py-3 text-sm text-slate-700">
                      <EditableCell
                        value={lessonPlan.overview[row.key]}
                        onChange={(v) => updateOverview(row.key, v)}
                        placeholder={row.label}
                      />
                    </td>
                  </tr>
                ))}
                <tr className="align-top">
                  <th className="border-b border-r border-slate-100 bg-teal-50/50 px-4 py-3 text-left text-xs font-bold text-slate-600">
                    수업자의 의도
                    <span className="mt-0.5 block text-[10px] font-medium text-slate-400">
                      수업·평가 주안점
                    </span>
                  </th>
                  <td className="border-b border-slate-100 px-4 py-3 text-xs leading-relaxed text-slate-600">
                    <EditableCell
                      value={lessonPlan.overview.intent}
                      onChange={(v) => updateOverview('intent', v)}
                      placeholder="수업자의 의도"
                    />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 평가 계획표 */}
            <h4 className="border-y border-slate-100 bg-teal-50/50 px-5 py-2.5 text-xs font-extrabold text-teal-700 sm:px-6">
              ◈ 평가 계획표
            </h4>
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[840px] border-collapse text-xs">
                <thead>
                  <tr className="bg-teal-50/70 text-slate-600">
                    <th className="w-[12%] border-b border-slate-200 px-3 py-2.5 text-left font-bold">
                      범주 <span className="font-medium text-slate-400">(평가 방법)</span>
                    </th>
                    <th className="w-[16%] border-b border-slate-200 px-3 py-2.5 text-left font-bold">
                      평가 요소
                    </th>
                    {LEVEL_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className="w-[18%] border-b border-slate-200 px-3 py-2.5 text-left font-bold"
                      >
                        수준 ({col.label})
                      </th>
                    ))}
                    <th className="w-[18%] border-b border-slate-200 px-3 py-2.5 text-left font-bold">
                      피드백
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lessonPlan.assessmentPlan.map((row) => (
                    <tr
                      key={row.id}
                      className="align-top odd:bg-white even:bg-slate-50/40 hover:bg-emerald-50/30"
                    >
                      <td className="border-b border-slate-100 px-3 py-2.5 font-medium text-slate-600">
                        <EditableCell
                          value={row.method}
                          onChange={(v) => updateAssessment(row.id, { method: v })}
                          placeholder="평가 방법"
                        />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2.5 font-medium text-slate-700">
                        <EditableCell
                          value={row.element}
                          onChange={(v) => updateAssessment(row.id, { element: v })}
                          placeholder="평가 요소"
                        />
                      </td>
                      {LEVEL_COLUMNS.map((col) => (
                        <td key={col.key} className="border-b border-slate-100 px-3 py-2.5 text-slate-600">
                          <EditableCell
                            value={row.levels[col.key]}
                            onChange={(v) => updateAssessment(row.id, { levels: { [col.key]: v } })}
                            placeholder={`${col.label} 수준`}
                          />
                        </td>
                      ))}
                      <td className="border-b border-slate-100 px-3 py-2.5 text-slate-600">
                        <EditableCell
                          value={row.feedback}
                          onChange={(v) => updateAssessment(row.id, { feedback: v })}
                          placeholder="피드백"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── [2] 교수·학습 과정안 (인쇄 시 새 페이지에서 시작) ── */}
          <div className="card print-page-break overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-sky-50/80 px-5 py-3 sm:px-6">
              <h3 className="text-sm font-extrabold text-sky-700">2. 교수·학습 과정안</h3>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-600 ring-1 ring-sky-100">
                총 {totalTime}분
              </span>
            </div>

            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-xs">
                <thead>
                  <tr className="bg-sky-50/70 text-slate-600">
                    <th className="w-[9%] border-b border-slate-200 px-3 py-2.5 font-bold">
                      학습 단계
                    </th>
                    <th className="w-[27%] border-b border-slate-200 px-3 py-2.5 text-left font-bold">
                      교사 활동
                    </th>
                    <th className="w-[27%] border-b border-slate-200 px-3 py-2.5 text-left font-bold">
                      학생 활동
                    </th>
                    <th className="w-[7%] border-b border-slate-200 px-3 py-2.5 font-bold">시간</th>
                    <th className="w-[24%] border-b border-slate-200 px-3 py-2.5 text-left font-bold">
                      자료(▣) 및 유의점(※) 및 평가(☞)
                    </th>
                    <th className="no-print w-12 border-b border-slate-200 px-1 py-2.5" aria-label="행 편집" />
                  </tr>
                </thead>
                <tbody>
                  {flowWithSpans.map((row) => (
                    <tr key={row.id} className="group/row align-top hover:bg-emerald-50/20">
                      {/* 학습 단계 (연속 병합) */}
                      {row.isGroupStart && (
                        <td
                          rowSpan={row.span}
                          className={`border-b border-r border-slate-100 px-2 py-3 text-center align-middle text-sm font-extrabold ${
                            STAGE_STYLES[row.stage] || 'bg-slate-50 text-slate-600'
                          }`}
                        >
                          {row.stage}
                        </td>
                      )}
                      <td className="whitespace-pre-wrap border-b border-slate-100 px-3 py-2.5 leading-relaxed text-slate-600">
                        <EditableCell
                          value={row.teacher}
                          onChange={(v) => updateFlow(row.id, { teacher: v })}
                          placeholder="교사 활동"
                        />
                      </td>
                      <td className="whitespace-pre-wrap border-b border-slate-100 px-3 py-2.5 leading-relaxed text-slate-600">
                        <EditableCell
                          value={row.student}
                          onChange={(v) => updateFlow(row.id, { student: v })}
                          placeholder="학생 활동"
                        />
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2.5 text-center font-semibold text-slate-500">
                        <EditableCell
                          value={row.time}
                          onChange={(v) => updateFlow(row.id, { time: v })}
                          placeholder="5'"
                          textClassName="text-center block"
                        />
                      </td>
                      <td className="whitespace-pre-wrap border-b border-slate-100 px-3 py-2.5 leading-relaxed text-slate-500">
                        <EditableCell
                          value={row.notes}
                          onChange={(v) => updateFlow(row.id, { notes: v })}
                          placeholder={'▣ 자료\n※ 유의점\n☞ 평가'}
                        />
                      </td>
                      {/* 행 추가/삭제 (인쇄 시 숨김) */}
                      <td className="no-print border-b border-slate-100 px-1 py-2.5 text-center">
                        <div className="flex flex-col items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100">
                          <button
                            type="button"
                            onClick={() => addFlowRow(row.id, row.stage)}
                            className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-emerald-50 hover:text-emerald-500"
                            aria-label={`${row.stage} 단계에 행 추가`}
                            title="아래에 행 추가"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFlowRow(row.id)}
                            className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
                            aria-label="행 삭제"
                            title="행 삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="no-print border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-[11px] text-slate-400">
              💡 셀을 클릭해 수정하고, 행 위에 마우스를 올리면 행 추가(＋)·삭제(휴지통) 버튼이
              나타납니다. [인쇄하기]를 누르면 A4 결재 문서 양식으로 출력됩니다.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
