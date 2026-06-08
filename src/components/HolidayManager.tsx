import { useState } from 'react';
import {
  Modal,
  Calendar,
  Tag,
  Typography,
  Button,
  Empty,
  DatePicker,
  Input,
} from 'antd';
import { DeleteOutlined, CalendarOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { Holiday } from '../types/todo';

const { Title, Text } = Typography;

interface HolidayManagerProps {
  open: boolean;
  onClose: () => void;
  holidays: Holiday[];
  onAddHoliday: (date: string, reason?: string) => void;
  onRemoveHoliday: (date: string) => void;
}

const HolidayManager: React.FC<HolidayManagerProps> = ({
  open,
  onClose,
  holidays,
  onAddHoliday,
  onRemoveHoliday,
}) => {
  const [calendarValue, setCalendarValue] = useState<Dayjs>(dayjs());

  // 사용자가 직접 날짜 셀을 클릭한 경우에만 휴일 등록/삭제 처리!
  const handleSelect = (date: Dayjs, selectInfo?: { source: 'year' | 'month' | 'date' | 'customize' }) => {
    if (selectInfo && selectInfo.source !== 'date') {
      setCalendarValue(date);
      return;
    }
    const dateStr = date.format('YYYY-MM-DD');
    const isAlreadyHoliday = holidays.some(h => h.date === dateStr);

    if (isAlreadyHoliday) {
      onRemoveHoliday(dateStr);
    } else {
      // [신규 프리미엄 기능] 모던한 팝업을 통해 휴일 등록 사유를 입력받음!
      let reason = '';
      Modal.confirm({
        title: '🔴 휴일 등록 및 사유 지정',
        icon: <CalendarOutlined style={{ color: '#ff4d4f' }} />,
        content: (
          <div>
            <p style={{ marginBottom: 12, fontSize: '13px', color: 'rgba(255,255,255,0.65)' }}>
              지정된 휴일에는 날짜 텍스트가 빨간색으로 표시되며 반복 과제가 자동으로 건너뛰어집니다.
            </p>
            <Input
              id="holiday-reason-input"
              placeholder="휴일 사유를 입력하세요 (예: 전국지방선거)"
              onChange={(e) => { reason = e.target.value; }}
              maxLength={50}
              autoFocus
              style={{ marginTop: 4 }}
            />
          </div>
        ),
        okText: '등록',
        cancelText: '취소',
        className: 'holiday-confirm-modal',
        onOk() {
          onAddHoliday(dateStr, reason.trim());
        }
      });
    }
    setCalendarValue(date);
  };

  // 연도별로 그룹핑
  const groupedHolidays: Record<string, Holiday[]> = {};
  holidays.forEach(h => {
    const year = h.date.substring(0, 7); // YYYY-MM
    if (!groupedHolidays[year]) groupedHolidays[year] = [];
    groupedHolidays[year].push(h);
  });

  const dateCellRender = (date: Dayjs) => {
    const dateStr = date.format('YYYY-MM-DD');
    const isAlreadyHoliday = holidays.some(h => h.date === dateStr);
    if (isAlreadyHoliday) {
      return (
        <div className="holiday-calendar-mark">🔴</div>
      );
    }
    return null;
  };

  return (
    <Modal
      title={
        <span>
          <CalendarOutlined /> 휴일 관리
        </span>
      }
      open={open}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose} block>
          설정 닫기
        </Button>
      }
      width={700}
      className="holiday-modal"
    >
      <div className="holiday-content">
        <div className="holiday-left">
          <Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
            날짜를 클릭하여 휴일을 추가/제거하세요
          </Text>
          <div className="holiday-mini-calendar">
            <Calendar
              fullscreen={false}
              value={calendarValue}
              onSelect={handleSelect}
              cellRender={(current, info) => {
                if (info.type === 'date') return dateCellRender(current);
                return null;
              }}
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
                  <div className="todo-calendar-header" style={{ padding: '4px 8px 8px 8px', borderBottom: '1px solid var(--glass-border)', marginBottom: '8px' }}>
                    <Button 
                      icon={<LeftOutlined />} 
                      onClick={handlePrevMonth}
                      type="text" 
                      size="small"
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
                      format="YYYY년 M월"
                      inputReadOnly
                      style={{
                        textAlign: 'center',
                        fontSize: '15px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        padding: '2px 8px',
                      }}
                    />
                    
                    <Button 
                      icon={<RightOutlined />} 
                      onClick={handleNextMonth}
                      type="text"
                      size="small"
                      style={{ color: 'var(--text-secondary)' }}
                    />
                  </div>
                );
              }}
            />
          </div>
        </div>

        <div className="holiday-right">
          <Title level={5}>등록된 휴일 목록</Title>
          <div className="holiday-list">
            {holidays.length === 0 ? (
              <Empty description="등록된 휴일이 없습니다" />
            ) : (
              Object.entries(groupedHolidays).map(([yearMonth, dates]) => (
                <div key={yearMonth} className="holiday-group">
                  <Text type="secondary" className="holiday-group-title">
                    {dayjs(yearMonth + '-01').format('YYYY년 M월')}
                  </Text>
                  <div className="holiday-tags">
                    {dates.map(h => (
                      <Tag
                        key={h.date}
                        closable
                        onClose={() => onRemoveHoliday(h.date)}
                        className="holiday-tag"
                        closeIcon={<DeleteOutlined />}
                      >
                        {h.date} {h.reason ? `(${h.reason})` : ''}
                      </Tag>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default HolidayManager;
