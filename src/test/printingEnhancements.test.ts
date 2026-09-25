import { describe, expect, it } from 'vitest';
import type { Settings, Student } from '../domain/models';
import {
  buildReceiptHtml,
  buildStudentCardHtml,
  buildThermalReceiptHtml,
} from '../lib/printing';

describe('Printing Enhancements (Thermal Receipts & Student Cards)', () => {
  const dummySettings: Settings = {
    id: 'settings',
    centerName: 'مركز التفوق التعليمي',
    phone: '01012345678',
    currency: 'جنيه',
    primaryColor: '#4f46e5',
    fontSize: 'md',
    darkMode: false,
    notifyNewStudent: true,
    notifyAbsence: true,
    notifyLatePayment: true,
    receiptFooter: 'إيصال معتمد من المركز',
  };

  const dummyStudent: Student = {
    id: 'stu-uuid-001',
    name: 'محمود أحمد',
    age: 16,
    gender: 'male',
    parentPhone: '01123456789',
    gradeLevel: 'الصف الأول الثانوي',
    status: 'active',
    totalPaid: 500,
    enrolledGroups: ['group-1'],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  it('builds standard receipt HTML when receiptLayout is standard or undefined', () => {
    const html = buildReceiptHtml({
      receiptNo: 'REC-001',
      centerName: 'مركز التفوق',
      studentName: 'محمود أحمد',
      amount: 300,
      date: '2026-09-25',
      settings: dummySettings,
    });

    expect(html).toContain('إيصال استلام');
    expect(html).toContain('REC-001');
    expect(html).toContain('محمود أحمد');
    expect(html).toContain('جنيه');
  });

  it('builds thermal 80mm receipt HTML when receiptLayout is thermal80', () => {
    const thermalSettings: Settings = {
      ...dummySettings,
      receiptLayout: 'thermal80',
    };

    const html = buildReceiptHtml({
      receiptNo: 'REC-002',
      centerName: 'مركز التفوق',
      studentName: 'محمود أحمد',
      amount: 250,
      date: '2026-09-25',
      settings: thermalSettings,
    });

    expect(html).toContain('thermal-ticket');
    expect(html).toContain('80mm');
    expect(html).toContain('REC-002');
  });

  it('builds thermal 58mm receipt HTML when requested', () => {
    const html = buildThermalReceiptHtml(
      {
        receiptNo: 'REC-003',
        centerName: 'مركز التفوق',
        studentName: 'محمود أحمد',
        amount: 200,
        date: '2026-09-25',
        settings: dummySettings,
      },
      58,
    );

    expect(html).toContain('thermal-ticket');
    expect(html).toContain('58mm');
    expect(html).toContain('REC-003');
  });

  it('builds student ID card HTML with student info, barcode, and QR code', () => {
    const html = buildStudentCardHtml(dummyStudent, {
      settings: dummySettings,
      groupName: 'مجموعة الأوائل',
      courseName: 'فيزياء',
    });

    expect(html).toContain('card-wrap');
    expect(html).toContain('بطاقة طالب');
    expect(html).toContain('محمود أحمد');
    expect(html).toContain('STU-STUUUI');
    expect(html).toContain('01123456789');
    expect(html).toContain('مجموعة الأوائل');
    expect(html).toContain('<svg'); // Barcode and QR SVGs
  });
});
