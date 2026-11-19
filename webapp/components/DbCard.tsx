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

const POLL_MS = 30_000;

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

/** A clock time, lifted out of the muted note it sits in so it can be scanned. */
const Time = ({ children }: { children: string }) => (
  <span className="font-medium text-neutral-700 dark:text-neutral-300">
    {children}
  </span>
);

/**
 * The notes under the card, in Chinese -- they are the half of this page that
 * explains rather than labels.
 *
 * Held as string literals, and spliced with `{'...'}` where a time is lifted
 * out, because **JSX joins the lines of a text node with a single space**. In
 * English that is invisible; in Chinese, which does not space its words, every
 * line prettier wraps would put a gap in the middle of a sentence.
 */
const READ_ONLY_NOTE =
  '這個環境只能檢視。啟動與停止僅在 test 環境開放,而這裡的 IAM 角色沒有這兩項權限。';

const AUTO_STOP_NOTE =
  '(台北時間)會自動關閉,前提是當下正在執行中。AWS 會在停止滿 7 天後強制啟動,這兩個時間點把因此浪費的時間壓在半天左右。';

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

      <div
        lang="zh-Hant"
        className="flex flex-col gap-1 text-xs text-neutral-500 dark:text-neutral-500"
      >
        {state.readOnly ? (
          <p>{READ_ONLY_NOTE}</p>
        ) : (
          <p>
            {'每天 '}
            <Time>05:00</Time>
            {' 與 '}
            <Time>19:00</Time>
            {AUTO_STOP_NOTE}
          </p>
        )}
        {polling && <p>{`正在追蹤狀態,每 ${POLL_MS / 1000} 秒更新一次。`}</p>}
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </section>
  );
};
