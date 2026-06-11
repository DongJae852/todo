import { useState, useEffect, useCallback, useRef } from 'react';
import dayjs from 'dayjs';
import type { Todo } from '../types/todo';

export function useNotification(todos: Todo[]) {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  // 알림 기능 on/off (localStorage 저장, 기본 켜짐)
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('dongjae-todo-notifications-enabled');
      return v === null ? true : v === 'true';
    } catch {
      return true;
    }
  });
  const notifiedKeysRef = useRef<Set<string>>(new Set());

  // on/off 상태 저장
  useEffect(() => {
    try {
      localStorage.setItem('dongjae-todo-notifications-enabled', String(enabled));
    } catch (e) {
      console.error('Failed to save notification setting:', e);
    }
  }, [enabled]);

  // 알림 켜기/끄기 토글 (켤 때 권한이 미정이면 권한 요청)
  const toggleNotifications = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().then(setPermission);
      }
      return next;
    });
  }, []);

  // 앱 시작 시 권한 요청(켜져 있을 때만) 및 로컬 스토리지에서 오늘 알림 기록 로드
  useEffect(() => {
    if (enabled && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().then(perm => {
        setPermission(perm);
      });
    }

    // 로컬 스토리지에서 오늘 이미 알림을 보낸 키들을 복구
    try {
      const saved = localStorage.getItem('dongjae-todo-notified-keys');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const today = dayjs().format('YYYY-MM-DD');
          // 오늘 날짜의 알림 키만 남기고 필터링 (로컬 스토리지 누적 방지)
          const validKeys = parsed.filter(key => key.endsWith(`-${today}`));
          notifiedKeysRef.current = new Set(validKeys);
          localStorage.setItem('dongjae-todo-notified-keys', JSON.stringify(validKeys));
        }
      }
    } catch (e) {
      console.error('Failed to load notified keys:', e);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setPermission(perm);
  }, []);

  const sendNotification = useCallback((title: string, body: string) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    new Notification(title, {
      body,
      icon: '📋',
      badge: '📋',
      tag: `dongjae-todo-${Date.now()}`,
    });
  }, []);

  const recordNotification = useCallback((key: string) => {
    notifiedKeysRef.current.add(key);
    try {
      localStorage.setItem(
        'dongjae-todo-notified-keys', 
        JSON.stringify(Array.from(notifiedKeysRef.current))
      );
    } catch (e) {
      console.error('Failed to save notified keys:', e);
    }
  }, []);

  const sendTestNotification = useCallback(() => {
    sendNotification(
      '🔔 동재 Todo 웹 알림 테스트',
      '알림이 정상적으로 작동하고 있습니다!'
    );
  }, [sendNotification]);

  // 1분 간격 마감일 체크 (알림이 켜져 있고 권한이 허용된 경우에만)
  useEffect(() => {
    if (!enabled || permission !== 'granted') return;

    const checkDueTodos = () => {
      const today = dayjs().format('YYYY-MM-DD');

      todos.forEach(todo => {
        if (todo.completed) return;

        const dueDate = dayjs(todo.dueDate).format('YYYY-MM-DD');
        const notifKey = `${todo.id}-${today}`;

        // 이미 오늘 알림을 띄운 투두라면 스킵
        if (notifiedKeysRef.current.has(notifKey)) return;

        // 오늘 마감일인 것만 알림 발송 (지난 일정은 알림 스킵)
        if (dueDate === today) {
          sendNotification(
            '⏰ 오늘 마감!',
            `"${todo.title}" 마감일이 오늘입니다!`
          );
          recordNotification(notifKey);
        }
      });
    };

    checkDueTodos();
    const interval = setInterval(checkDueTodos, 60000); // 1분 간격

    return () => clearInterval(interval);
  }, [todos, permission, enabled, sendNotification, recordNotification]);

  return {
    permission,
    requestPermission,
    sendNotification,
    sendTestNotification,
    notificationsEnabled: enabled,
    toggleNotifications,
  };
}
