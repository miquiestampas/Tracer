import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paper, TextInput, Button, Title, Stack, PasswordInput, Alert, Group, Text, Modal } from '@mantine/core';
import { IconLock, IconFileSpreadsheet, IconFileText, IconClock, IconMapPin } from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';

const MAP_IMAGE_URL = '/heatmap-login.png'; // Imagen local para el fondo del login

const LoginPage: React.FC = () => {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [firstTimeModalOpen, setFirstTimeModalOpen] = useState(false);
  const [newSuperAdminUser, setNewSuperAdminUser] = useState('');
  const [newSuperAdminPass, setNewSuperAdminPass] = useState('');
  const [newSuperAdminPassConfirm, setNewSuperAdminPassConfirm] = useState('');
  const [creatingSuperAdmin, setCreatingSuperAdmin] = useState(false);
  const [superAdminError, setSuperAdminError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    checkSuperAdmin();
  }, []);

  const checkSuperAdmin = async () => {
    try {
      const response = await fetch('/api/auth/check-superadmin');
      const data = await response.json();
      console.log('Respuesta check-superadmin:', data);
      if (!data.exists) {
        setFirstTimeModalOpen(true);
      }
    } catch (error) {
      console.error('Error checking superadmin:', error);
      // No mostrar el modal si hay error, solo loguear
    }
  };

  const handleCreateSuperAdmin = async () => {
    if (!newSuperAdminUser || !newSuperAdminPass) {
      setSuperAdminError('Todos los campos son obligatorios');
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
          User: newSuperAdminUser,
          Contraseña: newSuperAdminPass,
          Rol: 'superadmin',
          ID_Grupo: 1
        }),
      });

      if (!response.ok) {
        throw new Error('Error al crear el superadmin');
      }

      // Iniciar sesión automáticamente con el nuevo superadmin
      await login(newSuperAdminUser, newSuperAdminPass);
      setFirstTimeModalOpen(false);
      navigate('/dashboard');
    } catch (error) {
      console.error('Error creating superadmin:', error);
      setSuperAdminError('Error al crear el superadmin. Por favor, intente nuevamente.');
    } finally {
      setCreatingSuperAdmin(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(user, pass);
      navigate('/dashboard');
    } catch (error) {
      setError('Usuario o contraseña incorrectos');
    } finally {
      setLoading(false);
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
                placeholder="Tu número de usuario"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                disabled={loading}
              />
              <PasswordInput
                required
                label="Contraseña"
                placeholder="Tu contraseña"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                disabled={loading}
              />
              {error && (
                <Alert color="red" variant="filled">
                  {error}
                </Alert>
              )}
              <Button type="submit" loading={loading} fullWidth>
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
        onClose={() => {}}
        title="Primera Inicialización"
        closeOnClickOutside={false}
        closeOnEscape={false}
        withCloseButton={false}
      >
        <Stack>
          <Text>
            Bienvenido a Tracer. Como es la primera vez que ejecuta la aplicación, 
            debe crear una cuenta de Super Administrador.
          </Text>
          <TextInput
            required
            label="Número de Usuario"
            placeholder="Ingrese su número de usuario"
            value={newSuperAdminUser}
            onChange={(e) => setNewSuperAdminUser(e.target.value)}
            disabled={creatingSuperAdmin}
          />
          <PasswordInput
            required
            label="Contraseña"
            placeholder="Ingrese su contraseña"
            value={newSuperAdminPass}
            onChange={(e) => setNewSuperAdminPass(e.target.value)}
            disabled={creatingSuperAdmin}
          />
          <PasswordInput
            required
            label="Confirmar Contraseña"
            placeholder="Confirme su contraseña"
            value={newSuperAdminPassConfirm}
            onChange={(e) => setNewSuperAdminPassConfirm(e.target.value)}
            disabled={creatingSuperAdmin}
          />
          {superAdminError && (
            <Alert color="red" variant="filled">
              {superAdminError}
            </Alert>
          )}
          <Button 
            onClick={handleCreateSuperAdmin} 
            loading={creatingSuperAdmin}
            fullWidth
          >
            Crear Super Administrador
          </Button>
        </Stack>
      </Modal>
    </div>
  );
};

export default LoginPage; 