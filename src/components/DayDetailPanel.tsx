import { useState, useMemo } from 'react';
import { Typography, Empty, Button, Tag, Modal, Radio, Space } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { Todo, TodoWithPriority, Holiday, CourseTask } from '../types/todo';
import { getTodosWithPriority } from '../utils/priority';
import TodoItem from './TodoItem';
import { getCourseForDate } from '../utils/course';

const { Title, Text } = Typography;

interface DayDetailPanelProps {
  selectedDate: Dayjs;
  todos: Todo[];
  onToggleComplete: (id: string) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (id: string, mode?: 'single' | 'future' | 'all') => void;
  onUpdateDirectly: (todo: Todo, mode?: 'single' | 'future' | 'all', selectedDate?: string) => void;
  onAddTodo: () => void;
  isOffDay: boolean;
  isHoliday: boolean;
  onReorderTodos: (orderedIds: string[]) => void;
  recurringGroupOrder: Record<string, number>;
  onReorderRecurringGroups: (groupOrder: Record<string, number>) => void;
  onOpenRecurringManager?: (groupId: string) => void;
  onPostponeTodo?: (id: string) => void;
  onPrePostponeTodo?: (id: string) => void;
  courseTasks: CourseTask[];
  completedCourseTasks: Record<string, boolean>;
  excludedCourseTasks: Record<string, boolean>;
  holidays: Holiday[];
}

const COURSE_COLORS = {
  A: '#8b5cf6',
  B: '#06b6d4',
  C: '#10b981',
  D: '#f59e0b',
  E: '#ec4899',
} as const;

const DayDetailPanel: React.FC<DayDetailPanelProps> = ({
  selectedDate,
  todos,
  onToggleComplete,
  onEdit,
  onDelete,
  onUpdateDirectly,
  onAddTodo,
  isOffDay,
  isHoliday,
  onReorderTodos,
  recurringGroupOrder,
  onReorderRecurringGroups,
  onOpenRecurringManager,
  onPostponeTodo,
  onPrePostponeTodo,
  courseTasks,
  completedCourseTasks,
  excludedCourseTasks,
  holidays,
}) => {
  const dateStr = selectedDate.format('YYYY-MM-DD');
  const todayStr = dayjs().format('YYYY-MM-DD');
  const isToday = dateStr === todayStr;
  const isPast = selectedDate.isBefore(dayjs(), 'day');
  const dayOfWeek = selectedDate.day(); // 0=일, 6=토

  const course = getCourseForDate(dateStr, holidays);

  // 반복 삭제 모달을 위한 로컬 상태들 - 디폴트값을 'single'(이 일정만 삭제)로 설정하여 안전성 도모!
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedTodoForDelete, setSelectedTodoForDelete] = useState<Todo | null>(null);
  const [deleteMode, setDeleteMode] = useState<'single' | 'future' | 'all'>('single');

  // 코스 삭제 모달 상태
  const [courseDeleteModalOpen, setCourseDeleteModalOpen] = useState(false);
  const [selectedCourseTaskId, setSelectedCourseTaskId] = useState<string | null>(null);
  const [selectedCourseTaskDate, setSelectedCourseTaskDate] = useState<string | null>(null);
  const [selectedCourseTaskTitle, setSelectedCourseTaskTitle] = useState('');

  // 드래그 앤 드롭 정렬을 위한 로컬 상태
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null);
  const [dragList, setDragList] = useState<TodoWithPriority[] | null>(null); // 드래그 중인 임시 실시간 상태 리스트

  // 해당 날짜의 Todo 필터링 (기간성 프로젝트는 기간 중 내내 포함시키고, 일반은 해당일만 포함. 주말/휴일(isOffDay)에는 프로젝트 배제)
  const dayTodos = useMemo(() => {
    const list = todos.filter(todo => {
      if (todo.isPeriod && todo.startDate && todo.endDate) {
        // 쉬는 날(주말/휴일)에는 프로젝트성 할 일을 제외!
        if (isOffDay) return false;

        // 기간성 프로젝트: 시작일과 종료일 사이에 selectedDate가 위치하는지 검사
        const start = dayjs(todo.startDate).startOf('day');
        const end = dayjs(todo.endDate).endOf('day');
        const current = selectedDate.startOf('day');
        return (current.isSame(start) || current.isAfter(start)) && 
               (current.isSame(end) || current.isBefore(end));
      } else {
        // 일반 할 일: dueDate(마감일)가 selectedDate와 일치하는지 검사
        const todoDue = dayjs(todo.dueDate).format('YYYY-MM-DD');
        return todoDue === dateStr;
      }
    });

    // 코스 할 일 추가
    if (!isOffDay && course) {
      const activeCourseTasks = courseTasks.filter(t => t.course === course);
      activeCourseTasks.forEach(task => {
        const key = `${dateStr}_${task.id}`;
        if (!excludedCourseTasks[key]) {
          list.push({
            id: `course-${task.id}-${dateStr}`,
            title: task.title,
            dueDate: dateStr,
            difficulty: task.difficulty,
            isRecurring: false,
            completed: !!completedCourseTasks[key],
            createdAt: dateStr,
            isCourseTask: true,
            courseTaskId: task.id,
            course: task.course,
          });
        }
      });
    }

    return list;
  }, [todos, selectedDate, isOffDay, dateStr, course, courseTasks, excludedCourseTasks, completedCourseTasks]);

  // 우선순위 1차 산출
  const priorityTodos = getTodosWithPriority(dayTodos);

  const recurringOrder: Record<string, number> = {
    daily: 1,
    weekly: 2,
    monthly: 3,
    custom: 4
  };

  // 2차 정렬: recurringType(매일 -> 매주 -> 매월 -> 사용자 지정 순)을 1순위로 올리고, 동일 주기 내에서 sortOrder 및 quadrant, 생성일 기준 정렬
  const sortedTodos = [...priorityTodos].sort((a, b) => {
    // 1순위: recurringType 정렬 (매일 -> 매주 -> 매월 -> 사용자 지정 순)
    const recA = a.isRecurring && a.recurringType ? (recurringOrder[a.recurringType] ?? 5) : 5;
    const recB = b.isRecurring && b.recurringType ? (recurringOrder[b.recurringType] ?? 5) : 5;
    if (recA !== recB) return recA - recB;

    // 2순위: 표시 순서 (반복은 그룹 단위 recurringGroupOrder, 단일은 인스턴스 sortOrder)
    const orderOf = (t: TodoWithPriority) =>
      t.isRecurring && t.recurringGroupId
        ? (recurringGroupOrder[t.recurringGroupId] ?? 99999)
        : (t.sortOrder ?? 99999);
    const orderA = orderOf(a);
    const orderB = orderOf(b);
    if (orderA !== orderB) return orderA - orderB;

    // 3순위: priorityRank (우선순위 사분면 랭크) 기준
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    
    // 최종 서브정렬: 생성일
    return a.createdAt.localeCompare(b.createdAt);
  });

  // 3대 차선(Lanes) 분류:
  // 1. 프로젝트성 할 일 (isPeriod: true) - 맨 위에 별도로 렌더링
  const projectTodos = sortedTodos.filter(t => t.isPeriod);
  // 2. 일반 미완료 할 일 (isPeriod: false 이면서 completed: false) - 드래그 재배치 가능
  const activeTodos = sortedTodos.filter(t => !t.isPeriod && !t.completed);
  // 3. 일반 완료된 할 일 (isPeriod: false 이면서 completed: true) - 완료 리스트로 격리
  const completedTodos = sortedTodos.filter(t => !t.isPeriod && t.completed);

  // 카테고리별 분류 (미완료 대상)
  const todayTodos = activeTodos.filter(t => !t.isRecurring);
  const customTodos = activeTodos.filter(t => t.isRecurring && t.recurringType === 'custom');
  const dailyTodos = activeTodos.filter(t => t.isRecurring && t.recurringType === 'daily');
  const weeklyTodos = activeTodos.filter(t => t.isRecurring && t.recurringType === 'weekly');
  const monthlyTodos = activeTodos.filter(t => t.isRecurring && t.recurringType === 'monthly');

  const displayTodayTodos = (draggedCategory === 'today' && dragList) ? dragList : todayTodos;
  const displayCustomTodos = (draggedCategory === 'custom' && dragList) ? dragList : customTodos;
  const displayDailyTodos = (draggedCategory === 'daily' && dragList) ? dragList : dailyTodos;
  const displayWeeklyTodos = (draggedCategory === 'weekly' && dragList) ? dragList : weeklyTodos;
  const displayMonthlyTodos = (draggedCategory === 'monthly' && dragList) ? dragList : monthlyTodos;

  // Calculate cumulative indexes for continuous sequential numbering (1, 2, 3...)
  let currentCount = 0;
  
  const todayWithIndex = displayTodayTodos.map(todo => {
    currentCount++;
    return { todo, index: currentCount };
  });

  const customWithIndex = displayCustomTodos.map(todo => {
    currentCount++;
    return { todo, index: currentCount };
  });

  const dailyWithIndex = displayDailyTodos.map(todo => {
    currentCount++;
    return { todo, index: currentCount };
  });

  const weeklyWithIndex = displayWeeklyTodos.map(todo => {
    currentCount++;
    return { todo, index: currentCount };
  });

  const monthlyWithIndex = displayMonthlyTodos.map(todo => {
    currentCount++;
    return { todo, index: currentCount };
  });
  // 완료율 계산을 위한 대상 할 일 필터링 (프로젝트는 마감 종료일(endDate)에만 포함)
  const eligibleTodos = dayTodos.filter(todo => {
    if (todo.isPeriod) {
      return todo.endDate === dateStr;
    }
    return true;
  });

  const completedCount = eligibleTodos.filter(t => t.completed).length;
  const totalCount = eligibleTodos.length;
  
  // 완료율 백분율 계산
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // 요일 색상 결정
  const getDayColor = () => {
    if (dayOfWeek === 0 || isHoliday) return '#ff4d4f'; // 일요일/휴일 = 빨강
    if (dayOfWeek === 6) return '#4096ff'; // 토요일 = 파랑
    return undefined;
  };

  const dayColor = getDayColor();

  // 삭제 요청 핸들러
  const handleDeleteRequest = (id: string) => {
    if (id.startsWith('course-')) {
      const courseTaskId = id.slice(7, -11);
      const dateStr = id.slice(-10);
      const title = dayTodos.find(t => t.id === id)?.title || '';
      setSelectedCourseTaskId(courseTaskId);
      setSelectedCourseTaskDate(dateStr);
      setSelectedCourseTaskTitle(title);
      setCourseDeleteModalOpen(true);
      return;
    }

    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    if (todo.isPeriod) {
      // 프로젝트(기간성 할 일) 삭제 시 경고 모달 한 번 더 띄움!
      Modal.confirm({
        title: (
          <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>
            ⚠️ 프로젝트 전체 삭제 경고
          </span>
        ),
        content: (
          <div style={{ marginTop: 8 }}>
            <p><strong>&quot;{todo.title}&quot;</strong> 프로젝트는 시작일(<strong>{todo.startDate}</strong>)부터 종료일(<strong>{todo.endDate}</strong>)까지 연결되어 있는 단일 프로젝트성 일정입니다.</p>
            <p style={{ color: '#ff4d4f', fontWeight: '500', marginTop: 10 }}>
              삭제하실 경우, 선택하신 날짜뿐만 아니라 전체 기간의 달력 및 상세 패널 목록에서 전체 삭제되어 복구할 수 없습니다.
            </p>
            <p style={{ marginTop: 8 }}>정말로 이 프로젝트 전체를 영구 삭제하시겠습니까?</p>
          </div>
        ),
        okText: '프로젝트 전체 삭제',
        cancelText: '취소',
        okButtonProps: { danger: true },
        onOk: () => {
          onDelete(id, 'single');
        },
      });
    } else if (todo.isRecurring && todo.recurringGroupId) {
      setSelectedTodoForDelete(todo);
      setDeleteModalOpen(true);
    } else {
      onDelete(id, 'single');
    }
  };

  // 모달 확인 완료 시
  const handleConfirmDelete = () => {
    if (selectedTodoForDelete) {
      onDelete(selectedTodoForDelete.id, deleteMode);
      setDeleteModalOpen(false);
      setSelectedTodoForDelete(null);
    }
  };

  // HTML5 Native Drag & Drop Handlers (일반 진행 중인 할 일 목록 실시간 재배치 및 애니메이션 대응)
  const handleDragStart = (e: React.DragEvent, index: number, category: string, currentList: TodoWithPriority[]) => {
    const item = currentList[index];
    if (item.isCourseTask) {
      e.preventDefault();
      return;
    }
    setDraggedIndex(index);
    setDraggedCategory(category);
    setDragList([...currentList]);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, hoverIndex: number, category: string) => {
    e.preventDefault(); // 드롭 허용
    if (draggedIndex === null || draggedCategory !== category || !dragList) return;
    if (draggedIndex === hoverIndex) return;

    // 실시간 배열 스왑!
    const newList = [...dragList];
    const [draggedItem] = newList.splice(draggedIndex, 1);
    newList.splice(hoverIndex, 0, draggedItem);

    setDragList(newList);
    setDraggedIndex(hoverIndex); // 드래그 인덱스를 호버 중인 인덱스로 실시간 전이
  };

  const handleDragEnd = () => {
    if (dragList && draggedCategory) {
      let newToday = todayTodos;
      let newCustom = customTodos;
      let newDaily = dailyTodos;
      let newWeekly = weeklyTodos;
      let newMonthly = monthlyTodos;

      if (draggedCategory === 'today') newToday = dragList;
      else if (draggedCategory === 'custom') newCustom = dragList;
      else if (draggedCategory === 'daily') newDaily = dragList;
      else if (draggedCategory === 'weekly') newWeekly = dragList;
      else if (draggedCategory === 'monthly') newMonthly = dragList;

      // 마우스를 뗐을 때(드래그 종료) 최종 순서 영구 저장 동기화!
      const orderedList = [
        ...projectTodos,
        ...newToday,
        ...newCustom,
        ...newDaily,
        ...newWeekly,
        ...newMonthly,
        ...completedTodos
      ].filter(t => !t.isCourseTask);

      // 단일(비반복) 일정은 인스턴스 sortOrder로 저장
      onReorderTodos(orderedList.map(t => t.id));

      // 반복 일정은 그룹 단위 순번으로 저장 (수천 개 인스턴스 재기록 방지)
      const groupOrder: Record<string, number> = {};
      let groupIndex = 0;
      for (const t of orderedList) {
        if (t.isRecurring && t.recurringGroupId && groupOrder[t.recurringGroupId] === undefined) {
          groupOrder[t.recurringGroupId] = groupIndex++;
        }
      }
      if (Object.keys(groupOrder).length > 0) {
        onReorderRecurringGroups(groupOrder);
      }
    }
    setDraggedIndex(null);
    setDraggedCategory(null);
    setDragList(null);
  };

  return (
    <div className="day-detail-panel">
      <div className="day-detail-header" style={{ borderBottom: 'none', paddingBottom: '4px' }}>
        <div className="day-detail-date-info">
          <Title
            level={4}
            className="day-detail-title"
            style={dayColor ? { color: `${dayColor} !important` } : undefined}
          >
            <span style={dayColor ? { color: dayColor } : undefined}>
              {selectedDate.format('YYYY-MM-DD (dd)')}
            </span>
            {course && (
              <span style={{
                marginLeft: '8px',
                fontSize: '14px',
                fontWeight: '900',
                backgroundColor: COURSE_COLORS[course],
                color: '#ffffff',
                padding: '2px 8px',
                borderRadius: '6px',
                verticalAlign: 'middle',
                display: 'inline-block'
              }}>
                {course}
              </span>
            )}
          </Title>
          <div className="day-detail-tags" style={{ marginTop: '4px' }}>
            {isToday && <Tag color="blue">오늘</Tag>}
            {isPast && !isToday && <Tag color="red">지난 날</Tag>}
            {isOffDay && (
              <Tag color={isHoliday ? 'red' : dayOfWeek === 0 ? 'red' : 'blue'}>
                {isHoliday ? '🔴 휴일' : dayOfWeek === 0 ? '일요일' : '토요일'}
              </Tag>
            )}
            {totalCount > 0 && (
              <Tag color="purple">{totalCount}개 할 일</Tag>
            )}
            {completedCount > 0 && (
              <Tag color="green">{completedCount}개 완료</Tag>
            )}
            {totalCount > 0 && (
              <Tag style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(217, 70, 239, 0.15))',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                color: '#e879f9',
                fontWeight: 'bold'
              }}>
                ✨ 완료율 {progressPercent}%
              </Tag>
            )}
          </div>
        </div>
      </div>

      {/* 프리미엄 완료율 진행 상태 프로그레스 바 */}
      {totalCount > 0 && (
        <div className="progress-bar-wrapper" style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div style={{
            width: '100%',
            height: '4px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #8b5cf6, #d946ef)',
              borderRadius: '2px',
              transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
            }} />
          </div>
        </div>
      )}

      {isOffDay && (
        <div className="day-detail-off-notice" style={{ marginTop: '0px', marginBottom: '12px' }}>
          <Text type="secondary" style={{ fontSize: '11px' }}>
            {isHoliday ? '🔴 지정된 휴일입니다' : '🚫 쉬는 날입니다'} — 반복 과제가 이 날은 건너뜁니다
          </Text>
        </div>
      )}

      <div className="day-detail-list" style={{ padding: '0 16px 16px 16px', overflowY: 'auto', flex: 1 }}>
        {totalCount === 0 ? (
          <Empty
            description={
              <Text className="empty-text">
                {isOffDay
                  ? '쉬는 날 — 등록된 할 일이 없습니다'
                  : '이 날짜에 등록된 할 일이 없습니다'}
              </Text>
            }
            className="day-detail-empty"
            style={{ marginTop: '40px' }}
          >
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={onAddTodo}
            >
              할 일 추가하기
            </Button>
          </Empty>
        ) : (
          <div className="todo-lanes-container">
            {/* 1. 최상단: 프로젝트성 할 일 (isPeriod: true) 섹션 */}
            {projectTodos.length > 0 && (
              <div className="todo-lane project-lane" style={{ marginBottom: '20px' }}>
                <div className="lane-header" style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    📅 프로젝트 ({projectTodos.length})
                  </span>
                </div>
                <div className="lane-content" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {projectTodos.map((todo, idx) => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      indexNumber={idx + 1} // 독립된 프로젝트 순서 번호 매김!
                      onToggleComplete={onToggleComplete}
                      onEdit={onEdit}
                      onDelete={handleDeleteRequest}
                      onUpdateDirectly={onUpdateDirectly}
                      onPostponeTodo={onPostponeTodo}
                      onPrePostponeTodo={onPrePostponeTodo}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 프로젝트 차선과 일반 진행중 사이의 은은한 구분선 */}
            {projectTodos.length > 0 && (activeTodos.length > 0 || completedTodos.length > 0) && (
              <div className="todo-lane-divider" style={{
                margin: '16px 0 20px 0',
                borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                width: '100%'
              }} />
            )}

            {/* 2. 일반 진행 중인 할 일 섹션 (카테고리별 분류) */}
            {activeTodos.length > 0 && (
              <div className="todo-lanes-categories-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 당일처리 */}
                {todayTodos.length > 0 && (
                  <div className="todo-lane active-lane today-lane">
                    <div className="lane-header" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        📌 당일처리 ({todayTodos.length})
                      </span>
                      <Text type="secondary" style={{ fontSize: '10px' }}>(드래그하여 순서 변경 가능)</Text>
                    </div>
                    <div className="lane-content" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {todayWithIndex.map(({ todo, index }, idx) => (
                        <TodoItem
                          key={todo.id}
                          todo={todo}
                          indexNumber={index}
                          onToggleComplete={onToggleComplete}
                          onEdit={onEdit}
                          onDelete={handleDeleteRequest}
                          onUpdateDirectly={onUpdateDirectly}
                          onOpenRecurringManager={onOpenRecurringManager}
                          onPostponeTodo={onPostponeTodo}
                          onPrePostponeTodo={onPrePostponeTodo}
                          dragProps={{
                            draggable: true,
                            onDragStart: (e: React.DragEvent) => handleDragStart(e, idx, 'today', displayTodayTodos),
                            onDragOver: (e: React.DragEvent) => handleDragOver(e, idx, 'today'),
                            onDragEnd: handleDragEnd,
                            style: {
                              opacity: (draggedCategory === 'today' && draggedIndex === idx) ? 0.3 : 1,
                              transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                              cursor: 'grab'
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* 기간별 반복 */}
                {customTodos.length > 0 && (
                  <div className="todo-lane active-lane custom-lane">
                    <div className="lane-header" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        🔁 기간별 반복 ({customTodos.length})
                      </span>
                      <Text type="secondary" style={{ fontSize: '10px' }}>(드래그하여 순서 변경 가능)</Text>
                    </div>
                    <div className="lane-content" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {customWithIndex.map(({ todo, index }, idx) => (
                        <TodoItem
                          key={todo.id}
                          todo={todo}
                          indexNumber={index}
                          onToggleComplete={onToggleComplete}
                          onEdit={onEdit}
                          onDelete={handleDeleteRequest}
                          onUpdateDirectly={onUpdateDirectly}
                          onOpenRecurringManager={onOpenRecurringManager}
                          onPostponeTodo={onPostponeTodo}
                          onPrePostponeTodo={onPrePostponeTodo}
                          dragProps={{
                            draggable: true,
                            onDragStart: (e: React.DragEvent) => handleDragStart(e, idx, 'custom', displayCustomTodos),
                            onDragOver: (e: React.DragEvent) => handleDragOver(e, idx, 'custom'),
                            onDragEnd: handleDragEnd,
                            style: {
                              opacity: (draggedCategory === 'custom' && draggedIndex === idx) ? 0.3 : 1,
                              transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                              cursor: 'grab'
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* 일별 반복 */}
                {dailyTodos.length > 0 && (
                  <div className="todo-lane active-lane daily-lane">
                    <div className="lane-header" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        📅 일별 반복 ({dailyTodos.length})
                      </span>
                      <Text type="secondary" style={{ fontSize: '10px' }}>(드래그하여 순서 변경 가능)</Text>
                    </div>
                    <div className="lane-content" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {dailyWithIndex.map(({ todo, index }, idx) => (
                        <TodoItem
                          key={todo.id}
                          todo={todo}
                          indexNumber={index}
                          onToggleComplete={onToggleComplete}
                          onEdit={onEdit}
                          onDelete={handleDeleteRequest}
                          onUpdateDirectly={onUpdateDirectly}
                          onOpenRecurringManager={onOpenRecurringManager}
                          onPostponeTodo={onPostponeTodo}
                          onPrePostponeTodo={onPrePostponeTodo}
                          dragProps={{
                            draggable: true,
                            onDragStart: (e: React.DragEvent) => handleDragStart(e, idx, 'daily', displayDailyTodos),
                            onDragOver: (e: React.DragEvent) => handleDragOver(e, idx, 'daily'),
                            onDragEnd: handleDragEnd,
                            style: {
                              opacity: (draggedCategory === 'daily' && draggedIndex === idx) ? 0.3 : 1,
                              transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                              cursor: 'grab'
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* 주별 반복 */}
                {weeklyTodos.length > 0 && (
                  <div className="todo-lane active-lane weekly-lane">
                    <div className="lane-header" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        🗓️ 주별 반복 ({weeklyTodos.length})
                      </span>
                      <Text type="secondary" style={{ fontSize: '10px' }}>(드래그하여 순서 변경 가능)</Text>
                    </div>
                    <div className="lane-content" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {weeklyWithIndex.map(({ todo, index }, idx) => (
                        <TodoItem
                          key={todo.id}
                          todo={todo}
                          indexNumber={index}
                          onToggleComplete={onToggleComplete}
                          onEdit={onEdit}
                          onDelete={handleDeleteRequest}
                          onUpdateDirectly={onUpdateDirectly}
                          onOpenRecurringManager={onOpenRecurringManager}
                          onPostponeTodo={onPostponeTodo}
                          onPrePostponeTodo={onPrePostponeTodo}
                          dragProps={{
                            draggable: true,
                            onDragStart: (e: React.DragEvent) => handleDragStart(e, idx, 'weekly', displayWeeklyTodos),
                            onDragOver: (e: React.DragEvent) => handleDragOver(e, idx, 'weekly'),
                            onDragEnd: handleDragEnd,
                            style: {
                              opacity: (draggedCategory === 'weekly' && draggedIndex === idx) ? 0.3 : 1,
                              transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                              cursor: 'grab'
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* 월별 반복 */}
                {monthlyTodos.length > 0 && (
                  <div className="todo-lane active-lane monthly-lane">
                    <div className="lane-header" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#ec4899', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        🗓️ 월별 반복 ({monthlyTodos.length})
                      </span>
                      <Text type="secondary" style={{ fontSize: '10px' }}>(드래그하여 순서 변경 가능)</Text>
                    </div>
                    <div className="lane-content" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {monthlyWithIndex.map(({ todo, index }, idx) => (
                        <TodoItem
                          key={todo.id}
                          todo={todo}
                          indexNumber={index}
                          onToggleComplete={onToggleComplete}
                          onEdit={onEdit}
                          onDelete={handleDeleteRequest}
                          onUpdateDirectly={onUpdateDirectly}
                          onOpenRecurringManager={onOpenRecurringManager}
                          onPostponeTodo={onPostponeTodo}
                          onPrePostponeTodo={onPrePostponeTodo}
                          dragProps={{
                            draggable: true,
                            onDragStart: (e: React.DragEvent) => handleDragStart(e, idx, 'monthly', displayMonthlyTodos),
                            onDragOver: (e: React.DragEvent) => handleDragOver(e, idx, 'monthly'),
                            onDragEnd: handleDragEnd,
                            style: {
                              opacity: (draggedCategory === 'monthly' && draggedIndex === idx) ? 0.3 : 1,
                              transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                              cursor: 'grab'
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 미완료와 완료 리스트 사이의 넉넉한 띄우기 여백 & 은은한 점선 구분선 */}
            {activeTodos.length > 0 && completedTodos.length > 0 && (
              <div className="todo-lane-divider" style={{
                margin: '24px 0 16px 0',
                borderTop: '1px dashed rgba(255, 255, 255, 0.08)',
                width: '100%'
              }} />
            )}

            {/* 3. 완료된 할 일 섹션 */}
            {completedTodos.length > 0 && (
              <div className="todo-lane completed-lane">
                <div className="lane-header" style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#52c41a' }}>✅ 완료됨 ({completedTodos.length})</span>
                </div>
                <div className="lane-content" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {completedTodos.map((todo, idx) => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      indexNumber={idx + 1} // 독립적으로 1부터 시작되는 완료 순서 번호!
                      onToggleComplete={onToggleComplete}
                      onEdit={onEdit}
                      onDelete={handleDeleteRequest}
                      onUpdateDirectly={onUpdateDirectly}
                      onOpenRecurringManager={onOpenRecurringManager}
                      onPostponeTodo={onPostponeTodo}
                      onPrePostponeTodo={onPrePostponeTodo}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 반복 과제 삭제 옵션 설정 모달 */}
      <Modal
        title={
          <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>
            <DeleteOutlined /> 반복 일정 삭제 설정
          </span>
        }
        open={deleteModalOpen}
        onOk={handleConfirmDelete}
        onCancel={() => setDeleteModalOpen(false)}
        okText="삭제 완료"
        cancelText="취소"
        okButtonProps={{ danger: true }}
        width={480}
      >
        <div style={{ marginTop: 16, marginBottom: 16 }}>
          <Text style={{ display: 'block', marginBottom: 16 }}>
            선택하신 <strong>&quot;{selectedTodoForDelete?.title}&quot;</strong>의 삭제 방식을 선택해 주세요.
          </Text>

          <Radio.Group
            value={deleteMode}
            onChange={(e) => setDeleteMode(e.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Radio value="single" className="delete-radio-option">
                <div>
                  <strong>이 일정만 삭제</strong>
                  <div style={{ fontSize: 11, color: 'var(--accent-purple, #a78bfa)', marginTop: 2 }}>
                    오직 선택한 날짜({selectedTodoForDelete?.dueDate})의 일정 하나만 지웁니다.
                  </div>
                </div>
              </Radio>

              <Radio value="future" className="delete-radio-option">
                <div>
                  <strong>오늘 포함한 모든 반복 일정 삭제 (과거 내역 보존)</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #8c8c8c)', marginTop: 2 }}>
                    과거에 완료했거나 진행했던 이력은 달력에 그대로 안전하게 보존하고, 오늘을 포함한 미래의 반복 일정만 정리합니다.
                  </div>
                </div>
              </Radio>

              <Radio value="all" className="delete-radio-option">
                <div>
                  <strong>전체 기간 삭제</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #8c8c8c)', marginTop: 2 }}>
                    과거 내역을 포함하여 이 반복 일정으로 생성된 모든 데이터를 지웁니다.
                  </div>
                </div>
              </Radio>
            </Space>
          </Radio.Group>


        </div>
      </Modal>

      {/* 코스 고정 업무 제외/삭제 선택 모달 */}
      <Modal
        title={
          <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>
            🗑️ 코스 업무 제외 / 삭제
          </span>
        }
        open={courseDeleteModalOpen}
        onCancel={() => setCourseDeleteModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setCourseDeleteModalOpen(false)}>
            취소
          </Button>,
          <Button
            key="exclude"
            type="primary"
            onClick={() => {
              if (selectedCourseTaskId && selectedCourseTaskDate) {
                onDelete(`course-${selectedCourseTaskId}-${selectedCourseTaskDate}`, 'single');
              }
              setCourseDeleteModalOpen(false);
            }}
          >
            오늘 하루만 제외
          </Button>,
          <Button
            key="delete"
            type="primary"
            danger
            onClick={() => {
              if (selectedCourseTaskId && selectedCourseTaskDate) {
                onDelete(`course-${selectedCourseTaskId}-${selectedCourseTaskDate}`, 'all');
              }
              setCourseDeleteModalOpen(false);
            }}
          >
            코스 설정에서 완전히 삭제
          </Button>
        ]}
      >
        <div style={{ marginTop: 16, marginBottom: 16 }}>
          <Text style={{ display: 'block' }}>
            <strong>&quot;{selectedCourseTaskTitle}&quot;</strong> 업무는 코스 고정 업무입니다. 이 일정을 오늘 하루만 제외하시겠습니까, 아니면 코스 설정에서 완전히 삭제하시겠습니까?
          </Text>
        </div>
      </Modal>
    </div>
  );
};

export default DayDetailPanel;
