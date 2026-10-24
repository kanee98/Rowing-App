from datetime import datetime
from types import SimpleNamespace as Record
import pytest
from fastapi import HTTPException
from app.core.config import settings
from app.models.operations import EmailOutbox, AccountAction
from app.services import delivery
from app.api.account import confirm, ActionInput, locked_user
from app.api.deps import get_current_user
from app.core.security import create_access_token


class Store:
    def __init__(self, rows=None): self.rows = rows or []; self.added = []; self.committed = False
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def query(self, *args): return self
    def filter(self, *args): return self
    def order_by(self, *args): return self
    def limit(self, *args): return self
    def with_for_update(self, **kwargs): return self
    def populate_existing(self): return self
    def all(self): return self.rows
    def first(self): return next(iter(self.rows), None)
    def add(self, value): self.added.append(value)
    def commit(self): self.committed = True


def test_queued_links_are_encrypted_not_stored_in_plaintext():
    db = Store()
    delivery.queue_email(db, 1, 'athlete@example.org', 'Test', 'private-reset-link')
    row = db.added[0]
    assert 'private-reset-link' not in row.body
    assert delivery._cipher().decrypt(row.body.encode()).decode() == 'private-reset-link'


def test_successful_smtp_handoff_records_sent_and_erases_links(monkeypatch):
    row = EmailOutbox(id=1, recipient='athlete@example.org', subject='Test', body=delivery._cipher().encrypt(b'private-reset-link').decode(), attempts=0, status='pending')
    db = Store([row]); handoffs = []
    class SMTP:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def send_message(self, message): handoffs.append(message)
    monkeypatch.setattr(settings, 'SMTP_HOST', 'smtp.invalid')
    monkeypatch.setattr(settings, 'SMTP_FROM', 'club@example.org')
    monkeypatch.setattr(settings, 'SMTP_USERNAME', '')
    monkeypatch.setattr(settings, 'SMTP_STARTTLS', False)
    monkeypatch.setattr(settings, 'SMTP_SSL', False)
    monkeypatch.setattr(delivery, 'SessionLocal', lambda: db)
    monkeypatch.setattr(delivery.smtplib, 'SMTP', SMTP)
    delivery.deliver_pending()
    assert len(handoffs) == 1
    assert row.status == 'sent' and row.sent_at and row.body == ''
    assert db.committed


def test_five_failed_handoffs_do_not_claim_delivery(monkeypatch):
    row = EmailOutbox(id=1, recipient='athlete@example.org', subject='Test', body=delivery._cipher().encrypt(b'test').decode(), attempts=4, status='pending')
    db = Store([row])
    def unavailable(**kwargs): raise OSError('Test SMTP unavailable')
    monkeypatch.setattr(settings, 'SMTP_HOST', 'smtp.invalid')
    monkeypatch.setattr(settings, 'SMTP_FROM', 'club@example.org')
    monkeypatch.setattr(settings, 'SMTP_SSL', False)
    monkeypatch.setattr(delivery, 'SessionLocal', lambda: db)
    monkeypatch.setattr(delivery.smtplib, 'SMTP', unavailable)
    delivery.deliver_pending()
    assert row.status == 'failed' and row.sent_at is None
    assert row.body and row.next_attempt_at and row.attempts == 5


@pytest.mark.parametrize('consumed,expiry', [(datetime(2026, 1, 1), datetime(2099, 1, 1)), (None, datetime(2000, 1, 1))])
def test_consumed_or_expired_recovery_links_are_rejected(consumed, expiry):
    db = Store([AccountAction(consumed_at=consumed, expires_at=expiry)])
    with pytest.raises(HTTPException) as error:
        confirm(ActionInput(token='x' * 32, new_password='NewPassword123!'), db)
    assert error.value.status_code == 400
    assert not db.committed


def test_password_role_or_status_token_version_invalidates_old_login():
    token = create_access_token(8, token_version=1)
    with pytest.raises(HTTPException) as error:
        get_current_user(Store([Record(id=8, is_active=True, token_version=2)]), token)
    assert error.value.status_code == 401


def test_stale_credential_request_is_rejected_after_waiting_for_user_lock():
    # A competing change has committed version 2 while this request waited.
    stale = Record(id=8, club_id=1, token_version=1)
    db = Store([Record(id=8, club_id=1, token_version=2, is_active=True)])
    with pytest.raises(HTTPException) as error:
        locked_user(db, stale)
    assert error.value.status_code == 401
    assert not db.committed
