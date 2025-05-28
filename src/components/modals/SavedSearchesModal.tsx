import React, { useState } from 'react';
import { Modal, Button, Group, Table, Text, ActionIcon, Title, ScrollArea, Stack, Box } from '@mantine/core';
import { IconX, IconArrowsSort, IconSearch } from '@tabler/icons-react';
import dayjs from 'dayjs';

interface SavedSearch {
    id: number;
    name: string;
    results: any[];
    created_at?: string;
}

interface CrossResult {
    ids: number[];
    names: string[];
    date: string;
    count: number;
}

interface SavedSearchesModalProps {
    opened: boolean;
    onClose: () => void;
    savedSearches: SavedSearch[];
    selectedSearches: number[];
    setSelectedSearches: (ids: number[]) => void;
    handleCrossSearch: () => void;
    handleDeleteSavedSearch: (id: number) => void;
}

const SavedSearchesModal: React.FC<SavedSearchesModalProps> = ({
    opened,
    onClose,
    savedSearches,
    selectedSearches,
    setSelectedSearches,
    handleCrossSearch,
    handleDeleteSavedSearch
}) => {
    // Ordenación local
    const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'results'>('created_at');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    // Cruces realizados en la sesión
    const [crossResults, setCrossResults] = useState<CrossResult[]>([]);

    // Ordenar las búsquedas guardadas
    const sortedSearches = [...savedSearches].sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'name') {
            cmp = a.name.localeCompare(b.name);
        } else if (sortBy === 'created_at') {
            cmp = (a.created_at || '').localeCompare(b.created_at || '');
        } else if (sortBy === 'results') {
            cmp = a.results.length - b.results.length;
        }
        return sortDir === 'asc' ? cmp : -cmp;
    });

    // Handler para cruce (simula resultado y lo añade a la lista local)
    const handleCrossAndStore = () => {
        if (selectedSearches.length < 2) return;
        // Obtener nombres y resultados
        const selected = savedSearches.filter(s => selectedSearches.includes(s.id));
        const names = selected.map(s => s.name);
        // Cruce: intersección de matrículas
        const matriculasPorBusqueda = selected.map(s => new Set(s.results.map((r: any) => r.Matricula)));
        const commonMatriculas = matriculasPorBusqueda.reduce((common, current) => {
            return new Set([...common].filter(x => current.has(x)));
        });
        setCrossResults(prev => [
            {
                ids: selectedSearches,
                names,
                date: dayjs().format('DD/MM/YYYY HH:mm'),
                count: commonMatriculas.size
            },
            ...prev
        ]);
        handleCrossSearch();
    };

    // Render
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={<Title order={4}>Búsquedas Guardadas</Title>}
            size="75vw"
            centered
            styles={{ content: { minWidth: '900px', width: '75vw', maxWidth: '1200px' } }}
        >
            <Stack>
                <Box>
                    <Group justify="space-between" mb="sm">
                        <Text size="sm">Selecciona búsquedas para cruzar o gestionar</Text>
                    </Group>
                    <ScrollArea h={300}>
                        <Table striped highlightOnHover withTableBorder>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => {
                                            setSortBy('name');
                                            setSortDir(sortBy === 'name' && sortDir === 'asc' ? 'desc' : 'asc');
                                        }}
                                    >
                                        Nombre <IconArrowsSort size={14} style={{ verticalAlign: 'middle' }} />
                                    </Table.Th>
                                    <Table.Th
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => {
                                            setSortBy('created_at');
                                            setSortDir(sortBy === 'created_at' && sortDir === 'asc' ? 'desc' : 'asc');
                                        }}
                                    >
                                        Fecha <IconArrowsSort size={14} style={{ verticalAlign: 'middle' }} />
                                    </Table.Th>
                                    <Table.Th
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => {
                                            setSortBy('results');
                                            setSortDir(sortBy === 'results' && sortDir === 'asc' ? 'desc' : 'asc');
                                        }}
                                    >
                                        Nº lecturas <IconArrowsSort size={14} style={{ verticalAlign: 'middle' }} />
                                    </Table.Th>
                                    <Table.Th>Seleccionar</Table.Th>
                                    <Table.Th>Acciones</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {sortedSearches.map(search => (
                                    <Table.Tr key={search.id}>
                                        <Table.Td>{search.name}</Table.Td>
                                        <Table.Td>{search.created_at ? dayjs(search.created_at).format('DD/MM/YYYY HH:mm') : ''}</Table.Td>
                                        <Table.Td>{search.results.length}</Table.Td>
                                        <Table.Td>
                                            <input
                                                type="checkbox"
                                                checked={selectedSearches.includes(search.id)}
                                                onChange={e => {
                                                    if (e.target.checked) {
                                                        setSelectedSearches([...selectedSearches, search.id]);
                                                    } else {
                                                        setSelectedSearches(selectedSearches.filter(id => id !== search.id));
                                                    }
                                                }}
                                            />
                                        </Table.Td>
                                        <Table.Td>
                                            <ActionIcon
                                                color="red"
                                                variant="subtle"
                                                onClick={() => handleDeleteSavedSearch(search.id)}
                                            >
                                                <IconX size={16} />
                                            </ActionIcon>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                                {sortedSearches.length === 0 && (
                                    <Table.Tr>
                                        <Table.Td colSpan={5}>
                                            <Text color="dimmed" size="sm" ta="center">
                                                No hay búsquedas guardadas
                                            </Text>
                                        </Table.Td>
                                    </Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea>
                    <Button
                        mt="md"
                        size="sm"
                        variant="filled"
                        color="blue"
                        fullWidth
                        leftSection={<IconSearch size={16} />}
                        onClick={handleCrossAndStore}
                        disabled={selectedSearches.length < 2}
                    >
                        Realizar Cruce ({selectedSearches.length} seleccionadas)
                    </Button>
                </Box>
                <Box mt="md">
                    <Title order={5} mb="xs">Cruces realizados en esta sesión</Title>
                    <ScrollArea h={150}>
                        <Table striped highlightOnHover withTableBorder>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Búsquedas cruzadas</Table.Th>
                                    <Table.Th>Fecha</Table.Th>
                                    <Table.Th>Nº vehículos encontrados</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {crossResults.length > 0 ? crossResults.map((cr, idx) => (
                                    <Table.Tr key={idx}>
                                        <Table.Td>{cr.names.join(' + ')}</Table.Td>
                                        <Table.Td>{cr.date}</Table.Td>
                                        <Table.Td>{cr.count}</Table.Td>
                                    </Table.Tr>
                                )) : (
                                    <Table.Tr>
                                        <Table.Td colSpan={3}>
                                            <Text color="dimmed" size="sm" ta="center">
                                                No se han realizado cruces en esta sesión
                                            </Text>
                                        </Table.Td>
                                    </Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea>
                </Box>
            </Stack>
        </Modal>
    );
};

export default SavedSearchesModal; 