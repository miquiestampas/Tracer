import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Box, Text, Paper, Stack, Group, Button, TextInput, NumberInput, Select, Switch, ActionIcon, ColorInput, Collapse, Alert, Title, Divider, Tooltip, Modal, Textarea, ColorSwatch, SimpleGrid, Card, Badge, Slider } from '@mantine/core';
import { IconPlus, IconTrash, IconEdit, IconInfoCircle, IconMaximize, IconMinimize, IconCar, IconCheck, IconX, IconListDetails, IconSearch, IconHome, IconStar, IconFlag, IconUser, IconMapPin, IconBuilding, IconBriefcase, IconAlertCircle, IconClock, IconGauge, IconCompass, IconMountain, IconRuler, IconChevronDown, IconChevronUp, IconZoomIn, IconRefresh, IconPlayerPlay, IconPlayerPause, IconPlayerStop, IconPlayerTrackNext, IconPlayerTrackPrev, IconPlayerSkipForward, IconPlayerSkipBack, IconCamera, IconDownload } from '@tabler/icons-react';
import type { GpsLectura, GpsCapa, LocalizacionInteres } from '../../types/data';
import apiClient from '../../services/api';
import dayjs from 'dayjs';
import { useHotkeys } from '@mantine/hooks';
import { getLecturasGps, getParadasGps, getCoincidenciasGps, getGpsCapas, createGpsCapa, updateGpsCapa, deleteGpsCapa, getLocalizacionesInteres, createLocalizacionInteres, updateLocalizacionInteres, deleteLocalizacionInteres } from '../../services/gpsApi';
import ReactDOMServer from 'react-dom/server';
import GpsMapStandalone from './GpsMapStandalone';
import html2canvas from 'html2canvas';
import { gpsCache } from '../../services/gpsCache';

// Estilos CSS en línea para el contenedor del mapa
const mapContainerStyle = {
  height: '100%',
  width: '100%',
  position: 'relative' as const,
  zIndex: 1
};

interface GpsAnalysisPanelProps {
  casoId: number;
  puntoSeleccionado?: GpsLectura | null;
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

// Extraer y memoizar el componente ModalLocalizacion
const ModalLocalizacion = React.memo(({ localizacionActual, setLocalizacionActual, setModalAbierto, setFormFocused, handleGuardarLocalizacion, handleEliminarLocalizacion, localizaciones }: {
  localizacionActual: Partial<LocalizacionInteres> | null;
  setLocalizacionActual: React.Dispatch<React.SetStateAction<Partial<LocalizacionInteres> | null>>;
  setModalAbierto: React.Dispatch<React.SetStateAction<boolean>>;
  setFormFocused: React.Dispatch<React.SetStateAction<boolean>>;
  handleGuardarLocalizacion: () => void;
  handleEliminarLocalizacion: () => void;
  localizaciones: LocalizacionInteres[];
}) => {
  if (!localizacionActual) return null;
  return (
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
  );
});

// Extraer y memoizar el componente LocalizacionItem
const LocalizacionItem = React.memo(({ loc, setLocalizacionActual, setModalAbierto, handleEliminarLocalizacion }: {
  loc: LocalizacionInteres;
  setLocalizacionActual: React.Dispatch<React.SetStateAction<Partial<LocalizacionInteres> | null>>;
  setModalAbierto: React.Dispatch<React.SetStateAction<boolean>>;
  handleEliminarLocalizacion: () => void;
}) => {
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
});

// Extraer y memoizar el componente CapaItem
const CapaItem = React.memo(({ capa, handleToggleCapa, handleEditarCapa, handleEliminarCapa }: {
  capa: CapaGps;
  handleToggleCapa: (id: number) => void;
  handleEditarCapa: (id: number) => void;
  handleEliminarCapa: (id: number) => void;
}) => {
  return (
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
  );
});

// Nuevo componente para el reproductor de recorrido
const RoutePlayer = React.memo(({ capas, onPlay, onPause, onStop, onSpeedChange, isPlaying, currentSpeed, currentIndex, onIndexChange, selectedLayerId, onLayerChange }: {
  capas: CapaGps[];
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSpeedChange: (speed: number) => void;
  isPlaying: boolean;
  currentSpeed: number;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  selectedLayerId: number | null;
  onLayerChange: (layerId: number | null) => void;
}) => {
  const selectedLayer = capas.find(c => c.id === selectedLayerId);
  const totalPoints = selectedLayer?.lecturas.length || 0;
  const currentPoint = selectedLayer?.lecturas[currentIndex];
  const progress = totalPoints > 0 ? ((currentIndex + 1) / totalPoints) * 100 : 0;

  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={2}>Reproductor de Recorrido</Title>
        </Group>
        <Select
          placeholder="Selecciona una capa"
          value={selectedLayerId?.toString() || null}
          onChange={(value) => {
            onLayerChange(value ? Number(value) : null);
            onIndexChange(0);
            onStop();
          }}
          data={capas.map(capa => ({
            value: capa.id.toString(),
            label: capa.nombre
          }))}
          clearable
          style={{ width: '100%' }}
        />

        {/* Barra de progreso */}
        <div 
          style={{ 
            position: 'relative', 
            height: 8, 
            backgroundColor: 'var(--mantine-color-gray-2)', 
            borderRadius: 4,
            cursor: selectedLayer ? 'pointer' : 'default',
            userSelect: 'none'
          }}
          onClick={(e) => {
            if (!selectedLayer) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = (x / rect.width) * 100;
            const newIndex = Math.min(
              Math.max(0, Math.floor((percentage / 100) * totalPoints)),
              totalPoints - 1
            );
            onIndexChange(newIndex);
          }}
          onMouseDown={(e) => {
            if (!selectedLayer) return;
            e.preventDefault();
            
            const updatePosition = (clientX: number) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = clientX - rect.left;
              const percentage = (x / rect.width) * 100;
              const newIndex = Math.min(
                Math.max(0, Math.floor((percentage / 100) * totalPoints)),
                totalPoints - 1
              );
              onIndexChange(newIndex);
            };

            // Actualizar inmediatamente en el primer clic
            updatePosition(e.clientX);

            const handleMouseMove = (moveEvent: MouseEvent) => {
              requestAnimationFrame(() => {
                updatePosition(moveEvent.clientX);
              });
            };

            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${progress}%`,
              backgroundColor: selectedLayer?.color || 'var(--mantine-color-blue-6)',
              borderRadius: 4
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: `${progress}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 16,
              height: 16,
              backgroundColor: 'white',
              border: `2px solid ${selectedLayer?.color || 'var(--mantine-color-blue-6)'}`,
              borderRadius: '50%',
              boxShadow: '0 0 4px rgba(0,0,0,0.2)',
              pointerEvents: 'none'
            }}
          />
        </div>

        {/* Información del punto actual */}
        {currentPoint && (
          <Group gap="xs">
            <IconClock size={16} style={{ color: 'var(--mantine-color-gray-6)' }} />
            <Text size="sm">{dayjs(currentPoint.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')}</Text>
            <IconGauge size={16} style={{ color: 'var(--mantine-color-gray-6)' }} />
            <Text size="sm">{currentPoint.Velocidad?.toFixed(1) || '0'} km/h</Text>
          </Group>
        )}

        {/* Controles de reproducción */}
        <Group justify="center" gap="xs">
          <ActionIcon
            variant="filled"
            color="#234be7"
            size="lg"
            onClick={() => onIndexChange(Math.max(0, currentIndex - 1))}
            disabled={!selectedLayer || currentIndex === 0}
            style={{ fontWeight: 700 }}
          >
            <IconPlayerSkipBack size={20} />
          </ActionIcon>
          <ActionIcon
            variant="outline"
            color="#234be7"
            size="lg"
            onClick={() => {
              const speeds = [0.25, 0.5, 1, 2, 4, 8, 10, 20];
              const currentIndex = speeds.indexOf(currentSpeed);
              if (currentIndex > 0) {
                onSpeedChange(speeds[currentIndex - 1]);
              }
            }}
            disabled={!selectedLayer || currentSpeed <= 0.25}
            style={{ fontWeight: 700 }}
          >
            <IconPlayerTrackPrev size={20} />
          </ActionIcon>
          {isPlaying ? (
            <ActionIcon
              variant="filled"
              color="#234be7"
              size="xl"
              onClick={onPause}
              disabled={!selectedLayer}
              style={{ fontWeight: 700 }}
            >
              <IconPlayerPause size={24} />
            </ActionIcon>
          ) : (
            <ActionIcon
              variant="filled"
              color="#234be7"
              size="xl"
              onClick={onPlay}
              disabled={!selectedLayer}
              style={{ fontWeight: 700 }}
            >
              <IconPlayerPlay size={24} />
            </ActionIcon>
          )}
          <ActionIcon
            variant="outline"
            color="#234be7"
            size="lg"
            onClick={() => {
              const speeds = [0.25, 0.5, 1, 2, 4, 8, 10, 20];
              const currentIndex = speeds.indexOf(currentSpeed);
              if (currentIndex < speeds.length - 1) {
                onSpeedChange(speeds[currentIndex + 1]);
              }
            }}
            disabled={!selectedLayer || currentSpeed >= 20}
            style={{ fontWeight: 700 }}
          >
            <IconPlayerTrackNext size={20} />
          </ActionIcon>
          <ActionIcon
            variant="filled"
            color="#234be7"
            size="lg"
            onClick={() => onIndexChange(Math.min(totalPoints - 1, currentIndex + 1))}
            disabled={!selectedLayer || currentIndex === totalPoints - 1}
            style={{ fontWeight: 700 }}
          >
            <IconPlayerSkipForward size={20} />
          </ActionIcon>
        </Group>

        {/* Control de velocidad */}
        <Group justify="center" gap="xs">
          <Text size="sm">Velocidad: {currentSpeed}x</Text>
        </Group>

        {selectedLayer && (
          <Text size="sm" c="dimmed" ta="center">
            {currentIndex + 1} / {totalPoints} puntos
          </Text>
        )}
      </Stack>
    </Paper>
  );
});

// Utility functions for KML and GPX export
const generateKML = (lecturas: GpsLectura[], nombre: string) => {
  const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${nombre}</name>
    <Style id="track">
      <LineStyle>
        <color>ff0000ff</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>${nombre}</name>
      <styleUrl>#track</styleUrl>
      <LineString>
        <coordinates>`;

  const coordinates = lecturas
    .filter(l => typeof l.Coordenada_X === 'number' && typeof l.Coordenada_Y === 'number' && !isNaN(l.Coordenada_X) && !isNaN(l.Coordenada_Y))
    .map(l => `${l.Coordenada_X},${l.Coordenada_Y},0`)
    .join('\n');

  const kmlFooter = `</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

  return kmlHeader + coordinates + kmlFooter;
};

const generateGPX = (lecturas: GpsLectura[], nombre: string) => {
  const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LPR Tracer GPS Export"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${nombre}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${nombre}</name>
    <trkseg>`;

  const trackpoints = lecturas
    .filter(l => typeof l.Coordenada_X === 'number' && typeof l.Coordenada_Y === 'number' && !isNaN(l.Coordenada_X) && !isNaN(l.Coordenada_Y))
    .map(l => `    <trkpt lat="${l.Coordenada_Y}" lon="${l.Coordenada_X}">
      <time>${l.Fecha_y_Hora}</time>
      ${l.Velocidad ? `<speed>${l.Velocidad}</speed>` : ''}
    </trkpt>`)
    .join('\n');

  const gpxFooter = `
    </trkseg>
  </trk>
</gpx>`;

  return gpxHeader + trackpoints + gpxFooter;
};

const downloadFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

const GpsAnalysisPanel: React.FC<GpsAnalysisPanelProps> = ({ casoId, puntoSeleccionado }) => {
  const mapRef = useRef<L.Map | null>(null);
  const [activeTab, setActiveTab] = useState('controles');
  // Estados principales
  const [lecturas, setLecturas] = useState<GpsLectura[]>([]);
  const [loading, setLoading] = useState(false);
  const [capas, setCapas] = useState<CapaGps[]>([]);
  const [nuevaCapa, setNuevaCapa] = useState<Partial<CapaGps>>({ nombre: '', color: '#228be6' });
  const [mostrarFormularioCapa, setMostrarFormularioCapa] = useState(false);
  const [fullscreenMap, setFullscreenMap] = useState(false);
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
    showHeatmap: true,
    showPoints: false,
    optimizePoints: false,
    enableClustering: false
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

  // Cambiar los siguientes estados a 'false' para que los paneles estén extendidos por defecto
  const [controlesColapsados, setControlesColapsados] = useState(false);
  const [localizacionesColapsadas, setLocalizacionesColapsadas] = useState(false);
  const [capasColapsadas, setCapasColapsadas] = useState(false);

  // Estados para el reproductor de recorrido
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(4);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedLayerForPlayback, setSelectedLayerForPlayback] = useState<number | null>(null);

  // Centro inicial del mapa (Madrid)
  const initialCenter: L.LatLngTuple = [40.416775, -3.703790];
  const [mapCenter, setMapCenter] = useState<L.LatLngTuple>(initialCenter);
  const [mapZoom, setMapZoom] = useState(10);

  // ---- EFECTO PARA CENTRAR EL MAPA CUANDO puntoSeleccionado CAMBIA ----
  // Necesitamos acceder al mapa dentro de un componente que sea hijo de MapContainer
  // por lo que crearemos un pequeño componente auxiliar.
  const MapEffect = () => {
    const map = useMap(); // Hook de react-leaflet para obtener la instancia del mapa

    useEffect(() => {
      if (puntoSeleccionado && map) {
        const lat = puntoSeleccionado.Coordenada_Y;
        const lng = puntoSeleccionado.Coordenada_X;
        if (typeof lat === 'number' && typeof lng === 'number') {
          console.log(`Centrando mapa en: Lat ${lat}, Lng ${lng}`);
          map.flyTo([lat, lng], 16); // Zoom a nivel 16, puedes ajustarlo
        }
      }
    }, [puntoSeleccionado, map]);

    return null; // Este componente no renderiza nada visible
  };

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
  const handleAbrirModalLocalizacion = (lectura: GpsLectura) => {
    if (!lectura) return;
    setLocalizacionesColapsadas(false);
    const existente = localizaciones.find(l => l.id_lectura === lectura.ID_Lectura);
    setLecturaSeleccionada(lectura);
    setLocalizacionActual(existente || {
      id_lectura: lectura.ID_Lectura,
      titulo: '',
      descripcion: '',
      fecha_hora: lectura.Fecha_y_Hora,
      icono: 'pin',
      color: '#228be6',
      coordenada_x: lectura.Coordenada_X,
      coordenada_y: lectura.Coordenada_Y,
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

  // Manejar la tecla Escape para salir de pantalla completa
  useHotkeys([
    ['Escape', () => fullscreenMap && setFullscreenMap(false)]
  ]);

  // Cargar matrículas únicas al montar o cambiar casoId
  useEffect(() => {
    if (!casoId) return;
    setLoadingVehiculos(true);
    apiClient.get(`/casos/${casoId}/matriculas_gps`).then(res => {
      const matriculas = res.data || [];
      setVehiculosDisponibles(matriculas.map((matricula: string) => ({ value: matricula, label: matricula })));
    }).catch(() => {
      setVehiculosDisponibles([]);
    }).finally(() => {
      setLoadingVehiculos(false);
    });
  }, [casoId]);

  // Eliminar la carga masiva de lecturas al inicio
  useEffect(() => {
    setLecturas([]);
  }, [casoId]);

  // Modificar handleFiltrar para que solo cargue lecturas cuando el usuario pulse el botón
  const handleFiltrar = useCallback(async () => {
    if (!vehiculoObjetivo) return;
    setLoading(true);
    try {
      const cacheKey = `${casoId}_${vehiculoObjetivo}_${JSON.stringify(filters)}`;
      const cachedData = gpsCache.getLecturas(casoId, cacheKey);
      if (cachedData) {
        setLecturas(cachedData);
        setLoading(false);
        return;
      }
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
      gpsCache.setLecturas(casoId, cacheKey, data);
    } catch (error) {
      console.error('Error al filtrar lecturas GPS:', error);
    } finally {
      setLoading(false);
    }
  }, [casoId, filters, vehiculoObjetivo]);

  // Función para manejar cambios en los filtros
  const handleFilterChange = useCallback((updates: Partial<typeof filters>) => {
    setFilters(prev => ({ ...prev, ...updates }));
  }, []);

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
      handleFiltrar();
    } else {
      setLecturas([]);
    }
  }, [handleFiltrar, vehiculoObjetivo]);

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

  // Centro y zoom inicial SOLO una vez al montar el componente
  const getInitialMap = () => {
    const primeraLectura = Array.isArray(lecturas) && lecturas.length > 0
      ? lecturas.find(l => typeof l.Coordenada_Y === 'number' && typeof l.Coordenada_X === 'number' && !isNaN(l.Coordenada_Y) && !isNaN(l.Coordenada_X))
      : null;
    if (primeraLectura) {
      return {
        center: [primeraLectura.Coordenada_Y, primeraLectura.Coordenada_X],
        zoom: 13
      };
    }
    return { center: [40.416775, -3.703790], zoom: 10 };
  };
  const mapInitialRef = useRef(getInitialMap());
  const [mapKey] = useState(() => Date.now());

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
      setLecturas([]);
      setNuevaCapa({ nombre: '', color: '#228be7' });
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

  // Efecto para manejar la reproducción
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    let lastUpdate = Date.now();
    let accumulatedTime = 0;

    if (isPlaying && selectedLayerForPlayback !== null) {
      const selectedLayer = capas.find(c => c.id === selectedLayerForPlayback);
      if (!selectedLayer) return;

      const interval = 16; // 60fps para suavizar la animación
      intervalId = setInterval(() => {
        const now = Date.now();
        const deltaTime = now - lastUpdate;
        lastUpdate = now;
        
        accumulatedTime += deltaTime;
        const pointInterval = 1000 / currentSpeed; // Intervalo en ms por punto

        if (accumulatedTime >= pointInterval) {
          setCurrentIndex(prev => {
            if (prev >= selectedLayer.lecturas.length - 1) {
              setIsPlaying(false);
              return prev;
            }
            return prev + 1;
          });
          accumulatedTime = 0;
        }
      }, interval);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPlaying, currentSpeed, selectedLayerForPlayback, capas]);

  // Función para centrar el mapa en el punto actual
  const centerMapOnCurrentPoint = useCallback(() => {
    if (selectedLayerForPlayback === null) return;
    const selectedLayer = capas.find(c => c.id === selectedLayerForPlayback);
    if (!selectedLayer || !selectedLayer.lecturas[currentIndex]) return;

    const currentPoint = selectedLayer.lecturas[currentIndex];
    if (mapRef.current && typeof currentPoint.Coordenada_Y === 'number' && typeof currentPoint.Coordenada_X === 'number') {
      mapRef.current.setView([currentPoint.Coordenada_Y, currentPoint.Coordenada_X], mapRef.current.getZoom());
    }
  }, [selectedLayerForPlayback, capas, currentIndex]);

  // Efecto para centrar el mapa cuando cambia el índice
  useEffect(() => {
    centerMapOnCurrentPoint();
  }, [currentIndex, centerMapOnCurrentPoint]);

  // Add useEffect to set filters.fechaInicio and filters.fechaFin when vehiculoObjetivo changes
  useEffect(() => {
    if (!vehiculoObjetivo || !casoId) return;
    (async () => {
      try {
        const data = await getLecturasGps(casoId, { matricula: vehiculoObjetivo });
        if (data && data.length > 0) {
          // Ordenar por fecha ascendente
          const sorted = [...data].sort((a, b) => new Date(a.Fecha_y_Hora).getTime() - new Date(b.Fecha_y_Hora).getTime());
          setFilters(prev => ({
            ...prev,
            fechaInicio: sorted[0].Fecha_y_Hora.slice(0, 10),
            fechaFin: sorted[sorted.length - 1].Fecha_y_Hora.slice(0, 10)
          }));
        }
      } catch (e) {
        // Si hay error, no modificar filtros
      }
    })();
  }, [vehiculoObjetivo, casoId]);

  const [heatmapMultiplier, setHeatmapMultiplier] = useState(1.65);

  useEffect(() => {
    if (!fullscreenMap) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreenMap(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenMap]);

  // --- Renderizado principal ---
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
        <div style={{ position: 'absolute', top: 12, right: 16, zIndex: 10001 }}>
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
              padding: 0,
              zIndex: 10001
            }}
            onClick={() => setFullscreenMap(false)}
            aria-label="Salir de pantalla completa"
          >
            <IconMinimize size={16} color="#234be7" />
          </ActionIcon>
        </div>
        <Paper withBorder style={{ height: '100vh', minHeight: 400, width: '100vw' }}>
          <GpsMapStandalone
            ref={mapRef}
            lecturas={lecturas}
            capas={capas}
            localizaciones={localizaciones}
            mapControls={mapControls}
            mostrarLocalizaciones={mostrarLocalizaciones}
            onGuardarLocalizacion={handleAbrirModalLocalizacion}
            playbackLayer={selectedLayerForPlayback !== null ? capas.find(c => c.id === selectedLayerForPlayback) || null : null}
            currentPlaybackIndex={currentIndex}
            fullscreenMap={fullscreenMap}
            puntoSeleccionado={puntoSeleccionado}
            heatmapMultiplier={heatmapMultiplier}
          />
        </Paper>
      </div>
    );
  }

  return (
    <Box>
      <Group justify="flex-end" mb="xs">
        <Button
          variant="outline"
          size="xs"
          color="blue"
          onClick={() => mapRef.current?.invalidateSize()}
          leftSection={<IconRefresh size={16} />}
          style={{
            backgroundColor: 'white',
            color: 'var(--mantine-color-blue-6)',
            border: '1px solid var(--mantine-color-blue-3)',
            fontWeight: 500,
            borderRadius: 8,
            paddingLeft: 14,
            paddingRight: 14,
            height: 32,
            boxShadow: 'none',
            fontSize: 15,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            minWidth: 0
          }}
        >
          Actualizar
        </Button>
      </Group>

      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr 420px', gap: '1rem', height: 'calc(100vh - 200px)' }}>
        {/* Panel de Filtros */}
        <Stack>
          <Paper p="md" withBorder>
            <Title order={3} mb="md">Mapa GPS</Title>
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
              {/* Mostrar siempre todos los campos de filtro */}
              <Stack gap="md">
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
                  label="Detección de Paradas"
                  value={filters.duracionParada || ''}
                  onChange={(value) => handleFilterChange({ duracionParada: value === '' ? null : Number(value) })}
                  min={0}
                />
                <Group grow mt="md">
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
              </Stack>
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

          {/* Controles del Mapa debe ir debajo */}
          <Paper p="md" withBorder>
            <Group justify="space-between" align="center" mb="md">
              <Title order={3} mb="md">Controles del Mapa</Title>
              <ActionIcon
                variant="subtle"
                onClick={() => setControlesColapsados((v) => !v)}
                aria-label={controlesColapsados ? 'Mostrar controles' : 'Ocultar controles'}
              >
                {controlesColapsados ? <IconChevronDown size={18} /> : <IconChevronUp size={18} />}
              </ActionIcon>
            </Group>
            <Collapse in={!controlesColapsados}>
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
                <Switch
                  label="Optimizar puntos (reduce densidad)"
                  checked={mapControls.optimizePoints}
                  onChange={(e) => setMapControls(prev => ({ ...prev, optimizePoints: e.currentTarget.checked }))}
                  description="Elimina puntos redundantes manteniendo los importantes"
                />
                <Switch
                  label="Agrupar puntos cercanos"
                  checked={mapControls.enableClustering}
                  onChange={(e) => setMapControls(prev => ({ ...prev, enableClustering: e.currentTarget.checked }))}
                  description="Agrupa puntos cercanos en clusters para mejor visualización"
                />
                <Text size="xs" mt={8} mb={-8} fw={500}>Intensidad Heatmap</Text>
                <Slider
                  min={1.25}
                  max={5}
                  step={0.01}
                  value={heatmapMultiplier}
                  onChange={setHeatmapMultiplier}
                  marks={[
                    { value: 1.25, label: '1.25' },
                    { value: 1.65, label: '1.65' },
                    { value: 3, label: '3' },
                    { value: 5, label: '5' }
                  ]}
                  style={{ marginTop: 12 }}
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
            </Collapse>
          </Paper>
        </Stack>

        {/* Mapa */}
        <div
          style={fullscreenMap ? {
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 1000,
            background: 'white',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.3)',
            transition: 'all 0.2s',
          } : {
            width: '100%',
            position: 'relative'
          }}
        >
          {/* Botones de cámara y pantalla completa alineados arriba a la derecha del mapa, pequeños */}
          <div style={{
            position: 'absolute',
            top: 12,
            right: 16,
            zIndex: 10000,
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
                padding: 0,
                zIndex: 10000
              }}
              onClick={async () => {
                const mapContainer = document.querySelector('.leaflet-container')?.parentElement;
                if (!mapContainer) return;
                const cameraBtn = document.getElementById('camera-capture-btn');
                if (cameraBtn) cameraBtn.style.visibility = 'hidden';
                await new Promise(r => setTimeout(r, 50));
                html2canvas(mapContainer, { useCORS: true, backgroundColor: null }).then(canvas => {
                  if (cameraBtn) cameraBtn.style.visibility = 'visible';
                  const link = document.createElement('a');
                  link.download = `captura-mapa-gps.png`;
                  link.href = canvas.toDataURL('image/png');
                  link.click();
                });
              }}
              id="camera-capture-btn"
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
                padding: 0,
                zIndex: 10001
              }}
              onClick={() => setFullscreenMap(f => !f)}
              aria-label="Pantalla completa del mapa"
            >
              <IconMaximize size={16} color="#234be7" />
            </ActionIcon>
          </div>
          <Paper withBorder style={{ height: 'calc(100vh - 263px)', minHeight: 400, width: '100%' }}>
            <GpsMapStandalone
              ref={mapRef}
              lecturas={lecturas}
              capas={capas}
              localizaciones={localizaciones}
              mapControls={mapControls}
              mostrarLocalizaciones={mostrarLocalizaciones}
              onGuardarLocalizacion={handleAbrirModalLocalizacion}
              playbackLayer={selectedLayerForPlayback !== null ? capas.find(c => c.id === selectedLayerForPlayback) || null : null}
              currentPlaybackIndex={currentIndex}
              fullscreenMap={fullscreenMap}
              puntoSeleccionado={puntoSeleccionado}
              heatmapMultiplier={heatmapMultiplier}
            />
          </Paper>
        </div>

        {/* Panel derecho con Localizaciones, Capas y Reproductor */}
        <Stack>
          {/* Panel de Localizaciones de Interés */}
          <Paper p="md" withBorder>
            <Group justify="space-between" align="center" mb="md">
              <Title order={3}>Localizaciones de Interés</Title>
              <ActionIcon
                variant="subtle"
                onClick={() => setLocalizacionesColapsadas((v) => !v)}
                aria-label={localizacionesColapsadas ? 'Mostrar localizaciones' : 'Ocultar localizaciones'}
              >
                {localizacionesColapsadas ? <IconChevronDown size={18} /> : <IconChevronUp size={18} />}
              </ActionIcon>
            </Group>
            <Collapse in={!localizacionesColapsadas}>
              <Group justify="flex-end" mb="md">
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
                  <ModalLocalizacion
                    localizacionActual={localizacionActual}
                    setLocalizacionActual={setLocalizacionActual}
                    setModalAbierto={setModalAbierto}
                    setFormFocused={setFormFocused}
                    handleGuardarLocalizacion={handleGuardarLocalizacion}
                    handleEliminarLocalizacion={handleEliminarLocalizacion}
                    localizaciones={localizaciones}
                  />
                )}
              </Collapse>
              <Stack gap="xs">
                {localizaciones.length === 0 && <Text size="sm" c="dimmed">No hay localizaciones guardadas.</Text>}
                {localizaciones.map(loc => (
                  <LocalizacionItem
                    key={loc.id_lectura}
                    loc={loc}
                    setLocalizacionActual={setLocalizacionActual}
                    setModalAbierto={setModalAbierto}
                    handleEliminarLocalizacion={handleEliminarLocalizacion}
                  />
                ))}
              </Stack>
            </Collapse>
          </Paper>

          {/* Gestión de Capas */}
          <Paper p="md" withBorder mt="md">
            <Group justify="space-between" align="center" mb="md">
              <Title order={3}>Gestión de Capas</Title>
              <ActionIcon
                variant="subtle"
                onClick={() => setCapasColapsadas((v) => !v)}
                aria-label={capasColapsadas ? 'Mostrar capas' : 'Ocultar capas'}
              >
                {capasColapsadas ? <IconChevronDown size={18} /> : <IconChevronUp size={18} />}
              </ActionIcon>
            </Group>
            <Collapse in={!capasColapsadas}>
              <Stack gap="xs">
                {capas.map(capa => (
                  <CapaItem
                    key={capa.id}
                    capa={capa}
                    handleToggleCapa={handleToggleCapa}
                    handleEditarCapa={handleEditarCapa}
                    handleEliminarCapa={handleEliminarCapa}
                  />
                ))}
                {capas.length === 0 && (
                  <Text size="sm" c="dimmed" ta="center" py="md">No hay capas creadas. Aplica un filtro y guárdalo en una capa.</Text>
                )}
              </Stack>
            </Collapse>
          </Paper>

          {/* Reproductor de Recorrido */}
          <RoutePlayer
            capas={capas}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onStop={() => {
              setIsPlaying(false);
              setCurrentIndex(0);
            }}
            onSpeedChange={setCurrentSpeed}
            isPlaying={isPlaying}
            currentSpeed={currentSpeed}
            currentIndex={currentIndex}
            onIndexChange={setCurrentIndex}
            selectedLayerId={selectedLayerForPlayback}
            onLayerChange={setSelectedLayerForPlayback}
          />

          {/* Always render the export buttons below RoutePlayer, but disable them if lecturas.length === 0 */}
          <Group justify="center" mt="md">
            <Button
              leftSection={<IconDownload size={18} />}
              color="blue"
              variant="filled"
              style={{ minWidth: 120, fontWeight: 600 }}
              onClick={() => {
                const kml = generateKML(lecturas, `GPS_Track_${new Date().toISOString().split('T')[0]}`);
                downloadFile(kml, `gps_track_${new Date().toISOString().split('T')[0]}.kml`);
              }}
              disabled={lecturas.length === 0}
            >
              Exportar KML
            </Button>
            <Button
              leftSection={<IconDownload size={18} />}
              color="blue"
              variant="light"
              style={{ minWidth: 120, fontWeight: 600 }}
              onClick={() => {
                const gpx = generateGPX(lecturas, `GPS_Track_${new Date().toISOString().split('T')[0]}`);
                downloadFile(gpx, `gps_track_${new Date().toISOString().split('T')[0]}.gpx`);
              }}
              disabled={lecturas.length === 0}
            >
              Exportar GPX
            </Button>
          </Group>
        </Stack>
      </div>
    </Box>
  );
};

export default GpsAnalysisPanel; 