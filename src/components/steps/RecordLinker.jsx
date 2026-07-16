/**
 * RecordLinker.jsx — Step 4. 생기부 연계 (Phase 5에서 구현 예정)
 * ------------------------------------------------------------------
 * 누적된 평가·피드백 기록을 학교생활기록부 '교과학습발달상황' 문구로
 * 변환(NEIS 입력 규정 준수: 음슴체, 글자 수 제한 등)하는 화면의
 * 자리표시자입니다.
 */
import React from 'react';
import { FileText, Sparkles } from 'lucide-react';

export default function RecordLinker({ selectedStandards }) {
  return (
    <section className="animate-fade-in-up">
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-emerald-100">
          <FileText className="h-7 w-7 text-indigo-600" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">생기부 연계</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
          평가 기록을 성취기준 <b className="text-indigo-600">{selectedStandards.length}개</b>와
          연계하여 NEIS 입력 규정(음슴체, 글자 수 제한)에 맞는 교과학습발달상황 문구 초안을
          생성합니다.
          <br />
          <span className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Phase 5에서 구현될 화면입니다.
          </span>
        </p>
      </div>
    </section>
  );
}
