import React, { createContext, useContext, useState, useEffect } from 'react';
import { notifications } from '@mantine/notifications'; // For displaying errors

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const JWT_TOKEN_KEY = 'jwt_access_token';
const TOKEN_TIMESTAMP_KEY = 'jwt_token_timestamp'; // Para la gestión de sesión en el cliente

// Duración de sesión en el cliente (ej. 1 hora). El backend también valida la expiración del JWT.
const SESSION_DURATION_MS = 60 * 60 * 1000; 
// const SESSION_WARNING_MS = 5 * 60 * 1000; // Aviso 5 minutos antes (opcional)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Inicia como true hasta que se verifique el token
  // const [showSessionWarning, setShowSessionWarning] = useState(false); // Opcional por ahora
  // const [warningTimeout, setWarningTimeout] = useState<NodeJS.Timeout | null>(null); // Opcional
  const [logoutTimeout, setLogoutTimeout] = useState<NodeJS.Timeout | null>(null);

  const clearTimeouts = () => {
    // if (warningTimeout) clearTimeout(warningTimeout);
    if (logoutTimeout) clearTimeout(logoutTimeout);
    // setWarningTimeout(null);
    setLogoutTimeout(null);
  };

  const _establishSession = async (accessToken: string, isInitialLoad = false) => {
    try {
      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        if (response.status === 401) { // Token inválido o expirado
          if (!isInitialLoad) { // No mostrar error si es carga inicial y el token simplemente no es válido
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
      // const timeToWarning = SESSION_DURATION_MS - SESSION_WARNING_MS;

      // if (timeToWarning > 0) {
      //   const newWarningTimeout = setTimeout(() => {
      //     setShowSessionWarning(true);
      //     // playWarningSound(); // Si tienes un sonido de aviso
      //   }, timeToWarning);
      //   setWarningTimeout(newWarningTimeout);
      // }
      
      const newLogoutTimeout = setTimeout(() => {
        notifications.show({
          title: 'Sesión Expirada',
          message: 'Tu sesión ha expirado por inactividad. Por favor, inicia sesión de nuevo.',
          color: 'orange',
        });
        logout(); // Cierra sesión automáticamente
      }, timeToLogout);
      setLogoutTimeout(newLogoutTimeout);

      return true; // Sesión establecida con éxito

    } catch (error) {
      console.error('Error establishing session:', error);
      // Si falla al establecer la sesión (ej. token expirado en carga inicial), limpiar
      if (isInitialLoad) {
        logout(); // Asegura limpieza si la carga inicial falla
      }
      return false; // Fallo al establecer sesión
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

  // const keepAlive = async () => { // Lógica de "Seguir conectado"
  //   const token = localStorage.getItem(JWT_TOKEN_KEY);
  //   if (token) {
  //     // Intenta re-validar/refrescar el token o simplemente resetear el timestamp local
  //     // Aquí, simplemente reseteamos el timestamp si el token sigue siendo válido (verificado por /me)
  //     const stillValid = await _establishSession(token); 
  //     if (stillValid) {
  //       setShowSessionWarning(false);
  //       notifications.show({
  //           title: 'Sesión extendida',
  //           message: 'Tu sesión ha sido extendida.',
  //           color: 'green',
  //       });
  //     } else {
  //       // _establishSession habrá llamado a logout si el token ya no es válido
  //       // o habrá mostrado un error.
  //     }
  //   }
  // };

  const getToken = () => localStorage.getItem(JWT_TOKEN_KEY);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, isLoading, getToken }}>
      {children}
      {/* Sección de aviso de sesión (opcional, comentada por ahora para simplificar) */}
      {/* {showSessionWarning && user && ( 
        <div style={{...}}>
          <b>¡Atención!</b> Tu sesión expirará pronto.<br />
          <button onClick={keepAlive}>Seguir conectado</button>
        </div>
      )} */}
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