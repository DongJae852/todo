import dayjs from 'dayjs';
import type { Todo, ChecklistItem, RecurringGroupDoc, RecurringOverride } from '../types/todo';
import { skipToWorkday, skipToPrevWorkday } from './recurring';

// 반복 인스턴스의 결정적(deterministic) id. 같은 그룹/날짜는 항상 같은 id.
export function instanceId(groupId: string, date: string): string {
  return `${groupId}__${date}`;
}

// 자연 날짜 생성 결과 캐시 (그룹 규칙+휴일이 같으면 5년치 재생성 생략 → derive/materialize 가속)
const naturalDatesCache = new Map<string, string[]>();

// 규칙(그룹)으로부터 자연 발생 날짜 목록을 생성. recurring.ts의 generateRecurringInstances와 동일한 규칙.
export function generateNaturalDates(
  group: Pick<RecurringGroupDoc, 'anchorDate' | 'recurringType' | 'recurringDays' | 'holidayBehavior'>,
  holidays: string[]
): string[] {
  const cacheKey =
    group.anchorDate + '|' + (group.recurringType || '') + '|' +
    (group.recurringDays || '') + '|' + (group.holidayBehavior || '') + '|' +
    holidays.slice().sort().join(',');
  const cached = naturalDatesCache.get(cacheKey);
  if (cached) return cached;

  const dates: string[] = [];
  const start = dayjs(group.anchorDate);
  const end = start.add(5, 'year');

  let current = start;
  let safety = 0;
  const seen = new Set<string>();

  while ((current.isBefore(end) || current.isSame(end, 'day')) && safety < 5000) {
    safety++;

    let targetDate = current;
    const day = targetDate.day();
    const dateStr = targetDate.format('YYYY-MM-DD');

    if ((day === 0 || day === 6 || holidays.includes(dateStr)) && group.holidayBehavior !== 'keep') {
      targetDate = group.holidayBehavior === 'prev'
        ? skipToPrevWorkday(targetDate, holidays)
        : skipToWorkday(targetDate, holidays);
    }

    const formatted = targetDate.format('YYYY-MM-DD');
    if (!seen.has(formatted) && (targetDate.isBefore(end) || targetDate.isSame(end, 'day'))) {
      seen.add(formatted);
      dates.push(formatted);
    }

    switch (group.recurringType) {
      case 'daily': current = current.add(1, 'day'); break;
      case 'weekly': current = current.add(1, 'week'); break;
      case 'monthly': current = current.add(1, 'month'); break;
      case 'custom': current = current.add(group.recurringDays || 1, 'day'); break;
      default: current = current.add(1, 'day'); break;
    }
  }

  naturalDatesCache.set(cacheKey, dates);
  return dates;
}

// 체크리스트 구조(완료상태 제외) 복제
function cloneChecklistStructure(checklist?: ChecklistItem[]): ChecklistItem[] | undefined {
  if (!checklist || checklist.length === 0) return undefined;
  return checklist.map(c => ({ id: c.id, text: c.text, completed: false }));
}

// 그룹 규칙 + override를 실제 Todo 인스턴스 배열로 펼친다(materialize).
export function materializeGroup(group: RecurringGroupDoc, holidays: string[]): Todo[] {
  const result: Todo[] = [];
  const overrides = group.overrides || {};
  const exceptions = new Set(group.exceptionDates || []);

  const naturalDates = generateNaturalDates(group, holidays);

  for (const date of naturalDates) {
    if (exceptions.has(date)) continue;
    const ov: RecurringOverride = overrides[date] || {};

    result.push({
      id: instanceId(group.groupId, date),
      title: ov.title ?? group.title,
      description: ov.description ?? group.description,
      dueDate: date,
      difficulty: ov.difficulty ?? group.difficulty,
      isRecurring: true,
      recurringType: group.recurringType,
      recurringDays: group.recurringDays,
      recurringGroupId: group.groupId,
      holidayBehavior: group.holidayBehavior,
      completed: ov.completed ?? false,
      completedAt: ov.completedAt,
      createdAt: group.createdAt,
      checklist: ov.checklist ?? cloneChecklistStructure(group.checklist),
      dailyNote: ov.dailyNote,
    });
  }

  // 자연 날짜가 아닌 위치의 인스턴스(연기 등)
  if (group.extraInstances) {
    for (const inst of group.extraInstances) {
      result.push({ ...inst, recurringGroupId: group.groupId, isRecurring: true });
    }
  }

  return result;
}

// 여러 그룹을 한 번에 펼친다.
export function materializeAll(groups: RecurringGroupDoc[], holidays: string[]): Todo[] {
  const out: Todo[] = [];
  for (const g of groups) out.push(...materializeGroup(g, holidays));
  return out;
}

// ── derive: 펼쳐진 인스턴스 배열 → 그룹 규칙 + override (저장용) ──────────────

function mostCommon<T>(values: T[], keyFn: (v: T) => string): T {
  const counts = new Map<string, { count: number; val: T }>();
  for (const v of values) {
    const k = keyFn(v);
    const entry = counts.get(k);
    if (entry) entry.count++;
    else counts.set(k, { count: 1, val: v });
  }
  let best: { count: number; val: T } | null = null;
  for (const e of counts.values()) {
    if (!best || e.count > best.count) best = e;
  }
  return best!.val;
}

function checklistStructureEqual(a?: ChecklistItem[], b?: ChecklistItem[]): boolean {
  const x = a || [];
  const y = b || [];
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    if (x[i].id !== y[i].id || x[i].text !== y[i].text) return false;
  }
  return true;
}

function checklistCompletionTrivial(checklist?: ChecklistItem[]): boolean {
  // 모든 항목이 미완료면 override로 저장할 필요 없음
  return !checklist || checklist.every(c => !c.completed);
}

// 한 그룹의 인스턴스들로부터 그룹 문서를 만든다.
export function deriveGroup(instances: Todo[], holidays: string[]): RecurringGroupDoc {
  const groupId = instances[0].recurringGroupId!;

  // 규칙 베이스 필드: 최빈값 채택 (보통 모두 동일)
  const title = mostCommon(instances, t => t.title).title;
  const difficulty = mostCommon(instances, t => String(t.difficulty)).difficulty;
  const descSrc = mostCommon(instances, t => t.description || '');
  const description = descSrc.description;
  const recurringType = instances[0].recurringType;
  const recurringDays = instances[0].recurringDays;
  const holidayBehavior = instances[0].holidayBehavior;
  const checklistSrc = mostCommon(instances, t => JSON.stringify((t.checklist || []).map(c => ({ id: c.id, text: c.text }))));
  const checklistStructure = cloneChecklistStructure(checklistSrc.checklist);

  const anchorDate = instances.reduce((min, t) => (t.dueDate < min ? t.dueDate : min), instances[0].dueDate);
  const createdAt = instances.reduce((min, t) => (t.createdAt < min ? t.createdAt : min), instances[0].createdAt);

  const ruleBase: RecurringGroupDoc = {
    groupId,
    title,
    description,
    difficulty,
    recurringType,
    recurringDays,
    holidayBehavior,
    checklist: checklistStructure,
    anchorDate,
    createdAt,
  };

  const naturalDates = generateNaturalDates(ruleBase, holidays);
  const naturalSet = new Set(naturalDates);

  const overrides: Record<string, RecurringOverride> = {};
  const extraInstances: Todo[] = [];
  const usedNatural = new Set<string>();

  for (const inst of instances) {
    if (naturalSet.has(inst.dueDate) && !usedNatural.has(inst.dueDate)) {
      usedNatural.add(inst.dueDate);

      const ov: RecurringOverride = {};
      if (inst.completed) {
        ov.completed = true;
        if (inst.completedAt) ov.completedAt = inst.completedAt;
      }
      if (inst.dailyNote && inst.dailyNote.trim()) ov.dailyNote = inst.dailyNote;
      // 체크리스트: 구조가 다르거나 일부 완료된 경우만 저장
      if (!checklistStructureEqual(inst.checklist, checklistStructure) || !checklistCompletionTrivial(inst.checklist)) {
        if (inst.checklist) ov.checklist = inst.checklist;
      }
      // 규칙과 갈라진 개별 필드
      if (inst.title !== title) ov.title = inst.title;
      if ((inst.description || '') !== (description || '')) ov.description = inst.description;
      if (inst.difficulty !== difficulty) ov.difficulty = inst.difficulty;

      if (Object.keys(ov).length > 0) overrides[inst.dueDate] = ov;
    } else {
      // 자연 날짜가 아니거나 중복 → 별도 인스턴스로 보존 (연기 등)
      extraInstances.push(inst);
    }
  }

  const exceptionDates = naturalDates.filter(d => !usedNatural.has(d));

  const doc: RecurringGroupDoc = { ...ruleBase };
  if (Object.keys(overrides).length > 0) doc.overrides = overrides;
  if (exceptionDates.length > 0) doc.exceptionDates = exceptionDates;
  if (extraInstances.length > 0) doc.extraInstances = extraInstances;

  return doc;
}

// 전체 반복 인스턴스 배열 → 그룹 문서 배열
export function deriveGroups(recurringTodos: Todo[], holidays: string[]): RecurringGroupDoc[] {
  const byGroup = new Map<string, Todo[]>();
  for (const t of recurringTodos) {
    if (!t.isRecurring || !t.recurringGroupId) continue;
    const arr = byGroup.get(t.recurringGroupId);
    if (arr) arr.push(t);
    else byGroup.set(t.recurringGroupId, [t]);
  }
  const docs: RecurringGroupDoc[] = [];
  for (const insts of byGroup.values()) {
    docs.push(deriveGroup(insts, holidays));
  }
  return docs;
}
