import React, { useState, useEffect, useMemo } from 'react';
// Imports necesarios, incluyendo Select
import { Tabs, Text, Box, Table, Button, Modal, TextInput, Textarea, Group, Loader, Alert, NumberInput, ActionIcon, Tooltip, Select, Card, SimpleGrid, SegmentedControl, Input, Title, Stack, ThemeIcon } from '@mantine/core';
import { IconList, IconPlus, IconAlertCircle, IconEye, IconTrash, IconLayoutGrid, IconSortAscending, IconSortDescending, IconSearch, IconPencil, IconArrowsUpDown } from '@tabler/icons-react'; // Icono Kanban eliminado
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useNavigate, Link } from 'react-router-dom';
import { getCasos, createCaso, deleteCaso, updateCasoEstado, updateCaso } from '../services/casosApi';
// Asumimos que el tipo EstadoCaso se resolverá después de reiniciar el entorno
import type { Caso, CasoCreate, EstadoCaso } from '../types/data';
import dayjs from 'dayjs'; // Para formatear fecha
import _ from 'lodash'; // Para ordenar

// Lista de estados válidos
const CASE_STATUSES: EstadoCaso[] = [
    "Nuevo",
    "Esperando Archivos",
    "En Análisis",
    "Pendiente Informe",
    "Cerrado"
];

// --- Tipos para Ordenación ---
type SortField = 'Fecha_de_Creacion' | 'Nombre_del_Caso' | 'Año';
type SortDirection = 'asc' | 'desc';

// --- NUEVO: Función para obtener color según estado ---
function getStatusColor(estado: EstadoCaso): string {
    switch (estado) {
        case "Nuevo": return 'green';
        case "Esperando Archivos": return 'blue';
        case "En Análisis": return 'orange';
        case "Pendiente Informe": return 'red';
        case "Cerrado": return 'gray';
        default: return 'gray'; // Color por defecto
    }
}

function CasosPage() {
  const [casos, setCasos] = useState<Caso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpened, { open: _openModal, close: _closeModal }] = useDisclosure(false);
  const [deletingCasoId, setDeletingCasoId] = useState<number | null>(null);
  const [updatingEstadoCasoId, setUpdatingEstadoCasoId] = useState<number | null>(null);
  const [editingCasoId, setEditingCasoId] = useState<number | null>(null);
  const navigate = useNavigate();

  // --- NUEVO: Estados para Filtro y Ordenación ---
  const [filterText, setFilterText] = useState('');
  const [sortField, setSortField] = useState<SortField>('Fecha_de_Creacion');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const form = useForm<CasoCreate>({
    initialValues: {
      Nombre_del_Caso: '',
      Año: new Date().getFullYear(),
      Descripcion: '',
      NIV: '',
      // Estado no necesita valor inicial aquí, el backend lo pone
    },
    validate: {
      Nombre_del_Caso: (value) => (value.trim().length > 0 ? null : 'El nombre del caso es obligatorio'),
      Año: (value) => (value > 1900 && value <= new Date().getFullYear() + 1 ? null : 'Introduce un año válido'),
    },
  });

  useEffect(() => {
    fetchCasos();
  }, []);

  const fetchCasos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCasos();
      setCasos(data);
    } catch (err) {
      setError('Error al cargar los casos. Inténtalo de nuevo.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCaso = async (values: CasoCreate) => {
    try {
      const dataToSend = {
        ...values,
        Año: Number(values.Año) || 0,
        // Estado se asigna por defecto en el backend
      };
      await createCaso(dataToSend);
      notifications.show({
        title: 'Caso Creado',
        message: `El caso "${values.Nombre_del_Caso}" ha sido creado exitosamente.`,
        color: 'green',
      });
      form.reset();
      _closeModal();
      fetchCasos(); // Recargar la lista
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
    if (!window.confirm(`¿Estás SEGURO de que quieres eliminar el caso ID ${casoId}? \n\n¡ATENCIÓN! Esta acción eliminará permanentemente el caso, TODOS sus archivos importados y TODAS las lecturas asociadas. Esta acción NO se puede deshacer.`)) {
      return;
    }
    setDeletingCasoId(casoId);
    try {
        await deleteCaso(casoId);
        notifications.show({
            title: 'Caso Eliminado',
            message: `El caso ID ${casoId} y todos sus datos asociados han sido eliminados correctamente.`,
            color: 'teal'
        });
        setCasos(prevList => prevList.filter(caso => caso.ID_Caso !== casoId));
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

    // Ordenación
    const sorted = _.orderBy(filtered, [sortField], [sortDirection]);

    return sorted;
  }, [casos, filterText, sortField, sortDirection]);

  // --- NUEVO: Handlers unificados para Modal --- 
  const openCreateModal = () => {
    form.reset(); // Limpiar form
    setEditingCasoId(null); // Asegurar modo creación
    _openModal(); // Abrir modal
  };

  const openEditModal = (caso: Caso) => {
    setEditingCasoId(caso.ID_Caso); // Guardar ID del caso a editar
    // Llenar form con datos existentes (asegurar que los nombres coinciden)
    form.setValues({
      Nombre_del_Caso: caso.Nombre_del_Caso,
      Año: caso.Año,
      Descripcion: caso.Descripcion || '',
      NIV: caso.NIV || '' 
    });
    _openModal(); // Abrir modal
  };

  const closeModal = () => {
    form.reset(); // Limpiar form al cerrar
    setEditingCasoId(null); // Resetear modo edición
    _closeModal(); // Cerrar modal
  };

  // --- Handler para Actualizar Caso (CONECTADO A API) --- 
  const handleUpdateCaso = async (id: number, values: CasoCreate) => {
    // Opcional: Podríamos enviar solo los campos modificados
    // pero por simplicidad enviamos todos los del form
    const dataToSend = { 
        ...values,
        Año: Number(values.Año) || 0, // Asegurar que Año es número
    };
    console.log("Actualizando caso:", id, dataToSend);

    try {
        await updateCaso(id, dataToSend);
        notifications.show({
            title: 'Caso Actualizado',
            message: `El caso "${values.Nombre_del_Caso}" ha sido actualizado.`,
            color: 'blue',
        });
        closeModal(); // Cerrar modal al éxito
        fetchCasos(); // Recargar la lista para ver cambios
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

  // --- NUEVO: Handler unificado para Submit del Formulario --- 
  const handleFormSubmit = async (values: CasoCreate) => {
    if (editingCasoId) {
      // Modo Edición
      await handleUpdateCaso(editingCasoId, values);
    } else {
      // Modo Creación
      await handleCreateCaso(values);
    }
  };

  // --- Renderizado --- 
  return (
    <Box>
      <Title order={2} mb="xl">Gestión de Casos</Title>

      {/* --- Barra de Filtro y Botón Crear --- */}
      <Group justify="space-between" mb="lg">
          <TextInput
              placeholder="Buscar por nombre, año, NIV, descripción..."
              leftSection={<IconSearch size={14} />}
              value={filterText}
              onChange={(event) => setFilterText(event.currentTarget.value)}
              style={{ flexGrow: 1, maxWidth: '400px' }} // Ajusta el ancho si es necesario
          />
          <Group>
               {/* --- Reemplazar ActionIcon por Button con texto del campo actual --- */}
               {(() => { // IIFE para lógica de texto y ciclo
                   let currentFieldLabel = '';
                   if (sortField === 'Fecha_de_Creacion') currentFieldLabel = 'Fecha Creación';
                   else if (sortField === 'Nombre_del_Caso') currentFieldLabel = 'Nombre';
                   else currentFieldLabel = 'Año';
                   
                   return (
                        <Button 
                            variant="default"
                            size="xs" // Tamaño similar a los ActionIcon
                            // Modificar onClick para ciclar entre 3 campos
                            onClick={() => setSortField(prev => {
                                if (prev === 'Fecha_de_Creacion') return 'Nombre_del_Caso';
                                if (prev === 'Nombre_del_Caso') return 'Año';
                                return 'Fecha_de_Creacion'; // Volver a Fecha desde Año
                            })}
                        >
                             Ordenar por: {currentFieldLabel}
                         </Button>
                   );
               })()}
                {/* --- Fin Reemplazo --- */}
                {/* Botón Ordenar Dirección (sin cambios) */}
                <Tooltip label={`Orden ${sortDirection === 'asc' ? 'Descendente' : 'Ascendente'}`}>
                    <ActionIcon variant="default" size="xs" onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}>
                        {sortDirection === 'asc' ? <IconSortAscending size={16} /> : <IconSortDescending size={16} />}
                    </ActionIcon>
                 </Tooltip>
                <Button leftSection={<IconPlus size={14} />} onClick={openCreateModal}>
                    Crear Nuevo Caso
                </Button>
          </Group>
      </Group>

      {loading && <Loader />}
      {error && <Alert title="Error" color="red" icon={<IconAlertCircle />}>{error}</Alert>}

      {!loading && !error && (
          <SimpleGrid
              cols={{ base: 1, sm: 2, md: 3, lg: 4 }} // Ajusta las columnas según necesites
              spacing="lg"
          >
              {filteredAndSortedCasos.map((caso) => (
                  <Card 
                      key={caso.ID_Caso} 
                      shadow="sm" 
                      padding="lg" 
                      radius="md" 
                      withBorder 
                      style={{
                          cursor: 'pointer',
                          borderLeft: `5px solid var(--mantine-color-${getStatusColor(caso.Estado)}-6)` // Borde izquierdo con color de estado
                      }}
                  >
                       {/* Envolver contenido principal con Link */}
                       <Link to={`/casos/detalle/${caso.ID_Caso}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                            <Group justify="space-between" mt="md" mb="xs">
                                <Text fw={500} size="lg" truncate>{caso.Nombre_del_Caso}</Text>
                                {/* Quitar o mantener ThemeIcon opcionalmente, por ahora lo dejamos comentado 
                                <Tooltip label={`Estado: ${caso.Estado || 'No definido'}`}>
                                    <ThemeIcon color={getStatusColor(caso.Estado)} size="xs" radius="xl">
                                    </ThemeIcon>
                                </Tooltip> */}
                            </Group>

                            <Text size="sm" c="dimmed" mb="sm">
                                {/* Mostrar siempre Año y NIV */}
                                Año: {caso.Año} | NIV: {caso.NIV || '-'}
                            </Text>

                            <Text size="sm" c="dimmed" lineClamp={3}>
                                {caso.Descripcion || 'Sin descripción'}
                            </Text>
                        </Link>

                       {/* Select para cambiar estado */}
                      <Select
                          mt="md"
                          size="xs"
                          data={CASE_STATUSES.map(status => ({ value: status, label: status }))}
                          value={caso.Estado}
                          onChange={(value) => handleEstadoChange(caso.ID_Caso, value)}
                          disabled={updatingEstadoCasoId === caso.ID_Caso}
                          placeholder="Cambiar estado"
                          comboboxProps={{ shadow: 'md', transitionProps: { transition: 'pop', duration: 200 } }}
                       />

                      {/* Botones de acción */}
                      <Group justify="flex-end" mt="md">
                          {/* ELIMINAR Botón Ver Detalles */}
                          {/* <Tooltip label="Ver Detalles">
                              <ActionIcon variant="light" color="blue" onClick={() => navigate(`/casos/${caso.ID_Caso}`)}>
                                  <IconEye size={16} />
                              </ActionIcon>
                          </Tooltip> */}
                          <Tooltip label="Editar Caso">
                               <ActionIcon variant="light" color="gray" onClick={() => openEditModal(caso)}>
                                   <IconPencil size={16} />
                               </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Eliminar Caso">
                              <ActionIcon variant="light" color="red" onClick={() => handleDeleteCaso(caso.ID_Caso)} loading={deletingCasoId === caso.ID_Caso}>
                                  <IconTrash size={16} />
                              </ActionIcon>
                          </Tooltip>
                      </Group>
                  </Card>
              ))}
          </SimpleGrid>
      )}

      {/* --- Modal Crear/Editar Caso --- */}
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
               placeholder="Número de Identificación Vehicular"
               {...form.getInputProps('NIV')}
             />
             <Textarea
               label="Descripción (Opcional)"
               placeholder="Detalles relevantes sobre el caso"
               autosize
               minRows={2}
               {...form.getInputProps('Descripcion')}
             />
             <Group justify="flex-end" mt="md">
               <Button variant="default" onClick={closeModal}>Cancelar</Button>
               <Button type="submit">{editingCasoId ? "Guardar Cambios" : "Crear Caso"}</Button>
             </Group>
           </Stack>
         </form>
      </Modal>
    </Box>
  );
}

export default CasosPage;