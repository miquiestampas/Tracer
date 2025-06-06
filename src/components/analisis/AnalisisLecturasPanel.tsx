import React, { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Stack, Grid, Button, TextInput, Box, NumberInput, LoadingOverlay, Title, rem, Input, Group, ActionIcon, Tooltip, Paper, Checkbox, ThemeIcon, Text, Flex, useMantineTheme, Table, Select, Collapse, Alert, Progress, Loader } from '@mantine/core';
import { TimeInput, DateInput } from '@mantine/dates';
import { MultiSelect, MultiSelectProps } from '@mantine/core';
import { IconSearch, IconClock, IconDeviceCctv, IconFolder, IconLicense, IconRoad, IconArrowsUpDown, IconStar, IconStarOff, IconDeviceFloppy, IconBookmark, IconBookmarkOff, IconCar, IconStarFilled, IconCalendar, IconFileExport, IconFilterOff, IconChevronDown, IconChevronRight, IconBuildingCommunity, IconTableOptions, IconTable, IconPlus, IconX, IconMapPin } from '@tabler/icons-react';
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
import { Lectura as LecturaAPI } from '../../types/api.ts';
import apiClient from './api';
import type { GpsLectura } from '../types/data';
import { getLecturasGps } from '../../services/gpsApi';

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

interface ExtendedLectura {
    _isGroup?: boolean;
    _isSubRow?: boolean;
    _expanded?: boolean;
    _lecturas?: ExtendedLectura[];
    _groupId?: string;
    _lecturas_originales?: ExtendedLectura[];
    carriles_detectados?: string[];
    pasos?: number;
    es_relevante?: boolean;
    Matricula: string;
    Fecha_y_Hora: string;
    ID_Lectura: number | string;
    ID_Archivo: number;
    Tipo_Fuente: string;
    lector?: {
        Nombre?: string;
        Carretera?: string;
        Sentido?: string;
    };
    [key: string]: any;
}

interface SavedSearch {
    id: number;
    name: string;
    caso_id: number;
    filters: {
        fechaInicio: Date | null;
        fechaFin: Date | null;
        timeFrom: string;
        timeTo: string;
        selectedLectores: string[];
        selectedCarreteras: string[];
        selectedSentidos: string[];
        matricula: string;
        minPasos: number | null;
        maxPasos: number | null;
    };
    results: ExtendedLectura[];
    created_at?: string;
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
    const [matriculaTags, setMatriculaTags] = useState<string[]>([]);
    const [currentMatriculaInput, setCurrentMatriculaInput] = useState('');
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
    const [results, setResults] = useState<ExtendedLectura[]>([]);
    const [selectedRecords, setSelectedRecords] = useState<(number | string)[]>([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<ExtendedLectura>>({ columnAccessor: 'Fecha_y_Hora', direction: 'desc' });
    const [casosSeleccionados, setCasosSeleccionados] = useState<number[]>([]);
    const [organismosList, setOrganismosList] = useState<SelectOption[]>([]);
    const [provinciasList, setProvinciasList] = useState<SelectOption[]>([]);
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [isGroupedByVehicle, setIsGroupedByVehicle] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
    const [selectedSearches, setSelectedSearches] = useState<number[]>([]);
    const [showSavedSearches, setShowSavedSearches] = useState(false);
    const [ayudaAbierta, setAyudaAbierta] = useState(false);
    const [overlayVisible, setOverlayVisible] = useState(false);
    const [overlayMessage, setOverlayMessage] = useState('');
    const [overlayProgress, setOverlayProgress] = useState(0);
    
    // --- Procesar datos ---
    const getLectorBaseId = (nombreLector: string): string => {
        if (!nombreLector) return '';
        return nombreLector.replace(/\s+C\d+$/, '');
    };

    // Solo agrupar si se solicita
    const agruparLecturasSimultaneas = (lecturas: ExtendedLectura[]): ExtendedLectura[] => {
        // Ordenar las lecturas por fecha para asegurar consistencia
        const lecturasOrdenadas = [...lecturas].sort((a, b) => a.Fecha_y_Hora.localeCompare(b.Fecha_y_Hora));
        const grupos: { [key: string]: ExtendedLectura[] } = {};
        lecturasOrdenadas.forEach(lectura => {
            // Permitir agrupamiento aunque falte lector.Nombre (usar 'Desconocido')
            const nombreLector = lectura.lector?.Nombre || 'Desconocido';
            if (!lectura.Fecha_y_Hora || !lectura.Matricula) return;
            const puntoControl = getLectorBaseId(nombreLector);
            const timestamp = dayjs(lectura.Fecha_y_Hora);
            let grupoEncontrado = false;
            for (const [clave, grupo] of Object.entries(grupos)) {
                const [grupoTimestamp, grupoMatricula, grupoPuntoControl] = clave.split('_');
                if (grupoMatricula === lectura.Matricula && grupoPuntoControl === puntoControl) {
                    const diferencia = Math.abs(timestamp.diff(dayjs(grupoTimestamp), 'second'));
                    if (diferencia <= 2) {
                        grupos[clave].push(lectura);
                        grupoEncontrado = true;
                        break;
                    }
                }
            }
            if (!grupoEncontrado) {
                const nuevaClave = `${lectura.Fecha_y_Hora}_${lectura.Matricula}_${puntoControl}`;
                grupos[nuevaClave] = [lectura];
            }
        });
        const lecturasAgrupadas = Object.values(grupos).map(grupoLecturas => {
            if (grupoLecturas.length === 1) {
                return grupoLecturas[0];
            }
            grupoLecturas.sort((a, b) => a.Fecha_y_Hora.localeCompare(b.Fecha_y_Hora));
            const lecturaBase = grupoLecturas[0];
            const carriles = grupoLecturas
                .map(l => l.lector?.Nombre?.match(/C\d+$/)?.[0] || '')
                .filter(Boolean)
                .sort();
            const fechaInicial = dayjs(grupoLecturas[0].Fecha_y_Hora);
            const fechaFinal = dayjs(grupoLecturas[grupoLecturas.length - 1].Fecha_y_Hora);
            const diferenciaTiempo = fechaFinal.diff(fechaInicial, 'second');
            return {
                ...lecturaBase,
                carriles_detectados: carriles,
                _lecturas_originales: grupoLecturas,
                ID_Lectura: `${lecturaBase.ID_Lectura}_consolidated`,
                lector: {
                    ...lecturaBase.lector,
                    Nombre: carriles.length > 1 
                        ? `${getLectorBaseId(lecturaBase.lector?.Nombre || '')} (${carriles.join(', ')})${
                            diferenciaTiempo > 0 ? ` [Δt=${diferenciaTiempo}s]` : ''
                        }`
                        : lecturaBase.lector?.Nombre
                }
            };
        });
        return lecturasAgrupadas.sort((a, b) => b.Fecha_y_Hora.localeCompare(a.Fecha_y_Hora));
    };

    const processedResults = useMemo(() => {
        if (!results.length) return [];
        if (!isGroupedByVehicle) {
            // No agrupar, mostrar los datos originales tal cual
            return results;
        }
        // Si se agrupa, primero agrupar lecturas simultáneas
        const lecturasAgrupadas = agruparLecturasSimultaneas(results);
        console.log('Lecturas originales:', results.length, 'Lecturas agrupadas:', lecturasAgrupadas.length);
        // Agrupar por matrícula las lecturas ya agrupadas por simultaneidad
        const groupedByMatricula = _.groupBy(lecturasAgrupadas, 'Matricula');
        return Object.entries(groupedByMatricula).flatMap(([matricula, lecturas]) => {
            const group: ExtendedLectura = {
                Matricula: matricula,
                pasos: lecturas.length,
                _isGroup: true,
                _lecturas: lecturas,
                _expanded: expandedGroups.has(`group_${matricula}`),
                ID_Lectura: `group_${matricula}`,
                Fecha_y_Hora: lecturas[0].Fecha_y_Hora,
                lector: lecturas[0].lector,
                ID_Archivo: lecturas[0].ID_Archivo,
                Tipo_Fuente: lecturas[0].Tipo_Fuente
            };
            const expandedRows: ExtendedLectura[] = expandedGroups.has(`group_${matricula}`) 
                ? lecturas.map(lectura => ({
                    ...lectura,
                    _isSubRow: true,
                    _groupId: `group_${matricula}`
                })) 
                : [];
            return [group, ...expandedRows];
        });
    }, [results, isGroupedByVehicle, expandedGroups]);

    const sortedAndPaginatedResults = useMemo(() => {
        if (!processedResults.length) return [];
        
        const accessor = sortStatus.columnAccessor as string;
        let data = [...processedResults];
        
        // Aplicar ordenamiento
        data.sort((a, b) => {
            // Función para obtener el valor de una propiedad anidada
            const getNestedValue = (obj: any, path: string) => {
                return path.split('.').reduce((acc, part) => acc && acc[part], obj);
            };

            // Obtener los valores a comparar
            let aValue = getNestedValue(a, accessor);
            let bValue = getNestedValue(b, accessor);
            
            // Si alguno de los valores es undefined o null, ponerlo al final
            if (aValue === undefined || aValue === null) return 1;
            if (bValue === undefined || bValue === null) return -1;

            // Para fechas
            if (accessor === 'Fecha_y_Hora') {
                const aDate = new Date(aValue).getTime();
                const bDate = new Date(bValue).getTime();
                return sortStatus.direction === 'asc' ? aDate - bDate : bDate - aDate;
            }

            // Para números
            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return sortStatus.direction === 'asc' ? aValue - bValue : bValue - aValue;
            }

            // Para strings (incluyendo propiedades de objetos anidados)
            const aString = String(aValue).toLowerCase();
            const bString = String(bValue).toLowerCase();
            const comparison = aString.localeCompare(bString);
            
            return sortStatus.direction === 'asc' ? comparison : -comparison;
        });
        
        // Aplicar paginación
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        return data.slice(start, end);
    }, [processedResults, sortStatus, page, pageSize]);

    // --- Cargar datos iniciales ---
    useEffect(() => {
        const fetchInitialData = async () => {
            setInitialLoading(true);
            try {
                if (casoIdFijo) {
                    console.log(`[AnalisisLecturasPanel] Cargando lectores para caso ${casoIdFijo}...`);
                    const response = await fetch(`${API_BASE_URL}/casos/${casoIdFijo}/lectores`);
                    if (!response.ok) {
                        throw new Error(`Error HTTP: ${response.status}`);
                    }
                    const data = await response.json();
                    if (!data || !Array.isArray(data)) {
                        throw new Error('Formato de respuesta inválido');
                    }
                    // Procesar lectores
                    const lectoresOptions = data
                        .filter(l => l && l.ID_Lector)
                        .map(l => ({
                            value: String(l.ID_Lector),
                            label: `${l.Nombre || l.ID_Lector} (${l.ID_Lector})`
                        }));
                    setLectoresList(lectoresOptions);
                    // Si necesitas carreteras, puedes mantener la lógica anterior o adaptarla
                }
            } catch (e) {
                console.error(e);
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

    // --- Handler para el campo de matrícula ---
    const handleMatriculaKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === ' ' && currentMatriculaInput.trim()) {
            event.preventDefault();
            setMatriculaTags(prev => [...prev, currentMatriculaInput.trim()]);
            setCurrentMatriculaInput('');
        }
    }, [currentMatriculaInput]);

    const handleMatriculaChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        setCurrentMatriculaInput(event.target.value);
    }, []);

    const removeMatriculaTag = useCallback((tagToRemove: string) => {
        setMatriculaTags(prev => prev.filter(tag => tag !== tagToRemove));
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
        setCurrentMatriculaInput('');
        setMatriculaTags([]);
        setMinPasos(null);
        setMaxPasos(null);
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

    // --- Modificar handleSearch para enviar cada matrícula como parámetro separado ---
    const handleSearch = async () => {
        setOverlayVisible(true);
        setOverlayMessage('Procesando búsqueda de lecturas...');
        setOverlayProgress(0);
        setLoading(true);
        try {
            // Simulación de progreso para la demo
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += Math.random() * 20;
                setOverlayProgress(Math.min(progress, 95));
            }, 200);

            if (!validateFilters()) return;
            
            setResults([]);
            setSelectedRecords([]);
            
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
            
            // Añadir matrículas (cada una como parámetro separado)
            if (matriculaTags.length > 0) {
                matriculaTags.forEach(tag => params.append('matricula', tag));
            } else if (currentMatriculaInput.trim()) {
                params.append('matricula', currentMatriculaInput.trim());
            }
            
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
            
            console.log('Lecturas recibidas:', data);
            setResults(data);
            notifications.show({
                title: 'Búsqueda Completada',
                message: `Se encontraron ${data.length} lecturas.`,
                color: 'green'
            });

            // Simula el tiempo de búsqueda
            await new Promise(res => setTimeout(res, 1800));

            clearInterval(progressInterval);
            setOverlayProgress(100);
            setTimeout(() => setOverlayVisible(false), 400);
        } catch (error) {
            console.error('[AnalisisLecturasPanel] Error:', error);
            notifications.show({
                title: 'Error en la Búsqueda',
                message: error instanceof Error ? error.message : 'Error desconocido',
                color: 'red'
            });
            setResults([]);
            setOverlayVisible(false);
        } finally {
            setLoading(false);
        }
    };

    // --- Handler de selección ---
    const handleSelectionChange = useCallback((selectedRecords: ExtendedLectura[]) => {
        const ids = selectedRecords.map(record => record.ID_Lectura);
        setSelectedRecords(ids);
        const matriculas = selectedRecords.map(record => record.Matricula);
        if (matriculas.length > 0) {
            addInteractedMatricula(matriculas);
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
        // Obtener todas las lecturas seleccionadas con ID válido
        const lecturasParaMarcar = selectedRecords
            .map(id => results.find(r => r.ID_Lectura === id))
            .filter(r => r && typeof r.ID_Lectura === 'number');
        if (lecturasParaMarcar.length === 0) {
            notifications.show({ title: 'Error', message: 'No hay lecturas válidas para marcar.', color: 'red' });
            setSelectedRecords([]);
            setLoading(false);
            return;
        }
        const idsToMark = lecturasParaMarcar.map(r => r!.ID_Lectura);
        if (casoIdFijo === null || casoIdFijo === undefined || isNaN(casoIdFijo)) {
            notifications.show({ title: 'Error', message: 'No se pudo determinar el ID del caso actual para marcar la lectura.', color: 'red' });
            setSelectedRecords([]);
            setLoading(false);
            return;
        }
        let successCount = 0;
        let errorCount = 0;
        for (const id of idsToMark) {
            try {
                const response = await fetch(`${API_BASE_URL}/lecturas/${id}/marcar_relevante`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        Nota: null,
                        caso_id: casoIdFijo
                    }) 
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => null);
                    const detail = errorData?.detail || `HTTP ${response.status}`;
                    throw new Error(`Error marcando ${id}: ${detail}`);
                }
                successCount++;
            } catch (err: any) {
                errorCount++;
                notifications.show({ title: 'Error', message: err.message || 'Error desconocido', color: 'red' });
            }
        }
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
        // Permitir guardar desde vista agrupada o normal
        const matriculasUnicas = Array.from(new Set(selectedRecords
            .map(id => {
                const record = results.find(r => r.ID_Lectura === id) || processedResults.find(r => r.ID_Lectura === id);
                if (record && record._isGroup && record.Matricula) return record.Matricula;
                if (record && typeof record.Matricula === 'string' && record.Matricula.trim() !== '') return record.Matricula;
                return null;
            })
            .filter(m => typeof m === 'string' && m.trim() !== '')));
        if (matriculasUnicas.length === 0) {
            notifications.show({ title: 'Sin matrículas', message: 'No hay matrículas válidas seleccionadas.', color: 'orange' });
            return;
        }
        setLoading(true);
        let vehiculosCreados = 0;
        let vehiculosExistentes = 0;
        let errores = 0;
        for (const matricula of matriculasUnicas) {
            try {
                const response = await fetch(`${API_BASE_URL}/vehiculos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ Matricula: matricula }),
                });
                if (response.status === 201) {
                    vehiculosCreados++;
                } else if (response.status === 400 || response.status === 409) {
                    vehiculosExistentes++;
                } else {
                    const errorData = await response.json().catch(() => null);
                    throw new Error(errorData?.detail || `HTTP ${response.status}`);
                }
            } catch (e: any) {
                errores++;
                notifications.show({ title: 'Error Guardando Vehículo', message: e.message || 'Error desconocido', color: 'red' });
            }
        }
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
        } else {
            notifications.show({ title: 'Nada que guardar', message: 'No se guardó ningún vehículo.', color: 'orange' });
        }
        setSelectedRecords([]);
        setLoading(false);
    };

    // Función para expandir/colapsar grupos
    const toggleGroupExpansion = useCallback((groupId: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) {
                next.delete(groupId);
            } else {
                next.add(groupId);
            }
            return next;
        });
    }, []);

    // --- Columnas ---
    const columns = useMemo(() => [
        ...(isGroupedByVehicle ? [{
            accessor: 'expand',
            title: '',
            width: 40,
            render: (record: ExtendedLectura) => {
                if (!record._isGroup) return null;
                return (
                    <ActionIcon 
                        variant="subtle" 
                        onClick={() => toggleGroupExpansion(record.ID_Lectura as string)}
                    >
                        {expandedGroups.has(record.ID_Lectura as string) ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                    </ActionIcon>
                );
            }
        }] : []),
        {
            accessor: 'Fecha_y_Hora',
            title: 'Fecha y Hora',
            sortable: true,
            render: (record: ExtendedLectura) => {
                if (record._isSubRow) {
                    return <Text ml={20}>{dayjs(record.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')}</Text>;
                }
                if (record._isGroup) {
                    return `${record._lecturas?.length || 0} lecturas`;
                }
                return dayjs(record.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss');
            }
        },
        {
            accessor: 'Matricula',
            title: 'Matrícula',
            sortable: true,
            render: (record: ExtendedLectura) => {
                if (record._isSubRow) {
                    return <Text ml={20}>{record.Matricula}</Text>;
                }
                return record.Matricula;
            }
        },
        {
            accessor: 'lector.Nombre',
            title: 'Lector',
            sortable: true,
            render: (record: ExtendedLectura) => {
                const text = record.lector?.Nombre || '-';
                if (record.carriles_detectados && record.carriles_detectados.length > 1) {
                    return (
                        <Tooltip label={`Detectado en carriles: ${record.carriles_detectados.join(', ')}`}>
                            <Text>
                                {getLectorBaseId(text)}
                                <Text component="span" size="xs" color="dimmed"> ({record.carriles_detectados.length} carriles)</Text>
                            </Text>
                        </Tooltip>
                    );
                }
                return record._isSubRow ? <Text ml={20}>{text}</Text> : text;
            }
        },
        {
            accessor: 'lector.Carretera',
            title: 'Carretera',
            sortable: true,
            render: (record: ExtendedLectura) => {
                const text = record.lector?.Carretera || '-';
                return record._isSubRow ? <Text ml={20}>{text}</Text> : text;
            }
        },
        {
            accessor: 'lector.Sentido',
            title: 'Sentido',
            sortable: true,
            render: (record: ExtendedLectura) => {
                const text = record.lector?.Sentido || '-';
                return record._isSubRow ? <Text ml={20}>{text}</Text> : text;
            }
        },
        {
            accessor: 'pasos',
            title: 'Pasos',
            sortable: true,
            textAlign: 'right',
            width: 80,
            render: (record: ExtendedLectura) => {
                if (record._isSubRow) return null;
                return record.pasos;
            }
        }
    ] as DataTableColumn<ExtendedLectura>[], [isGroupedByVehicle, toggleGroupExpansion, expandedGroups]);

    // --- Handler de cambio de ordenamiento ---
    const handleSortStatusChange = useCallback((newSortStatus: DataTableSortStatus<ExtendedLectura>) => {
        setSortStatus(newSortStatus);
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
    const sortResults = (results: ExtendedLectura[]) => {
        if (!sortField) return results;

        return [...results].sort((a, b) => {
            let aValue: any;
            let bValue: any;

            if (sortField === 'pasos') {
                aValue = getPasosPorMatricula(a.Matricula);
                bValue = getPasosPorMatricula(b.Matricula);
            } else if (sortField.includes('.')) {
                const [parent, child] = sortField.split('.');
                aValue = a[parent as keyof ExtendedLectura]?.[child as keyof typeof a[keyof ExtendedLectura]];
                bValue = b[parent as keyof ExtendedLectura]?.[child as keyof typeof b[keyof ExtendedLectura]];
            } else {
                aValue = a[sortField as keyof ExtendedLectura];
                bValue = b[sortField as keyof ExtendedLectura];
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

    // Cargar búsquedas guardadas al iniciar
    useEffect(() => {
        const fetchSavedSearches = async () => {
            if (!casoIdFijo) return;
            try {
                const response = await fetch(`${API_BASE_URL}/casos/${casoIdFijo}/saved_searches`);
                if (!response.ok) throw new Error('Error al cargar búsquedas guardadas');
                const data = await response.json();
                setSavedSearches(data);
            } catch (error) {
                console.error('Error cargando búsquedas guardadas:', error);
                notifications.show({
                    title: 'Error',
                    message: 'No se pudieron cargar las búsquedas guardadas',
                    color: 'red'
                });
            }
        };

        fetchSavedSearches();
    }, [casoIdFijo]);

    // Función para guardar la búsqueda actual
    const handleSaveSearch = useCallback(async () => {
        if (!casoIdFijo) {
            notifications.show({
                title: 'Error',
                message: 'No se puede guardar la búsqueda sin un caso seleccionado',
                color: 'red'
            });
            return;
        }

        const searchName = window.prompt('Nombre para esta búsqueda:');
        if (!searchName) return;

        const newSearch = {
            name: searchName,
            caso_id: casoIdFijo,
            filters: {
                fechaInicio,
                fechaFin,
                timeFrom,
                timeTo,
                selectedLectores,
                selectedCarreteras,
                selectedSentidos,
                matricula,
                minPasos,
                maxPasos
            },
            results: [...results]
        };

        try {
            const response = await fetch(`${API_BASE_URL}/casos/${casoIdFijo}/saved_searches`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newSearch)
            });

            if (!response.ok) throw new Error('Error al guardar la búsqueda');
            
            const savedSearch = await response.json();
            setSavedSearches(prev => [...prev, savedSearch]);
            
            notifications.show({
                title: 'Búsqueda Guardada',
                message: `Se ha guardado la búsqueda "${searchName}"`,
                color: 'green'
            });
        } catch (error) {
            console.error('Error guardando búsqueda:', error);
            notifications.show({
                title: 'Error',
                message: 'No se pudo guardar la búsqueda',
                color: 'red'
            });
        }
    }, [casoIdFijo, fechaInicio, fechaFin, timeFrom, timeTo, selectedLectores, selectedCarreteras, selectedSentidos, matricula, minPasos, maxPasos, results]);

    // Función para eliminar una búsqueda guardada
    const handleDeleteSavedSearch = async (searchId: number) => {
        try {
            const response = await fetch(`${API_BASE_URL}/casos/${casoIdFijo}/saved_searches/${searchId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Error al eliminar la búsqueda');

            setSavedSearches(prev => prev.filter(s => s.id !== searchId));
            setSelectedSearches(prev => prev.filter(id => id !== searchId));

            notifications.show({
                title: 'Búsqueda Eliminada',
                message: 'La búsqueda ha sido eliminada correctamente',
                color: 'green'
            });
        } catch (error) {
            console.error('Error eliminando búsqueda:', error);
            notifications.show({
                title: 'Error',
                message: 'No se pudo eliminar la búsqueda',
                color: 'red'
            });
        }
    };

    // Función para realizar el cruce de búsquedas
    const handleCrossSearch = useCallback(() => {
        if (selectedSearches.length < 2) {
            notifications.show({
                title: 'Error',
                message: 'Selecciona al menos 2 búsquedas para realizar el cruce',
                color: 'red'
            });
            return;
        }

        // 1. Obtener los resultados de todas las búsquedas seleccionadas
        const selectedResultsArrays = selectedSearches
            .map(id => savedSearches.find(s => s.id === id)?.results || []);

        // 2. Encontrar matrículas comunes
        const matriculasPorBusqueda = selectedResultsArrays.map(results => new Set(results.map(r => r.Matricula)));
        const commonMatriculas = matriculasPorBusqueda.reduce((common, current) => {
            return new Set([...common].filter(x => current.has(x)));
        });

        // 3. Unir todos los resultados de las búsquedas seleccionadas
        const allResults = selectedResultsArrays.flat();

        // 4. Filtrar solo los resultados con matrícula común
        const crossedResults = allResults.filter(r => commonMatriculas.has(r.Matricula));

        setResults(crossedResults);

        notifications.show({
            title: 'Cruce Completado',
            message: `Se encontraron ${commonMatriculas.size} vehículos en común`,
            color: 'green'
        });
    }, [selectedSearches, savedSearches]);

    // --- Handler de cambio de página ---
    const handlePageChange = useCallback((newPage: number) => {
        setPage(newPage);
        // Scroll al principio de la tabla
        const tableContainer = document.querySelector('.mantine-DataTable-tableContainer');
        if (tableContainer) {
            tableContainer.scrollTop = 0;
        }
    }, []);

    // --- Handler de cambio de tamaño de página ---
    const handlePageSizeChange = useCallback((value: string | null) => {
        if (value === null) return;
        const newPageSize = parseInt(value, 10);
        setPageSize(newPageSize);
        setPage(1); // Resetear a la primera página al cambiar el tamaño
    }, []);

    // --- Renderizado ---
    return (
        <Box style={{ position: 'relative' }}>
            <style>{customStyles}</style>
            <Box>
                <Group justify="flex-end" mb="xs">
                    <Button
                        variant="light"
                        color="blue"
                        size="xs"
                        onClick={() => setAyudaAbierta((v) => !v)}
                    >
                        {ayudaAbierta ? 'Ocultar ayuda' : 'Mostrar ayuda'}
                    </Button>
                </Group>
                <Collapse in={ayudaAbierta}>
                    <Alert color="blue" title="¿Cómo funciona la pestaña Lecturas LPR?" mb="md">
                        <Text size="sm">
                            <b>¿Qué es esta pestaña?</b><br />
                            Aquí puedes consultar y filtrar todas las lecturas LPR asociadas al caso. Utiliza los filtros avanzados para acotar por matrícula (con comodines), fechas, horas, lector, carretera, etc.<br /><br />
                            <b>Guardar búsquedas y uso cruzado</b><br />
                            Puedes guardar cualquier búsqueda que realices (con los filtros aplicados) para consultarla más adelante o cruzarla con otras búsquedas. Esta funcionalidad es especialmente útil para:<br />
                            <ul>
                                <li><b>Comparar patrones de movimiento</b> de diferentes vehículos.</li>
                                <li><b>Localizar coincidencias</b> entre vehículos en distintos puntos geográficos y temporales.</li>
                                <li><b>Investigar vehículos lanzadera</b> que acompañan a un objetivo en diferentes momentos y ubicaciones.</li>
                            </ul>
                            <b>¿Cómo guardar una búsqueda?</b><br />
                            1. Aplica los filtros que te interesen (matrícula, fechas, lector, etc.).<br />
                            2. Haz clic en el botón "Guardar búsqueda".<br />
                            3. Asigna un nombre descriptivo para identificarla fácilmente.<br />
                            4. Accede a tus búsquedas guardadas desde el panel correspondiente para consultarlas o cruzarlas con otras.<br /><br />
                            <b>Ejemplos de uso avanzado:</b>
                            <ul>
                                <li><b>Localizar vehículos en varios puntos:</b> Filtra por una matrícula o patrón y guarda la búsqueda. Luego, filtra por otra ubicación o rango temporal y guarda esa búsqueda. Puedes comparar ambas para ver si hay vehículos que aparecen en ambos contextos.</li>
                                <li><b>Buscar vehículos lanzadera:</b> Filtra por la matrícula del vehículo objetivo y guarda la búsqueda. Después, filtra por intervalos de tiempo y ubicaciones donde el objetivo fue detectado, y guarda esas búsquedas. Cruza los resultados para identificar matrículas que aparecen repetidamente junto al objetivo en diferentes lugares y momentos.</li>
                                <li><b>Análisis de acompañamiento:</b> Guarda búsquedas de diferentes eventos (por ejemplo, entradas y salidas de una ciudad) y analiza qué vehículos coinciden en ambos eventos, lo que puede indicar acompañamiento o patrones sospechosos.</li>
                            </ul>
                            <b>Consejos:</b>
                            <ul>
                                <li>Usa nombres descriptivos al guardar búsquedas (ejemplo: "Matricula 1234ABC en Madrid 01/05/2024").</li>
                                <li>Cruza búsquedas para descubrir relaciones ocultas entre vehículos y eventos.</li>
                                <li>Aprovecha los filtros avanzados y los comodines para búsquedas flexibles y potentes.</li>
                            </ul>
                        </Text>
                    </Alert>
                </Collapse>
            </Box>
            <Grid>
                 <ProgressOverlay 
                    visible={initialLoading && !overlayVisible} 
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
                                leftSection={<IconMapPin style={iconStyle} />}
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
                            <Box>
                                <TextInput
                                    label="Matrícula (Completa o parcial)"
                                    placeholder="Ej: ?98?C* (Presiona espacio para agregar múltiples)"
                                    value={currentMatriculaInput}
                                    onChange={handleMatriculaChange}
                                    onKeyDown={handleMatriculaKeyDown}
                                    leftSection={<IconLicense style={iconStyle} />}
                                />
                                {matriculaTags.length > 0 && (
                                    <Group mt="xs" gap="xs">
                                        {matriculaTags.map((tag, index) => (
                                            <Paper key={index} p="xs" withBorder>
                                                <Group gap="xs">
                                                    <Text size="sm">{tag}</Text>
                                                    <ActionIcon 
                                                        variant="subtle" 
                                                        color="red" 
                                                        size="xs"
                                                        onClick={() => removeMatriculaTag(tag)}
                                                    >
                                                        <IconX size={14} />
                                                    </ActionIcon>
                                                </Group>
                                            </Paper>
                                        ))}
                                    </Group>
                                )}
                            </Box>
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
                                variant="outline" 
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
                        <Group justify="space-between" mb="md">
                            <Title order={4}>Resultados ({results.length} lecturas, {Array.from(new Set(results.map(r => r.Matricula))).length} vehículos)</Title>
                            <Group>
                                <Button 
                                    size="xs" 
                                    variant={isGroupedByVehicle ? "filled" : "outline"}
                                    color="blue"
                                    leftSection={isGroupedByVehicle ? <IconTableOptions size={16} /> : <IconTable size={16} />}
                                    onClick={() => setIsGroupedByVehicle(!isGroupedByVehicle)}
                                >
                                    {isGroupedByVehicle ? 'Vista Normal' : 'Agrupar por Vehículo'}
                                </Button>
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
                                <Button 
                                    size="xs" 
                                    variant="outline" 
                                    color="blue" 
                                    leftSection={<IconPlus size={16} />}
                                    onClick={handleSaveSearch}
                                    disabled={loading}
                                >
                                    Guardar Búsqueda
                                </Button>
                                <Button 
                                    size="xs" 
                                    variant="outline" 
                                    color="violet" 
                                    leftSection={<IconSearch size={16} />}
                                    onClick={() => setShowSavedSearches(!showSavedSearches)}
                                >
                                    Búsquedas Guardadas
                                </Button>
                            </Group>
                        </Group>

                        {showSavedSearches && (
                            <Paper shadow="sm" p="md" mb="md" withBorder>
                                <Group justify="space-between" mb="sm">
                                    <Title order={5}>Búsquedas Guardadas</Title>
                                    <Button 
                                        size="xs" 
                                        variant="light" 
                                        color="blue"
                                        onClick={handleCrossSearch}
                                        disabled={selectedSearches.length < 2}
                                    >
                                        Realizar Cruce ({selectedSearches.length} seleccionadas)
                                    </Button>
                                </Group>
                                <Stack>
                                    {savedSearches.map(search => (
                                        <Group key={search.id} justify="space-between">
                                            <Checkbox
                                                label={
                                                    <Text size="sm">
                                                        {search.name} ({search.results.length} lecturas)
                                                        <Text size="xs" color="dimmed" mt={2}>
                                                            Creada: {dayjs(search.created_at).format('DD/MM/YYYY HH:mm')}
                                                        </Text>
                                                    </Text>
                                                }
                                                checked={selectedSearches.includes(search.id)}
                                                onChange={(e) => {
                                                    if (e.currentTarget.checked) {
                                                        setSelectedSearches(prev => [...prev, search.id]);
                                                    } else {
                                                        setSelectedSearches(prev => prev.filter(id => id !== search.id));
                                                    }
                                                }}
                                            />
                                            <ActionIcon 
                                                color="red" 
                                                variant="subtle"
                                                onClick={() => handleDeleteSavedSearch(search.id)}
                                            >
                                                <IconX size={16} />
                                            </ActionIcon>
                                        </Group>
                                    ))}
                                    {savedSearches.length === 0 && (
                                        <Text color="dimmed" size="sm" ta="center">
                                            No hay búsquedas guardadas
                                        </Text>
                                    )}
                                </Stack>
                            </Paper>
                        )}

                        <Box style={{ maxHeight: 'calc(100vh - 400px)', overflow: 'auto' }}>
                            <DataTable<ExtendedLectura>
                                withTableBorder
                                borderRadius="sm"
                                withColumnBorders
                                striped
                                highlightOnHover
                                records={sortedAndPaginatedResults}
                                columns={columns}
                                minHeight={200}
                                totalRecords={processedResults.length}
                                recordsPerPage={pageSize}
                                page={page}
                                onPageChange={handlePageChange}
                                idAccessor="ID_Lectura"
                                selectedRecords={selectedRecords.map(id => processedResults.find(r => r.ID_Lectura === id)).filter(Boolean) as ExtendedLectura[]}
                                onSelectedRecordsChange={handleSelectionChange}
                                noRecordsText={loading ? 'Cargando...' : (results.length === 0 ? 'No se encontraron resultados con los filtros aplicados' : '')}
                                noRecordsIcon={<></>}
                                fetching={loading && !overlayVisible}
                                sortStatus={sortStatus}
                                onSortStatusChange={handleSortStatusChange}
                                style={{ tableLayout: 'fixed' }}
                            />
                            <Group justify="space-between" mt="md">
                                <Select
                                    label="Filas por página"
                                    data={['25', '50', '100']}
                                    value={String(pageSize)}
                                    onChange={handlePageSizeChange}
                                    style={{ width: 150 }}
                                    disabled={loading}
                                />
                                <Text size="sm">Total: {processedResults.length} lecturas</Text>
                            </Group>
                        </Box>
                     </Paper>
                 </Grid.Col>
            </Grid>
            {overlayVisible && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    background: 'rgba(0,0,0,0.35)',
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <Loader size={64} color="blue" />
                    <div style={{
                        marginTop: 32,
                        fontSize: 32,
                        color: '#fff',
                        fontWeight: 600,
                        textShadow: '0 2px 8px rgba(0,0,0,0.4)'
                    }}>
                        {overlayMessage}
                    </div>
                    <Progress value={overlayProgress} size="xl" w={400} mt={32} color="blue" />
                    <div style={{ color: '#fff', marginTop: 8, fontSize: 18 }}>{Math.round(overlayProgress)}%</div>
                </div>
            )}
        </Box>
    );
  }
);

export default AnalisisLecturasPanel; 