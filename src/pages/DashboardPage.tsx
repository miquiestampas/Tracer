import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SimpleGrid, Card, Text, Group, ThemeIcon, rem, Box, Stack, Paper, Timeline, Badge, Progress, Avatar, ActionIcon, RingProgress, Center, Loader, Alert, Grid, MultiSelect, Autocomplete, Select, Button, Collapse, ScrollArea, Table } from '@mantine/core';
import { IconFolder, IconDeviceCctv, IconMap2, IconSearch, IconActivity, IconFileImport, IconDatabase, IconAlertCircle, IconClock, IconCheck, IconX, IconServer, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { getLectoresParaMapa } from '../services/lectoresApi';
import { getEstadisticasGlobales } from '../services/estadisticasApi';
import type { LectorCoordenadas } from '../types/data';
import { useDisclosure } from '@mantine/hooks';
import DrawControl from '../components/map/DrawControl';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';

// Configuración de iconos de Leaflet
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

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

// Datos de ejemplo para el timeline
const recentActivities = [
  { id: 1, title: 'Nuevo caso creado', description: 'Caso "Investigación Centro"', time: 'Hace 5 minutos', icon: IconFolder, color: 'blue' },
  { id: 2, title: 'Lector actualizado', description: 'Lector "Camara Principal" configurado', time: 'Hace 15 minutos', icon: IconDeviceCctv, color: 'teal' },
  { id: 3, title: 'Importación completada', description: '1000 registros importados', time: 'Hace 1 hora', icon: IconFileImport, color: 'violet' },
];

// Datos de ejemplo para lectores con problemas
const problematicReaders = [
  { id: 1, name: 'Lector Norte', status: 'incompleto', issues: ['Falta configuración GPS', 'Sin zona definida'] },
  { id: 2, name: 'Lector Sur', status: 'incompleto', issues: ['Sin conexión reciente'] },
];

// Datos de ejemplo para el rendimiento del sistema
const performanceData = {
  storageUsed: 65,
  totalSize: '2.5 TB'
};

function HomePage() {
  const [mapLectores, setMapLectores] = useState<LectorCoordenadas[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [estadisticas, setEstadisticas] = useState<{ total_casos: number; total_lecturas: number; total_vehiculos: number; tamanio_bd: string } | null>(null);
  const [estadisticasLoading, setEstadisticasLoading] = useState(true);
  const [estadisticasError, setEstadisticasError] = useState<string | null>(null);
  const [filtroProvincia, setFiltroProvincia] = useState<string[]>([]);
  const [filtroCarretera, setFiltroCarretera] = useState<string[]>([]);
  const [filtroOrganismo, setFiltroOrganismo] = useState<string[]>([]);
  const [filtroTextoLibre, setFiltroTextoLibre] = useState<string>('');
  const [filtroSentido, setFiltroSentido] = useState<string | null>(null);
  const [drawnShape, setDrawnShape] = useState<L.Layer | null>(null);
  const [resultsListOpened, { toggle: toggleResultsList }] = useDisclosure(false);

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

  const fetchMapData = useCallback(async () => {
    setMapLoading(true);
    setMapError(null);
    try {
      const data = await getLectoresParaMapa();
      setMapLectores(data);
    } catch (err: any) {
      setMapError(err.message || 'Error al cargar los datos para el mapa.');
      setMapLectores([]);
    } finally {
      setMapLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEstadisticas();
    fetchMapData();
  }, [fetchEstadisticas, fetchMapData]);

  // Obtener sugerencias para los filtros
  const provinciasUnicas = useMemo(() => {
    return Array.from(new Set(mapLectores.map(l => l.Provincia).filter(Boolean))).sort();
  }, [mapLectores]);

  const carreterasUnicas = useMemo(() => {
    return Array.from(new Set(mapLectores.map(l => l.Carretera).filter(Boolean))).sort();
  }, [mapLectores]);

  const organismosUnicos = useMemo(() => {
    return Array.from(new Set(mapLectores.map(l => l.Organismo_Regulador).filter(Boolean))).sort();
  }, [mapLectores]);

  const lectorSearchSuggestions = useMemo(() => {
    const suggestions = new Set<string>();
    mapLectores.forEach(lector => {
      if (lector.ID_Lector) suggestions.add(lector.ID_Lector);
      if (lector.Nombre) suggestions.add(lector.Nombre);
    });
    return Array.from(suggestions).sort();
  }, [mapLectores]);

  // Lógica de Filtrado
  const lectoresFiltradosMapa = useMemo(() => {
    const textoBusquedaLower = filtroTextoLibre.toLowerCase().trim();
    const drawnPolygonGeoJSON = drawnShape ? (drawnShape as any).toGeoJSON() : null;

    return mapLectores.filter(lector => {
      const provinciaMatch = filtroProvincia.length === 0 || (lector.Provincia && filtroProvincia.includes(lector.Provincia));
      const carreteraMatch = filtroCarretera.length === 0 || (lector.Carretera && filtroCarretera.includes(lector.Carretera));
      const organismoMatch = filtroOrganismo.length === 0 || (lector.Organismo_Regulador && filtroOrganismo.includes(lector.Organismo_Regulador));
      const textoMatch = textoBusquedaLower === '' || 
                         (lector.ID_Lector && lector.ID_Lector.toLowerCase().includes(textoBusquedaLower)) ||
                         (lector.Nombre && lector.Nombre.toLowerCase().includes(textoBusquedaLower));
      const sentidoMatch = filtroSentido === null || (lector.Sentido && lector.Sentido === filtroSentido);

      let spatialMatch = true;
      if (drawnPolygonGeoJSON && lector.Coordenada_X != null && lector.Coordenada_Y != null) {
        try {
          const lectorPoint = turfPoint([lector.Coordenada_X, lector.Coordenada_Y]);
          spatialMatch = booleanPointInPolygon(lectorPoint, drawnPolygonGeoJSON);
        } catch (turfError) {
          console.error("Error en comprobación espacial:", turfError);
          spatialMatch = false;
        }
      }

      return provinciaMatch && carreteraMatch && organismoMatch && textoMatch && sentidoMatch && spatialMatch;
    });
  }, [mapLectores, filtroProvincia, filtroCarretera, filtroOrganismo, filtroTextoLibre, filtroSentido, drawnShape]);

  return (
    <Box style={{ paddingTop: 20, marginTop: 0, paddingLeft: 32, paddingRight: 32, paddingBottom: 0, marginBottom: 0 }}>
      <Grid>
        {/* Columna Izquierda (acciones y actividad reciente) */}
        <Grid.Col span={{ base: 12, md: 4 }}>
          {/* Grid principal de acciones */}
          <SimpleGrid
            cols={1}
            spacing="lg"
            mb="xl"
          >
            {actionCardsData.map((feature) => (
    <Card
      key={feature.title}
      shadow="md"
      radius="md"
      p="xl"
      component={Link}
      to={feature.path}
                style={{ textDecoration: 'none' }}
                withBorder
    >
                <Group align="flex-start">
        <ThemeIcon
            size="xl"
            radius="md"
                    variant="light"
            color={feature.color}
        >
            <feature.icon style={{ width: rem(28), height: rem(28) }} stroke={1.5} />
        </ThemeIcon>
                  <div style={{ flex: 1 }}>
                    <Text size="lg" fw={500} mt={4}>
                {feature.title}
            </Text>
            <Text size="sm" c="dimmed" mt="sm">
                {feature.description}
            </Text>
        </div>
       </Group>
    </Card>
            ))}
          </SimpleGrid>

          {/* Tarjeta de Gestión de Lectores OCR (ahora aquí, abajo) */}
          <Card
            shadow="md"
            radius="md"
            p="xl"
            component={Link}
            to="/lectores"
            state={{ initialTab: 'config' }}
            style={{ textDecoration: 'none' }}
            withBorder
            mt="xl"
          >
            <Group align="flex-start">
              <ThemeIcon
                size="xl"
                radius="md"
                variant="light"
                color="teal"
              >
                <IconDeviceCctv style={{ width: rem(28), height: rem(28) }} stroke={1.5} />
              </ThemeIcon>
              <div style={{ flex: 1 }}>
                <Text size="lg" fw={500} mt={4}>
                  Gestión de Lectores OCR
                </Text>
                <Text size="sm" c="dimmed" mt="sm">
                  Configura y gestiona lectores OCR con ubicaciones.
                </Text>
              </div>
            </Group>
          </Card>
        </Grid.Col>

        {/* Columna Derecha (widgets y mapa) */}
        <Grid.Col span={{ base: 12, md: 8 }} style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 120px)' }}>
          {/* Widgets de resumen */}
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md" mb="xl">
            {estadisticasLoading ? (
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Center style={{ height: '100%' }}>
                  <Loader />
                </Center>
              </Card>
            ) : estadisticasError ? (
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Alert color="red" title="Error">
                  {estadisticasError}
                </Alert>
              </Card>
            ) : estadisticas ? (
              <>
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                  <Group justify="space-between" mb="xs">
                    <Text size="sm" c="dimmed">Tamaño de Base de Datos</Text>
                    <ThemeIcon size="lg" radius="md" variant="light" color="blue">
                      <IconDatabase size={rem(20)} />
                    </ThemeIcon>
                  </Group>
                  <Text size="xl" fw={700}>{estadisticas.tamanio_bd === 'N/A' ? 'No disponible' : estadisticas.tamanio_bd}</Text>
                </Card>
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                  <Group justify="space-between" mb="xs">
                    <Text size="sm" c="dimmed">Casos Activos</Text>
                    <ThemeIcon size="lg" radius="md" variant="light" color="green">
                      <IconFolder size={rem(20)} />
                    </ThemeIcon>
                  </Group>
                  <Text size="xl" fw={700}>{estadisticas.total_casos}</Text>
                </Card>
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                  <Group justify="space-between" mb="xs">
                    <Text size="sm" c="dimmed">Lecturas Totales</Text>
                    <ThemeIcon size="lg" radius="md" variant="light" color="violet">
                      <IconDeviceCctv size={rem(20)} />
                    </ThemeIcon>
                  </Group>
                  <Text size="xl" fw={700}>{estadisticas.total_lecturas.toLocaleString()}</Text>
                </Card>
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                  <Group justify="space-between" mb="xs">
                    <Text size="sm" c="dimmed">Vehículos Registrados</Text>
                    <ThemeIcon size="lg" radius="md" variant="light" color="orange">
                      <IconSearch size={rem(20)} />
                    </ThemeIcon>
                  </Group>
                  <Text size="xl" fw={700}>{estadisticas.total_vehiculos.toLocaleString()}</Text>
                </Card>
              </>
            ) : null}
      </SimpleGrid>

          {/* Mapa de Lectores */}
          <Card shadow="sm" padding="lg" radius="md" withBorder style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Group justify="space-between" mb="md">
              <Text size="lg" fw={500}>Mapa de Lectores</Text>
              <ThemeIcon variant="light" color="blue">
                <IconMap2 size={rem(20)} />
              </ThemeIcon>
            </Group>
            <Box style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              {mapLoading ? (
                <Center style={{ height: '100%' }}>
                  <Loader />
                </Center>
              ) : mapError ? (
                <Alert color="red" title="Error">
                  {mapError}
                </Alert>
              ) : (
                <MapContainer
                  center={[40.4168, -3.7038]} // Centro de España
                  zoom={6}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  {mapLectores.map((lector) => (
                    lector.Coordenada_X && lector.Coordenada_Y && (
                      <Marker
                        key={lector.ID_Lector}
                        position={[lector.Coordenada_Y, lector.Coordenada_X]}
                      >
                        <Popup>
                          <Text fw={500}>{lector.Nombre || lector.ID_Lector}</Text>
                          {lector.Provincia && <Text size="sm">Provincia: {lector.Provincia}</Text>}
                          {lector.Carretera && <Text size="sm">Carretera: {lector.Carretera}</Text>}
                        </Popup>
                      </Marker>
                    )
                  ))}
                </MapContainer>
              )}
            </Box>
          </Card>
        </Grid.Col>
      </Grid>
    </Box>
  );
}

export default function HomePageWrapper(props) {
  return <HomePage {...props} style={{ paddingTop: 0 }} />;
} 