import dayjs from 'dayjs';
import type { Todo, TodoWithPriority, Quadrant } from '../types/todo';
import { QUADRANT_INFO } from '../types/todo';

/**
 * 마감일까지 남은 일수를 기반으로 시급성 점수를 계산합니다.
 * 점수: 1(여유) ~ 10(기한초과)
 */
export function calculateUrgency(dueDate: string): number {
  const today = dayjs().startOf('day');
  const due = dayjs(dueDate).startOf('day');
  const daysLeft = due.diff(today, 'day');

  if (daysLeft <= 0) return 10;  // 기한 초과 또는 오늘
  if (daysLeft === 1) return 9;
  if (daysLeft === 2) return 8;
  if (daysLeft === 3) return 7;
  if (daysLeft <= 5) return 5;
  if (daysLeft <= 7) return 4;
  if (daysLeft <= 14) return 3;
  return 1;
}

/**
 * 시급성과 난이도를 기반으로 4분면을 결정합니다.
 * 시급성 ≥ 7: 높음, 난이도 > 5: 높음
 */
export function getQuadrant(urgency: number, difficulty: number): Quadrant {
  const isUrgent = urgency >= 7;
  const isDifficult = difficulty > 5;

  if (isUrgent && !isDifficult) return 'quick-win';   // Ⅲ 시급↑ 난이도↓
  if (isUrgent && isDifficult) return 'obstacle';      // Ⅳ 시급↑ 난이도↑
  if (!isUrgent && !isDifficult) return 'relaxed';     // Ⅰ 시급↓ 난이도↓
  return 'long-term';                                   // Ⅱ 시급↓ 난이도↑
}

/**
 * Todo에 우선순위 정보를 부착합니다.
 */
export function attachPriority(todo: Todo): TodoWithPriority {
  const urgency = calculateUrgency(todo.dueDate);
  const quadrant = getQuadrant(urgency, todo.difficulty);
  const priorityRank = QUADRANT_INFO[quadrant].rank;

  return {
    ...todo,
    urgency,
    quadrant,
    priorityRank,
  };
}

/**
 * Todo 배열을 우선순위 순으로 정렬합니다.
 * 1차: 분면 순위 (1→4)
 * 2차: 시급성 높은 순
 * 3차: 난이도 낮은 순
 */
export function sortByPriority(todos: TodoWithPriority[]): TodoWithPriority[] {
  return [...todos].sort((a, b) => {
    // 완료된 항목은 하단으로
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    // 1차: 분면 순위
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    // 2차: 시급성 높은 순
    if (a.urgency !== b.urgency) return b.urgency - a.urgency;
    // 3차: 난이도 낮은 순
    return a.difficulty - b.difficulty;
  });
}

/**
 * 전체 Todo를 우선순위 정보와 함께 정렬된 배열로 반환합니다.
 */
export function getTodosWithPriority(todos: Todo[]): TodoWithPriority[] {
  const withPriority = todos.map(attachPriority);
  return sortByPriority(withPriority);
}
