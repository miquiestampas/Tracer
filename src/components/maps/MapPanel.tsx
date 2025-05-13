import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Stack, Paper, Title, Text, Select, Group, Badge, Grid, ActionIcon, ColorInput, Button, Collapse, TextInput, Switch, Tooltip, Divider, Modal, Alert, Card, Table, ScrollArea } from '@mantine/core';
import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import LecturaFilters from '../filters/LecturaFilters';
import type { Lectura, LectorCoordenadas, Vehiculo } from '../../types/data';
import apiClient from '../../services/api';
import dayjs from 'dayjs';
import { getLectorSugerencias, getLectoresParaMapa } from '../../services/lectoresApi';
import { IconPlus, IconTrash, IconEdit, IconEye, IconEyeOff, IconCheck, IconX, IconInfoCircle, IconMaximize, IconMinimize, IconClock, IconGauge, IconMapPin, IconCamera, IconRefresh } from '@tabler/icons-react';
import { useHotkeys } from '@mantine/hooks';
import html2canvas from 'html2canvas';

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

// --- InfoBanner (copiado de GpsMapStandalone) ---
const InfoBanner = ({ info, onClose }: {
  info: any;
  onClose: () => void;
}) => {
  if (!info) return null;
  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      zIndex: 2001,
      background: 'white',
      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      borderBottom: '2px solid #228be6',
      animation: 'slideDown 0.3s',
      fontFamily: 'inherit',
    }}>
      <Card shadow="sm" padding="md" radius="md" withBorder style={{ width: '100%', boxSizing: 'border-box', position: 'relative' }}>
        <ActionIcon
          variant="subtle"
          color="gray"
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}
          onClick={onClose}
          aria-label="Cerrar info"
        >
          <IconX size={20} />
        </ActionIcon>
        <Card.Section withBorder inheritPadding py="sm">
          <Group justify="space-between" style={{ minWidth: 0, width: '100%' }}>
            <Text fw={700} size="sm" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {info.tipo === 'lector' ? 'Lector LPR' : 'Lectura LPR'}
            </Text>
            <Tooltip label={info.tipo === 'lector' ? info.ID_Lector : info.Matricula} withArrow>
              <Badge
                color="blue"
                variant="light"
                size="sm"
                style={{
                  maxWidth: 80,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'block',
                  padding: '0 8px',
                }}
              >
                {info.tipo === 'lector' ? info.ID_Lector : info.Matricula}
              </Badge>
            </Tooltip>
          </Group>
        </Card.Section>
        <div style={{ width: '100%', marginTop: 8 }}>
          {info.tipo === 'lector' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}><IconMapPin size={14} style={{ color: 'gray' }} /></span>
                <span style={{ fontSize: 13, wordBreak: 'break-word' }}><b>Coords:</b> {info.Coordenada_Y?.toFixed(5)}, {info.Coordenada_X?.toFixed(5)}</span>
              </div>
              {info.Nombre && <div style={{ fontSize: 13, marginBottom: 4 }}><b>Nombre:</b> {info.Nombre}</div>}
              {info.Carretera && <div style={{ fontSize: 13, marginBottom: 4 }}><b>Carretera:</b> {info.Carretera}</div>}
              {info.Provincia && <div style={{ fontSize: 13, marginBottom: 4 }}><b>Provincia:</b> {info.Provincia}</div>}
              {info.Organismo_Regulador && <div style={{ fontSize: 13, marginBottom: 4 }}><b>Organismo:</b> {info.Organismo_Regulador}</div>}
              {info.lecturas && info.lecturas.length > 0 && (
                <>
                  <div style={{ fontWeight: 700, fontSize: 13, marginTop: 8 }}>Pasos registrados:</div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {info.lecturas.map((lectura: any, idx: number) => (
                      <li key={idx} style={{ fontSize: 12 }}>
                        {dayjs(lectura.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')} - {lectura.Matricula} {lectura.Velocidad ? `(${lectura.Velocidad} km/h)` : ''}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}><IconClock size={14} style={{ color: 'gray' }} /></span>
                <span style={{ fontSize: 13, color: '#666', wordBreak: 'break-word' }}>{dayjs(info.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}><IconGauge size={14} style={{ color: 'gray' }} /></span>
                <span style={{ fontSize: 13, wordBreak: 'break-word' }}><b>Velocidad:</b> {typeof info.Velocidad === 'number' && !isNaN(info.Velocidad) ? info.Velocidad.toFixed(1) : '?'} km/h</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}><IconMapPin size={14} style={{ color: 'gray' }} /></span>
                <span style={{ fontSize: 13, wordBreak: 'break-word' }}><b>Coords:</b> {info.Coordenada_Y?.toFixed(5)}, {info.Coordenada_X?.toFixed(5)}</span>
              </div>
            </>
          )}
        </div>
      </Card>
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

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

  const [infoBanner, setInfoBanner] = useState<any | null>(null);

  const [selectedLectura, setSelectedLectura] = useState<Lectura | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const [vehiculosLoading, setVehiculosLoading] = useState(false);

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
  const fetchVehiculosInteres = useCallback(async () => {
    setVehiculosLoading(true);
    try {
      const response = await apiClient.get<Vehiculo[]>(`/casos/${casoId}/vehiculos`);
      setVehiculosInteres(response.data);
    } catch (error) {
      console.error('Error al obtener vehículos de interés:', error);
    } finally {
      setVehiculosLoading(false);
    }
  }, [casoId]);

  useEffect(() => {
    fetchVehiculosInteres();
  }, [fetchVehiculosInteres]);

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

  // Función para renderizar los resultados del filtro actual
  const renderResultadosFiltro = () => {
    // Filtrar solo lecturas LPR
    const lecturasLPR = resultadosFiltro.lecturas.filter(l => l.Tipo_Fuente !== 'GPS');
    if (lecturasLPR.length === 0) return null;

    console.log('Renderizando resultados. Lectura seleccionada:', selectedLectura);
    console.log('Total lecturas LPR:', lecturasLPR.length);

    return (
      <>
        {/* Renderizar lectores con lecturas */}
        {resultadosFiltro.lectores.map((lector) => {
          const lecturasEnLector = lecturasLPR.filter(l => l.ID_Lector === lector.ID_Lector);
          return (
            <Marker 
              key={`filtro-lector-${lector.ID_Lector}`}
              position={[lector.Coordenada_Y!, lector.Coordenada_X!]}
              icon={createMarkerIcon(lecturasEnLector.length, 'lector', '#228be6')}
              zIndexOffset={500}
              eventHandlers={{
                click: () => setInfoBanner({ ...lector, tipo: 'lector', lecturas: lecturasEnLector })
              }}
            />
          );
        })}

        {/* Primero renderizar lecturas no seleccionadas */}
        {lecturasLPR
          .filter(l => !l.ID_Lector && l.ID_Lectura !== selectedLectura?.ID_Lectura)
          .map((lectura) => (
            <Marker 
              key={`filtro-lectura-${lectura.ID_Lectura}`}
              position={[lectura.Coordenada_Y!, lectura.Coordenada_X!]}
              icon={createMarkerIcon(1, lectura.Tipo_Fuente.toLowerCase() as 'gps' | 'lpr', '#228be6')}
              zIndexOffset={600}
              eventHandlers={{
                click: () => setInfoBanner({ ...lectura, tipo: 'lectura' })
              }}
            />
          ))}

        {/* Luego renderizar la lectura seleccionada para que esté por encima */}
        {selectedLectura && lecturasLPR.some(l => l.ID_Lectura === selectedLectura.ID_Lectura) && (
          <>
            <Circle
              center={[selectedLectura.Coordenada_Y!, selectedLectura.Coordenada_X!]}
              radius={50}
              pathOptions={{
                color: '#228be6',
                fillColor: '#228be6',
                fillOpacity: 0.2,
                weight: 2
              }}
            />
            <Marker 
              key={`filtro-lectura-selected-${selectedLectura.ID_Lectura}`}
              position={[selectedLectura.Coordenada_Y!, selectedLectura.Coordenada_X!]}
              icon={L.divIcon({
                className: 'custom-div-icon',
                html: `
                  <div style="
                    position: relative;
                    width: 45px;
                    height: 45px;
                    z-index: 1000;
                  ">
                    <div style="
                      position: absolute;
                      top: 50%;
                      left: 50%;
                      transform: translate(-50%, -50%);
                      width: 45px;
                      height: 45px;
                      background-color: #fa5252;
                      border: 3px solid white;
                      border-radius: 50%;
                      box-shadow: 0 0 12px rgba(0,0,0,0.5);
                      animation: pulse 1.5s infinite;
                    "></div>
                    <div style="
                      position: absolute;
                      top: 50%;
                      left: 50%;
                      transform: translate(-50%, -50%);
                      width: 22px;
                      height: 22px;
                      background-color: white;
                      border-radius: 50%;
                      animation: pulse-inner 1.5s infinite;
                    "></div>
                    <div style="
                      position: absolute;
                      top: 50%;
                      left: 50%;
                      transform: translate(-50%, -50%);
                      width: 11px;
                      height: 11px;
                      background-color: #fa5252;
                      border-radius: 50%;
                      animation: pulse-core 1.5s infinite;
                    "></div>
                  </div>
                  <style>
                    @keyframes pulse {
                      0% { transform: translate(-50%, -50%) scale(1); }
                      50% { transform: translate(-50%, -50%) scale(1.15); }
                      100% { transform: translate(-50%, -50%) scale(1); }
                    }
                    @keyframes pulse-inner {
                      0% { transform: translate(-50%, -50%) scale(1); }
                      50% { transform: translate(-50%, -50%) scale(1.1); }
                      100% { transform: translate(-50%, -50%) scale(1); }
                    }
                    @keyframes pulse-core {
                      0% { transform: translate(-50%, -50%) scale(1); }
                      50% { transform: translate(-50%, -50%) scale(1.05); }
                      100% { transform: translate(-50%, -50%) scale(1); }
                    }
                  </style>
                `,
                iconSize: [45, 45],
                iconAnchor: [22, 22]
              })}
              zIndexOffset={1000}
              eventHandlers={{
                click: () => setInfoBanner({ ...selectedLectura, tipo: 'lectura' })
              }}
            />
          </>
        )}
      </>
    );
  };

  // Función para renderizar los marcadores de una capa
  const renderCapaMarkers = (capa: Capa) => {
    if (!capa.activa) return null;

    const markers: React.ReactElement[] = [];

    // Renderizar lectores de la capa
    capa.lectores.forEach((lector) => {
      // Filtrar solo lecturas LPR
      const lecturasEnLector = capa.lecturas.filter(l => l.ID_Lector === lector.ID_Lector && l.Tipo_Fuente !== 'GPS');
      if (!lector.Coordenada_X || !lector.Coordenada_Y) return;

      markers.push(
        <Marker 
          key={`${capa.id}-lector-${lector.ID_Lector}`}
          position={[lector.Coordenada_Y, lector.Coordenada_X]}
          icon={createMarkerIcon(lecturasEnLector.length, 'lector', capa.color)}
          zIndexOffset={300}
          eventHandlers={{
            click: () => setInfoBanner({ ...lector, tipo: 'lector', lecturas: lecturasEnLector })
          }}
        />
      );
    });

    // Renderizar lecturas individuales (solo LPR)
    capa.lecturas
      .filter(l => !l.ID_Lector && l.Coordenada_X && l.Coordenada_Y && l.Tipo_Fuente !== 'GPS')
      .forEach((lectura) => {
        markers.push(
          <Marker 
            key={`${capa.id}-lectura-${lectura.ID_Lectura}`}
            position={[lectura.Coordenada_Y!, lectura.Coordenada_X!]}
            icon={createMarkerIcon(1, lectura.Tipo_Fuente.toLowerCase() as 'gps' | 'lpr', capa.color)}
            zIndexOffset={400}
            eventHandlers={{
              click: () => setInfoBanner({ ...lectura, tipo: 'lectura' })
            }}
          />
        );
      });

    return markers;
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
            eventHandlers={{
              click: () => setInfoBanner({ ...lector, tipo: 'lector', lecturas: [] })
            }}
          />
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
            eventHandlers={{
              click: () => setInfoBanner({ ...lector, tipo: 'lector', lecturas: [] })
            }}
          />
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
      />
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

  // Función para centrar el mapa en una lectura específica
  const centerMapOnLectura = useCallback((lectura: Lectura) => {
    if (!mapRef.current || !lectura.Coordenada_X || !lectura.Coordenada_Y) return;
    
    console.log('Centrando mapa en lectura:', lectura);
    
    // Centrar el mapa y hacer zoom
    mapRef.current.setView(
      [lectura.Coordenada_Y, lectura.Coordenada_X],
      18, // Zoom más cercano para mejor detalle
      {
        animate: true,
        duration: 1 // Duración de la animación en segundos
      }
    );
    
    // Actualizar la lectura seleccionada
    setSelectedLectura(lectura);
    console.log('Lectura seleccionada actualizada:', lectura);
  }, []);

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
          canvas {
            will-read-frequently: true;
          }
        `}
      </style>
      {/* Banner deslizante */}
      <InfoBanner info={infoBanner} onClose={() => setInfoBanner(null)} />
      {/* Botones de cámara y pantalla completa arriba a la derecha */}
      <div style={{
        position: 'absolute',
        top: 12,
        right: 16,
        zIndex: 1000,
        display: 'flex',
        gap: 8
      }}>
        <ActionIcon
          variant="default"
          size={32}
          style={{
            width: 32,
            height: 32,
            background: 'white',
            border: '2px solid #234be7',
            color: '#234be7',
            boxShadow: 'none',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0
          }}
          onClick={async () => {
            const mapContainer = document.querySelector('.leaflet-container')?.parentElement;
            if (!mapContainer) return;
            const cameraBtn = document.getElementById('camera-capture-btn-lpr');
            if (cameraBtn) cameraBtn.style.visibility = 'hidden';
            await new Promise(r => setTimeout(r, 50));
            html2canvas(mapContainer, { 
              useCORS: true, 
              backgroundColor: null,
            }).then(canvas => {
              if (cameraBtn) cameraBtn.style.visibility = 'visible';
              const link = document.createElement('a');
              link.download = `captura-mapa-lpr.png`;
              link.href = canvas.toDataURL('image/png');
              link.click();
            });
          }}
          id="camera-capture-btn-lpr"
          aria-label="Exportar captura de pantalla"
        >
          <IconCamera size={16} color="#234be7" />
        </ActionIcon>
        <ActionIcon
          variant="default"
          size={32}
          style={{
            width: 32,
            height: 32,
            background: 'white',
            border: '2px solid #234be7',
            color: '#234be7',
            boxShadow: 'none',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0
          }}
          onClick={() => isFullscreen ? setFullscreenMap(false) : setFullscreenMap(true)}
          aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
        >
          {isFullscreen ? <IconMinimize size={16} color="#234be7" /> : <IconMaximize size={16} color="#234be7" />}
        </ActionIcon>
      </div>
      <MapContainer 
        key={`map-${mapKey}-${lectores.length}-${lecturas.length}-${capas.length}-${resultadosFiltro.lecturas.length}-${mapControls.visualizationType}`}
        center={centroInicial} 
        zoom={zoomInicial} 
        scrollWheelZoom={true} 
        style={{ 
          ...mapContainerStyle,
          height: isFullscreen ? '100vh' : '100%',
        }}
        ref={(map) => {
          if (map) {
            mapRef.current = map;
          }
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={getTileLayerUrl()}
          maxZoom={19}
          errorTileUrl="https://tiles.stadiamaps.com/tiles/stamen_toner_lite/0/0/0.png"
          tileSize={256}
          zoomOffset={0}
          updateWhenIdle={true}
          updateWhenZooming={false}
          keepBuffer={2}
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
    </div>
  );

  // Componente para el panel de lecturas filtradas
  const LecturasFiltradasPanel = () => {
    const [sortBy, setSortBy] = useState<keyof Lectura>('Fecha_y_Hora');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const lecturasOrdenadas = useMemo(() => {
      return [...resultadosFiltro.lecturas]
        .filter(lectura => lectura.Tipo_Fuente !== 'GPS')
        .sort((a, b) => {
          const aValue = a[sortBy];
          const bValue = b[sortBy];
          
          if (sortBy === 'Fecha_y_Hora') {
            const dateA = new Date(aValue as string).getTime();
            const dateB = new Date(bValue as string).getTime();
            return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
          }
          
          // Para otros campos, ordenación alfabética
          const comparison = String(aValue).localeCompare(String(bValue));
          return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [resultadosFiltro.lecturas, sortBy, sortDirection]);

    const handleSort = (column: keyof Lectura) => {
      if (sortBy === column) {
        setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setSortBy(column);
        setSortDirection('asc');
      }
    };

    return (
      <Paper p="md" withBorder style={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
        <Title order={3} mb="md">Lecturas LPR Filtradas</Title>
        {lecturasOrdenadas.length === 0 ? (
          <Text c="dimmed" ta="center" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            No hay lecturas LPR filtradas para mostrar
          </Text>
        ) : (
          <ScrollArea style={{ flex: 1 }}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th 
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSort('Fecha_y_Hora')}
                  >
                    Fecha/Hora
                    {sortBy === 'Fecha_y_Hora' && (
                      <span style={{ marginLeft: 8 }}>
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </Table.Th>
                  <Table.Th 
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSort('Matricula')}
                  >
                    Matrícula
                    {sortBy === 'Matricula' && (
                      <span style={{ marginLeft: 8 }}>
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </Table.Th>
                  <Table.Th 
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSort('ID_Lector')}
                  >
                    Lector
                    {sortBy === 'ID_Lector' && (
                      <span style={{ marginLeft: 8 }}>
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lecturasOrdenadas.map((lectura) => (
                  <Table.Tr 
                    key={lectura.ID_Lectura}
                    style={{ 
                      cursor: 'pointer',
                      backgroundColor: selectedLectura?.ID_Lectura === lectura.ID_Lectura ? 'var(--mantine-color-blue-1)' : undefined,
                      fontWeight: selectedLectura?.ID_Lectura === lectura.ID_Lectura ? 'bold' : 'normal',
                      borderLeft: selectedLectura?.ID_Lectura === lectura.ID_Lectura ? '4px solid var(--mantine-color-blue-6)' : undefined
                    }}
                    onClick={() => centerMapOnLectura(lectura)}
                  >
                    <Table.Td>{dayjs(lectura.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')}</Table.Td>
                    <Table.Td>{lectura.Matricula}</Table.Td>
                    <Table.Td>{lectura.ID_Lector || '-'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Paper>
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
          leftSection={<IconRefresh size={16} />}
          variant="light"
          color="blue"
          size="xs"
          onClick={fetchVehiculosInteres}
          loading={vehiculosLoading}
          style={{
            backgroundColor: 'var(--mantine-color-blue-0)',
            color: 'var(--mantine-color-blue-6)',
            border: 'none',
            fontWeight: 600,
            borderRadius: 8,
            paddingLeft: 18,
            paddingRight: 18,
            height: 32,
            boxShadow: 'none',
            fontSize: 15,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          Actualizar
        </Button>
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
        <Grid.Col span={{ base: 12, md: 3 }}>
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

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper p="md" withBorder style={{ height: 'calc(100vh - 300px)', position: 'relative' }}>
            {lectores.length === 0 ? (
              <Box style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Text c="dimmed">No hay lectores con coordenadas válidas para mostrar en el mapa.</Text>
              </Box>
            ) : (
              <MapComponent isFullscreen={false} />
            )}
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 3 }}>
          <LecturasFiltradasPanel />
        </Grid.Col>
      </Grid>
    </Box>
  );
};

export default MapPanel; 