from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from models import GpsCapa
from schemas import GpsCapaCreate, GpsCapaUpdate, GpsCapaOut
from database import get_db

router = APIRouter()

@router.get("/casos/{caso_id}/gps-capas", response_model=List[GpsCapaOut])
def get_gps_capas(caso_id: int, db: Session = Depends(get_db)):
    return db.query(GpsCapa).filter(GpsCapa.caso_id == caso_id).all()

@router.post("/casos/{caso_id}/gps-capas", response_model=GpsCapaOut, status_code=201)
def create_gps_capa(caso_id: int, capa: GpsCapaCreate, db: Session = Depends(get_db)):
    db_capa = GpsCapa(**capa.dict(), caso_id=caso_id)
    db.add(db_capa)
    db.commit()
    db.refresh(db_capa)
    return db_capa

@router.put("/casos/{caso_id}/gps-capas/{capa_id}", response_model=GpsCapaOut)
def update_gps_capa(caso_id: int, capa_id: int, capa: GpsCapaUpdate, db: Session = Depends(get_db)):
    db_capa = db.query(GpsCapa).filter(GpsCapa.id == capa_id, GpsCapa.caso_id == caso_id).first()
    if not db_capa:
        raise HTTPException(status_code=404, detail="Capa no encontrada")
    for key, value in capa.dict().items():
        setattr(db_capa, key, value)
    db.commit()
    db.refresh(db_capa)
    return db_capa

@router.delete("/casos/{caso_id}/gps-capas/{capa_id}", status_code=204)
def delete_gps_capa(caso_id: int, capa_id: int, db: Session = Depends(get_db)):
    db_capa = db.query(GpsCapa).filter(GpsCapa.id == capa_id, GpsCapa.caso_id == caso_id).first()
    if not db_capa:
        raise HTTPException(status_code=404, detail="Capa no encontrada")
    db.delete(db_capa)
    db.commit()
    return 