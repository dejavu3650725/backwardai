/**
 * AssessmentFeedback.jsx — Step 3. 평가 및 피드백 (Phase 4에서 구현 예정)
 * ------------------------------------------------------------------
 * 루브릭 기반 학생별 관찰 기록 입력 → AI 피드백 문장 생성 화면의
 * 자리표시자입니다.
 */
import React from 'react';
import { MessageSquareHeart, Sparkles } from 'lucide-react';

export default function AssessmentFeedback({ selectedStandards }) {
  return (
    <section className="animate-fade-in-up">
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-indigo-100">
          <MessageSquareHeart className="h-7 w-7 text-sky-600" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">평가 및 피드백</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
          루브릭을 기준으로 학생별 수행 관찰 내용을 기록하면, AI가 성취기준
          <b className="text-sky-600"> {selectedStandards.length}개</b>에 근거한 맞춤형 피드백
          문장을 제안합니다.
          <br />
          <span className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Phase 4에서 구현될 화면입니다.
          </span>
        </p>
      </div>
    </section>
  );
}
