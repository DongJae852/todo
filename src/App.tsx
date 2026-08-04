import { useState, useCallback, useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import koKR from 'antd/locale/ko_KR';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import type { Dayjs } from 'dayjs';
import type { Todo, CourseTask, CourseDayState, ChecklistItem } from './types/todo';
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
import CourseTaskEditModal from './components/CourseTaskEditModal';
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

  // 코스 업무의 일자별 개별 상태 (메모 + 체크리스트 완료). key = `${YYYY-MM-DD}_${courseTaskId}`
  const [courseDailyState, setCourseDailyState] = useState<Record<string, CourseDayState>>(() => {
    try {
      const data = localStorage.getItem('dongjae-todo-course-daily-state');
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  });

  // 코스 업무 편집 모달 상태
  const [courseTaskEditOpen, setCourseTaskEditOpen] = useState(false);
  const [editingCourseTask, setEditingCourseTask] = useState<CourseTask | null>(null);
  const [editingCourseDate, setEditingCourseDate] = useState<string>('');

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
    courseDailyState,
    setCourseDailyState,
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
    localStorage.setItem('dongjae-todo-course-daily-state', JSON.stringify(courseDailyState));
  }, [courseDailyState]);

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
    importedCourseExclusions?: Record<string, boolean>,
    importedCourseDailyState?: Record<string, CourseDayState>
  ) => {
    setTodos(importedTodos);
    setHolidays(importedHolidays);
    if (importedCourseTasks) setCourseTasks(importedCourseTasks);
    if (importedCourseCompletions) setCompletedCourseTasks(importedCourseCompletions);
    if (importedCourseExclusions) setExcludedCourseTasks(importedCourseExclusions);
    if (importedCourseDailyState) setCourseDailyState(importedCourseDailyState);
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
            const importedCourseDailyState = data.courseDailyState || {};
            handleImportBackup(
              importedTodos,
              importedHolidays,
              importedCourseTasks,
              importedCourseCompletions,
              importedCourseExclusions,
              importedCourseDailyState
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
    // 코스 업무는 별도의 코스 업무 편집 모달로 라우팅 (제목/난이도/체크리스트 템플릿 수정)
    if (todo.isCourseTask && todo.courseTaskId) {
      const ct = courseTasks.find(t => t.id === todo.courseTaskId);
      if (ct) {
        // 편집 대상 코스 인스턴스의 날짜 (합성 id 끝 10자리) — 적용 범위 계산에 사용
        setEditingCourseTask(ct);
        setEditingCourseDate(todo.dueDate || todo.id.slice(-10));
        setCourseTaskEditOpen(true);
      }
      return;
    }
    setEditingTodo(todo);
    setFormOpen(true);
  };

  // 상세 패널에서의 직접 업데이트. 코스 업무(합성 id)는 일자별 상태(메모/체크리스트 완료)로 저장한다.
  const handleUpdateDirectly = useCallback((
    todo: Todo,
    mode?: 'single' | 'future' | 'all',
    selDate?: string
  ) => {
    if (todo.id.startsWith('course-') && todo.courseTaskId) {
      const dateStr = todo.id.slice(-10);
      const key = `${dateStr}_${todo.courseTaskId}`;
      const checklistState: Record<string, boolean> = {};
      (todo.checklist || []).forEach(item => {
        checklistState[item.id] = item.completed;
      });
      const note = todo.dailyNote?.trim();
      setCourseDailyState(prev => {
        const next = { ...prev };
        if (!note && Object.keys(checklistState).length === 0) {
          delete next[key];
        } else {
          next[key] = {
            dailyNote: note || undefined,
            checklist: Object.keys(checklistState).length > 0 ? checklistState : undefined,
          };
        }
        return next;
      });
      return;
    }
    updateTodo(todo, mode, selDate);
  }, [updateTodo]);

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
    setCourseDailyState(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        if (key.endsWith(`_${id}`)) {
          delete next[key];
        }
      });
      return next;
    });
  }, []);

  // 코스 업무 편집 저장 — 적용 범위(mode)에 따라 템플릿/버전/일자별 오버라이드로 분기
  const handleUpdateCourseTask = useCallback((
    id: string,
    mode: 'single' | 'future' | 'all',
    dateStr: string,
    values: { title: string; difficulty: number; checklist?: ChecklistItem[] }
  ) => {
    setCourseTasks(prev => prev.map(t => {
      if (t.id !== id) return t;

      if (mode === 'all') {
        // 전체 일정: 기본 템플릿을 덮어쓰고 그동안의 버전/일자별 오버라이드는 모두 정리
        return {
          ...t,
          title: values.title,
          difficulty: values.difficulty,
          checklist: values.checklist,
          versions: undefined,
          dateOverrides: undefined,
        };
      }

      if (mode === 'future') {
        // 이 날짜 및 향후: dateStr부터 적용되는 버전 추가 (이후 버전/오버라이드는 덮어씀)
        const versions = (t.versions || []).filter(v => v.from < dateStr);
        versions.push({
          from: dateStr,
          title: values.title,
          difficulty: values.difficulty,
          checklist: values.checklist,
        });
        versions.sort((a, b) => a.from.localeCompare(b.from));
        const remainingOverrides = t.dateOverrides
          ? Object.fromEntries(Object.entries(t.dateOverrides).filter(([d]) => d < dateStr))
          : undefined;
        return {
          ...t,
          versions,
          dateOverrides: remainingOverrides && Object.keys(remainingOverrides).length > 0 ? remainingOverrides : undefined,
        };
      }

      // single: 이 날짜만 오버라이드
      const dateOverrides = { ...(t.dateOverrides || {}) };
      dateOverrides[dateStr] = {
        title: values.title,
        difficulty: values.difficulty,
        checklist: values.checklist,
      };
      return { ...t, dateOverrides };
    }));
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
              onUpdateDirectly={handleUpdateDirectly}
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
              courseDailyState={courseDailyState}
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
          courseDailyState={courseDailyState}
          onImportBackup={handleImportBackup}
        />

        <CourseManagerModal
          open={courseModalOpen}
          onClose={() => setCourseModalOpen(false)}
          courseTasks={courseTasks}
          onAddCourseTask={handleAddCourseTask}
          onRemoveCourseTask={handleRemoveCourseTask}
        />

        <CourseTaskEditModal
          open={courseTaskEditOpen}
          onClose={() => {
            setCourseTaskEditOpen(false);
            setEditingCourseTask(null);
          }}
          task={editingCourseTask}
          dateStr={editingCourseDate}
          onSave={handleUpdateCourseTask}
        />
      </div>
    </ConfigProvider>
  );
};

export default App;
