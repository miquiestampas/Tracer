import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  user: any;
  login: (user: string, pass: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hora
const SESSION_WARNING_MS = 60 * 1000; // 1 minuto

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(undefined);
  const [showSessionWarning, setShowSessionWarning] = useState(false);
  const [warningTimeout, setWarningTimeout] = useState<NodeJS.Timeout | null>(null);
  const [logoutTimeout, setLogoutTimeout] = useState<NodeJS.Timeout | null>(null);

  // --- Función para reproducir sonido de aviso ---
  const playWarningSound = () => {
    const audio = new Audio('/session-warning.mp3');
    audio.play();
  };

  // --- Comprobar expiración de sesión al cargar ---
  useEffect(() => {
    const token = localStorage.getItem('token');
    const timestamp = localStorage.getItem('token_timestamp');
    if (token && timestamp) {
      const elapsed = Date.now() - parseInt(timestamp, 10);
      if (elapsed < SESSION_DURATION_MS) {
        const [rawUser, rawPass] = atob(token).split(':');
        login(rawUser, rawPass, true); // true = no guardar de nuevo
        // Si queda menos de 1 minuto, mostrar aviso y programar logout
        if (SESSION_DURATION_MS - elapsed <= SESSION_WARNING_MS) {
          setShowSessionWarning(true);
          playWarningSound();
          const toLogout = setTimeout(() => {
            logout();
          }, SESSION_WARNING_MS - (SESSION_DURATION_MS - elapsed));
          setLogoutTimeout(toLogout);
        } else {
          // Programar aviso y logout
          const toWarning = setTimeout(() => {
            setShowSessionWarning(true);
            playWarningSound();
            const toLogout = setTimeout(() => {
              logout();
            }, SESSION_WARNING_MS);
            setLogoutTimeout(toLogout);
          }, SESSION_DURATION_MS - elapsed - SESSION_WARNING_MS);
          setWarningTimeout(toWarning);
        }
      } else {
        logout();
      }
    } else {
      setUser(null);
    }
    return () => {
      if (warningTimeout) clearTimeout(warningTimeout);
      if (logoutTimeout) clearTimeout(logoutTimeout);
    };
  }, []);

  const login = async (user: string, pass: string, skipSave = false) => {
    try {
      const token = btoa(`${user}:${pass}`);
      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Basic ${token}` }
      });

      if (!response.ok) {
        throw new Error('Credenciales incorrectas');
      }

      const data = await response.json();
      setUser({
        user: data.User,
        rol: data.Rol,
        grupo: data.grupo,
        token: token,
        rawUser: user,
        rawPass: pass
      });
      setIsAuthenticated(true);
      if (!skipSave) {
        localStorage.setItem('token', token);
        localStorage.setItem('token_timestamp', Date.now().toString());
      }
      // Programar aviso y logout
      if (warningTimeout) clearTimeout(warningTimeout);
      if (logoutTimeout) clearTimeout(logoutTimeout);
      const toWarning = setTimeout(() => {
        setShowSessionWarning(true);
        playWarningSound();
        const toLogout = setTimeout(() => {
          logout();
        }, SESSION_WARNING_MS);
        setLogoutTimeout(toLogout);
      }, SESSION_DURATION_MS - SESSION_WARNING_MS);
      setWarningTimeout(toWarning);
    } catch (error) {
      console.error('Error during login:', error);
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('token');
    localStorage.removeItem('token_timestamp');
    setShowSessionWarning(false);
    if (warningTimeout) clearTimeout(warningTimeout);
    if (logoutTimeout) clearTimeout(logoutTimeout);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
      {showSessionWarning && (
        <div style={{
          position: 'fixed',
          bottom: 32,
          right: 32,
          background: '#fffbe6',
          color: '#222',
          border: '2px solid #ffec99',
          borderRadius: 8,
          padding: 24,
          zIndex: 9999,
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)'
        }}>
          <b>¡Atención!</b> Tu sesión expirará en menos de 1 minuto.<br />
          Si necesitas más tiempo, vuelve a iniciar sesión tras el cierre automático.
        </div>
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