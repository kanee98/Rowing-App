from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import Equipment, User, UserRole
from app.schemas.schemas import EquipmentCreate, EquipmentOut
from app.api.deps import get_current_user, require_roles
from app.models.operations import Crew, Reservation, DamageReport
from app.services.club_operations import lock_club

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
    lock_club(db, current_user)
    item = db.query(Equipment).filter(Equipment.id == equipment_id, Equipment.club_id == current_user.club_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    if payload.status == 'available' and db.query(DamageReport).filter(DamageReport.equipment_id == item.id, DamageReport.severity == 'grounded', DamageReport.resolved_at.is_(None)).first():
        raise HTTPException(409, detail='Resolve all grounding damage reports in Operations before returning equipment to service')
    if payload.category != item.category and db.query(Crew).filter(Crew.equipment_id == item.id, Crew.is_active == True).first():
        raise HTTPException(409, detail='This boat has saved crews. Create a separate equipment record for a different boat class.')
    if (not payload.is_active or payload.status != 'available') and db.query(Reservation).filter(Reservation.equipment_id == item.id, Reservation.status == 'booked').first():
        raise HTTPException(409, detail='Cancel active reservations before changing equipment availability. Report damage in Operations to ground it immediately.')
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
    lock_club(db, current_user)
    item = db.query(Equipment).filter(Equipment.id == equipment_id, Equipment.club_id == current_user.club_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    if db.query(Reservation).filter(Reservation.equipment_id == item.id, Reservation.status == 'booked').first():
        raise HTTPException(409, detail='Cancel active reservations before archiving equipment')
    item.is_active = False
    db.commit()
    return {"message": "Equipment archived"}
