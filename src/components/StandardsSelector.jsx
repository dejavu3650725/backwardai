/**
 * StandardsSelector.jsx — Step 1. 성취기준 선택 (메인 화면)
 * ------------------------------------------------------------------
 * [기능 A] AI 자연어 융합 추천
 *   - 화면 최상단의 큼직한 검색창에 수업 소재를 자유롭게 입력
 *   - 'AI 추천받기' 클릭 → /api/recommend-standards (Vercel Serverless) 호출
 *   - 결과는 그라데이션 테두리 카드(AiRecommendCard)로 표시
 *
 * [기능 B] 수동 종속(Cascading) 드롭다운
 *   - 학년군 → 과목 → 핵심 아이디어 순차 선택
 *   - 상위 선택이 바뀌면 하위 선택은 자동 초기화
 *
 * [선택 바구니]
 *   - A/B 어느 경로로든 체크된 성취기준은 우측(모바일: 하단)
 *     SelectionBasket에 담기며, 상태는 App.jsx에서 일원 관리
 */
import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  Search,
  Sparkles,
  Wand2,
  GraduationCap,
  BookOpen,
  Lightbulb,
  ChevronDown,
  Check,
  ListChecks,
  Loader2,
} from 'lucide-react';

import {
  getGrades,
  getSubjects,
  getCoreIdeas,
  filterStandards,
  subjectColor,
} from '../lib/standardsData.js';
import { recommendStandards } from '../lib/aiClient.js';
import AiRecommendCard from './AiRecommendCard.jsx';
import SelectionBasket from './SelectionBasket.jsx';

/** 검색창 아래에 보여줄 예시 주제 칩 */
const EXAMPLE_TOPICS = ['강낭콩 키우기', '우리 동네 시장 탐방', '학교 뉴스 만들기', '운동회'];

export default function StandardsSelector({ selectedStandards, onToggle, onRemove, onClear }) {
  /* ── [기능 A] AI 추천 상태 ─────────────────────────────── */
  const [topic, setTopic] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState('');
  const inputRef = useRef(null);

  /* ── [기능 B] 종속 드롭다운 상태 ───────────────────────── */
  const [grade, setGrade] = useState('');
  const [subject, setSubject] = useState('');
  const [coreIdeaId, setCoreIdeaId] = useState('');

  /** 드롭다운 옵션 (상위 선택에 종속) */
  const grades = useMemo(() => getGrades(), []);
  const subjects = useMemo(() => getSubjects(grade), [grade]);
  const coreIdeas = useMemo(() => getCoreIdeas(grade, subject), [grade, subject]);

  const selectedCoreIdea = useMemo(
    () => coreIdeas.find((ci) => ci.id === coreIdeaId) || null,
    [coreIdeas, coreIdeaId]
  );

  /** 드롭다운 3단 선택 완료 시 표시할 성취기준 목록 */
  const manualStandards = useMemo(() => {
    if (!grade || !subject || !selectedCoreIdea) return [];
    return filterStandards({ grade, subject, coreIdea: selectedCoreIdea.full });
  }, [grade, subject, selectedCoreIdea]);

  /** 선택된 코드 Set (체크 표시용) */
  const selectedCodes = useMemo(
    () => new Set(selectedStandards.map((s) => s.code)),
    [selectedStandards]
  );

  /* ── 이벤트 핸들러 ─────────────────────────────────────── */

  /** 학년군 변경 → 하위(과목/핵심아이디어) 초기화 */
  const handleGradeChange = useCallback((value) => {
    setGrade(value);
    setSubject('');
    setCoreIdeaId('');
  }, []);

  /** 과목 변경 → 하위(핵심아이디어) 초기화 */
  const handleSubjectChange = useCallback((value) => {
    setSubject(value);
    setCoreIdeaId('');
  }, []);

  /** AI 추천 실행 */
  const handleRecommend = useCallback(
    async (overrideTopic) => {
      const query = (overrideTopic ?? topic).trim();
      if (!query) {
        setAiError('수업 소재나 주제를 먼저 입력해 주세요.');
        inputRef.current?.focus();
        return;
      }
      setAiError('');
      setAiLoading(true);
      setAiResult(null);
      try {
        const result = await recommendStandards(query, { grade: grade || null });
        setAiResult(result);
      } catch (err) {
        setAiError(err?.message || 'AI 추천 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.');
      } finally {
        setAiLoading(false);
      }
    },
    [topic, grade]
  );

  /** 예시 칩 클릭 → 입력 채우고 즉시 추천 */
  const handleExampleClick = useCallback(
    (example) => {
      setTopic(example);
      handleRecommend(example);
    },
    [handleRecommend]
  );

  /** AI 추천 결과 [모두 담기] */
  const handleAddAll = useCallback(() => {
    if (!aiResult) return;
    aiResult.items.forEach((item) => {
      if (!selectedCodes.has(item.code)) onToggle(item);
    });
  }, [aiResult, selectedCodes, onToggle]);

  /* ── 렌더링 ────────────────────────────────────────────── */
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* ══════════ 좌측(2/3): 검색 + 드롭다운 + 목록 ══════════ */}
      <div className="space-y-6 lg:col-span-2">
        {/* ── [기능 A] AI 자연어 융합 추천 ─────────────────── */}
        <section className="card animate-fade-in-up p-5 sm:p-6" aria-labelledby="ai-search-title">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-sky-500">
              <Wand2 className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <div>
              <h2 id="ai-search-title" className="text-sm font-bold text-slate-800">
                AI 융합 성취기준 추천
              </h2>
              <p className="text-[11px] text-slate-400">
                수업 소재만 입력하면 교과를 넘나드는 성취기준 조합을 찾아드려요
              </p>
            </div>
          </div>

          {/* 큼직한 검색창 + AI 추천받기 버튼 */}
          <form
            className="flex flex-col gap-2.5 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              handleRecommend();
            }}
          >
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-300"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="수업 소재나 주제를 자유롭게 입력해 보세요. 예: 강낭콩 키우기"
                aria-label="수업 소재 또는 주제"
                maxLength={200}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/60 py-4 pl-12 pr-4 text-[15px] text-slate-800 placeholder-slate-400 shadow-sm transition-all focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100"
              />
            </div>
            <button
              type="submit"
              disabled={aiLoading}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-sky-500 px-6 py-4 text-sm font-bold text-white shadow-sm transition-all hover:from-emerald-600 hover:to-sky-600 hover:shadow-card-hover focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 h-[18px] w-[18px] animate-spin" aria-hidden="true" />
                  분석 중…
                </>
              ) : (
                <>
                  <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
                  AI 추천받기
                </>
              )}
            </button>
          </form>

          {/* 예시 주제 칩 */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400">이런 주제는 어때요?</span>
            {EXAMPLE_TOPICS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handleExampleClick(example)}
                className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200 transition-colors hover:bg-emerald-50 hover:text-emerald-600 hover:ring-emerald-200"
              >
                {example}
              </button>
            ))}
          </div>

          {/* 오류 메시지 */}
          {aiError && (
            <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-500 ring-1 ring-rose-100">
              {aiError}
            </p>
          )}

          {/* 로딩 스켈레톤 */}
          {aiLoading && (
            <div className="gradient-border mt-4" aria-hidden="true">
              <div className="space-y-3 rounded-[calc(1rem-1.5px)] bg-white p-5">
                <div className="skeleton h-5 w-2/5" />
                <div className="skeleton h-3.5 w-4/5" />
                <div className="skeleton h-14 w-full" />
                <div className="skeleton h-14 w-full" />
                <div className="skeleton h-14 w-full" />
              </div>
            </div>
          )}

          {/* AI 추천 결과 카드 (그라데이션 테두리) */}
          {!aiLoading && aiResult && (
            <div className="mt-4">
              <AiRecommendCard
                result={aiResult}
                selectedCodes={selectedCodes}
                onToggle={onToggle}
                onAddAll={handleAddAll}
              />
            </div>
          )}
        </section>

        {/* ── [기능 B] 수동 종속 드롭다운 ──────────────────── */}
        <section className="card animate-fade-in-up p-5 sm:p-6" aria-labelledby="manual-title">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 ring-1 ring-sky-100">
              <ListChecks className="h-4 w-4 text-sky-500" aria-hidden="true" />
            </div>
            <div>
              <h2 id="manual-title" className="text-sm font-bold text-slate-800">
                교육과정에서 직접 선택
              </h2>
              <p className="text-[11px] text-slate-400">
                학년군 → 과목 → 핵심 아이디어 순으로 좁혀 보세요
              </p>
            </div>
          </div>

          {/* 3단 종속 드롭다운 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* 1) 학년군 */}
            <SelectField
              icon={GraduationCap}
              label="학교급 / 학년군"
              value={grade}
              onChange={handleGradeChange}
              placeholder="학년군 선택"
              options={grades.map((g) => ({ value: g, label: `초등 ${g}` }))}
            />
            {/* 2) 과목 */}
            <SelectField
              icon={BookOpen}
              label="과목"
              value={subject}
              onChange={handleSubjectChange}
              placeholder={grade ? '과목 선택' : '학년군을 먼저 선택'}
              disabled={!grade}
              options={subjects.map((s) => ({ value: s, label: s }))}
            />
            {/* 3) 핵심 아이디어 */}
            <SelectField
              icon={Lightbulb}
              label="핵심 아이디어 (영역)"
              value={coreIdeaId}
              onChange={setCoreIdeaId}
              placeholder={subject ? '핵심 아이디어 선택' : '과목을 먼저 선택'}
              disabled={!subject}
              options={coreIdeas.map((ci) => ({ value: ci.id, label: `[${ci.area}] ${ci.label}` }))}
            />
          </div>

          {/* 선택된 핵심 아이디어 원문 */}
          {selectedCoreIdea && (
            <div className="mt-4 animate-fade-in-up rounded-xl bg-gradient-to-r from-sky-50/80 to-emerald-50/80 p-4 ring-1 ring-sky-100">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-500">
                <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
                핵심 아이디어 — {selectedCoreIdea.area}
              </p>
              <p className="text-xs leading-relaxed text-slate-600">{selectedCoreIdea.full}</p>
            </div>
          )}

          {/* 성취기준 목록 */}
          {manualStandards.length > 0 ? (
            <ul className="mt-4 space-y-2" aria-label="성취기준 목록">
              {manualStandards.map((std) => {
                const isSelected = selectedCodes.has(std.code);
                return (
                  <li key={std.code}>
                    <button
                      type="button"
                      onClick={() => onToggle(std)}
                      aria-pressed={isSelected}
                      className={`group flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                        isSelected
                          ? 'border-emerald-300 bg-emerald-50/60 shadow-sm'
                          : 'border-slate-100 bg-white hover:border-emerald-200 hover:bg-slate-50/70'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500'
                            : 'border-slate-300 bg-white group-hover:border-emerald-400'
                        }`}
                        aria-hidden="true"
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3.5} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="mb-0.5 block text-[11px] font-bold tracking-wide text-emerald-600">
                          {std.code}
                        </span>
                        <span className="block text-sm leading-relaxed text-slate-700">
                          {std.description}
                        </span>
                      </span>
                      <span
                        className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${subjectColor(
                          std.subject
                        )}`}
                      >
                        {std.subject}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
              <ChevronDown className="mx-auto mb-2 h-5 w-5 text-slate-300" aria-hidden="true" />
              <p className="text-sm text-slate-400">
                세 단계를 모두 선택하면 해당 성취기준이 이곳에 나타납니다
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ══════════ 우측(1/3): 선택 바구니 ══════════ */}
      <div className="lg:col-span-1">
        <SelectionBasket items={selectedStandards} onRemove={onRemove} onClear={onClear} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
 * SelectField — 라벨/아이콘이 붙은 공통 드롭다운
 * ---------------------------------------------------------------- */
function SelectField({ icon: Icon, label, value, onChange, options, placeholder, disabled }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <Icon className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        {label}
      </span>
      <span className="relative block">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="select-base"
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
      </span>
    </label>
  );
}
