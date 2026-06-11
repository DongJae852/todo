import { useState, useEffect } from 'react';
import { Card, Checkbox, Tag, Typography, Tooltip, Popconfirm, Button, Progress, Space, Input, message } from 'antd';
import { EditOutlined, DeleteOutlined, RedoOutlined, SyncOutlined, ForwardOutlined, BackwardOutlined, HolderOutlined } from '@ant-design/icons';
import type { TodoWithPriority } from '../types/todo';
import type { Todo } from '../types/todo';
import dayjs from 'dayjs';

const { Text } = Typography;

interface TodoItemProps {
  todo: TodoWithPriority;
  onToggleComplete: (id: string) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (id: string) => void;
  onUpdateDirectly: (todo: Todo, mode?: 'single' | 'future' | 'all', selectedDate?: string) => void;
  indexNumber?: number;
  dragProps?: React.HTMLAttributes<HTMLDivElement>;
  reorderHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  onOpenRecurringManager?: (groupId: string) => void;
  onPostponeTodo?: (id: string) => void;
  onPrePostponeTodo?: (id: string) => void;
}

const recurringLabels: Record<string, string> = {
  daily: '매일',
  weekly: '매주',
  monthly: '매월',
  custom: '사용자 지정',
};

const COURSE_COLORS = {
  A: '#8b5cf6',
  B: '#06b6d4',
  C: '#10b981',
  D: '#f59e0b',
  E: '#ec4899',
} as const;

const TodoItem: React.FC<TodoItemProps> = ({
  todo,
  onToggleComplete,
  onEdit,
  onDelete,
  onUpdateDirectly,
  indexNumber,
  dragProps,
  reorderHandleProps,
  onOpenRecurringManager,
  onPostponeTodo,
  onPrePostponeTodo,
}) => {
  const daysLeft = dayjs(todo.dueDate).diff(dayjs().startOf('day'), 'day');
  const [dailyNoteText, setDailyNoteText] = useState(todo.dailyNote || '');

  // 외부(예: 복원 또는 모달 수정)에서 dailyNote가 바뀔 때 상태 동기화
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDailyNoteText(todo.dailyNote || '');
  }, [todo.dailyNote]);

  const getDaysLeftText = () => {
    if (daysLeft < 0) return `${Math.abs(daysLeft)}일 초과`;
    if (daysLeft === 0) return '오늘 마감';
    return `${daysLeft}일 남음`;
  };

  const getDaysLeftColor = () => {
    if (todo.completed) return '#8c8c8c';
    return '#52c41a';
  };

  // 메인 완료 체크 클릭 핸들러 (세부 체크리스트 검증 포함)
  const handleCheckboxChange = () => {
    if (!todo.completed && todo.checklist && todo.checklist.length > 0) {
      const incompleteCount = todo.checklist.filter(c => !c.completed).length;
      if (incompleteCount > 0) {
        message.warning({
          content: '⚠️ 세부 체크리스트를 모두 완료해야 해당 업무를 완료할 수 있습니다!',
          duration: 3.5,
          style: { marginTop: '10vh' }
        });
        return;
      }
    }
    onToggleComplete(todo.id);
  };

  // 세부 체크 항목 토글
  const handleToggleCheckItem = (itemId: string, checked: boolean) => {
    if (!todo.checklist) return;
    const updatedChecklist = todo.checklist.map(item =>
      item.id === itemId ? { ...item, completed: checked } : item
    );
    onUpdateDirectly({
      ...todo,
      checklist: updatedChecklist,
    }, 'single');
  };

  // 개별 메모 포커스 아웃 시 자동 저장
  const handleSaveDailyNote = () => {
    if (dailyNoteText.trim() === (todo.dailyNote || '')) return;
    onUpdateDirectly({
      ...todo,
      dailyNote: dailyNoteText.trim() || undefined,
    }, 'single');
  };

  return (
    <Card
      className={`todo-item-card ${todo.completed ? 'completed' : ''}`}
      style={{ borderLeftColor: todo.completed ? '#8c8c8c' : '#52c41a', cursor: dragProps ? 'grab' : 'default' }}
      size="small"
      {...dragProps}
    >
      <div className="todo-item-content">
        <div className="todo-item-left">
          <Checkbox
            checked={todo.completed}
            onChange={handleCheckboxChange}
          />
        </div>

        <div className="todo-item-center">
          <div className="todo-item-title-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {indexNumber !== undefined && (
              <span className="todo-index-badge" style={{
                background: todo.completed ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
                color: todo.completed ? 'rgba(255,255,255,0.35)' : '#ffffff',
                fontSize: '10px',
                fontWeight: 'bold',
                minWidth: '18px',
                height: '18px',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: todo.completed ? 'none' : '0 2px 5px rgba(139,92,246,0.3)',
                lineHeight: 1,
                flexShrink: 0,
              }}>
                {indexNumber}
              </span>
            )}
            {todo.isCourseTask && todo.course && (
              <span style={{
                fontSize: '10px',
                fontWeight: '900',
                backgroundColor: COURSE_COLORS[todo.course],
                color: '#ffffff',
                padding: '1px 6px',
                borderRadius: '4px',
                lineHeight: 1.4,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {todo.course}
              </span>
            )}
            <Text
              className={`todo-item-title ${todo.completed ? 'completed-text' : ''}`}
              strong
            >
              {todo.title}
            </Text>
          </div>
          <div className="todo-item-meta">
            <Text style={{ color: getDaysLeftColor(), fontSize: 12 }}>
              {todo.isPeriod ? `종료까지 ${getDaysLeftText()}` : getDaysLeftText()}
            </Text>
            {todo.isPeriod && todo.startDate && todo.endDate && (
              <Tag color="purple" style={{ fontSize: 11 }}>
                📅 {todo.startDate} ~ {todo.endDate}
              </Tag>
            )}
            {todo.isRecurring && todo.recurringType && (
              <Space size={4} style={{ display: 'inline-flex', alignItems: 'center' }}>
                <Tag icon={<RedoOutlined />} color="cyan" className="recurring-tag">
                  {recurringLabels[todo.recurringType]}
                  {todo.recurringType === 'custom' && todo.recurringDays
                    ? ` (${todo.recurringDays}일)`
                    : ''}
                </Tag>
                {onOpenRecurringManager && todo.recurringGroupId && (
                  <Tooltip title="반복 일정 모니터링">
                    <SyncOutlined
                      className="recurring-manager-shortcut-icon"
                      style={{ color: '#06b6d4', cursor: 'pointer', fontSize: '12px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenRecurringManager(todo.recurringGroupId!);
                      }}
                    />
                  </Tooltip>
                )}
              </Space>
            )}
          </div>
          <div className="todo-item-difficulty">
            <Text className="difficulty-label">난이도</Text>
            <Tooltip title={`${todo.difficulty}/10`}>
              <Progress
                percent={todo.difficulty * 10}
                steps={10}
                size="small"
                strokeColor={
                  todo.difficulty <= 3 ? '#52c41a' :
                  todo.difficulty <= 6 ? '#faad14' : '#ff4d4f'
                }
                showInfo={false}
                className="difficulty-bar"
              />
            </Tooltip>
          </div>
        </div>

        <div className="todo-item-right" style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
          {reorderHandleProps && (
            <div
              className="todo-drag-handle"
              {...reorderHandleProps}
              aria-label="순서 변경 핸들"
            >
              <HolderOutlined />
            </div>
          )}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {onPrePostponeTodo && !todo.completed && !todo.isCourseTask && (
              <Popconfirm
                title="이 할 일을 이전 근무일로 돌리시겠습니까?"
                onConfirm={() => onPrePostponeTodo(todo.id)}
                okText="확인"
                cancelText="취소"
              >
                <Tooltip title="이전 근무일로 돌리기">
                  <Button
                    type="text"
                    size="small"
                    icon={<BackwardOutlined />}
                    className="todo-action-btn postpone-btn"
                    style={{ color: '#fa8c16', padding: '0 4px' }}
                  />
                </Tooltip>
              </Popconfirm>
            )}

            {onPostponeTodo && !todo.completed && !todo.isCourseTask && (
              <Popconfirm
                title="이 할 일을 다음 근무일로 이전하시겠습니까?"
                onConfirm={() => onPostponeTodo(todo.id)}
                okText="확인"
                cancelText="취소"
              >
                <Tooltip title="다음 근무일로 이전">
                  <Button
                    type="text"
                    size="small"
                    icon={<ForwardOutlined />}
                    className="todo-action-btn postpone-btn"
                    style={{ color: '#a78bfa', padding: '0 4px' }}
                  />
                </Tooltip>
              </Popconfirm>
            )}
          </div>

          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <Tooltip title={todo.isCourseTask ? "코스 업무는 수정할 수 없습니다" : "편집"}>
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => onEdit(todo)}
                className="todo-action-btn"
                style={{ padding: '0 4px' }}
                disabled={todo.isCourseTask}
              />
            </Tooltip>
            {todo.isRecurring && todo.recurringGroupId ? (
              <Tooltip title="반복 삭제 옵션 선택">
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  danger
                  onClick={() => onDelete(todo.id)}
                  className="todo-action-btn"
                  style={{ padding: '0 4px' }}
                />
              </Tooltip>
            ) : todo.isCourseTask ? (
              <Tooltip title="코스 제외/삭제 옵션 선택">
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  danger
                  onClick={() => onDelete(todo.id)}
                  className="todo-action-btn"
                  style={{ padding: '0 4px' }}
                />
              </Tooltip>
            ) : (
              <Popconfirm
                title="이 할 일을 삭제하시겠습니까?"
                onConfirm={() => onDelete(todo.id)}
                okText="삭제"
                cancelText="취소"
              >
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  danger
                  className="todo-action-btn"
                  style={{ padding: '0 4px' }}
                />
              </Popconfirm>
            )}
          </div>
        </div>
      </div>

      {/* 세부 체크리스트 및 개별 메모 확장 영역 */}
      {(!todo.completed || (todo.checklist && todo.checklist.length > 0) || todo.dailyNote) && (
        <div style={{ 
          marginTop: '12px', 
          paddingTop: '12px', 
          borderTop: '1px solid rgba(255, 255, 255, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          {/* 1. 세부 체크리스트 */}
          {todo.checklist && todo.checklist.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                📋 세부 항목 완료 현황:
                <span style={{ color: '#a78bfa' }}>
                  {todo.checklist.filter(c => c.completed).length} / {todo.checklist.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '4px' }}>
                {todo.checklist.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Checkbox
                      checked={item.completed}
                      disabled={todo.completed}
                      onChange={(e) => handleToggleCheckItem(item.id, e.target.checked)}
                      style={{ fontSize: '12px', color: item.completed ? 'var(--text-secondary)' : 'var(--text-primary)' }}
                    >
                      <span style={{ textDecoration: item.completed ? 'line-through' : 'none' }}>
                        {item.text}
                      </span>
                    </Checkbox>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. 개별 일자별 메모 */}
          {!todo.completed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                📝 오늘만 기록할 메모:
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <Input.TextArea
                  placeholder="오늘 일정에만 해당하는 특별 사항/메모를 입력하세요"
                  autoSize={{ minRows: 1, maxRows: 3 }}
                  value={dailyNoteText}
                  onChange={(e) => setDailyNoteText(e.target.value)}
                  onBlur={handleSaveDailyNote}
                  style={{ 
                    fontSize: '11.5px', 
                    background: 'rgba(0,0,0,0.15)', 
                    borderColor: 'rgba(255,255,255,0.06)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>
            </div>
          )}
          
          {/* 완료 상태인 경우의 개별 메모 노출 */}
          {todo.completed && todo.dailyNote && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>📝 오늘의 개별 메모:</span>
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{todo.dailyNote}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default TodoItem;
