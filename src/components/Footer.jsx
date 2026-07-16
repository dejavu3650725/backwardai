/**
 * Footer.jsx — 하단 정보 푸터 + 이용약관/개인정보처리방침 모달
 * ------------------------------------------------------------------
 * - 푸터: 이용약관 | 개인정보처리방침 링크, 정보관리책임자, 저작권 표기
 * - 링크 클릭 시 스크롤 가능한 모달로 전문 표시 (Esc/배경 클릭으로 닫기)
 * - 인쇄 시에는 노출되지 않음 (no-print)
 */
import React, { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';

/* ==================================================================
 * 약관/방침 본문 데이터
 * ================================================================== */

const TERMS = {
  title: '이용약관',
  sections: [
    {
      heading: '제1조 (목적)',
      body: [
        '본 약관은 서울고덕초등학교 금정민(이하 "운영자")이 제공하는 백워드 AI(이하 "서비스")의 이용과 관련하여, 운영자와 사용자 간의 권리, 의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.',
      ],
    },
    {
      heading: '제2조 (용어의 정의)',
      body: [
        '1. "서비스"란 2022 개정 교육과정 성취기준을 기반으로 평가 루브릭 생성, 수업 과정안 설계 등 과정 중심 평가를 지원하는 백워드 AI 관련 제반 서비스를 의미합니다.',
        '2. "사용자"란 본 서비스에 접속하여 이 약관에 따라 운영자가 제공하는 서비스를 받는 교사 및 일반 이용자를 말합니다.',
      ],
    },
    {
      heading: '제3조 (약관의 효력 및 변경)',
      body: [
        '1. 본 약관은 서비스 화면에 게시함으로써 효력이 발생합니다.',
        '2. 운영자는 필요하다고 인정되는 경우 관련 법령을 위배하지 않는 범위 내에서 본 약관을 변경할 수 있으며, 변경된 약관은 서비스 내에 공지함으로써 효력이 발생합니다.',
      ],
    },
    {
      heading: '제4조 (서비스의 제공 및 변경)',
      body: [
        '1. 서비스는 교육적 목적을 위해 무상으로 제공됨을 원칙으로 합니다.',
        '2. 운영자는 필요에 따라 서비스의 내용을 변경하거나 중단할 수 있으며, 이 경우 사용자에게 사전 통지하지 않을 수 있습니다.',
        '3. 서비스가 인공지능(AI)을 통해 생성한 성취기준 추천, 평가 루브릭, 수업 과정안 등은 수업 설계를 돕는 참고 자료이며, 교육과정과의 정합성 검토 등 최종 판단과 활용에 대한 책임은 사용자에게 있습니다.',
      ],
    },
    {
      heading: '제5조 (사용자의 의무)',
      body: [
        '1. 사용자는 서비스를 이용할 때 타인의 권리를 침해하거나 법령에 위반되는 행위를 하여서는 안 됩니다.',
        '2. 사용자는 서비스의 원활한 운영을 방해하는 해킹, 악성코드 유포 등의 행위를 할 수 없습니다.',
        '3. 사용자는 서비스의 입력창에 학생의 실명, 연락처 등 개인정보를 입력하여서는 안 됩니다.',
        '4. 서비스로 생성·공유된 교육 자료는 교육적 목적으로만 활용되어야 하며, 상업적 무단 도용을 금합니다.',
      ],
    },
    {
      heading: '제6조 (저작권 및 지적재산권)',
      body: [
        '1. 운영자가 작성한 서비스 내의 디자인, 텍스트, 코드 등에 대한 저작권은 운영자에게 있습니다.',
        '2. 사용자가 AI 생성 결과물을 수정·보완하여 완성한 평가 루브릭, 수업 과정안 등 산출물은 해당 사용자가 교육 목적으로 자유롭게 활용할 수 있습니다.',
        '3. 사용자가 서비스 내에 등록한 데이터에 대한 일차적 책임은 해당 사용자에게 있습니다.',
      ],
    },
    {
      heading: '제7조 (면책 조항)',
      body: [
        '1. 운영자는 천재지변, 서버 장애 등 불가항력적인 사유로 인해 서비스를 제공할 수 없는 경우 책임이 면제됩니다.',
        '2. AI가 생성한 정보의 정확성·완전성은 보장되지 않으며, 운영자는 사용자가 서비스를 이용하여 얻은 정보 등으로 인해 발생한 손해에 대하여 책임지지 않습니다.',
      ],
    },
    {
      heading: '부칙',
      body: ['본 약관은 2026년 7월 16일부터 시행됩니다.'],
    },
  ],
};

const PRIVACY = {
  title: '개인정보처리방침',
  sections: [
    {
      heading: '',
      body: [
        '서울고덕초등학교 금정민(이하 "운영자")은(는) 「개인정보 보호법」 등 관련 법령에 따라 사용자(교사 및 일반 이용자)의 개인정보를 보호하고 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 다음과 같이 개인정보 처리방침을 수립·공개합니다.',
      ],
    },
    {
      heading: '제1조 (개인정보의 처리 목적)',
      body: [
        '운영자는 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음 목적 이외의 용도로는 이용되지 않으며, 이용 목적이 변경되는 경우에는 「개인정보 보호법」에 따라 별도의 동의를 받는 등 필요한 조치를 이행할 예정입니다.',
        '1. 서비스 제공 및 운영: 성취기준 기반 평가 루브릭·수업 과정안 생성 기능 제공, 작업물 저장 및 불러오기, 교사 계정 관리.',
        '2. 사용자 편의성 향상: 개인 작업 이력 관리 및 맞춤형 수업 설계 지원 콘텐츠 제공.',
      ],
    },
    {
      heading: '제2조 (처리하는 개인정보의 항목)',
      body: [
        '운영자는 서비스 제공을 위해 최소한의 범위 내에서 아래와 같은 개인정보를 처리할 수 있습니다.',
        '- 필수항목: (구글 계정 로그인 이용 시) 이메일 주소, 이름, 프로필 사진, 사용자가 생성·저장한 평가 루브릭 및 수업 과정안 데이터 (Firestore 저장)',
        '- 선택항목: 해당 없음',
        '※ 본 서비스는 학생의 개인정보를 수집하지 않으며, 사용자는 입력창에 학생의 실명 등 개인정보를 입력해서는 안 됩니다.',
      ],
    },
    {
      heading: '제3조 (개인정보의 처리 및 보유 기간)',
      body: [
        '1. 운영자는 법령에 따른 개인정보 보유·이용 기간 또는 사용자로부터 개인정보를 수집할 때 동의받은 기간 내에서 개인정보를 처리·보유합니다.',
        '2. 사용자의 서비스 이용 기록 및 데이터는 계정 삭제 요청 시 또는 서비스 종료 시 지체 없이 파기됩니다.',
      ],
    },
    {
      heading: '제4조 (개인정보의 제3자 제공 및 처리 위탁)',
      body: [
        '운영자는 사용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 아래의 경우에는 예외로 합니다.',
        '1. 사용자가 사전에 동의한 경우',
        '2. 법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우',
        '※ AI 기능 제공을 위하여 사용자가 입력한 수업 주제, 선택한 성취기준 등의 텍스트는 Google(Gemini API)에 전송되어 처리됩니다. 해당 텍스트에 개인정보가 포함되지 않도록 유의해 주시기 바랍니다.',
      ],
    },
    {
      heading: '제5조 (사용자의 권리와 그 행사 방법)',
      body: [
        '사용자는 언제든지 등록되어 있는 자신의 개인정보를 조회하거나 수정할 수 있으며, 삭제를 요청할 수도 있습니다. 삭제 요청은 정보관리책임자에게 서면, 전화 또는 이메일로 연락하시면 지체 없이 조치하겠습니다.',
      ],
    },
    {
      heading: '제6조 (개인정보의 안전성 확보 조치)',
      body: [
        '운영자는 개인정보의 안전성 확보를 위해 관리적, 기술적 조치를 취하고 있습니다. (파이어베이스 보안 규칙 적용, AI API 키의 서버측 분리 관리 등)',
      ],
    },
    {
      heading: '제7조 (개인정보 보호책임자 및 정보관리책임자)',
      body: [
        '운영자는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 사용자의 불만 처리 및 피해 구제를 위하여 아래와 같이 책임자를 지정하고 있습니다.',
        '- 정보관리책임자: 서울고덕초등학교 금정민',
        '- 연락처: 02-427-0525',
      ],
    },
    {
      heading: '부칙',
      body: ['이 개인정보처리방침은 2026년 7월 16일부터 적용됩니다.'],
    },
  ],
};

/* ==================================================================
 * 모달
 * ================================================================== */
function PolicyModal({ doc, onClose }) {
  /** Esc 키로 닫기 */
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  /** 모달이 열려 있는 동안 배경 스크롤 잠금 */
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={doc.title}
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 sm:px-8">
          <h2 className="text-lg font-extrabold text-slate-800">{doc.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="닫기"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* 본문 */}
        <div className="scrollbar-thin overflow-y-auto px-6 py-6 sm:px-8">
          {doc.sections.map((section, i) => (
            <section key={i} className={i > 0 ? 'mt-6' : ''}>
              {section.heading && (
                <h3 className="mb-2 text-sm font-extrabold text-slate-800">{section.heading}</h3>
              )}
              {section.body.map((paragraph, j) => (
                <p key={j} className="mb-1.5 text-sm leading-relaxed text-slate-600">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ==================================================================
 * 푸터
 * ================================================================== */
export default function Footer() {
  const [openDoc, setOpenDoc] = useState(null); // null | 'terms' | 'privacy'
  const close = useCallback(() => setOpenDoc(null), []);

  return (
    <>
      <div className="no-print mt-12 border-t border-slate-200/70 pb-8 pt-8 text-center">
        <div className="flex items-center justify-center gap-4 text-sm">
          <button
            type="button"
            onClick={() => setOpenDoc('terms')}
            className="font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            이용약관
          </button>
          <span className="h-3.5 w-px bg-slate-300" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setOpenDoc('privacy')}
            className="font-bold text-slate-700 transition-colors hover:text-slate-900"
          >
            개인정보처리방침
          </button>
        </div>

        <p className="mt-4 text-sm text-slate-500">정보관리책임자: 금정민</p>
        <p className="mt-1.5 text-sm text-slate-400">
          © 2026 서울고덕초등학교 금정민. All rights reserved.
        </p>
      </div>

      {openDoc === 'terms' && <PolicyModal doc={TERMS} onClose={close} />}
      {openDoc === 'privacy' && <PolicyModal doc={PRIVACY} onClose={close} />}
    </>
  );
}
