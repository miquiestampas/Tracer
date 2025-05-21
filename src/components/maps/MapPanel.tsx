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
import { IconPlus, IconTrash, IconEdit, IconEye, IconEyeOff, IconCheck, IconX, IconInfoCircle, IconMaximize, IconMinimize, IconClock, IconGauge, IconMapPin, IconCamera, IconRefresh, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
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
const InfoBanner = ({ info, onClose, onNavigate }: {
  info: any;
  onClose: () => void;
  onNavigate?: (direction: 'prev' | 'next') => void;
}) => {
  if (!info) return null;
  const isLector = info.tipo === 'lector';
  return (
    <div style={{
      position: 'absolute',
      left: 0,
      bottom: 0,
      width: '100%',
      zIndex: 2001,
      background: 'rgba(60,60,60,0.65)',
      boxShadow: '0 -2px 12px rgba(0,0,0,0.15)',
      borderTop: '2px solid #228be6',
      animation: 'slideUp 0.3s',
      fontFamily: 'inherit',
      color: 'white',
      padding: 0,
      backdropFilter: 'blur(4px)'
    }}>
      <Card shadow="sm" padding="md" radius="md" withBorder style={{ width: '100%', boxSizing: 'border-box', position: 'relative', background: 'transparent', border: 'none', color: 'white', boxShadow: 'none' }}>
        <ActionIcon
          variant="subtle"
          color="gray"
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, color: 'white' }}
          onClick={onClose}
          aria-label="Cerrar info"
          size="sm"
        >
          <IconX size={18} />
        </ActionIcon>
        <Group justify="space-between" align="center" style={{ minWidth: 0, width: '100%' }}>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <Text fw={700} size="lg" style={{ color: 'white', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 18 }}>
              {isLector ? info.ID_Lector : info.Matricula}
            </Text>
            <div style={{ marginTop: 2, fontSize: 16, fontWeight: 500, color: '#fff' }}>
              {(() => {
                const raw = isLector ? info.Fecha_Alta : info.Fecha_y_Hora;
                if (!raw) return null;
                const [date, time] = raw.split('T');
                return date && time ? `${date} - ${time?.slice(0,8)}` : raw;
              })()}
            </div>
            <Tooltip label={isLector ? info.ID_Lector : info.Matricula} withArrow>
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
                  marginTop: 4
                }}
              >
                {isLector ? info.ID_Lector : info.Matricula}
              </Badge>
            </Tooltip>
            <div style={{ marginTop: 4 }}>
              {isLector ? (
                <span style={{ fontSize: 13, color: '#eee', wordBreak: 'break-word' }}><b>Coords:</b> {info.Coordenada_Y?.toFixed(5)}, {info.Coordenada_X?.toFixed(5)}</span>
              ) : (
                <>
                  <span style={{ fontSize: 13, color: '#eee', wordBreak: 'break-word' }}><b>Velocidad:</b> {typeof info.Velocidad === 'number' && !isNaN(info.Velocidad) ? info.Velocidad.toFixed(1) : '?'} km/h</span>
                  <span style={{ marginLeft: 16, fontSize: 13, color: '#eee' }}><b>Coords:</b> {info.Coordenada_Y?.toFixed(5)}, {info.Coordenada_X?.toFixed(5)}</span>
                </>
              )}
            </div>
            {isLector && info.Nombre && (
              <div style={{ marginTop: 4 }}>
                <span style={{ fontSize: 13, color: '#ffd700', wordBreak: 'break-word' }}><b>Nombre:</b> {info.Nombre}</span>
              </div>
            )}
          </div>
          {onNavigate && !isLector && (
            <Group gap={8} style={{ marginLeft: 16 }}>
              <ActionIcon size="md" variant="filled" color="white" style={{ background: 'white', color: '#228be6' }} onClick={() => onNavigate('prev')}><IconChevronLeft size={20} /></ActionIcon>
              <ActionIcon size="md" variant="filled" color="white" style={{ background: 'white', color: '#228be6' }} onClick={() => onNavigate('next')}><IconChevronRight size={20} /></ActionIcon>
            </Group>
          )}
        </Group>
      </Card>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
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
            key={'system-reader-' + lector.ID_Lector}
            position={[lector.Coordenada_Y!, lector.Coordenada_X!]}
            icon={createMarkerIcon(1, 'lector', '#228be6')}
            zIndexOffset={100}
            eventHandlers={{
              click: () => setInfoBanner({ ...lector, tipo: 'lector', lecturas: [] })
            }}
          />
        ))}
      </>
    );
  };

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative', zIndex: 1 }}>
      {/* Rest of the component content */}
    </div>
  );
};

export default MapPanel;