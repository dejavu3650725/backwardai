/**
 * 교육과정 성취기준 데이터 액세스 레이어
 * ------------------------------------------------------------------
 * 원본: 2022 개정 교육과정 초등 핵심 성취기준 통합 JSON (611건)
 * 스키마: { grade, subject, area, core_idea, code, description }
 *
 * 종속 드롭다운(학년군 → 과목 → 핵심 아이디어)과
 * AI 추천의 후보군 프리필터링에 필요한 헬퍼를 제공합니다.
 */
import rawStandards from '../data/standards.json';

/** 전체 성취기준 (읽기 전용) */
export const STANDARDS = rawStandards;

/** 학년군 정렬 순서 고정 */
const GRADE_ORDER = ['1~2학년', '3~4학년', '5~6학년'];

/** 학년군 목록 */
export function getGrades() {
  const set = new Set(STANDARDS.map((s) => s.grade));
  return GRADE_ORDER.filter((g) => set.has(g));
}

/** 특정 학년군의 과목 목록 (가나다순) */
export function getSubjects(grade) {
  if (!grade) return [];
  const set = new Set(STANDARDS.filter((s) => s.grade === grade).map((s) => s.subject));
  return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
}

/**
 * 특정 학년군+과목의 핵심 아이디어 목록
 * 핵심 아이디어 원문이 매우 길기 때문에 { id, label, full, area } 형태로 가공합니다.
 */
export function getCoreIdeas(grade, subject) {
  if (!grade || !subject) return [];
  const seen = new Map();
  STANDARDS.filter((s) => s.grade === grade && s.subject === subject).forEach((s) => {
    if (!seen.has(s.core_idea)) {
      seen.set(s.core_idea, {
        id: `${s.grade}|${s.subject}|${s.area}`,
        area: s.area,
        full: s.core_idea,
        label: truncate(s.core_idea, 60),
      });
    }
  });
  return [...seen.values()];
}

/** 학년군 + 과목 + 핵심 아이디어(원문)로 성취기준 필터링 */
export function filterStandards({ grade, subject, coreIdea }) {
  return STANDARDS.filter(
    (s) =>
      (!grade || s.grade === grade) &&
      (!subject || s.subject === subject) &&
      (!coreIdea || s.core_idea === coreIdea)
  );
}

/** 성취기준 코드로 단건 조회 */
export function findByCode(code) {
  return STANDARDS.find((s) => s.code === code) || null;
}

/* ------------------------------------------------------------------
 * 로컬 키워드 검색 (AI 백엔드 프리필터 & 오프라인 폴백)
 * ------------------------------------------------------------------
 * 주제어를 토큰화한 뒤, 교육 현장에서 자주 등장하는 소재를
 * 교과 개념어로 확장(SEED_TOPIC_MAP)하여 점수 기반으로 매칭합니다.
 * AI 서버리스 함수에 전체 611건을 보내는 대신, 여기서 추린
 * 상위 후보만 전달하여 토큰 비용과 응답 지연을 최소화합니다.
 */
const SEED_TOPIC_MAP = {
  강낭콩: ['식물', '한살이', '생명', '자람', '관찰', '기르기'],
  식물: ['식물', '생명', '한살이', '관찰', '환경'],
  동물: ['동물', '생명', '한살이', '관찰', '생태'],
  텃밭: ['식물', '기르기', '생명', '노작', '관찰'],
  날씨: ['날씨', '기온', '계절', '측정', '자료'],
  환경: ['환경', '지속가능', '생태', '보호', '자원'],
  쓰레기: ['환경', '자원', '분리', '지속가능', '실천'],
  재활용: ['자원', '환경', '지속가능', '실천'],
  요리: ['음식', '영양', '식생활', '안전', '측정'],
  시장: ['경제', '생산', '소비', '자원', '교환'],
  용돈: ['경제', '소비', '합리', '계획'],
  지도: ['지도', '위치', '고장', '지역', '공간'],
  마을: ['고장', '지역', '공동체', '장소', '생활'],
  우주: ['지구', '달', '태양', '행성', '우주'],
  로봇: ['기술', '디지털', '문제해결', '소프트웨어', '인공지능'],
  코딩: ['디지털', '소프트웨어', '절차', '문제해결', '인공지능'],
  그림자: ['빛', '그림자', '관찰', '물체'],
  물놀이: ['물', '안전', '놀이', '운동'],
  운동회: ['운동', '경쟁', '협동', '규칙', '신체'],
  악기: ['음악', '연주', '소리', '표현'],
  노래: ['음악', '노래', '표현', '느낌'],
  그림: ['미술', '표현', '감상', '조형'],
  독서: ['글', '읽기', '책', '문학', '생각'],
  일기: ['쓰기', '글', '경험', '표현'],
  토론: ['토의', '토론', '의견', '주장', '근거'],
  뉴스: ['매체', '정보', '사실', '의견', '비판'],
  유튜브: ['매체', '디지털', '정보', '윤리'],
  선거: ['민주', '시민', '정치', '참여', '의사결정'],
  역사: ['역사', '유산', '시대', '인물'],
  통계: ['자료', '그래프', '표', '가능성', '수집'],
  도형: ['도형', '모양', '측정', '공간'],
  분수: ['분수', '나눗셈', '수', '연산'],
};

/** 간단 토크나이저: 공백/문장부호 기준 분리 + 조사 제거 근사 */
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[\s,.!?~·()\[\]{}'"“”‘’]+/)
    .map((t) => t.replace(/(을|를|이|가|은|는|의|로|으로|에서|에게|하고|하기|해요|했다)$/u, ''))
    .filter((t) => t.length >= 2);
}

/** 주제어 → 확장 키워드 집합 */
export function expandTopicKeywords(topic) {
  const tokens = tokenize(topic);
  const expanded = new Set(tokens);
  tokens.forEach((t) => {
    Object.entries(SEED_TOPIC_MAP).forEach(([seed, words]) => {
      if (t.includes(seed) || seed.includes(t)) {
        words.forEach((w) => expanded.add(w));
      }
    });
  });
  return [...expanded];
}

/**
 * 로컬 점수 기반 검색 (주제어 → 자동 키워드 확장)
 * @returns 점수 내림차순 상위 limit건 [{ ...standard, _score }]
 */
export function localKeywordSearch(topic, opts = {}) {
  return scoreByKeywords(expandTopicKeywords(topic), opts);
}

/**
 * 키워드 목록으로 직접 점수 검색
 * AI 키워드 확장(/api/expand-keywords) 결과를 그대로 넣을 수 있습니다.
 */
export function scoreByKeywords(keywords, { grade = null, limit = 40 } = {}) {
  if (!Array.isArray(keywords) || keywords.length === 0) return [];

  const scored = [];
  for (const s of STANDARDS) {
    if (grade && s.grade !== grade) continue;
    let score = 0;
    const desc = s.description;
    const idea = s.core_idea;
    for (const kw of keywords) {
      if (desc.includes(kw)) score += 5;
      if (s.area.includes(kw)) score += 3;
      if (idea.includes(kw)) score += 1;
      if (s.subject.includes(kw)) score += 2;
    }
    if (score > 0) scored.push({ ...s, _score: score });
  }
  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, limit);
}

/**
 * 과목별 균형 샘플 추출
 * ------------------------------------------------------------------
 * 키워드 매칭이 빈약한 주제(예: '월드컵', '크리스마스')일 때
 * AI에게 넘길 후보 풀을 보강하기 위해, 과목마다 고르게 성취기준을
 * 뽑아 반환합니다. 같은 과목 안에서는 영역(area) 다양성이 살도록
 * 등간격(stride)으로 샘플링합니다.
 */
export function getBalancedSample(grade = null, perSubject = 4) {
  const pool = grade ? STANDARDS.filter((s) => s.grade === grade) : STANDARDS;
  const bySubject = new Map();
  for (const s of pool) {
    if (!bySubject.has(s.subject)) bySubject.set(s.subject, []);
    bySubject.get(s.subject).push(s);
  }
  const sample = [];
  for (const list of bySubject.values()) {
    const stride = Math.max(1, Math.floor(list.length / perSubject));
    for (let i = 0; i < list.length && sample.length < 1000; i += stride) {
      sample.push(list[i]);
      if ((i / stride + 1) >= perSubject) break;
    }
  }
  return sample;
}

/** 유틸: 문자열 말줄임 */
export function truncate(text, max) {
  const t = String(text || '');
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 과목별 뱃지 색상 (Tailwind 클래스) */
export const SUBJECT_COLORS = {
  국어: 'bg-rose-50 text-rose-600 ring-rose-200',
  수학: 'bg-blue-50 text-blue-600 ring-blue-200',
  사회: 'bg-amber-50 text-amber-700 ring-amber-200',
  과학: 'bg-violet-50 text-violet-600 ring-violet-200',
  영어: 'bg-sky-50 text-sky-600 ring-sky-200',
  도덕: 'bg-teal-50 text-teal-600 ring-teal-200',
  체육: 'bg-orange-50 text-orange-600 ring-orange-200',
  음악: 'bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-200',
  미술: 'bg-pink-50 text-pink-600 ring-pink-200',
  실과: 'bg-lime-50 text-lime-700 ring-lime-200',
  '바른 생활': 'bg-emerald-50 text-emerald-600 ring-emerald-200',
  '슬기로운 생활': 'bg-cyan-50 text-cyan-600 ring-cyan-200',
  '즐거운 생활': 'bg-yellow-50 text-yellow-700 ring-yellow-200',
};

export function subjectColor(subject) {
  return SUBJECT_COLORS[subject] || 'bg-slate-50 text-slate-600 ring-slate-200';
}
