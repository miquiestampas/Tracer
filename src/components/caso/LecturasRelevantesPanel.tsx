import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Box, LoadingOverlay, Title, Stack, Text, Button, Group, Modal, Textarea, Tooltip, ActionIcon, Checkbox, Paper, Collapse, Alert, Menu, MultiSelect } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { DataTable, type DataTableProps, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import { IconStarOff, IconPencil, IconTrash, IconCar, IconX, IconRefresh, IconFileExport, IconFileSpreadsheet, IconFileText, IconCamera, IconTableOptions } from '@tabler/icons-react';
import { openConfirmModal } from '@mantine/modals';
import dayjs from 'dayjs';
import _ from 'lodash';
import type { Lectura, Lector } from '../../types/data';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { saveAs } from 'file-saver';

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
    // --- NUEVO: Prop para recargar ---
    onRefresh: () => void | Promise<void>;
}

// --- ESTILO GLOBAL PARA EL PAGINADOR DEL DATATABLE ---
const datatablePaginationStyle = `
.mantine-DataTable-pagination, .mantine-DataTable-paginationRoot {
  margin-bottom: 0 !important;
  padding-bottom: 0 !important;
  min-height: 0 !important;
}
`;

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
    // --- NUEVO: Destructuring ---
    onRefresh
}: LecturasRelevantesPanelProps) {

    const [ayudaAbierta, setAyudaAbierta] = useState(false);
    const [highlightedRows, setHighlightedRows] = useState<number[]>([]);
    const [exportColumns, setExportColumns] = useState<string[]>([]);
    const tableRef = useRef<HTMLDivElement>(null);
    const [exportModalOpen, setExportModalOpen] = useState<false | 'excel' | 'word'>(false);
    const [pendingExportType, setPendingExportType] = useState<'excel' | 'word' | null>(null);

    // Columnas disponibles para exportación
    const availableExportColumns = useMemo(() => [
        { value: 'Fecha_y_Hora', label: 'Fecha y Hora' },
        { value: 'Matricula', label: 'Matrícula' },
        { value: 'ID_Lector', label: 'ID Lector' },
        { value: 'Carril', label: 'Carril' },
        { value: 'relevancia.Nota', label: 'Observaciones' }
    ], []);

    // Inicializar columnas de exportación con todas las columnas
    useEffect(() => {
        setExportColumns(availableExportColumns.map(col => col.value));
    }, [availableExportColumns]);

    // --- NUEVO: Función para obtener los datos a exportar ---
    const getExportData = useCallback(() => {
        const base = selectedRecordIds.length > 0
            ? lecturas.filter(l => selectedRecordIds.includes(l.ID_Lectura))
            : lecturas;
        return base;
    }, [lecturas, selectedRecordIds]);

    // --- MODIFICADO: Exportar a Excel ---
    const exportToExcel = useCallback(() => {
        const dataToExport = getExportData();
        if (!dataToExport.length) return;
        const selectedData = dataToExport.map(lectura => {
            const row: any = {};
            exportColumns.forEach(col => {
                if (col === 'Fecha_y_Hora') {
                    row[col] = dayjs(lectura[col]).format('DD/MM/YYYY HH:mm:ss');
                } else if (col === 'relevancia.Nota') {
                    row['Nota'] = lectura.relevancia?.Nota || '-';
                } else {
                    row[col] = lectura[col] || '-';
                }
            });
            return row;
        });
        const ws = XLSX.utils.json_to_sheet(selectedData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Lecturas Relevantes');
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(data, 'lecturas_relevantes.xlsx');
    }, [getExportData, exportColumns]);

    // --- MODIFICADO: Exportar a Word ---
    const exportToWord = useCallback(() => {
        const dataToExport = getExportData();
        if (!dataToExport.length) return;
        const table = document.createElement('table');
        table.style.borderCollapse = 'collapse';
        table.style.width = '100%';
        // Crear encabezados
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        exportColumns.forEach(col => {
            const th = document.createElement('th');
            th.style.border = '1px solid black';
            th.style.padding = '8px';
            th.textContent = availableExportColumns.find(c => c.value === col)?.label || col;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);
        // Crear filas de datos
        const tbody = document.createElement('tbody');
        dataToExport.forEach(lectura => {
            const tr = document.createElement('tr');
            exportColumns.forEach(col => {
                const td = document.createElement('td');
                td.style.border = '1px solid black';
                td.style.padding = '8px';
                if (col === 'Fecha_y_Hora') {
                    td.textContent = dayjs(lectura[col]).format('DD/MM/YYYY HH:mm:ss');
                } else if (col === 'relevancia.Nota') {
                    td.textContent = lectura.relevancia?.Nota || '-';
                } else {
                    td.textContent = lectura[col] || '-';
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        const html = `
            <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12pt; }
                        th, td { border: 1px solid black; padding: 8px; font-family: Arial, sans-serif; font-size: 12pt; }
                    </style>
                </head>
                <body>
                    ${table.outerHTML}
                </body>
            </html>
        `;
        const blob = new Blob([html], { type: 'application/msword' });
        saveAs(blob, 'lecturas_relevantes.doc');
    }, [getExportData, exportColumns, availableExportColumns]);

    // Función para exportar como captura de pantalla
    const exportAsScreenshot = useCallback(async () => {
        if (!tableRef.current) return;

        try {
            const canvas = await html2canvas(tableRef.current);
            canvas.toBlob((blob) => {
                if (blob) {
                    saveAs(blob, 'lecturas_relevantes.png');
                }
            });
        } catch (error) {
            console.error('Error al generar la captura:', error);
            notifications.show({
                title: 'Error',
                message: 'No se pudo generar la captura de pantalla',
                color: 'red'
            });
        }
    }, []);

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
            title: 'Observaciones', 
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

    // --- MODAL DE EXPORTACIÓN ---
    const ExportModal = (
        <Modal
            opened={!!exportModalOpen}
            onClose={() => setExportModalOpen(false)}
            title={pendingExportType === 'excel' ? 'Exportar a Excel' : 'Exportar a Word'}
            size="lg"
            styles={{ body: { minWidth: 480 } }}
        >
            <Stack>
                <Text size="sm">Selecciona las columnas que deseas exportar:</Text>
                <MultiSelect
                    data={availableExportColumns}
                    value={exportColumns}
                    onChange={setExportColumns}
                    placeholder="Seleccionar columnas para exportar"
                    style={{ width: '100%' }}
                />
                <Group justify="flex-end">
                    <Button variant="default" onClick={() => setExportModalOpen(false)}>Cancelar</Button>
                    <Button
                        leftSection={pendingExportType === 'excel' ? <IconFileSpreadsheet size={16} /> : <IconFileText size={16} />}
                        onClick={() => {
                            setExportModalOpen(false);
                            setTimeout(() => {
                                if (pendingExportType === 'excel') exportToExcel();
                                else if (pendingExportType === 'word') exportToWord();
                            }, 200);
                        }}
                        disabled={exportColumns.length === 0}
                    >
                        Exportar
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );

    return (
        <>
            <style>{datatablePaginationStyle}</style>
            <Box style={{ position: 'relative' }}>
                <Stack style={{ marginBottom: 0, paddingBottom: 0 }}>
                    <Group justify="space-between" align="center" mb="sm">
                        <Title order={4}>Lecturas Marcadas como Relevantes ({totalRecords})</Title>
                        <Group gap="xs">
                            <Menu shadow="md" width={200}>
                                <Menu.Target>
                                    <Button
                                        variant="light"
                                        size="xs"
                                        leftSection={<IconFileExport size={16} />}
                                    >
                                        Exportar
                                    </Button>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Item
                                        leftSection={<IconFileSpreadsheet size={16} />}
                                        onClick={() => { setPendingExportType('excel'); setExportModalOpen('excel'); }}
                                    >
                                        Exportar a Excel
                                    </Menu.Item>
                                    <Menu.Item
                                        leftSection={<IconFileText size={16} />}
                                        onClick={() => { setPendingExportType('word'); setExportModalOpen('word'); }}
                                    >
                                        Exportar a Word
                                    </Menu.Item>
                                    <Menu.Item
                                        leftSection={<IconCamera size={16} />}
                                        onClick={exportAsScreenshot}
                                    >
                                        Captura de Pantalla
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
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
                           {/* --- NUEVO: Botón Actualizar --- */}
                            <Button 
                                leftSection={<IconRefresh size={16} />}
                                onClick={onRefresh} // Llamar a la función pasada por props
                                variant="default"
                                size="xs"
                                disabled={loading} // Deshabilitar si está cargando
                            >
                                Actualizar Lista
                            </Button>
                        </Group>
                    </Group>
                    {totalRecords === 0 && !loading && (
                        <Text c="dimmed">No hay lecturas marcadas como relevantes para este caso.</Text>
                    )}
                    {totalRecords > 0 && (
                        <Box ref={tableRef} style={{ paddingBottom: 0, marginBottom: 0 }}>
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
                                noRecordsText=""
                                noRecordsIcon={<></>}
                                rowStyle={(record: Lectura) => ({
                                    backgroundColor: highlightedRows.includes(record.ID_Lectura) ? 'var(--mantine-color-blue-0)' : undefined
                                })}
                                onRowClick={({ record }: { record: Lectura }) => {
                                    setHighlightedRows(prev => 
                                        prev.includes(record.ID_Lectura)
                                            ? prev.filter(id => id !== record.ID_Lectura)
                                            : [...prev, record.ID_Lectura]
                                    );
                                }}
                                styles={{
                                    pagination: { marginBottom: 0, paddingBottom: 0 },
                                    root: { marginBottom: 0, paddingBottom: 0 }
                                }}
                                fetching={loading}
                            />
                        </Box>
                    )}
                </Stack>
            </Box>
            {ExportModal}
        </>
    );
}

export default LecturasRelevantesPanel; 