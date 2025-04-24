import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Box, Title, Text, Group, TextInput, NumberInput, Button, LoadingOverlay, Alert, Paper, Stack, Grid, Collapse, ActionIcon, Chip, Badge } from '@mantine/core';
import { DataTable, type DataTableColumn } from 'mantine-datatable';
import { IconSearch, IconAlertCircle, IconLicense, IconClock, IconRepeat, IconChevronDown, IconChevronRight, IconMapPin, IconCar, IconCalendar, IconClockHour4, IconX, IconDeviceFloppy, IconBookmark, IconCheck } from '@tabler/icons-react';
import apiClient from '../../services/api'; // Asumimos que tienes apiClient configurado
import { notifications } from '@mantine/notifications';
import dayjs from 'dayjs'; // Importar dayjs para formatear fechas
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet'; // Importar L para manejar el icono
import 'leaflet/dist/leaflet.css';
import { DatePickerInput, TimeInput } from '@mantine/dates';
import '@mantine/dates/styles.css'; // Importar estilos para dates
import appEventEmitter from '../../utils/eventEmitter'; // Importar event emitter
import type { Lectura } from '../../types/data'; // Añadir import de Lectura

interface LanzaderaPanelProps {
    casoId: number;
}

// --- INTERFACES BASADAS EN NUEVOS SCHEMAS --- 
interface CoincidenciaDetalle {
    lector_id: string | null;
    // timestamp: string; // Eliminado
    lat?: number | null;
    lon?: number | null;
    matriculas_par: string[]; 
    sentido?: string | null;
    orientacion?: string | null;
    // Añadir timestamps individuales
    timestamp_vehiculo_1: string; // API devuelve ISO string
    timestamp_vehiculo_2: string; // API devuelve ISO string
    lectura_verificada: boolean;
    id_lectura_1?: number | null;
    id_lectura_2?: number | null;
}

interface ConvoyDetectionResponse {
    vehiculos_en_convoy: string[];
    detalles_coocurrencias: CoincidenciaDetalle[];
}
// --- FIN NUEVAS INTERFACES ---

// --- Componente Auxiliar Mapa (Definido FUERA) ---
const ChangeView = ({ bounds }: { bounds: L.LatLngBounds | null }) => {
    const map = useMap();
    useEffect(() => {
        if (bounds && bounds.isValid()) {
            console.log("[ChangeView] Fitting bounds:", bounds.toBBoxString());
            try {
                 map.fitBounds(bounds, { padding: [50, 50] });
            } catch (e) {
                 console.error("[ChangeView] Error fitting bounds:", e);
            }
        } else {
            // console.log("[ChangeView] Invalid or null bounds, not fitting.");
        }
    }, [map, bounds]); 
    return null; // Este componente no renderiza nada visualmente
};
// --- Fin Componente Auxiliar Mapa ---

function LanzaderaPanel({ casoId }: LanzaderaPanelProps) {
    const [ventanaTiempo, setVentanaTiempo] = useState<number | ''>(60);
    const [minCoincidencias, setMinCoincidencias] = useState<number | ''>(2);
    const [matriculaObjetivo, setMatriculaObjetivo] = useState('');
    const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
    const [fechaFin, setFechaFin] = useState<Date | null>(null);
    const [horaInicio, setHoraInicio] = useState('');
    const [horaFin, setHoraFin] = useState('');
    
    const [apiResponse, setApiResponse] = useState<ConvoyDetectionResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedRecordIds, setExpandedRecordIds] = useState<Record<string, boolean>>({});
    const [debugInfo, setDebugInfo] = useState<string>('Inicializando...');
    const [vehiculosActivos, setVehiculosActivos] = useState<Set<string>>(new Set());
    const [savingSeleccionados, setSavingSeleccionados] = useState(false);
    const [markingRelevant, setMarkingRelevant] = useState(false);

    const handleDetectar = useCallback(async () => {
        if (ventanaTiempo === '' || minCoincidencias === '') {
            notifications.show({
                title: 'Faltan Parámetros',
                message: 'Ventana de tiempo y Mín. Coincidencias son obligatorios.',
                color: 'orange',
            });
            return;
        }

        setLoading(true);
        setError(null);
        setApiResponse(null);
        setVehiculosActivos(new Set());

        const payload: any = {
            ventana_tiempo_segundos: Number(ventanaTiempo),
            min_coincidencias: Number(minCoincidencias),
        };
        if (matriculaObjetivo.trim()) {
            payload.matricula_objetivo = matriculaObjetivo.trim();
        }
        if (fechaInicio) {
            payload.fecha_inicio = dayjs(fechaInicio).format('YYYY-MM-DD');
        }
        if (fechaFin) {
            payload.fecha_fin = dayjs(fechaFin).format('YYYY-MM-DD');
        }
        if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(horaInicio)) {
            payload.hora_inicio = horaInicio;
        } else if (horaInicio) {
            console.warn('Formato hora inicio inválido, no se enviará.');
        }
        if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(horaFin)) {
            payload.hora_fin = horaFin;
        } else if (horaFin) {
            console.warn('Formato hora fin inválido, no se enviará.');
        }

        try {
            console.log("Enviando payload detección convoyes:", payload);
            const response = await apiClient.post<ConvoyDetectionResponse>(`/casos/${casoId}/lanzaderas/detectar`, payload);
            
            setApiResponse(response.data || { vehiculos_en_convoy: [], detalles_coocurrencias: [] });

            if (response.data?.vehiculos_en_convoy?.length > 0) {
                notifications.show({
                    title: 'Detección Completada',
                    message: `Se encontraron ${response.data.vehiculos_en_convoy.length} vehículos involucrados en convoyes.`,
                    color: 'green',
                });
            } else {
                 notifications.show({
                    title: 'Detección Completada',
                    message: 'No se encontraron convoyes con los criterios especificados.',
                    color: 'blue',
                });
            }

        } catch (err: any) {
            console.error("Error en detección de convoyes:", err);
            const errorMsg = err.response?.data?.detail || err.message || 'Error desconocido al detectar convoyes.';
            setError(errorMsg);
            setApiResponse({ vehiculos_en_convoy: [], detalles_coocurrencias: [] });
            notifications.show({
                title: 'Error en Detección',
                message: errorMsg,
                color: 'red',
            });
        } finally {
            setLoading(false);
        }
    }, [casoId, ventanaTiempo, minCoincidencias, matriculaObjetivo, fechaInicio, fechaFin, horaInicio, horaFin]);

    const columns: DataTableColumn<CoincidenciaDetalle>[] = [
        {
            accessor: 'expand',
            title: '',
            width: 60,
            textAlign: 'center',
            render: (record) => {
                const recordId = record.matriculas_par.join('-');
                const isExpanded = expandedRecordIds[recordId] ?? false;
                return (
                    <ActionIcon
                        variant="subtle"
                        onClick={() => setExpandedRecordIds(prev => ({ ...prev, [recordId]: !isExpanded }))}
                    >
                        {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                    </ActionIcon>
                );
            },
        },
        {
            accessor: 'matriculas_par',
            title: 'Convoy de Vehículos', 
            sortable: true,
            render: (record) => record.matriculas_par.join(' / '), 
        },
        { accessor: 'lector_id', title: 'Lector', width: 120, sortable: true, textAlign: 'right' },
    ];

    const detallesFiltrados = useMemo(() => {
        if (!apiResponse || vehiculosActivos.size === 0) {
            return [];
        }
        return apiResponse.detalles_coocurrencias.filter(detalle => 
            detalle.matriculas_par.some(matricula => vehiculosActivos.has(matricula))
        );
    }, [apiResponse, vehiculosActivos]);

    const marcadoresMapa = useMemo(() => {
        const markers: { lat: number; lon: number; popupContent: React.ReactNode }[] = [];
        detallesFiltrados.forEach((detalle) => {
            if (detalle.lat != null && detalle.lon != null) {
                const convoyTitle = detalle.matriculas_par.join(' / ');
                markers.push({
                    lat: detalle.lat,
                    lon: detalle.lon,
                    popupContent: (
                        <Stack gap={2}>
                            <Text size="sm" fw={500}>{convoyTitle}</Text>
                            <Text size="xs">Lector: {detalle.lector_id || 'N/A'}</Text>
                            {/* Mostrar ambos timestamps en popup */}
                            <Text size="xs">Hora Veh. 1: {dayjs(detalle.timestamp_vehiculo_1).format('HH:mm:ss')}</Text>
                            <Text size="xs">Hora Veh. 2: {dayjs(detalle.timestamp_vehiculo_2).format('HH:mm:ss')}</Text>
                            <Text size="xs">Fecha: {dayjs(detalle.timestamp_vehiculo_1).format('DD/MM/YYYY')}</Text>
                        </Stack>
                    )
                });
            }
        });
        console.log("[LanzaderaPanel] Marcadores calculados:", markers.length);
        return markers;
    }, [detallesFiltrados]);

    const mapBounds = useMemo(() => {
        const points = marcadoresMapa
            .map(m => [m.lat, m.lon] as L.LatLngTuple);
        if (points.length > 0) {
            const bounds = L.latLngBounds(points);
            console.log("[LanzaderaPanel] Bounds calculados:", bounds.toBBoxString());
            return bounds.isValid() ? bounds : null;
        }
        console.log("[LanzaderaPanel] No hay puntos válidos para calcular bounds.");
        return null;
    }, [marcadoresMapa]);

    const initialCenter: L.LatLngTuple = useMemo(() => {
        if (mapBounds && mapBounds.isValid()) {
            const center = mapBounds.getCenter();
            return [center.lat, center.lng];
        }
        if (marcadoresMapa.length > 0 && typeof marcadoresMapa[0].lat === 'number' && typeof marcadoresMapa[0].lon === 'number') {
            return [marcadoresMapa[0].lat, marcadoresMapa[0].lon];
        }
        return [40.416775, -3.703790];
    }, [marcadoresMapa, mapBounds]);

    const initialZoom = useMemo(() => { 
        return marcadoresMapa.length > 0 ? 13 : 6;
    }, [marcadoresMapa]);

    useEffect(() => {
        const info = `[Debug useEffect] Vehiculos En Convoy: ${apiResponse?.vehiculos_en_convoy?.length ?? 0}, Activos: ${vehiculosActivos.size}, Detalles Filtrados: ${detallesFiltrados.length}, Marcadores: ${marcadoresMapa.length}`;
        console.log(info);
        setDebugInfo(info);
    }, [apiResponse, vehiculosActivos, detallesFiltrados, marcadoresMapa]);

    const handleVehiculoActivoChange = (matricula: string) => {
        setVehiculosActivos(prev => {
            const newSet = new Set(prev);
            if (newSet.has(matricula)) {
                newSet.delete(matricula);
            } else {
                newSet.add(matricula);
            }
            return newSet;
        });
    };

    const handleGuardarSeleccionados = async () => {
        const matriculasAGuardar = Array.from(vehiculosActivos);
        if (matriculasAGuardar.length === 0) return;

        setSavingSeleccionados(true);
        const notificationId = notifications.show({
            loading: true,
            title: 'Guardando Vehículos',
            message: `Guardando ${matriculasAGuardar.length} vehículo(s) seleccionado(s)...`,
            autoClose: false,
            withCloseButton: false,
        });

        const results = await Promise.allSettled(
            matriculasAGuardar.map(matricula => apiClient.post('/vehiculos', { Matricula: matricula }))
        );

        let creados = 0;
        let existentes = 0;
        let errores = 0;

        results.forEach((result, index) => {
            const matricula = matriculasAGuardar[index];
            if (result.status === 'fulfilled') {
                // Asumimos que 201 es creado y 200 (o similar si la API devuelve existente) es 'ya existía'
                // Esto puede necesitar ajuste según la implementación exacta de POST /vehiculos
                if (result.value.status === 201) {
                    creados++;
                } else {
                    // Podríamos ser más específicos si la API devuelve un código diferente para 'existente'
                    existentes++; 
                }
            } else {
                errores++;
                console.error(`Error guardando vehículo ${matricula}:`, result.reason);
            }
        });

        setSavingSeleccionados(false);
        
        let message = '';
        let color: 'green' | 'blue' | 'orange' | 'red' = 'green';

        if (creados > 0) message += `${creados} guardado(s). `;
        if (existentes > 0) message += `${existentes} ya existente(s). `;
        if (errores > 0) {
             message += `${errores} con error.`;
             color = creados > 0 || existentes > 0 ? 'orange' : 'red';
        } else if (creados === 0 && existentes > 0) {
            color = 'blue'; // Todos existían
        }
        
        notifications.update({
            id: notificationId,
            title: 'Guardado Completado',
            message: message.trim() || 'No se realizaron cambios.',
            color: color,
            loading: false,
            withCloseButton: true,
            autoClose: 5000,
        });

        // Emitir evento si hubo cambios (creados)
        if (creados > 0) {
            appEventEmitter.emit('listaVehiculosCambiada');
        }
    };

    const handleMarcarRelevantes = async () => {
        const matriculasAMarcar = Array.from(vehiculosActivos);
        if (matriculasAMarcar.length === 0) return;

        setMarkingRelevant(true);
        const initialNotifId = notifications.show({
            loading: true,
            title: 'Marcando Lecturas Relevantes',
            message: `Buscando lecturas para ${matriculasAMarcar.length} vehículo(s)...`,
            autoClose: false,
            withCloseButton: false,
        });

        let idsLecturas: number[] = [];
        try {
            // 1. Obtener IDs de todas las lecturas para las matrículas seleccionadas en este caso
            const lecturasResponse = await apiClient.post<Lectura[]>('/lecturas/por_matriculas_y_filtros_combinados', {
                matriculas: matriculasAMarcar,
                caso_id: casoId,
                tipo_fuente: 'LPR' // O podríamos buscar ambos LPR y GPS si fuera necesario
            });
            idsLecturas = lecturasResponse.data.map(l => l.ID_Lectura);
            
            if (idsLecturas.length === 0) {
                 notifications.update({
                    id: initialNotifId,
                    title: 'Sin Lecturas',
                    message: 'No se encontraron lecturas para los vehículos seleccionados en este caso.',
                    color: 'orange',
                    loading: false,
                    withCloseButton: true,
                    autoClose: 5000,
                });
                setMarkingRelevant(false);
                return;
            }

            notifications.update({
                id: initialNotifId,
                title: 'Marcando Lecturas Relevantes',
                message: `Marcando ${idsLecturas.length} lectura(s) como relevante(s)...`,
                loading: true,
            });

            // 2. Llamar a la API para marcar cada lectura
            const results = await Promise.allSettled(
                idsLecturas.map(idLectura => apiClient.post(`/lecturas/${idLectura}/marcar_relevante`, { caso_id: casoId }))
            );

            let successes = 0;
            let errors = 0;
            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    successes++;
                } else {
                    errors++;
                    console.error("Error marcando lectura relevante:", result.reason);
                }
            });
            
            notifications.update({
                id: initialNotifId,
                title: 'Marcado Completado',
                message: `${successes} lecturas marcadas como relevantes.` + (errors > 0 ? ` ${errors} fallaron.` : ''),
                color: errors > 0 ? 'orange' : 'green',
                loading: false,
                withCloseButton: true,
                autoClose: 5000,
            });

        } catch (error: any) {
            console.error("Error en el proceso de marcar lecturas relevantes:", error);
            notifications.update({
                id: initialNotifId,
                title: 'Error General',
                message: error.response?.data?.detail || 'No se pudieron marcar las lecturas relevantes.',
                color: 'red',
                loading: false,
                withCloseButton: true,
                autoClose: 5000,
            });
        } finally {
            setMarkingRelevant(false);
        }
    };

    return (
        <Stack gap="lg">
             {/* Sección de Controles Actualizada */}
             <Paper shadow="sm" p="md" withBorder>
                <Stack>
                    <Title order={4} mb="sm">Parámetros de Detección de Convoy</Title>
                    <Grid gutter="md">
                        <Grid.Col span={{ base: 12, md: 4 }}>
                            <TextInput
                                label="Matrícula Objetivo (Opcional)"
                                placeholder="Filtrar por esta matrícula"
                                value={matriculaObjetivo}
                                onChange={(event) => setMatriculaObjetivo(event.currentTarget.value)}
                                leftSection={<IconLicense size={16} />}
                            />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 4 }}>
                             <NumberInput
                                label="Ventana Tiempo (segundos)"
                                value={ventanaTiempo}
                                onChange={(value) => setVentanaTiempo(typeof value === 'number' ? value : '')}
                                min={1} step={10} required 
                                leftSection={<IconClock size={16} />}
                            />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 4 }}>
                            <NumberInput
                                label="Mín. Coincidencias"
                                value={minCoincidencias}
                                onChange={(value) => setMinCoincidencias(typeof value === 'number' ? value : '')}
                                min={2} step={1} required 
                                leftSection={<IconRepeat size={16} />}
                            />
                        </Grid.Col>
                    </Grid>
                    <Grid gutter="md" align="flex-end">
                        <Grid.Col span={{ base: 12, md: 3 }}>
                            <DatePickerInput
                                label="Fecha Inicio (Opcional)"
                                placeholder="Desde..."
                                value={fechaInicio}
                                onChange={setFechaInicio}
                                clearable
                                leftSection={<IconCalendar size={16} />}
                                valueFormat="DD/MM/YYYY"
                            />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 3 }}>
                             <DatePickerInput
                                label="Fecha Fin (Opcional)"
                                placeholder="Hasta..."
                                value={fechaFin}
                                onChange={setFechaFin}
                                clearable
                                leftSection={<IconCalendar size={16} />}
                                valueFormat="DD/MM/YYYY"
                            />
                        </Grid.Col>
                         <Grid.Col span={{ base: 12, md: 2 }}>
                            <TimeInput
                                label="Hora Inicio (Opc)"
                                placeholder="HH:MM"
                                value={horaInicio}
                                onChange={(event) => setHoraInicio(event.currentTarget.value)}
                                rightSection={
                                    horaInicio ? (
                                        <ActionIcon onClick={() => setHoraInicio('')} variant="subtle" size="xs">
                                            <IconX size={14} />
                                        </ActionIcon>
                                    ) : null
                                }
                                leftSection={<IconClockHour4 size={16} />}
                            />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 2 }}>
                             <TimeInput
                                label="Hora Fin (Opc)"
                                placeholder="HH:MM"
                                value={horaFin}
                                onChange={(event) => setHoraFin(event.currentTarget.value)}
                                rightSection={
                                    horaFin ? (
                                        <ActionIcon onClick={() => setHoraFin('')} variant="subtle" size="xs">
                                            <IconX size={14} />
                                        </ActionIcon>
                                    ) : null
                                }
                                leftSection={<IconClockHour4 size={16} />}
                            />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 2 }}>
                            <Button
                                onClick={handleDetectar}
                                loading={loading}
                                leftSection={<IconSearch size={16} />}
                                fullWidth 
                            >
                                Detectar Convoy
                            </Button>
                        </Grid.Col>
                    </Grid>
                </Stack>
            </Paper>

            {/* Sección de Resultados */}
            <Paper shadow="sm" p="md" withBorder style={{ position: 'relative' }}>
                 <LoadingOverlay visible={loading && !apiResponse} />
                 {apiResponse && <Title order={4} mb="md">Resultados de Detección ({apiResponse.vehiculos_en_convoy.length} Vehículos)</Title>}
                 {error && (
                     <Alert title="Error" color="red" icon={<IconAlertCircle />} mb="md">
                         {error}
                     </Alert>
                 )}
                 {apiResponse && apiResponse.vehiculos_en_convoy.length > 0 && (
                    <Box mb="md">
                         <Text size="sm" fw={500} mb={5}>Selecciona vehículos para ver detalles y mapa:</Text>
                         <Group justify="space-between" align="center" wrap="nowrap">
                            <Box style={{ flexGrow: 1, overflow: 'hidden' }}>
                                <Chip.Group multiple value={Array.from(vehiculosActivos)} onChange={(values) => setVehiculosActivos(new Set(values))}>
                                    <Group gap={7} style={{ flexWrap: 'wrap' }}>
                                        {apiResponse.vehiculos_en_convoy.map((matricula) => (
                                            <Chip 
                                                key={matricula} 
                                                value={matricula}
                                                variant="outline"
                                                disabled={loading}
                                            >
                                                {matricula}
                                            </Chip>
                                        ))}
                                    </Group>
                                </Chip.Group>
                            </Box>
                            <Group gap="xs" style={{ flexShrink: 0 }}>
                                <Button
                                    variant="outline"
                                    color="green"
                                    size="xs"
                                    leftSection={<IconCar size={16} />}
                                    onClick={handleGuardarSeleccionados}
                                    disabled={vehiculosActivos.size === 0 || savingSeleccionados || markingRelevant}
                                    loading={savingSeleccionados}
                                >
                                    Guardar Vehículos ({vehiculosActivos.size})
                                </Button>
                                <Button
                                    variant="outline"
                                    color="yellow"
                                    size="xs"
                                    leftSection={<IconBookmark size={16} />}
                                    onClick={handleMarcarRelevantes}
                                    disabled={vehiculosActivos.size === 0 || savingSeleccionados || markingRelevant}
                                    loading={markingRelevant}
                                >
                                    Marcar Relevantes ({vehiculosActivos.size})
                                </Button>
                            </Group>
                         </Group>
                    </Box>
                 )}
                 {!loading && !apiResponse && !error && (
                     <Text c="dimmed" ta="center" mt="md">
                        Ejecuta la detección para ver resultados.
                    </Text>
                )}
                {!loading && apiResponse && apiResponse.vehiculos_en_convoy.length === 0 && !error && (
                    <Text c="dimmed" ta="center" mt="md">
                        No se han detectado convoyes con los criterios especificados.
                    </Text>
                )}
                {vehiculosActivos.size > 0 && detallesFiltrados.length > 0 && (
                    <Box mt="sm">
                        <Title order={5} mb="xs">Detalles de Co-ocurrencias ({detallesFiltrados.length})</Title>
                        <DataTable<CoincidenciaDetalle>
                            records={detallesFiltrados} 
                            columns={[
                                { accessor: 'matriculas_par', title:'Par Convoy', render: (d) => d.matriculas_par.join(' / '), width: 180 }, 
                                { accessor: 'lector_id', title: 'Lector', render: (d) => d.lector_id || 'N/A' }, 
                                { accessor: 'sentido', title: 'Sentido', render: (d) => d.sentido || '-' }, 
                                { accessor: 'orientacion', title: 'Orientación', render: (d) => d.orientacion || '-' }, 
                                {
                                    accessor: 'timestamp_vehiculo_1',
                                    title: 'Fecha/Hora Veh. 1', 
                                    render: (d) => (
                                        <Group gap={4}>
                                            <Text>{dayjs(d.timestamp_vehiculo_1).format('DD/MM/YY HH:mm:ss')}</Text>
                                            {d.lectura_verificada && (
                                                <IconCheck size={14} color="green" />
                                            )}
                                        </Group>
                                    ),
                                    width: 190,
                                },
                                {
                                    accessor: 'timestamp_vehiculo_2',
                                    title: 'Fecha/Hora Veh. 2', 
                                    render: (d) => (
                                        <Group gap={4}>
                                            <Text>{dayjs(d.timestamp_vehiculo_2).format('DD/MM/YY HH:mm:ss')}</Text>
                                            {d.lectura_verificada && (
                                                <IconCheck size={14} color="green" />
                                            )}
                                        </Group>
                                    ),
                                    width: 190,
                                },
                                { accessor: 'lat', title: 'Latitud', render: (d) => d.lat?.toFixed(6) ?? '-' }, 
                                { accessor: 'lon', title: 'Longitud', render: (d) => d.lon?.toFixed(6) ?? '-' },
                                {
                                    accessor: 'lectura_verificada',
                                    title: 'Verificado',
                                    render: (d) => (
                                        <Badge color={d.lectura_verificada ? 'green' : 'red'}>
                                            {d.lectura_verificada ? 'Sí' : 'No'}
                                        </Badge>
                                    ),
                                    width: 100,
                                }
                            ]}
                            minHeight={150}
                            withTableBorder 
                            borderRadius="sm" 
                            withColumnBorders 
                            striped 
                            highlightOnHover
                            noRecordsText=""
                            noRecordsIcon={<></>}
                            idAccessor={(d) => `${d.matriculas_par.join('-')}-${d.lector_id}-${d.timestamp_vehiculo_1}-${d.timestamp_vehiculo_2}`}
                        />
                    </Box>
                )}
                {vehiculosActivos.size > 0 && detallesFiltrados.length === 0 && !loading &&(
                     <Text c="dimmed" ta="center" mt="md">
                        No se encontraron detalles de co-ocurrencia para los vehículos seleccionados.
                    </Text>
                )}
            </Paper>

            {/* --- Sección de Mapa (Corregida) --- */}
            {vehiculosActivos.size > 0 && marcadoresMapa.length > 0 && (
                 <Paper shadow="sm" p="md" withBorder>
                     <Title order={4} mb="md">Mapa de Co-ocurrencias ({Array.from(vehiculosActivos).join(' / ')})</Title>
                     <Box style={{ height: '500px', width: '100%' }}>
                         <MapContainer
                            key={Array.from(vehiculosActivos).sort().join('-')}
                            center={initialCenter}
                            zoom={initialZoom}
                            style={{ height: '100%', width: '100%' }}
                            scrollWheelZoom={true}
                         >
                             <TileLayer
                                 url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                 attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                             />
                             <ChangeView bounds={mapBounds} />
                             {marcadoresMapa.map((marker, index) => (
                                 <Marker 
                                    key={`marker-${Array.from(vehiculosActivos).sort().join('-')}-${index}`}
                                    position={[marker.lat, marker.lon]}
                                >
                                     <Popup>{marker.popupContent}</Popup>
                                 </Marker>
                             ))}
                         </MapContainer>
                     </Box>
                 </Paper>
            )}
            {vehiculosActivos.size > 0 && marcadoresMapa.length === 0 && !loading && (
                 <Alert title="Mapa no disponible" color="blue" icon={<IconMapPin />} >
                    No se encontraron coordenadas para las co-ocurrencias de los vehículos seleccionados.
                 </Alert>
             )}
        </Stack>
    );
}

export default LanzaderaPanel; 