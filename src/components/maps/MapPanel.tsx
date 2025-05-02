import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Stack, Paper, Title, Text, Select, Group, Badge, Grid, ActionIcon, ColorInput, Button, Collapse, TextInput, Switch, Tooltip, Divider, Modal, Alert } from '@mantine/core';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import LecturaFilters from '../filters/LecturaFilters';
import type { Lectura, LectorCoordenadas, Vehiculo } from '../../types/data';
import apiClient from '../../services/api';
import dayjs from 'dayjs';
import { getLectorSugerencias, getLectoresParaMapa } from '../../services/lectoresApi';
import { IconPlus, IconTrash, IconEdit, IconEye, IconEyeOff, IconCheck, IconX, IconInfoCircle, IconMaximize, IconMinimize } from '@tabler/icons-react';
import { useHotkeys } from '@mantine/hooks';

// Estilos CSS en línea para el contenedor del mapa
const mapContainerStyle = {
  height: '100%',
  width: '100%',
  position: 'relative' as const,
  zIndex: 1
};

// Estilos CSS en línea para los iconos personalizados
const markerIconStyle = {
  background: 'transparent',
  border: 'none'
};

// Crear iconos personalizados para los marcadores
// const lectorIcon = L.divIcon({ ... });
// const lecturaGPSIcon = L.divIcon({ ... });
// const lecturaLPRIcon = L.divIcon({ ... });

const createMarkerIcon = (count: number, tipo: 'lector' | 'gps' | 'lpr', color: string) => {
  const size = tipo === 'lector' ? 12 : 8;
  const uniqueClassName = `marker-${color.replace('#', '')}`;
  
  // Crear o actualizar el estilo dinámico
  const styleId = 'dynamic-marker-styles';
  let styleSheet = document.getElementById(styleId) as HTMLStyleElement;
  if (!styleSheet) {
    styleSheet = document.createElement('style');
    styleSheet.id = styleId;
    document.head.appendChild(styleSheet);
  }

  // Añadir reglas CSS para esta clase específica si no existen
  if (!styleSheet.textContent?.includes(uniqueClassName)) {
    const newRules = `
      .${uniqueClassName} {
        background-color: ${color} !important;
        border-radius: 50%;
        box-shadow: 0 0 4px rgba(0,0,0,0.4);
      }
      .${uniqueClassName}-count {
        background-color: ${color} !important;
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: bold;
        box-shadow: 0 0 4px rgba(0,0,0,0.4);
      }
    `;
    styleSheet.textContent += newRules;
  }

  if (count > 1) {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div class="marker-container">
          <div class="${uniqueClassName}" style="width: ${size}px; height: ${size}px; ${tipo === 'lector' ? 'border: 2px solid white;' : ''}"></div>
          <div class="${uniqueClassName}-count" style="position: absolute; top: -8px; right: -8px; width: 16px; height: 16px;">
            ${count}
          </div>
        </div>
      `,
      iconSize: [size + 16, size + 16],
      iconAnchor: [(size + 16)/2, (size + 16)/2]
    });
  }

  return L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div class="${uniqueClassName}" style="width: ${size}px; height: ${size}px; ${tipo === 'lector' ? 'border: 2px solid white;' : ''}"></div>
    `,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2]
  });
};

interface MapPanelProps {
  casoId: number;
}

interface Capa {
  id: string;
  nombre: string;
  color: string;
  activa: boolean;
  lecturas: Lectura[];
  lectores: LectorCoordenadas[];
  filtros: {
    matricula: string;
    fechaInicio: string;
    horaInicio: string;
    fechaFin: string;
    horaFin: string;
    lectorId: string;
    soloRelevantes: boolean;
  };
}

interface MapControls {
  visualizationType: 'standard' | 'satellite' | 'toner';
  showCaseReaders: boolean;
  showAllReaders: boolean;
  showCoincidencias: boolean;
}

const MapPanel: React.FC<MapPanelProps> = ({ casoId }) => {
  // Añadir estilos base al componente
  useEffect(() => {
    const styleId = 'map-base-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .custom-div-icon {
          background: transparent !important;
          border: none !important;
        }
        .marker-container {
          position: relative;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const [lectores, setLectores] = useState<LectorCoordenadas[]>([]);
  const [lecturas, setLecturas] = useState<Lectura[]>([]);
  const [loading, setLoading] = useState(false);
  const [vehiculosInteres, setVehiculosInteres] = useState<Vehiculo[]>([]);
  const [selectedMatricula, setSelectedMatricula] = useState<string | null>(null);
  const [lectorSuggestions, setLectorSuggestions] = useState<string[]>([]);
  const [capas, setCapas] = useState<Capa[]>([]);
  const [nuevaCapa, setNuevaCapa] = useState<Partial<Capa>>({ nombre: '', color: '#228be6' });
  const [editandoCapa, setEditandoCapa] = useState<string | null>(null);
  const [mostrarFormularioCapa, setMostrarFormularioCapa] = useState(false);
  const [resultadosFiltro, setResultadosFiltro] = useState<{
    lecturas: Lectura[];
    lectores: LectorCoordenadas[];
  }>({ lecturas: [], lectores: [] });

  const [filters, setFilters] = useState({
    matricula: '',
    fechaInicio: '',
    horaInicio: '',
    fechaFin: '',
    horaFin: '',
    lectorId: '',
    soloRelevantes: false
  });

  const [mapControls, setMapControls] = useState<MapControls>({
    visualizationType: 'toner',
    showCaseReaders: true,
    showAllReaders: false,
    showCoincidencias: true
  });

  const [allSystemReaders, setAllSystemReaders] = useState<LectorCoordenadas[]>([]);

  // Añadir un estado para forzar el re-render del mapa
  const [mapKey, setMapKey] = useState(0);

  const [fullscreenMap, setFullscreenMap] = useState(false);

  const [ayudaAbierta, setAyudaAbierta] = useState(false);

  // Manejar la tecla Escape
  useHotkeys([['Escape', () => fullscreenMap && setFullscreenMap(false)]]);

  // Fetch lector suggestions
  useEffect(() => {
    const fetchLectorSuggestions = async () => {
      try {
        // Solo usar los IDs de los lectores existentes
        const lectorIds = lectores.map(lector => lector.ID_Lector);
        setLectorSuggestions(lectorIds.sort());
      } catch (error) {
        console.error('Error fetching lector suggestions:', error);
        setLectorSuggestions([]);
      }
    };

    fetchLectorSuggestions();
  }, [lectores]); // Dependencia de lectores para actualizar cuando cambien

  // Cargar vehículos de interés
  useEffect(() => {
    const fetchVehiculosInteres = async () => {
      try {
        const response = await apiClient.get<Vehiculo[]>(`/casos/${casoId}/vehiculos`);
        setVehiculosInteres(response.data);
      } catch (error) {
        console.error('Error al obtener vehículos de interés:', error);
      }
    };

    fetchVehiculosInteres();
  }, [casoId]);

  // Función para manejar cambios en los filtros
  const handleFilterChange = useCallback((updates: Partial<typeof filters>) => {
    setFilters(prev => ({ ...prev, ...updates }));
  }, []);

  // Función optimizada para aplicar los filtros
  const handleFiltrar = useCallback(async () => {
    if (!selectedMatricula) {
      setLecturas([]);
      setResultadosFiltro({ lecturas: [], lectores: [] });
      return;
    }

    setLoading(true);
    try {
      // Cargar lectores y lecturas en paralelo
      const [lectoresResponse, lecturasResponse] = await Promise.all([
        apiClient.get<LectorCoordenadas[]>(`/casos/${casoId}/lectores`),
        apiClient.get<Lectura[]>(`/casos/${casoId}/lecturas`, {
          params: {
            matricula: selectedMatricula,
            fecha_inicio: filters.fechaInicio,
            hora_inicio: filters.horaInicio,
            fecha_fin: filters.fechaFin,
            hora_fin: filters.horaFin,
            lector_id: filters.lectorId,
            solo_relevantes: filters.soloRelevantes
          }
        })
      ]);

      const lectoresData = lectoresResponse.data.filter(l => l.Coordenada_X != null && l.Coordenada_Y != null);
      const lecturasData = lecturasResponse.data.filter(l => l.Coordenada_X != null && l.Coordenada_Y != null);
      
      // Filtrar lectores que tienen lecturas relacionadas con la matrícula filtrada
      const lectoresFiltrados = lectoresData.filter(lector => 
        lecturasData.some(lectura => lectura.ID_Lector === lector.ID_Lector)
      );
      
      setLectores(lectoresData);
      setLecturas(lecturasData);
      setResultadosFiltro({
        lecturas: lecturasData,
        lectores: lectoresFiltrados
      });

      // Pre-llenar el nombre de la capa con la matrícula
      setNuevaCapa(prev => ({
        ...prev,
        nombre: selectedMatricula
      }));
    } catch (error) {
      console.error('Error al filtrar:', error);
    } finally {
      setLoading(false);
    }
  }, [casoId, filters, selectedMatricula]);

  // Función para limpiar los filtros
  const handleLimpiar = useCallback(() => {
    setFilters({
      matricula: '',
      fechaInicio: '',
      horaInicio: '',
      fechaFin: '',
      horaFin: '',
      lectorId: '',
      soloRelevantes: false
    });
    setSelectedMatricula(null);
    setLecturas([]);
  }, []);

  // Cargar datos iniciales de lectores
  useEffect(() => {
    const fetchLectores = async () => {
      try {
        const response = await apiClient.get<LectorCoordenadas[]>(`/casos/${casoId}/lectores`);
        const lectoresData = response.data.filter(l => l.Coordenada_X != null && l.Coordenada_Y != null);
        setLectores(lectoresData);
      } catch (error) {
        console.error('Error al cargar lectores:', error);
      }
    };

    fetchLectores();
  }, [casoId]);

  // Calcular centro y zoom inicial
  const centroInicial = useMemo(() => {
    if (lectores.length > 0) {
      const validLectores = lectores.filter(l => l.Coordenada_X != null && l.Coordenada_Y != null);
      if (validLectores.length === 0) return [40.416775, -3.703790] as L.LatLngExpression;
      
      const centroY = validLectores.reduce((sum, l) => sum + l.Coordenada_Y!, 0) / validLectores.length;
      const centroX = validLectores.reduce((sum, l) => sum + l.Coordenada_X!, 0) / validLectores.length;
      return [centroY, centroX] as L.LatLngExpression;
    }
    return [40.416775, -3.703790] as L.LatLngExpression;
  }, [lectores]);

  const zoomInicial = lectores.length > 0 ? 13 : 6;

  // Preparar datos para el Select de vehículos
  const vehiculosOptions = useMemo(() => 
    vehiculosInteres.map(v => ({
      value: v.Matricula,
      label: `${v.Matricula}${v.Marca ? ` - ${v.Marca}` : ''}${v.Modelo ? ` ${v.Modelo}` : ''}`
    })), [vehiculosInteres]);

  // Función para agrupar lecturas por lector
  const lecturasPorLector = useMemo(() => {
    const grupos = new Map<string, Lectura[]>();
    lecturas.forEach(lectura => {
      if (lectura.ID_Lector) {
        const lecturas = grupos.get(lectura.ID_Lector) || [];
        lecturas.push(lectura);
        grupos.set(lectura.ID_Lector, lecturas);
      }
    });
    return grupos;
  }, [lecturas]);

  // Función para ordenar lecturas por fecha
  const ordenarLecturasPorFecha = (lecturas: Lectura[]) => {
    return [...lecturas].sort((a, b) => 
      new Date(a.Fecha_y_Hora).getTime() - new Date(b.Fecha_y_Hora).getTime()
    );
  };

  // Función para formatear los filtros de una capa
  const formatFiltrosCapa = (filtros: Capa['filtros']) => {
    const partes: string[] = [];
    if (filtros.matricula) partes.push(`Matrícula: ${filtros.matricula}`);
    if (filtros.lectorId) partes.push(`Lector: ${filtros.lectorId}`);
    if (filtros.fechaInicio || filtros.fechaFin) {
      const fechaInicio = filtros.fechaInicio ? dayjs(filtros.fechaInicio).format('DD/MM/YYYY') : 'Inicio';
      const fechaFin = filtros.fechaFin ? dayjs(filtros.fechaFin).format('DD/MM/YYYY') : 'Fin';
      partes.push(`Período: ${fechaInicio} - ${fechaFin}`);
    }
    if (filtros.soloRelevantes) partes.push('Solo relevantes');
    return partes.join(' | ');
  };

  // Función para guardar los resultados actuales en una nueva capa
  const handleGuardarResultadosEnCapa = () => {
    if (!nuevaCapa.nombre) return;

    const nuevaCapaCompleta: Capa = {
      id: Date.now().toString(),
      nombre: nuevaCapa.nombre,
      color: nuevaCapa.color || '#228be6',
      activa: true,
      lecturas: resultadosFiltro.lecturas,
      lectores: resultadosFiltro.lectores,
      filtros: { ...filters }
    };

    setCapas(prev => [...prev, nuevaCapaCompleta]);
    // Limpiar completamente el estado de nuevaCapa
    setNuevaCapa({ nombre: '', color: '#228be6' });
    setMostrarFormularioCapa(false);
    
    // Limpiar los resultados del filtro actual
    setResultadosFiltro({ lecturas: [], lectores: [] });
    setSelectedMatricula(null);
    // Resetear los filtros
    setFilters({
      matricula: '',
      fechaInicio: '',
      horaInicio: '',
      fechaFin: '',
      horaFin: '',
      lectorId: '',
      soloRelevantes: false
    });
  };

  const handleEditarCapa = (id: string) => {
    const capa = capas.find(c => c.id === id);
    if (!capa) return;

    setNuevaCapa({
      nombre: capa.nombre,
      color: capa.color
    });
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

    // Limpiar completamente el estado de nuevaCapa tras editar
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

  // Función para renderizar los marcadores de una capa
  const renderCapaMarkers = (capa: Capa) => {
    if (!capa.activa) return null;

    const markers: JSX.Element[] = [];

    // Renderizar lectores de la capa
    capa.lectores.forEach((lector) => {
      const lecturasEnLector = capa.lecturas.filter(l => l.ID_Lector === lector.ID_Lector);
      if (!lector.Coordenada_X || !lector.Coordenada_Y) return;

      markers.push(
        <Marker 
          key={`${capa.id}-lector-${lector.ID_Lector}`}
          position={[lector.Coordenada_Y, lector.Coordenada_X]}
          icon={createMarkerIcon(lecturasEnLector.length, 'lector', capa.color)}
          zIndexOffset={300}
        >
          <Popup>
            <div className="lectura-popup">
              <Group justify="space-between" mb="xs">
                <Text fw={700} size="sm">Lector {lector.ID_Lector}</Text>
                <Badge color="blue" variant="light" size="sm">
                  {lecturasEnLector.length} lecturas
                </Badge>
              </Group>
              <Stack gap={4}>
                {lector.Nombre && <Text size="sm"><b>Nombre:</b> {lector.Nombre}</Text>}
                {lector.Carretera && <Text size="sm"><b>Carretera:</b> {lector.Carretera}</Text>}
                {lector.Provincia && <Text size="sm"><b>Provincia:</b> {lector.Provincia}</Text>}
                {lector.Organismo_Regulador && <Text size="sm"><b>Organismo:</b> {lector.Organismo_Regulador}</Text>}
                <Text size="sm"><b>Coords:</b> {lector.Coordenada_Y?.toFixed(5)}, {lector.Coordenada_X?.toFixed(5)}</Text>
              </Stack>
              {lecturasEnLector.length > 0 && (
                <>
                  <Divider my="xs" />
                  <Text fw={700} size="sm" mb="xs">Pasos registrados</Text>
                  <Stack gap={4}>
                    {ordenarLecturasPorFecha(lecturasEnLector).map((lectura, idx) => (
                      <Paper key={lectura.ID_Lectura} p="xs" withBorder>
                        <Group justify="space-between">
                          <Badge 
                            color={lectura.Tipo_Fuente === 'GPS' ? 'red' : 'blue'}
                            variant="light"
                            size="sm"
                          >
                            {lectura.Tipo_Fuente}
                          </Badge>
                          <Text size="xs" c="dimmed">
                            {dayjs(lectura.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')}
                          </Text>
                        </Group>
                        <Group gap="xs" mt={4}>
                          {lectura.Velocidad && (
                            <Badge color="gray" variant="light" size="xs">
                              {lectura.Velocidad} km/h
                            </Badge>
                          )}
                          {lectura.Carril && (
                            <Badge color="gray" variant="light" size="xs">
                              Carril {lectura.Carril}
                            </Badge>
                          )}
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                </>
              )}
            </div>
          </Popup>
        </Marker>
      );
    });

    // Renderizar lecturas individuales
    capa.lecturas
      .filter(l => !l.ID_Lector && l.Coordenada_X && l.Coordenada_Y)
      .forEach((lectura) => {
        markers.push(
          <Marker 
            key={`${capa.id}-lectura-${lectura.ID_Lectura}`}
            position={[lectura.Coordenada_Y!, lectura.Coordenada_X!]}
            icon={createMarkerIcon(1, lectura.Tipo_Fuente.toLowerCase() as 'gps' | 'lpr', capa.color)}
            zIndexOffset={400}
          >
            <Popup>
              <div className="lectura-popup">
                <Group justify="space-between" mb="xs">
                  <Text fw={700} size="sm">Lectura {lectura.ID_Lectura}</Text>
                  <Badge 
                    color={lectura.Tipo_Fuente === 'GPS' ? 'red' : 'blue'}
                    variant="light"
                    size="sm"
                  >
                    {lectura.Tipo_Fuente}
                  </Badge>
                </Group>
                <Stack gap={4}>
                  <Text size="sm"><b>Matrícula:</b> {lectura.Matricula}</Text>
                  <Text size="sm"><b>Fecha y Hora:</b> {dayjs(lectura.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')}</Text>
                  {lectura.Carril && <Text size="sm"><b>Carril:</b> {lectura.Carril}</Text>}
                  {lectura.Velocidad && <Text size="sm"><b>Velocidad:</b> {lectura.Velocidad} km/h</Text>}
                </Stack>
              </div>
            </Popup>
          </Marker>
        );
      });

    return markers;
  };

  // Función para renderizar los resultados del filtro actual
  const renderResultadosFiltro = () => {
    if (resultadosFiltro.lecturas.length === 0) return null;

    return (
      <>
        {/* Renderizar lectores con lecturas */}
        {resultadosFiltro.lectores.map((lector) => {
          const lecturasEnLector = resultadosFiltro.lecturas.filter(l => l.ID_Lector === lector.ID_Lector);
          return (
            <Marker 
              key={`filtro-lector-${lector.ID_Lector}`}
              position={[lector.Coordenada_Y!, lector.Coordenada_X!]}
              icon={createMarkerIcon(lecturasEnLector.length, 'lector', '#228be6')}
              zIndexOffset={500}
            >
              <Popup>
                <div className="lectura-popup">
                  <Group justify="space-between" mb="xs">
                    <Text fw={700} size="sm">Lector {lector.ID_Lector}</Text>
                    <Badge color="blue" variant="light" size="sm">
                      {lecturasEnLector.length} lecturas
                    </Badge>
                  </Group>
                  <Stack gap={4}>
                    {lector.Nombre && <Text size="sm"><b>Nombre:</b> {lector.Nombre}</Text>}
                    {lector.Carretera && <Text size="sm"><b>Carretera:</b> {lector.Carretera}</Text>}
                    {lector.Provincia && <Text size="sm"><b>Provincia:</b> {lector.Provincia}</Text>}
                    {lector.Organismo_Regulador && <Text size="sm"><b>Organismo:</b> {lector.Organismo_Regulador}</Text>}
                    <Text size="sm"><b>Coords:</b> {lector.Coordenada_Y?.toFixed(5)}, {lector.Coordenada_X?.toFixed(5)}</Text>
                  </Stack>
                  {lecturasEnLector.length > 0 && (
                    <>
                      <Divider my="xs" />
                      <Text fw={700} size="sm" mb="xs">Pasos registrados</Text>
                      <Stack gap={4}>
                        {ordenarLecturasPorFecha(lecturasEnLector).map((lectura) => (
                          <Paper key={lectura.ID_Lectura} p="xs" withBorder>
                            <Group justify="space-between">
                              <Badge 
                                color={lectura.Tipo_Fuente === 'GPS' ? 'red' : 'blue'}
                                variant="light"
                                size="sm"
                              >
                                {lectura.Tipo_Fuente}
                              </Badge>
                              <Text size="xs" c="dimmed">
                                {dayjs(lectura.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')}
                              </Text>
                            </Group>
                            <Group gap="xs" mt={4}>
                              {lectura.Velocidad && (
                                <Badge color="gray" variant="light" size="xs">
                                  {lectura.Velocidad} km/h
                                </Badge>
                              )}
                              {lectura.Carril && (
                                <Badge color="gray" variant="light" size="xs">
                                  Carril {lectura.Carril}
                                </Badge>
                              )}
                            </Group>
                          </Paper>
                        ))}
                      </Stack>
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Renderizar lecturas individuales */}
        {resultadosFiltro.lecturas.filter(l => !l.ID_Lector).map((lectura) => (
          <Marker 
            key={`filtro-lectura-${lectura.ID_Lectura}`}
            position={[lectura.Coordenada_Y!, lectura.Coordenada_X!]}
            icon={createMarkerIcon(1, lectura.Tipo_Fuente.toLowerCase() as 'gps' | 'lpr', '#228be6')}
            zIndexOffset={600}
          >
            <Popup>
              <div className="lectura-popup">
                <Group justify="space-between" mb="xs">
                  <Text fw={700} size="sm">Lectura {lectura.ID_Lectura}</Text>
                  <Badge 
                    color={lectura.Tipo_Fuente === 'GPS' ? 'red' : 'blue'}
                    variant="light"
                    size="sm"
                  >
                    {lectura.Tipo_Fuente}
                  </Badge>
                </Group>
                <Stack gap={4}>
                  <Text size="sm"><b>Matrícula:</b> {lectura.Matricula}</Text>
                  <Text size="sm"><b>Fecha y Hora:</b> {dayjs(lectura.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')}</Text>
                  {lectura.Carril && <Text size="sm"><b>Carril:</b> {lectura.Carril}</Text>}
                  {lectura.Velocidad && <Text size="sm"><b>Velocidad:</b> {lectura.Velocidad} km/h</Text>}
                </Stack>
              </div>
            </Popup>
          </Marker>
        ))}
      </>
    );
  };

  // Add new function to handle map control changes
  const handleMapControlChange = (updates: Partial<MapControls>) => {
    setMapControls(prev => ({ ...prev, ...updates }));
  };

  // Add new function to get tile layer URL based on visualization type
  const getTileLayerUrl = () => {
    switch (mapControls.visualizationType) {
      case 'satellite':
        return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      case 'toner':
        return 'https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}{r}.png';
      default:
        return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    }
  };

  // Add new function to fetch all system readers
  useEffect(() => {
    const fetchAllSystemReaders = async () => {
      try {
        const data = await getLectoresParaMapa();
        setAllSystemReaders(data.filter(l => l.Coordenada_X != null && l.Coordenada_Y != null));
      } catch (error) {
        console.error('Error al cargar todos los lectores del sistema:', error);
      }
    };

    if (mapControls.showAllReaders) {
      fetchAllSystemReaders();
    }
  }, [mapControls.showAllReaders]);

  // Add new function to render reader layers
  const renderReaderLayers = () => {
    return (
      <>
        {/* Render all system readers first (bottom layer) */}
        {mapControls.showAllReaders && allSystemReaders.map((lector) => (
          <Marker
            key={`system-reader-${lector.ID_Lector}`}
            position={[lector.Coordenada_Y!, lector.Coordenada_X!]}
            icon={createMarkerIcon(1, 'lector', '#228be6')}
            zIndexOffset={100}
          >
            <Popup>
              <div className="lectura-popup">
                <Text fw={700} size="sm">Lector del Sistema {lector.ID_Lector}</Text>
                <Stack gap={4}>
                  {lector.Nombre && <Text size="sm"><b>Nombre:</b> {lector.Nombre}</Text>}
                  {lector.Carretera && <Text size="sm"><b>Carretera:</b> {lector.Carretera}</Text>}
                  <Text size="sm"><b>Coords:</b> {lector.Coordenada_Y?.toFixed(5)}, {lector.Coordenada_X?.toFixed(5)}</Text>
                </Stack>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Render case readers (middle layer) */}
        {mapControls.showCaseReaders && lectores.map((lector) => (
          <Marker
            key={`case-reader-${lector.ID_Lector}`}
            position={[lector.Coordenada_Y!, lector.Coordenada_X!]}
            icon={L.divIcon({
              className: 'custom-div-icon',
              html: `
                <div style="
                  background-color: white;
                  width: 16px;
                  height: 16px;
                  border-radius: 50%;
                  border: 3px solid #40c057;
                  box-shadow: 0 0 8px rgba(0,0,0,0.4);
                  position: relative;
                ">
                  <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 6px;
                    height: 6px;
                    background-color: #40c057;
                    border-radius: 50%;
                  "></div>
                </div>
              `,
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            })}
            zIndexOffset={200}
          >
            <Popup>
              <div className="lectura-popup">
                <Text fw={700} size="sm">Lector del Caso {lector.ID_Lector}</Text>
                <Stack gap={4}>
                  {lector.Nombre && <Text size="sm"><b>Nombre:</b> {lector.Nombre}</Text>}
                  {lector.Carretera && <Text size="sm"><b>Carretera:</b> {lector.Carretera}</Text>}
                  <Text size="sm"><b>Coords:</b> {lector.Coordenada_Y?.toFixed(5)}, {lector.Coordenada_X?.toFixed(5)}</Text>
                </Stack>
              </div>
            </Popup>
          </Marker>
        ))}
      </>
    );
  };

  // Función para detectar coincidencias entre capas
  const detectarCoincidencias = useMemo(() => {
    // Si las coincidencias están desactivadas, retornar array vacío
    if (!mapControls.showCoincidencias) {
      return [];
    }

    const coincidencias: { 
      lat: number; 
      lon: number; 
      vehiculos: string[]; 
      lectores: string[]; 
      fechas: { vehiculo: string; fecha: string }[] 
    }[] = [];
    
    // Si no hay capas activas ni resultados de filtro, retornar array vacío
    if (capas.filter(c => c.activa).length === 0 && resultadosFiltro.lecturas.length === 0) {
      return [];
    }

    // Crear un mapa para agrupar lecturas por coordenadas
    const lecturasPorCoordenadas = new Map<string, { 
      lat: number; 
      lon: number; 
      vehiculos: Set<string>; 
      lectores: Set<string>;
      fechas: Map<string, string>;
    }>();

    // Función auxiliar para procesar una lectura
    const procesarLectura = (lectura: Lectura) => {
      if (!lectura.Coordenada_X || !lectura.Coordenada_Y) return;
      
      const key = `${lectura.Coordenada_X.toFixed(6)}-${lectura.Coordenada_Y.toFixed(6)}`;
      const existing = lecturasPorCoordenadas.get(key) || {
        lat: lectura.Coordenada_Y,
        lon: lectura.Coordenada_X,
        vehiculos: new Set<string>(),
        lectores: new Set<string>(),
        fechas: new Map<string, string>()
      };
      
      existing.vehiculos.add(lectura.Matricula);
      if (lectura.ID_Lector) {
        existing.lectores.add(lectura.ID_Lector);
      }
      existing.fechas.set(lectura.Matricula, lectura.Fecha_y_Hora);
      
      lecturasPorCoordenadas.set(key, existing);
    };

    // Procesar lecturas de capas activas
    capas.forEach(capa => {
      if (capa.activa) {
        capa.lecturas.forEach(procesarLectura);
      }
    });

    // Procesar lecturas del filtro actual
    if (resultadosFiltro.lecturas.length > 0) {
      resultadosFiltro.lecturas.forEach(procesarLectura);
    }

    // Identificar coincidencias (mismo punto con diferentes vehículos)
    lecturasPorCoordenadas.forEach((value) => {
      // Solo considerar como coincidencia si hay más de un vehículo
      if (value.vehiculos.size > 1) {
        coincidencias.push({
          lat: value.lat,
          lon: value.lon,
          vehiculos: Array.from(value.vehiculos),
          lectores: Array.from(value.lectores),
          fechas: Array.from(value.fechas.entries()).map(([vehiculo, fecha]) => ({
            vehiculo,
            fecha: dayjs(fecha).format('DD/MM/YYYY HH:mm:ss')
          }))
        });
      }
    });
    
    return coincidencias;
  }, [capas, resultadosFiltro.lecturas, mapControls.showCoincidencias]);

  // Función para renderizar las coincidencias en el mapa
  const renderCoincidencias = () => {
    // Verificación explícita de que las coincidencias deben mostrarse
    if (!mapControls.showCoincidencias) {
      return null;
    }

    // Obtener coincidencias actuales
    const coincidenciasActuales = detectarCoincidencias;
    
    // Si no hay coincidencias, no renderizar nada
    if (coincidenciasActuales.length === 0) {
      return null;
    }

    return coincidenciasActuales.map((coincidencia, index) => (
      <Marker
        key={`coincidencia-${index}`}
        position={[coincidencia.lat, coincidencia.lon]}
        icon={L.divIcon({
          className: 'custom-div-icon',
          html: `
            <div style="
              position: relative;
              width: 48px;
              height: 48px;
            ">
              <div style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 40px;
                height: 40px;
                border-radius: 50%;
                border: 3px solid red;
                background-color: rgba(255, 0, 0, 0.2);
                box-shadow: 0 0 12px rgba(255, 0, 0, 0.4);
                animation: pulse 2s infinite;
              "></div>
              <div style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background-color: red;
              "></div>
              <div style="
                position: absolute;
                top: -8px;
                right: -8px;
                background-color: red;
                color: white;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 14px;
                box-shadow: 0 0 8px rgba(255, 0, 0, 0.6);
                animation: float 2s infinite;
              ">!</div>
            </div>
            <style>
              @keyframes pulse {
                0% { transform: translate(-50%, -50%) scale(1); }
                50% { transform: translate(-50%, -50%) scale(1.1); }
                100% { transform: translate(-50%, -50%) scale(1); }
              }
              @keyframes float {
                0% { transform: translate(0, 0); }
                50% { transform: translate(0, -5px); }
                100% { transform: translate(0, 0); }
              }
            </style>
          `,
          iconSize: [48, 48],
          iconAnchor: [24, 24]
        })}
        zIndexOffset={700}
      >
        <Popup>
          <div className="lectura-popup" style={{ maxWidth: '400px', minWidth: '350px' }}>
            <Group gap="xs" mb="xs" align="center">
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: 'red',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold'
              }}>!</div>
              <Text fw={700} size="md" c="red">Coincidencia Detectada</Text>
            </Group>
            
            <Stack gap="xs">
              <Paper p="xs" withBorder>
                <Text fw={600} size="sm" mb={4}>Vehículos Involucrados</Text>
                <Stack gap={4}>
                  {coincidencia.fechas.map((item, idx) => (
                    <Group key={idx} gap={8} wrap="nowrap" justify="space-between">
                      <Badge color="red" variant="light" size="sm" style={{ minWidth: '80px' }}>
                        {item.vehiculo}
                      </Badge>
                      <Text size="xs" c="dimmed" style={{ flex: 1, textAlign: 'right' }}>
                        {item.fecha}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Paper>

              <Paper p="xs" withBorder>
                <Text fw={600} size="sm" mb={4}>Lectores Involucrados</Text>
                <Group gap={4} wrap="wrap">
                  {coincidencia.lectores.map((lector, idx) => (
                    <Badge key={idx} color="blue" variant="light" size="sm">
                      {lector}
                    </Badge>
                  ))}
                </Group>
              </Paper>

              <Paper p="xs" withBorder>
                <Text fw={600} size="sm" mb={4}>Ubicación</Text>
                <Group gap={8} wrap="nowrap" justify="space-between">
                  <Text size="sm" c="dimmed">
                    Lat: {coincidencia.lat.toFixed(5)}
                  </Text>
                  <Text size="sm" c="dimmed">
                    Lon: {coincidencia.lon.toFixed(5)}
                  </Text>
                </Group>
              </Paper>
            </Stack>
          </div>
        </Popup>
      </Marker>
    ));
  };

  // Función para limpiar el mapa completamente
  const handleLimpiarMapa = useCallback(() => {
    // Desactivar las coincidencias primero
    handleMapControlChange({ showCoincidencias: false });
    
    // Limpiar todos los estados
    setCapas([]);
    setResultadosFiltro({ lecturas: [], lectores: [] });
    setLecturas([]);
    setSelectedMatricula(null);
    setNuevaCapa({ nombre: '', color: '#228be6' });
    setMostrarFormularioCapa(false);
    setEditandoCapa(null);
    
    // Resetear los filtros
    setFilters({
      matricula: '',
      fechaInicio: '',
      horaInicio: '',
      fechaFin: '',
      horaFin: '',
      lectorId: '',
      soloRelevantes: false
    });

    // Forzar la actualización del mapa
    setMapKey(prev => prev + 1);
  }, [handleMapControlChange]);

  // Componente del mapa para reutilizar
  const MapComponent = ({ isFullscreen = false }) => (
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
          .custom-div-icon {
            background: transparent !important;
            border: none !important;
          }
          .lectura-popup {
            max-height: ${isFullscreen ? '400px' : '200px'};
            overflow-y: auto;
          }
        `}
      </style>
      <MapContainer 
        key={`map-${mapKey}-${lectores.length}-${lecturas.length}-${capas.length}-${resultadosFiltro.lecturas.length}-${mapControls.visualizationType}`}
        center={centroInicial} 
        zoom={zoomInicial} 
        scrollWheelZoom={true} 
        style={{ 
          ...mapContainerStyle,
          height: isFullscreen ? '100vh' : '100%',
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={getTileLayerUrl()}
        />
        
        {renderReaderLayers()}
        {/* Solo mostrar resultados del filtro si no se han guardado en una capa y no hay capas activas con la misma matrícula */}
        {resultadosFiltro.lecturas.length > 0 && 
         !mostrarFormularioCapa && 
         !capas.some(capa => capa.activa && capa.filtros.matricula === selectedMatricula) && 
         renderResultadosFiltro()}
        {capas.map(renderCapaMarkers)}
        {renderCoincidencias()}
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
        <Alert color="blue" title="¿Cómo funciona el Mapa de Lecturas?" mb="md">
          <Text size="sm">
            <b>¿Qué es este panel?</b><br />
            El Mapa de Lecturas te permite visualizar geográficamente las lecturas LPR y GPS asociadas a un caso. Puedes filtrar por vehículo, fechas, lectores y guardar resultados en capas personalizadas para análisis avanzados.<br /><br />
            <b>Filtros y búsqueda:</b><br />
            - Selecciona un vehículo de interés para ver sus pasos en el mapa.<br />
            - Filtra por fechas, horas, lector o relevancia para acotar los resultados.<br />
            - Los resultados se muestran como marcadores en el mapa, agrupados por lector o ubicación.<br /><br />
            <b>Capas:</b><br />
            - Guarda cualquier resultado de filtro como una "capa" para compararlo con otros vehículos o periodos.<br />
            - Activa/desactiva capas para ver coincidencias espaciales y temporales.<br />
            - Personaliza el nombre y color de cada capa.<br /><br />
            <b>Controles del mapa:</b><br />
            - Cambia el tipo de visualización (estándar, satélite, toner).<br />
            - Muestra todos los lectores del sistema o solo los del caso.<br />
            - Activa la detección de coincidencias para resaltar ubicaciones donde varios vehículos han coincidido.<br /><br />
            <b>Consejos:</b><br />
            - Haz zoom y mueve el mapa para explorar los datos.<br />
            - Haz clic en los marcadores para ver detalles de cada lectura o lector.<br />
            - Usa el botón "Limpiar Mapa" para reiniciar la visualización.<br />
          </Text>
        </Alert>
      </Collapse>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack>
            {/* Panel de Filtros */}
            <Paper p="md" withBorder>
              <Title order={2} mb="md">Mapa de Lecturas</Title>
              <Group grow mb="md">
                <Select
                  label="Vehículo de Interés"
                  placeholder="Seleccionar vehículo..."
                  value={selectedMatricula}
                  onChange={(value) => {
                    setSelectedMatricula(value);
                    handleFilterChange({ matricula: value || '' });
                  }}
                  data={vehiculosOptions}
                  searchable
                  clearable
                />
              </Group>
              <LecturaFilters
                filters={filters}
                onFilterChange={handleFilterChange}
                onFiltrar={handleFiltrar}
                onLimpiar={handleLimpiar}
                loading={loading}
                hideMatricula={true}
                lectorSuggestions={lectorSuggestions}
              />
              
              {/* Botón para guardar resultados en capa */}
              {resultadosFiltro.lecturas.length > 0 && (
                <Collapse in={mostrarFormularioCapa}>
                  <Stack gap="sm" mt="md">
                    <TextInput
                      label="Nombre de la capa"
                      value={nuevaCapa.nombre}
                      onChange={(e) => setNuevaCapa(prev => ({ ...prev, nombre: e.target.value }))}
                      placeholder="Ej: Lecturas GPS"
                      description="Se recomienda incluir la matrícula y algún detalle adicional para identificar la capa"
                    />
                    <ColorInput
                      label="Color de la capa"
                      value={nuevaCapa.color}
                      onChange={(color) => setNuevaCapa(prev => ({ ...prev, color }))}
                      format="hex"
                    />
                    <Group justify="flex-end">
                      <Button 
                        variant="light" 
                        color="gray" 
                        onClick={() => setMostrarFormularioCapa(false)}
                      >
                        <IconX size={16} style={{ marginRight: 8 }} />
                        Cancelar
                      </Button>
                      <Button 
                        onClick={handleGuardarResultadosEnCapa}
                        disabled={!nuevaCapa.nombre}
                      >
                        <IconCheck size={16} style={{ marginRight: 8 }} />
                        Guardar en capa
                      </Button>
                    </Group>
                  </Stack>
                </Collapse>
              )}
              {resultadosFiltro.lecturas.length > 0 && !mostrarFormularioCapa && (
                <Button 
                  fullWidth 
                  variant="light" 
                  color="blue" 
                  mt="md"
                  onClick={() => setMostrarFormularioCapa(true)}
                >
                  <IconPlus size={16} style={{ marginRight: 8 }} />
                  Guardar resultados en capa
                </Button>
              )}
            </Paper>

            {/* Panel de Gestión de Capas */}
            <Paper p="md" withBorder>
              <Group justify="space-between" mb="md">
                <Title order={3}>Gestión de Capas</Title>
              </Group>

              {/* Lista de capas */}
              <Stack gap="xs">
                {capas.map((capa) => (
                  <Paper key={capa.id} p="xs" withBorder>
                    <Group justify="space-between">
                      <Group gap="xs">
                        <Switch
                          checked={capa.activa}
                          onChange={() => handleToggleCapa(capa.id)}
                          size="sm"
                        />
                        <Box 
                          style={{ 
                            width: 16, 
                            height: 16, 
                            backgroundColor: capa.color,
                            borderRadius: '50%'
                          }} 
                        />
                        <Text size="sm">{capa.nombre}</Text>
                        <Tooltip label={formatFiltrosCapa(capa.filtros)}>
                          <ActionIcon variant="subtle" size="sm">
                            <IconInfoCircle size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                      <Group gap={4}>
                        <ActionIcon 
                          variant="subtle" 
                          color="blue"
                          onClick={() => handleEditarCapa(capa.id)}
                        >
                          <IconEdit size={16} />
                        </ActionIcon>
                        <ActionIcon 
                          variant="subtle" 
                          color="red"
                          onClick={() => handleEliminarCapa(capa.id)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>
                    <Text size="xs" c="dimmed" mt={4}>
                      {capa.lecturas.length} lecturas | {capa.lectores.length} lectores
                    </Text>
                  </Paper>
                ))}
                {capas.length === 0 && (
                  <Text size="sm" c="dimmed" ta="center" py="md">
                    No hay capas creadas. Aplica un filtro y guárdalo en una capa.
                  </Text>
                )}
              </Stack>
            </Paper>

            {/* Panel de Controles del Mapa */}
            <Paper p="md" withBorder>
              <Title order={3} mb="md">Controles del Mapa</Title>
              <Stack gap="md">
                <Select
                  label="Tipo de Visualización"
                  value={mapControls.visualizationType}
                  onChange={(value) => handleMapControlChange({ visualizationType: value as MapControls['visualizationType'] })}
                  data={[
                    { value: 'toner', label: 'Toner Lite' },
                    { value: 'standard', label: 'Estándar' },
                    { value: 'satellite', label: 'Satélite' }
                  ]}
                />
                <Stack gap="xs">
                  <Switch
                    label="Mostrar lectores del caso"
                    checked={mapControls.showCaseReaders}
                    onChange={(event) => handleMapControlChange({ showCaseReaders: event.currentTarget.checked })}
                  />
                  <Switch
                    label="Mostrar todos los lectores del sistema"
                    checked={mapControls.showAllReaders}
                    onChange={(event) => handleMapControlChange({ showAllReaders: event.currentTarget.checked })}
                  />
                  <Divider my="xs" />
                  <Switch
                    label={
                      <Group gap="xs">
                        <Text size="sm">Mostrar coincidencias</Text>
                        <Badge color="red" variant="light" size="sm">
                          {detectarCoincidencias.length}
                        </Badge>
                      </Group>
                    }
                    checked={mapControls.showCoincidencias}
                    onChange={(event) => handleMapControlChange({ showCoincidencias: event.currentTarget.checked })}
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
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 8 }}>
          <Paper p="md" withBorder style={{ height: 'calc(100vh - 200px)', position: 'relative' }}>
            {lectores.length === 0 ? (
              <Box style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Text c="dimmed">No hay lectores con coordenadas válidas para mostrar en el mapa.</Text>
              </Box>
            ) : (
              <MapComponent isFullscreen={false} />
            )}
          </Paper>
        </Grid.Col>
      </Grid>
    </Box>
  );
};

export default MapPanel; 