import { useEffect, useRef, useState, useCallback } from 'react';
import { db } from '../utils/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  getDocs, 
  writeBatch, 
  onSnapshot 
} from 'firebase/firestore';
import type { Todo, Holiday, CourseTask } from '../types/todo';

// Firestore는 undefined 값을 허용하지 않으므로, 문서 저장 전에 undefined 필드를 모두 제거
function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item));
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeForFirestore(value);
      }
    }
    return cleaned;
  }
  return obj;
}

interface UseFirestoreSyncProps {
  todos: Todo[];
  setTodos: (todos: Todo[]) => void;
  holidays: Holiday[];
  setHolidays: (holidays: Holiday[]) => void;
  courseTasks: CourseTask[];
  setCourseTasks: (tasks: CourseTask[]) => void;
  completedCourseTasks: Record<string, boolean>;
  setCompletedCourseTasks: (completions: Record<string, boolean>) => void;
  excludedCourseTasks: Record<string, boolean>;
  setExcludedCourseTasks: (exclusions: Record<string, boolean>) => void;
}

// ==========================================
// Semantic Equality Helpers
// ==========================================

function isTodoSingleEqual(ta: Todo, tb: Todo): boolean {
  if (ta.id !== tb.id) return false;
  if (ta.title !== tb.title) return false;
  if ((ta.description || '') !== (tb.description || '')) return false;
  if (ta.dueDate !== tb.dueDate) return false;
  if ((ta.startDate || '') !== (tb.startDate || '')) return false;
  if ((ta.endDate || '') !== (tb.endDate || '')) return false;
  if (!!ta.isPeriod !== !!tb.isPeriod) return false;
  if ((ta.difficulty || 0) !== (tb.difficulty || 0)) return false;
  if (ta.isRecurring !== tb.isRecurring) return false;
  if ((ta.recurringType || '') !== (tb.recurringType || '')) return false;
  if ((ta.recurringDays || 0) !== (tb.recurringDays || 0)) return false;
  if ((ta.recurringGroupId || '') !== (tb.recurringGroupId || '')) return false;
  if ((ta.holidayBehavior || '') !== (tb.holidayBehavior || '')) return false;
  if (ta.completed !== tb.completed) return false;
  if ((ta.completedAt || '') !== (tb.completedAt || '')) return false;
  if (ta.createdAt !== tb.createdAt) return false;
  if ((ta.sortOrder || 0) !== (tb.sortOrder || 0)) return false;
  if ((ta.dailyNote || '') !== (tb.dailyNote || '')) return false;
  if (!!ta.isCourseTask !== !!tb.isCourseTask) return false;
  if ((ta.courseTaskId || '') !== (tb.courseTaskId || '')) return false;
  if ((ta.course || '') !== (tb.course || '')) return false;
  
  const clA = ta.checklist || [];
  const clB = tb.checklist || [];
  if (clA.length !== clB.length) return false;
  for (let j = 0; j < clA.length; j++) {
    if (clA[j].id !== clB[j].id || clA[j].text !== clB[j].text || clA[j].completed !== clB[j].completed) {
      return false;
    }
  }
  return true;
}

function areRecordsEqual(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const keysA = Object.keys(a).filter(k => a[k]).sort();
  const keysB = Object.keys(b).filter(k => b[k]).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false;
  }
  return true;
}

export function useFirestoreSync({
  todos,
  setTodos,
  holidays,
  setHolidays,
  courseTasks,
  setCourseTasks,
  completedCourseTasks,
  setCompletedCourseTasks,
  excludedCourseTasks,
  setExcludedCourseTasks
}: UseFirestoreSyncProps) {
  const [isSyncing, setIsSyncing] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  
  const isInitialSyncDone = useRef(false);
  
  // 로컬 변경이 Firestore에 반영 중인지 추적하는 카운터
  // 0이면 push 작업 없음, 1 이상이면 push 작업 진행 중
  const pushInFlightCount = useRef(0);
  
  // onSnapshot이 setTodos를 호출하여 발생한 상태 변경인지 추적
  const isSyncingFromRemote = useRef(false);

  // Refs for tracking previous state to find changes
  const prevTodosRef = useRef<Todo[]>([]);
  const prevHolidaysRef = useRef<Holiday[]>([]);
  const prevCourseTasksRef = useRef<CourseTask[]>([]);
  const prevCompletedTasksRef = useRef<Record<string, boolean>>({});
  const prevExcludedTasksRef = useRef<Record<string, boolean>>({});

  // Debounce timer for push effect
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper function to upload in batches (max 500 docs per batch)
  const uploadInBatches = useCallback(async (collectionName: string, items: any[]) => {
    const batchSize = 500;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = writeBatch(db);
      const chunk = items.slice(i, i + batchSize);
      chunk.forEach(item => {
        const id = item.id || item.date;
        if (id) {
          const docRef = doc(db, collectionName, id);
          batch.set(docRef, sanitizeForFirestore(item));
        }
      });
      await batch.commit();
    }
  }, []);

  // 1. Initial Sync (only run once on mount)
  useEffect(() => {
    const doInitialSync = async () => {
      try {
        console.log('Starting Firestore initial sync...');
        
        const todosSnapshot = await getDocs(collection(db, 'todos'));
        const hasRemoteTodos = !todosSnapshot.empty;

        if (!hasRemoteTodos) {
          console.log('Firestore is empty. Uploading local data to Firestore...');
          
          if (todos.length > 0) {
            await uploadInBatches('todos', todos);
          }
          
          if (holidays.length > 0) {
            const holidayBatch = writeBatch(db);
            holidays.forEach(h => {
              if (h.date) {
                holidayBatch.set(doc(db, 'holidays', h.date), sanitizeForFirestore(h));
              }
            });
            await holidayBatch.commit();
          }

          if (courseTasks.length > 0) {
            const courseBatch = writeBatch(db);
            courseTasks.forEach(t => {
              if (t.id) {
                courseBatch.set(doc(db, 'courseTasks', t.id), sanitizeForFirestore(t));
              }
            });
            await courseBatch.commit();
          }

          await setDoc(doc(db, 'appState', 'metadata'), sanitizeForFirestore({
            completedCourseTasks,
            excludedCourseTasks
          }));

          prevTodosRef.current = todos;
          prevHolidaysRef.current = holidays;
          prevCourseTasksRef.current = courseTasks;
          prevCompletedTasksRef.current = completedCourseTasks;
          prevExcludedTasksRef.current = excludedCourseTasks;

          console.log('Initial data upload to Firestore completed successfully!');
        } else {
          console.log('Firestore has data. Downloading to local state...');
          
          const remoteTodos: Todo[] = [];
          todosSnapshot.forEach(d => {
            remoteTodos.push(d.data() as Todo);
          });

          const holidaysSnapshot = await getDocs(collection(db, 'holidays'));
          const remoteHolidays: Holiday[] = [];
          holidaysSnapshot.forEach(d => {
            remoteHolidays.push(d.data() as Holiday);
          });

          const courseTasksSnapshot = await getDocs(collection(db, 'courseTasks'));
          const remoteCourseTasks: CourseTask[] = [];
          courseTasksSnapshot.forEach(d => {
            remoteCourseTasks.push(d.data() as CourseTask);
          });

          const metadataSnapshot = await getDocs(collection(db, 'appState'));
          let remoteCompleted: Record<string, boolean> = {};
          let remoteExcluded: Record<string, boolean> = {};
          
          metadataSnapshot.forEach(d => {
            if (d.id === 'metadata') {
              const data = d.data();
              remoteCompleted = data.completedCourseTasks || {};
              remoteExcluded = data.excludedCourseTasks || {};
            }
          });

          isSyncingFromRemote.current = true;

          setTodos(remoteTodos);
          setHolidays(remoteHolidays);
          setCourseTasks(remoteCourseTasks);
          setCompletedCourseTasks(remoteCompleted);
          setExcludedCourseTasks(remoteExcluded);

          prevTodosRef.current = remoteTodos;
          prevHolidaysRef.current = remoteHolidays;
          prevCourseTasksRef.current = remoteCourseTasks;
          prevCompletedTasksRef.current = remoteCompleted;
          prevExcludedTasksRef.current = remoteExcluded;
          
          console.log('Initial data download from Firestore completed successfully!');
        }

        isInitialSyncDone.current = true;
        setIsSyncing(false);
      } catch (err: any) {
        console.error('Error during initial sync:', err);
        setSyncError(err.message || 'Initial sync failed');
        // 초기 동기화 실패 시에도 로컬 데이터로 작업 가능하도록 세팅
        prevTodosRef.current = todos;
        prevHolidaysRef.current = holidays;
        prevCourseTasksRef.current = courseTasks;
        prevCompletedTasksRef.current = completedCourseTasks;
        prevExcludedTasksRef.current = excludedCourseTasks;
        isInitialSyncDone.current = true;
        setIsSyncing(false);
      }
    };

    doInitialSync();
  }, []);

  // Refs for tracking absolute latest state
  const latestTodosRef = useRef(todos);
  const latestHolidaysRef = useRef(holidays);

  useEffect(() => {
    latestTodosRef.current = todos;
    latestHolidaysRef.current = holidays;
  }, [todos, holidays]);

  // 2. Real-time Remote Listener
  // 핵심 수정: pushInFlightCount > 0이면 (로컬 push가 진행 중이면) 원격 스냅샷을 무시
  useEffect(() => {
    if (isSyncing) return;

    const unsubTodos = onSnapshot(collection(db, 'todos'), (snapshot) => {
      // 로컬 쓰기 중이면 무시 (hasPendingWrites 또는 push 진행 중)
      if (snapshot.metadata.hasPendingWrites) return;
      if (pushInFlightCount.current > 0) return;
      if (isSyncingFromRemote.current) return;
      
      const remoteTodos: Todo[] = [];
      snapshot.forEach(d => {
        remoteTodos.push(d.data() as Todo);
      });

      const currentTodos = latestTodosRef.current;
      
      // 개수가 다르거나 내용이 다를 때만 업데이트
      if (currentTodos.length !== remoteTodos.length) {
        console.log(`Remote todos count changed (${currentTodos.length} -> ${remoteTodos.length}). Syncing...`);
        isSyncingFromRemote.current = true;
        setTodos(remoteTodos);
        return;
      }
      
      // ID 기반으로 정렬 후 비교
      const sortedLocal = [...currentTodos].sort((a, b) => a.id.localeCompare(b.id));
      const sortedRemote = [...remoteTodos].sort((a, b) => a.id.localeCompare(b.id));
      
      let isDifferent = false;
      for (let i = 0; i < sortedLocal.length; i++) {
        if (!isTodoSingleEqual(sortedLocal[i], sortedRemote[i])) {
          isDifferent = true;
          break;
        }
      }
      
      if (isDifferent) {
        console.log('Remote todos content changed. Syncing to local...');
        isSyncingFromRemote.current = true;
        setTodos(remoteTodos);
      }
    });

    const unsubHolidays = onSnapshot(collection(db, 'holidays'), (snapshot) => {
      if (snapshot.metadata.hasPendingWrites) return;
      if (pushInFlightCount.current > 0) return;
      if (isSyncingFromRemote.current) return;

      const remoteHolidays: Holiday[] = [];
      snapshot.forEach(d => {
        remoteHolidays.push(d.data() as Holiday);
      });

      const currentHolidays = latestHolidaysRef.current;
      
      if (currentHolidays.length !== remoteHolidays.length) {
        isSyncingFromRemote.current = true;
        setHolidays(remoteHolidays);
        return;
      }
      
      const sortedA = [...currentHolidays].sort((a, b) => a.date.localeCompare(b.date));
      const sortedB = [...remoteHolidays].sort((a, b) => a.date.localeCompare(b.date));
      let isDiff = false;
      for (let i = 0; i < sortedA.length; i++) {
        if (sortedA[i].date !== sortedB[i].date || (sortedA[i].reason || '') !== (sortedB[i].reason || '')) {
          isDiff = true;
          break;
        }
      }
      
      if (isDiff) {
        isSyncingFromRemote.current = true;
        setHolidays(remoteHolidays);
      }
    });

    return () => {
      unsubTodos();
      unsubHolidays();
    };
  }, [isSyncing, setTodos, setHolidays]);

  // 3. Local-to-Firestore Push Effect (debounced)
  useEffect(() => {
    if (!isInitialSyncDone.current) return;

    // 원격 동기화로 인한 상태 변경이면 push 스킵
    if (isSyncingFromRemote.current) {
      isSyncingFromRemote.current = false;
      prevTodosRef.current = todos;
      prevHolidaysRef.current = holidays;
      prevCourseTasksRef.current = courseTasks;
      prevCompletedTasksRef.current = completedCourseTasks;
      prevExcludedTasksRef.current = excludedCourseTasks;
      return;
    }

    // 이전 debounce 타이머 취소
    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
    }

    // 300ms debounce: 빠른 연속 변경(예: 향후 일정 전체 수정)을 하나로 묶어서 한 번만 push
    pushTimerRef.current = setTimeout(() => {
      const syncLocalChanges = async () => {
        // push 시작을 알림 (onSnapshot이 이 동안 로컬 덮어쓰기를 하지 않도록)
        pushInFlightCount.current++;
        
        try {
          // === A. Sync Todos ===
          const prevTodos = prevTodosRef.current;
          const currentTodos = todos;

          // Ref를 즉시 현재 상태로 갱신 (이 이후 발생하는 효과에서 중복 push 방지)
          prevTodosRef.current = currentTodos;

          const prevMap = new Map(prevTodos.map(t => [t.id, t]));
          const currentMap = new Map(currentTodos.map(t => [t.id, t]));

          // 변경/추가된 항목 수집
          const todosToWrite: Todo[] = [];
          for (const todo of currentTodos) {
            const prev = prevMap.get(todo.id);
            if (!prev || !isTodoSingleEqual(prev, todo)) {
              todosToWrite.push(todo);
            }
          }

          // 삭제된 항목 수집
          const todosToDelete: Todo[] = [];
          for (const todo of prevTodos) {
            if (!currentMap.has(todo.id)) {
              todosToDelete.push(todo);
            }
          }

          // 배치로 쓰기 (500개씩)
          if (todosToWrite.length > 0) {
            const batchSize = 500;
            for (let i = 0; i < todosToWrite.length; i += batchSize) {
              const batch = writeBatch(db);
              const chunk = todosToWrite.slice(i, i + batchSize);
              chunk.forEach(todo => {
                batch.set(doc(db, 'todos', todo.id), sanitizeForFirestore(todo));
              });
              await batch.commit();
            }
            console.log(`Synced ${todosToWrite.length} todo(s) to Firestore.`);
          }

          // 배치로 삭제
          if (todosToDelete.length > 0) {
            const batchSize = 500;
            for (let i = 0; i < todosToDelete.length; i += batchSize) {
              const batch = writeBatch(db);
              const chunk = todosToDelete.slice(i, i + batchSize);
              chunk.forEach(todo => {
                batch.delete(doc(db, 'todos', todo.id));
              });
              await batch.commit();
            }
            console.log(`Deleted ${todosToDelete.length} todo(s) from Firestore.`);
          }

          // === B. Sync Holidays ===
          const prevHolidays = prevHolidaysRef.current;
          const currentHolidays = holidays;
          prevHolidaysRef.current = currentHolidays;

          const prevHMap = new Map(prevHolidays.map(h => [h.date, h]));
          const currentHMap = new Map(currentHolidays.map(h => [h.date, h]));

          for (const h of currentHolidays) {
            const prev = prevHMap.get(h.date);
            if (!prev || (prev.reason || '') !== (h.reason || '')) {
              await setDoc(doc(db, 'holidays', h.date), sanitizeForFirestore(h));
            }
          }

          for (const h of prevHolidays) {
            if (!currentHMap.has(h.date)) {
              await deleteDoc(doc(db, 'holidays', h.date));
            }
          }

          // === C. Sync Course Tasks ===
          const prevCT = prevCourseTasksRef.current;
          const currentCT = courseTasks;
          prevCourseTasksRef.current = currentCT;

          const prevCTMap = new Map(prevCT.map(t => [t.id, t]));
          const currentCTMap = new Map(currentCT.map(t => [t.id, t]));

          for (const t of currentCT) {
            const prev = prevCTMap.get(t.id);
            if (!prev || prev.title !== t.title || prev.course !== t.course || prev.difficulty !== t.difficulty) {
              await setDoc(doc(db, 'courseTasks', t.id), sanitizeForFirestore(t));
            }
          }

          for (const t of prevCT) {
            if (!currentCTMap.has(t.id)) {
              await deleteDoc(doc(db, 'courseTasks', t.id));
            }
          }

          // === D. Sync Course Metadata ===
          const prevComp = prevCompletedTasksRef.current;
          const prevExcl = prevExcludedTasksRef.current;

          const compChanged = !areRecordsEqual(prevComp, completedCourseTasks);
          const exclChanged = !areRecordsEqual(prevExcl, excludedCourseTasks);

          if (compChanged || exclChanged) {
            prevCompletedTasksRef.current = completedCourseTasks;
            prevExcludedTasksRef.current = excludedCourseTasks;

            await setDoc(doc(db, 'appState', 'metadata'), sanitizeForFirestore({
              completedCourseTasks,
              excludedCourseTasks
            }));
            console.log('Synced course metadata to Firestore.');
          }

        } catch (err) {
          console.error('Failed to sync local changes to Firestore:', err);
        } finally {
          // push 완료를 알림 (onSnapshot이 다시 동작 가능하도록)
          pushInFlightCount.current--;
        }
      };

      syncLocalChanges();
    }, 300);

    // cleanup: 컴포넌트 언마운트 시 타이머 취소
    return () => {
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
      }
    };
  }, [todos, holidays, courseTasks, completedCourseTasks, excludedCourseTasks]);

  return { isSyncing, syncError };
}
