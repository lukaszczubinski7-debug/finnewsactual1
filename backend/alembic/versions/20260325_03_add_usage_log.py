"""add usage_log table

Revision ID: 20260325_03
Revises: 20260315_02
Create Date: 2026-03-25
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260325_03"
down_revision = "20260315_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "usage_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endpoint", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_usage_log_user_endpoint_date", "usage_log", ["user_id", "endpoint", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_usage_log_user_endpoint_date", table_name="usage_log")
    op.drop_table("usage_log")
