'use client';

import { useCallback, useEffect, useState } from 'react';
import { DbCard } from '@/components/DbCard';
import { PasswordGate } from '@/components/PasswordGate';
import { clearSecret, readSecret, writeSecret } from '@/lib/secret';

export default function Page() {
  // localStorage cannot be read while this page is being prerendered into the
  // static export, so the first render has to be the same markup here as in
  // the browser or react throws a hydration mismatch. `ready` is what tells
  // "not looked yet" apart from "looked, and there is no password" -- both of
  // which are `secret === null`.
  const [ready, setReady] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  useEffect(() => {
    setSecret(readSecret());
    setReady(true);
  }, []);

  const signIn = useCallback((value: string) => {
    writeSecret(value);
    setSecret(value);
  }, []);

  const signOut = useCallback(() => {
    clearSecret();
    setSecret(null);
  }, []);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">polaris</h1>
        {ready && secret && (
          <button
            type="button"
            onClick={signOut}
            className="text-sm text-neutral-500 underline-offset-4 hover:underline dark:text-neutral-400"
          >
            sign out
          </button>
        )}
      </header>

      {ready &&
        (secret ? (
          <DbCard secret={secret} onUnauthorized={signOut} />
        ) : (
          <PasswordGate onUnlock={signIn} />
        ))}
    </main>
  );
}
