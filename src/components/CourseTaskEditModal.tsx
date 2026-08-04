import { useState, useEffect } from 'react';
import { Modal, Input, Slider, Button, Typography, Space, message } from 'antd';
import { PlusOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import type { CourseTask, ChecklistItem } from '../types/todo';

const { Text } = Typography;

interface CourseTaskEditModalProps {
  open: boolean;
  onClose: () => void;
  task: CourseTask | null;
  onSave: (id: string, updates: Partial<Omit<CourseTask, 'id' | 'course'>>) => void;
}

const COURSE_COLORS = {
  A: '#8b5cf6',
  B: '#06b6d4',
  C: '#10b981',
  D: '#f59e0b',
  E: '#ec4899',
} as const;

const CourseTaskEditModal: React.FC<CourseTaskEditModalProps> = ({ open, onClose, task, onSave }) => {
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState(5);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');

  // 편집 대상이 바뀌면 폼 상태 초기화
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDifficulty(task.difficulty);
      // 템플릿 체크리스트는 구조만 사용 (완료상태는 일자별로 관리하므로 항상 false로 표시)
      setChecklist((task.checklist || []).map(item => ({ ...item, completed: false })));
      setNewItemText('');
    }
  }, [task]);

  const color = task ? COURSE_COLORS[task.course] : '#8b5cf6';

  const handleAddItem = () => {
    const text = newItemText.trim();
    if (!text) return;
    setChecklist(prev => [...prev, { id: uuidv4(), text, completed: false }]);
    setNewItemText('');
  };

  const handleRemoveItem = (id: string) => {
    setChecklist(prev => prev.filter(item => item.id !== id));
  };

  const handleEditItemText = (id: string, text: string) => {
    setChecklist(prev => prev.map(item => (item.id === id ? { ...item, text } : item)));
  };

  const handleSave = () => {
    if (!task) return;
    if (!title.trim()) {
      message.warning('업무 제목을 입력해 주세요.');
      return;
    }
    const cleanedChecklist = checklist
      .map(item => ({ ...item, text: item.text.trim() }))
      .filter(item => item.text.length > 0);
    onSave(task.id, {
      title: title.trim(),
      difficulty,
      checklist: cleanedChecklist.length > 0 ? cleanedChecklist : undefined,
    });
    message.success('코스 업무가 수정되었습니다.');
    onClose();
  };

  return (
    <Modal
      title={
        <Space>
          <SettingOutlined style={{ color }} />
          <span>코스 업무 편집</span>
          {task && (
            <span style={{
              fontSize: '11px',
              fontWeight: 900,
              backgroundColor: color,
              color: '#fff',
              padding: '1px 7px',
              borderRadius: '4px',
            }}>
              {task.course}
            </span>
          )}
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>취소</Button>,
        <Button key="save" type="primary" onClick={handleSave} style={{ background: color, borderColor: color }}>
          저장
        </Button>,
      ]}
      width={520}
      className="holiday-modal"
      destroyOnClose
    >
      <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* 제목 */}
        <div>
          <Text style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            업무 제목
          </Text>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="업무 제목을 입력하세요"
          />
        </div>

        {/* 난이도 */}
        <div>
          <Text style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
            업무 난이도: <strong style={{ color }}>{difficulty}</strong> / 10
          </Text>
          <Slider
            min={1}
            max={10}
            value={difficulty}
            onChange={setDifficulty}
            marks={{ 1: '1', 5: '5', 10: '10' }}
            tooltip={{ formatter: (v) => `${v}/10` }}
            style={{ margin: '0 10px' }}
          />
        </div>

        {/* 세부 체크리스트 */}
        <div>
          <Text style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
            📋 세부 체크리스트 <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(이 코스가 도는 모든 날에 적용됩니다. 완료 상태는 날짜별로 따로 기록됩니다.)</span>
          </Text>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
            {checklist.map((item) => (
              <div key={item.id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Input
                  value={item.text}
                  onChange={(e) => handleEditItemText(item.id, e.target.value)}
                  placeholder="체크 항목 내용"
                  style={{ flex: 1 }}
                />
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveItem(item.id)}
                />
              </div>
            ))}
            {checklist.length === 0 && (
              <Text type="secondary" style={{ fontSize: '11.5px' }}>
                아직 등록된 세부 체크 항목이 없습니다.
              </Text>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Input
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onPressEnter={handleAddItem}
              placeholder="새 체크 항목을 입력하고 Enter"
              style={{ flex: 1 }}
            />
            <Button icon={<PlusOutlined />} onClick={handleAddItem} style={{ borderColor: color, color }}>
              추가
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default CourseTaskEditModal;
