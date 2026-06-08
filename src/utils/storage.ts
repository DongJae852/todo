import type { Todo } from '../types/todo';

const STORAGE_KEY = 'dongjae-todo-data';

export function loadTodos(): Todo[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data) as Todo[];
  } catch {
    console.error('Failed to load todos from localStorage');
    return [];
  }
}

export function saveTodos(todos: Todo[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    console.error('Failed to save todos to localStorage');
  }
}
