"""create earnings_events table

Revision ID: 20260404_08
Revises: 20260328_07
Create Date: 2026-04-04
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260404_08"
down_revision = "20260328_07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "earnings_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("ticker", sa.String(32), nullable=False, index=True),
        sa.Column("company_name", sa.String(200), nullable=False),
        sa.Column("market", sa.String(8), nullable=False),
        sa.Column("report_date", sa.Date(), nullable=False, index=True),
        sa.Column("report_type", sa.String(32), nullable=True),
        sa.Column("fiscal_period", sa.String(32), nullable=True),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("ticker", "report_date", name="uq_ticker_report_date"),
    )
    op.create_index("ix_market_report_date", "earnings_events", ["market", "report_date"])


def downgrade() -> None:
    op.drop_index("ix_market_report_date", table_name="earnings_events")
    op.drop_table("earnings_events")
