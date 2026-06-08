import { useState, useEffect, useCallback, useRef } from 'react';
import dayjs from 'dayjs';
import type { Todo } from '../types/todo';

export function useNotification(todos: Todo[]) {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const notifiedRef = useRef<Set<string>>(new Set());

  // 앱 시작 시 권한 요청
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().then(perm => {
        setPermission(perm);
      });
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

  const sendTestNotification = useCallback(() => {
    sendNotification(
      '🔔 동재 Todo 웹 알림 테스트',
      '알림이 정상적으로 작동하고 있습니다!'
    );
  }, [sendNotification]);

  // 1분 간격 마감일 체크
  useEffect(() => {
    if (permission !== 'granted') return;

    const checkDueTodos = () => {
      const today = dayjs().format('YYYY-MM-DD');
      const todayKey = `notified-${today}`;

      // 하루가 바뀌면 알림 기록 초기화
      if (!notifiedRef.current.has(todayKey)) {
        notifiedRef.current.clear();
        notifiedRef.current.add(todayKey);
      }

      todos.forEach(todo => {
        if (todo.completed) return;

        const dueDate = dayjs(todo.dueDate).format('YYYY-MM-DD');
        const notifKey = `${todo.id}-${today}`;

        if (notifiedRef.current.has(notifKey)) return;

        if (dueDate === today) {
          sendNotification(
            '⏰ 오늘 마감!',
            `"${todo.title}" 마감일이 오늘입니다!`
          );
          notifiedRef.current.add(notifKey);
        } else if (dueDate < today) {
          sendNotification(
            '🚨 기한 초과!',
            `"${todo.title}" 마감일이 지났습니다!`
          );
          notifiedRef.current.add(notifKey);
        }
      });
    };

    checkDueTodos();
    const interval = setInterval(checkDueTodos, 60000); // 1분 간격

    return () => clearInterval(interval);
  }, [todos, permission, sendNotification]);

  return {
    permission,
    requestPermission,
    sendNotification,
    sendTestNotification,
  };
}
