import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Box, Text, Paper, Stack, Group, Button, TextInput, NumberInput, Select, Switch, ActionIcon, ColorInput, Collapse, Alert, Title, Divider, Tooltip } from '@mantine/core';
import { IconPlus, IconTrash, IconEdit, IconInfoCircle, IconMaximize, IconMinimize, IconCar, IconCheck, IconX, IconListDetails, IconSearch } from '@tabler/icons-react';
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

// Tipo de capa para GPS
interface CapaGps {
  id: string;
  nombre: string;
  color: string;
  activa: boolean;
  lecturas: GpsLectura[];
  filtros: any;
}

const GpsAnalysisPanel: React.FC<GpsAnalysisPanelProps> = ({ casoId }) => {
  // Estados principales
  const [lecturas, setLecturas] = useState<GpsLectura[]>([]);
  const [loading, setLoading] = useState(false);
  const [capas, setCapas] = useState<CapaGps[]>([]);
  const [nuevaCapa, setNuevaCapa] = useState<Partial<CapaGps>>({ nombre: '', color: '#228be6' });
  const [mostrarFormularioCapa, setMostrarFormularioCapa] = useState(false);
  const [fullscreenMap, setFullscreenMap] = useState(false);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const [editandoCapa, setEditandoCapa] = useState<string | null>(null);

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
    visualizationType: 'toner' as 'standard' | 'satellite' | 'toner',
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
    if (!casoId || !vehiculoObjetivo) return;
    setLoading(true);
    try {
      const data = await getLecturasGps(casoId, {
        matricula: vehiculoObjetivo
      });
      setLecturas(data);
    } catch (error) {
      console.error('Error al cargar lecturas GPS:', error);
    } finally {
      setLoading(false);
    }
  }, [casoId, vehiculoObjetivo]);

  // Cargar datos iniciales
  useEffect(() => {
    // No cargamos datos iniciales, solo cuando se seleccione un vehículo
    setLecturas([]);
  }, [casoId]);

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
    if (!vehiculoObjetivo) return;
    setLoading(true);
    try {
      const data = await getLecturasGps(casoId, {
        fecha_inicio: filters.fechaInicio || undefined,
        hora_inicio: filters.horaInicio || undefined,
        fecha_fin: filters.fechaFin || undefined,
        hora_fin: filters.horaFin || undefined,
        velocidad_min: filters.velocidadMin !== null ? filters.velocidadMin : undefined,
        velocidad_max: filters.velocidadMax !== null ? filters.velocidadMax : undefined,
        duracion_parada: filters.duracionParada !== null ? filters.duracionParada : undefined,
        zona_seleccionada: filters.zonaSeleccionada || undefined,
        matricula: vehiculoObjetivo
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
    if (vehiculoObjetivo) {
      fetchLecturasGps();
    } else {
      setLecturas([]);
    }
  }, [fetchLecturasGps, vehiculoObjetivo]);

  // Función para limpiar el mapa completamente (igual que MapPanel)
  const handleLimpiarMapa = () => {
    setCapas([]);
    setLecturas([]);
    setNuevaCapa({ nombre: '', color: '#228be6' });
    setMostrarFormularioCapa(false);
    setEditandoCapa(null);
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
    setVehiculoObjetivo(null);
  };

  const blueCircleIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background: #228be6; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  });

  // Componente del mapa
  const MapComponent: React.FC<{ isFullscreen?: boolean }> = ({ isFullscreen = false }) => {
    // Selección dinámica de capa
    let tileLayerUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    let tileLayerAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    if (mapControls.visualizationType === 'satellite') {
      tileLayerUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      tileLayerAttribution = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
    } else if (mapControls.visualizationType === 'toner') {
      tileLayerUrl = 'https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}{r}.png';
      tileLayerAttribution = 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under ODbL.';
    }

    // Filtrar lecturas con coordenadas válidas
    const lecturasValidas = lecturas.filter(lectura => 
      typeof lectura.Coordenada_Y === 'number' && 
      typeof lectura.Coordenada_X === 'number' &&
      !isNaN(lectura.Coordenada_Y) && 
      !isNaN(lectura.Coordenada_X)
    );

    // En MapComponent, mostrar lecturas de capas activas además de lecturas actuales si no están guardadas en capa
    const lecturasCapasActivas = capas.filter(c => c.activa).flatMap(c => c.lecturas);
    const lecturasParaMapa = [...lecturasCapasActivas, ...(capas.some(c => c.activa && c.lecturas === lecturas) ? [] : lecturasValidas)];

    // Calcular centro inicial y zoom
    const centroInicial: L.LatLngExpression = 
      lecturasParaMapa.length > 0
        ? [lecturasParaMapa[0].Coordenada_Y, lecturasParaMapa[0].Coordenada_X] 
        : [40.416775, -3.703790];
    
    const zoomInicial = lecturasParaMapa.length > 0 ? 13 : 6;

    return (
      <div style={{ position: 'relative', height: '100%', width: '100%' }}>
        <style>
          {`
            .leaflet-container {
              z-index: ${isFullscreen ? 10000 : 1} !important;
            }
            .leaflet-div-icon, .custom-div-icon {
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
          key={lecturasParaMapa.length}
          center={centroInicial} 
          zoom={zoomInicial} 
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
          {lecturasParaMapa.map((lectura, idx) => (
            <Marker 
              key={lectura.ID_Lectura + '-' + idx}
              position={[lectura.Coordenada_Y, lectura.Coordenada_X]}
              icon={blueCircleIcon}
            >
              <Popup>
                <div className="gps-popup">
                  <Text fw={700} size="sm">Lectura GPS</Text>
                  <Text size="xs" c="dimmed">{dayjs(lectura.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')}</Text>
                  <Text size="sm"><b>Matrícula:</b> {lectura.Matricula}</Text>
                  <Text size="sm"><b>Velocidad:</b> {typeof lectura.Velocidad === 'number' && !isNaN(lectura.Velocidad) ? lectura.Velocidad.toFixed(1) : "?"} km/h</Text>
                  {typeof lectura.duracion_parada_min === 'number' && !isNaN(lectura.duracion_parada_min) && (
                    <Text size="sm" c="blue"><b>Duración parada:</b> {lectura.duracion_parada_min.toFixed(1)} min</Text>
                  )}
                  <Text size="sm"><b>Dirección:</b> {typeof lectura.Direccion === 'number' && !isNaN(lectura.Direccion) ? lectura.Direccion.toFixed(1) : "?"}°</Text>
                  <Text size="sm"><b>Altitud:</b> {typeof lectura.Altitud === 'number' && !isNaN(lectura.Altitud) ? lectura.Altitud.toFixed(1) : "?"} m</Text>
                  <Text size="sm"><b>Precisión:</b> {typeof lectura.Precisión === 'number' && !isNaN(lectura.Precisión) ? lectura.Precisión.toFixed(1) : "?"} m</Text>
                  <Text size="sm"><b>Coords:</b> {typeof lectura.Coordenada_Y === 'number' && !isNaN(lectura.Coordenada_Y) ? lectura.Coordenada_Y.toFixed(5) : "?"}, {typeof lectura.Coordenada_X === 'number' && !isNaN(lectura.Coordenada_X) ? lectura.Coordenada_X.toFixed(5) : "?"}</Text>
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

  // Guardar resultados actuales en una nueva capa
  const handleGuardarResultadosEnCapa = () => {
    if (!nuevaCapa.nombre) return;
    const nuevaCapaCompleta: CapaGps = {
      id: Date.now().toString(),
      nombre: nuevaCapa.nombre!,
      color: nuevaCapa.color || '#228be6',
      activa: true,
      lecturas: lecturas,
      filtros: { ...filters }
    };
    setCapas(prev => [...prev, nuevaCapaCompleta]);
    setNuevaCapa({ nombre: '', color: '#228be6' });
    setMostrarFormularioCapa(false);
    setEditandoCapa(null);
  };

  const handleEditarCapa = (id: string) => {
    const capa = capas.find(c => c.id === id);
    if (!capa) return;
    setNuevaCapa({ nombre: capa.nombre, color: capa.color });
    setEditandoCapa(id);
    setMostrarFormularioCapa(true);
  };

  const handleActualizarCapa = () => {
    if (!editandoCapa || !nuevaCapa.nombre) return;
    setCapas(prev => prev.map(capa =>
      capa.id === editandoCapa
        ? { ...capa, nombre: nuevaCapa.nombre!, color: nuevaCapa.color || capa.color }
        : capa
    ));
    setNuevaCapa({ nombre: '', color: '#228be6' });
    setEditandoCapa(null);
    setMostrarFormularioCapa(false);
  };

  const handleToggleCapa = (id: string) => {
    setCapas(prev => prev.map(capa =>
      capa.id === id ? { ...capa, activa: !capa.activa } : capa
    ));
  };

  const handleEliminarCapa = (id: string) => {
    setCapas(prev => prev.filter(capa => capa.id !== id));
  };

  // Función para generar nombre sugerido de capa según filtros
  function generarNombreCapaPorFiltros(filters: any) {
    const partes: string[] = [];
    if (filters && filters.vehiculoObjetivo) {
      partes.push(filters.vehiculoObjetivo);
    } else if (filters.matricula) {
      partes.push(filters.matricula);
    }
    if (filters.fechaInicio) {
      partes.push(filters.fechaInicio.split('-').reverse().join('/'));
    }
    if (filters.duracionParada) {
      partes.push(`Paradas ${filters.duracionParada}min`);
    }
    if (filters.velocidadMin) {
      partes.push(`> ${filters.velocidadMin}km/h`);
    }
    if (filters.velocidadMax) {
      partes.push(`< ${filters.velocidadMax}km/h`);
    }
    return partes.join(', ');
  }

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
                <Button
                  variant="outline"
                  color="#234be7"
                  leftSection={<IconListDetails size={18} />}
                  onClick={handleLimpiar}
                  style={{ fontWeight: 500 }}
                >
                  Limpiar Filtros
                </Button>
                <Button
                  variant="filled"
                  color="#234be7"
                  leftSection={<IconSearch size={18} />}
                  onClick={handleFiltrar}
                  style={{ fontWeight: 700 }}
                >
                  Aplicar Filtros
                </Button>
              </Group>
              {/* Botón y formulario para guardar capa, igual que MapPanel */}
              {lecturas.length > 0 && (
                mostrarFormularioCapa ? (
                  <Collapse in={mostrarFormularioCapa}>
                    <Stack gap="sm" mt="md">
                      <TextInput
                        label="Nombre de la capa"
                        value={nuevaCapa.nombre}
                        onChange={e => setNuevaCapa(prev => ({ ...prev, nombre: e.target.value }))}
                        placeholder="Ej: Trayecto 1"
                      />
                      <ColorInput
                        label="Color de la capa"
                        value={nuevaCapa.color}
                        onChange={color => setNuevaCapa(prev => ({ ...prev, color }))}
                        format="hex"
                      />
                      <Group justify="flex-end">
                        <Button variant="light" color="gray" onClick={() => { setMostrarFormularioCapa(false); setEditandoCapa(null); }}><IconX size={16} style={{ marginRight: 8 }} />Cancelar</Button>
                        {editandoCapa ? (
                          <Button onClick={handleActualizarCapa} disabled={!nuevaCapa.nombre}><IconCheck size={16} style={{ marginRight: 8 }} />Actualizar capa</Button>
                        ) : (
                          <Button onClick={() => {
                            setNuevaCapa(prev => ({
                              ...prev,
                              nombre: generarNombreCapaPorFiltros({ ...filters, vehiculoObjetivo })
                            }));
                            setMostrarFormularioCapa(true);
                          }}><IconCheck size={16} style={{ marginRight: 8 }} />Guardar en capa</Button>
                        )}
                      </Group>
                    </Stack>
                  </Collapse>
                ) : (
                  <Button fullWidth variant="light" color="blue" mt="md" onClick={() => {
                    setNuevaCapa(prev => ({
                      ...prev,
                      nombre: generarNombreCapaPorFiltros({ ...filters, vehiculoObjetivo })
                    }));
                    setMostrarFormularioCapa(true);
                  }}><IconPlus size={16} style={{ marginRight: 8 }} />Guardar resultados en capa</Button>
                )
              )}
            </Stack>
          </Paper>

          {/* Gestión de Capas debe ir aquí, antes de Controles del Mapa */}
          <Paper p="md" withBorder mt="md">
            <Group justify="space-between" mb="md">
              <Title order={3}>Gestión de Capas</Title>
            </Group>
            <Stack gap="xs">
              {capas.map(capa => (
                <Paper key={capa.id} p="xs" withBorder>
                  <Group justify="space-between">
                    <Group gap="xs">
                      <Switch
                        checked={capa.activa}
                        onChange={() => handleToggleCapa(capa.id)}
                        size="sm"
                      />
                      <Box style={{ width: 16, height: 16, backgroundColor: capa.color, borderRadius: '50%' }} />
                      <Text size="sm">{capa.nombre}</Text>
                      <Tooltip label={`Filtros: ${JSON.stringify(capa.filtros)}`}><ActionIcon variant="subtle" size="sm"><IconInfoCircle size={14} /></ActionIcon></Tooltip>
                    </Group>
                    <Group gap={4}>
                      <ActionIcon variant="subtle" color="blue" onClick={() => handleEditarCapa(capa.id)}><IconEdit size={16} /></ActionIcon>
                      <ActionIcon variant="subtle" color="red" onClick={() => handleEliminarCapa(capa.id)}><IconTrash size={16} /></ActionIcon>
                    </Group>
                  </Group>
                  <Text size="xs" c="dimmed" mt={4}>{capa.lecturas.length} lecturas</Text>
                </Paper>
              ))}
              {capas.length === 0 && (
                <Text size="sm" c="dimmed" ta="center" py="md">No hay capas creadas. Aplica un filtro y guárdalo en una capa.</Text>
              )}
            </Stack>
          </Paper>

          {/* Controles del Mapa debe ir debajo */}
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
              <Divider my="xs" />
              <Button 
                variant="light" 
                color="red" 
                fullWidth
                onClick={handleLimpiarMapa}
              >
                Limpiar Mapa
              </Button>
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