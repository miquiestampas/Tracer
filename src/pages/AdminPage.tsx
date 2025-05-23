import React, { useState, useEffect, useRef } from 'react';
import { Container, Title, Paper, Group, Button, Text, Stack, Select, Alert, Loader, Table, Badge, ActionIcon, Tooltip, Modal, TextInput, Textarea, Grid, PasswordInput, SimpleGrid, Card, Divider, Box, FileInput, NumberInput, Switch } from '@mantine/core';
import { IconDatabase, IconRefresh, IconTrash, IconDeviceFloppy, IconRestore, IconDownload, IconEdit, IconPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/api';
import { getCasos, getArchivosPorCaso, deleteCaso as deleteCasoApi, updateCaso } from '../services/casosApi';
import type { Caso, ArchivoExcel } from '../types/data';
import { updateFooterConfig } from '../services/configApi';
import { openConfirmModal } from '@mantine/modals';

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
  User: string;
  Rol: 'superadmin' | 'admingrupo' | 'user_consulta';
  ID_Grupo: number | null;
  grupo?: Grupo;
}

interface UsuarioCreatePayload {
  User: string;
  Rol: 'superadmin' | 'admingrupo' | 'user_consulta';
  Contraseña: string;
  ID_Grupo?: number | null;
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
  const [newUser, setNewUser] = useState('');
  const [newRol, setNewRol] = useState<'superadmin' | 'admingrupo' | 'user_consulta'>('user_consulta');
  const [newGrupo, setNewGrupo] = useState<number | null>(null);
  const [newPass, setNewPass] = useState('');
  const [editRol, setEditRol] = useState<'superadmin' | 'admingrupo' | 'user_consulta'>('user_consulta');
  const [editGrupo, setEditGrupo] = useState<number | null>(null);
  const [editPass, setEditPass] = useState('');
  const [casos, setCasos] = useState<Caso[]>([]);
  const [casosLoading, setCasosLoading] = useState(true);
  const [archivosPorCaso, setArchivosPorCaso] = useState<{ [key: number]: ArchivoExcel[] }>({});
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [casoToReassign, setCasoToReassign] = useState<Caso | null>(null);
  const [nuevoGrupoId, setNuevoGrupoId] = useState<number | null>(null);
  const [footerText, setFooterText] = useState('JSP Madrid - Brigada Provincial de Policía Judicial');
  const [footerModalOpen, setFooterModalOpen] = useState(false);
  const [casosSizes, setCasosSizes] = useState<{ [key: number]: number }>({});

  const fetchCasosYArchivos = async () => {
    setCasosLoading(true);
    try {
      const data = await getCasos();
      const casosData = data || []; // Asegurar que casosData es un array
      setCasos(casosData);
      const archivosPromises = casosData.map(caso => 
        getArchivosPorCaso(caso.ID_Caso).then(archivos => ({ [caso.ID_Caso]: archivos || [] }))
      );
      const archivosResults = await Promise.all(archivosPromises);
      setArchivosPorCaso(Object.assign({}, ...archivosResults));
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'No se pudieron cargar los casos o archivos.',
        color: 'red',
      });
    } finally {
      setCasosLoading(false);
    }
  };

  const fetchDbStatus = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/admin/database/status');
      setDbStatus(response.data);
    } catch (error: any) {
      notifications.show({
        title: 'Error',
        message: error.response?.data?.detail || 'No se pudo obtener el estado de la base de datos',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBackups = async () => {
    try {
      const response = await apiClient.get('/api/admin/database/backups');
      console.log('Raw backup data from API:', response.data.backups);
      setBackups(response.data.backups);
    } catch (error: any) {
      notifications.show({
        title: 'Error',
        message: error.response?.data?.detail || 'No se pudieron obtener los backups',
        color: 'red',
      });
    }
  };

  const handleBackup = async () => {
    try {
      setLoading(true);
      const response = await apiClient.post('/api/admin/database/backup');
      notifications.show({
        title: 'Éxito',
        message: response.data.message || 'Backup creado correctamente',
        color: 'green',
      });
      await Promise.all([fetchDbStatus(), fetchBackups()]);
    } catch (error: any) {
      notifications.show({
        title: 'Error',
        message: error.response?.data?.detail || 'No se pudo crear el backup',
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
      const response = await apiClient.post('/api/admin/database/restore', { backup: selectedBackup });
      notifications.show({
        title: 'Éxito',
        message: response.data.message || 'Base de datos restaurada correctamente',
        color: 'green',
      });
      await Promise.all([fetchDbStatus(), fetchBackups()]);
    } catch (error: any) {
      notifications.show({
        title: 'Error',
        message: error.response?.data?.detail || 'No se pudo restaurar la base de datos',
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
      const response = await apiClient.post('/api/admin/database/reset');
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
      const response = await apiClient.post('/api/admin/database/restore', formData);
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
      const response = await apiClient.post('/api/admin/database/clear_except_lectores');
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
      const restoreResponse = await apiClient.post('/api/admin/database/restore_from_filename', { filename: backupToRestore.filename });
      
      notifications.show({
        title: 'Éxito',
        message: restoreResponse.data.message || 'Base de datos restaurada correctamente desde el backup seleccionado.',
        color: 'green',
      });
      await Promise.all([fetchDbStatus(), fetchBackups()]);
      setRestoreBackupModalOpen(false);
      setBackupToRestore(null);
    } catch (error: any) {
      notifications.show({
        title: 'Error al Restaurar Backup',
        message: error.response?.data?.detail || error.message || 'No se pudo restaurar la base de datos',
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
      await apiClient.delete(`/api/admin/database/backups/${backupToDelete.filename}`);
      
      notifications.show({
        title: 'Éxito',
        message: 'Backup eliminado correctamente',
        color: 'green',
      });
      await fetchBackups();
      setDeleteBackupModalOpen(false);
      setBackupToDelete(null);
    } catch (error: any) {
      notifications.show({
        title: 'Error al Eliminar Backup',
        message: error.response?.data?.detail || error.message || 'No se pudo eliminar el backup',
        color: 'red',
      });
    } finally {
      setDeletingBackup(false);
    }
  };

  const fetchGrupos = async () => {
    setLoadingGrupos(true);
    try {
      const response = await apiClient.get('/api/grupos');
      setGrupos(response.data);
    } catch (error: any) {
      notifications.show({
        title: 'Error',
        message: error.response?.data?.detail || 'No se pudieron obtener los grupos',
        color: 'red',
      });
    } finally {
      setLoadingGrupos(false);
    }
  };

  const handleCreateGrupo = async () => {
    if (!newGrupoNombre.trim()) {
      notifications.show({
        title: 'Error de Validación',
        message: 'El nombre del grupo es obligatorio',
        color: 'red',
      });
      return;
    }

    try {
      setLoadingGrupos(true);
      const response = await apiClient.post('/api/grupos', {
        Nombre: newGrupoNombre.trim(),
        Descripcion: newGrupoDescripcion.trim() || null,
      });
      
      notifications.show({
        title: 'Éxito',
        message: response.data.message || 'Grupo creado correctamente',
        color: 'green',
      });

      setCreateGrupoModalOpen(false);
      setNewGrupoNombre('');
      setNewGrupoDescripcion('');
      await fetchGrupos();
    } catch (error: any) {
      notifications.show({
        title: 'Error al Crear Grupo',
        message: error.response?.data?.detail || error.message || 'No se pudo crear el grupo',
        color: 'red',
      });
    } finally {
      setLoadingGrupos(false);
    }
  };

  const handleEditGrupo = async () => {
    if (!selectedGrupo || !editGrupoNombre.trim()) {
      notifications.show({
        title: 'Error de Validación',
        message: 'El nombre del grupo es obligatorio',
        color: 'red',
      });
      return;
    }

    try {
      setLoadingGrupos(true);
      const response = await apiClient.put(`/api/grupos/${selectedGrupo.ID_Grupo}`, {
        Nombre: editGrupoNombre.trim(),
        Descripcion: editGrupoDescripcion.trim() || null,
      });
      
      notifications.show({
        title: 'Éxito',
        message: response.data.message || 'Grupo actualizado correctamente',
        color: 'green',
      });

      setEditGrupoModalOpen(false);
      setSelectedGrupo(null);
      setEditGrupoNombre('');
      setEditGrupoDescripcion('');
      await fetchGrupos();
    } catch (error: any) {
      notifications.show({
        title: 'Error al Actualizar Grupo',
        message: error.response?.data?.detail || error.message || 'No se pudo actualizar el grupo',
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
      await apiClient.delete(`/api/grupos/${grupoToDelete.ID_Grupo}`);
      
      notifications.show({
        title: 'Éxito',
        message: 'Grupo eliminado correctamente',
        color: 'green',
      });

      setDeleteGrupoModalOpen(false);
      setGrupoToDelete(null);
      await fetchGrupos();
    } catch (error: any) {
      notifications.show({
        title: 'Error al Eliminar Grupo',
        message: error.response?.data?.detail || error.message || 'No se pudo eliminar el grupo',
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

  const fetchUsuarios = async () => {
    console.log('Fetching usuarios...');
    setLoadingUsuarios(true);
    try {
      const response = await apiClient.get('/api/usuarios');
      setUsuarios(response.data);
    } catch (error: any) {
      console.error('Error fetching usuarios:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'No se pudieron obtener los usuarios';
      notifications.show({
        title: 'Error al cargar Usuarios',
        message: errorMessage,
        color: 'red',
      });
    } finally {
      setLoadingUsuarios(false);
    }
  };

  const handleCreateUsuario = async () => {
    if (!newUser.trim() || !newPass.trim() || (newRol !== 'superadmin' && !newGrupo)) {
      notifications.show({ title: 'Error de Validación', message: 'Usuario y Contraseña son obligatorios. Grupo es obligatorio si el rol no es superadmin.', color: 'red' });
      return;
    }
    if (newPass.trim().length < 6) {
       notifications.show({ title: 'Error de Validación', message: 'La contraseña debe tener al menos 6 caracteres.', color: 'red' });
       return;
    }
    try {
      setLoadingUsuarios(true);
      const payload: UsuarioCreatePayload = {
        User: String(newUser).trim(),
        Rol: newRol,
        Contraseña: newPass.trim(),
      };
      if (newRol !== 'superadmin') {
        payload.ID_Grupo = newGrupo;
      }
      
      const response = await apiClient.post('/api/usuarios', payload);
      
      notifications.show({ title: 'Éxito', message: response.data.message || 'Usuario creado correctamente', color: 'green' });
      setUsuarioModalOpen(false);
      setNewUser(''); setNewRol('user_consulta'); setNewGrupo(null); setNewPass('');
      fetchUsuarios();
    } catch (e: any) {
      notifications.show({ title: 'Error al Crear Usuario', message: e.response?.data?.detail || e.message || 'No se pudo crear el usuario', color: 'red' });
    } finally {
      setLoadingUsuarios(false);
    }
  };

  const handleEditUsuario = async () => {
    if (!usuarioToEdit) return;
    if (editPass && editPass.length < 6) {
       notifications.show({ title: 'Error de Validación', message: 'La nueva contraseña debe tener al menos 6 caracteres.', color: 'red' });
       return;
    }
    try {
      setLoadingUsuarios(true);
      const payload: any = {
        Rol: editRol,
        ID_Grupo: editRol === 'superadmin' ? null : editGrupo,
      };
      if (editPass.trim()) {
        payload.Contraseña = editPass.trim();
      }

      const response = await apiClient.put(`/api/usuarios/${usuarioToEdit.User}`, payload);
      
      notifications.show({ title: 'Éxito', message: response.data.message || 'Usuario actualizado correctamente', color: 'green' });
      setEditUsuarioModalOpen(false);
      setUsuarioToEdit(null);
      setEditPass('');
      fetchUsuarios();
    } catch (e: any) {
      notifications.show({ title: 'Error al Editar Usuario', message: e.response?.data?.detail || e.message || 'No se pudo editar el usuario', color: 'red' });
    } finally {
      setLoadingUsuarios(false);
    }
  };

  const handleDeleteUsuario = async () => {
    if (!usuarioToDelete) return;
    try {
      setLoadingUsuarios(true);
      await apiClient.delete(`/api/usuarios/${usuarioToDelete.User}`);
      
      notifications.show({ title: 'Éxito', message: 'Usuario eliminado correctamente', color: 'green' });
      setDeleteUsuarioModalOpen(false);
      setUsuarioToDelete(null);
      fetchUsuarios();
    } catch (e: any) {
      notifications.show({ title: 'Error al Eliminar Usuario', message: e.response?.data?.detail || e.message || 'No se pudo eliminar el usuario', color: 'red' });
    } finally {
      setLoadingUsuarios(false);
    }
  };

  const handleDeleteCaso = async (casoId: number) => {
    openConfirmModal({
      title: 'Confirmar Eliminación',
      centered: true,
      children: (
        <Text size="sm">
          ¿Estás seguro de que quieres eliminar este caso y todos sus archivos/lecturas? Esta acción no se puede deshacer.
        </Text>
      ),
      labels: { confirm: 'Eliminar Caso', cancel: "Cancelar" },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          setCasosLoading(true); // Mantener para feedback inmediato
          await deleteCasoApi(casoId); // Usar la función renombrada de casosApi
          notifications.show({
            title: 'Caso Eliminado',
            message: 'El caso ha sido eliminado correctamente.',
            color: 'green',
          });
          fetchCasosYArchivos(); // Ahora esto es válido
        } catch (error) {
          notifications.show({
            title: 'Error al eliminar',
            message: 'No se pudo eliminar el caso.',
            color: 'red',
          });
        } finally {
          // setCasosLoading(false); // fetchCasosYArchivos ya lo hace
        }
      },
    });
  };

  const handleOpenReassign = (caso: Caso) => {
    setCasoToReassign(caso);
    setNuevoGrupoId(null);
    setReassignModalOpen(true);
  };

  const handleReassignGrupo = async () => {
    if (!casoToReassign || !nuevoGrupoId) return;
    try {
      await updateCaso(casoToReassign.ID_Caso, { ID_Grupo: nuevoGrupoId });
      setCasos((prev) => prev.map((c) => c.ID_Caso === casoToReassign.ID_Caso ? { ...c, ID_Grupo: nuevoGrupoId } : c));
      notifications.show({ title: 'Éxito', message: 'Caso reasignado', color: 'green' });
      setReassignModalOpen(false);
      setCasoToReassign(null);
    } catch (e) {
      notifications.show({ title: 'Error', message: 'No se pudo reasignar el caso', color: 'red' });
    }
  };

  const handleSaveFooter = async () => {
    try {
      await updateFooterConfig(footerText);
      setFooterModalOpen(false);
      notifications.show({ title: 'Éxito', message: 'Texto del footer actualizado', color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Error', message: 'No se pudo actualizar el texto del footer', color: 'red' });
    }
  };

  // Función para cargar el tamaño de los archivos de un caso
  const loadCasoSize = async (casoId: number) => {
    try {
      const response = await apiClient.get(`/api/casos/${casoId}/size`);
      setCasosSizes(prev => ({ ...prev, [casoId]: response.data.size_mb }));
    } catch (error) {
      console.error(`Error al cargar el tamaño del caso ${casoId}:`, error);
    }
  };

  useEffect(() => {
    fetchDbStatus();
    fetchBackups();
    fetchGrupos();
    fetchUsuarios();
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    fetchCasosYArchivos();
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setCasosLoading(true);
      try {
        const [casosData, archivosData] = await Promise.all([
          getCasos(),
          Promise.all(casos.map(caso => getArchivosPorCaso(caso.ID_Caso)))
        ]);
        
        setCasos(casosData);
        
        // Crear el objeto de archivos por caso
        const archivosMap: { [key: number]: ArchivoExcel[] } = {};
        archivosData.forEach((archivos, index) => {
          archivosMap[casos[index].ID_Caso] = archivos;
        });
        setArchivosPorCaso(archivosMap);
        
        // Cargar los tamaños de los casos
        await Promise.all(casosData.map(caso => loadCasoSize(caso.ID_Caso)));
        
      } catch (error) {
        console.error('Error al cargar datos:', error);
        notifications.show({
          title: 'Error',
          message: 'No se pudieron cargar los datos',
          color: 'red'
        });
      } finally {
        setCasosLoading(false);
      }
    };
    
    loadData();
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
    <>
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
                {loadingUsuarios ? (
                  <Loader />
                ) : usuarios.length === 0 ? (
                  <Text color="dimmed" ta="center" py="md">No hay usuarios registrados.</Text>
                ) : (
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
              {/* Panel de Gestión de Casos */}
              <Paper p="md" withBorder mt="lg">
                <Group justify="space-between" mb="md">
                  <Title order={3}>Gestión de Casos</Title>
                </Group>
                {casosLoading ? <Loader /> : (
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Nombre</Table.Th>
                        <Table.Th>Grupo</Table.Th>
                        <Table.Th>Archivos</Table.Th>
                        <Table.Th>Lecturas</Table.Th>
                        <Table.Th>Peso (MB)</Table.Th>
                        <Table.Th>Acciones</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {casos.map((caso) => {
                        const archivos = archivosPorCaso[caso.ID_Caso] || [];
                        const numArchivos = archivos.length;
                        const totalLecturas = archivos.reduce((acc, a) => acc + (a.Total_Registros || 0), 0);
                        const totalMB = casosSizes[caso.ID_Caso] ? `${casosSizes[caso.ID_Caso]} MB` : '-';
                        let grupoNombre = '-';
                        if ('grupo' in caso && (caso as any).grupo?.Nombre) {
                          grupoNombre = (caso as any).grupo.Nombre;
                        } else if ('ID_Grupo' in caso) {
                          grupoNombre = (caso as any).ID_Grupo;
                        }
                        return (
                          <Table.Tr key={caso.ID_Caso}>
                            <Table.Td>{caso.Nombre_del_Caso}</Table.Td>
                            <Table.Td>{grupoNombre}</Table.Td>
                            <Table.Td>{numArchivos}</Table.Td>
                            <Table.Td>{totalLecturas}</Table.Td>
                            <Table.Td>{totalMB}</Table.Td>
                            <Table.Td>
                              <Group gap="xs">
                                <Tooltip label="Reasignar grupo">
                                  <ActionIcon color="blue" variant="light" onClick={() => handleOpenReassign(caso)}>
                                    <IconEdit size={16} />
                                  </ActionIcon>
                                </Tooltip>
                                <Tooltip label="Eliminar">
                                  <ActionIcon color="red" variant="light" onClick={() => handleDeleteCaso(caso.ID_Caso)}>
                                    <IconTrash size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
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
            <Select
              label="Rol"
              placeholder="Seleccione un rol"
              required
              value={newRol}
              onChange={(value) => setNewRol(value as 'superadmin' | 'admingrupo' | 'user_consulta')}
              data={[
                { value: 'superadmin', label: 'Superadmin' },
                { value: 'admingrupo', label: 'Admin Grupo' },
                { value: 'user_consulta', label: 'Usuario Consulta' },
              ]}
              error={!newRol && 'El rol es obligatorio'}
            />
            {newRol !== 'superadmin' && (
              <Select label="Grupo" value={newGrupo?.toString() || ''} onChange={v => setNewGrupo(Number(v))} data={grupos.map(g => ({ value: g.ID_Grupo.toString(), label: g.Nombre }))} required searchable />
            )}
            <TextInput label="Contraseña" value={newPass} onChange={e => setNewPass(e.currentTarget.value)} type="password" required />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setUsuarioModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreateUsuario} loading={loadingUsuarios}>Crear Usuario</Button>
            </Group>
          </Stack>
        </Modal>

        {/* Modal Editar Usuario */}
        <Modal opened={editUsuarioModalOpen} onClose={() => setEditUsuarioModalOpen(false)} title="Editar Usuario" centered>
          <Stack>
            <Select
              label="Rol"
              placeholder="Seleccione un rol"
              required
              value={editRol}
              onChange={(value) => setEditRol(value as 'superadmin' | 'admingrupo' | 'user_consulta')}
              data={[
                { value: 'superadmin', label: 'Superadmin' },
                { value: 'admingrupo', label: 'Admin Grupo' },
                { value: 'user_consulta', label: 'Usuario Consulta' },
              ]}
            />
            <Select label="Grupo" value={editGrupo?.toString() || ''} onChange={v => setEditGrupo(Number(v))} data={grupos.map(g => ({ value: g.ID_Grupo.toString(), label: g.Nombre }))} required searchable />
            <TextInput label="Contraseña" value={editPass} onChange={e => setEditPass(e.currentTarget.value)} type="password" />
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

        {/* Modal Reasignar Grupo */}
        <Modal opened={reassignModalOpen} onClose={() => setReassignModalOpen(false)} title="Reasignar Grupo" centered>
          <Stack>
            <Select
              label="Nuevo Grupo"
              value={nuevoGrupoId?.toString() || ''}
              onChange={v => setNuevoGrupoId(Number(v))}
              data={grupos.map(g => ({ value: g.ID_Grupo.toString(), label: g.Nombre }))}
              required
              searchable
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setReassignModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleReassignGrupo}>Reasignar</Button>
            </Group>
          </Stack>
        </Modal>

        {/* Módulo de Personalización del Footer */}
        <Paper withBorder p="md" mt="xl">
          <Title order={3} mb="md">Personalización del Footer</Title>
          <Text size="sm" c="dimmed" mb="md">
            Personaliza el texto que aparece en el footer del Sidebar.
          </Text>
          <Group>
            <TextInput
              label="Texto del Footer"
              value={footerText}
              onChange={(e) => setFooterText(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button onClick={() => setFooterModalOpen(true)} mt={24}>
              Guardar Cambios
            </Button>
          </Group>
        </Paper>

        {/* Modal de confirmación para guardar el footer */}
        <Modal opened={footerModalOpen} onClose={() => setFooterModalOpen(false)} title="Confirmar Cambios" centered>
          <Text mb="md">
            ¿Estás seguro de que quieres cambiar el texto del footer a:
            <br />
            <b>{footerText}</b>
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setFooterModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveFooter}>
              Confirmar
            </Button>
          </Group>
        </Modal>
      </Container>
    </>
  );
}

export default AdminPage; 