import React from 'react';
import { Stack, Text, UnstyledButton, useMantineTheme, Box, AppShell, Burger, Group, Button } from '@mantine/core';
import { IconHome2, IconFolder, IconUsers, IconFileImport, IconSearch, IconDeviceCctv, IconArrowsExchange } from '@tabler/icons-react';
import { useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '../../context/AuthContext';
import Navbar from './Navbar';

const navItems = [
  { icon: IconHome2, label: 'Home', path: '/' },
  { icon: IconFolder, label: 'Investigaciones', path: '/casos' },
  { icon: IconFileImport, label: 'Importar Datos', path: '/importar' },
  { icon: IconArrowsExchange, label: 'Búsqueda Multi-Caso', path: '/busqueda' },
  { icon: IconDeviceCctv, label: 'Gestión de Lectores', path: '/lectores' },
];

function Layout() {
  const location = useLocation();
  const theme = useMantineTheme();
  const [opened, { toggle }] = useDisclosure();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 300, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header style={{ background: '#f5f6fa', color: '#222' }}>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text size="xl" fw={700} c="#222">LPR Tracer</Text>
          </Group>
          {user && (
            <Group>
              <Text size="sm" c="#222">
                {user.user} - {user.grupo?.Nombre || 'Sin grupo'}
              </Text>
              <Button variant="light" color="red" size="xs" onClick={handleLogout}>
                Cerrar sesión
              </Button>
            </Group>
          )}
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Navbar />
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

export default Layout; 