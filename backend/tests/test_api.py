import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import Base, engine, run_additive_migrations

@pytest.fixture(scope="session", autouse=True)
def init_db():
    Base.metadata.create_all(bind=engine)
    run_additive_migrations()
    yield

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

def test_root_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "online"

def test_club_registration_with_starter_pack(client):
    import uuid
    unique_code = f"RC{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "name": f"Cambridge University Rowing Club {unique_code}",
        "code": unique_code,
        "location": "River Cam, Cambridge",
        "description": "Prestigious university rowing club.",
        "admin_name": "Alexander Hayes",
        "admin_email": f"admin_{unique_code.lower()}@cambridge.edu",
        "admin_password": "SecurePassword123!"
    }
    response = client.post("/api/v1/auth/register-club", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["role"] == "admin"
    assert data["user"]["email"] == payload["admin_email"]

    token = data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Verify starter pack equipment seeded
    eq_res = client.get("/api/v1/equipment", headers=headers)
    assert eq_res.status_code == 200
    assert len(eq_res.json()) >= 6

    # Verify starter pack exercises seeded
    ex_res = client.get("/api/v1/exercises", headers=headers)
    assert ex_res.status_code == 200
    assert len(ex_res.json()) >= 5

    # Verify starter pack schedules seeded
    sc_res = client.get("/api/v1/schedules", headers=headers)
    assert sc_res.status_code == 200
    assert len(sc_res.json()) >= 1
    assert sc_res.json()[0]["competition_name"] is not None

def test_coach_login_and_analytics(client):
    import uuid
    unique_code = f"CC{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "name": f"Oxford Racing Club {unique_code}",
        "code": unique_code,
        "admin_name": "Oxford Admin",
        "admin_email": f"admin_{unique_code.lower()}@oxford.edu",
        "admin_password": "SecurePassword123!"
    }
    reg_res = client.post("/api/v1/auth/register-club", json=payload)
    assert reg_res.status_code == 200

    # Log in as the seeded Coach
    coach_login = client.post("/api/v1/auth/login", json={
        "email": f"coach@{unique_code.lower()}.rowing.com",
        "password": "CoachPass123!"
    })
    assert coach_login.status_code == 200
    coach_token = coach_login.json()["access_token"]
    coach_headers = {"Authorization": f"Bearer {coach_token}"}

    # Coach accesses analytics
    analytics_res = client.get("/api/v1/analytics/coach-summary", headers=coach_headers)
    assert analytics_res.status_code == 200
    summary = analytics_res.json()
    assert summary["total_athletes"] >= 1
    assert len(summary["athlete_rankings"]) >= 1
    assert summary["athlete_rankings"][0]["rank"] == 1
    assert summary["athlete_rankings"][0]["overall_readiness_score"] > 0

def test_athlete_performance_logging_and_trainer_verification(client):
    import uuid
    unique_code = f"TC{uuid.uuid4().hex[:6].upper()}"
    client.post("/api/v1/auth/register-club", json={
        "name": f"Thames Club {unique_code}",
        "code": unique_code,
        "admin_name": "Thames Admin",
        "admin_email": f"admin_{unique_code.lower()}@thames.edu",
        "admin_password": "SecurePassword123!"
    })

    # 1. Log in as seeded Athlete
    ath_login = client.post("/api/v1/auth/login", json={
        "email": f"liam@{unique_code.lower()}.rowing.com",
        "password": "AthletePass123!"
    })
    assert ath_login.status_code == 200
    ath_token = ath_login.json()["access_token"]
    ath_headers = {"Authorization": f"Bearer {ath_token}"}

    # Get an exercise
    exercises = client.get("/api/v1/exercises", headers=ath_headers).json()
    assert len(exercises) > 0
    ex_id = exercises[0]["id"]

    # Log 2000m workout in 6:40 (400 seconds)
    perf_payload = {
        "exercise_id": ex_id,
        "actual_distance_m": 2000,
        "actual_duration_sec": 400.0,
        "avg_stroke_rate": 32.0,
        "perceived_exertion_rpe": 9,
        "drag_factor": 125,
        "athlete_notes": "Hard sprint in the final 250m."
    }
    log_res = client.post("/api/v1/performance", json=perf_payload, headers=ath_headers)
    assert log_res.status_code == 200
    perf_data = log_res.json()
    assert perf_data["avg_split_seconds"] == 100.0 # 1:40.0 split
    assert perf_data["avg_watts"] > 0
    assert perf_data["is_verified"] is False
    perf_id = perf_data["id"]

    # 2. Log in as seeded Trainer to verify
    trainer_login = client.post("/api/v1/auth/login", json={
        "email": f"trainer@{unique_code.lower()}.rowing.com",
        "password": "TrainerPass123!"
    })
    assert trainer_login.status_code == 200
    trainer_token = trainer_login.json()["access_token"]
    trainer_headers = {"Authorization": f"Bearer {trainer_token}"}

    verify_payload = {
        "is_verified": True,
        "trainer_feedback": "Excellent split management and high aerobic output.",
        "trainer_rating": 5
    }
    verify_res = client.post(f"/api/v1/performance/{perf_id}/verify", json=verify_payload, headers=trainer_headers)
    assert verify_res.status_code == 200
    assert verify_res.json()["is_verified"] is True
    assert verify_res.json()["trainer_rating"] == 5

def test_onboarding_tours_api(client):
    import uuid
    unique_code = f"OB{uuid.uuid4().hex[:6].upper()}"
    client.post("/api/v1/auth/register-club", json={
        "name": f"Onboarding Club {unique_code}",
        "code": unique_code,
        "admin_name": "OB Admin",
        "admin_email": f"admin_{unique_code.lower()}@ob.edu",
        "admin_password": "SecurePassword123!"
    })

    ath_login = client.post("/api/v1/auth/login", json={
        "email": f"liam@{unique_code.lower()}.rowing.com",
        "password": "AthletePass123!"
    })
    assert ath_login.status_code == 200
    ath_headers = {"Authorization": f"Bearer {ath_login.json()['access_token']}"}

    # Fetch tours
    tours_res = client.get("/api/v1/onboarding/tours", headers=ath_headers)
    assert tours_res.status_code == 200
    tours = tours_res.json()
    assert len(tours) >= 1
    assert any(t["tour_id"] == "athlete_flow" for t in tours)

    # Save tour step progress
    progress_payload = {
        "tour_id": "athlete_flow",
        "current_step": 2,
        "is_completed": False,
        "dismissed": False
    }
    save_res = client.post("/api/v1/onboarding/progress", json=progress_payload, headers=ath_headers)
    assert save_res.status_code == 200
    assert save_res.json()["current_step"] == 2

def test_notifications_and_weather_conditions(client):
    import uuid
    unique_code = f"NW{uuid.uuid4().hex[:6].upper()}"
    client.post("/api/v1/auth/register-club", json={
        "name": f"Weather Test Club {unique_code}",
        "code": unique_code,
        "admin_name": "Weather Admin",
        "admin_email": f"admin_{unique_code.lower()}@weather.edu",
        "admin_password": "SecurePassword123!"
    })

    # Coach login
    coach_login = client.post("/api/v1/auth/login", json={
        "email": f"coach@{unique_code.lower()}.rowing.com",
        "password": "CoachPass123!"
    })
    assert coach_login.status_code == 200
    coach_headers = {"Authorization": f"Bearer {coach_login.json()['access_token']}"}

    # 1. Fetch boathouse conditions
    w_res = client.get("/api/v1/weather/boathouse-conditions", headers=coach_headers)
    assert w_res.status_code == 200
    w_data = w_res.json()
    assert w_data["flag_status"] == "green"

    # 2. Update conditions to AMBER flag with alert broadcast
    w_update_res = client.post("/api/v1/weather/boathouse-conditions", json={
        "flag_status": "amber",
        "wind_speed_knots": 18.5,
        "wind_direction": "NE Strong Gusts 18 kts",
        "safety_notes": "High wind. Eights and Fours only. Small boats grounded.",
        "broadcast_alert": True
    }, headers=coach_headers)
    assert w_update_res.status_code == 200
    assert w_update_res.json()["flag_status"] == "amber"

    # 3. Athlete logs in and checks notifications
    ath_login = client.post("/api/v1/auth/login", json={
        "email": f"liam@{unique_code.lower()}.rowing.com",
        "password": "AthletePass123!"
    })
    assert ath_login.status_code == 200
    ath_headers = {"Authorization": f"Bearer {ath_login.json()['access_token']}"}

    notif_res = client.get("/api/v1/notifications", headers=ath_headers)
    assert notif_res.status_code == 200
    notif_data = notif_res.json()
    assert notif_data["unread_count"] >= 1
    # Check that weather alert notification was received
    assert any("AMBER FLAG" in n["title"] or n["type"] == "weather_alert" for n in notif_data["items"])

    # 4. Mark all as read
    read_all = client.post("/api/v1/notifications/mark-all-read", headers=ath_headers)
    assert read_all.status_code == 200

    notif_res2 = client.get("/api/v1/notifications", headers=ath_headers)
    assert notif_res2.json()["unread_count"] == 0

    # 5. Coach broadcasts team announcement
    bc_res = client.post("/api/v1/notifications/broadcast", json={
        "title": "Regatta Lineups Finalized",
        "message": "Final crew lists for the National Championships have been posted.",
        "type": "announcement"
    }, headers=coach_headers)
    assert bc_res.status_code == 200
    assert bc_res.json()["recipients_count"] >= 1

def test_unlimited_depth_taxonomy_and_schedule_snapshots(client):
    import uuid
    unique_code = f"TX{uuid.uuid4().hex[:6].upper()}"
    client.post("/api/v1/auth/register-club", json={
        "name": f"Taxonomy Club {unique_code}",
        "code": unique_code,
        "admin_name": "Taxonomy Admin",
        "admin_email": f"admin_{unique_code.lower()}@tax.edu",
        "admin_password": "SecurePassword123!"
    })

    # Admin Login
    admin_login = client.post("/api/v1/auth/login", json={
        "email": f"admin_{unique_code.lower()}@tax.edu",
        "password": "SecurePassword123!"
    })
    assert admin_login.status_code == 200
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    # 1. Fetch pre-seeded Starter Pack Taxonomy Tree
    tree_res = client.get("/api/v1/taxonomy/tree", headers=admin_headers)
    assert tree_res.status_code == 200
    tree_data = tree_res.json()
    assert len(tree_data) >= 1
    assert tree_data[0]["name"] == "Training Schedules"

    # 2. Test Unlimited Depth Creation (e.g. 5 levels deep)
    # L1: Training Schedules -> L2: Annual Macrocycle -> L3: Custom Deep Branch -> L4: Specific Sprint -> L5: Micro-Focus
    root_id = tree_data[0]["id"]
    l2_node = client.post("/api/v1/taxonomy/nodes", json={
        "name": "Custom Elite Macrocycle",
        "parent_id": root_id,
        "description": "Level 2 block"
    }, headers=admin_headers).json()

    l3_node = client.post("/api/v1/taxonomy/nodes", json={
        "name": "Preparation Mesocycle",
        "parent_id": l2_node["id"],
        "description": "Level 3 block"
    }, headers=admin_headers).json()

    l4_node = client.post("/api/v1/taxonomy/nodes", json={
        "name": "Sprint Utilization Modality",
        "parent_id": l3_node["id"],
        "description": "Level 4 block"
    }, headers=admin_headers).json()

    l5_node = client.post("/api/v1/taxonomy/nodes", json={
        "name": "500m Sub-Threshold 2",
        "parent_id": l4_node["id"],
        "description": "Level 5 leaf node"
    }, headers=admin_headers).json()

    assert l5_node["depth"] == 4 # 0-indexed: 0,1,2,3,4 = 5 levels
    assert "Training Schedules / Custom Elite Macrocycle / Preparation Mesocycle / Sprint Utilization Modality / 500m Sub-Threshold 2" == l5_node["full_path"]

    # 3. Test Cycle Prevention Check
    # Attempting to move l2_node under l4_node (descendant) must return HTTP 400
    cycle_res = client.post(f"/api/v1/taxonomy/nodes/{l2_node['id']}/move", json={
        "target_parent_id": l4_node["id"]
    }, headers=admin_headers)
    assert cycle_res.status_code == 400
    assert "Cycle detected" in cycle_res.json()["detail"]

    # Attempting to move node under itself must return 400
    self_move_res = client.post(f"/api/v1/taxonomy/nodes/{l2_node['id']}/move", json={
        "target_parent_id": l2_node["id"]
    }, headers=admin_headers)
    assert self_move_res.status_code == 400

    # 4. Schedule Creation with Immutable Taxonomy Snapshot
    from datetime import datetime, timedelta
    now_iso = datetime.utcnow().isoformat()
    end_iso = (datetime.utcnow() + timedelta(days=30)).isoformat()

    sch_res = client.post("/api/v1/schedules", json={
        "name": "500m Sprint Cycle Plan",
        "season": "Spring 2026",
        "taxonomy_node_id": l5_node["id"],
        "start_date": now_iso,
        "end_date": end_iso,
        "sessions": []
    }, headers=admin_headers)
    assert sch_res.status_code == 200
    sch_data = sch_res.json()
    assert sch_data["taxonomy_node_id"] == l5_node["id"]
    assert sch_data["taxonomy_node_name"] == "500m Sub-Threshold 2"
    assert sch_data["taxonomy_path_snapshot"] == l5_node["full_path"]

    # 5. Descendant Filtering Test
    # Querying schedules with parent node `l2_node["id"]` must include the schedule linked to child `l5_node["id"]`
    filt_res = client.get(f"/api/v1/schedules?taxonomy_node_id={l2_node['id']}", headers=admin_headers)
    assert filt_res.status_code == 200
    assert any(s["id"] == sch_data["id"] for s in filt_res.json())

    # 6. Archive and Restore
    arch_res = client.post(f"/api/v1/taxonomy/nodes/{l5_node['id']}/archive", headers=admin_headers)
    assert arch_res.status_code == 200
    assert arch_res.json()["status"] == "archived"

    rest_res = client.post(f"/api/v1/taxonomy/nodes/{l5_node['id']}/restore", headers=admin_headers)
    assert rest_res.status_code == 200
    assert rest_res.json()["status"] == "active"

    # 7. Soft Delete & Recovery
    del_res = client.delete(f"/api/v1/taxonomy/nodes/{l3_node['id']}", headers=admin_headers)
    assert del_res.status_code == 200
    assert del_res.json()["affected_count"] >= 3 # l3 and all descendants (l4, l5)

    rec_res = client.post(f"/api/v1/taxonomy/nodes/{l3_node['id']}/recover", headers=admin_headers)
    assert rec_res.status_code == 200
    assert rec_res.json()["status"] == "active"

def test_targeted_schedule_assignments_and_visibility(client):
    import uuid
    from datetime import datetime, timedelta

    unique_code = f"AS{uuid.uuid4().hex[:6].upper()}"
    registration = client.post("/api/v1/auth/register-club", json={
        "name": f"Assignment Club {unique_code}",
        "code": unique_code,
        "admin_name": "Assignment Admin",
        "admin_email": f"admin_{unique_code.lower()}@assign.com",
        "admin_password": "SecurePassword123!",
    })
    assert registration.status_code == 200
    admin_headers = {"Authorization": f"Bearer {registration.json()['access_token']}"}

    second_athlete_email = f"second_{unique_code.lower()}@assign.com"
    second_athlete = client.post("/api/v1/clubs/members", json={
        "full_name": "Second Athlete",
        "email": second_athlete_email,
        "password": "AthletePass123!",
        "role": "athlete",
    }, headers=admin_headers)
    assert second_athlete.status_code == 200

    members = client.get("/api/v1/clubs/members", headers=admin_headers).json()
    first_athlete = next(member for member in members if member["role"] == "athlete" and member["id"] != second_athlete.json()["id"])
    trainer = next(member for member in members if member["role"] == "trainer")

    created = client.post("/api/v1/schedules", json={
        "name": "Targeted Selection Plan",
        "start_date": datetime.utcnow().isoformat(),
        "end_date": (datetime.utcnow() + timedelta(days=14)).isoformat(),
        "athlete_ids": [first_athlete["id"]],
        "trainer_ids": [trainer["id"]],
        "sessions": [],
    }, headers=admin_headers)
    assert created.status_code == 200
    schedule = created.json()
    assert schedule["athlete_ids"] == [first_athlete["id"]]
    assert schedule["trainer_ids"] == [trainer["id"]]

    first_login = client.post("/api/v1/auth/login", json={
        "email": first_athlete["email"],
        "password": "AthletePass123!",
    })
    second_login = client.post("/api/v1/auth/login", json={
        "email": second_athlete_email,
        "password": "AthletePass123!",
    })
    trainer_login = client.post("/api/v1/auth/login", json={
        "email": trainer["email"],
        "password": "TrainerPass123!",
    })
    first_headers = {"Authorization": f"Bearer {first_login.json()['access_token']}"}
    second_headers = {"Authorization": f"Bearer {second_login.json()['access_token']}"}
    trainer_headers = {"Authorization": f"Bearer {trainer_login.json()['access_token']}"}

    schedule_id = schedule["id"]
    assert any(item["id"] == schedule_id for item in client.get("/api/v1/schedules", headers=first_headers).json())
    assert any(item["id"] == schedule_id for item in client.get("/api/v1/schedules", headers=trainer_headers).json())
    assert not any(item["id"] == schedule_id for item in client.get("/api/v1/schedules", headers=second_headers).json())
    assert client.get(f"/api/v1/schedules/{schedule_id}", headers=second_headers).status_code == 404

    updated = client.put(f"/api/v1/schedules/{schedule_id}/assignments", json={
        "athlete_ids": [second_athlete.json()["id"]],
        "trainer_ids": [trainer["id"]],
    }, headers=admin_headers)
    assert updated.status_code == 200
    assert updated.json()["athlete_ids"] == [second_athlete.json()["id"]]
    assert not any(item["id"] == schedule_id for item in client.get("/api/v1/schedules", headers=first_headers).json())
    assert any(item["id"] == schedule_id for item in client.get("/api/v1/schedules", headers=second_headers).json())

    other_code = f"OT{uuid.uuid4().hex[:6].upper()}"
    other_registration = client.post("/api/v1/auth/register-club", json={
        "name": f"Other Club {other_code}",
        "code": other_code,
        "admin_name": "Other Admin",
        "admin_email": f"admin_{other_code.lower()}@assign.com",
        "admin_password": "SecurePassword123!",
    })
    other_headers = {"Authorization": f"Bearer {other_registration.json()['access_token']}"}
    foreign_athlete = next(member for member in client.get("/api/v1/clubs/members", headers=other_headers).json() if member["role"] == "athlete")
    rejected = client.put(f"/api/v1/schedules/{schedule_id}/assignments", json={
        "athlete_ids": [foreign_athlete["id"]],
        "trainer_ids": [],
    }, headers=admin_headers)
    assert rejected.status_code == 400

def test_availability_privacy_safety_and_conflict_indicators(client):
    import uuid
    from datetime import datetime, timedelta

    unique_code = f"AV{uuid.uuid4().hex[:6].upper()}"
    registration = client.post("/api/v1/auth/register-club", json={
        "name": f"Availability Club {unique_code}",
        "code": unique_code,
        "admin_name": "Availability Admin",
        "admin_email": f"admin_{unique_code.lower()}@availability.com",
        "admin_password": "SecurePassword123!",
    })
    assert registration.status_code == 200
    admin_headers = {"Authorization": f"Bearer {registration.json()['access_token']}"}
    members = client.get("/api/v1/clubs/members", headers=admin_headers).json()
    athlete = next(member for member in members if member["role"] == "athlete")

    athlete_login = client.post("/api/v1/auth/login", json={
        "email": athlete["email"],
        "password": "AthletePass123!",
    })
    coach_login = client.post("/api/v1/auth/login", json={
        "email": f"coach@{unique_code.lower()}.rowing.com",
        "password": "CoachPass123!",
    })
    athlete_headers = {"Authorization": f"Bearer {athlete_login.json()['access_token']}"}
    coach_headers = {"Authorization": f"Bearer {coach_login.json()['access_token']}"}

    day = (datetime.utcnow() + timedelta(days=5)).replace(hour=6, minute=0, second=0, microsecond=0)
    unavailable = client.post("/api/v1/availability", json={
        "starts_at": day.isoformat(),
        "ends_at": (day + timedelta(hours=2)).isoformat(),
        "status": "unavailable",
        "reason_category": "medical",
        "coach_visible_notes": "No morning training",
        "private_notes": "Private clinical detail",
        "is_safety_restriction": True,
    }, headers=athlete_headers)
    assert unavailable.status_code == 200
    entry_id = unavailable.json()["id"]
    assert unavailable.json()["private_notes"] == "Private clinical detail"

    coach_view = client.get(f"/api/v1/availability?user_id={athlete['id']}", headers=coach_headers)
    assert coach_view.status_code == 200
    assert coach_view.json()[0]["private_notes"] is None
    assert coach_view.json()[0]["coach_visible_notes"] == "No morning training"
    assert client.delete(f"/api/v1/availability/{entry_id}", headers=coach_headers).status_code == 403

    availability_conflict = client.post("/api/v1/availability/conflicts", json={
        "user_ids": [athlete["id"]],
        "sessions": [{"starts_at": (day + timedelta(minutes=30)).isoformat(), "duration_minutes": 60}],
    }, headers=coach_headers)
    assert availability_conflict.status_code == 200
    assert availability_conflict.json()[0]["status"] == "safety_restriction"
    assert "Private clinical detail" not in str(availability_conflict.json())

    blocked_assignment = client.post("/api/v1/schedules", json={
        "name": "Should Be Blocked",
        "start_date": day.isoformat(),
        "end_date": (day + timedelta(days=1)).isoformat(),
        "athlete_ids": [athlete["id"]],
        "trainer_ids": [],
        "sessions": [{
            "title": "Unsafe Morning Session",
            "session_date": (day + timedelta(minutes=30)).isoformat(),
            "duration_minutes": 60,
            "exercises": [],
        }],
    }, headers=coach_headers)
    assert blocked_assignment.status_code == 409
    assert "Safety restriction" in blocked_assignment.json()["detail"]

    exercise_id = client.get("/api/v1/exercises", headers=admin_headers).json()[0]["id"]
    existing_start = day.replace(hour=10)
    schedule = client.post("/api/v1/schedules", json={
        "name": "Existing Assigned Session",
        "start_date": day.isoformat(),
        "end_date": (day + timedelta(days=1)).isoformat(),
        "athlete_ids": [athlete["id"]],
        "trainer_ids": [],
        "sessions": [{
            "title": "Existing Erg Session",
            "session_date": existing_start.isoformat(),
            "duration_minutes": 90,
            "exercises": [{"exercise_id": exercise_id}],
        }],
    }, headers=admin_headers)
    assert schedule.status_code == 200

    time_conflict = client.post("/api/v1/availability/conflicts", json={
        "user_ids": [athlete["id"]],
        "sessions": [{"starts_at": (existing_start + timedelta(minutes=30)).isoformat(), "duration_minutes": 60}],
    }, headers=coach_headers)
    assert time_conflict.status_code == 200
    assert time_conflict.json()[0]["status"] == "time_conflict"
    assert time_conflict.json()[0]["same_day_sessions"] == 1
    assert "Existing Erg Session" in time_conflict.json()[0]["conflict_titles"]

    high_load = client.post("/api/v1/availability/conflicts", json={
        "user_ids": [athlete["id"]],
        "sessions": [{"starts_at": existing_start.replace(hour=16).isoformat(), "duration_minutes": 120}],
    }, headers=coach_headers)
    assert high_load.status_code == 200
    assert high_load.json()[0]["status"] == "high_load"
    assert high_load.json()[0]["daily_load_minutes"] == 210
