"""30-minute delivery slots, generated server-side in the store's timezone.

The pod clock is UTC, so every boundary here is computed in APP_TZ (Asia/Kolkata by
default) and only then converted back to UTC for storage — the browser never decides
what "today" or "8:00 pm" means.
"""
import os
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

SLOT_MINUTES = 30
LEAD_MINUTES = 45          # earliest slot must start this far out
OPEN_HOUR = 8              # first slot of a day starts 08:00
CLOSE_HOUR = 22            # last slot ends 22:00
SLOT_CAPACITY = 8          # orders per slot before it is sold out


def store_zone() -> ZoneInfo:
    return ZoneInfo(os.environ.get("APP_TZ", "Asia/Kolkata"))


def _ceil_to_slot(moment: datetime) -> datetime:
    """Round up to the next :00 / :30 boundary."""
    minute = 0 if moment.minute == 0 else (30 if moment.minute <= 30 else 60)
    base = moment.replace(minute=0, second=0, microsecond=0)
    return base + timedelta(minutes=minute)


def _label(start: datetime, today: datetime) -> str:
    day = "Today" if start.date() == today.date() else (
        "Tomorrow" if start.date() == (today + timedelta(days=1)).date()
        else start.strftime("%a %d %b")
    )
    end = start + timedelta(minutes=SLOT_MINUTES)

    def clock(dt: datetime) -> str:
        hour = dt.strftime("%I").lstrip("0") or "12"
        return f"{hour}:{dt.strftime('%M')} {dt.strftime('%p').lower()}"

    return f"{day}, {clock(start)} – {clock(end)}"


def generate_slots(days: int = 2) -> list[dict]:
    """Bookable slot windows for today and tomorrow, in chronological order."""
    zone = store_zone()
    now = datetime.now(zone)
    earliest = _ceil_to_slot(now + timedelta(minutes=LEAD_MINUTES))

    out: list[dict] = []
    for offset in range(days):
        day = (now + timedelta(days=offset)).date()
        cursor = datetime.combine(day, time(OPEN_HOUR, 0), tzinfo=zone)
        day_close = datetime.combine(day, time(CLOSE_HOUR, 0), tzinfo=zone)
        while cursor + timedelta(minutes=SLOT_MINUTES) <= day_close:
            if cursor >= earliest:
                end = cursor + timedelta(minutes=SLOT_MINUTES)
                out.append(
                    {
                        "id": cursor.strftime("%Y-%m-%dT%H:%M"),
                        "label": _label(cursor, now),
                        "start": cursor.astimezone(ZoneInfo("UTC")),
                        "end": end.astimezone(ZoneInfo("UTC")),
                        "capacity": SLOT_CAPACITY,
                    }
                )
            cursor += timedelta(minutes=SLOT_MINUTES)
    return out


def find_slot(slot_id: str) -> dict | None:
    for slot in generate_slots():
        if slot["id"] == slot_id:
            return slot
    return None
