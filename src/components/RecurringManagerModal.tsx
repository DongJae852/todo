import React, { useMemo, useState, useEffect } from 'react';
import { Modal, Select, List, Button, Typography, Space, Tag, Empty } from 'antd';
import { SyncOutlined, CalendarOutlined, CheckOutlined, InfoCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Todo } from '../types/todo';

const { Text } = Typography;

interface RecurringManagerModalProps {
  open: boolean;
  onClose: () => void;
  todos: Todo[];
  selectedGroupId: string | null;
}

interface RecurringGroup {
  groupId: string;
  isPeriod: boolean;
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
  const day = dayjs(dateStr).day();
  return days[day];
};

const formatKoreanDate = (dateStr: string) => {
  return `${dateStr}(${getKoreanDayOfWeek(dateStr)})`;
};

const RecurringManagerModal: React.FC<RecurringManagerModalProps> = ({
  open,
  onClose,
  todos,
  selectedGroupId,
}) => {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(30); // 렉 방지 페이징 슬라이스 수량

  // 일별 / 주별 / 월별 / 기간별 / 프로젝트 5대 분류 매핑
  const categorizedGroups = useMemo(() => {
    const daily: RecurringGroup[] = [];
    const weekly: RecurringGroup[] = [];
    const monthly: RecurringGroup[] = [];
    const period: RecurringGroup[] = [];
    const project: RecurringGroup[] = [];

    // 1. 일반 반복 과제 처리
    const recurringMap: Record<string, Todo[]> = {};
    todos.forEach(t => {
      if (t.isRecurring && t.recurringGroupId) {
        if (!recurringMap[t.recurringGroupId]) {
          recurringMap[t.recurringGroupId] = [];
        }
        recurringMap[t.recurringGroupId].push(t);
      }
    });

    Object.entries(recurringMap).forEach(([groupId, instances]) => {
      const sorted = [...instances].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const first = sorted[0];
      const groupData: RecurringGroup = {
        groupId,
        isPeriod: false,
        title: first.title,
        recurringType: first.recurringType,
        recurringDays: first.recurringDays,
        instances: sorted,
      };

      if (first.recurringType === 'daily') {
        daily.push(groupData);
      } else if (first.recurringType === 'weekly') {
        weekly.push(groupData);
      } else if (first.recurringType === 'monthly') {
        monthly.push(groupData);
      } else if (first.recurringType === 'custom') {
        period.push(groupData); // 커스텀 반복(예: n일 간격)은 기간별 영역에 병합!
      }
    });

    // 2. 기간성 프로젝트 처리 (isPeriod === true)
    const projectMap = new Map<string, Todo>();
    todos.forEach(t => {
      if (t.isPeriod && t.id) {
        projectMap.set(t.id, t);
      }
    });

    projectMap.forEach((todo) => {
      const instances: Todo[] = [];
      if (todo.startDate && todo.endDate) {
        let current = dayjs(todo.startDate);
        const end = dayjs(todo.endDate);
        let safety = 0;
        // 프로젝트 기간 중 일별 마감일을 가상 인스턴스로 자동 매핑
        while ((current.isBefore(end) || current.isSame(end, 'day')) && safety < 1000) {
          instances.push({
            ...todo,
            dueDate: current.format('YYYY-MM-DD'),
            completed: false, // 단순 조회용
          } as Todo);
          current = current.add(1, 'day');
          safety++;
        }
      }

      project.push({
        groupId: todo.id,
        isPeriod: true,
        title: todo.title,
        instances: instances.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      });
    });

    return { daily, weekly, monthly, period, project };
  }, [todos]);

  // 플랫하게 전체 그룹 리스트 뽑기 (조회용)
  const allGroups = useMemo<RecurringGroup[]>(() => {
    return [
      ...categorizedGroups.daily,
      ...categorizedGroups.weekly,
      ...categorizedGroups.monthly,
      ...categorizedGroups.period,
      ...categorizedGroups.project,
    ];
  }, [categorizedGroups]);

  // 상위 선택 트리거 연동 및 초기 그룹 설정
  useEffect(() => {
    if (open) {
      if (selectedGroupId) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveGroupId(selectedGroupId);
        setVisibleCount(30); // 페이징 초기화
      } else if (allGroups.length > 0) {
        if (!activeGroupId || !allGroups.some(g => g.groupId === activeGroupId)) {
          setActiveGroupId(allGroups[0].groupId);
          setVisibleCount(30);
        }
      } else {
        setActiveGroupId(null);
      }
    }
  }, [open, selectedGroupId, allGroups, activeGroupId]);

  const selectedGroup = useMemo(() => {
    return allGroups.find(g => g.groupId === activeGroupId);
  }, [allGroups, activeGroupId]);

  // 렉 방지용 페이징 슬라이스 데이터 추출
  const displayedInstances = useMemo<Todo[]>(() => {
    if (!selectedGroup) return [];
    return selectedGroup.instances.slice(0, visibleCount);
  }, [selectedGroup, visibleCount]);

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e9d5ff' }}>
          <SyncOutlined spin={open} style={{ color: '#06b6d4' }} />
          <span>🔄 반복 일정 모니터링</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" type="primary" onClick={onClose} className="premium-btn">
          닫기
        </Button>
      ]}
      width={550}
      centered
      className="premium-recurring-modal"
    >
      <div style={{ marginTop: '16px' }}>
        {allGroups.length === 0 ? (
          <Empty
            description={
              <span style={{ color: 'rgba(255, 255, 255, 0.45)' }}>
                등록된 반복 할 일 또는 기간성 프로젝트가 없습니다.
              </span>
            }
            style={{ margin: '32px 0' }}
          />
        ) : (
          <>
            <div style={{ marginBottom: '16px' }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
                📌 분류별 조회 대상 할 일 선택 (일별/주별/월별/기간별/프로젝트):
              </Text>
              <Select
                showSearch
                placeholder="조회할 할 일을 선택하거나 검색하세요"
                style={{ width: '100%' }}
                value={activeGroupId || undefined}
                onChange={(val) => {
                  setActiveGroupId(val);
                  setVisibleCount(30); // 페이징 초기화
                }}
                filterOption={(input, option) =>
                  String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                dropdownStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {categorizedGroups.daily.length > 0 && (
                  <Select.OptGroup label="📅 일별 반복">
                    {categorizedGroups.daily.map(g => (
                      <Select.Option key={g.groupId} value={g.groupId} label={g.title}>
                        {g.title} ({g.instances.length}개 예약)
                      </Select.Option>
                    ))}
                  </Select.OptGroup>
                )}
                {categorizedGroups.weekly.length > 0 && (
                  <Select.OptGroup label="📅 주별 반복">
                    {categorizedGroups.weekly.map(g => (
                      <Select.Option key={g.groupId} value={g.groupId} label={g.title}>
                        {g.title} ({g.instances.length}개 예약)
                      </Select.Option>
                    ))}
                  </Select.OptGroup>
                )}
                {categorizedGroups.monthly.length > 0 && (
                  <Select.OptGroup label="📅 월별 반복">
                    {categorizedGroups.monthly.map(g => (
                      <Select.Option key={g.groupId} value={g.groupId} label={g.title}>
                        {g.title} ({g.instances.length}개 예약)
                      </Select.Option>
                    ))}
                  </Select.OptGroup>
                )}
                {categorizedGroups.period.length > 0 && (
                  <Select.OptGroup label="📅 기간별 반복 (사용자 지정)">
                    {categorizedGroups.period.map(g => (
                      <Select.Option key={g.groupId} value={g.groupId} label={g.title}>
                        {g.title} ({g.instances.length}개 예약)
                      </Select.Option>
                    ))}
                  </Select.OptGroup>
                )}
                {categorizedGroups.project.length > 0 && (
                  <Select.OptGroup label="📅 프로젝트 일정">
                    {categorizedGroups.project.map(g => (
                      <Select.Option key={g.groupId} value={g.groupId} label={g.title}>
                        {g.title} ({g.instances.length}일 스케줄)
                      </Select.Option>
                    ))}
                  </Select.OptGroup>
                )}
              </Select>
            </div>

            {selectedGroup && (
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong style={{ color: '#ffffff', fontSize: '15px' }}>
                    {selectedGroup.title}
                  </Text>
                  <Tag color="cyan" style={{ fontSize: '11px', fontWeight: 'bold' }}>
                    {selectedGroup.isPeriod ? '프로젝트 일정' : (
                      selectedGroup.recurringType && recurringLabels[selectedGroup.recurringType]
                    )}
                    {!selectedGroup.isPeriod && selectedGroup.recurringType === 'custom' && selectedGroup.recurringDays
                      ? ` (${selectedGroup.recurringDays}일 단위)`
                      : ''}
                  </Tag>
                </div>
              </div>
            )}

            {selectedGroup && (
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
                  📅 배정된 전체 날짜 스케줄
                </Text>
                <div
                  style={{
                    maxHeight: '320px',
                    overflowY: 'auto',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '8px',
                    padding: '8px',
                    backgroundColor: 'rgba(0, 0, 0, 0.15)',
                  }}
                  className="custom-scroll-bar"
                >
                  <List
                    dataSource={displayedInstances}
                    locale={{ emptyText: '배정된 일정이 없습니다.' }}
                    renderItem={instance => {
                      const isPast = dayjs(instance.dueDate).isBefore(dayjs(), 'day');
                      const isToday = instance.dueDate === dayjs().format('YYYY-MM-DD');

                      return (
                        <List.Item
                          key={instance.id}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            backgroundColor: isToday ? 'rgba(82, 196, 26, 0.08)' : 'transparent',
                            border: isToday ? '1px solid rgba(82, 196, 26, 0.25)' : '1px solid transparent',
                            marginBottom: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Space>
                            {instance.completed ? (
                              <CheckOutlined style={{ color: '#52c41a', fontSize: '12px' }} />
                            ) : (
                              <CalendarOutlined style={{ color: 'rgba(255,255,255,0.25)', fontSize: '12px' }} />
                            )}
                            <span
                              style={{
                                fontSize: '13px',
                                fontWeight: isToday ? 'bold' : 'normal',
                                color: instance.completed
                                  ? 'rgba(255, 255, 255, 0.35)'
                                  : isToday
                                  ? '#52c41a'
                                  : '#f4f4f5',
                                textDecoration: instance.completed ? 'line-through' : 'none',
                              }}
                            >
                              {formatKoreanDate(instance.dueDate)}
                            </span>
                            {isToday && <Tag color="green" style={{ fontSize: '10px', height: '18px', display: 'inline-flex', alignItems: 'center' }}>오늘</Tag>}
                            {isPast && !isToday && <Tag color="default" style={{ fontSize: '10px', opacity: 0.6, height: '18px', display: 'inline-flex', alignItems: 'center' }}>과거</Tag>}
                            {instance.completed && <Tag color="success" style={{ fontSize: '10px', height: '18px', display: 'inline-flex', alignItems: 'center' }}>완료됨</Tag>}
                          </Space>
                        </List.Item>
                      );
                    }}
                  />

                  {/* 렉 방지 페이징 더 보기 버튼 */}
                  {selectedGroup.instances.length > visibleCount && (
                    <div style={{ textAlign: 'center', marginTop: '8px', padding: '4px' }}>
                      <Button
                        type="dashed"
                        onClick={() => setVisibleCount(prev => prev + 50)}
                        style={{
                          width: '100%',
                          borderColor: 'rgba(6, 182, 212, 0.3)',
                          color: '#22d3ee',
                          backgroundColor: 'transparent',
                          fontSize: '12px',
                        }}
                      >
                        더 보기 (+50개) (전체 {selectedGroup.instances.length}개 중 {visibleCount}개 표시 중)
                      </Button>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', padding: '0 4px' }}>
                  <InfoCircleOutlined style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }} />
                  <Text type="secondary" style={{ fontSize: '11px' }}>
                    이 모달은 조회 전용입니다. 완료 처리나 삭제는 달력 및 우측 투두 카드에서 진행해 주세요.
                  </Text>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default RecurringManagerModal;
