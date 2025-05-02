import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, LoadingOverlay, Alert, Stack, Text, Title, Badge, ActionIcon, Tooltip, Group, Modal, TextInput, Textarea, Checkbox, Button, Paper, Collapse } from '@mantine/core';
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import { IconEye, IconPencil, IconTrash, IconCircleCheck, IconAlertTriangle, IconX, IconRefresh, IconCheck, IconBan } from '@tabler/icons-react';
import dayjs from 'dayjs';
import type { Vehiculo, Lectura } from '../../types/data'; // Asegúrate que Vehiculo y Lectura estén definidos
import apiClient from '../../services/api';
import { notifications } from '@mantine/notifications';
import { openConfirmModal } from '@mantine/modals';
import appEventEmitter from '../../utils/eventEmitter'; // <-- Nueva importación
import _ from 'lodash'; // Importar lodash para ordenar

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
    // --- NUEVO: Estado para saber si hay GPS para un vehículo expandido ---
    const [gpsLecturasExist, setGpsLecturasExist] = useState<Record<number, boolean>>({});
    // --- AÑADIR ESTADO PARA SELECCIÓN ---
    const [selectedRecords, setSelectedRecords] = useState<Vehiculo[]>([]);
    // --- NUEVO: Estados para Paginación y Ordenación ---
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15; // O el valor que prefieras
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Vehiculo>>({ columnAccessor: 'Matricula', direction: 'asc' });
    // --- NUEVO: Estados para ayuda ---
    const [ayudaAbierta, setAyudaAbierta] = useState(false);

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

    // --- NUEVO: useEffect para cargar lecturas al cambiar la expansión (MODIFICADO para filtrar LPR/GPS) --- 
    useEffect(() => {
        // Identificar los nuevos IDs que se están expandiendo
        const newIdsToFetch = expandedRecordIds.filter(id => 
            !(id in lecturasExpandidas) && 
            !loadingLecturas[id]
        );

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
                    // Fetch ALL lectures for the vehicle in this case
                    const response = await apiClient.get<Lectura[]>(`/vehiculos/${vehiculoId}/lecturas?caso_id=${casoId}`);
                    const allLecturas = response.data || [];
                    
                    // Filter LPR and check for GPS
                    const lprLecturas = allLecturas.filter(l => l.Tipo_Fuente === 'LPR');
                    const hasGps = allLecturas.some(l => l.Tipo_Fuente === 'GPS');

                    // Store only LPR lectures and the GPS flag
                    setLecturasExpandidas(prev => ({ ...prev, [vehiculoId]: lprLecturas }));
                    setGpsLecturasExist(prev => ({ ...prev, [vehiculoId]: hasGps }));

                } catch (err: any) {
                    console.error(`Error fetching lecturas for vehiculo ${vehiculoId}:`, err);
                    notifications.show({
                        title: `Error Lecturas Vehículo ${vehiculoId}`,
                        message: err.response?.data?.detail || 'No se pudieron cargar las lecturas.',
                        color: 'red',
                    });
                    setLecturasExpandidas(prev => ({ ...prev, [vehiculoId]: [] })); // Dejar vacío en caso de error
                    setGpsLecturasExist(prev => ({ ...prev, [vehiculoId]: false })); // Marcar como sin GPS en error
                } finally {
                    setLoadingLecturas(prev => ({ ...prev, [vehiculoId]: false }));
                }
            }));
        }
    // Dependencias: Ejecutar cuando cambien los IDs expandidos o el ID del caso
    // Quitar lecturasExpandidas y loadingLecturas para evitar bucle si se actualizan dentro
    }, [expandedRecordIds, casoId]); 

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

    // --- NUEVO: Handler para cambio de ordenación ---
    const handleSortStatusChange = (status: DataTableSortStatus<Vehiculo>) => {
        setPage(1); // Volver a la primera página al cambiar orden
        setSortStatus(status);
    };

    // --- NUEVO: Procesar vehículos para la tabla (ordenar y paginar) ---
    const sortedAndPaginatedVehiculos = useMemo(() => {
        let data = [...vehiculos]; // Copiar para no mutar
        // Ordenar
        const { columnAccessor, direction } = sortStatus;
        if (columnAccessor) {
            data = _.orderBy(data, [columnAccessor], [direction]);
        }
        // Paginar
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE;
        return data.slice(from, to);
    }, [vehiculos, sortStatus, page, PAGE_SIZE]);

    // ---- Definición de columnas DESPUÉS de los handlers (ACTUALIZADO) ----
    const columns: DataTableColumn<Vehiculo>[] = useMemo(() => {
        // Restaurar lógica de selección para cabecera
        const allSelected = vehiculos.length > 0 && selectedRecords.length === vehiculos.length;
        const someSelected = selectedRecords.length > 0 && selectedRecords.length < vehiculos.length;

        return [
            // --- RESTAURAR Columna de selección explícita ---
            {
                accessor: 'select',
                title: (
                    <Checkbox
                        aria-label="Seleccionar todas las filas"
                        checked={allSelected}
                        indeterminate={someSelected}
                        onChange={(e) => {
                            setSelectedRecords(e.currentTarget.checked ? vehiculos : []);
                        }}
                    />
                ),
                width: '0%',
                styles: {
                    cell: {
                        paddingLeft: 'var(--mantine-spacing-xs)',
                        paddingRight: 'var(--mantine-spacing-xs)',
                    }
                },
                render: (vehiculo) => (
                    <Checkbox
                        aria-label={`Seleccionar fila ${vehiculo.ID_Vehiculo}`}
                        checked={selectedRecords.some(v => v.ID_Vehiculo === vehiculo.ID_Vehiculo)}
                        onChange={(e) => {
                            const isChecked = e.currentTarget.checked;
                            setSelectedRecords(currentSelected =>
                                isChecked
                                    ? [...currentSelected, vehiculo]
                                    : currentSelected.filter(v => v.ID_Vehiculo !== vehiculo.ID_Vehiculo)
                            );
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                ),
            },
            // --- Columnas existentes (marcar como sortable) ---
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
                sortable: true, // Hacer sortable
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
        ];
    }, [vehiculos, selectedRecords, expandedRecordIds, lecturasExpandidas, handleEditVehiculo, handleDeleteVehiculo, handleToggleBoolean]);

    return (
        <Box style={{ position: 'relative' }}>
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
                <Alert color="blue" title="¿Cómo funciona la pestaña Vehículos?" mb="md">
                    <Text size="sm">
                        <b>¿Qué es este panel?</b><br />
                        Aquí puedes gestionar la lista de vehículos (matrículas) asociados a este caso. Un vehículo se añade automáticamente si aparece en las lecturas importadas o si lo guardas manualmente desde otras pestañas.<br /><br />
                        <b>Funcionalidades:</b><br />
                        - <b>Listado:</b> Muestra todos los vehículos vinculados al caso, con detalles como marca, modelo, color, etc. (si se han añadido).<br />
                        - <b>Lecturas LPR:</b> Indica cuántas lecturas LPR tiene cada vehículo <i>dentro de este caso</i>.<br />
                        - <b>Editar Detalles:</b> Modifica la información asociada a un vehículo (marca, modelo, propietario, observaciones, estado de comprobado/sospechoso).<br />
                        - <b>Ver Lecturas:</b> Accede a una vista filtrada de todas las lecturas (LPR y GPS) de un vehículo específico dentro de este caso.<br />
                        - <b>Eliminar Vehículo:</b> Borra un vehículo de la lista del caso (Nota: Esto <i>no</i> elimina sus lecturas asociadas, solo el registro del vehículo).<br />
                        - <b>Refrescar:</b> Actualiza la lista si se han hecho cambios (como guardar un vehículo desde otra pestaña).<br /><br />
                        <b>Consejos:</b><br />
                        - Utiliza la función de edición para mantener actualizada la información de cada vehículo.<br />
                        - Marca los vehículos como comprobados o sospechosos según el avance de la investigación.<br />
                        - Elimina solo aquellos vehículos que no sean relevantes para el caso, ya que sus lecturas seguirán estando disponibles en el sistema.<br />
                    </Text>
                </Alert>
            </Collapse>
            <LoadingOverlay visible={loading} />
            <Paper shadow="sm" p="md" withBorder>
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
                    // Usar datos ordenados y paginados
                    records={sortedAndPaginatedVehiculos}
                    columns={columns}
                    minHeight={200}
                    withTableBorder
                    borderRadius="sm"
                    withColumnBorders
                    striped
                    highlightOnHover
                    idAccessor="ID_Vehiculo"
                    noRecordsText=""
                    noRecordsIcon={<></>}
                    fetching={loading}
                    // --- Props de Paginación y Ordenación ---
                    totalRecords={vehiculos.length} // Total real, no el paginado
                    recordsPerPage={PAGE_SIZE}
                    page={page}
                    onPageChange={setPage}
                    sortStatus={sortStatus}
                    onSortStatusChange={handleSortStatusChange}
                    rowExpansion={{
                        expanded: { 
                            recordIds: expandedRecordIds,
                            onRecordIdsChange: setExpandedRecordIds
                        },
                        allowMultiple: true,
                        content: ({ record }) => (
                            <Box p="md" style={{ background: '#f9f9f9' }}>
                                 <LoadingOverlay visible={loadingLecturas[record.ID_Vehiculo] ?? false} />
                                {/* Mostrar tabla solo si hay lecturas LPR */}
                                {lecturasExpandidas[record.ID_Vehiculo] && lecturasExpandidas[record.ID_Vehiculo].length > 0 ? (
                                    <>
                                    <Text fw={500} mb="xs">Lecturas LPR ({lecturasExpandidas[record.ID_Vehiculo].length}) para Matrícula: {record.Matricula}</Text>
                                    <DataTable<Lectura>
                                        records={lecturasExpandidas[record.ID_Vehiculo]} // Solo LPR
                                        columns={lecturaColumns}
                                        minHeight={100}
                                        noRecordsText=""
                                        noRecordsIcon={<></>}
                                        withTableBorder={false}
                                    />
                                    </>
                                ) : (
                                    // Mostrar texto si no hay LPR (y no está cargando)
                                    !loadingLecturas[record.ID_Vehiculo] && 
                                    <Text c="dimmed" size="sm">No hay lecturas LPR registradas para este vehículo en este caso.</Text>
                                )}
                                {/* Mostrar botón GPS si existen */}
                                {(gpsLecturasExist[record.ID_Vehiculo] ?? false) && (
                                    <Button 
                                        mt="sm" 
                                        size="xs" 
                                        variant="outline"
                                        // onClick={() => { /* TODO: Implementar navegación/modal */ }}
                                    >
                                        Lecturas GPS
                                    </Button>
                                )}
                                {/* Mensaje de carga si aplica */}
                                {(loadingLecturas[record.ID_Vehiculo] ?? false) && (
                                     <Text c="dimmed" size="sm">Cargando lecturas...</Text>
                                )}
                            </Box>
                        ),
                    }}
                />
            </Paper>

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