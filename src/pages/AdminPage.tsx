import React, { useState, useEffect, useRef } from 'react';
import { Container, Title, Paper, Group, Button, Text, Stack, Select, Alert, Loader, Table, Badge, ActionIcon, Tooltip, Modal, TextInput, Textarea, Grid, PasswordInput } from '@mantine/core';
import { IconDatabase, IconRefresh, IconTrash, IconDeviceFloppy, IconRestore, IconDownload, IconEdit, IconPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

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

interface Grupo {
  ID_Grupo: number;
  Nombre: string;
  Descripcion: string | null;
  Fecha_Creacion: string;
  casos: number;
}

interface Usuario {
  User: number;
  Rol: 'superadmin' | 'admin_casos';
  ID_Grupo: number;
  grupo?: Grupo;
}

function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [createGrupoModalOpen, setCreateGrupoModalOpen] = useState(false);
  const [editGrupoModalOpen, setEditGrupoModalOpen] = useState(false);
  const [deleteGrupoModalOpen, setDeleteGrupoModalOpen] = useState(false);
  const [selectedGrupo, setSelectedGrupo] = useState<Grupo | null>(null);
  const [newGrupoNombre, setNewGrupoNombre] = useState('');
  const [newGrupoDescripcion, setNewGrupoDescripcion] = useState('');
  const [editGrupoNombre, setEditGrupoNombre] = useState('');
  const [editGrupoDescripcion, setEditGrupoDescripcion] = useState('');
  const [grupoToDelete, setGrupoToDelete] = useState<Grupo | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);
  const [usuarioModalOpen, setUsuarioModalOpen] = useState(false);
  const [editUsuarioModalOpen, setEditUsuarioModalOpen] = useState(false);
  const [usuarioToEdit, setUsuarioToEdit] = useState<Usuario | null>(null);
  const [usuarioToDelete, setUsuarioToDelete] = useState<Usuario | null>(null);
  const [deleteUsuarioModalOpen, setDeleteUsuarioModalOpen] = useState(false);
  const [superAdminPassModal, setSuperAdminPassModal] = useState(false);
  const [superAdminPass, setSuperAdminPass] = useState('');
  const [superAdminPassError, setSuperAdminPassError] = useState('');
  const [superAdminCreds, setSuperAdminCreds] = useState<{user: string, pass: string} | null>(null);
  const [newUser, setNewUser] = useState('');
  const [newRol, setNewRol] = useState<'superadmin' | 'admin_casos'>('admin_casos');
  const [newGrupo, setNewGrupo] = useState<number | null>(null);
  const [newPass, setNewPass] = useState('');
  const [editRol, setEditRol] = useState<'superadmin' | 'admin_casos'>('admin_casos');
  const [editGrupo, setEditGrupo] = useState<number | null>(null);
  const [editPass, setEditPass] = useState('');

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

  const fetchGrupos = async () => {
    try {
      setLoadingGrupos(true);
      const response = await fetch('/api/grupos');
      if (!response.ok) throw new Error('Error al obtener los grupos');
      const data = await response.json();
      setGrupos(data);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'No se pudieron obtener los grupos',
        color: 'red',
      });
    } finally {
      setLoadingGrupos(false);
    }
  };

  const handleCreateGrupo = async () => {
    if (!newGrupoNombre.trim()) {
      notifications.show({
        title: 'Error',
        message: 'El nombre del grupo es obligatorio',
        color: 'red',
      });
      return;
    }

    try {
      setLoadingGrupos(true);
      const response = await fetch('/api/grupos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Nombre: newGrupoNombre.trim(),
          Descripcion: newGrupoDescripcion.trim() || null,
        }),
      });

      if (!response.ok) throw new Error('Error al crear el grupo');
      
      notifications.show({
        title: 'Éxito',
        message: 'Grupo creado correctamente',
        color: 'green',
      });

      setCreateGrupoModalOpen(false);
      setNewGrupoNombre('');
      setNewGrupoDescripcion('');
      await fetchGrupos();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'No se pudo crear el grupo',
        color: 'red',
      });
    } finally {
      setLoadingGrupos(false);
    }
  };

  const handleEditGrupo = async () => {
    if (!selectedGrupo || !editGrupoNombre.trim()) {
      notifications.show({
        title: 'Error',
        message: 'El nombre del grupo es obligatorio',
        color: 'red',
      });
      return;
    }

    try {
      setLoadingGrupos(true);
      const response = await fetch(`/api/grupos/${selectedGrupo.ID_Grupo}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Nombre: editGrupoNombre.trim(),
          Descripcion: editGrupoDescripcion.trim() || null,
        }),
      });

      if (!response.ok) throw new Error('Error al actualizar el grupo');
      
      notifications.show({
        title: 'Éxito',
        message: 'Grupo actualizado correctamente',
        color: 'green',
      });

      setEditGrupoModalOpen(false);
      setSelectedGrupo(null);
      setEditGrupoNombre('');
      setEditGrupoDescripcion('');
      await fetchGrupos();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'No se pudo actualizar el grupo',
        color: 'red',
      });
    } finally {
      setLoadingGrupos(false);
    }
  };

  const handleDeleteGrupo = async () => {
    if (!grupoToDelete) return;

    try {
      setLoadingGrupos(true);
      const response = await fetch(`/api/grupos/${grupoToDelete.ID_Grupo}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Error al eliminar el grupo');
      
      notifications.show({
        title: 'Éxito',
        message: 'Grupo eliminado correctamente',
        color: 'green',
      });

      setDeleteGrupoModalOpen(false);
      setGrupoToDelete(null);
      await fetchGrupos();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'No se pudo eliminar el grupo',
        color: 'red',
      });
    } finally {
      setLoadingGrupos(false);
    }
  };

  const openEditGrupoModal = (grupo: Grupo) => {
    setSelectedGrupo(grupo);
    setEditGrupoNombre(grupo.Nombre);
    setEditGrupoDescripcion(grupo.Descripcion || '');
    setEditGrupoModalOpen(true);
  };

  const openDeleteGrupoModal = (grupo: Grupo) => {
    setGrupoToDelete(grupo);
    setDeleteGrupoModalOpen(true);
  };

  const getAuthHeader = () => {
    if (!superAdminCreds) return { 'Authorization': '' };
    const token = btoa(`${superAdminCreds.user}:${superAdminCreds.pass}`);
    return { 'Authorization': `Basic ${token}` };
  };

  const fetchUsuarios = async () => {
    if (!superAdminCreds) return;
    setLoadingUsuarios(true);
    try {
      const res = await fetch('/api/usuarios', { headers: { ...getAuthHeader() } });
      if (!res.ok) throw new Error('No autorizado o error al obtener usuarios');
      const data = await res.json();
      setUsuarios(data);
    } catch (e) {
      notifications.show({ title: 'Error', message: 'No se pudieron obtener los usuarios', color: 'red' });
    } finally {
      setLoadingUsuarios(false);
    }
  };

  const handleCreateUsuario = async () => {
    if (!newUser || !newGrupo) {
      notifications.show({ title: 'Error', message: 'Usuario y grupo son obligatorios', color: 'red' });
      return;
    }
    try {
      setLoadingUsuarios(true);
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          User: Number(newUser),
          Rol: newRol,
          ID_Grupo: newGrupo,
          Contraseña: newPass || newUser,
        })
      });
      if (!res.ok) throw new Error('No autorizado o error al crear usuario');
      notifications.show({ title: 'Éxito', message: 'Usuario creado', color: 'green' });
      setUsuarioModalOpen(false);
      setNewUser(''); setNewRol('admin_casos'); setNewGrupo(null); setNewPass('');
      fetchUsuarios();
    } catch (e) {
      notifications.show({ title: 'Error', message: 'No se pudo crear el usuario', color: 'red' });
    } finally {
      setLoadingUsuarios(false);
    }
  };

  const handleEditUsuario = async () => {
    if (!usuarioToEdit) return;
    try {
      setLoadingUsuarios(true);
      const res = await fetch(`/api/usuarios/${usuarioToEdit.User}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          Rol: editRol,
          ID_Grupo: editGrupo,
          Contraseña: editPass || undefined,
        })
      });
      if (!res.ok) throw new Error('No autorizado o error al editar usuario');
      notifications.show({ title: 'Éxito', message: 'Usuario actualizado', color: 'green' });
      setEditUsuarioModalOpen(false);
      setUsuarioToEdit(null);
      fetchUsuarios();
    } catch (e) {
      notifications.show({ title: 'Error', message: 'No se pudo editar el usuario', color: 'red' });
    } finally {
      setLoadingUsuarios(false);
    }
  };

  const handleDeleteUsuario = async () => {
    if (!usuarioToDelete) return;
    try {
      setLoadingUsuarios(true);
      const res = await fetch(`/api/usuarios/${usuarioToDelete.User}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error('No autorizado o error al eliminar usuario');
      notifications.show({ title: 'Éxito', message: 'Usuario eliminado', color: 'green' });
      setDeleteUsuarioModalOpen(false);
      setUsuarioToDelete(null);
      fetchUsuarios();
    } catch (e) {
      notifications.show({ title: 'Error', message: 'No se pudo eliminar el usuario', color: 'red' });
    } finally {
      setLoadingUsuarios(false);
    }
  };

  useEffect(() => {
    fetchDbStatus();
    fetchBackups();
    fetchGrupos();
  }, []);

  useEffect(() => {
    if (user?.rol === 'superadmin' && !superAdminCreds) {
      setSuperAdminPassModal(true);
    }
  }, [user, superAdminCreds]);

  useEffect(() => {
    if (superAdminCreds) fetchUsuarios();
  }, [superAdminCreds]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

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

  const handleSuperAdminPass = async () => {
    setSuperAdminPassError('');
    // Validar la contraseña llamando a /api/auth/me
    try {
      const token = btoa(`${user?.user}:${superAdminPass}`);
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Basic ${token}` }
      });
      if (!res.ok) throw new Error('Contraseña incorrecta');
      setSuperAdminCreds({ user: String(user?.user), pass: superAdminPass });
      setSuperAdminPassModal(false);
      setSuperAdminPass('');
    } catch (e: any) {
      setSuperAdminPassError(e.message || 'Contraseña incorrecta');
    }
  };

  return (
    <>
      {superAdminPassModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 2000,
          background: 'rgba(0,0,0,0.2)',
          backdropFilter: 'blur(6px)',
        }} />
      )}
      <Modal
        opened={superAdminPassModal}
        onClose={() => {}}
        title="Confirmar contraseña SuperAdmin"
        centered
        withCloseButton={false}
        zIndex={2100}
      >
        <Stack>
          <PasswordInput
            label="Contraseña SuperAdmin"
            value={superAdminPass}
            onChange={e => setSuperAdminPass(e.currentTarget.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSuperAdminPass(); }}
            autoFocus
            error={superAdminPassError}
          />
          <Button onClick={handleSuperAdminPass}>Acceder</Button>
        </Stack>
      </Modal>
      <Container fluid style={{ paddingLeft: 32, paddingRight: 32, maxWidth: 1600 }}>
        <Title order={2} mt="md" mb="lg">Panel de Administración</Title>
        <Grid gutter="xl" align="flex-start">
          <Grid.Col span={{ base: 12, md: 5 }}>
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
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Stack gap="lg">
              {/* Panel de Gestión de Grupos */}
              <Paper p="md" withBorder>
                <Group justify="space-between" mb="md">
                  <Title order={3}>Gestión de Grupos</Title>
                  <Button
                    leftSection={<IconPlus size={16} />}
                    onClick={() => setCreateGrupoModalOpen(true)}
                  >
                    Crear Grupo
                  </Button>
                </Group>

                {loadingGrupos ? (
                  <Loader />
                ) : (
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Nombre</Table.Th>
                        <Table.Th>Descripción</Table.Th>
                        <Table.Th>Casos</Table.Th>
                        <Table.Th>Acciones</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {grupos.map((grupo) => (
                        <Table.Tr key={grupo.ID_Grupo}>
                          <Table.Td>{grupo.Nombre}</Table.Td>
                          <Table.Td>{grupo.Descripcion || '-'}</Table.Td>
                          <Table.Td>{grupo.casos}</Table.Td>
                          <Table.Td>
                            <Group gap="xs">
                              <Tooltip label="Editar">
                                <ActionIcon
                                  color="blue"
                                  variant="light"
                                  onClick={() => openEditGrupoModal(grupo)}
                                >
                                  <IconEdit size={16} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label="Eliminar">
                                <ActionIcon
                                  color="red"
                                  variant="light"
                                  onClick={() => openDeleteGrupoModal(grupo)}
                                  disabled={grupo.casos > 0}
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
                )}
              </Paper>
              {/* Panel de Gestión de Usuarios */}
              <Paper p="md" withBorder>
                <Group justify="space-between" mb="md">
                  <Title order={3}>Gestión de Usuarios</Title>
                  <Button leftSection={<IconPlus size={16} />} onClick={() => setUsuarioModalOpen(true)}>
                    Crear Usuario
                  </Button>
                </Group>
                {loadingUsuarios ? <Loader /> : (
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>User</Table.Th>
                        <Table.Th>Rol</Table.Th>
                        <Table.Th>Grupo</Table.Th>
                        <Table.Th>Acciones</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {usuarios.map(u => (
                        <Table.Tr key={u.User}>
                          <Table.Td>{u.User}</Table.Td>
                          <Table.Td>{u.Rol}</Table.Td>
                          <Table.Td>{u.grupo?.Nombre || u.ID_Grupo}</Table.Td>
                          <Table.Td>
                            <Group gap="xs">
                              <Tooltip label="Editar">
                                <ActionIcon color="blue" variant="light" onClick={() => {
                                  setUsuarioToEdit(u);
                                  setEditRol(u.Rol);
                                  setEditGrupo(u.ID_Grupo);
                                  setEditPass('');
                                  setEditUsuarioModalOpen(true);
                                }}>
                                  <IconEdit size={16} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label="Eliminar">
                                <ActionIcon color="red" variant="light" onClick={() => {
                                  setUsuarioToDelete(u);
                                  setDeleteUsuarioModalOpen(true);
                                }}>
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
              </Paper>
            </Stack>
          </Grid.Col>
        </Grid>

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

        {/* Modal para crear grupo */}
        <Modal opened={createGrupoModalOpen} onClose={() => setCreateGrupoModalOpen(false)} title="Crear Nuevo Grupo" centered>
          <Stack>
            <TextInput
              label="Nombre del Grupo"
              placeholder="Ingrese el nombre del grupo"
              value={newGrupoNombre}
              onChange={(e) => setNewGrupoNombre(e.currentTarget.value)}
              required
            />
            <Textarea
              label="Descripción"
              placeholder="Ingrese una descripción (opcional)"
              value={newGrupoDescripcion}
              onChange={(e) => setNewGrupoDescripcion(e.currentTarget.value)}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setCreateGrupoModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateGrupo} loading={loadingGrupos}>
                Crear Grupo
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Modal para editar grupo */}
        <Modal opened={editGrupoModalOpen} onClose={() => setEditGrupoModalOpen(false)} title="Editar Grupo" centered>
          <Stack>
            <TextInput
              label="Nombre del Grupo"
              placeholder="Ingrese el nombre del grupo"
              value={editGrupoNombre}
              onChange={(e) => setEditGrupoNombre(e.currentTarget.value)}
              required
            />
            <Textarea
              label="Descripción"
              placeholder="Ingrese una descripción (opcional)"
              value={editGrupoDescripcion}
              onChange={(e) => setEditGrupoDescripcion(e.currentTarget.value)}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setEditGrupoModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleEditGrupo} loading={loadingGrupos}>
                Guardar Cambios
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Modal para eliminar grupo */}
        <Modal opened={deleteGrupoModalOpen} onClose={() => setDeleteGrupoModalOpen(false)} title="Eliminar Grupo" centered>
          <Text fw={700} mb="md" c="black">
            ¿Estás seguro de que quieres eliminar el grupo <b>{grupoToDelete?.Nombre}</b>?<br />
            <span style={{ color: '#d97706' }}>Esta acción no se puede deshacer.</span>
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setDeleteGrupoModalOpen(false)}>
              Cancelar
            </Button>
            <Button color="red" onClick={handleDeleteGrupo} loading={loadingGrupos}>
              Eliminar Grupo
            </Button>
          </Group>
        </Modal>

        {/* Modal Crear Usuario */}
        <Modal opened={usuarioModalOpen} onClose={() => setUsuarioModalOpen(false)} title="Crear Usuario" centered>
          <Stack>
            <TextInput label="Carné Profesional (User)" value={newUser} onChange={e => setNewUser(e.currentTarget.value.replace(/\D/g, ''))} maxLength={6} required />
            <Select label="Rol" value={newRol} onChange={v => setNewRol(v as any)} data={[{ value: 'admin_casos', label: 'Admin Casos' }, { value: 'superadmin', label: 'SuperAdmin' }]} required />
            <Select label="Grupo" value={newGrupo?.toString() || ''} onChange={v => setNewGrupo(Number(v))} data={grupos.map(g => ({ value: g.ID_Grupo.toString(), label: g.Nombre }))} required searchable />
            <TextInput label="Contraseña (opcional)" value={newPass} onChange={e => setNewPass(e.currentTarget.value)} type="password" />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setUsuarioModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreateUsuario} loading={loadingUsuarios}>Crear Usuario</Button>
            </Group>
          </Stack>
        </Modal>

        {/* Modal Editar Usuario */}
        <Modal opened={editUsuarioModalOpen} onClose={() => setEditUsuarioModalOpen(false)} title="Editar Usuario" centered>
          <Stack>
            <Select label="Rol" value={editRol} onChange={v => setEditRol(v as any)} data={[{ value: 'admin_casos', label: 'Admin Casos' }, { value: 'superadmin', label: 'SuperAdmin' }]} required />
            <Select label="Grupo" value={editGrupo?.toString() || ''} onChange={v => setEditGrupo(Number(v))} data={grupos.map(g => ({ value: g.ID_Grupo.toString(), label: g.Nombre }))} required searchable />
            <TextInput label="Contraseña (opcional)" value={editPass} onChange={e => setEditPass(e.currentTarget.value)} type="password" />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setEditUsuarioModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleEditUsuario} loading={loadingUsuarios}>Guardar Cambios</Button>
            </Group>
          </Stack>
        </Modal>

        {/* Modal Eliminar Usuario */}
        <Modal opened={deleteUsuarioModalOpen} onClose={() => setDeleteUsuarioModalOpen(false)} title="Eliminar Usuario" centered>
          <Text fw={700} mb="md" c="black">
            ¿Seguro que quieres eliminar el usuario <b>{usuarioToDelete?.User}</b>?<br />
            <span style={{ color: '#d97706' }}>Esta acción no se puede deshacer.</span>
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setDeleteUsuarioModalOpen(false)}>Cancelar</Button>
            <Button color="red" onClick={handleDeleteUsuario} loading={loadingUsuarios}>Eliminar Usuario</Button>
          </Group>
        </Modal>
      </Container>
    </>
  );
}

export default AdminPage; 