import React, { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Stack, Grid, Button, TextInput, Box, NumberInput, LoadingOverlay, Title, rem, Input, Group, ActionIcon, Tooltip, Paper, Checkbox, ThemeIcon, Text, Flex, useMantineTheme } from '@mantine/core';
import { TimeInput, DateInput } from '@mantine/dates';
import { MultiSelect, MultiSelectProps } from '@mantine/core';
import { IconSearch, IconClock, IconDeviceCctv, IconFolder, IconLicense, IconRoad, IconArrowsUpDown, IconStar, IconStarOff, IconDeviceFloppy, IconBookmark, IconBookmarkOff, IconCar, IconStarFilled, IconCalendar, IconFileExport, IconFilterOff } from '@tabler/icons-react';
import { notifications, showNotification } from '@mantine/notifications';
import { DataTable, DataTableSortStatus, DataTableColumn } from 'mantine-datatable';
import dayjs from 'dayjs';
import _ from 'lodash';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format } from 'date-fns';
import type { Lectura, Lector } from '../../types/data'; // Importar tipos necesarios
import * as XLSX from 'xlsx'; // Importación para la exportación a Excel
import { ProgressOverlay } from '../common/ProgressOverlay';

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

const API_BASE_URL = 'http://localhost:8000';

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

// --- Props del Componente ---
interface AnalisisLecturasPanelProps {
    casoIdFijo?: number | null;
    permitirSeleccionCaso?: boolean;
    mostrarTitulo?: boolean;
    tipoFuenteFijo?: 'LPR' | 'GPS' | null;
    interactedMatriculas: Set<string>;
    addInteractedMatricula: (matriculas: string[]) => void;
}

// Eliminar la interfaz VehiculoCoincidente ya que no se usará

// --- Interfaz para métodos expuestos ---
export interface AnalisisLecturasPanelHandle {
  exportarListaLectores: () => Promise<void>;
}

// --- Componente con forwardRef ---
const AnalisisLecturasPanel = forwardRef<AnalisisLecturasPanelHandle, AnalisisLecturasPanelProps>((props, ref) => {
    const {
      casoIdFijo = null,
      permitirSeleccionCaso = true,
      mostrarTitulo = true,
      tipoFuenteFijo = null,
      interactedMatriculas,
      addInteractedMatricula
    } = props;

    const iconStyle = { width: rem(16), height: rem(16) };
    const theme = useMantineTheme();

    // --- Estados ---
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
    const [casosSeleccionados, setCasosSeleccionados] = useState<number[]>([]);
    
    // --- Procesar datos ---
    const sortedAndPaginatedResults = useMemo(() => {
        const accessor = sortStatus.columnAccessor as keyof Lectura;
        const data = _.orderBy(results, [accessor], [sortStatus.direction]);
        return data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    }, [results, sortStatus, page, PAGE_SIZE]);

    // --- Cargar datos iniciales ---
    useEffect(() => {
        const fetchInitialData = async () => {
            setInitialLoading(true);
            setLectoresList([]);
            setCarreterasList([]);
            setCasosList([]); 
            try {
                if (casoIdFijo) {
                    console.log(`AnalisisLecturasPanel: Fetching filtros disponibles para caso ${casoIdFijo}...`);
                    const response = await fetch(`${API_BASE_URL}/casos/${casoIdFijo}/filtros_disponibles`);
                    if (!response.ok) throw new Error(`Filtros caso ${casoIdFijo}: ${response.statusText || response.status}`);
                    const data = await response.json();
                    if (data && data.lectores && data.carreteras) {
                        setLectoresList(data.lectores);
                        setCarreterasList(data.carreteras);
                         console.log(`AnalisisLecturasPanel: Filtros específicos cargados - ${data.lectores.length} lectores, ${data.carreteras.length} carreteras.`);
                    } else { throw new Error("Formato inesperado para filtros específicos"); }
                } else {
                     console.log("AnalisisLecturasPanel: Fetching filtros globales...");
                     const fetches: (Promise<Response> | null)[] = [];
                     fetches.push(fetch(`${API_BASE_URL}/lectores?limit=2000`)); // Límite alto para obtener todos
                     if (permitirSeleccionCaso) {
                         fetches.push(fetch(`${API_BASE_URL}/casos?limit=1000`));
                     } else { fetches.push(null); }
                     const responses = await Promise.all(fetches);
                     const lectoresResponse = responses[0];
                     if (lectoresResponse instanceof Response) {
                         if (!lectoresResponse.ok) throw new Error(`Lectores Globales: ${lectoresResponse.statusText || lectoresResponse.status}`);
                         const lectoresData = await lectoresResponse.json();
                         if (lectoresData && Array.isArray(lectoresData.lectores)) {
                            const formattedLectores: SelectOption[] = lectoresData.lectores.map((l: any) => ({ value: String(l.ID_Lector), label: `${l.Nombre || 'Sin Nombre'} (${l.ID_Lector})` }));
                            setLectoresList(formattedLectores);
                            const todasCarreteras = lectoresData.lectores.map((l: any) => l.Carretera?.trim()).filter((c): c is string => !!c);
                            const uniqueCarreteras = Array.from(new Set<string>(todasCarreteras)).sort((a, b) => a.localeCompare(b));
                            setCarreterasList(uniqueCarreteras.map((c: string) => ({ value: c, label: c })));
                         } else if (lectoresData && Array.isArray(lectoresData)) {
                             const formattedLectores: SelectOption[] = lectoresData.map((l: any) => ({ value: String(l.ID_Lector), label: `${l.Nombre || 'Sin Nombre'} (${l.ID_Lector})` }));
                             setLectoresList(formattedLectores);
                             const todasCarreteras = lectoresData.map((l: any) => l.Carretera?.trim()).filter((c): c is string => !!c);
                             const uniqueCarreteras = Array.from(new Set<string>(todasCarreteras)).sort((a, b) => a.localeCompare(b));
                             setCarreterasList(uniqueCarreteras.map((c: string) => ({ value: c, label: c })));
                         } else { throw new Error("Formato inesperado para lectores globales"); }
                     }
                     const casosResponse = responses[1];
                     if (permitirSeleccionCaso && casosResponse instanceof Response) {
                         if (!casosResponse.ok) throw new Error(`Casos Globales: ${casosResponse.statusText || casosResponse.status}`);
                         const casosData = await casosResponse.json();
                         if (Array.isArray(casosData)) {
                            const formattedCasos: SelectOption[] = casosData.map((c: any) => ({ value: String(c.ID_Caso), label: c.Nombre_del_Caso || 'Caso sin nombre' }));
                            setCasosList(formattedCasos);
                         } else { throw new Error("Formato inesperado para casos globales"); }
                     }
                }
            } catch (error) {
                 notifications.show({ title: 'Error al cargar opciones de filtro', message: `${error instanceof Error ? error.message : String(error)}`, color: 'red', });
                 console.error("AnalisisLecturasPanel: Error fetching initial filter data:", error);
            } finally { setInitialLoading(false); }
        };
        fetchInitialData();
    }, [casoIdFijo, permitirSeleccionCaso]);

    // --- Función de Búsqueda ---
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
        params.append('limit', '100000');
        const queryString = params.toString();
        const searchUrl = `${API_BASE_URL}/lecturas?${queryString}`;
        console.log(`Llamando a API (${tipoFuenteFijo || 'Todos'}):`, searchUrl);
        try {
            const apiResponse = await fetch(searchUrl);
            if (!apiResponse.ok) { 
                let errorDetail = `HTTP error! status: ${apiResponse.statusText || apiResponse.status}`;
                try {
                    const errorData = await apiResponse.json();
                    errorDetail += ` - ${JSON.stringify(errorData)}`;
                } catch (e) {
                    // Si no se puede parsear como JSON, usar el texto plano
                    const text = await apiResponse.text();
                    errorDetail += ` - ${text}`;
                }
                throw new Error(errorDetail);
            }
            const data = await apiResponse.json();
            rawResults = data;
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

    // --- NUEVA: Función para Limpiar Filtros ---
    const handleClearFilters = () => {
        setFechaInicio(null);
        setFechaFin(null);
        setTimeFrom('');
        setTimeTo('');
        setSelectedLectores([]);
        if (permitirSeleccionCaso) {
            setSelectedCasos([]);
        }
        setSelectedCarreteras([]);
        setSelectedSentidos([]);
        setMatricula('');
        setMinPasos('');
        // Opcional: Limpiar resultados también?
        // setResults([]);
        // setPage(1);
        notifications.show({ title: 'Filtros Limpiados', message: 'Se han restablecido los valores por defecto.', color: 'blue' });
    };

    // --- Handler de selección ---
    const handleSelectionChange = useCallback((newSelectedRecords: Lectura[]) => {
        setSelectedRecords(newSelectedRecords);
        const newlySelectedMatriculas = newSelectedRecords.map(record => record.Matricula);
        if (newlySelectedMatriculas.length > 0) {
             addInteractedMatricula(newlySelectedMatriculas);
        }
    }, [addInteractedMatricula]);

    // --- Función para exportar a Excel ---
    const exportarListaLectores = useCallback(async () => {
        setLoading(true);
        try {
            console.log("Exportando: Obteniendo todos los lectores...");
            const response = await fetch(`${API_BASE_URL}/lectores?limit=10000`);
            if (!response.ok) throw new Error(`Error al obtener lectores: ${response.statusText}`);
            const data = await response.json();
            let lectoresParaExportar: Lector[] = [];
            if (data && Array.isArray(data.lectores)) {
                lectoresParaExportar = data.lectores;
            } else if (data && Array.isArray(data)) {
                lectoresParaExportar = data;
            } else {
                throw new Error("Formato de respuesta inesperado al obtener lectores para exportar");
            }
            console.log(`Exportando: ${lectoresParaExportar.length} lectores obtenidos.`);
            if (lectoresParaExportar.length === 0) {
                notifications.show({ title: 'Nada que Exportar', message: 'No hay lectores para incluir en el archivo.', color: 'blue' });
                return;
            }
            const dataToExport = lectoresParaExportar.map(l => ({
                'ID Lector': l.ID_Lector,
                'Nombre': l.Nombre,
                'Carretera': l.Carretera,
                'Provincia': l.Provincia,
                'Localidad': l.Localidad,
                'Sentido': l.Sentido,
                'Orientación': l.Orientacion,
                'Organismo': l.Organismo_Regulador,
                'Latitud': l.Coordenada_Y,
                'Longitud': l.Coordenada_X,
                'Contacto': l.Contacto,
                'Notas': l.Texto_Libre,
            }));
            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Lectores');
            const fileName = `Lista_Lectores_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            notifications.show({ title: 'Exportación Completa', message: `Se ha descargado el archivo ${fileName}`, color: 'green' });
        } catch (error) {
            console.error("Error al exportar lectores:", error);
            notifications.show({ title: 'Error en Exportación', message: error instanceof Error ? error.message : 'Error desconocido', color: 'red' });
        } finally {
            setLoading(false);
        }
    }, []); // Dependencias vacías, ya que no usa props ni estado que cambie

    // --- Exponer métodos mediante useImperativeHandle ---
    useImperativeHandle(ref, () => ({
        exportarListaLectores
    }), [exportarListaLectores]); // Asegúrate de incluir la función en las dependencias

    // --- Funciones para Acciones (Marcar, Desmarcar, Guardar Vehículos) ---
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
                fetch(`${API_BASE_URL}/lecturas/${id}/marcar_relevante`, {
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
                fetch(`${API_BASE_URL}/lecturas/${id}/desmarcar_relevante`, { method: 'DELETE' })
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
                fetch(`${API_BASE_URL}/vehiculos`, {
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

    // --- Columnas ---
    const columns: DataTableColumn<Lectura>[] = useMemo(() => {
        // Estado del checkbox "Seleccionar Todo" para la página actual
        // Ya no necesitamos la lógica del checkbox de selección global aquí
        /* 
        const recordIdsOnPageSet = new Set(sortedAndPaginatedResults.map(r => r.ID_Lectura));
        const selectedIdsOnPage = selectedRecords.filter(sr => recordIdsOnPageSet.has(sr.ID_Lectura));
        const allRecordsOnPageSelected = sortedAndPaginatedResults.length > 0 && selectedIdsOnPage.length === sortedAndPaginatedResults.length;
        const indeterminate = selectedIdsOnPage.length > 0 && !allRecordsOnPageSelected;
        */

        return [
            // --- Columna de Checkbox eliminada ---
            /*
            {
                accessor: 'select',
                title: (
                    <Checkbox
                        aria-label="Seleccionar todas las filas visibles"
                        checked={allRecordsOnPageSelected}
                        indeterminate={indeterminate}
                        onChange={(e) => {
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
                width: 40,
                styles: {
                    cell: { paddingLeft: 'var(--mantine-spacing-xs)', paddingRight: 'var(--mantine-spacing-xs)' },
                },
                render: (record) => (
                    <Checkbox
                        aria-label={`Seleccionar fila ${record.ID_Lectura}`}
                         checked={selectedRecords.some(sr => sr.ID_Lectura === record.ID_Lectura)}
                         onChange={() => {
                             setSelectedRecords(currentSelected =>
                                 currentSelected.some(sr => sr.ID_Lectura === record.ID_Lectura)
                                     ? currentSelected.filter(sr => sr.ID_Lectura !== record.ID_Lectura)
                                     : [...currentSelected, record]
                             );
                         }}
                         size="xs"
                        onClick={(e) => e.stopPropagation()}
                    />
                ),
            },
            */
            {
                 accessor: 'relevancia', 
                 title: <IconBookmark size={16} />,
                 width: 30, // Mantener ancho fijo pequeño
                 textAlign: 'center', 
                 render: (record) => 
                     record.relevancia ? (
                         <Tooltip label={record.relevancia.Nota || 'Marcado como relevante'} withArrow position="top-start">
                             <IconBookmark size={16} color="orange" />
                         </Tooltip>
                     ) : null,
            },
            { accessor: 'Fecha_y_Hora', title: 'Fecha y Hora', render: (r: Lectura) => dayjs(r.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss'), sortable: true }, // width eliminado
            { accessor: 'Matricula', title: 'Matrícula', sortable: true }, // width eliminado
            { accessor: 'lector.ID_Lector', title: 'ID Lector', render: (r: Lectura) => r.lector?.ID_Lector || '-', sortable: true }, // width eliminado
            { accessor: 'lector.Sentido', title: 'Sentido', render: (r: Lectura) => r.lector?.Sentido || '-', sortable: true }, // width eliminado
            { accessor: 'lector.Orientacion', title: 'Orientación', render: (r: Lectura) => r.lector?.Orientacion || '-', sortable: true }, // width eliminado
            { accessor: 'lector.Carretera', title: 'Carretera', render: (r: Lectura) => r.lector?.Carretera || '-', sortable: true }, // width eliminado
            { accessor: 'Carril', title: 'Carril', render: (r: Lectura) => r.Carril || '-', sortable: true }, // width eliminado
            { accessor: 'pasos', title: 'Pasos', textAlign: 'right', render: (r: Lectura) => r.pasos || '-', sortable: true, width: 70 }, // width mantenido/ajustado pequeño
        ];
    }, [/* sortedAndPaginatedResults, */ selectedRecords]); // Quitar dependencia no usada

    // --- Renderizado ---
    return (
        <Box style={{ position: 'relative' }}>
            <style>{customStyles}</style>
            <Grid>
                 <ProgressOverlay 
                    visible={initialLoading} 
                    progress={initialLoading ? 100 : 0} 
                    label="Cargando datos iniciales..."
                    zIndex={1000}
                 />
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
                            <Button 
                                variant="subtle" 
                                color="gray" 
                                leftSection={<IconFilterOff size={16} />} 
                                onClick={handleClearFilters}
                                size="xs" 
                                fullWidth
                                mt="xs"
                                disabled={loading || initialLoading}
                            >
                                Limpiar Filtros Actuales
                            </Button>
                         </Stack>
                     </Paper>
                 </Grid.Col>
                 <Grid.Col span={{ base: 12, md: 9 }}>
                     <Paper shadow="sm" p="md" withBorder style={{ position: 'relative' }}>
                        <ProgressOverlay 
                            visible={loading && !initialLoading} 
                            progress={(loading && !initialLoading) ? 100 : 0} 
                            label="Procesando resultados..."
                            zIndex={500}
                        />
                        <Group justify="space-between" mb="md">
                            <Title order={4}>Resultados ({results.length})</Title>
                            <Group>
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
                        </Group>
                        <DataTable<Lectura>
                           withTableBorder
                           borderRadius="sm"
                           withColumnBorders
                           striped
                           highlightOnHover
                           records={sortedAndPaginatedResults}
                           columns={columns}
                           minHeight={200} 
                           totalRecords={results.length}
                           recordsPerPage={PAGE_SIZE}
                           page={page}
                           onPageChange={setPage}
                           sortStatus={sortStatus}
                           onSortStatusChange={setSortStatus}
                           idAccessor="ID_Lectura"
                           noRecordsText={loading ? 'Cargando...' : (results.length === 0 ? 'No se encontraron resultados con los filtros aplicados' : '')}
                           noRecordsIcon={<></>}
                           selectedRecords={selectedRecords}
                           onSelectedRecordsChange={handleSelectionChange}
                           rowClassName={({ Matricula }) => 
                               interactedMatriculas.has(Matricula) ? 'highlighted-row' : undefined
                           }
                        />
                     </Paper>
                 </Grid.Col>
            </Grid>
        </Box>
    );
});

export default AnalisisLecturasPanel; 