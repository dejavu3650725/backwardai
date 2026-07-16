# 백워드 AI (Backward AI)

2022 개정 교육과정 초등 성취기준(611건) 기반 **과정 중심 평가 설계 도우미** 웹앱.

`1. 핵심 아이디어 & 성취기준 → 2. 평가 루브릭 → 3. 수업 과정안 설계 → 4. 평가 및 피드백 → 5. 학교생활기록부`
백워드 설계(Backward Design) 흐름을 그대로 따라가는 5단계 워크플로를 제공합니다.

## 기술 스택

| 영역 | 기술 |
|---|---|
| Frontend | React 18 (Vite 5), Tailwind CSS 3, Lucide React |
| Backend / DB | Firebase (Auth, Firestore) |
| AI / 보안 | Vercel Serverless Functions (`/api`) — Gemini 또는 Claude |

## 폴더 구조

```
backward-ai/
├── api/                          # Vercel Serverless Functions (서버 전용 — AI 키 보관처)
│   ├── _lib/providers.js         #   공통: Gemini/Claude 호출·JSON 파싱·입력 검증 (라우트 아님)
│   ├── recommend-standards.js    #   POST: 주제 → 융합 성취기준 추천
│   ├── generate-rubric.js        #   POST: 성취기준 → 평가 루브릭 (요소·방법·상중하·피드백)
│   └── generate-lesson.js        #   POST: 성취기준+루브릭 → 백워드 수업 과정안
├── public/
│   └── favicon.svg
├── src/
│   ├── main.jsx                  # 엔트리
│   ├── App.jsx                   # Stepper + 단계 전환 상태 관리
│   ├── index.css                 # Tailwind + 공통 컴포넌트 클래스
│   ├── firebase.js               # Firebase 초기화 (env 기반, 미설정 시 게스트 모드)
│   ├── data/
│   │   └── standards.json        # 초등 핵심 성취기준 통합 데이터 (611건)
│   ├── lib/
│   │   ├── standardsData.js      # 데이터 액세스 + 로컬 키워드 검색(프리필터/폴백)
│   │   └── aiClient.js           # /api 호출 브리지 (키 없음!)
│   └── components/
│       ├── Stepper.jsx           # 상단 가로형 진행 표시기
│       ├── StandardsSelector.jsx # Step 1: AI 추천 + 종속 드롭다운
│       ├── AiRecommendCard.jsx   # 그라데이션 테두리 AI 결과 카드
│       ├── SelectionBasket.jsx   # 선택된 성취기준 바구니
│       ├── EditableCell.jsx      # 클릭 즉시 수정되는 인라인 에디팅 셀 (공용)
│       └── steps/
│           ├── RubricGenerator.jsx     # Step 2: AI 루브릭 생성 + 인라인 수정 표
│           ├── LessonPlanGenerator.jsx # Step 3: 백워드 수업 과정안 + A4 인쇄
│           ├── AssessmentFeedback.jsx  # Step 4 (다음 Phase 예정)
│           └── RecordLinker.jsx        # Step 5 (다음 Phase 예정)
├── .env.example
├── vercel.json
├── vite.config.js / tailwind.config.js / postcss.config.js
└── package.json
```

## 🔐 보안 원칙 (중요)

- **Gemini/Claude API 키는 절대 클라이언트에 존재하지 않습니다.**
  - `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`는 Vercel 환경변수로만 등록하며 `VITE_` 접두사를 붙이지 않습니다. (`VITE_`가 붙으면 번들에 포함되어 노출됩니다)
  - 브라우저는 오직 `/api/recommend-standards`만 호출합니다.
- 서버리스 함수는 입력 검증(길이/형식), 후보 코드 화이트리스트 검증(환각 방지), 응답 길이 제한을 수행합니다.
- Firebase 웹 설정값(`VITE_FIREBASE_*`)은 공개 식별자이며, 데이터 보호는 Firestore Security Rules로 수행합니다.

## 실행 방법

```bash
npm install

# 프론트엔드만 (AI는 로컬 키워드 폴백으로 동작)
npm run dev

# 서버리스 함수까지 함께 (Vercel CLI 필요: npm i -g vercel)
vercel dev          # :3000 — vite dev 서버가 /api 를 이쪽으로 프록시
npm run dev         # :5173
```

## 배포 (Vercel)

1. GitHub 저장소 연결 → Framework Preset: **Vite**
2. Environment Variables 등록: `GEMINI_API_KEY` (또는 `ANTHROPIC_API_KEY`), `VITE_FIREBASE_*`
3. Deploy — `/api/*`는 자동으로 서버리스 함수로 라우팅됩니다.

## AI 추천 동작 방식

1. 클라이언트가 611건 중 주제 관련 상위 40건을 **로컬 키워드 프리필터**로 추립니다. (토큰 비용·지연 최소화)
2. 주제 + 후보 목록을 `/api/recommend-standards`에 POST합니다.
3. 서버리스 함수가 Gemini(우선) 또는 Claude로 융합 조합(3~6건) + 추천 사유를 생성합니다.
4. 서버가 후보에 없는 코드를 걸러낸 뒤 반환하고, 클라이언트는 원본 데이터와 병합해 표시합니다.
5. 백엔드 미연결/오류 시 로컬 점수 기반 폴백으로 UI가 끊기지 않습니다.
