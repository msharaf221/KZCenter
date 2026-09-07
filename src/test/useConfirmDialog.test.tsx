/**
 * اختبارات useConfirmDialog — بديل نافذة `confirm()` الأصلية.
 *
 * النوافذ الأصلية بتكسر فوكس النافذة في Electron على ويندوز (بتخلي قوائم
 * `<select>` تقفل لوحدها)، فالهوك ده بيستبدلها بنافذة React من غير ما يغيّر
 * أسلوب الاستخدام (وعد بيرجّع true/false).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

function TestHarness({ onResult }: { onResult: (v: boolean) => void }) {
  const { confirm, dialog } = useConfirmDialog();

  async function ask() {
    const ok = await confirm({
      title: 'عنوان التأكيد',
      message: 'رسالة التأكيد',
      confirmLabel: 'موافق',
      cancelLabel: 'رجوع',
      danger: true,
    });
    onResult(ok);
  }

  return (
    <div>
      <button onClick={() => void ask()}>افتح</button>
      {dialog}
    </div>
  );
}

describe('useConfirmDialog', () => {
  it('يفتح نافذة React ويعيد true عند التأكيد', async () => {
    const onResult = vi.fn();
    render(<TestHarness onResult={onResult} />);

    await userEvent.click(screen.getByText('افتح'));
    expect(await screen.findByText('عنوان التأكيد')).toBeInTheDocument();
    expect(screen.getByText('رسالة التأكيد')).toBeInTheDocument();

    await userEvent.click(screen.getByText('موافق'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    // النافذة اتقفلت بعد الحسم
    expect(screen.queryByText('عنوان التأكيد')).not.toBeInTheDocument();
  });

  it('يعيد false عند الإلغاء', async () => {
    const onResult = vi.fn();
    render(<TestHarness onResult={onResult} />);

    await userEvent.click(screen.getByText('افتح'));
    await userEvent.click(await screen.findByText('رجوع'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('يعيد false عند الضغط على الخلفية', async () => {
    const onResult = vi.fn();
    const { container } = render(<TestHarness onResult={onResult} />);

    await userEvent.click(screen.getByText('افتح'));
    await screen.findByText('عنوان التأكيد');
    // الخلفية المعتمة (أول عنصر في النافذة)
    const backdrop = container.querySelector('.fixed.inset-0 > .absolute');
    expect(backdrop).not.toBeNull();
    await userEvent.click(backdrop as HTMLElement);
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });
});
