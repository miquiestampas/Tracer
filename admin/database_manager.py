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
        
        # Crear directorio de backups si no existe
        os.makedirs(backup_dir, exist_ok=True)
        
        # Generar nombre del archivo de backup con timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(backup_dir, f'tracer_backup_{timestamp}.db')
        
        # Copiar archivo de base de datos
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
        return {"message": "Base de datos restaurada exitosamente"}
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