import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useState } from 'react';
import { warmCeoDeskData } from '@/lib/ceoDeskData';

const AuthLanding = () => {
  const { loading, validateToken } = useAuth();
  const [checked, setChecked] = useState(false);
  const [ok, setOk] = useState(false);

  // A returning user with a live token lands straight on the CEO's Desk — prefetch its
  // heavy route chunk during the token check so it isn't a cold load after the redirect.
  useEffect(() => {
    const timer = setTimeout(() => {
      void import('./CeosDesk');
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loading) return;
    let mounted = true;
    (async () => {
      try {
        const result = await validateToken();
        if (mounted) setOk(result);
        // Token's good and we're about to redirect to the desk — start its data requests now.
        if (result) warmCeoDeskData();
      } catch {
        if (mounted) setOk(false);
      } finally {
        if (mounted) setChecked(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loading, validateToken]);

  if (loading) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  if (!checked) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return ok ? <Navigate to="/ceos-desk" replace /> : <Navigate to="/login" replace />;
};

export default AuthLanding;
