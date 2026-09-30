import { AppDialog } from '@/components/AppDialog';
import {
  ensureTimerNotificationPermission,
  presentTimerDoneNotification,
} from '@/lib/timerNotifications';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type StepTimer = {
  stepId: string;
  label: string;
  totalSeconds: number;
  remainingSeconds: number;
  isPaused: boolean;
  /** Null while paused; the remaining time is frozen in `remainingSeconds`. */
  endsAtMs: number | null;
};

type StepTimerCtx = {
  timer: StepTimer | null;
  start: (stepId: string, label: string, seconds: number) => void;
  togglePause: () => void;
  stop: () => void;
};

const Ctx = createContext<StepTimerCtx | null>(null);

/**
 * One countdown for the whole app. It lives above the navigator so a timer
 * started in cooking mode keeps running (and still fires) after the user
 * leaves that screen, and the recipe screen and cooking mode show the same one.
 */
export function StepTimerProvider({ children }: { children: React.ReactNode }) {
  const [timer, setTimer] = useState<StepTimer | null>(null);
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const askedPermissionRef = useRef(false);

  // The updater stays pure: React may call it more than once, and firing the
  // notification from inside it produced duplicate alerts. Depending on
  // endsAtMs rather than the whole timer object also stops the interval being
  // torn down and rebuilt on every displayed second.
  const endsAtMs = timer?.isPaused ? null : timer?.endsAtMs ?? null;
  const label = timer?.label ?? '';

  useEffect(() => {
    if (endsAtMs === null) return;
    const handle = setInterval(() => {
      const remainingSeconds = Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000));
      if (remainingSeconds <= 0) {
        clearInterval(handle);
        setTimer(null);
        void presentTimerDoneNotification(label);
        setDoneLabel(label);
        return;
      }
      setTimer((current) =>
        current && current.remainingSeconds !== remainingSeconds
          ? { ...current, remainingSeconds }
          : current
      );
    }, 250);
    return () => clearInterval(handle);
  }, [endsAtMs, label]);

  const start = useCallback((stepId: string, nextLabel: string, seconds: number) => {
    if (!askedPermissionRef.current) {
      askedPermissionRef.current = true;
      void ensureTimerNotificationPermission();
    }
    setTimer({
      stepId,
      label: nextLabel,
      totalSeconds: seconds,
      remainingSeconds: seconds,
      isPaused: false,
      endsAtMs: Date.now() + seconds * 1000,
    });
  }, []);

  const togglePause = useCallback(() => {
    setTimer((current) => {
      if (!current) return current;
      if (current.isPaused) {
        return {
          ...current,
          isPaused: false,
          endsAtMs: Date.now() + current.remainingSeconds * 1000,
        };
      }
      const remainingSeconds = current.endsAtMs
        ? Math.max(0, Math.ceil((current.endsAtMs - Date.now()) / 1000))
        : current.remainingSeconds;
      return { ...current, remainingSeconds, isPaused: true, endsAtMs: null };
    });
  }, []);

  const stop = useCallback(() => setTimer(null), []);

  const value = useMemo(
    () => ({ timer, start, togglePause, stop }),
    [timer, start, togglePause, stop]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <AppDialog
        visible={doneLabel !== null}
        title="Timer done"
        message={`${doneLabel ?? ''} finished.`}
        actions={[{ label: 'OK', variant: 'primary' }]}
        onClose={() => setDoneLabel(null)}
      />
    </Ctx.Provider>
  );
}

export function useStepTimer(): StepTimerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStepTimer outside StepTimerProvider');
  return ctx;
}
