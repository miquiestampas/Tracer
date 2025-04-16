import React from 'react';
import { SimpleGrid, Card, Text, Group, ThemeIcon, rem, Box } from '@mantine/core'; // Import rem para tamaños de icono y Box
import { IconFolder, IconUsers, IconMap2, IconSearch, IconActivity, IconFileImport, IconDatabase } from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';

// Datos de ejemplo para las tarjetas de acción
const actionCardsData = [
  {
    title: 'Gestión de Casos',
    icon: IconFolder,
    color: 'blue',
    path: '/casos',
    description: 'Crea y gestiona casos para organizar investigaciones.'
  },
  {
    title: 'Gestión de Lectores OCR',
    icon: IconUsers,
    color: 'teal',
    path: '/lectores',
    description: 'Configura y gestiona lectores OCR con ubicaciones.',
    initialTab: 'config'
  },
  {
    title: 'Vista de Mapa Global',
    icon: IconMap2,
    color: 'orange',
    path: '/lectores',
    description: 'Visualiza todos los lectores OCR en el mapa.',
    initialTab: 'mapa'
  },
  {
    title: 'Importar Datos',
    icon: IconFileImport,
    color: 'violet',
    path: '/importar',
    description: 'Importa archivos Excel (LPR/GPS) a los casos.'
  },
  {
    title: 'Búsqueda Multi-Caso',
    icon: IconSearch,
    color: 'grape',
    path: '/busqueda',
    description: 'Busca y analiza datos de vehículos en todos los casos.'
  },
];

// Datos de ejemplo para los widgets de resumen
const summaryData = [
    { title: 'Casos Activos', value: '15', color: 'blue' },
    { title: 'Lectores Registrados', value: '125', color: 'teal' },
    { title: 'Lecturas Hoy', value: '1,280', color: 'grape' },
  ];

function DashboardPage() {
  // Mapea los datos a componentes Card de acción
  const actionCards = actionCardsData.map((feature) => (
    <Card
      key={feature.title}
      shadow="md"
      radius="md"
      p="xl"
      component={Link}
      to={feature.path}
      state={feature.initialTab ? { initialTab: feature.initialTab } : undefined}
      style={{ textDecoration: 'none' }} // Evitar subrayado del link
      withBorder // Añadir un borde sutil
    >
      <Group align="flex-start"> {/* Alinear icono y texto */} 
        <ThemeIcon
            size="xl"
            radius="md"
            variant="light" // Usar variante light para mejor contraste con el color
            color={feature.color}
        >
            <feature.icon style={{ width: rem(28), height: rem(28) }} stroke={1.5} />
        </ThemeIcon>
        <div style={{ flex: 1 }}> {/* Permitir que el texto ocupe el espacio */} 
            <Text size="lg" fw={500} mt={4}> {/* Ajustar margen superior */} 
                {feature.title}
            </Text>
            <Text size="sm" c="dimmed" mt="sm">
                {feature.description}
            </Text>
        </div>
       </Group>
    </Card>
  ));

  return (
    <Box>
      <Text size="xl" fw={500} mb="lg" c="tracerBlue.7">Panel Principal de Tracer</Text>

      {/* Sección de Acciones Rápidas */}
      <SimpleGrid
        cols={{ base: 1, sm: 2, lg: 3 }} // Ajustar columnas según tamaño pantalla
        spacing="lg"
        mb="xl" // Margen inferior antes de los widgets
      >
        {actionCards}
      </SimpleGrid>
    </Box>
  );
}

export default DashboardPage; 