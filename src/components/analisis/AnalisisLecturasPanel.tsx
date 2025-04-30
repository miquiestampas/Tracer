import React, { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Stack, Grid, Button, TextInput, Box, NumberInput, LoadingOverlay, Title, rem, Input, Group, ActionIcon, Tooltip, Paper, Checkbox, ThemeIcon, Text, Flex, useMantineTheme, Table } from '@mantine/core';
import { TimeInput, DateInput } from '@mantine/dates';
import { MultiSelect, MultiSelectProps } from '@mantine/core';
import { IconSearch, IconClock, IconDeviceCctv, IconFolder, IconLicense, IconRoad, IconArrowsUpDown, IconStar, IconStarOff, IconDeviceFloppy, IconBookmark, IconBookmarkOff, IconCar, IconStarFilled, IconCalendar, IconFileExport, IconFilterOff, IconChevronDown, IconChevronRight, IconBuildingCommunity } from '@tabler/icons-react';
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
import { getLectorSugerencias } from '../../services/lectoresApi';
import { Lectura as LecturaAPI } from '../../types/api';

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

interface LecturaAgrupada {
    Matricula: string;
    pasos: number;
    lecturasPorOperacion: Record<number, Lectura[]>;
    expanded: boolean;
    ID_Lectura: number;
    relevancia?: { ID_Relevante: number, Nota?: string | null } | null;
}

// Extender el tipo de Lectura para incluir las propiedades adicionales que necesitamos
interface Lectura extends LecturaAPI {
    es_relevante?: boolean;
}

// --- Componente con forwardRef ---
const AnalisisLecturasPanel = forwardRef<AnalisisLecturasPanelHandle, AnalisisLecturasPanelProps>(
  (props, ref) => {
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
    const [selectedOrganismos, setSelectedOrganismos] = useState<string[]>([]);
    const [selectedProvincias, setSelectedProvincias] = useState<string[]>([]);
    const [matricula, setMatricula] = useState('');
    const [minPasos, setMinPasos] = useState<number | null>(null);
    const [maxPasos, setMaxPasos] = useState<number | null>(null);
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
    const [selectedRecords, setSelectedRecords] = useState<number[]>([]);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus>({ columnAccessor: 'Fecha_y_Hora', direction: 'desc' });
    const [casosSeleccionados, setCasosSeleccionados] = useState<number[]>([]);
    const [organismosList, setOrganismosList] = useState<SelectOption[]>([]);
    const [provinciasList, setProvinciasList] = useState<SelectOption[]>([]);
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    
    // --- Procesar datos ---
    const sortedAndPaginatedResults = useMemo(() => {
        if (!results.length) return [];
        
        const accessor = sortStatus.columnAccessor as keyof Lectura;
        let data = [...results];
        
        // Agrupar por matrícula para calcular pasos
        const pasosPorMatricula = data.reduce((acc, lectura) => {
            if (!acc[lectura.Matricula]) {
                acc[lectura.Matricula] = 0;
            }
            acc[lectura.Matricula]++;
            return acc;
        }, {} as Record<string, number>);

        // Añadir el conteo de pasos a cada lectura
        data = data.map(lectura => ({
            ...lectura,
            pasos: pasosPorMatricula[lectura.Matricula]
        }));
        
        // Aplicar ordenamiento
        data = _.orderBy(data, [accessor], [sortStatus.direction]);
        
        // Aplicar paginación
        const start = (page - 1) * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        return data.slice(start, end);
    }, [results, sortStatus, page]);

    // --- Cargar datos iniciales ---
    useEffect(() => {
        const fetchInitialData = async () => {
            setInitialLoading(true);
            try {
                if (casoIdFijo) {
                    console.log(`[AnalisisLecturasPanel] Cargando filtros para caso ${casoIdFijo}...`);
                    const response = await fetch(`${API_BASE_URL}/casos/${casoIdFijo}/filtros_disponibles`);
                    if (!response.ok) {
                        throw new Error(`Error HTTP: ${response.status}`);
                    }
                    const data = await response.json();
                    
                    if (!data || !Array.isArray(data.lectores) || !Array.isArray(data.carreteras)) {
                        throw new Error('Formato de respuesta inválido');
                    }

                    // Procesar lectores
                    const lectoresOptions = data.lectores
                        .filter(l => l && l.ID_Lector)
                        .map(l => ({
                            value: String(l.ID_Lector),
                            label: `${l.Nombre || l.ID_Lector} (${l.ID_Lector})`
                        }));
                    setLectoresList(lectoresOptions);

                    // Procesar carreteras
                    const carreterasOptions = data.carreteras
                        .filter(c => c && typeof c === 'string')
                        .map(c => ({
                            value: c,
                            label: c
                        }));
                    setCarreterasList(carreterasOptions);

                    console.log(`[AnalisisLecturasPanel] Cargados ${lectoresOptions.length} lectores y ${carreterasOptions.length} carreteras`);
                }
            } catch (error) {
                console.error('[AnalisisLecturasPanel] Error cargando filtros:', error);
                notifications.show({
                    title: 'Error',
                    message: 'No se pudieron cargar los filtros. Por favor, recarga la página.',
                    color: 'red'
                });
            } finally {
                setInitialLoading(false);
            }
        };

        fetchInitialData();
    }, [casoIdFijo]);

    useEffect(() => {
        const fetchSugerencias = async () => {
            try {
                const sugerencias = await getLectorSugerencias();
                
                // Ensure all values are strings and filter out invalid entries
                setOrganismosList(sugerencias.organismos
                    .filter((o: string) => o && o.trim() !== '')
                    .map((o: string) => ({ 
                        value: String(o), 
                        label: String(o)
                    })));
                    
                setProvinciasList(sugerencias.provincias
                    .filter((p: string) => p && p.trim() !== '')
                    .map((p: string) => ({ 
                        value: String(p), 
                        label: String(p)
                    })));
                    
                setCarreterasList(sugerencias.carreteras
                    .filter((c: string) => c && c.trim() !== '')
                    .map((c: string) => ({ 
                        value: String(c), 
                        label: String(c)
                    })));
            } catch (error) {
                console.error("Error fetching sugerencias:", error);
                notifications.show({
                    title: 'Error',
                    message: 'No se pudieron cargar las sugerencias de filtros',
                    color: 'red'
                });
            }
        };
        fetchSugerencias();
    }, []);

    // --- NUEVA: Función para Limpiar Filtros ---
    const handleClearFilters = useCallback(() => {
        setFechaInicio(null);
        setFechaFin(null);
        setTimeFrom('');
        setTimeTo('');
        setSelectedLectores([]);
        setSelectedCarreteras([]);
        setSelectedSentidos([]);
        setSelectedCasos([]);
        setMatricula('');
        setMinPasos(null);
        setMaxPasos(null);
        setPage(1);
        setSortStatus({ columnAccessor: 'Fecha_y_Hora', direction: 'desc' });
        setResults([]);
        setSelectedRecords([]);
        
        notifications.show({ 
            title: 'Filtros Limpiados', 
            message: 'Se han restablecido todos los filtros a sus valores por defecto.', 
            color: 'blue' 
        });
    }, []);

    // --- NUEVA: Función para validar filtros antes de buscar ---
    const validateFilters = useCallback(() => {
        // Validar fechas
        if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
            notifications.show({
                title: 'Error en Fechas',
                message: 'La fecha de inicio no puede ser posterior a la fecha de fin',
                color: 'red'
            });
            return false;
        }
        
        // Validar horas
        if (timeFrom && timeTo && timeFrom > timeTo) {
            notifications.show({
                title: 'Error en Horas',
                message: 'La hora de inicio no puede ser posterior a la hora de fin',
                color: 'red'
            });
            return false;
        }
        
        // Validar pasos
        if (minPasos !== null && maxPasos !== null && minPasos > maxPasos) {
            notifications.show({
                title: 'Error en Pasos',
                message: 'El mínimo de pasos no puede ser mayor que el máximo',
                color: 'red'
            });
            return false;
        }
        
        return true;
    }, [fechaInicio, fechaFin, timeFrom, timeTo, minPasos, maxPasos]);

    // --- Modificar handleSearch para usar validación ---
    const handleSearch = async () => {
        if (!validateFilters()) return;
        
        setLoading(true);
        setResults([]);
        setPage(1);
        setSelectedRecords([]);
        
        try {
            const params = new URLSearchParams();
            
            // Añadir parámetros básicos
            if (fechaInicio) params.append('fecha_inicio', dayjs(fechaInicio).format('YYYY-MM-DD'));
            if (fechaFin) params.append('fecha_fin', dayjs(fechaFin).format('YYYY-MM-DD'));
            if (timeFrom) params.append('hora_inicio', timeFrom);
            if (timeTo) params.append('hora_fin', timeTo);
            selectedLectores.forEach(id => params.append('lector_ids', id));
            selectedCarreteras.forEach(id => params.append('carretera_ids', id));
            selectedSentidos.forEach(s => params.append('sentido', s));
            
            // Añadir ID del caso
            if (casoIdFijo) {
                params.append('caso_ids', String(casoIdFijo));
            } else if (permitirSeleccionCaso) {
                selectedCasos.forEach(id => params.append('caso_ids', id));
            }
            
            // Añadir matrícula y tipo de fuente
            if (matricula.trim()) params.append('matricula', matricula.trim());
            if (tipoFuenteFijo) params.append('tipo_fuente', tipoFuenteFijo);
            
            // Procesar filtros de pasos
            if (minPasos !== null && minPasos > 0) {
                params.append('min_pasos', String(minPasos));
                console.log('[AnalisisLecturasPanel] Aplicando min_pasos:', minPasos);
            }
            if (maxPasos !== null && maxPasos > 0) {
                params.append('max_pasos', String(maxPasos));
                console.log('[AnalisisLecturasPanel] Aplicando max_pasos:', maxPasos);
            }
            
            params.append('limit', '100000');
            const queryString = params.toString();
            const searchUrl = `${API_BASE_URL}/lecturas?${queryString}`;
            
            console.log('[AnalisisLecturasPanel] URL de búsqueda:', searchUrl);
            const response = await fetch(searchUrl);
            
            if (!response.ok) {
                throw new Error(`Error en la búsqueda: ${response.statusText || response.status}`);
            }
            
            const data = await response.json();
            if (!Array.isArray(data)) {
                throw new Error('Formato de respuesta inesperado');
            }
            
            console.log(`[AnalisisLecturasPanel] Resultados: ${data.length} lecturas`);
            if (minPasos !== null || maxPasos !== null) {
                console.log('[AnalisisLecturasPanel] Muestra de resultados:', 
                    data.slice(0, 3).map(d => ({
                        matricula: d.Matricula,
                        pasos: d.pasos,
                        fecha: d.Fecha_y_Hora
                    }))
                );
            }
            
            setResults(data);
            notifications.show({
                title: 'Búsqueda Completada',
                message: `Se encontraron ${data.length} lecturas.`,
                color: 'green'
            });
        } catch (error) {
            console.error('[AnalisisLecturasPanel] Error:', error);
            notifications.show({
                title: 'Error en la Búsqueda',
                message: error instanceof Error ? error.message : 'Error desconocido',
                color: 'red'
            });
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    // --- Handler de selección ---
    const handleSelectionChange = useCallback((newSelectedRecords: Lectura[]) => {
        setSelectedRecords(newSelectedRecords.map(record => record.ID_Lectura));
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
        // Obtener todas las lecturas seleccionadas
        const lecturasParaMarcar = selectedRecords.map(id => results.find(r => r.ID_Lectura === id));
        if (lecturasParaMarcar.length === 0) {
            notifications.show({ title: 'Error', message: 'No hay lecturas válidas para marcar.', color: 'red' });
            setSelectedRecords([]);
            setLoading(false);
            return;
        }
        const idsToMark = lecturasParaMarcar.map(r => r!.ID_Lectura);
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
                            return response.json().catch(() => null).then(errorData => {
                                const detail = errorData?.detail || `HTTP ${response.status}`;
                                throw new Error(`Error marcando ${id}: ${detail}`);
                            });
                        }
                        return response.json();
                    })
            )
        );
        let successCount = 0;
        results.forEach((result, index) => {
            const id = idsToMark[index];
            if (result.status === 'fulfilled') {
                successCount++;
                console.log(`Lectura ${id} marcada como relevante.`);
            } else {
                console.error(`Error marcando lectura ${id}:`, result.reason);
                notifications.show({ title: 'Error Parcial', message: `No se pudo marcar la lectura ID ${id}: ${result.reason.message}`, color: 'red' });
            }
        });
        if (successCount > 0) {
            notifications.show({ title: 'Éxito', message: `${successCount} de ${idsToMark.length} lecturas marcadas como relevantes.`, color: 'green' });
        }
        setSelectedRecords([]);
        setLoading(false);
    };

    const handleDesmarcarRelevante = async () => {
        const lecturasParaDesmarcar = selectedRecords.map(id => results.find(r => r.ID_Lectura === id));
        if (lecturasParaDesmarcar.length === 0) {
            notifications.show({ title: 'Nada que hacer', message: 'Ninguna de las lecturas seleccionadas está marcada como relevante.', color: 'blue' });
            setSelectedRecords([]);
            return;
        }
        setLoading(true);
        const idsToUnmark = lecturasParaDesmarcar.map(r => r!.ID_Lectura);
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
        results.forEach((result, index) => {
            const id = idsToUnmark[index];
            if (result.status === 'fulfilled') {
                successCount++;
                console.log(`Lectura ${id} desmarcada como relevante.`);
            } else {
                console.error(`Error desmarcando lectura ${id}:`, result.reason);
                notifications.show({ title: 'Error Parcial', message: `No se pudo desmarcar la lectura ID ${id}: ${result.reason.message}`, color: 'red' });
            }
        });
        if (successCount > 0) {
             notifications.show({ title: 'Éxito', message: `${successCount} de ${idsToUnmark.length} lecturas desmarcadas.`, color: 'green' });
        }
        setSelectedRecords([]); // Limpiar selección
        setLoading(false);
    };

    const handleGuardarVehiculos = async () => {
        const matriculasUnicas = Array.from(new Set(selectedRecords.map(id => results.find(r => r.ID_Lectura === id)?.Matricula)));
        if (matriculasUnicas.length === 0) return;
        setLoading(true);
        console.log("Intentando guardar vehículos con matrículas:", matriculasUnicas);
        let vehiculosCreados = 0;
        let vehiculosExistentes = 0;
        let errores = 0;
        const results = await Promise.allSettled(
            matriculasUnicas.map(matricula => 
                fetch(`${API_BASE_URL}/vehiculos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ Matricula: matricula }), // Enviar solo matrícula
                }).then(async response => {
                    if (response.status === 201) return { status: 'created', matricula }; // Creado
                    if (response.status === 400) { // Asumimos 400 para "ya existe"
                         const errorData = await response.json().catch(() => null);
                         console.warn(`Vehículo ${matricula} ya existe o petición inválida:`, errorData?.detail);
                         return { status: 'exists', matricula }; // Ya existía
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
    const columns: DataTableColumn<Lectura>[] = useMemo(() => [
        {
            accessor: 'Fecha_y_Hora',
            title: 'Fecha y Hora',
            sortable: true,
            render: (l) => dayjs(l.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')
        },
        {
            accessor: 'Matricula',
            title: 'Matrícula',
            sortable: true
        },
        {
            accessor: 'lector.Nombre',
            title: 'Lector',
            sortable: true,
            render: (l) => l.lector?.Nombre || '-'
        },
        {
            accessor: 'lector.Carretera',
            title: 'Carretera',
            sortable: true,
            render: (l) => l.lector?.Carretera || '-'
        },
        {
            accessor: 'lector.Sentido',
            title: 'Sentido',
            sortable: true,
            render: (l) => l.lector?.Sentido || '-'
        },
        {
            accessor: 'pasos',
            title: 'Pasos',
            sortable: true,
            textAlign: 'right',
            width: 80
        }
    ], []);

    // --- Handler de cambio de página ---
    const handlePageChange = useCallback((newPage: number) => {
        setPage(newPage);
        // Scroll al principio de la tabla
        const tableContainer = document.querySelector('.mantine-DataTable-tableContainer');
        if (tableContainer) {
            tableContainer.scrollTop = 0;
        }
    }, []);

    // --- Handler de cambio de ordenamiento ---
    const handleSortStatusChange = useCallback((newSortStatus: DataTableSortStatus) => {
        setSortStatus(newSortStatus);
        setPage(1); // Resetear a la primera página al cambiar el ordenamiento
    }, []);

    // Actualizar los handlers de cambio para los inputs de pasos
    const handleMinPasosChange = (value: string | number | null) => {
        const numValue = value === null || value === '' ? null : 
                        typeof value === 'string' ? parseInt(value, 10) : value;
        setMinPasos(numValue);
        console.log('[AnalisisLecturasPanel] Nuevo valor min_pasos:', numValue);
    };

    const handleMaxPasosChange = (value: string | number | null) => {
        const numValue = value === null || value === '' ? null : 
                        typeof value === 'string' ? parseInt(value, 10) : value;
        setMaxPasos(numValue);
        console.log('[AnalisisLecturasPanel] Nuevo valor max_pasos:', numValue);
    };

    // Función para manejar el ordenamiento
    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    // Función para obtener el número de pasos por matrícula
    const getPasosPorMatricula = (matricula: string) => {
        return results.filter(r => r.Matricula === matricula).length;
    };

    // Función para ordenar los resultados
    const sortResults = (results: Lectura[]) => {
        if (!sortField) return results;

        return [...results].sort((a, b) => {
            let aValue: any;
            let bValue: any;

            if (sortField === 'pasos') {
                aValue = getPasosPorMatricula(a.Matricula);
                bValue = getPasosPorMatricula(b.Matricula);
            } else if (sortField.includes('.')) {
                const [parent, child] = sortField.split('.');
                aValue = a[parent as keyof Lectura]?.[child as keyof typeof a[keyof Lectura]];
                bValue = b[parent as keyof Lectura]?.[child as keyof typeof b[keyof Lectura]];
            } else {
                aValue = a[sortField as keyof Lectura];
                bValue = b[sortField as keyof Lectura];
            }

            if (aValue === bValue) return 0;
            if (aValue === null || aValue === undefined) return 1;
            if (bValue === null || bValue === undefined) return -1;

            const comparison = aValue < bValue ? -1 : 1;
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    };

    // Función para marcar/desmarcar lectura como relevante
    const handleToggleRelevante = async (idLectura: number) => {
        try {
            const lectura = results.find(r => r.ID_Lectura === idLectura);
            if (!lectura) return;

            if (lectura.es_relevante) {
                await fetch(`${API_BASE_URL}/lecturas/${idLectura}/desmarcar_relevante`, { method: 'DELETE' });
            } else {
                await fetch(`${API_BASE_URL}/lecturas/${idLectura}/marcar_relevante`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ caso_id: casoIdFijo })
                });
            }

            // Actualizar el estado local
            setResults(results.map(r => 
                r.ID_Lectura === idLectura 
                    ? { ...r, es_relevante: !r.es_relevante }
                    : r
            ));
        } catch (error) {
            console.error('Error al marcar/desmarcar lectura como relevante:', error);
            showNotification({
                title: 'Error',
                message: 'No se pudo marcar/desmarcar la lectura como relevante',
                color: 'red'
            });
        }
    };

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
                                comboboxProps={{
                                    withinPortal: true,
                                    position: 'bottom',
                                    middlewares: { flip: false, shift: false },
                                    offset: 0,
                                }}
                            />
                            <Group grow>
                            <MultiSelect
                                    label="Organismo"
                                data={organismosList}
                                value={selectedOrganismos}
                                onChange={setSelectedOrganismos}
                                searchable
                                clearable
                                    leftSection={<IconBuildingCommunity style={iconStyle} />}
                            />
                            <MultiSelect
                                    label="Provincia"
                                data={provinciasList}
                                value={selectedProvincias}
                                onChange={setSelectedProvincias}
                                searchable
                                clearable
                                leftSection={<IconDeviceCctv style={iconStyle} />}
                            />
                            </Group>
                            <Group grow>
                            <MultiSelect
                                    label="Carretera"
                                    placeholder="Todas"
                                data={carreterasList}
                                value={selectedCarreteras}
                                onChange={setSelectedCarreteras}
                                searchable
                                clearable
                                    leftSection={<IconRoad style={iconStyle} />}
                            />
                                {tipoFuenteFijo === 'LPR' ? (
                                <MultiSelect
                                    label="Sentido"
                                    placeholder="Ambos"
                                    data={sentidosList}
                                    value={selectedSentidos}
                                    onChange={setSelectedSentidos}
                                    clearable
                                    leftSection={<IconArrowsUpDown style={iconStyle} />}
                                />
                                ) : null}
                            </Group>
                            <TextInput
                                label="Matrícula (parcial)"
                                placeholder="Ej: ?98?C*"
                                value={matricula}
                                onChange={(event) => setMatricula(event.currentTarget.value)}
                                leftSection={<IconLicense style={iconStyle} />}
                            />
                            <Group grow>
                                <NumberInput
                                    label="Mín. Pasos"
                                    placeholder="Cualquiera"
                                    value={minPasos || ''}
                                    onChange={handleMinPasosChange}
                                    min={1}
                                    allowDecimal={false}
                                    allowNegative={false}
                                    clampBehavior="strict"
                                    hideControls
                                />
                                <NumberInput
                                    label="Máx. Pasos"
                                    placeholder="Cualquiera"
                                    value={maxPasos || ''}
                                    onChange={handleMaxPasosChange}
                                    min={1}
                                    allowDecimal={false}
                                    allowNegative={false}
                                    clampBehavior="strict"
                                    hideControls
                                />
                            </Group>
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
                     <Paper shadow="sm" p="md" withBorder style={{ position: 'relative', overflow: 'hidden' }}>
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
                        <Box style={{ maxHeight: 'calc(100vh - 400px)', overflow: 'auto' }}>
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
                                onPageChange={handlePageChange}
                                idAccessor="ID_Lectura"
                                selectedRecords={selectedRecords}
                                onSelectedRecordsChange={setSelectedRecords}
                                noRecordsText={loading ? 'Cargando...' : (results.length === 0 ? 'No se encontraron resultados con los filtros aplicados' : '')}
                                noRecordsIcon={<></>}
                                fetching={loading}
                                sortStatus={sortStatus}
                                onSortStatusChange={setSortStatus}
                                style={{ tableLayout: 'fixed' }}
                            />
                        </Box>
                     </Paper>
                 </Grid.Col>
            </Grid>
        </Box>
    );
  }
);

export default AnalisisLecturasPanel; 