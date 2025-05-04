import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Box, Text, Paper, Stack, Group, Button, TextInput, NumberInput, Select, Switch, ActionIcon, ColorInput, Collapse, Alert, Title, Divider, Tooltip, Modal, Textarea, ColorSwatch, SimpleGrid, Card, Badge } from '@mantine/core';
import { IconPlus, IconTrash, IconEdit, IconInfoCircle, IconMaximize, IconMinimize, IconCar, IconCheck, IconX, IconListDetails, IconSearch, IconHome, IconStar, IconFlag, IconUser, IconMapPin, IconBuilding, IconBriefcase, IconAlertCircle, IconClock, IconGauge, IconCompass, IconMountain, IconRuler } from '@tabler/icons-react';
import type { GpsLectura, GpsCapa, LocalizacionInteres } from '../../types/data';
import apiClient from '../../services/api';
import dayjs from 'dayjs';
import { useHotkeys } from '@mantine/hooks';
import { getLecturasGps, getParadasGps, getCoincidenciasGps, getGpsCapas, createGpsCapa, updateGpsCapa, deleteGpsCapa, getLocalizacionesInteres, createLocalizacionInteres, updateLocalizacionInteres, deleteLocalizacionInteres } from '../../services/gpsApi';
import ReactDOMServer from 'react-dom/server';

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
  id: number;
  nombre: string;
  color: string;
  activa: boolean;
  lecturas: GpsLectura[];
  filtros: any;
  descripcion?: string;
}

// Lista de iconos disponibles (puedes ampliarla)
const ICONOS = [
  { name: 'home', icon: IconHome },
  { name: 'star', icon: IconStar },
  { name: 'flag', icon: IconFlag },
  { name: 'user', icon: IconUser },
  { name: 'pin', icon: IconMapPin },
  { name: 'building', icon: IconBuilding },
  { name: 'briefcase', icon: IconBriefcase },
  { name: 'alert', icon: IconAlertCircle },
];

const GpsAnalysisPanel: React.FC<GpsAnalysisPanelProps> = ({ casoId }) => {
  // Estados principales
  const [lecturas, setLecturas] = useState<GpsLectura[]>([]);
  const [loading, setLoading] = useState(false);
  const [capas, setCapas] = useState<CapaGps[]>([]);
  const [nuevaCapa, setNuevaCapa] = useState<Partial<CapaGps>>({ nombre: '', color: '#228be6' });
  const [mostrarFormularioCapa, setMostrarFormularioCapa] = useState(false);
  const [fullscreenMap, setFullscreenMap] = useState(false);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const [editandoCapa, setEditandoCapa] = useState<number | null>(null);
  const [mostrarLocalizaciones, setMostrarLocalizaciones] = useState(true);
  const [lecturaSeleccionada, setLecturaSeleccionada] = useState<GpsLectura | null>(null);

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

  // Estado y funciones de localizaciones de interés (persistentes)
  const [localizaciones, setLocalizaciones] = useState<LocalizacionInteres[]>([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [localizacionActual, setLocalizacionActual] = useState<Partial<LocalizacionInteres> | null>(null);
  const [guardandoLocalizacion, setGuardandoLocalizacion] = useState(false);

  // Estado para controlar el foco en el formulario de localización
  const [formFocused, setFormFocused] = useState(false);

  // Cargar localizaciones de interés al montar o cambiar casoId
  useEffect(() => {
    if (!casoId) return;
    (async () => {
      try {
        const locs = await getLocalizacionesInteres(casoId);
        setLocalizaciones(locs);
      } catch (error) {
        setLocalizaciones([]);
      }
    })();
  }, [casoId]);

  // Adaptar handleClickPunto para usar el modelo persistente
  const handleClickPunto = (lectura: GpsLectura) => {
    setLecturaSeleccionada(lectura);
  };

  // Añadir función para abrir el modal de localización
  const handleAbrirModalLocalizacion = () => {
    if (!lecturaSeleccionada) return;
    
    const existente = localizaciones.find(l => l.id_lectura === lecturaSeleccionada.ID_Lectura);
    setLocalizacionActual(existente || {
      id_lectura: lecturaSeleccionada.ID_Lectura,
      titulo: '',
      descripcion: '',
      fecha_hora: lecturaSeleccionada.Fecha_y_Hora,
      icono: 'pin',
      color: '#228be6',
      coordenada_x: lecturaSeleccionada.Coordenada_X,
      coordenada_y: lecturaSeleccionada.Coordenada_Y,
    });
    setModalAbierto(true);
  };

  // Guardar o actualizar localización (persistente)
  const handleGuardarLocalizacion = async () => {
    if (!localizacionActual) return;
    setGuardandoLocalizacion(true);
    try {
      if ('id' in localizacionActual && localizacionActual.id) {
        // Actualizar
        const updated = await updateLocalizacionInteres(casoId, localizacionActual.id, localizacionActual);
        setLocalizaciones(prev => prev.map(l => l.id === updated.id ? updated : l));
      } else {
        // Crear
        const created = await createLocalizacionInteres(casoId, localizacionActual as Omit<LocalizacionInteres, 'id' | 'caso_id'>);
        setLocalizaciones(prev => [...prev, created]);
      }
      setModalAbierto(false);
    } catch (e) {
      // Manejar error
    } finally {
      setGuardandoLocalizacion(false);
    }
  };

  // Eliminar localización (persistente)
  const handleEliminarLocalizacion = async () => {
    if (!localizacionActual || !('id' in localizacionActual) || !localizacionActual.id) return;
    try {
      await deleteLocalizacionInteres(casoId, localizacionActual.id);
      setLocalizaciones(prev => prev.filter(l => l.id !== localizacionActual.id));
      setModalAbierto(false);
    } catch (e) {
      // Manejar error
    }
  };

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

  // Cargar capas GPS al montar el componente o cambiar casoId
  useEffect(() => {
    if (!casoId) return;
    (async () => {
      try {
        const capasBD = await getGpsCapas(casoId);
        setCapas(capasBD.map(c => ({ ...c, descripcion: c.descripcion || '' })));
      } catch (error) {
        setCapas([]);
      }
    })();
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
    setLecturas([]); // Solo borra los puntos temporales
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
    setVehiculoObjetivo(null); // Opcional: limpiar selección de vehículo
  };

  const blueCircleIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background: #228be6; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  });

  // Componente del mapa
  const MapComponent: React.FC<{ isFullscreen?: boolean, onClickPunto: (lectura: GpsLectura) => void, mostrarLocalizaciones: boolean, localizaciones: LocalizacionInteres[], modalAbierto?: boolean }> = ({ isFullscreen = false, onClickPunto, mostrarLocalizaciones, localizaciones, modalAbierto = false }) => {
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
            .gps-popup, .leaflet-popup-content {
              min-height: 350px !important;
              height: 350px !important;
              max-height: 350px !important;
              overflow: hidden !important;
              min-width: 364px !important;
              width: 364px !important;
              max-width: 364px !important;
            }
          `}
        </style>
        <MapContainer 
          key={lecturasParaMapa.length}
          center={centroInicial} 
          zoom={zoomInicial} 
          scrollWheelZoom={true}
          keyboard={!formFocused}
          style={{ 
            ...mapContainerStyle,
            height: isFullscreen ? '100vh' : '100%',
          }}
        >
          <TileLayer
            attribution={tileLayerAttribution}
            url={tileLayerUrl}
          />
          {/* Renderizar puntos básicos (azules), excepto los que tienen localización personalizada */}
          {lecturasParaMapa.filter(lectura => !localizaciones.some(loc => loc.id_lectura === lectura.ID_Lectura)).map((lectura, idx) => (
            <Marker 
              key={lectura.ID_Lectura + '-' + idx}
              position={[lectura.Coordenada_Y, lectura.Coordenada_X]}
              icon={blueCircleIcon}
              eventHandlers={{
                click: () => onClickPunto(lectura)
              }}
            >
              <Popup className="gps-popup" maxWidth={364}>
                <div style={{ width: 364, minHeight: 350, height: 350, overflow: 'hidden' }}>
                  <Card shadow="sm" padding="md" radius="md" withBorder style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                    <Card.Section withBorder inheritPadding py="sm">
                      <Group justify="space-between" style={{ minWidth: 0, width: '100%' }}>
                        <Text fw={700} size="sm" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Lectura GPS
                        </Text>
                        <Tooltip label={lectura.Matricula} withArrow>
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
                            {lectura.Matricula}
                          </Badge>
                        </Tooltip>
                      </Group>
                    </Card.Section>

                    {/* Datos GPS en filas flexibles */}
                    <div style={{ width: '100%', marginTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}><IconClock size={14} style={{ color: 'gray' }} /></span>
                        <span style={{ fontSize: 13, color: '#666', wordBreak: 'break-word' }}>{dayjs(lectura.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}><IconGauge size={14} style={{ color: 'gray' }} /></span>
                        <span style={{ fontSize: 13, wordBreak: 'break-word' }}><b>Velocidad:</b> {typeof lectura.Velocidad === 'number' && !isNaN(lectura.Velocidad) ? lectura.Velocidad.toFixed(1) : '?'} km/h</span>
                      </div>
                      {typeof lectura.duracion_parada_min === 'number' && !isNaN(lectura.duracion_parada_min) && (
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}><IconClock size={14} style={{ color: 'blue' }} /></span>
                          <span style={{ fontSize: 13, color: '#228be6', wordBreak: 'break-word' }}><b>Duración parada:</b> {lectura.duracion_parada_min.toFixed(1)} min</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}><IconCompass size={14} style={{ color: 'gray' }} /></span>
                        <span style={{ fontSize: 13, wordBreak: 'break-word' }}><b>Dirección:</b> {typeof lectura.Direccion === 'number' && !isNaN(lectura.Direccion) ? lectura.Direccion.toFixed(1) : '?'}°</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}><IconMapPin size={14} style={{ color: 'gray' }} /></span>
                        <span style={{ fontSize: 13, wordBreak: 'break-word' }}><b>Coords:</b> {typeof lectura.Coordenada_Y === 'number' && !isNaN(lectura.Coordenada_Y) ? lectura.Coordenada_Y.toFixed(5) : '?'}, {typeof lectura.Coordenada_X === 'number' && !isNaN(lectura.Coordenada_X) ? lectura.Coordenada_X.toFixed(5) : '?'}</span>
                      </div>
                    </div>

                    <Button 
                      size="xs" 
                      variant="light" 
                      color="blue" 
                      fullWidth
                      mt="xs"
                      leftSection={<IconMapPin size={12} />}
                      onClick={() => {
                        setLecturaSeleccionada(lectura);
                        handleAbrirModalLocalizacion();
                      }}
                    >
                      Guardar Localización
                    </Button>
                  </Card>
                </div>
              </Popup>
            </Marker>
          ))}
          {/* Renderizar puntos personalizados si el toggle está activo */}
          {mostrarLocalizaciones && localizaciones.map((loc, idx) => {
            const Icon = ICONOS.find(i => i.name === loc.icono)?.icon || IconMapPin;
            const svgIcon = ReactDOMServer.renderToStaticMarkup(
              <Icon size={22} color={loc.color} stroke={2} />
            );
            return (
              <Marker
                key={loc.id_lectura + '-' + idx}
                position={[
                  typeof loc.coordenada_y === 'number' && !isNaN(loc.coordenada_y) ? loc.coordenada_y : 0,
                  typeof loc.coordenada_x === 'number' && !isNaN(loc.coordenada_x) ? loc.coordenada_x : 0
                ]}
                icon={L.divIcon({
                  className: 'custom-div-icon',
                  html: `<div style="display: flex; flex-direction: column; align-items: center;">
                    <div style="position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
                      <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background-color: ${loc.color}20; border: 2px solid ${loc.color}40;"></div>
                      <div style="position: relative; color: ${loc.color}; font-size: 22px; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;">
                        ${svgIcon}
                      </div>
                    </div>
                    ${loc.titulo ? `<span style='background: white; color: black; font-size: 11px; border-radius: 3px; padding: 0 2px; margin-top: 2px;'>${loc.titulo}</span>` : ''}
                  </div>`
                })}
                eventHandlers={{
                  click: () => onClickPunto({
                    ID_Lectura: loc.id_lectura ?? 0,
                    Matricula: '',
                    Fecha_y_Hora: loc.fecha_hora,
                    Coordenada_X: loc.coordenada_x,
                    Coordenada_Y: loc.coordenada_y,
                    Velocidad: 0,
                    Direccion: 0,
                    Altitud: 0,
                    Precisión: 0,
                    ID_Archivo: 0,
                    duracion_parada_min: undefined
                  })
                }}
              />
            );
          })}
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

        {/* Overlay para bloquear interacción con el mapa cuando el modal está abierto */}
        {modalAbierto && (
          <div
            style={{
              position: 'absolute',
              zIndex: 2000,
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'transparent',
              pointerEvents: 'all',
            }}
          />
        )}
      </div>
    );
  };

  // Guardar resultados actuales en una nueva capa (persistente)
  const [errorGuardarCapa, setErrorGuardarCapa] = useState<string | null>(null);
  const [guardandoCapa, setGuardandoCapa] = useState(false);
  const handleGuardarResultadosEnCapa = async () => {
    setErrorGuardarCapa(null);
    if (!nuevaCapa.nombre) return;
    setGuardandoCapa(true);
    const nuevaCapaCompleta: Omit<CapaGps, 'id' | 'caso_id'> = {
      nombre: nuevaCapa.nombre!,
      color: nuevaCapa.color || '#228be6',
      activa: true,
      lecturas: lecturas,
      filtros: { ...filters },
      descripcion: nuevaCapa.descripcion || ''
    };
    try {
      const capaGuardada = await createGpsCapa(casoId, nuevaCapaCompleta);
      setCapas(prev => [...prev, { ...capaGuardada, descripcion: capaGuardada.descripcion || '' }]);
      setNuevaCapa({ nombre: '', color: '#228be6' });
      setMostrarFormularioCapa(false);
      setEditandoCapa(null);
    } catch (e: any) {
      setErrorGuardarCapa(e?.message || 'Error al guardar la capa');
    } finally {
      setGuardandoCapa(false);
    }
  };

  const handleEditarCapa = (id: number) => {
    const capa = capas.find(c => c.id === id);
    if (!capa) return;
    setNuevaCapa({ nombre: capa.nombre, color: capa.color, descripcion: capa.descripcion });
    setEditandoCapa(id);
    setMostrarFormularioCapa(true);
  };

  const handleActualizarCapa = async () => {
    if (editandoCapa === null || !nuevaCapa.nombre) return;
    const capaActual = capas.find(c => c.id === editandoCapa);
    if (!capaActual) return;
    const capaCompleta = {
      ...capaActual,
      nombre: nuevaCapa.nombre!,
      color: nuevaCapa.color || '#228be6',
      descripcion: nuevaCapa.descripcion || '',
    };
    try {
      const capaActualizada = await updateGpsCapa(casoId, editandoCapa, capaCompleta);
      setCapas(prev => prev.map(capa =>
        capa.id === editandoCapa ? { ...capa, ...capaActualizada, descripcion: capaActualizada.descripcion || '' } : capa
      ));
    } catch (e) {}
    setNuevaCapa({ nombre: '', color: '#228be6' });
    setEditandoCapa(null);
    setMostrarFormularioCapa(false);
  };

  const handleToggleCapa = async (id: number) => {
    const capa = capas.find(c => c.id === id);
    if (!capa) return;
    const capaCompleta = { ...capa, activa: !capa.activa };
    try {
      const capaActualizada = await updateGpsCapa(casoId, id, capaCompleta);
      setCapas(prev => prev.map(c => c.id === id ? { ...c, activa: capaActualizada.activa } : c));
    } catch (e) {}
  };

  const handleEliminarCapa = async (id: number) => {
    try {
      await deleteGpsCapa(casoId, id);
      setCapas(prev => prev.filter(capa => capa.id !== id));
    } catch (e) {}
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
        <MapComponent isFullscreen={true} onClickPunto={handleClickPunto} mostrarLocalizaciones={mostrarLocalizaciones} localizaciones={localizaciones} modalAbierto={modalAbierto} />
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

      <Collapse in={ayudaAbierta}>
        <Paper p="md" mt="md" withBorder>
          <Stack gap="sm">
            <Title order={4}>Ayuda - Localizaciones de Interés</Title>
            <Text size="sm">
              Las localizaciones de interés te permiten marcar puntos específicos en el mapa para su posterior análisis.
            </Text>
            <Text size="sm">
              <b>Para crear una localización:</b>
            </Text>
            <Text size="sm" ml="md">
              1. Haz clic en cualquier punto del mapa para ver su información
            </Text>
            <Text size="sm" ml="md">
              2. En el popup que aparece, haz clic en "Guardar Localización"
            </Text>
            <Text size="sm" ml="md">
              3. Completa los datos en el modal:
            </Text>
            <Text size="sm" ml="lg">
              • Título: Nombre descriptivo de la localización
            </Text>
            <Text size="sm" ml="lg">
              • Descripción: Detalles adicionales sobre el punto
            </Text>
            <Text size="sm" ml="lg">
              • Icono: Selecciona un icono que represente la localización
            </Text>
            <Text size="sm" ml="lg">
              • Color: Elige un color distintivo para el icono
            </Text>
            <Text size="sm">
              <b>Para editar o eliminar una localización:</b>
            </Text>
            <Text size="sm" ml="md">
              1. Haz clic en la localización en el mapa
            </Text>
            <Text size="sm" ml="md">
              2. En el modal que aparece, modifica los datos o haz clic en "Eliminar"
            </Text>
            <Text size="sm">
              <b>Notas:</b>
            </Text>
            <Text size="sm" ml="md">
              • Las localizaciones se guardan automáticamente en la base de datos
            </Text>
            <Text size="sm" ml="md">
              • Puedes mostrar/ocultar las localizaciones usando el toggle en el panel
            </Text>
            <Text size="sm" ml="md">
              • Las localizaciones se pueden filtrar por fecha y hora
            </Text>
          </Stack>
        </Paper>
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
                      <TextInput
                        label="Descripción de la capa"
                        value={nuevaCapa.descripcion}
                        onChange={e => setNuevaCapa(prev => ({ ...prev, descripcion: e.target.value }))}
                        placeholder="Descripción de la capa"
                      />
                      <Group justify="flex-end">
                        <Button variant="light" color="gray" onClick={() => { setMostrarFormularioCapa(false); setEditandoCapa(null); }}><IconX size={16} style={{ marginRight: 8 }} />Cancelar</Button>
                        {editandoCapa !== null ? (
                          <Button onClick={handleActualizarCapa} disabled={!nuevaCapa.nombre}><IconCheck size={16} style={{ marginRight: 8 }} />Actualizar capa</Button>
                        ) : (
                          <Button onClick={handleGuardarResultadosEnCapa} loading={guardandoCapa} disabled={!nuevaCapa.nombre}><IconCheck size={16} style={{ marginRight: 8 }} />Guardar en capa</Button>
                        )}
                      </Group>
                      {errorGuardarCapa && <Alert color="red" mt="sm">{errorGuardarCapa}</Alert>}
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

          {/* Panel de Localizaciones de Interés (ahora encima y separado) */}
          <Paper p="md" withBorder mt="md">
            <Group justify="space-between" mb="md">
              <Title order={4}>Localizaciones de Interés</Title>
              <Switch
                checked={mostrarLocalizaciones}
                onChange={e => setMostrarLocalizaciones(e.currentTarget.checked)}
                label={mostrarLocalizaciones ? 'Mostrar' : 'Ocultar'}
                size="sm"
                color="#234be7"
              />
            </Group>
            <Collapse in={modalAbierto && !!localizacionActual}>
              {modalAbierto && localizacionActual && (
                <Paper p="md" withBorder mb="md" style={{ position: 'relative' }}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}
                    onClick={() => { setModalAbierto(false); setLocalizacionActual(null); }}
                    aria-label="Cerrar panel"
                  >
                    <IconX size={20} />
                  </ActionIcon>
                  <Stack gap="sm">
                    <Group align="center">
                      {(() => {
                        const Icon = ICONOS.find(i => i.name === localizacionActual.icono)?.icon || IconMapPin;
                        return <Icon size={32} color={typeof localizacionActual.color === 'string' ? localizacionActual.color : '#228be6'} />;
                      })()}
                      <TextInput
                        label="Título"
                        value={localizacionActual.titulo}
                        onChange={e => setLocalizacionActual(l => l ? { ...l, titulo: e.target.value } : l)}
                        style={{ flex: 1 }}
                        onFocus={() => setFormFocused(true)}
                        onBlur={() => setFormFocused(false)}
                      />
                    </Group>
                    <Textarea
                      label="Descripción"
                      value={localizacionActual.descripcion ?? ''}
                      onChange={e => setLocalizacionActual(l => l ? { ...l, descripcion: e.target.value } : l)}
                      onFocus={() => setFormFocused(true)}
                      onBlur={() => setFormFocused(false)}
                    />
                    <Text size="sm" c="dimmed">Fecha y hora: {dayjs(localizacionActual.fecha_hora).format('DD/MM/YYYY HH:mm:ss')}</Text>
                    <Group>
                      <Text size="sm">Icono:</Text>
                      <SimpleGrid cols={5} spacing={4}>
                        {ICONOS.map(({ name, icon: Icon }) => (
                          <ActionIcon
                            key={name}
                            variant={localizacionActual.icono === name ? 'filled' : 'light'}
                            color={localizacionActual.icono === name ? typeof localizacionActual.color === 'string' ? localizacionActual.color : '#228be6' : 'gray'}
                            onClick={() => setLocalizacionActual(l => l ? { ...l, icono: name } : l)}
                          >
                            <Icon size={20} />
                          </ActionIcon>
                        ))}
                      </SimpleGrid>
                      <ColorInput
                        label="Color"
                        value={typeof localizacionActual.color === 'string' ? localizacionActual.color : '#228be6'}
                        onChange={color => setLocalizacionActual(l => l ? { ...l, color } : l)}
                        format="hex"
                        style={{ width: 120 }}
                      />
                    </Group>
                    <Group justify="flex-end">
                      {localizaciones.some(l => l.id_lectura === localizacionActual.id_lectura) && (
                        <Button color="red" variant="light" onClick={handleEliminarLocalizacion}>Eliminar</Button>
                      )}
                      <Button variant="light" onClick={() => { setModalAbierto(false); setLocalizacionActual(null); }}>Cancelar</Button>
                      <Button onClick={handleGuardarLocalizacion} disabled={!localizacionActual.titulo}>Guardar</Button>
                    </Group>
                  </Stack>
                </Paper>
              )}
            </Collapse>
            <Stack gap="xs">
              {localizaciones.length === 0 && <Text size="sm" c="dimmed">No hay localizaciones guardadas.</Text>}
              {localizaciones.map(loc => {
                const Icon = ICONOS.find(i => i.name === loc.icono)?.icon || IconMapPin;
                return (
                  <Paper key={loc.id_lectura} p="xs" withBorder>
                    <Group justify="space-between">
                      <Group gap="xs">
                        <Icon size={18} color={loc.color} />
                        <Text size="sm" fw={600}>{loc.titulo}</Text>
                        <Text size="xs" c="dimmed">{dayjs(loc.fecha_hora).format('DD/MM/YYYY HH:mm')}</Text>
                      </Group>
                      <Group gap={4}>
                        <ActionIcon variant="subtle" color="blue" onClick={() => {
                          // Centrar mapa en la localización (puedes implementar esta lógica)
                        }}><IconMapPin size={16} /></ActionIcon>
                        <ActionIcon variant="subtle" color="gray" onClick={() => {
                          setLocalizacionActual(loc);
                          setModalAbierto(true);
                        }}><IconEdit size={16} /></ActionIcon>
                        <ActionIcon variant="subtle" color="red" onClick={() => {
                          setLocalizacionActual(loc);
                          handleEliminarLocalizacion();
                        }}><IconTrash size={16} /></ActionIcon>
                      </Group>
                    </Group>
                    {loc.descripcion && <Text size="xs" c="dimmed" mt={2}>{loc.descripcion}</Text>}
                  </Paper>
                );
              })}
            </Stack>
          </Paper>

          {/* Gestión de Capas debe ir aquí, después de Localizaciones */}
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
          <MapComponent onClickPunto={handleClickPunto} mostrarLocalizaciones={mostrarLocalizaciones} localizaciones={localizaciones} modalAbierto={modalAbierto} />
        </Paper>
      </div>
    </Box>
  );
};

export default GpsAnalysisPanel; 