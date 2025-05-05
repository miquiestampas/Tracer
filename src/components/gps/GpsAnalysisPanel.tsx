import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Box, Text, Paper, Stack, Group, Button, TextInput, NumberInput, Select, Switch, ActionIcon, ColorInput, Collapse, Alert, Title, Divider, Tooltip, Modal, Textarea, ColorSwatch, SimpleGrid, Card, Badge } from '@mantine/core';
import { IconPlus, IconTrash, IconEdit, IconInfoCircle, IconMaximize, IconMinimize, IconCar, IconCheck, IconX, IconListDetails, IconSearch, IconHome, IconStar, IconFlag, IconUser, IconMapPin, IconBuilding, IconBriefcase, IconAlertCircle, IconClock, IconGauge, IconCompass, IconMountain, IconRuler, IconChevronDown, IconChevronUp, IconZoomIn } from '@tabler/icons-react';
import type { GpsLectura, GpsCapa, LocalizacionInteres } from '../../types/data';
import apiClient from '../../services/api';
import dayjs from 'dayjs';
import { useHotkeys } from '@mantine/hooks';
import { getLecturasGps, getParadasGps, getCoincidenciasGps, getGpsCapas, createGpsCapa, updateGpsCapa, deleteGpsCapa, getLocalizacionesInteres, createLocalizacionInteres, updateLocalizacionInteres, deleteLocalizacionInteres } from '../../services/gpsApi';
import ReactDOMServer from 'react-dom/server';
import GpsMapStandalone from './GpsMapStandalone';

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
    showPoints: true,
    optimizePoints: false
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
            - Capas personalizables para comparar diferentes análisis<br />
            - Navegación cronológica entre puntos usando los botones "Anterior" y "Siguiente"<br /><br />
            <b>Consejos:</b><br />
            - Usa los filtros de velocidad para identificar comportamientos inusuales<br />
            - Las paradas prolongadas pueden indicar lugares de interés<br />
            - El mapa de calor ayuda a identificar patrones de movimiento<br />
            - Navega entre puntos cronológicamente para analizar el recorrido paso a paso<br />
          </Text>
        </Alert>
      </Collapse>

      <Collapse in={ayudaAbierta}>
        <Paper p="md" mt="md" withBorder>
          <Stack gap="sm">
            <Title order={4}>Ayuda - Navegación entre Puntos</Title>
            <Text size="sm">
              La navegación entre puntos te permite recorrer cronológicamente todos los puntos GPS de forma sencilla.
            </Text>
            <Text size="sm">
              <b>Para navegar entre puntos:</b>
            </Text>
            <Text size="sm" ml="md">
              1. Haz clic en cualquier punto del mapa para ver su información
            </Text>
            <Text size="sm" ml="md">
              2. En el banner de información que aparece, usa los botones:
            </Text>
            <Text size="sm" ml="lg">
              • "Anterior": Muestra el punto GPS anterior en el tiempo
            </Text>
            <Text size="sm" ml="lg">
              • "Siguiente": Muestra el punto GPS siguiente en el tiempo
            </Text>
            <Text size="sm">
              <b>Características:</b>
            </Text>
            <Text size="sm" ml="md">
              • La navegación es circular (al llegar al último punto, vuelve al primero)
            </Text>
            <Text size="sm" ml="md">
              • El mapa se centra automáticamente en el punto seleccionado
            </Text>
            <Text size="sm" ml="md">
              • Se mantiene el nivel de zoom actual durante la navegación
            </Text>
            <Text size="sm" ml="md">
              • Los botones solo aparecen cuando se visualiza un punto GPS (no una localización)
            </Text>
          </Stack>
        </Paper>
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
        <Paper withBorder style={{ height: 'calc(100vh - 263px)', minHeight: 400, width: '100%' }}>
          <GpsMapStandalone
            lecturas={lecturas}
            capas={capas}
            localizaciones={localizaciones}
            mapControls={mapControls}
            mostrarLocalizaciones={mostrarLocalizaciones}
            onGuardarLocalizacion={handleAbrirModalLocalizacion}
          />
        </Paper>

        {/* Panel derecho con Localizaciones y Capas */}
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
        </Stack>
      </div>
    </Box>
  );
};

export default GpsAnalysisPanel; 