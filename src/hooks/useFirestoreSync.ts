import { useEffect, useRef, useState } from 'react';
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
  const isSyncingFromRemote = useRef(false);

  // Refs for tracking previous state to find changes
  const prevTodosRef = useRef<Todo[]>([]);
  const prevHolidaysRef = useRef<Holiday[]>([]);
  const prevCourseTasksRef = useRef<CourseTask[]>([]);
  const prevCompletedTasksRef = useRef<Record<string, boolean>>({});
  const prevExcludedTasksRef = useRef<Record<string, boolean>>({});

  // Helper function to upload in batches (max 500 docs per batch)
  const uploadInBatches = async (collectionName: string, items: any[]) => {
    const batchSize = 500;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = writeBatch(db);
      const chunk = items.slice(i, i + batchSize);
      chunk.forEach(item => {
        const id = item.id || item.date;
        if (id) {
          const docRef = doc(db, collectionName, id);
          batch.set(docRef, item);
        }
      });
      await batch.commit();
    }
  };

  // 1. Initial Sync
  useEffect(() => {
    const doInitialSync = async () => {
      try {
        console.log('Starting Firestore initial sync...');
        
        // Try fetching todos from Firestore
        const todosSnapshot = await getDocs(collection(db, 'todos'));
        const hasRemoteTodos = !todosSnapshot.empty;

        if (!hasRemoteTodos) {
          // A. If Firestore is empty but we have local data, upload local data to Firestore
          console.log('Firestore is empty. Uploading local data to Firestore...');
          
          if (todos.length > 0) {
            await uploadInBatches('todos', todos);
          }
          
          if (holidays.length > 0) {
            const holidayBatch = writeBatch(db);
            holidays.forEach(h => {
              if (h.date) {
                holidayBatch.set(doc(db, 'holidays', h.date), h);
              }
            });
            await holidayBatch.commit();
          }

          if (courseTasks.length > 0) {
            const courseBatch = writeBatch(db);
            courseTasks.forEach(t => {
              if (t.id) {
                courseBatch.set(doc(db, 'courseTasks', t.id), t);
              }
            });
            await courseBatch.commit();
          }

          // Upload metadata
          await setDoc(doc(db, 'appState', 'metadata'), {
            completedCourseTasks,
            excludedCourseTasks
          });

          console.log('Initial data upload to Firestore completed successfully!');
        } else {
          // B. If Firestore has data, sync it down to replace local data
          console.log('Firestore has data. Downloading to local state...');
          
          const remoteTodos: Todo[] = [];
          todosSnapshot.forEach(doc => {
            remoteTodos.push(doc.data() as Todo);
          });

          const holidaysSnapshot = await getDocs(collection(db, 'holidays'));
          const remoteHolidays: Holiday[] = [];
          holidaysSnapshot.forEach(doc => {
            remoteHolidays.push(doc.data() as Holiday);
          });

          const courseTasksSnapshot = await getDocs(collection(db, 'courseTasks'));
          const remoteCourseTasks: CourseTask[] = [];
          courseTasksSnapshot.forEach(doc => {
            remoteCourseTasks.push(doc.data() as CourseTask);
          });

          const metadataSnapshot = await getDocs(collection(db, 'appState'));
          let remoteCompleted: Record<string, boolean> = {};
          let remoteExcluded: Record<string, boolean> = {};
          
          metadataSnapshot.forEach(doc => {
            if (doc.id === 'metadata') {
              const data = doc.data();
              remoteCompleted = data.completedCourseTasks || {};
              remoteExcluded = data.excludedCourseTasks || {};
            }
          });

          // Update local state (this will write to localStorage automatically)
          isSyncingFromRemote.current = true;
          setTodos(remoteTodos);
          setHolidays(remoteHolidays);
          setCourseTasks(remoteCourseTasks);
          setCompletedCourseTasks(remoteCompleted);
          setExcludedCourseTasks(remoteExcluded);

          // Update previous state refs to match the new local state
          prevTodosRef.current = remoteTodos;
          prevHolidaysRef.current = remoteHolidays;
          prevCourseTasksRef.current = remoteCourseTasks;
          prevCompletedTasksRef.current = remoteCompleted;
          prevExcludedTasksRef.current = remoteExcluded;
          
          isSyncingFromRemote.current = false;
          console.log('Initial data download from Firestore completed successfully!');
        }

        // Set refs to initial states
        prevTodosRef.current = todos;
        prevHolidaysRef.current = holidays;
        prevCourseTasksRef.current = courseTasks;
        prevCompletedTasksRef.current = completedCourseTasks;
        prevExcludedTasksRef.current = excludedCourseTasks;

        isInitialSyncDone.current = true;
        setIsSyncing(false);
      } catch (err: any) {
        console.error('Error during initial sync:', err);
        setSyncError(err.message || 'Initial sync failed');
        setIsSyncing(false);
      }
    };

    doInitialSync();
  }, []);

  // Refs for tracking absolute latest state to avoid listener re-subscription
  const latestTodosRef = useRef(todos);
  const latestHolidaysRef = useRef(holidays);
  const latestCourseTasksRef = useRef(courseTasks);
  const latestCompletedRef = useRef(completedCourseTasks);
  const latestExcludedRef = useRef(excludedCourseTasks);

  useEffect(() => {
    latestTodosRef.current = todos;
    latestHolidaysRef.current = holidays;
    latestCourseTasksRef.current = courseTasks;
    latestCompletedRef.current = completedCourseTasks;
    latestExcludedRef.current = excludedCourseTasks;
  }, [todos, holidays, courseTasks, completedCourseTasks, excludedCourseTasks]);

  // 2. Real-time Remote Listener (to capture updates from other devices)
  useEffect(() => {
    if (isSyncing) return;

    // Listen for remote todo changes
    const unsubTodos = onSnapshot(collection(db, 'todos'), (snapshot) => {
      // Ignore local optimistic writes to prevent race conditions
      if (snapshot.metadata.hasPendingWrites) return;
      if (isSyncingFromRemote.current) return;
      
      const remoteTodos: Todo[] = [];
      snapshot.forEach(doc => {
        remoteTodos.push(doc.data() as Todo);
      });

      const currentTodos = latestTodosRef.current;
      const localIds = currentTodos.map(t => t.id).sort().join(',');
      const remoteIds = remoteTodos.map(t => t.id).sort().join(',');
      
      const isDifferent = localIds !== remoteIds || 
        JSON.stringify(currentTodos) !== JSON.stringify(remoteTodos);

      if (isDifferent) {
        console.log('Remote todos changed. Syncing to local...');
        isSyncingFromRemote.current = true;
        setTodos(remoteTodos);
        prevTodosRef.current = remoteTodos;
        isSyncingFromRemote.current = false;
      }
    });

    // Listen for remote holiday changes
    const unsubHolidays = onSnapshot(collection(db, 'holidays'), (snapshot) => {
      if (snapshot.metadata.hasPendingWrites) return;
      if (isSyncingFromRemote.current) return;

      const remoteHolidays: Holiday[] = [];
      snapshot.forEach(doc => {
        remoteHolidays.push(doc.data() as Holiday);
      });

      const currentHolidays = latestHolidaysRef.current;
      if (JSON.stringify(currentHolidays) !== JSON.stringify(remoteHolidays)) {
        console.log('Remote holidays changed. Syncing to local...');
        isSyncingFromRemote.current = true;
        setHolidays(remoteHolidays);
        prevHolidaysRef.current = remoteHolidays;
        isSyncingFromRemote.current = false;
      }
    });

    return () => {
      unsubTodos();
      unsubHolidays();
    };
  }, [isSyncing, setTodos, setHolidays]);

  // 3. Local-to-Firestore Push Effect
  useEffect(() => {
    if (!isInitialSyncDone.current || isSyncingFromRemote.current) return;

    const syncLocalChanges = async () => {
      try {
        // A. Sync Todos
        const prevTodos = prevTodosRef.current;
        const currentTodos = todos;

        const prevMap = new Map(prevTodos.map(t => [t.id, t]));
        const currentMap = new Map(currentTodos.map(t => [t.id, t]));

        // Detect additions and modifications
        for (const todo of currentTodos) {
          const prev = prevMap.get(todo.id);
          if (!prev || JSON.stringify(prev) !== JSON.stringify(todo)) {
            await setDoc(doc(db, 'todos', todo.id), todo);
            console.log(`Synced Todo to Firestore: ${todo.title}`);
          }
        }

        // Detect deletions
        for (const todo of prevTodos) {
          if (!currentMap.has(todo.id)) {
            await deleteDoc(doc(db, 'todos', todo.id));
            console.log(`Deleted Todo from Firestore: ${todo.title}`);
          }
        }

        prevTodosRef.current = currentTodos;

        // B. Sync Holidays
        const prevHolidays = prevHolidaysRef.current;
        const currentHolidays = holidays;

        const prevHMap = new Map(prevHolidays.map(h => [h.date, h]));
        const currentHMap = new Map(currentHolidays.map(h => [h.date, h]));

        for (const h of currentHolidays) {
          const prev = prevHMap.get(h.date);
          if (!prev || prev.reason !== h.reason) {
            await setDoc(doc(db, 'holidays', h.date), h);
          }
        }

        for (const h of prevHolidays) {
          if (!currentHMap.has(h.date)) {
            await deleteDoc(doc(db, 'holidays', h.date));
          }
        }

        prevHolidaysRef.current = currentHolidays;

        // C. Sync Course Tasks
        const prevCT = prevCourseTasksRef.current;
        const currentCT = courseTasks;

        const prevCTMap = new Map(prevCT.map(t => [t.id, t]));
        const currentCTMap = new Map(currentCT.map(t => [t.id, t]));

        for (const t of currentCT) {
          const prev = prevCTMap.get(t.id);
          if (!prev || JSON.stringify(prev) !== JSON.stringify(t)) {
            await setDoc(doc(db, 'courseTasks', t.id), t);
          }
        }

        for (const t of prevCT) {
          if (!currentCTMap.has(t.id)) {
            await deleteDoc(doc(db, 'courseTasks', t.id));
          }
        }

        prevCourseTasksRef.current = currentCT;

        // D. Sync Course Metadata (completions and exclusions)
        const prevComp = prevCompletedTasksRef.current;
        const prevExcl = prevExcludedTasksRef.current;

        const compChanged = JSON.stringify(prevComp) !== JSON.stringify(completedCourseTasks);
        const exclChanged = JSON.stringify(prevExcl) !== JSON.stringify(excludedCourseTasks);

        if (compChanged || exclChanged) {
          await setDoc(doc(db, 'appState', 'metadata'), {
            completedCourseTasks,
            excludedCourseTasks
          });
          console.log('Synced course completion/exclusion metadata to Firestore.');
          prevCompletedTasksRef.current = completedCourseTasks;
          prevExcludedTasksRef.current = excludedCourseTasks;
        }

      } catch (err) {
        console.error('Failed to sync local changes to Firestore:', err);
      }
    };

    syncLocalChanges();
  }, [todos, holidays, courseTasks, completedCourseTasks, excludedCourseTasks]);

  return { isSyncing, syncError };
}
