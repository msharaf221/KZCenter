/**
 * اختبارات منطق تنبيه الغياب المتكرر (دوال نقية).
 */
import { describe, it, expect } from 'vitest';
import {
  longestAbsenceStreak,
  currentAbsenceStreak,
  findRepeatedAbsences,
  ABSENCE_ALERT_THRESHOLD,
} from '../lib/absenceAlerts';
import type { AttendanceStatus } from '../lib/db';

const rec = (date: string, status: AttendanceStatus) => ({ date, status });

describe('longestAbsenceStreak', () => {
  it('يحسب أطول سلسلة غياب متتالية', () => {
    const records = [
      rec('2026-03-01', 'absent'),
      rec('2026-03-08', 'absent'),
      rec('2026-03-15', 'present'),
      rec('2026-03-22', 'absent'),
    ];
    expect(longestAbsenceStreak(records)).toBe(2);
  });

  it('الحضور/التأخير/الاستئذان يقطع السلسلة', () => {
    expect(longestAbsenceStreak([
      rec('2026-03-01', 'absent'),
      rec('2026-03-08', 'absent'),
      rec('2026-03-15', 'excused'),
      rec('2026-03-22', 'absent'),
    ])).toBe(2);
    expect(longestAbsenceStreak([rec('2026-03-01', 'present')])).toBe(0);
  });

  it('لا يهم ترتيب الإدخال (يُرتّب داخلياً)', () => {
    expect(longestAbsenceStreak([
      rec('2026-03-22', 'absent'),
      rec('2026-03-01', 'absent'),
      rec('2026-03-08', 'absent'),
    ])).toBe(3);
  });
});

describe('currentAbsenceStreak', () => {
  it('يحسب سلسلة الغياب في آخر التسجيلات فقط', () => {
    expect(currentAbsenceStreak([
      rec('2026-03-01', 'absent'),
      rec('2026-03-08', 'absent'),
      rec('2026-03-15', 'present'),
      rec('2026-03-22', 'absent'),
      rec('2026-03-29', 'absent'),
    ])).toBe(2);
  });

  it('صفر لو آخر تسجيلة حضور', () => {
    expect(currentAbsenceStreak([
      rec('2026-03-01', 'absent'),
      rec('2026-03-08', 'present'),
    ])).toBe(0);
  });

  it('ثلاث غيابات متتالية في الآخر = 3', () => {
    expect(currentAbsenceStreak([
      rec('2026-03-01', 'present'),
      rec('2026-03-08', 'absent'),
      rec('2026-03-15', 'absent'),
      rec('2026-03-22', 'absent'),
    ])).toBe(3);
  });
});

describe('findRepeatedAbsences', () => {
  it('يُخرج الطلاب الذين وصلت سلسلتهم الحالية للحد', () => {
    const alerts = findRepeatedAbsences([
      {
        studentId: 's1', studentName: 'أحمد', parentPhone: '010', groupId: 'g1', groupName: 'مجموعة أ',
        records: [rec('2026-03-08', 'absent'), rec('2026-03-15', 'absent'), rec('2026-03-22', 'absent')],
      },
      {
        studentId: 's2', studentName: 'محمد', parentPhone: '011', groupId: 'g1', groupName: 'مجموعة أ',
        records: [rec('2026-03-08', 'absent'), rec('2026-03-15', 'present')],
      },
    ]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].studentName).toBe('أحمد');
    expect(alerts[0].streak).toBe(ABSENCE_ALERT_THRESHOLD);
  });

  it('غاب 3 ثم حضر = لا تنبيه (السلسلة اتقطعت)', () => {
    const alerts = findRepeatedAbsences([
      {
        studentId: 's1', studentName: 'أحمد', groupId: 'g1', groupName: 'مجموعة أ',
        records: [
          rec('2026-03-01', 'absent'), rec('2026-03-08', 'absent'), rec('2026-03-15', 'absent'),
          rec('2026-03-22', 'present'),
        ],
      },
    ]);
    expect(alerts).toHaveLength(0);
  });
});
