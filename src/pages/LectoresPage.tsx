import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Box, Title, Table, Loader, Alert, Pagination, Select, Group, Text, ActionIcon, Tooltip, Button, Tabs, SimpleGrid, MultiSelect, Space 
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconEdit, IconTrash, IconCheck, IconMap, IconList } from '@tabler/icons-react';
import { getLectores, updateLector, getLectoresParaMapa } from '../services/lectoresApi';
import type { Lector, LectorUpdateData, LectorCoordenadas } from '../types/data';
import EditLectorModal from '../components/modals/EditLectorModal';

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

function LectoresPage() {
  const [lectores, setLectores] = useState<Lector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, totalCount: 0 });

  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editingLector, setEditingLector] = useState<Lector | null>(null);

  const [activeTab, setActiveTab] = useState<string | null>('tabla');
  const [mapLectores, setMapLectores] = useState<LectorCoordenadas[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [filtroProvincia, setFiltroProvincia] = useState<string[]>([]);
  const [filtroCarretera, setFiltroCarretera] = useState<string[]>([]);

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

  const provinciasUnicas = useMemo(() => {
    const provincias = mapLectores
      .map(l => l.Provincia)
      .filter((p): p is string => p != null && p.trim() !== '');
    return Array.from(new Set(provincias)).sort();
  }, [mapLectores]);

  const carreterasUnicas = useMemo(() => {
    const carreteras = mapLectores
      .map(l => l.Carretera)
      .filter((c): c is string => c != null && c.trim() !== '');
    return Array.from(new Set(carreteras)).sort();
  }, [mapLectores]);

  const lectoresFiltradosMapa = useMemo(() => {
    return mapLectores.filter(lector => {
      const provinciaMatch = filtroProvincia.length === 0 || (lector.Provincia && filtroProvincia.includes(lector.Provincia));
      const carreteraMatch = filtroCarretera.length === 0 || (lector.Carretera && filtroCarretera.includes(lector.Carretera));
      return provinciaMatch && carreteraMatch;
    });
  }, [mapLectores, filtroProvincia, filtroCarretera]);

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

  const rows = lectores.map((lector) => (
    <Table.Tr key={lector.ID_Lector}>
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
            <ActionIcon variant="subtle" color="blue" onClick={() => handleOpenEditModal(lector)} >
              <IconEdit size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Eliminar Lector (pendiente)">
            <ActionIcon variant="subtle" color="red" /* onClick={() => handleDelete(lector.ID_Lector)} */ >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  const totalPages = Math.ceil(pagination.totalCount / pagination.pageSize);

  return (
    <Box p="md">
      <Title order={2} mb="xl">Gestión de Lectores</Title>

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
          {loading && <Loader my="xl" />}
          {error && <Alert color="red" title="Error en Tabla">{error}</Alert>}
          {!loading && !error && (
            <>
              <Table striped highlightOnHover withTableBorder mt="md" verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
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
                    <Table.Tr><Table.Td colSpan={9} align="center">No se encontraron lectores.</Table.Td></Table.Tr>
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
        </Tabs.Panel>

        <Tabs.Panel value="mapa" pt="xs">
          {mapLoading && <Loader my="xl" />}
          {mapError && <Alert color="red" title="Error en Mapa">{mapError}</Alert>}
          
          {!mapLoading && !mapError && (
            <>
              <SimpleGrid cols={{ base: 1, sm: 2 }} mb="md">
                <MultiSelect
                    label="Filtrar por Provincia"
                    placeholder="Todas las provincias"
                    data={provinciasUnicas}
                    value={filtroProvincia}
                    onChange={setFiltroProvincia}
                    searchable
                    clearable
                    disabled={mapLoading}
                />
                 <MultiSelect
                    label="Filtrar por Carretera"
                    placeholder="Todas las carreteras"
                    data={carreterasUnicas}
                    value={filtroCarretera}
                    onChange={setFiltroCarretera}
                    searchable
                    clearable
                    disabled={mapLoading}
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
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      {lectoresFiltradosMapa.map(lector => (
                        <Marker 
                          key={lector.ID_Lector} 
                          position={[lector.Coordenada_Y, lector.Coordenada_X]}
                        >
                          <Popup>
                            <b>{lector.ID_Lector}</b><br />
                            {lector.Nombre || '-'}<br />
                            {lector.Carretera || '-'} ({lector.Provincia || '-'})
                          </Popup>
                        </Marker>
                      ))}
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

    </Box>
  );
}

export default LectoresPage; 