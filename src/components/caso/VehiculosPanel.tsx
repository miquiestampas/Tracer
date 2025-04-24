import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, LoadingOverlay, Alert, Stack, Text, Title, Badge, ActionIcon, Tooltip, Group, Modal, TextInput, Checkbox, Textarea, Button, Paper, Loader, useMantineTheme } from '@mantine/core';
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import { IconEye, IconPencil, IconTrash, IconCircleCheck, IconAlertTriangle, IconX } from '@tabler/icons-react';
import dayjs from 'dayjs';
import type { Vehiculo, Lectura } from '../../types/data'; // Asegúrate que Vehiculo y Lectura estén definidos
import apiClient from '../../services/api';
import { notifications } from '@mantine/notifications';
import { openConfirmModal } from '@mantine/modals'; // Importar para confirmación
import appEventEmitter from '../../utils/eventEmitter'; // Importar el emisor de eventos

interface VehiculosPanelProps {
    casoId: number;
}

// Columnas para la tabla de lecturas expandida
const lecturaColumns: DataTableColumn<Lectura>[] = [
    { accessor: 'Fecha_y_Hora', title: 'Fecha y Hora', render: (l) => dayjs(l.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss'), width: 160 },
    { accessor: 'ID_Lector', title: 'ID Lector', width: 120 },
    { accessor: 'Tipo_Fuente', title: 'Tipo', width: 80 },
    { accessor: 'Carril', title: 'Carril', width: 80 },
    // Puedes añadir más columnas de Lectura si es necesario
];

function VehiculosPanel({ casoId }: VehiculosPanelProps) {
    const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Vehiculo>>({
        columnAccessor: 'Matricula',
        direction: 'asc',
    });
    const [expandedRecordIds, setExpandedRecordIds] = useState<number[]>([]);
    const [lecturasExpandidas, setLecturasExpandidas] = useState<Record<number, Lectura[]>>({});
    const [loadingLecturas, setLoadingLecturas] = useState<Record<number, boolean>>({});
    const [selectedRecords, setSelectedRecords] = useState<Vehiculo[]>([]);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 10;
    const theme = useMantineTheme();

    // Hook para cargar vehículos iniciales
    const fetchVehiculos = useCallback(async () => {
        if (!casoId) {
            setError("ID de caso inválido.");
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const response = await apiClient.get<Vehiculo[]>(`/casos/${casoId}/vehiculos`);
            setVehiculos(response.data || []);
        } catch (err: any) {
            console.error("Error fetching vehiculos:", err);
            setError(err.response?.data?.detail || 'No se pudieron cargar los vehículos.');
            setVehiculos([]);
        } finally {
            setLoading(false);
        }
    }, [casoId]);

    useEffect(() => {
        fetchVehiculos();
    }, [fetchVehiculos]);

    // --- useEffect para escuchar cambios externos en vehículos ---
    // Usar emitter.off con handler inline (descomentado)
    useEffect(() => {
        const handler = () => {
            console.log("VehiculosPanel (caso): detectado cambio externo (handler inline), recargando...");
            fetchVehiculos(); 
        };

        console.log("VehiculosPanel (caso): Suscribiéndose a 'listaVehiculosCambiada' (inline)");
        appEventEmitter.on('listaVehiculosCambiada', handler);

        // Limpiar usando emitter.off con la misma referencia de handler
        return () => {
            console.log("VehiculosPanel (caso): Desuscribiéndose de 'listaVehiculosCambiada' (inline)");
            appEventEmitter.off('listaVehiculosCambiada', handler);
        };
    }, [fetchVehiculos]);

    // Cargar lecturas cuando se expande una fila
    const handleRowExpansionChange = useCallback((recordIds: unknown[]) => {
        // Asegurarse de que son números antes de usarlos
        const numericIds = recordIds.filter((id): id is number => typeof id === 'number');
        setExpandedRecordIds(numericIds);

        const newIdsToFetch = numericIds.filter(id => !(id in lecturasExpandidas) && !loadingLecturas[id]);

        if (newIdsToFetch.length > 0) {
            setLoadingLecturas(prev => {
                const newState = { ...prev };
                newIdsToFetch.forEach(id => { newState[id] = true; });
                return newState;
            });

            // La lógica interna sigue siendo asíncrona
            const fetchExpandedData = async () => {
                await Promise.allSettled(newIdsToFetch.map(async (vehiculoId) => {
                    try {
                        const response = await apiClient.get<Lectura[]>(`/vehiculos/${vehiculoId}/lecturas?caso_id=${casoId}`);
                        setLecturasExpandidas(prev => ({ ...prev, [vehiculoId]: response.data || [] }));
                    } catch (err: any) {
                        console.error(`Error fetching lecturas for vehiculo ${vehiculoId}:`, err);
                        notifications.show({
                            title: `Error Lecturas Vehículo ${vehiculoId}`,
                            message: err.response?.data?.detail || 'No se pudieron cargar las lecturas.',
                            color: 'red',
                        });
                        setLecturasExpandidas(prev => ({ ...prev, [vehiculoId]: [] }));
                    } finally {
                        setLoadingLecturas(prev => ({ ...prev, [vehiculoId]: false }));
                    }
                }));
            };
            fetchExpandedData(); // Llamar a la función asíncrona
        }
    }, [casoId, lecturasExpandidas, loadingLecturas]);

    // ---- ESTADOS Y HANDLERS PARA MODAL DE EDICIÓN ----
    const [editingVehiculo, setEditingVehiculo] = useState<Vehiculo | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    // Estados para los campos del formulario
    const [marcaEdit, setMarcaEdit] = useState('');
    const [modeloEdit, setModeloEdit] = useState('');
    const [colorEdit, setColorEdit] = useState('');
    const [propiedadEdit, setPropiedadEdit] = useState('');
    const [alquilerEdit, setAlquilerEdit] = useState(false);
    const [observacionesEdit, setObservacionesEdit] = useState('');
    const [comprobadoEdit, setComprobadoEdit] = useState(false);
    const [sospechosoEdit, setSospechosoEdit] = useState(false);
    const [loadingEdit, setLoadingEdit] = useState(false); // Estado de carga para el guardado

    const handleEditVehiculo = (vehiculo: Vehiculo) => {
        setEditingVehiculo(vehiculo);
        // Poblar estados del formulario
        setMarcaEdit(vehiculo.Marca || '');
        setModeloEdit(vehiculo.Modelo || '');
        setColorEdit(vehiculo.Color || '');
        setPropiedadEdit(vehiculo.Propiedad || '');
        setAlquilerEdit(vehiculo.Alquiler);
        setObservacionesEdit(vehiculo.Observaciones || '');
        setComprobadoEdit(vehiculo.Comprobado);
        setSospechosoEdit(vehiculo.Sospechoso);
        setIsEditModalOpen(true);
    };

    const handleCloseEditModal = () => {
        setIsEditModalOpen(false);
        setEditingVehiculo(null);
        // No es necesario resetear los estados aquí, se repoblarán al abrir de nuevo
    };

    const handleSaveChanges = async () => {
        if (!editingVehiculo) return;
        setLoadingEdit(true);
        const updatePayload = {
            Marca: marcaEdit || null,
            Modelo: modeloEdit || null,
            Color: colorEdit || null,
            Propiedad: propiedadEdit || null,
            Alquiler: alquilerEdit,
            Observaciones: observacionesEdit || null,
            Comprobado: comprobadoEdit,
            Sospechoso: sospechosoEdit,
        };

        try {
            await apiClient.put(`/vehiculos/${editingVehiculo.ID_Vehiculo}`, updatePayload);
            notifications.show({
                title: 'Éxito',
                message: `Vehículo ${editingVehiculo.Matricula} actualizado.`,
                color: 'green',
            });
            handleCloseEditModal();
            fetchVehiculos(); // Recargar la lista de vehículos
        } catch (err: any) {
            console.error("Error updating vehiculo:", err);
            notifications.show({
                title: 'Error al Actualizar',
                message: err.response?.data?.detail || 'No se pudo guardar los cambios.',
                color: 'red',
            });
        } finally {
             setLoadingEdit(false);
        }
    };

    // ---- HANDLER PARA ELIMINAR ----
    const handleDeleteVehiculo = (vehiculo: Vehiculo) => {
        openConfirmModal({
            title: `Eliminar Vehículo ${vehiculo.Matricula}`,
            centered: true,
            children: (
                <Text size="sm">
                    ¿Estás seguro de que quieres eliminar este vehículo? Esta acción no se puede deshacer.
                </Text>
            ),
            labels: { confirm: 'Eliminar Vehículo', cancel: 'Cancelar' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                setLoading(true);
                try {
                    await apiClient.delete(`/vehiculos/${vehiculo.ID_Vehiculo}`);
                    notifications.show({
                        title: 'Vehículo Eliminado',
                        message: `Vehículo ${vehiculo.Matricula} eliminado correctamente.`,
                        color: 'green',
                    });
                    fetchVehiculos(); // Recargar la lista de vehículos
                } catch (err: any) {
                    console.error("Error deleting vehiculo:", err);
                    notifications.show({
                        title: 'Error al Eliminar',
                        message: err.response?.data?.detail || 'No se pudo eliminar el vehículo.',
                        color: 'red',
                    });
                } finally {
                    setLoading(false);
                }
            },
        });
    };

    // Definición de columnas para la tabla principal de Vehículos
    // Mover handleEditVehiculo y handleDeleteVehiculo fuera de useMemo
    const columns: DataTableColumn<Vehiculo>[] = useMemo(() => [
        { accessor: 'Matricula', title: 'Matrícula', width: 100, sortable: true },
        { accessor: 'Marca', title: 'Marca', width: 120, sortable: true },
        { accessor: 'Modelo', title: 'Modelo', width: 120, sortable: true },
        { accessor: 'Color', title: 'Color', width: 90, sortable: true },
        { accessor: 'Propiedad', title: 'Propiedad', width: 150, sortable: true },
        {
            accessor: 'Alquiler', title: 'Alquiler', width: 90, sortable: true,
            render: (v) => <Badge color={v.Alquiler ? 'orange' : 'gray'}>{v.Alquiler ? 'Sí' : 'No'}</Badge>
        },
        {
             accessor: 'totalLecturasLprCaso', // Nombre correcto del campo
             title: 'Lecturas LPR',
             width: 110,
             textAlignment: 'center',
             render: (vehiculo) => typeof vehiculo.total_lecturas_lpr_caso === 'number'
                                    ? vehiculo.total_lecturas_lpr_caso
                                    : (expandedRecordIds.includes(vehiculo.ID_Vehiculo) && lecturasExpandidas[vehiculo.ID_Vehiculo]
                                        ? lecturasExpandidas[vehiculo.ID_Vehiculo].length
                                        : '...'),
        },
        { accessor: 'Observaciones', title: 'Observaciones', width: 200 },
        {
            accessor: 'Comprobado', title: 'Comp.', width: 70, textAlignment: 'center', sortable: true,
            render: (v) => v.Comprobado ? <Tooltip label="Comprobado"><IconCircleCheck color="teal" size={18} /></Tooltip> : <IconX color="gray" size={18}/>
        },
        {
            accessor: 'Sospechoso', title: 'Sosp.', width: 70, textAlignment: 'center', sortable: true,
            render: (v) => v.Sospechoso ? <Tooltip label="Sospechoso"><IconAlertTriangle color="red" size={18} /></Tooltip> : <IconX color="gray" size={18}/>
        },
        {
            accessor: 'actions', title: 'Acciones', width: 100, textAlignment: 'center',
            render: (vehiculo) => (
                <Group gap="xs" justify="center" wrap="nowrap">
                    <Tooltip label="Editar Vehículo">
                        <ActionIcon variant="subtle" color="blue" onClick={() => handleEditVehiculo(vehiculo)}>
                            <IconPencil size={16} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Eliminar Vehículo">
                        <ActionIcon variant="subtle" color="red" onClick={() => handleDeleteVehiculo(vehiculo)}>
                            <IconTrash size={16} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            ),
        },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [expandedRecordIds, lecturasExpandidas, handleEditVehiculo, handleDeleteVehiculo]);

    // --- Ordenación y Paginación --- (Asegurarse que usa `vehiculos`)
    const sortedRecords = useMemo(() => {
        const data = [...vehiculos];
        const { columnAccessor, direction } = sortStatus;
        data.sort((a, b) => {
          const valueA = a[columnAccessor as keyof Vehiculo];
          const valueB = b[columnAccessor as keyof Vehiculo];
          // Handle different data types for sorting
          if (typeof valueA === 'number' && typeof valueB === 'number') {
            return (valueA - valueB) * (direction === 'asc' ? 1 : -1);
          }
          if (typeof valueA === 'string' && typeof valueB === 'string') {
            return valueA.localeCompare(valueB) * (direction === 'asc' ? 1 : -1);
          }
          // Add other type comparisons if needed (booleans, dates)
           if (typeof valueA === 'boolean' && typeof valueB === 'boolean') {
               return (Number(valueA) - Number(valueB)) * (direction === 'asc' ? 1 : -1);
           }
          return 0;
        });
        return data;
      }, [vehiculos, sortStatus]);

    const records = useMemo(() => {
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE;
        return sortedRecords.slice(from, to);
      }, [sortedRecords, page, PAGE_SIZE]);

    return (
        <Box style={{ position: 'relative' }}>
            <LoadingOverlay visible={loading} />
            <Title order={3} mb="md">Vehículos Identificados en el Caso</Title>
            {error && <Alert color="red" title="Error" mb="md">{error}</Alert>}
            <DataTable<Vehiculo>
                records={records}
                columns={columns}
                minHeight={200}
                withTableBorder
                borderRadius="sm"
                withColumnBorders
                striped
                highlightOnHover
                idAccessor="ID_Vehiculo"
                noRecordsText="No se encontraron vehículos para este caso."
                fetching={loading}
                sortStatus={sortStatus}
                onSortStatusChange={setSortStatus}
                totalRecords={vehiculos.length}
                recordsPerPage={PAGE_SIZE}
                page={page}
                onPageChange={setPage}
                rowExpansion={{
                    expanded: { recordIds: expandedRecordIds, onRecordIdsChange: handleRowExpansionChange },
                    allowMultiple: true,
                    content: ({ record }) => (
                        <Box p="xs" style={{ background: '#f9f9f9' }}>
                            <LoadingOverlay visible={loadingLecturas[record.ID_Vehiculo] ?? false} />
                            {lecturasExpandidas[record.ID_Vehiculo] && lecturasExpandidas[record.ID_Vehiculo].length > 0 ? (
                                <>
                                <Text fw={500} mb="xs">Lecturas ({lecturasExpandidas[record.ID_Vehiculo].length}) para Matrícula: {record.Matricula}</Text>
                                <DataTable<Lectura>
                                    records={lecturasExpandidas[record.ID_Vehiculo]}
                                    columns={lecturaColumns}
                                    minHeight={100}
                                    noRecordsText="No hay lecturas disponibles para este vehículo en este caso."
                                    withTableBorder={false}
                                    // Puedes añadir más props a la tabla anidada si es necesario
                                />
                                </>
                            ) : (
                                <Text c="dimmed">
                                    {!(loadingLecturas[record.ID_Vehiculo]) ? 'No se encontraron lecturas para este vehículo en este caso.' : 'Cargando lecturas...'}
                                </Text>
                            )}
                        </Box>
                    ),
                }}
            />

            {/* --- MODAL DE EDICIÓN --- */}
            <Modal
                 opened={isEditModalOpen}
                 onClose={handleCloseEditModal}
                 title={`Editar Vehículo: ${editingVehiculo?.Matricula}`}
                 centered
                 size="lg" // Ajustar tamaño si es necesario
            >
                <LoadingOverlay visible={loadingEdit} />
                <Stack>
                    <TextInput label="Marca" value={marcaEdit} onChange={(e) => setMarcaEdit(e.currentTarget.value)} />
                    <TextInput label="Modelo" value={modeloEdit} onChange={(e) => setModeloEdit(e.currentTarget.value)} />
                    <TextInput label="Color" value={colorEdit} onChange={(e) => setColorEdit(e.currentTarget.value)} />
                    <TextInput label="Propiedad" value={propiedadEdit} onChange={(e) => setPropiedadEdit(e.currentTarget.value)} />
                    <Checkbox label="Alquiler" checked={alquilerEdit} onChange={(e) => setAlquilerEdit(e.currentTarget.checked)} mt="xs"/>
                    <Textarea label="Observaciones" value={observacionesEdit} onChange={(e) => setObservacionesEdit(e.currentTarget.value)} autosize minRows={2}/>
                    <Group>
                         <Checkbox label="Comprobado" checked={comprobadoEdit} onChange={(e) => setComprobadoEdit(e.currentTarget.checked)} />
                         <Checkbox label="Sospechoso" checked={sospechosoEdit} onChange={(e) => setSospechosoEdit(e.currentTarget.checked)} />
                    </Group>
                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={handleCloseEditModal} disabled={loadingEdit}>Cancelar</Button>
                        <Button onClick={handleSaveChanges} loading={loadingEdit}>Guardar Cambios</Button>
                    </Group>
                </Stack>
            </Modal>
        </Box>
    );
}

export default VehiculosPanel;
