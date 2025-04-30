import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, LoadingOverlay, Alert, Group, Button, Pagination, Select } from '@mantine/core';
import { DataTable, DataTableSortStatus, type DataTableColumn } from 'mantine-datatable';
import { notifications } from '@mantine/notifications';
import { IconCar, IconBookmark, IconBookmarkOff, IconCheck } from '@tabler/icons-react';
import dayjs from 'dayjs';
import _ from 'lodash';

import type { Lectura } from '../../types/data';

type AnalisisPanelProps = { casoId: number | any };

async function getLecturasLPR(params: { casoId: number; skip: number; limit: number; sort?: string; order?: string }): Promise<{ lecturas: Lectura[]; totalCount: number }> {
    console.warn("Usando función placeholder getLecturasLPR");
    await new Promise(resolve => setTimeout(resolve, 500)); 
    return { lecturas: [], totalCount: 0 }; 
}

function AnalisisLprPanel({ casoId }: AnalisisPanelProps) {
    const [lecturas, setLecturas] = useState<Lectura[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState({ page: 1, pageSize: 20, totalCount: 0 });
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Lectura>>({ columnAccessor: 'Fecha_y_Hora', direction: 'asc' });
    const [selectedLecturas, setSelectedLecturas] = useState<Lectura[]>([]);

    const fetchLecturas = useCallback(async (page: number, pageSize: number, sort: DataTableSortStatus<Lectura>) => {
        setLoading(true);
        setError(null);
        try {
            const skip = (page - 1) * pageSize;
            const limit = pageSize;
            const sortParam = sort.columnAccessor;
            const orderParam = sort.direction;
            
            const response = await getLecturasLPR({ 
                casoId, 
                skip, 
                limit,
                sort: sortParam, 
                order: orderParam 
            });
            
            setLecturas(response.lecturas);
            setPagination(prev => ({ ...prev, totalCount: response.totalCount, page }));
        } catch (err: any) {
            setError(err.message || 'Error al cargar lecturas LPR.');
            setLecturas([]);
            setPagination(prev => ({ ...prev, totalCount: 0 }));
        } finally {
            setLoading(false);
        }
    }, [casoId]);

    useEffect(() => {
        fetchLecturas(pagination.page, pagination.pageSize, sortStatus);
    }, [pagination.page, pagination.pageSize, sortStatus, fetchLecturas]);

    const paginatedAndSortedLecturas = useMemo(() => {
        return lecturas;
    }, [lecturas]);

    const handleMarkRelevant = async () => {
        if (selectedLecturas.length === 0) return;
        const lectureIdsToMark = selectedLecturas.map(l => l.ID_Lectura);

        if (!window.confirm(`¿Marcar como relevantes ${lectureIdsToMark.length} lectura(s) seleccionada(s)?`)) return;

        setLoading(true);
        let successes = 0;
        let errors = 0;

        const results = await Promise.allSettled(
            lectureIdsToMark.map(id => 
                 fetch(`http://localhost:8000/lecturas/${id}/marcar_relevante`, { 
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ Nota: null })
                  })
                 .then(response => {
                     if (!response.ok && response.status !== 409) { 
                         return response.json().catch(() => null).then(errorData => {
                              throw new Error(errorData?.detail || `Error ${response.status}`);
                          });
                     }
                     return { id };
                  })
            )
        );

        results.forEach((result, index) => {
             const id = lectureIdsToMark[index];
             if (result.status === 'fulfilled') {
                 successes++;
             } else {
                 errors++;
                 console.error(`Error marcando relevante lectura ${id}:`, result.reason);
                  notifications.show({
                      title: 'Error al Marcar',
                      message: `No se pudo marcar ID ${id}: ${result.reason.message}`,
                      color: 'red'
                  });
             }
         });

        if (successes > 0) {
             notifications.show({
                 title: 'Lecturas Marcadas',
                 message: `${successes} lectura(s) marcada(s) como relevantes.` + (errors > 0 ? ` ${errors} fallaron.` : ''),
                 color: errors > 0 ? 'orange' : 'green',
                 icon: <IconCheck size={18} />
             });
        }
        
        setSelectedLecturas([]);
        setLoading(false);
    };

    const handleUnmarkRelevant = async () => {
         if (selectedLecturas.length === 0) return;
         const lectureIdsToUnmark = selectedLecturas.map(l => l.ID_Lectura);

         if (!window.confirm(`¿Desmarcar como relevantes ${lectureIdsToUnmark.length} lectura(s) seleccionada(s)?`)) return;

         setLoading(true);
         let successes = 0;
         let errors = 0;

         const results = await Promise.allSettled(
             lectureIdsToUnmark.map(id => 
                 fetch(`http://localhost:8000/lecturas/${id}/desmarcar_relevante`, { method: 'DELETE' })
                 .then(response => {
                     if (!response.ok && response.status !== 404) { 
                          return response.json().catch(() => null).then(errorData => {
                              throw new Error(errorData?.detail || `Error ${response.status}`);
                          });
                     }
                     return { id };
                  })
             )
         );

        results.forEach((result, index) => {
             const id = lectureIdsToUnmark[index];
             if (result.status === 'fulfilled') {
                 successes++;
             } else {
                 errors++;
                 console.error(`Error desmarcando relevante lectura ${id}:`, result.reason);
                  notifications.show({
                      title: 'Error al Desmarcar',
                      message: `No se pudo desmarcar ID ${id}: ${result.reason.message}`,
                      color: 'red'
                  });
             }
         });

         if (successes > 0) {
              notifications.show({
                  title: 'Lecturas Desmarcadas',
                  message: `${successes} lectura(s) desmarcada(s).` + (errors > 0 ? ` ${errors} fallaron.` : ''),
                  color: errors > 0 ? 'orange' : 'green',
                  icon: <IconCheck size={18} />
              });
         }
         
         setSelectedLecturas([]);
         setLoading(false);
    };

    const handleSaveSelectedVehicles = async () => {
        const matriculasUnicas = Array.from(new Set(selectedLecturas.map(l => l.Matricula)));
        if (matriculasUnicas.length === 0) return;
        
        setLoading(true); 
        console.log("AnalisisLPR: Intentando guardar vehículos seleccionados:", matriculasUnicas);

        let vehiculosCreados = 0;
        let vehiculosExistentes = 0;
        let errores = 0;

        const results = await Promise.allSettled(
            matriculasUnicas.map(matricula => 
                fetch(`http://localhost:8000/vehiculos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ Matricula: matricula }),
                }).then(async response => {
                    if (response.status === 201) return { status: 'created', matricula };
                    if (response.status === 400) { 
                         const errorData = await response.json().catch(() => null);
                         console.warn(`Vehículo ${matricula} ya existe o petición inválida:`, errorData?.detail);
                         return { status: 'exists', matricula };
                    }
                    const errorData = await response.json().catch(() => null);
                    throw new Error(errorData?.detail || `HTTP ${response.status}`);
                })
            )
        );

        results.forEach(result => { 
             if (result.status === 'fulfilled') {
                 if (result.value.status === 'created') vehiculosCreados++;
                 if (result.value.status === 'exists') vehiculosExistentes++;
             } else {
                 errores++;
                 console.error("AnalisisLPR: Error guardando vehículo:", result.reason);
                  notifications.show({ title: 'Error Parcial', message: `No se pudo procesar matrícula: ${result.reason.message}`, color: 'red' });
             }
         });

        let message = '';
        if (vehiculosCreados > 0) message += `${vehiculosCreados} vehículo(s) nuevo(s) guardado(s). `; 
        if (vehiculosExistentes > 0) message += `${vehiculosExistentes} vehículo(s) ya existían. `; 
        if (errores > 0) message += `${errores} matrícula(s) no se pudieron procesar.`;
        
        if (message) { 
            notifications.show({ 
                 title: "Guardar Vehículos Completado", 
                 message: message.trim(), 
                 color: errores > 0 ? (vehiculosCreados > 0 ? 'orange' : 'red') : 'green' 
             });
         }
        
        setSelectedLecturas([]); 
        setLoading(false);
    };

    const columns: DataTableColumn<Lectura>[] = [
        { accessor: 'Matricula', title: 'Matrícula', sortable: true },
        { accessor: 'Fecha_y_Hora', title: 'Fecha y Hora', sortable: true, render: (l) => dayjs(l.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss') },
        { accessor: 'Carril', title: 'Carril', sortable: false },
        { accessor: 'Velocidad', title: 'Velocidad', sortable: true },
        { accessor: 'ID_Lector', title: 'ID Lector', sortable: true },
    ];

    return (
        <Box style={{ position: 'relative' }}>
            <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
            {error && (
                <Alert title="Error" color="red" withCloseButton onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}
            
            <Group mb="sm">
                 <Button 
                    size="xs"
                    variant="outline" 
                    leftSection={<IconBookmark size={16} />} 
                    onClick={handleMarkRelevant}
                    disabled={selectedLecturas.length === 0 || loading}
                >
                    Marcar Relevante ({selectedLecturas.length})
                </Button>
                 <Button 
                    size="xs"
                    variant="outline" 
                    color="orange"
                    leftSection={<IconBookmarkOff size={16} />} 
                    onClick={handleUnmarkRelevant}
                    disabled={selectedLecturas.length === 0 || loading}
                >
                    Desmarcar Relevante ({selectedLecturas.length})
                </Button>
                <Button 
                    size="xs"
                    variant="outline" 
                    color="green"
                    leftSection={<IconCar size={16} />} 
                    onClick={handleSaveSelectedVehicles}
                    disabled={selectedLecturas.length === 0 || loading}
                >
                    Guardar Vehículos ({selectedLecturas.length})
                </Button>
            </Group>

            <DataTable<Lectura>
                records={paginatedAndSortedLecturas}
                columns={columns}
                totalRecords={pagination.totalCount}
                recordsPerPage={pagination.pageSize}
                page={pagination.page}
                onPageChange={(p) => setPagination(prev => ({ ...prev, page: p }))}
                sortStatus={sortStatus}
                onSortStatusChange={setSortStatus}
                minHeight={200}
                withTableBorder
                borderRadius="sm"
                selectedRecords={selectedLecturas}
                onSelectedRecordsChange={setSelectedLecturas}
                idAccessor="ID_Lectura"
            />
            <Pagination 
                 total={Math.ceil(pagination.totalCount / pagination.pageSize)} 
                 value={pagination.page} 
                 onChange={(p) => setPagination(prev => ({...prev, page: p}))} 
                 mt="sm" 
            />

            {/* Agrupar Organismo y Provincia */}
            <Group grow mb="xs">
                <Select
                    label="Organismo"
                    placeholder="Todos"
                    // ...props de Organismo...
                />
                <Select
                    label="Provincia"
                    placeholder="Todas"
                    // ...props de Provincia...
                />
            </Group>
            {/* Agrupar Carretera y Sentido */}
            <Group grow mb="xs">
                <Select
                    label="Carretera"
                    placeholder="Todas"
                    // ...props de Carretera...
                />
                <Select
                    label="Sentido"
                    placeholder="Ambos"
                    // ...props de Sentido...
                />
            </Group>
        </Box>
    );
}

export default AnalisisLprPanel; 