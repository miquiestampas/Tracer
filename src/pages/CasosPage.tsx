import React, { useState, useEffect, useMemo } from 'react';
// Imports necesarios, incluyendo Select
import { Tabs, Text, Box, Table, Button, Modal, TextInput, Textarea, Group, Loader, Alert, NumberInput, ActionIcon, Tooltip, Select, Card, SimpleGrid, SegmentedControl, Input, Title, Stack, ThemeIcon, Divider, Avatar, Menu } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { IconList, IconPlus, IconAlertCircle, IconEye, IconTrash, IconLayoutGrid, IconSortAscending, IconSortDescending, IconSearch, IconPencil, IconArrowsUpDown, IconRefresh, IconFolder } from '@tabler/icons-react'; // Icono Kanban eliminado
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useNavigate, Link } from 'react-router-dom';
import { getCasos, createCaso, deleteCaso, updateCasoEstado, updateCaso } from '../services/casosApi';
// Asumimos que el tipo EstadoCaso se resolverá después de reiniciar el entorno
import type { Caso, CasoCreate, EstadoCaso } from '../types/data';
import dayjs from 'dayjs'; // Para formatear fecha
import _ from 'lodash'; // Para ordenar
import { useAuth } from '../context/AuthContext';
import './CasosPage.css'; // Asegúrate de importar el CSS para los estilos de hover
import apiClient from '../services/api';

// Lista de estados válidos
const CASE_STATUSES: EstadoCaso[] = [
    "En Análisis",
    "Nuevo",
    "Esperando Archivos",
    "Pendiente Informe",
    "Cerrada"
];

// --- Tipos para Ordenación ---
type SortField = 'Fecha_de_Creacion' | 'Nombre_del_Caso' | 'Año' | 'Ultima_Visita';
type SortDirection = 'asc' | 'desc';

// --- NUEVO: Función para obtener color según estado ---
function getStatusColor(estado: EstadoCaso): string {
    switch (estado) {
        case "Nuevo": return '#0E1049'; // Penn Blue
        case "Pendiente Informe": return '#2F4550'; // Charcoal
        case "Esperando Archivos": return '#586F7C'; // Payne's gray
        case "En Análisis": return '#B8DBD9'; // Light blue
        case "Cerrada": return '#F4F4F9'; // Ghost white
        default: return '#D3D3D3'; // Color por defecto
    }
}

interface Grupo {
  ID_Grupo: number;
  Nombre: string;
  Descripcion?: string | null;
  Fecha_Creacion?: string;
  casos?: number;
}

// NUEVO: Tipo para los valores del formulario, ID_Grupo es string aquí
interface CasoFormValues {
  Nombre_del_Caso: string;
  Año: number; // Mantine NumberInput devuelve number
  Descripcion?: string | null;
  NIV?: string | null;
  ID_Grupo?: string; // ID_Grupo es string en el formulario debido al Select
}

function isDarkColor(hex: string): boolean {
  // Simple check: si el color es #211951 o #6528F7, es oscuro
  return hex.toLowerCase() === '#211951' || hex.toLowerCase() === '#6528f7';
}

function CasosPage() {
  const [casos, setCasos] = useState<Caso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpened, { open: _openModal, close: _closeModal }] = useDisclosure(false);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [casoToDelete, setCasoToDelete] = useState<number | null>(null);
  const [deletingCasoId, setDeletingCasoId] = useState<number | null>(null);
  const [updatingEstadoCasoId, setUpdatingEstadoCasoId] = useState<number | null>(null);
  const [editingCasoId, setEditingCasoId] = useState<number | null>(null);
  const [reactivatingCasoId, setReactivatingCasoId] = useState<number | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // --- NUEVO: Estados para Filtro y Ordenación ---
  const [filterText, setFilterText] = useState('');
  const [sortStatus, setSortStatus] = useState<{ columnAccessor: string, direction: 'asc' | 'desc' }>({ columnAccessor: 'Fecha_de_Creacion', direction: 'desc' });

  // Usar CasoFormValues para el formulario
  const form = useForm<CasoFormValues>({
    initialValues: {
      Nombre_del_Caso: '',
      Año: new Date().getFullYear(),
      Descripcion: '',
      NIV: '',
      ID_Grupo: '', // ID_Grupo es string
    },
    validate: {
      Nombre_del_Caso: (value) => (value.trim().length > 0 ? null : 'El nombre del caso es obligatorio'),
      Año: (value) => (value > 1900 && value <= new Date().getFullYear() + 1 ? null : 'Introduce un año válido'),
      // value de ID_Grupo será string aquí
      ID_Grupo: (value, values) => (user?.Rol === 'superadmin' && (!value || value.trim() === '' || isNaN(Number(value))) ? 'Debe seleccionar un grupo para el caso' : null),
    },
  });

  useEffect(() => {
    fetchCasos();
    if (user?.Rol === 'superadmin') {
        fetchGrupos();
    }
  }, [user?.Rol]);

  const fetchCasos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCasos();
      // Ordenar los casos por estado según CASE_STATUSES
      const sortedData = [...data].sort((a, b) => {
        const indexA = CASE_STATUSES.indexOf(a.Estado);
        const indexB = CASE_STATUSES.indexOf(b.Estado);
        return indexA - indexB;
      });
      setCasos(sortedData);
    } catch (err) {
      setError('Error al cargar los casos. Inténtalo de nuevo.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGrupos = async () => {
    if (user?.Rol !== 'superadmin') {
      setGrupos([]); // No es superadmin, no necesita la lista completa
      return;
    }
    setLoadingGrupos(true);
    try {
      // Usar apiClient para incluir el token JWT automáticamente
      const response = await apiClient.get<Grupo[]>('/api/grupos');
      setGrupos(response.data);
    } catch (e: any) {
      console.error("Error fetching grupos:", e);
      notifications.show({
        title: 'Error al cargar grupos',
        message: e.response?.data?.detail || e.message || 'No se pudieron obtener los grupos para el superadmin.',
        color: 'red',
      });
      setGrupos([]); // En caso de error, asegurar que grupos sea un array vacío
    } finally {
      setLoadingGrupos(false);
    }
  };

  // Cuando los grupos se cargan y el modal está abierto, asignar el primer grupo si no hay valor y es superadmin en modo CREACIÓN
  React.useEffect(() => {
    if (
      user?.Rol === 'superadmin' &&
      createModalOpened &&
      !editingCasoId &&
      grupos.length > 0 &&
      (!form.values.ID_Grupo || form.values.ID_Grupo.trim() === '')
    ) {
      form.setFieldValue('ID_Grupo', String(grupos[0].ID_Grupo)); // setFieldValue con string
    }
  }, [user?.Rol, createModalOpened, editingCasoId, grupos, form]);

  // Esta función ahora espera CasoFormValues, pero enviará CasoCreate
  const handleCreateCaso = async (formValues: CasoFormValues) => {
    try {
      const idGrupoParaApi = user?.Rol === 'superadmin' 
        ? (formValues.ID_Grupo ? Number(formValues.ID_Grupo) : undefined) // Convertir string a number
        : user?.grupo?.ID_Grupo;

      if (idGrupoParaApi === undefined || idGrupoParaApi === null || isNaN(idGrupoParaApi)) {
        notifications.show({ title: 'Error', message: 'El grupo asignado no es válido.', color: 'red' });
        return;
      }
      const dataToSend: CasoCreate = { 
        Nombre_del_Caso: formValues.Nombre_del_Caso,
        Año: Number(formValues.Año) || 0,
        NIV: formValues.NIV,
        Descripcion: formValues.Descripcion,
        ID_Grupo: idGrupoParaApi, // number
      };
      console.log('Enviando caso para crear:', dataToSend);
      await createCaso(dataToSend);
      notifications.show({
        title: 'Caso Creado',
        message: `El caso "${formValues.Nombre_del_Caso}" ha sido creado exitosamente.`,
        color: 'green',
      });
      form.reset();
      _closeModal();
      fetchCasos();
    } catch (err: any) {
      let errorMessage = 'Error al crear el caso.';
      if (err.response && err.response.data && err.response.data.detail) {
        errorMessage = `${errorMessage} ${err.response.data.detail}`;
      }
      notifications.show({
        title: 'Error',
        message: errorMessage,
        color: 'red',
      });
    }
  };

  const handleDeleteCaso = async (casoId: number) => {
    setCasoToDelete(casoId);
    openDeleteModal();
  };

  const confirmDeleteCaso = async () => {
    if (!casoToDelete) return;
    
    setDeletingCasoId(casoToDelete);
    try {
        await deleteCaso(casoToDelete);
        notifications.show({
            title: 'Caso Eliminado',
            message: `El caso ID ${casoToDelete} y todos sus datos asociados han sido eliminados correctamente.`,
            color: 'teal'
        });
        setCasos(prevList => prevList.filter(caso => caso.ID_Caso !== casoToDelete));
    } catch (err: any) {
         console.error("Error al eliminar caso:", err);
         let errorMessage = err.response?.data?.detail || err.message || 'No se pudo eliminar el caso.';
         notifications.show({
            title: 'Error al Eliminar',
            message: errorMessage,
            color: 'red'
         });
    } finally {
        setDeletingCasoId(null);
        closeDeleteModal();
        setCasoToDelete(null);
    }
  };

  const handleEstadoChange = async (casoId: number, nuevoEstado: string | null) => {
      if (!nuevoEstado) return;

      setUpdatingEstadoCasoId(casoId);
      const estadoAnterior = casos.find(c => c.ID_Caso === casoId)?.Estado;

      // Actualización optimista del UI
      setCasos(prevCasos => prevCasos.map(c =>
          c.ID_Caso === casoId ? { ...c, Estado: nuevoEstado as EstadoCaso } : c
      ));

      try {
          await updateCasoEstado(casoId, nuevoEstado as EstadoCaso);
          // Opcional: No mostrar notificación de éxito para reducir ruido
      } catch (error: any) {
          notifications.show({
              title: 'Error al Actualizar Estado',
              message: `No se pudo actualizar el estado del caso ${casoId}. Revirtiendo cambio.`,
              color: 'red'
          });
          // Revertir cambio visual si la API falla
          setCasos(prevCasos => prevCasos.map(c =>
              c.ID_Caso === casoId ? { ...c, Estado: estadoAnterior || 'Nuevo' as EstadoCaso } : c
          ));
      } finally {
          setUpdatingEstadoCasoId(null); // Finalizar carga
      }
  };

  const handleReactivateCaso = async (casoId: number) => {
    setReactivatingCasoId(casoId);
    try {
      await updateCasoEstado(casoId, "Nuevo");
      notifications.show({
        title: 'Caso Reactivado',
        message: 'El caso ha sido reactivado exitosamente.',
        color: 'green'
      });
      fetchCasos(); // Recargar la lista para ver los cambios
    } catch (error: any) {
      notifications.show({
        title: 'Error al Reactivar',
        message: 'No se pudo reactivar el caso.',
        color: 'red'
      });
    } finally {
      setReactivatingCasoId(null);
    }
  };

  // --- NUEVO: Lógica de Filtrado y Ordenación ---
  const filteredAndSortedCasos = useMemo(() => {
    let filtered = casos;

    // Filtrado
    if (filterText.trim()) {
      const lowerFilter = filterText.toLowerCase().trim();
      filtered = casos.filter(caso => 
        caso.Nombre_del_Caso.toLowerCase().includes(lowerFilter) ||
        String(caso.Año).includes(lowerFilter) ||
        (caso.NIV && caso.NIV.toLowerCase().includes(lowerFilter)) ||
        (caso.Descripcion && caso.Descripcion.toLowerCase().includes(lowerFilter))
      );
    }

    // Separar casos cerrados y activos
    const activeCases = filtered.filter(caso => caso.Estado !== 'Cerrada');
    const closedCases = filtered.filter(caso => caso.Estado === 'Cerrada');

    // Ordenación usando sortStatus
    const sortKey = sortStatus.columnAccessor;
    const sortDir = sortStatus.direction;
    const getValue = (obj: any, key: string) => obj[key];
    const sortedActive = [...activeCases].sort((a, b) => {
      const aValue = getValue(a, sortKey);
      const bValue = getValue(b, sortKey);
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDir === 'asc' ? aValue - bValue : bValue - aValue;
      }
      return sortDir === 'asc'
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue));
    });
    const sortedClosed = [...closedCases].sort((a, b) => {
      const aValue = getValue(a, sortKey);
      const bValue = getValue(b, sortKey);
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDir === 'asc' ? aValue - bValue : bValue - aValue;
      }
      return sortDir === 'asc'
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue));
    });

    return { active: sortedActive, closed: sortedClosed };
  }, [casos, filterText, sortStatus]);

  // --- NUEVO: Handlers unificados para Modal --- 
  const openCreateModal = () => {
    form.reset();
    setEditingCasoId(null);
    if (user?.Rol === 'superadmin' && grupos.length > 0) {
      form.setFieldValue('ID_Grupo', String(grupos[0].ID_Grupo));
    }
    _openModal();
  };

  const openEditModal = (caso: Caso) => {
    setEditingCasoId(caso.ID_Caso);
    form.setValues({
      Nombre_del_Caso: caso.Nombre_del_Caso,
      Año: caso.Año,
      Descripcion: caso.Descripcion || '',
      NIV: caso.NIV || '',
      ID_Grupo: (user?.Rol === 'superadmin' && (caso as any).ID_Grupo !== undefined && (caso as any).ID_Grupo !== null) ? String((caso as any).ID_Grupo) : '', // setValues con string
    });
    _openModal();
  };

  const closeModal = () => {
    form.reset();
    setEditingCasoId(null);
    _closeModal();
  };

  // Esta función también espera CasoFormValues
  const handleUpdateCaso = async (id: number, formValues: CasoFormValues) => {
    const idGrupoParaApi = user?.Rol === 'superadmin' && formValues.ID_Grupo 
        ? Number(formValues.ID_Grupo) // Convertir string a number
        : undefined; 

    const dataToSendUpdate: Partial<CasoCreate> = { 
      Nombre_del_Caso: formValues.Nombre_del_Caso,
      Año: Number(formValues.Año) || 0,
      NIV: formValues.NIV,
      Descripcion: formValues.Descripcion,
    };

    if (user?.Rol === 'superadmin' && idGrupoParaApi !== undefined && !isNaN(idGrupoParaApi)) {
        (dataToSendUpdate as CasoCreate).ID_Grupo = idGrupoParaApi; // number
    }

    console.log('Enviando caso para actualizar:', dataToSendUpdate);
    try {
      await updateCaso(id, dataToSendUpdate as CasoCreate); 
      notifications.show({
        title: 'Caso Actualizado',
        message: `El caso "${formValues.Nombre_del_Caso}" ha sido actualizado.`,
        color: 'blue',
      });
      closeModal();
      fetchCasos();
    } catch (err: any) {
      let errorMessage = 'Error al actualizar el caso.';
      if (err.response && err.response.data && err.response.data.detail) {
        errorMessage = `${errorMessage} ${err.response.data.detail}`;
      }
      notifications.show({
        title: 'Error',
        message: errorMessage,
        color: 'red',
      });
    }
  };

  // Ahora el tipo de values es CasoFormValues
  const handleFormSubmit = async (values: CasoFormValues) => {
    if (editingCasoId) {
      await handleUpdateCaso(editingCasoId, values);
    } else {
      await handleCreateCaso(values);
    }
  };

  // --- Renderizado --- 
  return (
    <Box style={{ paddingLeft: 32, paddingRight: 32, paddingBottom: 0, marginBottom: 0 }}>
      <Title order={2} mb="xl">Investigaciones</Title>

      {/* --- Barra de Filtro, Selector de Vista y Botón Crear --- */}
      <Group justify="space-between" mb="lg">
          <Group>
          <TextInput
              placeholder="Buscar por nombre, año, NIV, descripción..."
              leftSection={<IconSearch size={14} />}
              value={filterText}
              onChange={(event) => setFilterText(event.currentTarget.value)}
                  style={{ width: '400px' }}
              />
              <SegmentedControl
                  value={viewMode}
                  onChange={(value) => setViewMode(value as 'table' | 'grid')}
                  data={[
                      { label: 'Tabla', value: 'table' },
                      { label: 'Grid', value: 'grid' }
                  ]}
              />
          </Group>
          <Group>
              {viewMode === 'grid' && (
                  <Menu shadow="md" width={200}>
                      <Menu.Target>
                        <Button 
                              variant="light" 
                              leftSection={
                                  sortStatus.columnAccessor === 'Nombre_del_Caso' ? (
                                      sortStatus.direction === 'asc' ? <IconSortAscending size={16} /> : <IconSortDescending size={16} />
                                  ) : sortStatus.columnAccessor === 'Fecha_de_Creacion' ? (
                                      sortStatus.direction === 'asc' ? <IconSortAscending size={16} /> : <IconSortDescending size={16} />
                                  ) : sortStatus.columnAccessor === 'Año' ? (
                                      sortStatus.direction === 'asc' ? <IconSortAscending size={16} /> : <IconSortDescending size={16} />
                                  ) : sortStatus.columnAccessor === 'Estado' ? (
                                      sortStatus.direction === 'asc' ? <IconSortAscending size={16} /> : <IconSortDescending size={16} />
                                  ) : (
                                      <IconArrowsUpDown size={16} />
                                  )
                              }
                          >
                              Ordenar por
                         </Button>
                      </Menu.Target>
                      <Menu.Dropdown>
                          <Menu.Item
                              leftSection={<IconSortAscending size={16} />}
                              onClick={() => setSortStatus({
                                  columnAccessor: 'Nombre_del_Caso',
                                  direction: 'asc'
                              })}
                          >
                              Nombre (A-Z)
                          </Menu.Item>
                          <Menu.Item
                              leftSection={<IconSortDescending size={16} />}
                              onClick={() => setSortStatus({
                                  columnAccessor: 'Nombre_del_Caso',
                                  direction: 'desc'
                              })}
                          >
                              Nombre (Z-A)
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item
                              leftSection={<IconSortAscending size={16} />}
                              onClick={() => setSortStatus({
                                  columnAccessor: 'Fecha_de_Creacion',
                                  direction: 'asc'
                              })}
                          >
                              Fecha (Antiguo-Nuevo)
                          </Menu.Item>
                          <Menu.Item
                              leftSection={<IconSortDescending size={16} />}
                              onClick={() => setSortStatus({
                                  columnAccessor: 'Fecha_de_Creacion',
                                  direction: 'desc'
                              })}
                          >
                              Fecha (Nuevo-Antiguo)
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item
                              leftSection={<IconSortAscending size={16} />}
                              onClick={() => setSortStatus({
                                  columnAccessor: 'Año',
                                  direction: 'asc'
                              })}
                          >
                              Año (Ascendente)
                          </Menu.Item>
                          <Menu.Item
                              leftSection={<IconSortDescending size={16} />}
                              onClick={() => setSortStatus({
                                  columnAccessor: 'Año',
                                  direction: 'desc'
                              })}
                          >
                              Año (Descendente)
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item
                              leftSection={<IconSortAscending size={16} />}
                              onClick={() => setSortStatus({
                                  columnAccessor: 'Estado',
                                  direction: 'asc'
                              })}
                          >
                              Estado (A-Z)
                          </Menu.Item>
                          <Menu.Item
                              leftSection={<IconSortDescending size={16} />}
                              onClick={() => setSortStatus({
                                  columnAccessor: 'Estado',
                                  direction: 'desc'
                              })}
                          >
                              Estado (Z-A)
                          </Menu.Item>
                      </Menu.Dropdown>
                  </Menu>
              )}
              <Button 
                  leftSection={<IconPlus size={14} />} 
                  onClick={openCreateModal}
              >
                    Crear Nuevo Caso
                </Button>
          </Group>
      </Group>

      {loading && <Loader />}
      {error && <Alert title="Error" color="red" icon={<IconAlertCircle />}>{error}</Alert>}

      {!loading && !error && (
          <>
              {/* Casos Activos */}
              {viewMode === 'table' ? (
                <DataTable
                  withTableBorder
                  striped
                  highlightOnHover
                  verticalSpacing="md"
                  rowStyle={record => ({
                    borderLeft: `6px solid ${getStatusColor(record.Estado)}`,
                    background: 'var(--mantine-color-gray-0)',
                    minHeight: 64,
                    marginBottom: 12,
                    borderRadius: 10,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  })}
                  records={filteredAndSortedCasos.active}
                  columns={[
                    {
                      accessor: 'Nombre_del_Caso',
                      title: 'Nombre del Caso',
                      sortable: true,
                      width: 260,
                      render: (caso) => (
                        <Group align="flex-start" gap="md">
                          <ThemeIcon color={getStatusColor(caso.Estado)} size={38} radius="xl" style={{ background: getStatusColor(caso.Estado) }}>
                            <IconFolder size={22} />
                          </ThemeIcon>
                          <Box>
                            <Text size="lg" fw={700} style={{ lineHeight: 1.1 }}>{caso.Nombre_del_Caso}</Text>
                            <Text size="sm" c="dimmed" mt={2}>
                              Año: <b>{caso.Año}</b> &nbsp;|&nbsp; NIV: <b>{caso.NIV || '-'}</b>
                            </Text>
                          </Box>
                        </Group>
                      )
                    },
                    {
                      accessor: 'Año',
                      title: 'Año',
                      sortable: true,
                      width: 90,
                      render: (caso) => <Text size="md">{caso.Año}</Text>
                    },
                    {
                      accessor: 'Fecha_de_Creacion',
                      title: 'Fecha de Creación',
                      sortable: true,
                      width: 160,
                      render: (caso) => <Text size="sm">{new Date(caso.Fecha_de_Creacion).toLocaleDateString()}</Text>
                    },
                    {
                      accessor: 'Descripcion',
                      title: 'Descripción',
                      sortable: true,
                      width: 280,
                      render: (caso) => (
                        <Tooltip label={caso.Descripcion || 'Sin descripción'} multiline w={300}>
                          <Text lineClamp={2} style={{ maxWidth: 200 }}>
                            {caso.Descripcion || 'Sin descripción'}
                          </Text>
                        </Tooltip>
                      )
                    },
                    {
                      accessor: 'Estado',
                      title: 'Estado',
                      sortable: true,
                      width: 180,
                      render: (caso) => {
                        const color = getStatusColor(caso.Estado);
                        return (
                          <Select
                            size="xs"
                            data={CASE_STATUSES.map(status => ({ value: status, label: status }))}
                            value={caso.Estado}
                            onChange={(value) => handleEstadoChange(caso.ID_Caso, value)}
                            disabled={updatingEstadoCasoId === caso.ID_Caso}
                            styles={{
                              input: {
                                borderColor: color,
                                backgroundColor: color,
                                color: 'white',
                                fontWeight: 500
                              }
                            }}
                          />
                        );
                      }
                    },
                    {
                      accessor: 'actions',
                      title: 'Acciones',
                      width: 120,
                      render: (caso) => (
                        <Group gap="xs">
                          <Tooltip label="Ver Detalles">
                            <ActionIcon 
                              variant="light" 
                              color="blue" 
                              onClick={() => navigate(`/casos/${caso.ID_Caso}`)}
                              size="lg"
                            >
                              <IconEye size={20} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Editar Caso">
                            <ActionIcon 
                              variant="light" 
                              color="gray" 
                              onClick={() => openEditModal(caso)}
                              size="lg"
                            >
                              <IconPencil size={20} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Eliminar Caso">
                            <ActionIcon 
                              variant="light" 
                              color="red" 
                              onClick={() => handleDeleteCaso(caso.ID_Caso)}
                              loading={deletingCasoId === caso.ID_Caso}
                              size="lg"
                            >
                              <IconTrash size={20} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      ),
                    }
                  ]}
                  sortStatus={sortStatus}
                  onSortStatusChange={setSortStatus}
                />
              ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                  {filteredAndSortedCasos.active.map((caso) => (
                      <Card 
                          key={caso.ID_Caso} 
                          shadow="sm" 
                          padding="lg" 
                          radius="md" 
                          withBorder 
                          style={{
                        borderLeft: `6px solid ${getStatusColor(caso.Estado)}`,
                        background: 'var(--mantine-color-gray-0)',
                      }}
                    >
                      <Group align="flex-start" gap="md">
                        <ThemeIcon color={getStatusColor(caso.Estado)} size={38} radius="xl" style={{ background: getStatusColor(caso.Estado) }}>
                          <IconFolder size={22} />
                        </ThemeIcon>
                        <Box style={{ flex: 1 }}>
                          <Text size="lg" fw={700} style={{ lineHeight: 1.1 }}>{caso.Nombre_del_Caso}</Text>
                          <Text size="sm" c="dimmed" mt={2}>
                            Año: <b>{caso.Año}</b> &nbsp;|&nbsp; NIV: <b>{caso.NIV || '-'}</b>
                                          </Text>
                          <Text size="sm" mt={4}>
                            Fecha: {new Date(caso.Fecha_de_Creacion).toLocaleDateString()}
                          </Text>
                          <Tooltip label={caso.Descripcion || 'Sin descripción'} multiline w={300}>
                            <Text size="sm" lineClamp={2} mt={4}>
                                  {caso.Descripcion || 'Sin descripción'}
                              </Text>
                          </Tooltip>
                          <Group mt="md" gap="xs">
                                <Select
                                    size="xs"
                                    data={CASE_STATUSES.map(status => ({ value: status, label: status }))}
                                    value={caso.Estado}
                              onChange={(value) => handleEstadoChange(caso.ID_Caso, value)}
                                    disabled={updatingEstadoCasoId === caso.ID_Caso}
                              styles={{
                                input: {
                                  borderColor: getStatusColor(caso.Estado),
                                  backgroundColor: getStatusColor(caso.Estado),
                                  color: 'white',
                                  fontWeight: 500
                                }
                              }}
                            />
                            <Group gap="xs" ml="auto">
                              <Tooltip label="Ver Detalles">
                                <ActionIcon 
                                  variant="light" 
                                  color="blue" 
                                  onClick={() => navigate(`/casos/${caso.ID_Caso}`)}
                                  size="lg"
                                >
                                  <IconEye size={20} />
                                </ActionIcon>
                              </Tooltip>
                                  <Tooltip label="Editar Caso">
                                <ActionIcon 
                                  variant="light" 
                                  color="gray" 
                                  onClick={() => openEditModal(caso)}
                                  size="lg"
                                >
                                  <IconPencil size={20} />
                                      </ActionIcon>
                                  </Tooltip>
                                  <Tooltip label="Eliminar Caso">
                                      <ActionIcon 
                                          variant="light" 
                                          color="red" 
                                  onClick={() => handleDeleteCaso(caso.ID_Caso)}
                                          loading={deletingCasoId === caso.ID_Caso}
                                  size="lg"
                                      >
                                  <IconTrash size={20} />
                                      </ActionIcon>
                                  </Tooltip>
                              </Group>
                          </Group>
                        </Box>
                          </Group>
                      </Card>
                  ))}
              </SimpleGrid>
              )}

              {/* Separador y Casos Cerrados */}
              {filteredAndSortedCasos.closed?.length > 0 && (
                  <>
                      <Divider 
                          label="Casos Cerrados" 
                          labelPosition="center" 
                          mt="xl"
                          mb="md"
                          styles={{
                              label: {
                                  fontSize: 'var(--mantine-font-size-sm)',
                                  fontWeight: 500
                              }
                          }}
                      />
                      {viewMode === 'table' ? (
                        <DataTable
                          withTableBorder
                          striped
                          highlightOnHover
                          verticalSpacing="md"
                          rowStyle={record => ({
                            borderLeft: `6px solid ${getStatusColor(record.Estado)}`,
                            background: 'var(--mantine-color-gray-0)',
                            minHeight: 64,
                            marginBottom: 12,
                            borderRadius: 10,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                          })}
                          records={filteredAndSortedCasos.closed}
                          columns={[
                            {
                              accessor: 'Nombre_del_Caso',
                              title: 'Nombre del Caso',
                              sortable: true,
                              width: 260,
                              render: (caso) => (
                                <Group align="flex-start" gap="md">
                                  <ThemeIcon color={getStatusColor(caso.Estado)} size={38} radius="xl" style={{ background: getStatusColor(caso.Estado) }}>
                                    <IconFolder size={22} />
                                  </ThemeIcon>
                                  <Box>
                                    <Text size="lg" fw={700} style={{ lineHeight: 1.1 }}>{caso.Nombre_del_Caso}</Text>
                                    <Text size="sm" c="dimmed" mt={2}>
                                      Año: <b>{caso.Año}</b> &nbsp;|&nbsp; NIV: <b>{caso.NIV || '-'}</b>
                                    </Text>
                                  </Box>
                                </Group>
                              )
                            },
                            {
                              accessor: 'Año',
                              title: 'Año',
                              sortable: true,
                              width: 90,
                              render: (caso) => <Text size="md">{caso.Año}</Text>
                            },
                            {
                              accessor: 'Fecha_de_Creacion',
                              title: 'Fecha de Creación',
                              sortable: true,
                              width: 160,
                              render: (caso) => <Text size="sm">{new Date(caso.Fecha_de_Creacion).toLocaleDateString()}</Text>
                            },
                            {
                              accessor: 'Descripcion',
                              title: 'Descripción',
                              sortable: true,
                              width: 280,
                              render: (caso) => (
                                <Tooltip label={caso.Descripcion || 'Sin descripción'} multiline w={300}>
                                  <Text lineClamp={2} style={{ maxWidth: 200 }}>
                                    {caso.Descripcion || 'Sin descripción'}
                                  </Text>
                                </Tooltip>
                              )
                            },
                            {
                              accessor: 'actions',
                              title: 'Acciones',
                              width: 160,
                              render: (caso) => (
                                <Group gap="xs">
                                  <Tooltip label="Reactivar Caso">
                                    <ActionIcon 
                                      variant="light" 
                                      color="green" 
                                      onClick={() => handleReactivateCaso(caso.ID_Caso)}
                                      loading={reactivatingCasoId === caso.ID_Caso}
                                      size="lg"
                                    >
                                      <IconRefresh size={20} />
                                    </ActionIcon>
                                  </Tooltip>
                                  <Tooltip label="Ver Detalles">
                                    <ActionIcon 
                                      variant="light" 
                                      color="blue" 
                                      onClick={() => navigate(`/casos/${caso.ID_Caso}`)}
                                      size="lg"
                                    >
                                      <IconEye size={20} />
                                    </ActionIcon>
                                  </Tooltip>
                                  <Tooltip label="Eliminar Caso">
                                    <ActionIcon 
                                      variant="light" 
                                      color="red" 
                                      onClick={() => handleDeleteCaso(caso.ID_Caso)}
                                      loading={deletingCasoId === caso.ID_Caso}
                                      size="lg"
                                    >
                                      <IconTrash size={20} />
                                    </ActionIcon>
                                  </Tooltip>
                                </Group>
                              ),
                            }
                          ]}
                          sortStatus={sortStatus}
                          onSortStatusChange={setSortStatus}
                        />
                      ) : (
                        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                          {filteredAndSortedCasos.closed.map((caso) => (
                              <Card 
                                  key={caso.ID_Caso} 
                                  shadow="sm" 
                                  padding="lg" 
                                  radius="md" 
                                  withBorder 
                                  style={{
                                borderLeft: `6px solid ${getStatusColor(caso.Estado)}`,
                                background: 'var(--mantine-color-gray-0)',
                              }}
                            >
                              <Group align="flex-start" gap="md">
                                <ThemeIcon color={getStatusColor(caso.Estado)} size={38} radius="xl" style={{ background: getStatusColor(caso.Estado) }}>
                                  <IconFolder size={22} />
                                </ThemeIcon>
                                <Box style={{ flex: 1 }}>
                                  <Text size="lg" fw={700} style={{ lineHeight: 1.1 }}>{caso.Nombre_del_Caso}</Text>
                                  <Text size="sm" c="dimmed" mt={2}>
                                    Año: <b>{caso.Año}</b> &nbsp;|&nbsp; NIV: <b>{caso.NIV || '-'}</b>
                                                  </Text>
                                  <Text size="sm" mt={4}>
                                    Fecha: {new Date(caso.Fecha_de_Creacion).toLocaleDateString()}
                                  </Text>
                                  <Tooltip label={caso.Descripcion || 'Sin descripción'} multiline w={300}>
                                    <Text size="sm" lineClamp={2} mt={4}>
                                          {caso.Descripcion || 'Sin descripción'}
                                      </Text>
                                  </Tooltip>
                                  <Group mt="md" gap="xs">
                                    <Group gap="xs" ml="auto">
                                      <Tooltip label="Reactivar Caso">
                                          <ActionIcon 
                                              variant="light" 
                                              color="green" 
                                              onClick={() => handleReactivateCaso(caso.ID_Caso)} 
                                              loading={reactivatingCasoId === caso.ID_Caso}
                                          size="lg"
                                          >
                                          <IconRefresh size={20} />
                                          </ActionIcon>
                                      </Tooltip>
                                      <Tooltip label="Ver Detalles">
                                        <ActionIcon 
                                          variant="light" 
                                          color="blue" 
                                          onClick={() => navigate(`/casos/${caso.ID_Caso}`)}
                                          size="lg"
                                        >
                                          <IconEye size={20} />
                                          </ActionIcon>
                                      </Tooltip>
                                      <Tooltip label="Eliminar Caso">
                                          <ActionIcon 
                                              variant="light" 
                                              color="red" 
                                          onClick={() => handleDeleteCaso(caso.ID_Caso)}
                                              loading={deletingCasoId === caso.ID_Caso}
                                          size="lg"
                                          >
                                          <IconTrash size={20} />
                                          </ActionIcon>
                                      </Tooltip>
                                    </Group>
                                  </Group>
                                </Box>
                                  </Group>
                              </Card>
                          ))}
                      </SimpleGrid>
                      )}
                  </>
              )}
          </>
      )}

      {/* Modal Crear/Editar Caso */}
      <Modal
        opened={createModalOpened}
        onClose={closeModal}
        title={editingCasoId ? "Editar Caso" : "Crear Nuevo Caso"}
        centered
      >
         <form onSubmit={form.onSubmit(handleFormSubmit)}>
           <Stack>
             <TextInput
               required
               label="Nombre del Caso"
               placeholder="Ej: Investigación vehículo sospechoso"
               {...form.getInputProps('Nombre_del_Caso')}
             />
             <NumberInput
                required
                label="Año"
                placeholder="Año del caso"
                min={1900}
                max={new Date().getFullYear() + 1}
                {...form.getInputProps('Año')}
             />
             <TextInput
               label="NIV (Opcional)"
               placeholder="Número de Investigación"
               {...form.getInputProps('NIV')}
             />
             <Textarea
               label="Descripción (Opcional)"
               placeholder="Detalles relevantes sobre el caso"
               autosize
               minRows={2}
               {...form.getInputProps('Descripcion')}
             />
             {user?.Rol === 'superadmin' && (
               <Select
                 label="Grupo"
                 placeholder="Selecciona un grupo"
                 data={grupos.map(g => ({ value: String(g.ID_Grupo), label: g.Nombre }))} 
                 {...form.getInputProps('ID_Grupo')}
                 required
                 searchable
                 disabled={loadingGrupos || grupos.length === 0}
               />
             )}
             <Group justify="flex-end" mt="md">
               <Button variant="default" onClick={closeModal}>Cancelar</Button>
               <Button 
                 type="submit" 
                 disabled={ 
                   (user?.Rol === 'superadmin' && (loadingGrupos || grupos.length === 0 || !form.values.ID_Grupo || form.values.ID_Grupo.trim() === '' )) || 
                   !form.isValid() // form.isValid() se basará en CasoFormValues y su validación
                 }
               >
                 {editingCasoId ? "Guardar Cambios" : "Crear Caso"}
               </Button>
             </Group>
           </Stack>
         </form>
      </Modal>

      {/* Modal de Confirmación de Eliminación */}
      <Modal
        opened={deleteModalOpened}
        onClose={closeDeleteModal}
        title="Confirmar Eliminación"
        centered
      >
        <Stack>
          <Text>
            ¿Estás SEGURO de que quieres eliminar el caso ID {casoToDelete}?
          </Text>
          <Text c="red" size="sm">
            ¡ATENCIÓN! Esta acción eliminará permanentemente el caso, TODOS sus archivos importados y TODAS las lecturas asociadas. Esta acción NO se puede deshacer.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={closeDeleteModal}>
              Cancelar
            </Button>
            <Button 
              color="red" 
              onClick={confirmDeleteCaso}
              loading={deletingCasoId === casoToDelete}
            >
              Eliminar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}

export default CasosPage;