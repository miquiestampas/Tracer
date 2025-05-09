import React from 'react';
import { Stack, Text, UnstyledButton, useMantineTheme } from '@mantine/core';
import { IconHome2, IconFolder, IconFileImport, IconArrowsExchange, IconDeviceCctv } from '@tabler/icons-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { icon: IconHome2, label: 'Home', path: '/' },
  { icon: IconFolder, label: 'Investigaciones', path: '/casos' },
  { icon: IconFileImport, label: 'Importar Datos', path: '/importar' },
  { icon: IconArrowsExchange, label: 'Búsqueda Multi-Caso', path: '/busqueda' },
  { icon: IconDeviceCctv, label: 'Gestión de Lectores', path: '/lectores' },
];

const Navbar: React.FC = () => {
  const location = useLocation();
  const theme = useMantineTheme();
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#2b4fcf',
        borderRight: `1px solid ${theme.colors.tracerBlue?.[2] || '#223'}`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 16,
      }}
    >
      <Stack gap={32} style={{ height: '100%' }}>
        <Text fw={700} size="xl" style={{ color: '#fff', textAlign: 'center' }}>
          LPR Tracer
        </Text>
        <Stack gap={8} style={{ flex: 1 }}>
          {navItems.map((item) => (
            <UnstyledButton
              key={item.path}
              onClick={() => location.pathname !== item.path && navigate(item.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 18,
                fontWeight: 500,
                color: location.pathname === item.path ? '#000' : '#fff',
                background: location.pathname === item.path ? '#fff' : 'transparent',
                borderRadius: 8,
                padding: '12px 10px',
                transition: 'background 0.2s, color 0.2s',
                width: '100%',
                marginBottom: 2,
              }}
            >
              <item.icon size="1.3rem" stroke={1.5} style={{ color: location.pathname === item.path ? '#000' : '#fff' }} />
              <span>{item.label}</span>
            </UnstyledButton>
          ))}
        </Stack>
        <Stack gap={4} align="center" mb={8}>
          <Text size="md" style={{ color: '#fff' }}>Administrador</Text>
          {user?.rol === 'superadmin' && (
            <UnstyledButton
              onClick={() => navigate('/admin')}
              style={{
                display: 'block',
                padding: '8px 16px',
                borderRadius: theme.radius.sm,
                color: '#fff',
                fontWeight: 500,
                fontSize: 16,
                background: location.pathname === '/admin' ? 'rgba(255, 255, 255, 0.1)' : 'none',
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              <Text size="md" style={{ color: '#fff' }}>Panel de Administración</Text>
            </UnstyledButton>
          )}
          <Text size="sm" style={{ color: '#fff', background: 'rgba(128, 128, 128, 0.5)', padding: '8px 16px', borderRadius: theme.radius.sm, textAlign: 'center' }}>JSP Madrid - Brigada Provincial de Policía Judicial</Text>
        </Stack>
      </Stack>
    </div>
  );
};

export default Navbar; 