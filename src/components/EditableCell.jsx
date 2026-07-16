/**
 * EditableCell.jsx — 클릭 즉시 수정되는 인라인 에디팅 셀
 * ------------------------------------------------------------------
 * - 평소: 일반 텍스트로 표시 (호버 시 연필 아이콘 + 배경 하이라이트)
 * - 클릭: 자동 높이 조절 textarea 로 전환, 자동 포커스
 * - 저장: 포커스 아웃(blur) 또는 Ctrl/Cmd+Enter
 * - 취소: Escape (원래 값으로 복원)
 * - 인쇄 시: textarea 가 아닌 일반 텍스트로만 출력되도록 blur 후 렌더
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';

export default function EditableCell({
  value,
  onChange,
  placeholder = '클릭하여 입력',
  className = '',
  textClassName = '',
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const textareaRef = useRef(null);

  /** textarea 높이를 내용에 맞게 자동 조절 */
  const autoResize = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    }
  };

  useEffect(() => {
    if (editing) {
      autoResize();
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }
  }, [editing]);

  const startEditing = () => {
    setDraft(value ?? '');
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };

  const cancel = () => {
    setDraft(value ?? '');
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
  };

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          autoResize();
        }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        rows={1}
        aria-label={placeholder}
        className={`w-full resize-none overflow-hidden rounded-lg border border-emerald-300 bg-white px-2 py-1.5 text-inherit leading-relaxed shadow-sm outline-none ring-4 ring-emerald-100 ${className}`}
      />
    );
  }

  const isEmpty = !value || !String(value).trim();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={startEditing}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startEditing();
        }
      }}
      title="클릭하여 수정"
      className={`group/cell relative -mx-1 cursor-text rounded-lg px-1 py-0.5 transition-colors hover:bg-emerald-50/70 focus:outline-none focus:ring-2 focus:ring-emerald-200 ${className}`}
    >
      <span
        className={`whitespace-pre-wrap leading-relaxed ${
          isEmpty ? 'italic text-slate-300' : ''
        } ${textClassName}`}
      >
        {isEmpty ? placeholder : value}
      </span>
      <Pencil
        className="pointer-events-none absolute -right-0.5 -top-0.5 h-3 w-3 text-emerald-400 opacity-0 transition-opacity group-hover/cell:opacity-100 print:hidden"
        aria-hidden="true"
      />
    </div>
  );
}
