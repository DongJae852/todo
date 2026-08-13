import { useState, useEffect, useMemo } from 'react';
import { Modal, DatePicker, Radio, InputNumber, Button, Typography, Space, message } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { Todo, RecurringType } from '../types/todo';

const { Text } = Typography;

interface RescheduleGroup {
  groupId: string;
  title: string;
  recurringType?: string;
  recurringDays?: number;
  instances: Todo[];
}

interface RecurringRescheduleModalProps {
  open: boolean;
  onClose: () => void;
  group: RescheduleGroup | null;
  onConfirm: (params: {
    groupId: string;
    fromDate: string;
    newAnchor: string;
    newRecurringType: RecurringType;
    newRecurringDays?: number;
    summary: string;
    title: string;
  }) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const typeLabel: Record<string, string> = { daily: '매일', weekly: '매주', monthly: '매월', custom: '사용자 지정' };

// 규칙을 사람이 읽는 문구로
function describeRule(type: RecurringType, weekday: number, days: number, anchor: string): string {
  switch (type) {
    case 'daily': return '매일';
    case 'weekly': return `매주 ${WEEKDAYS[weekday]}요일`;
    case 'monthly': return `매월 ${dayjs(anchor).date()}일`;
    case 'custom': return `${days}일마다`;
    default: return '';
  }
}

const RecurringRescheduleModal: React.FC<RecurringRescheduleModalProps> = ({ open, onClose, group, onConfirm }) => {
  const [fromDate, setFromDate] = useState<Dayjs>(dayjs());
  const [newType, setNewType] = useState<RecurringType>('weekly');
  const [weekday, setWeekday] = useState<number>(1); // 0=일 ~ 6=토
  const [intervalDays, setIntervalDays] = useState<number>(7);

  // 현재 규칙 요약 (그룹의 가장 이른 인스턴스 기준)
  const current = useMemo(() => {
    if (!group || group.instances.length === 0) return null;
    const earliest = group.instances.reduce((a, b) => (a.dueDate < b.dueDate ? a : b));
    return {
      type: (group.recurringType || 'weekly') as RecurringType,
      weekday: dayjs(earliest.dueDate).day(),
      days: group.recurringDays || 7,
      anchor: earliest.dueDate,
    };
  }, [group]);

  // 모달이 열릴 때 기준일/현재 규칙으로 초기화
  useEffect(() => {
    if (open && group && current) {
      const todayStr = dayjs().format('YYYY-MM-DD');
      // 기준 날짜 기본값: 오늘 이후로 다가오는 첫 인스턴스, 없으면 오늘
      const upcoming = [...group.instances]
        .map(i => i.dueDate)
        .filter(d => d >= todayStr)
        .sort()[0];
      setFromDate(dayjs(upcoming || todayStr));
      setNewType(current.type);
      setWeekday(current.weekday);
      setIntervalDays(current.days || 7);
    }
  }, [open, group, current]);

  if (!group || !current) return null;

  // 선택한 규칙에 따른 새 첫 발생일(newAnchor) 계산
  const computeAnchor = (): string => {
    const base = fromDate.startOf('day');
    if (newType === 'weekly') {
      let d = base;
      for (let i = 0; i < 7; i++) {
        if (d.day() === weekday) return d.format('YYYY-MM-DD');
        d = d.add(1, 'day');
      }
      return base.format('YYYY-MM-DD');
    }
    // daily / monthly / custom 은 기준일부터 시작
    return base.format('YYYY-MM-DD');
  };

  const handleConfirm = () => {
    const fromStr = fromDate.format('YYYY-MM-DD');
    const newAnchor = computeAnchor();
    const beforeText = describeRule(current.type, current.weekday, current.days, current.anchor);
    const afterText = describeRule(newType, weekday, intervalDays, newAnchor);
    if (beforeText === afterText) {
      message.info('변경된 내용이 없습니다.');
      return;
    }
    const summary = `${beforeText} → ${afterText}`;
    onConfirm({
      groupId: group.groupId,
      fromDate: fromStr,
      newAnchor,
      newRecurringType: newType,
      newRecurringDays: newType === 'custom' ? intervalDays : undefined,
      summary,
      title: group.title,
    });
    onClose();
  };

  const previewAnchor = computeAnchor();
  const afterPreview = describeRule(newType, weekday, intervalDays, previewAnchor);

  return (
    <Modal
      title={
        <Space>
          <CalendarOutlined style={{ color: '#22d3ee' }} />
          <span>반복 요일 · 주기 변경</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>취소</Button>,
        <Button key="ok" type="primary" onClick={handleConfirm} style={{ background: '#06b6d4', borderColor: '#06b6d4' }}>
          변경 적용
        </Button>,
      ]}
      width={460}
      className="holiday-modal"
      destroyOnClose
    >
      <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '12px 14px' }}>
          <Text strong style={{ color: '#fff', fontSize: '14px' }}>{group.title}</Text>
          <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            현재: <strong style={{ color: '#a78bfa' }}>{describeRule(current.type, current.weekday, current.days, current.anchor)}</strong>
          </div>
        </div>

        <div>
          <Text style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            이 날짜부터 변경 (이전 일정은 그대로 보존됩니다)
          </Text>
          <DatePicker
            value={fromDate}
            onChange={(d) => d && setFromDate(d)}
            format="YYYY-MM-DD"
            allowClear={false}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <Text style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            새 반복 주기
          </Text>
          <Radio.Group value={newType} onChange={(e) => setNewType(e.target.value)} buttonStyle="solid" size="small">
            {(['daily', 'weekly', 'monthly', 'custom'] as RecurringType[]).map(t => (
              <Radio.Button key={t} value={t}>{typeLabel[t]}</Radio.Button>
            ))}
          </Radio.Group>
        </div>

        {newType === 'weekly' && (
          <div>
            <Text style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              반복 요일
            </Text>
            <Radio.Group value={weekday} onChange={(e) => setWeekday(e.target.value)} buttonStyle="solid" size="small">
              {WEEKDAYS.map((label, idx) => (
                <Radio.Button key={idx} value={idx}>{label}</Radio.Button>
              ))}
            </Radio.Group>
          </div>
        )}

        {newType === 'custom' && (
          <div>
            <Text style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              반복 간격 (일)
            </Text>
            <InputNumber min={2} max={365} value={intervalDays} onChange={(v) => setIntervalDays(v || 2)} addonAfter="일마다" style={{ width: '100%' }} />
          </div>
        )}

        <div style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: '10px', padding: '10px 14px', fontSize: '12.5px', color: 'var(--text-primary)' }}>
          <div>📌 <strong>{fromDate.format('YYYY-MM-DD')}</strong> 부터 → <strong style={{ color: '#22d3ee' }}>{afterPreview}</strong></div>
          <div style={{ marginTop: '4px', color: 'var(--text-secondary)', fontSize: '11.5px' }}>
            첫 적용일: {previewAnchor} · 이전 일정은 단일 일정으로 보존됩니다.
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default RecurringRescheduleModal;
