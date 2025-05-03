import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Box, Text, Paper, Stack, Group, Button, TextInput, NumberInput, Select, Switch, ActionIcon, ColorInput, Collapse, Alert, Title, Divider, Tooltip } from '@mantine/core';
import { IconPlus, IconTrash, IconEdit, IconInfoCircle, IconMaximize, IconMinimize, IconCar } from '@tabler/icons-react';
import type { GpsLectura, GpsCapa } from '../../types/data';
import apiClient from '../../services/api';
import dayjs from 'dayjs';
import { useHotkeys } from '@mantine/hooks';
import { getLecturasGps, getParadasGps, getCoincidenciasGps } from '../../services/gpsApi';

// Estilos CSS en línea para el contenedor del mapa
const mapContainerStyle = {
  height: '100%',
  width: '100%',
  position: 'relative' as const,
  zIndex: 1
};

interface GpsAnalysisPanelProps {
  casoId: number;
}

const GpsAnalysisPanel: React.FC<GpsAnalysisPanelProps> = ({ casoId }) => {
  // Estados principales
  const [lecturas, setLecturas] = useState<GpsLectura[]>([]);
  const [loading, setLoading] = useState(false);
  const [capas, setCapas] = useState<GpsCapa[]>([]);
  const [nuevaCapa, setNuevaCapa] = useState<Partial<GpsCapa>>({ nombre: '', color: '#228be6' });
  const [mostrarFormularioCapa, setMostrarFormularioCapa] = useState(false);
  const [fullscreenMap, setFullscreenMap] = useState(false);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);

  // Estados para filtros
  const [filters, setFilters] = useState({
    fechaInicio: '',
    horaInicio: '',
    fechaFin: '',
    horaFin: '',
    velocidadMin: null as number | null,
    velocidadMax: null as number | null,
    duracionParada: null as number | null,
    zonaSeleccionada: null as {
      latMin: number;
      latMax: number;
      lonMin: number;
      lonMax: number;
    } | null
  });

  // Estados para controles del mapa
  const [mapControls, setMapControls] = useState({
    visualizationType: 'standard' as 'standard' | 'satellite' | 'toner',
    showHeatmap: false,
    showPoints: true
  });

  const [vehiculosDisponibles, setVehiculosDisponibles] = useState<{ value: string; label: string }[]>([]);
  const [vehiculoObjetivo, setVehiculoObjetivo] = useState<string | null>(null);
  const [loadingVehiculos, setLoadingVehiculos] = useState(false);

  // Manejar la tecla Escape
  useHotkeys([['Escape', () => fullscreenMap && setFullscreenMap(false)]]);

  // Función para cargar lecturas GPS
  const fetchLecturasGps = useCallback(async () => {
    if (!casoId) return;
    setLoading(true);
    try {
      const data = await getLecturasGps(casoId);
      setLecturas(data);
    } catch (error) {
      console.error('Error al cargar lecturas GPS:', error);
    } finally {
      setLoading(false);
    }
  }, [casoId]);

  // Cargar datos iniciales
  useEffect(() => {
    fetchLecturasGps();
  }, [fetchLecturasGps]);

  // Cargar matrículas únicas al montar o cambiar casoId
  useEffect(() => {
    const cargarVehiculos = async () => {
      if (!casoId) return;
      setLoadingVehiculos(true);
      try {
        const data = await getLecturasGps(casoId);
        const matriculas = [...new Set(data.map((l: any) => l.Matricula))]
          .filter((matricula): matricula is string => matricula !== null && matricula !== undefined)
          .sort();
        setVehiculosDisponibles(matriculas.map(matricula => ({ value: matricula, label: matricula })));
      } catch (error) {
        setVehiculosDisponibles([]);
      } finally {
        setLoadingVehiculos(false);
      }
    };
    cargarVehiculos();
  }, [casoId]);

  // Función para manejar cambios en los filtros
  const handleFilterChange = useCallback((updates: Partial<typeof filters>) => {
    setFilters(prev => ({ ...prev, ...updates }));
  }, []);

  // Función para aplicar filtros
  const handleFiltrar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLecturasGps(casoId, {
        fecha_inicio: filters.fechaInicio || undefined,
        hora_inicio: filters.horaInicio || undefined,
        fecha_fin: filters.fechaFin || undefined,
        hora_fin: filters.horaFin || undefined,
        velocidad_min: filters.velocidadMin || undefined,
        velocidad_max: filters.velocidadMax || undefined,
        duracion_parada: filters.duracionParada || undefined,
        zona_seleccionada: filters.zonaSeleccionada || undefined,
        matricula: vehiculoObjetivo || undefined,
      });
      setLecturas(data);
    } catch (error) {
      console.error('Error al filtrar lecturas GPS:', error);
    } finally {
      setLoading(false);
    }
  }, [casoId, filters, vehiculoObjetivo]);

  // Función para limpiar filtros
  const handleLimpiar = useCallback(() => {
    setFilters({
      fechaInicio: '',
      horaInicio: '',
      fechaFin: '',
      horaFin: '',
      velocidadMin: null,
      velocidadMax: null,
      duracionParada: null,
      zonaSeleccionada: null
    });
    fetchLecturasGps();
  }, [fetchLecturasGps]);

  // Componente del mapa
  const MapComponent = ({ isFullscreen = false }) => {
    // Selección dinámica de capa
    let tileLayerUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    let tileLayerAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    if (mapControls.visualizationType === 'satellite') {
      tileLayerUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      tileLayerAttribution = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
    } else if (mapControls.visualizationType === 'toner') {
      tileLayerUrl = 'https://stamen-tiles.a.ssl.fastly.net/toner-lite/{z}/{x}/{y}.png';
      tileLayerAttribution = 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under ODbL.';
    }
    return (
      <div style={{ position: 'relative', height: '100%', width: '100%' }}>
        <style>
          {`
            .leaflet-container {
              z-index: ${isFullscreen ? 10000 : 1} !important;
            }
            .leaflet-div-icon {
              background: transparent !important;
              border: none !important;
            }
            .gps-popup {
              max-height: ${isFullscreen ? '400px' : '200px'};
              overflow-y: auto;
            }
          `}
        </style>
        <MapContainer 
          center={[40.416775, -3.703790]} 
          zoom={13} 
          scrollWheelZoom={true} 
          style={{ 
            ...mapContainerStyle,
            height: isFullscreen ? '100vh' : '100%',
          }}
        >
          <TileLayer
            attribution={tileLayerAttribution}
            url={tileLayerUrl}
          />
          {lecturas.map((lectura) => (
            <Marker 
              key={lectura.ID_Lectura}
              position={[lectura.Coordenada_Y, lectura.Coordenada_X]}
            >
              <Popup>
                <div className="gps-popup">
                  <Group justify="space-between" mb="xs">
                    <Text fw={700} size="sm">Lectura GPS</Text>
                    <Text size="xs" c="dimmed">{dayjs(lectura.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')}</Text>
                  </Group>
                  <Stack gap={4}>
                    <Text size="sm"><b>Matrícula:</b> {lectura.Matricula}</Text>
                    <Text size="sm"><b>Velocidad:</b> {lectura.Velocidad} km/h</Text>
                    <Text size="sm"><b>Dirección:</b> {lectura.Direccion}°</Text>
                    <Text size="sm"><b>Altitud:</b> {lectura.Altitud} m</Text>
                    <Text size="sm"><b>Precisión:</b> {lectura.Precisión} m</Text>
                    <Text size="sm"><b>Coords:</b> {lectura.Coordenada_Y.toFixed(5)}, {lectura.Coordenada_X.toFixed(5)}</Text>
                  </Stack>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        <Tooltip label={isFullscreen ? "Cerrar pantalla completa (Esc)" : "Pantalla completa"}>
          <ActionIcon
            variant={isFullscreen ? "filled" : "light"}
            color={isFullscreen ? "red" : "blue"}
            size="xl"
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              zIndex: 1000,
              boxShadow: isFullscreen ? '0 0 10px rgba(0,0,0,0.2)' : 'none',
            }}
            onClick={() => isFullscreen ? setFullscreenMap(false) : setFullscreenMap(true)}
          >
            {isFullscreen ? <IconMinimize size={24} /> : <IconMaximize size={24} />}
          </ActionIcon>
        </Tooltip>
      </div>
    );
  };

  if (fullscreenMap) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'white',
          zIndex: 9999,
        }}
      >
        <MapComponent isFullscreen={true} />
      </div>
    );
  }

  return (
    <Box>
      <Group justify="flex-end" mb="xs">
        <Button
          variant="light"
          color="blue"
          size="xs"
          onClick={() => setAyudaAbierta((v) => !v)}
        >
          {ayudaAbierta ? 'Ocultar ayuda' : 'Mostrar ayuda'}
        </Button>
      </Group>
      <Collapse in={ayudaAbierta}>
        <Alert color="blue" title="¿Cómo funciona el Panel de Análisis GPS?" mb="md">
          <Text size="sm">
            <b>¿Qué es este panel?</b><br />
            El Panel de Análisis GPS te permite visualizar y analizar datos de seguimiento GPS. Puedes filtrar por fechas, velocidades, duración de paradas y crear capas personalizadas para análisis avanzados.<br /><br />
            <b>Filtros disponibles:</b><br />
            - Filtros por fecha y hora para acotar el periodo de análisis<br />
            - Filtros por velocidad para identificar comportamientos inusuales<br />
            - Filtros por duración de paradas para detectar lugares de interés<br />
            - Selección de zonas específicas en el mapa<br /><br />
            <b>Visualización:</b><br />
            - Mapa de calor para identificar zonas de mayor actividad<br />
            - Puntos individuales con información detallada<br />
            - Capas personalizables para comparar diferentes análisis<br /><br />
            <b>Consejos:</b><br />
            - Usa los filtros de velocidad para identificar comportamientos inusuales<br />
            - Las paradas prolongadas pueden indicar lugares de interés<br />
            - El mapa de calor ayuda a identificar patrones de movimiento<br />
          </Text>
        </Alert>
      </Collapse>

      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '1rem', height: 'calc(100vh - 200px)' }}>
        {/* Panel de Filtros */}
        <Stack>
          <Paper p="md" withBorder>
            <Title order={3} mb="md">Filtros</Title>
            <Stack gap="md">
              {/* Selector de vehículo objetivo */}
              <Select
                label="Vehículo Objetivo"
                placeholder="Selecciona matrícula"
                data={vehiculosDisponibles}
                value={vehiculoObjetivo}
                onChange={setVehiculoObjetivo}
                searchable
                clearable
                disabled={loadingVehiculos}
                leftSection={<IconCar size={18} />}
              />
              {/* Filtros existentes */}
              <Group grow>
                <TextInput
                  label="Fecha Inicio"
                  type="date"
                  value={filters.fechaInicio}
                  onChange={(e) => handleFilterChange({ fechaInicio: e.target.value })}
                />
                <TextInput
                  label="Hora Inicio"
                  type="time"
                  value={filters.horaInicio}
                  onChange={(e) => handleFilterChange({ horaInicio: e.target.value })}
                />
              </Group>
              <Group grow>
                <TextInput
                  label="Fecha Fin"
                  type="date"
                  value={filters.fechaFin}
                  onChange={(e) => handleFilterChange({ fechaFin: e.target.value })}
                />
                <TextInput
                  label="Hora Fin"
                  type="time"
                  value={filters.horaFin}
                  onChange={(e) => handleFilterChange({ horaFin: e.target.value })}
                />
              </Group>
              <Group grow>
                <NumberInput
                  label="Velocidad Mínima (km/h)"
                  value={filters.velocidadMin || ''}
                  onChange={(value) => handleFilterChange({ velocidadMin: value === '' ? null : Number(value) })}
                  min={0}
                />
                <NumberInput
                  label="Velocidad Máxima (km/h)"
                  value={filters.velocidadMax || ''}
                  onChange={(value) => handleFilterChange({ velocidadMax: value === '' ? null : Number(value) })}
                  min={0}
                />
              </Group>
              <NumberInput
                label="Duración Mínima Parada (min)"
                value={filters.duracionParada || ''}
                onChange={(value) => handleFilterChange({ duracionParada: value === '' ? null : Number(value) })}
                min={0}
              />
              <Group grow>
                <Button onClick={handleFiltrar}>Aplicar Filtros</Button>
                <Button variant="light" color="red" onClick={handleLimpiar}>Limpiar</Button>
              </Group>
            </Stack>
          </Paper>

          {/* Panel de Controles del Mapa */}
          <Paper p="md" withBorder>
            <Title order={3} mb="md">Controles del Mapa</Title>
            <Stack gap="md">
              <Select
                label="Tipo de Visualización"
                value={mapControls.visualizationType}
                onChange={(value) => setMapControls(prev => ({ ...prev, visualizationType: value as 'standard' | 'satellite' | 'toner' }))}
                data={[
                  { value: 'standard', label: 'Estándar' },
                  { value: 'satellite', label: 'Satélite' },
                  { value: 'toner', label: 'Toner Lite' }
                ]}
              />
              <Switch
                label="Mostrar mapa de calor"
                checked={mapControls.showHeatmap}
                onChange={(e) => setMapControls(prev => ({ ...prev, showHeatmap: e.currentTarget.checked }))}
              />
              <Switch
                label="Mostrar puntos individuales"
                checked={mapControls.showPoints}
                onChange={(e) => setMapControls(prev => ({ ...prev, showPoints: e.currentTarget.checked }))}
              />
            </Stack>
          </Paper>
        </Stack>

        {/* Mapa */}
        <Paper withBorder>
          <MapComponent />
        </Paper>
      </div>
    </Box>
  );
};

export default GpsAnalysisPanel; 