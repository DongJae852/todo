import { useState, useEffect, useCallback } from 'react';
import type { Holiday } from '../types/todo';

const STORAGE_KEY = 'dongjae-todo-holidays';

export function useHolidays() {
  const [holidays, setHolidays] = useState<Holiday[]>(() => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      // 기존 string[] 포맷 하위 호환성 마이그레이션!
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
        return parsed.map((date: string) => ({ date, reason: '' }));
      }
      return parsed;
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(holidays));
  }, [holidays]);

  const addHoliday = useCallback((date: string, reason?: string) => {
    setHolidays(prev => {
      const exists = prev.some(h => h.date === date);
      if (exists) {
        // 이미 존재하면 사유만 갱신
        return prev.map(h => h.date === date ? { ...h, reason } : h);
      }
      return [...prev, { date, reason }].sort((a, b) => a.date.localeCompare(b.date));
    });
  }, []);

  const removeHoliday = useCallback((date: string) => {
    setHolidays(prev => prev.filter(h => h.date !== date));
  }, []);

  const isHoliday = useCallback((date: string) => {
    return holidays.some(h => h.date === date);
  }, [holidays]);

  const getHolidayReason = useCallback((date: string) => {
    const found = holidays.find(h => h.date === date);
    return found?.reason || '';
  }, [holidays]);

  return { holidays, setHolidays, addHoliday, removeHoliday, isHoliday, getHolidayReason };
}
