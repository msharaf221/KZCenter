/**
 * اختبار واجهة نافذة «استيراد شيت إكسيل» — بيشتغل على النافذة نفسها
 * (اختيار ملف → معاينة → استيراد → نتيجة) مش على الدوال بس.
 */
import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SheetImportDialog from '../components/SheetImportDialog';
import { AppProvider } from '../contexts/AppContext';
import { dbGetAll, dbClearStore, Student, Enrollment } from '../lib/db';

const REAL_FILE = path.resolve(process.cwd(), 'tmp/kidszone.xlsx');

function makeXlsxFile(name: string): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['s.r 1 السبت من 4/5', 'اقرا 2 الاحد من 5/6'],
    ['ليلي صلاح احمد محمد', 'مريم احمد علي حسن'],
    ['ادم طلال عطيه رمضان', 'ليلي صلاح احمد محمد'],
  ]), 'ولاء');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([buf], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

async function clearAll() {
  for (const store of ['installments', 'enrollments', 'students', 'groups', 'teachers', 'courses'] as const) {
    await dbClearStore(store);
  }
}

function renderDialog(onDone = () => {}) {
  return render(
    <AppProvider>
      <SheetImportDialog open onClose={() => {}} onDone={onDone} />
    </AppProvider>
  );
}

async function uploadFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).not.toBeNull();
  await userEvent.upload(input, file);
}

describe('SheetImportDialog', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('بيقرا الملف ويعرض المعاينة', async () => {
    renderDialog();
    await uploadFile(makeXlsxFile('sheet.xlsx'));

    await waitFor(() => {
      expect(screen.getByText('sheet.xlsx')).toBeInTheDocument();
    });
    // مدرس واحد، مجموعتين، 3 طلاب فريدين
    await waitFor(() => {
      expect(screen.getByTestId('stat-teachers')).toHaveTextContent('1');
      expect(screen.getByTestId('stat-groups')).toHaveTextContent('2');
      expect(screen.getByTestId('stat-students')).toHaveTextContent('3');
    });
    expect(screen.getByText(/هيتم إنشاء/)).toHaveTextContent('4');
    expect(screen.getByRole('button', { name: /ابدأ الاستيراد/ })).toBeEnabled();
  });

  it('بيستورد فعلاً وينشئ التسجيلات والأقساط', async () => {
    let doneCalls = 0;
    renderDialog(() => { doneCalls++; });
    await uploadFile(makeXlsxFile('sheet.xlsx'));
    await waitFor(() => expect(screen.getByRole('button', { name: /ابدأ الاستيراد/ })).toBeEnabled());

    await userEvent.click(screen.getByRole('button', { name: /ابدأ الاستيراد/ }));

    await waitFor(() => {
      expect(screen.getByText('تم الاستيراد')).toBeInTheDocument();
    }, { timeout: 20000 });

    const students = await dbGetAll<Student>('students');
    const enrollments = await dbGetAll<Enrollment>('enrollments');
    expect(students).toHaveLength(3);
    expect(enrollments.filter(e => e.status === 'active')).toHaveLength(4);
    // «ليلي» ملف واحد بس ومقيّدة في المجموعتين
    const layla = students.filter(s => s.name === 'ليلي صلاح احمد محمد');
    expect(layla).toHaveLength(1);
    expect(layla[0].enrolledGroups).toHaveLength(2);
    expect(doneCalls).toBe(1);
  });

  it('بيرفض ملف مش شيت مركز', async () => {
    renderDialog();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['hello'], ['world']]), 'Sheet1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    await uploadFile(new File([buf], 'bad.xlsx'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ابدأ الاستيراد/ })).toBeDisabled();
    });
  });

  it('بيغيّر طريقة إنشاء الكورسات من الواجهة', async () => {
    renderDialog();
    await uploadFile(makeXlsxFile('sheet.xlsx'));
    await waitFor(() => expect(screen.getByRole('button', { name: /ابدأ الاستيراد/ })).toBeEnabled());

    await userEvent.selectOptions(
      screen.getByRole('combobox'),
      'byTeacher'
    );
    await userEvent.click(screen.getByRole('button', { name: /ابدأ الاستيراد/ }));
    await waitFor(() => expect(screen.getByText('تم الاستيراد')).toBeInTheDocument(), { timeout: 20000 });

    const courses = await dbGetAll<{ name: string }>('courses');
    expect(courses.map(c => c.name)).toEqual(['ولاء']);
  });
});

describe.skipIf(!fs.existsSync(REAL_FILE))('النافذة مع الشيت الحقيقي', () => {
  it(' بيعرض أرقام الشيت الحقيقية في المعاينة', async () => {
    renderDialog();
    const buf = fs.readFileSync(REAL_FILE);
    await uploadFile(new File([new Uint8Array(buf)], 'kids zone excel sheet.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));

    await waitFor(() => {
      expect(screen.getByText('kids zone excel sheet.xlsx')).toBeInTheDocument();
    }, { timeout: 30000 });

    // 16 مدرس / 75 مجموعة / 771 طالب / 1062 تسجيل
    await waitFor(() => {
      expect(screen.getByText(/هيتم إنشاء/)).toHaveTextContent('1062');
    }, { timeout: 30000 });
    expect(screen.getByTestId('stat-teachers')).toHaveTextContent('16');
    expect(screen.getByTestId('stat-groups')).toHaveTextContent('75');
    expect(screen.getByTestId('stat-students')).toHaveTextContent('771');
    expect(screen.getAllByText(/طالب موجودين في أكتر من مجموعة/).length).toBeGreaterThan(0);
  }, 120000);
});
