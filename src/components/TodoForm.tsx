import { useEffect, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  DatePicker,
  Slider,
  Switch,
  Radio,
  InputNumber,
  Button,
  Space,
  Row,
  Col,
} from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { Todo, RecurringType, ChecklistItem } from '../types/todo';
import { DIFFICULTY_PRESETS } from '../types/todo';

interface TodoFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (todo: Omit<Todo, 'id' | 'completed' | 'completedAt' | 'createdAt'>) => void;
  onUpdate: (todo: Todo, mode?: 'single' | 'future' | 'all', selectedDate?: string) => void;
  editingTodo?: Todo | null;
  defaultDate?: Dayjs;
}

const TodoForm: React.FC<TodoFormProps> = ({
  open,
  onClose,
  onSubmit,
  onUpdate,
  editingTodo,
  defaultDate,
}) => {
  const [form] = Form.useForm();
  const isRecurring = Form.useWatch('isRecurring', form);
  const recurringType = Form.useWatch('recurringType', form);
  const isPeriod = Form.useWatch('isPeriod', form);

  // 세부 체크리스트 관련 상태
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newCheckItem, setNewCheckItem] = useState('');

  // 반복 일정 부분 수정을 위한 모달 상태 및 임시 저장 상태
  const [rangeModalOpen, setRangeModalOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingTodoData, setPendingTodoData] = useState<any>(null);

  useEffect(() => {
    if (open) {
      if (editingTodo) {
        form.setFieldsValue({
          title: editingTodo.title,
          description: editingTodo.description,
          isRecurring: editingTodo.isRecurring,
          recurringType: editingTodo.recurringType || 'daily',
          recurringDays: editingTodo.recurringDays || 2,
          isPeriod: editingTodo.isPeriod || false,
          difficulty: editingTodo.difficulty,
          dueDate: editingTodo.dueDate ? dayjs(editingTodo.dueDate) : undefined,
          periodStartDate: editingTodo.startDate ? dayjs(editingTodo.startDate) : undefined,
          periodEndDate: editingTodo.endDate ? dayjs(editingTodo.endDate) : undefined,
          holidayBehavior: editingTodo.holidayBehavior || 'next',
        });
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setChecklist(editingTodo.checklist ? [...editingTodo.checklist] : []);
      } else {
        form.resetFields();
        setChecklist([]);
        if (defaultDate) {
          form.setFieldsValue({ 
            dueDate: defaultDate,
            periodStartDate: defaultDate,
            periodEndDate: defaultDate.add(2, 'day'), // 기간 설정 켜졌을 때 기본값
          });
        }
      }
      setNewCheckItem('');
    }
  }, [open, editingTodo, defaultDate, form]);

  const handleAddCheckItem = () => {
    if (!newCheckItem.trim()) return;
    const newItem: ChecklistItem = {
      id: uuidv4(),
      text: newCheckItem.trim(),
      completed: false,
    };
    setChecklist([...checklist, newItem]);
    setNewCheckItem('');
  };

  const handleRemoveCheckItem = (itemId: string) => {
    setChecklist(checklist.filter(item => item.id !== itemId));
  };

  const handleFinish = (values: {
    title: string;
    description?: string;
    dueDate?: Dayjs;
    periodStartDate?: Dayjs;
    periodEndDate?: Dayjs;
    difficulty: number;
    isRecurring: boolean;
    recurringType?: RecurringType;
    recurringDays?: number;
    isPeriod?: boolean;
    holidayBehavior?: 'next' | 'prev' | 'keep';
  }) => {
    let startDate: string | undefined = undefined;
    let endDate: string | undefined = undefined;
    let dueDateStr: string;

    if (values.isRecurring) {
      // 반복 과제일 때
      dueDateStr = values.dueDate ? values.dueDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    } else if (values.isPeriod && values.periodStartDate && values.periodEndDate) {
      // 기간 설정이 켜져있을 때
      startDate = values.periodStartDate.format('YYYY-MM-DD');
      endDate = values.periodEndDate.format('YYYY-MM-DD');
      dueDateStr = endDate; // 마감 기한은 종료일 역할을 대체
    } else {
      // 일반 일회성 할 일일 때
      dueDateStr = values.dueDate ? values.dueDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    }

    const todoData = {
      title: values.title,
      description: values.description,
      dueDate: dueDateStr,
      startDate,
      endDate,
      isPeriod: !values.isRecurring && (values.isPeriod || false),
      difficulty: values.difficulty,
      isRecurring: values.isRecurring || false,
      recurringType: values.isRecurring ? values.recurringType : undefined,
      recurringDays: values.isRecurring && values.recurringType === 'custom'
        ? values.recurringDays
        : undefined,
      holidayBehavior: values.isRecurring ? (values.holidayBehavior || 'next') : undefined,
      checklist, // 세부 체크리스트 추가
    };

    if (editingTodo) {
      if (editingTodo.isRecurring && editingTodo.recurringGroupId) {
        // 반복 일정인 경우 수정 범위 모달 띄우기
        setPendingTodoData(todoData);
        setRangeModalOpen(true);
      } else {
        onUpdate({
          ...editingTodo,
          ...todoData,
        });
        onClose();
      }
    } else {
      onSubmit(todoData);
      onClose();
    }
  };

  const handleConfirmRangeUpdate = (mode: 'single' | 'future' | 'all') => {
    if (!editingTodo || !pendingTodoData) return;
    onUpdate(
      {
        ...editingTodo,
        ...pendingTodoData,
      },
      mode,
      editingTodo.dueDate
    );
    setRangeModalOpen(false);
    setPendingTodoData(null);
    onClose();
  };

  const difficultyMarks: Record<number, string> = {
    1: '1',
    2: '',
    3: '',
    4: '',
    5: '5',
    6: '',
    7: '',
    8: '',
    9: '',
    10: '10',
  };

  return (
    <>
      <Modal
      title={editingTodo ? '✏️ 할 일 수정' : '➕ 새 할 일 추가'}
      open={open}
      onCancel={onClose}
      footer={null}
      className="todo-form-modal"
      width={800}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{
          difficulty: 5,
          isRecurring: false,
          recurringType: 'daily',
          recurringDays: 2,
          isPeriod: false,
          holidayBehavior: 'next',
        }}
      >
        <Row gutter={24}>
          {/* 왼쪽 컬럼: 제목 및 대형 상세 설명 */}
          <Col xs={24} md={13}>
            <Form.Item
              name="title"
              label="할 일 제목"
              rules={[{ required: true, message: '제목을 입력해주세요' }]}
            >
              <Input placeholder="무엇을 해야 하나요?" maxLength={100} />
            </Form.Item>

            <Form.Item name="description" label="상세 설명 (선택)">
              <Input.TextArea
                placeholder="상세 내용을 입력하세요 (10~15줄 입력 가능)"
                rows={12}
                maxLength={500}
                style={{ resize: 'none' }}
              />
            </Form.Item>

            {/* 세부 체크리스트 편집 영역 */}
            <div style={{ 
              marginTop: '12px',
              background: 'rgba(255, 255, 255, 0.01)', 
              border: '1px solid var(--glass-border)', 
              borderRadius: '12px', 
              padding: '16px' 
            }}>
              <div style={{ marginBottom: '12px', fontWeight: 'bold', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📋 세부 체크리스트 (선택)
              </div>
              
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <Input 
                  placeholder="추가할 세부 항목을 입력하세요" 
                  value={newCheckItem}
                  onChange={(e) => setNewCheckItem(e.target.value)}
                  onPressEnter={(e) => {
                    e.preventDefault();
                    handleAddCheckItem();
                  }}
                  maxLength={80}
                />
                <Button type="dashed" onClick={handleAddCheckItem}>추가</Button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                {checklist.map((item, index) => (
                  <div key={item.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '6px 12px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '8px'
                  }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                      {index + 1}. {item.text}
                    </span>
                    <Button 
                      type="text" 
                      danger 
                      size="small" 
                      icon={<DeleteOutlined />} 
                      onClick={() => handleRemoveCheckItem(item.id)}
                    />
                  </div>
                ))}
                {checklist.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                    등록된 세부 체크 항목이 없습니다.
                  </div>
                )}
              </div>
            </div>
          </Col>

          {/* 오른쪽 컬럼: 각종 설정 메타데이터 */}
          <Col xs={24} md={11}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              {/* 반복/기간 설정 카드 */}
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.02)', 
                border: '1px solid var(--glass-border)', 
                borderRadius: '12px', 
                padding: '14px'
              }}>
                <Form.Item
                  name="isRecurring"
                  label="반복 과제 여부"
                  valuePropName="checked"
                  style={{ marginBottom: isRecurring ? 12 : 0 }}
                >
                  <Switch 
                    checkedChildren="반복 업무" 
                    unCheckedChildren="일회성 업무" 
                    onChange={(checked) => {
                      if (checked) {
                        form.setFieldValue('isPeriod', false); // 반복 과제 켜지면 기간 설정은 강제 오프
                      }
                    }}
                  />
                </Form.Item>

                {isRecurring && (
                  <>
                    <Form.Item
                      name="recurringType"
                      label="반복 주기"
                      rules={[{ required: true, message: '반복 주기를 선택해주세요' }]}
                      style={{ marginBottom: 12 }}
                    >
                      <Radio.Group size="small" buttonStyle="solid">
                        <Radio.Button value="daily">매일</Radio.Button>
                        <Radio.Button value="weekly">매주</Radio.Button>
                        <Radio.Button value="monthly">매월</Radio.Button>
                        <Radio.Button value="custom">직접 지정</Radio.Button>
                      </Radio.Group>
                    </Form.Item>

                    {recurringType === 'custom' && (
                      <Form.Item
                        name="recurringDays"
                        label="반복 간격 (일)"
                        rules={[{ required: true, message: '반복 간격을 입력해주세요' }]}
                        style={{ marginBottom: 12 }}
                        extra={<span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>💡 주 단위로 하려면 7의 배수 (예: 3주마다 = 21일). 같은 요일에 떨어집니다.</span>}
                      >
                        <InputNumber
                          min={2}
                          max={365}
                          addonAfter="일마다"
                          style={{ width: '100%' }}
                          size="small"
                        />
                      </Form.Item>
                    )}

                    <Form.Item
                      name="holidayBehavior"
                      label="💡 주말·휴일에 걸릴 때"
                      style={{ marginBottom: 0 }}
                      extra={<span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>토요일/일요일에 반복하려면 "그대로 유지"를 선택하세요.</span>}
                    >
                      <Radio.Group size="small" buttonStyle="solid">
                        <Radio.Button value="next">다음 근무일</Radio.Button>
                        <Radio.Button value="prev">직전 근무일</Radio.Button>
                        <Radio.Button value="keep">그대로 유지</Radio.Button>
                      </Radio.Group>
                    </Form.Item>
                  </>
                )}

                {!isRecurring && (
                  <Form.Item
                    name="isPeriod"
                    label="프로젝트 기간 설정 (시작일 ~ 종료일)"
                    valuePropName="checked"
                    style={{ marginBottom: 0 }}
                  >
                    <Switch checkedChildren="기간 적용" unCheckedChildren="하루 마감" />
                  </Form.Item>
                )}
              </div>

              {/* 날짜 선택 카드 */}
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.02)', 
                border: '1px solid var(--glass-border)', 
                borderRadius: '12px', 
                padding: '14px'
              }}>
                {isRecurring ? (
                  <Form.Item
                    name="dueDate"
                    label="반복 시작일"
                    rules={[{ required: true, message: '반복 시작일을 선택해주세요' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <DatePicker
                      style={{ width: '100%' }}
                      placeholder="반복 시작일 선택"
                      format="YYYY-MM-DD"
                    />
                  </Form.Item>
                ) : isPeriod ? (
                  <Form.Item
                    label="진행 기간 (시작일 ~ 종료일)"
                    required
                    style={{ marginBottom: 0 }}
                  >
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <Form.Item
                        name="periodStartDate"
                        rules={[{ required: true, message: '시작일을 선택해주세요' }]}
                        style={{ margin: 0, flex: 1 }}
                      >
                        <DatePicker
                          style={{ width: '100%' }}
                          placeholder="시작일"
                          format="YYYY-MM-DD"
                        />
                      </Form.Item>
                      <span style={{ color: 'var(--text-secondary)' }}>~</span>
                      <Form.Item
                        name="periodEndDate"
                        rules={[{ required: true, message: '종료일을 선택해주세요' }]}
                        style={{ margin: 0, flex: 1 }}
                      >
                        <DatePicker
                          style={{ width: '100%' }}
                          placeholder="종료일"
                          format="YYYY-MM-DD"
                        />
                      </Form.Item>
                    </div>
                  </Form.Item>
                ) : (
                  <Form.Item
                    name="dueDate"
                    label="마감 기한"
                    rules={[{ required: true, message: '마감 기한을 선택해주세요' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <DatePicker
                      style={{ width: '100%' }}
                      placeholder="마감 기한 선택"
                      format="YYYY-MM-DD"
                    />
                  </Form.Item>
                )}
              </div>

              {/* 작업 난이도 카드 */}
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.02)', 
                border: '1px solid var(--glass-border)', 
                borderRadius: '12px', 
                padding: '14px'
              }}>
                <Form.Item
                  name="difficulty"
                  label="작업 난이도"
                  rules={[{ required: true }]}
                  style={{ marginBottom: 0 }}
                >
                  <div>
                    <Space style={{ marginBottom: 8, flexWrap: 'wrap' }}>
                      {DIFFICULTY_PRESETS.map(preset => (
                        <Button
                          key={preset.label}
                          size="small"
                          type="default"
                          style={{
                            borderColor: preset.color,
                            color: preset.color,
                          }}
                          onClick={() => form.setFieldValue('difficulty', preset.value)}
                        >
                          {preset.label} ({preset.value})
                        </Button>
                      ))}
                    </Space>
                    <Form.Item name="difficulty" noStyle>
                      <Slider min={1} max={10} marks={difficultyMarks} />
                    </Form.Item>
                  </div>
                </Form.Item>
              </div>

            </div>
          </Col>
        </Row>

        <Form.Item style={{ marginTop: '20px', marginBottom: 0 }}>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={onClose}>취소</Button>
            <Button type="primary" htmlType="submit">
              {editingTodo ? '수정 완료' : '추가하기'}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
    
    {/* 반복 일정 수정 범위 선택 모달 */}
    <Modal
      title="반복 일정 수정 범위 선택"
      open={rangeModalOpen}
      onCancel={() => {
        setRangeModalOpen(false);
        setPendingTodoData(null);
      }}
      footer={null}
      width={400}
      destroyOnClose
      className="holiday-modal" // 공통 세련된 스타일 재사용
    >
      <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px' }}>
          이 반복 일정의 변경사항을 어디까지 적용하시겠습니까?
        </p>
        <Button 
          type="primary"
          onClick={() => handleConfirmRangeUpdate('single')}
          style={{ height: '40px', background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', border: 'none', fontWeight: 'bold' }}
        >
          이 일정만 수정
        </Button>
        <Button 
          onClick={() => handleConfirmRangeUpdate('future')}
          style={{ height: '40px', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', borderColor: 'var(--glass-border)' }}
        >
          이 일정 및 향후 모든 일정 수정
        </Button>
        <Button 
          onClick={() => handleConfirmRangeUpdate('all')}
          style={{ height: '40px', background: 'rgba(3, 2, 2, 0.03)', color: 'var(--text-primary)', borderColor: 'var(--glass-border)' }}
        >
          전체 일정 수정
        </Button>
      </div>
    </Modal>
    </>
  );
};

export default TodoForm;
