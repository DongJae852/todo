import { useMemo } from 'react';
import { Calendar, Button, DatePicker } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { Todo, Holiday, CourseTask } from '../types/todo';
import { getCourseForDate } from '../utils/course';

interface TodoCalendarProps {
  todos: Todo[];
  selectedDate: Dayjs;
  onSelectDate: (date: Dayjs) => void;
  holidays: Holiday[];
  isHoliday: (date: string) => boolean;
  getHolidayReason: (date: string) => string;
  courseTasks: CourseTask[];
  completedCourseTasks: Record<string, boolean>;
  excludedCourseTasks: Record<string, boolean>;
}

const COURSE_COLORS = {
  A: '#8b5cf6',
  B: '#06b6d4',
  C: '#10b981',
  D: '#f59e0b',
  E: '#ec4899',
} as const;

const TodoCalendar: React.FC<TodoCalendarProps> = ({
  todos,
  selectedDate,
  onSelectDate,
  holidays: _holidays,
  isHoliday,
  getHolidayReason,
  courseTasks,
  completedCourseTasks,
  excludedCourseTasks,
}) => {

  // 날짜 스트링(YYYY-MM-DD)을 키로 하고, 그 날짜에 해당하는 투두 배열을 값으로 가지는 캐싱 맵 구축!
  const todosByDateMap = useMemo(() => {
    const map = new Map<string, Todo[]>();
    
    todos.forEach(todo => {
      // 1. 기간 과제(프로젝트성)일 때
      if (todo.isPeriod && todo.startDate && todo.endDate) {
        let start = dayjs(todo.startDate);
        const end = dayjs(todo.endDate);
        
        let safety = 0;
        while ((start.isBefore(end) || start.isSame(end, 'day')) && safety < 1826) { // 5년 한계
          const dateStr = start.format('YYYY-MM-DD');
          if (!map.has(dateStr)) {
            map.set(dateStr, []);
          }
          const arr = map.get(dateStr)!;
          if (!arr.some(t => t.id === todo.id)) {
            arr.push(todo);
          }
          
          start = start.add(1, 'day');
          safety++;
        }
      } else {
        // 2. 일반 단일 마감 기한 과제일 때
        const dateStr = todo.dueDate;
        if (!map.has(dateStr)) {
          map.set(dateStr, []);
        }
        const arr = map.get(dateStr)!;
        if (!arr.some(t => t.id === todo.id)) {
          arr.push(todo);
        }
      }
    });
    
    return map;
  }, [todos]);

  // 특정 날짜에 걸쳐 있는 할 일 리스트 추출 (사전 빌드된 캐시 맵에서 O(1)로 조회)
  const getTodosForDate = (date: Dayjs): Todo[] => {
    const dateStr = date.format('YYYY-MM-DD');
    const dayTodos = [...(todosByDateMap.get(dateStr) || [])];
    const cellIsOff = date.day() === 0 || date.day() === 6 || isHoliday(dateStr);

    if (cellIsOff) {
      // 주말이나 휴일인 칸에는 프로젝트(isPeriod) 일정을 배제하고 필터링!
      return dayTodos.filter(todo => !todo.isPeriod);
    }

    // 평일 근무일인 경우, 해당 날짜의 코스 할 일을 조회하여 추가
    const course = getCourseForDate(dateStr, _holidays);
    if (course) {
      const activeCourseTasks = courseTasks.filter(t => t.course === course);
      activeCourseTasks.forEach(task => {
        const key = `${dateStr}_${task.id}`;
        // 제외된 업무가 아닌 경우 임시 투두로 변합
        if (!excludedCourseTasks[key]) {
          dayTodos.push({
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

    return dayTodos;
  };

  /** 주말이거나 휴일인 날인지 확인 */
  const isOffDay = (date: Dayjs): boolean => {
    const day = date.day(); // 0=일, 6=토
    if (day === 0 || day === 6) return true;
    return isHoliday(date.format('YYYY-MM-DD'));
  };

  // 현재 선택된 월의 달력 뷰가 표현해야 할 총 주의 개수 계산 (4주, 5주, 6주)
  const totalWeeks = useMemo(() => {
    const startWeek = selectedDate.startOf('month').startOf('week');
    const endWeek = selectedDate.endOf('month').endOf('week');
    return endWeek.diff(startWeek, 'week') + 1;
  }, [selectedDate]);

  // 특정 날짜의 완료율(완료된 일 수 / 대상 일 수) 계산 (프로젝트는 종료 마감일(endDate)에만 포함)
  const getProgressForDate = (date: Dayjs, dayTodos: Todo[]) => {
    const dateStr = date.format('YYYY-MM-DD');

    // 계산용으로 필터링된 할 일 목록 구축
    const eligibleTodos = dayTodos.filter(todo => {
      if (todo.isPeriod) {
        // 프로젝트성 일정이면 endDate가 오늘인 경우에만 계산 대상에 포함!
        return todo.endDate === dateStr;
      }
      return true;
    });

    if (eligibleTodos.length === 0) return null;

    const completed = eligibleTodos.filter(t => t.completed).length;
    const total = eligibleTodos.length;
    const percent = Math.round((completed / total) * 100);

    return { completed, total, percent };
  };

  const dateCellRender = (date: Dayjs) => {
    const dayTodos = getTodosForDate(date);
    const offDay = isOffDay(date);
    const holidayFlag = isHoliday(date.format('YYYY-MM-DD'));
    const dateStr = date.format('YYYY-MM-DD');
    const progress = getProgressForDate(date, dayTodos);
    const course = getCourseForDate(dateStr, _holidays);

    // 기간 과제(배너형)와 일반 과제(점형)를 분리하여 배너형을 무조건 맨 위로 고정!
    const periodTodos = dayTodos.filter(t => t.isPeriod);
    const dotTodos = dayTodos.filter(t => !t.isPeriod);

    return (
      <div className={`calendar-cell-content ${offDay ? 'off-day-cell' : ''}`}>
        {(holidayFlag || progress || course) && (
          <div className="calendar-cell-header-badges">
            {course && (
              <span
                className="calendar-course-badge"
                style={{
                  color: '#ffffff',
                  background: COURSE_COLORS[course],
                  borderColor: COURSE_COLORS[course],
                  fontWeight: 'bold',
                  fontSize: '9px',
                  padding: '0px 4px',
                }}
              >
                {course}
              </span>
            )}
            {holidayFlag && (
              <span className="calendar-holiday-badge">
                🔴 {getHolidayReason(dateStr) || '휴일'}
              </span>
            )}
            {progress && (
              <span className={`calendar-progress-badge ${progress.percent === 100 ? 'all-done' : ''}`}>
                {progress.completed}/{progress.total} ({progress.percent}%)
              </span>
            )}
          </div>
        )}
        {dayTodos.length > 0 && (
          <div className="calendar-todos-scroll-area">
            {/* 1. 가로 연결 띠 배너 무조건 최상단 노출 */}
            {periodTodos.map(todo => {
              const isStart = todo.startDate === dateStr;
              const isEnd = todo.endDate === dateStr;
              const bannerColor = todo.completed ? '#8c8c8c' : '#52c41a';
              
              let bannerClass = 'project-banner-middle';
              if (isStart && isEnd) bannerClass = 'project-banner-single';
              else if (isStart) bannerClass = 'project-banner-start';
              else if (isEnd) bannerClass = 'project-banner-end';

              return (
                <div
                  key={todo.id}
                  className={`project-span-banner ${bannerClass} ${todo.completed ? 'completed-banner' : ''}`}
                  style={{
                    borderLeft: (isStart || (isStart && isEnd)) ? `3px solid ${bannerColor}` : 'none',
                    backgroundColor: todo.completed 
                      ? 'rgba(255, 255, 255, 0.05)' 
                      : `${bannerColor}22`, // 22: 투명도 13% 가량 투영 효과
                    borderColor: todo.completed ? 'rgba(255, 255, 255, 0.15)' : `${bannerColor}44`,
                  }}
                >
                  <span 
                    className="project-banner-title"
                    style={{
                      textDecoration: todo.completed ? 'line-through' : 'none',
                      color: todo.completed ? 'rgba(255, 255, 255, 0.35)' : 'var(--text-primary)',
                    }}
                  >
                    {todo.completed ? `✓ ${todo.title}` : todo.title}
                  </span>
                </div>
              );
            })}

            {/* 2. 일반 단일 할 일(점형)을 하단에 나열 */}
            {dotTodos.map(todo => {
              const isCourse = todo.isCourseTask && todo.courseTaskId;
              const dotColor = todo.completed
                ? 'rgba(255, 255, 255, 0.25)'
                : (isCourse && course ? COURSE_COLORS[course] : '#52c41a');

              return (
                <div key={todo.id} className="calendar-todo-item">
                  <span 
                    className="calendar-todo-dot"
                    style={{
                      backgroundColor: dotColor,
                    }}
                  />
                  <span 
                    className="calendar-todo-title"
                    style={{
                      textDecoration: todo.completed ? 'line-through' : 'none',
                      color: todo.completed ? 'rgba(255, 255, 255, 0.35)' : 'var(--text-secondary)',
                      fontStyle: todo.completed ? 'italic' : 'normal',
                    }}
                  >
                    {todo.completed ? `✓ ${todo.title}` : todo.title}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const cellRender = (current: Dayjs, info: { type: string }) => {
    if (info.type === 'date') return dateCellRender(current);
    return null;
  };

  const handleSelect = (date: Dayjs) => {
    onSelectDate(date);
  };

  return (
    <div className={`todo-calendar-wrapper weeks-${totalWeeks}`}>
      <Calendar
        value={selectedDate}
        onSelect={handleSelect}
        cellRender={cellRender}
        className="todo-calendar"
        headerRender={({ value, onChange }) => {
          const handlePrevMonth = () => {
            onChange(value.clone().subtract(1, 'month'));
          };

          const handleNextMonth = () => {
            onChange(value.clone().add(1, 'month'));
          };

          const handleMonthChange = (date: Dayjs | null) => {
            if (date) {
              onChange(date);
            }
          };

          return (
            <div className="todo-calendar-header">
              <div className="calendar-nav-controls">
                <Button 
                  icon={<LeftOutlined />} 
                  onClick={handlePrevMonth}
                  type="text" 
                  style={{ color: 'var(--text-secondary)' }}
                />
                
                <DatePicker
                  picker="month"
                  value={value}
                  onChange={handleMonthChange}
                  allowClear={false}
                  suffixIcon={null}
                  bordered={false}
                  className="calendar-header-title-btn"
                  format="YYYY-MM" // YYYY-MM 포맷으로 년월만 노출되게 수정!
                  inputReadOnly
                  style={{
                    textAlign: 'center',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    width: '110px',
                    backgroundColor: 'transparent',
                  }}
                />
                
                <Button 
                  icon={<RightOutlined />} 
                  onClick={handleNextMonth}
                  type="text"
                  style={{ color: 'var(--text-secondary)' }}
                />
              </div>

              <Button 
                onClick={() => {
                  onChange(dayjs());
                  onSelectDate(dayjs());
                }}
                className="calendar-today-btn"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: 'var(--text-primary)',
                  borderRadius: '6px',
                  fontWeight: '500',
                }}
              >
                오늘
              </Button>
            </div>
          );
        }}
      />
    </div>
  );
};

export default TodoCalendar;
