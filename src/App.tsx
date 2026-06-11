import { useState, useCallback, useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import koKR from 'antd/locale/ko_KR';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import type { Dayjs } from 'dayjs';
import type { Todo, CourseTask } from './types/todo';
import { useTodos } from './hooks/useTodos';
import { useNotification } from './hooks/useNotification';
import { useHolidays } from './hooks/useHolidays';
import { useFirestoreSync } from './hooks/useFirestoreSync';
import Header from './components/Header';
import TodoCalendar from './components/TodoCalendar';
import DayDetailPanel from './components/DayDetailPanel';
import TodoForm from './components/TodoForm';
import HolidayManager from './components/HolidayManager';
import RecurringManagerModal from './components/RecurringManagerModal';
import BackupRestoreModal from './components/BackupRestoreModal';
import CourseManagerModal from './components/CourseManagerModal';
import { v4 as uuidv4 } from 'uuid';
import './App.css';

dayjs.locale('ko');

const App: React.FC = () => {
  const { todos, setTodos, addTodo, updateTodo, deleteTodo, toggleComplete, reorderTodos, rescheduleTodos, postponeTodo, prePostponeTodo } = useTodos();
  const { permission, requestPermission, sendTestNotification, notificationsEnabled, toggleNotifications } = useNotification(todos);
  const { holidays, setHolidays, addHoliday, removeHoliday, isHoliday, getHolidayReason } = useHolidays();

  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [formOpen, setFormOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [selectedRecurringGroupId, setSelectedRecurringGroupId] = useState<string | null>(null);

  // 코스 관련 상태들
  const [courseTasks, setCourseTasks] = useState<CourseTask[]>(() => {
    try {
      const data = localStorage.getItem('dongjae-todo-course-tasks');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  });

  const [completedCourseTasks, setCompletedCourseTasks] = useState<Record<string, boolean>>(() => {
    try {
      const data = localStorage.getItem('dongjae-todo-course-completions');
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  });

  const [excludedCourseTasks, setExcludedCourseTasks] = useState<Record<string, boolean>>(() => {
    try {
      const data = localStorage.getItem('dongjae-todo-course-exclusions');
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  });

  // 반복 일정의 그룹 단위 표시 순서 (groupId -> 순번). 인스턴스마다 sortOrder를 쓰지 않고 그룹 단위로만 저장한다.
  const [recurringGroupOrder, setRecurringGroupOrder] = useState<Record<string, number>>(() => {
    try {
      const data = localStorage.getItem('dongjae-todo-recurring-group-order');
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  });

  // Firestore 실시간 동기화 훅 연결
  const { isSyncing, syncError } = useFirestoreSync({
    todos,
    setTodos,
    holidays,
    setHolidays,
    courseTasks,
    setCourseTasks,
    completedCourseTasks,
    setCompletedCourseTasks,
    excludedCourseTasks,
    setExcludedCourseTasks,
    recurringGroupOrder,
    setRecurringGroupOrder
  });

  // 로컬스토리지 동기화
  useEffect(() => {
    localStorage.setItem('dongjae-todo-course-tasks', JSON.stringify(courseTasks));
  }, [courseTasks]);

  useEffect(() => {
    localStorage.setItem('dongjae-todo-course-completions', JSON.stringify(completedCourseTasks));
  }, [completedCourseTasks]);

  useEffect(() => {
    localStorage.setItem('dongjae-todo-course-exclusions', JSON.stringify(excludedCourseTasks));
  }, [excludedCourseTasks]);

  useEffect(() => {
    localStorage.setItem('dongjae-todo-recurring-group-order', JSON.stringify(recurringGroupOrder));
  }, [recurringGroupOrder]);

  // 반복 일정 그룹 순서를 병합 갱신 (해당 날짜에 있던 그룹들만 새 순번으로 덮어씀)
  const handleReorderRecurringGroups = useCallback((groupOrder: Record<string, number>) => {
    setRecurringGroupOrder(prev => ({ ...prev, ...groupOrder }));
  }, []);

  const handleOpenRecurringManager = useCallback((groupId?: string) => {
    setSelectedRecurringGroupId(groupId || null);
    setRecurringModalOpen(true);
  }, []);

  const handleCloseRecurringManager = useCallback(() => {
    setRecurringModalOpen(false);
    setSelectedRecurringGroupId(null);
  }, []);

  // 검색 결과/스케줄에서 특정 날짜로 점프 (모달 닫고 그 날짜 선택)
  const handleJumpToDate = useCallback((dateStr: string) => {
    setSelectedDate(dayjs(dateStr));
    setRecurringModalOpen(false);
    setSelectedRecurringGroupId(null);
  }, []);

  const handleImportBackup = useCallback((
    importedTodos: Todo[], 
    importedHolidays: typeof holidays,
    importedCourseTasks?: CourseTask[],
    importedCourseCompletions?: Record<string, boolean>,
    importedCourseExclusions?: Record<string, boolean>
  ) => {
    setTodos(importedTodos);
    setHolidays(importedHolidays);
    if (importedCourseTasks) setCourseTasks(importedCourseTasks);
    if (importedCourseCompletions) setCompletedCourseTasks(importedCourseCompletions);
    if (importedCourseExclusions) setExcludedCourseTasks(importedCourseExclusions);
  }, [setTodos, setHolidays]);

  // 첫 진입 시 로컬스토리지에 기존 데이터가 없고 백업 파일이 존재하면 자동으로 복원
  useEffect(() => {
    const hasData = localStorage.getItem('dongjae-todo-data');
    if (hasData === null) {
      fetch('/extracted_todos.json')
        .then(res => {
          if (res.ok) return res.json();
          throw new Error('No backup file found');
        })
        .then(data => {
          if (data) {
            const importedTodos = data.todos || [];
            const importedHolidays = data.holidays || [];
            const importedCourseTasks = data.courseTasks || [];
            const importedCourseCompletions = data.completedCourseTasks || {};
            const importedCourseExclusions = data.excludedCourseTasks || {};
            handleImportBackup(
              importedTodos,
              importedHolidays,
              importedCourseTasks,
              importedCourseCompletions,
              importedCourseExclusions
            );
          }
        })
        .catch(err => {
          console.warn('Auto-restore backup failed or not found:', err);
        });
    }
  }, [handleImportBackup]);

  /** 주말 또는 휴일인지 확인 */
  const checkIsOffDay = useCallback((date: Dayjs): boolean => {
    const day = date.day();
    if (day === 0 || day === 6) return true;
    return isHoliday(date.format('YYYY-MM-DD'));
  }, [isHoliday]);

  const handleAddHoliday = useCallback((date: string, reason?: string) => {
    addHoliday(date, reason);
    const dateList = holidays.map(h => h.date);
    if (!dateList.includes(date)) {
      dateList.push(date);
    }
    rescheduleTodos(dateList);
  }, [addHoliday, holidays, rescheduleTodos]);

  const handleRemoveHoliday = useCallback((date: string) => {
    removeHoliday(date);
    const dateList = holidays.map(h => h.date).filter(d => d !== date);
    rescheduleTodos(dateList);
  }, [removeHoliday, holidays, rescheduleTodos]);

  const handleAddClick = () => {
    setEditingTodo(null);
    setFormOpen(true);
  };

  const handleEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingTodo(null);
  };

  const handleSelectDate = (date: Dayjs) => {
    setSelectedDate(date);
  };

  // 코스 업무 관리 핸들러
  const handleAddCourseTask = useCallback((taskData: Omit<CourseTask, 'id'>) => {
    const newTask: CourseTask = {
      ...taskData,
      id: uuidv4(),
    };
    setCourseTasks(prev => [...prev, newTask]);
  }, []);

  const handleRemoveCourseTask = useCallback((id: string) => {
    setCourseTasks(prev => prev.filter(t => t.id !== id));
    setCompletedCourseTasks(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        if (key.endsWith(`_${id}`)) {
          delete next[key];
        }
      });
      return next;
    });
    setExcludedCourseTasks(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        if (key.endsWith(`_${id}`)) {
          delete next[key];
        }
      });
      return next;
    });
  }, []);

  const handleToggleCourseTask = useCallback((dateStr: string, courseTaskId: string) => {
    const key = `${dateStr}_${courseTaskId}`;
    setCompletedCourseTasks(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const handleExcludeCourseTask = useCallback((dateStr: string, courseTaskId: string) => {
    const key = `${dateStr}_${courseTaskId}`;
    setExcludedCourseTasks(prev => ({
      ...prev,
      [key]: true,
    }));
  }, []);

  const handleToggleComplete = useCallback((id: string) => {
    if (id.startsWith('course-')) {
      const dateStr = id.slice(-10);
      const courseTaskId = id.slice(7, -11);
      handleToggleCourseTask(dateStr, courseTaskId);
    } else {
      toggleComplete(id);
    }
  }, [toggleComplete, handleToggleCourseTask]);

  const handleDeleteTodo = useCallback((id: string, mode?: 'single' | 'future' | 'all') => {
    if (id.startsWith('course-')) {
      const dateStr = id.slice(-10);
      const courseTaskId = id.slice(7, -11);
      if (mode === 'all') {
        handleRemoveCourseTask(courseTaskId);
      } else {
        handleExcludeCourseTask(dateStr, courseTaskId);
      }
    } else {
      deleteTodo(id, mode, selectedDate.format('YYYY-MM-DD'));
    }
  }, [deleteTodo, selectedDate, handleRemoveCourseTask, handleExcludeCourseTask]);

  return (
    <ConfigProvider
      locale={koKR}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#8b5cf6',
          colorBgContainer: '#1a1b2e',
          colorBgElevated: '#222340',
          borderRadius: 12,
          fontFamily: "'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif",
        },
        components: {
          Calendar: {
            fullBg: 'transparent',
            fullPanelBg: 'transparent',
          },
        },
      }}
    >
      <div className="app-container">
        <Header
          todos={todos}
          onAddClick={handleAddClick}
          onTestNotification={sendTestNotification}
          notificationPermission={permission}
          onRequestPermission={requestPermission}
          notificationsEnabled={notificationsEnabled}
          onToggleNotifications={toggleNotifications}
          onHolidayClick={() => setHolidayModalOpen(true)}
          holidayCount={holidays.length}
          onRecurringClick={() => handleOpenRecurringManager()}
          onBackupClick={() => setBackupModalOpen(true)}
          onCourseClick={() => setCourseModalOpen(true)}
          isSyncing={isSyncing}
          syncError={syncError}
        />

        <div className="main-content">
          <div className="calendar-section">
            <TodoCalendar
              todos={todos}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              holidays={holidays}
              isHoliday={isHoliday}
              getHolidayReason={getHolidayReason}
              courseTasks={courseTasks}
              completedCourseTasks={completedCourseTasks}
              excludedCourseTasks={excludedCourseTasks}
              recurringGroupOrder={recurringGroupOrder}
            />
          </div>

          <div className="detail-section">
            <DayDetailPanel
              selectedDate={selectedDate}
              todos={todos}
              onToggleComplete={handleToggleComplete}
              onEdit={handleEdit}
              onDelete={handleDeleteTodo}
              onUpdateDirectly={updateTodo}
              onAddTodo={handleAddClick}
              isOffDay={checkIsOffDay(selectedDate)}
              isHoliday={isHoliday(selectedDate.format('YYYY-MM-DD'))}
              onReorderTodos={reorderTodos}
              recurringGroupOrder={recurringGroupOrder}
              onReorderRecurringGroups={handleReorderRecurringGroups}
              onOpenRecurringManager={handleOpenRecurringManager}
              onPostponeTodo={(id) => postponeTodo(id, holidays.map(h => h.date))}
              onPrePostponeTodo={(id) => prePostponeTodo(id, holidays.map(h => h.date))}
              courseTasks={courseTasks}
              completedCourseTasks={completedCourseTasks}
              excludedCourseTasks={excludedCourseTasks}
              holidays={holidays}
            />
          </div>

        </div>

        <TodoForm
          open={formOpen}
          onClose={handleFormClose}
          onSubmit={(todoData) => addTodo(todoData, holidays.map(h => h.date))}
          onUpdate={updateTodo}
          editingTodo={editingTodo}
          defaultDate={selectedDate}
        />

        <HolidayManager
          open={holidayModalOpen}
          onClose={() => setHolidayModalOpen(false)}
          holidays={holidays}
          onAddHoliday={handleAddHoliday}
          onRemoveHoliday={handleRemoveHoliday}
        />

        <RecurringManagerModal
          open={recurringModalOpen}
          onClose={handleCloseRecurringManager}
          todos={todos}
          selectedGroupId={selectedRecurringGroupId}
          onJumpToDate={handleJumpToDate}
        />

        <BackupRestoreModal
          open={backupModalOpen}
          onClose={() => setBackupModalOpen(false)}
          todos={todos}
          holidays={holidays}
          courseTasks={courseTasks}
          completedCourseTasks={completedCourseTasks}
          excludedCourseTasks={excludedCourseTasks}
          onImportBackup={handleImportBackup}
        />

        <CourseManagerModal
          open={courseModalOpen}
          onClose={() => setCourseModalOpen(false)}
          courseTasks={courseTasks}
          onAddCourseTask={handleAddCourseTask}
          onRemoveCourseTask={handleRemoveCourseTask}
        />
      </div>
    </ConfigProvider>
  );
};

export default App;
