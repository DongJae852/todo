import { useReducer, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import type { Todo, RecurringType } from '../types/todo';
import { loadTodos, saveTodos } from '../utils/storage';
import { generateRecurringInstances, skipToWorkday, skipToPrevWorkday } from '../utils/recurring';

type Action =
  | { type: 'SET_TODOS'; payload: Todo[] }
  | { type: 'ADD_TODO'; payload: Todo | Todo[] }
  | { type: 'UPDATE_TODO'; payload: { todo: Todo; mode?: 'single' | 'future' | 'all'; selectedDate?: string } }
  | { 
      type: 'DELETE_TODO'; 
      payload: { 
        id: string; 
        mode?: 'single' | 'future' | 'all'; 
        selectedDate?: string; 
      } 
    }
  | { type: 'TOGGLE_COMPLETE'; payload: { id: string } }
  | { type: 'REORDER_TODOS'; payload: { orderedIds: string[] } }
  | { type: 'RESCHEDULE_TODOS'; payload: { holidays: string[] } }
  | { type: 'POSTPONE_TODO'; payload: { id: string; holidays: string[] } }
  | { type: 'PREV_POSTPONE_TODO'; payload: { id: string; holidays: string[] } }
  | { type: 'MOVE_TODO_TO_DATE'; payload: { id: string; targetDate: string } }
  | {
      type: 'RESCHEDULE_RECURRING';
      payload: {
        groupId: string;
        fromDate: string;         // 이 날짜부터 새 규칙 적용 (inclusive)
        newAnchor: string;        // 새 규칙의 첫 발생일
        newRecurringType: RecurringType;
        newRecurringDays?: number;
        holidays: string[];
      };
    };

function todoReducer(state: Todo[], action: Action): Todo[] {
  switch (action.type) {
    case 'SET_TODOS':
      return action.payload;
    case 'ADD_TODO':
      return Array.isArray(action.payload)
        ? [...state, ...action.payload]
        : [...state, action.payload];
    case 'UPDATE_TODO': {
      const { todo: updated, mode, selectedDate } = action.payload;
      
      // 1. 단일 일정이거나 반복 일정그룹이 없는 경우, 혹은 mode가 'single'인 경우 단 하나만 업데이트
      if (!updated.isRecurring || !updated.recurringGroupId || mode === 'single') {
        return state.map(todo => todo.id === updated.id ? updated : todo);
      }

      // 2. 'future' 모드인 경우: 기준 날짜와 같거나 미래인 모든 인스턴스를 업데이트
      if (mode === 'future') {
        const referenceDate = selectedDate || updated.dueDate;
        return state.map(todo => {
          if (todo.recurringGroupId === updated.recurringGroupId) {
            const isFutureOrToday = dayjs(todo.dueDate).isSame(referenceDate, 'day') || 
                                    dayjs(todo.dueDate).isAfter(referenceDate, 'day');
            if (isFutureOrToday) {
              // 개별 일자 메모(dailyNote)와 완료 상태(completed, completedAt)는 보존하고 공통 속성만 업데이트!
              return {
                ...todo,
                title: updated.title,
                description: updated.description,
                difficulty: updated.difficulty,
                checklist: updated.checklist ? JSON.parse(JSON.stringify(updated.checklist)) : undefined,
                holidayBehavior: updated.holidayBehavior,
              };
            }
          }
          return todo.id === updated.id ? updated : todo;
        });
      }

      // 3. 'all' 모드인 경우: 같은 그룹 내 모든 인스턴스를 업데이트
      if (mode === 'all') {
        return state.map(todo => {
          if (todo.recurringGroupId === updated.recurringGroupId) {
            return {
              ...todo,
              title: updated.title,
              description: updated.description,
              difficulty: updated.difficulty,
              checklist: updated.checklist ? JSON.parse(JSON.stringify(updated.checklist)) : undefined,
              holidayBehavior: updated.holidayBehavior,
            };
          }
          return todo.id === updated.id ? updated : todo;
        });
      }

      return state.map(todo => todo.id === updated.id ? updated : todo);
    }
    case 'DELETE_TODO': {
      const { id, mode, selectedDate } = action.payload;
      const todoToDelete = state.find(t => t.id === id);
      
      if (!todoToDelete) return state;

      // 일반 할 일이거나 'single' 모드라면 단 하나만 삭제
      if (!todoToDelete.isRecurring || !todoToDelete.recurringGroupId || mode === 'single') {
        return state.filter(todo => todo.id !== id);
      }

      // 'future' 모드: 선택된 기준 날짜 및 그 미래 날짜에 해당하는 반복 일정 일괄 삭제 (과거 보존)
      if (mode === 'future') {
        const referenceDate = selectedDate || todoToDelete.dueDate;
        return state.filter(todo => {
          if (todo.recurringGroupId === todoToDelete.recurringGroupId) {
            const isFutureOrToday = dayjs(todo.dueDate).isSame(referenceDate, 'day') || 
                                    dayjs(todo.dueDate).isAfter(referenceDate, 'day');
            return !isFutureOrToday; // 오늘과 미래는 날리고 과거는 보존!
          }
          return true;
        });
      }

      // 'all' 모드: 전체 일정 삭제
      if (mode === 'all') {
        return state.filter(todo => todo.recurringGroupId !== todoToDelete.recurringGroupId);
      }

      return state.filter(todo => todo.id !== id);
    }
    case 'TOGGLE_COMPLETE': {
      const { id } = action.payload;
      const todo = state.find(t => t.id === id);
      if (!todo) return state;

      const updatedTodo: Todo = {
        ...todo,
        completed: !todo.completed,
        completedAt: !todo.completed ? dayjs().toISOString() : undefined,
      };

      return state.map(t => t.id === id ? updatedTodo : t);
    }
    case 'REORDER_TODOS': {
      const { orderedIds } = action.payload;
      const idToOrder = new Map<string, number>();
      orderedIds.forEach((id, index) => idToOrder.set(id, index));

      // 반복 일정(수천 개 인스턴스)은 그룹 단위 순서(recurringGroupOrder)로 따로 관리하므로
      // 여기서는 단일(비반복) 일정의 sortOrder만 갱신한다. (반복 인스턴스 전체 재기록 방지)
      return state.map(todo => {
        if (todo.isRecurring && todo.recurringGroupId) return todo;
        const order = idToOrder.get(todo.id);
        if (order !== undefined && todo.sortOrder !== order) {
          return { ...todo, sortOrder: order };
        }
        return todo;
      });
    }
    case 'RESCHEDULE_TODOS': {
      const { holidays } = action.payload;
      
      // 1. 완료된 할 일들은 그대로 유지
      const completedTodos = state.filter(t => t.completed);
      const uncompletedTodos = state.filter(t => !t.completed);
      
      // 2. 미완료 단일(일회성) 할 일 처리: 주말이나 휴일이면 다음 근무일로 순차 이동
      const rescheduledSingleTodos = uncompletedTodos
        .filter(t => !t.isRecurring)
        .map(todo => {
          const originalDueDate = todo.dueDate;
          const newDueDate = skipToWorkday(dayjs(originalDueDate), holidays).format('YYYY-MM-DD');
          if (originalDueDate !== newDueDate) {
            return { ...todo, dueDate: newDueDate };
          }
          return todo;
        });

      // 3. 미완료 반복 할 일 처리
      const uncompletedRecurringTodos = uncompletedTodos.filter(t => t.isRecurring);
      
      // 반복 그룹별로 그룹화
      const groupIds = Array.from(
        new Set(
          uncompletedRecurringTodos
            .map(t => t.recurringGroupId)
            .filter((id): id is string => !!id)
        )
      );
      
      const rescheduledRecurringTodos: Todo[] = [];
      
      for (const groupId of groupIds) {
        const groupTasks = uncompletedRecurringTodos.filter(t => t.recurringGroupId === groupId);
        if (groupTasks.length === 0) continue;
        
        // 가장 이른 미완료 날짜 찾기
        const sortedTasks = [...groupTasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        const earliestTask = sortedTasks[0];

        // ⚠️ 요일 드리프트 방지: 주별 반복은 "가장 이른 미완료 날짜"가 휴일로 밀려있으면
        // 그 밀린 요일이 새 기준으로 굳어버린다. 완료·미완료 전체 인스턴스의 최빈 요일(원래 요일)로
        // 앵커를 되돌려서, 휴일 시프트가 반복 요일 자체를 바꾸지 못하게 한다.
        let anchorTask = earliestTask;
        if (earliestTask.recurringType === 'weekly') {
          const allGroupInsts = [
            ...completedTodos.filter(t => t.recurringGroupId === groupId),
            ...groupTasks,
          ];
          const dowCount: Record<number, number> = {};
          for (const t of allGroupInsts) {
            const w = dayjs(t.dueDate).day();
            dowCount[w] = (dowCount[w] || 0) + 1;
          }
          const intendedDow = Number(
            Object.entries(dowCount).sort((a, b) => b[1] - a[1])[0][0]
          );
          // 앵커를 원래 요일로 최대 6일 당겨 정렬 (그 주가 휴일이면 generateRecurringInstances가 다시 시프트함)
          let anchor = dayjs(earliestTask.dueDate);
          for (let i = 0; i < 6 && anchor.day() !== intendedDow; i++) {
            anchor = anchor.subtract(1, 'day');
          }
          anchorTask = { ...earliestTask, dueDate: anchor.format('YYYY-MM-DD') };
        }

        const newInstances = generateRecurringInstances(anchorTask, groupId, holidays);
        
        // 기완료된 인스턴스가 있는 날짜는 제외하여 필터링
        const completedDatesForGroup = completedTodos
          .filter(t => t.recurringGroupId === groupId)
          .map(t => t.dueDate);
          
        const filteredNewInstances = newInstances.filter(
          inst => !completedDatesForGroup.includes(inst.dueDate)
        );
        
        rescheduledRecurringTodos.push(...filteredNewInstances);
      }
      
      // 최종 취합
      return [
        ...completedTodos,
        ...rescheduledSingleTodos,
        ...rescheduledRecurringTodos,
      ];
    }
    case 'POSTPONE_TODO': {
      const { id, holidays } = action.payload;
      return state.map(todo => {
        if (todo.id === id) {
          const originalDate = dayjs(todo.dueDate);
          const nextDate = originalDate.add(1, 'day');
          const postponedDate = skipToWorkday(nextDate, holidays).format('YYYY-MM-DD');
          return {
            ...todo,
            dueDate: postponedDate,
          };
        }
        return todo;
      });
    }
    case 'PREV_POSTPONE_TODO': {
      const { id, holidays } = action.payload;
      return state.map(todo => {
        if (todo.id === id) {
          const originalDate = dayjs(todo.dueDate);
          const prevDate = originalDate.subtract(1, 'day');
          const postponedDate = skipToPrevWorkday(prevDate, holidays).format('YYYY-MM-DD');
          return {
            ...todo,
            dueDate: postponedDate,
          };
        }
        return todo;
      });
    }
    case 'MOVE_TODO_TO_DATE': {
      const { id, targetDate } = action.payload;
      return state.map(todo => {
        if (todo.id === id) {
          return {
            ...todo,
            dueDate: targetDate,
          };
        }
        return todo;
      });
    }
    case 'RESCHEDULE_RECURRING': {
      const { groupId, fromDate, newAnchor, newRecurringType, newRecurringDays, holidays } = action.payload;
      const groupInsts = state.filter(t => t.recurringGroupId === groupId);
      if (groupInsts.length === 0) return state;

      const others = state.filter(t => t.recurringGroupId !== groupId);

      // 1) 기준일 이전(과거) 인스턴스는 실제 날짜/완료/메모 그대로 보존하되, 단일 일정으로 전환하여 박제
      const pastSingles = groupInsts
        .filter(t => t.dueDate < fromDate)
        .map(t => ({
          ...t,
          isRecurring: false,
          recurringType: undefined,
          recurringDays: undefined,
          recurringGroupId: undefined,
          holidayBehavior: undefined,
        }));

      // 2) 새 규칙의 베이스: 그룹의 가장 이른 인스턴스에서 공통 속성만 가져온다
      const template = groupInsts.reduce((a, b) => (a.dueDate < b.dueDate ? a : b));
      const baseTodo = {
        title: template.title,
        description: template.description,
        dueDate: newAnchor,
        difficulty: template.difficulty,
        isPeriod: false,
        isRecurring: true,
        recurringType: newRecurringType,
        recurringDays: newRecurringType === 'custom' ? newRecurringDays : undefined,
        holidayBehavior: template.holidayBehavior || 'next',
        // 체크리스트는 구조만 복제 (완료상태 초기화, 시작 전 확인 플래그는 보존)
        checklist: template.checklist
          ? template.checklist.map(c => ({ id: c.id, text: c.text, completed: false, ...(c.preStart ? { preStart: true } : {}) }))
          : undefined,
      } as Omit<Todo, 'id' | 'completed' | 'completedAt' | 'createdAt'>;

      const newGroupId = uuidv4();
      const newInstances = generateRecurringInstances(baseTodo, newGroupId, holidays);

      return [...others, ...pastSingles, ...newInstances];
    }
    default:
      return state;
  }
}

export function useTodos() {
  const [todos, dispatch] = useReducer(todoReducer, [], () => loadTodos());

  // localStorage 자동 동기화
  useEffect(() => {
    saveTodos(todos);
  }, [todos]);

  const addTodo = useCallback((
    todoData: Omit<Todo, 'id' | 'completed' | 'completedAt' | 'createdAt'>, 
    holidays: string[] = []
  ) => {
    if (todoData.isRecurring) {
      const groupId = uuidv4();
      const recurringInstances = generateRecurringInstances(todoData, groupId, holidays);
      dispatch({ type: 'ADD_TODO', payload: recurringInstances });
    } else {
      const newTodo: Todo = {
        ...todoData,
        id: uuidv4(),
        completed: false,
        createdAt: dayjs().toISOString(),
      };
      dispatch({ type: 'ADD_TODO', payload: newTodo });
    }
  }, []);

  const updateTodo = useCallback((
    todo: Todo, 
    mode?: 'single' | 'future' | 'all', 
    selectedDate?: string
  ) => {
    dispatch({ type: 'UPDATE_TODO', payload: { todo, mode, selectedDate } });
  }, []);

  const deleteTodo = useCallback((
    id: string, 
    mode?: 'single' | 'future' | 'all', 
    selectedDate?: string
  ) => {
    dispatch({ type: 'DELETE_TODO', payload: { id, mode, selectedDate } });
  }, []);

  const toggleComplete = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_COMPLETE', payload: { id } });
  }, []);

  const reorderTodos = useCallback((orderedIds: string[]) => {
    dispatch({ type: 'REORDER_TODOS', payload: { orderedIds } });
  }, []);

  const rescheduleTodos = useCallback((holidaysList: string[]) => {
    dispatch({ type: 'RESCHEDULE_TODOS', payload: { holidays: holidaysList } });
  }, []);

  const postponeTodo = useCallback((id: string, holidaysList: string[]) => {
    dispatch({ type: 'POSTPONE_TODO', payload: { id, holidays: holidaysList } });
  }, []);

  const prePostponeTodo = useCallback((id: string, holidaysList: string[]) => {
    dispatch({ type: 'PREV_POSTPONE_TODO', payload: { id, holidays: holidaysList } });
  }, []);

  const moveTodoToDate = useCallback((id: string, targetDate: string) => {
    dispatch({ type: 'MOVE_TODO_TO_DATE', payload: { id, targetDate } });
  }, []);

  const rescheduleRecurring = useCallback((params: {
    groupId: string;
    fromDate: string;
    newAnchor: string;
    newRecurringType: RecurringType;
    newRecurringDays?: number;
    holidays: string[];
  }) => {
    dispatch({ type: 'RESCHEDULE_RECURRING', payload: params });
  }, []);

  const setTodos = useCallback((todosList: Todo[]) => {
    dispatch({ type: 'SET_TODOS', payload: todosList });
  }, []);

  return {
    todos,
    setTodos,
    addTodo,
    updateTodo,
    deleteTodo,
    toggleComplete,
    reorderTodos,
    rescheduleTodos,
    postponeTodo,
    prePostponeTodo,
    moveTodoToDate,
    rescheduleRecurring,
  };
}
