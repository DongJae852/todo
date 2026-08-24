import { useRef } from 'react';
import { Modal, Button, Space, Typography, message, Alert, Card } from 'antd';
import {
  DownloadOutlined,
  DatabaseOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { Todo, Holiday, CourseTask, CourseDayState, RecurringGroupDoc } from '../types/todo';
import { materializeAll } from '../utils/recurringEngine';

const { Text, Paragraph, Title } = Typography;

interface BackupRestoreModalProps {
  open: boolean;
  onClose: () => void;
  todos: Todo[];
  holidays: Holiday[];
  courseTasks: CourseTask[];
  completedCourseTasks: Record<string, boolean>;
  excludedCourseTasks: Record<string, boolean>;
  courseDailyState: Record<string, CourseDayState>;
  onImportBackup: (
    todos: Todo[],
    holidays: Holiday[],
    courseTasks?: CourseTask[],
    completedCourseTasks?: Record<string, boolean>,
    excludedCourseTasks?: Record<string, boolean>,
    courseDailyState?: Record<string, CourseDayState>
  ) => void;
}

const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  open,
  onClose,
  todos,
  holidays,
  courseTasks,
  completedCourseTasks,
  excludedCourseTasks,
  courseDailyState,
  onImportBackup,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 두 가지 백업 형식을 모두 지원해 표준 형태로 변환
  //  (A) 앱 내보내기: { todos: [...], holidays: [...], ... }
  //  (B) 깃허브 자동백업(Firestore 덤프): { todos: {id:doc}, recurringGroups: {id:group}, holidays: {date:doc}, appState: {metadata:{...}} }
  const normalizeBackup = (data: any): {
    todos: Todo[]; holidays: Holiday[]; courseTasks: CourseTask[];
    completedCourseTasks: Record<string, boolean>; excludedCourseTasks: Record<string, boolean>;
    courseDailyState: Record<string, CourseDayState>;
  } | null => {
    if (!data || typeof data !== 'object') return null;

    // (A) 앱 내보내기 형식
    if (Array.isArray(data.todos)) {
      return {
        todos: data.todos,
        holidays: data.holidays || [],
        courseTasks: data.courseTasks || [],
        completedCourseTasks: data.completedCourseTasks || {},
        excludedCourseTasks: data.excludedCourseTasks || {},
        courseDailyState: data.courseDailyState || {},
      };
    }

    // (B) Firestore 덤프 형식 (깃허브 자동백업)
    if (data.todos && typeof data.todos === 'object') {
      const todoDocs: Todo[] = Object.values(data.todos);
      const holidays: Holiday[] = Object.values(data.holidays || {});
      const holidayDates = holidays.map(h => h.date);
      const groups: RecurringGroupDoc[] = Object.values(data.recurringGroups || {});
      const groupIds = new Set(groups.map(g => g.groupId));

      const singles = todoDocs.filter(t => !(t.isRecurring && t.recurringGroupId));
      const legacyRecurring = todoDocs.filter(t => t.isRecurring && t.recurringGroupId && !groupIds.has(t.recurringGroupId!));
      const recurring = [...materializeAll(groups, holidayDates), ...legacyRecurring];

      const meta = (data.appState && data.appState.metadata) || {};
      return {
        todos: [...singles, ...recurring],
        holidays,
        courseTasks: Object.values(data.courseTasks || {}),
        completedCourseTasks: meta.completedCourseTasks || {},
        excludedCourseTasks: meta.excludedCourseTasks || {},
        courseDailyState: meta.courseDailyState || {},
      };
    }

    return null;
  };

  // 백업 JSON 파일에서 복원 (앱 백업 / 깃허브 자동백업 둘 다 지원)
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(String(ev.target?.result || ''));
        const norm = normalizeBackup(raw);
        if (!norm) {
          message.error('유효한 백업 파일이 아닙니다. (앱 백업 또는 Firestore 덤프 형식만 지원)');
          return;
        }
        const importedTodos = norm.todos;
        const importedHolidays = norm.holidays;
        const importedCourseTasks = norm.courseTasks;
        const importedCourseCompletions = norm.completedCourseTasks;
        const importedCourseExclusions = norm.excludedCourseTasks;
        const importedCourseDailyState = norm.courseDailyState;
        Modal.confirm({
          title: '백업 파일로 복원',
          content: (
            <div style={{ marginTop: 8 }}>
              <p>이 파일의 데이터로 <strong>현재 데이터를 완전히 대체</strong>합니다.</p>
              <p style={{ fontSize: 12, color: '#8c8c8c' }}>
                할 일 <strong>{importedTodos.length}</strong>개 · 휴일 <strong>{importedHolidays.length}</strong>개 · 코스 <strong>{importedCourseTasks.length}</strong>개
              </p>
              <p style={{ color: '#faad14', fontSize: 12, marginTop: 8 }}>
                ⚠️ 되돌리려면 먼저 현재 상태를 백업 다운로드 해두세요.
              </p>
            </div>
          ),
          okText: '복원 실행',
          cancelText: '취소',
          okButtonProps: { danger: true },
          onOk: () => {
            onImportBackup(
              importedTodos,
              importedHolidays,
              importedCourseTasks,
              importedCourseCompletions,
              importedCourseExclusions,
              importedCourseDailyState
            );
            message.success(`복원 완료! 할 일 ${importedTodos.length}개 · 휴일 ${importedHolidays.length}개`);
            onClose();
          },
        });
      } catch {
        message.error('백업 파일을 읽는 중 오류가 발생했습니다. (JSON 형식 확인)');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // 1. JSON 파일로 백업 내보내기
  const handleExport = () => {
    try {
      const backupData = {
        todos,
        holidays,
        courseTasks,
        completedCourseTasks,
        excludedCourseTasks,
        courseDailyState,
        exportedAt: new Date().toISOString(),
        version: '1.2.0',
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dongjae-todo-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      message.success('백업 파일이 성공적으로 다운로드되었습니다!');
    } catch {
      message.error('백업 내보내기에 실패했습니다.');
    }
  };

  return (
    <Modal
      title={
        <Space>
          <DatabaseOutlined style={{ color: '#8b5cf6' }} />
          <span>데이터 백업 & 복원</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={550}
      className="holiday-modal" // 공통 스타일 재사용
      destroyOnClose
    >
      <div style={{ padding: '10px 0' }}>
        <Paragraph style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          작성하신 할 일 데이터와 휴일 설정을 안전하게 보관하거나, 이전 백업 파일을 복원할 수 있습니다.
        </Paragraph>

        {/* 자동 백업 안내 */}
        <Card
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 182, 212, 0.12))',
            borderColor: 'rgba(16, 185, 129, 0.3)',
            borderRadius: '12px',
            marginBottom: '20px',
          }}
          bodyStyle={{ padding: '16px' }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Title level={5} style={{ margin: 0, color: '#d1fae5', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ☁️ 매일 자동 백업 중
            </Title>
            <Text style={{ color: '#a7f3d0', fontSize: '12px' }}>
              데이터는 <strong>매일 새벽(KST) GitHub Actions</strong>가 Firestore 전체를 자동 백업합니다
              (<code>backups</code> 브랜치, 최근 3일치 보관). 따로 저장 안 해도 안전해요.
            </Text>
            <Text style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
              복구가 필요하면 → GitHub <code>backups</code> 브랜치의 <code>db-날짜.json</code>을 받아
              아래 <strong>📂 백업 파일에서 복원</strong>으로 불러오면 됩니다. (자동백업·앱백업 파일 둘 다 지원)
            </Text>
          </Space>
        </Card>

        {/* 파일 백업 다운로드 섹션 */}
        <Card
          title={<span style={{ fontSize: '14px', fontWeight: 'bold' }}>📥 데이터 백업 받기</span>}
          style={{ background: 'rgba(255, 255, 255, 0.02)', borderColor: 'var(--glass-border)', borderRadius: '12px', marginBottom: '20px' }}
          bodyStyle={{ padding: '14px' }}
        >
          <Paragraph style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            현재 저장된 {todos.length}개의 할 일과 {holidays.length}개의 휴일 정보를 컴퓨터에 JSON 파일로 다운로드합니다.
          </Paragraph>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExport}
            style={{ width: '100%', borderColor: 'rgba(255,255,255,0.15)', color: 'var(--text-primary)', marginBottom: '10px' }}
          >
            백업 파일 다운로드
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
          <Button
            icon={<UploadOutlined />}
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.15))',
              borderColor: 'rgba(139, 92, 246, 0.4)',
              color: '#c4b5fd',
              fontWeight: 'bold',
            }}
          >
            📂 백업 파일에서 복원 (파일 불러오기)
          </Button>
        </Card>

        <Alert
          message={
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
              ⚠️ 파일에서 복원 시 현재 데이터는 그 파일 시점으로 완전히 대체됩니다. 중요한 변경사항이 있다면 먼저 백업 파일을 다운로드받아 두세요.
            </span>
          }
          type="warning"
          showIcon
          style={{ background: 'rgba(250, 140, 22, 0.08)', border: '1px solid rgba(250, 140, 22, 0.2)', borderRadius: '8px' }}
        />
      </div>
    </Modal>
  );
};

export default BackupRestoreModal;
