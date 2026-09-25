import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createSettingsDraft, validateSettingsDraft, type SettingsDraft } from '../domain/settings';
import { findStudentDuplicates } from '../domain/studentIdentity';
import { useStudentEditor } from '../features/students/useStudentEditor';
import { DEFAULT_SETTINGS_VALUES } from '../lib/settings';
import { SUBJECTS } from '../lib/subjects';
import { payrollStudent } from './helpers/payroll';

describe('settings draft model', () => {
  it('preserves original form defaults', () => {
    expect(createSettingsDraft(null)).toMatchObject({
      centerName: '',
      currency: 'EGP',
      fontSize: 'md',
      primaryColor: '#6366f1',
      sessionsPerMonth: 8,
      graceDays: 0,
      upcomingDueDays: 3,
      lowStockThreshold: 5,
      notifyNewStudent: true,
      notifyUpcomingDue: false,
      subjectPrices: {},
    });
    expect(validateSettingsDraft(createSettingsDraft())).toBeNull();
  });

  it('keeps explicit zero/false settings and excludes credentials from the editable draft', () => {
    const source = {
      ...DEFAULT_SETTINGS_VALUES,
      notifyNewStudent: false,
      lowStockThreshold: 0,
      graceDays: 0,
      supabaseKey: 'synthetic-test-key',
      password: 'not-a-real-credential',
    };
    const draft = createSettingsDraft(source);
    expect(draft).toMatchObject({ notifyNewStudent: false, lowStockThreshold: 0, graceDays: 0 });
    expect(draft).not.toHaveProperty('supabaseKey');
    expect(draft).not.toHaveProperty('password');
  });

  it.each<Partial<SettingsDraft>>([
    { email: 'invalid' },
    { phone: '12' },
    { dueDayOfMonth: 0 },
    { dueDayOfMonth: 29 },
    { dueDayOfMonth: NaN },
    { sessionsPerMonth: 0 },
    { sessionsPerMonth: 41 },
    { subjectPrices: { [SUBJECTS[0].id]: -1 } },
    { subjectPrices: { [SUBJECTS[0].id]: Infinity } },
  ])('shares existing validation rules across every save button: %j', change => {
    expect(validateSettingsDraft({ ...createSettingsDraft(), ...change })).toBeTruthy();
  });

  it('accepts the original supported boundary values and zero-price subjects', () => {
    expect(validateSettingsDraft({ ...createSettingsDraft(), dueDayOfMonth: 1, sessionsPerMonth: 1 })).toBeNull();
    expect(
      validateSettingsDraft({
        ...createSettingsDraft(),
        dueDayOfMonth: 28,
        sessionsPerMonth: 40,
        subjectPrices: { [SUBJECTS[0].id]: 0 },
      }),
    ).toBeNull();
  });
});

describe('student duplicate detection', () => {
  it('normalizes Arabic names without modifying student records', () => {
    const existing = payrollStudent({ name: 'أَحْمَد  تَجْرِيبِي', parentPhone: '' });
    const records = Object.freeze([existing]);
    const warning = findStudentDuplicates({ name: 'احمد تجريبي', parentPhone: '' }, records);
    expect(warning?.kind).toBe('name');
    expect(warning?.matches[0]).toBe(existing);
    expect(existing.name).toBe('أَحْمَد  تَجْرِيبِي');
  });

  it('normalizes phone separators and checks parent/student phones', () => {
    const records = [payrollStudent({ phone: '00000000001', parentPhone: '' })];
    expect(findStudentDuplicates({ name: 'Another test', parentPhone: '000-000-000-01' }, records)?.kind).toBe('phone');
  });

  it('does not flag the edited record or weak short-name/phone matches', () => {
    const existing = payrollStudent({ name: 'علي', parentPhone: '123' });
    expect(findStudentDuplicates({ name: existing.name, parentPhone: existing.parentPhone }, [existing])).toBeNull();
    const full = payrollStudent();
    expect(findStudentDuplicates(full, [full], full.id)).toBeNull();
  });

  it('caps displayed duplicates at three and gives phone matches priority', () => {
    const records = Array.from({ length: 5 }, (_, index) => payrollStudent({ id: `test-${index}` }));
    const warning = findStudentDuplicates(payrollStudent(), records);
    expect(warning?.kind).toBe('phone');
    expect(warning?.matches).toHaveLength(3);
  });
});

describe('student editor state ownership', () => {
  it('resets enrollment prices, payments and sessions when opening another record or a new form', () => {
    const { result } = renderHook(() => useStudentEditor());
    const student = payrollStudent({ name: 'Synthetic editor test' });
    act(() => result.current.openEdit(student));
    expect(result.current).toMatchObject({ showModal: true, editingStudent: student, form: { name: student.name } });
    act(() => {
      result.current.setInitialPayments({ 'group-1': 50 });
      result.current.setStartSessions({ 'group-1': 3 });
      result.current.setEnrollPricing({ 'group-1': { priceOverride: 120 } });
    });
    act(() => result.current.openAdd());
    expect(result.current).toMatchObject({
      editingStudent: null,
      showModal: true,
      initialPayments: {},
      startSessions: {},
      enrollPricing: {},
      form: { name: '', age: 10, enrolledGroups: [] },
    });
  });
});
