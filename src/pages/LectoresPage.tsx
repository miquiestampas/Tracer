import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
    Box, Title, Table, Loader, Alert, Pagination, Select, Group, Text, ActionIcon, Tooltip, Button, Tabs, SimpleGrid, MultiSelect, Space, Checkbox, LoadingOverlay,
    Autocomplete, ScrollArea, Collapse, Divider, Paper, Stack, ColorSwatch, Modal, TextInput, ColorInput, Switch
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconEdit, IconTrash, IconCheck, IconMap, IconList, IconFileExport, IconUpload, IconSearch, IconX, IconListDetails, IconChevronDown, IconChevronUp, IconPlus, IconCamera } from '@tabler/icons-react';
import { getLectores, updateLector, getLectoresParaMapa, deleteLector, importarLectores, getLectorSugerencias } from '../services/lectoresApi';
import type { Lector, LectorUpdateData, LectorCoordenadas, LectorSugerenciasResponse } from '../types/data';
import EditLectorModal from '../components/modals/EditLectorModal';
import ImportarLectoresModal from '../components/modals/ImportarLectoresModal';
import { DataTable, type DataTableSortStatus } from 'mantine-datatable';
import _ from 'lodash';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import html2canvas from 'html2canvas';

// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Create custom icons
const fuchsiaPointIcon = L.divIcon({
  html: `<span style="background-color: fuchsia; width: 8px; height: 8px; border-radius: 50%; display: inline-block; border: 1px solid darkmagenta;"></span>`,
  className: 'custom-div-icon',
  iconSize: [8, 8],
  iconAnchor: [4, 4]
});

const activeLectorIcon = L.divIcon({
  html: `<span style="background-color: #011638; width: 24px; height: 24px; border-radius: 50%; display: inline-block; border: 3px solid #222; box-shadow: 0 0 0 4px rgba(1,22,56,0.15);"></span>`,
  className: 'custom-div-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

// Default marker icon
const defaultMarkerIcon = L.divIcon({
  html: `<span style="background-color: #011638; width: 16px; height: 16px; border-radius: 50%; display: inline-block; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></span>`,
  className: 'custom-div-icon',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

// *** NUEVO: Importar CSS de leaflet-draw aquí ***
import 'leaflet-draw/dist/leaflet.draw.css';
// *** FIN: Importar CSS ***

// *** NUEVO: Importar componente DrawControl ***
import DrawControl from '../components/map/DrawControl'; 
// *** FIN: Importar DrawControl ***

// Turf para análisis espacial
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint, polygon as turfPolygon } from '@turf/helpers';

// Función helper para obtener GeoJSON (CON EL TS-IGNORE)
function getShapeGeoJSONGeometry(layer: L.Layer | null): any | null {
  if (layer && (layer instanceof L.Polygon || layer instanceof L.Rectangle)) {
    try {
      // @ts-ignore 
      return layer.toGeoJSON().geometry;
    } catch (e) {
      console.error("Error al convertir la forma a GeoJSON:", e);
      return null;
    }
  }
  return null;
}

// --- Importar useLocation --- 
import { useLocation } from 'react-router-dom';

import BatchEditLectoresModal from '../components/modals/BatchEditLectoresModal';

import * as XLSX from 'xlsx';
import ExportarLectoresModal from '../components/modals/ExportarLectoresModal';

// --- Añadir componente InfoBanner al inicio del archivo ---
const InfoBanner = ({ open, onClose, children }) => (
  <Box
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      zIndex: 2001,
      transition: 'transform 0.3s cubic-bezier(.4,0,.2,1)',
      transform: open ? 'translateY(0)' : 'translateY(-120%)',
      pointerEvents: open ? 'auto' : 'none',
    }}
  >
    <Alert
      color="blue"
      withCloseButton
      onClose={onClose}
      style={{
        borderRadius: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        margin: 0,
        background: 'rgba(255,255,255,0.92)', // Fondo blanco con transparencia
        border: '1px solid #dde3f0',
      }}
    >
      <div style={{ marginLeft: 32 }}>
        {children}
      </div>
    </Alert>
  </Box>
);

// --- NUEVO: Definir las secciones/botones ---
const lectorSections = [
    { id: 'tabla', label: 'Tabla', icon: IconList, section: 'vista' },
    { id: 'mapa', label: 'Mapa', icon: IconMap, section: 'vista' },
];

// --- Panel de filtros para la pestaña Mapa ---
function FiltrosMapaLectoresPanel({
  provinciasUnicas,
  carreterasUnicas,
  organismosUnicos,
  lectorSearchSuggestions,
  filtroProvincia,
  setFiltroProvincia,
  filtroCarretera,
  setFiltroCarretera,
  filtroOrganismo,
  setFiltroOrganismo,
  filtroTextoLibre,
  setFiltroTextoLibre,
  filtroLocalidad,
  setFiltroLocalidad,
  localidadesUnicas,
  mapLoading
}) {
  const handleLimpiarFiltros = () => {
    setFiltroProvincia([]);
    setFiltroCarretera([]);
    setFiltroOrganismo([]);
    setFiltroTextoLibre('');
    setFiltroLocalidad([]);
  };

  return (
    <Paper p="md" shadow="xs" radius="md" mb="md" withBorder>
      <Group justify="space-between" mb="md">
        <Title order={4}>Filtros</Title>
        <Button
          variant="light"
          color="blue"
          size="xs"
          onClick={handleLimpiarFiltros}
          leftSection={<IconX size={14} />}
        >
          Limpiar Filtros
        </Button>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 1 }} spacing="xs">
        <MultiSelect
          label="Filtrar por Provincia"
          placeholder="Todas las provincias"
          data={provinciasUnicas}
          value={filtroProvincia}
          onChange={setFiltroProvincia}
          searchable clearable disabled={mapLoading}
        />
        <MultiSelect
          label="Filtrar por Localidad"
          placeholder="Todas las localidades"
          data={localidadesUnicas}
          value={filtroLocalidad}
          onChange={setFiltroLocalidad}
          searchable clearable disabled={mapLoading}
        />
        <MultiSelect
          label="Filtrar por Carretera"
          placeholder="Todas las carreteras"
          data={carreterasUnicas}
          value={filtroCarretera}
          onChange={setFiltroCarretera}
          searchable clearable disabled={mapLoading}
        />
        <MultiSelect
          label="Filtrar por Organismo"
          placeholder="Todos los organismos"
          data={organismosUnicos}
          value={filtroOrganismo}
          onChange={setFiltroOrganismo}
          searchable clearable disabled={mapLoading}
        />
        <Autocomplete
          label="Buscar por ID/Nombre"
          placeholder="Escribe para buscar..."
          data={lectorSearchSuggestions}
          value={filtroTextoLibre}
          onChange={setFiltroTextoLibre}
          limit={10}
          clearable
          disabled={mapLoading}
        />
      </SimpleGrid>
    </Paper>
  );
}

// --- Panel lateral de lectores filtrados para la pestaña Mapa ---
function LectoresFiltradosPanel({ lectores }) {
  return (
    <Paper p="md" shadow="xs" radius="md" withBorder style={{ height: 520, display: 'flex', flexDirection: 'column' }}>
      <Title order={4} pb={0}>Lectores Filtrados</Title>
      <ScrollArea h={440} style={{ flex: 1 }}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID Lector</Table.Th>
              <Table.Th>Nombre</Table.Th>
              <Table.Th>Carretera</Table.Th>
              <Table.Th>Provincia</Table.Th>
              <Table.Th>Organismo</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lectores.length > 0 ? (
              lectores.map((lector) => (
                <Table.Tr key={`list-${lector.ID_Lector}`}>
                  <Table.Td>{lector.ID_Lector}</Table.Td>
                  <Table.Td>{lector.Nombre || '-'}</Table.Td>
                  <Table.Td>{lector.Carretera || '-'}</Table.Td>
                  <Table.Td>{lector.Provincia || '-'}</Table.Td>
                  <Table.Td>{lector.Organismo_Regulador || '-'}</Table.Td>
                </Table.Tr>
              ))
            ) : (
              <Table.Tr><Table.Td colSpan={6}><Text c="dimmed" ta="center">No hay lectores que coincidan con los filtros actuales.</Text></Table.Td></Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
}

// Nueva interfaz para capas dinámicas
interface Capa {
  id: string;
  nombre: string;
  color: string;
  criterios: {
    provincia?: string[];
    carretera?: string[];
    organismo?: string[];
    localidad?: string[];
    texto?: string;
  };
  activa: boolean;
}

function LectoresPage() {
  const [lectores, setLectores] = useState<Lector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, totalCount: 0 });
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Lector>>({ columnAccessor: 'ID_Lector', direction: 'asc' });

  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editingLector, setEditingLector] = useState<Lector | null>(null);
  const [deletingLectorId, setDeletingLectorId] = useState<string | null>(null);

  const [selectedLectorIds, setSelectedLectorIds] = useState<string[]>([]);

  // --- Leer estado de la ubicación --- 
  const location = useLocation();
  const initialTabFromState = location.state?.initialTab;

  // --- Inicializar activeTab basado en el estado o default a 'tabla' --- 
  const [activeTab, setActiveTab] = useState<string | null>(initialTabFromState === 'mapa' ? 'mapa' : 'tabla');
  
  const [mapLectores, setMapLectores] = useState<LectorCoordenadas[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [filtroProvincia, setFiltroProvincia] = useState<string[]>([]);
  const [filtroCarretera, setFiltroCarretera] = useState<string[]>([]);
  const [filtroOrganismo, setFiltroOrganismo] = useState<string[]>([]);
  const [filtroTextoLibre, setFiltroTextoLibre] = useState<string>('');
  const [filtroLocalidad, setFiltroLocalidad] = useState<string[]>([]);

  const [importModalOpened, { open: openImportModal, close: closeImportModal }] = useDisclosure(false);

  // *** NUEVO: Estado para la forma dibujada ***
  const [drawnShape, setDrawnShape] = useState<L.Layer | null>(null);
  // *** FIN: Estado forma dibujada ***

  // *** Cambiar estado para controlar Collapse ***
  const [resultsListOpened, { toggle: toggleResultsList }] = useDisclosure(false);
  // *** Fin cambio estado ***

  const [batchEditModalOpened, { open: openBatchEditModal, close: closeBatchEditModal }] = useDisclosure(false);

  const [sugerencias, setSugerencias] = useState<LectorSugerenciasResponse>({ provincias: [], localidades: [], carreteras: [], organismos: [], contactos: [] });

  const [exportModalOpened, { open: openExportModal, close: closeExportModal }] = useDisclosure(false);

  // --- Añadir estado infoBanner ---
  const [infoBanner, setInfoBanner] = useState<LectorCoordenadas | null>(null);

  // Nuevos estados para capas
  const [capas, setCapas] = useState<Capa[]>([]);
  const [nuevaCapa, setNuevaCapa] = useState<Partial<Capa>>({ nombre: '', color: '#011638' });
  const [mostrarFormularioCapa, setMostrarFormularioCapa] = useState(false);
  const [editandoCapa, setEditandoCapa] = useState<Capa | null>(null);

  const mapRef = useRef<L.Map | null>(null);

  // Resetear filtros cuando se abre la pestaña del mapa
  useEffect(() => {
    if (activeTab === 'mapa') {
      setFiltroProvincia([]);
      setFiltroCarretera([]);
      setFiltroOrganismo([]);
      setFiltroTextoLibre('');
      setMapLectores(lectores.map(lector => ({
        ...lector,
        Coordenada_X: lector.Coordenada_X ?? 0,
        Coordenada_Y: lector.Coordenada_Y ?? 0
      })));
    }
  }, [activeTab, lectores]);

  // Función para cargar los lectores
  const fetchLectores = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        skip: (pagination.page - 1) * pagination.pageSize,
        limit: pagination.pageSize,
        ...(filtroTextoLibre && { texto_libre: filtroTextoLibre }),
        ...(filtroProvincia.length > 0 && { provincia: filtroProvincia[0] }),
        ...(filtroCarretera.length > 0 && { carretera: filtroCarretera[0] }),
        ...(filtroOrganismo.length > 0 && { organismo: filtroOrganismo[0] }),
        ...(filtroLocalidad.length > 0 && { localidad: filtroLocalidad[0] }),
        sort: sortStatus.columnAccessor,
        order: sortStatus.direction
      };
      const response = await getLectores(params);
      setLectores(response.lectores);
      setPagination(prev => ({ ...prev, totalCount: response.total_count }));
    } catch (err) {
      console.error('Error al cargar lectores:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar los lectores');
      notifications.show({
        title: 'Error',
        message: 'No se pudieron cargar los lectores. Por favor, intenta de nuevo.',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, filtroTextoLibre, filtroProvincia, filtroCarretera, filtroOrganismo, filtroLocalidad, sortStatus]);

  // Efecto para recargar cuando cambian los filtros
  useEffect(() => {
    if (activeTab === 'tabla') {
      fetchLectores();
    }
  }, [fetchLectores, activeTab]);

  // Efecto para recargar cuando cambia la ordenación
  useEffect(() => {
    if (activeTab === 'tabla') {
      setPagination(prev => ({ ...prev, page: 1 }));
      fetchLectores();
    }
  }, [sortStatus, fetchLectores, activeTab]);

  // Función para cargar datos del mapa
  const fetchMapData = useCallback(async () => {
    if (activeTab !== 'mapa') return;
    
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
  }, [activeTab]);

  // Efecto para cargar datos del mapa cuando se abre la pestaña
  useEffect(() => {
    if (activeTab === 'mapa') {
      fetchMapData();
    }
  }, [activeTab, fetchMapData]);

  // Resetear filtros cuando se abre la pestaña del mapa
  useEffect(() => {
    if (activeTab === 'mapa') {
      setFiltroProvincia([]);
      setFiltroCarretera([]);
      setFiltroOrganismo([]);
      setFiltroTextoLibre('');
    }
  }, [activeTab]);

  console.log("[MapFilters] Datos base mapLectores:", mapLectores);
  
  const provinciasUnicas = useMemo(() => {
    return sugerencias.provincias.sort();
  }, [sugerencias.provincias]);

  const carreterasUnicas = useMemo(() => {
    return sugerencias.carreteras.sort().map(carretera => ({ value: carretera, label: carretera }));
  }, [sugerencias.carreteras]);

  const organismosUnicos = useMemo(() => {
    return sugerencias.organismos.sort().map(organismo => ({ value: organismo, label: organismo }));
  }, [sugerencias.organismos]);

  const localidadesUnicas = useMemo(() => {
    return sugerencias.localidades.sort().map(localidad => ({ value: localidad, label: localidad }));
  }, [sugerencias.localidades]);

  const lectorSearchSuggestions = useMemo(() => {
    const suggestions = new Set<string>();
    [...lectores, ...mapLectores].forEach(lector => {
      if (lector.ID_Lector) suggestions.add(lector.ID_Lector);
      if (lector.Nombre) suggestions.add(lector.Nombre);
    });
    return Array.from(suggestions).sort();
  }, [lectores, mapLectores]);

  // Separar la lógica de filtrado y capas
  const lectoresFiltradosMapa = useMemo(() => {
    const textoBusquedaLower = filtroTextoLibre.toLowerCase().trim();
    const drawnPolygonGeoJSON = getShapeGeoJSONGeometry(drawnShape);

    // Aplicar solo los filtros normales
    return mapLectores.filter(lector => {
      const provinciaMatch = filtroProvincia.length === 0 || (lector.Provincia && filtroProvincia.includes(lector.Provincia));
      const carreteraMatch = filtroCarretera.length === 0 || (lector.Carretera && filtroCarretera.includes(lector.Carretera));
      const organismoMatch = filtroOrganismo.length === 0 || (lector.Organismo_Regulador && filtroOrganismo.includes(lector.Organismo_Regulador));
      const localidadMatch = filtroLocalidad.length === 0 || (lector.Localidad && filtroLocalidad.includes(lector.Localidad));
      const textoMatch = textoBusquedaLower === '' || 
                        (lector.ID_Lector && lector.ID_Lector.toLowerCase().includes(textoBusquedaLower)) ||
                        (lector.Nombre && lector.Nombre.toLowerCase().includes(textoBusquedaLower));

      // Filtro espacial
      let spatialMatch = true;
      if (drawnPolygonGeoJSON && lector.Coordenada_X != null && lector.Coordenada_Y != null) {
        try {
          const lectorPoint = turfPoint([lector.Coordenada_X, lector.Coordenada_Y]);
          spatialMatch = booleanPointInPolygon(lectorPoint, drawnPolygonGeoJSON);
        } catch (turfError) {
          console.error("Error en comprobación espacial con Turf.js:", turfError);
          spatialMatch = false;
        }
      }

      return provinciaMatch && carreteraMatch && organismoMatch && localidadMatch && textoMatch && spatialMatch;
    });
  }, [mapLectores, filtroProvincia, filtroCarretera, filtroOrganismo, filtroLocalidad, filtroTextoLibre, drawnShape]);
  
  // Callback cuando se dibuja una forma
  const handleShapeDrawn = useCallback((layer: L.Layer) => { 
      // @ts-ignore 
      console.log("Forma dibujada (GeoJSON):", layer.toGeoJSON()); 
      setDrawnShape(layer); 
  }, []);
  
  // Callback cuando se elimina una forma DESDE LOS CONTROLES DE DIBUJO
  const handleShapeDeleted = useCallback(() => {
    // *** Añadir Log para diagnóstico ***
    console.log('handleShapeDeleted llamado'); 
    setDrawnShape(prevState => {
        console.log('Estado drawnShape antes:', prevState);
        console.log('Estado drawnShape después: null');
        return null; // Limpiar el estado
    });
  }, []);

  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handlePageSizeChange = (newSizeStr: string | null) => {
    const newSize = parseInt(newSizeStr || '50', 10);
    if (isNaN(newSize) || newSize <= 0) return;
    setPagination(prev => ({ ...prev, pageSize: newSize, page: 1 }));
  };

  const handleOpenEditModal = (lector: Lector) => {
    setEditingLector(lector);
    openModal();
  };

  const handleCloseEditModal = () => {
    closeModal();
    setTimeout(() => setEditingLector(null), 200);
  };

  const handleSaveLector = async (lectorId: string, data: LectorUpdateData) => {
    try {
      const lectorActualizado = await updateLector(lectorId, data);
      
      setLectores(currentLectores =>
        currentLectores.map(l =>
          l.ID_Lector === lectorId ? lectorActualizado : l
        )
      );

      setMapLectores(currentMapLectores => 
        currentMapLectores.map(l => 
            l.ID_Lector === lectorId 
            ? {
                ...l,
                Nombre: lectorActualizado.Nombre,
                Provincia: lectorActualizado.Provincia,
                Carretera: lectorActualizado.Carretera,
                Coordenada_Y: lectorActualizado.Coordenada_Y ?? l.Coordenada_Y,
                Coordenada_X: lectorActualizado.Coordenada_X ?? l.Coordenada_X,
              } 
            : l
        ).filter((l): l is LectorCoordenadas => l.Coordenada_X != null && l.Coordenada_Y != null)
      );

      notifications.show({
        title: 'Lector Actualizado',
        message: `Datos del lector ${lectorId} guardados correctamente.`,
        color: 'green',
        icon: <IconCheck size={18} />
      });
      handleCloseEditModal();
    } catch (error: any) {
      console.error("Error al guardar lector:", error);
      notifications.show({
        title: 'Error al Guardar',
        message: error.message || 'No se pudieron guardar los cambios del lector.',
        color: 'red'
      });
      throw error; 
    }
  };

  const handleDeleteLector = async (lectorId: string, lectorNombre?: string | null) => {
    const nombre = lectorNombre || lectorId;
    if (!window.confirm(`¿Estás seguro de que quieres eliminar el lector "${nombre}"? Esta acción no se puede deshacer.`)) {
        return;
    }

    setDeletingLectorId(lectorId);
    try {
        await deleteLector(lectorId);
        notifications.show({
            title: 'Lector Eliminado',
            message: `El lector "${nombre}" (${lectorId}) ha sido eliminado correctamente.`,
            color: 'teal',
        });
        setLectores(currentLectores => currentLectores.filter(l => l.ID_Lector !== lectorId));
        setMapLectores(currentMapLectores => currentMapLectores.filter(l => l.ID_Lector !== lectorId));
        setSelectedLectorIds(ids => ids.filter(id => id !== lectorId));
    } catch (error: any) {
        console.error("Error al eliminar lector:", error);
        notifications.show({
            title: 'Error al Eliminar',
            message: error.message || 'No se pudo eliminar el lector.',
            color: 'red'
        });
    } finally {
        setDeletingLectorId(null);
    }
  };

  const handleExportarLectores = async (filtros: any) => {
    try {
      // Obtener todos los lectores con los filtros aplicados
      const params = {
        skip: 0,
        limit: 100000, // Un número grande para obtener todos
        ...(filtros.nombre && { texto_libre: filtros.nombre }),
        ...(filtros.provincia.length > 0 && { provincia: filtros.provincia }),
        ...(filtros.carretera.length > 0 && { carretera: filtros.carretera }),
        ...(filtros.organismo.length > 0 && { organismo: filtros.organismo }),
        ...(filtros.localidad.length > 0 && { localidad: filtros.localidad }),
      };

      const response = await getLectores(params);
      const lectoresAExportar = response.lectores;

      // Crear un array con los datos a exportar
      const datosExportar = lectoresAExportar.map(lector => ({
        'ID Lector': lector.ID_Lector,
        'Nombre': lector.Nombre || '',
        'Carretera': lector.Carretera || '',
        'Provincia': lector.Provincia || '',
        'Localidad': lector.Localidad || '',
        'Latitud': lector.Coordenada_Y || '',
        'Longitud': lector.Coordenada_X || '',
        'Organismo': lector.Organismo_Regulador || '',
        'Sentido': lector.Sentido || ''
      }));

      // Crear el archivo Excel
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(datosExportar);
      XLSX.utils.book_append_sheet(wb, ws, 'Lectores');

      // Generar el archivo y descargarlo
      const fecha = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `lectores_${fecha}.xlsx`);
    } catch (error) {
      console.error("Error al exportar lista de lectores:", error);
      throw error;
    }
  };

  const handleImportLectores = async (lectores: any[]) => {
    try {
      const result = await importarLectores(lectores);
      
      if (result.errores && result.errores.length > 0) {
        notifications.show({
          title: 'Importación Parcial',
          message: `Se importaron ${result.imported} y actualizaron ${result.updated} lectores. ${result.errores.length} filas tuvieron errores. Revisa la consola para más detalles.`,
          color: 'orange',
          autoClose: 10000,
        });
      } else {
        notifications.show({
          title: 'Importación Completada',
          message: `Se han importado ${result.imported} lectores nuevos y actualizado ${result.updated} existentes.`,
          color: 'green'
        });
      }
      
      // Recargar datos inmediatamente
      try {
        // Recargar datos de la tabla
        const response = await getLectores({ 
          skip: 0, 
          limit: pagination.pageSize * 2,
          texto_libre: filtroTextoLibre,
          provincia: filtroProvincia[0],
          carretera: filtroCarretera[0],
          organismo: filtroOrganismo[0],
        }); 
        setLectores(response.lectores);
        setPagination(prev => ({ ...prev, totalCount: response.total_count, page: 1 }));
        
        // Recargar datos del mapa si estamos en la pestaña del mapa
        if (activeTab === 'mapa') {
          const mapData = await getLectoresParaMapa();
          setMapLectores(mapData);
        }
      } catch (reloadError) {
        console.error("Error recargando datos tras importación:", reloadError);
        notifications.show({
          title: 'Error al recargar datos',
          message: 'La importación se completó (parcialmente), pero hubo un error al refrescar la lista de lectores.',
          color: 'yellow'
        });
      }
      
      return { imported: result.imported, updated: result.updated }; 
      
    } catch (error) {
      console.error("Error al importar lectores:", error);
      notifications.show({
        title: 'Error en la importación',
        message: error instanceof Error ? error.message : 'Error desconocido al importar lectores.',
        color: 'red'
      });
    }
  };

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.currentTarget.checked) {
      setSelectedLectorIds(lectores.map(l => l.ID_Lector));
    } else {
      setSelectedLectorIds([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelectedLectorIds(currentSelected =>
      checked
        ? [...currentSelected, id]
        : currentSelected.filter(selectedId => selectedId !== id)
    );
  };

  const allSelected = lectores.length > 0 && selectedLectorIds.length === lectores.length;
  const indeterminate = selectedLectorIds.length > 0 && !allSelected;

  const handleDeleteSelected = async () => {
    if (selectedLectorIds.length === 0) return;

    if (!window.confirm(`¿Estás seguro de que quieres eliminar ${selectedLectorIds.length} lectores seleccionados? Esta acción no se puede deshacer.`)) {
      return;
    }

    setLoading(true);
    const deletePromises = selectedLectorIds.map(id => deleteLector(id));
    const results = await Promise.allSettled(deletePromises);

    let successCount = 0;
    const errorMessages: string[] = [];

    results.forEach((result, index) => {
      const lectorId = selectedLectorIds[index];
      if (result.status === 'fulfilled') {
        successCount++;
        setLectores(current => current.filter(l => l.ID_Lector !== lectorId));
        setMapLectores(current => current.filter(l => l.ID_Lector !== lectorId));
      } else {
        console.error(`Error al eliminar lector ${lectorId}:`, result.reason);
        const message = result.reason instanceof Error ? result.reason.message : 'Error desconocido';
        errorMessages.push(`Lector ${lectorId}: ${message}`);
      }
    });

    setSelectedLectorIds([]);
    setLoading(false);

    if (successCount > 0) {
      notifications.show({
        title: 'Eliminación Completada',
        message: `Se eliminaron ${successCount} lectores correctamente.`,
        color: 'teal',
      });
    }
    if (errorMessages.length > 0) {
      notifications.show({
        title: 'Errores en Eliminación',
        message: `No se pudieron eliminar ${errorMessages.length} lectores. ${errorMessages.join('; ')}`,
        color: 'red',
        autoClose: false,
      });
    }
  };

  // *** NUEVO: Lógica de Filtrado para la Tabla ***
  const lectoresFiltradosTabla = useMemo(() => {
    const textoBusquedaLower = filtroTextoLibre.toLowerCase().trim();
    let filtered = lectores.filter(lector => {
      const provinciaMatch = filtroProvincia.length === 0 || (lector.Provincia && filtroProvincia.includes(lector.Provincia));
      const carreteraMatch = filtroCarretera.length === 0 || (lector.Carretera && filtroCarretera.includes(lector.Carretera));
      const organismoMatch = filtroOrganismo.length === 0 || (lector.Organismo_Regulador && filtroOrganismo.includes(lector.Organismo_Regulador));
      const localidadMatch = filtroLocalidad.length === 0 || (lector.Localidad && filtroLocalidad.includes(lector.Localidad));
      const textoMatch = textoBusquedaLower === '' || 
        (lector.ID_Lector && lector.ID_Lector.toLowerCase().includes(textoBusquedaLower)) ||
        (lector.Nombre && lector.Nombre.toLowerCase().includes(textoBusquedaLower));
      return provinciaMatch && carreteraMatch && organismoMatch && localidadMatch && textoMatch;
    });
    return filtered;
  }, [lectores, filtroProvincia, filtroCarretera, filtroOrganismo, filtroLocalidad, filtroTextoLibre]);
  // *** FIN: Lógica de Filtrado para la Tabla ***

  const rows = lectores.map((lector) => {
    const isSelected = selectedLectorIds.includes(lector.ID_Lector);
    return (
      <Table.Tr key={lector.ID_Lector} bg={isSelected ? 'var(--mantine-color-blue-light)' : undefined}>
        <Table.Td>
          <Checkbox
            aria-label={`Seleccionar lector ${lector.ID_Lector}`}
            checked={isSelected}
            onChange={(event) => handleSelectRow(lector.ID_Lector, event.currentTarget.checked)}
            disabled={loading}
          />
        </Table.Td>
        <Table.Td>{lector.ID_Lector}</Table.Td>
        <Table.Td>{lector.Nombre || '-'}</Table.Td>
        <Table.Td>{lector.Carretera || '-'}</Table.Td>
        <Table.Td>{lector.Provincia || '-'}</Table.Td>
        <Table.Td>{lector.Localidad || '-'}</Table.Td>
        <Table.Td>{lector.Coordenada_Y?.toFixed(6) || '-'}</Table.Td>
        <Table.Td>{lector.Coordenada_X?.toFixed(6) || '-'}</Table.Td>
        <Table.Td>{lector.Organismo_Regulador || '-'}</Table.Td>
        <Table.Td>
          <Group gap="xs">
            <Tooltip label="Editar Lector">
              <ActionIcon 
                variant="subtle" 
                color="blue" 
                onClick={() => handleOpenEditModal(lector)}
                disabled={deletingLectorId === lector.ID_Lector || loading}
              >
                <IconEdit size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Eliminar Lector">
              <ActionIcon 
                variant="subtle" 
                color="red" 
                onClick={() => handleDeleteLector(lector.ID_Lector, lector.Nombre)} 
                loading={deletingLectorId === lector.ID_Lector}
                disabled={deletingLectorId !== null || loading || selectedLectorIds.length > 0}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  });

  const totalPages = Math.ceil(pagination.totalCount / pagination.pageSize);

  const drawerRows = lectoresFiltradosMapa.map((lector) => (
    <Table.Tr key={`list-${lector.ID_Lector}`}>
      <Table.Td>{lector.ID_Lector}</Table.Td>
      <Table.Td>{lector.Nombre || '-'}</Table.Td>
      <Table.Td>{lector.Carretera || '-'}</Table.Td>
      <Table.Td>{lector.Provincia || '-'}</Table.Td>
      <Table.Td>{lector.Organismo_Regulador || '-'}</Table.Td>
    </Table.Tr>
  ));

  const handleBatchEditSave = async () => {
    // Recargar datos después de la edición por lotes
    await fetchLectores();
    if (activeTab === 'mapa') {
      await fetchMapData();
    }
  };

  // Efecto para cargar sugerencias al inicio
  useEffect(() => {
    const loadSugerencias = async () => {
      try {
        const data = await getLectorSugerencias();
        setSugerencias(data);
      } catch (error) {
        console.error('Error al cargar sugerencias:', error);
      }
    };
    loadSugerencias();
  }, []);

  const handleVerLecturas = (lector: Lector) => {
    // Función vacía por ahora
  };

  // Nuevo componente para el editor de capas
  const EditorCapas = () => {
    const handleToggleCapa = (capaId: string, checked: boolean) => {
      setCapas(capas.map(c =>
        c.id === capaId ? { ...c, activa: checked } : c
      ));
      if (checked) {
        setFiltroProvincia([]);
        setFiltroCarretera([]);
        setFiltroOrganismo([]);
        setFiltroLocalidad([]);
        setFiltroTextoLibre('');
        setDrawnShape(null);
      }
    };

    return (
      <Paper p="md" shadow="xs" radius="md" mb="md" withBorder>
        <Group justify="space-between" mb="md">
          <Title order={4}>Editor de Capas</Title>
          <Button
            variant="light"
            color="blue"
            size="xs"
            onClick={() => setMostrarFormularioCapa(true)}
            leftSection={<IconPlus size={14} />}
          >
            Nueva Capa
          </Button>
        </Group>
        <Stack>
          {capas.map((capa) => (
            <Group key={capa.id} justify="space-between" align="center">
              <Group>
                <Switch
                  checked={capa.activa}
                  onChange={(event) => handleToggleCapa(capa.id, event.currentTarget.checked)}
                  color="blue"
                  size="md"
                />
                <ColorSwatch color={capa.color} size={20} />
                <Text>{capa.nombre}</Text>
              </Group>
              <Group>
                <ActionIcon
                  variant="subtle"
                  color="blue"
                  onClick={() => setEditandoCapa(capa)}
                >
                  <IconEdit size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={() => {
                    setCapas(capas.filter(c => c.id !== capa.id));
                  }}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </Group>
          ))}
        </Stack>
      </Paper>
    );
  };

  // Añadir el modal de capas
  const CapaModal = () => {
    const isEditing = !!editandoCapa;
    const [nombre, setNombre] = useState(editandoCapa?.nombre || '');
    const [color, setColor] = useState(editandoCapa?.color || '#011638');

    const handleSave = () => {
      if (!nombre.trim()) {
        notifications.show({
          title: 'Error',
          message: 'El nombre de la capa es requerido',
          color: 'red'
        });
        return;
      }

      const criterios = {
        provincia: filtroProvincia.length > 0 ? [...filtroProvincia] : undefined,
        carretera: filtroCarretera.length > 0 ? [...filtroCarretera] : undefined,
        organismo: filtroOrganismo.length > 0 ? [...filtroOrganismo] : undefined,
        localidad: filtroLocalidad.length > 0 ? [...filtroLocalidad] : undefined,
        texto: filtroTextoLibre || undefined
      };

      if (isEditing && editandoCapa) {
        setCapas(capas.map(c => 
          c.id === editandoCapa.id 
            ? { ...c, nombre, color, criterios }
            : c
        ));
      } else {
        setCapas([...capas, {
          id: Date.now().toString(),
          nombre,
          color,
          criterios,
          activa: true
        }]);
      }

      setMostrarFormularioCapa(false);
      setEditandoCapa(null);
    };

    return (
      <Modal
        opened={mostrarFormularioCapa}
        onClose={() => {
          setMostrarFormularioCapa(false);
          setEditandoCapa(null);
        }}
        title={isEditing ? 'Editar Capa' : 'Nueva Capa'}
        centered
      >
        <Stack>
          <TextInput
            label="Nombre de la capa"
            value={nombre}
            onChange={(e) => setNombre(e.currentTarget.value)}
            placeholder="Ingrese un nombre para la capa"
          />
          <ColorInput
            label="Color de la capa"
            value={color}
            onChange={setColor}
            format="hex"
          />
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={() => {
              setMostrarFormularioCapa(false);
              setEditandoCapa(null);
            }}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              {isEditing ? 'Guardar cambios' : 'Crear capa'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    );
  };

  // Añadir la función handleExportarMapa
  const handleExportarMapa = async () => {
    const mapContainer = document.querySelector('.leaflet-container');
    if (!mapContainer) return;

    try {
      const canvas = await html2canvas(mapContainer as HTMLElement, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: null
      });

      const link = document.createElement('a');
      link.download = `mapa-lectores-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Error al exportar el mapa:', error);
      notifications.show({
        title: 'Error',
        message: 'No se pudo exportar el mapa',
        color: 'red'
      });
    }
  };

  // Obtener los IDs de todas las capas activas
  const idsCapasActivas = capas.filter(c => c.activa).flatMap(c => Array.isArray(c.ids) ? c.ids : []);

  // Refuerza la lógica de intersección: mostrar lectores que cumplen los filtros Y los criterios de alguna capa activa
  const capasActivas = capas.filter(c => c.activa && c.criterios);
  const normalizar = (v: string) => v?.toLowerCase().trim();
  const mostrarLectores = capasActivas.length > 0
    ? lectoresFiltradosMapa.filter(lector =>
        capasActivas.some(capa => {
          const cr = capa.criterios || {};
          const provinciaOk = !cr.provincia || (lector.Provincia && cr.provincia.map(normalizar).includes(normalizar(lector.Provincia)));
          const carreteraOk = !cr.carretera || (lector.Carretera && cr.carretera.map(normalizar).includes(normalizar(lector.Carretera)));
          const organismoOk = !cr.organismo || (lector.Organismo_Regulador && cr.organismo.map(normalizar).includes(normalizar(lector.Organismo_Regulador)));
          const localidadOk = !cr.localidad || (lector.Localidad && cr.localidad.map(normalizar).includes(normalizar(lector.Localidad)));
          const textoOk = !cr.texto ||
            (lector.ID_Lector && normalizar(lector.ID_Lector).includes(normalizar(cr.texto))) ||
            (lector.Nombre && normalizar(lector.Nombre).includes(normalizar(cr.texto)));
          return provinciaOk && carreteraOk && organismoOk && localidadOk && textoOk;
        })
      )
    : lectoresFiltradosMapa;

  // Efecto para centrar el mapa sobre los lectores activos
  useEffect(() => {
    if (!mapRef.current) return;
    if (mostrarLectores.length === 0) return;
    const bounds = L.latLngBounds(mostrarLectores.map(l => [l.Coordenada_Y, l.Coordenada_X] as [number, number]));
    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [mostrarLectores]);

  return (
    <Box p="md" style={{ paddingLeft: 32, paddingRight: 32 }}>
      <Group justify="space-between" mb="xl">
        <Title order={2}>Gestión de Lectores</Title>
        <Group>
          <Button 
            leftSection={<IconPlus size={18} />}
            onClick={openModal}
            variant="outline"
            color="green"
            disabled={loading}
          >
            Añadir Lector
          </Button>
          <Button 
            leftSection={<IconEdit size={18} />}
            onClick={openBatchEditModal}
            variant="outline"
            color="blue"
            disabled={selectedLectorIds.length === 0 || loading}
          >
            Editar Selección ({selectedLectorIds.length})
          </Button>
          <Button 
            leftSection={<IconTrash size={18} />}
            onClick={handleDeleteSelected}
            color="red"
            variant="outline"
            disabled={selectedLectorIds.length === 0 || loading}
          >
            Eliminar Selección ({selectedLectorIds.length})
          </Button>
          <Button 
            leftSection={<IconUpload size={18} />}
            onClick={openImportModal}
            variant="outline"
            color="teal"
            disabled={loading}
          >
            Importar Lectores
          </Button>
          <Button 
            leftSection={<IconFileExport size={18} />}
            onClick={openExportModal}
            variant="outline"
            color="blue"
            disabled={loading}
          >
            Exportar Lectores
          </Button>
        </Group>
      </Group>

      <Group gap={0} align="flex-start" mb="md">
        <Box>
          <Group gap="xs">
            {lectorSections.map((section) => (
              <Button
                key={section.id}
                variant={activeTab === section.id ? 'filled' : 'light'}
                leftSection={<section.icon size={16} />}
                onClick={() => setActiveTab(section.id)}
                color="#2b4fcf"
              >
                {section.label}
              </Button>
            ))}
          </Group>
        </Box>
      </Group>

      {activeTab === 'tabla' && (
        <Box style={{ position: 'relative' }}>
           <LoadingOverlay visible={loading} overlayProps={{ radius: "sm", blur: 2 }} />
           {error && <Alert color="red" title="Error en Tabla">{error}</Alert>}
           {!error && (
             <>
               <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 5 }} mb="md">
                 <MultiSelect
                     label="Filtrar por Provincia"
                     placeholder="Todas las provincias"
                     data={provinciasUnicas}
                     value={filtroProvincia}
                     onChange={setFiltroProvincia}
                     searchable clearable
                 />
                 <MultiSelect
                     label="Filtrar por Localidad"
                     placeholder="Todas las localidades"
                     data={localidadesUnicas}
                     value={filtroLocalidad}
                     onChange={setFiltroLocalidad}
                     searchable clearable
                 />
                 <MultiSelect
                     label="Filtrar por Carretera"
                     placeholder="Todas las carreteras"
                     data={carreterasUnicas}
                     value={filtroCarretera}
                     onChange={setFiltroCarretera}
                     searchable clearable
                 />
                 <MultiSelect
                     label="Filtrar por Organismo"
                     placeholder="Todos los organismos"
                     data={organismosUnicos}
                     value={filtroOrganismo}
                     onChange={setFiltroOrganismo}
                     searchable clearable
                 />
                 <Autocomplete
                     label="Buscar por ID / Nombre"
                     placeholder="Escribe para buscar..."
                     data={lectorSearchSuggestions}
                     value={filtroTextoLibre}
                     onChange={setFiltroTextoLibre}
                     limit={10}
                     clearable
                 />
               </SimpleGrid>
               <DataTable
                 withTableBorder
                 striped
                 highlightOnHover
                 verticalSpacing="sm"
                 records={lectoresFiltradosTabla}
                 columns={[
                   {
                     accessor: 'select',
                     title: (
                       <Checkbox
                         aria-label="Seleccionar todas las filas"
                         checked={allSelected}
                         indeterminate={indeterminate}
                         onChange={handleSelectAll}
                         disabled={lectores.length === 0 || loading}
                       />
                     ),
                     render: (lector) => (
                       <Checkbox
                         aria-label={`Seleccionar lector ${lector.ID_Lector}`}
                         checked={selectedLectorIds.includes(lector.ID_Lector)}
                         onChange={(event) => handleSelectRow(lector.ID_Lector, event.currentTarget.checked)}
                         disabled={loading}
                       />
                     ),
                     width: 40,
                   },
                   { accessor: 'ID_Lector', title: 'ID Lector', sortable: true },
                   { accessor: 'Nombre', title: 'Nombre', sortable: true },
                   { accessor: 'Carretera', title: 'Carretera', sortable: true },
                   { accessor: 'Provincia', title: 'Provincia', sortable: true },
                   { accessor: 'Localidad', title: 'Localidad', sortable: true },
                   { 
                     accessor: 'Coordenada_Y', 
                     title: 'Latitud', 
                     sortable: true,
                     render: (lector) => lector.Coordenada_Y?.toFixed(6) || '-'
                   },
                   { 
                     accessor: 'Coordenada_X', 
                     title: 'Longitud', 
                     sortable: true,
                     render: (lector) => lector.Coordenada_X?.toFixed(6) || '-'
                   },
                   { accessor: 'Organismo_Regulador', title: 'Organismo', sortable: true },
                   {
                     accessor: 'actions',
                     title: 'Acciones',
                     render: (lector) => (
                       <Group gap="xs">
                         <Tooltip label="Editar Lector">
                           <ActionIcon 
                             variant="subtle" 
                             color="blue" 
                             onClick={() => handleOpenEditModal(lector)}
                             disabled={deletingLectorId === lector.ID_Lector || loading}
                           >
                             <IconEdit size={16} />
                           </ActionIcon>
                         </Tooltip>
                         <Tooltip label="Eliminar Lector">
                           <ActionIcon 
                             variant="subtle" 
                             color="red" 
                             onClick={() => handleDeleteLector(lector.ID_Lector, lector.Nombre)} 
                             loading={deletingLectorId === lector.ID_Lector}
                             disabled={deletingLectorId !== null || loading || selectedLectorIds.length > 0}
                           >
                             <IconTrash size={16} />
                           </ActionIcon>
                         </Tooltip>
                       </Group>
                     ),
                   }
                 ]}
                 sortStatus={sortStatus}
                 onSortStatusChange={setSortStatus}
                 totalRecords={pagination.totalCount}
                 recordsPerPage={pagination.pageSize}
                 page={pagination.page}
                 onPageChange={(p) => setPagination(prev => ({ ...prev, page: p }))}
                 idAccessor="ID_Lector"
               />
               {totalPages > 0 && (
                 <Group justify="space-between" mt="md">
                   <Select
                     label="Filas por página"
                     data={['25', '50', '100']}
                     value={String(pagination.pageSize)}
                     onChange={handlePageSizeChange}
                     style={{ width: 150 }}
                     disabled={loading}
                   />
                   <Pagination
                     total={totalPages}
                     value={pagination.page}
                     onChange={handlePageChange}
                     disabled={loading}
                   />
                   <Text size="sm">Total: {pagination.totalCount} lectores</Text>
                 </Group>
               )}
             </>
           )}
         </Box>
      )}
      {activeTab === 'mapa' && (
        <Box pt="xs" style={{ position: 'relative', zIndex: 1 }}>
          {mapLoading && <Loader my="xl" />}
          {mapError && <Alert color="red" title="Error en Mapa">{mapError}</Alert>}
          
          {!mapLoading && !mapError && (
            <Group align="flex-start" gap={24} style={{ width: '100%', minHeight: '450px' }}>
              <Box style={{ display: 'flex', flexDirection: 'column', minWidth: 520, maxWidth: 650, borderRight: '1px solid #eee', height: 'calc(100vh - 300px)' }}>
                <FiltrosMapaLectoresPanel
                  provinciasUnicas={provinciasUnicas}
                  carreterasUnicas={carreterasUnicas}
                  organismosUnicos={organismosUnicos}
                  lectorSearchSuggestions={lectorSearchSuggestions}
                  filtroProvincia={filtroProvincia}
                  setFiltroProvincia={setFiltroProvincia}
                  filtroCarretera={filtroCarretera}
                  setFiltroCarretera={setFiltroCarretera}
                  filtroOrganismo={filtroOrganismo}
                  setFiltroOrganismo={setFiltroOrganismo}
                  filtroTextoLibre={filtroTextoLibre}
                  setFiltroTextoLibre={setFiltroTextoLibre}
                  filtroLocalidad={filtroLocalidad}
                  setFiltroLocalidad={setFiltroLocalidad}
                  localidadesUnicas={localidadesUnicas}
                  mapLoading={mapLoading}
                />
                <EditorCapas />
                <Box style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <LectoresFiltradosPanel lectores={mostrarLectores} />
                </Box>
              </Box>
              <Box style={{ flex: 1, height: 'calc(100vh - 300px)', minHeight: '450px', position: 'relative' }}>
                {infoBanner && (
                  <InfoBanner open={true} onClose={() => setInfoBanner(null)}>
                    <div>
                      <b>{infoBanner?.ID_Lector}</b><br />
                      {infoBanner?.Nombre || '-'}<br />
                      {infoBanner?.Carretera || '-'} ({infoBanner?.Provincia || '-'}) <br />
                      Organismo: {infoBanner?.Organismo_Regulador || '-'}
                    </div>
                  </InfoBanner>
                )}
                {mapLectores.length > 0 ? (
                  <MapContainer 
                    center={[40.416775, -3.70379]} 
                    zoom={12} 
                    scrollWheelZoom={true} 
                    style={{ height: '100%', width: '100%' }}
                    whenCreated={mapInstance => { mapRef.current = mapInstance; }}
                  >
                    <TileLayer
                      url="https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}{r}.png"
                      attribution='&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://www.stamen.com/" target="_blank">Stamen Design</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
                    />
                    <DrawControl 
                      onShapeDrawn={handleShapeDrawn}
                      onShapeDeleted={handleShapeDeleted}
                    />
                    {mostrarLectores.map(lector => {
                      const isActive = infoBanner && infoBanner.ID_Lector === lector.ID_Lector;
                      // Buscar la primera capa activa que coincida para el color
                      const capaActiva = capasActivas.find(capa => {
                        const cr = capa.criterios || {};
                        const provinciaOk = !cr.provincia || (lector.Provincia && cr.provincia.map(normalizar).includes(normalizar(lector.Provincia)));
                        const carreteraOk = !cr.carretera || (lector.Carretera && cr.carretera.map(normalizar).includes(normalizar(lector.Carretera)));
                        const organismoOk = !cr.organismo || (lector.Organismo_Regulador && cr.organismo.map(normalizar).includes(normalizar(lector.Organismo_Regulador)));
                        const localidadOk = !cr.localidad || (lector.Localidad && cr.localidad.map(normalizar).includes(normalizar(lector.Localidad)));
                        const textoOk = !cr.texto ||
                          (lector.ID_Lector && normalizar(lector.ID_Lector).includes(normalizar(cr.texto))) ||
                          (lector.Nombre && normalizar(lector.Nombre).includes(normalizar(cr.texto)));
                        return provinciaOk && carreteraOk && organismoOk && localidadOk && textoOk;
                      });
                      
                      const markerIcon = L.divIcon({
                        html: `<span style="background-color: ${capaActiva?.color || '#011638'}; width: ${isActive ? '24px' : '16px'}; height: ${isActive ? '24px' : '16px'}; border-radius: 50%; display: inline-block; border: ${isActive ? '3px solid #222' : '2px solid white'}; box-shadow: ${isActive ? '0 0 0 4px rgba(1,22,56,0.15)' : '0 0 4px rgba(0,0,0,0.4)'};"></span>`,
                        className: 'custom-div-icon',
                        iconSize: isActive ? [24, 24] : [16, 16],
                        iconAnchor: isActive ? [12, 12] : [8, 8]
                      });

                      return (
                        <Marker 
                          key={lector.ID_Lector} 
                          position={[lector.Coordenada_Y, lector.Coordenada_X]}
                          icon={markerIcon}
                          eventHandlers={{ click: () => setInfoBanner(lector) }}
                        />
                      );
                    })}
                    <ActionIcon
                      variant="default"
                      size={32}
                      style={{
                        position: 'absolute',
                        bottom: 16,
                        left: 16,
                        zIndex: 1000,
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
                      id="camera-capture-btn-lectores"
                      aria-label="Exportar captura de pantalla"
                    >
                      <IconCamera size={16} color="#234be7" />
                    </ActionIcon>
                  </MapContainer>
                ) : (
                  <Text>No hay lectores con coordenadas para mostrar en el mapa.</Text>
                )}
              </Box>
            </Group>
          )}
        </Box>
      )}

      <EditLectorModal 
        opened={modalOpened}
        onClose={handleCloseEditModal}
        lector={editingLector}
        onSave={handleSaveLector}
      />
      
      <ImportarLectoresModal
        opened={importModalOpened}
        onClose={closeImportModal}
        onImport={handleImportLectores}
      />

      <BatchEditLectoresModal
        opened={batchEditModalOpened}
        onClose={closeBatchEditModal}
        selectedLectorIds={selectedLectorIds}
        onSave={handleBatchEditSave}
        provincias={provinciasUnicas}
        localidades={localidadesUnicas}
        carreteras={carreterasUnicas.map(c => c.value)}
        organismos={organismosUnicos.map(o => o.value)}
        sentidos={['Creciente', 'Decreciente']}
      />

      <ExportarLectoresModal
        opened={exportModalOpened}
        onClose={closeExportModal}
        onExport={handleExportarLectores}
        sugerencias={{
          provincias: provinciasUnicas,
          carreteras: carreterasUnicas.map(c => c.value),
          organismos: organismosUnicos.map(o => o.value),
          localidades: localidadesUnicas.map(l => l.value)
        }}
      />

      <CapaModal />

      <Box style={{ display: 'none' }}>
        {/* Componente eliminado */}
      </Box>
    </Box>
  );
}

export default LectoresPage; 