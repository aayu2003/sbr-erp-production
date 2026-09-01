import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { GUEST_SCOPE_PROCUREMENT } from '@/lib/guestApi';

/**
 * Invisible. Watches for a `?guest=<token>` param and turns it into a validated
 * guest session, and re-checks a stored session on load so a revoked link stops
 * unlocking the UI. Mount once inside the Router.
 */
const GuestGate = () => {
  const [params, setParams] = useSearchParams();
  const { token: authToken, guest, activateGuest, clearGuest } = useAuth();
  const revalidated = useRef(false);

  const guestParam = params.get('guest')?.trim() || '';

  // New link arriving in the URL — validate it, then drop the token from the
  // address bar (it lives in localStorage now; keeping it visible only invites
  // shoulder-surfing and stale copies).
  useEffect(() => {
    if (authToken) return; // a real login always wins
    if (!guestParam) return;

    const consume = () => {
      const next = new URLSearchParams(params);
      next.delete('guest');
      setParams(next, { replace: true });
    };

    if (guest?.token === guestParam) {
      consume();
      return;
    }
    void activateGuest(guestParam, GUEST_SCOPE_PROCUREMENT).finally(consume);
  }, [authToken, guestParam, guest?.token, activateGuest, params, setParams]);

  // Stored session — confirm it's still live once per app load.
  useEffect(() => {
    if (authToken || !guest || revalidated.current) return;
    if (guestParam && guestParam === guest.token) return; // the effect above handles it
    revalidated.current = true;
    void activateGuest(guest.token, guest.scope).then((ok) => {
      if (!ok) clearGuest();
    });
  }, [authToken, guest, guestParam, activateGuest, clearGuest]);

  return null;
};

export default GuestGate;
