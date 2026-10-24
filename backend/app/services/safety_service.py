from datetime import datetime, timezone

from app.schemas.schemas import BoathouseConditionOut


def condition_snapshot(condition, club_id: int, now: datetime | None = None) -> BoathouseConditionOut:
    """A read must never create conditions or trust legacy generated reports."""
    if condition is None or condition.report_source != "manual":
        return BoathouseConditionOut(club_id=club_id)
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    result = BoathouseConditionOut.model_validate(condition)
    result.report_status = "current" if condition.valid_until and condition.valid_until > now else "outdated"
    return result
