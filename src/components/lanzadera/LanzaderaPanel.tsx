import React, { useState, useEffect, useMemo } from 'react';
import { Box, Title, Text, Paper, Group, Button, TextInput, NumberInput, Select, Table, Badge, LoadingOverlay, Alert, Collapse, Card, Stack, ActionIcon, Menu } from '@mantine/core';
import { IconSearch, IconAlertTriangle, IconBookmark, IconCar, IconMapPin, IconSortAscending, IconSortDescending } from '@tabler/icons-react';
import apiClient from '../../services/api';
import { notifications } from '@mantine/notifications';
import { Checkbox } from '@mantine/core';
import MatriculasExtranjerasPanel from '../analisis/MatriculasExtranjerasPanel';
import { useMapHighlight } from '../../context/MapHighlightContext';

interface PatronesPanelProps {
    casoId: number;
}

interface Lector {
    ID_Lector?: string;
    Nombre?: string;
    Carretera?: string;
    PK?: string;
    Provincia?: string;
    Localidad?: string;
    Sentido?: string;
    Orientacion?: string;
}

interface Lectura {
    ID_Lectura: number;
    ID_Archivo: number;
    Matricula: string;
    Fecha_y_Hora: string;
    Carril?: string;
    Velocidad?: number;
    ID_Lector?: string;
    Coordenada_X?: number;
    Coordenada_Y?: number;
    Tipo_Fuente: string;
    lector?: Lector;
}

interface VehiculoRapido {
    matricula: string;
    velocidad: number;
    fechaHoraInicio: string;
    fechaHoraFin: string;
    lectorInicio: string;
    lectorFin: string;
    pkInicio: string;
    pkFin: string;
    carretera: string;
}

function AnalisisAvanzadoPanel({ casoId }: PatronesPanelProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [vehiculosRapidos, setVehiculosRapidos] = useState<VehiculoRapido[]>([]);
    const [filtros, setFiltros] = useState({
        velocidadMinima: 140,
        fechaInicio: '',
        fechaFin: '',
        horaInicio: '',
        horaFin: '',
        carretera: '',
    });
    const [ayudaAbierta, setAyudaAbierta] = useState(false);
    const [lanzaderaParams, setLanzaderaParams] = useState({
        matricula: '',
        ventanaMinutos: 10,
        diferenciaMinima: 5,
        fechaInicio: '',
        fechaFin: '',
        minCoincidencias: 2,
    });
    const [lanzaderaLoading, setLanzaderaLoading] = useState(false);
    const [lanzaderaResultados, setLanzaderaResultados] = useState<string[]>([]);
    const [lanzaderaDetalles, setLanzaderaDetalles] = useState<any[]>([]);
    const [selectedRows, setSelectedRows] = useState<any[]>([]);
    const [busquedaRealizada, setBusquedaRealizada] = useState(false);
    const { setHighlightedLecturas } = useMapHighlight();
    const [ordenCoincidencias, setOrdenCoincidencias] = useState<'fecha'|'matricula'|'tipo'>('fecha');
    const [ordenAsc, setOrdenAsc] = useState(true);

    const limpiarFiltros = () => {
        setFiltros({
            velocidadMinima: 140,
            fechaInicio: '',
            fechaFin: '',
            horaInicio: '',
            horaFin: '',
            carretera: '',
        });
        setVehiculosRapidos([]);
        setError(null);
    };

    // --- Funciones auxiliares para parseo flexible ---
    const parsePKFlexible = (pkString: string): number => {
        if (!pkString) return 0;
        
        // Normalizar el string: eliminar espacios, convertir a mayúsculas
        const normalized = pkString.trim().toUpperCase();
        
        // Extraer números usando regex más flexible
        const matches = normalized.match(/(?:PK|P\.K\.)?\s*(\d+)(?:[.,+](\d+))?/);
        if (!matches) return 0;
        
        const kilometers = parseInt(matches[1] || '0', 10);
        const meters = matches[2] ? parseInt(matches[2].padEnd(3, '0'), 10) : 0;
        
        return kilometers + (meters / 1000);
    };

    const parseCarreteraFlexible = (carreteraString: string): string => {
        if (!carreteraString) return '';
        
        // Normalizar el string: eliminar espacios, convertir a mayúsculas
        const normalized = carreteraString.trim().toUpperCase();
        
        // Extraer el identificador de carretera usando regex más flexible
        const matches = normalized.match(/^([A-Z]+)[\s-]*(\d+)/);
        if (!matches) return normalized;
        
        const tipo = matches[1];
        const numero = matches[2];
        
        // Normalizar el formato (ej: "A1" -> "A-1")
        return `${tipo}-${numero}`;
    };

    const calcularVelocidad = (lectura1: Lectura, lectura2: Lectura): number | null => {
        try {
            // Extraer PKs de forma flexible
            const pk1 = parsePKFlexible(lectura1.lector?.PK || '');
            const pk2 = parsePKFlexible(lectura2.lector?.PK || '');
            
            // Extraer carreteras de forma flexible
            const carretera1 = parseCarreteraFlexible(lectura1.lector?.Carretera || '');
            const carretera2 = parseCarreteraFlexible(lectura2.lector?.Carretera || '');
            
            // Si los PKs son inválidos o las carreteras no coinciden, retornar null
            if (pk1 === 0 || pk2 === 0 || carretera1 !== carretera2) {
                return null;
            }

            // Longitudes de carreteras circulares
            const longitudesCirculares: Record<string, number> = {
                'M-30': 32.5,
                'M30': 32.5,
                'M-40': 63.3,
                'M40': 63.3
            };
            const longitud = longitudesCirculares[carretera1] || null;

            let distancia = Math.abs(pk2 - pk1);
            if (longitud) {
                // Si la distancia es mayor que la mitad de la circunferencia, tomar el camino más corto
                if (distancia > longitud / 2) {
                    distancia = longitud - distancia;
                }
            }

            // Parsear fechas
            const fecha1 = new Date(lectura1.Fecha_y_Hora);
            const fecha2 = new Date(lectura2.Fecha_y_Hora);
            
            // Calcular tiempo en horas
            const tiempo = Math.abs(fecha2.getTime() - fecha1.getTime()) / (1000 * 60 * 60);
            
            // Calcular velocidad en km/h
            return distancia / tiempo;
        } catch (error) {
            console.error('Error calculando velocidad:', error);
            return null;
        }
    };

    const extraerDatosLector = (idLector: string): { pk?: string; carretera?: string } => {
        try {
            // Extraer carretera: primer bloque tipo letras+números (ej: M30, A1, AP7)
            const carreteraMatch = idLector.match(/([A-Z]+\d+)/i);
            // Extraer PK: PK seguido de número y decimales (ej: PK25.800, PK25,800, PK25+800)
            const pkMatch = idLector.match(/PK\s*(\d+[.,+]?\d*)/i);
            return {
                pk: pkMatch ? `PK${pkMatch[1].replace(',', '.').replace('+', '.')}` : undefined,
                carretera: carreteraMatch ? carreteraMatch[1].toUpperCase() : undefined
            };
        } catch (err) {
            console.warn('Error extrayendo datos del lector:', idLector, err);
            return {};
        }
    };

    const procesarLectura = (lectura: Lectura): Lectura => {
        if (!lectura.lector?.PK || !lectura.lector?.Carretera) {
            const datosExtraidos = extraerDatosLector(lectura.ID_Lector || '');
            return {
                ...lectura,
                lector: {
                    ...lectura.lector,
                    PK: datosExtraidos.pk || '',
                    Carretera: datosExtraidos.carretera || ''
                }
            };
        }
        return lectura;
    };

    const buscarVehiculosRapidos = async () => {
        setLoading(true);
        setError(null);
        try {
            const params: any = {
                tipo_fuente: 'LPR',
            };
            if (filtros.fechaInicio) params.fecha_inicio = filtros.fechaInicio;
            if (filtros.fechaFin) params.fecha_fin = filtros.fechaFin;
            if (filtros.horaInicio) params.hora_inicio = filtros.horaInicio;
            if (filtros.horaFin) params.hora_fin = filtros.horaFin;
            if (filtros.carretera) params.carretera = filtros.carretera;

            const response = await apiClient.get(`/casos/${casoId}/lecturas`, { params });
            
            if (!response.data || !Array.isArray(response.data)) {
                throw new Error('Formato de respuesta inválido');
            }

            const lecturas: Lectura[] = response.data;
            console.log('Lecturas recibidas:', lecturas.length);

            if (lecturas.length === 0) {
                setVehiculosRapidos([]);
                notifications.show({
                    title: 'Sin resultados',
                    message: 'No se encontraron lecturas para los filtros seleccionados',
                    color: 'blue'
                });
                return;
            }

            const vehiculosAnalizados = new Map<string, VehiculoRapido>();

            // Agrupar lecturas por matrícula y ordenar por fecha
            const lecturasPorMatricula = new Map<string, Lectura[]>();
            lecturas.forEach(lectura => {
                if (!lectura.Matricula) {
                    console.warn('Lectura sin matrícula:', lectura);
                    return;
                }

                // Procesar la lectura para extraer PK y Carretera si faltan
                const lecturaCompleta = procesarLectura(lectura);
                
                if (!lecturaCompleta.lector?.PK || !lecturaCompleta.lector?.Carretera) {
                    console.warn('No se pudo completar la lectura con los datos del lector:', lectura);
                    return;
                }
                
                if (!lecturasPorMatricula.has(lectura.Matricula)) {
                    lecturasPorMatricula.set(lectura.Matricula, []);
                }
                lecturasPorMatricula.get(lectura.Matricula)?.push(lecturaCompleta);
            });

            // Filtrar vehículos con menos de 2 lecturas
            for (const [matricula, lecturas] of lecturasPorMatricula.entries()) {
                if (lecturas.length < 2) {
                    console.log(`Descartando vehículo ${matricula} - solo tiene ${lecturas.length} lectura(s)`);
                    lecturasPorMatricula.delete(matricula);
                }
            }

            console.log('Vehículos con múltiples lecturas:', lecturasPorMatricula.size);

            // Analizar cada vehículo
            lecturasPorMatricula.forEach((lecturasVehiculo, matricula) => {
                // Ordenar por fecha
                lecturasVehiculo.sort((a, b) => 
                    new Date(a.Fecha_y_Hora).getTime() - new Date(b.Fecha_y_Hora).getTime()
                );

                for (let i = 0; i < lecturasVehiculo.length - 1; i++) {
                    const lectura1 = lecturasVehiculo[i];
                    const lectura2 = lecturasVehiculo[i + 1];

                    // Solo analizar si son de la misma carretera
                    if (lectura1.lector?.Carretera !== lectura2.lector?.Carretera) continue;

                    const velocidad = calcularVelocidad(lectura1, lectura2);
                    
                    if (velocidad !== null && velocidad > filtros.velocidadMinima) {
                        vehiculosAnalizados.set(matricula, {
                            matricula,
                            velocidad: Math.round(velocidad),
                            fechaHoraInicio: lectura1.Fecha_y_Hora,
                            fechaHoraFin: lectura2.Fecha_y_Hora,
                            lectorInicio: lectura1.ID_Lector || '',
                            lectorFin: lectura2.ID_Lector || '',
                            pkInicio: lectura1.lector?.PK || '',
                            pkFin: lectura2.lector?.PK || '',
                            carretera: lectura1.lector?.Carretera || ''
                        });
                    }
                }
            });

            const resultados = Array.from(vehiculosAnalizados.values());
            console.log('Vehículos rápidos encontrados:', resultados.length);
            setVehiculosRapidos(resultados);

            if (resultados.length === 0) {
                notifications.show({
                    title: 'Sin resultados',
                    message: 'No se encontraron vehículos que superen la velocidad mínima establecida',
                    color: 'blue'
                });
            } else {
                notifications.show({
                    title: 'Búsqueda completada',
                    message: `Se encontraron ${resultados.length} vehículos con velocidad superior a ${filtros.velocidadMinima} km/h`,
                    color: 'green'
                });
            }

        } catch (err) {
            console.error('Error al buscar vehículos rápidos:', err);
            setError('Error al procesar los datos de vehículos rápidos');
            notifications.show({
                title: 'Error',
                message: 'Ocurrió un error al buscar vehículos rápidos',
                color: 'red'
            });
        } finally {
            setLoading(false);
        }
    };

    const testParseo = () => {
        // Ejemplos de PKs
        const ejemplosPK = [
            'PK045+600',
            'PK45.600',
            '45,800',
            'PK 25+800',
            '25.800',
            '25,800',
            '25',
            'PK25',
            'P.K. 25+800',
            '25+800',
            '25.8',
            '25,8',
            'PK 25.800',
            'PK 25,800',
            'PK25+800',
            'PK25.800',
            'PK25,800'
        ];

        console.log('=== Pruebas de Parseo de PK ===');
        ejemplosPK.forEach(pk => {
            const resultado = parsePKFlexible(pk);
            console.log(`PK: "${pk}" -> ${resultado} km`);
        });

        // Ejemplos de Carreteras
        const ejemplosCarretera = [
            'A-1',
            'N340',
            'AP7',
            'C-31',
            'A1',
            'N 340',
            'A 1',
            'A-1 (Madrid)',
            'A1, PK25+800',
            'A-1 PK25+800',
            'M-40',
            'M40',
            'M 40',
            'M-40 (Madrid)',
            'M40, PK25+800'
        ];

        console.log('\n=== Pruebas de Parseo de Carretera ===');
        ejemplosCarretera.forEach(carretera => {
            const resultado = parseCarreteraFlexible(carretera);
            console.log(`Carretera: "${carretera}" -> "${resultado}"`);
        });
    };

    // Llamar a la función de prueba al montar el componente
    useEffect(() => {
        testParseo();
    }, []);

    // Placeholder para la función de búsqueda
    const handleBuscarLanzadera = async () => {
        if (!lanzaderaParams.matricula) {
            notifications.show({
                title: 'Error',
                message: 'Por favor, introduce la matrícula objetivo',
                color: 'red'
            });
            return;
        }
        setLanzaderaLoading(true);
        setBusquedaRealizada(true);
        try {
            const response = await apiClient.post(`/casos/${casoId}/detectar-lanzaderas`, {
                matricula: lanzaderaParams.matricula,
                fecha_inicio: lanzaderaParams.fechaInicio || undefined,
                fecha_fin: lanzaderaParams.fechaFin || undefined,
                ventana_minutos: lanzaderaParams.ventanaMinutos,
                diferencia_minima: lanzaderaParams.diferenciaMinima,
                min_coincidencias: lanzaderaParams.minCoincidencias
            });

            setLanzaderaResultados(response.data.vehiculos_lanzadera);
            setLanzaderaDetalles(response.data.detalles);

            if (response.data.vehiculos_lanzadera.length === 0) {
                notifications.show({
                    title: 'Sin resultados',
                    message: 'No se han detectado vehículos acompañante para los criterios especificados',
                    color: 'blue'
                });
            } else {
                notifications.show({
                    title: 'Búsqueda completada',
                    message: `Se han detectado ${response.data.vehiculos_lanzadera.length} vehículos acompañante`,
                    color: 'green'
                });
            }
        } catch (error) {
            console.error('Error al buscar vehículos lanzadera:', error);
            notifications.show({
                title: 'Error',
                message: 'Ocurrió un error al buscar vehículos lanzadera',
                color: 'red'
            });
        } finally {
            setLanzaderaLoading(false);
        }
    };

    // --- NUEVA AGRUPACIÓN AVANZADA DE COINCIDENCIAS ---
    const matriculaObjetivo = lanzaderaParams.matricula?.trim().toUpperCase();

    // Construir un mapa: {matriculaAcompañante: [ { objetivo: {...}, acompanante: {...} } ]}
    const agrupacionAcompanantes = useMemo(() => {
        if (!matriculaObjetivo || !lanzaderaDetalles || lanzaderaDetalles.length === 0) return {};
        // Filtrar solo lecturas válidas
        const lecturas = lanzaderaDetalles.filter(l => l.matricula && l.fecha && l.hora && l.lector);
        // Separar lecturas objetivo y acompañantes
        const lecturasObjetivo = lecturas.filter(l => l.matricula === matriculaObjetivo);
        const lecturasAcompanantes = lecturas.filter(l => l.matricula !== matriculaObjetivo);
        // Para cada acompañante, buscar coincidencias con el objetivo
        const mapa: Record<string, { objetivo: any, acompanante: any }[]> = {};
        lecturasAcompanantes.forEach(acom => {
            // Buscar lecturas objetivo cercanas en fecha/hora/lector (puedes ajustar la lógica si tienes un campo de agrupación real)
            // Aquí asumimos que lanzaderaDetalles ya trae las coincidencias intercaladas
            // Buscamos la lectura objetivo más próxima anterior o posterior
            const posibles = lecturasObjetivo.filter(obj => obj.fecha === acom.fecha && obj.lector === acom.lector);
            posibles.forEach(obj => {
                if (!mapa[acom.matricula]) mapa[acom.matricula] = [];
                mapa[acom.matricula].push({ objetivo: obj, acompanante: acom });
            });
        });
        return mapa;
    }, [lanzaderaDetalles, matriculaObjetivo]);

    // Helpers para identificar filas únicas
    const getVelocidadRowId = (vehiculo: VehiculoRapido) => `velocidad-${vehiculo.matricula}-${vehiculo.fechaHoraInicio}-${vehiculo.fechaHoraFin}`;
    const getLanzaderaRowId = (detalle: any) => `lanzadera-${detalle.matricula}-${detalle.fecha}-${detalle.hora}-${detalle.lector}`;

    // Helpers para saber si una fila está seleccionada
    const isVelocidadRowSelected = (vehiculo: VehiculoRapido) => selectedRows.some(r => r._rowId === getVelocidadRowId(vehiculo));
    const isLanzaderaRowSelected = (detalle: any) => selectedRows.some(r => r._rowId === getLanzaderaRowId(detalle));

    // Select all helpers
    const allVelocidadSelected = vehiculosRapidos.length > 0 && vehiculosRapidos.every(isVelocidadRowSelected);
    const allLanzaderaSelected = lanzaderaDetalles.length > 0 && lanzaderaDetalles.every(isLanzaderaRowSelected);

    // Handlers para selección
    const handleSelectVelocidadRow = (vehiculo: VehiculoRapido, checked: boolean) => {
        const rowObj = { ...vehiculo, tipo: 'velocidad', _rowId: getVelocidadRowId(vehiculo) };
        setSelectedRows(prev => checked
            ? [...prev, rowObj]
            : prev.filter(r => r._rowId !== rowObj._rowId)
        );
    };
    const handleSelectAllVelocidad = (checked: boolean) => {
        if (checked) {
            const toAdd = vehiculosRapidos
                .filter(v => !isVelocidadRowSelected(v))
                .map(v => ({ ...v, tipo: 'velocidad', _rowId: getVelocidadRowId(v) }));
            setSelectedRows(prev => [...prev, ...toAdd]);
        } else {
            setSelectedRows(prev => prev.filter(r => !vehiculosRapidos.some(v => r._rowId === getVelocidadRowId(v))));
        }
    };
    const handleSelectLanzaderaRow = (detalle: any, checked: boolean) => {
        const rowObj = { ...detalle, tipo: 'lanzadera', _rowId: getLanzaderaRowId(detalle) };
        setSelectedRows(prev => checked
            ? [...prev, rowObj]
            : prev.filter(r => r._rowId !== rowObj._rowId)
        );
    };
    const handleSelectAllLanzadera = (checked: boolean) => {
        if (checked) {
            const toAdd = lanzaderaDetalles
                .filter(d => !isLanzaderaRowSelected(d))
                .map(d => ({ ...d, tipo: 'lanzadera', _rowId: getLanzaderaRowId(d) }));
            setSelectedRows(prev => [...prev, ...toAdd]);
        } else {
            setSelectedRows(prev => prev.filter(r => !lanzaderaDetalles.some(d => r._rowId === getLanzaderaRowId(d))));
        }
    };

    // Acciones
    const handleMarcarRelevante = async () => {
        const lecturasConId = selectedRows.filter(r => r.tipo === 'velocidad' && r.ID_Lectura);
        if (lecturasConId.length === 0) {
            notifications.show({ title: 'Sin lecturas seleccionadas', message: 'No hay lecturas con ID para marcar como relevante.', color: 'orange' });
            return;
        }
        for (const row of lecturasConId) {
            try {
                await apiClient.post(`/lecturas/${row.ID_Lectura}/marcar_relevante`, { caso_id: casoId });
            } catch (e) {
                notifications.show({ title: 'Error', message: `No se pudo marcar la lectura ${row.ID_Lectura} como relevante.`, color: 'red' });
            }
        }
        notifications.show({ title: 'Éxito', message: `Lecturas marcadas como relevantes.`, color: 'green' });
        setSelectedRows([]);
    };
    const handleGuardarVehiculos = async () => {
        const matriculasUnicas = Array.from(new Set(selectedRows.map(r => r.matricula || r.Matricula)));
        if (matriculasUnicas.length === 0) {
            notifications.show({ title: 'Sin matrículas', message: 'No hay matrículas seleccionadas.', color: 'orange' });
            return;
        }
        for (const matricula of matriculasUnicas) {
            try {
                await apiClient.post('/vehiculos', { Matricula: matricula });
            } catch (e: any) {
                if (e.response?.status === 400 || e.response?.status === 409) {
                    notifications.show({ title: 'Vehículo Existente', message: `El vehículo ${matricula} ya existe.`, color: 'blue' });
                } else {
                    notifications.show({ title: 'Error', message: `No se pudo guardar el vehículo ${matricula}.`, color: 'red' });
                }
            }
        }
        notifications.show({ title: 'Éxito', message: `Vehículos guardados.`, color: 'green' });
        setSelectedRows([]);
    };

    // Calcular el número de acompañantes que cumplen el filtro de mínimo de coincidencias
    const numAcompanantesFiltrados = Object.values(agrupacionAcompanantes).filter(coincidencias => coincidencias.length >= (lanzaderaParams.minCoincidencias || 2)).length;

    return (
        <Box>
            <Group justify="flex-end" mb="xs">
                <Button
                    size="xs"
                    variant="outline"
                    leftSection={<IconBookmark size={16} />}
                    onClick={handleMarcarRelevante}
                    disabled={selectedRows.length === 0}
                >
                    Marcar Relevante ({selectedRows.length})
                </Button>
                <Button
                    size="xs"
                    variant="outline"
                    color="green"
                    leftSection={<IconCar size={16} />}
                    onClick={handleGuardarVehiculos}
                    disabled={selectedRows.length === 0}
                >
                    Guardar Vehículos ({selectedRows.length})
                </Button>
            </Group>
            <Paper shadow="sm" p="md" mb="md">
                <Group justify="space-between" mb="md">
                    <Title order={4}>Detección de Vehículos Rápidos</Title>
                </Group>
                
                <Group mb="md">
                    <NumberInput
                        label="Velocidad Mínima (km/h)"
                        value={filtros.velocidadMinima}
                        onChange={(value) => setFiltros({ ...filtros, velocidadMinima: typeof value === 'number' ? value : 140 })}
                        min={0}
                        max={300}
                    />
                    <Box>
                        <Text size="sm" mb={4}>Fecha y Hora Inicio</Text>
                        <Group gap="xs">
                            <TextInput
                                type="date"
                                value={filtros.fechaInicio}
                                onChange={(e) => setFiltros({ ...filtros, fechaInicio: e.target.value })}
                                style={{ width: '160px' }}
                            />
                            <TextInput
                                type="time"
                                value={filtros.horaInicio}
                                onChange={(e) => setFiltros({ ...filtros, horaInicio: e.target.value })}
                                style={{ width: '120px' }}
                            />
                        </Group>
                    </Box>
                    <Box>
                        <Text size="sm" mb={4}>Fecha y Hora Fin</Text>
                        <Group gap="xs">
                            <TextInput
                                type="date"
                                value={filtros.fechaFin}
                                onChange={(e) => setFiltros({ ...filtros, fechaFin: e.target.value })}
                                style={{ width: '160px' }}
                            />
                            <TextInput
                                type="time"
                                value={filtros.horaFin}
                                onChange={(e) => setFiltros({ ...filtros, horaFin: e.target.value })}
                                style={{ width: '120px' }}
                            />
                        </Group>
                    </Box>
                    <TextInput
                        label="Carretera"
                        value={filtros.carretera}
                        onChange={(e) => setFiltros({ ...filtros, carretera: e.target.value })}
                        placeholder="Ej: M-40"
                    />
                    <Group mt="xl">
                        <Button
                            leftSection={<IconSearch size={14} />}
                            onClick={buscarVehiculosRapidos}
                        >
                            Buscar
                        </Button>
                        <Button
                            variant="light"
                            color="gray"
                            onClick={limpiarFiltros}
                        >
                            Limpiar
                        </Button>
                    </Group>
                </Group>

                {error && (
                    <Alert color="red" title="Error" mb="md">
                        {error}
                    </Alert>
                )}

                <Box style={{ position: 'relative' }}>
                    <LoadingOverlay visible={loading} />
                    <Table striped highlightOnHover>
                        <thead>
                            <tr>
                                <th><Checkbox checked={allVelocidadSelected} onChange={e => handleSelectAllVelocidad(e.currentTarget.checked)} /></th>
                                <th style={{ textAlign: 'center' }}>Matrícula</th>
                                <th style={{ textAlign: 'center' }}>Velocidad (km/h)</th>
                                <th style={{ textAlign: 'center' }}>Fecha/Hora Inicio</th>
                                <th style={{ textAlign: 'center' }}>Fecha/Hora Fin</th>
                                <th style={{ textAlign: 'center' }}>Lector Inicio</th>
                                <th style={{ textAlign: 'center' }}>Lector Fin</th>
                                <th style={{ textAlign: 'center' }}>PK Inicio</th>
                                <th style={{ textAlign: 'center' }}>PK Fin</th>
                                <th style={{ textAlign: 'center' }}>Carretera</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vehiculosRapidos.map((vehiculo, index) => (
                                <tr key={index}>
                                    <td><Checkbox checked={isVelocidadRowSelected(vehiculo)} onChange={e => handleSelectVelocidadRow(vehiculo, e.currentTarget.checked)} /></td>
                                    <td style={{ textAlign: 'center' }}>{vehiculo.matricula}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <Badge color="red" leftSection={<IconAlertTriangle size={12} />}>{vehiculo.velocidad} km/h</Badge>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>{new Date(vehiculo.fechaHoraInicio).toLocaleString()}</td>
                                    <td style={{ textAlign: 'center' }}>{new Date(vehiculo.fechaHoraFin).toLocaleString()}</td>
                                    <td style={{ textAlign: 'center' }}>{vehiculo.lectorInicio}</td>
                                    <td style={{ textAlign: 'center' }}>{vehiculo.lectorFin}</td>
                                    <td style={{ textAlign: 'center' }}>{vehiculo.pkInicio}</td>
                                    <td style={{ textAlign: 'center' }}>{vehiculo.pkFin}</td>
                                    <td style={{ textAlign: 'center' }}>{vehiculo.carretera}</td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Box>
            </Paper>

            {/* Submódulo: Detección de Vehículo Acompañante */}
            <Paper shadow="sm" p="md" mb="md">
                <Group justify="space-between" mb="md">
                    <Title order={4}>Detección de Vehículo Acompañante</Title>
                </Group>
                <Group mb="md">
                    <TextInput
                        label="Matrícula objetivo"
                        value={lanzaderaParams?.matricula || ''}
                        onChange={e => setLanzaderaParams(p => ({ ...p, matricula: e.target.value }))}
                        placeholder="Introduce matrícula"
                        required
                    />
                    <TextInput
                        type="date"
                        label="Fecha Inicio"
                        value={lanzaderaParams?.fechaInicio || ''}
                        onChange={e => setLanzaderaParams(p => ({ ...p, fechaInicio: e.target.value }))}
                    />
                    <TextInput
                        type="date"
                        label="Fecha Fin"
                        value={lanzaderaParams?.fechaFin || ''}
                        onChange={e => setLanzaderaParams(p => ({ ...p, fechaFin: e.target.value }))}
                    />
                    <NumberInput
                        label="Ventana temporal (minutos)"
                        value={lanzaderaParams?.ventanaMinutos || 10}
                        onChange={v => setLanzaderaParams(p => ({ ...p, ventanaMinutos: typeof v === 'number' ? v : 10 }))}
                        min={1}
                        max={120}
                    />
                    <NumberInput
                        label="Diferencia mínima entre lecturas (min)"
                        value={lanzaderaParams?.diferenciaMinima || 5}
                        onChange={v => setLanzaderaParams(p => ({ ...p, diferenciaMinima: typeof v === 'number' ? v : 5 }))}
                        min={1}
                        max={60}
                    />
                    <NumberInput
                        label="Mínimo de coincidencias"
                        value={lanzaderaParams?.minCoincidencias || 2}
                        onChange={v => setLanzaderaParams(p => ({ ...p, minCoincidencias: typeof v === 'number' ? v : 2 }))}
                        min={2}
                        max={20}
                    />
                    <Group mt="md">
                        <Button
                            leftSection={<IconSearch size={16} />}
                            onClick={handleBuscarLanzadera}
                            loading={lanzaderaLoading}
                        >
                            Buscar
                        </Button>
                        <Button
                            variant="light"
                            color="gray"
                            onClick={() => {
                                setLanzaderaParams({
                                    matricula: '',
                                    ventanaMinutos: 10,
                                    diferenciaMinima: 5,
                                    fechaInicio: '',
                                    fechaFin: '',
                                    minCoincidencias: 2
                                });
                                setLanzaderaDetalles([]);
                                setLanzaderaResultados([]);
                                setBusquedaRealizada(false);
                                setSelectedRows([]);
                            }}
                        >
                            Limpiar
                        </Button>
                    </Group>
                </Group>
                <Title order={5} mt="md" mb="xs">Lecturas Intercaladas (Objetivo y Acompañante)</Title>
                <Group align="center" mb="xs">
                    <Text fw={500}>Coincidencias encontradas: {numAcompanantesFiltrados}</Text>
                    <Menu shadow="md" width={180}>
                        <Menu.Target>
                            <ActionIcon variant="light" color="blue"><IconSortAscending size={18} /></ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item onClick={() => { setOrdenCoincidencias('fecha'); setOrdenAsc(true); }}>Fecha ascendente</Menu.Item>
                            <Menu.Item onClick={() => { setOrdenCoincidencias('fecha'); setOrdenAsc(false); }}>Fecha descendente</Menu.Item>
                            <Menu.Item onClick={() => { setOrdenCoincidencias('matricula'); setOrdenAsc(true); }}>Matrícula ascendente</Menu.Item>
                            <Menu.Item onClick={() => { setOrdenCoincidencias('matricula'); setOrdenAsc(false); }}>Matrícula descendente</Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Group>
                <Stack>
                    {numAcompanantesFiltrados === 0 && (
                        <Text c="dimmed" ta="center" my="md">No se han encontrado vehículos acompañantes</Text>
                    )}
                    {Object.entries(agrupacionAcompanantes)
                        .filter(([_, coincidencias]) => coincidencias.length >= (lanzaderaParams.minCoincidencias || 2))
                        .sort((a, b) => b[1].length - a[1].length)
                        .map(([matricula, coincidencias], idx) => (
                            <Card key={matricula} shadow="sm" p="md" radius="md" withBorder mb="sm">
                                <Group justify="space-between" mb="xs">
                                    <Text fw={700}>
                                        {matricula} <Badge color="gray" ml="sm">Coincidencias: {coincidencias.length}</Badge>
                                    </Text>
                                    <Button size="xs" onClick={() => setHighlightedLecturas(coincidencias.flatMap(c => [c.objetivo, c.acompanante]))} leftSection={<IconMapPin size={16} />}>
                                        Ver en mapa
                                    </Button>
                                </Group>
                                <Stack gap={4}>
                                    {coincidencias.map((c, i) => (
                                        <Group key={i} spacing="md">
                                            <Badge color="blue">OBJETIVO</Badge>
                                            <Text fw={700}>{c.objetivo.matricula}</Text>
                                            <Text>{c.objetivo.fecha} {c.objetivo.hora.length === 5 ? c.objetivo.hora + ':00' : c.objetivo.hora}</Text>
                                            <Text size="sm" color="dimmed">{c.objetivo.lector}</Text>
                                            <Badge color="gray">ACOMPAÑANTE</Badge>
                                            <Text fw={400}>{c.acompanante.matricula}</Text>
                                            <Text>{c.acompanante.fecha} {c.acompanante.hora.length === 5 ? c.acompanante.hora + ':00' : c.acompanante.hora}</Text>
                                            <Text size="sm" color="dimmed">{c.acompanante.lector}</Text>
                                        </Group>
                                    ))}
                                </Stack>
                            </Card>
                        ))}
                </Stack>
            </Paper>

            {/* Submódulo: Búsqueda de Matrículas Extranjeras */}
            <Paper shadow="sm" p="md" mb="md">
                <MatriculasExtranjerasPanel
                    lecturas={[
                        ...vehiculosRapidos.map(v => ({
                            Matricula: v.matricula,
                            Fecha_y_Hora: v.fechaHoraInicio,
                            ID_Lector: v.lectorInicio
                        })),
                        ...lanzaderaDetalles.map(d => ({
                            Matricula: d.matricula,
                            Fecha_y_Hora: `${d.fecha}T${d.hora}`,
                            ID_Lector: d.lector
                        }))
                    ]}
                    loading={loading || lanzaderaLoading}
                />
            </Paper>
        </Box>
    );
}

export default AnalisisAvanzadoPanel; 