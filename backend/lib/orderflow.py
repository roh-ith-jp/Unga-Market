"""Server-anchored order lifecycle. The tracker stage is derived from `placed_at`
elapsed time, so no background worker is needed and every client agrees on the stage."""
from datetime import datetime, timezone
from typing import Optional

from models.schemas import Order, OrderLine, TimelineStep

# seconds after placement at which each stage begins
STAGES = [
    ("placed", "Order placed", "We have your order and payment", 0),
    ("packed", "Packed & ready", "Your items are bagged at the Unga store", 45),
    ("out_for_delivery", "Out for delivery", "Your rider is on the way to you", 110),
    ("delivered", "Delivered", "Enjoy! Thanks for shopping local", 260),
]
TOTAL_SECONDS = STAGES[-1][3]
REMINDER_LEAD_SECONDS = 15 * 60   # heads-up window before a scheduled slot opens


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """Motor returns naive UTC datetimes — normalise before any comparison."""
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def build_order(doc: dict) -> Order:
    placed_at = _aware(doc.get("placed_at"))
    created_at = _aware(doc["created_at"])
    slot_start = _aware(doc.get("slot_start"))
    status = doc["status"]
    timeline: list[TimelineStep] = []
    eta_minutes = 0

    # A scheduled order is anchored to its slot: nothing moves until the window opens.
    scheduled = doc.get("delivery_mode") == "scheduled" and slot_start is not None
    anchor = slot_start if scheduled else placed_at

    # "reminder due" = inside the 15 minutes before a scheduled window opens
    reminder_due = False
    if scheduled and slot_start is not None and doc["status"] != "awaiting_payment":
        seconds_to_slot = (slot_start - datetime.now(timezone.utc)).total_seconds()
        reminder_due = 0 < seconds_to_slot <= REMINDER_LEAD_SECONDS

    if placed_at is None or anchor is None:
        # payment not settled yet: nothing on the tracker has happened
        timeline = [
            TimelineStep(key=k, label=lbl, description=desc, done=False, active=False)
            for k, lbl, desc, _ in STAGES
        ]
    else:
        elapsed = (datetime.now(timezone.utc) - anchor).total_seconds()
        reached = [i for i, s in enumerate(STAGES) if elapsed >= s[3]]
        current = max(reached) if reached else 0
        status = STAGES[current][0]
        for i, (k, lbl, desc, offset) in enumerate(STAGES):
            timeline.append(
                TimelineStep(
                    key=k,
                    label=lbl,
                    description=(
                        f"Scheduled for {doc['slot_label']}"
                        if scheduled and k == "out_for_delivery" and doc.get("slot_label")
                        else desc
                    ),
                    done=i < current or (i == current and k == "delivered"),
                    active=i == current and k != "delivered",
                    at=anchor.fromtimestamp(anchor.timestamp() + offset, tz=timezone.utc)
                    if i <= current
                    else None,
                )
            )
        if scheduled and elapsed < 0:
            # still waiting for the window to open — count down to the slot itself
            timeline[0] = timeline[0].model_copy(update={"done": True, "active": False, "at": placed_at})
            eta_minutes = max(1, int((-elapsed) // 60) + 1)
        else:
            eta_minutes = max(
                0, int((TOTAL_SECONDS - elapsed) // 60) + (1 if elapsed < TOTAL_SECONDS else 0)
            )

    return Order(
        id=doc["id"],
        code=doc["code"],
        user_id=doc["user_id"],
        items=[OrderLine(**line) for line in doc["items"]],
        address=doc["address"],
        phone=doc["phone"],
        delivery_note=doc.get("delivery_note"),
        subtotal=doc["subtotal"],
        delivery_fee=doc["delivery_fee"],
        platform_fee=doc["platform_fee"],
        total=doc["total"],
        savings=doc["savings"],
        payment_method=doc["payment_method"],
        payment_status=doc["payment_status"],
        status=status,
        created_at=created_at,
        placed_at=placed_at,
        eta_minutes=eta_minutes,
        timeline=timeline,
        rider_name=doc.get("rider_name"),
        rider_phone=doc.get("rider_phone"),
        delivery_mode=doc.get("delivery_mode", "now"),
        slot_id=doc.get("slot_id"),
        slot_label=doc.get("slot_label"),
        slot_start=slot_start,
        slot_end=_aware(doc.get("slot_end")),
        receipt_status=doc.get("receipt_status"),
        receipt_sent_at=_aware(doc.get("receipt_sent_at")),
        receipt_to=doc.get("receipt_to"),
        reminder_status=doc.get("reminder_status"),
        reminder_sent_at=_aware(doc.get("reminder_sent_at")),
        reminder_due=reminder_due,
    )
