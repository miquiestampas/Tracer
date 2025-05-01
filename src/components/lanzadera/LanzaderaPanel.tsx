import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Box, Title, Text, Group, TextInput, NumberInput, Button, LoadingOverlay, Alert, Paper, Stack, Grid, Collapse, ActionIcon, Chip, Badge, Modal, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { DataTable, type DataTableColumn } from 'mantine-datatable';
import { IconSearch, IconAlertCircle, IconLicense, IconClock, IconRepeat, IconChevronDown, IconChevronRight, IconMapPin, IconCar, IconCalendar, IconClockHour4, IconX, IconDeviceFloppy, IconBookmark, IconCheck, IconPlus } from '@tabler/icons-react';
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
import { ProgressOverlay } from '../common/ProgressOverlay';

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

// --- NUEVAS INTERFACES PARA DETECCIÓN DE LANZADERAS ---
interface LecturaLPR {
    id_lectura: number;
    matricula: string;
    timestamp: string;
    lector_id: string;
    lat?: number;
    lon?: number;
    sentido?: string;
}

interface EventoCorrelacion {
    timestamp_vehiculo_a: string;
    timestamp_vehiculo_b: string;
    lector_id: string;
    lat?: number;
    lon?: number;
    sentido?: string;
}

interface ResultadoLanzadera {
    matricula: string;
    total_correlaciones: number;
    fechas_unicas: number;
    eventos: EventoCorrelacion[];
}

interface ConfiguracionDeteccion {
    ventana_temporal: number; // en segundos
    distancia_maxima: number; // en metros
    umbral_mismo_dia: number;
    umbral_dias_distintos: number;
    lista_exclusion: string[];
}

interface PayloadLecturas {
    matriculas: string[];
    tipo_fuente: string;
    caso_id: number;
    fecha_inicio?: string;
    fecha_fin?: string;
}

// Valores por defecto para la configuración
const CONFIG_DEFAULT: ConfiguracionDeteccion = {
    ventana_temporal: 300, // 5 minutos
    distancia_maxima: 500, // 500 metros
    umbral_mismo_dia: 3,
    umbral_dias_distintos: 2,
    lista_exclusion: []
};

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

// --- FUNCIONES DE AYUDA PARA DETECCIÓN DE LANZADERAS ---
const calcularDistancia = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
};

const detectarLanzaderas = async (
    matriculaA: string | null,
    fechaInicio: Date | null,
    fechaFin: Date | null,
    casoId: number,
    config: ConfiguracionDeteccion = CONFIG_DEFAULT,
    lectoresFiltro: LectorFiltro[] = []
): Promise<ResultadoLanzadera[]> => {
    try {
        // Si NO hay matrícula objetivo, modo descubridor: buscar lanzaderas para todas las matrículas
        if (!matriculaA || matriculaA.trim() === '') {
            // 1. Obtener todas las lecturas filtradas por lectores/fechas
            const todasLecturasResp = await apiClient.post<LecturaLPR[]>('/lecturas/por_periodo', {
                caso_id: casoId,
                fecha_inicio: fechaInicio ? dayjs(fechaInicio).format('YYYY-MM-DD') : undefined,
                fecha_fin: fechaFin ? dayjs(fechaFin).format('YYYY-MM-DD') : undefined,
                tipo_fuente: 'LPR'
            });
            let lecturasFiltradas = todasLecturasResp.data;
            if (lectoresFiltro.length > 0) {
                lecturasFiltradas = lecturasFiltradas.filter(lectura => {
                    const lectorFiltro = lectoresFiltro.find(f => f.lector_id === lectura.lector_id);
                    if (!lectorFiltro) return false;
                    const lecturaFecha = dayjs(lectura.timestamp);
                    if (lectorFiltro.fecha_inicio && lecturaFecha.isBefore(lectorFiltro.fecha_inicio)) return false;
                    if (lectorFiltro.fecha_fin && lecturaFecha.isAfter(lectorFiltro.fecha_fin)) return false;
                    return true;
                });
            }
            // 2. Obtener todas las matrículas únicas
            const matriculasUnicas = [...new Set(lecturasFiltradas.map(l => l.matricula))];
            // 3. Ejecutar la lógica de lanzadera para cada matrícula
            let resultadosGlobal: ResultadoLanzadera[] = [];
            for (const matricula of matriculasUnicas) {
                // Llamada recursiva para cada matrícula
                const resultados = await detectarLanzaderas(
                    matricula,
                    fechaInicio,
                    fechaFin,
                    casoId,
                    config,
                    lectoresFiltro
                );
                resultadosGlobal = resultadosGlobal.concat(resultados);
            }
            // Eliminar duplicados por matrícula
            const resultadosUnicos = Object.values(
                resultadosGlobal.reduce((acc, curr) => {
                    if (!acc[curr.matricula] || acc[curr.matricula].total_correlaciones < curr.total_correlaciones) {
                        acc[curr.matricula] = curr;
                    }
                    return acc;
                }, {} as Record<string, ResultadoLanzadera>)
            );
            return resultadosUnicos.sort((a, b) => b.total_correlaciones - a.total_correlaciones);
        }
        // ... resto de la función igual ...
    } catch (error: any) {
        console.error('Error en detección de lanzaderas:', error);
        
        // Extraer el mensaje de error de la respuesta
        let errorMessage = 'Error desconocido al detectar lanzaderas';
        
        if (error.response?.data) {
            if (typeof error.response.data === 'string') {
                errorMessage = error.response.data;
            } else if (error.response.data.detail) {
                errorMessage = error.response.data.detail;
            } else if (error.response.data.message) {
                errorMessage = error.response.data.message;
            } else if (Array.isArray(error.response.data)) {
                errorMessage = error.response.data.map((err: any) => err.msg || err.message).join(', ');
            }
        } else if (error.message) {
            errorMessage = error.message;
        }

        throw new Error(errorMessage);
    }
};

// --- NUEVAS INTERFACES PARA FILTRADO DE LECTORES ---
interface LectorFiltro {
    lector_id: string;
    fecha_inicio?: string;
    fecha_fin?: string;
}

function LanzaderaPanel({ casoId }: LanzaderaPanelProps) {
    const [matriculaObjetivo, setMatriculaObjetivo] = useState('');
    const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
    const [fechaFin, setFechaFin] = useState<Date | null>(null);
    const [resultados, setResultados] = useState<ResultadoLanzadera[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [configuracion, setConfiguracion] = useState<ConfiguracionDeteccion>(CONFIG_DEFAULT);
    const [lectoresFiltro, setLectoresFiltro] = useState<LectorFiltro[]>([]);
    const [lectoresList, setLectoresList] = useState<{ value: string; label: string }[]>([]);
    const [modalLectorOpened, { open: openModalLector, close: closeModalLector }] = useDisclosure(false);

    const handleDetectar = async () => {
        // Permitir búsqueda si hay matrícula objetivo o al menos dos lectores
        const hayMatricula = matriculaObjetivo.trim() !== '';
        const hayMinimoLectores = lectoresFiltro.length >= 2;
        if (!hayMatricula && !hayMinimoLectores) {
            notifications.show({
                title: 'Faltan Datos',
                message: 'Debes especificar una matrícula objetivo o al menos dos lectores diferentes.',
                color: 'orange',
            });
            return;
        }
        setLoading(true);
        setError(null);
        setResultados([]);
        try {
            const resultados = await detectarLanzaderas(
                hayMatricula ? matriculaObjetivo.trim() : null,
                fechaInicio,
                fechaFin,
                casoId,
                configuracion,
                lectoresFiltro
            );
            setResultados(resultados);
            if (resultados.length === 0) {
                notifications.show({
                    title: 'Sin Resultados',
                    message: 'No se encontraron vehículos lanzadera para los criterios especificados.',
                    color: 'blue',
                });
            } else {
                notifications.show({
                    title: 'Detección Completada',
                    message: `Se encontraron ${resultados.length} vehículos lanzadera potenciales.`,
                    color: 'green',
                });
            }
        } catch (err: any) {
            console.error('Error en detección de lanzaderas:', err);
            let errorMsg = 'Error desconocido al detectar lanzaderas.';
            if (err.response?.data) {
                if (typeof err.response.data === 'string') {
                    errorMsg = err.response.data;
                } else if (err.response.data.detail) {
                    errorMsg = err.response.data.detail;
                } else if (err.response.data.message) {
                    errorMsg = err.response.data.message;
                }
            } else if (err.message) {
                errorMsg = err.message;
            }
            setError(errorMsg);
            notifications.show({
                title: 'Error en Detección',
                message: errorMsg,
                color: 'red',
            });
        } finally {
            setLoading(false);
        }
    };

    // Función para cargar la lista de lectores SOLO del caso actual
    useEffect(() => {
        const cargarLectores = async () => {
            try {
                const response = await apiClient.get(`/casos/${casoId}/lectores`);
                if (response.data && Array.isArray(response.data)) {
                    setLectoresList(response.data.map(lector => ({
                        value: lector.ID_Lector,
                        label: `${lector.ID_Lector} - ${lector.Nombre || 'Sin nombre'}`
                    })));
                }
            } catch (error) {
                console.error('Error al cargar lectores del caso:', error);
            }
        };
        cargarLectores();
    }, [casoId]);

    // Función para añadir un nuevo lector al filtro
    const handleAddLector = (lector_id: string, fecha_inicio?: string, fecha_fin?: string) => {
        setLectoresFiltro(prev => [...prev, { lector_id, fecha_inicio, fecha_fin }]);
        closeModalLector();
    };

    // Función para eliminar un lector del filtro
    const handleRemoveLector = (index: number) => {
        setLectoresFiltro(prev => prev.filter((_, i) => i !== index));
    };

    // Componente Modal para añadir lectores
    const AddLectorModal = () => {
        const [selectedLector, setSelectedLector] = useState<string | null>(null);
        const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
        const [fechaFin, setFechaFin] = useState<Date | null>(null);

        const handleSubmit = () => {
            if (!selectedLector) {
                notifications.show({
                    title: 'Error',
                    message: 'Debes seleccionar un lector',
                    color: 'red',
                });
                return;
            }

            handleAddLector(
                selectedLector,
                fechaInicio ? dayjs(fechaInicio).format('YYYY-MM-DD') : undefined,
                fechaFin ? dayjs(fechaFin).format('YYYY-MM-DD') : undefined
            );
        };

        return (
            <Modal
                opened={modalLectorOpened}
                onClose={closeModalLector}
                title="Añadir Lector al Filtro"
                size="md"
            >
                <Stack>
                    <Select
                        label="Seleccionar Lector"
                        placeholder="Buscar lector..."
                        data={lectoresList}
                        value={selectedLector}
                        onChange={setSelectedLector}
                        searchable
                        required
                    />
                    <DatePickerInput
                        label="Fecha Inicio (Opcional)"
                        placeholder="Seleccionar fecha inicio..."
                        value={fechaInicio}
                        onChange={setFechaInicio}
                        clearable
                    />
                    <DatePickerInput
                        label="Fecha Fin (Opcional)"
                        placeholder="Seleccionar fecha fin..."
                        value={fechaFin}
                        onChange={setFechaFin}
                        clearable
                    />
                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={closeModalLector}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSubmit}>
                            Añadir
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        );
    };

    return (
        <Stack gap="lg">
            <Paper shadow="sm" p="md" withBorder>
                <Stack>
                    <Title order={4} mb="sm">Detección de Vehículos Lanzadera</Title>
                    <Grid gutter="md">
                        <Grid.Col span={{ base: 12, md: 6 }}>
                            <TextInput
                                label="Matrícula Objetivo"
                                placeholder="Introduce la matrícula del vehículo primario"
                                value={matriculaObjetivo}
                                onChange={(event) => setMatriculaObjetivo(event.currentTarget.value)}
                                leftSection={<IconLicense size={16} />}
                                required
                            />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 3 }}>
                            <DatePickerInput
                                label="Fecha Inicio"
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
                                label="Fecha Fin"
                                placeholder="Hasta..."
                                value={fechaFin}
                                onChange={setFechaFin}
                                clearable
                                leftSection={<IconCalendar size={16} />}
                                valueFormat="DD/MM/YYYY"
                            />
                        </Grid.Col>
                    </Grid>

                    {/* Sección de Filtros por Lector */}
                    <Box>
                        <Group justify="space-between" mb="xs">
                            <Text fw={500}>Filtros por Lector</Text>
                            <Button
                                variant="light"
                                leftSection={<IconPlus size={16} />}
                                onClick={openModalLector}
                            >
                                Añadir Lector
                            </Button>
                        </Group>
                        {lectoresFiltro.length > 0 ? (
                            <Stack gap="xs">
                                {lectoresFiltro.map((filtro, index) => (
                                    <Paper key={index} p="xs" withBorder>
                                        <Group justify="space-between">
                                            <Text>
                                                {lectoresList.find(l => l.value === filtro.lector_id)?.label || filtro.lector_id}
                                                {filtro.fecha_inicio && (
                                                    <Text component="span" c="dimmed" ml="sm">
                                                        Desde: {dayjs(filtro.fecha_inicio).format('DD/MM/YYYY')}
                                                    </Text>
                                                )}
                                                {filtro.fecha_fin && (
                                                    <Text component="span" c="dimmed" ml="sm">
                                                        Hasta: {dayjs(filtro.fecha_fin).format('DD/MM/YYYY')}
                                                    </Text>
                                                )}
                                            </Text>
                                            <ActionIcon
                                                variant="subtle"
                                                color="red"
                                                onClick={() => handleRemoveLector(index)}
                                            >
                                                <IconX size={16} />
                                            </ActionIcon>
                                        </Group>
                                    </Paper>
                                ))}
                            </Stack>
                        ) : (
                            <Text c="dimmed" ta="center" py="md">
                                No hay lectores añadidos al filtro
                            </Text>
                        )}
                    </Box>

                    <Group justify="flex-end">
                        <Button
                            onClick={handleDetectar}
                            loading={loading}
                            leftSection={<IconSearch size={16} />}
                            disabled={lectoresFiltro.length > 0 && lectoresFiltro.length < 2}
                        >
                            Detectar Lanzaderas
                        </Button>
                    </Group>
                </Stack>
            </Paper>

            {error && (
                <Alert title="Error" color="red" icon={<IconAlertCircle />}>
                    {typeof error === 'string' ? error : JSON.stringify(error)}
                </Alert>
            )}

            {resultados.length > 0 && (
                <Paper shadow="sm" p="md" withBorder>
                    <Title order={4} mb="md">Resultados de Detección</Title>
                    <DataTable
                        records={resultados}
                        columns={[
                            {
                                accessor: 'matricula',
                                title: 'Matrícula',
                                sortable: true,
                            },
                            {
                                accessor: 'total_correlaciones',
                                title: 'Correlaciones',
                                sortable: true,
                                render: ({ total_correlaciones }) => (
                                    <Badge color="blue" variant="light">
                                        {total_correlaciones}
                                    </Badge>
                                ),
                            },
                            {
                                accessor: 'fechas_unicas',
                                title: 'Días Únicos',
                                sortable: true,
                                render: ({ fechas_unicas }) => (
                                    <Badge color="green" variant="light">
                                        {fechas_unicas}
                                    </Badge>
                                ),
                            },
                            {
                                accessor: 'eventos',
                                title: 'Detalles',
                                render: ({ eventos }) => (
                                    <Button
                                        variant="subtle"
                                        size="xs"
                                        onClick={() => {
                                            // TODO: Implementar vista detallada de eventos
                                            console.log('Eventos:', eventos);
                                        }}
                                    >
                                        Ver Detalles
                                    </Button>
                                ),
                            },
                        ]}
                        minHeight={150}
                        withTableBorder
                        borderRadius="sm"
                        withColumnBorders
                        striped
                        highlightOnHover
                    />
                </Paper>
            )}

            <AddLectorModal />
        </Stack>
    );
}

export default LanzaderaPanel; 