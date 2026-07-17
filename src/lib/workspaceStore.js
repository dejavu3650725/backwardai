/**
 * workspaceStore.js — 구글 로그인 + 작업 내용 자동 저장/복원
 * ------------------------------------------------------------------
 * 데이터 구조:
 *   users/{uid}/workspace/current
 *     { selectedStandards, rubric, lessonPlan, currentStep, updatedAt }
 *
 * 로그인한 교사의 진행 중 작업이 자동 저장되고, 재로그인 시 복원됩니다.
 */
import { auth, db, googleProvider, isFirebaseConfigured } from '../firebase.js';
import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  addDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

/** 로그인 기능 사용 가능 여부 */
export function authReady() {
  return isFirebaseConfigured && Boolean(auth) && Boolean(db);
}

/** 로그인 상태 구독 → 해제 함수 반환 */
export function watchAuth(callback) {
  if (!authReady()) return () => {};
  return onAuthStateChanged(auth, callback);
}

/** 구글 팝업 로그인 */
export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signOutUser() {
  return firebaseSignOut(auth);
}

/** 저장된 작업 불러오기 (없으면 null) */
export async function loadWorkspace(uid) {
  const snap = await getDoc(doc(db, 'users', uid, 'workspace', 'current'));
  return snap.exists() ? snap.data() : null;
}

/** 작업 저장 — undefined 필드를 제거해 Firestore 오류 방지 */
export async function saveWorkspace(uid, data) {
  const clean = JSON.parse(JSON.stringify(data ?? {}));
  await setDoc(
    doc(db, 'users', uid, 'workspace', 'current'),
    { ...clean, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/* ==================================================================
 * 다중 수업(프로젝트) 관리 — users/{uid}/projects/{projectId}
 *   { title, selectedStandards, rubric, lessonPlan, currentStep,
 *     createdAt, updatedAt }
 * ================================================================== */

/** 내 수업 목록 (최근 수정순) */
export async function listProjects(uid) {
  const qs = await getDocs(
    query(collection(db, 'users', uid, 'projects'), orderBy('updatedAt', 'desc'))
  );
  return qs.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** 새 수업 만들기 → 프로젝트 id 반환 */
export async function createProject(uid, data = {}) {
  const clean = JSON.parse(JSON.stringify(data ?? {}));
  const ref = await addDoc(collection(db, 'users', uid, 'projects'), {
    title: '새 수업',
    selectedStandards: [],
    rubric: null,
    lessonPlan: null,
    currentStep: 0,
    ...clean,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function loadProject(uid, projectId) {
  const snap = await getDoc(doc(db, 'users', uid, 'projects', projectId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveProject(uid, projectId, data) {
  const clean = JSON.parse(JSON.stringify(data ?? {}));
  await setDoc(
    doc(db, 'users', uid, 'projects', projectId),
    { ...clean, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function deleteProjectDoc(uid, projectId) {
  await deleteDoc(doc(db, 'users', uid, 'projects', projectId));
}

/** 마지막으로 열었던 수업 기억 (브라우저별) */
export function rememberLastProject(uid, projectId) {
  try {
    localStorage.setItem(`bw_last_project_${uid}`, projectId);
  } catch {
    /* 무시 */
  }
}
export function recallLastProject(uid) {
  try {
    return localStorage.getItem(`bw_last_project_${uid}`);
  } catch {
    return null;
  }
}

/** 로그인 안내 알림창 표시 여부 (닫으면 다시 안 띄움) */
export function welcomeDismissed() {
  try {
    return localStorage.getItem('bw_welcome_dismissed') === '1';
  } catch {
    return false;
  }
}
export function dismissWelcome() {
  try {
    localStorage.setItem('bw_welcome_dismissed', '1');
  } catch {
    /* 무시 */
  }
}

/** 로그인 오류를 교사 친화적 메시지로 변환 */
export function friendlyAuthError(err) {
  const code = err?.code || '';
  if (code === 'auth/unauthorized-domain') {
    return 'Firebase 승인 도메인에 이 사이트 주소가 등록되지 않았습니다. (Authentication → 설정 → 승인된 도메인에 backwardai.vercel.app 추가)';
  }
  if (code === 'auth/popup-closed-by-user') return '로그인 창이 닫혔어요. 다시 시도해 주세요.';
  if (code === 'auth/popup-blocked') return '팝업이 차단됐어요. 브라우저의 팝업 허용 후 다시 시도해 주세요.';
  return `로그인에 실패했어요. (${code || err?.message || '알 수 없는 오류'})`;
}
