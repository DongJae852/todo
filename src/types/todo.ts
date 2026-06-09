export interface Holiday {
  date: string;   // YYYY-MM-DD
  reason?: string; // 휴일 사유 (선택)
}

export interface CourseTask {
  id: string;
  title: string;
  course: 'A' | 'B' | 'C' | 'D' | 'E';
  difficulty: number;
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
  holidayBehavior?: 'next' | 'prev'; // 주말/휴일 동작 설정 (다음 근무일로 연기 / 직전 근무일로 당김)
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
  holidayBehavior?: 'next' | 'prev';
  checklist?: ChecklistItem[]; // 체크리스트 구조 (완료상태 제외)
  anchorDate: string;          // 생성 시작 기준일 (가장 이른 dueDate)
  createdAt: string;
  // 개별 상태 (sparse)
  overrides?: Record<string, RecurringOverride>; // key = 자연 발생 날짜(YYYY-MM-DD)
  exceptionDates?: string[];   // 단일 삭제/이동으로 제거된 자연 날짜
  extraInstances?: Todo[];     // 자연 날짜가 아닌 위치의 인스턴스(연기 등)
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
