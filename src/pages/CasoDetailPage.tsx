import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Box, Text, Loader, Alert, Breadcrumbs, Anchor, Button, Group, ActionIcon, Tooltip, TextInput, SimpleGrid, Select, LoadingOverlay, Container, Table, Modal, Stack, Textarea, Title } from '@mantine/core';
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import { IconAlertCircle, IconFiles, IconListDetails, IconMapPin, IconDownload, IconEye, IconTrash, IconSearch, IconClearAll, IconStar, IconStarOff, IconPencil, IconAnalyze, IconFileImport, IconCar, IconFlask, IconBook, IconTable, IconTarget, IconMap } from '@tabler/icons-react';
import { getCasoById } from '../services/casosApi';
import { getArchivosPorCaso, deleteArchivo } from '../services/archivosApi';
import { notifications } from '@mantine/notifications';
import { openConfirmModal } from '@mantine/modals';
import type { Caso, ArchivoExcel, Lectura, Lector, LecturaRelevante } from '../types/data';
import apiClient from '../services/api';
import dayjs from 'dayjs';
import _ from 'lodash';
import appEventEmitter from '../utils/eventEmitter';

// Importar componentes
import 'leaflet/dist/leaflet.css';
import CasoMap from '../components/maps/CasoMap';
import LecturaFilters, { FilterState } from '../components/filters/LecturaFilters';
import EditNotaModal from '../components/modals/EditNotaModal';
import AnalisisLecturasPanel from '../components/analisis/AnalisisLecturasPanel';
import LprAvanzadoPanel from '../components/lpr_avanzado/LprAvanzadoPanel';
import LecturasRelevantesPanel from '../components/caso/LecturasRelevantesPanel';
import VehiculosPanel from '../components/vehiculos/VehiculosPanel';

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

// --- NUEVO: Definir las secciones/botones --- 
const caseSections = [
    { id: 'analisis-lpr', label: 'Análisis LPR', icon: IconAnalyze },
    { id: 'busqueda-cruzada-lpr', label: 'Búsqueda Cruzada', icon: IconFlask },
    { id: 'lecturas-relevantes', label: 'Lecturas Relevantes', icon: IconStar },
    { id: 'vehiculos', label: 'Vehículos', icon: IconCar },
    { id: 'mapa', label: 'Mapa', icon: IconMap },
    { id: 'archivos', label: 'Archivos Importados', icon: IconFiles },
];

// --- Añadir tipo para lecturas de mapa --- 
interface LectorConCoordenadas {
    ID_Lector: string;
    Nombre?: string | null;
    Coordenada_X: number;
    Coordenada_Y: number;
    Carretera?: string | null;
    Provincia?: string | null;
}

interface LecturaConCoordenadas {
    ID_Lectura: number;
    ID_Archivo: number;
    Matricula: string;
    Fecha_y_Hora: string;
    Coordenada_X: number; 
    Coordenada_Y: number;
    Lector?: LectorConCoordenadas | null;
    Tipo_Fuente: string;
    Carril?: string | null | undefined;
    Velocidad?: number | null;
}

function CasoDetailPage() {
  const { idCaso } = useParams<{ idCaso: string }>();
    const idCasoNum = idCaso ? parseInt(idCaso, 10) : null;
  const [caso, setCaso] = useState<Caso | null>(null);
  const [loadingCaso, setLoadingCaso] = useState(true);
  const [errorCaso, setErrorCaso] = useState<string | null>(null);
  const [archivos, setArchivos] = useState<ArchivoExcel[]>([]);
  const [loadingArchivos, setLoadingArchivos] = useState(true);
  const [errorArchivos, setErrorArchivos] = useState<string | null>(null);
  const [deletingArchivoId, setDeletingArchivoId] = useState<number | null>(null);

    // El estado activeMainTab se mantiene, pero controla la sección activa
    const [activeMainTab, setActiveMainTab] = useState<string | null>('analisis-lpr');

    // ---- NUEVO: Estado compartido para filas interactuadas ----
    const [interactedMatriculas, setInteractedMatriculas] = useState<Set<string>>(new Set());

    // ---- NUEVO: Función para añadir matrículas interactuadas (CORREGIDA) ----
    const addInteractedMatricula = useCallback((matriculas: string[]) => {
        setInteractedMatriculas(prev => {
            const newSet = new Set(prev);
            matriculas.forEach(m => newSet.add(m));
            return newSet;
        });
    }, []);

    // --- ESTADO Y LÓGICA PARA LECTURAS RELEVANTES (MOVIDO AQUÍ) ---
    const [lecturasRelevantes, setLecturasRelevantes] = useState<Lectura[]>([]);
    const [relevantLoading, setRelevantLoading] = useState(true);
    const [relevantPage, setRelevantPage] = useState(1);
    const RELEVANT_PAGE_SIZE = 15; // Definir tamaño de página
    const [relevantSortStatus, setRelevantSortStatus] = useState<DataTableSortStatus<Lectura>>({ columnAccessor: 'Fecha_y_Hora', direction: 'asc' });
    const [selectedRelevantRecordIds, setSelectedRelevantRecordIds] = useState<number[]>([]);
    const [editingRelevantNota, setEditingRelevantNota] = useState<Lectura | null>(null); // Estado para saber qué lectura se edita
    const [notaInputValue, setNotaInputValue] = useState(''); // Estado para el valor del input de nota

    // Función para cargar lecturas relevantes
    const fetchLecturasRelevantes = useCallback(async () => {
        if (!idCasoNum) return;
        setRelevantLoading(true);
        try {
            const response = await apiClient.get<Lectura[]>(`/casos/${idCasoNum}/lecturas_relevantes`);
            setLecturasRelevantes(response.data || []);
            console.log('[CasoDetailPage] Lecturas relevantes cargadas:', response.data?.length);
        } catch (error) {
            console.error("Error fetching relevant lecturas:", error);
            notifications.show({ title: 'Error', message: 'No se pudieron cargar las lecturas relevantes.', color: 'red' });
            setLecturasRelevantes([]);
        } finally {
            setRelevantLoading(false);
        }
    }, [idCasoNum]);

    // Cargar inicialmente o cuando cambie la pestaña
    useEffect(() => {
        if (activeMainTab === 'lecturas-relevantes') {
             fetchLecturasRelevantes();
        }
    }, [idCasoNum, activeMainTab, fetchLecturasRelevantes]);

     // Handlers para LecturasRelevantesPanel (movidos aquí)
     const handleRelevantPageChange = (page: number) => setRelevantPage(page);
     const handleRelevantSortChange = (status: DataTableSortStatus<Lectura>) => setRelevantSortStatus(status);
     const handleRelevantSelectionChange = (selectedIds: number[]) => setSelectedRelevantRecordIds(selectedIds);

     const handleRelevantEditNota = (lectura: Lectura) => {
         setEditingRelevantNota(lectura);
         setNotaInputValue(lectura.relevancia?.Nota || '');
     };

     const handleRelevantCloseEditModal = () => {
         setEditingRelevantNota(null);
         setNotaInputValue('');
     };

     const handleRelevantGuardarNota = async () => {
         if (!editingRelevantNota || !editingRelevantNota.relevancia) return;
         const idRelevante = editingRelevantNota.relevancia.ID_Relevante;
         setRelevantLoading(true); // Podrías usar un loading específico del modal
         try {
             await apiClient.put(`/lecturas_relevantes/${idRelevante}/nota`, { Nota: notaInputValue });
             notifications.show({ title: 'Éxito', message: 'Nota actualizada.', color: 'green' });
             handleRelevantCloseEditModal();
             fetchLecturasRelevantes(); // Recargar
         } catch (error: any) {
             notifications.show({ title: 'Error', message: error.response?.data?.detail || 'No se pudo guardar la nota.', color: 'red' });
         } finally {
             setRelevantLoading(false);
         }
     };

     const handleRelevantDesmarcar = (idLectura: number) => {
         openConfirmModal({
             title: 'Confirmar Desmarcar',
             centered: true,
             children: <Text size="sm">¿Seguro que quieres desmarcar esta lectura ({idLectura}) como relevante?</Text>,
             labels: { confirm: 'Desmarcar', cancel: 'Cancelar' },
             confirmProps: { color: 'red' },
             onConfirm: async () => {
                 setRelevantLoading(true);
                 try {
                     await apiClient.delete(`/lecturas/${idLectura}/desmarcar_relevante`);
                     notifications.show({ title: 'Éxito', message: `Lectura ${idLectura} desmarcada.`, color: 'green' });
                     fetchLecturasRelevantes(); // Recargar
                 } catch (error: any) {
                     notifications.show({ title: 'Error', message: error.response?.data?.detail || 'No se pudo desmarcar.', color: 'red' });
                 } finally {
                     setRelevantLoading(false);
                 }
             },
         });
     };

     const handleRelevantDesmarcarSeleccionados = () => {
         const idsToUnmark = [...selectedRelevantRecordIds];
         if (idsToUnmark.length === 0) return;
         openConfirmModal({
             title: 'Confirmar Desmarcar Selección',
             centered: true,
             children: <Text size="sm">¿Estás seguro de desmarcar {idsToUnmark.length} lecturas seleccionadas?</Text>,
             labels: { confirm: 'Desmarcar Seleccionadas', cancel: 'Cancelar' },
             confirmProps: { color: 'red' },
             onConfirm: async () => {
                 setRelevantLoading(true);
                 const results = await Promise.allSettled(
                     idsToUnmark.map(id => apiClient.delete(`/lecturas/${id}/desmarcar_relevante`))
                 );
                 let successes = 0;
                 let errors = 0;
                 results.forEach((result, index) => {
                     if (result.status === 'fulfilled') successes++;
                     else {
                         errors++;
                         console.error(`Error desmarcando ID ${idsToUnmark[index]}:`, result.reason);
                     }
                 });
                 if (successes > 0) {
                     notifications.show({ title: 'Desmarcado Completado', message: `${successes} lecturas desmarcadas.` + (errors > 0 ? ` ${errors} fallaron.` : ''), color: errors > 0 ? 'orange' : 'green' });
                 }
                 setSelectedRelevantRecordIds([]);
                 fetchLecturasRelevantes(); // Recargar
                 setRelevantLoading(false);
             },
         });
     };

     const handleRelevantGuardarVehiculo = (lectura: Lectura) => {
        if (!lectura.Matricula) {
            notifications.show({ title: 'Error', message: 'La lectura no tiene matrícula.', color: 'red' }); return;
        }
         openConfirmModal({
             title: 'Confirmar Guardar Vehículo', centered: true,
             children: <Text size="sm">¿Guardar vehículo con matrícula {lectura.Matricula}?</Text>,
             labels: { confirm: 'Guardar', cancel: 'Cancelar' }, confirmProps: { color: 'green' },
             onConfirm: async () => {
                 setRelevantLoading(true);
                 try {
                     await apiClient.post('/vehiculos', { Matricula: lectura.Matricula });
                     notifications.show({ title: 'Éxito', message: `Vehículo ${lectura.Matricula} guardado.`, color: 'green' });
                     appEventEmitter.emit('listaVehiculosCambiada');
                 } catch (error: any) {
                     if (error.response?.status === 400 || error.response?.status === 409) {
                         notifications.show({ title: 'Vehículo Existente', message: `El vehículo ${lectura.Matricula} ya existe.`, color: 'blue' });
                         appEventEmitter.emit('listaVehiculosCambiada');
                     } else {
                          notifications.show({ title: 'Error', message: error.response?.data?.detail || 'No se pudo guardar.', color: 'red' });
                     }
                 } finally {
                     setRelevantLoading(false);
                 }
             },
         });
     };

     const handleRelevantGuardarVehiculosSeleccionados = () => {
         const lecturasSeleccionadas = lecturasRelevantes.filter(l => selectedRelevantRecordIds.includes(l.ID_Lectura));
         const matriculasUnicas = Array.from(new Set(lecturasSeleccionadas.map(l => l.Matricula).filter(m => !!m)));
         if (matriculasUnicas.length === 0) {
             notifications.show({ title: 'Sin Matrículas', message: 'Ninguna lectura seleccionada tiene matrícula válida.', color: 'orange' }); return;
         }
         openConfirmModal({
             title: 'Confirmar Guardar Vehículos', centered: true,
             children: <Text size="sm">¿Guardar {matriculasUnicas.length} vehículo(s) único(s) ({matriculasUnicas.join(', ')})?</Text>,
             labels: { confirm: 'Guardar Seleccionados', cancel: 'Cancelar' }, confirmProps: { color: 'green' },
             onConfirm: async () => {
                 setRelevantLoading(true);
                 const results = await Promise.allSettled(
                     matriculasUnicas.map(matricula => apiClient.post('/vehiculos', { Matricula: matricula }))
                 );
                 let creados = 0, existentes = 0, errores = 0;
                 results.forEach(result => {
                     if (result.status === 'fulfilled') { creados++; }
                     else { 
                         if (result.reason?.response?.status === 400 || result.reason?.response?.status === 409) existentes++;
                         else {
                             errores++;
                             console.error("Error guardando vehículo:", result.reason);
                         }
                     }
                 });
                 let msg = '';
                 if (creados > 0) msg += `${creados} guardados. `;
                 if (existentes > 0) msg += `${existentes} ya existían. `;
                 if (errores > 0) msg += `${errores} errores.`;
                 notifications.show({ title: "Guardar Vehículos Completado", message: msg.trim(), color: errores > 0 ? 'orange' : 'green' });
                 appEventEmitter.emit('listaVehiculosCambiada');
                 setSelectedRelevantRecordIds([]);
                 setRelevantLoading(false);
             },
         });
     };
    // --- FIN ESTADO Y LÓGICA PARA LECTURAS RELEVANTES ---

    // Función para cargar archivos (necesaria para carga inicial y después de borrar)
  const fetchArchivos = useCallback(async () => {
        if (!idCasoNum || isNaN(idCasoNum)) return;
        setLoadingArchivos(true);
        setErrorArchivos(null);
        try {
           const data = await getArchivosPorCaso(idCasoNum.toString());
          setArchivos(data);
        } catch (err: any) {
           setErrorArchivos(err.response?.data?.detail || err.message || 'Error al cargar los archivos.');
        } finally {
          setLoadingArchivos(false);
        }
   }, [idCasoNum]);

    // Carga inicial
  useEffect(() => {
        if (idCasoNum && !isNaN(idCasoNum)) {
      const fetchCasoDetalle = async () => {
        setLoadingCaso(true);
        setErrorCaso(null);
        try {
                    const data = await getCasoById(idCasoNum);
          setCaso(data);
        } catch (err: any) {
                    setErrorCaso(err.response?.data?.detail || err.message || 'Error al cargar detalles del caso.');
        } finally {
          setLoadingCaso(false);
        }
      };
      fetchCasoDetalle();
      fetchArchivos();
    } else {
            // Resetear todo si no hay idCaso
            setCaso(null); setArchivos([]); setErrorCaso('No se proporcionó ID de caso.'); setErrorArchivos(null);
            setLoadingCaso(false); setLoadingArchivos(false);
        }
    }, [idCasoNum, fetchArchivos]);

    // Handler para borrar archivo (ahora usa fetchArchivos)
  const handleDeleteArchivo = async (archivoId: number) => {
        if (!window.confirm(`¿Seguro de eliminar archivo ID ${archivoId} y sus lecturas?`)) return;
    setDeletingArchivoId(archivoId);
    try {
      await deleteArchivo(archivoId);
            notifications.show({ title: 'Archivo Eliminado', message: `Archivo ${archivoId} eliminado.`, color: 'teal' });
      await fetchArchivos();
    } catch (err: any) {
            notifications.show({ title: 'Error al Eliminar', message: err.response?.data?.detail || 'No se pudo eliminar el archivo.', color: 'red' });
    } finally {
      setDeletingArchivoId(null);
    }
  };

    // --- Estados para Lecturas del Mapa --- 
    const [mapLecturas, setMapLecturas] = useState<LecturaConCoordenadas[]>([]);
    const [loadingMapLecturas, setLoadingMapLecturas] = useState(false);
    const [errorMapLecturas, setErrorMapLecturas] = useState<string | null>(null);

    // --- NUEVO: Función para cargar lecturas para el mapa --- 
    const fetchMapLecturas = useCallback(async () => {
        if (!idCasoNum) return;
        console.log("[CasoMap] Fetching lecturas para mapa del caso:", idCasoNum);
        setLoadingMapLecturas(true);
        setErrorMapLecturas(null);
        try {
            // Asumimos un endpoint que devuelve las lecturas (LPR/GPS) con coordenadas
            // para un caso específico. Podría necesitar ajustes según tu API.
            const response = await apiClient.get<LecturaConCoordenadas[]>(`/casos/${idCasoNum}/lecturas_para_mapa`);
            setMapLecturas(response.data || []);
            console.log("[CasoMap] Lecturas cargadas:", response.data?.length);
        } catch (err: any) {
            console.error("Error fetching map lecturas:", err);
            setErrorMapLecturas(err.response?.data?.detail || 'No se pudieron cargar los datos para el mapa.');
            setMapLecturas([]);
        } finally {
            setLoadingMapLecturas(false);
        }
    }, [idCasoNum]);

    // --- useEffect para cargar datos del mapa --- 
    useEffect(() => {
        // Cargar solo si la pestaña está activa Y no hay datos cargados
        if (activeMainTab === 'mapa' && mapLecturas.length === 0 && !loadingMapLecturas) {
            fetchMapLecturas();
        }
    }, [activeMainTab, mapLecturas.length, loadingMapLecturas, fetchMapLecturas]);

    // --- Renderizado --- 
    if (loadingCaso) return <Loader />; 
    if (errorCaso) return <Alert color="red" title="Error al cargar el caso">{errorCaso}</Alert>;
    if (!caso) return <Alert color="orange">Caso no encontrado.</Alert>;

  const breadcrumbs = (
        <Breadcrumbs>
            <Anchor component={Link} to="/">Dashboard</Anchor>
      <Anchor component={Link} to="/casos">Gestión de Casos</Anchor>
            <Text>{caso.Nombre_del_Caso} ({caso.Año})</Text>
    </Breadcrumbs>
  );

    return (
        <Container fluid>
        {breadcrumbs}
            <Text size="xl" fw={700} mt="md" mb="lg">Detalles del Caso: {caso.Nombre_del_Caso} ({caso.Año})</Text>

            {/* --- NUEVO: Grupo de Botones de Navegación --- */}
            <Group mb="xl">
                {caseSections.map((section) => (
                    <Button
                        key={section.id}
                        variant={activeMainTab === section.id ? 'filled' : 'light'} // Resaltar activo
                        onClick={() => setActiveMainTab(section.id)}
                        leftSection={<section.icon size={16} />}
                        color="gray" // Color base para todos
                        styles={(theme) => ({
                            root: {
                                 // Asegurar contraste para el botón activo
                                 backgroundColor: activeMainTab === section.id 
                                     ? theme.colors[theme.primaryColor][6] // Color primario relleno
                                     : undefined,
                                 color: activeMainTab === section.id
                                     ? theme.white // Texto blanco en activo
                                     : undefined,
                                 '&:hover': {
                                     backgroundColor: activeMainTab !== section.id 
                                         ? theme.colors.gray[1] // Hover sutil para no activos
                                         : undefined,
                                 },
                            },
                            label: {
                                fontWeight: activeMainTab === section.id ? 600 : 400,
                            }
                        })}
                    >
                        {section.label}
                    </Button>
                ))}
            </Group>
            {/* --- FIN Grupo de Botones --- */}

            {/* --- Renderizado Condicional del Contenido --- */}
            <Box mt="lg">
                {activeMainTab === 'analisis-lpr' && (
                    <AnalisisLecturasPanel 
                        // casoId={idCasoNum!} // Prop temporalmente comentada para revisar 
                        permitirSeleccionCaso={false}
                        mostrarTitulo={false}
                        tipoFuenteFijo='LPR'
                        interactedMatriculas={interactedMatriculas}
                        addInteractedMatricula={addInteractedMatricula}
                        // Pasar idCasoNum si es necesario por otra prop (revisar definición)
                        casoIdFijo={idCasoNum!} // Suponiendo que esta es la prop correcta
                    />
                )}
                {activeMainTab === 'busqueda-cruzada-lpr' && (
                    <LprAvanzadoPanel 
                        casoId={idCasoNum!}
                        interactedMatriculas={interactedMatriculas}
                        addInteractedMatricula={addInteractedMatricula}
                    />
                )}
                {activeMainTab === 'lecturas-relevantes' && (
                    <LecturasRelevantesPanel
                        lecturas={lecturasRelevantes}
                        loading={relevantLoading}
                        totalRecords={Array.isArray(lecturasRelevantes) ? lecturasRelevantes.length : 0}
                        page={relevantPage}
                        onPageChange={handleRelevantPageChange}
                        pageSize={RELEVANT_PAGE_SIZE}
                        sortStatus={relevantSortStatus}
                        onSortStatusChange={handleRelevantSortChange}
                        selectedRecordIds={selectedRelevantRecordIds}
                        onSelectionChange={handleRelevantSelectionChange}
                        onEditNota={handleRelevantEditNota}
                        onDesmarcar={handleRelevantDesmarcar}
                        onDesmarcarSeleccionados={handleRelevantDesmarcarSeleccionados}
                        onGuardarVehiculo={handleRelevantGuardarVehiculo}
                        onGuardarVehiculosSeleccionados={handleRelevantGuardarVehiculosSeleccionados}
                    />
                )}
                {activeMainTab === 'vehiculos' && (
                    <VehiculosPanel casoId={idCasoNum!} />
                )}
                {activeMainTab === 'analisis-gps' && (
                    <AnalisisLecturasPanel
                        casoIdFijo={idCasoNum!}
                        permitirSeleccionCaso={false}
                        mostrarTitulo={false}
                        tipoFuenteFijo='GPS'
                        interactedMatriculas={interactedMatriculas}
                        addInteractedMatricula={addInteractedMatricula}
                    />
                )}
                {activeMainTab === 'mapa' && (
                    <Box style={{ position: 'relative', minHeight: '400px' }}>
                        <LoadingOverlay visible={loadingMapLecturas} />
                        {errorMapLecturas && (
                            <Alert color="red" title="Error en Mapa">{errorMapLecturas}</Alert>
                        )}
                        {!loadingMapLecturas && !errorMapLecturas && (
                            <CasoMap lecturas={mapLecturas} />
                        )}
                    </Box>
                )}
                {activeMainTab === 'archivos' && (
                    <Box>
                        <Title order={4} mb="md">Archivos Importados</Title>
                        {/* Botón Cargar Archivos (Moverlo dentro del Box o ajustar posición) */}
                        <Group justify="flex-end" mb="md">
                            <Button 
                                component={Link} 
                                to={`/importar?casoId=${idCasoNum}`}
                                leftSection={<IconFileImport size={16} />} 
                                variant="outline"
                                disabled={!idCasoNum} // Deshabilitar si no hay ID
                            >
                                Cargar Nuevos Archivos para este Caso
                            </Button>
                        </Group>

                        {loadingArchivos && <Loader />}
                        {errorArchivos && <Alert color="red">{errorArchivos}</Alert>}
                        {!loadingArchivos && !errorArchivos && (
                            <Table striped highlightOnHover withTableBorder verticalSpacing="sm">
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
                                    {archivos.map((archivo) => (
                                        <Table.Tr key={archivo.ID_Archivo}>
                                            <Table.Td>{archivo.ID_Archivo}</Table.Td>
                                            <Table.Td>{archivo.Nombre_del_Archivo}</Table.Td>
                                            <Table.Td>{archivo.Tipo_de_Archivo}</Table.Td>
                                            <Table.Td>{archivo.Fecha_de_Importacion ? new Date(archivo.Fecha_de_Importacion).toLocaleDateString() : '-'}</Table.Td>
                                            <Table.Td>
                                                <Group gap="xs">
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
                                    ))}
                                </Table.Tbody>
                            </Table>
                        )} 
                    </Box> // Llave que faltaba o estaba mal puesta?
                )} 
            </Box>

            {/* --- Modal para Editar Nota (Ahora vive aquí) --- */}
            <Modal
                opened={editingRelevantNota !== null}
                onClose={handleRelevantCloseEditModal}
                title={`Editar Nota - Lectura ${editingRelevantNota?.ID_Lectura}`}
                centered
            >
                <Stack>
                    <Textarea
                        label="Nota"
                        value={notaInputValue}
                        onChange={(event) => setNotaInputValue(event.currentTarget.value)}
                        autosize minRows={3}
                    />
                    <Group justify="flex-end">
                        <Button variant="default" onClick={handleRelevantCloseEditModal}>Cancelar</Button>
                        <Button onClick={handleRelevantGuardarNota} loading={relevantLoading}>Guardar Nota</Button>
                    </Group>
                </Stack>
            </Modal>

        </Container>
  );
}

export default CasoDetailPage; 