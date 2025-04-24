import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Stack, Grid, Button, TextInput, Box, NumberInput, Title, LoadingOverlay, rem, Paper, Group, Badge, ActionIcon, Text, Input, Checkbox, Tooltip, InputLabel, Modal, ColorInput, Textarea } from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { MultiSelect, MultiSelectProps } from '@mantine/core';
import { IconSearch, IconClock, IconDeviceCctv, IconFolder, IconLicense, IconCalendar, IconRoad, IconX, IconLayersIntersect, IconDeviceFloppy, IconCar, IconPlayerPlay, IconTrash, IconPencil, IconColorSwatch, IconFilterOff, IconUpload, IconCheck, IconBookmark, IconBookmarkOff, IconArrowsUpDown } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { DataTable, DataTableSortStatus, DataTableProps } from 'mantine-datatable';
import dayjs from 'dayjs';
import _ from 'lodash';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { updateSavedSearch } from '../../services/casosApi';
import type { SavedSearch, SavedSearchUpdatePayload } from '../../types/data';
import apiClient from '../../services/api';
import appEventEmitter from '../../utils/eventEmitter';

// Definir logger (usando console)
const logger = console;

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

// --- Interfaces (SearchLayer ahora es temporal, ResultadoAgrupado, etc.) ---
// Interfaz para estado temporal de búsqueda activa (si se necesita)
interface ActiveSearch {
    filters: CurrentLprFilters;
    // Podríamos almacenar aquí los resultados directos si "Ejecutar Filtro" no usa el sistema de capas
}

// --- Tipado para los Filtros Actuales (Importante: Normalizar fechas antes de guardar/ejecutar) ---
interface CurrentLprFilters {
    fechaInicio: Date | null; 
    fechaFin: Date | null;
    timeFrom: string;
    timeTo: string;
    selectedLectores: string[];
    selectedCarreteras: string[];
    matricula: string;
    selectedSentidos: string[];
    minPasos: number | null;
    maxPasos: number | null;
}

// --- NUEVA Interfaz para Resultados Agrupados ---
interface ResultadoAgrupado {
    matricula: string;
    count: number;
    firstSeen: string; // Formateado como string
    lastSeen: string; // Formateado como string
    readings: Lectura[]; // Array de lecturas para esta matrícula
}

// --- NUEVA: Props del componente ---
interface LprAvanzadoPanelProps {
    casoId: number;
    interactedMatriculas: Set<string>;         // <-- Prop recibida
    addInteractedMatricula: (matriculas: string[]) => void; // <-- Prop recibida
}

// *** NUEVA Función Auxiliar para formatear filtros ***
function formatFiltersSummary(filtros: any): string {
    if (!filtros) return '-';
    const parts: string[] = [];

    // Fechas
    if (filtros.fechaInicio && filtros.fechaFin) {
        parts.push(`Fechas: ${dayjs(filtros.fechaInicio).format('DD/MM/YY')}-${dayjs(filtros.fechaFin).format('DD/MM/YY')}`);
    } else if (filtros.fechaInicio) {
        parts.push(`Desde: ${dayjs(filtros.fechaInicio).format('DD/MM/YY')}`);
    } else if (filtros.fechaFin) {
        parts.push(`Hasta: ${dayjs(filtros.fechaFin).format('DD/MM/YY')}`);
    }

    // Horas
    if (filtros.timeFrom && filtros.timeTo) {
        parts.push(`Hora: ${filtros.timeFrom}-${filtros.timeTo}`);
    } else if (filtros.timeFrom) {
        parts.push(`Desde H: ${filtros.timeFrom}`);
    } else if (filtros.timeTo) {
        parts.push(`Hasta H: ${filtros.timeTo}`);
    }

    // Lectores
    if (filtros.selectedLectores && filtros.selectedLectores.length > 0) {
        parts.push(`Lectores: ${filtros.selectedLectores.length}`);
    }

    // Carreteras
    if (filtros.selectedCarreteras && filtros.selectedCarreteras.length > 0) {
        parts.push(`Carreteras: ${filtros.selectedCarreteras.length}`);
    }

    // Matrícula
    if (filtros.matricula) {
        parts.push(`Matrícula: ${filtros.matricula}`);
    }

    // Sentidos
    if (filtros.selectedSentidos && filtros.selectedSentidos.length > 0) {
        parts.push(`Sentidos: ${filtros.selectedSentidos.join(', ')}`);
    }

    // Pasos
    if (filtros.minPasos !== null && filtros.minPasos !== undefined) {
        parts.push(`MinPasos: ${filtros.minPasos}`);
    }
    if (filtros.maxPasos !== null && filtros.maxPasos !== undefined) {
        parts.push(`MaxPasos: ${filtros.maxPasos}`);
    }

    return parts.length > 0 ? parts.join(' | ') : 'Sin filtros específicos';
}

// Estado inicial para los filtros (para poder resetear)
const initialFiltersState: CurrentLprFilters = {
    fechaInicio: null,
    fechaFin: null,
    timeFrom: '',
    timeTo: '',
    selectedLectores: [],
    selectedCarreteras: [],
    matricula: '',
    selectedSentidos: [],
    minPasos: null,
    maxPasos: null,
};

// Opciones para Sentido
const sentidoOptions: SelectOption[] = [
    { value: 'Creciente', label: 'Creciente' },
    { value: 'Decreciente', label: 'Decreciente' },
    // Podrían añadirse 'Norte', 'Sur', etc., si se usan
];

// --- Estilos específicos ---
const customStyles = `
  /* Estilos tabla resultados */
  .results-datatable th:first-child,
  .results-datatable td:first-child {
    width: 50px !important; 
    min-width: 50px !important;
    max-width: 50px !important;
    padding-left: var(--mantine-spacing-xs) !important; 
    padding-right: var(--mantine-spacing-xs) !important;
  }

  /* Estilos resaltado */
  .highlighted-row {
    background-color: var(--mantine-color-blue-0) !important; 
  }
  .highlighted-row:hover {
      background-color: var(--mantine-color-blue-1) !important; 
  }

  /* Estilos DatePicker LPR Avanzado */
  .lpr-avanzado-datepicker-wrapper .mantine-InputWrapper-label {
      display: block !important; 
      margin-bottom: var(--mantine-spacing-xs);
  }

  /* NUEVO: Forzar ancho columna selección Tabla Búsquedas Guardadas */
  .saved-searches-datatable th:first-child,
  .saved-searches-datatable td:first-child {
      width: 50px !important; /* Ancho fijo muy reducido */
      min-width: 50px !important;
      max-width: 50px !important;
      padding-left: var(--mantine-spacing-xs) !important; /* Ajustar padding si es necesario */
      padding-right: var(--mantine-spacing-xs) !important;
  }
`;

// --- NUEVO: Interfaz para el formulario de edición ---
interface EditSavedSearchFormValues {
    nombre: string;
    color: string;
    notas: string;
}

function LprAvanzadoPanel({ casoId, interactedMatriculas, addInteractedMatricula }: LprAvanzadoPanelProps) {
    const iconStyle = { width: rem(16), height: rem(16) };

    // --- Estados para Filtros Actuales (tipado) ---
    const [currentFilters, setCurrentFilters] = useState<CurrentLprFilters>(initialFiltersState);

    // --- Estados para Listas de Selección (igual que antes) ---
    const [lectoresList, setLectoresList] = useState<SelectOption[]>([]);
    const [carreterasList, setCarreterasList] = useState<SelectOption[]>([]);
    
    // --- Estados de Resultados ---
    const [displayedResults, setDisplayedResults] = useState<ResultadoAgrupado[]>([]);
    const [expandedRecordIds, setExpandedRecordIds] = useState<string[]>([]);
    const [selectedRecords, setSelectedRecords] = useState<ResultadoAgrupado[]>([]);
    const [loading, setLoading] = useState(false);
    const [resultsLoading, setResultsLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<ResultadoAgrupado>>({ columnAccessor: 'matricula', direction: 'asc' });

    // --- Estados para Búsquedas Guardadas ---
    const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
    const [selectedSearchIds, setSelectedSearchIds] = useState<number[]>([]); // Selección en la tabla
    const [activeSearchIds, setActiveSearchIds] = useState<number[]>([]); // Búsquedas activas para cruce
    const [savedSearchesLoading, setSavedSearchesLoading] = useState(false); // Loading específico búsquedas

    // --- NUEVO: Estados y hooks para Modal Edición ---
    const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
    const [editingSearch, setEditingSearch] = useState<SavedSearch | null>(null);
    const [isSavingEdit, setIsSavingEdit] = useState(false); // Estado de carga para el botón Guardar
    const editForm = useForm<EditSavedSearchFormValues>({
        initialValues: {
            nombre: '',
            color: '',
            notas: ''
        },
        validate: {
            nombre: (value) => (value.trim().length > 0 ? null : 'El nombre es obligatorio'),
        },
    });

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

    // --- Cargar Búsquedas Guardadas --- 
    const fetchSavedSearches = async () => {
        if (!casoId) return;
        setLoading(true);
        try {
            const response = await fetch(`http://localhost:8000/casos/${casoId}/saved_searches`);
            if (!response.ok) {
                 throw new Error(`Error cargando búsquedas: ${response.statusText || response.status}`);
            }
            const data = await response.json();
            setSavedSearches(data as SavedSearch[]); // Asegurar tipo
        } catch (error) {
            console.error("Error fetching saved searches:", error);
            notifications.show({ title: 'Error', message: `No se pudieron cargar las búsquedas guardadas: ${error instanceof Error ? error.message : 'Error desconocido'}`, color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    // Cargar búsquedas al montar y cuando cambie casoId
    useEffect(() => {
        fetchSavedSearches();
    }, [casoId]);

    // --- Lógica para actualizar resultados basados en Búsquedas Activas --- 
    useEffect(() => {
        executeCrossSearch(activeSearchIds);
    }, [activeSearchIds]); // Ejecutar cruce cuando cambien las búsquedas activas

    // --- Procesar datos para la tabla (ordenar/paginar displayedResults) ---
    const sortedAndPaginatedResults = React.useMemo(() => {
        const data = _.orderBy(displayedResults, [sortStatus.columnAccessor], [sortStatus.direction]);
        return data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    }, [displayedResults, sortStatus, page, PAGE_SIZE]);

    // --- Handlers (Placeholder / Lógica Inicial) ---
    const handleFilterChange = (field: keyof CurrentLprFilters, value: any) => {
        setCurrentFilters(prev => ({ ...prev, [field]: value }));
    };

    // --- NUEVA: Función para normalizar y obtener filtros actuales --- 
    const getCurrentApiFilters = () => {
        // Clonar para no mutar estado y formatear fechas
        const apiFilters: any = { ...currentFilters }; 
        if (currentFilters.fechaInicio) {
            apiFilters.fechaInicio = dayjs(currentFilters.fechaInicio).format('YYYY-MM-DD');
        } else { delete apiFilters.fechaInicio; }
        if (currentFilters.fechaFin) {
             apiFilters.fechaFin = dayjs(currentFilters.fechaFin).format('YYYY-MM-DD');
        } else { delete apiFilters.fechaFin; }
        // Asegurar que campos vacíos no se envían si la API no los espera como ''
        if (!apiFilters.timeFrom) delete apiFilters.timeFrom;
        if (!apiFilters.timeTo) delete apiFilters.timeTo;
        if (!apiFilters.matricula.trim()) delete apiFilters.matricula;
        else apiFilters.matricula = apiFilters.matricula.trim();
        // Incluir sentidos si hay seleccionados
        if (apiFilters.selectedSentidos && apiFilters.selectedSentidos.length > 0) {
            // Se envía tal cual como array
        } else {
            delete apiFilters.selectedSentidos; // No enviar si está vacío
        }
        // Los filtros minPasos/maxPasos NO se envían aquí, se aplican post-agrupación
        delete apiFilters.minPasos;
        delete apiFilters.maxPasos;
        // Los arrays vacíos selectedLectores/selectedCarreteras están bien
        return apiFilters;
    };

    // --- NUEVA: Función para ejecutar búsqueda y mostrar resultados --- 
    const executeSearch = async (filters: any) => {
        setLoading(true);
        setDisplayedResults([]); 
        setActiveSearchIds([]); // <--- Limpiar búsquedas activas al ejecutar un filtro nuevo
        setExpandedRecordIds([]);
        setPage(1);

        const params = new URLSearchParams();
        // Parámetros básicos de paginación/límite
        params.append('limit', '20000'); // Límite alto para obtener todo
        params.append('caso_ids', String(casoId));
        params.append('tipo_fuente', 'LPR');

        // Añadir filtros activos desde el objeto `filters`
        if (filters.fechaInicio) params.append('fecha_inicio', filters.fechaInicio);
        if (filters.fechaFin) params.append('fecha_fin', filters.fechaFin);
        if (filters.timeFrom) params.append('hora_inicio', filters.timeFrom);
        if (filters.timeTo) params.append('hora_fin', filters.timeTo);
        (filters.selectedLectores || []).forEach((id: string) => params.append('lector_ids', id));
        (filters.selectedCarreteras || []).forEach((id: string) => params.append('carretera_ids', id));
        if (filters.matricula) params.append('matricula', filters.matricula);
        // Incluir filtro de sentidos en la llamada API
        (filters.selectedSentidos || []).forEach((s: string) => params.append('sentido', s));
        // Añadir aquí otros filtros si se implementan (ej: sentido)

        const queryString = params.toString();
        const apiUrl = `http://localhost:8000/lecturas?${queryString}`;
        console.log("Ejecutando búsqueda directa:", apiUrl);

        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                // ... (Manejo de error HTTP igual que antes) ...
                throw new Error('Error en la búsqueda');
            }
            const finalResults: Lectura[] = await response.json();

            // --- Agrupar y Transformar --- 
            if (finalResults.length > 0) {
                // Restaurar la lógica de agrupación:
                const grouped = _.groupBy(finalResults, 'Matricula');
                const groupedResultsArray: ResultadoAgrupado[] = Object.entries(grouped).map(([matricula, readings]) => {
                     const sortedReadings = _.sortBy(readings, r => new Date(r.Fecha_y_Hora));
                    return {
                        matricula,
                        count: readings.length,
                        firstSeen: dayjs(sortedReadings[0].Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss'),
                        lastSeen: dayjs(sortedReadings[sortedReadings.length - 1].Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss'),
                        readings: sortedReadings,
                    };
                });
                // Fin de la lógica restaurada

                // *** NUEVO: Aplicar filtro de Pasos ***
                const minPasos = currentFilters.minPasos;
                const maxPasos = currentFilters.maxPasos;
                let filteredByPasos = groupedResultsArray;
                if (minPasos !== null || maxPasos !== null) {
                     console.info(`Aplicando filtro de Pasos: Min=${minPasos}, Max=${maxPasos}`);
                     filteredByPasos = groupedResultsArray.filter(group => {
                         const count = group.count;
                         const minOk = (minPasos === null || count >= minPasos);
                         const maxOk = (maxPasos === null || count <= maxPasos);
                         return minOk && maxOk;
                     });
                     console.info(`Resultados tras filtro Pasos: ${filteredByPasos.length}`);
                }

                setDisplayedResults(filteredByPasos); 
                 notifications.show({ title: 'Búsqueda Ejecutada', message: `Se encontraron ${filteredByPasos.length} matrículas únicas.`, color: 'blue' }); 
            } else {
                setDisplayedResults([]);
                notifications.show({ title: 'Búsqueda Ejecutada', message: 'No se encontraron resultados.', color: 'orange' });
            }
            // --- Fin Agrupación ---

        } catch (error) {
            console.error("Error ejecutando búsqueda directa:", error);
             notifications.show({ title: 'Error en Búsqueda', message: `${error instanceof Error ? error.message : String(error)}`, color: 'red' });
            setDisplayedResults([]);
        } finally {
            setLoading(false);
        }
    };

    // --- Handler para el botón "Ejecutar Filtro" ---
    const handleExecuteFilter = () => {
        const apiFilters = getCurrentApiFilters();
        executeSearch(apiFilters);
    };

    // --- Handler para el botón "Guardar Búsqueda" ---
    const handleSaveSearch = async () => {
        const nombreBusqueda = prompt("Introduce un nombre para esta búsqueda:");
        if (!nombreBusqueda || !nombreBusqueda.trim()) {
            notifications.show({ title: 'Cancelado', message: 'No se guardó la búsqueda.', color: 'gray' });
            return;
        }

        const apiFilters = getCurrentApiFilters();
        
        const payload = {
            nombre: nombreBusqueda.trim(),
            filtros: apiFilters, // Guardar los filtros normalizados
            // color y notas podrían pedirse en un modal más complejo
            color: null, 
            notas: null,
        };
        
        setLoading(true);
        console.log("Guardando búsqueda:", payload);
        try {
            const response = await fetch(`http://localhost:8000/casos/${casoId}/saved_searches`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                 // ... (Manejo de error HTTP) ...
                throw new Error('No se pudo guardar la búsqueda.');
            }

            const savedSearchData = await response.json();
            notifications.show({ title: 'Búsqueda Guardada', message: `Búsqueda "${savedSearchData.nombre}" guardada con éxito.`, color: 'green' });
            
            // --- Recargar lista de búsquedas guardadas --- 
            fetchSavedSearches(); 

        } catch (error) {
            console.error("Error guardando búsqueda:", error);
            notifications.show({ title: 'Error al Guardar', message: `${error instanceof Error ? error.message : String(error)}`, color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    // --- Handler para eliminar una búsqueda guardada ---
    const handleDeleteSavedSearch = async (searchId: number) => {
        if (!confirm(`¿Seguro que quieres eliminar la búsqueda guardada ID ${searchId}?`)) return;
        setLoading(true); // Usar loading de la tabla de búsquedas
        try {
            const response = await fetch(`http://localhost:8000/saved_searches/${searchId}`, { method: 'DELETE' });
            if (!response.ok) {
                 throw new Error(`Error eliminando búsqueda: ${response.statusText || response.status}`);
            }
            notifications.show({ title: 'Éxito', message: `Búsqueda ${searchId} eliminada.`, color: 'green' });
            fetchSavedSearches(); // Recargar lista
            // Deseleccionar si estaba seleccionada
            setSelectedSearchIds(prev => prev.filter(id => id !== searchId));
        } catch (error) {
             notifications.show({ title: 'Error', message: `No se pudo eliminar la búsqueda: ${error instanceof Error ? error.message : 'Error desconocido'}`, color: 'red' });
        } finally {
            setLoading(false);
        }
    };
    
    // --- Handler para abrir modal y poblar formulario (Actualizado) ---
    const handleEditSavedSearch = (search: SavedSearch) => {
        setEditingSearch(search); // Guardar la búsqueda completa
        editForm.setValues({ // Poblar el formulario
            nombre: search.nombre,
            color: search.color || '', // Usar string vacío si es null
            notas: search.notas || ''   // Usar string vacío si es null
        });
        openEditModal(); // Abrir el modal
    };

    // --- Handler para enviar actualización (CONECTADO A API) ---
    const handleUpdateSavedSearchSubmit = async (values: EditSavedSearchFormValues) => {
        if (!editingSearch) return;

        const updateData: SavedSearchUpdatePayload = {
            nombre: values.nombre.trim(),
            color: values.color || null,
            notas: values.notas.trim() || null,
        };

        setIsSavingEdit(true); // Iniciar carga
        console.log("Enviando actualización para", editingSearch.id, updateData);

        try {
            await updateSavedSearch(editingSearch.id, updateData);
            notifications.show({
                title: 'Actualización Exitosa',
                message: `Búsqueda "${updateData.nombre}" actualizada.`,
                color: 'green',
                icon: <IconCheck size={18} />
            });
            closeEditModal(); // Cerrar modal
            fetchSavedSearches(); // Recargar la lista de búsquedas
        } catch (error) {
            console.error("Error actualizando búsqueda guardada:", error);
            notifications.show({
                title: 'Error al Actualizar',
                message: `No se pudo guardar los cambios: ${error instanceof Error ? error.message : 'Error desconocido'}`,
                color: 'red'
            });
        } finally {
            setIsSavingEdit(false); // Finalizar carga
        }
    };

    // --- NUEVO: Handler para Cargar Selección como Búsquedas Activas --- 
    const handleLoadSelectedSearches = () => {
        if (selectedSearchIds.length === 0) return;
        console.info(`Cargando búsquedas seleccionadas como activas: ${selectedSearchIds.join(', ')}`);
        setActiveSearchIds([...selectedSearchIds]); // Copiar los IDs seleccionados
        // Opcional: Limpiar selección en la tabla después de cargar
        // setSelectedSearchIds([]); 
        notifications.show({ 
            title: 'Búsquedas Cargadas para Cruce', 
            message: `${selectedSearchIds.length} búsqueda(s) lista(s) para cruzar.`, 
            color: 'blue' 
        });
    };

    // --- NUEVO: Handler para Desactivar una Búsqueda --- 
    const handleDeactivateSearch = (searchIdToRemove: number) => {
         console.info(`Desactivando búsqueda ID: ${searchIdToRemove}`);
         setActiveSearchIds(prev => prev.filter(id => id !== searchIdToRemove));
    };

    // --- Resetear Filtros --- 
    const handleClearFilters = () => {
        setCurrentFilters(initialFiltersState);
        // Opcional: Limpiar también resultados si se desea
        // setDisplayedResults([]); 
        notifications.show({ title: 'Filtros Limpiados', message: 'Se han restablecido los valores por defecto.', color: 'blue' });
    };

    // --- NUEVA Función para ejecutar el cruce basado en IDs activos --- 
    const executeCrossSearch = async (searchIds: number[]) => {
        setLoading(true);
        setDisplayedResults([]);
        
        if (searchIds.length === 0) {
            setLoading(false);
            return; 
        }
        
        console.info(`Iniciando cruce REAL para búsquedas activas IDs: ${searchIds.join(', ')}`);

        // 1. Obtener los objetos SavedSearch activos completos
        const activeSearches = savedSearches.filter(s => searchIds.includes(s.id));
        if (activeSearches.length !== searchIds.length) {
             console.error("Discrepancia entre activeSearchIds y savedSearches encontrados.");
             notifications.show({ title: 'Error en Cruce', message: 'Algunas búsquedas activas no se encontraron.', color: 'red' });
             setLoading(false);
             return;
        }

        // 2. Verificar y obtener las listas de matrículas únicas
        const platesLists: string[][] = [];
        let missingPlates = false;
        for (const search of activeSearches) {
            if (search.unique_plates && search.unique_plates.length > 0) {
                platesLists.push(search.unique_plates);
            } else if (search.result_count === 0) {
                // Si una búsqueda no tiene resultados, la intersección será vacía
                console.info(`La búsqueda ${search.nombre} (${search.id}) tiene 0 resultados. La intersección será vacía.`);
                 setLoading(false);
                 notifications.show({ title: 'Cruce Vacío', message: `Una de las búsquedas (${search.nombre}) no tiene resultados.`, color: 'orange' });
                 return; // Intersección es vacía
            } else {
                // Si tiene resultados pero no tenemos la lista (debería haberse calculado)
                console.warn(`La búsqueda ${search.nombre} (${search.id}) no tiene la lista unique_plates precalculada.`);
                missingPlates = true;
                // Podríamos intentar recalcularla aquí o mostrar error
                // Por ahora, mostraremos error y cancelaremos.
                notifications.show({ title: 'Error en Cruce', message: `Faltan datos precalculados para la búsqueda ${search.nombre}. Vuelve a guardarla.`, color: 'red' });
                setLoading(false);
                return;
            }
        }

        if (platesLists.length === 0) {
             console.info("No hay listas de matrículas válidas para cruzar.");
             setLoading(false);
             return;
        }

        // 3. Calcular la intersección
        let intersection = new Set(platesLists[0]);
        for (let i = 1; i < platesLists.length; i++) {
            const currentSet = new Set(platesLists[i]);
            intersection = new Set([...intersection].filter(plate => currentSet.has(plate)));
        }
        const intersectedPlates = Array.from(intersection);
        console.info(`Intersección calculada: ${intersectedPlates.length} matrículas comunes.`);

        if (intersectedPlates.length === 0) {
            notifications.show({ title: 'Cruce Completado', message: 'No se encontraron matrículas comunes entre las búsquedas seleccionadas.', color: 'orange' });
            setLoading(false);
            return;
        }

        // 4. Llamar a la API para obtener lecturas detalladas de la intersección
        notifications.show({ 
            id: `loading-intersection-${searchIds.join('-')}`, // ID único para la notificación
            title: 'Calculando Cruce', 
            message: `Buscando lecturas para ${intersectedPlates.length} matrículas comunes...`, 
            color: 'blue', 
            loading: true, 
            autoClose: false // Mantener hasta que termine
        });

        try {
            const response = await fetch(`http://localhost:8000/lecturas/por_matriculas_y_filtros_combinados`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    matriculas: intersectedPlates,
                    caso_id: casoId, 
                    tipo_fuente: 'LPR' // O el tipo relevante si es variable
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: 'Error desconocido en la API' }));
                throw new Error(errorData.detail || `Error HTTP ${response.status}`);
            }

            const finalResults: Lectura[] = await response.json();

            // 5. Agrupar y mostrar resultados (misma lógica que antes)
             if (finalResults.length > 0) {
                const grouped = _.groupBy(finalResults, 'Matricula');
                const groupedResultsArray: ResultadoAgrupado[] = Object.entries(grouped).map(([matricula, readings]) => {
                     const sortedReadings = _.sortBy(readings, r => new Date(r.Fecha_y_Hora));
                    return {
                        matricula,
                        count: readings.length,
                        firstSeen: dayjs(sortedReadings[0].Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss'),
                        lastSeen: dayjs(sortedReadings[sortedReadings.length - 1].Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss'),
                        readings: sortedReadings,
                    };
                });
                setDisplayedResults(groupedResultsArray);
                notifications.update({ 
                    id: `loading-intersection-${searchIds.join('-')}`,
                    title: 'Cruce Completado', 
                    message: `Mostrando ${groupedResultsArray.length} matrículas comunes y sus ${finalResults.length} lecturas.`, 
                    color: 'green', 
                    icon: <IconCheck size={18} />, 
                    loading: false, 
                    autoClose: 5000 
                });
            } else {
                 // Esto no debería pasar si intersectedPlates no era vacío, pero por si acaso
                 setDisplayedResults([]);
                 notifications.update({ 
                    id: `loading-intersection-${searchIds.join('-')}`,
                    title: 'Cruce Extraño', 
                    message: 'Se encontraron matrículas comunes pero no sus lecturas.', 
                    color: 'orange', 
                    loading: false, 
                    autoClose: 5000 
                });
            }

        } catch (error) {
            console.error("Error al obtener lecturas para la intersección:", error);
            notifications.update({ 
                id: `loading-intersection-${searchIds.join('-')}`,
                title: 'Error en Cruce', 
                message: `No se pudieron obtener las lecturas detalladas: ${error instanceof Error ? error.message : String(error)}`, 
                color: 'red', 
                loading: false, 
                autoClose: 5000 
            });
             setDisplayedResults([]); // Limpiar resultados en caso de error
        } finally {
            setLoading(false);
        }
    };

    // --- NUEVO: Handler para Eliminar Múltiples Búsquedas Seleccionadas ---
    const handleDeleteSelectedSearches = async () => {
        const idsToDelete = [...selectedSearchIds]; // Copiar para evitar mutaciones
        if (idsToDelete.length === 0) return;

        if (!window.confirm(`¿Estás seguro de que quieres eliminar ${idsToDelete.length} búsqueda(s) guardada(s) seleccionada(s)?`)) {
            return;
        }

        setLoading(true); // Usar loading general o uno específico si se prefiere
        let successes = 0;
        let errors = 0;

        const results = await Promise.allSettled(
            idsToDelete.map(id => 
                fetch(`http://localhost:8000/saved_searches/${id}`, { method: 'DELETE' })
                    .then(response => {
                        if (!response.ok) {
                            // Intentar obtener detalle del error si es posible
                            return response.json().catch(() => null).then(errorData => {
                                throw new Error(errorData?.detail || `Error ${response.status}`);
                            });
                        }
                        return { id }; // Devolver el ID en caso de éxito
                    })
            )
        );

        results.forEach((result, index) => {
            const id = idsToDelete[index];
            if (result.status === 'fulfilled') {
                successes++;
                console.info(`Búsqueda ${id} eliminada con éxito.`);
            } else {
                errors++;
                console.error(`Error eliminando búsqueda ${id}:`, result.reason);
                 notifications.show({
                     title: 'Error Eliminando Búsqueda',
                     message: `No se pudo eliminar ID ${id}: ${result.reason.message}`,
                     color: 'red'
                 });
            }
        });

        if (successes > 0) {
             notifications.show({
                 title: 'Eliminación Completada',
                 message: `${successes} búsqueda(s) eliminada(s).` + (errors > 0 ? ` ${errors} fallaron.` : ''),
                 color: errors > 0 ? 'orange' : 'green',
                 icon: <IconCheck size={18} />
             });
        }

        // Limpiar selección y recargar lista
        setSelectedSearchIds([]);
        fetchSavedSearches(); 
        setLoading(false);
    };

    // --- Handler para gestionar expansión Y marcar interactuado (USA PROP) ---
    const handleExpansionChange = useCallback((newExpandedIds: unknown[]) => {
        const stringIds = newExpandedIds.filter((id): id is string => typeof id === 'string');
        setExpandedRecordIds(stringIds);
        
        // Notificar al padre sobre las nuevas matrículas expandidas
        if (stringIds.length > 0) {
            addInteractedMatricula(stringIds); // <-- Llamar a la prop
        }
    }, [addInteractedMatricula]); // <-- Añadir dependencia

    // --- Handlers Tabla Resultados (Paginación, Ordenación, Selección) ---
    const handleSortStatusChange = (status: DataTableSortStatus<ResultadoAgrupado>) => {
        setPage(1);
        setSortStatus(status);
    };

    const handleSelectionChange = useCallback((newSelectedRecords: ResultadoAgrupado[]) => {
        setSelectedRecords(newSelectedRecords);
        // Notificar al padre sobre las nuevas matrículas seleccionadas
        const newlySelectedMatriculas = newSelectedRecords.map(record => record.matricula);
        if (newlySelectedMatriculas.length > 0) {
             addInteractedMatricula(newlySelectedMatriculas); // <-- Llamar a la prop
        }
    }, [addInteractedMatricula]); // <-- Añadir dependencia

    // --- RESTAURAR: Handlers Botones Acción --- 
    const handleMarkRelevant = async () => {
        if (selectedRecords.length === 0) return;
        const lectureIdsToMark = selectedRecords.flatMap(r => r.readings?.map(l => l.ID_Lectura).filter((id): id is number => id !== undefined) ?? []);
        if (lectureIdsToMark.length === 0) {
             notifications.show({ title: 'Aviso', message: 'No hay lecturas detalladas para marcar en la selección.', color: 'orange' });
            return;
        }
        if (!window.confirm(`¿Marcar como relevantes ${lectureIdsToMark.length} lecturas de ${selectedRecords.length} matrícula(s) seleccionada(s)?`)) return;

        setResultsLoading(true);
        let successes = 0;
        let errors = 0;
        const results = await Promise.allSettled(
            lectureIdsToMark.map(id =>
                fetch(`http://localhost:8000/lecturas/${id}/marcar_relevante`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        Nota: null,
                        caso_id: casoId
                    }) 
                 })
                .then(response => {
                    if (!response.ok && response.status !== 409) { // 409 puede ser ya marcada
                         return response.json().catch(() => null).then(errorData => {
                             throw new Error(errorData?.detail || `Error ${response.status}`);
                         });
                    }
                    return { id };
                 })
            )
        );
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') successes++;
            else {
                errors++;
                 notifications.show({ title: 'Error al Marcar', message: `ID ${lectureIdsToMark[index]}: ${result.reason.message}`, color: 'red' });
            }
        });
        if (successes > 0) notifications.show({ title: 'Lecturas Marcadas', message: `${successes} lecturas marcadas.` + (errors > 0 ? ` ${errors} fallaron.` : ''), color: errors > 0 ? 'orange' : 'green' });
        setSelectedRecords([]);
        setResultsLoading(false);
    };

    const handleUnmarkRelevant = async () => {
        if (selectedRecords.length === 0) return;
        const lectureIdsToUnmark = selectedRecords.flatMap(r => r.readings?.map(l => l.ID_Lectura).filter((id): id is number => id !== undefined) ?? []);
         if (lectureIdsToUnmark.length === 0) {
             notifications.show({ title: 'Aviso', message: 'No hay lecturas detalladas para desmarcar en la selección.', color: 'orange' });
            return;
        }
        if (!window.confirm(`¿Desmarcar como relevantes ${lectureIdsToUnmark.length} lecturas de ${selectedRecords.length} matrícula(s) seleccionada(s)?`)) return;

        setResultsLoading(true);
        let successes = 0;
        let errors = 0;
        const results = await Promise.allSettled(
            lectureIdsToUnmark.map(id =>
                fetch(`http://localhost:8000/lecturas/${id}/desmarcar_relevante`, { method: 'DELETE' })
                .then(response => {
                    if (!response.ok && response.status !== 404) { // 404 puede ser que no estuviera marcada
                        return response.json().catch(() => null).then(errorData => {
                            throw new Error(errorData?.detail || `Error ${response.status}`);
                         });
                    }
                    return { id };
                })
            )
        );
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') successes++;
            else {
                errors++;
                 notifications.show({ title: 'Error al Desmarcar', message: `ID ${lectureIdsToUnmark[index]}: ${result.reason.message}`, color: 'red' });
            }
        });
        if (successes > 0) notifications.show({ title: 'Lecturas Desmarcadas', message: `${successes} lecturas desmarcadas.` + (errors > 0 ? ` ${errors} fallaron.` : ''), color: errors > 0 ? 'orange' : 'green' });
        setSelectedRecords([]);
        setResultsLoading(false);
    };

    const handleSaveSelectedVehicles = async () => {
        const matriculasUnicas = selectedRecords.map(r => r.matricula);
        if (matriculasUnicas.length === 0) return;
        
        setResultsLoading(true); 
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
                    if (response.status === 201) return { status: 'created' };
                    if (response.status === 400) return { status: 'exists' }; // Asumir 400 es 'ya existe'
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
                 notifications.show({ title: 'Error Parcial Guardando Vehículo', message: `${result.reason.message}`, color: 'red' });
            }
        });
        let message = '';
        if (vehiculosCreados > 0) message += `${vehiculosCreados} vehículo(s) nuevo(s) guardado(s). `; 
        if (vehiculosExistentes > 0) message += `${vehiculosExistentes} ya existían. `; 
        if (errores > 0) message += `${errores} matrícula(s) no se pudieron procesar.`;
        if (message) notifications.show({ title: "Guardar Vehículos Completado", message: message.trim(), color: errores > 0 ? (vehiculosCreados > 0 ? 'orange' : 'red') : 'green' });
        setSelectedRecords([]);
        setResultsLoading(false);
    };

    // --- NUEVO: Handler para guardar vehículos desde una búsqueda guardada ---
    const handleSaveVehiclesFromSearch = async (search: SavedSearch) => {
        const matriculasUnicas = search.unique_plates;
        if (!matriculasUnicas || matriculasUnicas.length === 0) {
            notifications.show({ 
                title: 'No hay Vehículos', 
                message: `La búsqueda "${search.nombre}" no tiene matrículas únicas precalculadas o no produjo resultados.`, 
                color: 'orange' 
            });
            return;
        }

        if (!window.confirm(`¿Guardar ${matriculasUnicas.length} vehículo(s) único(s) de la búsqueda "${search.nombre}" en la tabla general de Vehículos?`)) {
            return;
        }

        setLoading(true); // Usar loading general o uno específico
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
                    if (response.status === 201) return { status: 'created' };
                    // Asumir 400 (Bad Request) o 409 (Conflict) como "ya existe"
                    if (response.status === 400 || response.status === 409) return { status: 'exists' }; 
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
                 notifications.show({ title: 'Error Parcial Guardando Vehículo', message: `${result.reason.message}`, color: 'red' });
            }
        });

        let message = '';
        if (vehiculosCreados > 0) message += `${vehiculosCreados} vehículo(s) nuevo(s) guardado(s). `;
        if (vehiculosExistentes > 0) message += `${vehiculosExistentes} ya existían. `;
        if (errores > 0) message += `${errores} matrícula(s) no se pudieron procesar.`;
        if (message) {
            notifications.show({
                title: "Guardar Vehículos Completado",
                message: message.trim(),
                color: errores > 0 ? (vehiculosCreados > 0 ? 'orange' : 'red') : 'green'
            });
        }

        setLoading(false);
    };

    // --- RESTAURAR: Definición de Columnas DataTable (Resultados Agrupados) ---
    const columns: DataTableProps<ResultadoAgrupado>['columns'] = [
        { accessor: 'matricula', title: 'Matrícula', sortable: true, width: 100 }, 
        { accessor: 'count', title: 'Nº Pasos', textAlign: 'right', sortable: true, width: 70 },  
        { accessor: 'firstSeen', title: 'Primera Vez', sortable: true, width: 150 },
        { accessor: 'lastSeen', title: 'Última Vez', sortable: true, width: 150 },
    ];
    // --- FIN RESTAURAR COLUMNS ---

    // --- RESTAURAR: Definición de Columnas DataTable (Búsquedas Guardadas) ---
    const savedSearchColumns: DataTableProps<SavedSearch>['columns'] = [
        { 
            accessor: 'nombre', title: 'Nombre Búsqueda', width: 150,
            sortable: true,
        },
        {
            accessor: 'filtros', title: 'Parámetros del Filtro', 
            width: 200,
            render: ({ filtros }) => {
                const summary = formatFiltersSummary(filtros);
                return (
                    <Tooltip label={summary} multiline w={300} position="top-start" openDelay={500}>
                         <Text size="xs" truncate="end">{summary}</Text>
                    </Tooltip>
                );
            },
        },
        { 
            accessor: 'color', title: 'Color', width: 60, 
            render: ({ color }) => (
                color ? <Box bg={color} w={20} h={20} style={{ borderRadius: '50%', margin: 'auto' }} /> : null
            ),
        },
        { 
            accessor: 'notas', title: 'Notas', width: 300,
            render: ({ notas }) => (
                notas ? <Tooltip label={notas} multiline w={200}><Text truncate="end" size="xs">{notas}</Text></Tooltip> : '-'
            ),
        },
        { 
            accessor: 'result_count', title: 'Nº Matr.', 
            textAlign: 'right', width: 80, sortable: true,
            render: ({ result_count }) => result_count ?? '-',
        },
        { 
            accessor: 'actions', title: 'Acciones', width: 100, textAlign: 'center',
            render: (search) => (
                 <Group gap="xs" justify="center" wrap="nowrap">
                     <Tooltip label="Editar Búsqueda">
                         <ActionIcon variant="subtle" color="blue" onClick={() => handleEditSavedSearch(search)}>
                             <IconPencil size={16} />
                         </ActionIcon>
                     </Tooltip>
                     <Tooltip label="Guardar Vehículos de esta Búsqueda">
                         <ActionIcon variant="subtle" color="green" onClick={() => handleSaveVehiclesFromSearch(search)} disabled={!search.unique_plates || search.unique_plates.length === 0}>
                             <IconCar size={16} />
                         </ActionIcon>
                     </Tooltip>
                     <Tooltip label="Eliminar Búsqueda">
                          <ActionIcon variant="subtle" color="red" onClick={() => handleDeleteSavedSearch(search.id)}>
                             <IconTrash size={16} />
                         </ActionIcon>
                     </Tooltip>
                 </Group>
             ),
        },
    ];
    // --- FIN RESTAURAR SAVEDSEARCHCOLUMNS ---

    // --- Renderizado ---
    return (
        <Grid>
            <style>{customStyles}</style>

            <Grid.Col span={{ base: 12, md: 3 }} style={{ minWidth: 300 }}>
                <Paper shadow="sm" p="md" withBorder style={{ height: '100%' }}>
                    <Stack gap="sm">
                        <Title order={4} mb="sm">Definir Filtros</Title>
                        <Input.Wrapper label="Fecha Inicio" size="xs" className="lpr-avanzado-datepicker-wrapper">
                            <DatePicker
                                selected={currentFilters.fechaInicio}
                                onChange={(date) => handleFilterChange('fechaInicio', date)}
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
                        <Input.Wrapper label="Fecha Fin" size="xs" className="lpr-avanzado-datepicker-wrapper">
                            <DatePicker
                                selected={currentFilters.fechaFin}
                                onChange={(date) => handleFilterChange('fechaFin', date)}
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
                             <TimeInput label="Desde Hora" placeholder="HH:MM" leftSection={<IconClock size={16} />} value={currentFilters.timeFrom} onChange={(e) => handleFilterChange('timeFrom', e.currentTarget.value)}/>
                             <TimeInput label="Hasta Hora" placeholder="HH:MM" leftSection={<IconClock size={16} />} value={currentFilters.timeTo} onChange={(e) => handleFilterChange('timeTo', e.currentTarget.value)} />
                         </Group>
                         <MultiSelect label="Lectores" placeholder="Todos" data={lectoresList} value={currentFilters.selectedLectores} onChange={(v) => handleFilterChange('selectedLectores', v)} leftSection={<IconDeviceCctv size={16} />} searchable clearable disabled={initialLoading} />
                         <MultiSelect label="Carretera" placeholder="Todas" data={carreterasList} value={currentFilters.selectedCarreteras} onChange={(v) => handleFilterChange('selectedCarreteras', v)} leftSection={<IconRoad size={16} />} searchable clearable disabled={initialLoading} />
                         <MultiSelect
                             label="Sentido"
                             placeholder="Ambos"
                             data={sentidoOptions}
                             value={currentFilters.selectedSentidos || []}
                             onChange={(value) => handleFilterChange('selectedSentidos', value)}
                             leftSection={<IconArrowsUpDown size={16} />}
                             searchable={false}
                             clearable
                             style={{ flex: 1, minWidth: 100 }}
                         />
                         <TextInput label="Matrícula (parcial)" placeholder="Ej: ?98?C*" value={currentFilters.matricula} onChange={(e) => handleFilterChange('matricula', e.currentTarget.value)} leftSection={<IconLicense size={16} />} />
                         <Group grow>
                             <NumberInput
                                label="Mín. Pasos"
                                placeholder="Cualquiera"
                                value={currentFilters.minPasos ?? ''}
                                onChange={(value) => handleFilterChange('minPasos', typeof value === 'number' ? value : null)}
                                min={1}
                                step={1}
                                allowNegative={false}
                                allowDecimal={false}
                             />
                             <NumberInput
                                label="Máx. Pasos"
                                placeholder="Cualquiera"
                                value={currentFilters.maxPasos ?? ''}
                                onChange={(value) => handleFilterChange('maxPasos', typeof value === 'number' ? value : null)}
                                min={1}
                                step={1}
                                allowNegative={false}
                                allowDecimal={false}
                             />
                         </Group>
                        
                        <Button 
                            leftSection={<IconPlayerPlay size={16} />} 
                            onClick={handleExecuteFilter} 
                            loading={resultsLoading}
                            size="sm"
                            fullWidth
                            mt="md"
                        >
                            Ejecutar Filtro
                        </Button>
                        <Button 
                            variant="subtle" 
                            color="gray" 
                            leftSection={<IconFilterOff size={16} />} 
                            onClick={handleClearFilters} 
                            size="xs" 
                            fullWidth
                        >
                            Limpiar Filtros Actuales
                        </Button>
                        <Button 
                            variant="outline" 
                            leftSection={<IconDeviceFloppy size={16} />} 
                            onClick={handleSaveSearch} 
                            loading={loading} // ¿Quizás loading diferente para guardar?
                            size="sm"
                            fullWidth
                        >
                            Guardar Búsqueda
                        </Button>
                    </Stack>
                </Paper>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 9 }}>
                <Stack gap="lg">
                    {/* --- Búsquedas Guardadas (Ahora primero) --- */}
                    <Paper shadow="sm" p="md" withBorder style={{ position: 'relative' }}>
                        <LoadingOverlay visible={savedSearchesLoading || loading} />
                        <Group justify="space-between" mb="md">
                            <Title order={4}>Búsquedas Guardadas ({savedSearches.length})</Title>
                            <Group gap="xs">
                                <Button
                                    leftSection={<IconUpload size={16} />}
                                    onClick={handleLoadSelectedSearches}
                                    disabled={selectedSearchIds.length === 0 || loading}
                                    size="xs"
                                    variant="outline"
                                >
                                    Cargar Seleccionadas ({selectedSearchIds.length})
                                </Button>
                                <Button
                                    leftSection={<IconTrash size={16} />}
                                    onClick={handleDeleteSelectedSearches}
                                    disabled={selectedSearchIds.length === 0 || loading}
                                    size="xs"
                                    variant="filled" // O "outline"
                                    color="red"
                                >
                                    Eliminar Seleccionadas ({selectedSearchIds.length})
                                </Button>
                            </Group>
                        </Group>
                        <DataTable
                            className="saved-searches-datatable"
                            records={savedSearches}
                            columns={savedSearchColumns}
                            minHeight={savedSearches.length > 0 ? 150 : 0}
                            noRecordsText=""
                            noRecordsIcon={<></>}
                            selectedRecords={savedSearches.filter(s => selectedSearchIds.includes(s.id))}
                            onSelectedRecordsChange={(newSelectedRecords) => setSelectedSearchIds(newSelectedRecords.map(s => s.id))}
                            idAccessor="id"
                        />
                    </Paper>

                    {/* --- Resultados (Ahora después) --- */}
                    {displayedResults.length > 0 && (
                        <Paper shadow="sm" p="md" withBorder style={{ position: 'relative' }}>
                            <LoadingOverlay visible={resultsLoading || loading} />
                            <Group justify="space-between" mb="md">
                                <Title order={4}>Resultados ({displayedResults.length})</Title>
                                <Group gap="xs">
                                    <Button size="xs" variant="outline" leftSection={<IconBookmark size={16} />} onClick={handleMarkRelevant} disabled={selectedRecords.length === 0 || resultsLoading}>
                                        Marcar Relevante ({selectedRecords.length})
                                    </Button>
                                    <Button size="xs" variant="outline" color="orange" leftSection={<IconBookmarkOff size={16} />} onClick={handleUnmarkRelevant} disabled={selectedRecords.length === 0 || resultsLoading}>
                                        Desmarcar Relevante ({selectedRecords.length})
                                    </Button>
                                    <Button size="xs" variant="outline" color="green" leftSection={<IconCar size={16} />} onClick={handleSaveSelectedVehicles} disabled={selectedRecords.length === 0 || resultsLoading}>
                                        Guardar Vehículos ({selectedRecords.length})
                                    </Button>
                                </Group>
                            </Group>
                            <DataTable
                                className="results-datatable"
                                records={sortedAndPaginatedResults}
                                columns={columns}
                                idAccessor="matricula"
                                totalRecords={displayedResults.length}
                                recordsPerPage={PAGE_SIZE}
                                page={page}
                                onPageChange={setPage}
                                sortStatus={sortStatus}
                                onSortStatusChange={handleSortStatusChange}
                                withTableBorder borderRadius="sm" withColumnBorders striped highlightOnHover
                                minHeight={sortedAndPaginatedResults.length > 0 ? 150 : undefined}
                                noRecordsText=""
                                noRecordsIcon={<></>}
                                selectedRecords={selectedRecords}
                                onSelectedRecordsChange={handleSelectionChange}
                                isRecordSelectable={(record) => !resultsLoading}
                                rowClassName={({ matricula }) =>
                                    interactedMatriculas.has(matricula) ? 'highlighted-row' : undefined
                                }
                                rowExpansion={{
                                    allowMultiple: true,
                                    expanded: {
                                        recordIds: expandedRecordIds,
                                        onRecordIdsChange: handleExpansionChange,
                                    },
                                    content: ({ record }: { record: ResultadoAgrupado }) => {
                                        return (
                                            <Box p="sm" bg="gray.1" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
                                                <Stack gap="xs">
                                                    {record.readings.length > 0 ? (
                                                        record.readings.map((reading) => (
                                                            <Paper key={reading.ID_Lectura} shadow="xs" p="xs" withBorder>
                                                                <Group justify="space-between" gap="xs" wrap="nowrap">
                                                                    <Text size="xs" fw={500}>{dayjs(reading.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')}</Text>
                                                                    <Text size="xs">Sentido: {reading.lector?.Sentido || '-'}</Text>
                                                                    <Text size="xs">Carretera: {reading.lector?.Carretera || '-'}</Text>
                                                                    <Text size="xs">Carril: {reading.Carril || '-'}</Text>
                                                                    {/* Añadir más detalles si se desea, como ID Lector */}
                                                                    {/* <Text size="xs">Lector: {reading.ID_Lector || '-'}</Text> */}
                                                                </Group>
                                                            </Paper>
                                                        ))
                                                    ) : (
                                                        <Text size="xs" c="dimmed">No hay lecturas individuales disponibles para esta matrícula.</Text>
                                                    )}
                                                </Stack>
                                            </Box>
                                        );
                                    },
                                }}
                            />
                        </Paper>
                    )}

                </Stack>
            </Grid.Col>

            <Modal 
                opened={editModalOpened} 
                onClose={closeEditModal} 
                title={`Editar Búsqueda: ${editingSearch?.nombre}`}
                centered
                size="lg"
            >
                <form onSubmit={editForm.onSubmit(handleUpdateSavedSearchSubmit)}>
                    <Stack>
                        <TextInput
                            required
                            label="Nombre"
                            placeholder="Nombre descriptivo"
                            {...editForm.getInputProps('nombre')}
                        />
                        <ColorInput
                            label="Color Etiqueta"
                            placeholder="Elige un color (opcional)"
                            {...editForm.getInputProps('color')}
                            format="hex" // O 'rgba', 'hsl', etc.
                            swatches={[
                              '#25262b', '#868e96', '#fa5252', '#e64980', '#be4bdb', '#7950f2', '#4c6ef5', 
                              '#228be6', '#15aabf', '#12b886', '#40c057', '#82c91e', '#fab005', '#fd7e14',
                            ]}
                        />
                        <Textarea
                            label="Notas (opcional)"
                            placeholder="Añade alguna nota o comentario..."
                            {...editForm.getInputProps('notas')}
                            minRows={3}
                        />
                        <Group justify="flex-end" mt="md">
                            <Button variant="default" onClick={closeEditModal} disabled={isSavingEdit}>Cancelar</Button>
                            <Button type="submit" loading={isSavingEdit}>Guardar Cambios</Button> 
                        </Group>
                    </Stack>
                </form>
            </Modal>
        </Grid>
    );
}

export default LprAvanzadoPanel; 