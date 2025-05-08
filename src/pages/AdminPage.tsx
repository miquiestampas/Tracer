import React, { useState, useEffect, useRef } from 'react';
import { Container, Title, Paper, Group, Button, Text, Stack, Select, Alert, Loader, Table, Badge, ActionIcon, Tooltip, Modal, TextInput } from '@mantine/core';
import { IconDatabase, IconRefresh, IconTrash, IconDeviceFloppy, IconRestore, IconDownload } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

interface DbStatus {
  status: string;
  tables: Array<{
    name: string;
    count: number;
  }>;
  size_bytes: number;
  last_backup: string | null;
  backups_count: number;
}

interface Backup {
  filename: string;
  path: string;
  timestamp: string;
  size_bytes: number;
  created_at: string;
}

function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);

  const fetchDbStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/database/status');
      if (!response.ok) throw new Error('Error al obtener el estado');
      const data = await response.json();
      setDbStatus(data);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'No se pudo obtener el estado de la base de datos',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBackups = async () => {
    try {
      const response = await fetch('/api/admin/database/backups');
      if (!response.ok) throw new Error('Error al obtener los backups');
      const data = await response.json();
      setBackups(data.backups);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'No se pudieron obtener los backups',
        color: 'red',
      });
    }
  };

  const handleBackup = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/database/backup', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Error al crear el backup');
      const data = await response.json();
      notifications.show({
        title: 'Éxito',
        message: 'Backup creado correctamente',
        color: 'green',
      });
      await Promise.all([fetchDbStatus(), fetchBackups()]);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'No se pudo crear el backup',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup) return;
    if (!window.confirm('¿Estás seguro de que quieres restaurar este backup? Esta acción no se puede deshacer.')) {
      return;
    }
    try {
      setLoading(true);
      const response = await fetch('/api/admin/database/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ backup: selectedBackup }),
      });
      if (!response.ok) throw new Error('Error al restaurar la base de datos');
      const data = await response.json();
      notifications.show({
        title: 'Éxito',
        message: 'Base de datos restaurada correctamente',
        color: 'green',
      });
      await Promise.all([fetchDbStatus(), fetchBackups()]);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'No se pudo restaurar la base de datos',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setResetModalOpen(true);
  };

  const confirmReset = async () => {
    if (resetConfirmText !== 'RESETEAR') return;
    setResetModalOpen(false);
    setResetConfirmText('');
    try {
      setLoading(true);
      const response = await fetch('/api/admin/database/reset', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Error al resetear la base de datos');
      const data = await response.json();
      notifications.show({
        title: 'Éxito',
        message: 'Base de datos reseteada correctamente',
        color: 'green',
      });
      await Promise.all([fetchDbStatus(), fetchBackups()]);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'No se pudo resetear la base de datos',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.db')) {
      notifications.show({
        title: 'Archivo inválido',
        message: 'Solo se pueden restaurar archivos con extensión .db',
        color: 'red',
      });
      return;
    }
    if (!window.confirm('¿Estás seguro de que quieres restaurar la base de datos desde este archivo? Esta acción no se puede deshacer.')) {
      return;
    }
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('backup_file', file);
      const response = await fetch('/api/admin/database/restore', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Error al restaurar la base de datos');
      notifications.show({
        title: 'Éxito',
        message: 'Base de datos restaurada correctamente',
        color: 'green',
      });
      await Promise.all([fetchDbStatus(), fetchBackups()]);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'No se pudo restaurar la base de datos',
        color: 'red',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClearExceptLectores = () => {
    setClearModalOpen(true);
  };

  const confirmClearExceptLectores = async () => {
    if (clearConfirmText !== 'ELIMINAR') return;
    setClearing(true);
    try {
      const response = await fetch('/api/admin/database/clear_except_lectores', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Error al eliminar los datos');
      notifications.show({
        title: 'Éxito',
        message: 'Todos los datos (excepto lectores) fueron eliminados correctamente',
        color: 'green',
      });
      await Promise.all([fetchDbStatus(), fetchBackups()]);
      setClearModalOpen(false);
      setClearConfirmText('');
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'No se pudo eliminar los datos',
        color: 'red',
      });
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    fetchDbStatus();
    fetchBackups();
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <Container fluid style={{ paddingLeft: 32, paddingRight: 32 }}>
      <Title order={2} mt="md" mb="lg">Panel de Administración</Title>

      <Stack gap="lg">
        {/* Estado de la Base de Datos */}
        <Paper p="md" withBorder>
          <Group justify="space-between" mb="md">
            <Title order={3}>Estado de la Base de Datos</Title>
            <Button
              leftSection={<IconRefresh size={16} />}
              onClick={() => Promise.all([fetchDbStatus(), fetchBackups()])}
              loading={loading}
            >
              Actualizar
            </Button>
          </Group>

          {loading ? (
            <Loader />
          ) : dbStatus ? (
            <Stack gap="md">
              <Group>
                <Badge color="green" size="lg">Estado: {dbStatus.status}</Badge>
                <Badge color="blue" size="lg">Tamaño: {formatBytes(dbStatus.size_bytes)}</Badge>
                <Badge color="violet" size="lg">Backups: {dbStatus.backups_count}</Badge>
              </Group>
              
              <Title order={4} mt="md">Tablas</Title>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Nombre</Table.Th>
                    <Table.Th>Registros</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {dbStatus.tables.map((table) => (
                    <Table.Tr key={table.name}>
                      <Table.Td>{table.name}</Table.Td>
                      <Table.Td>{table.count}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          ) : (
            <Alert color="red" title="Error">
              No se pudo obtener el estado de la base de datos
            </Alert>
          )}
        </Paper>

        {/* Gestión de Base de Datos */}
        <Paper p="md" withBorder>
          <Title order={3} mb="md">Gestión de Base de Datos</Title>
          
          <Stack gap="md">
            <Group>
              <Button
                leftSection={<IconDeviceFloppy size={16} />}
                onClick={handleBackup}
                loading={loading}
              >
                Crear Backup
              </Button>
              <Button
                leftSection={<IconTrash size={16} />}
                color="red"
                onClick={handleReset}
                loading={loading}
              >
                Resetear Base de Datos
              </Button>
              <Button
                leftSection={<IconRestore size={16} />}
                color="green"
                loading={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                Restaurar desde archivo
              </Button>
              <Button
                leftSection={<IconTrash size={16} />}
                color="pink"
                variant="outline"
                onClick={handleClearExceptLectores}
                loading={clearing}
              >
                Eliminar todo (excepto lectores)
              </Button>
              <input
                type="file"
                accept=".db"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileRestore}
              />
            </Group>

            <Title order={4}>Backups Disponibles</Title>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Tamaño</Table.Th>
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {backups.map((backup) => (
                  <Table.Tr key={backup.filename}>
                    <Table.Td>{formatDate(backup.created_at)}</Table.Td>
                    <Table.Td>{formatBytes(backup.size_bytes)}</Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Tooltip label="Restaurar">
                          <ActionIcon
                            color="blue"
                            variant="light"
                            onClick={() => {
                              setSelectedBackup(backup.filename);
                              handleRestore();
                            }}
                          >
                            <IconRestore size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Descargar">
                          <ActionIcon
                            color="green"
                            variant="light"
                            onClick={() => window.open(`/api/admin/database/backups/${backup.filename}/download`)}
                          >
                            <IconDownload size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Paper>
      </Stack>

      <Modal opened={resetModalOpen} onClose={() => setResetModalOpen(false)} title="Confirmar Reseteo" centered>
        <Text c="red" fw={700} mb="md">
          ¡ATENCIÓN! Esta acción eliminará TODOS los datos de la base de datos y no se puede deshacer.<br />
          Para confirmar, escribe <b>RESETEAR</b> en el campo de abajo.
        </Text>
        <TextInput
          label="Escribe RESETEAR para confirmar"
          value={resetConfirmText}
          onChange={e => setResetConfirmText(e.currentTarget.value)}
          error={resetConfirmText && resetConfirmText !== 'RESETEAR' ? 'Debes escribir RESETEAR exactamente' : undefined}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setResetModalOpen(false)}>
            Cancelar
          </Button>
          <Button color="red" disabled={resetConfirmText !== 'RESETEAR'} onClick={confirmReset} loading={loading}>
            Resetear Base de Datos
          </Button>
        </Group>
      </Modal>

      <Modal opened={clearModalOpen} onClose={() => setClearModalOpen(false)} title="Confirmar Eliminación Masiva" centered>
        <Text c="pink" fw={700} mb="md">
          Esta acción eliminará <b>TODOS</b> los datos de la base de datos excepto los lectores.<br />
          No se puede deshacer.<br />
          Para confirmar, escribe <b>ELIMINAR</b> en el campo de abajo.
        </Text>
        <TextInput
          label="Escribe ELIMINAR para confirmar"
          value={clearConfirmText}
          onChange={e => setClearConfirmText(e.currentTarget.value)}
          error={clearConfirmText && clearConfirmText !== 'ELIMINAR' ? 'Debes escribir ELIMINAR exactamente' : undefined}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setClearModalOpen(false)}>
            Cancelar
          </Button>
          <Button color="pink" disabled={clearConfirmText !== 'ELIMINAR'} onClick={confirmClearExceptLectores} loading={clearing}>
            Eliminar todo (excepto lectores)
          </Button>
        </Group>
      </Modal>
    </Container>
  );
}

export default AdminPage; 