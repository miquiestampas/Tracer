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
  const [restoreFileModalOpen, setRestoreFileModalOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restoreBackupModalOpen, setRestoreBackupModalOpen] = useState(false);
  const [backupToRestore, setBackupToRestore] = useState<Backup | null>(null);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [deleteBackupModalOpen, setDeleteBackupModalOpen] = useState(false);
  const [backupToDelete, setBackupToDelete] = useState<Backup | null>(null);
  const [deletingBackup, setDeletingBackup] = useState(false);

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
      console.log('Raw backup data from API:', data.backups);
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

  const handleFileRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
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
    setRestoreFile(file);
    setRestoreFileName(file.name);
    setRestoreFileModalOpen(true);
  };

  const confirmFileRestore = async () => {
    if (!restoreFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('backup_file', restoreFile);
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
      setRestoreFile(null);
      setRestoreFileName('');
      setRestoreFileModalOpen(false);
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

  const handleRestoreBackup = (backup: Backup) => {
    setBackupToRestore(backup);
    setRestoreBackupModalOpen(true);
  };

  const confirmRestoreBackup = async () => {
    if (!backupToRestore) return;
    setRestoringBackup(true);
    try {
      // Descargar el archivo backup como blob
      const response = await fetch(`/api/admin/database/backups/${backupToRestore.filename}/download`);
      if (!response.ok) throw new Error('No se pudo descargar el backup');
      const blob = await response.blob();
      const file = new File([blob], backupToRestore.filename, { type: 'application/octet-stream' });
      // Subirlo como FormData al endpoint de restauración
      const formData = new FormData();
      formData.append('backup_file', file);
      const restoreResponse = await fetch('/api/admin/database/restore', {
        method: 'POST',
        body: formData,
      });
      if (!restoreResponse.ok) throw new Error('Error al restaurar la base de datos');
      notifications.show({
        title: 'Éxito',
        message: 'Base de datos restaurada correctamente',
        color: 'green',
      });
      await Promise.all([fetchDbStatus(), fetchBackups()]);
      setRestoreBackupModalOpen(false);
      setBackupToRestore(null);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'No se pudo restaurar la base de datos',
        color: 'red',
      });
    } finally {
      setRestoringBackup(false);
    }
  };

  const handleDeleteBackup = (backup: Backup) => {
    setBackupToDelete(backup);
    setDeleteBackupModalOpen(true);
  };

  const confirmDeleteBackup = async () => {
    if (!backupToDelete) return;
    setDeletingBackup(true);
    try {
      const response = await fetch(`/api/admin/database/backups/${backupToDelete.filename}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('No se pudo eliminar el backup');
      notifications.show({
        title: 'Éxito',
        message: 'Backup eliminado correctamente',
        color: 'green',
      });
      await fetchBackups();
      setDeleteBackupModalOpen(false);
      setBackupToDelete(null);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'No se pudo eliminar el backup',
        color: 'red',
      });
    } finally {
      setDeletingBackup(false);
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
    <Container fluid style={{ paddingLeft: 32, paddingRight: 32, maxWidth: 900 }}>
      <Title order={2} mt="md" mb="lg">Panel de Administración</Title>

      <Stack gap="lg">
        {/* Estado de la Base de Datos */}
        <Paper p="md" withBorder style={{ maxWidth: 800 }}>
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
        <Paper p="md" withBorder style={{ maxWidth: 800 }}>
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
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {backups.map((backup) => (
                  <Table.Tr key={backup.filename}>
                    <Table.Td>{formatDate(backup.created_at)}</Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Tooltip label="Restaurar">
                          <ActionIcon
                            color="blue"
                            variant="light"
                            onClick={() => handleRestoreBackup(backup)}
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
                        <Tooltip label="Eliminar">
                          <ActionIcon
                            color="red"
                            variant="light"
                            onClick={() => handleDeleteBackup(backup)}
                          >
                            <IconTrash size={16} />
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
        <Text fw={700} mb="md" c="black">
          ¡ATENCIÓN! Esta acción eliminará <b>TODOS</b> los datos de la base de datos y <span style={{ color: '#d97706' }}>no se puede deshacer</span>.<br />
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
        <Text fw={700} mb="md" c="black">
          Esta acción eliminará <b>TODOS</b> los datos de la base de datos excepto los lectores.<br />
          <span style={{ color: '#d97706' }}>No se puede deshacer.</span><br />
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

      <Modal opened={restoreFileModalOpen} onClose={() => { setRestoreFileModalOpen(false); setRestoreFile(null); setRestoreFileName(''); if (fileInputRef.current) fileInputRef.current.value = ''; }} title="Confirmar Restauración desde Archivo" centered>
        <Text fw={700} mb="md" c="black">
          Vas a restaurar la base de datos desde el archivo:<br />
          <b>{restoreFileName}</b><br />
          <span style={{ color: '#d97706' }}>Esta acción <b>sobrescribirá</b> la base de datos actual y no se puede deshacer.</span>
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => { setRestoreFileModalOpen(false); setRestoreFile(null); setRestoreFileName(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
            Cancelar
          </Button>
          <Button color="green" onClick={confirmFileRestore} loading={uploading}>
            Restaurar desde archivo
          </Button>
        </Group>
      </Modal>

      <Modal opened={restoreBackupModalOpen} onClose={() => { setRestoreBackupModalOpen(false); setBackupToRestore(null); }} title="Confirmar Restauración de Backup" centered>
        <Text fw={700} mb="md" c="black">
          Vas a restaurar la base de datos desde el backup:<br />
          <b>{backupToRestore?.filename}</b><br />
          <span style={{ color: '#d97706' }}>Esta acción <b>sobrescribirá</b> la base de datos actual y no se puede deshacer.</span>
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => { setRestoreBackupModalOpen(false); setBackupToRestore(null); }}>
            Cancelar
          </Button>
          <Button color="blue" onClick={confirmRestoreBackup} loading={restoringBackup}>
            Restaurar backup seleccionado
          </Button>
        </Group>
      </Modal>

      <Modal opened={deleteBackupModalOpen} onClose={() => { setDeleteBackupModalOpen(false); setBackupToDelete(null); }} title="Confirmar Eliminación de Backup" centered>
        <Text fw={700} mb="md" c="black">
          ¿Seguro que quieres eliminar el backup <b>{backupToDelete?.filename}</b>?<br />
          <span style={{ color: '#d97706' }}>Esta acción no se puede deshacer.</span>
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => { setDeleteBackupModalOpen(false); setBackupToDelete(null); }}>
            Cancelar
          </Button>
          <Button color="red" onClick={confirmDeleteBackup} loading={deletingBackup}>
            Eliminar backup
          </Button>
        </Group>
      </Modal>
    </Container>
  );
}

export default AdminPage; 