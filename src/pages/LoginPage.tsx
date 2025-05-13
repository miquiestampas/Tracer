import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paper, TextInput, Button, Title, Stack, PasswordInput, Alert, Group, Text } from '@mantine/core';
import { IconLock, IconFileSpreadsheet, IconFileText, IconClock } from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';

const MAP_IMAGE_URL = 'https://a.tile.openstreetmap.org/6/32/24.png'; // Puedes cambiarla por otra imagen de mapa si lo prefieres

const LoginPage: React.FC = () => {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const token = btoa(`${user}:${pass}`);
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Basic ${token}` }
      });
      if (!res.ok) throw new Error('Credenciales incorrectas');
      const data = await res.json();
      login({
        user: data.User,
        rol: data.Rol,
        grupo: data.grupo,
        token: token,
        rawUser: user,
        rawPass: pass
      });
      navigate('/');
    } catch (e: any) {
      setError(e.message || 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'row',
        background: '#f7fafc',
      }}
    >
      {/* Panel Izquierdo: Login */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Imagen de fondo heatmap difuminada */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'url(/heatmap-login.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(5px)',
            opacity: 0.18,
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
        {/* Formulario de login */}
        <Paper p="xl" radius="md" withBorder style={{ minWidth: 340, boxShadow: '0 4px 24px rgba(0,0,0,0.07)', position: 'relative', zIndex: 2 }}>
          <Title order={2} mb="lg" style={{ color: '#172983', fontWeight: 800 }}>LPR Tracer</Title>
          <Text c="dimmed" size="sm" mb="md">Inicie sesión para acceder al sistema</Text>
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextInput
                label="Código de Usuario"
                value={user}
                onChange={e => setUser(e.currentTarget.value.replace(/\D/g, ''))}
                maxLength={6}
                required
                autoFocus
              />
              <PasswordInput
                label="Contraseña"
                value={pass}
                onChange={e => setPass(e.currentTarget.value)}
                required
              />
              {error && <Alert color="red">{error}</Alert>}
              <Button type="submit" loading={loading} fullWidth>Iniciar Sesión</Button>
            </Stack>
          </form>
          <Text size="xs" mt="md" c="dimmed" style={{ textAlign: 'center' }}>
            Los usuarios son creados por el administrador del sistema
          </Text>
        </Paper>
      </div>

      {/* Panel Derecho: Info + Fondo Mapa */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          background: '#172983',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Imagen de mapa difuminada */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${MAP_IMAGE_URL})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(8px)',
            opacity: 0.25,
            zIndex: 1,
          }}
        />
        {/* Capa de color azul semitransparente para reforzar el color */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#172983',
            opacity: 0.85,
            zIndex: 2,
          }}
        />
        {/* Contenido informativo */}
        <div style={{ position: 'relative', zIndex: 3, maxWidth: 420, textAlign: 'left' }}>
          <Title order={2} mb="md" style={{ fontWeight: 800, color: 'white' }}>
            LPR Tracer
          </Title>
          <Text size="lg" mb="xl" style={{ color: 'white', opacity: 0.95 }}>
            Plataforma integral para la gestión, análisis y visualización de lecturas de matrículas y dispositivos LPR.
          </Text>
          <Stack gap="md">
            <Group>
              <IconFileSpreadsheet size={28} />
              <div>
                <Text fw={700} style={{ color: 'white' }}>Importación Inteligente</Text>
                <Text size="sm" style={{ color: 'white', opacity: 0.8 }}>
                  Sube y procesa archivos Excel de lecturas de matrículas de forma automática y eficiente.
                </Text>
              </div>
            </Group>
            <Group>
              <IconFileText size={28} />
              <div>
                <Text fw={700} style={{ color: 'white' }}>Gestión de Casos y Vehículos</Text>
                <Text size="sm" style={{ color: 'white', opacity: 0.8 }}>
                  Organiza, filtra y analiza casos, vehículos de interés y sus movimientos en el sistema.
                </Text>
              </div>
            </Group>
            <Group>
              <IconClock size={28} />
              <div>
                <Text fw={700} style={{ color: 'white' }}>Visualización y Análisis Geográfico</Text>
                <Text size="sm" style={{ color: 'white', opacity: 0.8 }}>
                  Visualiza los resultados de las lecturas y los análisis GPS sobre el mapa, detecta patrones de movimiento y obtén información geoespacial avanzada.
                </Text>
              </div>
            </Group>
          </Stack>
        </div>
      </div>
    </div>
  );
};

export default LoginPage; 