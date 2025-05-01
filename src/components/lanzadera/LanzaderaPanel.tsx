import React, { useState, useEffect } from 'react';
import { Box, Title, Text, Paper, Group, Button, TextInput, NumberInput, Select, Table, Badge, LoadingOverlay, Alert } from '@mantine/core';
import { IconSearch, IconAlertTriangle } from '@tabler/icons-react';
import apiClient from '../../services/api';
import { notifications } from '@mantine/notifications';

interface PatronesPanelProps {
    casoId: number;
}

interface Lectura {
    ID_Lectura: number;
    Matricula: string;
    Fecha_y_Hora: string;
    ID_Lector: string;
    PK: string;
    Carretera: string;
    Carril: string;
    Velocidad?: number;
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
        velocidadMinima: 120,
        fechaInicio: '',
        fechaFin: '',
        horaInicio: '',
        horaFin: '',
        carretera: '',
    });

    const limpiarFiltros = () => {
        setFiltros({
            velocidadMinima: 120,
            fechaInicio: '',
            fechaFin: '',
            horaInicio: '',
            horaFin: '',
            carretera: '',
        });
        setVehiculosRapidos([]);
        setError(null);
    };

    const parsePK = (pk: string): number => {
        try {
            // Intentar extraer números del formato PK045+600 o similar
            const matches = pk.match(/PK?(\d+)(?:\+(\d+))?/i);
            if (!matches) {
                console.warn('No se pudo parsear PK:', pk);
                return 0;
            }
            
            const kilometers = parseInt(matches[1] || '0', 10);
            const meters = parseInt(matches[2] || '0', 10);
            
            return kilometers + (meters / 1000);
        } catch (err) {
            console.error('Error parsing PK:', pk, err);
            return 0;
        }
    };

    const calcularVelocidad = (lectura1: Lectura, lectura2: Lectura): number | null => {
        try {
            const pk1 = parsePK(lectura1.PK);
            const pk2 = parsePK(lectura2.PK);
            
            if (pk1 === 0 || pk2 === 0) {
                console.warn('PKs inválidos:', { pk1, pk2, lectura1, lectura2 });
                return null;
            }
            
            const distancia = Math.abs(pk2 - pk1); // en kilómetros
            
            const tiempo1 = new Date(lectura1.Fecha_y_Hora).getTime();
            const tiempo2 = new Date(lectura2.Fecha_y_Hora).getTime();
            const tiempoHoras = (tiempo2 - tiempo1) / (1000 * 60 * 60);
            
            if (tiempoHoras <= 0) {
                console.warn('Tiempo inválido:', { tiempoHoras, lectura1, lectura2 });
                return null;
            }

            if (distancia === 0) {
                console.warn('Distancia 0:', { pk1, pk2, lectura1, lectura2 });
                return null;
            }
            
            const velocidad = distancia / tiempoHoras;
            console.log('Cálculo de velocidad:', {
                matricula: lectura1.Matricula,
                distancia,
                tiempoHoras,
                velocidad,
                pk1,
                pk2,
                fecha1: lectura1.Fecha_y_Hora,
                fecha2: lectura2.Fecha_y_Hora
            });
            
            return velocidad;
        } catch (err) {
            console.error('Error calculando velocidad:', err);
            return null;
        }
    };

    const extraerDatosLector = (idLector: string): { pk?: string; carretera?: string } => {
        try {
            const pkMatch = idLector.match(/PK\d+\+\d+/i);
            const carreteraMatch = idLector.match(/M-\d+/);
            
            return {
                pk: pkMatch ? pkMatch[0] : undefined,
                carretera: carreteraMatch ? carreteraMatch[0] : undefined
            };
        } catch (err) {
            console.warn('Error extrayendo datos del lector:', idLector, err);
            return {};
        }
    };

    const procesarLectura = (lectura: Lectura): Lectura => {
        if (!lectura.PK || !lectura.Carretera) {
            const datosExtraidos = extraerDatosLector(lectura.ID_Lector);
            return {
                ...lectura,
                PK: lectura.PK || datosExtraidos.pk || '',
                Carretera: lectura.Carretera || datosExtraidos.carretera || ''
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
                
                if (!lecturaCompleta.PK || !lecturaCompleta.Carretera) {
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
                    if (lectura1.Carretera !== lectura2.Carretera) continue;

                    const velocidad = calcularVelocidad(lectura1, lectura2);
                    
                    if (velocidad !== null && velocidad > filtros.velocidadMinima) {
                        vehiculosAnalizados.set(matricula, {
                            matricula,
                            velocidad: Math.round(velocidad),
                            fechaHoraInicio: lectura1.Fecha_y_Hora,
                            fechaHoraFin: lectura2.Fecha_y_Hora,
                            lectorInicio: lectura1.ID_Lector,
                            lectorFin: lectura2.ID_Lector,
                            pkInicio: lectura1.PK,
                            pkFin: lectura2.PK,
                            carretera: lectura1.Carretera
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

    return (
        <Box>
            <Paper shadow="sm" p="md" mb="md">
                <Title order={4} mb="md">Vehículos Rápidos</Title>
                
                <Group mb="md">
                    <NumberInput
                        label="Velocidad Mínima (km/h)"
                        value={filtros.velocidadMinima}
                        onChange={(value) => setFiltros({ ...filtros, velocidadMinima: typeof value === 'number' ? value : 120 })}
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