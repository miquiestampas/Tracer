from fastapi import FastAPI, Depends, HTTPException, status, Request, UploadFile, File, Form, Query, Body, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRouter
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session, joinedload, contains_eager, relationship
from sqlalchemy.sql import func, extract, select, label, text
import models, schemas
from database import SessionLocal, engine, get_db, DATABASE_URL
import pandas as pd
from io import BytesIO
import datetime
from typing import List, Dict, Any, Optional, Tuple
import json
from urllib.parse import unquote
import logging
import os
import shutil
import pathlib
from dateutil import parser
import re
from sqlalchemy import select, distinct
from sqlalchemy.exc import IntegrityError
from datetime import timedelta
from collections import defaultdict
from contextlib import asynccontextmanager
from sqlalchemy import or_
from sqlalchemy import and_, not_
from pydantic import BaseModel
from datetime import datetime, timedelta, date, time, timezone
from sqlalchemy import func, select, and_, literal_column
from sqlalchemy.orm import aliased
from sqlalchemy import over
import math
from math import radians, sin, cos, sqrt, asin
from schemas import Lectura as LecturaSchema
from gps_capas import router as gps_capas_router
from models import LocalizacionInteres
from schemas import LocalizacionInteresCreate, LocalizacionInteresUpdate, LocalizacionInteresOut
from admin.database_manager import router as admin_database_router

from auth_utils import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, verify_password, get_password_hash # ADDED
from jose import JWTError, jwt # ADDED
from schemas import Token, TokenData # ADDED
from models import RolUsuarioEnum # Asegúrate que RolUsuarioEnum está disponible (o usa la cadena directa)
import enum # AÑADIDO: Importar enum
import uuid

# Global store for background task statuses
task_statuses = {}

class UploadTaskStatus(BaseModel):
    task_id: str
    status: str # e.g., "pending", "processing", "completed", "failed"
    message: Optional[str] = None
    progress: Optional[float] = None # e.g., percentage or records processed
    total: Optional[int] = None # total records to process
    result: Optional[schemas.UploadResponse] = None # To hold the final response on completion

class TaskStatus(BaseModel):
    status: str
    message: str
    progress: float
    total: Optional[int] = None
    result: Optional[Dict] = None
    stage: Optional[str] = None  # Añadido para mensajes detallados

# --- Helper functions for data parsing --- START
def get_optional_float(value: Any) -> Optional[float]:
    """Convierte un valor a float si es posible, retorna None si no."""
    if pd.isna(value) or value is None:
        return None
    try:
        # Intentar convertir a float, reemplazando coma por punto si es necesario
        if isinstance(value, str):
            value = value.replace(',', '.')
        float_val = float(value)
        return float_val
    except (ValueError, TypeError):
        return None

def get_optional_str(value: Any) -> Optional[str]:
    if pd.isna(value) or value is None:
        return None
    try:
        return str(value).strip()
    except (ValueError, TypeError):
        return None

def validate_coordinates(lat: Optional[float], lon: Optional[float]) -> bool:
    """Valida que las coordenadas estén dentro de rangos válidos."""
    if lat is None or lon is None:
        return False
    return -90 <= lat <= 90 and -180 <= lon <= 180
# --- Helper functions for data parsing --- END

# Configurar logging básico para ver más detalles
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Eliminar la llamada directa aquí
# models.create_db_and_tables()

# Importar las funciones de optimización
from optimizations import create_optimized_indices, optimize_common_queries, vacuum_database

# --- START JWT/OAuth2 Core Setup ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False) # MODIFIED: auto_error=False for optional token

# === DEFINICIÓN DE get_current_active_user y get_current_active_superadmin ===
# (Deben estar definidas ANTES de ser usadas en auth_router y otros endpoints)
async def get_current_active_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Optional[models.Usuario]: # MODIFIED: Optional token and return
    if not token:
        return None # Si no hay token, devolver None en lugar de error inmediato
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            # Esto no debería pasar si el token fue emitido correctamente, pero es una salvaguarda
            raise credentials_exception 
        token_data = TokenData(username=username)
    except JWTError as e: # ADDED 'as e'
        # Token inválido (expirado, malformado, etc.)
        logger.error(f"JWTError en get_current_active_user: {e}", exc_info=True) # ADDED logging
        raise credentials_exception # Aquí sí lanzamos error porque se proveyó un token inválido
    
    # Convertir el username (str desde el token) a int para la búsqueda en BD
    try:
        user_id_from_token = int(token_data.username)
    except (ValueError, TypeError):
        # Si username no es un int válido, no se puede buscar el usuario
        logger.error(f"Error convirtiendo token_data.username ({token_data.username}) a int.", exc_info=True)
        raise credentials_exception

    user = db.query(models.Usuario).filter(models.Usuario.User == user_id_from_token).first()
    if user is None:
        # Usuario no encontrado en DB para el token dado
        raise credentials_exception
    return user

async def get_current_active_superadmin(current_user: models.Usuario = Depends(get_current_active_user)) -> models.Usuario:
    if current_user is None: # Si get_current_active_user devolvió None (sin token válido)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    user_rol_value = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol
    if user_rol_value.lower() != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Not enough permissions. Superadmin role required."
        )
    return current_user

# Nueva dependencia opcional para superadmin
async def get_current_active_superadmin_optional(current_user: Optional[models.Usuario] = Depends(get_current_active_user)) -> Optional[models.Usuario]:
    if current_user is None:
        return None # No hay usuario autenticado, devuelve None
    
    user_rol_value = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol
    if user_rol_value.lower() == "superadmin":
        return current_user # Es superadmin, devuélvelo
    return None # No es superadmin (o no está autenticado), devuelve None

# Nueva dependencia para superadmin o admin_casos
async def get_current_active_admin_or_superadmin(current_user: models.Usuario = Depends(get_current_active_user)) -> models.Usuario:
    if current_user is None: # Si get_current_active_user devolvió None (sin token válido)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    user_rol_value = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol
    allowed_roles = ["superadmin", "admingrupo"] # MODIFICADO
    if user_rol_value.lower() not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail=f"Not enough permissions. Allowed roles: {', '.join(allowed_roles)}."
        )
    return current_user

# Dependency to get the current active user (can be used by other routers too)
# Esta se mantiene, pero get_current_active_user ahora es más flexible
async def get_current_user_dependency(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)): # Renombrada para evitar conflicto si la usamos directo
    return await get_current_active_user(token=token, db=db)
# --- END DEFINICIÓN DE FUNCIONES DE DEPENDENCIA ---

auth_router = APIRouter()

@auth_router.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # form_data.username es str. models.Usuario.User es int.
    try:
        user_id_to_query = int(form_data.username) # Convertir el username del form a int
    except ValueError:
        # Si no se puede convertir a int, no es un User ID válido
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password", # Mensaje genérico
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(models.Usuario).filter(models.Usuario.User == user_id_to_query).first() # Comparar int con int
    if not user or not verify_password(form_data.password, user.Contraseña):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.User}, expires_delta=access_token_expires # user.User (int) se convertirá a str en create_access_token
    )
    return {"access_token": access_token, "token_type": "bearer"}

@auth_router.get("/me", response_model=schemas.Usuario)
async def read_users_me(current_user: Optional[models.Usuario] = Depends(get_current_active_user), db: Session = Depends(get_db)): # Added db dependency, made current_user Optional explicitly
    if current_user is None:
        # This case implies no token was provided or it was invalid in a way that get_current_active_user returned None (e.g. auto_error=False and no token)
        # However, get_current_active_user is designed to raise HTTPException for invalid/expired tokens.
        # If auto_error=False and no token, get_current_active_user returns None.
        # So, if current_user is None here, it means no valid authentication was established.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated to access /me",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Asegurar que el grupo se carga si existe para la respuesta
    if current_user.ID_Grupo and not current_user.grupo:
        # Need db session here
        current_user.grupo = db.query(models.Grupo).filter(models.Grupo.ID_Grupo == current_user.ID_Grupo).first()
    return current_user

@auth_router.get("/check-superadmin")
async def check_superadmin_status(current_user: models.Usuario = Depends(get_current_active_superadmin)):
    return {"is_superadmin": True, "user": current_user.User}
# --- END JWT/OAuth2 Setup ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Iniciando aplicación Tracer...")
    
    # Verificar tablas de base de datos
    models.create_db_and_tables()
    logger.info("Tablas de base de datos verificadas")
    
    # Aplicar optimizaciones de base de datos
    create_optimized_indices()
    
    # Optimizar consultas comunes (necesita una sesión)
    db = SessionLocal()
    try:
        optimize_common_queries(db)
    except Exception as e:
        logger.error(f"Error al optimizar consultas: {e}")
    finally:
        db.close()
    
    # Ejecutar vacío de base de datos (optimización de almacenamiento)
    try:
        vacuum_database()
    except Exception as e:
        logger.error(f"Error al ejecutar VACUUM: {e}")
    
    logger.info("Optimizaciones de base de datos aplicadas")
    
    yield
    
    # Shutdown
    logger.info("Cerrando aplicación Tracer...")

app = FastAPI(lifespan=lifespan)

# --- Endpoint to check background task status ---
@app.get("/casos/archivos/upload_status/{task_id}", response_model=UploadTaskStatus)
async def get_upload_status(task_id: str):
    status_info = task_statuses.get(task_id)
    if not status_info:
        # It's important to return a well-formed UploadTaskStatus even for errors if possible,
        # or ensure the frontend can handle a 404 gracefully.
        # For now, raising HTTPException is standard.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task ID not found or task not initiated.")
    
    # Construct the Pydantic model from the dictionary stored in task_statuses
    return UploadTaskStatus(
        task_id=task_id,
        status=status_info.get("status", "unknown"),
        message=status_info.get("message"),
        progress=status_info.get("progress"),
        total=status_info.get("total"),
        result=status_info.get("result") # This will be None until completion, then dict from UploadResponse
    )
# --- END Endpoint to check background task status ---

# --- INCLUDE auth_router EARLY ---
app.include_router(auth_router, prefix="/api/auth", tags=["Autenticación"]) # MODIFIED: Added /api prefix
# --- END INCLUDE auth_router EARLY ---

# Configurar CORS - ÚNICA CONFIGURACIÓN
origins = [
    "http://localhost:5173",  # Origen del frontend de desarrollo
    # Puedes añadir aquí otros orígenes permitidos en producción, por ejemplo:
    # "https://tu-dominio-de-produccion.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # Usar la lista de orígenes explícita
    allow_credentials=True,
    allow_methods=["*"], # Permitir todos los métodos (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"], # Permitir todos los headers
)

# Incluir routers
app.include_router(gps_capas_router)
app.include_router(admin_database_router)

# --- NEW CONFIGURATION ROUTER ---
config_router = APIRouter(prefix="/api/config", tags=["Configuración"])

class FooterConfigUpdate(BaseModel):
    text: str

@config_router.get("/footer")
def get_footer_config():
    # Aquí deberías leer la configuración del footer de alguna fuente persistente,
    # como un archivo JSON, una base de datos, o variables de entorno.
    # Por ahora, leeremos del archivo footer_config.json
    try:
        with open("footer_config.json", "r", encoding="utf-8") as f:
            config = json.load(f)
            return config
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Archivo de configuración del footer no encontrado")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Error al decodificar el archivo JSON de configuración del footer")
    except Exception as e:
        logger.error(f"Error al leer la configuración del footer: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor al obtener la configuración del footer")

@config_router.post("/footer")
def update_footer_config(config: FooterConfigUpdate):
    # Aquí deberías guardar la configuración del footer en alguna fuente persistente.
    # Por ahora, guardaremos en el archivo footer_config.json
    try:
        with open("footer_config.json", "w", encoding="utf-8") as f:
            json.dump({"text": config.text}, f, ensure_ascii=False, indent=2)
            return {"message": "Configuración del footer actualizada correctamente"}
    except Exception as e:
        logger.error(f"Error al guardar la configuración del footer: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor al actualizar la configuración del footer")

# --- END NEW CONFIGURATION ROUTER ---

app.include_router(config_router) # ADDED: Include the new config router

# ... existing code ...

localizaciones_router = APIRouter()

@localizaciones_router.get("/casos/{caso_id}/localizaciones-interes", response_model=List[LocalizacionInteresOut])
def get_localizaciones_interes(caso_id: int, db: Session = Depends(get_db)):
    return db.query(LocalizacionInteres).filter(LocalizacionInteres.caso_id == caso_id).all()

@localizaciones_router.post("/casos/{caso_id}/localizaciones-interes", response_model=LocalizacionInteresOut, status_code=201)
def create_localizacion_interes(caso_id: int, loc: LocalizacionInteresCreate, db: Session = Depends(get_db)):
    db_loc = LocalizacionInteres(**loc.dict(), caso_id=caso_id)
    db.add(db_loc)
    db.commit()
    db.refresh(db_loc)
    return db_loc

@localizaciones_router.put("/casos/{caso_id}/localizaciones-interes/{loc_id}", response_model=LocalizacionInteresOut)
def update_localizacion_interes(caso_id: int, loc_id: int, loc: LocalizacionInteresUpdate, db: Session = Depends(get_db)):
    db_loc = db.query(LocalizacionInteres).filter(LocalizacionInteres.id == loc_id, LocalizacionInteres.caso_id == caso_id).first()
    if not db_loc:
        raise HTTPException(status_code=404, detail="Localización no encontrada")
    for key, value in loc.dict().items():
        setattr(db_loc, key, value)
    db.commit()
    db.refresh(db_loc)
    return db_loc

@localizaciones_router.delete("/casos/{caso_id}/localizaciones-interes/{loc_id}", status_code=204)
def delete_localizacion_interes(caso_id: int, loc_id: int, db: Session = Depends(get_db)):
    db_loc = db.query(LocalizacionInteres).filter(LocalizacionInteres.id == loc_id, LocalizacionInteres.caso_id == caso_id).first()
    if not db_loc:
        raise HTTPException(status_code=404, detail="Localización no encontrada")
    db.delete(db_loc)
    db.commit()
    return

app.include_router(localizaciones_router)
# ... existing code ...

# --- Manejador de Excepción para Errores de Validación (422) ---
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Loguear el error detallado en la consola del backend
    logger.error(f"Error de validación para request: {request.method} {request.url}")
    # Convertir los errores a un formato logueable/serializable
    error_details = jsonable_encoder(exc.errors())
    logger.error(f"Detalles del error: {error_details}") 
    # Devolver la respuesta 422 estándar pero asegurando que el error se logueó
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": error_details},
)

# --- Manejador global de excepciones ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Error no manejado en {request.method} {request.url.path}: {str(exc)}")
    
    # Para errores HTTP ya manejados, mantener su comportamiento
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )
    
    # Para otros errores, devolver 500
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Error interno del servidor"},
    )

# --- Directorio para guardar archivos subidos (RUTA ABSOLUTA) ---
BASE_DIR = pathlib.Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
os.makedirs(UPLOADS_DIR, exist_ok=True)
logger.info(f"Directorio de subidas configurado en: {UPLOADS_DIR}")

# === DEFINICIÓN DE PARSEAR_UBICACION ===
# (Debe estar definida antes de ser usada en update_lector)
def parsear_ubicacion(ubicacion_str: str) -> Optional[Tuple[float, float]]:
    """Intenta parsear una cadena para obtener latitud y longitud.

    Soporta:
    1. Formato "lat SEPARADOR lon" (coma o espacio como separador)
    2. Enlaces de Google Maps tipo "...google.com/maps/...@lat,lon,..."

    Devuelve:
        Tuple[float, float]: (latitud, longitud) si el parseo es exitoso y válido.
        None: Si el formato no se reconoce o las coordenadas están fuera de rango.
    """
    if not isinstance(ubicacion_str, str) or not ubicacion_str.strip():
        logger.debug("parsear_ubicacion recibió entrada vacía o no string.")
        return None

    ubicacion_str = ubicacion_str.strip()
    logger.debug(f"Intentando parsear ubicación: '{ubicacion_str}'")

    # 1. Intentar formato "lat SEPARADOR lon" (coma o espacio como separador)
    match_latlon = re.match(r"^(-?\d+(?:\.\d+)?)\s*(?:,|\s+)\s*(-?\d+(?:\.\d+)?)$", ubicacion_str)
    if match_latlon:
        try:
            lat = float(match_latlon.group(1))
            lon = float(match_latlon.group(2))
            # Validar rangos
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                logger.info(f"Coordenadas parseadas (lat, lon): {lat}, {lon}")
                return lat, lon
            else:
                logger.warning(f"Coordenadas fuera de rango: Lat={lat}, Lon={lon}")
                return None
        except ValueError:
            logger.warning("Error al convertir lat/lon a float.")
            return None

    # 2. Intentar formato enlace Google Maps (@lat,lon,...)
    match_gmaps = re.search(r"google\.[a-z.]+/maps/.*?@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)", ubicacion_str)
    if match_gmaps:
        try:
            lat = float(match_gmaps.group(1))
            lon = float(match_gmaps.group(2))
            # Validar rangos
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                logger.info(f"Coordenadas parseadas de Google Maps: Lat={lat}, Lon={lon}")
                return lat, lon
            else:
                logger.warning(f"Coordenadas de Google Maps fuera de rango: Lat={lat}, Lon={lon}")
                return None
        except ValueError:
             logger.warning("Error al convertir lat/lon de Google Maps a float.")
             return None

    logger.warning(f"Formato de ubicación no reconocido: '{ubicacion_str}'")
    return None

# --- Endpoints API REST ---

@app.get("/")
def read_root():
    return {"message": "Bienvenido a la API de Tracer"}

# === CASOS ===
@app.post("/casos", response_model=schemas.Caso, status_code=status.HTTP_201_CREATED)
def create_caso(caso: schemas.CasoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_user)):
    logger.info(f"Usuario {current_user.User} (Rol: {getattr(current_user.Rol, 'value', current_user.Rol)}) creando caso: {caso.Nombre_del_Caso}")
    
    user_rol_value = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol
    is_superadmin = user_rol_value == 'superadmin'
    is_admingrupo = user_rol_value == 'admingrupo'

    # Solo superadmin o admingrupo pueden crear casos
    if not is_superadmin and not is_admingrupo:
        logger.warning(f"Usuario {current_user.User} (Rol: {user_rol_value}) intentó crear caso. Acción no permitida.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permiso para crear casos."
        )
    
    # Check for duplicate case name and year
    existing_caso = db.query(models.Caso).filter(
        models.Caso.Nombre_del_Caso == caso.Nombre_del_Caso,
        models.Caso.Año == caso.Año
    ).first()
    if existing_caso:
        logger.warning(f"Intento de crear caso duplicado: {caso.Nombre_del_Caso} ({caso.Año}) por usuario {current_user.User}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ya existe un caso con el mismo nombre y año.")
    
    try:
        caso_data = caso.model_dump(exclude_unset=True) 
        
        # Handle Estado: Use provided, else default to NUEVO. Validate enum value.
        estado_str = caso_data.get('Estado', models.EstadoCasoEnum.NUEVO.value)
        if estado_str not in [item.value for item in models.EstadoCasoEnum]:
            logger.error(f"Valor de Estado inválido '{estado_str}' proporcionado por usuario {current_user.User}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Valor de Estado inválido: {estado_str}")
        
        assigned_id_grupo = caso_data.get('ID_Grupo')

        if not is_superadmin: # Esta lógica ahora es solo para admingrupo
            if current_user.ID_Grupo is None: # admingrupo debe tener un grupo
                logger.warning(f"Usuario admingrupo {current_user.User} (sin grupo) intentó crear caso. Prohibido.")
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Como admingrupo, debe tener un grupo asignado para crear casos.")
            
            if assigned_id_grupo is not None and assigned_id_grupo != current_user.ID_Grupo:
                logger.warning(f"Usuario {current_user.User} (Grupo: {current_user.ID_Grupo}) intentó crear caso para grupo ajeno ({assigned_id_grupo}). Prohibido.")
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permiso para crear casos en un grupo diferente al suyo.")
            assigned_id_grupo = current_user.ID_Grupo # Assign to user's group
        else:
            # Superadmin: Can assign to any existing group, or no group (None).
            if assigned_id_grupo is not None:
                grupo_exists = db.query(models.Grupo).filter(models.Grupo.ID_Grupo == assigned_id_grupo).first()
                if not grupo_exists:
                    logger.warning(f"Superadmin {current_user.User} intentó crear caso para grupo inexistente ID: {assigned_id_grupo}.")
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"El grupo especificado (ID: {assigned_id_grupo}) no existe.")
            # If superadmin and assigned_id_grupo is None from payload, it remains None (case without group).
        
        db_caso = models.Caso(
            Nombre_del_Caso=caso_data['Nombre_del_Caso'],
            Año=caso_data['Año'],
            NIV=caso_data.get('NIV'),
            Descripcion=caso_data.get('Descripcion'),
            Estado=estado_str,
            ID_Grupo=assigned_id_grupo
        )
        db.add(db_caso)
        db.commit() 
        db.refresh(db_caso)
        logger.info(f"Caso ID: {db_caso.ID_Caso} (Nombre: {db_caso.Nombre_del_Caso}, Grupo: {db_caso.ID_Grupo}) creado exitosamente por usuario {current_user.User}")
        return db_caso
    except HTTPException as http_exc:
        # Re-raise HTTPExceptions for FastAPI to handle
        raise http_exc
    except Exception as e:
        db.rollback()
        logger.error(f"Error al crear el caso '{caso.Nombre_del_Caso}' para usuario {current_user.User}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno al crear el caso.")

@app.get("/casos", response_model=List[schemas.Caso])
def read_casos(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_user)):
    if current_user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    query = db.query(models.Caso).options(
        joinedload(models.Caso.grupo),
        joinedload(models.Caso.archivos) # CORREGIDO: de archivos_excel a archivos
    )

    user_rol = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol

    if user_rol == RolUsuarioEnum.superadmin.value:
        pass 
    elif user_rol == RolUsuarioEnum.admingrupo.value or user_rol == RolUsuarioEnum.user_consulta.value: # MODIFICADO
        if current_user.ID_Grupo is not None:
            query = query.filter(models.Caso.ID_Grupo == current_user.ID_Grupo)
        else:
            # Admingrupo o user_consulta sin grupo asignado no ve ningún caso.
            return [] 
    else:
        # Otros roles desconocidos o no autorizados.
        return [] 

    casos_db = query.order_by(models.Caso.ID_Caso.desc()).offset(skip).limit(limit).all()
    
    casos_response = []
    for caso_db_item in casos_db: # Renombrada variable para evitar confusión con el schema `caso`
        casos_response.append(
            schemas.Caso(
                ID_Caso=caso_db_item.ID_Caso,
                Nombre_del_Caso=caso_db_item.Nombre_del_Caso, 
                ID_Grupo=caso_db_item.ID_Grupo,
                Descripcion=caso_db_item.Descripcion,
                Año=caso_db_item.Año,
                NIV=caso_db_item.NIV,
                Estado=caso_db_item.Estado.value if isinstance(caso_db_item.Estado, enum.Enum) else caso_db_item.Estado, # Asegurar que se envía el valor del enum
                Fecha_de_Creacion=caso_db_item.Fecha_de_Creacion, 
                grupo=schemas.Grupo.model_validate(caso_db_item.grupo) if caso_db_item.grupo else None,
                archivos=[schemas.ArchivoExcel.model_validate(archivo) for archivo in caso_db_item.archivos] if caso_db_item.archivos else [] # CORREGIDO: de archivos_excel a archivos
            )
        )
    return casos_response

@app.get("/casos/{caso_id}", response_model=schemas.Caso)
def read_caso(caso_id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_user)):
    logger.info(f"Usuario {current_user.User} (Rol: {getattr(current_user.Rol, 'value', current_user.Rol)}) solicitando GET /casos/{caso_id}")

    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if db_caso is None:
        logger.warning(f"Caso ID {caso_id} no encontrado (solicitado por {current_user.User}).")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado")
    
    user_rol_value = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol
    is_superadmin = user_rol_value == 'superadmin'

    if not is_superadmin:
        if current_user.ID_Grupo is None:
            logger.warning(f"Usuario {current_user.User} (sin grupo) intentó acceder al caso {caso_id}. Prohibido.")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene un grupo asignado. No puede acceder a casos.")
        
        if db_caso.ID_Grupo != current_user.ID_Grupo:
            logger.warning(f"Usuario {current_user.User} (Grupo: {current_user.ID_Grupo}) intentó acceder al caso {caso_id} (Grupo: {db_caso.ID_Grupo}). Prohibido.")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permiso para acceder a este caso.")
    
    logger.info(f"Usuario {current_user.User} autorizado para acceder al caso {caso_id}.")
    return db_caso

@app.put("/casos/{caso_id}/estado", response_model=schemas.Caso)
def update_caso_estado(caso_id: int, estado_update: schemas.CasoEstadoUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_user)): # MODIFIED
    logger.info(f"Usuario {current_user.User} solicitando PUT para actualizar estado del caso ID: {caso_id} a {estado_update.Estado}") # MODIFIED
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if db_caso is None:
        logger.warning(f"[Update Estado Caso] Caso con ID {caso_id} no encontrado (solicitado por {current_user.User}).") # MODIFIED
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado")
    
    # Validar que el nuevo estado (string) es válido
    nuevo_estado_str = estado_update.Estado
    if nuevo_estado_str not in [item.value for item in models.EstadoCasoEnum]:
         logger.error(f"Valor de Estado inválido '{nuevo_estado_str}' para actualizar caso {caso_id} (solicitado por {current_user.User}).") # MODIFIED
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Valor de Estado inválido: {nuevo_estado_str}")

    # TODO: Add authorization: Check if current_user can modify db_caso (e.g., is superadmin or belongs to db_caso.ID_Grupo)

    try:
        db_caso.Estado = nuevo_estado_str
        db.commit()
        db.refresh(db_caso)
        logger.info(f"[Update Estado Caso] Estado del caso ID {caso_id} actualizado a {db_caso.Estado} por usuario {current_user.User}.") # MODIFIED
        return db_caso
    except Exception as e:
        db.rollback()
        logger.error(f"[Update Estado Caso] Error al actualizar estado del caso ID {caso_id} por usuario {current_user.User}. Rollback: {e}", exc_info=True) # MODIFIED
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno al actualizar el estado del caso.")

@app.delete("/casos/{caso_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_caso(
    caso_id: int, 
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(get_current_active_user) # MODIFICADO
):
    logger.info(f"Intento de eliminación del caso ID {caso_id} por usuario {current_user.User} (Rol: {current_user.Rol.value})")
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()

    if not db_caso:
        logger.warning(f"Caso ID {caso_id} no encontrado para eliminar (solicitado por {current_user.User}).")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Caso con ID {caso_id} no encontrado")

    user_rol = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol

    if user_rol == RolUsuarioEnum.superadmin.value:
        # Superadmin puede eliminar cualquier caso
        pass
    elif user_rol == RolUsuarioEnum.admingrupo.value:
        if current_user.ID_Grupo is None:
            logger.warning(f"Admingrupo {current_user.User} intentó eliminar caso {caso_id} pero no tiene grupo asignado.")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admingrupo no tiene un grupo asignado.")
        if db_caso.ID_Grupo != current_user.ID_Grupo:
            logger.warning(f"Admingrupo {current_user.User} (Grupo: {current_user.ID_Grupo}) intentó eliminar caso {caso_id} (Grupo: {db_caso.ID_Grupo}) sin permisos.")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permisos para eliminar este caso.")
    else:
        # Otros roles no pueden eliminar casos
        logger.warning(f"Usuario {current_user.User} (Rol: {user_rol}) intentó eliminar caso {caso_id} sin permisos.")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permisos para eliminar casos.")

    # Proceder con la eliminación
    # Eliminar lecturas asociadas primero (LPR y GPS)
    try:
        archivos_a_eliminar = db.query(models.ArchivoExcel).filter(models.ArchivoExcel.ID_Caso == caso_id).all()
        logger.info(f"[Delete Caso Casc] Se encontraron {len(archivos_a_eliminar)} archivos asociados al caso {caso_id} (solicitud por {current_user.User}).")
        for db_archivo in archivos_a_eliminar:
            archivo_id_actual = db_archivo.ID_Archivo
            nombre_archivo_actual = db_archivo.Nombre_del_Archivo
            logger.info(f"[Delete Caso Casc] Procesando archivo ID: {archivo_id_actual} ({nombre_archivo_actual}) para caso {caso_id} (solicitud por {current_user.User}).")
            lecturas_eliminadas = db.query(models.Lectura).filter(models.Lectura.ID_Archivo == archivo_id_actual).delete(synchronize_session=False)
            logger.info(f"[Delete Caso Casc] {lecturas_eliminadas} lecturas asociadas al archivo {archivo_id_actual} marcadas para eliminar (caso {caso_id}, usuario {current_user.User}).")
            if nombre_archivo_actual:
                file_path_to_delete = UPLOADS_DIR / nombre_archivo_actual
                if os.path.isfile(file_path_to_delete):
                    try:
                        os.remove(file_path_to_delete)
                        logger.info(f"[Delete Caso Casc] Archivo físico eliminado: {file_path_to_delete} (caso {caso_id}, usuario {current_user.User}).")
                    except OSError as e:
                        logger.error(f"[Delete Caso Casc] Error al eliminar archivo físico {file_path_to_delete}: {e}. Continuando... (caso {caso_id}, usuario {current_user.User}).", exc_info=True)
                else:
                    logger.warning(f"[Delete Caso Casc] Archivo físico no encontrado en {file_path_to_delete}, no se elimina (caso {caso_id}, usuario {current_user.User}).")
            else:
                logger.warning(f"[Delete Caso Casc] Registro ArchivoExcel ID {archivo_id_actual} no tiene nombre, no se puede eliminar archivo físico.")
            db.delete(db_archivo)
            logger.info(f"[Delete Caso Casc] Registro ArchivoExcel ID {archivo_id_actual} marcado para eliminar.")
        db.delete(db_caso)
        logger.info(f"[Delete Caso Casc] Caso ID {caso_id} marcado para eliminar.")
        db.commit()
        logger.info(f"[Delete Caso Casc] Commit realizado. Eliminación completada para caso ID {caso_id} y sus asociados.")
        return None
    except Exception as e:
        db.rollback()
        logger.error(f"[Delete Caso Casc] Error durante la eliminación del caso ID {caso_id}. Rollback realizado: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al intentar eliminar el caso y sus asociados: {e}")


# === ARCHIVOS EXCEL (Importación, Descarga, Eliminación) ===

class UploadInitiationResponse(BaseModel):
    task_id: str
    message: str

@app.post("/casos/{caso_id}/archivos/upload", response_model=UploadInitiationResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_excel_submission(
    caso_id: int,
    background_tasks: BackgroundTasks,
    tipo_archivo: str = Form(..., pattern="^(GPS|LPR)$"),
    excel_file: UploadFile = File(...),
    column_mapping: str = Form(...),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_user)
):
    import os
    logger.info(f"User {current_user.User} requesting to upload file '{excel_file.filename}' for caso {caso_id}")
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if db_caso is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado")
    user_rol = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol
    is_superadmin = user_rol == RolUsuarioEnum.superadmin.value
    is_admingrupo = user_rol == RolUsuarioEnum.admingrupo.value
    if not is_superadmin and not is_admingrupo:
         raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permiso denegado para subir archivos.")
    if is_admingrupo:
        if current_user.ID_Grupo is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admingrupo no tiene un grupo asignado.")
        if db_caso.ID_Grupo != current_user.ID_Grupo:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permiso para subir archivos a este caso (grupo no coincide).")
    archivo_existente = db.query(models.ArchivoExcel).filter(
        models.ArchivoExcel.ID_Caso == caso_id,
        models.ArchivoExcel.Nombre_del_Archivo == excel_file.filename
    ).first()
    if archivo_existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe un archivo con el nombre '{excel_file.filename}' en este caso."
        )
    task_id = uuid.uuid4().hex
    original_filename = excel_file.filename
    # --- NUEVO: Guardar en subcarpeta uploads/CasoX ---
    caso_folder = UPLOADS_DIR / f"Caso{caso_id}"
    os.makedirs(caso_folder, exist_ok=True)
    temp_filename = f"processing_{task_id}_{original_filename}"
    temp_file_path = str(caso_folder / temp_filename)
    logger.info(f"[Task {task_id}] Saving temporary file to: {temp_file_path}")
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(excel_file.file, buffer)
        logger.info(f"[Task {task_id}] Temporary file saved successfully: {temp_file_path}")
    except Exception as e:
        logger.error(f"[Task {task_id}] CRÍTICO al guardar el archivo subido {original_filename} en {temp_file_path}: {e}", exc_info=True)
        if os.path.exists(temp_file_path):
            try: os.remove(temp_file_path)
            except: pass
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"No se pudo guardar el archivo temporalmente '{original_filename}'.")
    finally:
        excel_file.file.close()
    task_statuses[task_id] = {
        "status": "pending",
        "message": "Upload accepted, pending processing.",
        "progress": 0,
        "total": None,
        "stage": "reading_file"
    }
    background_tasks.add_task(
        process_file_in_background,
        task_id,
        temp_file_path,
        original_filename,
        caso_id,
        tipo_archivo,
        column_mapping,
        current_user.User
    )
    logger.info(f"[Task {task_id}] File '{original_filename}' for caso {caso_id} enqueued for background processing.")
    return UploadInitiationResponse(
        task_id=task_id,
        message="File upload accepted and is being processed in the background. Check status endpoint for progress."
    )

@app.get("/casos/{caso_id}/archivos", response_model=List[schemas.ArchivoExcel]) # Schema ya incluye Total_Registros
def read_archivos_por_caso(caso_id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_user)):
    logger.info(f"GET /casos/{caso_id}/archivos - Solicitado por {current_user.User} (Rol: {current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol})")
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if db_caso is None:
        logger.warning(f"Caso ID {caso_id} no encontrado al buscar archivos (solicitado por {current_user.User}).")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado")

    user_rol = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol
    if user_rol != RolUsuarioEnum.superadmin.value: # No es superadmin, verificar grupo
        if current_user.ID_Grupo is None:
            logger.warning(f"Usuario {current_user.User} sin grupo intentó listar archivos del caso {caso_id}.")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene un grupo asignado.")
        if db_caso.ID_Grupo != current_user.ID_Grupo:
            logger.warning(f"Usuario {current_user.User} (Grupo {current_user.ID_Grupo}) intentó listar archivos del caso {caso_id} (Grupo {db_caso.ID_Grupo}). Acceso denegado.")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permiso para acceder a los archivos de este caso.")

    try:
        # Subconsulta para contar lecturas por ID_Archivo
        subquery = select(
            models.Lectura.ID_Archivo,
            func.count(models.Lectura.ID_Lectura).label("total_lecturas")
        ).group_by(models.Lectura.ID_Archivo).subquery()

        # Consulta principal uniendo ArchivoExcel con la subconsulta de conteo
        # Usamos un left outer join por si un archivo no tiene lecturas (aunque no debería pasar)
        archivos_con_conteo = db.query(
            models.ArchivoExcel,
            # Seleccionar la columna 'total_lecturas' de la subconsulta, usando 0 si es NULL
            func.coalesce(subquery.c.total_lecturas, 0).label("num_registros") 
        ).outerjoin(
            subquery, models.ArchivoExcel.ID_Archivo == subquery.c.ID_Archivo
        ).filter(
            models.ArchivoExcel.ID_Caso == caso_id
        ).order_by(models.ArchivoExcel.Fecha_de_Importacion.desc()).all()

        # Formatear la respuesta para que coincida con el schema
        respuesta = []
        for archivo_db, num_registros in archivos_con_conteo:
            archivo_schema = schemas.ArchivoExcel(
                ID_Archivo=archivo_db.ID_Archivo,
                ID_Caso=archivo_db.ID_Caso,
                Nombre_del_Archivo=archivo_db.Nombre_del_Archivo,
                Tipo_de_Archivo=archivo_db.Tipo_de_Archivo,
                Fecha_de_Importacion=archivo_db.Fecha_de_Importacion,
                Total_Registros=num_registros # Asignar el conteo calculado
            )
            respuesta.append(archivo_schema)
            
        logger.info(f"Encontrados {len(respuesta)} archivos para el caso {caso_id}.")
        return respuesta

    except Exception as e:
        logger.error(f"Error al obtener archivos para caso {caso_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al obtener archivos: {e}")

@app.delete("/archivos/{id_archivo}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_archivo(id_archivo: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_user)):
    logger.info(f"Solicitud DELETE para archivo ID: {id_archivo} por usuario {current_user.User}")
    archivo_db = db.query(models.ArchivoExcel).options(joinedload(models.ArchivoExcel.caso)).filter(models.ArchivoExcel.ID_Archivo == id_archivo).first()
    if archivo_db is None:
        logger.warning(f"[Delete] Archivo ID {id_archivo} no encontrado (solicitado por {current_user.User}).")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro archivo no encontrado.")

    if not archivo_db.caso:
        logger.error(f"[Delete] Archivo ID {id_archivo} (solicitado por {current_user.User}) no está asociado a ningún caso. No se puede verificar permisos.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error de consistencia de datos del archivo.")

    user_rol = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol
    if user_rol == RolUsuarioEnum.admingrupo.value:
        if current_user.ID_Grupo is None:
            logger.warning(f"[Delete] Admingrupo {current_user.User} sin grupo asignado intentó eliminar archivo {id_archivo}.")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admingrupo no tiene un grupo asignado.")
        if archivo_db.caso.ID_Grupo != current_user.ID_Grupo:
            logger.warning(f"[Delete] Admingrupo {current_user.User} (Grupo {current_user.ID_Grupo}) intentó eliminar archivo {id_archivo} del caso {archivo_db.ID_Caso} (Grupo {archivo_db.caso.ID_Grupo}). Acceso denegado.")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permiso para eliminar este archivo.")
    elif user_rol != RolUsuarioEnum.superadmin.value:
        logger.warning(f"[Delete] Usuario {current_user.User} (Rol {user_rol}) intentó eliminar archivo {id_archivo}. Acceso denegado.")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permiso denegado para eliminar archivos.")

    file_path_to_delete = None
    if archivo_db.Nombre_del_Archivo:
        file_path_to_delete = UPLOADS_DIR / archivo_db.Nombre_del_Archivo
        logger.info(f"[Delete] Ruta física: {file_path_to_delete}")
    else:
        logger.warning(f"[Delete] Registro ID {id_archivo} sin nombre, no se borra archivo físico.")
    try:
        lecturas_eliminadas = db.query(models.Lectura).filter(models.Lectura.ID_Archivo == id_archivo).delete()
        logger.info(f"[Delete] {lecturas_eliminadas} lecturas asociadas marcadas para eliminar.")
        if file_path_to_delete and os.path.isfile(file_path_to_delete):
            try:
                os.remove(file_path_to_delete)
                logger.info(f"[Delete] Archivo físico eliminado: {file_path_to_delete}")
            except OSError as e:
                logger.error(f"[Delete] Error eliminando {file_path_to_delete}: {e}. Continuando...", exc_info=True)
        elif file_path_to_delete:
             logger.warning(f"[Delete] Archivo físico no existía: {file_path_to_delete}.")
        db.delete(archivo_db)
        logger.info(f"[Delete] Registro ArchivoExcel ID {id_archivo} marcado para eliminar.")
        db.commit()
        logger.info(f"[Delete] Commit realizado. Eliminación completa archivo ID {id_archivo}.")
        return
    except Exception as e:
        db.rollback()
        logger.error(f"[Delete] Error durante eliminación archivo ID {id_archivo}. Rollback: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno eliminando archivo: {e}")

# === LECTORES ===
@app.post("/lectores", response_model=schemas.Lector, status_code=status.HTTP_201_CREATED)
def create_lector(lector: schemas.LectorCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_admin_or_superadmin)):
    db_lector_existente = db.query(models.Lector).filter(models.Lector.ID_Lector == lector.ID_Lector).first()
    if db_lector_existente:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Ya existe un lector con el ID '{lector.ID_Lector}'")
    # Aquí usamos model_dump() de Pydantic V2 en lugar de dict()
    db_lector = models.Lector(**lector.model_dump())
    db.add(db_lector)
    db.commit()
    db.refresh(db_lector)
    return db_lector

@app.get("/lectores", response_model=schemas.LectoresResponse)
def read_lectores(
    skip: int = 0, 
    limit: int = 50, 
    id_lector: Optional[str] = None,
    nombre: Optional[str] = None,
    carretera: Optional[str] = None,
    provincia: Optional[str] = None,
    organismo: Optional[str] = None,
    sentido: Optional[str] = None,
    texto_libre: Optional[str] = None,
    sort: Optional[str] = None,
    order: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_user) # MODIFICADO
):
    logger.info(f"Solicitud GET /lectores por usuario {current_user.User} (Rol: {current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol}) con filtros: id={id_lector}, nombre={nombre}, carretera={carretera}, provincia={provincia}, organismo={organismo}, sentido={sentido}, sort={sort}, order={order}")
    
    # Construir query base
    query = db.query(models.Lector)
    
    # Aplicar filtros si están presentes
    if id_lector:
        query = query.filter(models.Lector.ID_Lector.ilike(f"%{id_lector}%"))
    if nombre:
        query = query.filter(models.Lector.Nombre.ilike(f"%{nombre}%"))
    if carretera:
        query = query.filter(models.Lector.Carretera.ilike(f"%{carretera}%"))
    if provincia:
        query = query.filter(models.Lector.Provincia.ilike(f"%{provincia}%"))
    if organismo:
        query = query.filter(models.Lector.Organismo_Regulador.ilike(f"%{organismo}%"))
    if sentido:
        query = query.filter(models.Lector.Sentido == sentido)
    if texto_libre:
        # Búsqueda en múltiples campos
        search_pattern = f"%{texto_libre}%"
        query = query.filter(
            or_(
                models.Lector.ID_Lector.ilike(search_pattern),
                models.Lector.Nombre.ilike(search_pattern),
                models.Lector.Carretera.ilike(search_pattern),
                models.Lector.Provincia.ilike(search_pattern),
                models.Lector.Localidad.ilike(search_pattern),
                models.Lector.Texto_Libre.ilike(search_pattern)
            )
        )
    
    # Obtener total antes de aplicar paginación
    total_count = query.count()
    logger.info(f"Total de lectores encontrados en DB: {total_count}")
    
    # Aplicar ordenamiento si se especifica
    if sort:
        column = getattr(models.Lector, sort, None)
        if column is not None:
            if order and order.lower() == 'desc':
                query = query.order_by(column.desc())
            else:
                query = query.order_by(column.asc())
    else:
        # Ordenamiento por defecto
        query = query.order_by(models.Lector.ID_Lector)
    
    # Aplicar paginación
    query = query.offset(skip).limit(limit)
    lectores = query.all()
    logger.info(f"Devolviendo {len(lectores)} lectores para la página actual.")
    
    return schemas.LectoresResponse(total_count=total_count or 0, lectores=lectores)

# --- Rutas específicas ANTES de la ruta con parámetro {lector_id} ---

@app.get("/lectores/coordenadas", response_model=List[schemas.LectorCoordenadas])
def read_lectores_coordenadas(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_user)):
    """Devuelve una lista de lectores con coordenadas válidas para el mapa."""
    logger.info(f"Solicitud GET /lectores/coordenadas por usuario {current_user.User}")

    # Consultar todos los lectores que tengan Coordenada_X Y Coordenada_Y no nulas
    lectores_con_coords = db.query(models.Lector).filter(
        models.Lector.Coordenada_X.isnot(None),
        models.Lector.Coordenada_Y.isnot(None)
    ).all()

    logger.info(f"Encontrados {len(lectores_con_coords)} lectores con coordenadas válidas.")

    # response_model se encarga de la serialización
    return lectores_con_coords

@app.get("/lectores/sugerencias", response_model=schemas.LectorSugerenciasResponse)
def get_lector_sugerencias(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_user)):
    """Obtiene listas de valores únicos existentes para campos de Lector."""
    logger.info(f"Solicitud GET /lectores/sugerencias por usuario {current_user.User}")
    sugerencias = {
        "provincias": [], "localidades": [], "carreteras": [], "organismos": [], "contactos": []
    }
    try:
        # Usar distinct() y filtrar no nulos/vacíos
        # Convertir a string explícitamente antes de filtrar por != '' podría ayudar
        sugerencias["provincias"] = sorted([p[0] for p in db.query(models.Lector.Provincia).filter(models.Lector.Provincia.isnot(None), func.trim(models.Lector.Provincia) != '').distinct().all()])
        sugerencias["localidades"] = sorted([l[0] for l in db.query(models.Lector.Localidad).filter(models.Lector.Localidad.isnot(None), func.trim(models.Lector.Localidad) != '').distinct().all()])
        sugerencias["carreteras"] = sorted([c[0] for c in db.query(models.Lector.Carretera).filter(models.Lector.Carretera.isnot(None), func.trim(models.Lector.Carretera) != '').distinct().all()])
        sugerencias["organismos"] = sorted([o[0] for o in db.query(models.Lector.Organismo_Regulador).filter(models.Lector.Organismo_Regulador.isnot(None), func.trim(models.Lector.Organismo_Regulador) != '').distinct().all()])
        sugerencias["contactos"] = sorted([co[0] for co in db.query(models.Lector.Contacto).filter(models.Lector.Contacto.isnot(None), func.trim(models.Lector.Contacto) != '').distinct().all()])
        
        # Log detallado de lo que se encontró
        logger.info(f"Sugerencias encontradas en BD (antes de devolver):")
        logger.info(f"  Provincias ({len(sugerencias['provincias'])}): {sugerencias['provincias']}")
        logger.info(f"  Localidades ({len(sugerencias['localidades'])}): {sugerencias['localidades']}")
        logger.info(f"  Carreteras ({len(sugerencias['carreteras'])}): {sugerencias['carreteras']}")
        logger.info(f"  Organismos ({len(sugerencias['organismos'])}): {sugerencias['organismos']}")
        logger.info(f"  Contactos ({len(sugerencias['contactos'])}): {sugerencias['contactos']}")

    except Exception as e:
        logger.error(f"Error al obtener sugerencias para lectores: {e}", exc_info=True)
        # Mantener devolución de listas vacías para no bloquear UI
    
    return schemas.LectorSugerenciasResponse(**sugerencias)

# --- Ruta con parámetro DESPUÉS de las específicas ---
@app.get("/lectores/{lector_id}", response_model=schemas.Lector)
def read_lector(lector_id: str, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_user)):
    logger.info(f"Solicitud GET /lectores/{lector_id} por usuario {current_user.User}")
    db_lector = db.query(models.Lector).filter(models.Lector.ID_Lector == lector_id).first()
    if db_lector is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lector no encontrado")
    return db_lector

@app.put("/lectores/{lector_id}", response_model=schemas.Lector)
def update_lector(lector_id: str, lector_update: schemas.LectorUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_admin_or_superadmin)):
    db_lector = db.query(models.Lector).filter(models.Lector.ID_Lector == lector_id).first()
    if db_lector is None:
        logger.warning(f"[Update Lector] Lector con ID '{lector_id}' no encontrado.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lector no encontrado")

    # Usar model_dump() para Pydantic V2
    update_data = lector_update.model_dump(exclude_unset=True)
    logger.debug(f"[Update Lector {lector_id}] Datos recibidos: {update_data}")

    # Procesar UbicacionInput por separado
    ubicacion_input_str = update_data.pop('UbicacionInput', None)
    if ubicacion_input_str:
        logger.info(f"[Update Lector {lector_id}] Intentando parsear UbicacionInput: '{ubicacion_input_str}'")
        parsed_coords = parsear_ubicacion(ubicacion_input_str)
        if parsed_coords:
            lat, lon = parsed_coords
            logger.info(f"[Update Lector {lector_id}] Coordenadas parseadas: Lat={lat}, Lon={lon}")
            db_lector.Coordenada_Y = lat
            db_lector.Coordenada_X = lon
        else:
            logger.warning(f"[Update Lector {lector_id}] No se pudieron parsear coordenadas. Estableciendo a null.")
            db_lector.Coordenada_Y = None
            db_lector.Coordenada_X = None
    else:
        logger.debug(f"[Update Lector {lector_id}] No se proporcionó UbicacionInput.")
        update_data.pop('Coordenada_X', None)
        update_data.pop('Coordenada_Y', None)

    # Actualizar el resto de los campos
    logger.debug(f"[Update Lector {lector_id}] Actualizando otros campos: {update_data}")
    for key, value in update_data.items():
        if key not in ['Coordenada_X', 'Coordenada_Y']:
            setattr(db_lector, key, value)

    try:
        # --- Indent this block ---
        db.commit()
        db.refresh(db_lector)
        logger.info(f"[Update Lector {lector_id}] Lector actualizado correctamente.")
        return db_lector
        # --- End indented block ---
    except Exception as e:
        db.rollback()
        logger.error(f"[Update Lector {lector_id}] Error al guardar BD: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al guardar: {e}")

@app.delete("/lectores/{lector_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lector(lector_id: str, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_admin_or_superadmin)):
    db_lector = db.query(models.Lector).filter(models.Lector.ID_Lector == lector_id).first()
    if db_lector is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lector no encontrado")
    lecturas_asociadas = db.query(models.Lectura).filter(models.Lectura.ID_Lector == lector_id).count()
    if lecturas_asociadas > 0:
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"No se puede eliminar '{lector_id}', tiene {lecturas_asociadas} lecturas asociadas.")
    db.delete(db_lector)
    db.commit()
    return None

# === VEHICULOS ===
@app.post("/vehiculos", response_model=schemas.Vehiculo, status_code=status.HTTP_201_CREATED, tags=["Vehículos"])
def create_vehiculo(vehiculo: schemas.VehiculoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_superadmin)): # MODIFICADO
    """Crea un nuevo vehículo o devuelve el existente si la matrícula ya existe. Solo Superadmin."""
    db_vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.Matricula == vehiculo.Matricula).first()
    if db_vehiculo:
        # Si ya existe, podrías devolver 409 Conflict o devolver el existente (como hacemos aquí)
        # raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vehículo con esta matrícula ya existe")
        return db_vehiculo # Devolvemos el existente
    
    # Crear nuevo vehículo
    db_vehiculo = models.Vehiculo(**vehiculo.model_dump(exclude_unset=True))
    try:
        # --- Indent this block --- 
        db.add(db_vehiculo)
        db.commit()
        db.refresh(db_vehiculo)
        logger.info(f"Vehículo creado con matrícula: {db_vehiculo.Matricula}")
        return db_vehiculo
        # --- End indented block ---
    except IntegrityError as e:
        db.rollback()
        logger.error(f"Error de integridad al crear vehículo {vehiculo.Matricula}: {e}")
        # Esto podría pasar si hay una condición de carrera, aunque el check inicial debería prevenirlo
        existing_vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.Matricula == vehiculo.Matricula).first()
        if existing_vehiculo:
             return existing_vehiculo # Devolver el que se creó concurrentemente
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al crear vehículo: {e}")
    except Exception as e:
        db.rollback()
        logger.error(f"Error inesperado al crear vehículo {vehiculo.Matricula}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error inesperado al crear vehículo: {e}")

@app.put("/vehiculos/{vehiculo_id}", response_model=schemas.Vehiculo, tags=["Vehículos"])
def update_vehiculo(vehiculo_id: int, vehiculo_update: schemas.VehiculoUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_user)):
    """Actualiza los detalles de un vehículo existente por su ID numérico."""
    db_vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.ID_Vehiculo == vehiculo_id).first()
    if not db_vehiculo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Vehículo con ID {vehiculo_id} no encontrado")

    user_rol = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol
    if user_rol == RolUsuarioEnum.admingrupo.value: # Es admingrupo
        if current_user.ID_Grupo is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admingrupo no tiene un grupo asignado.")
        # Verificar si el vehículo está en algún caso del grupo del admingrupo
        vehiculo_en_grupo = db.query(models.Lectura)\
            .join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
            .join(models.Caso, models.ArchivoExcel.ID_Caso == models.Caso.ID_Caso)\
            .filter(models.Lectura.Matricula == db_vehiculo.Matricula)\
            .filter(models.Caso.ID_Grupo == current_user.ID_Grupo)\
            .first()
        if not vehiculo_en_grupo:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permiso para actualizar este vehículo. No está en los casos de su grupo.")
    elif user_rol != RolUsuarioEnum.superadmin.value: # No es admingrupo ni superadmin
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permiso denegado.")

    update_data = vehiculo_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_vehiculo, key, value)

    try:
        db.commit()
        db.refresh(db_vehiculo)
        logger.info(f"Vehículo ID {vehiculo_id} (Matrícula: {db_vehiculo.Matricula}) actualizado.")
        return db_vehiculo
    except Exception as e:
        db.rollback()
        logger.error(f"Error al actualizar vehículo ID {vehiculo_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al actualizar vehículo: {e}")

@app.get("/casos/{caso_id}/vehiculos", response_model=List[schemas.VehiculoWithStats])
def get_vehiculos_by_caso(caso_id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_user)): # MODIFIED
    logger.info(f"Usuario {current_user.User} (Rol: {getattr(current_user.Rol, 'value', current_user.Rol)}) solicitando vehículos para caso ID: {caso_id}") # ADDED
    # Verificar que el caso existe
    caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if not caso:
        logger.warning(f"Caso con ID {caso_id} no encontrado (solicitado por {current_user.User}).") # ADDED
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Caso con ID {caso_id} no encontrado")

    # Autenticación ya manejada por Depends(get_current_active_user)
    # user = db.query(models.Usuario).filter(models.Usuario.User == credentials.username).first() # REMOVED
    # if not user or user.Contraseña != credentials.password: # REMOVED
    #     raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas") # REMOVED
    
    # Verificar permisos: SuperAdmin puede acceder a cualquier caso
    user_rol_value = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol # MODIFIED
    is_superadmin = user_rol_value == 'superadmin' # MODIFIED
    
    if not is_superadmin and caso.ID_Grupo != current_user.ID_Grupo: # MODIFIED
        logger.warning(f"Usuario {current_user.User} (Grupo: {current_user.ID_Grupo}) no autorizado para acceder a vehículos del caso {caso_id} (Grupo caso: {caso.ID_Grupo}).") # ADDED
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permiso para acceder a los vehículos de este caso")

    try:
        # Intentar usar la vista optimizada si existe
        try:
            # Consulta optimizada usando la vista vehiculos_por_caso
            vista_exists = db.execute(text("SELECT name FROM sqlite_master WHERE type='view' AND name='vehiculos_por_caso'")).scalar() is not None
            
            if vista_exists:
                logger.info(f"Usando vista optimizada para vehículos del caso {caso_id}")
                # Consulta a través de la vista
                result = db.execute(
                    text("""
                    SELECT v.*, vpc.total_lecturas 
                    FROM Vehiculos v
                    JOIN vehiculos_por_caso vpc ON v.Matricula = vpc.Matricula
                    WHERE vpc.ID_Caso = :caso_id
                    ORDER BY v.Matricula
                    """),
                    {"caso_id": caso_id}
                )
                
                # Construir los objetos VehiculoWithStats
                vehiculos_with_stats = []
                for row in result:
                    # Convertir la fila a diccionario para crear el objeto
                    vehiculo_dict = {col: getattr(row, col) for col in row._mapping.keys() if hasattr(row, col)}
                    # Extraer los campos booleanos correctamente
                    vehiculo = models.Vehiculo(
                        ID_Vehiculo=vehiculo_dict.get('ID_Vehiculo'),
                        Matricula=vehiculo_dict.get('Matricula'),
                        Marca=vehiculo_dict.get('Marca'),
                        Modelo=vehiculo_dict.get('Modelo'),
                        Color=vehiculo_dict.get('Color'),
                        Propiedad=vehiculo_dict.get('Propiedad'),
                        Alquiler=vehiculo_dict.get('Alquiler', False),
                        Observaciones=vehiculo_dict.get('Observaciones'),
                        Comprobado=vehiculo_dict.get('Comprobado', False),
                        Sospechoso=vehiculo_dict.get('Sospechoso', False)
                    )
                    # Crear VehiculoWithStats con estadísticas
                    vehiculos_with_stats.append(schemas.VehiculoWithStats(
                        **vehiculo.__dict__,
                        num_lecturas_lpr=row.total_lecturas,
                        num_lecturas_gps=0
                    ))
                
                logger.info(f"Obtenidos {len(vehiculos_with_stats)} vehículos del caso {caso_id} mediante vista optimizada")
                return vehiculos_with_stats
        except Exception as e:
            logger.warning(f"Error al usar vista optimizada, usando consulta estándar: {e}")
        
        # Consulta estándar si la vista no existe o hay error
        # Subconsulta para obtener las matrículas únicas de las lecturas de este caso
        matriculas_en_caso_query = db.query(models.Lectura.Matricula)\
            .join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
            .filter(models.ArchivoExcel.ID_Caso == caso_id)\
            .distinct()

        # Obtener los vehículos cuya matrícula está en la subconsulta
        vehiculos_db = db.query(models.Vehiculo)\
            .filter(models.Vehiculo.Matricula.in_(matriculas_en_caso_query))\
            .order_by(models.Vehiculo.Matricula)\
            .all()

        # --- NUEVO: Calcular conteo de lecturas LPR por vehículo DENTRO del caso ---
        vehiculos_with_stats = []
        for vehiculo in vehiculos_db:
            # Contar lecturas LPR para este vehículo en este caso
            count_lpr = db.query(func.count(models.Lectura.ID_Lectura))\
                        .join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
                        .filter(
                            models.ArchivoExcel.ID_Caso == caso_id,
                            models.Lectura.Matricula == vehiculo.Matricula,
                            models.Lectura.Tipo_Fuente == 'LPR' # Solo contar LPR
                        ).scalar() or 0
            
            # Contar lecturas GPS (si aplica)
            count_gps = db.query(func.count(models.Lectura.ID_Lectura))\
                        .join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
                        .filter(
                            models.ArchivoExcel.ID_Caso == caso_id,
                            models.Lectura.Matricula == vehiculo.Matricula,
                            models.Lectura.Tipo_Fuente == 'GPS' # Solo contar GPS
                        ).scalar() or 0
            
            # Crear VehiculoWithStats
            vehiculos_with_stats.append(schemas.VehiculoWithStats(
                **vehiculo.__dict__,
                num_lecturas_lpr=count_lpr,
                num_lecturas_gps=count_gps
            ))
        
        logger.info(f"Obtenidos {len(vehiculos_with_stats)} vehículos del caso {caso_id} mediante consulta estándar")
        return vehiculos_with_stats
    
    except Exception as e:
        logger.error(f"Error al obtener vehículos del caso {caso_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al obtener vehículos: {e}"
        )

@app.get("/vehiculos/{vehiculo_id}/lecturas", response_model=List[schemas.Lectura], tags=["Vehículos"])
def get_lecturas_por_vehiculo(
    vehiculo_id: int, 
    caso_id: Optional[int] = Query(None, description="ID del caso opcional para filtrar lecturas"), 
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_user) # Usamos get_current_active_user para permitir acceso a rol consulta luego
):
    """
    Obtiene todas las lecturas (LPR y GPS) asociadas a un vehículo por su ID_Vehiculo.
    Opcionalmente filtra por caso_id si se proporciona.
    Restringido por grupo para roles no superadmin.
    """
    db_vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.ID_Vehiculo == vehiculo_id).first()
    if not db_vehiculo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Vehículo con ID {vehiculo_id} no encontrado")

    query = db.query(models.Lectura).filter(models.Lectura.Matricula == db_vehiculo.Matricula)
    user_rol = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol

    if user_rol != RolUsuarioEnum.superadmin.value: # Si no es superadmin, aplicar filtro de grupo
        if current_user.ID_Grupo is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario no tiene un grupo asignado.")
        
        if caso_id is not None:
            # Verificar que el caso_id pertenezca al grupo del usuario
            caso_pertenece_al_grupo = db.query(models.Caso)\
                .filter(models.Caso.ID_Caso == caso_id)\
                .filter(models.Caso.ID_Grupo == current_user.ID_Grupo)\
                .first()
            if not caso_pertenece_al_grupo:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permiso para acceder a las lecturas de este caso.")
            # Filtrar por el caso_id ya verificado
            query = query.join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
                         .filter(models.ArchivoExcel.ID_Caso == caso_id)
        else:
            # No se dio caso_id, filtrar todas las lecturas del vehículo que estén en casos del grupo del usuario
            query = query.join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
                         .join(models.Caso, models.ArchivoExcel.ID_Caso == models.Caso.ID_Caso)\
                         .filter(models.Caso.ID_Grupo == current_user.ID_Grupo)
    elif caso_id is not None: # Superadmin, pero se proveyó caso_id, así que filtramos por él
        query = query.join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
                     .filter(models.ArchivoExcel.ID_Caso == caso_id)

    lecturas = query.order_by(models.Lectura.Fecha_y_Hora.asc()).all()
    
    logger.info(f"Encontradas {len(lecturas)} lecturas para el vehículo ID {vehiculo_id} (Matrícula: {db_vehiculo.Matricula})" + (f" en caso ID {caso_id}" if caso_id else ""))
    # Devolvemos las lecturas con el lector asociado cargado (si existe)
    return [schemas.Lectura.model_validate(lect, from_attributes=True) for lect in lecturas]

@app.delete("/vehiculos/{vehiculo_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Vehículos"])
def delete_vehiculo(vehiculo_id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_superadmin)): # MODIFICADO
    """Elimina un vehículo por su ID numérico. Solo Superadmin."""
    db_vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.ID_Vehiculo == vehiculo_id).first()
    if not db_vehiculo:
        logger.warning(f"[DELETE /vehiculos] Vehículo con ID {vehiculo_id} no encontrado.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Vehículo con ID {vehiculo_id} no encontrado")

    matricula_log = db_vehiculo.Matricula # Guardar matrícula para log antes de borrar
    try:
        # --- Indent this block --- 
        db.delete(db_vehiculo)
        db.commit()
        logger.info(f"[DELETE /vehiculos] Vehículo ID {vehiculo_id} (Matrícula: {matricula_log}) eliminado exitosamente.")
        return None # Retornar None para 204 No Content
        # --- End indented block ---
    except Exception as e:
        db.rollback()
        logger.error(f"[DELETE /vehiculos] Error al eliminar vehículo ID {vehiculo_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al eliminar el vehículo: {e}")


# === LECTURAS ===
@app.get("/lecturas", response_model=List[schemas.Lectura])
def read_lecturas(
    skip: int = 0, limit: int = 100000,  # Aumentado de 2000 a 100000
    # Filtros de Fecha/Hora
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    hora_inicio: Optional[str] = None, 
    hora_fin: Optional[str] = None, 
    # Filtros de Identificadores (Listas)
    lector_ids: Optional[List[str]] = Query(None), 
    caso_ids: Optional[List[int]] = Query(None), 
    carretera_ids: Optional[List[str]] = Query(None),
    sentido: Optional[List[str]] = Query(None),
    matricula: Optional[List[str]] = Query(None),
    tipo_fuente: Optional[str] = Query(None),
    solo_relevantes: Optional[bool] = False,
    min_pasos: Optional[int] = None,
    max_pasos: Optional[int] = None,
    db: Session = Depends(get_db)
):
    logger.info(f"GET /lecturas - Filtros: min_pasos={min_pasos} max_pasos={max_pasos} carreteras={carretera_ids}")
    
    # Base query
    base_query = db.query(models.Lectura).join(models.Lector)
    
    # --- Aplicar filtros comunes ---
    if caso_ids:
        base_query = base_query.join(models.ArchivoExcel).filter(models.ArchivoExcel.ID_Caso.in_(caso_ids))
    if lector_ids:
        base_query = base_query.filter(models.Lectura.ID_Lector.in_(lector_ids))
    if carretera_ids:
        base_query = base_query.filter(models.Lector.Carretera.in_(carretera_ids))
    if sentido:
        base_query = base_query.filter(models.Lector.Sentido.in_(sentido))
    if tipo_fuente:
        base_query = base_query.filter(models.Lectura.Tipo_Fuente == tipo_fuente)
    if solo_relevantes:
        base_query = base_query.join(models.LecturaRelevante)
    
    # Filtros de fecha y hora
    try:
        if fecha_inicio:
            fecha_inicio_dt = datetime.strptime(fecha_inicio, "%Y-%m-%d").date()
            base_query = base_query.filter(models.Lectura.Fecha_y_Hora >= fecha_inicio_dt)
        if fecha_fin:
            fecha_fin_dt = datetime.strptime(fecha_fin, "%Y-%m-%d").date() + timedelta(days=1)
            base_query = base_query.filter(models.Lectura.Fecha_y_Hora < fecha_fin_dt)
        if hora_inicio:
            hora_inicio_time = datetime.strptime(hora_inicio, "%H:%M").time()
            base_query = base_query.filter(extract('hour', models.Lectura.Fecha_y_Hora) * 100 + extract('minute', models.Lectura.Fecha_y_Hora) >= hora_inicio_time.hour * 100 + hora_inicio_time.minute)
        if hora_fin:
            hora_fin_time = datetime.strptime(hora_fin, "%H:%M").time()
            base_query = base_query.filter(extract('hour', models.Lectura.Fecha_y_Hora) * 100 + extract('minute', models.Lectura.Fecha_y_Hora) <= hora_fin_time.hour * 100 + hora_fin_time.minute)
    except ValueError:
        logger.warning("Formato de fecha/hora inválido recibido.")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de fecha/hora inválido.")

    # Filtro por matrícula (usando or_ para múltiples valores y comodines)
    if matricula:
        condiciones = []
        for m in matricula:
            sql_pattern = m.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_').replace('?', '_').replace('*', '%')
            if '*' in m or '%' in m or '?' in m or '_' in m:
                condiciones.append(models.Lectura.Matricula.ilike(sql_pattern))
            else:
                condiciones.append(models.Lectura.Matricula == m)
        if condiciones:
            base_query = base_query.filter(or_(*condiciones))

    # Filtro por número de pasos (lecturas por matrícula)
    if min_pasos is not None or max_pasos is not None:
        # Crear una subconsulta con los mismos filtros para contar pasos
        pasos_subquery = (
            db.query(models.Lectura.Matricula, func.count('*').label('num_pasos'))
            .join(models.Lector)
        )
        
        # Aplicar los mismos filtros a la subconsulta
        if caso_ids:
            pasos_subquery = pasos_subquery.join(models.ArchivoExcel).filter(models.ArchivoExcel.ID_Caso.in_(caso_ids))
        if lector_ids:
            pasos_subquery = pasos_subquery.filter(models.Lectura.ID_Lector.in_(lector_ids))
        if carretera_ids:
            pasos_subquery = pasos_subquery.filter(models.Lector.Carretera.in_(carretera_ids))
        if sentido:
            pasos_subquery = pasos_subquery.filter(models.Lector.Sentido.in_(sentido))
        if tipo_fuente:
            pasos_subquery = pasos_subquery.filter(models.Lectura.Tipo_Fuente == tipo_fuente)
        if solo_relevantes:
            pasos_subquery = pasos_subquery.join(models.LecturaRelevante)
            
        # Aplicar los mismos filtros de fecha/hora
        try:
            if fecha_inicio:
                fecha_inicio_dt = datetime.strptime(fecha_inicio, "%Y-%m-%d").date()
                pasos_subquery = pasos_subquery.filter(models.Lectura.Fecha_y_Hora >= fecha_inicio_dt)
            if fecha_fin:
                fecha_fin_dt = datetime.strptime(fecha_fin, "%Y-%m-%d").date() + timedelta(days=1)
                pasos_subquery = pasos_subquery.filter(models.Lectura.Fecha_y_Hora < fecha_fin_dt)
            if hora_inicio:
                hora_inicio_time = datetime.strptime(hora_inicio, "%H:%M").time()
                pasos_subquery = pasos_subquery.filter(extract('hour', models.Lectura.Fecha_y_Hora) * 100 + extract('minute', models.Lectura.Fecha_y_Hora) >= hora_inicio_time.hour * 100 + hora_inicio_time.minute)
            if hora_fin:
                hora_fin_time = datetime.strptime(hora_fin, "%H:%M").time()
                pasos_subquery = pasos_subquery.filter(extract('hour', models.Lectura.Fecha_y_Hora) * 100 + extract('minute', models.Lectura.Fecha_y_Hora) <= hora_fin_time.hour * 100 + hora_fin_time.minute)
        except ValueError:
            logger.warning("Formato de fecha/hora inválido recibido en subconsulta de pasos.")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de fecha/hora inválido.")

        # Agrupar y filtrar por número de pasos
        pasos_subquery = (
            pasos_subquery.group_by(models.Lectura.Matricula)
            .having(and_(
                func.count('*') >= min_pasos if min_pasos is not None else True,
                func.count('*') <= max_pasos if max_pasos is not None else True
            ))
        )

        # Filtrar la consulta principal para incluir solo las matrículas que cumplen con los criterios de pasos
        base_query = base_query.filter(
            models.Lectura.Matricula.in_(
                pasos_subquery.with_entities(models.Lectura.Matricula)
            )
        )

    # Ordenar y aplicar paginación
    query = base_query.order_by(models.Lectura.Fecha_y_Hora.desc())
    query = query.options(joinedload(models.Lectura.lector))
    lecturas = query.offset(skip).limit(limit).all()

    logger.info(f"GET /lecturas - Encontradas {len(lecturas)} lecturas tras aplicar filtros.")
    return lecturas


# === NUEVO: Endpoints para Lecturas Relevantes ===

@app.post("/lecturas/{id_lectura}/marcar_relevante", response_model=schemas.LecturaRelevante, status_code=status.HTTP_201_CREATED)
def marcar_lectura_relevante(
    id_lectura: int, 
    # Usar el schema actualizado que puede incluir caso_id
    payload: Optional[schemas.LecturaRelevanteUpdate] = None, # MODIFICADO: payload puede ser Optional
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_user) # NUEVO
):
    """Marca una lectura como relevante, opcionalmente con una nota."""
    logger.info(f"Usuario {current_user.User} solicitando marcar lectura ID {id_lectura} como relevante.") # NUEVO log

    # Obtener la lectura y su caso asociado para verificar permisos
    db_lectura = db.query(models.Lectura)\
        .options(joinedload(models.Lectura.archivo).joinedload(models.ArchivoExcel.caso))\
        .filter(models.Lectura.ID_Lectura == id_lectura)\
        .first()

    if not db_lectura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lectura no encontrada.")

    # NUEVO BLOQUE DE AUTORIZACIÓN
    if not db_lectura.archivo or not db_lectura.archivo.caso:
        logger.error(f"Error de datos: Lectura ID {id_lectura} (solicitada por {current_user.User}) no está correctamente asociada a un archivo y caso.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error de datos: Lectura no asociada a un caso.")

    user_rol = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol
    is_superadmin = user_rol == models.RolUsuarioEnum.superadmin.value
    caso_de_lectura = db_lectura.archivo.caso

    if not is_superadmin and (current_user.ID_Grupo is None or caso_de_lectura.ID_Grupo != current_user.ID_Grupo):
        logger.warning(f"Usuario {current_user.User} no autorizado para marcar relevante la lectura ID {id_lectura} (caso ID {caso_de_lectura.ID_Caso}, grupo caso {caso_de_lectura.ID_Grupo}, grupo user {current_user.ID_Grupo}).")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permiso para modificar lecturas de este caso.")
    # FIN NUEVO BLOQUE DE AUTORIZACIÓN

    # Verificar si ya está marcada como relevante
    db_relevante_existente = db.query(models.LecturaRelevante).filter(models.LecturaRelevante.ID_Lectura == id_lectura).first()
    if db_relevante_existente:
        logger.info(f"Lectura {id_lectura} ya estaba marcada como relevante por {current_user.User}. Actualizando nota si se proporciona.") # MODIFICADO: log
        if payload and payload.Nota is not None:
            db_relevante_existente.Nota = payload.Nota
            db_relevante_existente.Fecha_Modificacion = datetime.now(timezone.utc) # NUEVO: Actualizar fecha modificación
            db.commit()
            db.refresh(db_relevante_existente)
            return db_relevante_existente
        else:
             return db_relevante_existente

    # Crear nueva entrada
    nueva_relevante_data = {"ID_Lectura": id_lectura} # MODIFICADO: Crear dict
    if payload and payload.Nota is not None: # MODIFICADO: Añadir nota al dict
        nueva_relevante_data["Nota"] = payload.Nota
    # Fecha_Creacion y Fecha_Modificacion se manejan por defecto en el modelo
    
    nueva_relevante = models.LecturaRelevante(**nueva_relevante_data) # MODIFICADO: Usar dict
    db.add(nueva_relevante)
    try:
        db.commit()
        db.refresh(nueva_relevante)
        logger.info(f"Lectura {id_lectura} marcada como relevante por usuario {current_user.User}.") # MODIFICADO: log
        return nueva_relevante
    except Exception as e:
        db.rollback()
        logger.error(f"Error al marcar lectura {id_lectura} como relevante por {current_user.User}: {e}", exc_info=True) # MODIFICADO: log
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al marcar la lectura.")

@app.delete("/lecturas/{id_lectura}/desmarcar_relevante", status_code=status.HTTP_204_NO_CONTENT)
def desmarcar_lectura_relevante(
    id_lectura: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_user)
):
    """Elimina la marca de relevancia de una lectura."""
    logger.info(f"Usuario {current_user.User} solicitando desmarcar lectura ID {id_lectura} como relevante.")

    db_relevante = db.query(models.LecturaRelevante).filter(models.LecturaRelevante.ID_Lectura == id_lectura).first()
    if not db_relevante:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="La lectura no estaba marcada como relevante.")

    # BLOQUE DE AUTORIZACIÓN
    db_lectura = db.query(models.Lectura)\
        .options(joinedload(models.Lectura.archivo).joinedload(models.ArchivoExcel.caso))\
        .filter(models.Lectura.ID_Lectura == db_relevante.ID_Lectura)\
        .first()

    if not db_lectura:
        logger.error(f"Error de datos: LecturaRelevante ID {db_relevante.ID_Relevante} (lectura ID {id_lectura}) existe, pero la lectura asociada no. Solicitado por {current_user.User}.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error de consistencia de datos.")

    if not db_lectura.archivo or not db_lectura.archivo.caso:
        logger.error(f"Error de datos: Lectura ID {id_lectura} (solicitada por {current_user.User}) no está correctamente asociada a un archivo y caso para desmarcar relevancia.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error de datos: Lectura no asociada a un caso.")

    user_rol = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol
    is_superadmin = user_rol == models.RolUsuarioEnum.superadmin.value
    caso_de_lectura = db_lectura.archivo.caso

    if not is_superadmin and (current_user.ID_Grupo is None or caso_de_lectura.ID_Grupo != current_user.ID_Grupo):
        logger.warning(f"Usuario {current_user.User} no autorizado para desmarcar relevante la lectura ID {id_lectura} (caso ID {caso_de_lectura.ID_Caso}, grupo caso {caso_de_lectura.ID_Grupo}, grupo user {current_user.ID_Grupo}).")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permiso para modificar lecturas de este caso.")
    # FIN BLOQUE DE AUTORIZACIÓN

    db.delete(db_relevante)
    try:
        db.commit()
        logger.info(f"Marca de relevante eliminada para lectura {id_lectura} por usuario {current_user.User}.")
        return None
    except Exception as e:
        db.rollback()
        logger.error(f"Error al desmarcar lectura {id_lectura} por usuario {current_user.User}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al desmarcar la lectura.")

@app.get("/casos/{caso_id}/saved_searches", response_model=List[schemas.SavedSearch])
def read_saved_searches(caso_id: int, db: Session = Depends(get_db)):
    logger.info(f"GET /casos/{caso_id}/saved_searches - Listando búsquedas guardadas.")
    searches = db.query(models.SavedSearch).filter(models.SavedSearch.caso_id == caso_id).order_by(models.SavedSearch.name).all()
    return searches

@app.put("/saved_searches/{search_id}", response_model=schemas.SavedSearch)
def update_saved_search(search_id: int, search_update_data: schemas.SavedSearchUpdate, db: Session = Depends(get_db)):
    logger.info(f"PUT /saved_searches/{search_id} - Actualizando búsqueda guardada.")
    db_search = db.query(models.SavedSearch).filter(models.SavedSearch.id == search_id).first()
    if db_search is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Búsqueda guardada no encontrada.")
    
    try:
        update_data = search_update_data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_search, key, value)
        
        db.commit()
        db.refresh(db_search)
        logger.info(f"Búsqueda guardada ID {search_id} actualizada.")
        return db_search
    except Exception as e:
        db.rollback()
        logger.error(f"Error al actualizar búsqueda guardada ID {search_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno al actualizar búsqueda.")

@app.delete("/saved_searches/{search_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_search(search_id: int, db: Session = Depends(get_db)):
    logger.info(f"DELETE /saved_searches/{search_id} - Eliminando búsqueda guardada.")
    db_search = db.query(models.SavedSearch).filter(models.SavedSearch.id == search_id).first()
    if db_search is None:
        logger.warning(f"Intento de eliminar búsqueda guardada ID {search_id} no encontrada.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Búsqueda guardada no encontrada.")
    
    try:
        db.delete(db_search)
        db.commit()
        logger.info(f"Búsqueda guardada ID {search_id} eliminada.")
        return None
    except Exception as e:
        db.rollback()
        logger.error(f"Error al eliminar búsqueda guardada ID {search_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno al eliminar búsqueda.")

# === Endpoint para Detección de Vehículo Lanzadera ===
# Removed as part of cleanup

# --- Fin Endpoint --- 

# === NUEVO ENDPOINT PARA LECTURAS DEL MAPA ===
@app.get("/casos/{caso_id}/lecturas_para_mapa", response_model=List[schemas.LectorCoordenadas], tags=["Casos"])
def get_lecturas_para_mapa(caso_id: int, db: Session = Depends(get_db)):
    """
    Obtiene una lista de lectores únicos con coordenadas válidas 
    asociados a las lecturas de un caso específico.
    Utilizado para poblar el mapa en la vista de detalle del caso.
    """
    logger.info(f"GET /casos/{caso_id}/lecturas_para_mapa - Obteniendo lectores para el mapa.")
    
    # Verificar si el caso existe primero
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if not db_caso:
        logger.warning(f"Caso ID {caso_id} no encontrado para obtener lecturas de mapa.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado")

    try:
        # Consultar Lecturas asociadas al caso a través de ArchivoExcel, cargando el Lector
        lecturas_con_lector = db.query(models.Lectura)\
            .join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
            .options(joinedload(models.Lectura.lector))\
            .filter(models.ArchivoExcel.ID_Caso == caso_id)\
            .all()

        lectores_unicos_mapa = {} # Usar dict para asegurar unicidad por ID_Lector

        for lectura in lecturas_con_lector:
            lector = lectura.lector
            # Verificar si el lector existe, tiene coordenadas válidas y aún no está en nuestro dict
            if (lector and 
                lector.Coordenada_X is not None and 
                lector.Coordenada_Y is not None and
                lector.ID_Lector not in lectores_unicos_mapa):
                
                # Crear una instancia del schema Pydantic para la respuesta
                lector_data = schemas.LectorCoordenadas(
                    ID_Lector=lector.ID_Lector,
                    Nombre=lector.Nombre,
                    Coordenada_Y=lector.Coordenada_Y, # Latitud
                    Coordenada_X=lector.Coordenada_X, # Longitud
                    Provincia=lector.Provincia,
                    Carretera=lector.Carretera,
                    Organismo_Regulador=lector.Organismo_Regulador # Campo añadido a LectorCoordenadas
                )
                lectores_unicos_mapa[lector.ID_Lector] = lector_data

        lista_lectores = list(lectores_unicos_mapa.values())
        logger.info(f"Encontrados {len(lista_lectores)} lectores únicos con coordenadas para el caso {caso_id}.")
        return lista_lectores

    except Exception as e:
        db.rollback()
        logger.error(f"Error al obtener lectores para mapa del caso {caso_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al obtener datos del mapa: {e}")

@app.get("/casos/{caso_id}/lectores", response_model=List[schemas.Lector])
def get_lectores_por_caso(caso_id: int, db: Session = Depends(get_db)):
    """
    Obtiene todos los lectores que tienen lecturas asociadas a un caso específico.
    """
    logger.info(f"GET /casos/{caso_id}/lectores - Obteniendo lectores asociados al caso.")
    
    try:
        # Obtener IDs de lectores únicos que tienen lecturas en este caso
        lectores_ids = db.query(models.Lectura.ID_Lector)\
            .join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
            .filter(models.ArchivoExcel.ID_Caso == caso_id)\
            .distinct()\
            .all()
        
        # Extraer los IDs de la lista de tuplas
        lector_ids = [id[0] for id in lectores_ids if id[0] is not None]
        
        if not lector_ids:
            return []
            
        # Obtener los detalles completos de los lectores
        lectores = db.query(models.Lector)\
            .filter(models.Lector.ID_Lector.in_(lector_ids))\
            .all()
            
        return lectores
        
    except Exception as e:
        logger.error(f"Error al obtener lectores para caso {caso_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error interno al obtener lectores: {str(e)}"
        )

@app.get("/casos/{caso_id}/lecturas", response_model=List[schemas.Lectura])
def get_lecturas_por_caso(
    caso_id: int,
    matricula: Optional[str] = None,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    hora_inicio: Optional[str] = None,
    hora_fin: Optional[str] = None,
    lector_id: Optional[str] = None,
    tipo_fuente: Optional[str] = None,
    solo_relevantes: Optional[bool] = False,
    velocidad_min: Optional[float] = None,
    velocidad_max: Optional[float] = None,
    duracion_parada: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Obtiene las lecturas de un caso específico con filtros opcionales.
    """
    try:
        # Verificar si el caso existe
        db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
        if not db_caso:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado")

        # Construir la consulta base
        query = db.query(models.Lectura)\
            .join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
            .filter(models.ArchivoExcel.ID_Caso == caso_id)

        # Aplicar filtros
        if matricula:
            query = query.filter(models.Lectura.Matricula == matricula)

        # --- NUEVO FILTRO: RANGO ABSOLUTO DE FECHA Y HORA ---
        if fecha_inicio and hora_inicio and fecha_fin and hora_fin:
            try:
                dt_inicio = datetime.strptime(f"{fecha_inicio} {hora_inicio}", "%Y-%m-%d %H:%M")
                dt_fin = datetime.strptime(f"{fecha_fin} {hora_fin}", "%Y-%m-%d %H:%M")
                query = query.filter(models.Lectura.Fecha_y_Hora >= dt_inicio, models.Lectura.Fecha_y_Hora <= dt_fin)
            except ValueError as e:
                logger.error(f"Error al parsear fecha/hora: {e}")
                raise HTTPException(status_code=400, detail=f"Formato de fecha/hora inválido: {e}")
        else:
            # Filtros antiguos si falta alguno de los campos
            if fecha_inicio:
                try:
                    fecha_inicio_dt = datetime.strptime(fecha_inicio, "%Y-%m-%d").date()
                    query = query.filter(models.Lectura.Fecha_y_Hora >= fecha_inicio_dt)
                except ValueError as e:
                    logger.error(f"Error al parsear fecha_inicio: {e}")
                    raise HTTPException(status_code=400, detail=f"Formato de fecha_inicio inválido: {fecha_inicio}. Use YYYY-MM-DD")

            if fecha_fin:
                try:
                    fecha_fin_dt = datetime.strptime(fecha_fin, "%Y-%m-%d").date() + timedelta(days=1)
                    query = query.filter(models.Lectura.Fecha_y_Hora < fecha_fin_dt)
                except ValueError as e:
                    logger.error(f"Error al parsear fecha_fin: {e}")
                    raise HTTPException(status_code=400, detail=f"Formato de fecha_fin inválido: {fecha_fin}. Use YYYY-MM-DD")

            if hora_inicio and fecha_inicio:
                try:
                    hora_time = datetime.strptime(hora_inicio, "%H:%M").time()
                    query = query.filter(extract('hour', models.Lectura.Fecha_y_Hora) * 100 + \
                                      extract('minute', models.Lectura.Fecha_y_Hora) >= \
                                      hora_time.hour * 100 + hora_time.minute)
                except ValueError as e:
                    logger.error(f"Error al parsear hora_inicio: {e}")
                    raise HTTPException(status_code=400, detail=f"Formato de hora_inicio inválido: {hora_inicio}. Use HH:MM")

            if hora_fin and fecha_fin:
                try:
                    hora_time = datetime.strptime(hora_fin, "%H:%M").time()
                    query = query.filter(extract('hour', models.Lectura.Fecha_y_Hora) * 100 + \
                                      extract('minute', models.Lectura.Fecha_y_Hora) <= \
                                      hora_time.hour * 100 + hora_time.minute)
                except ValueError as e:
                    logger.error(f"Error al parsear hora_fin: {e}")
                    raise HTTPException(status_code=400, detail=f"Formato de hora_fin inválido: {hora_fin}. Use HH:MM")

        if lector_id:
            query = query.filter(models.Lectura.ID_Lector == lector_id)

        if tipo_fuente:
            query = query.filter(models.Lectura.Tipo_Fuente == tipo_fuente)

        if solo_relevantes:
            query = query.join(models.LecturaRelevante, 
                             models.Lectura.ID_Lectura == models.LecturaRelevante.ID_Lectura,
                             isouter=False)

        # Nuevos filtros de velocidad
        if velocidad_min is not None:
            query = query.filter(models.Lectura.Velocidad >= velocidad_min)
        if velocidad_max is not None:
            query = query.filter(models.Lectura.Velocidad <= velocidad_max)

        # Filtro de duración de parada
        if duracion_parada is not None:
            # Obtener todas las lecturas ordenadas por matrícula y fecha/hora
            lecturas_all = query.order_by(models.Lectura.Matricula, models.Lectura.Fecha_y_Hora).all()
            def haversine(lat1, lon1, lat2, lon2):
                R = 6371000  # metros
                dlat = radians(lat2 - lat1)
                dlon = radians(lon2 - lon1)
                a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
                c = 2 * asin(sqrt(a))
                return R * c
            # Calcular duracion_parada_min para todas las lecturas que sean inicio de parada
            duraciones_parada = {}
            for i in range(len(lecturas_all) - 1):
                l1 = lecturas_all[i]
                l2 = lecturas_all[i+1]

                # --- LOG DE DEPURACIÓN --- START
                # Solo loguear para el vehículo específico si se proporciona en los parámetros
                if matricula and l1.Matricula == matricula:
                    log_msg = f"[DEBUG Parada] Matricula: {l1.Matricula}, Index: {i}"
                    log_msg += f"\n  L1: Fecha={l1.Fecha_y_Hora}, Coords=({l1.Coordenada_Y}, {l1.Coordenada_X}), Velocidad={l1.Velocidad}"
                    log_msg += f"\n  L2: Fecha={l2.Fecha_y_Hora}, Coords=({l2.Coordenada_Y}, {l2.Coordenada_X}), Velocidad={l2.Velocidad}"
                    
                    if l1.Matricula != l2.Matricula:
                        log_msg += "\n  -> SKIPPED: Different Matricula"
                    elif not (l1.Fecha_y_Hora and l2.Fecha_y_Hora and l1.Coordenada_X is not None and l1.Coordenada_Y is not None and l2.Coordenada_X is not None and l2.Coordenada_Y is not None):
                         log_msg += "\n  -> SKIPPED: Missing Date/Time or Coords"
                    else:
                        diff_min_calc = (l2.Fecha_y_Hora - l1.Fecha_y_Hora).total_seconds() / 60
                        log_msg += f"\n  Diff Min: {diff_min_calc:.2f}"
                        if diff_min_calc <= 0:
                             log_msg += "\n  -> SKIPPED: Time diff <= 0"
                        else:
                             dist_calc = haversine(l1.Coordenada_Y, l1.Coordenada_X, l2.Coordenada_Y, l2.Coordenada_X)
                             log_msg += f"\n  Distance (m): {dist_calc:.2f}"
                             if dist_calc > 300:
                                 log_msg += "\n  -> SKIPPED: Distance > 300m"
                             elif duracion_parada is not None and diff_min_calc < duracion_parada:
                                 log_msg += f"\n  -> SKIPPED: Duration ({diff_min_calc:.2f}min) < Filtered Duration ({duracion_parada}min)"
                             else:
                                 log_msg += "\n  -> PASSED ALL CHECKS"
                    logger.info(log_msg)
                # --- LOG DE DEPURACIÓN --- END

                if l1.Matricula != l2.Matricula:
                    continue
                if not (l1.Fecha_y_Hora and l2.Fecha_y_Hora and l1.Coordenada_X is not None and l1.Coordenada_Y is not None and l2.Coordenada_X is not None and l2.Coordenada_Y is not None):
                    continue
                diff_min = (l2.Fecha_y_Hora - l1.Fecha_y_Hora).total_seconds() / 60
                if diff_min <= 0:
                    continue
                # Eliminar filtro de velocidad
                # if l1.Velocidad is None or l1.Velocidad > 12:
                #     continue
                dist = haversine(l1.Coordenada_Y, l1.Coordenada_X, l2.Coordenada_Y, l2.Coordenada_X)
                if dist > 300:
                    continue
                # Si hay filtro de duracion_parada, solo considerar si cumple
                if duracion_parada is not None and diff_min < duracion_parada:
                    continue
                duraciones_parada[l1.ID_Lectura] = diff_min
            # Construir la respuesta
            lecturas_respuesta = []
            for l in lecturas_all:
                l_dict = l.__dict__.copy()
                if l.ID_Lectura in duraciones_parada:
                    l_dict['duracion_parada_min'] = duraciones_parada[l.ID_Lectura]
                else:
                    l_dict['duracion_parada_min'] = None
                lecturas_respuesta.append(schemas.Lectura(**l_dict))
            # Si hay filtro de duracion_parada, solo devolver las que sean inicio de parada y cumplen el mínimo
            if duracion_parada is not None:
                lecturas_respuesta = [l for l in lecturas_respuesta if l.duracion_parada_min is not None and l.duracion_parada_min >= duracion_parada]
            logger.info(f"Encontradas {len(lecturas_respuesta)} lecturas para el caso {caso_id}")
            return lecturas_respuesta

        # Si no hay filtro de duración de parada, ejecutar la consulta normal
        lecturas = query.all()
        return lecturas if lecturas else []

    except Exception as e:
        logger.error(f"Error al obtener lecturas del caso {caso_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error interno al obtener lecturas: {str(e)}"
        )

@app.get("/casos/{caso_id}/matriculas/sugerencias", response_model=List[str])
def get_sugerencias_matriculas(
    caso_id: int,
    background_tasks: BackgroundTasks, # MOVED UP further
    tipo_archivo: str = Form(..., pattern="^(GPS|LPR)$"),
    excel_file: UploadFile = File(...),
    column_mapping: str = Form(...),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_user)
):
    logger.info(f"User {current_user.User} requesting to upload file '{excel_file.filename}' for caso {caso_id}")
    # 1. Verificar caso y permisos (Synchronous part)
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if db_caso is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado")

    user_rol = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol
    if user_rol == RolUsuarioEnum.admingrupo.value:
        if current_user.ID_Grupo is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admingrupo no tiene un grupo asignado.")
        if db_caso.ID_Grupo != current_user.ID_Grupo:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permiso para subir archivos a este caso.")
    elif user_rol != RolUsuarioEnum.superadmin.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permiso denegado para subir archivos.")

    # 2. Verificar si ya existe un archivo con el mismo nombre en el mismo caso
    archivo_existente = db.query(models.ArchivoExcel).filter(
        models.ArchivoExcel.ID_Caso == caso_id,
        models.ArchivoExcel.Nombre_del_Archivo == excel_file.filename
    ).first()
    
    if archivo_existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe un archivo con el nombre '{excel_file.filename}' en este caso."
        )

    # --- GUARDAR ARCHIVO ORIGINAL ---
    filename = excel_file.filename
    file_location = UPLOADS_DIR / filename
    logger.info(f"Intentando guardar archivo en: {file_location}")
    try:
        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(excel_file.file, buffer)
        logger.info(f"Archivo guardado exitosamente en: {file_location}")
    except Exception as e:
        logger.error(f"Error CRÍTICO al guardar el archivo subido {filename} en {file_location}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"No se pudo guardar el archivo subido '{filename}'.")
    finally:
        excel_file.file.close()
    
    # --- Leer Excel y Mapeo ---
    try:
        df = pd.read_excel(file_location)
    except Exception as e:
        logger.error(f"Error al leer el archivo Excel desde {file_location}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Error al leer el archivo Excel guardado ({filename}).")
    try:
        map_cliente_a_interno = json.loads(column_mapping)
        map_interno_a_cliente = {v: k for k, v in map_cliente_a_interno.items()}
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El mapeo de columnas no es un JSON válido.")
    try:
        columnas_a_renombrar = {k: v for k, v in map_interno_a_cliente.items() if k in df.columns}
        df.rename(columns=columnas_a_renombrar, inplace=True)
    except Exception as e:
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Error al aplicar mapeo de columnas: {e}.")

    # --- Validar Columnas Obligatorias ---
    if tipo_archivo == 'LPR':
        columnas_obligatorias = ['Matricula', 'Fecha', 'Hora', 'ID_Lector']
    elif tipo_archivo == 'GPS':
        columnas_obligatorias = ['Matricula', 'Fecha', 'Hora']
    else:
        columnas_obligatorias = ['Matricula', 'Fecha', 'Hora']
    columnas_obligatorias_faltantes = []
    for campo_interno in columnas_obligatorias:
        if campo_interno not in df.columns:
            col_excel_mapeada = map_cliente_a_interno.get(campo_interno)
            columnas_obligatorias_faltantes.append(f"{campo_interno} (mapeada desde '{col_excel_mapeada}')" if col_excel_mapeada else f"{campo_interno} (no mapeada)")
    if columnas_obligatorias_faltantes:
        mensaje_error = f"Faltan columnas obligatorias o mapeos incorrectos: {', '.join(columnas_obligatorias_faltantes)}"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=mensaje_error)

    # --- Crear Registro ArchivoExcel ---
    db_archivo = models.ArchivoExcel(
        ID_Caso=caso_id,
        Nombre_del_Archivo=filename,
        Tipo_de_Archivo=tipo_archivo
    )
    db.add(db_archivo)
    db.flush()
    db.refresh(db_archivo)

    # --- Procesar e Insertar Lecturas ---
    lecturas_a_insertar = []
    errores_lectura = []
    lectores_no_encontrados = set()
    nuevos_lectores_en_sesion = set()
    lecturas_duplicadas = set()  # Para trackear lecturas duplicadas

    for index, row in df.iterrows():
        try:
            matricula = str(row['Matricula']).strip() if pd.notna(row['Matricula']) else None
            if not matricula: raise ValueError("Matrícula vacía")
            valor_fecha_excel = row['Fecha']
            valor_hora_excel = row['Hora']
            fecha_hora_final = None
            def parse_hora(hora_val):
                if isinstance(hora_val, time):
                    return hora_val
                if isinstance(hora_val, datetime):
                    return hora_val.time()
                if isinstance(hora_val, float) and not pd.isna(hora_val):
                    # Excel puede guardar horas como fracción de día
                    total_seconds = int(hora_val * 24 * 60 * 60)
                    h = total_seconds // 3600
                    m = (total_seconds % 3600) // 60
                    s = total_seconds % 60
                    return time(hour=h, minute=m, second=s)
                if isinstance(hora_val, str):
                    # Aceptar formatos "HH:MM", "HH:MM:SS", "HH:MM:SS.sss" o "HH:MM:SS,sss"
                    match = re.match(r"^(\d{1,2}):(\d{2})(?::(\d{2})([.,](\d{1,6}))?)?$", hora_val.strip())
                    if match:
                        h = int(match.group(1))
                        m = int(match.group(2))
                        s = int(match.group(3) or 0)
                        ms = match.group(5)
                        micro = int(float(f'0.{ms}') * 1_000_000) if ms else 0
                        return time(hour=h, minute=m, second=s, microsecond=micro)
                raise ValueError(f"Formato de hora no reconocido: {hora_val}")
            try:
                # Normalizar hora
                hora_obj = parse_hora(valor_hora_excel)
                # Normalizar fecha
                if isinstance(valor_fecha_excel, datetime):
                    fecha_obj = valor_fecha_excel.date()
                elif isinstance(valor_fecha_excel, date):
                    fecha_obj = valor_fecha_excel
                elif isinstance(valor_fecha_excel, float) and not pd.isna(valor_fecha_excel):
                    # Excel puede guardar fechas como número de días desde 1899-12-30
                    fecha_obj = pd.to_datetime(valor_fecha_excel, unit='d', origin='1899-12-30').date()
                else:
                    fecha_obj = pd.to_datetime(str(valor_fecha_excel)).date()
                fecha_hora_final = datetime.combine(fecha_obj, hora_obj)
            except Exception as e_comb:
                raise ValueError(f"Error combinando/parseando Fecha/Hora: {e_comb}")

            id_lector = None
            coord_x_final = get_optional_float(row.get('Coordenada_X'))
            coord_y_final = get_optional_float(row.get('Coordenada_Y'))

            if tipo_archivo == 'LPR':
                id_lector_str = str(row['ID_Lector']).strip() if pd.notna(row['ID_Lector']) else None
                if not id_lector_str: raise ValueError("Falta ID_Lector para LPR")
                id_lector = id_lector_str # Guardamos el ID original
                
                # Buscar lector existente
                db_lector = db.query(models.Lector).filter(models.Lector.ID_Lector == id_lector).first()
                
                if not db_lector:
                    # Si no existe Y NO lo hemos añadido ya en esta sesión:
                    if id_lector not in nuevos_lectores_en_sesion:
                        lectores_no_encontrados.add(id_lector)
                        logger.info(f"Lector '{id_lector}' no encontrado, añadiendo a sesión para crear.")
                        db_lector_nuevo = models.Lector(ID_Lector=id_lector) # Crear con el ID
                        db.add(db_lector_nuevo)
                        nuevos_lectores_en_sesion.add(id_lector) # Registrar que lo hemos añadido
                        # Intentar obtener coordenadas del excel si existen para el nuevo lector
                        coord_x_nuevo = get_optional_float(row.get('Coordenada_X'))
                        coord_y_nuevo = get_optional_float(row.get('Coordenada_Y'))
                        if coord_x_nuevo is not None: db_lector_nuevo.Coordenada_X = coord_x_nuevo
                        if coord_y_nuevo is not None: db_lector_nuevo.Coordenada_Y = coord_y_nuevo
                        # Asignar las coordenadas finales para la lectura actual (pueden venir del Excel)
                        coord_x_final = coord_x_nuevo
                        coord_y_final = coord_y_nuevo
                    else:
                        # Ya añadido a la sesión, solo obtener coords si las hay en esta fila para la lectura
                        coord_x_final = get_optional_float(row.get('Coordenada_X'))
                        coord_y_final = get_optional_float(row.get('Coordenada_Y'))
                        
                else: # Si el lector SÍ existe
                    if coord_x_final is None: coord_x_final = db_lector.Coordenada_X
                    if coord_y_final is None: coord_y_final = db_lector.Coordenada_Y

            carril = get_optional_str(row.get('Carril'))
            velocidad = get_optional_float(row.get('Velocidad'))
            lectura_data = {
                "ID_Archivo": db_archivo.ID_Archivo, "Matricula": matricula,
                "Fecha_y_Hora": fecha_hora_final, "Carril": carril, "Velocidad": velocidad,
                "ID_Lector": id_lector,
                "Coordenada_X": coord_x_final, "Coordenada_Y": coord_y_final,
                "Tipo_Fuente": tipo_archivo
            }

            # Verificar si ya existe una lectura duplicada
            lectura_duplicada = db.query(models.Lectura)\
                .join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
                .filter(
                    models.ArchivoExcel.ID_Caso == caso_id,
                    models.Lectura.Matricula == matricula,
                    models.Lectura.Fecha_y_Hora == fecha_hora_final,
                    models.Lectura.ID_Lector == id_lector
                ).first()

            if lectura_duplicada:
                lecturas_duplicadas.add(f"Fila {index+1}: Matrícula {matricula} - {fecha_hora_final}")
                continue  # Saltar esta lectura duplicada

            # Crear nueva lectura
            nueva_lectura = models.Lectura(**lectura_data)
            lecturas_a_insertar.append(nueva_lectura)

        except Exception as e:
            errores_lectura.append(f"Fila {index+1}: {str(e)}")
            continue

    # Insertar todas las lecturas válidas
    if lecturas_a_insertar:
        db.add_all(lecturas_a_insertar)
        db.commit()

    # Preparar respuesta con información sobre duplicados
    response_data = schemas.UploadResponse(
        archivo=db_archivo,
        total_registros=len(lecturas_a_insertar),
        errores=errores_lectura if errores_lectura else None,
        lectores_no_encontrados=list(lectores_no_encontrados) if lectores_no_encontrados else None,
        lecturas_duplicadas=list(lecturas_duplicadas) if lecturas_duplicadas else None,
        nuevos_lectores_creados=list(nuevos_lectores_en_sesion) if nuevos_lectores_en_sesion else None
    )
    
    # Loguear lo que se va a devolver
    logger.info(f"Importación completada. Devolviendo datos: {response_data}")
    if errores_lectura:
        logger.warning(f"Importación {filename} completada con {len(errores_lectura)} errores: {errores_lectura}")
    if lecturas_duplicadas:
        logger.warning(f"Importación {filename} completada con {len(lecturas_duplicadas)} lecturas duplicadas: {lecturas_duplicadas}")

    return response_data

# --- START Background File Processing Function ---
def process_file_in_background(
    task_id: str,
    temp_file_path: str,
    original_filename: str,
    caso_id: int,
    tipo_archivo: str,
    column_mapping_str: str,
    user_id_for_log: int
):
    import os
    db: Session = SessionLocal()
    logger.info(f"[Task {task_id}] Background processing started for {original_filename} (Caso: {caso_id}, Tipo: {tipo_archivo})")
    task_statuses[task_id] = {**task_statuses.get(task_id, {}), "status": "processing", "message": "Leyendo archivo...", "progress": 0, "stage": "reading_file"}
    try:
        logger.info(f"[Task {task_id}] Leyendo archivo: {temp_file_path}")
        try:
            # Intentar leer como Excel primero
            try:
                df = pd.read_excel(temp_file_path)
                logger.info(f"[Task {task_id}] Archivo Excel leído. Filas: {df.shape[0]}")
            except Exception as e_xls:
                logger.warning(f"[Task {task_id}] No es Excel, intentando como CSV: {e_xls}")
                import csv
                with open(temp_file_path, 'r', encoding='utf-8') as f:
                    sample = f.read(4096)
                    f.seek(0)
                    sniffer = csv.Sniffer()
                    dialect = sniffer.sniff(sample)
                    delimiter = dialect.delimiter
                    logger.info(f"[Task {task_id}] Delimitador CSV detectado: '{delimiter}'")
                    df = pd.read_csv(temp_file_path, delimiter=delimiter, encoding='utf-8')
                logger.info(f"[Task {task_id}] Archivo CSV leído. Filas: {df.shape[0]}")
            # Actualizar a siguiente etapa
            task_statuses[task_id]["stage"] = "parsing_mapping"
            task_statuses[task_id]["message"] = "Procesando mapeo de columnas..."
        except Exception as e:
            logger.error(f"[Task {task_id}] Fallo al leer archivo {temp_file_path}: {e}", exc_info=True)
            raise ValueError(f"Error al leer el archivo Excel o CSV: {e}")

        logger.info(f"[Task {task_id}] Parseando mapeo de columnas: {column_mapping_str}")
        try:
            map_cliente_a_interno = json.loads(column_mapping_str)
            map_interno_a_cliente = {v: k for k, v in map_cliente_a_interno.items()}
            # Actualizar a siguiente etapa
            task_statuses[task_id]["stage"] = "preparing_data"
            task_statuses[task_id]["message"] = "Creando estructura de datos..."
            # --- PROGRESO PREPARACIÓN DE DATOS ---
            total_rows = 0
            if 'Fecha' in map_cliente_a_interno and 'Hora' in map_cliente_a_interno:
                total_rows = 0 if df.empty else len(df)
            else:
                total_rows = 0 if df.empty else len(df)
            # Verificar si fecha y hora están combinadas
            fecha_hora_combinada = map_cliente_a_interno.get('Fecha') == map_cliente_a_interno.get('Hora')
            formato_fecha_hora = map_cliente_a_interno.get('formato_fecha_hora', 'DD/MM/YYYY HH:mm:ss')
            if fecha_hora_combinada:
                logger.info(f"[Task {task_id}] Fecha y hora combinadas detectadas. Formato: {formato_fecha_hora}")
                pandas_format = formato_fecha_hora.replace('DD', '%d').replace('MM', '%m').replace('YYYY', '%Y').replace('HH', '%H').replace('mm', '%M').replace('ss', '%S')
                columna_fecha_hora = map_cliente_a_interno['Fecha']
                def clean_datetime(dt_str):
                    if pd.isna(dt_str):
                        return None
                    try:
                        return pd.to_datetime(dt_str, format=pandas_format)
                    except:
                        try:
                            dt = pd.to_datetime(dt_str)
                            if dt.microsecond > 0:
                                dt = dt.replace(microsecond=0)
                            return dt
                        except:
                            logger.warning(f"[Task {task_id}] No se pudo parsear la fecha/hora: {dt_str}")
                            return None
                # --- PROGRESO POR LOTES EN PREPARACIÓN DE DATOS ---
                PREP_BATCH_SIZE = 1000
                for i in range(0, len(df), PREP_BATCH_SIZE):
                    batch = df.iloc[i:i+PREP_BATCH_SIZE]
                    df.loc[batch.index, 'Fecha'] = batch[columna_fecha_hora].apply(lambda x: clean_datetime(x).date() if clean_datetime(x) else None)
                    df.loc[batch.index, 'Hora'] = batch[columna_fecha_hora].apply(lambda x: clean_datetime(x).time() if clean_datetime(x) else None)
                    # Actualizar progreso
                    task_statuses[task_id]["progress"] = ((i + PREP_BATCH_SIZE) / len(df)) * 100 if len(df) else 100
                    task_statuses[task_id]["stage"] = "preparing_data"
                    task_statuses[task_id]["message"] = "Creando estructura de datos..."
                df = df.drop(columns=[columna_fecha_hora])
                del map_cliente_a_interno['formato_fecha_hora']
                map_interno_a_cliente = {v: k for k, v in map_cliente_a_interno.items()}
            # Si no hay fecha/hora combinadas, no hay bucle, pero igual actualizamos progreso a 100%
            else:
                task_statuses[task_id]["progress"] = 100
                task_statuses[task_id]["stage"] = "preparing_data"
                task_statuses[task_id]["message"] = "Creando estructura de datos..."
            # --- FIN PROGRESO PREPARACIÓN DE DATOS ---
        except json.JSONDecodeError as e:
            logger.error(f"[Task {task_id}] JSON inválido en mapeo: {e}", exc_info=True)
            raise ValueError(f"El mapeo de columnas no es un JSON válido: {e}")
        try:
            columnas_a_renombrar = {k: v for k, v in map_interno_a_cliente.items() if k in df.columns}
            df.rename(columns=columnas_a_renombrar, inplace=True)
        except Exception as e:
            logger.error(f"[Task {task_id}] Error aplicando mapeo: {e}", exc_info=True)
            raise ValueError(f"Error al aplicar mapeo de columnas: {e}")
        logger.info(f"[Task {task_id}] Validando columnas obligatorias para tipo: {tipo_archivo}")
        if tipo_archivo == 'LPR':
            columnas_obligatorias = ['Matricula', 'Fecha', 'Hora', 'ID_Lector']
        elif tipo_archivo == 'GPS':
            columnas_obligatorias = ['Matricula', 'Fecha', 'Hora']
        else:
            columnas_obligatorias = ['Matricula', 'Fecha', 'Hora']
        columnas_faltantes_detalle = []
        for campo in columnas_obligatorias:
            if campo not in df.columns:
                col_excel = map_cliente_a_interno.get(campo)
                columnas_faltantes_detalle.append(f"{campo} (mapeada desde '{col_excel}')" if col_excel else f"{campo} (no mapeada)")
        if columnas_faltantes_detalle:
            error_msg = f"Faltan columnas obligatorias o mapeos: {', '.join(columnas_faltantes_detalle)}"
            logger.error(f"[Task {task_id}] {error_msg}")
            raise ValueError(error_msg)
        logger.info(f"[Task {task_id}] Columnas obligatorias validadas.")
        logger.info(f"[Task {task_id}] Creando registro ArchivoExcel para {original_filename}")
        db_archivo = models.ArchivoExcel(
            ID_Caso=caso_id, Nombre_del_Archivo=original_filename,
            Tipo_de_Archivo=tipo_archivo
        )
        db.add(db_archivo); db.flush(); db.refresh(db_archivo)
        id_archivo_db = db_archivo.ID_Archivo
        logger.info(f"[Task {task_id}] ArchivoExcel ID: {id_archivo_db} creado.")
        logger.info(f"[Task {task_id}] Procesando {len(df)} filas para lecturas.")
        lecturas_insertadas_count = 0
        errores_filas = []
        lectores_no_hallados = set()
        lectores_creados_bg = set()
        duplicados_omitidos_bg = set()
        task_statuses[task_id]["total"] = len(df)
        BATCH_SIZE = 500
        # Actualizar a siguiente etapa
        task_statuses[task_id]["stage"] = "processing"
        task_statuses[task_id]["message"] = "Procesando registros..."
        for i in range(0, len(df), BATCH_SIZE):
            batch_df = df[i:i+BATCH_SIZE]
            batch_lecturas_obj = []
            for index, row in batch_df.iterrows():
                excel_row_num = index + 2 
                try:
                    matricula = str(row['Matricula']).strip() if pd.notna(row['Matricula']) else None
                    if not matricula: raise ValueError("Matrícula vacía")
                    def parse_excel_datetime_bg(date_val, time_val):
                        parsed_time = None
                        if isinstance(time_val, (datetime, time)): parsed_time = time_val.time() if isinstance(time_val, datetime) else time_val
                        elif isinstance(time_val, (int, float)) and not pd.isna(time_val):
                            total_seconds = int(time_val * 86400); hours = total_seconds // 3600
                            minutes = (total_seconds % 3600) // 60; seconds = total_seconds % 60
                            parsed_time = time(hours, minutes, seconds)
                        elif isinstance(time_val, str):
                            try: parsed_time = parser.parse(time_val.strip()).time()
                            except: 
                                for fmt_t in ("%H:%M:%S.%f", "%H:%M:%S", "%H:%M"):
                                    try: parsed_time = datetime.strptime(time_val.strip(), fmt_t).time(); break
                                    except: continue 
                        if not parsed_time: raise ValueError(f"Hora no reconocida: '{time_val}'")
                        parsed_date = None
                        if isinstance(date_val, datetime): parsed_date = date_val.date()
                        elif isinstance(date_val, date): parsed_date = date_val
                        elif isinstance(date_val, (int, float)) and not pd.isna(date_val): 
                            parsed_date = pd.to_datetime(date_val, unit='D', origin='1899-12-30').date()
                        elif isinstance(date_val, str):
                            try: parsed_date = parser.parse(date_val.strip()).date()
                            except: raise ValueError(f"Fecha no reconocida: '{date_val}'")
                        if not parsed_date: raise ValueError(f"Fecha no reconocida: '{date_val}'")
                        return datetime.combine(parsed_date, parsed_time)
                    
                    fecha_hora_final = parse_excel_datetime_bg(row['Fecha'], row['Hora'])
                    id_lector_val = None; coord_x = get_optional_float(row.get('Coordenada_X')); coord_y = get_optional_float(row.get('Coordenada_Y'))

                    if tipo_archivo == 'LPR':
                        id_lector_str = str(row['ID_Lector']).strip() if pd.notna(row['ID_Lector']) else None
                        if not id_lector_str: raise ValueError("Falta ID_Lector para LPR")
                        id_lector_val = id_lector_str
                        db_lector_existente = db.query(models.Lector).filter(models.Lector.ID_Lector == id_lector_val).first()
                        if not db_lector_existente:
                            if id_lector_val not in lectores_creados_bg and id_lector_val not in lectores_no_hallados:
                                db_lector_nuevo = models.Lector(ID_Lector=id_lector_val, Coordenada_X=coord_x, Coordenada_Y=coord_y)
                                db.add(db_lector_nuevo); lectores_creados_bg.add(id_lector_val)
                        else:
                            if coord_x is None: coord_x = db_lector_existente.Coordenada_X
                            if coord_y is None: coord_y = db_lector_existente.Coordenada_Y
                    
                    duplicado_existente = db.query(models.Lectura.ID_Lectura).join(models.ArchivoExcel)\
                        .filter(models.ArchivoExcel.ID_Caso == caso_id, models.Lectura.Matricula == matricula,
                                models.Lectura.Fecha_y_Hora == fecha_hora_final, models.Lectura.ID_Lector == id_lector_val).first()
                    if duplicado_existente:
                        duplicados_omitidos_bg.add(f"Fila Excel {excel_row_num}: {matricula}, {fecha_hora_final}, Lector: {id_lector_val}")
                        continue
                    
                    batch_lecturas_obj.append(models.Lectura(ID_Archivo=id_archivo_db, Matricula=matricula, Fecha_y_Hora=fecha_hora_final,
                        Carril=get_optional_str(row.get('Carril')), Velocidad=get_optional_float(row.get('Velocidad')),
                        ID_Lector=id_lector_val, Coordenada_X=coord_x, Coordenada_Y=coord_y, Tipo_Fuente=tipo_archivo))
                except ValueError as ve_row:
                    errores_filas.append(f"Fila Excel {excel_row_num}: {ve_row}")
                except Exception as e_row_inesperado:
                    errores_filas.append(f"Fila Excel {excel_row_num}: Error inesperado - {e_row_inesperado}")
            
            if batch_lecturas_obj:
                db.add_all(batch_lecturas_obj)
                lecturas_insertadas_count += len(batch_lecturas_obj)
            db.commit() # Commit por lote (lecturas y nuevos lectores del lote)
            task_statuses[task_id]["progress"] = (min(i + BATCH_SIZE, len(df)) / len(df)) * 100
            # Mantener stage y message en cada lote
            task_statuses[task_id]["stage"] = "processing"
            task_statuses[task_id]["message"] = "Procesando registros..."
            logger.info(f"[Task {task_id}] Lote procesado. Total insertado: {lecturas_insertadas_count}. Progreso: {task_statuses[task_id]['progress']:.2f}%")
        final_msg = f"Procesado. {lecturas_insertadas_count} lecturas importadas."
        if errores_filas: final_msg += f" {len(errores_filas)} filas con errores."
        if duplicados_omitidos_bg: final_msg += f" {len(duplicados_omitidos_bg)} duplicados omitidos."
        logger.info(f"[Task {task_id}] {final_msg}")
        result_data = schemas.UploadResponse(
            archivo=schemas.ArchivoExcel.model_validate(db_archivo, from_attributes=True),
            total_registros=lecturas_insertadas_count,
            errores=errores_filas if errores_filas else None,
            lectores_no_encontrados=list(lectores_no_hallados - lectores_creados_bg) if (lectores_no_hallados - lectores_creados_bg) else None,
            lecturas_duplicadas=list(duplicados_omitidos_bg) if duplicados_omitidos_bg else None,
            nuevos_lectores_creados=list(lectores_creados_bg) if lectores_creados_bg else None
        )
        task_statuses[task_id] = {
            **task_statuses.get(task_id, {}), "status": "completed", "message": final_msg,
            "progress": 100, "result": result_data.model_dump(), "stage": None
        }
        # --- Guardar archivo definitivo en uploads/CasoX/nombre_original ---
        caso_folder = UPLOADS_DIR / f"Caso{caso_id}"
        os.makedirs(caso_folder, exist_ok=True)
        final_file_path = caso_folder / original_filename
        try:
            shutil.copy(temp_file_path, final_file_path)
            logger.info(f"[Task {task_id}] Archivo definitivo guardado en: {final_file_path}")
        except Exception as e:
            logger.error(f"[Task {task_id}] Error al mover archivo a destino final: {e}", exc_info=True)
            raise ValueError(f"No se pudo guardar el archivo definitivo '{original_filename}' en la carpeta del caso.")
    except ValueError as ve_proc:
        logger.error(f"[Task {task_id}] Error de validación: {ve_proc}", exc_info=True)
        task_statuses[task_id] = {**task_statuses.get(task_id, {}), "status": "failed", "message": str(ve_proc), "stage": None}
        if 'id_archivo_db' in locals() and id_archivo_db:
            try: db.query(models.ArchivoExcel).filter(models.ArchivoExcel.ID_Archivo == id_archivo_db).delete(); db.commit()
            except: db.rollback()
    except Exception as e_critico:
        logger.error(f"[Task {task_id}] Error CRÍTICO: {e_critico}", exc_info=True)
        task_statuses[task_id] = {**task_statuses.get(task_id, {}), "status": "failed", "message": f"Error interno: {e_critico}", "stage": None}
        if 'id_archivo_db' in locals() and id_archivo_db:
            try: db.query(models.ArchivoExcel).filter(models.ArchivoExcel.ID_Archivo == id_archivo_db).delete(); db.commit()
            except: db.rollback()
    finally:
        if os.path.exists(temp_file_path):
            try: os.remove(temp_file_path); logger.info(f"[Task {task_id}] Archivo temporal {temp_file_path} eliminado.")
            except Exception as e_rm_temp: logger.error(f"[Task {task_id}] Fallo al eliminar {temp_file_path}: {e_rm_temp}")
        db.close()
    logger.info(f"[Task {task_id}] Procesamiento en segundo plano finalizado para {original_filename}.")

# --- END Background File Processing Function ---

# --- START JWT/OAuth2 Core Setup ---
# ... existing code ...

# --- Endpoint para Estadísticas Globales ---
@app.get("/api/estadisticas", response_model=schemas.EstadisticasGlobales, tags=["Estadísticas"])
def get_global_statistics(db: Session = Depends(get_db)):
    """
    Obtiene estadísticas globales del sistema (total casos, lecturas, vehículos, tamaño BD).
    """
    logger.info("GET /api/estadisticas - Solicitando estadísticas globales.")
    try:
        total_casos = db.query(models.Caso).count()
        total_lecturas = db.query(models.Lectura).count()
        total_vehiculos = db.query(models.Vehiculo).count()
        
        # Obtener tamaño del archivo de la base de datos usando la ruta real de SQLAlchemy
        db_path = DATABASE_URL.replace("sqlite:///", "")
        db_path = os.path.abspath(db_path)
        size_bytes = os.path.getsize(db_path) if os.path.exists(db_path) else 0
        
        # Formatear tamaño a un string legible (ej: KB, MB, GB)
        def format_bytes(bytes: int) -> str:
            if bytes == 0: return "0 Bytes"
            k = 1024
            sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
            i = math.floor(math.log(bytes, k))
            return f"{bytes / (k ** i):.2f} {sizes[i]}"
            
        tamanio_bd_formatted = format_bytes(size_bytes)
        
        logger.info(f"Estadísticas: Casos={total_casos}, Lecturas={total_lecturas}, Vehículos={total_vehiculos}, Tamaño BD={tamanio_bd_formatted}")
        
        return schemas.EstadisticasGlobales(
            total_casos=total_casos,
            total_lecturas=total_lecturas,
            total_vehiculos=total_vehiculos,
            tamanio_bd=tamanio_bd_formatted
        )
        
    except Exception as e:
        logger.error(f"Error al obtener estadísticas globales: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al obtener estadísticas: {e}")

# --- END Endpoint para Estadísticas Globales ---

# --- Endpoint para Archivos Recientes (Dashboard) ---
@app.get("/api/archivos/recientes", response_model=List[schemas.ArchivoExcel], tags=["Archivos"])
def get_recent_files(limit: int = 10, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_user)):
    """
    Obtiene una lista de los archivos importados más recientes a nivel global.
    """
    logger.info(f"GET /api/archivos/recientes - Solicitando los {limit} archivos más recientes por usuario {current_user.User}.")
    
    # Lógica para filtrar por grupo si el usuario no es superadmin
    user_rol = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol
    is_superadmin = user_rol == models.RolUsuarioEnum.superadmin.value

    try:
        # Subconsulta para contar lecturas por ID_Archivo
        subquery = select(
            models.Lectura.ID_Archivo,
            func.count(models.Lectura.ID_Lectura).label("total_lecturas")
        ).group_by(models.Lectura.ID_Archivo).subquery()

        # Consulta principal uniendo ArchivoExcel con la subconsulta de conteo
        query = db.query(
            models.ArchivoExcel,
            func.coalesce(subquery.c.total_lecturas, 0).label("num_registros")
        ).outerjoin(
            subquery, models.ArchivoExcel.ID_Archivo == subquery.c.ID_Archivo
        ).options(joinedload(models.ArchivoExcel.caso))
        
        if not is_superadmin:
            if current_user.ID_Grupo is None:
                logger.warning(f"Usuario {current_user.User} sin grupo intentó acceder a archivos recientes globales.")
                return [] # Devolver lista vacía si no tiene grupo y no es superadmin
                
            # Filtrar por archivos asociados a casos del grupo del usuario
            query = query.join(models.Caso).filter(models.Caso.ID_Grupo == current_user.ID_Grupo)

        # Ordenar por fecha de importación descendente y limitar
        archivos_recientes = query.order_by(models.ArchivoExcel.Fecha_de_Importacion.desc()).limit(limit).all()
        
        # Formatear la respuesta para que coincida con el schema
        respuesta = []
        for archivo_db, num_registros in archivos_recientes:
            archivo_schema = schemas.ArchivoExcel(
                ID_Archivo=archivo_db.ID_Archivo,
                ID_Caso=archivo_db.ID_Caso,
                Nombre_del_Archivo=archivo_db.Nombre_del_Archivo,
                Tipo_de_Archivo=archivo_db.Tipo_de_Archivo,
                Fecha_de_Importacion=archivo_db.Fecha_de_Importacion,
                Total_Registros=num_registros, # Asignar el conteo calculado
                caso=archivo_db.caso
            )
            respuesta.append(archivo_schema)
            
        logger.info(f"Encontrados {len(respuesta)} archivos recientes para el usuario {current_user.User}.")
        return respuesta
        
    except Exception as e:
        logger.error(f"Error al obtener archivos recientes: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error interno al obtener archivos recientes: {str(e)}"
        )

# --- END Endpoint para Archivos Recientes (Dashboard) ---

@app.get("/casos/{caso_id}/matriculas_gps", response_model=List[str])
def get_matriculas_gps_por_caso(caso_id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_user)):
    """
    Devuelve una lista de matrículas únicas (solo GPS) para el caso dado.
    """
    caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if not caso:
        raise HTTPException(status_code=404, detail="Caso no encontrado")
    user_rol_value = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol
    is_superadmin = user_rol_value == 'superadmin'
    if not is_superadmin and caso.ID_Grupo != current_user.ID_Grupo:
        raise HTTPException(status_code=403, detail="No tiene permiso para acceder a las matrículas de este caso")
    matriculas = db.query(models.Lectura.Matricula)\
        .join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
        .filter(models.ArchivoExcel.ID_Caso == caso_id)\
        .filter(models.Lectura.Tipo_Fuente == 'GPS')\
        .distinct()\
        .all()
    return [m[0] for m in matriculas if m[0]]

# --- ENDPOINTS ADMIN: USUARIOS Y GRUPOS ---
from sqlalchemy.orm import joinedload

@app.get("/api/usuarios", response_model=List[schemas.Usuario])
def get_usuarios(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_superadmin)):
    """Devuelve la lista de todos los usuarios (solo superadmin)."""
    usuarios = db.query(models.Usuario).options(joinedload(models.Usuario.grupo)).all()
    # Incluir el grupo en la respuesta si existe
    for u in usuarios:
        if u.ID_Grupo and not u.grupo:
            u.grupo = db.query(models.Grupo).filter(models.Grupo.ID_Grupo == u.ID_Grupo).first()
    return usuarios

@app.post("/api/usuarios", response_model=schemas.Usuario)
def create_usuario(usuario: schemas.UsuarioCreate, db: Session = Depends(get_db)):
    """Crea un nuevo usuario. Si no hay superadmin, permite crear uno sin autenticación."""
    # Verificar si ya existe un usuario con ese User
    db_usuario = db.query(models.Usuario).filter(models.Usuario.User == usuario.User).first()
    if db_usuario:
        raise HTTPException(status_code=400, detail="Ya existe un usuario con ese número de carné")
    
    # Verificar si es la primera vez (no hay superadmin)
    superadmin_count = db.query(models.Usuario).filter(models.Usuario.Rol == 'superadmin').count()
    is_first_time = superadmin_count == 0
    
    # Si no es primera vez, verificar que el usuario actual es superadmin
    if not is_first_time:
        try:
            current_user = get_current_active_superadmin(db)
        except HTTPException:
            raise HTTPException(status_code=403, detail="Solo los superadmin pueden crear usuarios")
    
    # Si es primera vez, solo permitir crear superadmin
    if is_first_time and usuario.Rol != 'superadmin':
        raise HTTPException(status_code=400, detail="En la primera configuración solo se puede crear un superadmin")
    
    # Si no es primera vez y el rol es superadmin, verificar que el usuario actual es superadmin
    if not is_first_time and usuario.Rol == 'superadmin':
        try:
            current_user = get_current_active_superadmin(db)
        except HTTPException:
            raise HTTPException(status_code=403, detail="Solo los superadmin pueden crear otros superadmin")
    
    # Verificar que el grupo existe si se especificó uno
    if usuario.ID_Grupo is not None:
        grupo = db.query(models.Grupo).filter(models.Grupo.ID_Grupo == usuario.ID_Grupo).first()
        if not grupo:
            raise HTTPException(status_code=400, detail="El grupo especificado no existe")
    
    # Crear el usuario
    db_usuario = models.Usuario(
        User=usuario.User,
        Contraseña=get_password_hash(usuario.Contraseña),
        Rol=usuario.Rol,
        ID_Grupo=usuario.ID_Grupo
    )
    db.add(db_usuario)
    db.commit()
    db.refresh(db_usuario)
    return db_usuario

@app.put("/api/usuarios/{user_id}", response_model=schemas.Usuario)
def update_usuario(user_id: str, usuario: schemas.UsuarioUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_superadmin)):
    """Actualiza un usuario existente (solo superadmin)."""
    # Verificar que el usuario existe
    db_usuario = db.query(models.Usuario).filter(models.Usuario.User == user_id).first()
    if not db_usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # No permitir cambiar el rol de superadmin si es el último
    if db_usuario.Rol == 'superadmin' and usuario.Rol != 'superadmin':
        superadmin_count = db.query(models.Usuario).filter(models.Usuario.Rol == 'superadmin').count()
        if superadmin_count <= 1:
            raise HTTPException(status_code=400, detail="No se puede cambiar el rol del último superadmin")
    
    # Verificar que el grupo existe si se especifica
    if usuario.ID_Grupo is not None:
        grupo = db.query(models.Grupo).filter(models.Grupo.ID_Grupo == usuario.ID_Grupo).first()
        if not grupo:
            raise HTTPException(status_code=400, detail="El grupo especificado no existe")
    
    # Actualizar los campos
    update_data = usuario.model_dump(exclude_unset=True)
    if "Contraseña" in update_data:
        update_data["Contraseña"] = get_password_hash(update_data["Contraseña"])
    for key, value in update_data.items():
        setattr(db_usuario, key, value)
    
    db.commit()
    db.refresh(db_usuario)
    return db_usuario

@app.delete("/api/usuarios/{user_id}", status_code=204)
def delete_usuario(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_superadmin)
):
    """Elimina un usuario (solo superadmin)."""
    db_usuario = db.query(models.Usuario).filter(models.Usuario.User == user_id).first()
    if not db_usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # No permitir eliminar el último superadmin
    if db_usuario.Rol == 'superadmin':
        superadmin_count = db.query(models.Usuario).filter(models.Usuario.Rol == 'superadmin').count()
        if superadmin_count <= 1:
            raise HTTPException(status_code=400, detail="No se puede eliminar el último superadmin")
    
    db.delete(db_usuario)
    db.commit()
    return None

@app.get("/api/grupos", response_model=List[schemas.Grupo])
def get_grupos(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_superadmin)):
    """Devuelve la lista de todos los grupos (solo superadmin), incluyendo el número de casos asociados en el campo 'casos'."""
    grupos = db.query(models.Grupo).all()
    # Para cada grupo, contar los casos asociados
    grupos_con_casos = []
    for grupo in grupos:
        num_casos = db.query(models.Caso).filter(models.Caso.ID_Grupo == grupo.ID_Grupo).count()
        grupo_dict = grupo.__dict__.copy()
        grupo_dict['casos'] = num_casos
        grupos_con_casos.append(grupo_dict)
    return grupos_con_casos

@app.post("/api/grupos", response_model=schemas.Grupo)
def create_grupo(grupo: schemas.GrupoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_superadmin)):
    """Crea un nuevo grupo (solo superadmin)."""
    # Verificar si ya existe un grupo con ese nombre
    if db.query(models.Grupo).filter(models.Grupo.Nombre == grupo.Nombre).first():
        raise HTTPException(status_code=400, detail="Ya existe un grupo con ese nombre")
    
    # Crear el grupo
    db_grupo = models.Grupo(
        Nombre=grupo.Nombre,
        Descripcion=grupo.Descripcion,
        Fecha_Creacion=datetime.now()
    )
    db.add(db_grupo)
    db.commit()
    db.refresh(db_grupo)
    return db_grupo

@app.put("/api/grupos/{grupo_id}", response_model=schemas.Grupo)
def update_grupo(grupo_id: int, grupo: schemas.GrupoUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_superadmin)):
    """Actualiza un grupo existente (solo superadmin)."""
    # Verificar que el grupo existe
    db_grupo = db.query(models.Grupo).filter(models.Grupo.ID_Grupo == grupo_id).first()
    if not db_grupo:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    
    # Verificar si ya existe otro grupo con ese nombre
    if grupo.Nombre and grupo.Nombre != db_grupo.Nombre:
        if db.query(models.Grupo).filter(models.Grupo.Nombre == grupo.Nombre).first():
            raise HTTPException(status_code=400, detail="Ya existe un grupo con ese nombre")
    
    # Actualizar los campos
    update_data = grupo.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_grupo, key, value)
    
    db.commit()
    db.refresh(db_grupo)
    return db_grupo

@app.delete("/api/grupos/{grupo_id}")
def delete_grupo(grupo_id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_superadmin)):
    """Elimina un grupo existente (solo superadmin)."""
    # Verificar que el grupo existe
    db_grupo = db.query(models.Grupo).filter(models.Grupo.ID_Grupo == grupo_id).first()
    if not db_grupo:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    
    # Verificar si hay casos asociados al grupo
    casos_count = db.query(models.Caso).filter(models.Caso.ID_Grupo == grupo_id).count()
    if casos_count > 0:
        raise HTTPException(status_code=400, detail="No se puede eliminar un grupo que tiene casos asociados")
    
    # Verificar si hay usuarios asociados al grupo
    usuarios_count = db.query(models.Usuario).filter(models.Usuario.ID_Grupo == grupo_id).count()
    if usuarios_count > 0:
        raise HTTPException(status_code=400, detail="No se puede eliminar un grupo que tiene usuarios asociados")
    
    # Eliminar el grupo
    db.delete(db_grupo)
    db.commit()
    return {"message": "Grupo eliminado correctamente"}

@app.get("/api/admin/database/status")
def get_database_status(db: Session = Depends(get_db)):
    """Obtiene el estado actual de la base de datos y verifica si se necesita crear un superadmin."""
    try:
        # Verificar si existe algún superadmin
        superadmin_count = db.query(models.Usuario).filter(models.Usuario.Rol == 'superadmin').count()
        needs_superadmin_setup = superadmin_count == 0
        
        # Obtener información de las tablas
        tables = []
        for table in Base.metadata.tables:
            count = db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            tables.append({
                "name": table,
                "count": count
            })
        
        # Obtener tamaño del archivo de la base de datos usando la ruta real de SQLAlchemy
        db_path = DATABASE_URL.replace("sqlite:///", "")
        db_path = os.path.abspath(db_path)
        size_bytes = os.path.getsize(db_path) if os.path.exists(db_path) else 0
        
        return {
            "status": "active",
            "tables": tables,
            "size_bytes": size_bytes,
            "needs_superadmin_setup": needs_superadmin_setup
        }
    except Exception as e:
        logger.error(f"Error al obtener el estado de la base de datos: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/usuarios/{user_id}")
def delete_usuario(user_id: str, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_superadmin)):
    """Elimina un usuario existente (solo superadmin)."""
    # Verificar que el usuario existe
    db_usuario = db.query(models.Usuario).filter(models.Usuario.User == user_id).first()
    if not db_usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # No permitir eliminar el último superadmin
    if db_usuario.Rol == 'superadmin':
        superadmin_count = db.query(models.Usuario).filter(models.Usuario.Rol == 'superadmin').count()
        if superadmin_count <= 1:
            raise HTTPException(status_code=400, detail="No se puede eliminar el último superadmin")
    
    # Eliminar el usuario
    db.delete(db_usuario)
    db.commit()
    return {"message": "Usuario eliminado correctamente"}

# --- Endpoint para crear un nuevo usuario ---
@app.post("/api/usuarios", response_model=schemas.Usuario)
async def create_usuario(
    usuario: schemas.UsuarioCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_user)
):
    try:
        # Verificar si ya existe un usuario con el mismo username
        if db.query(models.Usuario).filter(models.Usuario.Username == usuario.Username).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ya existe un usuario con ese nombre de usuario"
            )

        # Contar cuántos superadmins hay
        superadmin_count = db.query(models.Usuario).filter(models.Usuario.Rol == "superadmin").count()
        
        # Si es el primer usuario, solo permitir crear superadmin
        if superadmin_count == 0:
            if usuario.Rol != "superadmin":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="El primer usuario debe ser un superadmin"
                )
        else:
            # Si no es el primer usuario, verificar que el usuario actual es superadmin
            if current_user.Rol != "superadmin":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Solo los superadmins pueden crear usuarios"
                )
            
            # Si se intenta crear un superadmin, verificar que el usuario actual es superadmin
            if usuario.Rol == "superadmin" and current_user.Rol != "superadmin":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Solo los superadmins pueden crear otros superadmins"
                )

        # Verificar que el grupo existe si se especificó uno
        if usuario.ID_Grupo:
            grupo = db.query(models.Grupo).filter(models.Grupo.ID_Grupo == usuario.ID_Grupo).first()
            if not grupo:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"El grupo con ID {usuario.ID_Grupo} no existe"
                )

        # Crear el usuario
        db_usuario = models.Usuario(
            Username=usuario.Username,
            Password=get_password_hash(usuario.Password),  # La contraseña ya está hasheada en el modelo
            Nombre=usuario.Nombre,
            Apellido=usuario.Apellido,
            Email=usuario.Email,
            Rol=usuario.Rol,
            ID_Grupo=usuario.ID_Grupo
        )
        db.add(db_usuario)
        db.commit()
        db.refresh(db_usuario)
        return db_usuario

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error al crear usuario")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al crear el usuario"
        )

# --- Endpoint para actualizar un usuario existente ---
@app.put("/api/usuarios/{user_id}", response_model=schemas.Usuario)
async def update_usuario(
    user_id: int,
    usuario: schemas.UsuarioUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_user)
):
    try:
        # Verificar que el usuario existe
        db_usuario = db.query(models.Usuario).filter(models.Usuario.ID_Usuario == user_id).first()
        if not db_usuario:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado"
            )

        # Verificar que el usuario actual es superadmin
        if current_user.Rol != "superadmin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo los superadmins pueden actualizar usuarios"
            )

        # Si se intenta cambiar el rol de un superadmin, verificar que no sea el último
        if usuario.Rol and usuario.Rol != db_usuario.Rol and db_usuario.Rol == "superadmin":
            superadmin_count = db.query(models.Usuario).filter(models.Usuario.Rol == "superadmin").count()
            if superadmin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No se puede cambiar el rol del último superadmin"
                )

        # Verificar que el grupo existe si se especificó uno
        if usuario.ID_Grupo:
            grupo = db.query(models.Grupo).filter(models.Grupo.ID_Grupo == usuario.ID_Grupo).first()
            if not grupo:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"El grupo con ID {usuario.ID_Grupo} no existe"
                )

        # Actualizar los campos del usuario
        for field, value in usuario.dict(exclude_unset=True).items():
            setattr(db_usuario, field, value)

        db.commit()
        db.refresh(db_usuario)
        return db_usuario

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error al actualizar usuario")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al actualizar el usuario"
        )

# --- Endpoint para eliminar un usuario ---
@app.delete("/api/usuarios/{user_id}")
async def delete_usuario(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_user)
):
    try:
        # Verificar que el usuario existe
        db_usuario = db.query(models.Usuario).filter(models.Usuario.ID_Usuario == user_id).first()
        if not db_usuario:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado"
            )

        # Verificar que el usuario actual es superadmin
        if current_user.Rol != "superadmin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo los superadmins pueden eliminar usuarios"
            )

        # No permitir eliminar el último superadmin
        if db_usuario.Rol == "superadmin":
            superadmin_count = db.query(models.Usuario).filter(models.Usuario.Rol == "superadmin").count()
            if superadmin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No se puede eliminar el último superadmin"
                )

        # Eliminar el usuario
        db.delete(db_usuario)
        db.commit()
        return {"message": "Usuario eliminado correctamente"}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error al eliminar usuario")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al eliminar el usuario"
        )

# --- Endpoint para crear un nuevo grupo ---
@app.post("/api/grupos", response_model=schemas.Grupo)
async def create_grupo(
    grupo: schemas.GrupoCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_user)
):
    try:
        # Verificar que el usuario actual es superadmin
        if current_user.Rol != "superadmin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo los superadmins pueden crear grupos"
            )

        # Verificar si ya existe un grupo con el mismo nombre
        if db.query(models.Grupo).filter(models.Grupo.Nombre == grupo.Nombre).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ya existe un grupo con ese nombre"
            )

        # Crear el grupo
        db_grupo = models.Grupo(
            Nombre=grupo.Nombre,
            Descripcion=grupo.Descripcion,
            Fecha_Creacion=datetime.now()
        )
        db.add(db_grupo)
        db.commit()
        db.refresh(db_grupo)
        return db_grupo

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error al crear grupo")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al crear el grupo"
        )

# --- Endpoint para actualizar un grupo existente ---
@app.put("/api/grupos/{grupo_id}", response_model=schemas.Grupo)
async def update_grupo(
    grupo_id: int,
    grupo: schemas.GrupoUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_user)
):
    try:
        # Verificar que el usuario actual es superadmin
        if current_user.Rol != "superadmin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo los superadmins pueden actualizar grupos"
            )

        # Verificar que el grupo existe
        db_grupo = db.query(models.Grupo).filter(models.Grupo.ID_Grupo == grupo_id).first()
        if not db_grupo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Grupo no encontrado"
            )

        # Si se intenta cambiar el nombre, verificar que no exista otro grupo con ese nombre
        if grupo.Nombre and grupo.Nombre != db_grupo.Nombre:
            if db.query(models.Grupo).filter(models.Grupo.Nombre == grupo.Nombre).first():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Ya existe un grupo con ese nombre"
                )

        # Actualizar los campos del grupo
        for field, value in grupo.dict(exclude_unset=True).items():
            setattr(db_grupo, field, value)

        db.commit()
        db.refresh(db_grupo)
        return db_grupo

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error al actualizar grupo")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al actualizar el grupo"
        )

# --- Endpoint para eliminar un grupo ---
@app.delete("/api/grupos/{grupo_id}")
async def delete_grupo(
    grupo_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_user)
):
    try:
        # Verificar que el usuario actual es superadmin
        if current_user.Rol != "superadmin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo los superadmins pueden eliminar grupos"
            )

        # Verificar que el grupo existe
        db_grupo = db.query(models.Grupo).filter(models.Grupo.ID_Grupo == grupo_id).first()
        if not db_grupo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Grupo no encontrado"
            )

        # Verificar que el grupo no tiene casos asociados
        casos_count = db.query(models.Caso).filter(models.Caso.ID_Grupo == grupo_id).count()
        if casos_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se puede eliminar un grupo que tiene casos asociados"
            )

        # Verificar que el grupo no tiene usuarios asociados
        usuarios_count = db.query(models.Usuario).filter(models.Usuario.ID_Grupo == grupo_id).count()
        if usuarios_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se puede eliminar un grupo que tiene usuarios asociados"
            )

        # Eliminar el grupo
        db.delete(db_grupo)
        db.commit()
        return {"message": "Grupo eliminado correctamente"}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error al eliminar grupo")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al eliminar el grupo"
        )

@app.post("/lecturas/por_filtros", response_model=List[schemas.Lectura])
def read_lecturas_por_filtros(
    # Filtros de Fecha/Hora
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    hora_inicio: Optional[str] = None, 
    hora_fin: Optional[str] = None, 
    # Filtros de Identificadores (Listas)
    lector_ids: Optional[List[str]] = Query(None), 
    caso_ids: Optional[List[int]] = Query(None), 
    carretera_ids: Optional[List[str]] = Query(None),
    sentido: Optional[List[str]] = Query(None),
    matricula: Optional[str] = Body(None),
    matriculas: Optional[List[str]] = Body(None),
    tipo_fuente: Optional[str] = Query(None),
    solo_relevantes: Optional[bool] = False,
    min_pasos: Optional[int] = None,
    max_pasos: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_user)
):
    logger.info(f"POST /lecturas/por_filtros - Filtros: matricula={matricula} matriculas={matriculas} min_pasos={min_pasos} max_pasos={max_pasos} carreteras={carretera_ids}")
    
    # Base query
    base_query = db.query(models.Lectura).join(models.Lector).join(models.ArchivoExcel)
    
    # --- Aplicar filtros comunes ---
    if caso_ids:
        base_query = base_query.filter(models.ArchivoExcel.ID_Caso.in_(caso_ids))
    if lector_ids:
        base_query = base_query.filter(models.Lectura.ID_Lector.in_(lector_ids))
    if carretera_ids:
        base_query = base_query.filter(models.Lector.Carretera.in_(carretera_ids))
    if sentido:
        base_query = base_query.filter(models.Lector.Sentido.in_(sentido))
    if tipo_fuente:
        base_query = base_query.filter(models.Lectura.Tipo_Fuente == tipo_fuente)
    if solo_relevantes:
        base_query = base_query.join(models.LecturaRelevante)
    
    # Filtros de fecha y hora
    try:
        if fecha_inicio:
            fecha_inicio_dt = datetime.strptime(fecha_inicio, "%Y-%m-%d").date()
            base_query = base_query.filter(models.Lectura.Fecha_y_Hora >= fecha_inicio_dt)
        if fecha_fin:
            fecha_fin_dt = datetime.strptime(fecha_fin, "%Y-%m-%d").date() + timedelta(days=1)
            base_query = base_query.filter(models.Lectura.Fecha_y_Hora < fecha_fin_dt)
        if hora_inicio:
            hora_inicio_time = datetime.strptime(hora_inicio, "%H:%M").time()
            base_query = base_query.filter(extract('hour', models.Lectura.Fecha_y_Hora) * 100 + extract('minute', models.Lectura.Fecha_y_Hora) >= hora_inicio_time.hour * 100 + hora_inicio_time.minute)
        if hora_fin:
            hora_fin_time = datetime.strptime(hora_fin, "%H:%M").time()
            base_query = base_query.filter(extract('hour', models.Lectura.Fecha_y_Hora) * 100 + extract('minute', models.Lectura.Fecha_y_Hora) <= hora_fin_time.hour * 100 + hora_fin_time.minute)
    except ValueError:
        logger.warning("Formato de fecha/hora inválido recibido.")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de fecha/hora inválido.")

    # Filtro por matrícula (string o lista)
    from sqlalchemy import or_
    condiciones = []
    if matricula:
        sql_pattern = matricula.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_').replace('?', '_').replace('*', '%')
        if '*' in matricula or '%' in matricula or '?' in matricula or '_' in matricula:
            condiciones.append(models.Lectura.Matricula.ilike(sql_pattern))
        else:
            condiciones.append(models.Lectura.Matricula == matricula)
    if matriculas:
        for m in matriculas:
            sql_pattern = m.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_').replace('?', '_').replace('*', '%')
            if '*' in m or '%' in m or '?' in m or '_' in m:
                condiciones.append(models.Lectura.Matricula.ilike(sql_pattern))
            else:
                condiciones.append(models.Lectura.Matricula == m)
    if condiciones:
        base_query = base_query.filter(or_(*condiciones))

    # Ordenar y aplicar paginación
    query = base_query.order_by(models.Lectura.Fecha_y_Hora.desc())
    query = query.options(joinedload(models.Lectura.lector), joinedload(models.Lectura.archivo).joinedload(models.ArchivoExcel.caso))
    lecturas = query.all()

    logger.info(f"POST /lecturas/por_filtros - Encontradas {len(lecturas)} lecturas tras aplicar filtros.")
    return lecturas

@app.post("/busqueda/multicaso", response_model=List[Dict[str, Any]], tags=["Búsqueda"])
def buscar_vehiculos_multicaso(
    casos: List[int] = Body(...),
    matricula: Optional[str] = Body(None),
    matriculas: Optional[List[str]] = Body(None),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_user)
):
    logger.info(f"POST /busqueda/multicaso - Buscando vehículos en casos: {casos}")
    
    # Base query para obtener lecturas, cargando archivo y caso
    base_query = db.query(models.Lectura).join(models.ArchivoExcel).filter(
        models.ArchivoExcel.ID_Caso.in_(casos)
    ).options(
        joinedload(models.Lectura.archivo).joinedload(models.ArchivoExcel.caso)
    )

    # Aplicar filtros de matrícula
    from sqlalchemy import or_
    condiciones = []
    if matricula:
        sql_pattern = matricula.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_').replace('?', '_').replace('*', '%')
        if '*' in matricula or '%' in matricula or '?' in matricula or '_' in matricula:
            condiciones.append(models.Lectura.Matricula.ilike(sql_pattern))
        else:
            condiciones.append(models.Lectura.Matricula == matricula)
    if matriculas:
        for m in matriculas:
            sql_pattern = m.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_').replace('?', '_').replace('*', '%')
            if '*' in m or '%' in m or '?' in m or '_' in m:
                condiciones.append(models.Lectura.Matricula.ilike(sql_pattern))
            else:
                condiciones.append(models.Lectura.Matricula == m)
    if condiciones:
        base_query = base_query.filter(or_(*condiciones))

    lecturas = base_query.all()

    # Agrupar por matrícula y caso
    resultados = defaultdict(lambda: defaultdict(list))
    for lectura in lecturas:
        resultados[lectura.Matricula][lectura.archivo.ID_Caso].append(lectura)

    vehiculos_coincidentes = []
    for matricula, casos_lecturas in resultados.items():
        if len(casos_lecturas) < 2:
            continue  # Solo incluir vehículos que aparecen en 2 o más casos
        vehiculo_info = {
            "matricula": matricula,
            "casos": []
        }
        for caso_id, lecturas_caso in casos_lecturas.items():
            caso = lecturas_caso[0].archivo.caso
            caso_info = {
                "id": caso.ID_Caso,
                "nombre": caso.Nombre_del_Caso + f" ({caso.Año})",
                "lecturas": [
                    {
                        "ID_Lectura": l.ID_Lectura,
                        "Matricula": l.Matricula,
                        "Fecha_y_Hora": l.Fecha_y_Hora.isoformat(),
                        "ID_Caso": caso.ID_Caso,
                        "Nombre_del_Caso": caso.Nombre_del_Caso,
                        "ID_Lector": l.ID_Lector,
                        "Carretera": getattr(l.lector, 'Carretera', ''),
                        "Provincia": getattr(l.lector, 'Provincia', ''),
                        "Localidad": getattr(l.lector, 'Localidad', ''),
                        "Coordenada_X": getattr(l.lector, 'Coordenada_X', ''),
                        "Coordenada_Y": getattr(l.lector, 'Coordenada_Y', '')
                    }
                    for l in lecturas_caso
                ]
            }
            vehiculo_info["casos"].append(caso_info)
        vehiculos_coincidentes.append(vehiculo_info)

    return vehiculos_coincidentes

from collections import defaultdict
from datetime import datetime, timedelta
from fastapi import HTTPException, status

@app.post("/casos/{caso_id}/detectar-lanzaderas", response_model=schemas.LanzaderaResponse)
def detectar_vehiculos_lanzadera(
    caso_id: int,
    request: schemas.LanzaderaRequest,  # Debe incluir: matricula, ventana_minutos, diferencia_minima_lecturas_min, min_coincidencias (opcional), fecha_inicio/fin opcionales
    db: Session = Depends(get_db)
):
    logger.info(f"[Lanzadera] Params: matricula={request.matricula}, fecha_inicio={getattr(request, 'fecha_inicio', None)}, fecha_fin={getattr(request, 'fecha_fin', None)}, ventana_minutos={getattr(request, 'ventana_minutos', 5)}, diferencia_minima_lecturas_min={getattr(request, 'diferencia_minima_lecturas_min', 1)}, min_coincidencias={getattr(request, 'min_coincidencias', 2)}")
    # 1. Obtener todas las lecturas del vehículo objetivo en el rango de fechas (si se especifican)
    query = db.query(models.Lectura).filter(
        models.Lectura.ID_Archivo.in_(
            db.query(models.ArchivoExcel.ID_Archivo)
            .filter(models.ArchivoExcel.ID_Caso == caso_id)
        ),
        models.Lectura.Matricula == request.matricula
    )
    if getattr(request, 'fecha_inicio', None):
        query = query.filter(models.Lectura.Fecha_y_Hora >= request.fecha_inicio)
    if getattr(request, 'fecha_fin', None):
        fecha_fin_val = request.fecha_fin
        if isinstance(fecha_fin_val, str):
            fecha_fin_dt = datetime.strptime(fecha_fin_val, "%Y-%m-%d")
            fecha_fin_dt = datetime.combine(fecha_fin_dt, datetime.max.time())
        else:
            fecha_fin_dt = fecha_fin_val
        query = query.filter(models.Lectura.Fecha_y_Hora <= fecha_fin_dt)
    lecturas_objetivo = query.order_by(models.Lectura.Fecha_y_Hora).all()
    logger.info(f"[Lanzadera] Lecturas objetivo encontradas: {len(lecturas_objetivo)}")
    if not lecturas_objetivo:
        logger.info("[Lanzadera] No se encontraron lecturas objetivo.")
        return schemas.LanzaderaResponse(vehiculos_lanzadera=[], detalles=[])

    # 2. Para cada lectura del objetivo, buscar vehículos acompañantes
    vehiculos_acompanantes = defaultdict(lambda: defaultdict(list))  # {matricula: {fecha: [(hora, lector), ...]}}
    
    for lectura_objetivo in lecturas_objetivo:
        # Calcular ventana temporal
        ventana_inicio = lectura_objetivo.Fecha_y_Hora - timedelta(minutes=request.ventana_minutos)
        ventana_fin = lectura_objetivo.Fecha_y_Hora + timedelta(minutes=request.ventana_minutos)
        
        # Buscar lecturas en la misma ventana temporal y lector
        lecturas_acompanantes = db.query(models.Lectura).filter(
            models.Lectura.ID_Archivo.in_(
                db.query(models.ArchivoExcel.ID_Archivo)
                .filter(models.ArchivoExcel.ID_Caso == caso_id)
            ),
            models.Lectura.ID_Lector == lectura_objetivo.ID_Lector,
            models.Lectura.Fecha_y_Hora >= ventana_inicio,
            models.Lectura.Fecha_y_Hora <= ventana_fin,
            models.Lectura.Matricula != request.matricula
        ).all()
        
        # Registrar las coincidencias
        for lectura in lecturas_acompanantes:
            fecha = lectura.Fecha_y_Hora.date().isoformat()
            hora = lectura.Fecha_y_Hora.time().strftime("%H:%M")
            vehiculos_acompanantes[lectura.Matricula][fecha].append((hora, lectura.ID_Lector))

    # 3. Analizar los vehículos acompañantes según los criterios
    vehiculos_lanzadera = []
    detalles = []

    # Añadir lecturas del objetivo al array detalles
    for lectura in lecturas_objetivo:
        detalles.append(schemas.LanzaderaDetalle(
            matricula=lectura.Matricula,
            fecha=lectura.Fecha_y_Hora.date().isoformat(),
            hora=lectura.Fecha_y_Hora.time().strftime("%H:%M:%S"),
            lector=lectura.ID_Lector,
            tipo="Objetivo"
        ))
    
    for matricula, coincidencias_por_dia in vehiculos_acompanantes.items():
        # Verificar criterio 1: Al menos 2 días distintos
        dias_distintos = len(coincidencias_por_dia)
        
        # Verificar criterio 2: Más de 2 lectores distintos el mismo día con lecturas distanciadas en el tiempo
        cumple_criterio_2 = False
        for fecha, lecturas in coincidencias_por_dia.items():
            if len(set(lector for _, lector in lecturas)) > 2:
                # Verificar que las lecturas estén distanciadas en el tiempo
                horas = []
                for hora_str, _ in lecturas:
                    try:
                        horas.append(datetime.strptime(hora_str, "%H:%M"))
                    except Exception as e:
                        logger.warning(f"Hora inválida '{hora_str}' para matrícula {matricula} en fecha {fecha}: {e}")
                        continue
                if any(abs((h2 - h1).total_seconds() / 60) >= request.diferencia_minima_lecturas_min 
                      for i, h1 in enumerate(horas) 
                      for h2 in horas[i+1:]):
                    cumple_criterio_2 = True
                    break
        
        # Si cumple alguno de los criterios, es un vehículo lanzadera
        if dias_distintos >= 2 or cumple_criterio_2:
            vehiculos_lanzadera.append(matricula)
            # Agregar todos los detalles de las coincidencias
            for fecha, lecturas in coincidencias_por_dia.items():
                for hora, lector in lecturas:
                    detalles.append(schemas.LanzaderaDetalle(
                        matricula=matricula,
                        fecha=fecha,
                        hora=hora if len(hora) == 8 else (hora+':00' if len(hora)==5 else hora),
                        lector=lector,
                        tipo="Lanzadera"
                    ))

    # Ordenar detalles cronológicamente
    detalles.sort(key=lambda d: (d.fecha, d.hora, d.matricula))
    return schemas.LanzaderaResponse(
        vehiculos_lanzadera=vehiculos_lanzadera,
        detalles=detalles
    )

@app.post("/casos/{caso_id}/saved_searches", response_model=schemas.SavedSearch, status_code=status.HTTP_201_CREATED)
def create_saved_search(caso_id: int, saved_search_data: schemas.SavedSearchCreate, db: Session = Depends(get_db)):
    logger.info(f"POST /casos/{caso_id}/saved_searches con datos: {saved_search_data.name}")
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if not db_caso:
        logger.warning(f"[Create SavedSearch] Caso con ID {caso_id} no encontrado.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado")

    # Crear la instancia del modelo
    db_saved_search = models.SavedSearch(
        caso_id=caso_id,
        name=saved_search_data.name,
        filters=saved_search_data.filters,
        results=saved_search_data.results
    )

    try:
        db.add(db_saved_search)
        db.commit()
        db.refresh(db_saved_search)
        logger.info(f"Búsqueda guardada exitosamente con ID: {db_saved_search.id}")
        return db_saved_search
    except Exception as e:
        db.rollback()
        logger.error(f"Error al guardar SavedSearch en BD: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno al guardar la búsqueda.")

@app.get("/api/casos/{caso_id}/size")
def get_caso_size(caso_id: int, db: Session = Depends(get_db)):
    import os
    try:
        archivos = db.query(models.ArchivoExcel).filter(models.ArchivoExcel.ID_Caso == caso_id).all()
        caso_folder = os.path.join(os.path.dirname(__file__), 'uploads', f'Caso{caso_id}')
        total_size = 0
        for archivo in archivos:
            if archivo.Nombre_del_Archivo:
                ruta = os.path.join(caso_folder, archivo.Nombre_del_Archivo)
                if os.path.exists(ruta):
                    total_size += os.path.getsize(ruta)
        size_mb = round(total_size / (1024 * 1024), 2)
        return {"size_mb": size_mb}
    except Exception as e:
        logger.error(f"Error al obtener el tamaño del caso {caso_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@app.get("/api/tasks/{task_id}/status", response_model=TaskStatus)
async def get_task_status(task_id: str):
    """
    Obtiene el estado actual de una tarea en segundo plano.
    """
    status_info = task_statuses.get(task_id)
    if not status_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No se encontró información para la tarea {task_id}"
        )
    return TaskStatus(**status_info)

# Mejorar el logging de tareas
def update_task_status(task_id: str, status: str, message: str, progress: float = None, total: int = None, result: Dict = None):
    """
    Actualiza el estado de una tarea con logging mejorado.
    """
    current_status = task_statuses.get(task_id, {})
    new_status = {
        **current_status,
        "status": status,
        "message": message,
    }
    if progress is not None:
        new_status["progress"] = progress
    if total is not None:
        new_status["total"] = total
    if result is not None:
        new_status["result"] = result
    
    task_statuses[task_id] = new_status
    logger.info(f"[Task {task_id}] Status updated: {status} - {message} - Progress: {progress}%")

# --- NUEVO ENDPOINT DE DESCARGA ROBUSTO ---
from fastapi import APIRouter
from fastapi.responses import FileResponse

@app.get("/api/archivos/{id_archivo}/download")
async def descargar_archivo(id_archivo: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_user)):
    import os
    if current_user is None:
        logger.warning(f"[DESCARGA NUEVA] Intento de descarga no autenticado para archivo ID: {id_archivo}")
        raise HTTPException(status_code=401, detail="No autenticado para descargar archivos.")
    logger.info(f"[DESCARGA NUEVA] Solicitud para archivo ID: {id_archivo} por usuario {current_user.User}")
    archivo_db = db.query(models.ArchivoExcel).filter(models.ArchivoExcel.ID_Archivo == id_archivo).first()
    if not archivo_db:
        logger.error(f"[DESCARGA NUEVA] Archivo ID {id_archivo} no encontrado en BD.")
        raise HTTPException(status_code=404, detail="Archivo no encontrado en base de datos.")
    caso_id = archivo_db.ID_Caso
    nombre_archivo = archivo_db.Nombre_del_Archivo
    if not caso_id or not nombre_archivo:
        logger.error(f"[DESCARGA NUEVA] Archivo ID {id_archivo} sin caso o sin nombre.")
        raise HTTPException(status_code=500, detail="Archivo sin caso o sin nombre en BD.")
    carpeta_caso = UPLOADS_DIR / f"Caso{caso_id}"
    ruta_archivo = carpeta_caso / nombre_archivo
    logger.info(f"[DESCARGA NUEVA] Buscando en: {ruta_archivo}")
    try:
        archivos_en_carpeta = os.listdir(carpeta_caso)
        logger.info(f"[DESCARGA NUEVA] Archivos en carpeta: {archivos_en_carpeta}")
    except Exception as e:
        logger.error(f"[DESCARGA NUEVA] Error listando carpeta: {e}")
    if not os.path.isfile(ruta_archivo):
        logger.error(f"[DESCARGA NUEVA] Archivo físico NO encontrado: {ruta_archivo}")
        raise HTTPException(status_code=404, detail="Archivo físico no encontrado en servidor.")
    logger.info(f"[DESCARGA NUEVA] Archivo encontrado y listo para descargar: {ruta_archivo}")
    # Detectar tipo MIME
    media_type = 'application/octet-stream'
    if nombre_archivo.lower().endswith(('.xlsx', '.xls')):
        media_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    elif nombre_archivo.lower().endswith('.csv'):
        media_type = 'text/csv'
    return FileResponse(path=ruta_archivo, filename=nombre_archivo, media_type=media_type)

@app.get("/casos/{caso_id}/lecturas_relevantes", response_model=List[schemas.Lectura])
def get_lecturas_relevantes_por_caso(caso_id: int, db: Session = Depends(get_db)):
    """
    Devuelve todas las lecturas marcadas como relevantes para un caso específico.
    """
    try:
        lecturas_relevantes = db.query(models.Lectura)\
            .options(joinedload(models.Lectura.lector), joinedload(models.Lectura.relevancia))\
            .join(models.LecturaRelevante, models.Lectura.ID_Lectura == models.LecturaRelevante.ID_Lectura)\
            .join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
            .filter(models.ArchivoExcel.ID_Caso == caso_id)\
            .order_by(models.Lectura.Fecha_y_Hora)\
            .all()
        return lecturas_relevantes
    except Exception as e:
        logger.error(f"Error al obtener lecturas relevantes para caso {caso_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno al obtener lecturas relevantes")