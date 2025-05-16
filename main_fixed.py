from fastapi import FastAPI, Depends, HTTPException, status, Request, UploadFile, File, Form, Query, Body
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRouter
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session, joinedload, contains_eager, relationship
from sqlalchemy.sql import func, extract, select, label
import models, schemas
from database import SessionLocal, engine, get_db
from models import security  # Add this import
import pandas as pd
from io import BytesIO
from datetime import datetime, timedelta, date, time
import uuid
from contextvars import ContextVar
from typing import List, Dict, Any, Optional, Tuple
import json
from urllib.parse import unquote
import logging
from logging.handlers import RotatingFileHandler
import os
import shutil
import pathlib
from dateutil import parser
import re
from sqlalchemy import select, distinct
from sqlalchemy.exc import IntegrityError
from collections import defaultdict
from contextlib import asynccontextmanager
from sqlalchemy import or_
from sqlalchemy import and_, not_
from pydantic import BaseModel
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

# Definir variable de contexto para almacenar el ID de solicitud
request_id_contextvar = ContextVar("request_id", default=None)

# Directorio para archivos de log
LOG_DIR = pathlib.Path(__file__).resolve().parent / "logs"
os.makedirs(LOG_DIR, exist_ok=True)

# Configurar formato para incluir ID de solicitud, nivel, timestamp y línea de código
log_format = '[%(asctime)s] [%(levelname)s] [RequestID:%(request_id)s] [%(name)s:%(lineno)d] - %(message)s'
date_format = '%Y-%m-%d %H:%M:%S'

# Configurar handler para archivo con rotación
file_handler = RotatingFileHandler(
    LOG_DIR / "tracer.log",
    maxBytes=10 * 1024 * 1024,  # 10 MB
    backupCount=5,
    encoding='utf-8'
)
file_handler.setFormatter(logging.Formatter(log_format, date_format))

# Configurar handler para consola
console_handler = logging.StreamHandler()
console_handler.setFormatter(logging.Formatter(log_format, date_format))

# Filtro para añadir el ID de solicitud a cada registro
class RequestIdFilter(logging.Filter):
    def filter(self, record):
        record.request_id = request_id_contextvar.get() or "N/A"
        return True

# Configurar logger principal
logger = logging.getLogger("tracer")
logger.setLevel(logging.INFO)
logger.addHandler(file_handler)
logger.addHandler(console_handler)
logger.addFilter(RequestIdFilter())

# Configurar también los loggers de la biblioteca
for name in ["uvicorn", "sqlalchemy", "fastapi"]:
    lib_logger = logging.getLogger(name)
    lib_logger.handlers = []
    lib_logger.addHandler(file_handler)
    lib_logger.addHandler(console_handler)
    lib_logger.addFilter(RequestIdFilter())
    lib_logger.propagate = False

# Eventos de inicio y apagado
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Iniciando aplicación Tracer...")
    models.create_db_and_tables()
    logger.info("Tablas de base de datos verificadas")
    yield
    # Shutdown
    logger.info("Cerrando aplicación Tracer...")

app = FastAPI(lifespan=lifespan)

# Middleware para generar y asociar un ID único a cada solicitud
@app.middleware("http")
async def request_middleware(request: Request, call_next):
    # Generar ID único para esta solicitud
    request_id = str(uuid.uuid4())
    # Guardar en la variable de contexto
    request_id_contextvar.set(request_id)
    
    # Log de inicio de solicitud
    logger.info(f"Solicitud iniciada: {request.method} {request.url.path}")
    
    try:
        # Procesar la solicitud
        response = await call_next(request)
        # Log de finalización exitosa
        logger.info(f"Solicitud completada: {request.method} {request.url.path} - Status: {response.status_code}")
        # Añadir el ID de solicitud al encabezado de respuesta
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception as e:
        # Log de error
        logger.exception(f"Error no controlado en solicitud {request.method} {request.url.path}: {str(e)}")
        # Devolver respuesta de error con el ID para referencia
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Error interno del servidor",
                "request_id": request_id
            }
        )

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción, especificar los orígenes permitidos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir routers
app.include_router(gps_capas_router)
app.include_router(admin_database_router)

# --- Manejador de Excepción para Errores de Validación (422) ---
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Log detallado del error de validación
    error_details = jsonable_encoder(exc.errors())
    logger.error(f"Error de validación para request: {request.method} {request.url}")
    logger.error(f"Detalles del error: {error_details}")
    
    # Devolver respuesta 422 estándar con el ID de solicitud
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": error_details,
            "request_id": request_id_contextvar.get()
        },
    )

# --- Manejador global de excepciones ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = request_id_contextvar.get()
    logger.exception(f"Error no manejado en {request.method} {request.url.path}: {str(exc)}")
    
    # Para errores HTTP ya manejados, mantener su comportamiento
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "request_id": request_id},
        )
    
    # Para otros errores, devolver 500
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Error interno del servidor",
            "request_id": request_id
        },
    )

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

# --- Helper functions para importación ---
def get_optional_float(value):
    if value is None or value == '' or pd.isna(value):
        return None
    try:
        # Si es string, extraer el primer número (entero o decimal)
        if isinstance(value, str):
            import re
            match = re.search(r"[-+]?[0-9]*\.?[0-9]+", value)
            if match:
                return float(match.group(0))
            else:
                return None
        return float(value)
    except (ValueError, TypeError):
        return None

def get_optional_str(value):
    return str(value).strip() if pd.notna(value) else None

def parse_flexible_datetime(dt_str: Optional[str]) -> Optional[datetime]:
    """
    Parsea una cadena de fecha/hora en varios formatos comunes.
    Retorna None si no se puede parsear.
    """
    if not dt_str:
        return None
        
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y"
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(dt_str, fmt)
        except ValueError:
            continue
            
    return None

def translate_plate_pattern(pattern: str) -> str:
    """
    Traduce un patrón de búsqueda de matrícula amigable a sintaxis SQL.
    ? -> _ (un carácter cualquiera)
    * -> % (cero o más caracteres cualquiera)
    """
    if not pattern:
        return pattern
    # Escapar caracteres especiales de SQL excepto ? y *
    special_chars = ['%', '_']
    escaped_pattern = pattern
    for char in special_chars:
        escaped_pattern = escaped_pattern.replace(char, f"\\{char}")
    # Traducir los comodines
    translated = escaped_pattern.replace('?', '_').replace('*', '%')
    return translated

# --- Endpoints API REST ---

@app.get("/")
def read_root():
    return {"message": "Bienvenido a la API de Tracer"}

# === CASOS ===
@app.post("/casos", response_model=schemas.Caso, status_code=status.HTTP_201_CREATED)
def create_caso(caso: schemas.CasoCreate, db: Session = Depends(get_db), credentials: HTTPBasicCredentials = Depends(security)):
    logger.info(f"Solicitud POST /casos con datos: {caso}")
    
    # Verificar autenticación
    user = db.query(models.Usuario).filter(models.Usuario.User == credentials.username).first()
    if not user or user.Contraseña != credentials.password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas")
    
    # Verificar si es superadmin
    is_superadmin = (hasattr(user.Rol, 'value') and user.Rol.value == 'superadmin') or (not hasattr(user.Rol, 'value') and user.Rol == 'superadmin')
    
    # Verificar duplicados
    existing_caso = db.query(models.Caso).filter(
        models.Caso.Nombre_del_Caso == caso.Nombre_del_Caso,
        models.Caso.Año == caso.Año
    ).first()
    if existing_caso:
        logger.warning(f"Intento de crear caso duplicado: {caso.Nombre_del_Caso} ({caso.Año})")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ya existe un caso con el mismo nombre y año.")
    
    try:
        caso_data = caso.model_dump(exclude_unset=True) 
        estado_str = models.EstadoCasoEnum.NUEVO.value # Default
        if 'Estado' in caso_data and caso_data['Estado'] is not None:
            estado_str = caso_data['Estado']
            # Validar que el string es un valor válido del Enum
            if estado_str not in [item.value for item in models.EstadoCasoEnum]:
                logger.error(f"Valor de Estado inválido proporcionado: {estado_str}")
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Valor de Estado inválido: {estado_str}")
        
        # Si no es superadmin, verificar que el ID_Grupo coincide con el del usuario
        if not is_superadmin and caso_data.get('ID_Grupo') != user.ID_Grupo:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permiso para crear casos en este grupo")
        
        db_caso = models.Caso(
            Nombre_del_Caso=caso_data['Nombre_del_Caso'],
            Año=caso_data['Año'],
            NIV=caso_data.get('NIV'),
            Descripcion=caso_data.get('Descripcion'),
            Estado=estado_str,
            ID_Grupo=caso_data.get('ID_Grupo') if is_superadmin else user.ID_Grupo
        )
        db.add(db_caso)
        db.commit() 
        db.refresh(db_caso)
        logger.info(f"Caso creado exitosamente con ID: {db_caso.ID_Caso}")
        return db_caso
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        db.rollback()
        logger.error(f"Error al crear el caso: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al crear el caso: {e}")

# ... resto del archivo se conserva tal cual ... 