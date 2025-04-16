import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, LoadingOverlay, Title, Stack, Text, Button, Group, Modal, Textarea, Tooltip, ActionIcon, Checkbox } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { DataTable, type DataTableProps, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import { IconStarOff, IconPencil, IconTrash, IconCar, IconX } from '@tabler/icons-react';
import { openConfirmModal } from '@mantine/modals';
import dayjs from 'dayjs';
import _ from 'lodash';
import type { Lectura, Lector } from '../../types/data';

// --- NUEVA INTERFAZ DE PROPS ---
interface LecturasRelevantesPanelProps {
    // Datos
    lecturas: Lectura[];
    loading: boolean;
    totalRecords: number;
    // Paginación
    page: number;
    onPageChange: (page: number) => void;
    pageSize: number;
    // Ordenación
    sortStatus: DataTableSortStatus<Lectura>;
    onSortStatusChange: (status: DataTableSortStatus<Lectura>) => void;
    // Selección
    selectedRecordIds: number[];
    onSelectionChange: (selectedIds: number[]) => void;
    // Acciones
    onEditNota: (lectura: Lectura) => void;
    onDesmarcar: (idLectura: number) => void;
    onDesmarcarSeleccionados: () => void;
    onGuardarVehiculo: (lectura: Lectura) => void;
    onGuardarVehiculosSeleccionados: () => void;
}

function LecturasRelevantesPanel({
    lecturas,
    loading,
    totalRecords,
    page,
    onPageChange,
    pageSize,
    sortStatus,
    onSortStatusChange,
    selectedRecordIds,
    onSelectionChange,
    onEditNota,
    onDesmarcar,
    onDesmarcarSeleccionados,
    onGuardarVehiculo,
    onGuardarVehiculosSeleccionados,
}: LecturasRelevantesPanelProps) {

    // --- Lógica de Selección (adaptada a props y con useCallback) ---
    const handleCheckboxChange = useCallback((id: number, checked: boolean) => {
        const newSelectedIds = checked
            ? [...selectedRecordIds, id]
            : selectedRecordIds.filter((recordId) => recordId !== id);
        onSelectionChange(newSelectedIds);
    }, [selectedRecordIds, onSelectionChange]);

    const handleSelectAll = useCallback((checked: boolean) => {
        const allIds = Array.isArray(lecturas) ? lecturas.map(l => l.ID_Lectura) : [];
        onSelectionChange(checked ? allIds : []);
    }, [lecturas, onSelectionChange]);

    // --- Datos Paginados/Ordenados (Asume que el padre los pasa así) ---
    // Si el padre pasa los datos ya filtrados/paginados/ordenados, esta línea se va
    // const sortedAndPaginatedRecords = lecturas; 
    // Si el padre pasa TODOS los datos y este componente pagina/ordena:
    const sortedAndPaginatedRecords = useMemo(() => {
       let data = Array.isArray(lecturas) ? [...lecturas] : [];
       if (sortStatus?.columnAccessor) {
           data = _.orderBy(data, [sortStatus.columnAccessor], [sortStatus.direction]);
       }
       const start = (page - 1) * pageSize;
       const end = start + pageSize;
       return data.slice(start, end);
   }, [lecturas, sortStatus, page, pageSize]);

    // --- Columnas (adaptadas para usar props) ---
    const columns: DataTableColumn<Lectura>[] = useMemo(() => {
        const safeLecturas = Array.isArray(lecturas) ? lecturas : [];
        const allSelected = safeLecturas.length > 0 && selectedRecordIds.length === safeLecturas.length;
        const someSelected = selectedRecordIds.length > 0 && selectedRecordIds.length < safeLecturas.length;

        return [
        {
            accessor: 'select', 
            title: (
                <Checkbox
                    aria-label="Seleccionar todas las filas"
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={(e) => handleSelectAll(e.currentTarget.checked)}
                />
            ),
            width: '0%',
            styles: {
                 cell: {
                     paddingLeft: 'var(--mantine-spacing-xs)',
                     paddingRight: 'var(--mantine-spacing-xs)',
                 }
             },
            render: (record) => (
                <Checkbox
                    aria-label={`Seleccionar fila ${record.ID_Lectura}`}
                    checked={selectedRecordIds.includes(record.ID_Lectura)}
                    onChange={(e) => handleCheckboxChange(record.ID_Lectura, e.currentTarget.checked)}
                    onClick={(e) => e.stopPropagation()}
                />
            ),
        },
        // --- Columnas de Datos (Acciones se mueve al final) ---
        { accessor: 'Fecha_y_Hora', title: 'Fecha y Hora', render: (r) => dayjs(r.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss'), sortable: true, width: 140 },
        { accessor: 'Matricula', title: 'Matrícula', sortable: true, width: 100 },
        { accessor: 'ID_Lector', title: 'ID Lector', render: (r) => r.ID_Lector || '-', sortable: true, width: 150 }, 
        { accessor: 'Carril', title: 'Carril', render: (r) => r.Carril || '-', sortable: true, width: 70 },
        { 
            accessor: 'relevancia.Nota',
            title: 'Nota', 
            render: (r) => r.relevancia?.Nota || '-', 
            width: 200,
        },
        // --- Columna de Acciones (Movida al final) ---
        {
            accessor: 'actions',
            title: 'Acciones',
            width: 120,
            textAlign: 'center',
            render: (record) => (
                <Group gap="xs" justify="center" wrap="nowrap">
                    <Tooltip label="Editar Nota">
                        <ActionIcon variant="subtle" color="blue" onClick={() => onEditNota(record)} disabled={!record.relevancia}>
                            <IconPencil size={16} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Guardar Vehículo">
                         <ActionIcon variant="subtle" color="green" onClick={() => onGuardarVehiculo(record)} disabled={!record.Matricula}>
                             <IconCar size={16} />
                         </ActionIcon>
                     </Tooltip>
                    <Tooltip label="Desmarcar como Relevante">
                         <ActionIcon variant="subtle" color="red" onClick={() => onDesmarcar(record.ID_Lectura)} disabled={!record.relevancia}>
                            <IconStarOff size={16} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            ),
        },
    ];
    }, [lecturas, selectedRecordIds, onEditNota, onGuardarVehiculo, onDesmarcar, handleCheckboxChange, handleSelectAll]);

    return (
        <Box style={{ position: 'relative' }}>
            <LoadingOverlay visible={loading} />
            <Stack>
                <Group justify="space-between" align="center" mb="sm">
                    <Title order={4}>Lecturas Marcadas como Relevantes ({totalRecords})</Title>
                    <Group gap="xs"> 
                        <Button
                            color="red"
                            variant="light"
                            size="xs"
                            leftSection={<IconTrash size={16} />}
                            disabled={selectedRecordIds.length === 0 || loading}
                            onClick={onDesmarcarSeleccionados}
                        >
                            Desmarcar Selección ({selectedRecordIds.length})
                        </Button>
                        <Button
                           color="green"
                           variant="light"
                           size="xs"
                           leftSection={<IconCar size={16} />}
                           disabled={selectedRecordIds.length === 0 || loading}
                           onClick={onGuardarVehiculosSeleccionados}
                       >
                           Guardar Vehículos ({selectedRecordIds.length})
                       </Button>
                    </Group>
                </Group>
                {totalRecords === 0 && !loading && (
                    <Text c="dimmed">No hay lecturas marcadas como relevantes para este caso.</Text>
                )}
                {totalRecords > 0 && (
                    <DataTable<Lectura>
                        records={sortedAndPaginatedRecords}
                        columns={columns}
                        totalRecords={totalRecords}
                        recordsPerPage={pageSize}
                        page={page}
                        onPageChange={onPageChange}
                        sortStatus={sortStatus}
                        onSortStatusChange={onSortStatusChange}
                        idAccessor="ID_Lectura"
                        withTableBorder
                        borderRadius="sm"
                        withColumnBorders
                        striped
                        highlightOnHover
                        minHeight={200}
                        noRecordsText=""
                        noRecordsIcon={<></>}
                    />
                )}
            </Stack>
        </Box>
    );
}

export default LecturasRelevantesPanel; 