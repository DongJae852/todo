import { useState } from 'react';
import {
  Modal,
  Tabs,
  Input,
  Slider,
  Button,
  List,
  Space,
  Typography,
  Popconfirm,
  message,
  Tooltip,
} from 'antd';
import { DeleteOutlined, SettingOutlined, PlusOutlined } from '@ant-design/icons';
import type { CourseTask } from '../types/todo';

const { Text, Title } = Typography;

interface CourseManagerModalProps {
  open: boolean;
  onClose: () => void;
  courseTasks: CourseTask[];
  onAddCourseTask: (task: Omit<CourseTask, 'id'>) => void;
  onRemoveCourseTask: (id: string) => void;
}

const COURSE_THEMES = {
  A: { color: '#8b5cf6', name: 'A 코스' },
  B: { color: '#06b6d4', name: 'B 코스' },
  C: { color: '#10b981', name: 'C 코스' },
  D: { color: '#f59e0b', name: 'D 코스' },
  E: { color: '#ec4899', name: 'E 코스' },
} as const;

type CourseKey = keyof typeof COURSE_THEMES;

const CourseManagerModal: React.FC<CourseManagerModalProps> = ({
  open,
  onClose,
  courseTasks,
  onAddCourseTask,
  onRemoveCourseTask,
}) => {
  const [activeTab, setActiveTab] = useState<CourseKey>('A');
  const [taskTitle, setTaskTitle] = useState('');
  const [difficulty, setDifficulty] = useState(5);

  const handleAddTask = () => {
    if (!taskTitle.trim()) {
      message.warning('업무 제목을 입력해 주세요.');
      return;
    }

    onAddCourseTask({
      title: taskTitle.trim(),
      course: activeTab,
      difficulty,
    });

    setTaskTitle('');
    setDifficulty(5);
    message.success(`${activeTab}코스에 업무가 추가되었습니다.`);
  };

  const filteredTasks = courseTasks.filter(t => t.course === activeTab);
  const themeInfo = COURSE_THEMES[activeTab];

  const difficultyMarks: Record<number, string> = {
    1: '1',
    5: '5',
    10: '10',
  };

  return (
    <Modal
      title={
        <Space>
          <SettingOutlined style={{ color: '#8b5cf6' }} />
          <span>코스 설정 및 업무 관리</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose} type="primary" block style={{ height: '40px' }}>
          설정 완료
        </Button>
      ]}
      width={650}
      className="holiday-modal"
      destroyOnClose
    >
      <div style={{ padding: '10px 0' }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: '16px', fontSize: '13px' }}>
          각 근무일에 돌아오는 코스(A, B, C, D, E)별로 고정적으로 발생할 업무를 설정합니다.<br />
          설정된 업무는 해당 코스의 근무일에 자동으로 투두 목록에 주입됩니다.
        </Text>

        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as CourseKey)}
          type="card"
          items={Object.entries(COURSE_THEMES).map(([key, info]) => {
            const courseKey = key as CourseKey;
            const count = courseTasks.filter(t => t.course === courseKey).length;
            return {
              key: courseKey,
              label: (
                <span style={{ color: activeTab === courseKey ? info.color : 'rgba(255,255,255,0.45)', fontWeight: 'bold' }}>
                  {info.name} ({count})
                </span>
              ),
            };
          })}
          style={{ marginBottom: '20px' }}
        />

        {/* 신규 업무 등록 영역 */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: `1px solid ${themeInfo.color}33`,
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '20px',
          transition: 'all 0.3s ease',
        }}>
          <Title level={5} style={{ margin: '0 0 12px 0', color: themeInfo.color, fontSize: '14px' }}>
            ⚡ {themeInfo.name} 신규 고정 업무 추가
          </Title>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <Input
                placeholder={`${themeInfo.name}일에 수행할 업무를 입력하세요 (예: 두산, 경산 수량 전달)`}
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                onPressEnter={handleAddTask}
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddTask}
                style={{
                  background: themeInfo.color,
                  borderColor: themeInfo.color,
                  fontWeight: 'bold',
                }}
              >
                추가
              </Button>
            </div>

            <div>
              <Text style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                업무 난이도: <strong style={{ color: themeInfo.color }}>{difficulty}</strong>
              </Text>
              <Slider
                min={1}
                max={10}
                value={difficulty}
                onChange={setDifficulty}
                marks={difficultyMarks}
                tooltip={{ formatter: (v) => `${v}/10` }}
                style={{ margin: '0 10px 10px 10px' }}
              />
            </div>
          </div>
        </div>

        {/* 기존 등록된 업무 리스트 */}
        <Title level={5} style={{ fontSize: '14px', margin: '0 0 10px 0', color: 'var(--text-primary)' }}>
          📋 등록된 고정 업무 목록 ({filteredTasks.length}개)
        </Title>

        <div style={{
          maxHeight: '260px',
          overflowY: 'auto',
          border: '1px solid var(--glass-border)',
          borderRadius: '12px',
          background: 'rgba(0,0,0,0.15)',
        }}>
          <List
            dataSource={filteredTasks}
            locale={{ emptyText: <Text type="secondary">등록된 고정 업무가 없습니다.</Text> }}
            renderItem={(task) => (
              <List.Item
                style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}
                actions={[
                  <Popconfirm
                    key="delete"
                    title="이 업무를 코스 설정에서 삭제하시겠습니까?"
                    onConfirm={() => {
                      onRemoveCourseTask(task.id);
                      message.success('코스 업무가 삭제되었습니다.');
                    }}
                    okText="삭제"
                    cancelText="취소"
                    okButtonProps={{ danger: true }}
                  >
                    <Tooltip title="삭제">
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        size="small"
                      />
                    </Tooltip>
                  </Popconfirm>
                ]}
              >
                <List.Item.Meta
                  title={
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>
                      {task.title}
                    </span>
                  }
                  description={
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      난이도: {task.difficulty} / 10
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      </div>
    </Modal>
  );
};

export default CourseManagerModal;
