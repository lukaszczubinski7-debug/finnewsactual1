"""add market_tickers to user_preferences

Revision ID: 20260327_04
Revises: 20260325_03
Create Date: 2026-03-27
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260327_04"
down_revision = "20260325_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("market_tickers", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "market_tickers")
