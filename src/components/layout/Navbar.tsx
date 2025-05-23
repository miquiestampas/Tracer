import React from 'react';
import { Stack, Text, UnstyledButton, useMantineTheme } from '@mantine/core';
import { IconHome2, IconFolder, IconFileImport, IconArrowsExchange, IconDeviceCctv, IconSettings } from '@tabler/icons-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getFooterConfig } from '../../services/configApi';

const navItems = [
  { icon: IconHome2, label: 'Home', path: '/' },
  { icon: IconFolder, label: 'Investigaciones', path: '/casos' },
  { icon: IconFileImport, label: 'Importar Datos', path: '/importar' },
  { icon: IconArrowsExchange, label: 'Búsqueda Multi-Caso', path: '/busqueda' },
  { icon: IconDeviceCctv, label: 'Gestión de Lectores', path: '/lectores' },
];

interface NavbarProps { collapsed: boolean }
const Navbar: React.FC<NavbarProps> = ({ collapsed }) => {
  const location = useLocation();
  const theme = useMantineTheme();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [footerText, setFooterText] = React.useState('JSP Madrid - Brigada Provincial de Policía Judicial');

  // Cargar el texto del footer al montar el componente
  React.useEffect(() => {
    const loadFooterConfig = async () => {
      try {
        const config = await getFooterConfig();
        setFooterText(config.text);
      } catch (error) {
        console.error('Error al cargar la configuración del footer:', error);
      }
    };
    loadFooterConfig();
  }, []);

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
        <Stack gap={8} style={{ flex: 1 }}>
          {navItems.map((item) => (
            <UnstyledButton
              key={item.path}
              onClick={() => location.pathname !== item.path && navigate(item.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: collapsed ? 0 : 12,
                fontSize: 18,
                fontWeight: 500,
                color: location.pathname === item.path ? '#000' : '#fff',
                background: location.pathname === item.path ? '#fff' : 'transparent',
                borderRadius: 8,
                padding: collapsed ? '12px 0' : '12px 10px',
                transition: 'background 0.2s, color 0.2s',
                width: '100%',
                marginBottom: 2,
              }}
            >
              <item.icon size="1.3rem" stroke={1.5} style={{ color: location.pathname === item.path ? '#000' : '#fff', margin: collapsed ? '0 auto' : undefined }} />
              {!collapsed && <span>{item.label}</span>}
            </UnstyledButton>
          ))}
        </Stack>
        <Stack gap={4} align="center" mb={8}>
          {!collapsed && <Text size="md" style={{ color: '#fff' }}>Administrador</Text>}
          {user?.Rol === 'superadmin' && (
            <UnstyledButton
              onClick={() => navigate('/admin')}
              style={{
                display: 'block',
                padding: collapsed ? '8px 0' : '8px 16px',
                borderRadius: theme.radius.sm,
                color: '#fff',
                fontWeight: 500,
                fontSize: 16,
                background: location.pathname === '/admin' ? 'rgba(255, 255, 255, 0.1)' : 'none',
                transition: 'background 0.2s, color 0.2s',
                width: '100%',
                textAlign: 'center',
              }}
            >
              {!collapsed && <Text size="md" style={{ color: '#fff' }}>Panel de Administración</Text>}
              {collapsed && <IconSettings size={20} color="#fff" />}
            </UnstyledButton>
          )}
          {!collapsed && (
            <Text size="sm" style={{ color: '#fff', background: 'rgba(128, 128, 128, 0.5)', padding: '8px 16px', borderRadius: theme.radius.sm, textAlign: 'center' }}>
              {footerText}
            </Text>
          )}
        </Stack>
      </Stack>
    </div>
  );
};

export default Navbar; 