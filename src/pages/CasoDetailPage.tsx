import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Box, Text, Loader, Alert, Tabs, Breadcrumbs, Anchor, Table, Button, Group, ActionIcon, Tooltip, Pagination } from '@mantine/core';
import { IconAlertCircle, IconFiles, IconListDetails, IconMapPin, IconDownload, IconEye, IconTrash } from '@tabler/icons-react';
import { getCasoById } from '../services/casosApi';
import { getArchivosPorCaso, deleteArchivo, getLecturas } from '../services/archivosApi';
import { notifications } from '@mantine/notifications';
import type { Caso, ArchivoExcel, Lectura } from '../types/data';
import apiClient from '../services/api';

function CasoDetailPage() {
  const { idCaso } = useParams<{ idCaso: string }>();
  const [caso, setCaso] = useState<Caso | null>(null);
  const [loadingCaso, setLoadingCaso] = useState(true);
  const [errorCaso, setErrorCaso] = useState<string | null>(null);

  const [archivos, setArchivos] = useState<ArchivoExcel[]>([]);
  const [loadingArchivos, setLoadingArchivos] = useState(true);
  const [errorArchivos, setErrorArchivos] = useState<string | null>(null);
  const [deletingArchivoId, setDeletingArchivoId] = useState<number | null>(null);

  const [lecturasList, setLecturasList] = useState<Lectura[]>([]);
  const [loadingLecturas, setLoadingLecturas] = useState(true);
  const [errorLecturas, setErrorLecturas] = useState<string | null>(null);

  const fetchArchivos = useCallback(async () => {
    if (idCaso) {
        setLoadingArchivos(true);
        setErrorArchivos(null);
        try {
          const data = await getArchivosPorCaso(idCaso);
          setArchivos(data);
        } catch (err: any) {
          setErrorArchivos(err.response?.data?.detail || err.message || 'Error al cargar los archivos del caso.');
        } finally {
          setLoadingArchivos(false);
        }
    } else {
        setErrorArchivos('ID de caso no disponible para cargar archivos.');
        setLoadingArchivos(false);
    }
  }, [idCaso]);

  const fetchLecturasDelCaso = useCallback(async () => {
    if (idCaso) {
      setLoadingLecturas(true);
      setErrorLecturas(null);
      try {
        const data = await getLecturas({ caso_id: idCaso });
        setLecturasList(data);
      } catch (err: any) {
        setErrorLecturas(err.response?.data?.detail || err.message || 'Error al cargar las lecturas del caso.');
        setLecturasList([]);
      } finally {
        setLoadingLecturas(false);
      }
    } else {
      setErrorLecturas('ID de caso no disponible para cargar lecturas.');
      setLoadingLecturas(false);
    }
  }, [idCaso]);

  useEffect(() => {
    if (idCaso) {
      const fetchCasoDetalle = async () => {
        setLoadingCaso(true);
        setErrorCaso(null);
        try {
          const casoIdNum = parseInt(idCaso, 10);
          if (isNaN(casoIdNum)) {
            throw new Error('ID de caso inválido.');
          }
          const data = await getCasoById(casoIdNum);
          setCaso(data);
        } catch (err: any) {
          setErrorCaso(err.response?.data?.detail || err.message || 'Error al cargar los detalles del caso.');
        } finally {
          setLoadingCaso(false);
        }
      };
      fetchCasoDetalle();
      fetchArchivos();
      fetchLecturasDelCaso();
    } else {
      setErrorCaso('No se proporcionó ID de caso.');
      setLoadingCaso(false);
      setErrorArchivos('No se proporcionó ID de caso para cargar archivos.');
      setLoadingArchivos(false);
      setErrorLecturas('No se proporcionó ID de caso para cargar lecturas.');
      setLoadingLecturas(false);
    }
  }, [idCaso, fetchArchivos, fetchLecturasDelCaso]);

  const handleDeleteArchivo = async (archivoId: number) => {
    if (!window.confirm(`¿Estás seguro de que quieres eliminar el archivo ID ${archivoId} y todas sus lecturas asociadas? Esta acción no se puede deshacer.`)) {
      return;
    }
    setDeletingArchivoId(archivoId);
    try {
      await deleteArchivo(archivoId);
      notifications.show({
        title: 'Archivo Eliminado',
        message: `El archivo ID ${archivoId} ha sido eliminado correctamente.`,
        color: 'teal'
      });
      await fetchArchivos();
      await fetchLecturasDelCaso();
    } catch (err: any) {
      console.error("Error al eliminar archivo:", err);
      notifications.show({
        title: 'Error al Eliminar',
        message: err.response?.data?.detail || err.message || 'No se pudo eliminar el archivo.',
        color: 'red'
      });
    } finally {
      setDeletingArchivoId(null);
    }
  };

  const breadcrumbs = (
    <Breadcrumbs mb="lg">
      <Anchor component={Link} to="/casos">Gestión de Casos</Anchor>
      <Text>{loadingCaso ? 'Cargando...' : (caso ? `${caso.ID_Caso} - ${caso.Nombre_del_Caso}` : 'Error')}</Text>
    </Breadcrumbs>
  );

  if (loadingCaso) {
    return <Box>{breadcrumbs}<Loader /></Box>;
  }

  if (errorCaso) {
    return (
      <Box>
        {breadcrumbs}
        <Alert icon={<IconAlertCircle size="1rem" />} title="Error" color="red">{errorCaso}</Alert>
      </Box>
    );
  }

  if (!caso) {
    return (
        <Box>{breadcrumbs}<Text>No se encontró el caso.</Text></Box>
    )
  }

  const archivosRows = archivos.map((archivo) => (
    <Table.Tr key={archivo.ID_Archivo}>
      <Table.Td>{archivo.ID_Archivo}</Table.Td>
      <Table.Td>{archivo.Nombre_del_Archivo}</Table.Td>
      <Table.Td>{archivo.Tipo_de_Archivo}</Table.Td>
      <Table.Td>{archivo.Fecha_de_Importacion ? new Date(archivo.Fecha_de_Importacion).toLocaleDateString() : '-'}</Table.Td>
      <Table.Td>
          <Group gap="xs">
            <Tooltip label="Ver Lecturas del Archivo (pendiente)">
                <ActionIcon size="sm" variant="subtle">
                    <IconEye size={16}/>
                </ActionIcon>
            </Tooltip>
            <Tooltip label="Descargar Archivo Original">
                <ActionIcon 
                    variant="subtle" 
                    color="blue" 
                    component="a"
                    href={`${apiClient.defaults.baseURL}/archivos/${archivo.ID_Archivo}/download`}
                    target="_blank"
                >
                    <IconDownload size={16} />
                </ActionIcon>
            </Tooltip>
            <Tooltip label="Eliminar Archivo y Lecturas">
                <ActionIcon 
                    variant="subtle" 
                    color="red" 
                    onClick={() => handleDeleteArchivo(archivo.ID_Archivo)}
                    loading={deletingArchivoId === archivo.ID_Archivo}
                    disabled={deletingArchivoId !== null}
                >
                    <IconTrash size={16} />
                </ActionIcon>
            </Tooltip>
          </Group>
      </Table.Td>
    </Table.Tr>
  ));

  const lecturasRows = lecturasList.map((lectura) => (
    <Table.Tr key={lectura.ID_Lectura}>
      <Table.Td>{lectura.ID_Lectura}</Table.Td>
      <Table.Td>{lectura.Matricula}</Table.Td>
      <Table.Td>{new Date(lectura.Fecha_y_Hora).toLocaleString()}</Table.Td>
      <Table.Td>{lectura.ID_Lector || '-'}</Table.Td>
      <Table.Td>{lectura.Tipo_Fuente}</Table.Td>
      <Table.Td>{lectura.Carril || '-'}</Table.Td>
      <Table.Td>{lectura.Velocidad !== null ? lectura.Velocidad.toFixed(1) : '-'}</Table.Td>
      <Table.Td>{lectura.Coordenada_X !== null ? lectura.Coordenada_X.toFixed(6) : '-'}</Table.Td>
      <Table.Td>{lectura.Coordenada_Y !== null ? lectura.Coordenada_Y.toFixed(6) : '-'}</Table.Td>
      <Table.Td>{lectura.ID_Archivo}</Table.Td>
    </Table.Tr>
  ));

  return (
    <Box>
      {breadcrumbs}
      <Text size="xl" fw={500} c="tracerBlue.7" mb="lg">
        Detalle del Caso: {caso.Nombre_del_Caso} ({caso.Año})
      </Text>
      {/* Aquí podríamos mostrar más detalles generales del caso si quisiéramos */} 
      {/* <Text>NIV: {caso.NIV || '-'}</Text> */} 
      {/* <Text>Descripción: {caso.Descripcion || '-'}</Text> */} 

      <Tabs defaultValue="archivos" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="archivos" leftSection={<IconFiles size="1rem" />}>Archivos Importados</Tabs.Tab>
          <Tabs.Tab value="lecturas" leftSection={<IconListDetails size="1rem" />}>Lecturas Totales</Tabs.Tab>
          <Tabs.Tab value="mapa" leftSection={<IconMapPin size="1rem" />}>Mapa del Caso</Tabs.Tab>
          {/* Añadir más pestañas según sea necesario */} 
        </Tabs.List>

        <Tabs.Panel value="archivos" pt="xs">
          {loadingArchivos && <Loader my="md" />}
          {errorArchivos && (
            <Alert icon={<IconAlertCircle size="1rem" />} title="Error al cargar archivos" color="red" my="md">
              {errorArchivos}
            </Alert>
          )}
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
                {archivosRows.length > 0 ? (
                  archivosRows
                ) : (
                  <Table.Tr><Table.Td colSpan={5} align="center">No hay archivos importados para este caso.</Table.Td></Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="lecturas" pt="lg">
          {loadingLecturas && <Loader my="xl" />}
          {errorLecturas && (
            <Alert icon={<IconAlertCircle size="1rem" />} title="Error al cargar lecturas" color="red" my="xl">
              {errorLecturas}
            </Alert>
          )}
          {!loadingLecturas && !errorLecturas && (
            <Box>
              <Table striped highlightOnHover withTableBorder withColumnBorders captionSide="bottom">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ID Lectura</Table.Th>
                    <Table.Th>Matrícula</Table.Th>
                    <Table.Th>Fecha y Hora</Table.Th>
                    <Table.Th>ID Lector</Table.Th>
                    <Table.Th>Tipo Fuente</Table.Th>
                    <Table.Th>Carril</Table.Th>
                    <Table.Th>Velocidad</Table.Th>
                    <Table.Th>Coord. X</Table.Th>
                    <Table.Th>Coord. Y</Table.Th>
                    <Table.Th>ID Archivo</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {lecturasRows.length > 0 ? (
                    lecturasRows
                  ) : (
                    <Table.Tr><Table.Td colSpan={10} align="center">No hay lecturas para mostrar para este caso.</Table.Td></Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Box>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="mapa" pt="xs">
          {/* Aquí se integrará el mapa específico del caso */}
          <Text c="dimmed" p="md">Mapa con las lecturas de este caso aparecerá aquí...</Text>
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}

export default CasoDetailPage; 