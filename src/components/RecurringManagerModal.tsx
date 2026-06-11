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

const recurringSectionLabels: Record<string, string> = {
  daily: '📅 매일 반복',
  weekly: '🗓️ 매주 반복',
  monthly: '🗓️ 매월 반복',
  custom: '🔁 사용자 지정',
};

const RECURRING_ORDER = ['daily', 'weekly', 'monthly', 'custom'] as const;

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
  const todayStr = dayjs().format('YYYY-MM-DD');

  // ── 단일(비반복) 일정 분류 ────────────────────────────────────
  const { projects, pendingSingles, completedSingles } = useMemo(() => {
    const matched = todos
      .filter(t => !t.isRecurring && !t.isCourseTask)
      .filter(t => !query || t.title.toLowerCase().includes(query));

    const projects = matched
      .filter(t => t.isPeriod)
      .sort((a, b) =>
        (Number(a.completed) - Number(b.completed)) ||
        ((a.startDate || a.dueDate).localeCompare(b.startDate || b.dueDate))
      );

    const regulars = matched.filter(t => !t.isPeriod);
    // 미완료: 날짜 오름차순 (지난 일정이 위로 → 먼저 처리)
    const pendingSingles = regulars
      .filter(t => !t.completed)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    // 완료: 최근 완료가 위로 (날짜 내림차순)
    const completedSingles = regulars
      .filter(t => t.completed)
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate));

    return { projects, pendingSingles, completedSingles };
  }, [todos, query]);

  // ── 반복 일정: 그룹화 + 타입별 분류(매일→매주→매월→사용자지정) ──
  const recurringSections = useMemo(() => {
    const map: Record<string, Todo[]> = {};
    todos.forEach(t => {
      if (t.isRecurring && t.recurringGroupId) {
        (map[t.recurringGroupId] ||= []).push(t);
      }
    });

    const groups: RecurringGroup[] = Object.entries(map).map(([groupId, insts]) => {
      const sorted = [...insts].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      return {
        groupId,
        title: sorted[0].title,
        recurringType: sorted[0].recurringType,
        recurringDays: sorted[0].recurringDays,
        instances: sorted,
      };
    });

    const filtered = groups.filter(g => !query || g.title.toLowerCase().includes(query));

    return RECURRING_ORDER
      .map(type => ({
        type,
        groups: filtered
          .filter(g => (g.recurringType || 'custom') === type)
          .sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .filter(section => section.groups.length > 0);
  }, [todos, query]);

  const recurringCount = recurringSections.reduce((sum, s) => sum + s.groups.length, 0);

  // 상위(투두 카드)에서 특정 그룹을 지정해 열면 해당 그룹 자동 선택
  useEffect(() => {
    if (open) {
      setActiveGroupId(selectedGroupId);
      setVisibleCount(30);
    }
  }, [open, selectedGroupId]);

  const activeGroup = useMemo(() => {
    if (!activeGroupId) return null;
    for (const section of recurringSections) {
      const found = section.groups.find(g => g.groupId === activeGroupId);
      if (found) return found;
    }
    return null;
  }, [recurringSections, activeGroupId]);

  const displayedInstances = useMemo(
    () => (activeGroup ? activeGroup.instances.slice(0, visibleCount) : []),
    [activeGroup, visibleCount]
  );

  const jump = (dateStr: string) => {
    onJumpToDate(dateStr);
    onClose();
  };

  // 단일 일정 한 행
  const renderSingleRow = (todo: Todo) => {
    const dateStr = todo.isPeriod && todo.startDate ? todo.startDate : todo.dueDate;
    const isToday = dateStr === todayStr;
    const isOverdue = !todo.completed && dayjs(todo.dueDate).isBefore(dayjs(), 'day');
    return (
      <List.Item
        key={todo.id}
        onClick={() => jump(dateStr)}
        className="search-result-row"
        style={{ padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', marginBottom: '4px', border: '1px solid transparent' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '8px' }}>
          <Space size={6} style={{ minWidth: 0 }}>
            {todo.completed
              ? <CheckOutlined style={{ color: '#52c41a', fontSize: '12px' }} />
              : <CalendarOutlined style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }} />}
            <span style={{ fontSize: '13px', color: todo.completed ? 'rgba(255,255,255,0.4)' : '#f4f4f5', textDecoration: todo.completed ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {todo.title}
            </span>
          </Space>
          <Space size={4} style={{ flexShrink: 0 }}>
            <Tag
              color={isToday ? 'green' : isOverdue ? 'error' : 'default'}
              style={{ fontSize: '11px', margin: 0 }}
            >
              {todo.isPeriod && todo.startDate && todo.endDate
                ? `${todo.startDate} ~ ${todo.endDate}`
                : formatKoreanDate(dateStr)}
            </Tag>
            <AimOutlined style={{ color: '#22d3ee', fontSize: '12px' }} />
          </Space>
        </div>
      </List.Item>
    );
  };

  // 반복 그룹 한 행
  const renderGroupRow = (g: RecurringGroup) => (
    <List.Item
      key={g.groupId}
      onClick={() => { setActiveGroupId(g.groupId); setVisibleCount(30); }}
      className="search-result-row"
      style={{ padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', marginBottom: '4px', border: '1px solid transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '8px' }}>
        <Space size={6} style={{ minWidth: 0 }}>
          <RedoOutlined style={{ color: '#06b6d4', fontSize: '12px' }} />
          <span style={{ fontSize: '13px', color: '#f4f4f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
        </Space>
        <Text type="secondary" style={{ fontSize: '11px', flexShrink: 0 }}>{g.instances.length}개</Text>
      </div>
    </List.Item>
  );

  const sectionLabelStyle: React.CSSProperties = { fontSize: '12.5px', fontWeight: 'bold', display: 'block', marginBottom: '8px' };
  const subLabelStyle: React.CSSProperties = { fontSize: '11px', color: 'rgba(255,255,255,0.45)', fontWeight: 'bold', display: 'block', margin: '8px 4px 4px' };
  const listBoxStyle: React.CSSProperties = { border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '6px', background: 'rgba(0,0,0,0.12)' };

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
        <Button key="close" type="primary" onClick={onClose} className="premium-btn">닫기</Button>,
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

        {activeGroup ? (
          /* 반복 그룹 상세 (배정 날짜) */
          <div>
            <Button type="text" icon={<LeftOutlined />} onClick={() => setActiveGroupId(null)} style={{ color: '#22d3ee', paddingLeft: 0, marginBottom: '8px' }}>
              목록으로
            </Button>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px', padding: '12px 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong style={{ color: '#fff', fontSize: '15px' }}>{activeGroup.title}</Text>
              <Tag color="cyan" style={{ fontSize: '11px', fontWeight: 'bold' }}>
                {activeGroup.recurringType && recurringLabels[activeGroup.recurringType]}
                {activeGroup.recurringType === 'custom' && activeGroup.recurringDays ? ` (${activeGroup.recurringDays}일 단위)` : ''}
              </Tag>
            </div>
            <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '8px' }}>
              📅 배정된 날짜 (클릭하면 그 날짜로 이동) · 총 {activeGroup.instances.length}개
            </Text>
            <div style={{ maxHeight: '320px', overflowY: 'auto', ...listBoxStyle }} className="custom-scroll-bar">
              <List
                dataSource={displayedInstances}
                renderItem={inst => {
                  const isToday = inst.dueDate === todayStr;
                  const isPast = dayjs(inst.dueDate).isBefore(dayjs(), 'day');
                  return (
                    <List.Item onClick={() => jump(inst.dueDate)} className="search-result-row" style={{ padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', marginBottom: '4px', background: isToday ? 'rgba(82,196,26,0.08)' : 'transparent', border: isToday ? '1px solid rgba(82,196,26,0.25)' : '1px solid transparent' }}>
                      <Space>
                        {inst.completed ? <CheckOutlined style={{ color: '#52c41a', fontSize: '12px' }} /> : <CalendarOutlined style={{ color: 'rgba(255,255,255,0.25)', fontSize: '12px' }} />}
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
            {/* 프로젝트 (맨 위) */}
            {projects.length > 0 && (
              <div style={{ marginBottom: '18px' }}>
                <Text style={{ ...sectionLabelStyle, color: '#38bdf8' }}>📅 프로젝트 ({projects.length})</Text>
                <div style={listBoxStyle} className="custom-scroll-bar">
                  <List dataSource={projects} renderItem={renderSingleRow} />
                </div>
              </div>
            )}

            {/* 단일 일정 (미완료 → 완료) */}
            <div style={{ marginBottom: '18px' }}>
              <Text style={{ ...sectionLabelStyle, color: '#38bdf8' }}>📌 단일 일정 ({pendingSingles.length + completedSingles.length})</Text>
              {pendingSingles.length === 0 && completedSingles.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{query ? '검색 결과가 없습니다' : '등록된 단일 일정이 없습니다'}</span>} style={{ margin: '12px 0' }} />
              ) : (
                <div style={{ maxHeight: '260px', overflowY: 'auto', ...listBoxStyle }} className="custom-scroll-bar">
                  {pendingSingles.length > 0 && (
                    <>
                      <Text style={subLabelStyle}>● 미완료 ({pendingSingles.length})</Text>
                      <List dataSource={pendingSingles} renderItem={renderSingleRow} />
                    </>
                  )}
                  {completedSingles.length > 0 && (
                    <>
                      <Text style={subLabelStyle}>✓ 완료 ({completedSingles.length})</Text>
                      <List dataSource={completedSingles} renderItem={renderSingleRow} />
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 반복 일정 (타입별 구분) */}
            <div>
              <Text style={{ ...sectionLabelStyle, color: '#22d3ee' }}>🔄 반복 일정 ({recurringCount})</Text>
              {recurringSections.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{query ? '검색 결과가 없습니다' : '등록된 반복 일정이 없습니다'}</span>} style={{ margin: '12px 0' }} />
              ) : (
                <div style={{ maxHeight: '280px', overflowY: 'auto', ...listBoxStyle }} className="custom-scroll-bar">
                  {recurringSections.map(section => (
                    <div key={section.type}>
                      <Text style={subLabelStyle}>{recurringSectionLabels[section.type]} ({section.groups.length})</Text>
                      <List dataSource={section.groups} renderItem={renderGroupRow} />
                    </div>
                  ))}
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
