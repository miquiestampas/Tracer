import React from 'react';
import { Stack, Text, UnstyledButton, useMantineTheme, Box, AppShell, Burger, Group, Button, ActionIcon } from '@mantine/core';
import { IconHome2, IconFolder, IconUsers, IconFileImport, IconSearch, IconDeviceCctv, IconArrowsExchange, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '../../context/AuthContext';
import Navbar from './Navbar';
import HelpButton from '../common/HelpButton';
import HelpCenterModal from '../common/HelpCenterModal';
import TaskStatusMonitor from '../common/TaskStatusMonitor';

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
  const [opened, { toggle }] = useDisclosure(true);
  const [collapsed, setCollapsed] = React.useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [currentTaskId, setCurrentTaskId] = React.useState<string | null>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: collapsed ? 70 : 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
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
                {user.User} - {user.grupo?.Nombre || 'Sin grupo'}
              </Text>
              <Button variant="default" size="xs" onClick={() => setHelpOpen(true)}>
                Mostrar ayuda
              </Button>
              <Button variant="light" color="red" size="xs" onClick={handleLogout}>
                Cerrar sesión
              </Button>
            </Group>
          )}
        </Group>
        {currentTaskId && (
          <Box style={{ 
            position: 'absolute', 
            top: '60px', 
            left: 0, 
            right: 0, 
            background: 'white', 
            padding: '12px 16px', 
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            borderBottom: '1px solid #eee',
            zIndex: 1000
          }}>
            <Group position="apart" align="center">
              <Text size="sm" fw={500}>Procesando tarea en segundo plano...</Text>
              <TaskStatusMonitor
                taskId={currentTaskId}
                onComplete={() => setCurrentTaskId(null)}
                onError={() => setCurrentTaskId(null)}
                pollingInterval={2000}
                showProgress={true}
                showTotal={true}
              />
            </Group>
          </Box>
        )}
      </AppShell.Header>

      <AppShell.Navbar p={0}>
        <Box style={{ width: collapsed ? 70 : 260, height: '100%', position: 'relative' }}>
          <Navbar collapsed={collapsed} />
          <Box style={{ position: 'absolute', top: 12, right: collapsed ? -28 : -18, zIndex: 10 }}>
            <ActionIcon
              variant="filled"
              color="gray"
              size={32}
              radius="xl"
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
            >
              {collapsed ? <IconChevronRight size={22} /> : <IconChevronLeft size={22} />}
            </ActionIcon>
          </Box>
        </Box>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
      <HelpCenterModal opened={helpOpen} onClose={() => setHelpOpen(false)} />
    </AppShell>
  );
}

export default Layout; 