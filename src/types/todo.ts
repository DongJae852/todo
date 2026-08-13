export interface Holiday {
  date: string;   // YYYY-MM-DD
  reason?: string; // 휴일 사유 (선택)
}

// 코스 업무의 구조(제목/난이도/체크리스트) 부분 오버라이드
export interface CourseTaskOverride {
  title?: string;
  difficulty?: number;
  checklist?: ChecklistItem[];
}

// "향후 모든 일정 수정"으로 생긴 효력 발생일(inclusive) 기준 버전
export interface CourseTaskVersion extends CourseTaskOverride {
  from: string; // YYYY-MM-DD (이 날짜부터 적용)
}

export interface CourseTask {
  id: string;
  title: string;
  course: 'A' | 'B' | 'C' | 'D' | 'E';
  difficulty: number;
  checklist?: ChecklistItem[]; // 코스 업무 세부 체크리스트 (템플릿 구조, 완료상태는 일자별로 관리)
  versions?: CourseTaskVersion[];              // "향후" 수정 버전 (from 오름차순)
  dateOverrides?: Record<string, CourseTaskOverride>; // "이 날짜만" 수정 (key = YYYY-MM-DD)
}

// 코스 업무의 일자별 개별 상태 (메모 + 체크리스트 완료 상태). key = `${YYYY-MM-DD}_${courseTaskId}`
export interface CourseDayState {
  dailyNote?: string;
  checklist?: Record<string, boolean>; // checklistItemId -> completed
}

export type RecurringType = 'daily' | 'weekly' | 'monthly' | 'custom';


export type Quadrant = 'quick-win' | 'obstacle' | 'relaxed' | 'long-term';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Todo {
  id: string;
  title: string;
  description?: string;
  dueDate: string;        // ISO date string (YYYY-MM-DD)
  startDate?: string;     // 프로젝트 시작일 (YYYY-MM-DD)
  endDate?: string;       // 프로젝트 종료일 (YYYY-MM-DD)
  isPeriod?: boolean;     // 기간 설정 과제 여부
  difficulty: number;     // 1~10
  isRecurring: boolean;
  recurringType?: RecurringType;
  recurringDays?: number; // custom 일 때 n일 단위
  recurringGroupId?: string; // 반복 그룹 ID
  holidayBehavior?: 'next' | 'prev' | 'keep'; // 주말/휴일 동작 (다음 근무일 연기 / 직전 근무일 당김 / 그대로 유지)
  completed: boolean;
  completedAt?: string;
  createdAt: string;
  sortOrder?: number;      // 드래그 앤 드롭 정렬 순서
  checklist?: ChecklistItem[]; // 세부 체크리스트
  dailyNote?: string;          // 개별 일자별 메모
  isCourseTask?: boolean;      // 코스 할 일 여부
  courseTaskId?: string;       // 코스 할 일 원본 ID
  course?: 'A' | 'B' | 'C' | 'D' | 'E'; // 코스 알파벳
}

export interface TodoWithPriority extends Todo {
  urgency: number;
  quadrant: Quadrant;
  priorityRank: number; // 1=highest, 4=lowest
}

// ── 반복 일정 가상화 ────────────────────────────────────────────────
// 반복 일정을 인스턴스마다 저장하지 않고 "그룹 규칙 1개 + 개별 상태(override)"로 저장한다.
// 날짜별 인스턴스는 브라우저에서 규칙으로부터 생성(materialize)한다.

// 규칙으로 생성되는 기본 인스턴스와 달라진 개별 날짜 상태만 저장 (sparse)
export interface RecurringOverride {
  completed?: boolean;
  completedAt?: string;
  dailyNote?: string;
  checklist?: ChecklistItem[];
  // 향후수정 등으로 규칙과 갈라진 개별 필드 (보통 비어있음)
  title?: string;
  description?: string;
  difficulty?: number;
}

export interface RecurringGroupDoc {
  groupId: string;
  // 규칙(공통 베이스)
  title: string;
  description?: string;
  difficulty: number;
  recurringType?: RecurringType;
  recurringDays?: number;
  holidayBehavior?: 'next' | 'prev' | 'keep';
  checklist?: ChecklistItem[]; // 체크리스트 구조 (완료상태 제외)
  anchorDate: string;          // 생성 시작 기준일 (가장 이른 dueDate)
  createdAt: string;
  // 개별 상태 (sparse)
  overrides?: Record<string, RecurringOverride>; // key = 자연 발생 날짜(YYYY-MM-DD)
  exceptionDates?: string[];   // 단일 삭제/이동으로 제거된 자연 날짜
  extraInstances?: Todo[];     // 자연 날짜가 아닌 위치의 인스턴스(연기 등)
}

// 전역 변경 이력 (언제/무엇을 어떻게 바꿨는지) — 사이드 드로어에서 조회
export interface ChangeLogEntry {
  id: string;
  at: string;                       // 변경 시각 (ISO)
  kind: 'recurring-reschedule';     // 향후 확장 가능
  title: string;                    // 대상 일정 제목
  summary: string;                  // 사람이 읽는 요약 (예: "매주 월요일 → 매주 목요일")
  effectiveFrom: string;            // 적용 기준일 (YYYY-MM-DD)
  detail?: string;                  // 부가 설명
}

export interface QuadrantInfo {
  key: Quadrant;
  label: string;
  description: string;
  color: string;
  rank: number;
  icon: string;
}

export const QUADRANT_INFO: Record<Quadrant, QuadrantInfo> = {
  'quick-win': {
    key: 'quick-win',
    label: 'Ⅲ Quick Win!',
    description: '최우선 실행',
    color: '#ff4d4f',
    rank: 1,
    icon: '🔥',
  },
  'obstacle': {
    key: 'obstacle',
    label: 'Ⅳ 장애 해결',
    description: '장애 해결 후 추진',
    color: '#fa8c16',
    rank: 2,
    icon: '⚡',
  },
  'relaxed': {
    key: 'relaxed',
    label: 'Ⅰ 여유 추진',
    description: '여유있게 추진',
    color: '#52c41a',
    rank: 3,
    icon: '🌿',
  },
  'long-term': {
    key: 'long-term',
    label: 'Ⅱ 중장기',
    description: '중장기 과제',
    color: '#1890ff',
    rank: 4,
    icon: '🎯',
  },
};

export const DIFFICULTY_PRESETS = [
  { label: '쉬움', value: 2, color: '#52c41a' },
  { label: '보통', value: 5, color: '#faad14' },
  { label: '어려움', value: 8, color: '#ff4d4f' },
] as const;
