from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, Request, Query, Body
from fastapi.middleware.cors import CORSMiddleware # Importar middleware CORS
from fastapi.exceptions import RequestValidationError # Importar excepción
from fastapi.responses import JSONResponse, FileResponse # Importar para respuesta personalizada y FileResponse
from fastapi.encoders import jsonable_encoder # Importar para codificar errores
from sqlalchemy.orm import Session, joinedload, contains_eager, relationship # Añadir relationship si no está
from sqlalchemy.sql import func, extract, select, label # Añadir select y label
import models, schemas # Importar nuestros modelos y schemas
from database import SessionLocal, engine, get_db # Importar configuración de BD y get_db
import pandas as pd
from io import BytesIO
import datetime
from typing import List, Dict, Any, Optional, Tuple # Asegurar List y Optional
import json
from urllib.parse import unquote
import logging # Importar logging
import os # Para trabajar con rutas de archivo
import shutil # Para guardar archivos subidos
import pathlib # Importar pathlib para rutas absolutas
from dateutil import parser # Importar dateutil.parser
import re # Importar re para expresiones regulares
from sqlalchemy import select, distinct # Importar select y distinct
from sqlalchemy.exc import IntegrityError # Importar IntegrityError
from datetime import timedelta # Asegurar import timedelta
from collections import defaultdict # Importar defaultdict
from contextlib import asynccontextmanager
from sqlalchemy import or_ # Importar or_ para OR en consultas
from sqlalchemy import and_, not_ # Importar and_ y not_ para AND y NOT en consultas
from pydantic import BaseModel
from datetime import datetime, timedelta, date, time

# Configurar logging básico para ver más detalles
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Eliminar la llamada directa aquí
# models.create_db_and_tables()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Ejecutando evento de inicio: Creando tablas si no existen...")
    models.create_db_and_tables()
    logger.info("Evento de inicio completado.")
    yield
    # Shutdown
    logger.info("Cerrando aplicación...")

app = FastAPI(
    title="Tracer API", 
    description="API para la aplicación de análisis vehicular Tracer", 
    version="0.1.0",
    lifespan=lifespan
)

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

# --- Configuración CORS --- 
origins = [
    "*" # Permitir cualquier origen temporalmente
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # Usar la lista comodín
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"], 
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

# --- Helper functions para importación ---
def get_optional_float(value):
    try: return float(value) if pd.notna(value) else None
    except (ValueError, TypeError): return None

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
def create_caso(caso: schemas.CasoCreate, db: Session = Depends(get_db)):
    logger.info(f"Solicitud POST /casos con datos: {caso}")
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
        
        db_caso = models.Caso(
            Nombre_del_Caso=caso_data['Nombre_del_Caso'],
            Año=caso_data['Año'],
            NIV=caso_data.get('NIV'),
            Descripcion=caso_data.get('Descripcion'),
            Estado=estado_str # Asignar el string validado
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

@app.get("/casos", response_model=List[schemas.Caso])
def read_casos(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    logger.info(f"GET /casos - skip: {skip}, limit: {limit}")
    try:
        casos_db = db.query(models.Caso).order_by(models.Caso.ID_Caso).offset(skip).limit(limit).all()
        
        # --- Log de depuración --- 
        logger.info(f"Se obtuvieron {len(casos_db)} casos de la BD.")
        for i, caso_obj in enumerate(casos_db):
            estado_valor_raw = None
            try:
                # Intentar acceder al valor directamente (puede ser ya el Enum o el string si native_enum=False funciona)
                estado_valor_raw = caso_obj.Estado
                logger.info(f"  Caso {i+1} (ID: {caso_obj.ID_Caso}): Estado leído = {repr(estado_valor_raw)} (Tipo: {type(estado_valor_raw)})")
                # Forzar la validación aquí para ver si falla
                validated_enum = models.EstadoCasoEnum(estado_valor_raw.value if isinstance(estado_valor_raw, models.EstadoCasoEnum) else estado_valor_raw)
                logger.info(f"    Estado validado como Enum del modelo: {validated_enum}")
            except Exception as e_log:
                # Si falla el acceso o la validación forzada, loguear
                logger.error(f"  Caso {i+1} (ID: {caso_obj.ID_Caso}): Error al procesar/validar estado '{estado_valor_raw}': {e_log}")
        # --- Fin Log de depuración ---

        return casos_db # Devolver la lista original para que Pydantic/FastAPI la procese
    except Exception as e:
        logger.error(f"Error general al obtener casos: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al obtener casos: {e}")

@app.get("/casos/{caso_id}", response_model=schemas.Caso)
def read_caso(caso_id: int, db: Session = Depends(get_db)):
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if db_caso is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado")
    return db_caso

@app.put("/casos/{caso_id}/estado", response_model=schemas.Caso)
def update_caso_estado(caso_id: int, estado_update: schemas.CasoEstadoUpdate, db: Session = Depends(get_db)):
    logger.info(f"Solicitud PUT para actualizar estado del caso ID: {caso_id} a {estado_update.Estado}")
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if db_caso is None:
        logger.warning(f"[Update Estado Caso] Caso con ID {caso_id} no encontrado.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado")
    
    # Validar que el nuevo estado (string) es válido
    nuevo_estado_str = estado_update.Estado
    if nuevo_estado_str not in [item.value for item in models.EstadoCasoEnum]:
         logger.error(f"Valor de Estado inválido para actualizar: {nuevo_estado_str}")
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Valor de Estado inválido: {nuevo_estado_str}")

    try:
        db_caso.Estado = nuevo_estado_str # Asignar el string validado
        db.commit()
        db.refresh(db_caso)
        logger.info(f"[Update Estado Caso] Estado del caso ID {caso_id} actualizado a {db_caso.Estado}")
        return db_caso
    except Exception as e:
        db.rollback()
        logger.error(f"[Update Estado Caso] Error al actualizar estado del caso ID {caso_id}. Rollback: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno al actualizar el estado del caso.")

@app.delete("/casos/{caso_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_caso(caso_id: int, db: Session = Depends(get_db)):
    logger.info(f"Solicitud DELETE para caso ID: {caso_id} (con eliminación en cascada)")
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if db_caso is None:
        logger.warning(f"[Delete Caso Casc] Caso con ID {caso_id} no encontrado.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado.")
    try:
        archivos_a_eliminar = db.query(models.ArchivoExcel).filter(models.ArchivoExcel.ID_Caso == caso_id).all()
        logger.info(f"[Delete Caso Casc] Se encontraron {len(archivos_a_eliminar)} archivos asociados al caso {caso_id}.")
        for db_archivo in archivos_a_eliminar:
            archivo_id_actual = db_archivo.ID_Archivo
            nombre_archivo_actual = db_archivo.Nombre_del_Archivo
            logger.info(f"[Delete Caso Casc] Procesando archivo ID: {archivo_id_actual} ({nombre_archivo_actual})")
            lecturas_eliminadas = db.query(models.Lectura).filter(models.Lectura.ID_Archivo == archivo_id_actual).delete(synchronize_session=False)
            logger.info(f"[Delete Caso Casc] {lecturas_eliminadas} lecturas asociadas al archivo {archivo_id_actual} marcadas para eliminar.")
            if nombre_archivo_actual:
                file_path_to_delete = UPLOADS_DIR / nombre_archivo_actual
                if os.path.isfile(file_path_to_delete):
                    try:
                        os.remove(file_path_to_delete)
                        logger.info(f"[Delete Caso Casc] Archivo físico eliminado: {file_path_to_delete}")
                    except OSError as e:
                        logger.error(f"[Delete Caso Casc] Error al eliminar archivo físico {file_path_to_delete}: {e}. Continuando...", exc_info=True)
                else:
                    logger.warning(f"[Delete Caso Casc] Archivo físico no encontrado en {file_path_to_delete}, no se elimina.")
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
    db: Session = Depends(get_db)
):
    # 1. Verificar caso
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if db_caso is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado")

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
def read_archivos_por_caso(caso_id: int, db: Session = Depends(get_db)):
    logger.info(f"GET /casos/{caso_id}/archivos - Obteniendo archivos con conteo de registros.")
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if db_caso is None:
        logger.warning(f"Caso ID {caso_id} no encontrado al buscar archivos.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado")

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
async def download_archivo(id_archivo: int, db: Session = Depends(get_db)):
    logger.info(f"Solicitud de descarga para archivo ID: {id_archivo}")
    archivo_db = db.query(models.ArchivoExcel).filter(models.ArchivoExcel.ID_Archivo == id_archivo).first()
    if archivo_db is None:
        logger.error(f"Registro archivo ID {id_archivo} no encontrado DB.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de archivo no encontrado.")
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
async def delete_archivo(id_archivo: int, db: Session = Depends(get_db)):
    logger.info(f"Solicitud DELETE para archivo ID: {id_archivo}")
    archivo_db = db.query(models.ArchivoExcel).filter(models.ArchivoExcel.ID_Archivo == id_archivo).first()
    if archivo_db is None:
        logger.warning(f"[Delete] Archivo ID {id_archivo} no encontrado.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro archivo no encontrado.")
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
def create_lector(lector: schemas.LectorCreate, db: Session = Depends(get_db)):
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
    db: Session = Depends(get_db)
):
    logger.info(f"Solicitud GET /lectores con filtros: id={id_lector}, nombre={nombre}, carretera={carretera}, provincia={provincia}, organismo={organismo}, sentido={sentido}, sort={sort}, order={order}")
    
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
def read_lectores_coordenadas(db: Session = Depends(get_db)):
    """Devuelve una lista de lectores con coordenadas válidas para el mapa."""
    logger.info("Solicitud GET /lectores/coordenadas")

    # Consultar todos los lectores que tengan Coordenada_X Y Coordenada_Y no nulas
    lectores_con_coords = db.query(models.Lector).filter(
        models.Lector.Coordenada_X.isnot(None),
        models.Lector.Coordenada_Y.isnot(None)
    ).all()

    logger.info(f"Encontrados {len(lectores_con_coords)} lectores con coordenadas válidas.")

    # response_model se encarga de la serialización
    return lectores_con_coords

@app.get("/lectores/sugerencias", response_model=schemas.LectorSugerenciasResponse)
def get_lector_sugerencias(db: Session = Depends(get_db)):
    """Obtiene listas de valores únicos existentes para campos de Lector."""
    logger.info("Solicitud GET /lectores/sugerencias")
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
def read_lector(lector_id: str, db: Session = Depends(get_db)):
    db_lector = db.query(models.Lector).filter(models.Lector.ID_Lector == lector_id).first()
    if db_lector is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lector no encontrado")
    return db_lector

@app.put("/lectores/{lector_id}", response_model=schemas.Lector)
def update_lector(lector_id: str, lector_update: schemas.LectorUpdate, db: Session = Depends(get_db)):
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
def delete_lector(lector_id: str, db: Session = Depends(get_db)):
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
def create_vehiculo(vehiculo: schemas.VehiculoCreate, db: Session = Depends(get_db)):
    """Crea un nuevo vehículo o devuelve el existente si la matrícula ya existe."""
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
def update_vehiculo(vehiculo_id: int, vehiculo_update: schemas.VehiculoUpdate, db: Session = Depends(get_db)):
    """Actualiza los detalles de un vehículo existente por su ID numérico."""
    db_vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.ID_Vehiculo == vehiculo_id).first()
    if not db_vehiculo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Vehículo con ID {vehiculo_id} no encontrado")

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

@app.get("/casos/{caso_id}/vehiculos", response_model=List[schemas.Vehiculo], tags=["Vehículos"])
def get_vehiculos_por_caso(caso_id: int, db: Session = Depends(get_db)):
    """
    Obtiene la lista de vehículos cuyas matrículas aparecen en las lecturas 
    (LPR o GPS) asociadas a los archivos de un caso específico.
    Incluye el conteo de lecturas LPR para cada vehículo DENTRO de este caso.
    """
    # Verificar que el caso existe
    caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if not caso:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Caso con ID {caso_id} no encontrado")

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
    vehiculos_con_conteo = []
    for vehiculo in vehiculos_db:
        # Contar lecturas LPR para esta matrícula DENTRO de este caso
        count_lpr = db.query(func.count(models.Lectura.ID_Lectura))\
                      .join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
                      .filter(
                          models.ArchivoExcel.ID_Caso == caso_id, 
                          models.Lectura.Matricula == vehiculo.Matricula,
                          models.Lectura.Tipo_Fuente == 'LPR' # Solo contar LPR
                      ).scalar() or 0
        
        # Convertir el objeto SQLAlchemy a un diccionario o usar el schema
        vehiculo_schema = schemas.Vehiculo.model_validate(vehiculo, from_attributes=True)
        vehiculo_schema.total_lecturas_lpr_caso = count_lpr # Asignar el conteo
        vehiculos_con_conteo.append(vehiculo_schema)
        logger.debug(f"Vehículo {vehiculo.Matricula}: Conteo LPR en caso {caso_id} = {count_lpr}")
    # --- FIN NUEVO ---
    
    logger.info(f"Encontrados {len(vehiculos_con_conteo)} vehículos para el caso ID {caso_id} con conteo LPR.")
    return vehiculos_con_conteo # Devolver la lista con el conteo añadido

@app.get("/vehiculos/{vehiculo_id}/lecturas", response_model=List[schemas.Lectura], tags=["Vehículos"])
def get_lecturas_por_vehiculo(
    vehiculo_id: int, 
    caso_id: Optional[int] = Query(None, description="ID del caso opcional para filtrar lecturas"), 
    db: Session = Depends(get_db)
):
    """
    Obtiene todas las lecturas (LPR y GPS) asociadas a un vehículo por su ID_Vehiculo.
    Opcionalmente filtra por caso_id si se proporciona.
    """
    db_vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.ID_Vehiculo == vehiculo_id).first()
    if not db_vehiculo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Vehículo con ID {vehiculo_id} no encontrado")

    query = db.query(models.Lectura).filter(models.Lectura.Matricula == db_vehiculo.Matricula)

    if caso_id is not None:
        # Si se proporciona caso_id, necesitamos unir con ArchivoExcel para filtrar
        query = query.join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
                     .filter(models.ArchivoExcel.ID_Caso == caso_id)

    lecturas = query.order_by(models.Lectura.Fecha_y_Hora.asc()).all()
    
    logger.info(f"Encontradas {len(lecturas)} lecturas para el vehículo ID {vehiculo_id} (Matrícula: {db_vehiculo.Matricula})" + (f" en caso ID {caso_id}" if caso_id else ""))
    # Devolvemos las lecturas con el lector asociado cargado (si existe)
    return [schemas.Lectura.model_validate(lect, from_attributes=True) for lect in lecturas]

@app.delete("/vehiculos/{vehiculo_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Vehículos"])
def delete_vehiculo(vehiculo_id: int, db: Session = Depends(get_db)):
    """Elimina un vehículo por su ID numérico."""
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
    payload: schemas.LecturaRelevanteUpdate | None = None, 
    db: Session = Depends(get_db)
):
    """Marca una lectura como relevante, asegurando que pertenezca al caso si se proporciona."""
    db_lectura = db.query(models.Lectura).options(joinedload(models.Lectura.archivo)).filter(models.Lectura.ID_Lectura == id_lectura).first()
    if not db_lectura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lectura no encontrada.")

    # --- Validación de Caso (SI se proporciona caso_id en el payload) ---
    if payload and payload.caso_id is not None:
        if not db_lectura.archivo or db_lectura.archivo.ID_Caso != payload.caso_id:
            # Simplificar f-string
            caso_real = db_lectura.archivo.ID_Caso if db_lectura.archivo else "DESCONOCIDO"
            logger.warning(f"Intento de marcar lectura {id_lectura} (caso real: {caso_real}) como relevante para caso incorrecto ({payload.caso_id}).")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="La lectura no pertenece al caso especificado.")
        else:
             logger.info(f"Validación de caso OK: Lectura {id_lectura} pertenece a caso {payload.caso_id}.")
    # --- Fin Validación --- 
    
    # Verificar si ya está marcada
    db_relevante_existente = db.query(models.LecturaRelevante).filter(models.LecturaRelevante.ID_Lectura == id_lectura).first()
    if db_relevante_existente:
        logger.warning(f"Lectura {id_lectura} ya estaba marcada como relevante.")
        # Actualizar nota si se proporciona
        if payload and payload.Nota is not None:
            db_relevante_existente.Nota = payload.Nota
            db.commit()
            db.refresh(db_relevante_existente)
            return db_relevante_existente
        else:
             return db_relevante_existente

    # Crear nueva entrada
    nueva_relevante = models.LecturaRelevante(
        ID_Lectura=id_lectura,
        Nota=payload.Nota if payload else None
    )
    db.add(nueva_relevante)
    try:
        db.commit()
        db.refresh(nueva_relevante)
        logger.info(f"Lectura {id_lectura} marcada como relevante.")
        return nueva_relevante
    except Exception as e:
        db.rollback()
        logger.error(f"Error al marcar lectura {id_lectura} como relevante: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al marcar la lectura.")


@app.delete("/lecturas/{id_lectura}/desmarcar_relevante", status_code=status.HTTP_204_NO_CONTENT)
def desmarcar_lectura_relevante(id_lectura: int, db: Session = Depends(get_db)):
    """Elimina la marca de relevancia de una lectura."""
    db_relevante = db.query(models.LecturaRelevante).filter(models.LecturaRelevante.ID_Lectura == id_lectura).first()
    if not db_relevante:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="La lectura no estaba marcada como relevante.")

    db.delete(db_relevante)
    try:
        db.commit()
        logger.info(f"Marca de relevante eliminada para lectura {id_lectura}.")
        return None
    except Exception as e:
        db.rollback()
        logger.error(f"Error al desmarcar lectura {id_lectura}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al desmarcar la lectura.")

@app.put("/lecturas_relevantes/{id_relevante}/nota", response_model=schemas.LecturaRelevante)
def actualizar_nota_relevante(id_relevante: int, nota_update: schemas.LecturaRelevanteUpdate, db: Session = Depends(get_db)):
    """Actualiza la nota de una lectura marcada como relevante."""
    db_relevante = db.query(models.LecturaRelevante).filter(models.LecturaRelevante.ID_Relevante == id_relevante).first()
    if not db_relevante:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de lectura relevante no encontrado.")

    # Actualizar la nota (permitir string vacío o null para borrarla)
    db_relevante.Nota = nota_update.Nota
    try:
        db.commit()
        db.refresh(db_relevante)
        logger.info(f"Nota actualizada para LecturaRelevante ID {id_relevante}.")
        return db_relevante
    except Exception as e:
        db.rollback()
        logger.error(f"Error al actualizar nota de LecturaRelevante ID {id_relevante}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al actualizar la nota.")


# === ENDPOINT DE PRUEBA ===
@app.get("/ping")
async def pong():
    logger.info("¡Recibida solicitud GET /ping!")
    return {"message": "pong"}

# --- Para ejecutar con Uvicorn (si no usas un comando externo) ---
# import uvicorn
# if __name__ == "__main__":
#    uvicorn.run(app, host="0.0.0.0", port=8000) 

# --- NUEVO ENDPOINT POST PARA INTERSECCIÓN (Usar schemas.LecturaIntersectionRequest) --- 
@app.post("/lecturas/por_matriculas_y_filtros_combinados", response_model=List[schemas.Lectura])
def read_lecturas_por_matriculas(
    request_data: schemas.LecturaIntersectionRequest, # Usar el schema importado
    db: Session = Depends(get_db)
):
    logger.info(f"POST /lecturas/por_matriculas - Caso ID: {request_data.caso_id}, Matrículas: {len(request_data.matriculas)}, Tipo: {request_data.tipo_fuente}")
    if not request_data.matriculas:
        logger.warning("Se recibió una lista de matrículas vacía.")
        return [] # No hay matrículas para buscar

    try:
        query = db.query(models.Lectura)\
                  .options(joinedload(models.Lectura.lector)) # Eager load lector
        
        # Filtrar por las matrículas proporcionadas
        query = query.filter(models.Lectura.Matricula.in_(request_data.matriculas))

        # Filtrar por tipo de fuente
        query = query.filter(models.Lectura.Tipo_Fuente == request_data.tipo_fuente)

        # Filtrar por caso_id (requiere join)
        query = query.join(models.ArchivoExcel)\
                     .filter(models.ArchivoExcel.ID_Caso == request_data.caso_id)
        
        # Podríamos añadir aquí filtros adicionales si vinieran en el request_data (fechas, etc.)
        
        # Ordenar por fecha/hora para una visualización consistente
        query = query.order_by(models.Lectura.Fecha_y_Hora)

        # Aplicar un límite razonable para evitar sobrecarga si no se implementa paginación aquí
        lecturas = query.limit(10000).all()
        
        logger.info(f"Encontradas {len(lecturas)} lecturas para la intersección.")
        return lecturas
        
    except Exception as e:
        logger.error(f"Error al consultar lecturas por matrículas: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno al buscar lecturas por matrículas.")

# --- NUEVO: Endpoint para obtener filtros disponibles para un caso específico ---
@app.get("/casos/{caso_id}/filtros_disponibles", response_model=schemas.FiltrosDisponiblesResponse)
async def get_filtros_disponibles_por_caso(caso_id: int, db: Session = Depends(get_db)):
    logger.info(f"GET /casos/{caso_id}/filtros_disponibles - Obteniendo lectores y carreteras únicos.")
    try:
        # 1. Encontrar ID_Lector únicos para el caso
        distinct_lector_ids = db.query(models.Lectura.ID_Lector)\
                                .join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
                                .filter(models.ArchivoExcel.ID_Caso == caso_id)\
                                .distinct()\
                                .all()
        
        # Extraer los IDs de la lista de tuplas
        lector_ids_list = [lector_id[0] for lector_id in distinct_lector_ids if lector_id[0] is not None]
        logger.debug(f"Lectores únicos encontrados para caso {caso_id}: {lector_ids_list}")
        
        if not lector_ids_list:
            # Si no hay lecturas/lectores para este caso, devolver listas vacías
            logger.warning(f"No se encontraron lectores con lecturas para el caso {caso_id}.")
            return schemas.FiltrosDisponiblesResponse(lectores=[], carreteras=[])

        # 2. Obtener detalles de esos lectores (incluyendo la carretera)
        lectores_en_caso = db.query(models.Lector)\
                             .filter(models.Lector.ID_Lector.in_(lector_ids_list))\
                             .order_by(models.Lector.Nombre)\
                             .all()

        # 3. Formatear lectores para SelectOption
        lectores_options: List[schemas.SelectOption] = [
            schemas.SelectOption(value=l.ID_Lector, label=f"{l.Nombre or 'Sin Nombre'} ({l.ID_Lector})")
            for l in lectores_en_caso
        ]
        
        # 4. Obtener carreteras únicas de estos lectores y formatear
        carreteras_unicas = sorted(list(set(l.Carretera for l in lectores_en_caso if l.Carretera)))
        carreteras_options: List[schemas.SelectOption] = [
            schemas.SelectOption(value=c, label=c) for c in carreteras_unicas
        ]
        
        logger.info(f"Filtros disponibles para caso {caso_id}: {len(lectores_options)} lectores, {len(carreteras_options)} carreteras.")
        return schemas.FiltrosDisponiblesResponse(lectores=lectores_options, carreteras=carreteras_options)

    except Exception as e:
        logger.error(f"Error al obtener filtros disponibles para caso {caso_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno al obtener filtros disponibles.")

# --- NUEVO: Endpoint para obtener lecturas relevantes por caso ---
@app.get("/casos/{caso_id}/lecturas_relevantes", response_model=List[schemas.Lectura])
async def get_lecturas_relevantes_por_caso(caso_id: int, db: Session = Depends(get_db)):
    """
    Obtiene todas las lecturas marcadas como relevantes para un caso específico.
    """
    logger.info(f"GET /casos/{caso_id}/lecturas_relevantes - Obteniendo lecturas relevantes.")
    try:
        lecturas_relevantes = db.query(models.Lectura)\
            .options(joinedload(models.Lectura.lector), joinedload(models.Lectura.relevancia))\
            .join(models.LecturaRelevante, models.Lectura.ID_Lectura == models.LecturaRelevante.ID_Lectura)\
            .join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
            .filter(models.ArchivoExcel.ID_Caso == caso_id)\
            .order_by(models.Lectura.Fecha_y_Hora)\
            .all()
        
        logger.info(f"Encontradas {len(lecturas_relevantes)} lecturas relevantes para el caso {caso_id}.")
        return lecturas_relevantes

    except Exception as e:
        logger.error(f"Error al obtener lecturas relevantes para caso {caso_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno al obtener lecturas relevantes.")

# === BÚSQUEDAS GUARDADAS ===

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
    db: Session = Depends(get_db)
):
    """
    Obtiene las lecturas de un caso con filtros opcionales.
    """
    logger.info(f"GET /casos/{caso_id}/lecturas - Obteniendo lecturas filtradas.")
    try:
        # Construir la consulta base
        query = db.query(models.Lectura)\
            .join(models.ArchivoExcel, models.Lectura.ID_Archivo == models.ArchivoExcel.ID_Archivo)\
            .filter(models.ArchivoExcel.ID_Caso == caso_id)

        # Aplicar filtros si se proporcionan
        if matricula:
            query = query.filter(models.Lectura.Matricula.like(matricula))

        if fecha_inicio:
            try:
                fecha_inicio_dt = datetime.strptime(fecha_inicio, "%Y-%m-%d").date()
                query = query.filter(models.Lectura.Fecha_y_Hora >= fecha_inicio_dt)
            except ValueError as e:
                logger.error(f"Error al parsear fecha_inicio: {e}")
                raise HTTPException(status_code=400, detail=f"Formato de fecha_inicio inválido: {fecha_inicio}. Use YYYY-MM-DD")

        if fecha_fin:
            try:
                # Añadir 1 día para incluir todo el día final
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

        # Ejecutar la consulta
        lecturas = query.all()
        logger.info(f"Encontradas {len(lecturas)} lecturas para el caso {caso_id}")
        return lecturas

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al obtener lecturas para caso {caso_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno al obtener lecturas del caso")

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
    matricula: Optional[str] = None,
    tipo_fuente: Optional[str] = Query(None),
    solo_relevantes: Optional[bool] = False,
    min_pasos: Optional[int] = None,
    max_pasos: Optional[int] = None,
    db: Session = Depends(get_db)
):
    logger.info(f"POST /lecturas/por_filtros - Filtros: min_pasos={min_pasos} max_pasos={max_pasos} carreteras={carretera_ids}")
    
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

    # Filtro por matrícula (usando el nuevo sistema de patrones)
    if matricula:
        sql_pattern = matricula.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_').replace('?', '_').replace('*', '%')
        base_query = base_query.filter(models.Lectura.Matricula.ilike(sql_pattern))

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

        if matricula:
            pasos_subquery = pasos_subquery.filter(models.Lectura.Matricula.ilike(sql_pattern))

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