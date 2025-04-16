import React from 'react';
import { AppShell, NavLink, Group, Text, Burger, useMantineTheme, UnstyledButton, Box, useMantineColorScheme, MantineTheme, MantineColorScheme } from '@mantine/core';
import { IconHome2, IconFolder, IconUsers, IconMap2, IconSearch, IconActivity, IconLogout, IconBell, IconFileImport } from '@tabler/icons-react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useState } from 'react';

// Define los ítems de navegación
const navItems = [
  { icon: IconHome2, label: 'Dashboard', path: '/' },
  { icon: IconFolder, label: 'Gestión de Casos', path: '/casos' },
  { icon: IconUsers, label: 'Gestión de Lectores', path: '/lectores' },
  { icon: IconFileImport, label: 'Importar Datos', path: '/importar' },
  { icon: IconMap2, label: 'Vista de Mapa', path: '/mapa' },
  { icon: IconSearch, label: 'Búsqueda Multi-Caso', path: '/busqueda' },
  { icon: IconActivity, label: 'Detección de Patrones', path: '/patrones' },
  // ... más items si los necesitas
];

// Helper para resolver el color scheme efectivo ('auto' -> 'light')
const getEffectiveColorScheme = (scheme: MantineColorScheme): 'light' | 'dark' => {
  return scheme === 'auto' ? 'light' : scheme;
};

// Estilos específicos para NavLink
const getNavLinkStyles = (theme: MantineTheme, scheme: MantineColorScheme) => {
  const activeBgColor = theme.variantColorResolver({
    color: theme.primaryColor,
    theme,
    variant: 'light',
  }).background;
  // activeColor ya no se usa para el texto, pero podría usarse para el icono si quisiéramos
  // const activeColor = theme.variantColorResolver({
  //   color: theme.primaryColor,
  //   theme,
  //   variant: 'light',
  // }).color;

  return {
    root: {
      borderRadius: theme.radius.sm,
      color: theme.white, // Color base blanco
      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
      '&[data-active]': {
        backgroundColor: activeBgColor, // Fondo claro para el activo
        color: theme.colors.red[6], // Texto rojo para el activo
        fontWeight: 500,
      },
      '&:hover:not([data-active])': {
        // Usar un fondo hover más claro para probar contraste
        backgroundColor: theme.colors.dark[3], 
        color: theme.colors.red[6], // Mantener texto rojo en hover
      },
    },
    // leftSection: { marginRight: theme.spacing.md },
  };
};

function Layout() {
  const location = useLocation();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const effectiveScheme = getEffectiveColorScheme(colorScheme);
  const [opened, setOpened] = useState(false); // Estado para controlar navbar en móvil

  const links = navItems.map((item) => (
    <NavLink
      key={item.label}
      label={item.label}
      leftSection={<item.icon size="1rem" stroke={1.5} />} // Usar leftSection para el icono
      component={Link}
      to={item.path}
      active={location.pathname === item.path}
      styles={() => getNavLinkStyles(theme, colorScheme)}
      onClick={() => setOpened(false)} // Cerrar navbar al hacer clic en móvil
    />
  ));

  return (
    <AppShell
      padding="md"
      // Configuración del Header
      header={{
        height: 60,
        // mobileHeight: 50 // Altura diferente en móvil si se necesita
      }}
      // Configuración del Navbar
      navbar={{
        width: { base: 280 },
        breakpoint: 'sm', // Breakpoint para ocultar/mostrar burger y colapsar navbar
        collapsed: { mobile: !opened } // Controla si está colapsado en móvil
      }}
    >
      {/* Header */}
      <AppShell.Header p="md">
          <Group h="100%" align="center">
            {/* Burger visible solo en móvil (por debajo del breakpoint 'sm') */}
            <Burger opened={opened} onClick={() => setOpened((o) => !o)} hiddenFrom="sm" size="sm" />
            {/* Contenido del Header */}
            <Group style={{ flexGrow: 1 }} justify="space-between">
                {/* Cambiar título del Navbar */}
                <Text c="tracerBlue.7" fw={500}>JSP Madrid - Brigada Provincial de Policía Judicial</Text>
                <Group>
                    <IconBell size="1.5rem" stroke={1.5} />
                    <Text size="sm">Administrador</Text>
                </Group>
            </Group>
          </Group>
      </AppShell.Header>

      {/* Navbar */}
      <AppShell.Navbar p="md" style={{ backgroundColor: theme.colors.tracerBlue[8] }}>
          <AppShell.Section>
            <Group justify="space-between">
              {/* Cambiar título del Sidebar */}
              <Text size="xl" fw={700} c="white" ml="xs">Tracer LPR</Text>
            </Group>
          </AppShell.Section>
          <AppShell.Section grow mt="lg">
            {links}
          </AppShell.Section>
          <AppShell.Section>
            <UnstyledButton
              onClick={() => console.log('Cerrar sesión')}
              style={{
                display: 'block', width: '100%',
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                borderRadius: theme.radius.sm,
                color: effectiveScheme === 'dark' ? theme.colors.dark[0] : theme.colors.gray[7],
              }}
             onMouseEnter={(e) => e.currentTarget.style.backgroundColor = effectiveScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0]}
             onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <Group>
                    <IconLogout size="1rem" stroke={1.5} color={effectiveScheme === 'dark' ? theme.colors.dark[0] : theme.colors.gray[7]}/>
                    <Text size="sm" c={effectiveScheme === 'dark' ? theme.colors.dark[0] : theme.colors.gray[7]}>Cerrar Sesión</Text>
                </Group>
            </UnstyledButton>
          </AppShell.Section>
      </AppShell.Navbar>

      {/* Contenido principal */}
      <AppShell.Main style={{ background: effectiveScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0] }}>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

export default Layout; 