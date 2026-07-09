import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useState } from 'react';

const AuthLanding = () => {
  const { loading, validateToken } = useAuth();
  const [checked, setChecked] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (loading) return;
    let mounted = true;
    (async () => {
      try {
        const result = await validateToken();
        if (mounted) setOk(result);
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
