import React, { useState, useEffect, useCallback } from 'react';
import { SimpleGrid, Card, Text, Group, ThemeIcon, rem, Box, Stack, Paper, Grid, RingProgress, Center, Loader, Alert } from '@mantine/core';
import { IconFolder, IconDeviceCctv, IconMap2, IconSearch, IconFileImport, IconDatabase } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { getEstadisticasGlobales } from '../services/estadisticasApi';
import { getArchivosRecientes, getImportacionesRecientes } from '../services/dashboardApi';
import { QuickSearch } from '../components/dashboard/QuickSearch';
import { ImportTimeline } from '../components/dashboard/ImportTimeline';
import { RecentFiles } from '../components/dashboard/RecentFiles';

// Datos de ejemplo para las tarjetas de acción
const actionCardsData = [
  {
    title: 'Investigaciones',
    icon: IconFolder,
    color: 'blue',
    path: '/casos',
    description: 'Crea, gestiona y accede al panel principal de herramientas de investigación'
  },
  {
    title: 'Importar Datos',
    icon: IconFileImport,
    color: 'violet',
    path: '/importar',
    description: 'Importa archivos Excel (LPR/GPS) a los casos.'
  },
  {
    title: 'Análisis GPS',
    icon: IconMap2,
    color: 'cyan',
    path: '/analisis-gps',
    description: 'Analiza rutas y patrones de movimiento a partir de datos GPS.'
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
  { title: 'Base de Datos', value: '2.5 TB', color: 'blue', icon: IconDatabase },
  { title: 'Casos Activos', value: '15', color: 'green', icon: IconFolder },
  { title: 'Lecturas Totales', value: '1,234,567', color: 'violet', icon: IconDeviceCctv },
  { title: 'Vehículos Registrados', value: '89,123', color: 'orange', icon: IconSearch },
];

function HomePage() {
  const [estadisticas, setEstadisticas] = useState<{ total_casos: number; total_lecturas: number; total_vehiculos: number; tamanio_bd: string } | null>(null);
  const [estadisticasLoading, setEstadisticasLoading] = useState(true);
  const [estadisticasError, setEstadisticasError] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<any[]>([]);
  const [importEvents, setImportEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState({
    files: true,
    imports: true
  });

  const fetchEstadisticas = useCallback(async () => {
    setEstadisticasLoading(true);
    setEstadisticasError(null);
    try {
      const data = await getEstadisticasGlobales();
      setEstadisticas(data);
    } catch (err: any) {
      setEstadisticasError(err.message || 'Error al cargar las estadísticas.');
      setEstadisticas(null);
    } finally {
      setEstadisticasLoading(false);
    }
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [files, imports] = await Promise.all([
        getArchivosRecientes(),
        getImportacionesRecientes()
      ]);
      setRecentFiles(files);
      setImportEvents(imports);
    } catch (error) {
      console.error('Error al cargar datos del dashboard:', error);
    } finally {
      setLoading({
        files: false,
        imports: false
      });
    }
  }, []);

  useEffect(() => {
    fetchEstadisticas();
    fetchDashboardData();
  }, [fetchEstadisticas, fetchDashboardData]);

  const handleQuickSearch = async (matricula: string) => {
    // Implementar la búsqueda de matrícula
    console.log('Buscando matrícula:', matricula);
  };

  return (
    <Box style={{ padding: '20px 32px' }}>
      <Grid>
        {/* Columna Izquierda */}
        <Grid.Col span={{ base: 12, md: 8 }}>
          {/* Buscador Rápido */}
          <QuickSearch onSearch={handleQuickSearch} />

          {/* Tarjetas de Acción */}
          <SimpleGrid cols={1} spacing="lg" mt="xl">
            {actionCardsData.map((feature) => (
              <Card
                key={feature.title}
                shadow="sm"
                radius="md"
                p="lg"
                component={Link}
                to={feature.path}
                style={{ textDecoration: 'none' }}
                withBorder
              >
                <Group>
                  <ThemeIcon
                    size="xl"
                    radius="md"
                    variant="light"
                    color={feature.color}
                  >
                    <feature.icon style={{ width: rem(24), height: rem(24) }} stroke={1.5} />
                  </ThemeIcon>
                  <div style={{ flex: 1 }}>
                    <Text size="lg" fw={500}>
                      {feature.title}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {feature.description}
                    </Text>
                  </div>
                </Group>
              </Card>
            ))}
          </SimpleGrid>

          {/* Archivos Recientes */}
          <Box mt="xl">
            <RecentFiles files={recentFiles} />
          </Box>
        </Grid.Col>

        {/* Columna Derecha */}
        <Grid.Col span={{ base: 12, md: 4 }}>
          {/* Contadores */}
          <SimpleGrid cols={2} spacing="lg">
            {summaryData.map((stat) => (
              <Paper key={stat.title} p="lg" withBorder>
                <Group>
                  <ThemeIcon size="xl" color={stat.color} variant="light">
                    <stat.icon size={24} />
                  </ThemeIcon>
                  <div>
                    <Text size="sm" c="dimmed">
                      {stat.title}
                    </Text>
                    <Text fw={500} size="xl">
                      {estadisticasLoading ? (
                        <Loader size="xs" />
                      ) : estadisticas ? (
                        stat.title === 'Base de Datos' ? estadisticas.tamanio_bd :
                        stat.title === 'Casos Activos' ? estadisticas.total_casos :
                        stat.title === 'Lecturas Totales' ? estadisticas.total_lecturas :
                        estadisticas.total_vehiculos
                      ) : (
                        '-'
                      )}
                    </Text>
                  </div>
                </Group>
              </Paper>
            ))}
          </SimpleGrid>

          {/* Timeline de Importaciones */}
          <Box mt="xl">
            <ImportTimeline events={importEvents} />
          </Box>
        </Grid.Col>
      </Grid>
    </Box>
  );
}

export default function HomePageWrapper(props: any) {
  return <HomePage {...props} />;
} 