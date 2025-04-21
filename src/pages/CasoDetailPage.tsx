import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Box, Text, Loader, Alert, Breadcrumbs, Anchor, Button, Group, ActionIcon, Tooltip, TextInput, SimpleGrid, Select, LoadingOverlay, Container, Table, Modal, Stack, Textarea, Title } from '@mantine/core';
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import { IconAlertCircle, IconFiles, IconListDetails, IconMapPin, IconDownload, IconEye, IconTrash, IconSearch, IconClearAll, IconStar, IconStarOff, IconPencil, IconAnalyze, IconFileImport, IconCar, IconFlask, IconBook, IconTable, IconTarget, IconMap, IconRoute, IconDeviceCctv, IconArrowsJoin, IconBookmark, IconHelpCircle, IconRefresh } from '@tabler/icons-react';
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
import LanzaderaPanel from '../components/lanzadera/LanzaderaPanel';

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

// --- Placeholder Types (Incluyendo LanzaderaParams antes de su uso) ---
// TODO: Replace with actual types from panel components
type AnalisisFilters = any;
type AnalisisResults = Lectura[];
type LprAvanzadoFilters = any;
type LprAvanzadoResults = any; // Probablemente resultados agrupados por matrícula
type LanzaderaParams = any; 
type LanzaderaResults = any; // Probablemente los detalles de coocurrencias

// --- Estado inicial para Lanzadera ---
const initialLanzaderaParams: LanzaderaParams = { /* valores por defecto */ };

type DataSourceType = 'LPR' | 'GPS';

// --- NUEVO: Definir las secciones/botones (ACTUALIZADO) --- 
const caseSections = [
    { id: 'analisis-lpr', label: 'Lecturas LPR', icon: IconDeviceCctv },
    { id: 'busqueda-cruzada-lpr', label: 'Búsqueda Cruzada', icon: IconFlask },
    { id: 'lanzadera', label: 'Vehículo Lanzadera', icon: IconArrowsJoin },
    { id: 'lecturas-relevantes', label: 'Lecturas Relevantes', icon: IconBookmark },
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
    Organismo_Regulador?: string | null;
}

// --- Objeto con Textos de Ayuda ---
const helpTexts: { [key: string]: React.ReactNode } = {
  'analisis-lpr': (
    <Box maw={400}> 
      <Text fw={500} mb="sm">Ayuda: Lecturas LPR</Text>
      <Stack gap="xs"> 
        <Text size="xs">
          Esta pestaña muestra las lecturas LPR del caso.
        </Text>
        <Text size="xs">
          <strong>Filtros (izquierda):</strong>
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Busca por matrícula, fechas, horas, lector, carretera, etc.</li>
            <li><strong>Búsqueda Parcial:</strong> Campos como 'Matrícula' permiten búsquedas parciales (p.ej., "1234" encontrará "1234ABC").</li>
            <li><strong>Comodines:</strong> Puedes usar comodines como '%' para representar caracteres desconocidos (p.ej., "12%4AB" podría encontrar "1234ABC" o "1294ABC").</li>
            <li>Aplica los filtros para actualizar la tabla.</li>
          </ul>
        </Text>
        <Text size="xs">
          <strong>Tabla de Resultados:</strong>
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Muestra lecturas que coinciden con filtros.</li>
            <li>Ordena haciendo clic en cabeceras.</li>
            <li>Acciones: Marcar/desmarcar relevante (<IconBookmark size="0.8rem" />), guardar vehículo para comprobaciones posteriores(<IconCar size="0.8rem" />).</li>
          </ul>
        </Text>
      </Stack>
    </Box>
  ),
  'busqueda-cruzada-lpr': (
    <Box maw={400}>
      <Text fw={500} mb="sm">Ayuda: Búsqueda Cruzada</Text>
      <Stack gap="xs">
        <Text size="xs">
          <strong>Propósito:</strong> Identifica vehículos (matrículas) que aparecen en <strong>múltiples conjuntos de filtros diferentes</strong> dentro de este mismo caso. Es útil para encontrar vehículos vistos bajo distintas condiciones (p.ej., en dos zonas diferentes o en dos franjas horarias).
        </Text>
        <Text size="xs">
          <strong>Uso Correcto:</strong>
          <ol style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><strong>Define y Guarda Búsquedas:</strong> Usa los filtros para definir un criterio (p.ej., Lector A entre 8:00-9:00). Haz clic en "Guardar Búsqueda" y dale un nombre descriptivo (p.ej., "Entrada Mañana"). Repite para otros criterios (p.ej., "Salida Tarde").</li>
            <li><strong>Selecciona Búsquedas Guardadas:</strong> Marca las casillas de las búsquedas guardadas que quieres cruzar (mínimo 2).</li>
            <li><strong>Realiza el Cruce:</strong> Haz clic en "Realizar Cruce".</li>
            <li><strong>Resultados:</strong> Se mostrará la lista de matrículas que aparecen en <strong>todas</strong> las búsquedas seleccionadas.</li>
            <li><strong>Ver Lecturas (Opcional):</strong> Puedes seleccionar las matrículas resultantes para ver sus lecturas detalladas.</li>
          </ol>
        </Text>
      </Stack>
    </Box>
  ), 
  'lanzadera': (
    <Box maw={400}>
      <Text fw={500} mb="sm">Ayuda: Vehículo Lanzadera</Text>
      <Stack gap="xs">
        <Text size="xs">
          <strong>Propósito:</strong> Detecta pares de vehículos que viajan juntos de forma consistente (convoyes), basándose en lecturas LPR cercanas en el tiempo y en múltiples ubicaciones o días distintos. Esto puede indicar un vehículo "lanzadera" que guía a otro.
        </Text>
        <Text size="xs">
          <strong>Uso Correcto:</strong>
          <ol style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><strong>Define Parámetros:</strong> Ajusta la "Ventana de Tiempo" (segundos máximos entre lecturas para considerarlas juntas) y las "Mínimas Coincidencias" (cuántas veces deben verse juntos en lectores o días distintos para ser significativo).</li>
            <li><strong>Filtros Opcionales:</strong> Puedes filtrar por fecha/hora o centrarte en una "Matrícula Objetivo" específica.</li>
            <li><strong>Detectar Convoy:</strong> Haz clic en "Detectar Convoy".</li>
            <li><strong>Resultados:</strong>
                <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
                    <li><strong>Lista de Vehículos:</strong> Muestra todas las matrículas involucradas en algún convoy detectado. Puedes seleccionar vehículos para filtrar la tabla de detalles y el mapa.</li>
                    <li><strong>Tabla de Detalles:</strong> Muestra cada instancia donde un par de vehículos seleccionados fueron vistos juntos (lector, hora, etc.).</li>
                    <li><strong>Mapa:</strong> Visualiza geográficamente las ubicaciones de las co-ocurrencias de los vehículos seleccionados.</li>
                </ul>
            </li>
          </ol>
        </Text>
      </Stack>
    </Box>
  ),
  'lecturas-relevantes': (
    <Box maw={400}>
      <Text fw={500} mb="sm">Ayuda: Lecturas Relevantes</Text>
      <Stack gap="xs">
        <Text size="xs">
          <strong>Propósito:</strong> Aquí se recopilan todas las lecturas que has marcado manualmente como importantes (<IconBookmark size="0.8rem"/>) desde la pestaña "Lecturas LPR". Permite centrarse en los eventos clave de la investigación.
        </Text>
        <Text size="xs">
          <strong>Funcionalidades:</strong>
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><strong>Visualización:</strong> Muestra la tabla de lecturas marcadas. Puedes ordenar y paginar como en otras tablas.</li>
            <li><strong>Notas:</strong> Edita (<IconPencil size="0.8rem"/>) o añade notas específicas a cada lectura relevante para recordar por qué es importante.</li>
            <li><strong>Desmarcar:</strong> Elimina (<IconStarOff size="0.8rem"/> o <IconTrash size="0.8rem"/>) la marca de relevancia si una lectura ya no es crucial. Puedes hacerlo individualmente o para una selección.</li>
            <li><strong>Guardar Vehículo:</strong> Guarda rápidamente (<IconCar size="0.8rem"/>) la matrícula de una lectura relevante como un vehículo para seguimiento posterior.</li>
            <li><strong>Selección Múltiple:</strong> Usa las casillas para seleccionar varias lecturas y desmarcarlas o guardar sus vehículos en bloque.</li>
            <li><strong>Refrescar:</strong> Actualiza (<IconRefresh size="0.8rem"/>) la lista si has hecho cambios en otra pestaña.</li>
          </ul>
        </Text>
      </Stack>
    </Box>
  ),
  'vehiculos': (
    <Box maw={400}>
      <Text fw={500} mb="sm">Ayuda: Vehículos</Text>
      <Stack gap="xs">
        <Text size="xs">
          <strong>Propósito:</strong> Gestiona la lista de vehículos (matrículas) asociados a este caso. Un vehículo se añade aquí automáticamente si aparece en las lecturas importadas o si lo guardas manualmente desde otras pestañas.
        </Text>
        <Text size="xs">
          <strong>Funcionalidades:</strong>
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><strong>Listado:</strong> Muestra todos los vehículos vinculados al caso, con detalles como marca, modelo, color, etc. (si se han añadido).</li>
            <li><strong>Lecturas LPR:</strong> Indica cuántas lecturas LPR tiene cada vehículo *dentro de este caso*.</li>
            <li><strong>Editar Detalles:</strong> Modifica (<IconPencil size="0.8rem"/>) la información asociada a un vehículo (marca, modelo, propietario, observaciones, estado de comprobado/sospechoso).</li>
            <li><strong>Ver Lecturas:</strong> Accede (<IconEye size="0.8rem"/>) a una vista filtrada de todas las lecturas (LPR y GPS) de un vehículo específico dentro de este caso.</li>
            <li><strong>Eliminar Vehículo:</strong> Borra (<IconTrash size="0.8rem"/>) un vehículo de la lista del caso (Nota: Esto *no* elimina sus lecturas asociadas, solo el registro del vehículo).</li>
             <li><strong>Refrescar:</strong> Actualiza (<IconRefresh size="0.8rem"/>) la lista si se han hecho cambios (como guardar un vehículo desde otra pestaña).</li>
          </ul>
        </Text>
      </Stack>
    </Box>
  ),
  'mapa': 'Ayuda para Mapa...',
  'archivos': 'Ayuda para Archivos Importados...',
};

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
  const navigate = useNavigate();

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
    const [mapLecturas, setMapLecturas] = useState<LectorConCoordenadas[]>([]);
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
            const response = await apiClient.get<LectorConCoordenadas[]>(`/casos/${idCasoNum}/lecturas_para_mapa`);
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
    }, [activeMainTab, mapLecturas.length, fetchMapLecturas]);

    // --- Columnas Tabla Archivos ---
    const archivosColumns: DataTableColumn<ArchivoExcel>[] = [
        { accessor: 'ID_Archivo', title: 'ID', width: 60, textAlign: 'right' },
        { accessor: 'Nombre_del_Archivo', title: 'Nombre Archivo', render: (a) => <Text truncate="end">{a.Nombre_del_Archivo}</Text> },
        { accessor: 'Tipo_de_Archivo', title: 'Tipo', width: 80 },
        { accessor: 'Fecha_de_Importacion', title: 'Importado', render: (a) => dayjs(a.Fecha_de_Importacion).format('DD/MM/YYYY HH:mm'), width: 150 },
        { accessor: 'Total_Registros', title: 'Registros', width: 100, textAlign: 'right' },
        {
            accessor: 'actions', title: 'Acciones', width: 80, textAlign: 'center',
            render: (archivo) => (
                <Tooltip label="Eliminar Archivo"> 
                    <ActionIcon 
                        color="red" 
                        variant="subtle"
                        onClick={() => handleDeleteArchivo(archivo.ID_Archivo)}
                        loading={deletingArchivoId === archivo.ID_Archivo}
                    >
                        <IconTrash size={16} />
                    </ActionIcon>
                </Tooltip>
            ),
        },
    ];

    // --- Buscar la LecturaRelevante completa para el modal ---
    const lecturaRelevanteParaModal = useMemo(() => {
        if (!editingRelevantNota) return null;
        // Asumiendo que lecturasRelevantes SÍ contiene objetos Lectura con un campo .relevancia
        // o que fetchLecturasRelevantes devuelve objetos que incluyen ID_Lectura, ID_Relevante, Nota, Fecha_Marcada
        // Necesitamos encontrar el objeto correcto basado en ID_Lectura o ID_Relevante.
        // SI lecturasRelevantes CONTIENE objetos tipo Lectura:
        return editingRelevantNota.relevancia // Esto sigue sin ser LecturaRelevante completo
            ? { 
                // Reconstruir un objeto parcial compatible si EditNotaModal SOLO necesita esto:
                ID_Relevante: editingRelevantNota.relevancia.ID_Relevante, 
                Nota: editingRelevantNota.relevancia.Nota, 
                // Añadir campos dummy si el tipo lo exige estrictamente y no se usan?
                // ID_Lectura: editingRelevantNota.ID_Lectura, 
                // Fecha_Marcada: new Date().toISOString() // O algún valor placeholder
               }
            : null;
        // SI lecturasRelevantes CONTIENE objetos tipo LecturaRelevante:
        /*
        return lecturasRelevantes.find(
            lr => lr.ID_Lectura === editingRelevantNota.ID_Lectura && lr.ID_Relevante === editingRelevantNota.relevancia?.ID_Relevante
        ) ?? null;
        */
    }, [editingRelevantNota, lecturasRelevantes]);

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

            <Box mt="lg" style={{ position: 'relative' }}> {/* Añadir position relative al contenedor padre */} 
                {/* --- Renderizado Condicional del Contenido --- */}
                {/* --- Paneles siempre renderizados, pero ocultos/mostrados con CSS --- */}
                
                {/* Pestaña Lecturas LPR */}
                <Box style={{ display: activeMainTab === 'analisis-lpr' ? 'block' : 'none', position: 'relative' }}>
                   {/* --- Icono de Ayuda para esta pestaña --- */}
                   <Tooltip
                        label={helpTexts['analisis-lpr']}
                        multiline withArrow position="bottom-start" offset={8}
                        styles={{ tooltip: { maxWidth: '400px' } }}
                        zIndex={1001} 
                    >
                        <ActionIcon 
                            variant="subtle" 
                            color="blue" 
                            size="lg" 
                            aria-label="Ayuda Lecturas LPR"
                            style={{ position: 'absolute', top: '-35px', right: 0, zIndex: 10 }} 
                        >
                            <IconHelpCircle size="1.8rem" stroke={1.5} />
                        </ActionIcon>
                    </Tooltip>
                    {/* --- Fin Icono Ayuda --- */}

                    <AnalisisLecturasPanel 
                        casoIdFijo={idCasoNum!}
                        permitirSeleccionCaso={false}
                        mostrarTitulo={false}
                        tipoFuenteFijo='LPR'
                        interactedMatriculas={interactedMatriculas}
                        addInteractedMatricula={addInteractedMatricula}
                    />
                </Box>

                {/* Pestaña Búsqueda Cruzada (Añadir icono ayuda aquí después) */} 
                <Box style={{ display: activeMainTab === 'busqueda-cruzada-lpr' ? 'block' : 'none', position: 'relative' }}>
                   {/* --- Icono de Ayuda para esta pestaña --- */}
                   <Tooltip
                        label={helpTexts['busqueda-cruzada-lpr']}
                        multiline withArrow position="bottom-start" offset={8}
                        styles={{ tooltip: { maxWidth: '400px' } }} 
                        zIndex={1001} 
                    >
                        <ActionIcon 
                            variant="subtle" 
                            color="blue" 
                            size="lg" 
                            aria-label="Ayuda Búsqueda Cruzada"
                            style={{ position: 'absolute', top: '-35px', right: 0, zIndex: 10 }} 
                        >
                            <IconHelpCircle size="1.8rem" stroke={1.5} />
                        </ActionIcon>
                    </Tooltip>
                    {/* --- Fin Icono Ayuda --- */}
                    
                   <LprAvanzadoPanel 
                        casoId={idCasoNum!}
                        interactedMatriculas={interactedMatriculas}
                        addInteractedMatricula={addInteractedMatricula}
                    />
                </Box>

                {/* Pestaña Lanzadera */}
                <Box style={{ display: activeMainTab === 'lanzadera' ? 'block' : 'none', position: 'relative' }}>
                    {/* --- Icono de Ayuda para esta pestaña --- */}
                    <Tooltip
                        label={helpTexts['lanzadera']}
                        multiline withArrow position="bottom-start" offset={8}
                        styles={{ tooltip: { maxWidth: '400px' } }} 
                        zIndex={1001} 
                    >
                        <ActionIcon 
                            variant="subtle" 
                            color="blue" 
                            size="lg" 
                            aria-label="Ayuda Vehículo Lanzadera"
                            style={{ position: 'absolute', top: '-35px', right: 0, zIndex: 10 }} 
                        >
                            <IconHelpCircle size="1.8rem" stroke={1.5} />
                        </ActionIcon>
                    </Tooltip>
                    {/* --- Fin Icono Ayuda --- */}
                    
                    <LanzaderaPanel casoId={idCasoNum!} />
                </Box>

                {/* ... Resto de las pestañas (añadir icono ayuda en cada una) ... */}
                 <Box style={{ display: activeMainTab === 'lecturas-relevantes' ? 'block' : 'none', position: 'relative' }}>
                     {/* --- Icono de Ayuda para esta pestaña --- */}
                     <Tooltip
                         label={helpTexts['lecturas-relevantes']}
                         multiline withArrow position="bottom-start" offset={8}
                         styles={{ tooltip: { maxWidth: '400px' } }} 
                         zIndex={1001} 
                     >
                         <ActionIcon 
                             variant="subtle" 
                             color="blue" 
                             size="lg" 
                             aria-label="Ayuda Lecturas Relevantes"
                             style={{ position: 'absolute', top: '-35px', right: 0, zIndex: 10 }} 
                         >
                             <IconHelpCircle size="1.8rem" stroke={1.5} />
                         </ActionIcon>
                     </Tooltip>
                     {/* --- Fin Icono Ayuda --- */} 
                     
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
                         onRefresh={fetchLecturasRelevantes}
                     />
                 </Box>

                 <Box style={{ display: activeMainTab === 'vehiculos' ? 'block' : 'none', position: 'relative' }}>
                     {/* --- Icono de Ayuda para esta pestaña --- */}
                     <Tooltip
                         label={helpTexts['vehiculos']}
                         multiline withArrow position="bottom-start" offset={8}
                         styles={{ tooltip: { maxWidth: '400px' } }} 
                         zIndex={1001} 
                     >
                         <ActionIcon 
                             variant="subtle" 
                             color="blue" 
                             size="lg" 
                             aria-label="Ayuda Vehículos"
                             style={{ position: 'absolute', top: '-35px', right: 0, zIndex: 10 }} 
                         >
                             <IconHelpCircle size="1.8rem" stroke={1.5} />
                         </ActionIcon>
                     </Tooltip>
                     {/* --- Fin Icono Ayuda --- */} 
                     
                     <VehiculosPanel casoId={idCasoNum!} />
                 </Box>

                 <Box style={{ display: activeMainTab === 'mapa' ? 'block' : 'none', position: 'relative' }}>
                     {/* TODO: Añadir icono ayuda aquí */} 
                     <Box style={{ position: 'relative', height: '500px' }}>
                         <LoadingOverlay visible={loadingMapLecturas} />
                         {errorMapLecturas && (
                             <Alert color="red" title="Error en Mapa">{errorMapLecturas}</Alert>
                         )}
                         {!loadingMapLecturas && !errorMapLecturas && (
                             <CasoMap lectores={mapLecturas} />
                         )}
                     </Box>
                 </Box>

                 <Box style={{ display: activeMainTab === 'archivos' ? 'block' : 'none', position: 'relative' }}>
                    {/* TODO: Añadir icono ayuda aquí */} 
                     <Group justify="space-between" mb="md">
                       <Title order={4}>Archivos Importados</Title>
                       <Button 
                           leftSection={<IconFileImport size={16} />} 
                           onClick={() => navigate('/importar', { state: { preselectedCasoId: idCasoNum } })}
                           variant='light'
                           size="sm"
                       >
                           Cargar Nuevos Archivos
                       </Button>
                     </Group>
                     
                     <LoadingOverlay visible={loadingArchivos} />
                     {errorArchivos && <Alert color="red" title="Error" mb="md">{errorArchivos}</Alert>}
                     
                     <DataTable<ArchivoExcel>
                         records={archivos}
                         columns={archivosColumns}
                         minHeight={150}
                         withTableBorder
                         borderRadius="sm"
                         striped
                         highlightOnHover
                         idAccessor="ID_Archivo"
                         noRecordsText="No hay archivos importados para este caso."
                         fetching={loadingArchivos}
                     />
                 </Box>
            </Box>

            {/* Modales */}
            <EditNotaModal
                opened={!!editingRelevantNota}
                onClose={handleRelevantCloseEditModal}
                lecturaRelevante={lecturaRelevanteParaModal as LecturaRelevante | null}
                onSave={async (idRelevante, nuevaNota) => { 
                    await handleRelevantGuardarNota(); 
                }} 
            />

        </Container>
  );
}

export default CasoDetailPage; 