import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Box, Text, Loader, Alert, Tabs, Breadcrumbs, Anchor, Table, Button, Group, ActionIcon, Tooltip, Pagination, TextInput, SimpleGrid, Select, LoadingOverlay, Container } from '@mantine/core';
import { IconAlertCircle, IconFiles, IconListDetails, IconMapPin, IconDownload, IconEye, IconTrash, IconSearch, IconClearAll, IconStar, IconStarOff, IconPencil, IconAnalyze, IconFileImport, IconCar, IconFlask, IconBook } from '@tabler/icons-react';
import { getCasoById } from '../services/casosApi';
import { getArchivosPorCaso, deleteArchivo } from '../services/archivosApi';
import { notifications } from '@mantine/notifications';
import type { Caso, ArchivoExcel, Lectura, LecturaRelevante } from '../types/data';
import apiClient from '../services/api';
import dayjs from 'dayjs';

// Importar componentes
import 'leaflet/dist/leaflet.css';
import CasoMap from '../components/maps/CasoMap';
import LecturaFilters, { FilterState } from '../components/filters/LecturaFilters';
import EditNotaModal from '../components/modals/EditNotaModal';
import AnalisisLecturasPanel from '../components/analisis/AnalisisLecturasPanel';
import LprAvanzadoPanel from '../components/lpr_avanzado/LprAvanzadoPanel';
import LecturasRelevantesPanel from '../components/caso/LecturasRelevantesPanel';


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
    const idCasoNum = idCaso ? parseInt(idCaso, 10) : null;
    const [caso, setCaso] = useState<Caso | null>(null);
    const [loadingCaso, setLoadingCaso] = useState(true);
    const [errorCaso, setErrorCaso] = useState<string | null>(null);
    const [archivos, setArchivos] = useState<ArchivoExcel[]>([]);
    const [loadingArchivos, setLoadingArchivos] = useState(true);
    const [errorArchivos, setErrorArchivos] = useState<string | null>(null);
    const [deletingArchivoId, setDeletingArchivoId] = useState<number | null>(null);
    
    // Estado para pestaña principal
    const [activeMainTab, setActiveMainTab] = useState<string | null>('analisis-lpr');

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

            <Tabs value={activeMainTab} onChange={setActiveMainTab} keepMounted>
                <Tabs.List>
                    <Tabs.Tab value="analisis-lpr" leftSection={<IconAnalyze size={14} />}>Análisis LPR</Tabs.Tab>
                    <Tabs.Tab value="analisis-gps" leftSection={<IconMapPin size={14} />}>Análisis GPS</Tabs.Tab>
                    <Tabs.Tab value="busqueda-cruzada-lpr" leftSection={<IconFlask size={14} />}>Búsqueda Cruzada LPR</Tabs.Tab>
                    <Tabs.Tab value="lecturas-relevantes" leftSection={<IconBook size={14} />}>Lecturas Relevantes</Tabs.Tab>
                    <Tabs.Tab value="mapa" leftSection={<IconMapPin size={14} />}>Mapa General</Tabs.Tab>
                    <Tabs.Tab value="archivos" leftSection={<IconFiles size={14} />}>Archivos ({archivos.length})</Tabs.Tab>
                    <Tabs.Tab value="vehiculos" leftSection={<IconCar size={14} />}>Vehículos</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="analisis-lpr" pt="lg">
                    {idCasoNum ? (
                        <AnalisisLecturasPanel 
                            casoIdFijo={idCasoNum} 
                            permitirSeleccionCaso={false}
                            mostrarTitulo={false}
                            tipoFuenteFijo='LPR'
                        />
                    ) : (
                        <Alert color="orange">ID de caso no válido.</Alert>
                    )}
                </Tabs.Panel>

                <Tabs.Panel value="analisis-gps" pt="lg">
                    {idCasoNum ? (
                        <AnalisisLecturasPanel 
                            casoIdFijo={idCasoNum} 
                            permitirSeleccionCaso={false}
                            mostrarTitulo={false}
                            tipoFuenteFijo='GPS'
                        />
                    ) : (
                        <Alert color="orange">ID de caso no válido.</Alert>
                    )}
                </Tabs.Panel>

                <Tabs.Panel value="busqueda-cruzada-lpr" pt="lg">
                    {idCasoNum ? (
                        <LprAvanzadoPanel casoId={idCasoNum} />
                    ) : (
                        <Alert color="orange">ID de caso no válido.</Alert>
                    )}
                </Tabs.Panel>

                <Tabs.Panel value="lecturas-relevantes" pt="lg">
                    {idCasoNum ? (
                        <LecturasRelevantesPanel casoId={idCasoNum} />
                    ) : (
                        <Alert color="orange">ID de caso no válido.</Alert>
                    )}
                </Tabs.Panel>

                <Tabs.Panel value="mapa" pt="lg">
                    <Alert color="blue">Componente de mapa pendiente de revisión/integración.</Alert>
                </Tabs.Panel>
                
                <Tabs.Panel value="archivos" pt="lg">
                    <Group justify="flex-end" mb="md">
                        <Button 
                            component={Link} 
                            to={`/importar?casoId=${idCasoNum}`}
                            leftSection={<IconFileImport size={16} />}
                        >
                            Cargar Nuevos Archivos para este Caso
                        </Button>
                    </Group>
                    
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
                                {archivos.map((archivo) => (
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
                                ))}
                            </Table.Tbody>
                        </Table>
                    )}
                </Tabs.Panel>
                
                <Tabs.Panel value="vehiculos" pt="lg">
                    <Alert color="cyan">Pestaña de gestión/visualización de vehículos asociados al caso (pendiente).</Alert>
                </Tabs.Panel>
            </Tabs>
        </Container>
    );
}

export default CasoDetailPage; 