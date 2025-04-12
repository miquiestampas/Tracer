import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Box, Text, Loader, Alert, Tabs, Breadcrumbs, Anchor, Table, Button, Group, ActionIcon, Tooltip, Pagination, TextInput, SimpleGrid, Select, LoadingOverlay } from '@mantine/core';
import { IconAlertCircle, IconFiles, IconListDetails, IconMapPin, IconDownload, IconEye, IconTrash, IconSearch, IconClearAll, IconStar, IconStarOff, IconPencil } from '@tabler/icons-react';
import { getCasoById } from '../services/casosApi';
import { getArchivosPorCaso, deleteArchivo, getLecturas, marcarLecturaRelevante, desmarcarLecturaRelevante, actualizarNotaLecturaRelevante } from '../services/archivosApi';
import { notifications } from '@mantine/notifications';
import type { Caso, ArchivoExcel, Lectura, LecturaRelevante } from '../types/data';
import apiClient from '../services/api';

// Importar componentes
import 'leaflet/dist/leaflet.css';
import CasoMap from '../components/maps/CasoMap';
import LecturaFilters, { FilterState } from '../components/filters/LecturaFilters';
import EditNotaModal from '../components/modals/EditNotaModal';


// Definir estado inicial para filtros
const initialFilterState: FilterState = {
    matricula: '',
    fechaInicio: '',
    horaInicio: '',
    fechaFin: '',
    horaFin: '',
    lectorId: '',
    soloRelevantes: false,
};

type DataSourceType = 'LPR' | 'GPS';

function CasoDetailPage() {
    const { idCaso } = useParams<{ idCaso: string }>();
    const [caso, setCaso] = useState<Caso | null>(null);
    const [loadingCaso, setLoadingCaso] = useState(true);
    const [errorCaso, setErrorCaso] = useState<string | null>(null);

    const [archivos, setArchivos] = useState<ArchivoExcel[]>([]);
    const [loadingArchivos, setLoadingArchivos] = useState(true);
    const [errorArchivos, setErrorArchivos] = useState<string | null>(null);
    const [deletingArchivoId, setDeletingArchivoId] = useState<number | null>(null);

    // Estados separados para LPR y GPS
    const [lprLecturasList, setLprLecturasList] = useState<Lectura[]>([]);
    const [gpsLecturasList, setGpsLecturasList] = useState<Lectura[]>([]);
    const [loadingLprLecturas, setLoadingLprLecturas] = useState(false);
    const [loadingGpsLecturas, setLoadingGpsLecturas] = useState(false);
    const [errorLprLecturas, setErrorLprLecturas] = useState<string | null>(null);
    const [errorGpsLecturas, setErrorGpsLecturas] = useState<string | null>(null);

    // Estados de filtros separados
    const [lprFilters, setLprFilters] = useState<FilterState>(initialFilterState);
    const [gpsFilters, setGpsFilters] = useState<FilterState>(initialFilterState);

    // Estados para relevancia y modal
    const [updatingRelevanciaId, setUpdatingRelevanciaId] = useState<number | null>(null);
    const [isEditNotaModalOpen, setIsEditNotaModalOpen] = useState(false);
    const [editingNotaLectura, setEditingNotaLectura] = useState<LecturaRelevante | null>(null);

    // Estados para controlar pestañas
    const [activeMainTab, setActiveMainTab] = useState<string>('LPR'); // Pestaña principal activa
    const [activeLprSubTab, setActiveLprSubTab] = useState<string>('lecturas'); // Sub-pestaña LPR
    const [activeGpsSubTab, setActiveGpsSubTab] = useState<string>('lecturas'); // Sub-pestaña GPS

    // --- Estados LPR ---
    const [lprPagination, setLprPagination] = useState({ page: 1, pageSize: 100, totalCount: 0 });

    // --- Estados GPS ---
    const [gpsPagination, setGpsPagination] = useState({ page: 1, pageSize: 100, totalCount: 0 });

    // --- Funciones Auxiliares y de Carga ---

    const fetchArchivos = useCallback(async () => {
        if (!idCaso) return;
        setLoadingArchivos(true);
        setErrorArchivos(null);
        try {
            const data = await getArchivosPorCaso(idCaso);
            setArchivos(data);
        } catch (err: any) {
            setErrorArchivos(err.response?.data?.detail || err.message || 'Error al cargar los archivos.');
        } finally {
            setLoadingArchivos(false);
        }
    }, [idCaso]);

    const combineDateTime = useCallback((dateStr: string, timeStr: string): string | null => {
        if (!dateStr) return null;
        let parsedDate: Date | null = null;
        const dateParts = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dateParts) {
            const day = parseInt(dateParts[1], 10);
            const month = parseInt(dateParts[2], 10);
            const year = parseInt(dateParts[3], 10);
            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                try {
                    parsedDate = new Date(Date.UTC(year, month - 1, day));
                    if (isNaN(parsedDate.getTime()) || parsedDate.getUTCDate() !== day || parsedDate.getUTCMonth() !== month - 1 || parsedDate.getUTCFullYear() !== year) {
                        parsedDate = null;
                    }
                } catch (e) { parsedDate = null; }
            }
        } else {
            try {
                const maybeDate = new Date(dateStr);
                if (!isNaN(maybeDate.getTime())) { parsedDate = maybeDate; }
            } catch (e) { /* ignore */ }
        }
        if (!parsedDate) { return null; }
        const dateISOString = parsedDate.toISOString().split('T')[0];
        if (timeStr && /^[0-2][0-9]:[0-5][0-9]$/.test(timeStr)) {
            try {
                const dateTimeISOString = `${dateISOString}T${timeStr}:00.000Z`;
                const finalDateTime = new Date(dateTimeISOString);
                if (!isNaN(finalDateTime.getTime())) { return dateTimeISOString; }
            } catch (e) { return dateISOString; }
        }
        return dateISOString;
    }, []);

    // Modificar fetchLecturas para manejar paginación y la nueva respuesta
    const fetchLecturas = useCallback(async (
        tipo: DataSourceType,
        filtros: FilterState,
        page: number,      // Página actual (1-indexada)
        pageSize: number   // Tamaño de página
    ) => {
        if (!idCaso) return;

        const setLoading = tipo === 'LPR' ? setLoadingLprLecturas : setLoadingGpsLecturas;
        const setError = tipo === 'LPR' ? setErrorLprLecturas : setErrorGpsLecturas;
        const setList = tipo === 'LPR' ? setLprLecturasList : setGpsLecturasList;
        const setPagination = tipo === 'LPR' ? setLprPagination : setGpsPagination;

        setLoading(true);
        setError(null);

        const skip = (page - 1) * pageSize; // Calcular skip (0-indexado)
        const limit = pageSize;

        try {
            const params: any = { caso_id: idCaso, tipo_fuente: tipo, skip, limit };
            if (filtros.matricula) params.matricula = filtros.matricula;
            if (filtros.lectorId && tipo === 'LPR') params.lector_id = filtros.lectorId;
            if (filtros.soloRelevantes) params.solo_relevantes = true;

            const fechaHoraInicioStr = combineDateTime(filtros.fechaInicio || '', filtros.horaInicio || '');
            const fechaHoraFinStr = combineDateTime(filtros.fechaFin || '', filtros.horaFin || '');
            if (fechaHoraInicioStr) params.fecha_hora_inicio = fechaHoraInicioStr;
            if (fechaHoraFinStr) params.fecha_hora_fin = fechaHoraFinStr;

            console.log(`Parámetros enviados a getLecturas (${tipo}):`, params);
            
            // Llamar a la API (ahora devuelve {total_count, lecturas})
            const response = await getLecturas(params);
            
            setList(response.lecturas); // Actualizar la lista con los datos de la página
            setPagination(prev => ({ ...prev, totalCount: response.total_count })); // Actualizar el conteo total

        } catch (err: any) {
            setError(err.response?.data?.detail || err.message || `Error al cargar lecturas ${tipo}.`);
            setList([]);
            setPagination(prev => ({ ...prev, totalCount: 0 })); // Resetear conteo en error
        } finally {
            setLoading(false);
        }
    }, [idCaso, combineDateTime]); // Dependencias

    // useEffect inicial - ahora llama a fetchLecturas con la página 1
    useEffect(() => {
        if (idCaso) {
            const fetchCasoDetalle = async () => {
                 setLoadingCaso(true);
                 setErrorCaso(null);
                 try {
                    const casoIdNum = parseInt(idCaso, 10);
                    if (isNaN(casoIdNum)) { throw new Error('ID de caso inválido.'); }
                    const data = await getCasoById(casoIdNum);
                    setCaso(data);
                 } catch (err: any) {
                    setErrorCaso(err.response?.data?.detail || err.message || 'Error al cargar detalles del caso.');
                 } finally {
                    setLoadingCaso(false);
                 }
            };
            fetchCasoDetalle();
            fetchArchivos();
            // Cargar ambos tipos de lecturas inicialmente sin filtros
            fetchLecturas('LPR', initialFilterState, lprPagination.page, lprPagination.pageSize);
            fetchLecturas('GPS', initialFilterState, gpsPagination.page, gpsPagination.pageSize);
        } else {
            // Resetear todo si no hay idCaso
            setCaso(null); setArchivos([]); setLprLecturasList([]); setGpsLecturasList([]);
            setErrorCaso('No se proporcionó ID de caso.'); setErrorArchivos(null); setErrorLprLecturas(null); setErrorGpsLecturas(null);
            setLoadingCaso(false); setLoadingArchivos(false); setLoadingLprLecturas(false); setLoadingGpsLecturas(false);
        }
    }, [idCaso, fetchArchivos, fetchLecturas]); // Simplificar deps para carga inicial

    // useEffects para recargar cuando cambian los filtros o la paginación
    // Separado para LPR
    useEffect(() => {
         if (!idCaso) return; // No hacer nada si no hay caso
         // Este efecto se dispara si cambian los filtros LPR o la página/tamaño LPR
         console.log("useEffect LPR disparado", lprFilters, lprPagination);
         fetchLecturas('LPR', lprFilters, lprPagination.page, lprPagination.pageSize);
    }, [idCaso, lprFilters, lprPagination.page, lprPagination.pageSize, fetchLecturas]); // Incluir fetchLecturas

    // Separado para GPS
    useEffect(() => {
         if (!idCaso) return; // No hacer nada si no hay caso
         console.log("useEffect GPS disparado", gpsFilters, gpsPagination);
         fetchLecturas('GPS', gpsFilters, gpsPagination.page, gpsPagination.pageSize);
    }, [idCaso, gpsFilters, gpsPagination.page, gpsPagination.pageSize, fetchLecturas]); // Incluir fetchLecturas


    // --- Handlers actualizados ---

    const handleDeleteArchivo = async (archivoId: number) => {
        if (!window.confirm(`¿Seguro de eliminar archivo ID ${archivoId} y sus lecturas?`)) return;
        setDeletingArchivoId(archivoId);
        try {
            await deleteArchivo(archivoId);
            notifications.show({ title: 'Archivo Eliminado', message: `Archivo ${archivoId} eliminado.`, color: 'teal' });
            await fetchArchivos();
            // Recargar ambas listas con su paginación actual
            await fetchLecturas('LPR', lprFilters, lprPagination.page, lprPagination.pageSize);
            await fetchLecturas('GPS', gpsFilters, gpsPagination.page, gpsPagination.pageSize);
        } catch (err: any) {
            notifications.show({ title: 'Error al Eliminar', message: err.response?.data?.detail || 'No se pudo eliminar el archivo.', color: 'red' });
        } finally {
            setDeletingArchivoId(null);
        }
    };

    // Filtrar ahora resetea a la página 1
    const handleFiltrarClick = (tipo: DataSourceType) => {
        if (tipo === 'LPR') {
            setLprPagination(prev => ({ ...prev, page: 1 })); // Volver a la página 1
            // El useEffect se encargará de llamar a fetchLecturas
        } else {
            setGpsPagination(prev => ({ ...prev, page: 1 })); // Volver a la página 1
            // El useEffect se encargará de llamar a fetchLecturas
        }
    };

    // Limpiar resetea filtros y paginación
    const handleLimpiarClick = (tipo: DataSourceType) => {
        if (tipo === 'LPR') {
            setLprFilters(initialFilterState);
            setLprPagination(prev => ({ ...prev, page: 1 })); // Resetear pag y filtros
        } else {
            setGpsFilters(initialFilterState);
            setGpsPagination(prev => ({ ...prev, page: 1 })); // Resetear pag y filtros
        }
        // El useEffect se encargará de llamar a fetchLecturas
    };

    // Cambios en filtros (sin cambios en la lógica aquí, el useEffect reacciona)
    const handleFilterChange = (tipo: DataSourceType, newFilters: Partial<FilterState>) => {
        if (tipo === 'LPR') {
            setLprFilters(prev => ({ ...prev, ...newFilters }));
        } else {
            setGpsFilters(prev => ({ ...prev, ...newFilters }));
        }
        // Opcional: decidir si filtrar automáticamente al cambiar un filtro
        // Por ahora, se requiere clic en "Filtrar"
    };

    // Handlers para paginación
    const handlePageChange = (tipo: DataSourceType, newPage: number) => {
        if (tipo === 'LPR') {
            setLprPagination(prev => ({ ...prev, page: newPage }));
        } else {
            setGpsPagination(prev => ({ ...prev, page: newPage }));
        }
        // El useEffect correspondiente se disparará
    };

    const handlePageSizeChange = (tipo: DataSourceType, newSizeStr: string | null) => {
        const newSize = parseInt(newSizeStr || '100', 10);
        if (isNaN(newSize) || newSize <= 0) return;

        if (tipo === 'LPR') {
            setLprPagination(prev => ({ ...prev, pageSize: newSize, page: 1 })); // Volver a pág 1
        } else {
            setGpsPagination(prev => ({ ...prev, pageSize: newSize, page: 1 })); // Volver a pág 1
        }
        // El useEffect correspondiente se disparará
    };

    const handleToggleRelevancia = async (lectura: Lectura) => {
        setUpdatingRelevanciaId(lectura.ID_Lectura);
        const esRelevanteActual = !!lectura.relevancia;
        const tipoFuente = lectura.Tipo_Fuente; // 'LPR' o 'GPS'

        try {
            let relevanciaActualizada: LecturaRelevante | null = null;
            if (esRelevanteActual) {
                await desmarcarLecturaRelevante(lectura.ID_Lectura);
                relevanciaActualizada = null;
                notifications.show({ title: 'Lectura Desmarcada', message: `Lectura ${lectura.ID_Lectura} desmarcada.`, color: 'gray' });
            } else {
                relevanciaActualizada = await marcarLecturaRelevante(lectura.ID_Lectura, null);
                notifications.show({ title: 'Lectura Marcada', message: `Lectura ${lectura.ID_Lectura} marcada.`, color: 'yellow' });
            }

            // Actualizar la lista correcta (LPR o GPS)
            const setList = tipoFuente === 'LPR' ? setLprLecturasList : setGpsLecturasList;
            setList(currentLecturas =>
                currentLecturas.map(l =>
                    l.ID_Lectura === lectura.ID_Lectura ? { ...l, relevancia: relevanciaActualizada } : l
                )
            );

        } catch (error: any) {
            notifications.show({ title: 'Error', message: error.response?.data?.detail || `Error al ${esRelevanteActual ? 'desmarcar' : 'marcar'} lectura.`, color: 'red' });
        } finally {
            setUpdatingRelevanciaId(null);
        }
    };

    const handleOpenEditNotaModal = (lecturaRelevante: LecturaRelevante) => {
        setEditingNotaLectura(lecturaRelevante);
        setIsEditNotaModalOpen(true);
    };

    const handleCloseEditNotaModal = () => {
        setIsEditNotaModalOpen(false);
        setTimeout(() => setEditingNotaLectura(null), 200);
    };

    const handleUpdateNota = async (idRelevante: number, nuevaNota: string | null) => {
        // Necesitamos saber si la lectura original era LPR o GPS para actualizar la lista correcta
        // Buscamos en ambas listas (menos eficiente, pero funciona)
        let lecturaOriginal: Lectura | undefined =
            lprLecturasList.find(l => l.relevancia?.ID_Relevante === idRelevante) ||
            gpsLecturasList.find(l => l.relevancia?.ID_Relevante === idRelevante);

        if (!lecturaOriginal) {
             notifications.show({ title: 'Error', message: 'No se encontró la lectura original para actualizar la nota.', color: 'red' });
             throw new Error("Lectura original no encontrada");
        }
        const tipoFuente = lecturaOriginal.Tipo_Fuente;

        try {
            const relevanciaActualizada = await actualizarNotaLecturaRelevante(idRelevante, nuevaNota);

            const setList = tipoFuente === 'LPR' ? setLprLecturasList : setGpsLecturasList;
            setList(currentLecturas =>
                currentLecturas.map(l =>
                    l.relevancia?.ID_Relevante === idRelevante ? { ...l, relevancia: relevanciaActualizada } : l
                )
            );

            notifications.show({ title: 'Nota Actualizada', message: 'Nota actualizada correctamente.', color: 'green' });
            handleCloseEditNotaModal();
        } catch (error: any) {
            notifications.show({ title: 'Error al Actualizar', message: error.response?.data?.detail || 'No se pudo actualizar la nota.', color: 'red' });
            throw error; // Relanzar para que el modal sepa del error
        }
    };


    // --- Renderizado ---

    const renderLecturasTable = (lecturas: Lectura[] | undefined, isLoading: boolean, error: string | null, paginationState: any, handlePageChangeCallback: (newPage: number) => void, handlePageSizeChangeCallback: (newSize: string | null) => void) => {
        
        // **Añadir comprobación para evitar error .map sobre undefined**
        if (!Array.isArray(lecturas) && !isLoading && !error) {
            // Si no es array, no está cargando y no hay error, mostrar mensaje o nada
             return <Text c="dimmed" ta="center" mt="md">No hay lecturas para mostrar con los filtros actuales.</Text>; 
        }
        
        // Mantener la lógica de loader y error
        if (isLoading) return <Loader my="xl" />; 
        if (error) return <Alert color="red" title="Error al cargar lecturas">{error}</Alert>;

        // Ahora sabemos que 'lecturas' es un array (puede ser vacío) si llegamos aquí
        const rows = (lecturas || []).map((lectura) => { // Usar (lecturas || []) por seguridad extra
            const fechaHora = new Date(lectura.Fecha_y_Hora).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' });
            const esRelevante = !!lectura.relevancia;
            const notaRelevante = lectura.relevancia?.Nota;

            return (
                <Table.Tr key={lectura.ID_Lectura}>
                    {/* Icono de Relevancia */}
                    <Table.Td w={50} ta="center">
                         <Tooltip label={esRelevante ? "Desmarcar como relevante" : "Marcar como relevante"}>
                            <ActionIcon 
                                variant={esRelevante ? "filled" : "subtle"} 
                                color={esRelevante ? "yellow" : "gray"} 
                                onClick={() => handleToggleRelevancia(lectura)}
                                loading={updatingRelevanciaId === lectura.ID_Lectura}
                                >
                                {esRelevante ? <IconStar size={18} /> : <IconStarOff size={18} />}
                            </ActionIcon>
                        </Tooltip>
                    </Table.Td>
                    {/* Nota Relevante */}
                     <Table.Td>
                         {esRelevante && (
                            <Group gap="xs" wrap="nowrap">
                                <Tooltip label={notaRelevante || "Añadir/Editar nota"}>
                                     <ActionIcon variant="subtle" size="sm" onClick={() => handleOpenEditNotaModal(lectura.relevancia!)}>
                                          <IconPencil size={14}/>
                                     </ActionIcon>
                                </Tooltip>
                                <Text size="xs" lineClamp={2}>{notaRelevante || <Text c="dimmed" fs="italic">Sin nota</Text>}</Text>
                            </Group>
                         )}
                    </Table.Td>
                    <Table.Td>{lectura.Matricula}</Table.Td>
                    <Table.Td>{fechaHora}</Table.Td>
                    <Table.Td>{lectura.ID_Lector || '-'}</Table.Td>
                    <Table.Td>{lectura.Carril || '-'}</Table.Td>
                    <Table.Td>{lectura.Velocidad != null ? `${lectura.Velocidad} km/h` : '-'}</Table.Td>
                    <Table.Td>{lectura.Coordenada_Y?.toFixed(6) || '-'}</Table.Td> {/* Lat */}
                    <Table.Td>{lectura.Coordenada_X?.toFixed(6) || '-'}</Table.Td> {/* Lon */}
                </Table.Tr>
            );
        });

        const totalPages = Math.ceil(paginationState.totalCount / paginationState.pageSize);

        return (
            <>
                <Table striped highlightOnHover withTableBorder mt="md" verticalSpacing="sm">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Rel.</Table.Th>
                            <Table.Th>Nota</Table.Th>
                            <Table.Th>Matrícula</Table.Th>
                            <Table.Th>Fecha y Hora</Table.Th>
                            <Table.Th>Lector</Table.Th>
                            <Table.Th>Carril</Table.Th>
                            <Table.Th>Velocidad</Table.Th>
                            <Table.Th>Latitud</Table.Th>
                            <Table.Th>Longitud</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {rows.length > 0 ? rows : (
                            <Table.Tr><Table.Td colSpan={9} align="center">No se encontraron lecturas con los filtros aplicados.</Table.Td></Table.Tr>
                        )}
                    </Table.Tbody>
                </Table>
                {totalPages > 0 && (
                     <Group justify="space-between" mt="md">
                          <Select
                                label="Filas por página"
                                data={['50', '100', '250', '500']}
                                value={String(paginationState.pageSize)}
                                onChange={handlePageSizeChangeCallback}
                                style={{ width: 150 }}
                                disabled={isLoading}
                            />
                         <Pagination
                            total={totalPages}
                            value={paginationState.page}
                            onChange={handlePageChangeCallback}
                            disabled={isLoading}
                        />
                        <Text size="sm">Total: {paginationState.totalCount} lecturas</Text>
                    </Group>
                 )}
            </>
        );
    };


    // --- Renderizado Principal ---

    const breadcrumbs = (
        <Breadcrumbs mb="lg">
          <Anchor component={Link} to="/casos">Gestión de Casos</Anchor>
          <Text>{loadingCaso ? 'Cargando...' : (caso ? `${caso.ID_Caso} - ${caso.Nombre_del_Caso}` : 'Error')}</Text>
        </Breadcrumbs>
      );

    if (loadingCaso) return <Box>{breadcrumbs}<Loader /></Box>;
    if (errorCaso) return <Box>{breadcrumbs}<Alert color="red" title="Error">{errorCaso}</Alert></Box>;
    if (!caso) return <Box>{breadcrumbs}<Text>No se encontró el caso.</Text></Box>;

    // Renderizado de Archivos (similar a antes)
    const archivosRows = archivos.map((archivo) => (
        <Table.Tr key={archivo.ID_Archivo}>
          <Table.Td>{archivo.ID_Archivo}</Table.Td>
          <Table.Td>{archivo.Nombre_del_Archivo}</Table.Td>
          <Table.Td>{archivo.Tipo_de_Archivo}</Table.Td>
          <Table.Td>{archivo.Fecha_de_Importacion ? new Date(archivo.Fecha_de_Importacion).toLocaleDateString() : '-'}</Table.Td>
          <Table.Td>
              <Group gap="xs">
                   {/* Iconos Acciones Archivo (Descargar, Eliminar) */}
                   <Tooltip label="Descargar Archivo Original">
                        <ActionIcon variant="subtle" color="blue" component="a" href={`${apiClient.defaults.baseURL}/archivos/${archivo.ID_Archivo}/download`} target="_blank">
                            <IconDownload size={16} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Eliminar Archivo y Lecturas">
                        <ActionIcon variant="subtle" color="red" onClick={() => handleDeleteArchivo(archivo.ID_Archivo)} loading={deletingArchivoId === archivo.ID_Archivo} disabled={deletingArchivoId !== null}>
                            <IconTrash size={16} />
                        </ActionIcon>
                    </Tooltip>
              </Group>
          </Table.Td>
        </Table.Tr>
      ));

    // Calcular total de páginas
    const totalLprPages = Math.ceil(lprPagination.totalCount / lprPagination.pageSize);
    const totalGpsPages = Math.ceil(gpsPagination.totalCount / gpsPagination.pageSize);

    return (
        <Box>
            {breadcrumbs}
            <Text size="xl" fw={500} c="tracerBlue.7" mb="lg">
                Detalle del Caso: {caso.Nombre_del_Caso} ({caso.Año})
            </Text>

            <Tabs value={activeMainTab} onChange={(value) => setActiveMainTab(value || 'LPR')} keepMounted={false}>
                <Tabs.List>
                    <Tabs.Tab value="archivos" leftSection={<IconFiles size="1rem" />}>Archivos Importados</Tabs.Tab>
                    <Tabs.Tab value="LPR" leftSection={<IconListDetails size="1rem" />}>Análisis LPR</Tabs.Tab>
                    <Tabs.Tab value="GPS" leftSection={<IconMapPin size="1rem" />}>Análisis GPS</Tabs.Tab>
                </Tabs.List>

                {/* Panel Archivos */}
                <Tabs.Panel value="archivos" pt="xs">
                    {loadingArchivos && <Loader my="md" />}
                    {errorArchivos && <Alert icon={<IconAlertCircle size="1rem" />} title="Error al cargar archivos" color="red" my="md">{errorArchivos}</Alert>}
                    {!loadingArchivos && !errorArchivos && (
                        <Table striped highlightOnHover withTableBorder mt="md">
                            <Table.Thead>
                                <Table.Tr>
                                <Table.Th>ID Archivo</Table.Th>
                                <Table.Th>Nombre Archivo</Table.Th>
                                <Table.Th>Tipo</Table.Th>
                                <Table.Th>Fecha Importación</Table.Th>
                                <Table.Th>Acciones</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {archivosRows.length > 0 ? archivosRows : (
                                <Table.Tr><Table.Td colSpan={5} align="center">No hay archivos importados.</Table.Td></Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    )}
                </Tabs.Panel>

                {/* Panel LPR */}
                <Tabs.Panel value="LPR" pt="lg">
                    <LecturaFilters
                        filters={lprFilters}
                        onFilterChange={(updates) => handleFilterChange('LPR', updates)}
                        onFiltrar={() => handleFiltrarClick('LPR')}
                        onLimpiar={() => handleLimpiarClick('LPR')}
                        loading={loadingLprLecturas}
                        showLectorIdFilter={true}
                    />
                    <Tabs value={activeLprSubTab} onChange={(value) => setActiveLprSubTab(value || 'lecturas')} mt="md">
                        <Tabs.List>
                            <Tabs.Tab value="lecturas">Tabla Lecturas LPR</Tabs.Tab>
                            <Tabs.Tab value="mapa">Mapa LPR</Tabs.Tab>
                        </Tabs.List>
                        <Tabs.Panel value="lecturas" pt="xs">
                            {renderLecturasTable(
                                lprLecturasList, 
                                loadingLprLecturas, 
                                errorLprLecturas, 
                                lprPagination, 
                                (newPage) => handlePageChange('LPR', newPage), 
                                (newSize) => handlePageSizeChange('LPR', newSize)
                            )}
                        </Tabs.Panel>
                        <Tabs.Panel value="mapa" pt="xs" style={{ minHeight: '70vh' }}>
                             <LoadingOverlay visible={loadingLprLecturas} overlayProps={{ blur: 2 }} />
                             {!loadingLprLecturas && errorLprLecturas && <Alert color="red" title="Error">{errorLprLecturas}</Alert>}
                             {!loadingLprLecturas && !errorLprLecturas && <CasoMap lecturas={lprLecturasList} />}
                        </Tabs.Panel>
                    </Tabs>
                </Tabs.Panel>

                {/* Panel GPS */}
                <Tabs.Panel value="GPS" pt="lg">
                     <LecturaFilters
                        filters={gpsFilters}
                        onFilterChange={(updates) => handleFilterChange('GPS', updates)}
                        onFiltrar={() => handleFiltrarClick('GPS')}
                        onLimpiar={() => handleLimpiarClick('GPS')}
                        loading={loadingGpsLecturas}
                        showLectorIdFilter={false}
                    />
                    <Tabs value={activeGpsSubTab} onChange={(value) => setActiveGpsSubTab(value || 'lecturas')} mt="md">
                        <Tabs.List>
                            <Tabs.Tab value="lecturas">Tabla Lecturas GPS</Tabs.Tab>
                            <Tabs.Tab value="mapa">Mapa GPS</Tabs.Tab>
                        </Tabs.List>
                         <Tabs.Panel value="lecturas" pt="xs">
                            {renderLecturasTable(
                                gpsLecturasList, 
                                loadingGpsLecturas, 
                                errorGpsLecturas, 
                                gpsPagination, 
                                (newPage) => handlePageChange('GPS', newPage), 
                                (newSize) => handlePageSizeChange('GPS', newSize)
                            )}
                        </Tabs.Panel>
                        <Tabs.Panel value="mapa" pt="xs" style={{ minHeight: '70vh' }}>
                            <LoadingOverlay visible={loadingGpsLecturas} overlayProps={{ blur: 2 }} />
                             {!loadingGpsLecturas && errorGpsLecturas && <Alert color="red" title="Error">{errorGpsLecturas}</Alert>}
                             {!loadingGpsLecturas && !errorGpsLecturas && <CasoMap lecturas={gpsLecturasList} />}
                        </Tabs.Panel>
                    </Tabs>
                </Tabs.Panel>

            </Tabs>

            {/* Modal para editar nota */}
            <EditNotaModal
                opened={isEditNotaModalOpen}
                onClose={handleCloseEditNotaModal}
                lecturaRelevante={editingNotaLectura}
                onSave={handleUpdateNota}
            />

        </Box>
    );
}

export default CasoDetailPage; 