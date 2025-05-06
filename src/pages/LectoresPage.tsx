import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
    Box, Title, Table, Loader, Alert, Pagination, Select, Group, Text, ActionIcon, Tooltip, Button, Tabs, SimpleGrid, MultiSelect, Space, Checkbox, LoadingOverlay,
    Autocomplete, ScrollArea, Collapse, Paper, Stack, Grid
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconEdit, IconTrash, IconCheck, IconMap, IconList, IconFileExport, IconUpload, IconSearch, IconX, IconListDetails, IconChevronDown, IconChevronUp, IconPlus } from '@tabler/icons-react';
import { getLectores, updateLector, getLectoresParaMapa, deleteLector, importarLectores, getLectorSugerencias } from '../services/lectoresApi';
import type { Lector, LectorUpdateData, LectorCoordenadas, LectorSugerenciasResponse } from '../types/data';
import EditLectorModal from '../components/modals/EditLectorModal';
import ImportarLectoresModal from '../components/modals/ImportarLectoresModal';
import { DataTable, type DataTableSortStatus } from 'mantine-datatable';
import _ from 'lodash';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// *** NUEVO: Crear icono personalizado para ZBE Madrid ***
const fuchsiaPointIcon = new L.DivIcon({
  html: `<span style="background-color: fuchsia; width: 8px; height: 8px; border-radius: 50%; display: inline-block; border: 1px solid darkmagenta;"></span>`,
  className: '', // Necesario para evitar estilos por defecto de divIcon si no los queremos
  iconSize: [8, 8], // Tamaño del icono
  iconAnchor: [4, 4] // Punto de anclaje (centro del punto)
});
// *** FIN: Crear icono personalizado ***

// *** NUEVO: Crear icono personalizado para marcador activo ***
const activeLectorIcon = new L.DivIcon({
  html: `<span style="background-color: fuchsia; width: 16px; height: 16px; border-radius: 50%; display: inline-block; border: 3px solid #222; box-shadow: 0 0 0 4px rgba(120,0,120,0.15);"></span>`,
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});
// *** FIN: Crear icono personalizado ***

// Opciones para el filtro de Sentido
const SENTIDO_OPTIONS = [
  { value: 'Creciente', label: 'Creciente' },
  { value: 'Decreciente', label: 'Decreciente' },
];

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
  const [filtroSentido, setFiltroSentido] = useState<string | null>(null);

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

  // Función para cargar los lectores
  const fetchLectores = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        skip: (pagination.page - 1) * pagination.pageSize,
        limit: pagination.pageSize,
        // Añadir filtros solo si tienen valor
        ...(filtroTextoLibre && { texto_libre: filtroTextoLibre }),
        ...(filtroProvincia.length > 0 && { provincia: filtroProvincia[0] }), // Por ahora solo usamos el primer valor
        ...(filtroCarretera.length > 0 && { carretera: filtroCarretera[0] }),
        ...(filtroOrganismo.length > 0 && { organismo: filtroOrganismo[0] }),
        ...(filtroSentido && { sentido: filtroSentido }),
        // Añadir parámetros de ordenación
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
  }, [pagination.page, pagination.pageSize, filtroTextoLibre, filtroProvincia, filtroCarretera, filtroOrganismo, filtroSentido, sortStatus]);

  // Efecto para recargar cuando cambian los filtros
  useEffect(() => {
    fetchLectores();
  }, [fetchLectores]);

  // Efecto para recargar cuando cambia la ordenación
  useEffect(() => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchLectores();
  }, [sortStatus, fetchLectores]);

  // Manejador para limpiar filtros
  const handleClearFilters = useCallback(() => {
    setFiltroProvincia([]);
    setFiltroCarretera([]);
    setFiltroOrganismo([]);
    setFiltroSentido(null);
    setFiltroTextoLibre('');
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  const fetchMapData = useCallback(async () => {
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
  }, []);

  // Ajustar useEffect para cargar datos de mapa si la pestaña inicial es 'mapa'
  useEffect(() => {
    if (activeTab === 'mapa' && mapLectores.length === 0 && !mapLoading && mapError === null) {
      fetchMapData();
    }
    // No necesitamos dependencia de mapLectores.length, mapLoading, mapError aquí
    // porque fetchMapData se encarga de no recargar innecesariamente si ya está cargando.
    // La dependencia clave es activeTab y fetchMapData
  }, [activeTab, fetchMapData]);

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

  const lectorSearchSuggestions = useMemo(() => {
    const suggestions = new Set<string>();
    [...lectores, ...mapLectores].forEach(lector => {
      if (lector.ID_Lector) suggestions.add(lector.ID_Lector);
      if (lector.Nombre) suggestions.add(lector.Nombre);
    });
    return Array.from(suggestions).sort();
  }, [lectores, mapLectores]);

  // Lógica de Filtrado (usa la función helper)
  const lectoresFiltradosMapa = useMemo(() => {
    const textoBusquedaLower = filtroTextoLibre.toLowerCase().trim();
    const drawnPolygonGeoJSON = getShapeGeoJSONGeometry(drawnShape);

    return mapLectores.filter(lector => {
      // Filtros existentes
      const provinciaMatch = filtroProvincia.length === 0 || (lector.Provincia && filtroProvincia.includes(lector.Provincia));
      const carreteraMatch = filtroCarretera.length === 0 || (lector.Carretera && filtroCarretera.includes(lector.Carretera));
      const organismoMatch = filtroOrganismo.length === 0 || (lector.Organismo_Regulador && filtroOrganismo.includes(lector.Organismo_Regulador));
      const textoMatch = textoBusquedaLower === '' || 
                         (lector.ID_Lector && lector.ID_Lector.toLowerCase().includes(textoBusquedaLower)) ||
                         (lector.Nombre && lector.Nombre.toLowerCase().includes(textoBusquedaLower));
      const sentidoMatch = filtroSentido === null || (lector.Sentido && lector.Sentido === filtroSentido);

      // Filtro espacial (usa drawnPolygonGeoJSON)
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
      // else: spatialMatch sigue siendo true si no hay polígono o el lector no tiene coords

      // Devolver true solo si todos los filtros coinciden
      return provinciaMatch && carreteraMatch && organismoMatch && textoMatch && sentidoMatch && spatialMatch;
    });
  }, [mapLectores, filtroProvincia, filtroCarretera, filtroOrganismo, filtroTextoLibre, filtroSentido, drawnShape]);
  
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
      
      if (result.errors && result.errors.length > 0) {
        notifications.show({
          title: 'Importación Parcial',
          message: `Se importaron ${result.imported} y actualizaron ${result.updated} lectores. ${result.errors.length} filas tuvieron errores. Revisa la consola para más detalles.`,
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
          sentido: filtroSentido === null ? undefined : filtroSentido
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
    // Filtrar el array 'lectores' (los de la página actual de la tabla)
    let filtered = lectores.filter(lector => {
      const provinciaMatch = filtroProvincia.length === 0 || (lector.Provincia && filtroProvincia.includes(lector.Provincia));
      const carreteraMatch = filtroCarretera.length === 0 || (lector.Carretera && filtroCarretera.includes(lector.Carretera));
      const organismoMatch = filtroOrganismo.length === 0 || (lector.Organismo_Regulador && filtroOrganismo.includes(lector.Organismo_Regulador));
      // Buscar en ID_Lector y Nombre para la tabla también
      const textoMatch = textoBusquedaLower === '' || 
                         (lector.ID_Lector && lector.ID_Lector.toLowerCase().includes(textoBusquedaLower)) ||
                         (lector.Nombre && lector.Nombre.toLowerCase().includes(textoBusquedaLower));
      const sentidoMatch = filtroSentido === null || (lector.Sentido && lector.Sentido === filtroSentido);
      
      // No aplicamos filtro espacial a la tabla
      return provinciaMatch && carreteraMatch && organismoMatch && textoMatch && sentidoMatch;
    });

    return filtered;
  }, [lectores, filtroProvincia, filtroCarretera, filtroOrganismo, filtroTextoLibre, filtroSentido]);
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
      <Table.Td>{lector.Sentido || '-'}</Table.Td>
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

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="tabla" leftSection={<IconList size={14} />}>
            Tabla
          </Tabs.Tab>
          <Tabs.Tab value="mapa" leftSection={<IconMap size={14} />}>
            Mapa
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="tabla" pt="xs">
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
                   <Select
                       label="Filtrar por Sentido"
                       placeholder="Ambos sentidos"
                       data={SENTIDO_OPTIONS}
                       value={filtroSentido}
                       onChange={setFiltroSentido}
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
        </Tabs.Panel>

        <Tabs.Panel value="mapa" pt="xs" style={{ position: 'relative', zIndex: 1 }}>
          {mapLoading && <Loader my="xl" />}
          {mapError && <Alert color="red" title="Error en Mapa">{mapError}</Alert>}
          {!mapLoading && !mapError && (
            <Grid gutter="md">
              {/* Columna izquierda: Filtros + Tabla de lectores filtrados */}
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Paper p="md" withBorder style={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
                  <Title order={4} mb="md">Filtros de Lectores</Title>
                  <Stack gap="sm" mb="md">
                    <SimpleGrid cols={2} spacing="sm">
                      <MultiSelect
                        label="Provincia"
                        placeholder="Todas"
                        data={provinciasUnicas}
                        value={filtroProvincia}
                        onChange={setFiltroProvincia}
                        searchable clearable
                      />
                      <MultiSelect
                        label="Carretera"
                        placeholder="Todas"
                        data={carreterasUnicas}
                        value={filtroCarretera}
                        onChange={setFiltroCarretera}
                        searchable clearable
                      />
                      <MultiSelect
                        label="Organismo"
                        placeholder="Todos"
                        data={organismosUnicos}
                        value={filtroOrganismo}
                        onChange={setFiltroOrganismo}
                        searchable clearable
                      />
                      <Select
                        label="Sentido"
                        placeholder="Ambos"
                        data={SENTIDO_OPTIONS}
                        value={filtroSentido}
                        onChange={setFiltroSentido}
                        clearable
                      />
                    </SimpleGrid>
                    <Group grow>
                      <Autocomplete
                        label="ID / Nombre"
                        placeholder="Buscar..."
                        data={lectorSearchSuggestions}
                        value={filtroTextoLibre}
                        onChange={setFiltroTextoLibre}
                        limit={10}
                        clearable
                      />
                      <Button mt={22} variant="light" color="gray" onClick={handleClearFilters}>
                        Limpiar Filtros
                      </Button>
                    </Group>
                  </Stack>
                  <Title order={4} mb="md">Lista de Lectores Filtrados</Title>
                  <ScrollArea style={{ flex: 1 }}>
                    <Table striped highlightOnHover withTableBorder>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>ID Lector</Table.Th>
                          <Table.Th>Nombre</Table.Th>
                          <Table.Th>Carretera</Table.Th>
                          <Table.Th>Provincia</Table.Th>
                          <Table.Th>Sentido</Table.Th>
                          <Table.Th>Organismo</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {lectoresFiltradosMapa.length > 0 ? (
                          lectoresFiltradosMapa.map((lector) => (
                            <Table.Tr key={`list-${lector.ID_Lector}`}>
                              <Table.Td>{lector.ID_Lector}</Table.Td>
                              <Table.Td>{lector.Nombre || '-'}</Table.Td>
                              <Table.Td>{lector.Carretera || '-'}</Table.Td>
                              <Table.Td>{lector.Provincia || '-'}</Table.Td>
                              <Table.Td>{lector.Sentido || '-'}</Table.Td>
                              <Table.Td>{lector.Organismo_Regulador || '-'}</Table.Td>
                            </Table.Tr>
                          ))
                        ) : (
                          <Table.Tr>
                            <Table.Td colSpan={6} style={{ textAlign: 'center', color: '#888' }}>
                              No hay lectores que coincidan con los filtros actuales.
                            </Table.Td>
                          </Table.Tr>
                        )}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Paper>
              </Grid.Col>
              {/* Columna central: Mapa */}
              <Grid.Col span={{ base: 12, md: 8 }}>
                <Box style={{ height: 'calc(100vh - 300px)', minHeight: '450px', position: 'relative' }}>
                  {mapLectores.length > 0 ? (
                    <MapContainer 
                      center={[40.416775, -3.703790]} 
                      zoom={6} 
                      scrollWheelZoom={true} 
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer
                        url="https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}{r}.png"
                        attribution='&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://www.stamen.com/" target="_blank">Stamen Design</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
                      />
                      <DrawControl 
                        onShapeDrawn={handleShapeDrawn}
                        onShapeDeleted={handleShapeDeleted}
                      />
                      {lectoresFiltradosMapa.map(lector => {
                        const useFuchsiaIcon = lector.Organismo_Regulador === 'ZBE Madrid';
                        const isActive = infoBanner && infoBanner.ID_Lector === lector.ID_Lector;
                        return (
                          <Marker 
                            key={lector.ID_Lector} 
                            position={[lector.Coordenada_Y, lector.Coordenada_X]}
                            icon={isActive ? activeLectorIcon : (useFuchsiaIcon ? fuchsiaPointIcon : undefined)}
                            eventHandlers={{ click: () => setInfoBanner(lector) }}
                          />
                        );
                      })}
                    </MapContainer>
                  ) : (
                    <Text>No hay lectores con coordenadas para mostrar en el mapa.</Text>
                  )}
                </Box>
              </Grid.Col>
            </Grid>
          )}
        </Tabs.Panel>
      </Tabs>

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
      />

      <ExportarLectoresModal
        opened={exportModalOpened}
        onClose={closeExportModal}
        onExport={handleExportarLectores}
        sugerencias={{
          provincias: provinciasUnicas,
          carreteras: carreterasUnicas.map(c => c.value),
          organismos: organismosUnicos.map(o => o.value),
          localidades: sugerencias.localidades
        }}
      />

      <Box style={{ display: 'none' }}>
        {/* Componente eliminado */}
      </Box>
    </Box>
  );
}

export default LectoresPage; 