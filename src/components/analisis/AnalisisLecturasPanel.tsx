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
import apiClient from '../../services/api';
import type { GpsLectura } from '../../types/data';
import { getLecturasGps } from '../../services/gpsApi';
import appEventEmitter from '../../utils/eventEmitter';
import SaveSearchModal from '../modals/SaveSearchModal';
import SavedSearchesModal from '../modals/SavedSearchesModal';

// --- Estilos específicos (añadidos aquí también) ---
const customStyles = `
  .highlighted-row {
    background-color: var(--mantine-color-blue-0) !important; /* Azul muy claro */
  }
  .highlighted-row:hover {
    background-color: var(--mantine-color-blue-1) !important; /* Un azul ligeramente más oscuro */
  }
  .session-selected-row {
    background-color: var(--mantine-color-yellow-0) !important;
  }
  .session-selected-row:hover {
    background-color: var(--mantine-color-yellow-1) !important;
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
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');
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
    const [overlayMessage, setOverlayMessage] = useState('');
    const [overlayProgress, setOverlayProgress] = useState(0);
    const [showSaveSearchModal, setShowSaveSearchModal] = useState(false);
    const [savingSearch, setSavingSearch] = useState(false);
    const [sessionSelectedRecords, setSessionSelectedRecords] = useState<Set<number | string>>(new Set());
    
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
        setFechaInicio('');
        setFechaFin('');
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
        // Mostrar notificación de carga en la esquina inferior derecha
        const notificationId = 'analisis-loading';
        notifications.show({
            id: notificationId,
            title: 'Procesando búsqueda de lecturas...',
            message: 'Por favor, espera mientras se procesan los resultados.',
            color: 'blue',
            autoClose: false,
            withCloseButton: false,
            position: 'bottom-right',
            style: { minWidth: 350 }
        });
        setOverlayMessage('Procesando búsqueda de lecturas...');
        setOverlayProgress(0);
        setLoading(true);
        try {
            if (!validateFilters()) return;
            
            setResults([]);
            setSelectedRecords([]);
            
            const params = new URLSearchParams();
            
            // Añadir parámetros básicos
            if (fechaInicio) params.append('fecha_inicio', fechaInicio);
            if (fechaFin) params.append('fecha_fin', fechaFin);
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
            setResults(data);
            notifications.update({
                id: notificationId,
                title: 'Búsqueda completada',
                message: `Se encontraron ${data.length} lecturas.`,
                color: 'green',
                autoClose: 2000,
                loading: false,
            });
        } catch (error) {
            console.error('Error en la búsqueda:', error);
            notifications.update({
                id: notificationId,
                title: 'Error en la búsqueda',
                message: error instanceof Error ? error.message : 'Error desconocido',
                color: 'red',
                autoClose: 4000,
                loading: false,
            });
        } finally {
            setLoading(false);
            setOverlayMessage('');
            setOverlayProgress(0);
        }
    };

    // --- Handler de selección ---
    const handleSelectionChange = useCallback((selectedRecords: ExtendedLectura[]) => {
        const ids = selectedRecords.map(record => record.ID_Lectura);
        setSelectedRecords(ids);
        
        // Actualizar el conjunto de selecciones de la sesión
        setSessionSelectedRecords(prev => {
            const newSet = new Set(prev);
            ids.forEach(id => newSet.add(id));
            return newSet;
        });

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
        try {
            // Obtener todas las lecturas seleccionadas con ID válido
            const lecturasParaMarcar = selectedRecords
                .map(id => results.find(r => r.ID_Lectura === id))
                .filter(r => r && typeof r.ID_Lectura === 'number');

            if (lecturasParaMarcar.length === 0) {
                notifications.show({ title: 'Error', message: 'No hay lecturas válidas para marcar.', color: 'red' });
                setSelectedRecords([]);
                return;
            }

            const idsToMark = lecturasParaMarcar.map(r => r!.ID_Lectura);
            let successCount = 0;
            let errorCount = 0;

            for (const id of idsToMark) {
                try {
                    await apiClient.post(`/lecturas/${id}/marcar_relevante`, {
                        caso_id: casoIdFijo
                    });
                    successCount++;
                } catch (error: any) {
                    errorCount++;
                    console.error(`Error marcando lectura ${id}:`, error);
                    notifications.show({
                        title: 'Error al Marcar',
                        message: `No se pudo marcar ID ${id}: ${error.response?.data?.detail || error.message}`,
                        color: 'red'
                    });
                }
            }

            if (successCount > 0) {
                notifications.show({
                    title: 'Éxito',
                    message: `${successCount} de ${idsToMark.length} lecturas marcadas como relevantes.`,
                    color: 'green'
                });
                // Actualizar el estado local para reflejar los cambios
                setResults(prevResults => 
                    prevResults.map(r => 
                        idsToMark.includes(r.ID_Lectura as number) 
                            ? { ...r, es_relevante: true }
                            : r
                    )
                );
            }
            if (errorCount > 0) {
                notifications.show({
                    title: 'Error Parcial',
                    message: `${errorCount} lecturas no se pudieron marcar.`,
                    color: 'orange'
                });
            }
        } catch (error) {
            console.error('Error en handleMarcarRelevante:', error);
            notifications.show({
                title: 'Error',
                message: 'No se pudieron marcar las lecturas como relevantes.',
                color: 'red'
            });
        } finally {
            setSelectedRecords([]);
            setLoading(false);
        }
    };

    const handleGuardarVehiculos = async () => {
        if (selectedRecords.length === 0) return;
        setLoading(true);
        try {
            // Obtener matrículas únicas de las lecturas seleccionadas
            const matriculasUnicas = Array.from(new Set(
                selectedRecords
                    .map(id => {
                        const record = results.find(r => r.ID_Lectura === id);
                        return record?.Matricula;
                    })
                    .filter((m): m is string => typeof m === 'string' && m.trim() !== '')
            ));

            if (matriculasUnicas.length === 0) {
                notifications.show({
                    title: 'Sin matrículas',
                    message: 'No hay matrículas válidas seleccionadas.',
                    color: 'orange'
                });
                return;
            }

            let vehiculosCreados = 0;
            let vehiculosExistentes = 0;
            let errores = 0;

            for (const matricula of matriculasUnicas) {
                try {
                    const response = await apiClient.post('/vehiculos', { Matricula: matricula });
                    if (response.status === 201) {
                        vehiculosCreados++;
                    } else if (response.status === 400 || response.status === 409) {
                        vehiculosExistentes++;
                    }
                } catch (error: any) {
                    if (error.response?.status === 400 || error.response?.status === 409) {
                        vehiculosExistentes++;
                    } else {
                        errores++;
                        console.error(`Error guardando vehículo ${matricula}:`, error);
                    }
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
            }

            // Emitir evento para actualizar la lista de vehículos en otros componentes
            appEventEmitter.emit('listaVehiculosCambiada');
        } catch (error) {
            console.error('Error en handleGuardarVehiculos:', error);
            notifications.show({
                title: 'Error',
                message: 'No se pudieron guardar los vehículos.',
                color: 'red'
            });
        } finally {
            setSelectedRecords([]);
            setLoading(false);
        }
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
    const handleSaveSearch = useCallback(async (searchName: string) => {
        if (!casoIdFijo) {
            notifications.show({
                title: 'Error',
                message: 'No se puede guardar la búsqueda sin un caso seleccionado',
                color: 'red'
            });
            return;
        }

        setSavingSearch(true);
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
            setShowSaveSearchModal(false);
        } catch (error) {
            console.error('Error guardando búsqueda:', error);
            notifications.show({
                title: 'Error',
                message: 'No se pudo guardar la búsqueda',
                color: 'red'
            });
        } finally {
            setSavingSearch(false);
        }
    }, [casoIdFijo, fechaInicio, fechaFin, timeFrom, timeTo, selectedLectores, selectedCarreteras, selectedSentidos, matricula, minPasos, maxPasos, results]);

    // Función para eliminar una búsqueda guardada
    const handleDeleteSavedSearch = async (searchId: number) => {
        try {
            const response = await fetch(`${API_BASE_URL}/saved_searches/${searchId}`, {
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

    // --- Handler para limpiar la tabla de resultados ---
    const handleClearResults = useCallback(() => {
        setResults([]);
        setSelectedRecords([]);
        setInitialLoading(false);
        notifications.show({
            title: 'Tabla Limpiada',
            message: 'Se han eliminado todos los resultados de la tabla.',
            color: 'blue'
        });
    }, []);

    // --- Renderizado ---
    return (
        <Box style={{ position: 'relative' }}>
            <style>{customStyles}</style>
            <Box>
                <Grid>
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
                                 <Group grow>
                                    <TextInput
                                        label="Fecha Inicio"
                                        type="date"
                                        value={fechaInicio}
                                        onChange={e => setFechaInicio(e.target.value)}
                                    />
                                    <TextInput
                                        label="Hora Inicio"
                                        type="time"
                                        value={timeFrom}
                                        onChange={e => setTimeFrom(e.target.value)}
                                    />
                                </Group>
                                <Group grow>
                                    <TextInput
                                        label="Fecha Fin"
                                        type="date"
                                        value={fechaFin}
                                        onChange={e => setFechaFin(e.target.value)}
                                    />
                                    <TextInput
                                        label="Hora Fin"
                                        type="time"
                                        value={timeTo}
                                        onChange={e => setTimeTo(e.target.value)}
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
                                <Button
                                    variant="outline"
                                    color="gray"
                                    leftSection={<IconFilterOff size={16} />}
                                    onClick={handleClearResults}
                                    size="xs"
                                    fullWidth
                                    mt="xs"
                                    disabled={loading || initialLoading}
                                >
                                    Limpiar Tabla de Resultados
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
                                        leftSection={<IconSearch size={16} />}
                                        onClick={() => setShowSaveSearchModal(true)}
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

                            <SavedSearchesModal
                                opened={showSavedSearches}
                                onClose={() => setShowSavedSearches(false)}
                                savedSearches={savedSearches}
                                selectedSearches={selectedSearches}
                                setSelectedSearches={setSelectedSearches}
                                handleCrossSearch={handleCrossSearch}
                                handleDeleteSavedSearch={handleDeleteSavedSearch}
                                onClearResults={handleClearResults}
                            />

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
                                    fetching={loading}
                                    sortStatus={sortStatus}
                                    onSortStatusChange={handleSortStatusChange}
                                    style={{ tableLayout: 'fixed' }}
                                    rowClassName={(record) => {
                                        if (sessionSelectedRecords.has(record.ID_Lectura)) {
                                            return 'session-selected-row';
                                        }
                                        return '';
                                    }}
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
            </Box>
            <SaveSearchModal
                opened={showSaveSearchModal}
                onClose={() => setShowSaveSearchModal(false)}
                onSave={handleSaveSearch}
                loading={savingSearch}
            />
        </Box>
    );
  }
);

export default AnalisisLecturasPanel; 