import { Drawer, Typography, Empty, Tag, Button, Popconfirm, Space } from 'antd';
import { HistoryOutlined, RetweetOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ChangeLogEntry } from '../types/todo';

const { Text } = Typography;

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  changeLogs: ChangeLogEntry[];
  onClearLogs: () => void;
  onDeleteLog: (id: string) => void;
}

const kindMeta: Record<ChangeLogEntry['kind'], { icon: React.ReactNode; label: string; color: string }> = {
  'recurring-reschedule': { icon: <RetweetOutlined />, label: '반복 요일·주기 변경', color: 'cyan' },
};

const SideDrawer: React.FC<SideDrawerProps> = ({ open, onClose, changeLogs, onClearLogs, onDeleteLog }) => {
  // 최신순 정렬
  const sorted = [...changeLogs].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Drawer
      title={
        <Space>
          <HistoryOutlined style={{ color: '#22d3ee' }} />
          <span>변경 이력 & 관리</span>
        </Space>
      }
      placement="right"
      width={380}
      open={open}
      onClose={onClose}
      className="side-drawer"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            🕘 일정 변경 이력 ({sorted.length})
          </Text>
          {sorted.length > 0 && (
            <Popconfirm
              title="변경 이력을 모두 삭제하시겠습니까?"
              onConfirm={onClearLogs}
              okText="전체 삭제"
              cancelText="취소"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" size="small" danger style={{ fontSize: '11px' }}>전체 삭제</Button>
            </Popconfirm>
          )}
        </div>

        {sorted.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>아직 기록된 변경 이력이 없습니다.</span>}
            style={{ marginTop: '24px' }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sorted.map(log => {
              const meta = kindMeta[log.kind];
              return (
                <div
                  key={log.id}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ minWidth: 0 }}>
                      <Text strong style={{ fontSize: '13px', color: '#fff', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.title}
                      </Text>
                      <Tag color={meta?.color} style={{ fontSize: '10px', marginTop: '4px' }} icon={meta?.icon}>
                        {meta?.label || log.kind}
                      </Tag>
                    </div>
                    <Popconfirm
                      title="이 이력을 삭제할까요?"
                      onConfirm={() => onDeleteLog(log.id)}
                      okText="삭제"
                      cancelText="취소"
                      okButtonProps={{ danger: true }}
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ flexShrink: 0 }} />
                    </Popconfirm>
                  </div>

                  <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {log.summary}
                  </div>
                  {log.detail && (
                    <div style={{ marginTop: '2px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>{log.detail}</div>
                  )}
                  <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <span>기준일: {log.effectiveFrom}</span>
                    <span>{dayjs(log.at).format('YYYY-MM-DD HH:mm')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Drawer>
  );
};

export default SideDrawer;
