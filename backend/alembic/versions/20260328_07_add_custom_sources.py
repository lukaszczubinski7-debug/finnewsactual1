"""add custom_sources to user_preferences

Revision ID: 20260328_07
Revises: 20260328_06
Create Date: 2026-03-28
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260328_07"
down_revision = "20260328_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("custom_sources", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "custom_sources")
