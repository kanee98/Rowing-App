from typing import List, Dict
from app.models.models import UserRole
from app.schemas.schemas import TourDefinition, TourStep

DEFAULT_TOURS: Dict[str, TourDefinition] = {
    "athlete_flow": TourDefinition(
        tour_id="athlete_flow",
        name="Athlete Training & Logging Guide",
        role=UserRole.ATHLETE,
        description="Learn how to view your assigned training schedule, log workout performance, and track personal bests.",
        steps=[
            TourStep(
                target="#tour-schedule-calendar",
                title="Your Training Schedule",
                content="Here you can see all daily workouts assigned by your coach, categorized by Ergometer, Water Rowing, and Strength.",
                placement="bottom"
            ),
            TourStep(
                target="#tour-log-performance-btn",
                title="Quick-Log Workout Performance",
                content="Tap here right from the dock or erg bay to enter your actual distance, split time, stroke rate, watts, and perceived exertion (RPE 1-10).",
                placement="left"
            ),
            TourStep(
                target="#tour-personal-bests",
                title="Personal Bests & Progress",
                content="Track your 2,000m and 5,000m split progressions, watts per kilogram, and historical improvements.",
                placement="top"
            ),
            TourStep(
                target="#tour-verification-status",
                title="Trainer Verification & Feedback",
                content="Once submitted, your trainer reviews your session metrics and leaves technical feedback and star ratings here.",
                placement="bottom"
            )
        ]
    ),
    "coach_flow": TourDefinition(
        tour_id="coach_flow",
        name="Coach Hub & Analytics Guide",
        role=UserRole.COACH,
        description="Master creating competition-targeted schedules, managing exercises & equipment, and ranking athletes.",
        steps=[
            TourStep(
                target="#tour-coach-analytics-matrix",
                title="Athlete Performance Rankings",
                content="Compare your athletes side-by-side on 2k/5k splits, watts/kg, and composite Readiness Scores to make boat seat selection easy.",
                placement="bottom"
            ),
            TourStep(
                target="#tour-competition-manager",
                title="Target Competitions & Regattas",
                content="Add target regattas (e.g. National Championship 2k, Head of the River 5k) to anchor your seasonal training macrocycles.",
                placement="right"
            ),
            TourStep(
                target="#tour-schedule-builder-btn",
                title="Create Training Schedule",
                content="Build structured multi-week training plans with specific session intensities, target splits, and stroke rates.",
                placement="left"
            ),
            TourStep(
                target="#tour-equipment-exercise-catalog",
                title="Boathouse & Exercise Catalog",
                content="Manage your rowing shells (1x, 2x, 4-, 8+), Concept2 Ergs, and custom training exercises with starter-pack presets.",
                placement="top"
            )
        ]
    ),
    "trainer_flow": TourDefinition(
        tour_id="trainer_flow",
        name="Trainer Deck & Verification Guide",
        role=UserRole.TRAINER,
        description="Learn how to supervise active sessions, verify athlete logs, and provide technical rowing feedback.",
        steps=[
            TourStep(
                target="#tour-verification-queue",
                title="Pending Verification Queue",
                content="All workout entries logged by athletes appear here in real-time for your review.",
                placement="bottom"
            ),
            TourStep(
                target="#tour-verify-action-btn",
                title="1-Click Verification & Feedback",
                content="Review athlete drag factor, stroke rate, and split. Add coaching notes (e.g. catch timing, leg drive) and assign a session rating.",
                placement="left"
            ),
            TourStep(
                target="#tour-session-roster",
                title="Today's Session Roster",
                content="Check which athletes have checked in and completed their prescribed pieces for today's training block.",
                placement="top"
            )
        ]
    ),
    "admin_flow": TourDefinition(
        tour_id="admin_flow",
        name="Club Administration & Roster Guide",
        role=UserRole.ADMIN,
        description="Manage your rowing club membership, staff roles, club invite codes, and equipment assets.",
        steps=[
            TourStep(
                target="#tour-club-overview",
                title="Club Vital Metrics",
                content="View your total registered athletes, active coaches, trainers, and equipment status in one view.",
                placement="bottom"
            ),
            TourStep(
                target="#tour-member-management",
                title="Member & Role Management",
                content="Invite new rowers, promote coaches/trainers, and manage athlete profiles including boat side preferences and weight categories.",
                placement="top"
            ),
        ]
    )
}

def get_tours_for_role(role: UserRole) -> List[TourDefinition]:
    # Return specific role tour first, followed by other flows for cross-learning
    result = []
    for tour in DEFAULT_TOURS.values():
        if tour.role == role:
            result.insert(0, tour)
        else:
            result.append(tour)
    return result
