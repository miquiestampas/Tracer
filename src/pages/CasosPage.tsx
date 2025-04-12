import React, { useState, useEffect } from 'react';
// Imports necesarios, incluyendo Select
import { Tabs, Text, Box, Table, Button, Modal, TextInput, Textarea, Group, Loader, Alert, NumberInput, ActionIcon, Tooltip, Select } from '@mantine/core';
import { IconList, IconPlus, IconAlertCircle, IconEye, IconTrash } from '@tabler/icons-react'; // Icono Kanban eliminado
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { getCasos, createCaso, deleteCaso, updateCasoEstado } from '../services/casosApi';
// Asumimos que el tipo EstadoCaso se resolverá después de reiniciar el entorno
import type { Caso, CasoCreate, EstadoCaso } from '../types/data';

// Lista de estados válidos
const CASE_STATUSES: EstadoCaso[] = [
    "Nuevo",
    "Esperando Archivos",
    "En Análisis",
    "Pendiente Informe",
    "Cerrado"
];

function CasosPage() {
  const [casos, setCasos] = useState<Caso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);
  const [deletingCasoId, setDeletingCasoId] = useState<number | null>(null);
  const [updatingEstadoCasoId, setUpdatingEstadoCasoId] = useState<number | null>(null);
  const navigate = useNavigate();

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
      closeCreateModal();
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

  // Definición de las filas de la tabla (rows)
  const rows = casos.map((caso) => (
    <Table.Tr key={caso.ID_Caso}>
      <Table.Td>{caso.ID_Caso}</Table.Td>
      <Table.Td>{caso.Nombre_del_Caso}</Table.Td>
      <Table.Td>{caso.Año}</Table.Td>
      <Table.Td>
        {/* Celda Estado con Select */}
        <Group gap="xs" wrap="nowrap">
            <Select
                data={CASE_STATUSES}
                value={caso.Estado} // Asume que 'caso.Estado' existe y es del tipo EstadoCaso
                onChange={(value) => handleEstadoChange(caso.ID_Caso, value)}
                disabled={updatingEstadoCasoId === caso.ID_Caso || deletingCasoId === caso.ID_Caso}
                size="xs"
                variant="unstyled"
                style={{ minWidth: 150, flexGrow: 1 }}
                searchable={false}
                allowDeselect={false}
            />
            {/* Mostrar Loader mientras se actualiza ESE estado */}
            {updatingEstadoCasoId === caso.ID_Caso && <Loader size="xs" />}
        </Group>
      </Table.Td>
      <Table.Td>{caso.NIV || '-'}</Table.Td>
      <Table.Td>{caso.Descripcion || '-'}</Table.Td>
      <Table.Td>{new Date(caso.Fecha_de_Creacion).toLocaleDateString()}</Table.Td>
      <Table.Td>
          {/* Celda Acciones */}
          <Group gap="xs">
            <Tooltip label="Ver Detalles del Caso">
                <ActionIcon
                    variant="subtle"
                    color="blue"
                    onClick={() => navigate(`/casos/detalle/${caso.ID_Caso}`)}
                    disabled={deletingCasoId === caso.ID_Caso || updatingEstadoCasoId === caso.ID_Caso}
                >
                    <IconEye size={16} />
                </ActionIcon>
            </Tooltip>
             <Tooltip label="Eliminar Caso (¡incluye archivos y lecturas!)">
                <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => handleDeleteCaso(caso.ID_Caso)}
                    loading={deletingCasoId === caso.ID_Caso}
                    disabled={deletingCasoId !== null || updatingEstadoCasoId === caso.ID_Caso}
                >
                    <IconTrash size={16} />
                </ActionIcon>
            </Tooltip>
          </Group>
      </Table.Td>
    </Table.Tr>
  ));

  // Estructura JSX del componente
  return (
    <Box p="md">
      <Group justify="space-between" mb="lg">
        <Text size="xl" fw={500} c="tracerBlue.7">Gestión de Casos</Text>
        <Button onClick={openCreateModal} leftSection={<IconPlus size={14} />}>
          Crear Nuevo Caso
        </Button>
      </Group>

      <Tabs defaultValue="lista">
        <Tabs.List>
          {/* Solo la pestaña de Lista */}
          <Tabs.Tab value="lista" leftSection={<IconList size={16} />}>Lista de Casos</Tabs.Tab>
        </Tabs.List>

        {/* Panel para la Lista */}
        <Tabs.Panel value="lista" pt="lg">
            {loading && <Loader my="xl" />}
            {error && (
                <Alert icon={<IconAlertCircle size="1rem" />} title="Error" color="red" my="xl">
                    {error}
                </Alert>
            )}
            {!loading && !error && (
                <Table striped highlightOnHover withTableBorder withColumnBorders>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>ID</Table.Th>
                            <Table.Th>Nombre del Caso</Table.Th>
                            <Table.Th>Año</Table.Th>
                            {/* Cabecera para la nueva columna Estado */}
                            <Table.Th>Estado</Table.Th>
                            <Table.Th>NIV</Table.Th>
                            <Table.Th>Descripción</Table.Th>
                            <Table.Th>Fecha Creación</Table.Th>
                            <Table.Th>Acciones</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {/* Asegúrate de que el colSpan coincide con el número total de columnas (ahora 8) */}
                        {rows.length > 0 ? rows : <Table.Tr><Table.Td colSpan={8} align="center">No hay casos creados.</Table.Td></Table.Tr>}
                    </Table.Tbody>
                </Table>
            )}
        </Tabs.Panel>
        {/* Panel Kanban definitivamente eliminado */}
      </Tabs> {/* Cierre correcto de Tabs */}

      {/* Modal para Crear Nuevo Caso (sin cambios internos) */}
      <Modal opened={createModalOpened} onClose={closeCreateModal} title="Crear Nuevo Caso">
        <form onSubmit={form.onSubmit(handleCreateCaso)}>
           <TextInput label="Nombre del Caso" {...form.getInputProps('Nombre_del_Caso')} required mb="md" />
           <NumberInput label="Año" {...form.getInputProps('Año')} required min={1900} max={new Date().getFullYear() + 1} step={1} mb="md" />
           <TextInput label="NIV (Opcional)" {...form.getInputProps('NIV')} mb="md" />
           <Textarea label="Descripción (Opcional)" {...form.getInputProps('Descripcion')} mb="md" minRows={3} />
          <Group justify="flex-end" mt="lg">
            <Button variant="default" onClick={closeCreateModal}>Cancelar</Button>
            <Button type="submit">Crear Caso</Button>
          </Group>
        </form>
      </Modal>
    </Box> /* Cierre correcto del Box principal */
  );
}

export default CasosPage;