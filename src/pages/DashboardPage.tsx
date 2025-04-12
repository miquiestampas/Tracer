import React from 'react';
import { SimpleGrid, Card, Text, Group, ThemeIcon, rem, Box } from '@mantine/core'; // Import rem para tamaños de icono y Box
import { IconFolder, IconUsers, IconMap2, IconSearch, IconActivity, IconFileImport, IconDatabase } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

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
    description: 'Configura y gestiona lectores OCR con ubicaciones.'
  },
  {
    title: 'Importar Datos',
    icon: IconFileImport,
    color: 'violet',
    path: '/importar',
    description: 'Importa archivos Excel (LPR/GPS) a los casos.'
  },
  {
    title: 'Búsqueda y Análisis',
    icon: IconSearch,
    color: 'grape',
    path: '/busqueda',
    description: 'Busca y analiza datos de vehículos en todos los casos.'
  },
  {
    title: 'Vista de Mapa Global',
    icon: IconMap2,
    color: 'orange',
    path: '/mapa',
    description: 'Visualiza todos los lectores OCR en el mapa.'
  },
  {
    title: 'Detección de Patrones',
    icon: IconActivity,
    color: 'red',
    path: '/patrones',
    description: 'Analiza patrones para detectar comportamientos sospechosos.'
  },
  {
      title: 'Gestión de Vehículos',
      icon: IconDatabase, // O un icono de coche
      color: 'lime',
      path: '/vehiculos',
      description: 'Gestiona la base de datos de vehículos de interés.'
    },
];

// Datos de ejemplo para los widgets de resumen
const summaryData = [
    { title: 'Casos Activos', value: '15', color: 'blue' },
    { title: 'Lectores Registrados', value: '125', color: 'teal' },
    { title: 'Vehículos de Interés', value: '42', color: 'lime' },
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

  // Mapea los datos a componentes Card de resumen
  const summaryWidgets = summaryData.map((widget) => (
    <Card key={widget.title} shadow="sm" p="lg" radius="md" withBorder>
        <Text size="xl" fw={700} c={widget.color}>{widget.value}</Text>
        <Text size="xs" c="dimmed" tt="uppercase">{widget.title}</Text>
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

      {/* Sección de Resumen */}
      <Text size="lg" fw={500} mb="md" c="tracerBlue.7">Resumen General</Text>
      <SimpleGrid
        cols={{ base: 2, sm: 4 }} // Más columnas para widgets más pequeños
        spacing="lg"
      >
        {summaryWidgets}
      </SimpleGrid>
    </Box>
  );
}

export default DashboardPage; 