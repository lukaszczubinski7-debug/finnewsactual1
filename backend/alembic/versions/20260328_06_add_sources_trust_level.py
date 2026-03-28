"""add sources_trust_level to user_preferences

Revision ID: 20260328_06
Revises: 20260328_05
Create Date: 2026-03-28
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260328_06"
down_revision = "20260328_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("sources_trust_level", sa.Float(), nullable=True, server_default="0.5"),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "sources_trust_level")
