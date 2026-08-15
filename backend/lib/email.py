"""Gmail SMTP receipt mail.

Credentials are optional by design: with GMAIL_ADDRESS / GMAIL_APP_PASSWORD unset the
sender logs the message and records it as `logged` instead of raising, so delivery
never breaks the app. smtplib is blocking, so the send runs in a worker thread.
"""
import asyncio
import logging
import os
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr

from lib.db import db

log = logging.getLogger("unga.mail")

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_TIMEOUT = 20


def sender_address() -> str | None:
    return os.environ.get("GMAIL_ADDRESS") or None


def store_copy_address() -> str | None:
    """Store owner's copy of every receipt."""
    return os.environ.get("STORE_EMAIL") or sender_address()


def is_live() -> bool:
    return bool(sender_address() and os.environ.get("GMAIL_APP_PASSWORD"))


def _rupees(value: float) -> str:
    return f"Rs {value:,.2f}".replace(".00", "")


def receipt_subject(order: dict) -> str:
    return f"Your Unga Market receipt · {order['code']}"


def _shell(title: str, subtitle: str, body: str) -> str:
    """Shared branded wrapper for every transactional email."""
    return f"""<!doctype html>
<html><body style="margin:0;background:#F7F8FA;padding:24px;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #EEF0F3">
    <div style="background:#0F8A3E;padding:22px 24px;color:#fff">
      <h1 style="margin:0;font-size:20px">Unga Market</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#E8F6ED">{subtitle}</p>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 12px;color:#111827;font-size:16px"><strong>{title}</strong></p>
      {body}
    </div>
  </div>
</body></html>"""


def receipt_text(order: dict) -> str:
    lines = [
        f"Unga Market — receipt for order {order['code']}",
        "",
        f"Delivered to: {order['address']}",
        f"Phone: {order['phone']}",
    ]
    if order.get("slot_label"):
        lines.append(f"Delivery slot: {order['slot_label']}")
    lines += ["", "Items:"]
    for item in order["items"]:
        lines.append(f"  {item['name']} ({item['size']}) x {item['qty']} — {_rupees(item['price'] * item['qty'])}")
    lines += [
        "",
        f"Item total:   {_rupees(order['subtotal'])}",
        f"Delivery fee: {'FREE' if order['delivery_fee'] == 0 else _rupees(order['delivery_fee'])}",
        f"Platform fee: {_rupees(order['platform_fee'])}",
        f"Total paid:   {_rupees(order['total'])}",
        "",
        "Payment: " + ("UPI" if order["payment_method"] == "upi" else "Cash on delivery"),
        "",
        "Thank you for shopping with your local kirana.",
    ]
    return "\n".join(lines)


def receipt_html(order: dict) -> str:
    rows = "".join(
        f"""<tr>
              <td style="padding:8px 0;border-bottom:1px solid #EEF0F3">
                <strong style="color:#111827">{item['name']}</strong><br>
                <span style="color:#9CA3AF;font-size:12px">{item['brand']} · {item['size']}</span>
              </td>
              <td style="padding:8px 0;border-bottom:1px solid #EEF0F3;text-align:right;color:#4B5563">{item['qty']}</td>
              <td style="padding:8px 0;border-bottom:1px solid #EEF0F3;text-align:right;color:#111827;font-weight:700">{_rupees(item['price'] * item['qty'])}</td>
            </tr>"""
        for item in order["items"]
    )
    slot_row = (
        f"""<p style="margin:4px 0 0;color:#4B5563;font-size:13px">Delivery slot: <strong>{order['slot_label']}</strong></p>"""
        if order.get("slot_label")
        else ""
    )
    return f"""<!doctype html>
<html><body style="margin:0;background:#F7F8FA;padding:24px;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #EEF0F3">
    <div style="background:#0F8A3E;padding:22px 24px;color:#fff">
      <h1 style="margin:0;font-size:20px">Unga Market</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#E8F6ED">Delivered · order {order['code']}</p>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 4px;color:#111827;font-size:15px"><strong>Your order has been delivered.</strong></p>
      <p style="margin:0;color:#4B5563;font-size:13px">{order['address']}</p>
      {slot_row}
      <table style="width:100%;border-collapse:collapse;margin-top:20px;font-size:14px">
        <thead><tr>
          <th style="text-align:left;padding-bottom:8px;border-bottom:1px solid #EEF0F3;color:#9CA3AF;font-size:11px;letter-spacing:.05em">ITEM</th>
          <th style="text-align:right;padding-bottom:8px;border-bottom:1px solid #EEF0F3;color:#9CA3AF;font-size:11px">QTY</th>
          <th style="text-align:right;padding-bottom:8px;border-bottom:1px solid #EEF0F3;color:#9CA3AF;font-size:11px">AMOUNT</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
      <table style="width:100%;margin-top:16px;font-size:14px">
        <tr><td style="color:#4B5563">Item total</td><td style="text-align:right;color:#111827">{_rupees(order['subtotal'])}</td></tr>
        <tr><td style="color:#4B5563">Delivery fee</td><td style="text-align:right;color:#111827">{'FREE' if order['delivery_fee'] == 0 else _rupees(order['delivery_fee'])}</td></tr>
        <tr><td style="color:#4B5563">Platform fee</td><td style="text-align:right;color:#111827">{_rupees(order['platform_fee'])}</td></tr>
        <tr><td style="padding-top:10px;font-weight:700;color:#111827;border-top:1px solid #EEF0F3">Total paid</td>
            <td style="padding-top:10px;text-align:right;font-weight:700;color:#111827;border-top:1px solid #EEF0F3">{_rupees(order['total'])}</td></tr>
      </table>
      <p style="margin:22px 0 0;color:#9CA3AF;font-size:12px">
        Paid via {'UPI' if order['payment_method'] == 'upi' else 'cash on delivery'}. This is a
        computer-generated receipt for order {order['code']}.
      </p>
    </div>
  </div>
</body></html>"""


def _build_message(order: dict, to: str, cc: str | None) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = formataddr(("Unga Market", sender_address() or "no-reply@ungamarket.in"))
    msg["To"] = to
    if cc and cc != to:
        msg["Cc"] = cc
    msg["Reply-To"] = sender_address() or "support@ungamarket.in"
    msg["Subject"] = receipt_subject(order)
    msg.set_content(receipt_text(order))          # plaintext part first
    msg.add_alternative(receipt_html(order), subtype="html")
    return msg


def _build_generic(to: str, subject: str, text: str, html: str, cc: str | None = None) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = formataddr(("Unga Market", sender_address() or "no-reply@ungamarket.in"))
    msg["To"] = to
    if cc and cc != to:
        msg["Cc"] = cc
    msg["Reply-To"] = sender_address() or "support@ungamarket.in"
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    return msg


def _send_message_sync(msg: EmailMessage, label: str, to: str, subject: str) -> str:
    address = sender_address()
    password = os.environ.get("GMAIL_APP_PASSWORD")
    if not address or not password:
        log.warning("Email not configured — %s would go to %s (%r)", label, to, subject)
        return "logged"
    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT) as smtp:
            smtp.ehlo()
            smtp.starttls(context=context)
            smtp.ehlo()
            smtp.login(address, password)
            smtp.send_message(msg)
        log.info("%s accepted by Gmail for %s", label, to)
        return "sent"
    except smtplib.SMTPAuthenticationError:
        log.exception("Gmail rejected the credentials (use a 16-char App Password, not the account password)")
        return "failed"
    except (smtplib.SMTPException, OSError, TimeoutError):
        log.exception("Gmail SMTP delivery failed for %s", to)
        return "failed"


async def _send_and_log(
    msg: EmailMessage, label: str, to: str, subject: str, meta: dict
) -> str:
    status = await asyncio.to_thread(_send_message_sync, msg, label, to, subject)
    await db.email_log.insert_one(
        {
            "kind": label,
            "to": to,
            "subject": subject,
            "status": status,
            "live": is_live(),
            "created_at": datetime.now(timezone.utc),
            **meta,
        }
    )
    return status


async def send_restock_alert(product: dict, to: str) -> str:
    """Tell a watcher their sold-out item is back."""
    subject = f"Back in stock: {product['name']}"
    left = int(product.get("stock", 0))
    text = (
        f"{product['name']} ({product['size']}) is back in stock at Unga Market.\n\n"
        f"Price: {_rupees(product['price'])}\n"
        f"Available: {left}\n\n"
        "Grab it before it goes again."
    )
    html = _shell(
        f"{product['name']} is back in stock",
        "Restock alert",
        f"""<p style="margin:0;color:#4B5563;font-size:14px">
              {product['brand']} · {product['size']} · <strong style="color:#111827">{_rupees(product['price'])}</strong>
            </p>
            <p style="margin:10px 0 0;color:#D9531A;font-size:13px;font-weight:700">Only {left} in stock — grab it before it goes again.</p>""",
    )
    return await _send_and_log(
        _build_generic(to, subject, text, html),
        "restock_alert",
        to,
        subject,
        {"product_id": product["id"]},
    )


async def send_slot_reminder(order: dict, to: str) -> str:
    """15-minute heads-up before a scheduled delivery window opens."""
    subject = f"Your Unga Market delivery is nearly here · {order['code']}"
    slot = order.get("slot_label", "your slot")
    text = (
        f"Your order {order['code']} arrives in your slot: {slot}.\n\n"
        f"Delivering to: {order['address']}\n"
        f"Rider: {order.get('rider_name', 'assigned shortly')}\n\n"
        "Please keep your phone nearby."
    )
    html = _shell(
        f"Your delivery window opens in 15 minutes",
        f"Order {order['code']}",
        f"""<p style="margin:0;color:#111827;font-size:15px;font-weight:700">{slot}</p>
            <p style="margin:8px 0 0;color:#4B5563;font-size:13px">Delivering to {order['address']}</p>
            <p style="margin:8px 0 0;color:#4B5563;font-size:13px">Rider: {order.get('rider_name', 'assigned shortly')}</p>
            <p style="margin:14px 0 0;color:#9CA3AF;font-size:12px">Please keep your phone nearby.</p>""",
    )
    status = await _send_and_log(
        _build_generic(to, subject, text, html),
        "slot_reminder",
        to,
        subject,
        {"order_id": order["id"], "order_code": order["code"]},
    )
    await db.orders.update_one(
        {"id": order["id"]},
        {"$set": {"reminder_status": status, "reminder_sent_at": datetime.now(timezone.utc)}},
    )
    return status


def _send_sync(order: dict, to: str, cc: str | None) -> str:
    address = sender_address()
    password = os.environ.get("GMAIL_APP_PASSWORD")
    if not address or not password:
        log.warning(
            "Email not configured — receipt for %s would go to %s (cc %s)", order["code"], to, cc
        )
        return "logged"

    try:
        msg = _build_message(order, to, cc)
        context = ssl.create_default_context()
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT) as smtp:
            smtp.ehlo()
            smtp.starttls(context=context)
            smtp.ehlo()
            smtp.login(address, password)
            smtp.send_message(msg)
        log.info("Receipt for %s accepted by Gmail", order["code"])
        return "sent"
    except smtplib.SMTPAuthenticationError:
        log.exception("Gmail rejected the credentials (check the App Password)")
        return "failed"
    except (smtplib.SMTPException, OSError, TimeoutError):
        log.exception("Gmail SMTP delivery failed for %s", order["code"])
        return "failed"


async def send_receipt(order: dict, to: str) -> str:
    """Send (or log) the delivered-order receipt and record the attempt. Never raises."""
    cc = store_copy_address()
    status = await asyncio.to_thread(_send_sync, order, to, cc)
    now = datetime.now(timezone.utc)
    await db.email_log.insert_one(
        {
            "order_id": order["id"],
            "order_code": order["code"],
            "to": to,
            "cc": cc,
            "subject": receipt_subject(order),
            "status": status,
            "live": is_live(),
            "created_at": now,
        }
    )
    await db.orders.update_one(
        {"id": order["id"]},
        {"$set": {"receipt_status": status, "receipt_sent_at": now, "receipt_to": to}},
    )
    return status
