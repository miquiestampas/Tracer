import React, { useState, useEffect, useMemo, useCallback } from 'react';
// Importaciones necesarias (asegúrate de que estén todas)
import { Stack, Grid, Button, TextInput, Box, NumberInput, LoadingOverlay, Title, rem, Input, Group, ActionIcon, Tooltip, Paper, Checkbox, ThemeIcon, Text, Flex, useMantineTheme } from '@mantine/core';
import { TimeInput, DateInput } from '@mantine/dates';
import { MultiSelect } from '@mantine/core';
import { IconSearch, IconClock, IconFolder, IconLicense, IconCalendar, IconArrowsUpDown, IconStar, IconBookmark, IconBookmarkOff, IconCar } from '@tabler/icons-react'; // Quitar IconDeviceCctv, IconRoad si ya no se usan
import { notifications } from '@mantine/notifications';
import { DataTable, DataTableSortStatus, DataTableColumn } from 'mantine-datatable';
import dayjs from 'dayjs';
import _ from 'lodash';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format } from 'date-fns';
import type { Lectura } from '../../types/data'; // Ajustar si la estructura es diferente para GPS

// --- Estilos ---
const customStyles = `/* ... */`;

// --- Interfaces (Ajustar si Lectura GPS es diferente) ---
// type SelectOption = { value: string; label: string }; // Si se usa

// --- Props ---
interface AnalisisGpsPanelProps {
    casoIdFijo?: number | null;
    permitirSeleccionCaso?: boolean;
    // ... otras props si las hubiera ...
}

function AnalisisGpsPanel({
    casoIdFijo = null,
    permitirSeleccionCaso = true,
    // ... otras props ...
}: AnalisisGpsPanelProps) {

    const theme = useMantineTheme();
    const iconStyle = { width: rem(16), height: rem(16) };

    // --- Estados (Quitar los relacionados con lectores y carreteras) ---
    const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
    const [fechaFin, setFechaFin] = useState<Date | null>(null);
    const [timeFrom, setTimeFrom] = useState('');
    const [timeTo, setTimeTo] = useState('');
    const [selectedCasos, setSelectedCasos] = useState<string[]>([]);
    const [matricula, setMatricula] = useState('');
    const [casosList, setCasosList] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [results, setResults] = useState<Lectura[]>([]); // Usar tipo LecturaGPS si es diferente
    const [selectedRecords, setSelectedRecords] = useState<Lectura[]>([]);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Lectura>>({ columnAccessor: 'Fecha_y_Hora', direction: 'desc' });


    // --- Carga de datos iniciales (Quitar carga de lectores/carreteras) ---
    useEffect(() => {
        const fetchInitialData = async () => {
            setInitialLoading(true);
            setCasosList([]);
            try {
                // Cargar solo Casos si es necesario
                if (!casoIdFijo && permitirSeleccionCaso) {
                     console.log("AnalisisGpsPanel: Fetching casos globales...");
                     // const response = await fetch('http://localhost:8000/casos?limit=1000');
                     // ... (procesar respuesta de casos) ...
                     setCasosList([{value:'1', label:'Caso A'}, {value:'2', label:'Caso B'}]); // Simulación
                } else {
                    console.log("AnalisisGpsPanel: Usando caso fijo o sin selección de caso.");
                }
            } catch (error) {
                 notifications.show({ title: 'Error al cargar opciones', message: String(error), color: 'red' });
            } finally { setInitialLoading(false); }
        };
        fetchInitialData();
    }, [casoIdFijo, permitirSeleccionCaso]);

    // --- Función de Búsqueda (Quitar filtros de lectores/carreteras) ---
    const handleSearch = async () => {
        setLoading(true);
        setResults([]);
        setSelectedRecords([]);
        
        try {
            if (!casoIdFijo) {
                throw new Error('Se requiere un caso para buscar lecturas GPS');
            }

            const searchParams = new URLSearchParams();
            if (fechaInicio) searchParams.append('fecha_inicio', dayjs(fechaInicio).format('YYYY-MM-DD'));
            if (fechaFin) searchParams.append('fecha_fin', dayjs(fechaFin).format('YYYY-MM-DD'));
            if (timeFrom) searchParams.append('hora_inicio', timeFrom);
            if (timeTo) searchParams.append('hora_fin', timeTo);
            if (matricula.trim()) searchParams.append('matricula', matricula.trim());
            
            // Asegurarnos de que el tipo_fuente se envía como 'GPS' exactamente
            searchParams.append('tipo_fuente', 'GPS');

            console.log(`Buscando lecturas GPS para caso ${casoIdFijo}:`, Object.fromEntries(searchParams));
            
            const response = await fetch(`http://localhost:8000/casos/${casoIdFijo}/lecturas?${searchParams.toString()}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Error en la respuesta:', errorText);
                throw new Error(`Error ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            console.log(`Se encontraron ${data.length} lecturas GPS`);
            
            // Verificar que las lecturas son realmente GPS
            const lecturasGPS = data.filter((lectura: any) => lectura.Tipo_Fuente === 'GPS');
            console.log(`De las cuales ${lecturasGPS.length} son realmente GPS`);
            
            setResults(lecturasGPS);
            setPage(1);
            notifications.show({ 
                title: 'Búsqueda GPS completada', 
                message: `Se encontraron ${lecturasGPS.length} puntos GPS.`, 
                color: 'teal' 
            });

        } catch (error) {
            console.error('Error en búsqueda GPS:', error);
            notifications.show({ 
                title: 'Error en búsqueda GPS', 
                message: error instanceof Error ? error.message : String(error), 
                color: 'red' 
            });
        } finally { 
            setLoading(false); 
        }
    };

    // --- Procesar datos para la tabla (ordenación/paginación) ---
    // Ajustar lógica si el tipo LecturaGPS es diferente
    const sortedData = useMemo(() => {
         const data = [...results];
         // ... (Lógica de ordenación adaptada a campos GPS si es necesario) ...
         const { columnAccessor, direction } = sortStatus;
         _.orderBy(data, [columnAccessor], [direction]);
         return data;
    }, [results, sortStatus]);

    const records = useMemo(() => {
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE;
        return sortedData.slice(from, to);
    }, [sortedData, page, PAGE_SIZE]);

    // --- Handlers Acciones (Adaptar si las acciones son diferentes para GPS) ---
     const handleMarkRelevant = async () => { /* ... (Lógica adaptada si aplica) ... */ };
     const handleUnmarkRelevant = async () => { /* ... (Lógica adaptada si aplica) ... */ };
     const handleGuardarVehiculos = async () => { /* ... (Lógica adaptada si aplica) ... */ };

    // --- Definición de Columnas (Adaptar a campos GPS) ---
    const columns: DataTableColumn<Lectura>[] = useMemo(() => {
         // Estado del checkbox "Seleccionar Todo"
         const recordIdsOnPageSet = new Set(records.map(r => r.ID_Lectura)); // Usar ID único
         const selectedIdsOnPage = selectedRecords.filter(sr => recordIdsOnPageSet.has(sr.ID_Lectura));
         const allRecordsOnPageSelected = records.length > 0 && selectedIdsOnPage.length === records.length;
         const indeterminate = selectedIdsOnPage.length > 0 && !allRecordsOnPageSelected;

        return [
             // Columna de Selección
            {
                accessor: 'select', title: ( <Checkbox aria-label="Seleccionar todo" checked={allRecordsOnPageSelected} indeterminate={indeterminate} onChange={() => { /* ... */ }} size="xs"/> ),
                width: rem(40), textAlign: 'center',
                render: (record) => ( <Checkbox aria-label="Seleccionar fila" checked={selectedRecords.some(sr => sr.ID_Lectura === record.ID_Lectura)} onChange={() => { /* ... */ }} size="xs" onClick={(e) => e.stopPropagation()} /> ),
            },
            // Columnas de datos GPS
            { accessor: 'ID_Lectura', title: 'ID', width: 80, sortable: true }, // O ID único de GPS si existe
            { accessor: 'relevancia', title: 'Rel', width: 40, /* ... */ },
            { accessor: 'Matricula', title: 'Matrícula', sortable: true, width: 100 },
            { accessor: 'Fecha_y_Hora', title: 'Fecha/Hora', /* ... */ sortable: true, width: 160 },
            { accessor: 'Coordenada_Y', title: 'Latitud', sortable: true, width: 100 },
            { accessor: 'Coordenada_X', title: 'Longitud', sortable: true, width: 100 },
            { accessor: 'Velocidad', title: 'Velocidad', sortable: true, width: 80 },
            // Añadir otras columnas relevantes de GPS si existen
        ];
    }, [records, selectedRecords]); // Dependencias correctas


    // --- Renderizado ---
    return (
         <Box style={{ position: 'relative' }}>
             <style>{customStyles}</style>
             <LoadingOverlay visible={initialLoading || loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
             <Grid>
                 {/* --- Columna Filtros --- */}
                 <Grid.Col span={{ base: 12, md: 3 }} style={{ minWidth: 300 }}>
                     <Paper shadow="sm" p="md" withBorder>
                         <Stack gap="sm">
                             <Title order={4} mb="sm">Definir Filtros GPS</Title>
                             {permitirSeleccionCaso && (
                                 <MultiSelect label="Casos" data={casosList} value={selectedCasos} onChange={setSelectedCasos} disabled={initialLoading} leftSection={<IconFolder style={iconStyle} />} searchable clearable />
                             )}
                             <Input.Wrapper label="Fecha Inicio" size="xs">
                                <DatePicker selected={fechaInicio} onChange={setFechaInicio} /* ... */ customInput={<Input leftSection={<IconCalendar style={iconStyle} />} />} />
                              </Input.Wrapper>
                              <Input.Wrapper label="Fecha Fin" size="xs">
                                <DatePicker selected={fechaFin} onChange={setFechaFin} /* ... */ customInput={<Input leftSection={<IconCalendar style={iconStyle} />} />} />
                              </Input.Wrapper>
                               <Group grow>
                                 <TimeInput label="Desde Hora" placeholder="HH:MM" value={timeFrom} onChange={(e) => setTimeFrom(e.currentTarget.value)} leftSection={<IconClock style={iconStyle} />} />
                                 <TimeInput label="Hasta Hora" placeholder="HH:MM" value={timeTo} onChange={(e) => setTimeTo(e.currentTarget.value)} leftSection={<IconClock style={iconStyle} />} />
                               </Group>

                               <TextInput label="Matrícula (parcial)" placeholder="Ej: %1234%" value={matricula} onChange={(e) => setMatricula(e.currentTarget.value)} leftSection={<IconLicense style={iconStyle} />} />

                             <Button onClick={handleSearch} loading={loading} disabled={initialLoading} leftSection={<IconSearch style={iconStyle} />} size="sm" variant="filled" fullWidth mt="md">
                                 Ejecutar Filtro GPS
                             </Button>
                         </Stack>
                     </Paper>
                 </Grid.Col>

                 {/* --- Columna Resultados --- */}
                 <Grid.Col span={{ base: 12, md: 9 }}>
                     <Box style={{ position: 'relative' }}>
                        <LoadingOverlay visible={loading && !initialLoading} zIndex={500} />

                        {/* Controles de acción (adaptados a GPS si es necesario) */}
                        <Group justify="flex-end" mb="sm">
                              <Button size="xs" variant="filled" color="yellow" leftSection={<IconStar size={16} />} onClick={handleMarkRelevant} disabled={selectedRecords.length === 0 || loading}>Marcar Relevante ({selectedRecords.length})</Button>
                              <Button size="xs" variant="light" color="gray" leftSection={<IconBookmarkOff size={16} />} onClick={handleUnmarkRelevant} disabled={selectedRecords.length === 0 || loading}>Desmarcar Relevante ({selectedRecords.length})</Button>
                              <Button size="xs" variant="outline" color="blue" leftSection={<IconCar size={16} />} onClick={handleGuardarVehiculos} disabled={selectedRecords.length === 0 || loading}>Guardar Vehículos ({selectedRecords.length})</Button>
                        </Group>

                        <DataTable<Lectura> // Usar LecturaGPS si es diferente
                           withTableBorder borderRadius="sm" withColumnBorders striped highlightOnHover
                           records={records}
                           columns={columns} // Columnas adaptadas a GPS
                           minHeight={results.length === 0 ? 150 : 0}
                           totalRecords={results.length}
                           recordsPerPage={PAGE_SIZE}
                           page={page}
                           onPageChange={setPage}
                           sortStatus={sortStatus}
                           onSortStatusChange={setSortStatus}
                           idAccessor="ID_Lectura" // O ID único de GPS
                           noRecordsText=""
                           noRecordsIcon={<></>}
                           // Quitar rowClassName si no aplica a GPS
                           // rowClassName={({ Matricula }) => interactedMatriculas?.has(Matricula) ? 'highlighted-row' : undefined}
                           // Quitar rowExpansion si no aplica a GPS
                        />
                         {!loading && results.length === 0 && (
                            <Text c="dimmed" ta="center" mt="md">No se encontraron puntos GPS con los filtros aplicados.</Text>
                         )}
                     </Box>
                 </Grid.Col>
             </Grid>
         </Box>
    );
}

export default AnalisisGpsPanel;
