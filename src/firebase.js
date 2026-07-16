/**
 * Firebase 초기화 모듈
 * ------------------------------------------------------------------
 * - Auth(교사 로그인)와 Firestore(루브릭/평가 기록 저장)에 사용됩니다.
 * - 모든 설정값은 .env 파일의 VITE_ 접두사 환경변수에서 읽어옵니다.
 *   (Firebase 웹 API 키는 '식별자'로서 클라이언트 노출이 허용되는 값이며,
 *    실제 데이터 보호는 Firestore Security Rules로 수행합니다.)
 * - Gemini/Claude 등 AI API 키는 절대 이 파일이나 클라이언트 코드에
 *   두지 않습니다. AI 호출은 전부 /api (Vercel Serverless)로 위임합니다.
 */
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** 환경변수가 모두 채워졌는지 여부 (미설정 시 앱은 '게스트 모드'로 동작) */
export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

let app = null;
let auth = null;
let db = null;

if (isFirebaseConfigured) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export const googleProvider = new GoogleAuthProvider();
export { app, auth, db };
