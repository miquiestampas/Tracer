from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, create_engine
import os
import shutil
from datetime import datetime
from typing import List, Optional
import json
import logging
import hashlib
from pydantic import BaseModel

from database import SessionLocal, engine, Base
import models

router = APIRouter(
    prefix="/api/admin/database",
    tags=["admin"],
    responses={404: {"description": "Not found"}},
)

logger = logging.getLogger("admin.database_manager")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_backups_list():
    """Obtiene la lista de backups disponibles"""
    backup_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backups')
    if not os.path.exists(backup_dir):
        return []
    
    backups = []
    for f in os.listdir(backup_dir):
        if f.startswith('tracer_backup_'):
            full_path = os.path.join(backup_dir, f)
            timestamp = f.replace('tracer_backup_', '').replace('.db', '')
            backups.append({
                "filename": f,
                "path": full_path,
                "timestamp": timestamp,
                "size_bytes": os.path.getsize(full_path),
                "created_at": datetime.strptime(timestamp, "%Y%m%d_%H%M%S").isoformat()
            })
    
    return sorted(backups, key=lambda x: x["timestamp"], reverse=True)

@router.get("/backups")
def list_backups():
    """Lista todos los backups disponibles"""
    try:
        backups = get_backups_list()
        return {"backups": backups}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status")
def get_database_status(db: Session = Depends(get_db)):
    """Obtiene el estado actual de la base de datos"""
    try:
        # Obtener información de las tablas
        tables = []
        for table in Base.metadata.tables:
            count = db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            tables.append({
                "name": table,
                "count": count
            })
        
        # Obtener tamaño del archivo de la base de datos
        db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tracer.db')
        size_bytes = os.path.getsize(db_path) if os.path.exists(db_path) else 0
        
        # Obtener lista de backups
        backups = get_backups_list()
        last_backup = backups[0]["created_at"] if backups else None
        
        return {
            "status": "active",
            "tables": tables,
            "size_bytes": size_bytes,
            "last_backup": last_backup,
            "backups_count": len(backups)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/backup")
def create_backup(background_tasks: BackgroundTasks):
    """Crea una copia de seguridad de la base de datos"""
    try:
        db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tracer.db')
        backup_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backups')
        
        os.makedirs(backup_dir, exist_ok=True)
        
        # Forzar un checkpoint para asegurar que los datos del WAL se escriban al archivo .db principal
        try:
            with engine.connect() as connection:
                # Usar TRUNCATE es generalmente bueno. FULL es otra opción más agresiva.
                connection.execute(text("PRAGMA wal_checkpoint(TRUNCATE);"))
                connection.commit() # Asegurar que el pragma se ejecute y complete
            logger.info("WAL checkpoint TRUNCATE ejecutado antes del backup.")
        except Exception as e_checkpoint:
            logger.error(f"Error al ejecutar WAL checkpoint: {e_checkpoint}", exc_info=True)
            # Considerar si esto debe ser un error fatal para el backup. Por ahora, solo loguear.

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(backup_dir, f'tracer_backup_{timestamp}.db')
        
        shutil.copy2(db_path, backup_path)
        
        return {"message": "Backup creado exitosamente", "backup_path": backup_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/restore")
async def restore_database(backup_file: UploadFile = File(...)):
    """Restaura la base de datos desde un archivo de backup"""
    try:
        db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tracer.db')
        temp_path = f"temp_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
        with open(temp_path, "wb") as buffer:
            content = await backup_file.read()
            buffer.write(content)

        # Calcular y loguear el hash MD5 del archivo temporal
        hasher = hashlib.md5()
        with open(temp_path, 'rb') as f_hash:
            buf = f_hash.read()
            hasher.update(buf)
        temp_file_hash = hasher.hexdigest()
        logger.info(f"MD5 hash del archivo temporal ({temp_path}): {temp_file_hash}")
        
        logger.info(f"Archivo recibido para restaurar: {backup_file.filename}, tamaño: {os.path.getsize(temp_path)} bytes")
        try:
            test_engine = create_engine(f"sqlite:///{temp_path}")
            conn = test_engine.connect()
            conn.close()
            test_engine.dispose()
        except Exception as e:
            logger.error(f"Archivo subido no es una base de datos SQLite válida: {e}")
            os.remove(temp_path)
            raise HTTPException(status_code=400, detail="El archivo no es una base de datos SQLite válida")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        current_backup = f"pre_restore_backup_{timestamp}.db"
        shutil.copy2(db_path, current_backup)
        shutil.copy2(temp_path, db_path)
        os.remove(temp_path)

        # Forzar al motor principal de SQLAlchemy a cerrar las conexiones existentes
        # para que las nuevas solicitudes lean el archivo de base de datos restaurado.
        try:
            from database import engine as main_app_engine # Asegurar que usamos el motor correcto
            logger.info("Intentando disponer del motor principal de SQLAlchemy (upload)...")
            main_app_engine.dispose()
            logger.info("Motor principal de SQLAlchemy dispuesto (upload).")

            logger.info("Intentando operación de lectura post-dispose para refrescar el pool (upload)...")
            with main_app_engine.connect() as connection:
                result = connection.execute(text("SELECT sqlite_version();")).scalar()
                logger.info(f"Operación de lectura post-dispose exitosa (upload). Versión de SQLite: {result}")

        except Exception as e_dispose_refresh:
            logger.error(f"Error durante el dispose/refresh del motor principal (upload): {e_dispose_refresh}", exc_info=True)

        # Verificar el estado de la base de datos inmediatamente después de la restauración
        final_counts_upload = {}
        try:
            logger.info("Verificando conteos post-restauración (upload) inmediatamente...")
            with SessionLocal() as db_check: 
                tables_to_check = ["usuarios", "Grupos", "Casos"]
                for table_name in tables_to_check:
                    if table_name in Base.metadata.tables:
                        count = db_check.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one_or_none()
                        final_counts_upload[table_name] = count
                        logger.info(f"Conteo post-restauración (upload) para tabla '{table_name}': {count}")
                    else:
                        logger.warning(f"Tabla '{table_name}' no encontrada en metadatos para conteo post-restauración (upload).")
        except Exception as e_check:
            logger.error(f"Error al verificar conteos post-restauración (upload): {e_check}", exc_info=True)

        response_message_upload = f"Base de datos restaurada exitosamente. Conteos (ver logs): {json.dumps(final_counts_upload)}"
        return {"message": response_message_upload, "final_counts_debug": final_counts_upload}
    except Exception as e:
        logger.error(f"Error inesperado al restaurar la base de datos: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/tables/{table_name}")
def delete_table_data(table_name: str, db: Session = Depends(get_db)):
    """Elimina todos los datos de una tabla específica"""
    try:
        if table_name not in Base.metadata.tables:
            raise HTTPException(status_code=404, detail="Tabla no encontrada")
        
        # Eliminar todos los registros de la tabla
        db.execute(text(f"DELETE FROM {table_name}"))
        db.commit()
        
        return {"message": f"Datos de la tabla {table_name} eliminados exitosamente"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reset")
def reset_database(db: Session = Depends(get_db)):
    """Reinicia la base de datos eliminando todas las tablas y creándolas de nuevo"""
    try:
        # Crear backup antes de resetear
        create_backup(BackgroundTasks())
        # Eliminar todas las tablas
        Base.metadata.drop_all(bind=engine)
        # Crear las tablas nuevamente
        Base.metadata.create_all(bind=engine)
        # Ejecutar VACUUM para compactar la base de datos
        db.execute(text("VACUUM"))
        db.commit()
        return {"message": "Base de datos reiniciada exitosamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def get_last_backup_date():
    """Obtiene la fecha del último backup realizado"""
    backup_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backups')
    if not os.path.exists(backup_dir):
        return None
    
    backups = [f for f in os.listdir(backup_dir) if f.startswith('tracer_backup_')]
    if not backups:
        return None
    
    latest_backup = max(backups)
    return latest_backup.replace('tracer_backup_', '').replace('.db', '')

@router.get("/backups/{filename}/download")
async def download_backup(filename: str):
    """Descarga un archivo de backup específico"""
    try:
        backup_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backups')
        backup_path = os.path.join(backup_dir, filename)
        
        if not os.path.exists(backup_path):
            raise HTTPException(status_code=404, detail="Backup no encontrado")
        
        return FileResponse(
            backup_path,
            media_type='application/octet-stream',
            filename=filename
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/clear_except_lectores")
def clear_except_lectores(db: Session = Depends(get_db)):
    """Elimina todos los datos de todas las tablas excepto la de lectores."""
    try:
        lector_table = 'lector'
        for table in Base.metadata.tables:
            if table != lector_table:
                db.execute(text(f"DELETE FROM {table}"))
        db.commit()
        # Ejecutar VACUUM para compactar la base de datos
        db.execute(text("VACUUM"))
        db.commit()
        return {"message": "Todos los datos (excepto lectores) eliminados exitosamente"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/backups/{filename}")
def delete_backup(filename: str):
    """Elimina un archivo de backup específico."""
    try:
        backup_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backups')
        backup_path = os.path.join(backup_dir, filename)
        if not os.path.exists(backup_path):
            raise HTTPException(status_code=404, detail="Backup no encontrado")
        os.remove(backup_path)
        return {"message": f"Backup {filename} eliminado correctamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Modelo Pydantic para el request body de restore_from_filename
class RestoreRequest(BaseModel):
    filename: str

@router.post("/restore_from_filename")
async def restore_database_from_filename(request_data: RestoreRequest):
    """Restaura la base de datos desde un archivo de backup existente en el servidor por su nombre."""
    backup_filename = request_data.filename
    logger.info(f"Solicitud para restaurar desde el archivo en servidor: {backup_filename}")

    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tracer.db')
    backup_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backups')
    source_backup_path = os.path.join(backup_dir, backup_filename)

    if not os.path.exists(source_backup_path):
        logger.error(f"Archivo de backup no encontrado en el servidor: {source_backup_path}")
        raise HTTPException(status_code=404, detail=f"Archivo de backup '{backup_filename}' no encontrado en el servidor.")

    try:
        # Verificar que el archivo de backup es una BD SQLite válida
        try:
            test_engine = create_engine(f"sqlite:///{source_backup_path}")
            conn = test_engine.connect()
            conn.close()
            test_engine.dispose()
            logger.info(f"Archivo de backup '{backup_filename}' es una BD SQLite válida.")
        except Exception as e_test:
            logger.error(f"Archivo de backup '{backup_filename}' no es una BD SQLite válida: {e_test}")
            raise HTTPException(status_code=400, detail=f"El archivo de backup seleccionado ('{backup_filename}') no es una base de datos SQLite válida.")

        # Crear un backup del estado actual ANTES de restaurar
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        pre_restore_backup_name = f"pre_restore_backup_{timestamp}.db"
        pre_restore_backup_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), pre_restore_backup_name)
        shutil.copy2(db_path, pre_restore_backup_path)
        logger.info(f"Backup pre-restauración creado: {pre_restore_backup_name}")

        # Restaurar: copiar el archivo de backup de origen sobre el archivo de BD principal
        shutil.copy2(source_backup_path, db_path)
        logger.info(f"Base de datos restaurada desde '{backup_filename}' a '{db_path}'.")

        # Forzar al motor principal de SQLAlchemy a cerrar las conexiones existentes
        try:
            from database import engine as main_app_engine
            logger.info(f"Intentando disponer del motor principal de SQLAlchemy (filename: {backup_filename})...")
            main_app_engine.dispose()
            logger.info(f"Motor principal de SQLAlchemy dispuesto (filename: {backup_filename}).")

            logger.info(f"Intentando operación de lectura post-dispose para refrescar el pool (filename: {backup_filename})...")
            with main_app_engine.connect() as connection:
                result = connection.execute(text("SELECT sqlite_version();")).scalar()
                logger.info(f"Operación de lectura post-dispose exitosa (filename: {backup_filename}). Versión de SQLite: {result}")

        except Exception as e_dispose_refresh:
            logger.error(f"Error durante el dispose/refresh del motor principal (filename: {backup_filename}): {e_dispose_refresh}", exc_info=True)

        # Verificar el estado de la base de datos inmediatamente después de la restauración
        final_counts_filename = {}
        try:
            logger.info(f"Verificando conteos post-restauración (filename: {backup_filename}) inmediatamente...")
            with SessionLocal() as db_check:
                tables_to_check = ["usuarios", "Grupos", "Casos"] 
                for table_name in tables_to_check:
                    if table_name in Base.metadata.tables:
                        count = db_check.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one_or_none()
                        final_counts_filename[table_name] = count
                        logger.info(f"Conteo post-restauración (filename: {backup_filename}) para tabla '{table_name}': {count}")
                    else:
                        logger.warning(f"Tabla '{table_name}' no encontrada en metadatos para conteo post-restauración (filename: {backup_filename}).")
        except Exception as e_check:
            logger.error(f"Error al verificar conteos post-restauración (filename: {backup_filename}): {e_check}", exc_info=True)
        
        response_message_filename = f"Base de datos restaurada exitosamente desde '{backup_filename}'. Conteos (ver logs): {json.dumps(final_counts_filename)}"
        return {"message": response_message_filename, "final_counts_debug": final_counts_filename}
    except HTTPException: # Re-raise HTTPExceptions para que FastAPI las maneje
        raise
    except Exception as e:
        logger.error(f"Error inesperado al restaurar la base de datos desde '{backup_filename}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error inesperado al restaurar desde '{backup_filename}': {str(e)}") 