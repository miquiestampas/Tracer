import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paper, TextInput, Button, Title, Stack, PasswordInput, Alert } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';

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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7fafc' }}>
      <Paper p="xl" radius="md" withBorder style={{ minWidth: 340 }}>
        <Title order={2} mb="lg">Acceso LPR Tracer</Title>
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput
              label="Carné Profesional"
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
            <Button type="submit" loading={loading} fullWidth>Entrar</Button>
          </Stack>
        </form>
      </Paper>
    </div>
  );
};

export default LoginPage; 