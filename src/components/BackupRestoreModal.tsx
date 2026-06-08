import { useState } from 'react';
import { Modal, Button, Space, Typography, Upload, message, Alert, Card, Progress } from 'antd';
import {
  DownloadOutlined,
  UploadOutlined,
  SyncOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import type { Todo, Holiday, CourseTask } from '../types/todo';

const { Text, Paragraph, Title } = Typography;

interface BackupRestoreModalProps {
  open: boolean;
  onClose: () => void;
  todos: Todo[];
  holidays: Holiday[];
  courseTasks: CourseTask[];
  completedCourseTasks: Record<string, boolean>;
  excludedCourseTasks: Record<string, boolean>;
  onImportBackup: (
    todos: Todo[],
    holidays: Holiday[],
    courseTasks?: CourseTask[],
    completedCourseTasks?: Record<string, boolean>,
    excludedCourseTasks?: Record<string, boolean>
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
  onImportBackup,
}) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasCustomSnapshot, setHasCustomSnapshot] = useState(
    () => !!localStorage.getItem('todo_app_user_custom_snapshot')
  );

  // 1. JSON 파일로 백업 내보내기
  const handleExport = () => {
    try {
      const backupData = {
        todos,
        holidays,
        courseTasks,
        completedCourseTasks,
        excludedCourseTasks,
        exportedAt: new Date().toISOString(),
        version: '1.1.0',
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

  // 2. JSON 파일 가져오기 (Import)
  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json && (Array.isArray(json.todos) || Array.isArray(json))) {
          const importedTodos = Array.isArray(json.todos) ? json.todos : json;
          const importedHolidays = Array.isArray(json.holidays) ? json.holidays : [];
          const importedCourseTasks = Array.isArray(json.courseTasks) ? json.courseTasks : [];
          const importedCourseCompletions = json.completedCourseTasks || {};
          const importedCourseExclusions = json.excludedCourseTasks || {};
          
          onImportBackup(
            importedTodos, 
            importedHolidays, 
            importedCourseTasks, 
            importedCourseCompletions, 
            importedCourseExclusions
          );
          message.success(
            `성공적으로 복원되었습니다! (할 일 ${importedTodos.length}개, 휴일 ${importedHolidays.length}개, 코스 업무 ${importedCourseTasks.length}개)`
          );
          onClose();
        } else {
          message.error('유효하지 않은 백업 파일 형식입니다.');
        }
      } catch {
        message.error('파일을 파싱하는 중 오류가 발생했습니다.');
      }
    };
    reader.readAsText(file);
    return false; // 업로드 중단
  };

  // 3. 에이전트 백업 자동 복원 (1-Click Restore)
  const handleAutoRestore = async () => {
    setLoading(true);
    setProgress(10);
    try {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval);
            return 90;
          }
          return prev + 20;
        });
      }, 150);

      const res = await fetch('/extracted_todos.json');
      if (!res.ok) {
        throw new Error('백업 파일을 찾을 수 없습니다.');
      }
      const data = await res.json();
      
      clearInterval(interval);
      setProgress(100);

      setTimeout(() => {
        if (data && (data.todos || data.holidays)) {
          const importedTodos = data.todos || [];
          const importedHolidays = data.holidays || [];
          const importedCourseTasks = data.courseTasks || [];
          const importedCourseCompletions = data.completedCourseTasks || {};
          const importedCourseExclusions = data.excludedCourseTasks || {};
          onImportBackup(
            importedTodos, 
            importedHolidays, 
            importedCourseTasks, 
            importedCourseCompletions, 
            importedCourseExclusions
          );
          message.success(`🎉 에이전트 백업이 성공적으로 복원되었습니다! (할 일 ${importedTodos.length}개, 휴일 ${importedHolidays.length}개)`);
          onClose();
        } else {
          message.error('유효하지 않은 백업 데이터입니다.');
        }
        setLoading(false);
        setProgress(0);
      }, 300);

    } catch {
      message.error('에이전트 백업 파일을 불러오지 못했습니다. public 폴더 내에 백업 파일이 있는지 확인해주세요.');
      setLoading(false);
      setProgress(0);
    }
  };

  // 4. 나의 현재 데이터 스냅샷 저장
  const handleSaveCustomSnapshot = () => {
    try {
      const snapshotData = {
        todos,
        holidays,
        courseTasks,
        completedCourseTasks,
        excludedCourseTasks,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem('todo_app_user_custom_snapshot', JSON.stringify(snapshotData));
      setHasCustomSnapshot(true);
      message.success('🎉 현재 작업 중인 모든 데이터가 로컬 스냅샷(스토리지)에 안전하게 박제되었습니다!');
    } catch {
      message.error('로컬 스냅샷 저장에 실패했습니다.');
    }
  };

  // 5. 나의 커스텀 스냅샷 복원
  const handleRestoreCustomSnapshot = () => {
    try {
      const raw = localStorage.getItem('todo_app_user_custom_snapshot');
      if (!raw) {
        message.error('저장된 로컬 스냅샷이 없습니다.');
        return;
      }
      const data = JSON.parse(raw);
      if (data && (Array.isArray(data.todos) || data.todos)) {
        const importedTodos = data.todos || [];
        const importedHolidays = data.holidays || [];
        const importedCourseTasks = data.courseTasks || [];
        const importedCourseCompletions = data.completedCourseTasks || {};
        const importedCourseExclusions = data.excludedCourseTasks || {};
        onImportBackup(
          importedTodos, 
          importedHolidays, 
          importedCourseTasks, 
          importedCourseCompletions, 
          importedCourseExclusions
        );
        message.success(`🎉 저장해 두신 커스텀 스냅샷으로 성공적으로 복원되었습니다! (할 일 ${importedTodos.length}개, 휴일 ${importedHolidays.length}개)`);
        onClose();
      } else {
        message.error('유효하지 않은 스냅샷 데이터 형식입니다.');
      }
    } catch {
      message.error('스냅샷 복원 도중 오류가 발생했습니다.');
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

        {/* 사용자 커스텀 로컬 스냅샷 섹션 */}
        <Card
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.15))',
            borderColor: 'rgba(16, 185, 129, 0.3)',
            borderRadius: '12px',
            marginBottom: '20px',
            boxShadow: '0 4px 15px rgba(16, 185, 129, 0.05)',
          }}
          bodyStyle={{ padding: '16px' }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Title level={5} style={{ margin: 0, color: '#d1fae5', display: 'flex', alignItems: 'center', gap: '6px' }}>
              💾 나의 실무 데이터 스냅샷 저장
            </Title>
            <Text style={{ color: '#a7f3d0', fontSize: '12px' }}>
              현재 브라우저에 등록한 소중한 할 일 및 메모 전체({todos.length}개)를 임시 스냅샷으로 백업해둡니다.
            </Text>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
              <Button
                type="primary"
                onClick={handleSaveCustomSnapshot}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                  border: 'none',
                  fontWeight: 'bold',
                  height: '38px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                }}
              >
                📸 현재 상태 스냅샷 저장
              </Button>
              <Button
                disabled={!hasCustomSnapshot}
                onClick={handleRestoreCustomSnapshot}
                style={{
                  background: hasCustomSnapshot 
                    ? 'rgba(255, 255, 255, 0.05)' 
                    : 'rgba(255, 255, 255, 0.02)',
                  borderColor: hasCustomSnapshot 
                    ? 'rgba(16, 185, 129, 0.5)' 
                    : 'var(--glass-border)',
                  color: hasCustomSnapshot ? '#34d399' : 'var(--text-muted)',
                  fontWeight: 'bold',
                  height: '38px',
                }}
              >
                🔄 내 스냅샷으로 즉시 복원
              </Button>
            </div>
            {hasCustomSnapshot && (
              <Text style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', display: 'block', marginTop: '4px' }}>
                * 이미 생성해 두신 로컬 스냅샷이 있습니다. 언제든 이 스냅샷으로 덮어쓸 수 있습니다.
              </Text>
            )}
          </Space>
        </Card>

        {/* 에이전트 백업 자동 복원 섹션 */}
        <Card
          style={{
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(236, 72, 153, 0.15))',
            borderColor: 'rgba(139, 92, 246, 0.3)',
            borderRadius: '12px',
            marginBottom: '20px',
            boxShadow: '0 4px 15px rgba(139, 92, 246, 0.05)',
          }}
          bodyStyle={{ padding: '16px' }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Title level={5} style={{ margin: 0, color: '#e9d5ff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ⚡ 에이전트 추출 데이터 원클릭 복원
            </Title>
            <Text style={{ color: '#c084fc', fontSize: '12px' }}>
              이전 브라우저 프로필에 저장되었던 <strong>5,788개</strong>의 전체 할 일과 휴일 데이터를 가져왔습니다!
            </Text>
            
            {loading ? (
              <div style={{ marginTop: '10px' }}>
                <Progress percent={progress} strokeColor={{ '0%': '#8b5cf6', '100%': '#ec4899' }} status="active" />
                <Text style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', textAlign: 'center', marginTop: '4px' }}>
                  대용량 할 일 데이터를 파싱 및 데이터베이스에 등록 중...
                </Text>
              </div>
            ) : (
              <Button
                type="primary"
                icon={<SyncOutlined spin={loading} />}
                onClick={handleAutoRestore}
                style={{
                  width: '100%',
                  marginTop: '8px',
                  background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
                  border: 'none',
                  fontWeight: 'bold',
                  height: '38px',
                  boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
                }}
              >
                1초만에 모든 데이터 복원하기 (5,788개)
              </Button>
            )}
          </Space>
        </Card>

        {/* 일반 백업 및 가져오기 섹션 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          {/* 내보내기 카드 */}
          <Card
            title={<span style={{ fontSize: '14px', fontWeight: 'bold' }}>📥 데이터 백업 받기</span>}
            style={{ background: 'rgba(255, 255, 255, 0.02)', borderColor: 'var(--glass-border)', borderRadius: '12px' }}
            bodyStyle={{ padding: '14px' }}
          >
            <Paragraph style={{ fontSize: '12px', color: 'var(--text-secondary)', minHeight: '36px', marginBottom: '12px' }}>
              현재 저장된 {todos.length}개의 할 일과 {holidays.length}개의 휴일 정보를 컴퓨터에 JSON 파일로 다운로드합니다.
            </Paragraph>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExport}
              style={{ width: '100%', borderColor: 'rgba(255,255,255,0.15)', color: 'var(--text-primary)' }}
            >
              백업 파일 다운로드
            </Button>
          </Card>

          {/* 가져오기 카드 */}
          <Card
            title={<span style={{ fontSize: '14px', fontWeight: 'bold' }}>📤 백업 파일 복원</span>}
            style={{ background: 'rgba(255, 255, 255, 0.02)', borderColor: 'var(--glass-border)', borderRadius: '12px' }}
            bodyStyle={{ padding: '14px' }}
          >
            <Paragraph style={{ fontSize: '12px', color: 'var(--text-secondary)', minHeight: '36px', marginBottom: '12px' }}>
              이전에 다운로드한 백업 JSON 파일을 불러와 현재 브라우저의 할 일을 덮어씁니다.
            </Paragraph>
            <Upload
              accept=".json"
              showUploadList={false}
              beforeUpload={handleImport}
              style={{ width: '100%' }}
            >
              <Button icon={<UploadOutlined />} style={{ width: '100%', borderColor: 'rgba(255,255,255,0.15)', color: 'var(--text-primary)' }}>
                백업 파일 업로드
              </Button>
            </Upload>
          </Card>
        </div>

        <Alert
          message={
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
              ⚠️ 복원 시 기존 브라우저에 저장된 임시 할 일 데이터는 지워지고 백업된 데이터로 완전히 대체됩니다. 중요한 변경사항이 있다면 먼저 백업을 다운로드받아 두세요.
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
