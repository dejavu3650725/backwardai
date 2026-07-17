/**
 * AiRecommendCard.jsx — AI 융합 추천 결과 카드
 * ------------------------------------------------------------------
 * 은은한 그라데이션 테두리(gradient-border) 안에 AI가 제안한
 * 융합 단원명 + 추천 사유 + 성취기준 목록을 표시합니다.
 * 각 항목은 체크(담기) 토글이 가능하며, [모두 담기]를 지원합니다.
 */
import React from 'react';
import { Sparkles, Plus, Check, WifiOff } from 'lucide-react';
import { subjectColor } from '../lib/standardsData.js';

export default function AiRecommendCard({ result, selectedCodes, onToggle, onAddAll }) {
  const { theme, summary, items, source } = result;
  const allSelected = items.length > 0 && items.every((it) => selectedCodes.has(it.code));

  return (
    <div className="gradient-border animate-fade-in-up" role="region" aria-label="AI 추천 결과">
      <div className="rounded-[calc(1rem-1.5px)] bg-white">
        {/* 헤더 */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-sky-500 shadow-sm">
              <Sparkles className="h-4.5 w-4.5 h-[18px] w-[18px] text-white" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500">
                AI 융합 단원 제안
              </p>
              <h3 className="text-base font-bold text-slate-800">{theme}</h3>
              {summary && (
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">{summary}</p>
              )}
              {source === 'local-fallback' && (
                <div className="mt-1.5">
                  <p className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-600 ring-1 ring-amber-100">
                    <WifiOff className="h-3 w-3" aria-hidden="true" />
                    AI 서버 미연결 — 키워드 분석 기반 참고 결과입니다
                  </p>
                  {result.failReason && (
                    <p className="mt-1 text-[10px] text-amber-500/80">사유: {result.failReason}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {items.length > 0 && (
            <button
              type="button"
              onClick={onAddAll}
              disabled={allSelected}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600 ring-1 ring-emerald-200 transition-colors hover:bg-emerald-100 disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-400 disabled:ring-slate-200"
            >
              {allSelected ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" /> 모두 담김
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> 모두 담기
                </>
              )}
            </button>
          )}
        </div>

        {/* 추천 항목 목록 */}
        {items.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">
            관련 성취기준을 찾지 못했어요. 주제를 조금 더 구체적으로 입력하거나, 아래에서 직접
            선택해 보세요.
          </p>
        ) : (
          <ul className="divide-y divide-slate-50 px-2 py-1.5 sm:px-3">
            {items.map((item) => {
              const isSelected = selectedCodes.has(item.code);
              return (
                <li key={item.code}>
                  <button
                    type="button"
                    onClick={() => onToggle(item)}
                    aria-pressed={isSelected}
                    className={`group flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors ${
                      isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* 체크박스 */}
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
                      <span className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${subjectColor(
                            item.subject
                          )}`}
                        >
                          {item.subject}
                        </span>
                        <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
                          {item.grade} · {item.area}
                        </span>
                        <span className="text-[11px] font-bold tracking-wide text-emerald-600">
                          {item.code}
                        </span>
                      </span>
                      <span className="block text-sm font-medium leading-relaxed text-slate-700">
                        {item.description}
                      </span>
                      {item.reason && (
                        <span className="mt-1 block rounded-lg bg-gradient-to-r from-emerald-50/80 to-sky-50/80 px-2.5 py-1.5 text-xs leading-relaxed text-slate-500">
                          💡 {item.reason}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
