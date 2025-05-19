from fastapi import FastAPI, Depends, HTTPException, status, Request, UploadFile, File, Form, Query, Body
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRouter
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session, joinedload, contains_eager, relationship
from sqlalchemy.sql import func, extract, select, label, text
import models, schemas
from database import SessionLocal, engine, get_db
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

# --- Helper functions for data parsing --- START
def get_optional_float(value: Any) -> Optional[float]:
    if pd.isna(value) or value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None

def get_optional_str(value: Any) -> Optional[str]:
    if pd.isna(value) or value is None:
        return None
    try:
        return str(value).strip()
    except (ValueError, TypeError):
        return None
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
@app.post("/casos/{caso_id}/archivos/upload", response_model=schemas.UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_excel(
    caso_id: int,
    tipo_archivo: str = Form(..., pattern="^(GPS|LPR)$"),
    excel_file: UploadFile = File(...),
    column_mapping: str = Form(...),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_user) # AÑADIDO
):
    # 1. Verificar caso y permisos
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

@app.get("/archivos/{id_archivo}/download")
async def download_archivo(id_archivo: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_user)):
    logger.info(f"Solicitud de descarga para archivo ID: {id_archivo} por usuario {current_user.User}")
    archivo_db = db.query(models.ArchivoExcel).options(joinedload(models.ArchivoExcel.caso)).filter(models.ArchivoExcel.ID_Archivo == id_archivo).first()
    if archivo_db is None:
        logger.error(f"Registro archivo ID {id_archivo} no encontrado DB.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de archivo no encontrado.")

    if not archivo_db.caso:
        logger.error(f"Archivo ID {id_archivo} no está asociado a ningún caso. No se puede verificar permisos.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error de consistencia de datos del archivo.")

    user_rol = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol
    if user_rol == RolUsuarioEnum.admingrupo.value:
        if current_user.ID_Grupo is None:
            logger.warning(f"Admingrupo {current_user.User} sin grupo asignado intentó descargar archivo {id_archivo}.")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admingrupo no tiene un grupo asignado.")
        if archivo_db.caso.ID_Grupo != current_user.ID_Grupo:
            logger.warning(f"Admingrupo {current_user.User} (Grupo {current_user.ID_Grupo}) intentó descargar archivo {id_archivo} del caso {archivo_db.ID_Caso} (Grupo {archivo_db.caso.ID_Grupo}). Acceso denegado.")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permiso para descargar este archivo.")
    elif user_rol != RolUsuarioEnum.superadmin.value:
        logger.warning(f"Usuario {current_user.User} (Rol {user_rol}) intentó descargar archivo {id_archivo}. Acceso denegado.")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permiso denegado para descargar archivos.")

    if not archivo_db.Nombre_del_Archivo:
         logger.error(f"Registro archivo ID {id_archivo} sin nombre.")
         raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Falta nombre del archivo BD.")
    file_path = UPLOADS_DIR / archivo_db.Nombre_del_Archivo
    logger.info(f"[Download] Verificando: {file_path}")
    if not os.path.isfile(file_path):
        logger.error(f"[Download] Archivo físico NO encontrado: {file_path}")
        try:
             contenido_dir = os.listdir(UPLOADS_DIR)
             logger.warning(f"[Download] Contenido {UPLOADS_DIR}: {contenido_dir}")
        except Exception as list_err:
             logger.error(f"[Download] Error listando {UPLOADS_DIR}: {list_err}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo original no encontrado servidor.")
    else:
        logger.info(f"[Download] Archivo encontrado: {file_path}")
    media_type = 'application/octet-stream'
    if archivo_db.Nombre_del_Archivo:
        if archivo_db.Nombre_del_Archivo.lower().endswith(('.xlsx', '.xls')):
            media_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        elif archivo_db.Nombre_del_Archivo.lower().endswith('.csv'):
            media_type = 'text/csv'
    logger.info(f"[Download] Devolviendo: {file_path} ({media_type})")
    return FileResponse(path=file_path, filename=archivo_db.Nombre_del_Archivo, media_type=media_type)

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
                    vehiculo = models.Vehiculo(**{k: v for k, v in vehiculo_dict.items() if k in ['ID_Vehiculo', 'Matricula', 'Marca', 'Modelo', 'Color', 'Propietario', 'Observaciones']})
                    
                    # Crear VehiculoWithStats con estadísticas
                    vehiculos_with_stats.append(schemas.VehiculoWithStats(
                        **vehiculo.__dict__,
                        num_lecturas_lpr=row.total_lecturas,
                        num_lecturas_gps=0  # Se podría añadir esta métrica en la vista
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

        if hora_inicio:
            try:
                hora_time = datetime.strptime(hora_inicio, "%H:%M").time()
                query = query.filter(extract('hour', models.Lectura.Fecha_y_Hora) * 100 + 
                                  extract('minute', models.Lectura.Fecha_y_Hora) >= 
                                  hora_time.hour * 100 + hora_time.minute)
            except ValueError as e:
                logger.error(f"Error al parsear hora_inicio: {e}")
                raise HTTPException(status_code=400, detail=f"Formato de hora_inicio inválido: {hora_inicio}. Use HH:MM")

        if hora_fin:
            try:
                hora_time = datetime.strptime(hora_fin, "%H:%M").time()
                query = query.filter(extract('hour', models.Lectura.Fecha_y_Hora) * 100 + 
                                  extract('minute', models.Lectura.Fecha_y_Hora) <= 
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
            paradas = []
            def haversine(lat1, lon1, lat2, lon2):
                R = 6371000  # metros
                dlat = radians(lat2 - lat1)
                dlon = radians(lon2 - lon1)
                a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
                c = 2 * asin(sqrt(a))
                return R * c
            for i in range(len(lecturas_all) - 1):
                l1 = lecturas_all[i]
                l2 = lecturas_all[i+1]
                # Solo comparar si es la misma matrícula
                if l1.Matricula != l2.Matricula:
                    continue
                # Comprobar datos válidos
                if not (l1.Fecha_y_Hora and l2.Fecha_y_Hora and l1.Coordenada_X is not None and l1.Coordenada_Y is not None and l2.Coordenada_X is not None and l2.Coordenada_Y is not None):
                    continue
                # Tiempo en minutos
                diff_min = (l2.Fecha_y_Hora - l1.Fecha_y_Hora).total_seconds() / 60
                if diff_min < duracion_parada or diff_min <= 0:
                    continue
                # Velocidad permisiva
                if l1.Velocidad is None or l1.Velocidad > 12:
                    continue
                # Distancia
                dist = haversine(l1.Coordenada_Y, l1.Coordenada_X, l2.Coordenada_Y, l2.Coordenada_X)
                if dist > 220:
                    continue
                # Crear dict y añadir duración
                l1_dict = l1.__dict__.copy()
                l1_dict['duracion_parada_min'] = diff_min
                paradas.append(LecturaSchema(**l1_dict))
            lecturas = paradas
        else:
            lecturas = query.all()

        logger.info(f"Encontradas {len(lecturas)} lecturas para el caso {caso_id}")
        return lecturas

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al obtener lecturas del caso {caso_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno al obtener lecturas: {str(e)}")

@app.get("/casos/{caso_id}/matriculas/sugerencias", response_model=List[str])
def get_sugerencias_matriculas(
    caso_id: int,
    query: str,
    limit: int = 5,
    db: Session = Depends(get_db)
):
    """
    Obtiene sugerencias de matrículas para un caso específico basado en un texto de búsqueda.
    Optimizado para rendimiento usando una subconsulta para matrículas únicas.
    """
    logger.info(f"GET /casos/{caso_id}/matriculas/sugerencias - query: {query}, limit: {limit}")
    
    try:
        # Subconsulta optimizada para obtener matrículas únicas del caso
        matriculas = db.query(models.Lectura.Matricula)\
            .join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
            .filter(
                models.ArchivoExcel.ID_Caso == caso_id,
                models.Lectura.Matricula.ilike(f"%{query}%")
            )\
            .distinct()\
            .order_by(models.Lectura.Matricula)\
            .limit(limit)\
            .all()
        
        # Extraer las matrículas de la lista de tuplas
        sugerencias = [m[0] for m in matriculas if m[0]]
        
        logger.info(f"Encontradas {len(sugerencias)} sugerencias para '{query}' en caso {caso_id}")
        return sugerencias
        
    except Exception as e:
        logger.error(f"Error al obtener sugerencias de matrículas para caso {caso_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error interno al obtener sugerencias: {str(e)}"
        )

@app.post("/api/analisis/busqueda-cruzada")
async def busqueda_cruzada(request: Request):
    try:
        data = await request.json()
        casos = data.get('casos', [])
        
        if len(casos) < 2:
            raise HTTPException(status_code=400, detail="Se requieren al menos 2 casos para la búsqueda cruzada")

        # Consulta para obtener todas las lecturas de los casos seleccionados
        query = """
            SELECT l.ID_Lectura, l.ID_Archivo, l.Matricula, l.Fecha_y_Hora, 
                   lec.Nombre as Nombre_Lector, lec.ID_Lector
            FROM Lecturas l
            JOIN Lectores lec ON l.ID_Lector = lec.ID_Lector
            WHERE l.ID_Archivo IN :casos
            ORDER BY l.Matricula, l.Fecha_y_Hora
        """
        
        result = await database.fetch_all(query, {"casos": tuple(casos)})
        
        # Agrupar lecturas por matrícula
        vehiculos = {}
        for lectura in result:
            matricula = lectura['Matricula']
            if matricula not in vehiculos:
                vehiculos[matricula] = {
                    'matricula': matricula,
                    'casos': set(),
                    'lecturas': []
                }
            
            vehiculos[matricula]['casos'].add(lectura['ID_Archivo'])
            vehiculos[matricula]['lecturas'].append({
                'casoId': lectura['ID_Archivo'],
                'fecha': lectura['Fecha_y_Hora'],
                'lector': lectura['Nombre_Lector'] or f"Lector {lectura['ID_Lector']}"
            })
        
        # Filtrar solo los vehículos que aparecen en más de un caso
        vehiculos_coincidentes = [
            {
                'matricula': v['matricula'],
                'casos': list(v['casos']),
                'lecturas': v['lecturas']
            }
            for v in vehiculos.values()
            if len(v['casos']) > 1
        ]
        
        return vehiculos_coincidentes
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/casos/{caso_id}", response_model=schemas.Caso)
def update_caso(caso_id: int, caso_update: schemas.CasoUpdate, db: Session = Depends(get_db)):
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if db_caso is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado")
    update_data = caso_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_caso, key, value)
    db.commit()
    db.refresh(db_caso)
    return db_caso

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
    db: Session = Depends(get_db)
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

# --- NUEVO ENDPOINT PARA LECTURAS POR PERIODO (LANZADERA) ---
# Removed as part of cleanup

# --- NUEVO ENDPOINT PARA LECTURAS POR PERIODO (LANZADERA) ---
# Removed as part of cleanup

@app.post("/casos/{caso_id}/detectar-lanzaderas", response_model=schemas.LanzaderaResponse)
def detectar_vehiculos_lanzadera(
    caso_id: int,
    request: schemas.LanzaderaRequest,
    db: Session = Depends(get_db)
):
    # 1. Obtener todas las lecturas del vehículo objetivo en el rango de fechas
    query = db.query(models.Lectura).filter(
        models.Lectura.ID_Archivo.in_(
            db.query(models.ArchivoExcel.ID_Archivo)
            .filter(models.ArchivoExcel.ID_Caso == caso_id)
        ),
        models.Lectura.Matricula == request.matricula
    )
    if request.fecha_inicio:
        query = query.filter(models.Lectura.Fecha_y_Hora >= request.fecha_inicio)
    if request.fecha_fin:
        query = query.filter(models.Lectura.Fecha_y_Hora <= f"{request.fecha_fin} 23:59:59")
    lecturas_objetivo = query.order_by(models.Lectura.Fecha_y_Hora).all()

    if not lecturas_objetivo:
        return schemas.LanzaderaResponse(
            vehiculos_lanzadera=[],
            detalles=[]
        )

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
                if any(abs((h2 - h1).total_seconds() / 60) >= request.diferencia_minima 
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

    return schemas.LanzaderaResponse(
        vehiculos_lanzadera=vehiculos_lanzadera,
        detalles=detalles
    )

@app.get("/estadisticas", response_model=schemas.EstadisticasGlobales)
def get_estadisticas_globales(db: Session = Depends(get_db)):
    """
    Obtiene estadísticas globales del sistema:
    - Total de casos activos
    - Total de lecturas
    - Total de vehículos únicos
    - Tamaño total de la base de datos
    """
    import os
    try:
        # Contar casos activos
        total_casos = db.query(func.count(models.Caso.ID_Caso)).scalar() or 0
        # Contar total de lecturas
        total_lecturas = db.query(func.count(models.Lectura.ID_Lectura)).scalar() or 0
        # Contar vehículos únicos
        total_vehiculos = db.query(func.count(func.distinct(models.Lectura.Matricula))).scalar() or 0
        # Detectar si es SQLite y calcular tamaño del archivo
        tamanio_bd = 'No disponible'
        try:
            if db.bind and 'sqlite' in str(db.bind.url):
                db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tracer.db')
                if os.path.exists(db_path):
                    size_bytes = os.path.getsize(db_path)
                    if size_bytes < 1024 * 1024:
                        tamanio_bd = f"{size_bytes / 1024:.2f} KB"
                    elif size_bytes < 1024 * 1024 * 1024:
                        tamanio_bd = f"{size_bytes / (1024 * 1024):.2f} MB"
                    else:
                        tamanio_bd = f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"
                else:
                    tamanio_bd = 'No disponible'
            else:
                # Intentar consulta PostgreSQL
                try:
                    tamanio_bd = db.execute("SELECT pg_size_pretty(pg_database_size(current_database()))").scalar()
                except Exception as e:
                    logger.warning(f"No se pudo obtener el tamaño de la base de datos: {e}")
                    tamanio_bd = 'No disponible'
        except Exception as e:
            logger.warning(f"Error al calcular tamaño de la base de datos: {e}")
            tamanio_bd = 'No disponible'
        return schemas.EstadisticasGlobales(
            total_casos=total_casos,
            total_lecturas=total_lecturas,
            total_vehiculos=total_vehiculos,
            tamanio_bd=tamanio_bd
        )
    except Exception as e:
        logger.error(f"Error al obtener estadísticas globales: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener estadísticas"
        )

# === Endpoint para Búsqueda Multicaso ===
class BusquedaMulticasoRequest(BaseModel):
    casos: list[int]

@app.post("/busqueda/multicaso", response_model=List[Dict[str, Any]], tags=["Búsqueda"])
def buscar_vehiculos_multicaso(request: BusquedaMulticasoRequest, db: Session = Depends(get_db)):
    """
    Busca vehículos que aparecen en múltiples casos.
    Devuelve una lista de vehículos con sus lecturas en cada caso.
    """
    casos = request.casos
    logger.info(f"POST /busqueda/multicaso - Buscando vehículos en casos: {casos}")
    
    # Verificar que todos los casos existen
    casos_existentes = db.query(models.Caso).filter(models.Caso.ID_Caso.in_(casos)).all()
    if len(casos_existentes) != len(casos):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Uno o más casos no existen"
        )

    # Obtener todas las lecturas de los casos seleccionados
    lecturas = db.query(models.Lectura).join(models.ArchivoExcel).filter(
        models.ArchivoExcel.ID_Caso.in_(casos)
    ).all()

    # Agrupar lecturas por matrícula
    lecturas_por_matricula = defaultdict(lambda: defaultdict(list))
    for lectura in lecturas:
        lecturas_por_matricula[lectura.Matricula][lectura.archivo.ID_Caso].append(lectura)

    # Filtrar solo las matrículas que aparecen en al menos 2 casos
    coincidencias = []
    for matricula, lecturas_en_casos in lecturas_por_matricula.items():
        if len(lecturas_en_casos) >= 2:
            casos_con_lecturas = []
            for caso_id, lecturas in lecturas_en_casos.items():
                caso = next(c for c in casos_existentes if c.ID_Caso == caso_id)
                casos_con_lecturas.append({
                    "id": caso_id,
                    "nombre": caso.Nombre_del_Caso,
                    "lecturas": [
                        {
                            "ID_Lectura": l.ID_Lectura,
                            "Fecha_y_Hora": l.Fecha_y_Hora.isoformat(),
                            "ID_Caso": l.archivo.ID_Caso,
                            "Nombre_del_Caso": caso.Nombre_del_Caso
                        }
                        for l in lecturas
                    ]
                })
            
            coincidencias.append({
                "matricula": matricula,
                "casos": casos_con_lecturas
            })

    return coincidencias
# --- Fin Endpoint ---

@app.get("/archivos/recientes", response_model=List[schemas.ArchivoExcel])
def read_archivos_recientes(
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """
    Obtiene los archivos más recientemente importados, incluyendo el caso asociado y el número real de registros importados.
    """
    archivos = (
        db.query(models.ArchivoExcel)
        .join(models.Caso)
        .options(joinedload(models.ArchivoExcel.caso))
        .order_by(models.ArchivoExcel.Fecha_de_Importacion.desc())
        .limit(limit)
        .all()
    )
    # Para cada archivo, contar el número de lecturas asociadas
    resultado = []
    for archivo in archivos:
        total_registros = db.query(func.count(models.Lectura.ID_Lectura)).filter(models.Lectura.ID_Archivo == archivo.ID_Archivo).scalar() or 0
        archivo.Total_Registros = total_registros
        resultado.append(archivo)
    return resultado

grupos_router = APIRouter(prefix="/api/grupos", tags=["Grupos"])

@grupos_router.get("", response_model=List[schemas.Grupo])
def get_grupos(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_superadmin)): # MODIFICADO
    grupos = db.query(models.Grupo).options(joinedload(models.Grupo.casos)).all()
    return grupos

@grupos_router.post("", response_model=schemas.Grupo, status_code=201)
def create_grupo(grupo: schemas.GrupoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_superadmin)): # MODIFIED
    db_grupo = models.Grupo(Nombre=grupo.Nombre, Descripcion=grupo.Descripcion)
    db.add(db_grupo)
    try:
        db.commit()
        db.refresh(db_grupo)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="El nombre del grupo ya existe")
    return db_grupo

@grupos_router.put("/{grupo_id}", response_model=schemas.Grupo)
def update_grupo(grupo_id: int, grupo_update: schemas.GrupoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_superadmin)): # MODIFIED
    db_grupo = db.query(models.Grupo).filter(models.Grupo.ID_Grupo == grupo_id).first()
    if not db_grupo:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    db_grupo.Nombre = grupo_update.Nombre
    db_grupo.Descripcion = grupo_update.Descripcion
    try:
        db.commit()
        db.refresh(db_grupo)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="El nombre del grupo ya existe")
    return db_grupo

@grupos_router.delete("/{grupo_id}", status_code=204)
def delete_grupo(grupo_id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_superadmin)): # MODIFIED
    db_grupo = db.query(models.Grupo).options(joinedload(models.Grupo.casos)).filter(models.Grupo.ID_Grupo == grupo_id).first()
    if not db_grupo:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    if db_grupo.casos and len(db_grupo.casos) > 0:
        raise HTTPException(status_code=400, detail="No se puede eliminar un grupo con casos asignados")
    db.delete(db_grupo)
    db.commit()
    return

app.include_router(grupos_router)

usuarios_router = APIRouter(prefix="/api/usuarios", tags=["Usuarios"])

@usuarios_router.get("", response_model=List[schemas.Usuario])
def get_usuarios(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_superadmin)):
    usuarios = db.query(models.Usuario).all()
    return [
        schemas.Usuario(
            User=u.User,  # Ensure this is not str(u.User)
            Rol=u.Rol.value if hasattr(u.Rol, 'value') else u.Rol,
            ID_Grupo=u.ID_Grupo,
            grupo=u.grupo
        )
        for u in usuarios
    ]

@usuarios_router.post("", response_model=schemas.Usuario, status_code=201)
def create_usuario(
    # request: Request, <--- REMOVE request, no longer needed for Basic Auth
    usuario: schemas.UsuarioCreate, 
    db: Session = Depends(get_db),
    # Usar la nueva dependencia opcional para la comprobación de superadmin
    current_superadmin_check: Optional[models.Usuario] = Depends(get_current_active_superadmin_optional)
):
    logger.info(f"Intento de crear usuario. Payload recibido: {usuario.model_dump()}") # AÑADIDO LOG DEL PAYLOAD
    logger.info(f"Solicitud POST /api/usuarios para crear usuario: {usuario.User}")
    is_first_user = db.query(models.Usuario).count() == 0
    
    if not is_first_user:
        # No es el primer usuario, se requiere que un superadmin autenticado realice esta acción.
        if current_superadmin_check is None:
            logger.warning(f"Intento de crear usuario '{usuario.User}' sin ser superadmin o sin autenticación válida (JWT).")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Se requiere autenticación de Superadmin para crear usuarios adicionales."
            )
        logger.info(f"Usuario '{usuario.User}' será creado por Superadmin (JWT): {current_superadmin_check.User}")
    else: # Es el primer usuario
        logger.info(f"Creando primer usuario del sistema: {usuario.User}")
        # Validar que el rol del primer usuario sea 'superadmin'
        # models.RolUsuarioEnum.superadmin.value sería la forma ideal si Rol es un Enum en el modelo
        # Por ahora, asumimos que 'superadmin' es el string directo
        rol_primer_usuario = usuario.Rol.value if hasattr(usuario.Rol, 'value') else usuario.Rol
        if rol_primer_usuario != 'superadmin':
            logger.error(f"Intento de crear primer usuario '{usuario.User}' con rol '{rol_primer_usuario}' en lugar de 'superadmin'.")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El primer usuario debe tener el rol de superadmin.")
        # Forzar ID_Grupo a None para el primer superadmin, independientemente de lo que venga en el payload
        usuario.ID_Grupo = None
        logger.info(f"Primer usuario '{usuario.User}' establecido como superadmin y sin grupo.")

    # Verificar si el usuario ya existe (después de la lógica de primer usuario/superadmin)
    db_user_exists = db.query(models.Usuario).filter(models.Usuario.User == usuario.User).first()
    if db_user_exists:
        logger.warning(f"Intento de crear usuario existente: {usuario.User}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El nombre de usuario ya existe.")

    # Hashear la contraseña ANTES de crear el objeto models.Usuario
    hashed_password = get_password_hash(usuario.Contraseña)
    
    # Determinar el valor final para Rol (manejando Enum o string)
    # Esto es importante si el schema UsuarioCreate.Rol puede ser un Enum de Pydantic
    # y models.Usuario.Rol espera el .value si es un Enum de SQLAlchemy, o el string directo.
    rol_value_to_save = usuario.Rol
    if hasattr(usuario.Rol, 'value'): # Si usuario.Rol es un Enum (como schemas.RolUsuarioEnum)
        rol_value_to_save = usuario.Rol.value
    
    # Ajustar ID_Grupo para superadmines creados por otros superadmines (si no son el primero)
    if not is_first_user and rol_value_to_save == 'superadmin':
        usuario.ID_Grupo = None # Los superadmines no tienen grupo

    db_usuario_obj = models.Usuario(
        User=usuario.User, # CORREGIDO: Quitar str()
        Rol=rol_value_to_save, 
            ID_Grupo=usuario.ID_Grupo,
        Contraseña=hashed_password 
    )
    
    try:
        db.add(db_usuario_obj)
        db.commit() # MOVIDO db.commit() aquí para asegurar que el objeto está en la BD antes de refresh
        db.refresh(db_usuario_obj)
        logger.info(f"Usuario '{db_usuario_obj.User}' creado exitosamente con rol '{db_usuario_obj.Rol}' y ID_Grupo '{db_usuario_obj.ID_Grupo}'.")
    except IntegrityError as e:
        db.rollback()
        logger.error(f"Error de integridad al crear usuario {usuario.User}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Error de base de datos al crear usuario: {e}")
    except Exception as e:
        db.rollback()
        logger.error(f"Error inesperado al crear usuario {usuario.User}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al crear usuario: {e}")

    # Para la respuesta, obtener el grupo asociado si existe
    grupo_asociado = None
    if db_usuario_obj.ID_Grupo:
        grupo_asociado = db.query(models.Grupo).filter(models.Grupo.ID_Grupo == db_usuario_obj.ID_Grupo).first()
    
    return schemas.Usuario(
        User=db_usuario_obj.User, # CORREGIDO: Quitar str()
        Rol=db_usuario_obj.Rol.value if hasattr(db_usuario_obj.Rol, 'value') else db_usuario_obj.Rol, # Asegurar que se pasa el valor del Enum
        ID_Grupo=db_usuario_obj.ID_Grupo,
        grupo=grupo_asociado
    )

@usuarios_router.put("/{user_id}", response_model=schemas.Usuario)
def update_usuario(user_id: int, usuario_update: schemas.UsuarioUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_superadmin)): # MODIFIED
    logger.info(f"Superadmin {current_user.User} intentando actualizar usuario {user_id}")
    
    db_usuario = db.query(models.Usuario).filter(models.Usuario.User == user_id).first()
    if not db_usuario:
        logger.warning(f"Intento de actualizar usuario inexistente {user_id}")
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Si se está cambiando el rol de un superadmin, verificar que no sea el último
    if (db_usuario.Rol == models.RolUsuarioEnum.superadmin.value and 
        usuario_update.Rol is not None and 
        usuario_update.Rol != models.RolUsuarioEnum.superadmin.value):
        superadmin_count = db.query(models.Usuario).filter(
            models.Usuario.Rol == models.RolUsuarioEnum.superadmin.value
        ).count()
        if superadmin_count <= 1:
            logger.warning(f"Intento de cambiar rol del último superadmin {user_id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se puede cambiar el rol del último superadmin del sistema"
            )
    
    # Registrar cambios para auditoría
    cambios = []
    if usuario_update.Rol is not None and usuario_update.Rol != db_usuario.Rol:
        cambios.append(f"Rol: {db_usuario.Rol} -> {usuario_update.Rol}")
        db_usuario.Rol = usuario_update.Rol
    if usuario_update.ID_Grupo is not None and usuario_update.ID_Grupo != db_usuario.ID_Grupo:
        cambios.append(f"ID_Grupo: {db_usuario.ID_Grupo} -> {usuario_update.ID_Grupo}")
        db_usuario.ID_Grupo = usuario_update.ID_Grupo
    if usuario_update.Contraseña is not None:
        cambios.append("Contraseña actualizada")
        db_usuario.Contraseña = get_password_hash(usuario_update.Contraseña)
    
    if cambios:
        logger.info(f"Actualizando usuario {user_id}: {', '.join(cambios)}")
        db.commit()
        db.refresh(db_usuario)
        logger.info(f"Usuario {user_id} actualizado exitosamente")
    else:
        logger.info(f"No se realizaron cambios en el usuario {user_id}")
    
    return db_usuario

@usuarios_router.delete("/{user_id}", status_code=204)
def delete_usuario(user_id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_active_superadmin)):
    logger.info(f"Superadmin {current_user.User} intentando eliminar usuario {user_id}")
    
    # No permitir eliminar el propio usuario
    if user_id == current_user.User:
        logger.warning(f"Intento de auto-eliminación por superadmin {current_user.User}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puede eliminar su propio usuario"
        )
    
    db_usuario = db.query(models.Usuario).filter(models.Usuario.User == user_id).first()
    if not db_usuario:
        logger.warning(f"Intento de eliminar usuario inexistente {user_id}")
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Verificar si es el último superadmin
    if db_usuario.Rol == models.RolUsuarioEnum.superadmin.value:
        superadmin_count = db.query(models.Usuario).filter(
            models.Usuario.Rol == models.RolUsuarioEnum.superadmin.value
        ).count()
        if superadmin_count <= 1:
            logger.warning(f"Intento de eliminar el último superadmin {user_id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se puede eliminar el último superadmin del sistema"
            )
    
    logger.info(f"Eliminando usuario {user_id} (Rol: {db_usuario.Rol})")
    db.delete(db_usuario)
    db.commit()
    logger.info(f"Usuario {user_id} eliminado exitosamente")
    return

app.include_router(usuarios_router)

# --- Configuración del Footer (persistencia en JSON) ---
import json
from pydantic import BaseModel

FOOTER_CONFIG_PATH = "footer_config.json"

class FooterConfig(BaseModel):
    text: str

def load_footer_config() -> FooterConfig:
    try:
        with open(FOOTER_CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return FooterConfig(**data)
    except Exception:
        # Valor por defecto si no existe el archivo
        return FooterConfig(text="JSP Madrid - Brigada Provincial de Policía Judicial")

def save_footer_config(config: FooterConfig):
    with open(FOOTER_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config.dict(), f, ensure_ascii=False, indent=2)

@app.get("/config/footer", response_model=FooterConfig)
def get_footer_config():
    return load_footer_config()

@app.post("/config/footer")
def set_footer_config(config: FooterConfig):
    save_footer_config(config)
    return {"ok": True}

@app.put("/lecturas_relevantes/{id_relevante}/nota", response_model=schemas.LecturaRelevante)
def actualizar_nota_relevante(
    id_relevante: int, 
    nota_update: schemas.LecturaRelevanteUpdate, 
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_user)
):
    """Actualiza la nota de una lectura marcada como relevante."""
    logger.info(f"Usuario {current_user.User} solicitando actualizar nota para LecturaRelevante ID {id_relevante}.")

    db_relevante = db.query(models.LecturaRelevante)\
        .options(joinedload(models.LecturaRelevante.lectura)
                 .joinedload(models.Lectura.archivo)
                 .joinedload(models.ArchivoExcel.caso))\
        .filter(models.LecturaRelevante.ID_Relevante == id_relevante)\
        .first()
        
    if not db_relevante:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de lectura relevante no encontrado.")

    # BLOQUE DE AUTORIZACIÓN
    if not db_relevante.lectura:
        logger.error(f"Error de datos: LecturaRelevante ID {id_relevante} (solicitada por {current_user.User}) no tiene una lectura asociada.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error de consistencia de datos: Falta lectura asociada.")

    db_lectura = db_relevante.lectura
    if not db_lectura.archivo or not db_lectura.archivo.caso:
        logger.error(f"Error de datos: Lectura ID {db_lectura.ID_Lectura} (asociada a LecturaRelevante ID {id_relevante}, solicitada por {current_user.User}) no está correctamente asociada a un archivo y caso para actualizar nota.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error de datos: Lectura no asociada a un caso.")

    user_rol = current_user.Rol.value if hasattr(current_user.Rol, 'value') else current_user.Rol
    is_superadmin = user_rol == models.RolUsuarioEnum.superadmin.value
    caso_de_lectura = db_lectura.archivo.caso

    if not is_superadmin and (current_user.ID_Grupo is None or caso_de_lectura.ID_Grupo != current_user.ID_Grupo):
        logger.warning(f"Usuario {current_user.User} no autorizado para actualizar nota de LecturaRelevante ID {id_relevante} (caso ID {caso_de_lectura.ID_Caso}, grupo caso {caso_de_lectura.ID_Grupo}, grupo user {current_user.ID_Grupo}).")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permiso para modificar lecturas de este caso.")
    # FIN BLOQUE DE AUTORIZACIÓN

    db_relevante.Nota = nota_update.Nota
    db_relevante.Fecha_Modificacion = datetime.now(timezone.utc) # Actualizar fecha de modificación
    try:
        db.commit()
        db.refresh(db_relevante)
        logger.info(f"Nota actualizada para LecturaRelevante ID {id_relevante} por usuario {current_user.User}.")
        return db_relevante
    except Exception as e:
        db.rollback()
        logger.error(f"Error al actualizar nota de LecturaRelevante ID {id_relevante} por usuario {current_user.User}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al actualizar la nota.")

# Router para el estado de configuración inicial
setup_router = APIRouter()

class SetupStatusResponse(BaseModel):
    needs_superadmin_setup: bool
    superadmin_exists: bool
    users_exist: bool

@setup_router.get("/status", response_model=SetupStatusResponse, tags=["Setup"])
async def get_setup_status(db: Session = Depends(get_db)):
    total_users_count = db.query(func.count(models.Usuario.User)).scalar()
    
    # Contar superadmins. Asegurarse de que Rol es un Enum y comparar con el valor del Enum.
    # models.RolUsuarioEnum.superadmin o directamente la cadena "superadmin" si Rol es str.
    # Asumiendo que models.Usuario.Rol es un Enum como en schemas.RolUsuarioEnum
    # Si es una simple cadena en el modelo, se usaría: models.Usuario.Rol == "superadmin"
    try:
        # Intenta acceder a .value si es un Enum, de lo contrario usa el valor directamente
        superadmin_rol_value = models.RolUsuarioEnum.superadmin.value \
            if hasattr(models.RolUsuarioEnum.superadmin, 'value') \
            else models.RolUsuarioEnum.superadmin
    except AttributeError:
        # Fallback si RolUsuarioEnum no está definido en models o no es un enum como se espera
        # Asumimos que el rol se almacena como una cadena simple si el Enum no está disponible aquí.
        # Esto puede necesitar ajuste basado en la definición real en models.py
        logger.warning("models.RolUsuarioEnum no se encontró o no es un Enum como se esperaba, usando 'superadmin' como string para la query.")
        superadmin_rol_value = "superadmin"

    superadmin_users_count = db.query(models.Usuario).filter(func.lower(models.Usuario.Rol) == superadmin_rol_value.lower()).count()

    users_exist = total_users_count > 0
    superadmin_exists = superadmin_users_count > 0
    needs_superadmin_setup = not superadmin_exists # Necesita setup si no hay superadmin

    return SetupStatusResponse(
        needs_superadmin_setup=needs_superadmin_setup,
        superadmin_exists=superadmin_exists,
        users_exist=users_exist
    )

app.include_router(setup_router, prefix="/api/setup", tags=["Setup"])