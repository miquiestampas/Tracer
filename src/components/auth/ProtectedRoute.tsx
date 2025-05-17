import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader, Center } from '@mantine/core';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireSuperAdmin?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireSuperAdmin = false }) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <Center style={{ minHeight: '100vh', width: '100%' }}>
        <Loader size="xl" />
      </Center>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // TEMPORARY DEBUG LOGGING
  if (requireSuperAdmin) {
    console.log('[ProtectedRoute] Checking for superadmin. User object:', JSON.parse(JSON.stringify(user)));
    console.log('[ProtectedRoute] User Rol:', user?.Rol);
    console.log('[ProtectedRoute] Expected Rol:', "superadmin");
    console.log('[ProtectedRoute] Condition result (user.Rol?.toLowerCase() !== \'superadmin\'):', user?.Rol?.toLowerCase() !== 'superadmin');
  }
  // END TEMPORARY DEBUG LOGGING

  if (requireSuperAdmin && (!user || user.Rol?.toLowerCase() !== 'superadmin')) {
    console.warn('[ProtectedRoute] Access denied for superadmin route. User Rol:', user?.Rol, 'Redirecting to /');
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute; 