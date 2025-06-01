import React, { useState, useEffect, useCallback } from 'react';
import { SimpleGrid, Card, Text, Group, ThemeIcon, rem, Box, Stack, Paper, Grid, RingProgress, Center, Loader, Alert, Title, Avatar } from '@mantine/core';
import { IconFolder, IconDeviceCctv, IconMap2, IconSearch, IconFileImport, IconDatabase } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import { getEstadisticasGlobales } from '../services/estadisticasApi';
import { getArchivosRecientes, getImportacionesRecientes } from '../services/dashboardApi';
import { getCasos } from '../services/casosApi';
import { QuickSearch } from '../components/dashboard/QuickSearch';
import { ImportTimeline } from '../components/dashboard/ImportTimeline';
import { ReaderGeoAlerts } from '../components/dashboard/ReaderAlerts';
import BusquedaMulticasoPanel from '../components/busqueda/BusquedaMulticasoPanel';
import { buscarVehiculo } from '../services/dashboardApi';
import { notifications } from '@mantine/notifications';

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
  const [recentCases, setRecentCases] = useState<any[]>([]);
  const [importEvents, setImportEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState({
    files: true,
    imports: true
  });
  const navigate = useNavigate();

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
      const [cases, imports] = await Promise.all([
        getCasos(),
        getImportacionesRecientes()
      ]);
      setRecentCases(cases);
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
    try {
      const resultado = await buscarVehiculo(matricula);
      if (resultado && resultado.lecturas.length > 0) {
        notifications.show({
          title: 'Vehículo encontrado',
          message: `Se encontraron ${resultado.lecturas.length} lecturas para la matrícula ${matricula}`,
          color: 'green',
        });
      } else {
        notifications.show({
          title: 'Vehículo no encontrado',
          message: `No se encontraron lecturas para la matrícula ${matricula}`,
          color: 'yellow',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error en la búsqueda',
        message: 'No se pudo realizar la búsqueda del vehículo',
        color: 'red',
      });
    }
  };

  return (
    <Box style={{ padding: '20px 32px' }}>
      <Grid>
        {/* Columna Izquierda */}
        <Grid.Col span={{ base: 12, md: 8 }}>
          {/* Título para el buscador de matrículas */}
          <Title order={3} mt="md" mb="xs">Búsqueda Rápida</Title>
          {/* Buscador Rápido */}
          <QuickSearch onSearch={handleQuickSearch} />

          {/* Título para Búsqueda Multi-Caso */}
          <Title order={3} mt="md" mb="xs">Búsqueda Multi-Caso</Title>
          {/* Panel de Búsqueda Multi-Caso */}
          <Card shadow="sm" radius="md" padding="lg" withBorder mt={0}>
            <BusquedaMulticasoPanel />
          </Card>
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

          {/* Alerta de lectores sin coordenadas */}
          <ReaderGeoAlerts />

          {/* Timeline de Importaciones */}
          <Box mt="xl">
            <ImportTimeline events={importEvents.slice(0, 6)} />
          </Box>
        </Grid.Col>
      </Grid>
    </Box>
  );
}

export default function HomePageWrapper(props: any) {
  return <HomePage {...props} />;
} 