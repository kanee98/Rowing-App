"""Tests never connect to the application's configured development/production DB."""
import os
import pytest
from sqlalchemy.engine import make_url

test_url = os.environ.get('TEST_DATABASE_URL')
os.environ['DATABASE_URL'] = test_url or 'mysql+pymysql://test:test@127.0.0.1:3306/sports_management_test'


@pytest.fixture(scope='session')
def integration_engine():
    if not test_url:
        pytest.skip('Set TEST_DATABASE_URL to an isolated MySQL database ending in _test')
    url = make_url(test_url)
    if url.get_backend_name() != 'mysql' or not url.database or not url.database.endswith('_test'):
        pytest.fail('Refusing integration tests: TEST_DATABASE_URL must be MySQL with a database name ending in _test')
    from app.core.database import engine
    from app.core.migrations import run_migrations
    run_migrations()
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(integration_engine):
    from sqlalchemy.orm import Session
    with integration_engine.connect() as connection:
        transaction = connection.begin()
        session = Session(bind=connection, autoflush=False, join_transaction_mode='create_savepoint')
        try:
            yield session
        finally:
            session.close()
            transaction.rollback()


@pytest.fixture
def client(db_session, monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.core.config import settings
    from app.core.database import get_db
    monkeypatch.setattr(settings, 'EMAIL_WORKER_ENABLED', False)
    monkeypatch.setattr(settings, 'SMTP_HOST', '')
    monkeypatch.setattr(settings, 'SMTP_FROM', '')
    def override_db():
        try:
            yield db_session
        except Exception:
            db_session.rollback()
            raise
    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as active:
            yield active
    finally:
        app.dependency_overrides.clear()
