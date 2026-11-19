'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ApiFailure,
  describeFailure,
  getDbState,
  isSettled,
  startDb,
  stopDb,
  UNAUTHORIZED,
} from '@/lib/api';
import type { DbState } from '@/types/api';

const POLL_MS = 10_000;

type Call = (secret: string) => Promise<DbState>;

type Props = {
  secret: string;
  /** The stored password is no longer any good; the page should ask again. */
  onUnauthorized: () => void;
};

const dot = (status: string): string => {
  if (status === 'available') return 'bg-emerald-500';
  if (status === 'stopped') return 'bg-neutral-400';
  if (status === 'unknown') return 'bg-rose-500';

  // starting, stopping, backing-up, modifying: on its way somewhere
  return 'animate-pulse bg-amber-500';
};

const BUTTON =
  'rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700';

/**
 * This environment's MySQL instance: what it is doing, and the two buttons
 * that change it. Both answer 403 outside the test environment, which is what
 * `readOnly` lets this say in words rather than leaving two dead buttons.
 */
export const DbCard = ({ secret, onUnauthorized }: Props) => {
  const [state, setState] = useState<DbState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (call: Call) => {
      try {
        setState(await call(secret));
        setError(null);
      } catch (err) {
        // The password was changed on the server, or this browser's copy was
        // never right. Either way it is not worth keeping.
        if (err instanceof ApiFailure && err.status === UNAUTHORIZED) {
          onUnauthorized();

          return;
        }
        setError(describeFailure(err));
      }
    },
    [secret, onUnauthorized]
  );

  const act = useCallback(
    async (call: Call) => {
      setBusy(true);
      await run(call);
      setBusy(false);
    },
    [run]
  );

  useEffect(() => void run(getDbState), [run]);

  // RDS takes minutes to get between states and gets there on its own, so the
  // page follows it instead of asking someone to press refresh. Only while
  // this tab is in front: a back-office tab left open over a weekend should
  // not keep calling. The effect depends on whether to poll, not on the state
  // itself, so a poll does not tear its own timer down and restart it.
  const polling = state !== null && !isSettled(state.status);

  useEffect(() => {
    if (!polling) return;

    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void run(getDbState);
    }, POLL_MS);

    return () => window.clearInterval(id);
  }, [polling, run]);

  if (!state)
    return (
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {error ?? 'Loading…'}
      </p>
    );

  const writable = !state.readOnly && !busy;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-col gap-1">
        <h2 className="font-mono text-sm text-neutral-600 dark:text-neutral-400">
          {state.identifier}
        </h2>
        <p className="flex items-center gap-2 text-lg font-medium">
          <span
            aria-hidden
            className={`inline-block size-2.5 rounded-full ${dot(state.status)}`}
          />
          {state.status}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!writable || !state.canStart}
          onClick={() => void act(startDb)}
          className={BUTTON}
        >
          Start
        </button>
        <button
          type="button"
          disabled={!writable || !state.canStop}
          onClick={() => void act(stopDb)}
          className={BUTTON}
        >
          Stop
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(getDbState)}
          aria-label="Refresh"
          title="Refresh"
          className={`${BUTTON} ml-auto`}
        >
          ↻
        </button>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-500">
        {state.readOnly
          ? 'This environment can only report. Starting and stopping are open in test only, and the role here has no permission for either.'
          : polling
            ? `Following the instance, every ${POLL_MS / 1000}s.`
            : 'AWS force-starts a stopped instance after 7 days.'}
      </p>

      {error && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </section>
  );
};
