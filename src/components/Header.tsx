import { useMemo } from 'react';
import { Typography, Badge, Button, Space, Tooltip } from 'antd';
import {
  PlusOutlined,
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  UnorderedListOutlined,
  CalendarOutlined,
  SyncOutlined,
  DatabaseOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { Todo } from '../types/todo';

const { Title } = Typography;

interface HeaderProps {
  todos: Todo[];
  onAddClick: () => void;
  onTestNotification: () => void;
  notificationPermission: NotificationPermission;
  onRequestPermission: () => void;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
  onHolidayClick: () => void;
  holidayCount: number;
  onRecurringClick: () => void;
  onBackupClick: () => void;
  onCourseClick: () => void;
  isSyncing?: boolean;
  syncError?: string | null;
}

const Header: React.FC<HeaderProps> = ({
  todos,
  onAddClick,
  onTestNotification,
  notificationPermission,
  onRequestPermission,
  notificationsEnabled,
  onToggleNotifications,
  onHolidayClick,
  holidayCount,
  onRecurringClick,
  onBackupClick,
  onCourseClick,
  isSyncing = false,
  syncError = null,
}) => {
  const totalCount = todos.length;
  const completedCount = useMemo(() => todos.filter(t => t.completed).length, [todos]);
  const pendingCount = totalCount - completedCount;

  return (
    <div className="app-header">
      <div className="header-left">
        <Title level={3} className="header-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <span className="header-emoji">📋</span> 동재 Todo
          {isSyncing ? (
            <Tooltip title="Firebase 동기화 중...">
              <SyncOutlined spin style={{ fontSize: '14px', color: '#a78bfa' }} />
            </Tooltip>
          ) : syncError ? (
            <Tooltip title={`동기화 오류: ${syncError}`}>
              <span style={{ fontSize: '14px', color: '#ff4d4f' }}>⚠️</span>
            </Tooltip>
          ) : (
            <Tooltip title="클라우드 동기화 완료">
              <span style={{ fontSize: '14px', color: '#10b981' }}>☁️</span>
            </Tooltip>
          )}
        </Title>
      </div>

      <div className="header-center">
        <Space size="large">
          <Tooltip title="전체 할 일">
            <Badge count={totalCount} showZero color="#8b5cf6" overflowCount={99}>
              <UnorderedListOutlined className="header-stat-icon" />
            </Badge>
          </Tooltip>
          <Tooltip title="진행 중">
            <Badge count={pendingCount} showZero color="#fa8c16" overflowCount={99}>
              <ClockCircleOutlined className="header-stat-icon" />
            </Badge>
          </Tooltip>
          <Tooltip title="완료">
            <Badge count={completedCount} showZero color="#52c41a" overflowCount={99}>
              <CheckCircleOutlined className="header-stat-icon" />
            </Badge>
          </Tooltip>
        </Space>
      </div>

      <div className="header-right">
        <Space>
          <Tooltip title="데이터 백업 및 복원">
            <Button
              icon={<DatabaseOutlined />}
              onClick={onBackupClick}
              className="header-btn"
              style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(236, 72, 153, 0.1))',
                borderColor: 'rgba(139, 92, 246, 0.25)',
                color: '#e9d5ff',
              }}
            >
              📥 백업 & 복원
            </Button>
          </Tooltip>
          <Tooltip title="코스 설정 및 업무 관리">
            <Button
              icon={<SettingOutlined />}
              onClick={onCourseClick}
              className="header-btn"
              style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(236, 72, 153, 0.15))',
                borderColor: 'rgba(139, 92, 246, 0.3)',
                color: '#a78bfa',
              }}
            >
              ⚙️ 코스 설정
            </Button>
          </Tooltip>
          <Tooltip title={`휴일 관리 (${holidayCount}일 등록됨)`}>
            <Button
              icon={<CalendarOutlined />}
              onClick={onHolidayClick}
              className="header-btn header-holiday-btn"
            >
              🗓 휴일
            </Button>
          </Tooltip>
          <Tooltip title="반복 일정 모니터링">
            <Button
              icon={<SyncOutlined />}
              onClick={onRecurringClick}
              className="header-btn header-recurring-btn"
              style={{
                background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(8b, 92, 246, 0.15))',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                color: '#22d3ee',
              }}
            >
              🔄 반복 모니터링
            </Button>
          </Tooltip>
          {!notificationsEnabled ? (
            <Tooltip title="알림이 꺼져 있습니다. 클릭하면 켜집니다">
              <Button
                icon={<BellOutlined />}
                onClick={onToggleNotifications}
                className="header-btn"
                style={{ color: 'var(--text-muted)', opacity: 0.7 }}
              >
                🔕 알림 꺼짐
              </Button>
            </Tooltip>
          ) : notificationPermission !== 'granted' ? (
            <Button
              icon={<BellOutlined />}
              onClick={onRequestPermission}
              className="header-btn"
            >
              알림 허용
            </Button>
          ) : (
            <Space size={4}>
              <Tooltip title="알림 테스트">
                <Button
                  icon={<BellOutlined />}
                  onClick={onTestNotification}
                  className="header-btn"
                >
                  🔔 테스트
                </Button>
              </Tooltip>
              <Tooltip title="알림 끄기">
                <Button
                  onClick={onToggleNotifications}
                  className="header-btn"
                  style={{ color: 'var(--text-muted)' }}
                >
                  끄기
                </Button>
              </Tooltip>
            </Space>
          )}
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={onAddClick}
            className="header-add-btn"
          >
            할 일 추가
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default Header;
