import React from 'react';
import { Stack, Text, UnstyledButton, useMantineTheme, Box } from '@mantine/core';
import { IconHome2, IconFolder, IconUsers, IconFileImport, IconSearch } from '@tabler/icons-react';
import { useLocation, Outlet } from 'react-router-dom';

const navItems = [
  { icon: IconHome2, label: 'Home', path: '/' },
  { icon: IconFolder, label: 'Investigaciones', path: '/casos' },
  { icon: IconUsers, label: 'Gestión de Lectores', path: '/lectores' },
  { icon: IconFileImport, label: 'Importar Datos', path: '/importar' },
  { icon: IconSearch, label: 'Búsqueda Multi-Caso', path: '/busqueda' },
];

function Layout() {
  const location = useLocation();
  const theme = useMantineTheme();

  return (
    <Box style={{ display: 'flex', minHeight: '100vh', width: '100vw', background: theme.colors.gray[0] }}>
      <Box
        style={{
          width: 280,
          padding: 16,
          background: 'rgba(20, 40, 120, 0.95)',
          borderRight: `1px solid ${theme.colors.tracerBlue?.[2] || '#223'}`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '100vh',
        }}
      >
        <Stack gap={32} style={{ height: '100%' }}>
          <Text fw={700} size="xl" style={{ color: '#fff', textAlign: 'center' }}>
            Tracer LPR
          </Text>
          <Stack gap={8} style={{ flex: 1 }}>
            {navItems.map((item) => (
              <UnstyledButton
                key={item.path}
                onClick={() => location.pathname !== item.path && window.location.assign(item.path)}
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
            <UnstyledButton
              onClick={() => console.log('Cerrar sesión')}
              style={{
                display: 'block',
                padding: '8px 16px',
                borderRadius: theme.radius.sm,
                color: '#fff',
                fontWeight: 500,
                fontSize: 16,
                background: 'none',
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              <Text size="md" style={{ color: '#fff' }}>Cerrar Sesión</Text>
            </UnstyledButton>
            <Text size="sm" style={{ color: '#fff', background: 'rgba(128, 128, 128, 0.5)', padding: '8px 16px', borderRadius: theme.radius.sm, textAlign: 'center' }}>JSP Madrid - Brigada Provincial de Policía Judicial</Text>
          </Stack>
        </Stack>
      </Box>
      <Box style={{ flex: 1, minHeight: '100vh', padding: 32 }}>
        <Outlet />
      </Box>
    </Box>
  );
}

export default Layout; 