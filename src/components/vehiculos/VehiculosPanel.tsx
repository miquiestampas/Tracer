import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, LoadingOverlay, Alert, Stack, Text, Title, Badge, ActionIcon, Tooltip, Group, Modal, TextInput, Textarea, Checkbox, Button } from '@mantine/core';
import { DataTable, type DataTableColumn } from 'mantine-datatable';
import { IconEye, IconPencil, IconTrash, IconCircleCheck, IconAlertTriangle, IconX, IconRefresh, IconCheck, IconBan } from '@tabler/icons-react';
import dayjs from 'dayjs';
import type { Vehiculo, Lectura } from '../../types/data'; // Asegúrate que Vehiculo y Lectura estén definidos
import apiClient from '../../services/api';
import { notifications } from '@mantine/notifications';
import { openConfirmModal } from '@mantine/modals';
import appEventEmitter from '../../utils/eventEmitter'; // <-- Nueva importación

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
    const [expandedRecordIds, setExpandedRecordIds] = useState<number[]>([]);
    // Estado para almacenar las lecturas de cada fila expandida
    const [lecturasExpandidas, setLecturasExpandidas] = useState<Record<number, Lectura[]>>({});
    // Estado para controlar la carga de las lecturas de cada fila
    const [loadingLecturas, setLoadingLecturas] = useState<Record<number, boolean>>({});
    // --- AÑADIR ESTADO PARA SELECCIÓN ---
    const [selectedRecords, setSelectedRecords] = useState<Vehiculo[]>([]);

    // Cargar vehículos del caso
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
    }, [fetchVehiculos]); // Dependencia fetchVehiculos

    // --- NUEVO: useEffect para escuchar cambios externos en vehículos ---
    // Usar emitter.off con handler inline
    useEffect(() => {
        const handler = () => {
            console.log('[VehiculosPanel (vehiculos)]: Evento listaVehiculosCambiada recibido (handler inline), recargando...');
            fetchVehiculos();
        };

        console.log("[VehiculosPanel (vehiculos)]: Suscribiéndose a 'listaVehiculosCambiada' (inline)");
        appEventEmitter.on('listaVehiculosCambiada', handler);

        // Limpiar usando emitter.off con la misma referencia de handler
        return () => {
            console.log("[VehiculosPanel (vehiculos)]: Desuscribiéndose de 'listaVehiculosCambiada' (inline)");
            appEventEmitter.off('listaVehiculosCambiada', handler); 
        };
    }, [fetchVehiculos]);

    // --- NUEVO: useEffect para cargar lecturas al cambiar la expansión --- 
    useEffect(() => {
        // Identificar los nuevos IDs que se están expandiendo
        const newIdsToFetch = expandedRecordIds.filter(id => !(id in lecturasExpandidas) && !loadingLecturas[id]);

        if (newIdsToFetch.length > 0) {
            // Marcar como cargando
            setLoadingLecturas(prev => {
                const newState = { ...prev };
                newIdsToFetch.forEach(id => { newState[id] = true; });
                return newState;
            });

            // Realizar las peticiones
            Promise.allSettled(newIdsToFetch.map(async (vehiculoId) => {
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
                    setLecturasExpandidas(prev => ({ ...prev, [vehiculoId]: [] })); // Dejar vacío en caso de error
                } finally {
                    setLoadingLecturas(prev => ({ ...prev, [vehiculoId]: false }));
                }
            }));
        }
    // Dependencias: Ejecutar cuando cambien los IDs expandidos o el ID del caso
    }, [expandedRecordIds, lecturasExpandidas, loadingLecturas, casoId]); 

    // --- NUEVO: Handler para edición inline de booleanos ---
    const handleToggleBoolean = useCallback(async (vehiculo: Vehiculo, field: 'Alquiler' | 'Comprobado' | 'Sospechoso') => {
        const currentValue = vehiculo[field];
        const newValue = !currentValue;

        // Actualización optimista del estado local
        setVehiculos(currentVehiculos => 
            currentVehiculos.map(v => 
                v.ID_Vehiculo === vehiculo.ID_Vehiculo ? { ...v, [field]: newValue } : v
            )
        );

        // Llamada a la API en segundo plano
        try {
            await apiClient.put(`/vehiculos/${vehiculo.ID_Vehiculo}`, { [field]: newValue });
            // No es necesario notificar éxito en la actualización optimista, pero sí loguear o manejar errores específicos si quieres
            console.log(`Vehículo ${vehiculo.Matricula}, campo ${field} actualizado a ${newValue}`);
        } catch (err: any) {
            console.error(`Error actualizando ${field} para vehículo ${vehiculo.ID_Vehiculo}:`, err);
            notifications.show({
                title: `Error al actualizar ${field}`,
                message: err.response?.data?.detail || 'No se pudo guardar el cambio.',
                color: 'red',
            });
            // Revertir el cambio en el estado local si la API falla
            setVehiculos(currentVehiculos => 
                currentVehiculos.map(v => 
                    v.ID_Vehiculo === vehiculo.ID_Vehiculo ? { ...v, [field]: currentValue } : v // Volver al valor original
                )
            );
        }
    }, []); // Dependencia vacía por ahora, ya que setVehiculos es estable

    // ---- MOVER DEFINICIONES DE HANDLERS AQUÍ (ANTES DE useMemo para columns) ----

    // ---- ESTADOS Y HANDLERS PARA MODAL DE EDICIÓN ----
    const [editingVehiculo, setEditingVehiculo] = useState<Vehiculo | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [marcaEdit, setMarcaEdit] = useState('');
    const [modeloEdit, setModeloEdit] = useState('');
    const [colorEdit, setColorEdit] = useState('');
    const [propiedadEdit, setPropiedadEdit] = useState('');
    const [alquilerEdit, setAlquilerEdit] = useState(false);
    const [observacionesEdit, setObservacionesEdit] = useState('');
    const [comprobadoEdit, setComprobadoEdit] = useState(false);
    const [sospechosoEdit, setSospechosoEdit] = useState(false);
    const [loadingEdit, setLoadingEdit] = useState(false);

    const handleEditVehiculo = useCallback((vehiculo: Vehiculo) => {
        setEditingVehiculo(vehiculo);
        setMarcaEdit(vehiculo.Marca || '');
        setModeloEdit(vehiculo.Modelo || '');
        setColorEdit(vehiculo.Color || '');
        setPropiedadEdit(vehiculo.Propiedad || '');
        setAlquilerEdit(vehiculo.Alquiler);
        setObservacionesEdit(vehiculo.Observaciones || '');
        setComprobadoEdit(vehiculo.Comprobado);
        setSospechosoEdit(vehiculo.Sospechoso);
        setIsEditModalOpen(true);
    }, []); // Dependencias vacías si no usa nada externo excepto setters

    const handleCloseEditModal = useCallback(() => {
        setIsEditModalOpen(false);
        setEditingVehiculo(null);
    }, []);

    const handleSaveChanges = useCallback(async () => {
        if (!editingVehiculo) return;
        setLoadingEdit(true);
        const updatePayload = {
            Marca: marcaEdit || null, Modelo: modeloEdit || null, Color: colorEdit || null,
            Propiedad: propiedadEdit || null, Alquiler: alquilerEdit, Observaciones: observacionesEdit || null,
            Comprobado: comprobadoEdit, Sospechoso: sospechosoEdit,
        };
        try {
            await apiClient.put(`/vehiculos/${editingVehiculo.ID_Vehiculo}`, updatePayload);
            notifications.show({ title: 'Éxito', message: `Vehículo ${editingVehiculo.Matricula} actualizado.`, color: 'green' });
            handleCloseEditModal();
            fetchVehiculos();
        } catch (err: any) {
            console.error("Error updating vehiculo:", err);
            notifications.show({ title: 'Error al Actualizar', message: err.response?.data?.detail || 'No se pudo guardar los cambios.', color: 'red' });
        } finally {
             setLoadingEdit(false);
        }
    }, [editingVehiculo, marcaEdit, modeloEdit, colorEdit, propiedadEdit, alquilerEdit, observacionesEdit, comprobadoEdit, sospechosoEdit, fetchVehiculos, handleCloseEditModal]);

    // ---- HANDLER PARA ELIMINAR ----
    const handleDeleteVehiculo = useCallback((vehiculo: Vehiculo) => {
        openConfirmModal({
             title: `Eliminar Vehículo ${vehiculo.Matricula}`,
             centered: true,
             children: <Text size="sm">¿Estás seguro...? Esta acción no se puede deshacer.</Text>,
             labels: { confirm: 'Eliminar', cancel: 'Cancelar' },
             confirmProps: { color: 'red' },
             onConfirm: async () => {
                 setLoading(true);
                 try {
                     await apiClient.delete(`/vehiculos/${vehiculo.ID_Vehiculo}`);
                     notifications.show({ title: 'Vehículo Eliminado', message: `Vehículo ${vehiculo.Matricula} eliminado.`, color: 'green' });
                     fetchVehiculos();
                 } catch (err: any) {
                     console.error("Error deleting vehiculo:", err);
                     notifications.show({ title: 'Error al Eliminar', message: err.response?.data?.detail || 'No se pudo eliminar.', color: 'red' });
                 } finally {
                      setLoading(false);
                 }
             },
         });
    }, [fetchVehiculos]); // fetchVehiculos como dependencia

    // ---- Definición de columnas DESPUÉS de los handlers ----
    const columns: DataTableColumn<Vehiculo>[] = useMemo(() => [
        { accessor: 'Matricula', title: 'Matrícula', sortable: true },
        { accessor: 'Marca', title: 'Marca', sortable: true },
        { accessor: 'Modelo', title: 'Modelo', sortable: true },
        { accessor: 'Color', title: 'Color', sortable: true },
        { accessor: 'Propiedad', title: 'Propiedad', sortable: true },
        {
            accessor: 'totalLecturasLprCaso', // Usar el nombre exacto del campo de la API
            title: 'Lecturas LPR',
            width: 110, // Ajustar ancho si es necesario
            textAlignment: 'center',
            // Usar el conteo de la API si existe, si no, mostrar conteo de expandidas o '...'
            render: (vehiculo) => typeof vehiculo.total_lecturas_lpr_caso === 'number'
                                   ? vehiculo.total_lecturas_lpr_caso
                                   : (expandedRecordIds.includes(vehiculo.ID_Vehiculo) && lecturasExpandidas[vehiculo.ID_Vehiculo]
                                       ? lecturasExpandidas[vehiculo.ID_Vehiculo].length
                                       : '...'),
        },
        { accessor: 'Observaciones', title: 'Observaciones' },
        {
            accessor: 'Comprobado', title: 'Comp.', width: 70, textAlignment: 'center', sortable: true,
            render: (v) => (
                 <Tooltip label={v.Comprobado ? 'Desmarcar Comprobado' : 'Marcar Comprobado'}>
                    <ActionIcon 
                        variant="subtle" 
                        color={v.Comprobado ? 'teal' : 'gray'} 
                        onClick={() => handleToggleBoolean(v, 'Comprobado')}
                    >
                        {v.Comprobado ? <IconCircleCheck size={18} /> : <IconX size={18}/>}
                    </ActionIcon>
                </Tooltip>
            )
        },
        {
            accessor: 'Sospechoso', title: 'Sosp.', width: 70, textAlignment: 'center', sortable: true,
             render: (v) => (
                 <Tooltip label={v.Sospechoso ? 'Desmarcar Sospechoso' : 'Marcar Sospechoso'}>
                    <ActionIcon 
                        variant="subtle" 
                        color={v.Sospechoso ? 'red' : 'gray'} 
                        onClick={() => handleToggleBoolean(v, 'Sospechoso')}
                    >
                         {v.Sospechoso ? <IconAlertTriangle size={18} /> : <IconX size={18}/>}
                    </ActionIcon>
                </Tooltip>
            )
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
                        <ActionIcon 
                            variant="subtle" 
                            color="red" 
                            onClick={() => handleDeleteVehiculo(vehiculo)}
                            // Deshabilitar si hay selección para evitar confusión?
                            disabled={selectedRecords.length > 0} 
                        >
                            <IconTrash size={16} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            ),
        },
    ], [expandedRecordIds, lecturasExpandidas, handleEditVehiculo, handleDeleteVehiculo, handleToggleBoolean, selectedRecords]); // Añadir selectedRecords a dependencias si handleDeleteVehiculo lo usa

    return (
        <Box style={{ position: 'relative' }}>
            <LoadingOverlay visible={loading} />
            <Group justify="space-between" align="center" mb="md">
                <Title order={3}>Vehículos Identificados en el Caso</Title>
                <Group>
                    {selectedRecords.length > 0 && (
                        <Button 
                            color="red" 
                            variant="outline"
                            size="xs"
                        >
                            Eliminar Selección ({selectedRecords.length})
                        </Button>
                    )}
                    <Button 
                        leftSection={<IconRefresh size={16} />}
                        onClick={fetchVehiculos}
                        variant="default"
                        size="xs"
                        disabled={loading}
                    >
                        Actualizar Lista
                    </Button>
                </Group>
            </Group>
            {error && <Alert color="red" title="Error" mb="md">{error}</Alert>}
            <DataTable<Vehiculo>
                records={vehiculos}
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
                selectedRecords={selectedRecords}
                onSelectedRecordsChange={setSelectedRecords}
                rowExpansion={{
                    expanded: { 
                        recordIds: expandedRecordIds,
                        onRecordIdsChange: setExpandedRecordIds
                    },
                    allowMultiple: true,
                    content: ({ record }) => (
                        <Box p="md" style={{ background: '#f9f9f9' }}>
                             <LoadingOverlay visible={loadingLecturas[record.ID_Vehiculo] ?? false} />
                            {lecturasExpandidas[record.ID_Vehiculo] && lecturasExpandidas[record.ID_Vehiculo].length > 0 ? (
                                <>
                                <Text fw={500} mb="xs">Lecturas ({lecturasExpandidas[record.ID_Vehiculo].length}) para Matrícula: {record.Matricula}</Text>
                                <DataTable<Lectura>
                                    records={lecturasExpandidas[record.ID_Vehiculo]}
                                    columns={lecturaColumns}
                                    minHeight={100}
                                    noRecordsText=""
                                    noRecordsIcon={<></>}
                                    withTableBorder={false}
                                />
                                </>
                            ) : (
                                <Text c="dimmed">
                                    {!(loadingLecturas[record.ID_Vehiculo]) ? '' : 'Cargando lecturas...'}
                                </Text>
                            )}
                        </Box>
                    ),
                }}
            />

            <Modal
                 opened={isEditModalOpen}
                 onClose={handleCloseEditModal}
                 title={`Editar Vehículo: ${editingVehiculo?.Matricula}`}
                 centered
                 size="lg"
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