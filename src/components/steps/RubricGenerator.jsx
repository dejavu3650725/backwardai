/**
 * RubricGenerator.jsx — Step 2. 평가 루브릭 생성
 * ------------------------------------------------------------------
 * - Step 1에서 확정한 성취기준을 근거로 AI가 평가 루브릭
 *   (평가 요소 × 평가 방법 × 성취수준 상/중/하 × 피드백)을 생성합니다.
 * - 모든 셀은 EditableCell 로 클릭 즉시 인라인 수정이 가능합니다.
 * - 확정된 루브릭은 App.jsx 상태(rubric)로 올라가 Step 3 과정안의
 *   입력이 됩니다.
 */
import React, { useState, useCallback } from 'react';
import {
  Table2,
  Sparkles,
  Loader2,
  RefreshCw,
  Trash2,
  WifiOff,
  CheckCircle2,
} from 'lucide-react';

import { generateRubric } from '../../lib/aiClient.js';
import { subjectColor } from '../../lib/standardsData.js';
import EditableCell from '../EditableCell.jsx';

/** 성취수준 열 정의 */
const LEVEL_COLUMNS = [
  { key: 'high', label: '상', chip: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
  { key: 'mid', label: '중', chip: 'bg-sky-50 text-sky-600 ring-sky-200' },
  { key: 'low', label: '하', chip: 'bg-amber-50 text-amber-600 ring-amber-200' },
];

export default function RubricGenerator({ selectedStandards, rubric, onRubricChange }) {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /** AI 루브릭 생성 실행 */
  const handleGenerate = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const result = await generateRubric(selectedStandards, topic);
      onRubricChange(result);
    } catch (err) {
      setError(err?.message || '루브릭 생성 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }, [selectedStandards, topic, onRubricChange]);

  /** 루브릭 항목 필드 수정 (인라인 에디팅 → 상태 반영) */
  const updateItem = useCallback(
    (itemId, patch) => {
      onRubricChange({
        ...rubric,
        items: rubric.items.map((it) =>
          it.id === itemId
            ? { ...it, ...patch, levels: { ...it.levels, ...(patch.levels || {}) } }
            : it
        ),
      });
    },
    [rubric, onRubricChange]
  );

  const removeItem = useCallback(
    (itemId) => {
      onRubricChange({ ...rubric, items: rubric.items.filter((it) => it.id !== itemId) });
    },
    [rubric, onRubricChange]
  );

  return (
    <section className="animate-fade-in-up space-y-6">
      {/* ── 생성 컨트롤 카드 ─────────────────────────────────── */}
      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-sky-500">
            <Table2 className="h-4 w-4 text-white" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">AI 평가 루브릭 생성</h2>
            <p className="text-[11px] text-slate-400">
              성취기준 {selectedStandards.length}개를 근거로 평가 요소·성취수준·피드백을
              설계합니다
            </p>
          </div>
        </div>

        {/* 근거 성취기준 요약 칩 */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {selectedStandards.map((s) => (
            <span
              key={s.code}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ring-1 ${subjectColor(
                s.subject
              )}`}
              title={s.description}
            >
              {s.subject} · {s.code}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="평가 장면이나 단원 주제를 입력하면 더 정확해져요. 예: 강낭콩 키우기 프로젝트"
            maxLength={200}
            aria-label="평가 장면 또는 단원 주제"
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
                루브릭 설계 중…
              </>
            ) : rubric ? (
              <>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                다시 생성하기
              </>
            ) : (
              <>
                <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
                AI 루브릭 생성
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
        <div className="card space-y-3 p-6" aria-hidden="true">
          <div className="skeleton h-6 w-1/3" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-24 w-full" />
        </div>
      )}

      {/* ── 루브릭 표 ────────────────────────────────────────── */}
      {!loading && rubric && (
        <div className="card animate-fade-in-up overflow-hidden">
          {/* 표 헤더 영역 */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-teal-50/80 to-sky-50/60 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-500">
                평가 루브릭 — 클릭하면 바로 수정할 수 있어요
              </p>
              <div className="text-base font-bold text-slate-800">
                <EditableCell
                  value={rubric.title}
                  onChange={(v) => onRubricChange({ ...rubric, title: v })}
                  placeholder="평가 명칭"
                />
              </div>
              {rubric.source === 'local-fallback' && (
                <div className="mt-1.5">
                  <p className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-600 ring-1 ring-amber-100">
                    <WifiOff className="h-3 w-3" aria-hidden="true" />
                    AI 서버 미연결 — 성취기준 기반 참고용 초안입니다
                  </p>
                  {rubric.failReason && (
                    <p className="mt-1 text-[10px] text-amber-500/80">사유: {rubric.failReason}</p>
                  )}
                </div>
              )}
            </div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-emerald-600 ring-1 ring-emerald-100">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              평가 요소 {rubric.items.length}개
            </p>
          </div>

          {/* 표 본문 */}
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="bg-teal-50/70 text-xs text-slate-600">
                  <th className="w-[13%] border-b border-slate-200 px-3 py-3 text-left font-bold">
                    성취기준 / 평가 방법
                  </th>
                  <th className="w-[17%] border-b border-slate-200 px-3 py-3 text-left font-bold">
                    평가 요소
                  </th>
                  {LEVEL_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className="w-[16%] border-b border-slate-200 px-3 py-3 text-left font-bold"
                    >
                      <span className={`mr-1 rounded-md px-1.5 py-0.5 ring-1 ${col.chip}`}>
                        {col.label}
                      </span>
                      수준
                    </th>
                  ))}
                  <th className="w-[18%] border-b border-slate-200 px-3 py-3 text-left font-bold">
                    피드백 방향
                  </th>
                  <th className="w-10 border-b border-slate-200 px-1 py-3" aria-label="행 삭제" />
                </tr>
              </thead>
              <tbody>
                {rubric.items.map((item) => (
                  <tr
                    key={item.id}
                    className="align-top transition-colors odd:bg-white even:bg-slate-50/40 hover:bg-emerald-50/30"
                  >
                    <td className="border-b border-slate-100 px-3 py-3">
                      <span className="mb-1.5 block text-[11px] font-bold tracking-wide text-emerald-600">
                        {item.code}
                      </span>
                      <EditableCell
                        value={item.method}
                        onChange={(v) => updateItem(item.id, { method: v })}
                        placeholder="평가 방법"
                        textClassName="text-xs text-slate-500"
                      />
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-700">
                      <EditableCell
                        value={item.element}
                        onChange={(v) => updateItem(item.id, { element: v })}
                        placeholder="평가 요소"
                      />
                    </td>
                    {LEVEL_COLUMNS.map((col) => (
                      <td key={col.key} className="border-b border-slate-100 px-3 py-3 text-xs text-slate-600">
                        <EditableCell
                          value={item.levels[col.key]}
                          onChange={(v) => updateItem(item.id, { levels: { [col.key]: v } })}
                          placeholder={`${col.label} 수준 기술`}
                        />
                      </td>
                    ))}
                    <td className="border-b border-slate-100 px-3 py-3 text-xs text-slate-600">
                      <EditableCell
                        value={item.feedback}
                        onChange={(v) => updateItem(item.id, { feedback: v })}
                        placeholder="피드백 방향"
                      />
                    </td>
                    <td className="border-b border-slate-100 px-1 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
                        aria-label={`${item.code} 평가 요소 삭제`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-[11px] text-slate-400">
            💡 셀을 클릭해 수정한 내용은 자동 저장되며, 다음 단계의 수업 과정안 설계에 그대로
            반영됩니다. (저장: 바깥 클릭 또는 Ctrl+Enter / 취소: Esc)
          </p>
        </div>
      )}

      {/* ── 빈 상태 안내 ─────────────────────────────────────── */}
      {!loading && !rubric && (
        <div className="card px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-sky-100">
            <Table2 className="h-7 w-7 text-emerald-600" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            아직 생성된 루브릭이 없어요
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
            위의 <b className="text-emerald-600">[AI 루브릭 생성]</b> 버튼을 누르면 선택하신
            성취기준을 근거로 평가 요소와 상·중·하 성취수준, 피드백 방향까지 한 번에
            설계해 드립니다.
          </p>
        </div>
      )}
    </section>
  );
}
