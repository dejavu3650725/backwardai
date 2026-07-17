/**
 * assessmentStore.js — 평가 세션/제출 데이터 레이어 (Firestore)
 * ------------------------------------------------------------------
 * 데이터 구조:
 *   sessions/{code}
 *     { code, title, rubric, questions, status: 'open'|'closed', createdAt }
 *   sessions/{code}/submissions/{id}
 *     { studentName, answers: [{ qid, text?, level?, target? }],
 *       aiEval: { items: [{ qid, level, feedback, reason }], overall } | null,
 *       status: 'submitted'|'evaluated'|'approved',
 *       submittedAt, approvedAt? }
 *
 * ⚠️ Firebase 미설정 환경에서는 firestoreReady()가 false를 반환하며,
 *    화면은 설정 안내를 표시합니다.
 */
import { db, isFirebaseConfigured } from '../firebase.js';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';

/** Firestore 사용 가능 여부 */
export function firestoreReady() {
  return isFirebaseConfigured && Boolean(db);
}

/* ── 참여 코드 ─────────────────────────────────────────────── */
/** 혼동 문자를 제외한 코드 문자셋 (O/0, I/1 제외) */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode(length = 6) {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_CHARS[values[i] % CODE_CHARS.length];
  }
  return code;
}

/** 학생 참여 링크 */
export function joinUrl(code) {
  return `${window.location.origin}/?code=${code}`;
}

/* ── 세션 ─────────────────────────────────────────────────── */

/** 새 평가 세션 생성 → 코드 반환 (코드 충돌 시 최대 5회 재시도) */
export async function createSession({ title, rubric, questions }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    const ref = doc(db, 'sessions', code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;

    await setDoc(ref, {
      code,
      title,
      rubric: {
        title: rubric.title,
        items: rubric.items.map(({ id, code: stdCode, element, method, levels, feedback }) => ({
          id,
          code: stdCode,
          element,
          method,
          levels,
          feedback,
        })),
      },
      questions,
      status: 'open',
      createdAt: serverTimestamp(),
    });
    return code;
  }
  throw new Error('참여 코드 생성에 실패했습니다. 다시 시도해 주세요.');
}

export async function getSession(code) {
  const snap = await getDoc(doc(db, 'sessions', String(code).toUpperCase()));
  return snap.exists() ? snap.data() : null;
}

export async function setSessionStatus(code, status) {
  await updateDoc(doc(db, 'sessions', code), { status });
}

/* ── 제출 ─────────────────────────────────────────────────── */

/** 학생 답안 제출 → 제출 문서 id 반환 */
export async function submitAnswers(code, { studentName, answers }) {
  const ref = await addDoc(collection(db, 'sessions', code, 'submissions'), {
    studentName,
    answers,
    aiEval: null,
    status: 'submitted',
    submittedAt: serverTimestamp(),
  });
  return ref.id;
}

/** (교사) 제출 목록 실시간 구독 */
export function listenSubmissions(code, callback) {
  const q = query(collection(db, 'sessions', code, 'submissions'), orderBy('submittedAt', 'asc'));
  return onSnapshot(q, (qs) => {
    callback(qs.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/** (학생) 자기 제출 문서 실시간 구독 — 승인된 피드백 수신용 */
export function listenSubmission(code, submissionId, callback) {
  return onSnapshot(doc(db, 'sessions', code, 'submissions', submissionId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

/** (교사) AI 평가 결과 저장 */
export async function saveEvaluation(code, submissionId, aiEval) {
  await updateDoc(doc(db, 'sessions', code, 'submissions', submissionId), {
    aiEval,
    status: 'evaluated',
  });
}

/** (교사) 승인 → 학생에게 피드백 공개 */
export async function approveSubmission(code, submissionId, aiEval) {
  await updateDoc(doc(db, 'sessions', code, 'submissions', submissionId), {
    aiEval,
    status: 'approved',
    approvedAt: serverTimestamp(),
  });
}

/* ── 로컬 기억 (새로고침 대비) ────────────────────────────── */
export function rememberTeacherSession(code) {
  try {
    localStorage.setItem('bw_teacher_session', code);
  } catch {
    /* 무시 */
  }
}
export function recallTeacherSession() {
  try {
    return localStorage.getItem('bw_teacher_session');
  } catch {
    return null;
  }
}
export function forgetTeacherSession() {
  try {
    localStorage.removeItem('bw_teacher_session');
  } catch {
    /* 무시 */
  }
}

export function rememberStudentSubmission(code, submissionId, studentName) {
  try {
    localStorage.setItem(`bw_student_${code}`, JSON.stringify({ submissionId, studentName }));
  } catch {
    /* 무시 */
  }
}
export function recallStudentSubmission(code) {
  try {
    const raw = localStorage.getItem(`bw_student_${code}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ── 루브릭 → 학생 문항 자동 구성 ─────────────────────────── */
/**
 * 루브릭의 '평가 방법'에 따라 학생 화면 문항 유형을 결정합니다.
 *   - 자기평가  → self  : 상/중/하 수준 기술 중 자기 수준 선택 + 이유
 *   - 동료평가  → peer  : 평가 대상(친구/모둠) + 서술
 *   - 그 외(서술·구술·관찰·실기·포트폴리오) → written : 서술형
 */
export function buildQuestionsFromRubric(rubric) {
  return rubric.items.map((item, index) => {
    const method = item.method || '';
    let type = 'written';
    if (method.includes('자기')) type = 'self';
    else if (method.includes('동료')) type = 'peer';

    const prompt =
      type === 'self'
        ? `'${item.element}'에 대해 스스로 평가해 봅시다. 나의 수준을 고르고, 그렇게 생각한 까닭을 써 보세요.`
        : type === 'peer'
          ? `모둠 친구의 '${item.element}' 모습을 떠올려 보고, 잘한 점과 도와주고 싶은 점을 써 보세요.`
          : `'${item.element}'와 관련하여, 이번 활동에서 내가 수행한 과정과 알게 된 점을 자세히 써 보세요.`;

    return {
      qid: `q${index + 1}`,
      rubricItemId: item.id,
      code: item.code,
      element: item.element,
      method: item.method,
      type,
      prompt,
      levels: item.levels,
    };
  });
}
