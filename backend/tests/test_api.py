"""Integration tests: explicit fixtures, never fictional seeded club members."""
from datetime import timedelta
from urllib.parse import urlparse, parse_qs
import uuid
import pytest
from app.models.operations import utcnow

PREFIX = '/api/v1'
PASSWORD = 'TestPassword123!'


@pytest.fixture
def club(client):
    code = 'T' + uuid.uuid4().hex[:10].upper()
    response = client.post(PREFIX + '/auth/register-club', json={
        'name': 'Integration Club', 'code': code, 'admin_name': 'Test Administrator',
        'admin_email': code.lower() + '@example.org', 'admin_password': PASSWORD,
    })
    assert response.status_code == 200, response.text
    data = response.json()
    admin = {'Authorization': 'Bearer ' + data['access_token']}
    people = {}
    for role, name in [('coach', 'Coach'), ('trainer', 'Trainer'), ('athlete', 'Athlete'), ('athlete', 'Second Athlete')]:
        created = client.post(PREFIX + '/clubs/members', headers=admin, json={
            'full_name': name, 'email': name.replace(' ', '').lower() + code + '@example.org',
            'role': role, 'password': PASSWORD,
        })
        assert created.status_code == 200, created.text
        person = created.json()
        login = client.post(PREFIX + '/auth/login', json={'email': person['email'], 'password': PASSWORD})
        assert login.status_code == 200, login.text
        person['headers'] = {'Authorization': 'Bearer ' + login.json()['access_token']}
        people[name] = person
    return {'admin': admin, 'admin_user': data['user'], **people}


def create_session(client, club, days=2):
    start = (utcnow() + timedelta(days=days)).replace(microsecond=0)
    result = client.post(PREFIX + '/schedules', headers=club['admin'], json={
        'name': 'Explicit test plan', 'start_date': start.isoformat(),
        'end_date': (start + timedelta(days=4)).isoformat(),
        'athlete_ids': [club['Athlete']['id']], 'trainer_ids': [club['Trainer']['id']],
        'sessions': [{'title': 'Test outing', 'session_date': start.isoformat(), 'duration_minutes': 60, 'exercises': []}],
    })
    assert result.status_code == 200, result.text
    return result.json()['sessions'][0]


def boat_and_crew(client, club, suffix=''):
    boat = client.post(PREFIX + '/equipment', headers=club['admin'], json={
        'name': 'Test single ' + suffix, 'category': '1x_single_scull', 'status': 'available',
    })
    assert boat.status_code == 200, boat.text
    crew = client.post(PREFIX + '/operations/crews', headers=club['admin'], json={
        'name': 'Test crew ' + suffix, 'equipment_id': boat.json()['id'], 'seats': {'Single': club['Athlete']['id']},
    })
    assert crew.status_code == 200, crew.text
    return boat.json(), crew.json()


def book(client, club, crew, session):
    start = session['session_date']
    return client.post(PREFIX + '/operations/reservations', headers=club['admin'], json={
        'crew_id': crew['id'], 'session_id': session['id'], 'starts_at': start,
        'ends_at': (utcnow() + timedelta(days=3)).isoformat(),
    })


def test_registration_does_not_seed_members_equipment_or_sessions(client):
    code = 'C' + uuid.uuid4().hex[:10].upper()
    response = client.post(PREFIX + '/auth/register-club', json={
        'name': 'Clean Club', 'code': code, 'admin_name': 'Only Admin',
        'admin_email': code + '@example.org', 'admin_password': PASSWORD,
    })
    assert response.status_code == 200, response.text
    headers = {'Authorization': 'Bearer ' + response.json()['access_token']}
    assert len(client.get(PREFIX + '/clubs/members', headers=headers).json()) == 1
    for path in ['/equipment', '/exercises', '/schedules', '/operations/crews', '/operations/outings']:
        assert client.get(PREFIX + path, headers=headers).json() == []
    safety = client.get(PREFIX + '/weather/boathouse-conditions', headers=headers).json()
    assert safety['report_status'] == 'not_reported'
    assert safety['flag_status'] is None


@pytest.mark.parametrize('role', ['coach', 'trainer', 'admin'])
def test_admin_invitation_acceptance_uses_selected_role(client, club, role):
    created = client.post(PREFIX + '/membership/invitations', headers=club['admin'], json={
        'email': role + uuid.uuid4().hex[:8] + '@example.org', 'role': role,
    })
    assert created.status_code == 200, created.text
    token = created.json()['token']
    accepted = client.post(PREFIX + '/membership/invitations/accept', json={'token': token, 'full_name': 'Invited User', 'password': PASSWORD})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()['user']['role'] == role
    assert client.post(PREFIX + '/membership/invitations/accept', json={'token': token, 'full_name': 'Again', 'password': PASSWORD}).status_code == 400


def test_last_administrator_and_staff_permissions(client, club):
    assert client.put(PREFIX + '/clubs/members/' + str(club['admin_user']['id']), headers=club['admin'], json={'is_active': False}).status_code == 400
    assert client.put(PREFIX + '/clubs/members/' + str(club['Athlete']['id']), headers=club['Coach']['headers'], json={'role': 'trainer'}).status_code == 403
    assert client.post(PREFIX + '/membership/invitations', headers=club['Coach']['headers'], json={'email': 'newtrainer@example.org', 'role': 'trainer'}).status_code == 403
    suspended = client.put(PREFIX + '/clubs/members/' + str(club['Athlete']['id']), headers=club['admin'], json={'is_active': False})
    assert suspended.status_code == 200, suspended.text
    assert client.get(PREFIX + '/auth/me', headers=club['Athlete']['headers']).status_code in (400, 401, 403)
    login = client.post(PREFIX + '/auth/login', json={'email': club['Athlete']['email'], 'password': PASSWORD})
    assert login.status_code in (400, 401, 403)


def test_self_service_profile_and_password_invalidates_old_tokens(client, club):
    headers = club['Athlete']['headers']
    updated = client.put(PREFIX + '/account/profile', headers=headers, json={'full_name': 'Updated Athlete', 'weight_kg': 72.5, 'height_cm': None, 'side_preference': None})
    assert updated.status_code == 200, updated.text
    assert updated.json()['weight_kg'] == 72.5
    wrong = client.post(PREFIX + '/account/password', headers=headers, json={'current_password': 'incorrect', 'new_password': 'ChangedPassword123!'})
    assert wrong.status_code == 400
    result = client.post(PREFIX + '/account/password', headers=headers, json={'current_password': PASSWORD, 'new_password': 'ChangedPassword123!'})
    assert result.status_code == 200, result.text
    assert client.get(PREFIX + '/auth/me', headers=headers).status_code == 401
    assert client.get(PREFIX + '/auth/me', headers={'Authorization': 'Bearer ' + result.json()['access_token']}).status_code == 200


def test_rsvp_checkin_and_assignment_privacy(client, club):
    session = create_session(client, club)
    path = PREFIX + '/operations/sessions/' + str(session['id'])
    rsvp = client.put(path + '/rsvp', headers=club['Athlete']['headers'], json={'rsvp': 'going', 'note': 'See you there'})
    assert rsvp.status_code == 200, rsvp.text
    assert client.get(path + '/attendance', headers=club['Second Athlete']['headers']).status_code == 404
    assert client.put(path + '/attendance/' + str(club['Athlete']['id']), headers=club['Athlete']['headers'], json={'checkin': 'present'}).status_code == 403
    checked = client.put(path + '/attendance/' + str(club['Athlete']['id']), headers=club['Trainer']['headers'], json={'checkin': 'present'})
    assert checked.status_code == 200, checked.text
    row = client.get(path + '/attendance', headers=club['Trainer']['headers']).json()[0]
    assert row['rsvp'] == 'going' and row['checkin'] == 'present'


def test_boat_and_athlete_cannot_be_double_booked(client, club):
    session = create_session(client, club)
    _, crew = boat_and_crew(client, club)
    first = book(client, club, crew, session)
    assert first.status_code == 200, first.text
    assert book(client, club, crew, session).status_code == 409
    _, other_crew = boat_and_crew(client, club, 'other boat')
    assert book(client, club, other_crew, session).status_code == 409


def test_cancellation_releases_boat_and_closes_rsvp(client, club):
    session = create_session(client, club)
    _, crew = boat_and_crew(client, club)
    assert book(client, club, crew, session).status_code == 200
    path = PREFIX + '/operations/sessions/' + str(session['id'])
    cancelled = client.post(path + '/lifecycle', headers=club['Coach']['headers'], json={'action': 'cancel', 'reason': 'Unsafe water conditions'})
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()['status'] == 'cancelled'
    bookings = client.get(PREFIX + '/operations/reservations', headers=club['admin']).json()
    assert bookings[0]['status'] == 'cancelled'
    assert client.put(path + '/rsvp', headers=club['Athlete']['headers'], json={'rsvp': 'going'}).status_code == 409
    restored = client.post(path + '/lifecycle', headers=club['admin'], json={'action': 'restore', 'reason': 'Conditions now reviewed'})
    assert restored.status_code == 200, restored.text
    assert client.get(PREFIX + '/operations/reservations', headers=club['admin']).json()[0]['status'] == 'cancelled'


def test_grounded_boat_stays_blocked_until_all_repairs_resolved(client, club):
    session = create_session(client, club)
    boat, crew = boat_and_crew(client, club)
    reports = [client.post(PREFIX + '/operations/damage', headers=club['Athlete']['headers'], json={
        'equipment_id': boat['id'], 'severity': 'grounded', 'description': description,
    }).json()['id'] for description in ['Damaged rudder', 'Cracked hull']]
    assert book(client, club, crew, session).status_code == 409
    for report_id in reports:
        response = client.post(PREFIX + '/operations/damage/' + str(report_id) + '/resolve', headers=club['Trainer']['headers'], json={'resolution': 'Repair inspected and completed'})
        assert response.status_code == 200, response.text
        if report_id == reports[0]:
            assert book(client, club, crew, session).status_code == 409
    assert book(client, club, crew, session).status_code == 200


def test_reschedule_moves_reservation_and_resets_rsvp(client, club):
    session = create_session(client, club)
    _, crew = boat_and_crew(client, club)
    assert book(client, club, crew, session).status_code == 200
    path = PREFIX + '/operations/sessions/' + str(session['id'])
    client.put(path + '/rsvp', headers=club['Athlete']['headers'], json={'rsvp': 'going'})
    new_time = (utcnow() + timedelta(days=3)).replace(microsecond=0).isoformat()
    response = client.post(path + '/lifecycle', headers=club['admin'], json={'action': 'reschedule', 'reason': 'Coach timing change', 'session_date': new_time, 'duration_minutes': 90})
    assert response.status_code == 200, response.text
    assert client.get(PREFIX + '/operations/reservations', headers=club['admin']).json()[0]['starts_at'] == new_time
    assert client.get(path + '/attendance', headers=club['admin']).json()[0]['rsvp'] == 'unknown'
    notices = client.get(PREFIX + '/notifications', headers=club['Athlete']['headers']).json()['items']
    assert any(notice['link_action'] == 'operations/' + str(session['id']) for notice in notices)


def test_password_reset_and_verified_email_are_single_use(client, club, db_session, monkeypatch):
    from app.core.config import settings
    from app.services.delivery import _cipher
    from app.models.operations import EmailOutbox
    monkeypatch.setattr(settings, 'SMTP_HOST', 'smtp.test.invalid')
    monkeypatch.setattr(settings, 'SMTP_FROM', 'club@example.org')
    headers = club['Athlete']['headers']
    for purpose in ['password_reset', 'email_change']:
        endpoint = '/account/forgot-password' if purpose == 'password_reset' else '/account/email-change'
        body = {'email': club['Athlete']['email']} if purpose == 'password_reset' else {'current_password': 'ResetPassword123!', 'new_email': 'verified' + uuid.uuid4().hex[:8] + '@example.org'}
        response = client.post(PREFIX + endpoint, headers=headers, json=body)
        assert response.status_code == 200, response.text
        message = db_session.query(EmailOutbox).order_by(EmailOutbox.id.desc()).first()
        content = _cipher().decrypt(message.body.encode()).decode()
        link = next(line for line in content.splitlines() if line.startswith('http'))
        params = parse_qs(urlparse(link).query)
        assert params['account_action'] == [purpose]
        confirmation = {'token': params['token'][0]}
        if purpose == 'password_reset': confirmation['new_password'] = 'ResetPassword123!'
        result = client.post(PREFIX + '/account/confirm', json=confirmation)
        assert result.status_code == 200, result.text
        assert client.post(PREFIX + '/account/confirm', json=confirmation).status_code == 400
        if purpose == 'password_reset':
            login = client.post(PREFIX + '/auth/login', json={'email': club['Athlete']['email'], 'password': 'ResetPassword123!'})
            headers = {'Authorization': 'Bearer ' + login.json()['access_token']}
        else:
            login = client.post(PREFIX + '/auth/login', json={'email': body['new_email'], 'password': 'ResetPassword123!'})
            assert login.status_code == 200, login.text


def test_athlete_with_overdue_outing_cannot_launch_another_boat(client, club, db_session):
    from app.models.operations import Reservation, Outing
    _, crew_a = boat_and_crew(client, club, 'A')
    _, crew_b = boat_and_crew(client, club, 'B')
    now = utcnow()
    booking_ids = []
    for crew, minutes in [(crew_a, 5), (crew_b, 70)]:
        response = client.post(PREFIX + '/operations/reservations', headers=club['admin'], json={
            'crew_id': crew['id'], 'starts_at': (now + timedelta(minutes=minutes)).isoformat(),
            'ends_at': (now + timedelta(minutes=minutes + 60)).isoformat(),
        })
        assert response.status_code == 200, response.text
        booking_ids.append(response.json()['id'])
    first = db_session.get(Reservation, booking_ids[0])
    first.starts_at, first.ends_at = now - timedelta(minutes=1), now + timedelta(minutes=1)
    db_session.commit()
    launched = client.post(PREFIX + '/operations/outings', headers=club['Trainer']['headers'], json={'reservation_id': first.id})
    assert launched.status_code == 200, launched.text
    first.ends_at = now - timedelta(seconds=10)
    db_session.get(Outing, launched.json()['id']).expected_return_at = first.ends_at
    second = db_session.get(Reservation, booking_ids[1])
    second.starts_at, second.ends_at = now - timedelta(seconds=5), now + timedelta(minutes=50)
    db_session.commit()
    blocked = client.post(PREFIX + '/operations/outings', headers=club['Trainer']['headers'], json={'reservation_id': second.id})
    assert blocked.status_code == 409
    assert 'unreturned' in blocked.json()['detail']
    assert client.post(PREFIX + '/operations/outings/' + str(launched.json()['id']) + '/return', headers=club['Trainer']['headers']).status_code == 200
    assert client.post(PREFIX + '/operations/outings', headers=club['Trainer']['headers'], json={'reservation_id': second.id}).status_code == 200


def test_taxonomy_depth_cycle_protection_and_recovery_with_explicit_nodes(client, club):
    headers = club['admin']
    parent = None
    nodes = []
    for index in range(5):
        response = client.post(PREFIX + '/taxonomy/nodes', headers=headers, json={'name': 'Level ' + str(index), 'parent_id': parent})
        assert response.status_code == 201, response.text
        nodes.append(response.json())
        parent = nodes[-1]['id']
    assert nodes[-1]['depth'] == 4
    cycle = client.post(PREFIX + '/taxonomy/nodes/' + str(nodes[0]['id']) + '/move', headers=headers, json={'target_parent_id': nodes[-1]['id']})
    assert cycle.status_code == 400, cycle.text
    removed = client.delete(PREFIX + '/taxonomy/nodes/' + str(nodes[2]['id']), headers=headers)
    assert removed.status_code == 200, removed.text
    assert removed.json()['affected_count'] >= 3
    recovered = client.post(PREFIX + '/taxonomy/nodes/' + str(nodes[2]['id']) + '/recover', headers=headers)
    assert recovered.status_code == 200 and recovered.json()['status'] == 'active'


def test_availability_privacy_and_time_conflict_indicators(client, club):
    start = (utcnow() + timedelta(days=4)).replace(microsecond=0)
    payload = {'starts_at': start.isoformat(), 'ends_at': (start + timedelta(hours=1)).isoformat(),
        'status': 'unavailable', 'reason_category': 'medical', 'is_safety_restriction': True,
        'coach_visible_notes': 'Cannot train', 'private_notes': 'Private detail'}
    result = client.post(PREFIX + '/availability', headers=club['Athlete']['headers'], json=payload)
    assert result.status_code == 200, result.text
    visible = client.get(PREFIX + '/availability?user_id=' + str(club['Athlete']['id']), headers=club['Coach']['headers'])
    assert visible.json()[0]['private_notes'] is None
    assert visible.json()[0]['coach_visible_notes'] == 'Cannot train'
    assert client.delete(PREFIX + '/availability/' + str(result.json()['id']), headers=club['Coach']['headers']).status_code == 403
    conflict = client.post(PREFIX + '/availability/conflicts', headers=club['Coach']['headers'], json={
        'user_ids': [club['Athlete']['id']], 'sessions': [{'starts_at': start.isoformat(), 'duration_minutes': 30}],
    })
    assert conflict.status_code == 200, conflict.text
    assert conflict.json()[0]['status'] == 'safety_restriction'
    assert 'Private detail' not in conflict.text


def test_onboarding_progress_and_notification_read_state(client, club):
    headers = club['Athlete']['headers']
    tours = client.get(PREFIX + '/onboarding/tours', headers=headers)
    assert tours.status_code == 200 and any(item['tour_id'] == 'athlete_flow' for item in tours.json())
    saved = client.post(PREFIX + '/onboarding/progress', headers=headers, json={'tour_id': 'athlete_flow', 'current_step': 2, 'is_completed': False, 'dismissed': False})
    assert saved.status_code == 200 and saved.json()['current_step'] == 2
    create_session(client, club)
    notices = client.get(PREFIX + '/notifications', headers=headers)
    assert notices.status_code == 200 and notices.json()['unread_count'] >= 1
    assert client.post(PREFIX + '/notifications/mark-all-read', headers=headers).status_code == 200
    assert client.get(PREFIX + '/notifications', headers=headers).json()['unread_count'] == 0
