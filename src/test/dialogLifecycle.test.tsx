import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

function Modals({ first, second }: { first: boolean; second: boolean }) {
  return (
    <>
      <Modal isOpen={first} onClose={() => {}} title="First">
        <button>Inside first</button>
      </Modal>
      <Modal isOpen={second} onClose={() => {}} title="Second">
        <button>Inside second</button>
      </Modal>
    </>
  );
}

afterEach(() => {
  document.body.style.overflow = '';
});

describe('shared dialog lifecycle', () => {
  it('closed instances do not change the existing body overflow', () => {
    document.body.style.overflow = 'scroll';
    const { unmount } = render(<Modals first={false} second={false} />);
    expect(document.body.style.overflow).toBe('scroll');
    unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('restores overflow only after the last open dialog closes, in either close order', () => {
    document.body.style.overflow = 'auto';
    const { rerender, unmount } = render(<Modals first second />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Modals first={false} second />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Modals first={false} second={false} />);
    expect(document.body.style.overflow).toBe('auto');
    rerender(<Modals first second />);
    rerender(<Modals first second={false} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('makes form and confirmation dialogs labelled and defaults confirmation focus to cancel', () => {
    render(
      <ConfirmDialog
        isOpen
        title="Remove record"
        message="This is a test"
        onConfirm={() => {}}
        onCancel={() => {}}
        danger
      />,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Remove record' });
    expect(dialog).toHaveAccessibleDescription('This is a test');
    expect(within(dialog).getByRole('button', { name: 'إلغاء' })).toHaveFocus();
  });

  it('Escape dismisses only the topmost dialog', () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <>
        <Modal isOpen onClose={first} title="First">
          <span>One</span>
        </Modal>
        <ConfirmDialog isOpen onCancel={second} onConfirm={() => {}} title="Second" message="Confirm" />
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it('keeps keyboard focus inside the panel and restores its trigger on close', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const { unmount } = render(
      <Modal isOpen onClose={() => {}} title="Form">
        <button>Last action</button>
      </Modal>,
    );
    const close = screen.getByRole('button', { name: 'إغلاق النافذة' });
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last action' })).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('uses updated callbacks without resetting focus on each render', () => {
    const old = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(
      <Modal isOpen onClose={old} title="Form">
        <input aria-label="Name" />
      </Modal>,
    );
    screen.getByRole('textbox').focus();
    rerender(
      <Modal isOpen onClose={latest} title="Form">
        <input aria-label="Name" />
      </Modal>,
    );
    expect(screen.getByRole('textbox')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(latest).toHaveBeenCalledOnce();
    expect(old).not.toHaveBeenCalled();
  });

  it('balances locks under React StrictMode', () => {
    document.body.style.overflow = 'clip';
    const { unmount } = render(<Modals first second />, { reactStrictMode: true });
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('clip');
  });
});

describe('confirmation promises', () => {
  it('resolves a replaced request as cancelled instead of leaving its caller pending', async () => {
    const { result, unmount } = renderHook(() => useConfirmDialog());
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.confirm({ title: 'First', message: 'One' });
    });
    act(() => {
      second = result.current.confirm({ title: 'Second', message: 'Two' });
    });
    expect(await first).toBe(false);
    unmount();
    expect(await second).toBe(false);
  });

  it('resolves cancellation on unmount and ignores an old callback afterwards', async () => {
    const { result, unmount } = renderHook(() => useConfirmDialog());
    const confirm = result.current.confirm;
    let pending!: Promise<boolean>;
    act(() => {
      pending = confirm({ title: 'Test', message: 'Message' });
    });
    unmount();
    expect(await pending).toBe(false);
    expect(await confirm({ title: 'Late', message: 'Ignored' })).toBe(false);
  });
});
