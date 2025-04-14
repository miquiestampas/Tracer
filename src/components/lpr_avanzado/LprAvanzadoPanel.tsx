import React, { useState, useEffect } from 'react';
import { Stack, Grid, Button, TextInput, Box, NumberInput, Title, LoadingOverlay, rem, Paper, Group, Badge, ActionIcon, Text, Input } from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { MultiSelect, MultiSelectProps } from '@mantine/core';
import { IconSearch, IconClock, IconDeviceCctv, IconFolder, IconLicense, IconCalendar, IconRoad, IconX, IconLayersIntersect, IconDeviceFloppy, IconCar } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { DataTable, DataTableSortStatus, DataTableProps } from 'mantine-datatable';
import dayjs from 'dayjs';
import _ from 'lodash';

// --- Interfaces (Revisar y asegurar completitud) ---
interface Lector {
    ID_Lector: string;
    Nombre?: string | null;
    Carretera?: string | null;
    Provincia?: string | null;
    Localidad?: string | null;
    Sentido?: string | null;
    Orientacion?: string | null;
    // Añadir otros campos si existen en el schema Lector
}

interface Lectura {
    ID_Lectura: number;
    ID_Archivo: number;
    Matricula: string; // Asegurar que este campo existe y está bien escrito
    Fecha_y_Hora: string; 
    Carril?: string | null;
    Velocidad?: number | null;
    ID_Lector?: string | null;
    Coordenada_X?: number | null;
    Coordenada_Y?: number | null;
    Tipo_Fuente: string;
    lector?: Lector | null;
    pasos?: number;
    // Añadir campo 'relevancia' si existe en el schema Lectura
    // relevancia?: { ID_Relevante: number, Nota?: string | null } | null;
}

type SelectOption = { value: string; label: string };

// --- Estado de una capa ---
interface SearchLayer {
    id: string; // ID único (ej: timestamp)
    name: string; // Nombre descriptivo corto (ej: "Paso KM3 10:00")
    filters: any; // Objeto con los filtros usados para esta capa
    uniquePlates: Set<string>; // Matrículas únicas encontradas
    isActive: boolean;
    resultCount: number; // Número de matrículas encontradas
}

// --- NUEVA Interfaz para Resultados Agrupados ---
interface ResultadoAgrupado {
    matricula: string;
    count: number;
    firstSeen: string; // Formateado como string
    lastSeen: string; // Formateado como string
    readings: Lectura[]; // Array de lecturas para esta matrícula
}

// --- Props del Componente ---
interface LprAvanzadoPanelProps {
    casoId: number; // El ID del caso es obligatorio aquí
}

// --- Tipado para los Filtros Actuales ---
// (Más específico que 'any')
interface CurrentLprFilters {
    fechaInicio: Date | null;
    fechaFin: Date | null;
    timeFrom: string;
    timeTo: string;
    selectedLectores: string[];
    selectedCarreteras: string[];
    matricula: string;
    // minPasos no se usa aquí
}

function LprAvanzadoPanel({ casoId }: LprAvanzadoPanelProps) {
    const iconStyle = { width: rem(16), height: rem(16) };

    // --- Estados para Filtros Actuales (tipado) ---
    const [currentFilters, setCurrentFilters] = useState<CurrentLprFilters>({
        fechaInicio: null,
        fechaFin: null,
        timeFrom: '',
        timeTo: '',
        selectedLectores: [],
        selectedCarreteras: [],
        matricula: ''
    });

    // --- Estados para Listas de Selección (igual que antes) ---
    const [lectoresList, setLectoresList] = useState<SelectOption[]>([]);
    const [carreterasList, setCarreterasList] = useState<SelectOption[]>([]);
    
    // --- Estados de Capas y Resultados ---
    const [layers, setLayers] = useState<SearchLayer[]>([]);
    const [displayedResults, setDisplayedResults] = useState<ResultadoAgrupado[]>([]);
    const [expandedRecordIds, setExpandedRecordIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 10;
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<ResultadoAgrupado>>({ columnAccessor: 'matricula', direction: 'asc' });

     // --- Cargar datos iniciales (Ahora usa el nuevo endpoint) ---
     useEffect(() => {
         const fetchInitialData = async () => {
              setInitialLoading(true);
              // Limpiar listas anteriores
              setLectoresList([]);
              setCarreterasList([]);
              try {
                  // Llamar al nuevo endpoint usando casoId de las props
                  console.log(`LprAvanzado: Fetching filtros disponibles para caso ${casoId}...`);
                  const response = await fetch(`http://localhost:8000/casos/${casoId}/filtros_disponibles`);
                  
                  if (!response.ok) {
                      throw new Error(`Filtros: ${response.statusText || response.status}`);
                  }
                  
                  const data = await response.json();
                  
                  // Asumiendo que la respuesta tiene el formato { lectores: SelectOption[], carreteras: SelectOption[] }
                  if (data && data.lectores && data.carreteras) {
                       setLectoresList(data.lectores);
                       setCarreterasList(data.carreteras);
                       console.log(`LprAvanzado: Filtros cargados - ${data.lectores.length} lectores, ${data.carreteras.length} carreteras.`);
                  } else {
                       throw new Error("Formato inesperado de respuesta para filtros disponibles");
                  }

              } catch (error) {
                  console.error("LprAvanzado: Error fetching filtros disponibles:", error);
                  notifications.show({ title: 'Error', message: 'No se pudieron cargar las opciones de filtro para este caso.', color: 'red' });
              } finally {
                  setInitialLoading(false);
              }
         };
         
         // Ejecutar solo si casoId está definido
         if (casoId) {
             fetchInitialData();
         } else {
            // Manejar caso donde casoId no está disponible (no debería ocurrir aquí)
             setInitialLoading(false); 
             console.error("LprAvanzadoPanel: casoId no proporcionado.");
             notifications.show({ title: 'Error', message: 'ID de caso no disponible para cargar filtros.', color: 'red' });
         }
         
      // Depender solo de casoId para recargar si cambia
     }, [casoId]);

    // --- Procesar datos para la tabla (ordenar/paginar displayedResults) ---
    const sortedAndPaginatedResults = React.useMemo(() => {
        const data = _.orderBy(displayedResults, [sortStatus.columnAccessor], [sortStatus.direction]);
        return data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    }, [displayedResults, sortStatus, page, PAGE_SIZE]);

    // --- Handlers (Placeholder / Lógica Inicial) ---
    const handleFilterChange = (field: keyof CurrentLprFilters, value: any) => {
        setCurrentFilters(prev => ({ ...prev, [field]: value }));
    };

    const handleSaveLayer = async () => {
        setLoading(true);
        const layerName = prompt("Introduce un nombre corto para esta capa de búsqueda:", `Capa ${layers.length + 1}`);
        if (!layerName) {
            setLoading(false);
            return; // Usuario canceló
        }

        const params = new URLSearchParams();
        // Construir params desde currentFilters
        if (currentFilters.fechaInicio) params.append('fecha_inicio', dayjs(currentFilters.fechaInicio).format('YYYY-MM-DD'));
        if (currentFilters.fechaFin) params.append('fecha_fin', dayjs(currentFilters.fechaFin).format('YYYY-MM-DD'));
        if (currentFilters.timeFrom) params.append('hora_inicio', currentFilters.timeFrom);
        if (currentFilters.timeTo) params.append('hora_fin', currentFilters.timeTo);
        currentFilters.selectedLectores.forEach(id => params.append('lector_ids', id));
        currentFilters.selectedCarreteras.forEach(id => params.append('carretera_ids', id));
        if (currentFilters.matricula.trim()) params.append('matricula', currentFilters.matricula.trim());
        
        params.append('caso_ids', String(casoId)); // Usar el casoId de las props
        params.append('tipo_fuente', 'LPR'); // Siempre LPR en este panel
        
        const queryString = params.toString();
        // Usar limit alto para obtener todas las matrículas, o implementar paginación en backend
        const apiUrl = `http://localhost:8000/lecturas?${queryString}&limit=20000`; 
        console.log("Guardando Capa - Llamando API:", apiUrl);

        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                let errorDetail = `HTTP error! ${response.statusText || response.status}`;
                try { const errorData = await response.json(); errorDetail = errorData.detail || JSON.stringify(errorData); } catch (e) {}
                throw new Error(errorDetail);
            }
            const rawResults: Lectura[] = await response.json();

            if (rawResults.length === 0) {
                 notifications.show({ title: "Capa Vacía", message: "La búsqueda no devolvió resultados. No se guardó la capa.", color: 'orange' });
                 setLoading(false);
                 return;
            }

            const uniquePlates = new Set(rawResults.map(l => l.Matricula));

            const newLayer: SearchLayer = {
                id: Date.now().toString(), // ID simple basado en timestamp
                name: layerName,
                filters: { ...currentFilters }, // Guardar una copia de los filtros
                uniquePlates: uniquePlates,
                isActive: false, // Nueva capa no activa por defecto
                resultCount: uniquePlates.size
            };

            setLayers(prev => [...prev, newLayer]);
            notifications.show({ title: "Capa Guardada", message: `Capa "${layerName}" guardada con ${uniquePlates.size} matrículas únicas.`, color: 'green' });
            // Opcional: Limpiar filtros actuales tras guardar?
            // setCurrentFilters({ fechaInicio: '', ... }); 

        } catch (error) {
             notifications.show({ title: 'Error al Guardar Capa', message: `No se pudo ejecutar la búsqueda o guardar la capa. ${error instanceof Error ? error.message : String(error)}`, color: 'red' });
             console.error("Error saving layer:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleLayer = (layerId: string) => {
        setLayers(prev => prev.map(l => l.id === layerId ? { ...l, isActive: !l.isActive } : l));
        // TODO: Disparar actualización de resultados (useEffect dependencia)
    };

    const handleRemoveLayer = (layerId: string) => {
        setLayers(prev => prev.filter(l => l.id !== layerId));
        // TODO: Disparar actualización de resultados si la capa eliminada estaba activa
    };
    
    // --- useEffect para actualizar resultados cuando cambian las capas activas ---
    useEffect(() => {
        const activeLayers = layers.filter(l => l.isActive);
        console.log("Actualizando resultados basado en capas activas:", activeLayers.map(l => l.name));

        const updateResults = async () => {
            setLoading(true);
            setDisplayedResults([]);
            setExpandedRecordIds([]);
            setPage(1);

            if (activeLayers.length === 0) {
                setLoading(false);
                return;
            }

            try {
                let finalResults: Lectura[] = [];

                if (activeLayers.length === 1) {
                    // --- Caso 1: Una capa activa --- 
                    const layer = activeLayers[0];
                    const params = new URLSearchParams();
                    // Reconstruir params desde los filtros guardados de la capa
                    const filters = layer.filters as CurrentLprFilters; // Asumir tipo
                    if (filters.fechaInicio) params.append('fecha_inicio', dayjs(filters.fechaInicio).format('YYYY-MM-DD'));
                    if (filters.fechaFin) params.append('fecha_fin', dayjs(filters.fechaFin).format('YYYY-MM-DD'));
                    if (filters.timeFrom) params.append('hora_inicio', filters.timeFrom);
                    if (filters.timeTo) params.append('hora_fin', filters.timeTo);
                    filters.selectedLectores.forEach(id => params.append('lector_ids', id));
                    filters.selectedCarreteras.forEach(id => params.append('carretera_ids', id));
                    if (filters.matricula.trim()) params.append('matricula', filters.matricula.trim());
                    params.append('caso_ids', String(casoId));
                    params.append('tipo_fuente', 'LPR');
                    
                    const queryString = params.toString();
                    const apiUrl = `http://localhost:8000/lecturas?${queryString}&limit=20000`; // Usar limit alto
                    console.log("Fetching datos para capa única:", apiUrl);

                    const response = await fetch(apiUrl);
                    if (!response.ok) { /* ... error handling ... */ throw new Error(/* ... */); }
                    finalResults = await response.json() as Lectura[];
                    console.log(`Recibidas ${finalResults.length} lecturas para capa única.`);

                } else {
                    // --- Caso 2+: Múltiples capas activas (Intersección) --- 
                    console.log("Calculando intersección para múltiples capas...");
                    let intersectionPlates = new Set<string>(activeLayers[0].uniquePlates);
                    for (let i = 1; i < activeLayers.length; i++) {
                        const currentPlates = activeLayers[i].uniquePlates;
                        intersectionPlates = new Set([...intersectionPlates].filter(plate => currentPlates.has(plate)));
                    }
                    console.log(`Intersección: ${intersectionPlates.size} matrículas`);

                    if (intersectionPlates.size === 0) {
                        finalResults = [];
                    } else {
                        // --- Llamada real al endpoint POST --- 
                        console.log("Llamando a POST /lecturas/por_matriculas_y_filtros_combinados");
                        const payload = {
                            matriculas: Array.from(intersectionPlates),
                            caso_id: casoId, 
                            tipo_fuente: 'LPR'
                            // TODO: Considerar si se deben enviar filtros combinados (fechas, lectores, etc.)
                        };
                        console.log("Payload para backend:", payload);

                        const apiUrl = `http://localhost:8000/lecturas/por_matriculas_y_filtros_combinados`;
                        
                        try {
                             const response = await fetch(apiUrl, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify(payload),
                             });

                             if (!response.ok) {
                                let errorDetail = `Error en POST ${apiUrl}: ${response.statusText || response.status}`;
                                try { const errorData = await response.json(); errorDetail = errorData.detail || JSON.stringify(errorData); } catch (e) {}
                                throw new Error(errorDetail);
                             }

                             finalResults = await response.json() as Lectura[];
                             console.log(`Recibidas ${finalResults.length} lecturas detalladas para la intersección.`);
                             notifications.show({ 
                                title: "Intersección Calculada", 
                                message: `Se cargaron ${finalResults.length} lecturas para ${intersectionPlates.size} matrículas en común.`, 
                                color: 'blue' 
                             });

                        } catch (error) {
                             console.error("Error llamando al endpoint de intersección:", error);
                             notifications.show({ 
                                title: "Error en Intersección", 
                                message: `No se pudieron cargar las lecturas detalladas. ${error instanceof Error ? error.message : String(error)}`, 
                                color: 'red' 
                             });
                             finalResults = []; // Dejar vacío en caso de error
                        }
                        // --- Fin llamada real --- 
                    }
                }

                // --- Agrupar y Transformar finalResults --- 
                if (finalResults.length > 0) {
                    console.log(`Agrupando ${finalResults.length} lecturas por matrícula...`);
                    const grouped: { [key: string]: Lectura[] } = {};
                    for (const lectura of finalResults) {
                        if (!lectura.Matricula) continue; // Ignorar si no hay matrícula
                        if (!grouped[lectura.Matricula]) {
                            grouped[lectura.Matricula] = [];
                        }
                        grouped[lectura.Matricula].push(lectura);
                    }

                    const groupedResultsArray: ResultadoAgrupado[] = Object.entries(grouped).map(([matricula, readings]) => {
                        // Ordenar lecturas por fecha para obtener first/last y para la tabla anidada
                        readings.sort((a, b) => new Date(a.Fecha_y_Hora).getTime() - new Date(b.Fecha_y_Hora).getTime());
                        return {
                            matricula: matricula,
                            count: readings.length,
                            firstSeen: readings.length > 0 ? dayjs(readings[0].Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss') : '-',
                            lastSeen: readings.length > 0 ? dayjs(readings[readings.length - 1].Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss') : '-',
                            readings: readings,
                        };
                    });
                    console.log(`Agrupación completada. ${groupedResultsArray.length} matrículas únicas.`);
                    setDisplayedResults(groupedResultsArray);
                } else {
                     setDisplayedResults([]);
                }
                // --- Fin Agrupación --- 

             } catch (error) {
                 notifications.show({ 
                    title: 'Error al actualizar resultados combinados', 
                    message: `${error instanceof Error ? error.message : String(error)}`,
                    color: 'red' 
                });
                 console.error("Error updating combined results:", error);
             } finally {
                setLoading(false);
             }
        };
        
        updateResults();

    }, [layers, casoId]);

    // --- NUEVA Función para Guardar Vehículos (desde resultados agrupados) ---
    const handleGuardarVehiculosAgrupados = async () => {
        const matriculasUnicas = displayedResults.map(r => r.matricula);
        if (matriculasUnicas.length === 0) return;
        
        setLoading(true); // Usar el mismo loading state general
        console.log("LprAvanzado: Intentando guardar vehículos con matrículas:", matriculasUnicas);

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
                console.error("LprAvanzado: Error guardando vehículo:", result.reason);
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
        // No limpiamos selección aquí porque no hay
        setLoading(false);
    };

    // --- Definición de Columnas DataTable (Tipar r como Lectura) ---
    const columns: DataTableProps<ResultadoAgrupado>['columns'] = [
        { accessor: 'matricula', title: 'Matrícula', sortable: true, width: 120 },
        { accessor: 'count', title: 'Nº Pasos', textAlign: 'right', sortable: true, width: 100 },
        { accessor: 'firstSeen', title: 'Primera Vez', sortable: true, width: 160 },
        { accessor: 'lastSeen', title: 'Última Vez', sortable: true, width: 160 },
    ];

    // Columnas para la tabla anidada (lecturas individuales) - Quitar columnas de Lector ID/Nombre
    const nestedColumns: DataTableProps<Lectura>['columns'] = [
        { accessor: 'Fecha_y_Hora', title: 'Fecha y Hora', render: (r: Lectura) => dayjs(r.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss'), width: 160 },
        { accessor: 'lector.Sentido', title: 'Sentido', render: (r: Lectura) => r.lector?.Sentido || '-', width: 100 },
        { accessor: 'lector.Carretera', title: 'Carretera', render: (r: Lectura) => r.lector?.Carretera || '-', width: 100 },
        { accessor: 'Carril', title: 'Carril', render: (r: Lectura) => r.Carril || '-', width: 70 },
    ];

    // --- Renderizado ---
    return (
        <Box style={{ position: 'relative' }}>
            <LoadingOverlay visible={initialLoading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
            <Grid>
                {/* --- Columna Filtros Actuales (Restaurada) --- */} 
                <Grid.Col span={{ base: 12, md: 4 }}>
                    <Stack>
                        <Title order={4}>Definir Criterios de Búsqueda</Title>
                        <Input.Wrapper label="Fecha Inicio">
                            <DatePicker
                                selected={currentFilters.fechaInicio}
                                onChange={(date: Date | null) => handleFilterChange('fechaInicio', date)}
                                dateFormat="yyyy-MM-dd"
                                placeholderText="AAAA-MM-DD"
                                isClearable
                                customInput={<Input leftSection={<IconCalendar style={iconStyle} />} style={{ width: '100%' }}/>}
                                wrapperClassName="date-picker-wrapper"
                            />
                        </Input.Wrapper>
                         <Input.Wrapper label="Fecha Fin">
                             <DatePicker
                                selected={currentFilters.fechaFin}
                                onChange={(date: Date | null) => handleFilterChange('fechaFin', date)}
                                dateFormat="yyyy-MM-dd"
                                placeholderText="AAAA-MM-DD"
                                isClearable
                                customInput={<Input leftSection={<IconCalendar style={iconStyle} />} style={{ width: '100%' }}/>}
                                wrapperClassName="date-picker-wrapper"
                             />
                        </Input.Wrapper>
                        <Grid>
                             <Grid.Col span={6}>
                                 <TimeInput label="Desde Hora" placeholder="HH:MM" leftSection={<IconClock size={16} />} value={currentFilters.timeFrom} onChange={(e) => handleFilterChange('timeFrom', e.currentTarget.value)}/>
                             </Grid.Col>
                             <Grid.Col span={6}>
                                 <TimeInput label="Hasta Hora" placeholder="HH:MM" leftSection={<IconClock size={16} />} value={currentFilters.timeTo} onChange={(e) => handleFilterChange('timeTo', e.currentTarget.value)} />
                             </Grid.Col>
                         </Grid>
                         <MultiSelect label="Lectores" placeholder="Todos" data={lectoresList} value={currentFilters.selectedLectores} onChange={(v) => handleFilterChange('selectedLectores', v)} leftSection={<IconDeviceCctv size={16} />} searchable clearable disabled={initialLoading} />
                         <MultiSelect label="Carretera" placeholder="Todas" data={carreterasList} value={currentFilters.selectedCarreteras} onChange={(v) => handleFilterChange('selectedCarreteras', v)} leftSection={<IconRoad size={16} />} searchable clearable disabled={initialLoading} />
                         <TextInput label="Matrícula (parcial)" placeholder="Ej: %BC%" value={currentFilters.matricula} onChange={(e) => handleFilterChange('matricula', e.currentTarget.value)} leftSection={<IconLicense size={16} />} />
                        
                        <Group mt="md">
                            <Button onClick={handleSaveLayer} loading={loading} leftSection={<IconDeviceFloppy size={16} />}> Ejecutar y Guardar Capa </Button>
                            <Button 
                                onClick={handleGuardarVehiculosAgrupados}
                                loading={loading}
                                disabled={displayedResults.length === 0} // Deshabilitar si no hay resultados
                                leftSection={<IconCar size={16} />} // Icono coche
                                variant="outline"
                                color="green"
                            >
                                Guardar Vehículos ({displayedResults.length})
                            </Button>
                        </Group>
                    </Stack>
                </Grid.Col>

                {/* --- Columna Capas y Resultados (Sin cambios UI, solo usa 'columns' definidas) --- */} 
                <Grid.Col span={{ base: 12, md: 8 }}>
                    <Stack>
                        {/* Área de Capas Guardadas */}
                        <Paper withBorder p="xs" mb="md">
                            <Title order={5} mb="xs">Capas Guardadas</Title>
                            {layers.length === 0 && (
                                <Text size="sm" c="dimmed">
                                    No hay capas guardadas. Ejecuta una búsqueda y guárdala.
                                </Text>
                            )}
                            <Group gap="xs">
                                {layers.map(layer => (
                                    <Badge 
                                        key={layer.id} 
                                        variant={layer.isActive ? 'filled' : 'light'} 
                                        onClick={() => handleToggleLayer(layer.id)}
                                        style={{ cursor: 'pointer' }}
                                        pr={3} // Espacio para el botón de cierre
                                        leftSection={layer.isActive ? <IconLayersIntersect size={12} /> : undefined}
                                        rightSection={
                                            <ActionIcon size="xs" color="blue" radius="xl" variant="transparent" onClick={(e) => { e.stopPropagation(); handleRemoveLayer(layer.id); }}>
                                                <IconX size={12} />
                                            </ActionIcon>
                                        }
                                    >
                                        {layer.name} ({layer.resultCount})
                                    </Badge>
                                ))}
                            </Group>
                        </Paper>
                        
                        {/* Tabla de Resultados Modificada */}
                        <Title order={4}>Resultados Combinados ({displayedResults.length} Matrículas)</Title>
                        <Box style={{ height: 'calc(100vh - 450px)', position: 'relative' }}> 
                             <LoadingOverlay visible={loading && !initialLoading} zIndex={500} />
                             {!loading && displayedResults.length === 0 && (
                                 <div style={{ textAlign: 'center', padding: rem(20) }}>
                                     {layers.filter(l => l.isActive).length > 0 
                                        ? "No se encontraron resultados para las capas seleccionadas."
                                        : "Activa una o más capas para ver resultados combinados."
                                     }
                                 </div>
                             )}
                             {displayedResults.length > 0 && (
                                 <DataTable<ResultadoAgrupado>
                                     records={sortedAndPaginatedResults} 
                                     columns={columns}
                                     idAccessor="matricula"
                                     totalRecords={displayedResults.length}
                                     recordsPerPage={PAGE_SIZE}
                                     page={page}
                                     onPageChange={setPage}
                                     sortStatus={sortStatus}
                                     onSortStatusChange={setSortStatus}
                                     withTableBorder
                                     borderRadius="sm"
                                     withColumnBorders
                                     striped
                                     highlightOnHover
                                     minHeight={200}
                                     rowExpansion={{
                                        allowMultiple: true,
                                        expanded: {
                                            recordIds: expandedRecordIds,
                                            onRecordIdsChange: setExpandedRecordIds,
                                        },
                                        content: ({ record }: { record: ResultadoAgrupado }) => (
                                            <Box p="sm" bg="gray.1">
                                                <DataTable<Lectura>
                                                    records={record.readings}
                                                    columns={nestedColumns}
                                                    withTableBorder
                                                    borderRadius="sm"
                                                    striped
                                                    highlightOnHover
                                                    minHeight={100}
                                                    noHeader
                                                    noRecordsText="" 
                                                />
                                            </Box>
                                        ),
                                     }}
                                 />
                             )}
                        </Box>
                    </Stack>
                </Grid.Col>
            </Grid>
        </Box>
    );
}

export default LprAvanzadoPanel; 