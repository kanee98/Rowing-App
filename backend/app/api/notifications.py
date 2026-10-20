from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.models import User, UserRole, Notification, NotificationType
from app.schemas.schemas import (
    NotificationOut, NotificationListResponse, NotificationBroadcastRequest
)

router = APIRouter(prefix="/notifications", tags=["notifications"])

def dispatch_notification(
    db: Session,
    user_id: int,
    club_id: int,
    title: str,
    message: str,
    notif_type: str = "announcement",
    link_action: Optional[str] = None
) -> Notification:
    """Helper to dispatch an in-app notification to a single user"""
    notif = Notification(
        user_id=user_id,
        club_id=club_id,
        title=title,
        message=message,
        type=notif_type,
        link_action=link_action,
        is_read=False,
        created_at=datetime.utcnow()
    )
    db.add(notif)
    return notif

def dispatch_club_notification(
    db: Session,
    club_id: int,
    title: str,
    message: str,
    notif_type: str = "announcement",
    link_action: Optional[str] = None,
    target_role: Optional[UserRole] = None,
    exclude_user_id: Optional[int] = None
) -> List[Notification]:
    """Helper to dispatch a notification to all members of a club or a specific role"""
    query = db.query(User).filter(User.club_id == club_id, User.is_active == True)
    if target_role:
        query = query.filter(User.role == target_role)
    if exclude_user_id:
        query = query.filter(User.id != exclude_user_id)
    
    users = query.all()
    created = []
    for u in users:
        notif = dispatch_notification(
            db=db,
            user_id=u.id,
            club_id=club_id,
            title=title,
            message=message,
            notif_type=notif_type,
            link_action=link_action
        )
        created.append(notif)
    return created

@router.get("", response_model=NotificationListResponse)
def get_user_notifications(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve notifications for the authenticated user with unread count"""
    items = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    unread_count = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.is_read == False)
        .count()
    )
    return NotificationListResponse(items=items, unread_count=unread_count)

@router.put("/{notification_id}/read", response_model=NotificationOut)
def mark_notification_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark a specific notification as read"""
    notif = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return notif

@router.post("/mark-all-read")
def mark_all_notifications_as_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark all notifications as read for current user"""
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"status": "success", "message": "All notifications marked as read"}

@router.post("/broadcast", response_model=dict)
def broadcast_announcement(
    payload: NotificationBroadcastRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Broadcast an announcement or alert to club members (Coach and Admin only)"""
    if current_user.role not in [UserRole.COACH, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only coaches and administrators can broadcast announcements."
        )

    dispatched = dispatch_club_notification(
        db=db,
        club_id=current_user.club_id,
        title=payload.title,
        message=payload.message,
        notif_type=payload.type,
        target_role=payload.target_role,
        exclude_user_id=current_user.id
    )
    db.commit()
    return {
        "status": "success",
        "recipients_count": len(dispatched),
        "message": f"Broadcast sent to {len(dispatched)} club members."
    }
