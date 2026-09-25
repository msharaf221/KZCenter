import { useCallback, useEffect, useRef, useState } from 'react';
import { RuleError, userErrorMessage } from '../domain/errors';
import { notify } from '../lib/notifications';

/** Writes are not cancelled on navigation. Only duplicate starts and obsolete UI errors are suppressed. */
export function useCommandTask() {
  const running = useRef(false);
  const mounted = useRef(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const run = useCallback(async <T>(command: () => Promise<T>): Promise<T | undefined> => {
    if (!mounted.current || running.current) return undefined;
    running.current = true;
    setPending(true);
    try {
      return await command();
    } catch (error) {
      if (!(error instanceof RuleError)) console.error('Command failed:', error);
      if (mounted.current) notify.error(userErrorMessage(error));
      return undefined;
    } finally {
      running.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);
  const isActive = useCallback(() => mounted.current, []);
  return { run, pending, isActive };
}
