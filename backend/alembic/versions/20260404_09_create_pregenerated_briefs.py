"""create pregenerated_briefs table

Revision ID: 20260404_09
Revises: 20260404_08
Create Date: 2026-04-04
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260404_09"
down_revision = "20260404_08"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pregenerated_briefs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("context", sa.String(100), nullable=False, unique=True, index=True),
        sa.Column("response_payload", sa.JSON(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("status", sa.String(32), nullable=False, server_default="ready"),
    )


def downgrade() -> None:
    op.drop_table("pregenerated_briefs")
