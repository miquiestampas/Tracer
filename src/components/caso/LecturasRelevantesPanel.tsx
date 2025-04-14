import React, { useState, useEffect } from 'react';
import { Box, LoadingOverlay, Title, Stack, Text, Button, Group, Modal, Textarea, Tooltip, ActionIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { DataTable, DataTableSortStatus, DataTableProps } from 'mantine-datatable';
import { IconStarOff, IconPencil, IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import _ from 'lodash';

// Reutilizar interfaces (asegurarse que están disponibles o importarlas)
interface Lector { ID_Lector: string; Nombre?: string | null; Carretera?: string | null; Sentido?: string | null; Orientacion?: string | null; }
interface Lectura {
    ID_Lectura: number; Matricula: string; Fecha_y_Hora: string; Carril?: string | null; ID_Lector?: string | null;
    relevancia: { ID_Relevante: number, Nota?: string | null } | null; // Relevancia es OBLIGATORIA aquí
    lector?: Lector | null;
}

interface LecturasRelevantesPanelProps {
    casoId: number;
}

function LecturasRelevantesPanel({ casoId }: LecturasRelevantesPanelProps) {
    const [loading, setLoading] = useState(true);
    const [lecturas, setLecturas] = useState<Lectura[]>([]);
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Lectura>>({ columnAccessor: 'Fecha_y_Hora', direction: 'asc' });
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;
    const [editingLectura, setEditingLectura] = useState<Lectura | null>(null);
    const [notaEdit, setNotaEdit] = useState('');

    // Cargar datos
    const fetchLecturasRelevantes = async () => {
        setLoading(true);
        try {
            const response = await fetch(`http://localhost:8000/casos/${casoId}/lecturas_relevantes`);
            if (!response.ok) {
                throw new Error(`Error ${response.status}: No se pudieron cargar las lecturas relevantes`);
            }
            const data = await response.json();
            setLecturas(data as Lectura[]);
        } catch (error) {
            console.error("Error fetching lecturas relevantes:", error);
            notifications.show({ title: 'Error', message: error instanceof Error ? error.message : 'Error desconocido', color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLecturasRelevantes();
    }, [casoId]);

    // Datos para la tabla
    const sortedRecords = React.useMemo(() => {
        const data = _.orderBy(lecturas, [sortStatus.columnAccessor], [sortStatus.direction]);
        return data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    }, [lecturas, sortStatus, page]);

    // --- Acciones --- 
    const openEditModal = (lectura: Lectura) => {
        setEditingLectura(lectura);
        setNotaEdit(lectura.relevancia?.Nota || '');
    };

    const handleGuardarNota = async () => {
        if (!editingLectura || !editingLectura.relevancia) return;
        const idRelevante = editingLectura.relevancia.ID_Relevante;
        setLoading(true);
        try {
            const response = await fetch(`http://localhost:8000/lecturas_relevantes/${idRelevante}/nota`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ Nota: notaEdit }),
            });
            if (!response.ok) {
                throw new Error('No se pudo guardar la nota.');
            }
            notifications.show({ title: 'Éxito', message: 'Nota actualizada.', color: 'green' });
            setEditingLectura(null);
            fetchLecturasRelevantes(); // Recargar datos
        } catch (error) {
            notifications.show({ title: 'Error', message: error instanceof Error ? error.message : 'Error desconocido', color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    const handleDesmarcar = async (idLectura: number) => {
        if (!confirm(`¿Seguro que quieres desmarcar esta lectura (${idLectura}) como relevante?`)) return;
        setLoading(true);
        try {
            const response = await fetch(`http://localhost:8000/lecturas/${idLectura}/desmarcar_relevante`, { method: 'DELETE' });
            if (!response.ok) {
                throw new Error('No se pudo desmarcar la lectura.');
            }
            notifications.show({ title: 'Éxito', message: `Lectura ${idLectura} desmarcada.`, color: 'green' });
            fetchLecturasRelevantes(); // Recargar datos
        } catch (error) {
             notifications.show({ title: 'Error', message: error instanceof Error ? error.message : 'Error desconocido', color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    // --- Columnas ---
    const columns: DataTableProps<Lectura>['columns'] = [
        {
            accessor: 'actions',
            title: 'Acciones',
            width: 100,
            textAlign: 'center',
            render: (record) => (
                <Group gap="xs" justify="center" wrap="nowrap">
                    <Tooltip label="Editar Nota">
                        <ActionIcon variant="subtle" color="blue" onClick={() => openEditModal(record)} disabled={!record.relevancia}>
                            <IconPencil size={16} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Desmarcar como Relevante">
                         <ActionIcon variant="subtle" color="red" onClick={() => handleDesmarcar(record.ID_Lectura)} disabled={!record.relevancia}>
                            <IconStarOff size={16} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            ),
        },
        { accessor: 'relevancia.Nota', title: 'Nota', render: (r) => r.relevancia?.Nota || '-', width: 200 },
        { accessor: 'Fecha_y_Hora', title: 'Fecha y Hora', render: (r) => dayjs(r.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss'), sortable: true, width: 160 },
        { accessor: 'Matricula', title: 'Matrícula', sortable: true, width: 100 },
        { accessor: 'lector.ID_Lector', title: 'ID Lector', render: (r) => r.lector?.ID_Lector || '-', sortable: true, width: 150 }, 
        { accessor: 'lector.Sentido', title: 'Sentido', render: (r) => r.lector?.Sentido || '-', sortable: true, width: 100 },
        { accessor: 'lector.Carretera', title: 'Carretera', render: (r) => r.lector?.Carretera || '-', sortable: true, width: 100 },
        { accessor: 'Carril', title: 'Carril', render: (r) => r.Carril || '-', sortable: true, width: 70 },
    ];

    return (
        <Box style={{ position: 'relative' }}>
            <LoadingOverlay visible={loading} />
            <Stack>
                <Title order={4}>Lecturas Marcadas como Relevantes ({lecturas.length})</Title>
                {lecturas.length === 0 && !loading && (
                    <Text c="dimmed">No hay lecturas marcadas como relevantes para este caso.</Text>
                )}
                {lecturas.length > 0 && (
                    <DataTable<Lectura>
                        records={sortedRecords}
                        columns={columns}
                        totalRecords={lecturas.length}
                        recordsPerPage={PAGE_SIZE}
                        page={page}
                        onPageChange={setPage}
                        sortStatus={sortStatus}
                        onSortStatusChange={setSortStatus}
                        withTableBorder
                        borderRadius="sm"
                        withColumnBorders
                        striped
                        highlightOnHover
                        minHeight={200}
                    />
                )}
            </Stack>

            {/* Modal para Editar Nota */} 
            <Modal 
                opened={editingLectura !== null}
                onClose={() => setEditingLectura(null)}
                title={`Editar Nota - Lectura ${editingLectura?.ID_Lectura}`}
                centered
            >
                <Stack>
                     <Textarea
                        label="Nota"
                        value={notaEdit}
                        onChange={(event) => setNotaEdit(event.currentTarget.value)}
                        autosize
                        minRows={3}
                     />
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setEditingLectura(null)}>Cancelar</Button>
                        <Button onClick={handleGuardarNota} loading={loading}>Guardar Nota</Button>
                    </Group>
                </Stack>
            </Modal>
        </Box>
    );
}

export default LecturasRelevantesPanel; 