from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import Exercise, User, UserRole, Equipment
from app.schemas.schemas import ExerciseCreate, ExerciseOut
from app.api.deps import get_current_user, require_roles

router = APIRouter(prefix="/exercises", tags=["exercises"])

@router.get("", response_model=List[ExerciseOut])
def list_exercises(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exercises = db.query(Exercise).filter(
        Exercise.club_id == current_user.club_id,
        Exercise.is_active == True,
    ).order_by(Exercise.name).all()
    out = []
    for ex in exercises:
        eo = ExerciseOut.model_validate(ex)
        if ex.equipment:
            eo.equipment_name = ex.equipment.name
        out.append(eo)
    return out

@router.post("", response_model=ExerciseOut)
def create_exercise(
    payload: ExerciseCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db)
):
    existing = db.query(Exercise).filter(
        Exercise.club_id == current_user.club_id,
        func.lower(Exercise.name) == payload.name.strip().lower(),
        Exercise.is_active == True,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="An active exercise with this name already exists")
    if payload.equipment_id:
        equipment = db.query(Equipment).filter(
            Equipment.id == payload.equipment_id,
            Equipment.club_id == current_user.club_id,
            Equipment.is_active == True,
        ).first()
        if not equipment:
            raise HTTPException(status_code=400, detail="Equipment not found or archived")
    ex = Exercise(
        club_id=current_user.club_id,
        **{**payload.model_dump(), "name": payload.name.strip()}
    )
    db.add(ex)
    db.commit()
    db.refresh(ex)
    eo = ExerciseOut.model_validate(ex)
    if ex.equipment:
        eo.equipment_name = ex.equipment.name
    return eo

@router.put("/{exercise_id}", response_model=ExerciseOut)
def update_exercise(
    exercise_id: int,
    payload: ExerciseCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db),
):
    ex = db.query(Exercise).filter(
        Exercise.id == exercise_id,
        Exercise.club_id == current_user.club_id,
    ).first()
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")
    duplicate = db.query(Exercise).filter(
        Exercise.club_id == current_user.club_id,
        Exercise.id != exercise_id,
        func.lower(Exercise.name) == payload.name.strip().lower(),
        Exercise.is_active == True,
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="An active exercise with this name already exists")
    if payload.equipment_id:
        equipment = db.query(Equipment).filter(
            Equipment.id == payload.equipment_id,
            Equipment.club_id == current_user.club_id,
            Equipment.is_active == True,
        ).first()
        if not equipment:
            raise HTTPException(status_code=400, detail="Equipment not found or archived")
    for field, value in payload.model_dump().items():
        setattr(ex, field, value)
    ex.name = payload.name.strip()
    db.commit()
    db.refresh(ex)
    result = ExerciseOut.model_validate(ex)
    result.equipment_name = ex.equipment.name if ex.equipment else None
    return result

@router.delete("/{exercise_id}")
def delete_exercise(
    exercise_id: int,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db)
):
    ex = db.query(Exercise).filter(Exercise.id == exercise_id, Exercise.club_id == current_user.club_id).first()
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")
    ex.is_active = False
    db.commit()
    return {"message": "Exercise archived"}
