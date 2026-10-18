import type { Student } from '../domain/models';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import StudentPicker from '../features/students/StudentPicker';
import { payrollStudent } from './helpers/payroll';

const first = payrollStudent({ id: 'student-a', name: 'أحمد محمد', parentPhone: '01098765432', phone: '01099999999', enrolledGroups: [] });
const second = payrollStudent({ id: 'student-b', name: 'سارة علي', parentPhone: '01234567890', phone: '01111111111', gradeLevel: 'تالتة إعدادي', enrolledGroups: [] });
const students: Student[] = [first, second];

describe('StudentPicker', () => {
  it('searches names and guardian/student phones with Arabic numerals', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StudentPicker students={students} selectedIds={[]} onChange={onChange} />);
    await user.type(screen.getByRole('searchbox'), '٠١٢٣٤٥');
    expect(screen.getByRole('button', { name: /سارة علي/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /أحمد محمد/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /سارة علي/ }));
    expect(onChange).toHaveBeenCalledWith(['student-b']);
  });

  it('selects several students and respects the available-seat limit', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<StudentPicker students={students} selectedIds={[]} onChange={onChange} multiple maxSelections={1} />);
    await user.type(screen.getByRole('searchbox'), '01');
    await user.click(screen.getByRole('checkbox', { name: /أحمد محمد/ }));
    expect(onChange).toHaveBeenCalledWith(['student-a']);
    rerender(<StudentPicker students={students} selectedIds={['student-a']} onChange={onChange} multiple maxSelections={1} />);
    expect(screen.getByRole('checkbox', { name: /سارة علي/ })).toBeDisabled();
  });

  it('keeps selected students visible when the search is cleared', () => {
    render(<StudentPicker students={students} selectedIds={['student-a']} onChange={vi.fn()} multiple />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'أحمد' } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(screen.getByLabelText('الطلاب المختارون')).toHaveTextContent('أحمد محمد');
    expect(screen.getByText('اكتب اسمًا أو رقم هاتف للبحث عن الطالب.')).toBeInTheDocument();
  });
});
