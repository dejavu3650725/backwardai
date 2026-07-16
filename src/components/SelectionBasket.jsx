/**
 * SelectionBasket.jsx — 선택된 성취기준 바구니
 * ------------------------------------------------------------------
 * AI 추천(기능 A)·수동 드롭다운(기능 B) 어느 경로로 담았든
 * 선택된 성취기준이 이곳에 모입니다. 개별 제거/전체 비우기를 지원하며,
 * 데스크톱에서는 우측에 sticky로 고정됩니다.
 */
import React from 'react';
import { ShoppingBasket, X, Trash2, ArrowRight } from 'lucide-react';
import { subjectColor } from '../lib/standardsData.js';

export default function SelectionBasket({ items, onRemove, onClear }) {
  return (
    <aside className="card overflow-hidden lg:sticky lg:top-40" aria-label="선택된 성취기준 바구니">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-50/70 to-sky-50/70 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-emerald-100">
            <ShoppingBasket className="h-4 w-4 text-emerald-500" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">선택된 성취기준</h3>
            <p className="text-[11px] text-slate-400">루브릭 생성의 재료가 됩니다</p>
          </div>
        </div>
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-emerald-500 px-2 text-xs font-bold text-white">
          {items.length}
        </span>
      </div>

      {/* 목록 */}
      {items.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50">
            <ShoppingBasket className="h-5 w-5 text-slate-300" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-slate-500">아직 담긴 성취기준이 없어요</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            AI 추천 결과나 목록에서 체크하면
            <br />
            이곳에 차곡차곡 담깁니다
          </p>
        </div>
      ) : (
        <>
          <ul className="scrollbar-thin max-h-[46vh] space-y-2.5 overflow-y-auto px-4 py-4">
            {items.map((item) => (
              <li
                key={item.code}
                className="group relative animate-fade-in-up rounded-xl border border-slate-100 bg-slate-50/80 p-3 pr-9 transition-colors hover:border-emerald-200 hover:bg-emerald-50/40"
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${subjectColor(
                      item.subject
                    )}`}
                  >
                    {item.subject}
                  </span>
                  <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
                    {item.grade}
                  </span>
                  <span className="text-[10px] font-bold tracking-wide text-emerald-600">
                    {item.code}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-600">{item.description}</p>

                <button
                  type="button"
                  onClick={() => onRemove(item.code)}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
                  aria-label={`${item.code} 선택 해제`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          {/* 푸터 액션 */}
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              전체 비우기
            </button>
            <p className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
              다음 단계에서 루브릭 생성
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </p>
          </div>
        </>
      )}
    </aside>
  );
}
