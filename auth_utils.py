from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt

# Configurar el contexto de hashing, bcrypt es una buena elección.
# deprecated="auto" manejará automáticamente la actualización de hashes si cambias los algoritmos en el futuro.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Configuración de JWT
SECRET_KEY = "afe2eb405c2faf62bd83626be39901784649360f2020225a902312677aa0ac5e"  # ¡CAMBIAR EN PRODUCCIÓN Y GUARDAR DE FORMA SEGURA!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # Por ejemplo, 60 minutos

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica una contraseña en texto plano contra un hash almacenado."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Genera un hash para una contraseña en texto plano."""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    # Asegurarse de que 'sub' (subject) sea una cadena
    if "sub" in to_encode and not isinstance(to_encode["sub"], str):
        to_encode["sub"] = str(to_encode["sub"])
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Podríamos añadir funciones para decodificar tokens aquí si es necesario, 
# o se pueden manejar directamente en las dependencias de FastAPI. 