import dayjs from 'dayjs';
import type { Todo } from '../types/todo';
import { v4 as uuidv4 } from 'uuid';

/**
 * 특정 날짜가 주말 또는 휴일인지 확인합니다.
 */
export function isOffDay(date: string, holidays: string[]): boolean {
  const d = dayjs(date);
  const day = d.day(); // 0=일, 6=토
  if (day === 0 || day === 6) return true;
  return holidays.includes(d.format('YYYY-MM-DD'));
}

/**
 * 주말/휴일을 건너뛰어 다음 근무일을 찾습니다.
 * maxSkip: 무한루프 방지 (최대 30일까지 탐색)
 */
export function skipToWorkday(date: dayjs.Dayjs, holidays: string[], maxSkip = 30): dayjs.Dayjs {
  let current = date;
  let skipped = 0;
  while (skipped < maxSkip) {
    const day = current.day();
    const dateStr = current.format('YYYY-MM-DD');
    if (day !== 0 && day !== 6 && !holidays.includes(dateStr)) {
      return current;
    }
    current = current.add(1, 'day');
    skipped++;
  }
  return current; // fallback
}

/**
 * 주말/휴일을 역으로 건너뛰어 이전 근무일을 찾습니다.
 * maxSkip: 무한루프 방지 (최대 30일까지 탐색)
 */
export function skipToPrevWorkday(date: dayjs.Dayjs, holidays: string[], maxSkip = 30): dayjs.Dayjs {
  let current = date;
  let skipped = 0;
  while (skipped < maxSkip) {
    const day = current.day();
    const dateStr = current.format('YYYY-MM-DD');
    if (day !== 0 && day !== 6 && !holidays.includes(dateStr)) {
      return current;
    }
    current = current.subtract(1, 'day');
    skipped++;
  }
  return current; // fallback
}

/**
 * 반복 일정에 따라 향후 5년치의 모든 미래 Todo 인스턴스를 생성해 줍니다.
 * 주말과 휴일은 건너뜁니다.
 */
export function generateRecurringInstances(
  baseTodo: Omit<Todo, 'id' | 'completed' | 'completedAt' | 'createdAt'>,
  groupId: string,
  holidays: string[]
): Todo[] {
  const instances: Todo[] = [];
  const start = dayjs(baseTodo.dueDate);
  const end = start.add(5, 'year'); // 향후 5년 동안 생성
  
  let current = start;
  let safetyCounter = 0;

  while ((current.isBefore(end) || current.isSame(end, 'day')) && safetyCounter < 5000) {
    safetyCounter++;
    
    let targetDate = current;
    const day = targetDate.day();
    const dateStr = targetDate.format('YYYY-MM-DD');
    
    // 주말/휴일이면 가장 가까운 미래/과거 근무일로 건너뜁니다 ('keep'이면 그대로 유지)
    if ((day === 0 || day === 6 || holidays.includes(dateStr)) && baseTodo.holidayBehavior !== 'keep') {
      if (baseTodo.holidayBehavior === 'prev') {
        targetDate = skipToPrevWorkday(targetDate, holidays);
      } else {
        targetDate = skipToWorkday(targetDate, holidays);
      }
    }
    
    const formattedDate = targetDate.format('YYYY-MM-DD');
    
    // 중복 날짜 방지 및 범위 체크
    const isAlreadyAdded = instances.some(inst => inst.dueDate === formattedDate);
    if (!isAlreadyAdded && (targetDate.isBefore(end) || targetDate.isSame(end, 'day'))) {
      instances.push({
        ...baseTodo,
        id: uuidv4(),
        dueDate: formattedDate,
        recurringGroupId: groupId,
        completed: false,
        createdAt: dayjs().toISOString(),
      } as Todo);
    }

    // 다음 주기 계산
    switch (baseTodo.recurringType) {
      case 'daily':
        current = current.add(1, 'day');
        break;
      case 'weekly':
        current = current.add(1, 'week');
        break;
      case 'monthly':
        current = current.add(1, 'month');
        break;
      case 'custom':
        current = current.add(baseTodo.recurringDays || 1, 'day');
        break;
      default:
        current = current.add(1, 'day');
        break;
    }
  }

  return instances;
}

/**
 * 반복 과제의 다음 마감일을 계산합니다. (하위 호환용 유지)
 */
export function getNextDueDate(todo: Todo, holidays: string[] = []): string {
  const current = dayjs(todo.dueDate);
  let next: dayjs.Dayjs;

  switch (todo.recurringType) {
    case 'daily':
      next = current.add(1, 'day');
      break;
    case 'weekly':
      next = current.add(1, 'week');
      break;
    case 'monthly':
      next = current.add(1, 'month');
      break;
    case 'custom':
      next = current.add(todo.recurringDays || 1, 'day');
      break;
    default:
      next = current.add(1, 'day');
      break;
  }

  return skipToWorkday(next, holidays).format('YYYY-MM-DD');
}

/**
 * 반복 과제 완료 시 다음 인스턴스를 생성합니다. (하위 호환용 유지)
 */
export function createNextRecurringTodo(todo: Todo, newId: string, holidays: string[] = []): Todo {
  return {
    ...todo,
    id: newId,
    dueDate: getNextDueDate(todo, holidays),
    completed: false,
    completedAt: undefined,
    createdAt: dayjs().toISOString(),
  };
}

/**
 * 특정 날짜에 반복 과제가 도래하는지 확인합니다.
 */
export function isRecurringOnDate(todo: Todo, date: string): boolean {
  if (!todo.isRecurring || !todo.recurringType) return false;

  const targetDate = dayjs(date).startOf('day');
  const startDate = dayjs(todo.dueDate).startOf('day');

  if (targetDate.isBefore(startDate)) return false;

  const diffDays = targetDate.diff(startDate, 'day');

  switch (todo.recurringType) {
    case 'daily':
      return true;
    case 'weekly':
      return diffDays % 7 === 0;
    case 'monthly': {
      return targetDate.date() === startDate.date();
    }
    case 'custom':
      return diffDays % (todo.recurringDays || 1) === 0;
    default:
      return false;
  }
}

/**
 * 특정 날짜에 해당하는 모든 Todo를 가져옵니다.
 */
export function getTodosForDate(todos: Todo[], date: string): Todo[] {
  const target = dayjs(date).format('YYYY-MM-DD');

  return todos.filter(todo => {
    const todoDue = dayjs(todo.dueDate).format('YYYY-MM-DD');
    return todoDue === target;
  });
}
