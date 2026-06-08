import { useReducer, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import type { Todo } from '../types/todo';
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
  | { type: 'PREV_POSTPONE_TODO'; payload: { id: string; holidays: string[] } };

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
      const idToTodo = new Map<string, Todo>();
      state.forEach(t => idToTodo.set(t.id, t));

      const groupIdToSortOrder = new Map<string, number>();
      const idToOrder = new Map<string, number>();
      
      orderedIds.forEach((id, index) => {
        idToOrder.set(id, index);
        const todo = idToTodo.get(id);
        if (todo && todo.isRecurring && todo.recurringGroupId) {
          groupIdToSortOrder.set(todo.recurringGroupId, index);
        }
      });

      return state.map(todo => {
        const directIndex = idToOrder.get(todo.id);
        if (directIndex !== undefined) {
          return { ...todo, sortOrder: directIndex };
        }
        if (todo.isRecurring && todo.recurringGroupId) {
          const groupIndex = groupIdToSortOrder.get(todo.recurringGroupId);
          if (groupIndex !== undefined) {
            return { ...todo, sortOrder: groupIndex };
          }
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
 
        const newInstances = generateRecurringInstances(earliestTask, groupId, holidays);
        
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
  };
}
