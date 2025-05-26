import React from 'react';
import { Modal, TextInput, Button, Group, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';

interface SaveSearchModalProps {
    opened: boolean;
    onClose: () => void;
    onSave: (name: string) => void;
    loading?: boolean;
}

interface SaveSearchFormValues {
    name: string;
}

export default function SaveSearchModal({ opened, onClose, onSave, loading = false }: SaveSearchModalProps) {
    const form = useForm<SaveSearchFormValues>({
        initialValues: {
            name: '',
        },
        validate: {
            name: (value) => (!value.trim() ? 'El nombre es requerido' : null),
        },
    });

    const handleSubmit = (values: SaveSearchFormValues) => {
        onSave(values.name.trim());
        form.reset();
    };

    return (
        <Modal 
            opened={opened} 
            onClose={onClose} 
            title="Guardar Búsqueda" 
            centered
        >
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack>
                    <TextInput
                        label="Nombre de la búsqueda"
                        placeholder="Introduce un nombre descriptivo"
                        {...form.getInputProps('name')}
                        autoFocus
                    />
                    <Group justify="flex-end" mt="md">
                        <Button variant="light" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" loading={loading}>
                            Guardar
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
} 