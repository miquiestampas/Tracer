import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
    Box, Title, Table, Loader, Alert, Pagination, Select, Group, Text, ActionIcon, Tooltip, Button, Tabs, SimpleGrid, MultiSelect, Space, Checkbox, LoadingOverlay,
    Autocomplete
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconEdit, IconTrash, IconCheck, IconMap, IconList, IconFileExport, IconUpload, IconSearch, IconX } from '@tabler/icons-react';
import { getLectores, updateLector, getLectoresParaMapa, deleteLector, importarLectores } from '../services/lectoresApi';
import type { Lector, LectorUpdateData, LectorCoordenadas } from '../types/data';
import EditLectorModal from '../components/modals/EditLectorModal';
import ImportarLectoresModal from '../components/modals/ImportarLectoresModal';
import AnalisisLecturasPanel, { AnalisisLecturasPanelHandle } from '../components/analisis/AnalisisLecturasPanel';

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

// Opciones para el filtro de Sentido
const SENTIDO_OPTIONS = [
  { value: 'Creciente', label: 'Creciente' },
  { value: 'Decreciente', label: 'Decreciente' },
];

function LectoresPage() {
  const [lectores, setLectores] = useState<Lector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, totalCount: 0 });

  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editingLector, setEditingLector] = useState<Lector | null>(null);
  const [deletingLectorId, setDeletingLectorId] = useState<string | null>(null);

  const [selectedLectorIds, setSelectedLectorIds] = useState<string[]>([]);

  const [activeTab, setActiveTab] = useState<string | null>('tabla');
  const [mapLectores, setMapLectores] = useState<LectorCoordenadas[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [filtroProvincia, setFiltroProvincia] = useState<string[]>([]);
  const [filtroCarretera, setFiltroCarretera] = useState<string[]>([]);
  const [filtroOrganismo, setFiltroOrganismo] = useState<string[]>([]);
  const [filtroTextoLibre, setFiltroTextoLibre] = useState<string>('');
  const [filtroSentido, setFiltroSentido] = useState<string | null>(null);

  const analisisPanelRef = useRef<AnalisisLecturasPanelHandle>(null);

  const [importModalOpened, { open: openImportModal, close: closeImportModal }] = useDisclosure(false);

  const fetchLectoresTabla = useCallback(async (page: number, pageSize: number) => {
    setLoading(true);
    setError(null);
    try {
      const skip = (page - 1) * pageSize;
      const limit = pageSize;
      const response = await getLectores({ skip, limit });
      setLectores(response.lectores);
      setPagination(prev => ({ ...prev, totalCount: response.total_count }));
    } catch (err: any) {
      setError(err.message || 'Error al cargar los lectores para la tabla.');
      setLectores([]);
      setPagination(prev => ({ ...prev, totalCount: 0 }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'tabla') {
      fetchLectoresTabla(pagination.page, pagination.pageSize);
    }
  }, [pagination.page, pagination.pageSize, fetchLectoresTabla, activeTab]);

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

  useEffect(() => {
    if (activeTab === 'mapa' && mapLectores.length === 0 && !mapLoading && mapError === null) {
      fetchMapData();
    }
  }, [activeTab, fetchMapData, mapLoading, mapError]);

  console.log("[MapFilters] Datos base mapLectores:", mapLectores);
  
  const provinciasUnicas = useMemo(() => {
    const provincias = mapLectores
      .map(l => l.Provincia)
      .filter((p): p is string => p != null && p.trim() !== '');
    return Array.from(new Set(provincias)).sort();
  }, [mapLectores]);

  const carreterasUnicas = useMemo(() => {
    console.log("[MapFilters] Calculando carreterasUnicas...");
    const carreterasMapped = mapLectores.map(l => l.Carretera);
    const carreterasFiltered = carreterasMapped.filter((c): c is string => c != null && c.trim() !== '');
    const uniqueSet = new Set(carreterasFiltered);
    const result = Array.from(uniqueSet).sort().map(carretera => ({ value: carretera, label: carretera }));
    console.log("[MapFilters] Carreteras Únicas (resultado final - formato objeto):", result);
    return result;
  }, [mapLectores]);

  const organismosUnicos = useMemo(() => {
    console.log("[MapFilters] Calculando organismosUnicos...");
    const organismosMapped = mapLectores.map(l => l.Organismo_Regulador);
    const organismosFiltered = organismosMapped.filter((o): o is string => o != null && o.trim() !== '');
    const uniqueSet = new Set(organismosFiltered);
    const result = Array.from(uniqueSet).sort().map(organismo => ({ value: organismo, label: organismo }));
    console.log("[MapFilters] Organismos Únicos (resultado final - formato objeto):", result);
    return result;
  }, [mapLectores]);

  const lectorSearchSuggestions = useMemo(() => {
    const suggestions = new Set<string>();
    mapLectores.forEach(lector => {
      if (lector.ID_Lector) suggestions.add(lector.ID_Lector);
      if (lector.Nombre) suggestions.add(lector.Nombre);
    });
    return Array.from(suggestions).sort();
  }, [mapLectores]);

  const lectoresFiltradosMapa = useMemo(() => {
    const textoBusquedaLower = filtroTextoLibre.toLowerCase().trim();
    
    return mapLectores.filter(lector => {
      const provinciaMatch = filtroProvincia.length === 0 || (lector.Provincia && filtroProvincia.includes(lector.Provincia));
      const carreteraMatch = filtroCarretera.length === 0 || (lector.Carretera && filtroCarretera.includes(lector.Carretera));
      const organismoMatch = filtroOrganismo.length === 0 || (lector.Organismo_Regulador && filtroOrganismo.includes(lector.Organismo_Regulador));
      const textoMatch = textoBusquedaLower === '' || 
                         (lector.ID_Lector && lector.ID_Lector.toLowerCase().includes(textoBusquedaLower)) ||
                         (lector.Nombre && lector.Nombre.toLowerCase().includes(textoBusquedaLower));
      const sentidoMatch = filtroSentido === null || (lector.Sentido && lector.Sentido === filtroSentido);
      return provinciaMatch && carreteraMatch && organismoMatch && textoMatch && sentidoMatch;
    });
  }, [mapLectores, filtroProvincia, filtroCarretera, filtroOrganismo, filtroTextoLibre, filtroSentido]);

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

  const handleExportarLectores = async () => {
    try {
      if (analisisPanelRef.current) {
        await analisisPanelRef.current.exportarListaLectores();
      } else {
        throw new Error("No se pudo acceder a la función de exportación");
      }
    } catch (error) {
      console.error("Error al exportar lista de lectores:", error);
      notifications.show({
        title: 'Error en la Exportación',
        message: error instanceof Error ? error.message : 'Error desconocido al exportar',
        color: 'red'
      });
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
      
      console.log("Recargando datos después de importación...");
      setTimeout(async () => {
        try {
          console.log("Ejecutando recarga de datos con delay...");
          const response = await getLectores({ skip: 0, limit: pagination.pageSize * 2 }); 
          setLectores(response.lectores);
          setPagination(prev => ({ ...prev, totalCount: response.total_count, page: 1 }));
          console.log(`Tabla recargada: ${response.lectores.length} lectores encontrados`);
          
          if (activeTab === 'mapa') {
            await fetchMapData();
            console.log("Mapa recargado tras importación");
          }
        } catch (reloadError) {
          console.error("Error recargando datos tras importación:", reloadError);
          notifications.show({
            title: 'Error al recargar datos',
            message: 'La importación se completó (parcialmente), pero hubo un error al refrescar la lista de lectores.',
            color: 'yellow'
          });
        }
      }, 500);
      
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

  return (
    <Box p="md">
      <Group justify="space-between" mb="xl">
        <Title order={2}>Gestión de Lectores</Title>
        <Group>
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
            onClick={handleExportarLectores}
            variant="outline"
            color="blue"
            disabled={loading}
          >
            Exportar Lista de Lectores
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
                 <Table striped highlightOnHover withTableBorder mt="md" verticalSpacing="sm" >
                   <Table.Thead>
                     <Table.Tr>
                       <Table.Th style={{ width: 40 }}>
                         <Checkbox
                           aria-label="Seleccionar todas las filas"
                           checked={allSelected}
                           indeterminate={indeterminate}
                           onChange={handleSelectAll}
                           disabled={lectores.length === 0 || loading}
                         />
                       </Table.Th>
                       <Table.Th>ID Lector</Table.Th>
                       <Table.Th>Nombre</Table.Th>
                       <Table.Th>Carretera</Table.Th>
                       <Table.Th>Provincia</Table.Th>
                       <Table.Th>Localidad</Table.Th>
                       <Table.Th>Latitud</Table.Th>
                       <Table.Th>Longitud</Table.Th>
                       <Table.Th>Organismo</Table.Th>
                       <Table.Th>Acciones</Table.Th>
                     </Table.Tr>
                   </Table.Thead>
                   <Table.Tbody>
                     {rows.length > 0 ? rows : (
                       <Table.Tr><Table.Td colSpan={10} align="center">No se encontraron lectores.</Table.Td></Table.Tr>
                     )}
                   </Table.Tbody>
                 </Table>
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
            <>
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 5 }} mb="md">
                <MultiSelect
                    label="Filtrar por Provincia"
                    placeholder="Todas las provincias"
                    data={provinciasUnicas}
                    value={filtroProvincia}
                    onChange={setFiltroProvincia}
                    searchable clearable disabled={mapLoading}
                    styles={{ dropdown: { zIndex: 1050 } }}
                />
                 <MultiSelect
                    label="Filtrar por Carretera"
                    placeholder="Todas las carreteras"
                    data={carreterasUnicas}
                    value={filtroCarretera}
                    onChange={setFiltroCarretera}
                    searchable clearable disabled={mapLoading}
                    styles={{ dropdown: { zIndex: 1050 } }}
                />
                 <MultiSelect
                    label="Filtrar por Organismo"
                    placeholder="Todos los organismos"
                    data={organismosUnicos}
                    value={filtroOrganismo}
                    onChange={setFiltroOrganismo}
                    searchable clearable disabled={mapLoading}
                    styles={{ dropdown: { zIndex: 1050 } }}
                />
                <Autocomplete
                    label="Buscar por ID/Nombre"
                    placeholder="Escribe para buscar..."
                    data={lectorSearchSuggestions}
                    value={filtroTextoLibre}
                    onChange={setFiltroTextoLibre}
                    limit={10}
                    maxDropdownHeight={200}
                    leftSection={<IconSearch size={16} />}
                    rightSection={
                      filtroTextoLibre ? (
                        <ActionIcon variant="subtle" color="gray" onClick={() => setFiltroTextoLibre('')} aria-label="Limpiar búsqueda">
                          <IconX size={16} />
                        </ActionIcon>
                      ) : null
                    }
                    disabled={mapLoading}
                    comboboxProps={{ dropdownPadding: 'sm', shadow: 'md', zIndex: 1051 }}
                />
                <Select
                    label="Filtrar por Sentido"
                    placeholder="Ambos sentidos"
                    data={SENTIDO_OPTIONS}
                    value={filtroSentido}
                    onChange={setFiltroSentido} 
                    clearable
                    disabled={mapLoading}
                    styles={{ dropdown: { zIndex: 1050 } }}
                />
              </SimpleGrid>
              
              <Text size="sm" mb="md">Mostrando {lectoresFiltradosMapa.length} de {mapLectores.length} lectores con coordenadas.</Text>

              <Box style={{ height: '600px', width: '100%' }}>
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
                      {lectoresFiltradosMapa.map(lector => {
                        const useFuchsiaIcon = lector.Organismo_Regulador === 'ZBE Madrid';
                        
                        return (
                          <Marker 
                            key={lector.ID_Lector} 
                            position={[lector.Coordenada_Y, lector.Coordenada_X]}
                            icon={useFuchsiaIcon ? fuchsiaPointIcon : undefined} 
                          >
                            <Popup>
                              <b>{lector.ID_Lector}</b><br />
                              {lector.Nombre || '-'}<br />
                              {lector.Carretera || '-'} ({lector.Provincia || '-'}) <br />
                              Organismo: {lector.Organismo_Regulador || '-'}
                            </Popup>
                          </Marker>
                        );
                      })}
                    </MapContainer>
                 ) : (
                    <Text>No hay lectores con coordenadas para mostrar en el mapa.</Text>
                 )}
              </Box>
            </>
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
      
      <Box style={{ display: 'none' }}>
        <AnalisisLecturasPanel 
          ref={analisisPanelRef}
          interactedMatriculas={new Set()}
          addInteractedMatricula={() => {}}
        />
      </Box>
    </Box>
  );
}

export default LectoresPage; 