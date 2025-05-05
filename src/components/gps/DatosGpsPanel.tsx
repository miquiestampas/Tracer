import React, { useState, useEffect } from 'react';
import { Box, Paper, Text, Group, Button, TextInput, Select, Stack, ActionIcon, Tooltip } from '@mantine/core';
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import { IconSearch, IconClearAll, IconEye, IconCar, IconBookmark, IconRefresh, IconFilter } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { getLecturasGps } from '../../services/gpsApi';
import type { GpsLectura } from '../../types/data';
import dayjs from 'dayjs';

// Estado inicial para los filtros
interface FilterState {
    matricula: string;
    fechaInicio: string;
    horaInicio: string;
    fechaFin: string;
    horaFin: string;
}

const initialFilterState: FilterState = {
    matricula: '',
    fechaInicio: '',
    horaInicio: '',
    fechaFin: '',
    horaFin: '',
};

interface DatosGpsPanelProps {
    casoId: number;
}

const DatosGpsPanel: React.FC<DatosGpsPanelProps> = ({ casoId }) => {
    // Estados
    const [loading, setLoading] = useState(true);
    const [gpsData, setGpsData] = useState<GpsLectura[]>([]);
    const [filters, setFilters] = useState<FilterState>(initialFilterState);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);
    const [totalRecords, setTotalRecords] = useState(0);
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<GpsLectura>>({
        columnAccessor: 'Fecha_y_Hora',
        direction: 'desc',
    });
    const [selectedRecordIds, setSelectedRecordIds] = useState<number[]>([]);
    const [dispositivos, setDispositivos] = useState<string[]>([]);
    const [matriculas, setMatriculas] = useState<{ value: string; label: string }[]>([]);

    // Columnas de la tabla
    const columns: DataTableColumn<GpsLectura>[] = [
        { accessor: 'ID_Lectura', title: 'ID', textAlign: 'right' },
        { accessor: 'Matricula', title: 'Matrícula' },
        { 
            accessor: 'Fecha_y_Hora', 
            title: 'Fecha y Hora', 
            render: (record) => dayjs(record.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss'),
        },
        { accessor: 'Coordenada_Y', title: 'Latitud', textAlign: 'right' },
        { accessor: 'Coordenada_X', title: 'Longitud', textAlign: 'right' },
        { accessor: 'Velocidad', title: 'Velocidad', textAlign: 'right' },
        {
            accessor: 'actions',
            title: 'Acciones',
            textAlign: 'center',
            render: (record) => (
                <Group gap={4} justify="center">
                    <Tooltip label="Ver en mapa">
                        <ActionIcon variant="subtle" color="blue" size="sm">
                            <IconEye size={16} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Guardar vehículo">
                        <ActionIcon variant="subtle" color="green" size="sm">
                            <IconCar size={16} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Marcar relevante">
                        <ActionIcon variant="subtle" color="yellow" size="sm">
                            <IconBookmark size={16} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            ),
        },
    ];

    // Cargar datos GPS
    const fetchGpsData = async () => {
        setLoading(true);
        try {
            const data = await getLecturasGps(casoId, {
                matricula: filters.matricula || undefined,
                fecha_inicio: filters.fechaInicio || undefined,
                hora_inicio: filters.horaInicio || undefined,
                fecha_fin: filters.fechaFin || undefined,
                hora_fin: filters.horaFin || undefined
            });
            
            // Extraer matrículas únicas y ordenarlas
            const matriculasUnicas = [...new Set(data.map(item => item.Matricula))]
                .filter(matricula => matricula !== null && matricula !== undefined)
                .sort()
                .map(matricula => ({ value: matricula, label: matricula }));
            setMatriculas(matriculasUnicas);
            
            // Aplicar paginación del lado del cliente
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            setGpsData(data.slice(start, end));
            setTotalRecords(data.length);
        } catch (error) {
            console.error('Error fetching GPS data:', error);
            notifications.show({
                title: 'Error',
                message: 'No se pudieron cargar los datos GPS',
                color: 'red',
            });
        } finally {
            setLoading(false);
        }
    };

    // Cargar datos iniciales
    useEffect(() => {
        if (casoId) {
            fetchGpsData();
        }
    }, [casoId, page, pageSize, filters]);

    // Handlers
    const handleFilterChange = (key: keyof FilterState, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleClearFilters = () => {
        setFilters(initialFilterState);
        setPage(1);
        fetchGpsData();
    };

    const handleRefresh = () => {
        setPage(1);
        fetchGpsData();
    };

    const handleApplyFilters = () => {
        setPage(1);
        fetchGpsData();
    };

    return (
        <>
            <style>{`
                .mantine-DataTable-noRecords svg,
                .mantine-DataTable-noRecords [class*="noRecordsIcon"],
                .mantine-DataTable-noRecords [data-icon],
                .mantine-DataTable-noRecordsIcon {
                    display: none !important;
                }
            `}</style>
            <Paper shadow="xs" p="md" withBorder>
                <Stack gap="md">
                    {/* Filtros */}
                    <Group gap="xs" align="flex-end" grow>
                        <Select
                            label="Matrícula"
                            placeholder="Seleccionar matrícula..."
                            value={filters.matricula}
                            onChange={(value) => handleFilterChange('matricula', value || '')}
                            data={matriculas}
                            searchable
                            clearable
                        />
                        <TextInput
                            label="Fecha Inicio"
                            type="date"
                            value={filters.fechaInicio}
                            onChange={(e) => handleFilterChange('fechaInicio', e.target.value)}
                        />
                        <TextInput
                            label="Hora Inicio"
                            type="time"
                            value={filters.horaInicio}
                            onChange={(e) => handleFilterChange('horaInicio', e.target.value)}
                        />
                        <TextInput
                            label="Fecha Fin"
                            type="date"
                            value={filters.fechaFin}
                            onChange={(e) => handleFilterChange('fechaFin', e.target.value)}
                        />
                        <TextInput
                            label="Hora Fin"
                            type="time"
                            value={filters.horaFin}
                            onChange={(e) => handleFilterChange('horaFin', e.target.value)}
                        />
                        <Button
                            variant="filled"
                            color="#234be7"
                            leftSection={<IconFilter size={16} />}
                            onClick={handleApplyFilters}
                        >
                            Aplicar Filtros
                        </Button>
                        <Button
                            variant="light"
                            color="gray"
                            leftSection={<IconClearAll size={16} />}
                            onClick={handleClearFilters}
                        >
                            Limpiar
                        </Button>
                        <Button
                            variant="light"
                            color="blue"
                            leftSection={<IconRefresh size={16} />}
                            onClick={handleRefresh}
                        >
                            Actualizar
                        </Button>
                    </Group>

                    {/* Tabla de datos */}
                    <DataTable<GpsLectura>
                        records={gpsData}
                        columns={columns}
                        withTableBorder
                        borderRadius="sm"
                        striped
                        highlightOnHover
                        idAccessor="ID_Lectura"
                        selectedRecords={gpsData.filter(r => selectedRecordIds.includes(r.ID_Lectura))}
                        onSelectedRecordsChange={(records) => setSelectedRecordIds(records.map(r => r.ID_Lectura))}
                        sortStatus={sortStatus}
                        onSortStatusChange={setSortStatus}
                        page={page}
                        onPageChange={setPage}
                        totalRecords={totalRecords}
                        recordsPerPage={pageSize}
                        onRecordsPerPageChange={setPageSize}
                        recordsPerPageOptions={[10, 15, 20, 25, 50]}
                        fetching={loading}
                        noRecordsText=""
                        verticalSpacing="xs"
                        fontSize="xs"
                    />
                </Stack>
            </Paper>
        </>
    );
};

export default DatosGpsPanel; 