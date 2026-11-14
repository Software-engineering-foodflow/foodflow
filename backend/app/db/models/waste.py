"""報廢紀錄。每筆對應一筆 WASTE 類型的庫存異動。"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import WasteReason
from app.db.base import Base, IdMixin, enum_type
from app.db.models.inventory import InventoryBatch, InventoryTransaction
from app.db.models.master_data import Employee


class WasteRecord(IdMixin, Base):
    __tablename__ = "waste_record"
    __table_args__ = (
        UniqueConstraint("transaction_id"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
    )

    batch_id: Mapped[int] = mapped_column(ForeignKey("inventory_batch.id"), index=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("inventory_transaction.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    reason: Mapped[WasteReason] = mapped_column(enum_type(WasteReason, "reason"))
    note: Mapped[str | None] = mapped_column(Text)
    # 單價未知時為 NULL，不推算為零。
    loss_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    operator_id: Mapped[int] = mapped_column(ForeignKey("employee.id"))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    batch: Mapped[InventoryBatch] = relationship(lazy="raise")
    transaction: Mapped[InventoryTransaction] = relationship(lazy="raise")
    operator: Mapped[Employee] = relationship(lazy="raise")


class WasteRequest(IdMixin, Base):
    """申請與已生效帳本分離，歷史 WasteRecord 永不回寫。"""

    __tablename__ = "waste_request"
    __table_args__ = (
        UniqueConstraint("request_key"),
        UniqueConstraint("record_id"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("status IN ('PENDING', 'APPROVED', 'REJECTED')", name="valid_status"),
        CheckConstraint(
            "(status = 'PENDING' AND reviewer_id IS NULL AND reviewed_at IS NULL "
            "AND record_id IS NULL AND rejection_reason IS NULL) OR "
            "(status = 'APPROVED' AND reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL "
            "AND record_id IS NOT NULL AND rejection_reason IS NULL) OR "
            "(status = 'REJECTED' AND reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL "
            "AND record_id IS NULL AND length(trim(rejection_reason)) > 0 "
            "AND rejection_reason IS NOT NULL)",
            name="review_consistent",
        ),
    )
    request_key: Mapped[UUID] = mapped_column(Uuid)
    batch_id: Mapped[int] = mapped_column(ForeignKey("inventory_batch.id"), index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    reason: Mapped[WasteReason] = mapped_column(enum_type(WasteReason, "reason"))
    note: Mapped[str | None] = mapped_column(Text)
    operator_id: Mapped[int] = mapped_column(ForeignKey("employee.id"))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(16), default="PENDING", index=True)
    reviewer_id: Mapped[int | None] = mapped_column(ForeignKey("employee.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    record_id: Mapped[int | None] = mapped_column(ForeignKey("waste_record.id"))
    batch: Mapped[InventoryBatch] = relationship(lazy="raise")
    operator: Mapped[Employee] = relationship(foreign_keys=[operator_id], lazy="raise")
    reviewer: Mapped[Employee | None] = relationship(foreign_keys=[reviewer_id], lazy="raise")
    record: Mapped[WasteRecord | None] = relationship(lazy="raise")
