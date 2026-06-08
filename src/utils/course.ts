import dayjs from 'dayjs';
import type { Holiday } from '../types/todo';

export const BASE_DATE = '2025-05-08';
export const COURSES = ['A', 'B', 'C', 'D', 'E'] as const;
export type CourseType = typeof COURSES[number];

/**
 * 특정 날짜가 근무일인지 여부를 판별합니다.
 */
export function isWorkingDay(date: dayjs.Dayjs, holidaySet: Set<string>): boolean {
  const day = date.day(); // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return false;
  return !holidaySet.has(date.format('YYYY-MM-DD'));
}

// 글로벌 캐시 상태 (휴일 변경 감지용 서명 및 캐시 맵)
let lastHolidaysSig = '';
const courseCache = new Map<string, CourseType | null>();

/**
 * 특정 날짜의 코스를 반환합니다. (A, B, C, D, E 또는 null)
 * O(1) 캐싱을 통해 대량의 날짜 렌더링 성능을 획기적으로 개선합니다.
 */
export function getCourseForDate(dateStr: string, holidays: Holiday[]): CourseType | null {
  // 휴일 목록이 변경되었는지 서명(signature)을 통해 감지 및 캐시 초기화
  const holidaysSig = holidays.map(h => h.date).sort().join(',');
  if (holidaysSig !== lastHolidaysSig) {
    courseCache.clear();
    lastHolidaysSig = holidaysSig;
  }

  // 캐시 히트 시 즉시 반환
  if (courseCache.has(dateStr)) {
    return courseCache.get(dateStr)!;
  }

  const target = dayjs(dateStr);
  const base = dayjs(BASE_DATE);

  // 기준일 이전은 코스 계산 대상에서 제외
  if (target.isBefore(base, 'day')) {
    courseCache.set(dateStr, null);
    return null;
  }

  const holidaySet = new Set(holidays.map(h => h.date));
  
  // 주말이나 휴일이면 코스가 없음
  if (!isWorkingDay(target, holidaySet)) {
    courseCache.set(dateStr, null);
    return null;
  }

  // 기준일(2025-05-08)부터 타겟 날짜까지 순차적으로 근무일을 카운트
  let workingDaysCount = 0;
  let current = base;

  while (current.isBefore(target, 'day') || current.isSame(target, 'day')) {
    if (isWorkingDay(current, holidaySet)) {
      workingDaysCount++;
    }
    current = current.add(1, 'day');
  }

  const result = workingDaysCount === 0 ? null : COURSES[(workingDaysCount - 1) % 5];
  courseCache.set(dateStr, result);
  return result;
}

/**
 * 특정 날짜(보통 현재 월의 마지막 날짜 등)까지의 모든 날짜에 대해
 * 코스 계산 맵을 O(N)으로 한 번에 생성하여, 개별 일자 조회 시 O(1)이 되도록 최적화합니다.
 */
export function getCourseMapForRange(endDateStr: string, holidays: Holiday[]): Record<string, CourseType> {
  const base = dayjs(BASE_DATE);
  const end = dayjs(endDateStr);
  const map: Record<string, CourseType> = {};

  if (end.isBefore(base, 'day')) {
    return map;
  }

  const holidaySet = new Set(holidays.map(h => h.date));
  let workingDaysCount = 0;
  let current = base;

  while (current.isBefore(end, 'day') || current.isSame(end, 'day')) {
    const curStr = current.format('YYYY-MM-DD');
    if (isWorkingDay(current, holidaySet)) {
      workingDaysCount++;
      map[curStr] = COURSES[(workingDaysCount - 1) % 5];
    }
    current = current.add(1, 'day');
  }

  return map;
}
