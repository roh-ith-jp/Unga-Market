import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid() -> str:
    return str(uuid.uuid4())


# ---------- auth ----------
class SignupRequest(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: EmailStr
    phone: str = Field(min_length=10, max_length=15)
    password: str = Field(min_length=6, max_length=72)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class OtpRequest(BaseModel):
    phone: str = Field(min_length=10, max_length=15)


class OtpChallenge(BaseModel):
    phone: str
    otp: str  # surfaced on screen: this is a MOCKED OTP, no SMS provider is wired
    expires_in_seconds: int


class OtpVerify(BaseModel):
    phone: str
    otp: str = Field(min_length=4, max_length=6)


class User(BaseModel):
    id: str
    name: str
    email: str
    phone: str


# ---------- catalog ----------
class Product(BaseModel):
    id: str
    name: str
    brand: str
    size: str
    price: float
    mrp: float
    category: str
    image: str
    in_stock: bool = True
    stock: int = 0
    low_stock: bool = False


class Category(BaseModel):
    slug: str
    name: str
    count: int


# ---------- saved addresses ----------
AddressLabel = Literal["Home", "Work", "Other"]


class AddressInput(BaseModel):
    label: AddressLabel
    address: str = Field(min_length=8, max_length=240)
    phone: str = Field(min_length=10, max_length=15)
    is_default: bool = False


class Address(BaseModel):
    id: str
    user_id: str
    label: AddressLabel
    address: str
    phone: str
    is_default: bool
    created_at: datetime


# ---------- orders ----------
OrderStatus = Literal["awaiting_payment", "placed", "packed", "out_for_delivery", "delivered"]
PaymentMethod = Literal["upi", "cod"]
PaymentStatus = Literal["pending", "verifying", "paid", "failed", "cod_due"]
DeliveryMode = Literal["now", "scheduled"]
ReceiptStatus = Literal["sent", "logged", "failed"]


class DeliverySlot(BaseModel):
    id: str
    label: str
    start: datetime
    end: datetime
    remaining: int
    sold_out: bool


class CartLineInput(BaseModel):
    product_id: str
    qty: int = Field(ge=1, le=20)


class OrderCreate(BaseModel):
    items: List[CartLineInput] = Field(min_length=1)
    address: str = Field(min_length=8, max_length=240)
    phone: str = Field(min_length=10, max_length=15)
    payment_method: PaymentMethod
    delivery_note: Optional[str] = Field(default=None, max_length=160)
    delivery_mode: DeliveryMode = "now"
    slot_id: Optional[str] = None


class OrderLine(BaseModel):
    product_id: str
    name: str
    brand: str
    size: str
    price: float
    qty: int
    image: str


class TimelineStep(BaseModel):
    key: str
    label: str
    description: str
    done: bool
    active: bool
    at: Optional[datetime] = None


class Order(BaseModel):
    id: str
    code: str
    user_id: str
    items: List[OrderLine]
    address: str
    phone: str
    delivery_note: Optional[str] = None
    subtotal: float
    delivery_fee: float
    platform_fee: float
    total: float
    savings: float
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    status: OrderStatus
    created_at: datetime
    placed_at: Optional[datetime] = None
    eta_minutes: int = 0
    timeline: List[TimelineStep] = []
    rider_name: Optional[str] = None
    rider_phone: Optional[str] = None
    delivery_mode: DeliveryMode = "now"
    slot_id: Optional[str] = None
    slot_label: Optional[str] = None
    slot_start: Optional[datetime] = None
    slot_end: Optional[datetime] = None
    receipt_status: Optional[ReceiptStatus] = None
    receipt_sent_at: Optional[datetime] = None
    receipt_to: Optional[str] = None
    reminder_status: Optional[ReceiptStatus] = None
    reminder_sent_at: Optional[datetime] = None
    reminder_due: bool = False


class ReceiptResult(BaseModel):
    order_id: str
    status: ReceiptStatus
    to: str
    live: bool
    message: str


class WatchResult(BaseModel):
    product_id: str
    watching: bool
    email: str
    message: str


class RestockResult(BaseModel):
    product_id: str
    stock: int
    notified: int
    statuses: List[str]
    message: str


# ---------- shopkeeper dashboard ----------
class StorePin(BaseModel):
    pin: str = Field(min_length=3, max_length=12)


class StoreSession(BaseModel):
    unlocked: bool
    store_name: str = "Unga Market"


class StoreOrderLine(BaseModel):
    name: str
    qty: int
    size: str


class StoreOrder(BaseModel):
    id: str
    code: str
    customer_name: str
    customer_email: str
    phone: str
    address: str
    items: List[StoreOrderLine]
    total: float
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    status: OrderStatus
    created_at: datetime
    slot_label: Optional[str] = None
    delivery_mode: DeliveryMode = "now"
    utr: Optional[str] = None
    utr_submitted_at: Optional[datetime] = None


class StoreStats(BaseModel):
    orders_today: int
    revenue_today: float
    delivered_today: int
    awaiting_verification: int
    cod_to_collect: int
    low_stock_items: int


class LowStockItem(BaseModel):
    id: str
    name: str
    size: str
    stock: int


class StoreDashboard(BaseModel):
    stats: StoreStats
    needs_attention: List[StoreOrder]
    today: List[StoreOrder]
    low_stock: List[LowStockItem]


class UtrDecision(BaseModel):
    approve: bool
    note: Optional[str] = Field(default=None, max_length=160)


class StoreActionResult(BaseModel):
    order_id: Optional[str] = None
    product_id: Optional[str] = None
    payment_status: Optional[PaymentStatus] = None
    order_status: Optional[OrderStatus] = None
    stock: Optional[int] = None
    message: str


# ---------- reorder ----------
class ReorderLine(BaseModel):
    product: Product
    qty: int


class ReorderResult(BaseModel):
    order_code: str
    lines: List[ReorderLine]
    skipped: List[str]


# ---------- payments ----------
class UpiIntent(BaseModel):
    order_id: str
    order_code: str
    amount: float
    vpa: str
    payee_name: str
    txn_ref: str
    upi_link: str
    app_links: dict[str, str]
    qr_svg: str
    expires_at: datetime
    status: PaymentStatus
    test_mode: bool


class UpiConfirm(BaseModel):
    utr: Optional[str] = Field(default=None, max_length=24)
    simulate: Optional[Literal["success", "failure"]] = None


class PaymentResult(BaseModel):
    order_id: str
    payment_status: PaymentStatus
    order_status: OrderStatus
    utr: Optional[str] = None
    message: str
