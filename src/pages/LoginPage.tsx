import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paper, TextInput, Button, Title, Stack, PasswordInput, Alert, Group, Text, Modal } from '@mantine/core';
import { IconLock, IconFileSpreadsheet, IconFileText, IconClock, IconMapPin } from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';

const MAP_IMAGE_URL = '/heatmap-login.png'; // Imagen local para el fondo del login

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [firstTimeModalOpen, setFirstTimeModalOpen] = useState(false);
  const [newSuperAdminUser, setNewSuperAdminUser] = useState('');
  const [newSuperAdminPass, setNewSuperAdminPass] = useState('');
  const [newSuperAdminPassConfirm, setNewSuperAdminPassConfirm] = useState('');
  const [creatingSuperAdmin, setCreatingSuperAdmin] = useState(false);
  const [superAdminError, setSuperAdminError] = useState('');
  const navigate = useNavigate();
  const { login, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (!isAuthenticated && !firstTimeModalOpen) {
        checkInitialSetup();
    }
  }, [isAuthenticated, firstTimeModalOpen]);

  const checkInitialSetup = async () => {
    try {
      const response = await fetch('/api/admin/database/status');
      if (!response.ok) {
        throw new Error('Error al verificar el estado de configuración');
      }
      const data = await response.json();
      console.log('Respuesta /api/setup/status:', data);
      if (data.needs_superadmin_setup) {
        setFirstTimeModalOpen(true);
      }
    } catch (err) {
      console.error('Error checking initial setup:', err);
      setError('No se pudo verificar la configuración inicial del sistema.'); 
    }
  };

  const handleCreateSuperAdmin = async () => {
    if (!newSuperAdminUser || !newSuperAdminPass) {
      setSuperAdminError('Todos los campos son obligatorios');
      return;
    }
    if (newSuperAdminUser.length < 4) {
        setSuperAdminError('El número de usuario debe tener al menos 4 dígitos.');
        return;
    }
    if (newSuperAdminPass !== newSuperAdminPassConfirm) {
      setSuperAdminError('Las contraseñas no coinciden');
      return;
    }

    setCreatingSuperAdmin(true);
    setSuperAdminError('');

    try {
      const response = await fetch('/api/usuarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          User: parseInt(newSuperAdminUser, 10),
          Contraseña: newSuperAdminPass,
          Rol: 'superadmin',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const detail = errorData?.detail || 'Error desconocido al crear superadmin.';
        throw new Error(detail);
      }
      
      await login(newSuperAdminUser, newSuperAdminPass);
      setFirstTimeModalOpen(false);
      navigate('/');

    } catch (err: any) {
      console.error('Error creating superadmin:', err);
      setSuperAdminError(err.message || 'Error al crear el superadmin. Por favor, intente nuevamente.');
    } finally {
      setCreatingSuperAdmin(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await login(username, pass);
    } catch (err) {
      setError('Usuario o contraseña incorrectos. Verifique los datos e intente de nuevo.');
      console.error("Login page error after authContext.login failed:", err);
    }
  };

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      width: '100vw',
    }}>
      {/* Columna Izquierda: Login + fondo mapa difuminado */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Fondo de mapa difuminado */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${MAP_IMAGE_URL})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(2px)',
          opacity: 0.18,
          zIndex: 1,
          pointerEvents: 'none',
        }} />
        {/* Formulario de login */}
        <Paper radius="md" p="xl" withBorder style={{ position: 'relative', zIndex: 2, maxWidth: 420, width: '100%', backgroundColor: 'rgba(255,255,255,0.95)' }}>
          <Title order={2} mb="md" ta="center">
            LPR Tracer
          </Title>
          <form onSubmit={handleSubmit}>
            <Stack>
              <TextInput
                required
                label="Usuario"
                placeholder="Tu número de usuario (ej: 117020)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
              />
              <PasswordInput
                required
                label="Contraseña"
                placeholder="Tu contraseña"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                disabled={isLoading}
              />
              {error && (
                <Alert color="red" title="Error de acceso" variant="filled" icon={<IconLock />}>
                  {error}
                </Alert>
              )}
              <Button type="submit" loading={isLoading} fullWidth>
                Iniciar Sesión
              </Button>
            </Stack>
          </form>
        </Paper>
      </div>
      {/* Columna Derecha: Información */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #172983 80%, #2b4fcf 100%)',
        color: 'white',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'relative', zIndex: 3, maxWidth: 480, textAlign: 'left', width: '100%' }}>
          <Text size="lg" mb="xl" style={{ color: 'white', opacity: 0.95, textAlign: 'justify' }}>
            Plataforma integral para la investigación policial sobre matrículas procedentes de lecturas LPR y OCR, así como de dispositivos GPS. Gestión, análisis y visualización integral de los datos, organizados en una estructura de casos asignados a diferentes grupos o unidades.
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <IconFileSpreadsheet size={40} />
              <div style={{ margin: 0 }}>
                <Text fw={700} style={{ color: 'white', fontSize: 18 }}>Importación Inteligente</Text>
                <Text size="sm" style={{ color: 'white', opacity: 0.8 }}>
                  Sube y procesa archivos Excel de lecturas de matrículas de forma automática y eficiente.
                </Text>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <IconFileText size={40} />
              <div style={{ margin: 0 }}>
                <Text fw={700} style={{ color: 'white', fontSize: 18 }}>Gestión de Casos y Vehículos</Text>
                <Text size="sm" style={{ color: 'white', opacity: 0.8 }}>
                  Organiza, filtra y analiza casos, vehículos de interés y sus movimientos en el sistema.
                </Text>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <IconMapPin size={40} />
              <div style={{ margin: 0 }}>
                <Text fw={700} style={{ color: 'white', fontSize: 18 }}>Visualización y Análisis Geográfico</Text>
                <Text size="sm" style={{ color: 'white', opacity: 0.8 }}>
                  Visualiza los resultados de las lecturas y los análisis GPS sobre el mapa, detecta patrones de movimiento y obtén información geoespacial avanzada.
                </Text>
              </div>
            </div>
          </div>
        </div>
        {/* Copyright abajo a la derecha */}
        <div style={{
          position: 'absolute',
          right: 32,
          bottom: 24,
          color: 'rgba(255,255,255,0.7)',
          fontSize: 14,
          zIndex: 4,
        }}>
          LPR Tracer - © {new Date().getFullYear()} - Herramienta de Análisis Forense
        </div>
      </div>
      {/* Modal de primera inicialización */}
      <Modal
        opened={firstTimeModalOpen}
        onClose={() => { /* No permitir cerrar manualmente si es necesario el setup */ }}
        title="Configuración Inicial Requerida"
        closeOnClickOutside={false}
        closeOnEscape={false}
        withCloseButton={false}
        size="md"
      >
        <Stack>
          <Text>
            Bienvenido a Tracer. Es necesario configurar la cuenta del primer Super Administrador 
            para poder utilizar la aplicación.
          </Text>
          <TextInput
            required
            label="Número de Usuario para Super Administrador"
            placeholder="Ej: 117020"
            value={newSuperAdminUser}
            onChange={(e) => setNewSuperAdminUser(e.target.value)}
            disabled={creatingSuperAdmin}
            error={superAdminError.includes("usuario") ? superAdminError : null}
          />
          <PasswordInput
            required
            label="Contraseña para Super Administrador"
            placeholder="Ingrese la contraseña"
            value={newSuperAdminPass}
            onChange={(e) => setNewSuperAdminPass(e.target.value)}
            disabled={creatingSuperAdmin}
            error={superAdminError.includes("contraseña") && !superAdminError.includes("coinciden") ? superAdminError : null}
          />
          <PasswordInput
            required
            label="Confirmar Contraseña"
            placeholder="Confirme la contraseña"
            value={newSuperAdminPassConfirm}
            onChange={(e) => setNewSuperAdminPassConfirm(e.target.value)}
            disabled={creatingSuperAdmin}
            error={superAdminError.includes("coinciden") ? superAdminError : null}
          />
          {superAdminError && !superAdminError.includes("usuario") && !superAdminError.includes("contraseña") && (
             <Alert color="red" title="Error" variant="filled">
                {superAdminError}
             </Alert>
          )}
          <Button onClick={handleCreateSuperAdmin} loading={creatingSuperAdmin} fullWidth>
            Crear Super Administrador e Iniciar Sesión
          </Button>
        </Stack>
      </Modal>
    </div>
  );
};

export default LoginPage; 