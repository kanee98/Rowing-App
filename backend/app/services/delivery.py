import asyncio
import base64
import hashlib
import logging
import smtplib
import ssl
from datetime import timedelta
from email.message import EmailMessage
from urllib.parse import urlencode
from cryptography.fernet import Fernet
from sqlalchemy import or_
from app.core.config import settings
from app.core.database import SessionLocal
from app.models.models import Club, TrainingSession, Schedule, ScheduleAssignment, User
from app.models.operations import EmailOutbox, utcnow

logger = logging.getLogger(__name__)


def email_configured():
    return bool(settings.SMTP_HOST and settings.SMTP_FROM and settings.PUBLIC_APP_URL)


def app_link(**query):
    return settings.PUBLIC_APP_URL.rstrip('/') + '/' + ('?' + urlencode(query) if query else '')


def _cipher():
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest()))


def queue_email(db, club_id, recipient, subject, body, dedupe_key=None):
    existing = db.query(EmailOutbox).filter(EmailOutbox.dedupe_key == dedupe_key).first() if dedupe_key else None
    if existing:
        if existing.status == 'cancelled':
            existing.status, existing.body = 'pending', _cipher().encrypt(body.encode()).decode()
            existing.attempts, existing.next_attempt_at = 0, utcnow()
        return
    db.add(EmailOutbox(club_id=club_id, recipient=recipient, subject=subject,
        body=_cipher().encrypt(body.encode()).decode(), dedupe_key=dedupe_key))


def deliver_pending():
    if not email_configured():
        return
    with SessionLocal() as db:
        # The lock stays held through SMTP handoff. Another worker skips claimed
        # rows. A failed process releases its locks; SMTP handoff is at-least-once.
        items = db.query(EmailOutbox).filter(EmailOutbox.status == "pending", EmailOutbox.next_attempt_at <= utcnow()).order_by(EmailOutbox.id).limit(20).with_for_update(skip_locked=True).all()
        for item in items:
            item.attempts += 1
            try:
                message = EmailMessage()
                message['From'] = settings.SMTP_FROM
                message['To'] = item.recipient
                message['Subject'] = item.subject
                message.set_content(_cipher().decrypt(item.body.encode()).decode())
                connection = smtplib.SMTP_SSL if settings.SMTP_SSL else smtplib.SMTP
                kwargs = {"host": settings.SMTP_HOST, "port": settings.SMTP_PORT, "timeout": 15}
                if settings.SMTP_SSL:
                    kwargs['context'] = ssl.create_default_context()
                with connection(**kwargs) as smtp:
                    if settings.SMTP_STARTTLS and not settings.SMTP_SSL:
                        smtp.starttls(context=ssl.create_default_context())
                    if settings.SMTP_USERNAME:
                        smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    smtp.send_message(message)
                item.status = "sent"
                item.sent_at = utcnow()
                item.last_error = None
                item.body = ""  # Do not retain usable account/invitation links after handoff.
            except Exception:
                logger.exception("Email handoff failed for outbox item %s", item.id)
                item.last_error = "SMTP handoff failed; check email configuration and server logs"
                item.next_attempt_at = utcnow() + timedelta(minutes=min(60, 2 ** item.attempts))
                if item.attempts >= 5:
                    item.status = "failed"
        db.commit()


def trigger_delivery(background_tasks=None):
    """Immediately deliver pending emails using FastAPI background tasks (on serverless) or synchronous fallback."""
    if not email_configured():
        return
    if background_tasks is not None:
        background_tasks.add_task(deliver_pending)
    else:
        try:
            deliver_pending()
        except Exception:
            logger.exception("Synchronous email delivery failed")


def queue_reminders():
    if not email_configured():
        return
    with SessionLocal() as db:
        now = utcnow()
        club_ids = db.query(Schedule.club_id).join(TrainingSession).filter(
            TrainingSession.status == "scheduled", Schedule.is_active == True,
            TrainingSession.session_date > now, TrainingSession.session_date <= now + timedelta(hours=settings.REMINDER_HOURS)).distinct().all()
        for (club_id,) in club_ids:
            # Re-read after the same mutex used by cancellation/rescheduling.
            # A worker cannot enqueue an old-time reminder after invalidation.
            db.query(Club).filter(Club.id == club_id).with_for_update().first()
            sessions = db.query(TrainingSession).join(Schedule).filter(Schedule.club_id == club_id,
                TrainingSession.status == "scheduled", Schedule.is_active == True,
                TrainingSession.session_date > now, TrainingSession.session_date <= now + timedelta(hours=settings.REMINDER_HOURS)).populate_existing().all()
            for session in sessions:
                participants = db.query(User).outerjoin(ScheduleAssignment, ScheduleAssignment.user_id == User.id).filter(
                    or_(ScheduleAssignment.schedule_id == session.schedule_id, User.id == session.trainer_id),
                    User.club_id == club_id, User.is_active == True).distinct().all()
                for user in participants:
                    queue_email(db, user.club_id, user.email, f"Reminder: {session.title}",
                        f"{session.title} starts at {session.session_date.isoformat()} UTC.\nOpen your session: {app_link()}#operations/{session.id}",
                        dedupe_key=f"reminder:{session.id}:{user.id}:{session.session_date.isoformat()}")
            db.commit()


async def delivery_loop():
    while True:
        try:
            await asyncio.to_thread(queue_reminders)
            await asyncio.to_thread(deliver_pending)
        except Exception:
            logger.exception("Delivery worker iteration failed")
        await asyncio.sleep(60)
