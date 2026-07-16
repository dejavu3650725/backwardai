/**
 * Stepper.jsx — 상단 가로형 프로세스 진행 표시기
 * ------------------------------------------------------------------
 * 1. 성취기준 선택 → 2. 루브릭 생성 → 3. 평가 및 피드백 → 4. 생기부 연계
 * - 완료 단계: 에메랄드 체크 원 + 채워진 연결선
 * - 현재 단계: 그라데이션 링 강조
 * - 미래 단계: 회색 비활성
 * - 완료된 단계는 클릭하여 되돌아갈 수 있습니다.
 */
import React from 'react';
import { Check } from 'lucide-react';

export default function Stepper({ steps, currentStep, onStepClick }) {
  return (
    <nav aria-label="진행 단계" className="w-full">
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isClickable = isCompleted && typeof onStepClick === 'function';
          const Icon = step.icon;

          return (
            <li
              key={step.id}
              className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}
            >
              {/* 스텝 원 + 라벨 */}
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick(index)}
                className={`group flex flex-col items-center gap-2 outline-none sm:flex-row sm:gap-3 ${
                  isClickable ? 'cursor-pointer' : 'cursor-default'
                }`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span
                  className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all duration-300
                    ${
                      isCompleted
                        ? 'bg-emerald-500 text-white shadow-sm group-hover:bg-emerald-600'
                        : isCurrent
                          ? 'bg-gradient-to-br from-emerald-400 to-sky-500 text-white shadow-md ring-4 ring-emerald-100'
                          : 'border-2 border-slate-200 bg-white text-slate-400'
                    }`}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
                  ) : Icon ? (
                    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </span>

                <span className="flex flex-col items-center sm:items-start">
                  <span
                    className={`text-[11px] font-medium tracking-wide ${
                      isCurrent ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    STEP {index + 1}
                  </span>
                  <span
                    className={`whitespace-nowrap text-xs font-semibold sm:text-sm ${
                      isCurrent
                        ? 'text-slate-800'
                        : isCompleted
                          ? 'text-slate-600 group-hover:text-slate-800'
                          : 'text-slate-400'
                    }`}
                  >
                    {step.title}
                  </span>
                </span>
              </button>

              {/* 연결선 */}
              {index < steps.length - 1 && (
                <div className="mx-2 h-[3px] flex-1 overflow-hidden rounded-full bg-slate-200 sm:mx-4">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-all duration-500 ${
                      isCompleted ? 'w-full' : 'w-0'
                    }`}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
