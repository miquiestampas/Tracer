from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware # Importar middleware CORS
from fastapi.exceptions import RequestValidationError # Importar excepción
from fastapi.responses import JSONResponse, FileResponse # Importar para respuesta personalizada y FileResponse
from fastapi.encoders import jsonable_encoder # Importar para codificar errores
from sqlalchemy.orm import Session
import models, schemas # Importar nuestros modelos y schemas
from database import SessionLocal, engine, get_db # Importar configuración de BD y get_db
import pandas as pd
from io import BytesIO
import datetime
from typing import List, Dict, Any, Optional
import json
from urllib.parse import unquote
import logging # Importar logging
import os # Para trabajar con rutas de archivo
import shutil # Para guardar archivos subidos
import pathlib # Importar pathlib para rutas absolutas
from dateutil import parser # Importar dateutil.parser

# Configurar logging básico para ver más detalles
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Llamar a la función para crear tablas al inicio (si no existen)
models.create_db_and_tables()

app = FastAPI(title="Tracer API", description="API para la aplicación de análisis vehicular Tracer", version="0.1.0")

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
# TEMPORALMENTE PERMISIVO PARA DIAGNÓSTICO
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

# --- Endpoints API REST ---

@app.get("/")
def read_root():
    return {"message": "Bienvenido a la API de Tracer"}

# === CASOS ===
@app.post("/casos", response_model=schemas.Caso, status_code=status.HTTP_201_CREATED)
def create_caso(caso: schemas.CasoCreate, db: Session = Depends(get_db)):
    logger.info(f"Solicitud POST /casos con datos: {caso}")
    # Verificar si ya existe un caso con el mismo nombre y año (opcional)
    existing_caso = db.query(models.Caso).filter(
        models.Caso.Nombre_del_Caso == caso.Nombre_del_Caso,
        models.Caso.Año == caso.Año
    ).first()
    if existing_caso:
        logger.warning(f"Intento de crear caso duplicado: {caso.Nombre_del_Caso} ({caso.Año})")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ya existe un caso con el mismo nombre y año.")

    # Crear instancia del modelo SQLAlchemy explícitamente
    try:
        # Convertir el schema Pydantic a un diccionario
        caso_data = caso.model_dump(exclude_unset=True) 
        
        # Asegurarse de que el estado sea el Enum del modelo si se proporciona,
        # o usar el default del modelo si no.
        estado_enum_del_modelo = models.EstadoCasoEnum.NUEVO # Default del modelo
        if 'Estado' in caso_data and caso_data['Estado'] is not None:
            # Convertir el valor del schema (string) al Enum del modelo
            try:
                estado_enum_del_modelo = models.EstadoCasoEnum(caso_data['Estado']) 
            except ValueError:
                # Si el valor no es válido para el Enum del modelo, lanzar error o usar default?
                # Por ahora, lanzaremos error para ser estrictos.
                logger.error(f"Valor de Estado inválido proporcionado: {caso_data['Estado']}")
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Valor de Estado inválido: {caso_data['Estado']}")
        
        # Crear el objeto del modelo, asignando el Enum del modelo
        db_caso = models.Caso(
            Nombre_del_Caso=caso_data['Nombre_del_Caso'],
            Año=caso_data['Año'],
            NIV=caso_data.get('NIV'),
            Descripcion=caso_data.get('Descripcion'),
            # Fecha_de_Creacion se asigna por default en el modelo
            Estado=estado_enum_del_modelo # Usar el Enum del modelo
        )
        
        db.add(db_caso)
        db.commit() 
        db.refresh(db_caso) # Ahora el refresh debería funcionar
        logger.info(f"Caso creado exitosamente con ID: {db_caso.ID_Caso}")
        return db_caso
    except HTTPException as http_exc:
        # Re-lanzar excepciones HTTP para que FastAPI las maneje
        raise http_exc
    except Exception as e:
        db.rollback()
        logger.error(f"Error al crear el caso: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al crear el caso: {e}")

@app.get("/casos", response_model=List[schemas.Caso])
def read_casos(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    casos = db.query(models.Caso).offset(skip).limit(limit).all()
    return casos

@app.get("/casos/{caso_id}", response_model=schemas.Caso)
def read_caso(caso_id: int, db: Session = Depends(get_db)):
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if db_caso is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado")
    return db_caso

# --- Directorio para guardar archivos subidos (RUTA ABSOLUTA) ---
# Obtiene la ruta del directorio donde está main.py y le añade /uploads
BASE_DIR = pathlib.Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
# Crear el directorio si no existe
os.makedirs(UPLOADS_DIR, exist_ok=True)
logger.info(f"Directorio de subidas configurado en: {UPLOADS_DIR}")

# === ARCHIVOS EXCEL (Importación) - MODIFICADO PARA GUARDAR ARCHIVO ===
# Columna esperadas (pueden variar según tipo de archivo)
COLUMNAS_LPR_ESPERADAS = ['Matricula', 'Fecha y Hora', 'ID_Lector', 'Carril', 'Velocidad', 'Coordenada_X', 'Coordenada_Y']
COLUMNAS_GPS_ESPERADAS = ['Matricula', 'Fecha y Hora', 'Coordenada_X', 'Coordenada_Y', 'Velocidad'] # Ejemplo para GPS

@app.post("/casos/{caso_id}/archivos/upload", response_model=schemas.ArchivoExcel, status_code=status.HTTP_201_CREATED)
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

    # --- GUARDAR ARCHIVO ORIGINAL (usando ruta absoluta) --- 
    # Limpiar nombre de archivo por seguridad (opcional pero recomendado)
    # filename = secure_filename(excel_file.filename) # Necesitarías una función 'secure_filename'
    filename = excel_file.filename # Por ahora usamos el original
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
    # --- FIN GUARDAR ARCHIVO ORIGINAL ---
    
    # 4. Leer Excel desde el archivo guardado (usando ruta absoluta)
    try:
        df = pd.read_excel(file_location)
    except Exception as e:
        # Si falla la lectura, quizás el archivo se guardó mal o está corrupto
        logger.error(f"Error al leer el archivo Excel desde {file_location}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Error al leer el archivo Excel guardado ({filename}). Puede estar corrupto o no ser un Excel válido.")

    # 3. Leer mapeo
    try:
        map_cliente_a_interno = json.loads(column_mapping)
        map_interno_a_cliente = {v: k for k, v in map_cliente_a_interno.items()}
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El mapeo de columnas no es un JSON válido.")

    # 5. Renombrar columnas
    try:
        # Solo intentar renombrar las columnas que existen en el mapeo y en el DataFrame
        columnas_a_renombrar = {k: v for k, v in map_interno_a_cliente.items() if k in df.columns}
        df.rename(columns=columnas_a_renombrar, inplace=True)
    except Exception as e:
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Error al aplicar mapeo de columnas: {e}. Verifica los nombres.")

    # 6. Validar columnas - ACTUALIZADO
    # Usar los campos separados Fecha y Hora
    columnas_obligatorias = ['Matricula', 'Fecha', 'Hora'] 
    if tipo_archivo == 'LPR':
        columnas_obligatorias.append('ID_Lector')
    elif tipo_archivo == 'GPS':
         columnas_obligatorias.extend(['Coordenada_X', 'Coordenada_Y'])

    # Verificar que las columnas mapeadas como obligatorias existen en el DataFrame renombrado
    columnas_obligatorias_faltantes = []
    for campo_interno in columnas_obligatorias:
        if campo_interno not in df.columns:
            # Intentar encontrar qué columna del Excel se mapeó (si existe el mapeo inverso)
            col_excel_mapeada = map_cliente_a_interno.get(campo_interno)
            if col_excel_mapeada:
                 columnas_obligatorias_faltantes.append(f"{campo_interno} (mapeada desde '{col_excel_mapeada}')")
            else:
                 columnas_obligatorias_faltantes.append(f"{campo_interno} (no mapeada)")

    if columnas_obligatorias_faltantes:
        mensaje_error = f"Faltan columnas obligatorias o mapeos incorrectos en el Excel: {', '.join(columnas_obligatorias_faltantes)}"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=mensaje_error)

    # 7. Crear registro ArchivoExcel
    db_archivo = models.ArchivoExcel(
        ID_Caso=caso_id,
        Nombre_del_Archivo=filename, # Guardamos el nombre original (o el 'seguro' si lo implementas)
        Tipo_de_Archivo=tipo_archivo
    )
    db.add(db_archivo)
    db.flush() # Necesario para obtener ID_Archivo si lo usáramos para renombrar
    db.refresh(db_archivo)

    # 8. Procesar e insertar lecturas - ACTUALIZADO para combinar Fecha y Hora
    lecturas_a_insertar = []
    errores_lectura = []
    lectores_no_encontrados = set()

    for index, row in df.iterrows():
        try:
            # Obtener Matricula (obligatoria)
            matricula = str(row['Matricula']).strip() if pd.notna(row['Matricula']) else None
            if not matricula: raise ValueError("Matrícula vacía")

            # --- Combinar Fecha y Hora --- (Implementación básica, necesita robustez)
            valor_fecha_excel = row['Fecha']
            valor_hora_excel = row['Hora']
            fecha_hora_final = None
            try:
                # Intentar convertir a datetime directamente (si Pandas lo hizo bien)
                if isinstance(valor_fecha_excel, datetime.datetime) and isinstance(valor_hora_excel, datetime.time):
                     fecha_hora_final = datetime.datetime.combine(valor_fecha_excel.date(), valor_hora_excel)
                elif isinstance(valor_fecha_excel, datetime.date) and isinstance(valor_hora_excel, datetime.time):
                     fecha_hora_final = datetime.datetime.combine(valor_fecha_excel, valor_hora_excel)
                else: 
                    # Intentar parsear como strings (muy simplificado)
                    fecha_str = str(valor_fecha_excel).split()[0]
                    hora_str = str(valor_hora_excel).split()[-1]
                    # Intentar varios formatos comunes
                    try:
                        fecha_hora_final = pd.to_datetime(f"{fecha_str} {hora_str}", errors='raise')
                    except ValueError:
                        # Intentar otros formatos si es necesario o manejar números de serie Excel
                        # Placeholder: añadir lógica más robusta de parseo aquí
                         raise ValueError("Formato de fecha/hora no reconocido")

                if pd.isna(fecha_hora_final):
                     raise ValueError("Fecha/Hora resultante es inválida")
                 
            except Exception as e_comb:
                 raise ValueError(f"Error combinando/parseando Fecha ({valor_fecha_excel}) y Hora ({valor_hora_excel}): {e_comb}")
            # --- Fin Combinar Fecha y Hora ---

            # Obtener otros campos (Lector, Coords, Opcionales)
            id_lector = None
            coord_x_final = get_optional_float(row.get('Coordenada_X'))
            coord_y_final = get_optional_float(row.get('Coordenada_Y'))

            if tipo_archivo == 'LPR':
                id_lector_str = str(row['ID_Lector']).strip() if pd.notna(row['ID_Lector']) else None
                if not id_lector_str: raise ValueError("Falta ID_Lector para LPR")
                id_lector = id_lector_str # Asignar si es LPR y válido
                # Lógica para buscar lector y usar sus coordenadas si faltan
                db_lector = db.query(models.Lector).filter(models.Lector.ID_Lector == id_lector).first()
                if not db_lector:
                    lectores_no_encontrados.add(id_lector)
                    id_lector = None # Desvincular si no se encuentra
                elif db_lector:
                     if coord_x_final is None: coord_x_final = db_lector.Coordenada_X
                     if coord_y_final is None: coord_y_final = db_lector.Coordenada_Y

            # Obtener opcionales
            carril = get_optional_str(row.get('Carril'))
            velocidad = get_optional_float(row.get('Velocidad'))

            # Crear diccionario de datos para la lectura
            lectura_data = {
                "ID_Archivo": db_archivo.ID_Archivo,
                "Matricula": matricula,
                "Fecha_y_Hora": fecha_hora_final, # Usar el combinado
                "Carril": carril,
                "Velocidad": velocidad,
                "ID_Lector": id_lector,
                "Coordenada_X": coord_x_final,
                "Coordenada_Y": coord_y_final,
                "Tipo_Fuente": tipo_archivo # Añadir el tipo de fuente original (LPR o GPS)
            }
            lecturas_a_insertar.append(models.Lectura(**lectura_data))

        except Exception as e:
            errores_lectura.append({"fila": index + 2, "error": str(e)}) # index+2 por header y 0-index

    # 9. Insertar lecturas
    if lecturas_a_insertar:
        try:
            db.add_all(lecturas_a_insertar)
            db.commit()
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al guardar lecturas en la base de datos: {e}")
    else:
        db.commit()

    # 10. Respuesta
    # Devolver un resumen más detallado podría ser útil
    if errores_lectura:
        # Si hubo errores, devolver 207 Multi-Status o similar con detalles?
        # Por ahora, devolvemos el archivo pero logueamos errores
        logger.warning(f"Importación del archivo {filename} completada con {len(errores_lectura)} errores en filas.")
        logger.warning(f"Errores detallados: {errores_lectura}")
    if lectores_no_encontrados:
         logger.warning(f"Lectores no encontrados durante la importación: {list(lectores_no_encontrados)}")

    return db_archivo # Devolver info del archivo creado

@app.get("/casos/{caso_id}/archivos", response_model=List[schemas.ArchivoExcel])
def read_archivos_por_caso(caso_id: int, db: Session = Depends(get_db)):
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if db_caso is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado")
    archivos = db.query(models.ArchivoExcel).filter(models.ArchivoExcel.ID_Caso == caso_id).all()
    return archivos

# === NUEVO ENDPOINT PARA DESCARGAR ARCHIVO (CON LOGGING MEJORADO) ===
@app.get("/archivos/{id_archivo}/download")
async def download_archivo(id_archivo: int, db: Session = Depends(get_db)):
    logger.info(f"Solicitud de descarga para archivo ID: {id_archivo}")
    # 1. Buscar el registro del archivo en la BD
    archivo_db = db.query(models.ArchivoExcel).filter(models.ArchivoExcel.ID_Archivo == id_archivo).first()

    if archivo_db is None:
        logger.error(f"Registro de archivo con ID {id_archivo} no encontrado en la base de datos.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de archivo no encontrado.")

    # 2. Construir la ruta esperada del archivo guardado (usando ruta absoluta)
    if not archivo_db.Nombre_del_Archivo:
         logger.error(f"El registro del archivo ID {id_archivo} no tiene un nombre de archivo asociado.")
         raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno: falta el nombre del archivo en la base de datos.")
         
    file_path = UPLOADS_DIR / archivo_db.Nombre_del_Archivo
    logger.info(f"[Download] Intentando acceder al archivo en la ruta absoluta: {file_path}")

    # 3. Verificar si el archivo existe en el servidor (con log antes)
    logger.info(f"[Download] Verificando existencia de: {file_path}")
    if not os.path.isfile(file_path):
        logger.error(f"[Download] ¡ERROR! Archivo físico NO encontrado en la ruta: {file_path}")
        # Intentar listar contenido del directorio para depuración
        try:
             contenido_dir = os.listdir(UPLOADS_DIR)
             logger.warning(f"[Download] Contenido actual de {UPLOADS_DIR}: {contenido_dir}")
        except Exception as list_err:
             logger.error(f"[Download] No se pudo listar el contenido de {UPLOADS_DIR}: {list_err}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo original no encontrado en el servidor.")
    else:
        logger.info(f"[Download] Archivo encontrado en: {file_path}")

    # 4. Devolver el archivo usando FileResponse
    media_type = 'application/octet-stream' # Tipo por defecto
    if archivo_db.Nombre_del_Archivo:
        if archivo_db.Nombre_del_Archivo.lower().endswith('.xlsx'):
            media_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        elif archivo_db.Nombre_del_Archivo.lower().endswith('.xls'):
            media_type = 'application/vnd.ms-excel'
        elif archivo_db.Nombre_del_Archivo.lower().endswith('.csv'):
            media_type = 'text/csv'
            
    logger.info(f"[Download] Devolviendo archivo: {file_path} con media_type: {media_type}")
    return FileResponse(
        path=file_path, 
        filename=archivo_db.Nombre_del_Archivo, 
        media_type=media_type
    )

# === NUEVO ENDPOINT PARA ELIMINAR ARCHIVO ===
@app.delete("/archivos/{id_archivo}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_archivo(id_archivo: int, db: Session = Depends(get_db)):
    logger.info(f"Solicitud DELETE para archivo ID: {id_archivo}")
    # 1. Buscar el registro del archivo en la BD
    archivo_db = db.query(models.ArchivoExcel).filter(models.ArchivoExcel.ID_Archivo == id_archivo).first()

    if archivo_db is None:
        logger.warning(f"[Delete] Registro de archivo con ID {id_archivo} no encontrado. No se puede eliminar.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de archivo no encontrado.")

    file_path_to_delete = None
    if archivo_db.Nombre_del_Archivo:
        file_path_to_delete = UPLOADS_DIR / archivo_db.Nombre_del_Archivo
        logger.info(f"[Delete] Ruta de archivo físico a eliminar: {file_path_to_delete}")
    else:
        logger.warning(f"[Delete] El registro del archivo ID {id_archivo} no tiene nombre, no se puede eliminar archivo físico.")

    try:
        # 2. Eliminar lecturas asociadas (IMPORTANTE antes de eliminar el archivo Excel)
        lecturas_eliminadas = db.query(models.Lectura).filter(models.Lectura.ID_Archivo == id_archivo).delete()
        logger.info(f"[Delete] {lecturas_eliminadas} lecturas asociadas al archivo {id_archivo} marcadas para eliminar.")
        # No hacemos commit aún, esperamos a eliminar el archivo y el registro principal
        
        # 3. Eliminar el archivo físico del disco
        if file_path_to_delete and os.path.isfile(file_path_to_delete):
            try:
                os.remove(file_path_to_delete)
                logger.info(f"[Delete] Archivo físico eliminado exitosamente: {file_path_to_delete}")
            except OSError as e:
                # Loguear el error pero continuar para eliminar el registro BD
                logger.error(f"[Delete] Error al eliminar archivo físico {file_path_to_delete}: {e}. Continuando para eliminar registro DB.", exc_info=True)
        elif file_path_to_delete:
             logger.warning(f"[Delete] El archivo físico no existía en {file_path_to_delete}. Solo se eliminará el registro DB.")

        # 4. Eliminar el registro del archivo de la BD
        db.delete(archivo_db)
        logger.info(f"[Delete] Registro ArchivoExcel ID {id_archivo} marcado para eliminar.")

        # 5. Confirmar todos los cambios en la BD
        db.commit()
        logger.info(f"[Delete] Commit realizado. Eliminación completada para archivo ID {id_archivo}.")
        
        # Devolver 204 No Content (implícito por status_code)
        return # Opcionalmente: return JSONResponse(content={"message": "Archivo y lecturas asociadas eliminados"}, status_code=status.HTTP_200_OK)

    except Exception as e:
        db.rollback()
        logger.error(f"[Delete] Error durante la eliminación del archivo ID {id_archivo}. Rollback realizado: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al intentar eliminar el archivo: {e}")

# === MODIFICADO ENDPOINT PARA ELIMINAR CASO (CON CASCADA) ===
@app.delete("/casos/{caso_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_caso(caso_id: int, db: Session = Depends(get_db)):
    logger.info(f"Solicitud DELETE para caso ID: {caso_id} (con eliminación en cascada)")
    # 1. Buscar el caso en la BD
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()

    if db_caso is None:
        logger.warning(f"[Delete Caso Casc] Caso con ID {caso_id} no encontrado.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado.")

    try:
        # 2. Encontrar todos los archivos asociados al caso
        archivos_a_eliminar = db.query(models.ArchivoExcel).filter(models.ArchivoExcel.ID_Caso == caso_id).all()
        logger.info(f"[Delete Caso Casc] Se encontraron {len(archivos_a_eliminar)} archivos asociados al caso {caso_id}.")

        for db_archivo in archivos_a_eliminar:
            archivo_id_actual = db_archivo.ID_Archivo
            nombre_archivo_actual = db_archivo.Nombre_del_Archivo
            logger.info(f"[Delete Caso Casc] Procesando archivo ID: {archivo_id_actual} ({nombre_archivo_actual})")

            # 2.1 Eliminar lecturas asociadas a este archivo
            lecturas_eliminadas = db.query(models.Lectura).filter(models.Lectura.ID_Archivo == archivo_id_actual).delete(synchronize_session=False)
            logger.info(f"[Delete Caso Casc] {lecturas_eliminadas} lecturas asociadas al archivo {archivo_id_actual} marcadas para eliminar.")

            # 2.2 Eliminar el archivo físico
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

            # 2.3 Eliminar el registro ArchivoExcel
            db.delete(db_archivo)
            logger.info(f"[Delete Caso Casc] Registro ArchivoExcel ID {archivo_id_actual} marcado para eliminar.")
            # Hacemos flush para procesar la eliminación antes de seguir, por si hay dependencias?
            # Opcional: db.flush()

        # 3. Eliminar el caso mismo
        db.delete(db_caso)
        logger.info(f"[Delete Caso Casc] Caso ID {caso_id} marcado para eliminar.")

        # 4. Confirmar todos los cambios en la BD
        db.commit()
        logger.info(f"[Delete Caso Casc] Commit realizado. Eliminación completada para caso ID {caso_id} y sus asociados.")
        
        return None # Devuelve 204 No Content

    except Exception as e:
        db.rollback()
        logger.error(f"[Delete Caso Casc] Error durante la eliminación del caso ID {caso_id}. Rollback realizado: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error interno al intentar eliminar el caso y sus asociados: {e}")

# === LECTORES ===
@app.post("/lectores", response_model=schemas.Lector, status_code=status.HTTP_201_CREATED)
def create_lector(lector: schemas.LectorCreate, db: Session = Depends(get_db)):
    db_lector_existente = db.query(models.Lector).filter(models.Lector.ID_Lector == lector.ID_Lector).first()
    if db_lector_existente:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Ya existe un lector con el ID '{lector.ID_Lector}'")
    db_lector = models.Lector(**lector.dict())
    db.add(db_lector)
    db.commit()
    db.refresh(db_lector)
    return db_lector

@app.get("/lectores", response_model=List[schemas.Lector])
def read_lectores(skip: int = 0, limit: int = 1000, db: Session = Depends(get_db)):
    lectores = db.query(models.Lector).offset(skip).limit(limit).all()
    return lectores

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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lector no encontrado")

    update_data = lector_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_lector, key, value)

    db.commit()
    db.refresh(db_lector)
    return db_lector

@app.delete("/lectores/{lector_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lector(lector_id: str, db: Session = Depends(get_db)):
    db_lector = db.query(models.Lector).filter(models.Lector.ID_Lector == lector_id).first()
    if db_lector is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lector no encontrado")

    lecturas_asociadas = db.query(models.Lectura).filter(models.Lectura.ID_Lector == lector_id).count()
    if lecturas_asociadas > 0:
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"No se puede eliminar el lector '{lector_id}' porque tiene {lecturas_asociadas} lecturas asociadas.")

    db.delete(db_lector)
    db.commit()
    return None

# === VEHICULOS ===
@app.post("/vehiculos", response_model=schemas.Vehiculo, status_code=status.HTTP_201_CREATED)
def create_vehiculo(vehiculo: schemas.VehiculoCreate, db: Session = Depends(get_db)):
    db_vehiculo_existente = db.query(models.Vehiculo).filter(models.Vehiculo.Matricula == vehiculo.Matricula).first()
    if db_vehiculo_existente:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Ya existe un vehículo con la matrícula '{vehiculo.Matricula}'")

    vehiculo_data = vehiculo.dict()
    db_vehiculo = models.Vehiculo(**vehiculo_data)
    db.add(db_vehiculo)
    db.commit()
    db.refresh(db_vehiculo)
    return db_vehiculo

@app.get("/vehiculos", response_model=List[schemas.Vehiculo])
def read_vehiculos(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    vehiculos = db.query(models.Vehiculo).offset(skip).limit(limit).all()
    return vehiculos

@app.get("/vehiculos/{matricula}", response_model=schemas.Vehiculo)
def read_vehiculo(matricula: str, db: Session = Depends(get_db)):
    matricula_decoded = unquote(matricula)
    db_vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.Matricula == matricula_decoded).first()
    if db_vehiculo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehículo no encontrado")
    return db_vehiculo

@app.put("/vehiculos/{matricula}", response_model=schemas.Vehiculo)
def update_vehiculo(matricula: str, vehiculo_update: schemas.VehiculoUpdate, db: Session = Depends(get_db)):
    matricula_decoded = unquote(matricula)
    db_vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.Matricula == matricula_decoded).first()
    if db_vehiculo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehículo no encontrado")

    update_data = vehiculo_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        if key == 'Matricula': continue
        setattr(db_vehiculo, key, value)

    db.commit()
    db.refresh(db_vehiculo)
    return db_vehiculo

@app.delete("/vehiculos/{matricula}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehiculo(matricula: str, db: Session = Depends(get_db)):
    matricula_decoded = unquote(matricula)
    db_vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.Matricula == matricula_decoded).first()
    if db_vehiculo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehículo no encontrado")

    db.delete(db_vehiculo)
    db.commit()
    return None

# === LECTURAS ===
# Función auxiliar para parsear fechas flexibles
def parse_flexible_datetime(dt_str: Optional[str]) -> Optional[datetime.datetime]:
    if not dt_str: return None
    try:
        # dateutil.parser es bueno manejando varios formatos, incluyendo ISO 8601 y YYYY-MM-DD
        # ignoretz=True puede ser útil si no te importa la zona horaria del cliente
        return parser.parse(dt_str)
    except (ValueError, OverflowError, TypeError) as e:
        logger.warning(f"No se pudo parsear la fecha/hora: '{dt_str}'. Error: {e}")
        return None

@app.get("/lecturas", response_model=List[schemas.Lectura])
def read_lecturas(
    skip: int = 0,
    limit: int = 1000, # Mantener límite por defecto
    caso_id: Optional[int] = None,
    archivo_id: Optional[int] = None,
    matricula: Optional[str] = None,
    # Cambiar a parámetros de fecha/hora combinados y añadir tipo_fuente
    fecha_hora_inicio: Optional[str] = None, # Esperar ISO string o YYYY-MM-DD
    fecha_hora_fin: Optional[str] = None,
    lector_id: Optional[str] = None, 
    tipo_fuente: Optional[str] = None, # Filtro por tipo de fuente
    db: Session = Depends(get_db)
):
    # Loguear todos los filtros recibidos
    logger.info(
        f"Solicitud GET /lecturas con filtros: "
        f"caso_id={caso_id}, archivo_id={archivo_id}, matricula={matricula}, "
        f"fecha_hora_inicio='{fecha_hora_inicio}', fecha_hora_fin='{fecha_hora_fin}', lector_id={lector_id}, "
        f"tipo_fuente={tipo_fuente}, skip={skip}, limit={limit}"
    )
    query = db.query(models.Lectura)

    # Aplicar filtros
    if caso_id is not None:
        query = query.join(models.ArchivoExcel).filter(models.ArchivoExcel.ID_Caso == caso_id)
        logger.info(f"Filtrando lecturas por caso_id: {caso_id}")

    if archivo_id is not None:
        query = query.filter(models.Lectura.ID_Archivo == archivo_id)
        logger.info(f"Filtrando lecturas por archivo_id: {archivo_id}")

    if matricula:
        matricula_decoded = unquote(matricula).strip()
        query = query.filter(models.Lectura.Matricula.ilike(f"%{matricula_decoded}%"))
        logger.info(f"Filtrando lecturas por matricula (ilike): {matricula_decoded}")

    # --- FILTROS MODIFICADOS --- 
    dt_inicio = parse_flexible_datetime(fecha_hora_inicio)
    dt_fin = parse_flexible_datetime(fecha_hora_fin)

    if dt_inicio:
        query = query.filter(models.Lectura.Fecha_y_Hora >= dt_inicio)
        logger.info(f"Filtrando lecturas desde fecha/hora: {dt_inicio}")

    if dt_fin:
        # Si dt_fin no tiene hora (solo fecha), ajustar para incluir todo el día
        if dt_fin.hour == 0 and dt_fin.minute == 0 and dt_fin.second == 0:
            dt_fin_ajustado = dt_fin + datetime.timedelta(days=1)
            query = query.filter(models.Lectura.Fecha_y_Hora < dt_fin_ajustado)
            logger.info(f"Filtrando lecturas hasta fecha (fin del día): {dt_fin}")
        else:
             query = query.filter(models.Lectura.Fecha_y_Hora <= dt_fin)
             logger.info(f"Filtrando lecturas hasta fecha/hora: {dt_fin}")

    if lector_id:
        lector_id_stripped = lector_id.strip()
        query = query.filter(models.Lectura.ID_Lector.ilike(f"%{lector_id_stripped}%"))
        logger.info(f"Filtrando lecturas por lector_id (ilike): {lector_id_stripped}")
        
    if tipo_fuente:
        tipo_fuente_stripped = tipo_fuente.strip().upper() # Asegurar mayúsculas
        if tipo_fuente_stripped in ['LPR', 'GPS']: # Validar valores
             query = query.filter(models.Lectura.Tipo_Fuente == tipo_fuente_stripped)
             logger.info(f"Filtrando lecturas por tipo_fuente: {tipo_fuente_stripped}")
        else:
            logger.warning(f"Valor de tipo_fuente inválido recibido: '{tipo_fuente}'. Se ignora filtro.")
    # --- FIN FILTROS MODIFICADOS ---

    # Aplicar paginación y ordenación
    lecturas = query.order_by(models.Lectura.Fecha_y_Hora.desc()).offset(skip).limit(limit).all()
    logger.info(f"Devolviendo {len(lecturas)} lecturas.")
    return lecturas

# --- Helper functions (si las necesitas para la importación) ---
def get_optional_float(value):
    try: return float(value) if pd.notna(value) else None
    except (ValueError, TypeError): return None

def get_optional_str(value):
    return str(value).strip() if pd.notna(value) else None

# --- NUEVO ENDPOINT PARA ACTUALIZAR ESTADO DEL CASO ---
@app.put("/casos/{caso_id}/estado", response_model=schemas.Caso)
def update_caso_estado(caso_id: int, estado_update: schemas.CasoEstadoUpdate, db: Session = Depends(get_db)):
    logger.info(f"Solicitud PUT para actualizar estado del caso ID: {caso_id} a {estado_update.Estado.value}")
    db_caso = db.query(models.Caso).filter(models.Caso.ID_Caso == caso_id).first()
    if db_caso is None:
        logger.warning(f"[Update Estado Caso] Caso con ID {caso_id} no encontrado.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caso no encontrado")

    # Actualizar solo el estado
    try:
        db_caso.Estado = estado_update.Estado # Asignar el valor del Enum
        db.commit()
        db.refresh(db_caso)
        logger.info(f"[Update Estado Caso] Estado del caso ID {caso_id} actualizado a {db_caso.Estado.value}")
        return db_caso
    except Exception as e:
        db.rollback()
        logger.error(f"[Update Estado Caso] Error al actualizar estado del caso ID {caso_id}. Rollback: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno al actualizar el estado del caso.")

# --- Para ejecutar con Uvicorn (si no usas un comando externo) ---
# import uvicorn
# if __name__ == "__main__":
#    uvicorn.run(app, host="0.0.0.0", port=8000) 