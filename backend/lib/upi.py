"""UPI payment primitives: NPCI-standard deep link + QR, no gateway account required.

A UPI intent URL (`upi://pay?pa=...`) is the real NPCI collect standard — every UPI app
(Google Pay, PhonePe, Paytm, BHIM) opens it and pays the merchant VPA directly. It has no
server-to-server callback, so settlement is confirmed either by the payer submitting the
12-digit UTR or, in UPI_TEST_MODE, by an explicit simulated-success action.
"""
import os
from urllib.parse import quote

import segno


def merchant_vpa() -> str:
    return os.environ.get("UPI_VPA", "ungamarket@okicici")


def merchant_name() -> str:
    return os.environ.get("UPI_PAYEE_NAME", "Unga Market")


def test_mode() -> bool:
    return os.environ.get("UPI_TEST_MODE", "true").lower() == "true"


def build_upi_link(amount: float, txn_ref: str, note: str) -> str:
    """NPCI UPI deep link. `am` is rupees with 2 decimals, `tr` is our order reference."""
    params = [
        ("pa", merchant_vpa()),
        ("pn", merchant_name()),
        ("tr", txn_ref),
        ("tn", note),
        ("am", f"{amount:.2f}"),
        ("cu", "INR"),
    ]
    query = "&".join(f"{k}={quote(str(v), safe='')}" for k, v in params)
    return f"upi://pay?{query}"


def app_links(upi_link: str) -> dict[str, str]:
    """Per-app intent variants. Each resolves to the same collect request."""
    tail = upi_link.split("upi://pay?", 1)[1]
    return {
        "gpay": f"tez://upi/pay?{tail}",
        "phonepe": f"phonepe://pay?{tail}",
        "paytm": f"paytmmp://pay?{tail}",
        "any": upi_link,
    }


def qr_svg(upi_link: str) -> str:
    """Inline SVG QR of the UPI link — scannable by any UPI app's camera."""
    qr = segno.make(upi_link, error="m")
    return qr.svg_inline(scale=6, dark="#0F8A3E", light=None, border=2)


def is_valid_utr(utr: str) -> bool:
    """UPI UTR / RRN is a 12-digit numeric reference."""
    cleaned = utr.strip()
    return cleaned.isdigit() and len(cleaned) == 12
