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
import { IconPlus, IconTrash, IconEdit, IconEye, IconEyeOff, IconCheck, IconX, IconInfoCircle, IconMaximize, IconMinimize, IconClock, IconGauge, IconMapPin, IconCamera } from '@tabler/icons-react';
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
    fechaInicio: string;
    horaInicio: string;
    fechaFin: string;
    horaFin: string;
    lectorId: string;
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
      bottom: 0,
      left: 0,
      width: '100%',
      zIndex: 2001,
      background: 'rgba(33, 37, 41, 0.7)',
      boxShadow: '0 -2px 12px rgba(0,0,0,0.15)',
      borderTop: '2px solid #228be6',
      animation: 'slideUp 0.3s',
      fontFamily: 'inherit',
    }}>
      <Card shadow="sm" padding="md" radius="md" withBorder style={{ 
        width: '100%', 
        boxSizing: 'border-box', 
        position: 'relative',
        background: 'rgba(33, 37, 41, 0.7)',
        borderColor: '#228be6'
      }}>
        <ActionIcon
          variant="subtle"
          color="gray"
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}
          onClick={onClose}
          aria-label="Cerrar info"
        >
          <IconX size={20} />
        </ActionIcon>
        <Card.Section withBorder inheritPadding py="sm" style={{ borderColor: '#228be6', padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'stretch', minWidth: 0, width: '100%' }}>
            {/* Columna izquierda: Título */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', padding: '0 16px', height: '48px' }}>
              <Text fw={700} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'white' }}>
                {info.tipo === 'lector' ? 'Lector LPR' : 'Lectura LPR'}
              </Text>
            </div>
            {/* Columna derecha: ID de lector o matrícula */}
            <div style={{ width: '280px', minWidth: '200px', borderLeft: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', padding: '0 16px', height: '48px' }}>
              <Text fw={700} size="sm" style={{ color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {info.tipo === 'lector' ? info.ID_Lector : info.Matricula}
              </Text>
            </div>
          </div>
        </Card.Section>
        <div style={{ width: '100%', marginTop: 8 }}>
          {info.tipo === 'lector' ? (
            <div style={{ display: 'flex', gap: '0' }}>
              {/* Columna izquierda - Lecturas */}
              <div style={{ flex: 1, padding: '0 16px' }}>
                {info.lecturas && info.lecturas.length > 0 && (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: 'white' }}>Pasos registrados:</div>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {info.lecturas.map((lectura: any, idx: number) => (
                        <li key={idx} style={{ fontSize: 14, color: 'white', marginBottom: 8 }}>
                          {dayjs(lectura.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')} - {lectura.Matricula} {lectura.Velocidad ? `(${lectura.Velocidad} km/h)` : ''}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              {/* Columna derecha - Información del lector */}
              <div style={{ 
                width: '280px', 
                minWidth: '200px',
                paddingLeft: 0,
                borderLeft: '1px solid rgba(255, 255, 255, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '0 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 4 }}>
                  <IconMapPin size={16} style={{ color: '#228be6' }} />
                  <div style={{ fontSize: 14, color: 'white' }}>
                    <span style={{ fontWeight: 600 }}>Coords:</span> {info.Coordenada_Y?.toFixed(5)}, {info.Coordenada_X?.toFixed(5)}
                  </div>
                </div>
                {info.Nombre && (
                  <div style={{ fontSize: 14, color: 'white' }}>
                    <span style={{ fontWeight: 600 }}>Nombre:</span> {info.Nombre}
                  </div>
                )}
                {info.Provincia && (
                  <div style={{ fontSize: 14, color: 'white' }}>
                    <span style={{ fontWeight: 600 }}>Provincia:</span> {info.Provincia}
                  </div>
                )}
                {info.Organismo_Regulador && (
                  <div style={{ fontSize: 14, color: 'white' }}>
                    <span style={{ fontWeight: 600 }}>Organismo:</span> {info.Organismo_Regulador}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}><IconClock size={14} style={{ color: '#228be6' }} /></span>
                <span style={{ fontSize: 13, color: 'white', wordBreak: 'break-word' }}>{dayjs(info.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}><IconGauge size={14} style={{ color: '#228be6' }} /></span>
                <span style={{ fontSize: 13, wordBreak: 'break-word', color: 'white' }}><b>Velocidad:</b> {typeof info.Velocidad === 'number' && !isNaN(info.Velocidad) ? info.Velocidad.toFixed(1) : '?'} km/h</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}><IconMapPin size={14} style={{ color: '#228be6' }} /></span>
                <span style={{ fontSize: 13, wordBreak: 'break-word', color: 'white' }}><b>Coords:</b> {info.Coordenada_Y?.toFixed(5)}, {info.Coordenada_X?.toFixed(5)}</span>
              </div>
            </>
          )}
        </div>
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
  const [editandoCapa, setEditandoCapa] = useState<Capa | null>(null);
  const [mostrarFormularioCapa, setMostrarFormularioCapa] = useState(false);
  const [resultadosFiltro, setResultadosFiltro] = useState<{
    lecturas: Lectura[];
    lectores: LectorCoordenadas[];
  }>({ lecturas: [], lectores: [] });

  const [filters, setFilters] = useState({
    fechaInicio: '',
    horaInicio: '',
    fechaFin: '',
    horaFin: '',
    lectorId: ''
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
            lector_id: filters.lectorId
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
      fechaInicio: '',
      horaInicio: '',
      fechaFin: '',
      horaFin: '',
      lectorId: ''
    });
    setSelectedMatricula(null);
    setLecturas([]);
  }, []);

  // Cargar datos iniciales de lectores
  useEffect(() => {
    const fetchLectores = async () => {
      try {
        console.log('Cargando lectores para caso:', casoId);
        const response = await apiClient.get<LectorCoordenadas[]>(`/casos/${casoId}/lectores`);
        const lectoresData = response.data.filter(l => l.Coordenada_X != null && l.Coordenada_Y != null);
        console.log('Lectores cargados:', lectoresData);
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
    if (filtros.lectorId) partes.push(`Lector: ${filtros.lectorId}`);
    if (filtros.fechaInicio || filtros.fechaFin) {
      const fechaInicio = filtros.fechaInicio ? dayjs(filtros.fechaInicio).format('DD/MM/YYYY') : 'Inicio';
      const fechaFin = filtros.fechaFin ? dayjs(filtros.fechaFin).format('DD/MM/YYYY') : 'Fin';
      partes.push(`Período: ${fechaInicio} - ${fechaFin}`);
    }
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
      fechaInicio: '',
      horaInicio: '',
      fechaFin: '',
      horaFin: '',
      lectorId: ''
    });
  };

  const handleEditarCapa = (id: string) => {
    const capa = capas.find(c => c.id === id);
    if (!capa) return;

    setNuevaCapa({
      nombre: capa.nombre,
      color: capa.color
    });
    setEditandoCapa(capa);
    setMostrarFormularioCapa(true);
  };

  const handleActualizarCapa = () => {
    if (!editandoCapa || !nuevaCapa.nombre) return;

    setCapas(prev => prev.map(capa => 
      capa.id === editandoCapa.id
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

  // Función para renderizar los resultados del filtro actual
  const renderResultadosFiltro = () => {
    // Filtrar solo lecturas LPR
    const lecturasLPR = resultadosFiltro.lecturas.filter(l => l.Tipo_Fuente !== 'GPS');
    console.log('Renderizando resultados. Total lecturas LPR:', lecturasLPR.length);
    console.log('Lectores en resultados:', resultadosFiltro.lectores.length);

    if (lecturasLPR.length === 0) return null;

    return (
      <>
        {/* Renderizar lectores con lecturas */}
        {resultadosFiltro.lectores.map((lector) => {
          const lecturasEnLector = lecturasLPR.filter(l => l.ID_Lector === lector.ID_Lector);
          console.log(`Lector ${lector.ID_Lector} tiene ${lecturasEnLector.length} lecturas`);
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

        {/* Renderizar lecturas individuales */}
        {lecturasLPR
          .filter(l => !l.ID_Lector && l.Coordenada_X && l.Coordenada_Y)
          .map((lectura) => {
            console.log('Renderizando lectura individual:', lectura.ID_Lectura);
            const isSelected = selectedLectura?.ID_Lectura === lectura.ID_Lectura;
            return (
              <React.Fragment key={`filtro-lectura-${lectura.ID_Lectura}`}>
                {/* Círculo de resaltado para la lectura seleccionada */}
                {isSelected && (
                  <Circle
                    center={[lectura.Coordenada_Y!, lectura.Coordenada_X!]}
                    radius={50}
                    pathOptions={{
                      color: '#228be6',
                      fillColor: '#228be6',
                      fillOpacity: 0.1,
                      weight: 2,
                      dashArray: '5, 5'
                    }}
                  />
                )}
                <Marker 
                  position={[lectura.Coordenada_Y!, lectura.Coordenada_X!]}
                  icon={L.divIcon({
                    className: 'custom-div-icon',
                    html: `
                      <div style="
                        position: relative;
                        width: ${isSelected ? '36px' : '16px'};
                        height: ${isSelected ? '36px' : '16px'};
                        background: ${isSelected ? 'rgba(34,139,230,0.25)' : '#228be6'};
                        border-radius: 50%;
                        border: ${isSelected ? '3px solid #fff' : '2px solid #fff'};
                        box-shadow: 0 0 12px rgba(34,139,230,0.5);
                        animation: ${isSelected ? 'gpsPulse 1.5s infinite' : 'none'};
                        display: flex;
                        align-items: center;
                        justify-content: center;
                      ">
                        ${isSelected ? `
                          <div style="
                            position: absolute;
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%);
                            width: 10px;
                            height: 10px;
                            background: #fff;
                            border-radius: 50%;
                            box-shadow: 0 0 8px #228be6;
                          "></div>
                        ` : ''}
                      </div>
                      <style>
                        @keyframes gpsPulse {
                          0% { box-shadow: 0 0 0 0 rgba(34,139,230,0.5); }
                          70% { box-shadow: 0 0 0 12px rgba(34,139,230,0); }
                          100% { box-shadow: 0 0 0 0 rgba(34,139,230,0.5); }
                        }
                      </style>
                    `,
                    iconSize: [isSelected ? 36 : 16, isSelected ? 36 : 16],
                    iconAnchor: [isSelected ? 18 : 8, isSelected ? 18 : 8]
                  })}
                  zIndexOffset={isSelected ? 700 : 600}
                  eventHandlers={{
                    click: () => setInfoBanner({ ...lectura, tipo: 'lectura' })
                  }}
                />
              </React.Fragment>
            );
          })}
      </>
    );
  };

  // Función para renderizar los marcadores de una capa
  const renderCapaMarkers = (capa: Capa) => {
    if (!capa.activa) return null;

    console.log(`Renderizando capa ${capa.nombre}:`, {
      lectores: capa.lectores.length,
      lecturas: capa.lecturas.length
    });

    const markers: React.ReactElement[] = [];

    // Renderizar lectores de la capa
    capa.lectores.forEach((lector) => {
      if (!lector.Coordenada_X || !lector.Coordenada_Y) return;
      
      // Filtrar solo lecturas LPR
      const lecturasEnLector = capa.lecturas.filter(l => l.ID_Lector === lector.ID_Lector && l.Tipo_Fuente !== 'GPS');
      console.log(`Lector ${lector.ID_Lector} en capa ${capa.nombre} tiene ${lecturasEnLector.length} lecturas`);

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
        console.log('Renderizando lectura individual en capa:', lectura.ID_Lectura);
        const isSelected = selectedLectura?.ID_Lectura === lectura.ID_Lectura;
        markers.push(
          <React.Fragment key={`${capa.id}-lectura-${lectura.ID_Lectura}`}>
            {/* Círculo de resaltado para la lectura seleccionada */}
            {isSelected && (
              <Circle
                center={[lectura.Coordenada_Y!, lectura.Coordenada_X!]}
                radius={50}
                pathOptions={{
                  color: capa.color,
                  fillColor: capa.color,
                  fillOpacity: 0.1,
                  weight: 2,
                  dashArray: '5, 5'
                }}
              />
            )}
            <Marker 
              position={[lectura.Coordenada_Y!, lectura.Coordenada_X!]}
              icon={L.divIcon({
                className: 'custom-div-icon',
                html: `
                  <div style="
                    position: relative;
                    width: ${isSelected ? '36px' : '16px'};
                    height: ${isSelected ? '36px' : '16px'};
                    background: ${isSelected ? 'rgba(34,139,230,0.25)' : capa.color};
                    border-radius: 50%;
                    border: ${isSelected ? '3px solid #fff' : '2px solid #fff'};
                    box-shadow: 0 0 12px rgba(34,139,230,0.5);
                    animation: ${isSelected ? 'gpsPulse 1.5s infinite' : 'none'};
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  ">
                    ${isSelected ? `
                      <div style="
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        width: 10px;
                        height: 10px;
                        background: #fff;
                        border-radius: 50%;
                        box-shadow: 0 0 8px #228be6;
                      "></div>
                    ` : ''}
                  </div>
                  <style>
                    @keyframes gpsPulse {
                      0% { box-shadow: 0 0 0 0 rgba(34,139,230,0.5); }
                      70% { box-shadow: 0 0 0 12px rgba(34,139,230,0); }
                      100% { box-shadow: 0 0 0 0 rgba(34,139,230,0.5); }
                    }
                  </style>
                `,
                iconSize: [isSelected ? 36 : 16, isSelected ? 36 : 16],
                iconAnchor: [isSelected ? 18 : 8, isSelected ? 18 : 8]
              })}
              zIndexOffset={isSelected ? 500 : 400}
              eventHandlers={{
                click: () => setInfoBanner({ ...lectura, tipo: 'lectura' })
              }}
            />
          </React.Fragment>
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
    console.log('Renderizando capas de lectores:', {
      showCaseReaders: mapControls.showCaseReaders,
      showAllReaders: mapControls.showAllReaders,
      lectoresCaso: lectores.length,
      lectoresSistema: allSystemReaders.length
    });

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
      fechaInicio: '',
      horaInicio: '',
      fechaFin: '',
      horaFin: '',
      lectorId: ''
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
          onClick={handleExportarMapa}
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
         !capas.some(capa => capa.activa && capa.filtros.lectorId === selectedMatricula) && 
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

    if (lecturasOrdenadas.length === 0) {
      return (
        <Paper p="md" withBorder style={{ height: 'calc(100vh - 300px)' }}>
          <Text c="dimmed" ta="center">No hay lecturas LPR filtradas para mostrar</Text>
        </Paper>
      );
    }

    return (
      <Paper p="md" withBorder style={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
        <Title order={3} mb="md">Lecturas LPR Filtradas</Title>
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
      </Paper>
    );
  };

  const handleExportarMapa = async () => {
    const mapElement = document.querySelector('.leaflet-container');
    if (!mapElement) return;

    try {
      const canvas = await html2canvas(mapElement as HTMLElement, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        scale: 2
      });

      const link = document.createElement('a');
      link.download = `captura-mapa-lpr.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Error al exportar el mapa:', error);
    }
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
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Grid style={{ flex: 1, margin: 0 }}>
        {/* Panel de filtros a la izquierda */}
        <Grid.Col span={3} style={{ padding: '16px', borderRight: '1px solid #eee' }}>
          <Stack gap="md">
            <Paper shadow="xs" p="md">
              <Title order={4} mb="md">Filtros</Title>
              <Stack gap="md">
                <Select
                  label="Vehículo"
                  placeholder="Selecciona un vehículo"
                  value={selectedMatricula}
                  onChange={(value) => {
                    setSelectedMatricula(value);
                  }}
                  data={vehiculosOptions}
                  searchable
                  clearable
                />
                <LecturaFilters
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  onFiltrar={handleFiltrar}
                  onLimpiar={handleLimpiar}
                  loading={loading}
                  lectorSuggestions={lectorSuggestions}
                />
              </Stack>
            </Paper>

            <Paper shadow="xs" p="md">
              <Group justify="space-between" mb="md">
                <Title order={4}>Capas</Title>
                <Button
                  variant="light"
                  size="xs"
                  leftSection={<IconPlus size={16} />}
                  onClick={handleGuardarResultadosEnCapa}
                  disabled={!selectedMatricula || resultadosFiltro.lecturas.length === 0}
                >
                  Nueva Capa
                </Button>
              </Group>
              <Stack gap="xs">
                {capas.map((capa) => (
                  <Paper key={capa.id} p="xs" withBorder>
                    <Group justify="space-between">
                      <Group gap="xs">
                        <Switch
                          checked={capa.activa}
                          onChange={() => handleToggleCapa(capa.id)}
                          size="xs"
                        />
                        <Text size="sm" style={{ flex: 1 }}>{capa.nombre}</Text>
                      </Group>
                      <Group gap={4}>
                        <ActionIcon
                          variant="subtle"
                          color="blue"
                          size="sm"
                          onClick={() => handleEditarCapa(capa.id)}
                        >
                          <IconEdit size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          onClick={() => handleEliminarCapa(capa.id)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </Paper>

            <Paper shadow="xs" p="md">
              <Title order={4} mb="md">Controles</Title>
              <Stack gap="xs">
                <Select
                  label="Visualización"
                  value={mapControls.visualizationType}
                  onChange={(value) => handleMapControlChange({ visualizationType: value as MapControls['visualizationType'] })}
                  data={[
                    { value: 'standard', label: 'Estándar' },
                    { value: 'satellite', label: 'Satélite' },
                    { value: 'toner', label: 'Toner' }
                  ]}
                />
                <Switch
                  label="Mostrar lectores del caso"
                  checked={mapControls.showCaseReaders}
                  onChange={(event) => handleMapControlChange({ showCaseReaders: event.currentTarget.checked })}
                />
                <Switch
                  label="Mostrar todos los lectores"
                  checked={mapControls.showAllReaders}
                  onChange={(event) => handleMapControlChange({ showAllReaders: event.currentTarget.checked })}
                />
                <Switch
                  label="Mostrar coincidencias"
                  checked={mapControls.showCoincidencias}
                  onChange={(event) => handleMapControlChange({ showCoincidencias: event.currentTarget.checked })}
                />
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>

        {/* Mapa en el centro */}
        <Grid.Col span={6} style={{ padding: 0 }}>
          <MapComponent />
        </Grid.Col>

        {/* Panel de lecturas a la derecha */}
        <Grid.Col span={3} style={{ padding: '16px', borderLeft: '1px solid #eee' }}>
          <Paper shadow="xs" p="md" style={{ height: '100%' }}>
            <Title order={4} mb="md">Lecturas</Title>
            <ScrollArea style={{ height: 'calc(12 * 80px)' }}> {/* Altura fija para 12 lecturas (80px por lectura) */}
              <Stack gap="xs">
                {resultadosFiltro.lecturas
                  .filter(lectura => lectura.Tipo_Fuente !== 'GPS')
                  .sort((a, b) => new Date(b.Fecha_y_Hora).getTime() - new Date(a.Fecha_y_Hora).getTime())
                  .map((lectura) => (
                    <Paper
                      key={lectura.ID_Lectura}
                      p="xs"
                      withBorder
                      style={{
                        cursor: 'pointer',
                        backgroundColor: selectedLectura?.ID_Lectura === lectura.ID_Lectura ? 'var(--mantine-color-blue-1)' : undefined,
                        borderLeft: selectedLectura?.ID_Lectura === lectura.ID_Lectura ? '4px solid var(--mantine-color-blue-6)' : undefined,
                        height: '80px', // Altura fija para cada lectura
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center'
                      }}
                      onClick={() => centerMapOnLectura(lectura)}
                    >
                      <Stack gap={4}>
                        <Group justify="space-between">
                          <Text size="sm" fw={500}>{lectura.Matricula}</Text>
                          <Text size="xs" c="dimmed">{dayjs(lectura.Fecha_y_Hora).format('HH:mm:ss')}</Text>
                        </Group>
                        <Group gap="xs">
                          <IconMapPin size={14} style={{ color: 'gray' }} />
                          <Text size="xs" c="dimmed">
                            {lectura.ID_Lector || 'Sin lector'}
                          </Text>
                        </Group>
                        {lectura.Velocidad && (
                          <Group gap="xs">
                            <IconGauge size={14} style={{ color: 'gray' }} />
                            <Text size="xs" c="dimmed">
                              {lectura.Velocidad.toFixed(1)} km/h
                            </Text>
                          </Group>
                        )}
                      </Stack>
                    </Paper>
                  ))}
              </Stack>
            </ScrollArea>
          </Paper>
        </Grid.Col>
      </Grid>

      {/* Modal de edición de capa */}
      <Modal
        opened={!!editandoCapa}
        onClose={() => setEditandoCapa(null)}
        title="Editar Capa"
        size="md"
      >
        {editandoCapa && (
          <Stack gap="md">
            <TextInput
              label="Nombre"
              value={editandoCapa.nombre}
              onChange={(event) => setEditandoCapa({ ...editandoCapa, nombre: event.currentTarget.value })}
            />
            <ColorInput
              label="Color"
              value={editandoCapa.color}
              onChange={(value) => setEditandoCapa({ ...editandoCapa, color: value })}
            />
            <Group justify="flex-end">
              <Button variant="light" onClick={() => setEditandoCapa(null)}>Cancelar</Button>
              <Button onClick={handleActualizarCapa}>Guardar</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Box>
  );
};

export default MapPanel; 