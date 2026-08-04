import { useState, useEffect } from 'react';
import { Modal, Input, Slider, Button, Typography, Space, message } from 'antd';
import { PlusOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import type { CourseTask, ChecklistItem } from '../types/todo';
import { resolveCourseTask } from '../utils/course';

const { Text } = Typography;

interface CourseTaskEditModalProps {
  open: boolean;
  onClose: () => void;
  task: CourseTask | null;
  dateStr: string; // 편집을 시작한 코스 인스턴스의 날짜 (적용 범위 계산 기준)
  onSave: (
    id: string,
    mode: 'single' | 'future' | 'all',
    dateStr: string,
    values: { title: string; difficulty: number; checklist?: ChecklistItem[] }
  ) => void;
}

const COURSE_COLORS = {
  A: '#8b5cf6',
  B: '#06b6d4',
  C: '#10b981',
  D: '#f59e0b',
  E: '#ec4899',
} as const;

const CourseTaskEditModal: React.FC<CourseTaskEditModalProps> = ({ open, onClose, task, dateStr, onSave }) => {
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState(5);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [scopeModalOpen, setScopeModalOpen] = useState(false);

  // 편집 대상이 바뀌면 해당 날짜에 적용되는 실제 값으로 폼 초기화
  useEffect(() => {
    if (task && open) {
      const resolved = resolveCourseTask(task, dateStr);
      setTitle(resolved.title);
      setDifficulty(resolved.difficulty);
      // 체크리스트는 구조만 사용 (완료상태는 일자별로 관리하므로 항상 false로 표시)
      setChecklist((resolved.checklist || []).map(item => ({ ...item, completed: false })));
      setNewItemText('');
      setScopeModalOpen(false);
    }
  }, [task, dateStr, open]);

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

  // 저장 클릭 → 적용 범위 선택 모달 오픈
  const handleSaveClick = () => {
    if (!task) return;
    if (!title.trim()) {
      message.warning('업무 제목을 입력해 주세요.');
      return;
    }
    setScopeModalOpen(true);
  };

  const handleConfirmScope = (mode: 'single' | 'future' | 'all') => {
    if (!task) return;
    const cleanedChecklist = checklist
      .map(item => ({ ...item, text: item.text.trim() }))
      .filter(item => item.text.length > 0);
    onSave(task.id, mode, dateStr, {
      title: title.trim(),
      difficulty,
      checklist: cleanedChecklist.length > 0 ? cleanedChecklist : undefined,
    });
    message.success('코스 업무가 수정되었습니다.');
    setScopeModalOpen(false);
    onClose();
  };

  return (
    <>
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
          <Button key="save" type="primary" onClick={handleSaveClick} style={{ background: color, borderColor: color }}>
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
              📋 세부 체크리스트 <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(완료 상태는 날짜별로 따로 기록됩니다.)</span>
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

      {/* 적용 범위 선택 모달 (반복 일정 수정과 동일한 UX) */}
      <Modal
        title="코스 업무 수정 범위 선택"
        open={scopeModalOpen}
        onCancel={() => setScopeModalOpen(false)}
        footer={null}
        width={400}
        destroyOnClose
        className="holiday-modal"
      >
        <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px' }}>
            이 코스 업무의 변경사항을 어디까지 적용하시겠습니까?
            <br />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>기준 날짜: {dateStr}</span>
          </p>
          <Button
            type="primary"
            onClick={() => handleConfirmScope('single')}
            style={{ height: '40px', background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', border: 'none', fontWeight: 'bold' }}
          >
            이 날짜만 수정
          </Button>
          <Button
            onClick={() => handleConfirmScope('future')}
            style={{ height: '40px', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', borderColor: 'var(--glass-border)' }}
          >
            이 날짜 및 향후 모든 일정 수정
          </Button>
          <Button
            onClick={() => handleConfirmScope('all')}
            style={{ height: '40px', background: 'rgba(3, 2, 2, 0.03)', color: 'var(--text-primary)', borderColor: 'var(--glass-border)' }}
          >
            전체 일정 수정
          </Button>
        </div>
      </Modal>
    </>
  );
};

export default CourseTaskEditModal;
