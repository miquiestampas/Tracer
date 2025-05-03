import React, { useState, useEffect } from 'react';
import { Box, Text, LoadingOverlay } from '@mantine/core';
import { getLecturas } from '../../services/archivosApi';

interface PatronesPanelProps {
    casoId: number;
}

interface Vehiculo {
    id: number;
    matricula: string;
    // ... otras propiedades del vehículo
}

function VehiculosPanel({ casoId }: PatronesPanelProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
    const [selectedVehiculo, setSelectedVehiculo] = useState<Vehiculo | null>(null);
    const [lecturas, setLecturas] = useState<any[]>([]);
    const [loadingLecturas, setLoadingLecturas] = useState(false);

    useEffect(() => {
        let isMounted = true;
        let subscriptionId: string | null = null;
        let lastCasoId: number | null = null;

        const handleListaVehiculosCambiada = () => {
            if (isMounted) {
                cargarVehiculos();
            }
        };

        const setupSubscription = () => {
            if (!subscriptionId) {
                subscriptionId = 'vehiculos-' + Date.now();
                console.log(`[VehiculosPanel (${subscriptionId})]: Suscribiéndose a 'listaVehiculosCambiada'`);
                window.addEventListener('listaVehiculosCambiada', handleListaVehiculosCambiada);
            }
        };

        const cleanupSubscription = () => {
            if (subscriptionId) {
                console.log(`[VehiculosPanel (${subscriptionId})]: Desuscribiéndose de 'listaVehiculosCambiada'`);
                window.removeEventListener('listaVehiculosCambiada', handleListaVehiculosCambiada);
                subscriptionId = null;
            }
        };

        const cargarVehiculos = async () => {
            if (!casoId || casoId === lastCasoId) {
                return;
            }

            lastCasoId = casoId;
            setLoading(true);
            setVehiculos([]);

            try {
                const response = await getLecturas({
                    caso_ids: [casoId.toString()],
                    tipo_fuente: 'LPR'
                });
                
                if (isMounted) {
                    const vehiculosUnicos = new Map<string, Vehiculo>();
                    response.lecturas.forEach((lectura: any) => {
                        if (lectura.matricula && !vehiculosUnicos.has(lectura.matricula)) {
                            vehiculosUnicos.set(lectura.matricula, {
                                id: vehiculosUnicos.size + 1,
                                matricula: lectura.matricula
                            });
                        }
                    });
                    
                    setVehiculos(Array.from(vehiculosUnicos.values()));
                }
            } catch (error: any) {
                if (isMounted) {
                    setError(error.message || 'Error al cargar vehículos');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        setupSubscription();
        cargarVehiculos();

        return () => {
            isMounted = false;
            cleanupSubscription();
        };
    }, [casoId]);

    return (
        <Box>
            <LoadingOverlay visible={loading} />
            {error && <Text color="red">{error}</Text>}
            {/* ... resto del JSX ... */}
        </Box>
    );
}

export default VehiculosPanel; 