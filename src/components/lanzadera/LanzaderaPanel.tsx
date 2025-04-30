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
    matriculaA: string,
    fechaInicio: Date | null,
    fechaFin: Date | null,
    casoId: number,
    config: ConfiguracionDeteccion = CONFIG_DEFAULT
): Promise<ResultadoLanzadera[]> => {
    try {
        // 1. Preparación de Datos
        const payload: PayloadLecturas = {
            matriculas: [matriculaA],
            tipo_fuente: 'LPR',
            caso_id: casoId
        };

        // Añadir fechas solo si están definidas
        if (fechaInicio) {
            payload.fecha_inicio = dayjs(fechaInicio).format('YYYY-MM-DD');
        }
        if (fechaFin) {
            payload.fecha_fin = dayjs(fechaFin).format('YYYY-MM-DD');
        }

        // Validar payload antes de enviar
        if (!payload.matriculas || !Array.isArray(payload.matriculas) || payload.matriculas.length === 0) {
            throw new Error('La matrícula objetivo es requerida');
        }

        if (!payload.caso_id) {
            throw new Error('El ID del caso es requerido');
        }

        console.log('Enviando payload a la API:', payload);

        const response = await apiClient.post<LecturaLPR[]>('/lecturas/por_matriculas_y_filtros_combinados', payload);

        if (!response.data || !Array.isArray(response.data)) {
            throw new Error('Respuesta inválida del servidor');
        }

        const lecturasA = response.data
            .filter(l => l.matricula === matriculaA)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        if (lecturasA.length === 0) {
            return [];
        }

        // Obtener todas las lecturas del periodo para identificar candidatos
        const todasLecturas = await apiClient.post<LecturaLPR[]>('/lecturas/por_periodo', {
            caso_id: casoId,
            fecha_inicio: payload.fecha_inicio,
            fecha_fin: payload.fecha_fin,
            tipo_fuente: 'LPR'
        });

        if (!todasLecturas.data || !Array.isArray(todasLecturas.data)) {
            throw new Error('Respuesta inválida del servidor al obtener lecturas del periodo');
        }

        // Filtrar candidatos (excluyendo A y la lista de exclusión)
        const matriculasCandidatas = [...new Set(todasLecturas.data
            .map(l => l.matricula)
            .filter(m => m !== matriculaA && !config.lista_exclusion.includes(m)))];

        const resultados: ResultadoLanzadera[] = [];

        // 2. Iteración por Candidatos
        for (const matriculaB of matriculasCandidatas) {
            const lecturasB = todasLecturas.data
                .filter(l => l.matricula === matriculaB)
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            const eventosCorrelacion: EventoCorrelacion[] = [];

            // 3. Algoritmo de Correlación
            for (const lecturaA of lecturasA) {
                const timestampA = new Date(lecturaA.timestamp).getTime();

                // Buscar lecturas de B dentro de la ventana temporal
                const lecturasBEnVentana = lecturasB.filter(lecturaB => {
                    const timestampB = new Date(lecturaB.timestamp).getTime();
                    const diferenciaTiempo = Math.abs(timestampB - timestampA) / 1000; // en segundos

                    if (diferenciaTiempo > config.ventana_temporal) {
                        return false;
                    }

                    // Verificar criterio espacial
                    if (lecturaA.lector_id === lecturaB.lector_id) {
                        return true;
                    }

                    if (lecturaA.lat && lecturaA.lon && lecturaB.lat && lecturaB.lon) {
                        const distancia = calcularDistancia(
                            lecturaA.lat, lecturaA.lon,
                            lecturaB.lat, lecturaB.lon
                        );
                        if (distancia <= config.distancia_maxima) {
                            return true;
                        }
                    }

                    return false;
                });

                // Verificar criterio direccional si está disponible
                const lecturasBValidas = lecturasBEnVentana.filter(lecturaB => {
                    if (lecturaA.sentido && lecturaB.sentido) {
                        return lecturaA.sentido === lecturaB.sentido;
                    }
                    return true;
                });

                if (lecturasBValidas.length > 0) {
                    // Tomar la lectura más cercana en tiempo
                    const lecturaB = lecturasBValidas.reduce((closest, current) => {
                        const currentDiff = Math.abs(new Date(current.timestamp).getTime() - timestampA);
                        const closestDiff = Math.abs(new Date(closest.timestamp).getTime() - timestampA);
                        return currentDiff < closestDiff ? current : closest;
                    });

                    eventosCorrelacion.push({
                        timestamp_vehiculo_a: lecturaA.timestamp,
                        timestamp_vehiculo_b: lecturaB.timestamp,
                        lector_id: lecturaA.lector_id,
                        lat: lecturaA.lat,
                        lon: lecturaA.lon,
                        sentido: lecturaA.sentido
                    });
                }
            }

            // 4. Evaluación del Candidato
            if (eventosCorrelacion.length > 0) {
                const fechasUnicas = new Set(
                    eventosCorrelacion.map(e => dayjs(e.timestamp_vehiculo_a).format('YYYY-MM-DD'))
                ).size;

                const esLanzadera = 
                    (fechasUnicas >= 2 && eventosCorrelacion.length >= config.umbral_dias_distintos) ||
                    (fechasUnicas === 1 && eventosCorrelacion.length >= config.umbral_mismo_dia);

                if (esLanzadera) {
                    resultados.push({
                        matricula: matriculaB,
                        total_correlaciones: eventosCorrelacion.length,
                        fechas_unicas: fechasUnicas,
                        eventos: eventosCorrelacion
                    });
                }
            }
        }

        // 5. Ordenar resultados por número de correlaciones
        return resultados.sort((a, b) => b.total_correlaciones - a.total_correlaciones);

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

function LanzaderaPanel({ casoId }: LanzaderaPanelProps) {
    const [matriculaObjetivo, setMatriculaObjetivo] = useState('');
    const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
    const [fechaFin, setFechaFin] = useState<Date | null>(null);
    const [resultados, setResultados] = useState<ResultadoLanzadera[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [configuracion, setConfiguracion] = useState<ConfiguracionDeteccion>(CONFIG_DEFAULT);

    const handleDetectar = async () => {
        if (!matriculaObjetivo.trim()) {
            notifications.show({
                title: 'Falta Matrícula',
                message: 'Debes especificar una matrícula objetivo.',
                color: 'orange',
            });
            return;
        }

        setLoading(true);
        setError(null);
        setResultados([]);

        try {
            const resultados = await detectarLanzaderas(
                matriculaObjetivo.trim(),
                fechaInicio,
                fechaFin,
                casoId,
                configuracion
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
                    <Group justify="flex-end">
                        <Button
                            onClick={handleDetectar}
                            loading={loading}
                            leftSection={<IconSearch size={16} />}
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
        </Stack>
    );
}

export default LanzaderaPanel; 