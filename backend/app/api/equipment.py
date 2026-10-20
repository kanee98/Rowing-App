from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import Equipment, User, UserRole
from app.schemas.schemas import EquipmentCreate, EquipmentOut
from app.api.deps import get_current_user, require_roles

router = APIRouter(prefix="/equipment", tags=["equipment"])

@router.get("", response_model=List[EquipmentOut])
def list_equipment(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    items = db.query(Equipment).filter(
        Equipment.club_id == current_user.club_id,
        Equipment.is_active == True,
    ).order_by(Equipment.name).all()
    return items

@router.post("", response_model=EquipmentOut)
def create_equipment(
    payload: EquipmentCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db)
):
    existing = db.query(Equipment).filter(
        Equipment.club_id == current_user.club_id,
        func.lower(Equipment.name) == payload.name.strip().lower(),
        Equipment.is_active == True,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Active equipment with this name already exists")
    item = Equipment(
        club_id=current_user.club_id,
        **{**payload.model_dump(), "name": payload.name.strip()}
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@router.put("/{equipment_id}", response_model=EquipmentOut)
def update_equipment(
    equipment_id: int,
    payload: EquipmentCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH, UserRole.TRAINER])),
    db: Session = Depends(get_db)
):
    item = db.query(Equipment).filter(Equipment.id == equipment_id, Equipment.club_id == current_user.club_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    duplicate = db.query(Equipment).filter(
        Equipment.club_id == current_user.club_id,
        Equipment.id != equipment_id,
        func.lower(Equipment.name) == payload.name.strip().lower(),
        Equipment.is_active == True,
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Active equipment with this name already exists")
    
    for field, val in payload.model_dump().items():
        setattr(item, field, val)
    item.name = payload.name.strip()
    db.commit()
    db.refresh(item)
    return item

@router.delete("/{equipment_id}")
def delete_equipment(
    equipment_id: int,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db)
):
    item = db.query(Equipment).filter(Equipment.id == equipment_id, Equipment.club_id == current_user.club_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    item.is_active = False
    db.commit()
    return {"message": "Equipment archived"}
