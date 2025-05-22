import React, { createContext, useContext, useState, useEffect } from 'react';
import { notifications } from '@mantine/notifications'; // For displaying errors
import { Modal, Stack, Text, Group, Button } from '@mantine/core';

// Interfaz para el objeto Grupo (simplificada, ajusta según necesidad)
interface GrupoData {
  ID_Grupo: number;
  Nombre: string;
  // Otros campos de grupo si los necesitas aquí
}

// Define la forma de los datos del usuario que esperamos de /api/auth/me
interface UserData {
  User: number; // o string, según tu backend
  Rol: string;
  ID_Grupo?: number | null;
  grupo?: GrupoData | null; // MODIFIED: Añadida la propiedad grupo
  // Añade otros campos que devuelva /api/auth/me
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: UserData | null; // Tipo actualizado para el usuario
  login: (user: string, pass: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean; // Para saber si se está procesando el login inicial
  getToken: () => string | null; // Para que otros servicios puedan obtener el token
  keepAlive: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const JWT_TOKEN_KEY = 'jwt_access_token';
const TOKEN_TIMESTAMP_KEY = 'jwt_token_timestamp'; // Para la gestión de sesión en el cliente

// Duración de sesión en el cliente (ej. 1 hora). El backend también valida la expiración del JWT.
const SESSION_DURATION_MS = 60 * 60 * 1000; 
const SESSION_WARNING_MS = 5 * 60 * 1000; // Aviso 5 minutos antes

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Inicia como true hasta que se verifique el token
  const [showSessionWarning, setShowSessionWarning] = useState(false);
  const [warningTimeout, setWarningTimeout] = useState<NodeJS.Timeout | null>(null);
  const [logoutTimeout, setLogoutTimeout] = useState<NodeJS.Timeout | null>(null);

  const clearTimeouts = () => {
    if (warningTimeout) clearTimeout(warningTimeout);
    if (logoutTimeout) clearTimeout(logoutTimeout);
    setWarningTimeout(null);
    setLogoutTimeout(null);
  };

  const _establishSession = async (accessToken: string, isInitialLoad = false) => {
    try {
      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        if (response.status === 401) {
          if (!isInitialLoad) {
             notifications.show({
                title: 'Error de autenticación',
                message: 'Tu sesión ha expirado o el token es inválido. Por favor, inicia sesión de nuevo.',
                color: 'red',
              });
          }
        } else {
            notifications.show({
                title: 'Error',
                message: `Error al obtener datos del usuario: ${response.statusText}`,
                color: 'red',
            });
        }
        throw new Error('Failed to fetch user data');
      }

      const userData: UserData = await response.json();
      setUser(userData);
      setIsAuthenticated(true);
      localStorage.setItem(JWT_TOKEN_KEY, accessToken);
      localStorage.setItem(TOKEN_TIMESTAMP_KEY, Date.now().toString());

      // Reiniciar timeouts de sesión (cliente)
      clearTimeouts();
      const timeToLogout = SESSION_DURATION_MS;
      const timeToWarning = SESSION_DURATION_MS - SESSION_WARNING_MS;

      if (timeToWarning > 0) {
        const newWarningTimeout = setTimeout(() => {
          setShowSessionWarning(true);
        }, timeToWarning);
        setWarningTimeout(newWarningTimeout);
      }
      
      const newLogoutTimeout = setTimeout(() => {
        notifications.show({
          title: 'Sesión Expirada',
          message: 'Tu sesión ha expirado por inactividad. Por favor, inicia sesión de nuevo.',
          color: 'orange',
        });
        logout();
      }, timeToLogout);
      setLogoutTimeout(newLogoutTimeout);

      return true;

    } catch (error) {
      console.error('Error establishing session:', error);
      if (isInitialLoad) {
        logout();
      }
      return false;
    }
  };

  useEffect(() => {
    const attemptAutoLogin = async () => {
      const token = localStorage.getItem(JWT_TOKEN_KEY);
      const timestamp = localStorage.getItem(TOKEN_TIMESTAMP_KEY);

      if (token && timestamp) {
        const elapsed = Date.now() - parseInt(timestamp, 10);
        if (elapsed < SESSION_DURATION_MS) {
          await _establishSession(token, true); // true para indicar que es carga inicial
        } else {
          // Token expirado según el cliente, limpiar
          logout();
        }
      }
      setIsLoading(false); // Termina la carga después del intento
    };

    attemptAutoLogin();
    
    return () => {
      clearTimeouts();
    };
  }, []);


  const login = async (usernameInput: string, pass: string) => {
    setIsLoading(true);
    try {
      // El backend espera 'username' y 'password' en el cuerpo como form data
      const formData = new URLSearchParams();
      formData.append('username', usernameInput); // El ID de usuario (ej: 117020)
      formData.append('password', pass);

      const response = await fetch('/api/auth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Credenciales incorrectas o error desconocido' }));
        const errorMessage = errorData.detail || 'Credenciales incorrectas';
        notifications.show({
            title: 'Error de inicio de sesión',
            message: errorMessage,
            color: 'red',
        });
        throw new Error(errorMessage);
      }

      const tokenData = await response.json();
      const accessToken = tokenData.access_token;

      if (!accessToken) {
        notifications.show({
            title: 'Error de inicio de sesión',
            message: 'No se recibió el token de acceso.',
            color: 'red',
        });
        throw new Error('No access token received');
      }

      // Ahora que tenemos el token, establecemos la sesión.
      const sessionEstablished = await _establishSession(accessToken);
      if (!sessionEstablished) {
          // _establishSession ya habrá mostrado una notificación si falla
          throw new Error("No se pudo establecer la sesión después de obtener el token.");
      }

    } catch (error) {
      console.error('Error during login:', error);
      setIsAuthenticated(false);
      setUser(null);
      // localStorage.removeItem(JWT_TOKEN_KEY); // Se limpia en logout() o si _establishSession falla
      // localStorage.removeItem(TOKEN_TIMESTAMP_KEY);
      throw error; // Relanzar para que LoginPage pueda manejarlo
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem(JWT_TOKEN_KEY);
    localStorage.removeItem(TOKEN_TIMESTAMP_KEY);
    // setShowSessionWarning(false);
    clearTimeouts();
    // Opcional: Redirigir a /login. Esto usualmente se maneja en ProtectedRoute o App.tsx
    // window.location.href = '/login'; 
    notifications.show({
        title: 'Sesión cerrada',
        message: 'Has cerrado sesión exitosamente.',
        color: 'blue',
    });
  };

  const keepAlive = async () => {
    const token = localStorage.getItem(JWT_TOKEN_KEY);
    if (token) {
      const stillValid = await _establishSession(token);
      if (stillValid) {
        setShowSessionWarning(false);
        notifications.show({
            title: 'Sesión extendida',
            message: 'Tu sesión ha sido extendida.',
            color: 'green',
        });
      }
    }
  };

  const getToken = () => localStorage.getItem(JWT_TOKEN_KEY);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, isLoading, getToken, keepAlive }}>
      {children}
      {showSessionWarning && user && (
        <Modal
          opened={showSessionWarning}
          onClose={() => setShowSessionWarning(false)}
          title="Sesión por expirar"
          centered
          withCloseButton={false}
          closeOnClickOutside={false}
          closeOnEscape={false}
        >
          <Stack>
            <Text>
              Tu sesión expirará en 5 minutos por inactividad.
              ¿Deseas mantener la sesión activa?
            </Text>
            <Group justify="flex-end">
              <Button variant="light" color="red" onClick={logout}>
                Cerrar sesión
              </Button>
              <Button onClick={keepAlive}>
                Mantener sesión
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 