'use client';

import { type FormEvent, useState } from 'react';
import {
  ApiFailure,
  describeFailure,
  getDbState,
  UNAUTHORIZED,
} from '@/lib/api';

type Props = {
  /** Called with a password the api has already accepted. */
  onUnlock: (secret: string) => void;
};

/**
 * The password screen.
 *
 * The password is checked against the api here rather than stored and found
 * out about on the next request: a wrong one should never be written to this
 * browser at all. It costs one GET, which is a DescribeDBInstances call.
 */
export const PasswordGate = ({ onUnlock }: Props) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value || checking) return;

    setChecking(true);
    setError(null);

    try {
      await getDbState(value);
      // Deliberately no setChecking(false): this unmounts on the next render.
      onUnlock(value);
    } catch (err) {
      setError(
        err instanceof ApiFailure && err.status === UNAUTHORIZED
          ? 'Wrong password.'
          : describeFailure(err)
      );
      setChecking(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-3"
    >
      <label htmlFor="secret" className="sr-only">
        Password
      </label>
      <input
        id="secret"
        name="secret"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="password"
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:placeholder:text-neutral-600 dark:focus:border-neutral-500"
      />
      <button
        type="submit"
        disabled={!value || checking}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-50 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {checking ? 'Checking…' : 'Enter'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </form>
  );
};
