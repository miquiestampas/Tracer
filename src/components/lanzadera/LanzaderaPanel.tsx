import React, { useState, useEffect, useMemo } from 'react';
import { Box, Title, Text, Paper, Group, Button, TextInput, NumberInput, Select, Table, Badge, LoadingOverlay, Alert, Collapse } from '@mantine/core';
import { IconSearch, IconAlertTriangle } from '@tabler/icons-react';
import apiClient from '../../services/api';
import { notifications } from '@mantine/notifications';

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

function PatronesPanel({ casoId }: PatronesPanelProps) {
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
            
            // Calcular distancia en kilómetros
            const distancia = Math.abs(pk2 - pk1);
            
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
        if (!filtros.fechaInicio || !filtros.fechaFin) {
            notifications.show({
                title: 'Error',
                message: 'Por favor, seleccione un rango de fechas',
                color: 'red'
            });
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const response = await apiClient.get(`/casos/${casoId}/lecturas`, {
                params: {
                    fecha_inicio: filtros.fechaInicio,
                    fecha_fin: filtros.fechaFin,
                    hora_inicio: filtros.horaInicio || undefined,
                    hora_fin: filtros.horaFin || undefined,
                    carretera: filtros.carretera || undefined,
                    tipo_fuente: 'LPR'
                }
            });
            
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

    return (
        <Box>
            <Paper shadow="sm" p="md" mb="md">
                <Group justify="space-between" mb="md">
                    <Title order={4}>Vehículos Rápidos</Title>
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
                    <Alert color="blue" title="¿Cómo funciona este panel?" mb="md">
                        <Text size="sm">
                            <b>Este panel permite detectar automáticamente vehículos que han recorrido grandes distancias en tiempos muy reducidos, superando el umbral de velocidad que tú determines.</b><br /><br />
                            <b>¿Cómo usarlo?</b><br />
                            1. Selecciona el rango de fechas y horas que quieres analizar.<br />
                            2. (Opcional) Filtra por carretera concreta.<br />
                            3. Ajusta la velocidad mínima para considerar un vehículo como "rápido".<br />
                            4. Pulsa <b>Buscar</b>.<br /><br />
                            El sistema analizará todas las lecturas de matrículas, calculará la velocidad real entre puntos kilométricos y carreteras, y te mostrará solo los vehículos que superan el umbral.<br /><br />
                            <b>¿Para qué sirve?</b><br />
                            - Detectar vehículos a la fuga o con trayectorias sospechosas.<br />
                            - Identificar patrones imposibles de ver manualmente.<br />
                            - Ahorrar tiempo y mejorar la eficacia de la investigación.<br /><br />
                            <b>Consejo:</b> Si no aparecen resultados, prueba a ampliar el rango de fechas/horas o bajar el umbral de velocidad.<br />
                        </Text>
                    </Alert>
                </Collapse>
                
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
                                required
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
                                required
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
                                <th>Matrícula</th>
                                <th>Velocidad (km/h)</th>
                                <th>Fecha/Hora Inicio</th>
                                <th>Fecha/Hora Fin</th>
                                <th>Lector Inicio</th>
                                <th>Lector Fin</th>
                                <th>PK Inicio</th>
                                <th>PK Fin</th>
                                <th>Carretera</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vehiculosRapidos.map((vehiculo, index) => (
                                <tr key={index}>
                                    <td>{vehiculo.matricula}</td>
                                    <td>
                                        <Badge color="red" leftSection={<IconAlertTriangle size={12} />}>
                                            {vehiculo.velocidad} km/h
                                        </Badge>
                                    </td>
                                    <td>{new Date(vehiculo.fechaHoraInicio).toLocaleString()}</td>
                                    <td>{new Date(vehiculo.fechaHoraFin).toLocaleString()}</td>
                                    <td>{vehiculo.lectorInicio}</td>
                                    <td>{vehiculo.lectorFin}</td>
                                    <td>{vehiculo.pkInicio}</td>
                                    <td>{vehiculo.pkFin}</td>
                                    <td>{vehiculo.carretera}</td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Box>
            </Paper>
        </Box>
    );
}

export default PatronesPanel; 