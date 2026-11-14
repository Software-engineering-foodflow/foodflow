"""Separate pending waste requests from effective records. No historical writes."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "waste_request",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("request_key", sa.Uuid(), nullable=False),
        sa.Column("batch_id", sa.BigInteger(), sa.ForeignKey("inventory_batch.id"), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False),
        sa.Column(
            "reason",
            sa.Enum(
                "EXPIRED",
                "SPOILED",
                "DAMAGED",
                "OTHER",
                name="reason",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("note", sa.Text()),
        sa.Column("operator_id", sa.BigInteger(), sa.ForeignKey("employee.id"), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("reviewer_id", sa.BigInteger(), sa.ForeignKey("employee.id")),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("rejection_reason", sa.Text()),
        sa.Column("record_id", sa.BigInteger(), sa.ForeignKey("waste_record.id")),
        sa.UniqueConstraint("request_key"),
        sa.UniqueConstraint("record_id"),
        sa.CheckConstraint("quantity > 0", name="quantity_positive"),
        sa.CheckConstraint("status IN ('PENDING', 'APPROVED', 'REJECTED')", name="valid_status"),
        sa.CheckConstraint(
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
    for column in ("batch_id", "occurred_at", "status"):
        op.create_index(f"ix_waste_request_{column}", "waste_request", [column])


def downgrade():
    # Requests are audit records: rollback deploys by disabling the feature, not deleting data.
    raise RuntimeError("保留報廢申請稽核資料；請停用功能，不執行刪表 downgrade")
