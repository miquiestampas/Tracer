import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Stack, Grid, Button, TextInput, Box, NumberInput, LoadingOverlay, Title, rem, Input, Group, ActionIcon, Tooltip, Paper, Checkbox, ThemeIcon, Text, Flex, useMantineTheme } from '@mantine/core';
import { TimeInput, DateInput } from '@mantine/dates';
import { MultiSelect, MultiSelectProps } from '@mantine/core';
import { IconSearch, IconClock, IconDeviceCctv, IconFolder, IconLicense, IconRoad, IconArrowsUpDown, IconStar, IconStarOff, IconDeviceFloppy, IconBookmark, IconBookmarkOff, IconCar, IconStarFilled, IconCalendar } from '@tabler/icons-react';
import { notifications, showNotification } from '@mantine/notifications';
import { DataTable, DataTableSortStatus, DataTableColumn } from 'mantine-datatable';
import dayjs from 'dayjs';
import _ from 'lodash';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format } from 'date-fns';
import type { Lectura, Lector } from '../../types/data'; // Importar tipos necesarios

// --- Estilos específicos (añadidos aquí también) ---
const customStyles = `
  .highlighted-row {
    background-color: var(--mantine-color-blue-0) !important; /* Azul muy claro */
  }
  .highlighted-row:hover {
    background-color: var(--mantine-color-blue-1) !important; /* Un azul ligeramente más oscuro */
  }
  /* Forzar label encima del input para DatePicker en este panel */
  .analisis-datepicker-wrapper .mantine-InputWrapper-label {
      display: block;
      margin-bottom: var(--mantine-spacing-xs); /* Ajustar espacio si es necesario */
  }
`;

// --- Eliminar Interfaces Locales Duplicadas ---
/*
interface Lector {
    ID_Lector: string;
    Nombre?: string | null;
    Carretera?: string | null;
    Provincia?: string | null;
    Localidad?: string | null;
    Sentido?: string | null;
    Orientacion?: string | null;
    // ... (otros campos de Lector si son necesarios) ...
}

interface Lectura {
    ID_Lectura: number;
    ID_Archivo: number;
    Matricula: string;
    Fecha_y_Hora: string; 
    Carril?: string | null;
    Velocidad?: number | null;
    ID_Lector?: string | null;
    Coordenada_X?: number | null;
    Coordenada_Y?: number | null;
    Tipo_Fuente: string;
    relevancia?: { ID_Relevante: number, Nota?: string | null } | null;
    lector?: Lector | null;
    pasos?: number;
}
*/

type SelectOption = { value: string; label: string };

// --- Props del Componente (Actualizadas) ---
interface AnalisisLecturasPanelProps {
    casoIdFijo?: number | null; 
    permitirSeleccionCaso?: boolean; 
    mostrarTitulo?: boolean; 
    tipoFuenteFijo?: 'LPR' | 'GPS' | null;
    interactedMatriculas: Set<string>;                  // <-- Prop recibida
    addInteractedMatricula: (matriculas: string[]) => void; // <-- Prop recibida
}

function AnalisisLecturasPanel({ 
    casoIdFijo = null,
    permitirSeleccionCaso = true,
    mostrarTitulo = true,
    tipoFuenteFijo = null,
    interactedMatriculas,                              // <-- Recibir prop
    addInteractedMatricula                             // <-- Recibir prop
}: AnalisisLecturasPanelProps) {
    const iconStyle = { width: rem(16), height: rem(16) }; // Añadir iconStyle
    const theme = useMantineTheme();

    // --- Estados (completos) ---
    const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
    const [fechaFin, setFechaFin] = useState<Date | null>(null);
    const [timeFrom, setTimeFrom] = useState('');
    const [timeTo, setTimeTo] = useState('');
    const [selectedLectores, setSelectedLectores] = useState<string[]>([]);
    const [selectedCasos, setSelectedCasos] = useState<string[]>([]);
    const [selectedCarreteras, setSelectedCarreteras] = useState<string[]>([]);
    const [selectedSentidos, setSelectedSentidos] = useState<string[]>([]);
    const [matricula, setMatricula] = useState('');
    const [minPasos, setMinPasos] = useState<number | ''>('');
    const [lectoresList, setLectoresList] = useState<SelectOption[]>([]);
    const [casosList, setCasosList] = useState<SelectOption[]>([]);
    const [carreterasList, setCarreterasList] = useState<SelectOption[]>([]);
    const [sentidosList, setSentidosList] = useState<SelectOption[]>([
        { value: 'C', label: 'Creciente' },
        { value: 'D', label: 'Decreciente' },
    ]);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true); 
    const [results, setResults] = useState<Lectura[]>([]);
    const [selectedRecords, setSelectedRecords] = useState<Lectura[]>([]);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Lectura>>({ columnAccessor: 'Fecha_y_Hora', direction: 'desc' });
    const [allSelected, setAllSelected] = useState(false);
    const [someSelected, setSomeSelected] = useState(false);
    const [selectedRecordIds, setSelectedRecordIds] = useState<number[]>([]);

    // --- Procesar datos (completo) ---
    const sortedAndPaginatedResults = useMemo(() => {
        const accessor = sortStatus.columnAccessor as keyof Lectura;
        const data = _.orderBy(results, [accessor], [sortStatus.direction]);
        return data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    }, [results, sortStatus, page, PAGE_SIZE]);

    // --- Cargar datos iniciales (Condicional según casoIdFijo) ---
    useEffect(() => {
        const fetchInitialData = async () => {
            setInitialLoading(true);
            // Limpiar listas siempre al iniciar
            setLectoresList([]);
            setCarreterasList([]);
            setCasosList([]); 

            try {
                if (casoIdFijo) {
                    // --- Cargar filtros específicos del caso --- 
                    console.log(`AnalisisLecturasPanel: Fetching filtros disponibles para caso ${casoIdFijo}...`);
                    const response = await fetch(`http://localhost:8000/casos/${casoIdFijo}/filtros_disponibles`);
                    if (!response.ok) throw new Error(`Filtros caso ${casoIdFijo}: ${response.statusText || response.status}`);
                    const data = await response.json();
                    if (data && data.lectores && data.carreteras) {
                        setLectoresList(data.lectores);
                        setCarreterasList(data.carreteras);
                         console.log(`AnalisisLecturasPanel: Filtros específicos cargados - ${data.lectores.length} lectores, ${data.carreteras.length} carreteras.`);
                    } else { throw new Error("Formato inesperado para filtros específicos"); }
                    // No necesitamos cargar la lista de casos aquí

                } else {
                     // --- Cargar filtros globales (comportamiento anterior) --- 
                     console.log("AnalisisLecturasPanel: Fetching filtros globales...");
                     const fetches: (Promise<Response> | null)[] = [];
                     // Cargar TODOS los lectores
                     fetches.push(fetch('http://localhost:8000/lectores?limit=2000'));
                     // Cargar TODOS los casos (si se permite selección)
                     if (permitirSeleccionCaso) {
                         fetches.push(fetch('http://localhost:8000/casos?limit=1000'));
                     } else { fetches.push(null); }

                     const responses = await Promise.all(fetches);

                     const lectoresResponse = responses[0];
                     if (lectoresResponse instanceof Response) {
                         if (!lectoresResponse.ok) throw new Error(`Lectores Globales: ${lectoresResponse.statusText || lectoresResponse.status}`);
                         const lectoresData = await lectoresResponse.json();
                         // ... (Lógica para procesar lectoresData y derivar carreteras globales) ...
                         if (lectoresData && Array.isArray(lectoresData.lectores)) { // Asume formato {lectores: [...]} 
                            const formattedLectores: SelectOption[] = lectoresData.lectores.map((l: any) => ({ value: String(l.ID_Lector), label: `${l.Nombre || 'Sin Nombre'} (${l.ID_Lector})` }));
                            setLectoresList(formattedLectores);
                            const todasCarreteras = lectoresData.lectores.map((l: any) => l.Carretera?.trim());
                            const carreterasFiltradas = todasCarreteras.filter((c): c is string => !!c);
                            const uniqueCarreteras = Array.from(new Set<string>(carreterasFiltradas)).sort((a, b) => a.localeCompare(b));
                            setCarreterasList(uniqueCarreteras.map((c: string) => ({ value: c, label: c })));
                            console.log("AnalisisLecturasPanel: Filtros globales cargados.");
                         } else {
                             // Intentar formato array directo si el anterior falla
                             if (lectoresData && Array.isArray(lectoresData)) {
                                 const formattedLectores: SelectOption[] = lectoresData.map((l: any) => ({ value: String(l.ID_Lector), label: `${l.Nombre || 'Sin Nombre'} (${l.ID_Lector})` }));
                                 setLectoresList(formattedLectores);
                                 const todasCarreteras = lectoresData.map((l: any) => l.Carretera?.trim());
                                 const carreterasFiltradas = todasCarreteras.filter((c): c is string => !!c);
                                 const uniqueCarreteras = Array.from(new Set<string>(carreterasFiltradas)).sort((a, b) => a.localeCompare(b));
                                 setCarreterasList(uniqueCarreteras.map((c: string) => ({ value: c, label: c })));
                                 console.log("AnalisisLecturasPanel: Filtros globales cargados (formato array).");
                             } else {
                                 throw new Error("Formato inesperado para lectores globales");
                             }
                         }
                     }

                     const casosResponse = responses[1];
                     if (permitirSeleccionCaso && casosResponse instanceof Response) {
                         if (!casosResponse.ok) throw new Error(`Casos Globales: ${casosResponse.statusText || casosResponse.status}`);
                         const casosData = await casosResponse.json();
                         if (Array.isArray(casosData)) {
                            const formattedCasos: SelectOption[] = casosData.map((c: any) => ({ value: String(c.ID_Caso), label: c.Nombre_del_Caso || 'Caso sin nombre' }));
                            setCasosList(formattedCasos);
                            console.log("AnalisisLecturasPanel: Lista de casos globales cargada.");
                         } else { throw new Error("Formato inesperado para casos globales"); }
                     }
                }
            } catch (error) {
                 notifications.show({ title: 'Error al cargar opciones de filtro', message: `${error instanceof Error ? error.message : String(error)}`, color: 'red', });
                 console.error("AnalisisLecturasPanel: Error fetching initial filter data:", error);
            } finally { setInitialLoading(false); }
        };
        fetchInitialData();
     // Depender de casoIdFijo para decidir qué cargar
    }, [casoIdFijo, permitirSeleccionCaso]);

    // --- Función de Búsqueda (completa) ---
    const handleSearch = async () => {
        setLoading(true);
        setResults([]);
        let rawResults: Lectura[] = [];
        const params = new URLSearchParams();
        if (fechaInicio) params.append('fecha_inicio', dayjs(fechaInicio).format('YYYY-MM-DD'));
        if (fechaFin) params.append('fecha_fin', dayjs(fechaFin).format('YYYY-MM-DD'));
        if (timeFrom) params.append('hora_inicio', timeFrom);
        if (timeTo) params.append('hora_fin', timeTo);
        selectedLectores.forEach(id => params.append('lector_ids', id));
        selectedCarreteras.forEach(id => params.append('carretera_ids', id));
        selectedSentidos.forEach(s => params.append('sentido', s));
        if (casoIdFijo) {
            params.append('caso_ids', String(casoIdFijo));
        } else if (permitirSeleccionCaso) {
            selectedCasos.forEach(id => params.append('caso_ids', id));
        }
        if (matricula.trim()) params.append('matricula', matricula.trim());
        if (tipoFuenteFijo) {
            params.append('tipo_fuente', tipoFuenteFijo);
        }
        const queryString = params.toString();
        const apiUrl = `http://localhost:8000/lecturas?${queryString}&limit=10000`;
        console.log(`Llamando a API (${tipoFuenteFijo || 'Todos'}):`, apiUrl);
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) { 
                let errorDetail = `HTTP error! status: ${response.statusText || response.status}`;
                try { const errorData = await response.json(); errorDetail = errorData.detail || JSON.stringify(errorData); } catch (e) {} 
                throw new Error(errorDetail);
             }
            rawResults = await response.json();
            let processedResults = rawResults;
            if (rawResults.length > 0) {
                const plateCounts = rawResults.reduce((acc, lectura) => { acc[lectura.Matricula] = (acc[lectura.Matricula] || 0) + 1; return acc; }, {} as Record<string, number>);
                processedResults = rawResults.map(lectura => ({ ...lectura, pasos: plateCounts[lectura.Matricula] }));
                const minPasosValue = typeof minPasos === 'number' ? minPasos : parseInt(minPasos, 10);
                if (!isNaN(minPasosValue) && minPasosValue > 1) {
                    processedResults = processedResults.filter(lectura => lectura.pasos && lectura.pasos >= minPasosValue);
                }
            }
            setResults(processedResults);
            setPage(1);
            notifications.show({ title: 'Búsqueda completada', message: `Se encontraron ${processedResults.length} lecturas.`, color: 'teal', autoClose: 3000 });
        } catch (error) {
            notifications.show({ title: 'Error en la búsqueda', message: `No se pudieron obtener los resultados. ${error instanceof Error ? error.message : String(error)}`, color: 'red' });
            console.error("Error during search:", error);
        } finally { setLoading(false); }
    };

    // --- NUEVO: Handler de selección que notifica al padre --- 
    const handleSelectionChange = useCallback((newSelectedRecords: Lectura[]) => {
        setSelectedRecords(newSelectedRecords);
        // Notificar al padre sobre las nuevas matrículas seleccionadas
        const newlySelectedMatriculas = newSelectedRecords.map(record => record.Matricula); // Usar Matricula
        if (newlySelectedMatriculas.length > 0) {
             addInteractedMatricula(newlySelectedMatriculas); // <-- Llamar a la prop
        }
    }, [addInteractedMatricula]); // <-- Añadir dependencia

    // --- Funciones para Acciones ---
    const handleMarcarRelevante = async () => {
        if (selectedRecords.length === 0) return;
        setLoading(true);
        const idsToMark = selectedRecords.map(r => r.ID_Lectura);
        console.log("Marcando como relevante IDs:", idsToMark);

        if (casoIdFijo === null || casoIdFijo === undefined || isNaN(casoIdFijo)) {
            notifications.show({ title: 'Error', message: 'No se pudo determinar el ID del caso actual para marcar la lectura.', color: 'red' });
            setSelectedRecords([]);
            setLoading(false);
            return;
        }

        const results = await Promise.allSettled(
            idsToMark.map(id => 
                fetch(`http://localhost:8000/lecturas/${id}/marcar_relevante`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        Nota: null,
                        caso_id: casoIdFijo
                     }) 
                })
                    .then(response => {
                        if (!response.ok) { 
                            // Intentar leer detalle del error si existe
                            return response.json().catch(() => null).then(errorData => {
                                const detail = errorData?.detail || `HTTP ${response.status}`;
                                throw new Error(`Error marcando ${id}: ${detail}`);
                            });
                        }
                        return response.json(); // Devolver los datos de relevancia creados
                    })
            )
        );

        let successCount = 0;
        const updatedRelevanciaMap = new Map<number, any>();

        results.forEach((result, index) => {
            const id = idsToMark[index];
            if (result.status === 'fulfilled') {
                successCount++;
                updatedRelevanciaMap.set(id, result.value); // Guardar los datos de relevancia devueltos por la API
                console.log(`Lectura ${id} marcada como relevante.`);
            } else {
                console.error(`Error marcando lectura ${id}:`, result.reason);
                notifications.show({ title: 'Error Parcial', message: `No se pudo marcar la lectura ID ${id}: ${result.reason.message}`, color: 'red' });
            }
        });

        if (successCount > 0) {
             notifications.show({ title: 'Éxito', message: `${successCount} de ${idsToMark.length} lecturas marcadas como relevantes.`, color: 'green' });
            // Actualizar estado local para reflejar cambios
            setResults(prevResults => prevResults.map(lectura => {
                if (updatedRelevanciaMap.has(lectura.ID_Lectura)) {
                    return { ...lectura, relevancia: updatedRelevanciaMap.get(lectura.ID_Lectura) };
                }
                return lectura;
            }));
        }

        setSelectedRecords([]); // Limpiar selección
        setLoading(false);
    };

    const handleDesmarcarRelevante = async () => {
        const recordsToUnmark = selectedRecords.filter(r => r.relevancia);
        if (recordsToUnmark.length === 0) {
            notifications.show({ title: 'Nada que hacer', message: 'Ninguna de las lecturas seleccionadas está marcada como relevante.', color: 'blue' });
            setSelectedRecords([]);
            return;
        }
        setLoading(true);
        const idsToUnmark = recordsToUnmark.map(r => r.ID_Lectura);
        console.log("Desmarcando como relevante IDs:", idsToUnmark);

        const results = await Promise.allSettled(
            idsToUnmark.map(id => 
                fetch(`http://localhost:8000/lecturas/${id}/desmarcar_relevante`, { method: 'DELETE' })
                    .then(response => {
                        if (!response.ok) {
                             return response.json().catch(() => null).then(errorData => {
                                const detail = errorData?.detail || `HTTP ${response.status}`;
                                throw new Error(`Error desmarcando ${id}: ${detail}`);
                            });
                        }
                        return id; // Devolver el ID en caso de éxito
                    })
            )
        );
        
        let successCount = 0;
        const unmarkedIds = new Set<number>();

        results.forEach((result, index) => {
            const id = idsToUnmark[index];
            if (result.status === 'fulfilled') {
                successCount++;
                unmarkedIds.add(id);
                console.log(`Lectura ${id} desmarcada como relevante.`);
            } else {
                console.error(`Error desmarcando lectura ${id}:`, result.reason);
                notifications.show({ title: 'Error Parcial', message: `No se pudo desmarcar la lectura ID ${id}: ${result.reason.message}`, color: 'red' });
            }
        });

        if (successCount > 0) {
             notifications.show({ title: 'Éxito', message: `${successCount} de ${idsToUnmark.length} lecturas desmarcadas.`, color: 'green' });
            // Actualizar estado local
             setResults(prevResults => prevResults.map(lectura => {
                if (unmarkedIds.has(lectura.ID_Lectura)) {
                    return { ...lectura, relevancia: null };
                }
                return lectura;
            }));
        }

        setSelectedRecords([]); // Limpiar selección
        setLoading(false);
    };

    // --- NUEVA Función para Guardar Vehículos ---
    const handleGuardarVehiculos = async () => {
        const matriculasUnicas = Array.from(new Set(selectedRecords.map(r => r.Matricula)));
        if (matriculasUnicas.length === 0) return;
        
        setLoading(true); // Usar el mismo loading state general
        console.log("Intentando guardar vehículos con matrículas:", matriculasUnicas);

        let vehiculosCreados = 0;
        let vehiculosExistentes = 0;
        let errores = 0;

        // Podríamos verificar primero cuáles ya existen con un GET /vehiculos?matricula=..., 
        // pero por simplicidad, intentaremos crear y manejaremos el error 400 (Conflict/Bad Request).

        const results = await Promise.allSettled(
            matriculasUnicas.map(matricula => 
                fetch(`http://localhost:8000/vehiculos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ Matricula: matricula }), // Enviar solo matrícula
                }).then(async response => {
                    if (response.status === 201) return { status: 'created', matricula }; // Creado
                    if (response.status === 400) { // Asumimos 400 para "ya existe"
                         // Intentar leer el detalle por si da más info
                         const errorData = await response.json().catch(() => null);
                         console.warn(`Vehículo ${matricula} ya existe o petición inválida:`, errorData?.detail);
                         return { status: 'exists', matricula }; // Ya existía
                    }
                     // Otro error
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
                console.error("Error guardando vehículo:", result.reason);
                notifications.show({ title: 'Error Parcial', message: `No se pudo procesar una matrícula: ${result.reason.message}`, color: 'red' });
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

        setSelectedRecords([]); // Limpiar selección
        setLoading(false);
    };

    const columns: DataTableColumn<Lectura>[] = useMemo(() => {
        // Estado del checkbox "Seleccionar Todo" para la página actual
        const recordIdsOnPageSet = new Set(sortedAndPaginatedResults.map(r => r.ID_Lectura));
        const selectedIdsOnPage = selectedRecords.filter(sr => recordIdsOnPageSet.has(sr.ID_Lectura));
        const allRecordsOnPageSelected = sortedAndPaginatedResults.length > 0 && selectedIdsOnPage.length === sortedAndPaginatedResults.length;
        const indeterminate = selectedIdsOnPage.length > 0 && !allRecordsOnPageSelected;

        return [
            {
                accessor: 'select',
                title: (
                    <Checkbox
                        aria-label="Seleccionar todas las filas visibles"
                        checked={allRecordsOnPageSelected}
                        indeterminate={indeterminate}
                        onChange={() => {
                            setSelectedRecords(currentSelected => {
                                const selectedIdsSet = new Set(currentSelected.map(sr => sr.ID_Lectura));
                                const recordsToAdd = sortedAndPaginatedResults.filter(r => !selectedIdsSet.has(r.ID_Lectura));
                                const recordIdsOnPage = sortedAndPaginatedResults.map(r => r.ID_Lectura);

                                if (allRecordsOnPageSelected) {
                                    // Deseleccionar solo los de esta página
                                    return currentSelected.filter(r => !recordIdsOnPage.includes(r.ID_Lectura));
                                } else {
                                    // Seleccionar todos los de esta página (añadir los que falten)
                                    return [...currentSelected, ...recordsToAdd];
                                }
                            });
                        }}
                        size="xs"
                    />
                ),
                width: rem(40), // Ancho fijo
                textAlign: 'center',
                render: (record) => (
                    <Checkbox
                        aria-label={`Seleccionar fila ID ${record.ID_Lectura}`}
                        checked={selectedRecords.some(sr => sr.ID_Lectura === record.ID_Lectura)}
                        onChange={() => {
                            setSelectedRecords(currentSelected =>
                                currentSelected.some(sr => sr.ID_Lectura === record.ID_Lectura)
                                    ? currentSelected.filter(sr => sr.ID_Lectura !== record.ID_Lectura)
                                    : [...currentSelected, record]
                            );
                        }}
                        size="xs"
                        onClick={(e) => e.stopPropagation()} // Evita activar onRowClick
                    />
                ),
            },
            { accessor: 'relevancia', title: 'Rel', width: 40, textAlign: 'center', render: (record) => 
                record.relevancia ? (
                    <Tooltip label={record.relevancia.Nota || 'Marcado como relevante'} withArrow position="top-start">
                        <IconStar size={16} color="orange" />
                    </Tooltip>
                ) : null,
            },
            { accessor: 'Fecha_y_Hora', title: 'Fecha y Hora', render: (r: Lectura) => dayjs(r.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss'), sortable: true, width: 160 },
            { accessor: 'Matricula', title: 'Matrícula', sortable: true, width: 100 },
            { accessor: 'lector.ID_Lector', title: 'ID Lector', render: (r: Lectura) => r.lector?.ID_Lector || '-', sortable: true, width: 150 },
            { accessor: 'lector.Sentido', title: 'Sentido', render: (r: Lectura) => r.lector?.Sentido || '-', sortable: true, width: 100 },
            { accessor: 'lector.Orientacion', title: 'Orientación', render: (r: Lectura) => r.lector?.Orientacion || '-', sortable: true, width: 100 },
            { accessor: 'lector.Carretera', title: 'Carretera', render: (r: Lectura) => r.lector?.Carretera || '-', sortable: true, width: 100 },
            { accessor: 'Carril', title: 'Carril', render: (r: Lectura) => r.Carril || '-', sortable: true, width: 70 },
            { accessor: 'pasos', title: 'Pasos', textAlign: 'right', render: (r: Lectura) => r.pasos || '-', sortable: true, width: 70 },
        ];
    }, [sortedAndPaginatedResults, selectedRecords]);

    // --- Renderizado (completo) ---
    return (
        <Box style={{ position: 'relative' }}>
            <style>{customStyles}</style> {/* Añadir estilos */} 
            <Grid>
                 <LoadingOverlay visible={initialLoading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
                 {/* --- Columna Filtros --- */} 
                 <Grid.Col span={{ base: 12, md: 3 }} style={{ minWidth: 300 }}>
                     <Paper shadow="sm" p="md" withBorder>
                         <Stack gap="sm">
                             <Title order={4} mb="sm">Definir Filtros</Title>
                             {permitirSeleccionCaso && (
                                 <MultiSelect
                                     label="Casos"
                                     placeholder="Seleccionar casos..."
                                     data={casosList}
                                     value={selectedCasos}
                                     onChange={setSelectedCasos}
                                     searchable
                                     clearable
                                     disabled={initialLoading}
                                     leftSection={<IconFolder style={iconStyle} />}
                                 />
                             )}
                             <Input.Wrapper label="Fecha Inicio" size="xs" className="analisis-datepicker-wrapper">
                                <DatePicker
                                    selected={fechaInicio}
                                    onChange={(date) => setFechaInicio(date)}
                                    dateFormat="yyyy-MM-dd"
                                    placeholderText="AAAA-MM-DD"
                                    isClearable
                                    customInput={
                                        <Input 
                                            leftSection={<IconCalendar style={iconStyle} />} 
                                            style={{ width: '100%' }}
                                        />
                                    }
                                />
                            </Input.Wrapper>
                            
                            <Input.Wrapper label="Fecha Fin" size="xs" className="analisis-datepicker-wrapper">
                             <DatePicker
                                selected={fechaFin}
                                onChange={(date) => setFechaFin(date)}
                                dateFormat="yyyy-MM-dd"
                                placeholderText="AAAA-MM-DD"
                                isClearable
                                customInput={
                                    <Input 
                                        leftSection={<IconCalendar style={iconStyle} />} 
                                        style={{ width: '100%' }}
                                    />
                                }
                            />
                            </Input.Wrapper>
                            <Group grow>
                                <TimeInput 
                                    label="Desde Hora" 
                                    value={timeFrom} 
                                    onChange={(event) => setTimeFrom(event.currentTarget.value)} 
                                    leftSection={<IconClock style={iconStyle} />} 
                                />
                                <TimeInput 
                                    label="Hasta Hora" 
                                    value={timeTo} 
                                    onChange={(event) => setTimeTo(event.currentTarget.value)} 
                                    leftSection={<IconClock style={iconStyle} />} 
                                />
                            </Group>
                            <MultiSelect
                                label="Lectores"
                                placeholder="Todos"
                                data={lectoresList}
                                value={selectedLectores}
                                onChange={setSelectedLectores}
                                searchable
                                clearable
                                disabled={initialLoading}
                                leftSection={<IconDeviceCctv style={iconStyle} />}
                            />
                            <MultiSelect
                                label="Carretera"
                                placeholder="Todas"
                                data={carreterasList}
                                value={selectedCarreteras}
                                onChange={setSelectedCarreteras}
                                searchable
                                clearable
                                disabled={initialLoading}
                                leftSection={<IconRoad style={iconStyle} />}
                            />
                            {tipoFuenteFijo === 'LPR' && (
                                <MultiSelect
                                    label="Sentido"
                                    placeholder="Ambos"
                                    data={sentidosList}
                                    value={selectedSentidos}
                                    onChange={setSelectedSentidos}
                                    clearable
                                    leftSection={<IconArrowsUpDown style={iconStyle} />}
                                />
                            )}
                            <TextInput
                                label="Matrícula (parcial)"
                                placeholder="Ej: %BC%"
                                value={matricula}
                                onChange={(event) => setMatricula(event.currentTarget.value)}
                                leftSection={<IconLicense style={iconStyle} />}
                            />
                            {tipoFuenteFijo === 'LPR' && (
                                <NumberInput
                                    label="Mín. Pasos"
                                    placeholder="Cualquiera"
                                    value={minPasos}
                                    onChange={(value) => setMinPasos(value === '' ? '' : Number(value))}
                                    min={1}
                                    allowDecimal={false}
                                    allowNegative={false}
                                    clampBehavior="strict"
                                />
                            )}
                            <Button 
                                onClick={handleSearch} 
                                loading={loading} 
                                disabled={initialLoading} 
                                leftSection={<IconSearch style={iconStyle} />} 
                                size="sm"
                                variant="filled"
                                fullWidth 
                                mt="md"
                            >
                                Ejecutar Filtro
                            </Button>
                         </Stack>
                     </Paper>
                 </Grid.Col>
                 
                 {/* --- Columna Resultados --- */} 
                 <Grid.Col span={{ base: 12, md: 9 }}>
                     <Box style={{ position: 'relative' }}>
                        <LoadingOverlay visible={loading && !initialLoading} zIndex={500} />
                        
                        <Group mb="sm">
                             <Button 
                                size="xs" 
                                variant="outline" 
                                leftSection={<IconBookmark size={16} />}
                                onClick={handleMarcarRelevante} 
                                disabled={selectedRecords.length === 0 || loading}
                            >
                                Marcar Relevante ({selectedRecords.length})
                            </Button>
                             <Button 
                                size="xs" 
                                variant="outline" 
                                color="orange" 
                                leftSection={<IconBookmarkOff size={16} />}
                                onClick={handleDesmarcarRelevante} 
                                disabled={selectedRecords.length === 0 || loading}
                            >
                                Desmarcar Relevante ({selectedRecords.length})
                            </Button>
                             <Button 
                                size="xs" 
                                variant="outline" 
                                color="green" 
                                leftSection={<IconCar size={16} />}
                                onClick={handleGuardarVehiculos} 
                                disabled={selectedRecords.length === 0 || loading}
                            >
                                Guardar Vehículos ({selectedRecords.length})
                            </Button>
                        </Group>
                        
                        <DataTable<Lectura>
                           withTableBorder
                           borderRadius="sm"
                           withColumnBorders
                           striped
                           highlightOnHover
                           records={sortedAndPaginatedResults}
                           columns={columns}
                           minHeight={results.length === 0 ? 150 : 0} 
                           totalRecords={results.length}
                           recordsPerPage={PAGE_SIZE}
                           page={page}
                           onPageChange={setPage}
                           sortStatus={sortStatus}
                           onSortStatusChange={setSortStatus}
                           idAccessor="ID_Lectura"
                           noRecordsText=""
                           noRecordsIcon={<></>}
                           rowClassName={({ Matricula }) => 
                               interactedMatriculas.has(Matricula) ? 'highlighted-row' : undefined
                           }
                        />
                     </Box>
                 </Grid.Col>
            </Grid>
        </Box>
    );
}

export default AnalisisLecturasPanel; 