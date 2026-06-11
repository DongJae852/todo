import { useMemo, useState, useEffect } from 'react';
import { Modal, Input, List, Button, Typography, Space, Tag, Empty } from 'antd';
import { SearchOutlined, CalendarOutlined, CheckOutlined, RedoOutlined, LeftOutlined, AimOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Todo } from '../types/todo';

const { Text } = Typography;

interface RecurringManagerModalProps {
  open: boolean;
  onClose: () => void;
  todos: Todo[];
  selectedGroupId: string | null;
  onJumpToDate: (dateStr: string) => void;
}

interface RecurringGroup {
  groupId: string;
  title: string;
  recurringType?: string;
  recurringDays?: number;
  instances: Todo[];
}

const recurringLabels: Record<string, string> = {
  daily: '매일 반복',
  weekly: '매주 반복',
  monthly: '매월 반복',
  custom: '사용자 지정 반복',
};

const getKoreanDayOfWeek = (dateStr: string) => {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[dayjs(dateStr).day()];
};

const formatKoreanDate = (dateStr: string) => `${dateStr}(${getKoreanDayOfWeek(dateStr)})`;

const RecurringManagerModal: React.FC<RecurringManagerModalProps> = ({
  open,
  onClose,
  todos,
  selectedGroupId,
  onJumpToDate,
}) => {
  const [search, setSearch] = useState('');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(30);

  const query = search.trim().toLowerCase();

  // ── 단일(비반복) 일정: 날짜순 정렬, 검색 필터 ──────────────────
  const singleTodos = useMemo(() => {
    return todos
      .filter(t => !t.isRecurring && !t.isCourseTask)
      .filter(t => !query || t.title.toLowerCase().includes(query))
      .sort((a, b) => {
        const da = a.isPeriod && a.startDate ? a.startDate : a.dueDate;
        const db = b.isPeriod && b.startDate ? b.startDate : b.dueDate;
        return da.localeCompare(db);
      });
  }, [todos, query]);

  // ── 반복 일정: 그룹화 ─────────────────────────────────────────
  const groups = useMemo<RecurringGroup[]>(() => {
    const map: Record<string, Todo[]> = {};
    todos.forEach(t => {
      if (t.isRecurring && t.recurringGroupId) {
        (map[t.recurringGroupId] ||= []).push(t);
      }
    });
    return Object.entries(map)
      .map(([groupId, insts]) => {
        const sorted = [...insts].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        return {
          groupId,
          title: sorted[0].title,
          recurringType: sorted[0].recurringType,
          recurringDays: sorted[0].recurringDays,
          instances: sorted,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [todos]);

  const filteredGroups = useMemo(
    () => groups.filter(g => !query || g.title.toLowerCase().includes(query)),
    [groups, query]
  );

  // 상위(투두 카드)에서 특정 그룹을 지정해 열면 해당 그룹 자동 선택
  useEffect(() => {
    if (open) {
      setActiveGroupId(selectedGroupId);
      setVisibleCount(30);
    }
  }, [open, selectedGroupId]);

  const activeGroup = useMemo(
    () => groups.find(g => g.groupId === activeGroupId) || null,
    [groups, activeGroupId]
  );

  const displayedInstances = useMemo(
    () => (activeGroup ? activeGroup.instances.slice(0, visibleCount) : []),
    [activeGroup, visibleCount]
  );

  const jump = (dateStr: string) => {
    onJumpToDate(dateStr);
    onClose();
  };

  const todayStr = dayjs().format('YYYY-MM-DD');

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e9d5ff' }}>
          <SearchOutlined style={{ color: '#06b6d4' }} />
          <span>일정 찾기 & 모니터링</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" type="primary" onClick={onClose} className="premium-btn">
          닫기
        </Button>,
      ]}
      width={560}
      centered
      className="premium-recurring-modal"
    >
      <div style={{ marginTop: '12px' }}>
        <Input
          allowClear
          size="large"
          prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.4)' }} />}
          placeholder="할 일 이름으로 검색 (단일·반복 모두)"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: '16px' }}
        />

        {/* 반복 그룹 상세 보기 모드 */}
        {activeGroup ? (
          <div>
            <Button
              type="text"
              icon={<LeftOutlined />}
              onClick={() => setActiveGroupId(null)}
              style={{ color: '#22d3ee', paddingLeft: 0, marginBottom: '8px' }}
            >
              목록으로
            </Button>
            <div
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text strong style={{ color: '#fff', fontSize: '15px' }}>{activeGroup.title}</Text>
              <Tag color="cyan" style={{ fontSize: '11px', fontWeight: 'bold' }}>
                {activeGroup.recurringType && recurringLabels[activeGroup.recurringType]}
                {activeGroup.recurringType === 'custom' && activeGroup.recurringDays
                  ? ` (${activeGroup.recurringDays}일 단위)` : ''}
              </Tag>
            </div>
            <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '8px' }}>
              📅 배정된 날짜 (클릭하면 그 날짜로 이동) · 총 {activeGroup.instances.length}개
            </Text>
            <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '8px', background: 'rgba(0,0,0,0.15)' }} className="custom-scroll-bar">
              <List
                dataSource={displayedInstances}
                renderItem={inst => {
                  const isToday = inst.dueDate === todayStr;
                  const isPast = dayjs(inst.dueDate).isBefore(dayjs(), 'day');
                  return (
                    <List.Item
                      onClick={() => jump(inst.dueDate)}
                      style={{ padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', marginBottom: '4px', background: isToday ? 'rgba(82,196,26,0.08)' : 'transparent', border: isToday ? '1px solid rgba(82,196,26,0.25)' : '1px solid transparent' }}
                    >
                      <Space>
                        {inst.completed
                          ? <CheckOutlined style={{ color: '#52c41a', fontSize: '12px' }} />
                          : <CalendarOutlined style={{ color: 'rgba(255,255,255,0.25)', fontSize: '12px' }} />}
                        <span style={{ fontSize: '13px', color: inst.completed ? 'rgba(255,255,255,0.35)' : '#f4f4f5', textDecoration: inst.completed ? 'line-through' : 'none', fontWeight: isToday ? 'bold' : 'normal' }}>
                          {formatKoreanDate(inst.dueDate)}
                        </span>
                        {isToday && <Tag color="green" style={{ fontSize: '10px' }}>오늘</Tag>}
                        {isPast && !isToday && <Tag style={{ fontSize: '10px', opacity: 0.6 }}>과거</Tag>}
                        {inst.completed && <Tag color="success" style={{ fontSize: '10px' }}>완료</Tag>}
                      </Space>
                    </List.Item>
                  );
                }}
              />
              {activeGroup.instances.length > visibleCount && (
                <Button type="dashed" onClick={() => setVisibleCount(v => v + 50)} style={{ width: '100%', marginTop: '8px', borderColor: 'rgba(6,182,212,0.3)', color: '#22d3ee', fontSize: '12px' }}>
                  더 보기 (+50개) · {visibleCount}/{activeGroup.instances.length}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* 단일 일정 섹션 */}
            <div style={{ marginBottom: '20px' }}>
              <Text style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#38bdf8', display: 'block', marginBottom: '8px' }}>
                📌 단일 일정 ({singleTodos.length})
              </Text>
              {singleTodos.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{query ? '검색 결과가 없습니다' : '등록된 단일 일정이 없습니다'}</span>} style={{ margin: '12px 0' }} />
              ) : (
                <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '6px', background: 'rgba(0,0,0,0.12)' }} className="custom-scroll-bar">
                  <List
                    dataSource={singleTodos}
                    renderItem={todo => {
                      const dateStr = todo.isPeriod && todo.startDate ? todo.startDate : todo.dueDate;
                      const isToday = dateStr === todayStr;
                      return (
                        <List.Item
                          onClick={() => jump(dateStr)}
                          style={{ padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', marginBottom: '4px', border: '1px solid transparent' }}
                          className="search-result-row"
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '8px' }}>
                            <Space size={6} style={{ minWidth: 0 }}>
                              {todo.completed
                                ? <CheckOutlined style={{ color: '#52c41a', fontSize: '12px' }} />
                                : <CalendarOutlined style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }} />}
                              <span style={{ fontSize: '13px', color: todo.completed ? 'rgba(255,255,255,0.4)' : '#f4f4f5', textDecoration: todo.completed ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {todo.title}
                              </span>
                              {todo.isPeriod && <Tag color="purple" style={{ fontSize: '9px' }}>프로젝트</Tag>}
                            </Space>
                            <Space size={4} style={{ flexShrink: 0 }}>
                              <Tag color={isToday ? 'green' : 'default'} style={{ fontSize: '11px', margin: 0 }}>
                                {todo.isPeriod && todo.startDate && todo.endDate
                                  ? `${todo.startDate} ~ ${todo.endDate}`
                                  : formatKoreanDate(dateStr)}
                              </Tag>
                              <AimOutlined style={{ color: '#22d3ee', fontSize: '12px' }} />
                            </Space>
                          </div>
                        </List.Item>
                      );
                    }}
                  />
                </div>
              )}
            </div>

            {/* 반복 일정 섹션 */}
            <div>
              <Text style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#22d3ee', display: 'block', marginBottom: '8px' }}>
                🔄 반복 일정 ({filteredGroups.length})
              </Text>
              {filteredGroups.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{query ? '검색 결과가 없습니다' : '등록된 반복 일정이 없습니다'}</span>} style={{ margin: '12px 0' }} />
              ) : (
                <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '6px', background: 'rgba(0,0,0,0.12)' }} className="custom-scroll-bar">
                  <List
                    dataSource={filteredGroups}
                    renderItem={g => (
                      <List.Item
                        onClick={() => { setActiveGroupId(g.groupId); setVisibleCount(30); }}
                        style={{ padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', marginBottom: '4px', border: '1px solid transparent' }}
                        className="search-result-row"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '8px' }}>
                          <Space size={6} style={{ minWidth: 0 }}>
                            <RedoOutlined style={{ color: '#06b6d4', fontSize: '12px' }} />
                            <span style={{ fontSize: '13px', color: '#f4f4f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                          </Space>
                          <Space size={4} style={{ flexShrink: 0 }}>
                            <Tag color="cyan" style={{ fontSize: '10px', margin: 0 }}>
                              {g.recurringType && recurringLabels[g.recurringType]}
                            </Tag>
                            <Text type="secondary" style={{ fontSize: '11px' }}>{g.instances.length}개</Text>
                          </Space>
                        </div>
                      </List.Item>
                    )}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default RecurringManagerModal;
